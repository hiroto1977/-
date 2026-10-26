/**
 * **形の表にある collection は、行の数の上限をどう受けるかを必ず名乗る。** (2026-10-26 · T-203)
 *
 * ## なぜ機械が要るか —— 2 回続けて天井の漏れを人が見つけた
 *
 * T-175 (7 つの collection) と T-201 (`connector-output` / `balance-sheet`) は、どちらも
 * 「全行を描く一覧なのに、復元の件数の天井も窓も無い」を実 Chromium で測って見つけた。
 * 母集団を手で挙げていたので、次に collection が増えると同じ漏れが起きる。
 *
 * ## 不変条件
 *
 * `COLLECTION_SHAPES` の全 collection は、次の **どれか 1 つ** にだけ載る:
 *
 * - `BACKUP_COLLECTION_RECORD_LIMITS` に在る (復元が件数で断る) —— 台帳はここ。
 * - 下の `OTHER_BOUNDS` が種類と理由を名乗る:
 *   - `window` —— 全件を持つが、画面は `useRowWindow` で窓を通す (描く行が有界)。
 *   - `latest-one` —— 画面が使うのは最新の 1 件 (`latestAdoptionCensus` の `ADOPTED` と一致)。
 *   - `unsubscribed` —— 読み戻す画面が 1 つも無い (定数がデータ層の外から参照されない)。
 *   - `compute-only` —— 行を描かず、計算に通すだけ。**測った費用を理由に書く**。
 *
 * **両方向**: 形の表にあるのにどこにも載らなければ落ち、載っているのに形の表から消えても落ち、
 * 天井の台帳と `OTHER_BOUNDS` の両方に載っても落ちる。
 *
 * ## 測って何も無かった物 (hydroponics-readings)
 *
 * 測定の履歴は日に何度も増え、復元の天井も窓も無い。画面は一覧に描かず (`latestReading` と
 * `dailyTasks` に渡すだけ) なので DOM は膨らまない。計算の費用を 2026-10-26 に Node で測った:
 * 20,000 件で読み 58 ms・最新の探索 21 ms、**200,000 件 (復元の全体の天井) で読み 672 ms・
 * 最新の探索 209 ms**。表示の再計算ごとに `useMemo` で数百 ms で、固まる形ではない
 * (T-201 の 146 秒とは桁が 2 つ違う)。だから天井は足さず、種類 `compute-only` で測定値を残す。
 * 費用が 1 桁変わる変更 (履歴の描画を足す・走査を増やす) を入れたら、この行を測り直す。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { COLLECTION_SHAPES } from '../collectionShapes';
import { BACKUP_COLLECTION_RECORD_LIMITS } from '../importFile';
import { readOriginalDirEntries, readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

const ROOT = path.resolve(__dirname, '../../../..');
const src = (rel: string): string => stripComments(readOriginalSource(path.join(ROOT, rel)));

type Bound =
  | { readonly kind: 'window'; readonly constant: string; readonly page: string; readonly why: string }
  | { readonly kind: 'latest-one'; readonly why: string }
  | { readonly kind: 'unsubscribed'; readonly constant: string; readonly definedIn: string; readonly why: string }
  | { readonly kind: 'compute-only'; readonly page: string; readonly why: string };

const OTHER_BOUNDS: Readonly<Record<string, Bound>> = {
  'sales-entries': {
    kind: 'window',
    constant: 'SALES_COLLECTION',
    page: 'src/renderer/pages/SalesPage.tsx',
    why: '売上の一覧は T-127 から useRowWindow を通る。件数は CSV 取り込みで増えるので天井でなく窓で受ける。',
  },
  'bank-submission-settings': { kind: 'latest-one', why: '金融機関提出用の書面の設定。画面と書面が採用するのは最新の 1 件だけで、行の一覧は描かない。' },
  'parameter-overrides': { kind: 'latest-one', why: '数値パラメータの上書き。最新の 1 件に重ねて有効値を決め、行の一覧は描かない。' },
  'hydroponics-setup': { kind: 'latest-one', why: '水耕栽培の設備・費用の設定。最新の 1 件だけを採用して欄を開き、行の一覧は描かない。' },
  'hydroponics-crops': { kind: 'latest-one', why: '品目の一覧は 1 記録の中にまとまる。最新の 1 件だけを採用し、行の一覧は描かない。' },
  'hydroponics-control': { kind: 'latest-one', why: '水耕栽培の運転の設定。最新の 1 件だけを採用して目標域と調製を決め、行の一覧は描かない。' },
  'highlight-settings': { kind: 'latest-one', why: '経営ハイライトのしきい値。最新の 1 件だけを採用して判定に使い、行の一覧は描かない。' },
  'overview-overrides': {
    kind: 'unsubscribed',
    constant: 'OVERVIEW_OVERRIDES_COLLECTION',
    definedIn: 'src/renderer/data/overviewOverrides.ts',
    why: '定数をデータ層の外から参照する所が 0 件 (どの画面も購読しない)。読む画面が生えたら窓か天井を足す。',
  },
  'overview-custom-metrics': {
    kind: 'unsubscribed',
    constant: 'OVERVIEW_CUSTOM_METRICS_COLLECTION',
    definedIn: 'src/renderer/data/overviewOverrides.ts',
    why: '同上の理由で読み戻す画面が無い (定数の参照が定義したデータ層の外に 0 件)。',
  },
  'hydroponics-readings': {
    kind: 'compute-only',
    page: 'src/renderer/pages/HydroponicsPage.tsx',
    why:
      '画面は行を描かず latestReading と dailyTasks に渡すだけ。2026-10-26 の実測: 200,000 件で読み 672 ms・' +
      '最新の探索 209 ms (20,000 件で 58 / 21 ms)。再計算は useMemo で数百 ms で、固まる形ではない。',
  },
};

/** 最新の 1 件を採用する collection の名前 (台帳 ADOPTED の `collection: '…'` を原文から拾う)。 */
function adoptedCollections(): string[] {
  const text = readOriginalSource(path.join(ROOT, 'src/renderer/__tests__/latestAdoptionCensus.test.ts'));
  return [...text.matchAll(/collection: '([a-z-]+)', definedIn:/g)].map((m) => m[1]!);
}

