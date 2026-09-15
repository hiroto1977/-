/**
 * Team members — persisted in the local record store (collection
 * `team-members`). Validation + role/email parsing live here; seat-limit and
 * permission rules come from the pure `shared/team.ts` model. Consumed in the
 * renderer via `useCollection(MEMBERS_COLLECTION)`.
 */
import { isRole, ROLE_ORDER, type Role } from '../../shared/team';

export const MEMBERS_COLLECTION = 'team-members';

export interface Member extends Record<string, unknown> {
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}

/** Permissive but sane email check — we only persist it, never send mail. */
function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

export function parseMember(input: { name?: unknown; email?: unknown; role?: unknown }): Member {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0 || name.length > 64) throw new Error('氏名は 1〜64 文字で入力してください');

  // 非文字列時のフォールバックは何であれ isEmail で false になり同じエラーになるため、
  // '' の StringLiteral mutation は equivalent。
  // Stryker disable next-line StringLiteral
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (!isEmail(email)) throw new Error('メールアドレスの形式が正しくありません');

  if (!isRole(input.role)) throw new Error('役割が不正です');

  return { name, email, role: input.role };
}

/** Count owners in a member list (for the "last owner" guard). */
export function countOwners(members: readonly Member[]): number {
  return members.reduce((acc, m) => acc + (m.role === 'owner' ? 1 : 0), 0);
}

// ===========================================================================
// round 76: 人員・組織分析の精緻化 (加算的) — 既存式・既存テスト期待値は不変。
// 労働生産性 (一人当たり売上/営業利益/付加価値) / 人件費率 / 労働分配率 /
// 人員構成 (ロール別構成比・シート充足率・空席数) / 増員余地を追加。
// すべて純粋関数。売上・人件費・付加価値・人数・上限は引数で受ける。
// 分母 0・負・非有限・空は null / 専用ラベルでガードする。
//
// **重要 — これは概算の人事・組織分析であり、人事/財務助言ではありません。**
// しきい値・目安は業種・規模・雇用形態で適正値が異なります。付加価値・人件費の
// 定義 (会計基準) によって労働分配率は変動するため、社内の定義に合わせて解釈して
// ください。
// ===========================================================================

/**
 * 人事・組織分析の入力。金額は円、人数は人。
 * `headcount` は在籍人数 (分母)。`seatLimit` はプランのシート上限 (任意)。
 */
export interface WorkforceInput {
  /** 在籍人数 (人)。0/負/非有限は一人当たり指標を null にする。 */
  readonly headcount: number;
  /** 売上高 (円)。一人当たり売上高・人件費率に使う。 */
  readonly revenue: number;
  /** 営業利益 (円。損失はマイナス可)。一人当たり営業利益に使う。 */
  readonly operatingProfit: number;
  /** 付加価値 (円)。一人当たり付加価値・労働分配率に使う。 */
  readonly valueAdded: number;
  /** 人件費 (円)。人件費率・労働分配率・増員必要売上に使う。 */
  readonly laborCost: number;
}

/** 人事・組織分析の結果。比率は %、金額は円。算定不能は null。 */
export interface WorkforceMetrics {
  /** 一人当たり売上高 (円) = 売上 ÷ 人数 (人数 ≤ 0 なら null)。 */
  readonly revenuePerHead: number | null;
  /** 一人当たり営業利益 (円) = 営業利益 ÷ 人数 (損失も反映。人数 ≤ 0 なら null)。 */
  readonly operatingProfitPerHead: number | null;
  /** 一人当たり付加価値 (円) = 付加価値 ÷ 人数 (人数 ≤ 0 なら null)。 */
  readonly valueAddedPerHead: number | null;
  /** 人件費率 (%) = 人件費 ÷ 売上 (売上 ≤ 0 なら null)。低いほど効率的。 */
  readonly laborCostRatioPct: number | null;
  /** 労働分配率 (%) = 人件費 ÷ 付加価値 (付加価値 ≤ 0 なら null)。50〜60% が一般的目安。 */
  readonly laborSharePct: number | null;
}

/** 算定不能なら null を返す除算 (分母が有限かつ正のときのみ)。円は四捨五入で整数。 */
const perHead = (numer: number, headcount: number): number | null =>
  Number.isFinite(numer) && Number.isFinite(headcount) && headcount > 0
    ? Math.round(numer / headcount)
    : null;

/** 算定不能なら null を返す百分率 (分母が有限かつ正のときのみ)。小数第 1 位まで。 */
const ratioPct = (numer: number, denom: number): number | null =>
  Number.isFinite(numer) && Number.isFinite(denom) && denom > 0
    ? Math.round((numer / denom) * 1000) / 10
    : null;

