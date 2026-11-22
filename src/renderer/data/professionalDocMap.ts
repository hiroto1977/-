/**
 * 書類スタジオの書類 → 士業の担当仕分け（主担当・副担当）——「この書類は
 * どの士業が主に担うか」の単一データ源。
 *
 * `businessTriage.ts` は書類→士業の逆引きで、「自社で作っていいか /
 * 他人のために業として行うと独占に触れるか」に答える。だが士業のページで
 * 先に来る問いは向きが違う ——「この士業は、どの書類の主担当か」である。
 * ここはその向きの仕分けを持つ。
 *
 * ## 仕分けの導出（事業仕分けと食い違わせない）
 *
 * 主担当・副担当は、法令検証済みの事業仕分け表 (`TRIAGE_ROWS`) の
 * `exclusiveTo`（独占側）と `consult`（相談先）から導く:
 *
 *   - 独占側に名前があれば、その先頭が主担当。
 *   - 無ければ相談先の先頭が主担当。
 *   - 残りは並び順のまま副担当。
 *   - どちらにも名前が無い書類は「汎用」(`general`) —— 社内文書で、
 *     特定の士業の担当領域に当たらないものだけがここに入る。
 *
 * 表をここに写しはするが、導出どおりであることは
 * `data/__tests__/professionalDocMap.test.ts` が事業仕分け表と両方向に
 * 突き合わせて固定する。片方だけ直すとテストが鳴る。
 *
 * ## 薄い士業は水増ししない
 *
 * 公認会計士と弁理士は主担当 0 件である。公認会計士の独占は法定監査で、
 * 書類スタジオに監査の書式は無い（計算書類は副担当として 1 件関わる）。
 * 弁理士の独占は特許庁への手続代理で、出願書類の書式が無い
 * （秘密保持契約書に副担当として 1 件関わる）。無いものを有るように
 * 見せる仕分けはしない。
 *
 * タイトルとカテゴリはここに複製しない —— `docLabel`（書式一覧と
 * 特別枠の表示名）と `STUDIO_TEMPLATES` の `cat` から引く。
 */

import { lookup } from '../../shared/lookup';
import { docsForProfessional, docLabel, type DocRelation, type OwnUse } from './businessTriage';
import { sheetOfDoc } from './kessanSheets';
import { STUDIO_TEMPLATES } from './docStudioData';
import type { ProfessionalId } from './professionalMap';

/** 書類の主担当。士業 id か、どの士業にも紐付かない「汎用」。 */
export type DocOwner = ProfessionalId | 'general';

/** 担当仕分けの 1 行。 */
export interface DocAssignment {
  /** 対象。`STUDIO_TEMPLATES` の id か、定款・就業規則・計算書類の擬似 id。 */
  readonly doc: string;
  /** 主担当（1 件につき 1 つ）。 */
  readonly primary: DocOwner;
  /** 副担当（無ければ空）。 */
  readonly secondary: readonly ProfessionalId[];
  /** この仕分けの根拠（1 行）。士業のページでは「短い説明」として出す。 */
  readonly basis: string;
}

const A = (doc: string, primary: DocOwner, secondary: readonly ProfessionalId[], basis: string): DocAssignment => ({
  doc,
  primary,
  secondary,
  basis,
});

