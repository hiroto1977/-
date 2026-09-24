/**
 * **ストアを変えたら、読んでいる画面に必ず届く** (2026-09-24 · パス 448)。
 *
 * 2026-09-24 まで、知らせる仕組みは `useCollection` の中に在った —— つまり
 * **hook を通らない書き込みは、どの画面にも届かなかった**。出荷コードに 3 本在り
 * (コネクタ実行 / 点検パネルの削除 / バックアップの復元)、いちばん重いのは
 * **同じ画面の中で起きる** 3 本目である。実測と表は
 * `data/collectionChange.ts` の docblock に在る。
 *
 * この検査の背骨は**振る舞い** —— 実物のストアに購読者を付け、各メソッドを
 * 実際に呼んで「届いたか」を数える。字面 (`notifyRecordStoreChanged(` が
 * 何回書かれているか) では、**呼ばれない所に書かれていても緑になる**。
 *
 * 母集団は**公開の契約から走る** —— `store.ts` の `export interface RecordStore`
 * の成員名を原文から拾い、実物の prototype と**両方向**で突き合わせる。
 * 走査が古びれば (契約に足したのに走らない・走るのに契約に無い) その場で鳴る。
 * そのうえで台帳が 1 つずつ `notifies` / `silent` を名乗り、**理由を書かせる**。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { getRecordStore, type RecordStore } from '../store';
import {
  notifyRecordStoreChanged,
  subscribeCollection,
  _resetCollectionSubscribersForTests,
} from '../collectionChange';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

const SRC = join(process.cwd(), 'src/renderer/data/store.ts');

/** 形の表が受ける販売記録 1 件 (落とされない標本)。 */
const ROW = { date: '2026-08-01', channel: 'shopify', amount: 1000, orders: 1 } as const;

/** 台帳の 1 行 —— 分類と、**実際に走らせる手順**。 */
interface Row {
  readonly name: string;
  /** notifies = 中身が変わるので知らせる / silent = 変わらないので知らせない。 */
  readonly kind: 'notifies' | 'silent';
  readonly why: string;
  /** その成員を 1 回だけ働かせる。 */
  run(store: RecordStore): Promise<unknown>;
}

const LEDGER: readonly Row[] = [
  {
    name: 'insert',
    kind: 'notifies',
    why: '1 件増える。コネクタ実行のシンクはここを直接叩く (hook を通らない)。',
    run: (s) => s.insert('sales-entries', { ...ROW }),
  },
  {
    name: 'insertMany',
    kind: 'notifies',
    why: 'CSV 取り込み。1 トランザクションで複数件増える。',
    run: (s) => s.insertMany('sales-entries', [{ ...ROW }, { ...ROW, amount: 2000 }]),
  },
  {
    name: 'update',
    kind: 'notifies',
    why: '中身が書き換わる。パラメータの上書きはこの経路で 1 レコードを直す。',
    run: async (s) => {
      const rec = await s.insert('sales-entries', { ...ROW });
      resetCount();
      return s.update(rec.id, { amount: 9000 });
    },
  },
  {
    name: 'remove',
    kind: 'notifies',
    why: '1 件消える。点検パネルの削除 (`deleteRecords`) はここを直接叩く。',
    run: async (s) => {
      const rec = await s.insert('sales-entries', { ...ROW });
      resetCount();
      return s.remove(rec.id);
    },
  },
  {
    name: 'clearCollection',
    kind: 'notifies',
    why: 'その collection が空になる。',
    run: (s) => s.clearCollection('sales-entries'),
  },
  {
    name: 'importAll',
    kind: 'notifies',
    why: 'バックアップの復元。**全 collection** が入れ替わりうる (replace)。',
    run: (s) =>
      s.importAll(
        [{ id: 'imported-1', collection: 'sales-entries', createdAt: 1, updatedAt: 1, data: { ...ROW } }],
        { replace: true },
      ),
  },
  {
    name: 'reencryptAll',
    kind: 'silent',
    why:
      '**復号した中身は構造上 1 ビットも変わらない** (同じ平文を別の鍵で包み直すだけ)。' +
      'しかも 1 件ずつ直列に書くので、ここで知らせると 1,000 件の移行が ' +
      '「件数 × 読んでいる hook」回の全件読み直しになる (O(n²))。費用ではなく**中身が同じ**が理由である。',
    run: (s) => s.reencryptAll(),
  },
  {
    name: 'configureCipher',
    kind: 'silent',
    why: '包み方を差し替えるだけで、保管されている行は 1 件も動かない。',
    run: async (s) => { s.configureCipher({ encrypt: async (d) => d, decrypt: async (d) => d }); },
  },
  {
    name: 'list',
    kind: 'silent',
    why: '読みだけ。ここで知らせると、知らせを受けた hook がまた list を呼んで止まらなくなる。',
    run: (s) => s.list('sales-entries'),
  },
  { name: 'get', kind: 'silent', why: '読みだけ。1 件を引くので中身は動かない。', run: (s) => s.get('nope') },
  { name: 'count', kind: 'silent', why: '読みだけ。件数を数えるので中身は動かない。', run: (s) => s.count('sales-entries') },
  {
    name: 'exportAll',
    kind: 'silent',
    why: '読みだけ (バックアップの書き出し)。封緘済みの payload は封緘のまま返す。',
    run: (s) => s.exportAll(),
  },
];

