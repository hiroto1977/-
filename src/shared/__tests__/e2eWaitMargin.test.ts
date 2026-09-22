/**
 * **実機 e2e の「待ち」を測る道具そのものを、実物と突き合わせる** (2026-09-22 · パス 397)。
 *
 * ## 何を見つけた道具なのか
 *
 * パス 393 の `TimeoutError` (連鎖の中で 1 度だけ) を、パス 395 / 396 は忠実な条件で
 * 2 反復追って**再現しなかった**。反復は 1 回 ≒ 15 分で、外れたときに何も分からない。
 * そこで「落ちるのを待つ」のをやめ、**待ちごとの 実測 ÷ 制限**を測る道具
 * (`npm run audit:e2e-wait-margin`) を作った —— どちらに転んでも結論が出るからである。
 *
 * その道具が **1 件見つけた**:
 *
 * ```
 *   talent :: waitFor@locator(div)>filter>first   30,004 ms / 制限 30,000 ms = 100.0%
 * ```
 *
 * `page.locator('div').filter({ hasText: /^営業$/ })` は、`営業` が `<input>` の**値**で
 * あってどの `div` の textContent でもないため **永久に 0 件**である。
 * `.catch(() => {})` が時間切れを飲み、次の行に主張が無いので、実体は
 * **30 秒ちょうどの sleep** だった —— FULL / LITE の両方で**毎回**。
 * (`check()` が自分で待つので検査は通っていた。**通っていた理由が、書かれていた理由と
 * 違った**。)
 *
 * ## ここが見る物 (時間は測らない)
 *
 * 壁時計時間の判定は CI で誤爆する (`regexPolynomialLedger` と同じ判断) ので、
 * **測定は定期点検の道具**が持つ。この検査が留めるのは決定的な 3 つ:
 *
 *   1. 畳み方の意味 —— **最大**を残す (平均だと「たまに 12 秒」が薄まって消える)
 *   2. **飲み込んだ待ちは、直後に絶対の主張が在るときだけ許す** (両方向の台帳)
 *   3. **記録子の母集団** —— runner が実際に呼ぶ Locator のメソッドは、
 *      待つ物として測るか、理由つきで免除されているかのどちらか (両方向)
 *
 * 3 が要るのは、この道具が**母集団を 2 度広げた**からである: 最初は `page.waitFor*` の
 * 3 つだけを包んでいて **最大 13.5%** と報告し、`goto` / `click` / `fill` と
 * **Locator の action** を足した回に **100.0%** が出た。実測で `.click(` は
 * **135 か所のうち 117 が `page.` 以外** (`.fill(` は 121 / 107) —— page だけ包むと
 * **半分以上が映らない**。パス 334 / 368 / 369 と同じ家系なので、狭まったら鳴らせる。
 *
 * (この 135 / 121 は**注記を除いたコードだけ**で数えた値である。全文で数えると
 * 上の説明文自身が `.click()` を書いているので 138 / 122 になる ——
 * 次に数え直す人が「古い」と思わないように書いておく。)
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(join(REPO, 'package.json'));
const TOOL = 'scripts/audit-e2e-wait-margin.cjs';
const RUNNER = 'scripts/e2e/core.cjs';

const tool = req(join(REPO, TOOL)) as {
  summarize: (rows: readonly { suite: string; what: string; ms: number; limit: number }[]) => readonly {
    suite: string; what: string; maxMs: number; limit: number; ratio: number;
  }[];
  THIN_RATIO: number;
};

/** runner の原文 (Stryker の sandbox の写しではなく原文を読む)。 */
const runnerSource = (): string => readOriginalSource(join(REPO, RUNNER));

/**
 * 注記を落として**コードだけ**にする。
 *
 * **これが無いと自分の説明文に当たる** —— パス 397 の直しの docblock は、直した
 * 当の古い形 (`filter({ hasText: /^営業$/ })`) を**引用して**いるので、
 * 「その形が無いこと」を全文に対して主張すると自分の注記で落ちる
 * (法則 `mention-vs-declaration`。実際にこの検査を書いたとき 1 度落ちた)。
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*'));
    })
    .join('\n');
}

/**
 * `.catch(() => {})` が付いている**式**を、行ではなく**文**の単位で取る。
 *
 * 行から 3 行遡る形で書いたら、隣の文 (`btn.first().click().catch(() => {})`) が
 * その上に在る `waitForFunction` を自分の連鎖と誤認して 2 件になった ——
 * **針の誤りで、製品の誤りではない**。継続行かどうかは「前の行が `;` `{` `}` で
 * 終わっていないか」で決める (この runner の書き方に対してはそれで足りる)。
 */
