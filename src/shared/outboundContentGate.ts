// 生成物 —— src/shared/outboundContentGate.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * **出力インターセプター** —— 端末の外へ出る action の本文を、送る直前に**決定論**で検める
 * (2026-10-29 · パス 552 · threat: T-215)。
 *
 * ## なぜ要るか
 *
 * AI は「命令」と「データ」を構造的に区別できない。間接プロンプトインジェクション (読ませた
 * メール・Slack・ファイルの中の指示) で騙されたモデルが「この内容を送れ」と判断しても、**最後に
 * 送るのはアプリである**。そこで送る側に、確率ではなく規則で働く関門を置く ——
 * 「AI の頭は騙せても、システムの手足は動かない」形。実測 (2026-10-29 · パス 552 の測定):
 * 送る前に本文の中身を検める処理は main の `action:invoke` にもブラウザ版の `invoke` にも
 * **0 件**だった (在ったのは長さの天井・欄数の上限・危機の文面の保留だけ)。
 *
 * ## 何を止めるか (3 類・どれも規則で定義できる形だけ)
 *
 * 1. **資格情報の形** —— API キー・トークン・秘密鍵 (`SECRET_SHAPES` + `redactSecrets` の規則)。
 *    画面が貼り付けた文の中に紛れた鍵や、保存値から流れ込んだ鍵がそのまま AI / SaaS へ出る形。
 * 2. **マイナンバー (個人番号)** —— 12 桁で検査数字が合う物 (番号法施行令 §8 の算式)。
 *    数字の並びだけでは電話番号・注文番号と見分けられないので、検査数字を検める。
 * 3. **クレジットカード番号** —— 主要ブランドの先頭 + 13〜19 桁 + Luhn。
 *
 * **止めないもの (正直に書く)**: メールアドレス・電話番号・氏名・取引先コード。メール下書きや
 * Slack への投稿にはそれらが正当に入るので、規則で止めると製品が使えなくなる。顧客名簿のような
 * 「この組織固有の機微」は、利用者が台帳 (`CUSTOM_DENY_PATTERNS` · 今は空) に正規表現で足す
 * 場所だけを用意してある (次の段階)。
 *
 * ## どこに置くか
 *
 * **全 action が通る 1 か所** —— main は `ipcMain.handle('action:invoke')` の中 (本人確認の前)、
 * ブラウザ版は `web-shim.ts` の `shim.invoke` (`withFloor` の中)。画面ごとに置くと新しい画面が
 * 通し忘れる (危機の保留 T-207 が画面側に在ったので `skills` と `emotions` が外れていた形)。
 * 対象は段階 (`OUTBOUND_TIERS` = `external-write` / `egress`) で決める —— 端末内に書く action に
 * 鍵が入っても外へは出ないので止めない (止めると資格情報の正当な保存が壊れる)。
 *
 * ## 正当に資格情報を載せる欄
 *
 * `shopify/sync-to-*` は連携先 (Slack / LINE / Discord …) のトークンを payload で受け取る設計
 * (`shopify.ts` の各コネクタの docblock)。その欄だけは `CREDENTIAL_PAYLOAD_FIELDS` に理由つきで
 * 載せて検めない (両方向の台帳は `outboundContentGate.test.ts` が持つ)。
 *
 * ## 失敗の向き
 *
 * 断るときは**何の形が・どの欄に**在ったかを言い、**値そのものは 1 字も言わない** (断りの文が
 * 新しい漏れ口になる)。読めない payload (深すぎる・大きすぎる) は「安全」と見なさず断る。
 *
 * ## Mamori で書いてある (2026-11-05 · MG-038)
 *
 * 元は TypeScript。Mamori 0.19 で書き直した。足りなかったのは `!` (non-null)・C 風の `for`・テンプレート文字列・複合代入・
 * 文字列キーの添字 `TABLE[key]!` だけで、組み上がる文字列は 1 字も変えていない。正規表現の `exec` を回す所は 0.19 の `while`、
 * 再帰する `walk` は先に空の関数で宣言して後で据える (Mamori は前方参照を断る)。`redactSecrets` / 段階の台帳 / 文字数の天井は外から読む。
 */

import { moreThanChars } from './inputCeiling';
import { redactSecrets } from './redact';
import { OUTBOUND_TIERS, tierOfAction } from './actionTier';

/**
 * 1 つの文字列を検める上限 (**文字**で数える · `moreThanChars`)。超えた文字列は「読めない」として断る ——
 * 切って通すと末尾に隠せる。外へ出る欄で最大なのは AI の system (`MAX_ASSISTANT_SYSTEM_CHARS` 60,000) なので、
 * 正当な本文はこの上限に当たらない。
 */
