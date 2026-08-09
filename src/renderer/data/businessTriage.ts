/**
 * 事業仕分け — 「この作業、自社でやっていいのか」を判定する。
 *
 * `professionalMap.ts` は士業→担当領域の名簿で、「税理士は何をするか」に答える。
 * だが実務で先に来る問いはその逆で、「いま作ろうとしているこの書類、自分で
 * 作って出していいのか。どこから先は頼まないといけないのか」である。ここはその逆引き。
 *
 * ## 判定の軸はひとつだけ — 自社分か、他人のために業として行うか
 *
 * 士業法の独占規定はいずれも「他人の求めに応じ」「業として」を要件に置く。
 *
 *   税理士法2条1項     … 「他人の求めに応じ」税務代理・税務書類の作成・税務相談
 *   社会保険労務士法27条 … 「他人の求めに応じ報酬を得て」2条1項1号〜2号の事務を「業として」
 *   司法書士法73条     … 3条1項1号〜5号の業務を「業と」すること
 *   弁護士法72条       … 「報酬を得る目的で」法律事務を「業と」すること
 *
 * したがって **自社の書類を自社で作り、自社の名で出すことは、原則としてどの独占にも
 * 当たらない**（本人申請・本人申告）。この事実を知らないまま「専門家でないと作れない」
 * と思い込んで手が止まるのが、この画面で最も多い誤解である。
 *
 * 逆向きの誤解も同じくらい危険で、**形式上「本人申請」の体裁でも、実質が他人からの
 * 依頼であれば独占規定に触れる**。代理人欄を空けておけば通る、という話ではない。
 *
 * ## 断定しないところは断定しない
 *
 * 紛争性の有無（弁護士法72条）や、登記添付書類として作るのか社内保管なのか
 * （司法書士法3条1項2号）で結論が変わるものは `caseByCase` に事実だけ書き、
 * どちらかに寄せない。判定を 1 つに丸めると、外れたときに気づけないため。
 *
 * 出典: 士業ごとの根拠法は `PROFESSIONAL_MAP[id].law`（2026-07 に政府一次資料で
 * 検証済み）をそのまま引く。ここで新たに足した条文は上記 4 本と、
 * 社会保険労務士法2条1項2号（帳簿書類の作成。就業規則・労使協定・雇用契約書が
 * 例示に含まれる）および同項3号（相談・指導。27条の制限対象**外**）のみ。
 */

import { PROFESSIONAL_MAP, type ProfessionalId, type ProfessionalProfile } from './professionalMap';
import { STUDIO_TEMPLATES } from './docStudioData';

/** 自社分として作る場合の扱い。 */
export type OwnUse =
  /** 自社の書類として作り、自社の名で出すところまで自分でできる。 */
  | 'ok'
  /** 自社分でも期限・様式・提出先を外すと不利益が出る。手順に注意が要る。 */
  | 'ok-with-care';

/** 事業仕分けの 1 行。 */
export interface DocTriage {
  /** 対象。`STUDIO_TEMPLATES` の id か、定款・就業規則の擬似 id。 */
  readonly doc: string;
  readonly ownUse: OwnUse;
  /** 自社分としてやるときに実際に効く注意（空欄の禁止ではなく、手順の話）。 */
  readonly ownNote: string;
  /** 他人のために業として行うと独占業務に当たる士業。当たらないなら空。 */
  readonly exclusiveTo: readonly ProfessionalId[];
  /** 事案によって結論が変わる点。ここに書いたものは断定しない。 */
  readonly caseByCase?: string;
  /** 独占でなくても相談するのが定石の士業。 */
  readonly consult: readonly ProfessionalId[];
}

/** 定款・就業規則は STUDIO_TEMPLATES の外にあるので擬似 id を振る。 */
export const EXTRA_DOC_IDS = ['teikan-kk', 'teikan-gk', 'shugyo', 'kessan'] as const;

/** 契約書に共通の注意（個別の注意が無い書式で使う）。 */
export const CONTRACT_NOTE =
  '契約書は自社が当事者である限り自由に作って交わせる。相手方に押印を求める前に、'
  + '記載した条件で本当に回るか（支払期日・解除・損害の範囲）を先に確認すること。';

