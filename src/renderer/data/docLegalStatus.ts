/**
 * 書類スタジオの各書式が「法律で作成・保存を義務づけられているか」の仕分け。
 *
 * ## なぜ 2 分にしないか
 *
 * 「法定 / 任意」の 2 値にすると、**一定の場合にだけ義務になるもの**を
 * どちらかに寄せることになり、どちらへ寄せても誤りになる。
 *
 * - 36協定は、時間外労働をさせないなら不要。常に「法定」と出すのは嘘
 * - 就業規則は常時10人以上の事業場で義務。常に「任意」と出すのも嘘
 *
 * そこで 3 段階にする:
 * - `mandatory`   … 該当する事業なら必ず作成・保存の義務がある
 * - `conditional` … 一定の場合にだけ義務になる（`when` に条件を書く）
 * - `optional`    … 法律上の作成義務はない実務上の雛形
 *
 * さらに `unclassified` を持つ。**新しい書式を足して仕分けを忘れたときに
 * 「任意」として黙って混ぜないため**で、画面には「未分類」と出る。
 * `__tests__/docLegalStatus.test.ts` が全書式の分類を強制するので、
 * 通常はここに落ちない（落ちたら仕分け漏れ）。
 *
 * ## 根拠について
 *
 * `basis` は条文まで書く。**推測で「法定」と付けない。** 各書式の `note`
 * に既に検証済みの条文があるものはそこから採り、無いものは optional に
 * 倒している（義務があるのに任意と出す方が、逆より害が小さいとは限らない
 * ので、`caveat` に「義務ではないが実務上こうなる」を書く）。
 *
 * 保存期間は誤りやすいので、分かっているものだけ `retention` に書く。
 * 労基法109条の帳簿は **5年（附則143条により当分の間3年）** で、
 * 年次有給休暇管理簿だけは根拠が施行規則24条の7で **3年**。ここは
 * 混同されやすいので個別に持たせている。
 */

export type LegalStatus = 'mandatory' | 'conditional' | 'optional' | 'unclassified';

export interface DocLegalInfo {
  readonly status: LegalStatus;
  /** 根拠条文。mandatory / conditional では必ず書く。 */
  readonly basis?: string;
  /** conditional のとき、どういう場合に義務になるか。 */
  readonly when?: string;
  /** 保存期間（確認できているものだけ）。 */
  readonly retention?: string;
  /** 一言でまとめると誤解される点。 */
  readonly caveat?: string;
}

const LABOR_BOOK_RETENTION = '5年（労働基準法109条。附則143条により当分の間3年）';

/**
 * 書式 id → 法的な位置づけ。
 *
 * 定款・就業規則・決算書は `STUDIO_TEMPLATES` と別のコレクションだが、
 * **いちばん「法定」らしい書類がここに居る**ので同じ表に載せる
 * （計算書類が仕分けから漏れると、法定だけを見たい人に届かない）。
 */
