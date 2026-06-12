import fs from 'node:fs';
import path from 'node:path';

/**
 * 開発環境の読み取り連携 — Linux 上での開発を支援するプロジェクト診断 (純ロジック中心)。
 *
 * **サブプロセスは一切起動しない** (リポジトリの不変条件: ランタイムコードからの
 * サブプロセス実行は禁止)。代わりに `fs` と `process` から開発環境を読み取る:
 *  - ランタイム: Node バージョン / プラットフォーム / アーキ (`process` から)
 *  - 宣言ツールチェーン: `.nvmrc` / `package.json` engines / `go.mod` / `.python-version`
 *    / `.tool-versions` (asdf) に**宣言された**バージョン
 *  - プロジェクト: `package.json` の名前 / バージョン / npm スクリプト / 依存数
 *  - Git: `.git/HEAD` と参照から現在ブランチ / コミット SHA
 *  - 準備状況: node_modules / ロックファイル / Git リポジトリの有無
 *
 * 解析は純関数 (各 parse 関数 / buildDevEnv) に分離し、IO ({@link readDevEnv}) は薄く保つ。
 */

export interface DeclaredTool {
  readonly tool: string;
  readonly version: string;
  readonly source: string;
}

export interface ProjectInfo {
  readonly name: string;
  readonly version: string;
  readonly scripts: readonly string[];
  readonly dependencyCount: number;
  readonly devDependencyCount: number;
}

export interface GitInfo {
  readonly branch: string;
  readonly sha: string;
}

export interface ReadinessCheck {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface DevEnvSnapshot {
  readonly nodeVersion: string;
  readonly platform: string;
  readonly arch: string;
  readonly project: ProjectInfo | null;
  readonly toolchain: readonly DeclaredTool[];
  readonly git: GitInfo | null;
  readonly readiness: readonly ReadinessCheck[];
}

/** buildDevEnv への入力 (すべて読み取り済みの生データ・テストはこれを直接渡す)。 */
export interface DevEnvInputs {
  readonly nodeVersion: string;
  readonly platform: string;
  readonly arch: string;
  readonly packageJson: string | null;
  readonly nvmrc: string | null;
  readonly goMod: string | null;
  readonly pythonVersion: string | null;
  readonly toolVersions: string | null;
  readonly gitHead: string | null;
  /** `refs/heads/main` 等を SHA に解決する (なければ null)。 */
  readonly resolveRef: (ref: string) => string | null;
  readonly hasNodeModules: boolean;
  readonly hasLockfile: boolean;
  readonly hasGit: boolean;
}

interface ParsedPackage {
  readonly name: string;
  readonly version: string;
  readonly scripts: readonly string[];
  readonly dependencyCount: number;
  readonly devDependencyCount: number;
  readonly engines: Readonly<Record<string, string>>;
}

const countKeys = (v: unknown): number =>
  v !== null && typeof v === 'object' ? Object.keys(v as object).length : 0;

const keysOf = (v: unknown): string[] =>
  v !== null && typeof v === 'object' ? Object.keys(v as object) : [];

/** package.json を安全に解析する (壊れていたら null)。 */
export function parsePackageJson(raw: string): ParsedPackage | null {
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    o = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const engines: Record<string, string> = {};
  if (o.engines !== null && typeof o.engines === 'object') {
    for (const [k, v] of Object.entries(o.engines as Record<string, unknown>)) {
      if (typeof v === 'string') engines[k] = v;
    }
  }
  return {
    name: typeof o.name === 'string' ? o.name : '',
    version: typeof o.version === 'string' ? o.version : '',
    scripts: keysOf(o.scripts),
    dependencyCount: countKeys(o.dependencies),
    devDependencyCount: countKeys(o.devDependencies),
    engines,
  };
}

/** go.mod の `go 1.x` ディレクティブからバージョンを取り出す。 */
export function parseGoMod(raw: string): string | null {
  const m = raw.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/m);
  return m ? m[1]! : null;
}

/** .tool-versions (asdf) を {tool, version} 配列に解析する。 */
export function parseToolVersions(raw: string): DeclaredTool[] {
  const tools: DeclaredTool[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue; // 空行は下の length ガードで除外されるため別途判定しない
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    tools.push({ tool: parts[0]!, version: parts[1]!, source: '.tool-versions' });
  }
  return tools;
}

const REF_PREFIX = 'ref: ';
const HEADS_PREFIX = 'refs/heads/';

/**
 * .git/HEAD を解析して現在ブランチ / SHA を得る。
 *
 * 開発中の HEAD は通常シンボリック参照 (`ref: refs/heads/<branch>`)。detached HEAD
 * (生 SHA) や不正値は本連携の対象外として null を返す (文字列操作のみ・正規表現なし)。
 */
