/**
 * **公開版へそのまま出る assets は、鎖と CODEOWNERS で守り、script を持たない (2026-10-15 · パス 523 · threat: T-071)。**
 *
 * `pages.yml` は `assets/icon.svg` と `assets/og.png` を `_site/` へそのままコピーして公開する。
 * `icon.svg` は `<link rel=icon>` としては script を走らせないが、同じ URL を直接開くと **SVG 文書として
 * `<script>` が走る** (実測: `</svg>` の手前に `<script>` を足した写しを chromium の `--dump-dom` で開くと
 * 属性が立った)。公開版のオリジン (`app.html` / `lite.html` と同じ) で動く script で、SVG 文書には
 * CSP が無い (CSP は HTML の meta にだけ在る)。どの門も `assets/` を走査していなかった。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

const ROOT = path.resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);
const { PROTECTED } = req('../../../scripts/integrity-chain.cjs') as { PROTECTED: readonly string[] };

/** pages.yml が `_site/` へそのままコピーする assets (走査で導く)。 */
function publishedAssets(): string[] {
  const yml = readOriginalSource(path.join(ROOT, '.github/workflows/pages.yml'));
  return [...yml.matchAll(/cp\s+(assets\/[\w.-]+)\s+_site\//g)].map((m) => m[1]!);
}

const ACTIVE = [/<script\b/i, /\son[a-z]+\s*=/i, /<foreignObject\b/i, /<iframe\b/i, /<embed\b/i, /<object\b/i, /javascript:/i, /<use\b/i, /href\s*=\s*["']https?:/i];

describe('公開版へそのまま出る assets (threat: T-071)', () => {
  it('★ pages.yml が公開する assets はどれも鎖の保護対象 (threat: T-071)', () => {
    const assets = publishedAssets();
    expect(assets.length, '走査が空 (pages.yml の cp の形が変わった)').toBeGreaterThanOrEqual(2);
    expect(assets.filter((a) => !PROTECTED.includes(a))).toEqual([]);
  });

  it('★ 公開する SVG は script も イベント属性も外部参照も持たない (threat: T-071)', () => {
    const svgs = publishedAssets().filter((a) => a.endsWith('.svg'));
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    for (const rel of svgs) {
      const svg = readOriginalSource(path.join(ROOT, rel));
      for (const needle of ACTIVE) expect(svg, `${rel}: ${needle}`).not.toMatch(needle);
    }
    // 標本: 針は走る形に当たる (直す前の探りそのもの)。
    const planted = '<svg xmlns="http://www.w3.org/2000/svg"><script>document.documentElement.setAttribute("data-probe","x")</script></svg>';
    expect(ACTIVE.some((n) => n.test(planted))).toBe(true);
    expect(ACTIVE.some((n) => n.test('<svg><a onclick="x()"></a></svg>'))).toBe(true);
  });
});
