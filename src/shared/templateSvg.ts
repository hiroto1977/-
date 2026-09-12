import { wrapLines } from './textWrap';
import { escapeXml, safeColor } from './escape';

/**
 * **テンプレートの SVG を組む 1 か所** (2026-09-12 · パス 184)。
 *
 * ## 何が起きていたか
 *
 * 同じ 8 テンプレートを組む実装が **3 つ**在った ——
 *
 * ```
 *   src/main/clients/templates.ts    renderTemplate()        ← デスクトップ版の書き出し
 *   src/renderer/web-templates.ts    renderTemplateForWeb()  ← ブラウザ版の書き出し
 *   src/renderer/pages/TemplatesPage.tsx  renderPreview()    ← 画面のプレビュー
 * ```
 *
 * 3 つ目は自分で「Mirror of the backend renderers」と名乗っていた。
 * 実測 (2026-09-12・8 テンプレート × 既定値) では **どの 2 つも一致しない**:
 *
 * | | プレビュー | ブラウザ版 | デスクトップ版 |
 * | --- | --- | --- | --- |
 * | `<?xml … ?>` | ない | ある | ある |
 * | `role="img"` / `aria-label` | **ない** | **ない** | ある |
 * | `font-family` | **ない** | **ない** | ある (明朝 / ゴシックを使い分け) |
 * | 背景 `<rect>` の `x` `y` | ない | ない | ある |
 * | 白 | `#fff` | `#fff` | `#ffffff` |
 * | 長さ (プレゼン表紙) | 763 | 732 | 986 |
 *
 * 利用者から見える害は 3 つ:
 *
 * 1. **プレビューで整えた字面が、書き出すと別の書体で組まれる。** 名刺・証明書・
 *    履歴書の見出しはデスクトップ版だけ**明朝**で、証明書は 6 つの `<text>` の
 *    うち 4 つが明朝である。字幅が違うので折り返し位置も変わる。
 * 2. **代替テキストが付くのはデスクトップ版だけ。** 同じテンプレートなのに、
 *    ブラウザ版で書き出した SVG は読み上げできない。
 * 3. **プレビューはどちらの書き出しとも一致しない。** 画面が「これが出ます」と
 *    見せている物が、どのビルドでも出ない。
 *
 * ## なぜ検査が通っていたか
 *
 * `shared/__tests__/templateCatalogParity.test.ts` は「**同じ id で同じ成果物を
 * 出すはず**の表」と書いて、**表だけ**を突き合わせていた (id・寸法・既定値は
 * 完全に一致している)。`templateParamsParity.test.ts` は引数の検査の差を留めて
 * いた。**成果物そのものを比べる検査が無かった。**
 *
 * ## 直した形
 *
 * 組み立てはここ 1 つにして、3 か所はここを呼ぶ。採ったのはいちばん豊かな
 * デスクトップ版 —— 代替テキストと書体が付く側で、他の 2 つはそれを失って
 * いただけである。`templateSvgAgreement.test.ts` が「プレビュー ＝ 書き出し」を
 * 実画面から留め、`templateRendererCensus.test.ts` が「写しが 2 つ目に増えない」
 * ことを原文の走査で留める。
 *
 * ## 引数の検査は 1 つにしない (意図的)
 *
 * `templateParamsParity.test.ts` が理由を書いている通り、`validateParams`
 * (main) は **IPC 境界の番人**で違反を throw し、ブラウザ版と画面は
 * `normalizeTemplateParams` で既定値へ落とす。**揃える方向は緩い側へしか
 * 働かない**ので、ここでは組み立てだけを共有し、入口の厳しさは呼ぶ側に残す。
 * 下限としてどちらの道も色は `safeColor` を通る (属性から抜けられない)。
 */

/** SVG に埋める文字列と色。 */
export interface TemplateSvgParams {
  /** 主タイトル */
  title: string;
  /** 副題 / リード文 */
  subtitle: string;
  /** 本文 / フッター / 補足 (改行可) */
  body: string;
  /** メインアクセントカラー (HEX, e.g. #5b8def) */
  accentColor: string;
  /** セカンダリカラー (HEX) — 背景・装飾用 */
  secondaryColor: string;
  /** ブランド名・ロゴ代替テキスト */
  brandText: string;
}

/**
 * 組み立てが要るのは寸法だけ。**目録の型そのものを要求しない**ので、
 * デスクトップ版の `TemplateDef` (label / description つき) も
 * ブラウザ版の `TemplateDef` もそのまま渡せる。
 */
export interface TemplateSvgBox {
  readonly width: number;
  readonly height: number;
}

