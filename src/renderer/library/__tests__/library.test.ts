/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { getLibrary, _resetLibraryForTests } from '../library';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-library');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetLibraryForTests();
  await clearIdb();
});

describe('Library — put + get + list', () => {
  it('returns empty list initially', async () => {
    const lib = getLibrary();
    expect(await lib.list()).toHaveLength(0);
    expect(await lib.totalBytes()).toBe(0);
  });

  it('put + get round-trips a Blob (metadata fidelity)', async () => {
    const lib = getLibrary();
    const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' });
    const meta = await lib.put('templates', 'a.svg', 'image/svg+xml', blob);
    expect(meta.filename).toBe('a.svg');
    expect(meta.serviceId).toBe('templates');
    expect(meta.size).toBe(6);
    expect(meta.mime).toBe('image/svg+xml');
    const full = await lib.get(meta.id);
    expect(full).not.toBeNull();
    expect(full!.filename).toBe('a.svg');
    expect(full!.size).toBe(6);
  });

  it('list() sorts newest-first', async () => {
    const lib = getLibrary();
    await lib.put('templates', 'first.svg', 'image/svg+xml', new Blob(['1']));
    await new Promise((r) => setTimeout(r, 5));
    await lib.put('templates', 'second.svg', 'image/svg+xml', new Blob(['2']));
    const list = await lib.list();
    expect(list[0]!.filename).toBe('second.svg');
    expect(list[1]!.filename).toBe('first.svg');
  });

  it('get() returns null for unknown id', async () => {
    expect(await getLibrary().get('does-not-exist')).toBeNull();
  });

  it('get() returns null for empty / non-string id', async () => {
    expect(await getLibrary().get('')).toBeNull();
    expect(await getLibrary().get(42 as unknown as string)).toBeNull();
  });
});

describe('Library — validation', () => {
  const lib = () => getLibrary();
  const blob = new Blob(['x'], { type: 'text/plain' });

  it('rejects invalid serviceId', async () => {
    await expect(lib().put('Bad', 'a.svg', 'image/svg+xml', blob)).rejects.toThrow(/serviceId/);
    await expect(lib().put('', 'a.svg', 'image/svg+xml', blob)).rejects.toThrow(/serviceId/);
    await expect(lib().put('x'.repeat(65), 'a.svg', 'image/svg+xml', blob)).rejects.toThrow(/serviceId/);
  });

  it('rejects invalid filename', async () => {
    await expect(lib().put('templates', '', 'mime', blob)).rejects.toThrow(/filename/);
    await expect(lib().put('templates', 'a/b.svg', 'mime', blob)).rejects.toThrow(/filename/);
    await expect(lib().put('templates', 'a\0b', 'mime', blob)).rejects.toThrow(/filename/);
    await expect(lib().put('templates', 'x'.repeat(257), 'mime', blob)).rejects.toThrow(/filename/);
  });

  it('rejects invalid mime', async () => {
    await expect(lib().put('templates', 'a.svg', '', blob)).rejects.toThrow(/mime/);
    await expect(lib().put('templates', 'a.svg', 'x'.repeat(129), blob)).rejects.toThrow(/mime/);
    await expect(lib().put('templates', 'a.svg', 'mime\nname', blob)).rejects.toThrow(/mime/);
  });

  it('rejects non-Blob value', async () => {
    await expect(lib().put('templates', 'a.svg', 'mime', 'not-a-blob' as unknown as Blob)).rejects.toThrow(/blob/);
  });

  it('rejects empty blob', async () => {
    await expect(lib().put('templates', 'a.svg', 'mime', new Blob([]))).rejects.toThrow(/空の/);
  });

  it('rejects blob > 50 MB', async () => {
    const big = new Blob([new Uint8Array(50 * 1024 * 1024 + 1)]);
    await expect(lib().put('templates', 'a.svg', 'mime', big)).rejects.toThrow(/大きすぎ/);
  });
});

describe('Library — remove / clear', () => {
  it('remove() deletes a single entry', async () => {
    const lib = getLibrary();
    const m = await lib.put('templates', 'a.svg', 'image/svg+xml', new Blob(['x']));
    await lib.remove(m.id);
    expect(await lib.get(m.id)).toBeNull();
    expect(await lib.list()).toHaveLength(0);
  });

  it('remove() is a no-op for empty / non-string id', async () => {
    const lib = getLibrary();
    await lib.put('templates', 'a.svg', 'image/svg+xml', new Blob(['x']));
    await lib.remove('');
    await lib.remove(42 as unknown as string);
    expect(await lib.list()).toHaveLength(1);
  });

  it('clear() removes everything', async () => {
    const lib = getLibrary();
    await lib.put('templates', 'a.svg', 'image/svg+xml', new Blob(['x']));
    await lib.put('templates', 'b.svg', 'image/svg+xml', new Blob(['y']));
    await lib.clear();
    expect(await lib.list()).toHaveLength(0);
  });
});

