// 経済史 確証済み年表ベース（1940年〜現在の世界経済・日本経済）
//
// 他の確証済みベース（VERIFIED_COMPLIANCE / VERIFIED_SUBSIDIES / VERIFIED_CONCEPTS）と同じ
// 確証ディシプリンで運用する：
//   - 各年について、独立した複数の信頼できる出典（百科事典・大学・公的統計・経済史文献等。
//     うち 1 件以上は権威ある出典）で確認できた事実のみ採録。確認できないものは破棄する。
//   - 「倒産した業種別ランキング」「売上が伸びた業種別ランキング」は、特に戦前〜高度成長期以前について
//     信頼できる定量統計が存在しないことが多い。存在しないランキングは捏造しない。出典で裏付く範囲で
//     拡大産業（risingSectors）・縮小産業（decliningSectors）の定性傾向のみを記し、限界は caveats に明記する。
//     （倒産統計は東京商工リサーチ・帝国データバンク等が戦後一定期間以降に整備。年次の厳密な業種別順位は
//      出典が得られた年についてのみ将来追補する。）
//
// ⚠ 本データは一般的な経済史の要約であり、投資判断等への助言ではない。数値・順位は出典・推計方法により
//    幅があるため、引用時は一次資料を確認すること。

export type EconHistorySourceType = 'academic' | 'reference' | 'government' | 'media';

export interface EconHistorySource {
  url: string;
  type: EconHistorySourceType;
  label: string;
}

export interface YearlyEconomy {
  year: number;
  era: string; // 元号表記（例: 昭和15年）
  world: string; // 世界経済の動向
  japan: string; // 日本経済の動向
  keyEvents: string[]; // その年の主な出来事
  risingSectors: string[]; // 出典で裏付く拡大産業の定性傾向
  decliningSectors: string[]; // 出典で裏付く縮小産業の定性傾向
  caveats: string; // 統計の限界・ランキング不在等の注記
  sources: EconHistorySource[];
}

