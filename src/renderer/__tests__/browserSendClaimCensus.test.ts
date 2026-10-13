/**
 * **ブラウザ版が実際に外へ送る action の母集団** (2026-09-25 · パス 457)。
 *
 * ## なぜ要るか
 *
 * `GoogleConnectCard` は 2026-08 から「ライブ接続（実データ取得・送信）は
 * デスクトップ版の機能で、ブラウザ版は同梱スナップショットを表示します。」と
 * 述べていた。**取得については真で、送信については偽**である —— 実測 (2026-09-25):
 * ブラウザ版の `web-shim.ts` の invoke は `runProxyBearer` を通して
 * `data/saasWriteWeb.ts` の writer を呼び、googleapis.com / gmail.googleapis.com へ
 * 本物の POST を投げる。1 文が「この実行形態では何も外へ出ない」と読めるまま、
 * 同じ 3 画面 (Drive / Calendar / Gmail) に実際の書き込みフォームが在った。
 *
 * ★ **同じアプリが別の場所で正しく書いていた** —— `Microsoft365Page.tsx` は
 * 「実データの取得はデスクトップ版の機能です（…）」と「メール送信と予定作成は
 * ブラウザ版でも動きます」を**別々の文**にしている。ms365 の書き込みは同じ形
 * (`runProxyBearer` → `saasWriteWeb`)。つまり直す向きはアプリ自身が持っており、
 * Google のカードだけがその前提を持っていなかった (パス 398 / 408 と同じ非対称)。
 *
 * ## この検査が持つ物
 *
 * 1. **母集団** —— `web-shim.ts` が実際に呼ぶ `saasWriteWeb` の writer (実測 15) を
 *    走査で導き、台帳と**両方向**に突き合わせる。16 個目の writer を足して
 *    呼び手を繋いだ日に「台帳に書け」と鳴り、呼び手を外した日も鳴る。
 * 2. **持ち主の画面** —— 行ごとに、その action を `invoke` する画面が実在すること。
 * 3. **禁じた主張** —— 出荷コード (`src/renderer` + `src/shared`) に、
 *    **同じ 1 文の中で「送信」と「デスクトップ版の機能」を並べる文**が無いこと。
 *    針は綴りなので、**当たることを標本で示す** (直す前の文そのもの)。
 *    振る舞いの背骨は `components/__tests__/googleConnectCardBuildGate.test.ts`。
 * 4. **Google の表** —— `GOOGLE_BROWSER_SEND` が `web-shim.ts` の振り分けと一致すること
 *    (両方向)。画面は「何が作られるか」をこの表から名乗るので、4 つ目の Google の
 *    action が生えた日に文だけが古びてはいけない。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import {
  readOriginalSource,
  readOriginalDirEntries,
} from '../../shared/__tests__/originalSource';
import { GOOGLE_BROWSER_SEND, type GoogleServiceId } from '../../shared/buildDestinations';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readOriginalSource(path.join(REPO_ROOT, rel));

/** 注記だけを落とす (**文字列の中身は残す** —— 針が読むのは文そのものなので)。 */
interface Row {
  /** `data/saasWriteWeb.ts` の export された writer。 */
  readonly writer: string;
  readonly service: string;
  readonly action: string;
  /** その action を `invoke` する画面 (リポジトリ相対)。 */
  readonly screen: string;
}

/**
 * ブラウザ版から**実際に第三者のサーバへ送る** 15 の道 (2026-09-25 実測)。
 *
 * `readCapped` は writer ではなく本文の読み手なので母集団の外 (走査も呼び手で判定する)。
 */
const LEDGER: readonly Row[] = [
  { writer: 'createGithubIssue', service: 'github', action: 'create-issue', screen: 'src/renderer/pages/GithubPage.tsx' },
  { writer: 'createNotionPage', service: 'notion', action: 'create-page', screen: 'src/renderer/pages/NotionPage.tsx' },
  { writer: 'sendSlackMessage', service: 'slack', action: 'send-message', screen: 'src/renderer/pages/SlackPage.tsx' },
  { writer: 'createAtlassianIssue', service: 'atlassian', action: 'create-issue', screen: 'src/renderer/pages/AtlassianPage.tsx' },
  { writer: 'createCalendarEvent', service: 'calendar', action: 'create-event', screen: 'src/renderer/pages/CalendarPage.tsx' },
  { writer: 'createGmailDraft', service: 'gmail', action: 'create-draft', screen: 'src/renderer/pages/GmailPage.tsx' },
  { writer: 'createDriveFolder', service: 'drive', action: 'create-folder', screen: 'src/renderer/pages/DrivePage.tsx' },
  { writer: 'createWordPressPostDraft', service: 'wordpress', action: 'create-post-draft', screen: 'src/renderer/pages/WordPressPage.tsx' },
  { writer: 'createCanvaFolder', service: 'canva', action: 'create-folder', screen: 'src/renderer/pages/CanvaPage.tsx' },
  { writer: 'createCloudflareDnsRecord', service: 'cloudflare', action: 'create-dns-record', screen: 'src/renderer/pages/CloudflarePage.tsx' },
  { writer: 'purgeCloudflareCache', service: 'cloudflare', action: 'purge-cache', screen: 'src/renderer/pages/CloudflarePage.tsx' },
  { writer: 'scanUrlVirusTotal', service: 'security', action: 'scan-url', screen: 'src/renderer/pages/SecurityPage.tsx' },
  { writer: 'checkEmailBreach', service: 'security', action: 'check-email-breach', screen: 'src/renderer/pages/SecurityPage.tsx' },
  { writer: 'sendMicrosoftMail', service: 'microsoft-365', action: 'send-mail', screen: 'src/renderer/pages/Microsoft365Page.tsx' },
  { writer: 'createMicrosoftEvent', service: 'microsoft-365', action: 'create-event', screen: 'src/renderer/pages/Microsoft365Page.tsx' },
];