export const DOC_LEGAL_STATUS: Readonly<Record<string, DocLegalInfo>> = {
  // --- 契約 ---
  nda: {
    status: 'optional',
    caveat: '締結義務はないが、不正競争防止法上の営業秘密は「秘密として管理されている」ことが要件で、その管理措置の一つになる。',
  },
  gyomu: {
    status: 'conditional',
    basis: 'フリーランス新法3条',
    when: '従業員を使用しない個人等（特定受託事業者）へ業務委託するとき、取引条件の明示が義務。',
  },
  roudou: {
    status: 'mandatory',
    basis: '労働基準法15条1項・同施行規則5条',
    caveat: '労働条件の明示は義務で、賃金・労働時間・就業場所と業務の変更の範囲など一部は書面等での明示が必要。書式の名称は問わない。',
  },
  seiyaku: { status: 'optional' },
  baibai: { status: 'optional' },
  chintai: { status: 'optional' },
  shohi: {
    status: 'optional',
    caveat: '作成義務はないが、書面がないと貸付けの事実と条件の立証が難しい。',
  },
  oboegaki: { status: 'optional' },
  'kojin-itaku': {
    status: 'conditional',
    basis: '個人情報保護法25条',
    when: '個人データの取扱いを委託するとき、委託先を監督する義務がある（覚書はその手段の一つ）。',
  },

  // --- 経理 ---
  mitsumori: { status: 'optional' },
  hacchu: {
    status: 'conditional',
    basis: '取適法（旧下請法）3条',
    when: '対象となる委託取引では、給付の内容・代金額・支払期日等を記載した書面等の交付が義務。',
  },
  invoice: {
    status: 'conditional',
    basis: '消費税法57条の4',
    when: '適格請求書発行事業者が課税事業者から求められたとき、交付が義務。写しの保存義務もある。',
  },
  ryoshu: {
    status: 'conditional',
    basis: '民法486条',
    when: '弁済をした者から請求があったとき、受取証書の交付義務がある。',
  },
  'chuumon-uke': { status: 'optional' },
  nouhin: { status: 'optional' },
  kenshu: { status: 'optional' },
  shiharai: {
    status: 'conditional',
    basis: '消費税法30条9項3号',
    when: '仕入明細書として仕入税額控除を受けるには、相手方の確認を受けたものである必要がある。',
  },

  // --- 組織 ---
  sokai: {
    status: 'mandatory',
    basis: '会社法318条',
    retention: '本店に10年（写しは支店に5年）',
    caveat: '議事録の作成自体が義務で、決議の有無にかかわらず作成する。',
  },
  'rinji-sokai': {
    status: 'mandatory',
    basis: '会社法318条',
    retention: '本店に10年（写しは支店に5年）',
  },
  torishimari: {
    status: 'mandatory',
    basis: '会社法369条3項・371条',
    retention: '本店に10年',
    caveat: '出席した取締役・監査役の署名または記名押印が必要。',
  },
  inin: {
    status: 'optional',
    caveat: '議決権の代理行使は認められるが、委任状という書式の作成義務ではない。',
  },
  shoshu: {
    status: 'conditional',
    basis: '会社法299条・300条',
    when: '株主総会の招集通知は原則必要。ただし株主全員の同意があるときは招集手続を省略できる（書面投票等を定めた場合を除く）。',
  },
  shunin: {
    status: 'conditional',
    basis: '商業登記法54条',
    when: '役員変更の登記を申請するとき、添付書面として必要になる。',
  },
  'kabunushi-meibo': {
    status: 'mandatory',
    basis: '会社法121条・125条',
    caveat: '作成義務に加え、本店（株主名簿管理人があればその営業所）への備置と、株主・債権者の閲覧謄写請求への対応義務がある。',
  },

  // --- 規程 ---
  privacy: {
    status: 'conditional',
    basis: '個人情報保護法32条',
    when: '個人情報取扱事業者は利用目的等を本人の知り得る状態に置く必要がある。「プライバシーポリシー」という形式が指定されているわけではない。',
  },
  chingin: {
    status: 'conditional',
    basis: '労働基準法89条2号',
    when: '就業規則の作成義務がある事業場（常時10人以上）では、賃金に関する事項は必ず記載する（別規程にすることも可）。',
  },
  security: { status: 'optional' },
  harassment: {
    status: 'conditional',
    basis: '男女雇用機会均等法11条・労働施策総合推進法30条の2',
    when: '事業主には方針の明確化と周知・啓発を含む雇用管理上の措置義務がある。規程という形式は指定されていない。',
  },

  // --- 人事 ---
  naitei: {
    status: 'optional',
    caveat: '通知書の作成義務はないが、内定により労働契約が成立すると解されるため、労働条件の明示は別途必要。',
  },
  mimoto: {
    status: 'optional',
    caveat: '徴求義務はないが、締結するなら極度額の定めがないと無効（民法465条の2）。',
  },
  saburoku: {
    status: 'conditional',
    basis: '労働基準法36条1項',
    when: '法定労働時間を超えて、または法定休日に労働させるとき。締結だけでなく所轄労働基準監督署長への届出が必要。',
    caveat: '本書式は協定書の雛形で、届出には様式第9号（特別条項は9号の2）を使う。',
  },
  'kaiko-yokoku': {
    status: 'conditional',
    basis: '労働基準法20条',
    when: '解雇するときは30日前の予告か、30日分以上の平均賃金（解雇予告手当）の支払が必要。',
  },
  'taishoku-shomei': {
    status: 'conditional',
    basis: '労働基準法22条1項',
    when: '退職した労働者から請求があったとき、遅滞なく交付する義務がある。',
  },
  'taishoku-himitsu': { status: 'optional' },
  'roudousha-meibo': {
    status: 'mandatory',
    basis: '労働基準法107条・同施行規則53条',
    retention: LABOR_BOOK_RETENTION,
    caveat: '法定三帳簿の一つ。日雇労働者を除く全労働者が対象で、パート・アルバイトも含む。',
  },
  'chingin-daichou': {
    status: 'mandatory',
    basis: '労働基準法108条・同施行規則54条',
    retention: LABOR_BOOK_RETENTION,
    caveat: '法定三帳簿の一つ。給与明細を綴じただけでは記載事項を満たさないことがある。',
  },
  shukkinbo: {
    status: 'mandatory',
    basis: '労働基準法109条・労働安全衛生法66条の8の3',
    retention: LABOR_BOOK_RETENTION,
    caveat: '労働基準法が名指しで定める帳簿ではないが、「労働関係に関する重要な書類」として保存義務の対象。労働時間の状況の把握自体が義務で、管理監督者も対象。',
  },
  'yukyu-kanribo': {
    status: 'mandatory',
    basis: '労働基準法施行規則24条の7',
    retention: '3年（有給休暇を与えた期間中および満了後3年間）',
    caveat: '保存期間の根拠が労働基準法109条とは別で3年。年10日以上付与される労働者に5日取得させる義務（労基法39条7項）に違反すると罰則の対象。',
  },

  // --- 社内（いずれも法律上の作成義務はない） ---
  ringi: { status: 'optional' },
  gijiroku: {
    status: 'optional',
    caveat: '社内会議の議事録に作成義務はない。株主総会・取締役会の議事録は別（そちらは法定）。',
  },
  keihi: { status: 'optional' },
  shucchou: { status: 'optional' },
  houkoku: { status: 'optional' },

  // --- 通知 ---
  tokusoku: { status: 'optional' },
  naiyo: {
    status: 'optional',
    caveat: '内容証明という形式に義務はないが、催告の到達と内容を証明する手段になる。',
  },
  kaijo: {
    status: 'optional',
    caveat: '解除には相手方への意思表示が必要（民法540条1項）で、書面はその手段。書面自体が義務づけられているわけではない。',
  },
  annai: { status: 'optional' },

  // --- 事業計画（いずれも任意。融資・補助金の審査で求められることはある） ---
  'plantfactory-plan': { status: 'optional' },
  'plantfactory-funding': { status: 'optional' },
  'jigyo-keikaku': { status: 'optional' },
  'chotatsu-keikaku': { status: 'optional' },
  'shikin-guri': { status: 'optional' },

  // --- 別コレクション（定款 / 就業規則 / 決算書） ---
  'teikan-kk': {
    status: 'mandatory',
    basis: '会社法26条・30条',
    caveat: '発起人が作成し、公証人の認証を受けなければ効力を生じない（株式会社）。',
  },
  'teikan-gk': {
    status: 'mandatory',
    basis: '会社法575条',
    caveat: '社員が作成する。合同会社では公証人の認証は不要。',
  },
  shugyo: {
    status: 'conditional',
    basis: '労働基準法89条・90条',
    when: '常時10人以上の労働者を使用する事業場では作成と労働基準監督署長への届出が義務（過半数代表者等の意見聴取も必要）。',
  },
  kessan: {
    status: 'mandatory',
    basis: '会社法435条2項・4項',
    retention: '10年',
    caveat: '各事業年度に係る計算書類（貸借対照表・損益計算書・株主資本等変動計算書・個別注記表）と事業報告の作成義務。',
  },
};

