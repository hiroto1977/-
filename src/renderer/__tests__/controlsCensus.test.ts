/**
 * **操作子の構文木の census** (2026-10-03 · パス 504) —— 入力欄の枠・焦点の輪・キーボードで押せるか。
 *
 * ## なぜ構文木か
 *
 * パス 504 の実機の測定 (4 配色 × 全 74 画面) で、**入力欄の枠は 758 欄のうち 752 欄が 3:1 に届かなかった**。
 * 枠を決めていたのは CSS のトークンではなく、**TSX の `style={{ border: '1px solid var(--border-strong)' }}` の直書き 64 か所**
 * (+ それを束ねた const の style) だった —— CSS のトークンを直しても 1 欄も変わらない。だから「枠の色は台帳のトークンだけ」を
 * **描く側**で留める (CSS 側は `themeNonTextContrast.test.ts`・描画済みの色は実機の suite `controls`)。
 *
 * ## 規則 (画面のソース 110 本を構文木で走査する)
 *
 * 1. **入力欄の枠**: `<input>` / `<select>` / `<textarea>` / `<GuardedNumber>` の `style` が決める `border*` は、
 *    非テキストの台帳 (`nonTextMarks.ts` の `MARKS`) のトークンだけ。直書きの色・薄い枠のトークン (`--border` / `--border-strong`)・
 *    枠なし (`none` / `0` / `transparent`) は落とす。`style` が読めない形 (呼び出し・props) は**読めないと言って**落とす
 *    (台帳 `SPREAD_FORWARDERS` に理由つきで載せた物だけ通す)。
 * 2. **押せる要素**: ネイティブでない要素 (`div` / `span` …) が `onClick` などのポインタ操作を持つなら、`role`・`tabIndex`・
 *    キー操作 (`onKeyDown` …) を**属性として**持つ (WCAG 2.1.1・4.1.2)。属性の展開 (`{...x}`) は読めないので落とす。
 *    例外は暗幕 (`aria-hidden` の click-to-dismiss) だけで、台帳 `DISMISS_SURFACES` に理由つき・Esc の経路があること。
 * 3. **輪を style で消さない**: style の宣言に `outline*` は無い (輪は CSS の `:focus-visible` が 1 つ持つ)。
 *    焦点の輪の色を部品が上書きする (`--focus-outline` を style で定義する) 物は台帳 `FOCUS_OUTLINE_OVERRIDES` に理由つき。
 *
 * ## ここが見ない物
 *
 * 式で決まる枠 (呼び出しの返り値) は読めない (`fieldBorder` だけ最後の引数を読む)。描画済みの色・下の地・状態 (ポインタ・焦点) は
 * 実機の suite が測る。名前 (`aria-label`) は実機の suite がブラウザの AX 木で測る (綴りの検査では「名前が付くか」は決まらない)。
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { LEVEL_COLOR } from '../components/issueLevelUi';
import { canonicalToken, MARKS } from './nonTextMarks';
import { constEnv, objectsOf, parseSource, resolveStrings, tokensIn, uiSources, unwrap } from './astStyle';
import { effectiveTables } from './themeCss';

const LIGHT = effectiveTables()['すっきり × ライト'];

/** 台帳の色 (本体の名前) —— 入力欄の枠に使ってよい色。 */
const ALLOWED = new Set(MARKS.map((m) => canonicalToken(m.mark, LIGHT)));

type Rule = 'border-token' | 'border-literal' | 'borderless' | 'unresolved' | 'keyboard' | 'outline' | 'focus-override';

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: Rule;
  readonly message: string;
}

