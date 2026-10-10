import {
  normalizeTemplateParams,
  renderTemplateSvg,
  type TemplateSvgParams,
} from '../shared/templateSvg';
/**
 * ブラウザ版のテンプレート —— **目録だけをここに持つ**。
 *
 * `web-shim.ts` が読み、単一 HTML のビルドが IPC なしで SVG を書き出す。
 * ディスクへ書かないので書き出し先の関門は要らない。
 *
 * ## 組み立ては持たない (2026-09-12 · パス 184)
 *
 * ここには 8 テンプレート分の SVG 組み立てが写経されていた。実測すると
 * **8 つすべてがデスクトップ版と違う SVG** で、こちら側だけ `role="img"` /
 * `aria-label` (代替テキスト) と `font-family` (明朝 / ゴシックの使い分け) を
 * 失っていた —— 同じテンプレートなのにブラウザ版で書き出した SVG は
 * 読み上げできない、という差である。組み立ては
 * `src/shared/templateSvg.ts` の 1 つに畳んだ (経緯と実測表はそちらの冒頭)。
 *
 * 目録がここに残るのは、**デスクトップ版の目録が表示用の `label` /
 * `description` を持つ**ためで、これは意図的な差として
 * `shared/__tests__/templateCatalogParity.test.ts` が両方向に留めている。
 */

/** 欄の形は共有の 1 つ (写すと片方だけ欄が増える)。 */
export type TemplateParams = TemplateSvgParams;

export interface TemplateDef {
  id: string;
  width: number;
  height: number;
  defaults: TemplateParams;
}

export const TEMPLATE_CATALOG_FOR_WEB: readonly TemplateDef[] = [
  { id: 'presentation-cover', width: 1920, height: 1080, defaults: { title: '次世代 営業戦略 2035', subtitle: 'Q2 全社レビュー · 5/15 オンライン', body: '営業部 / 経営企画チーム · Internal Use Only', accentColor: '#5b8def', secondaryColor: '#0f1117', brandText: 'Acme Corp.' } },
  { id: 'business-card', width: 1075, height: 650, defaults: { title: '山田 太郎', subtitle: '営業部 主任', body: 'taro.yamada@example.com · +81-3-1234-5678', accentColor: '#0f5fac', secondaryColor: '#f8f8f8', brandText: 'Acme Corp.' } },
  { id: 'social-square', width: 1080, height: 1080, defaults: { title: '新製品リリースのお知らせ', subtitle: '5月20日から全国主要書店で発売開始', body: '@acme · #新製品 #本日発売', accentColor: '#ec9a3d', secondaryColor: '#181c25', brandText: 'Acme Corp.' } },
  { id: 'social-story', width: 1080, height: 1920, defaults: { title: '春の限定セール', subtitle: '対象商品 30% OFF', body: '5月20日まで · オンラインストア限定', accentColor: '#e36b6b', secondaryColor: '#0f1117', brandText: 'Acme Corp.' } },
  { id: 'flyer-a4', width: 1240, height: 1754, defaults: { title: '無料セミナー開催', subtitle: '中小企業のための DX 入門', body: '日時: 2035年5月20日 14:00-16:00\n会場: 東京都港区 Acme ホール\n申込: acme.example/seminar', accentColor: '#5cb85c', secondaryColor: '#181c25', brandText: 'Acme Corp.' } },
  { id: 'certificate', width: 1754, height: 1240, defaults: { title: '修了証書', subtitle: '山田 太郎 殿', body: '上記の方は当社が定める研修プログラムを修了されたことを証明します。\n2035年4月15日', accentColor: '#a06bd2', secondaryColor: '#fdfbf7', brandText: 'Acme Training Institute' } },
  { id: 'invoice-header', width: 1240, height: 350, defaults: { title: 'INVOICE', subtitle: '請求書番号: INV-2035-0042', body: '発行日: 2035-05-15 · 支払期限: 2035-06-15', accentColor: '#0f5fac', secondaryColor: '#f8f8f8', brandText: 'Acme Corp.' } },
  { id: 'resume-header', width: 1240, height: 600, defaults: { title: '山田 太郎', subtitle: '営業部 / Sales Lead · 7年', body: 'Tokyo, Japan · taro.yamada@example.com', accentColor: '#43c3b8', secondaryColor: '#0f1117', brandText: '' } },
];

/**
 * 目録の 1 件を SVG にする (ブラウザ版の書き出し・画面のプレビューが通る道)。
 *
 * 読めない値は既定値へ落とす —— throw しないのは意図的で、理由は
 * `shared/__tests__/templateParamsParity.test.ts` (「意図的に違う所 ——
 * main だけが境界の番人を持つ」) に書いてある。
 */
export function renderTemplateForWeb(def: TemplateDef, params: unknown): string {
  return renderTemplateSvg(def.id, normalizeTemplateParams(params, def.defaults), def);
}
