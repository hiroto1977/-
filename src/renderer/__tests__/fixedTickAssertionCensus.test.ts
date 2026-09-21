import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

/*
 * **「固定回数だけ待ってから文を主張する」検査を数える** — 2026-09-21 · パス 368。
 *
 * ## これはパス 169 が「別の話」と書いて残した数である
 *
 * `waitHelperCensus.test.ts` (パス 169 · 2026-09-12) は既に
 *
 * - 条件で待つ道を `__tests__/jsdomWait.ts` に 1 つ置き (`settleUntil` / `waitForElement` / `waitForText`)
 * - **手書きの条件待ち**を走査して台帳と突き合わせている
 *
 * そしてその docblock は危険を正しく名指ししている ——
 * 「固定回数の `settle` は回数を当てているだけで条件を見ていない。
 * **空いている機械では足り、全件実行の負荷の下では足りないことがある**」。
 * 実際に 2 度落ちている (2026-09-09 `recordShapeAuditPanel` / 2026-09-12 `settingsGoogleOAuth`)。
 *
 * **ところがその census は固定回数を意図して母集団から外している** ——
 * 最後の対照が `expect(pollsByHand(fixed)).toBe(false)` で、注記は
 * 「固定回数は「待ち」ではないので、この台帳の対象外 (**数えるのは別の話**)」。
 * つまり**落ちる原因そのものは数えられていなかった**。この検査がその「別の話」である。
 *
 * ## 3 件目が出た (実測 2026-09-21)
 *
 * パス 367 の検証中、`importSizeGuard.test.ts` の「対照: 上限以下のバックアップは
 * 読んで復元する」が**全件 3 回のうち 1 回**落ちた。1 ファイルだけなら 12 回で 0 回。
 * `settle()` の回数を変えて測ると **tick 依存が確定した**:
 *
 * ```
 *   ticks=1 → 2 件落ちる (CSV の取り込みと、復元の 2 つ)
 *   ticks=2 以上 → 通る            ← 8 でも負荷の下では足りないことがある
 * ```
 *
 * 直したあとは **ticks=0 でも通る** (待ちが条件を見るようになったので回数に依らない)。
 *
 * ## 数える形
 *
 * 危ないのは「固定回数で待つ」だけではなく、**その後で肯定の文を主張する**形である
 * (否定の主張は待っても意味が無いので別)。共有の待ちを import している物は既に直っている。
 *
 * ```
 *   固定回数の settle を持つ                       108 本
 *   うち 肯定の文の主張を持つ                        34 本
 *   うち 共有の jsdomWait を import している         2 本
 *   → 危ない形                                    32 本 (パス 368 で 34 → 32)
 * ```
 *
 * 台帳は**両方向**: 33 本目が生えたら落ち、直した行が残っていても落ちる。
 * **理由は書かない** —— どの行も同じ「まだ寄せていない」で、理由の欄が埋まると
 * 「保留を検査に書く」形 (法則 `no-weakness-as-spec`) になる。
 * 減らすことだけが正しい向きなので、**数が増えないこと**を機械が持つ。
 */

const SRC = path.resolve(__dirname, '../..');

/** 固定回数だけ回す待ち (`for (let i = 0; i < N; i += 1) … setTimeout`)。 */
export const FIXED_TICK = /for \(let \w+ = 0; \w+ < \d+; \w+ \+= 1\)[\s\S]{0,200}?setTimeout/;

