/**
 * **配る単一 HTML (maker) の自己検算** —— 組んだ HTML のインラインの `<script>` を
 * `lint-malware.cjs` の規則で走査し、重大な一致 (eval / Function コンストラクタ / 動的な遠隔コードの取得など)
 * が在れば**ビルドを止める** (2026-10-30 · パス 566 · threat: T-229)。
 *
 * ## なぜ各 maker の中で
 *
 * 配る 4 本 (経営書類スタジオ / 業務自動化ダッシュボード / 就業規則メーカー / 電子定款メーカー) は
 * **CI では組まない** —— 利用者が開いて使う単一ファイルなので、`lint:malware --artifact` が CI で当たるのは
 * `pages.yml` が publish するデモ 4 本と app 本体だけだった (CSP は `artifactCspCensus` が 8 本すべてを
 * 覆うのに、malware には双子が無かった —— パス 566 の供給網の赤 S1)。だから **maker 自身が組むときに
 * 自分の出力を走査する** (CSP census が「ここが唯一の門」と呼んだのと同じ形)。`makerMalwareCensus.test.ts`
 * が、4 本の `buildHtml()` の出力を同じ規則で走査して CI でも覆い、maker がこの関門を配線していることを留める。
 */
const { scanCode, blocking } = require('../lint-malware.cjs');

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * 配る HTML のインラインの script を走査し、重大な一致が在れば投げる。戻り値は走査した script の本数。
 * 成果物の走査なので台帳とは照合しない (`accepted = []`) —— 重大な一致だけを落とす (`scanArtifact` と同じ)。
 */
function assertInlineScriptsClean(html, name) {
  const found = [];
  let n = 0;
  for (const m of html.matchAll(INLINE_SCRIPT)) {
    n += 1;
    found.push(...scanCode(`${name}#inline-script-${n}`, m[1]));
  }
  const block = blocking(found, []);
  if (block.length > 0) {
    const ids = [...new Set(block.map((f) => f.rule.id))].join(', ');
    throw new Error(`${name}: 配る HTML のインライン script に悪意のコードの形 (${ids}) —— ビルドを止めました`);
  }
  return n;
}

module.exports = { assertInlineScriptsClean };
