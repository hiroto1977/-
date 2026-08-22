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

/** `rel` が `outDir` の中に収まるなら絶対パス、外へ出るなら null。 */
function resolveInside(outDir, rel) {
  if (typeof rel !== 'string' || rel.length === 0) return null;
  if (rel.includes(String.fromCharCode(0))) return null;
  const root = path.resolve(outDir);
  const full = path.resolve(root, rel);
  // `+ path.sep` が要る。無いと `vault-evil/` が `vault` の前方一致で通る。
  return full.startsWith(root + path.sep) ? full : null;
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
  let bad = 0;
  for (const [label, rel, expected] of cases) {
    const got = resolveInside(root, rel) !== null;
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got ? '中' : '外'} (期待 ${expected ? '中' : '外'})`);
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