const lineOf = (sf: ts.SourceFile, n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

// ──────────────────────────── 規則 1: 入力欄の枠 ────────────────────────────

const FIELD_TAGS = new Set(['input', 'select', 'textarea']);
/** `style` を中の入力欄へ渡す部品 (中の `<input>` は部品のソース側で走査し、呼び手の `style` はここで走査する)。 */
const FIELD_COMPONENTS = new Set(['GuardedNumber']);
/** 枠を持たない種類の入力 (チェックボックスなどは見た目が違い、輪郭の規則は別の台帳 —— `accent-color` / つまみ)。 */
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'submit', 'button', 'reset', 'image']);
const BORDER_PROP = /^border(?:Top|Right|Bottom|Left)?(?:Color)?$/;
/** 最後の引数が既定の値で、残りは呼ぶ関数が決める物 (`fieldBorder(level, fallback)` —— 返す色は `LEVEL_COLOR` で台帳と照合する)。 */
const PASSTHROUGH = new Set(['fieldBorder']);
const BORDER_KEYWORDS = /(?:\b\d+(?:\.\d+)?px\b|\bsolid\b|\bdashed\b|\bdotted\b|\bdouble\b|\bgroove\b|\bridge\b|\binset\b|\boutset\b)/g;

/**
 * 呼び手の `style` を展開して中の入力欄へ渡す所 (読めない展開の例外)。呼び手の `style` は census が `<GuardedNumber style=…>` として
 * 同じ規則で走査するので、ここで枠を替えられる道は無い。
 */
const SPREAD_FORWARDERS: readonly { readonly file: string; readonly expr: string; readonly why: string }[] = [
  {
    file: 'src/renderer/components/GuardedNumber.tsx',
    expr: 'style',
    why: '部品の `style` 引数を中の <input> へ展開する。呼び手の `<GuardedNumber style=…>` は census が <input> と同じ規則で走査する (FIELD_COMPONENTS)',
  },
];

interface FieldScan {
  /** 入力欄の数 (部品を含む)。 */
  readonly fields: number;
  /** `style` を持つ入力欄の数。 */
  readonly styled: number;
  /** 枠の宣言を読めた数 (走査が空でないことの母集団)。 */
  readonly borders: number;
  readonly violations: Violation[];
}

function jsxTagName(n: ts.JsxOpeningLikeElement): string {
  return n.tagName.getText();
}

function attrOf(n: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  for (const a of n.attributes.properties) if (ts.isJsxAttribute(a) && a.name.getText() === name) return a;
  return undefined;
}

function attrExpr(a: ts.JsxAttribute | undefined): ts.Expression | undefined {
  if (a === undefined || a.initializer === undefined) return undefined;
  if (ts.isJsxExpression(a.initializer)) return a.initializer.expression ?? undefined;
  return a.initializer;
}

