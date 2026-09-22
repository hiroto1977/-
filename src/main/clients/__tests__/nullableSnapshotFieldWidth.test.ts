/**
 * **`X | null` を宣言する欄は、見本も同じ幅である。** (2026-09-22 · パス 410)
 *
 * 隣の `snapshotFieldWidth.test.ts` が 2026-09-14 (パス 264) から
 * 「見本の型は、実物の型より狭くてはならない」を持っているが、**その母集団は
 * 真偽値 13 欄だけ**だった。真偽値が狭いと「起きない枝」ができる (煩わしい)。
 * **`X | null` が狭いと画面が落ちる。**
 *
 * 実測 (2026-09-22 · 直す前・実物の `fetchBaseSnapshot` に
 * `{"items":[{"item_id":1,"title":"商品A","visible":1}]}` を食わせて描く):
 *
 * | 画面 | 壊し方 | 直す前 |
 * | --- | --- | --- |
 * | BASE | `price` の無い商品が 1 件 | **`Cannot read properties of undefined (reading 'toLocaleString')`** |
 * | Canva | `thumbnail: {url: 42}` | **`url.replace is not a function`** (`safeImageSrc` が投げる) |
 * | GitHub / Notion / Drive / WordPress / Microsoft 365 | 日付の欄 | パス 409 / 410 で閉じた同じ形 |
 *
 * ★ **見本が「型の出どころ」である** —— 画面は `useServiceData(id, SNAPSHOT[id])`
 *   で描くので、`T` は client の宣言ではなく**見本のリテラル**から推論される。
 *   client が `price: number | null` に広げても、見本が `6800` のままなら
 *   画面は `.toLocaleString()` を呼べてしまい、`npm run typecheck` も黙る。
 *   だから**両方を型で突き合わせる**必要が在る。
 *
 * ★ **写しが在るのには理由が在る** —— `snapshot.ts` は renderer に在り、
 *   `main/clients/*` は main なので、`lint:imports` の境界を越えて型を
 *   import できない (実測: 70 近い client が `*Snapshot` を export するのに、
 *   `snapshot.ts` が import しているのは `shared/api/cursor.ts` の
 *   `CursorSnapshot` **1 つだけ**)。検査は境界の外に居られるので、
 *   **一致を保つのはここの仕事になる**。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource, readOriginalDirEntries } from '../../../shared/__tests__/originalSource';

import type { BaseSnapshot } from '../base';
import type { DevEnvSnapshot } from '../devEnv';
import type { DriveSnapshot } from '../drive';
import type { FundingSnapshot } from '../funding';
import type { GithubSnapshot } from '../github';
import type { SystemSnapshot } from '../linux';
import type { Microsoft365Snapshot } from '../microsoft-365';
import type { NotionSnapshot } from '../notion';
import type { StocksSnapshot } from '../stocks';
import type { WordPressSnapshot } from '../wordpress';
import type { CursorSnapshot } from '../../../shared/api/cursor';
import { SNAPSHOT } from '../../../renderer/data/snapshot';

/** `A` と `B` が**同じ幅**なら true。片方が狭ければ false。 */
type SameWidth<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** その型は `null` を含むか。 */
type AdmitsNull<T> = [null] extends [T] ? true : false;

/**
 * **見るのは「`null` を含むか」だけで、構造の同一性ではない。**
 *
 * 隣の `snapshotFieldWidth.test.ts` は真偽値なので `SameWidth` をそのまま
 * 使えるが、`ProjectInfo | null` のような**物**の欄で構造の同一性を求めると
 * `readonly` の付き方や `string[]` / `readonly string[]` の差で落ちる ——
 * それはこの家系ではない (最初にそう書いて `devEnv.project` が落ち、
 * 実測すると見本は既に `| null` を持ち画面も `devEnv.project && (…)` で
 * 守っていた。**針の側の誤り**だった)。
 *
 * 欠陥そのものは「画面が `null` を取りうる値にメソッドを呼べる」ことなので、
 * 見るべきは `null` の有無ただ 1 つである。
 */
type SameNullability<A, B> = SameWidth<AdmitsNull<A>, AdmitsNull<B>>;

/** 同じ幅でなければ**この呼び出しがコンパイルできない**。 */
function sameWidth<T extends true>(_ok: T): void {
  /* 型で確かめるので実行時にやることは無い */
}

