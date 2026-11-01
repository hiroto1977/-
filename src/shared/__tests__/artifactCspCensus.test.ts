import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readOriginalSource } from './originalSource';

/**
 * **CSP を書いている出荷物の母集団** (2026-09-20 · パス 344)。
 *
 * パス 343 で法則 `distributed-code-same-gates` を足した ——
 * 「これを貼って deploy してください」「これを開いて使ってください」と
 * 渡すコードは、動くのが利用者の環境でも**設計はこちらの責任**である。
 * その法則の**母集団を測ったら、まだ 4 本外に居た。**
 *
 * ## 実測 (2026-09-20)
 *
 * CSP を書く builder は **8 本**。`lint:artifact-csp` が実際に当たっているのは
 * `pages.yml` が publish する 4 本 (landing / 相談デモ / 熟議デモ / 研究デモ) と
 * アプリ本体 3 種だけで、**利用者がダウンロードして開く 4 本は母集団の外**だった:
 *
 * ```
 *   dist/経営書類スタジオ.html          build:docs-studio
 *   dist/業務自動化ダッシュボード.html   build:integration-demo
 *   dist/就業規則メーカー.html           build:shugyokisoku
 *   dist/電子定款メーカー.html           build:teikan
 * ```
 *
 * **今日は 4 本とも `document` プロファイルを通る** (`--document` を当てて exit 0 を実測)。
 * 欠けていたのは**それを保つ物**である。4 本はどれも `script-src 'unsafe-inline'` を
 * 持つ —— 単一ファイルでオフライン動作する道具なので正しいが、その正しさは
 * `default-src 'none'` (通信が無い) と**注入口が無いこと**に依っている。
 *
 * ## ここで見ないもの
 *
 * 注入口 (`innerHTML` / `outerHTML` / `insertAdjacentHTML`) は `lint:forbidden` の
 * 規則が `scripts/` を含めて 0 件で留めている (抑止台帳に 1 件も無い)。
 * **同じ判定を 2 度書かない**ので、ここでは数えない。実測 (2026-09-20):
 * 4 本の出力はいずれも `textContent` / `createElement` だけで、注入口は 0 件。
 *
 * ## ここで見るもの
 *
 * 1. 母集団 (CSP を書く builder) が**全部台帳に在る** —— 両方向。
 * 2. 各 builder の CSP が、台帳が名乗るプロファイルを**実際に通る**
 *    (門の `evaluate` を借りる。写すと比べているのが写しになる)。
 * 3. `shipped: 'pages'` の行は `pages.yml` の CSP ステップに実在し、
 *    `shipped: 'download'` の行は `package.json` に `build:*` として実在する。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-artifact-csp.cjs') as {
  evaluate: (profile: string, html: string, name: string) => string[];
};

const REPO_ROOT = join(__dirname, '../../..');

type Shipped = 'pages' | 'download';

/** CSP を書く builder の台帳。`why` は「誰が受け取るか」を書く。 */
const LEDGER: Record<string, { profile: string; shipped: Shipped; why: string }> = {
  'scripts/build-landing.cjs': {
    profile: 'document',
    shipped: 'pages',
    why: 'GitHub Pages の入口 (_site/index.html)。pages.yml と ci.yml の両方が注入後の実物に当てる。',
  },
  'scripts/build-counseling-demo.cjs': {
    profile: 'document',
    shipped: 'pages',
    why: '相談デモ (_site/counseling-demo.html)。pages.yml が publish し、CSP を注入後に当てる。',
  },
  'scripts/build-deliberation-demo.cjs': {
    profile: 'document',
    shipped: 'pages',
    why: '熟議デモ (_site/deliberation-demo.html)。pages.yml が publish し、inject-pwa 適用後の実物に当てる。',
  },
  'scripts/build-research-demo.cjs': {
    profile: 'document',
    shipped: 'pages',
    why: '研究デモ (_site/research-demo.html)。pages.yml が publish し、inject-pwa 適用後の実物に当てる。',
  },
  'scripts/build-docs-studio.cjs': {
    profile: 'document',
    shipped: 'download',
    why: '経営書類スタジオ。単一ファイルを利用者が開いて使う (CI では組まない)。ここが唯一の門。',
  },
  'scripts/build-integration-demo.cjs': {
    profile: 'document',
    shipped: 'download',
    why: '業務自動化ダッシュボード。単一ファイルを利用者が開いて使う (CI では組まない)。ここが唯一の門。',
  },
  'scripts/build-shugyokisoku-maker.cjs': {
    profile: 'document',
    shipped: 'download',
    why: '就業規則メーカー (労基法89条の本則ジェネレータ)。利用者が開いて印刷する。同上。',
  },
  'scripts/build-teikan-maker.cjs': {
    profile: 'document',
    shipped: 'download',
    why: '電子定款メーカー (会社法の定款ジェネレータ)。利用者が開いて印刷する。CI では組まないので、ここが唯一の門。',
  },
};

