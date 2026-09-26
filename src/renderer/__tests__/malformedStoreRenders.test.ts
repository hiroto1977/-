/** @vitest-environment jsdom */
/**
 * **形の合わない行が 1 件入った状態で、全画面を描く** (2026-09-21 · パス 360)。
 *
 * `everyPageRenders.test.ts` (パス 170) は**空の**保管層で 74 画面を描く。
 * 壊れた行が入った状態は誰も描いていなかった —— そしてそれは想像上の状態ではない:
 * 復元の入口 `store.importAll` が中身の形を見るのは 2026-09-05 からで、
 * それ以前に復元した・古い版が書いた行は既に保存されている
 * (`recordShapeAudit.ts` がその母集団のために在る)。
 *
 * ## 設計はこうなっている (穴ではない)
 *
 * `store.list()` は読みで落とさない —— `recordShapeAudit.ts` の docblock が理由を書く:
 *
 * > 形の違うレコードが 1 件あると、その画面は描画で投げて境界 (`PageErrorBoundary`) が
 * > 受ける —— 画面は開けず、開けないので画面からは消せない。ここが唯一の出口になる
 *
 * 読みで落とすと**壊れた行が UI から触れなくなる** (`library.ts` の
 * 「行そのものは落とさない」= パス 136 と同じ理由)。だから入口で検め、既に
 * 入っている物は設定画面の `RecordShapeAuditPanel` で消す 2 段構えである。
 *
 * ## その設計が含意する不変条件に、機械が無かった
 *
 * 1. **抜け出す道が塞がってはいけない。** 逃げ口 (設定画面) 自身が壊れた行で
 *    投げたら、利用者は**自分のデータから永久に締め出される** —— 全ゲートは緑のまま。
 *    今日は通る (実測) が、設定画面に `useCollection` を 1 つ足せば静かに崩れる。
 * 2. **投げる画面の数は数えられていなかった。** 20 画面に増えても何も鳴らない。
 *
 * ## 実測 (2026-09-21 · パス 360 の直し前)
 *
 * | 壊し方 | 投げた画面 |
 * | --- | --- |
 * | 必須の欄が**無い** (`{}`) | **2** —— `sales` (`monthlyTotals`) と `kpi` (`salesKpiBridge.monthOf`) |
 * | 欄は在るが**型が違う** (`date: 'bad'`) | **0** |
 *
 * どちらも `TypeError: Cannot read properties of undefined (reading 'slice')` で、
 * **投げるのは欄が無いときだけ** (`'bad'.slice` は通る)。`sales.ts` は 57 行上の
 * `salesPeriod` で「読める日付 = 暦に在る日」と絞っているのに、`monthlyTotals` は
 * 素で `.slice` していた —— **同じファイルの中で同じ問いが 2 通りに答えられていた。**
 * パス 360 で両方を `readableSalesRows` に通し、落とした件数を画面が言う。
 *
 * ## その「型が違う → 0」は、壊し方が狭かっただけだった (2026-09-22 · パス 417)
 *
 * `wrongTypedRow` は**最初に拒まれた 1 欄**を壊して返す。`sales-entries` の欄の並びは
 * `date / channel / amount / orders / note` なので、返るのは常に `{ date: 'bad' }` ——
 * **`note` には 1 度も当たっていなかった。** 台帳が空なのは「投げる画面が無い」ではなく
 * 「**当てていなかった**」で、実測すると:
 *
 * | 壊し方 (**正しい日付**を持つ販売記録 1 件) | 投げた画面 |
 * | --- | --- |
 * | `note: 42` / `{z:1}` / `[1]` / `true` | **2** —— `sales` と `overview` |
 *
 * `(e.note ?? '').trim()` の 3 つの写しが `??` だけで受けていた (`??` は
 * null / undefined しか受けない)。パス 417 が `salesNoteText` へ寄せて閉じた。
 *
 * ## 広げた 4 家系は、その欠陥を捕まえない (対照で測った)
 *
 * **壊し方を 2 → 4 家系へ広げた** —— `wrong-type-*-all` は**全欄**に同じ型違いの値を
 * 置く (欄の一覧は形自身から導く)。**ただしそれでも足りない**: 対照 (パス 417 の直しを
 * 戻す) を当てると、この機械は **9 件すべて緑のまま**だった。理由は
 * `allFieldsRow` が `date` も壊すので、`readableSalesRows` が読む前に行を落とすこと ——
 * **「正しい日付 + 1 欄だけ壊れている」という一番現実的な形が、どの家系にも無い。**
 * それを捕まえるのは `renderer/pages/__tests__/storedNoteReads.test.ts` である
 * (対照でそちらは ❌9)。
 *
 * つまりこの機械の主張は「**全欄が壊れた行でも投げない**」で、
 * 「どんな壊れ方でも投げない」ではない。**欄ごとに 1 つずつ壊す**走査は
 * 描画の回数が桁違いなので `npm test` には置けない —— 2026-09-24 (パス 441) に
 * **定期点検の道具の 6 本目** `npm run audit:malformed-fields` にした
 * (`__audits__/malformedFieldSweep.audit.ts`)。
 *
 * ★ **その走査の母集団は、2026-09-22 の記録では誤っていた** —— あの節が書いた
 *   **281 通り**は「**空の行に 1 欄だけ置いた**」組の数で、*正しい行の上*で
 *   1 欄だけ壊す組ではない (実測でそちらは 175 通り)。空の行は他の必須の欄を
 *   全部欠いているので**読む側の漏斗が読む前に落とす** —— つまりあの
 *   「投げた画面 0」は、覆うはずだった形についての証拠ではなかった
 *   (法則 `measure-before-claim`)。直した走査の初回実行は
 *   **3 件の投げる画面**を見つけている (KPI 実績・予算の事業名が非文字列)。
 *
 * ## ここで見るもの
 *
 * - ★ 逃げ口 (設定画面の点検パネル) が**壊れた行の下でも描ける** —— 両方の壊し方で。
 * - ★ 投げる画面は台帳と**両方向**に一致する (増えたら落ち、直ったら「台帳から消せ」と落ちる)。
 * - 壊した行が実際に形の判定に落ちること (走査が死んで「0 件だから健全」にならない床)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../services';
import { COLLECTION_SHAPES, hasCollectionShape } from '../data/collectionShapes';
import { FAMILIES, allFieldsRow, malformedRow, type Family } from './malformedRows';
import { getRecordStore } from '../data/store';
import { RecordShapeAuditPanel } from '../components/RecordShapeAuditPanel';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';
import { installPageRenderGlobals, renderPageFailure, settlePage } from './pageRenderHarness';

/**
 * 投げる画面の台帳。**空であること自体が主張**である ——
 * パス 360 の直し前は `kpi` と `sales` が居た。
 */
