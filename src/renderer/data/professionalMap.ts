/**
 * 士業 8 種への「事業仕分け」マップ — アプリの各機能・事業を、どの専門家が
 * 担当領域とするかの単一データ源。
 *
 * `components/ShigyoConsole.tsx` の「担当領域」セクションがこのマップを描画し、
 * 各 duty の `link` は `servicehub:navigate` CustomEvent でアプリ内遷移する。
 * 独占業務 (exclusive) は各士業法の定めに基づく要約で、無資格者が代行できない
 * 業務の目安。中小企業診断士のみ独占業務を持たない (経営コンサルの国家資格)。
 *
 * 出典 (要約の根拠): 税理士法2条 / 公認会計士法2条 / 社会保険労務士法2条 /
 * 弁護士法72条 / 司法書士法3条 / 行政書士法1条の2 / 中小企業支援法11条 /
 * 弁理士法4条。法令の詳細はコンプライアンスページ (complianceKnowledge) を参照。
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

/** 事業仕分けの 1 行: アプリ内機能・事業と、この士業が担う理由。 */
export interface ProfessionalDuty {
  /** 担当領域名 (例: 「適格請求書 (インボイス)」)。 */
  readonly title: string;
  /** なぜこの士業の担当か / 何を相談するか。 */
  readonly desc: string;
  /** アプリ内の対応機能へのリンク (servicehub:navigate で遷移)。 */
  readonly link?: { readonly serviceId: ServiceId; readonly label: string };
}