/**
 * 権利義務・事実証明に関する書類は、他人のために業として作ると行政書士の領域。
 *
 * consult に行政書士を重ねて書かないのは、独占の相手としてすでに名前が出るため。
 * 同じ士業が「独占」と「相談先」の両方に並ぶと、どちらの意味か読めなくなる。
 */
const CONTRACT_TRIAGE = (doc: string, ownNote = CONTRACT_NOTE, consult: ProfessionalId[] = []): DocTriage => ({
  doc,
  ownUse: 'ok',
  ownNote,
  exclusiveTo: ['admin-scrivener'],
  consult,
});

/** 商取引の証憑。作成自体は誰でもできるが、税区分の判断は税務相談に寄る。 */
const VOUCHER_TRIAGE = (doc: string, ownNote: string): DocTriage => ({
  doc,
  ownUse: 'ok',
  ownNote,
  exclusiveTo: [],
  consult: ['tax-accountant'],
});

/** 社内文書。法定の様式がなく、他人のために作っても独占に触れない。 */
const INTERNAL_TRIAGE = (doc: string, ownNote: string): DocTriage => ({
  doc,
  ownUse: 'ok',
  ownNote,
  exclusiveTo: [],
  consult: [],
});

/** 登記の添付書類になり得る書面に共通の但し書き。 */
export const REGISTRY_CASE =
  '社内に保管するだけなら自由。ただし同じ書面を登記の添付書類として、他人のために'
  + '作成すると司法書士法3条1項2号（法務局へ提出する書類の作成）の領域に入る。'
  + '登記申請そのものの代理も同じ。自社の登記を自社で申請する分には制限されない。';

/** 請求・督促・解除に共通の但し書き（紛争性の有無で担当が変わる）。 */
export const DISPUTE_CASE =
  '相手が争う姿勢を見せているか、金額や事実関係に争いがあるなら、報酬を得て他人の'
  + 'ために交渉・請求を行うことは弁護士法72条の法律事務に当たり得る。争いのない'
  + '段階の書面作成にとどまるか、すでに紛争かで担当が変わる。自社の債権を自社で'
  + '請求する分には制限されない。';

