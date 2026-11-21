import { describe, expect, it } from 'vitest';
import {
  planSync,
  reduceSyncState,
  computeProgress,
  shouldSync,
  buildUploadEnvelope,
  INITIAL_SYNC_STATE,
  type SyncState,
  type SyncPlanOptions,
} from '../cloudSync';
import {
  buildManifest,
  encryptionEnvelope,
  type BackupManifest,
  type EncryptionEnvelope,
  type FileInput,
} from '../cloudBackup';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function file(over: Partial<FileInput> = {}): FileInput {
  return { path: 'a.txt', size: 10, sha256: 'aaa', mtime: 100, ...over };
}

const ENV: EncryptionEnvelope = encryptionEnvelope('iv-x', 32);

/** Build an options object that supplies an envelope for every given path and
 *  a default size. Lets each planSync test focus on the diff classification. */
function opts(
  paths: readonly string[],
  over: Partial<SyncPlanOptions> = {},
): SyncPlanOptions {
  const envelopes = new Map<string, EncryptionEnvelope>();
  const sizes = new Map<string, number>();
  for (const p of paths) {
    envelopes.set(p, ENV);
    sizes.set(p, 100);
  }
  return { chunkSize: 50, sizes, envelopes, ...over };
}

// ---------------------------------------------------------------------------
// buildUploadEnvelope (delegates to cloudBackup.encryptionEnvelope)
// ---------------------------------------------------------------------------

describe('buildUploadEnvelope', () => {
  it('delegates to encryptionEnvelope (same shape)', () => {
    expect(buildUploadEnvelope('iv-a', 16)).toEqual(encryptionEnvelope('iv-a', 16));
  });

  it('throws on empty iv (validation comes from cloudBackup)', () => {
    expect(() => buildUploadEnvelope('', 16)).toThrow(/iv/);
  });

  it('throws on negative encryptedSize', () => {
    expect(() => buildUploadEnvelope('iv', -1)).toThrow(/encryptedSize/);
  });
});

// ---------------------------------------------------------------------------
// planSync
// ---------------------------------------------------------------------------