export interface ProfessionalProfile {
  readonly id: ProfessionalId;
  readonly label: string;
  /** 根拠法 (例: 税理士法)。 */
  readonly law: string;
  /** 独占業務の一行要約。診断士のみ「独占業務なし」。 */
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
    law: '税理士法',
    exclusive: '税務代理・税務書類の作成・税務相談 (無償でも税理士以外は不可)',
    summary: '日々の記帳から申告・節税まで、税金まわりの一次窓口。',
    duties: [
      {
        title: '適格請求書 (インボイス) 発行',
        desc: '書類スタジオの適格請求書テンプレを運用に載せる際の税率区分・経過措置 (80%→70% 控除) の確認。',
        link: { serviceId: 'docstudio', label: '書類スタジオ' },
      },
      {
        title: '税務試算・納税スケジュール',
        desc: '法人税・消費税・源泉所得税の試算値の妥当性チェックと申告代理。',
        link: { serviceId: 'tax', label: '税務試算' },
      },
      {
        title: 'クラウド会計の記帳・月次決算',
        desc: 'freee / マネーフォワードの仕訳確認・決算整理・申告書作成。',
        link: { serviceId: 'freee', label: 'freee会計' },
      },
      {
        title: '売上集計と申告データの突合',
        desc: '売上集計の数字を申告ベース (発生主義・税区分) へ変換する際の相談。',
        link: { serviceId: 'sales', label: '売上集計' },
      },
      {
        title: '税制改正ナレッジ',
        desc: 'インボイス経過措置・電子帳簿保存法など、コンプライアンス知識の実務適用。',
        link: { serviceId: 'compliance', label: 'コンプライアンス' },
      },
    ],
  },

  cpa: {
    id: 'cpa',
    label: '公認会計士',
    law: '公認会計士法',
    exclusive: '財務諸表の監査・証明業務 (法定監査は公認会計士・監査法人のみ)',
    summary: '決算書の信頼性を第三者として証明する会計・監査の最高峰資格。融資・出資・M&A の場面で。',
    duties: [
      {
        title: 'KPI・財務数値の検証',
        desc: 'KPI ダッシュボードの粗利率・キャッシュフロー等が会計基準に沿うかの検証。',
        link: { serviceId: 'kpi', label: 'KPI ダッシュボード' },
      },
      {
        title: '経営サマリーの決算分析',
        desc: '税引後利益・損益構造の分析と、金融機関へ出せる決算書への磨き込み。',
        link: { serviceId: 'overview', label: '経営サマリー' },
      },
      {
        title: '資金調達時の任意監査',
        desc: '融資・出資審査で求められる決算書の信頼性担保 (任意監査・レビュー)。',
        link: { serviceId: 'funding', label: '資金調達レーダー' },
      },
      {
        title: '定款の機関設計 (会計監査人)',
        desc: '会社成長時の会計監査人・監査役設置の検討。電子定款の機関設計条項に反映。',
        link: { serviceId: 'docstudio', label: '書類スタジオ (電子定款)' },
      },
      {
        title: '内部統制の整備',
        desc: '経費精算・職務分掌・承認フローの統制設計と品質チェック体制。',
        link: { serviceId: 'quality', label: '品質ダッシュボード' },
      },
    ],
  },

  'labor-consultant': {
    id: 'labor-consultant',
    label: '社労士',
    law: '社会保険労務士法',
    exclusive: '労働社会保険諸法令に基づく申請書等の作成・提出代行 (1・2 号業務)',
    summary: '雇用・労務・社会保険の手続と規程整備の専門家。人を雇ったら最初に相談。',
    duties: [
      {
        title: '就業規則の作成・届出',
        desc: '書類スタジオの就業規則 (10 章 47 条) の内容確定と労基署への届出代行 (常時 10 人以上は義務)。',
        link: { serviceId: 'docstudio', label: '書類スタジオ (就業規則)' },
      },
      {
        title: '雇用契約・労働条件通知',
        desc: '労働条件通知書の必須明示事項 (2024 改正の就業場所・業務の変更範囲を含む) の確認。',
        link: { serviceId: 'docstudio', label: '書類スタジオ' },
      },
      {
        title: 'チームの入退社手続',
        desc: 'メンバーの社会保険・雇用保険の取得喪失手続と給与計算。',
        link: { serviceId: 'team', label: 'チーム管理' },
      },
      {
        title: '労働法改正への対応',
        desc: '育児介護休業法 2025 改正・カスハラ措置義務化 (2026-10 施行) 等の社内整備。',
        link: { serviceId: 'compliance', label: 'コンプライアンス' },
      },
    ],
  },

  lawyer: {
    id: 'lawyer',
    label: '弁護士',
    law: '弁護士法',
    exclusive: '法律事務全般・訴訟代理 (72 条により非弁行為は禁止)',
    summary: '契約・紛争・法的リスク全般の最終防衛線。もめる前の予防法務が最も安い。',
    duties: [
      {
        title: '契約書のリーガルチェック',
        desc: '書類スタジオの NDA・業務委託・取引基本契約ドラフトの最終レビュー。',
        link: { serviceId: 'docstudio', label: '書類スタジオ (契約書)' },
      },
      {
        title: '利用規約・プライバシーポリシー',
        desc: '個人情報保護法・特商法に沿った規約類の適法性確認。',
        link: { serviceId: 'docstudio', label: '書類スタジオ' },
      },
      {
        title: '取適法 (2026-01 施行) 対応',
        desc: '中小受託取引適正化法の 4 条書面・手形払禁止など取引条件の適法性確認。',
        link: { serviceId: 'compliance', label: 'コンプライアンス' },
      },
      {
        title: '紛争・調停・債権回収',
        desc: '未収金の督促・調停・訴訟対応。家事事件 (養育費調停等) の代理もここ。',
      },
    ],
  },

  'judicial-scrivener': {
    id: 'judicial-scrivener',
    label: '司法書士',
    law: '司法書士法',
    exclusive: '登記・供託手続の代理 (会社設立・役員変更・本店移転などの商業登記)',
    summary: '会社の「戸籍」= 登記簿を動かす専門家。設立・変更のたびに出番。',
    duties: [
      {
        title: '電子定款 → 設立登記',
        desc: '書類スタジオで作った定款の認証後、設立登記申請を代理 (登録免許税の半減特例も確認)。',
        link: { serviceId: 'docstudio', label: '書類スタジオ (電子定款)' },
      },
      {
        title: '株主総会議事録と変更登記',
        desc: '役員変更・本店移転・増資の議事録整備と登記申請 (変更後 2 週間以内)。',
        link: { serviceId: 'docstudio', label: '書類スタジオ (議事録)' },
      },
      {
        title: '登記コストの法令ナレッジ',
        desc: '定款認証手数料の 1.5 万円区分 (2024-12 改正)・48/72 時間処理などの最新実務。',
        link: { serviceId: 'compliance', label: 'コンプライアンス' },
      },
    ],
  },

  'admin-scrivener': {
    id: 'admin-scrivener',
    label: '行政書士',
    law: '行政書士法',
    exclusive: '官公署提出書類・権利義務/事実証明書類の作成 (許認可申請の代理)',
    summary: '役所へ出す書類の専門家。営業許可・補助金・定款作成の入り口。',
    duties: [
      {
        title: '定款の作成代理',
        desc: '電子定款の作成・電子署名代理 (認証は公証役場、その後の登記は司法書士と連携)。',
        link: { serviceId: 'docstudio', label: '書類スタジオ (電子定款)' },
      },
      {
        title: '飲食・デリバリーの営業許可',
        desc: 'フードデリバリー事業 (Uber Eats / 出前館) に必要な飲食店営業許可・深夜酒類提供届等の申請。',
        link: { serviceId: 'business', label: '事業ダッシュボード (フード)' },
      },
      {
        title: '補助金・給付金の申請書類',
        desc: 'IT 導入補助金・持続化補助金などの申請書類一式の作成支援。',
        link: { serviceId: 'compliance', label: 'コンプライアンス (補助金)' },
      },
      {
        title: '資金調達の公的制度書類',
        desc: '公庫融資・制度融資に添える事業計画書類の整備。',
        link: { serviceId: 'funding', label: '資金調達レーダー' },
      },
    ],
  },

  'sme-consultant': {
    id: 'sme-consultant',
    label: '中小企業診断士',
    law: '中小企業支援法',
    exclusive: '独占業務なし — 経営コンサルティング唯一の国家資格 (公的支援の窓口要件に多用)',
    summary: '数字と現場の両面から経営を診断し、事業計画に落とす伴走者。',
    duties: [
      {
        title: 'KPI での経営診断',
        desc: '粗利率・回転率・損益分岐点の診断と改善アクションの優先順位付け。',
        link: { serviceId: 'kpi', label: 'KPI ダッシュボード' },
      },
      {
        title: '事業計画・資金繰り計画',
        desc: '融資・補助金審査に通る事業計画のストーリーと数値計画の策定支援。',
        link: { serviceId: 'funding', label: '資金調達レーダー' },
      },
      {
        title: '組織のチーム診断',
        desc: 'チームレーダーの評価軸設計とスキルマップに基づく育成計画。',
        link: { serviceId: 'teamradar', label: 'チームレーダー' },
      },
      {
        title: '事業ダッシュボードの活用',
        desc: '複数事業 (EC・フード・投資) のポートフォリオ診断と撤退/集中の判断材料づくり。',
        link: { serviceId: 'business', label: '事業ダッシュボード' },
      },
      {
        title: '補助金の事業計画策定',
        desc: '事業再構築・ものづくり補助金等の計画書づくり (認定支援機関として)。',
        link: { serviceId: 'compliance', label: 'コンプライアンス (補助金)' },
      },
    ],
  },

  'patent-attorney': {
    id: 'patent-attorney',
    label: '弁理士',
    law: '弁理士法',
    exclusive: '特許・実用新案・意匠・商標の出願代理 (特許庁への手続)',
    summary: 'サービス名・ロゴ・発明を「権利」に変える知財の専門家。',
    duties: [
      {
        title: 'サービス名・ロゴの商標出願',
        desc: 'Canva で作ったロゴ・ブランド名の商標調査と出願 (先願主義なので早い者勝ち)。',
        link: { serviceId: 'canva', label: 'Canva (ブランド素材)' },
      },
      {
        title: 'EC 出店ブランドの保護',
        desc: 'ネットショップの商品名・ブランドの模倣対策と商標権行使。',
        link: { serviceId: 'base', label: 'BASE (ネットショップ)' },
      },
      {
        title: '発明・ノウハウの記録管理',
        desc: 'ライブラリに保管した開発記録・図面を出願資料や先使用権の証拠に整理。',
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