const ROWS: readonly DocTriage[] = [
  // ── 契約（権利義務に関する書類 = 行政書士の領域） ──────────────────
  CONTRACT_TRIAGE('nda', '自社が当事者なら自由。秘密情報の範囲と期間を曖昧にすると、後で「これは秘密ではない」と言われる。',
    ['patent-attorney']),
  CONTRACT_TRIAGE('gyomu', '発注者側になるなら、支払期日は受領日から60日以内に定める必要がある（取適法）。'),
  CONTRACT_TRIAGE('baibai'),
  CONTRACT_TRIAGE('chintai', '事業用でも借地借家法が適用される。期間を1年未満と定めると「期間の定めなし」とみなされる。'),
  CONTRACT_TRIAGE('shohi', '利息を付けるなら利息制限法1条の上限（元本で20/18/15%）を超えないこと。超過部分は無効。'),
  CONTRACT_TRIAGE('oboegaki', '変更前の条項を特定せずに「一部変更する」とだけ書くと、どちらが生きているか後で争いになる。'),
  CONTRACT_TRIAGE('kojin-itaku', '委託契約を結んだだけでは監督義務を果たしたことにならない。選定基準と定期確認の記録まで残すこと。'),
  CONTRACT_TRIAGE('seiyaku', '入社時の誓約は、就業規則で根拠づけておかないと実効性が弱い。'),
  CONTRACT_TRIAGE('taishoku-himitsu', '退職後の秘密保持は、対象と期間を限定しないと公序良俗違反として無効になり得る。'),
  {
    doc: 'mimoto',
    ownUse: 'ok-with-care',
    ownNote: '極度額を定めないと契約そのものが無効（民法465条の2）。期間は5年が上限（身元保証ニ関スル法律2条）。',
    exclusiveTo: ['admin-scrivener'],
    consult: ['labor-consultant'],
  },

  // ── 人事・労務（社労士法2条1項2号の帳簿書類） ─────────────────────
  {
    doc: 'roudou',
    ownUse: 'ok-with-care',
    ownNote: '2024年4月から「就業場所・業務の変更の範囲」の明示が全労働者に必須。欠けると労働条件明示義務違反になる。',
    exclusiveTo: ['labor-consultant'],
    caseByCase: '雇用契約書は社会保険労務士法2条1項2号の帳簿書類に含まれる。自社の従業員に自社が交付する分は制限されない。',
    consult: [],
  },
  {
    doc: 'saburoku',
    ownUse: 'ok-with-care',
    ownNote: '締結しただけでは時間外労働をさせられない。所轄労働基準監督署長への届出と労働者への周知まで終えて初めて効力を持つ。',
    exclusiveTo: ['labor-consultant'],
    caseByCase: '労使協定は同号の帳簿書類に、労基署への届出は同項1号の申請書等に当たる。自社分の作成・届出は制限されない。',
    consult: [],
  },
  {
    doc: 'chingin',
    ownUse: 'ok-with-care',
    ownNote: '常時10人以上の事業場では就業規則の一部として、過半数代表者の意見書を添えて労基署へ届け出て周知する必要がある。',
    exclusiveTo: ['labor-consultant'],
    caseByCase: '就業規則は社会保険労務士法2条1項2号の帳簿書類の例示に含まれる。賃金規程はその一部。'
      + '自社の規程を自社で作り自社で届け出る分は制限されない。',
    consult: [],
  },
  {
    doc: 'harassment',
    ownUse: 'ok-with-care',
    ownNote: '規程を作っただけでは措置義務を果たしたことにならない。相談窓口の周知と相談記録の保管まで整えること。',
    exclusiveTo: [],
    caseByCase: '就業規則の一部として届け出る形にするなら、社会保険労務士法2条1項2号の帳簿書類に当たる。独立した社内規程にとどめるなら該当しない。',
    consult: ['labor-consultant', 'lawyer'],
  },
  {
    doc: 'kaiko-yokoku',
    ownUse: 'ok-with-care',
    ownNote: '30日前の予告か、不足日数分以上の平均賃金（解雇予告手当）が要る（労基法20条）。理由を書かないと解雇権濫用を争われる余地が大きくなる。',
    exclusiveTo: [],
    caseByCase: '解雇の有効性そのものが争われる段階なら弁護士の領域。労基法上の手続だけなら社労士に相談するのが定石。',
    consult: ['labor-consultant', 'lawyer'],
  },
  {
    doc: 'taishoku-shomei',
    ownUse: 'ok-with-care',
    ownNote: '本人が請求していない事項は記入できない（労基法22条3項）。請求のなかった欄は空欄のまま交付すること。',
    exclusiveTo: [],
    consult: ['labor-consultant'],
  },
  {
    doc: 'naitei',
    ownUse: 'ok',
    ownNote: '内定通知は労働契約の成立と解される場合がある。取消しには解雇に準じた合理性が要る。',
    exclusiveTo: [],
    consult: ['labor-consultant'],
  },

  // ── 経理・証憑 ────────────────────────────────────────────
  VOUCHER_TRIAGE('invoice', '税率ごとの区分と消費税額の記載が要る。端数処理は一の請求書につき税率ごとに1回（消費税法57条の4）。'),
  VOUCHER_TRIAGE('shiharai', '相手方の確認を受けて初めて仕入税額控除の要件を満たす（消費税法30条9項3号）。登録番号は相手方のもの。'),
  VOUCHER_TRIAGE('ryoshu', '紙で交付するなら受取金額5万円以上で収入印紙が要る。電子交付なら課税文書に当たらない。'),
  VOUCHER_TRIAGE('nouhin', '納品書だけでは仕入税額控除の記載事項を満たさないことがある。請求書と合わせて保存すること。'),
  VOUCHER_TRIAGE('kenshu', '支払期日は受領日から起算して60日以内（取適法）。起算日は検収日ではなく受領日。'),
  VOUCHER_TRIAGE('mitsumori', '見積の有効期限を書かないと、価格が動いた後も同じ条件で求められることがある。'),
  VOUCHER_TRIAGE('hacchu', '委託事業者は発注書面を直ちに交付する義務を負い、取引書類は2年間保存する（取適法4条）。'),
  VOUCHER_TRIAGE('chuumon-uke', '請負なら印紙税第2号文書として課税される（1万円未満は非課税）。電子交付なら課税文書に当たらない。'),

  // ── 組織（登記の添付書類になり得る） ───────────────────────────
  {
    doc: 'sokai',
    ownUse: 'ok-with-care',
    ownNote: '議事録は10年間本店に備え置く（会社法318条2項）。定足数と決議要件を満たしているか、出席数の記載と突き合わせること。',
    exclusiveTo: [],
    caseByCase: REGISTRY_CASE,
    consult: ['judicial-scrivener'],
  },
  {
    doc: 'rinji-sokai',
    ownUse: 'ok-with-care',
    ownNote: '臨時総会も備置義務は同じ。招集手続を省略するなら、議決権を行使できる株主全員の同意が要る。',
    exclusiveTo: [],
    caseByCase: REGISTRY_CASE,
    consult: ['judicial-scrivener'],
  },
  {
    doc: 'torishimari',
    ownUse: 'ok-with-care',
    ownNote: '取締役会議事録には出席取締役・監査役の署名または記名押印が要る（会社法369条3項）。',
    exclusiveTo: [],
    caseByCase: REGISTRY_CASE,
    consult: ['judicial-scrivener'],
  },
  {
    doc: 'shunin',
    ownUse: 'ok-with-care',
    ownNote: '役員変更は就任の日から2週間以内に変更登記が要る（会社法915条1項）。本人確認証明書の添付が要る場合がある。',
    exclusiveTo: [],
    caseByCase: REGISTRY_CASE,
    consult: ['judicial-scrivener'],
  },
  {
    doc: 'shoshu',
    ownUse: 'ok',
    ownNote: '非公開会社の招集通知は会日の1週間前まで。定款で短縮しているなら、その期間で足りるか確認すること。',
    exclusiveTo: [],
    consult: ['judicial-scrivener'],
  },
  {
    doc: 'inin',
    ownUse: 'ok',
    ownNote: '委任状は議決権行使の代理権を証明する書面。誰に何を委任したかが特定できないと無効を争われる。',
    exclusiveTo: [],
    consult: ['judicial-scrivener'],
  },
  {
    doc: 'kabunushi-meibo',
    ownUse: 'ok-with-care',
    ownNote: '株主名簿の作成・備置は会社の義務（会社法121条・125条）。記載株式数の合計は発行済株式総数と一致させること。',
    exclusiveTo: [],
    caseByCase: REGISTRY_CASE,
    consult: ['judicial-scrivener'],
  },

  // ── 規程 ────────────────────────────────────────────────
  {
    doc: 'privacy',
    ownUse: 'ok-with-care',
    ownNote: '公表しただけでは足りない。記載した利用目的・第三者提供・委託の運用が実態と一致しているかを定期に突き合わせること。',
    exclusiveTo: [],
    consult: ['lawyer', 'admin-scrivener'],
  },
  {
    doc: 'security',
    ownUse: 'ok',
    ownNote: '基本方針だけでは動かない。具体的な取扱規程と、退職者のアカウント停止までの手順に落とすこと。',
    exclusiveTo: [],
    consult: ['lawyer'],
  },

  // ── 通知（紛争性で担当が変わる） ──────────────────────────────
  {
    doc: 'naiyo',
    ownUse: 'ok-with-care',
    ownNote: '催告による時効の完成猶予は6か月。その間に訴えの提起等をしなければ時効は完成する（民法150条）。到達日の証明に配達証明を併用すること。',
    exclusiveTo: [],
    caseByCase: DISPUTE_CASE,
    consult: ['lawyer', 'admin-scrivener'],
  },
  {
    doc: 'tokusoku',
    ownUse: 'ok-with-care',
    ownNote: '督促を繰り返しても完成猶予は延長されない。回収の見込みが立たないなら支払督促・少額訴訟への切替えを検討すること。',
    exclusiveTo: [],
    caseByCase: DISPUTE_CASE,
    consult: ['lawyer', 'judicial-scrivener'],
  },
  {
    doc: 'kaijo',
    ownUse: 'ok-with-care',
    ownNote: '無催告解除ができるのは民法542条の要件に該当する場合か、契約に特約がある場合に限られる。要件を満たさない解除は逆に債務不履行を問われる。',
    exclusiveTo: [],
    caseByCase: DISPUTE_CASE,
    consult: ['lawyer'],
  },
  {
    doc: 'annai',
    ownUse: 'ok',
    ownNote: '本店移転・役員変更は2週間以内の変更登記に加え、税務署・年金事務所・労基署等への届出も期限内に要る。',
    exclusiveTo: [],
    consult: ['judicial-scrivener', 'tax-accountant'],
  },

  // ── 社内文書 ──────────────────────────────────────────────
  INTERNAL_TRIAGE('ringi', '決裁の順序と金額基準を決めておかないと、後から「誰が決めたか」を追えなくなる。'),
  INTERNAL_TRIAGE('gijiroku', '社内会議の議事録に法定の様式はない。決定事項と担当・期限が追えれば足りる。'),
  INTERNAL_TRIAGE('keihi', '証憑の保存年限は法人税法上7年（欠損金がある事業年度は10年）。精算書だけでなく領収書も残すこと。'),
  INTERNAL_TRIAGE('shucchou', '日当を出すなら旅費規程で基準を定めておくこと。規程がないと給与課税の対象と判断され得る。'),
  INTERNAL_TRIAGE('houkoku', '日報・週報に法定の様式はない。労働時間の記録として使うなら、客観的な記録と矛盾させないこと。'),

  // ── 事業計画 ──────────────────────────────────────────────
  {
    doc: 'jigyo-keikaku',
    ownUse: 'ok',
    ownNote: '事業計画は自社で書ける。むしろ書いた本人が数字の前提を説明できることに意味があり、'
      + '審査の場では口頭で質問に答えられることが求められる。人に作らせた計画はそこで答えられない。',
    exclusiveTo: [],
    consult: ['sme-consultant', 'tax-accountant'],
  },
  {
    doc: 'chotatsu-keikaku',
    ownUse: 'ok-with-care',
    ownNote: '必要資金の合計と調達の合計は必ず一致させること。補助金は原則として事業完了後の精算払いなので、'
      + '交付が決まっていても入金までの資金は別途つなぐ必要がある。',
    exclusiveTo: [],
    caseByCase: '補助金・許認可の申請書を他人のために業として作成すると、官公署提出書類として行政書士の領域に入る。'
      + '自社の申請を自社で出す分は制限されない。',
    consult: ['sme-consultant', 'admin-scrivener'],
  },
  {
    doc: 'shikin-guri',
    ownUse: 'ok',
    ownNote: '資金繰り表に法定の様式はない。掛け取引は売上が立った月ではなく入金される月に入れること。'
      + '見るのは損益ではなく現金の出入りで、賞与・納税・返済が重なる月に詰まる。',
    exclusiveTo: [],
    consult: ['tax-accountant', 'sme-consultant'],
  },
  {
    doc: 'plantfactory-plan',
    ownUse: 'ok',
    ownNote: '事業計画は自社で書けるし、書いた本人が説明できることに意味がある。数字の前提を人に作らせると審査で答えられなくなる。',
    exclusiveTo: [],
    consult: ['sme-consultant', 'tax-accountant'],
  },
  {
    doc: 'plantfactory-funding',
    ownUse: 'ok',
    ownNote: '補助金の申請書は様式と提出期限が公募ごとに違う。交付決定前に発注すると対象外になる。',
    exclusiveTo: [],
    caseByCase: '補助金・許認可の申請書を他人のために業として作成すると、官公署提出書類として行政書士の領域に入る。',
    consult: ['sme-consultant', 'admin-scrivener'],
  },

  // ── 定款・就業規則（STUDIO_TEMPLATES の外） ─────────────────────
  {
    doc: 'teikan-kk',
    ownUse: 'ok-with-care',
    ownNote: '株式会社の定款は公証人の認証が要る（会社法30条）。紙で作ると印紙税4万円が課税されるので、電子定款にすればその分は不要。',
    exclusiveTo: [],
    caseByCase: '定款そのものの作成は権利義務・事実証明に関する書類として行政書士の領域。設立登記の申請代理と登記添付書類の作成は司法書士の領域。自社の設立を自分で進める分にはどちらも制限されない。',
    consult: ['admin-scrivener', 'judicial-scrivener'],
  },
  {
    doc: 'teikan-gk',
    ownUse: 'ok-with-care',
    ownNote: '合同会社の定款に公証人認証は不要。ただし紙の原本には印紙税4万円が課税されるので、電子定款の節税効果はそのまま効く。',
    exclusiveTo: [],
    caseByCase: '定款そのものの作成は権利義務・事実証明に関する書類として行政書士の領域。設立登記の申請代理と登記添付書類の作成は司法書士の領域。自社の設立を自分で進める分にはどちらも制限されない。',
    consult: ['admin-scrivener', 'judicial-scrivener'],
  },
  {
    doc: 'kessan',
    ownUse: 'ok-with-care',
    ownNote: '計算書類の作成義務を負うのは会社自身で、自社で作って差し支えない（会社法435条2項）。'
      + '作成した時から10年間の保存義務があり、定時株主総会の承認後は貸借対照表の公告も要る。',
    exclusiveTo: [],
    caseByCase: '決算書そのものの作成・記帳代行は独占業務ではない。ただし、そこから先の'
      + '法人税・消費税の申告書作成と税務代理は税理士の独占（税理士法2条1項）。'
      + '大会社等の法定監査は公認会計士の独占（公認会計士法2条1項）。自社の決算を自社で組み'
      + '自社名で申告する分は、いずれの制限も受けない。',
    consult: ['tax-accountant', 'cpa'],
  },
  {
    doc: 'shugyo',
    ownUse: 'ok-with-care',
    ownNote: '常時10人以上の事業場では、過半数代表者の意見書を添えて労基署へ届け出て、労働者に周知するまでが一式（労基法89条・90条・106条）。',
    exclusiveTo: ['labor-consultant'],
    caseByCase: '就業規則は社会保険労務士法2条1項2号の帳簿書類の例示に含まれる。自社の就業規則を自社で作り自社で届け出る分は制限されない。',
    consult: [],
  },
];

