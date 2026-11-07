/**
 * Sends this process's log lines straight to Loki, so logs no longer depend on the Docker socket
 * (Podman on Windows cannot mount it). Stdout logging is unchanged.
 *
 * Off unless LOKI_URL is set. Best effort: a dead Loki drops batches and says so once; it never slows
 * or breaks the service.
 *
 * Copies of this file live in apps/bff/src, apps/pokemart-api/src, apps/shipping-mock/src, apps/kyc-api/src
 * and apps/payment-mock/src.
 * Keep them identical.
 */

type Severity = 'info' | 'warn' | 'error';
type Original = { log: typeof console.log; warn: typeof console.warn; error: typeof console.error };

interface Entry {
  service: string;
  level: Severity;
  line: string;
  ns: string;
}

const FLUSH_INTERVAL_MS = 1000;
const MAX_BATCH = 200;
const MAX_BUFFER = 5000;
const PUSH_TIMEOUT_MS = 2000;
const SEVERITIES: readonly Severity[] = ['info', 'warn', 'error'];

const pending: Entry[] = [];
let sequence = 0n;
let inFlight = false;
let warnedAboutFailure = false;
let started = false;

/** Call once at start-up. `defaultService` labels plain lines that carry no `service` field. */
export function installLogShipper(defaultService: string): void {
  const lokiUrl = process.env.LOKI_URL;
  if (!lokiUrl || started) return;
  started = true;

  const original: Original = { log: console.log, warn: console.warn, error: console.error };
  const methods: Array<[keyof Original, Severity]> = [['log', 'info'], ['warn', 'warn'], ['error', 'error']];
  for (const [method, fallback] of methods) {
    console[method] = (...args: unknown[]) => {
      original[method](...args);
      const { service, level, line } = describe(args, defaultService, fallback);
      enqueue(service, level, line);
    };
  }

  const timer = setInterval(() => void flush(lokiUrl, original.warn), FLUSH_INTERVAL_MS);
  timer.unref();
}

function describe(args: unknown[], defaultService: string, fallback: Severity): { service: string; level: Severity; line: string } {
  const line = args.map((arg) => (typeof arg === 'string' ? arg : safeStringify(arg))).join(' ');
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed && typeof parsed === 'object') {
      const fields = parsed as Record<string, unknown>;
      const service = typeof fields.service === 'string' && fields.service ? fields.service : defaultService;
      const severity = fields.severity;
      const level = typeof severity === 'string' && (SEVERITIES as readonly string[]).includes(severity) ? (severity as Severity) : fallback;
      return { service, level, line };
    }
  } catch {
    // Not JSON: a plain line, labelled with the defaults below.
  }
  return { service: defaultService, level: fallback, line };
}

function enqueue(service: string, level: Severity, line: string): void {
  // Loki wants strictly increasing nanosecond timestamps within a stream. The counter guarantees that
  // even when several lines share one millisecond.
  sequence += 1n;
  pending.push({ service, level, line, ns: (BigInt(Date.now()) * 1_000_000n + sequence).toString() });
  if (pending.length > MAX_BUFFER) pending.splice(0, pending.length - MAX_BUFFER);
}

async function flush(lokiUrl: string, warn: Original['warn']): Promise<void> {
  if (inFlight || pending.length === 0) return;
  inFlight = true;
  const batch = pending.splice(0, MAX_BATCH);
  try {
    const streams = new Map<string, { stream: { service: string; level: Severity }; values: Array<[string, string]> }>();
    for (const entry of batch) {
      const key = `${entry.service}\u0000${entry.level}`;
      let stream = streams.get(key);
      if (!stream) {
        stream = { stream: { service: entry.service, level: entry.level }, values: [] };
        streams.set(key, stream);
      }
      stream.values.push([entry.ns, entry.line]);
    }
    const response = await fetch(`${lokiUrl.replace(/\/$/, '')}/loki/api/v1/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streams: [...streams.values()] }),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    warnedAboutFailure = false;
  } catch (error) {
    // The batch is dropped on purpose. Retrying forever would only grow memory while Loki is down.
    if (!warnedAboutFailure) {
      warnedAboutFailure = true;
      warn(`[log-shipper] could not send logs to Loki, dropping them until it recovers: ${(error as Error).message}`);
    }
  } finally {
    inFlight = false;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
