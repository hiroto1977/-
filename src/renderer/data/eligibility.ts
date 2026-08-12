/**
 * 就農・農業支援制度の適用判定。
 *
 * 年齢や事業形態などを入れると、使える制度・使えない制度を理由つきで返す。
 *
 * ## 判定は 3 値にする（ここが設計の要）
 *
 * 「対象 / 対象外」の 2 値にすると、**判定に要る入力が足りていないのに
 * 満たしたことにしてしまう**。年齢が未入力なら年齢要件は判定できないし、
 * 前提となる認定を受けているかは本人にしか分からない。分からないものを
 * 「対象」と言い切ると、取れない資金を前提に資金計画を立てさせることになる。
 *
 * そこで 3 値を返す:
 * - `eligible`   … 入力から判定できる要件をすべて満たす（＝申請できる）
 * - `needsCheck` … 判定に要る入力が足りず、決められない
 * - `ineligible` … 要件を満たさない
 *
 * **`reviewChecks`（審査で見られる要件）は判定を下げない。** ここを
 * 「確認が要る＝要確認」に倒すと、どの制度にも審査があるので全部が
 * 要確認になり、**何も答えない道具**になる。審査の存在は判定ではなく
 * 情報として各制度に添える。
 *
 * ## 前提となる認定は、年齢で取れないなら「対象外」まで伝える
 *
 * 青年等就農資金は年齢要件を持たないが、**認定新規就農者であること**を
 * 前提にし、その認定自体が 18 歳以上 65 歳未満を要件にする。前提を
 * 「未確認」で止めると、65 歳以上の人に「確認すれば使えるかもしれない」と
 * 見せてしまう。前提の年齢要件まで辿って `ineligible` にする。
 *
 * ## 性別について
 *
 * 入力として受け取るが、**ここに収録した農業系の制度はいずれも性別を
 * 要件にしていない**。要件が無いことを明示するのも情報なので、
 * 「性別要件なし」と表示できるようにしてある。地域の起業支援などには
 * 「若者・女性」を対象とするものが実在するため、構造としては
 * 性別条件を持てるようにしてあるが、**根拠のない性別要件は入れない**。
 *
 * 出典は各ルールに URL を持たせ、画面から辿れるようにする。
 */

export type Gender = 'male' | 'female' | 'other' | 'unspecified';
export type Entity = 'individual' | 'corporation';

export interface ApplicantProfile {
  /** 年齢（就農時点）。未入力は null。 */
  readonly age: number | null;
  readonly gender: Gender;
  /** 個人か法人か。 */
  readonly entity: Entity;
  /** 商工業その他の事業の経営管理に従事した年数。未入力は null。 */
  readonly managementYears: number | null;
  /** 認定農業者の認定を受けているか。未回答は null。 */
  readonly certifiedFarmer: boolean | null;
  /** 認定新規就農者（青年等就農計画の認定）を受けているか。未回答は null。 */
  readonly certifiedNewFarmer: boolean | null;
}

export type Verdict = 'eligible' | 'needsCheck' | 'ineligible';

export interface ProgramJudgement {
  readonly id: string;
  readonly name: string;
  readonly authority: string;
  readonly verdict: Verdict;
  /** 判定の理由。満たした要件・満たさない要件・足りない入力を並べる。 */
  readonly reasons: readonly string[];
  /** 審査で見られる要件。**判定は下げない**（情報として添えるだけ）。 */
  readonly reviewChecks: readonly string[];
  /** この制度が年齢を要件にしているか（していないことも情報）。 */
  readonly ageRequirement: string;
  readonly sourceUrl: string;
}

/**
 * 年齢要件。**3 つの境界をすべて数値で持ち、省略可にしない。**
 *
 * `min?: number` にすると `min !== undefined && age < min` のようなガードが要る。
 * ところが `age < undefined` は常に false なので、このガードは結果を変えない
 * ＝**テストで殺せない等価な分岐**が残る（mutation で survived として出る）。
 * 「無い境界は ±Infinity」で持てば比較 3 本で済み、分岐そのものが消える。
 */
