/**
 * **ボタンの字も日本語で書き、英語はかっこで添える。** (2026-11-27)
 *
 * 利用者の依頼「全て日本語と英語を併記して」の続き。画面の名前は `screenNamesJapanese.test.ts`、
 * 節の見出しは `sectionTitlesJapanese.test.ts` が見ているが、**ボタンの字** (`<button>` の中の文字) は
 * どの検査も見ていなかった。直す前 (実測): 英語をかっこの外に含むボタンが **26 か所**
 * (字のまま 16 ——「CSV エクスポート」「BS を保存」「Emotions で分析」「Canva で編集する」…、
 * 式の中の文字列 8 ——「Issue を作成」「Grok に送る」「SVG を保存 (Canva 用)」…)。
 *
 * 規則は見出しと同じ 1 つ —— **英字は、日本語の語の直後の半角かっこの中にだけ書き、
 * そのかっこの中は英語だけ** (例:「表のファイル (CSV) に書き出す」「課題 (Issue) を作成」)。
 * 画面を名指しするボタンは画面の名前 (`label`) だけを書く (「感情ログで分析」)。
 *
 * 見るのは `<button>` の子のうち、字 (JSX のテキスト) と、式の中の**日本語を含む**文字列リテラル
 * (`{busy ? '送信中…' : '課題 (Issue) を作成'}`)。日本語を含まない式の文字列 (`'✕'` や記号) は母集団の外。
 * 資格情報の欄の札 (`tokenSetup` の `label`) は別の母集団で、まだ英語が残る (`docs/REMAINING_WORK.md`)。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import ts from 'typescript';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const ROOT = path.resolve(__dirname, '..');

/** 「日本語 (English)」の英語の側 (sectionTitlesJapanese.test.ts と同じ形)。 */
const ENGLISH_GLOSS = /(?<=[^\s(]) ?\([A-Za-z][A-Za-z0-9 ./-]*\)/g;

/** かっこの外に残してよい英字の語と、その理由。 */
const KEPT_LATIN: Readonly<Record<string, string>> = {
  AI: '日本語の文でも「AI」と書くのが通例で、カタカナ (エーアイ) の方が読みにくい (画面の名前・見出しと同じ)。',
};

const JAPANESE = /[぀-ヿ一-鿿]/;

function tsxFiles(dir: string): string[] {
  return readOriginalDirEntries(dir).flatMap((e) => {
    if (e.isDirectory()) return e.name === '__tests__' ? [] : tsxFiles(path.join(dir, e.name));
    return e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : [];
  });
}

interface ButtonText {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** `<button>` の中の字と、式の中の日本語を含む文字列リテラルを集める。 */
function buttonTexts(source: string, file = 'x.tsx'): ButtonText[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: ButtonText[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const literals = (n: ts.Node, acc: ts.Node[]): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) acc.push(n);
    // ★ forEachChild はコールバックが真の値を返すと走査を止めるので、何も返さない形で書く
    ts.forEachChild(n, (c) => {
      literals(c, acc);
    });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'button') {
      for (const c of n.children) {
        if (ts.isJsxText(c)) {
          const text = c.text.replace(/\s+/g, ' ').trim();
          if (text !== '') out.push({ file, line: at(c), text });
        } else if (ts.isJsxExpression(c) && c.expression !== undefined) {
          const acc: ts.Node[] = [];
          literals(c.expression, acc);
          for (const s of acc) {
            const text = (s as ts.StringLiteral).text;
            if (JAPANESE.test(text)) out.push({ file, line: at(s), text });
          }
        }
      }
    }
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(sf);
  return out;
}

/** かっこの外に残った英字の語 (台帳の語を除く)。 */
function latinOutsideGloss(text: string): string[] {
  const rest = text.replace(ENGLISH_GLOSS, '');
  return (rest.match(/[A-Za-zＡ-Ｚａ-ｚ]+/g) ?? []).filter((w) => !(w in KEPT_LATIN));
}

const BUTTONS: ButtonText[] = tsxFiles(ROOT).flatMap((f) =>
  buttonTexts(readOriginalSource(f), path.relative(ROOT, f)),
);

describe('ボタンの字は日本語で書く', () => {
  it('★ ボタンの字の母集団が空でない (走査が死んでいない)', () => {
    expect(BUTTONS.length).toBeGreaterThanOrEqual(300);
  });

  it('★ どのボタンも、英字をかっこの外に書かない', () => {
    const bad = BUTTONS.filter((b) => latinOutsideGloss(b.text).length > 0).map(
      (b) => `${b.file}:${b.line}: ${b.text}`,
    );
    expect(bad).toEqual([]);
  });

  it('★ 画面を名指しするボタンは英語の名前を使わない (「感情ログで分析」)', () => {
    const bad = BUTTONS.filter((b) => /Emotions で/.test(b.text)).map((b) => `${b.file}:${b.line}: ${b.text}`);
    expect(bad).toEqual([]);
  });

  it('台帳の語は、どこかのボタンで実際に使われている (古い登録を残さない)', () => {
    for (const word of Object.keys(KEPT_LATIN)) {
      expect(BUTTONS.some((b) => b.text.replace(ENGLISH_GLOSS, '').includes(word)), word).toBe(true);
    }
  });

  it('★ 規則は直す前の形に当たる (標本)', () => {
    expect(latinOutsideGloss('CSV エクスポート')).toEqual(['CSV']);
    expect(latinOutsideGloss('SVG を保存 (Canva 用)')).toEqual(['SVG', 'Canva']);
    expect(latinOutsideGloss('表のファイル (CSV) に書き出す')).toEqual([]);
    expect(latinOutsideGloss('AI に質問')).toEqual([]);
    // 走査は字と、式の中の日本語の文字列を拾う (記号だけの文字列は拾わない)
    const sample = buttonTexts(
      "const x = <b><button>\n  CSV エクスポート\n</button><button>{busy ? '送信中…' : 'Issue を作成'}</button><button>{'✕'}</button></b>;",
    );
    expect(sample.map((b) => b.text)).toEqual(['CSV エクスポート', '送信中…', 'Issue を作成']);
    // 属性の中に置いたボタンも拾う
    expect(buttonTexts("const x = <S action={<button>{a ? '閉じる' : 'Grok に送る'}</button>} />;").map((b) => b.text)).toEqual([
      '閉じる',
      'Grok に送る',
    ]);
  });
});
