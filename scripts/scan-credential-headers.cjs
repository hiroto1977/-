#!/usr/bin/env node
/**
 * 「資格情報を載せて送っている HTTP ヘッダ名」を、**送っている側から**数える。
 *
 * ## なぜ要るか
 *
 * `src/shared/redact.ts` は失敗応答の本文から資格情報を伏せる唯一の合流点で、
 * ヘッダ名の**列挙**で秘密を見つけている。列挙は守りの中心にあるが、
 * **新しいヘッダを足す側には何の強制も無い**。実測 (2026-08-23):
 *
 * | ヘッダ | 送っている場所 | 伏せられていたか |
 * |---|---|---|
 * | `x-apikey` (VirusTotal) | `main/clients/security.ts`, `renderer/data/saasWriteWeb.ts` | **どの形でも漏れる** |
 * | `x-proxy-auth` (BYO プロキシの共有秘密) | `renderer/network/proxy.ts` | **どの形でも漏れる** |
 * | `hibp-api-key` (HIBP) | 同上 2 ファイル | 線上の形は偶然通っていたが **JSON の形は漏れる** |
 *
 * `x-proxy-auth` が効くのはとくに悪い: 本文を返してくるのは**利用者が用意した
 * プロキシ**で (redact.ts の説明文がまさにその脅威を書いている)、その共有秘密が
 * そのプロキシの応答経由で画面と不具合報告に出る。
 *
 * ## 何を数えるか
 *
 * 判断を挟まない 2 つの形だけ:
 *
 *   1. `headers: { '<名前>': <式> }` / `headers = { … }` — 式が資格情報らしい識別子
 *      (token / key / secret / auth / credential / password) を含むもの
 *   2. `<なにか>Headers['<名前>'] = <式>` — 同じ条件 (`proxy.ts` はこの書き方)
 *
 * 実測でこの 2 つは **6 種 53 箇所・誤検知 0**。値がリテラル文字列のもの
 * (`'Content-Type': 'application/json'`) は識別子を含まないので自然に落ちる。
 *
 * 使い方:  node scripts/scan-credential-headers.cjs           一覧を出す
 *          node scripts/scan-credential-headers.cjs --self-test
 *
 * 「その名前が本当に伏せられるか」は**実物の `redactSecrets` を呼んで**確かめる
 * (`src/shared/__tests__/redactionCoverage.test.ts`)。正規表現の字面を比べると、
 * 比べているのは自分の写しであって守りではなくなる。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(REPO_ROOT, 'src');

/**
 * 値が資格情報らしい式か。
 *
 * 識別子に token / key / secret / auth などを含むもの、および資格情報を
 * **名前を出さずに組み立てる**書き方 (`btoa(...)` / base64 / `basicAuth(...)`)。
 * 後者を入れたのは実測で 1 箇所 (`saasWriteWeb.ts` の
 * `'Basic ' + btoa(\`${creds.email}…\`)`) が識別子だけでは拾えなかったため。
 */
const CREDENTIAL_EXPR = /\b\w*(?:token|key|secret|credential|password|auth|btoa|base64)\w*\b/i;

