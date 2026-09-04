import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * **`<script>` の中へ書く物は、共通の退避を通る。**
 *
 * ## 何から守るのか
 *
 * ビルドは公開する単一 HTML の中へ JS / JSON を**文字列として**埋め込む。
 * 埋め込む値に `</script>` が 1 つ現れると、そこで要素が閉じ、
 * **後ろが markup として解釈される**。値の出どころは知識コーパスや
 * テンプレート定義なので「攻撃者の入力」ではないが、
 * 出荷する公開ページが壊れる形であり、`U+2028` / `U+2029` は
 * **JS の行終端**として解釈されて構文まで変える。
 *
 * 退避は `scripts/lib/json-for-script.cjs` に 1 つだけ置いてある
 * (`scriptSafeJs` / `jsonForScript` / `replaceJsonToken`)。
 *
 * ## なぜ検査が要るか (2026-08-25)
 *
 * 実測すると `<script>` へ書き込む箇所は **10 か所**あり、**全部が正しく**
 * 通っていた。だが**新しいビルダーをそこへ通す強制が無い** ——
 * このセッションで繰り返し出た形である (CSV の書き出し / 主プロセスの
 * ファイル権限 / 鍵の送り先。どれも「関門は在るが、新しい経路を
 * そこへ通す強制が無い」だった)。
 *
 * 一般の HTML 補間はゲートにしない、と既に決めてある ——
 * 受理すべき補間が 300 件あって台帳が保てないため
 * (`docs/REMAINING_WORK.md`)。**`<script>` の中だけは 10 件**なので、
 * ここは精度の高い規則が書ける。
 */

const SCRIPTS = join(__dirname, '../../../scripts');
const LIB = 'lib/json-for-script.cjs';

/**
 * 共通の退避を使わずに `<script>` を書いてよいファイル。**理由が要る。**
 *
 * `check` は**その理由が本当かを確かめる述語**。理由を書くだけなら嘘に
 * なりうるので、台帳の主張そのものを機械で見る。
 */
