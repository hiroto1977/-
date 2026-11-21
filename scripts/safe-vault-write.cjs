/**
 * safe-vault-write — データ由来の名前でファイルを書くときの、唯一の関門。
 *
 * 知識ベースの書き出しは、ノート名を**データから**組み立てる:
 *
 *   files[path.join('notes', e.collection, e.category, `${e.id}.md`)] = …
 *
 * `e.id` / `e.collection` / `e.category` は知識データセットの値で、slug 化を
 * 通っていない。`..` が 1 つ混ざると `path.join` がそれを解決し、
 * **`knowledge-vault/` の外へ書く** (書き出しは `mkdirSync(recursive)` 付きなので
 * 途中のディレクトリも作られる)。2026-08-22 に実測して確認した:
 *
 *   path.join(VAULT, 'notes/academic/econ/../../../../tmp/pwned.md')
 *     → /home/user/-/tmp/pwned.md
 *
 * 攻撃者の入力ではない (データセットはリポジトリ内の TypeScript) が、
 * **打ち間違いが静かに外を壊す**形である。しかも `vault:check` は「vault の
 * 中身が本体データと一致するか」を見るので、外へ出たファイルは「足りない
 * ファイル」としてしか現れず、原因に辿り着けない。
 *
 * 書き出し側 (`clients/exportPaths.ts`) と開く側 (`main/shellOpenGate.ts`) は
 * 既に同じ形の関門を持っている。データ由来の書き出しにだけ無かった。
 */
const fs = require('node:fs');
const path = require('node:path');

/**
 * まだ存在しない書き出し先の**実体**を見るために、いちばん深い「実在する祖先」を
 * realpath する。`fs.realpathSync` は存在しないパスで投げるので上へ辿るが、
 * **`root` より上へは行かない**。
 *
 * 上限が要る理由: 根がまだ無いとき (初回のビルド・self-test の合成) に上限が
 * 無いと `/tmp` のような**根の外**まで登り、それを根と比べて「外だ」と判定して
 * しまう。最初にそう書いて、既存の self-test が 2 件で捕まえた ——
 * **正当なノート 7,543 件を全部拒否していた。**
 *
 * @returns 実在する祖先の実体パス。根まで何も実在しなければ `null`
 *          (= 辿るべき symlink が無い = 字面の閉じ込めで足りる)。
 */
function realAncestorWithin(root, p) {
  let cur = path.resolve(p);
  for (;;) {
    try {
      return fs.realpathSync(cur);
    } catch {
      if (cur === root) return null;
      const parent = path.dirname(cur);
      if (parent === cur) return null;
      cur = parent;
    }
  }
}

/**
 * `rel` が `outDir` の中に収まるなら絶対パス、外へ出るなら null。
 *
 * **字面だけでは足りない。** `path.resolve` は `..` を畳むが **symlink は
 * 辿らない**。2026-08-27 の実測:
 *
 * ```
 *   knowledge-vault/link -> /tmp/outside   を置いてから
 *   writeFilesInto(vault, { 'link/escaped.md': '# pwned' })
 *     → 例外なし。/tmp/outside/escaped.md が出来る (根の外)
 * ```
 *
 * このファイルの冒頭は「書き出し側 (`clients/exportPaths.ts`) と開く側
 * (`main/shellOpenGate.ts`) は既に同じ形の関門を持っている」と書いている。
 * その 2 つは realpath を通しており、**ここだけが字面のままだった**
 * (同じ形を 2026-08-26/27 に `exportPaths` と `knowledge-context` でも直した ——
 * **3 か所目**)。
 */
function resolveInside(outDir, rel) {
  if (typeof rel !== 'string' || rel.length === 0) return null;
  if (rel.includes(String.fromCharCode(0))) return null;
  const root = path.resolve(outDir);
  const full = path.resolve(root, rel);
  // `+ path.sep` が要る。無いと `vault-evil/` が `vault` の前方一致で通る。
  if (!full.startsWith(root + path.sep)) return null;

  // 実体で見る。根がまだ無ければ辿る先も無いので字面のまま比べる。
  let realRoot;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    realRoot = root;
  }
  const realDir = realAncestorWithin(root, path.dirname(full));
  if (realDir !== null && realDir !== realRoot && !realDir.startsWith(realRoot + path.sep)) {
    return null;
  }

  // 既存の symlink を上書きすると、その指す先へ書いてしまう。
  try {
    if (fs.lstatSync(full).isSymbolicLink()) return null;
  } catch {
    /* まだ無い = 新規作成。よい。 */
  }
  return full;
}

/**
 * 収まらないものが 1 つでもあれば落とす。**書き出しにも、削除にも先立って**
 * 呼べるように分けてある — 呼び出し側が「消してから書く」形のとき、
 * 確認を消す前に済ませないと、名前がおかしいだけで既存の中身を失う。
 */
