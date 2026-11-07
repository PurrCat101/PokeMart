import crypto from 'node:crypto';
import express, { NextFunction, Request, Response as ExpressResponse } from 'express';
import { registry, observeRequest, observeUpstream, countUpstreamFailure } from './metrics.js';
import { installLogShipper } from './log-shipper.js';

class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown[] = []) { super(message); }
}
type JsonRecord = Record<string, unknown>;
const app = express();
const port = Number(process.env.PORT ?? 4001);
const upstreamBase = (process.env.POKEMART_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const serviceName = 'bff';
installLogShipper(serviceName);
const validRequestId = /^[A-Za-z0-9_-]{1,64}$/;
const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const knownCodes = new Set(['VALIDATION_ERROR', 'UNKNOWN_QUERY_PARAMETER', 'INVALID_JSON', 'UNSUPPORTED_MEDIA_TYPE', 'UNAUTHORIZED', 'INVALID_CREDENTIALS', 'POKEMON_NOT_FOUND', 'USER_NOT_FOUND', 'PURCHASE_NOT_FOUND', 'POKEMON_NOT_FOR_SALE', 'ITEM_NOT_FOUND', 'ITEM_NOT_FOR_SALE', 'INSUFFICIENT_STOCK', 'INSUFFICIENT_FUNDS', 'PURCHASE_DUPLICATE', 'KYC_LEVEL_REQUIRED', 'KYC_PENDING_REVIEW', 'KYC_ALREADY_PENDING', 'KYC_ALREADY_VERIFIED', 'TOP_UP_DUPLICATE', 'TOP_UP_NOT_FOUND', 'PAYMENT_FAILED']);
const swaggerOrigins = new Set(['http://localhost:8081', 'http://127.0.0.1:8081']);

function log(fields: Record<string, unknown>) { console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: serviceName, environment: process.env.NODE_ENV ?? 'development', ...fields })); }
// `retryable` tells the client whether the same request may be sent again unchanged (transient failures only).
function errorBody(error: AppError, requestId: string) { return { error: { code: error.code, message: error.message, requestId, retryable: error.status === 503, details: error.details } }; }
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid response');
  return value as JsonRecord;
}
function mapPokemon(value: unknown) {
  const pokemon = asRecord(value);
  if (typeof pokemon.id !== 'number' || typeof pokemon.name !== 'string' || !Array.isArray(pokemon.types) || typeof pokemon.price !== 'number' || typeof pokemon.stock !== 'number') {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid catalog response');
  }
  return {
    pokemon: { id: pokemon.id, name: pokemon.name, types: pokemon.types, spriteUrl: pokemon.spriteUrl },
    listing: { price: pokemon.price, availableStock: pokemon.stock },
  };
}
function mapCatalog(value: unknown) {
  const page = asRecord(value);
  if (typeof page.count !== 'number' || typeof page.limit !== 'number' || typeof page.offset !== 'number' || !Array.isArray(page.results)) {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid catalog page');
  }
  return {
    totalCount: page.count,
    page: { limit: page.limit, offset: page.offset },
    items: page.results.map(mapPokemon),
  };
}
function mapWallet(value: unknown) {
  const wallet = asRecord(value);
  if (typeof wallet.userId !== 'string' || typeof wallet.balance !== 'number') {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid wallet');
  }
  return { wallet: { userId: wallet.userId, balance: wallet.balance } };
}
function mapAuthUser(value: unknown) {
  const user = asRecord(value);
  if (typeof user.userId !== 'string' || typeof user.email !== 'string' || typeof user.displayName !== 'string') {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid user profile');
  }
  return { userId: user.userId, email: user.email, displayName: user.displayName };
}
function mapLogin(value: unknown) {
  const result = asRecord(value);
  const user = mapAuthUser(result.user);
  if (typeof result.accessToken !== 'string' || result.tokenType !== 'Bearer' || typeof result.expiresIn !== 'number') {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid login response');
  }
  return { accessToken: result.accessToken, tokenType: result.tokenType, expiresIn: result.expiresIn, user };
}
function mapKyc(value: unknown) {
  const kyc = asRecord(value);
  if (![0, 1, 2].includes(kyc.level as number) || typeof kyc.status !== 'string' || typeof kyc.updatedAt !== 'string') throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid KYC status');
  return { level: kyc.level, status: kyc.status, updatedAt: kyc.updatedAt };
}
function mapItem(value: unknown) {
  const item = asRecord(value);
  if (typeof item.id !== 'number' || typeof item.name !== 'string' || typeof item.price !== 'number' || typeof item.stock !== 'number' || typeof item.requiredKycLevel !== 'number') throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid item');
  return { item: { id: item.id, name: item.name, category: (item.category as string | null) ?? null, spriteUrl: (item.spriteUrl as string | null) ?? null }, listing: { price: item.price, availableStock: item.stock, requiredKycLevel: item.requiredKycLevel } };
}
function mapItemPage(value: unknown) {
  const page = asRecord(value);
  if (typeof page.count !== 'number' || typeof page.limit !== 'number' || typeof page.offset !== 'number' || !Array.isArray(page.results)) throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid item page');
  return { totalCount: page.count, page: { limit: page.limit, offset: page.offset }, items: page.results.map(mapItem) };
}
function mapItemCategories(value: unknown) {
  const body = asRecord(value);
  if (!Array.isArray(body.categories) || body.categories.some((c) => typeof c !== 'string')) throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned invalid item categories');
  return { categories: body.categories };
}
function mapItemInventory(value: unknown) {
  const inventory = asRecord(value);
  if (!Array.isArray(inventory.results)) throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid item inventory');
  return {
    items: inventory.results.map((value) => {
      const item = asRecord(value);
      if (typeof item.itemId !== 'number' || typeof item.name !== 'string' || typeof item.quantity !== 'number') {
        throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid item inventory entry');
      }
      return { item: { id: item.itemId, name: item.name }, quantity: item.quantity };
    }),
  };
}
function mapTopUp(value: unknown) {
  const t = asRecord(value);
  if (typeof t.topUpId !== 'string' || typeof t.amount !== 'number' || typeof t.status !== 'string' || typeof t.createdAt !== 'string' || typeof t.updatedAt !== 'string') throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid top-up');
  return { topUpId: t.topUpId, amount: t.amount, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt };
}
function validateTopUp(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'must be an object' }]);
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((field) => field !== 'topUpId' && field !== 'amount')) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'contains unknown fields' }]);
  if (typeof value.topUpId !== 'string' || !validUuid.test(value.topUpId)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'topUpId', message: 'must be a UUID' }]);
  if (typeof value.amount !== 'number' || !Number.isInteger(value.amount) || value.amount < 1 || value.amount > 10000) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'amount', message: 'must be an integer from 1 to 10000' }]);
}
function validateKycSubmission(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'must be an object' }]);
  const value = body as Record<string, unknown>; const fields = ['fullName', 'nationalId', 'dateOfBirth', 'phone', 'address'];
  if (Object.keys(value).some((field) => !fields.includes(field))) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'contains unknown fields' }]);
  const missing = fields.filter((field) => typeof value[field] !== 'string');
  if (missing.length) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', missing.map((field) => ({ field, message: 'must be a string' })));
}
function mapAccountInfo(value: unknown) {
  const account = asRecord(value); const user = mapAuthUser(account.user); const wallet = asRecord(account.wallet);
  if (typeof wallet.userId !== 'string' || typeof wallet.balance !== 'number') throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned invalid account information');
  // kyc is null when the KYC service is down; sign-in and wallet display must keep working.
  return { user, wallet: { userId: wallet.userId, balance: wallet.balance }, kyc: account.kyc === null || account.kyc === undefined ? null : mapKyc(account.kyc) };
}
function mapInventory(value: unknown) {
  const inventory = asRecord(value);
  if (!Array.isArray(inventory.results)) throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid inventory');
  return {
    items: inventory.results.map((value) => {
      const item = asRecord(value);
      if (typeof item.pokemonId !== 'number' || typeof item.name !== 'string' || typeof item.quantity !== 'number') {
        throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid inventory item');
      }
      return { pokemon: { id: item.pokemonId, name: item.name }, quantity: item.quantity };
    }),
  };
}
// One purchase shape for both kinds. The upstream says which product it is by carrying pokemonId/pokemonName
// or itemId/itemName; `kind` is derived from that, so an upstream without a `kind` field still maps.
function mapPurchase(value: unknown) {
  const purchase = asRecord(value);
  const isPokemon = typeof purchase.pokemonId === 'number' && typeof purchase.pokemonName === 'string';
  const isItem = typeof purchase.itemId === 'number' && typeof purchase.itemName === 'string';
  if (typeof purchase.id !== 'string' || isPokemon === isItem
    || typeof purchase.quantity !== 'number' || typeof purchase.unitPrice !== 'number' || typeof purchase.totalPrice !== 'number'
    || typeof purchase.createdAt !== 'string') {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid purchase');
  }
  return {
    purchaseId: purchase.id,
    kind: isPokemon ? 'POKEMON' : 'ITEM',
    ...(isPokemon ? { pokemon: { id: purchase.pokemonId, name: purchase.pokemonName } } : { item: { id: purchase.itemId, name: purchase.itemName } }),
    quantity: purchase.quantity,
    pricing: { unitPrice: purchase.unitPrice, totalPrice: purchase.totalPrice },
    createdAt: purchase.createdAt,
  };
}
function mapShipment(value: unknown) {
  const shipment = asRecord(value);
  if (typeof shipment.purchaseId !== 'string' || typeof shipment.orderStatus !== 'string'
    || typeof shipment.processingStatus !== 'string' || typeof shipment.deliveryStatus !== 'string'
    || typeof shipment.attemptCount !== 'number'
    || typeof shipment.createdAt !== 'string' || typeof shipment.updatedAt !== 'string') {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid shipment status');
  }
  return {
    purchaseId: shipment.purchaseId,
    orderStatus: shipment.orderStatus,
    processingStatus: shipment.processingStatus,
    deliveryStatus: shipment.deliveryStatus,
    trackingNumber: (shipment.trackingNumber as string | null) ?? null,
    attemptCount: shipment.attemptCount,
    lastError: (shipment.lastError as string | null) ?? null,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}
function mapPurchasePage(value: unknown) {
  const page = asRecord(value);
  if (typeof page.count !== 'number' || typeof page.limit !== 'number' || typeof page.offset !== 'number' || !Array.isArray(page.results)) {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid purchase page');
  }
  return {
    totalCount: page.count,
    page: { limit: page.limit, offset: page.offset },
    items: page.results.map(mapPurchase),
  };
}
function pageParams(req: Request, extraAllowed: string[] = []): { limit: number; offset: number } {
  const allowed = new Set(['limit', 'offset', ...extraAllowed]);
  const unknown = Object.keys(req.query).find((key) => !allowed.has(key));
  if (unknown) throw new AppError(400, 'UNKNOWN_QUERY_PARAMETER', 'Unknown query parameter', [{ field: unknown, message: 'is not supported' }]);
  const parse = (value: unknown, field: string, fallback: number, minimum: number, maximum?: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message: 'must be an integer' }]);
    const result = Number(value);
    if (result < minimum || (maximum !== undefined && result > maximum)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message: `must be between ${minimum} and ${maximum ?? 'infinity'}` }]);
    return result;
  };
  return { limit: parse(req.query.limit, 'limit', 20, 1, 100), offset: parse(req.query.offset, 'offset', 0, 0) };
}
function positivePathId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a positive integer' }]);
}
function validatePurchase(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'must be an object' }]);
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((field) => field !== 'purchaseId' && field !== 'pokemonId' && field !== 'itemId' && field !== 'quantity')) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'contains unknown fields' }]);
  if (typeof value.purchaseId !== 'string' || !validUuid.test(value.purchaseId)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'purchaseId', message: 'must be a UUID' }]);
  if (value.pokemonId !== undefined && value.itemId !== undefined) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'provide either pokemonId or itemId, not both' }]);
  // Exactly one product id; with neither, report the Pokémon field (the original contract).
  const productField = value.itemId !== undefined ? 'itemId' : 'pokemonId';
  for (const [field, maximum] of [[productField, undefined], ['quantity', 99]] as const) {
    if (typeof value[field] !== 'number' || !Number.isInteger(value[field]) || (value[field] as number) < 1 || (maximum && (value[field] as number) > maximum)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message: maximum ? `must be an integer from 1 to ${maximum}` : 'must be a positive integer' }]);
  }
}
async function callUpstream(req: Request, path: string, method = 'GET', body?: unknown): Promise<globalThis.Response> {
  const timeout = method === 'GET' ? 3000 : 5000;
  const attempts = method === 'GET' ? 2 : 1;
  let failure: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout); const started = Date.now();
    try {
      const response = await fetch(`${upstreamBase}${path}`, { method, signal: controller.signal, headers: { 'X-Request-Id': resRequestId(req), ...(req.header('authorization') ? { Authorization: req.header('authorization') as string } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      observeUpstream(response.status, (Date.now() - started) / 1000);
      log({ severity: 'info', requestId: resRequestId(req), upstreamStatus: response.status, upstreamDurationMs: Date.now() - started }); clearTimeout(timer); return response;
    } catch (error) { clearTimeout(timer); failure = error; countUpstreamFailure(); }
  }
  throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'Catalog service is temporarily unavailable');
}
function resRequestId(req: Request) { return (req as any).requestId as string; }
async function relay(req: Request, res: ExpressResponse, path: string, method = 'GET', body?: unknown, mapResponse?: (payload: unknown) => unknown) {
  const upstream = await callUpstream(req, path, method, body);
  const raw = await upstream.text(); let payload: unknown;
  try { payload = raw ? JSON.parse(raw) : undefined; } catch { throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'PokéMart API returned an invalid response'); }
  const authenticate = upstream.headers.get('www-authenticate');
  if (authenticate) res.setHeader('WWW-Authenticate', authenticate);
  if (upstream.status >= 500) {
    // Keep the upstream's dependency-specific wording (for example the KYC service) when it names one; never leak other 5xx text.
    const known = upstream.status === 503 && (payload as any)?.error?.code === 'DEPENDENCY_UNAVAILABLE' && typeof (payload as any)?.error?.message === 'string';
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', known ? (payload as any).error.message : 'Catalog service is temporarily unavailable');
  }
  if (upstream.status >= 400) {
    const code = (payload as any)?.error?.code;
    if (!knownCodes.has(code)) throw new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    // Re-issue the envelope so every public error has the same fields (including retryable) and the BFF request id.
    const details = Array.isArray((payload as any).error.details) ? (payload as any).error.details : [];
    throw new AppError(upstream.status, code, String((payload as any).error.message ?? ''), details);
  }
  const location = upstream.headers.get('location');
  if (location) res.setHeader('Location', location.replace(/^\/pokemart\/v1\//, '/api/')); // never expose the internal service path
  if (upstream.status < 400 && mapResponse) payload = mapResponse(payload);
  if (upstream.status === 201 && payload && typeof payload === 'object' && 'purchaseId' in payload) {
    res.setHeader('Location', `/api/purchases/${payload.purchaseId}`);
  }
  res.status(upstream.status).send(payload);
}

app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin && swaggerOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, Location');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use((req, res, next) => {
  (req as any).requestId = validRequestId.test(req.header('x-request-id') ?? '') ? req.header('x-request-id') : crypto.randomUUID();
  res.setHeader('X-Request-Id', resRequestId(req)); const start = Date.now();
  res.on('finish', () => {
    observeRequest(req.method, req.route?.path, res.statusCode, (Date.now() - start) / 1000);
    if (req.route?.path !== '/metrics') log({ severity: 'info', requestId: resRequestId(req), method: req.method, route: req.route?.path ?? req.path, statusCode: res.statusCode, durationMs: Date.now() - start });
  });
  next();
});
app.use((req, _res, next) => req.method === 'POST' && ['/api/auth/login', '/api/purchases', '/api/wallet/top-ups', '/api/kyc/submissions'].includes(req.path) && !req.is('application/json') ? next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json')) : next());
app.use(express.json({ strict: false }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
// Operational endpoint for Prometheus; intentionally not part of the public OpenAPI contract.
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
app.get('/ready', async (req, res, next) => {
  try { const result = await callUpstream(req, '/ready'); if (result.status !== 200) return res.status(503).json({ status: 'not_ready', checks: { pokemartApi: 'unavailable' } }); return res.json({ status: 'ready', checks: { pokemartApi: 'ok' } }); } catch (error) { next(error); }
});
app.post('/api/auth/login', async (req, res, next) => { try { await relay(req, res, '/pokemart/v1/auth/login', 'POST', req.body, mapLogin); } catch (error) { next(error); } });
app.get('/api/auth/me', async (req, res, next) => { try { await relay(req, res, '/pokemart/v1/auth/me', 'GET', undefined, (payload) => ({ user: mapAuthUser(asRecord(payload).user) })); } catch (error) { next(error); } });
app.get('/api/account-info', async (req, res, next) => { try { await relay(req, res, '/pokemart/v1/account-info', 'GET', undefined, mapAccountInfo); } catch (error) { next(error); } });
app.get('/api/pokemon', async (req, res, next) => { try { const { limit, offset } = pageParams(req, ['q', 'type', 'inStock']); const filters = new URLSearchParams(); for (const field of ['q', 'type', 'inStock']) if (typeof req.query[field] === 'string') filters.set(field, req.query[field] as string); await relay(req, res, `/pokemart/v1/catalog/pokemon?limit=${limit}&offset=${offset}${filters.size ? `&${filters}` : ''}`, 'GET', undefined, mapCatalog); } catch (error) { next(error); } });
app.get('/api/items', async (req, res, next) => { try { const { limit, offset } = pageParams(req, ['q', 'category', 'inStock']); const filters = new URLSearchParams(); for (const field of ['q', 'category', 'inStock']) if (typeof req.query[field] === 'string') filters.set(field, req.query[field] as string); await relay(req, res, `/pokemart/v1/catalog/items?limit=${limit}&offset=${offset}${filters.size ? `&${filters}` : ''}`, 'GET', undefined, mapItemPage); } catch (error) { next(error); } });
app.get('/api/item-categories', async (req, res, next) => { try { await relay(req, res, '/pokemart/v1/catalog/item-categories', 'GET', undefined, mapItemCategories); } catch (error) { next(error); } });
app.get('/api/items/inventory', async (req, res, next) => { try { await relay(req, res, '/pokemart/v1/items/inventory', 'GET', undefined, mapItemInventory); } catch (error) { next(error); } });
app.get('/api/pokemon/:id', async (req, res, next) => { try { positivePathId(req.params.id); await relay(req, res, `/pokemart/v1/catalog/pokemon/${req.params.id}`, 'GET', undefined, mapPokemon); } catch (error) { next(error); } });
app.get('/api/wallet', async (req, res, next) => { try { await relay(req, res, '/pokemart/v1/wallet', 'GET', undefined, mapWallet); } catch (error) { next(error); } });
app.get('/api/kyc/status', async (req, res, next) => { try { await relay(req, res, '/pokemart/v1/kyc/status', 'GET', undefined, mapKyc); } catch (error) { next(error); } });
app.post('/api/kyc/submissions', async (req, res, next) => { try { validateKycSubmission(req.body); await relay(req, res, '/pokemart/v1/kyc/submissions', 'POST', req.body, mapKyc); } catch (error) { next(error); } });
app.get('/api/wallet/top-ups/:id', async (req, res, next) => { try { if (!validUuid.test(req.params.id)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a UUID' }]); await relay(req, res, `/pokemart/v1/wallet/top-ups/${req.params.id}`, 'GET', undefined, mapTopUp); } catch (error) { next(error); } });
app.post('/api/wallet/top-ups', async (req, res, next) => { try { validateTopUp(req.body); await relay(req, res, '/pokemart/v1/wallet/top-ups', 'POST', req.body, mapTopUp); } catch (error) { next(error); } });
app.get('/api/inventory', async (req, res, next) => { try { await relay(req, res, '/pokemart/v1/inventory', 'GET', undefined, mapInventory); } catch (error) { next(error); } });
app.get('/api/purchases', async (req, res, next) => { try { const { limit, offset } = pageParams(req, ['kind']); const kind = req.query.kind; if (kind !== undefined && kind !== 'POKEMON' && kind !== 'ITEM') throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'kind', message: 'must be POKEMON or ITEM' }]); await relay(req, res, `/pokemart/v1/purchases?limit=${limit}&offset=${offset}${kind ? `&kind=${kind}` : ''}`, 'GET', undefined, mapPurchasePage); } catch (error) { next(error); } });
app.get('/api/purchases/:id', async (req, res, next) => { try { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a UUID' }]); await relay(req, res, `/pokemart/v1/purchases/${req.params.id}`, 'GET', undefined, mapPurchase); } catch (error) { next(error); } });
app.get('/api/purchases/:id/shipment', async (req, res, next) => { try { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'id', message: 'must be a UUID' }]); await relay(req, res, `/pokemart/v1/purchases/${req.params.id}/shipment`, 'GET', undefined, mapShipment); } catch (error) { next(error); } });
app.post('/api/purchases', async (req, res, next) => { try { validatePurchase(req.body); await relay(req, res, '/pokemart/v1/purchases', 'POST', req.body, mapPurchase); } catch (error) { next(error); } });
app.use((error: any, req: Request, res: ExpressResponse, _next: NextFunction) => {
  const appError = error instanceof AppError ? error : error?.type === 'entity.parse.failed' ? new AppError(400, 'INVALID_JSON', 'Malformed JSON request body') : new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  if (!(error instanceof AppError) && error?.type !== 'entity.parse.failed') log({ severity: 'error', requestId: resRequestId(req), message: error?.message });
  res.status(appError.status).json(errorBody(appError, resRequestId(req)));
});
app.listen(port, () => log({ severity: 'info', message: `Listening on ${port}` }));
