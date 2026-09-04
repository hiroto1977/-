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

// `ok` の真偽は測る。`detail` の文言だけは表現なので測らない —
// 「npm install が必要です」を別の言い回しにしても間違いではない。
// 帯はこの関数だけに掛ける (ファイル全体を黙らせない)。
// Stryker disable StringLiteral
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
// Stryker restore StringLiteral

/** 生の入力から開発環境スナップショットを組み立てる (純粋・決定論的)。 */
export function buildDevEnv(i: DevEnvInputs): DevEnvSnapshot {
  // 条件を true 化する変異は等価: parsePackageJson(null) は JSON.parse('null')→null で
  // null を返すため、ガードを外して常に呼んでも結果は変わらない。
  // `parsePackageJson` は null を渡されても null を返す (`JSON.parse(null)` は
  // "null" と読まれて null になり、続くオブジェクト判定で弾かれる — 実測)。
  // つまりこの前置きは単独では観測できない。消さずに残すのは、解析側が将来
  // 変わったときに null がそのまま渡らないようにするため。
  // Stryker disable next-line ConditionalExpression: 解析側と重なる保険 (単独では観測不能)
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
// fs/process からの読み取り。以前はここを丸ごと変異検査から外していたが、
// 「どのファイルを読むか」はこの層が決めているので、一時ディレクトリを
// 作って実際に読ませる形で測る (`__tests__/devEnv.test.ts`)。
/**
 * symlink を辿った実体のパス。辿れなければ `null`。
 *
 * 封じ込めの判定を**実体**で行うために要る。`path.resolve` は字面の正規化
 * しかしないので、symlink はそのまま素通りする。
 */
function realpathOrNull(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

function readFileOrNull(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// `fs.existsSync` は仕様として例外を投げない (エラーは内部で握られ false に
// なる)。NUL 入りのパス・長すぎるパスでも false が返ることを実測で確かめた
// うえで try/catch を外した。到達しない catch を残すと、そこは何をしても
// 結果が変わらない — つまり測っても何も分からない場所になる。
function existsSafe(p: string): boolean {
  return fs.existsSync(p);
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
    /*
     * `ref` は **`.git/HEAD` の中身**から来る (`parseGitHead` が
     * `ref: refs/heads/main` の後半を切り出して渡す)。つまりディスク上の
     * ファイルの内容がそのままパスの一部になる。封じ込めが無いと
     *
     *     ref: ../../../../../../etc/passwd
     *
     * と書かれた `.git/HEAD` を置くだけで cwd の外を読み、その 1 行目が
     * コミット SHA として画面に出る (2026-08-22 の点検で発見)。
     *
     * 現状 `readDevEnv()` は引数なしでしか呼ばれず cwd はアプリ自身の作業
     * ディレクトリなので、悪用には「アプリを起動した場所に細工した `.git` を
     * 置く」ことが要る —— 遠隔から踏める経路ではない。それでも塞ぐのは、
     * これが不変条件 #10 (パス走査を含む名前を使わない) そのものの形であり、
     * 関門 1 つで済むため。
     *
     * 判定は `exportPaths.ts` と同じ形 —— 解決してから根の下かを見る
     * (悪い入力を数え上げるのではなく、行き先で判定する)。
     */
    resolveRef: (ref) => {
      /*
       * **`path.resolve` は symlink を辿らない。** `../` は閉じたが、
       * `.git/refs/heads/x` を外へ向けた symlink にすると
       * `startsWith` は通り、読み出しだけが根の外へ出る。実測 (2026-08-23):
       *
       *   関門の判定 (根の下か): true
       *   実際に読めた中身      : "SECRET-OUTSIDE-ROOT"   ← 根の外
       *
       * そこで **realpath で実体に直してからもう一度**判定する。
       * 根の側も realpath する —— 作業ディレクトリ自体が symlink 越しに
       * あると (`/tmp/link` → `/tmp/actual`)、実体だけを直したのでは
       * **正当な ref まで弾いてしまう**ため。両側を同じ土俵に乗せる。
       */
      const gitDir = realpathOrNull(path.resolve(at('.git')));
      // Stryker disable next-line ConditionalExpression: `resolveRef` は
      // `.git/HEAD` が読めたときにしか呼ばれない (`readDevEnv` の
      // `i.gitHead !== null` 判定) ので、ここで `.git` が消えているのは
      // 読み取りの合間に消された場合だけで、検査から到達できない。
      // 外すと `path.resolve(null, ref)` が TypeError になる (等価変異ではなく
      // **到達しない**枝である —— 消さずに残すのは、その競合で落とさないため)。
      if (gitDir === null) return null;
      const target = path.resolve(gitDir, ref);
      if (!target.startsWith(gitDir + path.sep)) return null;
      const real = realpathOrNull(target);
      if (real === null || !real.startsWith(gitDir + path.sep)) return null;
      const raw = readFileOrNull(real);
      return raw === null ? null : raw.trim();
    },
    hasNodeModules: existsSafe(at('node_modules')),
    hasLockfile,
    hasGit: existsSafe(at('.git')),
  });
}