describe('Library — auto-eviction (100 items / 50 MB)', () => {
  it('evicts oldest when count exceeds 100', async () => {
    const lib = getLibrary();
    // Guarantee a clean slate independent of fake-indexeddb deleteDatabase
    // timing semantics — the in-test `clear()` is fully transactional.
    await lib.clear();
    expect(await lib.list()).toHaveLength(0);
    // Insert 101 small items
    for (let i = 0; i < 101; i++) {
      await lib.put('templates', `t-${i}.svg`, 'image/svg+xml', new Blob([String(i)]));
    }
    const list = await lib.list();
    expect(list.length).toBeLessThanOrEqual(100);
    // The very oldest (t-0) should have been evicted; the newest should remain.
    expect(list.some((it) => it.filename === 't-100.svg')).toBe(true);
    expect(list.some((it) => it.filename === 't-0.svg')).toBe(false);
  });
});

describe('Library — singleton', () => {
  it('getLibrary() returns the same instance', () => {
    const a = getLibrary();
    const b = getLibrary();
    expect(a).toBe(b);
  });
});

// --- 名前・種別・大きさの検査 ------------------------------------------
//
// ここを通った値がそのまま IndexedDB のキーと表示名になる。改行や NUL や
// スラッシュを含む名前は、書き出し先の組み立てや一覧の表示で悪さをする。

describe('Library.put — 受け付ける値の境界', () => {
  const lib = () => getLibrary();
  const blob = (n = 4) => new Blob(['x'.repeat(n)], { type: 'text/plain' });

  it('ファイル名はちょうど 256 文字まで通し、257 で弾く', async () => {
    await expect(lib().put('svc', 'あ'.repeat(256), 'text/plain', blob())).resolves.toBeTruthy();
    await expect(lib().put('svc', 'あ'.repeat(257), 'text/plain', blob())).rejects.toThrow(
      'filename が不正です',
    );
  });

  it('ファイル名に NUL / 改行 / スラッシュは入れさせない', async () => {
    for (const bad of ['a\0b.txt', 'a\nb.txt', 'a\rb.txt', 'dir/file.txt', '']) {
      await expect(lib().put('svc', bad, 'text/plain', blob())).rejects.toThrow(
        'filename が不正です',
      );
    }
    // 文字列でないものも弾く
    await expect(
      lib().put('svc', 123 as unknown as string, 'text/plain', blob()),
    ).rejects.toThrow('filename が不正です');
  });

  it('MIME はちょうど 128 文字まで通し、129 と改行入りを弾く', async () => {
    const pad = (n: number) => 'a'.repeat(n);
    await expect(lib().put('svc', 'f.txt', pad(128), blob())).resolves.toBeTruthy();
    await expect(lib().put('svc', 'f.txt', pad(129), blob())).rejects.toThrow('mime が不正です');
    for (const bad of ['text/\0plain', 'text/\nplain', '']) {
      await expect(lib().put('svc', 'f.txt', bad, blob())).rejects.toThrow('mime が不正です');
    }
  });

  it('serviceId は英小文字始まり・64 文字までの限られた形だけ', async () => {
    await expect(lib().put('a', 'f.txt', 'text/plain', blob())).resolves.toBeTruthy();
    await expect(
      lib().put('a' + 'b'.repeat(63), 'f.txt', 'text/plain', blob()),
    ).resolves.toBeTruthy();
    for (const bad of ['', 'A', '1abc', '-abc', 'a_b', 'あ', 'a' + 'b'.repeat(64)]) {
      await expect(lib().put(bad, 'f.txt', 'text/plain', blob())).rejects.toThrow(
        'serviceId が不正です',
      );
    }
  });

  it('空のファイルは断り、上限ちょうど (50 MB) は通す', async () => {
    await expect(lib().put('svc', 'f.txt', 'text/plain', new Blob([]))).rejects.toThrow(
      '空のファイルは保存できません',
    );

    const MAX = 50 * 1024 * 1024;
    // 実データを 50 MB 作らずに大きさだけ偽装する (中身は検査に関係ない)
    const fake = (size: number): Blob => {
      // `size` は getter なので上書きは defineProperty で行う。
      const b = new Blob(['x'], { type: 'text/plain' });
      Object.defineProperty(b, 'size', { value: size, configurable: true });
      return b;
    };
    await expect(lib().put('svc', 'ok.txt', 'text/plain', fake(MAX))).resolves.toBeTruthy();
    await expect(lib().put('svc', 'ng.txt', 'text/plain', fake(MAX + 1))).rejects.toThrow(
      'ファイルが大きすぎます',
    );
  });

  it('Blob でないものは弾く', async () => {
    await expect(
      lib().put('svc', 'f.txt', 'text/plain', 'not a blob' as unknown as Blob),
    ).rejects.toThrow('blob が不正です');
  });
});

