/**
 * **塗りの上の字は、その塗りの字の色を使う** (2026-10-02 · パス 503)。
 *
 * ## 見つけた物 (実機で描画済みの色を 4 配色 × 全 75 画面で測った)
 *
 * 画面の style が **塗り (`background`) と字 (`color`) を別々に決めていて、対が崩れていた**。直す前の実測:
 *
 * | 塗り | 字 | 割った配色 |
 * | --- | --- | --- |
 * | `var(--accent)` (選択中のボタン・タブ・チップ **20 か所**) | `var(--text)` (地の字) | すっきり × ライト 3.46:1 (濃い字 × 橙)・ダークも 2.8:1 |
 * | `var(--accent)` | 固定の白 `#fff` | ダークで 3.1:1 (ダークの `--accent` は明るい橙) |
 * | `var(--gradient)` (primary ボタン・順位の丸) | 固定の白 | かわいいのライトで 2.1:1 (淡いグラデーション) |
 * | 意味色 `var(--success)` / `var(--danger)` (利益率・総合リスク・状態の札) | 固定の白 | ダークで 2.1:1 (ダークの意味色は明るい) |
 *
 * 字の色は**塗りごとに別のトークン**が決める (`--on-accent` / `--on-gradient` / `--on-status`)。
 * 表の中身はトークン表の検査 (`themeContrast.test.ts`) が測るが、**描く側がどの対を作るか**は表を見ても出てこない。
 *
 * ## 規則 (構文木で全部の style の宣言を走査する)
 *
 * 同じ宣言の中に `background` と `color` が**両方**在るとき:
 *
 * 1. 塗りが塗りのトークン (`--accent` / `--gradient` / 意味色 4 つ / `--text-muted`) を含むなら、字は**その塗りの字のトークン**を含む。
 *    (条件で塗りが変わる宣言 —— 選択中だけ塗る —— は、条件の枝のどちらかが塗りのときに字も同じ枝で変わればよい。
 *    つまり字の式が字のトークンを**含む**ことだけを要求する)
 * 2. 塗りが配色のトークン (`var(--…)`) なら、字に**固定の白・黒** (`#fff` / `white` / `#000` / `black`) を使わない。
 *    トークンの地は配色で変わるので、固定の字はどこかの配色で割る。例外は黄の札 (`--warning-bg` は明るいまま・黒い字)。
 *
 * ## ここが見ない物
 *
 * - `color` を持たない宣言 (字は親から継ぐ) —— 塗りの上に継いだ地の字が載る形は、実機の suite `contrast` が測る。
 * - 塗りが識別子・式で決まる宣言 (`background: c.color`) —— 字面が無いので読めない。
 *
 * 規則 1 は**直す前の 20 か所**で鳴った (標本が直す前の字面を持つ)。
 */
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';
import ts from 'typescript';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');

/** 塗りのトークン → その上の字のトークン。 */
export const FILL_INK: Readonly<Record<string, string>> = {
  '--accent': '--on-accent',
  '--gradient': '--on-gradient',
  '--success': '--on-status',
  '--danger': '--on-status',
  '--warning': '--on-status',
  '--info': '--on-status',
  '--text-muted': '--on-status',
};

/** 配色で変わらない字 (固定の白・黒)。 */
const FIXED_INK = /^(?:#fff(?:fff)?|#000(?:000)?|white|black)$/i;
/** 例外: 明るいままの札の地 (黒い字を載せる)。 */
const FIXED_INK_OK_ON = new Set(['--warning-bg']);

/** 式が取りうる**字面の文字列**。条件・`||` / `??` / `&&` は両辺、括弧・`as`・`!` は中身。式で決まる物は読まない。 */
function stringsOf(e: ts.Expression | undefined): string[] {
  if (e === undefined) return [];
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isTemplateExpression(e)) return [e.head.text, ...e.templateSpans.map((s) => s.literal.text)];
  if (ts.isConditionalExpression(e)) return [...stringsOf(e.whenTrue), ...stringsOf(e.whenFalse)];
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken || k === ts.SyntaxKind.AmpersandAmpersandToken) {
      return [...stringsOf(e.left), ...stringsOf(e.right)];
    }
    return [];
  }
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) return stringsOf(e.expression);
  return [];
}

function propName(p: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(p)) return null;
  const n = p.name;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text;
  return null;
}

/** 文字列の中の `var(--名前` の名前。 */
function tokensIn(strings: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of strings) for (const m of s.matchAll(/var\((--[\w-]+)/g)) out.push(m[1]!);
  return out;
}

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: 1 | 2;
  readonly message: string;
}

export interface Scan {
  /** 塗りと字を両方持つ宣言の数 (走査が空でないことの母集団)。 */
  readonly pairs: number;
  readonly violations: Violation[];
}

