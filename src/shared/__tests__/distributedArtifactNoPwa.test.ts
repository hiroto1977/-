import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource } from './originalSource';

// scripts/inject-pwa.cjs は CJS (Node スクリプト) 設計のため、テストだけが createRequire で読み込む
// (injectPwa.test.ts と同じ作法。素の import は型宣言が無く tsc が落ちる)。
const req = createRequire(import.meta.url);
const { injectPwaTags } = req('../../../scripts/inject-pwa.cjs') as {
  injectPwaTags: (html: string) => string;
};

/*
 * **配布物 (単一ファイルの standalone.html) は Service Worker を登録しない。** (2026-09-11 · パス 149)
 *
 * `assets/sw.js` の 2 つの判定 (同一オリジンの GET だけ・`res.ok` だけ) は
 * `serviceWorker.test.ts` が留めている。だがあの 2 つは **SW が走っている前提で
 * 「何を焼くか」** しか見ていない —— **「どこで走るか」は見ていない。**
 *
 * 走る場所を決めているのは組み立ての分離である: `scripts/inject-pwa.cjs` は
 * Pages の `_site/*.html` にだけ SW 登録を差し込み、`build:web` (= 配布物) は
 * それを通らない。実測 2026-09-11: `dist/standalone.html` は `serviceWorker` /
 * `sw.js` / `manifest.webmanifest` / `apple-touch-icon` のいずれも **0 件**、
 * 同じファイルに injector を当てた写しは各 **1 件**。
 *
 * **なぜこれが効いているか。** `register('./sw.js')` の scope は script の置き場所なので、
 * Pages では `/-/` に収まる。配布物が登録を持ってしまい、利用者が `sw.js` も一緒に
 * 自分のサーバのルートへ置いた場合、scope は**そのオリジン全体**になり、唯一の絞りは
 * 「同一オリジン」だけ —— つまり**そのオリジンが配るものは何でも平文で Cache Storage に
 * 無期限で残る**。これは 2026-07 の監査が閉じた指摘 (業務データ・漏洩調査の結果が
 * Vault の保護を迂回して残る) と同じ形が別の扉から開く、ということである。
 *
 * そして**その扉には鍵が無かった**。`build:web` に injector を 1 行足せば、
 * `serviceWorker.test.ts` の 2 判定は通ったまま・在庫の表も「アプリシェルだけ」と
 * 読めたまま、配布物が SW を撒くようになる。ここで組み立ての分離そのものを留める。
 */

const REPO = path.resolve(__dirname, '../../..');

/** SW 登録を差し込む道具。名前が変わればこの検査が落ちる (それが狙い)。 */
const INJECTOR = 'inject-pwa';

function readRepo(rel: string): string {
  return readOriginalSource(path.join(REPO, rel));
}

interface PackageJson {
  readonly scripts?: Readonly<Record<string, string>>;
}

function npmScripts(): Readonly<Record<string, string>> {
  const parsed = JSON.parse(readRepo('package.json')) as PackageJson;
  return parsed.scripts ?? {};
}

describe('配布物は Service Worker を登録しない (組み立ての分離を留める · パス 149)', () => {
  const scripts = npmScripts();

  it('★ 走査が実物に当たる (package.json を読めている)', () => {
    // 配布物を作る 2 本が居ること。名前が変わったらここで気付く。
    expect(Object.keys(scripts)).toEqual(expect.arrayContaining(['build:web', 'build:web:lite']));
  });

  it('★ 配布物を作る道が injector を通らない', () => {
    const web = scripts['build:web'] ?? '';
    expect(web, 'build:web が空 (走査が的を外した)').not.toBe('');
    expect(web, 'build:web が inject-pwa を呼ぶと配布物が SW を撒く').not.toContain(INJECTOR);
    expect(scripts['build:web:lite'] ?? '', 'LITE 版も同じ').not.toContain(INJECTOR);
  });

  it('★ npm script のどれも injector を呼ばない (呼ぶのは公開の workflow だけ)', () => {
    const callers = Object.entries(scripts)
      .filter(([, cmd]) => cmd.includes(INJECTOR))
      .map(([name]) => name);
    expect(callers, 'inject-pwa は pages.yml / ci.yml から直接呼ぶ。npm script に載せない').toEqual([]);
  });

  it('★ inline-html (配布物の仕上げ) は injector を参照しない —— 依存は一方向', () => {
    // inject-pwa → inline-html (検算を借りる) の向きだけが正しい。逆向きが生まれると
    // 配布物の仕上げが SW 登録を足しうる。
    expect(readRepo('scripts/inline-html.cjs')).not.toContain(INJECTOR);
  });

  it('★ 公開の道は実際に injector を「呼ぶ」 (分離が意味を持つ側)', () => {
    /*
     * ここが落ちたら「配布物に無い」が「どこにも無い」に退化している ——
     * PWA が黙って死んでいる状態で、この検査だけが緑になる形。
     *
     * **最初は `toContain('inject-pwa')` と書いていて、対照が鳴らなかった。**
     * pages.yml は注釈の中でも `inject-pwa` に触れているので、呼び出しを
     * `node scripts/NOPE.cjs` に差し替えても言及の方に当たって通ってしまった
     * (2026-09-11 · この検査自身の欠陥)。見るのは**注釈を落とした行の呼び出し**である。
     */
    const invocations = readRepo('.github/workflows/pages.yml')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .filter((l) => l.includes(`scripts/${INJECTOR}.cjs`));
    expect(invocations.length, 'pages.yml が inject-pwa を実際に呼んでいない').toBeGreaterThanOrEqual(1);
  });

  /*
   * 対照 —— **不在の主張に標本を添える。** 「配布物に `serviceWorker` が無い」は
   * 綴りが 1 つ違えば黙る形なので、**実物の injector** が同じ綴りを足すことを見る
   * (写しではなく `scripts/inject-pwa.cjs` の関数そのものを呼ぶ)。
   */
  describe('対照: 探している綴りは実物の injector が足すもの', () => {
    const SAMPLE = '<html><head><title>t</title></head><body></body></html>';

    it('injector は SW 登録を足す (探している綴りが生きている)', () => {
      const before = SAMPLE;
      const after = injectPwaTags(before);
      expect(before).not.toContain('serviceWorker');
      expect(after, '実物の injector が serviceWorker を足さない = 綴りが変わった').toContain(
        'serviceWorker',
      );
      expect(after).toContain('sw.js');
    });

    it('injector は manifest と apple-touch-icon も足す (配布物で 0 件を確かめた 4 綴り)', () => {
      const after = injectPwaTags(SAMPLE);
      for (const spelling of ['manifest.webmanifest', 'apple-touch-icon']) {
        expect(after, `${spelling} を足さない = 走査の綴りが実物とずれた`).toContain(spelling);
      }
    });
  });
});
