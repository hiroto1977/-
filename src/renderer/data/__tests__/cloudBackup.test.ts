import { describe, expect, it } from 'vitest';
import {
  BACKUP_CIPHER_ALGO,
  BACKUP_IV_LENGTH,
  BACKUP_KEY_DERIVATION,
  MANIFEST_VERSION,
  buildManifest,
  diffManifests,
  encryptionEnvelope,
  nextVersion,
  planChunks,
  treeHashInput,
  verifyIntegrity,
  verifyManifest,
  type BackupEntry,
  type BackupManifest,
  type FileInput,
} from '../cloudBackup';

function entry(over: Partial<BackupEntry> = {}): BackupEntry {
  return {
    path: 'a.txt',
    size: 10,
    sha256: 'aaa',
    version: 1,
    chunkRefs: [],
    encryptedSize: 0,
    mtime: 100,
    ...over,
  };
}

function file(over: Partial<FileInput> = {}): FileInput {
  return { path: 'a.txt', size: 10, sha256: 'aaa', mtime: 100, ...over };
}

describe('cloudBackup constants', () => {
  it('pins AES-GCM cipher algo', () => {
    expect(BACKUP_CIPHER_ALGO).toBe('AES-GCM');
  });
  it('pins IV length to 12 bytes (matches vault)', () => {
    expect(BACKUP_IV_LENGTH).toBe(12);
  });
  it('pins key derivation reference', () => {
    expect(BACKUP_KEY_DERIVATION).toBe('PBKDF2-SHA-256-600k');
  });
  it('pins manifest schema version', () => {
    expect(MANIFEST_VERSION).toBe(1);
  });
});

describe('encryptionEnvelope', () => {
  it('builds an envelope with the pinned algo/iv-length/key-derivation', () => {
    const env = encryptionEnvelope('iv-base64', 64);
    expect(env).toEqual({
      algo: 'AES-GCM',
      ivLength: 12,
      keyDerivation: 'PBKDF2-SHA-256-600k',
      iv: 'iv-base64',
      encryptedSize: 64,
    });
  });

  it('accepts encryptedSize of exactly 0 (empty ciphertext boundary)', () => {
    expect(encryptionEnvelope('iv', 0).encryptedSize).toBe(0);
  });

  it('throws on empty iv', () => {
    expect(() => encryptionEnvelope('', 10)).toThrow(/iv/);
  });

  it('throws on non-string iv', () => {
    expect(() => encryptionEnvelope(123 as unknown as string, 10)).toThrow(/iv/);
  });

  it('throws on negative encryptedSize', () => {
    expect(() => encryptionEnvelope('iv', -1)).toThrow(/encryptedSize/);
  });

  it('throws on non-finite encryptedSize', () => {
    expect(() => encryptionEnvelope('iv', Number.POSITIVE_INFINITY)).toThrow(/encryptedSize/);
    expect(() => encryptionEnvelope('iv', NaN)).toThrow(/encryptedSize/);
  });
});

describe('planChunks', () => {
  it('returns empty plan for zero size (nothing to upload)', () => {
    expect(planChunks(0, 100)).toEqual([]);
  });

  it('splits an exact multiple into equal full chunks', () => {
    expect(planChunks(300, 100)).toEqual([
      { index: 0, offset: 0, length: 100 },
      { index: 1, offset: 100, length: 100 },
      { index: 2, offset: 200, length: 100 },
    ]);
  });

  it('puts the remainder in the last chunk (fraction boundary)', () => {
    expect(planChunks(250, 100)).toEqual([
      { index: 0, offset: 0, length: 100 },
      { index: 1, offset: 100, length: 100 },
      { index: 2, offset: 200, length: 50 },
    ]);
  });

  it('produces a single short chunk when size < chunkSize', () => {
    expect(planChunks(30, 100)).toEqual([{ index: 0, offset: 0, length: 30 }]);
  });

  it('produces a single exact chunk when size === chunkSize', () => {
    expect(planChunks(100, 100)).toEqual([{ index: 0, offset: 0, length: 100 }]);
  });

  it('size === chunkSize + 1 yields two chunks (off-by-one boundary)', () => {
    expect(planChunks(101, 100)).toEqual([
      { index: 0, offset: 0, length: 100 },
      { index: 1, offset: 100, length: 1 },
    ]);
  });

  it('chunks are contiguous and cover exactly the whole size', () => {
    const plans = planChunks(250, 100);
    let cursor = 0;
    let covered = 0;
    for (const p of plans) {
      expect(p.offset).toBe(cursor);
      expect(p.length).toBeGreaterThan(0);
      cursor += p.length;
      covered += p.length;
    }
    expect(covered).toBe(250);
  });

  it('throws on chunkSize <= 0 (zero/negative guard)', () => {
    expect(() => planChunks(100, 0)).toThrow(/chunkSize/);
    expect(() => planChunks(100, -5)).toThrow(/chunkSize/);
  });

  it('throws on non-finite chunkSize', () => {
    expect(() => planChunks(100, NaN)).toThrow(/chunkSize/);
    expect(() => planChunks(100, Number.POSITIVE_INFINITY)).toThrow(/chunkSize/);
  });

  it('throws on negative or non-finite size', () => {
    expect(() => planChunks(-1, 100)).toThrow(/size/);
    expect(() => planChunks(NaN, 100)).toThrow(/size/);
    expect(() => planChunks(Number.POSITIVE_INFINITY, 100)).toThrow(/size/);
  });
});