interface AgeRange {
  /** この歳以上。下限なしは -Infinity。 */
  readonly min: number;
  /** この歳未満。上限なしは Infinity。 */
  readonly lessThan: number;
  /** この歳以下。上限なしは Infinity。 */
  readonly atMost: number;
}

const NO_MIN = -Infinity;
const NO_MAX = Infinity;

/** 「A歳以上B歳未満」。 */
function between(min: number, lessThan: number): AgeRange {
  return { min, lessThan, atMost: NO_MAX };
}
/** 「A歳未満」。 */
function under(lessThan: number): AgeRange {
  return { min: NO_MIN, lessThan, atMost: NO_MAX };
}
/**
 * 「A歳以下」。
 *
 * 「49歳以下」を「50歳未満」に言い換えない。整数の年齢なら同じだが、
 * 49.5 のような入力で答えが変わるうえ、一次資料の文言とずれる。
 */
function upTo(atMost: number): AgeRange {
  return { min: NO_MIN, lessThan: NO_MAX, atMost };
}

function ageText(range: AgeRange | null): string {
  if (range === null) return '年齢要件なし';
  const parts: string[] = [];
  if (range.min > NO_MIN) parts.push(`${range.min}歳以上`);
  if (range.lessThan < NO_MAX) parts.push(`${range.lessThan}歳未満`);
  if (range.atMost < NO_MAX) parts.push(`${range.atMost}歳以下`);
  return parts.join('');
}

function ageFits(age: number, range: AgeRange): boolean {
  return age >= range.min && age < range.lessThan && age <= range.atMost;
}

/** 前提となる認定の種類。 */
export type Prerequisite = 'certifiedFarmer' | 'certifiedNewFarmer';

interface PrerequisiteRule {
  readonly label: string;
  /** その認定を取るための道筋（対象外のときに何が塞がっているかを言うため）。 */
  readonly via: string;
  /** その認定自体の年齢要件。null なら年齢を問わない。 */
  readonly age: AgeRange | null;
}

/**
 * 前提となる認定そのものの要件。
 *
 * 認定新規就農者は青年等就農計画の認定を受けた者で、青年（18歳以上45歳未満）と
 * 特定の知識・技能を有する中高年齢者（45歳以上65歳未満）を合わせて
 * **18歳以上65歳未満**。認定農業者（農業経営改善計画）に年齢の要件は無い。
 */
const PREREQUISITES: Readonly<Record<Prerequisite, PrerequisiteRule>> = {
  certifiedFarmer: {
    label: '認定農業者',
    via: '農業経営改善計画の認定',
    age: null,
  },
  certifiedNewFarmer: {
    label: '認定新規就農者',
    via: '青年等就農計画の認定',
    age: between(18, 65),
  },
};

export interface ProgramRule {
  readonly id: string;
  readonly name: string;
  readonly authority: string;
  readonly sourceUrl: string;
  /** null なら年齢要件が無い（＝上限なし）。 */
  readonly age: AgeRange | null;
  /** 前提となる認定。 */
  readonly requires?: Prerequisite;
  /** 経営管理の従事年数（年）。 */
  readonly minManagementYears?: number;
  /** 審査で見られる要件。判定は下げず、情報として添える。 */
  readonly reviewChecks: readonly string[];
}

/**
 * 収録している制度。
 *
 * **要件は一次資料で確認したものだけを機械判定に載せる。** 確認できて
 * いないもの（法人の上限額など）は判定条件にせず、`reviewChecks` に
 * 出す。推測でルールを書くと、判定が自信満々に外れる。
 */