export const MAX_SCANNED_CHARS = 100000;

/** payload を歩く深さの上限 (超えたら「読めない」として断る)。 */
export const MAX_PAYLOAD_DEPTH = 8;

/** 検める文字列の総数の上限 (超えたら断る —— 欄数の上限 24 とは別に、配列で膨らむ形を止める)。 */
export const MAX_SCANNED_STRINGS = 2000;

export type OutboundFindingKind = 'secret' | 'my-number' | 'card-number' | 'custom';

export interface OutboundFinding {
  readonly kind: OutboundFindingKind;
  /** payload の中の場所 (`messages[0].content` の形)。値は含めない。 */
  readonly path: string;
  /** 利用者に見せる名前。 */
  readonly label: string;
}

export const FINDING_LABELS: Readonly<Record<OutboundFindingKind, string>> = { secret: 'API キー・トークンなどの資格情報の形', 'my-number': 'マイナンバー (個人番号) の形', 'card-number': 'クレジットカード番号の形', custom: '組織が止めると決めた形' };

/** 種類から利用者に見せる名前を引く (組織固有の形は今日の台帳が空なので、`scanPayload` の経路では届かない —— 検査は直に呼ぶ) (文字列キーの添字は Mamori に無いので switch で引く)。 */
export function labelOf(kind: OutboundFindingKind): string {
  switch (kind) {
    case 'secret':
      return FINDING_LABELS.secret;
    case 'my-number':
      return FINDING_LABELS['my-number'];
    case 'card-number':
      return FINDING_LABELS['card-number'];
    case 'custom':
      return FINDING_LABELS.custom;
  }
}

/**
 * 裸の資格情報の形。`redactSecrets` はヘッダ名・JSON 項目名・URL の引数・既知の接頭辞を伏せるが、
 * 接頭辞の無い物 (AWS のアクセスキー・JWT・秘密鍵の PEM) は伏せない (実測 2026-10-29)。
 * ここは**送らない**ための規則なので、伏せる側より広く取る。
 * `bearer-header` はヘッダの線上の形で、値は鍵らしい字種 (英数と . _ - / + =) が 16 字以上のときだけ —— 散文の「api-key: 設定済み」は当てない。
 */