export function parseGitHead(raw: string, resolveRef: (ref: string) => string | null): GitInfo | null {
  const head = raw.trim();
  if (!head.startsWith(REF_PREFIX)) return null;
  const ref = head.slice(REF_PREFIX.length).trim();
  const branch = ref.startsWith(HEADS_PREFIX) ? ref.slice(HEADS_PREFIX.length) : ref;
  return { branch, sha: resolveRef(ref) ?? '' };
}

/** 宣言ツールチェーンを各ソースから組み立てる。 */
function buildToolchain(i: DevEnvInputs, pkg: ParsedPackage | null): DeclaredTool[] {
  const toolchain: DeclaredTool[] = [];
  if (i.nvmrc !== null) {
    const v = i.nvmrc.trim();
    if (v !== '') toolchain.push({ tool: 'node', version: v, source: '.nvmrc' });
  }
  if (pkg !== null) {
    if (pkg.engines.node !== undefined) {
      toolchain.push({ tool: 'node', version: pkg.engines.node, source: 'package.json engines' });
    }
    if (pkg.engines.npm !== undefined) {
      toolchain.push({ tool: 'npm', version: pkg.engines.npm, source: 'package.json engines' });
    }
  }
  if (i.goMod !== null) {
    const go = parseGoMod(i.goMod);
    if (go !== null) toolchain.push({ tool: 'go', version: go, source: 'go.mod' });
  }
  if (i.pythonVersion !== null) {
    const v = i.pythonVersion.trim();
    if (v !== '') toolchain.push({ tool: 'python', version: v, source: '.python-version' });
  }
  if (i.toolVersions !== null) {
    toolchain.push(...parseToolVersions(i.toolVersions));
  }
  return toolchain;
}

// 準備状況チェックの表示文言は表現。罠#2 に従い Stryker から除外する。
// Stryker disable all
function readinessChecks(i: DevEnvInputs): ReadinessCheck[] {
  return [
    {
      label: 'Node モジュール',
      ok: i.hasNodeModules,
      detail: i.hasNodeModules ? 'node_modules があります' : 'npm install が必要です',
    },
    {
      label: 'ロックファイル',
      ok: i.hasLockfile,
      detail: i.hasLockfile ? 'lockfile があります' : 'lockfile が見つかりません',
    },
    {
      label: 'Git リポジトリ',
      ok: i.hasGit,
      detail: i.hasGit ? '.git があります' : 'Git 管理されていません',
    },
  ];
}
// Stryker restore all

/** 生の入力から開発環境スナップショットを組み立てる (純粋・決定論的)。 */
export function buildDevEnv(i: DevEnvInputs): DevEnvSnapshot {
  // 条件を true 化する変異は等価: parsePackageJson(null) は JSON.parse('null')→null で
  // null を返すため、ガードを外して常に呼んでも結果は変わらない。
  // Stryker disable next-line ConditionalExpression
  const pkg = i.packageJson !== null ? parsePackageJson(i.packageJson) : null;
  const project: ProjectInfo | null =
    pkg === null
      ? null
      : {
          name: pkg.name,
          version: pkg.version,
          scripts: pkg.scripts,
          dependencyCount: pkg.dependencyCount,
          devDependencyCount: pkg.devDependencyCount,
        };
  const git = i.gitHead !== null ? parseGitHead(i.gitHead, i.resolveRef) : null;
  return {
    nodeVersion: i.nodeVersion,
    platform: i.platform,
    arch: i.arch,
    project,
    toolchain: buildToolchain(i, pkg),
    git,
    readiness: readinessChecks(i),
  };
}

// --- IO アダプタ (fs/process。サブプロセスは起動しない) -----------------------
//
// fs/process からの読み取りはランタイム依存のため、stryker.config.json の方針に従い
// mutation から除外する (整形ロジックは buildDevEnv 側で 100% カバー)。
// Stryker disable all
function readFileOrNull(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function existsSafe(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** プロジェクトディレクトリ (既定: process.cwd()) から開発環境を読み取る。 */
export function readDevEnv(cwd: string = process.cwd()): DevEnvSnapshot {
  const at = (rel: string) => path.join(cwd, rel);
  const hasLockfile =
    existsSafe(at('package-lock.json')) ||
    existsSafe(at('yarn.lock')) ||
    existsSafe(at('pnpm-lock.yaml'));
  return buildDevEnv({
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    packageJson: readFileOrNull(at('package.json')),
    nvmrc: readFileOrNull(at('.nvmrc')),
    goMod: readFileOrNull(at('go.mod')),
    pythonVersion: readFileOrNull(at('.python-version')),
    toolVersions: readFileOrNull(at('.tool-versions')),
    gitHead: readFileOrNull(at('.git/HEAD')),
    resolveRef: (ref) => {
      const raw = readFileOrNull(at(path.join('.git', ref)));
      return raw === null ? null : raw.trim();
    },
    hasNodeModules: existsSafe(at('node_modules')),
    hasLockfile,
    hasGit: existsSafe(at('.git')),
  });
}
// Stryker restore all