describe('planSync', () => {
  const makeRemote = (): BackupManifest =>
    buildManifest([
      file({ path: 'same', sha256: 'h-same' }),
      file({ path: 'edit', sha256: 'h-old' }),
      file({ path: 'gone-remote', sha256: 'h-gr' }),
    ]);

  it('queues added + changed as uploads with the right reason', () => {
    const local = buildManifest([
      file({ path: 'same', sha256: 'h-same' }), // unchanged → skipped
      file({ path: 'edit', sha256: 'h-new' }), // changed
      file({ path: 'brand-new', sha256: 'h-bn' }), // added
    ]);
    const plan = planSync(local, makeRemote(), opts(['edit', 'brand-new']));
    expect(plan.uploads.map((u) => u.path)).toEqual(['brand-new', 'edit']);
    const byPath = new Map(plan.uploads.map((u) => [u.path, u.reason]));
    expect(byPath.get('brand-new')).toBe('added');
    expect(byPath.get('edit')).toBe('changed');
  });

  it('puts unchanged paths into skipped (sorted), not uploads', () => {
    const local = buildManifest([
      file({ path: 'b', sha256: 'h' }),
      file({ path: 'a', sha256: 'h2' }),
    ]);
    const remote = buildManifest([
      file({ path: 'b', sha256: 'h' }),
      file({ path: 'a', sha256: 'h2' }),
    ]);
    const plan = planSync(local, remote, opts([]));
    expect(plan.skipped).toEqual(['a', 'b']);
    expect(plan.uploads).toEqual([]);
  });

  it('returns removedLocally as deletion CANDIDATES (never auto-delete)', () => {
    const local = buildManifest([file({ path: 'same', sha256: 'h-same' })]);
    const plan = planSync(local, makeRemote(), opts([]));
    // remote-only: edit, gone-remote → candidates, sorted.
    expect(plan.deletions.map((d) => d.path)).toEqual(['edit', 'gone-remote']);
    for (const d of plan.deletions) {
      expect(d.deletionCandidate).toBe(true);
    }
    // Safety invariant: deletions never appear in the upload queue.
    expect(plan.uploads).toEqual([]);
  });

  it('uploads are sorted by path even when added/changed interleave', () => {
    const remote = buildManifest([file({ path: 'mid', sha256: 'old' })]);
    const local = buildManifest([
      file({ path: 'mid', sha256: 'new' }), // changed
      file({ path: 'zeta', sha256: 'z' }), // added
      file({ path: 'alpha', sha256: 'a' }), // added
    ]);
    const plan = planSync(local, remote, opts(['mid', 'zeta', 'alpha']));
    expect(plan.uploads.map((u) => u.path)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('computes totalBytes as the sum of upload sizes', () => {
    const remote = buildManifest([]);
    const local = buildManifest([
      file({ path: 'a', sha256: '1' }),
      file({ path: 'b', sha256: '2' }),
    ]);
    const sizes = new Map([
      ['a', 30],
      ['b', 70],
    ]);
    const envelopes = new Map([
      ['a', ENV],
      ['b', ENV],
    ]);
    const plan = planSync(local, remote, { chunkSize: 50, sizes, envelopes });
    expect(plan.totalBytes).toBe(100);
    expect(plan.fileCount).toBe(2);
  });

  it('fileCount equals the number of uploads (not skipped/deleted)', () => {
    const local = buildManifest([
      file({ path: 'same', sha256: 'h-same' }), // unchanged
      file({ path: 'new1', sha256: 'n1' }), // added
    ]);
    const plan = planSync(local, makeRemote(), opts(['new1']));
    expect(plan.fileCount).toBe(1);
    expect(plan.fileCount).toBe(plan.uploads.length);
  });

  it('plans chunks per file using chunkSize (size 100 / chunk 50 = 2 chunks)', () => {
    const remote = buildManifest([]);
    const local = buildManifest([file({ path: 'big', sha256: '1' })]);
    const plan = planSync(local, remote, opts(['big'], { chunkSize: 50 }));
    expect(plan.uploads[0]!.chunks).toEqual([
      { index: 0, offset: 0, length: 50 },
      { index: 1, offset: 50, length: 50 },
    ]);
  });

  it('attaches the supplied envelope to each upload', () => {
    const remote = buildManifest([]);
    const local = buildManifest([file({ path: 'x', sha256: '1' })]);
    const custom = encryptionEnvelope('iv-custom', 99);
    const plan = planSync(local, remote, {
      chunkSize: 50,
      sizes: new Map([['x', 100]]),
      envelopes: new Map([['x', custom]]),
    });
    expect(plan.uploads[0]!.envelope).toEqual(custom);
  });

  it('treats missing size as 0 (empty chunk plan, size 0)', () => {
    const remote = buildManifest([]);
    const local = buildManifest([file({ path: 'x', sha256: '1' })]);
    const plan = planSync(local, remote, {
      chunkSize: 50,
      sizes: new Map(), // no size for 'x'
      envelopes: new Map([['x', ENV]]),
    });
    expect(plan.uploads[0]!.size).toBe(0);
    expect(plan.uploads[0]!.chunks).toEqual([]);
    expect(plan.totalBytes).toBe(0);
  });

  it('throws when an upload path has no envelope (cannot decrypt later)', () => {
    const remote = buildManifest([]);
    const local = buildManifest([file({ path: 'x', sha256: '1' })]);
    expect(() =>
      planSync(local, remote, { chunkSize: 50, sizes: new Map([['x', 10]]), envelopes: new Map() }),
    ).toThrow(/envelope/);
  });

  it('empty local + empty remote → everything empty (no work)', () => {
    const plan = planSync(buildManifest([]), buildManifest([]), opts([]));
    expect(plan.uploads).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.deletions).toEqual([]);
    expect(plan.totalBytes).toBe(0);
    expect(plan.fileCount).toBe(0);
  });

  it('empty remote → every local file is an added upload', () => {
    const local = buildManifest([
      file({ path: 'a', sha256: '1' }),
      file({ path: 'b', sha256: '2' }),
    ]);
    const plan = planSync(local, buildManifest([]), opts(['a', 'b']));
    expect(plan.uploads.map((u) => u.reason)).toEqual(['added', 'added']);
    expect(plan.deletions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeProgress
// ---------------------------------------------------------------------------

describe('computeProgress', () => {
  it('returns 0 when total is 0 (no division by zero)', () => {
    expect(computeProgress(0, 0, 0)).toBe(0);
  });

  it('returns 0 when total is negative', () => {
    expect(computeProgress(1, 0, -5)).toBe(0);
  });

  it('returns 0 when total is non-finite', () => {
    expect(computeProgress(1, 0, NaN)).toBe(0);
    expect(computeProgress(1, 0, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('is (completed+failed)/total', () => {
    expect(computeProgress(2, 1, 4)).toBe(0.75);
    expect(computeProgress(1, 0, 4)).toBe(0.25);
  });

  it('clamps to 1 when handled exceeds total', () => {
    expect(computeProgress(5, 1, 4)).toBe(1);
  });

  it('reaches exactly 1 when all handled', () => {
    expect(computeProgress(3, 1, 4)).toBe(1);
  });

  it('clamps to 0 when handled is negative (defensive)', () => {
    // completed=-2, failed=0, total=4 → ratio -0.5 → 0
    expect(computeProgress(-2, 0, 4)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reduceSyncState — state machine
// ---------------------------------------------------------------------------

describe('reduceSyncState', () => {
  it('INITIAL_SYNC_STATE is idle with zeroed counters', () => {
    expect(INITIAL_SYNC_STATE).toEqual({
      phase: 'idle',
      total: 0,
      completed: 0,
      failed: 0,
      progress: 0,
      integrityOk: null,
      retriable: false,
      error: '',
    });
  });

  it('start → scanning, sets total and resets counters', () => {
    const s = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: 3 });
    expect(s.phase).toBe('scanning');
    expect(s.total).toBe(3);
    expect(s.completed).toBe(0);
    expect(s.failed).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.integrityOk).toBeNull();
    expect(s.retriable).toBe(false);
    expect(s.error).toBe('');
  });

  it('start resets stale counters from a prior run', () => {
    const dirty: SyncState = {
      phase: 'error',
      total: 9,
      completed: 5,
      failed: 2,
      progress: 0.7,
      integrityOk: false,
      retriable: true,
      error: 'boom',
    };
    const s = reduceSyncState(dirty, { type: 'start', total: 2 });
    expect(s).toEqual({
      phase: 'scanning',
      total: 2,
      completed: 0,
      failed: 0,
      progress: 0,
      integrityOk: null,
      retriable: false,
      error: '',
    });
  });

  it('start with negative total is a no-op (guard)', () => {
    const s = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: -1 });
    expect(s).toBe(INITIAL_SYNC_STATE);
  });

  it('start with non-finite total is a no-op (guard)', () => {
    expect(reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: NaN })).toBe(
      INITIAL_SYNC_STATE,
    );
    expect(
      reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: Number.POSITIVE_INFINITY }),
    ).toBe(INITIAL_SYNC_STATE);
  });

  it('start with total exactly 0 is accepted (boundary, scanning with total 0)', () => {
    const s = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: 0 });
    expect(s.phase).toBe('scanning');
    expect(s.total).toBe(0);
  });

  it('scan-complete: scanning → encrypting', () => {
    const scanning = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: 2 });
    expect(reduceSyncState(scanning, { type: 'scan-complete' }).phase).toBe('encrypting');
  });

  it('scan-complete is a no-op outside scanning', () => {
    expect(reduceSyncState(INITIAL_SYNC_STATE, { type: 'scan-complete' })).toBe(
      INITIAL_SYNC_STATE,
    );
  });

  it('encrypt-complete: encrypting → uploading', () => {
    let s = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: 2 });
    s = reduceSyncState(s, { type: 'scan-complete' });
    expect(reduceSyncState(s, { type: 'encrypt-complete' }).phase).toBe('uploading');
  });

  it('encrypt-complete is a no-op outside encrypting', () => {
    const scanning = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: 2 });
    expect(reduceSyncState(scanning, { type: 'encrypt-complete' })).toBe(scanning);
  });

  /** Drive the machine to the uploading phase with the given total. */
  function uploading(total: number): SyncState {
    let s = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total });
    s = reduceSyncState(s, { type: 'scan-complete' });
    s = reduceSyncState(s, { type: 'encrypt-complete' });
    return s;
  }

  it('file-uploaded increments completed and updates progress', () => {
    const s = reduceSyncState(uploading(4), { type: 'file-uploaded' });
    expect(s.completed).toBe(1);
    expect(s.phase).toBe('uploading');
    expect(s.progress).toBe(0.25);
  });

  it('file-failed increments failed, sets retriable + error, updates progress', () => {
    const s = reduceSyncState(uploading(4), { type: 'file-failed', reason: 'net down' });
    expect(s.failed).toBe(1);
    expect(s.retriable).toBe(true);
    expect(s.error).toBe('net down');
    expect(s.progress).toBe(0.25);
    expect(s.phase).toBe('uploading'); // not all handled yet
  });

  it('file-failed does NOT drop the file (failed counted, not removed)', () => {
    // Safety: a failure must be recorded as failed (retriable), never silently
    // skipped. After total handled, retriable stays true.
    let s = uploading(1);
    s = reduceSyncState(s, { type: 'file-failed', reason: 'x' });
    expect(s.failed).toBe(1);
    expect(s.retriable).toBe(true);
  });

  it('transitions uploading → verifying when all files handled (completed)', () => {
    let s = uploading(2);
    s = reduceSyncState(s, { type: 'file-uploaded' });
    expect(s.phase).toBe('uploading');
    s = reduceSyncState(s, { type: 'file-uploaded' });
    expect(s.phase).toBe('verifying');
    expect(s.progress).toBe(1);
  });

  it('transitions to verifying via a mix of uploaded + failed', () => {
    let s = uploading(2);
    s = reduceSyncState(s, { type: 'file-uploaded' });
    s = reduceSyncState(s, { type: 'file-failed', reason: 'partial' });
    expect(s.phase).toBe('verifying');
    expect(s.completed).toBe(1);
    expect(s.failed).toBe(1);
  });

  it('total 0: a single file-uploaded would not be expected, stays consistent', () => {
    // With total 0 there are no files; uploading state with no events stays
    // uploading (handled 0 >= total 0 only triggers on an event). Sanity: a
    // stray file-uploaded pushes handled(1) >= 0 → verifying.
    const s = reduceSyncState(uploading(0), { type: 'file-uploaded' });
    expect(s.phase).toBe('verifying');
  });

  it('file-uploaded is a no-op outside uploading', () => {
    const scanning = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: 2 });
    expect(reduceSyncState(scanning, { type: 'file-uploaded' })).toBe(scanning);
  });

  it('file-failed is a no-op outside uploading', () => {
    const scanning = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: 2 });
    expect(reduceSyncState(scanning, { type: 'file-failed', reason: 'x' })).toBe(scanning);
  });

  /** Drive the machine to verifying with the given completed/failed split. */
  function verifying(completed: number, failed: number): SyncState {
    const total = completed + failed;
    let s = uploading(total);
    for (let i = 0; i < completed; i++) s = reduceSyncState(s, { type: 'file-uploaded' });
    for (let i = 0; i < failed; i++) s = reduceSyncState(s, { type: 'file-failed', reason: 'e' });
    expect(s.phase).toBe('verifying');
    return s;
  }

  it('verify-complete ok=true with no failures → done, integrityOk true, not retriable', () => {
    const s = reduceSyncState(verifying(2, 0), { type: 'verify-complete', ok: true });
    expect(s.phase).toBe('done');
    expect(s.integrityOk).toBe(true);
    expect(s.retriable).toBe(false);
    expect(s.error).toBe('');
  });

  it('verify-complete ok=true WITH failures → done but retriable (resend failed)', () => {
    const s = reduceSyncState(verifying(1, 1), { type: 'verify-complete', ok: true });
    expect(s.phase).toBe('done');
    expect(s.integrityOk).toBe(true);
    expect(s.retriable).toBe(true); // a failure happened → still resendable
  });

  it('verify-complete ok=false → error, integrityOk false, retriable, error message', () => {
    const s = reduceSyncState(verifying(2, 0), { type: 'verify-complete', ok: false });
    expect(s.phase).toBe('error');
    expect(s.integrityOk).toBe(false);
    expect(s.retriable).toBe(true);
    expect(s.error).toBe('整合性検証に失敗しました');
  });

  it('verify-complete is a no-op outside verifying', () => {
    const scanning = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: 2 });
    expect(reduceSyncState(scanning, { type: 'verify-complete', ok: true })).toBe(scanning);
  });

  it('abort → error, preserves reason, retriable iff there were failures', () => {
    const noFail = reduceSyncState(uploading(2), { type: 'abort', reason: 'user cancel' });
    expect(noFail.phase).toBe('error');
    expect(noFail.error).toBe('user cancel');
    expect(noFail.retriable).toBe(false);

    let withFail = uploading(2);
    withFail = reduceSyncState(withFail, { type: 'file-failed', reason: 'net' });
    withFail = reduceSyncState(withFail, { type: 'abort', reason: 'stopped' });
    expect(withFail.phase).toBe('error');
    expect(withFail.error).toBe('stopped');
    expect(withFail.retriable).toBe(true);
  });

  it('reset → INITIAL_SYNC_STATE from any phase', () => {
    const dirty = verifying(1, 1);
    expect(reduceSyncState(dirty, { type: 'reset' })).toBe(INITIAL_SYNC_STATE);
  });
});

