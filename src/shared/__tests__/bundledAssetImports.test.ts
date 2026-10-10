/**
 * **束へ畳み込まれる「JSON 以外の読み込み」は 0 件** (2026-09-27 · REMAINING_WORK のパス 486 #2)。
 *
 * Vite は import の接尾辞 `?raw` (本文を文字列として) / `?url` (パスを URL として・小さければ `data:` で
 * 埋める) / `?inline` (CSS を文字列として) / `?worker` と、`import.meta.glob(…)`・
 * `new URL('…', import.meta.url)`・stylesheet の `url(…)` で、**src/ の外のファイルも**単一 HTML へ
 * 畳み込める。束の材料を数える機械は **JSON の import しか見ていない** —— `artifactFreshness` の
 * `bundledJsonOutsideSrc` (鮮度の門の材料) と `registryBundleCost` (出荷する鍵の台帳)。だから例えば
 * `import requests from '../../chatbot-requests.md?raw'` の 1 行が入ると:
 *
 *   - **外から来た文** (利用者がチャットボットに打った要望) が公開サイトの HTML に逐語で入る
 *     —— パス 486 が backlog の題名について閉じた道の、別の口である
 *   - その `.md` を書き換えても、成果物の鮮度の門は「古い」と言わない (材料に数えていない)
 *
 * 今日そういう読み込みは **0 件** (実測)。パス 486 はそれを測って「0 件であることを主張する検査が無い」と
 * 残した。ここで数える。**足すなら**、鮮度の材料 (`BUILD_MATERIALS` か `bundledJsonOutsideSrc` と同じ導出) と
 * 出荷の台帳の両方へ理由つきで載せてから、この検査の期待を直すこと。
 *
 * 走るのは出荷される木だけ (検査 `__tests__` と定期点検 `__audits__` は束に入らない)。注記は落としてから
 * 探す (このファイルのような説明文の引用で鳴らないように) —— 文字列の中身は残す (接尾辞は文字列の中に在る)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

const SRC = path.resolve(__dirname, '../..');

/** 束へ入る木を歩く (検査・定期点検・型宣言は除く)。 */
function shippedFiles(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === '__audits__') continue;
      shippedFiles(p, out);
    } else if ((/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) || e.name.endsWith('.css')) {
      out.push(p);
    }
  }
  return out;
}

/** JSON 以外を束へ畳み込む書き方。どれも Vite が読み、src/ の外も指せる。 */
const NEEDLES: readonly { readonly name: string; readonly re: RegExp; readonly css?: true }[] = [
  { name: 'import の接尾辞 (静的)', re: /from\s*['"][^'"\n]+\?(?:raw|url|inline|worker|sharedworker)['"]/ },
  { name: 'import の接尾辞 (動的)', re: /import\(\s*['"][^'"\n]+\?(?:raw|url|inline|worker|sharedworker)['"]\s*\)/ },
  { name: 'import.meta.glob', re: /import\.meta\.glob(?:Eager)?\s*\(/ },
  { name: 'new URL(…, import.meta.url)', re: /new\s+URL\(\s*['"`][^'"`\n]+['"`]\s*,\s*import\.meta\.url\s*\)/ },
  { name: 'stylesheet の url(…) (data: 以外)', re: /url\(\s*(?!['"]?data:)(?!var\()['"]?[^)'"\s]+/, css: true },
];

function hitsIn(file: string, text: string): string[] {
  const code = file.endsWith('.css') ? text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')) : stripComments(text);
  const out: string[] = [];
  for (const n of NEEDLES) {
    if (n.css === true && !file.endsWith('.css')) continue;
    if (n.css !== true && file.endsWith('.css')) continue;
    const lines = code.split('\n');
    lines.forEach((line, i) => {
      if (n.re.test(line)) out.push(`${path.relative(SRC, file)}:${i + 1} (${n.name})`);
    });
  }
  return out;
}

describe('束へ畳み込まれる「JSON 以外の読み込み」', () => {
  it('★ 出荷される木には 0 件 (足すなら鮮度の材料と出荷の台帳へ載せてから)', () => {
    const files = shippedFiles(SRC);
    // 走査が空虚でない (出荷される木は数百本 —— 床は実測に張り付けない)
    expect(files.length).toBeGreaterThan(300);
    expect(files.some((f) => f.endsWith('styles.css')), 'stylesheet も歩いている').toBe(true);
    const hits = files.flatMap((f) => hitsIn(f, readOriginalSource(f)));
    expect(hits).toEqual([]);
  });

  it('標本: どの針も的の書き方に当たり、注記の中の引用には当たらない', () => {
    const samples: readonly [string, string][] = [
      ['a.ts', "import reqs from '../../chatbot-requests.md?raw';"],
      ['a.ts', "const u = await import('../../x.txt?url');"],
      ['a.ts', "const all = import.meta.glob('../../orchestration/*.md', { eager: true });"],
      ['a.ts', "const logo = new URL('../../assets/logo.svg', import.meta.url);"],
      ['a.css', '.x { background: url(../../assets/bg.png); }'],
    ];
    samples.forEach(([file, text], i) => {
      expect(hitsIn(path.join(SRC, file), text), `標本 ${i + 1} (${NEEDLES[i]!.name})`).toHaveLength(1);
    });
    // 注記の中の引用は数えない / data: と var() は埋め込みではない
    expect(hitsIn(path.join(SRC, 'a.ts'), "// import reqs from '../../chatbot-requests.md?raw';")).toEqual([]);
    expect(hitsIn(path.join(SRC, 'a.css'), '/* url(../../x.png) */ .y { mask: url(data:image/svg+xml,abc); color: var(--x); }')).toEqual([]);
    // JSON の import はこの検査の外 (別の 2 つの機械が数える)
    expect(hitsIn(path.join(SRC, 'a.ts'), "import { org } from '../../../orchestration/registry.json';")).toEqual([]);
  });
});
