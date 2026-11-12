/**
 * **操作子の枠・フォーカスの輪・選んだ状態の塗りの対比 (WCAG 2.x 1.4.11 非テキスト 3:1) と、それを使う CSS の規則**
 * (2026-10-03 · パス 504)。
 *
 * パス 503 は**文字**を測った (`themeContrast.test.ts` · 4.5:1)。ここは文字でない物 —— 入力欄の枠・キーボードの焦点の輪・
 * チェックボックス / ラジオ / スライダーの塗り —— を測る。入力欄は**空のとき**中身が無いので、枠だけがそれを入力欄と示す。
 *
 * ## 何が見つかったか (実機で描画済みの色を 4 配色 × 全 74 画面で測った)
 *
 * 直す前: **入力欄の枠は 758 欄のうち 752 欄が 3:1 に届かず (1.2〜1.9:1)**・**フォーカスの輪は全部の配色で 1.3〜2.6:1**
 * (半透明の光彩 `--focus-ring` が輪の役をしていた・実測 1.4〜2.7:1) だった。入力欄の枠はトークン `--border-strong`
 * (実測 1.33〜1.91:1) で、**1 つのトークンを直しても足りなかった** —— 直書きの `1px solid var(--border-strong)` が TSX に
 * 64 か所在り、枠を決めていたのは CSS ではなく**描く側**だったため。だから 2 層で留める:
 *
 *   - ここ: トークン表の対 (`--control-border` / `--focus-outline` / `--accent-strong` を下の地に置いて 3:1)・
 *     それを使う CSS の規則の形 (輪を消す規則が無い・入力欄の枠の色は台帳のトークンだけ・ポインタを載せても薄くならない)
 *   - 構文木の census (`fieldBorderCensus.test.ts`): TSX の `style={{ border: … }}` が同じトークンを使うこと
 *   - 実機の suite `controls` (`scripts/e2e/core.cjs`): **描画済みの枠と輪**を全画面 × 4 配色で測る
 *
 * ## 3:1 を要求する範囲 (WCAG 1.4.11 の「輪郭がその部品を識別する唯一の手がかり」)
 *
 * 文字の入る**ボタン**の枠は対象外 (字がボタンだと示す)。入力欄・選択欄・複数行欄・スライダーのつまみ・チェックボックス / ラジオの
 * 塗りは、字の無い状態でも見分けられる必要がある。**ポインタを載せた状態**でも枠が 3:1 を割らない (割ると、載せた瞬間に輪郭が溶ける)。
 *
 * ## ここが見ない物
 *
 * 表の対が合っていても描く側が別の対を作ることがある (画面ごとの下の地・半透明の重なり) —— 実機の suite が見る。
 * 字でも枠でもない図形 (グラフの線・アイコン・進捗の塗り) は測っていない。
 */
import { describe, expect, it } from 'vitest';
import { CSS, declOf, declarations, effectiveTables, rules, stripCssComments, type CssRule, type ThemeName } from './themeCss';
import { M, worstRatio } from './themeMath';
import { canonicalToken, MARK_NAME, MARKS, MIN_NON_TEXT, UNMEASURED_GROUNDS } from './nonTextMarks';

const TABLES = effectiveTables();
const THEMES = Object.keys(TABLES) as ThemeName[];

describe.each(THEMES)('非テキストの対比 —— %s', (theme) => {
  it('★ 台帳の色 × 地の対は、すべて 3:1 以上 (WCAG 1.4.11)', () => {
    const t = TABLES[theme];
    const failing: string[] = [];
    for (const m of MARKS) {
      for (const g of m.grounds) {
        const r = worstRatio(theme, t, m.mark, g);
        if (r < MIN_NON_TEXT) failing.push(`${m.mark} on ${g}: ${r.toFixed(2)}:1 (${m.why})`);
      }
    }
    expect(failing, '輪郭が地に溶ける対 —— 色か、それを載せる面を直す').toEqual([]);
  });
});

