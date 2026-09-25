/**
 * **法則の執行者は「何件あるか」ではなく「母集団を見ているか」で数える** (2026-09-19 · パス 327)。
 *
 * パス 325 / 326 は「法則に執行者が在っても、それが**直した個所の検査**だけなら母集団は
 * 守られていない」を 2 度実測した。そこで 82 本を一括で数えたのだが、**その数え方が間違っていた** ——
 * 私は「検査ファイル名に census / ledger / coverage … が入っているか」という**名前の印**で判定し、
 * 出た 12 本、次に 8 本、7 本という数を**測定として PR 本文に公開した**。実物を読むと:
 *
 * | 法則 | 実際の執行者 | 名前の印で落ちた理由 |
 * | --- | --- | --- |
 * | `refused-values-make-no-judgement` | `guardedJudgements` が **`SERVICES` の全画面を jsdom で描く** (docblock に「母集団は走査で採る」と書いてある) | 名前に census が無い |
 * | `snapshot-parity` | `webShimSnapshotParity` が **`SNAPSHOT` を列挙する** | 同上 |
 * | `header-values-one-rule` | `headerValue` が **ASCII 全域を実物の `new Headers()` と突き合わせる** | 同上 |
 * | `envelope-checked-at-read` | `jsonBodyCensus` が `.json()` を 1 か所へ絞り、**構造的に**全ての本文を 1 つの読み手へ通す (別の法則に付いている) | 執行者の一覧に無い |
 *
 * **「走査しているか」は名前では分からない。列挙しているものの綴り (`SERVICES` / `SNAPSHOT` /
 * `globSync` / `charCodeAt` …) で採る。** 印を実物に合わせ直すと 7 → 3 本になり、
 * さらに `crypto-floors-frozen` をパス 327 で閉じて **2 本**になった。
 *
 * この検査は、その判定を**私の走り捨ての probe ではなく台帳**に置く。印が緩すぎれば
 * 台帳が空になって下の床で落ち、印が狭すぎれば台帳に無い法則が出て落ちる (両方向)。
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';
import { LAWS } from '../ontology/laws';

const REPO = join(__dirname, '..', '..', '..');

/**
 * 母集団を走査している印。**列挙しているものの綴り**で採る (名前では採らない)。
 *
 * - `globSync` / `readOriginalDir` / `readdirSync` / `shippedSources` — ファイルを列挙する
 * - `readOriginalSource` — 原文を読む (走査の相棒)
 * - `SERVICES` / `SERVICE_IDS` / `SNAPSHOT` / `PAGES` — 台帳の全件を列挙する
 * - `Object.keys(` / `Object.entries(` — 表の全件を列挙する
 * - `charCodeAt` / `fromCharCode` — 入力領域を総当たりする (`headerValue` の形)
 */
const SCAN_MARKERS = [
  'globSync',
  'readOriginalDir',
  'readOriginalSource',
  'readdirSync',
  'shippedSources',
  'sourceFiles',
  'SERVICES',
  'SERVICE_IDS',
  'SNAPSHOT',
  'PAGES',
  'Object.keys(',
  'Object.entries(',
  'charCodeAt',
  'fromCharCode',
] as const;

function scansPopulation(file: string): boolean {
  const abs = join(REPO, file);
  if (!existsSync(abs)) return false;
  // 原文の道具を通す (`originalSourcePolicy` の規則 1)。変異検査の中でも本物の綴りを読む。
  // ★ **注記は落とす** (2026-09-25 · パス 465) —— 生のまま読んでいた頃、
  // `shell-open-gate` は `exportSymlinkContainment.test.ts:49` の**注記 1 行**
  // (`readOriginalSource` の綴り) で「母集団を走査している」側に落ちていた。
  // しかもその注記は「一時の道に使うと的が外れる」と**使っていないこと**を述べている
  // (法則 `mention-vs-declaration`)。見つけ方は `npm run audit:comment-blind`。
  const src = stripComments(readOriginalSource(abs));
  return SCAN_MARKERS.some((m) => src.includes(m));
}

/**
 * 検査だけが執行者で、そのどれも母集団を走査していない法則。
 *
 * **数えているのは「新しい違反が生えたときに鳴る物が在るか」である。** だから
 * `gate` (repo 全体を走査する lint) は母集団の機械として数えるが、
 * **`chain` / `harness` / `ci` は数えない**:
 *
 * - `chain` (整合性チェーン) は**既に保護対象になっているファイルの改変**を捕まえる。
 *   同じ法則を破る**新しいファイル**が増えても鳴らない。
 * - `harness` (実機 e2e / perf) と `ci` (workflow) は走らせる仕組みで、母集団を数えない。
 *
 * この区別を最初に曖昧にしたまま数えたら、`chain` を持つ法則が「守られている」側に
 * 落ちて数が合わなくなった (パス 327 で 2 度目の数え直し)。
 *
 * 執行者に検査が 1 つも無い法則 (prose / type / harness だけ) はここの対象外 ——
 * `docs/ONTOLOGY.md` の「機械の無い法則」の節が持つ。
 */
