'use strict';

/*
 * 成果物の鮮度検査 — **古い物を相手に「検査したつもり」になるのを防ぐ**。
 *
 * `npm run build:web` は `tsc -b && vite build && …` なので、型検査で落ちると
 * **成果物は作られないまま**その場で止まる。それに気づかず検証の道具を回すと、
 * **前回の (壊す前の) 成果物**を相手に全項目が通る。
 *
 * 2026-08-24 に実際に 2 回踏んだ —— クリックジャッキング拒否を外したつもりで
 * 「まだ効いています」という緑を 2 度受け取った。どちらも `TS6133` (未使用変数)
 * でビルドが止まっており、出力を握り潰していたので気づけなかった。
 *
 * 「検査したつもり」がいちばん危ない。壊れていないことを確かめたのではなく、
 * **壊す前のものを見ていた**うえ、出力は完全に正常で区別が付かない。
 *
 * 成果物を相手にする道具は 8 つある (`e2e` (= `e2e:lite`) / `e2e:ollama` / `perf` /
 * `smoke` / `smoke:app` / `exp:overflow` / `exp:runtime` / `exp:soak`)。**判定はここ 1 つ**に
 * 置く —— 8 か所へ書き写すと、比べているのが写しになる。母集団は `artifactFreshness.test.ts` が
 * package.json の `e2e*` / `perf*` / `smoke*` / `exp*` から導く (2026-09-17 パス 304 まで検査は
 * 3 本を手で並べており、`e2e:ollama` と `smoke:app` が鮮度を見ていないことに誰も気づかなかった。
 * パス 305 で exp:* 3 本 —— 実験と呼ばれるが結論は同じく成果物から出る —— を母集団に足した)。
 *
 * ## 材料は src/ だけではなかった (2026-09-17 · パス 302)
 *
 * この判定は 2026-09-17 まで **`src/` の ts / tsx / css / html** しか見ていなかった。
 * だが成果物を決める材料はその外にも在る:
 *
 *   - `scripts/inline-html.cjs`   dist/index.html → standalone.html を組む側 (**CSP を含む**)
 *   - `vite.config.ts`            束ね方そのもの (LITE の切り分け・遅延読み込みの差し込み)
 *   - `tsconfig*.json`            `tsc -b` の入力
 *   - `package.json` / lockfile   束に入る依存の版
 *   - 束に入る JSON で src/ の外に在る物 (実測 1 件: `orchestration/registry.json`。
 *     3 つの画面が import している)
 *
 * 実測 (2026-09-17): `scripts/inline-html.cjs` と `orchestration/registry.json` を
 * dist より新しくして `npm run perf` を回すと **exit 0 で緑**だった。これは
 * この判定の冒頭が名指ししている形そのもの —— 「壊す前のものを見ていた」——
 * で、`build:web` の 3 段目 (`node scripts/inline-html.cjs`) が落ちても
 * `tsc -b && vite build` が通る限り、前回の standalone.html が残って全項目が通る。
 *
 * 材料の台帳は `BUILD_MATERIALS` (src/ の外の固定の物) と、束に入る JSON の
 * **実物の走査** (`lint-sample-data.cjs` の `bundledJsonImports` を借りる。
 * 一覧を手で書くと増えたときに黙る) で持つ。台帳と package.json の
 * ビルド連鎖・tsconfig の実在は `shared/__tests__/artifactFreshness.test.ts` が
 * 両方向に突き合わせる。
 *
 * **docs/ と __tests__/ は材料ではない** —— 文書や検査だけ直したときに
 * 再ビルドを要求すると、要求そのものが無視されるようになる。
 */

const fs = require('node:fs');
const path = require('node:path');

/** 束に入る拡張子。ここに無いものを触っても再ビルドは要らない (json はパス 302 で足した)。 */
const BUNDLED_EXT = /\.(tsx?|css|html|json)$/;

/**
 * 束の材料のうち **src/ の外**に在る固定の物 (repoRoot 相対)。
 * 無いファイルは無視する (仮の repo で回す検査のため)。
 * 増やすときは `artifactFreshness.test.ts` の台帳の突き合わせも読むこと。
 */
const BUILD_MATERIALS = Object.freeze([
  'vite.config.ts',
  'scripts/inline-html.cjs',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'package.json',
  'package-lock.json',
]);

/**
 * src/ が import している JSON のうち src/ の外に在る物 (repoRoot 相対)。
 * 走査は `lint-sample-data.cjs` の物を借りる —— 同じ問いに走査を 2 つ書かない。
 */