// Stryker disable all : 静的な確証済みデータ（ロジックなし）
export const ECONOMIC_HISTORY: YearlyEconomy[] = [
  {
    year: 1940,
    era: '昭和15年',
    world:
      '第二次世界大戦の欧州戦線が急拡大し、ドイツがデンマーク・ノルウェー・低地諸国・フランスを制圧、夏以降は英本土航空戦（バトル・オブ・ブリテン）に移行した。米国はなお大恐慌の影響下（1940年の失業率は約9.5%、国防支出はGDPの約1.4%）にあったが、再軍備と対英援助を背景に軍需主導の景気回復が始まりつつあった。',
    japan:
      '1938年制定の国家総動員法を基盤とする戦時統制経済が一段と強化され、価格統制・配給制・戦略産業統制を伴う指令型経済が深化した。7月7日施行の七・七禁令（奢侈品等製造販売制限規則）で不急不要の奢侈品の製造・販売が広く禁止され、資源を軍需・重化学工業へ集中させる方向が明確化した（終身雇用・源泉徴収等の原型を見出す「1940年体制」論の対象時期）。',
    keyEvents: [
      'ドイツの西欧侵攻（ノルウェー・低地諸国・フランス陥落）とバトル・オブ・ブリテン',
      '米国の再軍備・国防支出の立ち上がり（1940年時点では対GDP約1.4%）',
      '日本：国家総動員法に基づく価格統制・配給制の強化',
      '日本：七・七禁令（奢侈品等製造販売制限規則）公布7/6・施行7/7',
    ],
    risingSectors: ['軍需・重化学工業（金属・機械・化学。戦略産業として資源・資金が優先配分）'],
    decliningSectors: ['民需消費財・奢侈品（高級衣料・宝石貴金属等。七・七禁令と配給制で製造販売制限）'],
    caveats:
      '1940年の倒産・売上の業種別ランキングに相当する信頼できる定量統計は確認できないため記載しない。rising/decliningは政策（軍需優先・奢侈品制限）から導かれる定性傾向であり業種別の数量比較ではない。戦時統制下で経済時系列統計は精度・公開性に限界がある。',
    sources: [
      { url: 'https://eh.net/encyclopedia/the-american-economy-during-world-war-ii/', type: 'academic', label: 'EH.net Encyclopedia（米国経済史学会）The American Economy during World War II' },
      { url: 'https://en.wikipedia.org/wiki/State_General_Mobilization_Law', type: 'reference', label: 'Wikipedia — State General Mobilization Law（国家総動員法）' },
      { url: 'https://www.cirje.e.u-tokyo.ac.jp/research/dp/2025/2025cf1256.pdf', type: 'academic', label: '東京大学 CIRJE ディスカッションペーパー（戦時日本経済）' },
    ],
  },
  {
    year: 1941,
    era: '昭和16年',
    world:
      '戦時需要が世界経済を支配した。3月の米武器貸与法（Lend-Lease）で米国は連合国へ即時支払い不要の援助を開始し、国内産業が戦時生産へ転換して失業はほぼ消滅、米国は世界最大の軍需生産国となった。6月の独ソ戦（バルバロッサ作戦）開始と12月の真珠湾攻撃により戦争は欧州・太平洋の両大洋規模へ拡大した。',
    japan:
      '重要産業団体令（統制会方式）・生活必需物資統制令・金属回収令・貿易統制令等で戦時統制経済を一段と強化し、自由通商は事実上停止した。7月の南部仏印進駐に対し米国は在米日本資産を凍結、輸入石油の大半が遮断された。12月8日の太平洋戦争開戦で資源（特に蘭印の石油）確保と戦時金融統制が国家経済の中心課題となった。',
    keyEvents: [
      '米武器貸与法（Lend-Lease Act）成立（3/11）— 米経済の戦時動員加速',
      '独ソ戦（バルバロッサ作戦）開始（6/22）',
      '米による在米日本資産凍結（7月）→ 事実上の対日石油禁輸（ABCD包囲網）',
      '真珠湾攻撃・太平洋戦争開戦（12/8）',
    ],
    risingSectors: ['（米国）軍需・防衛産業（航空機・艦船・車両・兵器）、造船・重工業'],
    decliningSectors: ['（日本）民生・消費財部門、自由な対外貿易（統制令・資産凍結・石油禁輸で縮小）'],
    caveats: '業種別の倒産件数・売上ランキング等の精密統計は当時十分に整備されておらず断定不可のため記載しない。拡大/縮小は出典で裏付く定性傾向に限定。',
    sources: [
      { url: 'https://www.britannica.com/event/Operation-Barbarossa', type: 'reference', label: 'Encyclopaedia Britannica — Operation Barbarossa（独ソ戦開始）' },
      { url: 'https://history.state.gov/milestones/1937-1945/pearl-harbor', type: 'government', label: 'U.S. Dept. of State, Office of the Historian — Pearl Harbor（対日資産凍結・石油禁輸）' },
      { url: 'https://www.ebsco.com/research-starters/economics/analysis-lend-lease-act', type: 'academic', label: 'EBSCO Research Starters — Lend-Lease Act' },
    ],
  },
  {
    year: 1942,
    era: '昭和17年',
    world:
      '戦時動員経済が本格化し、経済力の優位が連合国側へ傾き始めた。米国の軍需生産が急拡大し、ソ連は国民所得の大部分を戦争遂行に振り向けた。各国とも生産・労働・資源を国家統制下に置く総力戦体制へ移行した。',
    japan:
      '太平洋戦争は6月のミッドウェー海戦で主力空母4隻を失い攻勢能力を喪失、戦局の転換点を迎えた。国内では食糧管理法の制定で主要食糧の国家管理・配給通帳制が確立し、企業整備令で中小企業の整理統合・軍需産業への転換が進み、重要基幹部門に統制会が設けられて国家による経済集約が深化した。',
    keyEvents: [
      'ミッドウェー海戦（6/3–6）— 太平洋戦争の転換点',
      '食糧管理法公布（2/21）— 主要食糧の国家管理・配給通帳制',
      '企業整備令公布（5/13）— 中小企業の整理統合・軍需転換',
      '重要基幹産業への統制会設立（戦時国家統制経済体制がほぼ完成）',
    ],
    risingSectors: ['軍需産業（航空機・造船・兵器等の重工業。統制会・資源優先配分の対象）'],
    decliningSectors: ['民需・中小企業（企業整備令により整理・廃止・軍需転換を強制）'],
    caveats: '業種別の生産額ランキングや正確な統計値は信頼できる一次統計の裏付けが乏しいため記載しない（拡大/縮小は出典範囲の定性傾向のみ）。',
    sources: [
      { url: 'https://www.britannica.com/event/Battle-of-Midway', type: 'reference', label: 'Encyclopaedia Britannica — Battle of Midway' },
      { url: 'https://warwick.ac.uk/fac/soc/economics/staff/mharrison/public/ww2overview1998.pdf', type: 'academic', label: 'Mark Harrison, The Economics of World War II: An Overview（University of Warwick）' },
      { url: 'https://crd.ndl.go.jp/reference/entry/index.php?id=1000039310&page=ref_view', type: 'government', label: '国立国会図書館 レファレンス協同DB — 企業整備令（1942年5月13日公布）' },
    ],
  },
  {
    year: 1943,
    era: '昭和18年',
    world:
      '連合国側への戦局転換が明確化した。2月のスターリングラードでのドイツ第6軍降伏が独ソ戦の決定的転換点となり、太平洋でもガダルカナル島から日本軍が撤退して連合国が主導権を握った。米国の戦時生産は爆発的に拡大し、戦時関連生産はGNPの約40%に達した。',
    japan:
      '総力戦体制が本格化した。11月1日に勅令で軍需省を新設（商工省の大半と企画院の国家総動員部門を統合）して軍需生産行政を一元化し、10月には学徒出陣が始まった。1942年公布の企業整備令が1943年の閣議決定で強制力を強め、中小企業の統廃合・軍需転換と労働力動員が本格化した。',
    keyEvents: [
      'スターリングラードの戦い終結（2/2、ドイツ第6軍降伏）— 独ソ戦の転換点',
      'ガダルカナル島からの日本軍撤退（2月）',
      '学徒出陣開始・出陣学徒壮行会（10/21、神宮外苑）',
      '軍需省設置（11/1）— 軍需生産行政の一元化',
    ],
    risingSectors: ['軍需・兵器産業（航空機・艦艇・弾薬）、軍需転換された重化学・鉄鋼・金属'],
    decliningSectors: ['平和産業・民需消費財、中小商工業（企業整備令で統廃合・転業・廃業）'],
    caveats: '業種別の生産額順位・ランキングは信頼できる一次データで裏付けられないため記載しない。拡大/縮小産業は出典が示す定性傾向のみ。',
    sources: [
      { url: 'https://encyclopedia.ushmm.org/content/en/timeline-event/holocaust/1942-1945/german-defeat-at-stalingrad', type: 'government', label: 'USHMM Holocaust Encyclopedia — German Defeat at Stalingrad' },
      { url: 'https://www.archives.go.jp/ayumi/kobetsu/s18_1943_02.html', type: 'government', label: '国立公文書館「日本のあゆみ」昭和18年（軍需省設置）' },
      { url: 'https://eh.net/encyclopedia/the-american-economy-during-world-war-ii/', type: 'academic', label: 'EH.net Encyclopedia — The American Economy during World War II' },
    ],
  },
  {
    year: 1944,
    era: '昭和19年',
    world:
      '連合国の経済的・軍事的優位が決定的になり、連合国の戦時生産が枢軸国を全面的に凌駕した（米国GDPは1938年比約2倍）。経済面の最大の節目は7月のブレトンウッズ会議で、44か国が戦後国際通貨体制の枠組みに合意し、国際通貨基金（IMF）と国際復興開発銀行（世界銀行）の設立協定が起草され、ドルを基軸（金1オンス＝35ドル）とする制度が定められた。',
    japan:
      '軍需生産が物理的限界に達しつつあり、航空機・石油・鉄鋼・石炭・輸送など戦争遂行に不可欠な物資の供給が逼迫した。6月から本土戦略爆撃が始まり、7月のサイパン陥落で本土が長距離爆撃機の射程に入って東條内閣が総辞職、11月以降の本格的空襲が輸送船団・産業設備を破壊し戦時経済を崩壊へ向かわせた。',
    keyEvents: [
      'ノルマンディー上陸作戦（6/6）',
      'サイパンの戦い（マリアナ諸島陥落）→ 東條内閣総辞職（7/18）',
      'ブレトンウッズ会議（7/1–22）— IMF・世界銀行設立協定を起草',
      '米軍による日本本土戦略爆撃の開始（6月、11月にマリアナ基地から本格化）',
    ],
    risingSectors: ['（連合国側）軍需・兵器産業（航空機・戦車・銃砲・弾薬）の大量生産'],
    decliningSectors: ['（日本）航空機・石油・鉄鋼・石炭・輸送（船舶）など軍需関連産業（空襲・物資窮乏で生産破綻）'],
    caveats: '業種別ランキングや具体的生産数値は権威ある出典で個別裏付けが取れないため記載せず定性傾向に留めた。rising/decliningは交戦各国で方向が逆になるため連合国側／日本側を区別した。',
    sources: [
      { url: 'https://guides.loc.gov/this-month-in-business-history/july/bretton-woods-conference', type: 'government', label: 'Library of Congress — Bretton Woods Conference & the Birth of the IMF and World Bank' },
      { url: 'https://www.worldbank.org/en/archive/history/exhibits/Bretton-Woods-and-the-Birth-of-the-World-Bank', type: 'government', label: 'World Bank — Bretton Woods and the Birth of the World Bank' },
      { url: 'https://eh.net/encyclopedia/the-american-economy-during-world-war-ii/', type: 'academic', label: 'EH.net Encyclopedia — The American Economy during World War II' },
    ],
  },
  {
    year: 1945,
    era: '昭和20年',
    world:
      '第二次世界大戦が欧州（5月）・アジア太平洋（8〜9月）で終結し、本土を戦火で破壊されなかった米国が世界の金準備の大半を握り圧倒的な経済的優位に立った。ブレトンウッズ会議の合意に基づきIMFと世界銀行が12月27日に発足し、ドルを基軸とする戦後体制の枠組みが整い、10月24日には国際連合憲章が発効した。',
    japan:
      '8月15日の玉音放送による敗戦とGHQによる占領開始で日本経済は破局的状態に陥った。本土空襲・原爆により工業生産はほぼ全面停止し、建物・生産設備・船舶の多くを喪失、記録的凶作も重なって深刻な食糧難が発生した。公定価格と闇市価格の乖離に象徴される激しいインフレと極度の物資不足が続き、闇市が日常的な流通の場となった。',
    keyEvents: [
      '第二次世界大戦の終結（対日戦は8/15玉音放送・9/2降伏文書調印）',
      '日本の敗戦とGHQによる占領開始（8月末〜）',
      '広島・長崎への原爆投下と本土空襲による産業設備の壊滅的損害',
      'IMF・世界銀行の正式発足（12/27）／国際連合憲章発効（10/24）',
    ],
    risingSectors: ['闇市（非公式市場）を介した生活必需品・食糧の流通、代用食関連の供給'],
    decliningSectors: ['軍需産業（敗戦・武装解除・空襲で崩壊）、製造業全般（工業生産ほぼ全面停止）、海運（船舶の大部分を喪失）'],
    caveats:
      '損害の定量値（生産設備喪失率・船舶喪失率等）やインフレ倍率は出典により基準・数値に幅がある推計。業種別ランキング・市場シェアは信頼できる出典で確認できないため作成しない（精度方針に従い捏造を回避）。',
    sources: [
      { url: 'https://history.state.gov/milestones/1945-1952/japan-reconstruction', type: 'government', label: 'U.S. Dept. of State, Office of the Historian — Occupation and Reconstruction of Japan, 1945–52' },
      { url: 'https://www.federalreservehistory.org/essays/bretton-woods-created', type: 'government', label: 'Federal Reserve History — Creation of the Bretton Woods System' },
      { url: 'https://www.mof.go.jp/pri/publication/research_paper_staff_report/staff25.pdf', type: 'government', label: '財務省 財務総合政策研究所 スタッフ・レポート（戦後インフレ分析）' },
    ],
  },
  {
    year: 1946,
    era: '昭和21年',
    world:
      '戦後復興の始動期。米国は世界最大の経済大国として地位を固めつつ戦時の統制経済（価格統制・配給・資源割当）を年末までにほぼ解体し、自動車・住宅を軸とする民需主導の景気拡大へ転換した。同時に米ソ対立が表面化し、チャーチルの「鉄のカーテン」演説（3月5日）が冷戦の萌芽を象徴した。',
    japan:
      'GHQ占領下で民主化・非軍事化の構造改革が本格化し、財閥解体・第二次農地改革関連法（自作農創設特別措置法等、10月）・労働組合法施行（3月1日）が進んだ。経済は深刻な物資不足と通貨膨張による激しい戦後インフレに直面し、2月の金融緊急措置令で預金封鎖・新円切替を断行、年末（12月27日閣議決定）に石炭・鉄鋼へ資源を集中する傾斜生産方式の採用が決まった（本格実施は翌年）。',
    keyEvents: [
      '金融緊急措置令（2月）— 預金封鎖・新円切替で通貨膨張を抑制',
      '労働組合法施行（3/1）／チャーチル「鉄のカーテン」演説（3/5）',
      '第二次農地改革関連法成立（10月）— 地主制の解体へ',
      '日本国憲法公布（11/3）／傾斜生産方式の閣議決定（12/27）',
    ],
    risingSectors: ['（日本）石炭・鉄鋼（傾斜生産方式の重点投資対象）、自作農・農業（農地改革で拡大）', '（米国）自動車・住宅建設（復員兵向けと民需転換）'],
    decliningSectors: ['（日本）財閥系巨大持株会社・コンツェルン（財閥解体）、旧地主層の地代収入（農地改革）'],
    caveats: '1946年の倒産・売上の業種別ランキングに相当する信頼できる定量統計は存在しないため記載しない。rising/decliningは占領改革・傾斜生産から導かれる定性傾向。戦後インフレ率は出典により幅がある。',
    sources: [
      { url: 'https://www.ndl.go.jp/modern/cha5/index.html', type: 'government', label: '国立国会図書館 史料にみる日本の近代 第5章 新日本の建設（占領改革）' },
      { url: 'https://www.archives.go.jp/ayumi/kobetsu/s20_1945_07.html', type: 'government', label: '国立公文書館 日本のあゆみ（労働組合法の制定・施行1946-03-01）' },
      { url: 'https://www.let.rug.nl/usa/outlines/history-1994/postwar-america/the-postwar-economy-1945-1960.php', type: 'academic', label: '米国務省 Outline of U.S. History — The Postwar Economy 1945–1960（University of Groningen所収）' },
    ],
  },
  {
    year: 1947,
    era: '昭和22年',
    world:
      '冷戦の枠組みが経済面で固まった転換点。米国が世界の金準備の約7割を保有し、国際経済は「ドル不足」に支配された。3月のトルーマン・ドクトリン、6月のマーシャル・プラン提唱（実際の援助開始は1948年）、10月のGATT調印（23か国・ジュネーブ）で、封じ込めと多角的貿易自由化の枠組みが発足した。',
    japan:
      '極度の物資不足とインフレ下で、GHQ占領下の経済民主化（財閥解体・農地改革・労働改革）と基幹産業復興（傾斜生産方式）が並行した。復興金融金庫が1月に業務開始し基幹産業へ融資、財源の復金債を日銀が大量引受けして通貨膨張＝「復金インフレ」を招いた。独占禁止法・労働基準法の制定、過度経済力集中排除法の制定、二・一ゼネストのGHQ中止命令があった。',
    keyEvents: [
      'トルーマン・ドクトリン（3/12）／マーシャル・プラン提唱（6/5）',
      'GATT 23か国調印（10/30）— 戦後多角的貿易体制の発足',
      '復興金融金庫の融資本格化と復金インフレ',
      '独占禁止法・労働基準法の制定（経済民主化・労働改革）／二・一ゼネスト中止',
    ],
    risingSectors: ['（日本）石炭・鉄鋼・電力・肥料（傾斜生産方式・復金融資の重点配分先）', '（米国）資本財・対欧輸出関連'],
    decliningSectors: ['（日本）民需消費財・繊維等の軽工業（基幹産業に劣後）、旧財閥の持株支配構造（財閥解体・独禁法）'],
    caveats: '業種別ランキングは信頼できる当時統計を確認できないため定性傾向のみ。マーシャル・プランは1947年は「提唱」段階で援助実行は1948年。独禁法の施行日は資料により差がある。',
    sources: [
      { url: 'https://history.state.gov/milestones/1945-1952/marshall-plan', type: 'government', label: 'U.S. Dept. of State, Office of the Historian — Marshall Plan' },
      { url: 'https://www.wto.org/english/tratop_e/gatt_e/task_of_signing_e.htm', type: 'government', label: 'WTO — GATT 1947 and the task of signing（1947/10/30調印・23か国）' },
      { url: 'https://www.archives.go.jp/ayumi/kobetsu/s22_1947_03.html', type: 'government', label: '国立公文書館 日本のあゆみ（独占禁止法の制定・昭和22年）' },
    ],
  },
  {
    year: 1948,
    era: '昭和23年',
    world:
      '西側経済復興が本格化した転換年。米国主導のマーシャル・プラン（欧州復興計画ERP）が4月に発足し、約130億ドル規模の援助で西欧の復興と政治的安定を企図した。6月の西ドイツ通貨改革（ドイツマルク導入）とそれを引き金とするベルリン封鎖（6/24）で冷戦最初の主要危機が発生した。',
    japan:
      '敗戦後の混乱と「復金インフレ」が継続した。傾斜生産方式を支える復興金融金庫の融資・復金債の日銀引受が通貨増発を招き物価高を助長した。年末（12/18）にGHQが米政府の指令として「経済安定九原則」を示し安定化へ大きく舵を切った。復金融資をめぐる昭和電工事件（汚職）が発覚し芦田内閣総辞職の一因となった。',
    keyEvents: [
      'マーシャル・プラン（経済協力法）成立（4/3）— 西欧復興本格化',
      '西ドイツ通貨改革（6/20–21）→ ベルリン封鎖開始（6/24）',
      'GHQ「経済安定九原則」指令（12/18）— ドッジ・ラインへ',
      '昭和電工事件（復金融資めぐる汚職、芦田内閣総辞職の一因）',
    ],
    risingSectors: ['（日本）石炭・鉄鋼・化学（傾斜生産方式と復金融資の重点投入先）', '（西欧/西独）通貨改革後に供給回復した製造業・小売'],
    decliningSectors: ['（日本）インフレで購買力を圧迫された賃金生活者・固定所得層', '（西独）通貨改革で価値減した旧ライヒスマルク建て金融資産'],
    caveats: '業種別ランキングは1948年単年の信頼できる横断統計が確認できないため定性傾向に留める。マーシャル・プラン総額（約130億ドル）は集計範囲で出典により前後する。',
    sources: [
      { url: 'https://www.archives.gov/milestone-documents/marshall-plan', type: 'government', label: 'U.S. National Archives — Marshall Plan（1948-04-03成立）' },
      { url: 'https://www.bundesbank.de/en/press/contributions/the-economic-and-currency-reform-of-1948-the-basis-for-stable-money-915302', type: 'government', label: 'Deutsche Bundesbank — 1948年通貨改革・ドイツマルク導入' },
      { url: 'https://www.archives.go.jp/ayumi/kobetsu/s23_1948_02.html', type: 'government', label: '国立公文書館 日本のあゆみ（経済安定九原則・昭和23年12月）' },
    ],
  },
  {
    year: 1949,
    era: '昭和24年',
    world:
      '復興と冷戦構造の固定化が同時進行した。経済面では米国が短期景気後退（1948/11–1949/10、NBER認定）を経験し、9月の英ポンド大幅切り下げ（1ポンド＝4.03ドル→2.80ドル、約30%）がスターリング圏の連動切り下げを伴い世界の為替秩序を再編した。政治面ではNATO設立（4/4）・ソ連初核実験（8/29）・中華人民共和国成立（10/1）が相次いだ。',
    japan:
      'GHQ占領下で、米デトロイト銀行頭取ジョセフ・ドッジによる「ドッジ・ライン」（超均衡予算・補助金廃止・復金融資停止）でインフレを強制的に収束させた。あわせて1ドル＝360円の単一為替レートを設定し（以後1971年まで固定）、輸出主導の成長基盤を据えた。一方で急激な金融引き締めが倒産・大量人員整理を招く「ドッジ不況（安定恐慌）」を引き起こし、シャウプ勧告が戦後税制の骨格を示した。',
    keyEvents: [
      'ドッジ・ライン発表（3/7）— 超均衡予算でインフレ強制収束',
      '1ドル＝360円の単一為替レート設定（4月、〜1971年固定）',
      'NATO設立（4/4）／ソ連初核実験（8/29）／中華人民共和国成立（10/1）',
      '英ポンド切り下げ（9/18）／シャウプ勧告（戦後税制改革）',
    ],
    risingSectors: ['（日本）輸出関連製造業（360円固定相場が制度的基盤を提供。本格的恩恵は1950年特需以降）', '（米欧）マーシャル・プラン下の復興関連（資本財・インフラ）'],
    decliningSectors: ['（日本）補助金・復金融資に依存した国内産業（資金繰り難・倒産続出）、公的部門・国鉄（行政整理・人員整理）、内需型中小企業（安定恐慌の直撃）'],
    caveats: '業種別の定量ランキングは1949年単年では信頼できる一次統計を確認できず定性傾向に留めた。単一為替レート設定日は資料により4/23〜4/25と差がある。1949年は輸出主導回復の「仕込みの年」で不況色が濃い。',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Dodge_Line', type: 'reference', label: 'Wikipedia — Dodge Line（1949/3/7発表・360円固定・ドッジ不況）' },
      { url: 'https://www.nta.go.jp/about/organization/ntc/sozei/shiryou/library/19.htm', type: 'government', label: '国税庁 税務大学校 — シャウプ勧告と税制改正' },
      { url: 'https://en.wikipedia.org/wiki/1949_sterling_devaluation', type: 'reference', label: 'Wikipedia — 1949 sterling devaluation（9/18・約30%・連動切下げ）' },
    ],
  },
  {
    year: 1950,
    era: '昭和25年',
    world:
      '冷戦の「軍事化」が決定的になった。6月25日に朝鮮戦争が勃発し（冷戦初の本格的軍事衝突）、米国は即時介入して国連軍を組織、冷戦は経済・外交対立から再軍備の局面へ移行した。世界経済では戦後復興がほぼ完了し、米国が世界製造業の約半分を占める圧倒的優位に立ち、再軍備ブームで一次産品価格が急騰した。',
    japan:
      '前年のドッジ・ラインで「ドッジ不況（安定恐慌）」に陥り倒産・失業が続出していたが、6月の朝鮮戦争勃発で「朝鮮特需」（国連軍向けの物資・役務調達）が発生し一転して好況へ転じた。輸出・生産・稼働率・企業収益が急伸し、繊維（糸へん）・金属（金へん）を中心とする「糸へん・金へん景気」と呼ばれ、経済は戦前水準への回復へ向かった。',
    keyEvents: [
      '朝鮮戦争勃発（6/25）— 冷戦初の本格的軍事衝突',
      '朝鮮特需の発生 — ドッジ不況から一転して好況（糸へん・金へん景気）',
      'レッドパージの官民への拡大',
      '東証修正平均株価が史上最安値85.25円（7/6、ドッジ不況の底）',
    ],
    risingSectors: ['（日本）繊維（糸へん。軍服・テント等）、金属・鉄鋼（金へん。兵器・車両修理向け）、機械（特需の設備・修理需要）'],
    decliningSectors: ['（特になし。ただし特需前の前半はドッジ・デフレ下で中小企業の倒産・人員整理が広範に発生＝景気局面の影響）'],
    caveats: '本格的な特需効果は1950年後半〜1951年に顕在化。業種別の正確な生産・輸出ランキング（順位・数値）は一次確認できず、risingは定性傾向。decliningは断定根拠がないため景気局面の注記に留める。',
    sources: [
      { url: 'https://www.britannica.com/event/Korean-War', type: 'reference', label: 'Encyclopaedia Britannica — Korean War（1950/6/25勃発）' },
      { url: 'https://www.foreignaffairs.com/world/impact-rearmament-free-world-economy', type: 'media', label: 'Foreign Affairs — 再軍備が自由世界経済に与えた影響（再軍備ブーム）' },
      { url: 'https://www.seijo.ac.jp/pdf/faeco/kenkyu/158/158-asai.pdf', type: 'academic', label: '浅井良夫「1950年代の特需について」成城大学経済研究（特需の規模・推移）' },
    ],
  },
  {
    year: 1951,
    era: '昭和26年',
    world:
      '朝鮮戦争の継続と米国主導の西側再軍備が民間好況に上乗せされる形で世界的な好況局面となった。一方で軍備需要と戦略物資の投機的買い付けが一次産品価格・物価を押し上げ、インフレ圧力が顕著となった（米国のインフレ率は1950–51年に約7%へ上昇）。',
    japan:
      '9月8日にサンフランシスコ講和条約および日米安全保障条約に調印し、主権回復・占領終結へ向かった（両条約は翌1952年4月28日発効）。朝鮮特需を背景に「特需景気」が継続し、鉱工業生産が約35%増の高成長で戦前水準を回復、長期設備資金を供給する日本開発銀行が設立された。砂糖・硫安（肥料）・セメントの「三白景気」も戦前水準を超えた。',
    keyEvents: [
      'サンフランシスコ講和条約・日米安全保障条約に調印（9/8、翌1952年発効）',
      '朝鮮特需による特需景気の継続と外貨（ドル）獲得',
      '鉱工業生産が戦前水準を回復（約35%増の高成長）',
      '日本開発銀行の設立（4月）— 政策金融による長期設備資金供給',
    ],
    risingSectors: ['（日本）繊維（紡績）、鉄鋼・金属、セメント・砂糖・硫安（三白景気）、自動車（トラック。米軍調達が戦後自動車産業復活の契機）'],
    decliningSectors: ['（特需・輸出の恩恵が薄い一般民需・内需型中小製造。インフレ・原料高でコスト圧迫＝定性的推定）'],
    caveats: '業種別ランキング（順位付き）は信頼できる一次統計を確認できず定性傾向のみ。講和・安保条約は「調印1951／発効1952」を区別。「戦前水準回復」は指標・基準年により時期が前後する。',
    sources: [
      { url: 'https://www.state.gov/treaty-of-peace-with-japan-san-francisco', type: 'government', label: 'U.S. Dept. of State — Treaty of Peace with Japan, San Francisco (1951/9/8)' },
      { url: 'https://www.foreignaffairs.com/world/impact-rearmament-free-world-economy', type: 'media', label: 'Foreign Affairs — The Impact of Rearmament on the Free World Economy' },
      { url: 'https://ja.wikipedia.org/wiki/朝鮮特需', type: 'reference', label: 'Wikipedia — 朝鮮特需（特需・鉱工業生産の戦前水準回復）' },
    ],
  },
  {
    year: 1952,
    era: '昭和27年',
    world:
      '戦後経済拡大（資本主義の黄金時代）の初期局面にあり、米国・西欧・日本など西側諸国が高成長と完全雇用に近い状況を享受した。前年の朝鮮戦争特需による急騰は一服したが活動水準は高位安定で推移し、西ドイツが欧州最大の経済へ台頭していった。',
    japan:
      '4月28日にサンフランシスコ講和条約・日米安全保障条約が発効し、連合国による占領が終了して主権を回復した。8月13日にはIMFと世界銀行（IBRD）に正式加盟して国際経済システムへ復帰し、翌年以降は世銀借款で電源開発・基幹産業・運輸の基盤整備が進んだ。朝鮮戦争特需が継続して生産・株式を下支えする一方、5月1日に血のメーデー事件が発生した。',
    keyEvents: [
      'サンフランシスコ講和条約・日米安保条約 発効（4/28）— 占領終結・主権回復',
      '血のメーデー事件（5/1）',
      '日本がIMF・世界銀行（IBRD）に正式加盟（8/13）',
      '朝鮮戦争（1950–53）継続に伴う特需が経済を下支え',
    ],
    risingSectors: ['（日本）金属・鉄鋼・繊維・機械（朝鮮戦争の特需。定性傾向）、電力・運輸等インフラ（世銀借款で翌年以降本格化）'],
    decliningSectors: ['（特需ピークアウト後の繊維等で調整圧力との指摘はあるが業種別の確定データは未確認）'],
    caveats: 'DJIA年末値は確証値。日経平均は「1952年12月に約360円水準」までは公式確認できるが確定終値（小数）は独立確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://documents.worldbank.org/en/publication/documents-reports/documentdetail/615771586784586128', type: 'government', label: 'World Bank — Japan became a member of the IMF and the Bank on August 13, 1952' },
      { url: 'https://www.state.gov/treaty-of-peace-with-japan-san-francisco', type: 'government', label: 'U.S. Dept. of State — Treaty of Peace with Japan（発効1952-04-28）' },
      { url: 'https://en.wikipedia.org/wiki/Post%E2%80%93World_War_II_economic_expansion', type: 'reference', label: 'Wikipedia — Post–WWII economic expansion（戦後黄金時代）' },
    ],
  },
  {
    year: 1953,
    era: '昭和28年',
    world:
      '朝鮮戦争休戦協定が7月27日に調印され戦闘が終結した（3月のスターリン死去が和平を後押し）。米国は戦中の高インフレ抑制のためFRBが引き締めへ転換し、財政赤字縮小と相まって7月をピークに「1953年不況」（〜1954年5月、約10か月）に入ったが、戦後の長期拡大基調のなかの調整局面であった。',
    japan:
      '2月1日にNHKがテレビ本放送を開始、8月28日に日本テレビが日本初の民放テレビ本放送を開始し「街頭テレビ」普及の起点となった。経済面では朝鮮特需による好況が一服し、輸出停滞と大幅な輸入超過で国際収支が圧迫された、神武景気（1954年末〜）手前の過渡期であった。',
    keyEvents: [
      'NHKテレビ本放送開始（2/1）／日本テレビ民放テレビ開始（8/28）',
      'スターリン死去（3/5）→ 東京市場で「スターリン暴落」',
      '朝鮮戦争休戦協定調印（7/27）',
      '米国で「1953年不況」入り（7月〜1954年5月）',
    ],
    risingSectors: ['（日本）テレビ・放送関連／内需・耐久消費財への関心の芽生え（定性傾向）'],
    decliningSectors: ['（日本）朝鮮特需関連（特需一服・スターリン暴落で調整）、輸出産業全般（輸出停滞・輸入超過）'],
    caveats: 'DJIA年末値は確証値。日経平均1953年末確定値は権威ある出典で確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Recession_of_1953', type: 'reference', label: 'Wikipedia — Recession of 1953（米1953不況・FRB引締め）' },
      { url: 'https://www.archives.go.jp/ayumi/kobetsu/s28_1953_01.html', type: 'government', label: '国立公文書館 日本のあゆみ（テレビ放送開始・昭和28年）' },
      { url: 'https://www.seijo.ac.jp/pdf/faeco/kenkyu/158/158-asai.pdf', type: 'academic', label: '浅井良夫「1950年代の特需について」成城大学（輸出停滞・輸入超過）' },
    ],
  },
  {
    year: 1954,
    era: '昭和29年',
    world:
      '朝鮮戦争休戦（前年）後の調整期。米国の「1953年不況」は1954年5月に終わりV字回復に向かい、株式市場は大きく上昇してダウ平均が11月に大恐慌前の最高値を25年ぶりに更新した。インドシナではディエンビエンフー陥落（5/7）を経て7月21日にジュネーブ協定が結ばれ第一次インドシナ戦争が終結した。',
    japan:
      '1953年からの輸入超過・国際収支悪化を受けた金融引き締めでデフレ調整（1954年不況）が進んだ。3月に造船疑獄が表面化し、3月にMSA協定（日米相互防衛援助協定等）が締結、7月1日に防衛庁設置・自衛隊が発足した。年末（12月）からは神武景気の入口に入った。',
    keyEvents: [
      'ディエンビエンフー陥落（5/7）／ジュネーブ協定（7/21）— 第一次インドシナ戦争終結',
      '米「1953年不況」終了（5月）→ ダウ平均が大恐慌前最高値を25年ぶり更新（11月）',
      '造船疑獄の表面化／MSA協定締結（3月）',
      '防衛庁設置・自衛隊発足（7/1）／神武景気の入口（年末）',
    ],
    risingSectors: ['（米国）株式・耐久消費財（V字回復）', '（日本）年末からの設備投資・耐久財（神武景気の入口。定性傾向）'],
    decliningSectors: ['（日本）金融引き締め下のデフレ調整で内需型産業・中小企業が圧迫（1954年不況。定性傾向）'],
    caveats: 'DJIA年末値404.39は確証値（年間約+44%）。日経平均1954年末確定値は独立確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/people/william-mcchesney-martin-jr', type: 'government', label: 'Federal Reserve History — William McChesney Martin Jr.（1953–54の金融政策）' },
      { url: 'https://www.britannica.com/event/Battle-of-Dien-Bien-Phu', type: 'reference', label: 'Encyclopaedia Britannica — Battle of Dien Bien Phu / Geneva Accords' },
      { url: 'https://www.archives.go.jp/ayumi/kobetsu/s29_1954_01.html', type: 'government', label: '国立公文書館 日本のあゆみ（自衛隊発足・昭和29年）' },
    ],
  },
  {
    year: 1955,
    era: '昭和30年',
    world:
      '冷戦下で西側経済は拡大局面にあり、米国の景気は力強く株式市場は大幅高（ダウ平均年間+約20.8%）。7月にジュネーブで戦後初の米英仏ソ「4巨頭会談」が開かれ東西緊張が一時緩和した（「ジュネーブの精神」）。',
    japan:
      '神武景気（1954年12月〜1957年6月）のただ中にあり、高度経済成長の起点とされる年。9月にGATTへ正式加盟、11月の保守合同で自由民主党が結成され「55年体制」が出発した。耐久消費財「三種の神器」（白黒テレビ・電気洗濯機・電気冷蔵庫）への憧れが広がり始めた。',
    keyEvents: [
      'ジュネーブ4巨頭会談（7月）— 戦後初の首脳会談で東西緊張が一時緩和',
      '日本がGATTに正式加盟（9/10）',
      '自由民主党結成（11/15）— 55年体制の出発（10月に左右社会党再統一）',
      '神武景気の進行・三種の神器普及の始まり（高度成長の起点）',
    ],
    risingSectors: ['（日本）家電（三種の神器）、重化学工業（鉄鋼・機械）— 高度成長の主導産業（定性傾向）'],
    decliningSectors: ['（1955年に明確に縮小した業種を独立出典で確認できず）'],
    caveats: 'DJIA年末値488.40は確証値。日経平均1955年末確定値は信頼できる出典で確認できずnull。「もはや戦後ではない」は1956年度経済白書の表現であり1955年ではない。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.wto.org/english/thewto_e/countries_e/japan_e.htm', type: 'government', label: 'WTO — 日本のGATT加盟（1955年9月10日）' },
      { url: 'https://www.ndl.go.jp/modern/cha6/index.html', type: 'government', label: '国立国会図書館 史料にみる日本の近代 第6章 55年体制の形成' },
      { url: 'https://ja.wikipedia.org/wiki/神武景気', type: 'reference', label: 'Wikipedia — 神武景気（1954/12〜1957/6・高度成長の起点）' },
    ],
  },
  {
    year: 1956,
    era: '昭和31年',
    world:
      '冷戦下で東西対立が二つの危機に凝縮した。10〜11月にスエズ動乱（運河国有化に対する英仏イスラエルの軍事介入と米ソの圧力）が起き、ほぼ同時にハンガリー動乱がソ連軍に鎮圧された。スエズを契機に旧来の欧州列強の影響力後退と米ソ二極構造の深化が印象づけられた（米株は年末499.47でほぼ横ばい）。',
    japan:
      '神武景気のただ中で設備投資ブームと旺盛な内需により実質経済が戦前水準を回復・突破した。7月発表の1956年度『経済白書』（経済企画庁）が「もはや戦後ではない」と記し復興期の終了と新成長段階入りを宣言、12月18日に国際連合へ加盟（80番目）して国際社会復帰を果たした。',
    keyEvents: [
      'スエズ動乱（10–11月）／ハンガリー動乱（10/23–11/10）',
      '経済白書「もはや戦後ではない」（7月、経済企画庁）',
      '日本の国際連合加盟（12/18、80番目）',
      '神武景気の設備投資ブーム（スエズ動乱で鉄鋼・造船等の需要が刺激）',
    ],
    risingSectors: ['（日本）設備投資関連（鉄鋼・機械・電力）、造船（スエズ動乱で輸出船需要）、耐久消費財（三種の神器）'],
    decliningSectors: ['（日本国内の「衰退業種」を独立出典で特定できず）'],
    caveats: 'DJIA年末値499.47は確証値。日経平均1956年末確定値は権威ある出典で確認できずnull。「もはや戦後ではない」の原文主旨は「回復による成長は終わり今後は近代化による成長」という警句。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www5.cao.go.jp/keizai3/keizaiwp/wp-je56/wp-je56-010303.html', type: 'government', label: '内閣府 昭和31年度 年次経済報告（経済白書「もはや戦後ではない」）' },
      { url: 'https://www.mofa.go.jp/policy/other/bluebook/2017/html/chapter3/c030105.html', type: 'government', label: '外務省 日本の国連における取組（1956年12月加盟）' },
      { url: 'https://ja.wikipedia.org/wiki/神武景気', type: 'reference', label: 'Wikipedia — 神武景気（設備投資ブーム）' },
    ],
  },
  {
    year: 1957,
    era: '昭和32年',
    world:
      '冷戦・欧州統合・米景気後退が交差した転換点。10月4日にソ連が世界初の人工衛星スプートニク1号を打ち上げ宇宙開発競争が開幕し、3月25日に欧州6か国がローマ条約に調印して欧州経済共同体（EEC）創設へ向かった（発効1958/1/1）。米国は1957年8月〜1958年4月に戦後3度目の景気後退に入った（ダウ平均年間約-12.8%）。',
    japan:
      '約31か月続いた神武景気が、活発な内需による輸入急増→外貨不足・国際収支悪化を招き6月に終焉した。政府・日銀は1957年（3月・5月）に公定歩合を引き上げ6月に国際収支改善緊急対策を発表、この強力な金融引き締めで1957年後半〜1958年にかけ「なべ底不況」（在庫調整・操短・減収減益）に入った。',
    keyEvents: [
      'ローマ条約調印（3/25）— EEC設立へ（発効1958/1/1）',
      'スプートニク1号打ち上げ（10/4）— 宇宙開発競争の幕開け',
      '神武景気の終焉（6月）／国際収支悪化で公定歩合引き上げ（3月・5月）',
      '「なべ底不況」入り（1957後半〜1958）／米国も1957–58景気後退',
    ],
    risingSectors: ['（日本）設備投資・耐久消費財（神武景気の牽引役。ただし年央以降は引き締めで減速）', '（世界）航空宇宙・科学技術（スプートニク後）'],
    decliningSectors: ['（日本）在庫・操短の影響を受けた製造業全般（なべ底不況下の減収減益）', '（米国）製造業・耐久財（景気後退局面）'],
    caveats: 'DJIA年末値435.69は確証値（年間約-12.8%）。日経平均1957年末確定値は独立確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://history.state.gov/milestones/1953-1960/sputnik', type: 'government', label: 'U.S. Dept. of State, Office of the Historian — Sputnik, 1957' },
      { url: 'https://ja.wikipedia.org/wiki/なべ底不況', type: 'reference', label: 'Wikipedia — なべ底不況（神武景気終焉後の金融引き締め不況）' },
      { url: 'https://indexes.nikkei.co.jp/atoz/2016/06/1950s.html', type: 'reference', label: '日経平均プロフィル 1950年代（指数の歴史）' },
    ],
  },
  {
    year: 1958,
    era: '昭和33年',
    world:
      '1957年8月〜1958年4月の「アイゼンハワー不況」（戦後3度目の景気後退）から5月に急回復し、年末までに失地の大半を取り戻した。1月1日にローマ条約が発効して欧州経済共同体（EEC）・ユーラトムが6か国で発足し、年末には西欧主要通貨が経常取引の対外交換性を回復してブレトンウッズ体制が実質的に機能し始めた。',
    japan:
      'なべ底不況（1957/7〜1958/6）から、国内消費の高まりと1958年に3回行われた公定歩合引き下げにより後半に景気拡大へ転換し、これが42か月続く「岩戸景気」（1958/7〜1961/12）の始まりとなった。神武景気を上回る設備投資・技術革新主導の成長で、12月23日に東京タワーが竣工した。',
    keyEvents: [
      'ローマ条約発効（1/1）— EEC・ユーラトム発足（原加盟6か国）',
      '米国がアイゼンハワー不況から回復（5月）',
      '岩戸景気の開始（6〜7月、〜1961/12・42か月）',
      '東京タワー竣工（12/23）／西欧主要通貨が経常取引の対外交換性回復（年末）',
    ],
    risingSectors: ['（日本）耐久消費財（三種の神器）・設備投資関連（鉄鋼・機械・電機）— 岩戸景気の主導役', '（米国）自動車・住宅など内需（不況後の回復）'],
    decliningSectors: ['（米国）1957–58不況の渦中は工業生産・製造業が前年比で縮小（年央以降回復）'],
    caveats: 'DJIA年末値583.65は確証値（年間約+34%）。日経平均1958年末確定値は独立確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.europarl.europa.eu/factsheets/en/sheet/1/the-first-treaties', type: 'government', label: 'European Parliament — The First Treaties（ローマ条約・EEC発足）' },
      { url: 'https://www.ebsco.com/research-starters/history/recession-1957-1958', type: 'academic', label: 'EBSCO — Recession of 1957-1958（米不況と回復）' },
      { url: 'https://ja.wikipedia.org/wiki/岩戸景気', type: 'reference', label: 'Wikipedia — 岩戸景気（1958/7〜1961/12）' },
    ],
  },
  {
    year: 1959,
    era: '昭和34年',
    world:
      '1957–58年の世界的景気後退からの力強い回復・拡大局面で、米国は1959年に実質GDP成長率が高く失業率も低下した。冷戦下で国防関連が連邦予算の大きな割合を占める一方、FRBは利上げに転じ（翌1960–61年の景気後退の伏線）、年内に大規模な鉄鋼ストライキが発生した。',
    japan:
      '岩戸景気の進行期で「投資が投資を呼ぶ」と評され、神武景気を上回る規模の高度成長が続いた。4月10日の皇太子ご成婚（ミッチー・ブーム）が白黒テレビの爆発的普及を加速し三種の神器が全国へ波及した一方、9月の伊勢湾台風が戦後最悪級の風水害をもたらした。',
    keyEvents: [
      '皇太子ご成婚（4/10）— テレビ需要で白黒TV普及を加速（ミッチー・ブーム）',
      '岩戸景気の進行（設備投資主導の高度成長）',
      '伊勢湾台風（9/26）— 死者・行方不明約5,000名超の戦後最悪級風水害',
      '米国は1957–58不況から回復、鉄鋼ストとFRB利上げ',
    ],
    risingSectors: ['（日本）家電・耐久消費財（三種の神器）、鉄鋼・機械・設備投資関連製造業'],
    decliningSectors: ['（日本）伊勢湾台風被災地域の農業・水産・地場産業に一時的甚大被害（構造的衰退ではない）'],
    caveats: 'DJIA年末値679.36は確証値（米政府ERP表B-55で裏付け）。日経平均1959年末確定値は独立確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.govinfo.gov/content/pkg/ERP-2021/pdf/ERP-2021-table55.pdf', type: 'government', label: '米国 Economic Report of the President 表B-55（DJIA含む株価史）' },
      { url: 'https://www.data.jma.go.jp/stats/data/bosai/report/1959/19590926/19590926.html', type: 'government', label: '気象庁 — 伊勢湾台風（昭和34年9月）災害報告' },
      { url: 'https://ja.wikipedia.org/wiki/岩戸景気', type: 'reference', label: 'Wikipedia — 岩戸景気（投資が投資を呼ぶ）' },
    ],
  },
  {
    year: 1960,
    era: '昭和35年',
    world:
      '冷戦下の好況・拡大期だが、米国は1960年4月〜1961年2月に短い景気後退があった。最大の構造的出来事は脱植民地化で、17のアフリカ諸国が独立した「アフリカの年」となり国連加盟国が急増した。11月8日の米大統領選でケネディが当選した。',
    japan:
      '岩戸景気の最中で設備投資・重化学工業化・輸出が成長を牽引した。6月に日米安保条約改定をめぐる「60年安保闘争」が頂点に達し岸内閣が退陣、7月成立の池田勇人内閣は「寛容と忍耐」を掲げ国民の関心を経済へ転換、12月27日に「国民所得倍増計画」を閣議決定した。エネルギー革命を背景とする三井三池争議もこの年に終結した。',
    keyEvents: [
      '60年安保闘争が頂点（6月）→ 岸内閣退陣／池田内閣成立（7月）',
      '米大統領選でケネディ当選（11/8）',
      '「アフリカの年」— 17のアフリカ諸国が独立',
      '国民所得倍増計画の閣議決定（12/27）／三井三池争議終結',
    ],
    risingSectors: ['（日本）重化学工業（鉄鋼・化学・機械）・家電・設備投資・輸出（岩戸景気と倍増計画）'],
    decliningSectors: ['（日本）石炭産業（エネルギー革命で石炭→石油の構造不況。三井三池争議はその象徴）'],
    caveats: 'DJIA年末値615.89は確証値（年間約-9%）。日経平均1960年末値は巷間≈1,356円とされるが権威ある出典で確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Year_of_Africa', type: 'reference', label: 'Wikipedia — Year of Africa（1960年に17か国独立）' },
      { url: 'https://www.jfklibrary.org/learn/about-jfk/jfk-in-history/john-f-kennedy-and-african-independence', type: 'government', label: 'JFK Library — 1960年ケネディ当選とアフリカ独立' },
      { url: 'https://ja.wikipedia.org/wiki/所得倍増計画', type: 'reference', label: 'Wikipedia — 所得倍増計画（1960/12/27閣議決定）' },
    ],
  },
  {
    year: 1961,
    era: '昭和36年',
    world:
      '冷戦が緊張のピークに達した年。4月にソ連のガガーリンが人類初の有人宇宙飛行を達成し、米国はケネディが「10年以内の月着陸」を表明、8月にベルリンの壁の建設が始まり東西対立が固定化した。米国経済は1960–61年の景気後退から回復局面に入り、ケネディ政権の財政・防衛支出が下支えしてDJIAは年間で大幅高となった（12/13に当時最高値734.91）。',
    japan:
      '高度経済成長の中核期で、1958年7月からの「岩戸景気」（42か月）が1961年12月にピークを打って終了した。国民所得倍増計画の初年度にあたり実質GNP成長は約10%と目標を大きく上回ったが、設備投資の過熱で輸入が急増して国際収支が悪化し、年後半に日銀が金融引き締めに転じた。農業基本法が制定された。',
    keyEvents: [
      'ガガーリン人類初の有人宇宙飛行（4/12）／ベルリンの壁建設開始（8月）',
      '岩戸景気がピークを打って終了（12月）',
      '農業基本法の制定（戦後農政の基本法）',
      '所得倍増計画初年度（実質GNP成長約10%）／国際収支悪化で金融引き締めへ',
    ],
    risingSectors: ['（日本）機械・鉄鋼・電機など設備投資関連、家電・自動車（所得倍増下の消費拡大）', '（米国）航空宇宙・防衛（宇宙開発競争）'],
    decliningSectors: ['（日本）年後半の金融引き締め下で素材・在庫需給が調整局面に向かった（明確に縮小と断定できる業種データは未確認）'],
    caveats: 'DJIA年末値731.14は確証値（年間約+18.7%、12/13に当時高値734.91）。日経平均1961年末値は独立確認できずnull（頻出の「1,356円71銭」は1960年の値）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://fraser.stlouisfed.org/title/economic-report-president-45/1963-8134/fulltext', type: 'government', label: 'Economic Report of the President 1963（FRASER, St. Louis Fed）' },
      { url: 'https://ja.wikipedia.org/wiki/岩戸景気', type: 'reference', label: 'Wikipedia — 岩戸景気（1961/12にピーク・国際収支悪化）' },
      { url: 'https://www.ndl.go.jp/modern/e/cha6/description14.html', type: 'government', label: '国立国会図書館 — 池田内閣 所得倍増計画' },
    ],
  },
  {
    year: 1962,
    era: '昭和37年',
    world:
      '冷戦の頂点の年で、10月の「キューバ危機」（13日間）で米ソが核戦争に最接近し10/28に回避された。経済面では米国株式市場が大きく調整し、1961年12月のピークから1962年6月にかけて約27〜29%下落した（「ケネディ・スライド」、5/28に急落）。DJIAは年間で約-10.8%の下落年となった。',
    japan:
      '高度成長期のなかの景気調整局面。岩戸景気後の国際収支悪化（「国際収支の天井」）を受けた金融引き締めで1961年12月〜1962年10月は景気後退（踊り場）となった。池田内閣の所得倍増計画下にあり、10月5日に第一次「全国総合開発計画（全総）」を閣議決定、東京五輪・東海道新幹線（1964）に向けたインフラ投資が本格化していった。',
    keyEvents: [
      'キューバ危機（10月、約13日間）— 冷戦下で核戦争に最接近',
      '米株の「ケネディ・スライド」（1961/12ピークから約-29%、5/28急落）',
      '全国総合開発計画（全総）の閣議決定（10/5）',
      '岩戸景気後の金融引き締めによる景気後退（1961/12〜1962/10）',
    ],
    risingSectors: ['（日本）建設・土木・鉄鋼・セメント等インフラ関連（五輪・新幹線・全総）、耐久消費財（所得倍増下）'],
    decliningSectors: ['（日本）金融引き締めの影響を受けた設備投資・在庫調整局面の業種', '（米国）株式市場全般（年間約-10.8%、投機的成長株が調整）'],
    caveats: 'DJIA年末値652.10は確証値（年間約-10.8%）。日経平均1962年末確定値は独立確認できずnull（調整局面で軟調という定性傾向のみ確実）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.britannica.com/event/Cuban-missile-crisis', type: 'reference', label: 'Encyclopaedia Britannica — Cuban missile crisis' },
      { url: 'https://www.archives.go.jp/ayumi/kobetsu/s37_1962_01.html', type: 'government', label: '国立公文書館 — 全国総合開発計画 閣議決定（昭和37年10月）' },
      { url: 'https://en.wikipedia.org/wiki/Kennedy_Slide_of_1962', type: 'reference', label: 'Wikipedia — Kennedy Slide of 1962（米株調整）' },
    ],
  },
  {
    year: 1963,
    era: '昭和38年',
    world:
      '戦後の「資本主義の黄金時代」のただ中で、米国は長期の景気拡大局面にあり西欧（特に西独・伊）と日本が高成長を牽引した。米ソは前年のキューバ危機の反動から緊張緩和（デタント）へ向かい、8月の部分的核実験禁止条約（PTBT）署名がその象徴となった。11月22日にケネディ大統領が暗殺された。',
    japan:
      '池田内閣「所得倍増計画」下の高度経済成長期で実質GNP成長率は約7.5%。開放経済体制への移行が本格化し、貿易自由化率が1960年の約41%から1963年に92%超へ上昇、2月にGATT11条国へ移行した。二重構造是正のため7月に中小企業基本法が制定され、翌1964年の東京五輪・東海道新幹線へ向けた建設投資が活発化した。',
    keyEvents: [
      'GATT11条国へ移行（2月）— 国際収支を理由とする輸入制限ができなくなる',
      '中小企業基本法の制定（7/20）— 二重構造是正・近代化',
      '部分的核実験禁止条約（PTBT）署名（8/5・発効10/10）',
      'ケネディ大統領暗殺（11/22）／東京五輪・新幹線へ向けた建設ブーム',
    ],
    risingSectors: ['（日本）建設・土木（五輪・新幹線・首都高）、鉄鋼・機械・自動車、家電・耐久消費財、運輸・物流インフラ'],
    decliningSectors: ['（日本）貿易自由化・GATT11条国移行で輸入圧力にさらされた一部の国内保護産業・二重構造下の伝統的零細部門（中小企業基本法はこの是正が動機）'],
    caveats: 'DJIA年末値762.95は確証値（年間約+17.1%）。日経平均1963年末確定値は独立確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。当時は1ドル=360円固定相場・ブレトンウッズ体制下。',
    sources: [
      { url: 'https://history.state.gov/milestones/1961-1968/limited-ban', type: 'government', label: 'U.S. Dept. of State, Office of the Historian — The Limited Test Ban Treaty, 1963' },
      { url: 'https://hourei.ndl.go.jp/simple/detail?lawId=0000055026&current=-1', type: 'government', label: '国立国会図書館 日本法令索引 — 中小企業基本法（昭和38年7月20日 法律第154号）' },
      { url: 'https://ja.wikipedia.org/wiki/高度経済成長', type: 'reference', label: 'Wikipedia — 高度経済成長（貿易自由化・GATT11条国移行）' },
    ],
  },
  {
    year: 1964,
    era: '昭和39年',
    world:
      '米国は戦後最長級の長期好況のさなかにあり、ケネディが提案しジョンソンが2月に署名した歳入法（ケネディ＝ジョンソン減税。最高税率91%→70%、法人税52%→48%）がケインズ的な総需要刺激として景気拡大を後押しした。8月のトンキン湾事件が翌1965年の本格的軍事介入への転機となった。',
    japan:
      '高度経済成長の象徴的な年。10月1日に東海道新幹線（東京-新大阪）が開業し10月10日に東京オリンピックが開幕、「オリンピック景気」で内需が高揚した。4月にIMF8条国へ移行（為替制限の撤廃義務）し同月OECDに加盟して先進国入りを承認された一方、五輪後は反動と金融引き締めが重なり後半から「証券不況」の入口に入った。',
    keyEvents: [
      '東海道新幹線 開業（10/1）／東京オリンピック開幕（10/10）',
      'IMF8条国へ移行（4月）＋OECD加盟（4月）＝先進国入り',
      '米国 ケネディ＝ジョンソン減税成立（2月）／トンキン湾事件（8月）',
      '五輪後の反動・金融引き締めで「証券不況」の入口へ',
    ],
    risingSectors: ['（日本）建設・土木（五輪・新幹線・首都高）、鉄道車両・重電・電機、鉄鋼・セメント、観光・運輸・放送、自動車'],
    decliningSectors: ['（日本）後半からの証券業の収益悪化、五輪特需に依存した内需業種の反動減（1964後半〜1965に顕在化）'],
    caveats: 'DJIA年末値874.13は確証値（前年比約+15%）。日経平均1964年末確定値は独立確認できずnull（推定1,200円台前半）。証券不況は厳密には1964後半〜1965の現象。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Revenue_Act_of_1964', type: 'reference', label: 'Wikipedia — Revenue Act of 1964（ケネディ＝ジョンソン減税）' },
      { url: 'https://www.oecd.org/content/dam/oecd/en/publications/reports/1964/07/oecd-economic-surveys-japan-1964_g1g16d65/eco_surveys-jpn-1964-en.pdf', type: 'government', label: 'OECD Economic Surveys: Japan 1964' },
      { url: 'https://en.wikipedia.org/wiki/1964_in_Japan', type: 'reference', label: 'Wikipedia — 1964 in Japan（新幹線・五輪・IMF8条国・OECD加盟）' },
    ],
  },
  {
    year: 1965,
    era: '昭和40年',
    world:
      'ベトナム戦争で米国が本格的軍事介入に転換した年。3月2日に北爆作戦「ローリング・サンダー」が開始され、3月8日にダナンに初の米地上戦闘部隊（海兵隊）が上陸した。米株式市場は強気相場が続きDJIAは年末に1000の大台に接近した（年末終値969.26、年間+10.88%）。',
    japan:
      '「昭和40年不況（証券不況／構造不況）」の年。東京五輪後の反動と過剰設備・在庫調整が重なって証券市場が低迷し、5月に経営難の山一證券へ日銀特融が発動された。歳入不足に対応するため11月19日に戦後初の赤字国債（特例公債）発行を閣議決定し、この財政・金融両面の下支えを契機に11月を起点として戦後最長級の「いざなぎ景気」（〜1970/7、約57か月）が始まった。',
    keyEvents: [
      '米軍が北爆「ローリング・サンダー」開始（3/2）／海兵隊ダナン上陸（3/8）',
      '山一證券への日銀特融発動（5月、証券不況下の信用不安回避）',
      '戦後初の赤字国債（特例公債）発行を閣議決定（11/19）',
      'いざなぎ景気の起点（11月、〜1970/7・約57か月）',
    ],
    risingSectors: ['（日本）重化学工業（鉄鋼・造船・自動車・電機）・輸出関連製造業（いざなぎ景気を牽引）', '（米国）軍需・航空（ベトナム戦費拡大）'],
    decliningSectors: ['（日本）証券業（証券不況で収益悪化、山一が日銀特融を要する経営難）、不況期に倒産が相次いだ一部の鉄鋼・素材中堅（個社事例）'],
    caveats: 'DJIA年末値969.26は確証値（年間+10.88%）。日経平均1965年末確定値は独立2情報源で確証できずnull。業種別ランキングは一次統計未確認のため定性傾向＋個社事例に留める。',
    sources: [
      { url: 'https://www.nikkei.com/article/DGKDZO18159330T11C10A1KB2000/', type: 'media', label: '日本経済新聞 — 1965年11月19日 戦後初の赤字国債発行決定' },
      { url: 'https://www.history.com/articles/operation-rolling-thunder', type: 'media', label: 'History.com — Operation Rolling Thunder（1965年3月の北爆開始・地上部隊投入）' },
      { url: 'https://www.govinfo.gov/content/pkg/ERP-2021/pdf/ERP-2021-table55.pdf', type: 'government', label: '米国 Economic Report of the President 表B-55（DJIA年次）' },
    ],
  },
  {
    year: 1966,
    era: '昭和41年',
    world:
      'ベトナム戦争の本格的拡大に伴う軍事支出の急増を背景に、米国経済は高成長と完全雇用に近い水準を実現する一方、需要超過によるインフレ圧力が顕在化し始めた。ジョンソン政権が戦費と「偉大な社会」の国内支出を同時に拡大したが相応の増税を行わなかったため総需要が過熱し、FRBの金融引き締めで金利が上昇、DJIAは年間約-19%下落した（年末785.69）。',
    japan:
      '「いざなぎ景気」（1965/11〜1970/7）が本格化した年。1965年度の（建設）国債発行を起点とする財政主導の景気拡大が下支えとなり実質経済成長率は再び年10%超へ復帰した。耐久消費財が消費を牽引し、いわゆる「新三種の神器＝3C」（カー・クーラー・カラーテレビ）が新たな憧れの対象となりマイカーブームが始まった。',
    keyEvents: [
      '米国：ベトナム戦費拡大で需要過熱・インフレ圧力台頭、FRB引き締めでDJIA年間約-19%',
      '日本：いざなぎ景気の本格化、実質成長率が再び年10%超へ復帰',
      '日本：「新三種の神器（3C）」台頭・マイカーブーム',
      '日本：1965年度の（建設）国債発行を起点とする財政主導の景気拡大が定着',
    ],
    risingSectors: ['（日本）自動車（大衆車＝カローラ/サニー等）、家電（カラーテレビ・ルームエアコン）、百貨店・小売', '（米国）軍需・防衛関連'],
    decliningSectors: ['（米国）金利上昇局面で株式全般が軟調', '（日本）白黒テレビ・旧来型家電（3Cへの需要シフトで相対的地盤沈下）'],
    caveats: 'DJIA年末値785.69は確証値（年間約-18.94%）。日経平均1966年末確定値は独立確認できずnull。米実質GDP成長率は出典により6〜7%台と幅。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www5.cao.go.jp/keizai3/sekaikeizaiwp/wp-we66-1/wp-we66-00201.html', type: 'government', label: '内閣府 昭和41年 年次世界経済報告' },
      { url: 'https://www.commentary.org/articles/oscar-gass/the-u-s-economy-1966/', type: 'media', label: 'Commentary Magazine — The U.S. Economy, 1966' },
      { url: 'https://ja.wikipedia.org/wiki/いざなぎ景気', type: 'reference', label: 'Wikipedia — いざなぎ景気（3C・本格化）' },
    ],
  },
  {
    year: 1967,
    era: '昭和42年',
    world:
      '米欧主導の戦後成長と自由貿易拡大が続く一方、地政学リスクが顕在化した。7月1日にEC（欧州共同体）の執政機関統合が発効し、6月にGATTケネディ・ラウンドが妥結して大幅な関税引き下げに合意した。他方で6月に第三次中東戦争（六日間戦争）が勃発しスエズ運河閉鎖など後の石油危機の遠因となる緊張を残し、11月には英ポンド切り下げがあった。',
    japan:
      '「いざなぎ景気」の拡大局面のただ中で高度経済成長が継続した。OECD加盟後の国際公約として7月1日に第一次資本自由化を開始（対内直接投資の段階的開放）した。急成長の負の側面として公害が深刻化し、8月3日に公害対策基本法が制定された（四大公害が社会問題化）。',
    keyEvents: [
      'EC（欧州共同体）執政機関統合が発効（7/1）',
      'GATTケネディ・ラウンド妥結（関税大幅引き下げ）',
      '第三次中東戦争（六日間戦争、6/5–6/10）／英ポンド切り下げ（11月）',
      '日本：第一次資本自由化開始（7/1）／公害対策基本法 制定（8/3）',
    ],
    risingSectors: ['（日本）重化学工業（鉄鋼・石油化学・機械）、自動車・家電、エレクトロニクス・精密機械'],
    decliningSectors: ['（日本）石炭産業（エネルギー革命で構造的縮小が継続）、繊維など労働集約型在来産業'],
    caveats: 'DJIA年末値905.11は確証値（年間約+15%）。日経平均1967年末確定値は独立確認できずnull。当時の指数は「東証ダウ平均」として算出。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.archives.go.jp/ayumi/kobetsu/s42_1967_01.html', type: 'government', label: '国立公文書館 — 公害対策基本法が制定される（昭和42年8月）' },
      { url: 'https://www.britannica.com/event/Six-Day-War', type: 'reference', label: 'Encyclopaedia Britannica — Six-Day War（1967/6）' },
      { url: 'https://en.wikipedia.org/wiki/Merger_Treaty', type: 'reference', label: 'Wikipedia — Merger Treaty（EC執政機関統合 1967/7/1発効）' },
    ],
  },
  {
    year: 1968,
    era: '昭和43年',
    world:
      'ブレトンウッズ体制の動揺が表面化した年。3月にロンドン金プールが崩壊し金の二重価格制へ移行、ドルと米金準備への圧力が増して1971年ニクソン・ショックの伏線となった。ベトナム戦争のテト攻勢を契機に米欧で反戦運動が激化し、フランス五月革命やプラハの春など世界的な学生運動・政治的動乱が同時多発した。',
    japan:
      '「いざなぎ景気」のただ中で高度経済成長が続き、1968年に日本のGNPが資本主義（自由主義）諸国で米国に次ぐ世界第2位となり西ドイツを抜いた。耐久消費財の「3C」（カー・クーラー・カラーテレビ）普及が進む一方、大学紛争が広がった。',
    keyEvents: [
      'ロンドン金プール崩壊→金の二重価格制へ（3月、ブレトンウッズ動揺）',
      'テト攻勢を契機に米欧で反戦・抗議運動が拡大／フランス五月革命（5月）',
      '日本のGNPが資本主義国で世界第2位に（西ドイツを抜く）',
      '日本：3C普及と大学紛争の同時進行',
    ],
    risingSectors: ['（日本）自動車・耐久消費財（3C需要）、鉄鋼・重化学工業・電機、輸出関連製造業'],
    decliningSectors: ['（日本）相対的に農業など第一次産業の比重低下（構造的シフト）'],
    caveats: 'DJIA年末値943.75は確証値（12/31終値。月中平均由来の965.39と混在に注意）。日経平均1968年末確定値は独立確認できずnull。GNP世界第2位は資本主義国の中での順位。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'http://www.econ.yale.edu/growth_pdf/cdp764.pdf', type: 'academic', label: 'Yale Univ. Economic Growth Center — Japan 1968（GNP資本主義国2位・西独超え）' },
      { url: 'https://en.wikipedia.org/wiki/London_Gold_Pool', type: 'reference', label: 'Wikipedia — London Gold Pool（1968/3崩壊・二重価格制）' },
      { url: 'https://www.britannica.com/event/events-of-May-1968', type: 'reference', label: 'Encyclopaedia Britannica — Events of May 1968（フランス五月革命）' },
    ],
  },
  {
    year: 1969,
    era: '昭和44年',
    world:
      '米国は景気拡大の最終局面でインフレが加速し、FRBが金融引き締めを強化して金利を引き上げ、12月には景気後退入りした（〜1970/11、比較的軽微）。7月20日にアポロ11号が人類初の有人月面着陸を達成した一方、金・ドル交換性をめぐる緊張などブレトンウッズ体制の動揺が進行した。',
    japan:
      '「いざなぎ景気」（1965/11〜1970/7、約57か月）の終盤で高度経済成長の絶頂期にあった。1968年に達成したGNP資本主義国世界第2位の地位が定着し、5月に東名高速道路が全線開通して東京〜西日本の高速道路網が完成、3C（カラーテレビ・クーラー・自動車）普及など消費の高度化が進んだ。',
    keyEvents: [
      '東名高速道路 全線開通（5月、東京〜小牧）',
      'アポロ11号 人類初の月面着陸（7/20）',
      '米国でインフレ加速・FRB金融引き締め、12月に景気後退入り',
      '日本：いざなぎ景気終盤、GNP世界第2位が定着・消費の高度化',
    ],
    risingSectors: ['（日本）自動車（マイカー普及・東名開通）、家電（カラーテレビ・クーラー）、鉄鋼・機械・重化学工業、建設・土木（1970大阪万博関連）'],
    decliningSectors: ['（日本）繊維・軽工業など労働集約型の伝統産業（重化学工業へのシフトで相対的地位低下）、石炭（石油への転換継続）'],
    caveats: 'DJIA年末値800.36は確証値（年間約-15%）。日経平均1969年末確定値は複数の独立した一次ソースで確証できずnull（流通値2358.96は独立2情報源での裏取り不可）。業種別ランキングは一次統計未確認のため定性傾向のみ。ニクソン・ショック（金兌換停止）は1971年で1969年時点では未発生。',
    sources: [
      { url: 'https://www.nasa.gov/history/july-20-1969-one-giant-leap-for-mankind/', type: 'government', label: 'NASA — July 20, 1969 アポロ11号月面着陸' },
      { url: 'https://en.wikipedia.org/wiki/Recession_of_1969%E2%80%931970', type: 'reference', label: 'Wikipedia — Recession of 1969–1970（米インフレ・FRB引き締め・12月後退入り）' },
      { url: 'https://ja.wikipedia.org/wiki/いざなぎ景気', type: 'reference', label: 'Wikipedia — いざなぎ景気（期間・成長率・GNP世界第2位）' },
    ],
  },
  {
    year: 1970,
    era: '昭和45年',
    world:
      '米国は1969年12月から1970年11月まで約11か月続いた比較的軽い景気後退に陥り（NBER基準、失業率は12月に約6.1%）、後退局面でもインフレが鈍化せずスタグフレーションの前兆を示した。米ソ冷戦・ベトナム戦争が継続した。',
    japan:
      '戦後最長の好景気「いざなぎ景気」（1965/11〜1970/7、57か月）が7月に終了し、その後1971年12月まで景気後退（いわゆる昭和45・46年不況の入口）に入った。3〜9月に大阪万博（EXPO\'70）を開催して高度成長と世界第2位の経済力を象徴し、11〜12月の臨時国会（公害国会）で公害関連14法が成立して公害問題への政策転換が図られた。',
    keyEvents: [
      '大阪万博（EXPO\'70）開催（3/15〜9/13）',
      'いざなぎ景気の終了（景気の山＝7月）と、その後の景気後退入り',
      '公害国会（11〜12月）で公害関連14法が成立',
      '米国の1969–70年景気後退（〜11月）と根強いインフレ',
    ],
    risingSectors: ['（日本）建設・インフラ・観光関連（大阪万博特需、関西圏）、重化学工業（鉄鋼・自動車・電機・化学）'],
    decliningSectors: ['（日本）公害規制強化でコスト増に直面し始めた重化学・素材産業、景気後退入りで設備投資に減速感'],
    caveats: 'DJIA年末値838.92は確証値。日経平均1970年末確定値は独立2源で確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Recession_of_1969%E2%80%931970', type: 'reference', label: 'Wikipedia — Recession of 1969–1970（米景気後退）' },
      { url: 'https://www.erca.go.jp/yobou/taiki/rekishi/03_05.html', type: 'government', label: '環境再生保全機構 — 公害国会（1970年・公害関連14法）' },
      { url: 'https://ocw.u-tokyo.ac.jp/lecture_files/eco_05/12/notes/ja/JEH-25.pdf', type: 'academic', label: '東京大学OCW 武田晴人 現代日本経済史（高度成長の終焉）' },
    ],
  },
  {
    year: 1971,
    era: '昭和46年',
    world:
      '戦後国際通貨体制（ブレトンウッズ）が事実上崩壊した転換点。8月15日にニクソン米大統領が「新経済政策」で金・ドル交換停止・10%輸入課徴金・賃金物価凍結を発表（ニクソン・ショック）し、12月17–18日のスミソニアン協定でドルを金に対し切り下げ（金35→38ドル/oz）、変動許容幅±2.25%の新固定相場を設定した（同体制は約15か月で破綻）。',
    japan:
      '高度成長末期で外需依存度が高い日本にとってドル・ショックは重大な打撃となった。8月28日に1ドル=360円（1949年来の固定）を放棄し、12月のスミソニアン協定で1ドル=308円へ切り上げ（約16.88%の円高、参加国中最大）。輸出企業・産地は「死活問題」と反発し円高不況（ドルショック不況）懸念が広がった。並行して日米繊維交渉が決着し（政府間協定は1972年1月署名）、繊維など輸出産業は対米輸出規制と円高の二重圧力に直面した。なお景気後退自体は1970年7月から続いていた（谷は1971年12月）。',
    keyEvents: [
      'ニクソン・ショック（8/15）— 金・ドル交換停止＝ブレトンウッズ体制崩壊・10%輸入課徴金',
      '日本が1ドル=360円の固定相場を放棄（8/28）',
      'スミソニアン協定（12/17–18）— 円は1ドル=308円へ切り上げ（約16.88%）',
      '日米繊維交渉が決着し対米輸出自主規制へ（協定署名は1972年1月）',
    ],
    risingSectors: ['（円高による輸入コスト低下の恩恵を受けうる内需・輸入依存型業種。明確な一次資料ランキングは未確認）'],
    decliningSectors: ['（日本）繊維（対米輸出規制＋円高の二重圧力）、造船（円高で価格競争力低下）、自動車・電機など輸出依存製造業の打撃懸念'],
    caveats: 'DJIA年末値890.20は確証値（年間平均884〜885と取り違え注意）。日経平均1971年末確定値は独立2源で確認できずnull（定性的に約2,700円台）。円切り上げ幅は16.88%、ドル切り下げは対金約8.5%/対主要通貨平均約10.7%と基準で異なる。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/gold-convertibility-ends', type: 'government', label: 'Federal Reserve History — Nixon Ends Convertibility of U.S. Dollars to Gold (1971/8/15)' },
      { url: 'https://history.state.gov/milestones/1969-1976/nixon-shock', type: 'government', label: 'U.S. Dept. of State, Office of the Historian — Nixon Shock / End of Bretton Woods' },
      { url: 'https://www.nippon.com/en/in-depth/d00958/', type: 'media', label: 'Nippon.com — 変動相場制50年史（360→308円・16.88%）' },
    ],
  },
  {
    year: 1972,
    era: '昭和47年',
    world:
      'デタント（緊張緩和）が国際政治の主旋律となった転換の年。ニクソン米大統領が2月に電撃訪中し（米中接近）、5月にモスクワを訪問してSALT Iに調印した。経済面では前年のニクソン・ショックとスミソニアン協定を受けた固定相場の再調整下にあり、各国の金融緩和を背景に世界的に過剰流動性とインフレ圧力が高まった（OECD主要7か国の実質成長は約5.75%へ加速）。',
    japan:
      '高度成長末期の過熱局面。5月15日に沖縄が日本へ復帰し、7月に田中角栄内閣が発足して「日本列島改造論」を掲げた。これが地価急騰（列島改造ブーム）を招き、日銀の金融緩和（M2は1972年に+約26%）による過剰流動性が重なって土地・株式の資産価格が急上昇し、日経平均は1年でほぼ倍増（年末は約5,200円台）した。9月29日に田中首相訪中で日中共同声明（国交正常化）が結ばれた。',
    keyEvents: [
      'ニクソン米大統領訪中（2/21–28）— 米中接近',
      '沖縄の本土復帰（5/15）',
      '田中角栄内閣発足（7/7）と「日本列島改造論」',
      '日中共同声明・国交正常化（9/29）／DJIA史上初の終値1000ドル台乗せ（11/14）',
    ],
    risingSectors: ['（日本）不動産・土地（列島改造ブームと過剰流動性で地価急騰）、建設・土木・セメント等資材、総合商社・鉄鋼、金融'],
    decliningSectors: ['（年間は株価・景気全体が上昇基調で、明確に「衰退」と断定できる業種は確認できず。固定相場是正後で輸出採算が圧迫された輸出依存業種に逆風との指摘あり）'],
    caveats: 'DJIA年末値1020.02は確証値（初の1000ドル乗せは11/14=1003.16）。日経平均1972年末値は複数源が「約5,200円台（前年比ほぼ倍増）」で一致するが精密な確定終値は独立2源で確証できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.goldmansachs.com/our-firm/history/moments/1972-djia-1000', type: 'media', label: 'Goldman Sachs — DJIAが1972年に史上初の1000突破' },
      { url: 'https://www.archives.go.jp/ayumi/kobetsu/s47_1972_02.html', type: 'government', label: '国立公文書館 — 沖縄返還（昭和47年5月15日）' },
      { url: 'https://www.mofa.go.jp/mofaj/gaiko/bluebook/1973/s48-shiryou-3-11.htm', type: 'government', label: '外務省 外交青書 — 日中共同声明（1972/9/29）' },
    ],
  },
  {
    year: 1973,
    era: '昭和48年',
    world:
      '1971年のニクソン・ショック後に成立したスミソニアン体制が1973年2月の投機圧力で崩壊し、2〜3月に主要国が相次いで変動相場制へ移行した（ブレトンウッズ体制の事実上の終焉）。10月6日の第四次中東戦争を契機にOPEC/OAPECが原油価格引き上げ・供給制限・禁輸を発動し、第一次石油危機が発生（原油の国際価格が約3か月で約4倍）、西側先進国は同時にインフレと景気後退（スタグフレーション）に直面した。',
    japan:
      '日本は2月14日に変動相場制へ移行した。前年の列島改造を背景に地価・物価が既に上昇していたところへ石油危機が重なり、物価が暴騰する「狂乱物価」が発生、10月末〜11月にはトイレットペーパー等の買い占め・品薄騒動が起きた。原油・資源を輸入に依存する日本は打撃が大きく、翌1974年の戦後初の実質マイナス成長と高度成長の終焉につながった。',
    keyEvents: [
      '日本が変動相場制へ移行（2/14）／主要国が2〜3月に変動相場制へ（ブレトンウッズ体制終焉）',
      '第四次中東戦争（10/6）を契機に第一次石油危機（原油価格約4倍）',
      '日本で「狂乱物価」・トイレットペーパー買い占め騒動（10〜11月）',
      '高度経済成長の終焉へ（翌1974年に戦後初のマイナス成長）',
    ],
    risingSectors: ['（産油国・石油メジャー側の石油・資源関連）、省エネルギー・代替エネルギー関連（脱石油の機運で注目）'],
    decliningSectors: ['（日本）エネルギー多消費型の重厚長大産業（鉄鋼・石油化学・アルミ精錬・海運）、石油依存度の高い製造業・運輸全般、株式市場全般（1973–75年弱気相場入り）'],
    caveats: 'DJIA年末値850.86は確証値（年間約-16%。年間平均924.10と混同注意）。日経平均1973年末確定値は独立2源で確証できずnull（年初1/24高値5,359円のみ確証）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/oil-shock-of-1973-74', type: 'government', label: 'Federal Reserve History — Oil Shock of 1973–74' },
      { url: 'https://en.wikipedia.org/wiki/1973_oil_crisis', type: 'reference', label: 'Wikipedia — 1973 oil crisis（第四次中東戦争・OPEC禁輸・価格約4倍）' },
      { url: 'https://www.nippon.com/ja/japan-topics/today11010/', type: 'media', label: 'nippon.com — 1973年トイレットペーパーパニック（狂乱物価）' },
    ],
  },
  {
    year: 1974,
    era: '昭和49年',
    world:
      '第一次石油危機の影響が本格化し、西側先進国が同時不況に突入、高インフレと高失業が併存する「スタグフレーション」が典型化した（米国のCPI上昇率は約11%、景気後退は1973年11月〜1975年3月）。政治面ではウォーターゲート事件によりニクソン大統領が8月9日に辞任（米大統領初の辞任）しフォードが昇格した。',
    japan:
      '石油危機の打撃が最も鮮明に出た年。1974年度の実質経済成長率は戦後初のマイナスを記録し、1955年頃から続いた高度経済成長が事実上終焉した。消費者物価上昇率は1974年に約20.9%に達し「狂乱物価」と呼ばれた。政府は前年11月の石油緊急対策要綱以降「総需要抑制策」（金融引き締め・財政抑制）を採用し、インフレ鎮静と引き換えに景気を冷やし、以後の日本は「安定成長期」へ移行した。',
    keyEvents: [
      '第一次石油危機の影響本格化 — 先進国で世界同時不況・スタグフレーション',
      '米：ウォーターゲート事件でニクソン大統領が辞任（8/9）、フォード昇格',
      '日本：1974年度に戦後初の実質マイナス成長 — 高度経済成長の終焉',
      '日本：消費者物価上昇率が約20.9%の「狂乱物価」／総需要抑制策の継続',
    ],
    risingSectors: ['（日本）省エネ・低燃費関連（自動車の小型化等、日本車の競争力向上の素地）、資源・原油関連（価格高騰の恩恵）'],
    decliningSectors: ['（日本）エネルギー多消費型の素材・重厚長大産業（鉄鋼・石油化学・アルミ精錬）、個人消費依存セクター、株式市場全般（DJIAは年間約-27.6%）'],
    caveats: 'DJIA年末値616.24は確証値（年間約-27.6%。年内最安値12/6=577.60とは別）。日経平均1974年末確定値は独立2源で確証できずnull（単一源で約3,814円との情報）。物価上昇率は年度/暦年・指標で差異。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://history.state.gov/milestones/1969-1976/oil-embargo', type: 'government', label: 'U.S. Dept. of State, Office of the Historian — Oil Embargo, 1973–1974' },
      { url: 'https://www.enecho.meti.go.jp/about/special/johoteikyo/history4shouwa2.html', type: 'government', label: '経産省 資源エネルギー庁 — 日本のエネルギー史（2度のオイルショック）' },
      { url: 'https://www.govinfo.gov/content/pkg/ERP-2021/pdf/ERP-2021-table55.pdf', type: 'government', label: '米国 Economic Report of the President 表B-55（DJIA年次）' },
    ],
  },
  {
    year: 1975,
    era: '昭和50年',
    world:
      '1973年オイルショック後の世界的スタグフレーションが底を打ち、年後半から緩やかな回復局面へ向かった（米国は失業率が約9%まで上昇）。4月30日にサイゴン陥落でベトナム戦争が事実上終結し、11月に仏ランブイエで第1回先進国首脳会議（G6サミット）が開催されて主要国が協調対応を確認した。',
    japan:
      'オイルショック後の不況が継続し、総需要抑制策の影響で低成長となった。高度経済成長期が終わり「安定成長期」（実質成長率おおむね5%目安）へ移行し、1975年度に税収不足を補うため特例公債法を成立させて戦後初の本格的な赤字国債（特例公債）発行を再開した（以後の国債大量発行時代の起点）。省資源・省エネ志向と加工組立型産業の技術革新が進む転換点となった。',
    keyEvents: [
      'サイゴン陥落（4/30）— ベトナム戦争が事実上終結',
      '第1回先進国首脳会議（ランブイエ・サミット、11/15–17）',
      '日本：戦後初の本格的な特例公債（赤字国債）発行を再開（1975年度）',
      '日本：高度成長期から安定成長期へ移行',
    ],
    risingSectors: ['（日本）自動車・カラーテレビ等の輸出産業（省エネ・低燃費が追い風、対米シェア拡大）、鉄鋼輸出、省資源・省エネルギー関連、サービス・不動産業'],
    decliningSectors: ['（日本）繊維工業（構造不況業種化）、エネルギー多消費型・素材重厚長大型産業（原油高でコスト圧迫）'],
    caveats: 'DJIA年末値852.41（年間約+38%）・日経平均年末値4342.06はいずれも独立2源で一致した確証値（日経は225.jpn.org＋kabudreamの年足対照）。米1975年実質GDPは「微減/横ばい」と出典で幅。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.govinfo.gov/content/pkg/ERP-2021/pdf/ERP-2021-table55.pdf', type: 'government', label: '米国 Economic Report of the President 表B-55（DJIA 1975=852.41）' },
      { url: 'https://history.state.gov/historicaldocuments/frus1969-76v31/ch3', type: 'government', label: 'U.S. Dept. of State / FRUS — 第1回ランブイエ・サミット' },
      { url: 'https://225.jpn.org/1975/12/1975all/', type: 'reference', label: '日経平均チャート資料室 1975年（年末終値4,342.06）' },
    ],
  },
  {
    year: 1976,
    era: '昭和51年',
    world:
      '1973年の石油危機による戦後最悪級の不況からの回復が1975年春に始まり1976年前半まで続いたが、個人消費・設備投資の鈍さと高止まりする失業・インフレにより後半は減速した（緩やかで不均一な回復）。11月2日の米大統領選で民主党ジミー・カーターが現職フォードを破り当選した。米株はダウ平均が年末ベースで1000ドル台を回復した（年末1004.65、年間約+17.9%）。',
    japan:
      '高度成長期から安定成長期への移行期にあり、石油危機後の景気回復基調にあった。財政支出拡大・在庫投資・個人消費の持ち直しに加え、主要国の景気回復に伴う輸出（特に対米輸出）増加が回復を牽引した。一方、7月27日に田中角栄前首相がロッキード事件（外為法違反容疑）で逮捕され戦後最大級の政治疑獄となった。',
    keyEvents: [
      'ロッキード事件で田中角栄前首相を逮捕（7/27）',
      '米大統領選でカーター当選（11/2、フォードを破る）',
      'ダウ平均が年末ベースで1000ドル台を回復（年末1004.65）',
      '日本は安定成長期へ移行、対米輸出・財政/在庫投資主導で景気回復',
    ],
    risingSectors: ['（日本）輸出関連製造業（自動車・電機・機械、対米輸出増）', '（米国）株式市場全般（ダウ年間+約17.9%の回復）'],
    decliningSectors: ['（日本）エネルギー多消費型・石油依存型産業（高油価の影響継続）、内需依存セクター（後半減速）'],
    caveats: 'DJIA年末値1004.65は確証値（年間平均約974とは別。混同注意）。日経平均1976年末確定値は独立2源で確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www5.cao.go.jp/keizai3/keizaiwp/wp-je77/wp-je77-02402.html', type: 'government', label: '内閣府 昭和52年 年次経済報告（1976年の対米輸出増・回復要因）' },
      { url: 'https://www.britannica.com/event/United-States-presidential-election-of-1976', type: 'reference', label: 'Encyclopaedia Britannica — 1976年米大統領選（カーター当選）' },
      { url: 'https://www.nippon.com/ja/japan-topics/today07272/', type: 'media', label: 'nippon.com — 田中角栄前首相逮捕（1976/7/27）' },
    ],
  },
  {
    year: 1977,
    era: '昭和52年',
    world:
      'スタグフレーション（高インフレ＋高失業の併存）が石油危機後も残存。米国は1月就任のカーター政権下で雇用創出を最優先に景気刺激策（公共雇用・財政出動）を実施し失業は低下したが、後にエネルギー価格上昇でインフレが再加速へ向かった。5月のロンドン・サミット（G7）で経常黒字が大きい日本・西独に内需拡大で世界経済を牽引する「機関車」役が要請された（機関車論）。米株は軟調（DJIA年間約-17.3%）。なお1977年はパソコンの「1977 Trinity」（Apple II・Commodore PET・TRS-80）やAtari VCS登場で個人向けPC・家庭用ゲーム産業が興隆した転換点でもある。',
    japan:
      '福田赳夫内閣の下、円高（ドル安）が進行し年初の約290円前後から年末にかけ240円前後へ円高が進んだ（翌1978年初に1ドル=200円突破）。円高で輸出採算が悪化する「円高不況（第2次円高不況）」局面となり、日銀は公定歩合を数次引き下げて金融緩和、福田内閣は機関車論を受けて内需拡大（1978年度予算で公共事業費を大幅増）へ舵を切った。',
    keyEvents: [
      'カーター米大統領就任（1月）／ロンドン・サミットで機関車論（5月）',
      '円高進行（年末にかけ1ドル=240円前後へ）',
      '日銀の公定歩合引き下げ（金融緩和）と福田内閣の内需拡大転換',
      '世界：パソコンの「1977 Trinity」・Atari VCS登場（PC/家庭用ゲーム産業の興隆）',
    ],
    risingSectors: ['（日本）内需・公共事業関連（建設・土木）、輸入採算が改善する内需型業種', '（米国）パソコン・家庭用ゲーム（新興）、自動車（1977年は販売好調）'],
    decliningSectors: ['（日本）輸出依存度の高い製造業（自動車・電機・繊維等、円高で採算悪化＝円高不況）、造船（世界的な発注激減で構造不況へ）'],
    caveats: 'DJIA年末値831.17は確証値（12/31休場のため最終取引日は12/30、年間約-17.3%）。日経平均1977年末確定値は独立2源で確認できずnull。為替「240円前後」は年末の概略水準。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.govinfo.gov/content/pkg/ERP-2021/pdf/ERP-2021-table55.pdf', type: 'government', label: '米国 Economic Report of the President 表B-55（DJIA 1977=831.17）' },
      { url: 'https://g7.utoronto.ca/summit/1977london/communique.html', type: 'academic', label: 'G7 Information Centre — 1977 London Summit Declaration（機関車論）' },
      { url: 'https://www.computerhistory.org/timeline/1977/', type: 'reference', label: 'Computer History Museum — 1977（PC「Trinity」）' },
    ],
  },
  {
    year: 1978,
    era: '昭和53年',
    world:
      'ドル安が世界経済の中心的テーマとなり、対円・対独マルクでドルが戦後最安値圏まで下落した。7月16–17日の西独ボン・サミットで日・独が内需拡大（機関車役）、米国がエネルギー消費抑制を約束する協調パッケージで合意した（G7政策協調の初期の代表例）。11月1日に米国が大規模なドル防衛策を発表し、年末にかけイラン情勢悪化で第二次石油危機の前夜となった（DJIA年間約-3%）。',
    japan:
      '円高が輸出産業を直撃し産業構造の調整圧力が強まった一方、原油・輸入原材料は割安化した。5月20日に新東京国際空港（成田）が開港し、8月12日に日中平和友好条約に調印（10月批准）した。株式市場は堅調で日経平均は1973年1月の高値を上回り回復を確認、年末は約6,001円台で引けた。',
    keyEvents: [
      '新東京国際空港（成田）開港（5/20）',
      '西独ボンで第4回G7サミット（7/16–17、機関車論の協調合意）',
      '日中平和友好条約に調印（8/12）',
      'ドル安・円高がピーク圏へ／米ドル防衛策（11/1）／第二次石油危機の前夜',
    ],
    risingSectors: ['（日本）円高で輸入コストが低下した内需・素材/電力等、内需・インフラ関連（財政刺激）'],
    decliningSectors: ['（日本）円高で採算が悪化した輸出主導の製造業（自動車・電機・鉄鋼・造船）'],
    caveats: 'DJIA年末値805.01（年間約-3.1%）・日経平均年末値約6,001（小数部は源により6001.85等の差異あり整数採用）はいずれも独立2源で一致。為替「秋に175円台」の具体水準は独立確認できず未確定。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://g7.utoronto.ca/summit/1978bonn/communique/', type: 'academic', label: 'G7 Information Centre — 1978 Bonn Economic Declaration' },
      { url: 'https://www.elibrary.imf.org/display/book/9781451931068/ch044.xml', type: 'academic', label: 'IMF History Vol.2 — The Dollar in 1978（ドル安・協調介入）' },
      { url: 'https://www.jpx.co.jp/markets/statistics-equities/daily/03/1949-1980.html', type: 'government', label: 'JPX 東京証券取引所日報（株価一次データ）' },
    ],
  },
  {
    year: 1979,
    era: '昭和54年',
    world:
      'イラン革命を契機とする「第二次石油危機」の年。イランの石油輸出停止に買い溜め・投機が重なり原油価格は約1年で2倍超に急騰、先進国はインフレ高進と景気後退に直面した。6月に東京で第5回先進国首脳会議（東京サミット、日本初開催）が開かれ、12月末にソ連がアフガニスタンへ軍事侵攻して米ソデタントが終焉した。',
    japan:
      '第一次石油危機（1973–74）の教訓から省エネルギー投資・「減量経営」を進めており、第二次石油危機の打撃は欧米と比べ相対的に軽微にとどまった（"優等生"と評された）。同年、エズラ・ヴォーゲルの『ジャパン・アズ・ナンバーワン』が刊行され日本的経営への国際的注目を象徴した。',
    keyEvents: [
      '第二次石油危機（イラン革命を契機に原油価格が約1年で2倍超）',
      '第5回先進国首脳会議（東京サミット、日本初の議長国、6/28–29）',
      'ソ連のアフガニスタン軍事侵攻（12月下旬）— 新冷戦の引き金',
      'エズラ・ヴォーゲル『ジャパン・アズ・ナンバーワン』刊行',
    ],
    risingSectors: ['（日本）省エネルギー・代替エネルギー関連、自動車・精密機械など輸出製造業（低燃費車需要・国際競争力）', '石油・資源（産油国・上流の価格高騰の恩恵）'],
    decliningSectors: ['（日本）エネルギー多消費型・素材重厚長大産業（原油コスト高で採算圧迫）、石油依存度の高い運輸・物流'],
    caveats: 'DJIA年末値838.74・日経平均年末値6569.47（大納会12/28）はいずれも独立2源で一致した確証値。原油価格は指標（公定/スポット/銘柄）で数値差。「日本の影響が軽微」は相対評価。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/oil-shock-of-1978-79', type: 'government', label: 'Federal Reserve History — Oil Shock of 1978-79' },
      { url: 'https://g7.utoronto.ca/summit/1979tokyo/communique.html', type: 'academic', label: 'G7 Information Centre — 1979 Tokyo Summit Declaration' },
      { url: 'https://history.state.gov/milestones/1977-1980/soviet-invasion-afghanistan', type: 'government', label: 'U.S. Dept. of State — Soviet Invasion of Afghanistan' },
    ],
  },
  {
    year: 1980,
    era: '昭和55年',
    world:
      '第二次石油危機が世界的インフレを再燃させ（米国CPIは約13%）、ボルカーFRBが超金融引き締めに転じてFF金利は1980年初に17%台へ急騰、米国は1980年1〜7月に短期景気後退に入った。スタグフレーション末期からディスインフレ局面への転換点となった。',
    japan:
      '第二次石油危機の影響下にあったが、第一次危機後の省エネ・減量経営・合理化により主要先進国の中で相対的に良好なパフォーマンスを示した。自動車生産が米国を抜いて世界一になり、輸出競争力の高まりを背景に対米自動車輸出摩擦が激化した（翌1981年の輸出自主規制へ）。',
    keyEvents: [
      '第二次石油危機による世界的インフレ再燃（米CPI約13%）',
      'ボルカーFRBの超高金利政策（FF金利17%台）と米国の短期景気後退（1〜7月）',
      '日本の自動車生産が米国を抜き世界一に',
      '対米自動車輸出摩擦の激化',
    ],
    risingSectors: ['（日本）自動車・小型省燃費車（燃費優位で輸出急増、世界生産1位へ）、省エネ・電機/精密'],
    decliningSectors: ['（米国）自動車産業（日本車に押され生産大幅減）、高金利・景気後退に敏感な住宅・建設、エネルギー多消費型産業'],
    caveats: 'DJIA年末値963.99は確証値（年間+14.9%）。日経平均1980年末確定値は独立2源で確認できずnull（候補値≈7,116円は未確認）。自動車「世界一」の台数は集計範囲で幅。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/recession-of-1981-82', type: 'government', label: 'Federal Reserve History — ボルカー金融引き締め・1980年代の景気後退' },
      { url: 'https://www.elibrary.imf.org/view/journals/022/0018/004/article-A008-en.xml', type: 'academic', label: 'IMF Finance & Development (1981) — 二度の石油危機への日本の調整' },
      { url: 'https://www.upi.com/Archives/1980/12/23/Japan-tops-US-as-worlds-largest-automaker/2075346395600/', type: 'media', label: 'UPI Archives (1980/12/23) — 日本が米国を抜き世界最大の自動車生産国に' },
    ],
  },
  {
    year: 1981,
    era: '昭和56年',
    world:
      '米国でレーガン政権が1月に発足し、レーガノミクス（大型減税・規制緩和・歳出抑制・通貨引き締め）を推進、8月に経済再生租税法（ERTA）が成立して最高限界税率を70%→50%へ引き下げた。インフレ抑制のためFRBの高金利政策が続き、ドル高と世界的な景気後退を招いた（DJIA年末875、年間約-9.2%）。',
    japan:
      '鈴木善幸内閣の下、3月に第二次臨時行政調査会（土光臨調）が発足し「増税なき財政再建」を掲げて行財政改革（三公社の分割民営化等を提言、後にJR・NTT・JTとして実現）を審議した。対外では5月に対米乗用車の輸出自主規制（VER）を開始した（年168万台枠）。',
    keyEvents: [
      'レーガン大統領就任（1月）・レーガノミクス始動',
      '第二次臨時行政調査会（土光臨調）発足（3月）— 増税なき財政再建',
      '対米乗用車の輸出自主規制（VER）開始（5月、年168万台枠）',
      '経済再生租税法（ERTA）成立（8月、最高税率70%→50%）',
    ],
    risingSectors: ['（日本）自動車（VERにもかかわらず競争力は高く現地生産シフトの契機に）、家電・精密機械など輸出型製造業（ドル高局面で追い風）'],
    decliningSectors: ['（米国）自動車産業（ビッグ3が深刻な不振・大量レイオフ）、金利敏感業種（住宅・建設、超高金利で低迷）'],
    caveats: 'DJIA年末値875.00は確証値（年間約-9.2%。4/27に1,024.05の高値、9/25に824.01の安値）。日経平均1981年末確定値は独立2源で確認できずnull。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.upi.com/Archives/1982/01/02/The-1981-stock-market-confronted-with-big-mergers-unprecedented/3701378795600/', type: 'media', label: 'UPI Archives (1982/1/2) — 1981年株式市場総括（DJIA年末875）' },
      { url: 'https://en.wikipedia.org/wiki/Economic_Recovery_Tax_Act_of_1981', type: 'reference', label: 'Wikipedia — Economic Recovery Tax Act of 1981（ERTA）' },
      { url: 'https://ja.wikipedia.org/wiki/第二次臨時行政調査会', type: 'reference', label: 'Wikipedia — 第二次臨時行政調査会（土光臨調）' },
    ],
  },
  {
    year: 1982,
    era: '昭和57年',
    world:
      '米国の景気後退の底だった。ボルカーFRBの反インフレ高金利政策（FF金利は1981年に約19%のピーク）が需要を冷やし、1981年7月〜1982年11月の景気後退で失業率は年末に10.8%（戦後最悪）に達した。8月にメキシコが債務返済不能を通告してラテンアメリカ債務危機が表面化した一方、インフレは鎮静化し株式市場は8月の底（DJIA 776.92）から反発、長期強気相場が始まった。',
    japan:
      '対米貿易黒字の拡大が続き米欧との貿易摩擦が深刻化した（経常黒字約200億ドル規模）。実質GNP成長率は約3.3%と緩やかで成長は内需より輸出が主導し、内需は低迷気味だった。政治面では11月27日に第1次中曽根康弘内閣が発足した。',
    keyEvents: [
      'メキシコが債務返済不能を通告（8/20）— ラテンアメリカ債務危機の表面化',
      '米国の景気後退が底入れ（11月、失業率10.8%で戦後最悪）／DJIAが8/12に776.92で底打ち',
      '第1次中曽根康弘内閣発足（11/27）',
      '日本の対米貿易黒字拡大による貿易摩擦の激化',
    ],
    risingSectors: ['（米）年後半の金利低下・株反発で恩恵を受けた金融・株式関連', '（日）輸出主導の自動車・電機など製造業'],
    decliningSectors: ['（米）高金利に直撃された製造業・建設・自動車', '（中南米）債務危機で収縮した産業・公的部門', '（日）内需関連（個人消費・国内投資が低迷気味）'],
    caveats: 'DJIA年末値1046.54（年間+19.6%）・日経平均年末値8016.67はいずれも独立2源で一致した確証値。失業率10.8%は戦後最悪のピーク。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/recession-of-1981-82', type: 'government', label: 'Federal Reserve History — Recession of 1981–82' },
      { url: 'https://japan.kantei.go.jp/cabinet/71_e.html', type: 'government', label: '首相官邸 — 中曽根内閣（1982–）' },
      { url: 'https://en.wikipedia.org/wiki/First_Nakasone_Cabinet', type: 'reference', label: 'Wikipedia — First Nakasone Cabinet（1982/11/27発足）' },
    ],
  },
  {
    year: 1983,
    era: '昭和58年',
    world:
      '米国は1981–82年の深い景気後退から1982年末を底に力強い回復局面へ転換した「レーガン景気」の初年度で、実質GNPは約3.6%増。インフレは1980年代初頭ピークの約1/3まで低下し（ディスインフレ）、金利はピークから大幅低下した。1981年の大型減税と金融緩和転換が回復を後押しした一方、失業率はなお8%台と高止まり、財政赤字拡大が懸念材料となった。',
    japan:
      '内需が力強さを欠く中で輸出主導の景気回復となった。自動車・VTR・半導体などハイテク・耐久財輸出が伸長して対米貿易黒字が拡大し、対米貿易摩擦が激化した（自動車のVER継続、半導体での市場アクセス要求、12月に米下院ローカルコンテント法案可決）。4月15日に東京ディズニーランドが開園した（米国外初）。',
    keyEvents: [
      '米国でレーガン景気が始動（実質GNP約3.6%増・ディスインフレ・金利低下）',
      '日本：自動車・VTR・半導体などハイテク輸出が伸長し輸出主導の回復',
      '対米貿易摩擦の激化（自動車VER継続・半導体市場アクセス要求・12月ローカルコンテント法案可決）',
      '東京ディズニーランド開園（4/15、米国外初）',
    ],
    risingSectors: ['（日本）半導体（DRAM等）・VTR・自動車（輸出競争力）、レジャー/テーマパーク', '（米国）株式市場全般（DJIA年間約+20%）'],
    decliningSectors: ['（米国）対日競争業種（自動車・半導体）・輸入圧力下の重厚長大製造業'],
    caveats: 'DJIA年末値1258.64は確証値（12/30、年間約+20%）。日経平均1983年末確定値は独立2源で確認できずnull（流布値約9,800円台は未確証）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.reaganfoundation.org/ronald-reagan/the-presidency/economic-policy', type: 'reference', label: 'Reagan Presidential Foundation — Economic Policy（レーガン景気）' },
      { url: 'https://www.statmuse.com/money/ask/what+was+the+price+of+dow+jones+at+the+end+of+1983', type: 'media', label: 'StatMuse — DJIA 1983年末終値 1,258.64' },
      { url: 'https://en.wikipedia.org/wiki/Tokyo_Disneyland', type: 'reference', label: 'Wikipedia — Tokyo Disneyland（1983/4/15開園）' },
    ],
  },
  {
    year: 1984,
    era: '昭和59年',
    world:
      '米国経済は力強い景気拡大局面で、実質GNPは年間約6.8%増（34年ぶりの高い伸び）、インフレは沈静化（GNPデフレーター約3.7%）した。レーガン政権下で名目金利は1981年比で大幅低下したが歴史的にはなお高水準で、財政赤字拡大と高金利を背景にドルは独歩高となり、米国の貿易・経常赤字が拡大して対米黒字国との通商摩擦が先鋭化した。',
    japan:
      '景気は外需（輸出）主導で堅調だった。対米貿易黒字が記録的に拡大し、自動車・民生/産業エレクトロニクスなどハイテク輸出が好調だった。5月に日米円ドル委員会が報告書を公表し、金融・資本市場の自由化（東京市場・金利の自由化、ユーロ円市場の整備）と円の国際化を打ち出した（後の金融自由化・国際化の出発点）。1月9日には日経平均が史上初めて1万円を突破した。',
    keyEvents: [
      '日経平均が史上初めて1万円台を突破（1/9）',
      '米国の力強い景気拡大（年間実質GNP約6.8%増）とインフレ沈静',
      '日米円ドル委員会が報告書公表（5月）— 金融自由化と円の国際化',
      '日本の対米貿易黒字が記録的に拡大（自動車・ハイテク電子が牽引）',
    ],
    risingSectors: ['（日本）輸出向け自動車、民生・産業エレクトロニクス/半導体、対米輸出型製造業全般（ドル高の追い風）'],
    decliningSectors: ['（日本）内需依存・財政支出縮小の影響を受けたセクター（具体の業種序列は未確認の定性傾向）'],
    caveats: 'DJIA年末値1211.57は確証値（年間約-3.7%）。日経平均1984年末確定値は独立2源で確認できずnull（1/9の初の1万円突破は確証）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.reaganlibrary.gov/archives/speech/statement-1984-gross-national-product-and-inflation-figures', type: 'government', label: 'Reagan Library — 1984年GNP・インフレ声明' },
      { url: 'https://www5.cao.go.jp/keizai3/sekaikeizaiwp/wp-we84/wp-we84-00104.html', type: 'government', label: '内閣府 昭和59年 年次世界経済報告（日米円ドル委員会）' },
      { url: 'https://www.nikkei.com/article/DGKDZO50309040V00C13A1KB2000/', type: 'media', label: '日本経済新聞 — 1984年1月9日 日経平均初の1万円' },
    ],
  },
  {
    year: 1985,
    era: '昭和60年',
    world:
      '「ドル高の転換点」となった年。米ドルは1980年以降主要通貨に対し約50%上昇し1985年2月にピークに達していたが、9月22日にNYのプラザホテルでG5（米・日・西独・仏・英）がドル高是正に向けた協調介入で合意した（プラザ合意）。公表翌週からドルは急落し、非ドル通貨の秩序ある上昇が誘導された（背景に米国の貿易赤字拡大と保護主義圧力）。',
    japan:
      'プラザ合意を受け円は急騰し、合意前後の1ドル=約242円から1986年に約153円へ1年あまりで進行して輸出依存の製造業に打撃を与え「円高不況」の入口となった。行政改革の象徴として4月1日に電電公社→NTT、専売公社→JTが発足し（通信自由化も施行）、3〜9月に科学万博つくば\'85が開催された。',
    keyEvents: [
      'プラザ合意（9/22）— G5がドル高是正へ協調介入で合意',
      'プラザ合意後の急激な円高（約242円→1986年に約153円台へ）',
      '電電公社民営化でNTT発足／専売公社民営化でJT発足（4/1）・通信自由化',
      '科学万博つくば\'85開催（3/17〜9/16）',
    ],
    risingSectors: ['（日本）情報通信（NTT発足・通信自由化）、内需・サービス/金融（円高・低金利下で資産価格上昇の素地）、輸入関連・エネルギー'],
    decliningSectors: ['（日本）輸出依存型製造業（自動車・電機・機械、急激な円高で採算悪化＝円高不況）、旧公社の独占事業'],
    caveats: 'DJIA年末値1546.67は確証値。日経平均1985年末確定値は独立2源で確認できずnull（12月に13,000台到達は確認だが正確終値は2源一致せず）。為替数値は月次・概数で揺れ。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.bakerinstitute.org/research/personal-account-plaza-accord-september-22-1985', type: 'academic', label: 'Baker Institute — A Personal Account of the Plaza Accord (1985/9/22)' },
      { url: 'https://ja.wikipedia.org/wiki/日本電信電話公社', type: 'reference', label: 'Wikipedia — 日本電信電話公社（NTT 1985/4/1民営化）' },
      { url: 'https://en.wikipedia.org/wiki/Closing_milestones_of_the_Dow_Jones_Industrial_Average', type: 'reference', label: 'Wikipedia — Closing milestones of the DJIA（1985年末1,546.67）' },
    ],
  },
  {
    year: 1986,
    era: '昭和61年',
    world:
      '「逆オイルショック」が主旋律で、原油価格が約4か月で6〜7割急落し（$30台→$10前後）、産油国から消費国への大規模な所得移転として作用した。米国ではインフレ率が約2%まで低下するディスインフレが進行し、低金利環境のもとで1982年来の景気拡大が延命された。',
    japan:
      'プラザ合意後の急激な円高が輸出産業を直撃し前半は「円高不況」となった。政府・日銀は内需拡大へ転換し、4月に「前川レポート」が内需主導型成長・市場開放・国際協調を提言、日銀は1986年1月〜1987年2月に公定歩合を5回、5.0%→2.50%（当時の戦後最低）へ引き下げた。円高不況は11月に底を打ち、12月から「バブル景気（平成景気、〜1991年2月）」が始動した（後年のバブルの萌芽がこの金融緩和に内在）。',
    keyEvents: [
      '原油価格の急落（逆オイルショック、約4か月で6〜7割下落）',
      '米国のディスインフレ（インフレ率約2%へ）・低金利下で景気拡大継続',
      '前川レポート（4月）— 内需拡大・市場開放・国際協調を提言',
      '日銀の連続利下げ（公定歩合5.0%→2.50%）／円高不況の底入れ（11月）と平成景気の起点（12月）',
    ],
    risingSectors: ['（日本）内需・非製造業（建設・不動産・小売・サービス）、金融（銀行・証券、資産価格上昇の初期局面）、円高で交易条件が改善した加工産業'],
    decliningSectors: ['（日本）輸出依存の製造業（自動車・電機・鉄鋼、急激な円高＝円高不況）', '（世界）石油・エネルギー関連・産油地域経済（原油急落）'],
    caveats: 'DJIA年末値1895.95・日経平均年末値約18,701はいずれも独立2源で一致（日経の銭単位は未確定で整数採用）。原油下落率は出典で幅。前川レポートは私的諮問機関の報告書。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.cfr.org/blog/oil-lesson-1986-wrong', type: 'media', label: 'Council on Foreign Relations — The Oil Lesson of 1986（原油急落）' },
      { url: 'https://www.esri.cao.go.jp/jp/esri/prj/sbubble/history/history_01/analysis_01_02_02.pdf', type: 'government', label: '内閣府ESRI バブル史 — プラザ合意後の円高と円高不況' },
      { url: 'https://en.wikipedia.org/wiki/Japanese_asset_price_bubble', type: 'reference', label: 'Wikipedia — Japanese asset price bubble（公定歩合5回引き下げ・1986年の日経水準）' },
    ],
  },
  {
    year: 1987,
    era: '昭和62年',
    world:
      'ドル安是正を狙うルーブル合意（2/22、G6/G7パリ）で為替の安定化に転換した。米株は年初から夏まで急騰した後、10月19日「ブラックマンデー」でDJIAが1日−508.32pt（−22.61%）と過去最大の暴落を記録し世界同時株安に波及したが、金融当局の流動性供給で金融システム崩壊は回避され、米株は年末にかけ反発して通年では小幅プラスで着地した（低金利・過剰流動性が資産価格を押し上げる地合い）。',
    japan:
      '中曽根内閣の行政改革の総仕上げとして4月1日に国鉄が分割・民営化されJR各社（旅客6社＋貨物1社）が発足、先立つ2月9日にNTT株が上場した。プラザ合意後の円高・超低金利と過剰流動性を背景に地価・株価が急騰しバブル景気が本格化した。ブラックマンデーで10/20に日経が−14.9%（終値21,910円）と急落したが翌1988年に回復し上昇基調へ向かった。',
    keyEvents: [
      'NTT株上場（2/9）／ルーブル合意（2/22、為替安定化で協調）',
      '国鉄分割民営化でJR各社発足（4/1）',
      'ブラックマンデー（10/19）— DJIAが1日−22.61%、史上最大の下落率・世界同時株安',
      '日経平均が10/20に−14.9%急落（当時の過去最大下落率）／バブル景気の本格化',
    ],
    risingSectors: ['（日本）不動産・建設（地価高騰）、銀行・証券などの金融（過剰流動性・財テクブーム）、内需・消費関連、電気・通信（NTT上場）'],
    decliningSectors: ['（日本）輸出依存の製造業（プラザ合意後の円高で採算悪化＝円高不況局面。ただし後半は内需転換で景気拡大へ）'],
    caveats: 'DJIA年末値1938.83（年間+2.26%）・日経平均年末値21564.00（大納会）はいずれも独立2源で一致した確証値。ブラックマンデーの下落率は−22.61%（−22.6%は丸め）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/stock-market-crash-of-1987', type: 'government', label: 'Federal Reserve History — Stock Market Crash of 1987（ブラックマンデー）' },
      { url: 'https://en.wikipedia.org/wiki/Louvre_Accord', type: 'reference', label: 'Wikipedia — Louvre Accord（1987/2/22 ルーブル合意）' },
      { url: 'https://www.nikkei.com/article/DGKKZO85024940Z20C15A3KB2000/', type: 'media', label: '日本経済新聞 — 1987年4月1日 国鉄が分割・民営化' },
    ],
  },
];
// Stryker restore all

