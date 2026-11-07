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

/**
 * 文書によらず必ず足すタグ。**下地色はここに無い** — 理由は `themeColorTag`。
 *
 * 注入は「theme-color (在れば) + この 3 つ」を 1 続きで置く。順序をこうするのは、
 * 色が付く場合も付かない場合もこの 3 つが**連続したまま**になるようにするため
 * (検査が注入位置を `indexOf(PWA_HEAD_TAGS)` で見ている)。
 */
const PWA_HEAD_TAGS = [
  '<link rel="manifest" href="./manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="./icon.svg">',
  `<script>${SW_REGISTER_JS}</script>`,
].join('');

/**
 * **下地色を写さない** (2026-09-21 · パス 363)。
 *
 * ここは 2026-09-18 (パス 317-318) から `content="#fff7fa"` という**手書きの定数**だった。
 * その値の出どころは `src/renderer/styles.css` の `:root { --bg }` で、同じ決定の写しは
 * 実測で 5 つ在り、**機械が縛っていたのは 1 つだけ**だった:
 *
 * ```
 *   src/renderer/styles.css            --bg: #fff7fa / #1b1520   出どころ
 *   src/main/windowPrefs.ts            #fff7fa                   ✅ windowPrefs.test.ts が照合
 *   src/renderer/theme.ts              (字面を持たない・実値を読む) ✅ theme.test.ts + e2e
 *   scripts/inject-pwa.cjs             #fff7fa                   ❌ 何も縛っていない ← ここ
 *   assets/manifest.webmanifest        #0e0f13                   ❌ 何も縛っていない・**どの版の --bg とも違う**
 *   scripts/build-landing.cjs          #0f1117 が 2 か所          ❌ 同じファイルの中で 2 度書かれている
 * ```
 *
 * しかもこの定数は**注入先 3 文書のうち 1 つに対して誤っていた** ——
 * ランディング (`_site/index.html` = 公開サイトの根) は `--bg: #0f1117` の暗い頁で、
 * 自分の `<meta name="theme-color" content="#0f1117">` を既に持っている。そこへこの定数を
 * 足すと、**1 つの文書が同じ問いに 2 つの答えを載せる**ことになる (実測: 注入後の
 * ランディングには theme-color が 2 つ・`#0f1117` と `#fff7fa`)。HTML の規定では
 * 最初の 1 つが使われるので今日の見た目は正しいが、**どちらが効くかを決めているのは
 * 誰かの意図ではなく byte の順序**である。
 *
 * だから `syncHostChrome` (`renderer/theme.ts`) と**同じ規則**にする ——
 * palette を写さず、**その文書自身の `:root { --bg }` の実値**を読む。
 * 文書が自分の theme-color を既に名乗っているなら、こちらは何も足さない。
 */
const OWN_THEME_COLOR_RE = /<meta\s+name="theme-color"/i;

/**
 * 文書自身の既定の下地 (`#rrggbb`)。見つからなければ null。
 *
 * 見るのは `<style>` の中の**修飾の無い `:root`** だけ ——
 * `:root[data-theme="dark"]` は選んだ人の色であって既定ではないし、
 * バンドルの JS には `"var(--bg)"` の字面が在る (実測: standalone.html に 1 件)
 * ので、`<style>` の外は読まない。
 *
 * **複数の `<style>` が違う既定を名乗ったら落とす。** バンドルは HTML 書き出しの
 * テンプレートを文字列として持ちうるので (`injectPwa.test.ts` の「バンドルが文字列として
 * CSP メタを含んでいても」と同じ形)、いつか 2 つ目の `<style>` が現れる余地が在る。
 * そのとき黙ってどちらかを選ぶと、**公開される色が走査順で決まる**。
 */
function documentBackground(html) {
  const found = [];
  for (const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const rule of style[1].matchAll(/(^|[};])\s*:root\s*\{([^}]*)\}/g)) {
      const bg = /--bg\s*:\s*(#[0-9a-fA-F]{6})\b/.exec(rule[2]);
      if (bg) found.push(bg[1].toLowerCase());
    }
  }
  const distinct = [...new Set(found)];
  if (distinct.length > 1) {
    throw new Error(`inject-pwa: 既定の下地色が ${distinct.length} 通り見つかりました (${distinct.join(' , ')}) — どれを公開するか決められません`);
  }
  return distinct[0] ?? null;
}

/**
 * 足すべき theme-color タグ (足さないなら空文字)。
 *
 * 文書が自分で名乗っているなら足さない / 名乗っていなくて `--bg` が読めればその実値 /
 * どちらでもなければ**足さない** —— 無色は manifest の `theme_color` が受けるので
 * 正しい結末だが、**誤った色は誰も受けられない**。推測して書くより出さない。
 */
function themeColorTag(html) {
  const end = findRealHeadClose(html);
  const head = end === -1 ? html : html.slice(0, end);
  if (OWN_THEME_COLOR_RE.test(head)) return '';
  const bg = documentBackground(html);
  return bg === null ? '' : `<meta name="theme-color" content="${bg}">`;
}

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
  const tags = `${themeColorTag(html)}${PWA_HEAD_TAGS}`;
  const out = withSwScriptHash(`${html.slice(0, idx)}${tags}${html.slice(idx)}`);
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
  documentBackground,
  themeColorTag,
  SW_REGISTER_JS,
  SW_SCRIPT_HASH,
};
