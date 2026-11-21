/**
 * 版とハッシュで固定した PyPI の一覧 (requirements.txt) の読み手。
 *
 * 読み手は 1 つだけ持つ —— 毎日の脅威ウォッチ (`threat-watch.cjs` が OSV へ引く在庫) と、
 * 供給網の門 (`lint-dependencies.cjs` の規則 12) が同じ関数を通る。別々に読むと、
 * 門が通した行を脅威ウォッチが読み落とす (またはその逆) 形が開く。
 *
 * 受ける行は 3 種類だけ:
 *   `名前==版 [; 条件] \`          … 固定した 1 件
 *   `--hash=sha256:<64 桁> [\]`     … 直前の 1 件のハッシュ
 *   `# …` と空行                    … 注記
 * それ以外 (版の範囲・URL・`-r` / `-e`・取得元を替える `--index-url` ほか) は problems に入る。
 */
'use strict';

/** 追跡している PyPI の一覧。増えたらここへ足す (`lint:deps` が追跡している実物と両方向に突き合わせる)。 */
const PYPI_LOCKS = ['zero-trust-gateway/requirements.txt'];

/** この名前のファイルが追跡されていたら、PyPI の依存の定義として扱う (`language-coverage.cjs` と同じ一覧)。 */
const PYPI_MANIFEST_NAMES = ['requirements.txt', 'Pipfile.lock', 'poetry.lock', 'pyproject.toml', 'uv.lock'];

const REQUIREMENT_RE = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([A-Za-z0-9][A-Za-z0-9.!+_-]*)(?: ?;[^\\]*)?(?: \\)?$/;
const HASH_RE = /^--hash=sha256:[0-9a-f]{64}(?: \\)?$/;

/** PyPI の名前の正規化 (PEP 503): 小文字にして、`.` `_` `-` の並びを `-` 1 つへ。 */
const pypiName = (name) => name.toLowerCase().replace(/[._-]+/g, '-');

/**
 * @returns {{ entries: { name: string, version: string, hashes: number, line: number }[], problems: string[] }}
 */
function parsePinnedRequirements(text) {
  if (typeof text !== 'string') return { entries: [], problems: ['読めません (文字列ではない)'] };
  const entries = [];
  const problems = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    if (HASH_RE.test(line)) {
      if (entries.length === 0) problems.push(`${i + 1} 行目: どの依存にも付かないハッシュ`);
      else entries[entries.length - 1].hashes += 1;
      continue;
    }
    const m = REQUIREMENT_RE.exec(line);
    if (m === null) {
      problems.push(`${i + 1} 行目: 「名前==版」でも「--hash=sha256:…」でもない行 (${line.slice(0, 60)})`);
      continue;
    }
    entries.push({ name: pypiName(m[1]), version: m[2], hashes: 0, line: i + 1 });
  }
  for (const e of entries) {
    if (e.hashes === 0) problems.push(`${e.line} 行目: ${e.name}==${e.version} にハッシュがありません`);
  }
  if (entries.length === 0 && problems.length === 0) problems.push('固定した依存が 1 件もありません');
  return { entries, problems };
}

/** 追跡しているファイルの一覧から、PyPI の依存の定義を拾う。 */
function trackedPypiManifests(files) {
  return files.filter((f) => PYPI_MANIFEST_NAMES.includes(f.slice(f.lastIndexOf('/') + 1))).sort();
}

/** 規則 12 の片側: 追跡している定義と台帳 (`PYPI_LOCKS`) の両方向の突き合わせ。 */
function checkPypiLedger(tracked, ledger = PYPI_LOCKS) {
  const problems = [];
  for (const f of tracked) {
    if (!ledger.includes(f)) {
      problems.push(`${f}: PyPI の依存の定義が追跡されているのに、PYPI_LOCKS (scripts/lib/pypi-locks.cjs) に無い —— 毎日の脅威ウォッチがこの一覧を照会しない`);
    }
  }
  for (const f of ledger) {
    if (!tracked.includes(f)) problems.push(`${f}: PYPI_LOCKS に在るのに追跡されていない (古い台帳)`);
  }
  return problems;
}

module.exports = {
  PYPI_LOCKS,
  PYPI_MANIFEST_NAMES,
  parsePinnedRequirements,
  trackedPypiManifests,
  checkPypiLedger,
  pypiName,
};
