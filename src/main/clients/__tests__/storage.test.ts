import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildStorageSnapshot,
  classifyFolderCategory,
  countNumericEntries,
  diskCandidatesFor,
  fetchStorageSnapshot,
  measureDir,
  parseProcMounts,
  trashDirFor,
  WALK_ENTRY_BUDGET,
  CACHE_CLEANUP_MIN_BYTES,
  DOWNLOADS_CLEANUP_MIN_BYTES,
  LARGE_FOLDER_MIN_BYTES,
  TRASH_CLEANUP_MIN_BYTES,
  type RawFolderReading,
  type RawStorageReadings,
} from '../storage';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

const base: RawStorageReadings = {
  platform: 'linux',
  disks: [],
  folders: [],
  trashSizeBytes: null,
  totalMemBytes: 16 * GiB,
  freeMemBytes: 4 * GiB,
  processCount: 210,
};

const folder = (over: Partial<RawFolderReading>): RawFolderReading => ({
  path: '/home/u/Documents',
  sizeBytes: 0,
  fileCount: 0,
  category: 'user',
  truncated: false,
  ...over,
});

describe('classifyFolderCategory', () => {
  it('classifies by exact folder name', () => {
    expect(classifyFolderCategory('Downloads')).toBe('downloads');
    expect(classifyFolderCategory('ダウンロード')).toBe('downloads');
    expect(classifyFolderCategory('.cache')).toBe('cache');
    expect(classifyFolderCategory('.config')).toBe('app');
    expect(classifyFolderCategory('Documents')).toBe('user');
    expect(classifyFolderCategory('downloads')).toBe('user');
  });
});

describe('parseProcMounts', () => {
  it('keeps only real filesystems and labels the root as システム', () => {
    const text = [
      'proc /proc proc rw,nosuid 0 0',
      'tmpfs /run tmpfs rw 0 0',
      '/dev/sda2 / ext4 rw,relatime 0 1',
      '/dev/sda1 /boot/efi vfat rw 0 2',
    ].join('\n');
    expect(parseProcMounts(text)).toEqual([
      { mount: '/', label: 'システム' },
      { mount: '/boot/efi', label: 'efi' },
    ]);
  });

  it('excludes snap mounts, dedupes, and unescapes spaces', () => {
    const text = [
      '/dev/sdb1 /media/My\\040Passport exfat rw 0 0',
      '/dev/loop0 /snap/core/123 squashfs ro 0 0',
      '/dev/sdb1 /media/My\\040Passport exfat rw 0 0',
    ].join('\n');
    expect(parseProcMounts(text)).toEqual([{ mount: '/media/My Passport', label: 'My Passport' }]);
  });

  it('skips malformed lines and empty input', () => {
    expect(parseProcMounts('')).toEqual([]);
    expect(parseProcMounts('garbage\n/dev/x /data xfs rw 0 0')).toEqual([
      { mount: '/data', label: 'data' },
    ]);
  });

  it('keeps every real filesystem type in the REAL_FS table', () => {
    const types = [
      'ext2',
      'ext3',
      'ext4',
      'xfs',
      'btrfs',
      'f2fs',
      'vfat',
      'exfat',
      'ntfs',
      'ntfs3',
      'zfs',
    ];
    const text = types.map((t, i) => `/dev/sd${i} /mnt/${t} ${t} rw 0 0`).join('\n');
    expect(parseProcMounts(text).map((m) => m.mount)).toEqual(types.map((t) => `/mnt/${t}`));
  });

  it('tolerates leading whitespace and repeated spaces between fields', () => {
    const text = [
      '  /dev/sda1 /lead ext4 rw 0 0',
      '/dev/sda2 /wide  ext4 rw 0 0',
      '\t/dev/sda3 /tabbed ext4 rw 0 0',
    ].join('\n');
    expect(parseProcMounts(text)).toEqual([
      { mount: '/lead', label: 'lead' },
      { mount: '/wide', label: 'wide' },
      { mount: '/tabbed', label: 'tabbed' },
    ]);
  });

  it('accepts a line with exactly three fields', () => {
    expect(parseProcMounts('dev /mnt3 ext4')).toEqual([{ mount: '/mnt3', label: 'mnt3' }]);
  });

  it('decodes the \\011 (tab) escape in mount points as well as \\040', () => {
    expect(parseProcMounts('/dev/sdb1 /media/Tab\\011Name ext4 rw 0 0')).toEqual([
      { mount: '/media/Tab\tName', label: 'Tab\tName' },
    ]);
  });

  it('excludes snap mounts even when they carry a real filesystem type', () => {
    const text = [
      '/dev/sda1 / ext4 rw 0 0',
      '/dev/loop0 /snap/core/123 ext4 ro 0 0',
      '/dev/loop1 /snap ext4 ro 0 0',
    ].join('\n');
    expect(parseProcMounts(text)).toEqual([{ mount: '/', label: 'システム' }]);
  });
});

