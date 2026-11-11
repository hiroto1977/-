/**
 * 事業継続の台帳 —— 「他社のクラウドが止まったとき、このアプリで何が止まり、何が動き続けるか」
 * (2026-11-11)。正は `docs/CLOUD_CONTINUITY.md`。
 *
 * ## 立て付け
 *
 * - **事業の記録 (売上・KPI・貸借対照表・書類ほか) の正本は端末に在る。** クラウドは「預かるデータを見せる先」と
 *   「一部の操作を助ける先」であって、止まっても端末の記録の読み書きは止まらない。
 * - どのサービスがどちらに当たるかは**手で書かない**。既に在る 2 つの宣言から導く:
 *   出どころ (`SERVICE_DATA_ORIGIN`) が `remote` なら「クラウドが預かるデータを見る画面」、
 *   端末の外へ出る action (`ACTION_TIER` の `external-write` / `egress`) を持てば「一部の操作だけクラウドを使う画面」。
 * - 手で書くのは**提供者ごとの行**だけ (何を預けているか・止まったら何が起きるか・その間どう続けるか)。
 *   行の `services` の和は、上で導いた「クラウドに依る画面」と両方向に一致する
 *   (`src/shared/__tests__/cloudContinuity.test.ts`)。
 *
 * ## このモジュールが言わないこと
 *
 * 賠償や訴訟の責任を誰が負うかは**契約と法律**で決まる。台帳は「何を預けているか」を並べるだけで、
 * 責任を移す働きは持たない (`LIABILITY_NOTE`)。
 */
import { ACTION_TIER, OUTBOUND_TIERS } from './actionTier';
import { originOf } from './dataOrigin';
import { has, lookup } from './lookup';
import { SERVICE_IDS, type ServiceId } from './serviceId';

/** クラウドが止まったときの、その画面の立ち位置。 */
export type ContinuityClass = 'local' | 'cloud-assist' | 'cloud-data';

/**
 * 端末の外へ出る action を持つが、相手が「他社のクラウド」ではないサービス (理由つき)。
 * 両方向: ここに在るのに外へ出る action を持たなくなったら検査が落ちる。
 */
export const OUTBOUND_NOT_THIRD_PARTY: Readonly<Record<string, string>> = {
  ollama:
    '相手は利用者自身の Ollama (既定は同じ端末の 127.0.0.1)。他社が運用するクラウドではないので、止まる・止まらないは利用者の端末の側で決まる。',
};

/** そのサービスが、端末の外へ出る action を 1 つでも持つか (`ACTION_TIER` から導く)。 */
export function hasOutboundAction(id: string): boolean {
  const prefix = id + '/';
  return Object.keys(ACTION_TIER).some((key) => {
    if (!key.startsWith(prefix)) return false;
    const tier = lookup(ACTION_TIER, key);
    return tier !== undefined && OUTBOUND_TIERS.has(tier);
  });
}

/** クラウドが止まったときの立ち位置を、出どころと action の段階から導く。 */
export function continuityClassOf(id: ServiceId): ContinuityClass {
  if (originOf(id) === 'remote') return 'cloud-data';
  if (hasOutboundAction(id) && !has(OUTBOUND_NOT_THIRD_PARTY, id)) return 'cloud-assist';
  return 'local';
}

export const CONTINUITY_CLASS_LABEL: Readonly<Record<ContinuityClass, string>> = {
  local: 'この端末だけで動く',
  'cloud-assist': '端末で動き、一部の操作だけクラウドを使う',
  'cloud-data': 'クラウドが預かるデータを見る',
};

export type CloudProviderKind = 'data' | 'assist' | 'infrastructure';

export interface CloudProvider {
  readonly id: string;
  /** 提供者 (運用している会社・サービス) の名前。 */
  readonly label: string;
  readonly kind: CloudProviderKind;
  /** この提供者に依る画面。`infrastructure` は画面に結び付かないので空。 */
  readonly services: readonly ServiceId[];
  /** 何を預けているか (その提供者が管理している物)。 */
  readonly entrusted: string;
  /** 止まったとき、このアプリで起きること。 */
  readonly whenDown: string;
  /** その間の続け方。 */
  readonly meanwhile: string;
  /**
   * サービスの id ではない資格情報のスロットで、この提供者を使っていることを示す物。
   * ブラウザ版の設定画面は AI の鍵を `anthropic` というスロットに預かる (サービスの id ではない)。
   */
  readonly slots?: readonly string[];
  /** `infrastructure` の行が指す実物 (リポジトリの中の道)。画面に結び付かない行が散文だけにならないため。 */
  readonly evidence?: string;
}

