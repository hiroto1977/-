#!/usr/bin/env node
'use strict';

/*
 * 出荷する HTML の CSP を、**実物に対して**確かめる。
 *
 *   node scripts/lint-artifact-csp.cjs --self-test
 *   node scripts/lint-artifact-csp.cjs --app dist/standalone.html --document demo.html --none landing.html
 *
 * ## なぜ実物か
 *
 * `src/renderer/index.html` の CSP は `script-src 'self'` だが、**出荷される
 * 標準版はそれではない** —— `inline-html.cjs` がバンドルを 1 本の inline
 * script へ畳み込み、`script-src` を**その sha256 へピン留め**する。
 * さらに `inject-pwa.cjs` が SW スニペットのハッシュを追記する。
 * つまり**ソースの CSP を見ても、公開されている CSP を見たことにはならない**。
 * (このリポジトリは同じ理由で inject-pwa と個人データ走査を実物に当てている。)
 *
 * ## なぜ黙って壊れうるか
 *
 * ハッシュが落ちて `script-src 'self'` に戻っただけなら inline script は
 * **1 つも動かず**、e2e が即座に落ちる (fail-closed)。
 * ところが `script-src 'self' 'unsafe-inline'` になった場合は
 * **アプリは完全に動いたまま、注入された `<script>` も動く**。
 * どの検査も鳴らず、e2e も緑になる。**これがこの門の存在理由**である。
 *
 * ブラウザ版の `connect-src` は `https:` を許している (74 サービスの API を
 * 直に叩くので絞れない) ため、注入が成立した時点で持ち出しは自由になる。
 * script の入口を塞ぐこと自体が防御線であり、ハッシュはその要である。
 *
 * ## プロファイル
 *
 *   app       単一 HTML のアプリ (standalone / lite)。script-src はハッシュ固定。
 *   document  書類生成デモ。`default-src 'none'` で通信そのものが無い。
 *             script-src は 'unsafe-inline' だが、持ち出し先が無いので成立しない。
 *   none      CSP を持たないことが分かっている物 (landing)。
 *             **持たないことを台帳にする** —— 付いたら気付けるように。
 */

const fs = require('node:fs');

/*
 * `<meta http-equiv="Content-Security-Policy" content="…">` の content。無ければ null。
 *
 * **CSP の値は単引用符だらけ** (`'self'` / `'none'` / `'sha256-…'`) なので、
 * `content=["']([^"']*)["']` のような書き方だと**最初の `'` で切れる**。
 * 最初に書いた版がこれで、正しい CSP に対して 4 件の誤検知を出した
 * (self-test が即座に捕まえた)。開き引用符を後方参照で綴じる。
 *
 * 属性の順序にも依存しない —— `content` が先に来るビルドへ変えられても
 * 「CSP が無い」と誤認しない (誤認しても fail-closed ではあるが、
 * 鳴った理由が読めなくなる)。
 */
