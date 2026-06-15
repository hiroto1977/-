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
  {
    id: 'econ-interest-rate-parity',
    discipline: 'economics',
    title: '金利平価説',
    statement:
      '2国間の金利差と為替レート（直物・先物）の関係を、無裁定（裁定取引が利益を生まない）条件から導く国際金融の基礎理論。' +
      'カバー付き金利平価（CIP）は、為替リスクを先物予約でヘッジした場合、2通貨での運用利回りが等しくなる（高金利通貨は先物で割安＝ディスカウントになる）とし、先物プレミアム／ディスカウントが内外金利差を正確に相殺するため、裁定が働く限りほぼ厳密に成立する純粋な無裁定関係である（ただし2008年の世界金融危機以降は先進国通貨でもCIPからの乖離が観測される）。' +
      'カバーなし金利平価（UIP）は、ヘッジしない場合、高金利通貨は将来その金利差分だけ減価すると予想される（期待為替変化率＝内外金利差）とするが、実証的には短中期で成立しにくく「フォワード・プレミアム・パズル」（キャリートレードの平均的収益）として知られる。購買力平価が財市場の裁定であるのに対し、金利平価は金融市場（資本取引）の裁定にあたる。',
    keyFigures: '2国の金利差と直物/先物為替の無裁定関係／カバー付き金利平価(CIP)は厳密に成立(高金利通貨は先物ディスカウント)／カバーなし金利平価(UIP)＝期待為替変化率=内外金利差だが実証で不成立(フォワード・プレミアム・パズル)／購買力平価=財市場・金利平価=金融市場の裁定／GFC以降CIP乖離も',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.federalreserve.gov/pubs/ifdp/2003/752/revision/ifdp752r.pdf', type: 'government', label: 'Board of Governors of the Federal Reserve System — IFDP No.752 "Uncovered Interest Parity: It Works, But Not For Long"' },
      { url: 'https://www.imf.org/-/media/Files/Publications/WP/2019/wp1914.ashx', type: 'government', label: 'IMF Working Paper WP/19/14 "Covered Interest Parity Deviations: Macrofinancial Determinants"' },
      { url: 'https://files.stlouisfed.org/files/htdocs/conferences/integration/Thornton.pdf', type: 'government', label: 'Federal Reserve Bank of St. Louis — Thornton "Resolving the Unbiasedness and Forward Premium Puzzles"' },
      { url: 'https://en.wikipedia.org/wiki/Interest_rate_parity', type: 'reference', label: 'Wikipedia "Interest rate parity"（CIP/UIPの定義・無裁定条件）' },
    ],
  },
  {
    id: 'econ-inflation-targeting',
    discipline: 'economics',
    title: 'インフレ・ターゲティング',
    statement:
      '中央銀行が、達成すべきインフレ率の数値目標（例: 前年比2%）を公表し、その達成に向けて金融政策（主に政策金利）を運営する枠組み。目標を明示することで、人々や市場のインフレ期待を安定させ（アンカーし）、政策の透明性と説明責任（アカウンタビリティ）を高める狙いがある。' +
      '1990年にニュージーランド準備銀行が世界で初めて正式に導入し、カナダ（1991年）・英国（1992年）など多くの国に広がった。日本銀行も2013年に「物価安定の目標」として消費者物価の前年比2%を導入した。多くは中期的な達成を目指す「柔軟なインフレ・ターゲティング」で、短期的な産出・雇用の変動にも配慮する。' +
      'デフレ・高インフレいずれにも対応する現代の標準的な金融政策枠組みの一つだが、資産価格バブルや供給ショックへの対応の限界も指摘される。',
    keyFigures: '中央銀行が数値目標(例2%)を公表し金融政策を運営／インフレ期待のアンカー・透明性とアカウンタビリティ／1990年ニュージーランドが初導入(カナダ1991/英国1992が後続)／日銀は2013年に2%目標／柔軟なインフレ・ターゲティング',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.imf.org/external/pubs/ft/fandd/basics/pdf/jahpan-inflation-targeting.pdf', type: 'government', label: 'IMF, "Inflation Targeting: Holding the Line" (Back to Basics, Finance & Development)' },
      { url: 'https://www.boj.or.jp/en/mopo/outline/target.htm', type: 'government', label: 'Bank of Japan, "Price Stability Target of 2 Percent"' },
      { url: 'https://www.rba.gov.au/publications/confs/2018/mcdermott-williams.html', type: 'government', label: 'Reserve Bank of Australia, "Inflation Targeting in New Zealand: An Experience in Evolution" (2018)' },
      { url: 'https://en.wikipedia.org/wiki/Inflation_targeting', type: 'reference', label: 'Wikipedia, "Inflation targeting"' },
    ],
  },
  {
    id: 'mgmt-six-sigma',
    discipline: 'management',
    title: 'シックス・シグマ',
    statement:
      '製品・業務プロセスのばらつき（欠陥）を統計的に管理・削減し、品質と効率を高める経営手法。「シックス・シグマ」とは、工程が平均から±6シグマ（標準偏差）の範囲に収まる極めて高い品質水準を指し、（平均が1.5シグマずれることを見込んで）100万回あたりの欠陥が3.4件（3.4 DPMO）以下、すなわち約99.9999966％を良品とする目標で表される。' +
      '1980年代にモトローラ（技術者ビル・スミス、1986年）が開発・命名し、ゼネラル・エレクトリック（GE）のジャック・ウェルチが1995年に全社展開して有名になった。代表的な改善手順がDMAIC（定義Define→測定Measure→分析Analyze→改善Improve→管理Control）。' +
      '専門家を空手の段位になぞらえ「ブラックベルト」「グリーンベルト」「マスターブラックベルト」等と呼び育成する。後にトヨタ生産方式のリーン（ムダ取り）と統合した「リーン・シックス・シグマ」も普及した。',
    keyFigures: '工程のばらつき(欠陥)を統計的に削減／±6シグマ＝100万回あたり欠陥3.4件(3.4 DPMO・約99.9999966%良品、1.5σドリフト見込み)／1980年代モトローラ(ビル・スミス1986)が開発・GEのウェルチが1995年に全社展開／改善手順DMAIC／ブラック/グリーン/マスターブラックベルト／リーン・シックス・シグマ',
    asOf: '2026-06',
    sources: [
      { url: 'https://asq.org/quality-resources/six-sigma', type: 'reference', label: 'ASQ（米国品質協会）— Six Sigma Definition / What is Lean Six Sigma?（3.4 DPMO・DMAIC・リーンとの統合）' },
      { url: 'https://asq.org/quality-resources/sixsigma/belts-executives-champions', type: 'reference', label: 'ASQ — Six Sigma Belts, Levels & Roles（グリーン／ブラック／マスターブラックベルト）' },
      { url: 'https://en.wikipedia.org/wiki/Six_Sigma', type: 'reference', label: 'Wikipedia — Six Sigma（1986年モトローラ／ビル・スミス起源、1.5σシフト、GE/ウェルチ1995年展開）' },
      { url: 'https://www.lean.org/lexicon-terms/six-sigma/', type: 'reference', label: 'Lean Enterprise Institute — Six Sigma（3.4 DPMO・DMAIC・ばらつき削減）' },
    ],
  },
  {
    id: 'human-zeigarnik',
    discipline: 'human-science',
    title: 'ツァイガルニク効果',
    statement:
      '完了した課題よりも、中断された・未完了の課題のほうが記憶に残りやすいという心理現象。リトアニア出身のソビエトの心理学者ブルーマ・ツァイガルニク（Bluma Zeigarnik）が1920年代に実証し、1927年に学術誌『Psychologische Forschung』で報告した。' +
      '彼女の指導教官であったゲシュタルト心理学者クルト・レヴィンが、ウェイターが未精算の注文はよく覚えているのに会計が済むと忘れてしまうことに気づいた逸話に着想を得て実験を行った。参加者に15〜22の簡単な作業をさせ一部を途中で中断させたところ、完了課題より中断課題のほうを想起しやすいことを見いだした。レヴィンの場理論に基づき、未完了の課題が生む心理的緊張（達成への動機づけ）が記憶を保持させ、完了で緊張が解けると想起が低下すると説明される。' +
      '学習（分割学習・復習）、目標達成、未完のストーリーへの関心、クリフハンガーやマーケティングの「続きが気になる」手法に応用される一方、後年の追試では結果が一貫せず、再現性をめぐる議論が続いている。',
    keyFigures: '中断・未完了の課題は完了課題より記憶に残りやすい／B.ツァイガルニクが1920年代に実証・1927年発表(レヴィン門下、ウェイターの逸話)／未完了が生む心理的緊張(レヴィンの場理論)が記憶を保持／学習・クリフハンガー・マーケティングに応用／再現性の議論あり',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/memory-psychology/Retrieval', type: 'reference', label: 'Encyclopaedia Britannica — Memory (psychology): Retrieval' },
      { url: 'https://www.simplypsychology.org/zeigarnik-effect.html', type: 'reference', label: 'Simply Psychology — Zeigarnik Effect Examples in Psychology' },
      { url: 'https://en.wikipedia.org/wiki/Zeigarnik_effect', type: 'reference', label: 'Wikipedia — Zeigarnik effect' },
      { url: 'https://www.nature.com/articles/s41599-025-05000-w', type: 'academic', label: 'Humanities and Social Sciences Communications (Nature, 2025) — meta-analysis of the Zeigarnik and Ovsiankina effects' },
    ],
  },
  {
    id: 'bizlaw-unfair-competition',
    discipline: 'business-law',
    title: '不正競争防止法',
    statement:
      '事業者間の公正な競争を確保するため、「不正競争」に当たる行為を類型化して禁止し、差止請求・損害賠償・刑事罰などの救済・制裁を定める法律（平成五年法律第四十七号）。1934年（昭和9年）に制定され、1993年（平成5年）に全面改正された。' +
      '規制する不正競争の代表的類型として、(1)周知な商品等表示の混同惹起、(2)著名な商品等表示の冒用、(3)商品形態の模倣（デッドコピー）、(4)営業秘密の不正取得・使用・開示、(5)限定提供データに係る不正行為、(6)技術的制限手段（コピーガード等）を無効化する装置等の提供、(7)ドメイン名の不正取得、(8)原産地・品質等の誤認惹起表示、(9)競争者の信用毀損（虚偽の事実の告知・流布）などがある。' +
      '特許・商標等の登録された知的財産権とは異なり、登録なしに不正な競争行為そのものを規制する点に特色があり、経済産業省（知的財産政策室）が所管する。',
    keyFigures: '不正競争を類型化し禁止・差止/損害賠償/刑事罰／1934年制定・1993年全面改正(平成5年法律47号)／営業秘密の保護・周知著名表示の混同/冒用・商品形態模倣(デッドコピー)・限定提供データ・技術的制限手段・ドメイン名不正取得・原産地誤認・信用毀損／登録不要で不正競争行為自体を規制／経産省所管',
    asOf: '2026-06',
    sources: [
      { url: 'https://elaws.e-gov.go.jp/document?lawid=405AC0000000047_20230606_505AC0000000028', type: 'government', label: 'e-Gov法令検索「不正競争防止法（平成五年法律第四十七号）」' },
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/unfaircompetition_new.html', type: 'government', label: '経済産業省「不正競争防止法の概要」' },
      { url: 'https://www.jpo.go.jp/news/shinchaku/event/seminer/document/chizai_setumeikai_jitsumu/30_text.pdf', type: 'government', label: '特許庁／経済産業省知的財産政策室「不正競争防止法の概要」' },
    ],
  },
  {
    id: 'infosoc-risk-society',
    discipline: 'information-sociology',
    title: 'リスク社会（ベック）',
    statement:
      'ドイツの社会学者ウルリッヒ・ベックが『リスク社会（Risikogesellschaft）』（1986、英訳1992）で提示した概念。近代化・産業化が成功し富の生産が進んだ結果、近代社会はその副産物（意図せざる帰結）として、原子力事故・環境汚染・化学物質・気候変動・遺伝子技術などの新しい人為的（製造された）リスクを大量に生み出すようになった、と論じる。' +
      'これらのリスクは目に見えにくく、国境や階級を越えて広がり（誰もが潜在的に被害者となりうる）、科学技術自身が生んだものを科学で評価せざるを得ないという再帰的な性格をもつ。社会の中心的関心が「富（財）の分配」から「リスク（害）の分配」へと移行し、専門家への信頼や政治のあり方が問い直される。' +
      'アンソニー・ギデンズらの「再帰的近代化（reflexive modernization）」論とも結びつき、現代社会論・環境社会学の重要な枠組みとなっている。',
    keyFigures: 'U.ベック『リスク社会』1986(英訳1992)／近代化の副産物として人為的リスク(原発・環境汚染・気候変動・遺伝子技術等)が増大／リスクは不可視・脱国境/脱階級・再帰的／関心が富(財)の分配からリスク(害)の分配へ／再帰的近代化(ギデンズ等)と結合',
    asOf: '2026-06',
    sources: [
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1002/9781118430873.est0316', type: 'academic', label: 'Blok, A. "Risk Society", The Wiley-Blackwell Encyclopedia of Social Theory（査読的レファレンス）' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100422576', type: 'reference', label: 'Risk society — Oxford Reference (Oxford University Press)' },
      { url: 'https://www.encyclopedia.com/science/encyclopedias-almanacs-transcripts-and-maps/risk-society', type: 'reference', label: 'Risk Society — Encyclopedia.com' },
      { url: 'https://en.wikipedia.org/wiki/Risk_society', type: 'reference', label: 'Risk society — Wikipedia（突合・補助）' },
    ],
  },
  {
    id: 'econ-taylor-rule',
    discipline: 'economics',
    title: 'テイラールール',
    statement:
      '中央銀行が政策金利をどの水準に設定すべきかを、インフレ率と産出（GDP）ギャップに反応させる形で示した金融政策の指針（ルール）。経済学者ジョン・B・テイラーが1993年の論文で提示した。' +
      '基本形は、政策金利＝均衡実質金利＋目標インフレ率＋a×（実際のインフレ率−目標インフレ率）＋b×（産出ギャップ）で、a・bは反応係数（テイラーの原型はともに0.5、均衡実質金利・目標インフレ率はともに2％と置かれた）。インフレが目標を上回れば金利を引き上げ、景気が過熱（産出ギャップがプラス）でも引き上げる。特にインフレ率に対する名目金利の反応が1を超える（名目金利をインフレ以上に動かし実質金利を上げる）べきとする「テイラー原理」は物価安定の条件とされる。' +
      '裁量的政策に対しルールに基づく政策の利点を示すものとして、また実際の中央銀行行動を記述・評価するベンチマークとして広く使われる。',
    keyFigures: 'J.B.テイラー1993提唱／政策金利をインフレ率と産出ギャップに反応させるルール／反応係数(原型は各0.5、均衡実質金利・目標インフレ率は各2%)／テイラー原理＝インフレへの反応>1で実質金利を上げ物価安定／ルールに基づく政策・中央銀行行動のベンチマーク',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.federalreserve.gov/monetarypolicy/policy-rules-and-how-policymakers-use-them.htm', type: 'government', label: 'Federal Reserve Board — Policy Rules and How Policymakers Use Them' },
      { url: 'https://www.stlouisfed.org/on-the-economy/2024/mar/output-gaps-taylor-rule-stance-monetary-policy', type: 'government', label: 'Federal Reserve Bank of St. Louis — Output Gaps, Taylor Rule and the Stance of Monetary Policy' },
      { url: 'https://www.brookings.edu/articles/the-taylor-rule-a-benchmark-for-monetary-policy/', type: 'reference', label: 'Brookings Institution — The Taylor Rule: A benchmark for monetary policy?' },
      { url: 'https://www.frbsf.org/wp-content/uploads/3-16.pdf', type: 'government', label: 'Federal Reserve Bank of San Francisco — Taylor\'s Rule and the Fed: 1970–1997' },
    ],
  },
  {
    id: 'econ-tit-for-tat',
    discipline: 'economics',
    title: '繰り返し囚人のジレンマとしっぺ返し戦略',
    statement:
      '囚人のジレンマは一回限りなら裏切りが支配戦略だが、同じ相手と無限・無期限に繰り返す場合には、将来の報復・協力を見越して協力が合理的な均衡として成立しうる（フォーク定理）。' +
      '政治学者ロバート・アクセルロッドは1980年前後にコンピュータ・トーナメントを開催し、提出された戦略を総当たりで競わせた。優勝したのは数学者アナトール・ラポポートが提出した最も単純な「しっぺ返し（tit-for-tat）」戦略で、初手は協力し、以降は相手の前回の手をそのまま真似る（協力には協力、裏切りには裏切りで応じる）というものだった。' +
      'アクセルロッドは強い戦略の特徴を、上品（自分から裏切らない）・報復的（裏切りには即応報復）・寛容（相手が協力に戻れば許す）・明快（行動が読みやすい）と整理し、『つきあい方の科学（The Evolution of Cooperation）』（1984）で協力の進化を論じた。',
    keyFigures: '繰り返しで協力が均衡になりうる(フォーク定理)／R.アクセルロッドのトーナメント／優勝はラポポートのしっぺ返し(tit-for-tat、初手協力＋相手の前回手を模倣)／強い戦略＝上品・報復的・寛容・明快／『The Evolution of Cooperation』1984',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/prisoner-dilemma/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — Prisoner\'s Dilemma（Axelrod and Tit for Tat）' },
      { url: 'https://heritage.umich.edu/stories/the-prisoners-dilemma/', type: 'academic', label: 'University of Michigan Heritage Project — The Prisoner\'s Dilemma（トーナメント／ラポポートのtit-for-tat優勝）' },
      { url: 'https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1012644', type: 'academic', label: 'PLOS Computational Biology — Properties of winning Iterated Prisoner\'s Dilemma strategies（nice/retaliating/forgiving/clear）' },
      { url: 'https://scholar.harvard.edu/files/maskin/files/folk_theorem_in_repeated_games_with_discounting_or_incomplete_information.pdf', type: 'academic', label: 'Harvard (E. Maskin) — The Folk Theorem in Repeated Games' },
    ],
  },
  {
    id: 'mgmt-transformational-leadership',
    discipline: 'management',
    title: '変革型リーダーシップ',
    statement:
      'リーダーがビジョンや理念を示してフォロワーの価値観・動機を高め、組織や個人を変革へと導くリーダーシップ。報酬と業績を交換する「交換型（取引型）リーダーシップ（transactional leadership）」と対比される。' +
      '政治学者ジェームズ・マクレガー・バーンズが1978年の著書『リーダーシップ論（Leadership）』で変革型と取引型を区別し、組織心理学者バーナード・バスがこれを発展させて測定可能なモデル（MLQ＝多因子リーダーシップ質問票、バス／アボリオ）を構築した。' +
      'バスは変革型リーダーシップの構成要素を「4つのI」として整理した：理想化された影響（idealized influence＝ロールモデル・信頼）、鼓舞的動機づけ（inspirational motivation＝魅力的なビジョン提示）、知的刺激（intellectual stimulation＝既存前提への問い直しと創造的問題解決を促す）、個別配慮（individualized consideration＝一人ひとりの成長支援）。フォロワーの満足度・努力・業績を高めるとされ、多くの実証研究の対象となっている。',
    keyFigures: 'J.M.バーンズ1978(著書Leadership)が変革型/取引型を区別／B.バスが発展・測定モデル化(MLQ、バス/アボリオ)／変革型の4つのI：理想化された影響・鼓舞的動機づけ・知的刺激・個別配慮／取引型(交換型)と対比',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/transformational-and-transactional-leadership', type: 'reference', label: 'EBSCO Research Starters — Transformational and Transactional Leadership（バーンズ1978／取引型との対比）' },
      { url: 'https://crummer.rollins.edu/news/the-four-essential-components-of-transformational-leadership/', type: 'academic', label: 'Rollins College, Crummer School of Business — The Four Essential Components of Transformational Leadership（4つのI）' },
      { url: 'https://www.michiganstateuniversityonline.com/resources/leadership/4-is-of-transformational-leadership/', type: 'academic', label: 'Michigan State University — The 4 "I\'s" of Transformational Leadership' },
      { url: 'https://pressbooks.lib.jmu.edu/sslsleadershipinstrumentslibrary/chapter/4-8-multifactor-leadership-questionnaire-mlq-mlq-5x/', type: 'academic', label: 'James Madison University — Multifactor Leadership Questionnaire (MLQ)（バス／アボリオ構築）' },
    ],
  },
  {
    id: 'human-flow',
    discipline: 'human-science',
    title: 'フロー',
    statement:
      'ある活動に完全に没入し、時間を忘れ、行為と意識が融合したような最適経験（optimal experience）の心理状態。「ゾーン」とも呼ばれる。ハンガリー系アメリカ人の心理学者ミハイ・チクセントミハイが提唱し、ポジティブ心理学の中心概念の一つとなった。' +
      'フローが生じる条件として、明確な目標、即座のフィードバック、そして課題の難易度と自分のスキルの高い水準での釣り合いが挙げられる（挑戦が高すぎると不安、低すぎると退屈になる）。フロー中は、集中の深まり、自意識の消失、強い統制感、活動自体が報酬となる自己目的的（autotelic）な性質などが体験される。' +
      'スポーツ・芸術・仕事・学習などで見られ、幸福感や高いパフォーマンス、内発的動機づけと結びつくとされ、教育・職場設計・ゲームデザイン等に応用される。',
    keyFigures: 'M.チクセントミハイが提唱（ポジティブ心理学の共同創始者）／活動への完全な没入＝最適経験(ゾーン)／条件：明確な目標・即時フィードバック・課題難易度とスキルの釣り合い／自意識消失・時間感覚の変容・自己目的的(autotelic)／内発的動機づけ・幸福と関連',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/psychology/flow-psychology', type: 'reference', label: 'EBSCO Research Starters — Flow (psychology)（査読付き参照記事）' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7551835/', type: 'academic', label: 'A Review on the Role of the Neuroscience of Flow States in the Modern World (NCBI/PMC, 査読論文)' },
      { url: 'https://www.cgu.edu/people/mihaly-csikszentmihalyi/', type: 'academic', label: 'Claremont Graduate University — Mihaly Csikszentmihalyi (所属大学の公式略歴)' },
      { url: 'https://link.springer.com/book/10.1007/978-94-017-9088-8', type: 'academic', label: 'Flow and the Foundations of Positive Psychology: The Collected Works of Mihaly Csikszentmihalyi (Springer)' },
    ],
  },
  {
    id: 'bizlaw-e-bookkeeping',
    discipline: 'business-law',
    title: '電子帳簿保存法',
    statement:
      '本来は紙での保存が原則とされる国税関係帳簿書類について、一定の要件のもとで電子データ（電磁的記録）による保存を認める法律。正式名称は「電子計算機を使用して作成する国税関係帳簿書類の保存方法等の特例に関する法律」（平成10年法律第25号）で、1998年（平成10年）に制定された。' +
      '保存方法は大きく3区分される：(1)電子帳簿等保存（会計ソフト等で電子的に作成した帳簿・書類をそのままデータ保存）、(2)スキャナ保存（紙で受領・作成した書類をスキャンして画像データで保存）、(3)電子取引データ保存（注文・請求などをメールやEDI等の電子的方法でやり取りした取引情報をデータのまま保存）。' +
      '近年たびたび改正され、2022年（令和4年）1月施行の改正（令和3年度税制改正）で事前承認制度の廃止など要件が緩和される一方、電子取引データについては紙出力保存が原則認められなくなり電子保存が義務化された（中小事業者等への宥恕・猶予措置を経て段階的に適用）。真実性の確保（タイムスタンプ等）と可視性の確保（検索機能等）が共通の保存要件とされ、国税庁が所管する。',
    keyFigures: '国税関係帳簿書類の電子データ保存を認める法律(平成10年法律25号)／1998年制定／3区分：電子帳簿等保存・スキャナ保存・電子取引データ保存／2022年改正で承認制廃止等の緩和・電子取引データは電子保存義務化／真実性確保(タイムスタンプ)・可視性確保(検索)／国税庁所管',
    asOf: '2026-06',
    sources: [
      { url: 'https://elaws.e-gov.go.jp/document?lawid=410AC0000000025_20220101_503AC0000000011', type: 'government', label: 'e-Gov法令検索「電子計算機を使用して作成する国税関係帳簿書類の保存方法等の特例に関する法律」(平成10年法律第25号)' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/02.htm', type: 'government', label: '国税庁「電子帳簿保存法の概要」(3区分・電子取引保存義務)' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/tokusetsu/index.htm', type: 'government', label: '国税庁「電子帳簿等保存制度特設サイト」' },
    ],
  },
  {
    id: 'infosoc-culture-industry',
    discipline: 'information-sociology',
    title: '文化産業（フランクフルト学派）',
    statement:
      'フランクフルト学派のテオドール・アドルノとマックス・ホルクハイマーが共著『啓蒙の弁証法（Dialektik der Aufklärung）』（1947）で展開した概念。映画・ラジオ・音楽・雑誌などの大衆向け文化が、資本主義のもとで規格化・画一化された商品として大量生産・大量消費される産業となり、文化が利潤目的に従属していると批判する。' +
      '彼らは「マスカルチャー（mass culture）」が大衆自身から自然発生した文化であるかのような誤解を排除するため、あえて上から供給される「文化産業」という語を用いた。規格化された娯楽は受け手を受動的にし、消費者を資本主義的秩序へ統合して既存の社会秩序への順応を促し、批判的思考を麻痺させる（操作・順応）とされる。' +
      '大衆を欺く啓蒙の裏返しとして、画一化された文化が個人の自律や抵抗の可能性を掘り崩すと論じ、現代のメディア・文化批評に大きな影響を与えた。',
    keyFigures: 'T.アドルノ&M.ホルクハイマー『啓蒙の弁証法』1947／フランクフルト学派の批判理論／大衆文化が規格化・商品化され利潤に従属＝文化産業／「マスカルチャー」と区別しあえて文化産業と命名／受け手を受動化し既存秩序への順応・批判的思考の麻痺',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/adorno/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — "Theodor W. Adorno"（大衆文化と文化産業への批判）' },
      { url: 'https://www.britannica.com/biography/Theodor-Wiesengrund-Adorno', type: 'reference', label: 'Encyclopaedia Britannica — "Theodor Wiesengrund Adorno"（批判理論・文化産業）' },
      { url: 'https://www.oxfordreference.com/view/10.1093/acref/9780199532919.001.0001/acref-9780199532919-e-155', type: 'reference', label: 'Oxford Reference — "Culture industry"（ホルクハイマー&アドルノの用語定義）' },
      { url: 'https://en.wikipedia.org/wiki/Culture_industry', type: 'reference', label: 'Wikipedia — "Culture industry"（『啓蒙の弁証法』1947、規格化・統制の概要）' },
    ],
  },
  {
    id: 'econ-kondratiev-waves',
    discipline: 'economics',
    title: 'コンドラチェフの波（長期波動）',
    statement:
      '資本主義経済に見られるとされる約40〜60年（おおむね50年）周期の長期的な景気の波。ロシアの経済学者ニコライ・コンドラチェフが1920年代に、英・米・仏・独などの物価・利子率・生産などの長期時系列から提唱した。' +
      '短期のキチン循環（在庫、約40か月）、中期のジュグラー循環（設備投資、約10年）、クズネッツ循環（建設、約20年）と並ぶ最も長い循環とされる。ヨーゼフ・シュンペーターは、この長期波動の駆動因を、蒸気機関・鉄道・電気・自動車・情報技術といった画期的な技術革新（イノベーション）の群生と普及に求め、各波を技術パラダイムと結びつけて説明した（「コンドラチェフの波」という名称も1939年にシュンペーターが命名）。' +
      'ただし長期波動の存在自体は統計的な実証が難しく、その実在性をめぐっては経済学界、とりわけ主流派において議論が続いている。',
    keyFigures: 'N.コンドラチェフが1920年代に提唱／約40〜60年(約50年)周期の長期波動／キチン/ジュグラー/クズネッツ循環と並ぶ最長の循環／シュンペーターが技術革新の群生で説明(1939年命名)／実在性には議論あり',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Kondratyev-cycle', type: 'reference', label: 'Encyclopaedia Britannica — "Kondratyev cycle"（約50年の景気循環、コンドラチェフにちなむ）' },
      { url: 'https://en.wikipedia.org/wiki/Kondratiev_wave', type: 'reference', label: 'Wikipedia — "Kondratiev wave"（50〜60年周期、1926年の長波論、1939年シュンペーター命名）' },
      { url: 'https://www.newworldencyclopedia.org/entry/Nikolai_Kondratiev', type: 'reference', label: 'New World Encyclopedia — Nikolai Kondratiev（1925年論文、物価・利子率・生産の分析、実証の論争）' },
    ],
  },
  {
    id: 'econ-harrod-domar',
    discipline: 'economics',
    title: 'ハロッド＝ドーマー成長モデル',
    statement:
      '経済成長率を貯蓄率と資本係数（資本産出比率）から説明する初期のケインズ派成長理論。経済の成長率＝貯蓄率÷資本係数（資本1単位の追加に必要な産出、ICOR＝資本産出比率）で表され、貯蓄・投資が多いほど、また資本効率が高い（資本係数が小さい）ほど成長が速いとする。' +
      'ロイ・ハロッド（1939）とエフセイ・ドーマー（1946）が独立に展開した。資本と労働の代替を認めず固定的な技術（固定係数）を仮定するため、完全雇用を保つ「保証成長率（warranted rate）」と人口・技術で決まる「自然成長率（natural rate）」が一致する保証がなく、いったん均衡から外れると累積的に乖離する「ナイフエッジ（刃の刃先）」的な不安定性をもつ。' +
      'この不安定性への批判から、要素代替を認めるソローらの新古典派成長モデルが生まれた。開発経済学では、必要な投資・援助規模を見積もる枠組みとしても用いられた。',
    keyFigures: '成長率＝貯蓄率÷資本係数(ICOR、g=s/k)／R.ハロッド1939&E.ドーマー1946が独立に展開／資本労働の代替を認めず(固定係数)／保証成長率と自然成長率の不一致＝ナイフエッジの不安定性／ソロー新古典派モデルの出発点・開発経済学に応用',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Harrod-Domar-equation', type: 'reference', label: 'Encyclopaedia Britannica — Harrod-Domar equation' },
      { url: 'https://en.wikipedia.org/wiki/Harrod%E2%80%93Domar_model', type: 'reference', label: 'Wikipedia — Harrod–Domar model' },
      { url: 'https://www.econstor.eu/bitstream/10419/149739/1/chope-wp-2015-12.pdf', type: 'academic', label: 'Boianovsky & Hoover, "Harrod, Domar and the history of development economics" (Duke CHOPE working paper, EconStor)' },
      { url: 'https://sites.middlebury.edu/econ0428/harrod-domar-model/', type: 'academic', label: 'Middlebury College, Economics 428 — Harrod-Domar Model' },
    ],
  },
  {
    id: 'mgmt-teal-organization',
    discipline: 'management',
    title: 'ティール組織',
    statement:
      '元マッキンゼーのコンサルタント、フレデリック・ラルー（ベルギー出身）が著書『ティール組織（原題 Reinventing Organizations）』（2014）で提示した、組織の発達段階モデルの最終段階。ラルーはケン・ウィルバーらの発達理論を踏まえ、人類の意識と組織の進化を色で表し、衝動型（レッド）・順応型（アンバー）・達成型（オレンジ）・多元型（グリーン）・進化型（ティール／青緑）と段階づけた。' +
      'ティール組織は3つの突破口（ブレイクスルー）を特徴とする：(1)自主経営（セルフマネジメント＝上司や中央の指揮命令によらず、助言プロセスを通じて個人やチームが自律的に意思決定する）、(2)全体性（ホールネス＝仮面を脱ぎ自分らしさ全体を職場に持ち込める）、(3)存在目的（エボリューショナリーパーパス＝組織自体が生命体のように進化する目的をもち、それに耳を傾けて経営する）。' +
      '固定的な階層やトップダウン管理を脱した次世代型組織として注目される一方、概念は学術理論というより、少数の事例（Buurtzorg、FAVI、Morning Star等）に基づく実務的・規範的な枠組みとされ、統計的検証の不足が指摘される。',
    keyFigures: 'F.ラルー『ティール組織（Reinventing Organizations）』2014／組織の発達段階を色で表現(レッド〜ティール、ウィルバーの発達理論が背景)／ティールの3つの突破口：自主経営・全体性・存在目的／助言プロセス／実務的・規範的枠組み（学術理論でないとの批判）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Reinventing_Organizations', type: 'reference', label: 'Wikipedia — Reinventing Organizations（書誌・3つの柱・色の段階）' },
      { url: 'https://www.reinventingorganizations.com/uploads/2/1/9/8/21988088/140305_laloux_reinventing_organizations.pdf', type: 'reference', label: 'Frédéric Laloux 本人サイト掲載の原著PDF（一次資料）' },
      { url: 'https://en.wikipedia.org/wiki/Teal_organisation', type: 'reference', label: 'Wikipedia — Teal organisation（定義・自主経営／全体性／存在目的）' },
    ],
  },
  {
    id: 'human-mindset',
    discipline: 'human-science',
    title: 'マインドセット（成長/固定）',
    statement:
      '人が自分の能力や知能の性質について抱く暗黙の信念。スタンフォード大学の心理学者キャロル・ドゥエック（Carol Dweck）が提唱した。能力は生まれつき固定的で変わらないと信じる「固定マインドセット（fixed mindset）」と、能力は努力・学習・戦略によって伸ばせると信じる「成長マインドセット（growth mindset）」に大別される。' +
      '固定マインドセットの人は、失敗や努力を能力の欠如の証拠と捉えて挑戦を避けがちなのに対し、成長マインドセットの人は、困難や失敗を学習・成長の機会と捉え、努力を惜しまず粘り強く取り組む傾向がある。ドゥエックは、結果（才能）でなくプロセス（努力・工夫）をほめることが成長マインドセットを育てると論じ（Mueller & Dweck 1998）、教育や人材育成に大きな影響を与えた。' +
      '一方、近年は介入効果の大きさ（効果量）や再現性をめぐる議論もある。',
    keyFigures: 'C.ドゥエックが提唱／固定マインドセット(能力は不変)vs成長マインドセット(能力は努力で伸びる)／成長型は困難を学習機会と捉え粘る／プロセス(努力)をほめる(Mueller & Dweck 1998)／教育・人材育成に影響、効果量・再現性の議論あり',
    asOf: '2026-06',
    sources: [
      { url: 'https://teachingcommons.stanford.edu/teaching-guides/foundations-course-design/learning-activities/growth-mindset-and-enhanced-learning', type: 'academic', label: 'Stanford Teaching Commons — Growth Mindset and Enhanced Learning（固定/成長マインドセットの定義）' },
      { url: 'https://www.psychologicalscience.org/observer/dweck-growth-mindsets', type: 'academic', label: 'Association for Psychological Science (APS) — Carol Dweck on How Growth Mindsets Can Bear Fruit in the Classroom' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/9686450/', type: 'academic', label: 'Mueller & Dweck (1998) "Praise for Intelligence Can Undermine Children\'s Motivation and Performance," JPSP 75:33–52（PubMed PMID 9686450）' },
      { url: 'https://www.kqed.org/mindshift/60490/does-growth-mindset-matter-the-debate-heats-up-with-dueling-meta-analyses', type: 'media', label: 'KQED MindShift — 成長マインドセット介入の効果量・再現性をめぐる対立的メタ分析の解説' },
    ],
  },
  {
    id: 'bizlaw-labor-contract-act',
    discipline: 'business-law',
    title: '労働契約法',
    statement:
      '労働者と使用者の間の労働契約に関する民事的な基本ルールを定める法律。2007年（平成19年）制定・2008年施行。罰則を伴う取締法規である労働基準法とは異なり、労働契約の成立・変更・終了などの民事的効力を定める点に特色がある（刑事罰や労働基準監督官による監督はない）。' +
      '主な内容として、(1)労使対等・合意原則など労働契約の基本原則、(2)判例で確立した解雇権濫用法理の明文化（客観的に合理的な理由を欠き社会通念上相当でない解雇は無効。16条）、(3)就業規則による労働条件の変更が合理的であれば契約内容になるという就業規則法理の明文化、(4)2012年（平成24年）改正で導入された有期労働契約のルール、すなわち同一使用者の下で有期契約が通算5年を超えて反復更新された場合に労働者の申込みで無期労働契約へ転換できる「無期転換ルール」（18条）、雇止め法理の明文化（19条）、不合理な労働条件の禁止などがある。' +
      '厚生労働省が所管する。',
    keyFigures: '労働契約の民事的ルールを定める法／2007年制定2008年施行(平成19年法律128号)／取締法規の労基法と異なり民事的効力(刑事罰なし)／解雇権濫用法理の明文化(16条)・就業規則法理／2012年改正で無期転換ルール(通算5年超で無期転換、18条)・雇止め法理(19条)／厚労省所管',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/419AC0000000128', type: 'government', label: 'e-Gov法令検索 労働契約法（平成19年法律第128号）' },
      { url: 'https://www.mhlw.go.jp/stf/newpage_21917.html', type: 'government', label: '厚生労働省「無期転換ルールについて」（18条）' },
      { url: 'https://www.jil.go.jp/institute/zassi/backnumber/2008/07/pdf/004-016.pdf', type: 'academic', label: '労働政策研究・研修機構(JILPT)「労働契約法の制定」' },
    ],
  },
  {
    id: 'infosoc-imagined-communities',
    discipline: 'information-sociology',
    title: '想像の共同体（アンダーソン）',
    statement:
      '政治学者ベネディクト・アンダーソンが著書『想像の共同体（Imagined Communities）』（1983）で提示した、国民（ネーション）とナショナリズムの捉え方。アンダーソンは国民を「イメージとして心に描かれた想像の政治共同体」と定義し、それは本来的に「限られた（limited）」かつ「主権的（sovereign）」なものとして想像されるとした。一国の成員の大半は互いに顔も知らず会うこともないのに、各人の心の中には共同の連帯（コミュニオン）のイメージが生きているからである。' +
      '彼はこの想像を可能にした条件として、特に「出版資本主義（print capitalism）」を重視した。活版印刷による新聞や小説が、ラテン語ではなく特定の俗語（国語）で大量に流通することで、同じ言語で同じニュースを読む不特定多数の読者が互いを同じ共同体の一員と感じるようになったと論じた。' +
      '国民は自然な実体ではなく、近代に歴史的・文化的に構成されたものだとする見方を示し、ナショナリズム研究やメディア論に決定的な影響を与えた。',
    keyFigures: 'B.アンダーソン『想像の共同体』1983／国民＝イメージとして心に描かれた想像の政治共同体(限られた・主権的)／出版資本主義(print capitalism)が俗語(国語)の新聞・小説を通じ共同体意識を醸成／国民は自然でなく近代に構成された／ナショナリズム研究・メディア論に影響',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Imagined-Communities-Reflections-on-the-Origins-and-Spread-of-Nationalism', type: 'reference', label: 'Encyclopaedia Britannica — Imagined Communities (book summary)' },
      { url: 'https://www.britannica.com/biography/Benedict-Anderson', type: 'reference', label: 'Encyclopaedia Britannica — Benedict Anderson (biography, political scientist)' },
      { url: 'https://news.cornell.edu/stories/2015/12/benedict-anderson-who-wrote-imagined-communities-dies', type: 'academic', label: 'Cornell Chronicle (Cornell University) — Benedict Anderson obituary / Imagined Communities' },
      { url: 'https://en.wikipedia.org/wiki/Imagined_Communities', type: 'reference', label: 'Wikipedia — Imagined Communities (corroborating reference)' },
    ],
  },
  {
    id: 'econ-optimal-currency-area',
    discipline: 'economics',
    title: '最適通貨圏（OCA）',
    statement:
      '複数の国や地域が共通通貨を採用する（あるいは為替を固定する）ことが経済的に最適となる条件を論じる理論。ロバート・マンデルが1961年の論文「A Theory of Optimum Currency Areas」で提唱した。' +
      '共通通貨は為替変動リスクや両替コストをなくす利益がある一方、各国・各地域が独立した金融政策や為替調整という景気対策手段を失う費用を伴う。この費用が小さく利益が上回るための条件として、(1)労働など生産要素の地域間移動性が高いこと、(2)賃金・物価の伸縮性、(3)財政の移転（リスク分担）の仕組み、(4)各地域の景気変動（非対称ショック）が似ていること、などが挙げられる（マッキノンの開放度、ケネンの生産の多様性なども補完する）。' +
      'ユーロ（欧州通貨統合）が最適通貨圏の条件をどこまで満たすかという議論の理論的基礎であり、マンデルは1999年にノーベル経済学賞を受賞した（マンデル＝フレミング・モデルとは別概念）。',
    keyFigures: 'R.マンデル1961提唱／共通通貨の利益(為替リスク・コスト減)対費用(独立した金融政策・為替調整の喪失)／条件：要素移動性・賃金物価の伸縮性・財政移転・対称的な景気変動(マッキノンの開放度・ケネンの多様性が補完)／ユーロ評価の理論的基礎／マンデル1999ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1999/summary/', type: 'reference', label: 'NobelPrize.org — 1999年経済学賞（マンデル、最適通貨圏の分析）' },
      { url: 'https://www.britannica.com/money/optimum-currency-area', type: 'reference', label: 'Britannica Money — Optimum currency area（定義・利益と費用・基準）' },
      { url: 'https://www.imf.org/en/News/Articles/2015/09/28/04/54/vc121399', type: 'government', label: 'IMF — Mundell and the Theoretical Foundation for the European Monetary Union' },
      { url: 'https://www.ecb.europa.eu/pub/pdf/scpwps/ecbwp138.pdf', type: 'government', label: 'ECB Working Paper No.138 — "New" views on the optimum currency area theory（OCA基準の整理）' },
    ],
  },
  {
    id: 'mgmt-mbo',
    discipline: 'management',
    title: '目標による管理（MBO）',
    statement:
      '組織の目標と個人の目標を連動させ、上司と部下が協働して目標を設定し、その達成度で業績を管理・評価するマネジメント手法。ピーター・ドラッカーが1954年の著書『現代の経営（The Practice of Management）』で提唱した（原語は Management by Objectives and Self-control）。' +
      'トップダウンの一方的な統制ではなく、メンバー自身が目標設定に参加し、自己統制（セルフコントロール）によって主体的に成果へ向かう点を重視するのがドラッカーの本来の狙いだった。一般に、(1)上位目標と整合した個人目標の設定、(2)一定期間の遂行、(3)達成度の評価とフィードバック、というサイクルで運用される。' +
      '後に人事評価制度として広く普及したが、ノルマ管理や数値偏重に堕すと本来の自己統制の理念が失われるとの批判もある。OKRや目標設定理論の源流の一つでもある。',
    keyFigures: 'P.ドラッカー1954『現代の経営』で提唱(Management by Objectives and Self-control)／組織目標と個人目標の連動・参加型の目標設定／自己統制(セルフコントロール)を重視／設定→遂行→評価のサイクル／数値・ノルマ偏重への堕落の批判／OKRの源流',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/edited-volume/28075/chapter-abstract/212082707', type: 'academic', label: 'Oxford Academic — "Peter F. Drucker\'s Management by Objectives and Self-Control", The Oxford Handbook of Management' },
      { url: 'https://en.wikipedia.org/wiki/Management_by_objectives', type: 'reference', label: 'Wikipedia (English) — Management by objectives' },
      { url: 'https://www.jil.go.jp/institute/zassi/backnumber/2015/04/pdf/040-041.pdf', type: 'academic', label: 'JILPT 労働政策研究・研修機構 — MBO（目標管理）解説（日本労働研究雑誌）' },
    ],
  },
  {
    id: 'human-normalcy-bias',
    discipline: 'human-science',
    title: '正常性バイアス',
    statement:
      '災害や緊急事態など、危険が迫っているという情報や兆候に直面しても、「自分は大丈夫」「これは正常の範囲内だ」「まだ大したことにはならない」と過小評価し、危険を認めず適切な避難・対処行動が遅れてしまう心理的傾向。' +
      '予期しない事態に直面したとき、心の平静を保とうとして異常を正常の範囲内のものとして処理しようとする働きによる。災害心理学では、避難の遅れや被害拡大の一因として重視され、火災・地震・津波・洪水などで「逃げ遅れ」を生む。集団でいると皆が動かないことで安心してしまい（同調性バイアス・多元的無知）、さらに避難が遅れることもある。' +
      '対策として、平時からの訓練・具体的な避難計画・早期の警報と明確な行動指示が、正常性バイアスを乗り越えて行動を促すうえで重要とされる。',
    keyFigures: '危険の兆候を「自分は大丈夫/正常範囲」と過小評価し避難・対処が遅れる／心の平静を保つため異常を正常として処理／災害心理学で逃げ遅れ・被害拡大の一因／集団では同調性バイアス・多元的無知と結びつき避難が一層遅れる／対策＝訓練・避難計画・明確な警報と行動指示',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.koka.ac.jp/sociology/news/bousailab/normalcy-bias', type: 'academic', label: '京都光華大学 防災ラボ「正常性バイアスとは何か」' },
      { url: 'https://www.jrc.or.jp/about/publication/news/20210901_020612.html', type: 'government', label: '日本赤十字社「避難の妨げになる『正常性バイアス・同調性バイアス』」' },
      { url: 'https://www.jumonji-u.ac.jp/sscs/ikeda/cognitive_bias/cate_d/d_19.html', type: 'academic', label: '十文字学園女子大学「錯思コレクション100：正常性バイアス」' },
    ],
  },
  {
    id: 'bizlaw-securities-disclosure',
    discipline: 'business-law',
    title: '企業内容開示制度（ディスクロージャー）',
    statement:
      '投資家が適切な投資判断を行えるよう、上場会社等に対し企業の財務・事業内容に関する情報の開示を義務づける、金融商品取引法に基づく制度。証券市場の公正性・透明性と投資家保護を目的とする。' +
      '大きく(1)発行市場における開示（有価証券届出書・目論見書。新たに有価証券を募集・売出しする際の開示）と、(2)流通市場における継続開示（上場後、定期・適時に行う開示）に分かれる。継続開示の中心が、事業年度ごとに財政状態・経営成績等を記載して内閣総理大臣（金融庁）に提出する「有価証券報告書」（金商法24条）であり、半期報告書（2024年4月施行の令和5年改正で従来の四半期報告書から再編）や、重要事実の発生時に提出する臨時報告書もある。提出書類はEDINETで電子的に公衆縦覧に供される。' +
      '重要事項の虚偽記載には課徴金・刑事罰や損害賠償責任が科される。証券取引所の適時開示（タイムリー・ディスクロージャー）とあわせて市場の情報インフラを構成する。',
    keyFigures: '投資判断のための企業情報開示義務(金商法)／発行開示(有価証券届出書・目論見書)と継続開示／継続開示の中心＝有価証券報告書(金商法24条、事業年度ごと、金融庁へ提出)／半期報告書(2024年4月、令和5年改正で四半期報告書から再編)・臨時報告書／EDINETで電子公衆縦覧／虚偽記載に課徴金・刑事罰・賠償責任／取引所の適時開示と並ぶ',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/323AC0000000025', type: 'government', label: 'e-Gov法令検索「金融商品取引法」（第24条 有価証券報告書の提出等）' },
      { url: 'https://lfb.mof.go.jp/kantou/disclo/gaiyou.htm', type: 'government', label: '財務省 関東財務局「企業内容等開示（ディスクロージャー）制度の概要」（発行開示/継続開示・EDINET公衆縦覧）' },
      { url: 'https://www.jpx.co.jp/equities/listing/disclosure/overview/index.html', type: 'reference', label: '日本取引所グループ（JPX）「適時開示制度の概要」' },
      { url: 'https://www.fsa.go.jp/sesc/support/kaiji-ihan/sanshutsu.html', type: 'government', label: '金融庁 証券取引等監視委員会「開示規制違反に係る課徴金額の算定方法等」' },
    ],
  },
  {
    id: 'infosoc-parasocial',
    discipline: 'information-sociology',
    title: 'パラソーシャル関係',
    statement:
      'テレビの司会者・有名人・キャラクター、近年では配信者やインフルエンサーなどのメディア上の人物に対して、視聴者・受け手が一方的に親密さや友情・信頼といった疑似的な人間関係を感じる現象。受け手は相手をよく知り親しく感じるが、相手は受け手個人を認識しておらず、関係は一方向的（one-sided）で相互発展しない点に特徴がある。' +
      '社会学者ドナルド・ホートンとリチャード・ウォールが1956年の論文「Mass Communication and Para-Social Interaction」で「パラソーシャル・インタラクション（parasocial interaction）」として概念化した。メディアの人物があたかも視聴者に直接語りかけるような演出（カメラ目線・呼びかけ）がこの「遠隔の親密さ（intimacy at a distance）」の感覚を強める。継続的な視聴で相互作用が深まり「パラソーシャル関係」へと発展し、対面の友人関係と似た心理的機能（所属感・慰め・社会的支援）をもちうる。' +
      'マーケティング（インフルエンサー）・ファン心理・孤独感との関連などで研究され、SNS・ライブ配信時代に一層注目されている。',
    keyFigures: 'メディア上の人物への一方向的(one-sided)な疑似的親密さ・友情／受け手は親しく感じるが相手は個人を認識しない／D.ホートン&R.ウォール1956が概念化(parasocial interaction)／カメラ目線・直接の呼びかけが強める／継続的相互作用でパラソーシャル関係へ発展／インフルエンサー・ファン心理・孤独感・SNSで再注目',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/parasocial-interaction', type: 'reference', label: 'Encyclopaedia Britannica — Parasocial interaction (Psychology, History & Facts)' },
      { url: 'https://www.britannica.com/topic/parasocial-relationship', type: 'reference', label: 'Encyclopaedia Britannica — Parasocial relationship (sociology)' },
      { url: 'https://www.ebsco.com/research-starters/communication-and-mass-media/parasocial-interactions', type: 'reference', label: 'EBSCO Research Starters — Parasocial Interactions (Communication & Mass Media)' },
      { url: 'https://www.tandfonline.com/doi/full/10.1080/02673843.2025.2480712', type: 'academic', label: 'Taylor & Francis (Intl. Journal of Adolescence and Youth) — Parasocial relationships, social support and well-being（査読）' },
    ],
  },
  {
    id: 'econ-hayek-knowledge',
    discipline: 'economics',
    title: 'ハイエクの知識の分散と価格メカニズム',
    statement:
      '経済活動に必要な知識は、特定の時間・場所に関する断片的な知識として無数の個人に分散して存在しており、どの単一の主体（中央計画当局）も全体を把握できない、というフリードリヒ・ハイエクの中心的洞察。論文「社会における知識の利用（The Use of Knowledge in Society）」（1945、American Economic Review）で展開した。' +
      'ハイエクは、市場の価格こそがこの分散した知識を集約・伝達する仕組みだと論じた。各人は財の価格の変化を見るだけで、その背後にある無数の事情を知らなくても、希少性の変化に適切に反応して資源配分を調整できる。価格は分散知識を要約した「シグナル」として働くため、すべての情報を集めて計算する中央計画は原理的に不可能だとし、社会主義計算論争において計画経済を批判した。' +
      'ハイエクは1974年にノーベル経済学賞（グンナー・ミュルダールと共同受賞）を受賞した。',
    keyFigures: 'F.ハイエク「社会における知識の利用」1945(American Economic Review)／知識は断片的に多数の個人へ分散し中央当局は把握不能／価格が分散知識を集約・伝達するシグナル／中央計画の不可能性・社会主義計算論争／ハイエク1974ノーベル賞(ミュルダールと共同)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1974/hayek/lecture/', type: 'reference', label: 'NobelPrize.org — Hayek 1974 Prize Lecture（市場秩序の優位性は分散した知識の活用にある）' },
      { url: 'https://www.britannica.com/money/F-A-Hayek/Hayeks-intellectual-contributions', type: 'reference', label: 'Britannica — F.A. Hayek（価格が分散知識を伝達、社会主義批判、1974年ミュルダールと共同受賞）' },
      { url: 'https://www.econlib.org/library/Essays/hykKnw.html', type: 'reference', label: 'Econlib — 原文「The Use of Knowledge in Society」(1945) 全文' },
    ],
  },
  {
    id: 'econ-piketty',
    discipline: 'economics',
    title: 'ピケティの r>g（資本収益率と格差）',
    statement:
      'フランスの経済学者トマ・ピケティが著書『21世紀の資本（Capital in the Twenty-First Century）』（仏語2013、英訳2014）で示した格差拡大のメカニズム。' +
      '資本収益率（r、資産が生む利潤・配当・利子・地代等の年率）が経済成長率（g、所得や生産の伸び）を長期的に上回る（r>g）と、資本（富）が労働所得より速く増え、すでに資産を持つ者やその相続人に富が蓄積していくため、富の格差が自動的に拡大すると論じた。ピケティは欧米の数百年に及ぶ税務・歴史データを用いて、戦争や大恐慌で一時縮小した格差が再び拡大していることを示した。対策として累進的な富裕税（グローバルな資本課税）を提案した。' +
      '一方、rとgの測り方、r>gが直ちに格差拡大を意味するかなどをめぐっては経済学界で活発な論争がある。',
    keyFigures: 'T.ピケティ『21世紀の資本』2013(仏)/2014(英訳)／資本収益率r>経済成長率gで富が労働所得より速く増え格差が拡大／長期の税務・歴史データに依拠／対策に累進的富裕税(グローバル資本課税)／r>gの含意・測定をめぐる論争(IGM調査で約80%が不同意)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Thomas-Piketty', type: 'reference', label: 'Encyclopaedia Britannica — Thomas Piketty（r>gを資本主義の中心的矛盾とする主張、累進的富裕税の提案）' },
      { url: 'https://libertystreeteconomics.newyorkfed.org/2015/07/a-discussion-of-thomas-pikettys-capital-in-the-twenty-first-century-by-how-much-is-r-greater-than-g/', type: 'government', label: 'Liberty Street Economics（ニューヨーク連邦準備銀行）— r>gとrの構成を解説' },
      { url: 'https://en.wikipedia.org/wiki/Capital_in_the_Twenty-First_Century', type: 'reference', label: 'Wikipedia — Capital in the Twenty-First Century（仏語2013/英訳2014、Goldhammer訳、Belknap/Harvard、論争）' },
      { url: 'https://www.chicagobooth.edu/review/piketty-on-inequality-34-economists-who-arent-convinced-and-one-who-is', type: 'academic', label: 'Chicago Booth Review（シカゴ大学）— IGM調査で約80%がr>gを最強要因とする見方に不同意' },
    ],
  },
  {
    id: 'mgmt-double-loop-learning',
    discipline: 'management',
    title: 'シングルループ学習とダブルループ学習',
    statement:
      '組織や個人の学習を2つのレベルで捉える概念で、クリス・アージリスとドナルド・ショーンが提唱した。シングルループ学習は、既存の目標・前提・価値観（支配変数/規範）はそのままに、意図と結果のずれ（誤差）を検出して行動だけを修正する学習である（サーモスタットが設定温度に向けて作動を調整するように）。' +
      'これに対しダブルループ学習は、誤差に直面したとき、行動の背後にある目標・前提・価値観そのものを問い直して修正する、より深い学習である（なぜその設定温度なのかを問い直すように）。問題が前提自体にある場合、シングルループでは対症療法にとどまるが、ダブルループは根本的な変革を可能にする。' +
      'アージリスは、多くの組織や有能な専門家ほど、失敗を認めず前提を問わない「防衛的思考（defensive reasoning）」に陥り、ダブルループ学習を妨げると指摘した。組織変革・組織学習論の基礎概念である。',
    keyFigures: 'C.アージリス&D.ショーンが提唱（『Organizational Learning』1978）／シングルループ＝前提を保ち行動を修正／ダブルループ＝目標・前提・価値観そのものを問い直す／サーモスタットの比喩／防衛的思考がダブルループを妨げる（有能な専門家ほど学べない）／組織変革の基礎概念',
    asOf: '2026-06',
    sources: [
      { url: 'https://infed.org/dir/welcome/chris-argyris-theories-of-action-double-loop-learning-and-organizational-learning/', type: 'reference', label: 'infed.org — Chris Argyris: theories of action, double-loop learning and organizational learning' },
      { url: 'https://www.open.edu/openlearn/mod/oucontent/view.php?id=135424&section=4.2', type: 'academic', label: 'The Open University, OpenLearn — Single and Double Loop Learning' },
      { url: 'https://hbr.org/1991/05/teaching-smart-people-how-to-learn', type: 'academic', label: 'Chris Argyris, "Teaching Smart People How to Learn," Harvard Business Review (1991)（防衛的思考）' },
      { url: 'https://en.wikipedia.org/wiki/Double-loop_learning', type: 'reference', label: 'Wikipedia — Double-loop learning（支配変数の定義の補強）' },
    ],
  },
  {
    id: 'human-barnum-effect',
    discipline: 'human-science',
    title: 'バーナム効果（フォアラー効果）',
    statement:
      '誰にでも当てはまるような曖昧で一般的な性格描写を、あたかも自分だけに正確に当てはまる記述だと感じてしまう心理傾向。占い・血液型性格判断・星占い・性格診断などが「当たっている」と感じられる主な理由とされる。' +
      '心理学者バートラム・フォアラーが1948年に学生（39名）を対象に行った実験で実証した。各人に同一の曖昧な性格文を「あなた個人の診断結果」として渡したところ、多くが高い的中度（平均4.26／5）を評価した。フォアラー自身は当初これを「個人的妥当化の誤謬」（1949年）と呼び、後にポール・ミールが興行師P.T.バーナムにちなんで「バーナム効果」と命名した（1956年）。このため「フォアラー効果」とも呼ばれる。' +
      '記述が肯定的・好意的であるほど、また権威ある出所からのものと信じるほど受け入れられやすい。確証バイアスや主観的妥当化が関与し、疑似科学・占い・マーケティングの説得力を説明する。',
    keyFigures: '誰にでも当てはまる曖昧な性格描写を自分だけに当たると感じる／占い・星占い・血液型診断が当たると感じる理由／B.フォアラー1948の実験(学生39名・平均4.26/5)で実証＝フォアラー効果／P.T.バーナムにちなみP.ミールが「バーナム効果」と命名(1956)／肯定的・権威ある記述ほど受容、確証バイアスが関与',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/Barnum-Effect', type: 'reference', label: 'Encyclopaedia Britannica — Barnum Effect' },
      { url: 'https://en.wikipedia.org/wiki/Barnum_effect', type: 'reference', label: 'Wikipedia — Barnum effect（フォアラー1948実験・平均4.26・命名経緯）' },
      { url: 'https://www.ebsco.com/research-starters/psychology/barnum-effect', type: 'reference', label: 'EBSCO Research Starters: Psychology — Barnum effect' },
      { url: 'https://www.all-about-psychology.com/forer-effect-psychology.html', type: 'reference', label: 'All About Psychology — Forer Effect Explained' },
    ],
  },
  {
    id: 'bizlaw-labor-union-act',
    discipline: 'business-law',
    title: '労働組合法',
    statement:
      '憲法28条が保障する労働者の団結権・団体交渉権・団体行動権（労働三権）を具体化し、労働組合の地位や使用者との関係を定める法律。1945年（昭和20年）に制定され、1949年（昭和24年）に全面改正された（現行法）。' +
      '主な内容として、(1)正当な争議行為（ストライキ等）に対する刑事免責・民事免責（損害賠償責任を負わない）、(2)労働協約の効力（規範的効力など）、(3)使用者が労働組合の活動を妨げる「不当労働行為」の禁止がある。不当労働行為の類型は、組合員であること等を理由とする解雇・不利益取扱い、正当な理由のない団体交渉の拒否、組合の結成・運営への支配介入や経費援助などで（7条）、これらに対しては労働委員会（中央労働委員会・都道府県労働委員会）が救済命令を発する行政救済の仕組みが設けられている。' +
      '労働基準法・労働関係調整法とあわせて「労働三法」と呼ばれる。',
    keyFigures: '憲法28条の労働三権(団結権・団体交渉権・団体行動権)を具体化／1945年制定・1949年全面改正／正当な争議行為の刑事免責・民事免責／不当労働行為の禁止(7条：不利益取扱い・団交拒否・支配介入)／労働委員会による救済命令／労働基準法・労働関係調整法と労働三法',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/324AC0000000174', type: 'government', label: 'e-Gov法令検索「労働組合法」（昭和24年法律第174号）' },
      { url: 'https://www.mhlw.go.jp/churoi/qa/index.html', type: 'government', label: '中央労働委員会（厚生労働省）— 労働委員会とは（救済命令・三者構成）' },
      { url: 'https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/houritsu/00519490601174.htm', type: 'government', label: '衆議院 制定法律 — 法律第百七十四号（昭24・6・1）労働組合法（全部改正＝現行法）' },
    ],
  },
  {
    id: 'infosoc-media-events',
    discipline: 'information-sociology',
    title: 'メディア・イベント',
    statement:
      'ダニエル・ダヤーンとエリユ・カッツが著書『メディア・イベント（Media Events: The Live Broadcasting of History）』（Harvard University Press, 1992）で論じた概念。オリンピック、国家的式典、ロイヤルウェディング、月面着陸、要人の葬儀などの、テレビで生中継される歴史的な祝祭的出来事を指す。' +
      'これらは日常の放送を中断して放送され、国民や世界の視聴者が同じ時間に同じ出来事を共有する。ダヤーンとカッツは、メディア・イベントを「競技（Contest）」「征服（Conquest）」「戴冠（Coronation）」の3類型に分けた。こうしたイベントは社会の統合や集合的記憶の形成、儀礼的な連帯（デュルケームのいう集合的沸騰に類比）をもたらすとされる。' +
      '一方、デジタル・SNS時代には、視聴の同時性が崩れ、テロや災害といった「破壊的（disruptive）」なメディア・イベントの比重が高まっているとの議論もある。',
    keyFigures: 'D.ダヤーン&E.カッツ『メディア・イベント』1992／テレビ生中継される歴史的・祝祭的出来事(五輪・式典・葬儀等)／日常放送を中断し視聴者が同時に共有／3類型：競技・征服・戴冠／社会統合・集合的記憶・儀礼的連帯(デュルケーム=集合的沸騰)／SNS時代の同時性崩壊・破壊的イベント(Couldry & Hepp)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.hup.harvard.edu/books/9780674559561', type: 'academic', label: 'Harvard University Press — Media Events（公式書誌・概要）' },
      { url: 'https://www.oxfordbibliographies.com/display/document/obo-9780199756841/obo-9780199756841-0189.xml', type: 'reference', label: 'Oxford Bibliographies (Communication) — Media Events' },
      { url: 'https://researchportal.helsinki.fi/en/publications/daniel-dayan-and-elihu-katz-1992-media-events-the-live-broadcasti/', type: 'academic', label: 'University of Helsinki Research Portal — Dayan & Katz (1992) 解説章' },
      { url: 'https://eprints.lse.ac.uk/52468/1/__libfile_REPOSITORY_Content_Couldry,%20N_Introduction%20media%20events_Couldry_Introduction%20media%20events_2013.pdf', type: 'academic', label: 'LSE Research Online — Couldry & Hepp, Introduction: Media Events in Globalized Media Cultures' },
    ],
  },
  {
    id: 'econ-new-trade-theory',
    discipline: 'economics',
    title: '新貿易理論（クルーグマン）',
    statement:
      '比較優位やヘクシャー＝オリーン定理では説明しにくい、似た要素賦存をもつ先進国どうしが同種の製品を相互に輸出入する「産業内貿易」を説明する理論。ポール・クルーグマンらが1980年前後に展開した。' +
      '鍵となるのは「規模の経済（収穫逓増）」と「製品差別化（独占的競争）」である。生産に規模の経済が働くと、各国は限られた種類の製品に特化して大量生産しコストを下げ、それを輸出する一方、他国が特化した別の差別化製品を輸入する。これにより貿易は要素賦存や技術の差がなくても生じ、消費者は多様な製品を低価格で享受できる。' +
      '先発企業が経験曲線や規模で優位に立つため、戦略的貿易政策（幼稚産業保護や補助金）が正当化されうるとの議論にもつながった。クルーグマンは貿易パターンと経済地理の分析で2008年ノーベル経済学賞を受賞した。',
    keyFigures: 'P.クルーグマンら1980年前後／規模の経済(収穫逓増)と製品差別化(独占的競争)で産業内貿易を説明／要素賦存・技術差がなくても貿易が生じる／消費者は多様性と低価格を享受／戦略的貿易政策の議論／クルーグマン2008ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2008/press-release/', type: 'reference', label: 'NobelPrize.org — 2008年経済学賞 公式プレスリリース（貿易パターンと立地の分析）' },
      { url: 'https://www.britannica.com/money/Paul-Krugman', type: 'reference', label: 'Encyclopaedia Britannica — Paul Krugman（New Trade Theory・収穫逓増・戦略的貿易政策）' },
      { url: 'https://documents1.worldbank.org/curated/en/205941468764425699/pdf/multi0page.pdf', type: 'government', label: 'World Bank Policy Research Working Paper 1274 — "The New Trade Theory"' },
    ],
  },
  {
    id: 'econ-greshams-law',
    discipline: 'economics',
    title: 'グレシャムの法則',
    statement:
      '「悪貨は良貨を駆逐する（Bad money drives out good）」と要約される貨幣に関する法則。同じ額面で実質価値（金銀の含有量など素材価値）の異なる2種類の貨幣が、法律で同じ価値として強制的に通用（法定平価）させられているとき、人々は価値の高い「良貨」を手元に退蔵したり地金として溶かしたり海外へ持ち出したりする一方、価値の低い「悪貨」を支払いに使う。' +
      'その結果、流通からは良貨が姿を消し悪貨ばかりが出回るようになる、という現象を指す。16世紀イングランドの財政家トマス・グレシャムにちなみ、19世紀にH・D・マクラウドが命名した（同様の指摘はコペルニクスやオレームら先行者にもあり、グレシャム自身が初出ではない）。' +
      '両貨幣が強制的に等価とされる点が前提であり、為替が自由に変動できる場合には成立しない。金属貨幣の改鋳や複本位制の不安定性などを説明する古典的法則である。',
    keyFigures: '「悪貨は良貨を駆逐する」／同額面で実質価値の異なる2貨幣が法定平価で強制通用→良貨は退蔵・溶解・流出し悪貨が流通に残る／トマス・グレシャムにちなみマクラウド(19世紀)が命名(先行者：オレーム・コペルニクス)／強制的な等価が前提・自由変動では不成立',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Greshams-law', type: 'reference', label: 'Encyclopaedia Britannica — Gresham\'s law（法定平価で安価な金属の貨幣が流通し良貨は退蔵・輸出される）' },
      { url: 'https://www.econlib.org/library/YPDBooks/Brough/brghNLM.html', type: 'reference', label: 'Econlib（Library of Economics and Liberty）— 法定平価が前提で為替自由変動では不成立、悪貨流通・良貨退蔵の仕組み' },
      { url: 'https://www.clevelandfed.org/-/media/project/clevelandfedtenant/clevelandfedsite/publications/economic-commentary/2005/ec-20051001-the-tale-of-greshams-law-pdf.pdf', type: 'government', label: 'Federal Reserve Bank of Cleveland, "The Tale of Gresham\'s Law" — 命名経緯と先行者' },
    ],
  },
  {
    id: 'mgmt-porter-diamond',
    discipline: 'management',
    title: 'ポーターのダイヤモンド・モデル（国の競争優位）',
    statement:
      'なぜ特定の国・地域が特定の産業で国際競争力をもつのかを説明する枠組み。マイケル・ポーターが著書『国の競争優位（The Competitive Advantage of Nations）』（1990）で示した。10カ国・4年間の研究に基づき、国の競争優位は相互に関連する4つの決定要因（ダイヤモンドの4頂点）の相互作用から生まれるとする。' +
      '(1)要素条件（熟練労働・インフラ・技術・資本など生産要素の質）、(2)需要条件（自国の需要の規模と質。目の肥えた厳しい顧客が企業を高度化させる）、(3)関連・支援産業（競争力ある供給業者や関連産業の集積＝クラスター）、(4)企業の戦略・構造・競争（国内の競争の激しさや経営慣行）。これに「政府」と「偶然（チャンス）」が補助要因として加わり各決定要因に影響する。' +
      '各要因が相互に強化し合うことで産業クラスターが形成され持続的な国際競争力が生まれるとし、産業政策・地域クラスター論の基礎となった。',
    keyFigures: 'M.ポーター『国の競争優位』1990／国の競争優位を決める4要因(ダイヤモンド)：要素条件・需要条件・関連支援産業・企業の戦略構造競争／政府と偶然が補助／10カ国4年間の研究／産業クラスター論の基礎',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/1990/03/the-competitive-advantage-of-nations', type: 'academic', label: 'Michael E. Porter, "The Competitive Advantage of Nations," Harvard Business Review (1990) — 原典論文' },
      { url: 'https://saylordotorg.github.io/text_fundamentals-of-global-strategy/s04-03-clustering-porter-s-national-d.html', type: 'academic', label: 'Saylor Academy open textbook — "Clustering: Porter\'s National Diamond"' },
      { url: 'https://www.ebsco.com/research-starters/economics/diamond-model', type: 'reference', label: 'EBSCO Research Starters (Economics) — "Diamond Model"' },
    ],
  },
  {
    id: 'human-representativeness',
    discipline: 'human-science',
    title: '代表性ヒューリスティック',
    statement:
      'ある対象がどのカテゴリーに属するか、ある事象が起こる確率を判断する際、それが典型例・原型（ステレオタイプ）にどれだけ似ているか（代表的か）によって見積もる心の近道。エイモス・トベルスキーとダニエル・カーネマンが提唱した（利用可能性ヒューリスティックと並ぶ代表的なヒューリスティック）。' +
      'この近道は、客観的な基準率（事前確率）を無視する「基準率の無視」を生む。また、ある人物像の説明が典型的であるほど、より限定的な（確率の低いはずの）条件付き判断を高く見積もる「連言錯誤」が生じる（例：フェミニズム運動に熱心という描写の女性を「銀行員」より「銀行員かつフェミニスト」の方が当てはまると判断するリンダ問題）。' +
      '少数の事例で全体を代表させて誤る「少数の法則」もこの一種。確率判断の系統的な誤りの源泉として行動経済学の基礎となった。',
    keyFigures: '典型例・ステレオタイプへの類似度で確率・所属を判断／A.トベルスキー&D.カーネマンが提唱／基準率の無視／連言錯誤(リンダ問題)／少数の法則／利用可能性ヒューリスティックとは別',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/heuristic-reasoning', type: 'reference', label: 'Encyclopaedia Britannica — Heuristic（Kahneman & Tversky: representativeness, availability, anchoring）' },
      { url: 'https://www.simplypsychology.org/base-rate-fallacy.html', type: 'reference', label: 'SimplyPsychology — Base Rate Fallacy / 代表性と基準率の無視・連言錯誤（リンダ問題）' },
      { url: 'https://www.semanticscholar.org/paper/BELIEF-IN-THE-LAW-OF-SMALL-NUMBERS-Tversky-Kahneman/894fc603f9b16e775f95045fb805b5d7e6935944', type: 'academic', label: 'Tversky & Kahneman (1971) "Belief in the Law of Small Numbers", Psychological Bulletin' },
    ],
  },
  {
    id: 'bizlaw-trademark',
    discipline: 'business-law',
    title: '商標法',
    statement:
      '商品やサービス（役務）を他社のものと区別するために事業者が使用する標識（商標＝文字・図形・記号・立体的形状・色彩・音など）を保護する知的財産法。現行の商標法は1959年（昭和34年）に制定された（昭和34年法律第127号）。' +
      '商標を特許庁に出願し登録を受けると「商標権」が発生し、権利者は指定した商品・役務についてその商標を独占的に使用でき、他人の無断使用を差し止め・損害賠償請求できる。存続期間は設定登録から10年だが、更新登録の申請により何度でも更新でき半永久的に保有できる点が、特許権や著作権と異なる特色である。商標は(1)出所表示機能、(2)品質保証機能、(3)宣伝広告機能をもち、ブランドに蓄積された信用（グッドウィル）を保護することで需要者の利益と公正な競争秩序を守る。' +
      '先願（登録）主義を採り、識別力のない普通名称等は登録できない（商標法第3条）。日本では2015年（平成27年4月）から動き・ホログラム・色彩のみ・音・位置といった「新しいタイプの商標」も登録可能になった。',
    keyFigures: '商品・役務の標識(商標)を登録により保護／現行法は1959年(昭和34年)制定(昭和34年法律127号)／登録で商標権発生・独占使用と差止/損害賠償／存続10年だが更新で半永久／出所表示・品質保証・広告の三大機能／先願登録主義・識別力(3条)／2015年から動き・ホログラム・色彩・音・位置の新タイプ商標／特許庁所管',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/334AC0000000127', type: 'government', label: 'e-Gov法令検索「商標法（昭和三十四年法律第百二十七号）」' },
      { url: 'https://www.jpo.go.jp/system/trademark/gaiyo/seidogaiyo/chizai08.html', type: 'government', label: '特許庁「商標制度の概要」（存続期間10年・更新／商標の機能／先願主義）' },
      { url: 'https://www.jpo.go.jp/system/trademark/gaiyo/newtype/index.html', type: 'government', label: '特許庁「新しいタイプの商標の保護制度」（平成27年4月開始）' },
    ],
  },
  {
    id: 'infosoc-media-richness',
    discipline: 'information-sociology',
    title: 'メディア・リッチネス理論',
    statement:
      'コミュニケーション・メディアによって伝えられる情報の「豊かさ（richness）」には差があり、課題の曖昧さ（equivocality）・不確実性に応じて適切なメディアを選ぶべきだとする理論。リチャード・L・ダフトとロバート・H・レンゲルが1986年の論文（Management Science）で体系化した（1980年代に提唱）。' +
      'メディアのリッチネスは、(1)即時のフィードバックの速さ、(2)複数の手がかり（声の調子・表情・身振り等の伝達チャネル）、(3)自然言語・数値の多様性、(4)個人的な焦点（感情や個別性への適合）、の4基準で評価される。原典では対面コミュニケーションが最もリッチで、電話、宛先のある文書（手紙・メモ）、公式文書、数値資料の順にリーン（希薄）になるとされた。' +
      '曖昧で多義的な課題（対立の調整・交渉等）にはリッチなメディアが、定型的で明確な課題には効率的なリーンメディアが適合し、ミスマッチは過剰簡略化や過剰複雑化を招くとする。電子メール・SNS・リモートワークのメディア選択を論じる基礎理論として広く参照されている。',
    keyFigures: 'R.ダフト&R.レンゲルが提唱（原典1986年 Management Science）／メディアのリッチネス4基準：即時フィードバック・複数手がかり・言語多様性・個人的焦点／対面が最リッチ〜数値・公式文書がリーン／曖昧な課題にはリッチ・定型課題にはリーンが適合／メール・リモートワークのメディア選択の基礎',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/media-richness-theory', type: 'reference', label: 'EBSCO Research Starters — Media Richness Theory（百科事典的レファレンス）' },
      { url: 'https://en.wikipedia.org/wiki/Media_richness_theory', type: 'reference', label: 'Wikipedia — Media richness theory（4基準・序列・1986年原典）' },
      { url: 'https://collablab.northwestern.edu/CollabolabDistro/nucmc/DaftAndLengel-OrgInfoReq-MediaRichnessAndStructuralDesign-MngmtSci-1986.pdf', type: 'academic', label: 'Daft & Lengel (1986) "Organizational Information Requirements, Media Richness and Structural Design", Management Science 32:554–571（原典PDF, Northwestern University ホスト）' },
      { url: 'https://is.theorizeit.org/wiki/Media_richness_theory', type: 'academic', label: 'IS Theories Wiki（情報システム理論コミュニティ）— Media richness theory' },
    ],
  },
  {
    id: 'econ-expected-utility',
    discipline: 'economics',
    title: '期待効用理論',
    statement:
      '不確実性（リスク）下での合理的な意思決定を、各結果から得られる効用にその生起確率を掛けて足し合わせた「期待効用」を最大化する選択として説明する理論。金額そのものの期待値ではなく効用の期待値を用いる点が重要で、これにより少額の保険料を払って大損を避ける（リスク回避）行動などを、効用関数の凹性（限界効用逓減）として説明できる。' +
      'ダニエル・ベルヌーイによるサンクトペテルブルクのパラドックスの解決（1738年）に起源をもち、ジョン・フォン・ノイマンとオスカー・モルゲンシュテルンが1944年『ゲームの理論と経済行動』で、完備性・推移性・連続性・独立性という公理を満たす選好をもつ主体は期待効用を最大化するように行動する、という形で公理的に基礎づけた（表現定理。効用関数は正の線形変換まで一意）。' +
      '標準的経済学の合理的選択の中核をなす規範理論である一方、アレのパラドックスやプロスペクト理論など、現実の選択が独立性公理などに反する例も知られる。',
    keyFigures: '不確実性下で期待効用(効用×確率の和)を最大化する選択／効用関数の凹性でリスク回避を説明／ベルヌーイのサンクトペテルブルクのパラドックス(1738)に起源／フォン・ノイマン&モルゲンシュテルン1944が公理的に基礎づけ(完備性・推移性・連続性・独立性)／アレのパラドックス・プロスペクト理論が反例',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/von-Neumann-Morgenstern-utility-function', type: 'reference', label: 'Britannica「Von Neumann–Morgenstern utility function」（VNM公理・期待効用最大化）' },
      { url: 'https://plato.stanford.edu/entries/rationality-normative-utility/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy「Normative Theories of Rational Choice: Expected Utility」（VNM表現定理・独立性公理）' },
      { url: 'https://plato.stanford.edu/entries/paradox-stpetersburg/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy「The St. Petersburg Paradox」（ベルヌーイ1738・限界効用逓減・リスク回避）' },
    ],
  },
  {
    id: 'econ-allais-paradox',
    discipline: 'economics',
    title: 'アレのパラドックス',
    statement:
      '期待効用理論の「独立性公理（共通の結果を加減しても2つの選択肢の選好順位は変わらないはず）」に、実際の人々の選択が系統的に反することを示した有名な反例。フランスの経済学者モーリス・アレが1953年に提示した。' +
      '典型例では、(状況1)確実に得られる賞金と、より高額だがわずかに外れる可能性のあるくじを比べると、多くの人は確実な方を選ぶ。(状況2)両方の選択肢から当選確率を大きく下げて「どうせ当たりにくい」状況にすると、今度は高額側のくじを選ぶ。この2つの選択は期待効用理論（独立性公理）では両立しないが、現実には広く観察される（カーネマン&トベルスキーの実験では一方を約82%、他方を約83%が選んだ）。' +
      '人が確実性を特別に重んじる「確実性効果」が背景にあり、後のカーネマン&トベルスキーのプロスペクト理論（確率を主観的に重みづけする）の重要な出発点となった。アレは1988年にノーベル経済学賞を受賞した。',
    keyFigures: 'M.アレ1953提示（"Le Comportement de l\'Homme Rationnel devant le Risque", Econometrica）／期待効用理論の独立性公理に反する系統的反例／確実性効果（確実な結果を過大評価）／プロスペクト理論の出発点／アレ1988ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/decision-theory/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — Decision Theory（アレのパラドックス・独立性公理）' },
      { url: 'https://plato.stanford.edu/entries/rationality-normative-utility/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — Normative Theories of Rational Choice: Expected Utility' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1988/allais/facts/', type: 'reference', label: 'NobelPrize.org — Maurice Allais, 1988年経済学賞' },
      { url: 'https://en.wikipedia.org/wiki/Allais_paradox', type: 'reference', label: 'Wikipedia — Allais paradox（提示年・選択構造・実験比率）' },
    ],
  },
  {
    id: 'mgmt-organizational-commitment',
    discipline: 'management',
    title: '組織コミットメント',
    statement:
      '従業員が自分の所属する組織に対して抱く心理的な結びつき・愛着の強さで、定着（離職の少なさ）や貢献意欲を左右する組織行動論の概念。ジョン・マイヤー（John Meyer）とナタリー・アレン（Natalie Allen）が1991年に提唱した「3成分モデル（three-component model）」が広く用いられる。' +
      '(1)情緒的コミットメント（affective＝組織への感情的愛着・同一化・関与。組織に居たいから留まる）、(2)継続的コミットメント（continuance＝辞めると失うものが大きい・転職コストゆえに留まる、損得勘定）、(3)規範的コミットメント（normative＝恩義や義務感から留まるべきだと感じる）。3成分は相互に関連しつつ区別可能で、職務満足や職務関与とも区別される。' +
      '情緒的コミットメントが最も望ましく、出勤・パフォーマンス・組織市民行動と最も強く好ましい正の関係をもつとされる。マイヤー&アレンによる測定尺度（質問票）も開発され、人材定着や組織開発の研究・実務で広く参照されている。',
    keyFigures: '従業員の組織への心理的結びつき／J.マイヤー&N.アレンの3成分モデル(1991)：情緒的(愛着)・継続的(損得)・規範的(義務感)／情緒的コミットメントが最も望ましい／職務満足・定着・組織市民行動と関連／測定尺度',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/105348229190011Z', type: 'academic', label: 'Meyer & Allen (1991) "A three-component conceptualization of organizational commitment," Human Resource Management Review（原典・査読誌）' },
      { url: 'https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1081&context=qicwdumbrella', type: 'academic', label: 'University of Nebraska-Lincoln Digital Commons — Organizational Commitment（大学リポジトリ）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/8980084/', type: 'academic', label: 'Meyer, Allen & Smith — Affective, Continuance, and Normative Commitment: Construct Validity（PubMed・査読誌）' },
    ],
  },
  {
    id: 'human-self-determination',
    discipline: 'human-science',
    title: '自己決定理論（SDT）',
    statement:
      '人間の動機づけとパーソナリティに関する理論で、エドワード・デシ（Edward L. Deci）とリチャード・ライアン（Richard M. Ryan）がロチェスター大学で提唱した。人は生まれつき成長・自己実現に向かう傾向をもち、その原動力として3つの基本的心理欲求の充足が重要だとする：(1)自律性（autonomy＝自分の行動を自分で選び決めている感覚）、(2)有能感（competence＝効果的に物事をこなせる感覚）、(3)関係性（relatedness＝他者とつながり受け入れられている感覚）。' +
      'これらが満たされると内発的動機づけ（活動それ自体が楽しいから行う）や心理的well-beingが高まり、満たされないと動機や幸福が損なわれる。報酬や罰などの外的統制はかえって内発的動機を低下させうる（アンダーマイニング効果）とし、外発的動機づけも自律性の程度で連続的に段階づけられる（有機的統合理論）。' +
      '教育・職場・スポーツ・医療の動機づけ支援に広く応用される。',
    keyFigures: 'E.デシ&R.ライアンが提唱（ロチェスター大学）／3つの基本的心理欲求：自律性・有能感・関係性／充足で内発的動機づけ・well-beingが高まる／外的報酬が内発的動機を下げるアンダーマイニング効果／有機的統合理論／教育・職場等に応用',
    asOf: '2026-06',
    sources: [
      { url: 'https://selfdeterminationtheory.org/theory/', type: 'academic', label: 'selfdeterminationtheory.org — Theory（デシ&ライアン本人運営の公式理論解説）' },
      { url: 'https://www.apa.org/research-practice/conduct-research/self-determination-theory.html', type: 'academic', label: 'American Psychological Association — Self-determination theory' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/11392867/', type: 'academic', label: 'Ryan & Deci (2000), American Psychologist（査読論文・PubMed索引）' },
    ],
  },
  {
    id: 'bizlaw-market-manipulation',
    discipline: 'business-law',
    title: '相場操縦の禁止',
    statement:
      '証券市場の公正な価格形成を歪める人為的な取引を禁止する、金融商品取引法の不公正取引規制の一つ（金商法159条等）。未公表の重要事実を利用するインサイダー取引とは異なり、相場操縦は取引そのものによって相場を人為的に変動させ、他の投資者を誤認させる行為を対象とする。' +
      '典型的な類型として、(1)仮装取引（権利の移転を目的としない自己取引など実体のない見せかけの売買、159条1項）、(2)馴合取引（あらかじめ通謀した者どうしが同時期・同価格で行う売買、159条1項）、(3)現実取引による相場操縦（取引を誘引する目的で、売買が繁盛であると誤解させ、または相場を変動させるべき一連の売買を行う行為、159条2項）、(4)風説の流布・偽計（虚偽の情報を流して相場を変動させる行為、金商法158条）などがある。' +
      '違反には課徴金や刑事罰（懲役・罰金）が科され、得た利益は没収・追徴される。調査・摘発は証券取引等監視委員会が担う。',
    keyFigures: '市場の公正な価格形成を歪める人為的取引を禁止(金商法159条等)／インサイダー取引と異なり取引自体で相場を操作し投資者を誤認させる／類型：仮装取引・馴合取引(159条1項)・現実取引による相場操縦(159条2項、誘引目的が要件)・風説の流布偽計(158条)／課徴金・刑事罰・没収追徴、証券取引等監視委員会が摘発',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/323AC0000000025', type: 'government', label: 'e-Gov法令検索「金融商品取引法」（158条 風説の流布等・159条 相場操縦行為等の禁止）' },
      { url: 'https://www.fsa.go.jp/sesc/support/hukousei/hukousei.html', type: 'government', label: '証券取引等監視委員会（金融庁）「不公正取引規制違反に係る課徴金制度について」' },
      { url: 'https://www.jpx.co.jp/regulation/preventing/manipulation/index.html', type: 'reference', label: '日本取引所グループ（JPX）「相場操縦規制」' },
    ],
  },
  {
    id: 'infosoc-media-dependency',
    discipline: 'information-sociology',
    title: 'メディア・システム依存理論',
    statement:
      '人々がメディアにどれだけ依存するかによって、メディアが個人や社会に及ぼす影響力の強さが決まるとする理論。サンドラ・ボール=ロキーチとメルヴィン・デフルアが1976年に提唱した。' +
      '人は自分の目標（理解・志向・遊び＝現実を理解する／行動の指針を得る／娯楽・気晴らしを得る）を達成するためにメディアの情報資源に依存し、依存が強いほどメディアの認知・感情・行動への効果が大きくなる。依存の度合いは、(1)社会が複雑で不安定なほど（戦争・災害・変動期など、自前の情報源では足りないとき）、(2)メディアが社会で果たす情報機能の中心性が高いほど高まる。' +
      'オーディエンス・メディア・社会システムの三者の相互依存関係に注目する点に特色があり、限定効果論と強力効果論の中間に位置づけられる。災害報道やデジタルメディアへの依存研究にも応用される。',
    keyFigures: 'S.ボール=ロキーチ&M.デフルア1976提唱／メディアへの依存度が効果の強さを規定／個人の目標(理解・志向・遊び)達成のため情報資源に依存／社会の不安定・変動期ほど依存と効果が増す／オーディエンス・メディア・社会の三者の相互依存／限定効果と強力効果の中間',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/media-dependency', type: 'reference', label: 'Britannica — Media dependency（理解・志向・遊びの3目標、1976年Ball-Rokeach&DeFleur提唱）' },
      { url: 'https://journals.sagepub.com/doi/10.1177/009365027600300101', type: 'academic', label: 'Ball-Rokeach & DeFleur (1976) "A Dependency Model of Mass-Media Effects", Communication Research 3(1):3–21（原典）' },
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1002/9781405186407.wbiecm051', type: 'academic', label: 'Ball-Rokeach, "Media System Dependency Theory", International Encyclopedia of Communication (Wiley)' },
    ],
  },
  {
    id: 'econ-arrow-impossibility',
    discipline: 'economics',
    title: 'アローの不可能性定理',
    statement:
      '3つ以上の選択肢があるとき、個人の選好順位を社会全体の選好順位へ集計する「理想的な」方法は存在しないことを示した社会的選択理論の定理。ケネス・アローが1951年の著書『社会的選択と個人的評価』で証明した。' +
      'アローは、社会的な集計ルールが満たすべき合理的で民主的な複数の条件を示した：(1)広範性（定義域の非限定。どんな個人選好の組み合わせにも適用できる）、(2)パレート原理（全員がxをyより好むなら社会もそうする）、(3)無関係な選択肢からの独立性（xとyの社会的順位は両者への個人の選好だけで決まる）、(4)非独裁性（特定の一個人の選好がつねに社会の選好になることはない）。' +
      'アローは、これらをすべて同時に満たす集計ルールは独裁制以外に存在しない（推移性を保てない＝多数決の循環などが生じる）ことを証明した。投票・民主主義・厚生経済学の基礎をなし、アローは1972年ノーベル経済学賞を受賞した。',
    keyFigures: 'K.アロー1951『社会的選択と個人的評価』で証明／個人選好を社会選好へ理想的に集計する方法は存在しない／条件：広範性・パレート原理・無関係選択肢からの独立性・非独裁性／同時充足は独裁制のみ／投票/民主主義/厚生経済学の基礎／アロー1972ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/impossibility-theorem', type: 'reference', label: 'Encyclopaedia Britannica — Impossibility theorem (Arrow\'s Paradox, Voting Theory & Social Choice)' },
      { url: 'https://plato.stanford.edu/entries/arrows-theorem/', type: 'academic', label: 'Stanford Encyclopedia of Philosophy — Arrow\'s Theorem' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1972/arrow/facts/', type: 'reference', label: 'NobelPrize.org — Kenneth J. Arrow, 1972年経済学賞' },
    ],
  },
  {
    id: 'econ-kaldor-hicks',
    discipline: 'economics',
    title: 'カルドア＝ヒックス基準（補償原理）',
    statement:
      'ある政策や経済状態の変化が社会的に望ましい（効率を高める）かを判定する厚生経済学の基準。誰の効用も下げずに少なくとも一人を改善できる場合のみ改善とみなすパレート基準は厳しすぎて現実の政策評価に適用しにくいため、それを緩めたものである。' +
      'カルドア＝ヒックス基準では、その変化によって得をする人（勝者）の利益が損をする人（敗者）の損失を上回り、原理的には勝者が敗者に補償してもなお勝者に余りが残る（＝全員が以前より悪くならない状態を作りうる）なら、その変化は効率を改善するとみなす。重要なのは、補償が実際に行われる必要はなく、補償が可能であれば足りる点であり、これを潜在的パレート改善と呼ぶ。そのため一部の人は実際には以前より悪化しうる。' +
      'ニコラス・カルドアとジョン・ヒックスが1939年に独立に提唱し、便益が費用を上回れば実施するという費用便益分析の理論的基礎となった。ただし所得分配を無視する、補償が現実に行われず敗者が放置されうる、A→BもB→Aも改善と判定される循環（シトフスキーの逆説）が生じうる等の批判がある。',
    keyFigures: 'N.カルドア&J.ヒックス1939に独立に提唱／勝者の利益>敗者の損失で潜在的に全員改善可能なら効率改善／補償は可能であれば足り実際の補償は不要(潜在的パレート改善)／パレート基準を緩めた基準／費用便益分析の基礎／分配無視・シトフスキーの逆説等の批判',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Kaldor-Hicks-efficiency', type: 'reference', label: 'Encyclopaedia Britannica — Kaldor-Hicks efficiency' },
      { url: 'https://en.wikipedia.org/wiki/Kaldor%E2%80%93Hicks_efficiency', type: 'reference', label: 'Wikipedia — Kaldor–Hicks efficiency' },
      { url: 'https://law.duke.edu/sites/default/files/centers/clepp/cost_benefit_analysis_law_and_society.pdf', type: 'academic', label: 'Duke University School of Law — Cost-Benefit Analysis (Encyclopedia of Law & Society)' },
    ],
  },
  {
    id: 'mgmt-mintzberg-organization',
    discipline: 'management',
    title: 'ミンツバーグの組織構造の5類型',
    statement:
      '組織を構成する基本要素と調整メカニズムの違いから、組織形態を類型化したヘンリー・ミンツバーグの枠組み。著書『組織の構造化（The Structuring of Organizations）』（1979, Prentice-Hall）等で示した。' +
      'ミンツバーグは組織を5つの基本部分（戦略尖端＝トップ経営層／中間管理層／作業核＝現場の実務者／技術構造＝標準化を担うスタッフ／支援スタッフ）から成るとし、どの部分が支配的かと、どの調整メカニズム（相互調整・直接監督・作業の標準化・成果の標準化・技能の標準化）が中心かによって、5つの基本的な組織形態を導いた：(1)単純構造（直接監督、起業初期の小組織）、(2)機械的官僚制（作業の標準化、大量生産・行政組織）、(3)専門的官僚制（技能の標準化、病院・大学など専門職組織）、(4)事業部制（成果の標準化、多角化大企業）、(5)アドホクラシー（相互調整、革新的なプロジェクト型組織）。' +
      '状況に応じて適切な形態が異なるとするコンティンジェンシー的な組織論である。',
    keyFigures: 'H.ミンツバーグ『組織の構造化』1979／組織の5つの基本部分：戦略尖端・中間管理層・作業核・技術構造・支援スタッフ／調整メカニズム5種／5類型：単純構造・機械的官僚制・専門的官僚制・事業部制・アドホクラシー／状況適合的な組織論',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.open.edu/openlearn/money-business/business-strategy-studies/what-are-mintzbergs-five-components-organisation-the-one-minute-guide', type: 'academic', label: 'The Open University (OpenLearn) — Mintzbergの組織の5要素ガイド' },
      { url: 'https://platform.europeanmoocs.eu/users/8/Lunenburg-Fred-C.-Organizational-Structure-Mintzberg-Framework-IJSAID-V14-N1-2012.pdf', type: 'academic', label: 'Lunenburg, F.C. (2012) "Organizational Structure: Mintzberg\'s Framework", IJSAID' },
      { url: 'https://www.accaglobal.com/us/en/student/exam-support-resources/fundamentals-exams-study-resources/f1/technical-articles/mintzberg-theory.html', type: 'reference', label: 'ACCA Global — Mintzberg\'s theory on organisations' },
    ],
  },
  {
    id: 'human-planned-behavior',
    discipline: 'human-science',
    title: '計画的行動理論（TPB）',
    statement:
      '人の行動は、その行動をとろうとする「意図（behavioral intention）」によって直接予測され、意図は3つの要因によって決まるとする社会心理学の理論。アイゼク（イチェク）・アイゼンが1980年代に提唱した。' +
      '3要因とは、(1)行動への態度（その行動を良い／悪いと評価する程度）、(2)主観的規範（その行動を周囲の重要な他者が期待していると感じる社会的圧力）、(3)知覚された行動コントロール（その行動を自分が容易に実行できると感じる程度＝バンデューラの自己効力感に近い）である。マーティン・フィッシュバインとアイゼンが1970年代に提唱した「合理的行為理論（theory of reasoned action）」に、本人の意思だけでは統制しきれない行動を説明するため「知覚された行動コントロール」を加えて拡張したもの。' +
      '健康行動（禁煙・運動・受診）・環境配慮行動・消費行動などの予測・介入に広く用いられる一方、意図と実際の行動のギャップ（意図-行動ギャップ）や感情の軽視などの限界も指摘される。',
    keyFigures: 'I.アイゼンが1980年代に提唱／行動は意図が予測し、意図は態度・主観的規範・知覚された行動コントロールの3要因で決まる／合理的行為理論(フィッシュバイン&アイゼン1970年代)に知覚された行動コントロールを加えた拡張／健康・環境・消費行動の予測に応用／意図-行動ギャップの限界',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.simplypsychology.org/theory-of-planned-behavior.html', type: 'reference', label: 'SimplyPsychology — Theory of Planned Behavior' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/theory-planned-behavior', type: 'reference', label: 'EBSCO Research Starters — Theory of planned behavior' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7909498/', type: 'academic', label: 'The Theory of Planned Behavior: Selected Recent Advances and Applications (PMC, NCBI)' },
      { url: 'https://en.wikipedia.org/wiki/Theory_of_planned_behavior', type: 'reference', label: 'Wikipedia — Theory of planned behavior' },
    ],
  },
  {
    id: 'bizlaw-industrial-safety',
    discipline: 'business-law',
    title: '労働安全衛生法',
    statement:
      '職場における労働者の安全と健康を確保し、快適な作業環境の形成を促進することを目的とする法律。1972年（昭和47年）に労働基準法から分離・独立する形で制定された。' +
      '事業者に対し、危険・健康障害を防止するための措置義務を課すとともに、安全衛生管理体制の整備（一定規模以上の事業場での総括安全衛生管理者・安全管理者・衛生管理者・産業医の選任、安全衛生委員会の設置等）、機械・危険物・有害物に関する規制、労働者への安全衛生教育、作業環境測定、医師による健康診断の実施などを義務づける。2015年からは一定規模の事業場に対し、労働者のメンタルヘルス不調を未然に防ぐための「ストレスチェック制度」も義務化された（労働安全衛生法66条の10）。' +
      '違反には罰則があり、厚生労働省（労働基準監督署）が監督する。労働基準法が労働条件の最低基準を定めるのに対し、本法は安全衛生に特化した取締法規である。',
    keyFigures: '職場の安全・健康の確保と快適な作業環境の形成／1972年(昭和47年)に労働基準法から分離独立して制定(昭和47年法律57号)／事業者の危険防止措置義務・安全衛生管理体制(総括安全衛生管理者/安全管理者/衛生管理者/産業医・安全衛生委員会)／健康診断・安全衛生教育・作業環境測定／2015年ストレスチェック制度義務化(66条の10)／労基署が監督・罰則あり',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/347AC0000000057', type: 'government', label: 'e-Gov法令検索「労働安全衛生法」（昭和四十七年法律第五十七号）' },
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=74001000&dataType=0&pageNo=1', type: 'government', label: '厚生労働省「労働安全衛生法（昭和47年6月8日法律第57号）」' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/anzeneisei12/index.html', type: 'government', label: '厚生労働省「ストレスチェック制度・メンタルヘルス対策」' },
    ],
  },
  {
    id: 'econ-engels-law',
    discipline: 'economics',
    title: 'エンゲルの法則',
    statement:
      '所得が増えるにつれて、家計の総支出（消費支出）に占める食料費の割合（エンゲル係数）が低下する、という経験法則。逆に言えば、貧しい家計ほど食料費の割合が高い。' +
      '食料は生存に不可欠で需要に上限があり、所得が増えても食料支出はそれほど増えないため（食料は必需品で所得弾力性が0と1の間と低い）、所得が増えるとその他（教育・娯楽・サービス等）への支出割合が高まる。ドイツの統計学者エルンスト・エンゲルが1857年にベルギーの労働者家計の調査（家計簿）から見いだした。' +
      '食料費の割合（エンゲル係数）は生活水準を測る代表的な指標として、国や時代の豊かさの比較に用いられる。ただし家族構成や食料価格、外食・中食の動向などの影響も受けるため、単純な比較には注意が必要とされる。',
    keyFigures: '所得増→家計の食料費割合(エンゲル係数)が低下／食料は必需品で所得弾力性が低い(0〜1の間)／E.エンゲル1857がベルギー家計調査から発見／エンゲル係数は生活水準の指標／家族構成・価格・外食動向の影響に注意',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Engel-curve', type: 'reference', label: 'Encyclopaedia Britannica — Engel curve / Engel\'s law' },
      { url: 'https://www.britannica.com/money/Ernst-Engel', type: 'reference', label: 'Encyclopaedia Britannica — Ernst Engel（人物・1857年/ベルギー家計調査）' },
      { url: 'https://fredblog.stlouisfed.org/2016/10/engels-law-is-still-good-food-for-thought/', type: 'government', label: 'St. Louis Fed（FRED Blog）— Engel\'s law' },
    ],
  },
  {
    id: 'econ-beveridge-curve',
    discipline: 'economics',
    title: 'ベバリッジ曲線（UV曲線）',
    statement:
      '失業率（Unemployment）と欠員率・求人率（Vacancy）の関係を表す右下がりの曲線。横軸に失業率、縦軸に欠員率をとると、好況期は欠員が多く失業が少なく（左上）、不況期は欠員が少なく失業が多い（右下）というように、両者は負の相関を示し、景気循環に伴って曲線上を動く。' +
      'イギリスの経済学者ウィリアム・ベバリッジ（『自由社会における完全雇用』1944年）にちなんで名付けられた。重要なのは曲線の位置（原点からの距離）で、失業も欠員もともに高い（曲線が右上方＝外側へシフトする）状態は、求人と求職がうまく結びつかない労働市場の「マッチング効率の悪化」を示し、構造的失業やミスマッチの拡大を意味する。逆に内側へのシフトはマッチング改善を示す。' +
      '労働市場の効率性や構造的失業を分析する道具として、中央銀行（各地区連銀）や労働経済学で用いられる。',
    keyFigures: '失業率と欠員率(求人率)の負の相関を表す右下がり曲線／景気循環で曲線上を移動(好況=低失業高欠員、不況=高失業低欠員)／W.ベバリッジ(Full Employment in a Free Society, 1944)にちなむ／曲線の外側シフト=マッチング効率悪化・構造的失業の拡大／労働市場の効率性分析に利用',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.richmondfed.org/publications/research/economic_brief/2021/eb_21-36', type: 'government', label: 'Richmond Fed — Revisiting the Beveridge Curve（外側シフト＝マッチング効率低下）' },
      { url: 'https://www.stlouisfed.org/on-the-economy/2022/jul/beveridge-curve-labor-market-recovery', type: 'government', label: 'St. Louis Fed — What Does the Beveridge Curve Tell Us about the Labor Market Recovery?' },
      { url: 'https://en.wikipedia.org/wiki/Beveridge_curve', type: 'reference', label: 'Wikipedia — Beveridge curve（定義・W.ベバリッジ由来・1944年著作）' },
    ],
  },
  {
    id: 'mgmt-shared-value',
    discipline: 'management',
    title: '共有価値の創造（CSV）',
    statement:
      '企業が社会的課題の解決を事業の中核に組み込み、社会的価値と経済的価値（利益）を同時に生み出すことを目指す経営の考え方。マイケル・ポーターとマーク・クラマーが2011年のHarvard Business Review論文「Creating Shared Value」で提唱した。' +
      '利益を上げた後に一部を社会貢献に充てる従来のCSR（企業の社会的責任）が、利益とは切り離された「コスト」「義務」として扱われがちなのに対し、CSVは社会課題への対応そのものを競争力・収益の源泉と捉える点に違いがある。彼らは共有価値を生む方法として、(1)製品と市場の再定義（社会ニーズを満たす製品で新市場を開拓）、(2)バリューチェーンの生産性の再定義（資源効率・労働環境の改善でコスト削減と社会便益を両立）、(3)地域クラスターの形成（立地地域の産業基盤・人材を育てる）の3つを挙げた。' +
      '一方、CSRの焼き直しにすぎない、トレードオフを過小評価しているとの批判もある（Crane et al. 2014）。',
    keyFigures: 'M.ポーター&M.クラマー2011 HBR「Creating Shared Value」／社会的価値と経済的価値を同時創造／CSR(利益と分離した義務)との違い＝社会課題を競争力の源泉に／3つの方法：製品市場の再定義・バリューチェーンの再定義・地域クラスター形成／CSRの焼き直し等の批判',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/2011/01/the-big-idea-creating-shared-value', type: 'academic', label: 'Porter & Kramer, "The Big Idea: Creating Shared Value," Harvard Business Review, Jan–Feb 2011（一次資料）' },
      { url: 'https://www.hbs.edu/faculty/Pages/item.aspx?num=39071', type: 'academic', label: 'Harvard Business School Faculty & Research — "Creating Shared Value"（書誌・要旨）' },
      { url: 'https://journals.sagepub.com/doi/10.1525/cmr.2014.56.2.130', type: 'academic', label: 'Crane, Palazzo, Spence & Matten, "Contesting the Value of Creating Shared Value," California Management Review 56(2), 2014（査読・批判）' },
    ],
  },
  {
    id: 'human-achievement-motivation',
    discipline: 'human-science',
    title: '達成動機理論（マクレランドの3欲求）',
    statement:
      '人の動機づけを後天的に獲得された欲求から説明する理論で、心理学者デイヴィッド・マクレランドが提唱した（「欲求理論」「習得された欲求理論／Acquired Needs Theory」とも呼ばれる）。人は生まれつきではなく文化や経験を通じて3つの欲求をもち、その強さの違いが行動を方向づけるとする：' +
      '(1)達成欲求（need for achievement＝困難だが現実的な目標を自らの力で成し遂げたい。適度なリスクや具体的・即時的なフィードバック、結果が自分の努力に帰属する課題を好む）、(2)権力欲求（need for power＝他者に影響を与え統制したい）、(3)親和欲求（need for affiliation＝他者と良好な関係を築き受け入れられたい）。' +
      'マクレランドは特に達成欲求に注目し、達成欲求の高い人は起業家や成果志向の職務で力を発揮する一方、優れた管理者・トップには他者を組織目的に向けて動かす社会的（制度的）権力欲求が重要だと論じた。欲求は研修等で開発可能ともされ、動機づけ・人材配置・リーダーシップ開発に応用される。欲求は投影法であるTAT（主題統覚検査）で測定された。',
    keyFigures: 'D.マクレランドが提唱（主著『The Achieving Society』1961）／後天的に習得される3欲求：達成・権力・親和／達成欲求の高い人は適度なリスク・具体的FBを好み成果志向／優れた管理者・トップには社会的権力欲求／TAT(投影法)で測定／人材配置・リーダーシップ開発に応用',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/psychology/need-theory-three-needs-theory', type: 'reference', label: 'EBSCO Research Starters (Psychology) — Need theory (Three Needs Theory)' },
      { url: 'https://courses.lumenlearning.com/suny-hccc-orgbehavior/chapter/5-2-need-based-theories-of-motivation/', type: 'academic', label: 'SUNY / Lumen Learning, Organizational Behavior 5.2 — Need-Based Theories of Motivation' },
      { url: 'https://www.newworldencyclopedia.org/entry/David_McClelland', type: 'reference', label: 'New World Encyclopedia — David McClelland' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/31782177/', type: 'academic', label: 'PubMed (History of the Human Sciences) — McClelland, McBer & the business of the TAT, 1962–1985' },
    ],
  },
  {
    id: 'bizlaw-workers-comp',
    discipline: 'business-law',
    title: '労働者災害補償保険法（労災保険）',
    statement:
      '労働者が業務上の事由（業務災害）または通勤による負傷・疾病・障害・死亡について、必要な保険給付を行う政府管掌の社会保険制度を定める法律。1947年（昭和22年）に制定された。' +
      '労働基準法は使用者に労働災害の無過失補償責任を課しているが、使用者の支払能力に関わらず確実に補償するため、国が保険者となる労災保険でこれを担保する仕組みである。保険料は原則として全額事業主が負担し、労働者の負担はない。給付には、療養（補償）給付（治療費）、休業（補償）給付（休業中の所得補償）、障害（補償）給付、遺族（補償）給付、傷病（補償）年金、介護（補償）給付などがある。' +
      '労働者を一人でも雇う事業は原則として強制適用で、正社員・パートを問わず適用される。1973年改正で通勤災害も給付対象に加えられた。厚生労働省（労働基準監督署）が所管・運営する。',
    keyFigures: '業務災害・通勤災害による負傷/疾病/障害/死亡を補償する政府管掌の社会保険／1947年(昭和22年)制定／労基法の使用者の無過失補償責任を担保／保険料は原則全額事業主負担(労働者負担なし)／療養・休業・障害・遺族給付等／労働者を雇う事業は原則強制適用／1973年改正で通勤災害も対象／労基署が所管',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000050', type: 'government', label: 'e-Gov法令検索 労働者災害補償保険法（昭和22年法律第50号）法令本文' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/rousaihoken.html', type: 'government', label: '労災保険制度｜厚生労働省' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/roudouhokenpoint/', type: 'government', label: '労災保険・雇用保険の特徴｜厚生労働省（保険料全額事業主負担）' },
    ],
  },
  {
    id: 'econ-rbc',
    discipline: 'economics',
    title: '実物的景気循環論（RBC）',
    statement:
      '景気変動の主因を、貨幣的・需要的要因ではなく、技術進歩の変動など「実物的（供給側）」のショックに求めるマクロ経済理論。フィン・キドランドとエドワード・プレスコットが1982年の論文「Time to Build and Aggregate Fluctuations」で展開した。' +
      '価格や賃金は伸縮的で市場は常に均衡しているとし、合理的期待をもつ家計・企業が技術ショックに対して労働供給や投資を最適に調整した結果として、景気の好不況（GDP・雇用の変動）が生じると説明する。この立場では、景気変動は市場の失敗ではなく、ショックへの効率的な反応（＝均衡）であるため、政府の安定化政策はかえって望ましくないと含意される。' +
      'ケインジアンの価格硬直性・需要管理とは対照的で、ニュー・ケインジアンとの論争を通じて現代マクロ経済学（動学的確率的一般均衡＝DSGEモデル）の発展に寄与した。キドランドとプレスコットは2004年にノーベル経済学賞を受賞した。',
    keyFigures: 'F.キドランド&E.プレスコット1982「Time to Build and Aggregate Fluctuations」／景気変動の主因は技術等の実物的(供給)ショック／価格伸縮的・市場は常に均衡・合理的期待／景気変動はショックへの効率的反応で安定化政策は不要との含意／ケインジアンと対照、DSGEへ／2004ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2004/summary/', type: 'reference', label: 'NobelPrize.org — 2004年経済学賞（キドランド&プレスコット）授賞理由' },
      { url: 'https://www.britannica.com/topic/Time-to-Build-and-Aggregate-Fluctuations', type: 'reference', label: 'Britannica — Time to Build and Aggregate Fluctuations（1982年論文）' },
      { url: 'https://www.minneapolisfed.org/research/quarterly-review/some-skeptical-observations-on-real-business-cycle-theory', type: 'government', label: 'Federal Reserve Bank of Minneapolis — Real Business Cycle Theory（市場均衡・安定化政策の含意）' },
    ],
  },
  {
    id: 'econ-asset-bubble',
    discipline: 'economics',
    title: '資産価格バブル',
    statement:
      '株式・不動産などの資産価格が、配当やファンダメンタルズ（本来の経済的価値＝将来配当の割引現在価値）から大きくかい離して持続的に高騰し、その後急落（崩壊）する現象。価格上昇が「さらに値上がりするだろう」という期待を呼んでさらなる買いを誘い、自己増殖的に膨張する点に特徴がある（投機的側面＝配当目的でなく転売目的の保有）。' +
      'チューリップ・バブル（17世紀オランダ）、南海泡沫事件（1720年）、1980年代後半の日本の資産バブル、2000年前後のITバブル、2000年代後半の米国住宅バブルなどが歴史的な例。背景として、過剰な信用（レバレッジ）・金融緩和、楽観的な群衆心理（群集行動）、「今回は違う（this time is different）」という思い込みが指摘される。' +
      'バブル崩壊は不良債権・バランスシート毀損を通じて金融危機や長期停滞（日本の「失われた10年」等）を招きうるため、金融政策・規制で資産価格の行き過ぎにどう対応するかが論点となる。事前（形成時）の識別が難しいことも特徴である。',
    keyFigures: '資産価格がファンダメンタルズから乖離し高騰→急落／値上がり期待が自己増殖的に買いを呼ぶ(投機的・転売目的)／例：チューリップ・南海泡沫・日本のバブル・ITバブル・米住宅バブル／過剰信用・金融緩和・群衆心理・「今回は違う」が背景／崩壊は金融危機・長期停滞を招く／事前識別が困難',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/what-is-greater-fool-theory', type: 'reference', label: 'Britannica Money — Greater Fool Theory（バブルと投機的フィードバックループ）' },
      { url: 'https://www.chicagofed.org/publications/chicago-fed-letter/2012/november-304', type: 'government', label: 'Federal Reserve Bank of Chicago — Asset Price Bubbles: Causes, Consequences, and Public Policy Options (2012)' },
      { url: 'https://www.federalreserve.gov/newsevents/speech/mishkin20080515a.htm', type: 'government', label: 'Federal Reserve Board — F. Mishkin, "How Should We Respond to Asset Price Bubbles?" (2008)' },
      { url: 'https://www.imf.org/external/pubs/ft/wp/2013/wp1345.pdf', type: 'government', label: 'IMF Working Paper WP/13/45 — A. Scherbina, "Asset Price Bubbles: A Selective Survey"' },
    ],
  },
  {
    id: 'mgmt-bullwhip-effect',
    discipline: 'management',
    title: 'ブルウィップ効果',
    statement:
      'サプライチェーン上で、最終消費者の需要のわずかな変動が、小売→卸→メーカー→部品供給者と川上にさかのぼるほど増幅され、各段階の発注量・在庫変動が大きく振れる現象。鞭（むち）の手元のわずかな動きが先端で大きく振れる様子になぞらえて名づけられた。スタンフォード大学のハウ・リー（Hau L. Lee）らが1997年の論文（Management Science誌）で要因を分析した。' +
      '主な原因として、(1)需要予測の更新（各段階が自分の受注をもとに予測し安全在庫を上乗せ）、(2)発注のバッチ化（まとめ発注）、(3)価格変動・販促による先買い（フォワード・バイイング）、(4)品薄時の水増し発注と割当（配給ゲーム）が挙げられる。結果として過剰在庫・品切れ・コスト増・サービス低下を招く。' +
      '対策として、実需要情報の共有（POS連携・EDIによる情報の可視化）、リードタイム短縮、EDLP（毎日低価格）による価格安定、VMI（ベンダー主導型在庫管理）などが有効とされる。MITスローン校発祥の「ビールゲーム」でも体験的に示される。',
    keyFigures: '消費者需要の小変動が川上ほど増幅される／鞭の比喩／スタンフォード H.リーら1997(Management Science 43, 546-558)が要因分析／原因：需要予測更新・発注バッチ化・先買い・配給ゲーム／過剰在庫・品切れを招く／対策：需要情報共有・リードタイム短縮・EDLP・VMI／ビールゲーム',
    asOf: '2026-06',
    sources: [
      { url: 'https://sloanreview.mit.edu/article/the-bullwhip-effect-in-supply-chains/', type: 'academic', label: 'Lee, Padmanabhan & Whang, "The Bullwhip Effect in Supply Chains", MIT Sloan Management Review (1997)' },
      { url: 'https://www.sciencedirect.com/topics/economics-econometrics-and-finance/bullwhip-effect', type: 'academic', label: 'ScienceDirect Topics (Elsevier) — Bullwhip Effect overview' },
      { url: 'https://en.wikipedia.org/wiki/Bullwhip_effect', type: 'reference', label: 'Wikipedia — Bullwhip effect（定義・原因・対策・ビールゲーム）' },
      { url: 'https://www.gsb.stanford.edu/faculty-research/publications/information-transmission-bullwhip-effect-empirical-investigation', type: 'academic', label: 'Stanford Graduate School of Business — bullwhip effect research（Hau Lee 所属確認）' },
    ],
  },
  {
    id: 'human-social-facilitation',
    discipline: 'human-science',
    title: '社会的促進と社会的抑制',
    statement:
      '他者の存在（観察者や共行為者がいること）が、個人の課題遂行に影響を与える現象。単純で習熟した課題では他者がいるとパフォーマンスが向上し（社会的促進）、複雑で不慣れな課題では逆に低下する（社会的抑制）。' +
      'ノーマン・トリプレットが1898年に、自転車競技者が単独より競争相手がいるときに速いことなどから初期の研究を行ったとされる（社会心理学最初期の実験研究の一つ）。ロバート・ザイアンスが1965年に、他者の存在が覚醒（動因）を高め、その状況で最も出やすい「優勢反応」を強める、と説明する動因理論を示した。優勢反応は、よく習熟した課題では正しい反応（→促進）だが、不慣れな課題では誤った反応（→抑制）であるため、課題の性質によって効果の向きが変わる。' +
      '評価懸念（他者に評価される不安）や注意の分散も説明として挙げられる。社会的手抜き（集団での努力低下）とは別概念である。',
    keyFigures: '他者の存在が課題遂行に影響／単純/習熟課題は促進・複雑/不慣れ課題は抑制／トリプレット1898が初期研究／ザイアンス1965の動因理論(覚醒が優勢反応を強める)／評価懸念・注意分散も説明／社会的手抜きとは別',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/social-facilitation', type: 'reference', label: 'Encyclopaedia Britannica — Social facilitation' },
      { url: 'https://www.simplypsychology.org/social-facilitation.html', type: 'reference', label: 'SimplyPsychology — Social Facilitation Theory In Psychology' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803095731503', type: 'reference', label: 'Oxford Reference — Drive theory of social facilitation' },
      { url: 'https://www.ebsco.com/research-starters/psychology/social-facilitation', type: 'reference', label: 'EBSCO Research Starters (Psychology) — Social facilitation' },
    ],
  },
  {
    id: 'bizlaw-leniency',
    discipline: 'business-law',
    title: '課徴金減免制度（リニエンシー）',
    statement:
      'カルテルや入札談合（不当な取引制限）に関与した事業者が、その違反内容を自ら公正取引委員会に報告し、必要な資料を提出した場合に、課徴金を減額または免除する独占禁止法上の制度。2005年改正（2006年施行）で日本に導入された。' +
      '秘密裏に行われ発見・立証が難しいカルテルについて、内部からの自主的な申告を促すことで違反の摘発・抑止を図るのが狙いである。申告の順位が早いほど減免率が高く設定され（最初に単独で申告した者は課徴金が全額免除されるなど）、これにより事業者間に「他社に先んじて申告した方が得だ」という疑心暗鬼（囚人のジレンマ的状況）を生み、カルテルを内部から崩す効果がある。' +
      '2019年改正（2020年施行）で、申告順位による減免に加え、事業者の調査協力の度合いに応じて減算する「調査協力減算制度」が導入され、減免を受けられる事業者数の上限も見直された。',
    keyFigures: 'カルテル・談合の自主申告で課徴金を減免する独禁法の制度／2005年改正(2006年施行)で導入／自主申告を促し摘発・抑止／申告順位が早いほど高減免(最先着は全額免除)・囚人のジレンマ的にカルテルを崩す／2019年改正で調査協力減算制度を追加／公正取引委員会が運用',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jftc.go.jp/dk/seido/genmen/index.html', type: 'government', label: '公正取引委員会「課徴金減免制度」' },
      { url: 'https://www.jftc.go.jp/dk/kaisei/r1kaisei/index.html', type: 'government', label: '公正取引委員会「改正独占禁止法（令和元年）」' },
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000054', type: 'government', label: 'e-Gov法令検索「私的独占の禁止及び公正取引の確保に関する法律」（独占禁止法）' },
    ],
  },
  {
    id: 'infosoc-hyperpersonal',
    discipline: 'information-sociology',
    title: 'ハイパーパーソナル・モデル',
    statement:
      'テキスト中心のオンライン上のコミュニケーション（CMC＝コンピュータ媒介コミュニケーション）が、対面よりもかえって親密で社会的に望ましい関係を生むことがある、と説明する理論。ジョセフ・ウォルサーが1996年に提唱した。CMCは非言語的手がかり（表情・声）が乏しく対面に劣るとされてきた（手がかり欠如理論／cues-filtered-out）が、ウォルサーはむしろ手がかりが限られることを利点と捉えた。' +
      '4つの要素から説明される：(1)送り手は自分を理想的・選択的に自己呈示できる、(2)受け手は限られた手がかりから相手を過大に理想化（ステレオタイプ的に好意的に補完）する、(3)非同期性により、メッセージを推敲し最適なタイミングで発信できる（編集可能性）、(4)これらが相互にフィードバック・ループを形成し期待や行動が増幅される。' +
      'オンラインデート・SNS・遠隔チームでの急速な親密化や、逆に幻滅を説明する枠組みとして用いられる。',
    keyFigures: 'テキスト中心CMCが対面以上に親密・好意的になりうる／J.ウォルサー1996提唱／手がかり欠如(cues-filtered-out)をむしろ利点と捉える／4要素：選択的自己呈示・受け手の理想化・非同期/編集可能性・フィードバックループ／オンラインデート・SNS・遠隔チームの親密化を説明',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.1177/009365096023001001', type: 'academic', label: 'Walther, J.B. (1996) "Computer-Mediated Communication: Impersonal, Interpersonal, and Hyperpersonal Interaction." Communication Research 23(1):3-43 (SAGE) — 原典' },
      { url: 'https://eric.ed.gov/?id=EJ521347', type: 'government', label: 'ERIC (U.S. Department of Education / IES) 原論文の書誌レコード EJ521347' },
      { url: 'https://en.wikipedia.org/wiki/Hyperpersonal_model', type: 'reference', label: 'Wikipedia「Hyperpersonal model」— 4要素と cues-filtered-out 対比の概説' },
    ],
  },
  {
    id: 'econ-monetarism',
    discipline: 'economics',
    title: 'マネタリズム',
    statement:
      '経済の名目所得や物価の変動を主に貨幣供給量（マネーサプライ）の動きで説明し、金融政策を重視する経済学の立場・学派。貨幣数量説を現代的に再構築したミルトン・フリードマンが代表的論者で、「インフレーションはいつでもどこでも貨幣的現象である」という言葉で知られる。' +
      '短期には貨幣供給の変化が産出に影響しうるが、長期的には物価のみを動かす（貨幣の中立性、長期フィリップス曲線は垂直）とし、裁量的な総需要管理（ケインジアン的な財政・金融の微調整）はラグや予測誤差でかえって経済を不安定化させると批判した。そのうえで、中央銀行は経済成長率に見合った一定率（年3〜5%程度）で貨幣供給を増やす「k%ルール」を機械的に守るべきだと主張した。フリードマンとシュウォーツは『アメリカ貨幣史』で、大恐慌は貨幣供給の急減（1930〜33年に約3割減）が深刻化させたと論じた。' +
      '1970年代のスタグフレーション下で影響力を強めたが、貨幣需要・貨幣の流通速度の不安定化により1980年代以降は純粋な貨幣供給目標は退いた。',
    keyFigures: '名目所得・物価は主に貨幣供給で決まるとし金融政策を重視／M.フリードマンが代表「インフレは常に貨幣的現象」／長期は貨幣中立・裁量政策を批判／k%ルール(一定率の貨幣供給)／フリードマン&シュウォーツ『アメリカ貨幣史』で大恐慌を貨幣的に説明／1980年代以降は純粋な貨幣目標は後退',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/monetarism', type: 'reference', label: 'Encyclopaedia Britannica — Monetarism' },
      { url: 'https://www.econlib.org/library/Enc/Monetarism.html', type: 'reference', label: 'Econlib (Library of Economics and Liberty) — Monetarism' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1976/summary/', type: 'reference', label: 'NobelPrize.org — Milton Friedman, 1976年経済学賞' },
      { url: 'https://www.federalreservehistory.org/essays/great-depression', type: 'government', label: 'Federal Reserve History — The Great Depression（貨幣供給の急減）' },
    ],
  },
  {
    id: 'econ-creative-destruction',
    discipline: 'economics',
    title: '創造的破壊',
    statement:
      '資本主義の発展の本質は、新しい技術・製品・生産方法・市場・組織といったイノベーションが、古い技術や既存の企業・産業を絶えず破壊しながら、経済構造を内部から革新し続けるプロセスにある、とする考え方。経済学者ヨーゼフ・シュンペーターが著書『資本主義・社会主義・民主主義』（1942）で「創造的破壊（creative destruction）」と表現し広めた（着想にはマルクス等の影響もある）。' +
      'シュンペーターは、企業家（アントレプレナー）による新結合（イノベーション）こそが利潤と経済発展の源泉であり、均衡を絶えず壊す動態的な変化が資本主義の活力だと論じた。新しい産業が興れば古い産業は淘汰され、雇用や既得権益の喪失という痛みを伴うが、それが長期的な生産性向上と成長をもたらす。' +
      'デジタル化やプラットフォーム企業による既存産業の破壊を論じる現代の議論でも広く参照される。',
    keyFigures: 'イノベーションが古い技術・企業を破壊しつつ経済構造を内部から革新／J.シュンペーター『資本主義・社会主義・民主主義』1942で命名・普及／企業家の新結合(イノベーション)が利潤と発展の源泉／淘汰の痛みを伴うが長期の生産性向上をもたらす／現代のデジタル破壊論でも参照',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/creative-destruction', type: 'reference', label: 'Britannica Money — Creative Destruction: Innovation, Growth, & Examples' },
      { url: 'https://www.econlib.org/library/Enc/CreativeDestruction.html', type: 'reference', label: 'Econlib (Library of Economics and Liberty) — Creative Destruction' },
      { url: 'https://www.britannica.com/topic/Capitalism-Socialism-and-Democracy', type: 'reference', label: 'Britannica — Capitalism, Socialism, and Democracy (work by Schumpeter)' },
    ],
  },
  {
    id: 'mgmt-toyota-production',
    discipline: 'management',
    title: 'トヨタ生産方式（リーン生産方式）',
    statement:
      '徹底したムダの排除によって品質・コスト・納期を高める、トヨタ自動車が確立した生産管理の体系。大野耐一らが中心となって発展させた。2本の柱からなる：(1)ジャスト・イン・タイム（JIT＝必要なものを、必要なときに、必要なだけ生産・供給し、在庫のムダをなくす。後工程引取り・かんばん方式で実現）、(2)自働化（にんべんのついた自動化＝異常が起きたら機械や人が自ら停止し、不良品を後工程に流さず問題を顕在化させる）。' +
      '加えて、つくりすぎ・手待ち・運搬・加工・在庫・動作・不良という「7つのムダ」の排除、現地現物（現場で事実を見る）、平準化、継続的改善（カイゼン）を重視する。' +
      '1990年前後にMITの国際自動車研究プログラムがこれを「リーン生産方式（lean production）」として体系化・命名し、製造業だけでなくサービス業・ソフトウェア開発（リーン・スタートアップ等）にも広く応用されている。',
    keyFigures: 'トヨタが確立・大野耐一が発展／2本柱：ジャスト・イン・タイム(かんばん方式)と自働化(異常で自動停止)／7つのムダの排除・カイゼン・平準化・現地現物／MITが「リーン生産方式」と命名・体系化(1990頃)／サービス業・ソフト開発にも応用',
    asOf: '2026-06',
    sources: [
      { url: 'https://global.toyota/en/company/vision-and-philosophy/production-system/', type: 'reference', label: 'Toyota Motor Corporation 公式 — Toyota Production System（JIT・自働化の2本柱）' },
      { url: 'https://www.lean.org/lexicon-terms/toyota-production-system/', type: 'reference', label: 'Lean Enterprise Institute — Toyota Production System（大野耐一の開発経緯・定義）' },
      { url: 'https://www.lean.org/lexicon-terms/lean-production/', type: 'reference', label: 'Lean Enterprise Institute — Lean Production（MIT IMVPによる命名・1990年の体系化）' },
      { url: 'https://en.wikipedia.org/wiki/Toyota_Production_System', type: 'reference', label: 'Wikipedia — Toyota Production System（7つのムダ・かんばん・歴史）' },
    ],
  },
  {
    id: 'human-schema',
    discipline: 'human-science',
    title: 'スキーマ理論',
    statement:
      '人が世界についての知識を、過去の経験から作られた構造化された枠組み（スキーマ）として頭の中に蓄え、それを使って新しい情報を理解・解釈・記憶するとする認知心理学の理論。スキーマは知覚や記憶を方向づけ、欠けた情報を既存の知識で補完（推論）させる一方、スキーマに合わない情報は見落とされたり、スキーマに合うように歪めて記憶されたりする。' +
      'イギリスの心理学者フレデリック・バートレットが『想起（Remembering）』（1932）で、被験者に異文化の物語（「幽霊たちの戦い」）を繰り返し再生させた実験から、人の記憶は録音のような正確な再現ではなく、自分の文化的スキーマに沿って能動的に再構成される（再構成的記憶）ことを示し、スキーマ概念を確立した。' +
      '後に人工知能のフレーム理論や、特定の出来事の定型的な流れを表す「スクリプト」（シャンク&エイベルソン）などに発展し、学習・読解・ステレオタイプ・目撃証言の研究にも応用される。',
    keyFigures: '知識の構造化された枠組み(スキーマ)が情報の理解・記憶を方向づける／欠落を補完し、不一致情報は無視/歪曲される／F.バートレット『想起』1932「幽霊たちの戦い」実験で再構成的記憶を実証／スクリプト(シャンク&エイベルソン)・フレーム理論へ発展／学習・ステレオタイプ・目撃証言に応用',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/schema-cognition', type: 'reference', label: 'Encyclopaedia Britannica — Schema (cognition)' },
      { url: 'https://www.britannica.com/biography/Frederic-Bartlett-psychologist', type: 'reference', label: 'Encyclopaedia Britannica — Frederic Bartlett (psychologist)' },
      { url: 'https://www.ebsco.com/research-starters/psychology/schema-theory', type: 'reference', label: 'EBSCO Research Starters (Psychology) — Schema Theory' },
      { url: 'https://www.ijcai.org/Proceedings/75/Papers/021.pdf', type: 'academic', label: 'Schank & Abelson — Scripts, Plans, and Knowledge (IJCAI proceedings)' },
    ],
  },
  {
    id: 'bizlaw-tob',
    discipline: 'business-law',
    title: '公開買付け（TOB）',
    statement:
      '公開買付け（TOB、Take-Over Bid／テンダー・オファー）とは、上場会社等の株券等を、取引所市場外で、買付け期間・価格・株数などの条件を広く公告して、多数の株主から買い集める制度である（金融商品取引法27条の2以下）。主に経営権の取得（M&A）や子会社化、上場廃止（非公開化）を目的に用いられる。' +
      '市場外で多数の者から株式を取得し、会社支配に影響を及ぼしうる場合に、すべての株主に売却機会と情報を平等に与え、透明・公正な手続を確保することを目的とする。一定割合（現行では原則として議決権の3分の1）を超える株式を市場外で取得する場合などは、原則として公開買付けによることが義務づけられる（強制公開買付け）。買付者は公開買付届出書を提出し、買付価格・期間・目的等を開示する。対象会社の取締役会は、賛同・反対などの意見表明報告書を提出する。' +
      '買付期間中に他の買付者が現れる（対抗TOB）こともある。投資家保護と市場の公正性のための開示・手続規制であり、金融庁が所管する。',
    keyFigures: '市場外で多数の株主から条件を公告して株式を買い集める制度(金商法27条の2以下)／M&A・子会社化・非公開化に利用／全株主への平等な売却機会と情報開示・公正な手続の確保／一定割合(原則議決権3分の1)超の市場外取得は強制公開買付け／公開買付届出書・対象会社の意見表明報告書／金融庁所管',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/323AC0000000025', type: 'government', label: 'e-Gov法令検索「金融商品取引法」（27条の2以下 公開買付けに関する規定）' },
      { url: 'https://www.fsa.go.jp/singi/singi_kinyu/tob_wg/shiryou/20230731/01.pdf', type: 'government', label: '金融庁 公開買付制度・大量保有報告制度WG事務局説明資料（公開買付制度の概要・3分の1ルール）' },
      { url: 'https://lfb.mof.go.jp/kantou/disclo/pagekthp00400042.html', type: 'government', label: '財務省関東財務局「株券等の公開買付け」（公開買付届出書・意見表明報告書等の開示）' },
    ],
  },
  {
    id: 'infosoc-communicative-action',
    discipline: 'information-sociology',
    title: 'コミュニケーション的行為（ハーバーマス）',
    statement:
      'ドイツの社会哲学者ユルゲン・ハーバーマスが『コミュニケーション的行為の理論』（Theorie des kommunikativen Handelns, 1981）で展開した概念。彼は人間の社会的行為を、自分の目的達成のために他者や事物を手段として操作する「目的合理的行為（戦略的行為＝成功志向）」と、対話を通じて相互の理解と合意の形成を目指す「コミュニケーション的行為（了解志向）」に区別した。' +
      'コミュニケーション的行為では、話し手は真理性・正当性・誠実性といった批判可能な「妥当性請求」を掲げ、聞き手はそれを吟味・受容・拒否でき、強制や権力でなく「より良い論拠の力」によって合意に至る（理想的発話状況）。ハーバーマスは、本来このような了解志向の相互行為が営まれる「生活世界」が、貨幣と権力に駆動される経済・行政システムに侵食される「生活世界の植民地化」を近代の病理と診断した。' +
      'この理論は熟議民主主義（討議倫理）や公共圏論の理論的基盤をなす。',
    keyFigures: 'J.ハーバーマス『コミュニケーション的行為の理論』(1981)／戦略的行為(成功志向・手段化)と区別したコミュニケーション的行為(了解志向)／妥当性請求(真理性・正当性・誠実性)とより良い論拠の力による合意(理想的発話状況)／生活世界のシステムによる植民地化／熟議民主主義・討議倫理の基盤',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/habermas/', type: 'academic', label: 'Jürgen Habermas — Stanford Encyclopedia of Philosophy（妥当性請求・生活世界・コミュニケーション的合理性）' },
      { url: 'https://www.britannica.com/biography/Jurgen-Habermas/Philosophy-and-social-theory', type: 'reference', label: 'Jürgen Habermas: Philosophy and social theory — Encyclopaedia Britannica' },
      { url: 'https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0065111', type: 'academic', label: 'Communicative versus Strategic Rationality: Habermas\' Theory of Communicative Action and the Social Brain — PLOS ONE（査読論文）' },
      { url: 'https://www.cambridge.org/core/books/cambridge-habermas-lexicon/colonization-of-the-lifeworld/36E8421628B4E1914F7E675B31977ADC', type: 'academic', label: 'Colonization of the Lifeworld — The Cambridge Habermas Lexicon (Cambridge University Press)' },
    ],
  },
  {
    id: 'econ-ostrom-commons',
    discipline: 'economics',
    title: 'オストロムのコモンズ統治',
    statement:
      '漁場・牧草地・灌漑用水・森林などの共有資源（コモンプール資源）が、必ずしも「コモンズの悲劇」のように乱獲・枯渇に陥るとは限らず、利用者たちが自ら作るルールと組織によって持続的に管理できることを示した理論。政治学者エリノア・オストロムが著書『コモンズのガバナンス（Governing the Commons）』（1990）で、世界各地の長期持続した共有資源管理の事例を実証的に分析して示した。' +
      '彼女は、国家による規制でも私有化でもない「当事者による自主統治（self-governance）」が機能するための条件を「設計原理（design principles）」として整理した（明確な境界、地域の条件に合った利用・供出ルール、ルール作りへの当事者の参加、監視、段階的な制裁、低コストの紛争解決、自治の承認、入れ子状の組織など）。' +
      'これは、コモンズには国有化か私有化しかないという二分法を覆すものとして大きな影響を与え、オストロムは2009年に女性として初めてノーベル経済学賞を受賞した。',
    keyFigures: '共有資源は利用者の自主的なルール・組織で持続管理しうる／E.オストロム『コモンズのガバナンス』1990の実証／自主統治が機能する「設計原理」(明確な境界・参加・監視・段階的制裁・紛争解決・自治の承認・入れ子状組織等)／国有化/私有化の二分法を覆す／オストロム2009ノーベル賞(女性初)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2009/press-release/', type: 'reference', label: 'NobelPrize.org — The Prize in Economic Sciences 2009 (Press release)' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2009/ostrom/facts/', type: 'reference', label: 'NobelPrize.org — Elinor Ostrom Facts' },
      { url: 'https://www.britannica.com/money/Elinor-Ostrom', type: 'reference', label: 'Encyclopaedia Britannica — Elinor Ostrom（設計原理・コモンズ理論）' },
    ],
  },
  {
    id: 'econ-general-equilibrium',
    discipline: 'economics',
    title: '一般均衡理論',
    statement:
      '経済全体の多数の市場（財・サービス・生産要素）が相互に依存しながら、すべての市場で需要と供給が同時に一致する価格体系（均衡）が存在しうることを分析する経済理論。個別の市場だけを切り出して見る部分均衡に対し、ある市場の価格変化が他の市場へ波及する相互連関を明示的に扱う点に特徴がある。' +
      'フランスの経済学者レオン・ワルラスが19世紀後半（『純粋経済学要論』1874–77年）に、すべての市場の需給を表す連立方程式の体系として定式化し（ワルラス均衡）、創始した。20世紀半ばにケネス・アローとジェラール・ドブリュー（および同時期のマッケンジー）が、競争市場で一般均衡が存在することを、不動点定理などの数学を用いて厳密に証明した（アロー＝ドブリュー・モデル）。また、完全競争の均衡はパレート効率的であるという「厚生経済学の基本定理」も示された。' +
      '市場メカニズムの整合性を示す理論的基礎だが、強い前提に依存し、均衡の安定性や一意性は一般には保証されない。',
    keyFigures: '多数市場の相互依存下で全市場が同時に需給一致する価格体系(均衡)を分析／部分均衡と対比／L.ワルラスが19世紀後半(『純粋経済学要論』1874–77)に連立方程式体系として創始／アロー＝ドブリュー(およびマッケンジー)が均衡の存在を厳密に証明／厚生経済学の基本定理(競争均衡はパレート効率的)／強い前提・安定性は保証されない',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/general-equilibrium-theory', type: 'reference', label: 'Encyclopaedia Britannica「General equilibrium theory」' },
      { url: 'https://www.britannica.com/money/Leon-Walras', type: 'reference', label: 'Encyclopaedia Britannica「Léon Walras」（『純粋経済学要論』1874–77, 連立方程式による一般均衡）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1983/press-release/', type: 'reference', label: 'NobelPrize.org 1983年経済学賞プレスリリース（ドブリュー「一般均衡理論の厳密な再定式化」）' },
      { url: 'https://www.econlib.org/library/Enc/bios/Walras.html', type: 'reference', label: 'Econlib「Léon Walras」（連立方程式・タトヌマン・パレート最適性）' },
    ],
  },
  {
    id: 'mgmt-scenario-planning',
    discipline: 'management',
    title: 'シナリオ・プランニング',
    statement:
      '将来を単一の予測で当てようとするのではなく、起こりうる複数の異なる未来の姿（シナリオ）を構築し、それぞれに備えることで、不確実性の高い環境下での戦略的意思決定とレジリエンスを高める手法。多くは、影響が大きく不確実性も高い2つの鍵要因（ドライバー）を軸にとり、その組み合わせから3〜4本の対照的なシナリオを描く。' +
      '第二次大戦後にランド研究所のハーマン・カーンが軍事・政策分野で発展させ、1970年代にロイヤル・ダッチ・シェルのピエール・ワックらが企業戦略に応用したことで有名になった。シェルは石油危機（1973）を想定したシナリオを用意していたため、危機に他社より迅速に対応できたとされる。' +
      'シナリオは確率の予測ではなく、固定観念を揺さぶり「もしこうなったら」を組織で議論・準備するための物語であり、早期警戒シグナルの監視や戦略の頑健性検証に使われる。',
    keyFigures: '複数の起こりうる未来(シナリオ)を構築し備える／不確実性下の意思決定とレジリエンス／重要かつ不確実な2軸から3〜4本の対照的シナリオ／ランド研究所のH.カーンが発展・シェルのP.ワックが企業戦略に応用／石油危機への迅速対応の逸話／予測でなく固定観念を揺さぶる物語',
    asOf: '2026-06',
    sources: [
      { url: 'https://glisa.umich.edu/engagement/scenario-planning/', type: 'academic', label: 'University of Michigan (GLISA) — Scenario Planning（定義・複数の未来・頑健性）' },
      { url: 'https://hbr.org/1985/09/scenarios-uncharted-waters-ahead', type: 'academic', label: 'Pierre Wack, "Scenarios: Uncharted Waters Ahead," Harvard Business Review (1985) — 一次資料' },
      { url: 'https://en.wikipedia.org/wiki/Pierre_Wack', type: 'reference', label: 'Wikipedia — Pierre Wack（H.カーン／RAND起源、シェル応用、1985年HBR論文）' },
      { url: 'https://scienceimpact.mit.edu/node/1243', type: 'academic', label: 'MIT Science Impact Collaborative — Scenario Planning（単一予測でなく複数の妥当な未来）' },
    ],
  },
  {
    id: 'human-serial-position',
    discipline: 'human-science',
    title: '系列位置効果（初頭効果・新近効果）',
    statement:
      '一連の項目（単語リスト等）を記憶して自由再生するとき、リストの最初の方と最後の方の項目がよく覚えられ、中間の項目は再生率が低くなる（再生率を系列位置で描くとU字型になる）現象。最初の項目の再生が良いことを「初頭効果（primacy effect）」、最後の項目の再生が良いことを「新近効果（recency effect）」という。' +
      'ヘルマン・エビングハウス（1885）が先駆的に観察し、後にマードック（Murdock, 1962）らが実験的に体系化した。多重貯蔵モデル（アトキンソン＆シフリン, 1968）では、初頭効果は最初の項目がリハーサルされて長期記憶に転送されたため、新近効果は最後の項目がまだ短期記憶に保持されているために生じると説明される。' +
      '実際、再生までに遅延・妨害課題を入れると新近効果は消えるが初頭効果は残り、提示速度を上げると初頭効果が弱まる（リハーサルできないため）など（グランツァー＆カニッツ, 1966）、両効果が異なる記憶過程に基づくことを示す証拠とされる。広告・面接・プレゼンの順序効果などにも応用される。',
    keyFigures: 'リストの最初(初頭効果)と最後(新近効果)がよく再生されU字型／エビングハウス1885が先駆・マードック1962が体系化／多重貯蔵モデル(Atkinson&Shiffrin 1968)：初頭効果=長期記憶への転送、新近効果=短期記憶に残存／遅延で新近効果消失・初頭効果残存(Glanzer&Cunitz 1966)／順序効果として応用',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.simplypsychology.org/primacy-recency.html', type: 'reference', label: 'SimplyPsychology — Serial Position Effect (Glanzer & Cunitz, 1966; Atkinson & Shiffrin model)' },
      { url: 'https://en.wikipedia.org/wiki/Serial-position_effect', type: 'reference', label: 'Wikipedia — Serial-position effect（Ebbinghaus 起源・Murdock 1962・多重貯蔵説）' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4633394/', type: 'academic', label: 'PMC（NIH）— Serial-Position Effects on a Free-Recall Task（U字型曲線・初頭/新近効果の実証）' },
    ],
  },
  {
    id: 'bizlaw-cg-code',
    discipline: 'business-law',
    title: 'コーポレートガバナンス・コード',
    statement:
      '上場会社が実効的なコーポレートガバナンス（企業統治）を実現するために守るべき原則・指針を示した規範。金融庁と東京証券取引所が中心となって策定し、2015年に適用が開始された（その後2018年・2021年に改訂）。' +
      '会社法のような法律（ハードロー）ではなく、証券取引所の規則（有価証券上場規程）に基づくソフトローであり、各原則を一律に強制するのではなく「コンプライ・オア・エクスプレイン（原則を実施するか、実施しない場合はその理由を説明する）」の手法を採る。株主の権利・平等、株主以外のステークホルダーとの協働、適切な情報開示と透明性、取締役会等の責務（独立社外取締役の活用等）、株主との対話、という5つの基本原則からなる。' +
      '機関投資家側の行動規範である「スチュワードシップ・コード」と車の両輪をなし、企業価値の向上と持続的成長、投資家との建設的対話の促進を目的とする。',
    keyFigures: '上場会社の企業統治の原則・指針／金融庁と東証が策定・2015年適用開始(2018/2021改訂)／法律でなくソフトロー(有価証券上場規程)、コンプライ・オア・エクスプレイン／5つの基本原則：株主権利平等・ステークホルダー協働・情報開示透明性・取締役会の責務(独立社外取締役)・株主との対話／スチュワードシップ・コードと車の両輪',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jpx.co.jp/equities/listing/cg/index.html', type: 'government', label: '日本取引所グループ(JPX/東証)「コーポレート・ガバナンス・コード」' },
      { url: 'https://www.jpx.co.jp/english/news/1020/20210611-01.html', type: 'government', label: 'JPX「Publication of Revised Japan\'s Corporate Governance Code」(2021年改訂公表)' },
      { url: 'https://www.fsa.go.jp/policy/corporategovernencereform/20240115.html', type: 'government', label: '金融庁「コーポレートガバナンス改革に向けた取組みについて」' },
    ],
  },
  {
    id: 'infosoc-post-industrial',
    discipline: 'information-sociology',
    title: '脱工業社会論（ダニエル・ベル）',
    statement:
      '先進社会が、モノの生産（製造業）を中心とする工業社会から、サービス・情報・知識を中心とする社会へと移行するとした社会変動の理論。アメリカの社会学者ダニエル・ベルが著書『脱工業社会の到来（The Coming of Post-Industrial Society）』（1973）で体系化した。' +
      'ベルは脱工業社会の特徴として、(1)経済の重心が財の生産からサービス経済へ移ること、(2)専門職・技術職（ホワイトカラー）が職業構成の中心になること、(3)理論的知識（theoretical knowledge）が技術革新と政策決定の中軸的資源（axial principle）になること、(4)将来の技術を計画・制御しようとすること、(5)新しい知的技術（intellectual technology＝情報技術）の登場、を挙げた。' +
      'とりわけ「理論的知識」を社会の戦略的資源とみなした点が特徴で、後の情報社会論・知識社会論の古典的枠組みとなった。同時期のアルビン・トフラー『第三の波』（1980）や梅棹忠夫『情報産業論』（1963）ら日本の情報社会論とも響き合う。',
    keyFigures: '工業社会から、サービス・情報・知識中心の社会へ移行／D.ベル『脱工業社会の到来』1973／特徴：サービス経済化・専門技術職の中心化・理論的知識が中軸資源(axial principle)・技術の計画/制御・知的技術／後の情報社会論・知識社会論の古典',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/The-Coming-of-Post-Industrial-Society-A-Venture-in-Social-Forecasting', type: 'reference', label: 'Encyclopædia Britannica — The Coming of Post-Industrial Society (work by Bell)' },
      { url: 'https://www.britannica.com/money/postindustrial-society', type: 'reference', label: 'Encyclopædia Britannica — Postindustrial society（特徴・職業構成・知識中心）' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100339541', type: 'reference', label: 'Oxford Reference — Post-industrial society' },
      { url: 'https://iss.ndl.go.jp/books/R000000004-I728841-00', type: 'government', label: '国立国会図書館サーチ — 梅棹忠夫『情報産業論』(1963)' },
    ],
  },
  {
    id: 'econ-lucas-critique',
    discipline: 'economics',
    title: 'ルーカス批判',
    statement:
      '過去のデータから推定した経済の関係（マクロ計量モデルのパラメータ）は、政策が変われば人々の期待や行動も変わるため、政策変更後には不変ではなくなる。したがって、過去のデータに基づくマクロ計量モデルで政策の効果を予測・評価することは信頼できない、とする批判。ロバート・ルーカスが1976年の論文「Econometric Policy Evaluation: A Critique」で提示した。' +
      '合理的期待を前提とすると、人々はルールやインセンティブの変化を見越して行動を最適化し直すため、政策当局が過去の相関（例：フィリップス曲線の失業とインフレのトレードオフ）をそのまま利用しようとしても、その相関自体が崩れてしまう。' +
      'この批判は、政策に対して頑健な「深い（構造的）パラメータ」（選好・技術など）に基づくミクロ的基礎づけをもつモデルの構築を促し、合理的期待革命や動学的確率的一般均衡（DSGE）モデルの発展を後押しした。ルーカスは合理的期待理論への貢献で1995年ノーベル経済学賞を受賞した。',
    keyFigures: '過去データ推定の関係は政策変更で不変でなくなり政策評価に使えない／R.ルーカス1976「Econometric Policy Evaluation」／合理的期待下で人々が政策変化を見越し行動を最適化(フィリップス曲線の相関が崩れる)／ミクロ的基礎・深いパラメータに基づくモデルを促す(DSGEへ)／ルーカス1995ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Lucas-critique', type: 'reference', label: 'Encyclopædia Britannica — "Lucas critique"' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1995/summary/', type: 'reference', label: 'NobelPrize.org — Economic Sciences 1995 (Robert E. Lucas Jr.)' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/lucas-critique', type: 'reference', label: 'Encyclopedia.com — "Lucas Critique"' },
      { url: 'https://www.nber.org/news/robert-e-lucas-jr-won-1995-nobel-prize-rational-expectations-theory', type: 'academic', label: 'NBER — Lucas 1995 Nobel for rational expectations' },
    ],
  },
  {
    id: 'econ-time-inconsistency',
    discipline: 'economics',
    title: '動学的不整合（時間的非整合性）',
    statement:
      'ある時点で最適だと宣言した将来の政策が、その将来の時点になると最適でなくなり、政策当局が約束を破る誘因をもつ、という問題。フィン・キドランドとエドワード・プレスコットが1977年の論文「Rules Rather than Discretion（裁量よりルールを）」で示した。' +
      '代表例が金融政策のインフレ・バイアスである：中央銀行が「物価を安定させる」と約束し、人々がそれを信じて低いインフレ期待を形成すると、当局は事後的に金融緩和で失業を一時的に減らす誘因をもつ。しかし合理的な人々はこの誘因を見越すため約束は信用されず、結果として失業は下がらないのに高いインフレだけが定着する（裁量的政策の罠）。' +
      'この問題への対処として、当局が裁量でなく事前にコミットした「ルール」に従うこと、中央銀行の独立性、インフレ目標、評判の確立などが有効とされる。キドランドとプレスコットは2004年にノーベル経済学賞を受賞した。',
    keyFigures: '事前に最適な政策が事後には最適でなくなり約束破りの誘因／キドランド&プレスコット1977「Rules Rather than Discretion」(JPE)／金融政策のインフレ・バイアス(裁量だと高インフレが定着)／対処：ルール・コミットメント・中央銀行の独立性・インフレ目標・評判／2004ノーベル賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2004/popular-information/', type: 'reference', label: 'NobelPrize.org — 2004年経済学賞 一般向け解説（時間整合性とインフレ）' },
      { url: 'https://www.frbsf.org/research-and-insights/publications/economic-letter/2003/04/time-inconsistent-monetary-policies-recent-research/', type: 'government', label: 'サンフランシスコ連銀 Economic Letter — Time-Inconsistent Monetary Policies' },
      { url: 'https://www.britannica.com/money/Finn-E-Kydland', type: 'reference', label: 'Encyclopaedia Britannica — Finn E. Kydland（1977年論文と動学的不整合の定義）' },
      { url: 'https://www.journals.uchicago.edu/doi/abs/10.1086/260580', type: 'academic', label: 'Journal of Political Economy (1977) — Rules Rather than Discretion（一次文献）' },
    ],
  },
  {
    id: 'mgmt-bpr',
    discipline: 'management',
    title: 'ビジネスプロセス・リエンジニアリング（BPR）',
    statement:
      '既存の業務手順を前提とした部分的な改善ではなく、コスト・品質・サービス・スピードといった重要な業績指標を劇的に向上させるために、業務プロセスを根本から（ゼロベースで）考え直し、抜本的に再設計する経営手法。マイケル・ハマーとジェイムズ・チャンピーが著書『リエンジニアリング革命（Reengineering the Corporation）』（1993）で体系化し、BPRを「根本的（fundamental）・抜本的（radical）・劇的（dramatic）・プロセス（process）」という4つのキーワードで定義した。' +
      '部門ごとに分断された仕事を、顧客価値を生むプロセス単位で再編し、情報技術（IT）を単なる「自動化」ではなく仕事のやり方そのものを変える手段として活用する点を重視する（ハマー「Don\'t Automate, Obliterate」1990）。トヨタ生産方式の継続的・漸進的なカイゼンとは対照的に、不連続な変革を志向する。' +
      '1990年代に世界的ブームとなったが、人員削減（リストラ）の口実とされたり、失敗例も多く出たことで批判も受けた。',
    keyFigures: '業務プロセスをゼロベースで抜本的に再設計し重要指標を劇的に向上／M.ハマー&J.チャンピー『リエンジニアリング革命』1993／定義4語：根本的・抜本的・劇的・プロセス／ITで仕事のやり方を変える(Don\'t Automate, Obliterate)／漸進的なカイゼンと対照的な不連続変革／リストラの口実・失敗例の批判',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/1990/07/reengineering-work-dont-automate-obliterate', type: 'academic', label: 'Michael Hammer, "Reengineering Work: Don\'t Automate, Obliterate," Harvard Business Review (1990)（原典的論文）' },
      { url: 'https://content.time.com/time/specials/packages/article/0,28804,2086680_2086683_2087684,00.html', type: 'reference', label: 'TIME「The 25 Most Influential Business Management Books」— Reengineering the Corporation (1993)' },
      { url: 'https://www.ibm.com/think/topics/business-process-reengineering', type: 'reference', label: 'IBM「What is business process reengineering?」— BPRの定義とITの有効化役割' },
    ],
  },
  {
    id: 'human-big-five',
    discipline: 'human-science',
    title: 'ビッグファイブ（5因子性格モデル）',
    statement:
      '人間のパーソナリティ（性格）を、互いにおおむね独立した5つの基本的な次元で記述できるとする、現代のパーソナリティ心理学で最も広く受け入れられているモデル。5因子は頭字語OCEANで覚えられる：(1)経験への開放性（Openness＝好奇心・想像力・新奇性への志向）、(2)誠実性（Conscientiousness＝勤勉・計画性・自己統制）、(3)外向性（Extraversion＝社交性・活動性・刺激希求）、(4)協調性（Agreeableness＝思いやり・協力・信頼）、(5)神経症傾向（Neuroticism＝不安・情緒不安定さ。逆は情緒安定性）。' +
      'これは特定の理論から演繹されたのではなく、人が性格を表すのに使う膨大な語彙（語彙仮説）や性格検査の項目を因子分析した結果、繰り返し抽出された経験的な5次元である（コスタ&マックレーらが体系化）。' +
      '文化を超えて頑健に見いだされ、職務成績・学業・健康・人間関係などの予測に用いられる一方、なぜ5つなのかの理論的説明や記述にとどまる点への批判もある。',
    keyFigures: '性格を5つの独立した次元で記述／OCEAN：開放性・誠実性・外向性・協調性・神経症傾向／語彙仮説と因子分析から経験的に抽出(理論からの演繹でない)／コスタ&マックレーが体系化／文化横断的に頑健・職務/学業/健康を予測／記述的との批判',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/five-factor-model-of-personality', type: 'reference', label: 'Encyclopædia Britannica — Five-factor model of personality（5因子の定義）' },
      { url: 'https://www.simplypsychology.org/big-five-personality.html', type: 'reference', label: 'Simply Psychology — Big Five Personality Traits（OCEAN・語彙仮説・コスタ&マックレー）' },
      { url: 'https://psycnet.apa.org/record/2003-06478-000', type: 'academic', label: 'APA PsycNet — The Five-Factor model of personality across cultures（文化横断的頑健性）' },
      { url: 'https://psycnet.apa.org/record/2000-16508-004', type: 'academic', label: 'APA PsycNet — Personality and job performance: The Big Five revisited（職務成績の予測）' },
    ],
  },
  {
    id: 'bizlaw-large-shareholding',
    discipline: 'business-law',
    title: '大量保有報告制度（5%ルール）',
    statement:
      '上場会社等の株券等を発行済株式総数の5%を超えて保有することになった者（大量保有者）に、その保有状況を記載した「大量保有報告書」を内閣総理大臣（金融庁）に提出することを義務づける、金融商品取引法上の制度（金商法27条の23以下）。「5%ルール」とも呼ばれる。' +
      '市場や他の投資家・発行会社に対し、誰がどれだけの株式を保有しているかという、支配権の異動につながりうる情報を速やかに開示させ、市場の透明性・公正性と投資家保護を図ることを目的とする。原則として、5%超の保有者となった日から5営業日以内に提出し、その後、保有割合が1%以上増減するなど重要な変更があった場合には変更報告書を提出する。提出書類はEDINETで電子的に公衆縦覧される。' +
      'なお、機関投資家等が短期売買目的等で大量保有する場合には、基準日ベースで報告できるなど報告頻度を緩和する特例報告制度がある。M&A・買収局面で買い集めの動きを把握する手がかりにもなる。',
    keyFigures: '発行済株式の5%超を保有する者に大量保有報告書の提出を義務づけ(金商法27条の23以下、5%ルール)／支配権異動につながる情報の速やかな開示で市場の透明性・投資家保護／5%超になった日から5営業日以内、1%以上の増減等で変更報告書／EDINETで公衆縦覧／機関投資家の特例報告／M&Aの買い集め把握',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/323AC0000000025', type: 'government', label: 'e-Gov法令検索「金融商品取引法」（27条の23以下 大量保有報告書）' },
      { url: 'https://lfb.mof.go.jp/kantou/disclo/tairyou/mokuji.htm', type: 'government', label: '財務省関東財務局「株券等の大量保有の状況等に関する開示制度（5％ルール）の概要について」' },
      { url: 'https://www.fsa.go.jp/common/shinsei/tairyohoyu/index.html', type: 'government', label: '金融庁「大量保有報告書等の提出について」' },
    ],
  },
  {
    id: 'infosoc-gig-economy',
    discipline: 'information-sociology',
    title: 'ギグ・エコノミー',
    statement:
      'デジタル・プラットフォーム（アプリ）を介して、単発・短期の仕事（ギグ）を不特定の働き手にその都度割り当てる労働・経済の形態。ライドシェア（Uber等）、料理配達、家事代行、クラウドソーシング（オンラインの請負・タスク）などが代表例で、「ギグ」はもともとミュージシャンの単発の演奏の意。スマートフォンとプラットフォームのマッチング・評価機能が、需要と供給を即時に結びつけることで成立した。' +
      '働き手は時間や場所を柔軟に選べる利点がある一方、多くは「従業員」ではなく「個人事業主（独立請負人）」として扱われるため、最低賃金・社会保険・有給休暇・団体交渉などの労働法上の保護が及びにくく、アルゴリズムによる管理（評価・配車・アカウント停止）に従属する不安定さが問題視される。' +
      '各国で就労者の労働者性をめぐる訴訟や、保護を強化する法整備（EUのプラットフォーム労働指令等）が進められている。',
    keyFigures: 'プラットフォームを介し単発・短期の仕事(ギグ)を割り当てる労働形態／Uber等のライドシェア・配達・クラウドソーシングが例／柔軟性の利点／多くが個人事業主扱いで労働法の保護が及びにくい・アルゴリズム管理への従属／労働者性をめぐる訴訟・各国の法整備(EUプラットフォーム労働指令等)',
    asOf: '2026-06',
    sources: [
      { url: 'https://webapps.ilo.org/static/english/intserv/working-papers/wp100/index.html', type: 'government', label: 'ILO（国際労働機関）— The platform economy（定義・分類）' },
      { url: 'https://eur-lex.europa.eu/eli/dir/2024/2831/oj/eng', type: 'government', label: 'EUR-Lex — Directive (EU) 2024/2831（EUプラットフォーム労働指令：雇用関係の法的推定・アルゴリズム管理の透明性）' },
      { url: 'https://www.britannica.com/money/gig-economy-side-hustle', type: 'reference', label: 'Encyclopaedia Britannica — The Gig Economy（定義・「ギグ」の由来・柔軟性）' },
      { url: 'https://guides.loc.gov/gig-economy/overview', type: 'government', label: 'Library of Congress — Gig Economy Research Guide: Overview' },
    ],
  },
  {
    id: 'econ-veblen-good',
    discipline: 'economics',
    title: 'ヴェブレン財と顕示的消費',
    statement:
      '価格が高いほど、その高価さ自体が地位や富の象徴（ステータス）となって需要がかえって増える特殊な財をヴェブレン財という。高級ブランド品・宝飾品・高級車などが例で、値下げするとかえって魅力（見せびらかしの価値）が下がり需要が減ることもある。アメリカの経済学者・社会学者ソースティン・ヴェブレンが著書『有閑階級の理論（The Theory of the Leisure Class）』(1899)で、' +
      '富裕層が自らの地位・財力を他者に誇示するために高価な財やサービスを浪費的に消費する「顕示的消費（conspicuous consumption）」を分析したことに由来する。需要法則（価格が上がると需要が減る）に反する点はギッフェン財と同じだが、ギッフェン財が貧しい家計の必需品で所得効果によるのに対し、ヴェブレン財は奢侈品で他者への顕示（見せびらかし）という社会的動機による点で異なる。バンドワゴン効果・スノッブ効果と並ぶ社会的消費の例。',
    keyFigures: '価格が高いほど地位の象徴となり需要が増える奢侈財／T.ヴェブレン『有閑階級の理論』1899の「顕示的消費（conspicuous consumption）」に由来／需要法則に反するがギッフェン財（必需品・所得効果）とは理由が異なり、他者への顕示という社会的動機による／バンドワゴン効果・スノッブ効果と並ぶ社会的消費の例（「ヴェブレン財/効果」の語はH.ライベンシュタイン1950年論文に由来）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/conspicuous-consumption', type: 'reference', label: 'Britannica Money — Conspicuous consumption（ヴェブレンが1899年『有閑階級の理論』で命名した経緯の解説）' },
      { url: 'https://en.wikipedia.org/wiki/Veblen_good', type: 'reference', label: 'Wikipedia — Veblen good（価格上昇で需要増・ステータス象徴としての定義）' },
      { url: 'https://theconversation.com/what-are-veblen-and-giffen-goods-241799', type: 'media', label: 'The Conversation（大学研究者寄稿）— ヴェブレン財とギッフェン財の相違（奢侈品/社会的動機 対 必需品/所得効果）' },
      { url: 'https://academic.oup.com/qje/article-abstract/64/2/183/1931945', type: 'academic', label: 'Leibenstein (1950) “Bandwagon, Snob, and Veblen Effects”, QJE 64(2), Oxford Academic（用語の原典）' },
    ],
  },
  {
    id: 'econ-free-rider',
    discipline: 'economics',
    title: 'フリーライダー問題',
    statement:
      '対価を負担しなくても便益を享受できる財（とくに公共財）について、人々が自分はコストを負担せず他人の負担にただ乗り（フリーライド）しようとするため、社会的に望ましい量の供給や協力が実現しにくくなる問題。公共財は、誰かが消費しても他者の消費を妨げない（非競合性）、対価を払わない者を排除できない（非排除性）という性質をもつため、各人は「自分が払わなくても誰かが供給してくれる」と考え、進んで費用を負担しなくなる。' +
      'その結果、国防・灯台・公共放送・きれいな環境・共同事業への寄付などが過少にしか供給されず（市場の失敗）、政府による税での強制的な供給や、集合行為（オルソン『集合行為論』が分析）の困難さの根拠となる。共有資源の乱獲（コモンズの悲劇は競合的な共有資源の過剰利用であり別概念）や、ワクチン接種・公共インフラの維持・気候変動対策など、協力が必要なあらゆる場面で生じる。',
    keyFigures: '対価を払わず便益にただ乗り → 公共財が過少供給される／公共財の非競合性・非排除性が原因／市場の失敗の典型で、政府供給や強制（課税）の根拠／M.オルソン『集合行為論（The Logic of Collective Action, 1965）』が集団での協力困難を分析（集団が大きいほど深刻）／コモンズの悲劇・寄付・環境対策等で生じる（コモンズの悲劇は過剰利用で別概念）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/free-riding', type: 'reference', label: 'Encyclopædia Britannica — “Free riding”（集合財の便益にコストを負担せず与ること、Olson 1965に由来）' },
      { url: 'https://www.econlib.org/library/Enc/PublicGoods.html', type: 'reference', label: 'The Concise Encyclopedia of Economics (Econlib) — “Public Goods”（非競合性・非排除性、フリーライドによる過少供給）' },
      { url: 'https://en.wikipedia.org/wiki/The_Logic_of_Collective_Action', type: 'reference', label: 'Wikipedia — The Logic of Collective Action（Mancur Olson 1965、群が大きいほど深刻）' },
    ],
  },
  {
    id: 'mgmt-product-architecture',
    discipline: 'management',
    title: '製品アーキテクチャ（モジュラー/インテグラル）',
    statement:
      '製品の機能を、それを実現する部品（構成要素）へどのように割り当て、部品間の接続（インターフェース）をどう設計するか、という製品の基本的な設計思想。カール・ウルリッヒが1995年の論文(Research Policy)で、(1)機能要素の配置、(2)機能要素から物理的部品への対応づけ、(3)相互作用する部品間のインターフェースの規定、として概念化した。大きく2類型に分けられる。' +
      '(1)モジュラー型（modular）＝機能と部品が一対一に近く対応し、インターフェースが標準化・単純化されているため、部品を組み合わせ（寄せ集め）て製品ができる。パソコンが典型で、部品の独立開発・交換・多様な組み合わせが容易。(2)インテグラル型（integral）＝複数の機能が複数の部品にまたがって作り込まれ、部品間を相互に微調整（すり合わせ）しないと全体性能が出ない。自動車が典型で、緊密な調整による最適化が強み。' +
      '日本の藤本隆宏らはこの概念を用い、すり合わせ（インテグラル）型のものづくりに強い日本企業と、モジュラー化が進む産業での競争力の違いを論じた。製品開発・部品調達・産業構造・国際分業を分析する枠組みとなっている。',
    keyFigures: '機能の部品への割り当てとインターフェース設計＝製品の設計思想／K.ウルリッヒ1995(Research Policy 24:419-440)が概念化（機能要素の配置／機能→部品の対応づけ／部品間インターフェースの規定）／モジュラー型：一対一対応・標準インターフェース・寄せ集め（PCが典型）／インテグラル型：機能が部品横断・すり合わせによる最適化（自動車が典型）／藤本隆宏らが日本のものづくり論に応用',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/0048733394007753', type: 'academic', label: 'Ulrich, K.T. (1995) “The role of product architecture in the manufacturing firm”, Research Policy 24(3):419-440 (ScienceDirect/Elsevier)' },
      { url: 'https://link.springer.com/rwe/10.1007/978-3-642-20617-7_6463', type: 'reference', label: 'Product Architecture — Springer Nature reference work entry' },
      { url: 'https://econpapers.repec.org/RePEc:eee:respol:v:24:y:1995:i:3:p:419-440', type: 'academic', label: 'EconPapers/RePEc — Ulrich (1995) Research Policy 出典確認' },
    ],
  },
  {
    id: 'human-attachment',
    discipline: 'human-science',
    title: '愛着理論（ボウルビィ／エインズワース）',
    statement:
      '乳幼児が養育者（主に母親などの特定の人物）との間に形成する、情緒的な強い結びつき（愛着＝アタッチメント）に関する発達心理学の理論。イギリスの精神科医ジョン・ボウルビィが提唱した。彼は、子が不安や脅威を感じたとき養育者に近接して安全を求める行動（愛着行動）は生得的なもので、生存のために進化したと論じ、養育者が探索の拠点となる「安全基地（secure base）」として機能することを重視した。' +
      'アメリカ（カナダ系）の心理学者メアリー・エインズワースは「ストレンジ・シチュエーション法（見知らぬ状況法）」という実験観察によって、養育者との分離・再会場面での乳児の反応から愛着のパターンを、安定型（secure）・回避型（avoidant）・両価／抵抗型（ambivalent/resistant）に分類した（後にメイン／ソロモンが無秩序型disorganizedを追加）。乳幼児期の愛着の質が、後の対人関係や情緒的発達（内的作業モデル）に影響するとされ、保育・臨床・発達研究に大きな影響を与えた。',
    keyFigures: '乳幼児と養育者の情緒的結びつき（愛着）の理論／J.ボウルビィが提唱・愛着行動は生得的で安全基地として機能／M.エインズワースのストレンジ・シチュエーション法で愛着型（安定・回避・両価／抵抗）を分類（後に無秩序型追加）／内的作業モデルが後の対人関係に影響',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/attachment-theory', type: 'reference', label: 'Encyclopaedia Britannica — Attachment theory | Definition, Features, & Types' },
      { url: 'https://www.britannica.com/biography/Mary-Salter-Ainsworth', type: 'reference', label: 'Encyclopaedia Britannica — Mary Salter Ainsworth（ストレンジ・シチュエーション法の開発者）' },
      { url: 'https://www.simplypsychology.org/mary-ainsworth.html', type: 'reference', label: 'SimplyPsychology — Mary Ainsworth Strange Situation（安定/回避/両価・抵抗、Main & Solomon 1990の無秩序型）' },
      { url: 'https://www.simplypsychology.org/bowlby.html', type: 'reference', label: 'SimplyPsychology — John Bowlby’s Attachment Theory（生得的・進化的基盤、安全基地、内的作業モデル）' },
    ],
  },
  {
    id: 'bizlaw-corporate-reorganization',
    discipline: 'business-law',
    title: '組織再編（合併・会社分割等）',
    statement:
      '会社の組織や事業を法的手続によって再構成するための、会社法上の行為の総称。主な類型として、(1)合併（2つ以上の会社が1つになる。新設合併と吸収合併があり、消滅会社の権利義務は存続会社・新設会社に包括的に承継される）、(2)会社分割（会社の事業の全部または一部を、新設会社または既存の他社に承継させる。新設分割と吸収分割がある）、(3)株式交換・株式移転（ある会社を他社の完全子会社にする＝100%の親子関係を作る手法）がある。' +
      'これらは、事業の譲渡（個々の資産・契約を個別に移転する取引行為）と異なり、権利義務が包括的に移転する点に特色がある。組織再編は会社の基礎に重大な変更をもたらすため、原則として株主総会の特別決議（会社法309条2項）による承認が必要で、反対する株主には会社に公正な価格での買取りを求める「株式買取請求権」が、また会社の債権者には「債権者保護手続（債権者異議手続）」が認められる。M&Aや企業グループの再編に用いられる（公開買付け(TOB)とは別の、会社法上の組織法的な再編行為）。',
    keyFigures: '会社の組織・事業を再構成する会社法上の行為（会社法 第五編に規定）／類型：合併（吸収/新設）・会社分割（吸収/新設）・株式交換/株式移転（完全子会社化）／権利義務が包括的に承継される（個別移転の事業譲渡と異なる）／原則として株主総会の特別決議（会社法309条2項）が必要／反対株主の株式買取請求権・債権者保護手続（債権者異議手続）／M&A・企業グループ再編に利用される',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: '会社法（平成17年法律第86号）e-Gov法令検索 — 第五編に組織変更・合併・会社分割・株式交換・株式移転を規定' },
      { url: 'https://ja.wikibooks.org/wiki/会社法第309条', type: 'reference', label: '会社法第309条（株主総会の決議）Wikibooks — 組織再編は同条2項の特別決議事項' },
      { url: 'https://www.businesslawyers.jp/practices/371', type: 'media', label: 'BUSINESS LAWYERS「組織再編に伴う株主保護手続の概要」— 株式買取請求権・債権者保護手続' },
    ],
  },
  {
    id: 'infosoc-convergence-culture',
    discipline: 'information-sociology',
    title: 'コンバージェンス・カルチャー',
    statement:
      '複数のメディア・プラットフォームにまたがってコンテンツが流通し、メディア産業が協働し、オーディエンスが望むコンテンツを求めてメディア間を移動する、現代の文化的状況。メディア研究者ヘンリー・ジェンキンズが著書『コンバージェンス・カルチャー（Convergence Culture: Where Old and New Media Collide）』(2006)で論じた。ジェンキンズは「コンバージェンス（収斂）」を単なる技術的な機器の統合ではなく、文化的・社会的なプロセスとして捉え、収斂は「個々の消費者の頭の中で」起こると述べた。' +
      '重要な概念として、(1)複数のメディアで物語世界を分散展開する「トランスメディア・ストーリーテリング」、(2)受け手が黙って消費するのでなく、二次創作・拡散・考察などを通じて文化の生産に積極的に関与する「参加型文化（participatory culture）」、(3)個々人の知識が結集して集団的に問題解決する「集合知（collective intelligence、ピエール・レヴィに由来）」がある。ファンによるコンテンツの再創造やソーシャルメディア時代のメディア消費を分析する枠組みとなっている。',
    keyFigures: 'コンテンツが複数メディアを横断し産業が協働しオーディエンスが移動する文化状況／H.ジェンキンズ『Convergence Culture: Where Old and New Media Collide』2006(NYU Press)／収斂は技術的な機器統合でなく文化的プロセス（収斂は個々の消費者の頭の中で起こる）／トランスメディア・ストーリーテリング／参加型文化（producer/consumerの境界が流動化）／集合知（ピエール・レヴィに由来）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/communication-and-mass-media/convergence-culture', type: 'reference', label: 'EBSCO Research Starters — “Convergence culture” (Communication and Mass Media)' },
      { url: 'https://www.tandfonline.com/doi/full/10.1080/01614622.2021.1891766', type: 'academic', label: 'Taylor & Francis 査読論文 “Convergence Culture and Transmedia Storytelling in Contemporary Italy”' },
      { url: 'https://en.wikipedia.org/wiki/Convergence_culture', type: 'reference', label: 'Wikipedia — Convergence culture' },
      { url: 'http://henryjenkins.org/blog/2006/06/welcome_to_convergence_culture.html', type: 'media', label: 'Henry Jenkins 本人ブログ “Welcome to Convergence Culture” (2006, 著者一次資料)' },
    ],
  },
  {
    id: 'econ-liquidity-trap',
    discipline: 'economics',
    title: '流動性のわな',
    statement:
      '名目金利が下限（ゼロ近傍）まで低下した結果、中央銀行が貨幣供給を増やしても金利をそれ以上引き下げられず、金融緩和が総需要・実体経済を刺激できなくなる状況。ゼロ金利下では貨幣保有の機会費用がほぼゼロとなり、貨幣と債券がほぼ完全代替になるため、追加供給された貨幣は退蔵され利子率に作用しない（貨幣需要が利子に対しほぼ無限弾力的＝IS-LMではLM曲線が水平）。' +
      'ケインズが1936年に提唱し、ヒックスがIS-LMで定式化した。限界として、財政政策やインフレ期待への働きかけ（クルーグマンの「信頼できる形で無責任になると約束する」＝将来の高めのインフレを約束し実質金利を下げる策）が代替的処方とされ、純粋な金融数量政策の無効性をめぐっては学説上の論争がある。',
    keyFigures: 'ジョン・メイナード・ケインズ（提唱・初出『一般理論』1936, 第15章）／ジョン・ヒックス（IS-LMによる定式化, 1937）／ポール・クルーグマン（1998年「It’s Baaack」日本の停滞分析で復活）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.stlouisfed.org/publications/regional-economist/april-2014/the-liquidity-trap-an-alternative-explanation-for-todays-low-inflation', type: 'government', label: 'St. Louis Fed (米連邦準備銀行) — The Liquidity Trap' },
      { url: 'https://web.mit.edu/krugman/www/bpea_jp.pdf', type: 'academic', label: 'Krugman (1998) It’s Baaack, Brookings Papers on Economic Activity 29:137-206 (MIT hosted PDF)' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/liquidity-trap', type: 'reference', label: 'Encyclopedia.com — Liquidity Trap' },
      { url: 'https://en.wikipedia.org/wiki/Liquidity_trap', type: 'reference', label: 'Wikipedia — Liquidity trap (Keynes 1936 / Hicks IS-LM)' },
    ],
  },
  {
    id: 'econ-rent-seeking',
    discipline: 'economics',
    title: 'レントシーキング',
    statement:
      'レントシーキング（rent-seeking）とは、公共選択論における概念で、新たな富や価値を生み出すのではなく、既存の富（レント＝独占的・規制的に保護された超過利益）を自らに移転させることで利得を得ようとする活動を指す。典型例は、補助金・関税・輸入許可・参入規制・独占的地位といった政府が創出する便宜を獲得・防衛するために、企業や利益集団がロビイング・陳情・広報・贈賄等へ資源を投じる行為である。' +
      'これらの支出はそれ自体は何の財も生まないため社会的に非生産的であり、資源配分を歪めて死荷重（厚生損失）を拡大させる。独占の社会的費用は価格歪みだけでなく、独占権を巡る競争に費やされる資源まで含めて測るべきだ、という点が核心。腐敗・所得格差・競争低下を招く政府の失敗の一形態として論じられる。',
    keyFigures: 'ゴードン・タロック（Gordon Tullock, 1967「The Welfare Costs of Tariffs, Monopolies, and Theft」で現象を分析、ただし命名はせず）／アン・クルーガー（Anne O. Krueger, 1974「The Political Economy of the Rent-Seeking Society」で “rent-seeking” の語を命名・定着）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/rent-seeking', type: 'reference', label: 'Britannica Money — “Rent seeking | Definition & Facts”' },
      { url: 'https://www.econlib.org/library/Enc/RentSeeking.html', type: 'reference', label: 'The Concise Encyclopedia of Economics (Econlib / Liberty Fund) — “Rent Seeking”' },
      { url: 'https://link.springer.com/article/10.1007/s11127-019-00646-y', type: 'academic', label: 'Public Choice (Springer, 査読誌) — “Rent seeking at 52: an introduction to a special issue”' },
      { url: 'https://onlinelibrary.wiley.com/doi/10.1111/j.1465-7295.1967.tb01923.x', type: 'academic', label: 'Gordon Tullock (1967) “The Welfare Costs of Tariffs, Monopolies, and Theft”, Economic Inquiry / Western Economic Journal（原典）' },
    ],
  },
  {
    id: 'human-just-world',
    discipline: 'human-science',
    title: '公正世界仮説',
    statement:
      '公正世界仮説（公正世界信念）とは、人は「世界は基本的に公正であり、人は自分の行いにふさわしい結果を得る（善い行いには善い報い、悪い行いには悪い報いが返る）」と信じたがる傾向がある、とする社会心理学の概念である。社会心理学者メルヴィン・ラーナーが1960年代に提唱した。この信念は世界の秩序や予測可能性への欲求を満たす一方、不当に苦しむ被害者を目にすると認知的な不協和を生む。' +
      'それを解消するため、観察者は被害者を助けられない場合、しばしば「被害者にも落ち度があったはずだ」と被害者の人格や価値を貶め、苦しみを正当化しようとする。これが被害者非難（victim blaming）を生む心理的機序とされる。基本的帰属の錯誤や認知的不協和とは区別される独立した概念である。',
    keyFigures: 'メルヴィン・ラーナー（Melvin J. Lerner）が1960年代に提唱／初出実験：Lerner & Simmons (1966) “Observer’s reaction to the innocent victim”, Journal of Personality and Social Psychology／代表著作：Lerner (1980) The Belief in a Just World: A Fundamental Delusion',
    asOf: '2026-06',
    sources: [
      { url: 'https://pubmed.ncbi.nlm.nih.gov/5969146/', type: 'academic', label: 'Lerner & Simmons (1966) “Observer’s reaction to the innocent victim”, J. Personality and Social Psychology（PubMed所収・査読論文）' },
      { url: 'https://www.scu.edu/ethics/ethics-resources/ethical-decision-making/the-just-world-theory/', type: 'academic', label: 'Markkula Center for Applied Ethics, Santa Clara University — “The Just World Theory”' },
      { url: 'https://en.wikipedia.org/wiki/Just-world_fallacy', type: 'reference', label: 'Wikipedia — “Just-world fallacy / hypothesis”' },
    ],
  },
  {
    id: 'bizlaw-property-transfer',
    discipline: 'business-law',
    title: '物権変動と対抗要件（民法177条）',
    statement:
      '日本の民法では、物権の発生・変更・消滅（物権変動）は当事者の意思表示のみによって効力を生じる（意思主義、民法176条）。すなわち売買等の合意があれば、登記や引渡しといった特別の形式を要せず物権変動それ自体は成立する。もっとも、これを当事者以外の第三者に主張（対抗）するには対抗要件が必要であり、不動産については登記をしなければ第三者に対抗できず（民法177条）、動産についてはその引渡しがなければ第三者に対抗できない（民法178条）。' +
      'したがって同一不動産が複数人に売却された二重譲渡の場面では、契約の前後ではなく、先に所有権移転登記を備えた譲受人が確定的に所有権を取得する。登記・引渡しは物権変動の成立要件ではなく対抗要件である点が要諦である。',
    keyFigures: '意思主義＝物権変動は当事者の意思表示のみで効力発生（民法176条）／不動産の対抗要件＝登記（民法177条）／動産の対抗要件＝引渡し・占有改定等を含む（民法178条）／二重譲渡は先に登記を備えた者が優先（対抗関係）／登記・引渡しは成立要件でなく第三者対抗要件',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索『民法』（明治二十九年法律第八十九号、law id 129AC0000000089）— 176条・177条・178条の一次条文' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0177-00/', type: 'media', label: 'クレアール司法書士講座 民法第177条【不動産に関する物権の変動の対抗要件】解説' },
      { url: 'https://biz.moneyforward.com/contract/basic/20081/', type: 'media', label: 'マネーフォワード クラウド契約『民法177条とは？第三者の範囲や物権変動の対抗要件』' },
    ],
  },
  {
    id: 'infosoc-metcalfe-law',
    discipline: 'information-sociology',
    title: 'メトカーフの法則',
    statement:
      '通信ネットワークの価値（または影響力）は、接続された利用者数 n の二乗（n²）に比例する、という経験則。厳密には、ネットワーク内で成立しうる相互接続の総数 n(n−1)/2（三角数）で与えられ、n が大きいとき漸近的に n²/2 に近づく。新規利用者は既存の全利用者との新たな接続をもたらすため、価値は利用者数の増加より速く（線形でなく二乗的に）増大する。ネットワーク効果や正のフィードバックを説明する代表的な定式として、ファクスやSNS等の事例で用いられる。' +
      '一方で、すべての接続が等価値ではないとして二乗則は価値を過大評価するとの批判があり、Briscoe・Odlyzko・Tilly（2006）はより緩やかな n·log(n) を提案している。',
    keyFigures: 'ロバート・メトカーフ（Robert Metcalfe、イーサネットの共同発明者・3Com創業者）の1980年頃の観察に由来（当初は利用者でなく「互換性のある通信機器」の数で定式化）／命名は経済評論家ジョージ・ギルダー（George Gilder）が1993年9月のForbes ASAP誌記事で行った／要点：価値 ∝ n²（厳密には n(n−1)/2）／批判：Briscoe・Odlyzko・Tilly が n·log(n) を提唱（IEEE Spectrum, 2006）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Metcalfe%27s_law', type: 'reference', label: 'Wikipedia「Metcalfe’s law」: n²/三角数 n(n−1)/2、Metcalfe由来、Gilder1993命名' },
      { url: 'https://www.encyclopedia.com/economics/encyclopedias-almanacs-transcripts-and-maps/metcalfes-law', type: 'reference', label: 'Encyclopedia.com「Metcalfe’s Law」（百科事典級リファレンス、独立第二情報源）' },
      { url: 'https://spectrum.ieee.org/metcalfes-law-is-wrong', type: 'academic', label: 'Briscoe, Odlyzko & Tilly「Metcalfe’s Law is Wrong」IEEE Spectrum 43(7):34–39, 2006（n log n提案・学会刊行物）' },
      { url: 'https://experts.umn.edu/en/publications/metcalfes-law-is-wrong/', type: 'academic', label: 'University of Minnesota Experts（Odlyzko所属大学による同論文の書誌）' },
    ],
  },
  {
    id: 'econ-signaling',
    discipline: 'economics',
    title: 'シグナリング',
    statement:
      '情報の非対称性がある市場で、私的情報を持つ側（売り手・求職者など）が、自らのタイプ（質・能力）を、観察可能で模倣にコストのかかる行動を通じて、情報を持たない側へ信頼できる形で伝える仕組み。シグナルが信頼できるのは「単一交差（single-crossing）」性、すなわち高いタイプほど同じシグナルを発する限界費用が低く、低いタイプには模倣が割に合わないため。' +
      '古典例はマイケル・スペンス（1973）の教育シグナル（学歴）で、教育が生産性を高めずとも能力の代理指標として機能し、能力別に行動が分かれる分離均衡が生じうる。情報を持たない側が契約メニュー等で相手を選別するスティグリッツのスクリーニングとは情報伝達の方向が逆で、アカロフのレモン市場（逆選択）とも区別される別概念である。',
    keyFigures: '提唱者: A・マイケル・スペンス（A. Michael Spence）／初出: “Job Market Signaling”, Quarterly Journal of Economics, 1973, 87(3), 355–374／対概念スクリーニングの提唱者: ジョセフ・E・スティグリッツ／2001年ノーベル経済学賞をアカロフ・スペンス・スティグリッツの3名が「情報の非対称性のある市場の分析」で共同受賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2001/popular-information/', type: 'government', label: 'NobelPrize.org「The 2001 Prize in Economic Sciences — Popular information」（シグナリングとスクリーニングの区別）' },
      { url: 'https://academic.oup.com/qje/article-abstract/87/3/355/1909092', type: 'academic', label: 'Michael Spence, “Job Market Signaling”, The Quarterly Journal of Economics 87(3): 355–374 (1973), Oxford Academic' },
      { url: 'https://en.wikipedia.org/wiki/Signalling_(economics)', type: 'reference', label: 'Wikipedia「Signalling (economics)」（コストのかかる信頼できるシグナル／スクリーニングとの対比）' },
      { url: 'https://www.nber.org/news/joseph-e-stiglitz-george-akerlof-and-michael-spence-won-2001-nobel-prize-their-analyses-markets', type: 'academic', label: 'NBER「Stiglitz, Akerlof, and Spence Won 2001 Nobel Prize for Analyses of Markets with Asymmetric Information」' },
    ],
  },
  {
    id: 'mgmt-blue-ocean',
    discipline: 'management',
    title: 'ブルー・オーシャン戦略',
    statement:
      'ブルー・オーシャン戦略は、既存市場で競合と血みどろの消耗戦を繰り広げる「レッド・オーシャン」を避け、競争のない新しい市場空間「ブルー・オーシャン」を創造することで高収益成長を狙う経営戦略論である。中核概念は、差別化と低コストを二者択一ではなく同時に追求して買い手価値を飛躍させる「バリュー・イノベーション（価値革新）」であり、効用・価格・コストの全体最適化によって実現される。' +
      '分析枠組みとして、業界の競争要因を「減らす・取り除く（コスト低減）／増やす・付け加える（価値向上）」で問い直す4つのアクション（ERRCグリッド＝Eliminate-Reduce-Raise-Create）と、自社と競合の価値曲線を可視化する「戦略キャンバス」を用いる。ポーターの競争戦略が既存業界内での競争優位を扱うのに対し、本戦略は競争自体を無意味化する新市場創造を志向する点で対照的である。',
    keyFigures: 'W・チャン・キム（W. Chan Kim）／レネ・モボルニュ（Renée Mauborgne）／両者ともINSEAD教授／初出は2004年のHarvard Business Review論文、2005年に同名著書（Harvard Business School Press）として刊行',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/W._Chan_Kim', type: 'reference', label: 'Wikipedia「W. Chan Kim」— 提唱者・INSEAD・2005年著書の確認' },
      { url: 'https://hbr.org/2004/10/blue-ocean-strategy', type: 'media', label: 'Kim & Mauborgne, “Blue Ocean Strategy”, Harvard Business Review (2004) — 初出論文' },
      { url: 'https://www.blueoceanstrategy.com/tools/errc-grid/', type: 'media', label: '公式 Blue Ocean Strategy（提唱者運営）— ERRCグリッド／4つのアクションの定義' },
      { url: 'https://www.researchgate.net/publication/235299770_Value_innovation_A_leap_into_the_blue_ocean', type: 'academic', label: 'Kim & Mauborgne, “Value Innovation: A Leap into the Blue Ocean”, Journal of Business Strategy（査読誌）' },
    ],
  },
  {
    id: 'human-bounded-rationality',
    discipline: 'human-science',
    title: '限定合理性',
    statement:
      '限定合理性（bounded rationality）とは、人間の合理性が認知能力・利用可能な情報・時間といった制約のもとに置かれているため、理論上の最適解（maximizing）を導く完全合理性は現実には成立しない、とする意思決定論の概念。意思決定者は全選択肢を比較して効用を最大化するのではなく、あらかじめ設定した願望水準（aspiration level）を満たす選択肢が見つかった時点で探索を止め、それで満足する「満足化（satisficing）」を行う。' +
      'これは、瞬時に費用便益を計算し最適選択を続ける新古典派の「経済人（homo economicus）」像への批判であり、より現実的な「管理人（administrative man）」モデルを対置する。行動経済学・組織論・人工知能研究の基礎概念となった。',
    keyFigures: 'ハーバート・A・サイモン（Herbert A. Simon）が提唱／初出は『経営行動（Administrative Behavior）』(1947)／1978年ノーベル経済学賞（経済組織内の意思決定過程に関する先駆的研究）',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/bounded-rationality/', type: 'reference', label: 'Bounded Rationality — Stanford Encyclopedia of Philosophy（査読済み哲学百科事典）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1978/press-release/', type: 'government', label: 'The Sveriges Riksbank Prize in Economic Sciences 1978 — Press Release（ノーベル賞公式）' },
      { url: 'https://www.econlib.org/library/Enc/bios/Simon.html', type: 'reference', label: 'Herbert Alexander Simon — The Concise Encyclopedia of Economics (Econlib)' },
      { url: 'https://www.nobelprize.org/uploads/2018/06/simon-lecture.pdf', type: 'government', label: 'Herbert A. Simon — Nobel Prize Lecture（一次資料・本人講演）' },
    ],
  },
  {
    id: 'bizlaw-default-damages',
    discipline: 'business-law',
    title: '債務不履行と損害賠償（民法415条）',
    statement:
      '民法415条は、債務者がその債務の本旨に従った履行をしないとき、又は債務の履行が不能であるとき、債権者がこれによって生じた損害の賠償を請求できると定める。債務不履行は一般に履行遅滞・履行不能・不完全履行の三類型に整理される。2020年4月1日施行の改正民法では、その不履行が「契約その他の債務の発生原因及び取引上の社会通念に照らして債務者の責めに帰することができない事由」によるものであることを債務者が立証すれば免責される構成（同条1項ただし書）が明文化された。' +
      '帰責事由は債務者の過失に限られず、契約の趣旨に照らして判断される。損害賠償の範囲は民法416条が定め、通常生ずべき損害（通常損害）に加え、当事者が予見すべきであった特別の事情による損害（特別損害）に及ぶ。',
    keyFigures: '根拠条文＝民法415条（損害賠償）／免責要件＝帰責事由がないこと（415条1項ただし書、立証責任は債務者）／不履行の三類型＝履行遅滞・履行不能・不完全履行／賠償範囲＝通常損害＋予見すべき特別損害（民法416条）／改正施行＝2020年4月1日（民法債権法改正）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号、法令ID 129AC0000000089）— 415条・416条' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0415-00/', type: 'media', label: 'クレアール司法書士講座 民法第415条【債務不履行による損害賠償】' },
      { url: 'https://tek-law.jp/civil-code/claims/general-provisions/effects-of-claims/liability-for-non-performance/article-416/', type: 'media', label: '金子総合法律事務所 民法第416条（損害賠償の範囲）' },
    ],
  },
  {
    id: 'bizlaw-assignment-security',
    discipline: 'business-law',
    title: '譲渡担保',
    statement:
      '譲渡担保（じょうとたんぽ）は、日本の民法に明文規定のない「非典型担保（変則担保）」の一種で、判例法理・慣習上認められてきた担保手段である。債務の担保のため、目的物（不動産・動産・債権・集合動産・集合債権等）の所有権を形式上債権者に移転し、債務が弁済されれば所有権は設定者（債務者）に復帰し、弁済されなければ債権者が目的物から優先的に債権を回収する。' +
      '動産では占有改定（観念的引渡し）により設定者が目的物を手元で使用・継続利用したまま担保に供せるため、在庫等の集合動産や売掛債権を活用した資金調達に適する。実行（清算）方法には、目的物を債権者が取得し差額を返す帰属清算型と、第三者へ処分して代金から回収する処分清算型がある。約1世紀にわたり判例で規律されてきたが、2025年に明文化する立法（譲渡担保契約及び所有権留保契約に関する法律）が成立した。',
    keyFigures: '民法に規定のない非典型担保（判例・慣習法上の担保）／所有権を形式上債権者へ移転し弁済で復帰・不履行で目的物から優先回収／対象は不動産・動産・債権・集合動産・集合債権／占有改定により設定者が目的物を使用したまま担保化（在庫・売掛債権の活用に適する）／実行は帰属清算型と処分清算型・清算義務あり／「譲渡担保契約及び所有権留保契約に関する法律」が2025年5月30日成立・6月6日公布',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji07_00371.html', type: 'government', label: '法務省「譲渡担保契約及び所有権留保契約に関する法律（譲渡担保法）について」' },
      { url: 'https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/honbun/houan/g21709043.htm', type: 'government', label: '衆議院「譲渡担保契約及び所有権留保契約に関する法律案」本文' },
      { url: 'https://www.ritsumei.ac.jp/acd/cg/law/lex/21-1/003ikuma.pdf', type: 'academic', label: '立命館大学法学（生熊）「動産譲渡担保権・留保所有権の法的構成・優劣および集合動産譲渡担保の対抗力について」' },
    ],
  },
  {
    id: 'infosoc-moores-law',
    discipline: 'information-sociology',
    title: 'ムーアの法則',
    statement:
      '集積回路（チップ）上に集積されるトランジスタの数が一定期間ごとに約2倍になる、という半導体産業の経験則。インテル共同創業者ゴードン・ムーアが1965年にElectronics誌の論文「Cramming more components onto integrated circuits」で示したもので、当初は「年に約2倍」、1975年に成長鈍化を受けて「約2年で2倍」へ修正された。これは物理法則ではなく産業界の観測的傾向・開発目標であり、半導体性能の指数関数的向上とITコストの継続的低下を説明する枠組みとして広く用いられてきた。' +
      '一方、近年は微細化が原子スケールに近づき、量子トンネル効果やリーク電流、EUV露光など製造コストの急騰といった物理的・経済的限界から鈍化が進み、「終焉」か「3D実装・並列化等への進化」かが中立的に議論されている。通信ネットワークの価値を論じる「メトカーフの法則」とは別概念である。',
    keyFigures: 'ゴードン・ムーア（Gordon Moore、インテル共同創業者）／初出: 1965年 Electronics誌 論文「Cramming more components onto integrated circuits」（当時フェアチャイルドセミコンダクター在籍）／当初「年2倍」→1975年に「約2年で2倍」へ修正／名称「ムーアの法則」はカーバー・ミード（Carver Mead, カリフォルニア工科大学）が命名',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/technology/Moores-law', type: 'reference', label: 'Encyclopaedia Britannica「Moore’s law」（1965年起源・1975年の2年への修正）' },
      { url: 'https://www.computerhistory.org/revolution/digital-logic/12/267', type: 'reference', label: 'Computer History Museum「Moore’s Law」（コンピュータ史博物館の解説）' },
      { url: 'https://www.imec-int.com/en/what-we-offer/semiconductor-education-and-workforce-development/microchips/moores-law', type: 'academic', label: 'imec「What is Moore’s law? / Is Moore’s law dead?」（半導体研究機関による定義と鈍化論）' },
    ],
  },
  {
    id: 'econ-dual-labor-market',
    discipline: 'economics',
    title: '二重労働市場論',
    statement:
      '労働市場は単一の競争的市場ではなく、相互に分断された二つの部門から成るとする労働経済学の理論。賃金が高く雇用が安定し、昇進機会・良好な労働条件・職場ルールによる公正な処遇を備えた「一次（primary）部門」と、低賃金・雇用が不安定で離職率が高く、昇進機会や訓練機会に乏しい「二次（secondary）部門」に分かれ、両部門間の労働移動は制度的・慣行的に制限されているとされる。' +
      '背景には、企業内の管理的ルールや慣行が賃金決定と労働配置を支配する「内部労働市場（internal labor market）」の存在がある。同質な資質を持つ労働者でも、就く職の部門特性によって雇用成果が大きく異なる点を強調し、賃金決定と労働配分を競争的市場で説明する新古典派の単一労働市場像（人的資本論・限界生産力説）への批判として展開された。人種・性別・制度といった非市場的要因を分析に取り込む枠組みでもある。',
    keyFigures: 'ピーター・B・ドーリンガー（Peter B. Doeringer）／マイケル・J・ピオレ（Michael J. Piore）／初出: Doeringer & Piore『Internal Labor Markets and Manpower Analysis』(1971)／関連発展: Edwards・Reich・Gordon らの労働市場分断論（1975）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Dual_labour_market', type: 'reference', label: 'Dual labour market — Wikipedia（一次/二次部門への分断と DLM の定義）' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100046432', type: 'reference', label: 'Labour-market segmentation — Oxford Reference（Doeringer & Piore 1971 を初出とする学術リファレンス）' },
      { url: 'https://www.open.edu/openlearn/society-politics-law/economics/economics-explains-discrimination-the-labour-market/content-section-6.2', type: 'academic', label: 'Dual labour market theory — The Open University OpenLearn（大学教材）' },
      { url: 'https://www.nber.org/system/files/working_papers/w1666/w1666.pdf', type: 'academic', label: 'A Theory of Dual Labor Markets — NBER Working Paper' },
    ],
  },
  {
    id: 'mgmt-resource-dependence',
    discipline: 'management',
    title: '資源依存理論',
    statement:
      '資源依存理論（Resource Dependence Theory, RDT）は、組織を外部環境から切り離せない開放系として捉える組織論の理論である。組織は生存・活動に不可欠な希少資源（資金・原材料・情報・正統性など）を、自前で完結できず外部の他組織に依存する。ある資源が重要で、かつ他から代替調達できないほど、その資源を支配する相手は焦点組織に対して権力をもち、その行動を制約する。' +
      'この非対称な依存と環境の不確実性は組織にとって脅威となるため、組織は依存と不確実性を低減すべく能動的に環境を管理しようとする。具体的戦略には、合併・買収、合弁・提携などの組織間関係、取締役会への利害関係者の取り込み（役員相互派遣＝interlocking directorates による協調＝co-optation）、政治的働きかけ、経営者の交代などがある。内部資源・能力に着目する資源ベース理論（RBV）とは対照的に、外部環境への依存と権力関係に焦点を当てる点が特徴である。',
    keyFigures: 'ジェフリー・フェファー（Jeffrey Pfeffer）／ジェラルド・R・サランシック（Gerald R. Salancik）／初出: Pfeffer & Salancik (1978)『The External Control of Organizations: A Resource Dependence Perspective』（Harper & Row; 2003年 Stanford University Press 再版）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Resource_dependence_theory', type: 'reference', label: 'Resource dependence theory — Wikipedia' },
      { url: 'https://www.ebsco.com/research-starters/economics/resource-dependence-theory-rdt', type: 'reference', label: 'Resource Dependence Theory (RDT) — EBSCO Research Starters（学術リファレンス）' },
      { url: 'https://webuser.bus.umich.edu/gfdavis/Papers/davis_cobb_09_RSO.pdf', type: 'academic', label: 'Davis & Cobb, “Resource Dependence Theory: Past and Future” — University of Michigan（Research in the Sociology of Organizations 所収）' },
      { url: 'https://www.sup.org/books/business/external-control-organizations', type: 'academic', label: 'The External Control of Organizations — Stanford University Press（原著の現行版出版元）' },
    ],
  },
  {
    id: 'mgmt-institutional-isomorphism',
    discipline: 'management',
    title: '制度的同型化',
    statement:
      '制度的同型化とは、同一の組織フィールド（類似の財・サービスを供給し、共通の制度的環境を共有する組織群）に属する組織が、効率性ではなく正統性（legitimacy）を求める制度的圧力によって、互いに似通った構造・慣行へと収斂していく現象を指す。ポール・ディマジオとウォルター・パウエルは、組織が合理的選択を重ねた結果かえって画一化される「鉄の檻」としてこれを捉え、三つの機構を提示した。' +
      '(1)強制的同型化（coercive）は、法規制・政府の命令や資源を依存する組織からの公式・非公式な圧力に由来する。(2)模倣的同型化（mimetic）は、目標が曖昧で技術が不確実な状況下で、成功・正統とみなされる他組織を手本として模倣することから生じる。(3)規範的同型化（normative）は、専門職化、すなわち大学等の教育・資格認定や専門職ネットワークを通じた規範の浸透に由来する。各機構を通じて組織は制度化された構造に同調し正統性を獲得するが、必ずしも効率の改善を伴わない点が要点である。',
    keyFigures: 'ポール・ディマジオ（Paul J. DiMaggio）／ウォルター・W・パウエル（Walter W. Powell）／初出: DiMaggio & Powell (1983) “The Iron Cage Revisited: Institutional Isomorphism and Collective Rationality in Organizational Fields”, American Sociological Review, 48(2), 147-160',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jstor.org/stable/i336536', type: 'academic', label: 'American Sociological Review, Vol. 48, No. 2 (Apr., 1983) — 原論文 DiMaggio & Powell, pp. 147-160 (JSTOR)' },
      { url: 'https://sk.sagepub.com/ency/edvol/organization/chpt/institutional-isomorphism', type: 'reference', label: 'Sage “International Encyclopedia of Organization Studies” — Institutional Isomorphism 項目' },
      { url: 'https://patriciathornton.com/wp-content/uploads/2012/02/Palgrave-entry-on-isomorphism3.pdf', type: 'reference', label: 'Patricia H. Thornton, “Isomorphism” — Palgrave Encyclopedia 項目（三機構と正統性の解説）' },
    ],
  },
  {
    id: 'human-working-memory',
    discipline: 'human-science',
    title: 'ワーキングメモリ',
    statement:
      'ワーキングメモリ（作業記憶）とは、情報を一時的に保持しながら、同時にそれを処理・操作するための容量に限りのある記憶システムであり、推論・読解・学習などの高次認知の基盤となる。アラン・バドリーとグラハム・ヒッチ（1974）は、従来の受動的・単一的な短期記憶モデルに代わり、複数の構成要素からなるマルチコンポーネント・モデルを提唱した。' +
      '中核となる中央実行系（central executive）が注意を制御・配分し、二つの従属システム——言語・音声情報を扱う音韻ループ（phonological loop）と、視覚・空間情報を扱う視空間スケッチパッド（visuospatial sketchpad）——を統御する。2000年にはバドリーが、各サブシステムと長期記憶を統合するエピソード・バッファ（episodic buffer）を第四の要素として追加した。系列位置効果やスキーマ理論とは区別される独立した概念である。',
    keyFigures: 'アラン・バドリー（Alan Baddeley）／グラハム・ヒッチ（Graham Hitch）／初出: Baddeley & Hitch (1974) 三要素モデル／エピソード・バッファ追加: Baddeley (2000)',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Baddeley%27s_model_of_working_memory', type: 'reference', label: 'Baddeley’s model of working memory — Wikipedia' },
      { url: 'http://www.scholarpedia.org/article/Working_memory', type: 'academic', label: 'Working memory — Scholarpedia（査読制百科事典級リファレンス）' },
      { url: 'https://home.csulb.edu/~cwallis/382/readings/482/baddeley.pdf', type: 'academic', label: 'Baddeley A. “Working memory: looking back and looking forward”, Nature Reviews Neuroscience 4, 2003（査読論文・大学ホスト）' },
    ],
  },
  {
    id: 'bizlaw-director-conflict',
    discipline: 'business-law',
    title: '取締役の競業避止義務・利益相反取引（会社法356条）',
    statement:
      '取締役はその地位を利用し、会社の利益を犠牲にして自己又は第三者の利益を図ってはならない。会社法356条1項は、取締役が(1)競業取引（自己又は第三者のために会社の事業の部類に属する取引）、又は(2)利益相反取引（直接取引＝自己又は第三者のために会社と取引する／間接取引＝会社が取締役の債務を保証する等、会社と取締役の利益が相反する取引）をしようとする場合には、株主総会において当該取引につき重要な事実を開示し、その承認を受けなければならないと定める。' +
      '取締役会設置会社では、この承認は取締役会が行い（会社法365条1項）、取引をした取締役は取引後遅滞なくその重要な事実を取締役会に報告しなければならない（同条2項）。本規制は取締役の忠実義務（会社法355条）の具体化であり、違反等により会社に損害が生じたときは任務懈怠による損害賠償責任（会社法423条）を負う（競業取引違反では取締役等が得た利益額を損害額と推定する規定がある）。',
    keyFigures: '根拠条文＝会社法356条1項（競業・利益相反取引の制限）／取締役会設置会社の承認・報告＝会社法365条1項・2項／対象＝(1)競業取引(2)直接取引(3)間接取引（会社による取締役の債務保証等）／手続＝重要な事実の開示＋事前承認（株主総会・取締役会設置会社では取締役会）／趣旨＝忠実義務（355条）の具体化／違反の効果＝任務懈怠による損害賠償責任（423条）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（平成17年法律第86号、法令ID 417AC0000000086）— 355条・356条・365条・423条' },
      { url: 'https://ja.wikibooks.org/wiki/会社法第356条', type: 'reference', label: 'Wikibooks「会社法第356条」（条文本文を掲載）' },
      { url: 'https://www.businesslawyers.jp/practices/30', type: 'media', label: 'BUSINESS LAWYERS「取締役の利益相反取引とは？取締役会の承認が必要な場合は？」' },
    ],
  },
  {
    id: 'infosoc-platform-capitalism',
    discipline: 'information-sociology',
    title: 'プラットフォーム資本主義',
    statement:
      'デジタル・プラットフォームを基盤的インフラとする現代資本主義の形態を論じる概念。プラットフォーム企業は、異なる利用者集団（ユーザー・広告主・開発者・販売者など）の相互作用を仲介するインフラを提供し、その過程で生成される膨大なデータを採取・分析・収益化することを核心的ビジネスモデルとする。ニック・スルニチェクは、データを新たな「原材料」とみなし、プラットフォームをそれを処理する装置として位置づけた。' +
      '彼はプラットフォームを広告（Google・Facebook）／クラウド（AWS・Salesforce）／産業（GE・Siemens）／製品（Spotify・Rolls-Royce）／リーン（Uber・Airbnb）の5類型に整理する。ネットワーク効果が独占傾向（winner-takes-all）を生み、データの囲い込みとプロプライエタリな構造が論点となる。ギグ・エコノミーや注意経済、監視資本主義と関連するが、データ採取を軸とする経済構造の分析として区別される。',
    keyFigures: 'ニック・スルニチェク（Nick Srnicek）／初出: 著書『Platform Capitalism』（Polity Press, 2017, Theory Redux シリーズ）',
    asOf: '2026-06',
    sources: [
      { url: 'https://blogs.lse.ac.uk/lsereviewofbooks/2017/06/05/book-review-platform-capitalism-by-nick-srnicek/', type: 'academic', label: 'LSE Review of Books — Book Review: Platform Capitalism by Nick Srnicek（ロンドン・スクール・オブ・エコノミクス）' },
      { url: 'https://mastersofmedia.hum.uva.nl/2018/02/interventions-on-nick-srniceks-platform-capitalism/', type: 'academic', label: 'University of Amsterdam, Media Studies — Interventions on Nick Srnicek’s “Platform Capitalism”' },
      { url: 'https://www.politybooks.com/bookdetail?book_slug=platform-capitalism--9781509504862', type: 'media', label: 'Polity Press — Platform Capitalism（原著出版社・書誌）' },
      { url: 'https://en.wikipedia.org/wiki/Platform_capitalism', type: 'reference', label: 'Wikipedia — Platform capitalism' },
    ],
  },
  {
    id: 'econ-revealed-preference',
    discipline: 'economics',
    title: '顕示選好',
    statement:
      '顕示選好理論は、ポール・サミュエルソンが1938年に提唱した消費者理論の枠組みであり、観察不可能な効用関数や内省的な選好を出発点とせず、消費者が実際に行った購買行動（直面した価格・所得とその下での選択）から選好を逆に「顕示」させて導くアプローチである。ある価格・所得の下でBが購入可能であったのにAが選ばれたなら、「AはBより顕示的に選好される」とみなす。' +
      '消費者が満たすべき整合性条件として、サミュエルソンの弱公理（WARP：AがBより顕示選好されるなら、別の状況でBがAより顕示選好されることはない）と、これをハウタッカーが1950年に一般化した強公理（SARP：顕示選好関係が非循環的・推移的）があり、これらを満たせば観察された選択から需要理論を再構築できる。基数的効用や心理的内省に依存しない操作主義的な基礎づけであり、選択の効用最大化との整合性を経験的に検証可能にした点に意義がある。',
    keyFigures: 'ポール・サミュエルソン（提唱者、1938年「A Note on the Pure Theory of Consumer’s Behaviour」Economica 5: 61-71 で初出）／ヘンドリック・ハウタッカー（1950年に強公理SARPを定式化し理論を一般化）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/revealed-preference-theory', type: 'reference', label: 'Encyclopaedia Britannica (Money)「Revealed preference theory」— 1938年サミュエルソンによる提唱、観察行動ベースの枠組み' },
      { url: 'https://en.wikipedia.org/wiki/Revealed_preference', type: 'reference', label: 'Wikipedia「Revealed preference」— WARP（Samuelson 1938）・SARP（Houthakker 1950）の定義' },
      { url: 'https://www.semanticscholar.org/paper/A-Note-on-the-Pure-Theory-of-Consumer\'s-Behaviour-Samuelson/1de2464829944076ef547f7a4f8b9aaa8dc871a0', type: 'academic', label: 'Samuelson, P. A. (1938) “A Note on the Pure Theory of Consumer’s Behaviour”, Economica 5(17): 61-71 — 原典（Semantic Scholar 書誌）' },
      { url: 'https://link.springer.com/chapter/10.1007/978-94-009-7377-0_2', type: 'academic', label: 'Springer「Samuelson and Consumption Theory」— 顕示選好の操作主義的基礎づけに関する学術解説' },
    ],
  },
  {
    id: 'mgmt-hofstede-dimensions',
    discipline: 'management',
    title: 'ホフステッドの文化次元論',
    statement:
      'オランダの社会心理学者ヘールト・ホフステッドが、多国籍企業IBMの社員を対象とした大規模な国際意識調査（1960年代後半〜1970年代初頭、50カ国超・10万件超）の分析から、国民文化を比較する尺度を抽出した枠組み。1980年の『Culture’s Consequences』で当初4次元――(1)権力格差、(2)個人主義対集団主義、(3)男性性対女性性、(4)不確実性回避――を提示した。' +
      '後にマイケル・ボンドらの中国的価値観調査に由来する(5)長期志向対短期志向、さらにミンコフとの研究で(6)放縦対抑制が加わり6次元となった。各国は次元ごとにスコア化され異文化比較に広く用いられる。一方で、単一企業（IBM）かつ1970年前後の古いデータに依拠する点、国民を均質とみなし国内の地域・世代・階層差を捨象する点、集団レベルの相関を個人に適用する生態学的誤謬（ecological fallacy）の危険など、妥当性への批判も提起されている。',
    keyFigures: 'ヘールト・ホフステッド（Geert Hofstede、提唱者）／初出『Culture’s Consequences』(1980年、当初4次元)／マイケル・ボンド（長期志向＝中国的価値観調査由来）／ミハイル・ミンコフ（放縦対抑制を共同で追加、2010年）',
    asOf: '2026-06',
    sources: [
      { url: 'https://scholarworks.gvsu.edu/orpc/vol2/iss1/8/', type: 'academic', label: 'Geert Hofstede, “Dimensionalizing Cultures: The Hofstede Model in Context”, Online Readings in Psychology and Culture 2(1), 2011（査読論文）' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/hofstedes-cultural-dimensions-theory', type: 'reference', label: 'EBSCO Research Starters: Hofstede’s cultural dimensions theory（百科事典級レファレンス）' },
      { url: 'https://geerthofstede.com/culture-geert-hofstede-gert-jan-hofstede/6d-model-of-national-culture/', type: 'reference', label: 'Geert Hofstede 公式サイト「The 6 dimensions model of national culture」' },
      { url: 'https://en.wikipedia.org/wiki/Hofstede%27s_cultural_dimensions_theory', type: 'reference', label: 'Wikipedia: Hofstede’s cultural dimensions theory' },
    ],
  },
  {
    id: 'mgmt-psychological-safety',
    discipline: 'management',
    title: '心理的安全性',
    statement:
      'チームのメンバーが共有する「対人関係上のリスク（質問・懸念の表明・失敗の報告・異議申し立て）をとっても、罰せられたり恥をかかされたりしない」という信念を指す。エイミー・エドモンドソンが1999年の論文で、組織行動論におけるチームレベルの構成概念として定式化した。心理的安全性が高いチームほど学習行動（失敗の共有・支援要請・改善の試み）が促進され、これがチーム業績へとつながる（学習行動が両者を媒介する）。' +
      'Googleの「プロジェクト・アリストテレス」が効果的なチームの最重要因子として注目したことで広く知られるようになった。「居心地の良さ」や「対立がないこと」とは異なり、率直さ（candor）や建設的な対立・高い基準と両立する点が重要で、甘やかしや責任の免除を意味しない。',
    keyFigures: 'エイミー・エドモンドソン（Amy C. Edmondson、ハーバード・ビジネス・スクール教授）／初出: Edmondson, A. C. (1999) “Psychological Safety and Learning Behavior in Work Teams”, Administrative Science Quarterly, 44(2), 350–383',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.2307/2666999', type: 'academic', label: 'Edmondson, A. C. (1999) “Psychological Safety and Learning Behavior in Work Teams”, Administrative Science Quarterly 44(2), 350–383 (SAGE Journals)' },
      { url: 'https://dash.harvard.edu/entities/publication/13a7b031-0fdd-45ec-a7e0-2b80e2bc679f', type: 'academic', label: 'Harvard DASH 機関リポジトリ — 同論文の書誌・要旨' },
      { url: 'https://en.wikipedia.org/wiki/Psychological_safety', type: 'reference', label: 'Wikipedia「Psychological safety」' },
    ],
  },
  {
    id: 'human-equity-theory',
    discipline: 'human-science',
    title: '公平理論（衡平理論）',
    statement:
      '人は職務に投じる「インプット（努力・スキル・時間・経験）」と、そこから得る「アウトカム（報酬・承認・昇進）」の比率を、他者（比較対象）の比率と照合し、両者の比が等しいとき公平（equity）と知覚する、とする動機づけの過程理論。自分の比率が他者より低い（過小報酬）または高い（過大報酬）と知覚すると緊張（tension）が生じ、人はこれを低減しようとして、努力量の増減、報酬交渉、比較対象の変更、インプット／アウトカムの認知的な歪曲、あるいは離職といった行動をとる。' +
      '社会的交換と互恵性の概念に基づき、職場の報酬・公正感・モチベーションを説明する。アウトカムの分配の公正を扱うため分配的公正（distributive justice）の理論に位置づけられ、後の組織的公正（手続き的公正を含む）研究の源流の一つとなった。',
    keyFigures: 'ジョン・ステイシー・アダムス（John Stacey Adams）／初出: Adams (1963) “Toward an Understanding of Inequity”, Journal of Abnormal and Social Psychology／発展: Adams (1965) “Inequity in Social Exchange”, in Berkowitz (Ed.), Advances in Experimental Social Psychology, Vol. 2, pp. 267–299',
    asOf: '2026-06',
    sources: [
      { url: 'https://biz.libretexts.org/Bookshelves/Management/Organizational_Behavior/05:_Theories_of_Motivation/05.3:_Process-Based_Theories', type: 'academic', label: 'Business LibreTexts (Organizational Behavior, 5.3 Process-Based Theories) — equity theory／分配的公正／緊張と反応' },
      { url: 'https://www.ebsco.com/research-starters/politics-and-government/equity-theory', type: 'reference', label: 'EBSCO Research Starters — Equity theory (Adams 1963/1965、インプット/アウトカム比の比較)' },
      { url: 'https://courses.lumenlearning.com/wmintrobusiness/chapter/reading-process-based-theories/', type: 'academic', label: 'Lumen Learning — Reading: Equity Theory（過程理論としての公平理論）' },
    ],
  },
  {
    id: 'bizlaw-fraudulent-rescission',
    discipline: 'business-law',
    title: '詐害行為取消権（民法424条）',
    statement:
      '詐害行為取消権とは、債務者が債権者を害することを知ってした行為（詐害行為。例えば責任財産を不当に減少させる贈与や廉価売却）について、債権者がその行為の取消しと、逸出した財産の取戻しを裁判所に請求できる権利をいう（民法424条1項）。総債権者の引当てとなる債務者の責任財産を保全するための制度で、財産権を目的としない行為には適用されない（同条2項）。被保全債権は当該行為の前の原因に基づき生じたものに限られる（同条3項）。' +
      '行使には必ず裁判上の請求（訴え）を要する点が特徴で、債権者が自己の名で債務者の権利を行使する債権者代位権（423条）とは別の制度である。2020年4月1日施行の改正民法で、相当の対価を得てした財産処分行為（424条の2）や特定の債権者への弁済・担保供与＝偏頗行為（424条の3）の取扱い、取消しの効果が債務者にも及ぶこと等の要件・効果が整理・明文化された。',
    keyFigures: '根拠条文＝民法424条〜426条／要件＝被保全債権の存在・債務者の無資力（詐害行為時および取消権行使時の双方）・詐害行為・債務者の詐害の意思・受益者および転得者の悪意／424条の2＝相当の対価を得た処分行為は隠匿等の意思と受益者の悪意で取消可／424条の3＝偏頗行為は原則非該当だが支払不能時の通謀害意で取消可／行使方法＝必ず裁判上の請求／施行＝2020年4月1日（債権法改正）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号、law id 129AC0000000089）第424条 詐害行為取消請求' },
      { url: 'https://www.lawschool.tsukuba.ac.jp/wp/wp-content/uploads/2016/06/tlj-20-kiji01.pdf', type: 'academic', label: '北秀昭「詐害行為取消権の民法改正案の特質」筑波ロー・ジャーナル（筑波大学法科大学院）' },
      { url: 'https://www.businesslawyers.jp/practices/1183', type: 'media', label: 'BUSINESS LAWYERS 詐害行為と逸出財産の返還・取消権の消滅時効・偏頗行為の要件' },
    ],
  },
  {
    id: 'infosoc-moral-panic',
    discipline: 'information-sociology',
    title: '道徳的パニック（モラル・パニック）',
    statement:
      'ある状態・出来事・人物・集団が、社会の価値や利益に対する脅威として（しばしば実害に比して過剰に）定義され、メディアによってセンセーショナルに描かれることで広がる社会現象。報道は明確な悪役＝「フォーク・デビル（folk devils、社会の敵役）」を構築し、道徳的非難・取り締まり強化・立法といった社会的反応を増幅させる。スタンレー・コーエンは1964年のモッズとロッカーズの抗争報道を分析し、実際の被害は軽微だったにもかかわらず新聞が事態を誇張した過程を「逸脱増幅（deviancy amplification、増幅スパイラル）」として描いた。' +
      '後にゴード＆ベン＝イェフダが、関心（concern）・敵意（hostility）・合意（consensus）・不均衡（disproportionality）・変動性（volatility）という5つの指標で類型化した。沈黙の螺旋や議題設定とは別概念のメディア社会学的現象である。',
    keyFigures: 'スタンレー・コーエン（Stanley Cohen）― 初出『Folk Devils and Moral Panics』(1972) で定式化／エリック・ゴード（Erich Goode）＆ナフマン・ベン＝イェフダ（Nachman Ben-Yehuda）― 『Moral Panics: The Social Construction of Deviance』(1994/2009) で5指標を整理',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Moral_panic', type: 'reference', label: 'Wikipedia「Moral panic」― コーエンの定義・モッズ＆ロッカーズ・逸脱増幅' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/folk-devil', type: 'reference', label: 'EBSCO Research Starters「Folk devil」― フォーク・デビル概念とコーエン(1972)' },
      { url: 'https://link.springer.com/chapter/10.1057/9780230274679_2', type: 'academic', label: 'Springer Nature「The Concept of the Moral Panic: An Historico-Sociological Positioning」' },
      { url: 'https://www.essex.ac.uk/blog/posts/2025/04/04/book-review-folk-devils-and-moral-panics', type: 'academic', label: 'University of Essex ― 書評『Folk Devils and Moral Panics』(1972)' },
    ],
  },
  {
    id: 'econ-median-voter',
    discipline: 'economics',
    title: '中位投票者定理',
    statement:
      '多数決投票において、争点が一次元の連続体（例：政府支出の多寡、左右イデオロギー）上に並べられ、かつ各投票者の選好が単峰型（single-peaked：自分の最適点から離れるほど効用が単調に低下する）であるとき、中位投票者（投票者の最適点を並べた中央値の位置にいる者）が最も好む案が、他のいかなる案とも一対一の多数決で負けない＝コンドルセ勝者となる、という定理。' +
      '政治的含意として、二大政党・候補者は得票最大化のため互いに中央（中位投票者の立場）へ収斂すると予測される（ダウンズ的競争）。ただし前提が要で、争点が二次元以上に拡張されたり選好が単峰でない場合、一般にコンドルセ勝者は存在せず、議題操作次第で任意の案が勝ちうる多数決の循環（投票のパラドックス、マッケルヴェイ＝ショフィールドのカオス定理）が生じ、定理は成立しない。',
    keyFigures: 'ダンカン・ブラック（Duncan Black, 1948「On the Rationale of Group Decision-making」Journal of Political Economy で定式化）／アンソニー・ダウンズ（Anthony Downs, 1957『An Economic Theory of Democracy（経済理論からみた民主主義）』で二大政党の中位収斂という政治的含意を提示）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.journals.uchicago.edu/doi/abs/10.1086/256633', type: 'academic', label: 'Black, D. (1948) “On the Rationale of Group Decision-making”, Journal of Political Economy 56(1):23–34（原典／University of Chicago Press）' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100146688', type: 'reference', label: 'Oxford Reference — “median voter”（Oxford University Press）' },
      { url: 'https://en.wikipedia.org/wiki/Median_voter_theorem', type: 'reference', label: 'Wikipedia — Median voter theorem（単峰性・コンドルセ勝者・多次元での不成立）' },
      { url: 'https://eml.berkeley.edu/~saez/course131/political_ch09.pdf', type: 'academic', label: 'E. Saez, UC Berkeley Econ 131 講義ノート — 前提（一次元・単峰）と多次元での循環' },
    ],
  },
  {
    id: 'mgmt-absorptive-capacity',
    discipline: 'management',
    title: '吸収能力',
    statement:
      '吸収能力（absorptive capacity）とは、企業が外部の新しい情報・知識の価値を認識し、それを吸収・同化（assimilate）し、商業的目的に応用（apply／exploit）する能力を指す、組織学習・イノベーション論の中核概念である。コーエン＆レビンサール（1990）は、この能力が単なる外部知識への接触ではなく、既存の関連知識（事前知識）の蓄積に大きく依存し、自社のR&D投資の副産物としても高まると論じた。' +
      'そのため経路依存的・累積的な性質を持ち、過去の知識基盤が将来の学習・革新能力を規定する。のちにザーラ＆ジョージ（2002）は、知識の取得・同化からなる「潜在的吸収能力（potential）」と、変換・活用からなる「実現的吸収能力（realized）」へと再概念化した。知識移転・技術導入・イノベーション能力を説明する鍵概念であり、ダイナミック・ケイパビリティ等とは区別される独立概念である。',
    keyFigures: 'ウェズリー・M・コーエン／ダニエル・A・レビンサール（提唱者, Cohen & Levinthal, 1990, Administrative Science Quarterly 35(1):128-152）／シャカー・A・ザーラ & ジェラルド・ジョージ（潜在的／実現的吸収能力への再概念化, 2002, Academy of Management Review 27(2):185-203）',
    asOf: '2026-06',
    sources: [
      { url: 'https://eric.ed.gov/?id=EJ406851', type: 'government', label: 'ERIC（米国教育省 教育資源情報センター）— Cohen & Levinthal (1990) “Absorptive Capacity”, Administrative Science Quarterly 書誌情報' },
      { url: 'https://en.wikipedia.org/wiki/Absorptive_capacity', type: 'reference', label: 'Wikipedia「Absorptive capacity」— 定義・事前知識依存・Zahra & George (2002) の区分' },
      { url: 'https://journals.aom.org/doi/10.5465/amc.2021.0008', type: 'academic', label: 'Academy of Management Collections「The Past and Future of Absorptive Capacity」— 概念史と再概念化の学会公式レビュー' },
      { url: 'https://link.springer.com/rwe/10.1007/978-1-4419-1428-6_1620', type: 'reference', label: 'Springer「Absorptive Capacity and Organizational Learning」— 経営学リファレンス事典項目' },
    ],
  },
  {
    id: 'human-mental-accounting',
    discipline: 'human-science',
    title: 'メンタル・アカウンティング（心の会計）',
    statement:
      '人々がお金を、その出所や使途に応じて心の中で複数の別々の「勘定（mental account）」に分類・管理し、本来は完全に代替可能（fungible）なはずのお金を、あたかも色分けされているかのように扱う認知的傾向。リチャード・セイラーが体系化した枠組みで、お金を符号化・分類・評価する一連の認知操作を指す。例えば、あぶく銭（ボーナスやギャンブルの儲け）は浪費しやすく、同額の給料は慎重に使う、といった行動が生じる。' +
      '経済学が前提とするお金の代替可能性に反し、勘定ごとの予算管理・評価頻度・選択の括り方（ブラケッティング）を通じて、消費・貯蓄・投資の判断に体系的な歪みをもたらす。プロスペクト理論のS字型価値関数（参照点・損失回避）と結びつき、利得は分離し損失は統合するといった心的符号化を説明する。',
    keyFigures: '提唱者：リチャード・セイラー（Richard H. Thaler）／主要文献：1985年「Mental Accounting and Consumer Choice」（Marketing Science）、1999年「Mental Accounting Matters」（Journal of Behavioral Decision Making, 12:183-206）／2017年ノーベル経済学賞受賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1002/(SICI)1099-0771(199909)12:3%3C183::AID-BDM318%3E3.0.CO;2-F', type: 'academic', label: 'Thaler, R. H. (1999) “Mental Accounting Matters”, Journal of Behavioral Decision Making 12(3):183-206（Wiley、原典）' },
      { url: 'https://pubsonline.informs.org/doi/10.1287/mksc.1070.0330', type: 'academic', label: 'Thaler, R. H. “Mental Accounting and Consumer Choice”, Marketing Science（INFORMS）' },
      { url: 'https://people.bath.ac.uk/mnsrf/Teaching%202011/Thaler-99.pdf', type: 'academic', label: 'University of Bath が公開する Thaler (1999) 全文PDF' },
      { url: 'https://en.wikipedia.org/wiki/Mental_accounting', type: 'reference', label: 'Wikipedia「Mental accounting」' },
    ],
  },
  {
    id: 'bizlaw-creditor-subrogation',
    discipline: 'business-law',
    title: '債権者代位権（民法423条）',
    statement:
      '債権者代位権とは、債権者が自己の債権（被保全債権）を保全するため必要があるときに、債務者に属する権利（被代位権利）を債務者に代わって行使できる権利をいう（民法423条）。典型例は、無資力の債務者が第三者（第三債務者）に対して有する金銭債権を、債務者に代わって取り立てる場面である。行使の主な要件は、(1)被保全債権が存在し原則として履行期が到来していること（ただし保存行為は期限前でも可）、(2)保全の必要性（原則として債務者の無資力）、(3)債務者が自らその権利を行使していないこと、(4)被代位権利が債務者の一身専属権や差押えを禁じられた権利でないこと、である。' +
      '2017年改正（2020年4月1日施行）で従来の判例法理が条文に明文化され、債権者が直接自己への支払を請求できること（423条の3）や、代位行使後も債務者が処分権限を失わないこと（423条の5）等が整理された。詐害行為取消権（民法424条以下）とは別概念の責任財産保全制度である。',
    keyFigures: '被保全債権の保全のため債務者の権利を代位行使（民法423条）／要件＝被保全債権の存在（原則履行期到来後・保存行為は例外）・保全の必要性（原則として債務者の無資力）・債務者の不行使・一身専属権/差押禁止権利でないこと／423条の3＝直接自己への支払請求可（判例法理の明文化）／423条の5＝代位後も債務者は処分権限を失わない／2020年4月1日施行の改正民法で明文化',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 — 民法（明治二十九年法律第八十九号、law id 129AC0000000089、第423条〜423条の7）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0423-00/', type: 'media', label: 'クレアール司法書士講座 — 民法第423条【債権者代位権の要件】解説' },
      { url: 'https://www.yokohama-roadlaw.com/column/78_4235.html', type: 'media', label: '横浜ロード法律事務所 — 民法（債権法）改正の解説78［民法423条の5］' },
    ],
  },
  {
    id: 'infosoc-tam',
    discipline: 'information-sociology',
    title: '技術受容モデル（TAM）',
    statement:
      '技術受容モデル（Technology Acceptance Model, TAM）は、フレッド・デイビスが提唱した、人々が情報技術（IT）を受容・利用するか否かを説明・予測する情報システム論のモデルである。フィッシュバイン＆アイゼンの合理的行為理論（TRA）を情報システム領域へ応用したもので、中核を成すのは二つの信念、すなわち(1)知覚された有用性（perceived usefulness＝その技術を使えば仕事の成果が向上するという認識）と(2)知覚された使いやすさ（perceived ease of use＝努力を要さず使えるという認識）である。' +
      'これら二つが利用に対する態度・行動意図・実際の利用行動を規定し、さらに使いやすさは有用性にも正の影響を及ぼすと仮定される。後にTAM2や統合理論UTAUTへと拡張された。イノベーションの普及理論や計画的行動理論とは区別される独立した概念である。',
    keyFigures: 'フレッド・デイビス（Fred D. Davis）が提唱／初出は1986年のMITスローン経営大学院博士論文、および Davis (1989) “Perceived Usefulness, Perceived Ease of Use, and User Acceptance of Information Technology”, MIS Quarterly 13(3): 319-340／後継：Venkatesh & Davis (2000) TAM2、Venkatesh et al. (2003) UTAUT',
    asOf: '2026-06',
    sources: [
      { url: 'https://misq.umn.edu/misq/article/13/3/319/191/Perceived-Usefulness-Perceived-Ease-of-Use-and', type: 'academic', label: 'Davis, F. D. (1989). Perceived Usefulness, Perceived Ease of Use, and User Acceptance of Information Technology. MIS Quarterly 13(3), 319-340（初出論文）' },
      { url: 'https://open.ncl.ac.uk/theories/1/technology-acceptance-model/', type: 'academic', label: 'Technology Acceptance Model — TheoryHub, Newcastle University（大学運営の学術理論レビュー）' },
      { url: 'https://en.wikipedia.org/wiki/Technology_acceptance_model', type: 'reference', label: 'Technology acceptance model — Wikipedia' },
      { url: 'https://www.ebsco.com/research-starters/technology/technology-acceptance-model-tam', type: 'reference', label: 'Technology Acceptance Model (TAM) — EBSCO Research Starters' },
    ],
  },
  {
    id: 'econ-path-dependence',
    discipline: 'economics',
    title: '経路依存',
    statement:
      '過去の出来事や偶然の初期条件・選択が、収穫逓増（増加収益）と正のフィードバックという自己強化的メカニズムを通じて固定化し、現在および将来の結果を制約するという考え方。過程は非エルゴード的で、初期に生じた出来事が平均化されて消えず後の経路を方向づけるため、必ずしも効率的でない状態にロックイン（固定）されうる。' +
      'ポール・デイヴィッドはQWERTY配列を例に、技術的相互関連性・規模の経済・投資の準不可逆性の3条件が転換費用を生み固定化を招くと論じた。ブライアン・アーサーは収穫逓増下で競合技術が小さな歴史的偶然から一方へ固定される機構を示した。「歴史は重要（history matters）」と要約され、技術標準化（VHS対ベータ等）や制度・産業集積の説明に用いられる。制度的同型化とは別概念。',
    keyFigures: 'ポール・デイヴィッド（Paul A. David, 1985「Clio and the Economics of QWERTY」, American Economic Review 75(2):332–337）／W・ブライアン・アーサー（W. Brian Arthur, 収穫逓増・ロックインの分析, 著書 Increasing Returns and Path Dependence in the Economy）',
    asOf: '2026-06',
    sources: [
      { url: 'https://eh.net/encyclopedia/path-dependence/', type: 'academic', label: 'EH.Net Encyclopedia (Economic History Association), “Path Dependence”' },
      { url: 'https://www.britannica.com/topic/path-dependence', type: 'reference', label: 'Encyclopaedia Britannica, “Path dependence”' },
      { url: 'https://sites.santafe.edu/~wbarthur/Books/IR_Book_Preface.pdf', type: 'academic', label: 'Santa Fe Institute — W. Brian Arthur, “Increasing Returns and Path Dependence in the Economy” (Preface)' },
      { url: 'https://www.cambridge.org/core/books/evolutionary-foundations-of-economics/path-dependence-in-economic-processes-implications-for-policy-analysis-in-dynamical-system-contexts/93AFD05279B914C7FA74B5F9912D45E2', type: 'academic', label: 'Cambridge University Press — P. David, “Path dependence in economic processes”' },
    ],
  },
  {
    id: 'econ-mundell-fleming',
    discipline: 'economics',
    title: 'マンデル＝フレミング・モデル',
    statement:
      '閉鎖経済を前提とするIS-LMモデルを、資本移動のある開放経済へ拡張した国際マクロ経済学の基本モデル（IS-LM-BPモデルとも呼ぶ）。財市場の均衡を示すIS曲線、貨幣市場の均衡を示すLM曲線、国際収支の均衡を示すBP曲線の同時均衡を分析し、為替相場制度（固定相場制か変動相場制か）と国際資本移動性の程度に応じて財政・金融政策の有効性が変化することを明らかにする。' +
      '資本移動が完全な場合、変動相場制では金融政策が有効で財政政策は無効、固定相場制ではその逆となる。これは「国際金融のトリレンマ（不可能の三角形）」――自由な資本移動・固定相場・独立した金融政策の3つは同時に2つまでしか達成できない――の理論的基礎を与える。',
    keyFigures: 'ロバート・マンデル（Robert A. Mundell, “Capital Mobility and Stabilization Policy under Fixed and Flexible Exchange Rates”, 1963）／マーカス・フレミング（J. Marcus Fleming, IMF Staff Papers, vol.9, 1962, pp.369–380）が1960年代前半に独立に展開／マンデルは1999年ノーベル経済学賞受賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1999/summary/', type: 'government', label: 'NobelPrize.org — 1999年経済学賞: マンデルの受賞理由（異なる為替相場制度下の金融・財政政策、最適通貨圏）' },
      { url: 'https://www.elibrary.imf.org/view/journals/024/1962/003/article-A004-en.xml', type: 'government', label: 'IMF eLibrary — Fleming (1962) “Domestic Financial Policies under Fixed and under Floating Exchange Rates”, IMF Staff Papers 9(3)' },
      { url: 'https://www.nber.org/system/files/working_papers/w2321/w2321.pdf', type: 'academic', label: 'NBER WP No.2321 (Frenkel & Razin) “The Mundell-Fleming Model: A Quarter Century Later”' },
      { url: 'https://en.wikipedia.org/wiki/Mundell%E2%80%93Fleming_model', type: 'reference', label: 'Wikipedia — Mundell–Fleming model（IS-LM-BoP、政策有効性、不可能の三角形）' },
    ],
  },
  {
    id: 'mgmt-authentic-leadership',
    discipline: 'management',
    title: 'オーセンティック・リーダーシップ',
    statement:
      'リーダーが自分自身の価値観・信念に忠実（authentic、本物）であり、高い自己認識に基づいて一貫した言動をとることで、フォロワーの信頼と肯定的な発達を促すとするリーダーシップ論。ポジティブ組織行動論の文脈で発展し、他の積極的リーダーシップの基盤をなす「根源的構成概念（root construct）」と位置づけられる。' +
      'ウォルンブワらは構成要素として、(1)自己認識（self-awareness）、(2)バランスのとれた情報処理（balanced processing）、(3)関係の透明性（relational transparency）、(4)内面化された道徳的視座（internalized moral perspective）の4つを挙げ、測定尺度ALQを開発・検証した。価値観や倫理を重視する点で、目標達成を主眼とする変革型（transformational）リーダーシップとは区別される独立した概念として論じられる。',
    keyFigures: 'ビル・ジョージ（Bill George, 2003『Authentic Leadership』で実務的に普及）／フレッド・ルーサンス & ブルース・アボリオ（2003、ポジティブ組織行動論として学術的に体系化）／ウィリアム・ガードナー & アボリオ（2005、理論的精緻化）／ウォルンブワ（Walumbwa）ら（2008、4構成要素と測定尺度ALQを開発・検証）',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.1177/0149206307308913', type: 'academic', label: 'Walumbwa, Avolio, Gardner, Wernsing & Peterson (2008) “Authentic Leadership: Development and Validation of a Theory-Based Measure”, Journal of Management (SAGE)' },
      { url: 'https://sk.sagepub.com/ency/edvol/download/the-sage-encyclopedia-of-leadership-studies/chpt/authentic-leadership.pdf', type: 'reference', label: 'The SAGE Encyclopedia of Leadership Studies — “Authentic Leadership”' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S1048984305000263', type: 'academic', label: 'Avolio & Gardner (2005) “Authentic leadership development”, The Leadership Quarterly — 根源的構成概念・変革型との区別' },
    ],
  },
  {
    id: 'human-elaboration-likelihood',
    discipline: 'human-science',
    title: '精緻化見込みモデル（ELM）',
    statement:
      '精緻化見込みモデル（Elaboration Likelihood Model, ELM）は、説得による態度変容を説明する二重過程理論である。受け手が説得情報をどれだけ精緻に吟味するか（精緻化の度合い）に応じて、説得は二つの経路に分かれるとする。動機と能力がともに高いときは「中心ルート（central route）」が働き、論拠の質を慎重に吟味して態度が変わるため、生じた態度変化は持続的・行動予測的で、反論への抵抗性が高い。' +
      '動機や能力が低いときは「周辺ルート（peripheral route）」が働き、論拠の中身ではなく発信者の魅力・権威やメッセージ数などの周辺的手がかりに依存して態度が変わるため、態度変化は一時的で変わりやすい。広告・マーケティングや健康コミュニケーションの研究に広く影響を与えている。計画的行動理論や認知的不協和とは別概念である。',
    keyFigures: 'リチャード・E・ペティ（Richard E. Petty）／ジョン・T・カシオッポ（John T. Cacioppo）／1980年代に提唱、体系化は Petty & Cacioppo (1986) “Advances in Experimental Social Psychology” 19, 123–205 および著書『Communication and Persuasion: Central and Peripheral Routes to Attitude Change』（Springer, 1986）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Elaboration_likelihood_model', type: 'reference', label: 'Elaboration likelihood model — Wikipedia' },
      { url: 'https://www.ebsco.com/research-starters/communication-and-mass-media/elaboration-likelihood-model', type: 'reference', label: 'Elaboration Likelihood Model — EBSCO Research Starters' },
      { url: 'https://www.simplypsychology.org/elaboration-likelihood-model.html', type: 'reference', label: 'Elaboration Likelihood Model — SimplyPsychology' },
    ],
  },
  {
    id: 'bizlaw-fictitious-manifestation',
    discipline: 'business-law',
    title: '通謀虚偽表示（民法94条）',
    statement:
      '通謀虚偽表示とは、表意者が相手方と通じて行う、真意でない虚偽の意思表示をいう。当事者双方が真意でないと互いに了解したうえで仮装の法律行為（仮装売買・仮装譲渡など）を行う点に特徴がある。民法94条1項により、相手方と通じてした虚偽の意思表示は無効である。例えば、債権者の差押えを免れる目的で、売る意思がないのに友人名義へ不動産を仮装譲渡する場合がこれにあたり、当事者間（仮装譲渡人・譲受人間）ではその行為は無効となる。' +
      'もっとも同条2項は、この無効を「善意の第三者」に対抗することができないと定める。すなわち、仮装の外観を真実と信じて新たに取引関係に入った第三者は保護され、真の権利者は無効を主張して権利を取り戻すことができない。これは虚偽の外観を作出した者の帰責性に基づき外観を信頼した第三者を保護する権利外観法理の代表例であり、通謀が認められない事案でも判例上94条2項の類推適用が広く論じられる。心裡留保（93条）・錯誤（95条）とは別の意思表示の瑕疵類型。',
    keyFigures: '民法94条1項：相手方と通じてした虚偽の意思表示は無効／94条2項：その無効は善意の第三者に対抗できない（第三者保護）／典型例：差押え回避のための不動産の仮装譲渡・仮装売買／権利外観法理の代表例（虚偽の外観作出者の帰責性＋第三者の信頼）／判例による94条2項の類推適用／心裡留保（93条）・錯誤（95条）とは別の意思表示の瑕疵類型',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 — 民法（明治二十九年法律第八十九号、law id 129AC0000000089）第94条' },
      { url: 'https://www.japaneselawtranslation.go.jp/ja/laws/view/3494', type: 'government', label: '日本法令外国語訳DBシステム（法務省）— 民法 第94条 虚偽表示' },
      { url: 'https://ja.wikibooks.org/wiki/民法第94条', type: 'reference', label: 'Wikibooks 民法第94条 — 条文・第三者・類推適用の解説' },
    ],
  },
  {
    id: 'infosoc-society-spectacle',
    discipline: 'information-sociology',
    title: 'スペクタクルの社会',
    statement:
      'フランスの思想家ギー・ドゥボールが『スペクタクルの社会』(1967)で提示した、高度資本主義社会への批判概念。スペクタクルとは単なる映像・イメージの集積ではなく、「イメージによって媒介された人々の社会関係」そのものを指す。この社会では、直接生きられていたすべてが表象（イメージ・見世物）へと遠ざかり、生は能動的体験から受動的な「見ること」へ置き換えられる。商品・消費・マスメディアのイメージが日常生活を組織・支配し、人々は労働や生から疎外された受動的観客＝消費者となる。' +
      'ドゥボールはこれをマルクスの商品の物神性・物象化・疎外論を映像／広告／テレビの時代へ展開した最新の疎外形態と位置づけた。彼はシチュアシオニスト・インターナショナルの中心人物であり、本書は1968年五月革命やその後のメディア・消費社会批判の重要な参照点となった。メディアイベントやシミュラークルとは別概念である。',
    keyFigures: 'ギー・ドゥボール（Guy Debord、提唱者・シチュアシオニスト・インターナショナル中心人物）／初出：著書『スペクタクルの社会（La Société du spectacle）』(1967)',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Situationist-International', type: 'reference', label: 'Encyclopædia Britannica — Situationist International（ドゥボールと『スペクタクルの社会』）' },
      { url: 'https://www.britannica.com/biography/Guy-Debord', type: 'reference', label: 'Encyclopædia Britannica — Guy Debord（伝記・La Société du spectacle 1967）' },
      { url: 'https://www.marxists.org/reference/archive/debord/society.htm', type: 'reference', label: 'Guy Debord, The Society of the Spectacle（原典テーゼ全文・Marxists Internet Archive）' },
      { url: 'https://www.historicalmaterialism.org/article/an-introduction-to-guy-debords-the-society-of-the-spectacle/', type: 'academic', label: 'Historical Materialism — An Introduction to Guy Debord’s The Society of the Spectacle（査読系学術誌）' },
    ],
  },
  {
    id: 'econ-human-capital',
    discipline: 'economics',
    title: '人的資本論',
    statement:
      '教育・訓練・経験・健康などへの投資によって人が身につける知識・技能を「資本（人的資本）」とみなし、それが将来の生産性と所得を高めるとする労働経済学の理論。教育を単なる消費ではなく、授業料や訓練期間中の逸失所得という費用を払って将来の高い収益（賃金上昇）を得る「投資」として捉える点が核心である。' +
      '訓練は、転職しても価値を持つ汎用的な「一般的訓練」（市場で評価されるため費用は労働者が負担しがち）と、特定企業でのみ有用な「企業特殊的訓練」（離職リスクゆえ費用を労使で分担）に区別される。この投資収益率の枠組みは、ミンサー方程式（log賃金を教育年数と経験年数の二次関数で説明）として実証分析に定着し、賃金格差や経済成長の理解の基礎となった。学歴を能力の「合図」とみなすシグナリング理論とは、教育が生産性自体を高めるか否かで論争があるが、別概念として並立する。',
    keyFigures: 'ゲーリー・ベッカー（Gary Becker, 『Human Capital』1964 で体系化、1992年ノーベル経済学賞）／セオドア・シュルツ（Theodore Schultz, 1960年代初頭に概念を提唱・定着、1979年ノーベル経済学賞）／ヤコブ・ミンサー（Jacob Mincer, 『Schooling, Experience, and Earnings』1974、ミンサー方程式）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nber.org/books-and-chapters/human-capital-theoretical-and-empirical-analysis-special-reference-education-first-edition', type: 'academic', label: 'NBER — Gary Becker, Human Capital: A Theoretical and Empirical Analysis (初版書誌)' },
      { url: 'https://www.britannica.com/money/wage/Human-capital-theory', type: 'reference', label: 'Encyclopædia Britannica（Money）— Wage: Human-capital theory' },
      { url: 'https://en.wikipedia.org/wiki/Mincer_earnings_function', type: 'reference', label: 'Wikipedia — Mincer earnings function（教育年数・経験の二次関数によるlog賃金モデル）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1992/press-release/', type: 'government', label: 'The Nobel Prize — 1992年経済学賞 ゲーリー・ベッカー 公式プレスリリース' },
    ],
  },
  {
    id: 'econ-search-matching',
    discipline: 'economics',
    title: 'サーチ理論／マッチング理論',
    statement:
      '取引相手を見つけるのに時間・費用（探索摩擦＝search friction）がかかる市場、とくに労働市場を分析する枠組み。求職者と求人は即座にはマッチせず、失業者数 u と欠員（未充足求人）数 v から成立する雇用件数（フロー）を表す「マッチング関数 M(u, v)」を中核に置く。これにより失業（求職中）と欠員が同時に併存する状態が内生的に説明され、両者の負の相関であるベバリッジ曲線の理論的基礎を与える。' +
      '実現したマッチの余剰（surplus）は労使で分け合い、賃金は事後的なナッシュ交渉（Nash bargaining）で決定される。均衡はベバリッジ曲線と雇用創出曲線の交点で与えられ、労働者の交渉力が効率的水準を満たすホシオス条件も導かれる。摩擦的失業や労働市場の動学を分析する標準的（workhorse）モデルとなっている。',
    keyFigures: 'ピーター・A・ダイアモンド（Peter A. Diamond, MIT）／デール・T・モーテンセン（Dale T. Mortensen, Northwestern）／クリストファー・A・ピサリデス（Christopher A. Pissarides, LSE）の Diamond–Mortensen–Pissarides（DMP）モデル／三氏は「探索摩擦のある市場の分析」により2010年ノーベル経済学賞を共同受賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/uploads/2018/06/advanced-economicsciences2010.pdf', type: 'government', label: 'Royal Swedish Academy of Sciences, “Markets with Search Frictions” (Scientific Background, 2010 Prize)' },
      { url: 'https://www.nber.org/news/peter-diamond-dale-t-mortensen-and-christopher-pissarides-shared-2010-nobel-prize-research-job', type: 'academic', label: 'NBER — Diamond, Mortensen & Pissarides Shared 2010 Nobel Prize for Research on Job Search and Labor Market Frictions' },
      { url: 'https://economics.mit.edu/sites/default/files/inline-files/Lectures%2011-13%20-%20Search,%20Matching%20and%20Unemployment_2.pdf', type: 'academic', label: 'MIT 14.661 Labor Economics — Lectures 11–13: Search, Matching and Unemployment' },
      { url: 'https://en.wikipedia.org/wiki/Search-and-matching_theory', type: 'reference', label: 'Wikipedia — Search-and-matching theory' },
    ],
  },
  {
    id: 'mgmt-work-engagement',
    discipline: 'management',
    title: 'ワーク・エンゲージメント',
    statement:
      'ワーク・エンゲージメントとは、仕事に関連するポジティブで充実した心理状態であり、活力（vigor）・熱意（dedication）・没頭（absorption）の3次元で特徴づけられる。活力は高い水準のエネルギーと精神的回復力、仕事に努力を注ぐ意欲、困難に直面しても粘り強く取り組む姿勢を指す。熱意は仕事への強い関与と、意義・誇り・挑戦・着想の感覚を伴う。没頭は仕事への深い集中と幸福な没入で、時間が速く過ぎ仕事から離れがたくなる状態を指す。' +
      'バーンアウト（燃え尽き）の肯定的な対極に位置づけられ、UWES（ユトレヒト・ワーク・エンゲージメント尺度）で測定される。仕事の要求度－資源（JD-R）モデルでは、仕事の資源・個人資源がエンゲージメントを高めると説明される。一時的なフロー体験とは異なり、特定の対象・出来事に限定されない持続的・全般的な状態である点が要点である。',
    keyFigures: 'ウィルマー・シャウフェリ（Wilmar Schaufeli）が中心となり提唱／初出: Schaufeli, Salanova, González-Romá & Bakker (2002)「The Measurement of Engagement and Burnout」Journal of Happiness Studies 3, 71-92／JD-Rモデルの主要発展: Arnold B. Bakker・Evangelia Demerouti',
    asOf: '2026-06',
    sources: [
      { url: 'https://link.springer.com/article/10.1023/A:1015630930326', type: 'academic', label: 'Schaufeli et al. (2002) The Measurement of Engagement and Burnout, Journal of Happiness Studies（初出・査読論文／Springer）' },
      { url: 'https://www.wilmarschaufeli.nl/publications/Schaufeli/Test%20Manuals/Test_manual_UWES_English.pdf', type: 'academic', label: 'UWES Utrecht Work Engagement Scale Preliminary Manual（Schaufeli & Bakker、提唱者本人による公式尺度マニュアル）' },
      { url: 'https://www.annualreviews.org/content/journals/10.1146/annurev-orgpsych-120920-053933', type: 'academic', label: 'Bakker & Demerouti, Job Demands–Resources Theory: Ten Years Later, Annual Review of Organizational Psychology（査読総説）' },
      { url: 'https://en.wikipedia.org/wiki/Work_engagement', type: 'reference', label: 'Work engagement — Wikipedia' },
    ],
  },
  {
    id: 'human-attribution-theory',
    discipline: 'human-science',
    title: '帰属理論',
    statement:
      '人が自分や他者の行動・出来事の原因をどのように推論し説明するかを扱う社会心理学の理論群。原因を行為者内部に帰する「内的（性格・能力・努力）帰属」と、外部に帰する「外的（状況・運・課題の難易度）帰属」を区別する点が基盤となる。フリッツ・ハイダーが人を「素朴な科学者」とみなす素朴心理学として原型を示し、ハロルド・ケリーは合意性・弁別性・一貫性の3情報から原因を推論する共変動モデルを定式化、バーナード・ワイナーは原因を所在・安定性・統制可能性の3次元で捉え、成功・失敗の原因帰属が感情や達成動機づけを左右することを示した。' +
      '基本的帰属の錯誤や公正世界仮説など個別現象の母体となる上位の枠組みである。',
    keyFigures: 'フリッツ・ハイダー（Fritz Heider, 1958『対人関係の心理学』で素朴心理学として原型を提示）／ハロルド・ケリー（Harold Kelley, 1967 共変動モデル：合意性・弁別性・一貫性）／バーナード・ワイナー（Bernard Weiner, 達成帰属理論：所在・安定性・統制可能性の3次元）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Attribution_(psychology)', type: 'reference', label: 'Attribution (psychology) — Wikipedia' },
      { url: 'https://en.wikipedia.org/wiki/Covariation_model', type: 'reference', label: 'Covariation model (Kelley) — Wikipedia' },
      { url: 'https://www.simplypsychology.org/attribution-theory.html', type: 'reference', label: 'Attribution Theory in Psychology: Definition & Examples — SimplyPsychology' },
      { url: 'https://link.springer.com/chapter/10.1007/978-3-658-21742-6_59', type: 'academic', label: 'Heider (1958): The Psychology of Interpersonal Relations — Springer Nature' },
    ],
  },
  {
    id: 'bizlaw-employer-liability',
    discipline: 'business-law',
    title: '使用者責任（民法715条）',
    statement:
      '使用者責任とは、ある事業のために他人（被用者）を使用する者（使用者）が、被用者がその事業の執行について第三者に加えた損害を賠償する責任である（民法715条1項本文）。被用者自身の不法行為（709条）の成立を前提に、利益を得る者が損失も負担すべきとする報償責任、及び危険責任の原理に基づき、責任を使用者へ拡張する制度。成立要件は、(1)使用関係の存在、(2)「事業の執行について」なされたこと（判例＝外形標準説）、(3)被用者に709条の不法行為が成立すること。' +
      '使用者が選任・監督に相当の注意をしたとき等は免責されうるが（1項ただし書）、実務上免責はほぼ認められない。被害者は被用者と使用者の双方に請求できる（不真正連帯）。使用者が賠償した場合は被用者に求償できるが（3項）、判例は信義則上これを制限し、被用者から使用者への逆求償も認める（最判令和2年2月28日）。',
    keyFigures: '根拠条文＝民法715条（1項本文・ただし書／2項代理監督者／3項求償権）／前提＝被用者の709条不法行為の成立／原理＝報償責任・危険責任／要件＝使用関係・事業の執行について（外形標準説）・被用者の不法行為／責任関係＝使用者と被用者の不真正連帯／求償＝3項（判例は信義則上制限・逆求償も肯定）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号、law id 129AC0000000089）第715条' },
      { url: 'https://www.ritsumei.ac.jp/acd/cg/law/lex/21-56/040wadashinichi.pdf', type: 'academic', label: '和田真一「民法715条における使用者の負担部分――最判令和2年2月28日判決に関する覚書」立命館法学' },
      { url: 'https://corporate.vbest.jp/columns/2238/', type: 'media', label: 'ベリーベスト法律事務所「使用者責任（民法715条）とは？要件や損害賠償責任を負う範囲」' },
    ],
  },
  {
    id: 'econ-statistical-discrimination',
    discipline: 'economics',
    title: '統計的差別',
    statement:
      '雇用主などが個人の生産性を直接観察できない情報の不完全性のもとで、その個人が属する集団（人種・性別など）の平均的特性や統計的傾向を手がかりに個人を評価・選別することで生じる差別。利潤最大化を図る合理的主体が不確実性を補う過程で発生する点が特徴で、偏見・嫌悪に基づくゲーリー・ベッカーの「嗜好に基づく差別（taste-based discrimination）」とは区別される。' +
      'エドマンド・フェルプス（1972）は集団間に外生的な平均生産性の差が（誤って）認識される情報的理由から、ケネス・アロー（1973）は均衡が自己成就する調整失敗（coordination failure）から、差別が生じうることを示した。アローのモデルでは、差別を予期した集団が教育・技能への投資意欲を下げ、その結果生産性が実際に低下してさらに差別が正当化されるという格差の固定・再生産（自己成就的予言）が論じられる。',
    keyFigures: 'エドマンド・フェルプス（Edmund S. Phelps, 1972「The Statistical Theory of Racism and Sexism」, American Economic Review）／ケネス・アロー（Kenneth J. Arrow, 1973「The Theory of Discrimination」）／対比概念の提唱者ゲーリー・ベッカー（Gary Becker, 1957 嗜好に基づく差別）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Statistical_discrimination_(economics)', type: 'reference', label: 'Wikipedia「Statistical discrimination (economics)」（Arrow=調整失敗／Phelps=情報モデルの区別、taste-basedとの対比）' },
      { url: 'https://ideas.repec.org/a/aea/aecrev/v62y1972i4p659-61.html', type: 'academic', label: 'RePEc/IDEAS — Phelps, E.S. (1972) “The Statistical Theory of Racism and Sexism”, American Economic Review 62(4):659-661' },
      { url: 'https://ocw.mit.edu/courses/14-662-labor-economics-ii-spring-2015/4d0a285f3797277f1d67cf3a9e3416d6_MIT14_662S15_lec_slides19.pdf', type: 'academic', label: 'MIT OpenCourseWare 14.662 Labor Economics II「Discrimination: Theory」（taste-based vs. statistical の講義スライド）' },
      { url: 'https://academic.oup.com/ej/article/131/637/2018/5899046', type: 'academic', label: 'The Economic Journal (Oxford Academic)「A characterisation of “Phelpsian” statistical discrimination」（査読論文）' },
    ],
  },
  {
    id: 'econ-life-cycle-hypothesis',
    discipline: 'economics',
    title: 'ライフサイクル仮説',
    statement:
      '人々は現在の所得だけでなく生涯にわたって得られる所得（生涯所得）を見越して消費・貯蓄を計画し、消費水準を生涯を通じて平準化（consumption smoothing）しようとするとする消費理論。所得の低い若年期には借入を行い、所得の高い勤労期には貯蓄して資産を蓄積し、所得が途絶える引退後にはその資産を取り崩して消費を維持する。この結果、年齢に応じて貯蓄率が山型（hump-shaped）を描く貯蓄行動が説明される。' +
      '消費は各時点の所得ではなく生涯所得の現在価値を制約条件とする効用最大化計画によって決まると考える点で、現在所得に依存するとしたケインズの絶対所得仮説を批判・発展させたもの。フリードマンの恒常所得仮説と並ぶ消費理論の柱であり、マクロの貯蓄・資産形成や年金・人口動態の分析に応用される。',
    keyFigures: 'フランコ・モディリアーニ（Franco Modigliani）／リチャード・ブランバーグ（Richard Brumberg）／アルバート・安藤（Albert Ando）／初出：Modigliani & Brumberg (1954)／モディリアーニは1985年ノーベル経済学賞受賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1985/modigliani/facts/', type: 'government', label: 'NobelPrize.org — 1985年経済学賞（Franco Modigliani、ライフサイクル仮説に対する公式授賞理由）' },
      { url: 'https://www.nobelprize.org/uploads/2018/06/modigliani-lecture.pdf', type: 'government', label: 'Franco Modigliani, Nobel Lecture “Life Cycle, Individual Thrift and the Wealth of Nations” (1985)' },
      { url: 'https://www.britannica.com/money/life-cycle-theory-explained', type: 'reference', label: 'Encyclopædia Britannica — “What Is the Life-Cycle Theory in Economics?”（Modigliani & Brumberg 1954、消費平準化、山型）' },
    ],
  },
  {
    id: 'mgmt-psychological-contract',
    discipline: 'management',
    title: '心理的契約',
    statement:
      '心理的契約（psychological contract）とは、従業員と組織（雇用者）の間に存在する、明文化されていない相互の義務・期待についての、従業員側の主観的な信念を指す。給与・雇用保障・昇進機会・能力開発などをめぐり「会社はこうしてくれるはず」「自分はこう貢献する」といった、互恵的交換関係に基づく暗黙の約束として認知される。内容に応じて、金銭的・短期的・限定的な義務からなる「取引的契約（transactional）」と、忠誠・長期雇用・情緒的サポートを含む「関係的契約（relational）」に類型化される。' +
      '従業員がこの契約を組織に破られた（違反された）と認知すると（心理的契約の違反 breach/violation）、信頼の低下、職務満足や組織コミットメントの低下、離職意図の増大といった負の反応が生じる。組織コミットメントや公平理論とは区別される独立した概念である。',
    keyFigures: 'デニス・M・ルソー（Denise M. Rousseau, 1989年に現代的に再定義・体系化、取引的／関係的の類型化）／初期の概念的言及：クリス・アージリス（1960）／ハリー・レビンソン／エドガー・シャイン／違反研究：Robinson & Morrison (2000)',
    asOf: '2026-06',
    sources: [
      { url: 'https://link.springer.com/article/10.1007/BF01384942', type: 'academic', label: 'Rousseau, D. M. (1989). Psychological and implied contracts in organizations. Employee Responsibilities and Rights Journal, 2, 121–139.（Springer／一次文献）' },
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1744-6570.2007.00087.x', type: 'academic', label: 'Zhao, H. et al. (2007). The Impact of Psychological Contract Breach on Work-Related Outcomes: A Meta-Analysis. Personnel Psychology (Wiley／査読メタ分析)' },
      { url: 'https://en.wikipedia.org/wiki/Psychological_contract', type: 'reference', label: 'Psychological contract — Wikipedia' },
    ],
  },
  {
    id: 'human-stereotype-threat',
    discipline: 'human-science',
    title: 'ステレオタイプ脅威',
    statement:
      '人が、自分の属する集団についての否定的なステレオタイプ（例「女性は数学が苦手」「特定人種は学力が低い」）を意識する状況で、それを自ら裏づけてしまうことへの不安・プレッシャーが生じ、本来の能力を発揮できずパフォーマンスが低下する現象。クロード・スティールとジョシュア・アロンソンが1995年（JPSP誌）にアフリカ系アメリカ人学生の難度の高い言語能力テストを用い、「能力診断的」と告げた条件でのみ成績が低下することを実証した。' +
      '機序としては、不安・自己監視・否定的思考の抑制がワーキングメモリ（実行機能）を占有・消耗させ、課題遂行に必要な認知資源を奪うとされる（Schmader & Johns 2003 ほか）。なお近年は再現性をめぐる議論があり、メタ分析では出版バイアスや効果量の誇張、地域差（欧州誌で大、北米誌で小）が指摘され、効果の頑健性については中立的評価が続いている。',
    keyFigures: 'Claude M. Steele（クロード・スティール）／Joshua Aronson（ジョシュア・アロンソン）／初出：Steele & Aronson (1995), Journal of Personality and Social Psychology, 69(5), 797-811',
    asOf: '2026-06',
    sources: [
      { url: 'https://nyuscholars.nyu.edu/en/publications/stereotype-threat-and-the-intellectual-test-performance-of-africa', type: 'academic', label: 'NYU Scholars — Steele & Aronson (1995) 原著の大学公式書誌レコード' },
      { url: 'https://journals.sagepub.com/doi/10.1177/0963721409359292', type: 'academic', label: 'Schmader (2010) “Stereotype Threat Deconstructed”, Current Directions in Psychological Science（WM機序）' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11268653/', type: 'academic', label: 'PLOS One／PMC — ステレオタイプ脅威メタ分析（出版バイアス・効果量・再現性議論）' },
    ],
  },
  {
    id: 'bizlaw-standard-terms',
    discipline: 'business-law',
    title: '定型約款（民法548条の2）',
    statement:
      '定型約款とは、ある特定の者が不特定多数の者を相手方として行う取引（定型取引）であって、その内容の全部又は一部が画一的であることが双方にとって合理的なものについて、契約の内容とすることを目的としてその者により準備された条項の総体をいう（保険約款・預金規定・通信約款・各種利用規約等）。2020年4月1日施行の平成29年改正民法で新設された制度で、民法548条の2〜548条の4が規律する。' +
      '定型取引を行う合意があり、かつ定型約款を契約内容とする旨の合意をしたとき、又は定型約款を準備した者があらかじめその定型約款を契約の内容とする旨を相手方に表示していたときは、個別の条項についても合意したものとみなされる（みなし合意、548条の2第1項）。ただし相手方の権利を制限し義務を加重する条項であって、信義則に反して相手方の利益を一方的に害すると認められる不当条項は、合意をしなかったものとみなされる（同条2項）。約款内容の表示（548条の3）・一定要件下での約款変更（548条の4）も定める。',
    keyFigures: '根拠条文＝民法548条の2〜548条の4（平成29年改正で新設）／施行日＝2020年4月1日／定義＝不特定多数を相手方とする画一的取引が双方に合理的な「定型取引」のために準備された条項の総体／みなし合意（548条の2第1項）／不当条項規制（548条の2第2項）／内容の表示（548条の3）・約款の変更（548条の4）／典型例＝保険約款・預金規定・通信約款・各種利用規約',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号、law id 129AC0000000089）第548条の2〜第548条の4' },
      { url: 'https://www.zenginkyo.or.jp/fileadmin/res/abstract/affiliate/kinpo/kinpo2016_2_5.pdf', type: 'academic', label: '山田誠一「定型約款に関する規定（548条の2、548条の3）について」金融法務研究会（全国銀行協会）' },
      { url: 'https://www.businesslawyers.jp/practices/1093', type: 'media', label: 'BUSINESS LAWYERS「民法改正により新設された定型約款とは」' },
    ],
  },
  {
    id: 'infosoc-collective-memory',
    discipline: 'information-sociology',
    title: '集合的記憶',
    statement:
      '集合的記憶（collective memory／集団的記憶）とは、記憶を個人の脳内だけの営みではなく、家族・宗教集団・社会階級・国民といった集団によって共有され、社会的枠組み（cadres sociaux／social frameworks）の中で構築・想起されるものとして捉える概念である。フランスの社会学者モーリス・アルヴァックスが、デュルケームの集合表象論を継承して1925年『記憶の社会的枠組み』で定式化した。彼は「人は決して独りで想起するのではない」とし、個人の記憶もまた所属集団の枠組みに依存すると論じた。' +
      '集団は記念・儀礼・記念碑・メディアを通じて過去を再構成し、現在の集団アイデンティティを支える。後にピエール・ノラの「記憶の場（lieux de mémoire）」、ヤン・アスマンの「文化的記憶／コミュニケーション的記憶」へと展開し、デジタル・メディア時代の記憶（コネクティブ・メモリ）研究にもつながっている。メディアイベント・スペクタクル論とは別概念。',
    keyFigures: 'モーリス・アルヴァックス（Maurice Halbwachs, 1877-1945）が提唱、初出は『記憶の社会的枠組み』（Les cadres sociaux de la mémoire, 1925）／エミール・デュルケーム（集合表象の源流）／『集合的記憶』（La mémoire collective, 1950年遺著）／ピエール・ノラ（記憶の場）／ヤン・アスマン（文化的記憶）',
    asOf: '2026-06',
    sources: [
      { url: 'https://press.uchicago.edu/ucp/books/book/chicago/O/bo3619875.html', type: 'academic', label: 'Maurice Halbwachs, On Collective Memory (ed./tr. Lewis A. Coser), University of Chicago Press' },
      { url: 'https://www.ebsco.com/research-starters/psychology/collective-memory', type: 'reference', label: 'Collective Memory — EBSCO Research Starters' },
      { url: 'https://en.wikipedia.org/wiki/Collective_memory', type: 'reference', label: 'Collective memory — Wikipedia (Halbwachs, Nora, Assmann)' },
    ],
  },
  {
    id: 'econ-endogenous-growth',
    discipline: 'economics',
    title: '内生的成長理論',
    statement:
      '長期の経済成長率を、ソローモデルのようにモデル外から与えられる外生的な技術進歩（全要素生産性）ではなく、経済システム内部の要因――研究開発（R&D）・知識・人的資本・イノベーション――によって内生的に決定されるものとして説明する成長理論。新成長理論とも呼ばれる。知識や技術には非競合性（同じアイデアを多数が同時に利用できる）とスピルオーバー（波及効果）があり、社会全体で収穫逓増を生む。' +
      'このため、資本蓄積の収穫逓減によって定常状態に収束し成長が止まるとしたソローモデルと異なり、R&D投資への利潤誘因を通じて持続的な内生的成長が可能になると論じる。教育・研究開発・知識普及を促す政策が長期成長率そのものを高めうる点に政策的含意がある。',
    keyFigures: 'ポール・ローマー（Paul Romer）／初出 “Increasing Returns and Long-Run Growth” (Journal of Political Economy, 1986)・“Endogenous Technological Change” (JPE, 1990)／ロバート・ルーカス（Robert Lucas）“On the Mechanics of Economic Development” (1988、人的資本)／ローマーは2018年ノーベル経済学賞（ノードハウスと共同）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Endogenous_growth_theory', type: 'reference', label: 'Endogenous growth theory — Wikipedia' },
      { url: 'https://www.econlib.org/library/Enc/bios/Romer.html', type: 'reference', label: 'Paul M. Romer — The Concise Encyclopedia of Economics (Econlib)' },
      { url: 'https://www-leland.stanford.edu/~chadj/RomerNobel.pdf', type: 'academic', label: 'Charles I. Jones, “Paul Romer: Ideas, Nonrivalry, and Endogenous Growth” (Stanford University, Nobel解説論文)' },
      { url: 'https://www.sciencedirect.com/topics/economics-econometrics-and-finance/endogenous-growth-model', type: 'academic', label: 'Endogenous Growth Model — overview, ScienceDirect Topics（Elsevier）' },
    ],
  },
  {
    id: 'econ-inclusive-institutions',
    discipline: 'economics',
    title: '包摂的制度と収奪的制度',
    statement:
      '国家間の経済発展の格差を、地理や文化ではなく「政治・経済制度の質」によって説明する枠組み。広範な人々の参加（多元主義）・財産権の保護・公正な競争・法の支配・技術革新へのインセンティブを保障する「包摂的制度（inclusive institutions）」は持続的な成長と繁栄を促す。一方、少数のエリートが富と権力を独占し多数派を経済活動から排除・搾取する「収奪的制度（extractive institutions）」は、創造的破壊を恐れるため長期的成長を阻む。' +
      '包摂的な政治制度と経済制度は相互に補強し合い、収奪的制度も同様に自己強化的に持続する点が特徴である。ダロン・アセモグルとジェイムズ・ロビンソンが著書『国家はなぜ衰退するのか（Why Nations Fail）』(2012)で展開した。',
    keyFigures: '提唱者: ダロン・アセモグル（Daron Acemoglu, MIT）／ジェイムズ・A・ロビンソン（James A. Robinson, シカゴ大学）／初出（一般向け）: 『国家はなぜ衰退するのか（Why Nations Fail）』2012／実証的背景: “The Colonial Origins of Comparative Development”, AER 2001／3名は2024年ノーベル経済学賞を受賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2024/press-release/', type: 'government', label: 'The Sveriges Riksbank Prize in Economic Sciences 2024 — Press release（制度と繁栄の研究）' },
      { url: 'https://www.aeaweb.org/articles?id=10.1257/aer.91.5.1369', type: 'academic', label: 'Acemoglu, Johnson & Robinson, “The Colonial Origins of Comparative Development”, AER 91(5):1369–1401 (2001)' },
      { url: 'https://news.mit.edu/2024/mit-economists-daron-acemoglu-simon-johnson-nobel-prize-economics-1014', type: 'academic', label: 'MIT economists Daron Acemoglu and Simon Johnson share Nobel Prize (2024)' },
      { url: 'https://www.wcfia.harvard.edu/publications/why-nations-fail', type: 'academic', label: 'Why Nations Fail (Acemoglu & Robinson, 2012) — Harvard WCFIA publication record' },
    ],
  },
  {
    id: 'mgmt-experiential-learning',
    discipline: 'management',
    title: '経験学習（コルブの経験学習サイクル）',
    statement:
      'デイビッド・コルブが1984年の著書『Experiential Learning』で体系化した、経験を通じた学習の理論。学習を「経験を変換することを通じて知識が創造される過程」と定義し、4段階の循環サイクルで捉える：(1)具体的経験（Concrete Experience＝新たな経験をする）、(2)内省的観察（Reflective Observation＝経験を多面的に振り返る）、(3)抽象的概念化（Abstract Conceptualization＝教訓・持論など一般原理を引き出す）、(4)能動的実験（Active Experimentation＝得た概念を新しい状況で試す）。' +
      '学習者は任意の段階から循環に入りうる。デューイ・レヴィン・ピアジェの影響を受ける。コルブはこの4段階の組合せから4つの学習スタイル（拡散・同化・収束・適応）も導いた。企業の人材育成・研修や経験からの学びを支える理論的基盤として広く用いられる。',
    keyFigures: 'デイビッド・A・コルブ（David A. Kolb）／初出：D. A. Kolb (1984)『Experiential Learning: Experience as the Source of Learning and Development』, Prentice Hall／理論的源流：ジョン・デューイ、クルト・レヴィン、ジャン・ピアジェ',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Kolb%27s_experiential_learning', type: 'reference', label: 'Kolb’s experiential learning — Wikipedia（4段階・4スタイル・デューイ/レヴィン/ピアジェの影響）' },
      { url: 'https://www.torontomu.ca/experiential-learning/faculty-staff/kolbs-el-cycle/', type: 'academic', label: 'Kolb’s Experiential Learning Cycle — Toronto Metropolitan University（大学公式）' },
      { url: 'https://citt.it.ufl.edu/resources/course-development/the-learning-process/types-of-learners/kolbs-four-stages-of-learning/', type: 'academic', label: 'Kolb’s Four Stages of Learning — University of Florida CITT（大学公式）' },
    ],
  },
  {
    id: 'human-legitimate-peripheral-participation',
    discipline: 'human-science',
    title: '正統的周辺参加と実践共同体',
    statement:
      '人類学者ジーン・レイヴと計算機科学者エティエンヌ・ウェンガーが1991年の著書『状況に埋め込まれた学習』で提唱した状況的学習論の中心概念。学習を、個人の頭の中への知識の伝達・蓄積として捉えるのではなく、「実践共同体（community of practice）」への参加の度合いが深まっていく社会的過程として捉える。新参者（newcomer）は、まず共同体の周辺的だが正統な（legitimate）役割で参加し（正統的周辺参加）、単純で低リスクだが共同体の目的に資する仕事を通じて語彙・課題・組織原理を習得する。' +
      'やがて参加はより中心的になり、十全的参加（full participation）へと移行して熟練した古参（old-timer）となる。この過程は同時に共同体内でのアイデンティティの形成・再構築でもある。仕立屋・助産師・酒断ち中の者などの徒弟的実践の分析がその基礎をなす。',
    keyFigures: 'ジーン・レイヴ（Jean Lave、人類学者）／エティエンヌ・ウェンガー（Etienne Wenger）／初出: Lave & Wenger (1991)「Situated Learning: Legitimate Peripheral Participation」, Cambridge University Press',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.cambridge.org/highereducation/books/situated-learning/6915ABD21C8E4619F750A4D4ACA616CD', type: 'academic', label: 'Lave & Wenger, Situated Learning: Legitimate Peripheral Participation — Cambridge University Press（一次文献）' },
      { url: 'https://en.wikipedia.org/wiki/Legitimate_peripheral_participation', type: 'reference', label: 'Legitimate peripheral participation — Wikipedia' },
      { url: 'https://infed.org/dir/welcome/jean-lave-etienne-wenger-and-communities-of-practice/', type: 'reference', label: 'Jean Lave, Etienne Wenger and communities of practice — infed.org（成人教育系の解説リファレンス）' },
    ],
  },
  {
    id: 'bizlaw-state-liability',
    discipline: 'business-law',
    title: '国家賠償（国家賠償法1条・2条）',
    statement:
      '国又は公共団体の活動によって私人に生じた損害を、国・公共団体が賠償する責任を定める制度。憲法17条（何人も、公務員の不法行為により損害を受けたときは法律の定めにより国又は公共団体に賠償を求めうる）を受け、昭和22年制定の国家賠償法（昭和22年法律第125号）が具体化する。1条は公権力の行使に当たる公務員が職務を行うについて故意又は過失によって違法に他人に損害を加えた場合の責任（公権力責任）を、2条は道路・河川その他の公の営造物の設置又は管理の瑕疵によって損害を生じた場合の責任（営造物責任）を定める。' +
      '1条では公務員個人は原則として被害者に直接責任を負わず国・公共団体が責任を負い、公務員に故意又は重大な過失があるとき国等は当該公務員に求償できる（1条2項）。2条の営造物責任は無過失責任とされる。民法上の使用者責任や一般不法行為とは別個の、公法上の賠償制度である。',
    keyFigures: '憲法17条を受けた実施法＝国家賠償法（昭和22年法律第125号、e-Gov法令ID 322AC0000000125）／1条＝公権力責任（公務員の故意・過失による違法な加害／公務員個人は原則直接責任を負わず国等が負担・故意重過失時に求償＝1条2項）／2条＝営造物責任（公の営造物の設置・管理の瑕疵。無過失責任）／民法の使用者責任・一般不法行為とは別個の公法上の制度',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000125', type: 'government', label: 'e-Gov法令検索「国家賠償法」（昭和22年法律第125号、法令ID 322AC0000000125）' },
      { url: 'https://ja.wikibooks.org/wiki/国家賠償法第1条', type: 'reference', label: 'Wikibooks「国家賠償法第1条」（条文・公務員個人責任・求償の解説）' },
      { url: 'https://ja.wikipedia.org/wiki/日本国憲法第17条', type: 'reference', label: 'Wikipedia「日本国憲法第17条」（国家賠償請求権と国家賠償法の制定根拠）' },
    ],
  },
  {
    id: 'infosoc-self-presentation',
    discipline: 'information-sociology',
    title: '自己呈示とドラマトゥルギー（ゴッフマン）',
    statement:
      '社会学者アーヴィング・ゴッフマンが『行為と演技―日常生活における自己呈示』（The Presentation of Self in Everyday Life、1956年スコットランド初版／1959年米国版）で展開した、対面的相互行為の分析枠組み。日常の相互行為を演劇になぞらえる「ドラマトゥルギー（演劇論的アプローチ）」を用い、人は他者の前で望ましい印象を与えるよう自己を演出する「役者（performer）」であり、他者はその「観客（audience）」であると捉える。この自己演出の営みを「印象操作（印象管理、impression management）」と呼ぶ。' +
      'ゴッフマンは、観客に見せる演技の領域である「表舞台（front stage）」と、素の自分に戻り演技を準備・休息できる「舞台裏（back stage）」を区別した。人は相手や状況に応じて異なる役を演じ分ける。今日ではSNS上のプロフィール管理やオンラインでの自己呈示の分析にも広く応用されている。',
    keyFigures: 'アーヴィング・ゴッフマン（Erving Goffman、提唱者）／初出『行為と演技―日常生活における自己呈示』（The Presentation of Self in Everyday Life、1956年初版・1959年米国版）／関連概念：ドラマトゥルギー・印象操作（impression management）・表舞台/舞台裏（front/back stage）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Erving-Goffman', type: 'reference', label: 'Encyclopædia Britannica「Erving Goffman | Symbolic Interactionism, Dramaturgy & Stigma」' },
      { url: 'https://en.wikipedia.org/wiki/The_Presentation_of_Self_in_Everyday_Life', type: 'reference', label: 'Wikipedia「The Presentation of Self in Everyday Life」（1956/1959刊行・MacIver賞）' },
      { url: 'https://open.ncl.ac.uk/theories/17/self-presentation-theory/', type: 'academic', label: 'Newcastle University TheoryHub「Self-Presentation Theory」' },
      { url: 'https://journals.muni.cz/mujlt/article/view/11836', type: 'academic', label: 'Masaryk University Journal of Law and Technology（査読論文）「Goffman’s Theory as a Framework for Analysis of Self Presentation on Online Social Networks」' },
    ],
  },
  {
    id: 'econ-incomplete-contracts',
    discipline: 'economics',
    title: '不完備契約理論',
    statement:
      '現実の契約は、将来起こりうるあらゆる事態をあらかじめ書き尽くすことができない（不完備である）という前提に立つ契約理論。ある状況が契約に明記されていない、または立証不能で裁判所が執行できない場合、事後的な再交渉が必要となり、関係特殊投資をした側が足元を見られて利益を奪われる「ホールドアップ問題」が生じ、その予見から事前の投資が過少になる。' +
      'グロスマン＝ハート＝ムーア（GHM）の所有権アプローチ（財産権理論）は、契約で全てを規定できないからこそ、契約に書かれていない事態における決定権＝残余コントロール権を誰が持つかが重要になり、それは物的資産の「所有権（誰が企業・資産を保有するか）」によって決まると論じた。所有構造が投資インセンティブを左右するため、所有権の配分が企業の境界（統合か市場取引か）を決定する。取引費用理論やコースの定理とは別概念で、残余コントロール権・資産所有に着目する点が特徴。',
    keyFigures: 'サンフォード・グロスマン（Sanford Grossman）／オリバー・ハート（Oliver Hart）／ジョン・ムーア（John Moore）／初出：Grossman & Hart (1986) JPE 94: 691–719、Hart & Moore (1990) JPE 98: 1119–1158／ハートは2016年ノーベル経済学賞（ホルムストロームと共同）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2016/popular-information/', type: 'government', label: 'NobelPrize.org「The Prize in Economic Sciences 2016 — Contract Theory」（Hart・Holmström）' },
      { url: 'https://hart.scholars.harvard.edu/publications/property-rights-and-nature-firm', type: 'academic', label: 'Harvard University — Oliver Hart「Property Rights and the Nature of the Firm」(Hart & Moore 1990, JPE 98:1119–1158)' },
      { url: 'https://ideas.repec.org/a/ucp/jpolec/v94y1986i4p691-719.html', type: 'academic', label: 'IDEAS/RePEc — Grossman & Hart「The Costs and Benefits of Ownership」(JPE 1986, 94:691–719)' },
      { url: 'https://en.wikipedia.org/wiki/Incomplete_contracts', type: 'reference', label: 'Wikipedia「Incomplete contracts」(GHM 所有権アプローチ・残余コントロール権・ホールドアップ)' },
    ],
  },
  {
    id: 'mgmt-job-crafting',
    discipline: 'management',
    title: 'ジョブ・クラフティング',
    statement:
      '従業員が与えられた職務を受け身でこなすのではなく、自らの主体性により仕事の境界・内容・人間関係・意味づけを能動的に作り変え、仕事をより自分にとって意義あるもの・やりがいあるものにしていく行動。エイミー・レズネスキーとジェーン・ダットンが2001年の論文（Academy of Management Review）で概念化した。3つの形態があり、(1)タスク・クラフティング（業務の範囲・やり方を変える）、(2)関係性クラフティング（職場の人間関係の質・量を変える）、(3)認知的クラフティング（仕事の意味・捉え方を変える）からなる。' +
      '後にティムズとバッカーにより、仕事の要求度－資源（JD-R）モデルの枠組みで、従業員が自ら仕事の資源を増やし要求度を調整する行動として再概念化された。ワーク・エンゲージメントや職務満足の向上と関連する。職務特性モデルが組織側の職務設計を扱うのに対し、本概念は従業員自身による個人レベルの職務再設計を扱う別概念である。',
    keyFigures: 'Amy Wrzesniewski（エイミー・レズネスキー）／Jane E. Dutton（ジェーン・ダットン）／初出: Wrzesniewski & Dutton (2001)「Crafting a Job: Revisioning Employees as Active Crafters of Their Work」, Academy of Management Review／JD-Rでの再概念化: Tims & Bakker',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.aom.org/doi/10.5465/amr.2001.4378011', type: 'academic', label: 'Wrzesniewski & Dutton (2001)「Crafting a Job」, Academy of Management Review（米国経営学会）' },
      { url: 'https://en.wikipedia.org/wiki/Job_crafting', type: 'reference', label: 'Wikipedia「Job crafting」— 概念定義・3形態・JD-R再概念化' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9441671/', type: 'academic', label: 'JD-R・ジョブ・クラフティング・ワーク・エンゲージメント実証研究（PubMed Central）' },
    ],
  },
  {
    id: 'human-optimism-bias',
    discipline: 'human-science',
    title: '楽観バイアス',
    statement:
      '人が、自分にとって望ましい出来事（成功・健康・長寿）は他者より起こりやすく、望ましくない出来事（病気・事故・離婚・依存症）は他者より起こりにくいと、客観的根拠なく見積もる認知的傾向。「非現実的楽観主義」とも呼ばれ、文化・性別・年齢を超えて広く観察され（人口の約8割に見られるが、うつ状態の人では弱い）、本人が自覚しにくい点に特徴がある。' +
      'リスクの過小評価（喫煙・無防備な行動）を生み、悪い結果につながりうる一方、適度な楽観は動機づけや精神的健康に資する面もある。脳神経科学的には、良い情報で強く信念を更新し悪い情報では更新が乏しいという「更新の非対称性」がその維持を支える。確証バイアスや計画錯誤とは関連するが別概念。',
    keyFigures: 'ニール・ワインスタイン（Neil D. Weinstein, 1980「Unrealistic optimism about future life events」JPSP 誌で実証的に提唱）／タリ・シャロット（Tali Sharot, Korn & Dolan 2011, Nature Neuroscience：良い情報を選択的に取り込む信念更新の非対称性という脳神経科学的基盤を示す）',
    asOf: '2026-06',
    sources: [
      { url: 'https://pubmed.ncbi.nlm.nih.gov/21983684/', type: 'academic', label: 'Sharot, T., Korn, C.W. & Dolan, R.J. (2011) How unrealistic optimism is maintained in the face of reality. Nature Neuroscience 14, 1475-1479（PubMed, PMID 21983684）' },
      { url: 'https://cancercontrol.cancer.gov/brp/research/constructs/optimistic-bias', type: 'government', label: '“Optimistic Bias” — U.S. National Cancer Institute（NIH/NCI）構成概念解説' },
      { url: 'https://en.wikipedia.org/wiki/Optimism_bias', type: 'reference', label: 'Optimism bias — Wikipedia（定義・別称・約80%の有病率・神経生理学的基盤）' },
    ],
  },
  {
    id: 'bizlaw-revocation-litigation',
    discipline: 'business-law',
    title: '取消訴訟（行政事件訴訟法）',
    statement:
      '取消訴訟は、行政事件訴訟法（昭和37年法律第139号）が定める抗告訴訟（3条1項）の中心的な類型で、行政庁の違法な処分や裁決の取消しを求める訴訟をいう。具体的には、行政庁の公権力の行使に当たる処分の取消しを求める「処分の取消しの訴え」（3条2項）と、審査請求その他の不服申立てに対する裁決等の取消しを求める「裁決の取消しの訴え」（3条3項）からなる。' +
      '提起には、処分性のある対象、原告適格（取消しを求めるにつき法律上の利益を有する者、9条）、出訴期間（処分があったことを知った日から6か月、処分の日から1年、14条）、被告適格（原則として処分庁の所属する国・公共団体、11条。2004年改正で変更）などの訴訟要件を満たす必要がある。出訴によって処分の効力は当然には止まらず（執行不停止の原則、25条）、取消判決には第三者効（32条）・拘束力（33条）がある。国家賠償（金銭的救済）とは別個の、行政処分そのものを排除する救済手段である。',
    keyFigures: '根拠法＝行政事件訴訟法（昭和37年法律第139号、e-Gov法令ID 337AC0000000139）／類型＝処分の取消しの訴え（3条2項）＋裁決の取消しの訴え（3条3項）・抗告訴訟（3条1項）の一類型／原告適格＝法律上の利益を有する者（9条）／出訴期間＝知った日から6か月・処分の日から1年（14条）／被告適格＝原則 国・公共団体（11条）／執行不停止の原則（25条）／取消判決の第三者効（32条）・拘束力（33条）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/337AC0000000139', type: 'government', label: 'e-Gov法令検索「行政事件訴訟法（昭和37年法律第139号、法令ID 337AC0000000139）」' },
      { url: 'https://www.moj.go.jp/content/000103905.pdf', type: 'government', label: '法務省「平成16年改正行政事件訴訟法の概要」（9条・11条・14条の改正点）' },
      { url: 'https://ja.wikipedia.org/wiki/行政事件訴訟法', type: 'reference', label: 'Wikipedia「行政事件訴訟法」（制度全体の概観）' },
    ],
  },
  {
    id: 'infosoc-profiling',
    discipline: 'information-sociology',
    title: 'プロファイリングと自動意思決定',
    statement:
      'プロファイリングとは、個人データを自動的に処理し、その人の経済状況・健康・嗜好・関心・行動・位置・労働遂行能力・信頼性などの個人的側面を評価・予測・分類する営みである。EU一般データ保護規則（GDPR）4条4号はこれを「自然人に関する一定の個人的側面を評価するための個人データの自動処理」と定義し、22条はもっぱら自動化された処理（プロファイリングを含む）のみに基づき法的効果またはそれに準ずる重大な影響を生じさせる決定に服さない権利を定める。' +
      '論点は、透明性・説明責任、差別やバイアスの再生産、ブラックボックス化、フィルターバブルなどで、信用スコアリングや採用選考が典型例とされる。日本でも改正個人情報保護法のいわゆる3年ごと見直しでプロファイリング規律が継続的に議論されている。',
    keyFigures: 'GDPR 4条4号＝プロファイリングの定義（評価目的の自動処理）／GDPR 22条＝もっぱら自動化された決定に服さない権利・例外（明示的同意／契約履行に必要／加盟国法の授権）と安全措置（人間の関与・意見表明・異議申立て）／ミレイユ・ヒルデブラント（Mireille Hildebrandt, VUB／Radboud）＝プロファイリングと法の支配・データ駆動社会のガバナンス論／論点＝差別・バイアスの再生産、ブラックボックス、フィルターバブル',
    asOf: '2026-06',
    sources: [
      { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02016R0679-20160504', type: 'government', label: 'Regulation (EU) 2016/679 (GDPR) consolidated text — Art. 4(4) / Art. 22, EUR-Lex' },
      { url: 'https://www.dataprotection.ie/en/individuals/know-your-rights/your-rights-relation-automated-decision-making-including-profiling', type: 'government', label: 'Your rights in relation to automated decision making, including profiling (Art. 22) — Irish Data Protection Commission' },
      { url: 'https://journals.sagepub.com/doi/10.1177/2053951716679679', type: 'academic', label: 'Mittelstadt et al. (2016) “The ethics of algorithms: Mapping the debate”, Big Data & Society' },
      { url: 'https://en.wikipedia.org/wiki/Mireille_Hildebrandt', type: 'reference', label: 'Mireille Hildebrandt — profiling, automated decision-making and the rule of law' },
    ],
  },
  {
    id: 'econ-mechanism-design',
    discipline: 'economics',
    title: 'メカニズムデザイン',
    statement:
      '各参加者が自分だけが知る私的情報を持ち戦略的に行動する状況で、効率的な資源配分・公共財供給・取引・投票など望ましい社会的結果を実現するように、ゲームのルール（メカニズム＝配分と支払いの規則）そのものを目的から逆算して設計するゲーム理論の一分野。通常のゲーム理論が所与のルールでの均衡を分析するのに対し、結果を先に定めてルールを設計するため「逆向きのゲーム理論（reverse game theory）」とも呼ばれる。' +
      '鍵となるのは、参加者が真の選好を正直に申告することが最適となる「誘因両立性（incentive compatibility）」と、参加が棄権より得になる「個人合理性」を満たすルールの探索である。「表明原理（revelation principle）」により、任意のメカニズムは正直申告を最適とする直接メカニズムで再現でき、設計対象を絞り込める。オークション設計・規制・公共財供給・マッチング市場などに広く応用される。',
    keyFigures: 'レオニード・ハーヴィッツ（Leonid Hurwicz、1960年代に分野を創始し誘因両立性の概念を導入）／エリック・マスキン（Eric Maskin、遂行理論／implementation theory）／ロジャー・マイヤーソン（Roger Myerson、表明原理・最適オークション理論）／3名は2007年ノーベル経済学賞を共同受賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2007/9276-mechanism-design-theory/', type: 'government', label: 'NobelPrize.org — Mechanism Design Theory（2007年経済学賞 公式解説）' },
      { url: 'https://en.wikipedia.org/wiki/Mechanism_design', type: 'reference', label: 'Wikipedia — Mechanism design（逆向きのゲーム理論・誘因両立性・表明原理）' },
      { url: 'https://cepr.org/voxeu/columns/nobel-prize-what-mechanism-design-and-why-does-it-matter-policy-making', type: 'academic', label: 'CEPR / VoxEU — What is mechanism design and why does it matter for policy-making?' },
      { url: 'https://www.nobelprize.org/uploads/2018/06/advanced-economicsciences2007.pdf', type: 'government', label: 'ノーベル賞委員会 学術背景文書「Mechanism Design Theory」（専門解説PDF）' },
    ],
  },
  {
    id: 'econ-okuns-law',
    discipline: 'economics',
    title: 'オーカンの法則',
    statement:
      '失業率と実質GDP（産出）の間に観察される負の経験的関係を表すマクロ経済学の経験則。代表的な「ギャップ版」では、失業率が自然失業率（完全雇用水準）から1パーセントポイント上昇すると、実質GDPは潜在GDPを約2〜3％（米国では概ね2％程度）下回るとされる。「差分版」は失業率の変化と実質GDP成長率の変化を対応づける。1947〜1960年の米国四半期データに基づきアーサー・オーカンが1962年に提示した。' +
      'これは厳密な構造的・物理的法則ではなく統計的な経験則・近似であり、オーカン係数は国・時代・景気局面によって異なり安定的ではないという限界がある。また潜在GDPや自然失業率は観測不能で推定値に依存し、失業率だけでは労働参加率や労働時間など労働市場の緩みを十分に捉えられない点も指摘される。景気循環と労働市場の関係分析やGDPギャップの推定に用いられる。',
    keyFigures: '提唱者: アーサー・M・オーカン（Arthur M. Okun、米国の経済学者、ケネディ政権の経済諮問委員会CEA）／初出: 1962年（米国1947〜1960年の四半期データに基づく研究）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Okuns-Law', type: 'reference', label: 'Encyclopædia Britannica — “Okun’s Law”' },
      { url: 'https://en.wikipedia.org/wiki/Okun%27s_law', type: 'reference', label: 'Wikipedia — “Okun’s law”（ギャップ版/差分版・係数2〜3の解説）' },
      { url: 'https://www.clevelandfed.org/publications/economic-commentary/2012/ec-201208-an-unstable-okuns-law-not-the-best-rule-of-thumb', type: 'government', label: 'Federal Reserve Bank of Cleveland — “An Unstable Okun’s Law”（係数の不安定性）' },
      { url: 'https://www.nber.org/system/files/working_papers/w18668/w18668.pdf', type: 'academic', label: 'Laurence M. Ball et al., “Okun’s Law: Fit at Fifty?” NBER Working Paper No. 18668' },
    ],
  },
  {
    id: 'mgmt-sensemaking',
    discipline: 'management',
    title: 'センスメイキング',
    statement:
      '人々（とくに組織のメンバー）が、曖昧で不確実な状況に直面したときに、起こっていることへ意味を与え、納得のいく解釈や物語を作り上げ、それに基づいて行動していく継続的な過程。カール・ワイクが体系化し、(1)アイデンティティの構築に根ざす、(2)回顧的（事後的に意味づける）、(3)有意味な環境を自ら作り出す（イナクトメント）、(4)社会的、(5)継続的、(6)抽出された手がかりに焦点化する、(7)正確さより尤もらしさ（plausibility）を重視する、という7つの特性を挙げた。' +
      'マン・ガルチ火災やテネリフェ空港事故など、危機下でセンスメイキングが崩壊する過程の分析でも知られる。限定合理性や組織学習とは区別される独立した概念である。',
    keyFigures: 'カール・E・ワイク（Karl E. Weick）が体系化／初出：著書『Sensemaking in Organizations』（Sage, 1995年）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Karl_Weick', type: 'reference', label: 'Karl E. Weick — Wikipedia（提唱者・7特性・1995年著書）' },
      { url: 'https://link.springer.com/rwe/10.1007/978-3-031-25984-5_539', type: 'reference', label: 'Sense Making, Organizational — Springer Nature リファレンス' },
      { url: 'https://journals.aom.org/doi/10.5465/amj.2005.15993111', type: 'academic', label: 'The Social Processes of Organizational Sensemaking — Academy of Management Journal（査読論文）' },
    ],
  },
  {
    id: 'human-locus-of-control',
    discipline: 'human-science',
    title: '統制の所在（ローカス・オブ・コントロール）',
    statement:
      '人が、自分の身に起こる出来事や行動の結果（報酬・罰）の原因を、どこに帰属させるかという、一般化された統制期待を表すパーソナリティ特性。結果を自分の能力・努力・行動など内的な要因に帰し、自らコントロールできると考える傾向を「内的統制（internal locus of control）」、運・運命・偶然・他者・状況など自分の外にある要因に帰すると考える傾向を「外的統制（external locus of control）」と呼ぶ。' +
      'ジュリアン・B・ロッター（Julian B. Rotter）が社会的学習理論の枠組みで概念化し、1966年に測定尺度（I-E尺度）を発表した。内的統制傾向は学業成績・職業的達成・健康行動・ストレス対処などとの関連が報告されている。帰属理論や自己効力感とは区別される、状況横断的に一般化された統制期待というパーソナリティ次元である。',
    keyFigures: 'ジュリアン・B・ロッター（Julian B. Rotter）／社会的学習理論の枠組みで概念化／初出: Rotter, J. B. (1966)「Generalized expectancies for internal versus external control of reinforcement」, Psychological Monographs, 80(1), 1-28（I-E尺度を発表）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/rotters-internal-external-locus-control-scale', type: 'reference', label: 'Encyclopedia.com（International Encyclopedia of the Social Sciences）: Rotter’s Internal-External Locus of Control Scale' },
      { url: 'https://psych.fullerton.edu/jmearns/rotter.htm', type: 'academic', label: 'California State University, Fullerton（J. Mearns）: The Social Learning Theory of Julian B. Rotter' },
      { url: 'https://link.springer.com/referenceworkentry/10.1007/978-3-319-24612-3_41', type: 'reference', label: 'Springer, Encyclopedia of Personality and Individual Differences: Locus of Control' },
      { url: 'https://en.wikipedia.org/wiki/Locus_of_control', type: 'reference', label: 'Wikipedia: Locus of control（一次文献 Rotter 1966 の書誌情報を含む）' },
    ],
  },
  {
    id: 'bizlaw-administrative-guidance',
    discipline: 'business-law',
    title: '行政指導（行政手続法）',
    statement:
      '行政指導とは、行政機関がその任務又は所掌事務の範囲内において一定の行政目的を実現するため特定の者に一定の作為又は不作為を求める指導・勧告・助言その他の行為であって、処分に該当しないものをいう（行政手続法2条6号）。法的拘束力を持たず、相手方の任意の協力によってのみ実現される点に本質的特徴がある（32条1項）。' +
      '行政手続法は、相手方が指導に従わなかったことを理由とする不利益な取扱いの禁止（32条2項）、申請に関連する行政指導での権利行使妨害の禁止（33条）、許認可等の権限に関連する行政指導での留意事項（34条）、趣旨・内容・責任者の明示と書面交付などの方式（35条）を定める。許認可行政を補完する、日本の行政運営に特徴的な非権力的手法である。取消訴訟・国家賠償等とは別概念。',
    keyFigures: '根拠法＝行政手続法（平成5年法律第88号、e-Gov法令ID 405AC0000000088）／定義＝2条6号（処分に該当しない指導・勧告・助言）／一般原則＝32条1項（所掌事務の範囲内・任意の協力のみで実現）／不利益取扱いの禁止＝32条2項／申請関連の権利行使妨害の禁止＝33条／許認可等の権限に関連する行政指導の留意事項＝34条／方式（趣旨・内容・責任者の明示）＝35条／法的拘束力なし・任意性が核心',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/gyoukan/kanri/tetsuzukihou/gaiyou.html', type: 'government', label: '総務省 行政手続法の概要（所管官庁による制度解説）' },
      { url: 'https://laws.e-gov.go.jp/law/405AC0000000088', type: 'government', label: 'e-Gov法令検索 行政手続法（平成5年法律第88号、法令ID 405AC0000000088）' },
      { url: 'https://ja.wikipedia.org/wiki/行政手続法', type: 'reference', label: 'Wikipedia「行政手続法」（条文構成・2014年改正の概観）' },
    ],
  },
  {
    id: 'infosoc-information-theory',
    discipline: 'information-sociology',
    title: '情報理論（シャノン）',
    statement:
      '情報の量を数学的に定義し、通信における情報の伝送・圧縮・誤り訂正の限界を論じる基礎理論。情報量はメッセージの不確実性の減少として捉えられ、確率に基づく「情報エントロピー（Shannon entropy）」で測られる。単位はビット（bit）。主要な成果として、(1)情報源符号化定理（無損失データ圧縮の限界は情報源のエントロピーで決まる）、(2)通信路符号化定理（雑音のある通信路でも、通信路容量 capacity 以下の伝送速度なら誤り確率をいくらでも小さくして伝送できる）がある。' +
      '情報源・送信機・通信路・受信機・雑音から成る通信モデルを提示した。意味内容ではなく確率的な情報量を扱う点が特徴で、現代のデジタル通信・データ圧縮・暗号・機械学習の基礎をなす。',
    keyFigures: 'クロード・シャノン（Claude E. Shannon）が提唱／初出は1948年の論文「A Mathematical Theory of Communication」（Bell System Technical Journal, vol.27, pp.379-423・623-656）',
    asOf: '2026-06',
    sources: [
      { url: 'https://onlinelibrary.wiley.com/doi/10.1002/j.1538-7305.1948.tb01338.x', type: 'academic', label: 'C. E. Shannon, “A Mathematical Theory of Communication,” Bell System Technical Journal, 27 (1948)（Wiley Online Library・原典）' },
      { url: 'https://www.britannica.com/science/information-theory', type: 'reference', label: 'Encyclopædia Britannica — Information theory（定義・歴史・通信モデル）' },
      { url: 'https://en.wikipedia.org/wiki/Shannon%27s_source_coding_theorem', type: 'reference', label: 'Wikipedia — Shannon’s source coding theorem（情報源符号化定理：圧縮限界=エントロピー）' },
      { url: 'https://www.britannica.com/biography/Claude-Shannon', type: 'reference', label: 'Encyclopædia Britannica — Claude Shannon（提唱者・情報理論の創始）' },
    ],
  },
  {
    id: 'econ-capability-approach',
    discipline: 'economics',
    title: '潜在能力アプローチ（ケイパビリティ・アプローチ）',
    statement:
      '人の福祉（well-being）や発展を、所得・財の量や効用（満足）ではなく、その人が実際に選び、なしうること・なりうることの幅で評価すべきだとする規範的枠組み。達成された状態や活動である「機能（functionings、例：栄養が足りている、健康である、教育を受けている、社会参加している）」と、達成可能な機能の組合せの集合＝「潜在能力（capability、実質的な自由・選択肢の幅）」を区別し、後者を評価の中心に置く。' +
      'これにより善き生の特定の型を押しつけず、各人が価値を見いだす生を選べる自由を重視する。功利主義（効用主義）やロールズの基本財アプローチを、人々の多様性と財を機能へ変換する能力の差を捉えられないとして批判する。国連開発計画（UNDP）の人間開発指数（HDI）の理論的基礎となった。',
    keyFigures: 'アマルティア・セン（Amartya Sen、提唱者、1979年タナー講義「Equality of What?」が初出、1998年ノーベル経済学賞）／マーサ・ヌスバウム（Martha Nussbaum、中心的な10の潜在能力のリストを示し発展）／マブーブ・ウル・ハク（Mahbub ul Haq、センと共にUNDPのHDIを開発）',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/capability-approach/', type: 'reference', label: 'The Capability Approach — Stanford Encyclopedia of Philosophy（スタンフォード大学、査読的リファレンス）' },
      { url: 'https://iep.utm.edu/sen-cap/', type: 'reference', label: 'Sen’s Capability Approach — Internet Encyclopedia of Philosophy（査読制百科事典）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1998/summary/', type: 'government', label: '1998年スウェーデン国立銀行賞（ノーベル経済学賞）受賞: Amartya Sen — NobelPrize.org（公式）' },
      { url: 'https://sen.scholars.harvard.edu/publications/equality-what', type: 'academic', label: 'Amartya Sen, “Equality of What?”（1979年タナー講義）— Harvard University' },
    ],
  },
  {
    id: 'econ-agency-theory',
    discipline: 'economics',
    title: 'エージェンシー理論（プリンシパル＝エージェント問題）',
    statement:
      'ある主体（プリンシパル＝依頼人、例：株主）が自己の利益のために別の主体（エージェント＝代理人、例：経営者）へ意思決定や行動を委任する関係を分析する理論。両者の利害が一致せず（利益相反）、かつプリンシパルがエージェントの行動を完全には観察・監視できない（情報の非対称性）ために、エージェントが自己利益を優先する問題が生じる。典型的には、契約後に行動を観察できない「モラルハザード（隠れた行動）」と、契約前にエージェントの質を見極められない「逆選択（隠れた情報）」が論点となる。' +
      'これを抑える監視（モニタリング）や成果連動報酬などのインセンティブ契約の設計、およびそれに伴う「エージェンシー・コスト」（監視コスト＋ボンディング・コスト＋残余損失）が中心テーマであり、所有と経営の分離を扱うコーポレートガバナンス論の理論的基礎をなす。',
    keyFigures: 'スティーブン・ロス（Stephen A. Ross, 1973「エージェンシーの経済理論」で概念を提示）／マイケル・ジェンセン & ウィリアム・メックリング（Jensen & Meckling, 1976、企業を「契約の束（nexus of contracts）」として定式化）／キャスリーン・アイゼンハート（Eisenhardt, 1989 が経営学的レビューとして整理）',
    asOf: '2026-06',
    sources: [
      { url: 'https://josephmahoney.web.illinois.edu/BA549_Fall%202012/Session%205/5_Jensen_Meckling%20(1976).pdf', type: 'academic', label: 'Jensen & Meckling (1976) “Theory of the Firm: Managerial Behavior, Agency Costs and Ownership Structure”, Journal of Financial Economics 3(4):305-360（原典PDF／イリノイ大学ホスト）' },
      { url: 'https://www.jstor.org/stable/258191', type: 'academic', label: 'Eisenhardt, K. M. (1989) “Agency Theory: An Assessment and Review,” Academy of Management Review 14(1):57-74（査読論文、JSTOR）' },
      { url: 'https://en.wikipedia.org/wiki/Principal%E2%80%93agent_problem', type: 'reference', label: 'Wikipedia「Principal–agent problem」— 定義・情報の非対称性・利益相反・解決策' },
    ],
  },
  {
    id: 'mgmt-situational-leadership',
    discipline: 'management',
    title: '状況的リーダーシップ理論',
    statement:
      '唯一最善のリーダーシップ・スタイルは存在せず、有効なスタイルは部下（フォロワー）の「発達度（成熟度＝当該課題に対する能力とコミットメント／意欲）」に応じて変えるべきだとする条件適合（コンティンジェンシー系）理論。リーダー行動を「指示的行動（タスク志向）」と「協労的・支援的行動（関係志向）」の2軸で捉え、部下の発達度D1〜D4に応じて、(1)指示型（Directing／Telling）、(2)コーチ型（Coaching／Selling）、(3)援助型（Supporting／Participating）、(4)委任型（Delegating）の4スタイルを使い分ける。能力・意欲が高まるほど指示を減らし権限委譲を増やす。' +
      '実務・研修で世界的に普及する一方、学術的には実証的支持が一貫せず、概念的曖昧さや理論的根拠の弱さを指摘する批判もあり、評価は中立的に見る必要がある。変革型リーダーシップ・PM理論・フィードラーのコンティンジェンシー理論とは別概念。',
    keyFigures: 'ポール・ハーシー（Paul Hersey）／ケン・ブランチャード（Ken Blanchard）が1969年に提唱／初出は “Life Cycle Theory of Leadership”（Training & Development Journal, 23, 26–34, 1969）で後に Situational Leadership に改称／後にハーシー版とブランチャード版（SLII）に分岐',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Situational_leadership_theory', type: 'reference', label: 'Wikipedia「Situational leadership theory」' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S104898439790014X', type: 'academic', label: 'Graeff, C. L. (1997) “Evolution of situational leadership theory: A critical review,” The Leadership Quarterly 8(2): 153–170（査読論文）' },
      { url: 'https://eric.ed.gov/?id=EJ004286', type: 'academic', label: 'Hersey & Blanchard (1969) “Life Cycle Theory of Leadership,” Training & Development Journal 23: 26–34（ERIC 収録の初出論文書誌）' },
    ],
  },
  {
    id: 'human-kohlberg-moral-development',
    discipline: 'human-science',
    title: 'コールバーグの道徳性発達理論',
    statement:
      '人間の道徳的判断は、年齢と認知発達に伴って一定の順序で段階的に発達するとする理論。判断の結論（何を選ぶか）ではなく、その「理由づけ＝推論の構造」に着目する点が最大の特徴で、「ハインツのジレンマ」など道徳的ジレンマへの回答を分析して定式化された。発達は3水準6段階から成る。(I)前慣習的水準＝①罰と服従への志向、②道具的・互恵的（道具的相対主義）志向。(II)慣習的水準＝③対人関係の調和「良い子」志向、④法と秩序の維持志向。(III)後慣習的・脱慣習的水準＝⑤社会契約・功利的志向、⑥普遍的な倫理的原理の志向（到達する人は稀とされる）。' +
      'キャロル・ギリガンは、原標本が男性のみで「正義」を偏重する男性中心的モデルだと批判し、関係性と責任を重視する「ケアの倫理」を対置した。',
    keyFigures: 'ローレンス・コールバーグ（Lawrence Kohlberg）が提唱（1958年の博士論文で定式化、ジャン・ピアジェの道徳判断・認知発達論を継承・拡張）／批判：キャロル・ギリガン（Carol Gilligan、「ケアの倫理」）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/Lawrence-Kohlbergs-stages-of-moral-development', type: 'reference', label: 'Encyclopaedia Britannica — Lawrence Kohlberg’s stages of moral development' },
      { url: 'https://www.britannica.com/biography/Lawrence-Kohlberg', type: 'reference', label: 'Encyclopaedia Britannica — Lawrence Kohlberg (biography)' },
      { url: 'https://en.wikipedia.org/wiki/Lawrence_Kohlberg%27s_stages_of_moral_development', type: 'reference', label: 'Wikipedia — Lawrence Kohlberg’s stages of moral development' },
      { url: 'https://courses.lumenlearning.com/suny-lifespandevelopment/chapter/kohlbergs-stages-of-moral-development/', type: 'academic', label: 'Lumen Learning (SUNY) — Kohlberg’s Stages of Moral Development' },
    ],
  },
  {
    id: 'bizlaw-administrative-execution',
    discipline: 'business-law',
    title: '行政代執行（行政代執行法）',
    statement:
      '行政代執行とは、法律により直接命じられ、又は法律に基づき行政庁が命じた「代替的作為義務」（他人が代わってなしうる義務。例：違法建築物の除却、土地の原状回復）を義務者が履行しない場合に、行政庁が自ら義務者のなすべき行為をなし、又は第三者にこれをなさしめ、その費用を義務者から徴収する制度であり、行政上の強制執行の一手段である。一般法として行政代執行法（昭和23年法律第43号）が要件・手続を定める。' +
      '同法2条は代執行の要件として、(1)代替的作為義務の不履行、(2)他の手段によってその履行を確保することが困難であること、(3)その不履行を放置することが著しく公益に反すると認められること、を要求する。手続は、相当の履行期限を定めた文書による戒告（3条1項）→代執行令書による通知（3条2項）→代執行の実施を経て、費用は義務者から徴収でき、徴収は国税滞納処分の例による（5条・6条）。非代替的作為義務（退去義務等）や不作為義務には、特別の法律の定めがない限り用いることができない。',
    keyFigures: '一般法＝行政代執行法（昭和23年法律第43号／e-Gov law id 323AC0000000043）／2条の3要件：代替的作為義務の不履行・他の手段による履行確保が困難・不履行の放置が著しく公益に反する／対象は「代替的作為義務」のみ（非代替的作為義務・不作為義務は対象外）／手続：戒告（3条1項）→代執行令書（3条2項）→実施／費用は義務者から徴収・国税滞納処分の例による（5条・6条）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/323AC0000000043', type: 'government', label: 'e-Gov法令検索 行政代執行法（昭和23年法律第43号、法令ID 323AC0000000043）' },
      { url: 'https://www.rilg.or.jp/htdocs/uploads/r4_gyoseidaisikko_01.pdf', type: 'academic', label: '宇那木正寛（鹿児島大学）「行政代執行制度の基本と実務」地方自治研究機構' },
      { url: 'https://ja.wikipedia.org/wiki/行政代執行法', type: 'reference', label: 'Wikipedia「行政代執行法」' },
    ],
  },
  {
    id: 'infosoc-media-literacy',
    discipline: 'information-sociology',
    title: 'メディア・リテラシー',
    statement:
      'テレビ・新聞・広告・インターネット・SNS など各種メディアが伝える情報を、受け身で鵜呑みにせず批判的に分析・評価し、「誰が・何の目的で・どう構成して発信しているか」というメディアの仕組みを理解したうえで、自らも責任をもって情報を発信・活用できる能力を指す。核心には「メディアは現実をそのまま映すのではなく構成（representation）されたものだ」という見方があり、メッセージは非透明（non-transparent）であるという認識に立つ。' +
      '米国の NAMLE は「アクセス・分析・評価・創造・行動（access, analyze, evaluate, create, act）」の能力として整理する。ユネスコは情報リテラシーと統合した「メディア情報リテラシー（MIL）」として推進し、フェイクニュース・誤情報対策や民主主義参加の基盤としても重視される。',
    keyFigures: 'レン・マスターマン（Len Masterman）：『Teaching the Media』(1980年代)でメディア教育を体系化、中心概念を「表象/構成（representation）」とした／デイヴィッド・バッキンガム（David Buckingham）：メディア言語・表象・制度・オーディエンスの4つの鍵概念／NAMLE（全米メディアリテラシー教育協会）：「アクセス・分析・評価・創造・行動」の5能力／ユネスコ：メディア情報リテラシー（MIL）として推進',
    asOf: '2026-06',
    sources: [
      { url: 'https://namle.org/resources/media-literacy-defined/', type: 'academic', label: 'NAMLE（全米メディアリテラシー教育協会）「Media Literacy Defined」— access/analyze/evaluate/create/act の定義' },
      { url: 'https://www.unesco.org/en/articles/media-and-information-literacy-critical-approach-literacy-digital-world', type: 'government', label: 'UNESCO「Media and Information Literacy, a critical approach to literacy in the digital world」— MIL の定義と統合的枠組み' },
      { url: 'https://files.eric.ed.gov/fulltext/EJ1046521.pdf', type: 'academic', label: 'Pungente 他「The Core Concepts: Fundamental to Media Literacy」— マスターマンの representation／non-transparency 概念の解説（ERIC）' },
      { url: 'https://en.wikipedia.org/wiki/Media_literacy', type: 'reference', label: 'Wikipedia「Media literacy」— 概念・歴史・主要論者の概観' },
    ],
  },
  {
    id: 'econ-rawls-justice',
    discipline: 'economics',
    title: 'ロールズの正義論（公正としての正義）',
    statement:
      'アメリカの哲学者ジョン・ロールズが1971年の著書『正義論（A Theory of Justice）』で展開した、社会の基本構造における分配的正義の理論。「公正としての正義（justice as fairness）」を掲げ、功利主義に代わる社会契約論的な正義原理を導く。人々が自分の地位・才能・価値観を知らない「無知のヴェール（veil of ignorance）」に覆われた「原初状態（original position）」で、合理的な当事者が合意するであろう原理として、(1)平等な基本的自由の原理（各人が他者と両立する最大限の平等な基本的自由をもつ）、(2)社会的・経済的不平等は、公正な機会均等のもとで、かつ最も不遇な人々の最大の便益になる場合にのみ許されるとする格差原理（マキシミン的推論）を提示した。' +
      '第1原理は第2原理に対し、また公正な機会均等は格差原理に対し辞書式に優先する（自由の優先）。ロバート・ノージックは『アナーキー・国家・ユートピア』（1974）で権原理論・最小国家の立場から格差原理を批判した。厚生・分配を扱う経済学および政治哲学の基礎文献。',
    keyFigures: 'ジョン・ロールズ（John Rawls, 提唱者）／初出: 『正義論（A Theory of Justice）』1971年／批判: ロバート・ノージック（Robert Nozick）『アナーキー・国家・ユートピア』1974年',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/original-position/', type: 'reference', label: 'Stanford Encyclopedia of Philosophy — “Original Position”（原初状態・無知のヴェール・公正としての正義）' },
      { url: 'https://plato.stanford.edu/entries/rawls/', type: 'reference', label: 'Stanford Encyclopedia of Philosophy — “John Rawls”' },
      { url: 'https://iep.utm.edu/rawls/', type: 'reference', label: 'Internet Encyclopedia of Philosophy — “John Rawls”（1971年刊行・二原理の正確な定式）' },
      { url: 'https://www.ebsco.com/research-starters/literature-and-writing/theory-justice-john-rawls', type: 'reference', label: 'EBSCO Research Starters — “A Theory of Justice by John Rawls”（二原理・マキシミン・辞書式優先）' },
    ],
  },
  {
    id: 'econ-emissions-trading',
    discipline: 'economics',
    title: '排出権取引（キャップ・アンド・トレード）',
    statement:
      '環境汚染物質（とくに温室効果ガスCO2）の排出総量に上限（キャップ）を設定し、その範囲内で排出枠（許可証 allowance、通常1枠＝1トン）を企業・施設に配分したうえで、枠を市場で売買（トレード）できるようにする、市場メカニズムを用いた環境政策手段。削減コストの低い主体は多く削減して余った枠を売り、削減コストの高い主体は枠を買うため、各主体の限界削減費用が市場価格に均等化し、社会全体の削減費用を最小化しつつ排出総量を上限内に抑える。' +
      '外部性（汚染）に価格を付けるカーボンプライシングの代表的手法で、ピグー税（炭素税）と並ぶ。理論的にはコースの定理（外部性は財産権の設定と取引で内部化できる）やクロッカー(1966)・デイルズ(J. H. Dales, 1968)の譲渡可能排出許可の構想に由来する。EUの排出量取引制度（EU-ETS、2005年開始）が代表例で、世界初の大規模炭素市場とされる。',
    keyFigures: 'J. H. デイルズ(1968)：譲渡可能排出許可の構想を定式化（先駆としてT. D. クロッカー1966）／R. コース：コースの定理（財産権設定と取引による外部性の内部化）／二要素：排出上限(cap)＋取引可能な排出枠(allowance)／効果：限界削減費用の均等化で総削減費用を最小化／カーボンプライシングの一種・炭素税(ピグー税)と並ぶ／代表例：EU-ETS（2005年開始）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.epa.gov/emissions-trading/what-emissions-trading', type: 'government', label: 'U.S. Environmental Protection Agency (EPA) — What Is Emissions Trading?' },
      { url: 'https://www.c2es.org/content/cap-and-trade-basics/', type: 'reference', label: 'Center for Climate and Energy Solutions (C2ES) — Cap and Trade Basics' },
      { url: 'https://economics.mit.edu/sites/default/files/2022-09/Emissions%20Trading%20in%20the%20United%20States.pdf', type: 'academic', label: 'Ellerman & Joskow (MIT) — Emissions Trading in the United States（クロッカー1966・デイルズ1968の構想を解説）' },
      { url: 'https://en.wikipedia.org/wiki/Emissions_trading', type: 'reference', label: 'Wikipedia — Emissions trading（cap and trade の定義・コースの定理との関係）' },
    ],
  },
  {
    id: 'mgmt-ocb',
    discipline: 'management',
    title: '組織市民行動（OCB）',
    statement:
      '組織市民行動（Organizational Citizenship Behavior, OCB）とは、従業員が正式な職務記述書では求められておらず、公式の報酬システムによって直接的・明示的には評価・報酬されないにもかかわらず、自発的（discretionary）に行い、総体として組織の効率的・効果的な機能を促進する行動を指す。Organ（1988）が用いた古典的定義に基づく。代表的に5次元が知られる――同僚を助ける「愛他主義（altruism）」、不平を言わず困難に耐える「スポーツマンシップ」、最低要件を超え誠実に務める「良心性（conscientiousness）」、他者への影響に配慮し問題を未然に防ぐ「礼儀正しさ（courtesy）」、組織活動へ積極的に関与する「市民道徳（civic virtue）」。' +
      '職務満足・組織コミットメント・組織的公正（公正知覚）と正の関連を持ち、組織の生産性・凝集性を高めるとされる。Borman & Motowidlo の「文脈的パフォーマンス（contextual performance）」とも近接する概念である。',
    keyFigures: 'デニス・オーガン（Dennis W. Organ）が1980年代に概念化／初出: Bateman & Organ (1983)「Job Satisfaction and the Good Soldier」で “citizenship behavior” を提示／Organ (1988) が5因子モデルとして体系化／測定尺度: Podsakoff et al. (1990)',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Organizational_citizenship_behavior', type: 'reference', label: 'Wikipedia — Organizational citizenship behavior' },
      { url: 'https://journals.aom.org/doi/10.5465/amc.2023.0002', type: 'academic', label: 'Academy of Management Collections — The Origin, Evolution, and Future of Organizational Citizenship Behavior（学会・査読）' },
      { url: 'https://journals.sagepub.com/doi/10.1177/014920630002600307', type: 'academic', label: 'Podsakoff et al. (2000), Journal of Management (SAGE) — OCB: A Critical Review（査読論文）' },
    ],
  },
  {
    id: 'human-undermining-effect',
    discipline: 'human-science',
    title: 'アンダーマイニング効果（過正当化効果）',
    statement:
      'それ自体が楽しくて行っていた（内発的に動機づけられていた）活動に対し、金銭などの外的報酬を与えると、かえってその活動への内発的動機づけが低下する現象。エドワード・デシが1971年のパズル課題（SOMA）実験で示し、マーク・レッパーらが1973年の幼児お絵描き実験で実証した。後者では「良い遊び賞（Good Player Award）」を約束された群が、報酬撤去後の自由遊びでの自発的お絵描きを約50%減らした一方、予期せず報酬を受けた群や無報酬群では減少しなかった。' +
      '機序は、自分の行動の原因を内的興味ではなく外的報酬に帰属させること（自己知覚・帰属理論）や、報酬が統制的に働き自律性（self-determination）の感覚を損なうこと（認知的評価理論）とされる。ただし予期されない報酬や、有能感を伝える情報的フィードバックとしての報酬では生じにくいなどの条件がある。',
    keyFigures: 'エドワード・デシ（Edward L. Deci, 1971, パズル課題による初出実証）／マーク・レッパー、デヴィッド・グリーン、リチャード・ニスベット（Lepper, Greene & Nisbett, 1973, 幼児お絵描き実験で「過正当化効果」を実証）／理論的基盤＝認知的評価理論（Deci & Ryan）・自己知覚理論（Bem, 1972）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Overjustification_effect', type: 'reference', label: 'Wikipedia「Overjustification effect」（Deci 1971・Lepper et al. 1973、認知的評価理論・自己知覚理論）' },
      { url: 'https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf', type: 'academic', label: 'Deci, Koestner & Ryan (1999) “A Meta-Analytic Review...”（University of Washington ホスト、Psychological Bulletin）' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5386788/', type: 'academic', label: 'PMC収載のレビュー論文（過正当化効果の定量的レビュー、Deci 1971・Lepper et al. 1973を引用）' },
    ],
  },
  {
    id: 'bizlaw-anonymized-info',
    discipline: 'business-law',
    title: '匿名加工情報・仮名加工情報（個人情報保護法）',
    statement:
      '個人情報保護法（個人情報の保護に関する法律、e-Gov法令ID 415AC0000000057）は、個人データの利活用と保護のバランスを図るため二類型の加工情報を定める。匿名加工情報（法第2条第6項、2015年改正で導入）は、特定の個人を識別できないように個人情報を加工し、かつ当該個人情報を復元できないようにした情報をいう。所定の加工基準・安全管理措置・公表等を条件に、本人同意なく第三者提供や目的外利用が可能となる。' +
      '仮名加工情報（法第2条第5項、2020年改正で新設・2022年4月施行）は、他の情報と照合しない限り特定の個人を識別できないように個人情報を加工した情報をいい、内部での分析・利活用を念頭に利用目的の変更制限が適用されない一方、原則として第三者提供は禁止される。両者は加工の程度・識別／非識別の水準・許容される利用範囲が異なる。所管は個人情報保護委員会（PPC）。',
    keyFigures: '匿名加工情報＝法第2条第6項・2015年改正で導入・特定個人を識別不可かつ復元不可・基準準拠加工と公表を条件に本人同意なく第三者提供／目的外利用が可能／仮名加工情報＝法第2条第5項・2020年改正で新設（2022年4月施行）・他の情報と照合しない限り識別不可・利用目的変更制限が不適用だが原則第三者提供は禁止／違い＝加工水準と許容される利用範囲（匿名＝外部提供向け／仮名＝内部分析向け）／所管＝個人情報保護委員会（PPC）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/415AC0000000057', type: 'government', label: 'e-Gov法令検索 個人情報の保護に関する法律（平成15年法律第57号、法令ID 415AC0000000057）第2条' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_anonymous/', type: 'government', label: '個人情報保護委員会 ガイドライン（仮名加工情報・匿名加工情報編）' },
      { url: 'https://www.ppc.go.jp/all_faq_index/faq1-q14-17/', type: 'government', label: '個人情報保護委員会 FAQ（仮名加工情報の第三者提供は原則不可）' },
    ],
  },
  {
    id: 'econ-two-sided-markets',
    discipline: 'economics',
    title: '両面市場（two-sided markets）',
    statement:
      '両面市場とは、プラットフォーム（仲介者）が相互に異なる2つ（以上）の利用者グループを引き合わせ、両グループ間の取引・相互作用を可能にする市場をいう。本質は「間接ネットワーク効果（クロスサイド・ネットワーク効果）」、すなわち一方のグループの参加・規模が他方のグループの便益を高める外部性が働く点にある。例として、クレジットカード（消費者と加盟店）、OS・ゲーム機（利用者と開発者）、新聞・検索（読者と広告主）、マッチングアプリ、ECモールが挙げられる。' +
      'プラットフォームは両側への価格を非対称に設計でき、一方を無料・赤字にして他方から回収できる。総価格水準だけでなく価格の配分（どちら側にどれだけ課金するか）が取引量を左右する「価格構造の非中立性」が特徴であり、この点が通常の市場と決定的に異なる。デジタル・プラットフォーム規制や独占禁止政策の論点となる。',
    keyFigures: 'ジャン＝シャルル・ロシェ（Jean-Charles Rochet）／ジャン・ティロール（Jean Tirole）／初出: Rochet & Tirole, “Platform Competition in Two-Sided Markets,” Journal of the European Economic Association, vol.1, no.4 (2003), pp.990-1029／ティロールは2014年ノーベル経済学賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/jeea/article-abstract/1/4/990/2280902', type: 'academic', label: 'Rochet & Tirole, “Platform Competition in Two-Sided Markets,” JEEA 1(4):990-1029 (2003) — Oxford Academic' },
      { url: 'https://www.oecd.org/content/dam/oecd/en/publications/reports/2009/12/two-sided-markets_39bffd74/1ab6f5f3-en.pdf', type: 'government', label: 'OECD Policy Roundtable, “Two-Sided Markets” (2009)' },
      { url: 'https://faculty.wcas.northwestern.edu/apa522/Two-Sided-Market-and-Network-Effects.pdf', type: 'academic', label: 'Belleflamme & Peitz, “Two-sided Markets, Pricing, and Network Effects”（Northwestern University 配布版）' },
      { url: 'https://en.wikipedia.org/wiki/Two-sided_market', type: 'reference', label: 'Wikipedia: Two-sided market' },
    ],
  },
  {
    id: 'econ-evolutionary-game-theory',
    discipline: 'economics',
    title: '進化ゲーム理論（ESS）',
    statement:
      '古典的ゲーム理論を、合理的意思決定主体ではなく生物集団における戦略（行動・形質）の頻度の進化・淘汰のダイナミクスへ応用した理論。プレイヤーの合理性ではなく、適応度（fitness＝利得）の高い戦略が自然選択により集団中で増えるという進化プロセスを扱う。中心概念は「進化的に安定な戦略（Evolutionarily Stable Strategy, ESS）」で、ある戦略が集団に広く行き渡っているとき、稀な突然変異の別戦略が侵入しても増殖できない（侵入者に対し有利である）戦略を指し、ナッシュ均衡の特殊な一形態にあたる。' +
      'タカ・ハト・ゲーム（Hawk-Dove game）が代表例で、動物の儀礼的闘争・性比・利他行動などの説明に用いられ、戦略頻度の変化を記述するレプリケーター・ダイナミクスとも結びつく。経済学・社会科学・学習理論にも応用される。',
    keyFigures: 'ジョン・メイナード・スミス（John Maynard Smith）／ジョージ・プライス（George R. Price）が共同提唱／初出は1973年の Nature 論文「The Logic of Animal Conflict」／メイナード・スミスによる1982年の体系的著作『Evolution and the Theory of Games』',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/game-evolutionary/', type: 'reference', label: 'Evolutionary Game Theory — Stanford Encyclopedia of Philosophy（査読つき哲学百科事典）' },
      { url: 'https://en.wikipedia.org/wiki/Evolutionarily_stable_strategy', type: 'reference', label: 'Evolutionarily stable strategy — Wikipedia' },
      { url: 'https://royalsocietypublishing.org/rstb/article/378/1876/20210496/109181/Evolutionarily-stable-strategy-analysis-and-its', type: 'academic', label: 'Evolutionarily stable strategy analysis... — Philosophical Transactions of the Royal Society B（査読論文）' },
    ],
  },
  {
    id: 'mgmt-triple-bottom-line',
    discipline: 'management',
    title: 'トリプルボトムライン（TBL）',
    statement:
      '企業の業績や価値を、財務的利益（経済）のみでなく、社会的側面と環境的側面を加えた3つの次元――People（人・社会）・Planet（環境）・Profit（利益）、いわゆる「3つのP」――で測るべきだとする会計・経営の枠組み。従来は損益計算書の最終行（bottom line）＝利益だけで企業を評価したのに対し、社会的ボトムライン（社会的公正・福祉への貢献）と環境的ボトムライン（生態系への影響）も併せて評価する。ジョン・エルキントンが1994年に提唱し、1997年の著書『Cannibals with Forks』で広めた。' +
      '持続可能な開発・CSR・ESG投資・サステナビリティ報告の基礎概念。ただし提唱者自身が2018年、TBLが本来意図した資本主義の変革ではなく単なる会計・チェックリストの道具に矮小化されたとして「リコール（再考）」を表明した経緯もある。',
    keyFigures: 'ジョン・エルキントン（John Elkington、SustainAbility共同創設者）が1994年に提唱／1997年の著書『Cannibals with Forks: The Triple Bottom Line of 21st Century Business』（Capstone）で普及／2018年にエルキントン自身がHarvard Business Reviewで概念の「リコール（再考）」を表明',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.hec.edu/en/what-triple-bottom-line', type: 'academic', label: 'HEC Paris（経営大学院）— What is the “Triple Bottom Line”?' },
      { url: 'https://www.ebsco.com/research-starters/environmental-sciences/triple-bottom-line-accounting', type: 'reference', label: 'EBSCO Research Starters — Triple bottom line (accounting)' },
      { url: 'https://hbr.org/2018/06/25-years-ago-i-coined-the-phrase-triple-bottom-line-heres-why-im-giving-up-on-it', type: 'media', label: 'Harvard Business Review (2018), John Elkington — TBLの「リコール」表明（一次資料）' },
      { url: 'https://en.wikipedia.org/wiki/John_Elkington_(business_author)', type: 'reference', label: 'Wikipedia — John Elkington（提唱者・初出・1997年著書・2018年リコール）' },
    ],
  },
  {
    id: 'human-cbt',
    discipline: 'human-science',
    title: '認知行動療法（CBT）',
    statement:
      '気分や行動は出来事そのものではなく、その出来事をどう「認知（解釈・考え方）」するかに影響されるという考えに基づく心理療法（精神療法）の一群。思考・感情・行動は相互に連動するととらえ、非機能的・非合理的な認知（自動思考・認知の歪み・スキーマ）と、それに伴う行動パターンを、思考記録・行動実験・曝露・行動活性化などの構造化された手続きで同定・検証・修正していく。' +
      '問題を扱いやすい要素に分解し、セッション間の課題（ホームワーク）を併用するのが特徴。うつ病・不安障害・パニック障害・PTSDなどで有効性が実証され、多くの診療ガイドラインでエビデンスに基づく第一選択の標準治療の一つとされる。',
    keyFigures: 'アーロン・ベック（Aaron T. Beck）：1960年代に認知療法を創始、うつ病の認知モデルと「認知の三徴」（自己・世界・将来への否定的見方、1967）を提唱／アルバート・エリス（Albert Ellis）：1950年代に論理情動行動療法（REBT、ABCモデル）を創始（CBTの源流の一つ）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nhs.uk/tests-and-treatments/cognitive-behavioural-therapy-cbt/', type: 'government', label: 'NHS（英国国民保健サービス）— Cognitive behavioural therapy (CBT)' },
      { url: 'https://www.simplypsychology.org/cognitive-therapy.html', type: 'reference', label: 'Simply Psychology — Cognitive Behavioral Therapy (CBT): Beck と Ellis の理論' },
      { url: 'https://en.wikipedia.org/wiki/Beck%27s_cognitive_triad', type: 'reference', label: 'Wikipedia — Beck’s cognitive triad（認知の三徴：自己・世界・将来）' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/becks-cognitive-triad', type: 'reference', label: 'EBSCO Research Starters — Beck’s cognitive triad' },
    ],
  },
  {
    id: 'bizlaw-administrative-appeal',
    discipline: 'business-law',
    title: '行政不服審査（審査請求）',
    statement:
      '行政不服審査とは、行政庁の違法又は不当な処分その他公権力の行使に当たる行為に関し、国民が簡易迅速かつ公正な手続のもとで行政庁に不服を申し立て、その見直しを求める制度である。一般法として行政不服審査法（昭和37年法律第160号を全部改正した平成26年法律第68号、2016年4月施行）が定める。中心的な不服申立ての類型は「審査請求」で、原則として処分庁等の最上級行政庁に対して行う。裁判（取消訴訟）と異なり、違法のみならず裁量の「不当」も争うことができ、簡易・迅速・無料という特徴をもつ。' +
      '2014年の全部改正で、審理の公正性を高めるため、処分に関与しない職員から指名される「審理員」による審理や、第三者機関「行政不服審査会」への諮問の仕組みが導入され、審査請求期間は処分を知った日の翌日から原則3か月に統一された。審査請求と取消訴訟は原則として自由選択（自由選択主義。例外として個別法の審査請求前置主義）。',
    keyFigures: '根拠法＝行政不服審査法（平成26年法律第68号・2016年4月施行、e-Gov法令ID 426AC0000000068）／中心類型＝審査請求、原則として最上級行政庁が審査庁（第4条）／対象＝違法又は不当な処分その他公権力の行使／審査請求期間＝処分を知った日の翌日から原則3か月（第18条第1項）／2014年全部改正で審理員制度・第三者機関「行政不服審査会」への諮問を導入／取消訴訟とは原則自由選択主義',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/426AC0000000068', type: 'government', label: 'e-Gov法令検索 行政不服審査法（平成26年法律第68号、法令ID 426AC0000000068）' },
      { url: 'https://www.soumu.go.jp/main_sosiki/gyoukan/kanri/fufuku/gaiyou02.html', type: 'government', label: '総務省 行政不服審査法の概要' },
      { url: 'https://www.soumu.go.jp/main_sosiki/singi/fufukushinsa/index.html', type: 'government', label: '総務省 行政不服審査会' },
    ],
  },
  {
    id: 'econ-stagflation',
    discipline: 'economics',
    title: 'スタグフレーション',
    statement:
      '経済の停滞（stagnation＝低成長・高失業）と物価上昇（inflation）が同時に進行する状況を指す合成語。通常、景気後退期には需要が弱まり物価上昇は鈍化する（フィリップス曲線が示す失業とインフレのトレードオフ）と考えられていたため、両者が併存する点で従来のケインズ的理解と矛盾する現象である。' +
      '1970年代の石油危機（オイルショック）に伴う供給ショック＝コストプッシュ・インフレが代表例で、原油価格急騰が生産コストを押し上げ、短期フィリップス曲線を右上方へシフトさせて物価上昇と景気後退・失業増大を同時にもたらした。この経験はフィリップス曲線の安定性への疑義を生み、フリードマンやフェルプスによる期待の組み込みと自然失業率仮説、マネタリズム・合理的期待の台頭の契機となった。',
    keyFigures: '語源：stagnation（停滞）＋inflation（物価上昇）の合成語／初出：英政治家イアン・マクラウド（Iain Macleod）が1965年の議会演説で使用／代表事例：1973年オイルショック（OPECの供給制限）による供給ショック・コストプッシュ・インフレ／理論的応答：フリードマン(1968)・フェルプス(1967)の期待を組み込んだ自然失業率仮説、マネタリズムの台頭',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Stagflation', type: 'reference', label: 'Wikipedia「Stagflation」（定義・Macleod 1965年起源・1970年代石油危機）' },
      { url: 'https://www.nber.org/system/files/working_papers/w24891/w24891.pdf', type: 'academic', label: 'NBER Working Paper No.24891「Friedman and Phelps on the Phillips Curve」' },
      { url: 'https://www.merriam-webster.com/dictionary/stagflation', type: 'reference', label: 'Merriam-Webster Dictionary「stagflation」（stagnation+inflation 合成語の定義）' },
      { url: 'https://www.nber.org/system/files/working_papers/w19267/w19267.pdf', type: 'academic', label: 'NBER Working Paper No.19267「The Natural Rate Hypothesis」' },
    ],
  },
  {
    id: 'econ-auction-theory',
    discipline: 'economics',
    title: 'オークション理論',
    statement:
      '入札者が各自の評価額という私的情報を持つ状況で、競売が資源をどう配分し価格を決めるか、また売り手の収益や効率性を最大化するにはどのような競売ルールを設計すべきかを分析する、ゲーム理論・市場設計の一分野。基本4形式は(1)競り上げ式（イングリッシュ）、(2)競り下げ式（ダッチ）、(3)第一価格封印入札、(4)第二価格封印入札（ヴィックリー・オークション。最高入札者が2番目の入札額を支払い、正直な評価額入札が支配戦略）。' +
      '評価が各人固有の「私的価値」か、皆に共通だが事前に不確実な「共通価値」かを区別し、後者では過大入札を避けようとする「勝者の呪い（winner’s curse）」が生じる。リスク中立・独立同分布の私的価値などの条件下では4形式の期待収益が一致する（収益同値定理）。理論は周波数オークション等の実務設計に応用された。',
    keyFigures: 'William Vickrey（1961年に4形式と第二価格入札を先駆的に分析、1996年ノーベル経済学賞）／Roger Myerson（1981年「Optimal Auction Design」で最適競売・収益同値定理を一般化）／Paul Milgrom・Robert Wilson（共通価値・一般理論と周波数オークション実務設計、2020年ノーベル経済学賞）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2020/press-release/', type: 'government', label: 'The Nobel Prize — 2020年経済学賞プレスリリース（Milgrom・Wilson、共通価値と勝者の呪い）' },
      { url: 'https://www.econlib.org/library/Enc/Auctions.html', type: 'reference', label: 'Econlib（Concise Encyclopedia of Economics）“Auctions” — 4形式・私的/共通価値・収益同値' },
      { url: 'https://www.cs.princeton.edu/courses/archive/spr10/cos444/papers/myerson81.pdf', type: 'academic', label: 'Roger B. Myerson (1981) “Optimal Auction Design”, Mathematics of Operations Research' },
      { url: 'https://en.wikipedia.org/wiki/Vickrey_auction', type: 'reference', label: 'Wikipedia “Vickrey auction” — 第二価格封印入札と支配戦略・収益同値' },
    ],
  },
  {
    id: 'mgmt-planned-happenstance',
    discipline: 'management',
    title: '計画された偶発性理論',
    statement:
      '個人のキャリアは綿密な計画通りに進むものではなく、予期せぬ偶然の出来事によって大きく形成されるとするキャリア・カウンセリングの理論。偶然を漫然と待つのではなく、好奇心や主体的な行動によって意図的に引き寄せ、機会（好機）として活かしていくべきだと説く。クランボルツのキャリア意思決定の社会的学習理論を基盤として発展した。' +
      '偶然を好機に変えるために重要な5つのスキルとして、(1)好奇心（curiosity）、(2)持続性（persistence）、(3)柔軟性（flexibility）、(4)楽観性（optimism）、(5)冒険心・リスクテイキング（risk-taking）を挙げ、計画されていない出来事を必然かつ望ましいものと捉え、能動的に「構築」していく姿勢を重視する。',
    keyFigures: 'ジョン・クランボルツ（John D. Krumboltz、スタンフォード大学）ら／初出: Mitchell, Levin & Krumboltz (1999)「Planned Happenstance: Constructing Unexpected Career Opportunities」, Journal of Counseling & Development, 77, 115–124／基盤理論: クランボルツのキャリア意思決定の社会的学習理論',
    asOf: '2026-06',
    sources: [
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1002/j.1556-6676.1999.tb02431.x', type: 'academic', label: 'Mitchell, Levin & Krumboltz (1999)「Planned Happenstance」, Journal of Counseling & Development 77, 115–124（Wiley・初出査読論文）' },
      { url: 'https://ed.stanford.edu/news/stanford-professor-john-d-krumboltz-who-developed-theory-planned-happenstance-dies', type: 'academic', label: 'Stanford Graduate School of Education — 提唱者 John D. Krumboltz と planned happenstance 理論' },
      { url: 'https://nacada.ksu.edu/Resources/Academic-Advising-Today/View-Articles/Planned-Happenstance-Preparing-Liberal-Arts-and-Social-Science-Students-to-Follow-Their-Hearts-to-Career-Success.aspx', type: 'academic', label: 'NACADA（Kansas State University）— 理論概要と5つのスキルの解説' },
    ],
  },
  {
    id: 'human-defense-mechanisms',
    discipline: 'human-science',
    title: '防衛機制',
    statement:
      '人が、不安・葛藤・受け入れがたい衝動や感情から自我（ego）を守るために無意識的に用いる心理的な方略。自我が、イド（id）の欲動・超自我（superego）の規範・現実の要請の間の葛藤を調整し、心的均衡を保つために働く。代表的なものに、受け入れがたい考えや記憶を意識から締め出す「抑圧（repression）」、明白な現実を認めない「否認（denial）」、自分の受け入れがたい感情を他者に帰する「投影（projection）」、もっともらしい理由づけをする「合理化（rationalization）」、欲動をより社会的に承認される形へ振り向ける「昇華（sublimation）」、未熟な発達段階へ戻る「退行（regression）」、加えて反動形成・置き換え・知性化などがある。' +
      '多くは適応的にも不適応的にも働き、過度・硬直的な使用は不適応につながりうる。認知的不協和や帰属理論とは別概念。',
    keyFigures: 'ジークムント・フロイト（Sigmund Freud：概念を導入、抑圧を中核と位置づけ）／アンナ・フロイト（Anna Freud：1936年著『自我と防衛機制（The Ego and the Mechanisms of Defence）』で体系化、10の機制を整理）／ジョージ・ヴェイラント（George Vaillant：病的・未熟・神経症的・成熟の4水準に階層化）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ncbi.nlm.nih.gov/books/NBK559106/', type: 'academic', label: 'Defense Mechanisms — StatPearls, NCBI Bookshelf (NIH／査読臨床リファレンス)' },
      { url: 'https://en.wikipedia.org/wiki/Defence_mechanism', type: 'reference', label: 'Defence mechanism — Wikipedia（Anna Freudの10機制・Vaillant階層を記載）' },
      { url: 'https://www.encyclopedia.com/psychology/dictionaries-thesauruses-pictures-and-press-releases/ego-and-mechanisms-defence', type: 'reference', label: 'The Ego and the Mechanisms of Defence — Encyclopedia.com' },
    ],
  },
  {
    id: 'bizlaw-defamation',
    discipline: 'business-law',
    title: '名誉毀損（刑法230条・民法709条/723条）',
    statement:
      '名誉毀損とは、公然と事実を摘示するなどして人の社会的評価を低下させる行為をいう。刑事上、刑法230条1項は「公然と事実を摘示し、人の名誉を毀損した者は、その事実の有無にかかわらず」3年以下の懲役・禁錮又は50万円以下の罰金に処すると定め、真実か否かを問わず成立しうる。ただし刑法230条の2は、摘示事実が公共の利害に関し、目的が専ら公益を図ることにあり、かつ真実であることの証明があれば罰しないとする（真実性の抗弁）。' +
      '民事上は民法709条・710条の不法行為として損害賠償（慰謝料）の対象となり、民法723条は被害者の請求により損害賠償に代えて又はともに「名誉を回復するのに適当な処分」（謝罪広告等）を命じうると定める。判例は公共性・公益目的・真実性（又は真実と信ずる相当の理由）による免責法理を確立している。事実摘示によらない「侮辱」、意見・論評型（公正な論評の法理）とは区別される。',
    keyFigures: '刑事＝刑法230条1項：公然・事実の摘示が要件、真実か否かを問わず成立／刑法230条の2：公共性＋公益目的＋真実性の証明で不処罰（真実性の抗弁）／民事＝民法709条・710条の不法行為で損害賠償・慰謝料／民法723条：損害賠償に代えて又はともに名誉回復に適当な処分（謝罪広告等）／真実と信ずる相当の理由があれば免責（民事＝最判昭41.6.23／刑事の故意阻却＝最大判昭44.6.25）／e-Gov法令ID＝刑法140AC0000000045・民法129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/140AC0000000045', type: 'government', label: 'e-Gov法令検索 刑法（明治40年法律第45号）— 230条・230条の2の条文' },
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号）— 709条・710条・723条の条文' },
      { url: 'https://www.courts.go.jp/assets/hanrei/hanrei-pdf-52287.pdf', type: 'government', label: '裁判所 名誉毀損の真実性・真実相当性に関する判決（公開判例PDF）' },
    ],
  },
  {
    id: 'infosoc-information-overload',
    discipline: 'information-sociology',
    title: '情報過多（情報オーバーロード）',
    statement:
      '人が処理できる情報処理能力（キャパシティ）を超える量の情報にさらされることで、意思決定の質が低下したり、混乱・ストレス・判断停止が生じたりする状態を指す。情報社会学・情報行動論の中心概念の一つで、受け取る情報量が増えると一定点までは意思決定の質が向上するが、その「過負荷点」を超えると逆に質が低下するという「逆U字（さかさまのU）」の関係で説明されることが多い。' +
      '過剰な情報は認知的負荷を満杯にし、処理時間の増大・判断への自信低下・意思決定の回避を招き、特に時間的プレッシャー下で悪化する。インターネット・SNS・常時接続により現代では深刻化し、「注意経済」「フィルターバブル」「FOMO（取り残される不安）」などの議論とも密接に関連する。処理能力を超える情報による判断の劣化という点で、注意経済や限定合理性とは区別される独立した概念である。',
    keyFigures: 'バートラム・グロス（Bertram Gross）が著書『The Managing of Organizations』(1964)で「information overload」の語を造語したとされる／アルビン・トフラー（Alvin Toffler）が『未来の衝撃（Future Shock）』(1970)で同語を広く普及させた／ジョージ・A・ミラーの「マジカルナンバー7±2」など人間の限られた情報処理能力の研究が概念的基盤／要点＝情報量と意思決定の質は「逆U字」関係',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/library-and-information-science/information-overload', type: 'reference', label: 'EBSCO Research Starters（Library and Information Science）「Information overload」' },
      { url: 'https://en.wikipedia.org/wiki/Information_overload', type: 'reference', label: 'Wikipedia「Information overload」— 造語(Gross 1964)・普及(Toffler 1970)・逆U字' },
      { url: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1122200/full', type: 'academic', label: 'Frontiers in Psychology (2023) 査読論文「Dealing with information overload: a comprehensive review」' },
      { url: 'https://link.springer.com/article/10.1007/s40685-018-0069-z', type: 'academic', label: 'Business Research / Springer (2018) 査読レビュー論文 — 情報過多の文献レビューと枠組み' },
    ],
  },
  {
    id: 'econ-tiebout-model',
    discipline: 'economics',
    title: 'ティブー・モデル（足による投票）',
    statement:
      '地方公共財（地域ごとの公共サービスと税の組合せ）の効率的供給を論じるモデル。住民が自分の選好に最も合った税・サービスの組合せを提供する自治体を選んで移住すること（＝「足による投票 voting with one’s feet」）で、あたかも市場のように選好が顕示され、地方公共財が効率的に供給されうるとする。これにより、サミュエルソンらが指摘した「公共財は選好が市場的に顕示されず効率的供給が困難」という問題が、地方レベルでは住民の移動によって部分的に解決されうると主張した。' +
      'チャールズ・ティブーが1956年論文「A Pure Theory of Local Expenditures」（Journal of Political Economy）で提示。多数の自治体・住民の完全な移動可能性・完全情報・自治体間の外部性（スピルオーバー）なし・各自治体の固定的なサービス水準などの強い前提に依存する。現実には移動費用・住宅市場・雇用や社会的紐帯による移動制約、教育等での経済的・人種的分離（公平性）といった問題があり、現実妥当性への批判も中立的に存在する。',
    keyFigures: 'チャールズ・ティブー（Charles M. Tiebout、提唱者）／初出: “A Pure Theory of Local Expenditures”, Journal of Political Economy, vol.64 no.5, pp.416–424 (1956)／背景: サミュエルソン・マスグレイブの公共財・選好顕示問題への応答',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Tiebout_model', type: 'reference', label: 'Tiebout model — Wikipedia（概念・「足による投票」・前提・出典書誌）' },
      { url: 'https://escholarship.org/uc/item/9fq454wm', type: 'academic', label: 'Charles M. Tiebout, A Pure Theory of Local Expenditures, 1956 — CSISS Classics（UC eScholarship）' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803104612771', type: 'reference', label: 'Tiebout hypothesis — Oxford Reference（前提・効率性・批判の概説）' },
      { url: 'https://www.lincolninst.edu/publications/books/tiebout-model-fifty', type: 'academic', label: 'The Tiebout Model at Fifty — Lincoln Institute of Land Policy（モデルの評価・限界）' },
    ],
  },
  {
    id: 'econ-marginal-revolution',
    discipline: 'economics',
    title: '限界革命（限界効用理論）',
    statement:
      '1870年代の経済学で起きた理論的転換。財の価値や価格を、生産に投下された労働量で説明する古典派の客観価値説（労働価値説）から、財を追加1単位消費することで得られる満足＝「限界効用（marginal utility）」という主観的・限界的概念で説明する方法へ移行した。価値は財の総効用や有用性ではなく、消費される最後の1単位の効用（限界効用）で決まるとし、消費量の増加とともに限界効用が低下する「限界効用逓減の法則」を導入。' +
      'これにより、生命に不可欠な水が安価で装飾品のダイヤモンドが高価であるという「水とダイヤモンドのパラドックス（価値の逆説）」を、総効用ではなく限界効用の差として説明した。この主観的・限界的アプローチは、近代の新古典派経済学およびミクロ経済学（需要理論・一般均衡理論）の基礎となった。',
    keyFigures: 'ウィリアム・スタンレー・ジェヴォンズ（英、『経済学の理論』1871）／カール・メンガー（オーストリア、『国民経済学原理』1871）／レオン・ワルラス（仏／スイス・ローザンヌ学派、『純粋経済学要論』1874）／三者がほぼ同時かつ独立に限界効用原理を提唱（1871〜1874）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/The-Theory-of-Political-Economy', type: 'reference', label: 'Encyclopædia Britannica — The Theory of Political Economy (Jevons, 1871)' },
      { url: 'https://link.springer.com/referenceworkentry/10.1057/978-1-349-95121-5_2237-1', type: 'reference', label: 'The New Palgrave Dictionary of Economics (SpringerLink) — “Marginal Revolution”' },
      { url: 'https://www.tandfonline.com/doi/full/10.1080/03017605.2025.2554037', type: 'academic', label: 'The Diamond-Water Paradox revisited: Jevons, Menger and Walras — marginal value theory（査読論文）' },
    ],
  },
  {
    id: 'mgmt-high-reliability-org',
    discipline: 'management',
    title: '高信頼性組織（HRO）',
    statement:
      '高信頼性組織（High Reliability Organizations, HRO）とは、原子力発電所、航空管制、航空母艦、緊急医療など、極めて高いリスクと複雑性を抱えながらも、長期間にわたり重大事故をほとんど起こさずに運営される組織、およびその特徴を研究する経営学・安全科学の分野である。カリフォルニア大学バークレー校のグループが1980年代に、複雑系では事故は不可避とするチャールズ・ペローの「ノーマル・アクシデント論（通常事故）」と対比する形で研究を始めた。' +
      'カール・ワイクとキャスリーン・サトクリフは、HROに共通する「マインドフルネス（注意深い気づき）」の5原則として、(1)失敗へのこだわり、(2)単純化を避ける、(3)現場への敏感さ、(4)レジリエンスへのコミットメント、(5)専門知への敬意（権限でなく知識ある者に判断を委ねる）を整理した。これらが組織的マインドフルネスを生み、予期せぬ事態への対処を可能にする。',
    keyFigures: 'カリフォルニア大学バークレー校の研究グループ（トッド・ラポート／カーレーン・ロバーツ／ジーン・ロックリン、1984年に研究開始）／K.ロバーツ初期論文 (1989)／カール・ワイク & キャスリーン・サトクリフ著『Managing the Unexpected』(2001) で5原則を定式化／対比理論：チャールズ・ペロー『Normal Accidents』(1984)',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/High_reliability_organization', type: 'reference', label: 'Wikipedia「High reliability organization」— バークレー群、3研究対象、ノーマル・アクシデント論との対比' },
      { url: 'https://ccrm.berkeley.edu/40th-anniversary-high-reliability-organizations-research', type: 'academic', label: 'UC Berkeley CCRM「40th Anniversary of High Reliability Organizations Research」' },
      { url: 'https://journals.sagepub.com/doi/10.1177/108602668900300202', type: 'academic', label: 'Karlene H. Roberts (1989) “New challenges in organizational research: high reliability organizations”, SAGE（査読誌）' },
    ],
  },
  {
    id: 'human-erikson-psychosocial',
    discipline: 'human-science',
    title: 'エリクソンの心理社会的発達理論',
    statement:
      '人間の自我（アイデンティティ）の発達を乳児期から老年期までの生涯にわたる8段階で捉える理論。各段階には固有の心理社会的危機（発達課題）があり、それを建設的に乗り越えることで人格的強み（徳）を獲得するとする。フロイトの心理性的発達論を社会・文化的次元へ拡張して提唱された。8段階は (1)乳児期：基本的信頼 対 不信（徳＝希望）、(2)幼児前期：自律性 対 恥・疑惑（意志）、(3)幼児後期：自発性 対 罪悪感（目的）、(4)児童期：勤勉性 対 劣等感（適格性）、(5)青年期：アイデンティティ 対 役割の混乱（忠誠）、(6)成人前期：親密性 対 孤立（愛）、(7)成人期：生殖性（世代性）対 停滞（世話）、(8)老年期：統合 対 絶望（英知）。' +
      'とくに青年期のアイデンティティ確立と、その猶予期間としての「心理社会的モラトリアム」概念で知られる。',
    keyFigures: 'エリク・H・エリクソン（Erik H. Erikson, 1902–1994）／初出：『幼児期と社会』（Childhood and Society, 1950）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ncbi.nlm.nih.gov/books/NBK556096/', type: 'academic', label: 'Orenstein & Lewis “Erikson’s Stages of Psychosocial Development.” StatPearls, NCBI Bookshelf（査読制臨床リファレンス）' },
      { url: 'https://www.britannica.com/topic/Childhood-and-Society', type: 'reference', label: 'Encyclopaedia Britannica — “Childhood and Society”（エリクソンの主著・初出1950）' },
      { url: 'https://en.wikipedia.org/wiki/Erikson%27s_stages_of_psychosocial_development', type: 'reference', label: 'Wikipedia — “Erikson’s stages of psychosocial development”（8段階・各徳の一覧）' },
    ],
  },
  {
    id: 'bizlaw-assignment-of-claims',
    discipline: 'business-law',
    title: '債権譲渡（民法466条）',
    statement:
      '債権譲渡とは、債権をその同一性を保ったまま、譲渡人と譲受人の契約（合意）によって移転することをいう。民法466条1項は「債権は、譲り渡すことができる」と定め、譲渡自由を原則とする（ただし債権の性質がこれを許さないときを除く）。当事者が譲渡を禁止・制限する意思表示（譲渡制限特約）をしても、2017年改正・2020年4月施行の現行民法では債権譲渡の効力は妨げられない（466条2項）。' +
      'もっとも、その特約につき悪意又は重過失の譲受人その他の第三者に対しては、債務者はその債務の履行を拒むことができる（466条3項）。第三者対抗要件として、譲渡人から債務者への通知又は債務者の承諾を要し（467条1項）、債務者以外の第三者に対抗するにはその通知・承諾が確定日付のある証書によることを要する（467条2項）。債務者は、対抗要件具備時までに譲渡人に対して生じた事由（弁済・相殺等）を譲受人に対抗できる（468条）。売掛債権の流動化・資金調達（ファクタリング等）に活用される。',
    keyFigures: '民法466条1項＝譲渡自由の原則／466条2項＝譲渡制限特約があっても譲渡は有効／466条3項＝悪意・重過失の譲受人に対し債務者は履行を拒める／467条1項＝対抗要件は債務者への通知又は承諾／467条2項＝第三者対抗には確定日付ある証書を要する／468条＝債務者は対抗要件具備時までの抗弁事由を対抗可／2017年改正・2020年4月1日施行',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索「民法」（law id 129AC0000000089、466〜468条）' },
      { url: 'https://www.moj.go.jp/content/000052602.pdf', type: 'government', label: '法務省 民法（債権関係）の改正に関する検討事項（債権譲渡）' },
      { url: 'https://www.businesslawyers.jp/practices/1197', type: 'media', label: 'BUSINESS LAWYERS「民法改正で債権譲渡はどう変わった？譲渡禁止特約の効力は？」' },
    ],
  },
  {
    id: 'infosoc-liquid-modernity',
    discipline: 'information-sociology',
    title: 'リキッド・モダニティ（液状化する近代）',
    statement:
      'ポーランド出身の社会学者ジグムント・バウマンが著書『リキッド・モダニティ（Liquid Modernity）』(2000)で提示した、後期近代の社会を捉える概念。仕事・家族・階級・国家・アイデンティティといった固定的で頑健な制度や絆に支えられた「固体的近代（solid modernity）」から、すべてが流動的・一時的・不確実で絶えず変化し続ける「液状的近代（liquid modernity）」へ移行したと論じる。' +
      '雇用は不安定化（プレカリティ化）し、人間関係や絆は一時的で解消可能なもの（後の著作で「液状の愛 liquid love」）となり、アイデンティティは固定されず絶えず作り直される。消費社会の論理が個人の生を貫き、確実性や恒久性が失われる一方、リスクや不安は個人化される。グローバル化・デジタル化・流動的労働の時代における自己と社会を分析する枠組みであり、ウルリヒ・ベックの「リスク社会」やアンソニー・ギデンズの「再帰的近代」と並ぶ後期近代論の一つ。',
    keyFigures: '提唱者: ジグムント・バウマン（Zygmunt Bauman, 1925–2017, ポーランド出身の社会学者）／初出: 著書『Liquid Modernity』(Polity Press, 2000)／関連: 「液状の愛」は続編『Liquid Love』(2003)／関連理論家: ウルリヒ・ベック（リスク社会）・アンソニー・ギデンズ（後期/再帰的近代）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Liquid-Modernity', type: 'reference', label: 'Encyclopædia Britannica — “Liquid Modernity” (work by Bauman)' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100108465', type: 'reference', label: 'Oxford Reference — “Liquid modernity”（グローバル資本主義下の現在的条件を指すバウマンの語）' },
      { url: 'https://link.springer.com/article/10.1186/2193-1801-2-191', type: 'academic', label: 'SpringerPlus (査読論文) — “Zygmunt Bauman. Individual and society in the liquid modernity” (2013)' },
    ],
  },
  {
    id: 'econ-quantitative-easing',
    discipline: 'economics',
    title: '量的緩和（QE）',
    statement:
      '量的緩和（quantitative easing, QE）とは、政策金利が実質ゼロ（実効下限・流動性のわな）に達し伝統的な短期金利操作が効かなくなった状況で、中央銀行が長期国債などの金融資産を大量に買い入れ、市場にマネタリーベースを大量供給する非伝統的金融政策である。短期金利の操作に代えて中央銀行のバランスシートの規模（量）を拡大し、長期金利の低下、資産価格の上昇、ポートフォリオ・リバランス効果、将来の緩和継続を示すシグナリングなどの経路を通じて、景気と物価を刺激することを狙う。' +
      '日本銀行が2001〜2006年に世界に先駆けて導入し、2008年の世界金融危機後にFRB・イングランド銀行・ECBが大規模に実施した。効果の大きさ、出口（正常化）の難しさ、資産バブルや格差拡大といった副作用をめぐっては議論が続いている。',
    keyFigures: '非伝統的金融政策（実効下限／流動性のわなで短期金利操作が限界に達した際の代替手段）／手段＝長期国債等の大量買入によるバランスシート（量）拡大とマネタリーベース供給／主な伝達経路＝長期金利低下・資産価格上昇・ポートフォリオ・リバランス・シグナリング／起源＝日本銀行が2001〜2006年に先駆導入／普及＝2008年危機後にFRB・イングランド銀行・ECBが大規模実施',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.boj.or.jp/en/about/press/koen_2017/data/ko171019a1.pdf', type: 'government', label: '日本銀行「Evolving Monetary Policy: The Bank of Japan’s Experience」(2017) — 2001-2006年QEの先駆導入' },
      { url: 'https://www.bankofengland.co.uk/quarterly-bulletin/2022/2022-q1/qe-at-the-bank-of-england-a-perspective-on-its-functioning-and-effectiveness', type: 'government', label: 'イングランド銀行 Quarterly Bulletin (2022 Q1)「QE at the Bank of England」— 伝達経路と効果' },
      { url: 'https://www.ecb.europa.eu/press/key/date/2009/html/sp090428.en.html', type: 'government', label: '欧州中央銀行(ECB)「Conventional and unconventional monetary policy」(2009)' },
      { url: 'https://www.frbsf.org/research-and-insights/publications/economic-letter/2006/10/did-quantitative-easing-by-the-bank-of-japan-work/', type: 'government', label: 'サンフランシスコ連邦準備銀行 Economic Letter (2006)「Did Quantitative Easing by the Bank of Japan “Work”?」' },
    ],
  },
  {
    id: 'econ-new-keynesian',
    discipline: 'economics',
    title: 'ニュー・ケインジアン経済学',
    statement:
      'ケインズ経済学の洞察（市場の不完全性により不況・非自発的失業が生じ、政府・金融政策に安定化の役割がある）を、合理的期待やミクロ的基礎づけ（個々の主体の最適化行動から出発する）という新古典派の方法論と統合したマクロ経済学の学派。1980年代以降、ニュー・クラシカル（合理的期待・市場均衡）の批判（ケインズ経済学はミクロ的基礎を欠くとの指摘）への応答として発展した。' +
      '中核的主張は、価格・賃金の「名目硬直性（nominal rigidity）」――メニューコスト、長期賃金契約、効率賃金、独占的競争下での価格設定など、ミクロ的根拠のある摩擦――により、貨幣・需要の変動が短期的に産出・雇用へ影響する（貨幣の短期非中立性。長期では貨幣中立）こと。動学的確率的一般均衡（DSGE）モデルやニューケインジアン・フィリップス曲線が代表的な分析道具で、現代の中央銀行の政策分析（テイラー・ルール等）の基礎となっている。',
    keyFigures: 'グレゴリー・マンキュー（メニューコストによる小さな摩擦が大きな厚生損失を生む）／オリヴィエ・ブランシャール（独占的競争下の総需要外部性）／マイケル・ウッドフォード（『Interest and Prices』2003）／ジョルディ・ガリ（標準的NKモデルの教科書的定式化）／関連：カルボ（staggered price-setting）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.econlib.org/library/Enc1/NewKeynesianEconomics.html', type: 'reference', label: 'N. G. Mankiw, “New Keynesian Economics,” The Concise Encyclopedia of Economics (Econlib)' },
      { url: 'https://en.wikipedia.org/wiki/New_Keynesian_economics', type: 'reference', label: 'Wikipedia: New Keynesian economics' },
      { url: 'https://en.wikipedia.org/wiki/Nominal_rigidity', type: 'reference', label: 'Wikipedia: Nominal rigidity（名目硬直性・メニューコストの整理）' },
      { url: 'https://www.nber.org/system/files/working_papers/w12965/w12965.pdf', type: 'academic', label: 'NBER Working Paper: Understanding the New-Keynesian Model（IS曲線・NKフィリップス曲線・政策ルール）' },
    ],
  },
  {
    id: 'mgmt-organizational-unlearning',
    discipline: 'management',
    title: '組織的アンラーニング',
    statement:
      '組織的アンラーニング（学習棄却）とは、組織が過去には有効だったが環境変化により陳腐化・不適合となった知識・信念・ルーティン・価値観を、意図的に捨て去り、新しい学習の余地をつくるプロセスである。学習が知識の獲得・追加であるのに対し、アンラーニングは古い知識の意図的な放棄であり、新しい知識を獲得・活用するための前提・補完として位置づけられる。' +
      '偶発的に知識を失う「組織的忘却（forgetting）」とは異なり、支配的な認知枠組みや既存ルーティンの統制力を意図的に解除する点が特徴である。成功体験への固執が生むコンピテンシー・トラップや中核的硬直性（core rigidity）・認知的慣性を乗り越え、環境変化へ柔軟に適応するために重要とされる。個人レベルと組織レベルの区別、および何を捨て何を残すかの判断の難しさが主要な論点であり、組織学習やダブルループ学習とは別個の概念として議論されてきた。',
    keyFigures: 'ボー・ヘドバーグ（Bo Hedberg）が提唱者とされ、初出は1981年の論文「How organizations learn and unlearn」（Nystrom・Starbuck 編『Handbook of Organizational Design』所収、Oxford University Press）／同論文で「学習は陳腐化した知識の棄却を伴う」と定式化し概念を組織文脈に明示的に導入した',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.emerald.com/insight/content/doi/10.1108/tlo-07-2019-236/full/html', type: 'academic', label: 'Guest editorial, The Learning Organization (Emerald Publishing) — Hedberg 1981の位置づけと定義' },
      { url: 'https://link.springer.com/chapter/10.1007/3-540-71011-6_5', type: 'academic', label: '“Can Organizations Really Unlearn?” (Springer Nature) — 意図的棄却としての定義・忘却との区別' },
      { url: 'https://realkm.com/2021/09/12/an-integrative-framework-of-organizational-unlearning/', type: 'media', label: '“An integrative framework of organizational unlearning” (RealKM) — コンピテンシー・トラップ／硬直性克服の枠組み' },
    ],
  },
  {
    id: 'human-grit',
    discipline: 'human-science',
    title: 'グリット（やり抜く力）',
    statement:
      '長期的な目標の達成に向けて、困難・失敗・停滞・退屈に直面しても情熱（passion）と粘り強さ（perseverance）を維持し続ける性格特性。アンジェラ・ダックワースらが2007年の論文（Journal of Personality and Social Psychology）で概念化・尺度化し（Grit Scale、2009年に短縮版Grit-S）、「興味の一貫性（consistency of interest）」と「努力の粘り強さ（perseverance of effort）」の2因子からなる。学業成績、ウェストポイント士官学校での残留、全米スペリング大会の順位などを、才能（IQ）とは独立に予測すると報告された。' +
      '一方で、予測力は誠実性（ビッグファイブのconscientiousness）と非常に強く相関して増分的妥当性が小さく、特に「興味の一貫性」因子の効果や2因子の高次構造はメタ分析（Credé et al., 2016）で疑問視され、効果が誇張されてきたとの批判もある。ビッグファイブや自己効力感、達成動機理論とは区別される独立概念として位置づけられる。',
    keyFigures: 'Angela Duckworth（提唱者・グリット概念とGrit Scaleの開発者）／Peterson・Matthews・Kelly（2007年初出論文の共著者）／Patrick D. Quinn（2009年短縮版Grit-S）／批判: Credé・Tynan・Harms（2016年メタ分析）',
    asOf: '2026-06',
    sources: [
      { url: 'https://pubmed.ncbi.nlm.nih.gov/17547490/', type: 'academic', label: 'Duckworth, Peterson, Matthews & Kelly (2007), “Grit: Perseverance and passion for long-term goals,” JPSP 92(6):1087-1101 — PubMed（初出）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/27845531/', type: 'academic', label: 'Credé, Tynan & Harms (2016), “Much ado about grit: A meta-analytic synthesis,” JPSP — PubMed（批判的メタ分析）' },
      { url: 'https://en.wikipedia.org/wiki/Grit_(personality_trait)', type: 'reference', label: 'Wikipedia: Grit (personality trait)（2因子・批判の概観）' },
    ],
  },
  {
    id: 'bizlaw-contract-termination',
    discipline: 'business-law',
    title: '契約の解除（民法541条・542条）',
    statement:
      '契約の解除とは、契約成立後に一方当事者の意思表示により契約を遡及的に解消し、初めから契約がなかったのと同様の状態へ戻す制度である。解除権の発生原因には契約による約定解除と法律の規定による法定解除がある。債務不履行を理由とする法定解除について、2017年改正・2020年4月施行の現行民法は、催告解除（541条：相当の期間を定めて履行を催告し、その期間内に履行がないとき解除でき、ただし不履行が軽微なときを除く）と、無催告解除（542条：履行不能、債務者の明確な履行拒絶、定期行為の時期徒過など、催告しても契約目的を達成できない場合に直ちに解除できる）を定める。' +
      '改正前と異なり解除に債務者の帰責事由は不要となったが、不履行が債権者の責めに帰すべき事由による場合は解除できない（543条）。解除権は相手方への意思表示により行使し撤回できず（540条）、解除の効果として各当事者は原状回復義務を負う（545条1項本文）が、第三者の権利を害することはできない（同項ただし書）。契約の拘束力からの離脱を認めて債権者を保護する制度である。',
    keyFigures: '催告解除＝民法541条（相当期間の催告→期間内不履行で解除、軽微な不履行は除外）／無催告解除＝民法542条（履行不能・明確な履行拒絶・定期行為の時期徒過等で直ちに解除）／解除権の行使＝民法540条（意思表示・撤回不可）／債務者の帰責事由は不要（2017年改正で削除）／債権者の帰責事由による不履行は解除不可＝543条／解除の効果＝原状回復義務（545条1項）・第三者保護',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（law id 129AC0000000089、540条〜545条）' },
      { url: 'https://www.moj.go.jp/content/001255637.pdf', type: 'government', label: '法務省「契約解除の要件に関する見直し（債務者の帰責事由の要否）」改正資料' },
      { url: 'https://keiyaku-watch.jp/media/hourei/minpo202004_kaijyo/', type: 'media', label: '契約ウォッチ「民法改正（2020年4月施行）に対応 契約解除とは」' },
    ],
  },
  {
    id: 'infosoc-cybernetics',
    discipline: 'information-sociology',
    title: 'サイバネティクス',
    statement:
      '動物（生物）と機械における「制御（control）」と「通信（communication）」を統一的に扱う学際的な科学。生物・機械・社会など異なるシステムに共通する原理として、出力の一部を入力に戻して自己制御する仕組み（フィードバック feedback）に着目し、それによって目標状態を維持・調整する制御の原理を研究する。とくに負のフィードバックは恒常性（ホメオスタシス homeostasis）を生み、情報・エントロピー概念とも結びつく。語源はギリシア語の kybernetes（舵取り＝船の操舵手）。' +
      '制御工学・人工知能・認知科学・システム理論・経営（ビアのシステム論）・社会科学へ広く影響し、観察者自身をシステムに含める自己言及的な第二次サイバネティクス（フォン・フェルスター）へも展開した。情報理論（シャノン）とは別概念で、制御とフィードバックの科学として位置づけられる。',
    keyFigures: '提唱者・命名者：ノーバート・ウィーナー（Norbert Wiener、米国の数学者）／初出：1948年の著書『サイバネティックス――動物と機械における制御と通信』／第二次サイバネティクスの展開：ハインツ・フォン・フェルスター／経営への応用：スタッフォード・ビア（Stafford Beer）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/cybernetics', type: 'reference', label: 'Encyclopaedia Britannica「Cybernetics | Definition & Facts」（定義・語源 kybernetes・フィードバック）' },
      { url: 'https://mitpress.mit.edu/9780262537841/cybernetics-or-control-and-communication-in-the-animal-and-the-machine/', type: 'academic', label: 'MIT Press: Norbert Wiener, Cybernetics（1948年初版／一次資料の刊行元）' },
      { url: 'https://en.wikipedia.org/wiki/Second-order_cybernetics', type: 'reference', label: 'Wikipedia「Second-order cybernetics」（フォン・フェルスターによる観察者を含む第二次サイバネティクス）' },
    ],
  },
  {
    id: 'econ-welfare-theorems',
    discipline: 'economics',
    title: '厚生経済学の基本定理',
    statement:
      '市場の効率性と分配の公正に関する一般均衡理論の2つの中心的定理。第一基本定理は、完全競争・外部性や公共財の不在・完全情報・全財の市場存在といった条件下で、市場の競争均衡（ワルラス均衡）は必ずパレート効率的（誰の効用も下げずに他者の効用を上げられない状態）になると述べ、アダム・スミスの「見えざる手」を厳密に定式化する。ただし保証されるのは効率性のみで公正（分配）ではない。' +
      '第二基本定理は、選好と生産集合の凸性などの条件下で、任意のパレート効率的配分は初期賦存を適切に再配分（一括移転 lump-sum transfer）したうえで競争均衡として分権的に実現できると述べる。これにより効率（市場メカニズム）と分配の公正（再分配政策）を分離して扱え、再分配政策の理論的根拠となる。前提は現実には満たされにくく、市場の失敗（外部性・公共財・情報の非対称性・独占）が政府介入の根拠となる。',
    keyFigures: 'ケネス・アロー（Kenneth Arrow）とジェラール・ドブルー（Gérard Debreu）が論文「Existence of an Equilibrium for a Competitive Economy」(Econometrica, 1954) で一般均衡の存在を厳密に証明し両定理の現代的基礎を確立／第一定理：競争均衡はパレート効率的（効率は保証するが公平は保証しない）／第二定理：任意のパレート効率配分は一括移転後の競争均衡として実現可能（効率と分配の分離）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Fundamental_theorems_of_welfare_economics', type: 'reference', label: 'Fundamental theorems of welfare economics — Wikipedia' },
      { url: 'https://sites.pitt.edu/~luca/ECON2100/2018Class/lecture_17.pdf', type: 'academic', label: 'First Welfare Theorem, Econ 2100 Lecture 17 — University of Pittsburgh（大学講義ノート）' },
      { url: 'https://aede.osu.edu/sites/aede/files/imce/images/WelfareTheorems_2.pdf', type: 'academic', label: 'The Welfare Theorems, AE 503 — Ohio State University（大学講義資料）' },
      { url: 'https://www.econometricsociety.org/publications/econometrica/1954/07/01/existence-equilibrium-competitive-economy', type: 'academic', label: 'Arrow & Debreu, “Existence of an Equilibrium for a Competitive Economy”, Econometrica (1954)（査読原論文）' },
    ],
  },
  {
    id: 'econ-risk-aversion',
    discipline: 'economics',
    title: 'リスク回避（アロー＝プラット測度）',
    statement:
      '不確実性下の意思決定において、同じ期待値（期待金額）であれば、リスクのあるくじよりも確実な金額を好む傾向をリスク回避という。期待効用理論の枠組みでは、フォン・ノイマン＝モルゲンシュテルン効用関数 u が富に対して凹（concave、限界効用逓減、u″<0）であることがリスク回避と同値である。確実性等価（certainty equivalent）はくじと無差別になる確実な金額で、リスク回避者では期待値より小さい。リスクプレミアムはくじの期待値と確実性等価の差で、リスクを引き受けることへの対価を表す。' +
      'リスク回避の度合いの尺度として、ケネス・アローとジョン・プラットが独立に定式化した絶対的リスク回避度 ARA ＝ −u″(x)/u′(x) と相対的リスク回避度 RRA ＝ −x·u″(x)/u′(x) があり、アロー＝プラット測度と呼ばれる。値が正ならリスク回避、ゼロならリスク中立、負ならリスク愛好を示す。保険需要・ポートフォリオ選択・金融資産のリスクプレミアム分析の基礎をなす。',
    keyFigures: 'John W. Pratt（1964「Risk Aversion in the Small and in the Large」）と Kenneth J. Arrow（1965「Aspects of the Theory of Risk-Bearing」）が独立並行に定式化／絶対的リスク回避度 ARA = −u″/u′／相対的リスク回避度 RRA = −x·u″/u′／凹効用（u″<0）⇔リスク回避／確実性等価＜期待値／リスクプレミアム＝期待値−確実性等価／リスク中立・リスク愛好と対比',
    asOf: '2026-06',
    sources: [
      { url: 'https://ocw.mit.edu/courses/14-123-microeconomic-theory-iii-spring-2015/f7d39636011bcb5ab9e0ef9dca295ccf_MIT14_123S15_Chap3.pdf', type: 'academic', label: 'MIT OpenCourseWare 14.123 Microeconomic Theory III, Ch.3 Attitudes Towards Risk' },
      { url: 'https://assets.press.princeton.edu/chapters/s7945.pdf', type: 'academic', label: 'Princeton University Press, “Risk Aversion”（教科書サンプル章、確実性等価・リスクプレミアム・アロー＝プラット測度）' },
      { url: 'https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/abs/measures-of-risk-aversion-some-clarifying-comments/003B53B989623ECA8128543AE488CE90', type: 'academic', label: 'Journal of Financial and Quantitative Analysis (Cambridge Core), “Measures of Risk Aversion: Some Clarifying Comments”' },
    ],
  },
  {
    id: 'mgmt-organizational-socialization',
    discipline: 'management',
    title: '組織社会化',
    statement:
      '組織社会化とは、新しく組織に加わったメンバー（新入社員など）が、その役割を効果的に遂行し組織の一員（インサイダー）となるために必要な知識・スキル・価値観・態度・行動規範・組織文化を習得し、「アウトサイダー」から有能な「インサイダー」へ移行していく過程である。この過程を通じて新人は役割上の不確実性を低減し、入社時に直面するリアリティ・ショックを克服していく。' +
      '組織側が用いる社会化戦術（制度化された戦術 対 個人化された戦術）だけでなく、新人自身による主体的な情報探索・フィードバック探索などのプロアクティブ行動も適応を促す重要な要因とされる。社会化の成否は、組織コミットメント・組織同一視・職務満足、ひいては定着（離職防止）と関連づけて論じられる。組織コミットメントや心理的契約、実践共同体とは区別される独立概念である。',
    keyFigures: '提唱者: John Van Maanen（ジョン・ヴァン＝マーネン）／Edgar H. Schein（エドガー・シャイン）／初出: 1979年、6つの対をなす社会化戦術（集合的/個別的・公式的/非公式的・連続的/変動的・固定的/可変的・連続的[serial]/分離的[disjunctive]・付与的[investiture]/剥奪的[divestiture]）を整理し、制度化された戦術 対 個人化された戦術として類型化',
    asOf: '2026-06',
    sources: [
      { url: 'https://psychology.iresearchnet.com/industrial-organizational-psychology/organizational-development/organizational-socialization/', type: 'reference', label: 'iResearchNet（I/O心理学リファレンス）: Organizational Socialization — 定義・6戦術・プロセス' },
      { url: 'https://digitalcommons.uri.edu/cgi/viewcontent.cgi?article=1043&context=lrc_paper_series', type: 'academic', label: 'University of Rhode Island DigitalCommons — Van Maanen & Schein (1979) 6戦術と制度化/個別化の整理' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S0001879106001205', type: 'academic', label: 'Saks, Uggerslev & Fassina (2007), Journal of Vocational Behavior — 社会化戦術と新人適応のメタ分析' },
    ],
  },
  {
    id: 'human-emotional-intelligence',
    discipline: 'human-science',
    title: '情動知能（EQ）',
    statement:
      '情動知能（EI／EQ）とは、自己および他者の感情を正確に知覚・理解し、感情を用いて思考を促進し、感情を適切に調整・管理する能力を指す。心理学者ピーター・サロベイとジョン・メイヤーが1990年の論文で「自他の感情をモニターし区別し、その情報を思考と行動に活用する能力」と定義して学術概念として提唱し、1997年に(1)感情の知覚、(2)感情による思考の促進、(3)感情の理解、(4)感情の管理という4枝（four-branch）の能力モデルとして定式化した（能力モデル、測定はMSCEIT）。' +
      'ダニエル・ゴールマンが1995年の著書『EQ こころの知能指数』で一般に広め、ビジネス・教育・リーダーシップ分野で注目された。一方、ゴールマンらの混合モデルは能力に性格特性・動機づけを混在させるため、概念の曖昧さや測定・予測妥当性をめぐる批判があり、能力モデルと特性モデルの区別が論点となる。',
    keyFigures: 'ピーター・サロベイ（Peter Salovey）／ジョン・メイヤー（John D. Mayer）／初出: Salovey & Mayer (1990), Imagination, Cognition, and Personality 9, 185–211／4枝モデル定式化: Mayer & Salovey (1997)／一般普及: ダニエル・ゴールマン（Daniel Goleman, 1995）',
    asOf: '2026-06',
    sources: [
      { url: 'https://nobaproject.com/modules/emotional-intelligence', type: 'academic', label: 'Noba Project（査読制オープン心理学教科書）「Emotional Intelligence」— 定義・能力/混合モデル・MSCEIT' },
      { url: 'https://www.ebsco.com/research-starters/health-and-medicine/emotional-intelligence-ei', type: 'reference', label: 'EBSCO Research Starters「Emotional Intelligence (EI)」— 能力/混合/特性モデルとGoleman混合モデル批判' },
      { url: 'https://journals.sagepub.com/doi/10.2190/DUGG-P24E-52WK-6CDG', type: 'academic', label: 'Salovey, P. & Mayer, J. D. (1990) “Emotional Intelligence”, Imagination, Cognition, and Personality 9:185–211（初出・査読論文）' },
      { url: 'http://exploresel.gse.harvard.edu/frameworks/4/', type: 'academic', label: 'Harvard GSE Explore SEL「Four Branch Model of Emotional Intelligence」' },
    ],
  },
  {
    id: 'bizlaw-risk-bearing',
    discipline: 'business-law',
    title: '危険負担（民法536条）',
    statement:
      '危険負担とは、双務契約において一方の債務（例：特定物の引渡し）が当事者双方の責めに帰することができない事由（不可抗力など）で履行不能となり消滅した場合に、その対価である他方の債務（例：代金支払）をどちらが負担するかという問題である。2017年改正・2020年4月施行の現行民法536条1項は、当事者双方の責めに帰することができない事由により債務を履行できなくなったとき、債権者は反対給付の履行を拒むことができると定める（履行拒絶構成）。' +
      '改正前は反対債務が当然に消滅する債務消滅構成だったが、解除制度の整備に伴い改められた（反対債務を消滅させるには別途「契約の解除」が必要となる）。536条2項は、債権者の責めに帰すべき事由による履行不能のときは債権者は反対給付の履行を拒めず、債務者は自己の債務を免れて得た利益を償還すると定める。なお特定物売買では引渡し時以後の滅失・損傷の危険が買主に移転する（567条）。',
    keyFigures: '現行536条1項＝双方無責の履行不能で債権者は反対給付の履行を拒める（履行拒絶構成）／改正前は反対債務が当然消滅する債務消滅構成だった（2017改正・2020年4月施行で転換）／反対債務を消滅させるには別途「契約の解除」が必要／536条2項＝債権者の帰責事由による履行不能では債権者は履行を拒めず、債務者は免れた債務で得た利益を償還／関連：567条（引渡し時の危険移転）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（law id 129AC0000000089）— 第536条・第567条の条文' },
      { url: 'https://www.moj.go.jp/content/000125963.pdf', type: 'government', label: '法務省「雇用に関する危険負担（民法536条2項）について」' },
      { url: 'https://keiyaku-watch.jp/media/keiyakuruikei/minpo202004_kikenfutan/', type: 'media', label: '契約ウォッチ「危険負担とは？2020年4月施行 改正ポイント解説」' },
    ],
  },
  {
    id: 'infosoc-computational-social-science',
    discipline: 'information-sociology',
    title: '計算社会科学',
    statement:
      'デジタル化に伴い大規模に生成される行動データ（ソーシャルメディア・携帯電話・取引・センサー等のビッグデータ）と、計算的手法（機械学習・ネットワーク分析・エージェントベース・シミュレーション・自然言語処理）を組み合わせ、人間の個人・集団・社会の振る舞いを定量的・実証的に研究する学際的分野。従来の調査・実験では捉えにくかった大規模・リアルタイム・実世界の社会現象（情報拡散、世論形成、人の移動、ネットワーク構造）を観測・分析できる「新しい望遠鏡」とされる。' +
      '一方、プラットフォーム企業によるデータの囲い込み、プライバシー・倫理、再現性、代表性（サンプルの偏り）といった課題も主要な論点となる。情報理論やプロファイリングとは区別される、ビッグデータと計算手法による社会の実証研究を指す概念である。',
    keyFigures: 'デイビッド・レイザー（David Lazer）ら15名／初出: D. Lazer et al. “Computational Social Science”, Science 323巻5915号 721–723頁 (2009)（分野確立を象徴するマニフェスト的論文）／主要共著者にA. Pentland, A.-L. Barabási, N. Christakis, J. Fowler, Gary King, M. Macy ら',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.science.org/doi/10.1126/science.1167742', type: 'academic', label: 'Lazer, D. et al. “Computational Social Science,” Science 323(5915):721–723 (2009)（分野の基礎論文）' },
      { url: 'https://en.wikipedia.org/wiki/Computational_social_science', type: 'reference', label: 'Wikipedia「Computational social science」（定義・手法・ビッグデータの位置づけ）' },
      { url: 'https://www.sydney.edu.au/arts/news-and-events/news/2022/06/23/what-is-computational-social-science.html', type: 'academic', label: 'University of Sydney「What is computational social science?」（大学による分野解説）' },
    ],
  },
  {
    id: 'econ-overlapping-generations',
    discipline: 'economics',
    title: '世代重複モデル（OLG）',
    statement:
      '各時点に生まれた時期の異なる複数の世代（典型的には若年期と老年期の2世代）が同時に存在し、世代が部分的に重なり合いながら入れ替わっていく状況をモデル化したマクロ経済学の分析枠組み。各個人は有限の寿命を持ち、若年期に働いて所得を得て一部を貯蓄し、老年期にそれを取り崩して消費する（ライフサイクル的行動）。無限に生きる代表的個人を仮定するラムゼイ＝キャス＝クープマンス型モデルと対比される。' +
      '重要な含意として、市場均衡（競争均衡）が必ずしもパレート効率的でない（第一厚生定理が成立せず、動学的非効率＝過剰貯蓄・過剰資本蓄積が生じうる）こと、公的年金（賦課方式）・国債・貨幣の役割を分析できることがある。年金・財政・世代間の資源配分・公的債務の持続可能性の分析に広く用いられる。',
    keyFigures: 'ポール・サミュエルソン（1958年「An Exact Consumption-Loan Model of Interest...」, Journal of Political Economy、消費貸借モデルとして定式化）／ピーター・ダイアモンド（1965年、資本蓄積を組み込んで一般化＝ダイアモンド成長モデル）／先駆としてモーリス・アレ（1947年）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Overlapping_generations_model', type: 'reference', label: 'Wikipedia「Overlapping generations model」（提唱史・Ramseyモデルとの対比・第一厚生定理の不成立）' },
      { url: 'https://economics.mit.edu/sites/default/files/inline-files/Lecture%208%20-%20Overlapping%20Generations_1.pdf', type: 'academic', label: 'D. Acemoglu, MIT 14.452 Economic Growth, Lecture 8: Overlapping Generations' },
      { url: 'https://eml.berkeley.edu/~jsteinsson/teaching/OLG.pdf', type: 'academic', label: 'J. Steinsson, UC Berkeley 講義ノート「The OLG Model」（動学的効率性・社会保障・国債・貨幣）' },
    ],
  },
  {
    id: 'econ-merit-goods',
    discipline: 'economics',
    title: 'メリット財（価値財）',
    statement:
      'メリット財（merit good、価値財）とは、個人の自由な選択（消費者主権）に委ねると、社会的に望ましい水準よりも過少にしか消費・供給されないため、政府が補助・奨励、ときに義務化して消費を促すべきだとされる財・サービスである。教育、医療・予防接種、文化・芸術などが代表例とされる。消費者の支払い能力・意思ではなく「便益」の観点から、個人や社会がそれを持つべきだと判断される点に特徴がある。' +
      '標準的な厚生経済学が尊重する消費者主権とは異なり、個人の選好への政府介入を正当化する。その根拠として、(1)個人の選好の不完全さ（情報不足・近視眼・非合理性）、(2)外部性（教育・予防接種は本人以外にも便益）、(3)分配・温情主義（パターナリズム）が論じられる。逆に過剰消費が望ましくないため抑制すべき財を「デメリット財（demerit good、たばこ・アルコール・ギャンブル等）」と呼ぶ。非競合・非排除を特徴とする公共財とは別概念で、メリット財自体は私的財でありうる点に注意を要する。',
    keyFigures: 'リチャード・マスグレイブ（Richard Musgrave）が提唱／初出：論文「A Multiple Theory of Budget Determination」（FinanzArchiv, 1957）／体系化：著書『The Theory of Public Finance』（1959）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Merit_good', type: 'reference', label: 'Merit good — Wikipedia（定義・マスグレイブ1957/1959・過少消費・正の外部性・公共財との区別）' },
      { url: 'https://en.wikipedia.org/wiki/Demerit_good', type: 'reference', label: 'Demerit good — Wikipedia（対概念のデメリット財：たばこ・アルコール等の過剰消費）' },
      { url: 'https://en.wikipedia.org/wiki/Richard_Musgrave_(economist)', type: 'reference', label: 'Richard Musgrave (economist) — Wikipedia（提唱者と『The Theory of Public Finance』1959）' },
    ],
  },
  {
    id: 'human-forgetting-curve',
    discipline: 'human-science',
    title: '忘却曲線（エビングハウス）',
    statement:
      '学習した情報が時間の経過とともにどれだけ保持・忘却されるかを表す曲線。記憶は学習直後に急激に減衰し（最初の数時間〜1日で大きく失われる）、その後は緩やかに減衰して一定水準に漸近する。ドイツの心理学者ヘルマン・エビングハウスが自分自身を唯一の被験者とし、先行知識の影響を排した無意味綴り（子音-母音-子音のCVC、例「WID」「ZOF」）の記憶・再学習を測定して、1885年の著書『記憶について（Über das Gedächtnis）』で実証的に示した。' +
      '保持の指標として、再学習に要する手間の削減＝節約率（savings）を用いた点が方法論上の貢献で、再生できない項目でも再学習が容易になることから潜在的な記憶痕跡の存在を示した。時間をおいて反復する間隔反復・分散学習は、まとめて反復する集中学習より長期保持に優れ（間隔効果 spacing effect）、忘却を遅らせる。教育・eラーニング・学習設計に応用される。',
    keyFigures: 'ヘルマン・エビングハウス（Hermann Ebbinghaus, 1850–1909, ドイツの心理学者）／初出: 1885年『Über das Gedächtnis（記憶について／英訳 Memory: A Contribution to Experimental Psychology）』／関連: 節約法（savings method）・間隔効果（spacing effect）',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0120644', type: 'academic', label: 'Murre & Dros (2015) “Replication and Analysis of Ebbinghaus’ Forgetting Curve”, PLOS ONE（査読論文・忘却曲線の追試と解析）' },
      { url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9971077/', type: 'academic', label: 'NCBI PMC 掲載査読論文「Why Ebbinghaus’ savings method from 1885 is a very ‘pure’ measure of memory performance」' },
      { url: 'https://en.wikipedia.org/wiki/Forgetting_curve', type: 'reference', label: 'Wikipedia「Forgetting curve」（曲線の定義と式）' },
      { url: 'https://en.wikipedia.org/wiki/Hermann_Ebbinghaus', type: 'reference', label: 'Wikipedia「Hermann Ebbinghaus」（提唱者の経歴・無意味綴り・初出年）' },
    ],
  },
  {
    id: 'bizlaw-comparative-negligence',
    discipline: 'business-law',
    title: '過失相殺（民法418条・722条2項）',
    statement:
      '過失相殺とは、損害の発生・拡大について被害者（債権者）の側にも過失があった場合に、損害賠償額を定めるにあたりその過失を考慮して賠償額を減額する制度であり、損害の公平な分担という公平の理念に基づく。民法は二つの規定を置く。債務不履行については418条が、債務の不履行又はこれによる損害の発生・拡大に関して債権者に過失があったとき、裁判所はこれを考慮して損害賠償の「責任及びその額」を定めると規定し、考慮は必要的である。' +
      '不法行為については722条2項が、被害者に過失があったとき、裁判所はこれを考慮して損害賠償の「額」を定めることが「できる」と規定し、考慮は任意的・裁量的で対象は額の減額に限られる（責任の有無は対象外）。両者は、考慮が必須か裁量か、また責任の有無まで考慮できるかという点で異なる。交通事故の賠償実務で過失割合として広く用いられ、被害者本人だけでなく身分上・生活関係上一体をなす「被害者側」の過失も考慮されうる（判例）。',
    keyFigures: '418条＝債務不履行の過失相殺・考慮は必要的（裁判所は「定める」）・責任の有無と額の双方を考慮可／722条2項＝不法行為の過失相殺・考慮は任意的（「定めることができる」）・額の減額のみで責任の有無は対象外／制度趣旨＝損害の公平な分担／判例＝「被害者側」の過失も考慮されうる／交通事故の過失割合として実務で広く用いられる',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（law id 129AC0000000089）— 第418条・第722条の条文' },
      { url: 'https://www.u-tokyo.ac.jp/biblioplaza/ja/A_00219.html', type: 'academic', label: '東京大学 UTokyo BiblioPlaza「過失相殺の原理と社会」' },
      { url: 'https://www.moj.go.jp/content/000059836.pdf', type: 'government', label: '法務省 民法（債権関係）部会資料（改正検討事項・過失相殺）' },
    ],
  },
  {
    id: 'infosoc-diffusion-of-innovations',
    discipline: 'information-sociology',
    title: 'イノベーションの普及理論（ロジャーズ）',
    statement:
      '新しいアイデア・技術・製品（イノベーション）が、社会システムの成員の間に、コミュニケーション・チャネルを通じて時間とともに伝播・採用されていく過程を説明する理論。エベレット・ロジャーズが1962年の著書『Diffusion of Innovations』で体系化した。採用の早さによって採用者を、イノベーター（革新者、約2.5%）、アーリーアダプター（初期採用者、約13.5%）、アーリーマジョリティ（前期多数派、約34%）、レイトマジョリティ（後期多数派、約34%）、ラガード（遅滞者、約16%）の5カテゴリーに分類する（割合は正規分布＝ベル型曲線の標準偏差区分に基づく）。' +
      '累積採用率は時間とともにS字曲線を描く。普及速度を左右するイノベーションの属性として、相対的優位性・適合性・複雑性・試行可能性・観察可能性の5つを挙げ、オピニオンリーダー（アーリーアダプターが担う）の役割を重視する。ジェフリー・ムーアの「キャズム」はこの理論を基にした派生概念である。',
    keyFigures: 'エベレット・M・ロジャーズ（Everett M. Rogers, 提唱者）／初出『Diffusion of Innovations』(1962年)／5採用者カテゴリー・S字曲線・5つの普及属性',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/diffusion-of-innovations', type: 'reference', label: 'Encyclopaedia Britannica「Diffusion of innovations」' },
      { url: 'https://sphweb.bumc.bu.edu/otlt/mph-modules/sb/behavioralchangetheories/behavioralchangetheories4.html', type: 'academic', label: 'Boston University School of Public Health「Diffusion of Innovation Theory」（大学教材）' },
      { url: 'https://en.wikipedia.org/wiki/Diffusion_of_innovations', type: 'reference', label: 'Wikipedia「Diffusion of innovations」' },
    ],
  },
  {
    id: 'econ-optimal-taxation',
    discipline: 'economics',
    title: '最適課税論',
    statement:
      '一定の税収を確保するという制約のもとで、課税が生む効率の損失（死荷重・超過負担）を最小化し、社会厚生を最大化する税の構造（税率・課税ベース）を設計する公共経済学の理論。中心課題は「効率（超過負担の最小化）」と「公平（再分配）」のトレードオフの最適化にある。代表的成果として、(1)ラムゼイ・ルール（最適物品税）は、需要・供給が非弾力的な財ほど高く課税すれば超過負担が小さくなるとする逆弾力性ルールを示す。' +
      '(2)最適所得税論では、政府が各人の稼得能力を直接観察できない情報の非対称性のもとで、労働インセンティブを過度に損なわないよう再分配する最適な非線形所得税が分析され、効率と公平のトレードオフから、最高限界税率が意外に低くなりうる・限界税率が逓減的でありうる等の結論が導かれた。情報制約を明示的に組み込んだ点が画期的で、現実の税制改革・税率設計の規範的指針となる。',
    keyFigures: 'フランク・ラムゼイ（Frank P. Ramsey, 最適物品税の逆弾力性ルール, 初出 “A Contribution to the Theory of Taxation”, Economic Journal, 1927）／ジェームズ・ミルリーズ（James A. Mirrlees, 最適非線形所得税論, 初出 1971, Review of Economic Studies）／ミルリーズは情報の非対称性下の誘因理論への貢献によりヴィックリーと共に1996年ノーベル経済学賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1996/summary/', type: 'government', label: 'NobelPrize.org — 1996年経済学賞（Mirrlees・Vickrey、情報の非対称性下の誘因の経済理論）' },
      { url: 'https://en.wikipedia.org/wiki/Optimal_tax', type: 'reference', label: 'Wikipedia「Optimal tax」— ラムゼイ・ルール、逆弾力性、効率・公平のトレードオフ' },
      { url: 'https://en.wikipedia.org/wiki/Optimal_labor_income_taxation', type: 'reference', label: 'Wikipedia「Optimal labor income taxation」— ミルリーズ最適所得税論と情報の非対称性' },
      { url: 'https://en.wikipedia.org/wiki/Ramsey_problem', type: 'reference', label: 'Wikipedia「Ramsey problem」— ラムゼイ問題（1927）と逆弾力性ルール' },
    ],
  },
  {
    id: 'mgmt-strategic-hrm',
    discipline: 'management',
    title: '戦略的人的資源管理（SHRM）',
    statement:
      '採用・育成・評価・報酬・配置などの人的資源管理（HRM）施策を、個別・事後的な管理機能としてではなく、組織の経営戦略と統合し、戦略目標の達成と持続的な競争優位の獲得に体系的に貢献させようとする考え方・研究分野。1980年代以降、人材を単なるコストではなく資源ベース理論にいう競争優位の源泉（人的資本）と捉える視座から発展した。中核概念は二つの適合で、(1)外的適合（vertical fit／HR施策を経営戦略に整合させる）と、(2)内的適合（horizontal fit／HR施策間の一貫性・束＝bundle）からなる。' +
      '理論的立場には、状況により最適なHRが異なるとするコンティンジェンシー（適合）アプローチと、どの組織でも有効な優れた実践があるとするベストプラクティス（普遍）アプローチ（高業績作業システムHPWS／高関与・高コミットメント型HRM）があり、HR施策と組織業績（生産性・財務）の関係を実証する研究が蓄積されている。',
    keyFigures: '資源ベース理論を人的資源に応用し人材を競争優位の源泉と捉える視座（J.バーニーら）が理論的基盤／P.ライト＆G.マクマハンらが外的適合・内的適合を軸にSHRMを理論化／J.デラリー＆D.ドティが普遍・コンティンジェンシー・コンフィギュレーショナルの3様式を整理／M.ヒューゼリッド（1995, Academy of Management Journal）がHR-業績リンクを実証',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Human_resource_management', type: 'reference', label: 'Wikipedia「Human resource management」— HRMの戦略的・統合的アプローチ' },
      { url: 'https://en.wikipedia.org/wiki/Strategic_human_resource_planning', type: 'reference', label: 'Wikipedia「Strategic human resource planning」— HRMと全社戦略の結合' },
      { url: 'https://en.wikipedia.org/wiki/Mark_A._Huselid', type: 'reference', label: 'Wikipedia「Mark A. Huselid」— 1995 AMJ論文（38(3):635–672）でHR慣行と業績の関係を実証' },
      { url: 'https://en.wikipedia.org/wiki/Strategic_fit', type: 'reference', label: 'Wikipedia「Strategic fit」— 適合（fit）と資源ベース理論・競争優位の関係' },
    ],
  },
  {
    id: 'human-multiple-intelligences',
    discipline: 'human-science',
    title: '多重知能理論（ガードナー）',
    statement:
      '知能は、IQテストが測る単一・一般的な能力（g因子）ではなく、相互に比較的独立した複数の知能から成るとする理論。ハワード・ガードナーが1983年の著書『Frames of Mind（精神の枠組み）』で提唱した。初版では言語的・論理数学的・音楽的・身体運動的・空間的・対人的・内省（個人内）的の7つを挙げ、後に博物（自然探究）的知能を加えて計8つとした（実存的知能を第9の候補として検討）。各知能は比較的独立し、人ごとに得意・不得意の組合せ（プロファイル）が異なるとされ、教育現場で画一的でない多様な学び方・才能の尊重として大きな影響を与えた。' +
      '一方で学術的・心理測定的には、各知能が実際には正の相関を示しg因子を支持する点、検証可能性・査読の弱さ、知能と才能・認知スタイルの混同、gを超える予測的妥当性のエビデンス不足などの批判が強く、主流の知能研究（CHC理論など）では支持は限定的である。',
    keyFigures: 'ハワード・ガードナー（Howard Gardner、提唱者）／初出：著書『Frames of Mind: The Theory of Multiple Intelligences』（1983年、初版7知能・後に博物的を追加）／所属：ハーバード教育大学院・Project Zero',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/multiple-intelligences', type: 'reference', label: 'Encyclopædia Britannica「Multiple intelligences」（8つの知能と定義）' },
      { url: 'https://pz.harvard.edu/resources/the-theory-of-multiple-intelligences-as-psychology-as-education-as-social-science', type: 'academic', label: 'Harvard Project Zero「The Theory of Multiple Intelligences」（ガードナー所属の研究機関）' },
      { url: 'https://en.wikipedia.org/wiki/Theory_of_multiple_intelligences', type: 'reference', label: 'Wikipedia「Theory of multiple intelligences」（初版7知能・後の追加、g因子との相関・批判）' },
    ],
  },
  {
    id: 'bizlaw-negotiorum-gestio',
    discipline: 'business-law',
    title: '事務管理（民法697条）',
    statement:
      '事務管理とは、法律上の義務がないのに他人のためにその事務の処理を始める行為をいい、不当利得・不法行為と並ぶ法定債権関係（契約によらず法律上当然に債権・債務が生じる関係）の一つである。義務なく他人の事務の管理を始めた者（管理者）は、その事務の性質に従い、最も本人の利益に適合する方法で管理しなければならない（697条1項）。本人の意思を知っているとき又は推知できるときは、その意思に従って管理する（697条2項）。' +
      '本来は他人の生活領域への干渉だが、相互扶助・社会連帯の観点から一定の要件のもとで適法とされ違法性が阻却される（例：隣人の留守中に台風で壊れた屋根を修理する、迷子を保護する）。管理を始めた以上は本人等が管理できるまで原則として継続する義務があり（700条）、本人のために有益な費用を支出したときは本人に償還を請求できる（702条1項）。一方、報酬は原則として請求できない（委任と異なる）。',
    keyFigures: '697条1項＝義務なく他人の事務を最も本人の利益に適合する方法で管理する義務／697条2項＝本人の意思を知り又は推知できるときはその意思に従う／700条＝管理継続義務／702条1項＝有益費用の償還請求権／報酬は原則請求できない（委任と異なる）／不当利得・委任とは別概念の法定債権関係／e-Gov民法 law id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第三章 事務管理 第697条〜第702条' },
      { url: 'https://ja.wikipedia.org/wiki/事務管理', type: 'reference', label: 'Wikipedia「事務管理」— 法定債権・継続義務・費用償還の概説' },
      { url: 'https://ja.wikibooks.org/wiki/民法第697条', type: 'reference', label: 'Wikibooks 民法第697条（条文・解説）' },
    ],
  },
  {
    id: 'infosoc-disinformation',
    discipline: 'information-sociology',
    title: '誤情報・偽情報（情報の無秩序）',
    statement:
      '事実と異なる、あるいは害をなす情報を、その「真偽」だけでなく発信者の「意図（害意）」によって類型化する概念枠組み。(1)ミスインフォメーション（誤情報）は内容が虚偽・不正確だが、発信者に他者を害する意図がなく、誤解や確認不足によって拡散されるもの。(2)ディスインフォメーション（偽情報）は、他者・組織・国家を害する意図をもって意図的に作成・流布される虚偽情報。(3)マルインフォメーション（悪意ある情報）は、事実に基づくが私的情報の暴露や文脈の剥奪により害を与える目的で用いられるもの。' +
      'クレア・ウォードルとホセイン・デラクシャンは欧州評議会の2017年報告書でこの三類型を「情報の無秩序（information disorder）」として体系化した。SNSでの拡散、フェイクニュース、ファクトチェック、プラットフォーム規制、選挙やインフォデミック（WHO）への影響が主要論点となる。',
    keyFigures: 'クレア・ウォードル（Claire Wardle）／ホセイン・デラクシャン（Hossein Derakhshan、「malinformation」の命名者）／初出: 欧州評議会報告書『Information Disorder: Toward an interdisciplinary framework for research and policy making』(Council of Europe, 2017)／関連: WHO「インフォデミック」概念(2020)',
    asOf: '2026-06',
    sources: [
      { url: 'https://rm.coe.int/information-disorder-toward-an-interdisciplinary-framework-for-researc/168076277c', type: 'government', label: 'Wardle & Derakhshan, “Information Disorder”, Council of Europe (2017)' },
      { url: 'https://www.cisa.gov/sites/default/files/publications/tactics-of-disinformation_508.pdf', type: 'government', label: 'CISA “Tactics of Disinformation”（mis-/dis-/mal-information の定義）' },
      { url: 'https://en.wikipedia.org/wiki/Disinformation', type: 'reference', label: 'Wikipedia: Disinformation' },
    ],
  },
  {
    id: 'econ-modern-portfolio-theory',
    discipline: 'economics',
    title: '現代ポートフォリオ理論（MPT）',
    statement:
      'リスク資産への投資において、個々の資産の期待リターンとリスク（分散・標準偏差）、および資産間の相関（共分散）を考慮し、複数資産を組み合わせて分散投資することで、与えられた期待リターンに対しリスクを最小化（または与えられたリスクに対し期待リターンを最大化）する最適ポートフォリオを構築する理論。平均-分散分析（mean-variance analysis）とも呼ばれる。投資家はリスク回避的で、リターンと分散のみで判断すると仮定する。' +
      '核心は、資産のリスク・リターンは単独ではなくポートフォリオ全体への寄与で評価すべきという点であり、ポートフォリオのリスクは各資産の分散だけでなく資産間の共分散にも依存する。相関の低い資産を組み合わせると全体リスクを個別リスクの加重平均より下げられる（分散効果）。達成可能な最良（最小リスク）のポートフォリオ集合を「効率的フロンティア（efficient frontier）」として描く。後の資本資産価格モデル（CAPM）の基礎となった。',
    keyFigures: 'ハリー・マーコウィッツ（Harry Markowitz）が提唱／初出は論文「Portfolio Selection」（The Journal of Finance, 1952年3月, 7(1):77-91）／効率的フロンティアも1952年に定式化／1990年ノーベル経済学賞（M.ミラー・W.シャープと共同受賞）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/uploads/2018/06/markowitz-lecture.pdf', type: 'government', label: 'Harry M. Markowitz, “Foundations of Portfolio Theory,” Nobel Lecture, 1990 (NobelPrize.org 公式PDF)' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1990/press-release/', type: 'government', label: 'The Sveriges Riksbank Prize in Economic Sciences 1990 — Press Release (NobelPrize.org)' },
      { url: 'https://en.wikipedia.org/wiki/Modern_portfolio_theory', type: 'reference', label: 'Modern portfolio theory — Wikipedia' },
      { url: 'https://www.britannica.com/money/modern-portfolio-theory-explained', type: 'reference', label: 'Modern Portfolio Theory — Britannica Money' },
    ],
  },
  {
    id: 'econ-capm',
    discipline: 'economics',
    title: '資本資産価格モデル（CAPM）',
    statement:
      '市場が均衡しているとき、ある資産の期待リターンがそのリスクに応じてどう決まるかを説明するモデル。中心式は「期待リターン ＝ リスクフリーレート ＋ β ×（市場ポートフォリオの期待リターン − リスクフリーレート）」で、末項のカッコ内をマーケット・リスクプレミアムと呼ぶ。核心は、分散投資で消去できる個別資産固有の非システマティック・リスクは市場で価格付けされず、分散投資で消去できないシステマティック・リスク（市場全体への連動）のみが、その感応度を表す係数 β を通じてリターンに反映される、という点にある。' +
      'マーコウィッツの現代ポートフォリオ理論を基礎とし、資本コスト推定や資産評価に広く用いられるが、同質的期待・効率的市場・自由な借入などの前提や、規模・バリュー効果（ファマ＝フレンチ3ファクターモデル）の存在といった実証的妥当性への批判もある。',
    keyFigures: 'ウィリアム・シャープ（William Sharpe, 1964／1990年ノーベル経済学賞）／ジョン・リントナー（John Lintner, 1965）／ヤン・モッシン（Jan Mossin, 1966）が1960年代に独立に展開／ハリー・マーコウィッツ（現代ポートフォリオ理論の基礎）／批判: ユージン・ファマ＆ケネス・フレンチ（3ファクターモデル）',
    asOf: '2026-06',
    sources: [
      { url: 'https://mba.tuck.dartmouth.edu/bespeneckbo/default/AFA611-Eckbo%20web%20site/AFA611-S6B-FamaFrench-CAPM-JEP04.pdf', type: 'academic', label: 'Fama & French, “The Capital Asset Pricing Model: Theory and Evidence,” Journal of Economic Perspectives 18(3), 2004（Dartmouth/Tuck ホスト）' },
      { url: 'https://en.wikipedia.org/wiki/Capital_asset_pricing_model', type: 'reference', label: 'Wikipedia: Capital asset pricing model（Sharpe/Lintner/Mossin 独立展開・β・システマティックリスク）' },
      { url: 'https://corporatefinanceinstitute.com/resources/valuation/what-is-capm-formula/', type: 'reference', label: 'Corporate Finance Institute: What is CAPM — Formula, Example' },
      { url: 'https://en.wikipedia.org/wiki/Fama%E2%80%93French_three-factor_model', type: 'reference', label: 'Wikipedia: Fama–French three-factor model（CAPM への実証的批判の典拠）' },
    ],
  },
  {
    id: 'mgmt-design-thinking',
    discipline: 'management',
    title: 'デザイン思考',
    statement:
      'デザイナーの思考様式・手法を、製品デザインに限らずビジネスや社会の複雑な問題の解決・イノベーション創出に応用する、人間中心（human-centered）で反復的な問題解決アプローチ。ユーザー（人間）の真のニーズへの深い理解（共感）から出発し、試作（プロトタイプ）と検証を素早く繰り返して解決策を磨く点が特徴で、発散（選択肢を広げる）と収束（選択肢を絞る）を交互に繰り返す。' +
      'スタンフォード大学のd.school（Hasso Plattner Institute of Design）が広めた代表的な5段階プロセスは、(1)共感（Empathize：観察・対話でユーザーを理解）、(2)問題定義（Define：本質的課題を明確化）、(3)アイデア創出（Ideate：ブレインストーミング等で発想を拡張）、(4)プロトタイプ（Prototype：素早く形にする）、(5)テスト（Test：ユーザーで検証し学ぶ）から成る。実際には非線形で各段階を行き来する。リーン・スタートアップやオープンイノベーションとは別概念。',
    keyFigures: '普及者：ティム・ブラウン（Tim Brown、IDEO、2008年Harvard Business Review論文「Design Thinking」）／デヴィッド・ケリー（David Kelley、IDEO創業者）がスタンフォードd.schoolを創設し5段階プロセスを広めた／思想的源流：ハーバート・サイモン（『The Sciences of the Artificial』1969）、ロルフ・ファステら／要点：人間中心・反復的・発散と収束の往復',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/2008/06/design-thinking', type: 'media', label: 'Tim Brown, “Design Thinking,” Harvard Business Review (June 2008) — 経営文脈での普及の一次資料' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/design-thinking', type: 'reference', label: 'EBSCO Research Starters: Design Thinking — 学術リファレンス（定義・サイモン源流）' },
      { url: 'https://onlinelibrary.wiley.com/doi/10.1111/jpim.12594', type: 'academic', label: 'Auernhammer & Roth (2021), Journal of Product Innovation Management — Stanfordにおけるデザイン思考の起源と発展（査読論文）' },
      { url: 'https://dschool.stanford.edu/', type: 'academic', label: 'Stanford d.school (Hasso Plattner Institute of Design) 公式 — 5段階プロセスの普及元' },
    ],
  },
  {
    id: 'human-classical-conditioning',
    discipline: 'human-science',
    title: '古典的条件づけ（パブロフ）',
    statement:
      '生得的に特定の反応（無条件反応 UR、例：唾液分泌）を引き起こす無条件刺激（US、例：食物）と、本来は反応を引き起こさない中性刺激（例：メトロノームやベルの音）を繰り返し対提示することで、やがて中性刺激だけでも同様の反応が生じるようになる連合学習の様式。条件づけが成立すると中性刺激は「条件刺激（CS）」となり、それが引き起こす反応は「条件反応（CR）」と呼ばれる。ロシアの生理学者イワン・パブロフが犬の唾液分泌の研究中に発見・体系化した。' +
      '関連概念に、CSのみの反復でCRが弱まる「消去」、休止後にCRが一時的に再出現する「自発的回復」、類似刺激へ反応が広がる「般化」、刺激を区別する「分化（弁別）」がある。ワトソンの「アルバート坊やの実験」（恐怖条件づけ）など情動学習の基礎をなし、自発的行動と結果による学習であるスキナーのオペラント条件づけとは区別される。',
    keyFigures: 'イワン・パブロフ（Ivan Pavlov、ロシアの生理学者、条件反射の概念を確立、1904年ノーベル生理学・医学賞は消化の研究に対して受賞）／ジョン・B・ワトソン（John B. Watson、レイナーとの「アルバート坊やの実験」1920年で恐怖条件づけを実証）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Ivan-Pavlov', type: 'reference', label: 'Encyclopaedia Britannica — Ivan Pavlov（生涯・条件反射・1904年ノーベル賞）' },
      { url: 'https://www.nobelprize.org/prizes/medicine/1904/pavlov/lecture/', type: 'government', label: 'The Nobel Prize — Physiology or Medicine 1904, Ivan Pavlov（公式記録）' },
      { url: 'https://www.ncbi.nlm.nih.gov/books/NBK470326/', type: 'academic', label: 'StatPearls (NCBI Bookshelf) — Classical Conditioning（US/UR/CS/CR・消去等）' },
      { url: 'https://www.apa.org/ed/precollege/topss/lessons/activities/classical-conditioning.pdf', type: 'academic', label: 'American Psychological Association (APA) — Classical Conditioning 教材' },
    ],
  },
  {
    id: 'bizlaw-suretyship',
    discipline: 'business-law',
    title: '保証契約・連帯保証（民法446条）',
    statement:
      '保証とは、主たる債務者が債務を履行しない場合に保証人がその履行をする責任を負う制度である（民法446条1項）。保証契約は債権者と保証人との間で結ばれ、書面（又は電磁的記録）によらなければ効力を生じない要式契約である（446条2項・3項）。保証債務は主たる債務の存在を前提とし、これに従属する（付従性）。通常の保証人は、まず主たる債務者に請求せよと求める催告の抗弁権（452条）と、主たる債務者に弁済資力がありかつ執行が容易であることを証明して主たる債務者の財産から先に執行せよと求める検索の抗弁権（453条）を持ち、複数保証人がいるときは頭数で債務が分割される分別の利益も有する。' +
      'これに対し連帯保証は主たる債務者と連帯して債務を負うもので、これら催告・検索の抗弁権および分別の利益がなく（454条）、債権者はいきなり連帯保証人に全額請求できるため実務上多用される。2017年改正・2020年4月施行の現行民法は、個人根保証契約に極度額の定めを要求し（なければ無効、465条の2）、事業に係る債務の個人保証に公正証書による保証意思確認を要する（465条の6）など、安易な保証から保証人を保護する規律を強化した。',
    keyFigures: '446条1項＝保証人は主債務者が履行しないとき履行責任／446条2項・3項＝書面又は電磁的記録による要式契約／付従性＝主たる債務に従属／452条＝催告の抗弁権／453条＝検索の抗弁権／456条＝分別の利益／454条＝連帯保証は催告・検索の抗弁権および分別の利益なし／2017年改正・2020年4月施行／465条の2＝個人根保証は極度額の定めなければ無効／465条の6＝事業債務の個人保証は公正証書による保証意思確認',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号、law id 129AC0000000089）446条以下' },
      { url: 'https://www.moj.go.jp/content/001399956.pdf', type: 'government', label: '法務省「2020年４月１日から 保証に関する民法のルールが大きく変わります」' },
      { url: 'https://ja.wikibooks.org/wiki/民法第446条', type: 'reference', label: 'Wikibooks 民法第446条（条文・コンメンタール）' },
    ],
  },
  {
    id: 'infosoc-gamification',
    discipline: 'information-sociology',
    title: 'ゲーミフィケーション',
    statement:
      'ゲーミフィケーション（gamification）とは、教育・健康・労働・マーケティング・行動変容などの非ゲーム的文脈に、ゲームに特徴的なデザイン要素（ポイント、バッジ、リーダーボード＝ランキング、レベル、達成目標、即時フィードバック、進捗の可視化、報酬・チャレンジ等）を取り入れ、利用者の動機づけ・エンゲージメント（関与）・行動を促す手法・考え方である。HCI（人間-コンピュータ相互作用）と情報社会学で論じられ、自己決定理論（内発的動機づけ）や行動経済学のナッジと結びつけて分析される。' +
      '一方、外発的報酬への依存が内発的動機を損なう懸念（アンダーマイニング／過正当化効果）、要素を点数化のみに矮小化する「ポイント化（pointsification）」批判、利用者を操作・搾取する設計への批判も中立に併存する。注意経済や自己決定理論とは別概念。',
    keyFigures: 'セバスチャン・デターディング（Sebastian Deterding）ら／初出論文「From Game Design Elements to Gamefulness: Defining Gamification」（MindTrek 2011, ACM）で「非ゲーム的文脈におけるゲームデザイン要素の利用」と学術的に定義／用語自体は2000年代後半に普及／関連批判: イアン・ボゴスト（exploitationware）、マーガレット・ロバートソン（pointsification）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Gamification', type: 'reference', label: 'Wikipedia「Gamification」— 非ゲーム的文脈へのゲームデザイン要素の統合、Deterding 2011 の引用、要素・批判' },
      { url: 'https://en.wikipedia.org/wiki/Sebastian_Deterding', type: 'reference', label: 'Wikipedia「Sebastian Deterding」— 提唱者と2011年定義論文・The Gameful World（MIT Press）' },
      { url: 'https://www.interaction-design.org/literature/topics/gamification', type: 'academic', label: 'Interaction Design Foundation（IxDF, HCI専門リファレンス）「What is Gamification?」' },
    ],
  },
  {
    id: 'econ-modigliani-miller',
    discipline: 'economics',
    title: 'モディリアーニ＝ミラーの定理（MM理論）',
    statement:
      '完全資本市場、税金・取引費用・倒産費用なし、情報の対称性、同一条件での借入が可能といった理想的条件のもとでは、企業価値はその資本構成（負債と自己資本の比率＝どう資金調達するか）に依存せず、その企業が生み出すキャッシュフロー（事業の収益力）と事業リスクのみで決まる、とする命題（第1命題＝資本構成の無関連性。無借入企業と借入企業の価値は等しい）。第2命題は、負債を増やすと財務リスクの増大に応じて自己資本コスト（株主の期待収益率）が上昇するため、加重平均資本コスト（WACC）は一定に保たれる、とする。' +
      '現実には法人税（負債利子の損金算入による節税効果＝タックスシールド）、倒産コスト、エージェンシーコスト、情報の非対称性が存在するため資本構成は企業価値に影響し、MM定理はそれらがなぜ・どう重要かを考える理論的ベンチマーク（出発点）となる。',
    keyFigures: 'フランコ・モディリアーニ（Franco Modigliani、ノーベル経済学賞1985）／マートン・ミラー（Merton Miller、ノーベル経済学賞1990）／初出: Modigliani & Miller “The Cost of Capital, Corporation Finance and the Theory of Investment”, American Economic Review 第48巻 pp.261-297（1958年）／1963年に法人税を組み込む改訂',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Modigliani%E2%80%93Miller_theorem', type: 'reference', label: 'Wikipedia「Modigliani–Miller theorem」（命題I/II・前提条件・税引後改訂）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1990/miller/facts/', type: 'government', label: 'NobelPrize.org — Merton Miller 経済学賞1990（コーポレートファイナンス理論への貢献）' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/modigliani-miller-theorems', type: 'reference', label: 'Encyclopedia.com「Modigliani-Miller Theorems」' },
    ],
  },
  {
    id: 'econ-black-scholes',
    discipline: 'economics',
    title: 'ブラック＝ショールズ・モデル',
    statement:
      'ヨーロピアン・オプション（満期にのみ権利行使できるオプション）の理論価格を求める数理モデルおよび偏微分方程式。原資産価格が幾何ブラウン運動（一定のドリフトとボラティリティをもつ対数正規過程）に従うと仮定し、オプションと原資産を適切に組み合わせて無リスクのポートフォリオを構成する（デルタ・ヘッジ）ことで、裁定機会のない（no-arbitrage）状態でオプション価格が満たすべきブラック＝ショールズ方程式を導く。' +
      '重要な特徴は、オプション価格が原資産価格・行使価格・満期までの期間・無リスク金利・原資産のボラティリティの5つで決まり、投資家のリスク選好や原資産の期待リターン（ドリフト）に依存しない（リスク中立評価）ことである。デリバティブ市場発展の基礎となった一方、一定ボラティリティ・連続取引・正規分布という前提は非現実的で、ボラティリティ・スマイルやファットテールとして限界が指摘される。',
    keyFigures: 'フィッシャー・ブラック（Fischer Black）／マイロン・ショールズ（Myron Scholes）が1973年の論文 “The Pricing of Options and Corporate Liabilities”（Journal of Political Economy 81巻3号）で発表／ロバート・マートン（Robert Merton）が数学的基礎を拡張・厳密化／ショールズとマートンが1997年ノーベル経済学賞（ブラックは1995年に死去）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1997/advanced-information/', type: 'government', label: 'NobelPrize.org — 1997年経済学賞 学術解説（リスク中立評価・5つの決定要因・受賞者）' },
      { url: 'https://www.sfu.ca/~kkasa/BlackScholes_73.pdf', type: 'academic', label: 'Black & Scholes (1973) “The Pricing of Options and Corporate Liabilities”, Journal of Political Economy 81(3):637-654（原論文）' },
      { url: 'https://econpapers.repec.org/RePEc:ucp:jpolec:v:81:y:1973:i:3:p:637-54', type: 'academic', label: 'EconPapers / RePEc — 原論文の書誌情報（掲載誌・巻号・頁）' },
      { url: 'https://en.wikipedia.org/wiki/Volatility_smile', type: 'reference', label: 'Wikipedia — ボラティリティ・スマイル（一定ボラティリティ・対数正規前提の破綻と限界）' },
    ],
  },
  {
    id: 'mgmt-lean-startup',
    discipline: 'management',
    title: 'リーン・スタートアップ',
    statement:
      '新事業・新製品開発のように不確実性が高い状況で、時間と資源の浪費を避けるために、最小限の機能を備えた試作品（MVP＝Minimum Viable Product、実用最小限の製品）を素早く市場に出し、顧客の反応をデータで計測し、その学びに基づいて製品・戦略を改善するか方向転換（ピボット）するかを判断する起業・経営手法。「構築（Build）→計測（Measure）→学習（Learn）」のフィードバックループを高速で回し、仮説を実地で検証する「検証による学習（validated learning）」を目標に据え、市場投入前の完璧主義を避ける点が核心である。' +
      'トヨタ生産方式（リーン生産）のムダ排除の思想、スティーブ・ブランクの顧客開発（customer development）モデル、アジャイル開発を基盤とし、エリック・リースが体系化・命名した。',
    keyFigures: 'エリック・リース（Eric Ries／提唱者・命名者、2008年のブログで命名し2011年の著書『The Lean Startup』で体系化）／スティーブ・ブランク（Steve Blank／顧客開発モデルの提唱者、基盤理論）',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/2013/05/why-the-lean-start-up-changes-everything', type: 'media', label: 'Steve Blank, “Why the Lean Start-Up Changes Everything,” Harvard Business Review, May 2013（共同提唱者による解説）' },
      { url: 'https://www.lean.org/lexicon-terms/lean-startup/', type: 'academic', label: 'Lean Enterprise Institute, Lean Lexicon: “Lean Startup”（専門機関の用語集）' },
      { url: 'https://theleanstartup.com/principles', type: 'media', label: 'Eric Ries, The Lean Startup — Methodology / Principles（提唱者本人による一次情報源）' },
      { url: 'https://en.wikipedia.org/wiki/Lean_startup', type: 'reference', label: 'Wikipedia: “Lean startup”' },
    ],
  },
  {
    id: 'human-theory-of-mind',
    discipline: 'human-science',
    title: '心の理論',
    statement:
      '心の理論（theory of mind, ToM）とは、自己および他者が信念・欲求・意図・知識・感情といった心的状態（mental states）を持つことを理解し、それらが現実とも自分の心的状態とも異なりうることを踏まえて、心的状態が行動の原因になると推論する能力である。心的状態は直接観察できないため、これは他者の行動を予測・説明するための「理論」とみなされる。' +
      '子どもの発達を測る代表的課題が「誤信念課題（false-belief task）」で、なかでもサリーとアン課題（Sally-Anne test）が有名であり、他者が現実と異なる誤った信念を持ちうることを理解できるかを問う（典型的には4〜5歳頃に通過）。共感・社会的相互作用・欺瞞・教育などの基盤をなし、帰属理論や愛着理論とは区別される別概念である。',
    keyFigures: 'デイヴィッド・プレマック（David Premack）／ガイ・ウッドラフ（Guy Woodruff）＝1978年論文「Does the chimpanzee have a theory of mind?」（Behavioral and Brain Sciences 1: 515–526）で用語を初出・導入／サイモン・バロン＝コーエン・アラン・レスリー・ウタ・フリス＝1985年にサリーとアン課題を用い自閉スペクトラム症児のToMの障害（マインドブラインドネス仮説）を提唱',
    asOf: '2026-06',
    sources: [
      { url: 'https://link.springer.com/rwe/10.1007/978-3-319-16999-6_3117-1', type: 'reference', label: 'Springer Nature — “Does the Chimpanzee Have Theory of Mind?”（プレマック&ウッドラフ1978の定義・初出）' },
      { url: 'https://en.wikipedia.org/wiki/Sally%E2%80%93Anne_test', type: 'reference', label: 'Wikipedia — Sally–Anne test（誤信念課題とBaron-Cohen, Leslie & Frith 1985）' },
      { url: 'https://direct.mit.edu/books/monograph/3890/MindblindnessAn-Essay-on-Autism-and-Theory-of-Mind', type: 'academic', label: 'MIT Press — Baron-Cohen “Mindblindness: An Essay on Autism and Theory of Mind”' },
    ],
  },
  {
    id: 'bizlaw-unauthorized-agency',
    discipline: 'business-law',
    title: '無権代理（民法113条・117条）',
    statement:
      '無権代理とは、代理権がないにもかかわらず他人（本人）の代理人として行った法律行為をいう。無権代理行為は、本人が追認しなければ本人に対して効力を生じない（民法113条1項）。本人は追認するか追認を拒絶するかを選べ、追認・拒絶は相手方に対してしなければその相手方に対抗できない（同条2項）。追認があれば、別段の意思表示がない限り契約時にさかのぼって本人に効力が帰属する（116条。ただし第三者の権利を害せない）。' +
      '相手方の保護として、相手方は本人に相当の期間を定めて追認の有無を催告でき、期間内に確答がなければ追認を拒絶したものとみなされる（114条）。また善意の相手方は本人が追認しない間は契約を取り消すことができる（115条）。本人が追認せず契約が帰属しない場合、無権代理人は、自己の代理権を証明できず本人の追認も得られないときは、相手方の選択に従い契約の履行又は損害賠償の責任を負う（117条1項。ただし相手方が悪意・有過失の場合や無権代理人が制限行為能力者であった場合等は責任を負わない＝117条2項）。表見代理（109条・110条・112条）成立時は別途本人が責任を負いうる。',
    keyFigures: '民法113条1項：本人の追認なき限り無権代理行為は本人に無効／113条2項：追認・追認拒絶は相手方に対してしなければ対抗不可／114条：相手方は催告でき無確答は追認拒絶とみなす／115条：善意の相手方は本人が追認しない間は契約を取消可／116条：追認は契約時に遡及（第三者の権利を害せない）／117条1項：無権代理人は履行又は損害賠償の責任／117条2項：相手方の悪意・有過失や無権代理人が制限行為能力者の場合は免責／表見代理（109・110・112条）成立時は別途本人が責任',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: '民法 | e-Gov 法令検索（law id 129AC0000000089）113条〜117条' },
      { url: 'https://tek-law.jp/civil-code/general-provisions/juridical-acts/agency/article-113/', type: 'media', label: '民法第113条（無権代理）｜tek-law.jp（弁護士 金子剛）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0117-00/', type: 'media', label: '民法 第117条【無権代理人の責任】｜クレアール司法書士講座' },
    ],
  },
  {
    id: 'infosoc-hybrid-media-system',
    discipline: 'information-sociology',
    title: 'ハイブリッド・メディア・システム',
    statement:
      '現代のメディア環境を、テレビ・新聞・ラジオなどの「古い（オールド）メディア」と、インターネット・ソーシャルメディアなどの「新しい（ニュー）メディア」が単純に置き換わるのではなく、両者のメディア・ロジック（技術・ジャンル・規範・行動・組織形態の束）が相互に絡み合い、対立・競争しながらも適応と相互依存によって共存・融合する複合的システムとして捉える概念。新旧の二分法を退け、論理の交差・ハイブリッド化に注目する。' +
      '政治的アクター（政治家・ジャーナリスト・活動家・市民）は複数のメディアの論理を戦略的に使い分け・横断して情報フローを生成・操作し、権力やニュースの流れを形成する。ニュースの生成はオンラインとオフラインを往還する循環的な「政治的情報サイクル」として捉えられ、選挙・運動・政治スキャンダルの分析に用いられる。',
    keyFigures: '提唱者：アンドリュー・チャドウィック（Andrew Chadwick、政治コミュニケーション学者、ラフバラー大学教授）／初出：著書『The Hybrid Media System: Politics and Power』（Oxford University Press、2013年、第2版2017年）',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/book/8696', type: 'academic', label: 'Oxford Academic（OUP）書誌・本文ページ：The Hybrid Media System: Politics and Power' },
      { url: 'https://academic.oup.com/sf/article/94/4/e97/2461366', type: 'academic', label: '学術誌 Social Forces（OUP）掲載書評（査読誌、2013年版・OUP刊を明記）' },
      { url: 'https://www.andrewchadwick.com/hybrid-media-system', type: 'academic', label: '著者アンドリュー・チャドウィック公式サイト：The Hybrid Media System（概要・受賞歴）' },
    ],
  },
  {
    id: 'econ-stable-matching',
    discipline: 'economics',
    title: '安定マッチング理論（ゲール＝シャプレー）',
    statement:
      '二つの集団（例：男女、研修医と病院、生徒と学校）の各メンバーが相手集団に対する選好順序を持つとき、互いに現在の相手より相手同士を選びたいと思うペア（ブロッキング・ペア）が存在しない「安定的な」マッチングを求める理論。デヴィッド・ゲールとロイド・シャプレーは1962年の論文「College Admissions and the Stability of Marriage」で、安定マッチングが常に存在することを証明し、それを構成する「受入保留方式（deferred acceptance／ゲール＝シャプレー・アルゴリズム）」を示した。' +
      '一方の側が順に申し込み、申し込まれた側は暫定的に最良の相手を保留して他を断る手続きを繰り返すと、必ず安定マッチングに到達する。アルヴィン・ロスはこれを米国研修医マッチング（NRMP）、学校選択、腎臓交換移植などの制度設計（マーケットデザイン）に応用した。',
    keyFigures: 'David Gale（デヴィッド・ゲール）／Lloyd Shapley（ロイド・シャプレー）：初出論文「College Admissions and the Stability of Marriage」(1962)で提唱／Alvin Roth（アルヴィン・ロス）：実社会の市場設計へ応用／シャプレーとロスは2012年ノーベル経済学賞「安定的配分の理論と市場設計の実践」',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2012/press-release/', type: 'government', label: 'The Sveriges Riksbank Prize in Economic Sciences 2012 — Press release（安定的配分の理論と市場設計）' },
      { url: 'https://www.ams.org/publicoutreach/feature-column/fc-2015-03', type: 'academic', label: 'AMS Feature Column: The Stable Marriage Problem and School Choice（米国数学会）' },
      { url: 'https://web.stanford.edu/~alroth/papers/GaleandShapley.revised.IJGT.pdf', type: 'academic', label: 'A. E. Roth, “Deferred Acceptance Algorithms: History, Theory, Practice, and Open Questions”（Stanford/IJGT）' },
      { url: 'https://www.nber.org/news/alvin-e-roth-and-lloyd-s-shapley-won-nobel-prize-2012-developing-theory-stable-allocations-and', type: 'academic', label: 'NBER: Roth and Shapley Won the Nobel Prize in 2012 for the Theory of Stable Allocations and Market Design' },
    ],
  },
  {
    id: 'econ-behavioral-finance',
    discipline: 'economics',
    title: '行動ファイナンス',
    statement:
      '投資家や市場参加者は完全には合理的でなく、心理的バイアスや感情に影響されるという前提に立ち、認知心理学・行動経済学の知見を用いて金融市場を分析する分野。伝統的ファイナンス理論（合理的期待・効率的市場仮説 EMH）では説明しにくいアノマリー、バブル、過剰反応・過小反応、ホームバイアスなどの現象を説明しようとする。応用される概念として、カーネマン＆トヴェルスキーのプロスペクト理論（損失回避＝損失の痛みを同額の利得の喜びより強く感じる）、ヒューリスティックとバイアス（自信過剰、代表性、アンカリング、群集行動 herding）、メンタル・アカウンティングなどがある。' +
      '市場の非効率性や予測可能性をめぐっては効率的市場仮説の支持者との間で論争があり、両者の評価は定まっていない。',
    keyFigures: 'ダニエル・カーネマン＆エイモス・トヴェルスキー（プロスペクト理論 1979、損失回避・ヒューリスティックの心理学的基礎）／リチャード・セイラー（Richard Thaler、2017年ノーベル経済学賞）／ロバート・シラー（Robert Shiller、2013年ノーベル経済学賞、株価の過剰変動性と投機的バブルを実証）／対比される立場としてユージン・ファマ（Eugene Fama、効率的市場仮説 EMH、2013年に共同受賞）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/uploads/2018/06/shiller-lecture.pdf', type: 'government', label: 'Robert J. Shiller, “Speculative Asset Prices” (Nobel Prize Lecture, 2013) — Nobelprize.org' },
      { url: 'https://www.ubs.com/microsites/nobel-perspectives/en/laureates/robert-shiller.html', type: 'reference', label: 'UBS Nobel Perspectives — Robert Shiller: Behavioral Finance & Economics' },
      { url: 'https://www.ebsco.com/research-starters/economics/behavioral-finance', type: 'reference', label: 'EBSCO Research Starters (Economics) — Behavioral Finance' },
      { url: 'https://en.wikipedia.org/wiki/Behavioural_finance', type: 'reference', label: 'Wikipedia — Behavioural finance' },
    ],
  },
  {
    id: 'mgmt-holacracy',
    discipline: 'management',
    title: 'ホラクラシー',
    statement:
      '従来の上司-部下によるピラミッド型（階層的）の指揮命令系統を廃し、権限と意思決定を、役職（人）ではなく明文化された「役割（role）」と、その集合体である自律的・自己組織化された「サークル（circle）」に分散させる組織運営・ガバナンス手法。サークルは入れ子状（ホロン的＝全体かつ部分）に組織全体を構成し、運用は「ホラクラシー憲法（Holacracy Constitution）」と呼ばれる共通ルールに従う。役割は流動的に更新され、ガバナンス・ミーティング（役割や権限構造を扱う）とタクティカル・ミーティング（日常の運営課題を扱う）という構造化された会議で処理される。' +
      'ブライアン・ロバートソンが自社Ternary Softwareでの実践をもとに2007年頃に体系化し、2015年の著書『Holacracy』で普及、ザッポス（Zappos）の導入で広く注目された。語源はA.ケストラーの「ホラーキー（holarchy）」に由来する。一方で、ルールが複雑で実装が難しい、大規模組織では機能しにくい、肩書きを廃しても暗黙の権力関係が残る、全体像を見失いやすい等の批判もある。',
    keyFigures: 'ブライアン・ロバートソン（Brian Robertson、Ternary Software創業者・提唱者）／初出: “Organization at the Leading Edge: Introducing Holacracy”（2007）／普及: 著書『Holacracy』（2015）／語源の源流: アーサー・ケストラー（holon／holarchy, 1967『The Ghost in the Machine』）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Holacracy', type: 'reference', label: 'Wikipedia「Holacracy」— 定義・holon/Koestler語源・Robertson/Ternary 2007・憲法・サークル/役割・Zappos' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/holacracy', type: 'reference', label: 'EBSCO Research Starters (Business and Management)「Holacracy」' },
      { url: 'https://library.uniteddiversity.coop/Decision_Making_and_Democracy/Holacracy/HolacracyIntro2007-06.pdf', type: 'media', label: 'B. J. Robertson “Organization at the Leading Edge: Introducing Holacracy” (2007) — 提唱者本人による初出論考' },
    ],
  },
  {
    id: 'human-observational-learning',
    discipline: 'human-science',
    title: '観察学習（バンデューラ）',
    statement:
      '人は、自分が直接報酬や罰を受けなくても、他者（モデル）の行動とその結果を観察するだけで新しい行動を学習できるとする理論（モデリング・代理学習）。アルバート・バンデューラが提唱し、直接的な条件づけのみで学習を説明する行動主義を、注意・記憶などの認知過程を取り入れて拡張した（後に社会的認知理論へ発展）。有名な実証が1961年の「ボボ人形実験」で、大人が人形に攻撃的に振る舞うのを見た子どもがその攻撃行動を模倣し、攻撃の社会的伝達が示された。' +
      '観察学習が成立するには4つの過程が必要とされる：(1)注意（モデルに注目する）、(2)保持（観察した行動を記憶する）、(3)運動再生（記憶を再現できる運動能力）、(4)動機づけ（模倣する誘因。モデルが報われるのを見ると模倣されやすい＝代理強化）。自己効力感の概念もバンデューラによる。攻撃・向社会的行動・メディアの影響の理解に応用される。',
    keyFigures: '提唱者：アルバート・バンデューラ（Albert Bandura, 1925–2021）／初出（ボボ人形実験）：Bandura, Ross & Ross (1961)「Transmission of aggression through imitation of aggressive models」, Journal of Abnormal and Social Psychology, 63(3), 575–582',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/observational-learning', type: 'reference', label: 'Encyclopaedia Britannica「Observational learning」' },
      { url: 'https://wsu.pressbooks.pub/psych105/chapter/6-5-observational-learning-modeling/', type: 'academic', label: 'Washington State University, Introductory Psychology「6.5 Observational Learning (Modeling)」' },
      { url: 'https://www.simplypsychology.org/bandura.html', type: 'reference', label: 'Simply Psychology「Albert Bandura’s Social Learning Theory」' },
    ],
  },
  {
    id: 'bizlaw-condominium-ownership',
    discipline: 'business-law',
    title: '区分所有（区分所有法）',
    statement:
      '区分所有とは、一棟の建物（分譲マンション等）のうち、構造上・利用上独立した各部分（各住戸など）を、それぞれ独立した所有権（区分所有権）の目的とする所有形態をいう。「建物の区分所有等に関する法律」（区分所有法、昭和37年法律第69号）が定める。各区分所有者が単独で所有する「専有部分」と、廊下・階段・エレベーター・外壁・敷地など全員で共有する「共用部分」とを区別し、共用部分は原則として各区分所有者の専有部分の床面積の割合に応じた持分で共有される。' +
      '区分所有者は全員で建物・敷地等の管理を行う団体（管理組合）を構成し、集会（総会）の決議によって管理・運営に関する事項を決定する。規約の設定・変更や共用部分の重大変更には区分所有者及び議決権の各4分の3以上の特別多数決議（31条・17条）、建替え決議には各5分の4以上（62条）を要するなど、重要事項ほど加重された多数決要件が定められている。専有部分とそれに対応する敷地利用権は原則として分離して処分できない（22条）。マンションの法律関係の基礎をなす制度である。',
    keyFigures: '根拠法＝建物の区分所有等に関する法律（区分所有法・昭和37年法律第69号、e-Gov law id 337AC0000000069）／専有部分・共用部分の区別（2条）／共用部分の持分＝原則として専有部分の床面積割合（14条）／管理団体＝区分所有者全員で構成（3条）／規約変更・共用部分の重大変更＝各4分の3以上（31条・17条）／建替え決議＝各5分の4以上（62条）／分離処分の禁止（22条）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/337AC0000000069', type: 'government', label: 'e-Gov法令検索「建物の区分所有等に関する法律」（昭和37年法律第69号、law id 337AC0000000069）' },
      { url: 'https://hourei.ndl.go.jp/simple/detail?lawId=0000053767', type: 'government', label: '国立国会図書館 日本法令索引「建物の区分所有等に関する法律」' },
      { url: 'https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/houritsu/04019620404069.htm', type: 'government', label: '衆議院 法令データ「建物の区分所有等に関する法律」' },
    ],
  },
  {
    id: 'infosoc-social-construction',
    discipline: 'information-sociology',
    title: '現実の社会的構成（社会構築主義）',
    statement:
      '私たちが「当たり前の現実」「客観的事実」とみなす社会的世界（制度・役割・知識・常識）は、自然に与えられたものではなく、人々の日常的な相互作用とコミュニケーションを通じて社会的に作り出され維持される構築物だとする、知識社会学・社会理論の立場。ピーター・バーガーとトーマス・ルックマンが1966年の著書『現実の社会的構成』で体系化した。鍵となるのは弁証法的に連関する三契機の循環である。すなわち(1)外在化（人間の活動が社会的産物を生み出す）、(2)客体化（その産物が当人から独立した客観的現実として立ち現れる）、(3)内在化（社会化を通じて個人がそれを取り込み主観的現実とする）。' +
      'あわせて習慣化・制度化、知識の正当化（legitimation）も論じられる。シュッツの現象学的社会学やデュルケームの影響を受け、後の社会構築主義や科学技術社会論（STS）に大きな影響を与えた。',
    keyFigures: 'ピーター・L・バーガー（Peter L. Berger）／トーマス・ルックマン（Thomas Luckmann）／初出『現実の社会的構成（The Social Construction of Reality: A Treatise in the Sociology of Knowledge）』1966年／現象学的源流：アルフレッド・シュッツ／古典的源流：エミール・デュルケーム',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/The_Social_Construction_of_Reality', type: 'reference', label: 'Wikipedia「The Social Construction of Reality」— 1966年刊行、知識社会学の再定式化' },
      { url: 'https://link.springer.com/article/10.1007/s10746-016-9385-5', type: 'academic', label: 'Michael Lynch, “Social Constructivism in Science and Technology Studies”, Human Studies (Springer, 2016)' },
      { url: 'https://www.ebsco.com/research-starters/religion-and-philosophy/social-construction-reality', type: 'reference', label: 'EBSCO Research Starters「Social Construction of Reality」— 外在化／客体化／内在化の三過程' },
    ],
  },
  {
    id: 'econ-focal-point',
    discipline: 'economics',
    title: 'フォーカルポイント（シェリングの焦点）',
    statement:
      '複数のナッシュ均衡をもつ調整ゲーム（coordination game）において、当事者が事前のコミュニケーションなしに、互いに「相手も同じように考えるだろう」と予想して自然に選びがちな、際立った（salient）選択肢を指す。ゲームの利得行列そのものはどの均衡が選ばれるかを決めないが、当事者は文化・慣習・歴史・共通知識（common knowledge）や顕著性といったゲーム外の文脈を手がかりに、調整失敗を避けるべく特定の均衡へ期待を収束させる。' +
      '古典的な例は「ニューヨークで見知らぬ相手と、時間・場所を約束せずに会うならどこ・何時か」という問いで、多くの人が「グランド・セントラル駅の正午」のような目立つ答えに集まる。純粋なゲーム理論の形式的装置だけでは決まらない均衡選択を、共通の期待と顕著性が導くことを示した点に意義がある。',
    keyFigures: 'トーマス・シェリング（Thomas C. Schelling、提唱者）／初出：著書『The Strategy of Conflict（紛争の戦略）』1960年／2005年ノーベル経済学賞をロバート・オーマン（Robert J. Aumann）と共同受賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Focal_point_(game_theory)', type: 'reference', label: 'Wikipedia: Focal point (game theory) — 定義・シェリング・1960年・ニューヨークの例' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2005/schelling/facts/', type: 'government', label: 'NobelPrize.org: 2005年経済学賞（Schelling・Aumann共同受賞）' },
      { url: 'https://www.aeaweb.org/research/can-schellings-focal-points-help-us-understand-high-stakes-negotiations', type: 'academic', label: 'American Economic Association: Schellingの焦点と交渉に関する解説' },
    ],
  },
  {
    id: 'econ-arbitrage-pricing-theory',
    discipline: 'economics',
    title: '裁定価格理論（APT）',
    statement:
      '資産（証券）の期待リターンが、複数のマクロ経済的な系統的リスク・ファクター（例：インフレ率、GDP成長率、金利、信用スプレッド等）に対する感応度（ファクター・ローディング＝各ファクターのβ）の線形結合で決まるとする、資産価格付けのマルチファクター・モデル。中核の前提は「裁定（arbitrage）の不在」であり、リスクなしに確実な利益を得る機会は均衡では存在しない。理論価格から乖離した資産があれば、裁定取引によってその乖離が解消されるという論理（一物一価の法則）から価格関係を導く。' +
      '資本資産価格モデル（CAPM）が市場ポートフォリオという単一ファクターに依拠し投資家の効用や市場ポートフォリオの特定を要するのに対し、APTは複数ファクターを許し、それらを必要としない点でより一般的・柔軟である。一方で、どのファクターを用いるべきかが理論からは一意に定まらず経験的に選ぶ必要があるという弱点を持つ。ファマ＝フレンチの3ファクターモデルなどマルチファクター・モデルの基礎となった。',
    keyFigures: 'スティーブン・ロス（Stephen A. Ross）が提唱／初出: S. A. Ross (1976) “The Arbitrage Theory of Capital Asset Pricing,” Journal of Economic Theory 13(3): 341–360',
    asOf: '2026-06',
    sources: [
      { url: 'https://ideas.repec.org/a/eee/jetheo/v13y1976i3p341-360.html', type: 'academic', label: 'Ross, S. A. (1976) “The Arbitrage Theory of Capital Asset Pricing,” Journal of Economic Theory 13(3):341–360（RePEc/IDEAS 書誌）' },
      { url: 'https://en.wikipedia.org/wiki/Arbitrage_pricing_theory', type: 'reference', label: 'Wikipedia: Arbitrage pricing theory' },
      { url: 'https://corporatefinanceinstitute.com/resources/wealth-management/arbitrage-pricing-theory-apt/', type: 'reference', label: 'Corporate Finance Institute: Arbitrage Pricing Theory (APT)' },
    ],
  },
  {
    id: 'mgmt-bureaucracy',
    discipline: 'management',
    title: '官僚制（ウェーバー）',
    statement:
      'ドイツの社会学者マックス・ウェーバーが、近代社会で最も合理的・効率的な組織管理形態として理念型（ideal type）で定式化した組織モデル。主な特徴は、(1)明確な権限の階層（ヒエラルキー）、(2)成文化された規則・手続きに基づく職務遂行、(3)職務の専門分化・分業、(4)文書による事務処理と記録の保存、(5)個人的感情を排した没人格的（impersonal）な職務遂行、(6)専門的資格に基づく任用と年功・実績による昇進を伴う生涯キャリア、などである。' +
      'ウェーバーは正統的支配を伝統的支配・カリスマ的支配・合法的支配（合理的支配）の3類型に分け、官僚制を合法的支配の最も純粋な形態と位置づけた。理念型は理想や善ではなく、現実の組織を測る理論的基準である。一方ロバート・マートンは、規則万能主義・形式主義による硬直化、目的の転移（goal displacement）、訓練された無能（trained incapacity）といった逆機能を指摘した。近代組織論の出発点をなす概念。',
    keyFigures: 'マックス・ウェーバー（Max Weber、提唱者）／初出『経済と社会』（Wirtschaft und Gesellschaft、没後1921–22年刊）／ロバート・K・マートン（逆機能論「Bureaucratic Structure and Personality」）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Rational-legal_authority', type: 'reference', label: 'Rational-legal authority — Wikipedia（合法的支配と官僚制の特徴）' },
      { url: 'https://oxfordre.com/politics/display/10.1093/acrefore/9780190228637.001.0001/acrefore-9780190228637-e-166', type: 'academic', label: 'Weberian Bureaucracy — Oxford Research Encyclopedia of Politics（査読参照事典）' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/mertons-dysfunctions-bureaucracies', type: 'reference', label: 'Merton’s Dysfunctions of Bureaucracies — EBSCO Research Starters（逆機能）' },
    ],
  },
  {
    id: 'human-positive-psychology',
    discipline: 'human-science',
    title: 'ポジティブ心理学',
    statement:
      '心理学を精神疾患や弱点（病理）の治療に偏らせるのではなく、人間の強み・美徳、幸福（ウェルビーイング well-being）、繁栄（フラリッシング flourishing）といったポジティブな側面と、それを高める条件を科学的に研究する心理学の一分野。マーティン・セリグマンが1998年にアメリカ心理学会（APA）会長就任時の主題として提唱・推進し、フロー研究のミハイ・チクセントミハイらと共に2000年の論文「Positive psychology: An introduction」で学問領域として確立した。' +
      '当初は「ポジティブ感情・没頭（エンゲージメント）・意味」の3要素から出発し、後にPERMAモデル（肯定的感情 Positive emotion・没頭 Engagement・関係性 Relationships・意味 Meaning・達成 Accomplishment）として持続的幸福の構成要素を整理した。学習性無力感の研究から「学習性楽観主義」やVIA性格的強み、感謝・親切などの介入研究へと展開した。一方で、知見の頑健性・再現性や「ポジティブさの押し付け」への批判も存在する。',
    keyFigures: 'マーティン・セリグマン（Martin Seligman；1998年APA会長就任時に提唱、PERMA提唱）／ミハイ・チクセントミハイ（Mihaly Csikszentmihalyi；フロー、共同創始者）／クリストファー・ピーターソン（VIA性格的強みを共同開発）／初出: Seligman & Csikszentmihalyi (2000) American Psychologist 55(1):5-14',
    asOf: '2026-06',
    sources: [
      { url: 'https://pubmed.ncbi.nlm.nih.gov/11392865/', type: 'academic', label: 'Seligman & Csikszentmihalyi (2000) “Positive psychology: An introduction.” American Psychologist 55(1):5-14（PubMed）' },
      { url: 'https://ppc.sas.upenn.edu/learn-more/perma-theory-well-being-and-perma-workshops', type: 'academic', label: 'ペンシルベニア大学 ポジティブ心理学センター — PERMA理論とウェルビーイング' },
      { url: 'https://en.wikipedia.org/wiki/Positive_psychology', type: 'reference', label: 'Wikipedia「Positive psychology」（定義・1998年起源・PERMA・批判の概観）' },
    ],
  },
  {
    id: 'bizlaw-mortgage',
    discipline: 'business-law',
    title: '抵当権（民法369条）',
    statement:
      '抵当権とは、債務者又は第三者（物上保証人）が、債務の担保として提供した不動産等を、その占有を設定者のもとに残したまま（引き渡さず使用・収益を続けさせたまま）、債務が弁済されない場合に債権者がその目的物から他の債権者に先立って優先的に弁済を受けられる約定担保物権である（民法369条1項）。目的物の占有を移転しない点が質権と異なる最大の特徴で、設定者は抵当不動産を使用・収益しながら担保に供せるため、不動産融資・住宅ローンの中心的担保となる。地上権・永小作権も抵当権の目的とできる（同条2項）。' +
      '対抗要件は不動産登記であり、複数の抵当権が設定された場合は登記の前後で順位が決まり、先順位の抵当権者が優先弁済を受ける。被担保債権が弁済されないときは、抵当権者は担保不動産競売等により目的物を換価し、その売却代金から優先弁済を受ける。効力は付加して一体となった物（付加一体物）にも及び（370条）、被担保債権への附従性をもつ（債権が消滅すれば抵当権も消滅）。',
    keyFigures: '根拠条文＝民法369条1項（抵当権の内容）／占有非移転・使用収益の継続＝質権との最大の相違点／目的物＝不動産の所有権、及び地上権・永小作権（369条2項）／対抗要件＝不動産登記／順位＝登記の前後による／実行方法＝担保不動産競売等による換価と優先弁済／効力範囲＝付加一体物（370条）／附従性／e-Gov民法 law id＝129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索「民法」（law id: 129AC0000000089）第369条・第370条・第373条' },
      { url: 'https://ja.wikibooks.org/wiki/民法第369条', type: 'reference', label: 'Wikibooks 民法第369条（条文・解説）' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/chosyu/02/03/016/01.htm', type: 'government', label: '国税庁 徴収法基本通達（抵当権の優先・登記順位に関する官公庁解説）' },
    ],
  },
  {
    id: 'infosoc-prosumer',
    discipline: 'information-sociology',
    title: 'プロシューマー（生産消費者）',
    statement:
      '生産者（producer）と消費者（consumer）の境界が曖昧化し、消費しながら同時に生産にも関与する主体を指す概念で、両語を組み合わせた造語。未来学者アルビン・トフラーが1980年の著書『第三の波』で提示し、産業社会で市場向け生産と消費に分離していた両者が、脱産業社会では自分で使うものを自分で作る形（DIY・セルフサービス等）で再融合すると論じた。' +
      'デジタル時代には、ユーザー生成コンテンツ（UGC）、ブログ・SNS投稿、オープンソース、レビュー、プラットフォームへの参加など、消費者が価値・コンテンツの生産に積極関与する現象を説明する概念として再注目され、リッツァーとユルゲンソンらが「参加型文化」「Web2.0」と結びつけて理論化した。あわせて、無償の参加が企業の利潤に動員される「無償労働（フリーレイバー）」「プレイバー（playbour）」をめぐる批判的議論にもつながる。',
    keyFigures: 'アルビン・トフラー（Alvin Toffler、提唱者）／初出『第三の波（The Third Wave）』1980年／ジョージ・リッツァー＆ネイサン・ユルゲンソン（2010、デジタル時代の理論的再定義）／ジュリアン・キュックリッヒ（playbour 概念、2005）',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.1177/1469540509354673', type: 'academic', label: 'Ritzer & Jurgenson (2010) “Production, Consumption, Prosumption”, Journal of Consumer Culture (Sage)' },
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1002/9781405165518.wbeosp132', type: 'academic', label: 'Jurgenson & Ritzer “Prosumers”, The Wiley Blackwell Encyclopedia' },
      { url: 'https://en.wikipedia.org/wiki/The_Third_Wave_(Toffler_book)', type: 'reference', label: 'Wikipedia: The Third Wave (Toffler, 1980) — origin of “prosumer”' },
    ],
  },
  {
    id: 'econ-nash-bargaining',
    discipline: 'economics',
    title: 'ナッシュ交渉解',
    statement:
      '二者が協力すれば余剰（利益）を生み出せるが、その分配をめぐって対立する「交渉問題（bargaining problem）」に対し、望ましい性質を表す公理を満たす一意の合意点を与える協力ゲーム理論の解概念。交渉決裂時の結果である脅威点・現状点（disagreement point）を基準とし、各プレイヤーの効用利得（合意点の効用と決裂点の効用の差）の積＝ナッシュ積を最大化する点が解となる。' +
      '解が満たす公理は、(1)パレート効率性、(2)対称性、(3)効用の正アフィン変換からの独立（尺度不変性）、(4)無関係な選択肢からの独立（IIA）の四つで、これらを同時に満たす解は一意に定まる。労使交渉・国際交渉・分配問題のモデル化に広く用いられ、ルービンシュタインの交互提案交渉モデルの時間間隔をゼロに近づけた極限がナッシュ交渉解に一致するという非協力ゲームによる基礎づけも与えられている。',
    keyFigures: 'ジョン・ナッシュ（John F. Nash, Jr.）／初出: 論文「The Bargaining Problem」Econometrica, Vol.18, No.2 (1950), pp.155-162／非協力的基礎づけ: アリエル・ルービンシュタイン（交互提案モデル, 1982）／ナッシュは1994年ノーベル経済学賞',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.econometricsociety.org/publications/econometrica/1950/04/01/bargaining-problem', type: 'academic', label: 'John F. Nash, “The Bargaining Problem”, Econometrica 18(2), 1950（Econometric Society 公式）' },
      { url: 'https://www.haverford.edu/sites/default/files/Nash1950.pdf', type: 'academic', label: 'Nash (1950) “The Bargaining Problem” 原論文 PDF（Haverford College ホスト）' },
      { url: 'https://en.wikipedia.org/wiki/Rubinstein_bargaining_model', type: 'reference', label: 'Rubinstein bargaining model（非協力的基礎づけと Nash 解への収束）' },
    ],
  },
  {
    id: 'econ-shapley-value',
    discipline: 'economics',
    title: 'シャープレー値',
    statement:
      '複数のプレイヤーが協力（提携 coalition）して生み出した総利得を、各プレイヤーの貢献度に応じて公正に分配するための配分方式（解概念）。各プレイヤーのシャープレー値は、そのプレイヤーが提携に加わることで価値を増やす限界貢献（marginal contribution）を、あらゆる参加順序の全並びにわたって平均したものとして定義される。この配分は、(1)効率性（総利得を過不足なく分配）、(2)対称性（あらゆる提携に同じ貢献をするプレイヤーには同じ配分）、(3)ゼロ（ダミー）プレイヤー性（限界貢献ゼロのプレイヤーは配分ゼロ）、(4)加法性、という4公理を同時に満たす唯一の配分である。' +
      '費用配分、投票力の測定（シャープレー＝シュービック投票力指数）、近年は機械学習の予測に対する各特徴量の寄与度を説明する手法（SHAP）にも応用される。安定マッチングやメカニズムデザインとは別概念の、協力ゲームにおける配分解である。',
    keyFigures: 'ロイド・シャプレー（Lloyd S. Shapley）が1953年に提唱／初出: L. S. Shapley, “A Value for n-person Games” (1953)／シャプレーは2012年ノーベル経済学賞（A. ロスと共同受賞、安定マッチングと市場設計が受賞理由、シャープレー値も代表業績）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2012/shapley/facts/', type: 'government', label: 'NobelPrize.org — Lloyd S. Shapley, 2012年経済学賞' },
      { url: 'https://en.wikipedia.org/wiki/Shapley_value', type: 'reference', label: 'Wikipedia — Shapley value（定義・公理・応用）' },
      { url: 'https://gtl.csa.iisc.ac.in/gametheory/ln/web-cp5-shapley.pdf', type: 'academic', label: 'Indian Institute of Science — The Shapley Value (Game Theory lecture notes)' },
      { url: 'https://www.sciencedirect.com/topics/economics-econometrics-and-finance/shapley-value', type: 'academic', label: 'ScienceDirect Topics — Shapley Value overview' },
    ],
  },
  {
    id: 'mgmt-servant-leadership',
    discipline: 'management',
    title: 'サーバント・リーダーシップ',
    statement:
      'リーダーがまず自らの権力や地位を優先するのではなく、フォロワー（部下・チーム・組織・コミュニティ）に「奉仕する（serve）」ことを第一に据え、その成長・幸福・自律を支援することを通じて、結果的に組織目標の達成やパフォーマンス向上を導くリーダーシップの哲学・スタイル。ロバート・グリーンリーフが1970年のエッセイ「The Servant as Leader」で提唱した。「リーダーが先か奉仕が先か」を問い、奉仕したいという自然な感情が先にあり、その後に導きたいという意識的選択が来るリーダーを真のサーバント・リーダーとする。' +
      '最良の判定基準は「奉仕された人々が人として成長するか」。傾聴・共感・癒し・気づき・説得・概念化・先見性・執事役（スチュワードシップ）・人々の成長への関与・コミュニティづくり（スピアーズの10特性）が代表的特性で、エンパワーメント・倫理・利他性を重視する点で、目標達成主導の変革型やカリスマ型リーダーシップと対比される。',
    keyFigures: 'ロバート・K・グリーンリーフ（Robert K. Greenleaf、提唱者）／初出: エッセイ「The Servant as Leader」（1970年）／ラリー・C・スピアーズ（Larry C. Spears、10特性を体系化）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.gonzaga.edu/news-events/stories/2023/9/26/robert-greenleaf-servant-leadership', type: 'academic', label: 'Gonzaga University — Robert Greenleaf on Servant-Leadership' },
      { url: 'https://www.regent.edu/journal/journal-of-virtues-leadership/character-and-servant-leadership-ten-characteristics-of-effective-caring-leaders/', type: 'academic', label: 'Larry C. Spears, “Character and Servant Leadership: Ten Characteristics…,” Journal of Virtues & Leadership (Regent University)' },
      { url: 'https://greenleaf.org/what-is-servant-leadership/', type: 'media', label: 'Robert K. Greenleaf Center for Servant Leadership — What is Servant Leadership?' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/servant-leadership', type: 'reference', label: 'EBSCO Research Starters — Servant Leadership' },
    ],
  },
  {
    id: 'human-stress-coping',
    discipline: 'human-science',
    title: 'ストレスとコーピング（ラザルス）',
    statement:
      '心理的ストレスを、外部の出来事（ストレッサー）そのものではなく、その出来事と個人との「関係（transaction、交流）」をどう「認知的に評価（cognitive appraisal）」するかによって規定する理論。ラザルスらはストレスを「自分の資源に負担をかけ、あるいはそれを超え、安寧を脅かすものと評価される、人と環境の特定の関係」と定義した。中核過程は二段階の評価から成る。(1)一次評価では、その出来事が自分にとって無関係か・良性か・有害（脅威・挑戦・喪失）かを判断し、(2)二次評価では、それに対処できる資源や能力が自分にあるかを判断する。' +
      'これらの評価に基づき「コーピング（対処）」が行われ、(a)問題焦点型コーピング（ストレス源そのものを変えようとする）と、(b)情動焦点型コーピング（ストレスに伴う感情を調整しようとする）に大別される。一般に、統制可能と評価された状況では問題焦点型が、統制不能と評価された状況では情動焦点型が優勢になりやすい。ストレスマネジメントや健康行動の基礎理論である。',
    keyFigures: 'リチャード・ラザルス（Richard S. Lazarus）／スーザン・フォルクマン（Susan Folkman）／初出：共著『Stress, Appraisal, and Coping』（Springer, 1984）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/psychology/transactional-model-stress-and-coping', type: 'reference', label: 'EBSCO Research Starters — Transactional model of stress and coping' },
      { url: 'https://onlinelibrary.wiley.com/doi/10.1002/9781118993811.ch21', type: 'academic', label: 'Wiley — Lazarus and Folkman’s Psychological Stress and Coping Theory（The Handbook of Stress and Health 査読付き章）' },
      { url: 'https://courses.lumenlearning.com/waymaker-psychology/chapter/regulation-of-stress/', type: 'academic', label: 'Lumen Learning（Waymaker Psychology）— Regulation of Stress（大学教材）' },
    ],
  },
  {
    id: 'bizlaw-pledge',
    discipline: 'business-law',
    title: '質権（民法342条）',
    statement:
      '質権とは、債権者（質権者）が、その債権の担保として債務者または第三者（物上保証人）から受け取った物（質物）を、債務が弁済されるまで占有・留置し、弁済がないときはその物から他の債権者に先立って優先的に弁済を受けることができる約定担保物権である（民法342条）。目的物の占有を債権者に移転（引き渡す）点が、占有を移転しない抵当権との最大の違いであり、この留置によって心理的に弁済を促す（留置的効力）。' +
      '質権の対象は、動産（動産質）、不動産（不動産質）、債権その他の財産権（権利質）に及び、譲り渡すことのできない物を目的とすることはできない（343条）。動産質では占有の継続が第三者対抗要件となり（352条）、不動産質は例外的に質物の使用・収益が可能（356条）。あらかじめ弁済がないとき質物の所有権を債権者に帰属させる等の「流質契約」は、民事では原則禁止される（349条。ただし商行為では商法515条により許容される）。',
    keyFigures: '約定担保物権／占有移転が要件＝引渡しで対抗・留置（抵当権との最大の差異）／優先弁済的効力＋留置的効力（民法342条）／目的：動産質・不動産質・権利質／343条＝譲渡不能物は目的にできない／352条＝動産質は占有の継続が第三者対抗要件／356条＝不動産質は使用収益可／349条＝流質契約は民事で原則禁止（商法515条で商行為は許容）／e-Gov民法 law id: 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（law id 129AC0000000089／第九章 質権 342条以下）' },
      { url: 'https://www.lawschool.tsukuba.ac.jp/wp/wp-content/uploads/2019/02/fb4a7dd957f855151662a89cba33b915.pdf', type: 'academic', label: '筑波大学ロースクール 直井義典「明治期における流質禁止をめぐる議論」（流質契約・349条）' },
      { url: 'https://ja.wikibooks.org/wiki/商法第515条', type: 'reference', label: 'Wikibooks 商法第515条（商行為による質権への民法349条不適用＝流質許容）' },
    ],
  },
  {
    id: 'infosoc-digital-labour',
    discipline: 'information-sociology',
    title: 'デジタル労働（digital labour）',
    statement:
      'デジタル・プラットフォームやインターネット上で行われ、あるいはデジタル技術によって媒介・統治される労働・活動の総称、およびそれを批判的に分析する研究領域。中心的論点は、ソーシャルメディアのユーザーが投稿・「いいね」・データ生成などの活動を通じ、自覚なく無償でプラットフォーム企業の利潤（広告・データ）を生み出す「フリーレイバー（free labour、無償労働）」「プレイバー（playbour、遊び＋労働）」の問題である。' +
      'ティツィアーナ・テラノヴァが2000年の論文「Free Labor」でデジタル経済における無償の文化労働を論じ、クリスチャン・フックスがマルクス主義の視座から搾取と価値生産を体系的に論じた。ギグワーク、クラウドワーク、コンテンツ・モデレーション、AI学習データのアノテーション（教師データ作成）など、不可視化されがちな労働の搾取や労働条件も対象となる。ギグエコノミー・プロシューマー・プラットフォーム資本主義と関連しつつ、デジタル環境での労働・搾取・価値の批判的分析として区別される。',
    keyFigures: 'ティツィアーナ・テラノヴァ（Tiziana Terranova／「Free Labor」2000, Social Text）／クリスチャン・フックス（Christian Fuchs／『Digital Labour and Karl Marx』2014, Routledge）／ジュリアン・キュックリッヒ（Julian Kücklich／「playbour」2005）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.routledge.com/Digital-Labour-and-Karl-Marx/Fuchs/p/book/9780415716161', type: 'academic', label: 'Christian Fuchs, Digital Labour and Karl Marx (Routledge, 2014) — 出版社書誌ページ' },
      { url: 'https://link.springer.com/chapter/10.1057/9781137478573_2', type: 'academic', label: 'The Digital Labour Theory of Value and Karl Marx in the Age of Facebook... (Springer Nature)' },
      { url: 'https://en.wikipedia.org/wiki/Digital_labor', type: 'reference', label: 'Digital labor — Wikipedia（定義・研究領域の概観）' },
    ],
  },
  {
    id: 'econ-condorcet-paradox',
    discipline: 'economics',
    title: 'コンドルセのパラドックス（投票の逆理）',
    statement:
      '各投票者の選好が個人レベルでは推移的（A＞B かつ B＞C ならば A＞C）であっても、多数決で集計された社会全体の選好が推移的にならず循環してしまう（A＞B、B＞C なのに C＞A となる）ことがある、という逆説。例えば3人の投票者が3つの選択肢A・B・Cに対し (1)A＞B＞C、(2)B＞C＞A、(3)C＞A＞B という選好をもつとき、A対Bでは2対1でAが勝ち、B対Cでは2対1でBが勝つが、C対Aでは2対1でCが勝ち、多数決の結果が循環する。' +
      'これは、すべての一対比較で勝つ選択肢（コンドルセ勝者）が常には存在しないこと、また議題設定（投票順序）の操作によって結果が左右されうることを意味する。アローの不可能性定理の先駆をなす、社会的選択論の根本問題である。',
    keyFigures: 'コンドルセ侯爵（Marquis de Condorcet, 1743–1794、フランスの数学者・哲学者）／初出：1785年の著作『多数決による決定の確率への解析の応用に関する試論』',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/social-choice/', type: 'reference', label: 'Stanford Encyclopedia of Philosophy — Social Choice Theory（多数決の非推移性とコンドルセ勝者不在）' },
      { url: 'https://www.cambridge.org/core/books/essai-sur-lapplication-de-lanalyse-a-la-probabilite-des-decisions-rendues-a-la-pluralite-des-voix/1D38B9E4EAFF9AFC42313B19DC8C8070', type: 'academic', label: 'Cambridge University Press — Condorcet 1785年原著の解説（アローの逆理の直接の先駆）' },
      { url: 'https://en.wikipedia.org/wiki/Condorcet_paradox', type: 'reference', label: 'Wikipedia — Condorcet paradox（定義・3者循環例・含意）' },
    ],
  },
  {
    id: 'econ-random-walk',
    discipline: 'economics',
    title: 'ランダムウォーク仮説',
    statement:
      '株価などの金融資産価格の変化は過去の値動きとは統計的に独立で予測不可能であり、まるで酔っ払いの歩み（ランダムウォーク）のように無作為に変動するとする仮説。したがって過去の価格や公開情報から将来の価格変動を体系的に予測し、市場平均を継続的に上回ることはできず、テクニカル分析やアクティブ運用の有効性に懐疑的で、インデックス投資の論拠ともされる。市場が情報を即座に価格へ織り込むとする効率的市場仮説、とくにウィーク・フォーム（過去の価格情報の織り込み）の効率性と密接に関連する。' +
      'ただし価格変動の完全な独立性や正規分布という前提に対しては、系列相関・ファットテール（極端変動の多さ）・モメンタム/バリュー/小型株効果などのアノマリーの存在を示す実証的批判もある。',
    keyFigures: 'ルイ・バシュリエ（Louis Bachelier, 1900年博士論文『投機の理論』でブラウン運動的な価格変動を先駆けて定式化）／モーリス・ケンドール（Maurice Kendall, 1953、株価系列の系列相関の乏しさを実証）／ポール・サミュエルソン（1965）／ユージン・ファマ（1965, 1970、効率的市場仮説と関連づけ）／バートン・マルキール（『ウォール街のランダム・ウォーカー』1973で普及）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Random_walk_hypothesis', type: 'reference', label: 'Wikipedia — Random walk hypothesis（定義・歴史・批判）' },
      { url: 'http://www.cs.ucl.ac.uk/fileadmin/UCL-CS/images/Research_Student_Information/RN_11_04.pdf', type: 'academic', label: 'UCL Computer Science Research Note RN/11/04 “History of the Efficient Market Hypothesis”' },
      { url: 'https://www.numdam.org/article/ASENS_1900_3_17__21_0.pdf', type: 'academic', label: 'L. Bachelier, “Théorie de la spéculation”, Annales scientifiques de l’É.N.S., 1900（原典）' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/efficient-market-hypothesis-emh', type: 'reference', label: 'EBSCO Research Starters — Efficient-market hypothesis（EMH とランダムウォークの関係）' },
    ],
  },
  {
    id: 'mgmt-lewin-change',
    discipline: 'management',
    title: 'レヴィンの変革モデル（解凍・変革・再凍結）',
    statement:
      '組織や集団の計画的変革を3つの段階で捉える、組織開発の古典的モデル。(1)解凍（Unfreeze）は、既存のやり方・態度・行動を支える均衡を崩し、変化の必要性を認識させて変化を受け入れる準備をする段階。(2)変革（Change／Move）は、新しい行動・価値観・やり方へ移行する段階。(3)再凍結（Refreeze）は、新しい状態を定着・安定化させ、後戻り（リバウンド）を防ぐ段階。' +
      'レヴィンは現状を、変化を促す推進力（driving forces）と妨げる抑止力（restraining forces）が拮抗する動的均衡（準均衡）として捉え、両者のバランスを変えることで変革が起きるとする「力の場分析（force field analysis）」も示した。計画的変革・組織開発の出発点とされる。一方、絶え間なく変化する現代環境では「再凍結」という安定化の発想は単純・静的すぎるとの批判もある。',
    keyFigures: 'クルト・レヴィン（Kurt Lewin, 1890–1947）：ドイツ生まれの米国の社会心理学者、MIT集団力学研究センター創設者。1940年代に提唱とされる／3段階：解凍・変革・再凍結／力の場分析：推進力と抑止力の動的均衡／批判：再凍結は動的環境には静的・単純すぎる（Cummings et al. 2016 ほか）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Kurt-Lewin', type: 'reference', label: 'Encyclopaedia Britannica — Kurt Lewin（社会心理学者、場の理論・集団力学）' },
      { url: 'https://journals.sagepub.com/doi/10.1177/0018726715577707', type: 'academic', label: 'Cummings, Bridgman & Brown (2016), “Unfreezing change as three steps…”, Human Relations（SAGE／査読論文・再凍結批判）' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/force-field-analysis', type: 'reference', label: 'EBSCO Research Starters — Force-field analysis（推進力・抑止力・準均衡）' },
    ],
  },
  {
    id: 'human-social-comparison',
    discipline: 'human-science',
    title: '社会的比較理論（フェスティンガー）',
    statement:
      '人は自分の意見や能力を正確に評価したいという駆動をもち、客観的・物理的な基準が利用できないとき、自分を他者と比較することで自己評価を行う、とする社会心理学の理論。レオン・フェスティンガーが1954年に提唱した。比較の方向により、自分より優れた他者と比べる「上方比較」（向上の動機づけになる一方、脅威となり劣等感も生む）と、自分より劣った他者と比べる「下方比較」（自己評価や気分を守る）に分かれる。とくに能力の評価では、人は自分と類似した他者を比較対象に選びやすい。' +
      '後にウィルズが下方比較による自己防衛を、テッサーが自己評価維持（SEM）モデルを展開した。SNS時代には、他者の理想化された投稿への上方比較が羨望・抑うつ・自己評価低下につながる現象の説明にも応用される。',
    keyFigures: 'レオン・フェスティンガー（Leon Festinger）／初出: “A theory of social comparison processes”, Human Relations, 1954, 7巻, 117-140頁／発展: トマス・ウィルズ（Thomas A. Wills, 1981, 下方比較）／エイブラハム・テッサー（Abraham Tesser, 自己評価維持モデル）',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.1177/001872675400700202', type: 'academic', label: 'Festinger, L. (1954). A Theory of Social Comparison Processes. Human Relations, 7(2), 117-140（SAGE Journals・原典）' },
      { url: 'https://www.ebsco.com/research-starters/psychology/social-comparison-theory', type: 'reference', label: 'Social comparison theory — EBSCO Research Starters: Psychology' },
      { url: 'https://nobaproject.com/modules/social-comparison', type: 'academic', label: 'Social Comparison — Noba Project（上方/下方比較・Wills・Tesserを解説）' },
      { url: 'https://en.wikipedia.org/wiki/Social_comparison_theory', type: 'reference', label: 'Social comparison theory — Wikipedia' },
    ],
  },
  {
    id: 'bizlaw-retention-lien',
    discipline: 'business-law',
    title: '留置権（民法295条）',
    statement:
      '留置権とは、他人の物を占有する者が、その物に関して生じた債権（被担保債権）を有するとき、その債権の弁済を受けるまで、その物を留置（引渡しを拒んで手元に置くこと）できる法定担保物権である（民法295条1項本文）。例えば時計の修理人は、修理代金の支払を受けるまで時計の返還を拒める。抵当権・質権のような約定担保物権と異なり、当事者の合意ではなく法律上当然に発生する点が特徴。' +
      '成立要件は、(1)他人の物を占有していること、(2)その物に関して生じた債権であること（物と債権の牽連性）、(3)債権が弁済期にあること（295条1項ただし書）、(4)占有が不法行為によって始まったものでないこと（295条2項）。留置権者は債権全部の弁済を受けるまで留置物全部を留置でき（不可分性、296条）、留置物から生じる果実を収取して被担保債権に充当でき（297条）、善管注意義務をもって保管する（298条）。原則として換価による優先弁済的効力はないが、引渡しを拒むことで弁済を促す事実上の優先弁済機能をもつ。',
    keyFigures: '法定担保物権（合意不要・法律上当然に発生）／根拠条文＝民法295条1項本文／成立要件＝他人の物の占有・物と債権の牽連性・債権の弁済期到来（295条1項ただし書）・占有が不法行為で始まっていないこと（295条2項）／不可分性（296条）・果実収取権（297条）・善管注意義務（298条）／優先弁済権は原則なし（事実上の優先弁済機能あり）／e-Gov民法 law id＝129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（条文の一次出典、law id 129AC0000000089）第295条〜第298条' },
      { url: 'https://ja.wikibooks.org/wiki/民法第295条', type: 'reference', label: 'Wikibooks 民法第295条（条文・解説）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0295-00/', type: 'media', label: 'クレアール司法書士講座 民法第295条【留置権の内容】' },
    ],
  },
  {
    id: 'infosoc-narrative-paradigm',
    discipline: 'information-sociology',
    title: 'ナラティブ・パラダイム',
    statement:
      '人間を本質的に「物語る存在（ホモ・ナランス homo narrans）」とみなし、人々のコミュニケーション・意思決定・説得は、抽象的な論理や証拠の積み重ね（合理的世界パラダイム rational world paradigm）よりも、むしろ物語（ナラティブ）を通じて理解・評価されるとするコミュニケーション理論。' +
      '人は物語の良し悪しを「ナラティブ的合理性（narrative rationality）」、すなわち(1)物語的整合性／蓋然性（narrative coherence／probability＝話の筋が通り首尾一貫しているか）と、(2)物語的忠実性（narrative fidelity＝その物語が聞き手自身の経験や価値観に響き「真実らしい」と感じられるか）によって判断する。専門家でなくとも誰もが物語の妥当性を評価できるため、説得や公共的議論の理解において物語が中心的役割を果たすとされる。',
    keyFigures: 'ウォルター・R・フィッシャー（Walter R. Fisher）が提唱／初出: “Narration as a Human Communication Paradigm: The Case of Public Moral Argument”, Communication Monographs, Vol. 51, No. 1 (1984), pp. 1–22／著書 Human Communication as Narration（1987）で発展',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.tandfonline.com/doi/abs/10.1080/03637758409390180', type: 'academic', label: 'Walter R. Fisher, “Narration as a Human Communication Paradigm,” Communication Monographs 51(1), 1984（Taylor & Francis 原典）' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/narrative-paradigm', type: 'reference', label: 'EBSCO Research Starters: “Narrative paradigm”' },
      { url: 'https://en.wikipedia.org/wiki/Narrative_paradigm', type: 'reference', label: 'Wikipedia: “Narrative paradigm”' },
    ],
  },
  {
    id: 'econ-duverger-law',
    discipline: 'economics',
    title: 'デュヴェルジェの法則',
    statement:
      '選挙制度が政党システムに与える影響を論じた命題。中心的主張（デュヴェルジェの「法則」）は、小選挙区制（一選挙区から一人を選ぶ相対多数代表制／単純多数決）が二大政党制をもたらす傾向がある、というもの。逆に比例代表制や決選投票制（二回投票制）は多党制をもたらしやすいとされ、こちらは「仮説（hypothesis）」と呼ばれることが多い。' +
      '小選挙区制が二大政党制を生む理由として、(1)機械的効果＝小政党は得票しても議席に結びつきにくく過小代表される、(2)心理的効果＝有権者は当選可能性の低い小政党への投票が「死票」になると考え当選可能な大政党へ戦略的に投票する、の2つが挙げられる。ただし地域政党の存在等の例外があり、また「比例代表制が多党制を生む」のではなく「社会的亀裂による多党制が先にあり、それを反映して比例代表制が採用される」とする因果方向への批判（Grumm、Colomer等）も存在し、経験的支持の強さには論争がある。',
    keyFigures:
      '提唱者: モーリス・デュヴェルジェ（Maurice Duverger、仏政治学者）／初出: 『政党社会学（Les partis politiques）』1951年（英訳 Political Parties, 1954）／「法則（Duverger\'s law）」の呼称はウィリアム・ライカー（William H. Riker）が英語圏で普及させた',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Duverger%27s_law', type: 'reference', label: "Duverger's law — Wikipedia（百科事典級リファレンス）" },
      { url: 'https://www.cambridge.org/core/journals/british-journal-of-political-science/article/abs/was-duverger-correct-singlemember-district-election-outcomes-in-fiftythree-countries/6FA32DFB3BDF6046F9ED0382029DE29F', type: 'academic', label: "Gaines, 'Was Duverger Correct? Single-Member District Election Outcomes in Fifty-three Countries', British Journal of Political Science（査読論文）" },
      { url: 'https://blogs.lse.ac.uk/politicsandpolicy/duvergers-law-dead-parrot-dunleavy/', type: 'academic', label: "Dunleavy, 'Duverger's law is a dead parrot', LSE British Politics and Policy（ロンドン大学 LSE・批判的論点）" },
      { url: 'https://kenbenoit.net/pdfs/Benoit_FrenchPolitics_2006.pdf', type: 'academic', label: "Benoit, 'Duverger's Law and the Study of Electoral Systems', French Politics（学術論文）" },
    ],
  },
  {
    id: 'econ-money-illusion',
    discipline: 'economics',
    title: '貨幣錯覚',
    statement:
      '貨幣錯覚（money illusion）とは、人々が物価変動を十分に考慮せず、お金の名目的な価値（額面の金額）を実質的な価値（購買力）と混同して判断・行動してしまう認知的傾向を指す。例えば物価が同率で上昇している状況で名目賃金が上がると、実質賃金が変わらない（あるいは下がる）にもかかわらず「給料が上がった」と満足する一方、名目賃金の引き下げには強く抵抗するのに、インフレによる同等の実質賃金低下は受け入れやすい、といった行動に表れる。' +
      '合理的経済人を仮定する古典派・新古典派は、行動を決めるのは実質変数のみであるとして貨幣錯覚を否定する（長期的な貨幣の中立性）。しかしケインズは名目賃金の下方硬直性との関連でこれを重視し、シャフィール・ダイアモンド・トヴェルスキー（1997）らの行動経済学的研究は、人々が実際に名目額に影響される（フレーミング効果）ことを実証した。名目硬直性、インフレ・デフレの実体経済への影響、金融政策の有効性とも関連する。',
    keyFigures:
      'アーヴィング・フィッシャー（Irving Fisher、1928年の著書『The Money Illusion（貨幣錯覚）』で用語を定式化）／ジョン・メイナード・ケインズ（『一般理論』1936年で名目賃金の下方硬直性と関連づけて重視）／エルダー・シャフィール、ピーター・ダイアモンド、エイモス・トヴェルスキー（1997年、行動経済学的に実証）',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/qje/article/112/2/341/1870915', type: 'academic', label: 'Shafir, Diamond & Tversky (1997) "Money Illusion", The Quarterly Journal of Economics 112(2): 341-374 (Oxford Academic)' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/money-illusion', type: 'reference', label: 'Encyclopedia.com — "Money Illusion"（Fisher 1928の定義・業績循環への含意を解説）' },
      { url: 'https://en.wikipedia.org/wiki/Money_illusion', type: 'reference', label: 'Wikipedia — "Money illusion"（名目/実質の混同、Fisher・Keynes・古典派中立性の整理）' },
    ],
  },
  {
    id: 'mgmt-diversification',
    discipline: 'management',
    title: '多角化戦略',
    statement:
      '多角化戦略（diversification strategy）とは、企業が既存の事業・製品・市場にとどまらず、新しい製品分野や新しい市場へ同時に進出して事業範囲を広げる成長戦略である。イゴール・アンゾフが示した成長ベクトル（製品×市場マトリクス：市場浸透・市場開拓・製品開発・多角化）の中で、「新製品×新市場」という製品・市場の双方が未知である最もリスクの高い象限に位置づけられる。' +
      '多角化は、既存事業と技術・顧客・販路などで関連性をもつ「関連多角化」と、関連性の乏しい事業へ進む「非関連多角化（コングロマリット型）」に大別される。動機・利点として、範囲の経済（資源・能力の共有によるコスト削減）、シナジー（相乗効果）、事業リスクの分散、未利用・余剰資源の活用、成長機会の確保が挙げられる。一方で経営資源の分散や統制困難、過度な多角化による「多角化ディスカウント」などの弊害も論じられる。',
    keyFigures:
      'イゴール・アンゾフ（H. Igor Ansoff, 1957）：成長ベクトル（製品×市場マトリクス）を提示し、多角化を最もリスクの高い象限と位置づけた／リチャード・ルメルト（Richard P. Rumelt, 1974/1982）：多角化を関連／非関連に類型化し、共通の中核的スキル・資源を活かす関連多角化型の企業が最も高い収益性を示すという実証研究を行った／主要概念：範囲の経済（economies of scope）・シナジー・リスク分散・多角化ディスカウント',
    asOf: '2026-06',
    sources: [
      { url: 'https://pressbooks.lib.vt.edu/strategicmanagement/chapter/8-3-diversification/', type: 'academic', label: 'Virginia Tech Pressbooks, Strategic Management — 8.3 Diversification（大学OER教科書、関連／非関連多角化）' },
      { url: 'https://www.blackwellpublishing.com/content/GrantContemporaryStrategyAnalysis/6th_Edition/CSAC15.pdf', type: 'academic', label: 'Robert M. Grant, Contemporary Strategy Analysis（Blackwell）, Ch.15 Diversification Strategy（範囲の経済・シナジー・リスク分散・ルメルト）' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/ansoff-matrix', type: 'reference', label: 'EBSCO Research Starters — Ansoff Matrix（多角化が最もリスクの高い新製品×新市場象限であること）' },
      { url: 'https://ocw.u-tokyo.ac.jp/lecture_files/eco_07/10/notes/ja/shintaku-10-2.pdf', type: 'academic', label: '東京大学 OpenCourseWare 経営戦略講義「多角化戦略・シナジー効果」（日本語の一次的講義資料）' },
    ],
  },
  {
    id: 'human-cialdini-influence',
    discipline: 'human-science',
    title: 'チャルディーニの影響力の6原理',
    statement:
      '社会心理学者ロバート・チャルディーニが、承諾（コンプライアンス）や説得が成立しやすくなる心理的メカニズムを、著書『影響力の武器（Influence: The Psychology of Persuasion）』（1984）で6つの普遍的原理に整理した枠組み。(1)返報性（reciprocity、何かを受け取ると返したくなる）、(2)コミットメントと一貫性（commitment and consistency、一度決めた立場・約束に一貫しようとする）、(3)社会的証明（social proof、多くの人がしている行動を正しいと判断する）、(4)好意（liking、好意を持つ相手の頼みを受け入れやすい）、(5)権威（authority、専門家・権威者に従う）、(6)希少性（scarcity、手に入りにくいものほど価値が高いと感じる）。' +
      '後にチャルディーニは7つ目として一体性／結束（unity、自他が同じ集団・アイデンティティを共有していると感じること）を『プレ・スエージョン』（2016）で追加した。マーケティング・交渉・広告に広く応用される一方、操作（悪用）への注意も論じられる。',
    keyFigures:
      'ロバート・チャルディーニ（Robert B. Cialdini、社会心理学者・米アリゾナ州立大学名誉教授）／初出『影響力の武器（Influence: The Psychology of Persuasion）』1984年／第7原理「一体性（unity）」は『プレ・スエージョン（Pre-Suasion）』2016年で追加',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Robert_Cialdini', type: 'reference', label: 'Wikipedia — Robert Cialdini（6原理の列挙と2016年の第7原理「unity」を記載）' },
      { url: 'https://news.wpcarey.asu.edu/20250422-gentle-science-persuasion-part-seven-unity', type: 'academic', label: 'Arizona State University, W. P. Carey News — “The gentle science of persuasion, part seven: Unity”（チャルディーニ所属大学による解説）' },
      { url: 'https://www.seishinshobo.co.jp/book/b10033616.html', type: 'media', label: '誠信書房『影響力の武器［新版］』公式書誌（日本語版正式訳・6原理＋第7原理の邦訳用語の典拠）' },
    ],
  },
  {
    id: 'bizlaw-statutory-lien',
    discipline: 'business-law',
    title: '先取特権（民法303条）',
    statement:
      '先取特権とは、法律で定められた特定の種類の債権を有する者が、債務者の財産から、他の債権者に先立って優先的に弁済を受けることができる法定担保物権である（民法303条）。抵当権・質権のように当事者の合意で設定する約定担保物権と異なり、社会政策的考慮（社会的弱者の保護、公平、当事者の意思の推測等）から法律が特に認めるもので、一定の事情があれば当然に成立し、目的物の占有移転も登記も原則として不要である。' +
      '優先弁済的効力を有する一方、留置的効力は持たない。種類は、債務者の総財産を対象とする「一般の先取特権」（306条）、特定の動産を対象とする「動産の先取特権」（311条）、特定の不動産を対象とする「不動産の先取特権」（325条）の3つに分かれ、各債権間の優先順位も法律で定められる。',
    keyFigures:
      '法定担保物権（当事者の合意不要・法律上当然に成立）／優先弁済的効力あり・留置的効力なし／約定担保物権（抵当権・質権）との対比／原則として占有移転・登記不要／(1)一般の先取特権＝債務者の総財産が対象：共益費用(307条)・雇用関係〔給料等〕(308条)・葬式費用(309条)・日用品供給(310条)の4種（306条）／(2)動産の先取特権＝特定動産が対象：不動産賃貸・旅館宿泊・運輸・動産売買等（311条）／(3)不動産の先取特権＝特定不動産が対象：不動産保存・不動産工事・不動産売買（325条）／例：雇用関係の給料債権は一般の先取特権で保護され、倒産時も一般債権者に優先弁済',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（法令ID 129AC0000000089）第303条以下' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/chosyu/02/03/019/01.htm', type: 'government', label: '国税庁 国税徴収法基本通達 第19条関係 不動産保存の先取特権等の優先' },
      { url: 'https://ja.wikipedia.org/wiki/先取特権', type: 'reference', label: 'Wikipedia「先取特権」（一般・動産・不動産の3種と各条文の概説）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0303-00/', type: 'media', label: 'クレアール司法書士講座 民法第303条【先取特権の内容】' },
    ],
  },
  {
    id: 'infosoc-media-ecology',
    discipline: 'information-sociology',
    title: 'メディア・エコロジー（メディア生態学）',
    statement:
      'メディア（コミュニケーション技術）を、情報を運ぶ中立的な道具としてではなく、人間の知覚・思考・価値・社会組織のあり方を形づくる「環境（environment）」として捉え、メディアの形式そのものと文化・社会との相互作用を研究する学際的アプローチ。提唱者ニール・ポストマンは、生物学で培地（medium）の中で細菌が育つように、メディア・エコロジーでは「文化が育つ技術=環境」としてメディアを捉えると説いた。' +
      '文字・印刷・テレビ・デジタルといったメディアの形式は単なる便利な手段ではなく、それを用いる社会の認識・価値・組織を規定する「象徴的環境」だとみなす技術環境論を核心とする。ポストマンは『愉しみながら死んでいく（Amusing Ourselves to Death, 1985）』で、テレビ的な娯楽化が合理的議論より娯楽を優先させ公共的言説を劣化させると論じた。「メディアはメッセージである」など個別命題と関連しつつ、メディアを環境として総体的に研究する分野として区別される。',
    keyFigures:
      'ニール・ポストマン（Neil Postman、1968年に学術用語として提唱・1971年NYUにプログラム創設・『Amusing Ourselves to Death』1985）／マーシャル・マクルーハン（Marshall McLuhan、「メディアはメッセージである」）／ウォルター・オング（Walter J. Ong、声の文化と文字の文化）／ハロルド・イニス（Harold Innis、メディアの偏向／トロント学派）／系譜にルイス・マンフォード・ジャック・エリュールら',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.media-ecology.org/What-Is-Media-Ecology', type: 'academic', label: 'Media Ecology Association — "What Is Media Ecology?"（メディア・エコロジー学会の公式定義）' },
      { url: 'https://en.wikipedia.org/wiki/Media_ecology', type: 'reference', label: 'Wikipedia「Media ecology」（提唱経緯・系譜の概説）' },
      { url: 'https://www.mdpi.com/2409-9287/1/3/190', type: 'academic', label: 'Scolari, "Media Ecology: A Complex and Systemic Metadiscipline" (Humanities, MDPI 査読論文)' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/media-ecology', type: 'reference', label: 'EBSCO Research Starters「Media ecology」（学術リファレンス級概説）' },
    ],
  },
  {
    id: 'econ-dependence-effect',
    discipline: 'economics',
    title: '依存効果（ガルブレイス）',
    statement:
      'ジョン・ケネス・ガルブレイスが『ゆたかな社会（The Affluent Society）』（1958年）第11章で提示した概念。消費者の欲望は本人の内側から自律的に生じるのではなく、それを満たす生産プロセス自体——広告・宣伝・販売術（salesmanship）、および示唆や模倣（emulation）——によって作り出される、と論じる。豊かな社会では、生産が欲望を生み、その欲望を生産が満たすという循環が生じ、欲望は生産（output）に「依存」する。' +
      'ガルブレイスは「生産が欲望を作り出すのなら、その生産を欲望充足として擁護することはできない」と述べ、欲望を所与とし生産はそれを満たすだけとする伝統的経済学および消費者主権の前提を批判した。関連概念に「社会的アンバランス（social imbalance）」があり、私的財の過剰供給と公共財・公共サービスの過少供給（“private affluence and public squalor”）を指す。ヴェブレンの誇示的消費とは別概念である。',
    keyFigures:
      'ジョン・ケネス・ガルブレイス（John Kenneth Galbraith, 1908–2006）／『ゆたかな社会 The Affluent Society』1958年・第11章／関連概念: 社会的アンバランス（private affluence and public squalor）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/The-Affluent-Society', type: 'reference', label: 'Encyclopaedia Britannica — The Affluent Society (work by Galbraith)' },
      { url: 'https://www.britannica.com/money/John-Kenneth-Galbraith', type: 'reference', label: 'Encyclopaedia Britannica — John Kenneth Galbraith: Biography & Facts' },
      { url: 'https://westernsydney.pressbooks.pub/criticalanalysis/chapter/galbraith-1958-the-dependence-effect/', type: 'academic', label: 'Western Sydney University (Pressbooks) — Galbraith (1958): The Dependence Effect' },
      { url: 'https://msuweb.montclair.edu/~lebelp/GalbraithDepEffect1958.pdf', type: 'academic', label: 'Montclair State University — Galbraith, “Consumer Behavior and the Dependence Effect”（一次テキスト抜粋）' },
    ],
  },
  {
    id: 'econ-exit-voice-loyalty',
    discipline: 'economics',
    title: '離脱・発言・忠誠（ハーシュマン）',
    statement:
      'アルバート・O・ハーシュマンが1970年の著書『離脱・発言・忠誠（Exit, Voice, and Loyalty: Responses to Decline in Firms, Organizations, and States）』で提示した学際的理論。企業・組織・国家の業績や品質が悪化したとき、その構成員（顧客・従業員・市民）が取りうる反応を「離脱（exit＝関係を断つ、競合製品へ乗り換える／退職する）」と「発言（voice＝不満を表明し内部から改善を求める）」の2類型に整理する。' +
      'さらに両者を媒介する「忠誠（loyalty＝組織への愛着）」を導入し、忠誠が高いほど即座の離脱を思いとどまり発言を選びやすくなる結果、発言が有効に機能すると論じた。離脱は市場メカニズム（経済学）、発言は民主的プロセス（政治学）に対応し、経済学と政治学を架橋する概念として、移民・抗議運動・政党・人間関係など広範な現象に応用されてきた。',
    keyFigures:
      'アルバート・O・ハーシュマン（Albert O. Hirschman、経済学者、1915–2012）／『Exit, Voice, and Loyalty』Harvard University Press, 1970年／離脱=市場メカニズム（経済学）・発言=民主的プロセス（政治学）を架橋',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Exit,_Voice,_and_Loyalty', type: 'reference', label: 'Wikipedia: Exit, Voice, and Loyalty' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/exit-voice-and-loyalty', type: 'reference', label: 'Encyclopedia.com: Exit, Voice, and Loyalty' },
      { url: 'https://www.hup.harvard.edu/books/9780674276604', type: 'academic', label: 'Harvard University Press — Exit, Voice, and Loyalty (book page)' },
    ],
  },
  {
    id: 'mgmt-expectancy-theory',
    discipline: 'management',
    title: '期待理論（ブルーム）',
    statement:
      'ヴィクター・ブルームが1964年の著書『Work and Motivation』で提唱した動機づけ理論。人がある行動（努力）へ動機づけられる力は、3つの認知的要素の積で決まるとする。(1)期待（Expectancy）＝努力すれば良い業績につながるという主観確率（E→P、0〜1）、(2)手段性／道具性（Instrumentality）＝業績が報酬・結果につながるという認知（P→O、0〜1）、(3)誘意性（Valence）＝その報酬が本人にとってもつ魅力・価値。' +
      '動機づけの力（Force）＝期待×手段性×誘意性で表され、乗法モデルゆえいずれか一つでもゼロなら全体もゼロになる。後にポーター＝ローラー（Porter & Lawler, 1968）が能力・役割認知や業績と満足の関係を組み込み発展させた。マズロー・ハーズバーグら内容理論（何が動機づけるか）に対し、認知的プロセス（いかに動機づくか）に着目する過程理論の代表とされる。',
    keyFigures:
      'ヴィクター・H・ブルーム（Victor H. Vroom, 1964『Work and Motivation』）／ライマン・ポーター＆エドワード・ローラー（Porter & Lawler, 1968）が発展／Force＝期待(E→P)×手段性(P→O)×誘意性の乗法モデル／内容理論に対する過程理論の代表',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/economics/expectancy-theory', type: 'reference', label: 'EBSCO Research Starters: Expectancy theory（MF = V × I × E、3要素の定義）' },
      { url: 'https://en.wikipedia.org/wiki/Expectancy_theory', type: 'reference', label: 'Wikipedia: Expectancy theory（Vroom 1964、Force=E×I×V、過程理論）' },
      { url: 'https://www.ifm.eng.cam.ac.uk/research/dstools/vrooms-expectancy-theory/', type: 'academic', label: "University of Cambridge, Institute for Manufacturing: Vroom's expectancy theory" },
    ],
  },
  {
    id: 'human-group-polarization',
    discipline: 'human-science',
    title: '集団極性化',
    statement:
      '個人が集団で討議すると、討議後の集団の決定や態度が、討議前の各人の平均的傾向よりもいっそう極端な方向へ強まる現象。当初ストーナー（James Stoner, 1961）が、集団討議後により危険な決定へ傾く「リスキー・シフト（risky shift）」として見出したが、後に慎重化する「コーシャス・シフト（cautious shift）」も観察され、討議は元の傾向を方向を問わず増幅すると再定式化された。' +
      'モスコヴィッシとザヴァローニ（Moscovici & Zavalloni, 1969）が「集団極性化」と命名した。主な説明は、集団内で自説に有利な新たな論拠に多く触れる「説得的論拠理論（persuasive arguments theory）」と、集団規範に照らし望ましい方向で自己呈示する「社会的比較理論（social comparison）」である。エコーチェンバー等オンライン討議の文脈でも論じられる。',
    keyFigures:
      'ジェームズ・ストーナー（James Stoner、リスキー・シフトの発見, 1961）／セルジュ・モスコヴィッシ＆マリサ・ザヴァローニ（Moscovici & Zavalloni、「集団極性化」命名, 1969）／2大説明＝説得的論拠理論・社会的比較理論',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803095909939', type: 'reference', label: 'Oxford Reference — Group polarization（Moscovici & Zavalloni 1969 命名）' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/group-polarization', type: 'academic', label: 'EBSCO Research Starters — Group Polarization（Stoner 1961 起源、2機構）' },
      { url: 'https://www.simplypsychology.org/group-polarization.html', type: 'reference', label: 'SimplyPsychology — Group Polarization: Definition & Examples' },
      { url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5131349/', type: 'academic', label: 'PNAS / PMC — Echo Chambers: Emotional Contagion and Group Polarization on Facebook（査読論文）' },
    ],
  },
  {
    id: 'bizlaw-abuse-of-rights',
    discipline: 'business-law',
    title: '権利濫用の禁止（民法1条3項）',
    statement:
      '権利濫用の禁止とは、形式的には権利の行使に見えても、それが社会的に許される限度を超え、正当な利益を欠いて相手に損害を与えるなど不当な場合に、その行使を権利の濫用として許さないとする民法の基本原則である。民法1条3項は「権利の濫用は、これを許さない。」と定め、同条2項の信義誠実の原則（信義則）とともに、私権行使の一般的制約として民法第1条に置かれる。' +
      '濫用とされた権利行使は法的効果を生じず（差止め・妨害排除や損害賠償の請求が棄却されるなど）、場合により権利自体の剥奪に至ることもある。権利者の利益と相手方の損害を比較衡量し、客観的な社会的標準により濫用の有無が判断される。リーディングケースの宇奈月温泉事件（大審院昭和10年10月5日判決、民集14巻1965頁）は、他人地のごく一部を通過する引湯木管の撤去を不当な高値での買取り目的で求めた事案で、所有権に基づく請求であっても権利濫用にあたり許されないとして請求を棄却した。',
    keyFigures:
      '根拠条文＝民法1条3項「権利の濫用は、これを許さない。」／民法1条の構成＝1項:公共の福祉・2項:信義則・3項:権利濫用の禁止（信義則とは別個の独立原則）／リーディングケース＝宇奈月温泉事件（大審院昭和10年10月5日判決、民集14巻1965頁、妨害排除請求事件）／効果＝濫用の権利行使は効力を生じず請求棄却・場合により権利剥奪',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（第1条 基本原則、権利濫用の禁止）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第1条', type: 'reference', label: 'Wikibooks 民法第1条（条文と各項の趣旨）' },
      { url: 'https://ja.wikipedia.org/wiki/宇奈月温泉事件', type: 'reference', label: 'Wikipedia 宇奈月温泉事件（大判昭10.10.5 民集14巻1965頁・事案・判旨）' },
    ],
  },
  {
    id: 'infosoc-digital-divide',
    discipline: 'information-sociology',
    title: 'デジタルディバイド（情報格差）',
    statement:
      'デジタルディバイド（情報格差）とは、インターネットやパソコン等の情報通信技術（ICT）にアクセスし利活用できる人・集団・地域と、できない人・集団・地域との間に生じる格差を指す。OECDは社会経済的水準の異なる個人・世帯・企業・地域間でのICT利用機会の差と定義する。一般に3層で論じられ、(1)アクセス格差（first-level＝物理的・物質的にICTや回線を利用できるか）、' +
      '(2)利用・スキル格差（second-level＝Hargittaiやvan Dijkらが論じた利用能力・リテラシー・利用の質の差）、(3)成果格差（third-level＝ICT利用から得られる便益・成果の差）に区分される。要因は所得・教育・年齢・地域（都市/地方）・国家間など多岐にわたり、既存の社会的不平等を再生産・拡大させうる点が問題視される。米国NTIAの1990年代報告「Falling Through the Net」を契機に広く認知され、日本では総務省『情報通信白書』が地域間・個人間集団間・国際間の3類型で扱う。',
    keyFigures:
      '普及の契機＝米NTIA「Falling Through the Net」（初版1995年／「Defining the Digital Divide」1999年）／3層モデル: first-level(アクセス)・second-level(スキル/利用、Hargittai 2002)・third-level(成果)／主要研究者＝Jan A.G.M. van Dijk・Eszter Hargittai・Alexander van Deursen／総務省『情報通信白書』分類＝地域間／個人間・集団間／国際間',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oecd.org/en/publications/understanding-the-digital-divide_236405667766.html', type: 'government', label: 'OECD「Understanding the Digital Divide」— 標準的定義' },
      { url: 'https://www.ntia.gov/sites/default/files/data/fttn99/FTTN.pdf', type: 'government', label: '米国NTIA「Falling Through the Net: Defining the Digital Divide」(1999)' },
      { url: 'https://www.soumu.go.jp/johotsusintokei/whitepaper/ja/h23/html/nc222100.html', type: 'government', label: '総務省『平成23年版 情報通信白書』— 日本での定義と3類型' },
      { url: 'https://journals.sagepub.com/doi/10.1177/1461444818797082', type: 'academic', label: 'van Deursen & van Dijk (2019), New Media & Society — first/second-level divide の査読論文' },
    ],
  },
  {
    id: 'econ-tragedy-of-commons',
    discipline: 'economics',
    title: '共有地の悲劇（コモンズの悲劇）',
    statement:
      '誰もが自由にアクセスできる共有資源（牧草地・漁場・大気・地下水等）について、各個人が自己利益を合理的に最大化（共有牧草地に家畜を1頭でも多く放牧する等）すると、便益は個人に帰属する一方で資源消耗のコストは全利用者に分散されるため、資源の過剰利用・枯渇を招き、結果として全員が損失を被るという社会的ジレンマ。' +
      '個人合理性と集団合理性の乖離を示す。生物学者ギャレット・ハーディンが1968年に『Science』誌の論文 “The Tragedy of the Commons” で提示し広めた。古典的解決策は私有化（所有権設定）と政府規制だが、エリノア・オストロムは地域コミュニティによる自主的ルール形成・共同管理（self-governance）で持続的管理が可能と実証し2009年ノーベル経済学賞を受賞した。「オープンアクセス」と「共同管理されたコモンズ」の混同などハーディンへの批判もある。',
    keyFigures:
      'ギャレット・ハーディン（Garrett Hardin, 1968年 Science 論文 “The Tragedy of the Commons” で概念を提示・普及）／エリノア・オストロム（Elinor Ostrom, 共同管理による解決を実証、著書 Governing the Commons 1990、2009年ノーベル経済学賞）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/tragedy-of-the-commons', type: 'reference', label: 'Encyclopaedia Britannica — Tragedy of the commons' },
      { url: 'https://www.britannica.com/topic/Garrett-Hardin', type: 'reference', label: 'Encyclopaedia Britannica — Garrett Hardin' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2009/summary/', type: 'government', label: 'NobelPrize.org — Prize in Economic Sciences 2009 (Elinor Ostrom)' },
      { url: 'https://news.cnrs.fr/opinions/debunking-the-tragedy-of-the-commons', type: 'media', label: 'CNRS News — Debunking the Tragedy of the Commons（open-access vs. commons の批判）' },
    ],
  },
  {
    id: 'econ-x-inefficiency',
    discipline: 'economics',
    title: 'X非効率（ライベンシュタイン）',
    statement:
      'X非効率とは、企業や組織が利用可能な資源・技術から得られるはずの最大産出（生産フロンティア）を実現できず、内部的要因——経営の弛緩、動機づけの欠如、努力不足、情報の不完全性など——によって生産が技術的最善を下回る状態を指す。ハーヴェイ・ライベンシュタインが1966年の論文「Allocative Efficiency vs. “X-Efficiency”」（American Economic Review）で提示した。' +
      '「X」は原因が特定されない未知の要因を表す。新古典派が主に扱う配分の非効率（資源配分のゆがみによる厚生損失）とは区別され、ライベンシュタインは独占の弊害などにおいて配分の非効率（ハーバーガーの三角形）よりもX非効率による損失の方が大きい場合があると論じた。競争圧力の欠如（独占・規制保護）がX非効率を生みやすい。',
    keyFigures:
      'ハーヴェイ・ライベンシュタイン（Harvey Leibenstein, 1922–1994）／1966年論文 “Allocative Efficiency vs. ‘X-Efficiency’”, American Economic Review 56(3): 392–415／「X」＝原因未特定の未知要因／配分の非効率（ハーバーガーの三角形）との対比',
    asOf: '2026-06',
    sources: [
      { url: 'https://msuweb.montclair.edu/~lebelp/leibensteinxeffaer1966.pdf', type: 'academic', label: 'Leibenstein, H. (1966) “Allocative Efficiency vs. X-Efficiency,” American Economic Review 56(3): 392–415（原論文フルテキスト, Montclair State University提供）' },
      { url: 'https://www.aeaweb.org/articles?id=10.1257/jep.25.4.211', type: 'academic', label: 'Retrospectives: X-Efficiency, Journal of Economic Perspectives 25(4)（American Economic Association）' },
      { url: 'https://link.springer.com/referenceworkentry/10.1057/978-1-349-95121-5_1888-2', type: 'reference', label: '“X-Efficiency”, The New Palgrave Dictionary of Economics（SpringerLink）' },
      { url: 'https://en.wikipedia.org/wiki/X-inefficiency', type: 'reference', label: 'X-inefficiency（Wikipedia 百科事典項目）' },
    ],
  },
  {
    id: 'mgmt-organizational-equilibrium',
    discipline: 'management',
    title: '組織均衡論（誘因と貢献）',
    statement:
      'チェスター・バーナードが『経営者の役割（The Functions of the Executive）』（1938）で提示し、H・サイモン『経営行動』（1947）やマーチ＝サイモン『Organizations』（1958）が発展させた、組織存続の条件に関する理論。組織は従業員・出資者・顧客などの参加者から継続的な「貢献（contributions）」を引き出して存続するが、それが可能なのは、参加者が自らの貢献に見合う（あるいはそれ以上の）「誘因（inducements）」を組織から得ていると知覚する限りにおいてである。' +
      '誘因≧貢献のとき参加者は組織にとどまり、組織は均衡を保つ。バーナードはまた公式組織の成立条件として「共通目的」「貢献意欲（協働意志）」「コミュニケーション」の3要素を挙げ、組織の有効性（effectiveness＝協働目的の達成）と能率（efficiency＝参加者個人の動機満足）を区別した。動機づけ理論ではなく、組織存続の条件を説明する理論である点に特徴がある。',
    keyFigures:
      'チェスター・I・バーナード（Chester I. Barnard, 1938『経営者の役割』）／ハーバート・A・サイモン（Herbert A. Simon, 1947『経営行動』）／ジェームズ・G・マーチ（James G. March, 1958『Organizations』）／公式組織の3要素＝共通目的・貢献意欲・コミュニケーション',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/The_Functions_of_the_Executive', type: 'reference', label: 'Wikipedia「The Functions of the Executive」（バーナード1938年、協働体系・有効性と能率）' },
      { url: 'https://en.wikipedia.org/wiki/Administrative_Behavior', type: 'reference', label: 'Wikipedia「Administrative Behavior」（サイモン1947年、誘因＝貢献均衡のバーナード由来）' },
      { url: 'https://onlinelibrary.wiley.com/doi/10.1111/joms.12531', type: 'academic', label: 'Wilden et al. (2019) Journal of Management Studies「60 Years of March and Simon’s Organizations」（査読誌）' },
      { url: 'https://eric.ed.gov/?id=ED213096', type: 'academic', label: 'ERIC ED213096 — バーナードの協働的組織行動と公式組織における経営者機能（米教育省データベース）' },
    ],
  },
  {
    id: 'human-fundamental-attribution-error',
    discipline: 'human-science',
    title: '根本的な帰属の誤り',
    statement:
      '根本的な帰属の誤り（fundamental attribution error）とは、他者の行動の原因を解釈する際に、その場の状況など外的・状況的要因の影響を過小評価し、本人の性格・態度・能力といった内的・気質的（dispositional）要因を過大評価する傾向を指す社会心理学の概念である。' +
      'この用語は、ジョーンズとハリスの実験（Jones & Harris, 1967）など先行研究を踏まえ、社会心理学者リー・ロス（Lee Ross）が1977年に命名した。立場が強制的に割り当てられたと知らされても書き手本人の真の態度を推測してしまう「対応バイアス（correspondence bias）」と密接に関連し、自分の行動は状況のせいに他者の行動は気質のせいにする行為者—観察者バイアスとも関わる。個人主義的な西洋文化でより強く、東アジアの集団主義文化では状況が重視されやすいとする文化差も論じられる。',
    keyFigures:
      'リー・ロス（Lee Ross, 1977 命名）／エドワード・E・ジョーンズ＆ヴィクター・ハリス（Jones & Harris, 1967 古典的実験）／エドワード・E・ジョーンズ＆リチャード・ニスベット（actor-observer bias）／関連概念＝対応バイアス（correspondence bias）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/fundamental-attribution-error', type: 'reference', label: 'Encyclopaedia Britannica「Fundamental attribution error」項目' },
      { url: 'https://www.simplypsychology.org/fundamental-attribution.html', type: 'reference', label: 'Simply Psychology: Fundamental Attribution Error Theory（Ross 1977命名・Jones & Harris 1967実験を解説）' },
      { url: 'https://journals.sagepub.com/doi/10.1177/0146167299258003', type: 'academic', label: 'Krull et al. (1999) “The Fundamental Fundamental Attribution Error: Correspondence Bias in Individualist and Collectivist Cultures”, PSPB（査読論文・文化差）' },
    ],
  },
  {
    id: 'bizlaw-simultaneous-performance',
    discipline: 'business-law',
    title: '同時履行の抗弁権（民法533条）',
    statement:
      '同時履行の抗弁権とは、双務契約（売買・賃貸借など当事者双方が対価的債務を負う契約）において、相手方がその債務の履行（またはその提供）をするまでは、自己の債務の履行を拒める権利をいう（民法533条）。たとえば売買では、買主が代金を支払うまで売主は目的物の引渡しを拒め、逆もまた同様で、公平の観点から当事者の履行を牽連的に結びつける。' +
      '2017年改正（2020年4月1日施行）の533条本文は、括弧書で「債務の履行に代わる損害賠償の債務の履行を含む」と明記し、履行不能時にも抗弁が失われない従来の解釈を条文化した。物権である留置権と機能は似るが、本権は双務契約上の債権的抗弁権である点で異なる。',
    keyFigures:
      '根拠条文＝民法533条（e-Gov law id 129AC0000000089）／性質＝双務契約上の債権的抗弁権（物権の留置権とは別概念）／要件＝(1)同一双務契約から生じる対価的債務の存在、(2)相手方の債務が弁済期にあること、(3)相手方が自己の債務の履行・提供をせずに請求したこと／効果＝履行を拒絶でき、抗弁の付着する債務は相手の履行提供まで履行遅滞責任を負わない・訴訟上は引換給付判決／2017年改正・2020年4月1日施行で「履行に代わる損害賠償の債務の履行を含む」を明文化',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第533条' },
      { url: 'https://ja.wikipedia.org/wiki/同時履行の抗弁権', type: 'reference', label: 'Wikipedia「同時履行の抗弁権」（要件・効果・留置権との異同）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第533条', type: 'reference', label: 'Wikibooks 民法第533条（条文・2017年改正の趣旨）' },
    ],
  },
  {
    id: 'infosoc-privacy-paradox',
    discipline: 'information-sociology',
    title: 'プライバシー・パラドックス',
    statement:
      'プライバシー・パラドックスとは、人々が調査や言明の上ではプライバシーやオンライン上の個人情報保護を強く懸念・重視すると表明しながら、実際の行動では些細な便益や利便性と引き換えに個人情報を容易に提供・開示してしまう、態度と行動の乖離（ギャップ）を指す現象である。電子商取引やSNS研究の文脈で広く論じられる。' +
      'スーザン・B・バーンズの2006年論文（First Monday）でこの語が広く知られるようになった。アクイスティらの行動経済学的研究は、限定合理性・即時的満足への偏り（双曲割引）・情報の非対称性・デフォルト設定や文脈の影響などを乖離の要因として挙げる。一方でココラキス（2017）らは、懸念の測定方法や状況依存性の問題からそもそもパラドックスは存在しないとする批判的レビューを示している。',
    keyFigures:
      'スーザン・B・バーンズ（Susan B. Barnes, 2006『A privacy paradox: Social networking in the United States』First Monday で語を普及）／アレッサンドロ・アクイスティ（Alessandro Acquisti, 行動経済学的分析）／スピロス・ココラキス（Spyros Kokolakis, 2017 批判的システマティックレビュー）',
    asOf: '2026-06',
    sources: [
      { url: 'https://firstmonday.org/ojs/index.php/fm/article/view/1394', type: 'academic', label: 'Barnes, S. B. (2006) “A privacy paradox: Social networking in the United States”, First Monday 11(9)' },
      { url: 'https://www.sciencedirect.com/science/article/pii/S0167404818303031', type: 'academic', label: 'Kokolakis, S. (2017) “Privacy attitudes and privacy behaviour: A review of current research on the privacy paradox phenomenon”, Computers & Security 64:122-134' },
      { url: 'https://www.heinz.cmu.edu/~acquisti/papers/Acquisti-Grossklags-Chapter-Etrics.pdf', type: 'academic', label: 'Acquisti, A. & Grossklags, J. “What Can Behavioral Economics Teach Us About Privacy?”（Carnegie Mellon University, Heinz College）' },
    ],
  },
  {
    id: 'econ-screening',
    discipline: 'economics',
    title: 'スクリーニング（選別理論）',
    statement:
      'スクリーニングとは、情報の非対称性のもとで、情報をもたない側（uninformed party）が情報をもつ側（informed party）に複数の選択肢からなるメニューを提示し、相手の自己選択（self-selection）を通じて隠れた属性・タイプを識別・分離しようとする仕組みである。' +
      'マイケル・ロスチャイルドとジョセフ・スティグリッツが保険市場分析（Rothschild–Stiglitz 1976, QJE）で定式化し、保険会社が「高保険料・高補償」と「低保険料・高免責（低補償）」の契約を用意して高リスク者と低リスク者を分離均衡へ導く例が代表的である。情報をもつ側が自ら信号を発するシグナリング（スペンスの教育シグナル）とは仕掛ける主体が逆で、逆選択への対処手段でもある。',
    keyFigures:
      'マイケル・ロスチャイルド（Michael Rothschild）／ジョセフ・スティグリッツ（Joseph E. Stiglitz、2001年ノーベル経済学賞、A. Michael Spence・George Akerlof と共同受賞）／対をなす概念＝シグナリング（情報をもつ側が仕掛ける）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2001/popular-information/', type: 'government', label: 'NobelPrize.org — The 2001 Prize in Economic Sciences, Popular information（保険会社がメニューでリスク類型を選別＝スクリーニング）' },
      { url: 'https://academic.oup.com/qje/article-abstract/90/4/629/1886620', type: 'academic', label: 'Rothschild & Stiglitz (1976), “Equilibrium in Competitive Insurance Markets,” The Quarterly Journal of Economics 90(4): 629–649（Oxford Academic）' },
      { url: 'https://www.nber.org/papers/t0093', type: 'academic', label: 'Stiglitz & Weiss, “Sorting Out the Differences Between Signaling and Screening Models,” NBER' },
      { url: 'https://en.wikipedia.org/wiki/Screening_(economics)', type: 'reference', label: 'Wikipedia — Screening (economics)（自己選択・分離均衡・シグナリングとの対比）' },
    ],
  },
  {
    id: 'mgmt-dynamic-capabilities',
    discipline: 'management',
    title: 'ダイナミック・ケイパビリティ',
    statement:
      'ダイナミック・ケイパビリティとは、急速に変化する環境に対応するため、企業が内外の能力・コンピタンスを統合・構築・再構成（integrate, build, reconfigure）する組織的・経営的な能力を指す。デイヴィッド・ティース、ゲイリー・ピサノ、エイミー・シューエンが1997年の論文「Dynamic Capabilities and Strategic Management」（Strategic Management Journal 18巻7号）で提示した。静的な資源・能力に着目する資源ベース理論（RBV＝バーニー）が、環境変化への対応＝資源・能力の更新を十分扱えない点を補い、競争優位の持続を動学的に説明する。' +
      'ティースは後に、ダイナミック・ケイパビリティを3つの活動に整理した：(1)感知（sensing＝機会・脅威の察知）、(2)捕捉（seizing＝資源を動員し機会から価値を獲得）、(3)変容・再配置（transforming/reconfiguring＝組織・資源の継続的な刷新）。日常業務を効率的にこなす「通常のケイパビリティ（ordinary capabilities）」とは区別され、模倣・外注が難しく、投資と学習を通じて構築・維持される点に特徴がある。',
    keyFigures:
      'デイヴィッド・J・ティース（David J. Teece）／ゲイリー・ピサノ（Gary Pisano）／エイミー・シューエン（Amy Shuen）（1997, Strategic Management Journal 18(7):509-533）／3活動＝感知・捕捉・変容／資源ベース理論（RBV）の動学的拡張',
    asOf: '2026-06',
    sources: [
      { url: 'https://sms.onlinelibrary.wiley.com/doi/abs/10.1002/(SICI)1097-0266(199708)18:7%3C509::AID-SMJ882%3E3.0.CO;2-Z', type: 'academic', label: 'Teece, Pisano & Shuen (1997) “Dynamic Capabilities and Strategic Management”, Strategic Management Journal 18(7):509-533（Wiley Online Library・原典）' },
      { url: 'https://open.ncl.ac.uk/theories/19/dynamic-capabilities-theory/', type: 'academic', label: 'Dynamic Capabilities Theory — TheoryHub, Newcastle University（sensing/seizing/transforming と ordinary capabilities の区別）' },
      { url: 'https://en.wikipedia.org/wiki/Dynamic_capabilities', type: 'reference', label: 'Dynamic capabilities — Wikipedia（RBV/バーニーとの関係）' },
      { url: 'https://www.strategy-business.com/article/00225', type: 'media', label: 'The Dynamic Capabilities of David Teece — strategy+business（ティース本人へのインタビュー）' },
    ],
  },
  {
    id: 'human-flow-theory',
    discipline: 'human-science',
    title: 'フロー理論（チクセントミハイ）',
    statement:
      'フロー（flow）とは、ある活動に完全に没入し集中エネルギーを注ぎ、その活動自体に楽しみと充実を感じる最適な精神状態で、俗に「ゾーン」とも呼ばれる。ハンガリー系米国の心理学者ミハイ・チクセントミハイが1970年代から研究し（1975年『Beyond Boredom and Anxiety』）、1990年の著書『フロー体験 喜びの現象学（Flow: The Psychology of Optimal Experience）』で広めた、ポジティブ心理学の中心概念の一つである。' +
      'フローが生じる主条件は、(1)課題の難易度（challenge）と本人のスキル（skill）が高水準で釣り合うこと（両方が低いと無関心、難易度過剰だと不安、スキル過剰だと退屈）、(2)明確な目標、(3)即時のフィードバック。特徴として、強い集中、行為と意識の融合、自意識の喪失、時間感覚の変容、活動が内発的報酬となる自己目的的（autotelic）性質などが挙げられる。',
    keyFigures:
      'ミハイ・チクセントミハイ（Mihaly Csikszentmihalyi, 1934–2021）／1975『Beyond Boredom and Anxiety』・1990『Flow: The Psychology of Optimal Experience』／挑戦–スキル均衡・明確な目標・即時フィードバックが発生条件／自己目的的（autotelic）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/psychology/flow-psychology', type: 'reference', label: 'EBSCO Research Starters — Flow (psychology)' },
      { url: 'https://news.uchicago.edu/story/mihaly-csikszentmihalyi-pioneering-psychologist-and-father-flow-1934-2021', type: 'academic', label: 'University of Chicago News — Mihaly Csikszentmihalyi, father of flow (1934–2021)' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7033418/', type: 'academic', label: 'PMC（査読論文）— Investigating the “Flow” Experience: Key Conceptual and Operational Issues' },
      { url: 'https://www.cgu.edu/news/2021/10/passings-mihaly-csikszentmihalyi-the-father-of-flow-1934-2021/', type: 'academic', label: 'Claremont Graduate University — Passings: Mihaly Csikszentmihalyi' },
    ],
  },
  {
    id: 'human-dunning-kruger',
    discipline: 'human-science',
    title: 'ダニング＝クルーガー効果',
    statement:
      'ある領域で能力・知識の乏しい人ほど、自分の無能さを正しく認識（メタ認知）できないために自分の能力を実際より高く過大評価する傾向を指す認知バイアス。誤りに気づくのに必要なメタ認知能力そのものを欠くという「二重の負担（dual burden）」が核心とされる。' +
      '逆に能力の高い人は課題の難しさを理解し、他者も自分と同程度にできると考えて自分の相対的能力をやや過小評価しがちである。社会心理学者デイヴィッド・ダニングとジャスティン・クルーガーがコーネル大学の被験者で行い1999年に報告した。なお平均への回帰やbetter-than-average効果による統計的アーティファクトだとする批判・論争もある。',
    keyFigures:
      'デイヴィッド・ダニング（David Dunning）／ジャスティン・クルーガー（Justin Kruger）／初出 Kruger & Dunning (1999)『Unskilled and Unaware of It』JPSP 77(6):1121–1134／核心＝二重の負担（dual burden）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/Dunning-Kruger-effect', type: 'reference', label: 'Encyclopaedia Britannica — Dunning-Kruger effect' },
      { url: 'https://doi.org/10.1037/0022-3514.77.6.1121', type: 'academic', label: 'Kruger & Dunning (1999), “Unskilled and Unaware of It,” Journal of Personality and Social Psychology 77(6):1121–1134（APA PsycNet, DOI）' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S0160289620300271', type: 'academic', label: 'Gignac & Zajenkowski (2020) — The Dunning-Kruger effect is (mostly) a statistical artefact（Intelligence, ScienceDirect・批判）' },
    ],
  },
  {
    id: 'bizlaw-joint-several-obligation',
    discipline: 'business-law',
    title: '連帯債務（民法436条）',
    statement:
      '連帯債務とは、複数の債務者が、その性質上可分な給付（典型的には金銭債務）について、各自が独立して債務の全部を履行する義務を負い、そのうち一人が弁済すれば他の債務者も債務を免れる多数当事者の債務関係をいう（民法436条）。債権者は、連帯債務者の一人に対し、または同時・順次にすべての連帯債務者に対し、全部または一部の履行を請求できる。' +
      '弁済した連帯債務者は、各自の負担部分に応じて他の連帯債務者に求償権を行使できる（442条）。2017年改正（2020年4月施行）民法は絶対的効力事由を整理し、改正前は絶対的効力をもった履行の請求・免除・時効の完成を原則として相対的効力事由に改めた（弁済・更改・相殺・混同は引き続き絶対的効力を有する）。保証債務（主たる債務に付従・補充する関係）とは別概念である。',
    keyFigures:
      '根拠条文＝民法436条（連帯債務者に対する履行の請求）・442条（連帯債務者間の求償権）（e-Gov law id 129AC0000000089）／2017年改正・2020年4月1日施行／相対的効力化した事由＝履行の請求・免除・時効の完成（原則）／絶対的効力が残る事由＝弁済・更改・相殺・混同／例：A・B・Cが300万円の連帯債務→債権者は誰にでも全額請求可、一人が全額弁済すれば債務消滅／保証債務とは別概念',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（条文・法令ID 129AC0000000089、436条・442条）' },
      { url: 'https://www.ritsumei.ac.jp/acd/cg/law/lex/21-56/030matsuoka.pdf', type: 'academic', label: '松岡久和「民法（債権関係）の改正と不真正連帯債務」立命館法学（連帯債務改正・絶対効/相対効）' },
      { url: 'https://www.businesslawyers.jp/practices/1196', type: 'media', label: 'BUSINESS LAWYERS「民法の連帯債務とは？」（改正による相対効化の解説）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第436条', type: 'reference', label: 'Wikibooks 民法第436条（条文と注釈）' },
    ],
  },
  {
    id: 'infosoc-post-truth',
    discipline: 'information-sociology',
    title: 'ポスト・トゥルース（脱真実）',
    statement:
      'ポスト・トゥルース（post-truth、脱真実）とは、世論形成において客観的事実よりも、感情や個人的信条への訴えかけの方が大きな影響力をもつようになった状況を指す語。Oxford Dictionaries（現Oxford Languages）が2016年の「ワード・オブ・ザ・イヤー」に選び、「客観的事実が、感情や個人的信条への訴えよりも世論形成に影響を与えにくい状況に関する、またはそれを表す」と定義した。' +
      '接頭辞「post-」は「〜の後」ではなく、「真実という概念が重要でなくなった時代に属する」というニュアンスをもつ。2016年の英国EU離脱（ブレグジット）国民投票や米大統領選を背景に使用が前年比約2,000%増となり広まった。哲学者は真実概念の軽視を、メディア研究者はフェイクニュース・ソーシャルメディアのエコーチェンバー・確証バイアスとの関連を論じる。',
    keyFigures:
      'Oxford Dictionaries（2016 Word of the Year に選定・定義）／ラルフ・キーズ（Ralph Keyes、2004『The Post-Truth Era』）／リー・マッキンタイア（Lee McIntyre、2018『Post-Truth』MIT Press）',
    asOf: '2026-06',
    sources: [
      { url: 'https://languages.oup.com/word-of-the-year/2016/', type: 'reference', label: 'Oxford Languages — Word of the Year 2016: Post-Truth（公式定義・語法）' },
      { url: 'https://www.ebsco.com/research-starters/religion-and-philosophy/post-truth-politics', type: 'academic', label: 'EBSCO Research Starters — Post-truth politics' },
      { url: 'https://direct.mit.edu/books/book/3594/Post-Truth', type: 'academic', label: 'Lee McIntyre, Post-Truth, MIT Press (2018) — Books Gateway' },
      { url: 'https://philpapers.org/rec/KEYTPE', type: 'academic', label: 'Ralph Keyes, The Post-Truth Era (2004) — PhilPapers 書誌' },
    ],
  },
  {
    id: 'econ-mental-accounting',
    discipline: 'economics',
    title: 'メンタル・アカウンティング（心の会計）',
    statement:
      'メンタル・アカウンティング（mental accounting／心の会計）とは、人々がお金をその出所・使途・保管場所などに応じて心の中で別々の「勘定（mental account）」に振り分け、本来は代替可能（fungible＝交換可能で色のない）なはずのお金を、あたかも色分けされているかのように扱う傾向を指す行動経済学の概念である。' +
      'リチャード・セイラーが1985年論文「Mental Accounting and Consumer Choice」や1999年論文「Mental Accounting Matters」で定式化し、2017年にノーベル経済学賞を受賞した。カーネマン＝トヴェルスキーのプロスペクト理論（価値関数・参照点）を基礎に、取引効用（transaction utility）や勘定の「締め」とも結びつく。あぶく銭は浪費しやすく給与は慎重に使う、家計を費目別に予算化し流用を避ける、といった例があり、貨幣の代替可能性という標準経済学の前提に反する。',
    keyFigures:
      'リチャード・セイラー（Richard H. Thaler、提唱者・2017年ノーベル経済学賞）／ダニエル・カーネマン＆エイモス・トヴェルスキー（基礎となるプロスペクト理論を構築）／初出 1985 Marketing Science・1999 Journal of Behavioral Decision Making',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2017/press-release/', type: 'government', label: 'NobelPrize.org — 2017年ノーベル経済学賞プレスリリース（セイラーの貢献としてメンタル・アカウンティングを明記）' },
      { url: 'https://people.bath.ac.uk/mnsrf/Teaching%202011/Thaler-99.pdf', type: 'academic', label: 'Thaler, R.H. (1999) “Mental Accounting Matters”, Journal of Behavioral Decision Making 12:183-206（バース大学ホスト・査読論文PDF）' },
      { url: 'https://www.ebsco.com/research-starters/economics/mental-accounting', type: 'reference', label: 'EBSCO Research Starters: Economics — “Mental accounting”' },
      { url: 'https://www.behavioraleconomics.com/resources/mini-encyclopedia-of-be/mental-accounting/', type: 'reference', label: 'BehavioralEconomics.com — Mini-Encyclopedia of BE: Mental accounting' },
    ],
  },
  {
    id: 'mgmt-blue-ocean-strategy',
    discipline: 'management',
    title: 'ブルー・オーシャン戦略',
    statement:
      'W・チャン・キムとレネ・モボルニュ（ともにINSEAD教授）が提唱した経営戦略論で、2005年の同名著書（Harvard Business School Press）で広く知られた。既存需要を奪い合う競争の激しい市場空間を「レッド・オーシャン（赤い海）」と呼ぶのに対し、競争のない未知の市場空間を新たに創造することを「ブルー・オーシャン（青い海）」と呼ぶ。' +
      '核心は、従来トレードオフとされた「差別化（価値向上）」と「低コスト」を同時に追求する「バリュー・イノベーション（value innovation）」にある。分析ツールとして競争要因と提供価値を可視化する「戦略キャンバス（strategy canvas）」、価値を再構築する「4つのアクション＝ERRCグリッド」（取り除く eliminate／減らす reduce／増やす raise／付け加える create）があり、シルク・ドゥ・ソレイユや米サウスウエスト航空が代表事例とされる。',
    keyFigures:
      'W・チャン・キム（W. Chan Kim, INSEAD教授）／レネ・モボルニュ（Renée Mauborgne, INSEAD教授）／2005年著書『Blue Ocean Strategy』（HBR初出2004）／中核概念＝バリュー・イノベーション・戦略キャンバス・ERRCグリッド',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.insead.edu/faculty-research/publications/books/blue-ocean-strategy-how-create-uncontested-market-space-and', type: 'academic', label: 'INSEAD — Blue Ocean Strategy（著者所属校・公式書籍ページ）' },
      { url: 'https://hbr.org/2004/10/blue-ocean-strategy', type: 'academic', label: 'Harvard Business Review — “Blue Ocean Strategy” (Kim & Mauborgne, 2004)' },
      { url: 'https://www.britannica.com/money/blue-ocean-strategy-explained', type: 'reference', label: 'Encyclopædia Britannica Money — Blue Ocean Strategy Explained（戦略キャンバス・ERRCグリッド・事例）' },
      { url: 'https://en.wikipedia.org/wiki/Blue_Ocean_Strategy', type: 'reference', label: 'Wikipedia — Blue Ocean Strategy（出版情報・定義）' },
    ],
  },
  {
    id: 'mgmt-open-innovation',
    discipline: 'management',
    title: 'オープン・イノベーション',
    statement:
      'オープン・イノベーションとは、企業が自社内のR&Dだけに依存せず、外部の知識・技術・アイデアを意図的に取り込み（インバウンド／outside-in）、また自社の未活用技術を外部に提供・ライセンスする（アウトバウンド／inside-out）など、組織の境界を越えて知識を流出入させることでイノベーションを加速し、外部活用市場を拡大する考え方・モデルである。' +
      'ヘンリー・チェスブロウ（UCバークレー）が2003年の著書『Open Innovation: The New Imperative for Creating and Profiting from Technology』で命名・提唱し、すべてを自前で完結させる従来型を「クローズド・イノベーション」と呼んで対比した。彼は後に、内外のアイデアを結合し価値を創造・獲得する「分散した知識の意図的な流出入（purposive inflows and outflows of knowledge）」と定義を精緻化した。スピンオフ、ライセンシング、共同研究、クラウドソーシング、スタートアップとの連携などが具体的手段である。',
    keyFigures:
      'ヘンリー・チェスブロウ（Henry Chesbrough、UCバークレー Haas School of Business、2003年命名）／対比概念＝クローズド・イノベーション／方向＝outside-in（インバウンド）・inside-out（アウトバウンド）',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/edited-volume/61793/chapter/545978353', type: 'academic', label: 'Open Innovation — Oxford Research Encyclopedia of Business and Management (Oxford Academic)' },
      { url: 'https://sloanreview.mit.edu/article/the-era-of-open-innovation/', type: 'academic', label: 'The Era of Open Innovation — Henry Chesbrough, MIT Sloan Management Review' },
      { url: 'https://en.wikipedia.org/wiki/Open_innovation', type: 'reference', label: 'Open innovation — Wikipedia（定義・outside-in/inside-out）' },
      { url: 'https://en.wikipedia.org/wiki/Henry_Chesbrough', type: 'reference', label: 'Henry Chesbrough — Wikipedia（UCバークレー所属・2003年著書）' },
    ],
  },
  {
    id: 'human-resilience',
    discipline: 'human-science',
    title: 'レジリエンス（心理的回復力）',
    statement:
      'レジリエンス（心理的回復力／精神的回復力）とは、逆境・トラウマ・悲劇・脅威や重大なストレス源（家族や人間関係の問題、深刻な健康問題、職場や経済的ストレス等）に直面しても、それにうまく適応し立ち直る過程・能力を指す。アメリカ心理学会（APA）はこれを「困難で挑戦的な人生経験に、精神的・感情的・行動的な柔軟性をもってうまく適応していくプロセスと結果」と定義する。' +
      '重要な点として、レジリエンスは一部の人だけがもつ特別な特性ではなく、誰もが学習・育成しうる思考・行動・習慣を伴う「過程」である（アン・マステンの言う“ordinary magic／ありふれた魔法”）。発達心理学では過酷な環境下でも良好に発達する子どもの研究（E・ワーナーのカウアイ島縦断研究、N・ガーメジー）に起源をもつ。促進要因として支持的な人間関係、現実的な計画と実行力、肯定的な自己観と自己効力感、感情調整、対処スキル、意味づけが挙げられ、心的外傷後成長（PTG）とも関連する。',
    keyFigures:
      'エミー・ワーナー（Emmy Werner／カウアイ島縦断研究）／ノーマン・ガーメジー（Norman Garmezy）／アン・マステン（Ann Masten／“ordinary magic”）／APA定義',
    asOf: '2026-06',
    sources: [
      { url: 'https://dictionary.apa.org/resilience', type: 'reference', label: 'APA Dictionary of Psychology — resilience（アメリカ心理学会 用語事典）' },
      { url: 'https://www.apa.org/topics/resilience', type: 'academic', label: 'American Psychological Association — Resilience（APA 公式トピックページ）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/11315249/', type: 'academic', label: 'Masten A.S. (2001) “Ordinary magic: Resilience processes in development,” American Psychologist（査読論文、PubMed）' },
      { url: 'https://www.cambridge.org/core/journals/development-and-psychopathology/article/abs/risk-resilience-and-recovery-perspectives-from-the-kauai-longitudinal-study/DC3C3F10587A1A7D04C0310270717B3E', type: 'academic', label: 'Werner E.E. — Risk, resilience, and recovery: Perspectives from the Kauai Longitudinal Study, Development and Psychopathology（Cambridge、査読誌）' },
    ],
  },
  {
    id: 'bizlaw-joint-tort',
    discipline: 'business-law',
    title: '共同不法行為（民法719条）',
    statement:
      '共同不法行為とは、複数の者が共同して他人に損害を加えた場合に、各自が連帯してその損害賠償責任を負うとする日本民法上の制度である（民法719条）。同条1項前段は「数人が共同の不法行為によって他人に損害を加えたときは、各自が連帯してその損害を賠償する責任を負う」と定め、後段は共同行為者のうちいずれの者が損害を加えたかを知ることができないときも同様とし、加害者不明の共同不法行為（択一的競合）を規律する。' +
      '2項は教唆者・幇助者を共同行為者とみなす。被害者は各加害者に損害全額を請求でき（不真正連帯債務とされる）、賠償した者は他の加害者に求償しうる。「共同」の意義については主観的共謀の要否につき学説・判例の議論があり、判例（最高裁）は客観的関連共同性で足りるとする立場を基本とする。交通事故の競合や公害訴訟（四大公害訴訟等）で重要な役割を果たす。一般の不法行為（709条）や使用者責任（715条）とは区別される。',
    keyFigures:
      '根拠条文＝民法719条（e-Gov law id 129AC0000000089）／1項前段＝共同不法行為の原則（連帯責任）／1項後段＝加害者不明型（択一的競合）／2項＝教唆者・幇助者を共同行為者とみなす／「共同」の意義＝判例は客観的関連共同性で足りるとする／効果＝不真正連帯債務・賠償者は他の加害者に求償可／適用場面＝交通事故の競合・公害訴訟',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第719条' },
      { url: 'https://www.ritsumei.ac.jp/acd/cg/law/lex/10-56/matsumoto.pdf', type: 'academic', label: '松本克美「侵害行為者の特定と共同不法行為責任の成否」立命館法学' },
      { url: 'https://ja.wikibooks.org/wiki/民法第719条', type: 'reference', label: 'Wikibooks 民法第719条（条文）' },
    ],
  },
  {
    id: 'infosoc-fake-news',
    discipline: 'information-sociology',
    title: 'フェイクニュース（情報の無秩序）',
    statement:
      'フェイクニュースとは、報道記事の体裁を装って流布される虚偽・誤導的な情報を指す語。学術的には曖昧で論争的な用語であり、気に入らない報道を貶める罵倒語としても政治利用されるため、研究者はより精緻な「情報の無秩序（information disorder）」の枠組みを用いる。' +
      'クレア・ワードルとホセイン・デラクシャンが欧州評議会報告書（2017）で示したこの枠組みは、誤情報（misinformation＝害意なく共有される誤情報）、偽情報（disinformation＝害意をもって作られ共有される虚偽）、悪意情報（malinformation＝真実だが害意で暴露・流布される情報）の3類型を区別する。2016年の米大統領選やブレグジットを機に社会的関心が高まり、ヴォソウギらの2018年Science論文（虚偽は真実より速く広く拡散すると報告）やボット・エコーチェンバー・ディープフェイク等と関連して論じられる。',
    keyFigures:
      'クレア・ワードル（Claire Wardle）／ホセイン・デラクシャン（Hossein Derakhshan）（情報の無秩序の3類型、欧州評議会2017）／ソルーシュ・ヴォソウギ・デブ・ロイ・シナン・アラル（Vosoughi, Roy & Aral, 2018 Science）',
    asOf: '2026-06',
    sources: [
      { url: 'https://shorensteincenter.org/resource/information-disorder-framework-for-research-and-policymaking/', type: 'academic', label: 'Wardle & Derakhshan, “Information Disorder” (Council of Europe / Harvard Shorenstein Center, 2017)' },
      { url: 'https://www.coe.int/en/web/freedom-expression/information-disorder', type: 'government', label: 'Council of Europe — Information Disorder（欧州評議会・公式解説）' },
      { url: 'https://www.science.org/doi/10.1126/science.aap9559', type: 'academic', label: 'Vosoughi, Roy & Aral, “The Spread of True and False News Online,” Science 359:1146–1151 (2018)' },
      { url: 'https://www.britannica.com/topic/fake-news', type: 'reference', label: 'Encyclopædia Britannica — “Fake news”' },
    ],
  },
  {
    id: 'econ-baumol-cost-disease',
    discipline: 'economics',
    title: 'ボーモルのコスト病',
    statement:
      'ボーモルのコスト病（ボーモル効果）とは、労働生産性の上昇が乏しい労働集約的部門（教育・医療・対人サービス・舞台芸術など、機械化や効率化が難しい部門）において、生産性が向上していないにもかかわらず賃金が上昇し、結果としてその部門の財・サービスの相対価格が継続的に上昇する現象を指す。原因は、製造業など生産性の高い「進歩的」部門の賃金上昇が、労働市場での競合を通じて生産性の低い「停滞的」部門の賃金をも押し上げることにある。' +
      '古典的な例として、ベートーヴェンの弦楽四重奏の演奏に必要な人数（4人）と時間は19世紀から変わらず労働生産性が上がらないが、演奏者の賃金は経済全体の生産性上昇に伴って上昇するため、生演奏のコストは上がり続ける。ウィリアム・ボーモルとウィリアム・ボーエンが1960年代の舞台芸術の経済分析で示した概念で、医療費・教育費の長期的上昇やサービス経済化に伴う物価動向の説明に用いられる。',
    keyFigures:
      'ウィリアム・J・ボーモル（William J. Baumol）／ウィリアム・G・ボーエン（William G. Bowen）／初出 1966『Performing Arts: The Economic Dilemma』・Baumol 1967 American Economic Review「Macroeconomics of Unbalanced Growth」',
    asOf: '2026-06',
    sources: [
      { url: 'http://piketty.pse.ens.fr/files/Baumol1967.pdf', type: 'academic', label: 'Baumol, W. J. (1967) “Macroeconomics of Unbalanced Growth: The Anatomy of Urban Crisis,” American Economic Review 57(3): 415-426（原論文PDF）' },
      { url: 'https://link.springer.com/rwe/10.1057/978-1-349-95121-5_3060-2', type: 'reference', label: 'The New Palgrave Dictionary of Economics: “Baumol’s Cost Disease”（Springer Nature）' },
      { url: 'https://en.wikipedia.org/wiki/Baumol_effect', type: 'reference', label: 'Wikipedia: “Baumol effect”（ベートーヴェン弦楽四重奏の例を含む）' },
      { url: 'https://www.ebsco.com/research-starters/economics/baumols-cost-disease', type: 'reference', label: 'EBSCO Research Starters (Economics): “Baumol’s cost disease”' },
    ],
  },
  {
    id: 'human-marshmallow-test',
    discipline: 'human-science',
    title: 'マシュマロ・テスト（満足の遅延）',
    statement:
      'マシュマロ・テストは、心理学者ウォルター・ミシェルらがスタンフォード大学で1960年代後半〜70年代初頭に行った、幼児の「満足の遅延（delay of gratification＝より大きな後の報酬のために目先の小さな報酬を我慢する自制心）」を測る一連の実験。就学前児を1人にし、卓上にマシュマロ（やクッキー・プレッツェル等）を1個置いて、実験者が戻るまで約15分待てれば2個、待てずに呼べば1個と告げ、待てる時間や用いる方略（注意をそらす等）を観察した。' +
      'ミシェルらの追跡研究（Shoda, Mischel & Peake 1990）では、長く待てた子は後年のSATスコアや学業・社会的能力など一部の指標で良好な傾向が報告された。ただし近年の大規模な概念的再現研究（Watts, Duncan & Quan 2018）では、家庭の社会経済的背景等を統制すると後年の成果との相関は大幅に縮小し、解釈には注意が必要とされる。自制心・実行機能・将来志向の研究で重要。',
    keyFigures:
      'ウォルター・ミシェル（Walter Mischel、スタンフォード大学）／追跡研究 Shoda, Mischel & Peake (1990)／再現研究 Watts, Duncan & Quan (2018, Psychological Science)／概念＝満足の遅延（delay of gratification）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Walter-Mischel', type: 'reference', label: 'Encyclopaedia Britannica — Walter Mischel（Stanford Marshmallow Experiment / 満足の遅延）' },
      { url: 'https://www.britannica.com/science/delay-of-gratification', type: 'reference', label: 'Encyclopaedia Britannica — Delay of gratification' },
      { url: 'https://journals.sagepub.com/doi/abs/10.1177/0956797618761661', type: 'academic', label: 'Watts, Duncan & Quan (2018) “Revisiting the Marshmallow Test,” Psychological Science（査読・概念的再現）' },
      { url: 'https://psychology.columbia.edu/news/memoriam-walter-mischel-psychologist-who-developed-pioneering-marshmallow-test', type: 'academic', label: 'Columbia University 心理学部 — In Memoriam: Walter Mischel（経歴・テスト概要）' },
    ],
  },
  {
    id: 'bizlaw-structure-liability',
    discipline: 'business-law',
    title: '工作物責任（民法717条）',
    statement:
      '工作物責任とは、土地の工作物（建物・塀・橋・擁壁・看板・遊具など土地に接着して人工的に設置された物）の設置または保存に瑕疵（欠陥）があり、それによって他人に損害が生じた場合の損害賠償責任をいう（民法717条）。同条1項は、第一次的に「占有者」が責任を負うが、占有者が損害発生防止に必要な注意をしたことを証明したときは免責され、その場合は第二次的に「所有者」が責任を負うと定める。' +
      '占有者の責任は過失の立証責任が被害者から占有者側に転換された「中間責任（準無過失責任）」であるのに対し、所有者の責任には免責規定がなく、無過失でも責任を負う「無過失責任（厳格責任）」である。これは危険な物を支配する者が責任を負うべきとする危険責任の考え方に基づく。2項は竹木の栽植・支持の瑕疵にも準用され、3項は損害の原因について他に責任を負う者があるとき占有者・所有者はその者に求償できると定める。被害者が加害者の過失を立証する一般の不法行為（709条）の特則である。',
    keyFigures:
      '根拠条文＝民法717条（e-Gov law id 129AC0000000089）／1項：占有者が第一次責任（必要な注意の証明で免責）→所有者が第二次責任（免責規定なし）／占有者＝中間責任（立証責任転換・準無過失責任）／所有者＝無過失責任（厳格責任・危険責任）／2項：竹木の栽植・支持の瑕疵に準用／3項：真の責任者への求償権／一般不法行為709条の特則',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第717条' },
      { url: 'https://www.ritsumei.ac.jp/acd/cg/law/lex/08-56/18matumoto.pdf', type: 'academic', label: '松本克美「土地工作物責任における〈第一次的所有者責任・第二次的占有者責任論〉の可能性」立命館法学' },
      { url: 'https://www.zennichi.or.jp/law_faq/賃貸建物における事故とオーナー責任/', type: 'media', label: '公益社団法人全日本不動産協会「賃貸建物における事故とオーナー責任」' },
      { url: 'https://ja.wikibooks.org/wiki/民法第717条', type: 'reference', label: 'Wikibooks 民法第717条（条文・解説）' },
    ],
  },
  {
    id: 'infosoc-computational-propaganda',
    discipline: 'information-sociology',
    title: '計算プロパガンダ',
    statement:
      'ソーシャルメディア上で、アルゴリズム・自動化（ボット）と人間のキュレーション（管理）を組み合わせ、誤導的な情報を意図的に配信して世論を操作しようとする活動を指す。サミュエル・ウーリーとフィリップ・N・ハワードが主導したオックスフォード大学オックスフォード・インターネット研究所（OII）の「Computational Propaganda Project（COMPROP）」で概念化・実証された。ハワードらは「ソーシャルメディア・ネットワーク上で誤情報を配信するためにアルゴリズム、自動化、人間のキュレーションを用いること」と定義する。' +
      '主な手段は、ソーシャルボットによる投稿の自動大量生成やトレンド操作、政治目的の偽アカウント（sock puppet）、トロール、草の根運動を装うアストロターフィングなど。2016年の米大統領選や英EU離脱（Brexit）国民投票での利用が研究されている。フェイクニュース・ポストトゥルース・フィルターバブル・エコーチェンバー等とは関連するが、配信の自動化・組織化に焦点を当てた別概念である。',
    keyFigures:
      'サミュエル・C・ウーリー（Samuel C. Woolley）／フィリップ・N・ハワード（Philip N. Howard）／オックスフォード・インターネット研究所 Computational Propaganda Project（COMPROP／現 DemTech）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oii.ox.ac.uk/research/projects/computational-propaganda/', type: 'academic', label: 'Oxford Internet Institute, University of Oxford — Computational Propaganda (COMPROP) project page' },
      { url: 'https://global.oup.com/academic/product/computational-propaganda-9780190931407', type: 'academic', label: 'Woolley & Howard (eds.) Computational Propaganda, Oxford University Press, 2018' },
      { url: 'https://en.wikipedia.org/wiki/Computational_propaganda', type: 'reference', label: 'Wikipedia — Computational propaganda（定義・手段・事例の概観）' },
      { url: 'https://journals.sagepub.com/doi/10.1177/20570473231185996', type: 'academic', label: 'Howard, Lin & Tuzov (2023) “Computational propaganda: Concepts, methods, and challenges,” Communication and the Public（SAGE, 査読誌）' },
    ],
  },
  {
    id: 'econ-monopolistic-competition',
    discipline: 'economics',
    title: '独占的競争',
    statement:
      '独占的競争（monopolistic competition）は、完全競争と独占の中間に位置する市場形態である。(1)多数の売り手・買い手が存在し、(2)各企業が製品差別化（ブランド・品質・デザイン・立地等で他社製品と区別）を行うため自社製品について右下がりの需要曲線に直面し、価格を若干上下できる一定の価格支配力をもち、(3)参入・退出が自由である、という特徴をもつ。' +
      '差別化により短期には超過利潤を得られるが、参入が自由なため長期には新規参入で需要が奪われ超過利潤はゼロとなり、価格＝平均費用となる。ただし長期均衡でも価格＞限界費用であり、平均費用曲線の最低点より左側で操業するため「過剰生産能力（excess capacity）」が生じ、資源配分は完全競争より非効率とされる。エドワード・チェンバリンとジョーン・ロビンソンがほぼ同時期（1933年）に独立に理論化した。',
    keyFigures:
      'エドワード・H・チェンバリン（Edward H. Chamberlin、1933『The Theory of Monopolistic Competition』）／ジョーン・ロビンソン（Joan Robinson、1933『The Economics of Imperfect Competition』、ほぼ同時期に独立して理論化）／例＝レストラン・衣料品・小売業／長期均衡で過剰生産能力・P＞MC',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/monopolistic-competition', type: 'reference', label: 'Encyclopaedia Britannica（Britannica Money）— Monopolistic competition' },
      { url: 'https://www.britannica.com/money/Edward-Hastings-Chamberlin', type: 'reference', label: 'Encyclopaedia Britannica — Edward Hastings Chamberlin（Chamberlin/Robinson 1933 同時独立）' },
      { url: 'https://uw.pressbooks.pub/microman/chapter/8-1-monopolistic-competition-competition-among-many/', type: 'academic', label: 'University of Washington Pressbooks — Microeconomics for Managers（長期ゼロ利潤・過剰生産能力・P>MC）' },
      { url: 'https://saylordotorg.github.io/text_principles-of-economics-v2.0/s14-01-monopolistic-competition-compe.html', type: 'academic', label: 'Saylor Academy — Principles of Economics（Monopolistic Competition）' },
    ],
  },
  {
    id: 'mgmt-job-characteristics-model',
    discipline: 'management',
    title: '職務特性モデル（ハックマン＆オルダム）',
    statement:
      'J・リチャード・ハックマンとグレッグ・R・オルダムが1970年代に提示した職務設計の理論で、仕事の設計が従業員の内発的動機づけ・満足・業績に与える影響を説明する。中核は5つの職務特性——技能多様性（skill variety）、タスク・アイデンティティ（task identity＝仕事の全体性・完結性）、タスク重要性（task significance＝他者や社会への影響）、自律性（autonomy）、フィードバック（feedback）。' +
      'これらが3つの重要な心理状態——仕事の有意味感、結果に対する責任感、結果の知識——を生み、高い内発的動機づけ・職務満足・質の高い業績と低い離職/欠勤をもたらす。5特性から動機づけ潜在性指数（MPS＝((技能多様性＋タスク・アイデンティティ＋タスク重要性)/3)×自律性×フィードバック）を算出し、効果の強さは個人の成長欲求の強さ（growth need strength, GNS）によって調整される。',
    keyFigures:
      'J・リチャード・ハックマン（J. Richard Hackman）／グレッグ・R・オルダム（Greg R. Oldham）（1975 Journal of Applied Psychology・1976 OBHP・1980『Work Redesign』）／5職務特性・3心理状態・MPS・GNS（モデレーター）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100021207', type: 'reference', label: 'Job Characteristics Model — Oxford Reference' },
      { url: 'https://scholar.harvard.edu/rhackman/publications/development-job-diagnostic-survey', type: 'academic', label: 'Hackman & Oldham (1975) Development of the Job Diagnostic Survey, Journal of Applied Psychology 60:159-170 — Harvard Scholar' },
      { url: 'https://www.mindtools.com/axhs5j7/hackman-and-oldhams-job-characteristics/', type: 'media', label: "Hackman and Oldham's Job Characteristics — MindTools" },
      { url: 'https://www.aihr.com/blog/job-characteristics-model/', type: 'media', label: 'Job Characteristics Model: A Practical Guide — AIHR' },
    ],
  },
  {
    id: 'human-growth-mindset',
    discipline: 'human-science',
    title: 'マインドセット理論（ドゥエック）',
    statement:
      'スタンフォード大学の心理学者キャロル・ドゥエックが提唱した、知能や能力の性質に関する暗黙の信念（implicit theories of intelligence）の理論。能力は努力・学習・戦略で伸ばせると信じる「成長マインドセット（growth mindset／増分理論 incremental theory）」と、能力は生まれつき固定的だと信じる「硬直マインドセット（fixed mindset／実体理論 entity theory）」を対比する。' +
      '成長マインドセットの人は困難や失敗を学習の機会と捉え、努力を価値あるものとみなし、挫折から立ち直りやすく高い達成につながりやすい一方、硬直マインドセットは失敗を能力欠如の証と捉え挑戦を回避させやすい。能力ではなく努力・プロセスを褒めることが子のマインドセットに影響する。2006年の著書『Mindset』で普及。近年は教育介入の効果量や再現性をめぐる議論（National Study of Learning Mindsets 2019 等）もある。',
    keyFigures:
      'キャロル・ドゥエック（Carol S. Dweck）／クラウディア・ミューラー（Claudia M. Mueller, 1998年称賛研究の共著者）／デイヴィッド・イェーガー（David S. Yeager, 2019年大規模研究の主導者）',
    asOf: '2026-06',
    sources: [
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6594552/', type: 'academic', label: 'Dweck & Yeager, “Mindsets: A View From Two Eras”, Perspectives on Psychological Science (NIH/PMC 査読論文)' },
      { url: 'https://www.nature.com/articles/s41586-019-1466-y', type: 'academic', label: 'Yeager et al., “A national experiment reveals where a growth mindset improves achievement”, Nature (2019)' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/9686450/', type: 'academic', label: 'Mueller & Dweck (1998) “Praise for Intelligence Can Undermine Children’s Motivation and Performance”, J. Personality and Social Psychology 75:33–52, PubMed' },
      { url: 'https://learning-theories.com/mindset-theory-fixed-vs-growth-mindset-dweck.html', type: 'reference', label: 'Mindset Theory – Fixed vs. Growth Mindset (Dweck), Learning Theories' },
    ],
  },
  {
    id: 'human-hawthorne-effect',
    discipline: 'human-science',
    title: 'ホーソン効果',
    statement:
      'ホーソン効果とは、人が「自分が観察・注目されている」と意識することで、その行動や作業成績が変化する（多くは一時的に向上する）現象をいう。名称は米ウェスタン・エレクトリック社のホーソン工場（イリノイ州シセロ）で1924〜1932年頃に行われた一連の実験（ホーソン実験）に由来する。当初は照明など物理的作業条件と生産性の関係を調べる目的だったが、照明を明るくしても暗くしても、また休憩や労働時間を変えても生産性が向上する傾向がみられた。' +
      'このため、物理的条件より「実験対象として注目され観察されている」という社会的・心理的要因が作業者の動機づけに影響すると解釈された。エルトン・メイヨーやフリッツ・レスリスバーガーらハーバード大学の研究者が関与し、職場の人間関係・非公式集団・士気の重要性を示して「人間関係論」学派の出発点となった。なお「ホーソン効果」という用語自体は1958年にH・A・ランズバーガーが命名したもので、後年は当初の解釈に対する方法論的批判や再分析（効果は限定的とする説）もある。',
    keyFigures:
      'エルトン・メイヨー（Elton Mayo）／フリッツ・レスリスバーガー（Fritz Roethlisberger）／ヘンリー・A・ランズバーガー（Henry A. Landsberger、1958年に用語命名）／ホーソン実験（1924〜1932、人間関係論の出発点）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Hawthorne-research', type: 'reference', label: 'Encyclopaedia Britannica — Hawthorne research' },
      { url: 'https://www.britannica.com/biography/Elton-Mayo', type: 'reference', label: 'Encyclopaedia Britannica — Elton Mayo: Hawthorne Studies, Human Relations & Management Theory' },
      { url: 'https://www.simplypsychology.org/hawthorne-effect.html', type: 'reference', label: 'Simply Psychology — Hawthorne Effect (Landsberger 1958 命名, illumination studies)' },
      { url: 'https://www.nber.org/system/files/working_papers/w15016/w15016.pdf', type: 'academic', label: 'NBER Working Paper 15016 — “Was There Really a Hawthorne Effect at the Hawthorne Plant?”（再分析・批判）' },
    ],
  },
  {
    id: 'infosoc-informational-self-determination',
    discipline: 'information-sociology',
    title: '情報自己決定権',
    statement:
      '情報自己決定権（informational self-determination／自己情報コントロール権）とは、個人が自己に関する情報の取得・保有・利用・開示を、原則として自ら決定しコントロールする権利をいう。これはプライバシー権を、Warren・Brandeis（1890）以来の「ひとりにしておかれる権利（the right to be let alone）」という消極的理解から、自己情報の流れを能動的に管理する積極的権利へと再構成する考え方の基礎をなす。' +
      'ドイツ連邦憲法裁判所は1983年の国勢調査判決（Volkszählungsurteil）で、基本法上の一般的人格権（基本法2条1項・1条1項）から導かれる「情報自己決定権（Recht auf informationelle Selbstbestimmung）」を初めて承認し、これがEUデータ保護法制（GDPR）の理論的背景の一つとなった。日本でも佐藤幸治らが自己情報コントロール権説を有力に主張し、個人情報保護法制の理念的基礎として論じられる。',
    keyFigures:
      'ドイツ連邦憲法裁判所（1983年国勢調査判決・Volkszählungsurteil）／Samuel D. Warren・Louis D. Brandeis（「ひとりにしておかれる権利」1890）／Alan F. Westin（『Privacy and Freedom』1967）／佐藤幸治（日本における自己情報コントロール権説）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.bundesverfassungsgericht.de/SharedDocs/Entscheidungen/EN/1983/12/rs19831215_1bvr020983en.html', type: 'government', label: '独・連邦憲法裁判所 1983年12月15日判決（国勢調査判決）英語版（公式）' },
      { url: 'https://en.wikipedia.org/wiki/Informational_self-determination', type: 'reference', label: 'Wikipedia「Informational self-determination」' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S0267364908001660', type: 'academic', label: 'Hornung & Schnabel, “Data protection in Germany I: The population census decision and the right to informational self-determination” (Computer Law & Security Review, 査読誌)' },
      { url: 'https://www.soumu.go.jp/main_content/000656383.pdf', type: 'government', label: '総務省『情報通信政策研究』（自己情報コントロール権論を扱う論文）' },
    ],
  },
  {
    id: 'econ-impossible-trinity',
    discipline: 'economics',
    title: '国際金融のトリレンマ（不可能な三位一体）',
    statement:
      '開放経済では、(1)為替相場の安定（固定相場制）、(2)自由な国際資本移動、(3)独立した金融政策、の3目標を同時に達成することは不可能であり、最大でも2つしか選べないという命題（不可能な三位一体／マンデル＝フレミングのトリレンマ）。2つを選べば残る1つは放棄される。' +
      '例：固定相場＋自由な資本移動なら金融政策の独立を失い（金本位制・ユーロ圏各国）、独立金融政策＋自由な資本移動なら変動相場制を受け入れ（日本・米国）、固定相場＋独立金融政策なら資本移動を規制する（旧中国・ブレトンウッズ体制）。固定相場の維持には対外金利への追随が必要で、国内目的のための金利設定が制約されることに起因する。マンデル＝フレミング・モデルを理論的基礎とする。',
    keyFigures:
      'ロバート・マンデル（Robert Mundell, 1999年ノーベル経済学賞）／J・マーカス・フレミング（J. Marcus Fleming）（1960年代に独立に展開）／モーリス・オブストフェルド・ジェイ・C・シャンボー・アラン・M・テイラー（歴史的実証 “The Trilemma in History” 2005）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Impossible_trinity', type: 'reference', label: 'Wikipedia「Impossible trinity」（マンデルとフレミングが1960–1963年に独立に展開、3つのうち2つのみ達成可能）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1999/mundell/facts/', type: 'government', label: 'NobelPrize.org — 1999年経済学賞 Robert A. Mundell（為替相場制度下の金融・財政政策および最適通貨圏の分析）' },
      { url: 'https://www.nber.org/papers/w10396', type: 'academic', label: 'Obstfeld, Shambaugh & Taylor “The Trilemma in History”（NBER Working Paper No. 10396, 2004）' },
      { url: 'https://direct.mit.edu/rest/article-abstract/87/3/423/57557/The-Trilemma-in-History-Tradeoffs-Among-Exchange', type: 'academic', label: 'Obstfeld, Shambaugh & Taylor, Review of Economics and Statistics 87(3):423–438 (2005), MIT Press（査読論文・歴史的実証）' },
    ],
  },
  {
    id: 'econ-keynesian-beauty-contest',
    discipline: 'economics',
    title: 'ケインズの美人投票',
    statement:
      'ジョン・メイナード・ケインズが『雇用・利子および貨幣の一般理論』（1936）第12章で、株式市場の投資家行動を説明するために用いた比喩。新聞紙上の美人コンテスト（100枚の写真から最も美しい6枚を選び、全投票者の平均的選好に最も近い選択をした者に賞品が出る）を例に、賢い参加者は自分の好みではなく「他者が美しいと思いそうな顔」、さらに「他者が平均的に何を選ぶと皆が予想するか」という高次の予想で選ぶと論じた。' +
      'ケインズはこれを「第三段階」と呼び、知性は「平均的意見が平均的意見をどう予想するかを予想する」ことに費やされるとした。投資家も株式の本来の価値（ファンダメンタルズ）ではなく、他者の将来評価という平均的予想を予想して行動するため、価格は自己言及的な相互予想で決まりうる。後にゲーム理論のp-beauty contest／推測ゲーム（Nagel 1995）や、高次の信念・バブル・群集行動の分析へ発展した。',
    keyFigures:
      'ジョン・メイナード・ケインズ（John Maynard Keynes、『一般理論』1936 第12章で提唱）／ローズマリー・ナーゲル（Rosemarie Nagel、p-beauty contest／推測ゲームの実験的定式化, 1995）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.marxists.org/reference/subject/economics/keynes/general-theory/ch12.htm', type: 'reference', label: 'J.M. Keynes, The General Theory of Employment, Interest and Money (1936), Chapter 12（原典全文）' },
      { url: 'https://en.wikipedia.org/wiki/Keynesian_beauty_contest', type: 'reference', label: 'Wikipedia: Keynesian beauty contest（概念・新聞コンテストの比喩）' },
      { url: 'https://ideas.repec.org/a/aea/aecrev/v85y1995i5p1313-26.html', type: 'academic', label: 'Nagel, R. (1995) “Unraveling in Guessing Games: An Experimental Study,” American Economic Review 85(5):1313–1326（査読論文／p-beauty contest）' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/beauty-contest-metaphor', type: 'reference', label: 'Encyclopedia.com: Beauty Contest Metaphor（百科事典級リファレンス）' },
    ],
  },
  {
    id: 'mgmt-balanced-scorecard',
    discipline: 'management',
    title: 'バランスト・スコアカード',
    statement:
      'バランスト・スコアカード（BSC）は、ロバート・S・キャプラン（ハーバード大）とデイビッド・P・ノートンが1992年のHarvard Business Review論文「The Balanced Scorecard—Measures That Drive Performance」で提唱した業績評価・戦略マネジメントの枠組み。' +
      '財務指標偏重の従来型管理を補い、ビジョンと戦略を(1)財務、(2)顧客、(3)業務プロセス、(4)学習と成長の4つの視点からバランスよく測定・管理する。各視点で戦略目標・成功要因・業績評価指標・数値目標・施策を設定し、過去を表す財務（遅行指標）と将来を生む非財務（先行指標）を結びつける。後にキャプラン＆ノートンは視点間の因果連鎖を可視化する「戦略マップ」へ発展させ、戦略の策定と実行をつなぐツールとした。',
    keyFigures:
      'ロバート・S・キャプラン（Robert S. Kaplan、ハーバード大）／デイビッド・P・ノートン（David P. Norton）／初出: Harvard Business Review 1992年1-2月号 pp.71-79／4視点: 財務・顧客・業務プロセス・学習と成長／発展形: 戦略マップ（Strategy Maps, 2004）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.hbs.edu/faculty/Pages/item.aspx?num=9161', type: 'academic', label: 'Harvard Business School Faculty & Research — “The Balanced Scorecard: Measures that Drive Performance” (HBR 70, no.1, 1992: 71–79)' },
      { url: 'https://hbr.org/1992/01/the-balanced-scorecard-measures-that-drive-performance-2', type: 'reference', label: 'Harvard Business Review — 原典記事ページ（Kaplan & Norton, 1992）' },
      { url: 'https://www.sciencedirect.com/science/article/pii/S0007681322000258', type: 'academic', label: 'Business Horizons (ScienceDirect, 査読誌) — “Thirty years with the balanced scorecard: What we have learned”' },
      { url: 'https://balancedscorecard.org/bsc-basics/articles-videos/the-four-perspectives-of-the-balanced-scorecard/', type: 'reference', label: 'Balanced Scorecard Institute — The Four Perspectives of the Balanced Scorecard' },
    ],
  },
  {
    id: 'human-dual-process-theory',
    discipline: 'human-science',
    title: '二重過程理論（システム1とシステム2）',
    statement:
      '二重過程理論は、人間の思考・判断・意思決定が性質の異なる2つの認知過程によって担われるとする枠組みである。システム1は速く・自動的・直感的で努力をほとんど要さず無意識的・連想的に働き（例：簡単な計算、表情の読み取り、ヒューリスティック）、システム2は遅く・意識的・分析的で注意と努力を要し系列的に働く（例：複雑な計算、熟慮を要する判断）。' +
      '多くの認知バイアスやヒューリスティックは、システム1の自動的処理がシステム2による十分な吟味を経ずに用いられることから生じると説明される。「システム1／システム2」の呼称はスタノヴィッチとウェストに由来し、カーネマンが著書『ファスト＆スロー』（2011）で採用・普及させた。同種の二過程モデルは推論研究や態度・説得研究にも広くみられるが、2つを別個の「システム」とみなす見方には批判があり、近年は連続体や複数過程とみる議論もある。',
    keyFigures:
      'ダニエル・カーネマン（Daniel Kahneman、『ファスト＆スロー』2011で普及）／キース・スタノヴィッチ（Keith Stanovich）＆リチャード・ウェスト（Richard West、「システム1／2」の呼称）／ジョナサン・エヴァンス（Jonathan St. B. T. Evans、推論研究）',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/abs/10.1177/1745691612460685', type: 'academic', label: 'Evans & Stanovich (2013) “Dual-Process Theories of Higher Cognition: Advancing the Debate”, Perspectives on Psychological Science (SAGE, 査読論文)' },
      { url: 'https://www.cambridge.org/core/journals/design-science/article/design-thinking-fast-and-slow-a-framework-for-kahnemans-dualsystem-theory-in-design/A200DC637BBDC982D288FC4F8A112DE7', type: 'academic', label: 'Cambridge Core (Design Science) — Kahneman の二重システム理論（システム1／システム2）の解説' },
      { url: 'https://link.springer.com/article/10.1007/s13164-019-00446-9', type: 'academic', label: 'Review of Philosophy and Psychology (Springer) — 行動経済学・神経経済学における二重過程理論の批判的レビュー' },
    ],
  },
  {
    id: 'bizlaw-retention-of-title',
    discipline: 'business-law',
    title: '所有権留保',
    statement:
      '所有権留保とは、動産売買（特に割賦販売・分割払い）において、買主が代金を完済するまで目的物の所有権を売主に留保しつつ、目的物の引渡し・使用は買主に認める、代金債権担保のための非典型担保（約定担保）である。買主が完済すれば所有権は買主に移転するが、代金支払を怠れば売主は留保所有権に基づき契約を解除して目的物を引き揚げ、未払代金の回収を図れる。' +
      '抵当権・質権のような典型担保と異なり民法に直接の規定はなく、譲渡担保と並び約一世紀にわたり判例・学説で規律されてきた。自動車の割賦販売や機械・商品の継続的供給取引で広く用いられる。割賦販売法7条は、指定商品の割賦販売につき、賦払金全部の支払義務が履行される時まで所有権が割賦販売業者に留保されたものと推定する。なお2025年5月成立の「譲渡担保契約及び所有権留保契約に関する法律」により所有権留保が明文化された。',
    keyFigures:
      '法的性質＝非典型担保（変則担保）かつ当事者の合意による約定担保／民法に直接規定なし・判例学説で規律（譲渡担保と並ぶ代表例）／機能＝代金完済まで所有権を売主に留保し代金債権を担保、不払い時は契約解除・引揚げで回収／割賦販売法7条「所有権に関する推定」／立法＝「譲渡担保契約及び所有権留保契約に関する法律」2025年5月30日成立・6月6日公布で明文化／典型担保（抵当権・質権・留置権・先取特権）とは別概念',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/336AC0000000159/', type: 'government', label: 'e-Gov法令検索「割賦販売法」（昭和36年法律第159号）— 第7条 所有権に関する推定' },
      { url: 'https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/honbun/houan/g21709043.htm', type: 'government', label: '衆議院「譲渡担保契約及び所有権留保契約に関する法律案」（2025年成立・所有権留保の明文化）' },
      { url: 'https://www.ritsumei.ac.jp/acd/cg/law/lex/21-1/003ikuma.pdf', type: 'academic', label: '立命館大学・生熊長幸「動産譲渡担保権・留保所有権の法的構成・優劣」（留保所有権＝非典型担保の法的構成）' },
      { url: 'https://kotobank.jp/word/所有権留保-80635', type: 'reference', label: 'コトバンク「所有権留保」（代金完済まで所有権を売主に留保する担保的特約）' },
    ],
  },
  {
    id: 'infosoc-attention-economy',
    discipline: 'information-sociology',
    title: 'アテンション・エコノミー（注意経済）',
    statement:
      'アテンション・エコノミー（注意経済）とは、情報が過剰に供給される社会において希少な資源は「情報」ではなく、それを受け取る人々の有限な「注意（アテンション）」であり、この注意をめぐって企業・メディア・プラットフォームが競争するという経済の捉え方である。' +
      '経済学者・心理学者ハーバート・サイモンが1971年に「情報の豊かさは注意の貧困を生む」と述べ、情報の消費は受け手の注意を消費するため、情報過多の中では注意の効率的配分が課題になると指摘したことが理論的源流とされる。後にゴールドハーバー（1997）がインターネット経済として論じ、ダベンポート＆ベック（2001）が経営論として展開した。無料サービスと引き換えに利用者の注意・時間を収益化するデジタル広告、エンゲージメント最大化を狙うSNSの依存的設計、クリックベイト、情報過多などと結びつき、近年は監視資本主義批判とも接続して論じられる。',
    keyFigures:
      'ハーバート・サイモン（Herbert A. Simon, 理論的源流・1971）／マイケル・ゴールドハーバー（Michael H. Goldhaber, 1997・ネット経済への適用）／トーマス・ダベンポート＆ジョン・ベック（Thomas H. Davenport & John C. Beck, 2001・経営論的展開）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Attention_economy', type: 'reference', label: 'Wikipedia「Attention economy」— サイモン1971を起点とし、ゴールドハーバー1997、ダベンポート＆ベック2001を整理' },
      { url: 'https://academic.oup.com/iwc/article/37/1/18/7733851', type: 'academic', label: 'Interacting with Computers (Oxford University Press), “Second Wave of Attention Economics”（査読学術誌）' },
      { url: 'https://www.nngroup.com/articles/attention-economy/', type: 'media', label: 'Nielsen Norman Group「The Attention Economy」— 注意を希少資源とする概念とサイモンの定式化の解説' },
      { url: 'https://islandora-dev.library.cmu.edu/node/45427', type: 'academic', label: 'Carnegie Mellon University Library — H. A. Simon “Designing Organizations for an Information-Rich World” (1971) 原典所蔵記録' },
    ],
  },
  {
    id: 'econ-heckscher-ohlin',
    discipline: 'economics',
    title: 'ヘクシャー＝オリーン理論',
    statement:
      'ヘクシャー＝オリーン理論（要素賦存比率理論）は、各国の比較優位が「生産要素の相対的賦存比率（労働・資本・土地などの相対的な豊富さ）」の違いによって決まると説く国際貿易の理論である。労働生産性の差で比較優位を説明したリカードと異なり、本理論は、国は自国に相対的に豊富な生産要素を集約的に用いる財に比較優位をもち、それを輸出し、相対的に希少な要素を集約的に用いる財を輸入すると主張する' +
      '（例：資本豊富国は資本集約財を輸出し、労働集約財を輸入する）。スウェーデンの経済学者エリ・ヘクシャーの1919年論文を出発点に、弟子ベルティル・オリーンが1933年の著書『Interregional and International Trade』で展開した。新古典派貿易理論（要素賦存アプローチ）の中核をなし、関連定理に要素価格均等化定理やストルパー＝サミュエルソン定理が、また理論と逆の実証結果としてレオンチェフの逆説がある。',
    keyFigures:
      'エリ・ヘクシャー（Eli Heckscher、1919年論文）／ベルティル・オリーン（Bertil Ohlin、1933年『Interregional and International Trade』、1977年ノーベル経済学賞をジェームズ・ミードと共同受賞）／ヴァシリー・レオンチェフ（Leontief paradox、1953年）／ポール・サミュエルソン（要素価格均等化・ストルパー＝サミュエルソン定理）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/Heckscher-Ohlin-theory', type: 'reference', label: 'Britannica Money — Heckscher-Ohlin theory（定義・例・レオンチェフの逆説）' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1977/summary/', type: 'government', label: 'NobelPrize.org — 1977年経済学賞（Ohlin・Meade 共同受賞、公式）' },
      { url: 'https://www.econlib.org/library/Enc/bios/Ohlin.html', type: 'reference', label: 'Econlib（The Concise Encyclopedia of Economics）— Bertil Ohlin 略伝と理論' },
      { url: 'https://en.wikipedia.org/wiki/Heckscher%E2%80%93Ohlin_model', type: 'reference', label: 'Wikipedia — Heckscher–Ohlin model（モデル概要・関連定理）' },
    ],
  },
  {
    id: 'bizlaw-corporate-governance-code',
    discipline: 'business-law',
    title: 'コーポレートガバナンス・コード',
    statement:
      'コーポレートガバナンス・コードとは、上場会社が実効的なコーポレートガバナンス（企業統治）を実現するために遵守・参照すべき主要な原則を取りまとめた規範（ソフトロー）である。日本では金融庁と東京証券取引所（JPX）が共同で策定し、2015年（平成27年）3月に最終案が公表され、同年6月1日に東証の有価証券上場規程の一部として適用が開始された（その後2018年・2021年に改訂）。' +
      'OECDコーポレートガバナンス原則を踏まえ、(1)株主の権利・平等性の確保、(2)株主以外のステークホルダーとの適切な協働、(3)適切な情報開示と透明性の確保、(4)取締役会等の責務、(5)株主との対話、という5つの基本原則を柱とする。法的拘束力ではなく「コンプライ・オア・エクスプレイン」を採用し、各社の事情に応じた自律的なガバナンス向上を促す点が最大の特徴である。機関投資家向けのスチュワードシップ・コード（2014）と「車の両輪」をなす。',
    keyFigures:
      '策定主体＝金融庁＋東京証券取引所(JPX)の共同策定／適用開始＝2015年6月1日（東証 有価証券上場規程の一部）／改訂＝2018年6月・2021年6月／法的性質＝ソフトロー（「コンプライ・オア・エクスプレイン」）／5つの基本原則＝株主の権利・平等性／ステークホルダーとの協働／情報開示と透明性／取締役会等の責務／株主との対話／関連＝スチュワードシップ・コード(2014)と車の両輪／会社法上の機関設計・内部統制（ハードロー）とは別概念',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jpx.co.jp/english/equities/listing/cg/', type: 'government', label: '日本取引所グループ(JPX/東証) — Corporate Governance Code' },
      { url: 'https://www.fsa.go.jp/en/refer/councils/corporategovernance/20150306-1/01.pdf', type: 'government', label: "金融庁 — Japan's Corporate Governance Code [Final Proposal] (2015-03)" },
      { url: 'https://www.fsa.go.jp/policy/corporategovernencereform/20240115.html', type: 'government', label: '金融庁 — コーポレートガバナンス改革に向けた取組みについて' },
      { url: 'https://iclg.com/practice-areas/corporate-governance-laws-and-regulations/japan', type: 'reference', label: 'ICLG — Corporate Governance Laws and Regulations: Japan 2025-2026' },
    ],
  },
  {
    id: 'human-broaden-and-build',
    discipline: 'human-science',
    title: '拡張—形成理論（フレドリクソン）',
    statement:
      'バーバラ・フレドリクソンが提唱した、ポジティブ感情の機能と進化的意義に関する理論（Review of General Psychology 1998／American Psychologist 2001）。恐怖や怒りなどのネガティブ感情が闘争・逃走のような狭い「特定の行動傾向」を喚起するのに対し、喜び・興味・満足・愛といったポジティブ感情は、その瞬間の「思考—行動レパートリー」を一時的に拡張（broaden）し、注意・認知・行動の幅を広げて探索・遊び・創造・つながりを促す。' +
      'この拡張された経験は、長期的にはレジリエンス・社会的絆・知識やスキルといった身体的・知的・社会的・心理的な永続的「個人資源（resources）」を持続的に形成・構築（build）する。すなわちポジティブ感情は即時の快だけでなく、将来に役立つ資源を築く適応的機能をもつとされ、「上方スパイラル（upward spiral）」とも関連づけられる。なお関連して提示されたポジティブ／ネガティブ比2.9013の主張は数学的根拠を欠くとして2013年に撤回された。',
    keyFigures:
      'バーバラ・フレドリクソン（Barbara L. Fredrickson）／拡張（broaden）＝思考—行動レパートリーの拡大／形成（build）＝永続的な個人資源の構築／2.9013比の主張は2013年に部分撤回',
    asOf: '2026-06',
    sources: [
      { url: 'https://psycnet.apa.org/doiLanding?doi=10.1037%2F0003-066X.56.3.218', type: 'academic', label: 'Fredrickson, B. L. (2001). The broaden-and-build theory of positive emotions. American Psychologist, 56(3), 218–226（APA PsycNet）' },
      { url: 'https://journals.sagepub.com/doi/abs/10.1037/1089-2680.2.3.300', type: 'academic', label: 'Fredrickson, B. L. (1998). What Good Are Positive Emotions? Review of General Psychology, 2(3), 300–319（SAGE Journals）' },
      { url: 'https://en.wikipedia.org/wiki/Broaden-and-build', type: 'reference', label: 'Broaden-and-build — Wikipedia（理論概要のリファレンス）' },
      { url: 'https://retractionwatch.com/2013/09/19/fredrickson-losada-positivity-ratio-paper-partially-withdrawn/', type: 'media', label: 'Fredrickson–Losada “positivity ratio” paper partially withdrawn — Retraction Watch（2.9013比の部分撤回）' },
    ],
  },
  {
    id: 'human-mindfulness',
    discipline: 'human-science',
    title: 'マインドフルネス（MBSR）',
    statement:
      'マインドフルネスとは、今この瞬間の経験に意図的に、評価・判断をせずに注意を向けることで生じる「気づき（awareness）」の状態、およびそれを養う瞑想実践を指す。' +
      '仏教の瞑想伝統（サティ＝念）に由来するが、これを宗教的文脈から切り離し世俗的・現代的に体系化したのがジョン・カバットジンであり、1979年にマサチューセッツ大学医学部で慢性疾患患者向けの通常8週間プログラム「マインドフルネス・ストレス低減法（MBSR）」を開発した。彼はマインドフルネスを「意図的に、今この瞬間に、価値判断をせず注意を向けることで現れる気づき」と定義した。MBSRをもとに、うつ病の再発予防に有効性が示されたマインドフルネス認知療法（MBCT）などが発展し、慢性疼痛・ストレス・不安・うつへの臨床応用や注意・感情調整・ウェルビーイングへの効果が研究されている（効果量や方法論をめぐる議論もある）。',
    keyFigures:
      'ジョン・カバットジン（Jon Kabat-Zinn、MBSR開発者・1979年UMass医学部）／ジンデル・シーガル、マーク・ウィリアムズ、ジョン・ティーズデール（Segal・Williams・Teasdale、MBCT開発者）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.apa.org/topics/mindfulness', type: 'academic', label: 'American Psychological Association (APA) — Mindfulness（学会の概説・MBSR/MBCT等の臨床応用）' },
      { url: 'https://www.mindful.org/jon-kabat-zinn-defining-mindfulness/', type: 'reference', label: 'Mindful — Jon Kabat-Zinn: Defining Mindfulness（カバットジンの定義・MBSR 1979・UMass）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/10965637/', type: 'academic', label: 'Teasdale et al. (2000), Prevention of relapse/recurrence in major depression by MBCT — PubMed（査読論文）' },
      { url: 'https://en.wikipedia.org/wiki/Mindfulness-based_stress_reduction', type: 'reference', label: 'Wikipedia — Mindfulness-based stress reduction（百科事典級リファレンス）' },
    ],
  },
  {
    id: 'infosoc-data-portability',
    discipline: 'information-sociology',
    title: 'データポータビリティの権利（GDPR20条）',
    statement:
      'データポータビリティの権利とは、EUの一般データ保護規則（GDPR、2018年5月25日適用）第20条が定めるデータ主体の権利であり、自らが管理者に提供した自己の個人データを「構造化され、一般的に使用され、機械可読な形式」で受け取り、妨げられることなく他の管理者へ移転させる権利をいう。技術的に可能な場合は、ある管理者から別の管理者へ個人データを直接移転させる権利も含む。' +
      '適用には、(1)処理が本人の同意または契約を法的根拠とすること、(2)処理が自動化された手段で行われることが要件となる。趣旨は、特定サービスへの利用者の囲い込み（ロックイン）を防ぎ、個人のデータに対するコントロールを強化することにあり、副次的にサービス間の移行・競争も促進する。対象は本人が提供したデータに限られ（推論・派生データは対象外）、アクセス権（15条）や消去権（17条）とは別個の権利である。',
    keyFigures:
      '根拠条文＝GDPR（規則2016/679）第20条／適用開始＝2018年5月25日／対象形式＝構造化・一般的使用・機械可読な形式／要件＝同意または契約が法的根拠＋自動化処理／技術的に可能な場合は管理者間で直接移転可／対象＝本人が提供したデータに限る／趣旨＝ロックイン防止・個人のコントロール強化（前文68）／アクセス権15条・消去権17条とは別個',
    asOf: '2026-06',
    sources: [
      { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:32016R0679', type: 'government', label: 'EUR-Lex — Regulation (EU) 2016/679 (GDPR) 第20条 原文（EU公式法令データベース）' },
      { url: 'https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-right-data-portability-under-regulation-2016679_en', type: 'government', label: 'European Data Protection Board — Guidelines on the right to data portability (WP242 rev.01)' },
      { url: 'https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en', type: 'government', label: 'European Commission — Data protection: Information for individuals' },
      { url: 'https://gdpr-info.eu/art-20-gdpr/', type: 'reference', label: 'GDPR-Info — Art. 20 GDPR Right to data portability（条文参照リファレンス）' },
    ],
  },
  {
    id: 'econ-solow-growth-model',
    discipline: 'economics',
    title: 'ソロー成長モデル',
    statement:
      'ソロー成長モデル（新古典派成長理論、Solow–Swan モデル）は、長期の経済成長を資本蓄積・労働人口成長・技術進歩の関係から説明する。ロバート・ソローが1956年の論文「A Contribution to the Theory of Economic Growth」（Quarterly Journal of Economics）で提示し、同年トレバー・スワンも独立に同型のモデルを発表した。生産関数は資本Kと労働Lを投入し、規模に関する収穫一定かつ各要素に収穫逓減を仮定する。資本の限界生産力が逓減するため、' +
      '貯蓄・投資による資本蓄積だけでは成長を維持できず、経済は一人当たり資本・産出が一定の「定常状態（steady state）」へ収束する。含意は、(1)貯蓄率上昇は定常状態の所得水準を引き上げるが長期成長率は高めない（水準効果であり成長率効果ではない）、(2)持続的な一人当たり成長は外生的技術進歩によってのみ可能、(3)資本が希少な貧困国が速く成長し追いつく「条件付き収束」。資本・労働で説明できない残差は「ソロー残差（全要素生産性TFP）」と呼ばれる。ソローは1987年にノーベル経済学賞を受賞した。',
    keyFigures:
      'ロバート・ソロー（Robert M. Solow, 1924–2023, MIT, 1987年ノーベル経済学賞）／トレバー・スワン（Trevor W. Swan, 1956年に独立提示）／キー概念＝定常状態・条件付き収束・ソロー残差（TFP）・外生的技術進歩',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1987/press-release/', type: 'government', label: 'NobelPrize.org — Sveriges Riksbank Prize in Economic Sciences 1987 (Robert M. Solow) 公式プレスリリース' },
      { url: 'https://www.britannica.com/money/Robert-Solow', type: 'reference', label: 'Encyclopædia Britannica — Robert Solow: Biography, Nobel Prize, & Facts' },
      { url: 'https://faculty.sites.iastate.edu/tesfatsi/archive/tesfatsi/solowmod.pdf', type: 'academic', label: 'Iowa State University (L. Tesfatsion) — The Basic Solow-Swan Descriptive Growth Model（講義ノート）' },
      { url: 'https://en.wikipedia.org/wiki/Solow_residual', type: 'reference', label: 'Wikipedia — Solow residual（ソロー残差／TFP、Solow 1957 の定義）' },
    ],
  },
  {
    id: 'mgmt-effectuation',
    discipline: 'management',
    title: 'エフェクチュエーション',
    statement:
      'エフェクチュエーション（Effectuation）は、サラス・サラスバシー（ヴァージニア大学ダーデン経営大学院）が熟達した連続起業家の意思決定を実証研究して見出した、高不確実性下の起業家的思考様式・論理であり、2001年の論文「Causation and Effectuation」（Academy of Management Review）で提示された。' +
      'あらかじめ定めた目的に最適な手段を選ぶ「コーゼーション（予測の論理）」と対比され、予測できない未来はコントロールで対処できるという前提に立つ「コントロールの論理」をとる。手元の手段（自分は誰か・何を知るか・誰を知るか）から出発し目的を創発させる。5原則は、手中の鳥・許容可能な損失・クレイジーキルト・レモネード・飛行機のパイロットであり、リーン・スタートアップとも親和的である。',
    keyFigures:
      'サラス・D・サラスバシー（Saras D. Sarasvathy、ヴァージニア大学ダーデン経営大学院、2001 Academy of Management Review）／対比概念＝コーゼーション（予測の論理）／5原則＝手中の鳥・許容可能な損失・クレイジーキルト・レモネード・飛行機のパイロット',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.aom.org/doi/10.5465/amr.2001.4378020', type: 'academic', label: 'Sarasvathy, S. D. (2001) “Causation and Effectuation,” Academy of Management Review 26(2): 243-263（査読学術誌・原典）' },
      { url: 'https://www.darden.virginia.edu/effectuation', type: 'academic', label: 'University of Virginia, Darden School of Business — Effectuation Overview（提唱者所属大学の公式解説）' },
      { url: 'https://effectuation.org/the-five-principles-of-effectuation-detail', type: 'reference', label: 'Effectuation.org — The Five Principles of Effectuation（5原則の一次的リファレンス）' },
      { url: 'https://en.wikipedia.org/wiki/Saras_Sarasvathy', type: 'reference', label: 'Wikipedia — Saras Sarasvathy（経歴・研究背景）' },
    ],
  },
  {
    id: 'human-emotional-labor',
    discipline: 'human-science',
    title: '感情労働（ホックシールド）',
    statement:
      '感情労働とは、職務の一環として賃金と引き換えに自分の感情を管理・調整し、組織が求める適切な感情表現（公的に観察可能な表情・身体的表出）を作り出すことが要求される労働を指す。社会学者アーリー・R・ホックシールドが1983年の著書『管理される心（The Managed Heart）』で提唱し、肉体労働・頭脳労働と並ぶ第三の労働形態として論じた。' +
      '常に笑顔で接する客室乗務員、あえて威圧的に振る舞う集金人を代表例とする。感情管理には、内心を変えず外見的表現のみ取り繕う「表層演技（surface acting）」と、求められる感情を実際に内面へ呼び起こす「深層演技（deep acting）」がある。本心と表出すべき感情のズレ（感情的不協和）はストレス・バーンアウト・自己疎外を生みうる。サービス経済化に伴い看護・介護・接客・コールセンター等で重要性が増している。',
    keyFigures:
      'アーリー・ラッセル・ホックシールド（Arlie Russell Hochschild、カリフォルニア大学バークレー校 社会学）／『The Managed Heart』(1983)／表層演技・深層演技／帰結＝感情的不協和・バーンアウト・自己疎外',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ucpress.edu/books/the-managed-heart/paper', type: 'academic', label: 'University of California Press — The Managed Heart (原著出版社の書誌情報)' },
      { url: 'https://en.wikipedia.org/wiki/The_Managed_Heart', type: 'reference', label: 'Wikipedia — The Managed Heart（表層演技・深層演技・客室乗務員/集金人事例）' },
      { url: 'https://greatergood.berkeley.edu/article/item/what_is_emotional_labor_and_why_does_it_matter', type: 'academic', label: 'Greater Good Science Center, UC Berkeley — What Is Emotional Labor' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7078559/', type: 'academic', label: 'PMC査読論文 — 感情労働・バーンアウト・離職意図（看護職、感情的不協和の帰結）' },
    ],
  },
  {
    id: 'human-burnout',
    discipline: 'human-science',
    title: 'バーンアウト（燃え尽き症候群）',
    statement:
      'バーンアウト（燃え尽き症候群）とは、適切に管理されなかった慢性的な職場ストレスから生じる心身の消耗状態を指す症候群である。臨床心理学者ハーバート・フロイデンバーガーが1974年に対人援助職スタッフの消耗を「staff burn-out」として記述し用語を広め、社会心理学者クリスティーナ・マスラックが測定尺度マスラック・バーンアウト・インベントリ（MBI）を開発して体系化した。' +
      'マスラックはバーンアウトを3次元で捉える：情緒的消耗感（emotional exhaustion）、脱人格化／シニシズム（depersonalization／cynicism、対象者への冷淡・無関心な態度）、個人的達成感の低下（reduced personal accomplishment）である。世界保健機関（WHO）はICD-11において、これを医学的疾患ではなく「健康状態に影響を及ぼす職業現象（occupational phenomenon）」と位置づけた。看護・教育・対人援助職に多い。',
    keyFigures:
      'ハーバート・フロイデンバーガー（Herbert Freudenberger、1974年に用語を提唱）／クリスティーナ・マスラック（Christina Maslach、MBIを開発）／3次元＝情緒的消耗感・脱人格化・個人的達成感の低下／WHO ICD-11で職業現象と位置づけ',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.who.int/news/item/28-05-2019-burn-out-an-occupational-phenomenon-international-classification-of-diseases', type: 'government', label: 'WHO「Burn-out an occupational phenomenon: ICD-11」（2019年改訂のICD-11におけるバーンアウト定義・3次元）' },
      { url: 'https://spssi.onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-4560.1974.tb00706.x', type: 'academic', label: 'Freudenberger H. J. (1974) “Staff Burn-Out”, Journal of Social Issues（用語の起源、査読誌・Wiley）' },
      { url: 'https://www.apa.org/members/content/burnout-research', type: 'reference', label: 'American Psychological Association「Christina Maslach: The pioneer behind burnout research」（MBIと3次元の体系化）' },
      { url: 'https://en.wikipedia.org/wiki/Maslach_Burnout_Inventory', type: 'reference', label: 'Wikipedia「Maslach Burnout Inventory」（情緒的消耗感・脱人格化・個人的達成感の低下）' },
    ],
  },
  {
    id: 'bizlaw-secrecy-of-communications',
    discipline: 'business-law',
    title: '通信の秘密（憲法21条2項）',
    statement:
      '通信の秘密とは、手紙・電話・電子メール等の通信について、その内容のみならず、通信当事者・宛先・通信回数・日時など通信の存在事実（構成要素）が、公権力や第三者によって侵害されないことを保障する基本的人権である。' +
      '日本国憲法21条2項後段は「通信の秘密は、これを侵してはならない」と定め、検閲の禁止（前段）と並んで表現の自由・プライバシーを支える。これを具体化する電気通信事業法4条1項は「電気通信事業者の取扱中に係る通信の秘密は、侵してはならない」と規定し、同法179条は侵害行為を処罰する。侵害行為は知得・窃用・漏えいの3類型に整理され、犯罪捜査のための通信傍受など法律・令状に基づく例外が限定的に認められる。',
    keyFigures:
      '憲法21条2項後段＝通信の秘密は侵してはならない（検閲禁止と並列）／電気通信事業法4条1項＝電気通信事業者の取扱中に係る通信の秘密の不可侵／保護対象＝通信の内容＋構成要素（当事者・宛先・回数・日時・存在事実）／侵害の3類型＝知得・窃用・漏えい／電気通信事業法179条で処罰／信書は郵便法でも保護／例外＝通信傍受法等の法律・令状に基づく限定的措置',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/th_faq.html', type: 'government', label: '総務省 電気通信消費者情報コーナー「通信の秘密（電気通信事業法第4条）FAQ」' },
      { url: 'https://laws.e-gov.go.jp/law/359AC0000000086/', type: 'government', label: 'e-Gov法令検索「電気通信事業法」（law id 359AC0000000086、第4条・第179条）' },
      { url: 'https://laws.e-gov.go.jp/law/321CONSTITUTION', type: 'government', label: 'e-Gov法令検索「日本国憲法」（law id 321CONSTITUTION、第21条）' },
      { url: 'https://ja.wikipedia.org/wiki/日本国憲法第21条', type: 'reference', label: 'ウィキペディア「日本国憲法第21条」' },
    ],
  },
  {
    id: 'infosoc-digital-markets-act',
    discipline: 'information-sociology',
    title: 'デジタル市場法（DMA）',
    statement:
      'デジタル市場法（DMA、規則(EU)2022/1925）は、EUがデジタル分野の大規模プラットフォームによる市場支配や不公正な慣行に対処し、公正で開かれた競争可能な市場を確保するために制定した事前規制（ex ante regulation）である。2022年9月に採択、2022年11月発効、2023年5月2日に適用開始した。検索エンジン・SNS・メッセージング・OS・ブラウザ・オンライン仲介・動画共有・広告等の「中核的プラットフォームサービス」を提供し、' +
      '売上高・利用者数・市場における強固で持続的な地位といった要件を満たす大手事業者を「ゲートキーパー」に指定し、一連の「すべきこと」「してはならないこと」の義務を課す。例として自社優遇の禁止、相互運用性の確保、取得データの利用制限、アプリのアンインストールや既定変更の自由、サイドローディングの許容がある。違反には全世界売上高の最大10％（反復違反は20％）の制裁金が科されうる。事後執行の従来型競争法を補完する点が特徴で、GDPRやDSAとは目的を異にする別の法である。',
    keyFigures:
      '法令番号＝規則(EU)2022/1925／採択2022年9月・発効2022年11月・適用開始2023年5月2日・義務本格遵守2024年3月7日／初回ゲートキーパー指定＝2023年9月（Alphabet・Amazon・Apple・ByteDance・Meta・Microsoftの6社）／主な義務＝自社優遇の禁止・相互運用性・取得データの利用制限・アンインストール/既定変更の自由・サイドローディング許容／制裁金＝全世界売上高の最大10％（反復違反は最大20％）／執行主体＝欧州委員会',
    asOf: '2026-06',
    sources: [
      { url: 'https://eur-lex.europa.eu/eli/reg/2022/1925/oj/eng', type: 'government', label: 'Regulation (EU) 2022/1925 (Digital Markets Act) — EUR-Lex, Official Journal' },
      { url: 'https://digital-markets-act.ec.europa.eu/about-dma_en', type: 'government', label: 'About the Digital Markets Act — European Commission' },
      { url: 'https://www.consilium.europa.eu/en/policies/digital-markets-act/', type: 'government', label: 'Digital Markets Act — Council of the European Union' },
      { url: 'https://www.europarl.europa.eu/news/en/press-room/20220315IPR25504/deal-on-digital-markets-act-ensuring-fair-competition-and-more-choice-for-users', type: 'government', label: 'Deal on Digital Markets Act — European Parliament' },
    ],
  },
  {
    id: 'econ-lewis-turning-point',
    discipline: 'economics',
    title: 'ルイスの二重経済モデル（転換点）',
    statement:
      'ルイスの二重経済モデルは、発展途上国の経済を伝統的な「生存（農村・自給）部門」と近代的な「資本主義（都市・工業）部門」の二重構造として捉える開発経済学のモデルで、W・アーサー・ルイスが1954年の論文「Economic Development with Unlimited Supplies of Labour」で示した。生存部門には限界生産力がほぼゼロの余剰労働が大量に存在し、資本主義部門は生存水準をわずかに上回る一定賃金でこれを無制限に雇用し、利潤を再投資して拡大、農村の余剰労働を吸収していく。' +
      'ルイスの転換点とは、この余剰労働が吸収され尽くし、さらに労働を引き出すには賃金を上げざるを得なくなる転換点を指す。以後、労働は無制限供給ではなくなり賃金が上昇し始める。中国経済が転換点に達したかをめぐる議論などで現代的に参照される。ルイスは開発経済学への貢献により1979年にセオドア・シュルツと共にノーベル経済学賞を受賞した。',
    keyFigures:
      'W・アーサー・ルイス（W. Arthur Lewis, 1915–1991, 1954年論文・1979年ノーベル経済学賞）／セオドア・W・シュルツ（1979年共同受賞）／蔡昉（Cai Fang, 中国の転換点論）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1979/press-release/', type: 'government', label: 'NobelPrize.org — The Prize in Economics 1979 (Schultz・Lewis, 授賞理由)' },
      { url: 'https://www.humanities.manchester.ac.uk/economics/about/history-and-heritage/arthur-lewis/', type: 'academic', label: 'University of Manchester — Arthur Lewis biography（1954年論文 The Manchester School）' },
      { url: 'https://en.wikipedia.org/wiki/Dual-sector_model', type: 'reference', label: 'Wikipedia — Dual-sector model（モデル構造・余剰労働・無制限供給）' },
      { url: 'https://en.wikipedia.org/wiki/Lewis_turning_point', type: 'reference', label: 'Wikipedia — Lewis turning point（転換点の定義・中国の議論）' },
    ],
  },
  {
    id: 'mgmt-business-model-canvas',
    discipline: 'management',
    title: 'ビジネスモデル・キャンバス',
    statement:
      'ビジネスモデル・キャンバス（Business Model Canvas, BMC）は、企業が価値をどのように創造・提供・獲得するかというビジネスモデルを、9つの構成要素から成る1枚の図に可視化し、設計・分析・議論するための戦略フレームワークである。アレックス・オスターワルダーとイヴ・ピニュールが、オスターワルダーのローザンヌ大学博士論文（2004年「ビジネスモデル・オントロジー」）を基に開発し、2010年の共著『Business Model Generation』で普及させた。' +
      '9要素は、顧客セグメント／価値提案／チャネル／顧客との関係／収益の流れ／主要リソース／主要活動／主要パートナー／コスト構造。中央に価値提案を置き、右側に顧客・市場、左側に基盤・社内の効率、下部に財務（収益とコスト）を配置する。事業の全体像の俯瞰、仮説検証やピボット、関係者間の共通言語として用いられ、後に顧客視点を深掘りするバリュー・プロポジション・キャンバスも開発された。',
    keyFigures:
      'アレックス・オスターワルダー（Alexander Osterwalder）／イヴ・ピニュール（Yves Pigneur）／ローザンヌ大学博士論文 2004「The Business Model Ontology」／書籍『Business Model Generation』Wiley 2010／9 building blocks',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Business_model_canvas', type: 'reference', label: 'Wikipedia — Business model canvas（9要素と図の構成・成立経緯）' },
      { url: 'https://link.springer.com/article/10.1007/s12525-014-0176-4', type: 'academic', label: 'Electronic Markets (Springer), 2014 — Osterwalderインタビュー（査読誌・博士研究と普及の経緯）' },
      { url: 'https://www.wiley.com/en-us/Business+Model+Generation:+A+Handbook+for+Visionaries,+Game+Changers,+and+Challengers-p-9780470876411', type: 'reference', label: 'Wiley（出版社）— 原典書籍 Business Model Generation, 2010' },
      { url: 'https://www.imd.org/blog/strategy/business-model-canvas/', type: 'academic', label: 'IMD（経営大学院）— Business Model Canvas 解説（9要素とレイアウト）' },
    ],
  },
  {
    id: 'human-inclusive-fitness',
    discipline: 'human-science',
    title: '包括適応度と血縁選択（ハミルトン則）',
    statement:
      '包括適応度とは、ある個体の適応度を、自身が残す子の数（直接適応度）だけでなく、遺伝子を共有する血縁個体の繁殖成功に及ぼす自分の行動の効果（間接適応度）も含めて評価する概念である。進化生物学者W・D・ハミルトンが1964年の論文「The Genetical Evolution of Social Behaviour」（Journal of Theoretical Biology誌）で定式化した。' +
      'これにより、自らの繁殖を犠牲にして血縁を助ける利他行動（真社会性昆虫のワーカー、警戒声など）が、共有遺伝子のコピーを次世代に多く残すことで進化しうる「血縁選択」を説明できる。中心的不等式がハミルトン則 rB > C で、血縁度r・受益者の利益B・行為者のコストCを満たすとき利他形質が選択される。J・B・S・ホールデンの「兄弟2人かいとこ8人のためなら命を投げ出す」という逸話的表現とも結びつく。',
    keyFigures:
      'W・D・ハミルトン（William D. Hamilton, 1964年の論文で包括適応度・血縁選択・ハミルトン則 rB>C を定式化）／J・B・S・ホールデン（J.B.S. Haldane, 血縁度に基づく自己犠牲の逸話で知られる先駆的着想）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/Hamiltons-rule', type: 'reference', label: 'Encyclopaedia Britannica — Hamilton’s Rule（rB>Cと各項の定義）' },
      { url: 'https://evolution.berkeley.edu/glossary/hamiltons-rule/', type: 'academic', label: 'University of California Berkeley — Understanding Evolution: Hamilton’s rule（大学運営の教育リソース）' },
      { url: 'https://en.wikipedia.org/wiki/The_Genetical_Evolution_of_Social_Behaviour', type: 'reference', label: 'Wikipedia — The Genetical Evolution of Social Behaviour（1964年論文の書誌：J. Theor. Biol. 7, 1–16 / 17–52）' },
      { url: 'https://en.wikipedia.org/wiki/Kin_selection', type: 'reference', label: 'Wikipedia — Kin selection（血縁選択とホールデンの逸話・血縁度の数値）' },
    ],
  },
  {
    id: 'human-mirror-neurons',
    discipline: 'human-science',
    title: 'ミラーニューロン',
    statement:
      'ミラーニューロンとは、自分がある行為（物をつかむ等）を実行するときと、他者が同じ／類似の行為を行うのを観察するときの両方で発火する神経細胞である。1990年代初頭、イタリア・パルマ大学のジャコモ・リゾラッティらがマカクザルの腹側運動前野F5野の単一ニューロン記録で発見し（初報1992年）、後に下頭頂葉でも見出された。' +
      '観察された行為が観察者自身の運動表象に「鏡のように」対応づけられることから命名された。ヒトでも下前頭回・腹側運動前野・下頭頂葉などにミラー特性をもつ「ミラーニューロンシステム」があると考えられ、証拠は主に脳機能イメージング（fMRI等）に基づく（単一細胞の直接記録は2010年のMukamel・Friedらの例など限定的）。行為理解・模倣・意図読み取り・共感・言語進化との関連や自閉症の「broken mirror仮説」が提唱される一方、その機能的役割や過大評価をめぐる批判（Hickok ら）もある。',
    keyFigures:
      'ジャコモ・リゾラッティ（Giacomo Rizzolatti, パルマ大学／F5野ミラーニューロン発見）／共同研究者 di Pellegrino・Fadiga・Fogassi・Gallese（1992年初報）／Mukamel・Fried（2010年, ヒト単一ニューロン直接記録）／Gregory Hickok（過大評価批判）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.apa.org/monitor/oct05/mirror', type: 'reference', label: 'American Psychological Association (APA) — “The mind’s mirror”（リゾラッティらによるF5野での発見の解説）' },
      { url: 'http://www.scholarpedia.org/article/Mirror_neurons', type: 'reference', label: 'Scholarpedia — “Mirror neurons”（査読付き百科事典；定義・解剖学的分布）' },
      { url: 'https://www.jneurosci.org/content/29/32/10153', type: 'academic', label: 'Journal of Neuroscience — “Evidence of Mirror Neurons in Human Inferior Frontal Gyrus”（ヒトMNS, fMRI適応法・査読論文）' },
      { url: 'https://www.cell.com/current-biology/fulltext/S0960-9822(10)00327-1', type: 'academic', label: 'Current Biology (Cell Press) — Mukamel, Fried et al.「Single-Neuron Responses in Humans」（ヒト単一細胞直接記録・査読論文）' },
    ],
  },
  {
    id: 'bizlaw-trade-secret',
    discipline: 'business-law',
    title: '営業秘密（不正競争防止法2条6項）',
    statement:
      '営業秘密とは、不正競争防止法によって保護される、事業活動に有用な技術上または営業上の情報をいう。同法2条6項は営業秘密を「秘密として管理されている生産方法、販売方法その他の事業活動に有用な技術上又は営業上の情報であって、公然と知られていないもの」と定義し、保護を受けるには(1)秘密管理性（アクセス制限・秘密表示等で秘密管理意思が客観的に認識できること）、(2)有用性（設計図・顧客名簿等、事業活動に有用な情報。脱税情報等の反社会的なものは除く）、(3)非公知性（公然と知られていないこと）の3要件をすべて満たす必要がある。' +
      '不正取得・使用・開示等は不正競争（2条1項4号〜10号）に該当し差止・損害賠償の対象となり、悪質な侵害には営業秘密侵害罪として刑事罰も科される。特許と異なり登録不要で存続期間の定めはなく、秘密である限り保護される一方、公開されると保護を失う。なお2018年改正でビッグデータ等の利活用に対応した「限定提供データ」の保護も新設された。',
    keyFigures:
      '定義条文＝不正競争防止法2条6項／3要件＝秘密管理性・有用性・非公知性／侵害行為＝2条1項4号〜10号（不正競争）／民事救済＝差止請求・損害賠償／刑事＝営業秘密侵害罪／特徴＝登録不要・存続期間の定めなし・公開で保護喪失／2018年改正で「限定提供データ」保護を新設（e-Gov law id 405AC0000000047）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/405AC0000000047', type: 'government', label: 'e-Gov法令検索 不正競争防止法（平成5年法律第47号、法令ID 405AC0000000047）' },
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/trade-secret.html', type: 'government', label: '経済産業省「営業秘密～営業秘密を守り活用する～」' },
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/pdf/Chikujo.pdf', type: 'government', label: '経済産業省「逐条解説 不正競争防止法」' },
    ],
  },
  {
    id: 'infosoc-eu-ai-act',
    discipline: 'information-sociology',
    title: 'EU AI規制法（AI Act）',
    statement:
      'EU AI規制法（AI Act、規則(EU)2024/1689）は、人工知能システムを包括的に規律する世界初の本格的なAI規制であり、EUが制定した。2024年6月13日に採択、官報公布は同年7月12日、発効は8月1日で、規定は段階的に適用される。' +
      '最大の特徴はリスクベース・アプローチで、AIを「許容できないリスク（原則禁止＝社会的スコアリング、サブリミナル操作等）」「高リスク（医療・採用・与信・重要インフラ・法執行等。適合性評価や人間による監視等の厳格な義務）」「限定的リスク（チャットボット等。透明性義務）」「最小リスク（大半。原則自由）」の4段階に分類して規律する。汎用AI（GPAI）モデルには別途、透明性・著作権・システミックリスク対応の義務が課される。違反には全世界売上高に基づく高額の制裁金が科されうる。',
    keyFigures:
      '規則(EU)2024/1689／採択2024年6月13日・官報公布2024年7月12日・発効2024年8月1日／禁止規定の適用2025年2月／GPAIモデル規律の適用2025年8月／高リスクAI主要規定の適用2026年8月／リスク4段階（許容できない／高／限定的／最小）／禁止規定違反の制裁金は最大3,500万ユーロまたは全世界売上高の7%／世界初の包括的AI規制',
    asOf: '2026-06',
    sources: [
      { url: 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai', type: 'government', label: "欧州委員会「AI Act｜Shaping Europe's digital future」（規制枠組み・適用日）" },
      { url: 'https://www.europarl.europa.eu/topics/en/article/20230601STO93804/eu-ai-act-first-regulation-on-artificial-intelligence', type: 'government', label: '欧州議会「EU AI Act: first regulation on artificial intelligence」（リスク4分類・世界初）' },
      { url: 'https://en.wikipedia.org/wiki/Artificial_Intelligence_Act', type: 'reference', label: 'Wikipedia「Artificial Intelligence Act」（規則番号・公布/発効日・条文構成）' },
      { url: 'https://www.cambridge.org/core/journals/international-legal-materials/article/regulation-20241689-of-the-eur-parl-council-of-june-13-2024-eu-artificial-intelligence-act/64F1F6734F8C66CA3EEA149C9759194E', type: 'academic', label: 'Cambridge Core / International Legal Materials「Regulation 2024/1689 of June 13, 2024」' },
    ],
  },
  {
    id: 'econ-ultimatum-game',
    discipline: 'economics',
    title: '最後通牒ゲーム',
    statement:
      '2人で固定額（例: 1000円）の分配を決める一回限りの実験ゲーム。「提案者」が分け方を提示し、「応答者」は受諾（提案どおり分配）か拒否（両者ゼロ）を選ぶ。利己的合理性を前提とする標準理論（サブゲーム完全均衡）では、応答者はわずかでも得る方が得なので最小額でも受諾し、提案者はほぼ全額を取る最小提示をするはずである。' +
      'しかしGüth・Schmittberger・Schwarze(1982)の実験以来、提案者は平均で4〜5割の比較的公平な分配を提案し、応答者は約2〜3割未満の不公平な低額提案を自らの利得を犠牲にして拒否することが繰り返し観察された。これは公平性・互恵性への選好（社会的選好）と不公平への利他的懲罰を示し、標準的経済学への重要な反証となった。応答者が拒否できない独裁者ゲームとの対比で動機が検討される。',
    keyFigures:
      'ヴェルナー・ギュート（Werner Güth、1982年に共著で最初の実験を実施）／Rolf Schmittberger・Bernd Schwarze／関連研究: Ernst Fehr・Colin Camerer・Joseph Henrich ら（社会的選好・文化差）',
    asOf: '2026-06',
    sources: [
      { url: 'https://ideas.repec.org/a/eee/jeborg/v3y1982i4p367-388.html', type: 'academic', label: 'Güth, Schmittberger & Schwarze (1982) “An Experimental Analysis of Ultimatum Bargaining”, J. of Economic Behavior & Organization 3(4):367-388 (IDEAS/RePEc 原典書誌)' },
      { url: 'https://en.wikipedia.org/wiki/Ultimatum_game', type: 'reference', label: 'Wikipedia: Ultimatum game（ゲーム定義・SPNE予測・経験的乖離の概説）' },
      { url: 'https://www.sciencedirect.com/topics/neuroscience/ultimatum-game', type: 'academic', label: 'ScienceDirect Topics: Ultimatum Game（提案・拒否率と公平性解釈の学術概説）' },
      { url: 'https://econweb.ucsd.edu/~jandreon/Publications/ExEc%202006.pdf', type: 'academic', label: 'UC San Diego (Andreoni et al.): subgame perfection と公平性を分離する実験' },
    ],
  },
  {
    id: 'mgmt-theory-of-constraints',
    discipline: 'management',
    title: '制約理論（TOC）',
    statement:
      'システム全体の成果は、ごく少数の「制約（ボトルネック）」によって決定されるとし、その制約に集中して管理・改善することで全体最適を図るマネジメント手法。物理学者で経営コンサルタントのエリヤフ・ゴールドラットが1984年の小説『ザ・ゴール』で提示・普及させた。鎖が最も弱い環で決まるように、システムのスループット（販売を通じて金を生み出す速度）は制約工程に律速される。' +
      '中心は「集中の5ステップ」：(1)制約を特定し、(2)徹底活用し、(3)他のすべてを制約に従属させ、(4)制約能力を高め、(5)解消後は惰性に陥らず次の制約へ戻り繰り返す。会計面では伝統的原価計算に代えスループット・在庫・業務費用を重視するスループット会計を用い、生産では「ドラム・バッファ・ロープ」、プロジェクトでは「クリティカルチェーン」を含む。',
    keyFigures:
      'エリヤフ・ゴールドラット（Eliyahu M. Goldratt, 1947–2011, 物理学者・経営コンサルタント）／『ザ・ゴール（The Goal）』(1984)／集中の5ステップ・スループット会計・ドラムバッファロープ・クリティカルチェーン',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Theory_of_constraints', type: 'reference', label: 'Wikipedia: Theory of constraints（五ステップ・スループット会計・DBR）' },
      { url: 'https://en.wikipedia.org/wiki/Eliyahu_M._Goldratt', type: 'reference', label: 'Wikipedia: Eliyahu M. Goldratt（提唱者・略歴・TOC派生手法）' },
      { url: 'https://www.leanproduction.com/theory-of-constraints/', type: 'media', label: 'LeanProduction: Theory of Constraints（5 Focusing Steps / POOGI 解説）' },
      { url: 'https://www.tocinstitute.org/five-focusing-steps.html', type: 'reference', label: 'Theory of Constraints Institute: Five Focusing Steps' },
    ],
  },
  {
    id: 'human-moral-foundations',
    discipline: 'human-science',
    title: '道徳基盤理論（ハイト）',
    statement:
      '道徳基盤理論（MFT）は、人間の道徳的判断が複数の生得的・進化的な直観の基盤に支えられるとする道徳心理学の理論で、ジョナサン・ハイト、ジェシー・グレアム、クレイグ・ジョセフらが提唱した。道徳はまず速い情動的直観によって駆動され、推論は多くの場合その後づけの正当化だとする（社会的直観モデル）。' +
      '当初の主要5基盤は、ケア／危害、公正／欺瞞、忠誠／背信、権威／転覆、神聖／堕落であり、のちに自由／抑圧が加えられた。政治的リベラルは主にケアと公正を重視するのに対し、保守は5〜6基盤をより均等に重視する傾向があり、これが政治的・道徳的対立を説明する。測定には道徳基盤質問紙（MFQ）が用いられる。',
    keyFigures:
      'ジョナサン・ハイト（Jonathan Haidt）／ジェシー・グレアム（Jesse Graham）／クレイグ・ジョセフ（Craig Joseph）／5＋1基盤（ケア・公正・忠誠・権威・神聖＋自由）／測定＝道徳基盤質問紙（MFQ）',
    asOf: '2026-06',
    sources: [
      { url: 'https://moralfoundations.org/', type: 'academic', label: 'MoralFoundations.org — 理論提唱者らによる公式解説サイト（5＋1基盤・MFQ）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/21244182/', type: 'academic', label: 'Graham et al. (2011) “Mapping the Moral Domain”, J. Personality and Social Psychology 101:366-385（査読論文・MFQ・リベラル/保守の差）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/11699120/', type: 'academic', label: 'Haidt (2001) “The emotional dog and its rational tail”, Psychological Review（社会的直観モデルの基礎論文）' },
      { url: 'https://en.wikipedia.org/wiki/Moral_foundations_theory', type: 'reference', label: 'Wikipedia「Moral foundations theory」（百科事典級の概観・6基盤）' },
    ],
  },
  {
    id: 'human-dunbars-number',
    discipline: 'human-science',
    title: 'ダンバー数（社会脳仮説）',
    statement:
      'ダンバー数とは、一人の人間が安定した社会的関係（相手が誰かを知り、各人が互いにどう関係するかを把握している関係）を維持できる人数の認知的上限で、およそ150人とされる。イギリスの人類学者・進化心理学者ロビン・ダンバーが1990年代に提唱した。霊長類では種ごとの平均集団サイズが大脳新皮質の相対的大きさ（新皮質比）と相関するという発見（社会脳仮説＝大きな脳は複雑な社会関係を処理するために進化したとする説）に基づき、' +
      'ヒトの新皮質サイズから予測される集団規模を約150と外挿した（Dunbar 1992, J. Hum. Evol.）。狩猟採集集団・村落・軍隊単位・企業の部門などの歴史的・民族誌的データでも約150が繰り返し現れると論じた。150は近似値で、親密さに応じ約5人・15人・50人・150人・500人…と約3倍ずつ広がる同心円状の階層があるとされる。SNS上の友人関係への適用も議論される一方、推定の方法論や数値の確かさには批判・論争もある。',
    keyFigures:
      'ロビン・ダンバー（Robin I. M. Dunbar、英国の人類学者・進化心理学者、ダンバー数と社会脳仮説の提唱者）／Dunbar 1992, Journal of Human Evolution／階層構造（約5・15・50・150・500人）',
    asOf: '2026-06',
    sources: [
      { url: 'https://ui.adsabs.harvard.edu/abs/1992JHumE..22..469D/abstract', type: 'academic', label: 'Dunbar, R. I. M. (1992) Neocortex size as a constraint on group size in primates. Journal of Human Evolution 22:469-493（一次査読論文、NASA ADS）' },
      { url: 'https://royalsocietypublishing.org/doi/10.1098/rsbl.2021.0158', type: 'academic', label: "Lindenfors et al. (2021) “Dunbar's number deconstructed”. Biology Letters（英国王立協会・査読論文、批判的検証）" },
      { url: 'https://en.wikipedia.org/wiki/Dunbar%27s_number', type: 'reference', label: "Wikipedia: Dunbar's number（定義・階層構造・論争の概観）" },
      { url: 'https://www.scientificamerican.com/article/social-network-size-linked-brain-size/', type: 'media', label: 'Scientific American: Social Network Size Linked to Brain Size（社会脳仮説の解説）' },
    ],
  },
  {
    id: 'bizlaw-cooling-off',
    discipline: 'business-law',
    title: 'クーリング・オフ（特定商取引法）',
    statement:
      'クーリング・オフとは、訪問販売・電話勧誘販売など不意打ち的な取引で契約した消費者が、一定期間内であれば理由を問わず無条件で、書面または電磁的記録による通知で契約を一方的に解除できる制度である。頭を冷やして契約を再考する機会を消費者に与え、不本意な契約から保護する趣旨で、特定商取引法（昭和51年法律第57号）に定められる。' +
      '取引類型ごとに期間が異なり、訪問販売・電話勧誘販売・特定継続的役務提供・訪問購入は8日間、連鎖販売取引・業務提供誘引販売取引は20日間で、原則として法定書面（申込書面・契約書面）を受け取った日から起算する。2022年6月施行の改正で電子メール等の電磁的方法による通知も可能となった。解除すれば支払済代金は返還され、引取り費用は事業者負担で、損害賠償・違約金を請求されない。自ら申し込む通信販売は対象外である。',
    keyFigures:
      '訪問販売・電話勧誘販売・特定継続的役務提供（エステ／語学教室／学習塾等）・訪問購入＝8日間／連鎖販売取引（マルチ商法）・業務提供誘引販売取引（内職商法）＝20日間／起算点＝法定書面の受領日／2022年6月1日施行で電磁的記録による通知が可能／効果＝無条件解除・代金返還・引取り費用は事業者負担・損害賠償/違約金請求なし／通信販売は対象外／e-Gov law id 351AC0000000057',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/', type: 'government', label: '消費者庁 特定商取引法ガイド「特定商取引法とは」' },
      { url: 'https://www.kokusen.go.jp/soudan_now/data/coolingoff.html', type: 'government', label: '国民生活センター「クーリング・オフ（テーマ別特集）」' },
      { url: 'https://www.no-trouble.caa.go.jp/qa/coolingoff.html', type: 'government', label: '消費者庁「電磁的記録によるクーリング・オフに関するQ&A」' },
      { url: 'https://laws.e-gov.go.jp/law/351AC0000000057/', type: 'government', label: 'e-Gov法令検索「特定商取引に関する法律」（昭和51年法律第57号）' },
    ],
  },
  {
    id: 'infosoc-deliberative-democracy',
    discipline: 'information-sociology',
    title: '熟議民主主義',
    statement:
      '熟議民主主義（deliberative democracy）とは、民主的正統性の源泉を、単なる投票や選好の集計（aggregation）でも利益の交渉でもなく、自由で平等な市民による公共的な討議・熟議（deliberation）に求める政治理論である。政治的決定は、影響を受ける人々が互いに受容可能な理由を提示し合い（reason-giving）、それを吟味する公共的討議を経てこそ正統性をもつとされる。' +
      '1980年代以降「熟議的転回（deliberative turn）」として発展し、ハーバーマス（討議理論・コミュニケーション的行為）、ロールズ（公共的理性）、コーエン、ガットマン＆トンプソンらが理論化した。自己利益でなく他者も受け入れうる公共的理由への訴え、討議を通じた選好の変容、包摂性・平等・相互尊重を重視する。ミニ・パブリックス、フィシュキンの討論型世論調査、市民議会などが実践例で、現実の権力・不平等の軽視やオンライン熟議の分極化リスクも論じられる。',
    keyFigures:
      'ユルゲン・ハーバーマス／ジョン・ロールズ（公共的理性）／ジョシュア・コーエン／エイミー・ガットマン＆デニス・トンプソン／ジェイムズ・フィシュキン（討論型世論調査）',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/democracy/', type: 'reference', label: 'Stanford Encyclopedia of Philosophy — Democracy（熟議民主主義・理由の交換・ハーバーマスの討議理論）' },
      { url: 'https://plato.stanford.edu/entries/legitimacy/', type: 'reference', label: 'Stanford Encyclopedia of Philosophy — Political Legitimacy（公共的討議に依拠する正統性）' },
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1002/9781118474396.wbept0247', type: 'academic', label: 'Michelbach, “Deliberative Democracy,” Wiley Encyclopedia of Political Thought（定義・熟議的転回・キーパーソン）' },
      { url: 'https://deliberation.stanford.edu/publications/journal-articles/deliberative-polling-comes-age-symposium-james-s-fishkin-democracy', type: 'academic', label: 'Stanford Deliberative Democracy Lab — Deliberative Polling / Fishkin（ミニ・パブリックス・討論型世論調査）' },
    ],
  },
  {
    id: 'econ-evolutionarily-stable-strategy',
    discipline: 'economics',
    title: '進化的に安定な戦略（ESS）',
    statement:
      '進化的に安定な戦略（ESS）とは、ある集団のほぼ全員が採用しているとき、まれな突然変異の「侵入者（mutant）」が別の戦略をとっても、自然選択のもとでその侵入戦略が集団に広がることができないような戦略を指す。いったん集団に固定されると、他の戦略に置き換えられない進化的に安定した状態である。' +
      '進化生物学者ジョン・メイナード・スミスとジョージ・プライスが1973年の論文「The Logic of Animal Conflict」（Nature）で導入し、メイナード・スミスの1982年の著書『Evolution and the Theory of Games』で体系化した。動物の闘争行動を説明するタカ・ハト・ゲームが代表例である。ESSはゲーム理論のナッシュ均衡の精緻化（すべてのESSはナッシュ均衡）であり、合理的選択ではなく自然選択・進化のダイナミクスによって到達される点が特徴で、性比（1:1への進化）や協力の進化などの分析に応用される。',
    keyFigures:
      'ジョン・メイナード・スミス（John Maynard Smith）／ジョージ・R・プライス（George R. Price）（1973 Nature「The Logic of Animal Conflict」）／メイナード・スミス『Evolution and the Theory of Games』1982／代表例＝タカ・ハト・ゲーム',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/game-evolutionary/', type: 'reference', label: 'Stanford Encyclopedia of Philosophy「Evolutionary Game Theory」（ESS とナッシュ均衡の精緻化・侵入不能性）' },
      { url: 'https://royalsocietypublishing.org/rstb/article/378/1876/20210496/109181/Evolutionarily-stable-strategy-analysis-and-its', type: 'academic', label: 'Philosophical Transactions of the Royal Society B 378(1876):20210496（査読論文、ESS解析と侵入適応度）' },
      { url: 'https://en.wikipedia.org/wiki/Evolution_and_the_Theory_of_Games', type: 'reference', label: 'Wikipedia「Evolution and the Theory of Games」（Maynard Smith 1982年著書・タカ・ハト・ゲーム）' },
      { url: 'https://en.wikipedia.org/wiki/Evolutionarily_stable_strategy', type: 'reference', label: 'Wikipedia「Evolutionarily stable strategy」（1973年 Nature 論文での導入と定義）' },
    ],
  },
  {
    id: 'mgmt-brand-equity',
    discipline: 'management',
    title: 'ブランド・エクイティ',
    statement:
      'ブランド・エクイティとは、ブランド（名前・ロゴ・シンボル等）が製品やサービスに付与する付加的な価値であり、同一の製品でもブランドが付くことで生じる顧客の認識・態度・行動の差に由来する資産である。' +
      'デイビッド・アーカーは1991年の著書『Managing Brand Equity』で、これをブランドに結びついた資産と負債の集合と定義し、(1)ブランド・ロイヤルティ、(2)ブランド認知、(3)知覚品質、(4)ブランド連想、(5)その他の独自資産（特許・商標等）の5要素で体系化した。ケビン・レーン・ケラーは1993年に「顧客ベースのブランド・エクイティ（CBBE）」を提唱し、ブランド知識（ブランド認知＋ブランド・イメージ）がマーケティング活動への消費者反応に及ぼす差別的効果として定義した。強いブランド・エクイティは価格プレミアム、顧客ロイヤルティ、ブランド拡張の容易さ、競争優位をもたらす。',
    keyFigures:
      'デイビッド・A・アーカー（David A. Aaker、『Managing Brand Equity』1991, 5要素モデル）／ケビン・レーン・ケラー（Kevin Lane Keller、顧客ベースのブランド・エクイティ CBBE, 1993, Journal of Marketing 57(1):1-22）',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.1177/002224299305700101', type: 'academic', label: 'Keller, K. L. (1993) “Conceptualizing, Measuring, and Managing Customer-Based Brand Equity”, Journal of Marketing 57(1):1-22（査読論文／SAGE）' },
      { url: 'https://people.duke.edu/~moorman/Marketing-Strategy-Seminar-2015/Session%203/Keller.pdf', type: 'academic', label: 'Keller (1993) 本文PDF（Duke University 教員ホスト）— CBBEの差別的効果の定義' },
      { url: 'https://en.wikipedia.org/wiki/Brand_equity', type: 'reference', label: 'Wikipedia「Brand equity」— Aakerの資産・負債定義と5要素、一般的定義' },
    ],
  },
  {
    id: 'human-behavioral-genetics',
    discipline: 'human-science',
    title: '行動遺伝学（双生児研究・遺伝率）',
    statement:
      '行動遺伝学は、知能・パーソナリティ・精神疾患の罹りやすさといった行動・心理的形質の個人差が、遺伝要因と環境要因によってどの程度説明されるかを定量的に研究する分野である。主要手法が双生児研究で、遺伝子をほぼ100%共有する一卵性双生児と平均約50%共有する二卵性双生児の類似度を比較し、形質の分散を加法的遺伝（A）・共有環境（C）・非共有環境（E）に分解する（養子研究も併用）。' +
      '中心概念の遺伝率（h²）は、ある集団・環境下での形質の個人差（分散）のうち遺伝的差異で説明される割合（0〜1）を指す。重要な注意として、遺伝率は集団・環境に依存する統計量であり、個人の形質が何％遺伝で決まるかを意味せず、形質が変更不可能であることも、集団間の平均差の原因も意味しない。Turkheimerはこれらの知見を「行動遺伝学の三法則」として定式化した。',
    keyFigures:
      'エリック・タークハイマー（Eric Turkheimer、行動遺伝学の三法則, 2000）／フランシス・ゴルトン（Francis Galton、双生児・遺伝研究の先駆）／ロバート・プローミン（Robert Plomin、行動遺伝学・量的遺伝研究）／手法＝双生児研究・養子研究／A・C・E分解',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/heritability', type: 'reference', label: 'Encyclopædia Britannica — Heritability（遺伝率の定義）' },
      { url: 'https://journals.sagepub.com/doi/10.1111/1467-8721.00084', type: 'academic', label: 'Turkheimer, E. (2000) “Three Laws of Behavior Genetics and What They Mean” Current Directions in Psychological Science（査読・三法則の原論文）' },
      { url: 'https://www.pnas.org/doi/10.1073/pnas.2319496121', type: 'academic', label: 'PNAS — Heritability within groups is uninformative about differences among groups（遺伝率の誤解：集団間差を説明しない）' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4412550/', type: 'academic', label: 'PMC/NIH — What Twin Studies Tell Us About Heritability（双生児研究の方法論レビュー）' },
    ],
  },
  {
    id: 'human-fluid-crystallized-intelligence',
    discipline: 'human-science',
    title: '流動性知能と結晶性知能',
    statement:
      '心理学者レイモンド・キャッテル（Raymond B. Cattell）が1960年代に提唱し、弟子のジョン・ホーン（John L. Horn）とともに発展させた知能の理論的区分（Gf-Gc理論）。流動性知能（fluid intelligence, Gf）は、過去の知識に頼らず新奇な問題をその場で論理的に推論し解決する能力で、パターン認識・抽象的推論・関係把握などを指し、生理的基盤が大きく若年期（20歳代）にピークを迎えた後、加齢とともに比較的早く低下する。' +
      '結晶性知能（crystallized intelligence, Gc）は、教育・経験・文化を通じて獲得・蓄積された知識やスキルを活用する能力で、語彙・一般知識・専門知識などを指し、経験の蓄積により中高年まで維持・向上し加齢による低下が緩やかである。キャッテルはスピアマンの一般知能（g因子）を2因子に分けたもので、加齢に伴う認知変化を説明し、現代のCHC理論（Cattell–Horn–Carroll理論）の基礎の一つとなっている。',
    keyFigures:
      'レイモンド・キャッテル（Raymond B. Cattell）／ジョン・ホーン（John L. Horn）／Gf＝流動性知能（新奇な推論・若年でピーク）・Gc＝結晶性知能（蓄積知識・中高年まで維持）／CHC理論の基礎',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/science/human-intelligence-psychology/Psychometric-theories', type: 'reference', label: 'Encyclopaedia Britannica — Human intelligence: Psychometric theories（Cattell–Horn の流動性／結晶性知能と加齢変化）' },
      { url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5156710/', type: 'academic', label: 'Brown, R. E. (2016) “Hebb and Cattell: The Genesis of the Theory of Fluid and Crystallized Intelligence”, Frontiers in Human Neuroscience（査読論文、理論の起源と定義）' },
      { url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8628958/', type: 'academic', label: '加齢に伴う流動性知能の低下と結晶性知能の維持に関する査読レビュー' },
    ],
  },
  {
    id: 'bizlaw-moral-rights',
    discipline: 'business-law',
    title: '著作者人格権（著作権法18〜20条）',
    statement:
      '著作者人格権とは、著作物を創作した著作者がもつ、その人格的・精神的利益を保護する権利であり、財産権としての著作権（著作財産権）とは区別される。日本の著作権法は3つを定める：公表権（18条＝未公表の自己の著作物を公表するか、いつ・どのように公表するかを決める権利）、氏名表示権（19条＝著作者名を表示するか、実名・変名のいずれで表示するかを決める権利）、' +
      '同一性保持権（20条＝著作物およびその題号〔タイトル〕について意に反する改変・切除その他の変更を受けない権利）。最大の特徴は一身専属性で、著作者人格権は著作者本人に専属し譲渡・相続できない（59条）。これは譲渡可能な著作財産権と対照的である。侵害には差止・損害賠償に加え、名誉回復等の措置（115条）を請求できる。実務では「不行使特約」が用いられることがある。',
    keyFigures:
      '公表権＝著作権法18条／氏名表示権＝19条／同一性保持権＝20条（著作物と題号の改変禁止）／一身専属・譲渡不可＝59条／名誉回復等の措置請求＝115条／著作財産権（譲渡可能）とは区別される人格的利益の保護／死後も人格的利益の保護あり（60条）／実務上の不行使特約／e-Gov 著作権法 law id 345AC0000000048',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/345AC0000000048', type: 'government', label: 'e-Gov法令検索 著作権法（昭和45年法律第48号、law id 345AC0000000048）第18〜20条・59条・115条' },
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/seidokaisetsu/pdf/94283401_01.pdf', type: 'government', label: '文化庁「著作権テキスト（令和7年度版）」著作者人格権の解説' },
      { url: 'https://ja.wikipedia.org/wiki/著作者人格権', type: 'reference', label: 'Wikipedia「著作者人格権」（公表権・氏名表示権・同一性保持権と一身専属性）' },
      { url: 'https://kigyobengo.com/media/useful/837.html', type: 'media', label: '咲くやこの花法律事務所「著作者人格権とは？」（著作財産権との区別・不行使特約の実務）' },
    ],
  },
  {
    id: 'infosoc-creative-commons',
    discipline: 'information-sociology',
    title: 'クリエイティブ・コモンズ（CCライセンス）',
    statement:
      'クリエイティブ・コモンズ（CC）とは、著作者が著作権を保持したまま、自分の作品を一定の条件下で自由に共有・利用してよいと意思表示できる標準化された一連の著作権ライセンス（CCライセンス）、およびそれを提供する非営利団体（2001年に米国で法学者ローレンス・レッシグ、ハル・アベルソン、エリック・エルドレッドらが設立、最初のライセンス群は2002年12月公開）を指す。' +
      '従来の「全ての権利を留保（all rights reserved）」と権利を主張しないパブリックドメインの中間に位置する「一部の権利を留保（some rights reserved）」という柔軟な選択肢を提供し、作品の合法的な共有・再利用を促進する。表示（BY）・非営利（NC）・改変禁止（ND）・継承（SA）の4要素の組み合わせで6種の主要ライセンスが構成され、CC0は権利放棄によりパブリックドメインに近づける表明である。ウィキペディア（CC BY-SA）やオープンアクセス論文、オープン教育リソース（OER）で広く使われる。',
    keyFigures:
      '設立2001年（米国・非営利団体）、設立者ローレンス・レッシグ／ハル・アベルソン／エリック・エルドレッド／最初の公式ライセンス群を2002年12月公開／4要素：表示BY・非営利NC・改変禁止ND・継承SA／6種：CC BY／CC BY-SA／CC BY-NC／CC BY-NC-SA／CC BY-ND／CC BY-NC-ND／CC0は権利放棄（2009年公開）／利用例＝ウィキペディア(CC BY-SA)・OER',
    asOf: '2026-06',
    sources: [
      { url: 'https://creativecommons.org/history/', type: 'reference', label: 'Creative Commons 公式 — History（沿革・設立・ミッション）' },
      { url: 'https://www.britannica.com/topic/Creative-Commons', type: 'reference', label: 'Encyclopædia Britannica — Creative Commons: Organization, History, & Facts' },
      { url: 'https://pose.open.ubc.ca/open-education/creative-commons/what-are-the-different-types-of-creative-commons-licenses/', type: 'academic', label: 'University of British Columbia (POSE) — 6種CCライセンスの種類と4要素の解説' },
      { url: 'https://en.wikipedia.org/wiki/Creative_Commons_license', type: 'reference', label: 'Wikipedia — Creative Commons license（CC0・要素・ライセンス一覧）' },
    ],
  },
  {
    id: 'econ-knightian-uncertainty',
    discipline: 'economics',
    title: 'ナイトの不確実性（リスクと不確実性）',
    statement:
      '経済学者フランク・H・ナイト（Frank H. Knight, 1885–1972）が1921年の著書『リスク、不確実性および利潤（Risk, Uncertainty and Profit）』で確立した、「リスク（risk）」と「（真の）不確実性（uncertainty）」の区別を指す。リスクとは、起こりうる結果とその確率が既知で、客観的・統計的に測定可能な状況（例：サイコロ、保険数理で計算できる事象）であり、保険や分散によってヘッジ・除去できる。' +
      'これに対しナイト的不確実性とは、確率分布そのものが未知で測定・定量化できない状況（例：全く新しい技術や市場の帰結）を指し、保険で除去できない。ナイトは「測定可能な不確実性は本来の不確実性ではない」と述べ、この除去不能な真の不確実性を企業家（entrepreneur）が引き受けることが、完全競争では説明できない利潤（profit）の源泉だと論じた。この概念は曖昧性回避（ambiguity aversion）やエルズバーグのパラドックス、期待効用理論の限界の議論に連なる。',
    keyFigures:
      'フランク・H・ナイト（Frank H. Knight, 1885–1972, 1921『Risk, Uncertainty and Profit』）／関連: ジョン・メイナード・ケインズ（不確実性概念）／ダニエル・エルズバーグ（曖昧性回避）／リスク＝測定可能・不確実性＝測定不能・利潤の源泉',
    asOf: '2026-06',
    sources: [
      { url: 'https://news.mit.edu/2010/explained-knightian-0602', type: 'academic', label: 'MIT News, “Explained: Knightian uncertainty”（マサチューセッツ工科大学）' },
      { url: 'https://www.econlib.org/library/Knight/knRUP.html', type: 'reference', label: 'Frank H. Knight, “Risk, Uncertainty, and Profit” (1921) 原典全文（Econlib / Library of Economics and Liberty）' },
      { url: 'https://sms.onlinelibrary.wiley.com/doi/full/10.1002/sej.1516', type: 'academic', label: 'Townsend et al. (2024), “What is Knightian uncertainty?”, Strategic Entrepreneurship Journal（Wiley、査読論文）' },
      { url: 'https://en.wikipedia.org/wiki/Knightian_uncertainty', type: 'reference', label: 'Wikipedia, “Knightian uncertainty”（百科事典級リファレンス）' },
    ],
  },
  {
    id: 'mgmt-service-dominant-logic',
    discipline: 'management',
    title: 'サービス・ドミナント・ロジック',
    statement:
      'マーケティングの基礎的な見方を、有形財（モノ）の交換を中心とする伝統的なグッズ・ドミナント・ロジック（GDロジック）から、サービス——自己や他者の便益のための知識・スキル（オペラント資源）の応用——の交換を中心とする見方へ転換する理論的枠組み。スティーブン・バーゴとロバート・ラッシュが2004年の論文「Evolving to a New Dominant Logic for Marketing」（Journal of Marketing）で提唱した。' +
      '中心的主張は、(1)サービスがあらゆる交換の基盤であり、モノは知識・スキルを届ける流通メカニズムにすぎず全経済はサービス経済である、(2)価値は企業が一方的に埋め込む交換価値ではなく、顧客が利用する文脈で生じる使用価値・文脈価値（value-in-use / value-in-context）である、(3)価値は受益者を含む複数アクターにより共創され、常に受益者が決定する、という基本的前提（FPs）・公理（axioms）にある。2016年には制度・制度配列とサービス・エコシステムを第5公理として組み込み発展した。',
    keyFigures:
      'スティーブン・L・バーゴ（Stephen L. Vargo）／ロバート・F・ラッシュ（Robert F. Lusch）（2004 Journal of Marketing）／対比＝グッズ・ドミナント・ロジック／中核＝オペラント資源・価値共創・使用価値／2016年に制度・サービスエコシステムを追加',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.1509/jmkg.68.1.1.24036', type: 'academic', label: 'Vargo & Lusch (2004) “Evolving to a New Dominant Logic for Marketing”, Journal of Marketing 68(1):1–17 (SAGE Journals, 出版元)' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/service-dominant-s-d-logic', type: 'reference', label: 'EBSCO Research Starters: Service-dominant (S-D) logic（百科事典級リファレンス）' },
      { url: 'https://experts.arizona.edu/en/publications/evolving-to-a-new-dominant-logic-for-marketing/', type: 'academic', label: 'University of Arizona — “Evolving to a New Dominant Logic for Marketing” 出版記録' },
    ],
  },
  {
    id: 'human-trolley-problem',
    discipline: 'human-science',
    title: 'トロッコ問題',
    statement:
      'トロッコ問題は倫理学・道徳心理学の思考実験。制御不能のトロッコ（路面電車）が線路上の5人に向かい進み、放置すれば5人が死ぬ。分岐器のそばにいるあなたがレバーを引けば別の側線へ逸らせるが、そこには1人がいてその人が代わりに死ぬ。1人を犠牲に5人を救うべきかを問う。' +
      'フィリッパ・フットが1967年に原型を提示し、ジュディス・ジャーヴィス・トムソンが1976年・1985年の論文で「トロリー問題」と名づけ、人を突き落として5人を救う「歩道橋（footbridge）」版を加えた。多くの人は分岐器版では許容するが歩道橋版では強く拒む。この直観の非対称性が帰結主義と義務論の対立、二重結果論を浮き彫りにし、グリーンらの神経倫理学はこれを情動的反応と熟慮的反応の二重過程説で説明した。自動運転車の倫理など現代的応用も議論される。',
    keyFigures:
      'フィリッパ・フット（Philippa Foot, 1967年に原型を提示）／ジュディス・ジャーヴィス・トムソン（Judith Jarvis Thomson, 1976年・1985年に命名・歩道橋版を展開）／ジョシュア・グリーン（Joshua Greene, 二重過程説・fMRI神経倫理研究）',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/doing-allowing/', type: 'reference', label: 'Stanford Encyclopedia of Philosophy「Doing vs. Allowing Harm」（フット1967起源・トムソン1976命名・二重結果論との関係）' },
      { url: 'https://www.ebsco.com/research-starters/religion-and-philosophy/trolley-problem', type: 'reference', label: 'EBSCO Research Starters「Trolley problem」（フット1967・トムソン1976/1985・歩道橋＝fat man版）' },
      { url: 'https://www.science.org/doi/10.1126/science.1062872', type: 'academic', label: 'Greene et al. (2001) “An fMRI Investigation of Emotional Engagement in Moral Judgment”, Science 293:2105（personal/impersonal・二重過程説）' },
    ],
  },
  {
    id: 'human-misinformation-effect',
    discipline: 'human-science',
    title: '誤情報効果（目撃証言）',
    statement:
      'ある出来事を目撃した後に、その出来事に関する誤った情報（post-event misinformation）に接すると、本来の記憶が書き換えられ歪み、誤情報を実際に見た記憶として報告してしまう現象。記憶は録画のような正確な再生ではなく再構成的（reconstructive）で可塑的であることを示す。' +
      'ロフタス＆パーマー（1974）の自動車事故映像実験では、衝突を「激突した（smashed）」と尋ねた群は「接触した（contacted）」群より速度を高く見積もり、1週間後に割れたガラスを（実際にはないのに）見たと誤答する割合が高かった。誘導的質問が記憶を変容させ、未経験の出来事の偽りの記憶も植え付けうること（ロフタス＆ピックレル1995「ショッピングモールで迷子」、約25%が偽記憶を形成）が示され、目撃証言の信頼性と冤罪・取調べ手法に重大な含意を持つ。',
    keyFigures:
      'エリザベス・ロフタス（Elizabeth F. Loftus）／ジョン・パーマー（John C. Palmer、1974 自動車事故実験）／ジャクリーン・ピックレル（Jacqueline E. Pickrell、1995「ショッピングモールで迷子」偽記憶研究）',
    asOf: '2026-06',
    sources: [
      { url: 'https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/lcrp.70020', type: 'academic', label: 'Loftus, E. F. “The history of an idea: The misinformation effect.” Legal and Criminological Psychology（査読誌, Wiley / 英国心理学会）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/37017540/', type: 'academic', label: 'Loftus & Pickrell (1995) “lost in the mall” の事前登録追試（Memory 誌, PubMed 収載）' },
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/misinformation-effect', type: 'reference', label: 'EBSCO Research Starters: “Misinformation effect”（リファレンス級概説）' },
      { url: 'https://en.wikipedia.org/wiki/Misinformation_effect', type: 'reference', label: 'Wikipedia: Misinformation effect（概説・参照用）' },
    ],
  },
  {
    id: 'bizlaw-work-for-hire',
    discipline: 'business-law',
    title: '職務著作（著作権法15条）',
    statement:
      '職務著作（法人著作）とは、一定の要件を満たす場合に、実際に創作した従業員ではなく使用者である法人等を「著作者」とする制度（著作権法15条）。' +
      '通常、著作者は現実に創作した自然人だが、組織の業務として作られる著作物は、権利関係を明確にする趣旨で法人等を著作者とする。15条1項の要件は、(1)法人その他使用者の発意に基づくこと、(2)その法人等の業務に従事する者が職務上作成すること、(3)法人等が自己の著作の名義のもとに公表するものであること、(4)作成時の契約・勤務規則等に別段の定めがないこと。プログラムの著作物は15条2項により公表名義要件が不要。要件を満たすと法人等が著作者となり、著作者人格権・著作（財産）権とも最初から法人等に帰属する。創作者が法人等の指揮監督下にある雇用関係が前提で、外部の請負・委任受託者は原則として職務著作とならず別途の権利譲渡契約が必要となる。',
    keyFigures:
      '根拠条文＝著作権法15条（e-Gov law id 345AC0000000048）／1項4要件＝発意・業務従事者の職務上作成・法人等の著作名義で公表・別段の定めなし／プログラムは2項で公表名義要件が不要／効果＝法人等が著作者となり著作者人格権も著作財産権も最初から法人等に帰属／前提＝指揮監督下の雇用関係／外部の請負・委任受託者は原則として職務著作とならず別途の権利譲渡契約が必要',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/345AC0000000048', type: 'government', label: 'e-Gov法令検索 著作権法（昭和45年法律第48号）第15条' },
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/textbook/pdf/94141901_01.pdf', type: 'government', label: '文化庁「著作権テキスト（令和6年度版）」職務著作の解説' },
      { url: 'https://www.jcea.info/kenpo/15.html', type: 'reference', label: '日本著作権教育研究会 著作権法第15条 条文解説' },
    ],
  },
  {
    id: 'infosoc-net-neutrality',
    discipline: 'information-sociology',
    title: 'ネットワーク中立性',
    statement:
      'ネットワーク中立性（net neutrality）とは、インターネット・サービス・プロバイダ（ISP）がネット上を流れる全通信を、送信元・宛先・内容・利用するアプリやサービスの種類によって差別せず平等に扱うべきだとする原則である。具体的には、特定のコンテンツの(1)ブロッキング（遮断）、(2)スロットリング（速度制限）、(3)対価による有料優先（paid prioritization＝ファストレーン）を禁止・制限する。' +
      '狙いは、インターネットを誰もが平等にアクセスできるオープンな基盤として保ち、ISPがゲートキーパーとして競争・イノベーション・表現の自由を歪めるのを防ぐことにある。語は法学者ティム・ウーが2003年の論文で提唱。米FCCは2015年にブロードバンドをタイトルIIに分類し規則を導入したが2017年に撤廃、2024年に再導入したものの2025年に連邦控訴裁が無効化した。EUは規則2015/2120で、日本は総務省が議論・指針を整備している。',
    keyFigures:
      'ティム・ウー（Tim Wu, 提唱者・2003）／米連邦通信委員会（FCC, 2015導入/2017撤廃/2024再導入/2025無効化）／EU規則2015/2120・BEREC／日本：総務省「ネットワーク中立性に関する研究会」／禁止対象＝ブロッキング・スロットリング・有料優先',
    asOf: '2026-06',
    sources: [
      { url: 'https://scholarship.law.columbia.edu/faculty_scholarship/1281/', type: 'academic', label: 'Tim Wu, “Network Neutrality, Broadband Discrimination,” J. on Telecomm. & High Tech. L., Vol. 2, p. 141 (2003) — Columbia Law School Scholarship（原典・提唱論文）' },
      { url: 'https://www.fcc.gov/restoring-internet-freedom', type: 'government', label: '米連邦通信委員会（FCC）“Restoring Internet Freedom”（2017年の規則撤廃の公式ページ）' },
      { url: 'https://www.berec.europa.eu/en/all-you-need-to-know-about-net-neutrality-rules-in-the-eu', type: 'government', label: 'BEREC（欧州電子通信規制者団体）“Net Neutrality rules in the EU” — 規則(EU)2015/2120の公式解説' },
      { url: 'https://www.soumu.go.jp/main_sosiki/kenkyu/network_churitsu/02kiban04_04000246.html', type: 'government', label: '日本・総務省「ネットワーク中立性に関する研究会」公式ページ' },
    ],
  },
  {
    id: 'econ-minsky-financial-instability',
    discipline: 'economics',
    title: '金融不安定性仮説（ミンスキー）',
    statement:
      '経済学者ハイマン・ミンスキーが提唱した、資本主義経済の金融システムは好況の持続そのものによって内生的に不安定化し、やがて金融危機を招くとする理論。中心命題は「安定が不安定を生む」。好況が続くとリスク認識が緩み、借入と投機が膨張して債務が積み上がる。ミンスキーは資金調達構造を、営業キャッシュフローで元利を返済できるヘッジ金融、利息は払えるが元本返済を借換に依存する投機的金融、' +
      '利息さえキャッシュフローで賄えず資産価格上昇と追加借入に依存するポンツィ金融の三類型に分けた。好況下で経済全体がヘッジから投機的・ポンツィへ移行して脆弱化し、資産価格の下落を契機に投げ売り・債務デフレ・信用収縮の連鎖が起きるとする。この転換点は「ミンスキー・モーメント」（1998年にポール・マカリーが命名）と呼ばれ、2008年の世界金融危機で同仮説は広く再評価された。',
    keyFigures:
      'ハイマン・ミンスキー（Hyman P. Minsky, 1919-1996, 提唱者）／ポール・マカリー（Paul McCulley, 「ミンスキー・モーメント」を1998年に命名）／三類型＝ヘッジ金融・投機的金融・ポンツィ金融',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.levyinstitute.org/pubs/wp74.pdf', type: 'academic', label: 'Hyman P. Minsky, “The Financial Instability Hypothesis,” Levy Economics Institute Working Paper No. 74 (1992) — 著者本人による一次資料' },
      { url: 'https://en.wikipedia.org/wiki/Minsky_moment', type: 'reference', label: 'Wikipedia: Minsky moment（マカリーによる1998年の命名・2008年危機での再評価）' },
      { url: 'https://en.wikipedia.org/wiki/Hyman_Minsky', type: 'reference', label: 'Wikipedia: Hyman Minsky（金融不安定性仮説・3類型の概観）' },
    ],
  },
  {
    id: 'mgmt-experience-economy',
    discipline: 'management',
    title: '経験経済（パイン＆ギルモア）',
    statement:
      '経験経済とは、経済価値の中心がコモディティ（農業経済）→製品（産業経済）→サービス（サービス経済）へと進化してきた延長線上に、第4の差別化された経済価値として「経験（experience）」が登場したとする考え方である。' +
      'B・ジョセフ・パインⅡとジェームズ・H・ギルモアが1998年のHBR論文「Welcome to the Experience Economy」および1999年の著書で提唱した。企業はサービスを「舞台」、製品を「小道具」として用い、顧客に思い出に残る個人的な経験を演出することで高い価値を生む。経験は顧客の参加度（能動的⇔受動的）と環境との関係（没入⇔吸収）の2軸で4領域（エンターテインメント／エデュケーション／エスケープ／エステティック）に分類される。後に彼らは経験を超え顧客自身を変える「変革（transformation）」を第5の価値とした。',
    keyFigures:
      'B・ジョセフ・パインⅡ（B. Joseph Pine II）／ジェームズ・H・ギルモア（James H. Gilmore）（1998 HBR・1999『The Experience Economy』）／4領域＝娯楽・教育・脱日常・審美／第5の価値＝変革',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/1998/07/welcome-to-the-experience-economy', type: 'academic', label: 'Pine & Gilmore, “Welcome to the Experience Economy,” Harvard Business Review, July–August 1998（提唱原典）' },
      { url: 'https://www.researchgate.net/publication/233101787_Pine_and_Gilmore%27s_Concept_of_Experience_Economy_and_Its_Dimensions_An_Empirical_Examination_in_Tourism', type: 'academic', label: "Oh, Fiore & Jeong, “Pine and Gilmore's Concept of Experience Economy and Its Dimensions”（査読論文・4領域と2軸の実証）" },
      { url: 'https://en.wikipedia.org/wiki/B._Joseph_Pine_II', type: 'reference', label: 'Wikipedia: B. Joseph Pine II（提唱者・著書1999）' },
    ],
  },
  {
    id: 'human-self-monitoring',
    discipline: 'human-science',
    title: 'セルフ・モニタリング（スナイダー）',
    statement:
      'セルフ・モニタリングとは、社会的状況や他者の反応といった手がかりに応じて、自分の自己呈示・表情・態度・行動をどの程度モニターし調整するかという、パーソナリティ特性（個人差変数）である。' +
      '社会心理学者マーク・スナイダーが1974年の論文「Self-monitoring of expressive behavior」（Journal of Personality and Social Psychology誌）で概念化し、25項目の真偽（True/False）形式の自己監視尺度（Self-Monitoring Scale）を開発した。高セルフ・モニターは状況や相手の期待に敏感で、社会的に適切に見えるよう振る舞いを柔軟に変える「社会的カメレオン」型で印象管理に長ける。一方、低セルフ・モニターは状況より自分の内的態度・価値観に従い、一貫した自己像を呈示する。対人関係・リーダーシップ・広告反応・職場行動との関連が研究され、尺度の因子構造（演技・外向性・他者志向の3因子など）をめぐる議論もある。',
    keyFigures:
      'マーク・スナイダー（Mark Snyder、1974 JPSP 30(4):526-537）／尺度批判・改訂＝Briggs・Cheek・Buss／Lennox・Wolfe／高低セルフ・モニターの個人差',
    asOf: '2026-06',
    sources: [
      { url: 'https://experts.umn.edu/en/publications/self-monitoring-of-expressive-behavior/', type: 'academic', label: 'University of Minnesota (Experts@Minnesota) — Snyder, M. (1974). Self-monitoring of expressive behavior, J. Personality and Social Psychology, 30(4), 526-537' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/self-monitoring', type: 'reference', label: 'Encyclopedia.com — Self-Monitoring（概念・スナイダー起源・高低自己監視者）' },
      { url: 'https://en.wikipedia.org/wiki/Self-monitoring', type: 'reference', label: 'Wikipedia — Self-monitoring（尺度・因子構造・改訂版の議論）' },
    ],
  },
  {
    id: 'human-self-handicapping',
    discipline: 'human-science',
    title: 'セルフ・ハンディキャッピング',
    statement:
      'セルフ・ハンディキャッピングとは、試験や競技など重要な遂行に先立って、自らの成功を妨げかねない障害（ハンディキャップ）をあえて作り出したり言葉で主張したりする、自己防衛的な方略である。失敗時にはその障害に原因を帰属させて能力不足という内的帰属を回避し（自尊心を守る）、成功時には障害を乗り越えたとして評価が高まる。' +
      'このように失敗の外在化と成功の内在化という二重の利得を狙う点が核心で、社会心理学者エドワード・ジョーンズとスティーブン・バーグラスが1978年の論文で概念化・命名した。実際に成功を妨げる行動をとる「行動的（練習回避・飲酒等）」と、体調不良・不安・睡眠不足等を口頭で訴える「主張的（自己報告的）」に大別され、原因帰属理論や自己呈示と密接に関連し、性差も論じられる。',
    keyFigures:
      'エドワード・E・ジョーンズ（Edward E. Jones）／スティーブン・バーグラス（Steven Berglas）（Berglas & Jones 1978, JPSP 36(4):405-417）／行動的・主張的（自己報告的）の2類型',
    asOf: '2026-06',
    sources: [
      { url: 'https://pubmed.ncbi.nlm.nih.gov/650387/', type: 'academic', label: 'Berglas, S., & Jones, E. E. (1978). Drug choice as a self-handicapping strategy in response to noncontingent success. Journal of Personality and Social Psychology, 36(4), 405–417 (PubMed, PMID 650387)' },
      { url: 'https://dictionary.apa.org/self-handicapping', type: 'reference', label: 'APA Dictionary of Psychology — “self-handicapping”（米国心理学会）' },
      { url: 'https://psychology.iresearchnet.com/social-psychology/self/self-handicapping/', type: 'reference', label: 'iResearchNet, Social Psychology — “Self-Handicapping”（行動的／主張的の区分・性差）' },
    ],
  },
  {
    id: 'bizlaw-design-right',
    discipline: 'business-law',
    title: '意匠権（意匠法）',
    statement:
      '意匠権は、物品・建築物・画像のデザイン（意匠）を保護する知的財産権で、意匠法に基づき特許庁への出願・登録によって発生する。意匠法上の「意匠」とは、物品（物品の部分を含む）の形状・模様・色彩若しくはこれらの結合、建築物（同）の形状等又は画像であって、視覚を通じて美感を起こさせるものをいう（意匠法2条1項）。登録要件は(1)工業上利用可能性、(2)新規性、(3)創作非容易性である。' +
      '意匠権者は、登録意匠及びこれに類似する意匠を業として独占的に実施する権利を専有し、無断実施に対しては差止請求・損害賠償請求ができる。存続期間は2019年改正（令和元年改正、2020年4月施行）により出願日から25年に延長された（改正前は設定登録日から20年）。同改正で建築物の意匠・内装の意匠・画像デザインも保護対象に追加された。保護対象を異にする特許（発明）・実用新案（考案）・商標（出所識別）とは別個の権利である。',
    keyFigures:
      '根拠法＝意匠法（昭和34年法律第125号、e-Gov law id 334AC0000000125）／所管＝特許庁／意匠の定義＝物品・建築物の形状等又は画像で視覚を通じ美感を起こさせるもの（2条1項）／登録3要件＝工業上利用可能性・新規性・創作非容易性／存続期間＝出願日から25年（2020年4月施行の令和元年改正、改正前は登録日から20年）／2019年改正で建築物・内装・画像を保護対象に追加',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/334AC0000000125', type: 'government', label: 'e-Gov法令検索 意匠法（昭和34年法律第125号）' },
      { url: 'https://www.jpo.go.jp/system/design/gaiyo/seidogaiyo/isyou_kaisei_2019.html', type: 'government', label: '特許庁 令和元年意匠法改正特設サイト（保護対象拡充・存続期間延長）' },
      { url: 'https://www.jpo.go.jp/system/laws/rule/kaisetu/2019/document/2019-03kaisetsu/2019-03kaisetsu-02-01.pdf', type: 'government', label: '特許庁 産業財産権法（令和元年改正）解説書 第1章 意匠の定義の見直し' },
    ],
  },
  {
    id: 'infosoc-data-colonialism',
    discipline: 'information-sociology',
    title: 'データ植民地主義',
    statement:
      'データ植民地主義（data colonialism）とは、人々の日常の経験・行動・社会関係といった「生（life）」そのものを、データ化（datafication）を通じて新たな収奪・領有（appropriation）の対象とし、資本主義のための価値抽出にあてる現代の大規模データ収集・利用のあり方を、歴史的な植民地主義になぞらえて批判的に分析する概念・枠組みである。' +
      'メディア研究者のニック・クルドリー（LSE）とウリセス・A・メヒアスが2019年の著書『The Costs of Connection』および同年の論文（Television & New Media 誌）で提唱した。歴史的植民地主義が土地・資源・労働を収奪したのに対し、本概念は「データ関係（data relations）」を介して人間生活そのものを収奪対象とする点を強調する。ショシャナ・ズボフの監視資本主義と問題意識を共有しつつ、(1)資本主義の一段階ではなく長期の歴史的暴力の連続として捉える、(2)北の巨大プラットフォームによる南の人々のデータ収奪というグローバルな権力の非対称性を強調する点に特徴があり、デジタル時代の社会的正義・脱植民地化の議論につながる。',
    keyFigures:
      'ニック・クルドリー（Nick Couldry, LSE）／ウリセス・A・メヒアス（Ulises A. Mejias）（2019『The Costs of Connection』・Television & New Media 20(4):336-349）／対比＝ズボフの監視資本主義',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.1177/1527476418796632', type: 'academic', label: 'Couldry & Mejias, “Data Colonialism: Rethinking Big Data’s Relation to the Contemporary Subject”, Television & New Media 20(4): 336–349 (2019)' },
      { url: 'https://www.sup.org/books/sociology/costs-connection', type: 'academic', label: 'Couldry & Mejias, The Costs of Connection (Stanford University Press, 2019) — 出版社書誌ページ' },
      { url: 'https://eprints.lse.ac.uk/89511/1/Couldry_Data-colonialism_Accepted.pdf', type: 'academic', label: 'LSE Research Online — 同論文の著者最終稿（グローバル・サウス／ズボフとの区別を含む）' },
      { url: 'https://en.wikipedia.org/wiki/Data_colonialism', type: 'reference', label: 'Wikipedia: Data colonialism（概観リファレンス）' },
    ],
  },
  {
    id: 'econ-accelerator-principle',
    discipline: 'economics',
    title: '加速度原理（投資の加速度原理）',
    statement:
      '加速度原理とは、企業の純投資（資本ストックの増加分）が、産出量（需要）の水準ではなくその「変化（増加分）」に比例して決まるとする投資理論である。' +
      '望ましい資本ストックが産出量に比例する（資本係数が一定で資本が完全稼働する）と仮定すると、産出が増えるたびに見合う資本を追加せねばならず、純投資は産出の変化率に依存する。このため産出の増加が鈍化しただけで（減少しなくても）純投資は減少しうるという、投資変動の不安定性・増幅効果を示す。アフタリオン（1909）が分析しJ.M.クラークが1917年に用語を導入、ケインズの乗数と結合した乗数＝加速度モデル（サミュエルソン1939）は投資と所得の相互作用が景気循環を生む仕組みを説明する。',
    keyFigures:
      'アルベール・アフタリオン（Albert Aftalion, 1909）／ジョン・モーリス・クラーク（John Maurice Clark, 1917, 用語提唱）／ポール・サミュエルソン（Paul A. Samuelson, 1939, 乗数＝加速度モデル）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/accelerator-principle', type: 'reference', label: 'Encyclopaedia Britannica — Accelerator principle (economics)' },
      { url: 'https://link.springer.com/rwe/10.1057/978-1-349-95121-5_202-2', type: 'academic', label: 'The New Palgrave Dictionary of Economics — “Acceleration Principle” (Springer Nature)' },
      { url: 'https://cruel.org/econthought/essays/capital/accelerator.html', type: 'reference', label: 'History of Economic Thought — The Aftalion-Clark Accelerator' },
    ],
  },
  {
    id: 'mgmt-jobs-to-be-done',
    discipline: 'management',
    title: 'ジョブ理論（片付けるべき用事）',
    statement:
      '顧客は製品やサービスそのものを欲しているのではなく、生活の中で生じる特定の「用事・仕事（job）」を片付け、達成したい「進歩（progress）」を遂げるために、製品・サービスを「雇用（hire）」するという顧客理解・イノベーションの枠組み。' +
      'セオドア・レビットの「人々は1/4インチのドリルではなく1/4インチの穴を欲する」という発想を発展させ、クレイトン・クリステンセンらが提唱・普及させた。ジョブは機能的・社会的・感情的側面を含む文脈で捉えられ、期待に応えなければ製品は「解雇（fire）」される。市場を製品カテゴリや顧客属性（デモグラフィック）でなく「ジョブ」で再定義する点が核心で、クリステンセンの破壊的イノベーション理論と接続する。有名な事例に「ミルクシェイクのジレンマ」（朝の通勤者が退屈しのぎ・空腹対策にミルクシェイクを雇う）がある。',
    keyFigures:
      'クレイトン・クリステンセン（Clayton Christensen）／タディ・ホール（Taddy Hall）／カレン・ディロン（Karen Dillon）／デイビッド・ダンカン（David S. Duncan）（HBR 2016「Know Your Customers’ Jobs to Be Done」・著書『Competing Against Luck』2016）／源流＝セオドア・レビット',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/2016/09/know-your-customers-jobs-to-be-done', type: 'academic', label: "Christensen, Hall, Dillon & Duncan, “Know Your Customers’ ‘Jobs to Be Done’,” Harvard Business Review, vol.94 no.9 (Sept 2016), pp.54-62" },
      { url: 'https://www.christenseninstitute.org/theory/jobs-to-be-done/', type: 'reference', label: 'Clayton Christensen Institute — Jobs to Be Done Theory（解説ページ）' },
      { url: 'https://www.hbs.edu/faculty/Pages/item.aspx?num=51553', type: 'academic', label: "Harvard Business School Faculty & Research — “Know Your Customers’ ‘Jobs to Be Done’” 書誌情報（R1609D）" },
    ],
  },
  {
    id: 'human-spotlight-effect',
    discipline: 'human-science',
    title: 'スポットライト効果',
    statement:
      '人が自分の外見・言動・失敗などを、実際よりも他者に注目され気づかれていると過大に見積もる傾向で、自己中心性バイアス（egocentric bias）の一種である。あたかも自分にスポットライトが当たっているかのように周囲が自分へ注意を払っていると感じるが、実際には他者はそれほど気にしていない。' +
      '心理学者トーマス・ギロヴィッチ、ヴィクトリア・H・メドヴェック、ケネス・サヴィツキーが命名し、Gilovich, Medvec & Savitsky (2000, Journal of Personality and Social Psychology 78(2):211-222) で実証した。目立つTシャツ着用者は気づいた観察者数を大幅に過大評価した。原因は自分の主観的経験を起点とし他者視点への調整が不十分な「アンカリングと不十分な調整」とされ、透明性の錯覚や社会不安・自意識とも関連する。',
    keyFigures:
      'トーマス・ギロヴィッチ（Thomas Gilovich）／ケネス・サヴィツキー（Kenneth Savitsky）／ヴィクトリア・H・メドヴェック（Victoria H. Medvec）（2000 JPSP 78(2):211-222）',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.1111/1467-8721.00039', type: 'academic', label: 'Gilovich & Savitsky (1999), The Spotlight Effect and the Illusion of Transparency, Current Directions in Psychological Science' },
      { url: 'https://www.ebsco.com/research-starters/psychology/spotlight-effect', type: 'reference', label: 'EBSCO Research Starters — Spotlight effect (Psychology)' },
      { url: 'https://en.wikipedia.org/wiki/Spotlight_effect', type: 'reference', label: 'Wikipedia — Spotlight effect' },
    ],
  },
  {
    id: 'human-sleeper-effect',
    discipline: 'human-science',
    title: 'スリーパー効果（眠り効果）',
    statement:
      'スリーパー効果（sleeper effect）は、説得的メッセージの効果が時間とともに逆説的に増大する社会心理学・コミュニケーション研究上の現象である。信頼性の低い情報源や「割引手がかり（discounting cue）」を伴うメッセージは、受信直後は情報源への不信から説得効果が抑えられるが、数日から数週間が経つと、メッセージ内容は記憶に残る一方で情報源との結びつき（割引手がかり）が忘却・解離されるため、かえって態度変容が強まる。' +
      '第二次大戦中、カール・ホヴランドらが米軍の「Why We Fight」宣伝映画の兵士への効果を調べた研究に起源を持ち、Hovland & Weiss（1951）の情報源信頼性実験で定式化された。説明は「割引手がかり仮説」。ただし再現は難しく、メッセージが強い初期影響を持ち割引手がかりがメッセージの後に提示される等の厳密な条件下でのみ確実に生じる（Pratkanis ら 1988、Kumkale & Albarracín 2004 のメタ分析）。',
    keyFigures:
      'カール・ホヴランド（Carl Hovland）／ウォルター・ワイス（Walter Weiss）（1951）／アンソニー・プラトカニス＆アンソニー・グリーンワルド（1988, 再現条件）／Kumkale & Albarracín（2004, メタ分析）／割引手がかり仮説',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100511546', type: 'reference', label: 'Oxford Reference「Sleeper effect」(定義・相対/絶対効果・Hovland & Weiss 1951 初出)' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/sleeper-effects', type: 'reference', label: 'Encyclopedia.com「Sleeper Effects」(WWII「Why We Fight」起源・割引手がかり/解離説)' },
      { url: 'https://faculty.washington.edu/agg/pdf/Pratkanis&GLB.JPSP.1988.pdf', type: 'academic', label: 'Pratkanis, Greenwald, Leippe & Baumgardner (1988) JPSP 54(2):203-218 (再現条件・割引手がかり理論)' },
      { url: 'https://socialactionlab.org/wp-content/uploads/2024/01/Kumkale_The-Sleeper-Effect-in-Persuasion-A-Meta-Analytic-Review_2004.pdf', type: 'academic', label: 'Kumkale & Albarracín (2004) Psychological Bulletin 130(1):143-172 メタ分析 (効果の境界条件)' },
    ],
  },
  {
    id: 'bizlaw-revolving-mortgage',
    discipline: 'business-law',
    title: '根抵当権（民法398条の2）',
    statement:
      '根抵当権とは、一定の範囲に属する不特定の債権を、極度額の限度において担保する抵当権である（民法398条の2第1項）。通常の抵当権（民法369条）が特定の債権を担保し、その債権が弁済等で消滅すれば付従性により抵当権も消滅するのに対し、根抵当権は銀行と企業の当座貸越・手形割引など継続的取引から生じる増減変動する多数の債権を、いちいち設定し直すことなく極度額の枠内で一括して担保する。' +
      '被担保債権の範囲は「債務者との特定の継続的取引契約によって生ずるもの」等に限定して定めねばならず、包括根抵当は禁止される（同条2項）。元本が確定するまでは個々の債権が弁済されても根抵当権は消滅せず、債権が譲渡されても移転しない（付従性・随伴性の否定）。確定期日の到来や取引終了等で「元本の確定」が生じるとその時点の債権額に固定され、以後は通常の抵当権に近い扱いとなる。',
    keyFigures:
      '根拠条文＝民法398条の2（e-Gov law id 129AC0000000089）／担保対象＝一定の範囲に属する不特定の債権を極度額の限度で担保（包括根抵当は禁止・同条2項）／確定前の特徴＝付従性・随伴性の否定（弁済・債権譲渡で消滅・移転しない）／元本確定＝確定期日到来・取引終了等で債権額が固定／通常の抵当権（369条）との違い＝増減変動する不特定債権を一括担保／典型用途＝継続的・反復的な与信取引',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 — 民法（明治二十九年法律第八十九号、第398条の2 根抵当権）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0398-02/', type: 'media', label: 'クレアール司法書士講座 — 民法第398条の2【根抵当権】条文解説' },
      { url: 'https://ja.wikipedia.org/wiki/根抵当権', type: 'reference', label: 'Wikipedia — 根抵当権（元本確定前の付従性・随伴性の否定）' },
    ],
  },
  {
    id: 'infosoc-collective-intelligence',
    discipline: 'information-sociology',
    title: '集合知（collective intelligence）',
    statement:
      '集合知とは、多数の個人やエージェント（ときに人とコンピュータの集団）の知識・判断・行動が、協働・競争・集約を通じて、個々の構成員の能力を超える知性や問題解決能力として立ち現れる現象である。' +
      'MITの集合知センター（トーマス・マローンら）は「個人やコンピュータの集団が、知的に見える形で集合的に行動すること」と捉える。ピエール・レヴィ（1994）のサイバースペース論や、スロウィッキー（2004『みんなの意見は案外正しい』）の「群衆の知恵」（多様性・独立性・分散性・集約という条件が揃えば群衆の推定が専門家を上回る／ゴルトンの雄牛の体重当ての逸話）に源流をもつ。ウィキペディア・オープンソース・予測市場・クラウドソーシング・市民科学が応用例だが、条件が崩れると集団極性化・集団思考・エコーチェンバーによる「群衆の愚かさ」も生じる。ウーリーら（Science, 2010）は小集団の集合的知能因子（c factor）を実証した。',
    keyFigures:
      'トーマス・マローン（Thomas W. Malone, MIT CCI）／ピエール・レヴィ（Pierre Lévy, 1994）／ジェームズ・スロウィッキー（James Surowiecki, 2004）／フランシス・ゴルトン（Francis Galton）／アニタ・ウーリー（Anita W. Woolley, 2010 Science, c factor）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Collective_intelligence', type: 'reference', label: 'Wikipedia「Collective intelligence」（定義・群衆の知恵・条件・応用・失敗モード）' },
      { url: 'https://www.science.org/doi/10.1126/science.1193147', type: 'academic', label: 'Woolley, Chabris, Pentland, Hashmi & Malone, “Evidence for a Collective Intelligence Factor in the Performance of Human Groups,” Science 330(6004):686–688 (2010)' },
      { url: 'https://mitsloan.mit.edu/ideas-made-to-matter/lets-choose-collective-intelligence-over-madness-mobs', type: 'academic', label: 'MIT Sloan / MIT Center for Collective Intelligence — collective intelligence vs. the madness of mobs' },
    ],
  },
  {
    id: 'econ-triffin-dilemma',
    discipline: 'economics',
    title: 'トリフィンのジレンマ',
    statement:
      'トリフィンのジレンマとは、一国の通貨（米ドル）が国際的な基軸通貨（準備通貨）として用いられる体制において、その発行国が直面する短期的な国内金融政策目標と長期的な国際的目標の間の構造的な利益相反である。' +
      '基軸通貨国は世界の流動性需要（各国の準備・貿易決済）を満たすため、国際収支赤字を通じて自国通貨を国外へ供給し続けねばならないが、その対外債務の累積はやがて通貨価値（金兌換性）への信認を損ない、基軸通貨としての地位を脅かす。経済学者ロバート・トリフィンが1960年の著書『Gold and the Dollar Crisis』でブレトンウッズ体制（金ドル本位制）を分析して提示し、1959年の米議会証言での予見は1971年のニクソン・ショックで現実化した。',
    keyFigures:
      'ロバート・トリフィン（Robert Triffin、1911-1993、ベルギー系米国の経済学者）／著書『Gold and the Dollar Crisis』（1960）／1959年10月 米連邦議会・合同経済委員会（Joint Economic Committee）証言／流動性供給と信認維持の両立不能',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ecb.europa.eu/press/key/date/2011/html/sp111003.en.html', type: 'government', label: '欧州中央銀行（ECB）「The Triffin dilemma revisited」(2011) — 中央銀行による講演' },
      { url: 'https://www.elibrary.imf.org/view/journals/024/1961/001/article-A001-en.xml', type: 'academic', label: 'IMF Staff Papers (1961)「Professor Triffin on International Liquidity and the Role of the Fund」' },
      { url: 'https://www.nber.org/system/files/working_papers/w24195/w24195.pdf', type: 'academic', label: 'Michael D. Bordo「Triffin: Dilemma or Myth?」NBER Working Paper No.24195' },
      { url: 'https://www.federalreservehistory.org/essays/gold-convertibility-ends', type: 'government', label: '米連邦準備制度（Federal Reserve History）「Nixon Ends Convertibility of U.S. Dollars to Gold」（1971ニクソン・ショック）' },
    ],
  },
  {
    id: 'mgmt-amoeba-management',
    discipline: 'management',
    title: 'アメーバ経営（稲盛和夫）',
    statement:
      'アメーバ経営は、京セラ創業者・稲盛和夫が1960年代初頭に考案・実践した管理会計手法であり、大組織を「アメーバ」と呼ぶ独立採算の小集団（一般に5〜50人、現場では6〜7人規模が中核単位）に細分化し、各アメーバがリーダーを中心に自部門の収支に責任を持ち、市場に直結した中小企業のように自主的な採算管理を行う。' +
      '中核指標は「時間当たり採算（＝(売上−経費)÷総労働時間）」で、全社員が時間当り採算表をもとにリアルタイムで採算を把握し、収益向上と経費削減に主体的に取り組む。狙いは(1)市場直結の部門別採算管理、(2)経営者意識を持つ人材の育成、(3)全員参加経営であり、京セラフィロソフィと一体で運用される。KDDIや、2010年破綻後の日本航空（JAL）再建にも導入されたことで知られ、管理会計研究の対象ともなっている。',
    keyFigures:
      '稲盛和夫（Kazuo Inamori, 京セラ創業者）／京セラ（Kyocera）／KDDI（旧第二電電・DDI）／日本航空（JAL）再建／中核指標＝時間当たり採算',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Amoeba_Management', type: 'reference', label: 'Amoeba Management — Wikipedia（英語版百科事典）' },
      { url: 'https://link.springer.com/content/pdf/10.1007/978-981-19-3398-1_6', type: 'academic', label: 'Amoeba Management and Hourly Profit System (AMS) — Springer Nature（学術書チャプター）' },
      { url: 'https://www.fpu.ac.jp/rire/publication/regular/001363_d/fil/file_7.pdf', type: 'academic', label: '「京セラのアメーバ経営」福井県立大学 地域経済研究所 紀要' },
      { url: 'https://global.kyocera.com/inamori/about/manager/amoeba/', type: 'reference', label: 'Amoeba Management — Official Site of Kazuo Inamori / Kyocera（一次・公式解説）' },
    ],
  },
  {
    id: 'human-illusion-of-transparency',
    discipline: 'human-science',
    title: '透明性の錯覚',
    statement:
      '透明性の錯覚（illusion of transparency）とは、人が自分の内的状態（緊張・不安・隠している本心・うそ・好意・嫌悪など）を、実際よりも他者に見透かされている・伝わっていると過大に見積もる社会心理学上の認知バイアスである。自分は自分の内面を強く意識しているため、その内的経験が外部に「漏れて」透けて見えると錯覚するが、実際には他者はそこまで読み取れていない。' +
      'ギロヴィッチ・サヴィツキー・メドヴェック（1998, JPSP 75:332-346）はうそをついた話者が発覚度を過大評価し、嫌悪を感じた人がそれが顔に出ていると過大視することを実証した。原因は自分の豊かな現象的経験を起点（アンカー）とし他者視点への調整が不十分な「アンカリングと不十分な調整」で、注目を過大視するスポットライト効果と姉妹的な自己中心性バイアスとされる。スピーチ不安の緩和（「緊張は思うほど伝わらない」と知ると不安が減る）への応用も報告される。',
    keyFigures:
      'トーマス・ギロヴィッチ（Thomas Gilovich）／ケネス・サヴィツキー（Kenneth Savitsky）／ヴィクトリア・H・メドヴェック（Victoria Husted Medvec）（1998 JPSP 75:332-346）／スポットライト効果と姉妹概念',
    asOf: '2026-06',
    sources: [
      { url: 'https://psycnet.apa.org/doi/10.1037/0022-3514.75.2.332', type: 'academic', label: "Gilovich, Savitsky & Medvec (1998). The Illusion of Transparency. Journal of Personality and Social Psychology, 75(2), 332-346." },
      { url: 'https://journals.sagepub.com/doi/abs/10.1111/1467-8721.00039', type: 'academic', label: 'Gilovich & Savitsky (1999). The Spotlight Effect and the Illusion of Transparency. Current Directions in Psychological Science, 8(6), 165-168.' },
      { url: 'https://en.wikipedia.org/wiki/Illusion_of_transparency', type: 'reference', label: 'Wikipedia — Illusion of transparency' },
    ],
  },
  {
    id: 'human-cognitive-miser',
    discipline: 'human-science',
    title: '認知的倹約家（cognitive miser）',
    statement:
      '人間は注意・処理能力・時間といった認知資源に限りがあるため、複雑で網羅的な情報処理を避け、ヒューリスティック・ステレオタイプ・スキーマ・スクリプトといった単純で省力的な思考方略に頼って社会的な知覚・判断・意思決定を行う、とする社会的認知の人間観・メタファーである。' +
      '社会心理学者スーザン・フィスクとシェリー・テイラーが1984年の著書『社会的認知（Social Cognition）』で命名・普及させた。人は合理的に情報を集め因果を分析するとした従来の「素朴な科学者（naïve scientist、Heider 1958）」観に対し、人は正確さより効率（労力の節約）を優先する「ケチ」だとした。認知バイアスやステレオタイプが生じる基盤を説明し、後に文脈や動機に応じて省力的処理と精緻な処理を使い分ける「動機づけられた戦術家（motivated tactician、1991）」モデルへ発展、二重過程理論の土台ともなった。',
    keyFigures:
      'スーザン・T・フィスク（Susan T. Fiske）／シェリー・E・テイラー（Shelley E. Taylor）（1984『Social Cognition』）／フリッツ・ハイダー（Fritz Heider, naïve scientist の先行観）／後継＝動機づけられた戦術家(1991)',
    asOf: '2026-06',
    sources: [
      { url: 'https://dictionary.apa.org/cognitive-miser', type: 'reference', label: 'APA Dictionary of Psychology — “cognitive miser”（米国心理学会）' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803095622297', type: 'reference', label: 'Oxford Reference — “cognitive miser”（オックスフォード大学出版局）' },
      { url: 'https://en.wikipedia.org/wiki/Cognitive_miser', type: 'reference', label: 'Wikipedia — “Cognitive miser”（Fiske & Taylor 1984 起源・naïve scientist／motivated tactician 系譜）' },
    ],
  },
  {
    id: 'bizlaw-real-subrogation',
    discipline: 'business-law',
    title: '物上代位（民法304条）',
    statement:
      '物上代位とは、担保物権（先取特権・質権・抵当権）の効力が、目的物の売却・賃貸・滅失・損傷等によって目的物の所有者（債務者）が受けるべき金銭その他の物（売却代金・賃料・保険金・損害賠償金等）に対しても及ぶことをいう。担保物権は目的物の「交換価値」を把握する権利であるため、目的物が形を変えて金銭債権等の価値代替物に転化しても、その代替物に効力を及ぼして優先弁済を受けられる。' +
      '根拠は民法304条で、同条は先取特権について定め、質権は350条、抵当権は372条で準用する。重要な要件として、担保権者はその払渡しまたは引渡しの「前に」代位物たる債権を差し押さえなければならない（304条1項ただし書）。この差押えの趣旨（第三債務者保護・特定性維持・優先権保全）には学説・判例上の議論があり、判例は第三債務者保護を中心に据える。典型例は抵当不動産焼失時の火災保険金請求権、賃貸中の不動産の賃料債権への物上代位（最高裁が肯定）である。',
    keyFigures:
      '根拠条文＝先取特権 民法304条／質権は350条で準用・抵当権は372条で準用（e-Gov law id 129AC0000000089）／対象＝売却代金・賃料・保険金・損害賠償金等の価値代替物／要件＝払渡し・引渡しの前の差押え（304条1項ただし書）／差押えの趣旨は第三債務者保護説等で議論／典型例＝火災保険金請求権・賃料債権（最高裁が肯定）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第304条・第350条・第372条' },
      { url: 'https://www.ritsumei.ac.jp/acd/cg/law/lex/15-1/005%20ikuma.pdf', type: 'academic', label: '生熊長幸「物上代位における第三債務者保護説および優先権保全説の再構成」立命館法学' },
      { url: 'https://ja.wikibooks.org/wiki/民法第304条', type: 'reference', label: 'Wikibooks 民法第304条（条文・解説）' },
      { url: 'https://yuhikaku.com/articles/-/14857', type: 'academic', label: '有斐閣Online「抵当権の物上代位（1）」' },
    ],
  },
  {
    id: 'infosoc-algorithmic-governance',
    discipline: 'information-sociology',
    title: 'アルゴリズムによる統治（アルゴクラシー）',
    statement:
      'アルゴリズムによる統治（algorithmic governance）とは、社会秩序の形成・行動の調整・意思決定・公共サービス提供といった「統治」機能が、データ駆動・機械学習システムを含むアルゴリズムによって媒介・自動化・遂行される現象と、それを分析・規範評価する研究枠組みである。行政や司法（再犯予測・与信・福祉給付の自動判定）、プラットフォームの行動規制（コンテンツモデレーション・ランキング）、スマートシティ等で具体化する。' +
      'ジョン・ダナハーは、アルゴリズムにより構造化された統治体系を「アルゴクラシー（algocracy）」と呼び、それが人間の参加・理解を狭め公的意思決定の正統性を脅かす「正統性の問題」を論じた。論点は不透明性（ブラックボックス）・説明責任・自動化バイアス・差別と公平性・異議申立ての余地・民主的正統性であり、ティム・オライリーの「アルゴリズム規制」やルーヴロワの「アルゴリズム的統治性」（フーコー統治性の応用）も主要な系譜である。',
    keyFigures:
      'ジョン・ダナハー（John Danaher、アルゴクラシー・正統性の問題）／ティム・オライリー（Tim O’Reilly、アルゴリズム規制）／アントワネット・ルーヴロワ（Antoinette Rouvroy、アルゴリズム的統治性）／カレン・ユング（Karen Yeung）',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/full/10.1177/2053951717726554', type: 'academic', label: 'Danaher et al., “Algorithmic governance: Developing a research agenda through the power of collective intelligence,” Big Data & Society (2017)' },
      { url: 'https://philpapers.org/rec/DANTTO-13', type: 'academic', label: 'John Danaher, “The Threat of Algocracy: Reality, Resistance and Accommodation,” Philosophy & Technology (2016)' },
      { url: 'https://beyondtransparency.org/chapters/part-5/open-data-and-algorithmic-regulation/', type: 'reference', label: 'Tim O’Reilly, “Open Data and Algorithmic Regulation,” Beyond Transparency (2013)' },
      { url: 'https://shs.cairn.info/article/E_RES_177_0163?lang=en', type: 'academic', label: 'Antoinette Rouvroy & Thomas Berns, “Algorithmic governmentality and prospects of emancipation,” Réseaux (2013)' },
    ],
  },
  {
    id: 'econ-input-output-analysis',
    discipline: 'economics',
    title: '産業連関分析（投入産出分析）',
    statement:
      '一国（や地域）の経済を構成する諸産業が相互に財・サービスを投入し産出し合う依存関係を、行列形式の産業連関表（投入産出表）で体系的に捉え、ある産業や最終需要の変化が経済全体に波及する効果を定量化する分析手法。経済学者ワシリー・レオンチェフが1930年代に開発し、1941年に米国経済の最初の産業連関表（1919–1929年）を著書で公表した。' +
      '中核は、各産業の産出が他産業の投入として用いられる構造を表す投入係数行列Aと、最終需要の変化が各産業の生産をどれだけ誘発するかを示すレオンチェフ逆行列(I−A)⁻¹であり、x=(I−A)⁻¹f により生産波及・雇用誘発・経済波及効果を算出できる。規模に関して収穫一定・投入係数一定（線形）を前提とし、一般均衡を実証的・計算可能にした点で画期的。この功績でレオンチェフは1973年にノーベル経済学賞を受賞し、各国の国民経済計算や環境（CO2）・地域経済波及の分析に広く応用される。',
    keyFigures:
      'ワシリー・レオンチェフ（Wassily Leontief、1905–1999、投入産出法の開発者、1973年ノーベル経済学賞）／投入係数行列 A・レオンチェフ逆行列 (I−A)⁻¹',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1973/press-release/', type: 'government', label: 'NobelPrize.org — The Prize in Economic Sciences 1973 (Wassily Leontief, 授賞理由・press release)' },
      { url: 'https://www.britannica.com/money/Wassily-Leontief', type: 'reference', label: 'Encyclopaedia Britannica — Wassily Leontief: Input-Output Analysis' },
      { url: 'https://www.econlib.org/library/Enc/bios/Leontief.html', type: 'reference', label: 'The Concise Encyclopedia of Economics (Econlib) — Wassily Leontief' },
      { url: 'https://www.sciencedirect.com/topics/economics-econometrics-and-finance/input-output-model', type: 'academic', label: 'ScienceDirect Topics — Input-Output Model（投入係数・(I−A)⁻¹・収穫一定の前提）' },
    ],
  },
  {
    id: 'mgmt-service-blueprint',
    discipline: 'management',
    title: 'サービス・ブループリント',
    statement:
      'サービス・ブループリント（service blueprint、サービス設計図）とは、サービスの提供プロセスを顧客の行動と、それを支える従業員・システムの活動とともに時系列で可視化する設計・分析ツール（図）である。' +
      '銀行幹部G・リン・ショスタックが1984年のHarvard Business Review論文「Designing Services That Deliver」で提唱した。無形で生産と消費が同時に起こり設計が難しいサービスを、製造業の設計図のように構成要素と相互作用として図示する。標準的には(1)物理的証拠、(2)顧客の行動、(3)フロントステージ（顧客に見える接客従業員の行動）、(4)バックステージ（顧客に見えない従業員の行動）、(5)支援プロセスの5行で構成し、相互作用の境界線・可視の境界線・内部相互作用の境界線で区切る。失敗が起きうる点（fail point）も書き込み、サービスの理解共有・改善・新サービス開発・顧客体験設計に用いる。',
    keyFigures:
      'G・リン・ショスタック（G. Lynn Shostack、1984 HBR「Designing Services That Deliver」）／メアリー・ジョー・ビトナー＆エイミー・オストロム＆フェリシア・モーガン（Bitner, Ostrom & Morgan, 2008, 現代型5行モデルの定式化）',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/1984/01/designing-services-that-deliver', type: 'academic', label: 'G. Lynn Shostack, “Designing Services That Deliver,” Harvard Business Review 62(1), 1984, pp.133-139（原典）' },
      { url: 'https://www.nngroup.com/articles/service-blueprints-definition/', type: 'reference', label: 'Nielsen Norman Group「Service Blueprints: Definition」（5構成要素と3境界線の定義）' },
      { url: 'https://en.wikipedia.org/wiki/Service_blueprint', type: 'reference', label: 'Wikipedia「Service blueprint」（起源・構成要素・物理的証拠・fail point）' },
      { url: 'https://www.researchgate.net/publication/215915405_Service_Blueprinting_A_Practical_Technique_for_Service_Innovation', type: 'academic', label: 'Bitner, Ostrom & Morgan, “Service Blueprinting: A Practical Technique for Service Innovation,” California Management Review 50(4), 2008, pp.66-94' },
    ],
  },
  {
    id: 'human-ego-depletion',
    discipline: 'human-science',
    title: '自我消耗（エゴ・ディプリーション）',
    statement:
      '自我消耗とは、自己制御（セルフコントロール）や意志力が筋肉のように「使うと一時的に枯渇する有限の資源」であり、ある課題で自己制御を行使するとその後の別課題での遂行が低下するとする仮説（強さモデル strength model of self-control）。R・バウマイスターらが1998年（JPSP）で提唱し、代表的な二重課題（sequential-task）では、クッキーを我慢してラディッシュを食べた群が後続の難パズルへの忍耐を早く諦めた（持続時間が約21分→約8分）。' +
      '後にグルコース（血糖）を意志力の資源とする説も示されたが、生物学的妥当性が批判された。さらに2010年代の再現性の危機において、Carter & McCullough（2014）は出版バイアスにより効果（先行メタ分析d=0.62）が過大評価されていると指摘し、Hagger et al.（2016）の23研究室・約2141名による事前登録の多施設追試では効果がほぼゼロ（d=0.04, 95%CI[-0.07, 0.15]）であった。効果の存否・大きさ・機序は現在も論争中である。',
    keyFigures:
      'ロイ・バウマイスター（Roy Baumeister）／マーク・ムラベン（Mark Muraven）／ダイアン・タイス（Dianne Tice）（1998 JPSP, 強さモデル）／批判: マーティン・ハガー（Hagger et al. 2016 多施設追試）・エヴァン・カーター（Carter & McCullough 2014 出版バイアス）',
    asOf: '2026-06',
    sources: [
      { url: 'http://faculty.washington.edu/jdb/345/345%20Articles/Baumeister%20et%20al.%20(1998).pdf', type: 'academic', label: 'Baumeister, Bratslavsky, Muraven & Tice (1998) “Ego Depletion: Is the Active Self a Limited Resource?” J. Personality and Social Psychology 74(5), 1252-1265（原典PDF）' },
      { url: 'https://journals.sagepub.com/doi/10.1177/1745691616652873', type: 'academic', label: 'Hagger et al. (2016) “A Multilab Preregistered Replication of the Ego-Depletion Effect” Perspectives on Psychological Science 11(4)（効果ほぼゼロ）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/25126083/', type: 'academic', label: 'Carter & McCullough (2014) “Publication bias and the limited strength model of self-control” Frontiers in Psychology' },
      { url: 'https://en.wikipedia.org/wiki/Ego_depletion', type: 'reference', label: 'Wikipedia「Ego depletion」（概説・再現性論争の整理）' },
    ],
  },
  {
    id: 'bizlaw-public-order',
    discipline: 'business-law',
    title: '公序良俗（民法90条）',
    statement:
      '公序良俗（公の秩序又は善良の風俗）とは、社会の一般的秩序と道徳観念を指し、これに反する法律行為（契約等）を無効とする民法の基本原則である（民法90条）。私的自治の原則に対する一般的・最終的な制約として機能し、強行法規違反に至らない場合でも、社会的妥当性を欠く契約を無効にする受け皿となる。' +
      '2017年改正（債権法改正）後の90条は「公の秩序又は善良の風俗に反する法律行為は、無効とする。」と定める。改正前は「公ノ秩序又ハ善良ノ風俗ニ反スル事項ヲ目的トスル法律行為ハ無効トス」とされており、改正で「事項を目的とする」の文言が削除され、行為の内容のみならず動機の不法や締結に至る過程・事情も含めて柔軟に判断できることが明確化された。賭博、愛人契約、人身売買的契約、暴利行為（相手の窮迫・無経験等に乗じ著しく過大な利益を得る契約）、著しく射幸的な契約、談合などが公序良俗違反として無効とされてきた。',
    keyFigures:
      '根拠条文＝民法90条／現行文言「公の秩序又は善良の風俗に反する法律行為は、無効とする。」／効果＝法律行為の無効／2017年改正で「事項を目的とする」を削除（動機の不法等を含め柔軟に判断）／典型例＝賭博・愛人契約・暴利行為・人身売買的契約・談合／位置づけ＝信義則(1条2項)・権利濫用の禁止(1条3項)と並ぶ一般条項',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号、law id 129AC0000000089）第90条' },
      { url: 'https://ja.wikibooks.org/wiki/民法第90条', type: 'reference', label: 'Wikibooks 民法第90条（条文・改正経緯の解説）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0090-00/', type: 'media', label: 'クレアール司法書士講座 民法第90条【公序良俗】' },
    ],
  },
  {
    id: 'bizlaw-mental-reservation',
    discipline: 'business-law',
    title: '心裡留保（民法93条）',
    statement:
      '心裡留保とは、表意者が自分の真意（内心の意思）と表示が食い違うことを自分で知りながら（わざと）行う意思表示をいう（民法93条）。たとえば贈与する気がないのに冗談で「この時計をあげる」と言う場合がこれにあたる。原則として、心裡留保による意思表示は、表意者が真意でないことを知ってしたときであっても、そのためにその効力を妨げられない＝有効である（93条1項本文）。これは、わざと真意と異なる表示をした表意者の保護よりも、表示を信頼した相手方の保護と取引の安全を優先する趣旨である。' +
      'ただし、相手方がその意思表示が表意者の真意ではないことを知り（悪意）、又は知ることができたとき（有過失）は、その意思表示は無効となる（93条1項ただし書）。さらに、このただし書による無効は善意の第三者に対抗することができない（93条2項）。これらは2017年成立・2020年4月1日施行の改正で文言整理および第三者保護規定として明文化された。相手方と通じて行う通謀虚偽表示（94条、当事者間では常に無効）や、真意と表示の食い違いに気づいていない錯誤（95条、改正で取消し事由に変更）と対比される、意思の不存在・瑕疵ある意思表示の一類型である。',
    keyFigures:
      '根拠条文＝民法93条（e-Gov law id 129AC0000000089）／原則＝真意でないと知ってしても有効（93条1項本文）／例外＝相手方が悪意または有過失なら無効（同ただし書）／93条2項＝無効は善意の第三者に対抗不可／2017年成立・2020年4月施行で第三者保護を新設／対比＝通謀虚偽表示(94条)・錯誤(95条)',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第93条' },
      { url: 'https://tek-law.jp/civil-code/general-provisions/juridical-acts/manifestations-of-intention/article-93/', type: 'reference', label: '民法第93条（心裡留保）条文・解説（tek-law）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第93条', type: 'reference', label: 'Wikibooks 民法第93条（条文・2017年改正）' },
    ],
  },
  {
    id: 'infosoc-dark-patterns',
    discipline: 'information-sociology',
    title: 'ダークパターン（欺瞞的デザイン）',
    statement:
      'ダークパターン（dark patterns）とは、ウェブサイトやアプリのユーザーインターフェース（UI）に意図的に組み込まれ、利用者を欺き・操作・誘導して、本来しないはずの行動（不要な購入、サブスク登録、個人情報の過剰提供、解約の断念など）を取らせる設計上の手口を指す。UXデザイナーのハリー・ブリヌル（Harry Brignull）が2010年に造語し当初の類型を整理した（現在は中立的に「欺瞞的デザイン deceptive design」とも呼ばれる）。' +
      '代表的類型に、こっそり（sneaking、隠れた費用・無断のカゴ追加）、偽の緊急性・希少性、確認シェイミング（confirmshaming）、妨害（ローチモーテル＝登録は容易だが解約困難）、強制、誘導的初期設定や視覚的干渉（misdirection、プリチェック同意）があり、プライバシー領域でも問題視される。透明で利用者の利益に資する「ナッジ」とは異なり、利用者の自律性を損なう操作である点が本質。OECD・米FTC・EU（DSA第25条が禁止）・日本（消費者庁／特定商取引法のサブスク規制）が規制・報告を進める。',
    keyFigures:
      'ハリー・ブリヌル（Harry Brignull、概念の提唱者・2010年造語）／OECD（2022「Dark commercial patterns」報告）／米FTC（2022「Bringing Dark Patterns to Light」報告）／EU（Digital Services Act 第25条で禁止）／日本・消費者庁',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oecd.org/content/dam/oecd/en/publications/reports/2022/10/dark-commercial-patterns_9f6169cd/44f5e846-en.pdf', type: 'government', label: 'OECD (2022) “Dark commercial patterns”, OECD Digital Economy Papers No.336' },
      { url: 'https://www.ftc.gov/reports/bringing-dark-patterns-light', type: 'government', label: 'U.S. Federal Trade Commission (2022) “Bringing Dark Patterns to Light”' },
      { url: 'https://www.deceptive.design/', type: 'reference', label: 'Harry Brignull, Deceptive Design (旧 darkpatterns.org, 2010〜) 概念の一次情報源' },
      { url: 'https://en.wikipedia.org/wiki/Dark_pattern', type: 'reference', label: 'Wikipedia「Dark pattern」（DSA・CPRA等の規制状況含む）' },
    ],
  },
  {
    id: 'econ-slutsky-decomposition',
    discipline: 'economics',
    title: 'スルツキー分解（代替効果と所得効果）',
    statement:
      'ある財の価格変化による需要量の変化（価格効果・全部効果）を、代替効果と所得効果の2つに分解する分析手法。代替効果は相対価格の変化により相対的に安くなった財へ需要が振り替わる効果で通常財・劣等財を問わず常に価格と逆方向（価格下落で増加）、所得効果は価格変化に伴う実質購買力の変化が需要に及ぼす効果で、正常財では需要を増やし劣等財では減らす。劣等財のうち所得効果が代替効果を上回る特殊例が、価格下落で需要が減るギッフェン財である。' +
      'ロシアの経済学者・統計学者エフゲニー・スルツキーが1915年の論文「消費者の家計の理論について」（伊・Giornale degli Economisti誌）で定式化した。スルツキー方程式は、マーシャル需要（非補償需要）の価格反応を補償需要の代替項と所得項に分けて数式表現する。補償の基準が異なる点でヒックス分解と対比され、スルツキーは「当初の購入量（元の消費バンドル）を買える購買力」を一定に保つのに対し、ヒックスは効用水準を一定に保つ。需要曲線が右下がりになる理由やギッフェン財・需要法則の例外を理解する基礎。',
    keyFigures:
      'エフゲニー・スルツキー（Eugen/Evgeny Slutsky、1915年「Sulla teoria del bilancio del consumatore」で定式化）／ジョン・ヒックス＆R.G.D.アレン（1930年代に効用一定の補償需要に基づくヒックス分解として再発見・普及）／ギッフェン財・劣等財との関連',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Slutsky_equation', type: 'reference', label: 'Wikipedia — Slutsky equation（価格効果＝代替効果＋所得効果、劣等財・ギッフェン財）' },
      { url: 'https://socialsci.libretexts.org/Bookshelves/Economics/Intermediate_Microeconomics_with_Excel_(Barreto)/04:_Compartive_Statics/4.06:_Income_and_Substitution_Effects', type: 'academic', label: 'LibreTexts, Intermediate Microeconomics — Income and Substitution Effects（Slutsky補償＝元のバンドル基準とHicks補償＝効用一定の対比）' },
      { url: 'https://hal.science/hal-01771851', type: 'academic', label: "Chipman & Lenfant, “Slutsky's 1915 Article”（HAL／History of Political Economy 査読論文：1915年 Giornale degli Economisti 掲載とヒックス＝アレンによる再発見）" },
      { url: 'https://econ.ucsb.edu/~tedb/Courses/GraduateTheoryUCSB/Slutsky.pdf', type: 'academic', label: 'UC Santa Barbara (T. Bergstrom) — Relating Marshallian and Hicksian Demand（スルツキー方程式の導出）' },
    ],
  },
  {
    id: 'mgmt-dynamic-pricing',
    discipline: 'management',
    title: 'ダイナミック・プライシング',
    statement:
      'ダイナミック・プライシング（動的価格設定）とは、財・サービスの価格を固定せず、需要と供給・時間帯・在庫・競合価格などの変動要因に応じてリアルタイムまたは頻繁に変更する、レベニュー・マネジメントの価格戦略である。' +
      '通常はピーク需要時に値上げし、需要低下や供給過剰時に値下げすることで収益や設備稼働率の最大化を図る。学術的基礎は1978年の米国航空規制緩和を機に発達したレベニュー・マネジメント（イールド・マネジメント）にあり、需要予測に基づき限られた在庫を異なる価格帯の顧客へ最適配分する。価格差別の一形態とも位置づけられ、航空券・ホテル・ライドシェア（Uberのサージ・プライシング）・チケット・ECのアルゴリズム価格で広く用いられる。一方、同一商品の価格が人や時で異なることへの消費者の公平感を損ない反発を招くリスクも論じられる。',
    keyFigures:
      'レベニュー・マネジメント／イールド・マネジメント（航空業界で発達）／サージ・プライシング（Uber）／価格差別の一形態／American Airlines（先駆）／1978年 米国航空規制緩和',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/what-is-dynamic-pricing', type: 'reference', label: 'Britannica Money — Dynamic Pricing & Surge Pricing: How Does It Work?' },
      { url: 'https://www.ebsco.com/research-starters/business-and-management/dynamic-pricing-surge-pricing', type: 'academic', label: 'EBSCO Research Starters (Business and Management) — Dynamic pricing (surge pricing)' },
      { url: 'https://en.wikipedia.org/wiki/Dynamic_pricing', type: 'reference', label: 'Wikipedia — Dynamic pricing' },
      { url: 'https://kinder.rice.edu/urbanedge/why-do-consumers-hate-ubers-surge-pricing', type: 'academic', label: 'Rice University, Kinder Institute — Why Do Consumers Hate Uber’s Surge Pricing?（公平感の問題）' },
    ],
  },
  {
    id: 'mgmt-freemium',
    discipline: 'management',
    title: 'フリーミアム',
    statement:
      'フリーミアム（freemium）は「free（無料）」と「premium（割増・有料）」を組み合わせた造語で、基本機能を無料で広く提供して大規模なユーザーベースを安価に獲得し、その一部を高度な機能・容量・サポート・広告除去等の有料版へ転換させて収益を得るビジネスモデル。' +
      'デジタル財は追加配布の限界費用がほぼゼロのため無料配布で多数を集める戦略が成立する一方、有料転換率は一般に数％（多くのSaaSで概ね2〜5％）と低く、無料ユーザーのコストを十分低く抑えつつ有料化への明確な動機を設計することが成功の鍵となる。語はベンチャー投資家フレッド・ウィルソンの2006年のブログ投稿への読者ジャリッド・ルーキンの提案に由来し、クリス・アンダーソン『フリー』（2009）が広めた。Dropbox・Spotify・LinkedInやフリー・トゥ・プレイ型ゲーム等が代表例で、サブスクリプションや広告モデルと併用されることも多い。',
    keyFigures:
      'フレッド・ウィルソン（Fred Wilson, 命名を募ったブログ投稿 2006）／ジャリッド・ルーキン（Jarid Lukin, Alacra, 「freemium」を提案）／クリス・アンダーソン（Chris Anderson, 『FREE フリー』2009 で普及）／ニコラ・プジョル（Nicolas Pujol, 学術的整理）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/business-and-management/freemium', type: 'reference', label: 'EBSCO Research Starters — Freemium（Business & Management）' },
      { url: 'https://en.wikipedia.org/wiki/Freemium', type: 'reference', label: 'Wikipedia — Freemium（語源・由来）' },
      { url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1718663', type: 'academic', label: 'Nicolas Pujol, “Freemium: Attributes of an Emerging Business Model”（SSRN）' },
      { url: 'https://avc.com/2006/03/the_freemium_bu/', type: 'media', label: 'Fred Wilson, “The Freemium Business Model”（AVC, 2006, 一次資料）' },
    ],
  },
  {
    id: 'human-illusory-truth-effect',
    discipline: 'human-science',
    title: '真理の錯誤効果（真実性の錯覚）',
    statement:
      '真理の錯誤効果（illusory truth effect、真実性の錯覚）とは、ある主張に繰り返し接触すると、その内容の真偽にかかわらず、それを真実だと感じやすくなる（真実性の評価が高まる）認知現象である。一度見聞きした主張は再接触時に処理しやすくなり（処理流暢性 processing fluency の上昇）、その流暢さを「真実らしさ」の手がかりと取り違えることが主機序とされる。' +
      'Hasher・Goldstein・Toppino（1977）が、2週間間隔で反復提示した陳述ほど真実性評価が高まることを示し初めて実証した。重要な知見として、(1)既に正しい知識をもつ事柄でも反復で錯誤が生じうる（knowledge neglect）、(2)明白な虚偽でも反復効果が見られる場合がある、(3)出所の信頼性が低くても生じる、ことが報告される。広告・プロパガンダ・誤情報の反復拡散が効果を持つ理由を説明する心理メカニズムとして誤情報研究で重視される。',
    keyFigures:
      'リン・ハッシャー（Lynn Hasher）／デイヴィッド・ゴールドスタイン（David Goldstein）／トーマス・トッピーノ（Thomas Toppino）（1977 原典）／リサ・K・ファツィオ（Lisa K. Fazio, 2015/2020 knowledge neglect）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.apa.org/pubs/journals/features/xge-0000098.pdf', type: 'academic', label: 'Fazio, Brashier, Payne & Marsh (2015) “Knowledge Does Not Protect Against Illusory Truth,” J. Experimental Psychology: General (APA)' },
      { url: 'https://online.ucpress.edu/collabra/article/6/1/38/114468/Repetition-Increases-Perceived-Truth-Even-for', type: 'academic', label: 'Fazio et al. (2020) “Repetition Increases Perceived Truth Even for Known Falsehoods,” Collabra: Psychology (UC Press)' },
      { url: 'https://www.ebsco.com/research-starters/psychology/illusory-truth-effect', type: 'reference', label: 'EBSCO Research Starters — Illusory truth effect' },
      { url: 'https://en.wikipedia.org/wiki/Illusory_truth_effect', type: 'reference', label: 'Wikipedia — Illusory truth effect（原典 Hasher et al. 1977 の書誌・実験手続）' },
    ],
  },
  {
    id: 'bizlaw-fraud-duress',
    discipline: 'business-law',
    title: '詐欺・強迫による取消し（民法96条）',
    statement:
      '民法96条は、詐欺又は強迫による意思表示を「取り消すことができる」と定める（1項）。詐欺とは人を欺いて錯誤に陥らせ意思表示をさせること、強迫とは害悪を告げて畏怖させ意思表示をさせることをいい、いずれも意思決定の自由が侵害された「瑕疵ある意思表示」として、表意者は取り消して契約等の効力を遡及的に失わせることができる。' +
      '重要な区別として、第三者が詐欺を行った場合（第三者詐欺）は、相手方がその事実を知り（悪意）又は知ることができたとき（有過失）に限り取り消せる（2項。2017年改正で「知ることができたとき」を追加）が、強迫にはこの制限がなく第三者強迫でも常に取り消せる。また詐欺による取消しは善意でかつ過失がない第三者に対抗できない（3項。2017年改正で「過失がない」を追加し善意無過失の第三者を保護）のに対し、強迫による取消しは善意の第三者にも対抗できる。錯誤（95条）・心裡留保（93条）・通謀虚偽表示（94条）と並ぶ意思表示の規律である。',
    keyFigures:
      '1項＝詐欺・強迫による意思表示は取消可（瑕疵ある意思表示）／2項＝第三者詐欺は相手方が悪意又は有過失のときに限り取消可（強迫には制限なし）／3項＝詐欺取消しは善意無過失の第三者に対抗不可（強迫取消しは善意の第三者にも対抗可）／2017年改正で2項に「知ることができたとき」・3項に「過失がない」を追加／e-Gov法令id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第96条' },
      { url: 'https://www.agaroot.jp/shiho/column/fraud-duress/', type: 'media', label: 'アガルート「民法96条の詐欺・強迫とは？」（司法試験講座解説）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0096-00/', type: 'media', label: 'クレアール司法書士講座 民法第96条【詐欺又は強迫】' },
    ],
  },
  {
    id: 'infosoc-digital-constitutionalism',
    discipline: 'information-sociology',
    title: 'デジタル立憲主義',
    statement:
      'デジタル立憲主義（digital constitutionalism）とは、立憲主義（権力の制限・基本的権利の保障・法の支配）の発想を、国家のみならず巨大デジタル・プラットフォーム企業が行使する「私的権力」にも及ぼし、デジタル環境において基本的権利を保護し諸権力の均衡を回復しようとする思想・規範枠組みである。' +
      'エドアルド・チェレステはこれを、デジタル社会で基本的権利保護と権力均衡を志向する規制実践を方向づける「イデオロギー」と定義し、伝統的立憲主義が国家権力を対象としたのに対し私的アクターの権力も射程に含める点に新しさがあるとした。ニコラス・スーザーはプラットフォームの私的統治への法の支配の拡張、ジョヴァンニ・デ・グレゴリオは「アルゴリズム社会」における権利と権力の再構成として理論化した。インターネット権利章典、ブラジルのMarco Civil da Internet、EUのGDPR・DSA・DMA、Metaの監督委員会などが実践例・契機として論じられる。',
    keyFigures:
      'ジョヴァンニ・デ・グレゴリオ（Giovanni De Gregorio）／エドアルド・チェレステ（Edoardo Celeste, 2019 概念整理）／ニコラス・スーザー（Nicolas Suzor）／私的権力への立憲主義的規律',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.cambridge.org/core/books/digital-constitutionalism-in-europe/D0BD64FA26654FABBD8549CE88640A90', type: 'academic', label: 'Giovanni De Gregorio, Digital Constitutionalism in Europe (Cambridge University Press, 2022)' },
      { url: 'https://www.tandfonline.com/doi/abs/10.1080/13600869.2019.1562604', type: 'academic', label: 'Edoardo Celeste, “Digital constitutionalism: a new systematic theorisation,” International Review of Law, Computers & Technology, 33(1), 2019' },
      { url: 'https://en.wikipedia.org/wiki/Digital_constitutionalism', type: 'reference', label: 'Wikipedia: Digital constitutionalism（概念・主要論者・実践例）' },
      { url: 'https://academic.oup.com/edited-volume/34234/chapter/290273128', type: 'academic', label: '“The Marco Civil da Internet and Digital Constitutionalism,” Oxford Handbook of Online Intermediary Liability (Oxford Academic)' },
    ],
  },
  {
    id: 'econ-comparative-institutional-analysis',
    discipline: 'economics',
    title: '比較制度分析（青木昌彦）',
    statement:
      '比較制度分析（Comparative Institutional Analysis, CIA）は、経済制度をゲーム理論（特に繰り返しゲーム・進化ゲーム）を用いて、プレイヤー間の戦略的相互作用が生み出す自己拘束的（self-enforcing）な均衡として捉える枠組みである。' +
      '制度を「社会の成員の行動についての安定的で共有された予想（信念）のシステム＝ゲームの均衡」とみなす均衡論的制度観に立ち、制度的補完性（ある領域の制度が他領域の制度と効率を高め合いシステムとして安定する）、経路依存性、多重均衡（同一環境でも複数の安定した制度配置がありうる）を鍵概念とする。これにより日本型・アングロサクソン型など各国経済システムの多様性と持続性を説明する。スタンフォード大学の青木昌彦が主著『Toward a Comparative Institutional Analysis』（2001）で体系化し、A・グライフ（歴史制度分析）やP・ミルグロムも貢献。ノースらの新制度派と関連しつつ、ゲーム理論的・均衡論的アプローチに特徴がある。',
    keyFigures:
      '青木昌彦（Masahiko Aoki, 2001『Toward a Comparative Institutional Analysis』）／アブナー・グライフ（Avner Greif, 歴史制度分析）／ポール・ミルグロム（Paul Milgrom）／ダグラス・ノース（Douglass North, 関連）／鍵概念＝均衡論的制度観・制度的補完性・多重均衡',
    asOf: '2026-06',
    sources: [
      { url: 'https://mitpress.mit.edu/9780262550833/toward-a-comparative-institutional-analysis/', type: 'academic', label: "MIT Press — Masahiko Aoki, 'Toward a Comparative Institutional Analysis' (2001)" },
      { url: 'https://www.cambridge.org/core/journals/journal-of-institutional-economics/article/understanding-masahiko-aokis-comparative-institutional-analysis/B8153640E3B8C0568B71C48E8A42CF01', type: 'academic', label: "Journal of Institutional Economics (Cambridge Core) — 'Understanding Masahiko Aoki's comparative institutional analysis'" },
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1468-5876.1996.tb00031.x', type: 'academic', label: "Japanese Economic Review (Wiley) — Aoki, 'Towards a Comparative Institutional Analysis' (1996)" },
      { url: 'https://web.stanford.edu/class/polisci210/papers/greif.pdf', type: 'academic', label: "Avner Greif (Stanford) — 'Self-enforcing and Self-reinforcing Economic Institutions'" },
    ],
  },
  {
    id: 'mgmt-subscription-model',
    discipline: 'management',
    title: 'サブスクリプション・モデル',
    statement:
      'サブスクリプション・モデルとは、製品・サービスを単発で販売し所有権を移転するのではなく、顧客が定期的（月額・年額等）に料金を支払い、その期間中サービスへのアクセスや継続的な提供を受ける、継続課金（リカーリング）型のビジネスモデルである。新聞・雑誌の定期購読や会員制を古典的起源とし、SaaS（Software as a Service）、動画・音楽配信、定期宅配などデジタル時代に急拡大した。' +
      '利点は、継続的で予測可能な収益（安定したキャッシュフロー）、顧客との長期的関係、利用データに基づく改善にある。重視される指標は月次／年次経常収益（MRR／ARR）、解約率（チャーン）、顧客生涯価値（LTV）、顧客獲得コスト（CAC）で、LTV>CACかつ低チャーンが持続性の鍵とされる。所有から利用・アクセスへの転換（サブスクリプション・エコノミー、ティエン・ツォが2007年に提唱・普及）の潮流の中で論じられる。',
    keyFigures:
      'ティエン・ツォ（Tien Tzuo, Zuora創業者・「サブスクリプション・エコノミー」提唱者, 2007）／指標＝MRR・ARR（経常収益）・チャーン（解約率）・LTV・CAC／所有から利用・アクセスへ',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/technology/software-as-a-service', type: 'reference', label: 'Encyclopaedia Britannica — Software as a service (computing)' },
      { url: 'https://online.hbs.edu/blog/post/ltv-cac', type: 'academic', label: 'Harvard Business School Online — LTV:CAC Ratio' },
      { url: 'https://en.wikipedia.org/wiki/Churn_rate', type: 'reference', label: 'Wikipedia — Churn rate (recurring-revenue/subscription models)' },
      { url: 'https://www.indexventures.com/perspectives/this-man-created-the-subscription-economy/', type: 'media', label: 'Index Ventures — Tien Tzuo and the Subscription Economy (coined 2007)' },
    ],
  },
  {
    id: 'human-status-quo-bias',
    discipline: 'human-science',
    title: '現状維持バイアス',
    statement:
      '現状維持バイアス（status quo bias）とは、客観的により良い選択肢があっても、現在の状態（既定の選択肢・現状）を維持することを過度に選好する認知バイアスである。経済学者ウィリアム・サミュエルソンとリチャード・ゼックハウザーが1988年の論文「Status Quo Bias in Decision Making」（Journal of Risk and Uncertainty, 1巻7–59頁）で、健康保険・退職年金の選択などの実証実験により示し命名した。' +
      '背景の心理として、(1)損失回避（変更による損失を利得より重く見積もる）、(2)保有効果（既に持つものを高く評価する）、(3)後悔回避（行動して失敗する後悔を、何もせず失敗する後悔より大きいと予期する）、(4)認知的負担の回避が挙げられる。初期設定が選ばれやすいデフォルト効果と密接に関連し、臓器提供のオプトイン／オプトアウトや年金加入のデフォルト設計、ナッジ政策で重要となる。損失回避・保有効果とは関連するが、現状維持そのものへの選好という点で区別される。',
    keyFigures:
      'ウィリアム・サミュエルソン（William Samuelson）／リチャード・ゼックハウザー（Richard Zeckhauser）（1988, Journal of Risk and Uncertainty 1:7–59）／背景＝損失回避・保有効果・後悔回避／デフォルト効果と密接に関連',
    asOf: '2026-06',
    sources: [
      { url: 'https://link.springer.com/article/10.1007/BF00055564', type: 'academic', label: 'Samuelson & Zeckhauser (1988) “Status Quo Bias in Decision Making”, Journal of Risk and Uncertainty, 1, 7–59 (Springer Nature 原論文)' },
      { url: 'https://rzeckhauser.scholars.harvard.edu/publications/status-quo-bias-decision-making', type: 'academic', label: 'Harvard University — Richard Zeckhauser 著者公式出版物ページ' },
      { url: 'https://www.behavioraleconomics.com/resources/mini-encyclopedia-of-be/status-quo-bias/', type: 'reference', label: 'BehavioralEconomics.com — Mini-Encyclopedia of BE: “Status quo bias”' },
      { url: 'https://en.wikipedia.org/wiki/Status_quo_bias', type: 'reference', label: 'Wikipedia — “Status quo bias”（定義・関連概念との区別・臓器提供応用）' },
    ],
  },
  {
    id: 'human-self-fulfilling-prophecy',
    discipline: 'human-science',
    title: '自己成就的予言（マートン）',
    statement:
      '自己成就的予言（self-fulfilling prophecy）とは、当初は誤った（事実に反する）状況の定義が、人々がそれを真実と信じて行動することで、結果的にその予言を現実化してしまう過程をいう。社会学者ロバート・K・マートンが1948年の論文「The Self-Fulfilling Prophecy」（Antioch Review誌）で命名・概念化し、マートン自身の定義は「ある状況についての誤った定義が、その当初の誤った観念を真実にしてしまう新たな行動を呼び起こす」というもの。' +
      '基礎にはW.I.トマスの定理「人々が状況を真実だと定義すれば、その状況は結果において真実となる」がある。代表例は銀行の取り付け騒ぎで、健全な銀行でも破綻の噂を信じた預金者が一斉に引き出せば実際に支払い不能に陥る。教育文脈での具体化がピグマリオン効果（教師の期待が生徒の成績を左右する。ローゼンタール）であり、これは一般概念たる自己成就的予言の一事例にあたる。逆に予言ゆえに当初の予測が外れる自己破壊的予言（self-defeating prophecy）も存在する。差別・偏見・スティグマ・金融市場の分析に広く応用される。',
    keyFigures:
      'ロバート・K・マートン（Robert K. Merton, 1948「The Self-Fulfilling Prophecy」）／W.I.トマス（トマスの定理）／ロバート・ローゼンタール（ピグマリオン効果＝教育文脈の一事例）／自己破壊的予言（逆作用）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.ebsco.com/research-starters/social-sciences-and-humanities/self-fulfilling-prophecy', type: 'reference', label: 'EBSCO Research Starters — Self-fulfilling prophecy（Merton 1948・トマスの定理・取り付け騒ぎ）' },
      { url: 'https://en.wikipedia.org/wiki/Self-fulfilling_prophecy', type: 'reference', label: 'Wikipedia — Self-fulfilling prophecy（Antioch Review 8:193–210・定義・bank run）' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100453214', type: 'reference', label: 'Oxford Reference — Self-defeating prophecy（逆作用＝自己破壊的予言）' },
      { url: 'https://link.springer.com/rwe/10.1007/978-0-387-79061-9_2327', type: 'academic', label: 'Springer — Pygmalion Effect（教育文脈での自己成就的予言の一事例）' },
    ],
  },
  {
    id: 'bizlaw-dation-in-payment',
    discipline: 'business-law',
    title: '代物弁済（民法482条）',
    statement:
      '代物弁済とは、弁済をすることができる者（債務者または第三者）が、債権者との契約により、本来負担している給付に代えて他の給付をすることで、その給付に弁済と同一の効力（債務消滅）を生じさせる制度である（民法482条）。例えば100万円の金銭債務を負う者が、債権者との合意のもと自動車を引き渡して債務を消滅させる場合がこれにあたる。' +
      '2017年改正（2020年4月施行）後の482条は「弁済をすることができる者…が、債権者との間で、債務者の負担した給付に代えて他の給付をすることにより債務を消滅させる旨の契約をした場合において、その弁済者が当該他の給付をしたときは、その給付は、弁済と同一の効力を有する。」と定める。改正により代物弁済が諾成契約（合意のみで成立）であることが明確化された一方、債務消滅の効力は現実に代物の給付がされた時に生じる。担保目的の「代物弁済予約」は譲渡担保等の非典型担保として用いられ、仮登記担保契約に関する法律の規律対象（清算手続を要する）。',
    keyFigures:
      '根拠条文＝民法482条（e-Gov law id 129AC0000000089）／成立＝債権者と弁済者の契約（合意）が必要・債務者が一方的に強制できない／法的性質＝諾成契約（2017年改正・2020年4月施行で明文化）／効力発生時＝現実に代物の給付がされた時／担保目的の「代物弁済予約」は仮登記担保契約に関する法律の規律対象',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第482条' },
      { url: 'https://ja.wikibooks.org/wiki/民法第482条', type: 'reference', label: 'Wikibooks 民法第482条（条文と解説）' },
      { url: 'https://www.oike-law.gr.jp/wp-content/uploads/OL47-12_uesato.pdf', type: 'media', label: 'Oike Library No.47 民法改正解説～弁済～（上里美登利 弁護士）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0482-00/', type: 'media', label: 'クレアール司法書士講座 民法第482条【代物弁済】' },
    ],
  },
  {
    id: 'infosoc-technofeudalism',
    discipline: 'information-sociology',
    title: 'テクノ封建制（デジタル封建制）',
    statement:
      'テクノ封建制（technofeudalism）とは、巨大デジタル・プラットフォームの台頭により、経済の支配的様式が資本主義から封建制に類比される新体制へ移行したとする議論。市場競争と利潤に代わり、プラットフォームが所有する「クラウド資本（cloud capital）」への依存と、そこから抽出される「レント（地代）」・独占が経済を支配すると論じる。' +
      'プラットフォーム所有者は「クラウド領主（cloudalists）」、従来の資本家は彼らに従属する「家臣（vassals）」、無償のデータ労働を担う利用者は「クラウド農奴（cloud serfs）」とされる。元ギリシャ財務相ヤニス・バルファキスが著書『Technofeudalism』（2023）で展開。先駆としてセドリック・デュラン『Techno-féodalisme』（2020）がある。一方、エフゲニー・モロゾフ（New Left Review 2022）らは、巨大IT企業はR&Dに投資する能動的資本家でありレンティアではない、これは依然レンティア資本主義の一形態で「封建制」は分析的に不正確だと批判する。',
    keyFigures:
      'ヤニス・バルファキス（Yanis Varoufakis, 2023『Technofeudalism』）／セドリック・デュラン（Cédric Durand, 2020『Techno-féodalisme』）／エフゲニー・モロゾフ（Evgeny Morozov, New Left Review 2022, 批判）',
    asOf: '2026-06',
    sources: [
      { url: 'https://newleftreview.org/issues/ii133/articles/evgeny-morozov-critique-of-techno-feudal-reason', type: 'academic', label: 'Evgeny Morozov, “Critique of Techno-Feudal Reason,” New Left Review 133/134 (2022) — 批判的検討' },
      { url: 'https://www.editionsladecouverte.fr/techno_feodalisme-9782348080159', type: 'reference', label: 'Cédric Durand, Techno-féodalisme: Critique de l’économie numérique (La Découverte, 2020) — 先駆的著作' },
      { url: 'https://jacobin.com/2023/10/cloud-capitalism-technofeudalism-serfs-cloud-big-data-yanis-varoufakis', type: 'media', label: 'Jacobin (2023) “We’re Still Living Under Capitalism, Not Techno-Feudalism” — 批判' },
      { url: 'https://www.goodreads.com/book/show/75560036-technofeudalism', type: 'reference', label: 'Yanis Varoufakis, Technofeudalism: What Killed Capitalism (2023) — 概念の主要文献' },
    ],
  },
  {
    id: 'econ-natural-rate-of-interest',
    discipline: 'economics',
    title: '自然利子率（ヴィクセル）',
    statement:
      '自然利子率とは、経済が完全雇用・潜在産出の水準にあり、インフレを加速も減速もさせない中立的な実質利子率を指す。スウェーデンの経済学者クヌート・ヴィクセルが1898年の『利子と物価（Geldzins und Güterpreise）』で導入した概念で、彼はこれを物価に対して中立的で「物価を上げも下げもしない」貸出利子率と定義し、貯蓄と投資を均衡させる利子率とした。' +
      '市場利子率（貨幣利子率）が自然利子率を下回るとインフレ（累積的物価上昇）が、上回るとデフレが生じるとする「累積過程（cumulative process）」を論じた。現代マクロでは r*（アール・スター）と表記され金融政策の中立スタンスの基準となり、実質金利が r* を下回れば緩和的、上回れば引き締め的とされる。r* は直接観察できず Laubach–Williams 等のモデルで推計され、近年は人口減少・生産性低下・過剰貯蓄により先進国で長期的に低下しているとの議論（長期停滞論、サマーズ）がある。',
    keyFigures:
      'クヌート・ヴィクセル（Knut Wicksell, 1851–1926, 概念の創始者・1898年）／トーマス・ローバック＆ジョン・C・ウィリアムズ（Laubach–Williams モデル, 2001年）／ローレンス・サマーズ（Lawrence Summers, 長期停滞論）／r*（中立金利）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/Interest-and-Prices', type: 'reference', label: 'Encyclopædia Britannica — Interest and Prices (Wicksell)' },
      { url: 'https://www.brookings.edu/articles/the-hutchins-center-explains-the-neutral-rate-of-interest/', type: 'government', label: 'Brookings Hutchins Center — What is the neutral rate of interest? (r*, policy stance)' },
      { url: 'https://www.frbsf.org/research-and-insights/publications/economic-letter/2016/08/monetary-policy-and-low-r-star-natural-rate-of-interest/', type: 'government', label: 'Federal Reserve Bank of San Francisco — Monetary Policy in a Low R-star World (Williams)' },
      { url: 'https://en.wikipedia.org/wiki/Cumulative_process', type: 'reference', label: 'Wikipedia — Cumulative process (Wicksell, 累積過程)' },
    ],
  },
  {
    id: 'mgmt-psychological-ownership',
    discipline: 'management',
    title: '心理的所有感',
    statement:
      '心理的所有感（psychological ownership）とは、法的な所有権の有無にかかわらず、ある対象（仕事・組織・製品・アイデア・チーム等）を「自分のもの（mine／our）」と感じる心理状態を指す。所有対象に自己を投影し、自己アイデンティティの一部として組み込む点が核心であり、対象は具体物だけでなく抽象的概念にも及ぶ。' +
      'Pierce・Kostova・Dirksが2001年の論文（Academy of Management Review）で組織研究へ体系的に導入した。生起の主要な経路（ルート）は、(1)対象をコントロールすること、(2)対象を深く知ること（親密な知識）、(3)対象に自己を投資すること（時間・労力・アイデアの投入）の3つである。高まると組織コミットメント・職務満足・組織市民行動・責任感・スチュワードシップを促す正の効果がある一方、縄張り意識（テリトリアリティ）・変化への抵抗・情報共有の拒否・喪失時の強い感情といった負の側面（ダークサイド）も生じうる。従業員持株制度（ESOP）・参加型経営・ジョブ・クラフティング・ユーザー・イノベーション（DIY効果／IKEA効果）と関連して論じられる。',
    keyFigures:
      'ジョン・L・ピアース（Jon L. Pierce）／タチアナ・カストロ（Tatiana Kostova）／カート・ダークス（Kurt T. Dirks）（2001 Academy of Management Review）／3ルート＝コントロール・親密な知識・自己投資／関連＝IKEA効果',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.aom.org/doi/10.5465/amr.2001.4378028', type: 'academic', label: 'Pierce, Kostova & Dirks (2001) “Toward a Theory of Psychological Ownership in Organizations,” Academy of Management Review 26(2): 298–310' },
      { url: 'https://journals.sagepub.com/doi/10.1037/1089-2680.7.1.84', type: 'academic', label: 'Pierce, Kostova & Dirks (2003) “The State of Psychological Ownership,” Review of General Psychology 7(1): 84–107' },
      { url: 'https://en.wikipedia.org/wiki/Ownership_(psychology)', type: 'reference', label: 'Wikipedia「Ownership (psychology)」— 定義・3ルート・自己アイデンティティ・テリトリアリティ・IKEA効果' },
      { url: 'https://www.jstage.jst.go.jp/article/jshrm/22/2/22_87/_html/-char/en', type: 'academic', label: '“Psychological Ownership: A 20-Year Review,” Japanese Journal of Human Resource Management（査読・学会誌）' },
    ],
  },
  {
    id: 'human-defensive-pessimism',
    discipline: 'human-science',
    title: '防衛的悲観主義',
    statement:
      '防衛的悲観主義（defensive pessimism）は、過去に成功を重ねてきたにもかかわらず、これから臨む課題に対してあえて非現実的に低い期待を設定し、起こりうる失敗の場面を具体的かつ鮮明に思い描く（リフレクション）ことで不安に対処する認知的方略である。心理学者ナンシー・キャンターとジュリー・ノレムが1986年に概念化した。' +
      '一見ネガティブだが、低い期待と最悪の事態の想像が、不安の高い人にとっては不安を行動への準備・対策へと振り向け、結果的に良いパフォーマンスにつながる適応的方略となる。重要な知見として、防衛的悲観主義者に悲観的思考を禁じてリラックスや無理なポジティブ思考をさせると、かえってパフォーマンスが低下する（Spencer & Norem, 1996）。成功体験を持ちつつ高い期待を設定する「方略的楽観主義（strategic optimism）」と対比され、画一的なポジティブ思考の推奨への反証として知られる。',
    keyFigures:
      'ジュリー・K・ノレム（Julie K. Norem）／ナンシー・キャンター（Nancy Cantor）（1986 概念化）／ステイシー・スペンサー（Stacie M. Spencer, 1996 実験）／対比＝方略的楽観主義',
    asOf: '2026-06',
    sources: [
      { url: 'https://sites.psu.edu/aspsy/2014/04/08/defensive-pessimism/', type: 'academic', label: 'Penn State University, Applied Social Psychology — Defensive Pessimism' },
      { url: 'https://journals.sagepub.com/doi/10.1177/0146167296224003', type: 'academic', label: 'Spencer & Norem (1996), Reflection and Distraction: Defensive Pessimism, Strategic Optimism, and Performance, Personality and Social Psychology Bulletin' },
      { url: 'https://link.springer.com/rwe/10.1007/978-3-319-24612-3_1061', type: 'reference', label: 'Encyclopedia of Personality and Individual Differences (Springer) — Defensive Pessimism' },
      { url: 'https://en.wikipedia.org/wiki/Defensive_pessimism', type: 'reference', label: 'Wikipedia — Defensive pessimism' },
    ],
  },
  {
    id: 'bizlaw-creditor-delay',
    discipline: 'business-law',
    title: '受領遅滞（民法413条）',
    statement:
      '受領遅滞（債権者遅滞）とは、債務者が債務の本旨に従った履行の提供（弁済の提供）をしたにもかかわらず、債権者がその受領を拒み、または受領できないために履行が完了しない状態をいう（民法413条）。債務者は弁済の提供をすれば債務不履行責任を免れる（492条）が、413条はこれに加え受領遅滞の効果を定める。' +
      '2017年改正（2020年4月施行）で効果が明文化され、(1)特定物引渡債務における債務者の保存義務が善管注意義務から「自己の財産に対するのと同一の注意」へ軽減され（413条1項）、(2)受領遅滞で増加した履行費用は債権者の負担となる（413条2項）。さらに413条の2第2項は、受領遅滞中に当事者双方の責めに帰せない事由で履行不能となったとき、その履行不能を債権者の責めに帰すべき事由によるものとみなす（危険の移転）。法的性質には学説の対立があるが、改正は効果を整理した。',
    keyFigures:
      '根拠条文＝民法413条（受領遅滞・債権者遅滞）／要件＝弁済の提供あり＋債権者の受領拒絶または受領不能／効果＝特定物保存義務の軽減（1項）・増加費用の債権者負担（2項）・受領遅滞中の双方無責の履行不能は債権者の帰責とみなす危険移転（413条の2第2項）／2020年4月施行で明文化／法定責任説と債務不履行責任説の対立',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第413条・第413条の2・第492条・第493条' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0413-00/', type: 'media', label: 'クレアール司法書士講座 民法第413条【受領遅滞】解説' },
      { url: 'https://tek-law.jp/civil-code/claims/general-provisions/effects-of-claims/liability-for-non-performance/article-413-2/', type: 'reference', label: 'tek-law 民法第413条の2（履行遅滞中又は受領遅滞中の履行不能と帰責事由）' },
    ],
  },
  {
    id: 'bizlaw-deposit-kyotaku',
    discipline: 'business-law',
    title: '弁済供託（民法494条）',
    statement:
      '弁済供託とは、債務者が弁済の目的物を供託所（法務局等）に寄託することによって債務を消滅させ、債務から解放される制度（民法494条）。本来、債務は債権者への弁済によって消滅するが、債権者側の事情で弁済できない場合に備え、債務者が一方的に債務を免れる手段を与える。' +
      '供託原因は、(1)受領拒否（弁済の提供をしたのに債権者が受領を拒んだとき）、(2)受領不能（債権者が弁済を受領できないとき）〔以上1項〕、(3)債権者不確知（弁済者の過失なく債権者を確知できないとき。例：債権者死亡で相続人不明、債権譲渡の有効性に争いがある等）〔2項〕の3つ。供託をした時に債務は消滅し、債権者は供託物の還付請求権を取得する。家賃の受領を拒否された借家人が賃料を供託して契約解除を免れる場面など実務上重要で、弁済の提供（492・493条）・受領遅滞（413条）と密接に関連する。',
    keyFigures:
      '根拠条文＝民法494条／供託原因3類型＝受領拒否・受領不能（1項）／債権者不確知（2項、過失なき場合）／効果＝供託した時に債務消滅・債権者は還付請求権を取得／供託先＝供託所（法務局等）／供託の5類型のうち弁済供託（他は担保・執行・没取・保管供託）／2020年4月施行で文言整理／関連＝弁済の提供(492・493条)・受領遅滞(413条)',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号）第494条 供託' },
      { url: 'https://www.moj.go.jp/MINJI/minji07.html', type: 'government', label: '法務省 供託制度の概要（弁済供託・担保(保証)供託・執行供託・没取供託・保管供託の5類型）' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_00055.html', type: 'government', label: '法務省 供託Q&A' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0494-00/', type: 'media', label: 'クレアール司法書士講座 民法第494条【供託】解説' },
    ],
  },
  {
    id: 'infosoc-algorithmic-accountability',
    discipline: 'information-sociology',
    title: 'アルゴリズムの説明責任',
    statement:
      'アルゴリズムの説明責任（algorithmic accountability）とは、自動意思決定システムや機械学習がもたらす結果について責任の所在を割り当て、その設計・運用主体が偏り・危害・不当な帰結に答責し、影響を受ける人々・市民・規制当局に対して動作や判断を説明・追跡・正当化し、異議申立てと是正・救済の手段を提供すべきだとする規範である。' +
      '背景には、信用スコア・採用・量刑（再犯予測COMPAS、ProPublicaが2016年にバイアスを指摘）・福祉給付など重要決定が不透明なブラックボックス型アルゴリズムに委ねられ、誤りや差別が生じても答責主体が不明確だという問題意識がある。調査報道のN.ディアコポロスが概念を広め、単なる技術的「説明可能性（XAI）」より広く、透明性・第三者監査・影響評価・是正・ガバナンス構造を含む点が強調される。GDPR22条やEU AI規制法の高リスク要件とも接続する。',
    keyFigures:
      'ニコラス・ディアコポロス（Nicholas Diakopoulos, 概念を普及）／マイケル・コリスカ（Michael Koliska）／ProPublica（COMPAS報道, 2016）／ACM USACM（2017 七原則）／説明可能性(XAI)より広く是正・答責を含む',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Algorithmic_accountability', type: 'reference', label: 'Wikipedia「Algorithmic accountability」（定義・責任の割り当て・Diakopoulos）' },
      { url: 'https://www.acm.org/binaries/content/assets/public-policy/2017_usacm_statement_algorithms.pdf', type: 'government', label: 'ACM USACM「Statement on Algorithmic Transparency and Accountability」(2017) 七原則' },
      { url: 'https://www.cjr.org/tow_center_reports/algorithmic_accountability_on_the_investigation_of_black_boxes.php', type: 'media', label: 'N. Diakopoulos「Algorithmic Accountability: On the Investigation of Black Boxes」Columbia Journalism Review / Tow Center' },
      { url: 'https://www.cambridge.org/core/journals/social-philosophy-and-policy/article/algorithmic-accountability-in-the-making/6F3CE994EC96C65392C5374B3CDE3C51', type: 'academic', label: '“Algorithmic Accountability in the Making,” Social Philosophy and Policy (Cambridge Core, 査読誌)' },
    ],
  },
  {
    id: 'econ-pigou-effect',
    discipline: 'economics',
    title: 'ピグー効果（実質残高効果）',
    statement:
      'ピグー効果（実質残高効果, Pigou effect / real balance effect）とは、物価水準の下落（デフレ）が人々の保有する貨幣・名目資産の実質価値（実質残高 real money balances）を高め、その結果として実質的に豊かになった人々が消費を増やし、総需要が刺激される効果をいう。A.C.ピグーが1943年の論文「The Classical Stationary State」(Economic Journal)で論じ、ドン・パティンキンが「実質残高効果」として一般化した（富効果 wealth effect の一種）。' +
      '理論的含意として、ケインズが流動性のわな等では物価下落・金融政策だけでは完全雇用を回復できないとしたのに対し、ピグー効果は、物価が十分に下落すれば実質残高の増加を通じ消費が回復し市場が自律的に完全雇用へ復帰しうるとする古典派的調整機構を示し、ケインズ体系への反論となった。ただし現実には、(1)デフレが債務の実質負担を増やし倒産・需要減を招く（フィッシャーの負債デフレ、カレツキの批判）、(2)デフレ期待が消費を先送りさせる、(3)物価下落の効果は限定的、等の理由から完全雇用回復力は弱く、理論的に重要だが実務的効果は小さいと一般に評価される。',
    keyFigures:
      'アーサー・セシル・ピグー（Arthur Cecil Pigou, 1943「The Classical Stationary State」Economic Journal）／ドン・パティンキン（Don Patinkin, 「real balance effect」として命名・一般化, Money, Interest and Prices 1956）／批判: I.フィッシャー（負債デフレ, 1933）・M.カレツキ（1944）／関連だが別概念: 流動性のわな・有効需要・名目賃金の下方硬直性',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803100327473', type: 'reference', label: 'Oxford Reference (A Dictionary of Economics) — Pigou effect: 物価下落が実質富を増やし総需要を高めるという議論' },
      { url: 'https://en.wikipedia.org/wiki/Pigou_effect', type: 'reference', label: 'Wikipedia — Pigou effect（Pigou 1943「The Classical Stationary State」/ Patinkin による命名・実質残高効果 / ケインズ反論 / Kalecki・負債デフレ批判）' },
      { url: 'https://www.econlib.org/library/Enc/bios/Pigou.html', type: 'reference', label: 'The Concise Encyclopedia of Economics (Econlib) — Arthur Cecil Pigou 略伝（実質残高効果＝Pigou効果の提唱者）' },
      { url: 'https://www.britannica.com/money/Arthur-Cecil-Pigou', type: 'reference', label: 'Encyclopaedia Britannica Money — Arthur Cecil Pigou（厚生経済学・Pigou effect の名祖）' },
    ],
  },
  {
    id: 'econ-internal-labor-market',
    discipline: 'economics',
    title: '内部労働市場（ドリンジャー＆ピオレ）',
    statement:
      '内部労働市場とは、企業など組織の内部で労働力の価格決定（賃金）と配分（採用・配置・昇進）が、外部労働市場の需給ではなく組織内の管理的なルールや手続きによって規律される仕組み・領域を指す。' +
      'ピーター・ドリンジャーとマイケル・ピオレが1971年の著書『Internal Labor Markets and Manpower Analysis』で概念化した。外部労働市場と対比され、入職口（port of entry）は限られ、上位の職は内部労働者の昇進（はしご job ladder）で埋められる。形成要因として(1)企業特殊的技能、(2)OJT（オン・ザ・ジョブ・トレーニング）、(3)慣習（custom）が挙げられ、利点は技能投資の回収・労働者の定着・暗黙知の蓄積にある。関連して労働市場を一次（primary）と二次（secondary）に分ける二重労働市場論があり、日本的雇用（長期雇用・年功賃金）の分析にも援用される。',
    keyFigures:
      'ピーター・B・ドリンジャー（Peter B. Doeringer）／マイケル・J・ピオレ（Michael J. Piore）（1971『Internal Labor Markets and Manpower Analysis』）／形成要因＝企業特殊的技能・OJT・慣習／関連＝二重労働市場論',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Internal_labor_market', type: 'reference', label: 'Wikipedia「Internal labor market」— 定義・ドリンジャー＆ピオレ1971・企業特殊的技能/OJT/慣習・入職口' },
      { url: 'https://eric.ed.gov/?id=ED048457', type: 'government', label: 'ERIC (米国教育省) ED048457 — Doeringer & Piore “Internal Labor Markets and Manpower Analysis”' },
      { url: 'https://link.springer.com/content/pdf/10.1007/978-1-349-58802-2_1337.pdf', type: 'reference', label: 'Springer (The New Palgrave) “Primary and Secondary Labour Markets” — 一次/二次労働市場と内部労働市場（二重労働市場論）' },
      { url: 'https://docs.iza.org/dp14637.pdf', type: 'academic', label: 'IZA Discussion Paper No.14637 “Internal Labor Markets: A Worker Flow Approach”' },
    ],
  },
  {
    id: 'mgmt-organizational-identity',
    discipline: 'management',
    title: '組織アイデンティティ（アルバート＆ウェッテン）',
    statement:
      '組織アイデンティティとは、組織のメンバーが「自分たちの組織は何者か（Who are we as an organization?）」について抱く、中心的・特徴的・連続的な自己定義・自己認識である。スチュアート・アルバートとデイヴィッド・ウェッテンが1985年の論文「Organizational Identity」（Research in Organizational Behavior）で概念化し、それを構成する3基準（CED基準）を示した。' +
      '(1)中心性（central＝組織の本質的・中核的な特徴）、(2)識別性／特徴性（distinctive＝他組織と区別する独自性）、(3)連続性（enduring＝時を超えて持続する）。メンバー内部の自己定義である点で、外部から見た像である組織イメージや評判（reputation）とは区別される。後の研究（ジョイア＆シュルツ＆コーリー2000）では、アイデンティティは実際には環境やイメージとの相互作用で変わりうる「適応的不安定性」を持つと論じられた。',
    keyFigures:
      'スチュアート・アルバート（Stuart Albert）／デイヴィッド・A・ウェッテン（David A. Whetten）（1985, CED基準）／デニス・A・ジョイア（Dennis A. Gioia, 2000 適応的不安定性）／組織文化・イメージ・評判とは区別',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Organizational_identity', type: 'reference', label: 'Wikipedia「Organizational identity」（Albert & Whetten 1985、CED基準の定義）' },
      { url: 'https://sk.sagepub.com/ency/edvol/download/identity/chpt/organizational-identity.pdf', type: 'reference', label: 'SAGE Encyclopedia of Identity「Organizational Identity」（百科事典級リファレンス）' },
      { url: 'https://journals.aom.org/doi/10.5465/AMR.2000.2791603', type: 'academic', label: 'Gioia, Schultz & Corley (2000) “Organizational Identity, Image, and Adaptive Instability,” Academy of Management Review 25(1):63–81（査読）' },
      { url: 'https://link.springer.com/article/10.1007/s11301-022-00311-7', type: 'academic', label: 'Management Review Quarterly (Springer)「Since Albert and Whetten」（概念伝播の査読レビュー）' },
    ],
  },
  {
    id: 'human-contact-hypothesis',
    discipline: 'human-science',
    title: '接触仮説（オールポート）',
    statement:
      '接触仮説（集団間接触理論）は、異なる集団（人種・民族・宗教など）の成員同士が接触・交流することで相互の偏見・ステレオタイプ・敵意が減少しうるとする社会心理学の理論。ゴードン・オールポートが1954年の著書『偏見の心理（The Nature of Prejudice）』で体系化した。' +
      'ただし単なる接触では不十分で、偏見低減には4つの最適条件が必要とされる：(1)集団間の対等な地位、(2)共通の目標、(3)集団間の協力（競争でなく協同）、(4)権威・法・慣習による支持。応用例にシェリフの泥棒洞窟実験（上位目標による敵対集団の和解）やアロンソンのジグソー学習法がある。ペティグルーとトロップの2006年メタ分析（515研究）は、接触が概して偏見を低減し、最適条件が揃わなくても一定の効果が、揃えばより大きな効果が得られることを示した。',
    keyFigures:
      'ゴードン・オールポート（Gordon Allport, 1954『The Nature of Prejudice』）／トーマス・ペティグルー＆リンダ・トロップ（2006 メタ分析・515研究）／ムザファー・シェリフ（泥棒洞窟実験）／エリオット・アロンソン（ジグソー学習法）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.sciencedirect.com/topics/psychology/intergroup-contact-theory', type: 'academic', label: 'ScienceDirect Topics — Intergroup Contact Theory（Allportの4条件の概観）' },
      { url: 'https://ideas.wharton.upenn.edu/wp-content/uploads/2018/07/Pettigrew-Tropp.pdf', type: 'academic', label: 'Pettigrew & Tropp (2006) A Meta-Analytic Test of Intergroup Contact Theory, JPSP 90(5):751-783（査読論文PDF, U. Pennsylvania Wharton）' },
      { url: 'https://en.wikipedia.org/wiki/Contact_hypothesis', type: 'reference', label: 'Wikipedia — Contact hypothesis（百科事典級リファレンス）' },
      { url: 'https://www.simplypsychology.org/contact-hypothesis.html', type: 'reference', label: 'Simply Psychology — Contact Hypothesis（教育リファレンス）' },
    ],
  },
  {
    id: 'bizlaw-novation',
    discipline: 'business-law',
    title: '更改（民法513条）',
    statement:
      '更改とは、当事者が従前の債務に代えて、給付の内容または債務者・債権者を変更した新たな債務を発生させる契約をいい、これにより従前の債務は消滅する（民法513条）。旧債務を消滅させ新債務を成立させる点に特徴があり、新旧債務の間に同一性がない点で、債務の同一性を保ったまま移転する債権譲渡・債務引受とは区別される。' +
      '513条は更改の3類型を定める。すなわち(1)給付の内容についての重要な変更、(2)債務者の交替による更改（514条）、(3)債権者の交替による更改（515条）である。旧債務が消滅するため担保・保証は原則消滅するが、518条により更改前の債務の目的の限度で質権・抵当権を更改後の債務に移せる（担保移転の特則）。2017年改正で要件・効果が整理された。実務では同一性を維持する債権譲渡・債務引受・準消費貸借が多く用いられ、更改の活用場面は限定的とされる。',
    keyFigures:
      '根拠条文＝民法513条（更改の定義・3類型）・514条（債務者の交替）・515条（債権者の交替）・518条（更改後の債務への担保の移転）／効果＝旧債務消滅＋同一性のない新債務成立・従たる担保や保証は原則消滅／2017年改正で整理／区別＝債権譲渡・債務引受・準消費貸借（同一性を維持）（e-Gov law id 129AC0000000089）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号、law id 129AC0000000089）第513条' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法の一部を改正する法律（債権法改正）について' },
      { url: 'https://ja.wikibooks.org/wiki/民法第513条', type: 'reference', label: 'Wikibooks 民法第513条（条文・解説）' },
    ],
  },
  {
    id: 'infosoc-digital-wellbeing',
    discipline: 'information-sociology',
    title: 'デジタル・ウェルビーイング',
    statement:
      'デジタル・ウェルビーイング（digital wellbeing）は、スマートフォン・SNS・各種アプリといったデジタル技術の利用が個人の心身の健康と幸福に与える影響に着目し、依存・過剰使用・注意の断片化・他者比較による不安などの害を避けつつ技術との関わりを価値ある形へ最適化しようとする概念・実践・研究領域である。' +
      '背景にはアテンション・エコノミー下でエンゲージメント最大化を狙う設計（無限スクロール・通知・ダークパターン）への問題意識があり、トリスタン・ハリスらが2018年に設立したCenter for Humane Technologyの倫理的設計論とも結びつく。同年GoogleのDigital WellbeingとAppleのスクリーンタイムが利用の可視化・制御ツールとして登場した。学術的には、単純な利用時間（スクリーンタイム）と幸福度の関連は弱く一貫しないことが大規模研究（Orben & Przybylski 2019, Nature Human Behaviour）で示され、利用の量より質・文脈・動機（受動的閲覧か能動的交流か等）が重要だとされる。WHOがICD-11でゲーム障害を収載した点とも関連して論じられる。',
    keyFigures:
      'エイミー・オーベン（Amy Orben）＆アンドリュー・プシビルスキ（Andrew K. Przybylski, 2019 Nature Human Behaviour）／フィリップ・ヴェルダイン（Philippe Verduyn, 能動/受動利用）／トリスタン・ハリス（Tristan Harris, Center for Humane Technology）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nature.com/articles/s41562-018-0506-1', type: 'academic', label: 'Orben, A. & Przybylski, A. K. (2019) “The association between adolescent well-being and digital technology use,” Nature Human Behaviour 3, 173–182' },
      { url: 'https://onlinelibrary.wiley.com/doi/10.1002/wps.20820', type: 'academic', label: 'Verduyn, P. et al. (2021) “The impact of social network sites on mental health: distinguishing active from passive use,” World Psychiatry 20(1):128–129' },
      { url: 'https://www.who.int/news-room/questions-and-answers/item/addictive-behaviours-gaming-disorder', type: 'government', label: 'World Health Organization — “Addictive behaviours: Gaming disorder” (ICD-11)' },
      { url: 'https://en.wikipedia.org/wiki/Center_for_Humane_Technology', type: 'reference', label: 'Wikipedia — “Center for Humane Technology” (Tristan Harris, 2018 Digital Wellbeing/Screen Time)' },
    ],
  },
  {
    id: 'econ-strategic-complementarity',
    discipline: 'economics',
    title: '戦略的補完性',
    statement:
      'あるプレイヤーが自らの行動（戦略）の水準を高めると、他のプレイヤーにとってもその行動の水準を高めることが最適となる（限界利得が増す）戦略間の関係。最適反応が相手の行動について非減少（スーパーモジュラー）になる。' +
      '逆に一方の行動増が他方の行動減を招く関係は戦略的代替性と呼ばれる。Bulow・Geanakoplos・Klemperer (1985, Journal of Political Economy) が寡占分析で導入し、Cooper・John (1988, Quarterly Journal of Economics) がマクロ経済学に応用した。補完性があると複数均衡が生じやすく、個々の最適行動が外部性を通じて増幅され（乗数効果に似た正のフィードバック）、皆が活動を控える低位均衡（協調の失敗）と皆が活発な高位均衡のいずれにも陥りうる。悲観的予想が自己実現的に不況を招くケインズ的現象や銀行取り付け・標準採用を説明する、ニュー・ケインジアン協調失敗モデルの中核概念。',
    keyFigures:
      'ジェレミー・バロー（Jeremy Bulow）＆ジョン・ギーナコプロス（John Geanakoplos）＆ポール・クレンペラー（Paul Klemperer）（1985, JPE, 寡占で導入）／ラッセル・クーパー（Russell Cooper）＆アンドリュー・ジョン（Andrew John）（1988, QJE, マクロ応用）／対概念＝戦略的代替性',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Strategic_complements', type: 'reference', label: 'Wikipedia「Strategic complements」— 戦略的補完性/代替性の定義と限界利得・最適反応' },
      { url: 'https://ideas.repec.org/a/ucp/jpolec/v93y1985i3p488-511.html', type: 'academic', label: 'Bulow, Geanakoplos & Klemperer (1985) “Multimarket Oligopoly: Strategic Substitutes and Complements,” Journal of Political Economy 93(3):488-511（用語の初出）' },
      { url: 'https://academic.oup.com/qje/article-abstract/103/3/441/1904690', type: 'academic', label: 'Cooper & John (1988) “Coordinating Coordination Failures in Keynesian Models,” Quarterly Journal of Economics 103(3):441-463（マクロ応用・複数均衡）' },
      { url: 'https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/coordination-failure', type: 'reference', label: 'Encyclopedia.com「Coordination Failure」— 戦略的補完性による協調失敗・複数均衡' },
    ],
  },
  {
    id: 'mgmt-boundary-spanning',
    discipline: 'management',
    title: '境界連結（バウンダリー・スパニング）',
    statement:
      '境界連結（boundary spanning）とは、組織やチーム・部門が自らの境界を越え、外部環境や他集団との間で情報・資源・関係を仲介し橋渡しする活動、およびそれを担う役割（境界連結者 boundary spanner）を指す。組織は環境から情報・資源を取り入れ、また環境へ働きかける必要があり、境界連結者は組織の窓口・翻訳者・ゲートキーパーとして機能する。' +
      'オルドリッチとハーカー（1977, Academy of Management Review）はこの役割を体系化し、二大機能として(1)情報処理＝外部情報の探索・選別・翻訳と内部への伝達、(2)外部代表＝組織を外部に代表し資源獲得・正統性確保・影響力行使を行うこと、を区別した。研究開発の技術情報を橋渡しする「ゲートキーパー」（Allen, MIT）、組織間連携・知識移転・チーム外活動などの文脈で重要で、資源依存理論やオープン・イノベーションとも関連する。',
    keyFigures:
      'ハワード・オルドリッチ（Howard Aldrich）＆ダイアン・ハーカー（Diane Herker）（1977 AMR）／トーマス・J・アレン（Thomas J. Allen, MIT, 技術的ゲートキーパー）／マイケル・タッシュマン（Michael Tushman, 1981）／二機能＝情報処理・外部代表',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.aom.org/doi/abs/10.5465/amr.1977.4409044', type: 'academic', label: 'Aldrich & Herker (1977) “Boundary Spanning Roles and Organization Structure,” Academy of Management Review 2(2):217-230' },
      { url: 'https://journals.aom.org/doi/10.5465/255842', type: 'academic', label: 'Tushman & Scanlan (1981) “Boundary Spanning Individuals,” Academy of Management Journal 24(2):289-305' },
      { url: 'https://mitpress.mit.edu/9780262510271/managing-the-flow-of-technology/', type: 'reference', label: 'Thomas J. Allen, Managing the Flow of Technology (MIT Press) — “gatekeeper” 概念の起源' },
      { url: 'https://en.wikipedia.org/wiki/Boundary_spanning', type: 'reference', label: 'Wikipedia: Boundary spanning（情報処理・外部代表の二機能の概説）' },
    ],
  },
  {
    id: 'human-role-conflict',
    discipline: 'human-science',
    title: '役割葛藤（役割理論）',
    statement:
      '役割理論（role theory）は、人々が社会的地位（status）に結びついた「役割」＝その地位に対し他者から寄せられる役割期待（role expectations）に沿った行動様式を演じることで社会生活が秩序づけられるとする社会学・社会心理学の枠組みである。' +
      'その中で役割葛藤（role conflict）とは、個人が両立しがたい複数の役割期待に同時に直面し、すべてを満たせない状態を指す。主要類型に、異なる役割（地位）間で生じる役割間葛藤（inter-role conflict、例：仕事と家庭）と、同一役割について役割群の各送り手が矛盾した期待を寄せる役割内葛藤（intra-role conflict）がある。関連概念に役割過重（role overload）、役割曖昧性（role ambiguity）、単一地位内の緊張である役割緊張（role strain、Goode 1960）、Merton の役割群（role-set, 1957）がある。Kahn ら（1964）は役割葛藤・役割曖昧性を職務ストレスの主要因として実証した。',
    keyFigures:
      'ロバート・K・マートン（Robert K. Merton, role-set 1957）／ウィリアム・J・グード（William J. Goode, role strain 1960）／ロバート・L・カーンら（Kahn et al. 1964, 組織ストレス）／ジョージ・H・ミード（George H. Mead, 役割概念の系譜）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.encyclopedia.com/social-sciences-and-law/sociology-and-social-reform/sociology-general-terms-and-concepts/role-conflict', type: 'reference', label: 'Encyclopedia.com「Role Conflict」（定義・役割間／役割内葛藤の類型）' },
      { url: 'https://en.wikipedia.org/wiki/Role_theory', type: 'reference', label: 'Wikipedia「Role theory」（役割・地位・役割期待・Mead 1934 の系譜）' },
      { url: 'https://www.scirp.org/reference/referencespapers?referenceid=395529', type: 'academic', label: 'Goode, W. J. (1960) “A Theory of Role Strain,” American Sociological Review 25:483-496（査読論文）' },
      { url: 'https://academic.oup.com/sf/article-abstract/43/4/591/2227932', type: 'academic', label: 'Kahn, Wolfe, Quinn & Snoek (1964) Organizational Stress（Social Forces 誌書評：役割葛藤・役割曖昧性と職務ストレス）' },
    ],
  },
  {
    id: 'bizlaw-assumption-of-debt',
    discipline: 'business-law',
    title: '債務引受（民法470条）',
    statement:
      '債務引受とは、債務をその同一性を保ったまま第三者（引受人）が引き受ける制度で、2017年改正民法（2020年4月施行）により470条以下に明文化された。' +
      '併存的債務引受（470条・471条）は、引受人が従来の債務者と連帯して同一内容の債務を負担するもので、元の債務者は債務を免れない。免責的債務引受（472条〜472条の4）は、引受人が債務者に代わって債務を負担し、元の債務者が自己の債務を免れるもので、債務者が交替する。免責的債務引受では元の担保・保証を引受人の債務に移すには担保提供者・保証人の承諾が必要（472条の4）。債権の同一性を保つ点で、旧債務を消滅させる更改（513条）と区別され、債務者側が替わる点で、債権者側が替わる債権譲渡（466条）と対をなす。',
    keyFigures:
      '併存的債務引受＝470条・471条（引受人が従来の債務者と連帯、元債務者は免責されない）／免責的債務引受＝472条〜472条の4（債務者の交替、元債務者は免責）／担保・保証の移転には担保提供者・保証人の承諾が必要（472条の4）／更改(513条)＝同一性なしで区別・債権譲渡(466条)と対をなす／2017年改正で明文化（e-Gov law id 129AC0000000089）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第470条〜第472条の4' },
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/18/03.htm', type: 'government', label: '国税庁 印紙税質疑応答事例「債務引受けの意義」' },
      { url: 'https://www.zenginkyo.or.jp/fileadmin/res/abstract/affiliate/kinpo/kinpo2016_2_4.pdf', type: 'academic', label: '中田裕康「債務引受の明文化の意義と課題」全国銀行協会 金融法務研究会報告書' },
      { url: 'https://ja.wikipedia.org/wiki/債務引受', type: 'reference', label: 'Wikipedia「債務引受」' },
    ],
  },
  {
    id: 'bizlaw-third-party-performance',
    discipline: 'business-law',
    title: '第三者の弁済（民法474条）',
    statement:
      '第三者の弁済とは、債務者以外の第三者が債務を弁済すること（民法474条）。原則として債務は第三者も弁済でき、有効な弁済となれば債務は消滅する（474条1項）。' +
      'もっとも制限があり、弁済をするについて正当な利益を有する者でない第三者は、原則として債務者の意思に反して弁済できず（474条2項。ただし債務者の意思に反することを債権者が知らなかったときは有効）、債権者の意思に反して弁済することもできない（474条3項。ただし債務者の委託を受け債権者がそれを知っていたときは可）。また債務の性質が第三者弁済を許さないとき、又は当事者が禁止・制限する旨の意思表示をしたときは第三者弁済はできない（474条4項）。物上保証人・第三取得者等の正当な利益を有する第三者は債務者の意思に反しても弁済でき、弁済した第三者は債務者への求償権を取得し、弁済による代位（499条以下）により債権者の権利を行使しうる。',
    keyFigures:
      '474条1項＝第三者も弁済可（原則）／2項＝正当な利益なき第三者は債務者の意思に反して弁済不可（債権者善意なら有効）／3項＝同じく債権者の意思に反して弁済不可（債務者の委託＋債権者の認識で可）／4項＝債務の性質・当事者の禁止/制限で排除／正当な利益を有する第三者（物上保証人・第三取得者等）は債務者の意思に反しても弁済可／効果＝求償権＋弁済による代位(499条以下)（e-Gov law id 129AC0000000089）',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第474条' },
      { url: 'https://www.moj.go.jp/content/001255632.pdf', type: 'government', label: '法務省 民法（債権関係）改正 新法の内容（第三者の弁済・474条関係）' },
      { url: 'https://www.businesslawyers.jp/practices/1209', type: 'media', label: 'BUSINESS LAWYERS「民法改正で『債権の準占有者への弁済』等はどう変わった？」' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0474-00/', type: 'media', label: 'クレアール司法書士講座 民法第474条【第三者の弁済】逐条解説' },
    ],
  },
  {
    id: 'infosoc-social-bots',
    discipline: 'information-sociology',
    title: 'ソーシャルボット',
    statement:
      'ソーシャルボット（social bots）とは、ソーシャルメディア上で自動的にコンテンツを生成し人間と相互作用するアルゴリズム的アカウントで、人間らしいプロフィールや振る舞いを模倣して投稿・拡散・フォロー・返信などを行う。Ferraraら（2016, Communications of the ACM）は「自動でコンテンツを生成し人間と相互作用する計算アルゴリズム」と概観した。' +
      '災害情報の自動配信など中立・有益な用途もある一方、世論操作・トレンド工作・誤情報やプロパガンダの増幅・フォロワー水増し・スパムに用いられうる。協調的に動く集団はボットネット、人間が一部介入する半自動アカウントはサイボーグ（Chuら2012）と呼ばれる。検出研究が発展し代表ツールにインディアナ大学のBotometer（旧BotOrNot, 2014）がある。2016年米大統領選・Brexit等での計算プロパガンダ利用、影響力推定や検出の困難（敵対的進化・いたちごっこ）、「ボット」というレッテルの政治的悪用が論点で、LLMの普及でより人間らしいボットの脅威が増す。',
    keyFigures:
      'エミリオ・フェラーラ（Emilio Ferrara）／フィリッポ・メンツァー（Filippo Menczer）／Onur Varol・Clayton Davis（Botometer, インディアナ大学OSoMe）／Zi Chu ら（cyborg, 2012）／Philip N. Howard・Samuel Woolley（計算プロパガンダ）',
    asOf: '2026-06',
    sources: [
      { url: 'https://dl.acm.org/doi/10.1145/2818717', type: 'academic', label: 'Ferrara, Varol, Davis, Menczer & Flammini, “The Rise of Social Bots,” Communications of the ACM 59(7):96-104 (2016)' },
      { url: 'https://ieeexplore.ieee.org/document/6280553/', type: 'academic', label: 'Chu, Gianvecchio, Wang & Jajodia, “Detecting Automation of Twitter Accounts: Are You a Human, Bot, or Cyborg?,” IEEE TDSC (2012) — cyborg/半自動の定義' },
      { url: 'https://www.oii.ox.ac.uk/blog/bots-strongerin-and-brexit-computational-propaganda-during-the-uk-eu-referendum', type: 'academic', label: 'Oxford Internet Institute (Howard & Kollanyi) — Brexit/計算プロパガンダにおける政治ボット' },
      { url: 'https://firstmonday.org/ojs/index.php/fm/article/download/13185/11042', type: 'academic', label: 'Ferrara, “Social bot detection in the age of ChatGPT,” First Monday (2023) — LLM時代の検出課題' },
    ],
  },
  {
    id: 'econ-kinked-demand-curve',
    discipline: 'economics',
    title: '屈折需要曲線（価格の硬直性）',
    statement:
      '屈折需要曲線は、寡占市場で価格が変わりにくい「価格の硬直性」を説明するミクロ経済学・産業組織論の理論である。各企業は、自社が値下げすれば競合も追随するため売上があまり増えない（値下げ側の需要は非弾力的で需要曲線は急）が、値上げしても競合は追随せず自社だけ顧客を失う（値上げ側は弾力的で需要曲線は緩やか）と予想する。' +
      'このため需要曲線は現行価格の点で屈折し、対応する限界収入曲線（MR）は屈折点で不連続な垂直の段差（ギャップ）を持つ。この範囲内では限界費用（MC）が多少変動しても利潤最大化の価格・数量は変わらず、価格が硬直化する。ポール・スウィージーとホール＆ヒッチが1939年に独立に提唱したが、(1)現行価格がどう決まったかは説明できず、(2)スティグラー（1947）の実証では予想された非対称な追随行動が確認されない、との批判がある。',
    keyFigures:
      'ポール・スウィージー（Paul M. Sweezy, 1939）／R・L・ホール & C・J・ヒッチ（Hall & Hitch, 1939）／ジョージ・スティグラー（George Stigler, 1947・批判）',
    asOf: '2026-06',
    sources: [
      { url: 'https://link.springer.com/referenceworkentry/10.1007/978-1-349-58802-2_893', type: 'reference', label: 'The New Palgrave Dictionary of Economics — “Kinked Demand Curve” (Springer)' },
      { url: 'https://en.wikipedia.org/wiki/Kinked_demand', type: 'reference', label: 'Wikipedia — Kinked demand' },
      { url: 'https://www.journals.uchicago.edu/doi/10.1086/256581', type: 'academic', label: 'G. J. Stigler, “The Kinky Oligopoly Demand Curve and Rigid Prices,” Journal of Political Economy 55(5), 1947, pp. 432–449 (University of Chicago Press)' },
      { url: 'https://www.economicsonline.co.uk/definitions/kinked-demand-curve.html/', type: 'reference', label: 'Economics Online — Kinked Demand Curve（弾力/非弾力区間・限界）' },
    ],
  },
  {
    id: 'mgmt-planned-obsolescence',
    discipline: 'management',
    title: '計画的陳腐化（planned obsolescence）',
    statement:
      '計画的陳腐化とは、製品の買い替え需要を人為的に生み出すため、企業が製品の寿命をあえて短く設計したり、モデルチェンジや流行で旧型を時代遅れに見せたりして、消費者に早期の買い替えを促す戦略・慣行である。類型として、(1)機能的・物理的陳腐化（部品をすぐ劣化するよう設計し修理を困難にする）、(2)心理的・スタイル的陳腐化（GMのアルフレッド・スローンが1920年代に導入した自動車の年次モデルチェンジが典型）、(3)システム的陳腐化（互換性の打ち切りやソフトウェア更新終了）がある。' +
      '用語は不動産業者バーナード・ロンドンが1932年の自費出版エッセイで造語し大恐慌対策として政府による「義務的」陳腐化を提唱、1954年に工業デザイナーのブルックス・スティーブンスが「必要以上に少し新しいものを欲しがらせる」と定義して語を普及させ、批評家ヴァンス・パッカードは1960年の『The Waste Makers（浪費をつくり出す人々）』で大量消費社会批判として論じた。古典的事例にポイボス・カルテル（1924年発足、白熱電球の寿命を約1000時間に制限）があり、現代では「修理する権利（right to repair）」運動やサーキュラーエコノミーの文脈で批判的に論じられる。',
    keyFigures:
      'バーナード・ロンドン（Bernard London, 1932・造語）／ブルックス・スティーブンス（Brooks Stevens, 1954・普及）／ヴァンス・パッカード（Vance Packard, 1960・批判）／アルフレッド・スローン（A. Sloan, GM・年次モデルチェンジ）／ポイボス・カルテル（1924, 電球寿命を約1000時間に制限）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/planned-obsolescence', type: 'reference', label: 'Encyclopaedia Britannica “planned obsolescence”（定義・機能/欲求の陳腐化の類型）' },
      { url: 'https://spectrum.ieee.org/the-great-lightbulb-conspiracy', type: 'media', label: 'IEEE Spectrum “The Great Lightbulb Conspiracy”（Phoebus cartel 1924・電球寿命を1000時間に制限）' },
      { url: 'https://en.wikipedia.org/wiki/Planned_obsolescence', type: 'reference', label: 'Wikipedia “Planned obsolescence”（定義・類型・スローンの年次モデルチェンジ・パッカード・right to repair）' },
    ],
  },
  {
    id: 'human-executive-function',
    discipline: 'human-science',
    title: '実行機能（遂行機能）',
    statement:
      '実行機能（executive functions）とは、目標志向的な思考・行動を可能にする高次の認知制御プロセスの総称であり、注意・思考・行動を意識的に制御して計画・問題解決・適応的行動を支える。主に前頭前野が関与する。Diamond（2013）の整理では中核は3つ——抑制制御（衝動や優位反応・注意妨害を抑える自己制御を含む）、ワーキングメモリ（情報を保持・操作する）、認知的柔軟性（視点や課題の切り替え）——で、これらを基盤に推論・計画など高次の実行機能が築かれる。' +
      'Miyake et al.（2000）は更新・抑制・シフティングが分離可能だが相互に関連する（unity and diversity）ことを因子分析で示した。小児期から成人期に発達し高齢で低下し、ADHDや前頭葉損傷と関連、教育・健康・社会経済的成功の予測因子とされる。代表的測定にウィスコンシン・カード分類課題、ストループ課題、ハノイの塔がある。',
    keyFigures:
      'アデル・ダイアモンド（Adele Diamond）／ミヤケ・アキラ（Akira Miyake）／ナオミ・フリードマン（Naomi P. Friedman）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.annualreviews.org/content/journals/10.1146/annurev-psych-113011-143750', type: 'academic', label: 'Diamond, A. (2013). Executive Functions. Annual Review of Psychology, 64, 135–168.' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S001002859990734X', type: 'academic', label: 'Miyake, A. et al. (2000). The Unity and Diversity of Executive Functions ... A Latent Variable Analysis. Cognitive Psychology, 41, 49–100.' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6197939/', type: 'academic', label: 'Friedman, N. P. & Miyake, A. (2017). Unity and Diversity of Executive Functions: A Systematic Review and Re-Analysis of Latent Variable Studies. Cortex, 86, 186–204 (PMC).' },
      { url: 'https://en.wikipedia.org/wiki/Executive_functions', type: 'reference', label: 'Wikipedia: Executive functions（定義・中核要素・測定課題）' },
    ],
  },
  {
    id: 'human-mind-wandering',
    discipline: 'human-science',
    title: 'マインドワンダリング',
    statement:
      'マインドワンダリング（mind-wandering、心のさまよい）は、現在従事している課題や外界の刺激から注意がそれ、自発的に過去の回想・将来の計画・空想などの課題と無関係な思考（task-unrelated thought）へとさまよう現象である。覚醒時の思考のかなりの割合（研究により約30〜50%）を占め、脳のデフォルト・モード・ネットワーク（DMN）の活動と関連づけられる。' +
      'スモールウッドとスクーラーが研究を体系化し（"The restless mind", 2006）、キリングスワース＆ギルバート（2010, Science）は人が起きている時間の約47%で目の前の活動と違うことを考え、その間は概して幸福度が低いと報告した。読解・運転などの課題遂行を妨げ事故やエラーと関連する一方、創造的問題解決・将来計画・自伝的記憶処理といった適応的機能も併せ持つと論じられ、注意・意識・メタ認知研究で重要である。',
    keyFigures:
      'ジョナサン・スモールウッド（Jonathan Smallwood）／ジョナサン・スクーラー（Jonathan Schooler）／マシュー・キリングスワース（Matthew Killingsworth）／ダニエル・ギルバート（Daniel Gilbert）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.science.org/doi/10.1126/science.1192439', type: 'academic', label: 'Killingsworth & Gilbert (2010) “A Wandering Mind Is an Unhappy Mind”, Science 330(6006):932（約47%・幸福度低下）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/17073528/', type: 'academic', label: 'Smallwood & Schooler (2006) “The restless mind”, Psychological Bulletin 132(6):946–958（研究の体系化）' },
      { url: 'https://academic.oup.com/scan/article/12/7/1047/3574671', type: 'academic', label: 'Soc. Cogn. Affect. Neurosci. (Oxford): マインドワンダリングを支えるDMNの構成過程' },
      { url: 'https://dictionary.apa.org/mind-wandering', type: 'reference', label: 'APA Dictionary of Psychology: mind wandering（定義）' },
    ],
  },
  {
    id: 'bizlaw-subrogation-by-payment',
    discipline: 'business-law',
    title: '弁済による代位（民法499条）',
    statement:
      '弁済による代位（代位弁済）とは、債務者に代わって弁済をした第三者（保証人・物上保証人・連帯債務者・第三取得者など）が、弁済によって本来消滅するはずの債権者の権利—原債権およびその担保権・保証等—を、債務者への求償権を確保するために行使できる制度である（民法499条以下）。' +
      '2017年改正（2020年4月施行）後の499条は「債務者のために弁済をした者は、債権者に代位する」と定め、改正前に正当な利益のない第三者へ課していた債権者の承諾要件を廃止し、弁済すれば当然に代位することとした。ただし500条により、正当な利益を有しない者の代位には債権譲渡の対抗要件（467条＝通知・承諾）が準用される。501条は、代位者が自己の求償権の範囲内で債権者の一切の権利を行使できるとし、保証人・物上保証人・第三取得者が競合する場合の代位割合・順序を3項で詳細に定める。',
    keyFigures:
      '根拠条文＝民法499条〜504条（e-Gov law id 129AC0000000089）／499条：弁済者は当然に債権者に代位（改正で承諾要件廃止）／500条：正当な利益を有しない者の代位は467条の対抗要件を準用／501条：求償権の範囲内で原債権・担保権等を行使可・競合時の代位割合（3項）／第三者の弁済（474条）と密接に関連／2017年債権法改正・2020年4月施行',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号、第499条〜第501条）' },
      { url: 'https://www.moj.go.jp/content/000052602.pdf', type: 'government', label: '法務省 民法（債権関係）部会資料 任意代位・法定代位（499条・500条関係）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第501条', type: 'reference', label: 'Wikibooks 民法第501条（弁済による代位の効果・代位割合）' },
    ],
  },
  {
    id: 'infosoc-small-world',
    discipline: 'information-sociology',
    title: 'スモールワールド現象（六次の隔たり）',
    statement:
      'スモールワールド現象とは、社会的ネットワークにおいて任意の2人が、意外に少数の知人の連鎖（中間者）でつながっているという構造的性質で、「六次の隔たり（six degrees of separation）」として知られる。社会心理学者スタンレー・ミルグラムが1960年代に行った連鎖手紙実験（米ネブラスカ州などの出発者から、面識のないボストンの標的人物へ知人の手渡しのみで手紙を届けさせる）で、完了した連鎖の中間者数の中央値が約5〜6であったことから示唆された。ただし完了率が低く（1967年の研究では約296件中64件＝約22%が到達）、方法論的限界も指摘される。' +
      'ネットワーク科学では、ダンカン・ワッツとスティーヴン・ストロガッツが1998年のNature論文「Collective Dynamics of Small-World Networks」で数理モデル化し、規則的な格子に少数のランダムな近道（ショートカット）を加えるだけで、高いクラスター性を保ったまま平均経路長が劇的に短くなることを示した。マーク・グラノヴェッターの「弱い紐帯の強さ」とも関連し、感染症・情報・流行の伝播や、インターネット・脳・送電網など多様なネットワークに見られる普遍的構造として論じられる。',
    keyFigures:
      'スタンレー・ミルグラム（Stanley Milgram）／ダンカン・ワッツ（Duncan Watts）／スティーヴン・ストロガッツ（Steven Strogatz）／マーク・グラノヴェッター（Mark Granovetter）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nature.com/articles/30918', type: 'academic', label: 'Watts, D.J. & Strogatz, S.H. (1998) “Collective Dynamics of Small-World Networks”, Nature 393, 440-442（査読論文・原典）' },
      { url: 'https://psychology.fas.harvard.edu/people/stanley-milgram', type: 'reference', label: 'Harvard University, Department of Psychology — Stanley Milgram（大学公式・人物典拠）' },
      { url: 'https://en.wikipedia.org/wiki/Small-world_experiment', type: 'reference', label: 'Wikipedia: Small-world experiment（実験概要・中間者数・完了率）' },
      { url: 'https://news.stanford.edu/stories/2023/07/strength-weak-ties', type: 'reference', label: 'Stanford Report — “The strength of weak ties”（Granovetter弱い紐帯との関連）' },
    ],
  },
  {
    id: 'econ-two-part-tariff',
    discipline: 'economics',
    title: '二部料金制（two-part tariff）',
    statement:
      '二部料金制とは、財・サービスの価格を「定額の入場料・基本料（fixed fee／access charge）」と「使用量に応じた従量料金（per-unit price）」の二部に分ける非線形の価格設定戦略であり、独占や市場支配力を持つ企業が、単一価格よりも多くの消費者余剰を抽出する手段として分析される（第二種価格差別の一形態）。' +
      '基本理論では、消費者が同質と仮定すると、従量料金を限界費用に等しく設定して効率的な数量（死荷重ゼロ）を実現し、固定料金で消費者余剰を全額吸い上げるのが企業の最適戦略となる。消費者が異質な場合は限界費用価格づけが最適とは限らず分析は複雑化する。ウォルター・オイ（Walter Oi, 1971）の論文「A Disneyland Dilemma」が古典で、典型例は遊園地（入場料＋アトラクション料金）、会員制クラブ（年会費＋利用料）、電気・ガス・電話（基本料金＋従量料金）、コストコ（年会費＋商品代）。',
    keyFigures:
      'ウォルター・オイ（Walter Y. Oi, "A Disneyland Dilemma: Two-Part Tariffs for a Mickey Mouse Monopoly", QJE 1971）／固定料金（access charge）＋従量料金の二部構成／最適: 従量料金=限界費用・固定料金=消費者余剰（同質消費者）／第二種価格差別・非線形価格づけ',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Two-part_tariff', type: 'reference', label: 'Wikipedia — Two-part tariff（定義・構成・例・価格差別の文脈）' },
      { url: 'https://academic.oup.com/qje/article-abstract/85/1/77/1861193', type: 'academic', label: 'Walter Y. Oi, “A Disneyland Dilemma: Two-Part Tariffs for a Mickey Mouse Monopoly,” Quarterly Journal of Economics 85(1), 1971, pp.77–96（Oxford Academic）' },
      { url: 'https://socialsci.libretexts.org/Bookshelves/Economics/The_Economics_of_Food_and_Agricultural_Markets_(Barkley)/04:__Pricing_with_Market_Power/4.05:_Two-Part_Pricing', type: 'academic', label: 'Social Sci LibreTexts (Barkley) — Two-Part Pricing（最適理論 P=MC＋固定料金=消費者余剰）' },
    ],
  },
  {
    id: 'mgmt-cannibalization',
    discipline: 'management',
    title: 'カニバリゼーション（市場共食い）',
    statement:
      'カニバリゼーション（market/product cannibalization、市場の共食い／自社競合）とは、企業が新製品・新ブランド・新チャネルを導入した結果、自社の既存製品の販売数量・売上・市場シェアが減少する現象を指す。「共食い」の比喩であり、定義上は自社製品間でのみ成立し、競合から売上を奪う行為はこれに含まれない。製品が類似し同一ターゲット層を狙うときに起きやすく、製品ライン拡張やブランド・ポートフォリオ管理、実店舗とECの新旧チャネル併存の文脈で論じられる。' +
      '非計画的に既存利益を侵食する負の側面がある一方、競合に奪われるより自社内で需要を移転させるべく古い製品を陳腐化させてでも先行投入する「計画的カニバリゼーション」もある。アップルがiPodをiPhoneで自社共食いさせた事例が代表例。指標はカニバリゼーション率（既存製品の売上減少分÷新製品売上）で、真の増分需要と移転需要の区別が測定上の難点となる。',
    keyFigures:
      '定義＝自社の新製品が既存製品の売上・シェアを奪う現象（自社製品間でのみ成立）／文脈＝ライン拡張・ブランドポートフォリオ・新旧チャネル併存／非計画的カニバリ vs 計画的カニバリ（先行陳腐化で需要を自社内移転、アップルiPod→iPhone）／指標＝カニバリゼーション率＝既存売上減÷新製品売上／論点＝増分需要と移転需要の区別の困難',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.encyclopedia.com/economics/encyclopedias-almanacs-transcripts-and-maps/cannibalization', type: 'reference', label: 'Encyclopedia.com — Cannibalization（定義と自社製品間限定の弁別）' },
      { url: 'https://en.wikipedia.org/wiki/Cannibalization_(marketing)', type: 'reference', label: 'Wikipedia — Cannibalization (marketing)（定義・偶発/意図的の区別・cannibalisation strategy）' },
      { url: 'https://arxiv.org/pdf/1811.03362', type: 'academic', label: 'arXiv 1811.03362 — Lotka-Volterra model of (inverse) product cannibalisation in ICTs（iPhone/iPad の学術的カニバリ分析）' },
    ],
  },
  {
    id: 'human-self-compassion',
    discipline: 'human-science',
    title: 'セルフ・コンパッション（自己への思いやり）',
    statement:
      'セルフ・コンパッションとは、苦痛・失敗・自己の不十分さに直面したとき、自分を厳しく批判する代わりに、親しい友人に向けるような優しさ・理解・思いやりを自分自身へ向ける態度を指す。米テキサス大学オースティン校のクリスティン・ネフが2003年に概念化し、Self-Compassion Scale（自己への思いやり尺度）として測定可能にした。ネフはこれを3つの相互に関連する構成要素から成るとする：(1)自分への優しさ 対 自己批判、(2)共通の人間性（苦しみや不完全さは人類に共通の経験だと捉える）対 孤立、(3)マインドフルネス（苦痛な感情に過剰同一化せずバランスよく気づく）対 過剰同一化。' +
      '仏教思想の慈悲（compassion）に着想を得た概念で、APA心理学辞典も「自己の不十分さや失敗に対する非批判的な姿勢を伴う、仏教思想に由来する構成概念」と定義する。自尊心（self-esteem）が他者比較・成功・社会的承認に依存して変動しやすいのに対し、セルフ・コンパッションは評価に依存せず失敗時にも安定して自己価値を支える点で区別される（ネフ＆フォンク 2009）。抑うつ・不安・ストレスの低減やレジリエンス・幸福感の向上と関連づけられ、ネフとガーマーがマインドフル・セルフ・コンパッション（MSC）プログラムを開発した。',
    keyFigures:
      'クリスティン・ネフ（Kristin Neff, テキサス大学オースティン校・2003年概念化）／クリストファー・ガーマー（Christopher Germer, MSC共同開発者）',
    asOf: '2026-06',
    sources: [
      { url: 'https://dictionary.apa.org/self-compassion', type: 'reference', label: 'APA Dictionary of Psychology — “Self-compassion”（米国心理学会）' },
      { url: 'https://www.tandfonline.com/doi/abs/10.1080/15298860309032', type: 'academic', label: 'Neff, K. D. (2003). Self-Compassion: An Alternative Conceptualization of a Healthy Attitude Toward Oneself. Self and Identity, 2(2)（概念の原典）' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/19076996/', type: 'academic', label: 'Neff, K. D. & Vonk, R. (2009). Self-compassion versus global self-esteem. Journal of Personality（自尊心との区別, PubMed）' },
    ],
  },
  {
    id: 'human-psychological-reactance',
    discipline: 'human-science',
    title: '心理的リアクタンス',
    statement:
      '心理的リアクタンスとは、自分が持つと信じる選択・行動の自由が、禁止・強制・説得圧力など外部から脅かされ、または奪われたと感じたときに、その自由を回復しようとして生じる不快な動機づけ的喚起・反発状態である。ジャック・ブレーム（Jack W. Brehm）が1966年の著書『A Theory of Psychological Reactance』で理論化した。' +
      '主な反応は、(1)脅かされた選択肢の魅力が増す「禁断の果実」効果（ロミオとジュリエット効果も一種）、(2)失われた自由を回復するため禁じられた行動をあえて取り説得が逆効果になるブーメラン効果、(3)脅かす相手への反感である。喚起の強さは脅かされた自由の重要性・脅威の大きさ・脅かされた自由の数に依存し、説得や健康コミュニケーション、希少性マーケティング、育児・教育、検閲の場面に応用される。認知的不協和や確証バイアス・希少性原理・同調とは関連するが、自由回復の動機づけという中核機制で区別される。',
    keyFigures:
      'ジャック・ブレーム（Jack W. Brehm, 1966）／シャロン・ブレーム（Sharon S. Brehm）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.frontiersin.org/journals/communication/articles/10.3389/fcomm.2019.00056/full', type: 'academic', label: 'Frontiers in Communication — Psychological Reactance and Persuasive Health Communication: A Review of the Literature (2019)' },
      { url: 'https://scholar.dominican.edu/cgi/viewcontent.cgi?article=1002&context=psychology-faculty-scholarship', type: 'academic', label: 'Rosenberg & Siegel — A 50-year review of psychological reactance theory (Dominican University)' },
      { url: 'https://en.wikipedia.org/wiki/Reactance_(psychology)', type: 'reference', label: 'Wikipedia — Reactance (psychology)' },
    ],
  },
  {
    id: 'bizlaw-set-off',
    discipline: 'business-law',
    title: '相殺（民法505条）',
    statement:
      '相殺とは、二人が互いに同種の目的を有する債務を負担する場合に、当事者の一方からの一方的意思表示により双方の債務を対当額で消滅させる制度である（民法505条1項）。例えばAがBに100万円の貸金債権を持ち、BがAに80万円の売買代金債権を持つとき、一方が相殺を意思表示すれば80万円分が消滅し差額が残る。' +
      '相殺の要件（相殺適状）は、(1)対立する債権の存在、(2)同種の目的（通常は金銭債権）、(3)双方の債務が弁済期にあること、(4)債務の性質が相殺を許すこと。相殺する側の債権（自働債権）は弁済期到来が必要だが、相殺される側（受働債権）は期限の利益を放棄できるため必ずしも要しない。相殺は意思表示によって行い条件・期限を付せず、効力は相殺適状時に遡及する（506条）。509条（2017年改正）は悪意による不法行為・人の生命身体侵害の損害賠償債務を受働債権とする相殺を禁止し、511条は差押え後に取得した債権による相殺は差押債権者に対抗できないとする。担保的機能（実質的な優先弁済）を持つ点が実務上重要で、過失相殺（418条・722条）とは別概念である。',
    keyFigures:
      '一方的意思表示で対当額の債務を消滅（505条1項）／自働債権（弁済期到来必要）・受働債権（期限の利益放棄可）の区別／要件＝相殺適状／506条：意思表示で行い条件期限を付せず効力は相殺適状時に遡及／509条（2017改正）：悪意の不法行為・生命身体侵害の損害賠償債務を受働債権とする相殺禁止／511条：差押え後取得債権による相殺は対抗不可／担保的機能／過失相殺（418・722条）とは別概念／e-Gov law id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号、第505条〜第512条の2）' },
      { url: 'https://www.nta.go.jp/about/organization/ntc/kenkyu/ronsou/107/04/index.htm', type: 'government', label: '国税庁 税務大学校論叢「差し押さえた債権を受働債権とする相殺について」（民法511条）' },
      { url: 'https://www.lawschool.tsukuba.ac.jp/wp/wp-content/uploads/2024/03/da8191bd4a70bd14d0d207a622cc7e91.pdf', type: 'academic', label: '筑波大学ロースクール 岡本裕樹「日本相殺法概観（3）」研究ノート（相殺適状・法定相殺）' },
    ],
  },
  {
    id: 'infosoc-context-collapse',
    discipline: 'information-sociology',
    title: 'コンテキストの崩壊（文脈崩壊）',
    statement:
      'コンテキストの崩壊（context collapse）とは、ソーシャルメディア上で、本来は別々の文脈（友人・家族・同僚・上司・見知らぬ他人など異なる相手や場面）に向けられていた複数の聴衆が一つの場に集約・折り重なり、それぞれに適した自己呈示や発言の使い分けが困難になる現象を指す。対面では人は相手・場面ごとに振る舞いを調整し聴衆を分離する（ゴッフマンの自己呈示論・audience segregation）が、SNSでは一つの投稿が多様な聴衆に同時に届くため、その切り替えが崩れる。' +
      'アリス・マーウィックとダナ・ボイドが2011年論文「I tweet honestly, I tweet passionately」（New Media & Society）で概念を広め、投稿者は実際の聴衆を把握できず頭の中で想定した「想像された聴衆（imagined audience）」へ発信すると論じた。先行してメイロウィッツ（1985『No Sense of Place』）が電子メディアによる社会的場面の融合を指摘していた。誰に見られても無難な投稿へ収斂する「最低共通分母（lowest common denominator）」効果、自己検閲、プライバシー管理、炎上（文脈外流出）と関連する。',
    keyFigures:
      'アリス・マーウィック（Alice E. Marwick）／ダナ・ボイド（danah boyd）／ジョシュア・メイロウィッツ（Joshua Meyrowitz）／アーヴィング・ゴッフマン（Erving Goffman）',
    asOf: '2026-06',
    sources: [
      { url: 'https://journals.sagepub.com/doi/10.1177/1461444810365313', type: 'academic', label: 'Marwick, A. E. & boyd, d. (2011) “I tweet honestly, I tweet passionately: Twitter users, context collapse, and the imagined audience.” New Media & Society 13(1): 114–133 (SAGE)' },
      { url: 'https://academic.oup.com/jcmc/article/23/3/127/4962540', type: 'academic', label: '“One Size Fits All: Context Collapse, Self-Presentation Strategies and Language Styles on Facebook.” Journal of Computer-Mediated Communication 23(3) (Oxford Academic)' },
      { url: 'https://en.wikipedia.org/wiki/Context_collapse', type: 'reference', label: 'Wikipedia: Context collapse（概念・最低共通分母・ゴッフマンの聴衆分離との関係）' },
    ],
  },
  {
    id: 'econ-vickrey-auction',
    discipline: 'economics',
    title: 'ヴィックリー・オークション（第二価格入札）',
    statement:
      'ヴィックリー・オークションは、各入札者が他者の入札を見ずに札を投じる封印入札（sealed-bid）で、最高額を付けた者が落札するが、支払額は2番目に高い入札額（second price）となる方式である。ウィリアム・ヴィックリーが1961年の論文「Counterspeculation, Auctions, and Competitive Sealed Tenders」で分析し、彼は非対称情報下の誘因理論への貢献等で1996年ノーベル経済学賞を受賞した。' +
      '最大の特徴は、支払いが自分の入札ではなく他者の入札で決まるため、真の評価額をそのまま入れる正直入札が（弱）支配戦略となる耐戦略性（strategy-proof）にある。独立私的価値の対称環境では、期待収入が第一価格・イングリッシュ・ダッチ各オークションと等しくなる（収入同値定理）。競り上げ式イングリッシュ・オークションと戦略的に同値で、複数財への一般化がVCG（Vickrey–Clarke–Groves）メカニズムである。',
    keyFigures:
      'ウィリアム・ヴィックリー（William Vickrey, 1914–1996, 1996年ノーベル経済学賞）／エドワード・クラーク（Edward Clarke）／セオドア・グローブス（Theodore Groves）／正直入札が支配戦略・収入同値定理・VCGへの一般化',
    asOf: '2026-06',
    sources: [
      { url: 'https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1961.tb02789.x', type: 'academic', label: 'Vickrey, W. (1961) “Counterspeculation, Auctions, and Competitive Sealed Tenders”, The Journal of Finance 16(1): 8–37 (Wiley)' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/1996/vickrey/facts/', type: 'reference', label: 'NobelPrize.org — Sveriges Riksbank Prize in Economic Sciences 1996 (William Vickrey)' },
      { url: 'https://en.wikipedia.org/wiki/Vickrey_auction', type: 'reference', label: 'Wikipedia — Vickrey auction（メカニズム・支配戦略・英国式との戦略的同値・収入同値）' },
    ],
  },
  {
    id: 'mgmt-path-goal-theory',
    discipline: 'management',
    title: 'パス・ゴール理論（リーダーシップ）',
    statement:
      'リーダーの役割を、部下が目標（ゴール）を達成するための経路（パス）を明確にし、障害を除去し、必要な支援や報酬を与えて部下の動機づけ・満足・業績を高めることと捉える、リーダーシップの条件適合（コンティンジェンシー）理論。ロバート・ハウスが1971年に提唱し（"A Path-Goal Theory of Leader Effectiveness", Administrative Science Quarterly）、1996年に再定式化した。動機づけの期待理論（expectancy theory）に基礎を置く。' +
      'リーダーは状況に応じて4つの行動——指示型（directive）・支援型（supportive）・参加型（participative）・達成志向型（achievement-oriented）——を使い分けるべきとする。リーダー行動が部下の動機づけに与える効果は、部下の特性（統制の所在・経験・能力）と環境要因（課題構造・公式権限体系・作業集団）が調整（モデレート）する。フィードラーのコンティンジェンシーモデルやハーシー＆ブランチャードのSL理論と並ぶ状況適合理論である。',
    keyFigures:
      'ロバート・ハウス（Robert J. House, 1971提唱・1996再定式化）／ヴィクター・ブルーム（Victor H. Vroom, 期待理論の基礎）／4行動：指示型・支援型・参加型・達成志向型',
    asOf: '2026-06',
    sources: [
      { url: 'https://eric.ed.gov/?id=EJ045452', type: 'academic', label: 'House, R. J. (1971) “A Path Goal Theory of Leader Effectiveness”, Administrative Science Quarterly 16, 321-338（ERIC EJ045452）' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S1048984396900247', type: 'academic', label: 'House, R. J. (1996) “Path-goal theory of leadership: Lessons, legacy, and a reformulated theory”, The Leadership Quarterly 7(3), 323-352' },
      { url: 'https://en.wikipedia.org/wiki/Path%E2%80%93goal_theory', type: 'reference', label: 'Wikipedia「Path–goal theory」（1971提唱・1996改訂、期待理論基礎、コンティンジェンシー変数）' },
    ],
  },
  {
    id: 'human-door-in-the-face',
    discipline: 'human-science',
    title: 'ドア・イン・ザ・フェイス・テクニック（譲歩的要請法）',
    statement:
      'まず相手がほぼ確実に断る過大な要請を提示し、拒否された後に本命のより小さな要請を出すと、最初から小さな要請を単独で出すより承諾されやすくなる説得技法・現象である。' +
      'ロバート・チャルディーニらが1975年の論文（Journal of Personality and Social Psychology）で実証し、学生に2年間の非行少年カウンセリングのボランティアを依頼して断られた後に一日の動物園引率を依頼すると承諾率が約50%に達し、後者を単独で頼んだ統制群（約17%）を大きく上回った。説明原理は、要求引き下げを譲歩とみなし応じる義務を感じる返報性（譲歩の返報性）、大要求の後で小要求が相対的に小さく見える知覚的コントラスト、拒否による罪悪感・自己呈示である。小→大と段階を踏むフット・イン・ザ・ドア（一貫性に基づく）とは対照的な大→小の技法である点が重要。',
    keyFigures:
      'ロバート・B・チャルディーニ（Robert B. Cialdini, 1975, JPSP）／譲歩の返報性・知覚的コントラスト・罪悪感／フット・イン・ザ・ドア（段階的要請法）とは対照（大→小 vs 小→大）',
    asOf: '2026-06',
    sources: [
      { url: 'https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Influence_Compliance/Cialdini.et.al.Reciprocal.Concessions.Procedure.1975.article.pdf', type: 'academic', label: 'Cialdini et al. (1975) “Reciprocal Concessions Procedure for Inducing Compliance: The Door-in-the-Face Technique”, JPSP 31(2), 206-215（原典・MITホスト全文）' },
      { url: 'https://www.ebsco.com/research-starters/psychology/door-face-technique', type: 'reference', label: 'EBSCO Research Starters: Psychology — Door-in-the-face technique（説明原理・FITDとの区別）' },
      { url: 'https://en.wikipedia.org/wiki/Door-in-the-face_technique', type: 'reference', label: 'Wikipedia — Door-in-the-face technique（実験数値）' },
    ],
  },
  {
    id: 'human-decision-fatigue',
    discipline: 'human-science',
    title: '決定疲労（decision fatigue）',
    statement:
      '決定疲労とは、人が次々と意思決定を重ねるうちに判断の質が低下し、決定そのものを避けて現状維持やデフォルト選択に流れたり、衝動的・短絡的な選択に傾いたりするとされる現象である。ロイ・バウマイスターらの自我消耗（ego depletion）研究の文脈で論じられ、意志力・自己制御を使うほど枯渇する有限の資源とみなす自己制御資源モデルと関連づけられる。' +
      '代表例として、ダンジガーらの2011年PNAS論文は、イスラエルの仮釈放審査で休憩・食事直後に許可率が高く、審理が進むと低下して却下（デフォルト）に流れたと報告した。ただし同研究には案件順序の交絡など方法論的批判があり、また自我消耗効果自体も大規模事前登録再現研究（Hagger et al. 2016）で効果が確認されず、効果量や再現性をめぐる議論が続いている点に留意が必要である。応用として、重要な決定を午前に行う・選択肢を絞る・デフォルト設計（ナッジ）などが挙げられる。',
    keyFigures:
      'ロイ・バウマイスター（Roy Baumeister, 自我消耗）／Shai Danziger・Jonathan Levav・Liora Avnaim-Pesso（2011 PNAS 仮釈放研究）／Martin Hagger（2016 再現研究）／再現性論争あり',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Decision_fatigue', type: 'reference', label: 'Wikipedia「Decision fatigue」— 定義・自我消耗との関係・Danziger研究' },
      { url: 'https://www.pnas.org/doi/10.1073/pnas.1018033108', type: 'academic', label: 'Danziger, Levav & Avnaim-Pesso (2011) “Extraneous factors in judicial decisions”, PNAS 108(15):6889–6892' },
      { url: 'https://journals.sagepub.com/doi/10.1177/1745691616652873', type: 'academic', label: 'Hagger et al. (2016) “A Multilab Preregistered Replication of the Ego-Depletion Effect”, Perspectives on Psychological Science（再現性論争）' },
    ],
  },
  {
    id: 'bizlaw-earnest-money',
    discipline: 'business-law',
    title: '手付（民法557条）',
    statement:
      '手付とは、売買等の契約締結に際し当事者の一方から相手方へ交付される金銭その他の有価物であり、機能により証約手付（契約成立の証拠）・解約手付（解除権を留保する手付）・違約手付（債務不履行時の違約罰または損害賠償の予定）に分かれる。' +
      '民法557条が定めるのは解約手付の効果で、相手方が契約の履行に着手するまでは、買主は手付を放棄し（手付流し）、売主はその倍額を現実に提供して（手付倍返し）、契約を解除できる。2017年改正（2020年施行）で「償還」が「現実に提供して」に改められ判例法理が明文化された。「履行の着手」は相手方の着手を基準とし（自己が着手していても相手方が未着手なら解除可とするのが判例・通説）、解除に債務不履行は不要で、557条2項が545条4項を排除するため別途の損害賠償は生じない。実務では不動産売買で代金の5〜10%程度の手付が広く用いられる。',
    keyFigures:
      '民法557条1項：相手方の履行着手前は買主は手付放棄・売主は倍額の現実の提供で解除可（債務不履行・帰責事由不要）／557条2項：545条4項を排除し手付解除では損害賠償不可／「履行の着手」は相手方基準（判例・通説）／2017年改正で「償還」→「現実に提供」明文化／三種＝証約・解約・違約手付（557条は解約手付）／e-Gov law id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号）第557条 手付' },
      { url: 'https://ja.wikibooks.org/wiki/民法第557条', type: 'reference', label: 'Wikibooks 民法第557条（手付の種類・解約手付・履行の着手・545条4項排除）' },
      { url: 'https://tek-law.jp/civil-code/claims/contracts/sale/article-557/', type: 'media', label: '弁護士解説 民法第557条（手付）— 解約手付・現実の提供・損害賠償不発生' },
    ],
  },
  {
    id: 'infosoc-slacktivism',
    discipline: 'information-sociology',
    title: 'スラックティビズム',
    statement:
      'スラックティビズム（slacktivism、slacker＝怠け者＋activism の混成語。clicktivism とも）とは、SNSの「いいね」・シェア・ハッシュタグ拡散・オンライン署名・プロフィール画像変更など、ごく低コスト・低リスクで行える象徴的な社会的・政治的支援行動を指す概念で、しばしば批判的に用いられる。' +
      '本人は社会貢献したと感じる（feel-good）一方、現実の政治的・社会的インパクトは乏しく、寄付・デモ・投票といった本格的関与の代替になる（置換効果・モラルライセンシング）と批判される。Kristofferson, White & Peloza（2014, Journal of Consumer Research）は、公的に観察されるトークン的支援は後続の意味ある支援につながりにくいが、私的な支援は後続関与を高めうると報告した。Morozov が『The Net Delusion』で批判的に論じ普及させた。一方、低コスト参加が動員の入口や規範変化となる肯定論もある（例：アイス・バケツ・チャレンジ、#BlackLivesMatter・#MeToo）。',
    keyFigures:
      'Kirk Kristofferson／Katherine White／John Peloza（2014, JCR）／Evgeny Morozov（『The Net Delusion』批判）／clicktivism・モラルライセンシング・置換効果 vs 動員の入口',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/jcr/article-abstract/40/6/1149/2907521', type: 'academic', label: 'Kristofferson, White & Peloza (2014) “The Nature of Slacktivism”, Journal of Consumer Research 40(6):1149' },
      { url: 'https://link.springer.com/10.1007/978-3-031-32257-0_50-1', type: 'reference', label: 'Springer Nature, Encyclopedia of Diversity, Equity, Inclusion and Spirituality — “Slacktivism”' },
      { url: 'https://en.wikipedia.org/wiki/Slacktivism', type: 'reference', label: 'Wikipedia — Slacktivism（定義・語源・批判と擁護の両論）' },
    ],
  },
  {
    id: 'econ-stackelberg-competition',
    discipline: 'economics',
    title: 'シュタッケルベルク競争（先導者・追随者モデル）',
    statement:
      'シュタッケルベルク競争は、寡占市場で企業が生産「数量」を戦略変数とし、意思決定に時間的な先後（逐次手番）がある寡占モデルである。先導者（リーダー）が先に生産量を決定し、追随者（フォロワー）はそれを観察したうえで自らの最適生産量を選ぶ。ドイツの経済学者ハインリヒ・フォン・シュタッケルベルクが1934年の著書『Marktform und Gleichgewicht（市場形態と均衡）』で示した。' +
      '同時手番のクールノー競争と異なり、先導者は自社の数量が追随者の反応関数に与える影響をバックワード・インダクションで織り込んで行動する。結果として先導者はクールノー均衡より多く生産し利潤も増やす「先行者の利益」を得る一方、追随者の生産量・利潤は減る。市場全体の総生産量はクールノー均衡より多く価格は低い。生産能力への先行投資などコミットメントが優位を生む、部分ゲーム完全均衡の応用例である。',
    keyFigures:
      'ハインリヒ・フォン・シュタッケルベルク（Heinrich von Stackelberg, 1934）／アントワーヌ・クールノー（比較対象の同時手番モデル）／先行者の利益・反応関数・部分ゲーム完全均衡',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Stackelberg_competition', type: 'reference', label: 'Wikipedia — Stackelberg competition（定義・1934年Stackelberg著作・逐次手番・反応関数・先行者利益）' },
      { url: 'https://people.bath.ac.uk/sm2446/Oligopoly.pdf', type: 'academic', label: 'University of Bath 講義ノート Oligopoly — クールノーとの比較・先導者の高生産/高利潤' },
      { url: 'https://open.oregonstate.education/intermediatemicroeconomics/chapter/module-18/', type: 'academic', label: 'Oregon State University 公開教科書 Intermediate Microeconomics — Cournot/Bertrand/Stackelberg・バックワード・インダクション解' },
    ],
  },
  {
    id: 'mgmt-adhocracy',
    discipline: 'management',
    title: 'アドホクラシー',
    statement:
      'アドホクラシー（adhocracy）とは、官僚制（bureaucracy）と対比される、柔軟・適応的・分権的で非公式な組織形態・組織文化を指す。ラテン語「ad hoc（特定目的の・その場限りの）」と「-cracy（支配）」の合成語で、ウォーレン・ベニスが1968年『The Temporary Society』で用い、アルビン・トフラーが1970年『Future Shock（未来の衝撃）』で広めた。' +
      '固定的階層・標準化手続き・明確な職務分掌に依らず、変化する状況に応じて専門家がプロジェクトやチーム単位で柔軟に編成され、相互調整（mutual adjustment）で協働する。ヘンリー・ミンツバーグは組織構成の一類型として理論化し、複雑で動態的な環境やイノベーションに適すとした（運営型/管理型の区別あり）。キャメロン＆クインの競合価値フレームワークでは柔軟性×外部志向＝創造性重視の文化型とされる。一方で曖昧さ・対立・効率性の低さといった欠点もある。',
    keyFigures:
      'アルビン・トフラー（Alvin Toffler, 1970『Future Shock』で普及）／ヘンリー・ミンツバーグ（Henry Mintzberg, 組織類型として理論化）／ウォーレン・ベニス（Warren Bennis, 1968造語）／キャメロン＆クイン（競合価値フレームワーク）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Adhocracy', type: 'reference', label: 'Adhocracy — Wikipedia（語源・Bennis造語/Toffler普及・Mintzbergの定義と運営型/管理型）' },
      { url: 'https://link.springer.com/article/10.1186/s41469-019-0062-9', type: 'academic', label: 'Lee & Edmondson (2019) “What makes self-managing organizations novel?” Journal of Organization Design (Springer)' },
      { url: 'https://www.ebsco.com/research-starters/literature-and-writing/future-shock-explores-impact-change', type: 'reference', label: 'EBSCO Research Starter — Toffler『Future Shock』とアドホクラシー概念' },
    ],
  },
  {
    id: 'mgmt-matrix-organization',
    discipline: 'management',
    title: 'マトリックス組織',
    statement:
      'マトリックス組織とは、組織を職能（機能：開発・製造・営業・財務など）と製品／プロジェクト／地域という2つ以上の次元で同時に編成し、従業員が各軸の管理者の双方に報告する「二重の指揮系統（two-boss system）」をもつ組織構造である。典型的には職能マネジャーが業務・技術面の遂行責任を、プロジェクト／製品マネジャーがチーム全体の成果責任を負う。' +
      '1960〜70年代に米国航空宇宙産業でプロジェクト管理の必要から発展した（古典は Davis & Lawrence『Matrix』1977、HBR論文「Problems of Matrix Organizations」1978）。職能の専門性とプロジェクトの機動性の両立・人的資源の柔軟な共有・部門横断的な調整の促進・環境変化への対応を利点とする一方、命令一元性（unity of command）の原則に反するため権限の対立やあいまいさ、二人の上司による役割葛藤、調整コストと会議の増加、責任所在の不明確化、権力闘争を欠点とする。強さによりPMBOKは弱／バランス型／強マトリックスに分類する。',
    keyFigures:
      '二次元同時編成（職能×製品/プロジェクト/地域）・二重指揮系統（two-boss）／起源は1960年代米国航空宇宙産業／古典＝Davis & Lawrence『Matrix』1977・HBR「Problems of Matrix Organizations」1978／命令一元性違反・役割葛藤・権力闘争／PMBOK：弱・バランス型・強マトリックス',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/money/matrix-organization', type: 'reference', label: 'Encyclopaedia Britannica (Money) — “Matrix organization: Advantages & Disadvantages”（定義・二重報告・利点欠点）' },
      { url: 'https://hbr.org/1978/05/problems-of-matrix-organizations', type: 'academic', label: 'Davis, S. M. & Lawrence, P. R. (1978) “Problems of Matrix Organizations,” Harvard Business Review（古典論文）' },
      { url: 'https://www.pmi.org/learning/library/matrix-organization-structure-reason-evolution-1837', type: 'academic', label: 'Project Management Institute (PMI) — “The Matrix Organization”（航空宇宙起源・構造の進化）' },
    ],
  },
  {
    id: 'human-regulatory-focus',
    discipline: 'human-science',
    title: '制御焦点理論（促進焦点・予防焦点）',
    statement:
      '人が目標を追求する際の自己制御には、性質の異なる2つの動機づけ志向があるとする社会心理学の理論。E・トーリー・ヒギンズが1997年論文「Beyond Pleasure and Pain」（American Psychologist）等で提唱した。' +
      '促進焦点は理想・願望・成長・獲得（gains）に関心を向け、ポジティブな結果の有無に敏感で熱望（eagerness）方略を採り、利益を逃さないことを重視する。予防焦点は義務・責任・安全・損失回避に関心を向け、ネガティブな結果に敏感で警戒（vigilance）方略を採り、誤りを避けることを重視する。焦点は慢性的気質としても状況的に誘導される一時的状態としても生じる。方略が自分の焦点と合致するとき動機づけや説得効果が高まる「制御適合（regulatory fit、正しいと感じる）」が重要概念で、マーケティング・意思決定・健康行動に広く応用される。',
    keyFigures:
      'E・トーリー・ヒギンズ（E. Tory Higgins, 1997）／促進焦点（eagerness・獲得）・予防焦点（vigilance・損失回避）／制御適合（regulatory fit）',
    asOf: '2026-06',
    sources: [
      { url: 'https://onlinelibrary.wiley.com/doi/abs/10.1002/9781118900772.etrds0279', type: 'reference', label: 'E. Tory Higgins「Regulatory Focus Theory」Wiley Online Library 学術参照工具' },
      { url: 'https://pubmed.ncbi.nlm.nih.gov/15008644/', type: 'academic', label: 'Cesario, Grant & Higgins「Regulatory Fit and Persuasion: Transfer From Feeling Right」PubMed（査読論文）' },
      { url: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.531147/full', type: 'academic', label: 'Frontiers in Psychology 査読論文（促進／予防の自己制御と方略を解説）' },
    ],
  },
  {
    id: 'bizlaw-mistake',
    discipline: 'business-law',
    title: '錯誤（民法95条）',
    statement:
      '錯誤とは、表意者の認識（内心の意思）と表示または前提が一致せず、本人がその不一致に気づかないまま意思表示をすることをいう（民法95条）。2017年改正（平成29年法律第44号、2020年4月施行）で効果が「無効」から「取消し」に整理された。' +
      '1項は、①意思表示に対応する意思を欠く錯誤（表示錯誤）、または②表意者が法律行為の基礎とした事情についての認識が真実に反する錯誤（基礎事情の錯誤＝動機の錯誤）で、その錯誤が法律行為の目的及び取引上の社会通念に照らして重要なものであるとき、意思表示を取り消せると定める。2項は、基礎事情の錯誤による取消しはその事情が法律行為の基礎とされていることが表示されていたときに限り認める。3項は、表意者に重大な過失がある場合は原則取消しを認めないが、相手方が悪意・重過失のとき、又は共通錯誤のときは例外として取消し可とする。4項は、錯誤による取消しを善意でかつ過失がない第三者に対抗できないとする。詐欺・強迫（96条）と並ぶ意思表示の瑕疵の制度である。',
    keyFigures:
      '効果は「無効」→「取消し」に改正（2020年4月施行）／2類型＝表示錯誤＋基礎事情の錯誤（動機の錯誤）／要件＝法律行為の目的・取引上の社会通念に照らして重要／動機の錯誤は基礎事情が「表示」されていたときに限り取消し可（2項）／重過失で原則取消し不可・例外は相手方の悪意重過失/共通錯誤（3項）／善意無過失の第三者に対抗不可（4項）／平成29年法律第44号',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号）第95条' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法の一部を改正する法律（債権法改正）について' },
      { url: 'https://ja.wikibooks.org/wiki/民法第95条', type: 'reference', label: 'Wikibooks 民法第95条（錯誤の2類型・取消し・重過失の例外・第三者保護）' },
    ],
  },
  {
    id: 'infosoc-technological-determinism',
    discipline: 'information-sociology',
    title: '技術決定論',
    statement:
      '技術決定論（technological determinism）とは、技術—とりわけ新しいメディアや生産技術—が社会の構造・文化・歴史の変化を規定する第一の自律的な原動力であるとみなす立場である。技術はそれ自体の論理で発展し社会はそれに従って変化する（技術→社会の一方向因果）と捉え、技術が社会を不可避に決定するとみる「ハード（強い）決定論」と、技術は重要な要因だが社会的文脈と相互作用するとみる「ソフト（弱い）決定論」に区別される。' +
      'この語はソースタイン・ヴェブレンが用いたとされ、カール・マルクスの「手挽き臼は封建領主の社会を、蒸気臼は産業資本家の社会を与える」（『哲学の貧困』1847）に決定論的傾向が読み取られ、メディア研究ではマクルーハンの「メディアはメッセージである」が強い例とされる。これに対し技術の社会的構成（SCOT）や社会形成論は、技術を社会から切り離し人間の主体性を軽視すると批判し、レイモンド・ウィリアムズの批判が著名である。',
    keyFigures:
      'ソースタイン・ヴェブレン（Thorstein Veblen）／カール・マルクス（Karl Marx）／マーシャル・マクルーハン（Marshall McLuhan）／レイモンド・ウィリアムズ（Raymond Williams・批判）／ピンチ＆バイカー（SCOT）／マッケンジー＆ワイクマン（社会形成論）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803102813253', type: 'reference', label: 'Oxford Reference (Chandler & Munday, A Dictionary of Media and Communication, OUP) — “technological determinism”（定義・自律性・ハード/ソフト）' },
      { url: 'https://en.wikipedia.org/wiki/Technological_determinism', type: 'reference', label: 'Wikipedia “Technological determinism” — ヴェブレンによる語の起源・マルクス・ハード/ソフト区別' },
      { url: 'https://www.marxists.org/archive/marx/works/1847/poverty-philosophy/ch02.htm', type: 'reference', label: 'Karl Marx, The Poverty of Philosophy (1847), Ch.2（marxists.org 一次資料）— 手挽き臼/蒸気臼の一節' },
    ],
  },
  {
    id: 'econ-lindahl-equilibrium',
    discipline: 'economics',
    title: 'リンダール均衡（リンダール価格）',
    statement:
      'リンダール均衡とは、公共財の効率的供給と費用負担を同時に説明する公共経済学の概念で、各個人がその公共財から得る限界便益（限界評価）に応じて異なる個別価格（リンダール価格／リンダール税）を支払い、全員がその価格の下で同一の公共財供給量を需要する状態をいう。' +
      'スウェーデンのエリク・リンダールが1919年に（師ヴィクセルの影響下で）提示した。重要な性質は、均衡での供給量が各人の限界便益の総和＝限界費用というサミュエルソン条件を満たすパレート効率的水準になる点で、私的財の競争均衡が効率的なのと類比的に、個別価格による公共財の効率均衡を与える。最大の難点はフリーライダー（ただ乗り）＝選好顕示問題で、各人は真の限界便益を過少申告する誘因を持つため分権的に実現しにくい。理論上の効率性ベンチマーク・規範的基準として、誘因両立的な公共財供給を扱うメカニズムデザインの出発点となっている。',
    keyFigures:
      'エリク・リンダール（Erik Lindahl, 1919）／クヌート・ヴィクセル（師・先駆）／ポール・サミュエルソン（効率条件）／個別価格・サミュエルソン条件・フリーライダー問題',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Lindahl_tax', type: 'reference', label: 'Wikipedia「Lindahl tax」— 個別の限界便益に応じた負担・サミュエルソン条件・効率性' },
      { url: 'https://link.springer.com/chapter/10.1007/978-1-349-19802-3_21', type: 'academic', label: 'The New Palgrave (Springer) “Lindahl Equilibrium” — 個別価格と限界効用に等しい税率・公共経済学の標準定義' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S004727271730169X', type: 'academic', label: 'Journal of Public Economics「The Samuelson condition and the Lindahl scheme in networks」（査読論文）' },
    ],
  },
  {
    id: 'mgmt-coopetition',
    discipline: 'management',
    title: 'コーペティション（協調的競争）',
    statement:
      'コーペティション（coopetition）とは、cooperation（協調）とcompetition（競争）の混成語で、企業が競合他社と同時に競争しつつ協調もする関係・戦略を指す。標準化・研究開発・サプライチェーン・市場創造などの領域では協力して「パイを大きくする」価値創造を行い、市場シェア獲得などの領域では競争して「パイを分け合う」価値獲得を行う。' +
      'アダム・ブランデンバーガーとバリー・ネイルバフが1996年の著書『Co-opetition』でゲーム理論を応用して広めた（語自体は1992年にノベル社CEOレイ・ノーダが用いたとされる）。彼らは顧客・供給者・競争相手・補完的生産者（complementors）から成る「価値相関図（Value Net）」を示し補完財の重要性を強調した。利点はリスク・コスト分担と標準獲得、リスクは技術漏洩や、協調と競争の緊張のバランスの難しさにある。',
    keyFigures:
      'アダム・ブランデンバーガー（Adam Brandenburger）／バリー・ネイルバフ（Barry Nalebuff）／レイ・ノーダ（Ray Noorda, 1992造語）／Value Net・補完財（complementors）',
    asOf: '2026-06',
    sources: [
      { url: 'https://oxfordre.com/business/view/10.1093/acrefore/9780190224851.001.0001/acrefore-9780190224851-e-9', type: 'reference', label: 'Coopetition — Oxford Research Encyclopedia of Business and Management' },
      { url: 'https://en.wikipedia.org/wiki/Coopetition', type: 'reference', label: 'Coopetition — Wikipedia（混成語・Noorda造語・Value Net）' },
      { url: 'https://www.encyclopedia.com/economics/encyclopedias-almanacs-transcripts-and-maps/co-opetition', type: 'reference', label: 'Co-Opetition — Encyclopedia.com' },
    ],
  },
  {
    id: 'human-self-evaluation-maintenance',
    discipline: 'human-science',
    title: '自己評価維持モデル（SEM）',
    statement:
      '自己評価維持（self-evaluation maintenance, SEM）モデルは、人が自己評価を高く維持・増進しようと動機づけられ、その自己評価が心理的に近い他者の遂行に左右されると説く社会心理学のモデルである。エイブラハム・テッサーが1988年に体系化した。' +
      '二つの過程が働く。反映過程では、自己定義への関連性が低い領域で近しい他者が優れた成果をあげると、その栄光を共有して（栄光浴）自己評価が高まる。比較過程では、関連性が高く自己定義に重要な領域で近しい他者が自分を上回ると、上方比較により自己評価が脅かされる。どちらが優勢かは関連性・近さ・遂行の質の3要因の相互作用で決まる。脅威時には関連性の低減、他者との距離化、遂行への介入といった方略で対処する。きょうだい・友人関係や嫉妬の研究に応用される。',
    keyFigures:
      'エイブラハム・テッサー（Abraham Tesser, 1988）／反映過程（栄光浴）・比較過程（上方比較）／関連性・近さ・遂行の3要因',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.sciencedirect.com/science/article/pii/S0065260108602270', type: 'academic', label: 'Tesser, A. (1988). Toward a Self-Evaluation Maintenance Model of Social Behavior. Advances in Experimental Social Psychology, 21, 181–227' },
      { url: 'https://psychology.iresearchnet.com/social-psychology/self/self-evaluation-maintenance-model/', type: 'reference', label: 'Self-Evaluation Maintenance Model — Social Psychology (iResearchNet)' },
      { url: 'https://en.wikipedia.org/wiki/Self-evaluation_maintenance_theory', type: 'reference', label: 'Self-evaluation maintenance theory — Wikipedia' },
    ],
  },
  {
    id: 'human-impact-bias',
    discipline: 'human-science',
    title: 'インパクト・バイアス（感情予測の偏り）',
    statement:
      'インパクト・バイアスとは、感情予測（affective forecasting＝将来の出来事が自分の感情にどう影響するかを予測すること）における系統的な誤りで、人は将来の感情反応の「強さ（intensity）」と「持続時間（duration）」を過大評価する傾向を指す。' +
      '良い出来事はそれほど長く強く幸福をもたらさず、悪い出来事もそれほど長く強く不幸をもたらさないのに、人はその影響を過大に見積もる。当初は持続時間の過大評価を指す「持続性バイアス（durability bias）」と呼ばれたが、初期反応の強度も誤予測されるため上位概念として impact bias に拡張された。原因として焦点化（focalism）や免疫無視（immune neglect＝逆境に適応・合理化する心理的免疫システムを予測時に考慮し損ね、回復の速さを過小評価する）がある。ウィルソンとギルバートが体系化し、テニュア取得の成否・選挙の勝敗・恋愛の破局などで実証され、意思決定・幸福研究・医療意思決定に示唆を持つ。',
    keyFigures:
      'ティモシー・ウィルソン（Timothy D. Wilson）／ダニエル・ギルバート（Daniel T. Gilbert）／durability bias・focalism・immune neglect',
    asOf: '2026-06',
    sources: [
      { url: 'https://dtg.sites.fas.harvard.edu/Gilbert%20et%20al%20(IMMUNE%20NEGLECT).pdf', type: 'academic', label: 'Gilbert, Pinel, Wilson, Blumberg & Wheatley (1998) “Immune Neglect: A Source of Durability Bias in Affective Forecasting”, JPSP（Harvard・Gilbert研究室）' },
      { url: 'https://journals.sagepub.com/doi/abs/10.1111/j.0963-7214.2005.00355.x', type: 'academic', label: 'Wilson & Gilbert (2005) “Affective Forecasting”, Current Directions in Psychological Science（Sage・査読誌）' },
      { url: 'https://en.wikipedia.org/wiki/Impact_bias', type: 'reference', label: 'Wikipedia「Impact bias」' },
    ],
  },
  {
    id: 'bizlaw-agency',
    discipline: 'business-law',
    title: '代理（民法99条）',
    statement:
      '代理とは、本人に代わって代理人が第三者（相手方）に対して意思表示をし、又は意思表示を受けることにより、その法律効果が直接本人に帰属する制度である（民法99条以下）。99条1項は、代理人がその権限内において本人のためにすることを示してした意思表示（顕名）が直接本人に対して効力を生ずると定め、2項で相手方が代理人に対してした意思表示にも準用する（受働代理）。代理には本人の意思に基づく任意代理（委任による代理）と、法律の規定による法定代理（親権者・後見人など）がある。' +
      '本人・代理人・相手方の三面関係を特徴とし、本人の意思を伝達するだけの使者とは区別される。関連規定として、顕名を欠く意思表示は原則代理人自身のためにしたものとみなすが相手方が悪意・有過失なら本人に帰属する100条、意思の不存在・詐欺・強迫等の瑕疵を原則代理人を基準に判断する101条、制限行為能力者が代理人としてした行為を原則取り消せないとする102条、自己契約・双方代理・利益相反行為を禁ずる108条がある。代理権を欠く無権代理（113〜117条）や表見代理（109・110・112条）とは区別される代理制度の基本である。',
    keyFigures:
      '99条：顕名・効果の本人帰属（2項＝受働代理）／任意代理（委任）vs 法定代理（親権者・後見人）／100条（顕名欠如）・101条（瑕疵は代理人基準）・102条（代理人の行為能力）・108条（自己契約・双方代理の禁止）／使者との区別／無権代理・表見代理とは別概念／e-Gov law id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号、第99条〜第118条 代理）' },
      { url: 'https://ocw.kyoto-u.ac.jp/wp-content/uploads/2021/04/2005_minpou-1_14.pdf', type: 'academic', label: '京都大学OCW 民法第1部 第14回 — 代理(1) 代理総説・有権代理（松岡久和教授）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第99条', type: 'reference', label: 'Wikibooks 民法第99条（代理行為の要件及び効果・顕名）' },
    ],
  },
  {
    id: 'infosoc-media-multitasking',
    discipline: 'information-sociology',
    title: 'メディア・マルチタスキング',
    statement:
      'メディア・マルチタスキングとは、複数のメディアを同時に、または短時間で切り替えながら利用する行動を指し（例：テレビ視聴中のスマホ操作、勉強中のSNS・音楽・動画の並行利用）、人間は真の並行処理ではなく高速のタスクスイッチングを行うため切替には時間・エラーの増大というスイッチングコストが伴う。' +
      'Ophir, Nass & Wagner（2009, PNAS）は、日常的に多くのメディアを併用するヘビー・メディア・マルチタスカー（HMM）が軽度の人（LMM）に比べ、無関連刺激のフィルタリングや記憶内の不要情報の抑制、課題切替の効率で劣る傾向を報告した。ただしこれは相関研究で因果の向きは不明であり、2017年の追試や2021年の大規模メタ分析では効果量が小さく測定法に依存して一貫せず、再現性が今も議論されている点に注意を要する。教育（ながら勉強）や運転、生産性、若年層のメディア利用研究で重要である。',
    keyFigures:
      'Eyal Ophir／Clifford Nass／Anthony D. Wagner（2009 PNAS）／HMM（ヘビー）vs LMM（ライト）／タスクスイッチングとスイッチングコスト／相関研究・再現性議論',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pnas.org/doi/10.1073/pnas.0903620106', type: 'academic', label: 'Ophir, Nass & Wagner (2009) “Cognitive control in media multitaskers”, PNAS 106(37):15583–15587' },
      { url: 'https://en.wikipedia.org/wiki/Media_multitasking', type: 'reference', label: 'Wikipedia「Media multitasking」（定義・HMM/LMM・タスクスイッチング・因果未確立）' },
      { url: 'https://link.springer.com/article/10.3758/s13414-017-1408-4', type: 'academic', label: 'Wiradhany & Nieuwenstein (2017) 追試＋メタ分析, Attention, Perception, & Psychophysics（再現性議論）' },
    ],
  },
  {
    id: 'econ-hotelling-law',
    discipline: 'economics',
    title: 'ホテリングの法則（最小差別化の原理）',
    statement:
      'ホテリングの法則（最小差別化の原理, principle of minimum differentiation）は、競争する売り手が製品特性や立地を互いに似せて市場の中央へ集まる傾向を示す空間競争モデルである。ハロルド・ホテリングが1929年の論文「Stability in Competition」（Economic Journal 39巻41-57頁）で提示した。古典的比喩では、一様に分布する消費者が最近接の売り手から買う線分状のビーチに2人のアイス売りが立地するとき、各自が顧客を奪おうと相手側へ寄り、社会最適の各1/4地点ではなく中央（中位点）に隣接して集中する。' +
      'この帰結は政治学のダウンズ中位投票者定理（2大政党の中道収斂）や店舗・ガソリンスタンドの集積の説明に用いられる。ただし限界もあり、3者以上では均衡が存在しない場合があるほか、ダスプレモンら（1979, Econometrica）は価格競争を含めると売り手が近すぎる時に価格均衡が存在せず、二次輸送費用の下ではむしろ「最大差別化」が生じることを示し、最小差別化の原理を批判・修正した。',
    keyFigures:
      'ハロルド・ホテリング（Harold Hotelling, 1929）／アンソニー・ダウンズ（中位投票者定理）／ダスプレモン・ガブシェヴィッチ・ティス（1979・批判）',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Hotelling%27s_law', type: 'reference', label: 'Wikipedia「Hotelling’s law」（原典書誌・最小差別化・中位均衡・1979年批判）' },
      { url: 'https://www.math.toronto.edu/mccann/assignments/477/Hotelling29.pdf', type: 'academic', label: 'Harold Hotelling, “Stability in Competition,” Economic Journal 39 (1929): 41-57（トロント大学ホストの原典PDF）' },
      { url: 'https://www.econometricsociety.org/publications/econometrica/browse/1979/09/01/hotellings-stability-competition', type: 'academic', label: 'd’Aspremont, Gabszewicz & Thisse, “On Hotelling’s Stability in Competition,” Econometrica 47(5) (1979): 1145-1150（Econometric Society）' },
    ],
  },
  {
    id: 'mgmt-tuckman-stages',
    discipline: 'management',
    title: 'タックマンのチーム発達段階モデル',
    statement:
      'チーム（小集団）が形成から成熟に至るまでに通常たどる発達段階を示したモデル。心理学者ブルース・W・タックマンが1965年の論文「Developmental sequence in small groups」（Psychological Bulletin 誌）で約50件の研究をレビューし4段階を提示した。' +
      '(1)フォーミング（形成期）＝メンバーが集まり互いに様子を見て依存的・礼儀的で、目標や役割が不明確、(2)ストーミング（混乱期）＝対立・主導権争い・感情的衝突が生じ課題要求への抵抗が現れる、(3)ノーミング（規範形成期）＝抵抗が克服され規範・役割が定まり結束と協力が生まれる、(4)パフォーミング（遂行期）＝対人構造が課題遂行の道具となりチームが一体化して高い成果を出す。1977年にタックマンとメアリー・アン・ジェンセンが第5段階(5)アジャーニング（散会期）＝目標達成後にチームが解散する、を追加した。チームビルディングやプロジェクトマネジメントで広く用いられるが、発達は必ずしも線形・一方向ではなく段階を行き来・退行することもあると指摘される。',
    keyFigures:
      'ブルース・W・タックマン（Bruce W. Tuckman, 1965）／メアリー・アン・C・ジェンセン（Mary Ann C. Jensen, 1977・第5段階追加）／forming・storming・norming・performing・adjourning',
    asOf: '2026-06',
    sources: [
      { url: 'https://pubmed.ncbi.nlm.nih.gov/14314073/', type: 'academic', label: 'Tuckman, B.W. (1965) Developmental sequence in small groups. Psychological Bulletin 63(6): 384-399 (PubMed)' },
      { url: 'https://journals.sagepub.com/doi/10.1177/105960117700200404', type: 'academic', label: 'Tuckman, B.W. & Jensen, M.A.C. (1977) Stages of Small-Group Development Revisited. Group and Organization Studies 2(4): 419-427 (SAGE)' },
      { url: 'https://infed.org/dir/welcome/bruce-w-tuckman-forming-storming-norming-and-performing-in-groups/', type: 'reference', label: 'infed.org — Bruce W. Tuckman: forming, storming, norming and performing（各段階定義・非線形性）' },
    ],
  },
  {
    id: 'human-cocktail-party-effect',
    discipline: 'human-science',
    title: 'カクテルパーティー効果',
    statement:
      'カクテルパーティー効果とは、多数の話者が同時に発話する騒がしい環境でも、特定の話者の声や自分に関連する情報（自分の名前など）に選択的に注意を向けて聞き取れる聴覚的選択的注意の現象である。' +
      'コリン・チェリーが1953年に「カクテルパーティー問題」として研究・命名し、両耳分離聴（dichotic listening）と追唱（shadowing）課題を用いた。注意研究の中心的トピックで、ブロードベントの初期選択説（フィルターが知覚の早い段階で非選択情報を遮断）に対し、非注意の耳の自分の名前に気づくモレイ（1959）の知見が後期選択説やトリーズマンの減衰説（非注意情報は遮断されず減衰し意味処理も一部行われる）を支持した。聴覚情景分析や音源分離（補聴器・音声認識）にも関連する。',
    keyFigures:
      'コリン・チェリー（Colin Cherry, 1953・命名）／ドナルド・ブロードベント（初期選択説）／ニール・モレイ（Moray 1959）／アン・トリーズマン（減衰説）',
    asOf: '2026-06',
    sources: [
      { url: 'https://pubs.aip.org/asa/jasa/article/25/5/975/690150/Some-Experiments-on-the-Recognition-of-Speech-with', type: 'academic', label: 'Cherry, E. C. (1953) Some Experiments on the Recognition of Speech, with One and with Two Ears. J. Acoust. Soc. Am. 25(5):975-979（一次論文）' },
      { url: 'https://www.audiology.org/the-cocktail-party-effect/', type: 'reference', label: 'The Cocktail Party Effect — American Academy of Audiology（米国聴覚学会）' },
      { url: 'https://en.wikipedia.org/wiki/Cocktail_party_effect', type: 'reference', label: 'Cocktail party effect — Wikipedia（フィルター説/減衰説の論争）' },
    ],
  },
  {
    id: 'human-change-blindness',
    discipline: 'human-science',
    title: '変化盲（チェンジ・ブラインドネス）',
    statement:
      '変化盲（change blindness）とは、視覚的シーンに生じた比較的大きな変化を、観察者がそれと気づかず見落とす現象。とくに変化が視覚的な遮り——サッカード（眼球運動）、まばたき、画面の一瞬の空白（フリッカー）、編集のカット、妨害刺激（mudsplashes）——と同時に起こると、変化を知らせる過渡的信号がかき消され、検出が著しく困難になる。' +
      'レンシンクら（1997）のフリッカー課題（原画像と変化画像を短い空白を挟んで交互提示）は注意を向けた対象でしか変化が検出されにくいことを示し、シモンズ＆レビン（1998）の「ドア実験」では会話相手が遮蔽中に別人へ入れ替わっても約半数が気づかなかった。注意を向けた情報しか詳細には保持されないことを示唆し、目撃証言・運転・UI設計に応用される。予期しない新規対象を見落とす非注意性盲目（見えないゴリラ）とは区別され、自分の検出能力を過信する「変化盲盲」も知られる。',
    keyFigures:
      'ロナルド・レンシンク（Ronald A. Rensink, 1997 フリッカー課題）／ダニエル・シモンズ（Daniel Simons）＆ダニエル・レビン（Daniel Levin, 1998 ドア実験）／非注意性盲目とは区別',
    asOf: '2026-06',
    sources: [
      { url: 'https://www2.psych.ubc.ca/~rensink/publications/download/PsychSci97-RR.pdf', type: 'academic', label: 'Rensink, O’Regan & Clark (1997) “To See or Not to See...,” Psychological Science 8(5):368（UBC）' },
      { url: 'https://link.springer.com/article/10.3758/BF03208840', type: 'academic', label: 'Simons & Levin (1998) “Failure to detect changes to people during a real-world interaction,” Psychonomic Bulletin & Review（ドア実験）' },
      { url: 'https://dictionary.apa.org/change-blindness', type: 'reference', label: 'APA Dictionary of Psychology — “change blindness”' },
    ],
  },
  {
    id: 'bizlaw-benefit-of-time',
    discipline: 'business-law',
    title: '期限の利益（民法136条）',
    statement:
      '期限の利益とは、法律行為に期限（とくに弁済期などの終期）が付されていることにより当事者が受ける利益をいう。たとえば「1年後に返済すればよい」という金銭債務では、債務者は期限到来まで履行を猶予されるという利益を持つ。民法136条1項は「期限は、債務者の利益のために定めたものと推定する」と定め、これは反証可能な推定規定である。' +
      '同条2項は「期限の利益は、放棄することができる。ただし、これによって相手方の利益を害することはできない」と定め、債務者は期限前弁済により期限の利益を放棄できるが、相手方（銀行等）の利息の利益を害する場合は調整を要する。民法137条は、債務者が破産手続開始の決定を受けたとき、担保を滅失・損傷・減少させたとき、担保供与義務を履行しないときは、債務者は期限の利益を主張できないと定める。実務では金銭消費貸借契約に「期限の利益喪失条項」が広く置かれる。',
    keyFigures:
      '136条1項：期限は債務者の利益と推定（反証可能）／136条2項：放棄可だが相手方の利益を害せない／137条の喪失事由＝破産手続開始の決定・担保の滅失損傷減少・担保供与義務の不履行／喪失は当然の期限到来でなく債権者が直ちに請求可能／実務の期限の利益喪失条項／e-Gov law id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（law id 129AC0000000089、第136条・第137条）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第136条', type: 'reference', label: 'Wikibooks 民法第136条（期限の利益及びその放棄）' },
      { url: 'https://tek-law.jp/civil-code/general-provisions/juridical-acts/conditions-and-time-limits/article-137/', type: 'reference', label: '民法第137条（期限の利益の喪失）条文・解説' },
    ],
  },
  {
    id: 'infosoc-infodemic',
    discipline: 'information-sociology',
    title: 'インフォデミック',
    statement:
      'インフォデミック（infodemic）とは information（情報）と epidemic（伝染病・流行）の混成語で、感染症の流行など健康危機の際に、正確な情報と不正確な情報・誤情報・偽情報が大量にあふれ、人々が信頼できる情報源や適切な指針を見つけにくくなる状況を指す。' +
      '語はジャーナリスト／政治アナリストのデイヴィッド・ロスコフが2003年のSARS流行時にワシントン・ポストの論考（2003年5月11日）で用い、世界保健機関（WHO）がCOVID-19パンデミック（2020年）の文脈で「ある問題に関しデジタル・物理環境を含め情報が過剰にあふれること（誤情報・偽情報を含む）」と位置づけ広めた。誤情報（misinformation＝意図せぬ誤り）と偽情報（disinformation＝意図的な虚偽）を含み、SNSによる急速な拡散が増幅要因となる。健康行動・ワクチン忌避・パニック・公衆衛生対策の妨げと関連し、WHOはその対処を「インフォデミック・マネジメント（infodemic management）」と呼んで取り組む。',
    keyFigures:
      'デイヴィッド・ロスコフ（David J. Rothkopf, 2003年に造語）／世界保健機関（WHO, COVID-19で概念を普及・対応枠組みを整備）／misinformation（誤情報）とdisinformation（偽情報）を含む',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.who.int/health-topics/infodemic/understanding-the-infodemic-and-misinformation-in-the-fight-against-covid-19', type: 'government', label: 'WHO「Understanding the infodemic and misinformation in the fight against COVID-19」— 定義・誤情報/偽情報の区別' },
      { url: 'https://en.wikipedia.org/wiki/Infodemic', type: 'reference', label: 'Wikipedia「Infodemic」— 語源（information+epidemic）・ロスコフ2003年造語' },
      { url: 'https://journals.sagepub.com/doi/full/10.1177/14614448211031908', type: 'academic', label: 'Simon & Camargo (2021) “Autopsy of a metaphor: ... the ‘infodemic’”, New Media & Society（査読論文）' },
    ],
  },
  {
    id: 'econ-ellsberg-paradox',
    discipline: 'economics',
    title: 'エルズバーグのパラドックス（曖昧性回避）',
    statement:
      'エルズバーグのパラドックスは、人々が確率の既知なリスクを、確率の不明な「曖昧性（ambiguity）」よりも好む傾向（曖昧性回避）を示し、サベージの主観的期待効用理論の確実性原理（sure-thing principle）と矛盾することを示す思考実験である。' +
      '典型例の2色壺では、赤球30個と黒・黄合計60個（内訳不明）が入った壺から1球引く。多くの人は確率が既知（1/3）の「赤」を確率不明の「黒」より好み、同時に既知（2/3）の「黒か黄」を不明の「赤か黄」より好む。この選好の組は黒に割り当てるいかなる主観確率でも整合せず、期待効用理論で合理化できない。ダニエル・エルズバーグが1961年の論文（QJE）で提示し、ナイトのリスク/不確実性の区別と結びつき、マックスミン期待効用やショケ期待効用など曖昧性下の意思決定モデルの出発点となった。',
    keyFigures:
      'ダニエル・エルズバーグ（Daniel Ellsberg, 1961）／レナード・サベージ（確実性原理）／フランク・ナイト（リスクと不確実性）／ギルボア＝シュマイドラー（曖昧性下モデル）',
    asOf: '2026-06',
    sources: [
      { url: 'https://academic.oup.com/qje/article-abstract/75/4/643/1913802', type: 'academic', label: 'Daniel Ellsberg, “Risk, Ambiguity, and the Savage Axioms,” The Quarterly Journal of Economics 75(4), 1961, 643–669（原典, Oxford Academic）' },
      { url: 'https://en.wikipedia.org/wiki/Ellsberg_paradox', type: 'reference', label: 'Ellsberg paradox（Wikipedia：2色壺の定式化と確実性原理違反）' },
      { url: 'https://link.springer.com/article/10.1007/s11238-023-09935-x', type: 'academic', label: 'On the Ellsberg and Machina paradoxes, Theory and Decision（査読誌：曖昧性回避とGilboa–Schmeidlerモデル）' },
    ],
  },
  {
    id: 'mgmt-kotter-8-steps',
    discipline: 'management',
    title: 'コッターの変革8段階モデル',
    statement:
      'ハーバード・ビジネス・スクールのジョン・P・コッターが提唱した、組織変革を成功させるための8段階のプロセスモデル。1995年のHarvard Business Review論文「Leading Change: Why Transformation Efforts Fail」で多くの変革が失敗する8つの誤りを指摘し、1996年の著書『Leading Change（企業変革力）』で対応する8段階として体系化した。' +
      '8段階は、(1)危機感を高める、(2)変革推進の連帯チーム（guiding coalition）を築く、(3)ビジョンと戦略を生み出す、(4)ビジョンを周知徹底する、(5)幅広い行動を促し障害を取り除く、(6)短期的成果を生む、(7)成果を活かしてさらに変革を進める、(8)新しい方法を企業文化に定着させる、である。レヴィンの3段階モデル（解凍・変革・再凍結）を具体化したものと評され、直線的・トップダウンで反復性を捉えにくいとの批判もある。コッターは2014年の『Accelerate』で8段階を反復的・ネットワーク的な「デュアル・システム」に再構成した。',
    keyFigures:
      'ジョン・P・コッター（John P. Kotter, 1995 HBR・1996『Leading Change』）／クルト・レヴィン（先行する3段階モデル）／8段階＝危機感→連帯チーム→ビジョン→周知→行動促進→短期的成果→さらなる変革→文化定着',
    asOf: '2026-06',
    sources: [
      { url: 'https://hbr.org/1995/05/leading-change-why-transformation-efforts-fail-2', type: 'academic', label: 'John P. Kotter, “Leading Change: Why Transformation Efforts Fail,” Harvard Business Review (1995) — 原典論文' },
      { url: 'https://www.kotterinc.com/methodology/8-steps/', type: 'reference', label: 'Kotter Inc., “The 8-Step Process for Leading Change” — 著者本人の組織による公式解説' },
      { url: 'https://journals.sagepub.com/doi/abs/10.1177/1742715015571393', type: 'academic', label: 'Mark Hughes, “Leading changes: Why transformation explanations fail,” Leadership 13(4), SAGE (2016) — 批判的検討' },
    ],
  },
  {
    id: 'human-flynn-effect',
    discipline: 'human-science',
    title: 'フリン効果',
    statement:
      'フリン効果とは、20世紀を通じて世界各国で観察された、知能検査（IQ）の平均得点が世代を追うごとに継続的に上昇してきた現象で、おおむね10年あたり約3ポイント（1世紀で約30ポイント）のペースで上昇したとされる。' +
      'ニュージーランドの知能研究者ジェームズ・R・フリンが1984年・1987年の論文で多数の国のデータから体系的に示し、後にハーンスタインとマレーが著書『ベルカーブ』（1994）でこれを「フリン効果」と呼んで広めた。流動性知能を測るレーヴン漸進的マトリックスなどで上昇が大きく、語彙・知識など結晶性知能では小さい。原因は栄養・健康の改善、教育の普及、環境の複雑化、家族規模の縮小、検査慣れなど諸説あり確定しておらず、遺伝では説明できず環境要因が重視される。近年は一部の先進国で上昇が停滞・逆転（反フリン効果）したとの報告もある。',
    keyFigures:
      'ジェームズ・R・フリン（James R. Flynn, 1934–2020）／リチャード・ハーンスタイン＆チャールズ・マレー（『ベルカーブ』1994で命名）／流動性知能で上昇大・反フリン効果',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pnas.org/doi/10.1073/pnas.1718793115', type: 'academic', label: 'Bratsberg & Rogeberg, “Flynn effect and its reversal are both environmentally caused,” PNAS 115(26):6674–6678 (2018)' },
      { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4152423/', type: 'academic', label: 'Trahan et al., “The Flynn Effect: A Meta-analysis,” Psychological Bulletin（PMC, NCBI）' },
      { url: 'https://en.wikipedia.org/wiki/Flynn_effect', type: 'reference', label: 'Wikipedia: Flynn effect（命名・上昇率・課題別パターン）' },
    ],
  },
  {
    id: 'human-inattentional-blindness',
    discipline: 'human-science',
    title: '非注意性盲目（不注意盲）',
    statement:
      '非注意性盲目（inattentional blindness）とは、視野内にはっきり存在し容易に認識できるはずの予期しない対象や出来事に、別の課題へ注意を集中しているために気づかない現象である。注意の容量には限界があり、注意を向けていない対象は意識的に知覚されにくいことを示す。' +
      'アリエン・マックとアーヴィン・ロックが1998年の著書『Inattentional Blindness』で概念を確立・命名した。最も有名な実証はダニエル・シモンズとクリストファー・チャブリスの1999年「見えないゴリラ」実験で、バスケのパス回数を数える課題に集中する観察者の約半数が、画面中央をゴリラの着ぐるみが横切っても気づかなかった。「予期しない対象の見落とし」を指す点で、2状態間の変化を見落とす変化盲とは区別される。目撃証言・運転中の携帯電話使用・放射線科医の見落とし・安全管理などに応用される。',
    keyFigures:
      'アリエン・マック（Arien Mack）＆アーヴィン・ロック（Irvin Rock, 1998・命名）／ダニエル・シモンズ＆クリストファー・チャブリス（1999「見えないゴリラ」）／変化盲とは区別',
    asOf: '2026-06',
    sources: [
      { url: 'https://dictionary.apa.org/inattentional-blindness', type: 'reference', label: 'APA Dictionary of Psychology — “inattentional blindness”（米国心理学会）' },
      { url: 'http://www.scholarpedia.org/article/Inattentional_blindness', type: 'reference', label: 'Scholarpedia — “Inattentional blindness”（査読制百科事典；変化盲との区別）' },
      { url: 'https://journals.sagepub.com/doi/10.1068/p281059', type: 'academic', label: 'Simons & Chabris (1999) “Gorillas in our midst...”, Perception 28(9):1059–1074' },
    ],
  },
  {
    id: 'bizlaw-tender-of-performance',
    discipline: 'business-law',
    title: '弁済の提供（民法492条・493条）',
    statement:
      '弁済の提供とは、債務者が債務の本旨に従った履行に必要な準備をして、債権者の協力（受領）を求めることをいう。債務の本旨に従って弁済の提供をすれば、債務者はその提供の時から「債務を履行しないことによって生ずべき責任を免れる」（民法492条）。具体的には履行遅滞を理由とする遅延損害金・違約金の支払義務、契約解除や担保権実行を免れ、また相手方の同時履行の抗弁を封じる効果を持つ。' +
      '提供の方法（493条）は、原則として「現実の提供」（債務の本旨に従い現実に弁済を提供する。例：持参債務で金銭を持参して受領を求める）であるが、(1)債権者があらかじめ受領を拒んでいるとき、または(2)債務の履行に債権者の行為を要するとき（取立債務等）は、弁済の準備をしたことを通知して受領を催告する「口頭の提供」で足りる。弁済の提供は債務消滅原因そのものではなく、債務者を履行遅滞等の不利益から解放する効果を持つにとどまり、債権者が受領しない場合は受領遅滞（413条）の問題となり、債務消滅には供託（494条）等を要する。',
    keyFigures:
      '492条：提供の時から履行遅滞責任・遅延損害金・違約金・解除・担保権実行を免れ同時履行の抗弁を封じる／493条：原則「現実の提供」、例外「口頭の提供」（受領拒絶・取立債務等）／債務消滅原因ではない（供託494条で消滅）／受領遅滞413条と関連／e-Gov law id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治29年法律第89号）492条・493条' },
      { url: 'https://ocw.kyoto-u.ac.jp/wp-content/uploads/2021/04/2003_minopu-3_22.pdf', type: 'academic', label: '京都大学OCW 債権総論 第22回講義 弁済の提供・債権者遅滞（松岡久和）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第493条', type: 'reference', label: 'Wikibooks 民法第493条（弁済の提供の方法：現実の提供・口頭の提供）' },
    ],
  },
  {
    id: 'infosoc-meme',
    discipline: 'information-sociology',
    title: 'ミーム（meme）',
    statement:
      'ミームとは、模倣（imitation）を通じて人から人（脳から脳）へ伝達・複製され文化の中で広がる文化的情報の単位で、アイデア・習慣・旋律・流行・技術・信念などを指す。進化生物学者リチャード・ドーキンスが1976年の著書『利己的な遺伝子』で、ギリシャ語 mimeme（模倣されるもの）を gene に似せて短縮し造語した。' +
      '遺伝子が生物進化の自己複製子であるのに対し、ミームは文化進化の自己複製子であり、変異・選択・複製というダーウィン的進化のアナロジーで文化伝播を説明する。スーザン・ブラックモアが『ミーム・マシーンとしての私』(1999)でミーム学（memetics）として発展させた。ただし単位・境界の不明確さ、複製忠実度の低さ、実証可能性への疑問から主流科学としては確立しなかったとされる。現代ではインターネット・ミーム（画像・動画等がSNSで模倣・改変され拡散する現象）として語が一般化したが、これはドーキンスの原義の一応用・派生である。',
    keyFigures:
      'リチャード・ドーキンス（Richard Dawkins, 1976『利己的な遺伝子』で造語）／スーザン・ブラックモア（Susan Blackmore, memetics）／リモール・シフマン（Limor Shifman, インターネット・ミーム）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/topic/meme', type: 'reference', label: 'Britannica「Meme」— 定義・語源（Greek mimema）・Dawkins 1976『The Selfish Gene』による造語' },
      { url: 'https://www.susanblackmore.uk/memetics/about-memes/', type: 'academic', label: 'Susan Blackmore 公式サイト「About Memes」— ミーム＝人から人へコピーされるもの・memetics' },
      { url: 'https://en.wikipedia.org/wiki/Meme', type: 'reference', label: 'Wikipedia「Meme」— 定義・語源・Dawkins/Blackmore・memetics批判' },
    ],
  },
  {
    id: 'econ-folk-theorem',
    discipline: 'economics',
    title: 'フォーク定理（繰り返しゲーム）',
    statement:
      'フォーク定理は、繰り返しゲーム（repeated game）において膨大な数のナッシュ均衡利得が存在することを示す定理群である。' +
      'プレイヤーが十分に忍耐強く将来を重視する（割引因子が1に十分近い）場合、各プレイヤーが個別合理性（マックスミン値以上）を満たす実現可能（feasible）な利得の組は、ほぼすべて（部分ゲーム完全）均衡として達成されうる。一回限りでは協力しない囚人のジレンマでも、逸脱を将来罰するトリガー戦略の脅しにより協力が均衡として支持される。「フォーク（民間伝承）」の名は、1950年代に誰も公刊しないまま研究者間で広く知られていたことに由来する。フリードマン（1971）が部分ゲーム完全版を、ファッデンバーグ＆マスキン（1986）が割引付き完全版を示した。均衡の多重性ゆえ予測が難しい反面、カルテルや暗黙の共謀の説明に用いられる。',
    keyFigures:
      'James W. Friedman（1971・部分ゲーム完全版）／Drew Fudenberg & Eric Maskin（1986・割引付き完全フォーク定理）／トリガー戦略・個別合理性・均衡の多重性',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.econometricsociety.org/publications/econometrica/1986/05/01/folk-theorem-repeated-games-discounting-or-incomplete', type: 'academic', label: 'Fudenberg & Maskin, “The Folk Theorem in Repeated Games with Discounting or with Incomplete Information,” Econometrica 54(3), 1986' },
      { url: 'https://en.wikipedia.org/wiki/Folk_theorem_(game_theory)', type: 'reference', label: 'Wikipedia「Folk theorem (game theory)」（定義・Friedman 1971・名称の由来）' },
      { url: 'https://www.cs.cornell.edu/home/halpern/papers/itcs.pdf', type: 'academic', label: 'Halpern & Pass, “The Truth Behind the Myth of the Folk Theorem”（Cornell・個別合理性とミニマックス）' },
    ],
  },
  {
    id: 'mgmt-greiner-growth-model',
    discipline: 'management',
    title: 'グレイナーの企業成長モデル',
    statement:
      'グレイナーの企業成長モデルは、組織が年齢と規模を増すにつれて経る発展段階を示した理論で、ラリー・E・グレイナー（USCマーシャル経営大学院教授）が1972年のHarvard Business Review論文「Evolution and Revolution as Organizations Grow」で提示した。' +
      '各段階は、比較的安定した成長期（evolution＝進化）と、その成長が招く管理上の危機（revolution＝革命）が交互に訪れ、危機を克服することで次段階へ移行する。当初の5段階と終結危機は、(1)創造性による成長→リーダーシップの危機、(2)指揮による成長→自主性の危機、(3)権限委譲による成長→統制の危機、(4)調整による成長→形式主義（レッドテープ）の危機、(5)協働による成長→内部成長の危機（1998年改訂で(6)提携による成長→アイデンティティの危機を追加）。核心は、ある段階で成功した管理方式が次段階では機能不全を起こし、各進化局面自体が次の危機の種を生む点にあり、経営者は発展段階に応じた組織変革を行う必要があると説く。',
    keyFigures:
      'ラリー・E・グレイナー（Larry E. Greiner, 1972 HBR・USCマーシャル）／進化（evolution）と革命（revolution）の交替／5段階＋1998年に第6段階（提携→アイデンティティの危機）',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.marshall.usc.edu/personnel/larry-e-greiner', type: 'academic', label: 'USC Marshall School of Business — Larry E. Greiner 教員紹介（著者所属大学）' },
      { url: 'https://hbr.org/1998/05/evolution-and-revolution-as-organizations-grow', type: 'reference', label: 'Harvard Business Review (1998改訂版) — Evolution and Revolution as Organizations Grow（原典）' },
      { url: 'https://ils.unc.edu/daniel/131/cco4/Greiner.pdf', type: 'academic', label: 'University of North Carolina 配布の原論文PDF（1972年, HBR Vol.50 No.4）' },
    ],
  },
  {
    id: 'human-mood-congruent-memory',
    discipline: 'human-science',
    title: '気分一致効果（気分一致記憶）',
    statement:
      '気分一致効果（mood-congruent memory）とは、現在の気分（感情状態）とその感情的調子（valence）が一致する情報の方が、一致しない情報よりも記憶の符号化・想起において促進される現象である。たとえば楽しい気分のときはポジティブな出来事を、悲しい気分のときはネガティブな出来事をよく覚え・思い出しやすい。' +
      'ゴードン・バウアーが1981年の論文「Mood and Memory」（American Psychologist）で体系的に論じ、感情の連合ネットワークモデルで説明した。符号化時と想起時の気分が一致すると想起が良くなる「気分状態依存記憶（state-dependent retrieval）」とは区別される——気分一致効果は情報の感情価と現在の気分の一致が鍵であるのに対し、状態依存記憶は学習時と想起時の内的状態の一致が鍵である。うつ病の否定的記憶バイアスの理解にも応用されるが、効果の頑健性や非対称性（健常者では気分修復により弱まる等）には議論もある。',
    keyFigures:
      'ゴードン・H・バウアー（Gordon H. Bower, 1981「Mood and Memory」）／連合ネットワークモデル／気分状態依存記憶とは区別',
    asOf: '2026-06',
    sources: [
      { url: 'https://dictionary.apa.org/mood-congruent-memory', type: 'reference', label: 'APA Dictionary of Psychology — “mood-congruent memory”（米国心理学会）' },
      { url: 'https://dibs-web01.vm.duke.edu/labar/pdfs/Faul_and_LaBar_2022.pdf', type: 'academic', label: 'Faul & LaBar (2022) “Mood-Congruent Memory Revisited”, Psychological Review（査読論文、Duke University）' },
      { url: 'https://en.wikipedia.org/wiki/Mood_congruence', type: 'reference', label: 'Wikipedia — “Mood congruence”（バウアー連合ネットワーク理論・状態依存との区別）' },
    ],
  },
  {
    id: 'bizlaw-guarantee-obligation',
    discipline: 'business-law',
    title: '保証債務（民法446条）',
    statement:
      '保証債務とは、主たる債務者がその債務を履行しないときに、保証人が主たる債務者に代わってその履行をする責任を負う債務をいう（民法446条1項）。保証契約は債権者と保証人との間で締結され、書面（電磁的記録を含む）でしなければその効力を生じない（446条2項・3項）。これは軽率な保証を防ぎ保証人を保護するための要式性である。保証債務には、(1)付従性（主たる債務が無効・消滅すれば保証債務も消滅し、内容も主たる債務より重くなれない）、(2)随伴性（主たる債務に対する債権が移転すれば保証債務も移転する）、(3)補充性という性質がある。' +
      '補充性の現れとして、普通保証の保証人は催告の抗弁権（452条＝まず主たる債務者に催告せよと求める権利）と検索の抗弁権（453条＝主たる債務者に弁済資力がありかつ執行が容易なことを証明して拒む権利）を有する。これに対し連帯保証（454条）の保証人は催告・検索の抗弁権をもたず、債権者は連帯保証人に直ちに全額請求でき実務で広く用いられる。2017年改正民法（2020年4月施行）は個人保証人の保護を強化し、事業用融資の個人保証につき公正証書による保証意思の確認（465条の6）、保証人への情報提供義務（458条の2・465条の10）等を新設した。保証人が弁済すれば主たる債務者に求償権を取得する。',
    keyFigures:
      '446条1項：主債務者が履行しないとき代わって履行／446条2項・3項：書面（電磁的記録含む）でなければ無効／付従性・随伴性・補充性／催告の抗弁権（452条）・検索の抗弁権（453条）／連帯保証（454条）は補充性なし／2017改正＝公正証書による保証意思確認（465条の6）・情報提供義務（458条の2/465条の10）／求償権／e-Gov law id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（law id 129AC0000000089、第446条〜465条の10）' },
      { url: 'https://www.moj.go.jp/content/001254262.pdf', type: 'government', label: '法務省「保証に関する民法のルールが大きく変わります」（2020年4月1日施行）' },
      { url: 'https://kslaw.jp/column/detail/6451/', type: 'reference', label: '栗林総合法律事務所「保証契約」（付従性・随伴性・補充性の解説）' },
    ],
  },
  {
    id: 'infosoc-smart-mob',
    discipline: 'information-sociology',
    title: 'スマートモブ',
    statement:
      'スマートモブ（smart mobs）とは、携帯電話・SMS・インターネット・SNSなどの情報通信技術を用い、互いに見知らぬ人々が緩やかに調整し合い、明確な指導者や中央組織なしに即座に協調的な集合行動をとる集団・現象を指す。' +
      '米国のメディア批評家ハワード・ラインゴールドが2002年の著書『Smart Mobs: The Next Social Revolution（次なる社会革命）』で提唱・命名し、「通信と計算の能力を備えた端末を携帯するため、互いを知らなくても協調して行動できる人々」と定義した。技術が人間の協力する力を増幅し、政治的動員・抗議・市場・協働に新たな力を与えると論じた。代表例は2001年フィリピンのSMSによる大規模動員（ピープルパワー2）でのエストラダ大統領退陣であり、後のフラッシュモブやアラブの春、ハッシュタグ・アクティビズムの先駆的概念と位置づけられる。',
    keyFigures:
      'ハワード・ラインゴールド（Howard Rheingold, 2002『Smart Mobs』）／2001年フィリピン（ピープルパワー2）のSMS動員／フラッシュモブ・アラブの春の先駆概念',
    asOf: '2026-06',
    sources: [
      { url: 'https://dl.acm.org/doi/10.5555/579424', type: 'academic', label: 'ACM Digital Library — Rheingold, Smart Mobs: The Next Social Revolution (書誌)' },
      { url: 'https://nvdatabase.swarthmore.edu/content/philippine-citizens-overthrow-president-joseph-estrada-people-power-ii-2001', type: 'reference', label: 'Global Nonviolent Action Database (Swarthmore College) — People Power II, 2001' },
      { url: 'https://en.wikipedia.org/wiki/Smart_mob', type: 'reference', label: 'Wikipedia — Smart mob（定義・由来）' },
    ],
  },
  {
    id: 'econ-dictator-game',
    discipline: 'economics',
    title: '独裁者ゲーム',
    statement:
      '独裁者ゲーム（dictator game）は実験経済学・行動経済学で用いられる単純なゲームで、一方のプレイヤー（独裁者・配分者）が一定額の金銭を自分と相手（受け手）の間でどう分けるかを一方的に決め、受け手は受動的で拒否できず結果を受け入れるしかない。' +
      '標準的な利己的・合理的予測では独裁者は全額を自分のものにする（受け手にゼロ）はずだが、実際の実験では多くの独裁者が正の金額（平均しておよそパイの2割程度、全額保持は約4割にとどまる）を分け与え、人間の利他性・公平性・社会的選好の存在を示すとされる。受け手が拒否権を持つ最後通牒ゲームと異なり拒否を恐れた戦略的配慮が働かないため、分配はより直接的な利他性・規範の指標とされる。ただし配分は実験設定（二重盲検など厳格な匿名性では分配が大きく減少）に敏感で、純粋利他性の解釈には留保も要する（Forsythe ら1994、Hoffman ら1996）。',
    keyFigures:
      'Forsythe・Horowitz・Savin・Sefton（1994・標準実験）／Hoffman ら（1996・二重盲検で分配減少）／最後通牒ゲーム（受け手に拒否権）とは区別',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Dictator_game', type: 'reference', label: 'Dictator game — Wikipedia（定義・最後通牒ゲームとの対比・実証結果）' },
      { url: 'https://link.springer.com/rwe/10.1007/978-3-319-28099-8_652-1', type: 'reference', label: 'Dictator Game — Encyclopedia of Law and Economics (Springer Nature)' },
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/S2214804320302895', type: 'academic', label: 'Social preferences across different populations: Meta-analyses on the ultimatum game and dictator game（査読論文）' },
    ],
  },
  {
    id: 'econ-schelling-segregation',
    discipline: 'economics',
    title: 'シェリングの分居モデル',
    statement:
      'トーマス・シェリングが1971年の論文「Dynamic Models of Segregation」（Journal of Mathematical Sociology誌）で提示した、エージェントベースの社会シミュレーション・モデル。格子上に2種類のエージェントを置き、各エージェントは「近隣に同類が一定割合（約3分の1）以上いれば満足してとどまり、下回れば不満で空きマスへ移動する」という単純な規則に従う。' +
      '各人が「近隣の3分の1が同類なら満足」という穏やかな（弱い）選好しか持たず、むしろ統合された環境を許容していても、移動を繰り返すうちに全体としては高度に分居したパターンが創発する。これは個人のミクロな動機と集団のマクロな帰結の乖離（micromotives and macrobehavior）、複雑系の創発を示す古典的事例であり、人種的住み分けの理解とエージェントベースモデリング（ABM）の草分けとなった。シェリングは2005年ノーベル経済学賞を受賞。',
    keyFigures:
      'トーマス・シェリング（Thomas C. Schelling, 1971・2005年ノーベル経済学賞）／弱い同類選好から創発する分居／micromotives and macrobehavior・ABMの草分け',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.tandfonline.com/doi/abs/10.1080/0022250X.1971.9989794', type: 'academic', label: 'Schelling, T. C. (1971) “Dynamic Models of Segregation,” Journal of Mathematical Sociology, 1(2), 143-186 (Taylor & Francis)' },
      { url: 'https://www.nobelprize.org/prizes/economic-sciences/2005/schelling/facts/', type: 'reference', label: 'NobelPrize.org — Thomas C. Schelling, 2005年ノーベル経済学賞（Aumannと共同受賞）' },
      { url: 'https://en.wikipedia.org/wiki/Schelling%27s_model_of_segregation', type: 'reference', label: 'Wikipedia — Schelling’s model of segregation（約1/3の選好閾値・創発）' },
    ],
  },
  {
    id: 'mgmt-managerial-grid',
    discipline: 'management',
    title: 'マネジリアル・グリッド',
    statement:
      'リーダーシップ・スタイルを「業績（生産）への関心（concern for production）」と「人間への関心（concern for people）」の2次元で捉え、各次元を1〜9の段階で評価して9×9の格子上に位置づける行動アプローチのモデル。ロバート・ブレークとジェーン・ムートンが1964年の著書『The Managerial Grid』で提示した。' +
      '代表的な5類型は、(1)1・1型＝無関心型/放任型（impoverished、両関心が低い）、(2)1・9型＝カントリークラブ型（country club、人への関心が高く業績への関心が低い）、(3)9・1型＝権威服従型/仕事中心型（authority-compliance、業績重視・人軽視）、(4)5・5型＝中道型（middle-of-the-road、双方そこそこ）、(5)9・9型＝チームマネジメント型（team、双方に高い関心を持つ最も望ましい型）。オハイオ州立大学研究（構造づくり・配慮）やミシガン研究の流れにあり、後に父権主義型・日和見主義型を加えた改訂版もある。リーダー育成・自己診断に用いられる。',
    keyFigures:
      'ロバート・ブレーク（Robert R. Blake）／ジェーン・ムートン（Jane S. Mouton, 1964『The Managerial Grid』）／9・9型（チームマネジメント）が理想／業績への関心×人への関心の2次元',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Managerial_grid_model', type: 'reference', label: 'Managerial grid model — Wikipedia' },
      { url: 'https://us2.sagepub.com/sites/default/files/upm-binaries/67536_Northouse_Chapter_4.pdf', type: 'academic', label: 'Northouse, Leadership: Theory and Practice, Ch.4 (SAGE Publishing)' },
      { url: 'https://archive.org/details/managerialgridke00blak', type: 'reference', label: 'Blake & Mouton, The Managerial Grid (1964原典) — Internet Archive' },
    ],
  },
  {
    id: 'human-false-consensus',
    discipline: 'human-science',
    title: '偽の合意効果（フォールス・コンセンサス）',
    statement:
      '偽の合意効果（false consensus effect）とは、人が自分の意見・信念・好み・行動を実際よりも一般的（多数派）だと過大に見積もり、他者も自分と同じように考え行動するはずだと過度に推測する認知バイアスである。' +
      'リー・ロス、デヴィッド・グリーン、パメラ・ハウスが1977年に実証・命名した。古典的実験では、学生に広告看板を身につけ街を歩くバイトを尋ね、引き受けた者は「多数も引き受ける」、断った者は「多数も断る」と推測し、自分の選択を多数派とみなした。原因は選択的接触・利用可能性・自尊心維持などとされる。対照的に、望ましい特性を希少と過小評価する「偽の独自性効果」がある。',
    keyFigures:
      'リー・ロス（Lee Ross）／デヴィッド・グリーン（David Greene）／パメラ・ハウス（Pamela House, 1977）／対照＝偽の独自性効果',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.sciencedirect.com/science/article/abs/pii/002210317790049X', type: 'academic', label: 'Ross, Greene & House (1977) “The false consensus effect...”, Journal of Experimental Social Psychology 13, 279–301（一次文献）' },
      { url: 'https://en.wikipedia.org/wiki/False_consensus_effect', type: 'reference', label: 'Wikipedia「False consensus effect」— 定義・実験・原因' },
      { url: 'https://dictionary.apa.org/false-uniqueness-effect', type: 'reference', label: 'APA Dictionary of Psychology「false-uniqueness effect」— 対照概念' },
    ],
  },
  {
    id: 'bizlaw-merger-of-obligations',
    discipline: 'business-law',
    title: '混同（民法520条）',
    statement:
      '混同とは、債権と債務が同一人に帰属したときに、その債権が消滅する債権の消滅原因の一つである（民法520条）。たとえば債権者が債務者を相続した場合や、債権者である会社が債務者である会社を吸収合併した場合など、「請求する人」と「支払う人」が同一になると債権を存続させる意味がないため、原則として債権は消滅する。' +
      '同条本文は「債権及び債務が同一人に帰属したときは、その債権は、消滅する」と定める。もっとも、ただし書は「その債権が第三者の権利の目的であるときは、この限りでない」とし、たとえばその債権に質権が設定されているなど第三者の権利が及ぶ場合は、第三者保護のため消滅しない。混同は弁済・代物弁済・供託・相殺・更改・免除と並ぶ債権の消滅原因であり、相続・合併の場面で実務上問題となる。なお物権の混同は別条文の民法179条が定める。',
    keyFigures:
      '520条本文：債権及び債務が同一人に帰属すると債権は原則消滅／ただし書：第三者の権利の目的（質権設定等）なら消滅しない／典型＝相続・吸収合併・債権譲受け／弁済・代物弁済・供託・相殺・更改・免除と並ぶ債権の消滅原因／物権の混同は179条と区別／e-Gov law id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov 法令検索「民法」（明治29年法律第89号, law id 129AC0000000089）第520条' },
      { url: 'https://ja.wikibooks.org/wiki/民法第520条', type: 'reference', label: 'Wikibooks「民法第520条（混同）」条文・解説' },
      { url: 'https://ja.wikipedia.org/wiki/混同', type: 'reference', label: 'Wikipedia「混同」（物権・債権共通の消滅原因／民法179条・520条）' },
    ],
  },
  {
    id: 'infosoc-fourth-estate',
    discipline: 'information-sociology',
    title: '第四の権力',
    statement:
      '第四の権力（the fourth estate、第四階級／第四の身分）とは、報道機関・ジャーナリズム（press／news media）が立法・行政・司法の三権から独立し、それらの権力を監視・批判して世論を形成する社会的・政治的な力をもつとする概念。' +
      '語源はアンシャン・レジームの三身分（聖職者＝第一身分、貴族＝第二身分、平民＝第三身分）になぞらえ、英国議会の記者席（報道記者）を第四の身分と呼んだことに由来する。トーマス・カーライルが著書『英雄崇拝論』で、エドマンド・バークが「記者席にこそ三身分のいずれより重要な第四階級が座る」と述べたと記したが、バーク帰属の一次的典拠は確実でなくカーライルの記述で広まったとされる。報道の権力監視（番犬＝watchdog）機能や、報道の自由・知る権利・民主主義の前提としての役割を表す。現代ではインターネットや市民ジャーナリズムを第五の権力（fifth estate）と呼び対比する議論や、政治・資本との癒着による機能不全を問う批判もある。',
    keyFigures:
      'エドマンド・バーク（Edmund Burke・帰属は不確実）／トーマス・カーライル（Thomas Carlyle・『英雄崇拝論』で普及）／ウィリアム・ダットン（W. H. Dutton・第五の権力論）',
    asOf: '2026-06',
    sources: [
      { url: 'https://sk.sagepub.com/ency/edvol/the-sage-encyclopedia-of-journalism-2e/chpt/fourth-estate', type: 'reference', label: 'The SAGE Encyclopedia of Journalism (2e), “Fourth Estate”' },
      { url: 'https://www.oii.ox.ac.uk/research/projects/the-fifth-estate/', type: 'academic', label: 'Oxford Internet Institute, University of Oxford — “The Fifth Estate” project (W. H. Dutton)' },
      { url: 'https://wordhistories.net/2016/08/09/the-fourth-estate/', type: 'reference', label: 'Word Histories — origin of “the fourth estate”（Carlyle/Burke attribution）' },
    ],
  },
  {
    id: 'econ-public-goods-game',
    discipline: 'economics',
    title: '公共財ゲーム',
    statement:
      '実験経済学・ゲーム理論で社会的ジレンマ（協力か裏切りか）を研究する標準的な多人数ゲーム。各参加者は手元の元手（トークン）を私的口座に残すか、共通の「公共のポット」に秘密裏に拠出するかを選ぶ。ポットの総額は実験者によって1より大きく参加人数より小さい乗数（例1.6倍）に増やされ、拠出額に関係なく全員に均等再分配される。' +
      '個人の支配戦略は「拠出ゼロのフリーライド（タダ乗り）」だが、全員がそうすると社会的最適（全員全額拠出）を下回る＝囚人のジレンマの多人数版。実験では理論予測（ゼロ拠出）に反し当初は元手の約4〜5割を拠出するが、繰り返すと拠出は低下する（協力の崩壊）。非協力者に自費で罰を与える「処罰」機会があると利他的処罰が行われ協力が維持・回復する（Fehr & Gächter 2000/2002）。協力の進化や社会規範研究の中核である。',
    keyFigures:
      'Ernst Fehr & Simon Gächter（2000/2002・利他的処罰）／R. Mark Isaac & James M. Walker／John O. Ledyard（サーベイ）／囚人のジレンマの多人数版・フリーライダー',
    asOf: '2026-06',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Public_goods_game', type: 'reference', label: 'Wikipedia「Public goods game」— 定義・利得構造・繰り返しによる拠出低下と処罰効果' },
      { url: 'https://www.aeaweb.org/articles?id=10.1257%2Faer.90.4.980', type: 'academic', label: 'Fehr & Gächter (2000) “Cooperation and Punishment in Public Goods Experiments,” American Economic Review 90(4):980-994' },
      { url: 'https://oecs.mit.edu/pub/0i6tb22l/release/1', type: 'reference', label: 'MIT Open Encyclopedia of Cognitive Science「Economic Games」— 公共財ゲームを含む解説' },
    ],
  },
  {
    id: 'econ-chicken-game',
    discipline: 'economics',
    title: 'チキンゲーム（タカ・ハト・ゲーム）',
    statement:
      'チキンゲームは、2人のプレイヤーがいずれも強硬（タカ的）戦略を取り続けると双方が衝突＝最悪の結末に至るが、一方が譲歩（ハト的に回避）すれば譲歩した側だけが「チキン（臆病者）」の汚名を負い、譲歩しなかった側が最大の利益を得る対称ゲームである。名称は2台の車が正面から突進し先によけた方をチキンと呼ぶ度胸試し（1955年の映画『理由なき反抗』で普及）に由来する。' +
      '利得は「自分だけ強硬＞双方譲歩＞自分だけ譲歩＞双方衝突（T>R>S>P）」の順で、純粋戦略ナッシュ均衡は「一方が強硬・他方が譲歩」の非対称な2つ、加えて混合戦略均衡が存在する。生物学ではタカ・ハト・ゲーム、譲り合いの比喩ではスノードリフト（吹きだまり）ゲームとも呼ばれる。相互非協力（衝突）が最悪である点が、相互非協力が次悪にとどまる囚人のジレンマと異なる。あえて後に引けない姿勢を示すコミットメントが優位を生むという瀬戸際戦略（brinkmanship）の含意を持ち、軍拡競争・キューバ危機・労使交渉の分析に用いられる。',
    keyFigures:
      'ジョン・メイナード・スミス＆ジョージ・プライス（タカ・ハト・ゲーム・進化的安定戦略）／トーマス・シェリング（瀬戸際戦略）／反協調（anti-coordination）ゲーム・囚人のジレンマと区別',
    asOf: '2026-06',
    sources: [
      { url: 'https://plato.stanford.edu/entries/game-evolutionary/', type: 'reference', label: 'Stanford Encyclopedia of Philosophy「Evolutionary Game Theory」— hawk–dove と ESS、Maynard Smith & Price 1973' },
      { url: 'https://en.wikipedia.org/wiki/Chicken_(game)', type: 'reference', label: 'Wikipedia「Chicken (game)」— 利得順序 T>R>S>P・反協調ゲーム・混合戦略均衡・名称由来・囚人のジレンマとの差異' },
      { url: 'https://www.oxfordreference.com/display/10.1093/oi/authority.20110803095924919', type: 'reference', label: 'Oxford Reference「Hawk–Dove game」— チキンゲームの別名・生物学的定式化' },
    ],
  },
  {
    id: 'mgmt-mechanistic-organic',
    discipline: 'management',
    title: '機械的組織と有機的組織（バーンズ＆ストーカー）',
    statement:
      '機械的組織（mechanistic）と有機的組織（organic）とは、組織構造を環境適合の観点から2つの理念型に分類したもの。トム・バーンズとG.M.ストーカーが1961年の著書『The Management of Innovation（イノベーションの管理）』で、スコットランドのエレクトロニクス企業の研究から提示した。' +
      '機械的組織は安定した環境に適し、高度な専門分化と明確な職務、厳格な階層・集権的意思決定、公式規則と垂直的な指揮命令・コミュニケーションを特徴とする官僚制的な型である。有機的組織は変化が激しく不確実な環境に適し、職務の柔軟な再定義、分権的・ネットワーク型の水平調整、規則より相互調整と専門知識に基づく権限、水平的コミュニケーションを特徴とする。両者に優劣はなく、直面する環境の安定性・不確実性に応じて適合する型が異なるとした、コンティンジェンシー理論（条件適合理論）の先駆的研究である。',
    keyFigures:
      'トム・バーンズ（Tom Burns）／G.M.ストーカー（G. M. Stalker, 1961『The Management of Innovation』）／環境適合・コンティンジェンシー理論の先駆',
    asOf: '2026-06',
    sources: [
      { url: 'https://global.oup.com/academic/product/the-management-of-innovation-9780198288787', type: 'academic', label: 'Oxford University Press — The Management of Innovation (Burns & Stalker)' },
      { url: 'https://www.ebsco.com/research-starters/religion-and-philosophy/mechanistic-and-organic-organizations', type: 'reference', label: 'EBSCO Research Starters — Mechanistic and Organic Organizations' },
      { url: 'https://www.encyclopedia.com/management/encyclopedias-almanacs-transcripts-and-maps/mechanistic-organizations', type: 'reference', label: 'Encyclopedia.com — Mechanistic Organizations' },
    ],
  },
  {
    id: 'mgmt-likert-systems',
    discipline: 'management',
    title: 'リッカートのシステム4',
    statement:
      '社会心理学者レンシス・リッカート（ミシガン大学）が1961年『New Patterns of Management』および1967年『The Human Organization』で提示した、組織の管理（リーダーシップ）スタイルを意思決定への参加度・信頼・コミュニケーションの方向などから4類型に分ける理論。システム1＝独善的専制型（搾取的権威主義、恐怖・罰で統制し部下を信頼せず決定は最上層に集中）、システム2＝温情的専制型（主従的だが恩情的で限定的に権限委譲）、システム3＝相談型（部下に相談するが最終決定は上層）、システム4＝参加型（集団参加型、信頼に基づき部下が意思決定・目標設定・統制へ広く参加し双方向のコミュニケーションをとる）。' +
      'リッカートは企業・行政の調査から、システム4に近い組織ほど高い生産性・満足・低い離職を示すと論じ、参加型を最も有効とした。組織を重なり合う作業集団の連鎖とみなし、管理者が上位集団の一員かつ下位集団のリーダーとして両者をつなぐ「連結ピン（linking pin）」モデルも彼の概念である。彼はリッカート尺度（Likert scale）の考案者でもある。',
    keyFigures:
      'レンシス・リッカート（Rensis Likert, 1903–1981・ミシガン大学）／システム1〜4（搾取的/温情的権威主義・相談型・参加型）／連結ピン（linking pin）モデル／リッカート尺度',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.britannica.com/biography/Rensis-Likert', type: 'reference', label: 'Encyclopaedia Britannica — Rensis Likert（生涯・4リーダーシップ類型・参加型の優位）' },
      { url: 'https://en.wikipedia.org/wiki/Likert%27s_management_systems', type: 'reference', label: 'Wikipedia — Likert’s management systems（システム1〜4の定義）' },
      { url: 'https://www.science.org/doi/10.1126/science.162.3859.1260', type: 'academic', label: 'Science誌 書評 — The Human Organization (1967, McGraw-Hill) の出版確認' },
    ],
  },
  {
    id: 'human-actor-observer-bias',
    discipline: 'human-science',
    title: '行為者-観察者バイアス',
    statement:
      '行為者-観察者バイアス（actor–observer asymmetry）とは、ある行動の原因を帰属する際、自分（行為者）の行動は状況・外的要因に帰属しやすい一方、他者（観察者）の同じ行動は性格・気質など内的要因に帰属しやすいという、自己と他者の間の帰属の非対称性をいう。例えば自分の遅刻は「渋滞のせい」、他人の遅刻は「だらしないから」と考える傾向である。ジョーンズとニスベットが1971年に提唱し、説明として(1)知覚的顕著性（行為者は状況に、観察者は行為者に注意が向く）、(2)行為者と観察者で持つ情報の違いが挙げられる。' +
      '他者の行動を過度に内的要因へ帰属する「基本的帰属の誤り」と関連するが、本概念は自己と他者で帰属が非対称になる点に焦点がある点で区別される。ただしマル（Malle, 2006, Psychological Bulletin）の173研究メタ分析は、この非対称性が一般には頑健でなく平均効果量がほぼゼロで、出版バイアス等を補正すると0に収束すると報告し、古典的知見の再評価を促した。否定的事象など特定条件では出現し、肯定的事象では逆方向の非対称も見られる。',
    keyFigures:
      'エドワード・E・ジョーンズ（Edward E. Jones）＆リチャード・E・ニスベット（Richard E. Nisbett, 1971）／バートラム・マル（Bertram F. Malle, 2006メタ分析で再評価）／基本的帰属の誤りと区別',
    asOf: '2026-06',
    sources: [
      { url: 'https://research.clps.brown.edu/SocCogSci/Publications/Pubs/Malle_(2006)_ActObs_meta.pdf', type: 'academic', label: 'Malle, B. F. (2006). The Actor–Observer Asymmetry in Attribution: A (Surprising) Meta-Analysis. Psychological Bulletin, 132(6), 895–919 (Brown University)' },
      { url: 'https://en.wikipedia.org/wiki/Actor%E2%80%93observer_asymmetry', type: 'reference', label: 'Wikipedia: Actor–observer asymmetry' },
      { url: 'https://www.ovid.com/journals/plbul/abstract/00006823-200611000-00004~the-actorobserver-asymmetry-in-attribution-a-surprising', type: 'academic', label: 'Psychological Bulletin abstract (Ovid): The Actor–Observer Asymmetry in Attribution' },
    ],
  },
  {
    id: 'bizlaw-release-of-debt',
    discipline: 'business-law',
    title: '免除（民法519条）',
    statement:
      '免除とは、債権者が債務者に対して一方的な意思表示によりその債権を無償で消滅させること（債務を免じること）をいう。民法519条は「債権者が債務者に対して債務を免除する意思を表示したときは、その債権は、消滅する」と定める。免除は債権者の単独行為（一方的意思表示）であり、債務者の承諾を要しない。これは、債権者も自己の債権を自由に処分しうるためであり、債務者にとって利益にこそなれ不利益にならないことによる。' +
      '免除により債権は消滅し、全部免除の場合は担保権・保証債務など従たる権利義務も消滅する（一部免除はその限度）。ただし債権が差押えを受けている場合や質権が設定されている場合など、債権が第三者の利益の目的となっているときは免除できない。免除は弁済・代物弁済・供託・相殺・更改・混同と並ぶ債権消滅原因の一つで、これらが対価や債務の移転を伴うのに対し、免除は債権者の一方的意思表示による無償の債権消滅である点で区別される。なお連帯債務者の一人に対する免除は2017年改正（令和2年4月施行）で絶対効から相対効へ変更された（441条）。',
    keyFigures:
      '民法519条：債権者の一方的意思表示で債権消滅（債務者の承諾不要）／全部免除は担保権・保証等従たる権利も消滅／第三者の利益の目的（差押え・質権）となった債権は免除不可／弁済・代物弁済・供託・相殺・更改・混同と並ぶ債権消滅原因／連帯債務者の一人への免除は2017改正で相対効（441条）／e-Gov law id 129AC0000000089',
    asOf: '2026-06',
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（明治二十九年法律第八十九号、第519条 免除）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第519条', type: 'reference', label: 'Wikibooks 民法第519条（条文・解説）' },
      { url: 'https://www.businesslawyers.jp/practices/1196', type: 'reference', label: 'BUSINESS LAWYERS 連帯債務と免除の相対的効力（民法441条／2017年改正）' },
    ],
  },
  {
    id: 'infosoc-information-bank',
    discipline: 'information-sociology',
    title: '情報銀行（情報利用信用銀行）',
    statement:
      '情報銀行（情報利用信用銀行、information bank）とは、個人が自らのパーソナルデータ（購買・移動・健康・SNS等の履歴）の管理を信頼できる事業者に委ね、本人の同意やあらかじめ指定した条件に基づき、その事業者が本人に代わってデータの第三者提供の妥当性を判断・実行し、その対価（便益や金銭）を本人に還元する仕組み・事業者をいう。' +
      'データの利活用とプライバシー保護・自己情報コントロール権の両立を狙い、個人が自分のデータを蓄積・管理するPDS（Personal Data Store）やデータ取引市場と関連する。日本では総務省・経済産業省が主導し2018年6月に「情報信託機能の認定に係る指針Ver1.0」を策定、一般社団法人日本IT団体連盟による任意の認定制度が2018年〜運用される。背景にプラットフォーマーのデータ寡占への対抗、GDPRやデータポータビリティ権の議論があり、MITのA.ペントランドの「New Deal on Data」など国際的議論とも連なる。',
    keyFigures:
      'アレックス・“サンディ”・ペントランド（Alex “Sandy” Pentland, New Deal on Data）／総務省・経済産業省（情報信託機能の認定指針2018）／一般社団法人日本IT団体連盟（認定制度）／PDS・データポータビリティと関連',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.soumu.go.jp/johotsusintokei/whitepaper/ja/h30/html/nd112110.html', type: 'government', label: '総務省 平成30年版 情報通信白書「PDS・情報銀行・データ取引市場」' },
      { url: 'https://www.meti.go.jp/press/2018/06/20180626002/20180626002.html', type: 'government', label: '経済産業省「情報信託機能の認定に係る指針ver1.0を取りまとめました」(2018年6月26日)' },
      { url: 'https://link.springer.com/chapter/10.1007/978-981-99-0321-4_12', type: 'academic', label: 'H. Kümmerle, “More Than a Certification Scheme: Information Banks in Japan...” (Springer, 2023)' },
    ],
  },
];
// Stryker restore all
