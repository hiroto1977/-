/**
 * 業務仕分け —— 81 の画面を、全社の業務のどこに置くかを 1 か所で決める (2026-11-23)。
 *
 * 全社の業務を AI で回す仕組みは 4 層に分けて考える:
 *
 * | 層 | このアプリで担う物 |
 * | --- | --- |
 * | データ基盤 | 端末の保管層 (売上・実績・貸借対照表・チーム…)・ライブラリ・知識の保管庫 |
 * | AI 連携 (司令塔) | AI アシスタント・AIの村・コンシェルジュ・スキル・コネクター |
 * | 業務実行 | 6 つの業務区分の画面 (下の `BusinessArea`) |
 * | ガバナンス・人の承認 | 外へ書き込む・送る操作の前の確認、保管庫、品質と監査 |
 *
 * 業務実行の画面は 6 区分のどれか 1 つに、それ以外 (どの業務にも共通の物) は
 * 共通基盤 (`platform`) の 3 つの層のどれか 1 つに置く。**1 つの画面は 1 か所だけ** ——
 * 2 か所に置くと「どこを開けばよいか」に 2 通りの答えが出る。
 *
 * 表は `ServiceId` の全件を持つ (`Record<ServiceId, …>` なので、画面を足して書き忘れると型検査が落ちる)。
 * 人の承認が要るか・データがどこから来るかは**この表に書かない** —— それぞれ
 * `ACTION_TIER` (`shared/actionTier.ts`) と `SERVICE_DATA_ORIGIN` (`shared/dataOrigin.ts`) から導く
 * (同じ事実を 2 か所に書くと食い違う)。
 */

import type { ServiceId } from '../../shared/serviceId';
import { ACTION_TIER, CONFIRMED_TIERS, OUTBOUND_TIERS } from '../../shared/actionTier';
import { lookup } from '../../shared/lookup';

/** 業務の区分 (6 つ) と、どの業務にも共通の基盤。 */
export type BusinessArea = 'front' | 'center' | 'middle' | 'back' | 'field' | 'management' | 'platform';

/** 共通基盤の中の層。業務区分の画面は層を持たない (業務実行の層に居る)。 */
export type PlatformLayer = 'data' | 'orchestration' | 'governance';

/** サイドバーと社内ポータルで並べる順。業務の流れ (集客 → 受注 → 審査 → 処理 → 現場 → 経営) の順で、基盤は最後。 */
export const AREA_ORDER: readonly BusinessArea[] = ['front', 'center', 'middle', 'back', 'field', 'management', 'platform'];

export const AREA_LABEL: Readonly<Record<BusinessArea, string>> = {
  front: 'フロントオフィス',
  center: 'センターオフィス',
  middle: 'ミドルオフィス',
  back: 'バックオフィス',
  field: '開発・製造・現場',
  management: '経営・ガバナンス',
  platform: '共通基盤 (データ・AI・守り)',
};

/** 区分の見出しに添える絵文字 (飾り —— 文字は `AREA_LABEL` が持つ)。 */
export const AREA_EMOJI: Readonly<Record<BusinessArea, string>> = {
  front: '🤝',
  center: '📞',
  middle: '⚖️',
  back: '🧾',
  field: '🛠',
  management: '📊',
  platform: '🧱',
};

/** 区分が受け持つ業務 (社内ポータルの業務マップに出す 1 行)。 */
export const AREA_DUTY: Readonly<Record<BusinessArea, string>> = {
  front: '集客・見込み客・販売・発信 —— お客様と最初に出会う所。',
  center: '問い合わせ・連絡・予定・受注 —— お客様と社内をつなぐ所。',
  middle: '契約・法務・審査・仕入 —— 取引のリスクを判断する所。',
  back: '経理・税務・給与・人事・書類 —— 決まった手順で処理する所。',
  field: '開発・品質・運用・栽培 —— ものを作り、動かす所。',
  management: '予実・指標・投資・資金・戦略 —— 数字で舵を取る所。',
  platform: 'データの保管・AI の司令塔・守りと承認 —— どの業務にも共通の土台。',
};