/** 仕分けの全行（表示順は定義順）。 */
export const TRIAGE_ROWS: readonly DocTriage[] = ROWS;

/**
 * 仕分けを引く。未登録なら null。
 *
 * 48 行しかないので Map を作らず線形に探す。モジュール初期化時に索引を組むと、
 * そこで壊れたときにテストの失敗ではなく import の失敗になり、
 * 「テストが 0 件」として静かに素通りしてしまう。
 */
export function triageFor(doc: string): DocTriage | null {
  return ROWS.find((r) => r.doc === doc) ?? null;
}

/**
 * 仕分けの対象となる全 doc id（書式 45 + 定款2 + 就業規則）。
 *
 * `LIVE_FETCHERS` と同じ考え方で、ここを網羅していないと画面に穴が開く。
 * 書式を足して仕分けを忘れると、その書式だけ黙って何も出なくなるため、
 * テストで全件そろっていることを固定する。
 */
export function expectedDocIds(): readonly string[] {
  return [...STUDIO_TEMPLATES.map((d) => d.id), ...EXTRA_DOC_IDS];
}

/** 他人のために業として行うと独占に触れる書式だけを数える。 */
export function exclusiveCount(): number {
  return ROWS.filter((r) => r.exclusiveTo.length > 0).length;
}

