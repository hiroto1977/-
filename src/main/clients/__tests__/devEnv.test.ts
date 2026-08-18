import { describe, expect, it } from 'vitest';
import {
  buildDevEnv,
  parsePackageJson,
  parseGoMod,
  parseToolVersions,
  parseGitHead,
  readDevEnv,
  type DevEnvInputs,
} from '../devEnv';

const noRef = () => null;

const baseInputs: DevEnvInputs = {
  nodeVersion: '22.10.0',
  platform: 'linux',
  arch: 'x64',
  packageJson: null,
  nvmrc: null,
  goMod: null,
  pythonVersion: null,
  toolVersions: null,
  gitHead: null,
  resolveRef: noRef,
  hasNodeModules: false,
  hasLockfile: false,
  hasGit: false,
};

describe('parsePackageJson', () => {
  it('extracts name, version, scripts and dependency counts', () => {
    const pkg = parsePackageJson(
      JSON.stringify({
        name: 'svc',
        version: '1.2.3',
        scripts: { dev: 'vite', test: 'vitest' },
        dependencies: { react: '^18', 'react-dom': '^18' },
        devDependencies: { vite: '^6' },
        engines: { node: '>=22', npm: '>=10' },
      }),
    );
    expect(pkg).not.toBeNull();
    expect(pkg!.name).toBe('svc');
    expect(pkg!.version).toBe('1.2.3');
    expect(pkg!.scripts).toEqual(['dev', 'test']);
    expect(pkg!.dependencyCount).toBe(2);
    expect(pkg!.devDependencyCount).toBe(1);
    expect(pkg!.engines).toEqual({ node: '>=22', npm: '>=10' });
  });

  it('returns null on invalid JSON', () => {
    expect(parsePackageJson('{ not json')).toBeNull();
  });

  it('returns null for non-object JSON (array / number)', () => {
    expect(parsePackageJson('123')).toBeNull();
    expect(parsePackageJson('null')).toBeNull();
  });

  it('defaults missing fields to empty values', () => {
    const pkg = parsePackageJson('{}');
    expect(pkg).toEqual({
      name: '',
      version: '',
      scripts: [],
      dependencyCount: 0,
      devDependencyCount: 0,
      engines: {},
    });
  });

  it('ignores non-string engine values', () => {
    const pkg = parsePackageJson(JSON.stringify({ engines: { node: '22', bogus: 5 } }));
    expect(pkg!.engines).toEqual({ node: '22' });
  });

  it('treats null deps / scripts / engines as empty (not as objects)', () => {
    const pkg = parsePackageJson(
      JSON.stringify({ dependencies: null, devDependencies: null, scripts: null, engines: null }),
    );
    expect(pkg).toEqual({
      name: '',
      version: '',
      scripts: [],
      dependencyCount: 0,
      devDependencyCount: 0,
      engines: {},
    });
  });
});

describe('parseGoMod', () => {
  it('extracts the go directive version', () => {
    expect(parseGoMod('module x\n\ngo 1.22\n')).toBe('1.22');
    expect(parseGoMod('go 1.21.5')).toBe('1.21.5');
  });
  it('returns null when there is no go directive', () => {
    expect(parseGoMod('module x\nrequire y v1.0.0')).toBeNull();
  });
  it('requires the directive at line start (not mid-token like cargo)', () => {
    expect(parseGoMod('cargo 1.5')).toBeNull();
  });
  it('handles multi-digit major and patch versions', () => {
    expect(parseGoMod('go 11.0')).toBe('11.0');
    expect(parseGoMod('go 1.21.15')).toBe('1.21.15');
  });
  it('tolerates extra whitespace after the directive', () => {
    expect(parseGoMod('go  1.22')).toBe('1.22');
  });
});

describe('parseToolVersions', () => {
  it('parses tool/version pairs, skipping comments and blanks', () => {
    const tools = parseToolVersions('nodejs 22.10.0\n\n# comment\npython 3.12.1\nbad\n');
    expect(tools).toEqual([
      { tool: 'nodejs', version: '22.10.0', source: '.tool-versions' },
      { tool: 'python', version: '3.12.1', source: '.tool-versions' },
    ]);
  });
  it('returns empty for an all-comment file', () => {
    expect(parseToolVersions('# only comments\n')).toEqual([]);
  });
  it('trims surrounding whitespace and collapses inner runs', () => {
    expect(parseToolVersions('  nodejs   22.10.0  \n')).toEqual([
      { tool: 'nodejs', version: '22.10.0', source: '.tool-versions' },
    ]);
  });
});