function bundledJsonOutsideSrc(srcDir, repoRoot) {
  const { bundledJsonImports } = require('../lint-sample-data.cjs');
  const srcRel = path.relative(repoRoot, srcDir).split(path.sep).join('/');
  return bundledJsonImports(srcDir, repoRoot)
    .map((rel) => rel.split(path.sep).join('/'))
    .filter((rel) => !(rel === srcRel || rel.startsWith(srcRel + '/')));
}
/** 走査から外す名前。`__tests__` は束に入らないので、検査だけ直したときに止めない。 */
const SKIP_DIRS = new Set(['__tests__', 'node_modules']);

/** `dir` 以下で束に入るファイルのうち最も新しい物。無ければ `{ mtimeMs: 0, file: null }`。 */
function newestSourceEntry(dir) {
  if (!fs.existsSync(dir)) return { mtimeMs: 0, file: null };
  let newest = { mtimeMs: 0, file: null };
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const inner = newestSourceEntry(full);
      if (inner.mtimeMs > newest.mtimeMs) newest = inner;
    } else if (BUNDLED_EXT.test(e.name)) {
      const m = fs.statSync(full).mtimeMs;
      if (m > newest.mtimeMs) newest = { mtimeMs: m, file: full };
    }
  }
  return newest;
}

/** `dir` 以下で束に入るファイルの最終更新時刻 (ms)。無ければ 0。 */
function newestSourceMtime(dir) {
  return newestSourceEntry(dir).mtimeMs;
}

/**
 * 材料全体 (src/ + `BUILD_MATERIALS` + src/ の外の束に入る JSON) で最も新しい物。
 * `repoRoot` を渡さなければ src/ だけを見る (旧来の呼び方)。
 * 返す `file` は repoRoot 相対 (無ければ絶対パス)。
 */
function newestMaterial(srcDir, repoRoot) {
  const src = newestSourceEntry(srcDir);
  const rel = (abs) => (repoRoot ? path.relative(repoRoot, abs).split(path.sep).join('/') : abs);
  let best = { mtimeMs: src.mtimeMs, file: src.file === null ? null : rel(src.file) };
  if (!repoRoot) return best;
  const extra = [...BUILD_MATERIALS, ...bundledJsonOutsideSrc(srcDir, repoRoot)];
  for (const r of extra) {
    const abs = path.join(repoRoot, r);
    if (!fs.existsSync(abs)) continue;
    const m = fs.statSync(abs).mtimeMs;
    if (m > best.mtimeMs) best = { mtimeMs: m, file: r };
  }
  return best;
}

/**
 * 古い成果物があれば理由を返す。無ければ null。
 *
 * @param {readonly string[]} artifacts 検証対象 (絶対パス)。存在しないものは無視する
 *   —— 「無い」は各道具が自前の文言で先に扱っているため。
 * @param {string} srcDir 束の材料が入っている場所。
 * @param {string} [repoRoot] 渡せば src/ の外の材料 (`BUILD_MATERIALS`・束に入る JSON) も見る。
 */
function staleArtifacts(artifacts, srcDir, repoRoot) {
  const newest = newestMaterial(srcDir, repoRoot);
  if (newest.mtimeMs === 0) return [];
  const stale = [];
  for (const f of artifacts) {
    if (!fs.existsSync(f)) continue;
    const built = fs.statSync(f).mtimeMs;
    if (newest.mtimeMs > built) {
      stale.push({ file: f, lagSec: Math.round((newest.mtimeMs - built) / 1000), newest: newest.file });
    }
  }
  return stale;
}

/**
 * 古ければ説明して `exit 2`。`allowEnv` が '1' なら注意書きだけ出して続行する。
 *
 * @param {readonly string[]} artifacts 絶対パス。
 * @param {{ srcDir: string, repoRoot: string, tool: string, allowEnv: string }} opts
 */
function assertFreshArtifacts(artifacts, opts) {
  const stale = staleArtifacts(artifacts, opts.srcDir, opts.repoRoot);
  if (stale.length === 0) return;
  const rel = (f) => path.relative(opts.repoRoot, f);
  console.error(
    `${opts.tool}: 成果物が材料より古い (一番新しい材料: ${stale[0].newest ?? '?'}) —\n` +
      stale.map((s) => `     ${rel(s.file)} (${s.lagSec} 秒古い)`).join('\n') +
      '\n     ビルドが失敗したまま古い成果物を検証しようとしています —' +
      '\n     そのまま流すと「壊したのに緑」を受け取ります。' +
      '\n     先に npm run build:web (必要なら build:web:lite) を通してください。' +
      `\n     意図して古い成果物を見るなら ${opts.allowEnv}=1 を付けてください。`,
  );
  if (process.env[opts.allowEnv] !== '1') process.exit(2);
  console.error(`     (${opts.allowEnv}=1 のため続行します)`);
}

module.exports = {
  newestSourceMtime,
  newestSourceEntry,
  newestMaterial,
  bundledJsonOutsideSrc,
  staleArtifacts,
  assertFreshArtifacts,
  BUNDLED_EXT,
  BUILD_MATERIALS,
};