describe('buildStorageSnapshot — disks', () => {
  it('computes totals, used and usage pct from raw bytes', () => {
    const snap = buildStorageSnapshot({
      ...base,
      disks: [{ mount: '/', label: 'システム', totalBytes: 100 * GiB, freeBytes: 25 * GiB }],
    });
    expect(snap.disks).toEqual([
      { mount: '/', label: 'システム', totalGb: 100, usedGb: 75, freeGb: 25, usagePct: 75 },
    ]);
  });

  it('rounds usage pct to 1 decimal and drops zero-total disks', () => {
    const snap = buildStorageSnapshot({
      ...base,
      disks: [
        { mount: '/zero', label: 'z', totalBytes: 0, freeBytes: 0 },
        { mount: '/data', label: 'data', totalBytes: 3 * GiB, freeBytes: 1 * GiB },
      ],
    });
    expect(snap.disks).toHaveLength(1);
    expect(snap.disks[0]?.usagePct).toBe(66.7);
  });

  it('clamps usedGb at 0 when free exceeds total', () => {
    const snap = buildStorageSnapshot({
      ...base,
      disks: [{ mount: '/', label: 'x', totalBytes: 10 * GiB, freeBytes: 12 * GiB }],
    });
    expect(snap.disks[0]?.usedGb).toBe(0);
  });
});

