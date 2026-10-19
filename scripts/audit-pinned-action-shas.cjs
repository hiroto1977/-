#!/usr/bin/env node
/**
 * **SHA 固定の 40 桁が、実在の commit で、注記の版と同じ物かを実測する定期点検の道具**
 * (`npm run audit:pinned-action-shas` · 2026-10-19 · パス 534 · threat: T-124)。
 *
 * `lint:workflow-security` が見られるのは**形**までである: 40 桁の 16 進で終わること・
 * `# v5` のような版の注記が付いていること。ところが形は誰でも整えられる —— 打ち間違えた SHA や、
 * 作り話の SHA に `# v5` を付けても門は緑のまま通る (パス 530 の docblock が「実在の確認は
 * ネットワークが要る」と名指しして残した穴)。実在の確認は `git ls-remote` が要るので、CI の
 * 決定的な門にはできない (落ちる理由が「網の不調」になり、PR を無関係に赤くする)。だから
 * `audit:floors` / `audit:regex-poly` と同じ**手で回す点検**にする。CI では走らせない。
 *
 * 判定 (1 つの固定 = リポジトリ・SHA・注記の版):
 *   - `match`    注記のタグが指す commit (annotated tag は peel した先) が SHA と一致する。
 *   - `moved`    タグは在るが今は別の commit を指す。**major タグ (`v5`) は動く参照**なので
 *                珍しくない —— SHA がそのリポジトリに実在 (`git fetch` が通る) なら古びた固定
 *                (警告・exit 0)、実在しなければ作り話か打ち間違い (落とす)。
 *   - `no-tag`   注記のタグがそのリポジトリに無い (落とす)。
 *   - `missing`  タグは動いていて、しかも SHA が実在しない (落とす)。
 *   網が使えず判定できないときは**緑にしない** (exit 2 · 「測れなかった」)。
 *
 * 子プロセスは `git` だけで、引数はリポジトリ名 (`owner/repo`)・タグ・SHA を**厳しい正規表現で
 * 通したあと**に固定の形へ組む (workflow の文字列が引数の先頭に `-` を持ち込めない)。
 * シェルは経由しない (`spawnSync` に配列で渡す)。
 *
 *   node scripts/audit-pinned-action-shas.cjs            # 実物の .github を測る
 *   node scripts/audit-pinned-action-shas.cjs --self-test
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const GITHUB_DIR = path.join(ROOT, '.github');

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG_RE = /^v?\d[\w.-]*$/;
const SHA_RE = /^[0-9a-f]{40}$/;
// `uses: owner/repo[/sub/path]@<40 桁> # v5` —— サブパス (`github/codeql-action/analyze`) は repo の外へ落とす。
const PIN_RE = /^\s*-?\s*uses:\s*([\w.-]+\/[\w.-]+)(?:\/[^\s@]*)?@([0-9a-f]{40})\s*#\s*(\S+)/;

function walkYaml(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkYaml(p));
    else if (/\.ya?ml$/.test(e.name)) out.push(p);
  }
  return out;
}

/** `[{file, text}]` から固定を集める。版の注記が無い SHA 固定は `tag: null` (門の別の規則が既に断る)。 */
function collectPins(files) {
  const pins = [];
  for (const { file, text } of files) {
    text.split('\n').forEach((line, i) => {
      const bare = /^\s*-?\s*uses:\s*([\w.-]+\/[\w.-]+)(?:\/[^\s@]*)?@([0-9a-f]{40})/.exec(line);
      if (!bare) return;
      const m = PIN_RE.exec(line);
      pins.push({ file, line: i + 1, repo: bare[1], sha: bare[2], tag: m ? m[3] : null });
    });
  }
  return pins;
}

