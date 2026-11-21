// @vitest-environment jsdom
/**
 * 暗号化した控え (`data/encryptedCopy.ts`) —— 判定と、書く → 読み戻す → 確かめる → 覚える の順序。
 *
 * 保存先フォルダは同じ面を持つ偽物 (メモリの Map) で受ける。暗号化と復号は実物 (`backup.ts` → `dataCrypto`) を通す。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  copyFreshness,
  copyFreshnessNote,
  encryptedCopyFilename,
  encryptedCopyRefusal,
  ENCRYPTED_COPY_MARKER_KEY,
  isEncryptedCopyFilename,
  loadCopyMarker,
  readCopyMarker,
  recordsFingerprint,
  verifyCopyText,
  writeEncryptedCopy,
  type CopyFolder,
  type CopyMarker,
} from '../encryptedCopy';
import { isEncryptedBackup, parseBackupFile, sha256Hex } from '../backup';
import type { StoredRecord } from '../store';

const PASS = 'correct horse battery';
const NOW = new Date(2026, 10, 11, 9, 30, 0);

function rec(id: string, updatedAt: number, amount = 1000): StoredRecord {
  return {
    id,
    collection: 'sales-entries',
    createdAt: 1,
    updatedAt,
    data: { date: '2026-11-01', channel: 'shopify', amount, orders: 1 },
  };
}

function memoryFolder(): CopyFolder & { files: Map<string, string>; writes: string[] } {
  const files = new Map<string, string>();
  const writes: string[] = [];
  return {
    files,
    writes,
    write: async (filename, blob) => {
      writes.push(filename);
      files.set(filename, await blob.text());
    },
    read: async (filename) => {
      const text = files.get(filename);
      if (text === undefined) throw new Error('NotFoundError');
      return text;
    },
  };
}

const FP = 'a'.repeat(64);
const MARKER: CopyMarker = { at: NOW.getTime(), count: 2, fingerprint: FP, filename: 'service-hub-copy-2026-11-11-encrypted.json' };

beforeEach(() => {
  localStorage.clear();
});

describe('控えのファイル名', () => {
  it('その日の名前を組み、暦に無い日付は受けない', () => {
    expect(encryptedCopyFilename('2026-11-11')).toBe('service-hub-copy-2026-11-11-encrypted.json');
    expect(encryptedCopyFilename('2026-02-31')).toBeNull();
    expect(encryptedCopyFilename('../../etc')).toBeNull();
    expect(encryptedCopyFilename('')).toBeNull();
  });

  it('自分が書いた名前の形だけを認める', () => {
    expect(isEncryptedCopyFilename('service-hub-copy-2026-11-11-encrypted.json')).toBe(true);
    expect(isEncryptedCopyFilename('service-hub-copy-2026-02-31-encrypted.json')).toBe(false);
    expect(isEncryptedCopyFilename('x-service-hub-copy-2026-11-11-encrypted.json')).toBe(false);
    expect(isEncryptedCopyFilename('service-hub-copy-2026-11-11-encrypted.json.exe')).toBe(false);
    expect(isEncryptedCopyFilename('service-hub-backup-2026-11-11-encrypted.json')).toBe(false);
    expect(isEncryptedCopyFilename('service-hub-copy--encrypted.json')).toBe(false);
  });

  it('前と後ろの両方を見る (同じ長さの別の前置き・別の後置きは、日付が正しくても認めない)', () => {
    // 前置きだけが違う (長さは同じ 17 字) —— 切り出した日付は正しいので、前置きを見なければ通る。
    expect(isEncryptedCopyFilename('service-hub-copx-2026-11-11-encrypted.json')).toBe(false);
    // 後置きだけが違う (長さは同じ 15 字)。
    expect(isEncryptedCopyFilename('service-hub-copy-2026-11-11-encrypted.jsox')).toBe(false);
    // 標本: 上の 2 つは、前置き・後置きを落とせば暦の日付が残る形である。
    expect('service-hub-copx-2026-11-11-encrypted.json'.slice(17, -15)).toBe('2026-11-11');
    expect('service-hub-copy-2026-11-11-encrypted.jsox'.slice(17, -15)).toBe('2026-11-11');
  });
});

describe('記録の指紋', () => {
  it('並びには依らず、足す・消す・書き換えるのどれでも変わる', async () => {
    const a = rec('a', 10);
    const b = rec('b', 20);
    const base = await recordsFingerprint([a, b]);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(await recordsFingerprint([b, a])).toBe(base);
    expect(await recordsFingerprint([a, b, rec('c', 30)])).not.toBe(base);
    expect(await recordsFingerprint([a])).not.toBe(base);
    expect(await recordsFingerprint([a, rec('b', 21)])).not.toBe(base);
  });

  it('id と更新時刻の境目を取り違えない (つないだ字が同じでも別の指紋)', async () => {
    const x = await recordsFingerprint([{ id: 'a1', updatedAt: 2 }]);
    const y = await recordsFingerprint([{ id: 'a', updatedAt: 12 }]);
    expect(x).not.toBe(y);
  });

  it('指紋は「[id, 更新時刻] の JSON を並べ替えて改行でつないだ物」の sha256 である (値を留める)', async () => {
    const got = await recordsFingerprint([
      { id: 'b', updatedAt: 2 },
      { id: 'a', updatedAt: 1 },
    ]);
    expect(got).toBe(await sha256Hex('["a",1]\n["b",2]'));
    // 対照: 区切りが無ければ別の値になる。
    expect(got).not.toBe(await sha256Hex('["a",1]["b",2]'));
  });

  it('1 件も無い記録の指紋と、1 件の指紋は違う', async () => {
    expect(await recordsFingerprint([])).not.toBe(await recordsFingerprint([rec('a', 1)]));
  });
});

describe('目印の読み', () => {
  it('形の合う目印はそのまま読む', () => {
    expect(readCopyMarker({ ...MARKER })).toEqual(MARKER);
  });

  it('件数 1 は読む (下限ちょうど)', () => {
    expect(readCopyMarker({ ...MARKER, count: 1 })).toEqual({ ...MARKER, count: 1 });
  });

  it('余分な欄は持ち込まない', () => {
    expect(readCopyMarker({ ...MARKER, passphrase: 'x' })).toEqual(MARKER);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['数', 5],
    ['配列', [MARKER]],
    ['文字列', 'x'],
    ['時刻が文字列', { ...MARKER, at: '2026-11-11' }],
    ['時刻が非有限', { ...MARKER, at: Number.NaN }],
    ['件数が 0', { ...MARKER, count: 0 }],
    ['件数が小数', { ...MARKER, count: 1.5 }],
    ['件数が文字列', { ...MARKER, count: '2' }],
    ['指紋が短い', { ...MARKER, fingerprint: 'abc' }],
    ['指紋が大文字', { ...MARKER, fingerprint: 'A'.repeat(64) }],
    ['指紋の前後に余分な字', { ...MARKER, fingerprint: 'x' + FP }],
    ['指紋のあとに余分な字', { ...MARKER, fingerprint: FP + 'x' }],
    ['指紋が数', { ...MARKER, fingerprint: 1 }],
    // 正規表現は文字列でない値を文字列へ直して照合する —— 型を先に見なければ、1 要素の配列が通る。
    ['指紋が 1 要素の配列', { ...MARKER, fingerprint: [FP] }],
    ['件数が負', { ...MARKER, count: -1 }],
    ['名前が別の形', { ...MARKER, filename: '../evil.json' }],
    ['名前が数', { ...MARKER, filename: 5 }],
  ])('形の違う目印は「無い」: %s', (_label, raw) => {
    expect(readCopyMarker(raw)).toBeNull();
  });

  it('端末に無ければ null・読めた', () => {
    expect(loadCopyMarker()).toEqual({ marker: null, readable: true });
  });

  it('端末に在ればそれを読む。壊れた JSON は「無い」', () => {
    localStorage.setItem(ENCRYPTED_COPY_MARKER_KEY, JSON.stringify(MARKER));
    expect(loadCopyMarker()).toEqual({ marker: MARKER, readable: true });
    localStorage.setItem(ENCRYPTED_COPY_MARKER_KEY, '{broken');
    expect(loadCopyMarker()).toEqual({ marker: null, readable: true });
  });
});

describe('控えの鮮度', () => {
  it('記録が無ければ控える物が無い (目印が在っても)', () => {
    expect(copyFreshness(null, 0, FP)).toEqual({ state: 'no-records' });
    expect(copyFreshness(MARKER, 0, FP)).toEqual({ state: 'no-records' });
  });

  it('件数が読めない・負でも「控える物が無い」へ倒す (最新とも古いとも言わない)', () => {
    expect(copyFreshness(MARKER, Number.NaN, FP)).toEqual({ state: 'no-records' });
    expect(copyFreshness(MARKER, Number.POSITIVE_INFINITY, FP)).toEqual({ state: 'no-records' });
    expect(copyFreshness(MARKER, -1, FP)).toEqual({ state: 'no-records' });
    expect(copyFreshness(null, 1, FP)).toEqual({ state: 'never', count: 1 });
  });

  it('目印が無ければ 1 度も控えていない', () => {
    expect(copyFreshness(null, 3, FP)).toEqual({ state: 'never', count: 3 });
  });

  it('指紋が同じなら最新、違えば古い', () => {
    expect(copyFreshness(MARKER, 2, FP)).toEqual({ state: 'current', marker: MARKER });
    expect(copyFreshness(MARKER, 5, 'b'.repeat(64))).toEqual({ state: 'stale', marker: MARKER, count: 5 });
  });

  it('文は状態ごとに別で、件数・日付・名前を名乗る', () => {
    expect(copyFreshnessNote({ state: 'no-records' })).toBe('控える記録がまだありません。');
    expect(copyFreshnessNote({ state: 'never', count: 3 })).toBe(
      'この端末の記録 3 件は、まだ 1 度も控えていません。端末が壊れると失われます。',
    );
    expect(copyFreshnessNote({ state: 'current', marker: MARKER })).toBe(
      '最後の控え (2026-11-11・2 件・service-hub-copy-2026-11-11-encrypted.json) は、今の記録と一致しています。',
    );
    expect(copyFreshnessNote({ state: 'stale', marker: MARKER, count: 5 })).toBe(
      '最後の控え (2026-11-11・2 件) のあとに記録が変わっています (今は 5 件)。控えを書き直してください。',
    );
  });

  it('読めない時刻の目印では日付を名乗らない', () => {
    const odd = { ...MARKER, at: Number.NaN };
    expect(copyFreshnessNote({ state: 'current', marker: odd })).toContain('日時不明');
    expect(copyFreshnessNote({ state: 'stale', marker: odd, count: 1 })).toContain('日時不明');
  });
});

describe('控えを書く前の断り', () => {
  it('記録が無い・短い・一致しない、の順に断る', () => {
    expect(encryptedCopyRefusal(0, PASS, PASS)).toBe(
      '控える記録がありません。空の控えは書きません (同じ日の控えを空で上書きしないため)。',
    );
    expect(encryptedCopyRefusal(1, 'short', 'short')).toContain('12 文字以上');
    expect(encryptedCopyRefusal(1, PASS, PASS + 'x')).toBe(
      'パスフレーズが 2 つの欄で一致しません。打ち間違えた控えは、あとで開けません。',
    );
    expect(encryptedCopyRefusal(0, 'short', 'other')).toContain('控える記録がありません');
    expect(encryptedCopyRefusal(1, 'short', 'other')).toContain('12 文字以上');
  });

  it('件数が読めない・負でも「控える記録がありません」で断る', () => {
    for (const n of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(encryptedCopyRefusal(n, PASS, PASS), String(n)).toContain('控える記録がありません');
    }
  });

  it('揃っていれば断らない', () => {
    expect(encryptedCopyRefusal(1, PASS, PASS)).toBeNull();
  });
});

describe('書く → 読み戻す → 確かめる → 覚える', () => {
  it('★ 書いた控えは暗号文で、同じパスフレーズで開き、目印が端末に残る', async () => {
    const folder = memoryFolder();
    const records = [rec('a', 10, 123_456), rec('b', 20)];
    const res = await writeEncryptedCopy({ records, passphrase: PASS, confirm: PASS, folder, now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const name = 'service-hub-copy-2026-11-11-encrypted.json';
    expect(folder.writes).toEqual([name]);
    const text = folder.files.get(name) ?? '';
    expect(isEncryptedBackup(text)).toBe(true);
    // 提供者が持つのは暗号文だけ: 記録の中身 (金額・チャネル・id) は平文で入らない。
    expect(text).not.toContain('123456');
    expect(text).not.toContain('shopify');
    expect(text).not.toContain(PASS);
    expect((await parseBackupFile(text, PASS)).records).toEqual(records);
    expect(res.marker).toEqual({
      at: NOW.getTime(),
      count: 2,
      fingerprint: await recordsFingerprint(records),
      filename: name,
    });
    expect(res.markerSaved).toBe(true);
    expect(res.message).toBe(
      `2 件の記録を暗号化して ${name} に書き、読み戻してそのパスフレーズで開けることを確かめました。`,
    );
    expect(loadCopyMarker().marker).toEqual(res.marker);
    // 目印に入るのは 4 欄だけ (中身もパスフレーズも入らない)。
    expect(Object.keys(JSON.parse(localStorage.getItem(ENCRYPTED_COPY_MARKER_KEY) ?? '{}')).sort()).toEqual([
      'at',
      'count',
      'filename',
      'fingerprint',
    ]);
    expect(copyFreshness(loadCopyMarker().marker, 2, await recordsFingerprint(records)).state).toBe('current');
    expect(copyFreshness(loadCopyMarker().marker, 3, await recordsFingerprint([...records, rec('c', 30)])).state).toBe('stale');
  }, 30_000);

  it('フォルダへ渡す中身は JSON を名乗る', async () => {
    const types: string[] = [];
    const inner = memoryFolder();
    const folder: CopyFolder = {
      write: async (filename, blob) => {
        types.push(blob.type);
        await inner.write(filename, blob);
      },
      read: inner.read,
    };
    const res = await writeEncryptedCopy({ records: [rec('a', 10)], passphrase: PASS, confirm: PASS, folder, now: NOW });
    expect(res.ok).toBe(true);
    expect(types).toEqual(['application/json']);
  }, 30_000);

  it('今日の日付が読めなければ、名前を決められないと断り、1 字も書かない', async () => {
    const folder = memoryFolder();
    const res = await writeEncryptedCopy({
      records: [rec('a', 10)],
      passphrase: PASS,
      confirm: PASS,
      folder,
      now: new Date(Number.NaN),
    });
    expect(res).toEqual({ ok: false, message: '今日の日付を読めないので、控えの名前を決められません。' });
    expect(folder.writes).toEqual([]);
    expect(loadCopyMarker().marker).toBeNull();
  });

  it('対照の標本: 平文で書けば中身は読める (暗号文に無いことの主張が空でない証拠)', () => {
    const plain = JSON.stringify([rec('a', 10, 123_456)]);
    expect(plain).toContain('123456');
    expect(plain).toContain('shopify');
  });

  it('断る条件では 1 字も書かず、目印も動かさない', async () => {
    const folder = memoryFolder();
    const empty = await writeEncryptedCopy({ records: [], passphrase: PASS, confirm: PASS, folder, now: NOW });
    const short = await writeEncryptedCopy({ records: [rec('a', 1)], passphrase: 'short', confirm: 'short', folder, now: NOW });
    const typo = await writeEncryptedCopy({ records: [rec('a', 1)], passphrase: PASS, confirm: PASS + '!', folder, now: NOW });
    expect(empty).toEqual({ ok: false, message: encryptedCopyRefusal(0, PASS, PASS) });
    expect(short.ok).toBe(false);
    expect(typo).toEqual({ ok: false, message: encryptedCopyRefusal(1, PASS, PASS + '!') });
    expect(folder.writes).toEqual([]);
    expect(localStorage.getItem(ENCRYPTED_COPY_MARKER_KEY)).toBeNull();
  });

  it('★ 書けなかったら理由を言い、目印は前のまま', async () => {
    localStorage.setItem(ENCRYPTED_COPY_MARKER_KEY, JSON.stringify(MARKER));
    const folder: CopyFolder = {
      write: async () => {
        throw new Error('フォルダへの書き込み権限が拒否されています');
      },
      read: async () => '',
    };
    const res = await writeEncryptedCopy({ records: [rec('a', 1)], passphrase: PASS, confirm: PASS, folder, now: NOW });
    expect(res).toEqual({ ok: false, message: '控えを書けませんでした (フォルダへの書き込み権限が拒否されています)。' });
    expect(loadCopyMarker().marker).toEqual(MARKER);
  }, 30_000);

  it('★ 読み戻せなかったら「書けた」と言わず、目印は前のまま', async () => {
    const folder: CopyFolder = {
      write: async () => {},
      read: async () => {
        throw new Error('NotFoundError');
      },
    };
    const res = await writeEncryptedCopy({ records: [rec('a', 1)], passphrase: PASS, confirm: PASS, folder, now: NOW });
    expect(res).toEqual({ ok: false, message: '控えを書きましたが、読み戻して確かめられませんでした (NotFoundError)。' });
    expect(localStorage.getItem(ENCRYPTED_COPY_MARKER_KEY)).toBeNull();
  }, 30_000);

  it('★ 読み戻した物が別物 (途中で切れた・別のファイル) なら「書けた」と言わない', async () => {
    const base = memoryFolder();
    const truncating: CopyFolder = { write: base.write, read: async (n) => (await base.read(n)).slice(0, 40) };
    const res = await writeEncryptedCopy({ records: [rec('a', 1)], passphrase: PASS, confirm: PASS, folder: truncating, now: NOW });
    expect(res).toEqual({ ok: false, message: '書いた控えを読み戻しましたが、そのパスフレーズで開けませんでした。' });
    expect(localStorage.getItem(ENCRYPTED_COPY_MARKER_KEY)).toBeNull();
  }, 30_000);

  it('読み戻した物の件数が違えば、件数を言って断る', async () => {
    const folder = memoryFolder();
    await writeEncryptedCopy({ records: [rec('a', 1), rec('b', 2)], passphrase: PASS, confirm: PASS, folder, now: NOW });
    const text = folder.files.get('service-hub-copy-2026-11-11-encrypted.json') ?? '';
    expect(await verifyCopyText(text, PASS, 2)).toBeNull();
    expect(await verifyCopyText(text, PASS, 3)).toBe(
      '書いた控えを読み戻しましたが、件数が合いません (書いた 3 件・読めた 2 件)。',
    );
    expect(await verifyCopyText(text, PASS + 'x', 2)).toBe(
      '書いた控えを読み戻しましたが、そのパスフレーズで開けませんでした。',
    );
  }, 30_000);

  it('失敗の理由に資格情報の形が混ざっても伏せる', async () => {
    const folder: CopyFolder = {
      write: async () => {
        throw new Error('denied for sk-ant-api03-' + 'A'.repeat(40));
      },
      read: async () => '',
    };
    const res = await writeEncryptedCopy({ records: [rec('a', 1)], passphrase: PASS, confirm: PASS, folder, now: NOW });
    expect(res.ok).toBe(false);
    expect(res.message).not.toContain('A'.repeat(40));
    expect('denied for sk-ant-api03-' + 'A'.repeat(40)).toContain('A'.repeat(40));
  }, 30_000);

  it('目印を端末に覚えられなかったら、書けたことと覚えられなかったことの両方を言う', async () => {
    const folder = memoryFolder();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    try {
      const res = await writeEncryptedCopy({ records: [rec('a', 1)], passphrase: PASS, confirm: PASS, folder, now: NOW });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.markerSaved).toBe(false);
      expect(res.message).toContain('確かめました。 ただし、控えた時刻を端末に覚えられませんでした');
    } finally {
      Storage.prototype.setItem = original;
    }
  }, 30_000);

  it('例外が Error でなくても理由を文にする', async () => {
    const folder: CopyFolder = {
      write: async () => {
        throw 'plain string failure';
      },
      read: async () => '',
    };
    const res = await writeEncryptedCopy({ records: [rec('a', 1)], passphrase: PASS, confirm: PASS, folder, now: NOW });
    expect(res).toEqual({ ok: false, message: '控えを書けませんでした (plain string failure)。' });
  }, 30_000);
});