describe('nextVersion', () => {
  it('increments a valid version by 1', () => {
    expect(nextVersion(entry({ version: 1 }))).toBe(2);
    expect(nextVersion(entry({ version: 7 }))).toBe(8);
  });

  it('resets to 1 when version < 1 (boundary)', () => {
    expect(nextVersion(entry({ version: 0 }))).toBe(1);
    expect(nextVersion(entry({ version: -3 }))).toBe(1);
  });

  it('resets to 1 when version is non-integer', () => {
    expect(nextVersion(entry({ version: 1.5 }))).toBe(1);
    expect(nextVersion(entry({ version: NaN }))).toBe(1);
    expect(nextVersion(entry({ version: Number.POSITIVE_INFINITY }))).toBe(1);
  });

  it('is monotonic across repeated bumps (no collision)', () => {
    let e = entry({ version: 1 });
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const v = nextVersion(e);
      expect(seen.has(v)).toBe(false);
      seen.add(v);
      e = entry({ version: v });
    }
    expect([...seen]).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('treeHashInput', () => {
  it('joins path/sha256/version per entry with newlines', () => {
    const e1 = entry({ path: 'a', sha256: 'h1', version: 1 });
    const e2 = entry({ path: 'b', sha256: 'h2', version: 3 });
    expect(treeHashInput([e1, e2])).toBe('a h1 1\nb h2 3');
  });

  it('returns empty string for no entries', () => {
    expect(treeHashInput([])).toBe('');
  });

  it('is sensitive to version (detects version drift)', () => {
    const a = treeHashInput([entry({ version: 1 })]);
    const b = treeHashInput([entry({ version: 2 })]);
    expect(a).not.toBe(b);
  });

  it('is sensitive to sha256 (detects content change)', () => {
    const a = treeHashInput([entry({ sha256: 'x' })]);
    const b = treeHashInput([entry({ sha256: 'y' })]);
    expect(a).not.toBe(b);
  });

  it('is sensitive to path (detects mislabel)', () => {
    const a = treeHashInput([entry({ path: 'p1' })]);
    const b = treeHashInput([entry({ path: 'p2' })]);
    expect(a).not.toBe(b);
  });
});

describe('buildManifest', () => {
  it('builds entries with version 1 for a fresh tree', () => {
    const m = buildManifest([file({ path: 'a' }), file({ path: 'b', sha256: 'bbb' })]);
    expect(m.version).toBe(1);
    expect(m.entries.map((e) => e.version)).toEqual([1, 1]);
  });

  it('sorts entries by path ascending (deterministic)', () => {
    const m = buildManifest([
      file({ path: 'z', sha256: 'z' }),
      file({ path: 'a', sha256: 'a' }),
      file({ path: 'm', sha256: 'm' }),
    ]);
    expect(m.entries.map((e) => e.path)).toEqual(['a', 'm', 'z']);
  });

  it('computes treeHash from sorted entries', () => {
    const m = buildManifest([file({ path: 'b', sha256: 'hb' }), file({ path: 'a', sha256: 'ha' })]);
    expect(m.treeHash).toBe('a ha 1\nb hb 1');
  });

  it('empty input yields empty entries and empty treeHash', () => {
    const m = buildManifest([]);
    expect(m.entries).toEqual([]);
    expect(m.treeHash).toBe('');
  });

  it('initializes chunkRefs empty and encryptedSize 0', () => {
    const m = buildManifest([file()]);
    expect(m.entries[0]!.chunkRefs).toEqual([]);
    expect(m.entries[0]!.encryptedSize).toBe(0);
  });

  it('preserves size and mtime', () => {
    const m = buildManifest([file({ size: 42, mtime: 999 })]);
    expect(m.entries[0]!.size).toBe(42);
    expect(m.entries[0]!.mtime).toBe(999);
  });

  describe('versioning against a prior manifest', () => {
    const prior: BackupManifest = buildManifest([
      file({ path: 'keep', sha256: 'same' }),
      file({ path: 'edit', sha256: 'old', mtime: 1 }),
    ]);

    it('keeps version when sha256 unchanged (no wasteful bump)', () => {
      const m = buildManifest([file({ path: 'keep', sha256: 'same' })], prior);
      expect(m.entries[0]!.version).toBe(1);
    });

    it('bumps version when sha256 changed', () => {
      const m = buildManifest([file({ path: 'edit', sha256: 'new', mtime: 2 })], prior);
      expect(m.entries[0]!.version).toBe(2);
    });

    it('starts new paths at version 1', () => {
      const m = buildManifest([file({ path: 'fresh', sha256: 'f' })], prior);
      expect(m.entries[0]!.version).toBe(1);
    });

    it('bumps from a higher prior version monotonically', () => {
      const p2 = buildManifest([file({ path: 'edit', sha256: 'new', mtime: 2 })], prior); // v2
      const m = buildManifest([file({ path: 'edit', sha256: 'newer', mtime: 3 })], p2);
      expect(m.entries[0]!.version).toBe(3);
    });
  });

  describe('guards', () => {
    it('throws on empty path', () => {
      expect(() => buildManifest([file({ path: '' })])).toThrow(/path/);
    });

    it('throws on duplicate path', () => {
      expect(() =>
        buildManifest([file({ path: 'dup', sha256: '1' }), file({ path: 'dup', sha256: '2' })]),
      ).toThrow(/重複/);
    });

    it('throws on negative size', () => {
      expect(() => buildManifest([file({ size: -1 })])).toThrow(/size/);
    });

    it('throws on non-finite size', () => {
      expect(() => buildManifest([file({ size: NaN })])).toThrow(/size/);
      expect(() => buildManifest([file({ size: Number.POSITIVE_INFINITY })])).toThrow(/size/);
    });

    it('throws on empty sha256', () => {
      expect(() => buildManifest([file({ sha256: '' })])).toThrow(/sha256/);
    });

    it('throws on negative mtime', () => {
      expect(() => buildManifest([file({ mtime: -1 })])).toThrow(/mtime/);
    });

    it('throws on non-finite mtime', () => {
      expect(() => buildManifest([file({ mtime: NaN })])).toThrow(/mtime/);
    });

    it('accepts size 0 and mtime 0 (boundary, not an error)', () => {
      const m = buildManifest([file({ size: 0, mtime: 0 })]);
      expect(m.entries[0]!.size).toBe(0);
      expect(m.entries[0]!.mtime).toBe(0);
    });
  });
});

describe('diffManifests', () => {
  const remote = buildManifest([
    file({ path: 'same', sha256: 'h-same' }),
    file({ path: 'edit', sha256: 'h-old' }),
    file({ path: 'gone-remote', sha256: 'h-gr' }),
  ]);

  it('classifies added / changed / unchanged / removedLocally', () => {
    const local = buildManifest([
      file({ path: 'same', sha256: 'h-same' }), // unchanged
      file({ path: 'edit', sha256: 'h-new' }), // changed
      file({ path: 'brand-new', sha256: 'h-bn' }), // added
    ]);
    const d = diffManifests(local, remote);
    expect(d.added.map((x) => x.path)).toEqual(['brand-new']);
    expect(d.changed.map((x) => x.path)).toEqual(['edit']);
    expect(d.unchanged.map((x) => x.path)).toEqual(['same']);
    expect(d.removedLocally.map((x) => x.path)).toEqual(['gone-remote']);
  });

  it('marks removedLocally as deletionCandidate=true (no auto-delete)', () => {
    const local = buildManifest([file({ path: 'same', sha256: 'h-same' })]);
    const d = diffManifests(local, remote);
    for (const r of d.removedLocally) {
      expect(r.deletionCandidate).toBe(true);
      expect(r.kind).toBe('removedLocally');
    }
  });

  it('never marks added/changed/unchanged as deletionCandidate', () => {
    const local = buildManifest([
      file({ path: 'same', sha256: 'h-same' }),
      file({ path: 'edit', sha256: 'h-new' }),
      file({ path: 'brand-new', sha256: 'h-bn' }),
    ]);
    const d = diffManifests(local, remote);
    for (const x of [...d.added, ...d.changed, ...d.unchanged]) {
      expect(x.deletionCandidate).toBe(false);
    }
  });

  it('toUpload = added + changed paths only (sorted)', () => {
    const local = buildManifest([
      file({ path: 'same', sha256: 'h-same' }),
      file({ path: 'edit', sha256: 'h-new' }),
      file({ path: 'zeta', sha256: 'z' }),
      file({ path: 'alpha', sha256: 'a' }),
    ]);
    const d = diffManifests(local, remote);
    expect(d.toUpload).toEqual(['alpha', 'edit', 'zeta']);
  });

  it('identical manifests → all unchanged, nothing to upload, nothing removed', () => {
    const d = diffManifests(remote, remote);
    expect(d.added).toEqual([]);
    expect(d.changed).toEqual([]);
    expect(d.removedLocally).toEqual([]);
    expect(d.unchanged.map((x) => x.path)).toEqual(['edit', 'gone-remote', 'same']);
    expect(d.toUpload).toEqual([]);
  });

  it('empty remote → every local entry is added', () => {
    const local = buildManifest([file({ path: 'x', sha256: '1' }), file({ path: 'y', sha256: '2' })]);
    const d = diffManifests(local, buildManifest([]));
    expect(d.added.map((x) => x.path)).toEqual(['x', 'y']);
    expect(d.removedLocally).toEqual([]);
  });

  it('empty local → every remote entry is a removal candidate (not deleted)', () => {
    const d = diffManifests(buildManifest([]), remote);
    expect(d.removedLocally.map((x) => x.path)).toEqual(['edit', 'gone-remote', 'same']);
    expect(d.removedLocally.every((x) => x.deletionCandidate)).toBe(true);
    expect(d.toUpload).toEqual([]);
  });

  it('result lists are sorted by path', () => {
    const local = buildManifest([
      file({ path: 'c', sha256: '1' }),
      file({ path: 'a', sha256: '2' }),
      file({ path: 'b', sha256: '3' }),
    ]);
    const d = diffManifests(local, buildManifest([]));
    expect(d.added.map((x) => x.path)).toEqual(['a', 'b', 'c']);
  });
});

describe('verifyIntegrity', () => {
  it('ok when actual sha matches', () => {
    const r = verifyIntegrity(entry({ sha256: 'good' }), 'good');
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('');
  });

  it('fails when actual sha differs (tamper/corruption)', () => {
    const r = verifyIntegrity(entry({ path: 'p', sha256: 'good' }), 'bad');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('p');
    expect(r.reason).toContain('不一致');
  });

  it('fails (not passes) when actual sha is empty', () => {
    const r = verifyIntegrity(entry({ sha256: '' }), '');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('検証不能');
  });

  it('fails when actualSha is empty even if entry.sha256 is also empty (no false-equal pass)', () => {
    // Guards against a mutant that drops the empty-string check and lets ''==='' pass.
    const r = verifyIntegrity(entry({ sha256: '' }), '');
    expect(r.ok).toBe(false);
  });
});

describe('verifyManifest', () => {
  const good = buildManifest([
    file({ path: 'a', sha256: 'ha' }),
    file({ path: 'b', sha256: 'hb' }),
  ]);

  it('ok for a well-formed manifest with no per-file shas given', () => {
    expect(verifyManifest(good)).toEqual({ ok: true, reason: '' });
  });

  it('ok for empty manifest (nothing to back up)', () => {
    expect(verifyManifest(buildManifest([])).ok).toBe(true);
  });

  it('fails when treeHash does not match entries (structural tamper)', () => {
    const tampered: BackupManifest = { ...good, treeHash: 'WRONG' };
    const r = verifyManifest(tampered);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('treeHash');
  });

  it('fails when empty manifest carries a non-empty treeHash', () => {
    const tampered: BackupManifest = { version: 1, entries: [], treeHash: 'X' };
    expect(verifyManifest(tampered).ok).toBe(false);
  });

  it('ok when all provided per-file shas match', () => {
    const shas = new Map([
      ['a', 'ha'],
      ['b', 'hb'],
    ]);
    expect(verifyManifest(good, shas).ok).toBe(true);
  });

  it('fails when a provided per-file sha mismatches', () => {
    const shas = new Map([['a', 'WRONG']]);
    const r = verifyManifest(good, shas);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('a');
  });

  it('skips per-file check for paths not present in actualShas map', () => {
    const shas = new Map([['b', 'hb']]); // 'a' omitted → skipped, not failed
    expect(verifyManifest(good, shas).ok).toBe(true);
  });

  it('empty actualShas map performs structural check only (no per-file failures)', () => {
    expect(verifyManifest(good, new Map()).ok).toBe(true);
  });
});
