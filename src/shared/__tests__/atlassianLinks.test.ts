/**
 * **Atlassian のリンクは 1 つの形で、動的部分は必ず encode する** (2026-09-12 · パス 181)。
 *
 * 直す前は 3 か所が別々に組んでおり、うち 1 つ (プロジェクト一覧の href) だけが
 * `/jira/projects/<key>` という**他のどこにも無い形**だった。3 か所とも API が返した
 * 値を生のまま挿しており、開く先は `shell.openExternal` である。
 *
 * ここは**連結の形**だけを見る。`site` の検証は `atlassianSite.ts` が持つので
 * こちらでは再導出しない (同じ規則を 2 か所に置かない)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { jiraBrowseUrl } from '../atlassianLinks';
import { normalizeAtlassianSiteResult } from '../atlassianSite';
import { readOriginalSource, readOriginalDirEntries } from './originalSource';

describe('jiraBrowseUrl (パス 181)', () => {
  it('★ `/browse/<key>` を組む (出荷済みの形)', () => {
    expect(jiraBrowseUrl('https://acme.atlassian.net', 'KAN-12')).toBe(
      'https://acme.atlassian.net/browse/KAN-12',
    );
  });

  it('★ プロジェクトキーも同じ形 (課題と入口を分けない)', () => {
    expect(jiraBrowseUrl('https://acme.atlassian.net', 'KAN')).toBe(
      'https://acme.atlassian.net/browse/KAN',
    );
  });

  it('★ 動的部分を encode する (応答が想定外でも開く先が変わらない)', () => {
    expect(jiraBrowseUrl('https://a.atlassian.net', '../../evil')).toBe(
      'https://a.atlassian.net/browse/..%2F..%2Fevil',
    );
    expect(jiraBrowseUrl('https://a.atlassian.net', 'K#frag')).toBe(
      'https://a.atlassian.net/browse/K%23frag',
    );
    expect(jiraBrowseUrl('https://a.atlassian.net', 'K?q=1')).toBe(
      'https://a.atlassian.net/browse/K%3Fq%3D1',
    );
  });

  it('★ encode した URL も 1 つの origin に留まる (逃げていないことを URL 解析で見る)', () => {
    for (const key of ['../../evil', 'K#frag', 'K?q=1', 'K/../..']) {
      const u = new URL(jiraBrowseUrl('https://a.atlassian.net', key));
      expect(u.origin, `${key}: origin が変わった`).toBe('https://a.atlassian.net');
      expect(u.pathname.startsWith('/browse/'), `${key}: /browse/ から出た`).toBe(true);
    }
  });

  it('★ 正規化した site と連結して二重スラッシュにならない', () => {
    const r = normalizeAtlassianSiteResult('https://acme.atlassian.net/wiki/spaces?x=1#f');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // `atlassianSite` は hostname だけで組み直すので末尾に `/` もパスも付かない。
    expect(jiraBrowseUrl(r.site, 'KAN-1')).toBe('https://acme.atlassian.net/browse/KAN-1');
  });
});

/**
 * **この形を組む場所が増えていないか** (走査)。
 *
 * `browse/` と `/jira/` の字面を `src` から数え、この module 以外で
 * Atlassian の URL を組んでいないことを見る。**不在の主張に標本を添える** ——
 * この module 自身が掛かることを先に確かめる (綴りが変わったら鳴らなくなる)。
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');
}

/** `src` 配下の .ts / .tsx を再帰で読む (検査は除く)。 */
function sources(dir: string): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      out.push(...sources(full));
      continue;
    }
    if (!/\.tsx?$/.test(e.name)) continue;
    out.push({ rel: path.relative(SRC, full), text: code(readOriginalSource(full)) });
  }
  return out;
}

const SRC = path.resolve(__dirname, '../..');

describe('Atlassian のリンクを組む場所 (パス 181)', () => {
  const files = sources(SRC);

  it('★ 走査が実物に当たる (この module 自身が掛かる)', () => {
    const me = files.find((f) => f.rel === path.join('shared', 'atlassianLinks.ts'));
    expect(me, '走査が shared/atlassianLinks.ts を読んでいない').toBeDefined();
    expect(me!.text).toContain('/browse/');
  });

  it('★ `/browse/` を組むのは shared/atlassianLinks.ts だけ', () => {
    const rogue = files
      .filter((f) => f.rel !== path.join('shared', 'atlassianLinks.ts'))
      .filter((f) => /\$\{[^}]*\}\/browse\//.test(f.text) || /['"`]\/browse\//.test(f.text))
      .map((f) => f.rel);
    expect(rogue, 'Atlassian のリンクを別の場所で組んでいる').toEqual([]);
  });

  it('★ `/jira/` のパスを組む場所は無い (直した形が戻っていない)', () => {
    const rogue = files
      .filter((f) => /\$\{[^}]*\}\/jira\//.test(f.text))
      .map((f) => f.rel);
    expect(rogue, '`/jira/…` を組む形が戻っている').toEqual([]);
  });

  it('★ 3 つの読み手がこの module を通る (口はあるが繋がっていないを作らない)', () => {
    const readers = [
      path.join('main', 'clients', 'atlassian.ts'),
      path.join('renderer', 'data', 'saasWriteWeb.ts'),
      path.join('renderer', 'pages', 'AtlassianPage.tsx'),
    ];
    for (const rel of readers) {
      const f = files.find((x) => x.rel === rel);
      expect(f, `${rel} が読めない`).toBeDefined();
      expect(f!.text, `${rel}: jiraBrowseUrl を読んでいない`).toContain('jiraBrowseUrl');
    }
  });
});