export const PROGRAM_RULES: readonly ProgramRule[] = [
  {
    id: 'nintei-nogyosha',
    name: '認定農業者（農業経営改善計画）',
    authority: '市町村（農業経営基盤強化促進法）',
    sourceUrl: 'https://www.maff.go.jp/j/kobetu_ninaite/n_seido/seido_ninaite.html',
    age: null,
    reviewChecks: [
      '市町村の基本構想に照らして計画が適切であること',
      '農用地の効率的かつ総合的な利用を図るために適切であること',
      '計画の達成が確実と見込まれること',
    ],
  },
  {
    id: 'seinen-shuno-seinen',
    name: '青年等就農計画（認定新規就農者）／青年の枠',
    authority: '市町村（農業経営基盤強化促進法）',
    sourceUrl: 'https://www.maff.go.jp/j/new_farmer/nintei_syunou.html',
    age: between(18, 45),
    reviewChecks: ['新たに農業経営を営もうとする者であること（就農から原則5年以内を含む）'],
  },
  {
    id: 'seinen-shuno-chukonen',
    name: '青年等就農計画（認定新規就農者）／特定の知識・技能を有する中高年齢者の枠',
    authority: '市町村（農業経営基盤強化促進法）',
    sourceUrl: 'https://www.maff.go.jp/j/new_farmer/nintei_syunou.html',
    age: between(45, 65),
    minManagementYears: 3,
    reviewChecks: ['新たに農業経営を営もうとする者であること（就農から原則5年以内を含む）'],
  },
  {
    id: 'keiei-kaishi-shikin',
    name: '経営開始資金（新規就農者育成総合対策）',
    authority: '農林水産省',
    sourceUrl: 'https://www.maff.go.jp/j/new_farmer/n_syunou/roudou.html',
    age: upTo(49),
    requires: 'certifiedNewFarmer',
    reviewChecks: ['独立・自営就農であること', '市町村の地域計画に位置付けられること'],
  },
  {
    id: 'keiei-hatten',
    name: '経営発展支援事業（新規就農者育成総合対策）',
    authority: '都道府県・農林水産省',
    sourceUrl: 'https://www.maff.go.jp/j/new_farmer/n_syunou/attach/pdf/hatten-57.pdf',
    age: upTo(49),
    requires: 'certifiedNewFarmer',
    reviewChecks: ['都道府県が支援対象として採択すること', '補助対象事業費の上限は年度の要領で要確認'],
  },
  {
    id: 'challenge',
    name: '新規就農者チャレンジ事業',
    authority: '農林水産省',
    sourceUrl: 'https://www.maff.go.jp/j/new_farmer/n_syunou/challenge.html',
    age: under(65),
    requires: 'certifiedNewFarmer',
    reviewChecks: [
      '営農地が属する地域計画が要件（目標集積率など）を満たすこと',
      '補助率 3/10・個人の上限 1,500 万円。法人の上限は年度の要領で要確認',
    ],
  },
  {
    id: 'seinen-shuno-shikin',
    name: '青年等就農資金（無利子）',
    authority: '日本政策金融公庫',
    sourceUrl: 'https://www.maff.go.jp/j/new_farmer/nintei_syunou.html',
    age: null,
    requires: 'certifiedNewFarmer',
    reviewChecks: ['公庫の審査（事業計画・返済計画）', '認定期間内に実行すること'],
  },
  {
    id: 'kindaika',
    name: '農業近代化資金',
    authority: '民間金融機関（利子補給）',
    sourceUrl: 'https://www.maff.go.jp/j/kobetu_ninaite/n_seido/seido_ninaite.html',
    age: null,
    requires: 'certifiedFarmer',
    reviewChecks: ['金融機関の審査', '限度額・償還期間は資金種別ごとに要確認'],
  },
  {
    id: 'kiban-kyoka',
    name: '農業経営基盤強化資金（スーパーL資金）',
    authority: '日本政策金融公庫',
    sourceUrl: 'https://www.maff.go.jp/j/kobetu_ninaite/n_seido/seido_ninaite.html',
    age: null,
    requires: 'certifiedFarmer',
    reviewChecks: ['公庫の審査', '限度額・金利は時点により変動するため要確認'],
  },
];

function heldPrerequisite(p: ApplicantProfile, kind: Prerequisite): boolean | null {
  return kind === 'certifiedFarmer' ? p.certifiedFarmer : p.certifiedNewFarmer;
}