export const LAYER_LABEL: Readonly<Record<PlatformLayer, string>> = {
  data: 'データ基盤',
  orchestration: 'AI 連携 (司令塔)',
  governance: 'ガバナンス・人の承認',
};

export interface AreaPlacement {
  readonly area: BusinessArea;
  /** 共通基盤のときだけ。どの層か。 */
  readonly layer?: PlatformLayer;
  /** なぜそこに置いたか (1 文)。 */
  readonly why: string;
}

const at = (area: Exclude<BusinessArea, 'platform'>, why: string): AreaPlacement => ({ area, why });
const base = (layer: PlatformLayer, why: string): AreaPlacement => ({ area: 'platform', layer, why });

export const SERVICE_AREA: Readonly<Record<ServiceId, AreaPlacement>> = {
  // ── フロントオフィス: 集客・販売・発信
  salesforce: at('front', '見込み客と商談を管理する。'),
  shopify: at('front', '自社の店で商品を売る。'),
  base: at('front', '自社の店で商品を売る。'),
  amazon: at('front', 'モールで商品を売る。'),
  'amazon-associates': at('front', '紹介で売上を得る (集客)。'),
  a8net: at('front', '紹介の成果を記録する (集客)。'),
  topseller: at('front', '出品を管理して売る。'),
  coconala: at('front', 'スキルを出品して売る。'),
  tiktok: at('front', '動画で発信して集客する。'),
  youtube: at('front', '動画で発信して集客する。'),
  wordpress: at('front', '自社サイトで発信する。'),
  'ai-blogkun': at('front', '記事を書いて発信する。'),
  canva: at('front', '販促物をデザインする。'),
  'google-analytics': at('front', 'サイトの訪問者と流入元を見る (集客の結果)。'),

  // ── センターオフィス: 問い合わせ・連絡・予定・受注
  gmail: at('center', 'お客様・取引先とメールでやり取りする。'),
  'microsoft-365': at('center', 'メールと予定で社内外をつなぐ。'),
  slack: at('center', '社内の連絡をまとめる。'),
  discord: at('center', 'コミュニティと連絡する。'),
  line: at('center', 'お客様とメッセージでやり取りする。'),
  calendar: at('center', '予定を調整する。'),
  sales: at('center', '受けた注文と売上を記録する (受注処理)。'),

  // ── ミドルオフィス: 契約・法務・審査・仕入
  compliance: at('middle', '取引に関わる法令を確かめる。'),
  docstudio: at('middle', '契約書・発注書などを作り、交付前に検める。'),
  lawyer: at('middle', '契約と紛争のリスクを相談する。'),
  'judicial-scrivener': at('middle', '登記の手続きを相談する。'),
  'admin-scrivener': at('middle', '許認可の手続きを相談する。'),
  'patent-attorney': at('middle', '知的財産のリスクを相談する。'),
  netsea: at('middle', '商品を仕入れる (需給と在庫の判断)。'),
  'super-delivery': at('middle', '商品を仕入れる (需給と在庫の判断)。'),

  // ── バックオフィス: 経理・税務・給与・人事・書類
  freee: at('back', '仕訳と会計を処理する。'),
  moneyforward: at('back', '仕訳と会計を処理する。'),
  stripe: at('back', '入金と決済を確かめる。'),
  tax: at('back', '税金を試算する。'),
  'tax-accountant': at('back', '税務と申告を相談する。'),
  cpa: at('back', '会計と監査を相談する。'),
  'labor-consultant': at('back', '労務と社会保険を相談する。'),
  team: at('back', 'メンバーと役割を管理する。'),
  talent: at('back', '採用と育成を計画する。'),
  teamradar: at('back', 'チームの強みを見える化する (人事)。'),
  mentor: at('back', 'メンバーの相談を受ける (人事)。'),
  emotions: at('back', '気分を記録して働き方を見直す (人事)。'),
  templates: at('back', '定型の書式を出す。'),

  // ── 開発・製造・現場
  github: at('field', 'コードを管理する。'),
  atlassian: at('field', '開発の課題を管理する。'),
  linear: at('field', '開発の課題を管理する。'),
  asana: at('field', '作業の段取りを管理する。'),
  sentry: at('field', '動いているアプリの不具合を見張る。'),
  cursor: at('field', 'AI でコードを書く (利用状況を見る)。'),
  docker: at('field', '動かしている仕組みを管理する。'),
  linux: at('field', '端末の状態を見る。'),
  cloudflare: at('field', 'サイトの配信を運用する。'),
  hydroponics: at('field', '栽培・養蜂・養殖の現場を管理する。'),

  // ── 経営・ガバナンス
  overview: at('management', '経営の全体を 1 枚で見る。'),
  business: at('management', '事業ごとの数字を見る。'),
  kpi: at('management', '予算と実績・損益分岐点を管理する。'),
  charts: at('management', '数字を図で見る。'),
  funding: at('management', '資金調達の機会を探す。'),
  stocks: at('management', '株式の投資を判断する。'),
  'real-estate': at('management', '不動産の投資を判断する。'),
  'mutual-funds': at('management', '投資信託の投資を判断する。'),
  vrio: at('management', '強みを分析して戦略を立てる。'),
  'sme-consultant': at('management', '経営の改善を相談する。'),
  watch: at('management', '週ごとの変化を要約して報告する。'),

  // ── 共通基盤: データ基盤
  library: base('data', '書き出した書類と控えをまとめて保管する。'),
  storage: base('data', '端末の保管場所を整える。'),
  drive: base('data', '会社のファイルを保管する。'),
  dropbox: base('data', '会社のファイルを保管する。'),
  notion: base('data', '社内の知識と手順を残す (暗黙知の言語化)。'),
  obsidian: base('data', '知識のノートをつなぐ。'),

  // ── 共通基盤: AI 連携 (司令塔)
  home: base('orchestration', 'すべての業務の入口。'),
  assistant: base('orchestration', 'AI に相談し、複数の AI を比べる。'),
  village: base('orchestration', 'AI の組織に話しかけて仕事を振る。'),
  skills: base('orchestration', '決まった手順を AI に任せる。'),
  connectors: base('orchestration', 'サービスどうしを自動でつなぐ。'),
  ollama: base('orchestration', '端末の中の AI を動かす。'),
  grok: base('orchestration', '外部の AI に相談する。'),

  // ── 共通基盤: ガバナンス・人の承認
  security: base('governance', '守りの状態を確かめる。'),
  settings: base('governance', '保管庫・送り先・承認の設定をする。'),
  quality: base('governance', 'アプリの品質と監査の状態を見る。'),
};

/**
 * 表に無い id (型の外から来た値) の置き場所。prototype の鍵 (`__proto__` ほか) で引いても
 * prototype の値を返さないよう、表は `lookup` で引き、無ければこれへ倒す。
 */
export const UNPLACED: AreaPlacement = { area: 'platform', layer: 'governance', why: '置き場所がまだ決まっていない画面。' };

/** その画面の置き場所。 */
export function areaOf(id: ServiceId): AreaPlacement {
  return lookup(SERVICE_AREA, id) ?? UNPLACED;
}

/** その画面に、人の確認が要る操作 (外へ書き込む・消す・資格情報を書く) が在るか。`ACTION_TIER` から導く。 */
export function needsHumanApproval(id: ServiceId): boolean {
  return Object.entries(ACTION_TIER).some(([key, tier]) => key.startsWith(`${id}/`) && CONFIRMED_TIERS.has(tier));
}

/** その画面に、端末の外へ送る操作 (書き込み・AI への送信) が在るか。`ACTION_TIER` から導く。 */
export function sendsOutside(id: ServiceId): boolean {
  return Object.entries(ACTION_TIER).some(([key, tier]) => key.startsWith(`${id}/`) && OUTBOUND_TIERS.has(tier));
}
