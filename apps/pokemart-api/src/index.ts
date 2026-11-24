import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import { registry, observeRequest } from './metrics.js';
import { installLogShipper } from './log-shipper.js';
import mysql from 'mysql2/promise';

type Row = Record<string, any>;

class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown[] = []) {
    super(message);
  }
}

const port = Number(process.env.PORT ?? 4000);
const serviceName = 'pokemart-api';
installLogShipper(serviceName);
const jwtSecret = process.env.AUTH_JWT_SECRET ?? '';
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
  throw new Error('AUTH_JWT_SECRET must be configured with at least 32 bytes');
}
const jwtIssuer = 'pokemart-api';
const jwtAudience = 'pokemart-bff';
const accessTokenLifetimeSeconds = 60 * 60;
const paymentBaseUrl = (process.env.PAYMENT_BASE_URL ?? 'http://localhost:4004').replace(/\/$/, '');
const kycBaseUrl = (process.env.KYC_BASE_URL ?? 'http://localhost:4005').replace(/\/$/, '');
const kycApiKey = process.env.KYC_API_KEY ?? 'local-only-kyc-key';
const kycTimeoutMs = Number(process.env.KYC_REQUEST_TIMEOUT_MS ?? 2000);
const demoPasswordHash = 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA';
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? 'pokemart_user',
  password: process.env.MYSQL_PASSWORD ?? 'change_me_for_local_development',
  database: process.env.MYSQL_DATABASE ?? 'pokemart_lab',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z'
});
const app = express();

function requestId(req: Request): string {
  const value = req.header('x-request-id');
  return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : crypto.randomUUID();
}
function errorBody(error: AppError, id: string) {
  return { error: { code: error.code, message: error.message, requestId: id, details: error.details } };
}
function log(fields: Record<string, unknown>) { console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: serviceName, environment: process.env.NODE_ENV ?? 'development', ...fields })); }
function positiveInt(value: unknown, field: string, maximum?: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message: maximum ? `must be an integer from 1 to ${maximum}` : 'must be a positive integer' }]);
  }
  return value;
}
function pageParams(req: Request, extraAllowed: string[] = []): { limit: number; offset: number } {
  const allowed = new Set(['limit', 'offset', ...extraAllowed]);
  const unknown = Object.keys(req.query).find((key) => !allowed.has(key));
  if (unknown) throw new AppError(400, 'UNKNOWN_QUERY_PARAMETER', 'Unknown query parameter', [{ field: unknown, message: 'is not supported' }]);
  const parse = (value: unknown, field: string, fallback: number, min: number, max?: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message: 'must be an integer' }]);
    const number = Number(value);
    if (number < min || (max !== undefined && number > max)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message: `must be between ${min} and ${max ?? 'infinity'}` }]);
    return number;
  };
  return { limit: parse(req.query.limit, 'limit', 20, 1, 100), offset: parse(req.query.offset, 'offset', 0, 0) };
}
function userId(res: Response): string {
  const value = res.locals.userId as unknown;
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'A valid bearer token is required');
  return value;
}
function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
function decodePasswordHash(value: string) {
  const parts = value.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1') return undefined;
  const salt = Buffer.from(parts[4], 'base64url');
  const digest = Buffer.from(parts[5], 'base64url');
  if (salt.length !== 16 || digest.length !== 64 || salt.toString('base64url') !== parts[4] || digest.toString('base64url') !== parts[5]) return undefined;
  return { salt, digest };
}
async function passwordMatches(password: string, encodedHash: string): Promise<boolean> {
  const parsed = decodePasswordHash(encodedHash);
  const fallback = decodePasswordHash(demoPasswordHash);
  if (!fallback) throw new Error('Configured demo password hash is invalid');
  const { salt, digest } = parsed ?? fallback;
  const derived = await derivePassword(password, salt);
  return Boolean(parsed && crypto.timingSafeEqual(derived, digest));
}
function createAccessToken(id: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: jwtIssuer,
    aud: jwtAudience,
    sub: id,
    iat: issuedAt,
    exp: issuedAt + accessTokenLifetimeSeconds,
  })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', jwtSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}
