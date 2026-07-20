/**
 * 士業 8 種への「事業仕分け」マップ — アプリの各機能・事業を、どの専門家が
 * 担当領域とするかの単一データ源。
 *
 * `components/ShigyoConsole.tsx` の「担当領域」セクションがこのマップを描画し、
 * 各 duty の `link` は `servicehub:navigate` CustomEvent でアプリ内遷移する。
 * duty には業際の別 (`scope`) を付す: 独占業務 (無資格者が業として行うと
 * 士業法違反になり得る領域) と、独占ではない専門相談領域を区別する。
 * 中小企業診断士のみ独占業務を持たない (経営コンサルの登録制国家資格)。
 *
 * 出典 (要約の根拠条文): 税理士法2条・52条 / 公認会計士法2条・47条の2 /
 * 社会保険労務士法2条・27条 / 弁護士法72条 / 司法書士法3条・73条 /
 * 行政書士法1条の2・19条 / 中小企業支援法11条 / 弁理士法4条・75条。
 * 個別 duty の周辺法令 (労基法89条・会社法915条・商標法8条・古物営業法3条
 * など) は各 desc に記載。法令の詳細はコンプライアンスページを参照。
 */

import type { ServiceId } from '../../shared/serviceId';

/** 士業 8 種の ServiceId (サイドバー「士業連携」カテゴリの表示順)。 */
export const PROFESSIONAL_IDS = [
  'tax-accountant',
  'cpa',
  'labor-consultant',
  'lawyer',
  'judicial-scrivener',
  'admin-scrivener',
  'sme-consultant',
  'patent-attorney',
] as const satisfies readonly ServiceId[];

export type ProfessionalId = (typeof PROFESSIONAL_IDS)[number];

/**
 * duty の区分:
 * - `exclusive` — その士業の独占業務に当たる領域 (無資格者が業として行うと
 *   士業法違反になり得る。例: 税務相談 / 登記申請代理 / 就業規則の作成代行)。
 * - `advisory` — 独占ではないが、この士業の専門性で頼るのが定石の相談領域
 *   (例: 内部統制整備 / 経営診断 / ブランド戦略)。
 */
export type DutyScope = 'exclusive' | 'advisory';

/** 事業仕分けの 1 行: アプリ内機能・事業と、この士業が担う理由。 */
export interface ProfessionalDuty {
  /** 担当領域名 (例: 「適格請求書 (インボイス)」)。 */
  readonly title: string;
  /** なぜこの士業の担当か / 何を相談するか。 */
  readonly desc: string;
  /** 独占業務か専門相談か (UI でバッジ表示)。 */
  readonly scope: DutyScope;
  /** アプリ内の対応機能へのリンク (servicehub:navigate で遷移)。 */
  readonly link?: { readonly serviceId: ServiceId; readonly label: string };
}

export interface ProfessionalProfile {
  readonly id: ProfessionalId;
  readonly label: string;
  /** 根拠法 (条文番号まで特定。例: 税理士法2条・52条)。 */
  readonly law: string;
  /** 独占業務の一行要約 (条文番号入り)。診断士のみ「独占業務なし」。 */
  readonly exclusive: string;
  /** どんな場面で頼る専門家かの一行説明。 */
  readonly summary: string;
  /** アプリ内機能の事業仕分け (3 件以上)。 */
  readonly duties: readonly ProfessionalDuty[];
}

