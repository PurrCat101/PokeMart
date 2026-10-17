import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import mysql from 'mysql2/promise';

type Row = Record<string, any>;

class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown[] = []) {
    super(message);
  }
}

const port = Number(process.env.PORT ?? 3000);
const serviceName = 'pokemart-api';
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
function pageParams(req: Request): { limit: number; offset: number } {
  const allowed = new Set(['limit', 'offset']);
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
function userId(req: Request): string {
  const value = req.header('x-user-id');
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'X-User-Id', message: 'is required and must be valid' }]);
  return value;
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

app.use((req, res, next) => {
  const id = requestId(req); res.locals.requestId = id; res.setHeader('X-Request-Id', id);
  const start = Date.now();
  res.on('finish', () => log({ severity: 'info', requestId: id, method: req.method, route: req.route?.path ?? req.path, statusCode: res.statusCode, durationMs: Date.now() - start }));
  next();
});
app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin === 'http://localhost:8081' || origin === 'http://127.0.0.1:8081') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id, X-User-Id');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, Location');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use((req, _res, next) => {
  if (req.method === 'POST' && req.path === '/pokemart/v2/purchases' && !req.is('application/json')) return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
  next();
});
app.use(express.json({ strict: false }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    const [rows] = await pool.query('SELECT COUNT(*) AS count FROM shop_listing');
    if (Number((rows as Row[])[0].count) === 0) return res.status(503).json({ status: 'not_ready', checks: { mysql: 'uninitialized' } });
    return res.json({ status: 'ready', checks: { mysql: 'ok' } });
  } catch { return res.status(503).json({ status: 'not_ready', checks: { mysql: 'unavailable' } }); }
});

app.get('/pokemart/v2/catalog/pokemon', async (req, res, next) => {
  try {
    userId(req); const { limit, offset } = pageParams(req);
    const [countRows] = await pool.query('SELECT COUNT(*) AS count FROM shop_listing WHERE active = TRUE');
    const [rows] = await pool.query(`SELECT r.source_id AS id, r.name, r.types, r.sprite_url AS spriteUrl, l.price, l.stock FROM shop_listing l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE l.active=TRUE ORDER BY r.source_id ASC LIMIT ? OFFSET ?`, [limit, offset]);
    res.json({ count: Number((countRows as Row[])[0].count), limit, offset, results: (rows as Row[]).map(asPokemon) });
  } catch (error) { next(error); }
});
app.get('/pokemart/v2/catalog/pokemon/:id', async (req, res, next) => {
  try {
    userId(req); const id = pokemonId(req.params.id);
    const [rows] = await pool.query(`SELECT r.source_id AS id, r.name, r.types, r.sprite_url AS spriteUrl, l.price, l.stock FROM shop_listing l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE l.active=TRUE AND r.source_id=?`, [id]);
    if (!(rows as Row[]).length) throw new AppError(404, 'POKEMON_NOT_FOUND', 'Pokémon not found');
    res.json(asPokemon((rows as Row[])[0]));
  } catch (error) { next(error); }
});
app.get('/pokemart/v2/wallet', async (req, res, next) => {
  try { const id = userId(req); const [rows] = await pool.query('SELECT user_id AS userId, balance FROM user_wallet WHERE user_id=?', [id]); if (!(rows as Row[]).length) throw new AppError(404, 'USER_NOT_FOUND', 'User not found'); res.json((rows as Row[])[0]); } catch (error) { next(error); }
});
app.get('/pokemart/v2/inventory', async (req, res, next) => {
  try { const id = userId(req); const [rows] = await pool.query(`SELECT i.pokemon_source_id AS pokemonId, r.name, i.quantity FROM user_inventory i JOIN pokemon_reference r ON r.source_id=i.pokemon_source_id WHERE i.user_id=? ORDER BY i.pokemon_source_id`, [id]); const results = (rows as Row[]).map((row) => ({ ...row, quantity: Number(row.quantity) })); res.json({ count: results.length, results }); } catch (error) { next(error); }
});
app.get('/pokemart/v2/purchases', async (req, res, next) => {
  try {
    const id = userId(req); const { limit, offset } = pageParams(req);
    const [countRows] = await pool.query('SELECT COUNT(*) AS count FROM purchases WHERE user_id=?', [id]);
    const [rows] = await pool.query(`SELECT p.id, p.pokemon_source_id AS pokemonId, r.name AS pokemonName, p.quantity, p.unit_price AS unitPrice, p.total_price AS totalPrice, p.created_at AS createdAt FROM purchases p JOIN pokemon_reference r ON r.source_id=p.pokemon_source_id WHERE p.user_id=? ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`, [id, limit, offset]);
    res.json({ count: Number((countRows as Row[])[0].count), limit, offset, results: (rows as Row[]).map(asPurchase) });
  } catch (error) { next(error); }
});
app.get('/pokemart/v2/purchases/:id', async (req, res, next) => {
  try {
    const id = userId(req); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a UUID' }]);
    const [rows] = await pool.query(`SELECT p.id, p.pokemon_source_id AS pokemonId, r.name AS pokemonName, p.quantity, p.unit_price AS unitPrice, p.total_price AS totalPrice, p.created_at AS createdAt FROM purchases p JOIN pokemon_reference r ON r.source_id=p.pokemon_source_id WHERE p.user_id=? AND p.id=?`, [id, req.params.id]);
    if (!(rows as Row[]).length) throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found'); res.json(asPurchase((rows as Row[])[0]));
  } catch (error) { next(error); }
});

