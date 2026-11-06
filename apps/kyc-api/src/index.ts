import express, { NextFunction, Request, Response } from 'express';

// Internal KYC provider simulation. It owns its own data (in memory, seeded at start-up) and never
// shares PokéMart's database. PokéMart calls it over HTTP, outside any database transaction.
// 0 = not verified, 1 = basic, 2 = full
type Level = 0 | 1 | 2;
type Status = 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED';
type Record = { level: Level; status: Status; updatedAt: string; submission?: Submission };
// Only what a reviewer needs. The full national ID is validated and then discarded; only the last 4 digits are kept.
type Submission = { fullName: string; nationalIdLast4: string; dateOfBirth: string; phone: string; address: string; submittedAt: string };
type Fault = 'http_500' | 'timeout';

const levels: Level[] = [0, 1, 2];
const statuses: Status[] = ['ACTIVE', 'PENDING_REVIEW', 'REJECTED'];
const port = Number(process.env.PORT ?? 4005);
const apiKey = process.env.KYC_API_KEY ?? 'local-only-kyc-key';
const timeoutHoldMs = Number(process.env.KYC_TIMEOUT_HOLD_MS ?? 6000);
const app = express();

const seed = (): Map<string, Record> => {
  const now = new Date().toISOString();
  return new Map<string, Record>([
    // The default lab account is fully able to shop (level 1). Scenario accounts (lab-kyc-*) are not seeded here:
    // unknown users read as level 0 / ACTIVE, and each test sets its own record through PUT /__test/users/{userId}.
    ['lab-user-001', { level: 1, status: 'ACTIVE', updatedAt: now }],
    ['lab-empty-user-001', { level: 0, status: 'ACTIVE', updatedAt: now }],
  ]);
};
let users = seed();
let fault: { mode: Fault; remaining: number } | undefined; // remaining < 0 means "until cleared"

function log(fields: object) { console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'kyc-api', ...fields })); }
function view(userId: string, record: Record) {
  return { userId, level: record.level, status: record.status, updatedAt: record.updatedAt };
}

// ---- submission validation (Thai-style identity form, no documents or real provider) ----
const submissionFields = ['fullName', 'nationalId', 'dateOfBirth', 'phone', 'address'] as const;
const minAge = 18;
type FieldError = { field: string; message: string };
function validNationalId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  const sum = [...id.slice(0, 12)].reduce((acc, digit, index) => acc + Number(digit) * (13 - index), 0);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}
function validateSubmission(body: unknown): { errors: FieldError[]; value?: Submission } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { errors: [{ field: 'body', message: 'must be an object' }] };
  const input = body as { [key: string]: unknown };
  const errors: FieldError[] = [];
  for (const field of Object.keys(input)) if (!(submissionFields as readonly string[]).includes(field)) errors.push({ field, message: 'is not allowed' });
  const text = (field: string) => (typeof input[field] === 'string' ? (input[field] as string).trim() : '');
  const fullName = text('fullName'), nationalId = text('nationalId'), dateOfBirth = text('dateOfBirth'), phone = text('phone'), address = text('address');
  if (fullName.length < 2 || fullName.length > 100) errors.push({ field: 'fullName', message: 'must be 2 to 100 characters' });
  if (!validNationalId(nationalId)) errors.push({ field: 'nationalId', message: 'must be a valid 13-digit national ID' });
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? new Date(`${dateOfBirth}T00:00:00Z`) : null;
  if (!dob || Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== dateOfBirth) errors.push({ field: 'dateOfBirth', message: 'must be a real date in YYYY-MM-DD format' });
  else {
    const cutoff = new Date(); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - minAge);
    if (dob > cutoff) errors.push({ field: 'dateOfBirth', message: `you must be at least ${minAge} years old` });
  }
  if (!/^0\d{9}$/.test(phone)) errors.push({ field: 'phone', message: 'must be a 10-digit phone number starting with 0' });
  if (address.length < 10 || address.length > 300) errors.push({ field: 'address', message: 'must be 10 to 300 characters' });
  if (errors.length) return { errors };
  return { errors, value: { fullName, nationalIdLast4: nationalId.slice(-4), dateOfBirth, phone, address, submittedAt: new Date().toISOString() } };
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

// A user submits their details; the account becomes PENDING_REVIEW at its current level until a reviewer decides.
// There is no automatic approval: tests (or a reviewer tool) finish the flow through PUT /__test/users/{userId}.
app.post('/kyc/v1/users/:userId/submissions', authorize, applyFault, (req, res) => {
  const userId = String(req.params.userId);
  const record = users.get(userId) ?? { level: 0 as Level, status: 'ACTIVE' as Status, updatedAt: new Date().toISOString() };
  if (record.status === 'PENDING_REVIEW') return res.status(409).json({ error: { code: 'already_pending' } });
  if (record.status === 'ACTIVE' && record.level !== 0) return res.status(409).json({ error: { code: 'already_verified' } });
  const { errors, value } = validateSubmission(req.body);
  if (!value) return res.status(400).json({ error: { code: 'validation_error', details: errors } });
  const next: Record = { level: record.level, status: 'PENDING_REVIEW', updatedAt: new Date().toISOString(), submission: value };
  users.set(userId, next);
  res.status(202).json(view(userId, next));
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
