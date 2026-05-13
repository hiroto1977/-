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
import {
  jsonFetch,
  FetchError,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';

interface NortonStatus {
  installed: boolean;
  installPath: string;
  platform: string;
  details: string;
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

interface SecurityKeys {
  hibp?: string; // Have I Been Pwned API key
  vt?: string;   // VirusTotal API key
}

export function parseSecurityKeys(raw: string): SecurityKeys {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const out: SecurityKeys = {};
      if (typeof parsed.hibp === 'string' && parsed.hibp) out.hibp = parsed.hibp;
      if (typeof parsed.vt === 'string' && parsed.vt) out.vt = parsed.vt;
      return out;
    }
  } catch {
    // not JSON — treat as a single HIBP key for convenience
    return { hibp: raw };
  }
  return {};
}

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
    };
  }
  return {
    installed: false,
    installPath: '',
    platform,
    details: nortonNotFoundDetails(platform),
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

interface CheckEmailBreachPayload {
  email: string;
}

interface HibpBreach {
  Name: string;
  Title: string;
  BreachDate: string;
  PwnCount: number;
  DataClasses: string[];
}

async function checkEmailBreach(
  ctx: ActionContext,
): Promise<{ email: string; breaches: { name: string; title: string; date: string; pwnCount: number; dataClasses: string[] }[] }> {
  const { email } = ctx.payload as unknown as CheckEmailBreachPayload;
  if (!email) throw new Error('email is required');
  const keys = parseSecurityKeys(ctx.token);
  if (!keys.hibp) throw new Error('HIBP API key not configured');

  const url =
    'https://haveibeenpwned.com/api/v3/breachedaccount/' +
    encodeURIComponent(email) +
    '?truncateResponse=false';

  // HIBP returns 404 when the email is not in any breach — treat that
  // as a normal "no breaches" response, not an error.
  const fetchFn = ctx.fetch ?? fetch;
  const res = await fetchFn(url, {
    headers: {
      'hibp-api-key': keys.hibp,
      'User-Agent': 'service-hub-desktop',
      Accept: 'application/json',
    },
  });
  if (res.status === 404) return { email, breaches: [] };
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new FetchError(`HIBP ${res.status}: ${body.slice(0, 200)}`, res.status, 'security');
  }
  const data = (await res.json()) as HibpBreach[];
  return {
    email,
    breaches: data.map((b) => ({
      name: b.Name,
      title: b.Title,
      date: b.BreachDate,
      pwnCount: b.PwnCount,
      dataClasses: b.DataClasses,
    })),
  };
}

interface ScanUrlPayload {
  url: string;
}

interface VtUrlScanResponse {
  data: { id: string; type: string };
}

interface VtUrlReportResponse {
  data: {
    id: string;
    attributes: {
      last_analysis_stats: {
        harmless: number;
        malicious: number;
        suspicious: number;
        undetected: number;
      };
      reputation?: number;
    };
  };
}

function vtBase64(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function scanUrl(
  ctx: ActionContext,
): Promise<{ url: string; positives: number; total: number; reportUrl: string }> {
  const { url } = ctx.payload as unknown as ScanUrlPayload;
  if (!url) throw new Error('url is required');
  const keys = parseSecurityKeys(ctx.token);
  if (!keys.vt) throw new Error('VirusTotal API key not configured');

  // Submit URL for analysis (so the report is fresh).
  await jsonFetch<VtUrlScanResponse>(
    'https://www.virustotal.com/api/v3/urls',
    {
      method: 'POST',
      headers: {
        'x-apikey': keys.vt,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ url }).toString(),
    },
    { fetch: ctx.fetch, serviceId: 'security' },
  );

  // VirusTotal identifies a URL by base64url(sha) — but the simpler form
  // is just base64url(url) which they accept on the GET endpoint.
  const id = vtBase64(url);
  const report = await jsonFetch<VtUrlReportResponse>(
    `https://www.virustotal.com/api/v3/urls/${id}`,
    { headers: { 'x-apikey': keys.vt } },
    { fetch: ctx.fetch, serviceId: 'security' },
  );

  const stats = report.data.attributes.last_analysis_stats;
  const positives = stats.malicious + stats.suspicious;
  const total = stats.harmless + stats.malicious + stats.suspicious + stats.undetected;
  return {
    url,
    positives,
    total,
    reportUrl: `https://www.virustotal.com/gui/url/${id}`,
  };
}

export const ACTIONS: ActionMap = {
  'check-email-breach': checkEmailBreach,
  'scan-url': scanUrl,
};
