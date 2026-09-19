/**
 * **例外の文面が画面へ流れる経路の母集団** (2026-09-18 · パス 314)。
 *
 * パス 307 / 311 が「閉じていない物」に書いた項: `redactForMessage` の第 2 引数を数える census は
 * **呼ぶ側しか映さない**ので、伏字を通さずに例外の文面を state / JSX / 戻り値へ流す経路は誰も数えて
 * いなかった。パス 311 は 77 か所を読んで「相手の本文が乗るのは 16 か所だけ」と記録に残したが、
 * 記録は次に足された 1 か所を止めない。
 *
 * ## 規則
 *
 * renderer と shared の出荷 code で、捕まえた例外を文にする行 (`e instanceof Error ? e.message : …` /
 * `(e as Error).message` / `e.message`) は、**同じ行で伏字を通る**か、**理由つきの台帳に載る**か、
 * どちらかでなければならない。台帳はファイルごとの件数で**両方向**に鳴る —— 足しても減っても落ちる。
 *
 * 伏字と数える物: `redactForMessage(` / `safeErrorMessage(` / `describeStorageError(` /
 * `describeRenderError(` / `redactSecrets(`。`web-shim.ts` の `err(` は伏字の関門そのもの (パス 273) なので
 * **そのファイルに限って**安全と数える (他のファイルの `err(` は別の関数かもしれない)。
 *
 * 走査は 1 行しか見ない。「代入してから次の行で伏せる」形は台帳に `deferred` として載せる ——
 * 窓を 2 行に広げると「次の行でたまたま別の物を伏せている」を安全と読むので広げない。
 */
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');

/** 捕まえた例外を文にする形。 */
export const MESSAGE_SURFACE =
  /instanceof Error \? (\w+)\.message : |\((\w+) as Error\)\.message|\b(e|err|error|ex|cause)\.message\b/;
