/**
 * 書類スタジオ — 事前チェック（人的ミスの検出）。
 *
 * テンプレートは正しくても、入力する人間の側で書類は壊れる。
 * ここで潰すのは「書いた本人が気づけない」種類の失敗に限る。
 *
 *   fatal — その記載のままでは書類が無効・違法になる（極度額のない身元保証、
 *           上限規制を超える36協定、利息制限法超過の利率、30日を切る解雇予告 等）
 *   warn  — 無効ではないが、実務上ほぼ確実に問題になる（数値の矛盾、
 *           必須記載事項の空欄、登録番号の形式誤り 等）
 *   info  — 交付後に期限内でやることの取りこぼし（届出・登記・印紙 等）
 *
 * 判定はすべて純関数。UI を持たないので単体テストで固定できる
 * （src/renderer/__tests__/docStudioChecks.test.ts）。
 */

import type { StudioDoc } from './docStudioData';
import { byIssueLevel, type IssueLevel } from '../../shared/issueLevel';

/** 重大度はアプリ全体で 1 つ（`shared/issueLevel.ts`）。旧名は呼び出し側のために残す。 */
export type CheckLevel = IssueLevel;

export interface DocIssue {
  readonly level: CheckLevel;
  /** 該当する差込フィールドの k（画面で入力欄を強調するために使う）。 */
  readonly field?: string;
  readonly message: string;
  /** 根拠となる条文・制度。 */
  readonly basis?: string;
}

type Values = Record<string, string>;