const UNCLASSIFIED: DocLegalInfo = { status: 'unclassified' };

/**
 * 書式 id の法的な位置づけ。
 *
 * 表に無い id は **`optional` に倒さず `unclassified` を返す**。
 * 仕分けを忘れた新しい書式が「任意」として黙って混ざると、
 * 法定のものを見落とす側の誤りになる。
 */
export function legalStatusOf(docId: string): DocLegalInfo {
  return DOC_LEGAL_STATUS[docId] ?? UNCLASSIFIED;
}

export const STATUS_LABEL: Readonly<Record<LegalStatus, string>> = {
  mandatory: '法定',
  conditional: '条件付き',
  optional: '任意',
  unclassified: '未分類',
};

export const STATUS_DESCRIPTION: Readonly<Record<LegalStatus, string>> = {
  mandatory: '法律で作成・保存が義務づけられています',
  conditional: '一定の場合に義務になります',
  optional: '法律上の作成義務はありません（実務上の雛形）',
  unclassified: '仕分けがされていません（不具合です）',
};

/** 並べ替え・絞り込みの表示順。義務の重い順。 */
export const STATUS_ORDER: readonly LegalStatus[] = [
  'mandatory',
  'conditional',
  'optional',
  'unclassified',
];

export function statusRank(status: LegalStatus): number {
  return STATUS_ORDER.indexOf(status);
}

/** id の集合を法的位置づけごとに数える。 */
export function countByStatus(docIds: readonly string[]): Record<LegalStatus, number> {
  const out: Record<LegalStatus, number> = {
    mandatory: 0,
    conditional: 0,
    optional: 0,
    unclassified: 0,
  };
  for (const id of docIds) out[legalStatusOf(id).status] += 1;
  return out;
}

/** 保存期間が分かっている書式（法定帳簿の保存漏れが実務でいちばん多いため）。 */
export function retentionOf(docId: string): string | null {
  return legalStatusOf(docId).retention ?? null;
}