// ---------------------------------------------------------------------------
// shouldSync — scheduler
// ---------------------------------------------------------------------------

describe('shouldSync', () => {
  it('first sync (lastSync null) triggers only when dirty', () => {
    expect(shouldSync(1000, null, 5000, true)).toBe(true);
    expect(shouldSync(1000, null, 5000, false)).toBe(false);
  });

  it('triggers when dirty even if interval has not elapsed', () => {
    expect(shouldSync(1000, 900, 5000, true)).toBe(true);
  });

  it('triggers on interval elapse even when not dirty', () => {
    // elapsed 6000 >= interval 5000
    expect(shouldSync(7000, 1000, 5000, false)).toBe(true);
  });

  it('does NOT trigger when clean and interval not elapsed', () => {
    // elapsed 1000 < interval 5000
    expect(shouldSync(2000, 1000, 5000, false)).toBe(false);
  });

  it('interval boundary: elapsed exactly == interval triggers (>=)', () => {
    expect(shouldSync(6000, 1000, 5000, false)).toBe(true);
  });

  it('interval boundary: elapsed one below interval does not trigger', () => {
    expect(shouldSync(5999, 1000, 5000, false)).toBe(false);
  });

  it('intervalMs <= 0 disables interval trigger (dirty-only)', () => {
    expect(shouldSync(99999, 1000, 0, false)).toBe(false);
    expect(shouldSync(99999, 1000, -1, false)).toBe(false);
    expect(shouldSync(99999, 1000, 0, true)).toBe(true); // still triggers on dirty
  });

  it('non-finite now → false (no misfire)', () => {
    expect(shouldSync(NaN, 1000, 5000, true)).toBe(false);
    expect(shouldSync(Number.POSITIVE_INFINITY, 1000, 5000, true)).toBe(false);
  });

  it('non-finite intervalMs → false', () => {
    expect(shouldSync(7000, 1000, NaN, true)).toBe(false);
    expect(shouldSync(7000, 1000, Number.POSITIVE_INFINITY, false)).toBe(false);
  });

  it('non-finite lastSync (not null) → false', () => {
    expect(shouldSync(7000, NaN, 5000, true)).toBe(false);
    expect(shouldSync(7000, Number.POSITIVE_INFINITY, 5000, true)).toBe(false);
  });

  it('lastSync in the future (negative elapsed) does not interval-trigger', () => {
    // now < lastSync → elapsed negative → interval not elapsed; clean → false
    expect(shouldSync(500, 1000, 5000, false)).toBe(false);
    // but dirty still triggers
    expect(shouldSync(500, 1000, 5000, true)).toBe(true);
  });
});
