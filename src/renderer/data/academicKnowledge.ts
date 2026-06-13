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
];
// Stryker restore all
