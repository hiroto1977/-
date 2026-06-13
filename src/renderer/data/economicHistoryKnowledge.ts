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
