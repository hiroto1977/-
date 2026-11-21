import { utf8ToBase64Url } from '../base64';
import { BREACH_EMAIL_MESSAGES, SCAN_URL_MESSAGES, validateBreachEmail, validateScanUrl } from '../scanTarget';
import { vtScanStats } from '../securityResponse';

/**
 * **Security (HIBP / VirusTotal) の書き込み 2 経路 —— 両ビルドが同じ関数を通る** (2026-09-19 · パス 321)。
 *
 * それまで main (`clients/security.ts`) とブラウザ版 (`saasWriteWeb.ts`) に、資格情報の解析
 * (`parseSecurityKeys`)・URL・ヘッダ・VirusTotal の id (base64url)・検出数の集計が 1 つずつ在った。
 * 送る道 (main は `limitedFetch` / `jsonFetch`、ブラウザ版は `transport`) と User-Agent
 * (HIBP は UA 必須。main は自分で名乗り、ブラウザ版は Worker が名乗る) だけが呼び手に残る。
 */

export const HIBP_API = 'https://haveibeenpwned.com/api/v3';
export const VIRUSTOTAL_API = 'https://www.virustotal.com/api/v3';
/** 利用者に見せるレポートの入口 (API ではない)。 */
export const VIRUSTOTAL_REPORT_GUI = 'https://www.virustotal.com/gui/url';

export type SecurityTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface SecurityKeys {
  /** Have I Been Pwned API key */
  readonly hibp?: string;
  /** VirusTotal API key */
  readonly vt?: string;
}

/**
 * 保管庫の security トークンを解析する: JSON `{hibp, vt}` か、生の文字列なら HIBP キー。
 * 2026-09-19 まで両ビルドに 1 つずつ在り `dualBuildParity` が同じ答えを返すことで守っていた。
 */
export function parseSecurityKeys(raw: string): SecurityKeys {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON でなければ HIBP キー 1 つとして扱う (旧い保存形式)。
    return { hibp: raw };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const o = parsed as Record<string, unknown>;
  const out: { hibp?: string; vt?: string } = {};
  if (typeof o['hibp'] === 'string' && o['hibp']) out.hibp = o['hibp'];
  if (typeof o['vt'] === 'string' && o['vt']) out.vt = o['vt'];
  return out;
}

// --- HIBP: check-email-breach ---------------------------------------------------

/** HIBP は 404 を「どの漏洩にも含まれない」という**正常応答**として返す。 */
export const HIBP_NO_BREACH_STATUS = 404;

/** 空白落としと空の断りは `shared/scanTarget.ts` の 1 つ (パス 285 —— 双子がずれて誤った安心を返した組)。 */
export function checkBreachEmail(input: { readonly email?: unknown }): string {
  const checked = validateBreachEmail(input.email);
  if (!checked.ok) throw new Error(BREACH_EMAIL_MESSAGES[checked.reason]);
  return checked.email;
}

export function hibpBreachedAccountPath(email: string): string {
  return `/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`;
}

/** HIBP は User-Agent 必須。呼び手が名乗る (main は自分で、ブラウザ版は Worker が)。 */
export function hibpInit(hibpKey: string, userAgent: string): RequestInit {
  return {
    method: 'GET',
    headers: { 'hibp-api-key': hibpKey, 'User-Agent': userAgent, Accept: 'application/json' },
  };
}

/** ブラウザ版の口: 送って `Response` を返す (404 の判定は呼び手 —— 本文を読まない枝)。 */
export async function checkEmailBreachRequest(
  email: string,
  hibpKey: string,
  userAgent: string,
  transport: SecurityTransport,
): Promise<Response> {
  return transport(`${HIBP_API}${hibpBreachedAccountPath(email)}`, hibpInit(hibpKey, userAgent));
}

// --- VirusTotal: scan-url --------------------------------------------------------

/** payload は renderer から来る任意の値。第三者へ送る入口なので送ってよい形かを先に確かめる (`scanTarget.ts`)。 */
export function checkScanUrl(input: { readonly url?: unknown }): string {
  const checked = validateScanUrl(input.url);
  if (!checked.ok) throw new Error(SCAN_URL_MESSAGES[checked.reason]);
  return checked.url;
}

export const VT_URLS_PATH = '/urls';

/** VirusTotal の URL 識別子 = base64url(url) (パディング無し)。GET の端点が受ける簡便な形。 */
export function vtUrlId(url: string): string {
  return utf8ToBase64Url(url);
}

export function vtReportPath(url: string): string {
  return `${VT_URLS_PATH}/${encodeURIComponent(vtUrlId(url))}`;
}

/** 解析の投入 (レポートを最新化する)。 */
export function vtSubmitInit(url: string, vtKey: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'x-apikey': vtKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ url }).toString(),
  };
}

export function vtReportInit(vtKey: string): RequestInit {
  return { method: 'GET', headers: { 'x-apikey': vtKey } };
}