/**
 * **文字列の欄の上限 (1 か所)。**
 *
 * デスクトップ版の `validateParams` はこれを超えたら throw し、画面の入力欄は
 * これを `maxLength` として読む。数を 2 か所に置くと必ず食い違う ——
 * 実際、`templates.ts` の欄ごとの JSDoc は「40 字以内 / 80 字以内 / 200 字以内 /
 * 24 字以内」と書いたまま残っており、**実装の半分以下の数を説明していた**
 * (2026-09-12 実測)。散文ではなく 1 つの定数にする。
 */
export const TEMPLATE_FIELD_LIMITS = {
  title: 80,
  subtitle: 120,
  body: 400,
  brandText: 48,
} as const;

/** 上限を持つ欄の名前。 */
export type TemplateTextField = keyof typeof TEMPLATE_FIELD_LIMITS;

// --- 個々のテンプレート -------------------------------------------------
//
// どれも純関数 (params, box) → SVG 文字列。構造 (root <svg>・寸法・
// タイトルの有無)、折り返しの分岐、エスケープは検査で固定する。
// 測らないのは座標の算術だけ。

// ここから下は SVG の座標計算。`d.height / 2 - 220` のような数値は
// 「そこに置くと収まりが良い」以上の意味を持たないので、算術だけ測らない。
// 折り返し・改行の分岐・エスケープは測る（下の帯に含めない）。
// Stryker disable ArithmeticOperator
function renderPresentationCover(p: TemplateSvgParams, d: TemplateSvgBox): string {
  const lines = wrapLines(p.title, 24);
  const titleY = d.height / 2 - lines.length * 30;
  const titleTspans = lines
    .map((l, i) => `<tspan x="${d.width / 2}" dy="${i === 0 ? 0 : 100}">${escapeXml(l)}</tspan>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="0" y="0" width="14" height="${d.height}" fill="${p.accentColor}" />
  <rect x="60" y="${d.height - 80}" width="120" height="6" fill="${p.accentColor}" />
  <text x="${d.width / 2}" y="${titleY}" font-size="92" font-weight="800" fill="#ffffff" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${titleTspans}</text>
  <text x="${d.width / 2}" y="${d.height / 2 + 100}" font-size="36" fill="#cbd5e1" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="60" y="${d.height - 32}" font-size="20" fill="#94a3b8" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="${d.width - 60}" y="${d.height - 32}" font-size="22" font-weight="600" fill="${p.accentColor}" text-anchor="end" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderBusinessCard(p: TemplateSvgParams, d: TemplateSvgBox): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="0" y="0" width="${d.width}" height="22" fill="${p.accentColor}" />
  <text x="60" y="180" font-size="64" font-weight="700" fill="#0f1117" font-family="'Hiragino Mincho',serif">${escapeXml(p.title)}</text>
  <text x="60" y="240" font-size="28" fill="${p.accentColor}" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <line x1="60" y1="280" x2="${d.width - 60}" y2="280" stroke="${p.accentColor}" stroke-width="2" />
  <text x="60" y="340" font-size="22" fill="#475569" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="${d.width - 60}" y="${d.height - 56}" font-size="28" font-weight="700" fill="${p.accentColor}" text-anchor="end" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderSocialSquare(p: TemplateSvgParams, d: TemplateSvgBox): string {
  const lines = wrapLines(p.title, 14);
  const titleTspans = lines
    .map((l, i) => `<tspan x="${d.width / 2}" dy="${i === 0 ? 0 : 90}">${escapeXml(l)}</tspan>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <circle cx="${d.width - 100}" cy="100" r="180" fill="${p.accentColor}" opacity="0.18" />
  <circle cx="80" cy="${d.height - 80}" r="240" fill="${p.accentColor}" opacity="0.12" />
  <rect x="60" y="120" width="80" height="6" fill="${p.accentColor}" />
  <text x="${d.width / 2}" y="${d.height / 2 - lines.length * 30}" font-size="80" font-weight="800" fill="#ffffff" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${titleTspans}</text>
  <text x="${d.width / 2}" y="${d.height / 2 + 100}" font-size="34" fill="#cbd5e1" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="${d.width / 2}" y="${d.height - 80}" font-size="26" fill="${p.accentColor}" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="60" y="80" font-size="22" font-weight="600" fill="#ffffff" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderSocialStory(p: TemplateSvgParams, d: TemplateSvgBox): string {
  const lines = wrapLines(p.title, 11);
  const titleTspans = lines
    .map((l, i) => `<tspan x="${d.width / 2}" dy="${i === 0 ? 0 : 120}">${escapeXml(l)}</tspan>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <defs>
    <linearGradient id="bgG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.secondaryColor}" />
      <stop offset="100%" stop-color="${p.accentColor}" stop-opacity="0.4" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="url(#bgG)" />
  <rect x="${d.width / 2 - 60}" y="${d.height / 2 - 360}" width="120" height="8" fill="${p.accentColor}" />
  <text x="${d.width / 2}" y="${d.height / 2 - 80 - lines.length * 30}" font-size="120" font-weight="900" fill="#ffffff" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${titleTspans}</text>
  <text x="${d.width / 2}" y="${d.height / 2 + 200}" font-size="56" fill="#fafafa" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <rect x="${d.width / 2 - 200}" y="${d.height - 280}" width="400" height="80" rx="40" fill="${p.accentColor}" />
  <text x="${d.width / 2}" y="${d.height - 224}" font-size="38" font-weight="700" fill="#ffffff" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="${d.width / 2}" y="${d.height - 120}" font-size="32" fill="#cbd5e1" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderFlyerA4(p: TemplateSvgParams, d: TemplateSvgBox): string {
  const lines = wrapLines(p.body, 36);
  const bodyTspans = lines
    .map((l, i) => `<tspan x="80" dy="${i === 0 ? 0 : 56}">${escapeXml(l)}</tspan>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="#fdfbf7" />
  <rect x="0" y="0" width="${d.width}" height="380" fill="${p.accentColor}" />
  <rect x="0" y="380" width="${d.width}" height="14" fill="${p.secondaryColor}" />
  <text x="80" y="200" font-size="96" font-weight="800" fill="#ffffff" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.title)}</text>
  <text x="80" y="280" font-size="42" fill="#fefefe" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="80" y="500" font-size="40" fill="#1f2937" font-family="'Hiragino Sans',sans-serif">${bodyTspans}</text>
  <rect x="80" y="${d.height - 200}" width="${d.width - 160}" height="100" fill="${p.accentColor}" opacity="0.1" />
  <text x="${d.width / 2}" y="${d.height - 140}" font-size="38" font-weight="700" fill="${p.accentColor}" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderCertificate(p: TemplateSvgParams, d: TemplateSvgBox): string {
  const bodyLines = p.body.split('\n');
  // `split` は区切り文字が空でなければ必ず 1 要素以上返す ('' でも [''])。
  // Stryker disable next-line StringLiteral: 到達しない既定値 (1 行目は常に存在する)
  const bodyLine1 = bodyLines[0] ?? '';
  const bodyLine2 = bodyLines[1] ?? '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="40" y="40" width="${d.width - 80}" height="${d.height - 80}" fill="none" stroke="${p.accentColor}" stroke-width="6" />
  <rect x="60" y="60" width="${d.width - 120}" height="${d.height - 120}" fill="none" stroke="${p.accentColor}" stroke-width="2" />
  <text x="${d.width / 2}" y="${d.height / 2 - 220}" font-size="32" letter-spacing="12" fill="${p.accentColor}" text-anchor="middle" font-family="'Hiragino Mincho',serif">CERTIFICATE</text>
  <text x="${d.width / 2}" y="${d.height / 2 - 140}" font-size="120" font-weight="700" fill="#1f2937" text-anchor="middle" font-family="'Hiragino Mincho',serif">${escapeXml(p.title)}</text>
  <text x="${d.width / 2}" y="${d.height / 2 - 40}" font-size="56" fill="#1f2937" text-anchor="middle" font-family="'Hiragino Mincho',serif">${escapeXml(p.subtitle)}</text>
  <line x1="${d.width / 2 - 200}" y1="${d.height / 2}" x2="${d.width / 2 + 200}" y2="${d.height / 2}" stroke="${p.accentColor}" stroke-width="2" />
  <text x="${d.width / 2}" y="${d.height / 2 + 90}" font-size="34" fill="#374151" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(bodyLine1)}</text>
  <text x="${d.width / 2}" y="${d.height / 2 + 150}" font-size="34" fill="#374151" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(bodyLine2)}</text>
  <text x="${d.width / 2}" y="${d.height - 100}" font-size="32" font-weight="600" fill="${p.accentColor}" text-anchor="middle" font-family="'Hiragino Mincho',serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderInvoiceHeader(p: TemplateSvgParams, d: TemplateSvgBox): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.accentColor}" opacity="0.07" />
  <text x="80" y="130" font-size="84" font-weight="800" letter-spacing="6" fill="${p.accentColor}" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.title)}</text>
  <text x="80" y="190" font-size="28" fill="#475569" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="80" y="240" font-size="22" fill="#94a3b8" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="${d.width - 80}" y="80" font-size="32" font-weight="700" fill="#1f2937" text-anchor="end" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
  <rect x="0" y="${d.height - 6}" width="${d.width}" height="6" fill="${p.accentColor}" />
