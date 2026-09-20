/**
 * **書き出す Markdown に自由文を素で入れない** (2026-09-20 · パス 332)。
 *
 * ## 何が在ったか
 *
 * `shared/escape.ts` の `escapeMarkdownInline` は 2026-08-20 の監査で足された関数で、
 * その docblock は**適用先まで書いている**:
 *
 * > **1 行で終わらなければならない場所すべて**である —— 見出し (`### …`)、
 * > 箇条書きの 1 項目 (`- …`)、引用の 1 行 (`> …`)。
 *
 * ところが `ChatbotWidget` の書き出しだけがそれを通っていなかった ——
 * 利用者が打った要望文をそのまま `- [ ] ${text}` の箇条書きにして
 * `chatbot-requests.md` としてダウンロードしていた。実測 (2026-09-20・5 形):
 *
 * ```
 *   要望 <img src=x onerror=…>   今: 生のまま        門: &lt;img …
 *   要望\n## 承認済み\n- [x] …    今: 箇条書きから抜けて新しい構造を書く
 *   A|B の切替が欲しい            今: 表の桁がずれる
 *   末尾が \                      今: 後続の区切りを打ち消す
 *   素の日本語                    差なし
 * ```
 *
 * **到達の見立ては分けて書く。** `<` は今日この画面から打てる (入力欄は 1 行の
 * `<input>`)。改行は `<input>` には打てないので**今日の UI からは入らない** ——
 * ただし読み戻しの番人は `typeof v.text === 'string'` しか見ていない。
 *
 * ## なぜ網に掛からなかったか
 *
 * `lint:forbidden` の #11 は**エスケープの再実装**を落とす規則で、
 * `escape.ts` 自身の docblock が「`|` を落とすだけの Markdown 用は形が違うので
 * 網に掛からず、しかも『1 箇所にしかない』ので写経とも気付かれなかった」と
 * 書いている。**足りないのは「再実装」ではなく「通していない」を数える機械**で、
 * それはどこにも無かった。
 *
 * ## この検査が数えるもの / 数えないもの
 *
 * 母集団は **`text/markdown` の成果物を作る行**である (実測 8 行 / 5 ファイル)。
 * 各行について「その本文を組み立てるモジュール」を台帳が名指しし、
 * 自由文が入るなら `escaped` を要求する (機械が import を確かめる)。
 *
 * **`none` の行は読んだ判断であって機械ではない。** 実際に何を読んだかを
 * `why` に書く —— `lint:zero-fold` と同じ方針 (数は機械が、判断は散文が持つ)。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { escapeMarkdownInline } from '../../shared/escape';
import { requestsMarkdown } from '../components/ChatbotWidget';

const REPO = join(__dirname, '..', '..', '..');
const MD_ARTIFACT = /text\/markdown/;
/**
 * **名前が在るかではなく、`shared/escape` から import しているかを見る。**
 *
 * 最初は `/escapeMarkdown(Inline|Text)/` を本文に当てていたが、対照実験
 * (producer の import を消して同名のローカル関数 `const escapeMarkdownInline =
 * (x) => x` を置く) が**鳴らなかった** —— 名前が同居しているだけで通る。
 * `dualBuildDecisions.test.ts` が同じ罠を踏んで「実際に import しているか」へ
 * 直した記録を持っている (パターン 0-a-17)。同じ直し方にする。
 */
// パスは `shared/` の中からだと `./escape`、外からだと `../../shared/escape` になる。
// 区切りの直後の `escape` だけを認める (`./myEscape` や `./my-escape` は満たさない)。
const ESCAPE_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'[^']*\/escape';/gm;

function importsEscaper(src: string): boolean {
  for (const m of src.matchAll(ESCAPE_IMPORT)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]!.trim();
      if (name === 'escapeMarkdownInline' || name === 'escapeMarkdownText') return true;
    }
  }
  return false;
}