/** 1 つのソースの入力欄の枠を走査する。`allowed` は台帳の色 (本体の名前)。 */
export function scanFieldBorders(fileName: string, text: string, allowed: ReadonlySet<string>, light: ReadonlyMap<string, string>): FieldScan {
  const sf = parseSource(fileName, text);
  const env = constEnv(sf);
  const violations: Violation[] = [];
  let fields = 0;
  let styled = 0;
  let borders = 0;

  const flag = (n: ts.Node, rule: Rule, message: string): void => {
    violations.push({ file: fileName, line: lineOf(sf, n), rule, message });
  };

  const checkValue = (host: ts.Node, prop: string, value: ts.Expression): void => {
    const r = resolveStrings(value, env, PASSTHROUGH);
    if (r.unresolved.length > 0) {
      flag(host, 'unresolved', `${prop} の値が読めない (${r.unresolved.join(', ')}) —— 字面か、台帳のトークンを返す関数に`);
      return;
    }
    borders += 1;
    const tokens = tokensIn(r.strings).map((t) => canonicalToken(t, light));
    for (const t of new Set(tokens)) {
      if (!allowed.has(t)) flag(host, 'border-token', `${prop} が台帳に無い色 ${t} を使う (3:1 を測っていない —— 台帳 MARKS へ足すか、--control-border にする)`);
    }
    const residual = r.strings.join(' ').replace(/var\([^)]*\)/g, ' ').replace(BORDER_KEYWORDS, ' ').replace(/\s+/g, ' ').trim();
    if (residual !== '') {
      if (/^(?:none|0|transparent)$/i.test(residual) || /\b(?:none|transparent)\b/i.test(residual)) {
        flag(host, 'borderless', `${prop} が枠なし (${residual}) —— 入力欄は枠が輪郭を示す。枠の無い欄は外の箱が輪郭を持つ形にして台帳へ`);
      } else {
        flag(host, 'border-literal', `${prop} が直書きの色 (${residual}) —— 配色で変わらず、3:1 を測っていない`);
      }
    }
  };

  const inspectObject = (obj: ts.ObjectLiteralExpression, depth: number): void => {
    for (const p of obj.properties) {
      if (ts.isSpreadAssignment(p)) {
        const inner = objectsOf(p.expression, env);
        if (depth < 4) for (const o of inner.objects) inspectObject(o, depth + 1);
        for (const u of inner.unresolved) {
          if (!SPREAD_FORWARDERS.some((f) => f.file === fileName && f.expr === u)) flag(p, 'unresolved', `展開 ...${u} が読めない (枠を替えられる道かもしれない)`);
        }
      } else if (ts.isPropertyAssignment(p)) {
        const nm = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : '';
        if (BORDER_PROP.test(nm)) checkValue(p, nm, p.initializer);
      }
    }
  };

  const visit = (n: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const tag = jsxTagName(n);
      const isComponent = FIELD_COMPONENTS.has(tag);
      if (FIELD_TAGS.has(tag) || isComponent) {
        const typeExpr = attrExpr(attrOf(n, 'type'));
        const typeLit = typeExpr !== undefined && (ts.isStringLiteral(typeExpr) || ts.isNoSubstitutionTemplateLiteral(typeExpr)) ? typeExpr.text : undefined;
        if (!(tag === 'input' && typeLit !== undefined && NON_TEXT_INPUT_TYPES.has(typeLit))) {
          fields += 1;
          const styleAttr = attrOf(n, 'style');
          if (styleAttr !== undefined) {
            styled += 1;
            const r = objectsOf(attrExpr(styleAttr), env);
            for (const u of r.unresolved) flag(n, 'unresolved', `<${tag}> の style が読めない (${u})`);
            for (const o of r.objects) inspectObject(o, 0);
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { fields, styled, borders, violations };
}

// ──────────────────────────── 規則 2: 押せる要素 ────────────────────────────

const NATIVE_INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'option', 'label', 'details']);
const POINTER_HANDLERS = ['onClick', 'onMouseDown', 'onPointerDown', 'onDoubleClick', 'onTouchStart'];
const KEY_HANDLERS = ['onKeyDown', 'onKeyUp', 'onKeyPress'];

/**
 * 暗幕 (`aria-hidden` の click-to-dismiss)。**キーボードで同じことをする経路が別に在る**ことが条件で、census が確かめる
 * (`escapeFile` に Esc を受ける keydown が在ること)。
 */
const DISMISS_SURFACES: readonly { readonly file: string; readonly className: string; readonly escapeFile: string; readonly why: string }[] = [
  {
    file: 'src/renderer/App.tsx',
    className: 'sidebar-backdrop',
    escapeFile: 'src/renderer/App.tsx',
    why: 'スマホのドロワーの暗幕。閉じる操作は ✕ ボタンと Esc (App の keydown) でキーボードからも行える。暗幕自身は読み上げにも出さない (aria-hidden)',
  },
];

interface KeyboardScan {
  /** ポインタ操作を持つネイティブでない要素の数。 */
  readonly pointerOnly: number;
  readonly violations: Violation[];
}

export function scanKeyboard(fileName: string, text: string): KeyboardScan {
  const sf = parseSource(fileName, text);
  const violations: Violation[] = [];
  let pointerOnly = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const tag = jsxTagName(n);
      const names = new Set<string>();
      let spread = false;
      for (const a of n.attributes.properties) {
        if (ts.isJsxAttribute(a)) names.add(a.name.getText());
        else spread = true;
      }
      const lower = /^[a-z]/.test(tag);
      if (lower && !NATIVE_INTERACTIVE.has(tag) && POINTER_HANDLERS.some((h) => names.has(h))) {
        pointerOnly += 1;
        const cls = attrExpr(attrOf(n, 'className'));
        const className = cls !== undefined && ts.isStringLiteral(cls) ? cls.text : '';
        const dismiss = DISMISS_SURFACES.some((d) => d.file === fileName && d.className === className) && names.has('aria-hidden');
        if (!dismiss) {
          const missing: string[] = [];
          if (!names.has('role')) missing.push('role');
          if (!names.has('tabIndex')) missing.push('tabIndex');
          if (!KEY_HANDLERS.some((h) => names.has(h))) missing.push('onKeyDown');
          if (missing.length > 0) {
            violations.push({ file: fileName, line: lineOf(sf, n), rule: 'keyboard', message: `<${tag}> はポインタで押せるのにキーボードで押せない (${missing.join(' / ')} が無い)` });
          }
          if (spread) violations.push({ file: fileName, line: lineOf(sf, n), rule: 'keyboard', message: `<${tag}> が属性を展開していて、キーボードの属性が有るか読めない` });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { pointerOnly, violations };
}

/**
 * そのソースが Esc を受ける分岐を持つか —— `'Escape'` の文字列リテラル、または IME の変換確定の Esc を除いた
 * `isCancelEscape()` (`keyIntent.ts`・アプリの Esc の判定は 1 つ) の呼び出し。注記は構文木が元から無視する。
 */
function handlesEscape(fileName: string, text: string): boolean {
  const sf = parseSource(fileName, text);
  let found = false;
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) && n.text === 'Escape') found = true;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'isCancelEscape') found = true;
    if (!found) ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

// ──────────────────────────── 規則 3: 輪を style で消さない ────────────────────────────

const OUTLINE_PROP = /^outline(?:Style|Width|Color|Offset)?$/;

/** 焦点の輪の色を、描く部品が自分の地に合わせて上書きする所 (style で `--focus-outline` を定義する)。 */
const FOCUS_OUTLINE_OVERRIDES: readonly { readonly file: string; readonly why: string }[] = [
  {
    file: 'src/renderer/pages/VillagePage.tsx',
    why: '配色に追随しない固定の緑の地図 (村の盤)。強調の字の色の輪は地の緑の上で 2.31:1 になるので、地に合わせた暗い色を局所に置く。実機の suite `controls` が村の街区の輪を実際の地で測る',
  },
];

interface OutlineScan {
  readonly objects: number;
  readonly violations: Violation[];
  readonly overrides: number;
}

export function scanOutline(fileName: string, text: string): OutlineScan {
  const sf = parseSource(fileName, text);
  const violations: Violation[] = [];
  let objects = 0;
  let overrides = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      objects += 1;
      for (const p of n.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const nm = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
        if (nm !== undefined && OUTLINE_PROP.test(nm)) {
          violations.push({ file: fileName, line: lineOf(sf, p), rule: 'outline', message: `style の ${nm} —— 焦点の輪は CSS の :focus-visible が 1 つ持つ (消す・替える宣言を部品に置かない)` });
        }
        // `['--focus-outline' as string]: …` / `'--focus-outline': …`
        if (ts.isComputedPropertyName(p.name)) {
          const inner = unwrap(p.name.expression);
          if (ts.isStringLiteral(inner) && inner.text === '--focus-outline') overrides += 1;
        } else if (nm === '--focus-outline') overrides += 1;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { objects, violations, overrides };
}

// ──────────────────────────── 実物を走査する ────────────────────────────

const SOURCES = uiSources();
const FIELD_SCANS = SOURCES.map((s) => ({ file: s.file, ...scanFieldBorders(s.file, s.text, ALLOWED, LIGHT) }));
const KEY_SCANS = SOURCES.map((s) => ({ file: s.file, ...scanKeyboard(s.file, s.text) }));
const OUTLINE_SCANS = SOURCES.map((s) => ({ file: s.file, ...scanOutline(s.file, s.text) }));

const fmt = (v: Violation): string => `${v.file}:${v.line} [${v.rule}] ${v.message}`;

describe('入力欄の枠 (パス 504・規則 1)', () => {
  it('走査が生きている (床: 画面のソース 100 以上・入力欄 250 以上・枠を読めた宣言 200 以上)', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(100);
    expect(FIELD_SCANS.reduce((n, s) => n + s.fields, 0)).toBeGreaterThanOrEqual(250);
    expect(FIELD_SCANS.reduce((n, s) => n + s.borders, 0)).toBeGreaterThanOrEqual(200);
  });

  it('★ 入力欄の style が決める枠は、台帳 (MARKS) の色だけ —— 直書き・薄い枠・枠なし・読めない形は無い', () => {
    const all = FIELD_SCANS.flatMap((s) => s.violations).map(fmt);
    expect(all, '入力欄の枠が 3:1 を測っていない色 (または読めない形) —— var(--control-border) を使う').toEqual([]);
  });

  it('★ 展開の例外 (SPREAD_FORWARDERS) は実在し、呼び手の style も入力欄として走査している (両方向)', () => {
    for (const f of SPREAD_FORWARDERS) {
      const src = SOURCES.find((s) => s.file === f.file);
      expect(src, `${f.file} が画面のソースに無い (台帳が古い)`).toBeDefined();
      expect(f.why.length).toBeGreaterThanOrEqual(30);
      // 台帳が無ければ、この展開は「読めない展開」として鳴る (台帳が効いている)
      const without = scanFieldBorders(f.file, src!.text, ALLOWED, LIGHT).violations.filter((v) => v.rule === 'unresolved');
      expect(without, `${f.file} の展開 ...${f.expr} を台帳が通している`).toEqual([]);
    }
    // 部品の呼び手の `style` も入力欄として数えている (FIELD_COMPONENTS)
    const callers = FIELD_SCANS.filter((s) => s.file !== 'src/renderer/components/GuardedNumber.tsx').reduce((n, s) => n + s.fields, 0);
    expect(callers).toBeGreaterThan(100);
  });

  it('★ fieldBorder が返す色 (LEVEL_COLOR) も台帳の色 (本体の名前に解いて照合)', () => {
    const levels = Object.values(LEVEL_COLOR).flatMap((v) => tokensIn([v])).map((t) => canonicalToken(t, LIGHT));
    expect(levels.length).toBe(3);
    expect(levels.filter((t) => !ALLOWED.has(t)), '指摘の段階が返す枠の色が台帳に無い').toEqual([]);
  });

  it('標本: 直す前の形は鳴る・直した後の形は鳴らない (走査が空虚でない)', () => {
    const scan = (src: string) => scanFieldBorders('sample.tsx', src, ALLOWED, LIGHT);
    // 直す前: 枠が薄いトークン (実測 1.3〜1.9:1)・直書きの色・枠なし・別名の薄いトークン
    expect(scan(`const a = <input style={{ border: '1px solid var(--border-strong)' }} />;`).violations.map((v) => v.rule)).toEqual(['border-token']);
    expect(scan(`const a = <select style={{ border: '1px solid #ccc' }} />;`).violations.map((v) => v.rule)).toEqual(['border-literal']);
    expect(scan(`const a = <textarea style={{ border: 'none' }} />;`).violations.map((v) => v.rule)).toEqual(['borderless']);
    expect(scan(`const a = <input style={{ borderColor: 'var(--list-hover-border)' }} />;`).violations.map((v) => v.rule)).toEqual(['border-token']);
    // 定義済みの const を介した形・展開・条件も読む
    const viaConst = `const base = { border: '1px solid var(--border)', padding: 4 }; const a = <input style={{ ...base, width: 80 }} />;`;
    expect(scan(viaConst).violations.map((v) => v.rule)).toEqual(['border-token']);
    const viaCond = `const a = <input style={{ border: bad ? '1px solid var(--danger)' : '1px solid var(--border-strong)' }} />;`;
    expect(scan(viaCond).violations.map((v) => v.rule)).toEqual(['border-token']);
    // 直した後
    expect(scan(`const a = <input style={{ border: '1px solid var(--control-border)' }} />;`).violations).toEqual([]);
    expect(scan(`const a = <input style={{ border: bad ? '1px solid var(--danger)' : '1px solid var(--control-border)' }} />;`).violations).toEqual([]);
    expect(scan(`const a = <input style={{ border: \`1px solid \${color ?? 'var(--control-border)'}\` }} />;`).violations.map((v) => v.rule)).toEqual(['unresolved']);
    expect(scan(`const C = 'var(--danger)'; const color = ok ? C : undefined; const a = <input style={{ border: \`1px solid \${color ?? 'var(--control-border)'}\` }} />;`).violations).toEqual([]);
    expect(scan(`const a = <input style={{ border: fieldBorder(level, '1px solid var(--control-border)') }} />;`).violations).toEqual([]);
    expect(scan(`const a = <input style={{ border: fieldBorder(level, '1px solid var(--border)') }} />;`).violations.map((v) => v.rule)).toEqual(['border-token']);
    // 枠を持たない種類・style の無い欄は数えるだけで鳴らない
    expect(scan(`const a = <input type="checkbox" style={{ border: 'none' }} />;`).fields).toBe(0);
    expect(scan(`const a = <input />;`)).toMatchObject({ fields: 1, styled: 0, violations: [] });
    // 読めない形は「読めない」と言う (呼び出し・props)
    expect(scan(`const a = <input style={makeStyle(x)} />;`).violations.map((v) => v.rule)).toEqual(['unresolved']);
    expect(scan(`const a = <input style={props.style} />;`).violations.map((v) => v.rule)).toEqual(['unresolved']);
    // 部品の呼び手の style も入力欄として読む
    expect(scan(`const a = <GuardedNumber style={{ border: '1px solid #f00' }} />;`).violations.map((v) => v.rule)).toEqual(['border-literal']);
  });
});

describe('押せる要素 (パス 504・規則 2)', () => {
  it('走査が生きている (床: ポインタ操作を持つネイティブでない要素 3 以上)', () => {
    expect(KEY_SCANS.reduce((n, s) => n + s.pointerOnly, 0)).toBeGreaterThanOrEqual(3);
  });

  it('★ ポインタで押せるネイティブでない要素は、role・tabIndex・キー操作を持つ (暗幕を除く)', () => {
    const all = KEY_SCANS.flatMap((s) => s.violations).map(fmt);
    expect(all, 'ポインタでしか押せない要素 —— <button> にするか、role + tabIndex + onKeyDown を足す').toEqual([]);
  });

  it('★ 暗幕の例外 (DISMISS_SURFACES) は実在し、キーボードで同じことをする経路 (Esc) が在る (両方向)', () => {
    for (const d of DISMISS_SURFACES) {
      const src = SOURCES.find((s) => s.file === d.file);
      expect(src, `${d.file} が無い (台帳が古い)`).toBeDefined();
      expect(src!.text, `${d.file} に className="${d.className}" の要素が無い (台帳が古い)`).toContain(`className="${d.className}"`);
      const esc = SOURCES.find((s) => s.file === d.escapeFile);
      expect(handlesEscape(d.escapeFile, esc!.text), `${d.escapeFile} に Esc を受ける keydown が無い (暗幕の他にキーボードの経路が要る)`).toBe(true);
      expect(d.why.length).toBeGreaterThanOrEqual(30);
    }
    // 暗幕の要素は、台帳が無ければ鳴る (台帳が効いている)
    const bare = `const a = <div className="sidebar-backdrop" aria-hidden="true" onClick={close} />;`;
    expect(scanKeyboard('other.tsx', bare).violations.map((v) => v.rule)).toEqual(['keyboard']);
    expect(scanKeyboard('src/renderer/App.tsx', bare).violations).toEqual([]);
  });

  it('標本: 直す前の形は鳴る・直した後の形は鳴らない', () => {
    const scan = (src: string) => scanKeyboard('sample.tsx', src);
    expect(scan(`const a = <div onClick={go}>x</div>;`).violations[0]!.message).toContain('role / tabIndex / onKeyDown');
    expect(scan(`const a = <span role="button" onClick={go}>x</span>;`).violations[0]!.message).toContain('tabIndex / onKeyDown');
    expect(scan(`const a = <span role="button" tabIndex={0} onClick={go}>x</span>;`).violations[0]!.message).toContain('onKeyDown');
    // 展開は読めない
    expect(scan(`const a = <div onClick={go} {...rest} />;`).violations.length).toBeGreaterThanOrEqual(1);
    // 直した後 (VillagePage の BuildingCard の形: 条件つきの属性)
    const ok = `const a = <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onKey} />;`;
    expect(scan(ok)).toMatchObject({ pointerOnly: 1, violations: [] });
    // ネイティブの操作子・大文字の部品は対象外
    expect(scan(`const a = <button onClick={go}>x</button>;`)).toMatchObject({ pointerOnly: 0, violations: [] });
    expect(scan(`const a = <Card onClick={go} />;`)).toMatchObject({ pointerOnly: 0, violations: [] });
    // Esc の判定は文字列リテラルだけ (注記の中には反応しない)
    expect(handlesEscape('s.tsx', `// 'Escape' で閉じる\nconst a = 1;`)).toBe(false);
    expect(handlesEscape('s.tsx', `if (e.key === 'Escape') close();`)).toBe(true);
    expect(handlesEscape('s.tsx', `if (isCancelEscape(e)) close();`)).toBe(true);
  });
});

describe('輪を style で消さない (パス 504・規則 3)', () => {
  it('走査が生きている (床: オブジェクトリテラル 3,000 以上)', () => {
    expect(OUTLINE_SCANS.reduce((n, s) => n + s.objects, 0)).toBeGreaterThanOrEqual(3000);
  });

  it('★ style の宣言に outline は無い (輪は CSS の :focus-visible が 1 つ持つ)', () => {
    expect(OUTLINE_SCANS.flatMap((s) => s.violations).map(fmt)).toEqual([]);
  });

  it('★ 焦点の輪の色を style で上書きする部品は台帳に載る (両方向)', () => {
    const found = OUTLINE_SCANS.filter((s) => s.overrides > 0).map((s) => s.file);
    expect(found.sort(), '台帳に無い上書き —— 理由を FOCUS_OUTLINE_OVERRIDES に書く (描いた色は実機の suite が測る)').toEqual(FOCUS_OUTLINE_OVERRIDES.map((o) => o.file).sort());
    for (const o of FOCUS_OUTLINE_OVERRIDES) expect(o.why.length).toBeGreaterThanOrEqual(30);
  });

  it('標本: 直す前の形は鳴る・直した後の形は鳴らない', () => {
    const scan = (src: string) => scanOutline('sample.tsx', src);
    expect(scan(`const a = { outline: 'none' };`).violations.map((v) => v.rule)).toEqual(['outline']);
    expect(scan(`const a = { outlineWidth: 0, color: 'red' };`).violations.map((v) => v.rule)).toEqual(['outline']);
    expect(scan(`const a = { color: 'red', border: '1px solid var(--control-border)' };`).violations).toEqual([]);
    expect(scan(`const a = { ['--focus-outline' as string]: '#1b2f14' };`).overrides).toBe(1);
    expect(scan(`const a = { '--focus-outline': '#1b2f14' };`).overrides).toBe(1);
    expect(scan(`const a = { foo: f.outline };`).violations).toEqual([]);
  });
});
