// 学術知識 確証済みベース（経済学・経営学・人間科学・ビジネス法務・情報社会学）
//
// 法務・税務・労務の VERIFIED_COMPLIANCE / 補助金の VERIFIED_SUBSIDIES と同じ確証ディシプリンで運用する：
//   - 独立 2 出典以上、うち 1 件以上は権威ある出典（大学・学会・査読論文・公的機関・百科事典級リファレンス・
//     原典/一次資料）で確認できた概念・理論のみ採録。確認できないものは破棄する。
//   - 制度のような「年度で変動する数値」ではなく、確立した概念・理論・古典を対象とするが、
//     学説には批判・異説がありうるため、必要に応じて statement に限界・批判も併記して中立性を保つ。
//   - 提唱者・初出（年・文献）を keyFigures に明示し、トレーサビリティを確保する。
//
// ⚠ 本データは一般的な学術知識の要約であり、特定の意思決定への助言ではない。
//    実務適用や引用にあたっては一次資料・最新の学術的議論を確認すること。

export type AcademicDiscipline =
  | 'economics' // 経済学
  | 'management' // 経営学
  | 'human-science' // 人間科学（心理学・社会学・人類学等）
  | 'business-law' // ビジネス法務
  | 'information-sociology'; // 情報社会学・情報経済学

export type AcademicSourceType = 'academic' | 'reference' | 'government' | 'media';

export interface AcademicSource {
  url: string;
  type: AcademicSourceType;
  label: string;
}

export interface VerifiedConcept {
  id: string;
  discipline: AcademicDiscipline;
  title: string;
  statement: string; // 概念・理論の正確な要約（必要に応じ批判・限界も併記）
  keyFigures: string; // 提唱者・初出（年・文献）
  asOf: string;
  sources: AcademicSource[];
}

