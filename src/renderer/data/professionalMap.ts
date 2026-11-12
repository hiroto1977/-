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
 * 出典 (要約の根拠条文。2026-07 に政府一次資料で検証済み): 税理士法2条・52条 /
 * 公認会計士法2条・47条の2 / 社会保険労務士法2条・27条 / 弁護士法72条 /
 * 司法書士法3条・73条 / 行政書士法1条の3・19条 (令和8年1月施行の改正で
 * 旧1条の2から繰下げ) / 中小企業支援法11条 / 弁理士法4条・75条。
 * 個別 duty の周辺法令 (労基法89条・会社法911/915条・商標法8条・
 * 古物営業法3条・酒税法9条・不動産登記法76条の2 など) は各 desc に記載。
 * 法令の詳細はコンプライアンスページを参照。
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
    exclusive: '税務代理・税務書類の作成・税務相談 (2条1項)。52条により無償でも税理士以外は不可',
    summary: '日々の記帳から申告・節税・税務調査まで、税金まわりの一次窓口。',
    duties: [
      {
        title: '適格請求書 (インボイス) 対応',
        desc: '発行体制づくり自体は独占ではないが、税率区分や仕入税額控除の経過措置 (80%→70%、以後 50%→30% と段階縮小) の個別判断は税務相談として税理士の独占領域。',
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
        title: '税務調査の立会い・不服申立て',
        desc: '税務代理 (2条1項1号) は申告だけでなく、調査・処分に対する主張・陳述の代理を明文で含む。調査の連絡が来たらまず顧問税理士へ。',
        scope: 'exclusive',
        link: { serviceId: 'freee', label: 'freee会計 (帳簿・証憑)' },
      },
      {
        title: '投資の確定申告',
        desc: '不動産所得・株式や投信の譲渡損益・配当の申告代理。損益通算や特例適用の判断は税務相談に当たる。',
        scope: 'exclusive',
        link: { serviceId: 'real-estate', label: '不動産投資' },
      },
      {
        title: 'クラウド会計の記帳・月次決算',
        desc: '記帳そのものは独占ではない (税理士法2条2項の付随業務)。freee / マネーフォワードの仕訳確認から決算整理・申告書作成へは税理士に引き継ぐのが定石。',
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
    summary: '決算書の信頼性を第三者として証明する監査の専門家。税理士登録すれば税務も扱える (税理士法3条1項4号)。',
    duties: [
      {
        title: '監査証明業務 (法定・任意)',
        desc: '大会社の会社法監査 (328条・337条)、上場企業の金商法監査 (193条の2)、IPO 準備の監査証明は独占業務 (47条の2)。金融機関へ出す決算書の任意監査・レビューもここ。',
        scope: 'exclusive',
        link: { serviceId: 'funding', label: '資金調達レーダー (融資・IPO)' },
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
        desc: '大会社 (資本金5億円以上または負債200億円以上 — 会社法2条6号) は会計監査人の設置義務 (328条・337条)。会計参与 (会計士・税理士のみ就任可 — 333条) の活用も。',
        scope: 'advisory',
        link: { serviceId: 'docstudio', label: '書類スタジオ (電子定款)' },
      },
      {
        title: '内部統制の整備',
        desc: '経費精算・職務分掌・承認フローの統制設計は非独占 (公認会計士法2条2項)。上場後の内部統制報告書の監査は独占業務 (金商法193条の2第2項)。',
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
        desc: '労働条件通知書の作成代行は 2 号業務。2024 年改正 (労基則5条) で就業場所・業務の変更の範囲の明示が必須。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ' },
      },
      {
        title: 'チームの入退社手続',
        desc: '社会保険・雇用保険の資格取得/喪失届の作成・提出代行は 1 号業務として独占。給与計算自体は非独占だが、賃金台帳・労働者名簿の作成 (2 号業務) は独占。',
        scope: 'exclusive',
        link: { serviceId: 'team', label: 'チーム管理' },
      },
      {
        title: '雇用関係助成金の申請代行',
        desc: 'キャリアアップ助成金など雇用保険法等に基づく助成金の申請書作成・提出代行は 1 号業務として社労士の独占。経産省系の補助金 (行政書士・診断士の領域) と使い分ける。',
        scope: 'exclusive',
        link: { serviceId: 'funding', label: '資金調達レーダー (助成金)' },
      },
      {
        title: 'メンタルヘルス・ストレスチェック体制',
        desc: '常時 50 人以上は年 1 回義務 (安衛法66条の10)。2025 年改正で 50 人未満も義務化が決定 (2028 年 5 月までに施行)。実施者は医師等のため、社労士は体制・規程・報告の整備を支援。',
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
        desc: '未収金の督促・訴訟・示談交渉の代理は弁護士の独占 (例外: 140 万円以下の簡裁事件は認定司法書士も可)。家事調停 (養育費等) の手続代理も原則弁護士 (家事事件手続法22条)。',
        scope: 'exclusive',
        link: { serviceId: 'sales', label: '売上集計 (未収金の把握)' },
      },
      {
        title: '労働審判・労使トラブル対応',
        desc: '解雇・残業代などの労働審判・訴訟の代理は弁護士 (労働審判法4条)。労働局あっせん等の ADR は特定社労士も代理可 — 社労士と連携して対応。',
        scope: 'exclusive',
        link: { serviceId: 'team', label: 'チーム管理' },
      },
      {
        title: '契約書のリーガルチェック',
        desc: '書類スタジオの NDA・業務委託・取引基本契約ドラフトの最終レビュー。紛争が具体化・顕在化した案件の法的審査・交渉は弁護士のみ (72条の法律事務)。',
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
    exclusive: '登記・供託手続の代理、法務局・裁判所提出書類の作成とその相談 (3条1項)。73条により司法書士以外は不可',
    summary: '会社の「戸籍」= 登記簿を動かす専門家。設立・変更・不動産取得・相続のたびに出番。',
    duties: [
      {
        title: '電子定款 → 設立登記',
        desc: '書類スタジオで作った定款の認証 (公証人 — 会社法30条) 後、設立登記 (会社法911条・2 週間以内) の申請代理は司法書士の独占。登録免許税の半減特例の確認も。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ (電子定款)' },
      },
      {
        title: '株主総会議事録と変更登記',
        desc: '役員変更・本店移転・増資の変更登記は変更から 2 週間以内 (会社法915条1項)。申請代理は独占で、添付する議事録の整備も。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ (議事録)' },
      },
      {
        title: '不動産投資の登記',
        desc: '物件取得時の所有権移転登記、融資時の抵当権設定・完済時の抹消登記の申請代理は独占 (表題部の表示登記は土地家屋調査士の領域)。',
        scope: 'exclusive',
        link: { serviceId: 'real-estate', label: '不動産投資' },
      },
      {
        title: '相続登記の義務化対応',
        desc: '相続で不動産を取得したら 3 年以内に登記申請が義務 (不動産登記法76条の2・2024 年施行。怠ると 10 万円以下の過料)。簡易な相続人申告登記 (76条の3) もここ。',
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
    law: '行政書士法1条の3・19条',
    exclusive: '官公署提出書類と権利義務・事実証明書類の作成 (1条の3)。報酬を得て業として行えるのは行政書士のみ (19条)',
    summary: '役所へ出す書類の専門家。営業許可・古物商・酒販免許・定款作成の入り口。',
    duties: [
      {
        title: '定款の作成代理',
        desc: '電子定款の作成代理・電子署名 (行政書士法1条の3・1条の4)。認証は公証人 (会社法30条)、その後の設立登記の申請代理は司法書士と連携。',
        scope: 'exclusive',
        link: { serviceId: 'docstudio', label: '書類スタジオ (電子定款)' },
      },
      {
        title: '飲食・デリバリーの営業許可',
        desc: 'フード事業 (Uber Eats / 出前館) に必要な飲食店営業許可 (食品衛生法55条) の申請書類。深夜 0〜6 時の酒類提供は公安委員会への届出 (風営法33条) も。',
        scope: 'exclusive',
        link: { serviceId: 'business', label: '事業ダッシュボード (フード)' },
      },
      {
        title: 'EC 転売の古物商許可',
        desc: '中古品を仕入れて売る EC (卸仕入れ・せどり) は公安委員会の古物商許可 (古物営業法3条) が必要。申請書類の作成・提出はここ。',
        scope: 'exclusive',
        link: { serviceId: 'netsea', label: 'NETSEA (仕入れ)' },
      },
      {
        title: '酒類ネット販売の免許',
        desc: '酒類の EC 販売には税務署長の免許が必要 (酒税法9条。2 都道府県以上への通販は通信販売酒類小売業免許)。税務署宛の申請書類作成はここ。',
        scope: 'exclusive',
        link: { serviceId: 'shopify', label: 'Shopify (EC)' },
      },
      {
        title: '補助金・給付金の申請書類',
        desc: '国・自治体宛の申請書類の作成は独占領域。IT 導入・持続化補助金など民間事務局宛は独占外の支援業務。厚労省系の雇用助成金は社労士の独占領域と使い分け。',
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
        desc: '粗利率・回転率・損益分岐点の診断と改善アクションの優先順位付け。公的な専門家派遣・経営相談では診断士登録が要件になる例が多い (中小企業支援事業の基準省令)。',
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
        title: '経営力向上計画・経営革新計画',
        desc: '中小企業等経営強化法の法定計画。認定・承認で中小企業経営強化税制などの税制優遇や金融支援につながる計画づくりを支援。',
        scope: 'advisory',
        link: { serviceId: 'tax', label: '税務試算 (優遇効果)' },
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
        desc: '認定支援機関 (中小企業等経営強化法31条) の認定を受けた診断士なら、経営改善計画策定支援事業 (405 事業) など認定機関の関与が要件の制度にも対応。',
        scope: 'advisory',
        link: { serviceId: 'compliance', label: 'コンプライアンス (補助金)' },
      },
    ],
  },

  'patent-attorney': {
    id: 'patent-attorney',
    label: '弁理士',
    law: '弁理士法4条・75条',
    exclusive: '特許・実用新案・意匠・商標の出願手続等の代理 (4条1項)。75条により弁理士・弁理士法人以外は不可',
    summary: 'サービス名・ロゴ・発明を「権利」に変える知財の専門家。',
    duties: [
      {
        title: 'サービス名・ロゴの商標出願',
        desc: 'Canva で作ったロゴ・ブランド名の商標調査と出願代理 (独占)。商標は最先の出願人だけが登録を受けられる先願主義 (商標法8条1項) なので早い者勝ち。',
        scope: 'exclusive',
        link: { serviceId: 'canva', label: 'Canva (ブランド素材)' },
      },
      {
        title: 'EC 出店ブランドの保護',
        desc: 'モール上の模倣品対策の相談と、税関への輸入差止申立ての手続代理 (弁理士法4条2項1号)。侵害訴訟の代理は弁護士 (付記弁理士は共同代理可 — 6条の2)。',
        scope: 'advisory',
        link: { serviceId: 'base', label: 'BASE (ネットショップ)' },
      },
      {
        title: '動画・デザインの著作権契約',
        desc: '著作物に関する権利の売買・ライセンス契約の締結代理・媒介・相談は弁理士の業務 (弁理士法4条3項・非独占)。外注クリエイターとの権利処理に。',
        scope: 'advisory',
        link: { serviceId: 'youtube', label: 'YouTube' },
      },
      {
        title: '発明・ノウハウの記録管理',
        desc: 'ライブラリに保管した開発記録・図面を出願資料や先使用権 (特許法79条) の立証資料に整理。日付証明 (タイムスタンプ等) 付きが有効 (特許庁指針)。',
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