describe('parseGitHead', () => {
  it('resolves a symbolic ref to branch + sha', () => {
    const git = parseGitHead('ref: refs/heads/main\n', (ref) =>
      ref === 'refs/heads/main' ? 'abc1234def' : null,
    );
    expect(git).toEqual({ branch: 'main', sha: 'abc1234def' });
  });
  it('strips the refs/heads/ prefix for nested branch names', () => {
    const git = parseGitHead('ref: refs/heads/feature/x', () => null);
    expect(git).toEqual({ branch: 'feature/x', sha: '' });
  });
  it('keeps non-heads refs (e.g. tags) as the full ref', () => {
    const git = parseGitHead('ref: refs/tags/v1', () => 'tagsha');
    expect(git).toEqual({ branch: 'refs/tags/v1', sha: 'tagsha' });
  });
  it('returns empty sha when the ref cannot be resolved', () => {
    expect(parseGitHead('ref: refs/heads/main', noRef)).toEqual({ branch: 'main', sha: '' });
  });
  it('requires "ref: " at the start (mid-string ref is not a symbolic head)', () => {
    expect(parseGitHead('xref: refs/heads/main', () => 'sha')).toBeNull();
  });
  it('tolerates extra whitespace after "ref:"', () => {
    const git = parseGitHead('ref:  refs/heads/main', () => 'sha');
    expect(git).toEqual({ branch: 'main', sha: 'sha' });
  });
  it('trims surrounding whitespace of the whole file before matching', () => {
    // 先頭に空白がある HEAD でも解釈できる (raw.trim() が効いていることの担保)。
    const git = parseGitHead('  ref: refs/heads/main\n', () => 'sha');
    expect(git).toEqual({ branch: 'main', sha: 'sha' });
  });
  it('returns null for a detached HEAD (raw sha) — out of scope', () => {
    expect(parseGitHead('0123456789abcdef0123456789abcdef01234567', noRef)).toBeNull();
  });
  it('returns null for unrecognized content', () => {
    expect(parseGitHead('garbage content', noRef)).toBeNull();
  });
});

describe('buildDevEnv', () => {
  it('carries runtime fields straight through', () => {
    const s = buildDevEnv(baseInputs);
    expect(s.nodeVersion).toBe('22.10.0');
    expect(s.platform).toBe('linux');
    expect(s.arch).toBe('x64');
  });

  it('is null project / git when files are absent', () => {
    const s = buildDevEnv(baseInputs);
    expect(s.project).toBeNull();
    expect(s.git).toBeNull();
    expect(s.toolchain).toEqual([]);
  });

  it('builds project info from package.json', () => {
    const s = buildDevEnv({
      ...baseInputs,
      packageJson: JSON.stringify({ name: 'p', version: '0.1.0', scripts: { build: 'x' }, dependencies: { a: '1' } }),
    });
    expect(s.project).toEqual({
      name: 'p',
      version: '0.1.0',
      scripts: ['build'],
      dependencyCount: 1,
      devDependencyCount: 0,
    });
  });

  it('keeps project null when package.json is corrupt', () => {
    expect(buildDevEnv({ ...baseInputs, packageJson: 'oops' }).project).toBeNull();
  });

  it('collects declared toolchain from all sources in order', () => {
    const s = buildDevEnv({
      ...baseInputs,
      nvmrc: '22\n',
      packageJson: JSON.stringify({ engines: { node: '>=22', npm: '>=10' } }),
      goMod: 'go 1.22',
      pythonVersion: '3.12.1\n',
      toolVersions: 'ruby 3.3.0',
    });
    expect(s.toolchain).toEqual([
      { tool: 'node', version: '22', source: '.nvmrc' },
      { tool: 'node', version: '>=22', source: 'package.json engines' },
      { tool: 'npm', version: '>=10', source: 'package.json engines' },
      { tool: 'go', version: '1.22', source: 'go.mod' },
      { tool: 'python', version: '3.12.1', source: '.python-version' },
      { tool: 'ruby', version: '3.3.0', source: '.tool-versions' },
    ]);
  });

  it('skips an empty .nvmrc and empty .python-version', () => {
    const s = buildDevEnv({ ...baseInputs, nvmrc: '   \n', pythonVersion: '\n' });
    expect(s.toolchain).toEqual([]);
  });

  it('skips go.mod with no go directive', () => {
    const s = buildDevEnv({ ...baseInputs, goMod: 'module x' });
    expect(s.toolchain).toEqual([]);
  });

  it('omits engine tools when package.json has no engines', () => {
    const s = buildDevEnv({ ...baseInputs, packageJson: '{}' });
    expect(s.toolchain).toEqual([]);
  });

  it('resolves git when HEAD is present', () => {
    const s = buildDevEnv({
      ...baseInputs,
      gitHead: 'ref: refs/heads/dev',
      resolveRef: () => 'deadbeef',
    });
    expect(s.git).toEqual({ branch: 'dev', sha: 'deadbeef' });
  });

  it('builds readiness checks reflecting the booleans', () => {
    const ready = buildDevEnv({ ...baseInputs, hasNodeModules: true, hasLockfile: true, hasGit: true });
    expect(ready.readiness.map((c) => c.ok)).toEqual([true, true, true]);
    const notReady = buildDevEnv(baseInputs);
    expect(notReady.readiness.map((c) => c.ok)).toEqual([false, false, false]);
    expect(notReady.readiness.map((c) => c.label)).toEqual(['Node モジュール', 'ロックファイル', 'Git リポジトリ']);
  });

  it('is deterministic', () => {
    expect(buildDevEnv(baseInputs)).toEqual(buildDevEnv(baseInputs));
  });
});

