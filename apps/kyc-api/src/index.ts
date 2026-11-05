import express, { NextFunction, Request, Response } from 'express';

// Internal KYC provider simulation. It owns its own data (in memory, seeded at start-up) and never
// shares PokéMart's database. PokéMart calls it over HTTP, outside any database transaction.
type Level = 'NONE' | 'BASIC' | 'FULL';
type Status = 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED';
type Record = { level: Level; status: Status; updatedAt: string };
type Fault = 'http_500' | 'timeout';

const levels: Level[] = ['NONE', 'BASIC', 'FULL'];
const statuses: Status[] = ['ACTIVE', 'PENDING_REVIEW', 'REJECTED'];
const levelValue = (level: Level) => levels.indexOf(level);
const port = Number(process.env.PORT ?? 4005);
const apiKey = process.env.KYC_API_KEY ?? 'local-only-kyc-key';
const timeoutHoldMs = Number(process.env.KYC_TIMEOUT_HOLD_MS ?? 6000);
const app = express();

const seed = (): Map<string, Record> => {
  const now = new Date().toISOString();
  return new Map<string, Record>([
    ['lab-user-001', { level: 'NONE', status: 'ACTIVE', updatedAt: now }],
    ['lab-empty-user-001', { level: 'NONE', status: 'ACTIVE', updatedAt: now }],
  ]);
};
let users = seed();
let fault: { mode: Fault; remaining: number } | undefined; // remaining < 0 means "until cleared"

function log(fields: object) { console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'kyc-api', ...fields })); }
function view(userId: string, record: Record) {
  return { userId, level: record.level, levelValue: levelValue(record.level), status: record.status, updatedAt: record.updatedAt };
}

app.use(express.json({ strict: false }));
app.use((req, _res, next) => { log({ method: req.method, path: req.path, requestId: req.header('x-request-id') }); next(); });
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

function authorize(req: Request, res: Response, next: NextFunction) {
  if (req.header('authorization') !== `Bearer ${apiKey}`) return res.status(401).json({ error: { code: 'unauthorized' } });
  next();
}
async function applyFault(_req: Request, res: Response, next: NextFunction) {
  if (!fault) return next();
  const { mode } = fault;
  if (fault.remaining > 0 && --fault.remaining === 0) fault = undefined;
  if (mode === 'http_500') return res.status(500).json({ error: { code: 'simulated_error' } });
  await new Promise((resolve) => setTimeout(resolve, timeoutHoldMs));
  return res.status(504).end();
}

app.get('/kyc/v1/users/:userId', authorize, applyFault, (req, res) => {
  const record = users.get(String(req.params.userId));
  if (!record) return res.status(404).json({ error: { code: 'user_not_found' } });
  res.json(view(String(req.params.userId), record));
});

// ---- test-only routes: not published through the BFF or in specs/openapi.yaml ----
app.put('/__test/users/:userId', (req, res) => {
  const { level, status } = (req.body ?? {}) as { level?: Level; status?: Status };
  if (!levels.includes(level as Level) || (status !== undefined && !statuses.includes(status))) return res.status(400).json({ error: 'invalid level or status' });
  const record: Record = { level: level as Level, status: status ?? 'ACTIVE', updatedAt: new Date().toISOString() };
  users.set(String(req.params.userId), record);
  res.json(view(String(req.params.userId), record));
});
app.put('/__test/faults', (req, res) => {
  const { mode, count } = (req.body ?? {}) as { mode?: Fault; count?: number };
  if (!['http_500', 'timeout'].includes(String(mode)) || (count !== undefined && (!Number.isInteger(count) || count < 1))) return res.status(400).json({ error: 'invalid fault' });
  fault = { mode: mode as Fault, remaining: count ?? -1 };
  res.status(204).end();
});
app.delete('/__test/faults', (_req, res) => { fault = undefined; users = seed(); res.status(204).end(); });

app.listen(port, () => log({ message: `Listening on ${port}` }));