function parseJwtJson(value: string): unknown {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { return undefined; }
}
function verifyAccessToken(token: string): string | undefined {
  if (token.length > 4096) return undefined;
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) return undefined;
  const header = parseJwtJson(segments[0]) as Record<string, unknown> | undefined;
  const claims = parseJwtJson(segments[1]) as Record<string, unknown> | undefined;
  if (!header || header.alg !== 'HS256' || header.typ !== 'JWT' || !claims) return undefined;
  const unsigned = `${segments[0]}.${segments[1]}`;
  const expected = crypto.createHmac('sha256', jwtSecret).update(unsigned).digest();
  const received = Buffer.from(segments[2], 'base64url');
  if (received.length !== expected.length || received.toString('base64url') !== segments[2] || !crypto.timingSafeEqual(received, expected)) return undefined;
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== jwtIssuer || claims.aud !== jwtAudience
    || typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(claims.sub)
    || typeof claims.iat !== 'number' || !Number.isInteger(claims.iat)
    || typeof claims.exp !== 'number' || !Number.isInteger(claims.exp)
    || claims.iat > now + 60 || claims.exp <= now
    || claims.exp - claims.iat !== accessTokenLifetimeSeconds) return undefined;
  return claims.sub;
}
async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const match = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(req.header('authorization') ?? '');
    const id = match ? verifyAccessToken(match[1]) : undefined;
    if (!id) throw new AppError(401, 'UNAUTHORIZED', 'A valid bearer token is required');
    const [rows] = await pool.query('SELECT user_id AS userId, email, display_name AS displayName FROM users WHERE user_id=? AND is_active=TRUE', [id]);
    const user = (rows as Row[])[0];
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'A valid bearer token is required');
    res.locals.userId = id;
    res.locals.user = { userId: id, email: user.email, displayName: user.displayName };
    next();
  } catch (error) { next(error); }
}
function pokemonId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a positive integer' }]);
  return Number(value);
}
const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isDuplicateEntry(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}
function asPokemon(row: Row) { return { id: row.id, name: row.name, types: typeof row.types === 'string' ? JSON.parse(row.types) : row.types, spriteUrl: row.spriteUrl, price: row.price, stock: row.stock }; }
// One DTO for both kinds: `kind` says which of pokemonId/pokemonName or itemId/itemName is present.
function asPurchase(row: Row) {
  const common = { quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), totalPrice: Number(row.totalPrice), createdAt: new Date(row.createdAt).toISOString() };
  return row.kind === 'POKEMON'
    ? { id: row.id, kind: row.kind, pokemonId: Number(row.pokemonId), pokemonName: row.pokemonName, ...common }
    : { id: row.id, kind: row.kind, itemId: Number(row.itemId), itemName: row.itemName, ...common };
}
const PURCHASE_SELECT = `SELECT p.id, p.kind, p.pokemon_source_id AS pokemonId, pr.name AS pokemonName, p.item_source_id AS itemId, ir.name AS itemName,
  p.quantity, p.unit_price AS unitPrice, p.total_price AS totalPrice, p.created_at AS createdAt
  FROM purchases p
  LEFT JOIN pokemon_reference pr ON pr.source_id = p.pokemon_source_id
  LEFT JOIN item_reference ir ON ir.source_id = p.item_source_id`;
// level: 0 = not verified, 1 = basic, 2 = full
type Kyc = { level: number; status: string; updatedAt: string };
// KYC is an internal HTTP service with its own data. Never call it inside a database transaction.
async function fetchKyc(userId: string): Promise<Kyc> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), kycTimeoutMs);
  try {
    const response = await fetch(`${kycBaseUrl}/kyc/v1/users/${encodeURIComponent(userId)}`, { signal: controller.signal, headers: { Authorization: `Bearer ${kycApiKey}` } });
    if (response.status === 404) return { level: 0, status: 'ACTIVE', updatedAt: new Date().toISOString() };
    if (!response.ok) throw new Error(`kyc status ${response.status}`);
    const body = await response.json() as Row;
    if (![0, 1, 2].includes(body.level as number) || typeof body.status !== 'string') throw new Error('kyc invalid body');
    return { level: body.level as number, status: body.status, updatedAt: String(body.updatedAt ?? new Date().toISOString()) };
  } catch (error) {
    log({ severity: 'warn', message: 'KYC service call failed', reason: (error as Error).message });
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'KYC service is temporarily unavailable');
  } finally { clearTimeout(timer); }
}
// Pre-fetches the caller's KYC level only when the listing needs one, so NONE-level products keep working while
// KYC is down (fail closed only above NONE). The failure is deferred so earlier checks (duplicate, 404, not-for-sale)
// keep their documented order; call the returned function at the KYC step inside the transaction.
async function prefetchKyc(listingSql: string, listingId: number, userId: string): Promise<() => Kyc | null> {
  const [rows] = await pool.query(listingSql, [listingId]);
  const required = Number((rows as Row[])[0]?.required ?? 0);
  // Every purchase looks the account up, because an account under review cannot buy anything. Level-0 listings
  // still fail open when KYC is down (nothing to enforce); listings above 0 fail closed. Errors are deferred so
  // earlier checks (duplicate, 404, not-for-sale) keep their documented order.
  try { const kyc = await fetchKyc(userId); return () => kyc; } catch (error) { return required === 0 ? () => null : () => { throw error; }; }
}
function assertKyc(kyc: Kyc | null, required: number, label: string) {
  if (kyc?.status === 'PENDING_REVIEW') throw new AppError(403, 'KYC_PENDING_REVIEW', 'Your identity verification is under review. Purchases are unavailable until it is approved.');
  if (required === 0) return;
  if (!kyc || kyc.status !== 'ACTIVE' || kyc.level < required) throw new AppError(403, 'KYC_LEVEL_REQUIRED', `This ${label} requires a higher verification level`, [{ required, current: kyc?.level ?? 0 }]);
}
async function submitKyc(userId: string, body: unknown): Promise<Kyc> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), kycTimeoutMs);
  try {
    const response = await fetch(`${kycBaseUrl}/kyc/v1/users/${encodeURIComponent(userId)}/submissions`, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${kycApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as Row;
    if (response.status === 400 && payload.error?.code === 'validation_error') throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', Array.isArray(payload.error.details) ? payload.error.details : []);
    if (response.status === 409 && payload.error?.code === 'already_pending') throw new AppError(409, 'KYC_ALREADY_PENDING', 'A verification request is already under review');
    if (response.status === 409 && payload.error?.code === 'already_verified') throw new AppError(409, 'KYC_ALREADY_VERIFIED', 'This account is already verified');
    if (response.status !== 202 || ![0, 1, 2].includes(payload.level) || typeof payload.status !== 'string') throw new Error(`kyc submission ${response.status}`);
    return { level: payload.level as number, status: payload.status, updatedAt: String(payload.updatedAt ?? new Date().toISOString()) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    log({ severity: 'warn', message: 'KYC submission failed', reason: (error as Error).message });
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'KYC service is temporarily unavailable');
  } finally { clearTimeout(timer); }
}
function asTopUp(row: Row) { return { topUpId: row.top_up_id, amount: Number(row.amount_baht), status: row.status, providerPaymentId: row.provider_payment_id ?? null, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() }; }

app.use((req, res, next) => {
  const id = requestId(req); res.locals.requestId = id; res.setHeader('X-Request-Id', id);
  const start = Date.now();
  res.on('finish', () => {
    observeRequest(req.method, req.route?.path, res.statusCode, (Date.now() - start) / 1000);
    if (req.route?.path !== '/metrics') log({ severity: 'info', requestId: id, method: req.method, route: req.route?.path ?? req.path, statusCode: res.statusCode, durationMs: Date.now() - start });
  });
  next();
});
app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin === 'http://localhost:8081' || origin === 'http://127.0.0.1:8081') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, Location');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use((req, _res, next) => {
  if (req.method === 'POST' && ['/pokemart/v1/auth/login', '/pokemart/v1/purchases', '/pokemart/v1/wallet/top-ups', '/pokemart/v1/kyc/submissions'].includes(req.path) && !req.is('application/json')) return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
  next();
});
app.use(express.json({ strict: false }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
// Operational endpoint for Prometheus; intentionally not part of the OpenAPI contract.
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    const [rows] = await pool.query('SELECT COUNT(*) AS count FROM listings WHERE pokemon_source_id IS NOT NULL');
    const [userRows] = await pool.query('SELECT COUNT(*) AS count FROM users');
    if (Number((rows as Row[])[0].count) === 0 || Number((userRows as Row[])[0].count) === 0) {
      return res.status(503).json({ status: 'not_ready', checks: { mysql: 'uninitialized' } });
    }
    return res.json({ status: 'ready', checks: { mysql: 'ok' } });
  } catch { return res.status(503).json({ status: 'not_ready', checks: { mysql: 'unavailable' } }); }
});