/** 判定の核。`remote` は注入できる継ぎ目 (`tagShas(repo, tag)` / `commitExists(repo, sha)`)。 */
function judge(pin, remote) {
  if (!REPO_RE.test(pin.repo) || !SHA_RE.test(pin.sha)) return { status: 'invalid', why: '形が不正' };
  if (pin.tag === null || !TAG_RE.test(pin.tag)) {
    return { status: 'no-comment', why: '版の注記が無い / 読めない (lint:workflow-security が断る形)' };
  }
  const shas = remote.tagShas(pin.repo, pin.tag);
  if (shas === null) return { status: 'unreachable', why: 'git ls-remote が使えなかった' };
  if (shas.length === 0) return { status: 'no-tag', why: `${pin.repo} にタグ ${pin.tag} が無い` };
  if (shas.includes(pin.sha)) return { status: 'match', why: '' };
  const exists = remote.commitExists(pin.repo, pin.sha);
  if (exists === null) return { status: 'unreachable', why: 'git fetch が使えなかった' };
  return exists
    ? { status: 'moved', why: `タグ ${pin.tag} は今 ${shas[shas.length - 1].slice(0, 12)} を指す (固定は古い版)` }
    : { status: 'missing', why: `SHA が ${pin.repo} に実在しない (作り話か打ち間違い)` };
}

const FAILING = new Set(['no-tag', 'missing', 'invalid']);

/** 集計。落とすのは作り話の疑い (`no-tag` / `missing` / `invalid`)。`unreachable` は緑にしない。 */
function summarize(results) {
  const by = {};
  for (const r of results) by[r.status] = (by[r.status] ?? 0) + 1;
  const failing = results.filter((r) => FAILING.has(r.status));
  const unreachable = results.filter((r) => r.status === 'unreachable');
  return { by, failing, unreachable, code: failing.length ? 1 : unreachable.length ? 2 : 0 };
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    ...opts,
  });
  return r;
}