const ROWS: readonly DocAssignment[] = [
  // ── 税理士 ────────────────────────────────────────────────
  A('invoice', 'tax-accountant', [], '税率区分・仕入税額控除の判断は税務相談として税理士の領域'),
  A('shiharai', 'tax-accountant', [], '仕入明細書として仕入税額控除の要件に関わる証憑'),
  A('ryoshu', 'tax-accountant', [], '印紙税・消費税の扱いなど税区分の判断が要る証憑'),
  A('nouhin', 'tax-accountant', [], '請求書と合わせて仕入税額控除の記載事項を満たす証憑'),
  A('kenshu', 'tax-accountant', [], '受領・検収の確定は仕入計上と消費税の課税時期の判断に関わる'),
  A('mitsumori', 'tax-accountant', [], '見積の税率・税額表示はそのまま請求・申告の前提になる'),
  A('hacchu', 'tax-accountant', [], '取適法の発注書面。取引の税区分は発注時点で決まる'),
  A('chuumon-uke', 'tax-accountant', [], '請負は印紙税第2号文書。課税文書の判定は税理士の領域'),
  A('yakuin-hoshu-meisai', 'tax-accountant', ['judicial-scrivener'], '定期同額給与など損金算入の判定は法人税の解釈（税理士）。総会決議・登記は司法書士'),
  A('yakuin-shoyo-meisai', 'tax-accountant', [], '事前確定届出給与の届出・支給管理は税務書類の作成（税理士）'),
  A('cf-keikaku', 'tax-accountant', ['sme-consultant'], '税負担・返済原資を含む資金の見通しは税務と一体（税理士）。経営計画の面は診断士'),
  A('shikin-guri', 'tax-accountant', ['sme-consultant'], '納税・賞与・返済の山谷を読む資金管理は税理士が主。経営改善の面は診断士'),
  A('kessan', 'tax-accountant', ['cpa'], '決算から申告書作成・税務代理へつながる入口（税理士）。大会社等の法定監査は公認会計士の独占'),

  // ── 社会保険労務士 ────────────────────────────────────────
  A('roudou', 'labor-consultant', [], '社労士法2条1項2号の帳簿書類（雇用契約書）。労働条件明示の様式管理が本体'),
  A('saburoku', 'labor-consultant', [], '労使協定は社労士法2条1項2号の帳簿書類。労基署への届出までが一式'),
  A('chingin', 'labor-consultant', [], '就業規則の一部として社労士法2条1項2号の帳簿書類に含まれる'),
  A('harassment', 'labor-consultant', ['lawyer'], '就業規則の一部として届け出る形では社労士の帳簿書類。紛争化した場合は弁護士'),
  A('kaiko-yokoku', 'labor-consultant', ['lawyer'], '解雇手続（予告・手当）は社労士。有効性が争われる段階では弁護士'),
  A('taishoku-shomei', 'labor-consultant', [], '労基法22条の証明書。記載事項の制限の管理は社労士の領域'),
  A('roudousha-meibo', 'labor-consultant', [], '労基法107条の法定帳簿で、社労士法2条1項2号の帳簿書類の典型例'),
  A('kyuyo-meisai', 'labor-consultant', ['tax-accountant'], '労働社会保険の控除計算が本体（社労士）。源泉所得税・年末調整は税理士'),
  A('shoyo-meisai', 'labor-consultant', ['tax-accountant'], '標準賞与額など社会保険の算定が本体（社労士）。源泉所得税は税理士'),
  A('chingin-daichou', 'labor-consultant', [], '労基法108条の法定帳簿で、社労士法2条1項2号の帳簿書類の典型例'),
  A('shukkinbo', 'labor-consultant', [], '労働時間の記録。労働社会保険諸法令に基づく帳簿として社労士が関わる'),
  A('yukyu-kanribo', 'labor-consultant', [], '年休の付与・取得管理は労務管理の本体（社労士）'),
  A('naitei', 'labor-consultant', [], '内定取消しの合理性など、雇用契約の入口の管理は社労士'),
  A('shugyo', 'labor-consultant', [], '社労士法2条1項2号の帳簿書類の例示そのもの。届出・周知までが一式'),

  // ── 弁護士 ────────────────────────────────────────────────
  A('privacy', 'lawyer', ['admin-scrivener'], '個人情報の利用目的・第三者提供の適法性判断は弁護士。権利義務・事実証明の書類として行政書士も関わる'),
  A('security', 'lawyer', [], '情報管理の法的責任・事故時の対応判断は弁護士の領域'),
  A('naiyo', 'lawyer', ['admin-scrivener'], '債権請求の法的構成は弁護士。内容証明の書面作成自体は行政書士も行う'),
  A('tokusoku', 'lawyer', ['judicial-scrivener'], '紛争性が高まれば弁護士法72条の法律事務。支払督促の申立て実務は司法書士も関わる'),
  A('kaijo', 'lawyer', [], '解除の有効性（民法542条の要件・特約）の判断は弁護士の領域'),

  // ── 司法書士 ──────────────────────────────────────────────
  A('sokai', 'judicial-scrivener', [], '登記の添付書類になり得る議事録。登記申請の代理・添付書類の作成は司法書士'),
  A('rinji-sokai', 'judicial-scrivener', [], '登記の添付書類になり得る議事録。登記申請の代理・添付書類の作成は司法書士'),
  A('torishimari', 'judicial-scrivener', [], '登記の添付書類になり得る議事録。登記申請の代理・添付書類の作成は司法書士'),
  A('shunin', 'judicial-scrivener', [], '役員変更登記の添付書類そのもの（司法書士）'),
  A('shoshu', 'judicial-scrivener', [], '総会手続と変更登記の一連の流れは司法書士'),
  A('inin', 'judicial-scrivener', [], '議決権行使の代理権を証明する書面。総会・登記の実務は司法書士'),
  A('kabunushi-meibo', 'judicial-scrivener', [], '会社法の備置書類で、株式・登記の実務と一体（司法書士）'),
  A('annai', 'judicial-scrivener', ['tax-accountant'], '移転・設立・就任は変更登記が本体（司法書士）。税務署等への届出は税理士'),

  // ── 行政書士 ──────────────────────────────────────────────
  A('nda', 'admin-scrivener', ['patent-attorney'], '権利義務に関する書類として行政書士の領域。秘密情報の範囲は知財の観点で弁理士も関わる'),
  A('gyomu', 'admin-scrivener', [], '業務委託の権利義務を定める契約書。他人のために業として作ると行政書士の領域'),
  A('baibai', 'admin-scrivener', [], '継続的売買の権利義務を定める基本契約書'),
  A('chintai', 'admin-scrivener', [], '賃貸借の権利義務を定める契約書。借地借家法の適用判断が要る'),
  A('shohi', 'admin-scrivener', [], '金銭貸借の権利義務を定める契約書。利息制限法の上限管理が要る'),
  A('oboegaki', 'admin-scrivener', [], '契約変更の合意を残す権利義務に関する書類'),
  A('kojin-itaku', 'admin-scrivener', [], '委託先管理の合意を定める権利義務に関する書類'),
  A('seiyaku', 'admin-scrivener', [], '入社時の秘密保持等を定める誓約書。権利義務書類として行政書士の領域（実効性は就業規則の根拠づけ次第）'),
  A('taishoku-himitsu', 'admin-scrivener', [], '退職後の秘密保持を定める誓約書。対象と期間の限定が効力を左右する'),
  A('mimoto', 'admin-scrivener', ['labor-consultant'], '身元保証は権利義務に関する書類（行政書士）。採用時の書類として社労士も関わる'),
  A('teikan-kk', 'admin-scrivener', ['judicial-scrivener'], '定款の作成は権利義務・事実証明に関する書類として行政書士。設立登記の申請代理は司法書士'),
  A('teikan-gk', 'admin-scrivener', ['judicial-scrivener'], '定款の作成は権利義務・事実証明に関する書類として行政書士。設立登記の申請代理は司法書士'),

  // ── 中小企業診断士 ────────────────────────────────────────
  A('jigyo-keikaku', 'sme-consultant', ['tax-accountant'], '経営計画の策定支援は診断士の専門領域。税務の前提数字は税理士'),
  A('jigyo-keikaku-shosai', 'sme-consultant', ['tax-accountant'], '経営計画の策定支援は診断士の専門領域。数字どうしの整合は検算が要る'),
  A('chotatsu-keikaku-shosai', 'sme-consultant', ['admin-scrivener'], '調達計画の策定は診断士。補助金申請書の作成は行政書士の領域に入り得る'),
  A('chotatsu-keikaku', 'sme-consultant', ['admin-scrivener'], '調達計画の策定は診断士。補助金申請書の作成は行政書士の領域に入り得る'),
  A('plantfactory-plan', 'sme-consultant', ['tax-accountant'], '新規就農の事業計画の策定は診断士。税務の前提数字は税理士'),
  A('plantfactory-funding', 'sme-consultant', ['admin-scrivener'], '調達計画の策定は診断士。補助金申請書の作成は行政書士の領域に入り得る'),

  // ── 汎用（どの士業の担当でもない社内文書） ────────────────
  A('ringi', 'general', [], '社内の決裁文書で法定様式はなく、特定の士業の担当領域に当たらない'),
  A('gijiroku', 'general', [], '社内会議の記録で法定様式はなく、士業の担当領域に当たらない（株主総会等の法定の議事録とは別）'),
  A('keihi', 'general', [], '社内の精算手続の文書。証憑の保存年限など税務の注意はあるが、書式自体は士業の担当外'),
  A('shucchou', 'general', [], '旅費規程に基づく社内の精算文書。書式自体は士業の担当外'),
  A('houkoku', 'general', [], '日報・週報に法定様式はなく、士業の担当領域に当たらない'),
];