app.post('/pokemart/v1/auth/login', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).some((field) => field !== 'email' && field !== 'password')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'must contain only email and password' }]);
    }
    const { email, password } = req.body as Record<string, unknown>;
    if (typeof email !== 'string' || Buffer.byteLength(email) > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      || typeof password !== 'string' || Buffer.byteLength(password) < 1 || Buffer.byteLength(password) > 128) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'credentials', message: 'email and password must be valid' }]);
    }
    const normalizedEmail = email.trim().toLowerCase();
    const [rows] = await pool.query('SELECT user_id AS userId, email, display_name AS displayName, password_hash AS passwordHash, is_active AS isActive FROM users WHERE email=? LIMIT 1', [normalizedEmail]);
    const user = (rows as Row[])[0];
    const matches = await passwordMatches(password, typeof user?.passwordHash === 'string' ? user.passwordHash : demoPasswordHash);
    if (!user || !matches || !user.isActive) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    res.json({
      accessToken: createAccessToken(user.userId),
      tokenType: 'Bearer',
      expiresIn: accessTokenLifetimeSeconds,
      user: { userId: user.userId, email: user.email, displayName: user.displayName },
    });
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/auth/me', authenticate, (req, res) => {
  res.json({ user: res.locals.user });
});
app.get('/pokemart/v1/account-info', authenticate, async (_req, res, next) => {
  try {
    const id = userId(res);
    const [walletRows] = await pool.query('SELECT user_id AS userId, balance FROM user_wallet WHERE user_id=?', [id]);
    const wallet = (walletRows as Row[])[0];
    if (!wallet) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    // Bootstrap must survive a KYC outage: report kyc as null instead of failing sign-in.
    const kyc = await fetchKyc(id).catch(() => null);
    res.json({ user: res.locals.user, wallet: { userId: wallet.userId, balance: Number(wallet.balance) }, kyc });
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/catalog/pokemon', async (req, res, next) => {
  try {
    const { limit, offset } = pageParams(req, ['q', 'type', 'inStock']);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const type = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
    const inStock = req.query.inStock === 'true';
    if (q.length > 80 || type.length > 32 || (req.query.inStock !== undefined && req.query.inStock !== 'true' && req.query.inStock !== 'false')) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'catalog filters', message: 'are invalid' }]);
    const conditions = ['l.active=TRUE']; const values: unknown[] = [];
    if (q) { conditions.push('(LOWER(r.name) LIKE ? OR CAST(r.source_id AS CHAR) LIKE ?)'); values.push(`%${q}%`, `%${q}%`); }
    if (type) { conditions.push('JSON_CONTAINS(r.types, JSON_QUOTE(?))'); values.push(type); }
    if (inStock) conditions.push('l.stock > 0');
    const where = conditions.join(' AND ');
    const [countRows] = await pool.query(`SELECT COUNT(*) AS count FROM listings l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE ${where}`, values);
    const [rows] = await pool.query(`SELECT r.source_id AS id, r.name, r.types, r.sprite_url AS spriteUrl, l.price, l.stock FROM listings l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE ${where} ORDER BY r.source_id ASC LIMIT ? OFFSET ?`, [...values, limit, offset]);
    res.json({ count: Number((countRows as Row[])[0].count), limit, offset, results: (rows as Row[]).map(asPokemon) });
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/catalog/pokemon/:id', async (req, res, next) => {
  try {
    const id = pokemonId(req.params.id);
    const [rows] = await pool.query(`SELECT r.source_id AS id, r.name, r.types, r.sprite_url AS spriteUrl, l.price, l.stock FROM listings l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE l.active=TRUE AND r.source_id=?`, [id]);
    if (!(rows as Row[]).length) throw new AppError(404, 'POKEMON_NOT_FOUND', 'Pokémon not found');
    res.json(asPokemon((rows as Row[])[0]));
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/catalog/items', async (req, res, next) => {
  try {
    const { limit, offset } = pageParams(req, ['q', 'category', 'inStock']);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : '';
    const inStock = req.query.inStock === 'true';
    if (q.length > 80 || category.length > 128 || (req.query.inStock !== undefined && req.query.inStock !== 'true' && req.query.inStock !== 'false')) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'catalog filters', message: 'are invalid' }]);
    const conditions = ['l.active=TRUE']; const values: unknown[] = [];
    if (q) { conditions.push('(LOWER(r.name) LIKE ? OR CAST(r.source_id AS CHAR) LIKE ?)'); values.push(`%${q}%`, `%${q}%`); }
    if (category) { conditions.push('r.category=?'); values.push(category); }
    if (inStock) conditions.push('l.stock > 0');
    const where = conditions.join(' AND ');
    const [countRows] = await pool.query(`SELECT COUNT(*) AS count FROM listings l JOIN item_reference r ON r.source_id=l.item_source_id WHERE ${where}`, values);
    const [rows] = await pool.query(`SELECT r.source_id AS id, r.name, r.category, r.sprite_url AS spriteUrl, l.price, l.stock, l.required_kyc_level AS requiredKycLevel FROM listings l JOIN item_reference r ON r.source_id=l.item_source_id WHERE ${where} ORDER BY r.source_id LIMIT ? OFFSET ?`, [...values, limit, offset]);
    res.json({ count: Number((countRows as Row[])[0].count), limit, offset, results: rows });
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/catalog/item-categories', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT r.category FROM listings l JOIN item_reference r ON r.source_id=l.item_source_id WHERE l.active=TRUE AND r.category IS NOT NULL ORDER BY r.category');
    res.json({ categories: (rows as Row[]).map((row) => row.category) });
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/wallet', authenticate, async (req, res, next) => {
  try { const id = userId(res); const [rows] = await pool.query('SELECT user_id AS userId, balance FROM user_wallet WHERE user_id=?', [id]); if (!(rows as Row[]).length) throw new AppError(404, 'USER_NOT_FOUND', 'User not found'); res.json((rows as Row[])[0]); } catch (error) { next(error); }
});
app.get('/pokemart/v1/kyc/status', authenticate, async (_req, res, next) => {
  try {
    res.json(await fetchKyc(userId(res)));
  } catch (error) { next(error); }
});
app.post('/pokemart/v1/kyc/submissions', authenticate, async (req, res, next) => {
  try { res.status(202).json(await submitKyc(userId(res), req.body)); } catch (error) { next(error); }
});
app.get('/pokemart/v1/inventory', authenticate, async (req, res, next) => {
  try { const id = userId(res); const [rows] = await pool.query(`SELECT i.pokemon_source_id AS pokemonId, r.name, i.quantity FROM user_inventory i JOIN pokemon_reference r ON r.source_id=i.pokemon_source_id WHERE i.user_id=? ORDER BY i.pokemon_source_id`, [id]); const results = (rows as Row[]).map((row) => ({ ...row, quantity: Number(row.quantity) })); res.json({ count: results.length, results }); } catch (error) { next(error); }
});
app.get('/pokemart/v1/purchases', authenticate, async (req, res, next) => {
  try {
    const id = userId(res); const { limit, offset } = pageParams(req, ['kind']);
    const kind = req.query.kind;
    if (kind !== undefined && kind !== 'POKEMON' && kind !== 'ITEM') throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'kind', message: 'must be POKEMON or ITEM' }]);
    const filter = kind === undefined ? '' : ' AND p.kind=?'; const filterValues = kind === undefined ? [] : [kind];
    const [countRows] = await pool.query(`SELECT COUNT(*) AS count FROM purchases p WHERE p.user_id=?${filter}`, [id, ...filterValues]);
    const [rows] = await pool.query(`${PURCHASE_SELECT} WHERE p.user_id=?${filter} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`, [id, ...filterValues, limit, offset]);
    res.json({ count: Number((countRows as Row[])[0].count), limit, offset, results: (rows as Row[]).map(asPurchase) });
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/purchases/:id', authenticate, async (req, res, next) => {
  try {
    const id = userId(res); const purchaseId = req.params.id;
    if (typeof purchaseId !== 'string' || !validUuid.test(purchaseId)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a UUID' }]);
    const [rows] = await pool.query(`${PURCHASE_SELECT} WHERE p.user_id=? AND p.id=?`, [id, purchaseId]);
    if (!(rows as Row[]).length) throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found'); res.json(asPurchase((rows as Row[])[0]));
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/purchases/:id/shipment', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = userId(res);
    const purchaseId = req.params.id;
    if (typeof purchaseId !== 'string' || !validUuid.test(purchaseId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a UUID' }]);
    }
    const [purchaseRows] = await pool.query('SELECT id FROM purchases WHERE user_id=? AND id=?', [id, purchaseId]);
    if (!(purchaseRows as Row[]).length) {
      throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found');
    }
    const [shipmentRows] = await pool.query('SELECT * FROM shipments WHERE purchase_id=?', [purchaseId]);
    if (!(shipmentRows as Row[]).length) {
      // Legacy or missing shipment row fallback
      return res.json({
        purchaseId,
        orderStatus: 'ORDER_PLACED',
        processingStatus: 'PENDING',
        deliveryStatus: 'WAITING_FOR_SHIPMENT',
        trackingNumber: null,
        attemptCount: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    const s = (shipmentRows as Row[])[0];
    res.json({
      purchaseId: s.purchase_id,
      orderStatus: 'ORDER_PLACED',
      processingStatus: s.processing_status,
      deliveryStatus: s.delivery_status,
      trackingNumber: s.tracking_number ?? null,
      attemptCount: Number(s.attempt_count),
      lastError: s.last_error_message ?? null,
      createdAt: new Date(s.created_at).toISOString(),
      updatedAt: new Date(s.updated_at).toISOString(),
    });
  } catch (error) { next(error); }
});

// Pokémon and items are bought through the same flow. These fixed names are the only parts that differ
// (never user input, so interpolating them into SQL is safe).
const PRODUCTS = {
  pokemon: { column: 'pokemon_source_id', reference: 'pokemon_reference', notFound: ['POKEMON_NOT_FOUND', 'Pokémon not found'], notForSale: ['POKEMON_NOT_FOR_SALE', 'Pokémon is not for sale'], kycLabel: 'Pokémon' },
  item: { column: 'item_source_id', reference: 'item_reference', notFound: ['ITEM_NOT_FOUND', 'Item not found'], notForSale: ['ITEM_NOT_FOR_SALE', 'Item is not for sale'], kycLabel: 'item' },
} as const;

type PurchaseLine = { purchaseId: string; kind: 'pokemon' | 'item'; productId: number; quantity: number };
// Validates one purchase body. A checkout calls it per line and prefixes the reported field path.
function parsePurchaseLine(body: unknown, withId = true): PurchaseLine {
  const invalid = (field: string, message: string) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message }]);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body', 'must be an object');
  const candidate = body as Row;
  if (Object.keys(candidate).some((field) => (field !== 'purchaseId' || !withId) && field !== 'pokemonId' && field !== 'itemId' && field !== 'quantity')) throw invalid('body', 'contains unknown fields');
  if (withId && (typeof candidate.purchaseId !== 'string' || !validUuid.test(candidate.purchaseId))) throw invalid('purchaseId', 'must be a UUID');
  if (candidate.pokemonId !== undefined && candidate.itemId !== undefined) throw invalid('body', 'provide either pokemonId or itemId, not both');
  const kind = candidate.itemId !== undefined ? 'item' : 'pokemon';
  const productId = kind === 'item' ? positiveInt(candidate.itemId, 'itemId') : positiveInt(candidate.pokemonId, 'pokemonId');
  const quantity = positiveInt(candidate.quantity, 'quantity', 99);
  return { purchaseId: withId ? (candidate.purchaseId as string) : '', kind, productId, quantity };
}