/** `web-shim.ts` が実際に呼ぶ `saasWriteWeb` の writer を走査で導く。 */
function scanWriters(): string[] {
  const shim = stripComments(read('src/renderer/web-shim.ts'));
  const declared = [...read('src/renderer/data/saasWriteWeb.ts').matchAll(/export async function ([A-Za-z0-9_]+)/g)]
    .map((m) => m[1]!);
  return declared.filter((w) => new RegExp(`\\b${w}\\s*\\(`).test(shim));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(path.join(REPO_ROOT, dir))) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== '__tests__') walk(rel, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** 「送信もデスクトップ版の機能」と**1 文の中で**述べているか。 */
const SENDS = /送信|送りま|書き込み/;
const DESKTOP_ONLY = /デスクトップ版の機能|デスクトップ版のみ|Electron 版の機能/;
function claimsSendIsDesktopOnly(src: string): string[] {
  return stripComments(src)
    .split(/[。\n]/)
    .map((s) => s.trim())
    .filter((s) => SENDS.test(s) && DESKTOP_ONLY.test(s));
}

describe('ブラウザ版が実際に送る action の母集団 (パス 457)', () => {
  it('★ 母集団と台帳が一致する (両方向)', () => {
    const scanned = scanWriters().sort();
    const ledger = LEDGER.map((r) => r.writer).sort();
    expect(scanned.length, '走査が空 —— 針が死んでいる').toBeGreaterThanOrEqual(12);
    expect(scanned).toEqual(ledger);
  });

  it('行ごとに、その action を invoke する画面が実在する', () => {
    for (const r of LEDGER) {
      const src = read(r.screen);
      expect(src, `${r.writer}: ${r.screen} に '${r.action}' が無い`).toContain(`'${r.action}'`);
    }
  });

  it('台帳の service / action の綴りは web-shim.ts の振り分けに在る', () => {
    const shim = stripComments(read('src/renderer/web-shim.ts'));
    for (const r of LEDGER) {
      expect(shim, `${r.writer}: serviceId === '${r.service}'`).toContain(`serviceId === '${r.service}'`);
      expect(shim, `${r.writer}: action === '${r.action}'`).toContain(`action === '${r.action}'`);
    }
  });

  it('★ 出荷コードに「送信もデスクトップ版の機能」と 1 文で述べる所は無い', () => {
    const hits: string[] = [];
    for (const dir of ['src/renderer', 'src/shared']) {
      for (const file of walk(dir)) {
        for (const s of claimsSendIsDesktopOnly(read(file))) hits.push(`${file}: ${s}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('★ 針が的に当たる (直す前の文そのものを標本に) / 注記の中では数えない', () => {
    const before = "          サインインはサービスごとに行い、必要スコープのみ同意します。ライブ接続（実データ取得・送信）は\n"
      + '          デスクトップ版の機能で、ブラウザ版は同梱スナップショットを表示します。';
    const one = before.replace(/\n\s+/g, '');
    expect(claimsSendIsDesktopOnly(one)).toHaveLength(1);
    // 同じ綴りでも、注記の中なら数えない (法則 `mention-vs-declaration`)。
    //
    // ★ **標本は、走査に掛ける物と同じ形にする** (2026-09-25 · パス 461) —— 裸の
    //   ` * 続き行` は実物では 1 度も来ない (走査はファイル全体を渡すので、続き行は
    //   必ず `/*` の内側に在る)。CLAUDE.md の規約が言う「同じ加工を通す」の、
    //   **標本の形**についての現れである。
    expect(claimsSendIsDesktopOnly(`/**\n * ${one}\n */`)).toEqual([]);
    // ★ **行末の注記も数えない** —— パス 461 までこの census は自前の写しを持ち、
    //   **行頭が `//` の行しか落とさなかった**ので、この形は code として残っていた。
    expect(claimsSendIsDesktopOnly(`const x = 1; // ${one}`)).toEqual([]);
    // 向きを分けて書いた文は当たらない (Microsoft365Page が最初から持っている形)。
    const ok = '実データの取得はデスクトップ版の機能です（ブラウザ版は同梱スナップショットを表示します）。'
      + 'メール送信と予定作成はブラウザ版でも動きます —— プロキシ設定が要ります（設定ページ）。';
    expect(claimsSendIsDesktopOnly(ok)).toEqual([]);
  });

  it('★ GOOGLE_BROWSER_SEND は web-shim.ts の振り分けと一致する (両方向)', () => {
    const shim = stripComments(read('src/renderer/web-shim.ts'));
    const googleRows = LEDGER.filter((r) => Object.hasOwn(GOOGLE_BROWSER_SEND, r.service));
    expect(googleRows.map((r) => r.service).sort()).toEqual(Object.keys(GOOGLE_BROWSER_SEND).sort());
    for (const r of googleRows) {
      const id = r.service as GoogleServiceId;
      expect(GOOGLE_BROWSER_SEND[id].action, `${id} の action が台帳とずれている`).toBe(r.action);
      expect(shim).toContain(`serviceId === '${id}' && action === '${GOOGLE_BROWSER_SEND[id].action}'`);
      expect(GOOGLE_BROWSER_SEND[id].label.length, `${id} の label が短すぎる`).toBeGreaterThanOrEqual(4);
    }
  });
});