/** 同じ行で伏字を通る印。 */
export const REDACTED_ON_LINE = /redactForMessage\(|safeErrorMessage\(|describeStorageError\(|describeRenderError\(|redactSecrets\(/;
/** `web-shim.ts` の `err()` は失敗の唯一の口で、中で `redactForMessage` を通す。 */
const SHIM_FUNNEL = /\berr(?:<[^>]*>)?\(/;
/**
 * 文面を**読むだけ**で流さない形 (`e.message.includes(' response too large')` のような判定)。
 * shared を母集団に入れたとき (パス 320) に `httpLimits.ts` の `isOverCap` が当たったので、形で外す (標本つき)。
 */
const READ_ONLY_USE = /\.message\.(?:includes|startsWith|endsWith|match|test)\(|\.message\s*[!=]==?\s/;

export interface Site {
  readonly file: string;
  readonly line: number;
  readonly safe: boolean;
}

export function classifyLine(file: string, line: string): 'skip' | 'safe' | 'raw' {
  const t = line.trim();
  if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return 'skip';
  if (!MESSAGE_SURFACE.test(line)) return 'skip';
  if (READ_ONLY_USE.test(line)) return 'skip';
  if (REDACTED_ON_LINE.test(line)) return 'safe';
  if (file.endsWith('web-shim.ts') && SHIM_FUNNEL.test(line)) return 'safe';
  return 'raw';
}

export function scan(files: readonly { readonly file: string; readonly text: string }[]): Site[] {
  const out: Site[] = [];
  for (const { file, text } of files) {
    text.split('\n').forEach((line, i) => {
      const c = classifyLine(file, line);
      if (c !== 'skip') out.push({ file, line: i + 1, safe: c === 'safe' });
    });
  }
  return out;
}

function rendererSources(): { file: string; text: string }[] {
  // 2026-09-18 (パス 320) から shared も見る —— `shared/teamRadarState.ts:365` が保存値の壊れ方の理由に
  // 生の保存値を載せたまま画面 (storedNote) へ流していたのを、renderer だけの走査は映さなかった。
  return globSync(['src/renderer/**/*.ts', 'src/renderer/**/*.tsx', 'src/shared/**/*.ts'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**', '**/*.d.ts'],
  }).map((abs) => ({ file: relative(REPO, abs).split('\\').join('/'), text: readOriginalSource(abs) }));
}

/** 出どころの種類。理由は種類が持ち、ファイルは種類と件数を名乗る。 */
const SOURCE = {
  invoke:
    '`window.serviceHub` の呼びの catch。両ビルドとも失敗は戻り値で表し (main: `safeErrorMessage` / shim: `withFloor` → `err()` · パス 312)、'
    + 'ここへ届く例外は IPC 層の文 (Electron の "Error invoking remote method …") か橋の不在で、相手の本文は載らない',
  ownThrow:
    '自前の関門 (`parse…` / `validate…` / 台帳の判定 / `readImportText`) が投げる定数の文。利用者自身の入力の値は載りうるが、相手の本文は載らない',
  platform:
    'ブラウザの API (Web Storage / IndexedDB / File System Access) の DOMException。文は platform の物で、相手の本文は載らない',
  vault:
    '保管庫 (`security/vault.ts`) の自前の文 (施錠中・パスワード不一致・復号失敗) と WebCrypto の DOMException。相手の本文は載らない',
  network:
    '通信の失敗。本文を載せない形で投げる (`HTTP ${status}` / `parseJsonBody` の定数 / `redirectRefusal`)。本文を添える側 (`pkce.ts:275`) は同じ行で伏字',
  deferred:
    '同じ行では伏せず、次の行で `redactForMessage` を通す (代入してから伏せる形)。走査は 1 行しか見ないので台帳で持つ',
} as const;

/**
 * 伏字を通さない行の台帳 (ファイル → 件数・出どころ)。**画面に出さない、ではなく、出る文に相手の本文が
 * 載らない理由**を持つ。件数が動けば鳴る (足しても減っても)。
 */
const LEDGER: Readonly<Record<string, { readonly sites: number; readonly source: keyof typeof SOURCE; readonly note?: string }>> = {
  'src/shared/connectors/connectorRegistry.ts': { sites: 1, source: 'ownThrow', note: '組み込みコネクタ台帳の検証 (`validateConnectors`) の定数の文を起動時の Error に束ねる。利用者の入力も相手の本文も載らない' },
  'src/renderer/components/BackupPanel.tsx': { sites: 2, source: 'ownThrow', note: 'IndexedDB の DOMException も混じる' },
  'src/renderer/components/ExportActions.tsx': { sites: 1, source: 'invoke', note: 'openPath / revealInFolder は OsOpResult で表す' },
  'src/renderer/components/PageErrorBoundary.tsx': { sites: 1, source: 'deferred', note: '`describeRenderError` の中 (パス 307)' },
  'src/renderer/components/RecordShapeAuditPanel.tsx': { sites: 2, source: 'ownThrow', note: 'IndexedDB の DOMException も混じる' },
  'src/renderer/components/ServiceActionPanel.tsx': { sites: 2, source: 'invoke' },
  'src/renderer/components/ShigyoConsole.tsx': { sites: 2, source: 'ownThrow' },
  'src/renderer/components/VoiceCommandBar.tsx': { sites: 1, source: 'invoke' },
  'src/renderer/data/kpiActualsCsv.ts': { sites: 1, source: 'ownThrow', note: 'CSV の行ごとの解析' },
  'src/renderer/data/salesCsv.ts': { sites: 1, source: 'ownThrow', note: 'CSV の行ごとの解析' },
  'src/renderer/data/stocksWatchlistWeb.ts': { sites: 1, source: 'platform', note: '3 状態の理由 (パス 309)' },
  'src/renderer/hooks/useServiceData.ts': { sites: 1, source: 'invoke', note: 'IPC が reject した場合の受け皿' },
  'src/renderer/network/liveRead.ts': { sites: 2, source: 'network' },
  'src/renderer/pages/AssistantPage.tsx': { sites: 2, source: 'ownThrow', note: '`setToken` の戻りと端末内の簡易応答' },
  'src/renderer/pages/BusinessPage.tsx': { sites: 2, source: 'invoke' },
  'src/renderer/pages/ConnectorsPage.tsx': { sites: 1, source: 'ownThrow', note: '`connectorExecution.ts` は fetch を持たない' },
  'src/renderer/pages/HomePage.tsx': { sites: 2, source: 'invoke' },
  'src/renderer/pages/HydroponicsPage.tsx': { sites: 3, source: 'ownThrow' },
  'src/renderer/pages/KpiPage.tsx': { sites: 4, source: 'ownThrow' },
  'src/renderer/pages/MutualFundsPage.tsx': { sites: 1, source: 'ownThrow' },
  'src/renderer/pages/OverviewPage.tsx': { sites: 1, source: 'ownThrow' },
  'src/renderer/pages/RealEstatePage.tsx': { sites: 1, source: 'ownThrow' },
  'src/renderer/pages/SalesPage.tsx': { sites: 2, source: 'ownThrow' },
  'src/renderer/pages/SettingsPage.tsx': { sites: 9, source: 'vault', note: 'eraseAll の橋・フォルダ選択 (FSA)・PKCE の交換 (本文は pkce.ts で伏字) も混じる' },
  'src/renderer/pages/ShopifyPage.tsx': { sites: 1, source: 'ownThrow' },
  'src/renderer/pages/StocksPage.tsx': { sites: 4, source: 'invoke' },
  'src/renderer/pages/TalentPage.tsx': { sites: 2, source: 'invoke' },
  'src/renderer/pages/TeamPage.tsx': { sites: 1, source: 'ownThrow' },
  'src/renderer/pages/TeamRadarPage.tsx': { sites: 2, source: 'invoke' },
  'src/renderer/pages/TemplatesPage.tsx': { sites: 1, source: 'invoke' },
  'src/renderer/pages/VillagePage.tsx': { sites: 1, source: 'invoke', note: '`speak` は assistant/chat の invoke' },
  'src/renderer/security/LockScreen.tsx': { sites: 3, source: 'vault' },
  'src/renderer/security/webCrypto.ts': { sites: 1, source: 'vault', note: '`describeCryptoFailure`' },
  'src/renderer/web-shim.ts': { sites: 3, source: 'platform', note: '2 件は Web Storage の 3 状態の理由。1 件 (chatAll の provider ごとの error) は次の行で `redactForMessage` (deferred)' },
};

const SITES = scan(rendererSources());
const RAW = SITES.filter((s) => !s.safe);

describe('例外の文面 → 画面 (パス 314): 伏字を通らない行は理由つきの台帳の物だけ', () => {
  it('走査が生きている (床: 全体 80 / 伏字なし 50)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(80);
    expect(RAW.length).toBeGreaterThanOrEqual(50);
    expect(SITES.length - RAW.length).toBeGreaterThanOrEqual(20);
  });

  it('★ 台帳に無い行が 0 件 (ファイルごとの件数は台帳と一致する)', () => {
    const counts = new Map<string, number>();
    for (const s of RAW) counts.set(s.file, (counts.get(s.file) ?? 0) + 1);
    const drift: string[] = [];
    for (const [file, n] of counts) {
      const row = LEDGER[file];
      if (!row) drift.push(`${file}: 台帳に無い (${n} 件: ${RAW.filter((s) => s.file === file).map((s) => s.line).join(',')})`);
      else if (row.sites !== n) drift.push(`${file}: 台帳 ${row.sites} 件 / 実物 ${n} 件 (${RAW.filter((s) => s.file === file).map((s) => s.line).join(',')})`);
    }
    expect(drift, '伏字を通らずに例外の文面を流す行が台帳とずれた —— 出どころを読んで台帳へ (同じ行で伏せられるなら伏せる)').toEqual([]);
  });

  it('★ 台帳は双方向 (実物に無い行は古い・理由の種類は実在する)', () => {
    const present = new Set(RAW.map((s) => s.file));
    for (const [file, row] of Object.entries(LEDGER)) {
      expect(present.has(file), `${file}: 台帳に在るが伏字を通らない行が無い (古い行)`).toBe(true);
      expect(SOURCE[row.source].length, `${file}: 理由が無い`).toBeGreaterThan(20);
    }
  });

  it('★ 標本: 走査は shared も見ており、teamRadarState の保存値の理由は同じ行で天井を通る (パス 320)', () => {
    // renderer だけの走査 (パス 314) が映さなかった行。天井 (redactForMessage) を外すと raw になり、台帳に無いので落ちる。
    const shared = SITES.filter((s) => s.file.startsWith('src/shared/'));
    expect(shared.length).toBeGreaterThanOrEqual(1);
    const radar = SITES.find((s) => s.file === 'src/shared/teamRadarState.ts');
    expect(radar?.safe, 'teamRadarState の unreadable の理由は redactForMessage を同じ行で通す').toBe(true);
  });

  it('標本: 文面を読むだけの判定は数えない (流す形は数える)', () => {
    expect(classifyLine('x.ts', "  return e instanceof Error && e.message.includes(' response too large');")).toBe('skip');
    expect(classifyLine('x.ts', "  if (e.message === 'AbortError') return;")).toBe('skip');
    expect(classifyLine('x.ts', '  setErr(e.message);')).toBe('raw');
  });

  it('標本: 走査は 3 つの形に当たり、コメント行は落とす', () => {
    expect(classifyLine('x.ts', "      setErr(e instanceof Error ? e.message : String(e));")).toBe('raw');
    expect(classifyLine('x.ts', "      setErr(e instanceof Error ? e.message : '入力エラー');")).toBe('raw');
    expect(classifyLine('x.ts', '      const m = (err as Error).message;')).toBe('raw');
    expect(classifyLine('x.ts', '      throw new Error(cause.message);')).toBe('raw');
    expect(classifyLine('x.ts', '  // setErr(e instanceof Error ? e.message : String(e));')).toBe('skip');
    expect(classifyLine('x.ts', '      setErr(fixedMessage);')).toBe('skip');
  });

  it('標本: 同じ行の伏字は安全、次の行の伏字は安全と読まない (窓は 1 行)', () => {
    expect(classifyLine('x.ts', "      setErr(redactForMessage(e instanceof Error ? e.message : String(e), 200));")).toBe('safe');
    expect(classifyLine('x.ts', "      const raw = e instanceof Error ? e.message : String(e);")).toBe('raw');
    const two = scan([{ file: 'x.ts', text: "const raw = e instanceof Error ? e.message : String(e);\nreturn redactForMessage(raw, 200);\n" }]);
    expect(two.map((s) => s.safe)).toEqual([false]);
  });

  it('標本: `err(` を安全と数えるのは web-shim.ts だけ', () => {
    const line = "      return err('action_failed', e instanceof Error ? e.message : String(e));";
    expect(classifyLine('src/renderer/web-shim.ts', line)).toBe('safe');
    expect(classifyLine('src/renderer/pages/X.tsx', line)).toBe('raw');
    // 実物: web-shim の err() の行が母集団に安全側として入っている。
    expect(SITES.some((s) => s.file === 'src/renderer/web-shim.ts' && s.safe)).toBe(true);
  });
});
