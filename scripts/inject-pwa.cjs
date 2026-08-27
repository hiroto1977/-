#!/usr/bin/env node
'use strict';

/*
 * PWA タグ注入 — GitHub Pages デプロイ時に HTML へ PWA メタを差し込む。
 *
 * 標準の単一ファイル standalone.html (デスクトップ/配布物) は変更せず、Pages の
 * `_site/*.html` にだけ manifest / theme-color / apple-touch-icon / Service Worker 登録を
 * 注入する。これにより「ホーム画面に追加」(PWA インストール) が公開サイトで有効になる。
 *
 * 純関数 injectPwaTags(html) を中核に持ち (冪等)、CLI 部はファイル入出力と自己検証のみ。
 *
 * 使い方: node scripts/inject-pwa.cjs _site/index.html _site/app.html
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
// 仕上がり文書の検算は **inline-html.cjs の実物**を借りる。同じ判定を書き写すと、
// 比べているのが写しになる (このリポジトリで何度も出た形)。
const { assertPinnedScripts, assertRawTextInert } = require('./inline-html.cjs');

/** SW 登録スニペット本体。CSP ハッシュはこの定数から導出するので両者はズレない。 */
const SW_REGISTER_JS =
  "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('./sw.js').catch(function(){})});}";

// このスニペットは手書きの定数で、esbuild の生テキスト逃がしを一切通っていない。
// 生テキスト要素へ入れる文字列は、書いた者が誰であれ同じ関門を通す。
assertRawTextInert(SW_REGISTER_JS, 'script', 'SW 登録スニペット');

const PWA_HEAD_TAGS = [
  '<link rel="manifest" href="./manifest.webmanifest">',
  '<meta name="theme-color" content="#0e0f13">',
  '<link rel="apple-touch-icon" href="./icon.svg">',
  `<script>${SW_REGISTER_JS}</script>`,
].join('');

/**
 * 上記スニペットの CSP ハッシュ。
 *
 * inline-html.cjs は standalone の `script-src` をバンドルの sha256 ハッシュに
 * ピン留めしている (2026-07 監査: 'unsafe-inline' だと注入された <script> も
 * 実行できてしまう)。CSP ではハッシュが 1 つでもあると 'unsafe-inline' は無視される
 * ため、**このスニペットのハッシュを追記しなければ SW 登録が黙って拒否される** —
 * 症状は R2-8 (worker-src 未指定) と同じ「PWA が理由なく効かない」。
 *
 * ハッシュ対象は <script> 要素の子テキストそのもの (= SW_REGISTER_JS 全体) を
 * UTF-8 でエンコードしたバイト列。開始タグ直後に改行を入れていないので、その改行も
 * 含めない — 1 バイトでも違えばブラウザは実行しない。
 */
const SW_SCRIPT_HASH = `'sha256-${crypto.createHash('sha256').update(SW_REGISTER_JS, 'utf8').digest('base64')}'`;

/** CSP メタタグ (content 属性をキャプチャ)。1 文書に 1 つだけ存在する。 */
const CSP_META_RE = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/i;

/** `script-src` ディレクティブ本体。`script-src-elem` 等に誤爆しないよう直後の空白を必須にする。 */
const SCRIPT_SRC_RE = /(^|;)\s*script-src\s+[^;]*/i;

/**
 * 実際の </head> 終了タグの位置を返す。
 *
 * standalone.html は数 MB の JS バンドルを <head> 内にインライン化しており、その中の
 * テンプレート文字列 (Stocks/事業ダッシュボードの HTML エクスポート等) に文字列としての
 * "</head>" が含まれる。単純な indexOf だとバンドル内の文字列にヒットし、PWA タグ
 * (実 </script> を含む) を JS の真ん中へ splice してモジュールスクリプトを破壊する
 * (2026-07-24 の Pages 障害: アプリが「大量のコード表示」になる)。
 *
 * 公開対象の HTML はすべてスクリプトを <head> 内にのみ持つため、「最後の </script>
 * より後にある最初の </head>」が実タグ。スクリプトが無い HTML は最初の </head> でよい。
 */
