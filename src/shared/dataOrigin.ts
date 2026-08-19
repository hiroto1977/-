import type { ServiceId } from './serviceId';

/**
 * 画面に出ている数字が **どこから来たのか** をサービス単位で宣言する。
 *
 * これが無かった時に起きていたこと (2026-08 監査):
 * `useServiceData` は fetch が成功したら無条件に `setData(result.data)` +
 * `setSource('live')` していた。ところが公式 API 未配線のサービスは
 * `createSnapshotStub` / `createShigyoFetcher` が返す **空の stub** を成功として
 * 返すため、「更新」を押すと画面が同梱 snapshot から空へ置き換わり、しかも
 * バッジは緑の「ライブ」になった。士業ページなら顧問料・未払請求・連絡先・
 * 相談履歴が 0 件になり、それが最新の実データであるかのように見える。
 * 決算書類・申告書類へ流れる数字を扱うアプリで、これは単なる表示崩れでは
 * 済まない。
 *
 * ブラウザ版 (`web-shim.ts`) では同じサービスが `not_implemented` を返すため、
 * 取得先が無いだけなのに「エラー」と出ていた。どちらも「取得しない」ことを
 * 型として持っていなかったのが原因。
 *
 * 分類は判断ではなく、ソースツリーから機械的に決まる規則にしている
 * (`scripts/lint-data-origin.cjs` が双方向で照合する):
 *
 * - `sample` — fetcher が stub (`createSnapshotStub` / `createShigyoFetcher` /
 *   `return STUB`)。I/O は一切無い。画面は同梱データを出す。
 * - `local`  — stub ではなく `LOCAL_SERVICES` に載っている。OS・ファイル・
 *   レコードストアから導出し、資格情報を必要としない。
 * - `remote` — stub ではなく `LOCAL_SERVICES` に無い。利用者の資格情報で
 *   外部 API を叩く。
 *
 * 総和型 `Record<ServiceId, DataOrigin>` にしているので、`SERVICE_IDS` へ
 * サービスを足すと **tsc がここの記入漏れを弾く**。`LIVE_FETCHERS` のような
 * モジュール読込時 throw は置いていない: 型で漏れが出ない場所に実行時の
 * 番犬を足しても観測差が無く、mutation テストで殺せない番犬が残るだけ。
 */
export type DataOrigin = 'remote' | 'local' | 'sample';

export const SERVICE_DATA_ORIGIN: Record<ServiceId, DataOrigin> = {
  home: 'local',
  village: 'local',
  github: 'remote',
  wordpress: 'remote',
  atlassian: 'remote',
  notion: 'remote',
  drive: 'remote',
  calendar: 'remote',
  gmail: 'remote',
  slack: 'remote',
  canva: 'remote',
  skills: 'local',
  security: 'local',
  cloudflare: 'remote',
  emotions: 'local',
  ollama: 'local',
  kpi: 'local',
  stocks: 'local',
  business: 'local',
  teamradar: 'local',
  templates: 'local',
  library: 'local',
  settings: 'local',
  'uber-eats': 'sample',
  'demae-can': 'sample',
  'real-estate': 'sample',
  'mutual-funds': 'sample',
  charts: 'sample',
  quality: 'sample',
  'microsoft-365': 'remote',
  dropbox: 'sample',
  salesforce: 'sample',
  discord: 'sample',
  asana: 'sample',
  linear: 'sample',
  sentry: 'sample',
  shopify: 'sample',
  stripe: 'sample',
  line: 'sample',
  storage: 'sample',
  'tax-accountant': 'sample',
  'labor-consultant': 'sample',
  lawyer: 'sample',
  'judicial-scrivener': 'sample',
  'admin-scrivener': 'sample',
  'sme-consultant': 'sample',
  'patent-attorney': 'sample',
  cpa: 'sample',
  base: 'remote',
  netsea: 'sample',
  'super-delivery': 'sample',
  topseller: 'sample',
  a8net: 'sample',
  'ai-blogkun': 'sample',
  moneyforward: 'sample',
  amazon: 'sample',
  'amazon-associates': 'sample',
  sales: 'sample',
  team: 'sample',
  youtube: 'remote',
  overview: 'sample',
  coconala: 'sample',
  tiktok: 'sample',
  tax: 'sample',
  funding: 'local',
  freee: 'remote',
  connectors: 'sample',
  linux: 'local',
  compliance: 'sample',
  obsidian: 'sample',
  docker: 'sample',
  assistant: 'local',
  docstudio: 'local',
  cursor: 'remote',
};

/** 宣言された取得元。未知の id は最も慎重な側 (`sample`) に寄せる。 */
export function originOf(id: ServiceId): DataOrigin {
  if (!Object.hasOwn(SERVICE_DATA_ORIGIN, id)) return 'sample';
  return SERVICE_DATA_ORIGIN[id];
}

/**
 * 取得を試みる意味があるか。`sample` は取得先が存在しないので、押せば必ず
 * 「空の成功」か「未実装エラー」のどちらかにしかならない。呼ばないのが正しい。
 */
export function isRefreshable(origin: DataOrigin): boolean {
  return origin !== 'sample';
}

export interface OriginLabel {
  /** バッジ文字列。 */
  readonly text: string;
  /** 緑 (ok) を出すのは「実際に取ってきた」時だけ。 */
  readonly tone: 'ok' | 'neutral';
}

/**
 * バッジ表示。`source` は `useServiceData` の状態 (取得済みか否か)。
 *
 * `sample` は取得の有無に関係なく常に「内蔵サンプル」。外部にも手元にも
 * 取得先が無い画面で「スナップショット」と出すと、更新すれば新しくなると
 * 読めてしまうため、言葉を分けている。
 *
 * **`remote` の未取得は「サンプル（未連携）」と言い切る。** ここは以前
 * 「スナップショット」と出していたが、それは *実データをある時点で写した
 * もの* と読める。実際に出ているのは同梱の作り物 — Cursor の画面なら
 * 佐藤健・鈴木彩・田中悠という**架空の 3 人**とその利用額である。氏名と
 * メールの形をしている分、実在の同僚と受け取られる余地があった
 * (実際にそう問われて気付いた)。連携していないことを言葉に出す。
 */
export function describeOrigin(origin: DataOrigin, source: 'snapshot' | 'live'): OriginLabel {
  if (origin === 'sample') return { text: '内蔵サンプル', tone: 'neutral' };
  if (origin === 'remote' && source === 'snapshot') {
    return { text: 'サンプル（未連携）', tone: 'neutral' };
  }
  if (source === 'snapshot') return { text: 'スナップショット', tone: 'neutral' };
  if (origin === 'local') return { text: 'ローカル', tone: 'ok' };
  return { text: 'ライブ', tone: 'ok' };
}
