import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import { registry, observeRequest } from './metrics.js';
import mysql from 'mysql2/promise';

type Row = Record<string, any>;

class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown[] = []) {
    super(message);
  }
}

const port = Number(process.env.PORT ?? 4000);
const serviceName = 'pokemart-api';
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
function asPurchase(row: Row) { return { id: row.id, pokemonId: row.pokemonId, pokemonName: row.pokemonName, quantity: row.quantity, unitPrice: row.unitPrice, totalPrice: row.totalPrice, createdAt: new Date(row.createdAt).toISOString() }; }
function levelValue(level: string): number { return level === 'FULL' ? 2 : level === 'BASIC' ? 1 : 0; }
type Kyc = { level: string; levelValue: number; status: string; updatedAt: string };
// KYC is an internal HTTP service with its own data. Never call it inside a database transaction.
async function fetchKyc(userId: string): Promise<Kyc> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), kycTimeoutMs);
  try {
    const response = await fetch(`${kycBaseUrl}/kyc/v1/users/${encodeURIComponent(userId)}`, { signal: controller.signal, headers: { Authorization: `Bearer ${kycApiKey}` } });
    if (response.status === 404) return { level: 'NONE', levelValue: 0, status: 'ACTIVE', updatedAt: new Date().toISOString() };
    if (!response.ok) throw new Error(`kyc status ${response.status}`);
    const body = await response.json() as Row;
    if (typeof body.level !== 'string' || typeof body.status !== 'string') throw new Error('kyc invalid body');
    return { level: body.level, levelValue: levelValue(body.level), status: body.status, updatedAt: String(body.updatedAt ?? new Date().toISOString()) };
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
  if (Number((rows as Row[])[0]?.required ?? 0) === 0) return () => null;
  try { const kyc = await fetchKyc(userId); return () => kyc; } catch (error) { return () => { throw error; }; }
}
function assertKyc(kyc: Kyc | null, required: number, label: string) {
  if (required === 0) return;
  if (!kyc || kyc.status !== 'ACTIVE' || kyc.levelValue < required) throw new AppError(403, 'KYC_LEVEL_REQUIRED', `This ${label} requires a higher verification level`, [{ required, current: kyc?.levelValue ?? 0 }]);
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
  if (req.method === 'POST' && ['/pokemart/v1/auth/login', '/pokemart/v1/purchases', '/pokemart/v1/items/purchases', '/pokemart/v1/wallet/top-ups'].includes(req.path) && !req.is('application/json')) return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
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
    const [rows] = await pool.query('SELECT COUNT(*) AS count FROM shop_listing');
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
    const [countRows] = await pool.query(`SELECT COUNT(*) AS count FROM shop_listing l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE ${where}`, values);
    const [rows] = await pool.query(`SELECT r.source_id AS id, r.name, r.types, r.sprite_url AS spriteUrl, l.price, l.stock FROM shop_listing l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE ${where} ORDER BY r.source_id ASC LIMIT ? OFFSET ?`, [...values, limit, offset]);
    res.json({ count: Number((countRows as Row[])[0].count), limit, offset, results: (rows as Row[]).map(asPokemon) });
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/catalog/pokemon/:id', async (req, res, next) => {
  try {
    const id = pokemonId(req.params.id);
    const [rows] = await pool.query(`SELECT r.source_id AS id, r.name, r.types, r.sprite_url AS spriteUrl, l.price, l.stock FROM shop_listing l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE l.active=TRUE AND r.source_id=?`, [id]);
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
    const [countRows] = await pool.query(`SELECT COUNT(*) AS count FROM item_listing l JOIN item_reference r ON r.source_id=l.item_source_id WHERE ${where}`, values);
    const [rows] = await pool.query(`SELECT r.source_id AS id, r.name, r.category, r.sprite_url AS spriteUrl, l.price, l.stock, l.required_kyc_level AS requiredKycLevel FROM item_listing l JOIN item_reference r ON r.source_id=l.item_source_id WHERE ${where} ORDER BY r.source_id LIMIT ? OFFSET ?`, [...values, limit, offset]);
    res.json({ count: Number((countRows as Row[])[0].count), limit, offset, results: rows });
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/catalog/item-categories', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT r.category FROM item_listing l JOIN item_reference r ON r.source_id=l.item_source_id WHERE l.active=TRUE AND r.category IS NOT NULL ORDER BY r.category');
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
app.get('/pokemart/v1/inventory', authenticate, async (req, res, next) => {
  try { const id = userId(res); const [rows] = await pool.query(`SELECT i.pokemon_source_id AS pokemonId, r.name, i.quantity FROM user_inventory i JOIN pokemon_reference r ON r.source_id=i.pokemon_source_id WHERE i.user_id=? ORDER BY i.pokemon_source_id`, [id]); const results = (rows as Row[]).map((row) => ({ ...row, quantity: Number(row.quantity) })); res.json({ count: results.length, results }); } catch (error) { next(error); }
});
app.get('/pokemart/v1/purchases', authenticate, async (req, res, next) => {
  try {
    const id = userId(res); const { limit, offset } = pageParams(req);
    const [countRows] = await pool.query('SELECT COUNT(*) AS count FROM purchases WHERE user_id=?', [id]);
    const [rows] = await pool.query(`SELECT p.id, p.pokemon_source_id AS pokemonId, r.name AS pokemonName, p.quantity, p.unit_price AS unitPrice, p.total_price AS totalPrice, p.created_at AS createdAt FROM purchases p JOIN pokemon_reference r ON r.source_id=p.pokemon_source_id WHERE p.user_id=? ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`, [id, limit, offset]);
    res.json({ count: Number((countRows as Row[])[0].count), limit, offset, results: (rows as Row[]).map(asPurchase) });
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/purchases/:id', authenticate, async (req, res, next) => {
  try {
    const id = userId(res); const purchaseId = req.params.id;
    if (typeof purchaseId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(purchaseId)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a UUID' }]);
    const [rows] = await pool.query(`SELECT p.id, p.pokemon_source_id AS pokemonId, r.name AS pokemonName, p.quantity, p.unit_price AS unitPrice, p.total_price AS totalPrice, p.created_at AS createdAt FROM purchases p JOIN pokemon_reference r ON r.source_id=p.pokemon_source_id WHERE p.user_id=? AND p.id=?`, [id, purchaseId]);
    if (!(rows as Row[]).length) throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found'); res.json(asPurchase((rows as Row[])[0]));
  } catch (error) { next(error); }
});
app.get('/pokemart/v1/purchases/:id/shipment', authenticate, async (req, res, next) => {
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

async function createPurchase(userId: string, body: unknown): Promise<{ status: number; body: Row }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'must be an object' }]);
  const candidate = body as Row;
  if (Object.keys(candidate).some((field) => field !== 'purchaseId' && field !== 'pokemonId' && field !== 'quantity')) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'contains unknown fields' }]);
  if (typeof candidate.purchaseId !== 'string' || !validUuid.test(candidate.purchaseId)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'purchaseId', message: 'must be a UUID' }]);
  const purchaseId = candidate.purchaseId as string;
  const pokemon = positiveInt(candidate.pokemonId, 'pokemonId'); const quantity = positiveInt(candidate.quantity, 'quantity', 99);
  const kycGate = await prefetchKyc('SELECT required_kyc_level AS required FROM shop_listing WHERE pokemon_source_id=?', pokemon, userId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [listings] = await connection.query(`SELECT l.pokemon_source_id AS pokemonId,l.price,l.stock,l.active,l.required_kyc_level,r.name FROM shop_listing l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE l.pokemon_source_id=? FOR UPDATE`, [pokemon]);
    const listing = (listings as Row[])[0];
    const [existingPurchases] = await connection.query('SELECT id FROM purchases WHERE id=?', [purchaseId]);
    if ((existingPurchases as Row[]).length) throw new AppError(409, 'PURCHASE_DUPLICATE', 'Purchase ID has already been processed');
    const [references] = await connection.query('SELECT source_id FROM pokemon_reference WHERE source_id=?', [pokemon]);
    if (!(references as Row[]).length) throw new AppError(404, 'POKEMON_NOT_FOUND', 'Pokémon not found');
    if (!listing || !listing.active) throw new AppError(409, 'POKEMON_NOT_FOR_SALE', 'Pokémon is not for sale');
    assertKyc(kycGate(), Number(listing.required_kyc_level ?? 0), 'Pokémon');
    if (Number(listing.stock) < quantity) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock');
    const [wallets] = await connection.query('SELECT balance FROM user_wallet WHERE user_id=? FOR UPDATE', [userId]);
    const wallet = (wallets as Row[])[0]; const total = Number(listing.price) * quantity;
    if (!wallet || Number(wallet.balance) < total) throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient funds');
    const createdAt = new Date();
    await connection.query('INSERT INTO purchases (id,user_id,pokemon_source_id,quantity,unit_price,total_price,created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [purchaseId, userId, pokemon, quantity, listing.price, total, createdAt]);
    await connection.query('INSERT INTO shipments (purchase_id, processing_status, delivery_status, attempt_count, next_attempt_at, created_at, updated_at) VALUES (?, "PENDING", "WAITING_FOR_SHIPMENT", 0, ?, ?, ?)', [purchaseId, createdAt, createdAt, createdAt]);
    await connection.query('UPDATE shop_listing SET stock=stock-? WHERE pokemon_source_id=?', [quantity, pokemon]);
    await connection.query('UPDATE user_wallet SET balance=balance-? WHERE user_id=?', [total, userId]);
    await connection.query('INSERT INTO user_inventory (user_id,pokemon_source_id,quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [userId, pokemon, quantity]);
    const response = { id: purchaseId, pokemonId: pokemon, pokemonName: listing.name, quantity, unitPrice: Number(listing.price), totalPrice: total, createdAt: createdAt.toISOString() };
    await connection.commit(); return { status: 201, body: response };
  } catch (error) {
    await connection.rollback();
    if (isDuplicateEntry(error)) throw new AppError(409, 'PURCHASE_DUPLICATE', 'Purchase ID has already been processed');
    throw error;
  } finally { connection.release(); }
}
app.post('/pokemart/v1/purchases', authenticate, async (req, res, next) => {
  try {
    const id = userId(res);
    const result = await createPurchase(id, req.body);
    res.setHeader('Location', `/pokemart/v1/purchases/${result.body.id}`); res.status(result.status).json(result.body);
  } catch (error) { next(error); }
});

app.post('/pokemart/v1/items/purchases', authenticate, async (req, res, next) => {
  let connection: mysql.PoolConnection | undefined;
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'must be an object' }]);
    const body = req.body as Row;
    if (Object.keys(body).some((field) => field !== 'purchaseId' && field !== 'itemId' && field !== 'quantity')) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'contains unknown fields' }]);
    if (typeof body.purchaseId !== 'string' || !validUuid.test(body.purchaseId)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'purchaseId', message: 'must be a UUID' }]);
    const itemId = positiveInt(body.itemId, 'itemId'); const quantity = positiveInt(body.quantity, 'quantity', 99); const id = userId(res);
    const kycGate = await prefetchKyc('SELECT required_kyc_level AS required FROM item_listing WHERE item_source_id=?', itemId, id);
    connection = await pool.getConnection(); // acquired only after the KYC HTTP call
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT id FROM item_purchases WHERE id=?', [body.purchaseId]);
    if ((existing as Row[]).length) throw new AppError(409, 'ITEM_PURCHASE_DUPLICATE', 'Purchase ID has already been processed');
    const [references] = await connection.query('SELECT source_id FROM item_reference WHERE source_id=?', [itemId]);
    if (!(references as Row[]).length) throw new AppError(404, 'ITEM_NOT_FOUND', 'Item not found');
    const [listings] = await connection.query('SELECT l.item_source_id AS itemId, l.price, l.stock, l.active, l.required_kyc_level, r.name FROM item_listing l JOIN item_reference r ON r.source_id=l.item_source_id WHERE l.item_source_id=? FOR UPDATE', [itemId]);
    const listing = (listings as Row[])[0];
    if (!listing || !listing.active) throw new AppError(409, 'ITEM_NOT_FOR_SALE', 'Item is not for sale');
    assertKyc(kycGate(), Number(listing.required_kyc_level ?? 0), 'item');
    if (Number(listing.stock) < quantity) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock');
    const [wallets] = await connection.query('SELECT balance FROM user_wallet WHERE user_id=? FOR UPDATE', [id]);
    const wallet = (wallets as Row[])[0]; const total = Number(listing.price) * quantity;
    if (!wallet || Number(wallet.balance) < total) throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient funds');
    const createdAt = new Date();
    await connection.query('INSERT INTO item_purchases (id, user_id, item_source_id, quantity, unit_price, total_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [body.purchaseId, id, itemId, quantity, listing.price, total, createdAt]);
    await connection.query('UPDATE item_listing SET stock=stock-? WHERE item_source_id=?', [quantity, itemId]);
    await connection.query('UPDATE user_wallet SET balance=balance-? WHERE user_id=?', [total, id]);
    await connection.query('INSERT INTO user_item_inventory (user_id, item_source_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [id, itemId, quantity]);
    await connection.commit();
    const result = { purchaseId: body.purchaseId, itemId, itemName: listing.name, quantity, unitPrice: Number(listing.price), totalPrice: total, createdAt: createdAt.toISOString() };
    res.setHeader('Location', `/pokemart/v1/items/purchases/${result.purchaseId}`); res.status(201).json(result);
  } catch (error) {
    await connection?.rollback();
    if (isDuplicateEntry(error)) return next(new AppError(409, 'ITEM_PURCHASE_DUPLICATE', 'Purchase ID has already been processed'));
    next(error);
  } finally { connection?.release(); }
});
app.get('/pokemart/v1/items/purchases/:id', authenticate, async (req, res, next) => {
  try {
    if (!validUuid.test(String(req.params.id))) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a UUID' }]);
    const [rows] = await pool.query('SELECT p.id AS purchaseId, p.item_source_id AS itemId, r.name AS itemName, p.quantity, p.unit_price AS unitPrice, p.total_price AS totalPrice, p.created_at AS createdAt FROM item_purchases p JOIN item_reference r ON r.source_id=p.item_source_id WHERE p.id=? AND p.user_id=?', [req.params.id, userId(res)]);
    const row = (rows as Row[])[0];
    if (!row) throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found');
    res.json({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), totalPrice: Number(row.totalPrice), createdAt: new Date(row.createdAt).toISOString() });
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