function findRealHeadClose(html) {
  const lastScriptClose = html.lastIndexOf('</script>');
  return html.indexOf('</head>', lastScriptClose === -1 ? 0 : lastScriptClose);
}

/** <script type="module"> から直後の実 </script> までの領域 (注入で壊れていないかの検証用)。 */
function moduleScriptRegion(html) {
  const open = html.indexOf('<script type="module"');
  if (open === -1) return null;
  return html.slice(open, html.indexOf('</script>', open));
}

/**
 * SW スニペットのハッシュを既存 `script-src` の末尾へ冪等に追記する。
 *
 * 探索範囲は **最初の `<script` より前の前置部だけ**。バンドルは文字列として
 * `<meta http-equiv=...>` 相当のテンプレートを持ちうるので、全文正規表現でバンドル本文を
 * 書き換える事故 (2026-07-24 障害と同型) を構造的に排除する。書き換えも content 属性値の
 * バイト範囲だけを splice する — replace(str,str) の `$&` 解釈も経路上に無い。
 *
 * ハッシュの個数は問わない (バンドル 1 個でも複数チャンクでも末尾に足すだけ)。
 */
function withSwScriptHash(html) {
  const limit = html.indexOf('<script');
  const head = limit === -1 ? html : html.slice(0, limit);
  const meta = CSP_META_RE.exec(head);
  // CSP メタを持たない HTML (自動生成ランディング等) は対象外 — 何も足さない。
  if (!meta) return html;
  const policy = meta[1];
  if (policy.includes(SW_SCRIPT_HASH)) return html; // 冪等: 既に追記済み
  if (!SCRIPT_SRC_RE.test(policy)) {
    // script-src が無い = default-src が script を支配している状態。そこへ
    // ハッシュだけの script-src を新設すると既存スクリプトを巻き込んで止めるし、
    // 放置すれば SW 登録が黙って拒否される。どちらも事故なのでビルドを落とす。
    throw new Error('inject-pwa: CSP に script-src が無く SW スニペットを許可できません');
  }
  const next = policy.replace(SCRIPT_SRC_RE, (directive) => `${directive} ${SW_SCRIPT_HASH}`);
  const start = meta.index + meta[0].indexOf('content="') + 'content="'.length;
  return `${html.slice(0, start)}${next}${html.slice(start + policy.length)}`;
}

/** HTML の実 </head> 直前に PWA タグを冪等に注入する (既に注入済みなら無変更)。 */
function injectPwaTags(html) {
  if (html.includes('rel="manifest"')) return html;
  const idx = findRealHeadClose(html);
  if (idx === -1) throw new Error('inject-pwa: </head> が見つかりません');
  const out = withSwScriptHash(`${html.slice(0, idx)}${PWA_HEAD_TAGS}${html.slice(idx)}`);
  // タグ注入と CSP 追記の両方をこのガードが見る。CSP メタはバンドルより前にあるので
  // 領域は 1 バイトも動かないのが正しい状態。
  if (moduleScriptRegion(out) !== moduleScriptRegion(html)) {
    throw new Error('inject-pwa: 注入がモジュールスクリプトを破壊しました (注入位置バグ)');
  }
  assertHashesPreserved(html, out);
  return out;
}

/**
 * CSP メタの content 属性値。無ければ null (自動生成ランディングには CSP が無い)。
 *
 * `withSwScriptHash` と**同じ切り出し方** — 最初の `<script` より前だけを見る。
 * バンドルは CSP メタの字面を文字列として持ちうるので (`injectPwa.test.ts` の
 * 「バンドルが文字列として CSP メタを含んでいても」参照)、全文から探すと
 * そちらを掴む余地が残る。読む側と書く側で切り出しを揃えておく。
 */
function policyOf(html) {
  const limit = html.indexOf('<script');
  const head = limit === -1 ? html : html.slice(0, limit);
  const m = CSP_META_RE.exec(head);
  return m === null ? null : m[1];
}

/** ポリシーに載っている script ハッシュ。 */
function scriptHashesIn(policy) {
  return [...policy.matchAll(/'sha(?:256|384|512)-[A-Za-z0-9+/=]+'/g)].map((m) => m[0]);
}