/** 担当仕分けの全行（表示順は定義順）。 */
export const DOC_ASSIGNMENTS: readonly DocAssignment[] = ROWS;

/**
 * 仕分けを引く。未登録なら null。
 *
 * 計算書類を 1 点ずつ開いても仕分けは 4 点と同じ（事業仕分けの
 * `triageFor` と同じ寄せ方）。行を複製すると内容がずれていく。
 */
export function assignmentFor(doc: string): DocAssignment | null {
  const target = sheetOfDoc(doc) !== null ? 'kessan' : doc;
  return ROWS.find((r) => r.doc === target) ?? null;
}

/** この士業が主担当の書類（表の並び順）。 */
export function primaryDocsFor(id: ProfessionalId): readonly DocAssignment[] {
  return ROWS.filter((r) => r.primary === id);
}

/** この士業が副担当の書類（表の並び順）。 */
export function secondaryDocsFor(id: ProfessionalId): readonly DocAssignment[] {
  return ROWS.filter((r) => r.secondary.includes(id));
}

/** 汎用（どの士業の担当でもない）の書類。 */
export function generalDocs(): readonly DocAssignment[] {
  return ROWS.filter((r) => r.primary === 'general');
}

/** 特別枠（定款・就業規則・計算書類）のカテゴリ表示名。書式の `cat` と並べるためのもの。 */
const EXTRA_DOC_CAT: Readonly<Record<string, string>> = {
  'teikan-kk': '定款',
  'teikan-gk': '定款',
  shugyo: '就業規則',
  kessan: '計算書類',
};