/** ブラウザ版の口: 投入して `Response` を返す。 */
export async function submitVtUrlRequest(url: string, vtKey: string, transport: SecurityTransport): Promise<Response> {
  return transport(`${VIRUSTOTAL_API}${VT_URLS_PATH}`, vtSubmitInit(url, vtKey));
}

/** ブラウザ版の口: レポートを取って `Response` を返す。 */
export async function fetchVtReportRequest(url: string, vtKey: string, transport: SecurityTransport): Promise<Response> {
  return transport(`${VIRUSTOTAL_API}${vtReportPath(url)}`, vtReportInit(vtKey));
}

export interface ScanSummary {
  readonly url: string;
  readonly positives: number;
  readonly total: number;
  readonly reportUrl: string;
}

/**
 * **4 つの内訳を 1 つずつ要求する** (`vtScanStats`・パス 261)。欄が欠けた応答は NaN の
 * 「検出数」を作っていた —— これは「この URL は危険か」という安全の判定なので、
 * 数えられなかったことを数え上げてはいけない。
 */
export function summarizeVtReport(url: string, report: unknown): ScanSummary {
  const s = vtScanStats(report);
  return {
    url,
    positives: s.malicious + s.suspicious,
    total: s.harmless + s.malicious + s.suspicious + s.undetected,
    reportUrl: `${VIRUSTOTAL_REPORT_GUI}/${vtUrlId(url)}`,
  };
}

/**
 * スキャン結果の判定。**`total === 0` は「きれい」ではない。** (2026-09-22 · パス 403)
 *
 * VirusTotal を呼ぶ流れは「POST /urls で解析を投入 → GET でレポートを読む」なので、
 * **その URL を VirusTotal が初めて見たときは解析が待ち行列に入っただけ**で、
 * `last_analysis_stats` は 4 欄とも 0 で返る。つまり `0 / 0` は異常な応答ではなく
 * **新しい URL の通常の経路**である。
 *
 * 実測 (2026-09-22 · 直す前):
 *
 * | 応答 | positives / total | 画面 |
 * | --- | --- | --- |
 * | 解析が未完了 (0 エンジン) | 0 / 0 | **`badge ok` (緑)** |
 * | 70 エンジンが無害と判定 | 0 / 75 | `badge ok` (緑) |
 *
 * **「誰も調べていない」と「75 台が調べて何も出なかった」が同じ緑の帯**になっていた。
 * 利用者はこの画面に「この URL を開いてよいか」を尋ねに来るので、数えられなかったことを
 * 「安全」として返してはいけない —— 法則 `blank-states-its-reason` の、安全の判定と
 * いちばん重い現れである (`vtScanStats` がパス 261 で「数えられなかったことを
 * 数え上げてはいけない」と欄の欠落を断ったのと同じ向きで、**全部 0 はその網を通る**)。
 *
 * しきい値 (検出 0 / 1〜2 / 3 以上) も**ここ 1 か所**で持つ —— 画面は同じ数を
 * className と style の 2 か所に書き写していた。
 */
export type ScanVerdict = 'unscanned' | 'clean' | 'few-detections' | 'many-detections';

/** 判定の 3 つの面 (札 / 帯の重さ / 全文)。**switch は 1 つ** (パス 386 / 402 と同じ理由)。 */
export interface ScanDescription {
  readonly verdict: ScanVerdict;
  /** 帯に出す短い札。 */
  readonly label: string;
  /** 重さ —— 画面はこれを見た目へ写す (`ok` だけが緑)。 */
  readonly level: 'ok' | 'warn' | 'danger';
  /** 利用者向けの 1 文。 */
  readonly note: string;
}

export function describeScan(s: { readonly positives: number; readonly total: number }): ScanDescription {
  // 検出が在れば、解析したエンジン数に関わらず「検出」である (順序が先)。
  if (s.positives > 2) {
    return {
      verdict: 'many-detections',
      label: `${s.positives} / ${s.total} エンジン検出`,
      level: 'danger',
      note: `${s.total} エンジンのうち ${s.positives} 件が脅威として検出しました。開かないでください。`,
    };
  }
  if (s.positives > 0) {
    return {
      verdict: 'few-detections',
      label: `${s.positives} / ${s.total} エンジン検出`,
      level: 'warn',
      note: `${s.total} エンジンのうち ${s.positives} 件が検出しました。詳細レポートで内容を確かめてください。`,
    };
  }
  // ここから先は検出 0 件 —— **その 0 には 2 つの意味が在る。**
  if (s.total <= 0) {
    return {
      verdict: 'unscanned',
      label: '未解析 (0 エンジン)',
      level: 'warn',
      note: 'まだどのエンジンも解析していません。VirusTotal へ解析を投入したところなので、少し時間を置いて再実行するか、詳細レポートで結果を確かめてください。この表示は「安全」を意味しません。',
    };
  }
  return {
    verdict: 'clean',
    label: `${s.positives} / ${s.total} エンジン検出`,
    level: 'ok',
    note: `${s.total} エンジンが解析し、脅威としての検出は 0 件でした。`,
  };
}
