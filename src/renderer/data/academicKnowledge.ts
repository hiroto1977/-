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
];
// Stryker restore all