describe('見本の nullable 欄は実物と同じ幅である (型で照合)', () => {
  it('パス 409 / 410 で広げた 8 欄', () => {
    sameWidth<SameNullability<(typeof SNAPSHOT.base.items)[number]['price'], BaseSnapshot['items'][number]['price']>>(true);
    sameWidth<SameNullability<(typeof SNAPSHOT.base.items)[number]['stock'], BaseSnapshot['items'][number]['stock']>>(true);
    sameWidth<SameNullability<(typeof SNAPSHOT.drive.files)[number]['modifiedTime'], DriveSnapshot['files'][number]['modifiedTime']>>(true);
    sameWidth<SameNullability<(typeof SNAPSHOT.github.pullRequests)[number]['updatedAt'], GithubSnapshot['pullRequests'][number]['updatedAt']>>(true);
    sameWidth<SameNullability<(typeof SNAPSHOT.notion.pages)[number]['lastEditedTime'], NotionSnapshot['pages'][number]['lastEditedTime']>>(true);
    sameWidth<SameNullability<(typeof SNAPSHOT.wordpress.sites)[number]['lastUpdated'], WordPressSnapshot['sites'][number]['lastUpdated']>>(true);
    sameWidth<SameNullability<(typeof SNAPSHOT.microsoft365.messages)[number]['received'], Microsoft365Snapshot['messages'][number]['received']>>(true);
    expect(true).toBe(true);
  });

  it('それ以前から nullable だった欄も同じ規則の下に置く', () => {
    sameWidth<SameNullability<typeof SNAPSHOT.linux.devEnv.project, DevEnvSnapshot['project']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.linux.devEnv.git, DevEnvSnapshot['git']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.funding.diversification, FundingSnapshot['diversification']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.stocks.storedNote, StocksSnapshot['storedNote']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.cursor.totals.members, CursorSnapshot['totals']['members']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.cursor.totals.activeDays, CursorSnapshot['totals']['activeDays']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.cursor.totals.spendUsd, CursorSnapshot['totals']['spendUsd']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.linux.load.avg1, SystemSnapshot['load']['avg1']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.linux.load.avg5, SystemSnapshot['load']['avg5']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.linux.load.avg15, SystemSnapshot['load']['avg15']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.linux.load.perCorePct, SystemSnapshot['load']['perCorePct']>>(true);
    sameWidth<SameNullability<typeof SNAPSHOT.linux.load.unavailableNote, SystemSnapshot['load']['unavailableNote']>>(true);
    expect(true).toBe(true);
  });

  it('★ 対照が効くことの標本 —— 狭い型は `SameWidth` が false と言う', () => {
    // 狭い見本 (client が広げたのに見本が数のまま) は false —— これが落ちる形。
    sameWidth<SameWidth<SameNullability<number, number | null>, false>>(true);
    sameWidth<SameWidth<SameNullability<'2026-05-11T09:09:04Z', string | null>, false>>(true);
    // 同じ幅なら true。
    sameWidth<SameWidth<SameNullability<number | null, number | null>, true>>(true);
    // ★ 構造の差では落ちない (`readonly` の付き方はこの家系ではない)。
    sameWidth<
      SameWidth<
        SameNullability<{ scripts: string[] } | null, { readonly scripts: readonly string[] } | null>,
        true
      >
    >(true);
    expect(true).toBe(true);
  });
});

// --- 母集団の走査 (両方向) ------------------------------------------------