function shippedSources(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**', '**/*.d.ts'],
  });
}

function artifactSites(files: readonly string[]): { file: string; line: number }[] {
  const out: { file: string; line: number }[] = [];
  for (const abs of files) {
    const file = relative(REPO, abs).split('\\').join('/');
    readOriginalSource(abs)
      .split('\n')
      .forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
        if (MD_ARTIFACT.test(line)) out.push({ file, line: i + 1 });
      });
  }
  return out;
}

const FILES = shippedSources();
const SITES = artifactSites(FILES);

/**
 * **`text/markdown` を作る所の台帳。**
 *
 * `producer` は本文を組み立てるモジュール (書き出す所と違うことが多い)。
 * `freeText`:
 *  - `escaped` … 利用者 / 第三者の自由文が入る → `escapeMarkdown*` を通る (機械が確かめる)
 *  - `none`    … 入るのは数字と同梱の定数だけ (読んだ結果を `why` に書く)
 */
const LEDGER: readonly {
  file: string;
  sites: number;
  producer: string;
  freeText: 'escaped' | 'none';
  why: string;
}[] = [
  {
    file: 'src/renderer/components/ChatbotWidget.tsx',
    sites: 1,
    producer: 'src/renderer/components/ChatbotWidget.tsx',
    freeText: 'escaped',
    why: '利用者が打った要望文がそのまま箇条書きの 1 項目になる。2026-09-20 (パス 332) まで素だった —— 名前のとおり「オーケストレーション backlog 候補」として人へ渡る前提の成果物である。',
  },
  {
    file: 'src/renderer/components/FinancialAnalysis.tsx',
    sites: 1,
    producer: 'src/renderer/data/financialReport.ts',
    freeText: 'none',
    why: '入るのは `ROWS` の固定ラベル・`financialDiagnosis` の `commentOf` が定数表から作る文・`fmtValue` / `fmtRate` を通した数字だけ。利用者が打った文字列は 1 つも通らない (2026-09-20 に読んで確かめた)。',
  },
  {
    file: 'src/renderer/components/WelfareSchemeCard.tsx',
    sites: 1,
    producer: 'src/shared/welfareDocs.ts',
    freeText: 'none',
    why: '要件・出典・区分は `employerBenefits()` の同梱定数、金額は `yen()` を通した数字。`benefitEntry` が受け取る `BenefitSpec` は利用者が編集できない (2026-09-20 に読んで確かめた)。',
  },
  {
    file: 'src/renderer/pages/OverviewPage.tsx',
    sites: 1,
    producer: 'src/renderer/data/managementReport.ts',
    freeText: 'none',
    why: 'プランの札は `shared/plan.ts` の `PLANS` 表、スコアカードの札は `shared/managementScorecard.ts` の文字列リテラル、ハイライトの文は `managementHighlights.ts` が**数字から**組み立てる。自由文の補間は 0 件 (2026-09-20 に 3 か所とも辿って確かめた)。',
  },
  {
    file: 'src/renderer/web-shim.ts',
    sites: 4,
    producer: 'src/renderer/data/stocksAnalysisWeb.ts (stocks) / web-shim.ts の定数リテラル (business)',
    freeText: 'escaped',
    why: '株価側は銘柄名・AI の rationale / riskFactors が入るので `escapeMarkdownInline` を通る。事業側はブラウザ版が「対応していません」と述べる定数リテラルで、補間が 1 つも無い。',
  },
];

describe('text/markdown を書き出す所の母集団 (パス 332)', () => {
  it('走査が生きている (床: 出荷される .ts/.tsx を 200 本以上読めている)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(200);
  });

  it('★ 台帳と実物が一致する (両方向・ファイルごとの行数も)', () => {
    const actual = new Map<string, number>();
    for (const s of SITES) actual.set(s.file, (actual.get(s.file) ?? 0) + 1);
    const expected = new Map(LEDGER.map((r) => [r.file, r.sites]));
    expect([...actual.entries()].sort()).toEqual([...expected.entries()].sort());
    expect(SITES).toHaveLength(8);
  });

  it('★ `escaped` の行は、本文を組み立てるモジュールが実際に門を import している', () => {
    for (const row of LEDGER) {
      if (row.freeText !== 'escaped') continue;
      // `producer` は複数書ける (business のように片方が定数の場合)。先頭のパスを見る。
      const path = row.producer.split(' ')[0]!;
      const src = readOriginalSource(join(REPO, path))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      expect(importsEscaper(src), `${path} が shared/escape から escapeMarkdown* を import していない`).toBe(true);
    }
  });

  it('台帳の理由は空でない', () => {
    for (const row of LEDGER) expect(row.why.length, row.file).toBeGreaterThan(30);
  });

  it('数えた内訳を留める', () => {
    const n = (k: string) => LEDGER.filter((r) => r.freeText === k).length;
    expect({ escaped: n('escaped'), none: n('none') }).toEqual({ escaped: 2, none: 3 });
  });

  it('★ 標本: import の判定は、同名のローカル関数では満たされない (対照が鳴らなかった形)', () => {
    expect(importsEscaper("import { escapeXml, escapeMarkdownInline } from '../../shared/escape';")).toBe(true);
    expect(importsEscaper("import { escapeMarkdownText } from '../escape';")).toBe(true);
    // ローカルに同名を置いただけ → 満たさない。
    expect(importsEscaper('const escapeMarkdownInline = (x: string): string => x;')).toBe(false);
    // 別のモジュールからの同名 import → 満たさない (門は 1 つだけ)。
    expect(importsEscaper("import { escapeMarkdownInline } from './myEscape';")).toBe(false);
    expect(importsEscaper("import { escapeMarkdownInline } from './my-escape';")).toBe(false);
    // 名前が散文に出るだけ → 満たさない。
    expect(importsEscaper(' * `escapeMarkdownInline` を通す。')).toBe(false);
  });

  it('標本: 針は成果物の型に当たり、散文の `.md` には当たらない', () => {
    expect(MD_ARTIFACT.test("  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });")).toBe(true);
    expect(MD_ARTIFACT.test("      downloadBlob(filename, content, isMd ? 'text/markdown' : 'text/html');")).toBe(true);
    expect(MD_ARTIFACT.test('  詳細は `docs/REMAINING_WORK.md`。')).toBe(false);
    expect(MD_ARTIFACT.test("  a.download = 'chatbot-requests.md';")).toBe(false);
  });
});

