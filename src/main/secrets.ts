import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILE_NAME = 'service-hub-secrets.json';

function secretsPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

async function readStore(): Promise<Record<string, string>> {
  try {
    const buf = await fs.readFile(secretsPath());
    return JSON.parse(buf.toString('utf8'));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeStore(store: Record<string, string>): Promise<void> {
  await fs.mkdir(path.dirname(secretsPath()), { recursive: true });
  await fs.writeFile(secretsPath(), JSON.stringify(store), { mode: 0o600 });
}

export async function setToken(serviceId: string, token: string): Promise<void> {
  const store = await readStore();
  if (safeStorage.isEncryptionAvailable()) {
    store[serviceId] = safeStorage.encryptString(token).toString('base64');
  } else {
    store[serviceId] = `plain:${Buffer.from(token, 'utf8').toString('base64')}`;
  }
  await writeStore(store);
}

export async function getToken(serviceId: string): Promise<string | null> {
  const store = await readStore();
  const value = store[serviceId];
  if (!value) return null;
  if (value.startsWith('plain:')) {
    return Buffer.from(value.slice('plain:'.length), 'base64').toString('utf8');
  }
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

export async function clearToken(serviceId: string): Promise<void> {
  const store = await readStore();
  delete store[serviceId];
  await writeStore(store);
}

export async function listConfiguredServices(): Promise<string[]> {
  const store = await readStore();
  return Object.keys(store);
}