export const SECRET_SHAPES: readonly { readonly id: string; readonly re: RegExp }[] = [{ id: 'anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ }, { id: 'openai', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/ }, { id: 'github-pat', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/ }, { id: 'github-fine-grained', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/ }, { id: 'slack', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ }, { id: 'slack-app', re: /\bxapp-[A-Za-z0-9-]{10,}/ }, { id: 'notion', re: /\b(?:ntn|secret)_[A-Za-z0-9]{20,}/ }, { id: 'shopify', re: /\bshp(?:at|ss|ca|pa)_[A-Fa-f0-9]{16,}/ }, { id: 'stripe', re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/ }, { id: 'gitlab', re: /\bglpat-[A-Za-z0-9_-]{16,}/ }, { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ }, { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{30,}/ }, { id: 'google-refresh-token', re: /\b1\/\/[0-9A-Za-z_-]{20,}/ }, { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ }, { id: 'private-key-pem', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ }, { id: 'bearer-header', re: /\b(?:Authorization|x-api-key|api-key)\s*[:=]\s*(?:Bearer\s+|Basic\s+|Token\s+)?[A-Za-z0-9._\-/+=]{16,}/i }];

/**
 * 組織固有の止める形 (正規表現)。**既定は空** —— 顧客コードの形は組織ごとに違い、
 * ここに手で足す (次の段階で設定画面から入れられるようにする)。
 */
export type CustomDenyPatterns = readonly { readonly id: string; readonly re: RegExp }[];

export const CUSTOM_DENY_PATTERNS: CustomDenyPatterns = [];

/**
 * 正当に資格情報を運ぶ欄 (`service/action` → 欄名)。検めない。
 * **理由を書く** —— 無言の除外は穴になる。
 */
export const CREDENTIAL_PAYLOAD_FIELDS: Readonly<Record<string, { readonly fields: readonly string[]; readonly why: string }>> = { 'shopify/sync-to-slack': { fields: ['token'], why: 'Slack の bot token を payload で受ける設計 (shopify.ts のコネクタ docblock)。Shopify の注文を Slack へ流すには Slack 側の鍵が要る。' }, 'shopify/sync-to-discord': { fields: ['webhookUrl'], why: 'Discord の webhook URL は秘密を含む URL そのもの (shopify.ts)。' }, 'shopify/sync-to-line': { fields: ['token'], why: 'LINE のチャネルアクセストークンを payload で受ける (shopify.ts)。' }, 'shopify/sync-to-gmail': { fields: ['token'], why: 'Gmail の OAuth アクセストークンを payload で受ける (shopify.ts)。' }, 'shopify/sync-to-notion': { fields: ['token'], why: 'Notion の integration token を payload で受ける (shopify.ts)。' }, 'shopify/sync-to-salesforce': { fields: ['token'], why: 'Salesforce のアクセストークンを payload で受ける (shopify.ts)。' }, 'shopify/sync-to-stripe': { fields: ['token'], why: 'Stripe の secret key を payload で受ける (shopify.ts)。' } };

const NO_SKIP: readonly string[] = [];

/** 検査数字を求める位置 (下から数えた n = 1 … 11)。 */
const POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** マイナンバー (12 桁) の検査数字 —— 番号法施行令 §8: Q_n = n ≦ 6 ? n + 1 : n − 5。 */
export function isValidMyNumber(digits: string): boolean {
  // 12 桁の数字だけを受ける (前後に字が付いた並びは、錨が弾く)。位置は charAt で読む (添字の鍵を計算しない)。
  if (!/^\d{12}$/.test(digits)) return false;
  let sum = 0;
  for (const n of POSITIONS) {
    const p = Number(digits.charAt(11 - n));
    const q = n <= 6 ? n + 1 : n - 5;
    sum = sum + p * q;
  }
  const r = sum % 11;
  const check = r <= 1 ? 0 : 11 - r;
  return Number(digits.charAt(11)) === check;
}

/**
 * 桁を 2 倍したときの各桁の和 (Luhn)。0〜4 は 2 倍するだけ、5〜9 は 2 倍して 9 を引く。
 * (表を添字で引く形は、鍵が計算した値なので Mamori が断る —— 算術で書く。境目は整数の 4 と 5 の間にあり、等価な比較が出ない。)
 */
function doubledDigit(d: number): number {
  return (d < 5) ? d * 2 : d * 2 - 9;
}

/** Luhn (mod 10)。 */
export function passesLuhn(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;
  // 和は mod 10 で持ち続ける (符号を反転しても割り切れるかは変わらないので、素の和では `+=` → `-=` が観測できない)。
  let sum = 0;
  let double = false;
  const chars = [...digits];
  chars.reverse();
  for (const ch of chars) {
    const d = Number(ch);
    // Stryker disable next-line ArithmeticOperator: 和を −和 に替えても 10 で割り切れるかは変わらない (等価)
    sum = (sum + (double ? doubledDigit(d) : d)) % 10;
    double = !double;
  }
  return sum === 0;
}

/** 主要ブランドの先頭 (Visa / Mastercard / Amex / JCB / Discover / Diners)。 */
const CARD_PREFIX = /^(?:4\d{15}(?:\d{3})?|5[1-5]\d{14}|2(?:2[2-9]\d|[3-6]\d{2}|7[01]\d|720)\d{12}|3[47]\d{13}|35(?:2[89]|[3-8]\d)\d{12}|6(?:011|5\d{2})\d{12}|3(?:0[0-5]|[68]\d)\d{11})$/;

/** 文の中の「数字の並び」(空白・ハイフン区切りを許す) を 1 つずつ取り出す。 */
export function digitRuns(text: string): string[] {
  const out: string[] = [];
  // 数字と単独の区切り (空白 / ハイフン) の並びを 1 つの「走り」として取り、区切りで群に分ける。
  // 群の連続する並びのうち桁の合計が 12〜19 の物をすべて候補にする —— 「鍵 … 0123456789 1234-5678-9018」
  // のように別の数字が隣接しても、個人番号の 12 桁が長い走りに飲まれて見えなくならないように。
  const re = /(?<!\d)\d(?:[ -]?\d){10,}(?!\d)/g;
  let m = re.exec(text);
  while (m !== null) {
    // 区切りは単独なので空の群は出ない (正規表現が `[ -]?\d` で 1 つしか許さない)。
    const groups = m[0].split(/[ -]/);
    groups.forEach((_g, i) => {
  let digits = '';
  for (const g of groups.slice(i)) {
    digits = digits + g;
    if (digits.length > 19) {
      break;
    }
    if (digits.length >= 12) {
      out.push(digits);
    }
  }
});
    m = re.exec(text);
  }
  return out;
}

export function findMyNumber(text: string): boolean {
  return digitRuns(text).some((d) => isValidMyNumber(d));
}

export function findCardNumber(text: string): boolean {
  return digitRuns(text).some((d) => CARD_PREFIX.test(d) && passesLuhn(d));
}

export function findSecret(text: string): boolean {
  if (SECRET_SHAPES.some((s) => s.re.test(text))) return true;
  // 既知の接頭辞・ヘッダ名・JSON 項目名・URL の引数 (伏字の規則をそのまま借りる —— 規則を 2 度書かない)。
  return redactSecrets(text) !== text;
}

/** 1 つの文字列に当たる形を全部返す (順序は固定)。 */
export function scanText(text: string, custom: CustomDenyPatterns = CUSTOM_DENY_PATTERNS): readonly OutboundFindingKind[] {
  const found: OutboundFindingKind[] = [];
  if (findSecret(text)) {
    found.push('secret');
  }
  if (findMyNumber(text)) {
    found.push('my-number');
  }
  if (findCardNumber(text)) {
    found.push('card-number');
  }
  if (custom.some((p) => p.re.test(text))) {
    found.push('custom');
  }
  return found;
}

export type OutboundVerdict =
  | { readonly kind: 'clear' }
  | { readonly kind: 'refused'; readonly findings: readonly OutboundFinding[]; readonly message: string }
  | { readonly kind: 'unreadable'; readonly message: string };

/** payload を歩き、文字列の葉を検める。`skipFields` はその action で資格情報を正当に運ぶ**最上位の**欄名。 */
export function scanPayload(payload: unknown, skipFields: readonly string[]): OutboundVerdict {
  let findings: OutboundFinding[] = [];
  let count = 0;
  let tooDeep = false;
  // 再帰するので先に空の関数で宣言して後で据える。
  let walk: (v: unknown, path: string, depth: number, top: boolean) => void = () => {

};
  walk = (v, path, depth, top) => {
  // Stryker disable next-line ConditionalExpression,LogicalOperator: 費用の短絡 —— 答えは末尾の判定 (tooDeep / count) が同じに決める
  if (tooDeep || count > MAX_SCANNED_STRINGS) return;
  if (depth > MAX_PAYLOAD_DEPTH) {
    tooDeep = true;
    return;
  }
  if (typeof v === 'string') {
    count = count + 1;
    if (moreThanChars(v, MAX_SCANNED_CHARS)) {
      tooDeep = true;
      return;
    }
    for (const kind of scanText(v)) {
      findings = [...findings, { kind, path, label: labelOf(kind) }];
    }
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((item, i) => walk(item, path + '[' + i + ']', depth + 1, false));
    return;
  }
  if (v !== null && typeof v === 'object') {
    for (const entry of Object.entries(v)) {
      const k = entry[0];
      const item = entry[1];
      if (top && skipFields.includes(k)) {
        continue;
      }
      walk(item, path === '' ? k : path + '.' + k, depth + 1, false);
    }
  }
};
  walk(payload, '', 0, true);
  if (tooDeep || count > MAX_SCANNED_STRINGS) return { kind: 'unreadable', message: '送る内容が大きすぎる・深すぎるため、中身を検められません。送りません。' };
  if (findings.length === 0) return { kind: 'clear' };
  // 同じ欄は 1 度しか歩かず、1 つの欄の中では scanText が種類を 1 度ずつ返すので、名指しは重ならない。
  const parts = findings.map((f) => f.label + ' (欄: ' + (f.path || '(全体)') + ')');
  return { kind: 'refused', findings, message: '送る内容に ' + parts.join('・') + ' が含まれているため、端末の外へは送りません。' + '該当する部分を取り除いてからもう一度押してください (この判定はアプリの規則で行い、AI の判断には依りません)。' };
}

/** その action で資格情報を正当に運ぶ欄 (台帳に無ければ 1 つも飛ばさない)。 */
function skippedFieldsOf(key: string): readonly string[] {
  for (const entry of Object.entries(CREDENTIAL_PAYLOAD_FIELDS)) {
    if (entry[0] === key) return entry[1].fields;
  }
  return NO_SKIP;
}

/**
 * action の本文を検めて、断るなら文を返す (null = 通す)。
 * 対象は段階が `external-write` / `egress` の action だけ。段階は台帳 (`ACTION_TIER`) が決め、
 * 載っていない action は `external-write` (= 検める側) に倒れる。
 */
export function outboundContentRefusal(serviceId: string, action: string, payload: unknown): string | null {
  const tier = tierOfAction(serviceId, action);
  if (!OUTBOUND_TIERS.has(tier)) return null;
  const key = serviceId + '/' + action;
  const verdict = scanPayload(payload, skippedFieldsOf(key));
  return verdict.kind === 'clear' ? null : verdict.message;
}