/** 1 制度を判定する。 */
export function judgeProgram(rule: ProgramRule, p: ApplicantProfile): ProgramJudgement {
  const reasons: string[] = [];
  // blocked = 要件を満たさない / unknown = 判定に要る入力が足りない。
  let blocked = false;
  let unknown = false;

  // --- 年齢 ---
  if (rule.age === null) {
    reasons.push('年齢の要件はない（上限なし）');
  } else if (p.age === null) {
    unknown = true;
    reasons.push(`年齢が未入力（要件: ${ageText(rule.age)}）`);
  } else if (ageFits(p.age, rule.age)) {
    reasons.push(`年齢 ${p.age} 歳は要件（${ageText(rule.age)}）を満たす`);
  } else {
    blocked = true;
    reasons.push(`年齢 ${p.age} 歳は要件（${ageText(rule.age)}）を満たさない`);
  }

  // --- 前提となる認定 ---
  // 年齢で既に外れているときは並べない（何を確認しても結論が変わらないため）。
  const kind = rule.requires;
  if (kind !== undefined && !blocked) {
    const pre = PREREQUISITES[kind];
    const held = heldPrerequisite(p, kind);
    if (held === true) {
      reasons.push(`${pre.label}である`);
    } else if (pre.age !== null && p.age !== null && !ageFits(p.age, pre.age)) {
      // 前提の認定そのものが年齢で取れない → 「確認すれば使えるかも」に見せない。
      blocked = true;
      reasons.push(
        `前提の${pre.label}は${ageText(pre.age)}が要件のため、${p.age} 歳では取得できない`,
      );
    } else if (held === false) {
      blocked = true;
      reasons.push(`${pre.label}でない（先に${pre.via}が要る）`);
    } else {
      unknown = true;
      reasons.push(`${pre.label}かどうかが未回答（先に${pre.via}が要る）`);
    }
  }

  // --- 経営管理の従事年数 ---
  const need = rule.minManagementYears;
  if (need !== undefined && !blocked) {
    if (p.managementYears === null) {
      unknown = true;
      reasons.push(`経営管理の従事年数が未入力（要件: ${need}年以上）`);
    } else if (p.managementYears >= need) {
      reasons.push(`経営管理 ${p.managementYears} 年は要件（${need}年以上）を満たす`);
    } else {
      blocked = true;
      reasons.push(`経営管理 ${p.managementYears} 年は要件（${need}年以上）に足りない`);
    }
  }

  const verdict: Verdict = blocked ? 'ineligible' : unknown ? 'needsCheck' : 'eligible';

  return {
    id: rule.id,
    name: rule.name,
    authority: rule.authority,
    verdict,
    reasons,
    // 対象外が確定しているときは審査要件を並べない（結論が変わらないため）。
    reviewChecks: blocked ? [] : rule.reviewChecks,
    ageRequirement: ageText(rule.age),
    sourceUrl: rule.sourceUrl,
  };
}

export interface EligibilityReport {
  readonly judgements: readonly ProgramJudgement[];
  readonly eligible: readonly ProgramJudgement[];
  readonly needsCheck: readonly ProgramJudgement[];
  readonly ineligible: readonly ProgramJudgement[];
  /**
   * 性別を要件にしている制度があったか。**収録範囲では常に false** で、
   * 「性別では絞られない」ことを画面に出すために持つ。
   */
  readonly genderMattered: boolean;
}

/** プロフィールを全制度に通す。 */
export function judgeEligibility(
  p: ApplicantProfile,
  rules: readonly ProgramRule[] = PROGRAM_RULES,
): EligibilityReport {
  const judgements = rules.map((r) => judgeProgram(r, p));
  return {
    judgements,
    eligible: judgements.filter((j) => j.verdict === 'eligible'),
    needsCheck: judgements.filter((j) => j.verdict === 'needsCheck'),
    ineligible: judgements.filter((j) => j.verdict === 'ineligible'),
    genderMattered: false,
  };
}

/**
 * 入力欄の文字列を数値にする。日本語入力の実情に合わせて
 * **全角数字と全角/半角のカンマを受ける**。
 *
 * IME を使うと年齢が「６６」と全角で入ることが普通にある。ここで弾くと
 * 年齢を入れたのに「未入力扱い」になり、判定が動いていないように見える。
 * 空文字・数値でない文字列は `null`（未入力）を返し、**0 に落とさない**
 * — 0 に落とすと「0 歳」として年齢要件を判定してしまう。
 */
export function parseNumericInput(raw: string): number | null {
  const normalized = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，]/g, '')
    .trim();
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