/**
 * 労働生産性・人件費効率を計算する。人数・売上・付加価値が 0/負/非有限なら
 * 該当指標を null にする (営業利益・人件費は損失/0 も許容するため分子側では弾かない)。
 */
export function computeWorkforceMetrics(input: WorkforceInput): WorkforceMetrics {
  return {
    revenuePerHead: perHead(input.revenue, input.headcount),
    operatingProfitPerHead: perHead(input.operatingProfit, input.headcount),
    valueAddedPerHead: perHead(input.valueAdded, input.headcount),
    laborCostRatioPct: ratioPct(input.laborCost, input.revenue),
    laborSharePct: ratioPct(input.laborCost, input.valueAdded),
  };
}

/** ロール別の人員構成 (在籍数と構成比)。 */
export interface RoleComposition {
  readonly role: Role;
  /** 当該ロールの在籍数 (人)。 */
  readonly count: number;
  /** 全在籍に対する構成比 (%)。在籍 0 なら null。 */
  readonly sharePct: number | null;
}

/**
 * メンバー一覧からロール別構成比を計算する。順序は ROLE_ORDER (member→admin→owner)
 * に固定。在籍 0 のロールも count 0 / sharePct null で必ず含める (全ロール網羅)。
 */
export function roleComposition(members: readonly Member[]): readonly RoleComposition[] {
  const total = members.length;
  return ROLE_ORDER.map((role) => {
    const count = members.reduce((acc, m) => acc + (m.role === role ? 1 : 0), 0);
    return { role, count, sharePct: ratioPct(count, total) };
  });
}

/** シート充足状況 (在籍 vs プラン上限)。 */
export interface SeatUtilization {
  /** 在籍人数 (人)。負/非有限は 0 に丸める。 */
  readonly used: number;
  /** プラン上限 (人。無制限は Infinity)。 */
  readonly limit: number;
  /** 充足率 (%) = 在籍 ÷ 上限 (上限 ≤ 0 または無制限なら null)。 */
  readonly fillRatePct: number | null;
  /** 空席数 (人) = 上限 − 在籍 (0 未満は 0 にクランプ。無制限は Infinity)。 */
  readonly openSeats: number;
  /** 上限に達している (空席 0 かつ有限上限) か。 */
  readonly atCapacity: boolean;
}

/**
 * 在籍人数とプラン上限からシート充足率・空席数を計算する。
 * 上限 ≤ 0 / NaN / -Infinity は「未設定」とみなし充足率 null・空席 0・atCapacity false。
 * 上限 Infinity (無制限) は充足率 null・空席 Infinity・atCapacity false。
 */
export function seatUtilization(used: number, limit: number): SeatUtilization {
  // used > 0 のときだけ採用。それ以外 (0/負/NaN/Infinity) は 0。`>= 0` への変異は used=0 でも
  // then 分岐が 0 を返し else (0) と同値になるため runtime-equivalent (`< 0` は正の在籍を 0 に
  // するため通常ケースで殺せる)。
  // Stryker disable next-line EqualityOperator
  const safeUsed = Number.isFinite(used) && used > 0 ? used : 0;
  // limit が非有限のうち Infinity だけ無制限として通す。NaN/-Infinity は 0 (未設定) に寄せる。
  // `>= 0` への変異は limit=0 でも then 分岐が 0 を返し else (0) と同値で runtime-equivalent。
  // Stryker disable next-line EqualityOperator
  const safeLimit = limit === Infinity ? Infinity : Number.isFinite(limit) && limit > 0 ? limit : 0;
  // safeLimit=Infinity でも Math.max(0, Infinity - safeUsed) = Infinity となるため Infinity の
  // 特例分岐は不要 (簡約して equivalent mutant を排除)。
  const openSeats = Math.max(0, safeLimit - safeUsed);
  return {
    used: safeUsed,
    limit: safeLimit,
    // ratioPct は分母 ≤ 0/非有限を null にするため、Infinity (無制限) も自動で null。
    fillRatePct: ratioPct(safeUsed, safeLimit),
    openSeats,
    // 有限上限 (>0) かつ空席 0 のみ満席。Infinity は openSeats=Infinity≠0 で自然に false に
    // なるため、`safeLimit !== Infinity` ガードは冗長 (削除して equivalent mutant を排除)。
    atCapacity: safeLimit > 0 && openSeats === 0,
  };
}

/**
 * 1 名増員に必要な年間売上を逆算する (概算)。
 * 増員 1 名の人件費 (`perHeadLaborCost`) を現状の人件費率で割り戻す:
 *   必要売上 = 1名あたり人件費 ÷ 人件費率、人件費率 = laborCost ÷ revenue。
 * 売上 ≤ 0・人件費 ≤ 0・1名人件費 ≤ 0・非有限は逆算不能なので null。
 */
