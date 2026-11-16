/**
 * **受信の検疫** —— 届いた文面 (メール・チャット・貼られたリンク) を**開かずに**調べ、押せない形へ変える
 * (2026-11-16 · 利用者の依頼「開く前に、人や AI より先に無効化する」)。
 *
 * ## 何をして、何をしないか
 *
 * - **読むのは文字だけ**。リンクへは 1 度も取りに行かない (この module は網の口を持たない) —— 取りに行けば、
 *   それ自体が「開いた」ことになる (追跡の印が相手へ届き、取りに行った先が端末の網の内側かもしれない)。
 * - **判定は規則** (形) で、AI に訊かない。届いた文は AI への指示を運べるので (`promptInjection.ts`)、
 *   AI に読ませる前にここを通す。
 * - **`ok` は「安全」ではない** —— 「調べた範囲で兆候が無い」である。文面 (`inboundVerdictText`) がそう言う
 *   (URL スキャンが「誰も解析していない」を緑で出していた欠陥 · パス 403 と同じ形を作らない)。
 * - 見つけた兆候の文に、**届いた文面を引用しない** (断りの文が指示や偽の宛先を運び直さない)。
 *
 * ## 無効化 (`defangText`)
 *
 * リンクを**押せない綴り**へ書き換える: `https://evil.example/x` → `hxxps[:]//evil[.]example/x`。
 * 人が誤って押す道も、AI が道具で開く道も、この綴りでは働かない。不可視の字 (文を隠す道具) は落とす。
 * 書き換えた後の文にリンクが 1 つも残らないことは、検査が標本の全件で見る。
 *
 * ## 育て方
 *
 * 規則は `INBOUND_RULES` (兆候の種類) と下の表 (短縮リンクの名前・開くとプログラムが動く拡張子) に在る。
 * 見逃した形・誤って鳴った形は `security/inbound-samples.json` に標本として足し、規則を直す —— 標本は
 * 「鳴るはずの種類」と突き合わせて毎回の検査で留まる (週 1 の狩りの輪が、この面を狩る)。
 */
import { clampToCeiling, moreThanChars } from './inputCeiling';
import { detectPromptInjection } from './promptInjection';

/** 1 度に調べる文面の天井 (文字)。超えた分は調べず、調べていないことを兆候として出す (黙って切らない)。 */
export const MAX_INBOUND_TEXT_CHARS = 100_000;

export type InboundLevel = 'ok' | 'caution' | 'danger';

export type InboundCode =
  | 'dangerous-scheme'
  | 'disguised-host'
  | 'mismatched-link'
  | 'dangerous-file'
  | 'ai-injection'
  | 'sender-spoof'
  | 'lookalike-host'
  | 'ip-host'
  | 'shortened-link'
  | 'redirect-link'
  | 'plain-http'
  | 'odd-port'
  | 'other-scheme'
  | 'unreadable-link'
  | 'macro-file'
  | 'hidden-chars'
  | 'account-pressure'
  | 'asks-secret'
  | 'too-long';

export interface InboundRule {
  readonly level: 'caution' | 'danger';
  readonly text: string;
}