const THROWING_PAGES: Readonly<Record<string, string>> = {};

beforeAll(() => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => {
      r.unmount();
    });
  }
  host.remove();
});

/** 台帳のすべての collection に 1 件ずつ壊れた行を入れ、入れた数を返す。 */
async function seedMalformed(family: Family): Promise<number> {
  const store = getRecordStore();
  let seeded = 0;
  for (const collection of Object.keys(COLLECTION_SHAPES)) {
    const bad = malformedRow(collection, family);
    if (bad === null) continue;
    await store.insert(collection, bad);
    seeded += 1;
  }
  return seeded;
}

/** 1 画面を素で描いて、投げたら理由を返す (足場は `pageRenderHarness` と 1 つ)。 */
async function renderFailure(page: () => unknown): Promise<string | null> {
  return renderPageFailure(host, page);
}

describe('壊れた行の下で全画面を描く (パス 360)', () => {
  it('★ 壊し方 2 通りがどちらも実際に形の判定へ当たる (走査が死んでいない)', () => {
    const missing = Object.keys(COLLECTION_SHAPES).filter((c) => malformedRow(c, 'missing') !== null);
    const wrong = Object.keys(COLLECTION_SHAPES).filter((c) => malformedRow(c, 'wrong-type') !== null);
    // 実測 (2026-09-21): 台帳 23 件のうち `{}` が拒まれるのは 19 件
    // (残り 4 件は欄が全部 optional な形 —— 読む側が欄ごとに既定へ倒すと
    // docblock が書いている `bank-submission-settings` / `parameter-overrides` /
    // `hydroponics-crops` / `highlight-settings`)。型違いは全件拒まれる。
    expect(missing.length).toBeGreaterThanOrEqual(19);
    expect(wrong.length).toBe(Object.keys(COLLECTION_SHAPES).length);
    // 全欄を壊す 2 家系も実際に拒まれること。**全件ではない** —— 欄が全部
    // `any` / `opt` の形は 1 方向では拒めない (実測 2026-09-22: 文字列を置くと
    // 21 / 23・数を置くと 21 / 23 で、通る 2 件は家系ごとに違う)。
    for (const family of ['wrong-type-str-all', 'wrong-type-num-all'] as const) {
      const hit = Object.keys(COLLECTION_SHAPES).filter((c) => malformedRow(c, family) !== null);
      expect(hit.length, `${family} がどの collection にも当たらない`).toBeGreaterThanOrEqual(20);
    }
    // 針の標本 —— 全欄を壊す形が実際に「1 欄だけ」と違う物を返す。
    expect(Object.keys(allFieldsRow('sales-entries', 1) ?? {})).toContain('note');
    // 針の標本 —— 合う行は拒まれない (どの行でも拒む判定になっていないこと)。
    expect(hasCollectionShape('sales-entries', { date: '2026-04-01', channel: 'amazon', amount: 1, orders: 1 })).toBe(true);
    expect(hasCollectionShape('sales-entries', {})).toBe(false);
  });

  it.each(FAMILIES)(
    '★ 逃げ口 (点検パネル) は壊れた行の下でも描ける — %s',
    async (family) => {
      const seeded = await seedMalformed(family);
      expect(seeded).toBeGreaterThan(0);
      const failure = await renderFailure(RecordShapeAuditPanel as unknown as () => unknown);
      expect(failure, '点検パネルが投げた — 壊れた行を消す道が無くなる').toBeNull();
      // 逃げ口が「押せる」ことまで見る (描けても調べるボタンが無ければ出口ではない)。
      root = createRoot(host);
      const r = root;
      await act(async () => {
        r.render(createElement(RecordShapeAuditPanel));
      });
      await settlePage();
      expect(host.querySelector('[data-shape-audit-scan]')).not.toBeNull();
    },
    120_000,
  );

  it.each(FAMILIES)(
    '★ 投げる画面は台帳と両方向に一致する — %s',
    async (family) => {
      await seedMalformed(family);
      const threw: Record<string, string> = {};
      for (const svc of SERVICES) {
        _resetCollectionSubscribersForTests();
        const failure = await renderFailure(svc.page as () => unknown);
        if (failure !== null) threw[svc.id] = failure;
      }
      // 増えたら落ちる / 台帳に在るのに投げなくなっても落ちる (消化したら台帳から消す)。
      expect(Object.keys(threw).sort()).toEqual(Object.keys(THROWING_PAGES).sort());
    },
    300_000,
  );
});
