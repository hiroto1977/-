import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * `lint:workflow-security` の**外側の証人**。
 *
 * ワークフローはコード署名の鍵と Apple の資格情報を持ち、**利用者がダウンロード
 * するインストーラを公開する**場所である。門が黙ればそこが開く。
 *
 * **台帳は必ず空で渡す (`check(list, {})`)。** 既定は実物の台帳なので、
 * 合成標本を流すと「台帳に載っているものが使われていない」が毎回鳴り、
 * どの規則で鳴ったのか読めなくなる (2026-08-26 に実際に読み違えかけた。
 * 同じ罠を `lint:mcp-servers` でも踏んでいる)。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-workflow-security.cjs') as {
  check: (list: { name: string; text: string }[], allow?: Record<string, unknown>) => { file: string; why: string }[];
  UNPINNED_ALLOW: Record<string, unknown>;
};

const wf = (text: string) => gate.check([{ name: 'x.yml', text }], {});
const SHA = 'a'.repeat(40);
const BASE = 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n';

describe('lint:workflow-security — 外側の証人', () => {
  it('陰性: 素直なワークフローは通る (この行が落ちると以下は無意味)', () => {
    expect(wf(`${BASE}      - uses: actions/checkout@v4\n      - run: echo hi\n`)).toHaveLength(0);
  });

  it.each([
    ['★ permissions を宣言しない (既定を継ぐ)', 'jobs:\n  a:\n    steps:\n      - run: echo hi\n'],
    ['★ トップが write-all', 'permissions: write-all\njobs:\n  a:\n    steps:\n      - run: echo hi\n'],
    [
      '★ job が write-all で上書き (実効権限だけが広がる)',
      'permissions:\n  contents: read\njobs:\n  a:\n    permissions: write-all\n    steps:\n      - run: echo hi\n',
    ],
    [
      '★ job 単位の permissions で広げる',
      'permissions:\n  contents: read\njobs:\n  a:\n    permissions:\n      contents: write\n    steps:\n      - run: echo hi\n',
    ],
    ['★ 第三者 action が可動タグ', `${BASE}      - uses: third/act@v1\n`],
    ['★ 第三者 action が枝', `${BASE}      - uses: third/act@main\n`],
    ['★ actions/* が @main (枝は固定ではない)', `${BASE}      - uses: actions/checkout@main\n`],
    ['★ actions/* が任意の枝', `${BASE}      - uses: actions/checkout@my-branch\n`],
    [
      '★ pull_request_target (fork の PR が secrets 付きで走る)',
      'permissions:\n  contents: read\non:\n  pull_request_target:\njobs:\n  a:\n    steps:\n      - run: echo hi\n',
    ],
    ['★ run: へ PR の題名を展開 (コマンド注入)', `${BASE}      - run: echo \${{ github.event.pull_request.title }}\n`],
    ['★ run: へ step の出力を展開 (文脈の列挙では漏れる形)', `${BASE}      - run: echo \${{ steps.s.outputs.v }}\n`],
    ['★ run: へ workflow_dispatch の入力を展開', `${BASE}      - run: echo \${{ inputs.target }}\n`],
  ])('%s', (_n, text) => {
    expect(wf(text).length).toBeGreaterThan(0);
  });

  it.each([
    ['actions/* を版のタグで', `${BASE}      - uses: actions/checkout@v4\n`],
    ['actions/* を細かい版で', `${BASE}      - uses: actions/checkout@v4.1.2\n`],
    ['actions/* を SHA で (最も固い形)', `${BASE}      - uses: actions/checkout@${SHA}\n`],
    ['第三者を SHA で', `${BASE}      - uses: third/act@${SHA}\n`],
    ['同じリポジトリの composite action', `${BASE}      - uses: ./.github/actions/x\n`],
    ['run: に埋め込みが無い', `${BASE}      - run: npm ci && npm test\n`],
    ['permissions を絞って列挙', 'permissions:\n  contents: read\n  pages: write\njobs:\n  a:\n    steps:\n      - run: echo hi\n'],
  ])('陰性: %s は通る', (_n, text) => {
    expect(wf(text)).toHaveLength(0);
  });

  it('★ 違反には、どのファイルの何かが書いてある', () => {
    const p = wf('jobs:\n  a:\n    steps:\n      - run: echo hi\n');
    expect(p[0]?.file).toBe('x.yml');
    expect((p[0]?.why ?? '').length).toBeGreaterThan(10);
  });
});

/*
 * **実物の release.yml は、公開する action を SHA で固定している** (threat: T-035 · パス 519)。
 *
 * 2026-08-22 から 2026-10-14 まで `softprops/action-gh-release@v2` は可動タグのまま台帳に
 * 載っていた (理由は「このセッションから SHA を解決できない」)。台帳は門を通すので、
 * その間この action の持ち主がタグを動かせば、**署名鍵と GH_TOKEN を持つジョブ**が
 * 動かされた先のコードを走らせた。`git ls-remote --tags` (git プロキシは公開リポジトリを
 * 通す) で `refs/tags/v2` を解決し、`refs/tags/v2.6.2` と同じコミットであることを
 * 確かめて固定した。門は「SHA か台帳か」しか見ないので、**台帳へ戻す退行**はここだけが鳴る。
 */
describe('release.yml の公開 action は SHA 固定 (threat: T-035)', () => {
  const releaseYml = readFileSync(path.resolve(__dirname, '../../../.github/workflows/release.yml'), 'utf8');

  it('★ softprops/action-gh-release は 40 桁の SHA で固定され、可動タグではない (threat: T-035)', () => {
    const uses = releaseYml.split('\n').filter((l) => /^\s*-?\s*uses:\s*softprops\/action-gh-release@/.test(l));
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatch(/action-gh-release@[0-9a-f]{40}\b/);
    expect(uses[0]).not.toMatch(/action-gh-release@v\d/);
  });

  it('★ 未固定の台帳は空 —— 台帳へ戻して門を通す形を留める (threat: T-035)', () => {
    expect(Object.keys(gate.UNPINNED_ALLOW)).toEqual([]);
  });

  it('対照: 実物の release.yml を可動タグへ戻すと門が鳴る (台帳が空なので免除されない)', () => {
    const reverted = releaseYml.replace(/action-gh-release@[0-9a-f]{40}[^\n]*/, 'action-gh-release@v2');
    const problems = gate.check([{ name: 'release.yml', text: reverted }], gate.UNPINNED_ALLOW);
    expect(problems.some((p) => p.why.includes('softprops/action-gh-release@v2'))).toBe(true);
    expect(gate.check([{ name: 'release.yml', text: releaseYml }], gate.UNPINNED_ALLOW)).toHaveLength(0);
  });
});
