/** @vitest-environment jsdom */
/**
 * RecordStore の入力ガードと不変条件のテスト。
 *
 * 背景 — `store.ts` はファイル冒頭で 13 種の mutator を**ファイル全体**に対して
 * `Stryker disable` しており (末尾に restore はあるが実装全体が挟まれている)、
 * 変異検査は 3 変異体・100% と報告していた。無効化を外して実測すると
 * **256 変異体・71.09%・生存 44 / 未到達 30** で、業務データの永続化層は
 * ほぼ測られていなかった。「測っていない」は「緑」ではない。
 *
 * とくに以下は**実装されているのに何も証明していないガード**だった:
 *
 * - `isSafeCollection` — コレクション名の書式 (IndexedDB の索引キーになる)
 * - `isPlainJsonObject` — クラスインスタンス / 配列 / 異常なプロトタイプの拒否
 * - `update` / `get` / `remove` の id ガード
 * - `monotonicNow` — 同一ミリ秒でも createdAt が単調増加する (並び順の土台)
 *
 * ここでは**公開 API 越しに**契約を固定する。内部関数を export して直接叩くと、
 * 「関数は正しいが呼ばれていない」を見逃す (今セッションで 2 回起きた形)。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getRecordStore, _resetRecordStoreForTests } from '../store';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  await clearIdb();
});

// ===== コレクション名の書式 =============================================
//
// /^[a-z][a-z0-9-]{0,63}$/ — 先頭は英小文字、以降は英小文字/数字/ハイフン、
// 全体 1〜64 文字。索引キーになるので、ここが緩むと別コレクションの
// レコードが混ざる経路になる。

describe('コレクション名 — 受け付ける形', () => {
  it('1 文字の英小文字を受ける (下限)', async () => {
    const rec = await getRecordStore().insert('a', { v: 1 });
    expect(rec.collection).toBe('a');
  });

  it('ハイフンと数字を含む名前を受ける', async () => {
    const rec = await getRecordStore().insert('business-units2', { v: 1 });
    expect(rec.collection).toBe('business-units2');
  });

  it('64 文字ちょうどを受ける (上限)', async () => {
    const name = 'a'.repeat(64);
    const rec = await getRecordStore().insert(name, { v: 1 });
    expect(rec.collection).toBe(name);
  });
});

describe('コレクション名 — 拒否する形', () => {
  it('65 文字は拒否する (上限の外側)', async () => {
    await expect(getRecordStore().insert('a'.repeat(65), { v: 1 })).rejects.toThrow('collection が不正です');
  });

  it('空文字は拒否する', async () => {
    await expect(getRecordStore().insert('', { v: 1 })).rejects.toThrow('collection が不正です');
  });

  it('大文字始まりは拒否する', async () => {
    await expect(getRecordStore().insert('Sales', { v: 1 })).rejects.toThrow('collection が不正です');
  });

  it('数字始まりは拒否する (先頭の文字クラス)', async () => {
    await expect(getRecordStore().insert('1sales', { v: 1 })).rejects.toThrow('collection が不正です');
  });

  it('ハイフン始まりは拒否する', async () => {
    await expect(getRecordStore().insert('-sales', { v: 1 })).rejects.toThrow('collection が不正です');
  });

  it('アンダースコアを含む名前は拒否する', async () => {
    await expect(getRecordStore().insert('sales_2026', { v: 1 })).rejects.toThrow('collection が不正です');
  });

  it('空白を含む名前は拒否する', async () => {
    await expect(getRecordStore().insert('my sales', { v: 1 })).rejects.toThrow('collection が不正です');
  });

  it('改行を挟んだ名前は拒否する (行アンカーであって行頭/行末ではない)', async () => {
    await expect(getRecordStore().insert('sales\nX', { v: 1 })).rejects.toThrow('collection が不正です');
  });

  it('文字列でない値は拒否する', async () => {
    await expect(getRecordStore().insert(123 as unknown as string, { v: 1 })).rejects.toThrow('collection が不正です');
  });

  it('insertMany も同じ書式で拒否する', async () => {
    await expect(getRecordStore().insertMany('Sales', [{ v: 1 }])).rejects.toThrow('collection が不正です');
  });
});

// ===== 保存できる値の形 =================================================
//
// IndexedDB の structured clone を通らない値と、クラスインスタンスを弾く。

describe('保存する値 — 拒否する形', () => {
  const bad: readonly (readonly [string, unknown])[] = [
    ['配列', [1, 2, 3]],
    ['null', null],
    ['文字列', 'x'],
    ['数値', 1],
    ['真偽値', true],
    ['関数', () => 1],
    ['Date', new Date(0)],
    ['Map', new Map()],
  ];

  for (const [label, value] of bad) {
    it(`${label} は拒否する`, async () => {
      await expect(getRecordStore().insert('sales', value as Record<string, unknown>))
        .rejects.toThrow('data はプレーンなオブジェクトである必要があります');
    });
  }

  it('クラスインスタンスは拒否する (プロトタイプが Object.prototype でない)', async () => {
    class Thing { constructor(public v = 1) {} }
    await expect(getRecordStore().insert('sales', new Thing() as unknown as Record<string, unknown>))
      .rejects.toThrow('data はプレーンなオブジェクトである必要があります');
  });

  it('insertMany は 1 行でも不正なら**バッチ全体**を拒否する', async () => {
    await expect(getRecordStore().insertMany('sales', [{ ok: 1 }, [] as unknown as Record<string, unknown>]))
      .rejects.toThrow('data はプレーンなオブジェクトである必要があります');
  });

  it('insertMany が拒否したとき 1 件も保存されていない (部分適用しない)', async () => {
    await getRecordStore().insertMany('sales', [{ ok: 1 }, [] as unknown as Record<string, unknown>]).catch(() => null);
    expect(await getRecordStore().count('sales')).toBe(0);
  });

  it('update の patch も同じ規則で拒否する', async () => {
    const rec = await getRecordStore().insert('sales', { v: 1 });
    await expect(getRecordStore().update(rec.id, [] as unknown as Record<string, unknown>))
      .rejects.toThrow('patch はプレーンなオブジェクトである必要があります');
  });
});

describe('保存する値 — 受け付ける形', () => {
  it('素のオブジェクトを受ける', async () => {
    const rec = await getRecordStore().insert('sales', { amount: 1 });
    expect(rec.data).toEqual({ amount: 1 });
  });

  it('プロトタイプ無しのオブジェクト (Object.create(null)) を受ける', async () => {
    const v = Object.create(null) as Record<string, unknown>;
    v.amount = 2;
    const rec = await getRecordStore().insert('sales', v);
    expect(rec.data.amount).toBe(2);
  });

  it('空オブジェクトを受ける', async () => {
    const rec = await getRecordStore().insert('sales', {});
    expect(rec.data).toEqual({});
  });
});

// ===== id ガード =========================================================

describe('id ガード — 不正な id で DB を触らない', () => {
  it('get は空文字で null を返す', async () => {
    expect(await getRecordStore().get('')).toBeNull();
  });

  it('get は文字列でない id で null を返す', async () => {
    expect(await getRecordStore().get(undefined as unknown as string)).toBeNull();
  });

  it('update は空文字で null を返す (patch 検証より前)', async () => {
    expect(await getRecordStore().update('', { v: 1 })).toBeNull();
  });

  it('update は文字列でない id で null を返す', async () => {
    expect(await getRecordStore().update(null as unknown as string, { v: 1 })).toBeNull();
  });

  it('存在しない id の update は null を返す', async () => {
    expect(await getRecordStore().update('no-such-id', { v: 1 })).toBeNull();
  });
});

// ===== 単調増加するタイムスタンプ =========================================
//
// 同一ミリ秒に複数件入れても createdAt が同値にならない。並び順の土台。

describe('タイムスタンプ — 同一ミリ秒でも単調増加する', () => {
  it('連続 insert の createdAt が厳密に増加する', async () => {
    const store = getRecordStore();
    const a = await store.insert('sales', { i: 1 });
    const b = await store.insert('sales', { i: 2 });
    const c = await store.insert('sales', { i: 3 });
    expect(b.createdAt).toBeGreaterThan(a.createdAt);
    expect(c.createdAt).toBeGreaterThan(b.createdAt);
  });

  it('insertMany の各行も互いに異なる createdAt を持つ', async () => {
    const rows = await getRecordStore().insertMany('sales', [{ i: 1 }, { i: 2 }, { i: 3 }]);
    const stamps = rows.map((r) => r.createdAt);
    expect(new Set(stamps).size).toBe(rows.length);
  });

  it('update した updatedAt は createdAt より後になる', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { v: 1 });
    const updated = await store.update(rec.id, { v: 2 });
    expect(updated?.updatedAt).toBeGreaterThan(rec.createdAt);
  });

  it('update しても createdAt は動かない', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { v: 1 });
    const updated = await store.update(rec.id, { v: 2 });
    expect(updated?.createdAt).toBe(rec.createdAt);
  });
});

// ===== 空バッチ ==========================================================

describe('insertMany — 空配列', () => {
  it('空配列は空を返す', async () => {
    expect(await getRecordStore().insertMany('sales', [])).toEqual([]);
  });

  it('空配列は 1 件も足さない', async () => {
    await getRecordStore().insertMany('sales', []);
    expect(await getRecordStore().count('sales')).toBe(0);
  });
});

// ===== id の生成 =========================================================

describe('id の生成', () => {
  it('crypto.randomUUID がある環境では UUID 形式になる', async () => {
    const rec = await getRecordStore().insert('sales', { v: 1 });
    expect(rec.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('randomUUID が無い環境でも v4 形式の id を作る (フォールバック経路)', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const rec = await getRecordStore().insert('sales', { v: 1 });
      expect(rec.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
    }
  });

  it('id は重複しない', async () => {
    const store = getRecordStore();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) ids.add((await store.insert('sales', { i })).id);
    expect(ids.size).toBe(20);
  });
});

// ===== remove / count のガード ===========================================

describe('remove — 不正な id で何もしない', () => {
  it('空文字の remove は既存レコードを消さない', async () => {
    const store = getRecordStore();
    await store.insert('sales', { v: 1 });
    await store.remove('');
    expect(await store.count('sales')).toBe(1);
  });

  it('文字列でない id の remove は既存レコードを消さない', async () => {
    const store = getRecordStore();
    await store.insert('sales', { v: 1 });
    await store.remove(undefined as unknown as string);
    expect(await store.count('sales')).toBe(1);
  });

  it('正しい id の remove は消す (対照)', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { v: 1 });
    await store.remove(rec.id);
    expect(await store.count('sales')).toBe(0);
  });
});

describe('count — コレクション名を検証する', () => {
  it('不正なコレクション名は拒否する', async () => {
    await expect(getRecordStore().count('Sales')).rejects.toThrow('collection が不正です');
  });

  it('正しいコレクション名は数を返す (対照)', async () => {
    const store = getRecordStore();
    await store.insert('sales', { v: 1 });
    expect(await store.count('sales')).toBe(1);
  });
});

// ===== 並び順 — 新しいものが先 ===========================================

describe('並び順 — list / exportAll は新しい順', () => {
  it('list は createdAt の新しい順に返す', async () => {
    const store = getRecordStore();
    const a = await store.insert('sales', { i: 1 });
    const b = await store.insert('sales', { i: 2 });
    const c = await store.insert('sales', { i: 3 });
    const ids = (await store.list('sales')).map((r) => r.id);
    expect(ids).toEqual([c.id, b.id, a.id]);
  });

  // id は uuid なので、insert で作ると「キー順」と「時刻順」がたまたま
  // 一致することがある。並べ替えを消しても通ってしまうため、id を明示して
  // **キー順と時刻順が逆になる**ように置く。
  it('exportAll は新しい順に返す (キー順とは逆になる並びで確認)', async () => {
    const store = getRecordStore();
    await store.importAll([
      { id: 'a-oldest', collection: 'sales', createdAt: 1, updatedAt: 1, data: { i: 1 } },
      { id: 'z-newest', collection: 'sales', createdAt: 999, updatedAt: 999, data: { i: 2 } },
    ] as never);
    const ids = (await store.exportAll()).map((r) => r.id);
    expect(ids).toEqual(['z-newest', 'a-oldest']);
  });

  it('list も同じくキー順ではなく時刻順で返す', async () => {
    const store = getRecordStore();
    await store.importAll([
      { id: 'a-oldest', collection: 'sales', createdAt: 1, updatedAt: 1, data: { i: 1 } },
      { id: 'z-newest', collection: 'sales', createdAt: 999, updatedAt: 999, data: { i: 2 } },
    ] as never);
    const ids = (await store.list('sales')).map((r) => r.id);
    expect(ids).toEqual(['z-newest', 'a-oldest']);
  });
});

// ===== バックアップ取り込み — 壊れたレコードを落とす =======================
//
// importAll は**信用できないバックアップファイル**を読む入口。壊れた行を
// 落として良い行だけ戻す (throw しない) 契約なので、何が落ちるかを固定する。

describe('importAll — 壊れたレコードを落とす', () => {
  const good = { id: 'r1', collection: 'sales', createdAt: 1, updatedAt: 2, data: { v: 1 } };

  const broken: readonly (readonly [string, unknown])[] = [
    ['id が空', { ...good, id: '' }],
    ['id が数値', { ...good, id: 7 }],
    ['collection が不正な書式', { ...good, collection: 'Sales' }],
    ['collection が無い', { id: 'r1', createdAt: 1, updatedAt: 2, data: {} }],
    ['createdAt が文字列', { ...good, createdAt: '1' }],
    ['updatedAt が無い', { id: 'r1', collection: 'sales', createdAt: 1, data: {} }],
    ['data が配列', { ...good, data: [1] }],
    ['data が無い', { id: 'r1', collection: 'sales', createdAt: 1, updatedAt: 2 }],
    ['レコードが配列', [1, 2]],
    ['レコードが null', null],
    ['レコードが文字列', 'x'],
  ];

  for (const [label, rec] of broken) {
    it(`${label} は取り込まない`, async () => {
      const n = await getRecordStore().importAll([rec] as never);
      expect(n).toBe(0);
    });
  }

  it('正しいレコードは取り込む (対照)', async () => {
    const n = await getRecordStore().importAll([good] as never);
    expect(n).toBe(1);
  });

  it('壊れた行が混ざっていても良い行は復元する', async () => {
    const n = await getRecordStore().importAll([good, { ...good, id: '' }] as never);
    expect(n).toBe(1);
  });

  it('取り込んだレコードは読み出せる', async () => {
    await getRecordStore().importAll([good] as never);
    expect((await getRecordStore().get('r1'))?.data).toEqual({ v: 1 });
  });
});

describe('importAll — replace 指定', () => {
  const incoming = { id: 'r9', collection: 'sales', createdAt: 1, updatedAt: 2, data: { v: 9 } };

  it('replace 無しでは既存レコードを残す (マージ)', async () => {
    const store = getRecordStore();
    await store.insert('sales', { v: 1 });
    await store.importAll([incoming] as never);
    expect(await store.count('sales')).toBe(2);
  });

  it('replace: true は既存を消してから入れる', async () => {
    const store = getRecordStore();
    await store.insert('sales', { v: 1 });
    await store.importAll([incoming] as never, { replace: true });
    expect(await store.count('sales')).toBe(1);
  });

  it('replace: false は残す (既定と同じ)', async () => {
    const store = getRecordStore();
    await store.insert('sales', { v: 1 });
    await store.importAll([incoming] as never, { replace: false });
    expect(await store.count('sales')).toBe(2);
  });
});

// ===== タイムスタンプが実時刻に追随する ==================================
//
// 「単調増加」だけでは足りない。1,2,3… と増えるだけでも単調ではあるので、
// 実時刻に乗っていることまで固定する。

describe('タイムスタンプ — 実時刻に乗っている', () => {
  it('createdAt が現在時刻の近傍にある (連番ではない)', async () => {
    const before = Date.now();
    const rec = await getRecordStore().insert('sales', { v: 1 });
    expect(rec.createdAt).toBeGreaterThanOrEqual(before);
    expect(rec.createdAt).toBeLessThan(before + 60_000);
  });
});

// ===== randomUUID があるときは実際にそれを使う ============================

describe('id 生成 — randomUUID があれば使う', () => {
  it('crypto.randomUUID の戻り値がそのまま id になる', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    const stub = '12345678-1234-4234-8234-123456789abc';
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: () => stub, configurable: true });
    try {
      const rec = await getRecordStore().insert('sales', { v: 1 });
      expect(rec.id).toBe(stub);
    } finally {
      if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
    }
  });
});

// ===== ガードは「DB を触らない」ことが役目 ================================
//
// 不正な入力で null を返すだけなら、ガードを外しても IndexedDB 側が同じ結果を
// 返すことがある (空文字は IDB でも有効なキーなので undefined が返るだけ)。
// つまり戻り値だけを見ていると、ガードが消えても気付けない。
// ガードの目的は**接続を開かないこと**なので、そこを直接観測する。

function countingOpen(): { calls: () => number; restore: () => void } {
  const original = indexedDB.open.bind(indexedDB);
  let n = 0;
  indexedDB.open = ((name: string, version?: number) => {
    n++;
    return original(name, version);
  }) as typeof indexedDB.open;
  return { calls: () => n, restore: () => { indexedDB.open = original; } };
}

describe('入力ガード — 不正な入力では DB を開かない', () => {
  it('get は空文字で DB を開かない', async () => {
    const spy = countingOpen();
    try {
      await getRecordStore().get('');
      expect(spy.calls()).toBe(0);
    } finally { spy.restore(); }
  });

  it('update は空文字で DB を開かない', async () => {
    const spy = countingOpen();
    try {
      await getRecordStore().update('', { v: 1 });
      expect(spy.calls()).toBe(0);
    } finally { spy.restore(); }
  });

  it('remove は空文字で DB を開かない', async () => {
    const spy = countingOpen();
    try {
      await getRecordStore().remove('');
      expect(spy.calls()).toBe(0);
    } finally { spy.restore(); }
  });

  it('insertMany は空配列で DB を開かない', async () => {
    const spy = countingOpen();
    try {
      await getRecordStore().insertMany('sales', []);
      expect(spy.calls()).toBe(0);
    } finally { spy.restore(); }
  });

  it('正しい入力では DB を開く (対照 — 数えている側が動いている証拠)', async () => {
    const spy = countingOpen();
    try {
      await getRecordStore().get('some-id');
      expect(spy.calls()).toBeGreaterThan(0);
    } finally { spy.restore(); }
  });
});

// ===== バックアップ検証 — 長さを持つ非文字列 ==============================

describe('importAll — 文字列でないのに length を持つ値', () => {
  it('id が配列のレコードは取り込まない (typeof の検査が効いている)', async () => {
    const rec = { id: ['a'], collection: 'sales', createdAt: 1, updatedAt: 2, data: { v: 1 } };
    expect(await getRecordStore().importAll([rec] as never)).toBe(0);
  });
});

// ===== 書き込みの失敗が呼び出し元へ伝わる ================================
//
// txDone のエラー経路。id を固定して同じキーを二重に add させると
// ConstraintError でトランザクションが中断する。ここが握り潰されていると
// 「保存できていないのに成功した」ことになる。

describe('書き込みの失敗', () => {
  it('同じ id が二重に来ると insert が失敗する (トランザクションの中断が伝わる)', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => 'fixed-id-0000-0000-0000-000000000000',
      configurable: true,
    });
    try {
      const store = getRecordStore();
      await store.insert('sales', { v: 1 });
      await expect(store.insert('sales', { v: 2 })).rejects.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
    }
  });

  it('失敗した 2 件目は保存されていない', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => 'fixed-id-1111-1111-1111-111111111111',
      configurable: true,
    });
    try {
      const store = getRecordStore();
      await store.insert('sales', { v: 1 });
      await store.insert('sales', { v: 2 }).catch(() => null);
      expect(await store.count('sales')).toBe(1);
    } finally {
      if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
    }
  });
});

// ===== UUID フォールバックの桁揃え =======================================
//
// padStart(2, '0') を消しても、その回の乱数にたまたま 0x10 未満のバイトが
// 無ければ 32 桁のままになり検査を素通りする (実測で約 36% の確率)。
// 乱数を固定して必ず小さいバイトを含ませる。

describe('UUID フォールバック — 桁揃え', () => {
  it('0x10 未満のバイトが含まれても 32 桁になる', async () => {
    const uuidDesc = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    const valuesDesc = Object.getOwnPropertyDescriptor(globalThis.crypto, 'getRandomValues');
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    Object.defineProperty(globalThis.crypto, 'getRandomValues', {
      // 全バイト 0x00 — padStart が無いと "0" 1 桁になり全体が短くなる。
      value: (arr: Uint8Array) => arr.fill(0x00),
      configurable: true,
    });
    try {
      const rec = await getRecordStore().insert('sales', { v: 1 });
      expect(rec.id).toBe('00000000-0000-4000-8000-000000000000');
    } finally {
      if (uuidDesc) Object.defineProperty(globalThis.crypto, 'randomUUID', uuidDesc);
      if (valuesDesc) Object.defineProperty(globalThis.crypto, 'getRandomValues', valuesDesc);
    }
  });
});

// ===== 失敗しても接続を閉じる ============================================
//
// 実際に見つかった不具合の再発防止。各メソッドは
//   const db = await openDb(); ... await txDone(tx); db.close();
// と書かれており、`txDone` が reject すると `db.close()` に到達しなかった。
// 書き込みが失敗するたびに接続が残り、溜まると以後のバージョン変更や
// deleteDatabase が blocked になる (このテストを書いた時点で、二重 id の
// テストが 30 秒でタイムアウトする形で実際に表面化した)。

describe('接続の後始末', () => {
  function countingClose(): { calls: () => number; restore: () => void } {
    const proto = IDBDatabase.prototype as unknown as { close: () => void };
    const original = proto.close;
    let n = 0;
    proto.close = function patched(this: IDBDatabase) {
      n++;
      return original.call(this);
    };
    return { calls: () => n, restore: () => { proto.close = original; } };
  }

  it('書き込みが成功したとき接続を閉じる', async () => {
    const spy = countingClose();
    try {
      await getRecordStore().insert('sales', { v: 1 });
      expect(spy.calls()).toBeGreaterThan(0);
    } finally { spy.restore(); }
  });

  it('書き込みが失敗しても接続を閉じる', async () => {
    const uuidDesc = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => 'dup-id-2222-2222-2222-222222222222',
      configurable: true,
    });
    const store = getRecordStore();
    await store.insert('sales', { v: 1 });
    const spy = countingClose();
    try {
      await store.insert('sales', { v: 2 }).catch(() => null);
      expect(spy.calls()).toBeGreaterThan(0);
    } finally {
      spy.restore();
      if (uuidDesc) Object.defineProperty(globalThis.crypto, 'randomUUID', uuidDesc);
    }
  });

  it('読み出しが失敗しても接続を閉じる', async () => {
    const spy = countingClose();
    const proto = IDBObjectStore.prototype as unknown as { get: (k: unknown) => IDBRequest };
    const originalGet = proto.get;
    proto.get = function boom() { throw new Error('read boom'); };
    try {
      await getRecordStore().get('some-id').catch(() => null);
      expect(spy.calls()).toBeGreaterThan(0);
    } finally {
      proto.get = originalGet;
      spy.restore();
    }
  });
});