function assertAllInside(outDir, files) {
  const escapes = [];
  for (const rel of Object.keys(files)) {
    if (resolveInside(outDir, rel) === null) escapes.push(rel);
  }
  if (escapes.length > 0) {
    throw new Error(
      `書き出し先の外を指すノート名が ${escapes.length} 件あります ` +
        `(id / collection / category に ".." や制御文字が混ざっていないか確認してください):\n` +
        escapes.slice(0, 10).map((r) => `  - ${JSON.stringify(r)}`).join('\n'),
    );
  }
}

/** 確かめてから書く。 */
function writeFilesInto(outDir, files) {
  assertAllInside(outDir, files);
  for (const [rel, content] of Object.entries(files)) {
    const full = resolveInside(outDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

/** 陰性対照 — この関門が本当に鳴るか。 */
function selfTest() {
  const root = path.join(require('node:os').tmpdir(), 'vault-selftest');
  fs.rmSync(root, { recursive: true, force: true });
  const NUL = String.fromCharCode(0);
  const cases = [
    ['普通のノート', 'notes/academic/econ/foo.md', true],
    ['入れ子でもよい', 'a/b/c/d/e.md', true],
    ['id に .. が混ざると外へ出る', 'notes/academic/econ/../../../../tmp/pwned.md', false],
    ['collection に .. が混ざる', 'notes/../../x/y.md', false],
    ['先頭が ..', '../escaped.md', false],
    ['前方一致する兄弟は通さない', '../vault-selftest-evil/x.md', false],
    ['空文字は通さない', '', false],
    ['NUL を含むものは通さない', 'notes/a' + NUL + 'b.md', false],
    ['絶対パスは根の下へは畳まれない (外)', '/etc/passwd', false],
  ];

  /*
   * symlink —— 字面の検査では見えない。2026-08-27 の実測で、根の中に
   * 外を指す link を置くと `writeFilesInto` が**根の外へ実際に書いた**。
   * 合成の根を実際に作って確かめる (字面だけの標本では届かない)。
   */
  const linkCases = [];
  {
    const outside = path.join(require('node:os').tmpdir(), 'vault-selftest-outside');
    fs.rmSync(outside, { recursive: true, force: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.mkdirSync(path.join(root, 'real'), { recursive: true });
    fs.symlinkSync(outside, path.join(root, 'link'));
    fs.writeFileSync(path.join(outside, 'victim.md'), 'original', 'utf8');
    fs.symlinkSync(path.join(outside, 'victim.md'), path.join(root, 'alias.md'));
    linkCases.push(
      ['★ 根の中の symlink を経由して外へは書けない', 'link/escaped.md', false],
      ['★ 書き出し先そのものが symlink なら通さない', 'alias.md', false],
      ['陰性: 実在するディレクトリの中へは書ける', 'real/ok.md', true],
      ['陰性: まだ無いディレクトリの中へも書ける', 'brand/new/ok.md', true],
    );
  }
  cases.push(...linkCases);

  let bad = 0;
  for (const [label, rel, expected] of cases) {
    const got = resolveInside(root, rel) !== null;
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got ? '中' : '外'} (期待 ${expected ? '中' : '外'})`);
  }

  /*
   * **根がまだ無いとき。** 初回のビルドはこれである。
   *
   * `realAncestorWithin` に上限が無いと、実在する祖先を探して根の外
   * (`/tmp` など) まで登り、それを根と比べて「外だ」と判定する ——
   * 2026-08-27 に最初そう書いて、**正当なノート 7,543 件を全部拒否した**。
   * 上の symlink 標本は根を実在させるので、この道を通らない。別に置く。
   */
  {
    const freshRoot = path.join(require('node:os').tmpdir(), `vault-selftest-fresh-${process.pid}`);
    fs.rmSync(freshRoot, { recursive: true, force: true });
    const got = resolveInside(freshRoot, 'notes/a/b.md');
    const ok = got !== null;
    if (!ok) bad += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} ★ 根がまだ無くても中と判定する (初回ビルド): ${ok ? '中' : '外'} (期待 中)`,
    );
  }
  let threw = false;
  try {
    writeFilesInto(root, { 'ok.md': 'x', '../escaped.md': 'y' });
  } catch {
    threw = true;
  }
  const notWritten = !fs.existsSync(path.join(root, 'ok.md'));
  const ok = threw && notWritten;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} 1 件でも外を指したら何も書かない: throw=${threw} / 未書き込み=${notWritten}`);
  fs.rmSync(root, { recursive: true, force: true });
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

module.exports = { resolveInside, assertAllInside, writeFilesInto, selfTest };

if (require.main === module) process.exit(selfTest());