describe('buildStorageSnapshot — largeFolders', () => {
  it('filters by the minimum size (boundary inclusive), sorts desc, caps at 8', () => {
    const folders = [
      folder({ path: '/h/small', sizeBytes: LARGE_FOLDER_MIN_BYTES - 1 }),
      folder({ path: '/h/exact', sizeBytes: LARGE_FOLDER_MIN_BYTES, fileCount: 3 }),
      ...Array.from({ length: 9 }, (_, i) =>
        folder({ path: `/h/f${i}`, sizeBytes: (i + 2) * GiB, fileCount: i }),
      ),
    ];
    const snap = buildStorageSnapshot({ ...base, folders });
    expect(snap.largeFolders).toHaveLength(8);
    expect(snap.largeFolders[0]).toEqual({
      path: '/h/f8',
      sizeGb: 10,
      fileCount: 8,
      category: 'user',
    });
    expect(snap.largeFolders.some((f) => f.path === '/h/small')).toBe(false);
    expect(snap.largeFolders.some((f) => f.path === '/h/exact')).toBe(false);
  });

  it('includes a folder at exactly the minimum size', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [folder({ path: '/h/exact', sizeBytes: LARGE_FOLDER_MIN_BYTES, fileCount: 3 })],
    });
    expect(snap.largeFolders).toEqual([
      { path: '/h/exact', sizeGb: 0.01, fileCount: 3, category: 'user' },
    ]);
  });

  it('breaks size ties by path ascending for determinism', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({ path: '/h/b', sizeBytes: 2 * GiB }),
        folder({ path: '/h/a', sizeBytes: 2 * GiB }),
      ],
    });
    expect(snap.largeFolders.map((f) => f.path)).toEqual(['/h/a', '/h/b']);
  });

  it('keeps ascending path order when the input is already sorted', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({ path: '/h/a', sizeBytes: 2 * GiB }),
        folder({ path: '/h/b', sizeBytes: 2 * GiB }),
      ],
    });
    expect(snap.largeFolders.map((f) => f.path)).toEqual(['/h/a', '/h/b']);
  });

  it('orders three or more size ties strictly by path', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({ path: '/h/c', sizeBytes: 2 * GiB }),
        folder({ path: '/h/a', sizeBytes: 2 * GiB }),
        folder({ path: '/h/b', sizeBytes: 2 * GiB }),
      ],
    });
    expect(snap.largeFolders.map((f) => f.path)).toEqual(['/h/a', '/h/b', '/h/c']);
  });

  it('keeps input order for folders with identical path and size (stable tie)', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({ path: '/h/x', sizeBytes: 2 * GiB, fileCount: 3 }),
        folder({ path: '/h/x', sizeBytes: 2 * GiB, fileCount: 5 }),
      ],
    });
    expect(snap.largeFolders.map((f) => f.fileCount)).toEqual([3, 5]);
  });

  it('sorts a long list of size ties by path before capping at the top N', () => {
    const paths = Array.from({ length: 40 }, (_, i) => `/h/p${String(i).padStart(2, '0')}`);
    const snap = buildStorageSnapshot({
      ...base,
      folders: [...paths].reverse().map((p) => folder({ path: p, sizeBytes: 2 * GiB })),
    });
    expect(snap.largeFolders.map((f) => f.path)).toEqual(paths.slice(0, 8));
  });

  it('does not let below-minimum folders into the list when few folders qualify', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({ path: '/h/big', sizeBytes: 2 * GiB }),
        folder({ path: '/h/small1', sizeBytes: 5 * MiB }),
        folder({ path: '/h/small2', sizeBytes: 1 * MiB }),
      ],
    });
    expect(snap.largeFolders.map((f) => f.path)).toEqual(['/h/big']);
  });
});

describe('buildStorageSnapshot — cleanupTasks', () => {
  it('proposes cache cleanup at exactly the minimum, with summed size', () => {
    const half = CACHE_CLEANUP_MIN_BYTES / 2;
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({ path: '/h/.cache', sizeBytes: half, category: 'cache' }),
        folder({ path: '/h/.cache2', sizeBytes: half, category: 'cache' }),
      ],
    });
    expect(snap.cleanupTasks).toHaveLength(1);
    expect(snap.cleanupTasks[0]).toMatchObject({
      id: 'cache',
      potentialFreeMb: 100,
      difficulty: 'caution',
      executable: false,
    });
    expect(snap.cleanupTasks[0]?.howTo).toContain('/h/.cache');
    expect(snap.cleanupTasks[0]?.howTo).toContain('/h/.cache2');
  });

  it('joins multiple cache folder paths with the separator in the cache howTo', () => {
    const half = CACHE_CLEANUP_MIN_BYTES / 2;
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({ path: '/h/.cache', sizeBytes: half, category: 'cache' }),
        folder({ path: '/h/.cache2', sizeBytes: half, category: 'cache' }),
      ],
    });
    expect(snap.cleanupTasks[0]?.howTo).toBe(
      '/h/.cache / /h/.cache2: 対象アプリを終了してから中身を削除してください（フォルダ自体は削除しないこと）',
    );
  });

  it('skips cache cleanup below the minimum', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({ path: '/h/.cache', sizeBytes: CACHE_CLEANUP_MIN_BYTES - 1, category: 'cache' }),
      ],
    });
    expect(snap.cleanupTasks).toEqual([]);
  });

  it('proposes trash cleanup only when measured and at least the minimum', () => {
    const withTrash = buildStorageSnapshot({ ...base, trashSizeBytes: TRASH_CLEANUP_MIN_BYTES });
    expect(withTrash.cleanupTasks).toMatchObject([
      { id: 'trash', potentialFreeMb: 1, difficulty: 'safe', executable: false },
    ]);
    expect(buildStorageSnapshot({ ...base, trashSizeBytes: null }).cleanupTasks).toEqual([]);
    expect(buildStorageSnapshot({ ...base, trashSizeBytes: 0 }).cleanupTasks).toEqual([]);
  });

  it('proposes downloads cleanup at 1GiB without estimating freed space', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({
          path: '/h/Downloads',
          sizeBytes: DOWNLOADS_CLEANUP_MIN_BYTES,
          category: 'downloads',
        }),
      ],
    });
    expect(snap.cleanupTasks).toMatchObject([
      { id: 'downloads', potentialFreeMb: 0, difficulty: 'caution', executable: false },
    ]);
    expect(snap.cleanupTasks[0]?.howTo).toBe(
      '/h/Downloads: 中身は利用者のファイルです。内容を確認し、不要な物だけを削除してください（解放できる量は内容によります）',
    );
    const below = buildStorageSnapshot({
      ...base,
      folders: [
        folder({
          path: '/h/Downloads',
          sizeBytes: DOWNLOADS_CLEANUP_MIN_BYTES - 1,
          category: 'downloads',
        }),
      ],
    });
    expect(below.cleanupTasks).toEqual([]);
  });

  it('orders tasks cache → trash → downloads', () => {
    const snap = buildStorageSnapshot({
      ...base,
      trashSizeBytes: 5 * MiB,
      folders: [
        folder({ path: '/h/.cache', sizeBytes: CACHE_CLEANUP_MIN_BYTES, category: 'cache' }),
        folder({
          path: '/h/Downloads',
          sizeBytes: DOWNLOADS_CLEANUP_MIN_BYTES,
          category: 'downloads',
        }),
      ],
    });
    expect(snap.cleanupTasks.map((t) => t.id)).toEqual(['cache', 'trash', 'downloads']);
  });
});