/** クラウドが預かるデータを見る画面に共通の振る舞い (`useServiceData` の実測)。 */
export const CLOUD_DATA_WHEN_DOWN =
  'その画面の取得が失敗し、取得エラーを表示します。直前に取得した内容は画面を開いている間だけ残り、開き直すと同梱の見本に戻ります。その提供者への書き込みもできません。';

export const CLOUD_DATA_MEANWHILE =
  '端末の記録 (売上・KPI・書類ほか) はそのまま使えます。預けてあるデータそのものは提供者の側に在るので、復旧を待つか、提供者の画面・書き出しの機能で確かめます。';

export const CLOUD_PROVIDERS: readonly CloudProvider[] = [
  {
    id: 'github',
    label: 'GitHub',
    kind: 'data',
    services: ['github'],
    entrusted: 'リポジトリ・Issue・プルリクエスト。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'wordpress',
    label: 'WordPress.com',
    kind: 'data',
    services: ['wordpress'],
    entrusted: 'サイトと投稿。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'atlassian',
    label: 'Atlassian (Jira / Confluence)',
    kind: 'data',
    services: ['atlassian'],
    entrusted: '課題とページ。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'notion',
    label: 'Notion',
    kind: 'data',
    services: ['notion'],
    entrusted: 'ページとデータベース。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'google',
    label: 'Google (Drive / カレンダー / Gmail / YouTube)',
    kind: 'data',
    services: ['drive', 'calendar', 'gmail', 'youtube'],
    entrusted: 'ファイル・予定・メール・チャンネルの統計。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'slack',
    label: 'Slack',
    kind: 'data',
    services: ['slack'],
    entrusted: 'チャンネルとメッセージ。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'canva',
    label: 'Canva',
    kind: 'data',
    services: ['canva'],
    entrusted: 'デザインとフォルダ。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    kind: 'data',
    services: ['cloudflare'],
    entrusted: 'DNS のゾーンとレコード。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'microsoft',
    label: 'Microsoft 365',
    kind: 'data',
    services: ['microsoft-365'],
    entrusted: 'メールと予定。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'base',
    label: 'BASE',
    kind: 'data',
    services: ['base'],
    entrusted: 'ネットショップの商品と注文。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'freee',
    label: 'freee',
    kind: 'data',
    services: ['freee'],
    entrusted: '会計の取引。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    kind: 'data',
    services: ['cursor'],
    entrusted: 'チームの利用状況。',
    whenDown: CLOUD_DATA_WHEN_DOWN,
    meanwhile: CLOUD_DATA_MEANWHILE,
  },
  {
    id: 'ai',
    label: 'AI の提供者 (Anthropic / OpenAI / Google / xAI / 利用者が設定した互換 API)',
    kind: 'assist',
    services: ['assistant', 'skills', 'emotions', 'stocks', 'business', 'uber-eats', 'demae-can', 'real-estate', 'mutual-funds'],
    slots: ['anthropic'],
    entrusted: '預けている記録はありません。質問のたびに、質問文と添えた文脈を送ります。',
    whenDown:
      'AI の応答 (AI アシスタント・コンシェルジュの自由質問・AI の村・助言・スキルの実行・感情ログの分析) が失敗し、理由を表示します。',
    meanwhile:
      '税・KPI・書面などの計算は AI を使わないのでそのまま動きます。AI は別の提供者か、端末の中の Ollama に切り替えられます。',
  },
  {
    id: 'breach-lookup',
    label: 'Have I Been Pwned / VirusTotal',
    kind: 'assist',
    services: ['security'],
    entrusted: '預けている記録はありません。確かめるメールアドレスと URL を、その都度送ります。',
    whenDown: 'メールアドレスの漏洩確認と URL のスキャンが失敗し、理由を表示します。',
    meanwhile: 'パスワード強度チェッカーとローカルの検出は端末の中だけで動きます。',
  },
  {
    id: 'connectors',
    label: '連携先への通知 (Slack / Discord / LINE / Gmail / Notion / Salesforce / Stripe)',
    kind: 'assist',
    services: ['shopify'],
    entrusted: '預けている記録はありません。同期のたびに、注文の内容を連携先へ送ります。',
    whenDown: '連携先への同期が失敗し、理由を返します。',
    meanwhile: '注文と売上の記録は端末に残るので、売上集計はそのまま使えます。同期は復旧してからやり直します。',
  },
  {
    id: 'hosting',
    label: '公開サイトの置き場 (GitHub Pages)',
    kind: 'infrastructure',
    services: [],
    entrusted: 'ブラウザ版の HTML の配信。データは預けていません。',
    whenDown:
      '新しい端末からは開けません。1 度開いた端末は、ブラウザに残った控え (Service Worker) から同じアドレスで開けます。',
    meanwhile:
      'デスクトップ版と、手元に保存した HTML (単一ファイル) は影響を受けません。同じファイルを別の置き場に置けば、そこからも開けます。',
    evidence: '.github/workflows/pages.yml',
  },
  {
    id: 'proxy',
    label: '利用者が建てたプロキシ (Cloudflare Workers)',
    kind: 'infrastructure',
    services: [],
    entrusted: 'ブラウザ版から外部サービスへの中継。データは保存しません。',
    whenDown: 'ブラウザ版から外部サービスへの書き込みと、プロキシ経由の取得が失敗します。',
    meanwhile: 'デスクトップ版は各サービスへ直接つなぐので、プロキシが止まっても動きます。',
    evidence: 'docs/PROXY_EXAMPLE.md',
  },
  {
    id: 'update-check',
    label: '更新の確認 (GitHub Releases)',
    kind: 'infrastructure',
    services: [],
    entrusted: '新しい版の有無の問い合わせ。データは預けていません。',
    whenDown: '更新の有無を確かめられません。',
    meanwhile: 'アプリは今の版のまま動き続けます。',
    evidence: 'src/shared/updateCheck.mamori',
  },
];