/** CSP メタを書いている builder を git から数える (追跡 + 未追跡)。 */
function buildersWithCsp(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'scripts/build-*.cjs'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  return [...new Set(out.split('\n').filter(Boolean))]
    .filter((rel) => /Content-Security-Policy/i.test(readOriginalSource(join(REPO_ROOT, rel))))
    .sort();
}

/**
 * builder のソースから CSP メタを 1 つ取り出す。
 * ソース中では JS 文字列なので `\"` で書かれている形が在る (剥がしてから返す)。
 */
export function cspMetaOf(source: string): string | null {
  const m = /<meta http-equiv=\\?"Content-Security-Policy\\?" content=\\?"([^"\\]*)\\?">/i.exec(source);
  return m === null ? null : (m[1] ?? null);
}

const POPULATION = buildersWithCsp();

describe('CSP を書く出荷物の母集団 (パス 344)', () => {
  it('★ 走査が死んでいない (床つき)', () => {
    expect(POPULATION.length).toBeGreaterThanOrEqual(8);
  });

  it('★ 母集団と台帳が両方向に一致する', () => {
    expect(POPULATION).toEqual(Object.keys(LEDGER).sort());
  });

  it('★ 台帳の理由が空でない (保留の決まり文句を置けない)', () => {
    const DEFERRAL = /分かる人が決め|わかる人が決め|誰かが決め|要検討|TODO/;
    for (const [rel, row] of Object.entries(LEDGER)) {
      expect(row.why.length, rel).toBeGreaterThan(20);
      expect(row.why, rel).not.toMatch(DEFERRAL);
    }
    // 針が実際にその文面へ当たることを、同じ検査の中で標本で確かめる。
    expect('分かる人が決めること').toMatch(DEFERRAL);
    expect('TODO: あとで').toMatch(DEFERRAL);
  });

  it.each(Object.keys(LEDGER))('★ %s の CSP が台帳のプロファイルを実際に通る', (rel) => {
    const csp = cspMetaOf(readOriginalSource(join(REPO_ROOT, rel)));
    expect(csp, `${rel} から CSP メタを取り出せません`).not.toBeNull();
    const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp!}"></head><body></body></html>`;
    expect(gate.evaluate(LEDGER[rel]!.profile, html, rel)).toEqual([]);
  });

  it('★ 対照: CSP を緩めると門が鳴る (通っているのは中身であって形式ではない)', () => {
    const weak = "default-src *; script-src 'unsafe-inline'";
    const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${weak}"></head><body></body></html>`;
    expect(gate.evaluate('document', html, 'control.html').length).toBeGreaterThan(0);
    // 取り出し器そのものの標本 (当たること / 当たらないこと)。
    expect(cspMetaOf('"<meta http-equiv=\\"Content-Security-Policy\\" content=\\"default-src \'none\';\\">"')).toBe(
      "default-src 'none';",
    );
    expect(cspMetaOf('<meta name="viewport" content="width=device-width">')).toBeNull();
  });

  it('★ pages で出す行は pages.yml の CSP ステップに実在する', () => {
    const wf = readOriginalSource(join(REPO_ROOT, '.github/workflows/pages.yml'));
    const step = wf.slice(wf.indexOf('lint-artifact-csp.cjs'));
    const shipped = { 'build-landing.cjs': 'index.html', 'build-counseling-demo.cjs': 'counseling-demo.html', 'build-deliberation-demo.cjs': 'deliberation-demo.html', 'build-research-demo.cjs': 'research-demo.html' } as Record<string, string>;
    for (const [rel, row] of Object.entries(LEDGER)) {
      const base = rel.split('/')[1]!;
      if (row.shipped !== 'pages') continue;
      expect(step, `${rel} が pages.yml の CSP ステップに居ません`).toContain(shipped[base]!);
    }
    // 対照: publish しない物の名前はそのステップに現れない。
    expect(step).not.toContain('就業規則メーカー');
    expect(step).toContain('research-demo.html'); // 針が当たることの標本
  });

  it('★ download の行は package.json に build:* として実在する (組み方が失われていない)', () => {
    const pkg = readOriginalSource(join(REPO_ROOT, 'package.json'));
    for (const [rel, row] of Object.entries(LEDGER)) {
      if (row.shipped !== 'download') continue;
      expect(pkg, `${rel} を組む npm script がありません`).toContain(rel.replace('scripts/', 'scripts/'));
    }
  });
});