// ── 資産クラス別 年次系列（株式・不動産・仮想通貨） ─────────────────────────────
// ECONOMIC_HISTORY と同じ年に連動した、出典確証済みの資産指標。確証ディシプリンは同様：
//   - 確実に裏付く年末値（または年次指数値）のみ採録。確認できない値は null（捏造しない）。
//   - その資産が「まだ存在しない」年は null（例: 仮想通貨は2009年稼働開始、それ以前はN/A／
//     日経平均は東証再開1949年5月以降。取引所閉鎖の1945–1949年4月もN/A）。
// 単位: djiaYearEnd=米ドル(ダウ工業株30種 年末終値) / nikkeiYearEnd=円(日経平均 年末終値) /
//       japanUrbanLandIndex=市街地価格指数(全国・1936年9月=100) / bitcoinUsdYearEnd=米ドル(年末値)
export interface AssetPoint {
  djiaYearEnd: number | null;
  nikkeiYearEnd: number | null;
  japanUrbanLandIndex: number | null;
  bitcoinUsdYearEnd: number | null;
}

// Stryker disable all : 静的な確証済みデータ（ロジックなし）
export const ASSET_SERIES: Record<number, AssetPoint> = {
  // DJIA年末終値は複数の独立系列（MeasuringWorth/FRED/標準金融データ）で一致を確認。
  // 日本株・市街地価格指数の各年確定値は一次データ（日経ヒストリカル/JPX日報/統計局）が
  // 本環境で取得できず未照合のため null（取引所閉鎖年は本来N/A）。仮想通貨は2009年以前で N/A。
  1940: { djiaYearEnd: 131.13, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1941: { djiaYearEnd: 110.96, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1942: { djiaYearEnd: 119.4, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1943: { djiaYearEnd: 135.89, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1944: { djiaYearEnd: 152.32, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1945: { djiaYearEnd: 192.91, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1946: { djiaYearEnd: 177.2, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1947: { djiaYearEnd: 181.16, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1948: { djiaYearEnd: 177.3, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1949: { djiaYearEnd: 200.13, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1950: { djiaYearEnd: 235.41, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1951: { djiaYearEnd: 269.23, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1952: { djiaYearEnd: 291.9, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1953: { djiaYearEnd: 280.9, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1954: { djiaYearEnd: 404.39, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1955: { djiaYearEnd: 488.4, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1956: { djiaYearEnd: 499.47, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1957: { djiaYearEnd: 435.69, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1958: { djiaYearEnd: 583.65, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1959: { djiaYearEnd: 679.36, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1960: { djiaYearEnd: 615.89, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1961: { djiaYearEnd: 731.14, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1962: { djiaYearEnd: 652.1, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1963: { djiaYearEnd: 762.95, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1964: { djiaYearEnd: 874.13, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1965: { djiaYearEnd: 969.26, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1966: { djiaYearEnd: 785.69, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1967: { djiaYearEnd: 905.11, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1968: { djiaYearEnd: 943.75, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1969: { djiaYearEnd: 800.36, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1970: { djiaYearEnd: 838.92, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1971: { djiaYearEnd: 890.2, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1972: { djiaYearEnd: 1020.02, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1973: { djiaYearEnd: 850.86, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1974: { djiaYearEnd: 616.24, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1975: { djiaYearEnd: 852.41, nikkeiYearEnd: 4342.06, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1976: { djiaYearEnd: 1004.65, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1977: { djiaYearEnd: 831.17, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1978: { djiaYearEnd: 805.01, nikkeiYearEnd: 6001, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1979: { djiaYearEnd: 838.74, nikkeiYearEnd: 6569.47, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1980: { djiaYearEnd: 963.99, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1981: { djiaYearEnd: 875.0, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1982: { djiaYearEnd: 1046.54, nikkeiYearEnd: 8016.67, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1983: { djiaYearEnd: 1258.64, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1984: { djiaYearEnd: 1211.57, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1985: { djiaYearEnd: 1546.67, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1986: { djiaYearEnd: 1895.95, nikkeiYearEnd: 18701, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1987: { djiaYearEnd: 1938.83, nikkeiYearEnd: 21564.0, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
};

export const ASSET_SERIES_NOTES =
  '株式（DJIA年末終値）は複数の独立系列で一致を確認した確証値。日本株（日経平均）は東証再開1949年5月以降が対象（取引所閉鎖の1945–1949年4月はN/A）、' +
  '各年確定値は一次データ未照合のため現状null。市街地価格指数（全国・1936年9月=100、1946年9月以降は半期）も各年確定値は未照合でnull。' +
  '仮想通貨はビットコイン稼働開始（2009年1月）・市場価格成立（2010年）以前は存在せずN/A。値が得られ次第、確証のうえ追補する。';

export const ASSET_SERIES_SOURCES: EconHistorySource[] = [
  { url: 'https://www.measuringworth.com/datasets/DJA/index.php', type: 'academic', label: 'MeasuringWorth — Dow Jones Average 日次/月次終値データセット' },
  { url: 'https://fred.stlouisfed.org/series/M1109BUSM293NNBR', type: 'government', label: 'FRED, St. Louis Fed — Dow-Jones Industrial Stock Price Index' },
  { url: 'https://indexes.nikkei.co.jp/atoz/2016/06/1950s.html', type: 'reference', label: '日経平均プロフィル — 算出開始1950/9/7・1949/5/16へ遡及（日本株の起点）' },
  { url: 'https://www.reinet.or.jp/?page_id=168', type: 'government', label: '日本不動産研究所 — 市街地価格指数（1936年9月=100基準）' },
  { url: 'https://www.britannica.com/biography/Satoshi-Nakamoto', type: 'reference', label: 'Encyclopaedia Britannica — Satoshi Nakamoto（ビットコイン2009年稼働開始）' },
];
// Stryker restore all