describe('buildStorageSnapshot — performance', () => {
  it('never fabricates fragmentation / startup numbers', () => {
    const snap = buildStorageSnapshot(base);
    expect(snap.performance.fragmentationPct).toBeNull();
    expect(snap.performance.startupSec).toBeNull();
  });

  it('passes through the process count, including null (unmeasurable)', () => {
    expect(buildStorageSnapshot(base).performance.runningProcesses).toBe(210);
    expect(
      buildStorageSnapshot({ ...base, processCount: null }).performance.runningProcesses,
    ).toBeNull();
  });

  it('computes memory from raw bytes', () => {
    const snap = buildStorageSnapshot(base);
    expect(snap.performance.memoryTotalGb).toBe(16);
    expect(snap.performance.memoryUsedGb).toBe(12);
  });

  it('handles zero total memory without dividing by zero', () => {
    const snap = buildStorageSnapshot({ ...base, totalMemBytes: 0, freeMemBytes: 0 });
    expect(snap.performance.memoryTotalGb).toBe(0);
    expect(snap.performance.memoryUsedGb).toBe(0);
    expect(snap.recommendations.some((r) => r.includes('メモリ使用率'))).toBe(false);
  });

  it('keeps the memory usage rate at 0 when total memory is 0, even with used memory present', () => {
    // 合成境界: totalMemGb = 0 のとき使用率は定義できないので 0 に倒す (ガードが
    // 落ちると usedMemGb / 0 = Infinity になり、メモリ警告が誤って出る)。
    const snap = buildStorageSnapshot({ ...base, totalMemBytes: 0, freeMemBytes: -1 * GiB });
    expect(snap.performance.memoryTotalGb).toBe(0);
    expect(snap.performance.memoryUsedGb).toBe(1);
    expect(snap.recommendations).toEqual([
      'ディスク・メモリに大きな問題は見つかりませんでした',
      'フラグメント率と起動時間は、この環境では測定手段が無いため表示していません（測っていない値を 0 とは表示しません）',
    ]);
  });
});