let fired = 0;
function resetCount(): void {
  fired = 0;
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  resetCount();
  subscribeCollection('sales-entries', () => {
    fired++;
  });
});

/** `export interface RecordStore { … }` の成員名を原文から拾う。 */
function declaredMembers(): readonly string[] {
  const src = readOriginalSource(SRC);
  const start = src.indexOf('export interface RecordStore {');
  expect(start).toBeGreaterThan(-1);
  // 本体は最初の「行頭の }」まで (入れ子の型引数は行頭に来ない)。
  const rest = src.slice(start);
  const end = rest.indexOf('\n}');
  expect(end).toBeGreaterThan(-1);
  const body = rest.slice(0, end);
  const names = new Set<string>();
  for (const line of body.split('\n').slice(1)) {
    const m = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*[<(]/.exec(line);
    if (m && m[1] !== undefined) names.add(m[1]);
  }
  return [...names].sort();
}

function prototypeMembers(): readonly string[] {
  const proto = Object.getPrototypeOf(getRecordStore()) as object;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor')
    .sort();
}

describe('母集団: 公開の契約と実物と台帳', () => {
  it('走査した成員は実物の prototype に在る (走査が古びたら鳴る)', () => {
    const proto = new Set(prototypeMembers());
    const missing = declaredMembers().filter((n) => !proto.has(n));
    expect(missing).toEqual([]);
  });

  it('★ 契約の成員はすべて台帳に在る (新しいメソッドは分類を書かせる)', () => {
    const ledger = new Set(LEDGER.map((r) => r.name));
    const unlisted = declaredMembers().filter((n) => !ledger.has(n));
    expect(unlisted).toEqual([]);
  });

  it('★ 台帳の行はすべて契約の成員である (逆向き)', () => {
    const declared = new Set(declaredMembers());
    const stale = LEDGER.map((r) => r.name).filter((n) => !declared.has(n));
    expect(stale).toEqual([]);
  });

  it('走査が空虚でない (床)', () => {
    expect(declaredMembers().length).toBeGreaterThanOrEqual(12);
  });

  it('理由は省略しない', () => {
    for (const r of LEDGER) expect(r.why.length, r.name).toBeGreaterThanOrEqual(10);
  });

  it('床: 中身を変える成員が 6 つ以上ある (分類が片側に倒れていない)', () => {
    expect(LEDGER.filter((r) => r.kind === 'notifies').length).toBeGreaterThanOrEqual(6);
  });
});

describe('振る舞い: 台帳どおりに届く / 届かない', () => {
  for (const row of LEDGER.filter((r) => r.kind === 'notifies')) {
    it(`★ ${row.name} は読んでいる画面へ届く`, async () => {
      await row.run(getRecordStore());
      expect(fired).toBeGreaterThanOrEqual(1);
    });
  }

  for (const row of LEDGER.filter((r) => r.kind === 'silent')) {
    it(`${row.name} は知らせない (${row.why.slice(0, 18)}…)`, async () => {
      await getRecordStore().insert('sales-entries', { ...ROW });
      resetCount();
      await row.run(getRecordStore());
      expect(fired).toBe(0);
    });
  }
});

describe('配る先は collection で絞らない', () => {
  it('★ 別の collection を見ている hook にも届く (remove / importAll は collection を知らない)', async () => {
    let other = 0;
    subscribeCollection('kpi-actuals', () => {
      other++;
    });
    await getRecordStore().insert('sales-entries', { ...ROW });
    expect(other).toBeGreaterThanOrEqual(1);
  });

  it('解除すると届かなくなる', async () => {
    let n = 0;
    const off = subscribeCollection('kpi-actuals', () => {
      n++;
    });
    notifyRecordStoreChanged();
    expect(n).toBe(1);
    off();
    notifyRecordStoreChanged();
    expect(n).toBe(1);
  });
});