/** 本物の継ぎ目。`ls-remote` は tag と peel 先 (`^{}`) の両方を引く (annotated tag の commit は後者)。 */
function realRemote() {
  const lsCache = new Map();
  const exCache = new Map();
  return {
    tagShas(repo, tag) {
      const key = `${repo}@${tag}`;
      if (lsCache.has(key)) return lsCache.get(key);
      const r = git(['ls-remote', `https://github.com/${repo}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
      const v = r.status === 0 ? r.stdout.split('\n').filter(Boolean).map((l) => l.split('\t')[0]) : null;
      lsCache.set(key, v);
      return v;
    },
    commitExists(repo, sha) {
      const key = `${repo}@${sha}`;
      if (exCache.has(key)) return exCache.get(key);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinned-sha-'));
      try {
        if (git(['init', '-q', dir]).status !== 0) return null;
        const r = git(['-C', dir, 'fetch', '-q', '--depth=1', `https://github.com/${repo}.git`, sha]);
        // 「そのコミットは無い」(upload-pack: not our ref) と「網が使えない」を分ける。
        const v = r.status === 0 ? true : /not our ref|couldn't find remote ref|unadvertised object/i.test(r.stderr) ? false : null;
        exCache.set(key, v);
        return v;
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

function readRepoFiles() {
  return walkYaml(GITHUB_DIR).map((p) => ({ file: path.relative(ROOT, p), text: fs.readFileSync(p, 'utf8') }));
}

function selfTest() {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  const fake = (tags, commits) => ({
    tagShas: (repo, tag) => (Object.hasOwn(tags, `${repo}@${tag}`) ? tags[`${repo}@${tag}`] : []),
    commitExists: (repo, sha) => (Object.hasOwn(commits, `${repo}@${sha}`) ? commits[`${repo}@${sha}`] : false),
  });
  const pin = (over = {}) => ({ file: 'x.yml', line: 1, repo: 'o/r', sha: A, tag: 'v5', ...over });
  const cases = [
    ['タグが SHA を指す → match', judge(pin(), fake({ 'o/r@v5': [A] }, {})).status, 'match'],
    ['annotated tag は peel 先と照合する → match', judge(pin(), fake({ 'o/r@v5': [B, A] }, {})).status, 'match'],
    ['タグが別の commit・SHA は実在 → moved (警告)', judge(pin(), fake({ 'o/r@v5': [B] }, { [`o/r@${A}`]: true })).status, 'moved'],
    ['タグが別の commit・SHA が実在しない → missing (落とす)', judge(pin(), fake({ 'o/r@v5': [B] }, {})).status, 'missing'],
    ['タグが無い → no-tag (落とす)', judge(pin(), fake({}, {})).status, 'no-tag'],
    ['網が使えない (ls-remote) → unreachable (緑にしない)', judge(pin(), { tagShas: () => null, commitExists: () => true }).status, 'unreachable'],
    ['網が使えない (fetch) → unreachable', judge(pin(), { tagShas: () => [B], commitExists: () => null }).status, 'unreachable'],
    ['版の注記が無い → no-comment', judge(pin({ tag: null }), fake({}, {})).status, 'no-comment'],
    ['先頭が - のタグは引数に載せず断る', judge(pin({ tag: '-v5' }), fake({}, {})).status, 'no-comment'],
    ['不正な repo は断る', judge(pin({ repo: '--upload-pack=x/y' }), fake({}, {})).status, 'invalid'],
    ['集計: no-tag があれば exit 1', summarize([{ status: 'match' }, { status: 'no-tag' }]).code, 1],
    ['集計: unreachable だけなら exit 2 (緑にしない)', summarize([{ status: 'match' }, { status: 'unreachable' }]).code, 2],
    ['集計: moved だけなら exit 0 (警告)', summarize([{ status: 'match' }, { status: 'moved' }]).code, 0],
    [
      '集計: 落とす物と届かない物があれば落とす側が先',
      summarize([{ status: 'unreachable' }, { status: 'missing' }]).code,
      1,
    ],
  ];
  // 収集の針: サブパス・注記の有無・コメント行。
  const files = [
    {
      file: 'w.yml',
      text: [
        `      - uses: actions/checkout@${A} # v5`,
        `      - uses: github/codeql-action/analyze@${B} # v3.1.0`,
        `      - uses: evil/x@${A}`,
        `      # - uses: ignored/commented@${A} # v1`,
        '      - uses: actions/setup-node@v4',
      ].join('\n'),
    },
  ];
  const got = collectPins(files);
  cases.push(['収集: 固定は 3 件 (コメント行・タグ参照は除く)', got.length, 3]);
  cases.push(['収集: サブパスは repo の外へ落とす', got[1].repo, 'github/codeql-action']);
  cases.push(['収集: 注記の無い固定は tag null', got[2].tag, null]);
  let bad = 0;
  for (const [label, actual, expected] of cases) {
    const ok = actual === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : ` (実 ${String(actual)} / 期待 ${String(expected)})`}`);
  }
  if (bad) {
    console.error(`❌ self-test ${bad} 件不一致`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const pins = collectPins(readRepoFiles());
  if (pins.length === 0) {
    console.error('❌ SHA 固定が 1 件も読めなかった (走査が死んでいる)');
    return 1;
  }
  const remote = realRemote();
  const results = pins.map((p) => ({ ...p, ...judge(p, remote) }));
  for (const r of results.filter((x) => x.status !== 'match')) {
    console.log(`  ${r.status.padEnd(11)} ${r.file}:${r.line} ${r.repo}@${r.sha.slice(0, 12)} # ${r.tag ?? '(注記なし)'} — ${r.why}`);
  }
  const s = summarize(results);
  const kinds = new Set(results.map((r) => `${r.repo}@${r.sha}`)).size;
  console.log(
    `固定 ${pins.length} か所 (${kinds} 種類): ` +
      Object.entries(s.by).map(([k, n]) => `${k} ${n}`).join(' / '),
  );
  if (s.code === 1) console.error('❌ 実在しない SHA / タグ、または不正な固定が在る (上の行)');
  else if (s.code === 2) console.error('⚠️ 網が使えず測れなかった固定が在る (緑にはしない)');
  else {
    console.log('✅ すべての固定が実在します');
    if (s.by.moved) console.log(`⚠️ 注記のタグが今は別の commit を指す古い固定が ${s.by.moved} 件 (落とさない · 上げるかは別の判断)`);
  }
  return s.code;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { collectPins, judge, summarize, PIN_RE, FAILING };