describe('chatbot-requests.md の本文 (パス 332)', () => {
  const at = '2026-09-20T00:00:00.000Z';
  const body = (text: string): string => requestsMarkdown([{ text, at }]);

  it('素の要望はそのまま出る (過剰に潰していない)', () => {
    expect(body('ダークモードが欲しい')).toContain('- [ ] ダークモードが欲しい _(受付: 2026-09-20)_');
  });

  it('★ 生 HTML は `&lt;` になる (今日この画面から打てる形)', () => {
    const out = body('要望 <img src=x onerror=alert(1)>');
    expect(out).toContain('&lt;img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
  });

  it('★ 改行は空白に潰れ、箇条書きから抜けない', () => {
    const out = body('要望\n## 承認済み\n- [x] 全部やる');
    // 本文の行は「見出し + 空行 + 箇条書き 1 行 + 空行」= 要望 1 件なら 4 行。
    expect(out.split('\n')).toHaveLength(4);
    expect(out).not.toContain('\n## 承認済み');
    expect(out).toContain('要望 ## 承認済み - [x] 全部やる');
  });

  it('★ 表の区切りと末尾のバックスラッシュも落ちる', () => {
    expect(body('A|B の切替')).toContain('A\\|B の切替');
    expect(body('要望 \\')).toContain('要望 \\\\');
  });

  /**
   * ★ **不在の主張に標本を添える。** 「素では出ない」と言うからには、
   * **門を外せば出る**ことを同じ検査の中で見せる。
   */
  it('★ 標本: 門を外した組み立てなら、同じ入力で生のまま出る', () => {
    const unguarded = (text: string): string => `- [ ] ${text} _(受付: 2026-09-20)_`;
    expect(unguarded('要望 <img src=x onerror=alert(1)>')).toContain('<img src=x');
    expect(unguarded('要望\n## 承認済み').split('\n')).toHaveLength(2);
    // 門を通せば同じ入力が変わる (門が本当に効いている)。
    expect(escapeMarkdownInline('要望 <img src=x>')).not.toContain('<img');
  });

  it('0 件でも本文は壊れない', () => {
    expect(requestsMarkdown([])).toBe(
      '# チャットボット経由の機能要望 (オーケストレーション backlog 候補)\n\n',
    );
  });
});
