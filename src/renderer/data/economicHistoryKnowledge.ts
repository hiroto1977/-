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
];
// Stryker restore all