export function swallowedWaitStatements(source: string): string[] {
  const lines = codeOnly(source).split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\.catch\(\(\)\s*=>\s*\{\}\)/.test(lines[i]!)) continue;
    let start = i;
    while (start > 0) {
      const prev = lines[start - 1]!.trim();
      if (prev === '' || /[;{}]$/.test(prev)) break;
      start -= 1;
    }
    const stmt = lines.slice(start, i + 1).join('\n');
    if (/\.?waitFor[A-Za-z]*\(/.test(stmt)) out.push(stmt);
  }
  return out;
}

/**
 * `const NAME = [...]` / `const NAME = new Set([...])` の中の引用符つきの語を取る。
 *
 * 走査が壊れて空集合になると「一致している」になってしまうので、
 * 呼び手は**必ず床を置く** (下の `it` がそれぞれ最小件数を主張する)。
 */
function listedNames(source: string, name: string): string[] {
  const m = new RegExp(`const ${name} = (?:new Set\\()?\\[([^\\]]*)\\]`).exec(source);
  if (m === null) return [];
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

// --- 1. 畳み方の意味 -------------------------------------------------------------

describe('audit:e2e-wait-margin の畳み方', () => {
  it('★ 同じ待ちは最大を残す (平均ではない —— 時間切れは最悪の 1 回で起きる)', () => {
    const s = tool.summarize([
      { suite: 'a', what: 'x', ms: 100, limit: 15000 },
      { suite: 'a', what: 'x', ms: 12000, limit: 15000 },
      { suite: 'a', what: 'x', ms: 200, limit: 15000 },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]!.maxMs).toBe(12000);
  });

  it('★ 並びは ms ではなく割合 (制限が違う待ちを混ぜて比べるため)', () => {
    const s = tool.summarize([
      { suite: 'b', what: 'loose', ms: 9000, limit: 30000 },
      { suite: 'a', what: 'tight', ms: 900, limit: 1000 },
    ]);
    expect(s.map((x) => x.what)).toEqual(['tight', 'loose']);
  });

  it('★ 制限ちょうど使う待ちは 100% として出る (パス 397 が見つけた形)', () => {
    const s = tool.summarize([{ suite: 'talent', what: 'waitFor@locator(div)>filter>first', ms: 30004, limit: 30000 }]);
    expect(s[0]!.ratio).toBeGreaterThanOrEqual(1);
    expect(s[0]!.ratio).toBeGreaterThanOrEqual(tool.THIN_RATIO);
  });

  it('しきい値は 50% (「薄い」と名指しする線)', () => {
    expect(tool.THIN_RATIO).toBe(0.5);
  });
});

// --- 2. 飲み込んだ待ち -----------------------------------------------------------

/** 時間切れを飲む待ちは、**直後に絶対の主張**が在るときだけ許す。 */
interface SwallowRow {
  /** その行に含まれる、行を一意に決める綴り。 */
  readonly needle: string;
  readonly why: string;
}

const SWALLOWED: readonly SwallowRow[] = [
  {
    needle: "document.documentElement.getAttribute('data-theme') === 'light'",
    why: '飲んでも次の行が `ok((await attr()) === \'light\', …)` と**絶対に**主張するので、'
      + '待ちが空振りしたらその主張が落ちる (飲み込みは念のための物)。',
  },
];

describe('e2e runner: 時間切れを飲む待ち', () => {
  const source = runnerSource();
  const swallowedLines = (): string[] => swallowedWaitStatements(source);

  it('★ 走査が空虚でない (実物の形に当たっている標本つき)', () => {
    // 標本: 実物とまったく同じ形 —— 複数行の連鎖は 1 件・**待ちでない `.catch` は
    // 数えない** (この 2 つを同じ標本に入れるのが要点。最初に書いた 3 行遡る針は
    // 隣の `click().catch()` を巻き込んで 2 件になった)。
    const probe = [
      '  await page',
      '    .waitForFunction(() => x, undefined, { timeout: 5000 })',
      '    .catch(() => {});',
      '  await btn.first().click().catch(() => {});',
    ].join('\n');
    expect(swallowedWaitStatements(probe)).toHaveLength(1);
    expect(swallowedWaitStatements(probe)[0]).toContain('waitForFunction');
    // 注記の中の言及は数えない (自分の説明文で母集団が膨らまないこと)。
    expect(swallowedWaitStatements('// await x.waitFor().catch(() => {});')).toEqual([]);
    expect(source).toContain('.catch(() => {})'); // 実物にその綴りが在る
  });

  it('★ 飲み込んだ待ちは台帳と一致する (母集団 → 台帳)', () => {
    const found = swallowedLines();
    const unlisted = found.filter((c) => !SWALLOWED.some((r) => c.includes(r.needle)));
    expect(
      unlisted,
      '時間切れを飲む待ちが台帳に無い。**飲んでよいのは直後に絶対の主張が在るときだけ** ——'
      + 'パス 397 の `talent` は主張が無く、実体が 30 秒の sleep だった:\n'
      + unlisted.join('\n---\n'),
    ).toEqual([]);
  });

  it('★ 台帳の行は実物に在る (台帳 → 母集団)', () => {
    const found = swallowedLines().join('\n');
    const stale = SWALLOWED.filter((r) => !found.includes(r.needle)).map((r) => r.needle);
    expect(stale, `台帳に在るのに実物から消えている —— 消えたなら台帳からも消すこと: ${stale.join(', ')}`).toEqual([]);
  });

  it('★ 台帳の理由が空でない', () => {
    for (const r of SWALLOWED) expect(r.why.length, r.needle).toBeGreaterThan(30);
  });

  it('★ パス 397 が直した形は戻っていない (成り立ち得ない条件を待って飲む)', () => {
    // **コードだけを見る** —— 直しの docblock がその古い形を引用している。
    expect(codeOnly(source)).not.toContain('filter({ hasText: /^営業$/ })');
    // 針の標本: この綴りは実物の注記の中には在る (だから codeOnly が要る)。
    expect(source).toContain('filter({ hasText: /^営業$/ })');
    // 肯定の側: 直しは**条件で待つ** (法則 wait-for-condition-not-ticks)。
    expect(codeOnly(source)).toContain("input[aria-label=\"申告 1 の部署名\"]')?.value === '営業'");
  });
});

// --- 3. 記録子の母集団 -----------------------------------------------------------

/**
 * runner が呼ぶ Locator のメソッドのうち、**待たないので測らない**物。
 *
 * Playwright の Locator は「action は待つ / 連鎖と件数は待たない」で分かれる。
 * 待たない物を入れると **0 ms の待ちが母集団を薄め**、割合の分母が意味を失う。
 */
const NOT_A_WAIT: readonly { readonly method: string; readonly why: string }[] = [
  { method: 'count', why: '現在の一致件数を返すだけで要素を待たない (0 件も正当な答え)' },
  { method: 'isVisible', why: '待たずに今の可視性を返す (Playwright の仕様)' },
  { method: 'allTextContents', why: '現在の一致に対して textContent を集めるだけで待たない' },
  { method: 'evaluateAll', why: '現在の一致全部に対して走らせるだけで待たない (`evaluate` 単数は待つので測る)' },
  { method: 'first', why: '連鎖 (新しい Locator を返す)。記録子は**包み直す**ので測るのは末端の action' },
  { method: 'nth', why: '連鎖 —— n 番目の Locator を返すだけで、待つのは末端の action' },
  { method: 'filter', why: '連鎖 —— 絞った Locator を返すだけ。**0 件に絞れても待たない** (パス 397 の当のもの)' },
  { method: 'locator', why: '連鎖でもあり page の入口でもある。記録子は入口として別に包む' },
  { method: 'getByRole', why: '入口 —— role で引いた Locator を返す。記録子はここで包んで連鎖を追う' },
  { method: 'getByLabel', why: '入口 —— ラベルで引いた Locator を返す (フォームの入力欄はほぼこれ)' },
  { method: 'getByPlaceholder', why: '入口 —— placeholder で引いた Locator を返す (パスワード欄などがこれ)' },
  { method: 'clear', why: 'Locator の呼び出しではない —— 実物の 1 件は `outbound.clear()` (Set)' },
];

/** Playwright の Locator API の語彙 (runner が使う物はすべてこの中に在ること)。 */
const LOCATOR_VOCAB: readonly string[] = [
  'click', 'dblclick', 'fill', 'check', 'uncheck', 'press', 'pressSequentially', 'type', 'hover',
  'tap', 'selectOption', 'selectText', 'setInputFiles', 'focus', 'blur', 'clear', 'dragTo',
  'scrollIntoViewIfNeeded', 'waitFor', 'evaluate', 'evaluateAll',
  'textContent', 'innerText', 'innerHTML', 'inputValue', 'getAttribute',
  'isChecked', 'isEnabled', 'isDisabled', 'isEditable', 'isHidden', 'isVisible',
  'boundingBox', 'screenshot', 'count', 'all', 'allTextContents', 'allInnerTexts',
  'first', 'last', 'nth', 'filter', 'and', 'or', 'locator',
  'getByRole', 'getByLabel', 'getByPlaceholder', 'getByText', 'getByTestId',
];

describe('e2e runner: 待ちの記録子の母集団', () => {
  const source = runnerSource();
  const measured = listedNames(source, 'LOC_WAITS');
  const factories = listedNames(source, 'LOC_FACTORIES');
  const watched = listedNames(source, 'WATCHED');

  /** runner が実際に呼ぶ、語彙に載っているメソッド。 */
  const used = (): string[] =>
    LOCATOR_VOCAB.filter((m) => new RegExp(`\\.${m}\\(`).test(source)).sort();

  it('★ 走査が空虚でない (3 つの表を実物から読めている)', () => {
    expect(measured.length, 'LOC_WAITS').toBeGreaterThanOrEqual(20);
    expect(factories.length, 'LOC_FACTORIES').toBeGreaterThanOrEqual(4);
    expect(watched.length, 'WATCHED').toBeGreaterThanOrEqual(6);
    expect(used().length, 'runner が使う Locator メソッド').toBeGreaterThanOrEqual(20);
    // 針の標本: 綴りを取る形が実物と同じであること。
    expect(listedNames("const X = ['a', 'b'];", 'X')).toEqual(['a', 'b']);
    expect(listedNames("const Y = new Set([\n  'p',\n  'q',\n]);", 'Y')).toEqual(['p', 'q']);
    expect(listedNames('const Z = [];', 'NOPE')).toEqual([]);
  });

  it('★ page 側の待ちは 6 つとも測る (goto / click / fill を落とすと 11 MB の読み込みが母集団から消える)', () => {
    for (const m of ['waitForSelector', 'waitForFunction', 'waitForURL', 'goto', 'click', 'fill']) {
      expect(watched, `WATCHED に ${m} が要る`).toContain(m);
    }
  });

  it('★ runner が使う入口はすべて包む (包み忘れた入口の下の action は 1 件も映らない)', () => {
    for (const f of ['locator', 'getByRole', 'getByLabel', 'getByPlaceholder']) {
      // 実物が使っていることを先に確かめる (使っていない物を要求しない)。
      expect(source, `${f} は実物が使っている`).toContain(`.${f}(`);
      expect(factories, `LOC_FACTORIES に ${f} が要る`).toContain(f);
    }
  });

  it('★ runner が呼ぶ Locator メソッドは、測るか理由つきで免除されている (母集団 → 表)', () => {
    const exempt = new Set(NOT_A_WAIT.map((r) => r.method));
    const unclassified = used().filter((m) => !measured.includes(m) && !exempt.has(m));
    expect(
      unclassified,
      '待つかどうか決めていない Locator のメソッドが在る。**待つなら LOC_WAITS へ**、'
      + `待たないなら理由つきで NOT_A_WAIT へ: ${unclassified.join(', ')}`,
    ).toEqual([]);
  });

  it('★ 免除の表に、実物が使っていない物を置かない (表 → 母集団)', () => {
    const stale = NOT_A_WAIT.filter((r) => !new RegExp(`\\.${r.method}\\(`).test(source)).map((r) => r.method);
    expect(stale, `免除の表に実物が呼んでいない物が在る: ${stale.join(', ')}`).toEqual([]);
  });

  it('★ 免除の理由が空でない', () => {
    for (const r of NOT_A_WAIT) expect(r.why.length, r.method).toBeGreaterThan(15);
  });

  it('★ 待つ物と待たない物は重ならない', () => {
    const both = NOT_A_WAIT.map((r) => r.method).filter((m) => measured.includes(m));
    expect(both, `同じメソッドを両方に置いている: ${both.join(', ')}`).toEqual([]);
  });

  it('★ 記録子は環境変数が無ければ何もしない (常時有効にすると全 suite に費用が乗る)', () => {
    expect(source).toContain('const out = process.env.SERVICE_HUB_E2E_WAIT_MARGIN;');
    expect(source).toContain('if (!out) return;');
  });
});