/** オブジェクトリテラルの 1 項目: `'名前': 値` または `名前: 値`。 */
const ENTRY = /(?:(["'])([A-Za-z][A-Za-z0-9_-]*)\1|([A-Za-z][A-Za-z0-9_]*))\s*:\s*([^,\n}]+)/g;

/** `…Headers['名前'] = 値` の書き方。 */
const BRACKET_SET = /\b(\w*[Hh]eaders?)\s*\[\s*(["'])([A-Za-z][A-Za-z0-9_-]*)\2\s*\]\s*=\s*([^;\n]+)/g;

/** `headers: {` / `headers = {` の `{` に対応する `}` まで。 */
function headerBlocks(text) {
  const out = [];
  const opener = /\bheaders\s*[:=]\s*\{/g;
  let m;
  while ((m = opener.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let j = open; j < text.length; j++) {
      const c = text[j];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    // 閉じられていないものは飛ばす (走査が末尾まで暴走しないように)。
    if (end === -1) continue;
    out.push({ open, body: text.slice(open + 1, end) });
    opener.lastIndex = end;
  }
  return out;
}

const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

/** `[{ rel, text }]` から、資格情報を載せているヘッダの出現箇所を返す。 */
function scanSources(files) {
  const sites = [];
  for (const { rel, text } of files) {
    for (const { open, body } of headerBlocks(text)) {
      ENTRY.lastIndex = 0;
      let e;
      while ((e = ENTRY.exec(body)) !== null) {
        const name = e[2] ?? e[3];
        const value = e[4].trim();
        if (!CREDENTIAL_EXPR.test(value)) continue;
        sites.push({ name, rel, line: lineAt(text, open + 1 + e.index), text: `${name}: ${value}` });
      }
    }
    BRACKET_SET.lastIndex = 0;
    let b;
    while ((b = BRACKET_SET.exec(text)) !== null) {
      const value = b[4].trim();
      if (!CREDENTIAL_EXPR.test(value)) continue;
      sites.push({ name: b[3], rel, line: lineAt(text, b.index), text: `${b[3]} = ${value}` });
    }
  }
  return sites;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    // テストは「送っている場所」ではないので数えない (固定値の見本が混ざる)。
    if (e.name === '__tests__' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** 実物の `src/` を読む。 */
function sourceFiles(root = SRC) {
  return walk(root).map((p) => ({ rel: path.relative(REPO_ROOT, p), text: fs.readFileSync(p, 'utf8') }));
}

/** 送っているヘッダ名 (小文字・重複なし・並べ替え済み)。 */
function credentialHeaderNames(files = sourceFiles()) {
  return [...new Set(scanSources(files).map((s) => s.name.toLowerCase()))].sort();
}

/** 走査の規則ごとの対照実験。 */
function selfTest() {
  const f = (text) => [{ rel: 'x.ts', text }];
  const names = (text) => credentialHeaderNames(f(text));
  const cases = [
    ['オブジェクトの引用符つき名前を拾う', "headers: { 'x-apikey': keys.vt }", ['x-apikey']],
    ['素の識別子の名前も拾う', 'headers: { Authorization: `Bearer ${token}` }', ['authorization']],
    ['ブラケット代入も拾う', "proxyHeaders['x-proxy-auth'] = cfg.sharedSecret;", ['x-proxy-auth']],
    ['値がリテラルなら拾わない', "headers: { 'Content-Type': 'application/json' }", []],
    ['値に資格情報らしい識別子が無ければ拾わない', 'headers: { Accept: mediaType }', []],
    ['headers の外は見ない', "const conf = { 'x-apikey': keys.vt };", []],
    ['入れ子のオブジェクトでも閉じ位置を取り違えない', "headers: { a: { b: 1 }, 'x-api-key': ctx.token }", ['x-api-key']],
    ['閉じられていないブロックは飛ばす (暴走しない)', "headers: { 'x-api-key': ctx.token", []],
    [
      '1 ファイルに複数の headers があっても両方拾う',
      "headers: { 'x-api-key': ctx.token }\nheaders: { 'hibp-api-key': keys.hibp }",
      ['hibp-api-key', 'x-api-key'],
    ],
    ['大文字小文字は畳む', "headers: { 'X-API-Key': cfg.apiKey }", ['x-api-key']],
    // 名前を出さずに組み立てる形 (実測でこれだけが識別子では拾えなかった)。
    ['btoa で組み立てる値も拾う', "headers: { Authorization: 'Basic ' + btoa(pair) }", ['authorization']],
    // 値に資格情報らしい識別子が無いものは拾えない — 走査の限界を明示しておく。
    ['値が無名の変数だと拾えない (既知の限界)', "headers: { 'x-thing': v }", []],
  ];
  let bad = 0;
  console.log('self-test:');
  for (const [label, text, want] of cases) {
    const got = names(text);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(got)} (期待 ${JSON.stringify(want)})`);
  }
  // 実物で何も拾えなくなったら、上の合成ケースが全部通っても意味が無い。
  const real = credentialHeaderNames();
  if (real.length < 4) {
    bad++;
    console.log(`  ✗ 実物の src/ から ${real.length} 種しか拾えていない — 走査が的を外している`);
  } else {
    console.log(`  ✓ 実物の src/ から ${real.length} 種を拾えている: ${real.join(' , ')}`);
  }
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const sites = scanSources(sourceFiles());
  const names = [...new Set(sites.map((s) => s.name.toLowerCase()))].sort();
  console.log(`資格情報を載せているヘッダ: ${names.length} 種 / ${sites.length} 箇所`);
  for (const n of names) {
    const mine = sites.filter((s) => s.name.toLowerCase() === n);
    console.log(`  ${n.padEnd(22)} ${String(mine.length).padStart(2)} 箇所   ${mine[0].rel}:${mine[0].line}`);
  }
  return 0;
}

module.exports = { scanSources, credentialHeaderNames, sourceFiles, selfTest, CREDENTIAL_EXPR };

if (require.main === module) process.exit(main(process.argv.slice(2)));
