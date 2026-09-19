/**
 * Security service: aggregates a few independent signals into one
 * dashboard tab.
 *
 * Norton 360 — local installation detection only. Norton has no public
 *   consumer REST API; we just look for the well-known install paths on
 *   Windows / macOS so the user can see at a glance whether the AV is
 *   in place. Anything beyond that (real-time threat counts, scan
 *   results) would require parsing Norton's internal SQLite/XML state
 *   and isn't portable across versions.
 *
 * Have I Been Pwned (HIBP) — paid public API ($3.50/mo). Lets the user
 *   check whether one of their email addresses appears in any known
 *   breach.
 *
 * VirusTotal — free-tier public API. Lets the user submit a URL for
 *   reputation lookup against ~70 antivirus engines.
 *
 * The HIBP and VT keys are stored together as a single JSON blob under
 * the "security" service id, so users only configure one credential
 * even though two providers are involved.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hibpBreaches } from '../../shared/securityResponse';
import {
  HIBP_API,
  HIBP_NO_BREACH_STATUS,
  VIRUSTOTAL_API,
  VT_URLS_PATH,
  checkBreachEmail,
  checkScanUrl,
  hibpBreachedAccountPath,
  hibpInit,
  parseSecurityKeys,
  summarizeVtReport,
  vtReportInit,
  vtReportPath,
  vtSubmitInit,
} from '../../shared/api/security';
import {
  jsonFetch,
  limitedFetch,
  readCapped,
  FetchError,
  redactForMessage,
  MAX_RESPONSE_BODY_IN_MESSAGE,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';
import type { ActionData } from '../../shared/actionData';
import type { NortonDetection } from '../../shared/nortonDetection';

interface NortonStatus {
  installed: boolean;
  installPath: string;
  platform: string;
  details: string;
  /**
   * 「見た結果」と「見られなかった」を分ける (パス 165)。`installed` の真偽だけでは
   * 「探して無かった」と「探せない」が同じ札になり、**ウイルス対策の有無について
   * 見ていない端末に警告を出す**。文面と色は `shared/nortonDetection.ts` が持つ。
   */
  detection: NortonDetection;
}

export interface SecuritySnapshot {
  norton: NortonStatus;
  breaches: { email: string; checkedAt: string; count: number }[];
  lastUrlScan: {
    url: string;
    scannedAt: string;
    positives: number;
    total: number;
  } | null;
  keysConfigured: { hibp: boolean; vt: boolean };
}

/*
 * 資格情報の解析 (`parseSecurityKeys`) は `shared/api/security.ts` の 1 つ (ブラウザ版も同じ関数)。
 * 検査 (`security.test.ts` / `dualBuildParity.test.ts`) が読むので名前はここからも出す。
 */
export { parseSecurityKeys };

/** HIBP は User-Agent 必須。デスクトップ版は自分で名乗る (ブラウザ版は Worker が名乗る)。 */
const USER_AGENT = 'service-hub-desktop';

const NORTON_PATHS_BY_PLATFORM: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Norton 360',
    'C:\\Program Files (x86)\\Norton 360',
    'C:\\ProgramData\\Norton',
  ],
  darwin: [
    '/Applications/Norton 360.app',
    '/Applications/Norton Security.app',
    '/Library/Application Support/Symantec',
  ],
  linux: [], // Norton doesn't ship for Linux
};

/** Stat-like probe abstracted from `fs.stat` so the search loop can be
 *  unit-tested with an in-memory stub. Returns the candidate that maps
 *  to a directory, or null if none of them do. */