</svg>`;
}

function renderResumeHeader(p: TemplateSvgParams, d: TemplateSvgBox): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="0" y="0" width="280" height="${d.height}" fill="${p.accentColor}" />
  <circle cx="140" cy="${d.height / 2}" r="100" fill="#ffffff" opacity="0.18" />
  <text x="320" y="200" font-size="88" font-weight="800" fill="#ffffff" font-family="'Hiragino Mincho',serif">${escapeXml(p.title)}</text>
  <text x="320" y="280" font-size="36" fill="${p.accentColor}" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="320" y="380" font-size="26" fill="#cbd5e1" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="320" y="${d.height - 60}" font-size="24" fill="${p.accentColor}" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

// Stryker restore ArithmeticOperator



/** id → 組み立て。**全域の表**なので、id を足して配線を忘れると型が落ちる。 */
const RENDERERS = {
  'presentation-cover': renderPresentationCover,
  'business-card': renderBusinessCard,
  'social-square': renderSocialSquare,
  'social-story': renderSocialStory,
  'flyer-a4': renderFlyerA4,
  certificate: renderCertificate,
  'invoice-header': renderInvoiceHeader,
  'resume-header': renderResumeHeader,
} as const satisfies Record<string, (p: TemplateSvgParams, d: TemplateSvgBox) => string>;

/** 組み立てを持っているテンプレートの id。 */
export type TemplateSvgId = keyof typeof RENDERERS;

/** 同上 (並び順つき・目録との突き合わせに使う)。 */
export const TEMPLATE_SVG_IDS = Object.keys(RENDERERS) as readonly TemplateSvgId[];

/**
 * 知らない id かどうか。
 *
 * `Object.hasOwn` を使うのは、`'__proto__'` / `'constructor'` / `'toString'`
 * のようなプロトタイプ側の名前を通さないため (`templates.ts` の
 * `isTemplateId` が同じ理由で同じ形をしている)。
 */
export function hasTemplateSvg(id: unknown): id is TemplateSvgId {
  return typeof id === 'string' && Object.hasOwn(RENDERERS, id);
}

/**
 * 知らない id のときに出す物。
 *
 * 目録は payload なので、**組み立てを持たない id が届くことはありうる**
 * (古い版のブラウザ版に新しい目録が来る等)。以前はこの落としどころが
 * ブラウザ版と画面に 1 つずつ在り、どちらも黙って暗い矩形を返していた。
 * 1 つにして、**読めば分かる字**を入れる (プレビューが真っ黒になって
 * 理由が分からない、という形を残さない)。
 */
function renderUnknownTemplate(id: string, d: TemplateSvgBox): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(id)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="#222222" />
  <text x="24" y="48" font-size="24" fill="#e5e7eb" font-family="'Hiragino Sans',sans-serif">未対応のテンプレート: ${escapeXml(id)}</text>
</svg>`;
}