// Stryker disable all : 静的な確証済みデータ（ロジックなし）
export const VERIFIED_CONCEPTS: VerifiedConcept[] = [
  {
    id: 'econ-comparative-advantage',
    discipline: 'economics',
    title: '比較優位（リカードの比較生産費説）',
    statement:
      '比較優位とは、ある主体（国・企業・個人）が、ある財を他の主体よりも小さい機会費用で生産できる状態をいう。デヴィッド・リカードが『経済学および課税の原理』(1817)で定式化し、各主体が相対的に得意な（機会費用の小さい）財の生産に特化して' +
      '交易すれば全体の総生産と厚生が高まることを示した。アダム・スミスの絶対優位（投入あたりの生産性が他より高いこと）とは異なり、一方の主体が全ての財で絶対優位を持つ場合でも、双方が特化と貿易によって利益を得られる点が核心である。',
    keyFigures: 'デヴィッド・リカード（1817『経済学および課税の原理』）／対比: アダム・スミス（絶対優位）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/international-trade/Simplified-theory-of-comparative-advantage', type: 'reference', label: 'Encyclopaedia Britannica Money — Simplified theory of comparative advantage' },
      { url: 'https://www.aeaweb.org/articles?id=10.1257%2Fjep.32.4.227', type: 'academic', label: 'AEA, Journal of Economic Perspectives — Ricardo’s 1817 Formulation of Comparative Advantage' },
      { url: 'https://www.imf.org/external/pubs/ft/fandd/2009/12/basics.htm', type: 'government', label: 'IMF Finance & Development — Back to Basics: Why Countries Trade' },
    ],
  },
  {
    id: 'mgmt-five-forces',
    discipline: 'management',
    title: 'ファイブフォース分析（5つの競争要因）',
    statement:
      'ファイブフォース分析は、マイケル・E・ポーターが1979年のHarvard Business Review論文で提唱した、業界の競争の激しさと収益性（業界の魅力度）を規定する枠組み。分析対象は(1)既存競争者間の敵対関係、(2)新規参入の脅威、' +
      '(3)代替品の脅威、(4)買い手の交渉力、(5)売り手（供給業者）の交渉力の5つの力である。これらの構造を分析することで業界の収益性の根源を明らかにし、競争戦略の立案に役立てることを目的とする。',
    keyFigures: 'マイケル・E・ポーター（Harvard Business School、初出1979年HBR論文）',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/2008/01/the-five-competitive-forces-that-shape-strategy', type: 'academic', label: 'M.E.Porter, The Five Competitive Forces That Shape Strategy, Harvard Business Review (2008)' },
      { url: 'https://www.britannica.com/money/porters-five-forces-explained', type: 'reference', label: 'Encyclopaedia Britannica Money — Porter’s Five Forces' },
      { url: 'https://guides.newman.baruch.cuny.edu/porter', type: 'academic', label: 'Baruch College (CUNY) Library — Porter’s Five Forces Analysis' },
    ],
  },
  {
    id: 'human-maslow-hierarchy',
    discipline: 'human-science',
    title: 'マズローの欲求段階説',
    statement:
      'マズローの欲求段階説は、心理学者アブラハム・マズローが1943年の論文「A Theory of Human Motivation」で提唱した動機づけ理論で、人間の欲求を低次から(1)生理的欲求、(2)安全の欲求、(3)所属と愛の欲求、(4)承認（尊重）の欲求、' +
      '(5)自己実現の欲求の5段階で捉え、しばしばピラミッドとして図示される。低次の欲求がある程度満たされると高次の欲求が動機として現れるとする。一方、厳密な階層構造への実証的裏付けの乏しさ（Wahba & Bridwell 1976 等）や、複数の欲求を同時に追求しうること、' +
      '西洋・個人主義的な文化的偏りなどから批判も受けている。',
    keyFigures: 'アブラハム・マズロー（1943「A Theory of Human Motivation」）／批判: Wahba & Bridwell (1976)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Abraham-H-Maslow', type: 'reference', label: 'Encyclopaedia Britannica — Abraham H. Maslow' },
      { url: 'https://www.ebsco.com/research-starters/psychology/maslows-hierarchy-needs', type: 'academic', label: 'EBSCO Research Starters (Psychology) — Maslow’s hierarchy of needs' },
      { url: 'https://www.simplypsychology.org/maslow.html', type: 'reference', label: 'Simply Psychology — Maslow’s Hierarchy of Needs' },
    ],
  },
  {
    id: 'bizlaw-piercing-corporate-veil',
    discipline: 'business-law',
    title: '法人格否認の法理',
    statement:
      '法人格否認の法理とは、会社の法人格を一般的に剥奪するのではなく、当該特定の事案に限って法人格の独立性（株主有限責任の原則）を否定し、会社とその背後の支配株主等とを同一視して責任を追及することを認める判例法理。適用が認められるのは、' +
      '(1)法人格が全くの形骸にすぎない「形骸化」の場合と、(2)法人格が法律の適用回避・債務免脱等の違法または不当な目的に利用される「濫用」の場合の2類型である。日本では明文規定がなく、最高裁昭和44年2月27日判決がこの法理を正面から採用し2類型を示したとされる。',
    keyFigures: '最高裁第一小法廷 昭和44年2月27日判決（民集23巻2号511頁）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.courts.go.jp/app/hanrei_jp/detail2?id=55036', type: 'government', label: '裁判所 判例検索 — 最判昭和44年2月27日' },
      { url: 'https://www.publication.law.nihon-u.ac.jp/pdf/law/law_84_1/each/04.pdf', type: 'academic', label: '日本大学法学部 法学紀要 — 法人格否認の法理' },
      { url: 'https://ja.wikipedia.org/wiki/法人格否認の法理', type: 'reference', label: 'Wikipedia 日本語版 — 法人格否認の法理' },
    ],
  },
  {
    id: 'infosoc-information-asymmetry',
    discipline: 'information-sociology',
    title: '情報の非対称性（逆選択・モラルハザード）',
    statement:
      '情報の非対称性とは、取引の一方の当事者が他方より多くの情報を持ち、保有情報に格差がある状況をいう。ジョージ・アカロフは1970年の論文「レモン市場」で、品質を売り手だけが知る中古車市場では良質財が退出し低質財（レモン）ばかり残る「逆選択」を示した。' +
      'その対処として、情報を持つ側がコストを払って私的情報を伝える「シグナリング」（スペンス）と、持たない側が契約メニュー等で情報を引き出す「スクリーニング」（スティグリッツ）が論じられ、3氏は2001年にノーベル経済学賞を共同受賞した。' +
      'なお契約後に行動を変える「隠れた行動」の問題はモラルハザードと呼ばれる。',
    keyFigures: 'G.アカロフ／M.スペンス／J.スティグリッツ（2001年ノーベル経済学賞）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2001/summary/', type: 'reference', label: 'NobelPrize.org — 2001 Prize in Economic Sciences（情報の非対称性をともなう市場の分析）' },
      { url: 'https://en.wikipedia.org/wiki/The_Market_for_Lemons', type: 'reference', label: 'Wikipedia — The Market for Lemons (Akerlof 1970)' },
      { url: 'https://www.britannica.com/money/moral-hazard', type: 'reference', label: 'Encyclopaedia Britannica Money — Moral hazard' },
    ],
  },
  {
    id: 'infosoc-network-effect',
    discipline: 'information-sociology',
    title: 'ネットワーク効果（ネットワーク外部性）',
    statement:
      'ネットワーク効果（ネットワーク外部性）とは、ある財・サービスの利用者が増えるほど、個々の利用者が得る価値・便益が高まる現象をいう（典型例は電話）。利用者数が直接的に価値を高める「直接的ネットワーク効果」と、補完財（対応ソフト等）の充実を介して価値を高める' +
      '「間接的ネットワーク効果」がある。ネットワークの価値が利用者数nの二乗（接続数 n(n-1)/2）に比例して増えるとする経験則が「メトカーフの法則」である。こうした正のフィードバックは勝者総取り（winner-takes-all）の市場集中やロックインをもたらしやすい（メトカーフの法則のn²には過大評価との批判もある）。',
    keyFigures: 'Katz & Shapiro (1985, 直接/間接の外部性)／R.メトカーフ（メトカーフの法則）',
    asOf: '2026-06',
    sources: [
      { url: 'https://ideas.repec.org/a/aea/aecrev/v75y1985i3p424-40.html', type: 'academic', label: 'Katz & Shapiro (1985) Network Externalities, Competition, and Compatibility, American Economic Review' },
      { url: 'https://en.wikipedia.org/wiki/Network_effect', type: 'reference', label: 'Wikipedia — Network effect' },
      { url: 'https://spectrum.ieee.org/metcalfes-law-is-wrong', type: 'media', label: 'IEEE Spectrum — Metcalfe’s Law analysis（n²の定式化と批判）' },
    ],
  },
];
// Stryker restore all