/** 全角数字・カンマ・単位つきの入力から数値を取り出す。取れなければ null。 */
export function toNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const half = raw.replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  // 桁区切りは半角 , だけとは限らない。日本語 IME は全角 ，や読点 、を平気で挟むので
  // ここで一緒に落とす（\s は U+3000 全角スペースも含む）。落とし損ねると
  // 「１，２３４」が 1 と読まれ、金額チェックが静かに的外れになる。
  const m = half.replace(/[,，、\s]/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** 「2026年8月5日」「2026/8/5」「2026-08-05」を UTC ミリ秒に。取れなければ null。 */
export function parseJpDate(raw: string | undefined): number | null {
  if (!raw) return null;
  const half = raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const m = half.match(/(\d{4})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // 月だけは先に弾く。Date.UTC は 0 月を前年12月、13月を翌年1月として受け取ってしまい、
  // 日は動かないので後段の照合をすり抜ける。
  if (mo < 1 || mo > 12) return null;
  const t = Date.UTC(y, mo - 1, d);
  // 2月30日・4月31日・0日のような実在しない日は Date.UTC が別の月へ繰り上げ／繰り下げるため、
  // 日が入力どおりに戻ってこない。日の照合だけで足りる（月は上で範囲を保証済み）。
  if (new Date(t).getUTCDate() !== d) return null;
  return t;
}

const DAY = 86_400_000;

/** 利息制限法1条の上限利率（％）。元本の額で決まる。 */
export function interestCap(principal: number): number {
  if (principal < 100_000) return 20;
  if (principal < 1_000_000) return 18;
  return 15;
}

/** 適格請求書発行事業者の登録番号は T + 13 桁。 */
export function isRegistrationNo(raw: string | undefined): boolean {
  if (!raw) return false;
  const half = raw.replace(/[０-９Ｔ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  return /^T\d{13}$/.test(half.replace(/[-\s]/g, '').toUpperCase());
}

/** 入力欄の値。前後の空白は書式上の意味を持たないので落とす。 */
function text(v: Values, key: string): string {
  return (v[key] ?? '').trim();
}

/**
 * 判定用に数値を読む。読めなければ NaN。
 *
 * null ではなく NaN を返すのは、「読めなかった値はどの閾値にも引っかからない」という
 * この画面の方針をそのまま演算に載せるため。NaN との比較は常に false なので、
 * 呼び出し側に `x !== null &&` を書き足す必要がない（書いても結果は変わらない）。
 * 「読めないこと自体」で判定を止めたい箇所だけ Number.isFinite で明示する。
 */
function num(v: Values, key: string): number {
  const parsed = toNum(v[key]);
  return parsed === null ? Number.NaN : parsed;
}

/**
 * 合計に足す金額。空欄は 0、読めない入力は NaN。
 *
 * `num` は空欄も読めない入力も同じ NaN にする。合計を取る欄ではこの区別が要る:
 * 使わない調達手段を空欄にしただけで合計が NaN になると、書面の合計欄
 * （空欄を 0 として集計する）と検算の結果が食い違い、「表は差額が出ているのに
 * 何も指摘されない」という一番たちの悪い状態になる。空欄は 0、
 * 「読めない文字が入っている」ときだけ判定を止める。
 */
function money(v: Values, key: string): number {
  return text(v, key) === '' ? 0 : num(v, key);
}

/** 判定用に日付を読む。読めなければ NaN（差を取っても NaN のまま伝播する）。 */
function day(v: Values, key: string): number {
  const t = parseJpDate(v[key]);
  return t === null ? Number.NaN : t;
}

/** 選択肢が指定の書き出しかどうか。未選択なら false（判定しない）。 */
function chose(v: Values, key: string, prefix: string): boolean {
  return v[key]?.startsWith(prefix) ?? false;
}

/** 品目別の税率区分（i1..i6）に共通する検査。invoice / shiharai で共用する。 */
function taxItemIssues(v: Values, max: number): DocIssue[] {
  const out: DocIssue[] = [];
  const usedCustom = new Set<string>();
  let anyLine = false;
  for (let n = 1; n <= max; n += 1) {
    const kind = text(v, `i${n}kind`);
    const name = text(v, `i${n}name`);
    const price = text(v, `i${n}price`);
    const filled = name !== '' || price !== '';
    if (kind === '任意税率A') usedCustom.add('A');
    if (kind === '任意税率B') usedCustom.add('B');
    if (kind !== '' && kind !== '（使わない）') anyLine = true;
    if (filled && (kind === '' || kind === '（使わない）')) {
      out.push({
        level: 'warn',
        field: `i${n}kind`,
        message: `品目${n} に入力がありますが、税率区分が「（使わない）」のため請求書に載りません。区分を選ぶか、入力を消してください。`,
      });
    }
    if (filled && price === '') {
      out.push({ level: 'warn', field: `i${n}price`, message: `品目${n} の単価が未入力です。金額 0 円として計算されます。` });
    }
  }
  for (const tag of usedCustom) {
    // 空欄も「読めない」に含まれる（toNum は空文字で null を返す）ので、null 判定だけでよい。
    const val = toNum(v[`rate${tag}`]);
    if (val === null) {
      out.push({
        level: 'fatal',
        field: `rate${tag}`,
        message: `任意税率${tag} を使う品目がありますが、税率が未入力です。0% として計算され、消費税額が 0 になります。`,
      });
    } else if (val < 0 || val > 50) {
      out.push({ level: 'fatal', field: `rate${tag}`, message: `任意税率${tag} は 0〜50% の範囲で入力してください（現在 ${val}）。` });
    }
  }
  if (!anyLine) {
    out.push({ level: 'warn', message: 'いずれの品目にも税率区分が選ばれていません。明細が空のまま交付されます。' });
  }
  out.push({
    level: 'info',
    message: '消費税額の端数処理は一の適格請求書につき税率ごとに1回です。行ごとに端数処理して積み上げる方法は認められません（本書式は区分ごとに1回だけ処理しています）。',
    basis: '消費税法57条の4',
  });
  return out;
}

/** 書式ごとの個別ルール。値が入っていない項目は原則として空欄チェックに任せる。 */
const RULES: Record<string, (v: Values) => DocIssue[]> = {
  mimoto(v) {
    const out: DocIssue[] = [];
    const limit = num(v, 'limit');
    // 読めない（NaN）も 0 以下も「極度額の定めなし」。NaN > 0 は false なので一本で足りる。
    if (!(limit > 0)) {
      out.push({
        level: 'fatal',
        field: 'limit',
        message: '極度額（保証の上限額）が定められていません。このままでは身元保証契約そのものが無効です。',
        basis: '民法465条の2（個人根保証契約は極度額を定めなければ効力を生じない）',
      });
    }
    const years = num(v, 'years');
    if (years > 5) {
      out.push({
        level: 'fatal',
        field: 'years',
        message: `保証期間が ${years} 年になっています。5年を超える定めはできず、5年に短縮されます。`,
        basis: '身元保証ニ関スル法律2条',
      });
    }
    return out;
  },

  saburoku(v) {
    const out: DocIssue[] = [];
    const month = num(v, 'monthLimit');
    const year = num(v, 'yearLimit');
    if (month >= 100) {
      out.push({
        level: 'fatal',
        field: 'monthLimit',
        message: `1か月の延長時間が ${month} 時間です。休日労働を含めて1か月100時間未満でなければならず、特別条項でもこの上限は超えられません。`,
        basis: '労働基準法36条6項2号',
      });
    } else if (month > 45) {
      out.push({
        level: 'warn',
        field: 'monthLimit',
        message: `1か月の延長時間が ${month} 時間で、原則の限度時間45時間を超えています。特別条項（様式第9号の2）による協定が必要で、45時間を超えられるのは1年に6か月までです。`,
        basis: '労働基準法36条4項・5項',
      });
    }
    if (year > 720) {
      out.push({
        level: 'fatal',
        field: 'yearLimit',
        message: `1年の延長時間が ${year} 時間です。特別条項を締結しても1年720時間を超えることはできません。`,
        basis: '労働基準法36条5項',
      });
    } else if (year > 360) {
      out.push({
        level: 'warn',
        field: 'yearLimit',
        message: `1年の延長時間が ${year} 時間で、原則の限度時間360時間を超えています。特別条項による協定が必要です。`,
        basis: '労働基準法36条4項',
      });
    }
    if (year > month * 12) {
      out.push({
        level: 'warn',
        field: 'yearLimit',
        message: `1年の延長時間（${year} 時間）が、1か月の延長時間 × 12（${month * 12} 時間）を上回っています。月の上限を守ると年の枠を使い切れません。`,
      });
    }
    const target = num(v, 'target');
    const workers = num(v, 'workers');
    if (target > workers) {
      out.push({
        level: 'warn',
        field: 'target',
        message: `対象労働者数（${target} 人）が事業場の労働者数（${workers} 人）を超えています。`,
      });
    }
    out.push({
      level: 'info',
      message: '協定を締結しただけでは時間外労働はさせられません。所轄労働基準監督署長への届出（様式第9号／特別条項は様式第9号の2）と、労働者への周知まで完了させてください。',
      basis: '労働基準法36条1項・106条',
    });
    return out;
  },

  shohi(v) {
    const out: DocIssue[] = [];
    const amount = num(v, 'amount');
    const rate = num(v, 'rate');
    // 元本が読めないと上限区分（20/18/15%）が決まらないので、利率だけでは判定しない。
    if (Number.isFinite(amount) && rate > interestCap(amount)) {
      out.push({
        level: 'fatal',
        field: 'rate',
        message: `元本 ${amount.toLocaleString('ja-JP')} 円に対する上限利率は年 ${interestCap(amount)}% です。年 ${rate}% とした場合、超過部分は無効になります。`,
        basis: '利息制限法1条',
      });
    }
    if (amount >= 10_000) {
      out.push({
        level: 'info',
        message: '紙で作成する場合は印紙税第1号の3文書として記載金額に応じた収入印紙が必要です。電子契約として交付すれば課税文書に当たりません。',
        basis: '印紙税法（課税物件表第1号の3）',
      });
    }
    return out;
  },

  chintai(v) {
    const out: DocIssue[] = [];
    const term = text(v, 'term');
    // 「1年6か月」のように年が併記されていれば1年未満ではない。年の数値自体は使わない。
    const hasYear = /\d\s*年/.test(term);
    const months = /(\d+)\s*(?:か月|ヶ月|カ月|箇月)/.exec(term);
    if (!hasYear && months && Number(months[1]) < 12) {
      out.push({
        level: 'warn',
        field: 'term',
        message: `契約期間が ${months[1]} か月です。期間を1年未満と定めた普通建物賃貸借は「期間の定めがない賃貸借」とみなされます。短期にするなら定期建物賃貸借にしてください。`,
        basis: '借地借家法29条1項・38条',
      });
    }
    const rent = num(v, 'rent');
    const shiki = num(v, 'shikikin');
    if (rent > 0 && shiki > rent * 12) {
      out.push({
        level: 'warn',
        field: 'shikikin',
        message: '敷金が賃料の12か月分を超えています。金額に誤りがないか確認してください。',
      });
    }
    return out;
  },

  'kaiko-yokoku'(v) {
    const out: DocIssue[] = [];
    // 日付が読めなければ days は NaN になり、以下の比較はすべて false になる（＝判定しない）。
    const days = Math.round((day(v, 'dismissDate') - day(v, 'noticeDate')) / DAY);
    if (days < 0) {
      out.push({ level: 'warn', field: 'dismissDate', message: '解雇の日が通知日より前になっています。' });
    } else if (days < 30 && chose(v, 'teate', '支給しない')) {
      out.push({
        level: 'fatal',
        field: 'teate',
        message: `予告期間が ${days} 日しかありません。30日前の予告に満たない場合は、不足日数分以上の平均賃金（解雇予告手当）の支払が必要です。`,
        basis: '労働基準法20条',
      });
    } else if (days < 30) {
      out.push({
        level: 'warn',
        field: 'teateAmount',
        message: `予告期間は ${days} 日です。不足する ${30 - days} 日分以上の平均賃金を解雇予告手当として支払ってください。`,
        basis: '労働基準法20条2項',
      });
    }
    if (!text(v, 'reason')) {
      out.push({
        level: 'warn',
        field: 'reason',
        message: '解雇の理由が空欄です。就業規則の該当条項と具体的な事実を記載しないと、解雇権濫用として無効を争われる余地が大きくなります。',
        basis: '労働契約法16条',
      });
    }
    out.push({
      level: 'info',
      message: '業務上の傷病による休業期間及びその後30日間、産前産後の休業期間及びその後30日間は原則として解雇できません。該当しないか確認してください。',
      basis: '労働基準法19条',
    });
    return out;
  },

  'taishoku-shomei'(v) {
    const out: DocIssue[] = [];
    if (chose(v, 'requested', 'はい')) {
      out.push({
        level: 'warn',
        message: '本人が請求していない事項は記入できません。請求のなかった項目は空欄のままにするか、行ごと削除して交付してください。',
        basis: '労働基準法22条3項',
      });
    }
    return out;
  },

  roudou(v) {
    const out: DocIssue[] = [];
    if (!text(v, 'placeRange')) {
      out.push({
        level: 'fatal',
        field: 'placeRange',
        message: '「就業場所の変更の範囲」が空欄です。2024年4月から全ての労働者への明示が必須になった項目で、欠けると労働条件明示義務違反になります。',
        basis: '労働基準法15条1項・同法施行規則5条',
      });
    }
    if (!text(v, 'dutyRange')) {
      out.push({
        level: 'fatal',
        field: 'dutyRange',
        message: '「業務の変更の範囲」が空欄です。2024年4月から全ての労働者への明示が必須になった項目です。',
        basis: '労働基準法15条1項・同法施行規則5条',
      });
    }
    return out;
  },

  invoice(v) {
    const out: DocIssue[] = [...taxItemIssues(v, 6)];
    if (v['regno'] && !isRegistrationNo(v['regno'])) {
      out.push({
        level: 'warn',
        field: 'regno',
        message: '登録番号は「T」＋13桁の数字です。形式が違うと適格請求書の記載事項を満たさず、受け取った側が仕入税額控除を受けられません。',
        basis: '消費税法57条の4',
      });
    }
    return out;
  },

  shiharai(v) {
    const out: DocIssue[] = [...taxItemIssues(v, 4)];
    if (v['toReg'] && !isRegistrationNo(v['toReg'])) {
      out.push({
        level: 'warn',
        field: 'toReg',
        message: '仕入明細書には「相手方（売手）の登録番号」の記載が必要です。「T」＋13桁の形式を確認してください。自社の番号ではありません。',
        basis: '消費税法30条9項3号',
      });
    }
    out.push({
      level: 'info',
      message: '仕入明細書が仕入税額控除の要件を満たすには、相手方の確認を受ける必要があります。「期限までに連絡がなければ確認があったものとする」旨の記載か、返信による確認を残してください。',
      basis: '消費税法30条9項3号',
    });
    return out;
  },

  nouhin(v) {
    const out: DocIssue[] = [];
    if (v['reg'] && !isRegistrationNo(v['reg'])) {
      out.push({ level: 'warn', field: 'reg', message: '登録番号は「T」＋13桁の数字です。形式を確認してください。', basis: '消費税法57条の4' });
    }
    return out;
  },

  kenshu(v) {
    const out: DocIssue[] = [];
    // 日付が読めなければ NaN になり、60日の判定は行われない。
    const days = Math.round((day(v, 'payday') - day(v, 'receiveDate')) / DAY);
    if (days > 60) {
      out.push({
        level: 'fatal',
        field: 'payday',
        message: `支払期日が受領日から ${days} 日後になっています。支払期日は給付を受領した日から起算して60日以内に定める必要があります（起算日は検収日ではなく受領日）。`,
        basis: '中小受託取引適正化法（2026年1月施行）・フリーランス法',
      });
    }
    return out;
  },

  hacchu() {
    return [{
      level: 'info' as const,
      message: '委託事業者は、給付の内容・代金の額・支払期日等を記載した発注書面を直ちに交付する義務を負います。取引書類は2年間保存してください。手形による代金の支払は禁止されています。',
      basis: '中小受託取引適正化法4条（2026年1月施行）',
    }];
  },

  'chuumon-uke'() {
    return [{
      level: 'info' as const,
      message: '請負に関する注文請書は印紙税第2号文書として課税されます（1万円未満は非課税）。物品の売買のみなら原則不課税です。電子データで交付すれば課税文書に当たりません。',
      basis: '印紙税法（課税物件表第2号）',
    }];
  },

  baibai() {
    return [{
      level: 'info' as const,
      message: '継続的取引の基本となる契約書は印紙税第7号文書に当たり、1通あたり4,000円の収入印紙が必要です（契約期間3か月以内かつ更新の定めがないものを除く）。電子契約なら不要です。',
      basis: '印紙税法（課税物件表第7号）',
    }];
  },

  ryoshu(v) {
    if (num(v, 'amount') >= 50_000) {
      return [{
        level: 'info' as const,
        message: '紙で交付する受取書は、受取金額5万円以上で収入印紙が必要です（5万円以上100万円以下は200円）。消費税額を区分記載していれば税抜金額で判定できます。電子交付なら不要です。',
        basis: '印紙税法（課税物件表第17号）',
      }];
    }
    return [];
  },

  sokai: meetingQuorum('totalShares', 'presentShares', '出席株主の議決権数', '議決権の総数'),
  'rinji-sokai': meetingQuorum('totalShares', 'presentShares', '出席株主の議決権数', '議決権の総数'),
  torishimari: meetingQuorum('total', 'present', '出席取締役数', '取締役総数'),

  'kabunushi-meibo'(v) {
    const out: DocIssue[] = [];
    const total = num(v, 'totalShares');
    const sum = ['s1shares', 's2shares', 's3shares'].reduce((s, k) => s + (toNum(v[k]) ?? 0), 0);
    // 総数が読めないと突き合わせようがない。NaN は !== がつねに成立してしまうので明示的に外す。
    if (Number.isFinite(total) && sum > 0 && sum !== total) {
      out.push({
        level: 'warn',
        field: 'totalShares',
        message: `記載された株式数の合計（${sum} 株）が発行済株式の総数（${total} 株）と一致しません。`,
        basis: '会社法121条',
      });
    }
    if (Number.isFinite(total) && sum > total) {
      out.push({ level: 'fatal', field: 's1shares', message: '株主の保有株式数の合計が発行済株式の総数を超えています。' });
    }
    return out;
  },

  shunin() {
    return [{
      level: 'info' as const,
      message: '役員変更は原則として就任の日から2週間以内に本店の所在地で変更登記が必要です。就任承諾書のほか、本人確認証明書や印鑑証明書の添付が必要になる場合があります。',
      basis: '会社法915条1項・商業登記法54条',
    }];
  },

  annai() {
    return [{
      level: 'info' as const,
      message: '本店移転・役員変更は2週間以内の変更登記が必要です。あわせて税務署・都道府県税事務所・市区町村・年金事務所・労働基準監督署・ハローワーク・許認可官庁への届出も期限内に済ませてください。',
      basis: '会社法915条1項',
    }];
  },

  naiyo() {
    return [{
      level: 'info' as const,
      message: '催告による時効の完成猶予は6か月です。その間に訴えの提起・支払督促の申立て等をしなければ時効は完成します。到達日を証明するため配達証明を併用してください。',
      basis: '民法150条',
    }];
  },

  tokusoku() {
    return [{
      level: 'info' as const,
      message: '督促状の送付（催告）は6か月の完成猶予にとどまります。繰り返しても猶予は延長されません。回収の見込みが立たない場合は支払督促・少額訴訟への切替えを検討してください。',
      basis: '民法150条・民事訴訟法382条',
    }];
  },

  kaijo(v) {
    const out: DocIssue[] = [];
    if (chose(v, 'kind', '催告を要せず')) {
      out.push({
        level: 'warn',
        field: 'kind',
        message: '無催告解除ができるのは、履行不能・明確な履行拒絶・定期行為の時期経過など民法542条の要件に該当する場合か、契約に無催告解除の特約がある場合に限られます。要件を満たさない解除は無効となり、逆に債務不履行を問われます。',
        basis: '民法541条・542条',
      });
    }
    return out;
  },

  'chotatsu-keikaku'(v) {
    const out: DocIssue[] = [];
    const need = money(v, 'equip') + money(v, 'working');
    const raise = ['selfFund', 'loanBank', 'loanPublic', 'subsidy', 'otherFund']
      .reduce((s, k) => s + money(v, k), 0);
    // 必要資金と調達額は必ず一致する。片方だけ直して他方を直し忘れるのが定番。
    // 空欄は num() が NaN を返すので isFinite で落ちる。両方 0 のときは need !== raise が
    // false になるので、「まだ何も入っていない」を別に見張る必要はない。
    if (Number.isFinite(need) && Number.isFinite(raise) && need !== raise) {
      out.push({
        level: 'fatal',
        field: 'selfFund',
        message: `必要資金の合計（${need.toLocaleString('ja-JP')} 円）と調達の合計（${raise.toLocaleString('ja-JP')} 円）が`
          + `${Math.abs(need - raise).toLocaleString('ja-JP')} 円 食い違っています。一致していない資金計画は内容を見てもらえません。`,
      });
    }
    const self = num(v, 'selfFund');
    // 「自己資金が調達総額の 1 割未満」を割り算せずに書く。raise が 0 のときに
    // 0/0 や x/0 の退化へ依存しなくて済み、ちょうど 1 割の境界もそのまま出る。
    if (self * 10 < raise) {
      out.push({
        level: 'warn',
        field: 'selfFund',
        message: '自己資金が調達総額の 1 割未満です。創業融資では自己資金の割合が返済能力の判断材料になります。',
      });
    }
    if (num(v, 'subsidy') > 0) {
      out.push({
        level: 'warn',
        field: 'subsidy',
        message: '補助金は原則として事業完了後の精算払いです。交付が決まっていても入金までの資金は別途つなぐ必要があるため、'
          + '当座の資金として当て込まないでください。',
      });
    }
    const years = num(v, 'years');
    if (years > 0) {
      const debt = money(v, 'loanBank') + money(v, 'loanPublic');
      if (debt > 0) {
        out.push({
          level: 'info',
          message: `借入 ${debt.toLocaleString('ja-JP')} 円を ${years} 年で返す場合、元金だけで年 `
            + `${Math.round(debt / years).toLocaleString('ja-JP')} 円 の返済になります。`
            + '返済原資（営業利益＋減価償却費）がこれを上回るか確認してください。',
        });
      }
    }
    return out;
  },

  'jigyo-keikaku'(v) {
    const out: DocIssue[] = [];
    const years = [1, 2, 3].map((n) => ({ n, sales: num(v, `y${n}sales`), profit: num(v, `y${n}profit`) }));
    for (const y of years) {
      if (y.profit > y.sales) {
        out.push({
          level: 'warn',
          field: `y${y.n}profit`,
          message: `${y.n}年目の経常利益が売上高を上回っています。数字の入れ違いがないか確認してください。`,
        });
      }
    }
    const first = num(v, 'y1sales');
    const third = num(v, 'y3sales');
    if (first > 0 && third > first * 5) {
      out.push({
        level: 'warn',
        field: 'y3sales',
        message: '3年目の売上高が1年目の5倍を超えています。算出根拠に単価・件数・頻度の内訳がないと、審査では根拠なしと見られます。',
      });
    }
    if (!(v['basis'] ?? '').trim()) {
      out.push({
        level: 'fatal',
        field: 'basis',
        message: '売上計画の算出根拠が空欄です。融資・補助金の審査で最も見られる項目で、ここが無い計画書は数字を信用してもらえません。',
      });
    }
    return out;
  },

  'kojin-itaku'() {
    return [{
      level: 'info' as const,
      message: '契約を結んだだけでは委託先の監督義務を果たしたことになりません。委託先の選定基準、取扱状況の定期確認、再委託の承諾記録まで残してください。委託先で漏えいが起きた場合、報告義務を負うのは原則として委託元です。',
      basis: '個人情報保護法25条・26条',
    }];
  },

  privacy() {
    return [{
      level: 'info' as const,
      message: '公表しただけでは足りません。記載した利用目的・第三者提供・委託の運用が実態と一致しているか、年1回は突き合わせてください。実態と異なる公表はそれ自体がリスクです。',
      basis: '個人情報保護法17条・21条',
    }];
  },

  chingin() {
    return [{
      level: 'info' as const,
      message: '常時10人以上の労働者を使用する事業場では、賃金規程も就業規則の一部として、過半数代表者の意見書を添えて所轄労働基準監督署長に届け出、労働者に周知する必要があります。',
      basis: '労働基準法89条・90条・106条',
    }];
  },

  harassment() {
    return [{
      level: 'info' as const,
      message: '規程の制定だけでは措置義務を果たしたことになりません。相談窓口の周知、担当者への対応手順の共有、相談記録の作成・保管まで整備してください。',
      basis: '労働施策総合推進法30条の2',
    }];
  },
};

/** 議事録の定足数チェック（出席数 > 総数 は明らかな記載誤り）。 */
function meetingQuorum(totalKey: string, presentKey: string, presentLabel: string, totalLabel: string) {
  return (v: Values): DocIssue[] => {
    const total = num(v, totalKey);
    const present = num(v, presentKey);
    // どちらかが読めなければ present > total は false になり、そのまま [] を返す。
    if (present > total) {
      return [{
        level: 'fatal',
        field: presentKey,
        message: `${presentLabel}（${present}）が${totalLabel}（${total}）を超えています。`,
      }];
    }
    return [];
  };
}

/**
 * 個別ルールを持つ書式の id。
 *
 * ルールを足したのにテストの網羅リストへ入れ忘れると、その書式だけ検査から
 * 静かに漏れる。実体から引けるようにしておき、テスト側で突き合わせる。
 */
export function ruleDocIds(): readonly string[] {
  return Object.keys(RULES);
}

/**
 * 書式と入力値から検出した問題を返す。
 * 並びは fatal → warn → info の順（同レベル内は検出順）。
 */
export function checkDoc(doc: StudioDoc, values: Values): readonly DocIssue[] {
  const out: DocIssue[] = [];

  // 必須項目の空欄
  for (const f of doc.fields) {
    if (f.req && !text(values, f.k)) {
      out.push({ level: 'warn', field: f.k, message: `「${f.label}」が未入力です。` });
    }
  }

  // 数値項目に数値が入っていない
  for (const f of doc.fields) {
    const raw = text(values, f.k);
    if (f.num && raw && toNum(raw) === null) {
      out.push({ level: 'warn', field: f.k, message: `「${f.label}」を数値として読み取れません（入力値: ${raw}）。` });
    }
  }

  out.push(...(RULES[doc.id]?.(values) ?? []));

  // sort は ES2019 以降 安定ソートが保証されるので、同順位は検出順のまま残る。
  return [...out].sort(byIssueLevel);
}

/** 未入力のフィールド数（差込プレビューで【】のまま残る数）。 */
export function countBlank(doc: StudioDoc, values: Values): number {
  return doc.fields.filter((f) => !(values[f.k] ?? '').trim()).length;
}
