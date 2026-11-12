import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/*
 * `lint:workflow-security` は生のテキストを正規表現で読む。YAML の二重引用符つき文字列のエスケープ
 * (`\x74` ほか) で綴りを隠すと、js-yaml が `pull_request_target` と読む workflow を門が見落とした
 * (T-197・2026-10-25 に監査役が報告し、防御側が再現した)。台帳は必ず空で渡す (標本が台帳の逆向きに鳴らない)。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-workflow-security.cjs') as {
  check: (list: { name: string; text: string }[], allow?: Record<string, unknown>, jobAllow?: Record<string, unknown>) => { file: string; why: string }[];
};
const yaml = req('js-yaml') as { load: (s: string) => { on?: Record<string, unknown>; jobs: { t: { steps: Record<string, unknown>[] } } } };
const run = (text: string) => gate.check([{ name: 'x.yml', text }], {}, {});

const WF = (trigger: string, runKey: string): string =>
  `permissions:
  contents: read
on:
  ${trigger}:
    types: [opened]
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
        with:
          persist-credentials: false
      - ${runKey}: echo "\${{ github.event.pull_request.title }}"
`;

describe('workflow の YAML は、エスケープで綴りを隠せない (threat: T-197)', () => {
  it('標本: js-yaml は \\x74 / \\x75 を混ぜた鍵を、禁じている綴りの鍵として読む (針が的に当たる)', () => {
    const doc = yaml.load(WF('"pull_request_\\x74arget"', '"r\\x75n"'));
    expect(Object.keys(doc.on ?? {})).toEqual(['pull_request_target']);
    expect(Object.keys(doc.jobs.t.steps[1]!)).toEqual(['run']);
  });

  it('★ 平文の pull_request_target と run: への展開は今までどおり落ちる (対照)', () => {
    const why = run(WF('pull_request_target', 'run')).map((p) => p.why).join('\n');
    expect(why).toContain('pull_request_target');
    expect(why).toContain('run: へ信用できない値を展開している');
  });

  it('★ エスケープで綴りごと隠した pull_request_target は落ちる (直す前は 0 件だった)', () => {
    const problems = run(WF('"pull_request_\\x74arget"', 'run'));
    expect(problems.some((p) => p.why.includes('二重引用符つき文字列のエスケープ'))).toBe(true);
  });

  it('★ \\x75 で隠した run の鍵・\\u・行継続・flow 配列の中も落ちる', () => {
    for (const text of [
      WF('pull_request', '"r\\x75n"'),
      WF('"pull_request_\\u0074arget"', 'run'),
      WF('"pull_request_\\\n     target"', 'run'),
      'permissions:\n  contents: read\non: ["push", "workflow_\\x72un"]\n',
    ]) {
      expect(run(text).some((p) => p.why.includes('二重引用符つき文字列のエスケープ')), text).toBe(true);
    }
  });

  it('許す 3 種 (\\" \\\\ \\n) と、ブロック記法の本文・注記の中・素のスカラの中は落とさない (過剰に止めない)', () => {
    const bad = (t: string): boolean => run(t).some((p) => p.why.includes('二重引用符つき文字列のエスケープ'));
    expect(bad('permissions:\n  contents: read\nname: "say \\"hi\\"\\n\\\\"\n')).toBe(false);
    expect(bad('permissions:\n  contents: read\njobs:\n  t:\n    steps:\n      - run: |\n          printf "\\x41"\n        shell: bash\n')).toBe(false);
    expect(bad('permissions:\n  contents: read\nname: ok # "\\x41"\n')).toBe(false);
    expect(bad('permissions:\n  contents: read\nname: Run "x\\y" now\n')).toBe(false);
    // ブロック記法の直後の兄弟の鍵は読み飛ばさない。
    expect(bad('permissions:\n  contents: read\njobs:\n  t:\n    steps:\n      - run: |\n          echo\n        "sh\\x65ll": bash\n')).toBe(true);
  });

  it('★ 取得元・TLS の検証を差し替える環境変数は env にも run にも書けない (threat: T-198)', () => {
    const base = 'permissions:\n  contents: read\njobs:\n  t:\n';
    for (const body of [
      '    env:\n      npm_config_registry: https://evil.example\n',
      '    env:\n      ELECTRON_MIRROR: https://evil.example/\n',
      '    env:\n      NODE_EXTRA_CA_CERTS: ./evil.pem\n',
      '    steps:\n      - run: NODE_TLS_REJECT_UNAUTHORIZED=0 npm ci\n',
      '    steps:\n      - run: export HTTPS_PROXY=http://evil.example:8080\n',
    ]) {
      expect(run(base + body).some((p) => p.why.includes('取得元や TLS の検証を差し替えられる')), body).toBe(true);
    }
    // 無関係な env は止めない。
    expect(run(base + '    env:\n      NODE_ENV: production\n').some((p) => p.why.includes('取得元'))).toBe(false);
  });
});