/** 1 つのソースを走査する。 */
export function scanFillInk(fileName: string, text: string): Scan {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations: Violation[] = [];
  let pairs = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      let bg: ts.Expression | undefined;
      let fg: ts.Expression | undefined;
      for (const p of n.properties) {
        const name = propName(p);
        if (name === 'background' || name === 'backgroundColor') bg = (p as ts.PropertyAssignment).initializer;
        else if (name === 'color') fg = (p as ts.PropertyAssignment).initializer;
      }
      if (bg !== undefined && fg !== undefined) {
        const bgStrings = stringsOf(bg);
        const fgStrings = stringsOf(fg);
        const bgTokens = tokensIn(bgStrings);
        const fgTokens = new Set(tokensIn(fgStrings));
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        // 塗りか字のどちらかが字面で読めない宣言は数えない (読めない物は読めないと言う)
        if (bgStrings.length > 0 && fgStrings.length > 0) pairs += 1;
        for (const f of new Set(bgTokens)) {
          const need = FILL_INK[f];
          if (need !== undefined && fgStrings.length > 0 && !fgTokens.has(need)) {
            violations.push({ file: fileName, line, rule: 1, message: `塗り var(${f}) の上の字が var(${need}) を含まない (字: ${JSON.stringify(fgStrings)})` });
          }
        }
        const bgIsToken = bgTokens.length > 0;
        const allowFixed = bgTokens.every((t) => FIXED_INK_OK_ON.has(t));
        if (bgIsToken && !allowFixed) {
          for (const s of fgStrings) {
            if (FIXED_INK.test(s.trim())) {
              violations.push({ file: fileName, line, rule: 2, message: `配色のトークンの塗り ${JSON.stringify(bgTokens)} の上に固定の字 ${s} (配色で割る)` });
            }
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { pairs, violations };
}

function uiSources(): { file: string; text: string }[] {
  return globSync(
    ['src/renderer/pages/*.tsx', 'src/renderer/components/*.tsx', 'src/renderer/components/*.ts', 'src/renderer/App.tsx', 'src/renderer/security/*.tsx'],
    { cwd: REPO, absolute: true, ignore: ['**/__tests__/**'] },
  ).map((abs) => ({ file: relative(REPO, abs).split('\\').join('/'), text: readOriginalSource(abs) }));
}

const SOURCES = uiSources();
const SCANS = SOURCES.map((s) => ({ file: s.file, ...scanFillInk(s.file, s.text) }));

describe('塗りの上の字 (パス 503)', () => {
  it('走査が生きている (床: 画面のファイル 60 以上・塗りと字を両方持つ宣言 60 以上)', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(60);
    expect(SCANS.reduce((n, s) => n + s.pairs, 0)).toBeGreaterThanOrEqual(60);
  });

  it('★ 塗りの上の字は、その塗りの字のトークンを使い、配色のトークンの塗りに固定の白・黒を載せない', () => {
    const all = SCANS.flatMap((s) => s.violations).map((v) => `${v.file}:${v.line} [規則 ${v.rule}] ${v.message}`);
    expect(all, '塗りと字の対が崩れている —— 塗りごとの字のトークン (--on-accent / --on-gradient / --on-status) を使う').toEqual([]);
  });

  it('標本: 直す前の字面は鳴る (走査が空虚でない)', () => {
    const before = `
      const a = { background: sel ? 'var(--accent)' : 'var(--bg-elev)', color: sel ? '#fff' : 'var(--text)' };
      const b = { background: 'var(--gradient)', color: '#fff' };
      const c = { background: c.profit >= 0 ? 'var(--success)' : 'var(--danger)', color: '#fff' };
      const d = { background: busy ? 'var(--bg-elev)' : 'var(--accent)', color: busy ? 'var(--text)' : '#fff' };
    `;
    const r = scanFillInk('sample.tsx', before);
    expect(r.pairs).toBe(4);
    expect(r.violations.filter((v) => v.rule === 1).length, '規則 1: 4 宣言とも塗りの字のトークンが無い (a の accent・b の gradient・c の success と danger は同じ on-status・d の accent)').toBe(5);
    expect(r.violations.filter((v) => v.rule === 2).length, '規則 2: 固定の白を載せている').toBe(4);
    // 直した後の字面は鳴らない
    const after = `
      const a = { background: sel ? 'var(--accent)' : 'var(--bg-elev)', color: sel ? 'var(--on-accent)' : 'var(--text)' };
      const b = { background: 'var(--gradient)', color: 'var(--on-gradient)' };
      const c = { background: c.profit >= 0 ? 'var(--success)' : 'var(--danger)', color: 'var(--on-status)' };
      const d = { background: busy ? 'var(--bg-elev)' : 'var(--accent)', color: busy ? 'var(--text)' : 'var(--on-accent)' };
      const e = { background: 'var(--warning-bg)', color: '#000' };
      const f = { background: 'rgba(40,50,30,0.82)', color: '#fff' };
    `;
    expect(scanFillInk('sample.tsx', after).violations).toEqual([]);
    expect(scanFillInk('sample.tsx', after).pairs).toBe(6);
  });

  it('標本: 塗りか字が式で決まる宣言は読まない (読めない物を黙って通すのではなく、数えない)', () => {
    const r = scanFillInk('sample.tsx', `const a = { background: c.color, color: '#fff' }; const b = { background: 'var(--accent)', color: ink };`);
    expect(r.pairs).toBe(0);
    expect(r.violations).toEqual([]);
  });
});