/**
 * 業務（アプリ内サービス）→ 担当士業の逆引き。
 *
 * `PROFESSIONAL_MAP` の duty.link を裏返すだけで、担当の定義は増やさない
 * （2 か所に書くと必ず片方が古くなる）。
 */
export function professionalsForService(
  serviceId: string,
  /** 差し替え可能にしてあるのはテストのため。link を持たない duty を通せるようにする。 */
  profiles: readonly ProfessionalProfile[] = Object.values(PROFESSIONAL_MAP),
): readonly { id: ProfessionalId; label: string; title: string; scope: string }[] {
  const out: { id: ProfessionalId; label: string; title: string; scope: string }[] = [];
  for (const profile of profiles) {
    for (const duty of profile.duties) {
      if (duty.link?.serviceId === serviceId) {
        out.push({ id: profile.id, label: profile.label, title: duty.title, scope: duty.scope });
      }
    }
  }
  return out;
}

/** 士業 id → 表示名。存在しない id は渡らない（型で保証）。 */
export function labelOf(id: ProfessionalId): string {
  return PROFESSIONAL_MAP[id].label;
}

/** 士業 id → 検証済みの根拠法。仕分けの文面ではこれをそのまま引く。 */
export function lawOf(id: ProfessionalId): string {
  return PROFESSIONAL_MAP[id].law;
}