export async function findExistingDirectory(
  candidates: readonly string[],
  probe: (p: string) => Promise<{ isDirectory: () => boolean }>,
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const stat = await probe(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

/** Build the "no Norton found" details message — pure so each branch
 *  is unit-testable without filesystem stubbing. */
export function nortonNotFoundDetails(platform: NodeJS.Platform): string {
  return platform === 'linux'
    ? 'Norton 360 は Linux 版が無いため検出対象外です'
    : '既知のパスに Norton 360 のインストールは見つかりませんでした';
}

export async function detectNorton(
  platform: NodeJS.Platform = process.platform,
  // Default probe is real fs.stat. Mutating to `() => undefined` is
  // observable only on a host where Norton IS installed AND the test
  // omits the probe arg — combinations that none of our unit tests
  // produce (production callers use the default; tests inject a fake).
  // Stryker disable next-line ArrowFunction
  probe: (p: string) => Promise<{ isDirectory: () => boolean }> = (p) => fs.stat(p),
): Promise<NortonStatus> {
  const candidates = NORTON_PATHS_BY_PLATFORM[platform] ?? [];
  const found = await findExistingDirectory(candidates, probe);
  if (found !== null) {
    return {
      installed: true,
      installPath: found,
      platform,
      details: `${path.basename(found)} を検出`,
      detection: 'found',
    };
  }
  return {
    installed: false,
    installPath: '',
    platform,
    details: nortonNotFoundDetails(platform),
    // 候補のパスが 1 本も無い OS (linux) は「探して無かった」ではなく「製品が無い」。
    // 判定は `NORTON_PATHS_BY_PLATFORM` の実物から導く (OS 名を写さない)。
    detection: candidates.length === 0 ? 'unsupported' : 'absent',
  };
}

export async function fetchSecuritySnapshot(ctx: FetchContext): Promise<SecuritySnapshot> {
  const keys = parseSecurityKeys(ctx.token);
  const norton = await detectNorton();

  // We don't auto-query HIBP / VT here — those have rate limits and
  // require the user's email / URL. Just reflect whether the keys are
  // present so the UI can enable / disable the action forms.
  void os.homedir(); // touched here to keep `os` imported for future expansions

  return {
    norton,
    breaches: [],
    lastUrlScan: null,
    keysConfigured: { hibp: !!keys.hibp, vt: !!keys.vt },
  };
}

// --- write-side actions --------------------------------------------------

/*
 * 欄の判定・URL・ヘッダ・VirusTotal の id・検出数の集計は `shared/api/security.ts` の
 * 1 つで、ブラウザ版も同じ関数を通る (パス 321)。ここに残るのは送る道
 * (`limitedFetch` / `jsonFetch` —— 打ち切りと応答サイズの上限) と断りの運び方だけ。
 */

export interface CheckEmailBreachPayload {
  email: string;
}

async function checkEmailBreach(
  ctx: ActionContext,
): Promise<ActionData<'security/check-email-breach'>> {
  // 空白落としと空の断りは共有 (パス 285 —— 2026-08-22 にこちらだけ `.trim()` が無く、
  // 空白付きの住所で HIBP が 404 を返し「どの漏洩にも含まれない」と表示した組)。
  const email = checkBreachEmail(ctx.payload);
  const keys = parseSecurityKeys(ctx.token);
  if (!keys.hibp) throw new Error('HIBP API key not configured');

  // HIBP returns 404 when the email is not in any breach — treat that
  // as a normal "no breaches" response, not an error. `jsonFetch` は !ok を
  // 必ず投げるのでここでは使えないが、**打ち切りと応答サイズの上限は要る**
  // ので `limitedFetch` + `readCapped` を通す (2026-08-23)。
  const hctx = { fetch: ctx.fetch, serviceId: 'security' };
  return limitedFetch(
    `${HIBP_API}${hibpBreachedAccountPath(email)}`,
    hibpInit(keys.hibp, USER_AGENT),
    hctx,
    // HIBP は 404 が「どの侵害にも含まれない」という**正常応答**。
    // その枝は本文を読まないので、limitedFetch が捨てる。
    async (res) => {
      if (res.status === HIBP_NO_BREACH_STATUS) return { email, breaches: [] };
      if (!res.ok) {
        const body = await readCapped(res, hctx).catch(() => '');
        throw new FetchError(`HIBP ${res.status}: ${redactForMessage(body, MAX_RESPONSE_BODY_IN_MESSAGE)}`, res.status, 'security');
      }
      const bodyText = await readCapped(res, hctx);
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        throw new FetchError('HIBP の応答が JSON ではありません', res.status, 'security');
      }
      // **要素ごとに欄を要求する** (パス 261)。直す前は `as HibpBreach[]` で、
      // `["x"]` / `[{}]` の応答が「名前も日付も件数も空の漏洩 1 件」になった
      // (ブラウザ側で実測)。規則は `shared/securityResponse.ts` に 1 つ。
      try {
        return { email, breaches: hibpBreaches(parsed) };
      } catch (e) {
        throw new FetchError(e instanceof Error ? e.message : String(e), res.status, 'security');
      }
    },
  );
}

export interface ScanUrlPayload {
  url: string;
}

async function scanUrl(
  ctx: ActionContext,
): Promise<ActionData<'security/scan-url'>> {
  // payload は renderer から来る任意の値。第三者へ送る入口なので、送ってよい形かを
  // 先に確かめる (`shared/scanTarget.ts` —— 共有の `checkScanUrl` が呼ぶ)。
  const url = checkScanUrl(ctx.payload);
  const keys = parseSecurityKeys(ctx.token);
  if (!keys.vt) throw new Error('VirusTotal API key not configured');
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'security' };

  // Submit URL for analysis (so the report is fresh).
  await jsonFetch<unknown>(`${VIRUSTOTAL_API}${VT_URLS_PATH}`, vtSubmitInit(url, keys.vt), fetchCtx);

  // VirusTotal identifies a URL by base64url(url) on the GET endpoint (`vtReportPath`).
  const report = await jsonFetch<unknown>(`${VIRUSTOTAL_API}${vtReportPath(url)}`, vtReportInit(keys.vt), fetchCtx);
  return summarizeVtReport(url, report);
}

export const ACTIONS: ActionMap = {
  'check-email-breach': checkEmailBreach,
  'scan-url': scanUrl,
};
