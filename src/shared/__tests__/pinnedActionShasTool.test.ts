import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * **SHA 固定の実在確認の道具の形を留める** (2026-10-19 · パス 534 · threat: T-124)。
 *
 * `lint:workflow-security` は SHA 固定の「形」(40 桁の 16 進 + `# v5` の注記) までしか見られない。
 * 実在の確認は `git ls-remote` が要るので CI の決定的な門にできず、`audit:pinned-action-shas` が
 * 手で回す点検として受け持つ。ネットワークは使えないので、ここは**決定的な部分だけ**を見る:
 * 判定の核 (注入した継ぎ目で全分岐)・収集が実物の固定を読めること・手で回す道具としての配線。
 */
const REPO = path.resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);
const tool = req(path.join(REPO, 'scripts/audit-pinned-action-shas.cjs')) as {
  collectPins: (f: { file: string; text: string }[]) => { file: string; line: number; repo: string; sha: string; tag: string | null }[];
  judge: (
    pin: { repo: string; sha: string; tag: string | null },
    remote: { tagShas: (r: string, t: string) => string[] | null; commitExists: (r: string, s: string) => boolean | null },
  ) => { status: string };
  summarize: (r: { status: string }[]) => { code: number };
};
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const pin = (over: Partial<{ repo: string; sha: string; tag: string | null }> = {}) => ({ repo: 'o/r', sha: A, tag: 'v5' as string | null, ...over });
const remote = (tags: string[] | null, exists: boolean | null = false) => ({ tagShas: () => tags, commitExists: () => exists });

function yamlFiles(dir: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out.push(...yamlFiles(p));
    else if (/\.ya?ml$/.test(n)) out.push({ file: p, text: readOriginalSource(p) });
  }
  return out;
}

describe('audit:pinned-action-shas (threat: T-124)', () => {
  it('★ 判定: 注記のタグが SHA を指せば match・peel 先でも match', () => {
    expect(tool.judge(pin(), remote([A])).status).toBe('match');
    expect(tool.judge(pin(), remote([B, A])).status).toBe('match');
  });

  it('★ 判定: タグが別の commit を指すとき、SHA が実在すれば moved (警告)・実在しなければ missing (落とす)', () => {
    expect(tool.judge(pin(), remote([B], true)).status).toBe('moved');
    expect(tool.judge(pin(), remote([B], false)).status).toBe('missing');
  });

  it('★ 判定: タグが無ければ no-tag・網が使えなければ unreachable (緑にしない)', () => {
    expect(tool.judge(pin(), remote([])).status).toBe('no-tag');
    expect(tool.judge(pin(), remote(null)).status).toBe('unreachable');
    expect(tool.judge(pin(), remote([B], null)).status).toBe('unreachable');
  });

  it('★ 判定: 引数に載せる前に repo・タグ・SHA を厳しく見る (先頭が - の値を git に渡さない)', () => {
    let called = 0;
    const spy = { tagShas: () => ((called += 1), [A]), commitExists: () => true };
    expect(tool.judge(pin({ tag: '-v5' }), spy).status).toBe('no-comment');
    expect(tool.judge(pin({ tag: null }), spy).status).toBe('no-comment');
    expect(tool.judge(pin({ repo: '--upload-pack=x/y' }), spy).status).toBe('invalid');
    expect(tool.judge(pin({ sha: 'zz' }), spy).status).toBe('invalid');
    expect(called).toBe(0);
  });

  it('★ 集計: 作り話の疑いは exit 1・測れなければ exit 2・古い固定だけなら exit 0', () => {
    expect(tool.summarize([{ status: 'match' }, { status: 'missing' }]).code).toBe(1);
    expect(tool.summarize([{ status: 'no-tag' }]).code).toBe(1);
    expect(tool.summarize([{ status: 'match' }, { status: 'unreachable' }]).code).toBe(2);
    expect(tool.summarize([{ status: 'match' }, { status: 'moved' }]).code).toBe(0);
    expect(tool.summarize([{ status: 'unreachable' }, { status: 'missing' }]).code).toBe(1);
  });

  it('★ 収集: 実物の .github の SHA 固定を読める (走査が空虚でない・版の注記つき)', () => {
    const pins = tool.collectPins(yamlFiles(path.join(REPO, '.github')));
    expect(pins.length).toBeGreaterThanOrEqual(20);
    expect(new Set(pins.map((p) => p.repo)).size).toBeGreaterThanOrEqual(5);
    // 門 (lint:workflow-security) が版の注記を要求しているので、実物はどれも注記を持つ。
    expect(pins.filter((p) => p.tag === null)).toEqual([]);
  });

  it('収集の針: サブパス・コメント行・タグ参照・注記なしを正しく扱う', () => {
    const got = tool.collectPins([
      {
        file: 'w.yml',
        text: [
          `      - uses: actions/checkout@${A} # v5`,
          `      - uses: github/codeql-action/analyze@${B} # v3.1.0`,
          `      - uses: evil/x@${A}`,
          `      # - uses: ignored/commented@${A} # v1`,
          '      - uses: actions/setup-node@v4',
        ].join('\n'),
      },
    ]);
    expect(got.map((g) => g.repo)).toEqual(['actions/checkout', 'github/codeql-action', 'evil/x']);
    expect(got.map((g) => g.tag)).toEqual(['v5', 'v3.1.0', null]);
  });

  it('★ 手で回す道具として配線されている (self-test つき・verify:all / CI には入れない)', () => {
    const pkg = JSON.parse(readOriginalSource(path.join(REPO, 'package.json'))) as { scripts: Record<string, string> };
    expect(pkg.scripts['audit:pinned-action-shas']).toContain('scripts/audit-pinned-action-shas.cjs --self-test');
    expect(pkg.scripts['verify:all']).not.toContain('audit:pinned-action-shas');
    expect(readOriginalSource(path.join(REPO, 'CLAUDE.md'))).toContain('npm run audit:pinned-action-shas');
  });
});
