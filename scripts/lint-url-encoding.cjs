#!/usr/bin/env node
/**
 * lint:url-encoding — 不変条件 #6 の機械化。
 *
 * ARCHITECTURE.md §8.1 は
 *
 *   #6 fetcher / action の URL path 動的部分は `encodeURIComponent`
 *
 * を「PR で違反したら fail」の不変条件として挙げているが、2026-08-22 の
 * 点検時点で**これを見ているゲートは 1 つも無かった**。回帰テスト欄には
 * `github.test.ts`, `wordpress.test.ts`, … と個々のクライアントの検査が
 * 並んでいるだけで、つまり「書いた本人が自分の分だけ検査する」形。
 * 新しいクライアントで忘れたら、忘れた人の検査も一緒に無いので誰も気づかない。
 *
 * `lint:network-targets` は**ホスト**だけを見ており、冒頭に
 * 「パスは encodeURIComponent の話で、別の関心事」と明記してある。
 * 台帳を混ぜると本当に危ない送り先が埋もれるので、別のゲートにする。
 *
 * ## 何を見るか
 *
 * 通信呼び出し (`jsonFetch` / `apiFetch` / `transport` / `fetch` …) に渡る
 * URL テンプレートリテラルのうち、**authority より後ろ**に生の `${…}` が
 * あるものを落とす。authority 自体はホストの話なので見ない。
 *
 * 通す形:
 *   - `${encodeURIComponent(x)}`            — その場で包む
 *   - `const x = encodeURIComponent(y)` の `x` — **束縛時に包む** (youtube.ts の形)
 *   - `${SCREAMING_CASE}`                   — モジュール定数
 *   - `${params.toString()}`                — URLSearchParams (既に符号化済み)
 *   - 台帳 (REVIEWED) にある形
 *
 * ## 画面に出すリンクは対象外 (意図的)
 *
 * `openExternal` へ渡すリンクや `href` は別の不変条件 #5 (http(s) 限定) が
 * 見ている。パス片を足しても**オリジンは変えられない**ので、注入で起きるのは
 * 「リンク先が違う」であって「別のサーバへ要求が飛ぶ」ではない。
 * ここに混ぜると台帳が 20 件を超えて、本当に見たい通信が埋もれる。
 * —— 対象を絞ったこと自体を書いておくのは、今日「走査範囲が一覧だったせいで
 * 死角ができた」ゲートを 7 つ直したため (docs/SESSION_HANDOFF.md 0-a)。
 *
 * Run:  node scripts/lint-url-encoding.cjs
 *       node scripts/lint-url-encoding.cjs --self-test
 *       npm run lint:url-encoding
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * 通信呼び出しの目印。`lint-network-targets.cjs` と**同じ形**に揃える —— 名前の
 * 単語境界だけを見て、開き括弧は見ない。
 *
 * 最初 `\s*\(` を付けていたら、対照実験で**直したはずの 5 箇所のうち 4 箇所を
 * 見逃した**。原因は総称型引数で、このリポジトリの呼び出しは
 * `jsonFetch<GmailMessage>(…)` のように名前と括弧の間に `<…>` が入る形が多い。
 * `jsonFetch\s*\(` はこれに当たらない。姉妹ゲートが `\b…\b` だけにしてあるのは
 * 同じ理由と思われる (あちらにこの穴は無かった)。
 */
const NETWORK_CALL =
  /\b(?:fetch|fetchFn|doFetch|jsonFetch|apiFetch|apiFetchOkFlag|transport|postExpectOk|fetchViaProxy|request)\b/;

/** URL の形をしたテンプレートだけを見る (ヘッダやエラー文を巻き込まない)。 */
const URLISH = /^(?:https?:\/\/|\$\{[A-Za-z_$][\w$.]*\}\/)/;

/**
 * 見直し済みの例外。`file` + `expr` で引く。**双方向** —— 直したのに
 * 残っていれば落ちる。
 */
