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
  {
    id: 'econ-nash-equilibrium',
    discipline: 'economics',
    title: 'ナッシュ均衡（Nash equilibrium）',
    statement:
      'ナッシュ均衡とは、非協力ゲームにおいて、各プレイヤーが他のすべてのプレイヤーの戦略を所与（固定）とみなしたとき、誰も自分の戦略を一方的に変更することで利得を改善できない戦略の組をいい、各プレイヤーの戦略が互いに最適応答となっている状態を指す。' +
      '数学者ジョン・ナッシュが1950–51年に定式化し、有限ゲームには少なくとも一つの（混合戦略）ナッシュ均衡が存在することを証明した。ナッシュはハーサニ・ゼルテンとともに1994年にノーベル経済学賞を受賞。代表例の囚人のジレンマでは「両者が自白」が唯一のナッシュ均衡となり、個々の合理的選択が必ずしも全体最適にならないことを示す。',
    keyFigures: 'ジョン・F・ナッシュ（1950–51定式化、1994年ノーベル経済学賞／ハーサニ・ゼルテンと共同）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1994/summary/', type: 'reference', label: 'NobelPrize.org — 1994 Prize（非協力ゲームの均衡分析）' },
      { url: 'https://www.britannica.com/science/Nash-equilibrium', type: 'reference', label: 'Encyclopaedia Britannica — Nash equilibrium' },
      { url: 'https://plato.stanford.edu/entries/game-theory/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — Game Theory' },
    ],
  },
  {
    id: 'mgmt-seci-model',
    discipline: 'management',
    title: 'SECIモデル（組織的知識創造理論）',
    statement:
      'SECIモデルは、野中郁次郎と竹内弘高が1995年の著書『The Knowledge-Creating Company（知識創造企業）』で体系化した組織的知識創造の理論で、言語化しにくい「暗黙知」と言葉・図で表せる「形式知」の相互変換により新たな知識が生まれると説く。' +
      '変換は、共同化（Socialization：暗黙知→暗黙知）・表出化（Externalization：暗黙知→形式知）・連結化（Combination：形式知→形式知）・内面化（Internalization：形式知→暗黙知）の4モードからなり、これらが組織内で螺旋的に循環する「知識スパイラル」を形成する。' +
      '後に知識創造が生起する共有された文脈・場としての「場（ば）」の概念が加えられた。',
    keyFigures: '野中郁次郎・竹内弘高（1995『The Knowledge-Creating Company』）',
    asOf: '2026-06',
    sources: [
      { url: 'https://global.oup.com/academic/product/the-knowledge-creating-company-9780195092691', type: 'academic', label: 'Oxford University Press — The Knowledge-Creating Company (Nonaka & Takeuchi, 1995)' },
      { url: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.02730/full', type: 'academic', label: 'Frontiers in Psychology (2019) — Nonaka’s SECI Model Operationalization' },
      { url: 'https://en.wikipedia.org/wiki/SECI_model_of_knowledge_dimensions', type: 'reference', label: 'Wikipedia — SECI model of knowledge dimensions' },
    ],
  },
  {
    id: 'human-prospect-theory',
    discipline: 'human-science',
    title: 'プロスペクト理論（行動経済学）',
    statement:
      'プロスペクト理論は、ダニエル・カーネマンとエイモス・トベルスキーが1979年にEconometrica誌で提唱した不確実性下の意思決定の記述的モデルで、期待効用理論への実証的反証として位置づけられる。人は富の絶対水準ではなく参照点からの変化を利得・損失として評価し、' +
      '同額の損失は利得より心理的影響が大きい「損失回避」を示す。価値関数はS字型（利得局面でリスク回避・損失局面でリスク選好、損失側がより急峻）で、確率は主観的に加重され小さい確率が過大評価される。カーネマンはこの貢献で2002年ノーベル経済学賞を受賞した（トベルスキーは1996年逝去のため対象外）。',
    keyFigures: 'ダニエル・カーネマン（2002年ノーベル経済学賞）／エイモス・トベルスキー（1979 Econometrica）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2002/kahneman/facts/', type: 'reference', label: 'NobelPrize.org — Daniel Kahneman 2002' },
      { url: 'https://www.econometricsociety.org/publications/econometrica/1979/03/01/prospect-theory-analysis-decision-under-risk', type: 'academic', label: 'Econometric Society — Prospect Theory (Kahneman & Tversky, 1979)' },
      { url: 'https://en.wikipedia.org/wiki/Prospect_theory', type: 'reference', label: 'Wikipedia — Prospect theory' },
    ],
  },
  {
    id: 'bizlaw-business-judgment-rule',
    discipline: 'business-law',
    title: '取締役の善管注意義務・忠実義務と経営判断の原則',
    statement:
      '日本の会社法上、株式会社と取締役の関係は委任に関する規定に従い（会社法330条）、取締役は受任者として善良な管理者の注意義務（民法644条）を負うとともに、法令・定款・株主総会決議を遵守し会社のため忠実に職務を行う忠実義務（会社法355条）を負う。' +
      '「経営判断の原則」とは、取締役の経営上の判断について、判断の前提となった事実認識に不注意な誤りがなく、意思決定の過程・内容が著しく不合理でない限り、結果的に会社に損害が生じても善管注意義務違反（任務懈怠）には問われないとする考え方である。' +
      '最高裁平成22年7月15日判決（アパマンショップ株主代表訴訟事件）も、決定の過程・内容に著しく不合理な点がない限り善管注意義務違反とならないとし同様の枠組みを示した。',
    keyFigures: '会社法330・355条／民法644条／最判平成22年7月15日（アパマンショップ事件）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（330条・355条）' },
      { url: 'https://cir.nii.ac.jp/crid/1522262180687718656', type: 'academic', label: 'CiNii Research 経営判断原則と取締役の任務懈怠（最判平成22.7.15 解説）' },
      { url: 'https://www.businesslawyers.jp/practices/41', type: 'media', label: 'BUSINESS LAWYERS 経営判断の原則とは' },
    ],
  },
  {
    id: 'infosoc-long-tail',
    discipline: 'information-sociology',
    title: 'ロングテール（The Long Tail）',
    statement:
      'ロングテールとは、需要曲線上で少数の「ヒット商品」（ヘッド）から多数の「ニッチ商品」（テール）へと売上が分散する市場分布を指す概念で、Wired誌編集長クリス・アンダーソンが2004年のWired記事と2006年の著書で広めた。物理的な棚・在庫の制約がなく在庫・流通コストがほぼゼロに近づく' +
      'オンライン市場（Amazon・iTunes等）では、個々の販売数が少ない無数のニッチ商品の売上合計が、少数のヒット商品の売上に匹敵又は凌駕しうる、というのが中心的主張である。ただし実証的批判もあり、A.エルバースらはデジタル流通が普及してもヘッド（ヒット）への集中はなお強く、テールは「長くなったが細くなった」と指摘している。',
    keyFigures: 'クリス・アンダーソン（2004 Wired／2006著書）／批判: アニタ・エルバース',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/The_Long_Tail_(book)', type: 'reference', label: 'Wikipedia — The Long Tail (book)' },
      { url: 'https://en.wikipedia.org/wiki/Anita_Elberse', type: 'reference', label: 'Wikipedia — Anita Elberse（ヒット集中の実証的批判）' },
      { url: 'https://faculty.washington.edu/mfan/is582/articles/Debating%20the%20Long%20Tail%20-%20Conversation%20Starter%20-%20HarvardBusiness.pdf', type: 'academic', label: 'Harvard Business Review — Debating the Long Tail（U.Washington ホスト）' },
    ],
  },
  {
    id: 'econ-externality-market-failure',
    discipline: 'economics',
    title: '外部性と市場の失敗',
    statement:
      '外部性とは、ある経済主体の活動が市場の取引を通さずに第三者に便益（正の外部性。例: 予防接種）又は費用（負の外部性。例: 公害）を及ぼし、その効果が価格に反映されない現象をいう。当事者が外部効果に対価を払わないため私的費用・便益と社会的費用・便益が乖離し、市場均衡の資源配分が社会的最適からずれる' +
      '「市場の失敗」の代表的な一類型である。対処として、A.C.ピグーは外部費用に等しい課税（ピグー税）や正の外部性への補助金で外部性を「内部化」する手法を提唱し、R.コースは取引費用が十分小さく財産権が明確なら権利の初期配分にかかわらず当事者間交渉で効率的解決に至りうる（コースの定理）と論じた。',
    keyFigures: 'A.C.ピグー（ピグー税・1920）／R.コース（コースの定理）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/externality-economics', type: 'reference', label: 'Encyclopaedia Britannica Money — Externality' },
      { url: 'https://www.econlib.org/library/Enc/Externalities.html', type: 'reference', label: 'Econlib (Concise Encyclopedia of Economics) — Externalities' },
      { url: 'https://dspace.mit.edu/bitstream/handle/1721.1/71009/14-03-fall-2004/contents/lecture-notes/lecture17.pdf', type: 'academic', label: 'MIT 14.03 (D.Autor) — Externalities, the Coase Theorem and Market Remedies' },
    ],
  },
  {
    id: 'econ-opportunity-cost',
    discipline: 'economics',
    title: '機会費用（opportunity cost）',
    statement:
      '機会費用とは、ある選択を行った際に、その選択のために断念した次善の代替案から得られたはずの価値（最大の便益）を指す経済学の基礎概念である。会計帳簿に記録される明示的費用（現金支出等）だけでなく、放棄した代替的用途の価値である暗黙の費用' +
      '（時間・労力・見送った投資収益等）を含む。希少性ゆえにあらゆる選択にはトレードオフが伴い、機会費用は合理的意思決定と希少資源の効率的配分の中核をなす。これに対し既に支出済みで回収不能なサンクコスト（埋没費用）は将来志向の意思決定では無視すべきであり、機会費用とは対照的に扱われる。',
    keyFigures: 'F.フォン・ヴィーザー（19世紀末・概念の定式化）／対比: サンクコスト',
    asOf: '2026-06',
    sources: [
      { url: 'https://openstax.org/books/principles-economics-3e/pages/2-1-how-individuals-make-choices-based-on-their-budget-constraint', type: 'academic', label: 'OpenStax Principles of Economics 3e — Opportunity cost' },
      { url: 'https://www.britannica.com/money/opportunity-cost', type: 'reference', label: 'Encyclopaedia Britannica Money — Opportunity cost' },
      { url: 'https://www.stlouisfed.org/open-vault/2020/january/real-life-examples-opportunity-cost', type: 'government', label: 'Federal Reserve Bank of St. Louis — Opportunity cost の実例' },
    ],
  },
  {
    id: 'mgmt-core-competence',
    discipline: 'management',
    title: 'コアコンピタンス（中核的能力）',
    statement:
      'コアコンピタンスとは、C.K.プラハラードとゲイリー・ハメルが1990年のHarvard Business Review論文「The Core Competence of the Corporation」で提唱した、企業の持続的競争優位の源泉となる中核的な能力である。彼らはこれを「組織における集合的な学習、' +
      'とりわけ多様な生産技能を調整し複数の技術の流れを統合する能力」と定義した。特定の製品や単一技術ではなく組織に蓄積された技術・スキルの集合体であり、(1)多様な市場へのアクセスを可能にする、(2)最終製品における顧客の知覚便益に大きく貢献する、(3)競合他社が模倣困難である、の3要件で識別される。',
    keyFigures: 'C.K.プラハラード／ゲイリー・ハメル（1990 HBR）',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/1990/05/the-core-competence-of-the-corporation', type: 'academic', label: 'Prahalad & Hamel, The Core Competence of the Corporation, HBR (1990)' },
      { url: 'https://michiganross.umich.edu/about/100-years/our-impact/1990/core-competence-corporation', type: 'academic', label: 'University of Michigan Ross — Core Competence of the Corporation 解説' },
      { url: 'https://en.wikipedia.org/wiki/Core_competency', type: 'reference', label: 'Wikipedia — Core competency' },
    ],
  },
  {
    id: 'human-cognitive-dissonance',
    discipline: 'human-science',
    title: '認知的不協和（cognitive dissonance）',
    statement:
      '認知的不協和とは、人が矛盾する2つ以上の認知（信念・態度・行動等）を同時に抱えたときに生じる不快な心理的緊張であり、レオン・フェスティンガーが1957年の著書『A Theory of Cognitive Dissonance』で提唱した。人はこの不快感を低減するため、矛盾する認知の一方を変える、' +
      '新たな整合的認知を加える、矛盾情報の重要性を下げる等の方法で整合化を図る。喫煙者が健康リスクを過小評価する例が典型である。フェスティンガー&カールスミス(1959)の強制的服従実験では、退屈な作業を「面白かった」と偽るよう求められた被験者のうち報酬が少額（1ドル）の群の方が、高額（20ドル）の群より作業を楽しかったと評価した（外的正当化が乏しいほど強い不協和が生じ態度が内面的に変容する）。',
    keyFigures: 'レオン・フェスティンガー（1957）／カールスミス（1959 共同実験）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Leon-Festinger/Cognitive-dissonance', type: 'reference', label: 'Encyclopaedia Britannica — Leon Festinger: Cognitive dissonance' },
      { url: 'https://psychclassics.yorku.ca/Festinger/', type: 'academic', label: 'York University Classics — Festinger & Carlsmith (1959) 原典全文' },
      { url: 'https://en.wikipedia.org/wiki/Cognitive_dissonance', type: 'reference', label: 'Wikipedia — Cognitive dissonance' },
    ],
  },
  {
    id: 'bizlaw-product-liability',
    discipline: 'business-law',
    title: '製造物責任法（PL法）',
    statement:
      '製造物責任法（PL法、平成6年法律第85号）は1995年（平成7年）7月1日に施行された、製造物の欠陥により人の生命・身体・財産に損害が生じた場合の製造業者等の損害賠償責任を定める法律。民法の不法行為の特則として「無過失責任」を採用し、被害者は製造業者等の過失を' +
      '証明しなくても、製造物に「欠陥」があったこと・損害の発生・両者の因果関係を証明すれば賠償を請求できる（3条）。対象は「製造又は加工された動産」に限られ、不動産・未加工農林水産物・ソフトウェア単体・サービス等は原則対象外（2条）。引渡し時の科学・技術の知見では欠陥を認識できなかったことを証明すれば免責される' +
      '「開発危険の抗弁」等の免責事由（4条）や、損害・賠償義務者を知った時から3年（人身は5年）／引渡しから10年の期間制限（5条）がある。所管は消費者庁。',
    keyFigures: '製造物責任法（平成6年法律第85号・1995/7/1施行）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_safety/other/pl_qa.html', type: 'government', label: '消費者庁 製造物責任法の概要Q&A' },
      { url: 'https://laws.e-gov.go.jp/law/406AC0000000085', type: 'government', label: 'e-Gov法令検索 製造物責任法' },
      { url: 'https://ja.wikipedia.org/wiki/製造物責任法', type: 'reference', label: 'Wikipedia 日本語版 — 製造物責任法' },
    ],
  },
  {
    id: 'infosoc-diffusion-of-innovations',
    discipline: 'information-sociology',
    title: 'イノベーションの普及理論（Diffusion of Innovations）',
    statement:
      'イノベーションの普及理論は、社会学者エベレット・ロジャーズが1962年の著書で体系化した、新しいアイデア・技術が社会システム内に時間をかけて広まる過程の理論である。採用者は採用の早い順にイノベーター(2.5%)・アーリーアダプター(13.5%)・アーリーマジョリティ(34%)・' +
      'レイトマジョリティ(34%)・ラガード(16%)の5類型に分類され、累積採用率はS字カーブを描く。普及速度は、相対的優位性・両立可能性・複雑性・試行可能性・観察可能性という5つの知覚属性に左右される。なお、ジェフリー・ムーアの「キャズム」（アーリーアダプターとアーリーマジョリティの間の溝）はこの曲線を前提とした関連概念である。',
    keyFigures: 'エベレット・ロジャーズ（1962）／関連: ジェフリー・ムーア（キャズム）',
    asOf: '2026-06',
    sources: [
      { url: 'https://sphweb.bumc.bu.edu/otlt/mph-modules/sb/behavioralchangetheories/behavioralchangetheories4.html', type: 'academic', label: 'Boston University School of Public Health — Diffusion of Innovation Theory' },
      { url: 'https://www.britannica.com/topic/diffusion-of-innovations', type: 'reference', label: 'Encyclopaedia Britannica — Diffusion of innovations' },
      { url: 'https://www.techtarget.com/whatis/feature/Diffusion-of-innovations-theory-Definition-and-examples', type: 'media', label: 'TechTarget — Diffusion of innovations theory' },
    ],
  },
  {
    id: 'econ-keynesian-effective-demand',
    discipline: 'economics',
    title: '有効需要の原理と乗数効果（ケインズ経済学）',
    statement:
      'ジョン・メイナード・ケインズが『雇用・利子および貨幣の一般理論』(1936)で示した「有効需要の原理」は、経済全体の産出量と雇用の水準が供給能力ではなく総需要（消費＋投資＋政府支出）の大きさによって決まるとする原理である。古典派が想定した完全雇用への自動調整は必ずしも働かず、' +
      '需要不足によって「非自発的失業」が均衡として持続しうるため、不況時には政府支出の拡大や減税といった財政政策による需要喚起が有効とされる。さらに、独立的支出の増加は消費の連鎖を通じて何倍もの国民所得増をもたらす「乗数効果」を生み、乗数の大きさは限界消費性向MPCを用いて 1/(1−MPC) で表される（例: MPC=0.75なら乗数=4）。',
    keyFigures: 'J.M.ケインズ（1936『一般理論』）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.imf.org/external/pubs/ft/fandd/basics/4_keynes.htm', type: 'government', label: 'IMF Finance & Development — What Is Keynesian Economics?' },
      { url: 'https://www.britannica.com/topic/The-General-Theory-of-Employment-Interest-and-Money', type: 'reference', label: 'Encyclopaedia Britannica — The General Theory of Employment, Interest and Money' },
      { url: 'https://en.wikipedia.org/wiki/Principle_of_effective_demand', type: 'reference', label: 'Wikipedia — Principle of effective demand' },
    ],
  },
  {
    id: 'econ-price-elasticity-demand',
    discipline: 'economics',
    title: '需要の価格弾力性',
    statement:
      '需要の価格弾力性は、価格が1%変化したときに需要量が何%変化するかを表す指標で、「需要量の変化率÷価格の変化率」として計算される。需要曲線は右下がりのため通常は負の値をとるが慣例として絶対値で論じ、絶対値が1より大きければ「弾力的」（贅沢品等、価格変化に敏感）、' +
      '1未満なら「非弾力的」（生活必需品等）、ちょうど1なら「単位弾力的」と呼ぶ。弾力性の大きさは代替財の有無（多いほど弾力的）・家計の予算に占める割合・時間的視野（長期ほど弾力的）等に左右される。総収入との関係では、弾力的なら値下げで増収・非弾力的なら値上げで増収となり、総収入は弾力性が1の点で最大となる。',
    keyFigures: '需要量の変化率÷価格の変化率（弾力的>1>非弾力的）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/elasticity-economics', type: 'reference', label: 'Encyclopaedia Britannica Money — Elasticity' },
      { url: 'https://openstax.org/books/principles-economics-3e/pages/5-1-price-elasticity-of-demand-and-price-elasticity-of-supply', type: 'academic', label: 'OpenStax Principles of Economics 3e — Price Elasticity of Demand' },
      { url: 'https://ecampusontario.pressbooks.pub/principlesofmicroeconomicscdn/chapter/6-2-determinants-of-elasticity-of-demand/', type: 'academic', label: 'Principles of Microeconomics — Determinants of Elasticity of Demand' },
    ],
  },
  {
    id: 'mgmt-bcg-matrix',
    discipline: 'management',
    title: 'プロダクト・ポートフォリオ・マネジメント（PPM／BCGマトリクス）',
    statement:
      'PPM（BCGマトリクス）は、ボストン・コンサルティング・グループ（BCG）の創業者ブルース・ヘンダーソンが1970年前後（1970年の小冊子『The Product Portfolio』で公表）に提唱した事業ポートフォリオ分析の枠組み。各事業や製品を「市場成長率（縦軸）」と「相対的市場占有率（横軸）」の2軸でプロットし、' +
      '花形(star＝高成長・高シェア)・金のなる木(cash cow＝低成長・高シェア)・問題児(question mark＝高成長・低シェア)・負け犬(dog＝低成長・低シェア)の4象限に分類する。背景には経験曲線効果と製品ライフサイクルの発想があり、cash cowが生む資金をstarや将来性のあるquestion markに再配分し、負け犬は撤退・縮小を検討する等の含意を持つ。',
    keyFigures: 'ブルース・ヘンダーソン／ボストン・コンサルティング・グループ（1970）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.bcg.com/about/overview/our-history/growth-share-matrix', type: 'reference', label: 'BCG — What Is the Growth Share Matrix?（提唱者BCGの原典解説）' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/growth-share-matrix', type: 'academic', label: 'EBSCO Research Starters — Growth–share matrix' },
      { url: 'https://en.wikipedia.org/wiki/Growth%E2%80%93share_matrix', type: 'reference', label: 'Wikipedia — Growth–share matrix' },
    ],
  },
  {
    id: 'human-herzberg-two-factor',
    discipline: 'human-science',
    title: 'ハーズバーグの二要因理論（動機づけ・衛生理論）',
    statement:
      '心理学者フレデリック・ハーズバーグが1959年に提唱した職務動機づけ理論で、職務満足をもたらす「動機づけ要因（達成・承認・仕事そのもの・責任・昇進・成長等、仕事の内容に関わる内発的要因）」と、不満をもたらす「衛生要因（会社の方針・監督・労働条件・給与・対人関係等、仕事の環境に関わる要因）」は別個に独立して作用するとする。' +
      '衛生要因を改善すれば不満は減少するが、それ自体は積極的な満足（動機づけ）を生まず、満足を高めるには動機づけ要因が必要である。すなわち満足と不満は単一の連続体の両端ではなく直交した別構成概念であり、「満足の反対は不満ではなく満足がないこと」という非対称性を主張する（他手法による検証では支持されないとの批判もある）。',
    keyFigures: 'フレデリック・ハーズバーグ（1959）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/two-factor-theory', type: 'reference', label: 'Encyclopaedia Britannica Money — Two-factor theory' },
      { url: 'https://en.wikipedia.org/wiki/Two-factor_theory', type: 'reference', label: 'Wikipedia — Two-factor theory' },
      { url: 'https://www.simplypsychology.org/herzbergs-two-factor-theory.html', type: 'reference', label: 'Simply Psychology — Herzberg’s Two-Factor Theory' },
    ],
  },
  {
    id: 'bizlaw-unreasonable-restraint-of-trade',
    discipline: 'business-law',
    title: '不当な取引制限（カルテル・入札談合）の禁止',
    statement:
      '独占禁止法は、事業者が名義のいかんを問わず他の事業者と共同して、対価を決定・維持・引上げたり、数量・技術・製品・設備・取引の相手方を制限する等、相互にその事業活動を拘束・遂行することにより、公共の利益に反して一定の取引分野における競争を実質的に制限する行為を「不当な取引制限」（2条6項）と定義し、3条後段で禁止している。' +
      '典型例が価格カルテルと入札談合で、違反は公正取引委員会による排除措置命令・課徴金納付命令の対象となり、悪質な場合は刑事罰の対象にもなりうる。自ら関与したカルテル・談合を自主申告した事業者の課徴金を減免する課徴金減免制度（リーニエンシー、2006年導入、令和元年改正で調査協力度に応じた減算を追加）がある。',
    keyFigures: '独占禁止法2条6項・3条／公正取引委員会／課徴金減免制度（2006）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jftc.go.jp/dk/dkgaiyo/gaiyo.html', type: 'government', label: '公正取引委員会 独占禁止法の概要' },
      { url: 'https://www.jftc.go.jp/dk/seido/genmen/', type: 'government', label: '公正取引委員会 課徴金減免制度（リーニエンシー）' },
      { url: 'https://www.gov-online.go.jp/article/202511/entry-10038.html', type: 'government', label: '政府広報オンライン 独占禁止法 不当な取引制限' },
    ],
  },
  {
    id: 'infosoc-information-goods',
    discipline: 'information-sociology',
    title: '情報財の経済的特性（高固定費・ゼロ限界費用・非競合性・経験財）',
    statement:
      '情報財（ソフトウェア・デジタルコンテンツ・データ等）は、最初の1コピーの制作に多額の固定費を要する一方、複製・配布の限界費用がほぼゼロという費用構造を持つ。さらに消費が競合しない非競合性を備え、使ってみるまで価値が分からない経験財であり、容易に複製でき排除が難しいため公共財的性質を帯びる。' +
      'このため価格を限界費用に基づいて設定できず、消費者の価値（支払意思額）に応じた価格づけが必要になる。カール・シャピロとハル・ヴァリアンは『情報経済の鉄則（Information Rules）』(1998)で、これらの特性ゆえに製品差別化・バージョニング・バンドリング・ロックイン等の戦略が情報財ビジネスの鍵になると論じた。',
    keyFigures: 'カール・シャピロ＆ハル・ヴァリアン（1998『Information Rules』）',
    asOf: '2026-06',
    sources: [
      { url: 'https://link.springer.com/article/10.1007/BF02706247', type: 'academic', label: 'Sādhanā — Pricing strategies for information goods（高固定費・ゼロ限界費用・非競合性）' },
      { url: 'https://en.wikipedia.org/wiki/Information_good', type: 'reference', label: 'Wikipedia — Information good' },
      { url: 'https://www.amazon.com/Information-Rules-Strategic-Network-Economy/dp/087584863X', type: 'reference', label: 'Shapiro & Varian, Information Rules (Harvard Business School Press, 1998) 書誌' },
    ],
  },
  {
    id: 'econ-phillips-curve',
    discipline: 'economics',
    title: 'フィリップス曲線（インフレ率と失業率のトレードオフ）',
    statement:
      'A.W.フィリップスが1958年に英国の1861〜1957年データを用い、名目賃金上昇率と失業率の間に負の相関（失業率が低いほど賃金上昇率が高い）を見出したことに由来する。その後サミュエルソンらにより賃金上昇率はインフレ率へ一般化され「インフレ率と失業率のトレードオフ」として政策指針とされた。' +
      'しかし1970年代のスタグフレーション（高インフレと高失業の併存）でこの安定的トレードオフは崩れ、フリードマンとフェルプスが「自然失業率仮説」「期待で修正されたフィリップス曲線」を提示し、インフレ期待が織り込まれると失業率は自然失業率に戻るため政府は高インフレと低失業を恒久的に交換できず、長期フィリップス曲線は自然失業率の水準で垂直になると論じた。',
    keyFigures: 'A.W.フィリップス（1958）／フリードマン・フェルプス（自然失業率仮説）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Phillips-curve', type: 'reference', label: 'Encyclopaedia Britannica Money — Phillips curve' },
      { url: 'https://www.stlouisfed.org/open-vault/2020/january/what-is-phillips-curve-why-flattened', type: 'government', label: 'Federal Reserve Bank of St. Louis — What’s the Phillips Curve?' },
      { url: 'https://www.econlib.org/library/Enc/PhillipsCurve.html', type: 'reference', label: 'Econlib — Phillips Curve（自然失業率・長期垂直）' },
    ],
  },
  {
    id: 'econ-economies-of-scale-scope',
    discipline: 'economics',
    title: '規模の経済と範囲の経済',
    statement:
      '規模の経済とは、生産量の増加に伴って製品1単位あたりの平均費用が低下する現象で、固定費・設備を多数の生産単位に分散できること、大量購買による単価低減、専門化（分業）等が要因となる。範囲の経済とは、複数の異なる製品・サービスを別々の企業がそれぞれ生産するよりも、1企業が生産設備・調達・技術・ブランド・流通網等の共通資源を共有して共同生産する方が総費用が低くなる現象をいう。' +
      '両者の核心的違いは、規模の経済が「同一製品をより多く作る」ことによる単位費用低減であるのに対し、範囲の経済は「異なる複数製品を一緒に作る」ことによる費用優位である点。なお規模の経済は無制限ではなく、組織が過大化すると調整・管理コストが増し平均費用が上昇する「規模の不経済」が生じうる。',
    keyFigures: '範囲の経済の定式化: パンザー＆ウィリッグ（1981）／対比: 規模の不経済',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/economy-of-scale', type: 'reference', label: 'Encyclopaedia Britannica Money — Economy of scale' },
      { url: 'https://courses.lumenlearning.com/wm-microeconomics/chapter/economies-of-scale/', type: 'academic', label: 'Lumen Learning Microeconomics — Economies of Scale' },
      { url: 'https://en.wikipedia.org/wiki/Economies_of_scope', type: 'reference', label: 'Wikipedia — Economies of scope' },
    ],
  },
  {
    id: 'mgmt-balanced-scorecard',
    discipline: 'management',
    title: 'バランスト・スコアカード（BSC）',
    statement:
      'バランスト・スコアカード（BSC）は、ロバート・キャプランとデビッド・ノートンが1992年のHarvard Business Review論文で提唱した業績評価・戦略マネジメントの枠組みである。財務指標に偏った従来の評価では知識・イノベーション時代の企業実態を捉えきれないという問題意識から、(1)財務、(2)顧客、(3)業務プロセス（内部ビジネスプロセス）、(4)学習と成長の4つの視点から、' +
      '戦略目標・KPI・ターゲット・施策をバランスよく管理する。各視点に財務・非財務の指標を結びつけ、短期的成果と長期的な能力構築を同時に可視化・統制できる点に特徴がある。1996年以降は4視点の戦略目標を因果連鎖（学習と成長→内部プロセス→顧客→財務）として図示する「戦略マップ」を導入し、測定ツールから戦略実行のマネジメント・システムへ拡張した。',
    keyFigures: 'ロバート・キャプラン／デビッド・ノートン（1992 HBR）',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/1992/01/the-balanced-scorecard-measures-that-drive-performance-2', type: 'academic', label: 'Kaplan & Norton, The Balanced Scorecard, Harvard Business Review (1992)' },
      { url: 'https://online.hbs.edu/blog/post/balanced-scorecard', type: 'academic', label: 'Harvard Business School Online — What Is a Balanced Scorecard?' },
      { url: 'https://www.mdpi.com/2673-8392/5/1/39', type: 'academic', label: 'Encyclopedia (MDPI) — Balanced Scorecard: History, Implementation, and Impact' },
    ],
  },
  {
    id: 'human-social-loafing',
    discipline: 'human-science',
    title: '社会的手抜き（リンゲルマン効果）',
    statement:
      '社会的手抜き（social loafing）とは、集団で共同作業を行うとき、一人当たりの努力量が単独で作業する場合より低下する現象をいう。起源は農業技術者マクシミリアン・リンゲルマンの綱引き実験で、参加人数が増えるほど一人当たりの引く力が減少すること（リンゲルマン効果）が示された。後にラタネ・ウィリアムズ・ハーキンスが1979年の論文で拍手・発声課題を用いて実証し「social loafing」と命名した。' +
      '原因として、努力の埋没（自分の貢献が個別に評価されにくい）や責任の分散が挙げられ、逆に各個人の貢献を可視化・識別して評価可能にすると手抜きは軽減される。',
    keyFigures: 'M.リンゲルマン（綱引き実験）／ラタネ・ウィリアムズ・ハーキンス（1979）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.scirp.org/reference/referencespapers?referenceid=888065', type: 'academic', label: 'Latané, Williams & Harkins (1979) Many Hands Make Light the Work, JPSP 37:822–832' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/social-loafing', type: 'academic', label: 'EBSCO Research Starters — Social loafing' },
      { url: 'https://www.simplypsychology.org/social-loafing.html', type: 'reference', label: 'Simply Psychology — Social Loafing' },
    ],
  },
  {
    id: 'bizlaw-copyright-basics',
    discipline: 'business-law',
    title: '著作権法の基礎（無方式主義・二元的権利構成・保護期間）',
    statement:
      '著作権法は、思想又は感情を創作的に表現したもの（著作物）を保護し、権利は創作した時点で自動的に発生し登録等の方式を一切要しない（無方式主義、著作権法17条2項）。著作者の権利は、人格的利益を守る著作者人格権（公表権・氏名表示権・同一性保持権。一身専属で譲渡・相続できない）と、財産的利益を守る著作権' +
      '（複製権・公衆送信権・翻案権等の支分権の束で、譲渡・相続が可能）に分かれる。保護期間は原則として著作者の死後70年で、2018年のTPP関連法改正により50年から70年へ延長された（法人著作・映画の著作物は公表後70年）。保護されるのは表現であってアイデアそのものではない（アイデア・表現二分論）。所管は文化庁。',
    keyFigures: '著作権法（無方式主義17条2項・死後70年〔2018改正〕）／文化庁',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/seidokaisetsu/pdf/94283401_01.pdf', type: 'government', label: '文化庁 著作権テキスト' },
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/kantaiheiyo_chosakuken/1411890.html', type: 'government', label: '文化庁 著作物等の保護期間の延長に関するQ&A' },
      { url: 'https://www.cric.or.jp/qa/hajime/hajime2.html', type: 'media', label: '著作権情報センター（CRIC）著作権Q&A 著作者の権利' },
    ],
  },
  {
    id: 'infosoc-digital-divide',
    discipline: 'information-sociology',
    title: 'デジタルデバイド（情報格差）',
    statement:
      'デジタルデバイド（情報格差）とは、情報通信技術（ICT・インターネット）へのアクセスや利用能力の有無によって生じる、個人・集団・地域・国家間の格差を指す概念である。OECDは「ICTへのアクセス機会及びインターネットの多様な利用に関して、異なる社会経済水準にある個人・世帯・企業・地域間に存在する格差」と定義する。' +
      '研究上は、機器・回線を持てるかという「アクセス格差（第一のデバイド）」、使いこなすスキル・リテラシーの差である「利用・スキル格差（第二のデバイド）」、利用を経済的・社会的成果へ変換できるかという「活用・成果の格差（第三のデバイド）」に区分して論じられる。格差は地域間・世代間・所得間・国際間に現れ、総務省・OECD・ITU等が解消（デジタル・インクルージョン）を図っている。',
    keyFigures: '総務省／OECD／ITU／J.ファンダイク（3段階デバイド）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oecd.org/en/topics/digital-divides.html', type: 'government', label: 'OECD — Digital divides' },
      { url: 'https://www.soumu.go.jp/johotsusintokei/whitepaper/ja/h23/html/nc222310.html', type: 'government', label: '総務省 情報通信白書 — デジタル・ディバイド' },
      { url: 'https://www.itu.int/itu-d/reports/statistics/facts-figures-2025/', type: 'government', label: 'ITU — Measuring digital development: Facts and Figures 2025' },
    ],
  },
  {
    id: 'econ-inflation-deflation',
    discipline: 'economics',
    title: 'インフレーションとデフレーション（物価変動と金融政策）',
    statement:
      'インフレーションとは物価水準が持続的に上昇し貨幣の購買力が低下する現象であり、デフレーションはその逆で物価水準が持続的に下落する現象である。要因としては、総需要が供給能力を超えて生じる「ディマンドプル（需要牽引）」と、原油高や供給制約など生産コスト上昇に起因する「コストプッシュ（費用押上げ）」が区別され、貨幣数量説的な見方では中長期の物価はマネー供給と結びつくとされる。' +
      'デフレは、債務の実質負担を増やし、値下がり期待による消費・投資の先送りを促し、需要減→賃金・物価下落→さらなる需要減という「デフレスパイラル」を招きうる。こうした不安定を避けるため、日本銀行・FRBをはじめ多くの中央銀行は概ね年2%程度の物価安定目標を掲げている。',
    keyFigures: '日本銀行・FRB等の物価安定目標（概ね2%）／ディマンドプル・コストプッシュ',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.imf.org/en/publications/fandd/issues/series/back-to-basics/inflation', type: 'government', label: 'IMF Finance & Development — Inflation: Prices on the Rise' },
      { url: 'https://www.boj.or.jp/mopo/outline/target.htm', type: 'government', label: '日本銀行 2％の「物価安定の目標」' },
      { url: 'https://www.federalreserve.gov/faqs/economy_14400.htm', type: 'government', label: 'Federal Reserve — Why 2 percent inflation?' },
    ],
  },
  {
    id: 'econ-coase-theorem',
    discipline: 'economics',
    title: 'コースの定理（Coase theorem）',
    statement:
      '取引費用がゼロ（または無視できるほど小さく）かつ所有権が明確に定義・執行可能であれば、外部性が存在しても当事者間の自発的な交渉によってパレート効率的な資源配分が達成され、その結果は権利の初期配分に依存しない、とする命題。' +
      'ロナルド・コースが1960年の論文「社会的費用の問題」で示した考えに基づき（「コースの定理」の命名はジョージ・スティグラー1966）、外部性に対しピグー税などの政府介入を当然視する立場への反論となる。ただしコース自身が強調したのは現実には取引費用が正であり交渉が成立しにくい点であり、だからこそ権利配分や法・制度の設計が効率に影響する。「取引費用ゼロ」は理想化された前提であって、定理の主眼はむしろ現実の取引費用の重要性にある（1991年ノーベル講演で本来の主張がしばしば誤解されてきたと述べた）。',
    keyFigures: 'ロナルド・コース（1960「社会的費用の問題」、1991年ノーベル経済学賞）／命名: ジョージ・スティグラー（1966）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/environmental-economics/The-Coase-theorem', type: 'reference', label: 'Encyclopædia Britannica (Money) — The Coase theorem' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1991/coase/lecture/', type: 'government', label: 'NobelPrize.org — Ronald Coase, 1991 Prize Lecture' },
      { url: 'https://en.wikipedia.org/wiki/Coase_theorem', type: 'reference', label: 'Wikipedia — Coase theorem（定義・スティグラー命名の経緯）' },
    ],
  },
  {
    id: 'econ-liquidity-trap',
    discipline: 'economics',
    title: '流動性の罠（liquidity trap）',
    statement:
      '名目金利がゼロ近傍まで低下した結果、貨幣と債券が事実上の完全代替物となり、人々が両者を無差別に保有する（追加供給された貨幣を退蔵する）ため、中央銀行が貨幣供給を増やしても金利をそれ以上下げられず総需要を刺激できなくなる状態。' +
      'IS-LM分析では貨幣需要曲線（LM曲線の一部）が水平となり、貨幣供給の増加が金利低下を生まないため伝統的金融政策が無効化する。J.M.ケインズが『一般理論』(1936)で示唆し、J.R.ヒックスがIS-LMモデルで概念と政策的含意を定式化、ポール・クルーグマンが1998年の論文で日本のデフレ・ゼロ金利不況を分析して現代的に再評価した。含意として財政政策の有効性、インフレ期待の醸成（負の実質金利の実現）、量的緩和など非伝統的金融政策の役割が論じられる。',
    keyFigures: 'J.M.ケインズ（1936『一般理論』で示唆）／J.R.ヒックス（IS-LMで定式化）／ポール・クルーグマン（1998 日本の流動性の罠を再評価）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/liquidity-trap', type: 'reference', label: 'Encyclopedia.com — Liquidity Trap（ケインズ示唆／ヒックスIS-LM定式化）' },
      { url: 'https://www.brookings.edu/articles/its-baaack-japans-slump-and-the-return-of-the-liquidity-trap/', type: 'academic', label: 'Krugman (1998) — It’s Baaack: Japan’s Slump and the Return of the Liquidity Trap（BPEA）' },
      { url: 'https://www.frbsf.org/research-and-insights/publications/economic-letter/2000/06/japan-recession-is-the-liquidity-trap-back/', type: 'government', label: 'San Francisco Fed — Japan’s Recession: Is the Liquidity Trap Back? (2000)' },
    ],
  },
  {
    id: 'mgmt-resource-based-view',
    discipline: 'management',
    title: '資源ベース理論（Resource-Based View, RBV）とVRIO',
    statement:
      '持続的競争優位の源泉を業界構造（外部要因）ではなく企業内部に蓄積された経営資源・ケイパビリティの異質性に求める経営戦略論。バーガー・ワーナーフェルトの1984年論文「A Resource-Based View of the Firm」が起点とされ、エディス・ペンローズの1959年『企業成長の理論』が源流的影響を与えた。' +
      'ジェイ・バーニーは1991年論文で体系化し、資源が価値(Value)・希少性(Rarity)・模倣困難性(Inimitability)・組織(Organization)の条件＝VRIOを満たすとき持続的競争優位がもたらされると論じた。当初の枠組みはVRIN（価値・希少・模倣困難・代替不可能）で、後に代替不可能性を模倣困難性に統合し組織(O)を加えてVRIOとなった。限界として、資源価値を成功から事後的に推論する循環論法的・静態的で反証困難との批判（Priem & Butler 2001 ほか）や急速な環境変化への対応の弱さが指摘される。',
    keyFigures: 'ジェイ・B・バーニー（1991体系化・VRIO）／バーガー・ワーナーフェルト（1984起点）／エディス・ペンローズ（1959源流）',
    asOf: '2026-06',
    sources: [
      { url: 'https://sms.onlinelibrary.wiley.com/doi/abs/10.1002/smj.4250050207', type: 'academic', label: 'Wernerfelt (1984) A Resource-Based View of the Firm, SMJ 5(2):171-180（原典）' },
      { url: 'https://journals.sagepub.com/doi/10.1177/014920639101700108', type: 'academic', label: 'Barney (1991) Firm Resources and Sustained Competitive Advantage, J. of Management 17(1):99-120（原典）' },
      { url: 'https://en.wikipedia.org/wiki/Resource-based_view', type: 'reference', label: 'Wikipedia — Resource-based view（VRIN→VRIOの経緯・限界）' },
    ],
  },
  {
    id: 'human-confirmation-bias',
    discipline: 'human-science',
    title: '確証バイアス（confirmation bias）',
    statement:
      '自分が既に持つ信念・仮説・期待に合致する情報を選択的に探索・解釈・記憶し、それに反する証拠を軽視・無視する認知バイアス。情報の「探索」「解釈」「想起」の各段階で生じうる。' +
      'イギリスの認知心理学者ピーター・ウェイソンが1960年代に「2-4-6課題」（数列を生成した規則を当てる課題）や「選択課題（Wason selection task）」で実証し、人が自説を反証する事例ではなく確証する事例ばかりを検証する傾向を示した。レイモンド・S・ニッカーソンは1998年の論文「Confirmation Bias: A Ubiquitous Phenomenon in Many Guises」(Review of General Psychology 2(2):175-220)で包括的にレビューした。仮説検証・科学的推論・司法判断・投資判断などにおける誤りの原因とされ、反証可能性の軽視と深く関わる。',
    keyFigures: 'ピーター・ウェイソン（1960年代、2-4-6課題/選択課題で実証）／レイモンド・S・ニッカーソン（1998 包括レビュー）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/confirmation-bias', type: 'reference', label: 'Encyclopaedia Britannica — Confirmation bias' },
      { url: 'https://journals.sagepub.com/doi/abs/10.1037/1089-2680.2.2.175', type: 'academic', label: 'Nickerson (1998) Confirmation Bias, Review of General Psychology 2(2):175-220（SAGE 査読論文）' },
      { url: 'https://en.wikipedia.org/wiki/Confirmation_bias', type: 'reference', label: 'Wikipedia — Confirmation bias' },
    ],
  },
  {
    id: 'bizlaw-duty-of-care',
    discipline: 'business-law',
    title: '善管注意義務（善良な管理者の注意義務）',
    statement:
      '一定の職業・地位にある者に、その立場で社会通念上通常期待される客観的水準の注意をもって事務を処理することを求める義務。民法644条は「受任者は、委任の本旨に従い、善良な管理者の注意をもって、委任事務を処理する義務を負う」と定め、これを受任者一般に課す。' +
      '会社法330条により株式会社と取締役・監査役等の役員との関係は委任に関する規定に従うため、役員も会社に対し善管注意義務を負う。違反した場合は債務不履行責任、役員については任務懈怠（会社法423条）に基づく損害賠償責任を生じうる。注意の水準は本人の主観的能力ではなく地位・職業から客観的に定まる点が特徴で、無報酬の受寄者に課される「自己の財産に対するのと同一の注意」（民法659条）など、より軽い注意義務とは区別される。なお会社法355条の忠実義務は、判例（最大判昭45.6.24）上、善管注意義務を敷衍・具体化したもので別個の高度な義務ではないとされる（同質説）。',
    keyFigures: '民法644条（受任者の善管注意義務）／会社法330条（役員と会社の委任関係）・355条（忠実義務）・423条（任務懈怠責任）／対比: 民法659条',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索『会社法』（330条・355条の正文）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0644-00/', type: 'reference', label: 'クレアール — 民法644条【受任者の注意義務】条文解説' },
      { url: 'https://nexpert-law.com/business/columns/responsibility/52/', type: 'media', label: '弁護士法人ネクスパート法律事務所 — 取締役の善管注意義務（会社法330条・民法644条の関係）' },
    ],
  },
  {
    id: 'infosoc-filter-bubble',
    discipline: 'information-sociology',
    title: 'フィルターバブルとエコーチェンバー',
    statement:
      'フィルターバブル（filter bubble）は活動家イーライ・パリサーが2011年の著書『The Filter Bubble』で提唱・普及させた概念で、検索エンジンやSNSのパーソナライズ・アルゴリズムが利用者の履歴等に基づき各人に好みに合う情報を選択的に提示し、結果として異なる視点から知的に隔離される現象を指す。' +
      'エコーチェンバー（echo chamber、起点はカス・サンスティーン2001年頃の議論）は、同質な意見が閉じた集団内で反響・反復され外部からの反証から遮断されて既存の信念が増幅・強化される環境を指す。フィルターバブルがアルゴリズム由来の選択的曝露であるのに対し、エコーチェンバーは集団内のコミュニケーションによる反響増幅であり外部の意見を能動的に排除・不信視する点で区別される。両者は世論の分極化や誤情報拡散との関連で論じられるが、実証研究では効果の大きさや存在範囲について証拠が一致しておらず（フィルターバブル仮説への支持は限定的との指摘あり）、評価は依然として議論が分かれている。',
    keyFigures: 'イーライ・パリサー（2011 フィルターバブル提唱）／カス・サンスティーン（2001 エコーチェンバー概念の起点）',
    asOf: '2026-06',
    sources: [
      { url: 'https://reutersinstitute.politics.ox.ac.uk/echo-chambers-filter-bubbles-and-polarisation-literature-review', type: 'academic', label: 'Reuters Institute（Oxford）— Echo chambers, filter bubbles, and polarisation: a literature review' },
      { url: 'https://en.wikipedia.org/wiki/Filter_bubble', type: 'reference', label: 'Wikipedia — Filter bubble' },
      { url: 'https://en.wikipedia.org/wiki/Echo_chamber_(media)', type: 'reference', label: 'Wikipedia — Echo chamber (media)' },
    ],
  },
  {
    id: 'econ-prisoners-dilemma',
    discipline: 'economics',
    title: '囚人のジレンマ（prisoner’s dilemma）',
    statement:
      '各プレイヤーが自己の合理性に従って「裏切り」という支配戦略を選ぶ結果、相互に協調した場合より双方にとって悪い帰結に陥る、代表的な非協力ゲーム。' +
      '支配戦略の組が唯一のナッシュ均衡を成すが、その均衡はパレート効率的ではなく（双方が黙秘すればより良い帰結が得られる）、個人合理性と全体最適が一致しない例として知られる。ランド研究所のメリル・フラッドとメルヴィン・ドレッシャーが1950年に原型を考案し、数学者アルバート・W・タッカーが囚人の物語として定式化し「囚人のジレンマ」と命名した。ゲームが繰り返される場合には協調が成立しうることが知られ、ロバート・アクセルロッドのトーナメントでは「しっぺ返し（tit for tat）」戦略が最も高い成績を収めた。',
    keyFigures: 'M.フラッド&M.ドレッシャー（1950 RAND考案）／A.W.タッカー（命名）／R.アクセルロッド（反復ゲーム・しっぺ返し）',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/prisoner-dilemma/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — Prisoner’s Dilemma' },
      { url: 'https://www.britannica.com/science/game-theory/The-prisoners-dilemma', type: 'reference', label: 'Encyclopaedia Britannica — Game theory: The prisoners’ dilemma' },
      { url: 'https://www.econlib.org/library/Enc/PrisonersDilemma.html', type: 'reference', label: 'Econlib, Concise Encyclopedia of Economics — Prisoners’ Dilemma' },
    ],
  },
  {
    id: 'econ-public-goods',
    discipline: 'economics',
    title: '公共財（非競合性・非排除性）',
    statement:
      '消費の非競合性（ある人の消費が他者の消費可能量を減らさない）と非排除性（対価を払わない者を消費から排除できない）を併せ持つ財・サービス。' +
      'これらの性質ゆえ市場では対価を払わずに便益を得るフリーライダー（ただ乗り）問題が生じ、供給者が費用を回収できないため過少供給に陥りやすい。この市場の失敗を是正するため政府による供給と租税による財源調達が正当化されうる。国防・灯台・一般道路・街灯などが典型例とされる（純粋公共財か否かには論争もある）。理論はポール・サミュエルソンが1954年論文「The Pure Theory of Public Expenditure」で定式化した。非排除的だが競合的な共有資源（コモンズ）や、両性質を部分的にしか満たさない準公共財とは区別される。',
    keyFigures: 'ポール・サミュエルソン（1954「The Pure Theory of Public Expenditure」, RES 36:387-389）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.econlib.org/library/Enc/PublicGoods.html', type: 'reference', label: 'Library of Economics and Liberty (Econlib) — Public Goods' },
      { url: 'https://www.imf.org/en/publications/fandd/issues/2021/12/global-public-goods-chin-basics', type: 'government', label: 'IMF Finance & Development — What Are Global Public Goods?' },
      { url: 'https://www.cambridge.org/core/journals/journal-of-the-history-of-economic-thought/article/abs/fifty-years-after-samuelsons-the-pure-theory-of-public-expenditure-what-are-we-left-with/CD54F8996C2F64B8C1E137D68E9B79DB', type: 'academic', label: 'Journal of the History of Economic Thought (Cambridge UP) — サミュエルソン1954論文の評価' },
    ],
  },
  {
    id: 'human-anchoring',
    discipline: 'human-science',
    title: 'アンカリング効果（係留と調整）',
    statement:
      '最初に提示された数値（アンカー）が、その後の数量推定や判断の基準点となり、人はそこから十分に調整せず判断がアンカーに偏る認知バイアス。' +
      'エイモス・トベルスキーとダニエル・カーネマンが1974年の論文「Judgment under Uncertainty: Heuristics and Biases」(Science誌)で「係留と調整（anchoring and adjustment）ヒューリスティック」として実証した。回転盤で得た無関係な数字を見せた後に国連加盟国に占めるアフリカ諸国の割合を推定させると、回転盤が10で止まった群の推定中央値は約25%、60で止まった群では約45%となり、本来無関係な初期値が推定を大きく左右した。価格交渉・販売・量刑・各種見積りなど数量判断を伴う多くの場面に広く影響する。',
    keyFigures: 'エイモス・トベルスキー & ダニエル・カーネマン（1974, Science 185:1124-1131）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.science.org/doi/10.1126/science.185.4157.1124', type: 'academic', label: 'Tversky & Kahneman (1974) Judgment under Uncertainty, Science 185(4157):1124-1131（一次資料）' },
      { url: 'https://www.britannica.com/topic/heuristic-reasoning', type: 'reference', label: 'Encyclopaedia Britannica — Heuristic（係留と調整ヒューリスティックの帰属）' },
      { url: 'https://en.wikipedia.org/wiki/Anchoring_effect', type: 'reference', label: 'Wikipedia — Anchoring effect（回転盤実験 10→25%/60→45%）' },
    ],
  },
  {
    id: 'bizlaw-keihyo-misrepresentation',
    discipline: 'business-law',
    title: '景品表示法の優良誤認・有利誤認表示',
    statement:
      '景品表示法（不当景品類及び不当表示防止法、通称「景表法」）5条は、一般消費者の自主的かつ合理的な選択を阻害するおそれのある不当な表示を禁止する。' +
      '優良誤認表示（5条1号）とは商品・役務の品質・規格その他の内容を実際または競争事業者のものより著しく優良と誤認させる表示、有利誤認表示（5条2号）とは価格その他の取引条件を実際または競争事業者のものより取引相手に著しく有利と誤認させる表示をいう。消費者庁が所管し、違反には措置命令や課徴金納付命令（課徴金制度は2014年改正で導入、2016年4月1日施行）が課される。優良誤認では不実証広告規制があり、消費者庁は事業者に表示の合理的根拠資料の提出を求めうる。2023年改正（2024年10月1日施行）で確約手続の導入や直罰規定（100万円以下の罰金）の新設等が行われた。',
    keyFigures: '景品表示法5条1号（優良誤認）・5条2号（有利誤認）／所管: 消費者庁／課徴金2016年施行・2023年改正(2024/10施行)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/representation_regulation/misleading_representation', type: 'government', label: '消費者庁 — 優良誤認とは（5条1号の定義・具体例）' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/representation_regulation/advantageous_misidentification', type: 'government', label: '消費者庁 — 有利誤認とは（5条2号の定義・具体例）' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/pdf/fair_labeling_181225_0002.pdf', type: 'government', label: '消費者庁 — 景品表示法への課徴金制度導入について（2016/4/1施行）' },
    ],
  },
  {
    id: 'mgmt-ansoff-matrix',
    discipline: 'management',
    title: 'アンゾフの成長マトリクス',
    statement:
      '企業の成長戦略を「製品（既存/新規）」×「市場（既存/新規）」の2軸4象限で類型化する経営戦略フレームワーク。' +
      '4戦略は、(1)市場浸透（既存製品×既存市場）、(2)新製品開発（新規製品×既存市場）、(3)新市場開拓（既存製品×新規市場）、(4)多角化（新規製品×新規市場）。製品・市場ともに未知となる多角化はリスクが最も高く、製品も市場も既存の市場浸透が最もリスクが低い。イゴール・アンゾフが1957年のHarvard Business Review論文「Strategies for Diversification」で提示し、著書『企業戦略論（Corporate Strategy）』(1965)で体系化した。アンゾフは「戦略経営（戦略的マネジメント）の父」と称される。',
    keyFigures: 'イゴール・アンゾフ（1957 HBR「Strategies for Diversification」／1965『Corporate Strategy』、「戦略経営の父」）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/business-and-management/ansoff-matrix', type: 'academic', label: 'EBSCO Research Starters — Ansoff Matrix（4戦略・多角化が最高リスク）' },
      { url: 'https://onlinelibrary.wiley.com/doi/full/10.1002/jsc.2600', type: 'academic', label: 'Puyt (2024) The Ansoff archive, Strategic Change (Wiley)' },
      { url: 'https://en.wikipedia.org/wiki/Ansoff_matrix', type: 'reference', label: 'Wikipedia — Ansoff matrix（1957 HBR論文・4戦略・リスク逓増）' },
    ],
  },
  {
    id: 'infosoc-knowledge-gap',
    discipline: 'information-sociology',
    title: '知識ギャップ仮説（knowledge gap hypothesis）',
    statement:
      'マスメディアによる情報の流入が社会システム内で増大すると、社会経済的地位（SES）や教育水準の高い層が低い層よりも速く情報・知識を獲得するため、両層の知識格差は縮小せずむしろ拡大する傾向がある、とするマスコミュニケーション論の仮説。' +
      '1970年、ミネソタ大学のフィリップ・ティチェナー、ジョージ・ドナヒュー、クラリス・オリエンが Public Opinion Quarterly 誌の論文「Mass Media Flow and Differential Growth in Knowledge」で提唱した。高学歴層が持つ優れた読解力、既存の蓄積知識、関連する社会的接触、情報の保持力などが格差拡大の背景とされる。情報アクセスがすべての人に等しく恩恵をもたらすという前提に疑問を投げかけ、後のデジタルデバイド論やインターネット時代の格差議論にも接続している。',
    keyFigures: 'P.ティチェナー / G.ドナヒュー / C.オリエン（1970, Public Opinion Quarterly 34(2):159-170, ミネソタ大学）',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/poq/article-abstract/34/2/159/1844584', type: 'academic', label: 'Tichenor, Donohue & Olien (1970) Mass Media Flow and Differential Growth in Knowledge, POQ 34(2):159-170（原典）' },
      { url: 'https://journals.sagepub.com/doi/abs/10.1177/009365027500200101', type: 'academic', label: 'Donohue, Tichenor & Olien (1975) Mass Media and the Knowledge Gap, Communication Research（SAGE 続報）' },
      { url: 'https://en.wikipedia.org/wiki/Knowledge_gap_hypothesis', type: 'reference', label: 'Wikipedia — Knowledge gap hypothesis' },
    ],
  },
  {
    id: 'econ-tragedy-of-commons',
    discipline: 'economics',
    title: 'コモンズの悲劇（tragedy of the commons）',
    statement:
      '誰でも利用でき排除が困難だが消費が競合的な共有資源（共有地・漁場・水・大気など）について、各個人が自己の利益を最大化しようと利用を増やした結果、資源が過剰利用されて枯渇・劣化し、結局は全員が損をする状況。' +
      '利用による便益は個人に帰属する一方コストは全利用者で共有されるため、個人にとって合理的な行動が集団全体には不利益をもたらす、個人と集団の合理性の衝突が本質である。米国の生態学者ギャレット・ハーディンが1968年の『Science』論文「The Tragedy of the Commons」で牧草地の例を用いて広く知らしめた。後にエリノア・オストロムが、共同体による自主的なルールや制度設計を通じてコモンズが持続的に管理されうることを実地調査に基づき実証し2009年にノーベル経済学賞を受賞、ハーディンの悲観的結論が普遍的ではなく限定的であることを示した。',
    keyFigures: 'ギャレット・ハーディン（1968 Science 162:1243-1248）／エリノア・オストロム（自主管理を実証、2009ノーベル経済学賞）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.science.org/doi/10.1126/science.162.3859.1243', type: 'academic', label: 'Garrett Hardin (1968) The Tragedy of the Commons, Science 162(3859):1243-1248（原典）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2009/ostrom/facts/', type: 'government', label: 'NobelPrize.org — Elinor Ostrom 2009（コモンズの分析）' },
      { url: 'https://www.britannica.com/science/tragedy-of-the-commons', type: 'reference', label: 'Encyclopaedia Britannica — Tragedy of the commons' },
    ],
  },
  {
    id: 'econ-sunk-cost',
    discipline: 'economics',
    title: 'サンクコスト（埋没費用）とサンクコストの誤謬',
    statement:
      'サンクコスト（埋没費用）とは既に支出され回収不能な費用を指す。経済学の基本原則では、合理的な意思決定は将来の限界的な費用と便益のみに基づくべきであり、回収不能な過去の費用は判断材料に含めるべきでない（過ぎたコストは無視する）。' +
      'これは損失回避の状況で「悪い投資にさらに資金を投じる（throwing good money after bad）」ことを防ぐ。にもかかわらず、既に投じた費用を惜しんで「ここでやめると今までの投資が無駄になる」と考え非合理に事業や行動を継続してしまう傾向が「サンクコストの誤謬（sunk cost fallacy）」である。心理学者アークス＆ブルーマー（Arkes & Blumer 1985）が実験で実証し、コンコルド効果（Concorde fallacy）とも呼ばれる。',
    keyFigures: '経済学の基本原則（将来の限界費用便益のみで判断）／Arkes & Blumer（1985, OBHDP 35(1):124-140）／別称: コンコルド効果',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/sunk-cost', type: 'reference', label: 'Encyclopaedia Britannica Money — Sunk cost' },
      { url: 'https://ideas.repec.org/a/eee/jobhdp/v35y1985i1p124-140.html', type: 'academic', label: 'Arkes & Blumer (1985) The Psychology of Sunk Cost, OBHDP 35(1):124-140（RePEc）' },
      { url: 'https://thedecisionlab.com/biases/the-sunk-cost-fallacy', type: 'reference', label: 'The Decision Lab — Sunk Cost Fallacy（コンコルド効果）' },
    ],
  },
  {
    id: 'human-dunning-kruger',
    discipline: 'human-science',
    title: 'ダニング＝クルーガー効果',
    statement:
      '能力の低い人ほど自分の能力を過大評価し、能力の高い人はむしろ過小評価する傾向があるとされる認知バイアス。ある領域で良い成績を出すために必要な能力は自分の成績を正しく評価するために必要な能力でもあるため、能力が欠如している人は同時に自分の不足を認識するメタ認知能力も欠き自己を過大評価してしまうと説明される。' +
      '心理学者デイヴィッド・ダニングとジャスティン・クルーガーが1999年の論文「Unskilled and Unaware of It」(Journal of Personality and Social Psychology 77(6):1121-1134)で報告し、下位四分位の成績者が自身の順位を大きく過大評価した結果を示した。ただし近年は、観察されたパターンの少なくとも一部は平均への回帰や自己相関といった統計的アーティファクトで説明できるとする批判・再検証がある。',
    keyFigures: 'デイヴィッド・ダニング & ジャスティン・クルーガー（1999, JPSP 77(6):1121-1134）／批判: Gignac & Zajenkowski（2020）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/Dunning-Kruger-effect', type: 'reference', label: 'Encyclopaedia Britannica — Dunning-Kruger effect' },
      { url: 'https://sites.lsa.umich.edu/sasi/wp-content/uploads/sites/275/2015/11/krugerdunning02.pdf', type: 'academic', label: 'Kruger & Dunning (1999) Unskilled and Unaware of It, JPSP 77(6):1121-1134（原典）' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S0160289620300271', type: 'academic', label: 'Gignac & Zajenkowski (2020) Intelligence — 統計的アーティファクト批判' },
    ],
  },
  {
    id: 'bizlaw-subcontract-act',
    discipline: 'business-law',
    title: '下請法（下請代金支払遅延等防止法）',
    statement:
      '親事業者による優越的地位の濫用から下請事業者を保護する独占禁止法の補完法（昭和31年法律第120号）。適用は「取引（委託）の内容」と「取引当事者の資本金区分」の2要件で決まり、対象取引は製造委託・修理委託・情報成果物作成委託・役務提供委託の4類型。' +
      '親事業者には4つの義務（発注書面〔3条書面〕の交付、支払期日を給付の受領後60日以内に定めること、取引書類の作成・保存、支払遅延時の遅延利息の支払）を課し、11の禁止行為（受領拒否、下請代金の支払遅延、減額、返品、買いたたき、購入・利用強制、報復措置、有償支給原材料等の対価の早期決済、割引困難な手形の交付、不当な経済上の利益の提供要請、不当な給付内容の変更・やり直し）を定める。公正取引委員会と中小企業庁が共同で運用する。なお2025年5月成立の改正法が2026年1月1日施行で規制対象拡大・名称変更（通称「取適法」）を予定する（本項は確認できた従来枠組みの範囲で記載）。',
    keyFigures: '下請代金支払遅延等防止法（昭和31年法律第120号）／公正取引委員会・中小企業庁（共同所管）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jftc.go.jp/shitauke/shitaukegaiyo/gaiyo.html', type: 'government', label: '公正取引委員会 — 下請法の概要' },
      { url: 'https://www.jftc.go.jp/shitauke/shitaukegaiyo/oyakinsi.html', type: 'government', label: '公正取引委員会 — 親事業者の禁止行為（11項目）' },
      { url: 'https://laws.e-gov.go.jp/document?lawid=331AC0000000120', type: 'government', label: 'e-Gov法令検索 — 下請代金支払遅延等防止法（法令ID 331AC0000000120）' },
    ],
  },
  {
    id: 'infosoc-gdpr-right-erasure',
    discipline: 'information-sociology',
    title: 'GDPRと忘れられる権利（消去権）',
    statement:
      'GDPR（EU一般データ保護規則, Regulation (EU) 2016/679）は2016年4月27日に採択され2018年5月25日に適用が開始されたEUの包括的個人データ保護法で、旧データ保護指令（95/46/EC）を置き換えた。' +
      'EU域外の事業者にも及ぶ域外適用と、重大な違反に対し最大で全世界年間売上高の4%または2000万ユーロのいずれか高い方という高額の制裁金が特徴である。「忘れられる権利」は第17条「消去権（right to erasure / right to be forgotten）」として明文化され、データ主体は一定の要件（収集目的に照らし不要となった、同意を撤回した等）の下で自己の個人データの消去を管理者に求めうる。この概念の源流はEU司法裁判所（CJEU）が2014年5月13日に下したGoogle Spain判決（C-131/12）にある。ただし表現・情報の自由、公益目的の保存、報道・学術・統計目的等との調整のため例外も定められている。',
    keyFigures: 'GDPR=Regulation (EU) 2016/679（2018/5/25適用）・第17条消去権／Google Spain判決（CJEU C-131/12, 2014/5/13）',
    asOf: '2026-06',
    sources: [
      { url: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng', type: 'government', label: 'Regulation (EU) 2016/679 — EUR-Lex（EU公式法令データベース原典）' },
      { url: 'https://gdpr-info.eu/art-17-gdpr/', type: 'reference', label: 'Art. 17 GDPR — Right to erasure (right to be forgotten)' },
      { url: 'https://globalfreedomofexpression.columbia.edu/cases/google-spain-sl-v-agencia-espanola-de-proteccion-de-datos-aepd/', type: 'academic', label: 'Columbia Global Freedom of Expression — Google Spain v. AEPD（C-131/12）' },
    ],
  },
  {
    id: 'mgmt-blue-ocean',
    discipline: 'management',
    title: 'ブルー・オーシャン戦略（Blue Ocean Strategy）',
    statement:
      '既存の競争が激しく価格・コストの消耗戦に陥った市場＝レッド・オーシャンを避け、競争のない未開拓の市場空間＝ブルー・オーシャンを創造して競争自体を無意味化する経営戦略論。' +
      '差別化と低コストを同時に追求する「価値革新（バリュー・イノベーション）」を核とし、業界の競争要因を可視化する戦略キャンバスや、競争要因を除去(Eliminate)・削減(Reduce)・増加(Raise)・創造(Create)の4アクションで再構成するERRCグリッドなどのツールを用いる。W・チャン・キムとレネ・モボルニュ（ともにINSEAD教授）が、1880〜2000年の30超の業界における150の戦略的打ち手の研究をもとに2005年の著書『Blue Ocean Strategy』で体系化した。シルク・ドゥ・ソレイユ等が代表的事例とされる。',
    keyFigures: 'W・チャン・キム & レネ・モボルニュ（2005『Blue Ocean Strategy』、INSEAD）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/blue-ocean-strategy-explained', type: 'reference', label: 'Encyclopaedia Britannica (Money) — Blue Ocean Strategy Explained' },
      { url: 'https://knowledge.insead.edu/series/blue-ocean-strategy', type: 'academic', label: 'INSEAD Knowledge — Blue Ocean Strategy series（著者所属校の一次情報）' },
      { url: 'https://www.emerald.com/insight/content/doi/10.1108/02756660510608521/full/html', type: 'academic', label: 'Kim & Mauborgne (2005) Value innovation: a leap into the blue ocean, J. of Business Strategy（Emerald 査読誌）' },
    ],
  },
  {
    id: 'econ-diminishing-marginal-utility',
    discipline: 'economics',
    title: '限界効用逓減の法則',
    statement:
      'ある財の消費量が増えるにつれ、追加1単位の消費から得られる満足（限界効用）が次第に小さくなるというミクロ経済学の法則。ゴッセンの第一法則とも呼ばれ、ドイツの経済学者ヘルマン・ハインリヒ・ゴッセンが1854年の著作で定式化した。' +
      '1870年代の「限界革命」でジェヴォンズ（英）・メンガー（墺）・ワルラス（スイス）が独立に再発見・発展させ近代の限界効用価値説を確立した。この法則は、価格が下がると需要が増える＝需要曲線が右下がりになることや、生命に不可欠な水が安く装飾品のダイヤモンドが高いという「価値の逆説（水とダイヤモンドのパラドックス）」を限界効用の差として説明する基礎となる。さらに各財の限界効用を価格で割った値がすべての財で等しくなる点で総効用が最大化されるという消費者均衡（ゴッセンの第二法則・限界効用均等の法則）の土台でもある。',
    keyFigures: 'H.H.ゴッセン（1854、第一法則）／限界革命: ジェヴォンズ(1871)・メンガー(1871)・ワルラス(1874)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/marginal-utility', type: 'reference', label: 'Encyclopaedia Britannica (Money) — Marginal utility' },
      { url: 'https://www.britannica.com/topic/diamond-water-paradox', type: 'reference', label: 'Encyclopaedia Britannica — Diamond-water paradox（価値の逆説の限界効用による解決）' },
      { url: 'https://en.wikipedia.org/wiki/Gossen%27s_laws', type: 'reference', label: 'Wikipedia — Gossen’s laws（第一法則=限界効用逓減・第二法則=均等）' },
    ],
  },
  {
    id: 'mgmt-pdca-cycle',
    discipline: 'management',
    title: 'PDCAサイクル',
    statement:
      '計画(Plan)→実行(Do)→評価・点検(Check)→改善(Act)の4段階を繰り返し、業務やプロセス・製品を継続的に改善する反復的なマネジメント手法。品質管理(QC)、継続的改善(カイゼン)、ISO 9001等のマネジメントシステムで広く用いられる。' +
      '源流は1920〜30年代にベル研究所の物理学者ウォルター・シューハートが示した統計的品質管理の科学的サイクルにあり、W・エドワーズ・デミングがこれを改変し1950年代に戦後日本へ普及させた（「デミングサイクル」）。日本では日本科学技術連盟(JUSE)を通じて「PDCA」「デミングサイクル」として定着した。なおデミング自身は"Check"より"Study"が原意に近いとして、後年はPDCAではなくPDSA(Plan-Do-Study-Act)を一貫して推奨した点に注意を要する（PDCAとPDSAの区別）。',
    keyFigures: 'ウォルター・A・シューハート（源流・統計的品質管理）／W・エドワーズ・デミング（改変・日本普及、後年はPDSAを推奨）',
    asOf: '2026-06',
    sources: [
      { url: 'https://asq.org/quality-resources/pdca-cycle', type: 'reference', label: 'ASQ（米国品質協会）— PDCA Cycle（4段階の定義・継続的改善）' },
      { url: 'https://deming.org/explore/pdsa/', type: 'reference', label: 'The W. Edwards Deming Institute — PDSA Cycle（CheckよりStudy・源流はシューハート）' },
      { url: 'https://en.wikipedia.org/wiki/PDCA', type: 'reference', label: 'Wikipedia — PDCA（シューハート→デミング→JUSEの沿革と別名）' },
    ],
  },
  {
    id: 'human-bystander-effect',
    discipline: 'human-science',
    title: '傍観者効果（bystander effect, 責任の分散）',
    statement:
      '緊急事態において、その場に居合わせた人（傍観者）が多いほど各個人が援助行動を起こしにくくなる現象。主な機序として、責任の分散（自分以外の誰かが助けるだろうと考える）、多元的無知（他者が動かないのを見て緊急ではないと判断する）、評価懸念（誤った対応で否定的に評価される恐れ）が挙げられる。' +
      '1964年のキティ・ジェノヴィーズ事件を契機に、社会心理学者ジョン・ダーリーとビブ・ラタネが1968年以降の一連の実験で実証した。被験者が自分だけが緊急事態を認知していると思った場合の援助率は高く、他の傍観者が存在すると思った場合には大きく低下した。なお「38人の目撃者が誰も通報しなかった」という当時のニューヨーク・タイムズ報道に基づく通説は、後の検証（2007年の学術論文等）で人数や状況が誇張・不正確であったと指摘されている。',
    keyFigures: 'ジョン・ダーリー & ビブ・ラタネ（1968, JPSP 8(4):377-383）／契機: キティ・ジェノヴィーズ事件1964',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/bystander-effect', type: 'reference', label: 'Encyclopaedia Britannica — Bystander effect' },
      { url: 'https://psycnet.apa.org/record/1968-08862-001', type: 'academic', label: 'Darley & Latané (1968) Bystander intervention in emergencies, JPSP 8(4):377-383（原典）' },
      { url: 'https://www.bps.org.uk/research-digest/truth-behind-story-kitty-genovese-and-bystander-effect', type: 'reference', label: 'British Psychological Society — ジェノヴィーズ通説の検証' },
    ],
  },
  {
    id: 'bizlaw-appi',
    discipline: 'business-law',
    title: '個人情報保護法（個人情報の保護に関する法律）',
    statement:
      '個人情報の適正な取扱いを定め個人の権利利益を保護することを目的とする日本の法律（平成15年法律第57号、2003年成立・公布、2005年に民間部門の義務規定が全面施行）。我が国の個人情報保護制度の基本法かつ一般法として機能する。' +
      '個人情報取扱事業者に対し、利用目的の特定・通知公表、目的外利用の制限、安全管理措置、第三者提供の制限（原則本人同意が必要）、本人からの開示・訂正・利用停止等の請求への対応などを義務付ける。要配慮個人情報や匿名加工情報といった類型を設ける。2015年改正でいわゆる3年ごと見直し規定を導入し個人情報保護委員会（PPC）を設置、2020年改正、2021年改正で官民・地方の規制を一本化しPPCが一元的に監督する体制とした。EUはGDPR第45条に基づき日本の十分性認定を行っている。違反には勧告・命令・罰則が定められている。',
    keyFigures: '個人情報の保護に関する法律（平成15年法律第57号）／個人情報保護委員会（PPC）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ppc.go.jp/personalinfo/legal/', type: 'government', label: '個人情報保護委員会（PPC）— 法令・ガイドライン等' },
      { url: 'https://www.ppc.go.jp/personalinfo/minaoshi/', type: 'government', label: '個人情報保護委員会（PPC）— 令和3年改正個人情報保護法について' },
      { url: 'https://hourei.ndl.go.jp/simple/detail?lawId=0000095240&current=-1', type: 'government', label: '日本法令索引（国立国会図書館）— 個人情報の保護に関する法律 平成15年法律第57号' },
    ],
  },
  {
    id: 'infosoc-third-person-effect',
    discipline: 'information-sociology',
    title: '第三者効果（third-person effect）',
    statement:
      '人はマスメディアのメッセージ、とりわけ説得的・好ましくないとされる内容の影響について、自分自身よりも「他人（第三者）」のほうが大きく受けると認知する傾向。' +
      '社会学者W・フィリップス・デイヴィソンが1983年の論文「The Third-Person Effect in Communication」（Public Opinion Quarterly 47(1):1-15）で提唱した。理論は二要素からなる。すなわち影響を自分より他人で過大評価する「知覚的要素」と、その過大評価がメディア規制・検閲・有害コンテンツ抑制策への支持といった行動につながりうるとする「行動仮説」である。プロパガンダ・暴力的/性的表現・広告・世論調査報道などの文脈で多数の実証研究が蓄積された。自分への負の影響を過小評価する点で楽観バイアスとも関連づけられる。',
    keyFigures: 'W・フィリップス・デイヴィソン（1983, Public Opinion Quarterly 47(1):1-15）',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/poq/article-abstract/47/1/1/1906961', type: 'academic', label: 'Davison (1983) The Third-Person Effect in Communication, POQ 47(1):1-15（原典・査読論文）' },
      { url: 'https://en.wikipedia.org/wiki/Third-person_effect', type: 'reference', label: 'Wikipedia — Third-person effect（知覚的要素・行動仮説）' },
      { url: 'https://www.jou.ufl.edu/insights/third-person-effect/', type: 'academic', label: 'University of Florida, College of Journalism — 第三者効果と検閲支持の解説' },
    ],
  },
  {
    id: 'mgmt-crossing-the-chasm',
    discipline: 'management',
    title: 'キャズム理論（Crossing the Chasm）',
    statement:
      'ハイテク製品の市場普及において、初期市場（イノベーター＋アーリーアダプター＝技術愛好者・ビジョナリー）と主流市場（アーリーマジョリティ以降＝実利主義者）の間に存在する深い断絶を「キャズム（溝）」と呼ぶ理論。' +
      'E・ロジャーズの採用者5分類を前提としつつ、ジェフリー・A・ムーアが1991年の著書『Crossing the Chasm』で、多くの破壊的ハイテク製品はアーリーアダプターには受容されてもアーリーマジョリティへ移行できずに失敗すると指摘した。両者は購買動機が根本的に異なり、ビジョナリーは先進性・優位性のためにリスクを許容するが、実利主義者は実用性・実績・安心（リファレンス）を重視しリスクを回避する。ムーアは、勝てる規模の特定ニッチ市場（ビーチヘッド）に資源を集中し、完成された「ホール・プロダクト」と顧客リファレンスを足がかりに溝を突破する戦略を処方箋として示した（ロジャーズの普及理論とは別概念）。',
    keyFigures: 'ジェフリー・A・ムーア（1991『Crossing the Chasm』）／前提: E.ロジャーズの採用者5分類',
    asOf: '2026-06',
    sources: [
      { url: 'https://geoffreyamoore.com/book/crossing-the-chasm/', type: 'reference', label: 'Geoffrey A. Moore 公式サイト — Crossing the Chasm（ビーチヘッド戦略・一次情報）' },
      { url: 'https://en.wikipedia.org/wiki/Crossing_the_Chasm', type: 'reference', label: 'Wikipedia — Crossing the Chasm（1991年刊・ビジョナリーと実利主義者の断絶）' },
      { url: 'https://www.researchgate.net/publication/235250288_Can_You_See_the_Chasm_Innovation_Diffusion_According_to_Rogers_Bass_and_Moore', type: 'academic', label: 'Can You See the Chasm? — Rogers/Bass/Mooreの普及理論比較（学術文献）' },
    ],
  },
  {
    id: 'econ-fallacy-of-composition',
    discipline: 'economics',
    title: '合成の誤謬（fallacy of composition）',
    statement:
      '部分（個人・個別主体）にとって真または合理的なことが、全体（社会・経済全体）にもそのまま当てはまると誤って推論する誤り。論理学的には、ある性質が部分（構成要素）について真であることから全体についても真であると不当に帰属させる非形式的誤謬であり、逆方向の「分割の誤謬」と対をなす。' +
      '経済学では、個々人が貯蓄を増やすのは合理的でも全員が同時に貯蓄を増やすと総需要（消費）が減少し、所得・産出が落ち込んで結果的に総貯蓄が却って減少しうる「倹約のパラドックス（貯蓄のパラドックス）」が代表例である。これはケインズ経済学が示すミクロとマクロの非連続性の典型で、個人の節約・賃下げ・輸出増といったミクロで合理的な行動が合成されると、かえって不況を深めうることを表す。',
    keyFigures: '論理学の誤謬類型（分割の誤謬と対）／経済学ではケインズが普及させた倹約のパラドックスで顕著',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/fallacy-of-composition', type: 'reference', label: 'Encyclopaedia Britannica — fallacy of composition（論理学的定義）' },
      { url: 'https://en.wikipedia.org/wiki/Fallacy_of_composition', type: 'reference', label: 'Wikipedia — Fallacy of composition' },
      { url: 'https://en.wikipedia.org/wiki/Paradox_of_thrift', type: 'reference', label: 'Wikipedia — Paradox of thrift（合成の誤謬の経済学的代表例）' },
    ],
  },
  {
    id: 'econ-says-law',
    discipline: 'economics',
    title: 'セイの法則（販路法則）',
    statement:
      '「供給はそれ自身の需要を創造する（supply creates its own demand）」と要約される古典派経済学の命題。財の生産・供給はそれと同額の所得（賃金・利潤等）を生み出し、その所得が他の財への需要となって支出されるため、経済全体では一般的な過剰生産（全般的供給過剰）は持続的には生じないとする考え方。' +
      'フランスの経済学者ジャン＝バティスト・セイが主著『経済学概論』(1803)で示した「販路の法則」に由来し、リカードら英国古典派が支持した。ジョン・メイナード・ケインズは『一般理論』(1936)でこれを批判し、有効需要の不足により非自発的失業を伴う過少雇用・過少生産の均衡が持続しうる＝需要が供給（雇用量）を決める側面があるとしてセイの法則を否定した。なお「supply creates its own demand」という定式自体はセイの原典の文言ではなく後年の要約表現である点に注意。',
    keyFigures: 'ジャン＝バティスト・セイ（1803『経済学概論』）／批判: J.M.ケインズ（1936『一般理論』）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/J-B-Say', type: 'reference', label: 'Encyclopædia Britannica — J.-B. Say: Law of Markets' },
      { url: 'https://en.wikipedia.org/wiki/Say%27s_law', type: 'reference', label: "Wikipedia — Say's law（ケインズ批判・定式の来歴）" },
      { url: 'https://classiques.uqam.ca/classiques/say_jean_baptiste/traite_eco_pol/traite_eco_pol.html', type: 'academic', label: 'UQAM — Say, Traité d’économie politique (1803) 原典（大学アーカイブ）' },
    ],
  },
  {
    id: 'mgmt-mckinsey-7s',
    discipline: 'management',
    title: 'マッキンゼーの7Sフレームワーク',
    statement:
      '組織の有効性を、相互依存する7つの要素の整合性（アラインメント）から分析する経営フレームワーク。7要素は「ハードのS」＝Strategy(戦略)・Structure(組織構造)・Systems(システム/制度)と、「ソフトのS」＝Shared Values(共通の価値観、図の中心)・Skills(スキル/組織能力)・Style(経営スタイル/文化)・Staff(人材)に分けられる。' +
      '中核的主張は、効果的な組織変革には全7要素の整合が不可欠であり、戦略・構造・制度といったハード要素だけを変えても価値観・文化・人材といったソフト要素が伴わなければ機能しない、という点にある。1980年前後にマッキンゼーのトム・ピーターズとロバート・ウォーターマンらが開発し、論文「Structure Is Not Organization」(Business Horizons, 1980)で初出、ピーターズ＆ウォーターマン『エクセレント・カンパニー(In Search of Excellence)』(1982)等で広く普及した。',
    keyFigures: 'トム・ピーターズ & ロバート・H・ウォーターマン（マッキンゼー、1980年前後／共著者J.フィリップス）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/McKinsey_7S_Framework', type: 'reference', label: 'Wikipedia — McKinsey 7S Framework' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/mckinsey-7s-framework', type: 'academic', label: 'EBSCO Research Starters — McKinsey 7S Framework' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/0007681380900270', type: 'academic', label: 'Waterman, Peters & Phillips (1980) Structure Is Not Organization, Business Horizons 23(3):14-26（原典）' },
    ],
  },
  {
    id: 'human-asch-conformity',
    discipline: 'human-science',
    title: 'アッシュの同調実験（同調圧力）',
    statement:
      '集団の多数派が明らかに誤った判断を示すとき、個人がその誤りに同調してしまう傾向を示した社会心理学の実験。ソロモン・アッシュが1950年代（1951年〜）に行った線分の長さ比較課題で、被験者は基準線と一致する長さの線を3本の中から選ぶよう求められた。集団は7〜9人で1人を除く全員がサクラ（共謀者）であり、全18試行中12試行で一斉に誤答した。' +
      '正答が明白な課題であったにもかかわらず、被験者は誤答が示された全試行の約3分の1（約32%）で多数派に同調して誤答し、被験者の約75%が少なくとも一度は同調した（統制条件での誤答率は1%未満）。同調率は多数派の人数や全員一致が崩れるか否か（反対するサクラが1人いるだけで大幅に低下）によって変化した。機序として、集団から外れたくないという規範的影響と、他者を情報源とみなす情報的影響が挙げられる。',
    keyFigures: 'ソロモン・アッシュ（Solomon Asch、1951年／1950年代に実験を実施）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Solomon-Asch', type: 'reference', label: 'Encyclopaedia Britannica — Solomon Asch' },
      { url: 'https://www.britannica.com/topic/conformity', type: 'reference', label: 'Encyclopaedia Britannica — Conformity（同調と実験設計）' },
      { url: 'https://www.ebsco.com/research-starters/history/asch-conformity-experiments', type: 'academic', label: 'EBSCO Research Starters — Asch conformity experiments' },
    ],
  },
  {
    id: 'bizlaw-whistleblower-protection',
    discipline: 'business-law',
    title: '公益通報者保護法',
    statement:
      '労働者等が、その役務提供先である事業者の法令違反など公益にかかわる事実を通報したことを理由とする解雇その他の不利益な取扱いを禁止し、公益通報者を保護する日本の法律。保護される通報先を内部・行政機関・報道機関等に整理し、事業者の法令遵守を促すことを目的とする。' +
      '2004年（平成16年）6月18日に公布、2006年（平成18年）4月1日に施行された（平成16年法律第122号）。消費者庁が所管する。2020年（令和2年）の改正（令和2年法律第51号、2022年6月1日施行）により、常時使用する労働者が301人以上の事業者に内部公益通報対応体制の整備（窓口設置等）が義務付けられた。あわせて公益通報対応業務従事者の指定義務と守秘義務（違反に刑事罰）が設けられ、行政機関・報道機関等への外部通報の保護要件が緩和され、保護される通報者の範囲が退職者（退職後1年以内）や役員にも拡大された。',
    keyFigures: '公益通報者保護法（平成16年法律第122号）／消費者庁所管／2020年改正（令2法51号・2022/6/1施行・301人以上に体制整備義務）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_partnerships/whisleblower_protection_system/overview', type: 'government', label: '消費者庁 — 公益通報者保護法と制度の概要' },
      { url: 'https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/housei/15920040618122.htm', type: 'government', label: '衆議院 — 公益通報者保護法（平成16年6月18日法律第122号）' },
      { url: 'https://hourei.ndl.go.jp/simple/detail?lawId=0000098401&current=-1', type: 'government', label: '国立国会図書館 日本法令索引 — 公益通報者保護法' },
    ],
  },
  {
    id: 'infosoc-agenda-setting',
    discipline: 'information-sociology',
    title: '議題設定理論（アジェンダ・セッティング）',
    statement:
      'マスメディアは人々に「何を考えるか（what to think）」を直接決めることはできないが、「何について考えるか（what to think about）」――すなわち何が重要な争点かという認識（議題＝アジェンダ）を方向づける力を持つ、とする理論。メディアが特定の争点を繰り返し強調するほど、その争点を重要だと受け手が認知する（顕著性の転移）。' +
      'マックスウェル・マコームズとドナルド・ショーが、1968年の米大統領選におけるノースカロライナ州チャペルヒルの有権者調査とメディアの報道分析を通じて、有権者が重視する争点とメディアが強調する争点との強い相関を実証し、1972年の論文「The Agenda-Setting Function of Mass Media」(Public Opinion Quarterly 36:176-187)で提示した。後に、争点の属性（特徴づけ）の顕著性の転移を扱う第二レベル（属性アジェンダ設定）やフレーミング論へと発展した。なお「what to think about」の元表現はバーナード・コーエン(1963)に由来する。',
    keyFigures: 'マックスウェル・マコームズ & ドナルド・ショー（1972, POQ, チャペルヒル研究）／淵源: B.コーエン(1963)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.scirp.org/reference/referencespapers?referenceid=2376233', type: 'academic', label: 'McCombs & Shaw (1972) The Agenda-Setting Function of Mass Media, POQ 36:176-187（書誌）' },
      { url: 'https://www.ebsco.com/research-starters/communication-and-mass-media/agenda-setting-theory', type: 'academic', label: 'EBSCO Research Starters — Agenda-setting theory' },
      { url: 'https://link.springer.com/article/10.1007/s44382-025-00016-x', type: 'academic', label: 'Springer Nature, Communication and Change (2025) — agenda-setting研究の系譜 1972-2025' },
    ],
  },
  {
    id: 'econ-natural-monopoly',
    discipline: 'economics',
    title: '自然独占（natural monopoly）',
    statement:
      '巨大な固定費（インフラ設備など）と規模の経済により、市場全体の需要を1社が供給する方が複数社で分割供給するよりも平均費用が低くなり、結果として1社による独占が自然に成立する市場構造。生産量が増えるほど平均費用が逓減する「費用逓減産業」で生じ、後発の新規参入は費用面で不利となるため困難である。' +
      '電気・ガス・水道・鉄道・固定通信網などネットワーク型インフラが典型例である。1社独占は価格のつり上げや過少供給といった弊害を招きうるため、料金規制（公正報酬率規制など）や公益事業規制、公的所有といった政策がとられてきた。近年は、独占性の強い設備（ボトルネック）部分と競争導入が可能なサービス部分とを分離するアンバンドリング（構造分離・第三者アクセス）も用いられる。',
    keyFigures: '産業組織論・規制経済学の中心概念／J.S.ミル『経済学原理』(1848)が初期に議論／基礎: 規模の経済・費用逓減産業',
    asOf: '2026-06',
    sources: [
      { url: 'https://courses.lumenlearning.com/wm-microeconomics/chapter/reading-regulating-natural-monopolies/', type: 'academic', label: 'Lumen Learning, Microeconomics — Regulating Natural Monopolies（大学教材）' },
      { url: 'https://opentextbc.ca/principlesofeconomics/chapter/11-3-regulating-natural-monopolies/', type: 'academic', label: 'OpenStax/BCcampus, Principles of Economics 11.3 — Regulating Natural Monopolies' },
      { url: 'https://en.wikipedia.org/wiki/Natural_monopoly', type: 'reference', label: 'Wikipedia — Natural monopoly（固定費優位・規模の経済）' },
    ],
  },
  {
    id: 'econ-laffer-curve',
    discipline: 'economics',
    title: 'ラッファー曲線（Laffer curve）',
    statement:
      '税率と税収の関係を示す曲線。税率0%では税収はゼロであり、税率100%でも労働・生産・投資のインセンティブが消失して課税対象が縮小するため税収はゼロに近づく。したがってその間に税収を最大化する税率が存在し、曲線は逆U字型（山型）になるという考え方である。' +
      '税率がこの最適点を超えて高い領域では、減税がかえって税収を増やしうると主張され、1980年代の供給側経済学（レーガノミクス）の理論的根拠の一つとなった。米国の経済学者アーサー・ラッファーにちなんで名付けられたが、ラッファー自身はこの着想の起源を14世紀のイブン・ハルドゥーンやJ.M.ケインズらに帰しており自らの発明ではないとしている。ただし税収最大化税率の具体的水準は学説により大きく異なり（推計は概ね30%台〜70%程度に分散）、現実の多くの先進国の税率が実際にその点を超えているかについては実証的な異論が多い。',
    keyFigures: 'アーサー・ラッファー（1970年代に普及）／供給側経済学／着想の先駆: イブン・ハルドゥーン（14世紀）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Laffer-curve', type: 'reference', label: 'Encyclopaedia Britannica — Laffer curve' },
      { url: 'https://en.wikipedia.org/wiki/Laffer_curve', type: 'reference', label: 'Wikipedia — Laffer curve（起源・批判・実証推計）' },
      { url: 'https://link.springer.com/referenceworkentry/10.1057/978-1-349-95121-5_2088-1', type: 'academic', label: 'The New Palgrave Dictionary of Economics (Springer) — Laffer curve' },
    ],
  },
  {
    id: 'mgmt-learning-organization',
    discipline: 'management',
    title: '学習する組織（learning organization）',
    statement:
      '組織自体が継続的に学習し、環境変化に適応しながら自己変革していく能力を備えた組織像。MITスローン経営大学院のピーター・センゲが1990年の著書『The Fifth Discipline: The Art and Practice of the Learning Organization』（邦題『最強組織の法則』／改訳『学習する組織』）で提示した。' +
      'センゲは学習する組織の実現に必要な5つのディシプリン（修練）として、(1)自己マスタリー、(2)メンタルモデル、(3)共有ビジョン、(4)チーム学習、(5)システム思考を挙げた。第5の「システム思考」が中核（cornerstone）であり、これが他の4つを統合する。問題を要素還元的にではなく、相互関係から成る全体構造として捉えることを重視する。組織学習論の代表的理論で、アージリス＆ショーンのシングルループ／ダブルループ学習とも関連する。',
    keyFigures: 'ピーター・M・センゲ（1990『The Fifth Discipline』、MIT）／関連: アージリス&ショーン（ダブルループ学習）',
    asOf: '2026-06',
    sources: [
      { url: 'https://mitsloan.mit.edu/faculty/directory/peter-m-senge', type: 'academic', label: 'MIT Sloan School of Management — Peter M. Senge 教員ページ（一次）' },
      { url: 'https://systemdynamics.org/product/the-fifth-discipline/', type: 'academic', label: 'System Dynamics Society — The Fifth Discipline 書誌' },
      { url: 'https://en.wikipedia.org/wiki/The_Fifth_Discipline', type: 'reference', label: 'Wikipedia — The Fifth Discipline（5つのディシプリン）' },
    ],
  },
  {
    id: 'human-groupthink',
    discipline: 'human-science',
    title: '集団思考（グループシンク, groupthink）',
    statement:
      '結束の強い集団において、メンバーの合意・調和への希求が現実的な代替案の批判的検討を上回り、不合理または危険な意思決定に至る心理現象。社会心理学者アーヴィング・ジャニスが1972年の著書『Victims of Groupthink』（1982年に『Groupthink』として改訂）で提唱し、真珠湾攻撃の予見失敗、ピッグス湾事件、ベトナム戦争のエスカレーション等の政策的失敗を分析した。' +
      'ジャニスは8つの症状を挙げ、無謬性の幻想、集団の決定の集団的合理化、集団の道徳性への無批判な信奉、相手集団のステレオタイプ化、自己検閲、満場一致の幻想、反対者への同調圧力、マインドガード（不都合な情報の遮断）を含むとした。予防策として悪魔の代弁者の設置や外部意見の導入が提案される。後にチャレンジャー号事故等でも援用されたが、実証研究の支持は限定的・混在的との批判もある。',
    keyFigures: 'アーヴィング・ジャニス（Irving L. Janis, 1972提唱／1982改訂）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/groupthink', type: 'reference', label: 'Encyclopaedia Britannica — Groupthink' },
      { url: 'https://www.britannica.com/topic/Victims-of-Groupthink-A-Psychological-Study-of-Foreign-Policy-Decisions-and-Fiascoes', type: 'reference', label: 'Encyclopaedia Britannica — Victims of Groupthink（原著解説）' },
      { url: 'https://med.stanford.edu/content/dam/sm/pedsendo-1/documents/Groupthink_by_Iriving_L_Janis_Summary_pd.pdf', type: 'academic', label: 'Stanford Medicine — Groupthink 原著要約（1982年版定義）' },
    ],
  },
  {
    id: 'bizlaw-cooling-off',
    discipline: 'business-law',
    title: 'クーリング・オフ（特定商取引法）',
    statement:
      '訪問販売や電話勧誘販売など不意打ち的でトラブルの多い取引類型について、契約後一定期間内であれば消費者が理由を問わず無条件で契約の申込みの撤回・解除をできる制度で、特定商取引法等が定める。' +
      '期間は取引類型で異なり、訪問販売・電話勧誘販売・特定継続的役務提供・訪問購入は法定書面（申込書面または契約書面）の交付日を1日目として8日間、連鎖販売取引（マルチ商法）・業務提供誘引販売取引は20日間である。通信販売には法律上のクーリング・オフ制度はなく、返品の可否は事業者の返品特約（広告に特約がなければ商品受取日から8日間返品可・送料は消費者負担）による。店舗での自発的な購入も原則対象外。2022年6月1日からは書面に加え電子メール等の電磁的記録による通知も可能になった。消費者庁・国民生活センターが制度の普及啓発を担う。',
    keyFigures: '特定商取引法のクーリング・オフ（書面交付日起算8日間／20日間）／消費者庁・国民生活センター',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/', type: 'government', label: '消費者庁 特定商取引法ガイド — 特定商取引法とは（類型別クーリング・オフ期間）' },
      { url: 'https://www.kokusen.go.jp/soudan_now/data/coolingoff.html', type: 'government', label: '国民生活センター — クーリング・オフ（テーマ別特集）' },
      { url: 'https://www.no-trouble.caa.go.jp/qa/coolingoff.html', type: 'government', label: '消費者庁 — 電磁的記録によるクーリング・オフに関するQ&A（2022年6月施行）' },
    ],
  },
  {
    id: 'infosoc-spiral-of-silence',
    discipline: 'information-sociology',
    title: '沈黙の螺旋（spiral of silence）',
    statement:
      '人は自分の意見が社会の少数派だと感じると、孤立を恐れて意見表明を控え沈黙する傾向があり、その結果、多数派とされる意見はますます大きく聞こえ、少数派意見はますます沈黙へ追い込まれる、という螺旋的な世論形成過程。' +
      '前提として、人々が周囲の意見分布を察知する「準統計的感覚（quasi-statistical sense）」を持つこと、および社会的孤立への恐怖が普遍的に働くことが置かれる。マスメディアは何が多数意見かについての認知を強く方向づけるため、この螺旋過程を加速しうる。ドイツの世論・コミュニケーション研究者エリザベート・ノエル＝ノイマンが1974年の論文「The Spiral of Silence: A Theory of Public Opinion」（Journal of Communication）で提唱し、1980年のドイツ語の著書（英訳1984年『The Spiral of Silence: Public Opinion—Our Social Skin』）で体系化した。',
    keyFigures: 'エリザベート・ノエル＝ノイマン（1974論文 Journal of Communication／1980著書）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/spiral-of-silence', type: 'reference', label: 'Encyclopaedia Britannica — Spiral of silence' },
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1460-2466.1974.tb00367.x', type: 'academic', label: 'Noelle-Neumann (1974) The Spiral of Silence, Journal of Communication（原典・査読誌）' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/spiral-silence', type: 'academic', label: 'EBSCO Research Starters — Spiral of silence' },
    ],
  },
  {
    id: 'econ-nudge-theory',
    discipline: 'economics',
    title: 'ナッジ理論（nudge theory）',
    statement:
      '選択の自由を保持しつつ、選択肢の提示方法（選択アーキテクチャ）を工夫することで、人々の行動を予測可能な形でより良い方向へ後押しする手法。禁止や経済的インセンティブの大きな変更によらず、デフォルト設定の変更や情報提示の工夫等で行動変容を促す。' +
      'リチャード・セイラーとキャス・サンスティーンが2008年の著書『Nudge』で提唱し、「リバタリアン・パターナリズム」を掲げた。臓器提供のオプトアウト方式や年金への自動加入などが代表例。セイラーは行動経済学への貢献により2017年にノーベル経済学賞を受賞した。英国のBehavioural Insights Team（BIT、通称ナッジ・ユニット、2010年設立）をはじめ各国政府に応用組織が設けられた。批判として効果の持続性や操作性・倫理をめぐる議論がある。',
    keyFigures: 'リチャード・セイラー & キャス・サンスティーン（2008『Nudge』）／セイラー2017ノーベル経済学賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Richard-Thaler', type: 'reference', label: 'Encyclopaedia Britannica — Richard Thaler（Nudge・libertarian paternalism）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2017/thaler/facts/', type: 'government', label: 'NobelPrize.org — Richard H. Thaler 2017（行動経済学への貢献）' },
      { url: 'https://www.instituteforgovernment.org.uk/article/explainer/nudge-unit', type: 'reference', label: 'Institute for Government — Nudge Unit（BIT 2010設立・応用例）' },
    ],
  },
  {
    id: 'econ-automatic-stabilizers',
    discipline: 'economics',
    title: '自動安定化装置（ビルトイン・スタビライザー）',
    statement:
      '政府が裁量的な政策判断や新たな立法を行わなくても、財政制度にあらかじめ組み込まれた仕組みが景気変動を自動的に緩和する機能。' +
      '代表例は累進所得税（好況時に所得増加に伴い税負担が自動的に増えて総需要を抑制し、不況時には税負担が減って可処分所得を下支えする）と、失業保険・生活保護等の社会保障給付（不況時に受給者増で給付が自動的に増え家計の可処分所得を支える）。裁量的財政政策と異なり、認知・立法・実施に伴う政策ラグがなく即時に働く点が長所で、総需要の振れを小さくして景気を安定化させる（反景気循環的に作用）。一方で完全な景気安定化はできず、不況期には財政赤字の自動的な拡大を伴う。ケインズ経済学における財政の景気安定化機能の議論の中で重視される。',
    keyFigures: 'ケインズ的財政政策論（財政の景気安定化機能）／累進所得税・失業保険・社会保障給付等の制度',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/fiscal-policy', type: 'reference', label: 'Encyclopaedia Britannica (Money) — Fiscal Policy（automatic stabilizers）' },
      { url: 'https://www.imf.org/external/pubs/ft/spn/2009/spn0923.pdf', type: 'government', label: 'IMF Staff Position Note — Automatic Fiscal Stabilizers (2009)' },
      { url: 'https://www.brookings.edu/articles/what-are-automatic-stabilizers/', type: 'academic', label: 'Brookings Institution — What are automatic stabilizers?' },
    ],
  },
  {
    id: 'mgmt-ambidexterity',
    discipline: 'management',
    title: '両利きの経営（organizational ambidexterity, 知の探索と深化）',
    statement:
      '企業が既存事業の改善・効率化＝「知の深化（exploitation）」と、新規領域の開拓・実験＝「知の探索（exploration）」を高い次元で両立させる経営。' +
      'ジェームズ・G・マーチが1991年の論文「Exploration and Exploitation in Organizational Learning」(Organization Science)で両者のトレードオフと両立の重要性を提示し、適応プロセスが探索より深化を速く洗練させるため組織は短期的に有効でも長期的に自己破壊的になりやすいと論じた。深化に偏り探索を怠ると、成功体験ゆえに既存能力に固執する「コンピテンシー・トラップ／サクセス・トラップ」に陥り環境変化への適応力を失う。チャールズ・A・オライリーとマイケル・L・タッシュマンがこれを探索と深化を同時追求する組織能力＝両利き性として体系化し、専門部門を分離する「構造的両利き」と同一部門内で両立を図る「文脈的両利き」を整理した。日本では入山章栄が「知の探索／知の深化」として紹介している。',
    keyFigures: 'J.G.マーチ（1991, exploration/exploitation）／オライリー&タッシュマン（両利き組織の体系化）／入山章栄（日本での紹介）',
    asOf: '2026-06',
    sources: [
      { url: 'https://pubsonline.informs.org/doi/10.1287/orsc.2.1.71', type: 'academic', label: 'March (1991) Exploration and Exploitation in Organizational Learning, Organization Science 2(1):71-87（原典）' },
      { url: 'https://en.wikipedia.org/wiki/Success_trap', type: 'reference', label: 'Wikipedia — Success trap（深化偏重によるコンピテンシー・トラップ）' },
      { url: 'https://dhbr.diamond.jp/articles/-/10194', type: 'media', label: '入山章栄 — 知の探索・知の深化と両利きの経営（DIAMONDハーバード・ビジネス・レビュー）' },
    ],
  },
  {
    id: 'human-learned-helplessness',
    discipline: 'human-science',
    title: '学習性無力感（learned helplessness）',
    statement:
      '回避・制御不可能な不快刺激（電気ショック等）に繰り返しさらされた結果、「何をしても状況は変わらない」と学習し、後に回避可能な状況に置かれても逃避・回避行動を起こさなくなる現象。' +
      'マーティン・セリグマンとスティーブン・マイヤーが1967年から犬を用いた実験で見出した（逃れられないショックを受けた群は、その後に障壁を越えれば逃げられるシャトル箱でも多くが逃げようとしなかった）。人間のうつ病・無気力、教育・職場・虐待状況の理解に応用され、原因帰属（悲観的説明スタイル）の理論へ発展した。なお2016年にマイヤー＆セリグマンは神経科学的知見から当初理論を修正し、「受動性（無力感）はむしろ生得的な初期設定の反応であり、学習されるのはむしろ制御可能性（コントロールできるという認識）の方である」とした。',
    keyFigures: 'マーティン・セリグマン & スティーブン・マイヤー（1967〜／2016年に Psychological Review で理論修正）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/learned-helplessness', type: 'reference', label: 'Encyclopaedia Britannica — Learned helplessness' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4920136/', type: 'academic', label: 'Maier & Seligman (2016) Learned Helplessness at Fifty, Psychological Review 123(4):349-367（査読・PMC全文）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/27337390/', type: 'academic', label: 'PubMed — Maier & Seligman (2016) 書誌（DOI:10.1037/rev0000033）' },
    ],
  },
  {
    id: 'bizlaw-abuse-superior-position',
    discipline: 'business-law',
    title: '優越的地位の濫用（独占禁止法）',
    statement:
      '自己の取引上の地位が相手方に優越している事業者が、取引の相手方に対しその地位を利用して、正常な商慣習に照らし不当に不利益を与える行為。独占禁止法が禁止する「不公正な取引方法」の一類型で、同法第2条第9項第5号に行為類型が定義され、第19条で禁止される。' +
      '具体例として、取引に係る商品・役務以外の購入強制（押し付け販売）、協賛金・従業員派遣その他の経済上の利益の提供要請、受領拒否、返品、支払遅延、対価の減額、その他相手方に不利益となる取引条件の設定・変更などが挙げられる。大規模小売業者と納入業者、親事業者と下請事業者の間で典型的に問題化し、近年はデジタル・プラットフォーム事業者と利用者・消費者（個人情報等の提供）の文脈でも論じられる。公正取引委員会が運用し、違反は排除措置命令・課徴金納付命令の対象となりうる。下請法は本規制を補完する特別法。',
    keyFigures: '独占禁止法2条9項5号（定義）・19条（禁止）／公正取引委員会／補完: 下請法',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jftc.go.jp/dk/guideline/unyoukijun/yuetsutekichii.html', type: 'government', label: '公正取引委員会 — 優越的地位の濫用に関する独占禁止法上の考え方（ガイドライン）' },
      { url: 'https://www.jftc.go.jp/dk/dkgaiyo/kisei.html', type: 'government', label: '公正取引委員会 — 独占禁止法の規制内容（不公正な取引方法・19条・排除措置/課徴金）' },
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000054/', type: 'government', label: 'e-Gov法令検索 — 私的独占の禁止及び公正取引の確保に関する法律（昭和22年法律第54号）' },
    ],
  },
  {
    id: 'infosoc-uses-gratifications',
    discipline: 'information-sociology',
    title: '利用と満足理論（uses and gratifications theory）',
    statement:
      '「メディアが人々に何をするか」ではなく「人々がメディアを使って何をするか（どんな欲求を満たすか）」に着目する、能動的オーディエンス観に立つマスコミュニケーション理論。受け手は情報・娯楽・社会的つながり・自己確認・現実逃避などの欲求を満たすため能動的にメディアを選択・利用すると捉える。' +
      '受け手を一方的に影響を受ける受動的存在とみなす皮下注射モデル（強力効果論）への反動として、ラジオ番組の聴取動機を問うた1940年代の研究（H.ヘルツォークによる連続ラジオドラマ研究など）に萌芽し、エリフ・カッツ、ジェイ・ブラムラー、マイケル・グレヴィッチらが1970年代（特に1974年の論考）に体系化した。SNS・スマホ時代の能動的なメディア利用の説明にも援用される一方、受け手の合理性・自覚性を過度に前提しているとの批判もある。',
    keyFigures: 'E.カッツ／J.ブラムラー／M.グレヴィッチ（1970年代体系化）／先駆: H.ヘルツォーク（1944）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/communication-and-mass-media/uses-and-gratifications-theory', type: 'academic', label: 'EBSCO Research Starters — Uses and gratifications theory' },
      { url: 'https://en.wikipedia.org/wiki/Uses_and_gratifications_theory', type: 'reference', label: 'Wikipedia — Uses and gratifications theory' },
      { url: 'https://journals.sagepub.com/doi/10.1177/009365027900600102', type: 'academic', label: 'Blumler (1979) The Role of Theory in Uses and Gratifications Studies, Communication Research（SAGE 査読誌）' },
    ],
  },
  {
    id: 'econ-gdp-triple-equivalence',
    discipline: 'economics',
    title: 'GDPと三面等価の原則',
    statement:
      '国内総生産（GDP）は、一定期間に一国の国内で生産された付加価値の総額であり、一国の経済規模を測る代表的な指標である。GDPは三つの側面から計測できる。' +
      '「生産面」は各産業の産出から中間投入を差し引いた付加価値の合計、「分配面」は生産で生じた所得（雇用者報酬＋営業余剰・混合所得＋固定資本減耗＋生産・輸入品に課される税－補助金）、「支出面」は最終需要（民間消費＋投資＋政府支出＋純輸出）である。正確に計測すればこれら三面は事後的に必ず等しくなり、これを三面等価の原則という。なお名目GDP（時価表示）と実質GDP（物価変動を除去）、GDPとGNI（国民総所得）は区別される。自家消費の家事労働や地下経済などSNAの生産境界外の活動は計上されないという限界もある。日本では内閣府（経済社会総合研究所）が国連の国際基準（SNA）に基づき国民経済計算として推計・公表している。',
    keyFigures: '国民経済計算（SNA）の体系（国連の国際基準）／日本は内閣府（ESRI）が推計／三面: 生産＝分配＝支出',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.imf.org/en/publications/fandd/issues/series/back-to-basics/gross-domestic-product-gdp', type: 'government', label: 'IMF Finance & Development — Gross Domestic Product（三アプローチが同一額になる）' },
      { url: 'https://www.britannica.com/money/gross-domestic-product', type: 'reference', label: 'Encyclopædia Britannica Money — Gross domestic product（定義・支出法）' },
      { url: 'https://www.esri.cao.go.jp/jp/sna/contents/sna.html', type: 'government', label: '内閣府 経済社会総合研究所 — 国民経済計算とは（SNA国際基準）' },
    ],
  },
  {
    id: 'econ-quantity-theory-of-money',
    discipline: 'economics',
    title: '貨幣数量説（quantity theory of money）',
    statement:
      '物価水準は流通する貨幣量に比例して決まるとする金融・マクロ経済学の理論。アーヴィング・フィッシャーが『貨幣の購買力』(1911)で定式化した交換方程式 MV=PT（M=貨幣量、V=貨幣の流通速度、P=物価水準、T=取引量。実質産出を用いるMV=PYの形でも表す）で示される。' +
      'これは恒等式だが、長期・完全雇用下でVとT（または産出Y）が安定的とみなせば、貨幣量Mの増加は比例的に物価Pを押し上げる――すなわちインフレは究極的には貨幣的現象だ――と含意する。源流は16世紀のジャン・ボーダンに遡り、ロック・カンティロン・デイヴィッド・ヒュームら古典派が精緻化、20世紀にフィッシャー、ケンブリッジ学派（マーシャル・ピグーの現金残高方程式＝貨幣需要に着目）、さらにミルトン・フリードマンが1956年の「貨幣数量説――再説」でマネタリズムの中核として現代的に再構築した。流通速度の安定性や短期での有効性をめぐってはケインズ派から批判がある。',
    keyFigures: 'アーヴィング・フィッシャー（交換方程式 MV=PT, 1911）／ケンブリッジ学派（現金残高）／ミルトン・フリードマン（マネタリズム1956）／源流: ヒューム等',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.richmondfed.org/-/media/richmondfedorg/publications/research/economic_review/1974/pdf/er600301.pdf', type: 'government', label: 'Humphrey (1974) The Quantity Theory of Money: Historical Evolution, Richmond Fed Economic Review' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/quantity-theory-money', type: 'academic', label: 'EBSCO Research Starters — Quantity theory of money' },
      { url: 'https://en.wikipedia.org/wiki/Quantity_theory_of_money', type: 'reference', label: 'Wikipedia — Quantity theory of money' },
    ],
  },
  {
    id: 'mgmt-lean-startup',
    discipline: 'management',
    title: 'リーン・スタートアップ（Lean Startup）',
    statement:
      '不確実性の高い新事業・製品開発において、最小限の機能を持つ試作品＝MVP（Minimum Viable Product）を素早く作り、顧客の反応を計測して学習する「構築-計測-学習（Build-Measure-Learn）」のフィードバックループを高速で回すことで、無駄を省きつつ事業仮説を検証していく方法論。' +
      '検証による学習（validated learning）を重視し、当初の仮説が誤りであれば方向転換＝ピボット（pivot）を行う。エリック・リースが2011年の著書『The Lean Startup』で提唱した。トヨタ生産方式に代表されるリーン生産方式と、スティーブ・ブランクの顧客開発（customer development）モデルに着想を得ている。',
    keyFigures: 'エリック・リース（2011『The Lean Startup』）／源流: スティーブ・ブランク（顧客開発）・トヨタ生産方式',
    asOf: '2026-06',
    sources: [
      { url: 'https://theleanstartup.com/principles', type: 'reference', label: 'エリック・リース公式サイト — The Lean Startup Principles（BMLループ）' },
      { url: 'https://www.lse.ac.uk/assets/richmedia/channels/publicLecturesAndEvents/slides/20120112_1830_theLeanStartup_sl.pdf', type: 'academic', label: 'London School of Economics — The Lean Startup 公開講義スライド（リース登壇）' },
      { url: 'https://leanstartup.co/about/principles/', type: 'reference', label: 'Lean Startup Co.（リース主宰）— 中核原則' },
    ],
  },
  {
    id: 'human-pygmalion-effect',
    discipline: 'human-science',
    title: 'ピグマリオン効果（教師期待効果）',
    statement:
      '他者からの期待が、その対象者の成績やパフォーマンスを実際に高める現象。教師が特定の生徒に高い期待を抱くと、その期待が態度・接し方を通じて生徒に伝わり、生徒の成績が向上するとされる。' +
      'ロバート・ローゼンタールとレノア・ジェイコブソンが1968年の著書『Pygmalion in the Classroom』で報告した（教師に一部の生徒を「これから成績が伸びる（intellectual bloomers）」と偽って伝えると、その群の知能テスト得点が実際に伸びたとする実験）。社会学者R.K.マートンの「自己成就予言」の一種であり、逆に低い期待が成績を下げる「ゴーレム効果」と対をなす。なお当初研究はIQ測定具の欠陥・データ品質・統計（平均への回帰の可能性）・再現性に関してソーンダイク(1968)やスノウ(1969)らから強い批判を受けており、効果量や一般化には留保が必要である。',
    keyFigures: 'ロバート・ローゼンタール & レノア・ジェイコブソン（1968『Pygmalion in the Classroom』）／批判: Thorndike(1968)・Snow(1969)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/education/pygmalion-effect-rosenthal-effect', type: 'academic', label: 'EBSCO Research Starters — Pygmalion effect (Rosenthal effect)' },
      { url: 'https://en.wikipedia.org/wiki/Pygmalion_in_the_Classroom', type: 'reference', label: 'Wikipedia — Pygmalion in the Classroom（1968研究と方法論批判）' },
      { url: 'https://www.tandfonline.com/doi/abs/10.1080/13803611.2018.1548817', type: 'academic', label: 'Educational Research and Evaluation (2018) — Expectation effects: Pygmalion（査読・効果と限界）' },
    ],
  },
  {
    id: 'bizlaw-freedom-of-contract',
    discipline: 'business-law',
    title: '契約自由の原則',
    statement:
      '私人は国家の干渉を受けず、自由な意思に基づいて契約を締結できるという近代私法の基本原則。一般に(1)契約締結の自由、(2)相手方選択の自由、(3)内容決定の自由、(4)方式の自由の4つを含む。' +
      '従来の民法に明文規定はなかったが、2017年（平成29年）改正民法（2020年4月1日施行）で明文化された。民法521条が「契約をするかどうか」（締結の自由）と「契約の内容」（内容決定の自由）を、522条2項が方式の自由（法令に特別の定めがある場合を除き、契約の成立に書面その他の方式を要しない）を定める。ただし公序良俗（民法90条）や強行規定に反する契約は無効であり、消費者契約法・借地借家法・労働法等による修正（弱者保護）や、定型約款の規律（548条の2以下）など、現代では制約も大きい。',
    keyFigures: '契約自由の原則（締結・相手方選択・内容決定・方式の4自由）／2017改正民法521条・522条で明文化／制約: 90条公序良俗等',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 — 民法（521条・522条・90条・548条の2 等）' },
      { url: 'https://www.ritsumei.ac.jp/acd/cg/law/lex/15-56/036%20yamadanozomi.pdf', type: 'academic', label: '山田希 — 契約自由の原則とその制約法理をめぐる改正論議（立命館法学）' },
      { url: 'https://www.cloudsign.jp/media/houshikinojiyuu/', type: 'media', label: 'クラウドサイン — 改正民法522条・契約方式自由の原則とその例外' },
    ],
  },
  {
    id: 'infosoc-cultivation-theory',
    discipline: 'information-sociology',
    title: '培養理論（カルティベーション理論, cultivation theory）',
    statement:
      'テレビなどのマスメディアに長時間接触する人ほど、メディアが繰り返し描く世界像を現実だと認識するようになる、という長期的・累積的なメディア効果論。ジョージ・ガーブナーらが1960年代後半〜1970年代の「文化指標プロジェクト」で提唱した。' +
      '代表例が「Mean World Syndrome（冷酷な世界症候群）」で、暴力描写の多いテレビをよく見る重視聴者（ヘビービューワー）ほど、現実世界を実際より危険・暴力的だと過大評価する傾向を示す。視聴者の認識が均質化する「メインストリーミング」や、現実体験と番組内容が一致すると効果が増幅される「共鳴（resonance）」の概念を含む。効果は小さく漸進的とされ、因果方向の不明確さや社会経済的地位などの交絡変数を十分統制していないとの批判もある。',
    keyFigures: 'ジョージ・ガーブナー（1960年代後半〜、文化指標プロジェクト、ペンシルベニア大アネンバーグ校）／共同: ラリー・グロス',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/cultivation-analysis', type: 'reference', label: 'Encyclopaedia Britannica — Cultivation analysis' },
      { url: 'https://eric.ed.gov/?id=EJ139260', type: 'academic', label: 'Gerbner & Gross (1976) Living with Television: The Violence Profile, Journal of Communication 26(2):172-194（原典）' },
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1468-2958.1993.tb00313.x', type: 'academic', label: 'Potter (1993) Cultivation Theory and Research, Human Communication Research（査読・批判）' },
    ],
  },
  {
    id: 'econ-efficient-market-hypothesis',
    discipline: 'economics',
    title: '効率的市場仮説（efficient market hypothesis, EMH）',
    statement:
      '資産価格は利用可能な情報をすべて速やかに織り込むため、市場平均を継続的に上回る超過収益を恒常的に得ることはできない、とする金融経済学の仮説。価格に反映される情報集合の範囲により3形態に区別される。' +
      'ウィーク型は情報集合を過去の価格・取引履歴とし、過去データに基づくテクニカル分析では超過収益を得られないとする。セミストロング型は公開情報すべてを対象とし、ファンダメンタル分析も無効とする。ストロング型は私的（未公開）情報まで含む。ユージン・ファーマが1970年の論文で体系化し、2013年にノーベル経済学賞を受賞した。価格変化は新情報の出現が予測不能ゆえランダムとなるランダムウォーク理論と密接に関連する。1990年代以降、行動経済学（シラー等）や、小型株効果・1月効果といった持続的アノマリーの存在から批判があり、市場参加者の合理性や完全情報の前提が現実的かが争点となっている。',
    keyFigures: 'ユージン・ファーマ（1970体系化・2013ノーベル経済学賞）／批判: ロバート・シラー（行動ファイナンス、2013共同受賞）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/what-is-the-efficient-market-hypothesis', type: 'reference', label: 'Encyclopædia Britannica Money — Efficient-Market Hypothesis（3形態・批判）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2013/fama/facts/', type: 'government', label: 'NobelPrize.org — Eugene F. Fama 2013（資産価格の実証分析）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2013/advanced-information/', type: 'government', label: 'NobelPrize.org — 2013年経済学賞 Advanced information' },
    ],
  },
  {
    id: 'econ-gini-coefficient',
    discipline: 'economics',
    title: 'ジニ係数とローレンツ曲線',
    statement:
      'ジニ係数は所得や資産などの分配の不平等度を測る代表的な指標である。基礎となるローレンツ曲線は、世帯や個人を所得の低い順に並べたときの累積人口割合（横軸）と累積所得割合（縦軸）の関係を描いた曲線で、完全平等なら45度線（均等分布線）に一致し、不平等なほど右下方にたわむ。' +
      'ジニ係数は、均等分布線とローレンツ曲線で囲まれた面積を、均等分布線の下の三角形の面積で割った値で、0（完全平等＝全員が同じ所得）から1（完全不平等＝1人が全所得を独占）の範囲をとる。ローレンツ曲線は1905年に米国の経済学者M.O.ローレンツが、ジニ係数は1912年にイタリアの統計学者コッラド・ジーニが論文「変動性と可変性（Variabilità e mutabilità）」で考案した。各国・時系列の格差比較に広く用いられ、当初所得（市場所得）と再分配所得（税・社会保障給付後の可処分所得）の比較により税・社会保障の所得再分配効果も測定できる。',
    keyFigures: 'コッラド・ジーニ（1912、ジニ係数）／マックス・O・ローレンツ（1905、ローレンツ曲線）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Gini-Coefficient', type: 'reference', label: 'Encyclopaedia Britannica — Gini coefficient（定義・式・ローレンツ曲線）' },
      { url: 'https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SI.POV.GINI', type: 'government', label: 'World Bank DataBank Glossary — Gini index' },
      { url: 'https://ourworldindata.org/what-is-the-gini-coefficient', type: 'academic', label: 'Our World in Data（Oxford関連）— What is the Gini coefficient?' },
    ],
  },
  {
    id: 'mgmt-swot-analysis',
    discipline: 'management',
    title: 'SWOT分析',
    statement:
      '組織の戦略策定にあたり、内部環境の強み（Strengths）・弱み（Weaknesses）と、外部環境の機会（Opportunities）・脅威（Threats）の4要素を整理・分析するフレームワーク。S/Wは組織内部の要因、O/Tは外部環境の要因であり、S・Oがプラス要因、W・Tがマイナス要因に対応する。' +
      'これら4象限で現状を把握したうえで、強みを機会に活かす・弱みを補い脅威を回避するといったクロスSWOT（TOWS）分析により具体的な戦略を導く。1960〜70年代に経営計画の手法として広まった。起源はスタンフォード研究所のアルバート・ハンフリーらの研究や、ハーバード経営大学院のLCAG（Learned/Christensen/Andrews/Guth）の経営政策論に帰されることが多いが、諸説あり単一の発明者は明確でない。簡便で広く使われる一方、要因を列挙するにとどまり、優先順位づけや動態・因果関係を示さない等の限界も指摘される。',
    keyFigures: '起源には諸説あり単一の発明者は不確定（A.ハンフリー/スタンフォード研究所、ハーバードLCAGの経営政策論等）／1960-70年代に普及',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/swot-analysis-for-investing', type: 'reference', label: 'Encyclopaedia Britannica Money — SWOT Analysis（4要素の定義）' },
      { url: 'https://www.ifm.eng.cam.ac.uk/research/dstools/swot/', type: 'academic', label: 'University of Cambridge, Institute for Manufacturing — SWOT' },
      { url: 'https://www.sciencedirect.com/science/article/pii/S0024630123000110', type: 'academic', label: 'Long Range Planning (ScienceDirect) — The origins of SWOT analysis（起源の学術的検証）' },
    ],
  },
  {
    id: 'human-framing-effect',
    discipline: 'human-science',
    title: 'フレーミング効果（framing effect）',
    statement:
      '論理的に等価な情報であっても、その提示の仕方（枠組み＝フレーム）が異なると人々の判断や選択が変わる認知バイアス。とりわけ、結果を「利得（gain）」として提示する利得フレームでは確実な選択肢を好みリスク回避的になり、「損失（loss）」として提示する損失フレームではリスク追求的になる傾向がある（プロスペクト理論の価値関数と整合）。' +
      'エイモス・トベルスキーとダニエル・カーネマンが1981年の論文「The Framing of Decisions and the Psychology of Choice」(Science 211:453-458)で実証した。代表例の「アジア病問題」では、600人の死が予想される疾病対策について、同一の救命確率を「200人が助かる」と提示すると多数が確実な案を選び、「400人が死ぬ」と提示すると多数がリスクを伴う案を選ぶというように、多数派の選択が逆転した。医療意思決定・広告・政策コミュニケーションに広く影響する。',
    keyFigures: 'エイモス・トベルスキー & ダニエル・カーネマン（1981, Science 211:453-458）／プロスペクト理論と関連',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.science.org/doi/10.1126/science.7455683', type: 'academic', label: 'Tversky & Kahneman (1981) The Framing of Decisions and the Psychology of Choice, Science 211:453-458（原典）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/7455683/', type: 'academic', label: 'PubMed（米国立医学図書館）— PMID 7455683 書誌' },
      { url: 'https://en.wikipedia.org/wiki/Framing_effect_(psychology)', type: 'reference', label: 'Wikipedia — Framing effect (psychology)（利得/損失フレーム・選好逆転）' },
    ],
  },
  {
    id: 'bizlaw-patent-system',
    discipline: 'business-law',
    title: '特許制度（特許法）',
    statement:
      '発明を保護・奨励することで産業の発達に寄与することを目的とする知的財産制度（特許法第1条）。特許法は「発明」を「自然法則を利用した技術的思想の創作のうち高度のもの」と定義し（2条1項）、特許を受けるには産業上の利用可能性・新規性・進歩性等の要件を満たす必要がある（29条）。' +
      '日本は先願主義を採り、同一の発明について異なる日に複数の出願があったときは最先の出願人のみが特許を受けられる（39条）。権利の存続期間は出願日から原則20年で（67条）、医薬品等では期間補償・期間延長の制度がある。手続は、出願→方式審査→出願公開（原則出願から1年6か月後）→審査請求（出願から3年以内）→実体審査→設定登録の流れをとる。所管は特許庁。特許権者は業として特許発明を独占的に実施する権利を専有し（68条）、侵害には差止請求や損害賠償請求ができる。発明の公開と一定期間の独占の付与を引き換えにすることで技術の累積的発展を促す制度設計である。',
    keyFigures: '特許法（昭和34年法律第121号）／発明の定義(2条)・先願主義(39条)・存続期間 出願から原則20年(67条)／特許庁所管',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jpo.go.jp/system/patent/gaiyo/seidogaiyo/chizai04.html', type: 'government', label: '特許庁 — 特許・実用新案とは（発明の定義・制度概要）' },
      { url: 'https://elaws.e-gov.go.jp/document?lawid=334AC0000000121_20250616_504AC0000000068', type: 'government', label: 'e-Gov法令検索 — 特許法（昭和34年法律第121号）' },
      { url: 'https://faq.inpit.go.jp/FAQ/2024/01/000195.html', type: 'government', label: 'INPIT（工業所有権情報・研修館）— 特許権の存続期間' },
    ],
  },
  {
    id: 'infosoc-two-step-flow',
    discipline: 'information-sociology',
    title: 'コミュニケーションの二段階の流れ仮説（two-step flow）',
    statement:
      'マスメディアの情報は大衆へ直接かつ一様に作用するのではなく、まずメディアをよく利用し情報感度の高い「オピニオンリーダー」に届き、次に彼らとの対人コミュニケーションを介して、メディア接触の少ない一般の人々へと流れるとする二段階の伝播モデル。' +
      'メディアの直接的・強力な効果を想定した皮下注射モデルを修正し、対人的影響とオピニオンリーダーの媒介的役割を重視する「限定効果論」に位置づけられる。ポール・ラザースフェルドらが1940年の米大統領選における投票行動を調査した『ピープルズ・チョイス（The People’s Choice）』(1944)で、投票決定にラジオや新聞より対人接触が強く影響していた事実から着想し、エリフ・カッツとラザースフェルドが『パーソナル・インフルエンス（Personal Influence）』(1955)で理論として体系化した。後にメディア環境の変化に伴い、多段階の流れ（multi-step flow）等への再検討も行われている。',
    keyFigures: 'ポール・F・ラザースフェルド & エリフ・カッツ（『The People’s Choice』1944・『Personal Influence』1955）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/two-step-flow-model-of-communication', type: 'reference', label: 'Encyclopædia Britannica — Two-step flow model of communication' },
      { url: 'https://en.wikipedia.org/wiki/Two-step_flow_of_communication', type: 'reference', label: 'Wikipedia — Two-step flow of communication' },
      { url: 'https://sk.sagepub.com/ency/edvol/download/communicationtheory/chpt/twostep-multistep-flow.pdf', type: 'academic', label: 'SAGE Encyclopedia of Communication Theory — Two-Step and Multi-Step Flow' },
    ],
  },
  {
    id: 'econ-supply-demand-equilibrium',
    discipline: 'economics',
    title: '需要と供給の均衡（価格メカニズム）',
    statement:
      '市場において、価格が上がると需要量は減り供給量は増える（右下がりの需要曲線・右上がりの供給曲線）。両曲線が交わる点で需要量と供給量が一致し、均衡価格と均衡数量が決まる。' +
      '価格がそれより高ければ超過供給（売れ残り）で価格は下落し、低ければ超過需要（品不足）で価格は上昇し、市場メカニズム（見えざる手）を通じて自動的に均衡へ調整される。この自己調整の発想はアダム・スミスが『国富論』(1776)で示した「見えざる手」に淵源し、アルフレッド・マーシャルが需要・供給の両曲線をはさみの二枚刃にたとえて体系化（マーシャリアン・クロス、1890『経済学原理』）した。需給曲線のシフトが均衡価格・数量を変化させ、価格による資源配分の効率性を支えるミクロ経済学の基礎理論である。',
    keyFigures: 'アダム・スミス（『国富論』1776・見えざる手）／アルフレッド・マーシャル（1890『経済学原理』・需給曲線の体系化）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/supply-and-demand/Market-equilibrium-or-balance-between-supply-and-demand', type: 'reference', label: 'Encyclopædia Britannica Money — Supply and demand: Market equilibrium' },
      { url: 'https://www.britannica.com/money/Alfred-Marshall', type: 'reference', label: 'Encyclopædia Britannica Money — Alfred Marshall（はさみの両刃・1890）' },
      { url: 'https://www.econlib.org/library/Enc/bios/Marshall.html', type: 'academic', label: 'Econlib — Alfred Marshall（需給を「はさみの二枚刃」とした原典引用）' },
    ],
  },
  {
    id: 'econ-natural-rate-unemployment',
    discipline: 'economics',
    title: '自然失業率（NAIRU）',
    statement:
      'インフレを加速も減速もさせず、長期的に持続可能な失業率の水準。摩擦的失業（転職に伴う一時的失業）と構造的失業（技能・地域のミスマッチ等）から成り、景気循環的（需要変動による）失業を含まない。' +
      '実際の失業率がこの水準を下回ると労働需給が逼迫してインフレが加速し、上回ると減速する。ミルトン・フリードマンとエドムンド・フェルプスが1960年代後半に提唱し、長期的にはフィリップス曲線が自然失業率の水準で垂直になる（失業とインフレの間に長期的トレードオフは存在しない）とした。インフレ非加速的失業率（NAIRU, Non-Accelerating Inflation Rate of Unemployment）とほぼ同義で用いられる。フリードマンは1976年、フェルプスは2006年にノーベル経済学賞を受賞。水準は直接観測できず、推計に幅がある。',
    keyFigures: 'ミルトン・フリードマン & エドムンド・フェルプス（1960年代後半提唱）／長期フィリップス曲線の垂直／ノーベル賞: F.1976・P.2006',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.frbsf.org/research-and-insights/publications/economic-letter/1998/09/the-natural-rate-nairu-and-monetary-policy/', type: 'government', label: 'San Francisco Fed — The Natural Rate, NAIRU, and Monetary Policy' },
      { url: 'https://www.britannica.com/money/Edmund-Phelps', type: 'reference', label: 'Encyclopaedia Britannica — Edmund S. Phelps（自然失業率・期待修正フィリップス曲線）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2006/press-release/', type: 'government', label: 'NobelPrize.org — 2006年経済学賞 Phelps（Friedman 1976も併記）' },
    ],
  },
  {
    id: 'mgmt-value-chain',
    discipline: 'management',
    title: 'バリューチェーン（価値連鎖）',
    statement:
      '企業の事業活動を、製品・サービスの価値を生み出す一連の活動の連鎖として捉え、競争優位の源泉を分析する経営戦略の枠組み。活動は、製品の創出・販売・流通に直接関わる「主活動（購買物流／製造／出荷物流／販売・マーケティング／サービス）」と、それらを支える「支援活動（全般管理／人事・労務管理／技術開発／調達）」に分類される。' +
      '各活動が生むコストと差別化の価値を分析し、どの活動が競争優位を生むか、活動間のリンケージをどう最適化するかを検討する。マイケル・E・ポーターが1985年の著書『競争優位の戦略（Competitive Advantage）』で提示した。買い手が支払う価値とその価値を生む総コストとの差がマージン（利益）であり、ここからコストリーダーシップと差別化の2つの基本戦略が導かれる。原材料から最終消費までの企業間の流れを指すサプライチェーンとは概念が異なる。',
    keyFigures: 'マイケル・E・ポーター（1985『競争優位の戦略』）',
    asOf: '2026-06',
    sources: [
      { url: 'https://online.hbs.edu/blog/post/what-is-value-chain-analysis', type: 'academic', label: 'Harvard Business School Online — What Is a Value Chain Analysis?' },
      { url: 'https://www.britannica.com/money/value-chain-analysis-overview', type: 'reference', label: 'Encyclopædia Britannica Money — What Is a Value Chain?' },
      { url: 'https://www.ifm.eng.cam.ac.uk/research/dstools/value-chain-/', type: 'academic', label: 'University of Cambridge, Institute for Manufacturing — Porter’s Value Chain' },
    ],
  },
  {
    id: 'human-mere-exposure',
    discipline: 'human-science',
    title: '単純接触効果（ザイアンス効果, mere exposure effect）',
    statement:
      'ある刺激（人・物・記号・音楽など）に繰り返し接触するだけで、その対象への好意度・選好が高まる現象。理由づけや報酬がなくとも、単に接触頻度が増えるほど好意的評価が増す。' +
      '社会心理学者ロバート・ザイアンスが1968年の論文「Attitudinal Effects of Mere Exposure」(Journal of Personality and Social Psychology 9:1-27)で体系的に実証した。広告で同じ商品・ブランドへ繰り返し接触させる手法や、対人的好意の形成の説明に用いられる。ただし過度な接触では飽き・満腹化により効果が低下しうること、刺激が中立〜やや好意的な場合に効果が出やすく、最初から強い嫌悪・否定的感情を抱く対象では逆効果（嫌悪の増幅）になりうる等の条件・限界も指摘されている。',
    keyFigures: 'ロバート・ザイアンス（Robert B. Zajonc, 1968, JPSP 9:1-27）',
    asOf: '2026-06',
    sources: [
      { url: 'https://psycnet.apa.org/doi/10.1037/h0025848', type: 'academic', label: 'Zajonc (1968) Attitudinal Effects of Mere Exposure, JPSP 9(2,Pt.2):1-27（原典）' },
      { url: 'https://www.ebsco.com/research-starters/psychology/mere-exposure-effect', type: 'academic', label: 'EBSCO Research Starters — Mere-exposure effect' },
      { url: 'https://en.wikipedia.org/wiki/Mere-exposure_effect', type: 'reference', label: 'Wikipedia — Mere-exposure effect' },
    ],
  },
  {
    id: 'bizlaw-prescription',
    discipline: 'business-law',
    title: '時効（消滅時効・取得時効）',
    statement:
      '一定の事実状態が継続した場合に、それに即した法律関係（権利の取得・消滅）を認める制度。取得時効（民法162条）は、他人の物を所有の意思をもって平穏かつ公然と一定期間占有した者がその所有権を取得する制度で、占有開始時に善意無過失であれば10年（同条2項）、そうでなければ20年（同条1項）で完成する。' +
      '消滅時効は権利を行使しないまま一定期間が経過すると権利が消滅する制度である。2017年改正民法（2020年4月1日施行）により、債権の消滅時効は原則として「権利を行使することができることを知った時（主観的起算点）から5年間」または「権利を行使することができる時（客観的起算点）から10年間」のいずれか早い方に統一され、従来の職業別短期消滅時効は廃止された（民法166条1項）。時効は当事者の援用により効力を生じ（民法145条）、完成猶予・更新の事由がある（民法147条以下）。',
    keyFigures: '取得時効=民法162条（善意無過失10年/それ以外20年）／消滅時効=民法166条1項（2020改正で5年・10年に統一）／援用145条・完成猶予/更新147条以下',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 — 民法（162条・166条・145条・147条以下）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0166-00/', type: 'reference', label: 'クレアール — 民法166条【債権等の消滅時効】（2020改正）' },
      { url: 'https://www.businesslawyers.jp/practices/1185', type: 'media', label: 'BUSINESS LAWYERS（弁護士監修）— 民法改正による消滅時効の変更点（主観的起算点）' },
    ],
  },
  {
    id: 'infosoc-medium-is-the-message',
    discipline: 'information-sociology',
    title: 'メディアはメッセージである（マクルーハン）',
    statement:
      'メディアが社会に与える影響は、それが運ぶ「内容（コンテンツ）」よりも、メディアという形式・技術そのもの（人々の知覚や社会組織を変える仕方）にある、とする命題。カナダの文明批評家マーシャル・マクルーハンが1964年の著書『メディア論（Understanding Media: The Extensions of Man）』で提示した。' +
      'マクルーハンはメディアを「人間の身体・感覚の拡張（extensions of ourselves）」と捉え、あらゆるメディア＝新技術がわれわれの諸事に導入する新たな「尺度（scale）」から個人的・社会的帰結が生じるとした。すなわち新しいメディアの登場は、内容に関わらず人々の知覚の比率や社会の尺度・形態を変える。関連概念に、受け手の参与度で分ける「ホット／クール・メディア」、電子メディアが世界を縮める「グローバル・ヴィレッジ（地球村）」がある（後者の初出は1962『グーテンベルクの銀河系』）。技術決定論的だとの批判もある。',
    keyFigures: 'マーシャル・マクルーハン（1911-1980, 1964『Understanding Media』）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Marshall-McLuhan', type: 'reference', label: 'Encyclopaedia Britannica — Marshall McLuhan（"the medium is the message"・1964）' },
      { url: 'https://www.britannica.com/topic/global-village', type: 'reference', label: 'Encyclopaedia Britannica — Global village（地球村）' },
      { url: 'https://web.mit.edu/allanmc/www/mcluhan.mediummessage.pdf', type: 'academic', label: 'MIT 提供 — McLuhan『Understanding Media』(1964) 第1章 The Medium is the Message 抜粋（原典）' },
    ],
  },
  {
    id: 'econ-principal-agent',
    discipline: 'economics',
    title: 'プリンシパル・エージェント理論（agency theory）',
    statement:
      '依頼人（プリンシパル）が、意思決定や業務の遂行を代理人（エージェント）に委ねる関係において、両者の利害が一致せずかつ情報の非対称性が存在するために生じる問題（エージェンシー問題）を分析する経済学の理論。' +
      '中心となるのは、エージェントの行動を依頼人が十分に観察できないことに起因するモラルハザードと、エージェントの隠れた情報による逆選択である。株主と経営者、依頼人と弁護士、有権者と政治家などが典型例。委ねる側はモニタリング費用、委ねられる側はボンディング費用を負い、なお残る損失を残余損失と呼び、これらの総和をエージェンシーコストという。これを抑えるため業績連動報酬やストックオプションといったインセンティブ契約・ガバナンスの仕組みが用いられる。マイケル・ジェンセンとウィリアム・メックリングが1976年の論文でエージェンシーコストを定式化し、契約理論の中核を成す。ベングト・ホルムストロームとオリバー・ハートはこの分野への貢献により2016年にノーベル経済学賞を受賞した。',
    keyFigures: 'ジェンセン & メックリング（1976、エージェンシーコストの定式化）／ホルムストローム & ハート（2016ノーベル経済学賞・契約理論）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/financial-agency-theory', type: 'reference', label: 'Britannica Money — Financial agency theory' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2016/popular-information/', type: 'government', label: 'NobelPrize.org — 2016年経済学賞 Hart & Holmström（契約理論・本人-代理人モデル）' },
      { url: 'https://ideas.repec.org/a/eee/jfinec/v3y1976i4p305-360.html', type: 'academic', label: 'Jensen & Meckling (1976) Theory of the Firm, Journal of Financial Economics 3:305-360（RePEc）' },
    ],
  },
  {
    id: 'econ-rational-expectations',
    discipline: 'economics',
    title: '合理的期待形成（合理的期待仮説）',
    statement:
      '経済主体は、利用可能な情報を最大限かつ効率的に活用し、体系的（systematic）な誤りを犯さない形で将来を予想する（期待を形成する）とする仮説。予想は平均的には正しく、誤差はランダムにとどまる。' +
      'ジョン・F・ミュースが1961年の論文「Rational Expectations and the Theory of Price Movements」で概念を提示し、ロバート・E・ルーカスらが1970年代にマクロ経済学へ導入・応用して「合理的期待革命」を起こした。重要な含意として、人々が政策の効果を見越して行動を調整するため、予見された金融・財政政策は実質変数（産出・雇用）に影響を与えられないとする「政策無効命題」がある。さらに、過去データに基づき推定された計量モデルの方程式は政策（期待）が変われば不安定になり予測に使えなくなるという「ルーカス批判（1976）」も中心的な帰結である。ルーカスはこの貢献により1995年ノーベル経済学賞を受賞した。前提の現実性については批判もある。',
    keyFigures: 'ジョン・F・ミュース（1961提示）／ロバート・E・ルーカス（1970年代導入・1995ノーベル賞・ルーカス批判1976・政策無効命題）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/theory-of-rational-expectations', type: 'reference', label: 'Encyclopaedia Britannica — Theory of rational expectations' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1995/summary/', type: 'government', label: 'NobelPrize.org — 1995年経済学賞（ロバート・ルーカス）' },
      { url: 'https://www.econlib.org/library/Enc/RationalExpectations.html', type: 'academic', label: 'Econlib, Concise Encyclopedia of Economics — Rational Expectations' },
    ],
  },
  {
    id: 'mgmt-theory-x-y',
    discipline: 'management',
    title: 'X理論・Y理論（マグレガー）',
    statement:
      '経営者が従業員に対して抱く人間観を、2つの対照的な前提として整理した動機づけ・組織行動の理論。X理論は「人間は本来仕事を嫌い怠惰で、責任を回避するため、命令・統制・処罰によって管理する必要がある」という性悪説的・権威主義的な前提を指す。' +
      'これに対しY理論は「条件が整えば人間は仕事に進んで取り組み、自ら方向づけ（自己統制）を行い、責任や自己実現を求める」という性善説的な前提で、目標による管理・自主性の尊重・参加的経営が適するとする。マグレガーはこれらを労働者の類型ではなく経営者側の前提の集合と捉え、その前提が自己成就的に対応する行動を生むと論じた。ダグラス・マグレガーが1960年の著書『企業の人間的側面（The Human Side of Enterprise）』で提示し、マズローの欲求段階説の影響を受けている。後にウィリアム・オオウチが日本的経営を踏まえた「Z理論」（1981）を提唱した。',
    keyFigures: 'ダグラス・マグレガー（1960『企業の人間的側面』）／関連: マズロー、オオウチのZ理論（1981）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/The-Human-Side-of-Enterprise', type: 'reference', label: 'Encyclopædia Britannica — The Human Side of Enterprise（McGregor）' },
      { url: 'https://www.ebsco.com/research-starters/economics/theory-x-and-theory-y', type: 'academic', label: 'EBSCO Research Starters — Theory X and Theory Y' },
      { url: 'https://courses.lumenlearning.com/wm-organizationalbehavior/chapter/mcgregors-theory-x-and-theory-y/', type: 'academic', label: 'Lumen Learning — McGregor’s Theory X and Theory Y' },
    ],
  },
  {
    id: 'human-reciprocity',
    discipline: 'human-science',
    title: '返報性の原理（reciprocity）',
    statement:
      '他者から好意・贈り物・譲歩などを受け取ると、お返しをしなければならないという心理的義務感が生じる社会規範。試供品・無料サンプル、先に大きな要求を示してから本命を出す交渉術（ドア・イン・ザ・フェイス＝譲歩の返報）などの承諾誘導（説得）に利用される。' +
      '社会心理学者ロバート・チャルディーニ（アリゾナ州立大学）が1984年の著書『影響力の武器（Influence: The Psychology of Persuasion）』で、人を承諾させる6つの原理（返報性・コミットメントと一貫性・社会的証明・好意・権威・希少性）の一つとして体系化した（2016年に第7原理「一体性」を追加）。文化人類学者マルセル・モースの『贈与論』(1925)など贈与交換の互酬性の議論にも淵源を持つ、文化を越えて普遍的な社会規範である。',
    keyFigures: 'ロバート・チャルディーニ（1984『影響力の武器』・6原理）／淵源: マルセル・モース『贈与論』(1925)',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Robert_Cialdini', type: 'reference', label: 'Wikipedia — Robert Cialdini（影響力の6原理・返報性）' },
      { url: 'https://www.semanticscholar.org/paper/Reciprocal-Concessions-Procedure-for-Inducing-The-Cialdini-Vincent/92b260654b792a48084c99fb8f844e18183a5933', type: 'academic', label: 'Cialdini et al. (1975) Reciprocal Concessions Procedure (Door-in-the-Face), JPSP' },
      { url: 'https://en.wikipedia.org/wiki/The_Gift_(essay)', type: 'reference', label: 'Wikipedia — The Gift (Mauss, 1925)（互酬性の社会理論の基礎）' },
    ],
  },
  {
    id: 'bizlaw-tort-liability',
    discipline: 'business-law',
    title: '不法行為責任（民法709条）',
    statement:
      '故意又は過失によって他人の権利又は法律上保護される利益を侵害した者は、これによって生じた損害を賠償する責任を負う（民法709条）という、損害の公平な分担を図る制度。' +
      '成立要件は一般に、(1)故意又は過失、(2)権利・法益侵害（違法性）、(3)損害の発生、(4)行為と損害との因果関係、(5)責任能力の5つとされ、自己の過失に基づく行為についてのみ責任を負う過失責任主義を原則とする。契約関係になくても成立しうる点で債務不履行責任（415条）と異なる。特則として使用者責任（715条）、土地工作物責任（717条。占有者は過失責任〔免責の余地あり〕、所有者は無過失責任）、共同不法行為（719条）等があり、製造物責任法や自動車損害賠償保障法は無過失責任に近い特別法。損害賠償は金銭賠償が原則（722条1項）で、精神的損害に対する慰謝料（710条）も含む。',
    keyFigures: '民法709条（一般不法行為）・710条慰謝料・715条使用者責任・717条工作物責任・719条共同不法行為／過失責任主義',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 — 民法（709条・710条・715条・717条・719条・722条）' },
      { url: 'https://nagasaki-u.repo.nii.ac.jp/record/14482/files/keinen26_101.pdf', type: 'academic', label: '長崎大学学術リポジトリ — 民法709条における不法行為の成立要件の再構築' },
      { url: 'https://www.ritsumei.ac.jp/acd/cg/law/lex/21-56/040wadashinichi.pdf', type: 'academic', label: '立命館大学 — 民法715条における使用者の負担部分' },
    ],
  },
  {
    id: 'infosoc-social-capital',
    discipline: 'information-sociology',
    title: '社会関係資本（ソーシャル・キャピタル）',
    statement:
      '人々の間の信頼・規範（互酬性）・ネットワークといった社会的つながりがもつ、協調行動を促し社会を効率的に機能させる資源・価値を指す概念。物的資本・人的資本になぞらえた「資本」概念として位置づけられる。' +
      '同質的な集団内の結束を強める「結合型（bonding）」と、異質な集団間を橋渡しする「橋渡し型（bridging）」が区別される（OECDはさらにlinking型にも言及）。ロバート・パットナムが『孤独なボウリング（Bowling Alone）』(2000)等で、米国におけるコミュニティの衰退と市民参加の低下を社会関係資本の減少として論じ、概念を広く普及させた。ピエール・ブルデュー、ジェームズ・コールマンも独自の定義で理論化に貢献している。市民社会・民主主義・健康・教育・経済発展との関連で研究されるが、定義の多義性や負の側面（排他性・閉鎖性）も指摘される。',
    keyFigures: 'ロバート・パットナム（『Bowling Alone』2000・bonding/bridging普及）／ピエール・ブルデュー／ジェームズ・コールマン',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/social-capital', type: 'reference', label: 'Encyclopaedia Britannica — Social capital' },
      { url: 'https://www.oecd.org/en/publications/four-interpretations-of-social-capital_5jzbcx010wmt-en.html', type: 'government', label: 'OECD — Four Interpretations of Social Capital（bonding/bridging/linking）' },
      { url: 'https://en.wikipedia.org/wiki/Bowling_Alone', type: 'reference', label: 'Wikipedia — Bowling Alone（Putnam 2000）' },
    ],
  },
  {
    id: 'econ-pareto-efficiency',
    discipline: 'economics',
    title: 'パレート効率性（パレート最適）',
    statement:
      '誰かの効用（満足）を高めるためには他の誰かの効用を下げざるをえない状態、すなわちこれ以上、誰も損なわずに誰かを改善する余地（パレート改善）がない資源配分の状態を指す。イタリアの経済学者ヴィルフレド・パレートにちなんで名づけられた、厚生経済学における効率性の基準である。' +
      '一定の条件（完全競争・完備市場・外部性や情報の非対称性がないこと）の下で競争均衡はパレート効率的になるとする「厚生経済学の第一基本定理」がよく知られる。重要な限界として、パレート効率性は「効率」のみを問い「公平・分配」は問わない（極端な格差状態でもパレート効率的でありうる）こと、また効率的な配分は無数に存在することが挙げられる。実際の政策評価では、誰かが損をしても全体の利得が損失を上回り（理論上）補償可能とみなすカルドア=ヒックス基準が補完的に用いられる。',
    keyFigures: 'ヴィルフレド・パレート／厚生経済学の第一基本定理／補完: カルドア=ヒックス基準',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Pareto-optimality', type: 'reference', label: 'Britannica Money — Pareto-optimality' },
      { url: 'https://en.wikipedia.org/wiki/Fundamental_theorems_of_welfare_economics', type: 'reference', label: 'Wikipedia — Fundamental theorems of welfare economics（第一基本定理）' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803095838553', type: 'academic', label: 'Oxford Reference — Fundamental theorems of welfare' },
    ],
  },
  {
    id: 'econ-public-choice',
    discipline: 'economics',
    title: '公共選択論（public choice theory）',
    statement:
      '政治家・官僚・有権者・利益集団といった政治過程の主体も、市場の主体と同様に自己利益を合理的に追求すると仮定し、経済学の手法で政治的意思決定や政府の行動を分析する学問分野。「政治の経済学」とも呼ばれる。' +
      '政府が常に公益を実現するという前提（善意の独裁者）を疑い、政府の失敗（レントシーキング、官僚の予算最大化、特殊利益による政策歪曲、財政赤字バイアス等）を理論化した。ジェームズ・M・ブキャナンとゴードン・タロックが1962年の『公共選択の理論（The Calculus of Consent）』で基礎を築き、ブキャナンは1986年に「経済的・政治的意思決定の理論に関する契約的・憲法的基礎の発展」によりノーベル経済学賞を受賞した。アンソニー・ダウンズの投票・民主主義の経済分析とも関連する。',
    keyFigures: 'J.M.ブキャナン & G.タロック（1962『The Calculus of Consent』）／ブキャナン1986ノーベル経済学賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/public-choice-theory', type: 'reference', label: 'Encyclopaedia Britannica — Public-choice theory' },
      { url: 'https://www.econlib.org/library/Enc/PublicChoice.html', type: 'academic', label: 'Econlib, Concise Encyclopedia of Economics — Public Choice' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1986/buchanan/facts/', type: 'government', label: 'NobelPrize.org — James M. Buchanan 1986' },
    ],
  },
  {
    id: 'mgmt-expectancy-theory',
    discipline: 'management',
    title: '期待理論（ブルームのVIE理論, expectancy theory）',
    statement:
      '人の動機づけ（モチベーションの強さ）は、努力が成果につながるという「期待（Expectancy）」、成果が報酬をもたらすという「手段性（Instrumentality）」、その報酬がどれだけ魅力的かという「誘意性（Valence）」の3要素の積で決まるとする動機づけ理論。動機づけ＝期待×手段性×誘意性 と定式化され、3つのいずれかがゼロなら動機づけもゼロになる。' +
      'ビクター・ブルームが1964年の著書『Work and Motivation』で提唱した。報酬の魅力と達成可能性の主観的認知を重視する点が特徴である。後にポーター&ローラーが1968年の著書『Managerial Attitudes and Performance』で、能力・役割認識・報酬の公平性、および業績と満足の関係を加えて拡張した。マズローやハーズバーグの内容理論（人が何を求めるか）に対し、動機づけのプロセス（どう行動を選ぶか）に着目するプロセス理論に分類される。',
    keyFigures: 'ビクター・ブルーム（1964『Work and Motivation』）／拡張: ポーター&ローラー（1968）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ifm.eng.cam.ac.uk/research/dstools/vrooms-expectancy-theory/', type: 'academic', label: 'University of Cambridge IfM — Vroom’s expectancy theory' },
      { url: 'https://www.ebsco.com/research-starters/economics/expectancy-theory', type: 'academic', label: 'EBSCO Research Starters — Expectancy theory' },
      { url: 'https://journals.sagepub.com/doi/10.1177/21582440211021896', type: 'academic', label: 'SAGE Open (2021) — Valence–Instrumentality–Expectancy Model of Motivation' },
    ],
  },
  {
    id: 'human-milgram-obedience',
    discipline: 'human-science',
    title: 'ミルグラムの服従実験（Milgram experiment）',
    statement:
      '権威者の指示があれば、人は自らの良心に反してでも他者に有害な行為を行いうることを示した社会心理学の実験。スタンレー・ミルグラムが1961年（論文発表は1963年）にイェール大学で実施した。' +
      '被験者（教師役、新聞広告で募った男性40名）は実験者（権威）の指示で、間違えた「生徒役」（実はサクラ）に段階的に強い電気ショック（最大450ボルト、実際には電流は流れていない）を与えるよう求められた。多くの被験者が強い心理的葛藤を示しつつも、最初の実験では約65%（40名中26名）が最大電圧まで指示に従い続けた。ミルグラムはこれをホロコーストにおける一般人の加担の理解と結びつけて論じた（「悪の凡庸さ」の語自体はハンナ・アーレントによる）。一方、被験者に深刻な心理的苦痛を与え欺瞞を用いた点で研究倫理上の重大な批判（ダイアナ・バウムリンド1964）を招き、後の研究倫理審査（IRB）強化の契機の一つとなった。',
    keyFigures: 'スタンレー・ミルグラム（1961実施・1963発表、イェール大学）／倫理批判: ダイアナ・バウムリンド（1964）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/Milgram-experiment', type: 'reference', label: 'Encyclopaedia Britannica — Milgram experiment' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/14049516/', type: 'academic', label: 'Milgram (1963) Behavioral Study of Obedience, J. Abnormal and Social Psychology 67:371-378（原典）' },
      { url: 'https://www.open.edu/openlearn/society-politics-law/sociology/psychological-research-obedience-and-ethics/content-section-2.2', type: 'academic', label: 'The Open University — 服従研究の倫理的批判（バウムリンド）' },
    ],
  },
  {
    id: 'bizlaw-contract-nonconformity',
    discipline: 'business-law',
    title: '契約不適合責任（旧・瑕疵担保責任）',
    statement:
      '売買等で引き渡された目的物が種類・品質・数量に関して契約の内容に適合しない場合に、売主が買主に対して負う責任。2017年改正民法（2020年4月1日施行）により、従来の「瑕疵担保責任」が「契約不適合責任」へと再構成された。' +
      '買主は、(1)追完請求（目的物の修補・代替物の引渡し・不足分の引渡し、民法562条）、(2)代金減額請求（563条）、(3)損害賠償請求（564条が準用する415条）、(4)契約の解除（564条が準用する541条・542条）を行いうる。旧法と異なり契約不適合責任は債務不履行責任の一種として位置づけられ、種類・品質の不適合の場合、買主は不適合を知った時から1年以内にその旨を売主に通知する必要がある（566条。旧法の「権利行使」から「通知」へ緩和）。法定責任説から契約責任説への転換と整理される。',
    keyFigures: '契約不適合責任＝改正民法562条以下（2020施行）／追完562・代金減額563・損害賠償/解除564（→415・541・542）／通知1年566（種類・品質）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 — 民法（562条以下・566条）' },
      { url: 'https://www.businesslawyers.jp/practices/1048', type: 'media', label: 'BUSINESS LAWYERS — 民法改正と契約不適合責任条項' },
      { url: 'https://kigyobengo.com/media/useful/1618.html', type: 'media', label: '咲くやこの花法律事務所 — 契約不適合責任とは（責任内容・期間・免責）' },
    ],
  },
  {
    id: 'infosoc-gatekeeping',
    discipline: 'information-sociology',
    title: 'ゲートキーピング（門番機能, gatekeeping）',
    statement:
      '膨大な情報の中から、何をニュースとして報じ何を報じないかを、編集者・記者などメディア組織内の「門番（ゲートキーパー）」が選別・取捨選択する過程を指す。' +
      '社会心理学者クルト・レヴィンが、集団内の意思決定や情報・物資の流れを「チャネル」と「ゲート」で論じる研究の中でゲートキーパーの概念を提示し（1947年の論文「Frontiers in Group Dynamics」, Human Relations 誌）、その学生デヴィッド・マニング・ホワイトが1950年に新聞の電信ニュース担当編集者「ミスター・ゲイツ」の取捨選択を分析した古典的研究でマスコミ研究に応用した。報道の選択は個人の主観だけでなく、組織のルーチンやニュース価値、媒体の制約等にも規定される。議題設定理論とも密接に関連し、インターネット・SNS時代にはアルゴリズムやプラットフォームによる新たなゲートキーピングが論じられている。',
    keyFigures: 'クルト・レヴィン（1947 概念提示）／デヴィッド・マニング・ホワイト（1950 Mr.Gates研究でマスコミに応用）',
    asOf: '2026-06',
    sources: [
      { url: 'https://oxfordre.com/communication/display/10.1093/acrefore/9780190228613.001.0001/acrefore-9780190228613-e-290', type: 'academic', label: 'Oxford Research Encyclopedia of Communication — Gatekeeping' },
      { url: 'https://journals.sagepub.com/doi/10.1177/001872674700100201', type: 'academic', label: 'Lewin (1947) Frontiers in Group Dynamics, Human Relations 1(1):5-41（原典）' },
      { url: 'https://en.wikipedia.org/wiki/Gatekeeping_(communication)', type: 'reference', label: 'Wikipedia — Gatekeeping (communication)' },
    ],
  },
  {
    id: 'econ-income-substitution-effect',
    discipline: 'economics',
    title: '所得効果と代替効果',
    statement:
      'ある財の価格変化が需要量に与える影響（価格効果）を2つに分解したもの。代替効果は、相対価格の変化により相対的に安くなった財へ消費を振り替える効果で、効用（実質所得）を一定に保ったときの需要変化を指し、価格が下がった財の需要は必ず増える（代替効果は常に価格と逆方向）。' +
      '所得効果は、価格変化によって実質的な購買力（実質所得）が変化することで生じる需要変化。通常財（上級財）では両効果が同方向に働き需要曲線は右下がりになる。下級財（劣等財）では所得効果が代替効果と逆向きになり、所得効果が代替効果を上回るとギッフェン財（価格が下がると需要が減る）が生じうる。ロシアの経済学者エフゲニー・スルツキーが1915年に定式化（スルツキー分解）し、後にヒックスが効用一定の補償需要に基づく分解を確立した。価格効果＝代替効果＋所得効果。',
    keyFigures: 'エフゲニー・スルツキー（1915、スルツキー分解）／ヒックス（補償需要・ヒックス分解）／ギッフェン財との関連',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/substitution-effect', type: 'reference', label: 'Encyclopaedia Britannica — Substitution effect' },
      { url: 'https://www.britannica.com/topic/income-effect', type: 'reference', label: 'Encyclopaedia Britannica — Income effect' },
      { url: 'https://socialsci.libretexts.org/Bookshelves/Economics/Intermediate_Microeconomics_with_Excel_(Barreto)/04:_Compartive_Statics/4.06:_Income_and_Substitution_Effects', type: 'academic', label: 'LibreTexts, Intermediate Microeconomics — Income and Substitution Effects（Hicks/Slutsky）' },
    ],
  },
  {
    id: 'econ-diminishing-returns',
    discipline: 'economics',
    title: '収穫逓減の法則（限界生産力逓減）',
    statement:
      '他の生産要素を一定に保ったまま、ある可変的な生産要素（例：労働）の投入量を増やしていくと、ある点を超えると追加1単位の投入から得られる産出の増加分（限界生産物）が次第に減少していくという生産理論の法則。短期において少なくとも1つの固定的要素（例：土地・資本設備）が存在することが前提である。' +
      '当初は分業や設備の有効活用によって限界生産物が増加することもあるが、固定要素に対し可変要素が過剰になると逓減に転じる（さらに進むと限界生産物がゼロないし負となり、総生産物自体が減少しうる）。18世紀にチュルゴーが農業に即して指摘し、リカードやマルサスの古典派経済学（地代論・人口論）で重要な役割を果たした。消費の満足度に関する限界効用逓減の法則とは異なる概念である。',
    keyFigures: 'チュルゴー（18世紀の初期指摘）／マルサス（人口論）・リカード（地代論）で展開／限界効用逓減とは別概念',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/diminishing-returns', type: 'reference', label: 'Britannica Money — Diminishing returns' },
      { url: 'https://www.ebsco.com/research-starters/economics/diminishing-returns-economics', type: 'academic', label: 'EBSCO Research Starters — Diminishing returns (economics)' },
      { url: 'https://www.encyclopedia.com/finance/encyclopedias-almanacs-transcripts-and-maps/law-diminishing-returns', type: 'reference', label: 'Encyclopedia.com — Law of Diminishing Returns' },
    ],
  },
  {
    id: 'mgmt-stakeholder-theory',
    discipline: 'management',
    title: 'ステークホルダー理論（stakeholder theory）',
    statement:
      '企業は株主（シェアホルダー）だけでなく、従業員・顧客・取引先・地域社会・債権者など、企業活動に利害関係を持つ多様な「ステークホルダー（利害関係者）」全体の利益を考慮して経営されるべきだとする経営・倫理の理論。' +
      'フリーマンはステークホルダーを「組織の目的達成に影響を与えうる、または影響を受ける集団・個人」と定義した。株主の利益最大化を最優先するフリードマン流の株主価値説（Friedman doctrine）への対抗・補完として位置づけられる。R・エドワード・フリーマンが1984年の著書『Strategic Management: A Stakeholder Approach』で体系化・普及させた。CSR（企業の社会的責任）、ESG、コーポレートガバナンス、サステナビリティ経営の理論的基盤の一つで、記述的・規範的・道具的の3側面で論じられる。誰をステークホルダーとみなすか、利害が対立する際の優先順位づけが難しい等の批判もある。',
    keyFigures: 'R・エドワード・フリーマン（1984『Strategic Management: A Stakeholder Approach』）／対比: フリードマンの株主価値説',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.darden.virginia.edu/stakeholder-theory', type: 'academic', label: 'University of Virginia Darden School of Business — Stakeholder Theory（フリーマン所属機関）' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/stakeholder-theory-and-analysis', type: 'academic', label: 'EBSCO Research Starters — Stakeholder Theory and Analysis' },
      { url: 'https://en.wikipedia.org/wiki/Friedman_doctrine', type: 'reference', label: 'Wikipedia — Friedman doctrine（対比される株主価値説）' },
    ],
  },
  {
    id: 'human-group-polarization',
    discipline: 'human-science',
    title: '集団極化（集団分極化, group polarization）',
    statement:
      '集団で討議すると、討議後の集団の意見が、メンバーが当初もっていた意見の平均よりもより極端な方向へ移行する現象。集団がリスキーな方向へ傾く「リスキー・シフト」と、慎重な方向へ傾く「コーシャス・シフト」の双方を含む、より一般的な概念である。' +
      '機序として、討議中に自分の立場を支持する新たな論拠に接することで態度が強まるとする「説得的論拠説（persuasive arguments theory）」と、集団内で望ましいとされる立場へ自分を位置づけようとする「社会的比較説（social comparison theory）」の二つが主に挙げられ、両者は併存しうる。1961年のストーナーのリスキー・シフト研究を起点とし、モスコビッシとザヴァローニが1969年に「集団極化」と命名（JPSP 12:125-135）、D.マイヤーズらが研究を発展させた。陪審評議、政治的分極化、インターネット上のエコーチェンバーでの意見の過激化などの説明に用いられる。',
    keyFigures: 'ストーナー（1961 リスキー・シフト）／モスコビッシ & ザヴァローニ（1969 命名）／D.マイヤーズ',
    asOf: '2026-06',
    sources: [
      { url: 'https://dictionary.apa.org/group-polarization', type: 'academic', label: 'APA Dictionary of Psychology — Group polarization（米国心理学会）' },
      { url: 'https://www.scirp.org/reference/referencespapers?referenceid=2680487', type: 'academic', label: 'Moscovici & Zavalloni (1969) The Group as a Polarizer of Attitudes, JPSP 12:125-135（原典書誌）' },
      { url: 'https://en.wikipedia.org/wiki/Group_polarization', type: 'reference', label: 'Wikipedia — Group polarization' },
    ],
  },
  {
    id: 'bizlaw-apparent-agency',
    discipline: 'business-law',
    title: '表見代理',
    statement:
      '本来は代理権がない者（無権代理人）による行為であっても、本人に一定の帰責性があり、相手方が代理権の存在を信じたことに正当な理由（善意無過失）がある場合に、有効な代理行為と同様に本人に効果を帰属させ、取引の相手方と取引の安全を保護する制度。' +
      '民法は3類型を定める：(1)代理権授与の表示による表見代理（109条。本人が第三者に対し他人に代理権を与えた旨を表示した場合）、(2)権限外の行為の表見代理（110条。何らかの基本代理権を持つ者がその権限を越えて行為した場合）、(3)代理権消滅後の表見代理（112条。かつて代理権があったが消滅した後に行為がされた場合）。いずれも外観への本人の帰責性と相手方の善意無過失等の要件を満たすと本人が責任を負う。代理権が全くない無権代理（113条以下、本人の追認・相手方の催告権/取消権、117条の無権代理人の責任）とあわせて代理制度の重要論点を構成する。',
    keyFigures: '表見代理＝民法109条（授与表示）・110条（権限外）・112条（消滅後）／本人の帰責性＋相手方の善意無過失／関連: 無権代理113-117条',
    asOf: '2026-06',
    sources: [
      { url: 'https://elaws.e-gov.go.jp/document?lawid=129AC0000000089', type: 'government', label: 'e-Gov法令検索 — 民法（109条・110条・112条）' },
      { url: 'https://ocw.kyoto-u.ac.jp/wp-content/uploads/2021/04/2005_minpou-1_16.pdf', type: 'academic', label: '京都大学OCW 民法第1部 第16回 — 代理(3)表見代理の基本問題（松岡久和教授）' },
      { url: 'https://biz.moneyforward.com/contract/basic/17902/', type: 'media', label: 'マネーフォワード クラウド契約 — 表見代理と無権代理（成立要件・具体例）' },
    ],
  },
  {
    id: 'infosoc-symbolic-interactionism',
    discipline: 'information-sociology',
    title: '象徴的相互作用論（symbolic interactionism）',
    statement:
      '人間は事物に対し、それが自分にとって持つ「意味」に基づいて行為し、その意味は他者との社会的相互作用の中で生まれ、解釈の過程を通じて修正されていく、とする社会学の理論的立場。ミクロ社会学・解釈的アプローチの代表で、社会を客観的構造としてではなく、人々の相互行為と意味づけの過程として捉える。' +
      'ジョージ・ハーバート・ミードの自我・役割取得の理論を源流とし、その学生ハーバート・ブルーマーが1937年に「シンボリック相互作用論」と命名、1969年の著書で3つの基本前提として体系化した：(1)人間は事物が持つ意味に基づいて行為する、(2)その意味は社会的相互作用から生じる、(3)意味は解釈の過程を通じて扱われ修正される。アーヴィング・ゴッフマンのドラマトゥルギー（自己呈示・印象操作・役割演技）もこの系譜にあり、ラベリング理論など逸脱研究にも影響を与えた。',
    keyFigures: 'G.H.ミード（源流）／H.ブルーマー（1937命名・1969体系化）／関連: E.ゴッフマン（ドラマトゥルギー）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.encyclopedia.com/social-sciences-and-law/sociology-and-social-reform/sociology-general-terms-and-concepts/symbolic-interactionism', type: 'reference', label: 'Encyclopedia.com — Symbolic Interactionism（ミード起源・ブルーマー1937命名）' },
      { url: 'https://www.cambridge.org/core/books/abs/cambridge-handbook-of-social-theory/symbolic-interactionism/AF7CEEEDDD2193573F45E2E5CB30B633', type: 'academic', label: 'The Cambridge Handbook of Social Theory, Ch.11 — Symbolic Interactionism' },
      { url: 'https://pressbooks.montgomerycollege.edu/commtheory/chapter/chapter-5-symbolic-interactionism-george-herbert-mead-herbert-blumer/', type: 'academic', label: 'Montgomery College — Symbolic Interactionism: Mead & Blumer（3前提）' },
    ],
  },
  {
    id: 'econ-fisher-equation',
    discipline: 'economics',
    title: 'フィッシャー方程式（フィッシャー効果）',
    statement:
      '名目金利・実質金利・期待インフレ率の関係を表す式。アメリカの経済学者アーヴィング・フィッシャーにちなむ。近似的に「名目金利 ≒ 実質金利 ＋ 期待インフレ率」で表され、厳密には (1+名目)=(1+実質)(1+期待インフレ) の関係をもつ。実質金利は名目金利から期待インフレ率を差し引いたものとして事前的（ex ante）に定義される。' +
      'フィッシャーは実質金利が貨幣的要因から独立であると考え、ここから期待インフレ率が上昇すると名目金利がほぼ同幅で上昇し実質金利は長期的にほぼ一定に保たれるという「フィッシャー効果」が導かれる。実務では物価連動債（TIPS）と通常国債の利回り差（ブレークイーブン・インフレ率）から期待インフレを推計する応用がある（ただし当該差にはリスク・流動性プレミアムも含まれうる）。短期や名目硬直性のもとでは完全には成立しないとの議論もある。',
    keyFigures: 'アーヴィング・フィッシャー／名目金利≒実質金利+期待インフレ率（厳密には(1+i)=(1+r)(1+π^e)）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Irving-Fisher', type: 'reference', label: 'Britannica Money — Irving Fisher' },
      { url: 'https://en.wikipedia.org/wiki/Fisher_equation', type: 'reference', label: 'Wikipedia — Fisher equation' },
      { url: 'https://en.wikipedia.org/wiki/Fisher_effect', type: 'reference', label: 'Wikipedia — Fisher effect（フィッシャー仮説・名目金利の調整）' },
    ],
  },
  {
    id: 'econ-business-cycles',
    discipline: 'economics',
    title: '景気循環とその諸波動',
    statement:
      '経済活動（生産・雇用・所得など）が、拡張（好況）→後退→収縮（不況）→回復という局面を周期的に繰り返す変動を景気循環という。各局面は「景気の山」と「谷」によって画される。' +
      '要因や周期の長さにより複数の波動が区別される。在庫変動に起因する約40か月周期のキチン循環（短期波動）、設備投資に起因する約10年周期のジュグラー循環（主循環）、建設投資・人口移動に起因する約20年周期のクズネッツ循環、技術革新に起因する約50年周期のコンドラチェフ循環（長期波動）である。シュンペーターはキチン・ジュグラー・コンドラチェフの三循環を統合する図式を提示し、技術革新（イノベーション）を景気循環の原動力とみなした。日本では内閣府（経済社会総合研究所）が景気動向指数に基づき景気基準日付（山・谷）を事後的に認定している。',
    keyFigures: 'キチン(約40か月)・ジュグラー(約10年・主循環)・クズネッツ(約20年)・コンドラチェフ(約50年)／統合: シュンペーターの三循環図式',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/business-cycle', type: 'reference', label: 'Britannica Money — Business cycle（四循環の定義・周期）' },
      { url: 'https://www.esri.cao.go.jp/jp/stat/di/hiduke.html', type: 'government', label: '内閣府 経済社会総合研究所 — 景気基準日付（山・谷の事後認定）' },
      { url: 'https://www.jshet.net/old/annals/het47-50/4901/legrandandhagemann4901.pdf', type: 'academic', label: 'Le Grand & Hagemann — Business Cycles in Juglar and Schumpeter（経済学史学会）' },
    ],
  },
  {
    id: 'mgmt-experience-curve',
    discipline: 'management',
    title: '経験曲線効果・学習曲線（experience/learning curve）',
    statement:
      '製品の累積生産量が倍増するごとに、単位あたりの実質コストが一定の割合（典型的には10〜30%程度）で低下していくという経験則。源流は1936年にT.P.ライト（Curtiss-Wrightの技術者）が航空機製造で見出した「学習曲線」で、累積生産量が倍増するたびに1機あたりの必要労働時間が約20%低下することを示した。' +
      'ボストン・コンサルティング・グループ（BCG）は1960年代後半（半導体のコスト分析を契機）に、これを製造だけでなく管理・流通・マーケティング等を含む企業全体の付加価値コストへ拡張し「経験曲線」として一般化した。コスト低下の要因は習熟・作業改善・標準化・規模の経済・技術革新等とされる。創業者B.ヘンダーソンは「先発して累積生産量（市場シェア）を増やせば自己強化的なコスト優位を築ける」と論じ、これがBCGのプロダクト・ポートフォリオ・マネジメント（PPM）の理論的根拠となった。ただし全産業に一律に当てはまるわけではない。',
    keyFigures: 'T.P.ライト（1936 学習曲線・航空機で約20%低下）／BCG・B.ヘンダーソン（1960年代後半に経験曲線として一般化・1968公表、20〜30%）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.bcg.com/publications/1968/business-unit-strategy-growth-experience-curve', type: 'reference', label: 'BCG — The Experience Curve（1968 オリジナル/Perspectives, 一次出典）' },
      { url: 'https://en.wikipedia.org/wiki/Experience_curve_effects', type: 'reference', label: 'Wikipedia — Experience curve effects（Wright 1936 / BCG 1960s）' },
      { url: 'https://en.wikipedia.org/wiki/Theodore_Paul_Wright', type: 'reference', label: 'Wikipedia — Theodore Paul Wright（1936論文・Curtiss-Wright）' },
    ],
  },
  {
    id: 'human-fundamental-attribution-error',
    discipline: 'human-science',
    title: '基本的帰属の誤り（対応バイアス, fundamental attribution error）',
    statement:
      '他者の行動の原因を説明する際に、状況的要因（外的要因）の影響を過小評価し、その人の性格・能力・態度といった内的・気質的要因を過大評価する傾向。たとえば遅刻した人を見て「渋滞」（状況）より「だらしない性格」（気質）のせいだと考えやすい。' +
      '社会心理学者リー・ロスが1977年にこの語を提唱した。ジョーンズとハリス（1967）の実験——被験者に、書き手が強制的に書かされたと知らされた意見文でも書き手の本心（態度）だと推測する傾向＝対応バイアス——が古典的根拠とされる。自分の行動は状況のせい、他者の行動は性格のせいと考える「行為者-観察者バイアス」とも関連する。なお西洋（個人主義）文化で強く、東アジア（集団主義）文化では弱いという文化差の指摘もある。',
    keyFigures: 'リー・ロス（1977 命名）／エドワード・ジョーンズ & ヴィクター・ハリス（1967 対応バイアス実験）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/fundamental-attribution-error', type: 'reference', label: 'Encyclopaedia Britannica — Fundamental attribution error' },
      { url: 'https://en.wikipedia.org/wiki/Fundamental_attribution_error', type: 'reference', label: 'Wikipedia — Fundamental attribution error（ロス1977・ジョーンズ&ハリス1967・文化差）' },
      { url: 'https://sk.sagepub.com/ency/edvol/download/socialpsychology/chpt/fundamental-attribution-error.pdf', type: 'academic', label: 'SAGE Encyclopedia of Social Psychology — Fundamental Attribution Error' },
    ],
  },
  {
    id: 'bizlaw-limited-liability',
    discipline: 'business-law',
    title: '株主有限責任の原則',
    statement:
      '株式会社の株主は、その有する株式の引受価額（出資額）を限度として会社に対して責任を負うのみで、会社の債務について会社債権者に対し直接には責任を負わない、という会社法の基本原則である（会社法104条「株主の責任は、その有する株式の引受価額を限度とする」）。' +
      '株主は出資額を超えて私財で会社の借金を弁済する義務がなく、これによって出資者のリスクを限定し、広く資本を集めて大規模な事業を可能にする近代株式会社制度の中核的特徴をなす。前提として、会社は株主から独立した法人格を持つ（法人格・所有と経営の分離）。株主の責任は会社を介した「間接有限責任」であり、会社財産で弁済できない場合に直接の弁済を迫られる持分会社（合名会社等）の無限責任社員とは対照的である。例外として、法人格が形骸化・濫用されている場合に株主の責任を問う「法人格否認の法理」がある。',
    keyFigures: '株主有限責任＝会社法104条／前提: 法人格・所有と経営の分離／間接有限責任／例外: 法人格否認の法理',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 — 会社法 第104条（株主の責任）' },
      { url: 'https://kotobank.jp/word/%E6%A0%AA%E4%B8%BB%E6%9C%89%E9%99%90%E8%B2%AC%E4%BB%BB%E3%81%AE%E5%8E%9F%E5%89%87-167490', type: 'reference', label: 'コトバンク — 株主有限責任の原則（間接有限責任の定義）' },
      { url: 'https://ja.wikibooks.org/wiki/%E4%BC%9A%E7%A4%BE%E6%B3%95%E7%AC%AC104%E6%9D%A1', type: 'reference', label: 'Wikibooks — 会社法第104条（条文・解説）' },
    ],
  },
  {
    id: 'infosoc-lippmann-pseudo-environment',
    discipline: 'information-sociology',
    title: '擬似環境とステレオタイプ（リップマン『世論』）',
    statement:
      'ジャーナリストのウォルター・リップマンが1922年の著書『世論（Public Opinion）』で示した概念。現実の環境はあまりに複雑で広大なため人が直接知ることはできず、人々はメディアの報道などを通じて頭の中に作り上げた「擬似環境（pseudo-environment）」に対して反応・行動する。' +
      'その際、人は世界を単純化して把握するために紋切り型の固定観念＝「ステレオタイプ（stereotype）」を用いる（この語を印刷用語から借り、現代的な社会的意味で普及させたのもリップマンとされる）。同書冒頭「外界と頭の中の像（The World Outside and the Pictures in Our Heads）」が示すように、外界と「我々の頭の中の像」とのズレが世論形成の鍵となる。メディアが現実認識を媒介するというこの視点は、後の議題設定理論（マコームズ&ショー）や培養理論（ガーブナー）などメディア効果研究の源流の一つとされる。',
    keyFigures: 'ウォルター・リップマン（1922『世論（Public Opinion）』）／擬似環境・ステレオタイプ・頭の中の像',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Walter-Lippmann', type: 'reference', label: 'Encyclopaedia Britannica — Walter Lippmann（Public Opinion）' },
      { url: 'https://en.wikipedia.org/wiki/Public_Opinion_(book)', type: 'reference', label: 'Wikipedia — Public Opinion (book, 1922)（擬似環境・頭の中の像）' },
      { url: 'https://www.gutenberg.org/ebooks/6456', type: 'academic', label: 'Project Gutenberg — Walter Lippmann, Public Opinion (1922) 全文（原典）' },
    ],
  },
  {
    id: 'econ-money-creation',
    discipline: 'economics',
    title: '信用創造と貨幣乗数',
    statement:
      '信用創造とは、銀行システムが預金の受け入れと貸出を繰り返すことで、当初の本源的預金（マネタリーベース）の何倍もの預金通貨を生み出す仕組みである。伝統的な教科書の説明では、銀行は預金の一定割合を準備金として残し残りを貸し出し、貸出資金が別の銀行に再預金される過程が繰り返され、預金総額は理論上、準備率の逆数（1/準備率＝貨幣乗数）倍まで拡大する（準備率10%なら乗数10）。' +
      'ただしイングランド銀行が2014年に公表した解説「Money creation in the modern economy」等、現代の中央銀行は「現実には銀行は貸出を実行する際に同額の新たな預金を同時に創造しており（loans create deposits）、準備預金が貸出を制約する乗数モデルは現実の因果と逆である」と指摘する。むしろ貨幣供給は経済の需要に応じて内生的に決まり、貸出は収益機会・自己資本規制・中央銀行の政策金利によって規律されると説明する（米セントルイス連銀も2021年「R.I.P. Money Multiplier」で同様に乗数モデルの見直しを論じた）。',
    keyFigures: '貨幣乗数モデル（伝統的教科書, 1/準備率）／批判: イングランド銀行2014・St.Louis Fed 2021（内生的貨幣供給論・loans create deposits）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.bankofengland.co.uk/-/media/boe/files/quarterly-bulletin/2014/money-creation-in-the-modern-economy', type: 'government', label: 'Bank of England Quarterly Bulletin 2014 Q1 — Money creation in the modern economy（一次資料）' },
      { url: 'https://www.stlouisfed.org/publications/page-one-economics/2021/09/17/teaching-the-linkage-between-banks-and-the-fed-r-i-p-money-multiplier', type: 'government', label: 'St. Louis Fed (2021) — R.I.P. Money Multiplier' },
      { url: 'https://en.wikipedia.org/wiki/Money_multiplier', type: 'reference', label: 'Wikipedia — Money multiplier（貨幣乗数=マネーサプライ/マネタリーベース・1/準備率）' },
    ],
  },
  {
    id: 'econ-deadweight-loss',
    discipline: 'economics',
    title: '死荷重（死重損失・超過負担）',
    statement:
      '市場が完全競争の均衡から乖離することで失われる、社会的余剰（消費者余剰＋生産者余剰）の正味の損失。課税・補助金・価格規制（上限/下限）・独占・外部性などが、取引量を社会的に最適な水準から減少（または過剰化）させることで生じる。' +
      '需要曲線と供給曲線で囲まれた三角形（ハーバーガーの三角形）の面積で図示される。たとえば物品税を課すと取引量が減り、課税前なら成立していた相互利益的な取引が失われ、その厚生損失は政府の税収にも誰の便益にもならない＝「死んだ」損失となる。税の超過負担（excess burden）とも呼ばれ、効率的な税制設計（課税の歪みを最小化）の議論の基礎となる。アーノルド・ハーバーガーの分析（1950〜60年代）で知られる。',
    keyFigures: '社会的余剰の正味損失／ハーバーガーの三角形／税の超過負担（最適課税論の基礎）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Deadweight_loss', type: 'reference', label: 'Wikipedia — Deadweight loss' },
      { url: 'https://gspp.berkeley.edu/assets/uploads/courses/notes/Lec2-DWL-Optimal-Tax.pdf', type: 'academic', label: 'UC Berkeley GSPP, Public Economics — Deadweight Loss & Optimal Taxation（講義ノート）' },
      { url: 'https://link.springer.com/rwe/10.1057/978-1-349-95121-5_2374-1', type: 'academic', label: 'New Palgrave Dictionary of Economics (Springer) — Excess Burden of Taxation' },
    ],
  },
  {
    id: 'mgmt-goal-setting-theory',
    discipline: 'management',
    title: '目標設定理論（goal-setting theory）',
    statement:
      '具体的で挑戦的（困難）な目標は、曖昧な目標（「ベストを尽くせ」）や容易な目標、あるいは目標なしの状態よりも高い業績をもたらす、とする動機づけ理論。目標は注意と行動を方向づけ、努力を喚起し、粘り強さ（持続）を高め、課題に適した方略の探索・活用を促す、という4つのメカニズムを通じて作用する。' +
      'エドウィン・ロックとゲイリー・ラサムが1960年代後半からの一連の実証研究を統合し、1990年の著作『A Theory of Goal Setting and Task Performance』で体系化した。効果を高める条件（モデレーター）として、目標達成へのコミットメント、達成度のフィードバック、課題の複雑さ、能力、自己効力感などが挙げられる。実務の「SMART目標」や目標による管理（MBO）の基礎理論をなす。ただし過度に困難・多数の目標は、視野狭窄、リスク選好の歪み、非倫理的行動、学習や本来業務の阻害を招きうるとの批判（Ordóñezら2009「Goals Gone Wild」）もある。',
    keyFigures: 'エドウィン・ロック & ゲイリー・ラサム（1960年代後半〜・1990体系化）／批判: Ordóñezら（2009）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www-2.rotman.utoronto.ca/facbios/file/09%20-%20Locke%20&%20Latham%202002%20AP.pdf', type: 'academic', label: 'Locke & Latham (2002) Building a Practically Useful Theory…A 35-Year Odyssey, American Psychologist 57(9):705-717' },
      { url: 'https://eric.ed.gov/?id=EJ654871', type: 'academic', label: 'ERIC（米国教育省）— Locke & Latham (2002) 書誌' },
      { url: 'https://journals.aom.org/doi/10.5465/amp.2009.37007999', type: 'academic', label: 'Ordóñez et al. (2009) Goals Gone Wild, Academy of Management Perspectives 23(1):6-16（批判）' },
    ],
  },
  {
    id: 'human-delay-of-gratification',
    discipline: 'human-science',
    title: 'マシュマロ・テスト（満足の遅延, delay of gratification）',
    statement:
      '目先の小さな報酬（マシュマロ1個を今すぐ）を我慢すれば後でより大きな報酬（待てば2個）が得られる状況で、幼児がどれだけ自制し満足を遅延できるかを測る実験。ウォルター・ミシェルが1960〜70年代にスタンフォード大学で考案・実施した。' +
      'Shoda・Mischel・Peake（1990）らによる追跡研究では、待てた子どもほど後年の学業成績（SATスコア）や社会的・認知的能力が高い傾向が報告され、自制心・実行機能の重要性を示す例として広く知られた。ただし2018年のWatts・Duncan・Quanによる大規模かつ多様なサンプルでの概念的再現研究では、4歳時の待機時間と青年期の学力との相関は当初報告の約半分にとどまり、家庭の社会経済的背景・早期の認知能力・家庭環境を統制すると約3分の2減少した。満足遅延と後年の成果との関連は当初考えられたほど強固ではなく、解釈には慎重さが求められる。',
    keyFigures: 'ウォルター・ミシェル（1960-70年代スタンフォード）／追跡: Shoda, Mischel & Peake (1990)／再現研究: Watts, Duncan & Quan (2018)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Walter-Mischel', type: 'reference', label: 'Encyclopaedia Britannica — Walter Mischel' },
      { url: 'https://journals.sagepub.com/doi/abs/10.1177/0956797618761661', type: 'academic', label: 'Watts, Duncan & Quan (2018) Revisiting the Marshmallow Test, Psychological Science（再現研究）' },
      { url: 'https://depts.washington.edu/shodalab/wordpress/wp-content/uploads/2015/05/1990.PredictingAdolescent_Shoda.pdf', type: 'academic', label: 'Shoda, Mischel & Peake (1990), Developmental Psychology（原著の追跡研究）' },
    ],
  },
  {
    id: 'bizlaw-labor-standards',
    discipline: 'business-law',
    title: '労働基準法（労働時間・36協定）',
    statement:
      '労働条件の最低基準を定める日本の基本的労働法。法定労働時間は原則1日8時間・1週40時間（32条）。これを超えて時間外労働・休日労働をさせるには、労使協定（いわゆる36協定、36条）を締結し労働基準監督署に届け出る必要がある。' +
      '時間外・休日・深夜労働には割増賃金の支払い義務がある（37条。時間外は2割5分以上、月60時間超の時間外は5割以上、休日は3割5分以上、深夜は2割5分以上）。2018年の働き方改革関連法により、36協定でも超えられない時間外労働の罰則付き上限（原則月45時間・年360時間、特別条項でも年720時間以下・休日労働含む複数月平均80時間以内・単月100時間未満・限度超は年6か月まで）が法定された（大企業2019年4月〜、中小企業2020年4月〜）。違反には罰則。年次有給休暇（39条）等も定める。',
    keyFigures: '労基法32条(法定労働時間 8h/日・40h/週)・36条(36協定)・37条(割増賃金)・39条(年休)／働き方改革2018(時間外上限規制)／厚生労働省所管',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/index.html', type: 'government', label: '厚生労働省 — 労働時間・休日（法定労働時間8h/日・週40h・36協定）' },
      { url: 'https://www.startup-roudou.mhlw.go.jp/36_pact.html', type: 'government', label: '厚生労働省 — 時間外労働の上限について（36協定・月45h/年360h・特別条項）' },
      { url: 'https://www.mhlw.go.jp/content/000463185.pdf', type: 'government', label: '厚生労働省 — 時間外労働の上限規制 わかりやすい解説（年720h以下・複数月平均80h・単月100h未満）' },
    ],
  },
  {
    id: 'infosoc-media-framing',
    discipline: 'information-sociology',
    title: 'フレーミング（メディアのフレーム分析, framing）',
    statement:
      'メディアが出来事や争点を報道する際に、現実の特定の側面を選択して強調し、他の側面を背景化することで、受け手の問題認識・原因解釈・道徳的評価・解決策の理解を方向づける効果。同じ事実でも「枠組み（フレーム）」の与え方によって受け止め方が変わる。' +
      '社会学者アーヴィング・ゴッフマンの『フレーム分析』(1974)が源流とされ、彼はフレームを経験を整理する「解釈の図式（schemata of interpretation）」と捉えた。これをメディア研究に展開したロバート・エントマンは1993年の論文（Journal of Communication 43(4):51-58）で、フレーミングを「選択（selection）」と「際立たせ（salience）」の観点から定義し、(1)問題の定義、(2)原因の診断、(3)道徳的評価、(4)解決策の提示という4つの機能を整理した。議題設定理論の第二レベル（属性アジェンダ設定）と密接に関連し、政治コミュニケーション・世論研究で重要な概念である。なお人間科学の「フレーミング効果（トベルスキー&カーネマン）」とは別の社会学的・メディア論的概念。',
    keyFigures: 'アーヴィング・ゴッフマン『フレーム分析』(1974, 源流)／ロバート・エントマン(1993, 選択・際立たせ・4機能)',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/joc/article-abstract/43/4/51/4160153', type: 'academic', label: 'Entman (1993) Framing: Toward Clarification of a Fractured Paradigm, Journal of Communication 43(4):51-58' },
      { url: 'https://eric.ed.gov/?id=EJ475698', type: 'academic', label: 'ERIC EJ475698 — Entman (1993) Framing' },
      { url: 'https://en.wikipedia.org/wiki/Frame_analysis', type: 'reference', label: 'Wikipedia — Frame analysis（Goffman 1974 を源流とするフレーム分析）' },
    ],
  },
  {
    id: 'econ-permanent-income-hypothesis',
    discipline: 'economics',
    title: '恒常所得仮説（permanent income hypothesis）',
    statement:
      '人々の消費は、その時々の現在所得ではなく、生涯にわたって期待される平均的・長期的な所得＝「恒常所得（permanent income）」に基づいて決定されるとする消費理論。所得を恒常所得と一時的な「変動所得（transitory income）」に分け、変動所得（臨時ボーナス・宝くじ等）の多くは消費されず貯蓄に回るため、短期の限界消費性向は長期より小さくなると説明する。' +
      'ミルトン・フリードマンが1957年の著作『A Theory of the Consumption Function（消費の経済理論）』で提唱した。ケインズの絶対所得仮説（消費は現在所得の関数）では説明できない実証的パズル（平均消費性向と限界消費性向の食い違い）を解き、モディリアーニのライフサイクル仮説と並ぶ消費理論の代表とされる。一時的な減税が消費を大きく刺激しにくいという政策含意をもつ。フリードマンはこの消費分析を含む業績で1976年ノーベル経済学賞を受賞した。',
    keyFigures: 'ミルトン・フリードマン（1957）／対比: ケインズの絶対所得仮説・モディリアーニのライフサイクル仮説／1976ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/permanent-income-hypothesis', type: 'reference', label: 'Encyclopaedia Britannica — Permanent income hypothesis' },
      { url: 'https://www.nber.org/system/files/chapters/c4405/c4405.pdf', type: 'academic', label: 'NBER — The Permanent Income Hypothesis（Friedman, A Theory of the Consumption Function 所収）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1976/press-release/', type: 'government', label: 'NobelPrize.org — 1976年経済学賞 Milton Friedman（消費分析の業績）' },
    ],
  },
  {
    id: 'econ-oligopoly-cournot',
    discipline: 'economics',
    title: '寡占とクールノー競争（oligopoly / Cournot competition）',
    statement:
      '少数の企業が市場を支配する市場形態＝寡占では、各企業の意思決定が相互に影響し合う（相互依存）ため、ライバルの反応を考慮した戦略的行動が分析の中心となる。' +
      '代表的モデルとして、各企業が「生産量」を戦略変数とし、相手の生産量を所与として自社の利潤を最大化するクールノー競争（アントワーヌ・クールノー、1838『富の理論の数学的原理に関する研究』）があり、均衡（クールノー＝ナッシュ均衡）では各社の生産量が互いの最適反応となり、価格は完全競争より高く独占より低くなる。価格を戦略変数とするベルトラン競争、一方が先導するシュタッケルベルク競争などの派生がある。寡占企業は明示的・暗黙的に協調（カルテル・価格先導）してより独占に近い利潤を狙うこともあるが、各社に裏切りの誘因が働くため安定は難しい（囚人のジレンマ構造）。',
    keyFigures: 'アントワーヌ・クールノー（1838 生産量競争）／ベルトラン（価格競争）・シュタッケルベルク（先導者-追随者）／クールノー＝ナッシュ均衡',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Antoine-Augustin-Cournot', type: 'reference', label: 'Encyclopaedia Britannica — Antoine-Augustin Cournot（複占・均衡分析）' },
      { url: 'https://ocw.mit.edu/courses/14-01sc-principles-of-microeconomics-fall-2011/pages/unit-5-monopoly-and-oligopoly/oligopoly-ii/', type: 'academic', label: 'MIT OpenCourseWare — Principles of Microeconomics, Oligopoly II（クールノー均衡・ベルトラン・カルテル）' },
      { url: 'https://www.britannica.com/topic/Researches-into-the-Mathematical-Principles-of-the-Theory-of-Wealth', type: 'reference', label: 'Encyclopaedia Britannica — Researches into the Mathematical Principles of the Theory of Wealth (1838)' },
    ],
  },
  {
    id: 'mgmt-job-characteristics',
    discipline: 'management',
    title: '職務特性モデル（ハックマン&オルダム）',
    statement:
      '職務そのものが持つ特性が、従業員の内発的動機づけ・職務満足・業績を高める仕組みを説明する組織行動論の職務設計モデル。5つの中核的職務特性すなわち(1)技能多様性(skill variety)、(2)タスク完結性(task identity)、(3)タスク重要性(task significance)、(4)自律性(autonomy)、(5)フィードバック(feedback)が、3つの重要な心理状態（仕事の有意味感・結果への責任感・結果の認識）を媒介として生じさせ、それが高い内発的動機づけ・職務満足・仕事の質、ならびに低い離職率・欠勤につながるとする。' +
      '前者3特性は有意味感に、自律性は責任感に、フィードバックは結果の認識に主に対応する。5特性から「動機づけ可能性指数（MPS）」が算出され、MPS＝((技能多様性+タスク完結性+タスク重要性)/3)×自律性×フィードバック で表される（自律性とフィードバックは乗法的でいずれかがゼロならMPSもゼロ）。さらに従業員の「成長欲求の強さ（GNS）」が効果を調整する。J.リチャード・ハックマンとグレッグ・オルダムが1976年論文・1980年著書『Work Redesign』で提唱し、職務充実（job enrichment）の理論的基盤となった。',
    keyFigures: 'J.リチャード・ハックマン & グレッグ・オルダム（1976/1980『Work Redesign』）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100021207', type: 'academic', label: 'Oxford Reference — Job Characteristics Model' },
      { url: 'https://www.sciencedirect.com/topics/psychology/job-characteristics', type: 'academic', label: 'ScienceDirect Topics — Job Characteristics' },
      { url: 'https://books.google.com/books/about/Work_Redesign.html?id=MhpPAAAAMAAJ', type: 'reference', label: 'Hackman & Oldham, Work Redesign (Addison-Wesley, 1980) — 一次文献（書誌）' },
    ],
  },
  {
    id: 'human-self-efficacy',
    discipline: 'human-science',
    title: '自己効力感（self-efficacy）',
    statement:
      'ある課題や状況において、必要な行動をうまく遂行できるという、自分の能力に対する主観的な確信・信念。心理学者アルバート・バンデューラが1977年の論文で提唱し、社会的認知理論（social cognitive theory）の中核概念とした。自己効力感が高いほど、困難な課題に挑戦し、努力を持続し、ストレス下でも粘り強く行動する傾向がある。' +
      '効力感を形成する主な情報源は、(1)達成経験（自分で成功した経験。最も強力）、(2)代理経験（他者の成功の観察・モデリング）、(3)言語的説得（他者からの励まし）、(4)生理的・情動的状態（緊張や気分の解釈）の4つである。「結果期待（ある行動が特定の結果を生むという予期）」とは区別される——人は何をすれば成功するかを理解していても、それを実行できるかを疑うことがあるためである。教育・健康行動・キャリア・臨床（不安や恐怖症の治療）など広範な領域に応用されている。',
    keyFigures: 'アルバート・バンデューラ（1977）／社会的認知理論／4つの情報源（達成経験・代理経験・言語的説得・生理的情動的状態）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.apa.org/research-practice/conduct-research/self-efficacy-human-agency', type: 'academic', label: 'American Psychological Association (APA) — Self-efficacy: the theory at the heart of human agency' },
      { url: 'https://www.britannica.com/biography/Albert-Bandura', type: 'reference', label: 'Encyclopaedia Britannica — Albert Bandura' },
      { url: 'https://en.wikipedia.org/wiki/Self-efficacy', type: 'reference', label: 'Wikipedia — Self-efficacy' },
    ],
  },
  {
    id: 'bizlaw-good-faith-principle',
    discipline: 'business-law',
    title: '信義誠実の原則（信義則）',
    statement:
      '権利の行使及び義務の履行は、信義に従い誠実に行わなければならない、とする民法の基本原則（民法1条2項）。私法全体を貫く一般条項・帝王条項であり、具体的な規定がない場面でも当事者間の信頼を保護し、形式的な権利行使が実質的な公平に反する場合にこれを修正する機能を持つ。' +
      '判例・学説により多くの派生原則が発展しており、自らの先行行為と矛盾する態度を禁じる「禁反言（エストッペル）の法理」、長期間の権利不行使の後の突然の行使を制限する「権利失効の原則」、契約締結前の交渉段階における「契約締結上の過失」、契約後の著しい事情変動に対応する「事情変更の原則」などが導かれる。民法1条には信義則のほか、公共の福祉（1項）・権利濫用の禁止（3項）も定められ、これらと並ぶ民法の指導原理を構成する。',
    keyFigures: '信義誠実の原則＝民法1条2項／派生: 禁反言・権利失効・契約締結上の過失・事情変更の原則／民法1条(公共の福祉/権利濫用の禁止)',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 — 民法 第1条（公共の福祉・信義誠実の原則・権利濫用の禁止）' },
      { url: 'https://ja.wikibooks.org/wiki/%E6%B0%91%E6%B3%95%E7%AC%AC1%E6%9D%A1', type: 'reference', label: 'Wikibooks — 民法第1条（条文・基本原則の解説）' },
      { url: 'https://www.nta.go.jp/about/organization/ntc/kenkyu/ronsou/08/67/hajimeni.htm', type: 'government', label: '国税庁 税務大学校 研究論叢 — 税法における信義則の適用について' },
    ],
  },
  {
    id: 'infosoc-strength-of-weak-ties',
    discipline: 'information-sociology',
    title: '弱い紐帯の強さ（the strength of weak ties）',
    statement:
      '新規で有用な情報（例：就職・転職の機会）は、家族や親友のような結びつきの強い「強い紐帯（strong ties）」よりも、知人や薄いつながりの「弱い紐帯（weak ties）」を通じてもたらされやすい、という社会ネットワーク論の知見。' +
      '強い紐帯どうしは互いに重複した同質的な情報の中に閉じがちなのに対し、弱い紐帯は異なる社会集団（クラスター）を架橋する「ブリッジ」として、新しい情報や多様な機会を運ぶ。社会学者マーク・グラノヴェッターが1973年の論文「The Strength of Weak Ties」(American Journal of Sociology 78(6):1360-1380)で提唱し、職に就いた男性282名への調査で多くが弱い紐帯経由で職を見つけた事実を示した。情報拡散・イノベーション普及・コミュニティ統合の研究に大きな影響を与えた（2022年にはScience誌で大規模な因果検証も行われた）。',
    keyFigures: 'マーク・グラノヴェッター（1973, American Journal of Sociology 78(6):1360-1380）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.journals.uchicago.edu/doi/abs/10.1086/225469', type: 'academic', label: 'Granovetter (1973) The Strength of Weak Ties, AJS 78(6):1360-1380（原典・University of Chicago Press）' },
      { url: 'https://news.stanford.edu/stories/2023/07/strength-weak-ties', type: 'academic', label: 'Stanford Report — The strength of weak ties（50周年解説、就職調査282名）' },
      { url: 'https://www.science.org/doi/10.1126/science.abl4476', type: 'academic', label: 'Rajkumar et al. (2022) A causal test of the strength of weak ties, Science（実証的追試）' },
    ],
  },
  {
    id: 'econ-efficiency-wage',
    discipline: 'economics',
    title: '効率賃金仮説（efficiency wage hypothesis）',
    statement:
      '企業が市場の均衡賃金より高い賃金を支払うことが、かえって企業にとって合理的・効率的になりうるとする労働経済学の理論。通常と因果が逆転し、賃金が生産性の関数ではなく、生産性が賃金の関数となる。' +
      '高賃金が生産性を高める経路として、(1)怠業（シャーキング）の防止＝シャピロ＝スティグリッツのサボリ模型（解雇に伴う失業のコストを高めることで勤勉を促し、失業が「労働規律装置」として機能する）、(2)離職率の低下による採用・訓練費用の節約、(3)有能な人材の自己選択による逆選択の緩和、(4)忠誠心・士気の向上（アカロフの贈与交換モデル）、が挙げられる。結果として賃金は下方硬直的となり、労働市場で非自発的失業が均衡的に発生しうることを説明し、ニューケインジアン経済学の柱の一つとなった。歴史的事例としてフォードが1914年に導入した日給5ドル（当時の相場の約2倍）が引かれる。',
    keyFigures: 'シャピロ&スティグリッツ（1984 サボリ模型）／アカロフ&イエレン（贈与交換・効率賃金、アカロフ1982 QJE）／例: フォード1914年5ドル日給',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nber.org/system/files/working_papers/w2101/w2101.pdf', type: 'academic', label: 'Raff & Summers — Did Henry Ford Pay Efficiency Wages? NBER WP 2101' },
      { url: 'https://academic.oup.com/qje/article-abstract/97/4/543/1846076', type: 'academic', label: 'Akerlof (1982) Labor Contracts as Partial Gift Exchange, QJE 97(4):543-569' },
      { url: 'https://econ.lse.ac.uk/staff/bpetrong/ec423/lecture3.pdf', type: 'academic', label: 'London School of Economics EC423 — Efficiency Wages（講義ノート）' },
    ],
  },
  {
    id: 'econ-money-neutrality',
    discipline: 'economics',
    title: '貨幣の中立性と古典派の二分法',
    statement:
      '貨幣の中立性とは、貨幣供給量の変化が長期的には物価・名目賃金・名目為替レートといった名目変数のみに比例的に影響し、生産量・雇用・実質賃金などの実質変数には影響を与えない、とする命題である。' +
      'これと表裏をなすのが古典派の二分法で、実質変数は実物的要因（技術・選好・資源）で決まり、名目変数は貨幣的要因で決まるとして、両者を分離して分析できるとする見方である。貨幣数量説と整合的であり、古典派・新古典派マクロ経済学の基礎をなす。多くの経済学者は長期的中立性を受け入れる一方、短期では価格の硬直性や調整の遅れにより貨幣が実質変数に影響しうる（短期的には非中立）とケインジアンは主張する。さらに、貨幣供給量の「水準」だけでなく「成長率」の変化も実質変数に影響しないとする、より強い概念として貨幣の超中立性（superneutrality）がある。',
    keyFigures: '古典派の二分法／貨幣数量説と整合・古典派/新古典派マクロの基礎／短期は価格硬直性で非中立(ケインジアン)／超中立性',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Neutrality_of_money', type: 'reference', label: 'Wikipedia — Neutrality of money（中立性・超中立性・長期/短期）' },
      { url: 'https://en.wikipedia.org/wiki/Classical_dichotomy', type: 'reference', label: 'Wikipedia — Classical dichotomy（実質変数と名目変数の分離）' },
      { url: 'https://www.princeton.edu/~mwatson/papers/King_Watson_TestingLongRunNeutrality_FRBR_1997.pdf', type: 'academic', label: 'King & Watson — Testing Long-Run Neutrality（Princeton/Richmond Fed, 長期中立性の実証検証）' },
    ],
  },
  {
    id: 'mgmt-marketing-mix-4p',
    discipline: 'management',
    title: 'マーケティング・ミックス（4P）',
    statement:
      '企業が標的市場で望む反応を引き出すために組み合わせる、統制可能なマーケティング手段の集合。その代表的な枠組みが「4P」で、製品（Product）・価格（Price）・流通／場所（Place）・プロモーション（Promotion）の4要素から成る。' +
      '「マーケティング・ミックス」の語はハーバード大学のニール・ボーデンが1950年代に提唱・普及させ、E.ジェローム・マッカーシーが1960年にこれを覚えやすい4Pとして整理した。その後フィリップ・コトラーの教科書を通じて世界的に普及し、入門教育の標準的枠組みとなった。4Pは売り手視点に偏るとの批判から、顧客視点に置き換えた4C（顧客価値・コスト・利便性・コミュニケーション、ローターボーン1990）や、無形性など特性をもつサービス業向けに人（People）・プロセス（Process）・物的証拠（Physical evidence）を加えた7P（ブームス&ビトナー）へと拡張された。',
    keyFigures: 'N.ボーデン（マーケティング・ミックス命名・1950年代）／E.J.マッカーシー（4P・1960）／P.コトラー（普及）／拡張: 4C・7P',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/marketing/The-marketing-process', type: 'reference', label: 'Encyclopædia Britannica — Marketing: The marketing process（4P）' },
      { url: 'https://link.springer.com/rwe/10.1007/978-3-030-14449-4_12-2', type: 'academic', label: 'Springer Nature — Lauterborn’s 4Cs' },
      { url: 'https://journals.sagepub.com/doi/10.1177/0273475399211008', type: 'academic', label: 'Journal of Marketing Education (SAGE) — Yudelson (1999): 1960年マッカーシーの4P導入' },
    ],
  },
  {
    id: 'human-social-identity-theory',
    discipline: 'human-science',
    title: '社会的アイデンティティ理論（social identity theory）',
    statement:
      '人は自分が所属する集団（内集団）への帰属を自己概念の一部（社会的アイデンティティ）として取り込み、自尊心を高めるために内集団を外集団よりfavorablyに評価・差別する傾向があるとする社会心理学の理論。社会的カテゴリー化→社会的同一視→社会的比較という3つの過程を通じて、内集団びいき（in-group favoritism）や外集団差別が生じるとされる。' +
      'ヘンリー・タジフェルと弟子のジョン・ターナーが1970年代に展開し、1979年に定式化した。タジフェルの「最小条件集団パラダイム」実験では、ドットの数の推定やクレー対カンディンスキーの絵画の好みといった、くじ引き同然の些末で無意味な基準で分けられただけの集団でも、人は匿名の自集団メンバーに多く報酬を配分し、しばしば自他集団間の差を最大化しようとした。偏見・差別・集団間紛争・組織帰属・ナショナリズム等の理解に応用される。後にターナーが自己カテゴリー化理論へ発展させた。',
    keyFigures: 'ヘンリー・タジフェル & ジョン・ターナー（1979）／最小条件集団パラダイム／発展: 自己カテゴリー化理論',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/social-identity-theory', type: 'reference', label: 'Encyclopaedia Britannica — Social identity theory' },
      { url: 'https://oecs.mit.edu/pub/qlm9zp9e', type: 'academic', label: 'Open Encyclopedia of Cognitive Science (MIT Press) — Social Identity' },
      { url: 'https://www.simplypsychology.org/social-identity-theory.html', type: 'reference', label: 'SimplyPsychology — Social Identity Theory (Tajfel & Turner, 1979)' },
    ],
  },
  {
    id: 'bizlaw-abusive-dismissal',
    discipline: 'business-law',
    title: '解雇権濫用法理（労働契約法16条）',
    statement:
      '使用者による労働者の解雇は、客観的に合理的な理由を欠き、社会通念上相当であると認められない場合は、その権利を濫用したものとして無効となる、とする日本の労働法の基本法理（労働契約法16条）。' +
      'もとは判例（日本食塩製造事件・最判昭和50年、高知放送事件・最判昭和52年等）で確立された法理であり、2003年改正で旧労働基準法18条の2に明文化され、2008年施行の労働契約法16条に引き継がれた。経営上の理由による解雇については、判例上「整理解雇の4要件（4要素）」＝(1)人員削減の必要性、(2)解雇回避努力、(3)被解雇者選定の合理性、(4)手続の妥当性、が重視される。さらに労働基準法20条による解雇予告（30日前の予告または平均賃金30日分以上の予告手当）等の手続規制もあり、これらが解雇を容易にしない日本の「解雇規制」の中核をなす。',
    keyFigures: '解雇権濫用法理＝労働契約法16条（2008施行・元は判例法理）／整理解雇の4要件（判例）／関連: 労基法20条解雇予告',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/419AC0000000128/', type: 'government', label: 'e-Gov法令検索 — 労働契約法（平成19年法律第128号）第16条' },
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/roudouseisaku/chushoukigyou/keiyakushuryo_rule.html', type: 'government', label: '厚生労働省 — 労働契約の終了に関するルール（解雇・労契法16条・整理解雇）' },
      { url: 'https://www.jtuc-rengo.or.jp/rengo_online/2023/09/05/1776/', type: 'media', label: '連合 RENGO ONLINE — 解雇権濫用法理の法制化（旧労基法18条の2の経緯）' },
    ],
  },
  {
    id: 'infosoc-public-sphere',
    discipline: 'information-sociology',
    title: '公共圏（ハーバーマス）',
    statement:
      '私的個人が集まり、公共の関心事について理性的・批判的に討議することで世論（public opinion）を形成する社会的領域。国家（公権力）からも、経済や家族といった私的領域からも区別され、「公共的理性の使用」が行われる場とされる。ユルゲン・ハーバーマスが1962年の著書『公共性の構造転換（The Structural Transformation of the Public Sphere）』で論じた。' +
      '18世紀の英・仏・独で、ロンドンのコーヒーハウス、パリのサロン、新聞・雑誌などを舞台に、財産と教養をもつブルジョア市民が身分でなく「より良い論証の力」によって意見を交わす「市民的公共圏」が成立したとする。しかし20世紀の福祉国家的大衆民主主義下で、マスメディアの商業化・消費文化と国家と社会の相互浸透により、公共圏は批判的討議の場から受動的な消費・操作の対象へと「再封建化（refeudalization）」し構造転換したと論じた。熟議民主主義論やメディア研究の重要概念。ブルジョア中心性・女性などの排除性への批判もある。',
    keyFigures: 'ユルゲン・ハーバーマス（1962『公共性の構造転換』）／市民的公共圏・再封建化',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/habermas/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — Jürgen Habermas（公共圏・再封建化）' },
      { url: 'https://en.wikipedia.org/wiki/The_Structural_Transformation_of_the_Public_Sphere', type: 'reference', label: 'Wikipedia — The Structural Transformation of the Public Sphere（1962）' },
      { url: 'https://mitpress.mit.edu/9780262581080/the-structural-transformation-of-the-public-sphere/', type: 'academic', label: 'MIT Press — The Structural Transformation of the Public Sphere（英訳版書誌）' },
    ],
  },
  {
    id: 'econ-price-discrimination',
    discipline: 'economics',
    title: '価格差別（price discrimination）',
    statement:
      '同一またはほぼ同一の財・サービスを、費用の差では説明できない異なる価格で、異なる買い手（または同一買い手の異なる購入量）に販売することをいう。一物一価の法則からの乖離であり、成立には(1)売り手が市場支配力をもつこと、(2)買い手ごとの支払意思額（留保価格）の違いを識別できること、(3)安く買った者による転売＝裁定を防げること、の3条件が必要とされる。' +
      'アーサー・ピグーの分類で3つの「度合い」に分けられる。第1度（完全価格差別）は各人の支払意思額ぴったりの価格で販売するもの。第2度は購入数量やパッケージに応じた価格付けで、数量割引や二部料金がこれにあたる。第3度は年齢・地域・時間帯など観察可能な属性で市場を分割するもので、学割・シニア割・早割などが典型例。独占企業が消費者余剰を奪い生産者余剰へ転化させる手段だが、第1度では取引量が効率的水準まで増え独占に伴う死荷重が消える場合もある。',
    keyFigures: 'A.C.ピグー（3度の分類）／成立条件: 市場支配力・支払意思額の識別・転売(裁定)の防止',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/price-discrimination', type: 'reference', label: 'Britannica Money — Price discrimination' },
      { url: 'https://www.sciencedirect.com/topics/economics-econometrics-and-finance/price-discrimination', type: 'academic', label: 'ScienceDirect Topics — Price Discrimination: an overview' },
      { url: 'https://ocw.mit.edu/courses/14-271-industrial-organization-i-fall-2022/mit14_271_f22_lec3slides.pdf', type: 'academic', label: 'MIT OpenCourseWare 14.271 Industrial Organization — Price Discrimination' },
    ],
  },
  {
    id: 'econ-solow-growth-model',
    discipline: 'economics',
    title: 'ソロー成長モデル（新古典派成長理論）',
    statement:
      '長期の経済成長を、資本蓄積・労働力の増加・技術進歩から説明する新古典派の経済成長モデル。資本には収穫逓減（限界生産力の逓減）が働くため、貯蓄・投資による資本蓄積だけでは成長は次第に鈍化し、経済は資本・産出が一定比率で成長する「定常状態（steady state）」に収束する。' +
      'したがって一人当たり所得を持続的に成長させる究極の源泉は、モデル内では説明されない外生的な「技術進歩（全要素生産性, TFP）」であると結論づける（成長会計で資本・労働の寄与で説明できない残差を『ソロー残差』と呼ぶ）。初期資本が乏しい国ほど資本の限界生産力が高く速く成長するという『収束仮説』も含意する。ロバート・ソローとトレバー・スワンが1956年にそれぞれ独立に提唱し（ソローは1987年ノーベル経済学賞）、技術進歩を外生変数とする限界が、後の内生的成長理論（ローマー等）を生む契機となった。',
    keyFigures: 'ロバート・M・ソロー & トレバー・スワン（1956独立提唱）／ソロー残差(TFP)・収束仮説／ソロー1987ノーベル賞／対比: 内生的成長理論(ローマー)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Robert-Solow', type: 'reference', label: 'Encyclopædia Britannica — Robert Solow / neoclassical growth model' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1987/summary/', type: 'government', label: 'NobelPrize.org — 1987年経済学賞（ソロー、経済成長理論）' },
      { url: 'https://www.nber.org/system/files/working_papers/w13950/w13950.pdf', type: 'academic', label: 'NBER WP 13950 — Trevor Swan and the Neoclassical Growth Model' },
    ],
  },
  {
    id: 'mgmt-generic-strategies',
    discipline: 'management',
    title: 'ポーターの3つの基本戦略（generic strategies）',
    statement:
      '企業が競争優位を築くための基本的な戦略類型を、「競争優位の源泉（低コストか差別化か）」と「競争の範囲（広い市場か狭いニッチか）」の2軸で整理したもの。' +
      '(1)コスト・リーダーシップ戦略（広い市場で業界最低コストを実現）、(2)差別化戦略（広い市場で製品・サービスの独自性により高価格を実現）、(3)集中戦略（特定の狭いセグメントに経営資源を集中。さらにコスト集中と差別化集中の2つに分かれる）の3類型からなる。マイケル・E・ポーターが1980年の著書『競争の戦略（Competitive Strategy）』で提示した（集中戦略を2変種に分ける整理は1985年『競争優位の戦略』で明確化）。ポーターは、コスト優位と差別化のどちらにも徹しきれない企業は「スタック・イン・ザ・ミドル（中途半端）」に陥り低収益になると警告した（ただし両立は可能とする反論もある）。ファイブフォース分析と並ぶポーターの代表的フレームワーク。',
    keyFigures: 'マイケル・E・ポーター（1980『競争の戦略』／集中の2変種は1985『競争優位の戦略』）／スタック・イン・ザ・ミドル',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.hbs.edu/faculty/Pages/item.aspx?num=193', type: 'academic', label: 'Harvard Business School — Competitive Advantage (Michael E. Porter) 書誌' },
      { url: 'https://www.ebsco.com/research-starters/marketing/porters-generic-strategies', type: 'academic', label: 'EBSCO Research Starters — Porter’s Generic Strategies' },
      { url: 'https://en.wikipedia.org/wiki/Porter%27s_generic_strategies', type: 'reference', label: 'Wikipedia — Porter’s generic strategies' },
    ],
  },
  {
    id: 'human-halo-effect',
    discipline: 'human-science',
    title: 'ハロー効果（後光効果, halo effect）',
    statement:
      'ある対象がもつ一つの顕著な特徴（好ましい／好ましくない）の印象が、その対象の他の無関係な特徴の評価にまで波及してしまう認知バイアス。たとえば外見が魅力的な人を、知性や誠実さといった本来無関係な面でも高く評価しやすい。' +
      '心理学者エドワード・ソーンダイクが1920年の論文「A Constant Error in Psychological Ratings」(Journal of Applied Psychology 4:25-29)で、上官が部下（航空隊員）を評価する際に諸特性の評価が不自然に高く・均一に相関していたこと（全体的印象に引きずられ、個々の特性を独立に評価できていなかったこと）を実証的に示し、この現象を指摘した。人事評価・面接・教育評価・ブランド評価・口コミなどで生じ、評価の歪みの原因となる。好ましくない特徴が他の評価を引き下げる逆方向は「逆ハロー効果（ホーン効果, horn effect）」と呼ばれる。',
    keyFigures: 'エドワード・L・ソーンダイク（1920「A Constant Error in Psychological Ratings」, JAP 4:25-29）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/halo-effect', type: 'reference', label: 'Encyclopaedia Britannica — Halo effect' },
      { url: 'https://psycnet.apa.org/record/1920-10104-014', type: 'academic', label: 'Thorndike (1920) A Constant Error in Psychological Ratings — APA PsycNet（原典書誌）' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11614318/', type: 'academic', label: 'A Constant Error, Revisited: A New Explanation of the Halo Effect — PMC（査読）' },
    ],
  },
  {
    id: 'bizlaw-consumer-contract-act',
    discipline: 'business-law',
    title: '消費者契約法',
    statement:
      '消費者と事業者との間の情報の質・量および交渉力の格差に鑑み、消費者の利益の擁護を図ることを目的とする日本の法律。2000年（平成12年）公布（平成12年法律第61号）、2001年（平成13年）4月1日施行で、消費者庁が所管する。' +
      '主な内容は、(1)不当な勧誘による契約の取消権——事業者の不実告知・断定的判断の提供・不利益事実の不告知や、不退去・退去妨害等があった場合に、消費者は契約の意思表示を取り消すことができる、(2)不当な契約条項の無効——事業者の損害賠償責任を全部免除する条項や、平均的な損害を超える違約金条項、消費者の利益を一方的に害する条項等を無効とする、(3)適格消費者団体による差止請求制度（2006年改正で導入・2007年6月施行）。民法・特定商取引法等と並ぶ消費者保護法制の基幹をなし、2016年・2018年・2022年等の複数回の改正で取消事由・無効条項が拡充されてきた。',
    keyFigures: '消費者契約法（平成12年法律第61号・2001/4施行）／消費者庁所管／取消権・不当条項の無効・適格消費者団体の差止請求(2006導入)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/', type: 'government', label: '消費者庁 — 消費者契約法' },
      { url: 'https://elaws.e-gov.go.jp/document?lawid=412AC0000000061_20250616_504AC0000000068', type: 'government', label: 'e-Gov法令検索 — 消費者契約法（平成12年法律第61号）' },
      { url: 'https://www.sangiin.go.jp/japanese/annai/chousa/rippou_chousa/backnumber/2006pdf/2006070709.pdf', type: 'government', label: '参議院 — 消費者団体訴訟制度の創設（2006年改正）' },
    ],
  },
  {
    id: 'infosoc-network-society',
    discipline: 'information-sociology',
    title: 'ネットワーク社会論（カステル）',
    statement:
      '情報通信技術（ICT）の発展により、社会の中核的な構造と活動が、垂直的な階層組織から、ノードの結びつきである「ネットワーク」を基盤に組織化される社会へ移行したとする社会理論。社会学者マニュエル・カステルが三部作『情報の時代（The Information Age）』（第1巻『The Rise of the Network Society』1996, Blackwell）で体系化した。' +
      '資本・情報・イメージが瞬時に行き交う「フローの空間（space of flows）」が、地理的な「場所の空間（space of places）」に対して支配的になり、時間感覚も「無時間的時間（timeless time）」へと変容すると論じた。グローバル経済・社会運動・アイデンティティの変容を、ネットワークへの接続/切断という観点から分析する。現代の情報社会・デジタル経済論の基礎文献。',
    keyFigures: 'マニュエル・カステル（1996『The Rise of the Network Society』三部作『情報の時代』第1巻）／フローの空間・無時間的時間',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/The_Information_Age:_Economy,_Society_and_Culture', type: 'reference', label: 'Wikipedia — The Information Age: Economy, Society and Culture（三部作の構成・刊行年）' },
      { url: 'https://onlinelibrary.wiley.com/doi/book/10.1002/9781444319514', type: 'academic', label: 'Wiley Online Library — The Rise of the Network Society（書誌）' },
      { url: 'https://link.springer.com/chapter/10.1007/978-3-030-68824-0_24', type: 'academic', label: 'Springer Nature — Space of Flows and Space of Places: Castells and the Information Age' },
    ],
  },
  {
    id: 'econ-mundell-fleming',
    discipline: 'economics',
    title: 'マンデル＝フレミング・モデル',
    statement:
      '開放経済（国際的な資本移動がある経済）における IS-LM モデルの拡張で、財市場・貨幣市場に国際収支（為替）の均衡を加え（IS-LM-BoP モデルとも呼ばれる）、三市場の同時均衡を分析し、為替相場制度の違いによる財政・金融政策の有効性を比較する。' +
      '資本移動が完全な小国開放経済の場合、変動相場制では金融政策が有効で財政政策は（金利上昇→資本流入→為替増価で輸出が減り）無効になり、固定相場制では逆に財政政策が有効で金融政策は無効になる、と示す。' +
      'これは「国際金融のトリレンマ（不可能の三角形 / impossible trinity）」＝(1)自由な資本移動、(2)固定為替相場、(3)独立した金融政策の3つを同時に達成することはできず2つしか選べない、という命題の基礎をなす。ロバート・マンデルと J. マーカス・フレミングが IMF 調査局で1960年代前半に独立に展開し（フレミング1962年・マンデル1963年の論文）、マンデルは異なる為替相場制度下の金融・財政政策分析と最適通貨圏の理論により1999年ノーベル経済学賞を受賞した。',
    keyFigures: 'ロバート・マンデル＆J.マーカス・フレミング（ともにIMF調査局、1960年代前半に独立に展開。フレミング1962年・マンデル1963年論文）／国際金融のトリレンマ（不可能の三角形）の基礎／マンデル：1999年ノーベル経済学賞（最適通貨圏の理論を含む）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1999/summary/', type: 'reference', label: 'NobelPrize.org — 1999年経済学賞 公式（受賞理由：為替相場制度下の金融・財政政策分析および最適通貨圏の理論）' },
      { url: 'https://www.imf.org/external/pubs/ft/staffp/2003/01/PDF/Bough.pdf', type: 'government', label: 'IMF Staff Papers — James M. Boughton "On the Origins of the Fleming-Mundell Model"（モデルの起源・1962/1963論文）' },
      { url: 'https://en.wikipedia.org/wiki/Mundell%E2%80%93Fleming_model', type: 'reference', label: 'Wikipedia — Mundell–Fleming model（IS-LM-BoP、為替制度別の政策有効性）' },
      { url: 'https://en.wikipedia.org/wiki/Impossible_trinity', type: 'reference', label: 'Wikipedia — Impossible trinity（トリレンマの3条件と二者択一）' },
    ],
  },
  {
    id: 'mgmt-stp-marketing',
    discipline: 'management',
    title: 'STPマーケティング',
    statement:
      '標的市場を選定し、その市場での自社の位置づけを定める、マーケティング戦略の中核プロセス。' +
      '(1)セグメンテーション（Segmentation）＝市場を地理・人口統計・心理・行動などの基準で同質な顧客集団に細分化、(2)ターゲティング（Targeting）＝細分化した市場の中から自社が狙う標的セグメントを選定、(3)ポジショニング（Positioning）＝標的顧客の心の中で競合と差別化された独自の位置づけを確立、の3段階から成る。' +
      '「ポジショニング」概念はアル・ライズ&ジャック・トラウトが1969年の論考に端を発し1970年代の連載を通じて広め、STPの体系化はフィリップ・コトラーの教科書を通じて普及した。4P（マーケティングミックス）が「どう実行するか（戦術）」であるのに対し、STPは「誰に何を提供するか（戦略）」を定め、両者を組み合わせてマーケティング計画が立案される。',
    keyFigures: 'P.コトラー（STPの体系化・普及）／ポジショニング：アル・ライズ&ジャック・トラウト（1969年提唱・1970年代普及）／4Pとの関係（STP=戦略 vs 4P=戦術）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/target-marketing', type: 'reference', label: 'Encyclopaedia Britannica — Target marketing（segmentation→targeting→positioning）' },
      { url: 'https://pressbooks.library.vcu.edu/marketingprinciples/chapter/chapter-7-segmentation-targeting-and-positioning/', type: 'academic', label: 'Virginia Commonwealth University — Marketing Principles, Ch.7 Segmentation, Targeting, and Positioning' },
      { url: 'https://en.wikipedia.org/wiki/Segmenting-targeting-positioning', type: 'reference', label: 'Wikipedia — Segmenting-targeting-positioning（STP, Kotler; STP戦略 vs 4P戦術）' },
      { url: 'https://faculty.marshall.usc.edu/Davide-Proserpio/BUAD307-fall19/lectures/BUAD-307-Chap09.pdf', type: 'academic', label: 'USC Marshall School of Business — STP（BUAD 307 講義資料）' },
    ],
  },
  {
    id: 'human-availability-heuristic',
    discipline: 'human-science',
    title: '利用可能性ヒューリスティック',
    statement:
      'ある事象の頻度や確率を判断する際に、その事例がどれだけ容易に思い浮かぶか（想起のしやすさ）に基づいて見積もる、心の近道（ヒューリスティック）。' +
      '記憶から取り出しやすい事例（最近の出来事・鮮烈な出来事・メディアで大きく報じられた事象）ほど、実際の頻度より高頻度だと過大評価しやすい。たとえば航空機事故や凶悪犯罪は報道で印象に残るため、実際のリスクより過大に見積もられがちである。' +
      'エイモス・トベルスキーとダニエル・カーネマンが1973年の論文「Availability: A Heuristic for Judging Frequency and Probability」（Cognitive Psychology誌）で提唱した。代表性ヒューリスティック・アンカリングと並ぶ判断のヒューリスティックの一つで、リスク認知の歪み・確率判断の誤りの原因となる。',
    keyFigures: 'Amos Tversky & Daniel Kahneman（1973）, Cognitive Psychology, 5(2), 207–232',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/0010028573900339', type: 'academic', label: 'Tversky & Kahneman (1973), "Availability: A heuristic for judging frequency and probability", Cognitive Psychology 5(2):207–232（原著査読論文）' },
      { url: 'https://www.britannica.com/topic/heuristic-reasoning', type: 'reference', label: 'Encyclopaedia Britannica — "Heuristic"（Kahneman, Tversky 解説）' },
      { url: 'https://www.simplypsychology.org/availability-heuristic.html', type: 'reference', label: 'Simply Psychology — Availability Heuristic: Definition & Examples' },
    ],
  },
  {
    id: 'bizlaw-derivative-suit',
    discipline: 'business-law',
    title: '株主代表訴訟（責任追及等の訴え）',
    statement:
      '取締役等の役員が会社に対して負う責任（任務懈怠による損害賠償責任等）について、会社がその追及を怠っている場合に、株主が会社に代わって役員等の責任を追及する訴えを提起できる制度（会社法847条。条文上は「責任追及等の訴え」）。経営者が身内の役員の責任を追及しにくい状況を是正し、コーポレートガバナンスを担保する機能をもつ。' +
      '提訴できるのは原則6か月前から引き続き株式を保有する株主で、まず会社に対し書面その他法務省令で定める方法により提訴を請求し、会社が請求の日から60日以内に訴えを提起しないときに株主自身が会社のために提訴できる。勝訴しても賠償金は株主個人ではなく会社に帰属する。' +
      '株主代表訴訟は財産権上の請求でない訴えとして訴額が160万円とみなされ、訴訟手数料は訴額にかかわらず一律13,000円とされており（民事訴訟費用等に関する法律）、提訴の経済的ハードルが低い。2014年（平成26年）改正では多重代表訴訟（最終完全親会社等の株主が子会社役員の責任を追及する特定責任追及の訴え。会社法847条の3）も導入された。',
    keyFigures: '株主代表訴訟＝会社法847条（責任追及等の訴え）／6か月保有要件・会社への提訴請求後60日待機／訴額160万円みなし・手数料一律13,000円／2014年改正で多重代表訴訟（847条の3）導入',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索「会社法」（平成十七年法律第八十六号）第847条—第853条 責任追及等の訴え' },
      { url: 'https://www.kokugakuin.ac.jp/article/11359', type: 'academic', label: '國學院大學「親会社の株主が子会社の取締役を訴える『多重代表訴訟』制度とは」' },
      { url: 'https://www.businesslawyers.jp/practices/839', type: 'reference', label: 'BUSINESS LAWYERS「株主代表訴訟とは？ 提訴請求の要件、流れ、会社側の対応など」' },
      { url: 'https://ja.wikipedia.org/wiki/株主代表訴訟', type: 'reference', label: 'Wikipedia「株主代表訴訟」（手数料・改正経緯の概観）' },
    ],
  },
  {
    id: 'infosoc-media-literacy',
    discipline: 'information-sociology',
    title: 'メディア・リテラシー',
    statement:
      '多様な形態のメディアにアクセスし、その内容を批判的に分析・評価し、自ら情報を創造・発信する能力。メディアが現実をそのまま映すのではなく、特定の視点・価値・商業的または政治的な意図のもとに構成（構築）されたものであることを理解し、誰がどんな目的で発信し、何が省かれているのかを問う力を含む。' +
      '1992年にアスペン研究所が主催した全米メディアリテラシー指導者会議で示された「市民がさまざまな形態のメディアにアクセスし、分析・評価し、発信する能力」という定義が広く参照される（後に access・analyze・evaluate・create の4要素として整理された）。' +
      'ユネスコは情報リテラシーとメディアリテラシーを統合した「メディア情報リテラシー（MIL）」を提唱し、教師向けカリキュラムや政策ガイドラインを通じて各国の教育政策への組み込みを支援している。フェイクニュース・偽情報・ヘイトスピーチが問題化するデジタル時代において、ユネスコはMILを偽情報に対する「第一の防衛線」と位置づけ、民主主義の基盤としてその重要性が高まっている。',
    keyFigures: 'アスペン研究所 全米メディアリテラシー指導者会議（1992）— 4要素 access・analyze・evaluate・create／ユネスコ（UNESCO）— メディア情報リテラシー（MIL）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.unesco.org/en/media-information-literacy', type: 'government', label: 'UNESCO — Media and Information Literacy（MILの定義・政策・教育枠組み）' },
      { url: 'https://www.unesco.org/en/articles/media-and-information-literacy-first-line-defence-against-disinformation', type: 'government', label: 'UNESCO — MIL as the first line of defence against disinformation' },
      { url: 'https://www.medialit.org/reading-room/aspen-institute-report-national-leadership-conference-media-literacy', type: 'reference', label: 'Center for Media Literacy — Aspen Institute 1992 会議報告（定義の出典）' },
      { url: 'https://eric.ed.gov/?id=ED365294', type: 'government', label: 'ERIC（米国教育省）ED365294 — Aufderheide, Media Literacy: A Report of the National Leadership Conference (1992/93)' },
    ],
  },
  {
    id: 'econ-ricardian-equivalence',
    discipline: 'economics',
    title: 'リカードの等価定理（リカード=バローの中立命題）',
    statement:
      '政府が一定の支出を税で賄うか国債発行で賄うかは、経済全体の総需要に影響を与えない（両者は等価である）とする命題。合理的で先見的な家計は、国債発行による減税が将来の増税（償還財源の調達）を意味すると予期し、減税分を消費に回さず将来の納税に備えて貯蓄するため、減税は消費・総需要を刺激しないと説く。' +
      'デイヴィッド・リカードが19世紀前半（1820年「Essay on the Funding System」など）でこの可能性を論じたが、リカード自身は現実妥当性に懐疑的だった。ロバート・バローが1974年の論文「Are Government Bonds Net Wealth?」で、世代間の利他性（遺産動機）を組み込み家計を無限視野の世代連鎖として扱うことで現代的に定式化した（リカード=バローの等価命題）。' +
      '成立には合理的期待・完全資本市場・一括（定額）税・無限視野または世代間利他性といった強い前提が必要であり、現実にはこれらが崩れるため厳密には成立しにくく、減税の景気刺激効果をめぐる論争点となっている。',
    keyFigures: 'デイヴィッド・リカード（19世紀前半に原型を提示、本人は現実妥当性に懐疑的）／ロバート・バロー1974「Are Government Bonds Net Wealth?」（JPE 82(6), 1095–1117。世代間利他性で現代的に定式化）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.richmondfed.org/-/media/richmondfedorg/publications/research/econ_focus/2008/winter/pdf/jargon_alert.pdf', type: 'government', label: 'Federal Reserve Bank of Richmond, "Jargon Alert: Ricardian Equivalence"（Econ Focus, 2008）' },
      { url: 'https://www.minneapolisfed.org/article/2005/interview-with-robert-barro', type: 'government', label: 'Federal Reserve Bank of Minneapolis, "Interview with Robert Barro"（2005）' },
      { url: 'https://www.journals.uchicago.edu/doi/10.1086/260266', type: 'academic', label: 'Robert J. Barro, "Are Government Bonds Net Wealth?", Journal of Political Economy 82(6), 1974（University of Chicago Press）' },
      { url: 'https://en.wikipedia.org/wiki/Ricardian_equivalence', type: 'reference', label: 'Wikipedia, "Ricardian equivalence"（Ricardo 1820 / Barro coinage の補足確認）' },
    ],
  },
  {
    id: 'econ-crowding-out',
    discipline: 'economics',
    title: 'クラウディングアウト（押し出し効果）',
    statement:
      '政府が国債発行で財政支出を拡大すると、貸付資金市場での資金需要が増大して利子率が上昇し、それが民間投資（や利子感応的な消費）を抑制・減少させ、財政政策の景気刺激効果が相殺・減殺される現象。' +
      '利子率の上昇を通じて生じる金融的クラウディングアウトが代表的だが、完全雇用下では実物資源（労働・資本）の取り合いによる実物的クラウディングアウトも論じられる。IS-LMの枠組みでは、政府支出増がIS曲線を右シフトさせ均衡所得と利子率を押し上げる。LM曲線の傾きが急なほど効果が大きく、垂直なら完全クラウディングアウト、水平（流動性の罠）ならゼロとなる。' +
      '不況・流動性の罠では利子率が動かずクラウディングアウトは小さい、とケインジアンは主張する一方、マネタリストやリカード派は効果を重視し財政政策に懐疑的である。実証では程度（部分的か完全か）をめぐり論争が続く。',
    keyFigures: 'IS-LM分析：政府支出増→IS右シフト→利子率上昇→民間投資減／金融的クラウディングアウト＝利子率上昇経由／LM曲線が急なほど効果大・水平（流動性の罠）でゼロ／ケインジアンは不況下では弱いと主張、マネタリスト・リカード派は重視',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.imf.org/external/pubs/ft/pam/pam49/pam4902.htm', type: 'government', label: 'IMF Pamphlet Series No.49 — Guidelines for Fiscal Adjustment（政府借入が金利上昇・民間投資減を招く機構）' },
      { url: 'https://openstax.org/books/principles-economics-3e/pages/31-4-fiscal-policy-investment-and-economic-growth', type: 'academic', label: 'OpenStax, Principles of Economics 3e §31.4 — Fiscal Policy, Investment, and Crowding Out' },
      { url: 'https://pages.stern.nyu.edu/~nroubini/NOTES/CHAP9.HTM', type: 'academic', label: 'NYU Stern (N. Roubini) — The IS-LM Model（LM曲線の傾きとクラウディングアウト）' },
      { url: 'https://www.pgpf.org/article/the-national-debt-can-crowd-out-investments-in-the-economy-heres-how/', type: 'media', label: 'Peter G. Peterson Foundation（CBO推計：赤字1ドル増→民間投資約33セント減）' },
    ],
  },
  {
    id: 'mgmt-dynamic-capabilities',
    discipline: 'management',
    title: 'ダイナミック・ケイパビリティ',
    statement:
      '急速に変化する環境の中で、企業が内外の資源・コンピテンスを統合（integrate）・構築（build）・再構成（reconfigure）して環境変化に対応・適応する高次の能力。' +
      '資源ベース論（RBV）が企業の静的な資源・能力の保有を競争優位の源泉として重視するのに対し、ダイナミック・ケイパビリティ論はその資源基盤を動的に更新・刷新する上位の能力に注目し、RBVの動的拡張として位置づけられる。デイヴィッド・J・ティース、ゲイリー・ピサノ、エイミー・シューエンが1997年の論文「Dynamic Capabilities and Strategic Management」（Strategic Management Journal, 18巻7号, pp.509–533）で提唱・体系化した。' +
      'ティースは後の2007年論文でこの能力を、機会・脅威を感知する「センシング（sensing）」、機会を捕捉し資源を動員する「シージング（seizing）」、資源・組織を再配置・変革する「トランスフォーミング／再構成（transforming）」の三要素に整理した。',
    keyFigures: 'D.ティース・G.ピサノ・A.シューエン 1997（Strategic Management Journal 18(7):509–533）／三要素センシング・シージング・トランスフォーミング（Teece 2007, SMJ 28(13):1319–1350）／RBVの動的拡張',
    asOf: '2026-06',
    sources: [
      { url: 'https://sms.onlinelibrary.wiley.com/doi/abs/10.1002/(SICI)1097-0266(199708)18:7%3C509::AID-SMJ882%3E3.0.CO;2-Z', type: 'academic', label: 'Teece, Pisano & Shuen (1997) "Dynamic capabilities and strategic management", SMJ 18(7):509–533（Wiley, 出版元）' },
      { url: 'https://sms.onlinelibrary.wiley.com/doi/10.1002/smj.640', type: 'academic', label: 'Teece (2007) "Explicating dynamic capabilities", SMJ 28(13):1319–1350 — sensing/seizing/transformingの典拠（Wiley）' },
      { url: 'https://open.ncl.ac.uk/theories/19/dynamic-capabilities-theory/', type: 'academic', label: 'Dynamic Capabilities Theory — TheoryHub, Newcastle University（RBV拡張と三次元の解説）' },
      { url: 'https://en.wikipedia.org/wiki/Dynamic_capabilities', type: 'reference', label: 'Wikipedia — Dynamic capabilities（定義と1997年提唱者の概説）' },
    ],
  },
  {
    id: 'human-hyperbolic-discounting',
    discipline: 'human-science',
    title: '双曲割引',
    statement:
      '将来の報酬の価値を割り引いて評価する際、近い将来ほど割引率が急で、遠い将来になるほど割引が緩やかになる傾向。' +
      '標準的経済学が仮定する指数割引（時間に対し一定率で割り引く）と異なり、人は目先の小さな即時報酬を、より大きな将来報酬よりも過大評価しやすい。その結果、計画時の選好と実行時の選好が食い違う「時間的非整合性（動的非整合性）」が生じ、近い時点になるほど即時報酬へ選好が逆転する。これにより先延ばし・ダイエット失敗・貯蓄不足・依存などのセルフコントロール問題が説明される。' +
      '選好逆転は心理学者ジョージ・アインズリーが実験的に示し、経済学ではデイヴィッド・レイブソンが準双曲割引（β-δモデル、将来効用を βδ^t で割引）として定式化した。先延ばしを防ぐコミットメント装置の理論的基礎にもなっている。',
    keyFigures: '双曲割引＝近い将来ほど急な割引（指数割引と異なり割引率が一定でない）／時間的非整合性（選好の逆転）／準双曲割引 β-δモデル（D.レイブソン 1997, QJE 112(2):443–478）・実験的実証（G.アインズリー）',
    asOf: '2026-06',
    sources: [
      { url: 'https://scholar.harvard.edu/files/laibson/files/golden_eggs_and_hyperbolic_discounting.pdf', type: 'academic', label: 'David Laibson, "Golden Eggs and Hyperbolic Discounting," Quarterly Journal of Economics 112(2), 1997（β-δ準双曲割引の定式化／Harvard 配信PDF）' },
      { url: 'https://academic.oup.com/qje/article-abstract/112/2/443/1870925', type: 'academic', label: 'The Quarterly Journal of Economics (Oxford Academic) — 上記論文の収録記録（pp.443–478）' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11591072/', type: 'academic', label: '"Navigating Time-Inconsistent Behavior … Hyperbolic Discounting," Behavioral Sciences (MDPI), PMC（双曲割引と時間的非整合性の定義）' },
      { url: 'https://en.wikipedia.org/wiki/Hyperbolic_discounting', type: 'reference', label: 'Wikipedia「Hyperbolic discounting」（双曲割引の概要・指数割引との対比）' },
    ],
  },
  {
    id: 'bizlaw-internal-control',
    discipline: 'business-law',
    title: '内部統制システム（J-SOX・内部統制報告制度）',
    statement:
      '内部統制システムとは、業務の適正を確保するための社内の体制・仕組みをいい、日本の法制度には大きく2つの系統がある。' +
      '(1)会社法上、大会社である取締役会設置会社等は、取締役の職務執行が法令・定款に適合することを確保する体制その他「株式会社及びその子会社から成る企業集団の業務の適正を確保するための体制（内部統制システム）」の整備の基本方針を取締役会が決定する義務を負う（会社法362条4項6号・5項、会社法施行規則100条）。' +
      '(2)金融商品取引法に基づく内部統制報告制度（いわゆるJ-SOX）では、上場企業の経営者が財務報告に係る内部統制の有効性を自ら評価した「内部統制報告書」を有価証券報告書と併せて内閣総理大臣（金融庁）に提出し、公認会計士・監査法人の監査を受けることが義務づけられる（金商法24条の4の4第1項）。2006年に金商法が成立し、2008年4月1日以後開始する事業年度から適用された。米国SOX法（2002年）を参考にしつつ日本向けに簡素化された制度で、COSOフレームワークの考え方が基礎にある。',
    keyFigures: '会社法362条4項6号・5項／会社法施行規則100条＝取締役会の内部統制システム整備（基本方針決定）義務／金商法24条の4の4第1項＝内部統制報告制度（J-SOX）・2006年成立2008年4月以後開始事業年度から適用／米国SOX法2002年・COSOフレームワークが基礎',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索：会社法（362条＝取締役会の権限・内部統制システム整備の基本方針決定）' },
      { url: 'https://laws.e-gov.go.jp/law/418AC0000000065', type: 'government', label: 'e-Gov法令検索：金融商品取引法（24条の4の4＝内部統制報告書の提出義務／J-SOX）' },
      { url: 'https://www.fsa.go.jp/news/19/sonota/20080208-2.html', type: 'government', label: '金融庁：財務報告に係る内部統制の評価及び監査に関する実施基準等（内部統制報告制度の所管・運用基準）' },
      { url: 'https://ja.wikipedia.org/wiki/上場企業会計改革および投資家保護法', type: 'reference', label: 'Wikipedia：上場企業会計改革および投資家保護法（米国SOX法 2002年）' },
    ],
  },
  {
    id: 'infosoc-surveillance-capitalism',
    discipline: 'information-sociology',
    title: '監視資本主義',
    statement:
      '人々のオンライン上の行動から得られる膨大な個人データ（行動余剰, behavioral surplus）を無償の原材料として一方的に収集・分析し、将来の行動を予測する「予測製品（prediction products）」を製造して、それを広告主など顧客に販売する新しい市場（行動先物市場, behavioral futures markets）で利益を得る、という新しい資本蓄積の論理。' +
      'ハーバード・ビジネス・スクール名誉教授のショシャナ・ズボフ（Shoshana Zuboff）が、2015年の論文「Big other」で概念を提示し、2019年の著書『The Age of Surveillance Capitalism（監視資本主義）』で体系化・普及させた。' +
      'Google（2001年のAdWordsを起点とする）やFacebook等の事業モデルを念頭に、人間の経験を予測・改変（行動修正・nudge）の対象とする「道具主義的権力（instrumentarian power）」が民主主義と個人の自律を脅かすと批判する。',
    keyFigures: 'ショシャナ・ズボフ（ハーバード・ビジネス・スクール名誉教授）／2019『The Age of Surveillance Capitalism』・2015論文「Big other」（Journal of Information Technology 30(1):75–89）／行動余剰・予測製品・行動先物市場・道具主義的権力',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/surveillance-capitalism', type: 'reference', label: 'Encyclopaedia Britannica — Surveillance capitalism: Definition, History, & Facts' },
      { url: 'https://news.harvard.edu/gazette/story/2019/03/harvard-professor-says-surveillance-capitalism-is-undermining-democracy/', type: 'academic', label: 'Harvard Gazette — "Harvard professor says surveillance capitalism is undermining democracy" (2019)' },
      { url: 'https://www.hbs.edu/faculty/Pages/item.aspx?num=56791', type: 'academic', label: 'Harvard Business School Faculty & Research — The Age of Surveillance Capitalism（書誌）' },
      { url: 'https://link.springer.com/article/10.1057/jit.2015.5', type: 'academic', label: 'Zuboff (2015) "Big other…" Journal of Information Technology 30(1):75–89, DOI 10.1057/jit.2015.5' },
    ],
  },
  {
    id: 'mgmt-vrio',
    discipline: 'management',
    title: 'VRIO分析（VRIOフレームワーク）',
    statement:
      '資源ベース論（RBV）に基づき、企業の経営資源・ケイパビリティが持続的競争優位の源泉になり得るかを4つの問いで評価する分析枠組み。' +
      '(1)Value（経済的価値があり、機会の活用や脅威への対応に役立つか）、(2)Rarity（希少で、保有する競合が少ないか）、(3)Imitability（模倣困難か＝競合が獲得・開発するのにコストがかかるか）、(4)Organization（その資源を活用できるよう組織体制・方針・手続きが整っているか）。価値はあるが希少でなければ「競争均衡」、価値・希少だが模倣容易なら「一時的競争優位」、4条件をすべて満たす資源のみが「持続的競争優位」をもたらす。' +
      'ジェイ・バーニーが提唱したもので、初期（1991）はVRIN（Valuable・Rare・Inimitable・Non-substitutable＝価値・希少性・模倣不可能性・代替不可能性）として整理し、後の論文（1995「Looking Inside for Competitive Advantage」）でこれを発展させ、代替不可能性を見直してOrganization（組織）を加える形でVRIOフレームワークとして体系化した。',
    keyFigures: 'ジェイ・バーニー（Jay B. Barney, RBVの代表的論者）／4つの問い Value・Rarity・Imitability・Organization／初期VRIN（1991）→VRIO（1995, Academy of Management Executive 9(4):49–61。代替不可能性をOrganizationへ再整理）',
    asOf: '2026-06',
    sources: [
      { url: 'https://open.ncl.ac.uk/theories/4/resource-based-theory/', type: 'academic', label: 'Newcastle University — TheoryHub: Resource-Based Theory（VRIN→VRIO、Barneyの位置づけ）' },
      { url: 'https://journals.aom.org/doi/10.5465/ame.1995.9512032192', type: 'academic', label: 'Barney, J.B. (1995) "Looking Inside for Competitive Advantage", Academy of Management Executive 9(4):49–61（VRIO原典）' },
      { url: 'https://en.wikipedia.org/wiki/VRIO', type: 'reference', label: 'Wikipedia: VRIO（1991 VRIN提唱、1995 VRIO公表、4基準の定義）' },
      { url: 'https://strategicmanagementinsight.com/tools/vrio/', type: 'reference', label: 'Strategic Management Insight — VRIO Framework Explained（4つの問いと競争優位の判定）' },
    ],
  },
  {
    id: 'econ-adverse-selection',
    discipline: 'economics',
    title: '逆選択（レモン市場）',
    statement:
      '取引が成立する前に当事者間で情報の非対称性があるとき、質の悪い財やリスクの高い相手ばかりが市場に集まり、良質な財・相手が締め出される現象。' +
      'ジョージ・アカロフが1970年の論文「The Market for "Lemons"」で中古車市場を例に示した。買い手が品質を見分けられないと、買い手はリスクを反映した平均的価格しか払わず、その結果良質な車（peach）の売り手は退出し、質の悪い車（lemon）ばかりが残って市場が縮小・崩壊しうる。同様の情報の非対称性は保険（健康リスクの高い人ほど加入したがる）や金融・信用市場でも生じる。' +
      '情報の非対称性が「取引前」に作用する点で、取引後の隠された行動であるモラルハザードと区別される。対策としてシグナリング（スペンス）、スクリーニング（スティグリッツ）、保証、強制加入などがある。アカロフ・スペンス・スティグリッツは情報の非対称性のある市場の分析により2001年ノーベル経済学賞を受賞した。',
    keyFigures: 'ジョージ・アカロフ1970「The Market for Lemons」／情報の非対称性は取引前（隠れた性質）に作用・モラルハザード（取引後）と対比／対策：シグナリング・スクリーニング／2001年ノーベル賞 アカロフ・スペンス・スティグリッツ',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2001/popular-information/', type: 'reference', label: 'NobelPrize.org — 2001年経済学賞 popular information（アカロフのレモン市場・逆選択・市場崩壊）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2001/advanced-information/', type: 'reference', label: 'NobelPrize.org — 2001年経済学賞 advanced information（3受賞者と非対称情報分析）' },
      { url: 'https://www.britannica.com/money/George-Akerlof', type: 'reference', label: 'Encyclopaedia Britannica（Money）— George Akerlof：中古車市場での逆選択と1970年論文' },
    ],
  },
  {
    id: 'econ-moral-hazard',
    discipline: 'economics',
    title: 'モラルハザード（道徳的危険）',
    statement:
      '契約・取引の成立後に、一方当事者の行動が相手から十分に観察・監視できない（隠された行動）ために、リスクから守られた当事者が注意を怠ったり過大なリスクを取ったりするインセンティブを持つ問題。' +
      '情報の非対称性が「取引後」に生じる点で、取引前に当事者の隠れた性質をめぐって生じる逆選択（adverse selection）と区別される。保険分野が語源かつ典型で、保険に加入することで事故回避の努力が低下する（火災保険・医療保険など）。金融では「大きすぎて潰せない（too big to fail）」金融機関が政府による救済を見込んで過大なリスクを取る例が代表的である。' +
      '広義にはプリンシパル＝エージェント問題の一形態であり、対策として自己負担（免責・co-payment）、成果連動報酬などのインセンティブ契約、モニタリングが用いられる。',
    keyFigures: 'モラルハザード＝取引後の「隠された行動」に起因／保険・金融（too big to fail）が典型／逆選択（取引前の隠れた性質）と対比／対策：免責・自己負担・インセンティブ契約・モニタリング',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/moral-hazard', type: 'reference', label: 'Britannica Money — Moral hazard（契約後に一方をリスクから保護することで誤った行動の誘因が生じる。保険・医療の例）' },
      { url: 'https://www.imf.org/external/pubs/ft/fandd/2010/12/pdf/basics.pdf', type: 'government', label: 'IMF, Finance & Development "Back to Basics"（モラルハザードの定義・保険者が損害責任の所在を判別できない例）' },
      { url: 'https://www.minneapolisfed.org/article/2003/too-big-to-fail-the-hazards-of-bank-bailouts', type: 'government', label: 'Federal Reserve Bank of Minneapolis — "Too Big To Fail: The Hazards of Bank Bailouts"（救済期待による過大リスク）' },
    ],
  },
  {
    id: 'mgmt-competitive-positions',
    discipline: 'management',
    title: '競争地位別戦略（リーダー・チャレンジャー・フォロワー・ニッチャー）',
    statement:
      '市場における各企業の競争上の地位（市場シェア・役割）に応じて、とるべきマーケティング戦略が異なるとする枠組み。フィリップ・コトラーは市場の企業を4類型に分類した。' +
      '(1)マーケットリーダー：最大の市場シェアを持ち、市場全体の拡大・現在のシェアの防衛・シェアの拡大を志向する。(2)マーケットチャレンジャー：2番手等の地位からリーダーや競合に攻撃を仕掛け、差別化などによってシェア奪取を狙う。(3)マーケットフォロワー：リーダーに挑戦せず模倣・追随し、過度な競争を避けつつ既存顧客と一定のシェアを維持する。(4)マーケットニッチャー：大企業が本格参入しない特定の小さな市場（ニッチ）に専門特化する。' +
      '各企業は自社の地位を踏まえ、保有する経営資源と整合した戦略を選ぶべきとされる。',
    keyFigures: 'P.コトラー／リーダー・チャレンジャー・フォロワー・ニッチャーの4類型／市場シェア・役割に応じた戦略の差別化（例示的シェア配分 40/30/20/10）',
    asOf: '2026-06',
    sources: [
      { url: 'https://nscpolteksby.ac.id/ebook/files/Ebook/Business%20Administration/Kotler%20and%20Keller%20Marketing%20Management%2014th%20Edition%20(2012)/Chapter%2011%20-%20Competitive%20Dynamics.pdf', type: 'academic', label: 'Kotler & Keller, Marketing Management 14th ed., Ch.11 "Competitive Dynamics"' },
      { url: 'https://publications.dyson.cornell.edu/outreach/extensionpdf/2013/Cornell-Dyson-eb1305.pdf', type: 'academic', label: 'Cornell University, Dyson School — Marketing Module 4: Competitor Analysis' },
      { url: 'https://www.nri.com/jp/knowledge/glossary/kotlers_compe.html', type: 'reference', label: '野村総合研究所（NRI）用語解説「コトラーの競争地位戦略」' },
    ],
  },
  {
    id: 'human-self-serving-bias',
    discipline: 'human-science',
    title: '自己奉仕バイアス',
    statement:
      '自己奉仕バイアス（self-serving bias、自己奉仕的帰属）とは、自分の成功は能力や努力といった内的・性質的要因に帰属させ、失敗は運・他者・状況などの外的要因に帰属させる傾向をいう。一般に、自尊心（self-esteem）を維持・高揚させようとする動機づけ（self-enhancement）によって生じる帰属の歪みと説明される。' +
      'たとえば試験に合格すれば「自分が頑張ったから」と考え、不合格なら「問題が悪い」「運が悪い」と考える。集団場面でも、自集団の成功を内的に、失敗を外部に帰す集団奉仕バイアス（group-serving bias）が生じる。' +
      '動機的説明のほか、Miller & Ross は、成功は期待どおりなので内的に、失敗は予想外なので外的に帰属されるという認知的（期待依存的）説明も提起した。なお、うつ傾向の人ではこのバイアスが弱まる、あるいは逆転するという知見もある（抑うつリアリズム）。他者の行動を性質に帰属しすぎる基本的帰属錯誤とは別概念である。',
    keyFigures: '帰属パターン：成功は内的（能力・努力）・失敗は外的（運・状況）／自尊心維持（self-enhancement）動機／認知的説明 Miller & Ross 1975（Psychological Bulletin）／集団奉仕バイアス・抑うつリアリズム／基本的帰属錯誤とは別概念',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.simplypsychology.org/self-serving-bias.html', type: 'reference', label: 'Simply Psychology — Self-Serving Bias In Psychology: Definition & Examples' },
      { url: 'https://en.wikipedia.org/wiki/Self-serving_bias', type: 'reference', label: 'Wikipedia — Self-serving bias' },
      { url: 'https://web.mit.edu/curhan/www/docs/Articles/biases/82_Psychological_Bulletin_213_(Miller).pdf', type: 'academic', label: 'Miller & Ross (1975), Psychological Bulletin — "Self-Serving Biases in the Attribution of Causality"（MIT 配信PDF）' },
      { url: 'https://courses.lumenlearning.com/suny-social-psychology/chapter/biases-in-attribution/', type: 'academic', label: 'Lumen Learning / SUNY — Principles of Social Psychology, "Biases in Attribution"（集団奉仕バイアス）' },
    ],
  },
  {
    id: 'bizlaw-duty-of-loyalty',
    discipline: 'business-law',
    title: '取締役の忠実義務（会社法355条）',
    statement:
      '取締役は、法令及び定款並びに株主総会の決議を遵守し、株式会社のため忠実にその職務を行わなければならないとする義務（会社法355条）。会社の利益を犠牲にして自己または第三者の利益を図ってはならないという趣旨であり、競業避止義務（356条1項1号）や利益相反取引の規制（356条1項2号〔直接取引〕・3号〔間接取引〕）などが、その具体化として置かれている。' +
      '委任に基づく善良な管理者の注意義務である善管注意義務（会社法330条・民法644条）との関係について、判例（最大判昭和45年6月24日・八幡製鉄政治献金事件）および通説は、忠実義務は善管注意義務を敷衍し一層明確にしたにとどまり、通常の委任関係に伴う善管注意義務とは別個の高度な義務を課すものではないとする（同質説）。' +
      'これに対し、両者を性質の異なる義務として区別する異質説も学説上有力に主張されている。',
    keyFigures: '忠実義務＝会社法355条／具体化規定：競業避止義務（356条1項1号）・利益相反取引規制（356条1項2号3号）／善管注意義務（330条・民法644条）との関係：判例・通説は同質説（最大判昭和45年6月24日）・異質説も有力',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索：会社法（355条 忠実義務・356条 競業及び利益相反取引の制限）' },
      { url: 'https://www.law-kobegakuin.jp/wp/wp-content/uploads/2024/09/%E5%B8%82%E5%8E%9F%E5%85%88%E7%94%9F.pdf', type: 'academic', label: '市原尚子「取締役等の責任における忠実義務の役割についての再考」（神戸学院大学法学部）— 善管注意義務と忠実義務の関係（同質説・異質説）' },
      { url: 'https://corporate-law.net/archives/1068', type: 'reference', label: 'スマート会社法 会社法第355条（忠実義務）解説 — 民法644条善管注意義務との関係' },
    ],
  },
  {
    id: 'infosoc-echo-chamber',
    discipline: 'information-sociology',
    title: 'エコーチェンバー（反響室効果）',
    statement:
      '閉じた情報環境の中で、自分と同じ意見・信念をもつ人々とばかり交流し、同質の情報や見解が繰り返し反復・増幅されることで、特定の信念が強化され、異なる見解（反論）に触れにくくなる現象。閉じた部屋の中で音が反響する様子になぞらえた比喩である。' +
      'SNSでは、ユーザーが自分と似た立場の他者をフォローし、共鳴する投稿を共有・拡散する傾向（選択的接触）があるため生じやすく、政治的分極化（polarization）・誤情報の拡散・確証バイアスの増幅と結びつくと論じられる。' +
      'アルゴリズムによる情報の選別的遮断を指す「フィルターバブル」と関連するが、エコーチェンバーは主に人々の選択的な交流・同質的ネットワークによる意見増幅という能動的・社会的な側面を指す点で区別される。C.サンスティーンは、こうした情報の自己選別が熟議民主主義に及ぼす悪影響を論じた。',
    keyFigures: 'エコーチェンバー＝同質な人々の閉じた相互作用での意見の反復・増幅（能動的・社会的）／フィルターバブル（アルゴリズムによる受動的遮断）と区別／政治的分極化・確証バイアスと関連／C.サンスティーン（#Republic）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pnas.org/doi/10.1073/pnas.2023301118', type: 'academic', label: 'Cinelli et al., "The echo chamber effect on social media", PNAS (2021)' },
      { url: 'https://reutersinstitute.politics.ox.ac.uk/echo-chambers-filter-bubbles-and-polarisation-literature-review', type: 'academic', label: 'Reuters Institute (University of Oxford) — "Echo chambers, filter bubbles, and polarisation: a literature review"' },
      { url: 'https://www.cambridge.org/core/books/social-media-and-democracy/social-media-echo-chambers-and-political-polarization/333A5B4DE1B67EFF7876261118CCFE19', type: 'academic', label: 'Cambridge University Press — "Social Media, Echo Chambers, and Political Polarization"' },
      { url: 'https://press.princeton.edu/books/paperback/9780691180908/republic', type: 'academic', label: 'Cass R. Sunstein, "#Republic: Divided Democracy in the Age of Social Media", Princeton University Press' },
    ],
  },
  {
    id: 'econ-giffen-good',
    discipline: 'economics',
    title: 'ギッフェン財',
    statement:
      '価格が上昇すると需要量がかえって増加する（需要法則に反する）特殊な財。下級財（劣等財）の一種で、価格変化の「所得効果」が「代替効果」を上回る場合に生じる。' +
      '価格上昇で実質所得が低下すると、その財が家計支出に占める比重が大きいため、より高価な代替財を諦めて、安価な必需品であるこの財の消費をかえって増やす。スコットランドの統計学者ロバート・ギッフェンにちなみ、アルフレッド・マーシャルが『経済学原理』（1890年）で言及・紹介して命名された（アイルランドのジャガイモ飢饉の逸話で知られるが、その実証性は長く論争的だった）。' +
      '近年、Jensen & Miller (2008) が中国の貧困地域の主食（湖南省の米・甘粛省の小麦）についてギッフェン行動を実証的に確認した。すべての下級財がギッフェン財ではないが、ギッフェン財は必ず下級財である。',
    keyFigures: 'ロバート・ギッフェン（名の由来）／A.マーシャル『経済学原理』(1890)が命名・紹介／所得効果>代替効果で需要法則に反する／下級財の一種／Jensen&Miller 2008の実証（中国の米・小麦）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/economics/giffen-good', type: 'reference', label: 'EBSCO Research Starters — Giffen good（百科事典的レファレンス）' },
      { url: 'https://www.nber.org/system/files/working_papers/w13243/w13243.pdf', type: 'academic', label: 'Jensen & Miller, "Giffen Behavior: Theory and Evidence"（NBER Working Paper w13243）' },
      { url: 'https://en.wikipedia.org/wiki/Giffen_good', type: 'reference', label: 'Wikipedia — Giffen good（突合用の二次情報源）' },
    ],
  },
  {
    id: 'econ-liquidity-preference',
    discipline: 'economics',
    title: '流動性選好',
    statement:
      'ジョン・メイナード・ケインズが『雇用・利子および貨幣の一般理論』(1936)で示した貨幣需要の理論。人々が富を、利子を生むが流動性の低い債券ではなく、最も流動性の高い貨幣の形で保有しようとする選好を指す。' +
      'ケインズは貨幣を保有する動機を3つに分類した：(1)取引動機（日常の支払いのため）、(2)予備的動機（不意の支出に備えるため）、(3)投機的動機（将来の利子率変動を見越して有利な時に債券を売買するため）。利子とは「流動性を手放すことへの対価（reward for parting with liquidity）」であり、貨幣需要（流動性選好）と貨幣供給とが利子率を決定するとした（利子率を貯蓄と投資で決まるとする古典派の貸付資金説と対比される）。' +
      '投機的動機による貨幣需要は利子率の減少関数であり、利子率が極端に低いと貨幣需要が無限に弾力的になる「流動性の罠」が生じうる。',
    keyFigures: 'J.M.ケインズ『一般理論』1936／取引・予備・投機の3動機／利子＝流動性を手放す対価／流動性選好と貨幣供給で利子率決定（古典派の貸付資金説と対比）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/liquidity-preference', type: 'reference', label: 'Britannica Money — Liquidity preference（権威ある百科事典）' },
      { url: 'https://www.ebsco.com/research-starters/economics/liquidity-preference-macroeconomic-theory', type: 'reference', label: 'EBSCO Research Starters — Liquidity preference (macroeconomic theory)' },
      { url: 'https://www.marxists.org/reference/subject/economics/keynes/general-theory/ch13.htm', type: 'academic', label: 'Keynes, The General Theory, Ch.13「The General Theory of the Rate of Interest」（一次資料）' },
    ],
  },
  {
    id: 'mgmt-pest-analysis',
    discipline: 'management',
    title: 'PEST分析（PESTLE分析）',
    statement:
      '企業を取り巻くマクロ環境（外部環境）を4つの観点から分析し、戦略立案の前提となる機会・脅威を把握するためのフレームワーク。Politics（政治：法規制・税制・政権の方針等）、Economy（経済：景気・金利・為替・物価等）、Society（社会：人口動態・ライフスタイル・価値観等）、Technology（技術：技術革新・特許・インフラ等）の頭字語である。' +
      '自社では統制できないマクロ要因を体系的に洗い出す点に意義があり、戦略マネジメントやマーケティングリサーチで広く用いられる。SWOT分析の外部環境（機会・脅威）の入力としても活用され、SWOTと組み合わせて使うと効果的とされる。近年はLegal（法律）とEnvironment（環境）を加えたPESTLE（PESTEL）分析へ拡張されることが多い。' +
      '原型は、F.J.アギュラーが1967年の著書『Scanning the Business Environment』で示した ETPS（経済・技術・政治・社会）にあるとされるが、頭字語PESTの確立経緯や帰属には諸説がある。',
    keyFigures: 'Politics・Economy・Society・Technologyのマクロ環境分析／SWOTの外部環境（機会・脅威）入力／PESTLE（Legal・Environment追加）へ拡張／原型はアギュラー1967 ETPSとされる（帰属に諸説あり）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/pest-analysis', type: 'reference', label: 'EBSCO Research Starters「PEST Analysis」（定義・4要素・戦略管理上の用途）' },
      { url: 'https://www.cipd.org/en/knowledge/factsheets/pestle-analysis-factsheet/', type: 'reference', label: 'CIPD（英国人材開発協会）ファクトシート「PESTLE analysis」（Legal・Environment追加、SWOTとの併用）' },
      { url: 'https://libguides.libraries.wsu.edu/c.php?g=294263&p=4358409', type: 'academic', label: 'Washington State University Libraries LibGuide「PESTEL Analysis」（外部環境分析ツールの解説）' },
      { url: 'https://en.wikipedia.org/wiki/PEST_analysis', type: 'reference', label: 'Wikipedia「PEST analysis」（アギュラー1967/ETPS起源説と帰属の議論）' },
    ],
  },
  {
    id: 'human-foot-in-the-door',
    discipline: 'human-science',
    title: 'フット・イン・ザ・ドア・テクニック（段階的要請法）',
    statement:
      'まず相手が断りにくい小さな要請を承諾させ、その後に本命のより大きな要請を行うと、最初から大きな要請をするよりも承諾を得やすくなるという説得・承諾誘導の技法。' +
      '一度小さな要請に応じると「自分は協力的な人間だ」という自己認知が更新され、その自己像と一貫した行動をとろうとする動機が働くため、後続の大きな要請にも応じやすくなると説明される（自己知覚理論／一貫性）。ジョナサン・フリードマンとスコット・フレイザーが1966年の論文で実証し、自宅の庭に大きな交通安全の看板を立てる要請の前に小さなステッカー等の依頼に応じた群では承諾率が約76%に達し、いきなり大きな要請をした統制群（約17%）を大きく上回った。' +
      '先に過大な要請をして断らせてから小さな本命要請に応じさせる「ドア・イン・ザ・フェイス」とは逆方向の技法である。',
    keyFigures: 'J.フリードマン&S.フレイザー 1966（Journal of Personality and Social Psychology）／小さな承諾→大きな承諾／一貫性・自己知覚理論（D.ベム）で説明／実験は承諾率 約76% vs 統制群 約17%／ドア・イン・ザ・フェイスと対照',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Foot-in-the-door_technique', type: 'reference', label: 'Wikipedia — Foot-in-the-door technique' },
      { url: 'https://www.simplypsychology.org/compliance.html', type: 'reference', label: 'Simply Psychology — Techniques of Compliance' },
      { url: 'https://psychology.iresearchnet.com/social-psychology/social-influence/foot-in-the-door-technique/', type: 'reference', label: 'iResearchNet (Psychology) — Foot-in-the-Door Technique' },
      { url: 'https://www.scu.edu/media/college-of-arts-and-sciences/psychology/documents/Burger-Guadagno-BASP-2003.pdf', type: 'academic', label: 'Burger & Guadagno (2003), Basic and Applied Social Psychology（Santa Clara University 配信PDF）' },
    ],
  },
  {
    id: 'bizlaw-worker-dispatch',
    discipline: 'business-law',
    title: '労働者派遣法',
    statement:
      '労働者派遣（派遣元事業主が雇用する労働者を、その雇用関係のもとで他人＝派遣先の指揮命令を受けて派遣先のために労働させること）の適正な運営と派遣労働者の保護を図る法律。正式名称は「労働者派遣事業の適正な運営の確保及び派遣労働者の保護等に関する法律」（昭和60年法律第88号）。1985年に制定され1986年に施行された。' +
      '当初は派遣可能業務を列挙する「ポジティブリスト」方式だったが、1999年改正で原則自由化され、禁止業務のみを定めるネガティブリスト方式となった。派遣元（雇用主）・派遣先（指揮命令）・派遣労働者という三者関係が特徴で、職業安定法が原則禁止する労働者供給事業の例外として位置づけられる。' +
      '2015年改正で派遣可能期間のルールが見直され、事業所単位・個人単位で原則3年の期間制限に統一された。2020年からは「同一労働同一賃金」（派遣労働者と派遣先労働者の不合理な待遇差の禁止）が施行された。',
    keyFigures: '労働者派遣法＝1985年制定・1986年施行（昭和60年法律第88号）／三者関係：派遣元=雇用・派遣先=指揮命令・派遣労働者／1999年改正で原則自由化（ネガティブリスト化）／2015年期間制限見直し（原則3年）・2020年同一労働同一賃金',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/360AC0000000088', type: 'government', label: 'e-Gov法令検索｜労働者派遣事業の適正な運営の確保及び派遣労働者の保護等に関する法律（昭和60年法律第88号）' },
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=75021000&dataType=0&pageNo=1', type: 'government', label: '厚生労働省｜労働者派遣法（昭和60年7月5日法律第88号）' },
      { url: 'http://www1.tcue.ac.jp/home1/takamatsu/107016/6.html', type: 'academic', label: '高崎経済大学｜労働者派遣法の歴史' },
    ],
  },
  {
    id: 'infosoc-information-cascade',
    discipline: 'information-sociology',
    title: '情報カスケード',
    statement:
      '個人が逐次的に意思決定する状況で、各人が自分自身の私的情報よりも、先行する他者の行動から推測される情報を重視し、自分の私的情報を無視して先行者の選択に追随する現象。' +
      '各人がベイズ的推論を行う合理的主体であっても生じる点が特徴で、ある段階以降は皆が先行者を模倣するため新たな情報伝達が止まり、誤った選択が集団全体に広がりうる。そのため脆く、わずかな新情報の流入でも崩れやすい。ビクチャンダニ、ハーシュライファー、ウェルチが1992年の論文（Journal of Political Economy）で定式化した。' +
      '流行・ファッション・口コミ・株式市場のバブル・SNSでのバイラル拡散などを説明し、群衆が必ずしも正しい情報を集約しない「集合知の失敗」の一形態である。社会的承認を求める同調圧力（規範的影響）とは異なり、他者の行動を現実についての証拠とみなす情報的影響に基づく。',
    keyFigures: 'ビクチャンダニ・ハーシュライファー・ウェルチ 1992（Journal of Political Economy）／私的情報を無視し先行者を模倣する逐次的意思決定／ベイズ的に合理的だが脆い／バブル・流行・バイラル拡散を説明／規範的影響（同調圧力）と区別される情報的影響',
    asOf: '2026-06',
    sources: [
      { url: 'https://sites.uci.edu/dhirshle/abstracts/a-theory-of-fads-fashion-custom-and-cultural-change-in-informational-cascades/', type: 'academic', label: 'David Hirshleifer (UC Irvine) — 原著論文 BHW 1992 のアブストラクト（著者本人ページ）' },
      { url: 'https://tamuz.caltech.edu/papers/cascades_survey.pdf', type: 'academic', label: 'Bikhchandani & Hirshleifer, "Information Cascades and Social Learning"（Caltech 配布のサーベイ）' },
      { url: 'https://en.wikipedia.org/wiki/Information_cascade', type: 'reference', label: 'Wikipedia "Information cascade" — 定義・ハーディングとの区別' },
      { url: 'https://blogs.cornell.edu/info2040/2017/11/24/informational-cascade-vs-herd-behavior/', type: 'academic', label: 'Cornell INFO 2040 course blog — 情報カスケード対群集行動の区別' },
    ],
  },
  {
    id: 'econ-bertrand-competition',
    discipline: 'economics',
    title: 'ベルトラン競争（価格競争モデル）',
    statement:
      '寡占市場で企業が「価格」を戦略変数として同時に設定して競争するモデル。数量を戦略変数とするクールノーモデル（A.クールノー1838）に対し、ジョセフ・ベルトランが1883年にクールノーの著書への書評の中で批判的に提示した。' +
      '同質財・限界費用一定・2企業という標準設定では、消費者は1円でも安い企業から全量を購入するため、各企業は相手をわずかに下回る価格を付けようと値下げ競争に陥り、ナッシュ均衡では価格が限界費用まで低下して企業の利潤がゼロになる（完全競争と同じ結果）。わずか2社でも競争的結果が生じるこの直観に反する帰結は「ベルトランのパラドックス」と呼ばれる。' +
      '容量制約・製品差別化・繰り返しゲームを導入すると、価格は限界費用を上回りパラドックスは緩和される。',
    keyFigures: 'J.ベルトラン1883（クールノー批判）／戦略変数は価格／同質財では価格=限界費用・利潤ゼロ＝ベルトランのパラドックス／クールノー（数量競争）と対比',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Bertrand_competition', type: 'reference', label: 'Wikipedia — Bertrand competition' },
      { url: 'https://en.wikipedia.org/wiki/Bertrand_paradox_(economics)', type: 'reference', label: 'Wikipedia — Bertrand paradox (economics)' },
      { url: 'https://link.springer.com/rwe/10.1007/978-1-349-58802-2_129', type: 'academic', label: 'The New Palgrave Dictionary of Economics — "Bertrand competition"（Springer Nature）' },
    ],
  },
  {
    id: 'mgmt-transaction-cost',
    discipline: 'management',
    title: '取引費用理論',
    statement:
      '市場での取引にも、相手の探索・交渉・契約の作成・履行の監視・紛争解決などのコスト（取引費用）がかかるとし、その大小によって、ある経済活動を「市場（外部調達）」で行うか「組織（内部化＝企業内）」で行うか（make or buy／組織の境界）が決まると説明する理論。' +
      'ロナルド・コースが1937年の論文「企業の本質（The Nature of the Firm）」で、企業が存在する理由を市場取引のコスト節約に求めたのが起源。オリバー・ウィリアムソンがこれを発展させ、人間の限定合理性と機会主義、取引の資産特殊性・不確実性・頻度といった要因が取引費用を高め、特殊資産を伴う取引ほど内部化（垂直統合）やハイブリッドなガバナンス構造が選ばれると体系化した。' +
      'コースは1991年、ウィリアムソンは2009年にノーベル経済学賞を受賞した。',
    keyFigures: 'R.コース1937「企業の本質」（理論の起源・1991年ノーベル賞）／O.ウィリアムソン（限定合理性・機会主義・資産特殊性、2009年ノーベル賞）／市場か組織か＝組織の境界',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1991/press-release/', type: 'reference', label: 'NobelPrize.org — 1991年ノーベル経済学賞 プレスリリース（コース：取引費用と財産権）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2009/summary/', type: 'reference', label: 'NobelPrize.org — 2009年ノーベル経済学賞（ウィリアムソン：経済ガバナンス・企業の境界）' },
      { url: 'https://www.britannica.com/money/transaction-cost', type: 'reference', label: 'Britannica Money — Transaction cost（限定合理性・資産特殊性・ガバナンス構造）' },
    ],
  },
  {
    id: 'human-planning-fallacy',
    discipline: 'human-science',
    title: '計画錯誤（計画の誤謬）',
    statement:
      'あるタスクの完了に必要な時間・コスト・リスクを、過去の類似経験からすれば明らかに不足するにもかかわらず、楽観的に過小評価してしまう傾向。ダニエル・カーネマンとエイモス・トベルスキーが1979年（論文「Intuitive Prediction」）に提唱した。' +
      '自分の計画では各人が最良のシナリオ（うまくいく場合）に注目し、過去の同種タスクの実績（基準率・分布情報）を軽視する「内側からの視点」を取るため生じるとされる。当人の計画は過小評価される一方、他者のタスクはむしろ悲観的に見積もられる非対称性も指摘される（ビューラー、グリフィン&ロス1994）。' +
      '対策として、外部の類似事例の分布から見積もる「外側からの視点（outside view）／参照クラス予測」が有効とされ（ロヴァロ&カーネマン、フリヴュビヤの大型公共事業研究等）、建設・ITプロジェクトの恒常的な納期・予算超過の一因とされる。',
    keyFigures: 'D.カーネマン&A.トベルスキー1979提唱（「Intuitive Prediction」）／最良シナリオ重視・基準率軽視の「内側からの視点」で過小評価／非対称性（Buehler, Griffin & Ross 1994）／対策＝外側からの視点・参照クラス予測（Flyvbjerg）',
    asOf: '2026-06',
    sources: [
      { url: 'https://web.mit.edu/curhan/www/docs/Articles/biases/67_J_Personality_and_Social_Psychology_366,_1994.pdf', type: 'academic', label: 'Buehler, Griffin & Ross (1994), "Exploring the Planning Fallacy", Journal of Personality and Social Psychology 67(3):366–381（MIT 配信PDF）' },
      { url: 'https://spsp.org/news-center/character-context-blog/planning-fallacy-inside-view', type: 'academic', label: 'Society for Personality and Social Psychology (SPSP) — "The Planning Fallacy: An Inside View"' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S0065260110430014', type: 'academic', label: 'Buehler, Griffin & Peetz (2010), "The Planning Fallacy", Advances in Experimental Social Psychology（ScienceDirect）' },
      { url: 'https://en.wikipedia.org/wiki/Planning_fallacy', type: 'reference', label: 'Wikipedia — Planning fallacy（概観の補強）' },
    ],
  },
  {
    id: 'bizlaw-bona-fide-acquisition',
    discipline: 'business-law',
    title: '即時取得（善意取得・民法192条）',
    statement:
      '取引行為によって、平穏かつ公然と動産の占有を始めた者が、善意・無過失であるときは、たとえその動産を譲り渡した相手が真の権利者（所有者）でなくても、即時にその動産の所有権を取得できるという制度（民法192条）。' +
      '動産取引の安全と迅速を保護するため、占有という外観を信頼した取得者を保護する公信の原則の現れである。要件は、(1)動産であること（不動産・登録された自動車等は対象外）、(2)有効な取引行為に基づくこと、(3)平穏・公然・善意・無過失で占有を取得したこと。' +
      'ただし占有物が盗品・遺失物である場合は、被害者・遺失者は盗難・遺失の時から2年間は占有者にその物の回復を請求できる（民法193条）という例外がある。',
    keyFigures: '即時取得＝民法192条（善意・無過失で動産の所有権を即時取得）／公信の原則・取引安全の保護／要件：動産・有効な取引・平穏公然善意無過失／盗品遺失物の2年回復請求の例外（193条、起算点は盗難・遺失の時）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号）第192条・第193条' },
      { url: 'https://www.japaneselawtranslation.go.jp/ja/laws/view/4848/ja', type: 'government', label: '日本法令外国語訳DBシステム（法務省）民法' },
      { url: 'https://law.meijo-u.ac.jp/staff/contents/66-4/660402_sugiura.pdf', type: 'academic', label: '名城大学 法学部 即時取得（民法192条）に関する論文PDF' },
    ],
  },
  {
    id: 'infosoc-digital-natives',
    discipline: 'information-sociology',
    title: 'デジタルネイティブ',
    statement:
      '生まれたときから、あるいは物心ついた頃からインターネット・コンピュータ・携帯端末などのデジタル技術が当たり前に存在する環境で育った世代を指す概念。教育コンサルタントのマーク・プレンスキー（Marc Prensky）が2001年の論考「Digital Natives, Digital Immigrants」で提唱し、デジタル技術に後から適応した上の世代を「デジタル移民（digital immigrants）」と対比した。' +
      'プレンスキーは、ネイティブ世代は並行処理（マルチタスク）や視覚的・即時的な情報処理を好み、ネットワーク環境で力を発揮する一方、従来型の教育とのミスマッチが生じると論じた。' +
      'ただしこの概念は、年齢で一律にデジタル能力を仮定するのは過度な単純化で実証的裏付けが弱い（原論文は科学的研究ではない）、世代内の格差（第二のデジタルデバイド／デジタル不平等）を見落とす、という学術的批判を多く受けており、教育研究者からは「モラル・パニック」になぞらえられている。',
    keyFigures: 'マーク・プレンスキー2001「Digital Natives, Digital Immigrants」／デジタル移民との対比／Bennett, Maton & Kervin 2008の批判（実証的根拠の弱さ・モラルパニック）／Helsper & Eynon（LSE）：世代内格差を強調',
    asOf: '2026-06',
    sources: [
      { url: 'http://www.technologysource.org/article/digital_natives_digital_immigrants/', type: 'reference', label: 'Prensky, M. (2001) "Digital Natives, Digital Immigrants" — 原典（On the Horizon 掲載版）' },
      { url: 'https://link.springer.com/rwe/10.1007/978-1-4614-6439-6_101949-1', type: 'academic', label: 'Springer Nature "Digital Native"（Encyclopedia of Educational Philosophy and Theory）— 概念定義と批判的評価' },
      { url: 'https://bera-journals.onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-8535.2007.00793.x', type: 'academic', label: 'Bennett, Maton & Kervin (2008) "The digital natives debate: A critical review of the evidence", British Journal of Educational Technology 39(5):775–786' },
      { url: 'https://eprints.lse.ac.uk/27739/1/Digital_natives_(LSERO).pdf', type: 'academic', label: 'Helsper & Eynon, "Digital natives: where is the evidence?"（London School of Economics リポジトリ）— 実証的批判' },
    ],
  },
  {
    id: 'econ-kuznets-curve',
    discipline: 'economics',
    title: 'クズネッツ曲線',
    statement:
      '経済発展（一人当たり所得）の初期段階では所得の不平等が拡大し、ある転換点を過ぎると不平等が縮小していくという、逆U字型の関係を表す仮説。サイモン・クズネッツが1955年の論文・会長講演「Economic Growth and Income Inequality」（American Economic Review）で提示した。' +
      '農業中心の経済から工業化が進む過程で、農村から都市への労働移動や産業構造の変化により都市・農村間の格差が一旦拡大し、その後、教育の普及・再分配政策・民主化や福祉国家化・産業の成熟とともに縮小していくと説明される。' +
      'ただしその後の各国データでは逆U字が必ずしも成立せず（一部ラテンアメリカ諸国を除くと関係が崩れる、近年の先進国では不平等が再拡大）、仮説の一般性には批判・反証も多い。所得を環境汚染に置き換えた「環境クズネッツ曲線」など派生概念もある。クズネッツはGNP統計の整備など経済成長の実証的解明への貢献により、1971年にノーベル経済学賞を受賞した。',
    keyFigures: 'サイモン・クズネッツ1955「Economic Growth and Income Inequality」(AER)／所得と不平等の逆U字仮説／実証的反証・批判が多い／環境クズネッツ曲線へ派生／クズネッツ1971ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1971/kuznets/facts/', type: 'reference', label: 'NobelPrize.org — Simon Kuznets, Prize in Economic Sciences 1971 (Facts)' },
      { url: 'https://www.ebsco.com/research-starters/economics/kuznets-curve', type: 'reference', label: 'EBSCO Research Starters (Economics) — Kuznets Curve' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/environmental-kuznets-curves', type: 'reference', label: 'Encyclopedia.com — Environmental Kuznets Curves（派生概念）' },
    ],
  },
  {
    id: 'econ-pigouvian-tax',
    discipline: 'economics',
    title: 'ピグー税',
    statement:
      '負の外部性（公害・汚染など、取引の当事者が負担せず第三者や社会が被る社会的費用）を発生させる経済活動に対し、その外部費用に等しい額の税を課す是正手段。これにより私的費用を社会的費用に一致させ、外部性を内部化して資源配分を効率化し、社会的に最適な生産・消費水準を実現しようとする。' +
      'アーサー・セシル・ピグー（1877–1959）が『厚生経済学』(1920)で示した、限界私的費用と限界社会的費用の乖離を税・補助金で是正するという考え方に由来し命名された（ピグー自身はマーシャルの外部性概念を発展させた）。逆に正の外部性には外部便益分を補助するピグー的補助金が対応する。炭素税が代表例（ほかタバコ税・砂糖税など）。' +
      '市場メカニズムを通じて外部性を是正する点で直接規制と対比され、当事者間の交渉による解決を説くコースの定理とも対比される。実務上は外部費用を正確に計測することが難しい等の課題がある。',
    keyFigures: 'A.C.ピグー『厚生経済学』(1920)／負の外部性に外部費用分を課税し内部化（私的費用＝社会的費用へ）／炭素税が代表例／正の外部性にはピグー的補助金／直接規制・コースの定理と対比',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Pigouvian-tax', type: 'reference', label: 'Encyclopaedia Britannica — Pigouvian tax' },
      { url: 'https://taxfoundation.org/taxedu/glossary/pigouvian-tax/', type: 'reference', label: 'Tax Foundation (TaxEDU) — Pigouvian Tax Definition' },
      { url: 'https://energyeducation.ca/encyclopedia/Pigouvian_subsidy', type: 'academic', label: 'Energy Education (University of Calgary) — Pigouvian subsidy' },
      { url: 'https://en.wikipedia.org/wiki/Pigouvian_tax', type: 'reference', label: 'Wikipedia — Pigouvian tax' },
    ],
  },
  {
    id: 'econ-wage-rigidity',
    discipline: 'economics',
    title: '名目賃金の下方硬直性',
    statement:
      '名目賃金が、労働需要の減少や物価下落に直面しても下方には調整されにくい（下がりにくい）という現象。ケインズが『一般理論』(1936)で、賃金が硬直的なために労働市場が需給均衡せず非自発的失業が生じうると論じたことに端を発する。' +
      '賃金が下がりにくい理由として、長期労働契約・最低賃金や労働組合などの制度、労働者の貨幣錯覚や公平性規範（賃下げは士気・生産性を下げる）、効率賃金的な配慮などが挙げられる。' +
      '下方硬直性があると、不況期に実質賃金が高止まりして雇用調整が数量（解雇・採用抑制）で起こりやすく、また低インフレ下では実質賃金を引き下げる調整余地が小さくなるため、適度なインフレが「労働市場の潤滑油」として機能するという議論（Tobin等）の根拠ともなる。効率賃金（efficiency wage）とは別概念であり、効率賃金は硬直性を生む一要因にとどまる。',
    keyFigures: '名目賃金が下方に調整されにくい現象／ケインズ『一般理論』1936に淵源（賃金硬直→非自発的失業）／要因：長期契約・組合・最低賃金・公平性規範・貨幣錯覚・効率賃金的配慮／低インフレで調整余地縮小＝インフレの潤滑油論（Tobin）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/involuntary-unemployment', type: 'reference', label: 'Encyclopaedia Britannica — Involuntary unemployment（ケインズ経済学）' },
      { url: 'https://www.frbsf.org/research-and-insights/publications/economic-letter/2013/07/wages-unemployment-rate/', type: 'government', label: 'Federal Reserve Bank of San Francisco Economic Letter (Daly & Hobijn, 2013) — downward nominal wage rigidity' },
      { url: 'https://www.nber.org/system/files/chapters/c8882/c8882.pdf', type: 'academic', label: 'NBER — "Does Inflation Grease the Wheels of the Labor Market?"（Tobinの潤滑油仮説）' },
    ],
  },
  {
    id: 'mgmt-innovators-dilemma',
    discipline: 'management',
    title: 'イノベーションのジレンマ（破壊的イノベーション）',
    statement:
      '優良企業が、既存顧客の声に耳を傾け持続的イノベーション（既存製品の性能改善）に資源を集中する合理的な経営を行うがゆえに、当初は性能が低く利益率も低い「破壊的イノベーション（disruptive innovation）」への対応が遅れ、結果として新規参入企業に市場を奪われ敗れてしまうというジレンマ。' +
      'クレイトン・クリステンセンが1997年の著書『The Innovator\'s Dilemma』で提示した。破壊的技術は当初ローエンド市場や新市場で安価・単純な製品として登場し、やがて性能を高めて主流市場を侵食する。優良企業の「正しい経営判断」こそが失敗を招く点に逆説がある。' +
      'なお後年、破壊的イノベーション理論の適用や定義をめぐっては学術的な論争・批判もある（例：J.レポアの批判、および著者自身による2015年の再整理）。',
    keyFigures: 'C.クリステンセン1997『The Innovator\'s Dilemma』／持続的イノベーション対破壊的イノベーション／優良企業の合理的判断が失敗を招く逆説／ローエンド・新市場から主流を侵食／適用をめぐる学術的論争（Lepore批判・2015年HBR再整理）',
    asOf: '2026-06',
    sources: [
      { url: 'https://online.hbs.edu/blog/post/4-keys-to-understanding-clayton-christensens-theory-of-disruptive-innovation', type: 'academic', label: 'Harvard Business School Online — What Is Disruptive Innovation Theory? 4 Key Concepts' },
      { url: 'https://hbr.org/2015/12/what-is-disruptive-innovation', type: 'academic', label: 'Christensen, Raynor & McDonald (2015), "What Is Disruptive Innovation?", Harvard Business Review' },
      { url: 'https://en.wikipedia.org/wiki/The_Innovator%27s_Dilemma', type: 'reference', label: 'Wikipedia — The Innovator\'s Dilemma (1997, Christensen)' },
      { url: 'https://www.christenseninstitute.org/theory/disruptive-innovation/', type: 'reference', label: 'Christensen Institute — Disruptive Innovation Theory' },
    ],
  },
  {
    id: 'human-cognitive-load',
    discipline: 'human-science',
    title: '認知負荷理論',
    statement:
      '人間のワーキングメモリ（作業記憶）が一度に処理できる情報量は限られているという制約を前提に、学習と教材設計を論じる理論。教育心理学者ジョン・スウェラーが1980年代後半（1988年の論文 "Cognitive load during problem solving" が代表的）に問題解決研究から提唱した。' +
      '認知負荷は3種類に分けられる。(1)課題内在性負荷（intrinsic load＝学習内容そのものの複雑さ・要素間相互作用および学習者の事前知識に起因）、(2)課題外在性負荷（extraneous load＝まずい教材設計や不要な情報処理に起因し、削減すべきもの）、(3)学習関連負荷（germane load＝スキーマ構築など学習に資する処理）。これら3負荷は加算的とみなされ、合計がワーキングメモリ容量を超えると認知的過負荷が生じる。' +
      '外在性負荷を減らし内在性負荷を適切に管理することで、限られたワーキングメモリを効果的な学習へ振り向けられるとし、ワークト・イグザンプル効果や分割注意効果など多くの教授設計原理の基礎となっている。',
    keyFigures: 'ジョン・スウェラー（ニューサウスウェールズ大学）が1980年代後半に提唱（代表的論文1988年）／ワーキングメモリの容量制約／認知負荷の3区分：内在性・外在性・学習関連（加算的で総和が容量超で過負荷）／外在性負荷の削減＝教材設計の指針／ワークト・イグザンプル効果',
    asOf: '2026-06',
    sources: [
      { url: 'https://link.springer.com/article/10.1007/s10648-019-09465-5', type: 'academic', label: 'Sweller et al., "Cognitive Architecture and Instructional Design: 20 Years Later", Educational Psychology Review（Springer 査読誌）' },
      { url: 'https://en.wikipedia.org/wiki/Cognitive_load', type: 'reference', label: 'Wikipedia「Cognitive load」（3負荷の加算性・容量制約・過負荷の定義）' },
      { url: 'https://www.instructionaldesign.org/theories/cognitive-load/', type: 'reference', label: 'InstructionalDesign.org「Cognitive Load Theory (John Sweller)」（理論概要・外在性負荷削減）' },
      { url: 'https://bpspsychub.onlinelibrary.wiley.com/doi/abs/10.1111/j.2044-8279.1992.tb01017.x', type: 'academic', label: 'Chandler & Sweller, "The split-attention effect…", British Journal of Educational Psychology（Wiley 査読誌）' },
    ],
  },
  {
    id: 'bizlaw-land-lease-act',
    discipline: 'business-law',
    title: '借地借家法',
    statement:
      '建物の所有を目的とする土地の賃借権（借地権）や、建物の賃貸借（借家）について、立場の弱い借主を保護するため民法の特則を定めた法律。1991年（平成3年）公布・1992年（平成4年）施行で、従来の借地法・借家法・建物保護ニ関スル法律を統合・現代化したもの。' +
      '主な内容として、(1)期間満了時に賃貸人が更新を拒絶するには「正当事由」が必要で、借地・借家契約は法定更新されやすく、借主の居住・営業の安定を保護する、(2)借地権の存続期間に関する規定、(3)建物賃借人（借家人）の対抗要件は建物の引渡しで足り、借地権は借地上の建物の登記で対抗できる、(4)賃料増減額請求権、などがある。' +
      '施行に際し更新のない「定期借地権」が新設され、後の改正で「定期借家（定期建物賃貸借）」も導入され、契約自由の要請にも配慮された。',
    keyFigures: '借地借家法＝平成3年（1991年）公布・平成4年（1992年）施行（旧借地法・借家法・建物保護法を統合）／更新拒絶に正当事由が必要＝法定更新で借主保護／対抗要件＝借地は借地上建物の登記・借家は建物の引渡し／定期借地権を新設・後の改正で定期借家を導入',
    asOf: '2026-06',
    sources: [
      { url: 'https://hourei.ndl.go.jp/simple/detail?lawId=0000077611&current=-1', type: 'government', label: '日本法令索引（国立国会図書館）借地借家法 平成3年10月4日法律第90号' },
      { url: 'https://www.moj.go.jp/MINJI/minji07_00304.html', type: 'government', label: '法務省「借地借家法等の改正（定期借地権・定期建物賃貸借関係）について」' },
      { url: 'https://kotobank.jp/word/%E5%80%9F%E5%9C%B0%E5%80%9F%E5%AE%B6%E6%B3%95-167983', type: 'reference', label: 'コトバンク（日本大百科全書ほか）「借地借家法」' },
    ],
  },
  {
    id: 'infosoc-propaganda-model',
    discipline: 'information-sociology',
    title: 'プロパガンダ・モデル',
    statement:
      'エドワード・S・ハーマンとノーム・チョムスキーが1988年の著書『Manufacturing Consent: The Political Economy of the Mass Media（合意の捏造／マニュファクチャリング・コンセント）』で提示した、マスメディアの報道内容がどのように体制（エリート）寄りに偏向するかを説明する構造的モデル。' +
      '直接の検閲によるものではなく、市場原理と制度的要因によってニュースが「フィルタリング」されると論じ、5つのフィルターを挙げる：(1)メディア企業の規模・集中的所有・所有者の富・利潤志向、(2)広告収入への依存、(3)政府・企業・公認の「専門家」など権力ある情報源への依存、(4)権力側からの批判・圧力（フラック, flak）、(5)共通の敵とされる統制イデオロギー（当初は「反共産主義」）。' +
      'これらの結果、メディアはエリートの利益に沿う「合意の製造」を行うとする。決定論的・実証性をめぐる批判もあるが、批判的メディア研究の代表的枠組みである。なお書名はW・リップマン『世論』(1922)の「manufacture of consent」に由来する。',
    keyFigures: 'E.ハーマン&N.チョムスキー1988『Manufacturing Consent』／5つのフィルター（所有・広告・情報源・フラック・反共/敵イデオロギー）／検閲によらず市場・制度でニュースが偏向＝合意の製造',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Manufacturing-Consent-The-Political-Economy-of-the-Mass-Media', type: 'reference', label: 'Encyclopaedia Britannica「Manufacturing Consent: The Political Economy of the Mass Media」' },
      { url: 'https://eric.ed.gov/?id=EJ846793', type: 'academic', label: 'ERIC EJ846793, "The Applicability of Herman\'s and Chomsky\'s Propaganda Model Today", College Quarterly (2005)' },
      { url: 'https://www.westminsterpapers.org/article/129/', type: 'academic', label: 'Westminster Papers in Communication and Culture「The Propaganda Model: Theoretical and Methodological Considerations」（査読学術誌）' },
      { url: 'https://opentextbc.ca/mediastudies101/chapter/the-propaganda-model/', type: 'academic', label: 'Media Studies 101, BCcampus OpenTextBC（大学オープン教科書）' },
    ],
  },
  {
    id: 'econ-tobins-q',
    discipline: 'economics',
    title: 'トービンのq',
    statement:
      '企業（または資本）の市場価値を、その資産の再取得（再調達）費用で割った比率。ジェームズ・トービンが提唱した投資理論の指標で、q＝市場価値÷資本の再取得費用。' +
      'q>1なら市場は資本を再取得費用以上に評価しており、新規投資（資本の追加）は企業価値を高めるので投資が促進される。q<1なら投資は割に合わず抑制される。これにより、企業の設備投資水準が株式市場の評価と関連づけて説明される。理論的に投資決定に対応するのは「限界のq」（追加1単位の投資がもたらす将来利益の割引現在価値を投資財価格で割った比）だが、実証では計測しやすい「平均のq」（既存資本の市場価値をその再取得費用で割った比）が用いられることが多い。' +
      'トービンは資産選択・ポートフォリオ理論等の金融市場分析への貢献で1981年ノーベル経済学賞を受賞した。',
    keyFigures: 'J.トービン提唱／q＝市場価値÷資本の再取得費用／q>1で投資促進・q<1で抑制／限界のq（理論）と平均のq（実証）／トービン1981ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1981/press-release/', type: 'reference', label: 'NobelPrize.org — The Prize in Economics 1981, Press release（市場価値／再取得費用の比とq>1の解釈、受賞理由）' },
      { url: 'https://www.britannica.com/topic/Tobins-q', type: 'reference', label: 'Encyclopaedia Britannica — Tobin\'s q（資産の市場価値の再取得費用に対する比、q>1で新規投資が有利）' },
      { url: 'https://en.wikipedia.org/wiki/Tobin%27s_q', type: 'reference', label: 'Wikipedia — Tobin\'s q（市場価値÷再取得費用、限界q／平均qの区別）' },
    ],
  },
  {
    id: 'econ-menu-costs',
    discipline: 'economics',
    title: 'メニューコスト',
    statement:
      '企業が価格を変更する際にかかる費用のこと。語源は、レストランがメニュー表を刷り直すコストの比喩。価格表の改訂・値札の貼り替え・顧客への通知・意思決定や交渉のコストなどを含む。' +
      'ニューケインジアン経済学では、このメニューコストの存在が、企業が需要や費用の変化に応じて価格を即座に調整せず据え置く「価格の硬直性（名目硬直性）」のミクロ的基礎の一つとして説明される。個々の企業にとって価格改定を見送る損失は小さくても、価格硬直性が経済全体では総需要ショックを実質変数（生産・雇用）に波及させ、景気変動を増幅する大きな影響を持ちうる。' +
      'グレゴリー・マンキュー（1985, QJE「Small Menu Costs and Large Business Cycles」）やアカロフ＆イエレンらが、小さなメニューコストが大きな景気的帰結を生みうることを示した。インフレ下では企業が価格改定をより頻繁に行い、メニューコストの発生も増える。',
    keyFigures: '価格変更に伴う費用（メニュー刷り直しの比喩）／ニューケインジアンの価格硬直性（名目硬直性）のミクロ的基礎／小さなメニューコストが大きな景気変動を生む（マンキュー1985・アカロフ&イエレン）／インフレで価格改定頻度増',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.federalreserve.gov/econres/feds/files/2024005pap.pdf', type: 'government', label: 'Federal Reserve Board, FEDS "Nonlinear Inflation Dynamics in Menu Cost Economies" (2024)' },
      { url: 'https://www.clevelandfed.org/publications/working-paper/2019/wp-1923-price-points-menu-costs-price-rigidity', type: 'government', label: 'Federal Reserve Bank of Cleveland WP 19-23, "The Roles of Price Points and Menu Costs in Price Rigidity"' },
      { url: 'https://scholar.harvard.edu/files/mankiw/files/small_menu_costs.pdf', type: 'academic', label: 'N.G. Mankiw, "Small Menu Costs and Large Business Cycles," Quarterly Journal of Economics (1985)（Harvard 配信）' },
      { url: 'https://www.econlib.org/library/Enc/NewKeynesianEconomics.html', type: 'reference', label: 'N.G. Mankiw, "New Keynesian Economics," The Concise Encyclopedia of Economics（Econlib）' },
    ],
  },
  {
    id: 'mgmt-product-life-cycle',
    discipline: 'management',
    title: 'プロダクト・ライフサイクル（製品ライフサイクル）',
    statement:
      '製品が市場に登場してから姿を消すまでの過程を、生物の一生になぞらえて4つの段階で捉え、各段階に応じたマーケティング戦略をとるべきとする概念。' +
      '(1)導入期：市場投入直後で認知が低く売上は小さい。開発費・販促費がかさみ利益はマイナスになりがち。(2)成長期：需要が急拡大し売上・利益が伸びる一方、競合の参入が増える。(3)成熟期：市場が飽和して売上の伸びが鈍化し、価格競争が激化して差別化・シェア維持が課題となる。(4)衰退期：売上が減少し、撤退や再活性化を検討する。各段階で製品・価格・流通・販促（マーケティング・ミックス）の重点が変わる。' +
      'セオドア・レビットが1965年のHBR論文「Exploit the Product Life Cycle」で経営実務に広めたが、概念の起源には諸説があり（例：1950年のジョエル・ディーンの議論が先行とされる）、特定の一人に帰すのは難しい。また「すべての製品が同じ曲線を描くわけではない」との批判もある。',
    keyFigures: '導入期・成長期・成熟期・衰退期の4段階／各段階で異なるマーケティング戦略／T.レビット1965 HBRが普及（起源は諸説、ディーン1950が先行）／全製品が同曲線ではないとの批判',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/1965/11/exploit-the-product-life-cycle', type: 'academic', label: 'Theodore Levitt, "Exploit the Product Life Cycle", Harvard Business Review, 1965（概念を実務に普及させた一次文献）' },
      { url: 'https://link.springer.com/rwe/10.1007/978-1-349-58802-2_1344', type: 'academic', label: 'SpringerLink（The Palgrave Encyclopedia of Strategic Management）"Product Life Cycle"（定義・4段階）' },
      { url: 'https://core.ac.uk/download/pdf/62433731.pdf', type: 'academic', label: '学術論文 "Origins and Development of the Product Life Cycle Concept"（起源と発展・批判の整理）' },
      { url: 'https://pressbooks.pub/agreatmarketingtextbook/chapter/introduction-to-product-life-cycle/', type: 'academic', label: 'オープン教科書 "A Great Marketing Textbook"（4段階と全製品同曲線ではない点）' },
    ],
  },
  {
    id: 'human-peak-end-rule',
    discipline: 'human-science',
    title: 'ピーク・エンドの法則',
    statement:
      '人が過去の経験を全体として評価・記憶する際、その経験の「最も感情が強かった瞬間（ピーク）」と「終わり方（エンド）」の2点が支配的で、経験の持続時間や各瞬間の総和はあまり考慮されない、という傾向。心理学者ダニエル・カーネマンがバーバラ・フレドリクソンらとともに1990年代に提唱した。' +
      '関連して、苦痛などの経験の長さがその評価にほとんど影響しない「持続時間の無視（duration neglect）」も指摘される。レデルマイヤーとカーネマンの大腸内視鏡検査などの研究（Pain誌, 1996）では、検査時間が長くても最後を穏やかに終えた患者の方が、短くても痛みのピークで終えた患者より「つらさ」の記憶が小さいことが示された。' +
      'これは、その瞬間ごとに感じる「経験する自己」と、後から評価する「記憶する自己」の乖離を示す例として、サービス設計・患者ケア・UXなどに応用される。',
    keyFigures: 'D.カーネマンら（B.フレドリクソン）が1990年代に提唱／評価はピークと終わりの2点に支配される／持続時間の無視（duration neglect）／大腸内視鏡実験（Redelmeier & Kahneman, Pain 1996）／経験する自己と記憶する自己の乖離',
    asOf: '2026-06',
    sources: [
      { url: 'https://pubmed.ncbi.nlm.nih.gov/8857625/', type: 'academic', label: 'Redelmeier & Kahneman (1996), "Patients\' memories of painful medical treatments", Pain 66(1):3–8（PubMed, PMID 8857625）' },
      { url: 'https://en.wikipedia.org/wiki/Peak%E2%80%93end_rule', type: 'reference', label: 'Wikipedia — Peak–end rule' },
      { url: 'https://www.behavioraleconomics.com/resources/mini-encyclopedia-of-be/peak-end-rule/', type: 'reference', label: 'BehavioralEconomics.com Mini-Encyclopedia of BE — Peak-end rule' },
      { url: 'https://kahneman.scholar.princeton.edu/document/7', type: 'academic', label: 'Daniel Kahneman scholar archive — Princeton University' },
    ],
  },
  {
    id: 'bizlaw-unjust-enrichment',
    discipline: 'business-law',
    title: '不当利得（民法703条・704条）',
    statement:
      '法律上の正当な原因がないのに、他人の財産または労務によって利益を受け、そのために他人に損失を及ぼした者に、その利益の返還義務を負わせる制度（民法703条以下）。公平の理念に基づき、正当な理由のない財産的価値の移動を矛盾なく調整することを目的とする。' +
      '返還の範囲は受益者の善意・悪意で異なり、善意の受益者は「その利益の存する限度（現存利益）」で返還すれば足りる（703条）のに対し、悪意の受益者は受けた利益に利息を付して返還し、なお損害があれば賠償責任も負う（704条）。' +
      'なお、債務がないことを知りながら弁済した場合の非債弁済（705条）や不法原因給付（708条）など、返還請求が認められない例外もある。',
    keyFigures: '不当利得＝民法703条以下（法律上の原因なく利益・他人に損失→返還義務）／公平の理念／善意受益者は現存利益(703条)・悪意受益者は利息付返還+賠償(704条)／非債弁済(705条)・不法原因給付(708条)の例外',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089/', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号）第三編債権 第四章不当利得 第703条—第708条' },
      { url: 'https://da.lib.kobe-u.ac.jp/da/kernel/81005103/81005103.pdf', type: 'academic', label: '神戸大学附属図書館リポジトリ「不法原因給付に関する一つの覚書」（民法708条）' },
      { url: 'https://ja.wikibooks.org/wiki/%E6%B0%91%E6%B3%95%E7%AC%AC703%E6%9D%A1', type: 'reference', label: 'Wikibooks 民法第703条（不当利得の返還義務）条文' },
    ],
  },
  {
    id: 'infosoc-hypodermic-needle',
    discipline: 'information-sociology',
    title: '弾丸理論（皮下注射モデル）',
    statement:
      'マスメディアが発するメッセージは、受け手である大衆に直接的・一様かつ強力に作用し、注射器で薬を注入する（皮下注射）、あるいは銃弾を撃ち込む（magic bullet）ように、意図した効果をそのまま生み出すとする初期のマスコミュニケーション効果理論。受け手を受動的で均質な「原子化された大衆」とみなす。' +
      '20世紀前半、第一次大戦のプロパガンダ（ラスウェル）やナチスの宣伝、ラジオ「宇宙戦争」放送（1938）のパニック逸話などを背景に広まった強力効果論である。しかしラザースフェルドらの選挙研究『ピープルズ・チョイス』（1944）で、メディアの効果は対人的影響（オピニオンリーダー）や受け手の素因に媒介されることが示され、2段の流れ仮説や限定効果論へと修正された。' +
      'なお弾丸理論は後世に整理・命名された側面が強く、当時厳密に定式化された単一理論であったかには留保もある。',
    keyFigures: '初期の強力効果論（メディアが大衆に直接・一様・強力に作用、注射／銃弾の比喩）／原子化された受動的・均質な大衆観／第一次大戦プロパガンダ・ナチス宣伝・「宇宙戦争」放送を背景／ラザースフェルド『ピープルズ・チョイス』1944で否定→限定効果論・2段の流れへ／後世の命名で単一理論性には留保',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/hypodermic-needle-theory-magic-bullet-theory', type: 'reference', label: 'EBSCO Research Starters — Hypodermic Needle Theory (Magic Bullet Theory)' },
      { url: 'https://courses.lumenlearning.com/introductiontocommunication/chapter/grounding-theories-of-mass-communication/', type: 'academic', label: 'Lumen Learning (OER大学教材) — Grounding Theories of Mass Communication' },
      { url: 'https://en.wikipedia.org/wiki/Two-step_flow_of_communication', type: 'reference', label: 'Wikipedia — Two-step flow of communication（Lazarsfeld他 The People\'s Choice 1944）' },
      { url: 'https://en.wikipedia.org/wiki/Hypodermic_needle_model', type: 'reference', label: 'Wikipedia — Hypodermic needle model' },
    ],
  },
  {
    id: 'econ-fiscal-multiplier',
    discipline: 'economics',
    title: '乗数効果（財政乗数）',
    statement:
      '政府支出や投資など独立支出の増加が、それと同額以上に国民所得（GDP）を増加させる波及効果。最初の支出が誰かの所得となり、その一部が消費に回って別の人の所得を生む、という連鎖が繰り返されることで、当初の支出を上回る総需要・所得の増加が生じる。' +
      'ケインズ経済学の中核概念で、単純なモデルでは政府支出乗数＝1/(1−限界消費性向(MPC))と表され、MPCが大きいほど乗数は大きい（例：MPC=0.8なら乗数=5）。概念の起源はリチャード・カーンの雇用乗数(1931年, Economic Journal)にあり、ケインズが投資乗数として発展させた（『一般理論』1936年）。' +
      '租税・輸入(漏出)・貨幣的要因（政府借入に伴う金利上昇によるクラウディングアウト）等は乗数を小さくする。乗数の大きさは景気局面に依存し（不況期や金融緩和下・ゼロ金利制約下では大きくなる）、実証的な推定値をめぐっては論争がある。',
    keyFigures: '独立支出増→所得増→消費増の連鎖で総需要が当初支出以上に増加／単純乗数＝1/(1−MPC)／R.カーンの雇用乗数(1931)に起源・ケインズが投資乗数として発展(一般理論1936)／クラウディングアウト等で縮小・推定値は論争的',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.imf.org/external/pubs/ft/tnm/2014/tnm1404.pdf', type: 'government', label: 'IMF Technical Notes and Manuals: Fiscal Multipliers — Size, Determinants, and Use in Macroeconomic Projections (2014)' },
      { url: 'https://www.imf.org/external/pubs/ft/wp/2012/wp12286.pdf', type: 'government', label: 'IMF Working Paper WP/12/286: Fiscal Multipliers and the State of the Economy (2012)' },
      { url: 'https://en.wikipedia.org/wiki/Fiscal_multiplier', type: 'reference', label: 'Wikipedia: Fiscal multiplier（mechanism, formula, Kahn 1931 origin）' },
      { url: 'https://www.jec.senate.gov/public/_cache/files/aa63e97b-ad62-4910-884f-54ff1aa67c6f/keynesiantaxandspendingmultipliers.pdf', type: 'government', label: 'U.S. Congress Joint Economic Committee: Keynesian Tax and Spending Multipliers (2009)' },
    ],
  },
  {
    id: 'econ-output-gap',
    discipline: 'economics',
    title: 'GDPギャップ（需給ギャップ）',
    statement:
      'GDPギャップ（需給ギャップ、output gap）は、現実のGDP（実際の総需要）と、その経済が労働・資本などの生産要素を平均的・持続可能な水準で用いたときに実現できる潜在GDP（供給力）との差を、潜在GDP比などで表したマクロ経済指標である。' +
      '基本式は「（実際GDP−潜在GDP）÷潜在GDP」で、値がプラスなら総需要が供給力を上回るインフレギャップ（景気の過熱・物価上昇圧力）、マイナスなら需要不足のデフレギャップ（失業・物価下落圧力・景気停滞）を示し、景気の過熱・停滞を測る目安となる。金融・財政政策の判断材料として中央銀行・政府（日本では日銀と内閣府が独自に推計）が用いる。' +
      'ただし潜在GDPは直接観測できず推計手法（生産関数法など）に依存するため、ギャップの値は機関や基準改定で大きく変わりうるという計測上の限界がある。オークンの法則を介して失業率とも関連づけられる。',
    keyFigures: 'GDPギャップ＝（実際GDP−潜在GDP）÷潜在GDP（IMF表記 (Y−Y*)/Y*）／プラス＝インフレギャップ・マイナス＝デフレギャップ／日銀・内閣府・IMF等が推計し政策判断に利用／潜在GDP推計依存で値が改定されやすい／オークンの法則と関連',
    asOf: '2026-06',
    sources: [
      { url: 'https://www5.cao.go.jp/j-j/wp/wp-je07/07f61020.html', type: 'government', label: '内閣府『経済財政白書』付注「GDPギャップの推計方法について」（定義・生産関数による潜在GDP推計）' },
      { url: 'https://www.imf.org/external/pubs/ft/fandd/basics/22_output-gap.htm', type: 'government', label: 'IMF Finance & Development, Back to Basics: "The Output Gap: Veering from Potential"' },
      { url: 'https://www.boj.or.jp/research/research_data/gap/index.htm', type: 'government', label: '日本銀行「需給ギャップ・潜在成長率および労働需給関連指標」（観測不能で推計依存・四半期公表）' },
      { url: 'https://en.wikipedia.org/wiki/Output_gap', type: 'reference', label: 'Wikipedia "Output gap"（actual−potential の定義、正＝inflationary gap、オークンの法則）' },
    ],
  },
  {
    id: 'mgmt-contingency-theory',
    discipline: 'management',
    title: 'コンティンジェンシー理論（条件適合理論）',
    statement:
      'あらゆる状況に通用する唯一最善の組織化・管理方法は存在せず、最適な組織構造やリーダーシップのあり方は、環境・技術・規模などの状況要因（コンティンジェンシー要因）に依存して変わるとする組織論の立場。古典的管理論やテイラーの「唯一最善の方法」を批判し、組織と環境の適合（fit）を重視する。' +
      'バーンズ&ストーカーは安定環境には機械的組織・変動環境には有機的組織が適すると示し、ローレンス&ローシュは環境の不確実性に応じた分化と統合を論じた。ウッドワードは技術と組織構造の関係を実証した。リーダーシップ分野ではフィードラーの条件適合モデル（リーダーの効果は状況の好意性に依存）が代表的。' +
      '状況に応じて打ち手を変えるべきという現代的なマネジメント観の基礎となった。',
    keyFigures: '唯一最善の方法を否定し組織と環境の適合(fit)を重視／バーンズ&ストーカー(機械的/有機的組織)／ローレンス&ローシュ(分化と統合)／ウッドワード(技術と構造)／フィードラーの条件適合リーダーシップ・モデル',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/contingency-theory', type: 'reference', label: 'EBSCO Research Starters — Contingency theory（学術データベース）' },
      { url: 'https://www.ebsco.com/research-starters/psychology/fiedler-contingency-model', type: 'reference', label: 'EBSCO Research Starters — Fiedler contingency model' },
      { url: 'https://en.wikipedia.org/wiki/Contingency_theory', type: 'reference', label: 'Wikipedia — Contingency theory' },
      { url: 'https://www.sciencedirect.com/topics/social-sciences/contingency-theory', type: 'academic', label: 'ScienceDirect Topics — Contingency Theory（Elsevier）' },
    ],
  },
  {
    id: 'human-endowment-effect',
    discipline: 'human-science',
    title: '保有効果（授かり効果）',
    statement:
      '人が自分の所有している物に対して、所有していない時よりも高い価値を感じ、手放したがらなくなる傾向。同じ物でも、それを売る際に求める最低額（WTA: 受入意思額）が、買う際に支払ってもよい額（WTP: 支払意思額）を上回るという形で表れる。' +
      '経済学者リチャード・セイラーが1980年に命名し、カーネマン、ネッチ、セイラーらがコーネル大学の学生にマグカップを配って行った実験（1990）で実証された。売り手が要求する価格（中央値 約5.25ドル）が買い手の提示額（中央値 約2.25〜2.75ドル）のおよそ2倍に達し、取引はほとんど成立しなかった。' +
      'プロスペクト理論の「損失回避（手放す痛みは得る喜びより大きい）」が背景にあると説明される。保有状況に依存しない安定した選好を前提とする標準的経済学と矛盾し、現状維持バイアスとも密接に関連する概念である。',
    keyFigures: 'R.セイラーが1980年に命名／WTA(受入額)>WTP(支払額)／カーネマン・ネッチ・セイラーのマグカップ実験(コーネル大1990, 売値≈$5.25 vs 買値≈$2.25–2.75)／損失回避(プロスペクト理論)が背景／現状維持バイアスと関連',
    asOf: '2026-06',
    sources: [
      { url: 'https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Kahneman_et_al_1990_Experimental_tests.pdf', type: 'academic', label: 'Kahneman, Knetsch & Thaler (1990), "Experimental Tests of the Endowment Effect and the Coase Theorem," Journal of Political Economy 98(6):1325–1348（MIT 配信PDF）' },
      { url: 'https://www.aeaweb.org/articles?id=10.1257%2Fjep.5.1.193', type: 'academic', label: 'Kahneman, Knetsch & Thaler (1991), "Anomalies: The Endowment Effect, Loss Aversion, and Status Quo Bias," Journal of Economic Perspectives 5(1):193–206（AEA）' },
      { url: 'https://en.wikipedia.org/wiki/Endowment_effect', type: 'reference', label: 'Wikipedia: Endowment effect（Thaler 1980 命名・WTA>WTP の補強）' },
    ],
  },
  {
    id: 'bizlaw-insider-trading',
    discipline: 'business-law',
    title: 'インサイダー取引規制',
    statement:
      '上場会社等の役員・従業員・大株主や契約締結者などの「会社関係者」が、その職務等に関連して知った、投資判断に重要な影響を及ぼす未公表の「重要事実」（決算予想の大幅修正・合併・新株発行・業務提携等）に基づき、その公表前に当該会社の株式等を売買することを禁止する規制（金融商品取引法166条等）。証券市場の公正性と投資家の信頼を保護することを目的とする。' +
      '会社関係者から重要事実の伝達を受けた情報受領者（第一次情報受領者）も規制対象に含まれる。違反には課徴金（利得相当額）のほか刑事罰（5年以下の懲役・500万円以下の罰金、法人は5億円以下の罰金）が科され、得た財産は没収・追徴される。' +
      '調査・摘発は金融庁に置かれた証券取引等監視委員会が担う。会社関係者でなくなって一定期間内の者も対象となるなど規制の範囲は広い。',
    keyFigures: '会社関係者が職務上知った未公表の重要事実に基づく公表前の売買を禁止／金商法166条等／市場の公正性・投資家保護／第一次情報受領者も対象／課徴金+刑事罰(5年以下の懲役等)、証券取引等監視委員会が摘発',
    asOf: '2026-06',
    sources: [
      { url: 'https://elaws.e-gov.go.jp/document?lawid=323AC0000000025_20251213_505AC0000000053', type: 'government', label: 'e-Gov法令検索「金融商品取引法」（166条・197条の2等／権威ある一次法令）' },
      { url: 'https://www.fsa.go.jp/news/r5/shouken/20240419/240419insider_qa_.pdf', type: 'government', label: '金融庁「インサイダー取引規制に関するＱ＆Ａ」（所管官庁資料）' },
      { url: 'https://www.jpx.co.jp/regulation/preventing/insider/index.html', type: 'reference', label: '日本取引所グループ（JPX）「インサイダー取引規制」' },
      { url: 'https://www.jpx.co.jp/corporate/research-study/research-group/nlsgeu0000037sge-att/20180323_2.pdf', type: 'academic', label: '志谷匡史（神戸大学）「金商法166条 会社情報に関する内部者取引の禁止」（学術解説）' },
    ],
  },
  {
    id: 'infosoc-panopticon',
    discipline: 'information-sociology',
    title: 'パノプティコンと規律権力',
    statement:
      'パノプティコン（一望監視施設）は、功利主義者ジェレミー・ベンサムが18世紀末（設計図は1791年公刊）に考案した刑務所の建築モデルで、中央の監視塔から円環状に配置された独房を一望でき、囚人からは監視者が見えない構造を持つ。囚人は常に監視されているかもしれないと意識し、自ら行動を律するようになる。' +
      '哲学者ミシェル・フーコーは『監獄の誕生』（Surveiller et punir, 1975）でこれを近代社会の「規律権力（規律訓練型権力）」の比喩・モデルとして理論化した。すなわち、実際に常時監視せずとも、見られているかもしれないという意識を内面化させることで、人々を自発的に従順な主体へと規律化する権力作用を象徴する。フーコーはこの作用を学校・病院・工場・兵営など近代の諸制度に広がるものとして論じた。' +
      '監視カメラやデータ監視が遍在する現代のサーベイランス社会論（電子パノプティコン等）の基礎概念となっている。',
    keyFigures: 'ベンサムが考案した一望監視の刑務所建築（設計図1791年公刊）／中央塔から一望・囚人からは監視者が見えず自己規律化／フーコー『監獄の誕生』1975が規律権力の比喩として理論化／学校・病院・工場等へ拡張／現代の監視社会論の基礎',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/technology/panopticon', type: 'reference', label: 'Encyclopaedia Britannica — Panopticon（ベンサム考案、1791年設計図公刊、構造と自己規律化）' },
      { url: 'https://plato.stanford.edu/entries/foucault/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — Michel Foucault（規律権力とパノプティコン）' },
      { url: 'https://ojs.library.queensu.ca/index.php/surveillance-and-society/article/view/8346', type: 'academic', label: 'Surveillance & Society (Queen\'s University) — Surveillance, Panopticism, and Self-Discipline in the Digital Age' },
      { url: 'https://soztheo.com/sociology/key-works-in-sociology/michel-foucault-discipline-and-punish-1975/', type: 'reference', label: 'SozTheo — Michel Foucault, Discipline and Punish (1975)（規律権力・自己監視の解説）' },
    ],
  },
  {
    id: 'econ-ppp',
    discipline: 'economics',
    title: '購買力平価（PPP）',
    statement:
      '2国間の為替レートは、長期的には各国通貨の購買力が等しくなる水準（同一の財・サービスのバスケットが両国で同じ価格になる水準）に決まる、とする国際金融の理論。一物一価の法則（law of one price）を一国の物価水準全体に拡張したもの。' +
      '絶対的購買力平価（absolute PPP）は為替レート＝自国物価÷外国物価とし、相対的購買力平価（relative PPP）は為替レートの変化率が2国のインフレ率の差（インフレ格差）に等しくなるとする。スウェーデンの経済学者グスタフ・カッセルが第一次大戦後（1918年頃、国際連盟向けの覚書）に近代的な形で定式化・普及させた。' +
      '実際には貿易されない財（非貿易財）・輸送費・関税・生産性格差などのため、短期的には市場為替レートから大きく乖離する（エコノミスト誌の「ビッグマック指数」は身近な例）。GDPの国際比較では市場為替レートでなくPPP換算が用いられ、IMFやOECDはこのPPPウェイトを採用する。',
    keyFigures: '2通貨の購買力が等しくなる為替水準／一物一価の法則の一般化／絶対的PPP(為替=物価比)と相対的PPP(為替変化率=インフレ率差)／G.カッセルが定式化(1918頃)／ビッグマック指数・GDPのPPP換算',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.imf.org/en/Publications/fandd/issues/Series/Back-to-Basics/Purchasing-Power-Parity-PPP', type: 'government', label: 'IMF, Finance & Development "Back to Basics: Purchasing Power Parity — Weights Matter" (Tim Callen)' },
      { url: 'https://www.bankofcanada.ca/wp-content/uploads/2010/06/lafrance_e.pdf', type: 'government', label: 'Bank of Canada Review, "Purchasing-Power Parity: Definition, Measurement, and Interpretation" (Lafrance & Schembri)' },
      { url: 'https://www.econlib.org/library/Enc/bios/Cassel.html', type: 'reference', label: 'The Library of Economics and Liberty (Econlib), biography of Gustav Cassel' },
      { url: 'https://en.wikipedia.org/wiki/Purchasing_power_parity', type: 'reference', label: 'Wikipedia, "Purchasing power parity"' },
    ],
  },
  {
    id: 'econ-arbitrage',
    discipline: 'economics',
    title: '裁定取引（アービトラージ）と一物一価の法則',
    statement:
      '同一の財や金融資産が異なる市場で異なる価格で取引されているとき、安い方で買い高い方で売ることで、リスクなしに価格差から利益（サヤ）を得る取引を裁定取引（アービトラージ）という。' +
      '多数の裁定者がこれを行うと、安い市場では需要増で価格が上がり高い市場では供給増で価格が下がるため、価格差は解消し、最終的に同一物の価格は1つに収束する。これを「一物一価の法則（law of one price）」という。裁定機会が存在しないこと（無裁定, no-arbitrage）は、金融資産の合理的価格づけ（デリバティブ評価・資本資産評価・購買力平価など）の基礎的前提となっている。' +
      '現実には取引費用・情報の非対称・空売り制約等のため完全には成立せず、一物一価はむしろ価格差が一時的にしか続かない「引力的均衡（attractor equilibrium）」として理解される。',
    keyFigures: '裁定＝同一物の市場間価格差からリスクなしに利益（買い低・売り高）／裁定により価格差が解消し一物一価へ収束／無裁定(no-arbitrage)が資産価格づけ(デリバティブ・PPP・金利平価等)の基礎前提／取引費用等で現実には不完全',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/what-is-arbitrage', type: 'reference', label: 'Britannica Money — "What Is Arbitrage?"（裁定の定義・リスクフリー利益・市場間価格差の解消）' },
      { url: 'https://eh.net/encyclopedia/the-law-of-one-price/', type: 'academic', label: 'EH.net Encyclopedia — "The Law of One Price"（裁定と一物一価、取引費用による不完全性）' },
      { url: 'https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr216.pdf', type: 'government', label: 'Federal Reserve Bank of New York Staff Report No. 216 — Arbitrage Pricing Theory（無裁定と資産価格づけ）' },
      { url: 'https://en.wikipedia.org/wiki/Law_of_one_price', type: 'reference', label: 'Wikipedia — "Law of one price"' },
    ],
  },
  {
    id: 'mgmt-okr',
    discipline: 'management',
    title: 'OKR（目標と主要な結果）',
    statement:
      '組織・チーム・個人の目標を整合させ進捗を測る目標管理のフレームワーク。定性的で野心的な「目標（Objective）＝どこを目指すか」と、その達成度を測る2〜5個程度の定量的な「主要な結果（Key Results）＝どう測るか」をセットで設定する。' +
      'インテルのアンディ・グローブがピーター・ドラッカーの目標管理（MBO）を発展させて生み出し（『High Output Management』1983）、同社出身の投資家ジョン・ドーアがGoogleに導入したことで広く普及した（『Measure What Matters』2017）。' +
      '四半期など短いサイクルで設定・評価し、全社の目標を上から下へ連結して透明性を高める。野心的な「ストレッチゴール」を奨励し、達成率6〜7割を健全とみなすことが多く、人事評価とは切り離して運用するのが原則とされる。',
    keyFigures: 'Objective(定性・野心的)＋Key Results(定量2〜5個)／A.グローブ(インテル)がMBOを発展(High Output Management 1983)／J.ドーアがGoogleに導入し普及(Measure What Matters 2017)／短サイクル・透明な連結・ストレッチゴール・評価とは分離',
    asOf: '2026-06',
    sources: [
      { url: 'https://rework.withgoogle.com/intl/en/guides/set-goals-with-okrs', type: 'reference', label: 'Google re:Work — Guides: Set goals with OKRs（実務一次資料）' },
      { url: 'https://en.wikipedia.org/wiki/Objectives_and_key_results', type: 'reference', label: 'Wikipedia — Objectives and key results（定義・グローブ/ドーア由来）' },
      { url: 'https://www.ibm.com/think/topics/okrs', type: 'reference', label: 'IBM — What are objectives and key results (OKRs)?（構造・MBOとの関係）' },
      { url: 'https://www.whatmatters.com/faqs/okr-meaning-definition-example', type: 'reference', label: 'What Matters（John Doerr）— OKR Meaning, Definition & Examples' },
    ],
  },
  {
    id: 'human-social-proof',
    discipline: 'human-science',
    title: '社会的証明',
    statement:
      '何が正しい行動か不確実・曖昧な状況で、人は他者（特に多数派や、自分と似た他者）の行動を「正しさの証拠」とみなし、それに倣って自分の行動を決める傾向。情報的社会的影響（informational social influence）とも呼ばれる。' +
      '社会心理学者ロバート・チャルディーニが著書『影響力の武器（Influence、1984）』で示した説得・承諾の6原理（返報性／コミットメントと一貫性／社会的証明／好意／権威／希少性）の一つ。行列のできる店に並ぶ、レビューの星評価や「累計○万個販売」を信頼する、笑い声の効果音（ラフトラック）で面白く感じる、などが例。状況が曖昧なときや、自分と似た他者の行動であるときに特に強く働く。' +
      'マーケティングや行動変容に応用される一方、緊急時に皆が傍観して誰も動かない「多元的無知」による傍観者効果の一因にもなる。',
    keyFigures: '他者(特に多数派・類似他者)の行動を正しさの証拠とみなし倣う／R.チャルディーニ『影響力の武器』(1984)の説得6原理の一つ／情報的社会的影響、状況が曖昧・類似他者で強まる／レビュー・行列・ラフトラック／多元的無知・傍観者効果と関連（同調(アッシュ)とは別概念）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Social_proof', type: 'reference', label: 'Wikipedia — Social proof（定義・情報的社会的影響・多元的無知）' },
      { url: 'https://news.wpcarey.asu.edu/20070103-gentle-science-persuasion-part-three-social-proof', type: 'academic', label: 'Arizona State University, W. P. Carey News — The gentle science of persuasion: Social proof' },
      { url: 'https://link.springer.com/article/10.1007/s11229-014-0435-0', type: 'academic', label: 'Synthese (Springer) — Pluralistic ignorance in the bystander effect（社会的証明と傍観者効果）' },
      { url: 'https://www.media-studies.ca/articles/influence_ch4.htm', type: 'reference', label: 'Robert Cialdini, Influence, Ch.4 "Social Proof"（原典・ラフトラック例）' },
    ],
  },
  {
    id: 'bizlaw-e-signature',
    discipline: 'business-law',
    title: '電子署名法',
    statement:
      '電子文書（電磁的記録）に付された電子署名の法的効力を定める法律。正式名称は「電子署名及び認証業務に関する法律」（平成12年法律第102号、2000年〔平成12年〕公布、2001年〔平成13年〕4月1日施行）。' +
      '本人による一定の電子署名が行われている電磁的記録は、真正に成立したものと推定される（法3条）。これは、私文書に本人またはその代理人の署名・押印があるときに真正成立を推定する民事訴訟法228条4項に対応する規定で、電子契約の証拠力を支える。所管は総務省・法務省・経済産業省の共管。あわせて、本人確認方法など一定の基準を満たす認証業務を国が認定する制度（特定認証業務の認定／認定認証業務）を設ける。' +
      '近年、クラウド型（立会人型・事業者署名型）電子署名サービスの普及を受け、主務三省は2020年（令和2年）にQ&Aを公表し、サービス提供事業者が利用者の意思に基づき行う電子署名も一定の要件下で3条の推定が及びうるとの解釈を示した。',
    keyFigures: '正式名称＝電子署名及び認証業務に関する法律（平成12年法律102号）／2000年公布・2001年4月施行／本人の電子署名ある電磁的記録は真正成立を推定(3条)／民訴228条4項に対応／総務省・法務省・経産省共管／特定認証業務の認定／2020年に立会人型クラウド署名の解釈公表',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/412AC0000000102', type: 'government', label: 'e-Gov法令検索 電子署名及び認証業務に関する法律（平成12年法律第102号）条文' },
      { url: 'https://www.moj.go.jp/MINJI/minji32.html', type: 'government', label: '法務省「電子署名法の概要と認定制度について」' },
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/top/denshi_syomei/index.html', type: 'government', label: '総務省「電子署名及び認証業務に関する法律の施行について」' },
    ],
  },
  {
    id: 'infosoc-simulacra',
    discipline: 'information-sociology',
    title: 'シミュラークルとハイパーリアリティ',
    statement:
      'フランスの思想家ジャン・ボードリヤールが『シミュラークルとシミュレーション』（Simulacres et Simulation, 1981）で展開した概念。シミュラークル（simulacre）とは、もとになる現実（オリジナル）を持たない「模像・コピー」を指す。' +
      '現代の消費社会・メディア社会では、記号やイメージが現実を写すのではなく、現実から切り離されて自己増殖し、オリジナルなき複製（シミュラークル）が「現実そのもの」として通用する。こうして模像と現実の区別が消え、メディアが作り出すイメージが現実より現実らしく感じられる状態を「ハイパーリアリティ（hyperreality、モデルによって生成される、起源も現実もない実在）」と呼ぶ。' +
      'ボードリヤール自身はテーマパーク（ディズニーランド）を例に、それが「現実」幻想を支える装置だと論じた。広告やメディア・イメージを含め、現代の情報社会における現実とイメージの関係を批判的に問う枠組みとなっている。',
    keyFigures: 'J.ボードリヤール『シミュラークルとシミュレーション』1981／シミュラークル＝オリジナルなき模像／記号・イメージが自己増殖し現実を代替（「現実の砂漠」）／ハイパーリアリティ＝模像が現実より現実らしい状態／ディズニーランド・広告',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/baudrillard/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — "Jean Baudrillard"（simulation／hyperreality を解説）' },
      { url: 'https://www.britannica.com/biography/Jean-Baudrillard', type: 'reference', label: 'Encyclopaedia Britannica — "Jean Baudrillard"（hyperreal／simulacra／"desert of the real"）' },
      { url: 'https://mitpress.mit.edu/9780936756028/simulations/', type: 'academic', label: 'MIT Press — Baudrillard 著作の刊行情報（出版社一次情報）' },
    ],
  },
  {
    id: 'econ-jevons-paradox',
    discipline: 'economics',
    title: 'ジェヴォンズのパラドックス',
    statement:
      '技術進歩によって資源（エネルギー等）の利用効率が高まると、単位あたりのコストが下がって需要が増えるため、かえって資源の総消費量が増えてしまう、という逆説。' +
      'イギリスの経済学者ウィリアム・スタンレー・ジェヴォンズが『石炭問題（The Coal Question）』（1865年）で、蒸気機関の効率改善が石炭消費を減らすどころか増大させたと論じたことに由来する。効率改善による需要増を「リバウンド効果（rebound effect）」と呼び、その効果が当初の節約を上回って総消費がむしろ増える極端なケースを「バックファイア（backfire）」という。' +
      '省エネ・省資源政策が必ずしも総消費を減らさない可能性を示し、環境政策において効率改善だけでなく総量規制（炭素税・排出量上限キャップ等）が必要との議論の根拠とされる。',
    keyFigures: 'W.S.ジェヴォンズ『石炭問題』1865／効率改善→コスト低下→需要増で総消費が増える逆説／リバウンド効果・バックファイア／効率改善のみでは総消費を減らせず総量規制が必要との含意',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/The-Coal-Question', type: 'reference', label: 'Encyclopaedia Britannica — The Coal Question (work by Jevons)' },
      { url: 'https://energyhistory.yale.edu/w-stanley-jevons-the-coal-question-1865/', type: 'academic', label: 'Yale University, Energy History — W. Stanley Jevons, "The Coal Question," 1865（一次資料・原典引用）' },
      { url: 'https://en.wikipedia.org/wiki/Jevons_paradox', type: 'reference', label: 'Wikipedia — Jevons paradox（リバウンド効果・バックファイアの定義）' },
    ],
  },
  {
    id: 'econ-cobb-douglas',
    discipline: 'economics',
    title: 'コブ＝ダグラス生産関数',
    statement:
      '産出量 Y を、労働 L と資本 K の投入から Y = A·L^α·K^β の形で表す生産関数。A は全要素生産性（技術水準）、α・β はそれぞれ労働・資本の産出弾力性（投入を1%増やしたときの産出の変化率）を表す。' +
      'α+β=1 のとき規模に関して収穫一定（規模を2倍にすると産出も2倍）となる。競争市場で各生産要素がその限界生産力に等しい報酬を受けるとき、α が労働分配率・β が資本分配率に一致するという便利な性質をもつ。数学者チャールズ・コブと経済学者ポール・ダグラスが1928年の論文「A Theory of Production」で、米国製造業（1899–1922年）のデータに当てはめて提示した。' +
      '扱いやすさから成長理論（ソローモデル）やマクロ経済学で広く用いられる一方、要素間の代替弾力性が常に1であるなどの強い仮定への批判もある。',
    keyFigures: 'Y=A·L^α·K^β／A=全要素生産性、α・β=産出弾力性／α+β=1で規模に関して収穫一定・競争市場下でα/βが労働/資本分配率に対応／C.コブ&P.ダグラス1928(米国製造業1899–1922)／代替弾力性=1の仮定への批判',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Cobb-Douglas-function', type: 'reference', label: 'Encyclopædia Britannica — "Cobb-Douglas function" (economics)' },
      { url: 'https://en.wikipedia.org/wiki/Cobb%E2%80%93Douglas_production_function', type: 'reference', label: 'Wikipedia — Cobb–Douglas production function' },
      { url: 'https://web.stanford.edu/~chadj/alpha100.pdf', type: 'academic', label: 'Stanford University (C. I. Jones) — Growth, Capital Shares, and Production Functions' },
      { url: 'https://www.sciencedirect.com/topics/economics-econometrics-and-finance/cobb-douglas-production-function', type: 'academic', label: 'ScienceDirect Topics — Cobb-Douglas Production Function (overview)' },
    ],
  },
  {
    id: 'mgmt-organizational-culture',
    discipline: 'management',
    title: '組織文化（シャインの3レベル）',
    statement:
      '組織文化とは、組織のメンバーに共有された価値観・信念・規範・行動様式・象徴・言語などの総体で、メンバーに共通のアイデンティティを与え、意思決定や行動を方向づけるものである。' +
      '組織心理学者でMITスローン経営大学院の教授だったエドガー・シャイン（1928–2023）は、1980年代に組織文化を3つのレベルで捉えるモデルを提示した：(1)人工物（artifacts）＝建築・服装・オフィスのレイアウト・儀礼など、外部の人にも目に見える表層、(2)標榜される価値観（espoused values）＝公式の理念・戦略・目標など、組織が言明する価値、(3)基本的前提（basic underlying assumptions）＝メンバーが当然視し意識すらしない、最も深層の無意識的な信念・前提。' +
      'シャインは、この深層の基本的前提こそが文化の本質であり、表層の人工物や標榜される価値観だけを見ても文化は理解できず、文化変革は3レベル全て（特に基本的前提）に働きかけて初めて根づくと論じた。さらにシャインは文化が戦略を「決定し制約する」とも述べ、組織文化は戦略実行や変革の成否を大きく左右する。',
    keyFigures: 'E.シャイン（MITスローン、組織心理学者、1928–2023、1980年代提唱）の3レベル：人工物(表層)・標榜される価値観・基本的前提(深層)／深層の基本的前提が文化の本質／文化は戦略を決定し制約する／（「文化は戦略を朝食に食べる」は帰属不確実のため不採用）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/organizational-culture', type: 'reference', label: 'Encyclopædia Britannica「Organizational culture」（文化＝共有された信念・前提・価値・規範・人工物・象徴・言語の総体）' },
      { url: 'https://mitsloan.mit.edu/ideas-made-to-matter/5-enduring-management-ideas-mit-sloans-edgar-schein', type: 'academic', label: 'MIT Sloan School of Management（シャインの所属大学／3レベルモデルと経歴）' },
      { url: 'https://en.wikipedia.org/wiki/Edgar_Schein', type: 'reference', label: 'Wikipedia「Edgar Schein」（1928–2023・MITスローン教授・1980年代提唱）' },
    ],
  },
  {
    id: 'human-hindsight-bias',
    discipline: 'human-science',
    title: '後知恵バイアス',
    statement:
      'ある出来事の結果を知った後で、その結果を事前に予測可能だった・自分は最初から分かっていたと過大に思い込む認知的傾向。「I-knew-it-all-along（最初から分かっていた）効果」あるいは「creeping determinism」とも呼ばれる。' +
      '結果を知ることで、それ以前の自分の予測を結果に近い方向へ無意識に書き換えてしまう記憶と判断の歪みが関与する。バルーク・フィッシュホフが1975年の研究（Journal of Experimental Psychology: Human Perception and Performance）で実証的に示した（結果を伝えられた群は、その結果が起こる確率を事前に高く見積もっていたと回答する）。' +
      '事故・医療過誤・投資判断などの事後評価において、「予見できたはずだ」と当事者を不当に厳しく評価する一因となり（裁判や過失認定での結果論的判断など）、過去の判断から正しく学習することを妨げる。対策として、結果を知る前に予測を記録しておく、起こりえた別の結末を考える（反実仮想）などが有効とされる。',
    keyFigures: '結果を知った後で「予測可能だった/分かっていた」と過大視／I-knew-it-all-along効果・creeping determinism／B.フィッシュホフ1975が実証／事故・医療・裁判の結果論的評価を歪める／対策＝事前予測の記録・反実仮想',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/hindsight-bias', type: 'reference', label: 'Encyclopaedia Britannica — Hindsight bias: Definition, Psychology, & Examples' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/12897366/', type: 'academic', label: 'Fischhoff B. (1975) "Hindsight ≠ foresight…", J. Exp. Psychol. Hum. Percept. Perform.（PubMed）' },
      { url: 'https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Fischhoff_1975_Hindsight_is_not_equal_to_foresight.pdf', type: 'academic', label: 'Fischhoff (1975) 原著PDF（MIT 配信）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/19554863/', type: 'academic', label: 'Hindsight bias and outcome bias in the social construction of medical negligence: a review（PubMed）' },
    ],
  },
  {
    id: 'bizlaw-specified-commercial-transactions',
    discipline: 'business-law',
    title: '特定商取引法',
    statement:
      '事業者と消費者の間でトラブルを生じやすい特定の取引類型を対象に、事業者の行為を規制し消費者を保護する法律（特定商取引に関する法律）。1976年（昭和51年）に「訪問販売等に関する法律（訪問販売法）」として制定され、2000年の改正で現在の名称に改められた。' +
      '規制対象は、訪問販売・通信販売・電話勧誘販売・連鎖販売取引（マルチ商法）・特定継続的役務提供（エステ・語学教室等）・業務提供誘引販売取引（内職商法等）・訪問購入の7類型。事業者に対し、氏名等の明示・書面交付・誇大広告の禁止・不当な勧誘行為（不実告知・威迫等）の禁止などの行政規制を課す。' +
      'あわせて、一定期間内なら無条件で契約を解除できるクーリング・オフや、中途解約権・不当条項の無効など民事ルールも定め、消費者庁が所管する。',
    keyFigures: '消費者トラブルが生じやすい7類型（訪問販売・通信販売・電話勧誘・連鎖販売・特定継続的役務・業務提供誘引・訪問購入）を規制／1976年訪問販売法として制定・2000年改正で現名称／行政規制(明示・書面交付・誇大広告/不当勧誘の禁止)＋民事ルール(クーリングオフ等)／消費者庁が所管',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/', type: 'government', label: '消費者庁「特定商取引法とは」特定商取引法ガイド（7類型・行政規制・民事ルールの一次情報）' },
      { url: 'https://laws.e-gov.go.jp/law/351AC0000000057/', type: 'government', label: 'e-Gov法令検索「特定商取引に関する法律」（昭和51年法律第57号 法令本文）' },
      { url: 'https://hourei.ndl.go.jp/simple/detail?lawId=0000065920&current=-1', type: 'government', label: '国立国会図書館「日本法令索引」昭和51年6月4日法律第57号（制定年の確認）' },
    ],
  },
  {
    id: 'infosoc-cultural-capital',
    discipline: 'information-sociology',
    title: '文化資本（ブルデュー）',
    statement:
      'フランスの社会学者ピエール・ブルデューが提唱した概念で、金銭的な経済資本とは別に、個人が持つ知識・教養・言葉づかい・趣味・学歴・作法などの文化的な資産を指し、これらが社会的な有利さ（地位や権力）に変換されうるとする。' +
      '文化資本は3つの形態をとる：(1)身体化された文化資本（habitusとして身につけた教養・振る舞い）、(2)客体化された文化資本（書物・絵画・楽器などの文化的財）、(3)制度化された文化資本（学歴・資格など制度が認める形）。' +
      'ブルデューは、学校教育が一見中立に見えて実は支配階級の文化資本を評価する仕組みになっており、家庭で文化資本を受け継いだ子が学業で有利になることで、階級格差が世代を超えて再生産される（文化的再生産）と論じた。経済資本・社会関係資本（人脈）とともに社会空間を構成する。',
    keyFigures: 'P.ブルデュー／経済資本とは別の文化的資産が社会的有利さに変換／身体化・客体化・制度化の3形態／学校教育を介した文化的再生産で階級格差が継承（ブルデュー&パスロン）／経済資本・社会関係資本と並ぶ',
    asOf: '2026-06',
    sources: [
      { url: 'https://web.stanford.edu/~eckert/PDF/Bourdieu1986.pdf', type: 'academic', label: 'Pierre Bourdieu, "The Forms of Capital" (1986) — 原典PDF（Stanford University ホスト）' },
      { url: 'https://sk.sagepub.com/ency/edvol/download/socialproblems/chpt/cultural-capital.pdf', type: 'reference', label: 'SAGE Reference — Encyclopedia of Social Problems: "Cultural Capital"（学術百科事典）' },
      { url: 'https://en.wikipedia.org/wiki/Cultural_capital', type: 'reference', label: 'Wikipedia: Cultural capital（概念・3形態・文化的再生産の概観）' },
    ],
  },
];
// Stryker restore all