async function createPurchase(userId: string, body: unknown): Promise<Row> {
  const { purchaseId, kind, productId, quantity } = parsePurchaseLine(body);
  const product = PRODUCTS[kind];
  const kycGate = await prefetchKyc(`SELECT required_kyc_level AS required FROM listings WHERE ${product.column}=?`, productId, userId); // before a pool connection is taken
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [listings] = await connection.query(`SELECT l.price, l.stock, l.active, l.required_kyc_level, r.name FROM listings l JOIN ${product.reference} r ON r.source_id=l.${product.column} WHERE l.${product.column}=? FOR UPDATE`, [productId]);
    const listing = (listings as Row[])[0];
    const [existingPurchases] = await connection.query('SELECT id FROM purchases WHERE id=?', [purchaseId]);
    if ((existingPurchases as Row[]).length) throw new AppError(409, 'PURCHASE_DUPLICATE', 'Purchase ID has already been processed');
    const [references] = await connection.query(`SELECT source_id FROM ${product.reference} WHERE source_id=?`, [productId]);
    if (!(references as Row[]).length) throw new AppError(404, product.notFound[0], product.notFound[1]);
    if (!listing || !listing.active) throw new AppError(409, product.notForSale[0], product.notForSale[1]);
    assertKyc(kycGate(), Number(listing.required_kyc_level ?? 0), product.kycLabel);
    if (Number(listing.stock) < quantity) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock');
    const [wallets] = await connection.query('SELECT balance FROM user_wallet WHERE user_id=? FOR UPDATE', [userId]);
    const wallet = (wallets as Row[])[0]; const total = Number(listing.price) * quantity;
    if (!wallet || Number(wallet.balance) < total) throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient funds');
    const createdAt = new Date();
    await connection.query(`INSERT INTO purchases (id,user_id,${product.column},quantity,unit_price,total_price,created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [purchaseId, userId, productId, quantity, listing.price, total, createdAt]);
    await connection.query('INSERT INTO shipments (purchase_id, processing_status, delivery_status, attempt_count, next_attempt_at, created_at, updated_at) VALUES (?, "PENDING", "WAITING_FOR_SHIPMENT", 0, ?, ?, ?)', [purchaseId, createdAt, createdAt, createdAt]);
    await connection.query(`UPDATE listings SET stock=stock-? WHERE ${product.column}=?`, [quantity, productId]);
    await connection.query('UPDATE user_wallet SET balance=balance-? WHERE user_id=?', [total, userId]);
    await connection.query(`INSERT INTO user_inventory (user_id,${product.column},quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)`, [userId, productId, quantity]);
    const response = asPurchase({ id: purchaseId, kind: kind === 'item' ? 'ITEM' : 'POKEMON', pokemonId: productId, pokemonName: listing.name, itemId: productId, itemName: listing.name, quantity, unitPrice: listing.price, totalPrice: total, createdAt });
    await connection.commit(); return response;
  } catch (error) {
    await connection.rollback();
    if (isDuplicateEntry(error)) throw new AppError(409, 'PURCHASE_DUPLICATE', 'Purchase ID has already been processed');
    throw error;
  } finally { connection.release(); }
}
app.post('/pokemart/v1/purchases', authenticate, async (req, res, next) => {
  try {
    const result = await createPurchase(userId(res), req.body);
    res.setHeader('Location', `/pokemart/v1/purchases/${result.id}`); res.status(201).json(result);
  } catch (error) { next(error); }
});
// A checkout buys a whole bag as one unit: every line is validated and written in ONE transaction, so it either
// all commits or nothing changes (stock, wallet, inventory, purchases, shipments). The client-generated checkoutId is
// the idempotency key AND the order id (Stripe-style):
//   - same id + same bag  -> the stored 201 body is replayed (header Idempotent-Replayed: true), nothing is written again;
//   - same id + another bag, or another user's id -> 409 CHECKOUT_ID_CONFLICT;
//   - two identical requests at once -> the second waits on the checkouts primary key, then replays the first's answer.
// The checkouts row is written inside the transaction, so a rejected checkout leaves no row and its id stays usable.
// Purchase ids of the lines are generated here; each line still has its own purchase and shipment row, tagged with checkout_id.
const MAX_CHECKOUT_LINES = 20;
type CheckoutResult = { replayed: boolean; body: Row };

function parseCheckout(body: unknown): { checkoutId: string; lines: PurchaseLine[] } {
  const invalid = (field: string, message: string) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message }]);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body', 'must be an object');
  const candidate = body as Row;
  if (Object.keys(candidate).some((field) => field !== 'checkoutId' && field !== 'lines')) throw invalid('body', 'contains unknown fields');
  if (typeof candidate.checkoutId !== 'string' || !validUuid.test(candidate.checkoutId)) throw invalid('checkoutId', 'must be a UUID');
  if (!Array.isArray(candidate.lines) || candidate.lines.length < 1 || candidate.lines.length > MAX_CHECKOUT_LINES) throw invalid('lines', `must be an array of 1 to ${MAX_CHECKOUT_LINES} lines`);
  const lines = candidate.lines.map((raw: unknown, index: number): PurchaseLine => {
    try { return parsePurchaseLine(raw, false); } catch (error) {
      if (error instanceof AppError && error.status === 400) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', (error.details as Row[]).map((d) => ({ ...d, field: `lines[${index}]${d.field === 'body' ? '' : `.${d.field}`}` })));
      throw error;
    }
  });
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const key = `${line.kind}:${line.productId}`;
    if (seen.has(key)) throw invalid(`lines[${index}]`, 'repeats a product from an earlier line; merge the quantities');
    seen.add(key);
  });
  return { checkoutId: candidate.checkoutId.toLowerCase(), lines };
}
// The same bag always hashes the same, whatever the order of its lines.
function checkoutHash(lines: PurchaseLine[]): string {
  const normalized = lines.map((line) => `${line.kind}:${line.productId}:${line.quantity}`).sort().join(',');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
const checkoutConflict = () => new AppError(409, 'CHECKOUT_ID_CONFLICT', 'Checkout ID was already used for a different order');
async function findStoredCheckout(checkoutId: string, userId: string, hash: string): Promise<CheckoutResult | null> {
  const [rows] = await pool.query('SELECT user_id, request_hash, response_json FROM checkouts WHERE id=?', [checkoutId]);
  const row = (rows as Row[])[0];
  if (!row) return null;
  if (row.user_id !== userId || row.request_hash !== hash) throw checkoutConflict();
  return { replayed: true, body: typeof row.response_json === 'string' ? JSON.parse(row.response_json) : row.response_json };
}

async function createCheckout(userId: string, body: unknown): Promise<CheckoutResult> {
  const { checkoutId, lines } = parseCheckout(body);
  const hash = checkoutHash(lines);
  const stored = await findStoredCheckout(checkoutId, userId, hash);
  if (stored) return stored;
  // KYC is an HTTP call: do it before a pool connection is taken. Fail closed only when some line needs a level.
  let highestRequired = 0;
  for (const kind of ['pokemon', 'item'] as const) {
    const ids = lines.filter((line) => line.kind === kind).map((line) => line.productId);
    if (!ids.length) continue;
    const [rows] = await pool.query(`SELECT COALESCE(MAX(required_kyc_level), 0) AS required FROM listings WHERE ${PRODUCTS[kind].column} IN (?)`, [ids]);
    highestRequired = Math.max(highestRequired, Number((rows as Row[])[0]?.required ?? 0));
  }
  let kycGate: () => Kyc | null;
  try { const kyc = await fetchKyc(userId); kycGate = () => kyc; } catch (error) { kycGate = highestRequired === 0 ? () => null : () => { throw error; }; }

  const connection = await pool.getConnection();
  let claimed = false;
  try {
    await connection.beginTransaction();
    // Claim the id first. A second identical request blocks here until the first commits or rolls back.
    await connection.query('INSERT INTO checkouts (id, user_id, request_hash) VALUES (?, ?, ?)', [checkoutId, userId, hash]);
    claimed = true;
    // Lock listings in one global order (pokemon before item, then by id) so two bags can never deadlock.
    // Single purchases lock listing then wallet, and so does this, so the order is consistent everywhere.
    const listings = new Map<string, Row | undefined>();
    const lockOrder = [...lines].sort((a, b) => (a.kind === b.kind ? a.productId - b.productId : a.kind === 'pokemon' ? -1 : 1));
    for (const line of lockOrder) {
      const product = PRODUCTS[line.kind];
      const [rows] = await connection.query(`SELECT l.price, l.stock, l.active, l.required_kyc_level, r.name FROM listings l JOIN ${product.reference} r ON r.source_id=l.${product.column} WHERE l.${product.column}=? FOR UPDATE`, [line.productId]);
      listings.set(`${line.kind}:${line.productId}`, (rows as Row[])[0]);
    }
    const at = (line: PurchaseLine) => listings.get(`${line.kind}:${line.productId}`);
    const where = (index: number, line: PurchaseLine) => [{ field: `lines[${index}]`, message: `${line.kind}Id ${line.productId}` }];
    // Checks run one phase at a time over the WHOLE bag, so the documented priority (not found, not for sale, KYC, stock,
    // funds) holds for a bag as it does for one purchase, and the result never depends on the order of the lines.
    // Within a phase the first failing line in request order decides the error.
    for (const [index, line] of lines.entries()) {
      if (at(line)) continue;
      const product = PRODUCTS[line.kind];
      const [references] = await connection.query(`SELECT source_id FROM ${product.reference} WHERE source_id=?`, [line.productId]);
      if (!(references as Row[]).length) throw new AppError(404, product.notFound[0], product.notFound[1], where(index, line));
    }
    for (const [index, line] of lines.entries()) {
      if (!at(line)?.active) { const product = PRODUCTS[line.kind]; throw new AppError(409, product.notForSale[0], product.notForSale[1], where(index, line)); }
    }
    const kyc = kycGate();
    for (const line of lines) assertKyc(kyc, Number((at(line) as Row).required_kyc_level ?? 0), PRODUCTS[line.kind].kycLabel);
    for (const [index, line] of lines.entries()) {
      if (Number((at(line) as Row).stock) < line.quantity) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock', where(index, line));
    }
    const total = lines.reduce((sum, line) => sum + Number((at(line) as Row).price) * line.quantity, 0);
    const [wallets] = await connection.query('SELECT balance FROM user_wallet WHERE user_id=? FOR UPDATE', [userId]);
    const wallet = (wallets as Row[])[0];
    if (!wallet || Number(wallet.balance) < total) throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient funds');

    const createdAt = new Date(); const purchases: Row[] = [];
    for (const line of lines) {
      const product = PRODUCTS[line.kind]; const listing = at(line) as Row;
      const purchaseId = crypto.randomUUID(); const lineTotal = Number(listing.price) * line.quantity;
      await connection.query(`INSERT INTO purchases (id,user_id,${product.column},quantity,unit_price,total_price,checkout_id,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [purchaseId, userId, line.productId, line.quantity, listing.price, lineTotal, checkoutId, createdAt]);
      await connection.query('INSERT INTO shipments (purchase_id, processing_status, delivery_status, attempt_count, next_attempt_at, created_at, updated_at) VALUES (?, "PENDING", "WAITING_FOR_SHIPMENT", 0, ?, ?, ?)', [purchaseId, createdAt, createdAt, createdAt]);
      await connection.query(`UPDATE listings SET stock=stock-? WHERE ${product.column}=?`, [line.quantity, line.productId]);
      await connection.query(`INSERT INTO user_inventory (user_id,${product.column},quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)`, [userId, line.productId, line.quantity]);
      purchases.push(asPurchase({ id: purchaseId, kind: line.kind === 'item' ? 'ITEM' : 'POKEMON', pokemonId: line.productId, pokemonName: listing.name, itemId: line.productId, itemName: listing.name, quantity: line.quantity, unitPrice: listing.price, totalPrice: lineTotal, createdAt }));
    }
    await connection.query('UPDATE user_wallet SET balance=balance-? WHERE user_id=?', [total, userId]);
    const response = { checkoutId, purchases };
    await connection.query('UPDATE checkouts SET response_json=? WHERE id=?', [JSON.stringify(response), checkoutId]);
    await connection.commit();
    return { replayed: false, body: response };
  } catch (error) {
    await connection.rollback();
    // Lost the race for the id: the other request has committed by now, so answer what it answered (or refuse a different bag).
    if (!claimed && isDuplicateEntry(error)) {
      const winner = await findStoredCheckout(checkoutId, userId, hash);
      if (winner) return winner;
    }
    throw error;
  } finally { connection.release(); }
}
app.post('/pokemart/v1/checkouts', authenticate, async (req, res, next) => {
  try {
    const result = await createCheckout(userId(res), req.body);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    res.status(201).json(result.body);
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/items/inventory', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT i.item_source_id AS itemId, r.name, i.quantity FROM user_inventory i JOIN item_reference r ON r.source_id=i.item_source_id WHERE i.user_id=? ORDER BY i.item_source_id', [userId(res)]);
    const results = (rows as Row[]).map((row) => ({ ...row, quantity: Number(row.quantity) }));
    res.json({ count: results.length, results });
  } catch (error) { next(error); }
});