const NO_SHARED_ESCAPE: Readonly<Record<string, { why: string; check: (src: string) => boolean }>> = {
  'build-integration-demo.cjs': {
    why:
      'PAGE_JS はモジュール直下のテンプレートリテラル定数で、データを 1 つも差し込まない。' +
      '埋め込む文字列が固定なので退避する対象が無い。',
    // 主張の検証: token 差し替えを使っていない = データが入らない。
    check: (src) => !/replaceJsonToken\(|replaceToken\(/.test(src),
  },
  'inject-pwa.cjs': {
    why:
      'SW_REGISTER_JS は固定の定数で、しかも CSP の script-src へその本文のハッシュを ' +
      'ピン留めしている。1 文字でも変われば CSP 側が落ちるので、データが混ざる余地が無い。',
    check: (src) => !/replaceJsonToken\(|replaceToken\(/.test(src),
  },
  'inline-html.cjs': {
    why:
      '**逃がさずに落とす**のが設計である。束ねた JS に生の閉じタグが現れたら ' +
      '`assertPinnedScripts` が投げてビルドが止まる —— 黙って書き換えると、束ね手の出力と ' +
      '出荷物がずれた事実を誰も見ないまま公開される。理由と故障の機序は ' +
      '`inlineHtml.test.ts` が留めている (早期終了で子テキストが変わり、ピン留めした ' +
      'ハッシュと一致しなくなるので CSP がバンドルを実行しない = 白画面)。',
    /*
     * 主張の検証: 検知して落とす側が**呼ばれている**こと。
     *
     * 最初は `/assertPinnedScripts\(/` と書いて**対照が鳴らなかった** ——
     * 同じファイルに `function assertPinnedScripts(html)` の**宣言**が
     * 在るので、呼び出しを消しても字面は残る。**宣言ではなく呼び出し**を見る。
     */
    check: (src) => /(?<!function\s)\bassertPinnedScripts\(html\)/.test(src),
  },
};

interface Source {
  readonly rel: string;
  readonly text: string;
}

function sources(): Source[] {
  return readdirSync(SCRIPTS)
    .filter((n) => n.endsWith('.cjs'))
    .map((n) => ({ rel: n, text: readFileSync(join(SCRIPTS, n), 'utf8') }));
}

/** コメントを落とす —— 注記に書いた字面を埋め込みと読み違えない。 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** `<script …>${…}</script>` の形で値を差し込んでいるか。 */
const EMBED = /<script[^>]*>\$\{/;

export function findUnescapedEmbeds(files: readonly Source[]): string[] {
  return files
    .filter(({ rel, text }) => {
      const src = code(text);
      if (!EMBED.test(src)) return false;
      if (Object.hasOwn(NO_SHARED_ESCAPE, rel)) return false;
      return !src.includes(LIB);
    })
    .map((f) => f.rel);
}

describe('<script> へ埋め込む値は共通の退避を通る', () => {
  const files = sources();

  it('走査が生きている (ビルダーを読めている)', () => {
    expect(files.length).toBeGreaterThan(10);
    const embedders = files.filter((f) => EMBED.test(code(f.text))).map((f) => f.rel);
    // 実測 10 か所。減ったら走査が壊れているか、ビルダーが消えている。
    expect(embedders.length, `埋め込み箇所: ${embedders.join(', ')}`).toBeGreaterThanOrEqual(6);
    expect(embedders).toContain('build-landing.cjs');
  });

  it('★ 退避を通さずに <script> へ値を差し込んでいない', () => {
    expect(
      findUnescapedEmbeds(files),
      `scripts/${LIB} の scriptSafeJs / jsonForScript / replaceJsonToken を通してください ` +
        '(値に </script> や U+2028 が入ると、出荷する HTML が壊れます)',
    ).toEqual([]);
  });

  it('例外台帳の項目は実在し、理由が書いてあり、その理由が本当である', () => {
    const byName = new Map(files.map((f) => [f.rel, f]));
    for (const [rel, { why, check }] of Object.entries(NO_SHARED_ESCAPE)) {
      const f = byName.get(rel);
      expect(f, `${rel} は scripts/ に無い — 台帳から外すこと`).toBeDefined();
      expect(why.trim().length, `${rel} の理由が空`).toBeGreaterThan(40);
      // **台帳の主張そのものを確かめる。** 書くだけなら嘘になりうる。
      expect(check(code(f!.text)), `${rel}: 台帳の理由が実物と食い違っている`).toBe(true);
    }
  });

  /* 合成ケース —— 鳴る側と鳴らない側の両方を留める。 */
  it('★ 対照: 退避なしの埋め込みは鳴り、通していれば鳴らない', () => {
    const bare = { rel: 'x.cjs', text: 'const h = `<script>${js}</script>`;' };
    expect(findUnescapedEmbeds([bare]), '退避なしで鳴っていない').toEqual(['x.cjs']);

    const via = {
      rel: 'y.cjs',
      text: "require('./lib/json-for-script.cjs');\nconst h = `<script>${js}</script>`;",
    };
    expect(findUnescapedEmbeds([via]), '通しているのに鳴った').toEqual([]);

    // 属性つきの <script type="…"> も見る。
    const typed = { rel: 'z.cjs', text: 'const h = `<script type="application/ld+json">${d}</script>`;' };
    expect(findUnescapedEmbeds([typed]), '属性つきを見ていない').toEqual(['z.cjs']);

    // 注記の中の字面は埋め込みとして数えない。
    const comment = { rel: 'c.cjs', text: '// `<script>${js}</script>` と書くと危ない\n' };
    expect(findUnescapedEmbeds([comment]), '注記を埋め込みとして数えた').toEqual([]);

    // 台帳のファイルは見ない。
    const exempt = { rel: 'inject-pwa.cjs', text: 'const h = `<script>${js}</script>`;' };
    expect(findUnescapedEmbeds([exempt]), '例外が効いていない').toEqual([]);
  });
});