/** doc id → カテゴリ表示名。書式一覧 → 特別枠 → 見つからなければ空。 */
export function docCategory(doc: string): string {
  const target = sheetOfDoc(doc) !== null ? 'kessan' : doc;
  const template = STUDIO_TEMPLATES.find((d) => d.id === target);
  if (template) return template.cat;
  return lookup(EXTRA_DOC_CAT, target) ?? '';
}

/** 士業のページの「書類スタジオで作る書類」の 1 行（仕分けと事業仕分けの合流）。 */
export interface ProfessionalDocEntry {
  readonly doc: string;
  /** 表示名（`docLabel` から引く。ここには複製しない）。 */
  readonly label: string;
  readonly cat: string;
  /** この士業が主担当か副担当か。 */
  readonly role: 'primary' | 'secondary';
  /** 事業仕分けでの関わり（独占業務に当たる / 相談先）。 */
  readonly relation: DocRelation;
  readonly ownUse: OwnUse;
  /** 担当仕分けの根拠（短い説明として出す）。 */
  readonly basis: string;
}

/**
 * 士業 → 「作成できる書類」の一覧。
 *
 * 並びと関わり・自社分の扱いは事業仕分けの逆引き (`docsForProfessional`)
 * のままにし、ここでは担当（主/副）と根拠とカテゴリを重ねるだけにする。
 * 仕分けに無い書類は出さない（網羅はテストが固定するので、通常は起きない）。
 */
export function docEntriesForProfessional(id: ProfessionalId): readonly ProfessionalDocEntry[] {
  const out: ProfessionalDocEntry[] = [];
  for (const d of docsForProfessional(id)) {
    const a = assignmentFor(d.doc);
    if (a === null) continue;
    out.push({
      doc: d.doc,
      label: docLabel(d.doc),
      cat: docCategory(d.doc),
      role: a.primary === id ? 'primary' : 'secondary',
      relation: d.relation,
      ownUse: d.ownUse,
      basis: a.basis,
    });
  }
  return out;
}