describe('Library.get / remove — id の検査', () => {
  it('id が空・文字列でなければ、探しにも消しにも行かない', async () => {
    const lib = getLibrary();
    for (const bad of ['', 123, null, undefined]) {
      await expect(lib.get(bad as unknown as string)).resolves.toBeNull();
      await expect(lib.remove(bad as unknown as string)).resolves.toBeUndefined();
    }
  });
});

// --- 上限を超えたときの間引き ------------------------------------------
//
// これは**利用者の保存済みファイルを消す**唯一の経路である。条件が
// 反転すると「消さない (溢れる)」か「消しすぎる」のどちらかになるが、
// 画面上はどちらも「一覧に無い / ある」だけなので気付きにくい。

describe('Library — 上限を超えたら古いものから間引く', () => {
  const blob = (n: number) => new Blob(['x'.repeat(n)], { type: 'text/plain' });

  it('件数の上限 (100) ちょうどでは消さず、超えたぶんだけ消す', async () => {
    const lib = getLibrary();
    for (let i = 0; i < 100; i++) {
      await lib.put('svc', `f${String(i).padStart(3, '0')}.txt`, 'text/plain', blob(1));
    }
    expect(await lib.list()).toHaveLength(100);

    await lib.put('svc', 'newest.txt', 'text/plain', blob(1));
    const after = await lib.list();
    expect(after).toHaveLength(100);
    // 新しいものが残り、いちばん古いものが落ちる
    expect(after[0]!.filename).toBe('newest.txt');
    expect(after.some((it) => it.filename === 'f000.txt')).toBe(false);
    expect(after.some((it) => it.filename === 'f001.txt')).toBe(true);
  });

  it('容量の上限を超えたら、収まるまで古いものを消す', async () => {
    const lib = getLibrary();
    const big = (size: number, name: string) => {
      const b = new Blob(['x'], { type: 'text/plain' });
      Object.defineProperty(b, 'size', { value: size, configurable: true });
      return lib.put('svc', name, 'text/plain', b);
    };
    const TWENTY_MB = 20 * 1024 * 1024;
    await big(TWENTY_MB, 'a.bin');
    await big(TWENTY_MB, 'b.bin');
    expect(await lib.list()).toHaveLength(2);

    // 合計 60 MB > 50 MB → いちばん古い a.bin が落ちる
    await big(TWENTY_MB, 'c.bin');
    const after = await lib.list();
    expect(after.map((it) => it.filename)).toEqual(['c.bin', 'b.bin']);
  });

  it('上限内なら 1 つも消さない', async () => {
    const lib = getLibrary();
    for (const n of ['a.txt', 'b.txt', 'c.txt']) await lib.put('svc', n, 'text/plain', blob(1));
    const after = await lib.list();
    expect(after.map((it) => it.filename)).toEqual(['c.txt', 'b.txt', 'a.txt']);
  });

  it('合計サイズは足し算で出す', async () => {
    const lib = getLibrary();
    await lib.put('svc', 'a.txt', 'text/plain', blob(10));
    await lib.put('svc', 'b.txt', 'text/plain', blob(25));
    expect(await lib.totalBytes()).toBe(35);
  });
});

// --- 並び順の決め手 ----------------------------------------------------

describe('Library — 同じミリ秒に入れても順序が決まる', () => {
  it('連続して入れた順に新しい扱いになる', async () => {
    const lib = getLibrary();
    // Date.now() が同じ値を返しても、内部の時刻は必ず 1 以上進む。
    // 進み方が逆になると一覧の並びと間引く対象が入れ替わる。
    const names = ['1.txt', '2.txt', '3.txt', '4.txt', '5.txt'];
    for (const n of names) await lib.put('svc', n, 'text/plain', new Blob(['x']));
    const listed = (await lib.list()).map((it) => it.filename);
    expect(listed).toEqual([...names].reverse());
  });
});

// --- 失敗が伝わること --------------------------------------------------
//
// IndexedDB の失敗は例外ではなくイベントで来る。ハンドラを付け忘れると
// Promise が永久に解決せず、画面は「読み込み中」のまま黙って止まる。