/**
 * **注入で既存のハッシュを 1 つも落としていないこと。**
 *
 * 上の 2 つのガードでは足りない。`moduleScriptRegion` はスクリプトの**本文**を
 * 比べるだけで CSP を見ないし、CLI 側の検査は SW スニペットのハッシュが在るか
 * しか見ない。つまり `withSwScriptHash` が CSP を組み損ねて**バンドル本体の
 * ハッシュを落とした**場合、どちらも通ってしまう。そのとき公開されるのは
 * 「自分の 11MB のバンドルを CSP が拒否する頁」= 白画面で、console にしか
 * 痕跡が出ない。
 *
 * ここは「入力が正しくピン留めされていたか」は問わない (それは inline-html.cjs の
 * 仕事)。問うのは**注入が壊していないか**だけなので、CSP を持たない頁も、
 * ハッシュを使わない頁も自然に通る。
 */
function assertHashesPreserved(before, after) {
  const src = policyOf(before);
  if (src === null) return;
  const had = scriptHashesIn(src);
  if (had.length === 0) return;
  const now = new Set(scriptHashesIn(policyOf(after) ?? ''));
  const lost = had.filter((h) => !now.has(h));
  if (lost.length > 0) {
    throw new Error(
      `inject-pwa: 注入で script ハッシュが ${lost.length} 個消えました ` +
        `(その分のスクリプトは CSP に拒否されます): ${lost.join(' , ')}`,
    );
  }
}

/**
 * 公開してよい形か — **元からハッシュでピン留めしている頁に限り**、仕上がり文書を
 * ブラウザと同じ手順で読み直して inline script が全部 CSP に載っているか見る。
 *
 * `injectPwaTags` 側ではなくここに置くのは、この検算が「入力そのものが正しく
 * ピン留めされていること」まで要求するため。それは `inline-html.cjs` の仕事で、
 * 注入の事後条件ではない。**実物を公開する経路 (CLI) にだけ**当てる。
 *
 * 対象かどうかは **`before` で決める**。`after` で決めると、注入が必ず足す
 * SW のハッシュのせいで「元はハッシュを使っていなかった頁」まで対象に入り、
 * 注入とは無関係な既存の不備を注入のせいにして落としてしまう
 * (`script-src 'self'` に inline script、という形が実際にそうなった)。
 */
function assertPublishable(before, after, label) {
  const src = policyOf(before);
  if (src === null || scriptHashesIn(src).length === 0) return;
  try {
    assertPinnedScripts(after);
  } catch (e) {
    throw new Error(`inject-pwa: ${label} は公開できません — ${e.message}`, { cause: e });
  }
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: node scripts/inject-pwa.cjs <html...>');
    process.exit(1);
  }
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = injectPwaTags(before);
    // **検査してから書く。** 以前は書いてから検べており、落ちた時点で壊れた
    // ファイルが既に disk に在った。今は次の段 (upload) が走らないので公開は
    // されないが、「取り返しのつく順序」にしておく。
    if (!after.includes('rel="manifest"')) {
      console.error(`inject-pwa: 注入に失敗 (${file})`);
      process.exit(1);
    }
    // CSP を持つ HTML では SW スニペットが許可されていること (= 実行されること) まで検証。
    if (CSP_META_RE.test(after) && !after.includes(SW_SCRIPT_HASH)) {
      console.error(`inject-pwa: SW スニペットが CSP に未ピン留め (${file})`);
      process.exit(1);
    }
    // ハッシュでピン留めしている頁は、仕上がりを読み直して全部載っているか見る。
    assertPublishable(before, after, file);
    fs.writeFileSync(file, after);
    console.log(`inject-pwa: ${file} に PWA タグを注入${before === after ? ' (既存・無変更)' : ''}`);
  }
}

if (require.main === module) main();

module.exports = {
  injectPwaTags,
  assertHashesPreserved,
  assertPublishable,
  policyOf,
  scriptHashesIn,
  findRealHeadClose,
  moduleScriptRegion,
  withSwScriptHash,
  PWA_HEAD_TAGS,
  SW_REGISTER_JS,
  SW_SCRIPT_HASH,
};