/** `src/renderer` の製品コード (検査と型定義を除く) のファイル。 */
function productFiles(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(path.join(ROOT, dir))) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === '__audits__') continue;
      productFiles(rel, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe('行の数の上限の census (threat: T-203)', () => {
  const shapes = Object.keys(COLLECTION_SHAPES);
  const limited = Object.keys(BACKUP_COLLECTION_RECORD_LIMITS);
  const others = Object.keys(OTHER_BOUNDS);

  it('★ 形の表の collection は、天井の台帳か OTHER_BOUNDS のどれか 1 つにだけ載る (両方向)', () => {
    const covered = new Set([...limited, ...others]);
    expect(shapes.filter((c) => !covered.has(c)), '上限の受け方を名乗っていない collection').toEqual([]);
    expect([...covered].filter((c) => !shapes.includes(c)), '形の表に無い名前 (綴り違いで効かない)').toEqual([]);
    expect(limited.filter((c) => others.includes(c)), '両方に載っている').toEqual([]);
    // 走査が空虚でない (床は実測の 23 collection の 85%)
    expect(shapes.length).toBeGreaterThanOrEqual(19);
    expect(limited.length).toBeGreaterThanOrEqual(10);
  });

  it('★ 理由は省略形でなく、空でない', () => {
    for (const [c, b] of Object.entries(OTHER_BOUNDS)) {
      expect(b.why.length, c).toBeGreaterThanOrEqual(20);
      expect(b.why, c).not.toMatch(/^(同上|TBD|todo|未定)[。.]?$/i);
    }
  });

  it('★ window: 画面がその定数を読み、useRowWindow を通し、素の map を持たない', () => {
    for (const [c, b] of Object.entries(OTHER_BOUNDS)) {
      if (b.kind !== 'window') continue;
      const page = src(b.page);
      expect(page, `${c}: ${b.constant} を読んでいない`).toContain(b.constant);
      expect(page, `${c}: useRowWindow を通していない`).toContain('useRowWindow(');
      expect(page, `${c}: 全行を描く素の map`).not.toMatch(/\{records\.map\(/);
    }
  });

  it('★ latest-one: 台帳は最新を採用する collection の集合と一致する (両方向)', () => {
    const declared = Object.entries(OTHER_BOUNDS).filter(([, b]) => b.kind === 'latest-one').map(([c]) => c).sort();
    expect(adoptedCollections().sort()).toEqual(declared);
  });

  it('★ unsubscribed: 定数はデータ層の定義の外から参照されない', () => {
    const files = productFiles('src/renderer');
    expect(files.length, '走査が空 (床)').toBeGreaterThan(200);
    for (const [c, b] of Object.entries(OTHER_BOUNDS)) {
      if (b.kind !== 'unsubscribed') continue;
      const users = files.filter((f) => f !== b.definedIn && f !== 'src/renderer/data/collectionShapes.ts' && src(f).includes(b.constant));
      expect(users, `${c}: ${b.constant} を読む所が生えた (窓か天井を足す)`).toEqual([]);
      expect(src(b.definedIn), `${c}: 定義が無い`).toContain(`export const ${b.constant} = '${c}'`);
    }
  });

  it('★ compute-only: 画面は行を描かない (collection の行を map で描く形が無い)', () => {
    for (const [c, b] of Object.entries(OTHER_BOUNDS)) {
      if (b.kind !== 'compute-only') continue;
      const page = src(b.page);
      expect(page, `${c}: 履歴の行を map で描き始めた (測り直すか窓を通す)`).not.toMatch(/readings\.items\.map\(|readingCol\.records\.map\(/);
    }
  });

  it('対照: 針が実物に当たる (標本)', () => {
    expect(adoptedCollections().length).toBeGreaterThanOrEqual(6);
    expect('{records.map((r) => r)}').toMatch(/\{records\.map\(/);
    expect('readings.items.map((r) => r)').toMatch(/readings\.items\.map\(/);
    // 理由の省略形を弾く針が、省略形そのものに当たる
    expect('同上。').toMatch(/^(同上|TBD|todo|未定)[。.]?$/i);
    expect('最新の 1 件だけを採用し、行の一覧は描かない。').not.toMatch(/^(同上|TBD|todo|未定)[。.]?$/i);
  });
});