/**
 * 預けても自社に残る物 (契約の当事者として・法律の上で)。
 * 個人データの委託と漏えい時の報告は、確証済みのコンプライアンスの知識 (`complianceKnowledge.ts`) と同じ内容。
 */
export const RESPONSIBILITY_STAYS: readonly string[] = [
  '預けたデータの中身と共有の設定、アカウントの管理 (パスワード・多要素認証・権限) は、預けた側の持ち分です。',
  '個人データの取扱いを委託するなら、委託先の監督は委託元の義務です (個人情報保護法 25 条)。委託先で漏えいが起きたときの報告も、原則として委託元が負います。',
  'AI へ何を送るか、応答をどう使うかを決めるのは自社です。',
  '税の申告・書面の記載・取引先との契約の当事者は自社のままです。',
];

/** 責任の所在についての断り。台帳は責任を移さない。 */
export const LIABILITY_NOTE =
  'クラウドに預けても、賠償や訴訟の責任がそのまま提供者へ移るわけではありません。どこまでを提供者が負うかは、各社との契約 (責任の上限・補償・稼働率の約束) と法律で決まります。このアプリは責任の所在を変えません —— 契約の条項は、提供者ごとに確かめてください。';

/** 提供者と、そのうち資格情報を預けている画面 (スロットだけで当たったときは空)。 */
export interface OutageExposure {
  readonly provider: CloudProvider;
  readonly configured: readonly ServiceId[];
}

/**
 * 資格情報を預けている画面から、「いま依っている提供者」を台帳の順で返す。
 * 画面に結び付かない行 (`infrastructure`) は含めない —— 資格情報の有無では決まらないので、別に並べる。
 */
export function outageExposure(configured: readonly string[]): readonly OutageExposure[] {
  const held = new Set(configured);
  const out: OutageExposure[] = [];
  for (const provider of CLOUD_PROVIDERS) {
    const mine = provider.services.filter((id) => held.has(id));
    const bySlot = (provider.slots ?? []).some((slot) => held.has(slot));
    if (mine.length > 0 || bySlot) out.push({ provider, configured: mine });
  }
  return out;
}

export interface ContinuityTotals {
  readonly total: number;
  readonly local: number;
  readonly cloudAssist: number;
  readonly cloudData: number;
}

/** 全サービスを立ち位置ごとに数える。 */
export function continuityTotals(ids: readonly ServiceId[] = SERVICE_IDS): ContinuityTotals {
  let local = 0;
  let cloudAssist = 0;
  let cloudData = 0;
  for (const id of ids) {
    const c = continuityClassOf(id);
    if (c === 'local') local += 1;
    else if (c === 'cloud-assist') cloudAssist += 1;
    else cloudData += 1;
  }
  return { total: ids.length, local, cloudAssist, cloudData };
}