describe('readDevEnv (live host)', () => {
  it('reads a well-formed snapshot from the running host', () => {
    // cwd の内容に依存しない構造的な健全性のみ検証 (CI / Stryker サンドボックス対応)。
    const s = readDevEnv();
    expect(s.nodeVersion.length).toBeGreaterThan(0);
    expect(typeof s.platform).toBe('string');
    expect(typeof s.arch).toBe('string');
    expect(s.readiness).toHaveLength(3);
    expect(Array.isArray(s.toolchain)).toBe(true);
  });

  it('returns null project for a directory without package.json', () => {
    const s = readDevEnv('/nonexistent-path-xyz');
    expect(s.project).toBeNull();
    expect(s.git).toBeNull();
    expect(s.readiness.every((c) => !c.ok)).toBe(true);
  });
});

// --- 実際に読むファイル ------------------------------------------------
//
// `readDevEnv` は「どのファイルを見るか」を決めている層である。
// 名前を 1 つ間違えても整形側は動くので、上の検査では捕まらない。
// 一時ディレクトリを作って実際に読ませる。

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { afterEach, beforeEach } from 'vitest';

describe('readDevEnv — 実際のファイルから読む', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'devenv-'));
  });
  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  const write = async (rel: string, body: string): Promise<void> => {
    const full = nodePath.join(dir, rel);
    await fsp.mkdir(nodePath.dirname(full), { recursive: true });
    await fsp.writeFile(full, body);
  };

  it('何も無いディレクトリなら project も git も null', async () => {
    const snap = readDevEnv(dir);
    expect(snap.project).toBeNull();
    expect(snap.git).toBeNull();
    expect(snap.toolchain).toEqual([]);
    // 実行中の Node の情報はそのまま入る
    expect(snap.nodeVersion).toBe(process.versions.node);
    expect(snap.platform).toBe(process.platform);
    expect(snap.arch).toBe(process.arch);
  });

  it('宣言ファイルはそれぞれ決まった名前から読む', async () => {
    await write('package.json', JSON.stringify({ name: 'p', version: '1.0.0' }));
    await write('.nvmrc', '20.11.0\n');
    await write('go.mod', 'module x\n\ngo 1.22\n');
    await write('.python-version', '3.12.1\n');
    await write('.tool-versions', 'terraform 1.7.0\n');

    const snap = readDevEnv(dir);
    expect(snap.project?.name).toBe('p');
    const by = (tool: string) => snap.toolchain.find((t) => t.tool === tool);
    // 名前を間違えると、この 1 つだけが静かに消える。
    expect(by('node')).toMatchObject({ version: '20.11.0', source: '.nvmrc' });
    expect(by('go')).toMatchObject({ version: '1.22' });
    expect(by('python')).toMatchObject({ version: '3.12.1' });
    expect(by('terraform')).toMatchObject({ version: '1.7.0' });
  });

  it('git は HEAD と参照先の両方を読んで枝と sha を出す', async () => {
    const sha = 'a'.repeat(40);
    await write('.git/HEAD', 'ref: refs/heads/main\n');
    await write('.git/refs/heads/main', `${sha}\n`);

    const snap = readDevEnv(dir);
    // 参照の解決は `.git/<ref>` を読む。読めないと sha が空になる。
    expect(snap.git).toEqual({ branch: 'main', sha });
  });

  it('HEAD はあるが参照先が無ければ sha は空にする（落ちない）', async () => {
    await write('.git/HEAD', 'ref: refs/heads/missing\n');
    const snap = readDevEnv(dir);
    expect(snap.git).toEqual({ branch: 'missing', sha: '' });
  });

  it('lockfile は npm / yarn / pnpm のどれでも認める', async () => {
    // 並び順も固定しておく (0=node_modules / 1=lockfile / 2=git)。
    const lockCheck = (snap: ReturnType<typeof readDevEnv>) => snap.readiness[1]!;

    expect(readDevEnv(dir).readiness.map((r) => r.label)).toEqual([
      'Node モジュール',
      'ロックファイル',
      'Git リポジトリ',
    ]);
    expect(lockCheck(readDevEnv(dir)).ok).toBe(false);

    for (const name of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) {
      const one = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'devenv-lock-'));
      try {
        await fsp.writeFile(nodePath.join(one, name), '');
        expect(lockCheck(readDevEnv(one)).ok).toBe(true);
      } finally {
        await fsp.rm(one, { recursive: true, force: true });
      }
    }
  });

  it('node_modules と .git の有無をそのまま伝える', async () => {
    const before = readDevEnv(dir);
    expect(before.readiness[0]!.ok).toBe(false); // node_modules
    expect(before.readiness[2]!.ok).toBe(false); // .git

    await fsp.mkdir(nodePath.join(dir, 'node_modules'));
    await fsp.mkdir(nodePath.join(dir, '.git'));

    const after = readDevEnv(dir);
    expect(after.readiness[0]!.ok).toBe(true);
    expect(after.readiness[2]!.ok).toBe(true);
  });

  it('壊れた package.json でも落ちずに project は null にする', async () => {
    await write('package.json', 'not json');
    const snap = readDevEnv(dir);
    expect(snap.project).toBeNull();
  });
});