/** 画面の文が**出ている**ことの主張 (否定は別 —— 待っても意味が無い)。 */
export const POSITIVE_TEXT = /expect\([^)]*textContent[^)]*\)\s*\.toContain\(|expect\(text\)\.toContain\(/;

/** 共有の待ちを使っているか。 */
export const USES_SHARED_WAIT = /from '[^']*jsdomWait'/;

export function isRisky(src: string): boolean {
  return FIXED_TICK.test(src) && POSITIVE_TEXT.test(src) && !USES_SHARED_WAIT.test(src);
}

function testFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...testFiles(full));
    else if (/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const SELF = path.basename(__filename);

/** 危ない形が残っている検査 (相対パス)。**減らす方向にしか動かさない。** */
const KNOWN_FIXED_TICK: readonly string[] = [
  'renderer/__tests__/appDeviceStoreFailure.test.ts',
  'renderer/__tests__/appLockScreenBoundary.test.ts',
  'renderer/__tests__/appPageErrorBoundary.test.ts',
  'renderer/components/__tests__/ParametersPanel.render.test.ts',
  'renderer/components/__tests__/chatbotOllamaReply.test.ts',
  'renderer/components/__tests__/chatbotRequestRecord.test.ts',
  'renderer/components/__tests__/googleConnectCard.test.ts',
  'renderer/components/__tests__/recordNoteCapOnScreen.test.ts',
  'renderer/components/__tests__/recordShapeAuditPanel.test.ts',
  'renderer/pages/__tests__/buildDestinationNotes.test.ts',
  'renderer/pages/__tests__/cloudflarePurgeConfirm.test.ts',
  'renderer/pages/__tests__/docstudioImport.test.ts',
  'renderer/pages/__tests__/docstudioKessanSheets.test.ts',
  'renderer/pages/__tests__/emotionsCeilingOnScreen.test.ts',
  'renderer/pages/__tests__/exportWarningVisible.test.ts',
  'renderer/pages/__tests__/freeeIntakeOnScreen.test.ts',
  'renderer/pages/__tests__/libraryStoreFailure.test.ts',
  'renderer/pages/__tests__/ms365Actions.test.ts',
  'renderer/pages/__tests__/ollamaPageInputCap.test.ts',
  'renderer/pages/__tests__/overviewBankSheet.test.ts',
  'renderer/pages/__tests__/overviewHydroponics.test.ts',
  'renderer/pages/__tests__/persistedStateSurvives.test.ts',
  'renderer/pages/__tests__/readFailureVisible.test.ts',
  'renderer/pages/__tests__/saveFailureVisible.test.ts',
  'renderer/pages/__tests__/securityNortonState.test.ts',
  'renderer/pages/__tests__/settingsCredentialDelete.test.ts',
  'renderer/pages/__tests__/settingsCredentialUnreadable.test.ts',
  'renderer/pages/__tests__/settingsLicensePanel.test.ts',
  'renderer/pages/__tests__/settingsUnreadableCards.test.ts',
  'renderer/pages/__tests__/stocksExportOpen.test.ts',
  'renderer/pages/__tests__/teamRadarNoteClamp.test.ts',
  'renderer/pages/__tests__/teamRadarSampleNeverOverwrites.test.ts',];

/** パス 368 で共有の待ちへ寄せた 2 本 —— 台帳に戻ってはいけない。 */
const CONVERTED: readonly string[] = [
  'renderer/pages/__tests__/importSizeGuard.test.ts',
  'renderer/__tests__/safetyNoticeRendered.test.ts',
];

function population(): string[] {
  return testFiles()
    .filter((f) => path.basename(f) !== SELF)
    .filter((f) => isRisky(readOriginalSource(f)))
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    .sort();
}

describe('固定回数で待ってから文を主張する検査 — 針が生きている', () => {
  it('★ 標本: 3 つの述語がそれぞれ当たる', () => {
    const fixed = 'for (let i = 0; i < 8; i += 1) {\n  await act(async () => { setTimeout(r, 0); });\n}';
    const positive = "expect(container.textContent).toContain('x');";
    const shared = "import { waitForText } from '../../__tests__/jsdomWait';";
    expect(FIXED_TICK.test(fixed), '固定回数を掴めていない').toBe(true);
    expect(FIXED_TICK.test('while (!ok) { await tick(); }'), '条件待ちを固定回数と数えている').toBe(false);
    expect(POSITIVE_TEXT.test(positive), '肯定の主張を掴めていない').toBe(true);
    expect(POSITIVE_TEXT.test("expect(container.textContent).not.toContain('x');"), '否定を肯定と数えている').toBe(
      false,
    );
    expect(USES_SHARED_WAIT.test(shared), '共有の待ちの import を掴めていない').toBe(true);
    // 3 つ揃って初めて「危ない」
    expect(isRisky(fixed + positive), '危ない形を掴めていない').toBe(true);
    expect(isRisky(fixed + positive + shared), '共有の待ちを使う物を危ないと数えている').toBe(false);
    expect(isRisky(fixed), '主張の無い固定回数を危ないと数えている').toBe(false);
  });

  it('走査が実物に当たる (母集団が空でない)', () => {
    expect(population().length).toBeGreaterThan(10);
  });
});

describe('固定回数で待ってから文を主張する検査 — 台帳は両方向・数は増えない', () => {
  it('★ 台帳に無い危ない検査が増えていない (33 本目は共有の待ちを使う)', () => {
    const extra = population().filter((f) => !KNOWN_FIXED_TICK.includes(f));
    expect(
      extra,
      '固定回数で待ってから文を主張する検査が増えている —— `__tests__/jsdomWait.ts` の waitForText / settleUntil を使うこと',
    ).toEqual([]);
  });

  it('★ 台帳の行はすべて現物 (寄せ終わった行が残っていない)', () => {
    const now = new Set(population());
    expect(
      KNOWN_FIXED_TICK.filter((f) => !now.has(f)),
      '寄せ終わった行が台帳に残っている —— 消すと数が下がる (それが正しい向き)',
    ).toEqual([]);
  });

  it('★ 数は 32 本以下 (増やさない)', () => {
    expect(population().length).toBeLessThanOrEqual(32);
  });

  it('★ パス 368 で寄せた 2 本は台帳に居ない (共有の待ちを使っている)', () => {
    const now = new Set(population());
    for (const f of CONVERTED) {
      expect(now.has(f), `${f} が危ない形へ戻っている`).toBe(false);
      expect(
        USES_SHARED_WAIT.test(readOriginalSource(path.join(SRC, f))),
        `${f} が共有の待ちを import していない`,
      ).toBe(true);
    }
  });
});