async function createPurchase(userId: string, body: unknown): Promise<{ status: number; body: Row }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'must be an object' }]);
  const candidate = body as Row;
  if (Object.keys(candidate).some((field) => field !== 'purchaseId' && field !== 'pokemonId' && field !== 'quantity')) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'contains unknown fields' }]);
  if (typeof candidate.purchaseId !== 'string' || !validUuid.test(candidate.purchaseId)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'purchaseId', message: 'must be a UUID' }]);
  const purchaseId = candidate.purchaseId as string;
  const pokemon = positiveInt(candidate.pokemonId, 'pokemonId'); const quantity = positiveInt(candidate.quantity, 'quantity', 99);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [listings] = await connection.query(`SELECT l.pokemon_source_id AS pokemonId,l.price,l.stock,l.active,r.name FROM shop_listing l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE l.pokemon_source_id=? FOR UPDATE`, [pokemon]);
    const listing = (listings as Row[])[0];
    const [existingPurchases] = await connection.query('SELECT id FROM purchases WHERE id=?', [purchaseId]);
    if ((existingPurchases as Row[]).length) throw new AppError(409, 'PURCHASE_DUPLICATE', 'Purchase ID has already been processed');
    const [references] = await connection.query('SELECT source_id FROM pokemon_reference WHERE source_id=?', [pokemon]);
    if (!(references as Row[]).length) throw new AppError(404, 'POKEMON_NOT_FOUND', 'Pokémon not found');
    if (!listing || !listing.active) throw new AppError(409, 'POKEMON_NOT_FOR_SALE', 'Pokémon is not for sale');
    if (Number(listing.stock) < quantity) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock');
    const [wallets] = await connection.query('SELECT balance FROM user_wallet WHERE user_id=? FOR UPDATE', [userId]);
    const wallet = (wallets as Row[])[0]; const total = Number(listing.price) * quantity;
    if (!wallet || Number(wallet.balance) < total) throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient funds');
    const createdAt = new Date();
    await connection.query('INSERT INTO purchases (id,user_id,pokemon_source_id,quantity,unit_price,total_price,created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [purchaseId, userId, pokemon, quantity, listing.price, total, createdAt]);
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
app.post('/pokemart/v2/purchases', async (req, res, next) => {
  try {
    const id = userId(req);
    const result = await createPurchase(id, req.body);
    res.setHeader('Location', `/pokemart/v2/purchases/${result.body.id}`); res.status(result.status).json(result.body);
  } catch (error) { next(error); }
});
app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
  const appError = error instanceof AppError ? error : error?.type === 'entity.parse.failed' ? new AppError(400, 'INVALID_JSON', 'Malformed JSON request body') : new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  if (!(error instanceof AppError) && error?.type !== 'entity.parse.failed') log({ severity: 'error', requestId: res.locals.requestId, message: error?.message });
  res.status(appError.status).json(errorBody(appError, res.locals.requestId ?? requestId(req)));
});

app.listen(port, () => log({ severity: 'info', message: `Listening on ${port}` }));