/** 兆候の種類と、利用者へ出す文。並びは出す順 (危険が先)。文は届いた文面を引用しない。 */
export const INBOUND_RULES: Readonly<Record<InboundCode, InboundRule>> = {
  'dangerous-scheme': { level: 'danger', text: '押すとプログラムや端末の機能が動く種類のリンクがあります (ウェブのページではありません)。' },
  'disguised-host': { level: 'danger', text: '本物らしい名前を「@」の前に置いて、行き先を偽っているリンクがあります。' },
  'mismatched-link': { level: 'danger', text: '表示されている宛先と、実際の行き先が違うリンクがあります。' },
  'dangerous-file': { level: 'danger', text: '開くとプログラムが動く種類のファイル名があります。' },
  'ai-injection': { level: 'danger', text: 'AI に命令を出そうとする文が含まれています (AI に読ませないでください)。' },
  'sender-spoof': { level: 'danger', text: '差出人の表示名が、実際のアドレスと別の送り主を名乗っています。' },
  'lookalike-host': { level: 'caution', text: '見た目の似た別の文字を使える形の宛先 (国際化ドメイン) があります。' },
  'ip-host': { level: 'caution', text: '名前ではなく数字 (IP アドレス) で書かれた行き先があります。' },
  'shortened-link': { level: 'caution', text: '短縮リンクがあります (本当の行き先が見えません)。' },
  'redirect-link': { level: 'caution', text: '別のページへ転送する形のリンクがあります (最後の行き先が見かけと違うことがあります)。' },
  'plain-http': { level: 'caution', text: '暗号化されていない (http の) リンクがあります。' },
  'odd-port': { level: 'caution', text: '通常と違う出入口 (ポート番号) を指定したリンクがあります。' },
  'other-scheme': { level: 'caution', text: 'ウェブ以外の宛先 (別のアプリを開く形) のリンクがあります。' },
  'unreadable-link': { level: 'caution', text: '形が崩れていて行き先を読み取れないリンクがあります。' },
  'macro-file': { level: 'caution', text: '中にプログラム (マクロ) を持てる種類のファイル名があります。' },
  'hidden-chars': { level: 'caution', text: '目に見えない文字が混ざっています (文の一部を隠す・並びを入れ替える道具です)。' },
  'account-pressure': { level: 'caution', text: 'アカウントの停止・確認などを理由に、急がせる文があります。' },
  'asks-secret': { level: 'caution', text: 'パスワードや認証コードなどの入力・返信を求める文があります。' },
  'too-long': { level: 'caution', text: '文面が長すぎるため、先頭の一部だけを調べました (残りは調べていません)。' },
};

const INBOUND_CODES = Object.keys(INBOUND_RULES) as readonly InboundCode[];

export interface InboundFinding {
  readonly code: InboundCode;
  readonly level: 'caution' | 'danger';
  readonly text: string;
  /** その兆候が当たった回数。 */
  readonly count: number;
}

export interface InboundReport {
  readonly level: InboundLevel;
  readonly findings: readonly InboundFinding[];
  /** 見つけたリンクの数。 */
  readonly links: number;
  /** リンクを押せない綴りへ書き換え、不可視の字を落とした文面。 */
  readonly defanged: string;
}

/** 押すとプログラム・端末の機能が動く scheme (小文字・末尾の `:` 付き)。 */
const DANGEROUS_SCHEMES: ReadonlySet<string> = new Set(['javascript:', 'vbscript:', 'data:', 'file:', 'smb:', 'ms-msdt:', 'search-ms:', 'ms-officecmd:']);

/** 短縮リンクのホスト (`www.` を除いた形)。 */
const SHORTENER_HOSTS: ReadonlySet<string> = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'is.gd', 'ow.ly', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'lnkd.in', 'x.gd', 't.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'onl.li',
]);

/** 開くとプログラムが動く拡張子。 */
const EXECUTABLE_EXTS: ReadonlySet<string> = new Set([
  'exe', 'scr', 'pif', 'bat', 'cmd', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta', 'msi', 'msp', 'jar', 'lnk', 'iso', 'img', 'vhd', 'apk', 'dmg', 'pkg', 'reg', 'chm', 'cpl', 'dll',
]);

/** マクロを持てる拡張子。 */
const MACRO_EXTS: ReadonlySet<string> = new Set(['docm', 'xlsm', 'pptm', 'dotm', 'xlam']);

/**
 * リンク: `scheme://…` か、scheme の無い `www.…`。空白・引用符・括弧 (`<>[]`)・日本語の字 (かな・漢字・全角の記号) で終わる ——
 * 日本語の文は空白なしでリンクに続く (`https://a.example/xをご覧ください`)。`://` の直後の `[…]` (IPv6) だけは括弧を読む。
 * 後ろが空でも拾う (`https://` の直後が日本語のホスト名なら、読み取れないリンクとして数える —— 黙って捨てない)。
 */
