/**
 * **画面の直書き色の母集団** (2026-09-18 · パス 315)。
 *
 * UI 再設計 (2026-09-17) で、画面側が読む色は `styles.css` のトークン (`--success` / `--danger` / `--warning` /
 * `--text-muted` / `--border` …) に寄せた。意味色 (緑 / 赤 / 黄) の直書き `#22c55e` / `#ef4444` / `#f87171` /
 * `#4ade80` / `#f59e0b` / `#d97706` / `#fbbf24` は inline の style から **0 件**になった (パス 315)。
 * 残る直書き (実測 275 件) はチャートのパレット・書式の既定色・SVG の塗りなど、トークンで表す意味を
 * 持たない物で、これは**分母であって欠陥の一覧ではない** (`lint:zero-fold` と同じ立場)。
 *
 * ## 規則 (双方向)
 *
 * 1. 意味色 7 つの hex は、画面の出荷 code (pages / components / App / security) の inline に現れてはならない
 *    (書き出す書面・データ (`data/` / `web-templates.ts` / `web-shim.ts` の書き出し HTML) は対象外 —— 書き出した
 *    ファイルにトークンは無い)。
 * 2. ファイルごとの直書き hex の件数は台帳と一致する。増えたら「トークンで表せないか」を考えてから台帳を
 *    更新し、減ったら台帳も減らす。
 */
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/** 意味を持つ色 —— トークンで表す。 */
export const SEMANTIC_HEX: readonly string[] = ['#22c55e', '#4ade80', '#ef4444', '#f87171', '#f59e0b', '#d97706', '#fbbf24'];

export function hexLiterals(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trimStart();
    if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) continue;
    for (const m of line.matchAll(HEX)) out.push(m[0].toLowerCase());
  }
  return out;
}

function uiSources(): { file: string; text: string }[] {
  return globSync(
    ['src/renderer/pages/*.tsx', 'src/renderer/components/*.tsx', 'src/renderer/components/*.ts', 'src/renderer/App.tsx', 'src/renderer/security/*.tsx'],
    { cwd: REPO, absolute: true, ignore: ['**/__tests__/**'] },
  ).map((abs) => ({ file: relative(REPO, abs).split('\\').join('/'), text: readOriginalSource(abs) }));
}

/** ファイルごとの直書き hex の件数 (分母)。 */
const LEDGER: Readonly<Record<string, number>> = {
  'src/renderer/components/AxonometricCharts.tsx': 21,
  'src/renderer/components/BuildingIso.tsx': 5,
  'src/renderer/components/Charts.tsx': 11,
  'src/renderer/components/ChatbotWidget.tsx': 13,
  'src/renderer/components/CloudSyncPanel.tsx': 1,
  'src/renderer/components/EligibilityChecker.tsx': 2,
  'src/renderer/components/ExportActions.tsx': 1,
  'src/renderer/components/FinancialAnalysis.tsx': 31,
  'src/renderer/components/GuardedNumber.tsx': 2,
  'src/renderer/components/RealtimeTicker.tsx': 7,
  'src/renderer/components/ServiceActionPanel.tsx': 1,
  'src/renderer/components/ShigyoConsole.tsx': 4,
  'src/renderer/components/VoiceCommandBar.tsx': 1,
  'src/renderer/components/WelfareSchemeCard.tsx': 1,
  'src/renderer/components/issueLevelUi.ts': 2,
  'src/renderer/pages/AssistantPage.tsx': 5,
  'src/renderer/pages/BusinessPage.tsx': 3,
  'src/renderer/pages/ChartsPage.tsx': 9,
  'src/renderer/pages/DocstudioPage.tsx': 5,
  'src/renderer/pages/EmotionsPage.tsx': 3,
  'src/renderer/pages/FreeePage.tsx': 10,
  'src/renderer/pages/FundingPage.tsx': 16,
  'src/renderer/pages/HomePage.tsx': 2,
  'src/renderer/pages/HydroponicsPage.tsx': 1,
  'src/renderer/pages/KpiPage.tsx': 3,
  'src/renderer/pages/LibraryPage.tsx': 1,
  'src/renderer/pages/MutualFundsPage.tsx': 1,
  'src/renderer/pages/OverviewPage.tsx': 7,
  'src/renderer/pages/SalesPage.tsx': 6,
  'src/renderer/pages/SecurityPage.tsx': 3,
  'src/renderer/pages/SettingsPage.tsx': 9,
  'src/renderer/pages/ShopifyPage.tsx': 1,
  'src/renderer/pages/StocksPage.tsx': 4,
  'src/renderer/pages/StoragePage.tsx': 1,
  'src/renderer/pages/TalentPage.tsx': 10,
  'src/renderer/pages/TaxPage.tsx': 13,
  'src/renderer/pages/TeamRadarPage.tsx': 14,
  'src/renderer/pages/TemplatesPage.tsx': 10,
  'src/renderer/pages/VillagePage.tsx': 32,
  'src/renderer/security/LockScreen.tsx': 3,
};

const SOURCES = uiSources();

describe('画面の直書き色 (パス 315)', () => {
  it('走査が生きている (床: 合計 200 件以上・ファイル 30 以上)', () => {
    const total = SOURCES.reduce((n, s) => n + hexLiterals(s.text).length, 0);
    expect(total).toBeGreaterThanOrEqual(200);
    expect(Object.keys(LEDGER).length).toBeGreaterThanOrEqual(30);
  });

  it('★ 意味色 7 つの hex は画面の inline に現れない (0 件)', () => {
    const hits: string[] = [];
    for (const s of SOURCES) for (const h of hexLiterals(s.text)) if (SEMANTIC_HEX.includes(h)) hits.push(`${s.file}: ${h}`);
    expect(hits, '意味色はトークン (var(--success) / var(--danger) / var(--warning)) で表す').toEqual([]);
  });

  it('★ ファイルごとの件数は台帳と一致する (双方向)', () => {
    const actual: Record<string, number> = {};
    for (const s of SOURCES) {
      const n = hexLiterals(s.text).length;
      if (n > 0) actual[s.file] = n;
    }
    expect(actual).toEqual(LEDGER);
  });

  it('★ 画面が読む var(--名前) は、すべて styles.css が定義している (未定義の名前は素通りする)', () => {
    const css = readOriginalSource(join(REPO, 'src/renderer/styles.css'));
    const defined = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
    const all = globSync(['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'], { cwd: REPO, absolute: true, ignore: ['**/__tests__/**', '**/*.d.ts'] });
    const undefinedNames: string[] = [];
    for (const abs of all) {
      for (const m of readOriginalSource(abs).matchAll(/var\((--[\w-]+)/g)) {
        if (!defined.has(m[1]!)) undefinedNames.push(`${relative(REPO, abs)}: ${m[1]}`);
      }
    }
    // 標本: 定義の走査は実物の名前に当たる (UI 再設計まで `--text-mute` 624 か所が未定義だった · 2026-09-17)。
    expect(defined.has('--text-mute')).toBe(true);
    expect(defined.has('--warning-bg')).toBe(true);
    expect(undefinedNames, '未定義の変数名は親の色で描かれる (指定が黙って効かない)').toEqual([]);
  });

  it('標本: 走査は hex を拾い、コメント行と var() の中の名前は拾わない', () => {
    expect(hexLiterals("  color: '#22c55e',\n  // color: '#ef4444'\n  background: 'var(--success)'\n")).toEqual(['#22c55e']);
    expect(hexLiterals('const PALETTE = ["#5b8def", "#E0568A"];')).toEqual(['#5b8def', '#e0568a']);
    expect(SEMANTIC_HEX).toContain('#22c55e');
  });
});