describe('buildStorageSnapshot — recommendations', () => {
  const diskAt = (freeBytes: number) => ({
    ...base,
    disks: [{ mount: '/', label: 'システム', totalBytes: 100 * GiB, freeBytes }],
  });

  it('warns at exactly 90% (danger) and exactly 75% (warn), silent below', () => {
    expect(buildStorageSnapshot(diskAt(10 * GiB)).recommendations[0]).toBe(
      '/ の使用率が 90.0% です。空き容量の確保を最優先してください',
    );
    expect(buildStorageSnapshot(diskAt(25 * GiB)).recommendations[0]).toBe(
      '/ の使用率が 75.0% です。不要なファイルの整理を検討してください',
    );
    const below = buildStorageSnapshot(diskAt(Math.round(25.1 * GiB)));
    expect(below.recommendations.some((r) => r.includes('使用率が'))).toBe(false);
  });

  it('names the largest folder and big caches', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [folder({ path: '/h/.cache', sizeBytes: 2 * GiB, category: 'cache' })],
    });
    expect(snap.recommendations).toContain('最も大きいフォルダは /h/.cache（2.0 GB）です');
    expect(snap.recommendations).toContain('キャッシュが 2.0 GB あります。クリーンアップ候補です');
  });

  it('recommends cache cleanup at exactly the downloads threshold (boundary inclusive)', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [
        folder({ path: '/h/.cache', sizeBytes: DOWNLOADS_CLEANUP_MIN_BYTES, category: 'cache' }),
      ],
    });
    expect(snap.recommendations).toContain('キャッシュが 1.0 GB あります。クリーンアップ候補です');
  });

  it('warns on memory at exactly 80%, silent at 79%', () => {
    const at80 = buildStorageSnapshot({ ...base, totalMemBytes: 10 * GiB, freeMemBytes: 2 * GiB });
    expect(at80.recommendations).toContain(
      'メモリ使用率が 80% です。不要なアプリ・プロセスの終了を検討してください',
    );
    const at79 = buildStorageSnapshot({
      ...base,
      totalMemBytes: 10 * GiB,
      freeMemBytes: Math.round(2.1 * GiB),
    });
    expect(at79.recommendations.some((r) => r.includes('メモリ使用率'))).toBe(false);
  });

  it('notes truncation and always ends with the unmeasured-metrics note', () => {
    const snap = buildStorageSnapshot({
      ...base,
      folders: [folder({ path: '/h/x', sizeBytes: 2 * GiB, truncated: true })],
    });
    expect(snap.recommendations).toContain(
      '一部のフォルダは走査上限に達したため、サイズは概算（実際より小さい下限値）です',
    );
    expect(snap.recommendations[snap.recommendations.length - 1]).toBe(
      'フラグメント率と起動時間は、この環境では測定手段が無いため表示していません（測っていない値を 0 とは表示しません）',
    );
  });

  it('says healthy when nothing else applies', () => {
    const snap = buildStorageSnapshot({ ...base, totalMemBytes: 16 * GiB, freeMemBytes: 12 * GiB });
    expect(snap.recommendations).toEqual([
      'ディスク・メモリに大きな問題は見つかりませんでした',
      'フラグメント率と起動時間は、この環境では測定手段が無いため表示していません（測っていない値を 0 とは表示しません）',
    ]);
  });
});

describe('fetchStorageSnapshot (live)', () => {
  it('reads the local machine without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchStorageSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Array.isArray(snap.disks)).toBe(true);
    expect(Array.isArray(snap.largeFolders)).toBe(true);
    expect(snap.performance.fragmentationPct).toBeNull();
    expect(snap.performance.startupSec).toBeNull();
    expect(snap.performance.memoryTotalGb).toBeGreaterThan(0);
  });
});