async function callPayment(topUpId: string, amount: number) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${paymentBaseUrl}/v1/payment_intents`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': topUpId }, body: JSON.stringify({ amount: amount * 100, currency: 'thb', confirm: true, metadata: { topUpId } }) });
    const text = await response.text(); let data: Row = {};
    try { data = text ? JSON.parse(text) : {}; } catch { throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'Payment provider returned an invalid response'); }
    return { status: response.status, data };
  } finally { clearTimeout(timer); }
}
async function finalizeTopUp(topUpId: string, status: 'COMPLETED' | 'FAILED' | 'UNKNOWN', providerPaymentId?: string, errorCode?: string) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM top_ups WHERE top_up_id=? FOR UPDATE', [topUpId]);
    const topUp = (rows as Row[])[0]; if (!topUp) throw new AppError(404, 'TOP_UP_NOT_FOUND', 'Top-up not found');
    if (topUp.status === 'COMPLETED' || topUp.status === 'FAILED') { await connection.commit(); return topUp; }
    await connection.query('UPDATE top_ups SET status=?, provider_payment_id=COALESCE(?, provider_payment_id), last_error_code=?, updated_at=NOW(3) WHERE top_up_id=?', [status, providerPaymentId ?? null, errorCode ?? null, topUpId]);
    if (status === 'COMPLETED') await connection.query('UPDATE user_wallet SET balance=balance+? WHERE user_id=?', [topUp.amount_baht, topUp.user_id]);
    await connection.commit();
    const [updated] = await pool.query('SELECT * FROM top_ups WHERE top_up_id=?', [topUpId]); return (updated as Row[])[0];
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
app.get('/pokemart/v1/wallet/top-ups/:id', authenticate, async (req, res, next) => {
  try {
    const topUpId = req.params.id;
    if (typeof topUpId !== 'string' || !validUuid.test(topUpId)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a UUID' }]);
    const [rows] = await pool.query('SELECT * FROM top_ups WHERE top_up_id=? AND user_id=?', [topUpId, userId(res)]);
    if (!(rows as Row[]).length) throw new AppError(404, 'TOP_UP_NOT_FOUND', 'Top-up not found'); res.json(asTopUp((rows as Row[])[0]));
  } catch (error) { next(error); }
});
app.post('/pokemart/v1/wallet/top-ups', authenticate, async (req, res, next) => {
  try {
    const body = req.body as Row;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((field) => field !== 'topUpId' && field !== 'amount') || typeof body.topUpId !== 'string' || !validUuid.test(body.topUpId) || !Number.isInteger(body.amount) || body.amount < 1 || body.amount > 10000) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'topUpId must be a UUID and amount must be an integer from 1 to 10000' }]);
    try { await pool.query('INSERT INTO top_ups (top_up_id,user_id,amount_baht,status) VALUES (?, ?, ?, "PENDING")', [body.topUpId, userId(res), body.amount]); } catch (error) { if (isDuplicateEntry(error)) throw new AppError(409, 'TOP_UP_DUPLICATE', 'Top-up ID has already been processed'); throw error; }
    let provider; try { provider = await callPayment(body.topUpId, body.amount); } catch { await finalizeTopUp(body.topUpId, 'UNKNOWN', undefined, 'provider_timeout'); throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'Payment provider is temporarily unavailable'); }
    if (provider.status === 200 && provider.data.status === 'succeeded') { const row = await finalizeTopUp(body.topUpId, 'COMPLETED', provider.data.id); res.setHeader('Location', `/pokemart/v1/wallet/top-ups/${body.topUpId}`); return res.status(201).json(asTopUp(row)); }
    if (provider.status === 402) { const row = await finalizeTopUp(body.topUpId, 'FAILED', undefined, String(provider.data?.error?.code ?? 'card_declined')); return res.status(402).json({ error: { code: 'PAYMENT_FAILED', message: 'Payment was declined', requestId: res.locals.requestId, details: [] }, topUp: asTopUp(row) }); }
    await finalizeTopUp(body.topUpId, 'UNKNOWN', provider.data?.id, 'provider_unavailable'); throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'Payment provider is temporarily unavailable');
  } catch (error) { next(error); }
});
app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
  const appError = error instanceof AppError ? error : error?.type === 'entity.parse.failed' ? new AppError(400, 'INVALID_JSON', 'Malformed JSON request body') : new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  if (!(error instanceof AppError) && error?.type !== 'entity.parse.failed') log({ severity: 'error', requestId: res.locals.requestId, message: error?.message });
  if (appError.code === 'UNAUTHORIZED') res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(appError.status).json(errorBody(appError, res.locals.requestId ?? requestId(req)));
});

app.listen(port, () => log({ severity: 'info', message: `Listening on ${port}` }));