function exampleOnlyLaws(): string[] {
  const out: string[] = [];
  for (const l of LAWS) {
    if (l.enforcedBy.some((e) => e.kind === 'gate')) continue;
    const tests = l.enforcedBy.filter((e) => e.kind === 'test').map((e) => (e as { file: string }).file);
    if (tests.length === 0) continue; // 執行者が prose / type だけ —— docs/ONTOLOGY.md の別節が持つ
    if (tests.some(scansPopulation)) continue;
    out.push(l.id);
  }
  return out.sort();
}

/**
 * 台帳: 母集団を走査する執行者を持たない法則と、**なぜそれでよいか**。
 * 認める理由は 2 種だけ —— `single-site` (守る対象が 1 か所しかない) と
 * `discipline` (機械にできるのは隣の法則の側で、この法則そのものは読み方の約束)。
 * 「まだ作っていない」は理由にならない (それは残作業なので `docs/REMAINING_WORK.md` へ)。
 */
const LEDGER: readonly { readonly id: string; readonly kind: 'single-site' | 'discipline'; readonly why: string }[] = [
  {
    id: 'loopback-oauth-host-pin',
    kind: 'single-site',
    why: '守る対象は OAuth の callback を受ける 1 つのハンドラだけ。母集団が 1 なので走査しても同じ 1 行を指す (loopbackChecks が 3 つの判定を表で突き合わせている)',
  },
  {
    id: 'same-question-before-parity',
    kind: 'discipline',
    why: '「似た判定を見たらまず問いが同じか確かめる」は読み方の約束で、機械にできるのは隣の法則の側 —— 母集団 (共有された判定) は lint:shared-judgement が gate として数えている',
  },
];

describe('法則の執行者は母集団を見ているか (パス 327)', () => {
  it('★ 例だけで留めている法則と台帳は両方向に一致する', () => {
    expect(exampleOnlyLaws()).toEqual(LEDGER.map((r) => r.id).sort());
  });

  it('台帳の理由は 2 種のどちらかで、空でない', () => {
    for (const r of LEDGER) {
      expect(['single-site', 'discipline']).toContain(r.kind);
      expect(r.why.length, r.id).toBeGreaterThan(30);
    }
  });

  /*
   * **印が実物に当たることを確かめる。** これを書かずに印だけ足すと、
   * 「緩すぎて全部通る印」で台帳が空になり、それを「守られている」と読んでしまう ——
   * パス 327 でやらかしたのは、まさにこの確認を飛ばしたことである。
   */
  it('★ 標本: 名前に census を持たないが母集団を走査する検査を、印は拾う', () => {
    expect(scansPopulation('src/renderer/__tests__/guardedJudgements.test.ts')).toBe(true);
    expect(scansPopulation('src/renderer/__tests__/webShimSnapshotParity.test.ts')).toBe(true);
    expect(scansPopulation('src/shared/__tests__/headerValue.test.ts')).toBe(true);
  });

  it('★ 対照: 例の表だけで留めている検査は、印に当たらない', () => {
    expect(scansPopulation('src/shared/__tests__/cryptoParams.test.ts')).toBe(false);
    expect(scansPopulation('src/shared/__tests__/loopbackChecks.test.ts')).toBe(false);
  });

  /*
   * ★ **注記の中の言及は印に当たらない** (2026-09-25 · パス 465)。
   * 標本は走査に掛ける物と同じ加工 (`stripComments`) を通す —— 生の文字列に当てた
   * 標本は「針は生きている」しか示さない (CLAUDE.md の規約)。
   */
  /*
   * ★ **実物の事例を留める** (2026-09-25 · パス 465)。
   * `stripComments` を外す対照が**鳴らなかった** —— 直しの一部として
   * `shellOpenCallSites` (本物の母集団の走査) を書いたので、生の原文でも通るからである。
   * **鳴らない対照は合格ではなく、その検査についての報せ**。木から実物を採って留める。
   */
  it('★ 実物: exportSymlinkContainment の印は注記の中にしか無い (パス 465)', () => {
    const f = 'src/main/__tests__/exportSymlinkContainment.test.ts';
    const raw = readOriginalSource(join(REPO, f));
    expect(SCAN_MARKERS.some((m) => raw.includes(m)), '前提: 原文には印の綴りが在る').toBe(true);
    expect(scansPopulation(f), '注記を落とすと消える = 走査ではなく言及').toBe(false);
  });

  it('★ 標本: 注記の中の綴りは走査と数えない', () => {
    const marker = SCAN_MARKERS[0];
    expect(stripComments(`const a = ${marker}(x);\n`).includes(marker), 'code の走査が消えている').toBe(true);
    expect(stripComments(`// ${marker} を一時の道に使うと的が外れる\n`).includes(marker), '注記の言及が残っている').toBe(false);
  });

  it('印が緩すぎない (台帳が空でない = 判定が生きている)', () => {
    expect(LEDGER.length).toBeGreaterThanOrEqual(1);
    expect(SCAN_MARKERS.length).toBeGreaterThanOrEqual(10);
  });

  it('存在しない検査ファイルは走査していないものとして扱う', () => {
    expect(scansPopulation('src/shared/__tests__/doesNotExist.test.ts')).toBe(false);
  });
});