/** 実物が `| null` を宣言する欄 → 上の型照合で使っている見本の道。 */
const NULLABLE_LEDGER: Readonly<Record<string, string>> = {
  'base.ts BaseSnapshot.price': 'SNAPSHOT.base.items[number].price',
  'base.ts BaseSnapshot.stock': 'SNAPSHOT.base.items[number].stock',
  'devEnv.ts DevEnvSnapshot.project': 'SNAPSHOT.linux.devEnv.project',
  'devEnv.ts DevEnvSnapshot.git': 'SNAPSHOT.linux.devEnv.git',
  'drive.ts DriveSnapshot.modifiedTime': 'SNAPSHOT.drive.files[number].modifiedTime',
  'funding.ts FundingSnapshot.diversification': 'SNAPSHOT.funding.diversification',
  'github.ts GithubSnapshot.updatedAt': 'SNAPSHOT.github.pullRequests[number].updatedAt',
  'linux.ts SystemSnapshot.avg1': 'SNAPSHOT.linux.load.avg1',
  'linux.ts SystemSnapshot.avg5': 'SNAPSHOT.linux.load.avg5',
  'linux.ts SystemSnapshot.avg15': 'SNAPSHOT.linux.load.avg15',
  'linux.ts SystemSnapshot.perCorePct': 'SNAPSHOT.linux.load.perCorePct',
  'linux.ts SystemSnapshot.unavailableNote': 'SNAPSHOT.linux.load.unavailableNote',
  'microsoft-365.ts Microsoft365Snapshot.received': 'SNAPSHOT.microsoft365.messages[number].received',
  'notion.ts NotionSnapshot.lastEditedTime': 'SNAPSHOT.notion.pages[number].lastEditedTime',
  'stocks.ts StocksSnapshot.storedNote': 'SNAPSHOT.stocks.storedNote',
  'wordpress.ts WordPressSnapshot.lastUpdated': 'SNAPSHOT.wordpress.sites[number].lastUpdated',
  'cursor.ts CursorSnapshot.members': 'SNAPSHOT.cursor.totals.members',
  'cursor.ts CursorSnapshot.activeDays': 'SNAPSHOT.cursor.totals.activeDays',
  'cursor.ts CursorSnapshot.spendUsd': 'SNAPSHOT.cursor.totals.spendUsd',
};

/**
 * `export interface *Snapshot { … }` の中で `| null` を宣言している欄を拾う。
 *
 * 注記は先に落とす —— この検査ファイル自身が説明の中で `number | null` と
 * 書くので、注記を読んだままだと母集団が説明文で膨らむ
 * (法則 `mention-vs-declaration`)。
 */
export function nullableSnapshotFields(src: string, file: string): string[] {
  const out: string[] = [];
  const re = /export interface ([A-Za-z0-9_]*Snapshot[A-Za-z0-9_]*)\s*(?:extends [^{]+)?\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    let end = open;
    for (let j = open; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    const body = src
      .slice(open, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
    for (const f of body.matchAll(/([A-Za-z0-9_]+)\??\s*:\s*([^;\n]*\|\s*null[^;\n]*)/g)) {
      out.push(`${file} ${m[1]}.${f[1]}`);
    }
  }
  return out;
}

describe('母集団: 実物が `| null` を宣言する欄', () => {
  const dir = path.join(__dirname, '..');
  const found: string[] = [];
  for (const entry of readOriginalDirEntries(dir)) {
    const e = typeof entry === 'string' ? entry : entry.name;
    if (!e.endsWith('.ts') || e === 'index.ts' || e === 'types.ts') continue;
    found.push(...nullableSnapshotFields(readOriginalSource(path.join(dir, e)), e));
  }
  found.push(
    ...nullableSnapshotFields(
      readOriginalSource(path.join(__dirname, '..', '..', '..', 'shared', 'api', 'cursor.ts')),
      'cursor.ts',
    ),
  );

  it('走査は実際にこの形を拾う (規則が死んでいないことの標本)', () => {
    const sample = [
      'export interface DemoSnapshot {',
      '  /** 注記の中の `x: string | null` は数えない。 */',
      '  rows: { id: string; when: string | null }[];',
      '  total: number;',
      '  note: string | null;',
      '}',
    ].join('\n');
    expect(nullableSnapshotFields(sample, 'demo.ts')).toEqual([
      'demo.ts DemoSnapshot.when',
      'demo.ts DemoSnapshot.note',
    ]);
  });

  it('走査が空虚でない (床)', () => {
    expect(found.length).toBeGreaterThanOrEqual(15);
  });

  it('母集団の欄はすべて台帳に在る (型の照合を書け)', () => {
    expect(found.filter((f) => NULLABLE_LEDGER[f] === undefined)).toEqual([]);
  });

  it('台帳に在る欄はすべて母集団に在る (消えた欄を残さない)', () => {
    expect(Object.keys(NULLABLE_LEDGER).filter((k) => !found.includes(k))).toEqual([]);
  });

  it('★ 台帳の道はこのファイルの型照合に実際に書かれている', () => {
    const self = readOriginalSource(path.join(__dirname, 'nullableSnapshotFieldWidth.test.ts'));
    const asserted = self.slice(0, self.indexOf('const NULLABLE_LEDGER'));
    const missing = Object.values(NULLABLE_LEDGER).filter((p) => {
      const parts = p.replace('[number]', '').split('.').slice(1);
      const last = parts[parts.length - 1] ?? '';
      return !asserted.includes(`['${last}']`) && !asserted.includes(`.${last},`);
    });
    expect(missing).toEqual([]);
  });
});