export function revenueNeededForHire(input: {
  revenue: number;
  laborCost: number;
  perHeadLaborCost: number;
}): number | null {
  const { revenue, laborCost, perHeadLaborCost } = input;
  if (
    !Number.isFinite(revenue) ||
    !Number.isFinite(laborCost) ||
    !Number.isFinite(perHeadLaborCost)
  )
    return null;
  if (revenue <= 0 || laborCost <= 0 || perHeadLaborCost <= 0) return null;
  const laborCostRatio = laborCost / revenue;
  // laborCostRatio は laborCost>0 かつ revenue>0 のとき必ず正なので除算は安全。
  return Math.round(perHeadLaborCost / laborCostRatio);
}

// --- 同じメールアドレスの重複 (パス 125) ---------------------------------------

/**
 * **メンバーはメールアドレスが 1 人の単位。** 同じ人を 2 度招待すると `members.length` が 1 増え、
 * シートを 2 つ使い、一人当たりの金額 (売上高・営業利益・人件費 = 累計 ÷ 従業員数) が薄まって
 * 金融機関等提出用の書面 §3「従業員数 (登録メンバー数)」まで届く。氏名に「編集」は無く (役割だけ
 * 一覧で変えられる)、訂正は × で消してから入れ直す —— 先に入れ直すと 2 人になる。
 *
 * 鍵はメールアドレスの前後の空白を落として**小文字**にしたもの。ドメイン部は大文字小文字を
 * 区別しない (RFC 5321)。ローカル部は規格上は区別しうるが、実際の受信側はほぼ区別しないので
 * 「別人」とは扱わない (同じ人を 2 度数える方が重い)。
 */
export function memberKey(m: Pick<Member, 'email'>): string {
  return m.email.trim().toLowerCase();
}

/** 同じメールアドレスのメンバーが既に在ればそれを返す (無ければ null)。画面が招待を断る判断。 */
export function sameEmailMember(existing: readonly Member[], candidate: Pick<Member, 'email'>): Member | null {
  const key = memberKey(candidate);
  return existing.find((m) => memberKey(m) === key) ?? null;
}

/** 同じメールアドレスが 2 件以上ある組。 */
export interface DuplicateMemberGroup {
  /** 鍵 (前後の空白を落とした小文字)。 */
  readonly email: string;
  /** その組の件数 (2 以上)。 */
  readonly count: number;
}

/**
 * 既に在る重複 (件数 2 以上の組) をメールアドレスの昇順で返す。無ければ空。
 * メールの無い控え (役割だけの射影) は数えない —— 経営サマリーの入力は役割だけの形も受ける。
 */
export function findDuplicateMembers(members: readonly { readonly email?: string }[]): DuplicateMemberGroup[] {
  const counts = new Map<string, number>();
  for (const m of members) {
    if (typeof m.email !== 'string') continue;
    const key = memberKey({ email: m.email });
    if (key.length === 0) continue;
    const prev = counts.get(key);
    counts.set(key, prev === undefined ? 1 : prev + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([email, count]) => ({ email, count }));
}

/** 同じメールアドレスの招待を断るときの文。訂正の道 (× で消してから) を言う。 */
export function duplicateMemberMessage(existing: Member): string {
  return `${existing.email} は「${existing.name}」として既に登録されています。氏名を直すときは一覧の × で消してから入れ直してください（役割は一覧で変えられます。同じ人を 2 度登録するとシートを 2 つ使い、一人当たりの金額が薄まります）。`;
}

const listMemberGroups = (groups: readonly DuplicateMemberGroup[]): string =>
  groups.map((g) => `${g.email} ×${g.count}`).join('、');

/** 一覧の上の警告 (既に重複が在るとき)。無ければ null。 */
export function duplicateMembersNote(groups: readonly DuplicateMemberGroup[]): string | null {
  if (groups.length === 0) return null;
  return `同じメールアドレスのメンバーが ${groups.length} 組重複しており、従業員数に 2 度数えられています（${listMemberGroups(groups)}）。一覧の × で余分な行を消してください。`;
}

/** 書面 §3 の但し書き (**相手に渡る面**)。無ければ null。 */
export function duplicateMembersSheetNote(groups: readonly DuplicateMemberGroup[]): string | null {
  if (groups.length === 0) return null;
  return `登録メンバーに同じメールアドレスの重複が ${groups.length} 組あり（${listMemberGroups(groups)}）、従業員数と一人当たりの金額はその重複を含んだ値です。`;
}
