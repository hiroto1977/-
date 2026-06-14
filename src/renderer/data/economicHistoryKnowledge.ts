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
  {
    year: 1988,
    era: '昭和63年',
    world:
      '1987年10月のブラックマンデーからの回復が定着し、米景気拡大は6年目に入った。レーガン政権下で実質成長は力強く（実質GNP成長は概ね4%台半ば）、インフレは沈静化し失業率も低下基調で、株価暴落は実体経済への一時的な調整にとどまった。DJIAは年間約+11.8%上昇して年末2,168.57で越年した。',
    japan:
      'プラザ合意後の超低金利・過剰流動性を背景にバブル景気が本格化し、地価・株価が急騰、日経平均は大納会で30,159円（前年末比約+40%）まで上昇した。経済企画庁の昭和63年度年次経済報告は「内需主導型成長」の達成を掲げ、輸出主導から内需主導の好況へ転換した。一方で6月にリクルート事件が発覚し政官界を直撃、竹下内閣は内需刺激の象徴として全市区町村へ一律1億円を交付する「ふるさと創生事業」を始めた。',
    keyEvents: [
      'ブラックマンデー（1987/10）からの回復定着、米景気拡大が6年目に継続',
      '日本のバブル景気が本格化—地価・株価が急騰、日経平均が年間約+40%上昇',
      'リクルート事件発覚（6/18）—戦後最大級の汚職事件に発展',
      'ふるさと創生事業（竹下内閣）—全市区町村へ一律1億円交付',
      '昭和63年度年次経済報告が「内需主導型成長」の達成を宣言',
    ],
    risingSectors: ['（日本）不動産・建設（地価急騰）、銀行・証券などの金融（過剰流動性・財テク）、内需・消費関連、自動車・エレクトロニクスなどの製造業（好況下で堅調）'],
    decliningSectors: ['好況局面のため明確に縮小した業種を独立2源以上で特定できず（捏造せず）。輸出比率は内需転換で低下傾向。'],
    caveats: 'DJIA年末値2168.57（12/30終値、12/31は土曜で休場・年間約+11.8%）と日経平均年末値30159.00（大納会・翌年大発会始値30,165.52と整合）は独立2源で一致。1988年の実質成長率は高水準だが出典・指標（GNP/GDP）により概ね5〜7%と幅があり、本文では概数表現に留める。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www5.cao.go.jp/keizai3/keizaiwp/wp-je88/wp-je88-000i1.html', type: 'government', label: '内閣府（経済企画庁）— 昭和63年度 年次経済報告（内需主導型成長）' },
      { url: 'https://www.mofa.go.jp/policy/other/bluebook/1988/1988-2-2.htm', type: 'government', label: 'MOFA 外交青書1988 — 内需主導成長・需要項目別成長率' },
      { url: 'https://ja.wikipedia.org/wiki/%E3%83%AA%E3%82%AF%E3%83%AB%E3%83%BC%E3%83%88%E4%BA%8B%E4%BB%B6', type: 'reference', label: 'Wikipedia（日本語）— リクルート事件（1988/6/18発覚）' },
    ],
  },
  {
    year: 1989,
    era: '昭和64/平成元年',
    world:
      '冷戦終結が劇的に進み、6月の天安門事件、11月9日のベルリンの壁崩壊、12月のマルタ会談（冷戦終結宣言）が相次いだ。米経済は拡大を続け、DJIAは年間約+27%上昇して年末2,753.20で越年した。インフレ警戒から各国が金融引き締めに転じる局面となった。',
    japan:
      '1月7日に昭和天皇が崩御し翌8日に「平成」へ改元、4月1日に税率3%の消費税が初めて導入された。バブル景気の絶頂で、日経平均は12月29日の大納会で史上最高値38,915.87円（取引時間中38,957.44円）を記録した。資産価格高騰を受け日銀は5月から公定歩合の引き上げに転じ、金融引き締めへ方針転換した。',
    keyEvents: [
      '昭和天皇崩御（1/7）→「平成」改元（1/8）',
      '消費税3%を初導入（4/1）',
      '天安門事件（6/4）／ベルリンの壁崩壊（11/9）／マルタ会談（12月・冷戦終結）',
      '日経平均が史上最高値38,915.87円（12/29 大納会）',
      '日銀が公定歩合引き上げに転換（5月〜）、金融引き締めへ',
    ],
    risingSectors: ['（日本）不動産・建設、銀行・証券などの金融（バブル絶頂・財テク）、内需・消費関連、レジャー・リゾート'],
    decliningSectors: ['バブル絶頂の好況局面のため明確に縮小した業種を独立2源以上で特定できず（捏造せず）。'],
    caveats: 'DJIA年末値2753.20と日経平均年末値38915.87（12/29大納会の史上最高値・終値）はいずれも広く一致する確証値。消費税導入は税率3%。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/fall-of-the-berlin-wall', type: 'government', label: 'Federal Reserve History — Fall of the Berlin Wall（1989/11/9）' },
      { url: 'https://ja.wikipedia.org/wiki/%E3%83%90%E3%83%96%E3%83%AB%E6%99%AF%E6%B0%97', type: 'reference', label: 'Wikipedia（日本語）— バブル景気（日経平均38,915.87円・1989/12/29）' },
      { url: 'https://www.nta.go.jp/publication/pamph/koho/02.htm', type: 'government', label: '国税庁 — 消費税の沿革（1989/4/1 税率3%で導入）' },
    ],
  },
  {
    year: 1990,
    era: '平成2年',
    world:
      '10月3日に東西ドイツが統一され、欧州の冷戦構造が解消へ向かった。8月にイラクがクウェートに侵攻して湾岸危機が発生し、原油価格が急騰した。米国は年央から景気後退（1990/7〜1991/3）に入り、DJIAは年末2,633.66とおおむね横ばいで越年した。',
    japan:
      'バブル崩壊の起点となった年。日銀は資産価格抑制のため公定歩合を引き上げ、8月には6.0%へ到達した。3月27日には大蔵省が不動産向け融資の「総量規制」を通達し、株価は年初から急落、日経平均は年末23,848円とピーク（前年末38,915円）から約4割下落した。地価下落はやや遅れて顕在化していく。',
    keyEvents: [
      '東西ドイツ統一（10/3）',
      'イラクのクウェート侵攻＝湾岸危機（8/2）、原油価格急騰',
      '日銀が公定歩合を6.0%へ引き上げ（8月）—金融引き締め強化',
      '大蔵省が不動産向け融資の総量規制を通達（3/27）',
      '株バブル崩壊—日経平均が年間で約4割下落',
    ],
    risingSectors: ['（世界）石油・エネルギー（湾岸危機による原油高、定性）'],
    decliningSectors: ['（日本）不動産・建設、銀行・証券などの金融（総量規制・株価急落）、財テク依存企業。（米国）景気後退局面で広範に減速。'],
    caveats: 'DJIA年末値2633.66と日経平均年末値23848（前年末38,915円からの大幅下落）は独立2源で一致。総量規制は1990/3/27の大蔵省通達（行政指導）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/gulf-war', type: 'government', label: 'Federal Reserve History — 1990-91景気後退・湾岸戦争' },
      { url: 'https://en.wikipedia.org/wiki/Japanese_asset_price_bubble', type: 'reference', label: 'Wikipedia — Japanese asset price bubble（1990年の株価下落・総量規制）' },
      { url: 'https://ja.wikipedia.org/wiki/%E3%83%89%E3%82%A4%E3%83%84%E5%86%8D%E7%B5%B1%E4%B8%80', type: 'reference', label: 'Wikipedia（日本語）— ドイツ再統一（1990/10/3）' },
    ],
  },
  {
    year: 1991,
    era: '平成3年',
    world:
      '1〜2月の湾岸戦争（多国籍軍「砂漠の嵐」作戦）でクウェートが解放され、原油高は短期で沈静化した。米国は1990/7〜1991/3の景気後退（S&L危機・不動産バブル崩壊が背景）から回復局面に入った。12月25日にゴルバチョフが辞任しソ連が正式に解体、CIS（独立国家共同体）が成立して冷戦が最終的に終結した。DJIAは年末3,168.83で越年した。',
    japan:
      'バブル景気（1986/12〜1991/2、51か月）が1991年2月の「景気の山」で終わり後退局面に入った。これが第1次平成不況・「失われた10年」の起点で、株価・地価の本格的な下落と資産デフレが進行した。証券業界では大手による大口顧客への損失補填問題と暴力団取引が発覚し、四大証券の社長辞任・営業自粛処分に発展、金融システムへの不安が広がった。',
    keyEvents: [
      '湾岸戦争（1〜2月「砂漠の嵐」作戦）でクウェート解放',
      'ソ連崩壊（12/25 ゴルバチョフ辞任・CIS成立）—冷戦の最終的終結',
      '米景気後退（1990/7〜1991/3）からの回復開始',
      'バブル景気の終焉（1991年2月が景気の山）—平成不況の始まり',
      '証券損失補填問題・暴力団取引発覚—四大証券の社長辞任・営業自粛処分',
    ],
    risingSectors: ['（日本）相対的に底堅いとされたディフェンシブ業種（公益・生活必需、定性）'],
    decliningSectors: ['（日本）不動産・建設（地価下落の本格化）、銀行・証券・ノンバンク（株安・損失補填・不良債権の萌芽）。（米国）金融（S&L危機）・不動産。'],
    caveats: 'DJIA年末値3168.83と日経平均年末値22983.77（≈22,984、1991/12/30大納会）は独立2源で一致。ソ連解体は段階的事象だが12/25-26を確定的解体時点とする一般的整理に依拠。損失補填の金額は出典で幅があり確定値は採用せず。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Japanese_asset_price_bubble', type: 'reference', label: 'Wikipedia — Japanese asset price bubble（日経225が1991/12/30に22,984へ）' },
      { url: 'https://nsarchive.gwu.edu/briefing-book/russia-programs/2021-12-21/end-soviet-union-1991', type: 'academic', label: 'National Security Archive（GWU）— The End of the Soviet Union 1991' },
      { url: 'https://www.upi.com/Archives/1991/09/25/Big-Four-securities-firms-punished-for-role-in-scandal/6364685771200/', type: 'media', label: 'UPI Archives（1991/9/25）— 四大証券の損失補填・暴力団取引と処分' },
    ],
  },
  {
    year: 1992,
    era: '平成4年',
    world:
      '欧州の通貨混乱が中心の年。2月にマーストリヒト条約が調印されEU・単一通貨への道筋が引かれたが、ERM（欧州為替相場メカニズム）通貨に投機が集中し、9月16日「ブラック・ウェンズデー」で英ポンドがERMを離脱（伊リラも離脱）した。米国は景気回復の遅れを背景に11月の大統領選でクリントンが現職ブッシュを破り当選した。DJIAは年末3,301.11で越年した。',
    japan:
      'バブル崩壊後の調整が深刻化した「複合不況（平成不況）」の年。株価・地価がともに続落し、日経平均は8月に一時14,000円台へ急落、公示地価（全国全用途平均）が17年ぶりに下落へ転じた。金融機関の不良債権問題が表面化しBIS自己資本比率規制も重なって「貸し渋り」が問題化、宮沢内閣は8月28日に事業規模約10.7兆円の総合経済対策を決定した。',
    keyEvents: [
      'マーストリヒト条約調印（2月）—EU・経済通貨同盟の枠組み',
      'ブラック・ウェンズデー（9/16）—英ポンドがERM離脱、欧州通貨危機',
      'クリントンが米大統領選で当選（11月）',
      '日経平均が8月に一時14,000円台へ急落、公示地価が17年ぶり下落',
      '宮沢内閣が総合経済対策（事業規模約10.7兆円）を決定（8/28）',
    ],
    risingSectors: ['（日本）総合経済対策による公共事業・建設関連の下支え（定性）'],
    decliningSectors: ['（日本）不動産・建設（資産デフレ直撃）、銀行・ノンバンク（不良債権増大）、証券（売買低迷）、内需依存の製造業・設備投資関連。'],
    caveats: 'DJIA年末値3301.11は独立3源（macrotrends/fedprimerate/statmuse）で一致。日経平均年末値16924（≈16,924.95、前年比約-26%）は独立3源で整数一致、端数は単一資料依存のため概数扱い。8月の安値は「14,000円台」で複数源一致だが最安値の正確な日付・値は概数表現に留める。不良債権額は定義・時点で大きく異なり確定値は採用せず。',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Black_Wednesday', type: 'reference', label: 'Wikipedia — Black Wednesday（1992/9/16 ポンドERM離脱）' },
      { url: 'https://www.mof.go.jp/pri/publication/policy_history/series/h1-12/1_2_5.pdf', type: 'government', label: '財務省財務総合政策研究所 — 財政金融政策史（不良債権・地価/株価下落）' },
      { url: 'https://en.wikipedia.org/wiki/Japanese_asset_price_bubble', type: 'reference', label: 'Wikipedia — Japanese asset price bubble（日経1992年末≈16,924）' },
    ],
  },
  {
    year: 1993,
    era: '平成5年',
    world:
      '米国は1990-91年景気後退後の「雇用なき回復」を脱し、1月発足のクリントン政権下で回復が定着していった。欧州では11月1日にマーストリヒト条約が発効し欧州連合（EU）が正式に成立した。インフレ鈍化と金利低下が米株高を後押しし、DJIAは年末3,754.09と当時の史上最高値圏で越年した。',
    japan:
      'バブル崩壊後の複合不況が継続。記録的な円高が進行し夏場には1ドル=100円台前半（8月平均≒103.77円）まで急騰して輸出企業を圧迫した。8月に細川護熙を首相とする非自民連立内閣が発足し、1955年以来38年続いた自民党単独政権＝55年体制が崩壊した。記録的冷夏による作況不良で米が不足し（平成の米騒動）、政府はタイ・中国・米国などから合計約259万トンを緊急輸入した。',
    keyEvents: [
      'クリントン米大統領就任（1月）、米景気回復が本格化',
      '細川連立内閣発足（8月）→ 55年体制（自民党単独政権）崩壊',
      'マーストリヒト条約発効（11/1）—欧州連合（EU）正式成立',
      '記録的冷夏による米不足「平成の米騒動」—政府が米を緊急輸入（約259万トン）',
      '円高進行—夏に一時1ドル=100円台前半に到達',
    ],
    risingSectors: ['（米国）金利低下を背景とした住宅・自動車・設備投資関連、株式市場全般（DJIA最高値圏）、情報技術・ハイテク（90年代成長サイクルの起点、定性）'],
    decliningSectors: ['（日本）円高直撃の輸出製造業（自動車・電機など）、不動産・金融（不良債権・資産デフレ継続）、米作・農業（冷夏による不作）。'],
    caveats: 'DJIA年末値3754.09（年間約+13.7%）は複数の検索源で一致。日経平均年末値は参照したデータ集約サイトが一律WebFetch 403で≥2独立源の数値一致を確認できなかったため、捏造回避としてnull（資産系列でもN/A）。円相場は8月平均≒103.77円で「100円台前半に到達」と保守的に記述。業種別ランキングは一次順位データ未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.history.com/this-day-in-history/november-1/european-union-goes-into-effect', type: 'media', label: 'HISTORY — European Union officially established（マーストリヒト発効 1993/11/1）' },
      { url: 'https://ja.wikipedia.org/wiki/1993%E5%B9%B4%E7%B1%B3%E9%A8%92%E5%8B%95', type: 'reference', label: 'Wikipedia（日本語）— 1993年米騒動（平成の米騒動・緊急輸入259万トン）' },
      { url: 'https://www.brookings.edu/articles/retrospective-on-american-economic-policy-in-the-1990s/', type: 'academic', label: 'Brookings — Retrospective on American Economic Policy in the 1990s' },
    ],
  },
  {
    year: 1994,
    era: '平成6年',
    world:
      '1月1日にNAFTA（北米自由貿易協定）が発効し北米自由貿易圏が始動した。米FRB（グリーンスパン議長）が3月から年末にかけてFF金利を3.0%から5.5%へ断続的に引き上げ、油断していた債券市場が暴落した（「1994年の債券大虐殺」）。12月にはメキシコがペソを切り下げて「テキーラ危機」が勃発し新興国市場に波及した。DJIAは年末3,834.44で越年した。',
    japan:
      'バブル崩壊後の調整が続き、1993年秋からの景気回復は力強さを欠いて「回復の遅れ」が長引いた。1994年半ばから円高が再燃し、製造業の海外移転（空洞化）懸念が強まった。政治は混乱し、羽田内閣（4〜6月、戦後最短）の後、6月30日に村山富市を首相とする自民・社会・さきがけの「自社さ」連立内閣が発足した。',
    keyEvents: [
      'NAFTA（北米自由貿易協定）発効（1/1）',
      'FRBが年内に連続利上げ（FF金利3.0%→5.5%）—「債券大虐殺」',
      '羽田内閣（戦後最短）→ 村山内閣（自社さ連立）発足（6/30）',
      '円高の再燃と製造業の空洞化懸念',
      'メキシコ・ペソ危機（テキーラ危機、12月）',
    ],
    risingSectors: ['（定性）円高メリットを受ける輸入・内需関連（業種別ランキングの確証なし）'],
    decliningSectors: ['（定性）円高直撃の輸出製造業（自動車・電機）と国内空洞化圧力、債券・金利感応資産（債券大虐殺）、メキシコ等の新興国資産。'],
    caveats: 'DJIA年末値3834.44（12/30終値・年間約+2.1%）は独立2源で一致。日経平均の1994年末終値は独立2源での一致を確認できず捏造回避のためnull。円の戦後最高値（約79円）は1994年ではなく1995年春の出来事。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreserve.gov/fomc/19940418default.htm', type: 'government', label: '米FRB — FOMC 1994年声明（同年の金融引き締め）' },
      { url: 'https://en.wikipedia.org/wiki/Mexican_peso_crisis', type: 'reference', label: 'Wikipedia — Mexican peso crisis（1994/12 テキーラ危機）' },
      { url: 'https://en.wikipedia.org/wiki/North_American_Free_Trade_Agreement', type: 'reference', label: 'Wikipedia — NAFTA（1994/1/1発効）' },
    ],
  },
  {
    year: 1995,
    era: '平成7年',
    world:
      '1月1日にWTO（世界貿易機関）が発足し、GATT体制を引き継ぐ多角的貿易体制の中核となった。米国は景気拡大が続き株式市場は大きく上昇、DJIAは年末5,117.12（年間約+33.5%）で越年した。前年末のメキシコ通貨危機の余波が新興国に残った。',
    japan:
      '1月17日に阪神・淡路大震災（M7.3、死者6,400人超）、3月20日に地下鉄サリン事件が発生し社会に衝撃を与えた。4月には為替が一時1ドル=79円75銭の戦後最高値（超円高）を記録し輸出企業を圧迫した。住専（住宅金融専門会社）の不良債権問題が深刻化し、大和銀行ニューヨーク支店の巨額損失事件も発覚して金融システム不安が高まった。',
    keyEvents: [
      'WTO（世界貿易機関）発足（1/1）',
      '阪神・淡路大震災（1/17、M7.3）',
      '地下鉄サリン事件（3/20）',
      '為替が一時1ドル=79円75銭の戦後最高値（4月、超円高）',
      '住専の不良債権問題深刻化／大和銀行NY支店巨額損失事件',
    ],
    risingSectors: ['（定性）震災復興に伴う建設・土木需要（業種別ランキングの確証なし）、米国の株式・テクノロジー関連'],
    decliningSectors: ['（定性・日本）超円高直撃の輸出製造業、不良債権を抱える銀行・住専・金融セクター。'],
    caveats: 'DJIA年末値5117.12（12/29終値、12/30-31は週末・年間約+33.5%）は独立2源で一致。日経平均の1995年末終値は独立2源での一致を確認できず捏造回避のためnull。円の戦後最高値79円75銭は1995/4の出来事。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.wto.org/english/thewto_e/whatis_e/inbrief_e/inbr_e.htm', type: 'government', label: 'WTO — 世界貿易機関の概要（1995/1/1発足）' },
      { url: 'https://ja.wikipedia.org/wiki/%E9%98%AA%E7%A5%9E%E3%83%BB%E6%B7%A1%E8%B7%AF%E5%A4%A7%E9%9C%87%E7%81%BD', type: 'reference', label: 'Wikipedia（日本語）— 阪神・淡路大震災（1995/1/17）' },
      { url: 'https://www.statmuse.com/money/ask/dow-jones-close-1995', type: 'media', label: 'StatMuse — DJIA 1995年末終値 5,117.12（12/29）' },
    ],
  },
  {
    year: 1996,
    era: '平成8年',
    world:
      '米国は景気拡大が継続し、IT・ハイテク株を中心とした強気相場が進行した。12月5日にFRB議長グリーンスパンが「irrational exuberance（根拠なき熱狂）」と発言し資産価格高騰へ警戒を示したが、相場はその後も上昇を続けた。DJIAは年間約+26%上昇して年末6,448.26で越年した。',
    japan:
      '1995年度の強力な金融・財政政策に支えられ一時的・循環的な景気回復局面となった（1〜3月期は特殊要因込みで高めの成長）。橋本龍太郎内閣のもとで住専処理に公的資金6,850億円を投入し「住専国会」が世論の反発を招いた。11月には金融システム改革「日本版金融ビッグバン」構想が表明され、3月には薬害エイズ訴訟が和解した。',
    keyEvents: [
      '第1次橋本龍太郎内閣の経済運営／一時的な景気回復',
      '薬害エイズ訴訟の和解成立（3月）',
      '住専処理に公的資金6,850億円を投入（「住専国会」）',
      '日本版金融ビッグバン構想を表明（11月）',
      'グリーンスパン「根拠なき熱狂」発言（12/5）',
    ],
    risingSectors: ['（米国）IT・PC・ソフトウェア・インターネット関連（株式ブームの牽引）、（日本）円安で採算改善した輸出製造業・大企業（定性）'],
    decliningSectors: ['（日本）不良債権を抱えた金融セクター（住専問題）、不動産（地価下落・資産デフレ継続）。'],
    caveats: 'DJIA年末値6448.26（年間+26.01%）と日経平均年末値19361.35（大納会、年内高値は6月の約22,666円）は独立2源以上で一致。1〜3月期の高成長は特殊要因込みで通年成長率（政府推計で概ね+2〜3%台）とは区別が必要。住専6,850億円は会計検査院・国会記録で確認。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.boj.or.jp/research/past_release/haku96.htm', type: 'government', label: '日本銀行 — 1996年度の金融および経済の動向' },
      { url: 'https://report.jbaudit.go.jp/org/h08/1996-h08-0473-0.htm', type: 'government', label: '会計検査院 — 平成8年度決算検査報告（住専6,850億円）' },
      { url: 'https://en.wikipedia.org/wiki/Irrational_exuberance', type: 'reference', label: 'Wikipedia — Irrational exuberance（グリーンスパン1996/12/5講演）' },
    ],
  },
  {
    year: 1997,
    era: '平成9年',
    world:
      '世界経済の分水嶺となった年。米国は好況下で株高が続いた（DJIA年間+22.6%）一方、7月2日のタイバーツ変動相場制移行を起点にアジア通貨危機が発生しタイ・インドネシア・韓国へ波及した（IMF支援要請へ）。7月1日に香港が英国から中国へ返還され、10月27日にはアジア発の動揺で米株が急落した。',
    japan:
      '4月1日に消費税が3%から5%へ引き上げられ、特別減税の打ち切りと相まって個人消費が腰折れし景気後退局面に入った。年後半は金融システム危機が表面化し、11月に三洋証券破綻（11/3）・北海道拓殖銀行破綻（11/17）・山一證券自主廃業（11/24）と大手金融機関が連鎖破綻した。日経平均は年末15,258円と前年末比約-21%の大幅下落となった。',
    keyEvents: [
      '消費税率を3%→5%へ引き上げ（4/1）—消費・景気を圧迫',
      '香港返還（7/1）',
      'タイバーツ変動相場制移行（7/2）—アジア通貨危機の起点',
      '金融危機—三洋証券(11/3)・北海道拓殖銀行(11/17)・山一證券自主廃業(11/24)',
      'NY株式市場ミニ・クラッシュ（10/27、アジア危機の波及）',
    ],
    risingSectors: ['（米国）大型ハイテク・IT関連、金融・消費関連（好況と株高の恩恵、定性）'],
    decliningSectors: ['（日本）銀行・証券など金融セクター（連鎖破綻）、小売・個人消費関連（増税後の反動）。（アジア新興国）通貨・金融・不動産（通貨危機）。'],
    caveats: 'DJIA年末値7908.24（年間+22.6%）は独立2源で一致。日経平均年末値は整数部15,258で複数源一致（端数15,258.74は単一源依存のため概数扱い、前年比約-21%）。アジア通貨危機の起点はタイバーツのフロート移行=1997/7/2。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/asian-financial-crisis', type: 'government', label: 'Federal Reserve History — Asian Financial Crisis（1997）' },
      { url: 'https://money.cnn.com/1997/12/31/markets/yearend/', type: 'media', label: 'CNN Money — 1997 market in review（DJIA年末7,908.24・+22.6%）' },
      { url: 'https://www.frbsf.org/research-and-insights/publications/economic-letter/2011/02/asian-financial-crisis-1997-1998/', type: 'government', label: 'San Francisco Fed — The Asian Financial Crisis of 1997-98' },
    ],
  },
  {
    year: 1998,
    era: '平成10年',
    world:
      '1997年アジア通貨危機の余波が世界に波及した年。8月にロシアがルーブル切り下げと国内債デフォルト・対外債務モラトリアムを宣言し、これが大手ヘッジファンドLTCMの巨額損失を招いて9月23日にNY連銀監督下で14金融機関による救済再編（約36.5億ドル）が実施された。新興国からの資本逃避と信用収縮が世界的に連鎖したが、米株は年間では+約16%上昇した。',
    japan:
      '消費税引き上げ・アジア通貨危機・金融機関連鎖破綻を引きずり、本格的なデフレと景気後退（マイナス成長）に陥った。金融再生法などが成立し、10月23日に日本長期信用銀行、12月14日に日本債券信用銀行がそれぞれ同法に基づく特別公的管理（一時国有化）となった（戦後初の銀行国有化）。',
    keyEvents: [
      'ロシア財政危機—ルーブル切り下げ・デフォルト・対外債務モラトリアム（8月）',
      'LTCM救済—NY連銀監督下で14金融機関が約36.5億ドルを資本注入（9/23）',
      '日本長期信用銀行を特別公的管理＝一時国有化（10/23）—戦後初の銀行国有化',
      '日本債券信用銀行を特別公的管理＝一時国有化（12/14）',
      '日本が本格的デフレ・マイナス成長に',
    ],
    risingSectors: ['（米国）情報技術・インターネット関連、危機時の「質への逃避」で米国債等の安全資産（定性）'],
    decliningSectors: ['（日本）銀行・金融（不良債権・連鎖破綻）。（新興国）ロシア関連資産・新興国市場全般（デフォルト・資本逃避）。'],
    caveats: 'DJIA年末値9181.43は独立2源（CBS News/CNN Money）で一致。日経平均の1998年末終値は独立2源での一致を確認できず捏造回避のためnull。長銀1998/10/23・日債銀1998/12/14の一時国有化は日銀・首相官邸の一次資料で確認。ロシアの債務規模・LTCM救済額は出典で表現が異なり概数扱い。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.boj.or.jp/en/about/press/danwa/dan9810a.htm', type: 'government', label: '日本銀行 — 日本長期信用銀行の特別公的管理に関する総裁談話（1998/10）' },
      { url: 'https://japan.kantei.go.jp/souri/981214nisaiken.html', type: 'government', label: '首相官邸 — 日本債券信用銀行の一時国有化に関する声明（1998/12/14）' },
      { url: 'https://en.wikipedia.org/wiki/1998_Russian_financial_crisis', type: 'reference', label: 'Wikipedia — 1998 Russian financial crisis' },
    ],
  },
  {
    year: 1999,
    era: '平成11年',
    world:
      '1月1日に欧州単一通貨ユーロが11か国で導入された。米国ではIT・ドットコム株を中心とした株高が加速し、3月29日にDJIAが史上初めて1万ドルの大台を突破、年末は11,497.12（年間約+25%）で越年した。アジア通貨危機からの回復が進んだ。',
    japan:
      'デフレが定着し（GDPデフレーターが−1.2%）、景気は財政刺激に依存した弱い回復にとどまった。日銀は2月12日にゼロ金利政策を導入し「デフレ懸念が払拭されるまで」継続するとコミットした。金融再編が加速し、8月20日に第一勧銀・富士・興銀が経営統合（みずほ）を、10月14日に住友・さくらが統合（後の三井住友）を表明、2月22日にはNTTドコモがiモードを開始してモバイルネットが普及し始めた。',
    keyEvents: [
      'ユーロ導入（1/1、11か国）',
      '日銀がゼロ金利政策を導入（2/12）',
      'NTTドコモがiモードを開始（2/22）',
      'DJIAが史上初の1万ドル突破（3/29）',
      '金融再編—みずほ統合表明(8/20)・住友/さくら→三井住友統合表明(10/14)',
    ],
    risingSectors: ['（米国・日本）IT・インターネット・携帯（iモード）関連（ドットコム/ITブーム）、米株式全般（定性）'],
    decliningSectors: ['（日本）デフレ下で価格下落が続く広範な業種、再編・不良債権処理下の銀行（定性）。'],
    caveats: 'DJIA年末値11497.12（年間約+25%）とDJIAの1万ドル初突破（3/29）は独立2源で一致。日経平均の1999年末終値は集約サイトが一律WebFetch 403で独立2源確認できず捏造回避のためnull（通称18,934.34だが未確証）。ゼロ金利導入2/12・iモード2/22・みずほ8/20・三井住友10/14は一次/複数源で確認。1999暦年の実質成長率は出典間で不一致のため定性傾向に留める。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.boj.or.jp/en/announcements/release_1999/k990212c.htm/', type: 'government', label: '日本銀行 — 1999/2/12 金融政策決定会合の決定（ゼロ金利政策導入）' },
      { url: 'https://en.wikipedia.org/wiki/Euro', type: 'reference', label: 'Wikipedia — Euro（1999/1/1導入）' },
      { url: 'https://www.federalreservehistory.org/essays/great-inflation', type: 'government', label: 'Federal Reserve History — 1990年代の米経済・株高の背景' },
    ],
  },
  {
    year: 2000,
    era: '平成12年',
    world:
      'ITバブル（ドットコム相場）が3月10日にNASDAQ総合指数のピーク（終値5,048.62、取引時間中高値5,132.52）を付けた後、3月後半から崩壊が始まりハイテク株の長期下落局面に入った。実体経済は1990年代から続く米景気拡大の最終局面にあり、年末にかけ主要株価指数は軟調に推移した。DJIAは年末10,786.85で越年した。',
    japan:
      '「IT革命」が流行語となるITブームの一方、3月の国内相場形成後にバブルが崩壊し、持ち合い株の解消売りも重なって株式相場は年間を通じ大きく下落した（日経平均は約-27%）。4月1日に介護保険制度が施行され、8月11日に日銀が政府の延期要請を退けてゼロ金利政策を解除した。大手百貨店そごうの経営破綻（7/12 民事再生法申請）、有珠山・三宅島の噴火も相次いだ。',
    keyEvents: [
      'NASDAQ総合指数が3/10にピーク（終値5,048.62）→ ドットコムバブル崩壊が開始',
      '介護保険制度が施行（4/1）',
      '大手百貨店そごうが民事再生法を申請し破綻（7/12）',
      '日銀がゼロ金利政策を解除（8/11）',
      '有珠山噴火（3/31）・三宅島噴火（全島避難へ）',
    ],
    risingSectors: ['（前半）情報通信・IT/インターネット関連、携帯データ（iモード等）の通信（ITブームで物色集中、ただし後半は急落）'],
    decliningSectors: ['ハイテク・ドットコム/新興ハイテク株（3月以降急落）、日本の持ち合い銘柄（解消売り）、流通・百貨店など過剰債務業種（そごう破綻）。'],
    caveats: 'DJIA年末値10786.85（12/29終値）は独立2源で一致。日経平均年末値は複数源が概ね13,785円（前年比約-27%）で整数一致だが小数点以下（通称13,785.69）は独立2源で確証できず整数値を採用。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Dot-com_bubble', type: 'reference', label: 'Wikipedia — Dot-com bubble（NASDAQ 3/10ピーク・崩壊）' },
      { url: 'https://www.boj.or.jp/mopo/mpmsche_minu/minu_2000/g000811.htm', type: 'government', label: '日本銀行 — 2000/8/11 金融政策決定会合議事要旨（ゼロ金利解除）' },
      { url: 'https://money.cnn.com/2000/12/29/markets/markets_newyork/', type: 'media', label: "CNN Money 2000/12/29 — Wall St.'s year to forget（DJIA年末終値）" },
    ],
  },
  {
    year: 2001,
    era: '平成13年',
    world:
      'ITバブル（ドットコム）崩壊が本格化し米景気が後退入りした（NBERは3〜11月を景気後退と認定、9/11以前に既にリセッション入り）。9月11日の米同時多発テロが不確実性を一段と増幅し、FRBは年内に計11回利下げしFF金利を6.5%から1.75%へ引き下げた。打撃はテクノロジー・通信・航空に集中した。DJIAは年末10,021.57で越年した。',
    japan:
      'デフレ継続下で景気が低迷。日銀は3月19日に量的緩和政策を世界に先駆けて導入し、操作目標を無担保コールレートから日銀当座預金残高へ変更、コアCPIが安定的に0%以上となるまでの継続をコミットした。4月26日に小泉純一郎内閣が発足し構造改革・不良債権処理を掲げた。9月には国内初のBSE（牛海綿状脳症）が千葉県で確認された。日経平均は年間で約-23%。',
    keyEvents: [
      '日銀が量的緩和政策を初導入（3/19、当座預金残高を操作目標化）',
      '小泉純一郎内閣発足（4/26）—構造改革・不良債権処理',
      '米同時多発テロ（9/11）',
      '国内初のBSE（狂牛病）を千葉県で確認（9月）',
      '米景気後退（NBER認定3〜11月）、FRBが年内11回利下げ（6.5%→1.75%）',
    ],
    risingSectors: ['（定性）景気後退局面で相対的に底堅いディフェンシブ・生活必需・公益、不確実性を背景とした金など安全資産'],
    decliningSectors: ['情報技術（IT）・インターネット（ドットコム崩壊の中心）、通信（設備過剰・株価急落）、航空・旅行（9/11後の需要急減）、日本の畜産・牛肉・外食（BSE）。'],
    caveats: 'DJIA年末値10021.57（12/31）と日経平均年末値10542.62（12/28大納会）は独立2源で一致。DJIAの年間騰落率は価格指数/配当込みで出典差あり。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2001/g010319.htm', type: 'government', label: '日本銀行 — 2001/3/19 金融政策決定会合議事要旨（量的緩和導入）' },
      { url: 'https://en.wikipedia.org/wiki/Early_2000s_recession', type: 'reference', label: 'Wikipedia — Early 2000s recession（NBER認定・FRB利下げ）' },
      { url: 'https://ja.wikipedia.org/wiki/%E7%89%9B%E6%B5%B7%E7%B6%BF%E7%8A%B6%E8%84%B3%E7%97%87', type: 'reference', label: 'Wikipedia（日本語）— 牛海綿状脳症（BSE国内初確認 2001年・千葉県）' },
    ],
  },
  {
    year: 2002,
    era: '平成14年',
    world:
      '米国は前年末からの企業会計不正の連鎖（エンロン破綻→7/21にWorldComが当時史上最大のChapter11申請、アーサー・アンダーセン解体）で企業統治不信が広がり株式は3年連続の下落となった（DJIA年間約-16.8%）。1月1日にユーロの紙幣・硬貨が12か国で流通開始し2月末に各国通貨が法定通貨の地位を喪失、7月にはSarbanes-Oxley法が成立した。',
    japan:
      '景気は2002年2月を谷として回復局面に入り、これが2008年2月まで続く戦後最長級（73か月）の景気拡大「いざなみ景気」の起点となった（内閣府が後に確定）。回復は海外経済を背景とした輸出・生産主導の外需依存型で、消費者物価・GDPデフレータはマイナスでデフレが継続した。4月にペイオフが一部解禁され、9月に小泉首相が訪朝した。',
    keyEvents: [
      'ユーロ紙幣・硬貨が12か国で流通開始（1/1）',
      '日本の景気が谷を打ち回復へ（2月）—戦後最長級「いざなみ景気」の起点',
      'ペイオフ一部解禁（4月、定期性預金は元本1,000万円＋利息まで保護）',
      '米WorldComが当時史上最大のChapter11申請（7/21、会計不正）',
      '小泉首相訪朝・日朝首脳会談（9/17）',
    ],
    risingSectors: ['（定性）輸出関連製造業（電機・自動車・一般機械、外需牽引で生産持ち直し）、株式からの逃避先となった金・債券'],
    decliningSectors: ['（定性）IT・通信・メディア（ドットコム崩壊の余波・WorldCom等の信用不安）、日本の銀行（不良債権）・内需小売（デフレで名目縮小）。'],
    caveats: 'DJIA年末値8341.63は独立3源（StatMuse/macrotrends/Wikipedia）で一致。日経平均年末値は通説8,578.95円だが独立2源の数値一致を確認できず捏造回避のためnull。いざなみ景気の2002/2起点・73か月は内閣府の事後確定。ペイオフは2002/4が一部解禁（全面解禁は2005/4）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www5.cao.go.jp/j-j/wp/wp-je02/wp-je02-00101.html', type: 'government', label: '内閣府 経済財政白書 — 景気底入れの背景（2002年・外需主導回復・デフレ）' },
      { url: 'https://www.ecb.europa.eu/euro/changeover/2002/html/index.en.html', type: 'government', label: '欧州中央銀行（ECB）— 2002年ユーロ現金流通開始（1/1）' },
      { url: 'https://en.wikipedia.org/wiki/Closing_milestones_of_the_Dow_Jones_Industrial_Average', type: 'reference', label: 'Wikipedia — Closing milestones of the DJIA（2002年終値）' },
    ],
  },
  {
    year: 2003,
    era: '平成15年',
    world:
      '地政学ショックと景気回復が同居した年。3月20日に米英主導の有志連合がイラク侵攻を開始（イラク戦争開戦）。同時期に新型肺炎SARSがアジア中心に流行し旅行・観光・対面サービスに打撃を与えた。後半は米国の減税（JGTRRA）と超低金利（FF金利1%、約半世紀ぶり低水準）を背景に景気が急回復し、第3四半期の実質GDPは年率約7.2%と高成長となった。DJIAは年末10,453.92で越年した。',
    japan:
      '「失われた10年」後半の転換点。年初は金融システム不安が深刻で、日経平均は4月28日にバブル後最安値（終値ベース約7,607円）を記録した。5月17日にりそなグループへ預金保険法102条に基づき約2兆円の公的資金を注入し実質国有化、11月29日には足利銀行を同条に基づき一時国有化した。一方で実体経済は輸出（対中国・対アジアの中国特需）とIT関連・設備投資に支えられ、株価は後半に大きく戻して暦年ベースで4年ぶりの上昇となった。',
    keyEvents: [
      'イラク戦争開戦（3/20）',
      'SARS（重症急性呼吸器症候群）流行—アジアの旅行・サービス業に打撃',
      'りそなグループへ約2兆円の公的資金注入＝実質国有化（5/17、預金保険法102条の初適用）',
      '米でJGTRRA減税成立＋FF金利1%、第3四半期GDP年率約7.2%の急回復',
      '足利銀行を一時国有化（11/29）',
    ],
    risingSectors: ['（定性）輸出関連製造業（自動車・電機・機械、対中国・対アジア需要）、半導体・電子部品・IT関連（前年のIT不況からの回復）、鉄鋼・素材（中国向け需要）'],
    decliningSectors: ['（定性）銀行・金融（りそな・足利の国有化に象徴される不良債権問題）、旅行・航空・観光（イラク戦争＋SARS）、内需小売・サービス（デフレ圧力継続）。'],
    caveats: 'DJIA年末値10453.92（年間約+25%）は独立2源で一致。日経平均年末値は通説10,676.64円・暦年4年ぶり上昇（前年比約+24%）で定性的に一致するが厳密値を独立2源で確認できず捏造回避のためnull。4/28最安値はザラ場7,603円台/終値約7,607円台が混在。米Q3成長率は速報8.2%/確報7.2%で版差。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.britannica.com/event/Iraq-War', type: 'reference', label: 'Britannica — Iraq War（2003/3/20開戦）' },
      { url: 'https://www.mof.go.jp/public_relations/finance/202304/202304i.html', type: 'government', label: '財務省 — 公的資金注入・一時国有化スキーム（預金保険法102条）' },
      { url: 'https://www.nikkei.com/article/DGKKZO71874280U1A510C2EAC000/', type: 'media', label: '日本経済新聞 — 2003/5/17 りそな実質国有化・公的資金2兆円注入' },
    ],
  },
  {
    year: 2004,
    era: '平成16年',
    world:
      '世界経済は堅調な拡大局面。米FRBは6月30日にFF金利を1.00%→1.25%へ約4年ぶりに引き上げ「慎重なペース」での金融引き締めに転換した。中国は高成長を持続（実質GDP+9.5%、国家統計局）。原油は需給逼迫と中国需要で高騰し10月にWTIが約55ドルの当時最高値を更新した。12月26日にスマトラ島沖地震（Mw≈9.1）とインド洋大津波が14か国で約23万人の死者をもたらした。DJIAは年末10,783.01で越年した。',
    japan:
      '景気回復が継続（後に「いざなみ景気」と呼ばれる戦後最長拡大の一部）。輸出と設備投資が牽引し、デジタル家電（薄型テレビ・DVDレコーダー・デジカメ）が国内外で好調だった。日経平均は大納会で11,488.76円と前年末比で上昇した。政策面では年金改革関連法（マクロ経済スライド導入）が成立し、陸上自衛隊のイラク（サマワ）人道復興支援派遣が本格展開した。10月23日に新潟県中越地震（M6.8、最大震度7）が発生した。',
    keyEvents: [
      'FRBが約4年ぶりに利上げ（6/30、FF金利1.00→1.25%）—引き締めへ転換',
      '原油高騰—10月にWTI原油が当時最高値の約55ドルを更新',
      '新潟県中越地震（10/23、M6.8、最大震度7、上越新幹線脱線）',
      'スマトラ島沖地震（Mw≈9.1）・インド洋大津波（12/26、約23万人死亡）',
      '中国の高成長持続（実質GDP+9.5%）／自衛隊イラク派遣・年金改革',
    ],
    risingSectors: ['（定性）デジタル家電・薄型テレビ・デジカメ、半導体・電子部品（デジタル家電需要）、中国向け輸出関連（鉄鋼・建設機械・素材）、エネルギー・資源'],
    decliningSectors: ['（定性）原油高でコスト圧迫を受けた運輸・素材川下・電力など。'],
    caveats: 'DJIA年末値10783.01（12/31）と日経平均年末値11488.76（大納会）は独立2源で一致。中国GDPは国家統計局公表の+9.5%。原油「約55ドル」は2004/10の当時最高値で年間変動大。津波死者は約227,900〜230,000+人と出典差。いざなみ景気は事後呼称。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreserve.gov/boarddocs/press/monetary/2004/20040630/default.htm', type: 'government', label: '米FRB — FOMC声明 2004/6/30（FF金利1.25%へ利上げ）' },
      { url: 'https://www.britannica.com/event/Indian-Ocean-tsunami-of-2004', type: 'reference', label: 'Britannica — 2004年インド洋大津波（12/26）' },
      { url: 'https://www.stats.gov.cn/english/NewsEvents/200502/t20050228_25600.html', type: 'government', label: '中国国家統計局 — 2004年国民経済統計公報（実質GDP+9.5%）' },
    ],
  },
  {
    year: 2005,
    era: '平成17年',
    world:
      '世界経済は原油高騰の重圧下でも底堅く拡大した。米FRBは利上げを継続し（9月で11回連続、年末FF金利4.25%）、住宅・不動産ブームが消費を下支えした。8月末のハリケーン・カトリーナがメキシコ湾岸の石油精製を直撃し原油は一時70ドル超へ。7月21日に中国が人民元を対ドル2.1%切り上げ（8.28→8.11）し10年超の固定相場を撤廃、管理フロートへ移行した。DJIAは年末10,717.50で越年した。',
    japan:
      '「いざなみ景気」下で景気回復が鮮明化した。小泉首相は郵政民営化法案の参院否決を受け衆院を解散（郵政解散）、9月11日の総選挙で自民党が296議席を獲得し与党圧勝、民営化法が成立した。企業業績改善と外国人買いで株価が急騰し、日経平均は年末に16,111.43円（前年末比約+40%）へ回復した。ライブドアなど新興市場ブームが過熱し、3〜9月に愛知万博（愛・地球博）を開催した。',
    keyEvents: [
      'ハリケーン・カトリーナが米湾岸を直撃（8/29）—石油精製打撃・原油高騰',
      '中国が人民元を2.1%切り上げ、ドルペッグ撤廃し管理フロートへ移行（7/21）',
      '米FRBが利上げ継続（9月で11回連続、年末FF金利4.25%）',
      '郵政解散総選挙で小泉自民党が296議席の圧勝、郵政民営化法成立（9/11）',
      '愛知万博（愛・地球博）開催（3/25〜9/25）／日経平均が年末16,000円台へ回復',
    ],
    risingSectors: ['（定性）エネルギー・石油（原油高で資源・石油メジャー好業績）、米不動産・住宅関連（住宅ブーム・低金利）、日本の輸出製造業・商社・銀行（景気回復・株高）、新興市場/IT・ネット関連'],
    decliningSectors: ['（定性）航空（燃料高でDelta・Northwestが9月にChapter11申請）、米自動車（GM・FordがSUV不振・高コストで業績悪化）。'],
    caveats: 'DJIA年末値10717.50（12/30）と日経平均年末値16111.43（大納会、前年比約+40%）は独立2源で一致。米GDP成長率は出典により3%強〜約3.5%。いざなみ景気は事後呼称。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.frbsf.org/research-and-insights/publications/economic-letter/2005/09/a-look-at-china-new-exchange-rate-regime/', type: 'government', label: "San Francisco Fed — China's New Exchange Rate Regime（人民元7/21切り上げ）" },
      { url: 'https://ja.wikipedia.org/wiki/%E7%AC%AC44%E5%9B%9E%E8%A1%86%E8%AD%B0%E9%99%A2%E8%AD%B0%E5%93%A1%E7%B7%8F%E9%81%B8%E6%8C%99', type: 'reference', label: 'Wikipedia（日本語）— 第44回衆議院議員総選挙（9/11郵政解散・自民圧勝）' },
      { url: 'https://www.nbcnews.com/news/amp/wbna10690700', type: 'media', label: 'NBC News — 2005年最終取引日の株式（DJIA 10,717.50）' },
    ],
  },
  {
    year: 2006,
    era: '平成18年',
    world:
      '世界株高の年。米FRBは6月29日のFOMCでFF金利を5.25%へ引き上げ（17回連続）、これが引き締めサイクルの打ち止めとなった。原油・エネルギー高が続く一方、米住宅バブルは年初にピークを打ち年後半に住宅市場が冷え込み始めた（後のサブプライム危機の前夜）。DJIAは年末12,463.15で越年した。',
    japan:
      'いざなみ景気が継続し、デフレ脱却の兆しを背景に金融政策が転換した。日銀は3月に量的緩和政策を解除し、7月14日には無担保コール翌日物を約0.25%へ誘導してゼロ金利政策を解除した。一方、1月のライブドア・ショックや村上ファンド事件で市場と企業統治への不信が高まり、9月26日に第1次安倍内閣が発足した。',
    keyEvents: [
      'ライブドア・ショック（1/16-17、IT関連株急落・東証が全銘柄取引停止）',
      '日銀が量的緩和政策を解除（3月）',
      'FRBがFF金利を5.25%へ利上げ（6/29、17回連続で打ち止め）',
      '日銀がゼロ金利政策を解除（7/14、政策金利を約0.25%へ）',
      '第1次安倍晋三内閣が発足（9/26）',
    ],
    risingSectors: ['（定性）資源・エネルギー（原油・素材高で商社・鉱業）、海運・鉄鋼など景気敏感業種、輸出関連製造業（円安基調）'],
    decliningSectors: ['（定性）新興・IT/ネット関連（ライブドア・ショックでマザーズ等が調整）、米住宅・住宅建設関連（ピークアウト）。'],
    caveats: 'DJIA年末値12463.15（12/29終値）は独立3源で一致。日経平均年末値17225.83（年間約+6.9%）は複数の金融データ源で一致。日銀の量的緩和解除3月・ゼロ金利解除7/14は日銀公式で確認。いざなみ景気は事後呼称。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20060629a.htm', type: 'government', label: '米FRB — FOMC声明 2006/6/29（FF金利5.25%へ・打ち止め）' },
      { url: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2006/g060309.htm', type: 'government', label: '日本銀行 — 2006/3 金融政策決定会合議事要旨（量的緩和解除）' },
      { url: 'https://en.wikipedia.org/wiki/First_premiership_of_Shinzo_Abe', type: 'reference', label: 'Wikipedia — First premiership of Shinzo Abe（第1次安倍内閣 2006/9/26）' },
    ],
  },
  {
    year: 2007,
    era: '平成19年',
    world:
      'サブプライム住宅ローン危機が表面化した転換の年。8月9日にBNPパリバが傘下3ファンドの解約を凍結（パリバショック）し信用収縮が世界の短期金融市場へ波及した。FRBは9月・10月に4年超ぶりの利下げに転換した。一方で米株は好調を維持し、DJIAは10月9日に史上最高値（終値14,164.53）を更新した。DJIAは年末13,264.82で越年した。',
    japan:
      '「いざなみ景気」の最終局面で、輸出と企業収益主導の緩やかな拡大が続いたが実感に乏しい回復だった。7月29日の参院選で自民党が歴史的大敗し民主党が参院第1党となり「ねじれ国会」に突入、安倍首相は9月に退陣し福田康夫内閣が発足した。10月1日には日本郵政公社が解散し日本郵政グループが発足、郵政民営化がスタートした。米サブプライム問題の波及で株式は軟調、日経平均は年間で約-11%。',
    keyEvents: [
      '参院選で自民党が歴史的大敗、民主党が参院第1党に（7/29）→ ねじれ国会（→安倍退陣・福田内閣）',
      'BNPパリバ・ショック（8/9）—サブプライム危機が世界の金融市場へ表面化',
      'FRBが4年超ぶりに利下げに転換（9月-50bp→4.75%、10/31-25bp→4.50%）',
      '郵政民営化スタート、日本郵政グループ発足（10/1）',
      'DJIAが史上最高値を更新（10/9、終値14,164.53）／原油が年後半に90〜99ドルへ急騰',
    ],
    risingSectors: ['（定性）資源・エネルギー（原油・商品市況高騰）、新興国向け輸出関連・海運（年前半まで）、米国の大型優良株'],
    decliningSectors: ['（定性）金融・住宅金融（サブプライム関連でモーゲージ・投資銀行が悪化）、米住宅・不動産、日本の新興市場・内需関連。'],
    caveats: 'DJIA年末値13264.82（年間+6.43%）と日経平均年末値15307.78（12/28大納会、前年比約-11%）は独立2源で一致。DJIA史上最高値は10/9終値14,164.53。原油の100ドル超え終値は2008/2であり2007年内は99ドル台が上限。いざなみ景気は事後呼称。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.cfr.org/timelines/us-financial-crisis', type: 'government', label: 'CFR — The U.S. Financial Crisis（パリバショック/FRB利下げのタイムライン）' },
      { url: 'https://www.newyorkfed.org/medialibrary/media/research/global_economy/Crisis_Timeline.pdf', type: 'government', label: 'New York Fed — Crisis Timeline（2007年危機の日付別整理）' },
      { url: 'https://www.nippon.com/ja/japan-topics/today07291/', type: 'media', label: 'nippon.com — 2007/7/29 自民、参院選で歴史的敗北' },
    ],
  },
  {
    year: 2008,
    era: '平成20年',
    world:
      'サブプライム問題に端を発した世界金融危機（リーマン・ショック）が世界経済を直撃した。9月15日にリーマン・ブラザーズが破綻（米史上最大）、翌16日に米政府がAIGへ最大850億ドルの緊急融資で救済した。世界同時株安が連鎖しDJIAは年間-33.8%で1931年以来最悪の年となった。原油は7月11日にWTI約147ドルの史上最高値を付けた後、年末には40ドル割れまで暴落した。DJIAは年末8,776.39で越年した。',
    japan:
      '戦後最長の「いざなみ景気」（2002年2月〜）が2008年2月を山に終了し景気後退に転入した。輸出急減・急激な円高・株安が重なり、日経平均は年間-42.1%と1949年の算出開始以来最悪の下落率を記録、10月27日には終値7,162.90円とバブル後安値を付けた。政治面では9月24日に麻生太郎内閣が発足した。',
    keyEvents: [
      'リーマン・ブラザーズ破綻（9/15、米史上最大の倒産）→ 世界金融危機の本格化',
      '米FRBがAIGを最大850億ドルで救済（9/16）',
      '原油が史上最高値（7/11、WTI約147ドル）→ 年末に40ドル割れへ暴落',
      'いざなみ景気が2008年2月を山に終了し景気後退入り、急激な円高と輸出急減',
      '麻生太郎内閣発足（9/24）／日経平均が10/27に7,162円までバブル後安値',
    ],
    risingSectors: ['（定性）金・国債など逃避資産、上期（〜7月）の資源・エネルギー（原油147ドルまでの高騰、ただし下期に急反落）'],
    decliningSectors: ['（定性）金融（銀行・証券・保険、危機の震源）、自動車・電機など輸出製造業（円高・海外需要急減）、不動産・建設、下期のエネルギー・素材（原油急落）。'],
    caveats: 'DJIA年末値8776.39と日経平均年末値8859.56（12/30大納会、年間-42.1%＝算出開始以来最悪）は独立2源で一致。原油最高値は出典により147.02ドル等と僅差。DJIAの「1931年以来最悪」は複数報道で一致。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://money.cnn.com/2008/12/31/markets/markets_newyork/index.htm', type: 'media', label: 'CNNMoney 2008/12/31 — DJIA年末終値8,776.39' },
      { url: 'https://www.federalreservehistory.org/essays/support-for-specific-institutions', type: 'government', label: 'Federal Reserve History — AIGへ最大850億ドル融資（9/16）' },
      { url: 'https://www.france24.com/en/20081230-tokyos-nikkei-lost-42-2008-', type: 'media', label: "France24 — Tokyo's Nikkei lost 42% in 2008（8,859.56）" },
    ],
  },
  {
    year: 2009,
    era: '平成21年',
    world:
      '2007年末に始まった「大不況（Great Recession）」が底を打った年。米株は3月9日にリーマン後の最安値（DJIA 6,547.05）を付け、以降9か月の反発相場へ転じた。6月1日にGMがChapter11破綻（米産業史上最大級）、4月のG20ロンドン・サミットで各国が協調刺激策を表明した。年末11月25日のドバイ・ショックで市場が一時動揺した。DJIAは年末10,428.05で越年した。',
    japan:
      '戦後最悪級のマイナス成長となり輸出・製造業が急減した。8月30日の衆院選で民主党が圧勝し政権交代、9月16日に鳩山由紀夫内閣が発足した（自民からの交代は1993年以来16年ぶり）。景気対策としてエコポイント制度・エコカー減税が消費を一部下支えし、11月に政府が事実上のデフレ宣言（月例経済報告でデフレ認定）を行った。',
    keyEvents: [
      '米株がリーマン後最安値（3/9、DJIA 6,547.05）を付け反発開始',
      'G20ロンドン・サミットで協調的な大型刺激策に合意（4/2）',
      'ゼネラルモーターズ（GM）がChapter11破産申請（6/1）',
      '衆院選で民主党圧勝→政権交代、鳩山内閣発足（8/30→9/16）',
      'ドバイ・ショック（11/25）／同月 日本政府がデフレ宣言',
    ],
    risingSectors: ['（定性）金など貴金属・資源/素材（安全資産需要と回復期待）、テクノロジー株（年後半の反発を牽引）、日本の省エネ家電・低燃費車（エコポイント/エコカー減税）'],
    decliningSectors: ['（定性）金融・銀行（信用収縮・米地銀破綻多発）、自動車（GM破綻・需要急減）、製造業/輸出産業（世界需要急減で生産・雇用が大幅減）。'],
    caveats: 'DJIA年末値10428.05（年間約+18.8%）は独立2源で一致。日経平均年末値は通称10,546.44円で規模（2008末8,859.56から約+19%）は独立源で裏付くが、正確値を明示する独立2源を確認できず捏造回避のためnull。GDP成長率は暦年/年度・速報/確報で分散するため定性表現。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreservehistory.org/essays/great-recession-and-its-aftermath', type: 'government', label: 'Federal Reserve History — The Great Recession and Its Aftermath' },
      { url: 'https://www.britannica.com/money/great-recession', type: 'reference', label: 'Britannica Money — Great Recession' },
      { url: 'https://ja.wikipedia.org/wiki/%E9%B3%A9%E5%B1%B1%E7%94%B1%E7%B4%80%E5%A4%AB%E5%86%85%E9%96%A3', type: 'reference', label: 'Wikipedia（日本語）— 鳩山由紀夫内閣（政権交代・経済対策）' },
    ],
  },
  {
    year: 2010,
    era: '平成22年',
    world:
      '欧州ソブリン債務危機が本格化した年。ギリシャの財政赤字を契機に5月にEU・IMFが1,100億ユーロの第1次支援で合意し、欧州金融安定ファシリティ（EFSF）等が創設された。米国では5月6日に「フラッシュクラッシュ」が発生しDJIAが数分で約1,000ポイント急落後ほぼ回復した。中国の名目GDPが日本を抜き世界2位に浮上した。DJIAは年末11,577.51で越年した。',
    japan:
      '超円高が進行し（年内に一時1ドル80円台前半まで）デフレが継続した。日銀は10月5日に「包括的金融緩和」（実質ゼロ金利＋資産買入等の基金創設）を導入した。政治は菅直人内閣で、9月の尖閣諸島中国漁船衝突事件で日中関係が緊張した。1月にはJAL（日本航空）が会社更生法を申請した（戦後最大級）。日経平均は2年ぶりに年間下落した。',
    keyEvents: [
      '欧州ソブリン債務危機本格化—ギリシャ支援（EU・IMF 1,100億ユーロ）とEFSF創設（5月）',
      '米フラッシュクラッシュ（5/6）—DJIAが数分で約1,000pt急落後に大半回復',
      '中国の名目GDPが日本を抜き世界第2位に',
      '日銀が包括的金融緩和を導入（10/5）／円高・デフレ継続',
      'JALが会社更生法申請（1/19）／尖閣諸島中国漁船衝突事件（9/7）',
    ],
    risingSectors: ['（定性）中国・新興国向け輸出関連（資源・機械）、金・貴金属（リスク回避）、スマートフォン関連エレクトロニクス'],
    decliningSectors: ['（定性）南欧の金融・国債関連（ソブリン危機）、日本の航空（JAL破綻）、円高直撃の輸出製造業（自動車・電機）。'],
    caveats: 'DJIA年末値11577.51（年間+11%）と日経平均年末値10228.92（12/30大納会、前年比-3%）は独立2源で一致。円の「80円割れ」は厳密には2011年で2010年は80円台前半まで。中国GDP逆転は四半期/通年で報道時期が分かれるが通年で確定。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.boj.or.jp/about/education/oshiete/seisaku/b42.htm', type: 'government', label: '日本銀行 — 金融市場調節方針の変遷（2010/10 包括的金融緩和）' },
      { url: 'https://www.nikkei.com/article/DGXNASS0ISS16_Q0A231C1000000/', type: 'media', label: '日本経済新聞 — 大納会 日経平均終値10,228.92（円高で反落）' },
      { url: 'https://ja.wikipedia.org/wiki/%E5%B0%96%E9%96%A3%E8%AB%B8%E5%B3%B6%E4%B8%AD%E5%9B%BD%E6%BC%81%E8%88%B9%E8%A1%9D%E7%AA%81%E4%BA%8B%E4%BB%B6', type: 'reference', label: 'Wikipedia（日本語）— 尖閣諸島中国漁船衝突事件' },
    ],
  },
  {
    year: 2011,
    era: '平成23年',
    world:
      '欧州ソブリン債務危機が深刻化し（ギリシャ・イタリア・スペインへ波及）、8月5日にS&Pが米国の長期格付けをAAA→AA+へ史上初の格下げを行い世界の株式市場が急落した。中東・北アフリカでは「アラブの春」が拡大し、10〜11月のタイ大洪水が製造業集積地を直撃して自動車・HDDなどのグローバル・サプライチェーンを混乱させた。DJIAは年末12,217.56で越年した。',
    japan:
      '3月11日の東日本大震災と東京電力福島第一原発事故により甚大な被害が生じた。東北の部品供給拠点が被災してサプライチェーンが寸断され、3月の鉱工業生産は前月比約16%減、原発停止に伴う電力供給不足で計画停電・節電が行われた。為替は歴史的超円高が進み10月31日に1ドル=75円32銭の戦後最高値を記録、政府・日銀が大規模な円売り介入を実施した。年後半は復興需要で持ち直し局面へ向かった。',
    keyEvents: [
      '東日本大震災・福島第一原発事故（3/11）—サプライチェーン寸断・電力不足',
      'S&Pが米国債を史上初の格下げ（8/5、AAA→AA+）→ 世界株安',
      '欧州ソブリン債務危機の深刻化（ギリシャ・イタリア等へ波及）',
      '円が1ドル=75円32銭の史上最高値（10/31）、政府・日銀が為替介入',
      'タイ大洪水（10〜11月）で自動車・電子部品のグローバル供給混乱',
    ],
    risingSectors: ['（定性）復興関連（建設・土木・セメント等、震災復興需要）、金など安全資産・ディフェンシブ'],
    decliningSectors: ['（定性）電力（特に東京電力＝原発事故で当年の下落率トップ級）、輸出型製造業（自動車・電機、超円高・震災・タイ洪水の供給制約）、欧州金融株（債務危機）。'],
    caveats: 'DJIA年末値12217.56（12/30、一部報道は12,217.60の丸め）と日経平均年末値8455.35（12/30大納会、前年比約-17%）は独立2源で一致。「下落率首位＝東京電力／上昇上位＝復興関連」は日経記事で確認。各国GDP等の精密数値は本調査範囲外。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www5.cao.go.jp/keizai3/2011/1221nk/n11_1/n11_1_2.html', type: 'government', label: '内閣府 経済財政白書 — 円高と日本経済（超円高・75円台）' },
      { url: 'https://en.wikipedia.org/wiki/United_States_federal_government_credit-rating_downgrades', type: 'reference', label: 'Wikipedia — 米国債格下げ（2011/8/5 S&P AAA→AA+）' },
      { url: 'https://www.nikkei.com/article/DGXNASFL3007P_Q1A231C1000000/', type: 'media', label: '日本経済新聞 — 日経平均2011年は17%安・大納会終値8455円35銭' },
    ],
  },
  {
    year: 2012,
    era: '平成24年',
    world:
      '欧州ソブリン債務危機がピークを迎えた。スペイン・イタリアの国債利回りが急騰しユーロ崩壊が懸念されたが、7月26日のドラギECB総裁「whatever it takes」発言とその後のOMT導入が転換点となり市場は安定へ向かった。米国ではFRBが9月13日にオープンエンド型のQE3を決定する一方、年末にかけ「財政の崖」懸念が重しとなった。DJIAは年末13,104.14で越年した。',
    japan:
      '年前半は歴史的円高とデフレが続き、10〜12月期は3四半期連続のマイナス成長となるなど停滞が深刻だった。しかし12月16日の衆院選で自民党が圧勝し（294議席）、12月26日に第2次安倍内閣が発足、大胆な金融緩和を柱とする「アベノミクス」期待から年末にかけ急速な円安・株高に転換した。5月22日には東京スカイツリー（634m）が開業した。',
    keyEvents: [
      'ドラギECB総裁「whatever it takes」発言（7/26）→ OMT導入、欧州債務危機の転換点',
      'FRBがオープンエンドQE3を決定（9/13、毎月400億ドルのMBS購入）',
      '東京スカイツリー開業（5/22、高さ634m）',
      '衆院選で自民党が圧勝し政権交代（12/16）',
      '第2次安倍内閣発足（12/26）、アベノミクス始動（円安・株高へ転換）',
    ],
    risingSectors: ['（定性）輸出関連（自動車・電機、年末の円安進行で恩恵期待）、金融・証券・不動産（アベノミクス期待の株高）、米住宅関連（QE3）'],
    decliningSectors: ['（定性）年前半の日本の輸出型製造業（歴史的円高で採算圧迫）、欧州周縁国の銀行・金融（債務危機）。'],
    caveats: 'DJIA年末値13104.14・日経平均年末値10395.18（12/28大納会・年間+約23%）・ビットコイン年末値約13.50ドルはいずれも独立2源で一致。ビットコインは取引所により$13.50〜$13.53と微差（概数）。年末の株高・円安は政策期待先行の側面が強い。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.europarl.europa.eu/thinktank/en/document/IPOL_STU(2022)703367', type: 'government', label: '欧州議会シンクタンク — 10 years after "whatever it takes"（ドラギ発言7/26）' },
      { url: 'https://www.federalreserve.gov/monetarypolicy/timeline-balance-sheet-policies.htm', type: 'government', label: 'FRB — Balance Sheet Policies Timeline（QE3 9/13/2012）' },
      { url: 'https://en.wikipedia.org/wiki/2012_Japanese_general_election', type: 'reference', label: 'Wikipedia — 2012 Japanese general election（12/16自民圧勝・第2次安倍内閣）' },
    ],
  },
  {
    year: 2013,
    era: '平成25年',
    world:
      '米国経済が回復基調を強めるなか、5月にバーナンキFRB議長が量的緩和縮小（テーパリング）を初めて示唆し、長期金利急騰と新興国からの資金流出「テーパー・タントラム」が発生、ブラジル・インド・インドネシア・トルコ・南アの「フラジャイル5」通貨が下落した。FRBは12月にテーパリング開始を決定し、米株は記録的高値で年を終えた。DJIAは年末16,576.66で越年した。',
    japan:
      '3月就任の黒田東彦・日銀総裁が4月4日に「量的・質的金融緩和（QQE、異次元緩和）」を導入し、2年で2%の物価目標・マネタリーベース倍増を表明した。アベノミクスと相まって急速な円安・株高が進行し、日経平均は年間約+57%と40年超ぶりの大幅上昇となった。9月にはIOC総会で2020年夏季五輪の東京開催が決定し、消費税を2014年4月に8%へ引き上げる方針も正式決定された。',
    keyEvents: [
      '日銀・黒田総裁が量的・質的金融緩和（異次元緩和/QQE）を導入（4/4）',
      'FRBのテーパリング示唆で「テーパー・タントラム」、新興国通貨が動揺（5〜9月）',
      '2020年夏季オリンピックの東京開催決定（9月）',
      '消費税率8%への引き上げ（2014年4月実施）を正式決定（秋）',
      'FRBが12月FOMCでテーパリング開始を決定',
    ],
    risingSectors: ['（定性）日本の輸出関連株（自動車・電機、大幅円安）、米国・先進国株式全般（緩和マネー・リスクオン）、暗号資産（ビットコインが年間で急騰）'],
    decliningSectors: ['（定性）新興国通貨・資産（フラジャイル5）、米国債など長期債（テーパー観測で利回り急騰）、金（年間で大幅下落）。'],
    caveats: 'DJIA年末値16576.66（年間+26.5%）と日経平均年末値16291.31（12/30大納会・年間約+57%）は独立2源で一致。ビットコイン年末値は約754ドル（取引所により$750〜760と幅、概数）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2013/k130404a.pdf', type: 'government', label: '日本銀行 — Introduction of Quantitative and Qualitative Monetary Easing（2013/4/4）' },
      { url: 'https://www.brookings.edu/articles/emerging-markets-taper-tantrum/', type: 'academic', label: 'Brookings — Emerging Markets Taper Tantrum' },
      { url: 'https://money.cnn.com/2013/12/31/investing/japan-nikkei-stocks/index.html', type: 'media', label: "CNN Money — Japan's Nikkei posts 57% rise in 2013（16,291.31）" },
    ],
  },
  {
    year: 2014,
    era: '平成26年',
    world:
      '世界経済は緩慢な回復局面。米FRBは10月29日のFOMCで資産購入プログラム（QE3）の終了を決定し量的緩和の出口へ向かった。年後半に原油価格が急落し（6月の高値から12月にかけ約50%下落）、産油国・新興国に下押し圧力がかかった。地政学ではロシアのクリミア併合と対露制裁・ルーブル急落、西アフリカでエボラ出血熱が大流行した。DJIAは年末17,823.07で越年した。',
    japan:
      '4月1日に消費税率を5%→8%へ引き上げ、駆け込み需要の反動で個人消費が落ち込み、実質GDPは2四半期連続のマイナス成長＝景気後退入りとなった。10月31日に日銀がサプライズの追加金融緩和（QQE拡大）を決定し、同日GPIFが基本ポートフォリオを国内株25%/外株25%へ大幅シフトした。円安が進行し株高を後押しした。',
    keyEvents: [
      '消費税を8%へ引き上げ（4/1）→ 反動減で2四半期連続マイナス成長＝景気後退',
      '日銀がサプライズ追加緩和（10/31、QQE拡大）、同日GPIFが運用見直し（国内株25%へ）',
      '米FRBがQE3（資産購入）を終了（10/29 FOMC）',
      '原油価格が年後半に急落（年央高値比 約-50%）',
      'ロシアのクリミア併合と対露制裁→ルーブル暴落／西アフリカでエボラ流行',
    ],
    risingSectors: ['（定性）日本の輸出関連（自動車・電機、円安）、インバウンド・観光、米テクノロジー・株式、原油安が追い風の石油消費国の製造業・運輸'],
    decliningSectors: ['（定性）日本の個人消費依存の小売・耐久財（増税の反動減）、石油・上流エネルギー・産油国財政（原油急落）、ロシア関連資産・新興国通貨、ビットコイン（Mt.Gox破綻等で年間-約57%）。'],
    caveats: 'DJIA年末値17823.07（年間+7.5%）・日経平均年末値約17,450.77（12/30大納会）・ビットコイン年末値約320ドル（$315〜320の幅・年間-約57%）はいずれも独立2源で一致。GDPは速報/改定で版差あるが「2四半期連続マイナス→Q4回復」の傾向は確実。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.newyorkfed.org/markets/programs-archive/large-scale-asset-purchases', type: 'government', label: 'NY Fed — Large-Scale Asset Purchases（QE3を2014/10終了）' },
      { url: 'https://www.richmondfed.org/publications/research/economic_brief/2019/eb_19-10', type: 'government', label: 'Richmond Fed — 日本の消費税引き上げ（2014/4 5→8%）の景気影響' },
      { url: 'https://asia.nikkei.com/Business/Markets/Stocks/Nikkei-index-up-a-third-year-in-2014', type: 'media', label: 'Nikkei Asia — 日経平均2014年は3年連続上昇（≈17,450）' },
    ],
  },
  {
    year: 2015,
    era: '平成27年',
    world:
      '世界経済は中国減速とコモディティ安に揺れた。6月にピークを付けた上海株が夏に急落し、8月11日の人民元切り下げ（約1.9%）を契機に世界同時株安「チャイナショック」が発生した。原油は供給過剰で2009年以来の安値（前年比約-53%）となり、ギリシャ債務危機も再燃した。12月16日に米FRBが約9年半ぶりに利上げしゼロ金利政策を解除した（0-0.25%→0.25-0.5%）。DJIAは年末17,425.03で越年した。',
    japan:
      'アベノミクス・円安・金融緩和を背景に株高基調が継続し、日経平均は4月に約15年ぶりに2万円を回復、年末終値は4年連続上昇となった。訪日外国人は約1,974万人・消費額約3.5兆円に達し、中国人観光客の「爆買い」が流行語となった。一方で実質GDPは伸び悩み、10月にマイナンバー（社会保障・税番号）制度の通知が始まった。',
    keyEvents: [
      'チャイナショック—中国株急落と人民元切り下げ（8/11）で世界同時株安',
      '米FRBが約9年半ぶりの利上げでゼロ金利政策を解除（12/16、0.25-0.5%へ）',
      '原油安の継続（WTI/Brent年平均約49〜52ドル、2009年以来の安値）',
      'ギリシャ債務危機の再燃（第3次金融支援交渉）',
      '日経平均が約15年ぶりに2万円回復／インバウンド「爆買い」・マイナンバー制度開始',
    ],
    risingSectors: ['（定性）訪日インバウンド関連（百貨店・ドラッグストア・化粧品・家電量販・宿泊/観光）、原油安の恩恵を受ける消費・運輸/航空'],
    decliningSectors: ['（定性）資源・エネルギー（石油・鉱業・素材、原油/コモディティ安の直撃）、対中依存の資本財・素材輸出（中国減速）。'],
    caveats: 'DJIA年末値17425.03・日経平均年末値19033.71（12/30大納会・4年連続上昇）・ビットコイン年末値約430.57ドルはいずれも独立2源で一致。ビットコインは取引所により$430〜432の小差。日本のGDPは四半期改定差あり通年確定値は固定せず。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.europarl.europa.eu/RegData/etudes/IDAN/2015/549067/EXPO_IDA(2015)549067_EN.pdf', type: 'government', label: '欧州議会 — 上海株式市場の暴落と中国経済（2015）' },
      { url: 'https://www.jec.senate.gov/public/index.cfm/republicans/2015/12/dec-17-2015-federal-open-market-committee-announcement-review', type: 'government', label: '米議会JEC — FOMC 2015年12月利上げ（ゼロ金利解除）レビュー' },
      { url: 'https://response.jp/article/2015/12/31/267046.html', type: 'media', label: 'Response.jp — 2015年大納会 日経平均終値19,033円（4年連続上昇）' },
    ],
  },
  {
    year: 2016,
    era: '平成28年',
    world:
      '年初は中国景気減速懸念と原油急落で世界同時株安・リスクオフ（円高進行）となり、原油は2月にWTI約26ドルへ13年ぶり安値を付け底打ち、年末には約54ドルへ反発した。6月23日の英国EU離脱（Brexit）国民投票は離脱51.9%対残留48.1%で可決し市場に一時ショックを与えた。11月8日の米大統領選でトランプが当選し、選挙後は減税・財政拡張期待で株高（トランプ・ラリー）となった。DJIAは年末19,762.60で越年した。',
    japan:
      '日銀が1月29日にマイナス金利政策（QQE＋マイナス金利、当座預金一部に-0.1%）を決定し2月適用した。年初は世界同時株安と急速な円高（一時100円台）で日経平均は下落、Brexitでさらに動揺したが、9月21日に長短金利操作付き量的・質的金融緩和（YCC、10年国債利回り0%程度誘導）へ枠組みを変更した。4月に熊本地震（前震M6.5・本震M7.0）が発生し、日経平均は米大統領選後の世界的株高と円安で急回復し5年連続の年間上昇となった。',
    keyEvents: [
      '日銀がマイナス金利政策を決定（1/29、2月適用、-0.1%）',
      '熊本地震（4/14前震M6.5・4/16本震M7.0）',
      '英国EU離脱（Brexit）国民投票で離脱が可決（6/23、離脱51.9%）',
      '日銀が長短金利操作（YCC）付きQQEを導入（9/21）',
      'トランプ米大統領当選（11/8）→ トランプ・ラリーで株高',
    ],
    risingSectors: ['（定性）エネルギー（原油底打ち・反発）、金融・銀行（選挙後の金利上昇・規制緩和期待）、素材・資本財（商品価格回復・財政期待）'],
    decliningSectors: ['（定性）ヘルスケア（米株で軟調、薬価批判が逆風）、生活必需品・公益（金利上昇局面の年後半に相対的に劣後）。'],
    caveats: 'DJIA年末値19762.60・日経平均年末値19114.37（12/30大納会・5年連続上昇）・ビットコイン年末値約963.74ドルはいずれも独立2源で一致。ビットコインは取引所により$960〜970帯。セクター騰落は主に米国S&P500ベースの定性傾向で集計時点・指数により順位が変わる。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/2016_United_Kingdom_European_Union_membership_referendum', type: 'reference', label: 'Wikipedia — 2016 UK EU membership referendum（Brexit 6/23）' },
      { url: 'https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2016/k160129a.pdf', type: 'government', label: '日本銀行 — マイナス金利導入決定文（2016/1/29、一次資料）' },
      { url: 'https://www.sipa.columbia.edu/bank-japan-japan-yield-curve-control-regime', type: 'academic', label: 'Columbia SIPA — 日銀YCC（2016/9/21導入）解説' },
    ],
  },
  {
    year: 2017,
    era: '平成29年',
    world:
      '世界経済は「同時好況（synchronized upswing）」の年で、IMFは2017年成長率を約3.6%とし広範な上方修正を行った。米国では1月20日にトランプ政権が発足し株式は史上最高値を更新、DJIAは年間約+25%上昇した。FRBは2017年に3回利上げ（3・6・12月）し10月から約4.5兆ドルのバランスシート縮小（QT）を開始した。北朝鮮が弾道ミサイル発射を繰り返し（7/4に初のICBM級発射）地政学的緊張が高まり、年末にかけビットコイン等の仮想通貨が急騰した。DJIAは年末24,719.22で越年した。',
    japan:
      '景気回復が継続し、完全失業率は2月に約22年ぶりに3%を割り込み、有効求人倍率はバブル期超えの高水準で広範な産業で人手不足が深刻化した。株式は好調で、日経平均は大納会（12/29）に22,764.94円で引け、6年連続上昇・年末値としては1991年以来26年ぶりの高水準となった。10月22日の第48回衆院選で自民党が大勝し、与党で3分の2超を維持した。',
    keyEvents: [
      'トランプ米大統領就任（1/20）—米株最高値更新が続く',
      'FRBが3回利上げ＋10月からバランスシート縮小（QT）開始',
      '北朝鮮が弾道ミサイル/核実験を繰り返す（7/4 初のICBM級発射、9月 核実験）',
      '第48回衆院選で自民党が大勝（10/22、与党3分の2超）',
      'ビットコイン等仮想通貨が急騰しバブル様相（12月中旬に一時約1.9万ドル接近）',
    ],
    risingSectors: ['（定性）ハイテク/IT・半導体（米FAANG等の株高）、仮想通貨・ブロックチェーン関連（ビットコイン年間+約1,369%）、輸出関連・製造業（世界同時好況・円安）、省力化・自動化/人材サービス'],
    decliningSectors: ['（定性）伝統的小売（EC化圧力・米国で店舗閉鎖増）。人手不足が深刻な労働集約型サービス（建設・運輸・飲食・介護）は供給制約で成長が抑制（衰退ではなく制約）。'],
    caveats: 'DJIA年末値24719.22（年間約+25%）・日経平均年末値22764.94（12/29大納会・6年連続上昇・年末値で26年ぶり高値）・ビットコイン年末値約14,156ドルはいずれも独立2源で一致。ビットコインは取引所により$13,800〜14,200の幅（概数）。日経の高値は「21年ぶり」ではなく年末値で26年ぶり。「いざなぎ超え」認定は2018年12月の事後認定。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.imf.org/en/publications/weo/issues/2017/09/19/world-economic-outlook-october-2017', type: 'government', label: 'IMF World Economic Outlook 2017/10 — 世界同時好況（成長率約3.6%）' },
      { url: 'https://www5.cao.go.jp/j-j/wp/wp-je17/pdf/p01013.pdf', type: 'government', label: '内閣府 平成29年度経済財政白書 — 四半世紀ぶりの人手不足・雇用改善' },
      { url: 'https://toyokeizai.net/articles/-/203216', type: 'media', label: '東洋経済 — 2017年日経平均は22,764円で終了・6年連続上昇' },
    ],
  },
  {
    year: 2018,
    era: '平成30年',
    world:
      '米中貿易戦争が本格化し（双方が報復関税を連鎖発動）、FRBは3・6・9・12月の年4回利上げして政策金利を2.25-2.50%まで引き上げた。年前半の堅調から一転、12月に世界同時株安が深刻化し、米株は2008年以来最悪の年間成績で終えた（ダウは12月として1931年以来最悪）。仮想通貨はバブルが崩壊しビットコインが年初来約-73%と暴落した。DJIAは年末23,327.46で越年した。',
    japan:
      '緩やかな景気拡大が続き、内閣府の評価では12月に戦後最長の「いざなみ景気」（73か月）に並ぶ回復局面となった。株式は10月2日に日経平均がバブル後高値24,270円台（1991年11月以来）を付けた後、米中摩擦と米利上げを受けて約3か月で5,000円超下落し12月に急落した。大阪府北部地震・西日本豪雨・北海道胆振東部地震が相次ぎ、6月に働き方改革関連法が成立した。',
    keyEvents: [
      '米中貿易戦争の本格化（双方が相互に報復関税を段階的に発動）',
      'FRBが年4回（3/6/9/12月）利上げ、12月に政策金利2.25-2.50%へ',
      '12月の世界同時株安—ダウは1931年以来最悪の12月、米株は2008年以来最悪の年',
      '連続自然災害—大阪府北部地震（6/18）・西日本豪雨・北海道胆振東部地震（9/6 M6.7）',
      '働き方改革関連法が成立（6/29、残業上限規制等）',
    ],
    risingSectors: ['（定性）設備投資関連（企業の高い収益力・投資意欲）、雇用・人材（人手不足下で雇用・所得環境が改善）'],
    decliningSectors: ['（定性）暗号資産関連（ビットコイン年間約-73%でバブル崩壊）、輸出・市況株（米中摩擦と年末株安で下落圧力）。'],
    caveats: 'DJIA年末値23327.46（年間-5.6%）・日経平均年末値20014.77（12/28大納会・7年ぶり前年割れ）・ビットコイン年末値約3,742.70ドル（年間約-73%）はいずれも独立2源で一致。ビットコインは取引所により数十ドル差（概数）。「戦後最長の景気拡大」は2018年12月時点の内閣府暫定評価で後年見直された経緯あり。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreserve.gov/monetarypolicy/fomcminutes20181219.htm', type: 'government', label: '米FRB — FOMC議事要旨 2018/12（12月利上げ・年4回）' },
      { url: 'https://www5.cao.go.jp/keizai3/2018/0125nk/n18_1_1.html', type: 'government', label: '内閣府 — 日本経済2018-2019（戦後最長に並ぶ景気回復）' },
      { url: 'https://www.nikkei.com/article/DGKKZO39565470Z21C18A2MM8000/', type: 'media', label: '日本経済新聞 — 日経平均7年ぶり下落 大納会終値2万14円' },
    ],
  },
  {
    year: 2019,
    era: '平成31年/令和元年',
    world:
      '米中貿易戦争が継続し世界の製造業・貿易が広範に減速、IMFは2019年の世界成長率を約3.0%（金融危機以来の低水準）と推計した。FRBは2018年までの利上げ局面から転換し、7・9・10月の3会合で計75bp利下げした（予防的な「mid-cycle adjustment」）。株式は世界的な金融緩和を追い風に年間大幅高（S&P500 +28.9%）となった。DJIAは年末28,538.44で越年した。',
    japan:
      '5月1日に皇位継承に伴い「令和」へ改元し、10月1日に消費税を8%→10%へ引き上げ、同時に食料品・新聞等への軽減税率8%を初導入した。景気は世界的な製造業減速と増税の影響で減速感が出たが、株式市場は世界の利下げを背景に堅調で、日経平均は年末に29年ぶり（1990年以来）の高値水準で大納会を迎えた。9〜11月にアジア初開催のラグビーW杯日本大会が行われた。',
    keyEvents: [
      '改元「令和」施行（5/1）',
      '消費税10%へ引き上げ＋軽減税率8%導入（10/1）',
      'FRBが2019年に3回（7・9・10月）計75bp利下げ、利上げ局面から転換',
      '米中貿易戦争継続で世界成長率が約3.0%（金融危機以来の低水準）に減速',
      'ラグビーW杯日本大会（9/20-11/2、アジア初開催）',
    ],
    risingSectors: ['（定性）株式・リスク資産全般（世界的金融緩和で年間大幅高）、暗号資産（ビットコイン年間+約90%）、ハイテク/グロース株'],
    decliningSectors: ['（定性）製造業（世界的に減速、世界貿易の伸びは2012年以来最弱）、輸出依存・資源/コモディティ関連（対中需要鈍化）。'],
    caveats: 'DJIA年末値28538.44（年間+約22%）・日経平均年末値23656.62（12/30大納会・29年ぶり高値）・ビットコイン年末値約7,193ドル（$7,193〜7,195で2源一致）はいずれも独立2源で一致。FRB利下げは3回×25bp＝計75bp（誘導目標1.50-1.75%へ）。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreserve.gov/publications/2019-ar-monetary-policy.htm', type: 'government', label: '米FRB — 2019 Annual Report: Monetary Policy（計75bp利下げ）' },
      { url: 'https://www.richmondfed.org/publications/research/economic_brief/2019/eb_19-10', type: 'government', label: "Richmond Fed — Japan's Rising Consumption Tax（消費税10%）" },
      { url: 'https://indexes.nikkei.co.jp/atoz/2020/01/201912.html', type: 'media', label: '日経指数公式 — 2019年12月の日経平均（大納会終値23,656.62円）' },
    ],
  },
  {
    year: 2020,
    era: '令和2年',
    world:
      '新型コロナ（COVID-19）パンデミックにより世界経済は戦後最悪級の同時不況に陥り、IMFは「The Great Lockdown（大封鎖）」と命名した。2〜3月に史上最速級の株式大暴落（コロナショック）が発生し、FRBは3月に政策金利を実質ゼロへ緊急引き下げ＋大規模量的緩和、米議会も約2.2兆ドルの財政出動を行った。潤沢な流動性で株式はV字回復し年末に最高値圏となった。4月20日にはWTI原油先物が史上初のマイナス（約-37.6ドル）を記録した。DJIAは年末30,606.48で越年した。',
    japan:
      '3月24日に東京五輪・パラリンピックの1年延期が決定し（史上初）、4月7日に初の緊急事態宣言が発令された。4〜6月期に実質GDPが戦後最大級の急落となり、2020暦年は実質-4.8%だった。特別定額給付金（一律10万円）やGo Toキャンペーン等の景気対策を実施、健康問題で安倍首相が退陣表明し9月16日に菅内閣が発足した。金融緩和とハイテク株高で年末の日経平均は約31年ぶり高値圏（3万円に接近）となった。',
    keyEvents: [
      'COVID-19世界的大流行（WHOが3/11にパンデミック宣言）と各国ロックダウン',
      '3月の世界株大暴落（コロナショック）→ FRBゼロ金利・大規模緩和でV字回復',
      'WTI原油先物が史上初のマイナス価格（4/20、約-37.6ドル）',
      '東京五輪1年延期決定（3/24）・日本初の緊急事態宣言（4/7）・Q2に戦後最大級GDP急落',
      '安倍首相退陣→菅内閣発足（9/16）／年末に日経平均が約31年ぶり高値で3万円接近',
    ],
    risingSectors: ['（定性）IT・クラウド・SaaS・半導体（巣ごもり/リモート需要）、EC・宅配/フードデリバリー、製薬・ワクチン・ヘルスケア、デジタルエンタメ、暗号資産（ビットコインが年内に約3倍超）'],
    decliningSectors: ['（定性）航空・旅行・宿泊・観光（渡航制限で需要蒸発）、外食・対面小売・百貨店、エネルギー/石油（原油暴落）、イベント・興行・スポーツ。'],
    caveats: 'DJIA年末値30606.48（最高値）・日経平均年末値27444.17（12/30大納会・約31年ぶり高値）・ビットコイン年末値約29,001.72ドルはいずれも独立2源で一致。IMFの世界成長率は時点で改定（-3〜-4.9%）のため定性表現。ビットコイン終値は取引所により$28,900〜29,300の幅。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.imf.org/en/publications/weo/issues/2020/04/14/weo-april-2020', type: 'government', label: 'IMF WEO April 2020 — The Great Lockdown' },
      { url: 'https://www.eia.gov/todayinenergy/detail.php?id=46336', type: 'government', label: '米EIA — WTI原油が2020年春に史上初のマイナス価格' },
      { url: 'https://www.nikkei.com/article/DGXZQOGD00004_Q0A231C2000000/', type: 'media', label: '日本経済新聞 — 日経平均大納会 終値2万7444円（31年ぶり高値圏）' },
    ],
  },
  {
    year: 2021,
    era: '令和3年',
    world:
      'COVID-19ワクチンの普及（先進国で進展、新興国は遅延という格差）を背景に経済が再開・反発回復した一方、需要回復に供給が追いつかずサプライチェーンが混乱し、2021年半ばから数十年ぶりの世界的インフレ加速が始まった。米国株は史上最高値を更新し（S&P500 約+27%）、仮想通貨が高騰してビットコインは11月に史上最高値（約69,000ドル）を記録後、年末にかけ反落した。DJIAは年末36,338.30で越年した。',
    japan:
      '1年延期の末に東京2020オリンピック（7/23-8/8）・パラリンピック（8/24-9/5）を、COVID第5波（デルタ株）下でほぼ全面的に無観客で開催した。9月に菅義偉首相が退陣表明し、10月4日に岸田文雄内閣が発足した。世界的な半導体不足が自動車など製造業の減産要因となった。日経平均は年末28,791.71で、1980年代バブル後の最高水準で越年した。',
    keyEvents: [
      '東京オリンピック・パラリンピック開催（無観客、7〜9月）',
      '菅首相退陣→岸田文雄内閣発足（10/4）',
      '世界的インフレ加速の開始（2021年半ば〜、サプライチェーン混乱が主因の一つ）',
      '米国株が史上最高値更新（DJIA/S&P500）',
      'ビットコインが11月に史上最高値（約69,000ドル）→ 年末に反落',
    ],
    risingSectors: ['（定性）テクノロジー・半導体（需要急増・供給逼迫）、暗号資産・仮想通貨関連、eコマース・リモートワーク関連、エネルギー（年後半の需要回復）'],
    decliningSectors: ['（定性）対面型サービス（旅行・観光・対面イベント、コロナ規制・第5波で打撃）、自動車製造（世界的半導体不足による減産）。'],
    caveats: 'DJIA年末値36338.30・日経平均年末値28791.71（12/30大納会・バブル後最高）・ビットコイン年末値約46,306ドル（取引所差で$46,200〜46,300）はいずれも独立2源で一致。ビットコインは11月に史上最高値約69,000ドルを記録後に反落。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.frbsf.org/research-and-insights/publications/economic-letter/2023/06/global-supply-chain-pressures-and-us-inflation/', type: 'government', label: 'San Francisco Fed — Global Supply Chain Pressures and U.S. Inflation' },
      { url: 'https://www.japantimes.co.jp/news/2021/12/30/business/financial-markets/nikkei-2021-year-end/', type: 'media', label: 'The Japan Times — Nikkei best year-end close since 1980s bubble（28,791.71）' },
      { url: 'https://www.britannica.com/biography/Fumio-Kishida', type: 'reference', label: 'Britannica — Fumio Kishida（2021/10/4首相就任）' },
    ],
  },
  {
    year: 2022,
    era: '令和4年',
    world:
      '地政学リスクと記録的インフレの年。2月24日のロシアによるウクライナ全面侵攻が資源・食料価格を押し上げ世界的にインフレが加速した（米CPIは年央に約9%）。米FRBは政策金利を年初の0-0.25%から年末4.25-4.5%へ急激に引き上げ（年7回、うち4回は0.75%）、世界同時株安となり米3指数は2008年以来最悪の年となった。暗号資産は暴落し11月にFTXが破綻した。DJIAは年末33,147.25で越年した。',
    japan:
      '日米金利差拡大を背景に歴史的円安が進行し、10月に一時1ドル151円台（約32年ぶり水準）となり政府・日銀が9月以降に為替介入を実施した。物価が約40年ぶりの高い上昇率となるなか、日銀は黒田総裁下で大規模緩和を維持していたが、12月20日の会合でYCCを修正し長期金利の変動許容幅を±0.25%から±0.5%へ拡大した（事実上の引き締めと市場が解釈）。7月8日には安倍晋三元首相が銃撃され死亡した。日経平均は年間-9%で4年ぶり下落となった。',
    keyEvents: [
      'ロシアがウクライナへ全面侵攻（2/24）→ エネルギー・食料価格高騰、世界的インフレ加速',
      'FRBが2022年に7回利上げ（0-0.25%→4.25-4.5%、4回連続0.75%）',
      '安倍晋三元首相が銃撃され死亡（7/8）',
      '1ドル151円台の歴史的円安（10月）→ 政府・日銀の為替介入',
      '暗号資産取引所FTX破綻（11月）／日銀がYCC修正（12/20、上限0.25%→0.5%）',
    ],
    risingSectors: ['（定性）エネルギー（原油・天然ガス・石炭、侵攻による供給不安と価格高騰）、資源・素材・コモディティ全般（穀物含む）、防衛・軍需関連'],
    decliningSectors: ['（定性）ハイテク・グロース株（利上げで割引率上昇、ナスダック-33%）、暗号資産（ビットコイン約-64%、FTX破綻）、債券（急激な利上げで歴史的下落）、不動産・通信・一般消費財。'],
    caveats: 'DJIA年末値33147.25（年間-8.8%）・日経平均年末値26094.50（12/30大納会・4年ぶり下落）・ビットコイン年末値約16,547ドル（取引所差で$16,500〜16,600）はいずれも独立2源で一致。FRBの利上げ回数は数え方で表現差あり。業種別の上昇/下落は主に米国S&P500セクター動向の一般化。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20221214a1.htm', type: 'government', label: '米FRB — 2022/12/14 政策金利を4.25-4.5%へ（公式ノート）' },
      { url: 'https://www.nikkei.com/article/DGXZQOUB291E20Z21C22A2000000/', type: 'media', label: '日本経済新聞 — 大納会終値2万6094円、年間4年ぶり下落' },
      { url: 'https://www.cnn.com/2022/12/30/investing/dow-stock-market-2022/index.html', type: 'media', label: 'CNN Business — 2022年市場総括（ダウ-8.8%等）' },
    ],
  },
  {
    year: 2023,
    era: '令和5年',
    world:
      '「銀行不安→インフレ鈍化→株高」の3局面で進行した年。3月に米シリコンバレー銀行（SVB）・シグネチャー銀行が相次ぎ破綻し、スイスのクレディ・スイスがUBSに緊急救済合併された。FRBは利上げを継続し7月26日にFF金利を5.25-5.50%（22年ぶり高水準）へ引き上げ、これが2023年最後の利上げとなり打ち止め観測が広がった。生成AI（ChatGPT）ブームで米ハイテク株が急騰し、ビットコインは現物ETF承認期待で年間+約155%急回復した。DJIAは年末37,689.54で越年した。',
    japan:
      '34年ぶりの株高が象徴の年。日経平均は大納会（12/29）で33,464.17円で引け、年間約+28%とバブル後の年末最高値を更新した（ただし1989年の史上最高値38,915円には未到達）。4月に植田和男が日銀総裁に就任し、7月・10月にYCCの運用を柔軟化した。春闘での歴史的賃上げと物価高、日米金利差を背景とした円安継続、コロナ後のインバウンド回復が景気を下支えした。',
    keyEvents: [
      '米SVB・シグネチャー銀行が破綻（3月）、クレディ・スイスをUBSが救済合併',
      '植田和男が日銀総裁に就任（4月）→ 7月・10月にYCC柔軟化',
      'FRBがFF金利を5.25-5.50%へ利上げ（7/26、これが23年最後の利上げ＝打ち止め）',
      '生成AI（ChatGPT）ブームで米ハイテク株高、DJIAが過去最高値で越年',
      '日経平均が大納会33,464円、年間約+28%でバブル後年末高値更新（12/29）',
    ],
    risingSectors: ['（定性）AI・半導体（生成AIブーム、エヌビディア等）、米国大手テック、暗号資産（ビットコイン現物ETF承認期待で+約155%）、日本のインバウンド関連・輸出関連（円安）・銀行（金利上昇観測）'],
    decliningSectors: ['（定性）地域銀行・中小金融（米地銀不安・預金流出懸念）、商業用不動産（高金利・空室率上昇で逆風）。'],
    caveats: 'DJIA年末値37689.54（12/29）・日経平均年末値33464.17（12/29大納会・バブル後高値更新34年ぶり）・ビットコイン年末値約42,255ドルはいずれも独立2源で一致。日経33,464円はバブル後の年末高値であり1989年史上最高値38,915円の更新ではない（更新は2024年）。ビットコインは取引所/時刻基準で$42,000〜43,000の幅。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://fred.stlouisfed.org/data/DJIA', type: 'government', label: '米セントルイス連銀FRED — DJIA公式時系列（年末終値）' },
      { url: 'https://www.bis.org/bcbs/publ/d555.pdf', type: 'government', label: 'BIS/バーゼル委 — 2023年銀行危機（SVB・クレディ・スイス）報告書' },
      { url: 'https://www.nikkei.com/article/DGXZQOUB291980Z21C23A2000000/', type: 'media', label: '日本経済新聞 — 日経平均2023年終値33,464円・年間+7,369円高' },
    ],
  },
  {
    year: 2024,
    era: '令和6年',
    world:
      '世界経済はインフレ鈍化と「ソフトランディング」観測のもとで底堅く推移し、IMFは2024年の世界実質GDP成長率を約3.2%と見込んだ。米FRBは9月18日に4年ぶりの利下げを0.50%（50bp）の大幅幅で開始し緩和サイクルに転じた。AI関連（Nvidia等）と大型テックが市場を牽引して米株は最高値を更新し、11月5日の大統領選でトランプが再選された。DJIAは年末42,544.22で越年した。',
    japan:
      '日経平均は2月22日に1989年バブル期の史上最高値（38,915円）を約34年ぶりに更新し、3月には史上初の4万円台に乗せた。日銀は3月19日にマイナス金利政策を解除しYCCも撤廃、17年ぶりの利上げに踏み切った（短期金利0〜0.1%へ）。8月5日には円キャリー取引の巻き戻しで日経が史上最大の下げ幅（▲4,451円、約-12.4%）を記録した後に急反発した。1月の新NISA開始、1月1日の能登半島地震、10月の石破内閣発足も節目となった。',
    keyEvents: [
      '能登半島地震（1/1、M7.6）／新NISA制度開始・米ビットコイン現物ETF承認（1月）',
      '日経平均が34年ぶりに史上最高値を更新（2/22）→ 3月に史上初の4万円突破',
      '日銀がマイナス金利解除・YCC撤廃、17年ぶりの利上げ（3/19）',
      '日経平均が史上最大の下げ幅▲4,451円（約-12.4%）の暴落（8/5）→ 翌日以降急反発',
      '米FRBが4年ぶり利下げを50bpで開始（9/18）／トランプ再選（11/5）／石破内閣発足（10月）',
    ],
    risingSectors: ['（定性・主に米S&P500）コミュニケーション・サービス（Meta・Google）、情報技術・半導体（Nvidia +171%等、AI需要）、公益（AIデータセンター電力需要）、金融'],
    decliningSectors: ['（定性）素材・資材、不動産（相対的に劣後）。2024年は米株ほぼ全セクターがプラスで明確な下落セクターは限定的。'],
    caveats: 'DJIA年末値42544.22（12/31）・日経平均年末値39894.54（12/30大納会・年末値で35年ぶり最高）・ビットコイン年末値約93,429ドルはいずれも独立2源で一致。ビットコインは取引所により$93,429〜93,460の幅（概数）。8/5の暴落は下げ幅・下落率とも当時史上最大級。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2024/k240319a.pdf', type: 'government', label: '日本銀行 — 2024/3/19 Changes in the Monetary Policy Framework（マイナス金利解除・YCC撤廃）' },
      { url: 'https://www.imf.org/en/Publications/WEO/Issues/2024/04/16/world-economic-outlook-april-2024', type: 'government', label: 'IMF WEO April 2024（世界GDP成長率約3.2%）' },
      { url: 'https://www.nikkei.com/article/DGXZQOUB300DT0Q4A231C2000000/', type: 'media', label: '日本経済新聞 — 日経平均終値3万9894円、年末値で35年ぶり最高値' },
    ],
  },
  {
    year: 2025,
    era: '令和7年',
    world:
      'トランプ政権の「相互関税」（4月2日、Liberation Day）を起点とする通商摩擦が最大の波乱要因となり4月に株式市場が急落したが、その後の各国との貿易合意と米FRBの利下げ（9・10・12月の3会合連続、年末FF金利目標3.50-3.75%）で持ち直した。IMFは10月に2025年の世界成長率を3.2%へ上方修正した。米株はAI関連株主導で記録的高値を更新したが、年後半は「AIバブル」懸念で変動が拡大した。DJIAは年末48,063.29で越年した。',
    japan:
      '石破茂首相が9月に退陣表明し、10月21日に高市早苗が初の女性首相に就任した。日銀は12月19日に政策金利を0.75%へ追加利上げし約30年ぶりの高水準に到達した。2025年春闘は平均賃上げ率5%超と高水準だったが物価上昇がこれを上回り、実質賃金は前年比マイナスで「賃上げの実感なき物価高」が続いた。日経平均は史上初めて年末終値で5万円台（50,339.48）に乗せ、年間+26%超と好調だった。4〜10月に大阪・関西万博を開催した。',
    keyEvents: [
      'トランプ「相互関税」発表（4/2 Liberation Day）→ 4月の世界同時株安、その後日米貿易合意（7月）',
      '米FRBが2025年に3会合連続で利下げ（9・10・12月）、年末FF金利目標3.50-3.75%',
      '日銀が政策金利0.75%へ追加利上げ（12/19、約30年ぶり高水準）',
      '石破退陣→高市早苗が初の女性首相に就任（10/21）',
      '大阪・関西万博（4/13〜10/13、来場者約2,902万人）／日経平均が年末終値で史上初の5万円台',
    ],
    risingSectors: ['（定性）AI・半導体関連（Nvidia・AMD・Broadcom・Micron等の米メガキャップ技術株）、データセンター・AIインフラ投資関連、日本株全般（輸出関連・銀行/金融は利上げ局面で相対的に堅調）'],
    decliningSectors: ['（定性）暗号資産（ビットコインは10月の最高値$126,000台から反落し年間ではマイナス）、通商摩擦の影響を受けた一部輸出・自動車関連（年前半の関税ショック局面）。'],
    caveats: 'DJIA年末値48063.29・日経平均年末値50339.48（史上初の年末5万円台）・ビットコイン年末値約87,501.95ドル（10月の最高値$126,000台から反落・年間約-6%）はいずれも独立2源で一致。実質賃金は概ねマイナスだが確報定義差あり。高市政権の追加経済政策等は本データの範囲で複数源確認未完のため未記載。「AIバブル」評価は市場参加者の見方で確定的判断ではない。業種別ランキングは一次統計未確認のため定性傾向のみ。',
    sources: [
      { url: 'https://www.imf.org/en/publications/weo/issues/2025/10/14/world-economic-outlook-october-2025', type: 'government', label: 'IMF WEO October 2025（世界成長率2025=3.2%へ上方修正）' },
      { url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20251210a1.htm', type: 'government', label: '米FRB — 2025/12 Implementation Note（FF金利3.50-3.75%へ利下げ）' },
      { url: 'https://www.nippon.com/en/news/yjj2025123000562/', type: 'media', label: 'Nippon.com — Nikkei Marks Record Year-End Finish above 50,000（50,339.48）' },
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
  1988: { djiaYearEnd: 2168.57, nikkeiYearEnd: 30159.0, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1989: { djiaYearEnd: 2753.2, nikkeiYearEnd: 38915.87, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1990: { djiaYearEnd: 2633.66, nikkeiYearEnd: 23848, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1991: { djiaYearEnd: 3168.83, nikkeiYearEnd: 22983.77, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1992: { djiaYearEnd: 3301.11, nikkeiYearEnd: 16924, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1993: { djiaYearEnd: 3754.09, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1994: { djiaYearEnd: 3834.44, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1995: { djiaYearEnd: 5117.12, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1996: { djiaYearEnd: 6448.26, nikkeiYearEnd: 19361.35, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1997: { djiaYearEnd: 7908.24, nikkeiYearEnd: 15258, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1998: { djiaYearEnd: 9181.43, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  1999: { djiaYearEnd: 11497.12, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2000: { djiaYearEnd: 10786.85, nikkeiYearEnd: 13785, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2001: { djiaYearEnd: 10021.57, nikkeiYearEnd: 10542.62, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2002: { djiaYearEnd: 8341.63, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2003: { djiaYearEnd: 10453.92, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2004: { djiaYearEnd: 10783.01, nikkeiYearEnd: 11488.76, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2005: { djiaYearEnd: 10717.5, nikkeiYearEnd: 16111.43, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2006: { djiaYearEnd: 12463.15, nikkeiYearEnd: 17225.83, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2007: { djiaYearEnd: 13264.82, nikkeiYearEnd: 15307.78, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2008: { djiaYearEnd: 8776.39, nikkeiYearEnd: 8859.56, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2009: { djiaYearEnd: 10428.05, nikkeiYearEnd: null, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2010: { djiaYearEnd: 11577.51, nikkeiYearEnd: 10228.92, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2011: { djiaYearEnd: 12217.56, nikkeiYearEnd: 8455.35, japanUrbanLandIndex: null, bitcoinUsdYearEnd: null },
  2012: { djiaYearEnd: 13104.14, nikkeiYearEnd: 10395.18, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 13.5 },
  2013: { djiaYearEnd: 16576.66, nikkeiYearEnd: 16291.31, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 754 },
  2014: { djiaYearEnd: 17823.07, nikkeiYearEnd: 17450.77, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 320 },
  2015: { djiaYearEnd: 17425.03, nikkeiYearEnd: 19033.71, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 430.57 },
  2016: { djiaYearEnd: 19762.6, nikkeiYearEnd: 19114.37, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 963.74 },
  2017: { djiaYearEnd: 24719.22, nikkeiYearEnd: 22764.94, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 14156 },
  2018: { djiaYearEnd: 23327.46, nikkeiYearEnd: 20014.77, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 3742.7 },
  2019: { djiaYearEnd: 28538.44, nikkeiYearEnd: 23656.62, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 7193 },
  2020: { djiaYearEnd: 30606.48, nikkeiYearEnd: 27444.17, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 29001.72 },
  2021: { djiaYearEnd: 36338.3, nikkeiYearEnd: 28791.71, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 46306 },
  2022: { djiaYearEnd: 33147.25, nikkeiYearEnd: 26094.5, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 16547 },
  2023: { djiaYearEnd: 37689.54, nikkeiYearEnd: 33464.17, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 42255.12 },
  2024: { djiaYearEnd: 42544.22, nikkeiYearEnd: 39894.54, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 93429 },
  2025: { djiaYearEnd: 48063.29, nikkeiYearEnd: 50339.48, japanUrbanLandIndex: null, bitcoinUsdYearEnd: 87501.95 },
};

export const ASSET_SERIES_NOTES =
  '株式（DJIA年末終値）は複数の独立系列で一致を確認した確証値（1994年以降は毎年収録）。日本株（日経平均）は東証再開1949年5月以降が対象（取引所閉鎖の1945–1949年4月はN/A）。' +
  '各年確定値のうち独立2源以上で一致を確認できた年のみ収録し、集約サイトが403等で二重確認できなかった年（1993・1994・1995・1998・1999・2002・2003・2009など）はnull（捏造回避）。' +
  '不動産（市街地価格指数, 日本不動産研究所が3月末・9月末の半期で公表, 全国/六大都市/六大都市以外・用途別の系列あり, 全国平均は1991年がピーク）は、年次の確定指数値が専門統計（有料冊子・統計局Excel）にのみ存在しWeb検索では独立2源照合ができないため全年null（捏造回避）。' +
  'なお基準時点は系列により異なり、戦前基準「1936年9月=100」と現行公表系列「2000年3月末=100」は別物のため、数値を追補する際は基準の取り違えに注意（一次資料: 日本不動産研究所 reinet.or.jp, 総務省統計局 g4217, 国立国会図書館リサーチ・ナビ）。' +
  '仮想通貨はビットコイン稼働開始（2009年1月）・市場価格成立（2010年）以前は存在せずN/A。2012年以降の年末値を収録するが、ビットコインには公的な単一の引け値が存在せず取引所・指数により数%の幅があるため、独立複数源が概ね一致した代表的な年末スポット値（概数）である点に留意。値が得られ次第、確証のうえ追補する。';

export const ASSET_SERIES_SOURCES: EconHistorySource[] = [
  { url: 'https://www.measuringworth.com/datasets/DJA/index.php', type: 'academic', label: 'MeasuringWorth — Dow Jones Average 日次/月次終値データセット' },
  { url: 'https://fred.stlouisfed.org/series/M1109BUSM293NNBR', type: 'government', label: 'FRED, St. Louis Fed — Dow-Jones Industrial Stock Price Index' },
  { url: 'https://indexes.nikkei.co.jp/atoz/2016/06/1950s.html', type: 'reference', label: '日経平均プロフィル — 算出開始1950/9/7・1949/5/16へ遡及（日本株の起点）' },
  { url: 'https://www.reinet.or.jp/?page_id=168', type: 'government', label: '日本不動産研究所 — 市街地価格指数・全国木造建築費指数（戦前基準1936/9=100と現行基準2000/3末=100の併載元）' },
  { url: 'https://www.stat.go.jp/data/nihon/g4217.html', type: 'government', label: '総務省統計局 日本の統計 — 市街地価格指数（全用途平均, 2000/3末=100系列の確定値Excel所在）' },
  { url: 'https://ndlsearch.ndl.go.jp/rnavi/business/post_102136', type: 'government', label: '国立国会図書館リサーチ・ナビ — 市街地価格指数の調べ方（戦前基準系列・印刷統計書の案内）' },
  { url: 'https://www.britannica.com/biography/Satoshi-Nakamoto', type: 'reference', label: 'Encyclopaedia Britannica — Satoshi Nakamoto（ビットコイン2009年稼働開始）' },
];
// Stryker restore all
