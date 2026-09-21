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
 *   パス 368 (2026-09-21)  固定回数 108 本 / 肯定の主張つき 34 本 / 共有の待ち 2 本 → 危ない形 32 本
 *   パス 369 (2026-09-21)  32 本すべてを共有の待ちへ寄せた            → 危ない形  0 本
 *   パス 369 (針を広げた後) 固定回数 109 本 / 広げた針で 29 本 → 寄せて         → 危ない形  0 本
 * ```
 *
 * 寄せ方は 4 通りで、**どれも主張を弱めない** (共有の待ちは時間切れで**落ちる**):
 *
 * ```
 *   expect(container.textContent).toContain(X)   → await waitForText(() => container.textContent ?? '', X)
 *   const el = q(); expect(el).not.toBeNull()    → const el = await waitForElement(() => q(), '…')
 *   expect(text()).toContain(X)                  → await waitForText(text, X)
 *   for (const s of XS) expect(text()).toContain(s.label)
 *                                                → for (const s of XS) await waitForText(text, s.label)
 * ```
 *
 * 変換で主張を落としていないことは、**針を HEAD と突き合わせて**確かめた
 * (肯定の主張の針 831 件が 1 つも変わっていない · パス 369)。
 *
 * ## ★ パス 368 で私が書いた針は、両方向に外れていた (2026-09-21 実測)
 *
 * 寄せ終えてから**周回数を 0 にして全件を走らせた** (`npm run audit:tick-sensitivity`)。
 * 綴りではなく振る舞いで測ると、この針の限界が出た:
 *
 * | 形 | 実測 (HEAD = パス 368) | パス 368 の針は |
 * | --- | --- | --- |
 * | `expect(text()).toContain(…)` | **67 ファイル / 363 か所** | **見えない** (`expect(text)` は裸の識別子) |
 * | `expect(q.sheet()!.textContent).toContain(…)` | `overviewBankSheet` | **見えない** (`[^)]*` が入れ子を跨げない) |
 * | `expect(el?.textContent).toBe('確認できません')` | `settingsUnreadableCards` | **今も見えない** (matcher が `toContain` だけ) |
 * | `expect(q.cell('売上高')).toBe(…)` | `overviewBankSheet` | **今も見えない** (読むのが helper) |
 * | `const t = text(); expect(t).toContain(…)` | 6 ファイル | **今も見えない** (取ってから主張する) |
 *
 * 上 2 行は 2026-09-21 に広げて見えるようにした。**下 3 行は今も見えない** ——
 * 見えないことは上の `★ 標本` が**標本で固定**している (見えるようになったら鳴って、
 * この表を直させる)。
 *
 * 逆向きにも外れる —— **条件で待ったあと**の `expect(…).toContain(…)` はもう
 * 当て物ではないのに、針はその区別ができない。さらに `USES_SHARED_WAIT` は
 * **ファイル単位の免除**なので、1 か所寄せるとそのファイルの残りが見えなくなる。
 *
 * ## だから「見えているか」の答えは別の道具が持つ
 *
 * `npm run audit:tick-sensitivity` (`scripts/audit-tick-sensitivity.cjs`) が
 * **周回数を 0 にして走らせ**、落ちたファイルを理由つきの台帳と双方向に突き合わせる
 * (2026-09-21 実測: 109 本中 **31 本**が 0 周では通らない)。
 * この検査は**速い側の見張り**で、最も多い形が黙って戻ってこないことだけを見る。
 * 台帳の形は `tickSensitivityLedger.test.ts` が毎回の `npm test` で見る。
 */

const SRC = path.resolve(__dirname, '../..');

/** 固定回数だけ回す待ち (`for (let i = 0; i < N; i += 1) … setTimeout`)。 */
export const FIXED_TICK = /for \(let \w+ = 0; \w+ < \d+; \w+ \+= 1\)[\s\S]{0,200}?setTimeout/;

/**
 * 画面の文が**出ている**ことの主張 (否定は別 —— 待っても意味が無い)。
 *
 * **2026-09-21 (パス 369) に広げた。** パス 368 の綴りは
 * `expect\([^)]*textContent[^)]*\)\.toContain\(|expect\(text\)\.toContain\(` で、
 * **このリポジトリで最も多い形 `expect(text()).toContain(…)` を 1 件も見ていなかった**
 * (実測 2026-09-21: 41 ファイル / 247 か所)。`expect(text)` は**裸の識別子**なので
 * `text()` に当たらず、`[^)]*` は**入れ子の括弧を跨げない**ので
 * `expect(q.sheet()!.textContent)` にも当たらない。
 *
 * 広げた今も**見えない形は残っている** (下の docblock の表)。
 * 見えているかどうかの答えは `npm run audit:tick-sensitivity` が持つ。
 */
export const POSITIVE_TEXT = /expect\([^;\n]*?textContent[^;\n]*?\)\s*\.toContain\(|expect\(\w+\(\)\)\.toContain\(|expect\(text\)\.toContain\(/;

/** 共有の待ちを使っているか。 */
export const USES_SHARED_WAIT = /from '[^']*jsdomWait'/;

/**
 * 注記を落とす。**綴りの言及は宣言ではない** ——
 * `taxDeductionCeilings.test.ts` は docblock の中で
 * 「`expect(text()).toContain(…)` は落ちたときに画面ぜんぶを刷る」と**説明している**だけで、
 * その形の主張は 1 つも持たない。落とさないと、危険を説明した文が危険として数えられる。
 */
export function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function isRisky(src: string): boolean {
  const code = codeOnly(src);
  return FIXED_TICK.test(code) && POSITIVE_TEXT.test(code) && !USES_SHARED_WAIT.test(code);
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

/**
 * 共有の待ちを使っている検査の**床**。
 *
 * 危ない形を 0 にする道は「寄せる」だけではない —— **jsdom の検査を消しても 0 になる**。
 * 実測 (2026-09-21 · パス 369 の後) は 97 本。床はその 8 割で、
 * 「黙って縮んだら落とす」ためだけに置く (増える分には鳴らさない)。
 */
const MIN_FILES_USING_SHARED_WAIT = 77;

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
    // ★ パス 368 の針が見落としていた 2 形 (2026-09-21 に広げた)。
    expect(POSITIVE_TEXT.test("expect(text()).toContain('x');"), '最も多い形を掴めていない').toBe(true);
    expect(
      POSITIVE_TEXT.test("expect(q.sheet()!.textContent).toContain('x');"),
      '入れ子の括弧を跨げていない',
    ).toBe(true);
    expect(POSITIVE_TEXT.test("expect(text()).not.toContain('x');"), '否定を肯定と数えている').toBe(false);
    // ★ 今も見えない形 —— 見えないことを**標本で固定する** (直ったら鳴って表を直させる)。
    expect(
      POSITIVE_TEXT.test("expect(el?.textContent).toBe('確認できません');"),
      'toBe が見えるようになった —— docblock の表を直すこと',
    ).toBe(false);
    expect(
      POSITIVE_TEXT.test("expect(q.cell('売上高')).toBe('12,345,678');"),
      'helper 越しの読みが見えるようになった —— docblock の表を直すこと',
    ).toBe(false);
    expect(USES_SHARED_WAIT.test(shared), '共有の待ちの import を掴めていない').toBe(true);
    // ★ 注記の中の言及は数えない (`mention-vs-declaration`)。
    const mention = `${fixed}\n/** \`expect(text()).toContain(…)\` は落ちたときに画面ぜんぶを刷る。 */`;
    expect(isRisky(mention), '注記の中の言及を主張として数えている').toBe(false);
    expect(POSITIVE_TEXT.test(mention), '標本が針に当たっていない (落とす意味が無い)').toBe(true);
    // 3 つ揃って初めて「危ない」
    expect(isRisky(fixed + positive), '危ない形を掴めていない').toBe(true);
    expect(isRisky(fixed + positive + shared), '共有の待ちを使う物を危ないと数えている').toBe(false);
    expect(isRisky(fixed), '主張の無い固定回数を危ないと数えている').toBe(false);
  });

  it('★ 共有の待ちを使う検査が十分ある (0 本を「全部消した」で達成していない)', () => {
    const using = testFiles()
      .filter((f) => path.basename(f) !== SELF)
      .filter((f) => USES_SHARED_WAIT.test(readOriginalSource(f)));
    expect(
      using.length,
      'jsdom の検査そのものが減っている —— 危ない形 0 本はそれでも達成できてしまう',
    ).toBeGreaterThanOrEqual(MIN_FILES_USING_SHARED_WAIT);
  });
});

describe('固定回数で待ってから文を主張する検査 — 1 本も無い', () => {
  it('★ 固定回数で待ってから文を主張する検査は 1 本も無い', () => {
    expect(
      population(),
      '固定回数で待ってから文を主張している —— `__tests__/jsdomWait.ts` の waitForText / waitForElement / settleUntil を使うこと',
    ).toEqual([]);
  });
});