describe('Library — IndexedDB の失敗は必ず reject する', () => {
  it('DB を開けないときは待ち続けずに失敗を返す', async () => {
    // 本物は呼ばない (接続が残ると次の deleteDatabase が blocked になる)。
    const spy = vi.spyOn(indexedDB, 'open').mockImplementation((() => {
      const fake = {
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onupgradeneeded: null as null | (() => void),
        error: new Error('boom'),
        result: undefined,
      };
      queueMicrotask(() => fake.onerror?.());
      return fake as unknown as IDBOpenDBRequest;
    }) as typeof indexedDB.open);
    try {
      await expect(getLibrary().list()).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

// --- id の作り方 -------------------------------------------------------

describe('Library — id の作り方', () => {
  it('randomUUID が無い環境でも UUID の形の id を作る', async () => {
    const desc = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    // 使えない環境 (古い WebView・非セキュアコンテキスト) を再現する。
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    // 0x10 未満のバイトを必ず含める。1 桁の 16 進を 0 で埋めないと
    // 32 桁に満たない id ができるが、乱数任せだと 3 回に 1 回しか出ない。
    let seed = 0;
    const rnd = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementation(((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i + seed) % 16; // 全部 1 桁
        seed += 1;
        return arr;
      }) as typeof crypto.getRandomValues);
    try {
      const lib = getLibrary();
      const a = await lib.put('svc', 'a.txt', 'text/plain', new Blob(['x']));
      const b = await lib.put('svc', 'b.txt', 'text/plain', new Blob(['x']));
      for (const meta of [a, b]) {
        expect(meta.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      }
      // 衝突すると保存済みのファイルを上書きしてしまう
      expect(a.id).not.toBe(b.id);
    } finally {
      rnd.mockRestore();
      if (desc) Object.defineProperty(crypto, 'randomUUID', desc);
    }
  });

  it('randomUUID が使える環境ではそれを使う', async () => {
    const fixed = '11111111-1111-4111-8111-111111111111';
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(fixed);
    try {
      const meta = await getLibrary().put('svc', 'a.txt', 'text/plain', new Blob(['x']));
      // 自前の組み立てへ落ちると別の値になる。
      expect(meta.id).toBe(fixed);
    } finally {
      spy.mockRestore();
    }
  });
});

// --- 上限ちょうどは消さない --------------------------------------------

describe('Library — 容量がちょうど上限のときは消さない', () => {
  it('合計が 50 MB ちょうどなら 1 つも間引かない', async () => {
    const lib = getLibrary();
    const sized = (size: number, name: string) => {
      const b = new Blob(['x'], { type: 'text/plain' });
      Object.defineProperty(b, 'size', { value: size, configurable: true });
      return lib.put('svc', name, 'text/plain', b);
    };
    const HALF = 25 * 1024 * 1024;
    await sized(HALF, 'a.bin');
    await sized(HALF, 'b.bin');
    expect(await lib.totalBytes()).toBe(50 * 1024 * 1024);
    expect(await lib.list()).toHaveLength(2);
  });
});

// --- 保管庫の作り直し --------------------------------------------------

describe('Library — 既にある DB を開き直す', () => {
  it('2 回目以降は作り直さずに中身を引き継ぐ', async () => {
    const first = getLibrary();
    await first.put('svc', 'keep.txt', 'text/plain', new Blob(['x']));

    _resetLibraryForTests();
    const second = getLibrary();
    // シングルトンを捨てているので別のインスタンスになる
    expect(second).not.toBe(first);
    // DB は作り直されないので中身は残る
    expect((await second.list()).map((it) => it.filename)).toContain('keep.txt');
  });
});

describe('Library — 保存時刻', () => {
  it('createdAt は実時刻で、入れた順に厳密に増える', async () => {
    // 同じミリ秒に複数入っても順序が決まるように、内部時刻は
    // 「前回 + 1」と「今」の**大きいほう**を採る。小さいほうを採ると
    // 1 から数える連番になり、増えてはいるが**実時刻ではなくなる** —
    // 画面には 1970 年として出るし、日付での絞り込みも効かなくなる。
    const lib = getLibrary();
    for (const n of ['a.txt', 'b.txt', 'c.txt']) {
      await lib.put('svc', n, 'text/plain', new Blob(['x']));
    }
    const stamps = (await lib.list()).map((it) => it.createdAt).reverse();

    const YEAR_2020 = Date.parse('2020-01-01T00:00:00.000Z');
    for (const t of stamps) expect(t).toBeGreaterThan(YEAR_2020);
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i]!).toBeGreaterThan(stamps[i - 1]!);
    }
  });
});
