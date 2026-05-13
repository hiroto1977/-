import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ServiceId } from '../shared/serviceId';
import { OAUTH_CONFIGS, refresh, type TokenSet } from './oauth';

const FILE_NAME = 'service-hub-secrets.json';
const MAX_STORE_SIZE = 1 * 1024 * 1024; // 1 MB — generous for hundreds of tokens

function secretsPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

// --- write serialization (Finding 1 fix) -------------------------------
// All read-modify-write operations on secrets.json funnel through this
// single promise chain. Without it, two concurrent IPC writes both
// readStore() before either writeStore()s, and the second clobbers the
// first — silently losing freshly-rotated OAuth refresh tokens.

let writeChain: Promise<void> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  // Run fn after the previous write completes (success OR failure).
  // The chain holds only completion signals, never throws.
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function readStore(): Promise<Record<string, string>> {
  try {
    // Bound the size we'll JSON.parse — protects against a corrupted /
    // attacker-grown secrets file OOMing main.
    const stat = await fs.stat(secretsPath());
    if (stat.size > MAX_STORE_SIZE) {
      // eslint-disable-next-line no-console
      console.error(
        `[secrets] secrets file ${secretsPath()} is ${stat.size} bytes (limit ${MAX_STORE_SIZE}); refusing to load`,
      );
      return {};
    }
    const buf = await fs.readFile(secretsPath());
    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString('utf8'));
    } catch (err) {
      // Partial / corrupted file (e.g., crash mid-write before atomic
      // rename was added) would otherwise poison every subsequent token
      // read. Log and treat as empty so the user can re-auth rather
      // than the app becoming permanently unusable.
      // eslint-disable-next-line no-console
      console.error(
        `[secrets] secrets file at ${secretsPath()} is not valid JSON; treating as empty. ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {};
    }
    // Validate shape — keys + string values only, drop anything else.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeStore(store: Record<string, string>): Promise<void> {
  await fs.mkdir(path.dirname(secretsPath()), { recursive: true });
  // Atomic-ish: write to a sibling then rename. fs.writeFile + rename
  // ensures a crash mid-write leaves the previous valid file intact
  // rather than a partial/empty json.
  const target = secretsPath();
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(store), { mode: 0o600 });
  await fs.rename(tmp, target);
}

let fallbackWarned = false;

function encode(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }
  if (!fallbackWarned) {
    fallbackWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[secrets] SECURITY WARNING: OS keychain (safeStorage) is not available. ' +
        'Tokens will be stored with a plain base64 obfuscation only — NOT real encryption. ' +
        'Anyone with read access to the userData directory can recover them. ' +
        'On Linux, install gnome-keyring or kwallet to enable real encryption.',
    );
  }
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
}

function decode(value: string): string | null {
  if (value.startsWith('plain:')) {
    return Buffer.from(value.slice('plain:'.length), 'base64').toString('utf8');
  }
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

/** Finding 5 fix: if any stored value is `plain:`-prefixed AND
 *  safeStorage is now available, upgrade-encrypt all of them in place
 *  so the user gets the encryption they were promised. Called on demand
 *  from setToken/clearToken so we don't burn cycles on read-only paths. */
async function upgradePlainValues(store: Record<string, string>): Promise<{
  upgraded: Record<string, string>;
  changed: boolean;
}> {
  if (!safeStorage.isEncryptionAvailable()) {
    return { upgraded: store, changed: false };
  }
  let changed = false;
  const upgraded: Record<string, string> = {};
  for (const [k, v] of Object.entries(store)) {
    if (v.startsWith('plain:')) {
      const decoded = Buffer.from(v.slice('plain:'.length), 'base64').toString('utf8');
      upgraded[k] = safeStorage.encryptString(decoded).toString('base64');
      changed = true;
    } else {
      upgraded[k] = v;
    }
  }
  return { upgraded, changed };
}

export async function setToken(serviceId: string, token: string): Promise<void> {
  return withWriteLock(async () => {
    const store = await readStore();
    const { upgraded } = await upgradePlainValues(store);
    upgraded[serviceId] = encode(token);
    await writeStore(upgraded);
  });
}

export async function getToken(serviceId: string): Promise<string | null> {
  const store = await readStore();
  const value = store[serviceId];
  if (!value) return null;
  return decode(value);
}

export async function clearToken(serviceId: string): Promise<void> {
  return withWriteLock(async () => {
    const store = await readStore();
    const { upgraded } = await upgradePlainValues(store);
    delete upgraded[serviceId];
    await writeStore(upgraded);
  });
}

export async function listConfiguredServices(): Promise<string[]> {
  const store = await readStore();
  return Object.keys(store);
}

// --- OAuth-aware helpers ------------------------------------------------
// Tokens stored under an OAuth-enabled service id are JSON-encoded
// TokenSet values. Everywhere else (raw PAT/Bearer paste), the value is
// the raw string. getValidToken hides the distinction from callers and
// refreshes expiring access tokens.

const REFRESH_WINDOW_MS = 60_000;

function isTokenSet(parsed: unknown): parsed is TokenSet {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as TokenSet).accessToken === 'string'
  );
}

export async function setOAuthTokens(serviceId: ServiceId, tokens: TokenSet): Promise<void> {
  await setToken(serviceId, JSON.stringify(tokens));
}

export async function getOAuthTokens(serviceId: ServiceId): Promise<TokenSet | null> {
  const raw = await getToken(serviceId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isTokenSet(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// --- refresh stampede dedup (Finding 2 fix) -----------------------------
// Two concurrent getValidToken() calls for the same service (or two
// Google services sharing one refresh token round) both observe
// expiresSoon=true and both hit POST /token. The second sees an
// invalidated refresh token and the catch swallows it, masking
// credential loss until the user notices a sign-out. Dedup all
// in-flight refreshes by serviceId.
const inflightRefresh = new Map<ServiceId, Promise<string>>();

/** Resolve the bearer token to use for a service:
 *   - If stored as an OAuth TokenSet and within the refresh window,
 *     hit the provider's token endpoint and persist the new tokens.
 *   - Otherwise return the raw stored string.
 *   - Returns null when nothing is configured.
 */
export async function getValidToken(serviceId: ServiceId): Promise<string | null> {
  const raw = await getToken(serviceId);
  if (!raw) return null;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // not JSON → raw bearer token, return as-is
    return raw;
  }
  if (!isTokenSet(parsed)) return raw;

  const tokens: TokenSet = parsed;
  const config = OAUTH_CONFIGS[serviceId];
  const expiresSoon =
    typeof tokens.expiresAt === 'number' && tokens.expiresAt - Date.now() < REFRESH_WINDOW_MS;

  if (expiresSoon && tokens.refreshToken && config) {
    const existing = inflightRefresh.get(serviceId);
    if (existing) return existing;

    const refreshPromise = (async () => {
      try {
        const fresh = await refresh(config, tokens);
        await setOAuthTokens(serviceId, fresh);
        return fresh.accessToken;
      } catch {
        // refresh failed (revoked / network) — fall through to the stale
        // access token and let the caller see the upstream 401.
        return tokens.accessToken;
      } finally {
        inflightRefresh.delete(serviceId);
      }
    })();
    inflightRefresh.set(serviceId, refreshPromise);
    return refreshPromise;
  }
  return tokens.accessToken;
}
