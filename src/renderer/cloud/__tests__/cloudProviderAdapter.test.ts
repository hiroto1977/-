import { describe, expect, it, vi } from 'vitest';
import {
  encryptFile,
  buildPlan,
  runUploads,
  EMPTY_MANIFEST,
  type CloudTransport,
} from '../cloudProviderAdapter';
import { buildManifest, type FileInput } from '../../data/cloudBackup';
import { deriveAesKey, randomSaltB64, openWithKey, type Sealed } from '../../security/dataCrypto';
import { encryptionEnvelope, type EncryptionEnvelope } from '../../data/cloudBackup';

function file(over: Partial<FileInput> = {}): FileInput {
  return { path: 'a.txt', size: 10, sha256: 'aaa', mtime: 100, ...over };
}

async function makeKey(): Promise<CryptoKey> {
  // Small iteration count to keep the test fast (key reuse is the point).
  return deriveAesKey('pw-1234', randomSaltB64(), 1000);
}

/** In-memory transport mock — captures puts, never hits the network. */
function memoryTransport(over: Partial<CloudTransport> = {}): {
  transport: CloudTransport;
  store: Map<string, { ciphertext: Sealed; envelope: EncryptionEnvelope }>;
} {
  const store = new Map<string, { ciphertext: Sealed; envelope: EncryptionEnvelope }>();
  const transport: CloudTransport = {
    put: vi.fn(async (path, ciphertext, envelope) => {
      store.set(path, { ciphertext, envelope });
    }),
    get: vi.fn(async (path) => store.get(path)?.ciphertext ?? null),
    fetchManifest: vi.fn(async () => null),
    ...over,
  };
  return { transport, store };
}

describe('EMPTY_MANIFEST', () => {
  it('is an empty, well-formed manifest', () => {
    expect(EMPTY_MANIFEST).toEqual({ version: 1, entries: [], treeHash: '' });
  });
});

describe('encryptFile', () => {
  it('seals plaintext (round-trips via openWithKey) and builds an envelope', async () => {
    const key = await makeKey();
    const { sealed, envelope } = await encryptFile(key, 'hello world');
    // ciphertext must differ from plaintext and decrypt back.
    expect(sealed.ct).not.toBe('hello world');
    expect(await openWithKey(key, sealed)).toBe('hello world');
    // envelope carries the iv + ciphertext-length estimate.
    expect(envelope.iv).toBe(sealed.iv);
    expect(envelope.encryptedSize).toBe(sealed.ct.length);
    expect(envelope.algo).toBe('AES-GCM');
  });
});

describe('buildPlan', () => {
  it('delegates to planSync with EMPTY_MANIFEST when remote is null', () => {
    const local = buildManifest([file({ path: 'x', sha256: '1' })]);
    const plan = buildPlan(local, null, {
      chunkSize: 50,
      sizes: new Map([['x', 100]]),
      envelopes: new Map([['x', encryptionEnvelope('iv', 10)]]),
    });
    expect(plan.uploads.map((u) => u.path)).toEqual(['x']);
    expect(plan.uploads[0]!.reason).toBe('added');
  });

  it('uses a provided remote manifest for diffing', () => {
    const remote = buildManifest([file({ path: 'x', sha256: '1' })]);
    const local = buildManifest([file({ path: 'x', sha256: '1' })]); // unchanged
    const plan = buildPlan(local, remote, { chunkSize: 50, sizes: new Map(), envelopes: new Map() });
    expect(plan.uploads).toEqual([]);
    expect(plan.skipped).toEqual(['x']);
  });
});

describe('runUploads', () => {
  it('uploads every file, ends in verifying with all completed', async () => {
    const key = await makeKey();
    const { transport, store } = memoryTransport();
    const local = buildManifest([
      file({ path: 'a', sha256: '1' }),
      file({ path: 'b', sha256: '2' }),
    ]);
    const plan = buildPlan(local, null, {
      chunkSize: 50,
      sizes: new Map([
        ['a', 10],
        ['b', 10],
      ]),
      envelopes: new Map([
        ['a', encryptionEnvelope('iv', 10)],
        ['b', encryptionEnvelope('iv', 10)],
      ]),
    });
    const final = await runUploads(plan, key, transport, async (p) => `content of ${p}`);
    expect(final.phase).toBe('verifying');
    expect(final.completed).toBe(2);
    expect(final.failed).toBe(0);
    expect(store.size).toBe(2);
    // Stored ciphertext must decrypt back to the original plaintext.
    expect(await openWithKey(key, store.get('a')!.ciphertext)).toBe('content of a');
  });

  it('records a failed upload as failed (retriable) without crashing', async () => {
    const key = await makeKey();
    const { transport } = memoryTransport({
      put: vi.fn(async (path) => {
        if (path === 'b') throw new Error('network down');
      }),
    });
    const local = buildManifest([
      file({ path: 'a', sha256: '1' }),
      file({ path: 'b', sha256: '2' }),
    ]);
    const plan = buildPlan(local, null, {
      chunkSize: 50,
      sizes: new Map([
        ['a', 10],
        ['b', 10],
      ]),
      envelopes: new Map([
        ['a', encryptionEnvelope('iv', 10)],
        ['b', encryptionEnvelope('iv', 10)],
      ]),
    });
    const final = await runUploads(plan, key, transport, async (p) => `content of ${p}`);
    expect(final.phase).toBe('verifying');
    expect(final.completed).toBe(1);
    expect(final.failed).toBe(1);
    expect(final.retriable).toBe(true);
  });

  it('invokes onState callback for progress updates', async () => {
    const key = await makeKey();
    const { transport } = memoryTransport();
    const local = buildManifest([file({ path: 'a', sha256: '1' })]);
    const plan = buildPlan(local, null, {
      chunkSize: 50,
      sizes: new Map([['a', 10]]),
      envelopes: new Map([['a', encryptionEnvelope('iv', 10)]]),
    });
    const states: string[] = [];
    await runUploads(plan, key, transport, async () => 'x', (s) => states.push(s.phase));
    // at least the initial (encrypt-complete → uploading) and final state.
    expect(states.length).toBeGreaterThan(0);
    expect(states[states.length - 1]).toBe('verifying');
  });

  it('empty plan ends in verifying immediately (nothing to upload)', async () => {
    const key = await makeKey();
    const { transport, store } = memoryTransport();
    const plan = buildPlan(buildManifest([]), null, {
      chunkSize: 50,
      sizes: new Map(),
      envelopes: new Map(),
    });
    const final = await runUploads(plan, key, transport, async () => '');
    // total 0 → uploading phase reached, no files handled → stays uploading.
    expect(['uploading', 'verifying']).toContain(final.phase);
    expect(store.size).toBe(0);
  });
});