describe('measureDir (実ツリーのフィクスチャ)', () => {
  const roots: string[] = [];
  const makeTree = (): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-measure-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'a.txt'), 'abc');
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'b.txt'), '12345');
    fs.writeFileSync(path.join(root, 'sub', 'c.txt'), 'xy');
    return root;
  };
  afterEach(() => {
    for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  });

  it('ファイルの合計サイズと件数を数える', () => {
    const root = makeTree();
    expect(measureDir(root, { remaining: 100 })).toEqual({
      sizeBytes: 10,
      fileCount: 3,
      truncated: false,
    });
  });

  it('シンボリックリンクを辿らない', () => {
    const root = makeTree();
    fs.symlinkSync(path.join(root, 'a.txt'), path.join(root, 'link-file'));
    fs.symlinkSync(path.join(root, 'sub'), path.join(root, 'link-dir'));
    expect(measureDir(root, { remaining: 100 })).toEqual({
      sizeBytes: 10,
      fileCount: 3,
      truncated: false,
    });
  });

  it('予算が尽きたら truncated を立てて打ち切る', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-budget-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'a.txt'), 'aaaa');
    fs.writeFileSync(path.join(root, 'b.txt'), 'bbbb');
    expect(measureDir(root, { remaining: 1 })).toEqual({
      sizeBytes: 4,
      fileCount: 1,
      truncated: true,
    });
    expect(measureDir(root, { remaining: 0 })).toEqual({
      sizeBytes: 0,
      fileCount: 0,
      truncated: true,
    });
  });

  it('存在しないディレクトリは 0 を返す', () => {
    expect(
      measureDir(path.join(os.tmpdir(), 'storage-no-such-dir-xyz'), { remaining: 10 }),
    ).toEqual({ sizeBytes: 0, fileCount: 0, truncated: false });
  });

  it('通常ファイルでもディレクトリでもないエントリ (ソケット) は数えない', async () => {
    const root = makeTree();
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(path.join(root, 'entry.sock'), resolve);
    });
    try {
      expect(measureDir(root, { remaining: 100 })).toEqual({
        sizeBytes: 10,
        fileCount: 3,
        truncated: false,
      });
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('走査予算の上限は固定されている', () => {
    expect(WALK_ENTRY_BUDGET).toBe(60_000);
  });
});

describe('diskCandidatesFor', () => {
  it('linux では /proc/mounts の解析結果を使う', () => {
    const mounts = '/dev/sda1 / ext4 rw 0 0\n/dev/sdb1 /data ext4 rw 0 0\n';
    expect(diskCandidatesFor('linux', '/home/u', mounts)).toEqual(parseProcMounts(mounts));
  });

  it('linux で mounts を読めなかったらルートだけに倒す', () => {
    expect(diskCandidatesFor('linux', '/home/u', null)).toEqual([
      { mount: '/', label: 'システム' },
    ]);
  });

  it('linux 以外ではルートとホームを候補にする', () => {
    expect(diskCandidatesFor('darwin', '/Users/u', null)).toEqual([
      { mount: '/', label: 'システム' },
      { mount: '/Users/u', label: 'ホーム' },
    ]);
  });

  it('ホームがルートそのものなら候補を重ねない', () => {
    expect(diskCandidatesFor('darwin', '/', null)).toEqual([
      { mount: '/', label: 'システム' },
    ]);
  });
});

describe('trashDirFor', () => {
  it('linux は ~/.local/share/Trash/files', () => {
    expect(trashDirFor('linux', '/home/u')).toBe('/home/u/.local/share/Trash/files');
  });

  it('darwin は ~/.Trash', () => {
    expect(trashDirFor('darwin', '/Users/u')).toBe('/Users/u/.Trash');
  });

  it('対象の無い OS では null', () => {
    expect(trashDirFor('win32', 'C:\\Users\\u')).toBeNull();
  });
});

describe('countNumericEntries', () => {
  it('数値名だけを数える', () => {
    expect(countNumericEntries(['1', '42', 'self', 'thread-self', '007'])).toBe(3);
    expect(countNumericEntries([])).toBe(0);
  });

  it('数字を含むが数値名ではない名前は数えない (正規表現の両端の錨)', () => {
    expect(countNumericEntries(['123abc', 'abc123', '12a3', 'a0', '0'])).toBe(1);
  });
});