/**
 * **テンプレートを SVG に組む唯一の入口。**
 *
 * デスクトップ版の書き出し・ブラウザ版の書き出し・画面のプレビューが
 * ここを通る。3 つの出力が同一であることは
 * `shared/__tests__/templateSvgAgreement.test.ts` が実画面つきで留める。
 */
export function renderTemplateSvg(
  id: string,
  params: TemplateSvgParams,
  box: TemplateSvgBox,
): string {
  return hasTemplateSvg(id) ? RENDERERS[id](params, box) : renderUnknownTemplate(id, box);
}

/**
 * **緩い側の入口** — 読めない値を既定値へ落とす (throw しない)。
 *
 * ブラウザ版の書き出しと画面のプレビューが使う。ブラウザ版には IPC 境界が
 * 無く、呼ぶのはページ自身の UI なので、入力の途中で描画を止めない方が良い
 * (`templateParamsParity.test.ts` の「意図的に違う所」)。
 *
 * 色だけは**検証して落とす**: 属性値に素で入るので、`" onload="` のような
 * 値が通ると属性から抜けられる。他の項目と同じ `typeof` 判定を**先に**置く
 * —— `String(x ?? '')` で正規化してから `safeColor` に渡す書き方だと、
 * `''` を何に変えても結果が既定値のままで観測できる差が出ない
 * (殺せない変異体になる)。
 */
export function normalizeTemplateParams(
  raw: unknown,
  defaults: TemplateSvgParams,
): TemplateSvgParams {
  const o: Readonly<Record<string, unknown>> =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    title: typeof o.title === 'string' ? o.title : defaults.title,
    subtitle: typeof o.subtitle === 'string' ? o.subtitle : defaults.subtitle,
    body: typeof o.body === 'string' ? o.body : defaults.body,
    accentColor:
      typeof o.accentColor === 'string'
        ? safeColor(o.accentColor, defaults.accentColor)
        : defaults.accentColor,
    secondaryColor:
      typeof o.secondaryColor === 'string'
        ? safeColor(o.secondaryColor, defaults.secondaryColor)
        : defaults.secondaryColor,
    brandText: typeof o.brandText === 'string' ? o.brandText : defaults.brandText,
  };
}