const REVIEWED = [
  // 現在 0 件。
  //
  // 最初 `aiEndpoint.ts` / `ollama.ts` の URL 再構成
  // (`${parsed.protocol}//${parsed.host}${path}`) を載せたが、**このゲートは
  // 通信呼び出しの中の URL しか見ない**ので 1 件も検出されず、双方向の台帳が
  // 「載っているのに検出されない」で正しく落ちた。あれらは正規化ヘルパーで
  // fetch ではないため、そもそも対象外である (符号化すると二重符号化で壊れる)。
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

/** `const x = encodeURIComponent(...)` で束縛されている識別子。 */
function encodedBindings(text) {
  return new Set(
    [...text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*encodeURIComponent\(/g)]
      .map((m) => m[1]),
  );
}

/** authority を落として path + query を返す (URL 形でなければ null)。 */
function afterAuthority(tpl) {
  if (/^https?:\/\//.test(tpl)) {
    const after = tpl.replace(/^https?:\/\//, '');
    const slash = after.indexOf('/');
    if (slash === -1) return null;
    return after.slice(slash);
  }
  const m = /^\$\{[A-Za-z_$][\w$.]*\}/.exec(tpl);
  return m ? tpl.slice(m[0].length) : null;
}

/** 生の (符号化されていない) 補間を挙げる。 */
function rawInterpolations(tpl, encoded) {
  const rest = afterAuthority(tpl);
  if (rest === null) return [];
  return [...rest.matchAll(/\$\{([^}]*)\}/g)]
    .map((m) => m[1].trim())
    .filter((e) => !/^encodeURIComponent\(/.test(e))
    .filter((e) => !encoded.has(e))
    .filter((e) => !/^[A-Z][A-Z0-9_]*$/.test(e))
    .filter((e) => !/\.toString\(\)$/.test(e));
}

/**
 * ファイル 1 本を検査する。**通信呼び出しの中にある URL だけ**を見るため、
 * テンプレートと同じ行か直前 2 行に通信呼び出しがあることを条件にする。
 */
function scanFile(rel, text) {
  const encoded = encodedBindings(text);
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const near = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
    if (!NETWORK_CALL.test(near)) continue;
    for (const m of lines[i].matchAll(/`([^`]*)`/g)) {
      const tpl = m[1];
      if (!URLISH.test(tpl)) continue;
      for (const expr of rawInterpolations(tpl, encoded)) {
        hits.push({ file: rel, line: i + 1, tpl, expr });
      }
    }
  }
  return hits;
}

function analyze() {
  const files = walk(path.join(REPO_ROOT, 'src'));
  const hits = [];
  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
    hits.push(...scanFile(rel, fs.readFileSync(abs, 'utf8')));
  }
  return { hits, scanned: files.length };
}

// ---------------------------------------------------------------------------
// 陰性対照 (--self-test)
// ---------------------------------------------------------------------------

function selfTest() {
  const cases = [
    ['生のパス片は鳴る', "await jsonFetch(`https://a.example/v1/x/${id}`, {}, c);", 1],
    ['その場で包めば鳴らない', "await jsonFetch(`https://a.example/v1/x/${encodeURIComponent(id)}`, {}, c);", 0],
    [
      '束縛時に包んでも鳴らない (youtube.ts の形)',
      "const k = encodeURIComponent(apiKey);\nawait jsonFetch(`https://a.example/v1?key=${k}`, {}, c);",
      0,
    ],
    ['クエリの生の値も鳴る', "await jsonFetch(`https://a.example/v1?q=${q}`, {}, c);", 1],
    ['1 本に 2 つあれば 2 件', "await jsonFetch(`https://a.example/${a}/${b}`, {}, c);", 2],
    ['定数は鳴らない', "await jsonFetch(`${API_BASE}/zones?per_page=${PER_PAGE}`, {}, c);", 0],
    ['URLSearchParams は鳴らない', "await jsonFetch(`https://a.example/x?${params.toString()}`, {}, c);", 0],
    // authority はホストの話なので `lint:network-targets` の担当。
    ['ホスト部だけの補間は鳴らない (別ゲートの担当)', "await jsonFetch(`https://${host}/v1/x`, {}, c);", 0],
    // 通信呼び出しから遠いテンプレートは URL とは限らない。
    ['通信呼び出しが無ければ見ない', "const s = `https://a.example/v1/x/${id}`;", 0],
    ['ヘッダのテンプレートは URL ではない', "await fetch(u, { headers: { a: `Bearer ${token}` } });", 0],
    ['エラー文のテンプレートも URL ではない', "await fetch(u).catch(() => { throw new Error(`HTTP ${r.status}`); });", 0],
    ['通信呼び出しの 2 行下でも拾う', "await jsonFetch(\n  opts,\n  `https://a.example/v1/x/${id}`,\n);", 1],
    /*
     * 総称型引数で名前と括弧が離れる形。ここを取りこぼすと、このリポジトリの
     * `jsonFetch<T>(…)` 呼び出しが軒並み視界の外に出る (対照実験で 5 件中 4 件を
     * 見逃した実績あり)。
     */
    [
      '総称型引数があっても拾う',
      "await jsonFetch<GmailMessage>(\n  `https://a.example/v1/x/${id}`,\n);",
      1,
    ],
    [
      '総称型引数 + 同じ行',
      "await apiFetch<RawSearch>(`https://a.example/v1/x/${id}`, {}, c);",
      1,
    ],
  ];

  let failed = 0;
  console.log('self-test:');
  for (const [label, src, want] of cases) {
    const got = scanFile('t.ts', src).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 規則が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const { hits, scanned } = analyze();
  const problems = [];
  const seen = new Set();

  for (const h of hits) {
    const hit = REVIEWED.find((r) => r.file === h.file && r.expr === h.expr);
    if (hit) {
      seen.add(`${h.file}::${h.expr}`);
      continue;
    }
    problems.push(h);
  }
  const stale = REVIEWED.filter((r) => !seen.has(`${r.file}::${r.expr}`));

  console.log(
    `Scanned ${scanned} file(s): 通信 URL の補間 ${hits.length} 件 (台帳 ${REVIEWED.length} 件)`,
  );

  let failed = false;
  if (problems.length > 0) {
    failed = true;
    console.error(`\n❌ ${problems.length} 件の符号化されていない補間:\n`);
    for (const p of problems) {
      console.error(`  ${p.file}:${p.line}  \${${p.expr}}`);
      console.error(`    ${p.tpl}`);
    }
    console.error(
      '\n直し方: `${encodeURIComponent(x)}` で包むか、束縛時に'
      + ' `const x = encodeURIComponent(y)` にしてください。'
      + '\n        包めない理由があるなら scripts/lint-url-encoding.cjs の REVIEWED へ'
      + '理由つきで退避 (台帳は双方向です)。',
    );
  }
  if (stale.length > 0) {
    failed = true;
    console.error(`\n❌ 台帳に載っているのに検出されない項目が ${stale.length} 件あります\n`);
    for (const s of stale) console.error(`  ${s.file} :: \${${s.expr}}`);
    console.error('\n直ったなら REVIEWED から削除してください。');
  }

  if (failed) return 1;
  console.log('✅ 通信 URL の動的部分はすべて符号化されているか、台帳にあります');
  return 0;
}

module.exports = { scanFile, rawInterpolations, encodedBindings, REVIEWED };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