const LINK_RE = /(?:\b[a-z][a-z0-9+.-]{1,30}:\/\/(?:\[[0-9a-f:.%]{2,60}\])?|\bwww\.)[^\s<>"'`[\]\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]*/gi;
/** 押せる綴りの印: `://`・`www.`・押すと動く scheme。無効化した後の文面に 1 つも残らない。 */
const LIVE_RE = /:\/\/|\bwww\.|\b(?:javascript|vbscript):|\bdata:[a-z]+\/[a-z0-9.+-]+/i;
/** `//` を持たない、押すと動く scheme (`javascript:…` / `vbscript:…` / `data:種類/…`)。 */
const SCRIPT_SCHEME_RE = /\b(?:javascript|vbscript):|\bdata:[a-z]+\/[a-z0-9.+-]+/gi;
/** リンクの末尾に付いた句読点・閉じ括弧 (リンクの一部ではない)。 */
const TRAILING_PUNCT_RE = /[.,;:!?)\]}」』）。、]+$/;
/** Markdown のリンク `[表示](行き先)`。 */
const MARKDOWN_LINK_RE = /\[([^\]\n]{1,300})\]\(\s*([^)\s]{1,2000})/g;
/** HTML のリンク `<a … href="行き先" …>表示<`。 */
const HTML_LINK_RE = /<a\b[^>]{0,500}?\bhref\s*=\s*["']?([^"'\s>]{1,2000})[^>]{0,500}>([^<]{1,300})</gi;
/** ホスト名らしい並び (`a.example.com`)。 */
const HOST_TOKEN_RE = /(?:[a-z0-9-]+\.)+[a-z]{2,}/i;
/** ファイル名の拡張子 (`.exe` —— 後ろに英数字が続かない)。 */
const FILE_EXT_RE = /\.([a-z0-9]{2,4})(?![a-z0-9_-])/gi;
/** リンクとして読む行き先 (scheme か `www.` で始まる) —— `/login` のような相対の道は数えない。 */
const LINKLIKE_RE = /^(?:[a-z][a-z0-9+.-]{1,30}:|www\.)/i;
/** 数字だけのホスト (IPv4)。IPv6 は `[` で始まる。 */
const IPV4_HOST_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
/** 転送先を運ぶ引数 (`?next=https://…` · `%3A%2F%2F` の形も)。 */
const REDIRECT_PARAM_RE = /https?(?::|%3a)(?:\/|%2f){2}/i;
/** 不可視・ゼロ幅・並びを入れ替える字。 */
const HIDDEN_CHARS_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
/** 急がせる文 (アカウントの停止・確認)。正規化 (NFKC → 小文字) した文に当てる。 */
const ACCOUNT_PRESSURE_RES: readonly RegExp[] = [
  /(?:アカウント|口座|カード|お支払い|支払方法|会員資格)[^\n。]{0,30}(?:停止|凍結|ロック|制限|無効|失効|解約|確認が必要|更新が必要)/,
  /(?:24|48|72)\s*時間以内に[^\n。]{0,30}(?:確認|手続|更新|ログイン|対応)/,
  /\b(?:account|password|payment|card)\b[^\n.]{0,40}\b(?:suspend(?:ed)?|locked|disabled|expire[sd]?|unusual|unauthori[sz]ed)\b/,
  /\bverify\s+your\s+(?:account|identity|payment)\b/,
];
/** 秘密の入力・返信を求める文。 */
const ASKS_SECRET_RES: readonly RegExp[] = [
  /(?:パスワード|暗証番号|認証コード|確認コード|ワンタイム|セキュリティコード|カード番号|マイナンバー)[^\n。]{0,20}(?:入力|返信|送信|教えて|お知らせください|ご記入)/,
  /\b(?:enter|confirm|send|reply\s+with|provide)\b[^\n.]{0,30}\b(?:password|passcode|pin|verification\s+code|one[- ]time\s+code|card\s+number)\b/,
];

/** 当たった兆候を数える器。 */
type Tally = Map<InboundCode, number>;

function hit(tally: Tally, code: InboundCode, times = 1): void {
  if (times > 0) tally.set(code, (tally.get(code) ?? 0) + times);
}

/** 文面の中で、式が当たった回数。 */
function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** `www.` を除いた小文字のホスト。 */
function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/** 2 つのホストが同じ送り主か (同じ・片方がもう片方のサブドメイン)。 */
function sameSite(a: string, b: string): boolean {
  const x = bareHost(a);
  const y = bareHost(b);
  return x === y || x.endsWith('.' + y) || y.endsWith('.' + x);
}

/** リンクの綴りを URL として読む (scheme の無い `www.…` は https として)。読めなければ null。 */
function parseLink(raw: string): URL | null {
  try {
    return new URL(/^www\./i.test(raw) ? 'https://' + raw : raw);
  } catch {
    return null;
  }
}

/** パスの最後の名前の拡張子 (小文字)。無ければ空文字。 */
function pathExtension(pathname: string): string {
  const name = pathname.slice(pathname.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** リンク 1 本の兆候を数える。 */
function tallyLink(tally: Tally, raw: string): void {
  const u = parseLink(raw);
  if (u === null) {
    hit(tally, 'unreadable-link');
    return;
  }
  if (DANGEROUS_SCHEMES.has(u.protocol)) hit(tally, 'dangerous-scheme');
  else if (u.protocol === 'http:') hit(tally, 'plain-http');
  else if (u.protocol !== 'https:') hit(tally, 'other-scheme');
  if (u.username !== '' || u.password !== '') hit(tally, 'disguised-host');
  const host = u.hostname;
  if (host.startsWith('[') || IPV4_HOST_RE.test(host)) hit(tally, 'ip-host');
  if (host.includes('xn--')) hit(tally, 'lookalike-host');
  if (SHORTENER_HOSTS.has(bareHost(host))) hit(tally, 'shortened-link');
  if (u.port !== '') hit(tally, 'odd-port');
  if (REDIRECT_PARAM_RE.test(u.search + u.hash)) hit(tally, 'redirect-link');
  const ext = pathExtension(u.pathname);
  if (EXECUTABLE_EXTS.has(ext)) hit(tally, 'dangerous-file');
  else if (MACRO_EXTS.has(ext)) hit(tally, 'macro-file');
}

/** 表示の宛先 (文に書いたホスト) と実際の行き先が別の送り主なら数える。 */
function tallyShownTarget(tally: Tally, shown: string, href: string): void {
  const named = HOST_TOKEN_RE.exec(shown);
  const u = parseLink(href);
  if (named === null || u === null || u.hostname === '') return;
  if (!sameSite(named[0], u.hostname)) hit(tally, 'mismatched-link');
}

/** 文面から拾ったリンクの綴り (末尾の句読点を除く)。 */
export function extractLinks(text: string): string[] {
  return (text.match(LINK_RE) ?? []).map((m) => m.replace(TRAILING_PUNCT_RE, ''));
}

/** `[表示](行き先)` と `<a href="行き先">表示<` の組。 */
function shownTargets(text: string): { readonly shown: string; readonly href: string }[] {
  return [
    ...[...text.matchAll(MARKDOWN_LINK_RE)].map((m) => ({ shown: m[1]!, href: m[2]! })),
    ...[...text.matchAll(HTML_LINK_RE)].map((m) => ({ shown: m[2]!, href: m[1]! })),
  ];
}

/** 差出人 (`表示名 <アドレス>` か、アドレスだけ) の兆候を数える。 */
function tallySender(tally: Tally, sender: string): void {
  const m = /^([^<]*)<([^<>\s]+)>\s*$/.exec(sender);
  const display = m === null ? '' : m[1]!;
  const address = m === null ? sender.trim() : m[2]!;
  const host = address.slice(address.lastIndexOf('@') + 1).toLowerCase();
  if (host.includes('xn--') || /[\u0080-\uffff]/.test(host)) hit(tally, 'lookalike-host');
  const named = HOST_TOKEN_RE.exec(display);
  if (named !== null && !sameSite(named[0], host)) hit(tally, 'sender-spoof');
}

/** 文面の兆候を数える (リンク・ファイル名・隠した字・急がせる文・AI への命令)。返すのはリンクの数。 */
function tallyText(tally: Tally, text: string): number {
  const pairs = shownTargets(text);
  // 素の綴りで拾ったリンクと、表示つきのリンクの行き先を合わせる (同じ綴りは 1 本と数える)。
  const links = new Set([...extractLinks(text), ...pairs.map((p) => p.href).filter((href) => LINKLIKE_RE.test(href))]);
  for (const raw of links) tallyLink(tally, raw);
  const scripts = countMatches(text, SCRIPT_SCHEME_RE);
  hit(tally, 'dangerous-scheme', scripts);
  for (const p of pairs) tallyShownTarget(tally, p.shown, p.href);
  // ファイル名は、リンクを除いた残りの文から拾う (リンクの中のホスト名を拡張子と読まない —— リンクのパスは上で見た)。
  for (const m of text.replace(LINK_RE, ' ').matchAll(FILE_EXT_RE)) {
    const ext = m[1]!.toLowerCase();
    if (EXECUTABLE_EXTS.has(ext)) hit(tally, 'dangerous-file');
    else if (MACRO_EXTS.has(ext)) hit(tally, 'macro-file');
  }
  hit(tally, 'hidden-chars', countMatches(text, HIDDEN_CHARS_RE));
  const norm = text.normalize('NFKC').toLowerCase();
  if (ACCOUNT_PRESSURE_RES.some((re) => re.test(norm))) hit(tally, 'account-pressure');
  if (ASKS_SECRET_RES.some((re) => re.test(norm))) hit(tally, 'asks-secret');
  if (detectPromptInjection(text) !== null) hit(tally, 'ai-injection');
  return links.size + scripts;
}

/** リンク 1 本を押せない綴りへ: `https://a.example/x` → `hxxps[:]//a[.]example/x`。 */
function defangLink(raw: string): string {
  const at = raw.indexOf('://');
  const scheme = at < 0 ? '' : raw.slice(0, at).replace(/^http/i, 'hxxp') + '[:]//';
  const rest = at < 0 ? raw : raw.slice(at + 3);
  const end = rest.search(/[/?#]/);
  const authority = end < 0 ? rest : rest.slice(0, end);
  const tail = end < 0 ? '' : rest.slice(end);
  return scheme + authority.replace(/\./g, '[.]').replace(/@/g, '[@]') + tail;
}

/** 文面のリンクを押せない綴りへ書き換え、不可視の字を落とす。 */
export function defangText(text: string): string {
  return text
    .replace(HIDDEN_CHARS_RE, '')
    .replace(LINK_RE, defangLink)
    // 残った `://` と `www.` (道や引数に運ばれた別のリンク・拾えなかった形) も押せない綴りへ。
    .replace(/:\/\//g, '[:]//')
    .replace(/\bwww\./gi, (m) => m.slice(0, 3) + '[.]')
    .replace(SCRIPT_SCHEME_RE, (m) => m.replace(':', '[:]'));
}

/** 書き換えた後の文面に、押せる綴りのリンクが残っているか (検査と、画面の最後の確認が使う)。 */
export function hasLiveLink(text: string): boolean {
  return LIVE_RE.test(text);
}

export interface InboundInput {
  /** 本文・件名など、届いた文面。文字列でなければ空として扱う。 */
  readonly text: unknown;
  /** 差出人 (`表示名 <アドレス>`)。在るときだけ調べる。 */
  readonly sender?: unknown;
}

/**
 * 届いた文面を調べる。網へは出ない・AI に訊かない。
 * `level` は見つけた兆候のうち最も重い物 (`ok` は「兆候が無い」であって「安全」ではない)。
 */
export function analyzeInbound(input: InboundInput): InboundReport {
  const full = typeof input.text === 'string' ? input.text : '';
  const tally: Tally = new Map();
  const tooLong = moreThanChars(full, MAX_INBOUND_TEXT_CHARS);
  const text = tooLong ? clampToCeiling(full, MAX_INBOUND_TEXT_CHARS) : full;
  if (tooLong) hit(tally, 'too-long');
  const links = tallyText(tally, text);
  if (typeof input.sender === 'string' && input.sender.trim() !== '') tallySender(tally, input.sender);
  const findings = INBOUND_CODES.filter((code) => tally.has(code)).map((code) => ({ code, level: INBOUND_RULES[code].level, text: INBOUND_RULES[code].text, count: tally.get(code)! }));
  const level: InboundLevel = findings.some((f) => f.level === 'danger') ? 'danger' : findings.length > 0 ? 'caution' : 'ok';
  return { level, findings, links, defanged: defangText(text) };
}

/** 判定の 1 文。`ok` は安全の保証ではないことを言う。 */
export function inboundVerdictText(report: Pick<InboundReport, 'level' | 'findings'>): string {
  const kinds = report.findings.length;
  switch (report.level) {
    case 'danger':
      return `このまま開かないでください —— 危険の兆候が ${kinds} 種類あります。`;
    case 'caution':
      return `開く前に確かめてください —— 気になる点が ${kinds} 種類あります。`;
    case 'ok':
      return '調べた範囲では、危険の兆候は見つかりませんでした。ただし「安全」の保証ではありません —— 心当たりの無い相手のリンクや添付は開かないでください。';
  }
}

/** 一覧の札 (兆候が無ければ null —— 札を出さない)。 */
export function inboundBadge(level: InboundLevel): string | null {
  switch (level) {
    case 'danger':
      return '⛔ 開く前に確認';
    case 'caution':
      return '⚠ 要注意';
    case 'ok':
      return null;
  }
}