function cspMetas(html) {
  const out = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/http-equiv\s*=\s*(["'])\s*Content-Security-Policy\s*\1/i.test(tag)) continue;
    const m = tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
    out.push(m ? m[2] : '');
  }
  return out;
}

function extractCsp(html) {
  const all = cspMetas(html);
  return all.length === 0 ? null : all[0];
}

/** ディレクティブ名 → 値の配列。 */
function directives(csp) {
  const out = new Map();
  for (const part of csp.split(';')) {
    const t = part.trim();
    if (t === '') continue;
    const [name, ...vals] = t.split(/\s+/);
    out.set(name.toLowerCase(), vals);
  }
  return out;
}

function evaluate(profile, html, label) {
  const problems = [];
  const at = (why) => problems.push(`${label}: ${why}`);
  const metas = cspMetas(html);
  const csp = metas.length === 0 ? null : metas[0];


  if (profile === 'none') {
    // 台帳としての「持たない」。付いたら知りたい (方針が変わったということ)。
    if (metas.length > 0) {
      at('CSP が付きました — 台帳では「持たない」物です。方針が変わったなら profile を変えること');
    }
    return problems;
  }

  /*
   * **2 枚以上は見ない、ではなく落とす。** ブラウザは複数の CSP を
   * **重ねて**適用する (交差) ので緩くはならないが、この門は 1 枚目しか
   * 読まないので、2 枚目に何が書いてあっても report できない。
   * 「読めていない物がある」まま緑を返さない。
   */
  if (metas.length > 1) {
    at(`CSP の meta が ${metas.length} 枚あります — 1 枚に統合してください (この門は 1 枚目しか読みません)`);
  }

  if (csp === null) {
    at('CSP の meta がありません');
    return problems;
  }
  const d = directives(csp);

  // どのプロファイルでも許さない。ハッシュでは無効化できない唯一の穴。
  if (csp.includes("'unsafe-eval'")) at("'unsafe-eval' が入っています");

  if (profile === 'app') {
    const script = d.get('script-src');
    if (script === undefined) {
      at('script-src がありません (default-src へ落ちると意図が読めない)');
    } else if (!script.some((v) => /^'sha(256|384|512)-/.test(v))) {
      at(
        "script-src がハッシュで固定されていません — " +
          "'unsafe-inline' に戻すと、アプリは動いたまま注入された <script> も動きます",
      );
    }
    /*
     * 2026-08-26 に足した 2 つ。**出荷物はどちらも既に正しい値を持っていたが、
     * 留めている物が無かった** —— この門は 5 つしか見ておらず、
     * 緩めても緑を返した (実測)。
     *
     *   frame-src   `'none'` を `https:` に緩めると、乗っ取られたレンダラーが
     *               任意の遠隔ページを埋め込める。さらに **iframe の遷移は
     *               `connect-src` の管轄外の送出路**である —— `<img>` の画素
     *               ビーコン (lint:forbidden の 35 番目の規則) と同じ族で、
     *               資格情報の流出経路の台帳にも載らない。
     *   worker-src  `'self'` を緩めると blob:/遠隔 URL から Worker を作れる。
     *               Worker は `script-src` の判断を迂回する古典的な経路。
     *
     * 出荷している値 (`scripts/inline-html.cjs` の `buildCsp`) と同じなので、
     * 受理すべき対象は落ちない。変えたいならここも直す —— それがこの門の仕事。
     */
    for (const [name, want] of [
      ['object-src', "'none'"],
      ['base-uri', "'self'"],
      ['form-action', "'none'"],
      ['frame-src', "'none'"],
      ['worker-src', "'self'"],
    ]) {
      const got = d.get(name);
      if (got === undefined || got.join(' ') !== want) {
        at(`${name} が ${want} ではありません (${got === undefined ? '未指定' : got.join(' ')})`);
      }
    }
    const def = d.get('default-src');
    if (def === undefined || def.includes('*')) at('default-src が未指定か * です');
  }

  if (profile === 'document') {
    const def = d.get('default-src');
    if (def === undefined || def.join(' ') !== "'none'") {
      at(`default-src が 'none' ではありません (${def === undefined ? '未指定' : def.join(' ')})`);
    }
    const conn = d.get('connect-src');
    if (conn !== undefined && conn.join(' ') !== "'none'") {
      at(`connect-src が通信を許しています (${conn.join(' ')}) — 書類は通信しません`);
    }
  }

  return problems;
}

/*
 * 合成標本は**出荷している形と同じ並び**にしておく (`inline-html.cjs` の
 * `buildCsp`)。ここが実物より短いと、実物にしか無いディレクティブを
 * 門へ足したときに自己テストだけが落ちる —— 2026-08-26 に
 * `frame-src` / `worker-src` を足して実際にそうなった。
 */
const APP_OK =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; ' +
  "script-src 'sha256-AAAA'; worker-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self' https:; object-src 'none'; " +
  "frame-src 'none'; base-uri 'self'; " +
  'form-action \'none\'">';

function selfTest() {
  const swap = (from, to) => APP_OK.replace(from, to);
  const cases = [
    ['app: 実物と同じ形は通る', 'app', APP_OK, 0],
    // **これが本題** —— アプリは動いたまま注入も通る形。
    ['app: ハッシュを外すと鳴る', 'app', swap("script-src 'sha256-AAAA'", "script-src 'self' 'unsafe-inline'"), 1],
    ['app: script-src ごと消すと鳴る', 'app', swap("script-src 'sha256-AAAA'; ", ''), 1],
    ['app: sha384 / sha512 も固定として認める', 'app', swap('sha256-AAAA', 'sha384-AAAA'), 0],
    ['app: unsafe-eval は鳴る', 'app', swap("style-src 'self'", "style-src 'self' 'unsafe-eval'"), 1],
    ['app: object-src を緩めると鳴る', 'app', swap("object-src 'none'", "object-src 'self'"), 1],
    ['app: base-uri を緩めると鳴る', 'app', swap("base-uri 'self'", 'base-uri *'), 1],
    ['app: form-action を緩めると鳴る', 'app', swap("form-action 'none'", "form-action 'self'"), 1],
    ['app: default-src * は鳴る', 'app', swap("default-src 'self'", 'default-src *'), 1],
    ['app: CSP が無ければ鳴る', 'app', '<html><body>x</body></html>', 1],
    [
      'document: default-src none なら通る',
      'document',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data:;">',
      0,
    ],
    [
      'document: default-src が none でなければ鳴る',
      'document',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'unsafe-inline\';">',
      1,
    ],
    [
      'document: connect-src で通信を開けたら鳴る',
      'document',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src https:;">',
      1,
    ],
    ['none: CSP が無ければ通る', 'none', '<html><body>x</body></html>', 0],
    ['none: CSP が付いたら鳴る', 'none', APP_OK, 1],
    ['app: CSP が 2 枚あれば鳴る (1 枚目しか読めないため)', 'app', APP_OK + APP_OK, 1],
    ['none: 2 枚でも「付いた」の 1 件だけ (枚数の話は別プロファイル)', 'none', APP_OK + APP_OK, 1],
    // 抽出そのもの (属性の順序・引用符が変わっても拾えること)。
    [
      'app: 属性の順序が逆でも拾う',
      'app',
      '<meta content="' + APP_OK.slice(APP_OK.indexOf('content="') + 9, -2) + '" http-equiv="Content-Security-Policy">',
      0,
    ],
  ];

  let bad = 0;
  console.log('self-test:');

  /*
   * **抽出そのものを直に確かめる。** 上の表は「何件出たか」しか見ないので、
   * 抽出が壊れて `null` を返しても「CSP が無い」で 1 件出て、それらしく見える。
   * 最初に書いた抽出は単引用符で切れており、正しい CSP に 4 件出していた。
   *
   * **この 5 行を `let bad = 0` の前に置いていた** (2026-08-25)。`bad += 1` は
   * TDZ を踏むので、抽出が壊れたときに報告ではなく ReferenceError になる ——
   * つまり**失敗方向で壊れていた**。同じ誤りをこのセッションで 2 度やり、
   * 2 度とも eslint (`no-useless-assignment`) が捕まえた。
   * **対照や自己検査こそ、本体と同じ厳しさで見る。**
   */
  const extracted = extractCsp(APP_OK);
  const extractOk = extracted !== null && extracted.includes("form-action 'none'");
  if (!extractOk) bad += 1;
  console.log(
    `  ${extractOk ? '✓' : '✗'} 抽出: 単引用符を含む値を最後まで取れる: ` +
      `${extracted === null ? 'null' : `…${extracted.slice(-20)}`}`,
  );
  for (const [label, profile, html, want] of cases) {
    const n = evaluate(profile, html, 'x.html').length;
    const ok = n === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${want})`);
  }
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件 — 門が鳴らない / 鳴りすぎている`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(app|document|none)$/.exec(argv[i]);
    if (m) {
      const file = argv[i + 1];
      if (file === undefined) {
        console.error(`❌ ${argv[i]} にファイルを渡してください`);
        return 2;
      }
      targets.push({ profile: m[1], file });
      i += 1;
    }
  }
  if (targets.length === 0) {
    console.error('❌ 検査対象がありません (--app/--document/--none <file>)');
    return 2;
  }
  const problems = [];
  for (const { profile, file } of targets) {
    let html;
    try {
      html = fs.readFileSync(file, 'utf8');
    } catch {
      // ビルド忘れを黙らせない。
      problems.push(`${file}: 読めません (ビルドし忘れていませんか)`);
      continue;
    }
    problems.push(...evaluate(profile, html, file));
  }
  console.log(`Checked ${targets.length} artifact(s) の CSP`);
  if (problems.length === 0) {
    console.log('✅ 出荷物の CSP はプロファイルどおりです');
    return 0;
  }
  console.error(`❌ ${problems.length} 件:`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { evaluate, extractCsp, cspMetas, directives };