export const PROFESSIONAL_MAP: Record<ProfessionalId, ProfessionalProfile> = {
  'tax-accountant': {
    id: 'tax-accountant',
    label: '税理士',
    law: '税理士法2条・52条',
    exclusive: '税務代理・税務書類の作成・税務相談 (2条)。52条により無償でも税理士以外は不可',
    summary: '日々の記帳から申告・節税まで、税金まわりの一次窓口。',
    duties: [
      {
        title: '適格請求書 (インボイス) 対応',
        desc: '発行体制づくり自体は独占ではないが、税率区分や仕入税額控除の経過措置 (80%→70%) の個別判断は税務相談として税理士の独占領域。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ' },
      },
      {
        title: '申告代理・納税スケジュール',
        desc: '法人税・消費税・源泉所得税の申告書作成と税務代理 (税理士法2条1項1・2号)。試算値の妥当性チェックもここ。',
        scope: 'exclusive',
        link: { serviceId: 'tax', label: '税務試算' },
      },
      {
        title: '投資の確定申告',
        desc: '不動産所得・株式や投信の譲渡損益・配当の申告代理。損益通算や特例適用の判断は税務相談に当たる。',
        scope: 'exclusive',
        link: { serviceId: 'real-estate', label: '不動産投資' },
      },
      {
        title: 'クラウド会計の記帳・月次決算',
        desc: '記帳そのものは独占ではないが、freee / マネーフォワードの仕訳確認から決算整理・申告書作成へは税理士に引き継ぐのが定石。',
        scope: 'advisory',
        link: { serviceId: 'freee', label: 'freee会計' },
      },
      {
        title: '売上集計と申告データの突合',
        desc: '売上集計の数字を申告ベース (発生主義・税区分) へ変換する際の整理。個別の税務判断が出たら独占領域に切り替わる。',
        scope: 'advisory',
        link: { serviceId: 'sales', label: '売上集計' },
      },
      {
        title: '税制改正ナレッジ',
        desc: 'インボイス経過措置・電子帳簿保存法など、コンプライアンス知識の実務適用。',
        scope: 'advisory',
        link: { serviceId: 'compliance', label: 'コンプライアンス' },
      },
    ],
  },

  cpa: {
    id: 'cpa',
    label: '公認会計士',
    law: '公認会計士法2条・47条の2',
    exclusive: '財務書類の監査・証明業務 (2条1項)。47条の2により公認会計士・監査法人以外は不可',
    summary: '決算書の信頼性を第三者として証明する監査の専門家。融資・出資・M&A の場面で。',
    duties: [
      {
        title: '任意監査・レビュー',
        desc: '金融機関や投資家へ出す決算書の監査・証明業務 (独占)。法定監査対象でなくても信頼性の担保に使える。',
        scope: 'exclusive',
        link: { serviceId: 'funding', label: '資金調達レーダー' },
      },
      {
        title: 'KPI・財務数値の検証',
        desc: 'KPI ダッシュボードの粗利率・キャッシュフロー等が会計基準に沿うかの検証と改善指導。',
        scope: 'advisory',
        link: { serviceId: 'kpi', label: 'KPI ダッシュボード' },
      },
      {
        title: '経営サマリーの決算分析',
        desc: '税引後利益・損益構造の分析と、金融機関へ出せる決算書への磨き込み。',
        scope: 'advisory',
        link: { serviceId: 'overview', label: '経営サマリー' },
      },
      {
        title: '定款の機関設計 (会計監査人)',
        desc: '大会社 (資本金5億円以上または負債200億円以上) は会計監査人の設置義務 (会社法328条・337条)。成長を見据えた機関設計の相談。',
        scope: 'advisory',
        link: { serviceId: 'docstudio', label: '書類スタジオ (電子定款)' },
      },
      {
        title: '内部統制の整備',
        desc: '経費精算・職務分掌・承認フローの統制設計 (公認会計士法2条2項の非独占業務)。',
        scope: 'advisory',
        link: { serviceId: 'quality', label: '品質ダッシュボード' },
      },
    ],
  },

  'labor-consultant': {
    id: 'labor-consultant',
    label: '社労士',
    law: '社会保険労務士法2条・27条',
    exclusive: '申請書等の作成・提出代行 (1号) と帳簿書類の作成 (2号) は独占 (27条)。相談指導 (3号) は非独占',
    summary: '雇用・労務・社会保険の手続と規程整備の専門家。人を雇ったら最初に相談。',
    duties: [
      {
        title: '就業規則の作成・届出',
        desc: '作成代行は 2 号業務として独占。常時 10 人以上の事業場は作成・労基署届出が義務 (労働基準法89条)。書類スタジオの就業規則 (10 章 47 条) の内容確定に。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ (就業規則)' },
      },
      {
        title: '雇用契約・労働条件通知',
        desc: '労働条件通知書の作成代行は 2 号業務。2024 年改正で就業場所・業務の変更の範囲の明示が必須 (労基法15条・労基則5条)。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ' },
      },
      {
        title: 'チームの入退社手続',
        desc: '社会保険・雇用保険の資格取得/喪失届の作成・提出代行は 1 号業務として独占。給与計算自体は非独占だが一体で任せるのが通例。',
        scope: 'exclusive',
        link: { serviceId: 'team', label: 'チーム管理' },
      },
      {
        title: 'メンタルヘルス・ストレスチェック体制',
        desc: '常時 50 人以上はストレスチェック年 1 回が義務 (労働安全衛生法66条の10)。実施体制・規程・労基署報告の整備を相談。',
        scope: 'advisory',
        link: { serviceId: 'emotions', label: 'Emotions (メンタルケア)' },
      },
      {
        title: '労働法改正への対応',
        desc: '育児介護休業法 2025 改正・カスハラ措置義務化 (2026-10 施行) 等の社内整備。',
        scope: 'advisory',
        link: { serviceId: 'compliance', label: 'コンプライアンス' },
      },
    ],
  },

  lawyer: {
    id: 'lawyer',
    label: '弁護士',
    law: '弁護士法72条',
    exclusive: '報酬目的で業として行う法律事件の法律事務 (72条)。訴訟・示談交渉の代理は弁護士のみ',
    summary: '契約・紛争・法的リスク全般の最終防衛線。もめる前の予防法務が最も安い。',
    duties: [
      {
        title: '紛争・調停・債権回収',
        desc: '未収金の督促・訴訟・示談交渉の代理は弁護士の独占 (例外: 140 万円以下の簡裁事件は認定司法書士も可)。家事事件 (養育費調停等) の代理もここ。',
        scope: 'exclusive',
        link: { serviceId: 'sales', label: '売上集計 (未収金の把握)' },
      },
      {
        title: '契約書のリーガルチェック',
        desc: '書類スタジオの NDA・業務委託・取引基本契約ドラフトの最終レビュー。紛争を見据えた法的判断・相手方との交渉は弁護士のみ。',
        scope: 'advisory',
        link: { serviceId: 'docstudio', label: '書類スタジオ (契約書)' },
      },
      {
        title: '利用規約・プライバシーポリシー',
        desc: '個人情報保護法・特商法・消費者契約法に沿った規約類の適法性確認。',
        scope: 'advisory',
        link: { serviceId: 'docstudio', label: '書類スタジオ' },
      },
      {
        title: '取適法 (2026-01 施行) 対応',
        desc: '中小受託取引適正化法の 4 条書面・手形払禁止など取引条件の適法性確認とトラブル時の対応。',
        scope: 'advisory',
        link: { serviceId: 'compliance', label: 'コンプライアンス' },
      },
    ],
  },

  'judicial-scrivener': {
    id: 'judicial-scrivener',
    label: '司法書士',
    law: '司法書士法3条・73条',
    exclusive: '登記・供託手続の代理と法務局提出書類の作成 (3条)。73条により司法書士以外は不可',
    summary: '会社の「戸籍」= 登記簿を動かす専門家。設立・変更・不動産取得のたびに出番。',
    duties: [
      {
        title: '電子定款 → 設立登記',
        desc: '書類スタジオで作った定款の認証後、設立登記の申請代理は司法書士の独占。登録免許税の半減特例の確認も。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ (電子定款)' },
      },
      {
        title: '株主総会議事録と変更登記',
        desc: '役員変更・本店移転・増資の登記申請代理 (変更後 2 週間以内 — 会社法915条1項)。添付する議事録の整備も。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ (議事録)' },
      },
      {
        title: '不動産投資の登記',
        desc: '物件取得時の所有権移転登記、融資時の抵当権設定・完済時の抹消登記の申請代理は司法書士の独占。',
        scope: 'exclusive',
        link: { serviceId: 'real-estate', label: '不動産投資' },
      },
      {
        title: '登記コストの法令ナレッジ',
        desc: '定款認証手数料の 1.5 万円区分 (2024-12 改正)・48/72 時間処理などの最新実務。140 万円以下の簡裁事件は認定司法書士が代理可能。',
        scope: 'advisory',
        link: { serviceId: 'compliance', label: 'コンプライアンス' },
      },
    ],
  },

  'admin-scrivener': {
    id: 'admin-scrivener',
    label: '行政書士',
    law: '行政書士法1条の2・19条',
    exclusive: '官公署提出書類と権利義務・事実証明書類の作成 (1条の2)。業として行えるのは行政書士のみ (19条)',
    summary: '役所へ出す書類の専門家。営業許可・古物商・補助金・定款作成の入り口。',
    duties: [
      {
        title: '定款の作成代理',
        desc: '電子定款の作成・電子署名の代理 (権利義務書類の作成)。認証は公証役場、その後の設立登記は司法書士と連携。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ (電子定款)' },
      },
      {
        title: '飲食・デリバリーの営業許可',
        desc: 'フード事業 (Uber Eats / 出前館) に必要な飲食店営業許可 (食品衛生法55条) や深夜酒類提供の届出書類の作成・提出。',
        scope: 'exclusive',
        link: { serviceId: 'business', label: '事業ダッシュボード (フード)' },
      },
      {
        title: 'EC 転売の古物商許可',
        desc: '中古品を仕入れて売る EC (卸仕入れ・せどり) は古物商許可 (古物営業法3条) が必要。申請書類の作成・提出はここ。',
        scope: 'exclusive',
        link: { serviceId: 'netsea', label: 'NETSEA (仕入れ)' },
      },
      {
        title: '補助金・給付金の申請書類',
        desc: 'IT 導入補助金・持続化補助金などの申請書類一式の作成支援。官公署へ提出する書類の作成は独占領域に掛かる。',
        scope: 'advisory',
        link: { serviceId: 'compliance', label: 'コンプライアンス (補助金)' },
      },
      {
        title: '資金調達の公的制度書類',
        desc: '公庫融資・制度融資に添える事業計画書類の整備。',
        scope: 'advisory',
        link: { serviceId: 'funding', label: '資金調達レーダー' },
      },
    ],
  },

  'sme-consultant': {
    id: 'sme-consultant',
    label: '中小企業診断士',
    law: '中小企業支援法11条',
    exclusive: '独占業務なし — 中小企業支援法11条の登録制度に基づく経営コンサルの国家資格',
    summary: '数字と現場の両面から経営を診断し、事業計画に落とす伴走者。',
    duties: [
      {
        title: 'KPI での経営診断',
        desc: '粗利率・回転率・損益分岐点の診断と改善アクションの優先順位付け。公的な専門家派遣制度では診断士資格が要件になることが多い。',
        scope: 'advisory',
        link: { serviceId: 'kpi', label: 'KPI ダッシュボード' },
      },
      {
        title: '事業計画・資金繰り計画',
        desc: '融資・補助金審査に通る事業計画のストーリーと数値計画の策定支援。',
        scope: 'advisory',
        link: { serviceId: 'funding', label: '資金調達レーダー' },
      },
      {
        title: '組織のチーム診断',
        desc: 'チームレーダーの評価軸設計とスキルマップに基づく育成計画。',
        scope: 'advisory',
        link: { serviceId: 'teamradar', label: 'チームレーダー' },
      },
      {
        title: '事業ダッシュボードの活用',
        desc: '複数事業 (EC・フード・投資) のポートフォリオ診断と撤退/集中の判断材料づくり。',
        scope: 'advisory',
        link: { serviceId: 'business', label: '事業ダッシュボード' },
      },
      {
        title: '補助金の事業計画策定',
        desc: '経営革新等支援機関 (認定支援機関) の認定を受けた診断士なら、認定支援機関の確認が要件の補助金 (事業再構築等) にも対応。',
        scope: 'advisory',
        link: { serviceId: 'compliance', label: 'コンプライアンス (補助金)' },
      },
    ],
  },

  'patent-attorney': {
    id: 'patent-attorney',
    label: '弁理士',
    law: '弁理士法4条・75条',
    exclusive: '特許・実用新案・意匠・商標の出願手続等の代理 (4条1項)。75条により弁理士以外は不可',
    summary: 'サービス名・ロゴ・発明を「権利」に変える知財の専門家。',
    duties: [
      {
        title: 'サービス名・ロゴの商標出願',
        desc: 'Canva で作ったロゴ・ブランド名の商標調査と出願代理 (独占)。商標は先願主義 (商標法8条) なので早い者勝ち。',
        scope: 'exclusive',
        link: { serviceId: 'canva', label: 'Canva (ブランド素材)' },
      },
      {
        title: 'EC 出店ブランドの保護',
        desc: 'ネットショップの商品名・ブランドの模倣品対策と権利行使の相談。侵害訴訟の代理は弁護士 (付記弁理士は共同代理可)。',
        scope: 'advisory',
        link: { serviceId: 'base', label: 'BASE (ネットショップ)' },
      },
      {
        title: '動画・デザインの著作権契約',
        desc: 'コンテンツの権利譲渡・ライセンス契約の締結代理・媒介は弁理士の業務 (弁理士法4条3項・非独占)。外注クリエイターとの権利処理に。',
        scope: 'advisory',
        link: { serviceId: 'youtube', label: 'YouTube' },
      },
      {
        title: '発明・ノウハウの記録管理',
        desc: 'ライブラリに保管した開発記録・図面を出願資料や先使用権 (特許法79条) の立証資料に整理。',
        scope: 'advisory',
        link: { serviceId: 'library', label: 'ライブラリ' },
      },
    ],
  },
};

/** 自分以外の士業を表示順で返す (ShigyoConsole の他士業クイックナビ用)。 */
export function otherProfessionals(id: ProfessionalId): readonly ProfessionalProfile[] {
  return PROFESSIONAL_IDS.filter((p) => p !== id).map((p) => PROFESSIONAL_MAP[p]);
}

/** ServiceId が士業かどうかの型ガード (ShigyoConsole が担当領域表示を出し分ける)。 */
export function isProfessionalId(id: ServiceId): id is ProfessionalId {
  return (PROFESSIONAL_IDS as readonly ServiceId[]).includes(id);
}
