import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
// 読み込んだだけで 7,543 ファイルを書いて process.exit していたので、外から
// 証人を立てられなかった。require.main ガードを足して初めてここが書ける。
const { yamlStr, linkSafe, mdInline, assertWikiAliasSafe, assertBareYamlScalar } = req(
  '../../../scripts/build-knowledge-vault.cjs',
) as {
  yamlStr: (s: unknown) => string;
  linkSafe: (s: string) => boolean;
  mdInline: (s: string) => string;
  assertWikiAliasSafe: (s: string, what: string) => string;
  assertBareYamlScalar: (v: unknown, what: string) => string;
};
const kc = req('../../../orchestration/knowledge-context.cjs') as {
  oneLiner: (text: string, max?: number) => string;
};

const OPEN = '[';
const CLOSE = ']';

describe('yamlStr — frontmatter を値が終わらせない', () => {
  it('改行は YAML の escape になり、1 行に収まる', () => {
    const out = yamlStr('one\ntwo');
    expect(out).not.toContain('\n');
    expect(out).toBe('"one\\ntwo"');
  });

  it('★ 値の中の区切り行が frontmatter を閉じてしまう形 (これが直した故障)', () => {
    const out = yamlStr(`題名\n---\n続き`);
    // frontmatter は「--- の行から次の --- の行まで」。値が改行を持てるなら、
    // 値の中の `---` が終端になりうる。逃がしたあとは行が 1 本しかない。
    expect(out.split('\n')).toHaveLength(1);
    expect(out).toContain('\\n---\\n');
  });

  it('復帰・タブも通さない', () => {
    expect(yamlStr('a\rb')).toBe('"a\\rb"');
    expect(yamlStr('a\tb')).toBe('"a\\tb"');
  });

  it('対照: 引用符と逆斜線は今まで通り', () => {
    expect(yamlStr('いわゆる "効果"')).toBe('"いわゆる \\"効果\\""');
    expect(yamlStr('a\\b')).toBe('"a\\\\b"');
  });
});

describe('linkSafe / mdInline — データが Markdown のリンクを作らない・壊さない', () => {
  it('釣り合った角括弧はそのまま (判例の中立引用を汚さない)', () => {
    const citation = `Case 27/76 United Brands v Commission ${OPEN}1978${CLOSE} ECR 207 — CJEU`;
    expect(linkSafe(citation)).toBe(true);
    expect(mdInline(citation)).toBe(citation);
  });

  it('★ 数式がそのままリンク記法だった実データ (mgmt-bass-diffusion-model)', () => {
    const label = `Wikipedia, "Bass diffusion model" — 微分方程式 dF/dt=${OPEN}p+qF${CLOSE}(1−F), S字曲線`;
    expect(linkSafe(label)).toBe(false);
    const escaped = mdInline(label);
    expect(linkSafe(escaped)).toBe(true);
    expect(escaped).toContain(`\\${OPEN}p+qF\\${CLOSE}`);
  });

  it('釣り合わない角括弧も逃がす', () => {
    expect(linkSafe(`途中で切れた ${OPEN}Final Proposal`)).toBe(false);
    expect(linkSafe(`閉じだけ ${CLOSE} が来る`)).toBe(false);
    expect(linkSafe(`${OPEN}a${CLOSE}${OPEN}b${CLOSE}`)).toBe(true);
  });

  it('逃がしたものは必ず安全になる (肯定形)', () => {
    for (const s of [`a${CLOSE}(b)`, `${OPEN}x`, `${CLOSE}`, `${OPEN}${OPEN}y${CLOSE}`]) {
      expect(linkSafe(mdInline(s))).toBe(true);
    }
  });
});

describe('壊れ方は本体データではなく経路が作っていた', () => {
  it('★ 空白の削除が `] (` を `](` に貼り合わせる (source-fsa-go-jp の実データ)', () => {
    const label = `金融庁 — Japan's Corporate Governance Code ${OPEN}Final Proposal${CLOSE} (2015-03)`;
    // 本体データのままなら安全 —— 角括弧は釣り合い、`](` は無い。
    expect(linkSafe(label)).toBe(true);
    // oneLiner は空白を**詰める**のではなく**消す**ので、`]` と `(` が隣り合う。
    const flattened = kc.oneLiner(label, 200);
    expect(flattened).toContain(`${CLOSE}(`);
    expect(linkSafe(flattened)).toBe(false);
    expect(linkSafe(mdInline(flattened))).toBe(true);
  });

  it('★ 切り詰めが開き括弧を相方から切り離す', () => {
    const label = `前置き ${OPEN}Final Proposal${CLOSE} 続き`;
    expect(linkSafe(label)).toBe(true);
    const cut = kc.oneLiner(label, 8);
    expect(cut.includes(OPEN)).toBe(true);
    expect(cut.includes(CLOSE)).toBe(false);
    expect(linkSafe(cut)).toBe(false);
    expect(linkSafe(mdInline(cut))).toBe(true);
  });
});

describe('落とすほうを選んだ二つ', () => {
  it('wikilink の別名を閉じる・割る字面は落とす', () => {
    expect(() => assertWikiAliasSafe(`題名${CLOSE}${CLOSE}あと`, 'title')).toThrow(/wikilink/);
    expect(() => assertWikiAliasSafe('題名|あと', 'title')).toThrow(/wikilink/);
    expect(assertWikiAliasSafe(`ふつうの題名 ${OPEN}1978${CLOSE}`, 'title')).toContain('1978');
  });

  it('引用符なしで YAML へ書く値は素のスカラーに限る', () => {
    expect(assertBareYamlScalar('mgmt-bass-diffusion-model', 'id')).toBe('mgmt-bass-diffusion-model');
    expect(assertBareYamlScalar('academic', 'collection')).toBe('academic');
    for (const bad of ['a: b', 'a\nb', '#a', '', '-a', 'a b', '"a"']) {
      expect(() => assertBareYamlScalar(bad, 'id')).toThrow(/素の YAML スカラー/);
    }
  });
});