describe('非テキストの対比 —— 台帳の形', () => {
  it('★ 台帳の外へ出した組は、4 配色のどれかで実際に割る (両方向)', () => {
    for (const u of UNMEASURED_GROUNDS) {
      const worst = Math.min(...THEMES.map((th) => worstRatio(th, TABLES[th], u.mark, u.ground)));
      expect(worst, `${u.mark} on ${u.ground} は全配色で 3:1 を満たす —— MARKS の地へ移して例外を消す`).toBeLessThan(MIN_NON_TEXT);
      expect(u.why.length, '例外には理由を書く').toBeGreaterThanOrEqual(15);
    }
  });

  it('★ 非テキストの色トークンは台帳に載る・台帳の名前と地は 4 枚の表に在る (双方向)', () => {
    const inLedger = new Set(MARKS.map((m) => m.mark));
    for (const theme of THEMES) {
      const t = TABLES[theme];
      const declared = [...t.keys()].filter((n) => MARK_NAME.test(n));
      expect(
        declared.filter((n) => !inLedger.has(n)),
        `${theme}: 台帳に無い非テキストの色 (その色が隣り合う地を MARKS に書く)`,
      ).toEqual([]);
      expect(
        [...inLedger].filter((n) => !t.has(n)),
        `${theme}: 台帳に在るが表に無い名前`,
      ).toEqual([]);
      const grounds = new Set([...MARKS.flatMap((m) => m.grounds), ...UNMEASURED_GROUNDS.map((u) => u.ground)]);
      expect([...grounds].filter((g) => !t.has(g)), `${theme}: 台帳が名指しする地が表に無い (綴り違いで測りが空になる)`).toEqual([]);
    }
  });

  it('標本: 直す前のトークンは割る (測りが空でない) —— 枠 --border-strong・光彩 --focus-ring・ホバーの枠 --list-hover-border', () => {
    // 実測 (2026-10-03・直す前): 枠 1.33〜1.91:1 / 光彩 1.40〜2.70:1 / ホバーの枠 1.45〜2.34:1 (どれも 3:1 に届かない)
    for (const theme of THEMES) {
      const t = TABLES[theme];
      for (const old of ['--border-strong', '--focus-ring', '--list-hover-border']) {
        expect(worstRatio(theme, t, old, '--bg'), `${theme}: ${old} on --bg`).toBeLessThan(MIN_NON_TEXT);
      }
    }
    // いまの色は割らない
    for (const theme of THEMES) {
      const t = TABLES[theme];
      for (const cur of ['--control-border', '--focus-outline']) {
        expect(worstRatio(theme, t, cur, '--bg'), `${theme}: ${cur} on --bg`).toBeGreaterThanOrEqual(MIN_NON_TEXT);
      }
    }
  });

  it('標本: 対比は実際の 4 枚の表から読めている (白黒は 21:1・色は読める)', () => {
    expect(M.ratio(M.parse('#ffffff')!, M.parse('#000000')!)).toBeCloseTo(21, 5);
    for (const theme of THEMES) {
      expect(TABLES[theme].get('--control-border')).toMatch(/^#[0-9a-f]{6}$/i);
      expect(TABLES[theme].get('--focus-outline')).toBe('var(--accent-strong)');
    }
  });
});

// ──────────────────────────── CSS の規則 ────────────────────────────

const ALL_RULES = rules(CSS);

const byExactSelector = (selector: string): CssRule[] => ALL_RULES.filter((r) => r.selector === selector);

/** 括弧と角括弧の外の空白・`>`・`+`・`~` で切った最後の塊 (そのセレクタが指す要素)。 */
function subjectOf(simple: string): string {
  let depth = 0;
  let last = '';
  let cur = '';
  for (const c of simple.trim()) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[\s>+~]/.test(c)) {
      if (cur) last = cur;
      cur = '';
    } else cur += c;
  }
  return cur || last;
}

/** 入力欄を指すセレクタの塊か (`input` / `select` / `textarea` / `*-input` のクラス)。 */
const FIELD_SUBJECT = /^(?:input|select|textarea)(?![\w-])|-input(?![\w-])/;

const fieldSelectors = (r: CssRule): boolean => r.selector.split(',').some((s) => FIELD_SUBJECT.test(subjectOf(s)));

/** 規則が `border*` で使う色 (`var(--x)` の名前と、直書きの色)。幅・形・角丸は色ではない。 */
function borderColours(r: CssRule): string[] {
  const out: string[] = [];
  for (const [prop, value] of r.decls) {
    if (!/^border(?:-(?:top|right|bottom|left))?(?:-color)?$/.test(prop)) continue;
    for (const m of value.matchAll(/var\((--[\w-]+)/g)) out.push(m[1]!);
    for (const m of value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) out.push(m[0]);
  }
  return out;
}

/**
 * 入力欄の枠の規則の台帳 —— 状態ごとの規則 (既定・ポインタを載せた・焦点を持つ) を**名指しする**。
 * 枠の色を持つ規則がこの外に生えたら落ちる (census が両方向で見る)。
 */
const FIELD_RULES: readonly { selector: string; token: string; why: string }[] = [
  {
    selector: 'input:where(:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"])), select, textarea',
    token: '--control-border',
    why: '入力欄の既定の枠',
  },
  { selector: 'input:hover, select:hover, textarea:hover', token: '--text-muted', why: 'ポインタを載せたとき (既定より濃く)' },
  { selector: 'input:focus, select:focus, textarea:focus', token: '--focus-outline', why: '焦点を持つとき (枠の色替え + 光彩)' },
  { selector: '.sidebar-search-input', token: '--control-border', why: 'サイドバーの検索欄' },
  { selector: '.sidebar-search-input:focus', token: '--focus-outline', why: 'サイドバーの検索欄が焦点を持つとき' },
  { selector: '.concierge-input', token: '--control-border', why: '浮いたコンシェルジュの入力欄' },
  { selector: '.concierge.docked .concierge-form', token: '--control-border', why: '列にしたコンシェルジュの入力欄 (枠は入力欄ではなく外の箱が持つ)' },
  { selector: '.concierge.docked .concierge-form:focus-within', token: '--focus-outline', why: '同じ箱が焦点を持つとき (中の入力欄が焦点を取ると箱の枠と輪が出る)' },
  { selector: 'input[type="range"]::-webkit-slider-thumb', token: '--accent-strong', why: 'スライダーのつまみの縁 (Chromium)' },
  { selector: 'input[type="range"]::-moz-range-thumb', token: '--accent-strong', why: 'スライダーのつまみの縁 (Firefox)' },
];

/**
 * **輪を欄ではなく外の箱が持つ** 入力欄 (列のチャット欄)。欄自身の `:focus-visible` の輪は消す —— 箱の内側にもう 1 本重なって
 * 3 重の輪になるため (実測の見た目)。消してよいのは、**外の箱が `:focus-within` で `--focus-outline` の輪を持つとき**だけ (census が両方向で見る)。
 */
const OUTLINE_REPLACED_BY_WRAPPER: readonly { readonly selector: string; readonly wrapper: string; readonly why: string }[] = [
  {
    selector: '.concierge.docked .concierge-input:focus-visible',
    wrapper: '.concierge.docked .concierge-form:focus-within',
    why: '列のチャット欄は枠を持たず、外の箱 (.concierge-form) が枠と輪を持つ。欄にも輪を出すと箱の内側へ 3 重になる',
  },
];

describe('CSS の規則 —— 読み手', () => {
  it('標本: 規則の読み手は入れ子・引用符・括弧の中の `;`・コメントを正しく扱う', () => {
    const sample = `
      /* .gone { color: red } */
      @import url(x.css);
      .a, .b:hover { border: 1px solid var(--x); background: url(data:image/svg+xml;base64,AAAA); }
      @media (max-width: 10px) { .c { outline: none; } }
      @keyframes k { from { opacity: 0 } to { opacity: 1 } }
      .d { content: "a;b"; color: red }
    `;
    const rs = rules(sample);
    expect(rs.map((r) => r.selector)).toEqual(['.a, .b:hover', '.c', '.d']);
    expect(rs[0]!.decls).toEqual([
      ['border', '1px solid var(--x)'],
      ['background', 'url(data:image/svg+xml;base64,AAAA)'],
    ]);
    expect(rs[1]!.context).toBe('@media (max-width: 10px)');
    expect(declOf(rs[2]!, 'content')).toBe('"a;b"');
    expect(declOf(rs[2]!, 'color')).toBe('red');
    expect(stripCssComments('a /* b */ c')).toBe('a  c');
    expect(declarations('a: 1; b: f(x;y); c: "q;r"')).toEqual([
      ['a', '1'],
      ['b', 'f(x;y)'],
      ['c', '"q;r"'],
    ]);
  });

  it('標本: 実物の styles.css が読めている (読めなければ以下は空の検査になる・床 250 規則)', () => {
    expect(ALL_RULES.length).toBeGreaterThanOrEqual(250);
    expect(byExactSelector(':focus-visible')).toHaveLength(1);
  });

  it('標本: セレクタの指す要素の取り出しと、入力欄の判定', () => {
    expect(subjectOf('.concierge.docked .concierge-form:focus-within')).toBe('.concierge-form:focus-within');
    expect(subjectOf('input:where(:not([type="checkbox"]) :not([type="radio"]))')).toBe('input:where(:not([type="checkbox"]) :not([type="radio"]))');
    expect(subjectOf('.a > .b ~ input[type="range"]::-webkit-slider-thumb')).toBe('input[type="range"]::-webkit-slider-thumb');
    expect(FIELD_SUBJECT.test('input[type="range"]')).toBe(true);
    expect(FIELD_SUBJECT.test('.sidebar-search-input:focus')).toBe(true);
    expect(FIELD_SUBJECT.test('.concierge-form')).toBe(false);
    expect(FIELD_SUBJECT.test('inputs')).toBe(false);
  });
});

describe('CSS の規則 —— 見えるフォーカス (WCAG 2.4.7 / 1.4.11)', () => {
  it('★ 焦点の輪は不透明な専用のトークン・幅 2px 以上 (全体の規則 `:focus-visible`)', () => {
    const r = byExactSelector(':focus-visible')[0]!;
    const outline = declOf(r, 'outline') ?? '';
    expect(outline).toMatch(/^(\d+)px solid var\(--focus-outline\)$/);
    expect(Number(/^(\d+)px/.exec(outline)![1])).toBeGreaterThanOrEqual(2);
    const field = byExactSelector('input:focus-visible, select:focus-visible, textarea:focus-visible')[0]!;
    expect(Number(/^(\d+)px$/.exec(declOf(field, 'outline-width') ?? '')?.[1])).toBeGreaterThanOrEqual(2);
  });

  it('★ 輪を消す規則も、別の色の輪も無い (outline を宣言する規則はすべて --focus-outline・none / 0 は無い —— 外の箱が輪を持つ台帳の 1 件を除く)', () => {
    const replaced = new Set(OUTLINE_REPLACED_BY_WRAPPER.map((o) => o.selector));
    const bad: string[] = [];
    for (const r of ALL_RULES) {
      if (replaced.has(r.selector)) continue;
      for (const [prop, value] of r.decls) {
        if (!/^outline(?:-(?:color|style|width))?$/.test(prop)) continue;
        if (/^(?:none|hidden|0|0px)\b/.test(value) || (prop === 'outline-width' && /^0/.test(value))) bad.push(`${r.selector} { ${prop}: ${value} }`);
        else if ((prop === 'outline' || prop === 'outline-color') && !/var\(--focus-outline\)/.test(value)) bad.push(`${r.selector} { ${prop}: ${value} }`);
      }
    }
    expect(bad, '焦点の輪を消す・薄い色へ替える規則 (輪を持たない部品は、焦点を取ったとき見えなくなる)').toEqual([]);
  });

  it('★ 欄の輪を消してよいのは、外の箱が --focus-outline の輪を持つとき (台帳 OUTLINE_REPLACED_BY_WRAPPER・両方向)', () => {
    for (const o of OUTLINE_REPLACED_BY_WRAPPER) {
      const rule = byExactSelector(o.selector)[0];
      expect(rule, `規則が無い (台帳が古い): ${o.selector}`).toBeDefined();
      expect(declOf(rule!, 'outline'), o.selector).toBe('none');
      const box = byExactSelector(o.wrapper)[0];
      expect(box, `外の箱の規則が無い: ${o.wrapper}`).toBeDefined();
      expect(declOf(box!, 'outline'), `${o.wrapper} が輪を持たない —— 欄の輪を消すと焦点が見えなくなる`).toMatch(/^\d+px solid var\(--focus-outline\)$/);
      expect(declOf(box!, 'border-color'), o.wrapper).toBe('var(--focus-outline)');
      expect(o.why.length).toBeGreaterThanOrEqual(30);
    }
    // 台帳に無い `outline: none` は落ちる (台帳が効いている)
    const stray = rules('.x:focus-visible { outline: none; }').filter((r) => !OUTLINE_REPLACED_BY_WRAPPER.some((o) => o.selector === r.selector));
    expect(stray.length).toBe(1);
  });

  it('★ 焦点を受ける入力欄は、枠の色替えも光彩もトークン (焦点の枠 = 輪と同じ色)', () => {
    for (const sel of ['input:focus, select:focus, textarea:focus', '.sidebar-search-input:focus']) {
      const r = byExactSelector(sel)[0];
      expect(r, `規則が無い: ${sel}`).toBeDefined();
      expect(declOf(r!, 'border-color')).toBe('var(--focus-outline)');
    }
  });

  it('★ ホバーでだけ現れる物は、キーボードの焦点でも現れる (opacity: 0 のままだと輪ごと見えない)', () => {
    const base = byExactSelector('.fav-toggle')[0]!;
    expect(declOf(base, 'opacity')).toBe('0');
    const revealing = ALL_RULES.filter((r) => /\.sidebar-item:focus-visible \.fav-toggle|\.fav-toggle:focus-visible/.test(r.selector));
    expect(revealing.length, '焦点で現れる規則').toBeGreaterThanOrEqual(2);
    for (const r of revealing) expect((declOf(r, 'opacity') ?? '').replace(/\s*!important$/, ''), r.selector).toMatch(/^(0\.[5-9]\d*|1)$/);
  });

});

describe('CSS の規則 —— 入力欄の枠 (WCAG 1.4.11)', () => {
  it('★ 台帳の規則はすべて実在し、枠の色は台帳のトークンを使う (状態ごと)', () => {
    for (const f of FIELD_RULES) {
      const found = byExactSelector(f.selector);
      expect(found.length, `規則が無い (台帳が古い): ${f.selector}`).toBeGreaterThanOrEqual(1);
      const colours = found.flatMap(borderColours);
      expect(colours, `${f.selector} (${f.why}) が枠の色を持たない`).toContain(f.token);
      expect(
        colours.filter((c) => c !== f.token),
        `${f.selector} が台帳の外の色も使う`,
      ).toEqual([]);
    }
  });

  it('★ 入力欄の枠の色を持つ規則は、台帳に載る (双方向 —— 新しい状態の規則が薄い枠を足さない)', () => {
    const inLedger = new Set(FIELD_RULES.map((f) => f.selector));
    const stray = ALL_RULES.filter((r) => fieldSelectors(r) && borderColours(r).length > 0 && !inLedger.has(r.selector)).map(
      (r) => `${r.selector} { ${borderColours(r).join(', ')} }`,
    );
    expect(stray, '台帳に無い入力欄の枠の規則 (FIELD_RULES へ、3:1 を測ったトークンで書く)').toEqual([]);
  });

  it('★ 台帳が使う枠のトークンは、すべて非テキストの台帳 (MARKS) で 3:1 を測っている', () => {
    // 別名 (--focus-outline = --accent-strong) は本体の名前へ解いてから照合する
    const light = TABLES['すっきり × ライト'];
    const measured = new Set(MARKS.map((m) => canonicalToken(m.mark, light)));
    expect(FIELD_RULES.filter((f) => !measured.has(canonicalToken(f.token, light))).map((f) => `${f.selector} → ${f.token}`)).toEqual([]);
  });

  it('★ 選んだ状態の塗りは強調の字の色 (accent-color)・スライダーは押せる大きさ (24px)', () => {
    const accent = ALL_RULES.find((r) => r.selector === 'input[type="checkbox"], input[type="radio"], input[type="range"]')!;
    expect(declOf(accent, 'accent-color')).toBe('var(--accent-strong)');
    const range = byExactSelector('input[type="range"]')[0]!;
    expect(declOf(range, 'height')).toBe('24px');
    const summary = byExactSelector('summary')[0]!;
    expect(declOf(summary, 'min-height')).toBe('24px');
  });

  it('★ 押せる小さな部品は 24×24px の当たり判定を持つ (見た目は負の余白で変えない)', () => {
    const fav = byExactSelector('.fav-toggle')[0]!;
    expect(declOf(fav, 'min-width')).toBe('24px');
    expect(declOf(fav, 'min-height')).toBe('24px');
  });
});

describe('CSS の規則 —— トークンの参照', () => {
  it('★ styles.css が読む var(--名前) は、どこかで定義されている (消したトークンを読み続けると指定が黙って効かない)', () => {
    const text = stripCssComments(CSS);
    const used = new Set([...text.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!));
    const defined = new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!));
    const undefinedNames = [...used].filter((n) => !defined.has(n)).sort();
    expect(undefinedNames, '未定義の変数名は無効な値になり、その指定は無かったことになる').toEqual([]);
    // 標本: 走査は実物に当たる (パス 504 で `--thumb-border` を消した —— 読み手が残っていれば鳴る)
    expect(used.has('--control-border')).toBe(true);
    expect(used.has('--focus-outline')).toBe(true);
    expect(used.has('--thumb-border')).toBe(false);
    expect(used.size).toBeGreaterThan(80);
  });
});
