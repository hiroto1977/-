/**
 * **画面の直書き色の母集団** (2026-09-18 · パス 315)。
 *
 * UI 再設計 (2026-09-17) で、画面側が読む色は `styles.css` のトークン (`--success` / `--danger` / `--warning` /
 * `--text-muted` / `--border` …) に寄せた。意味色 (緑 / 赤 / 黄) の直書き `#22c55e` / `#ef4444` / `#f87171` /
 * `#4ade80` / `#f59e0b` / `#d97706` / `#fbbf24` は inline の style から **0 件**になった (パス 315)。
 * 残る直書き (実測 275 件 → パス 503 で 171 件) はチャートのパレット・書式の既定色・SVG の塗りなど、
 * トークンで表す意味を持たない物で、これは**分母であって欠陥の一覧ではない** (`lint:zero-fold` と同じ立場)。
 *
 * パス 503 (文字色の対比) は、**配色で見え方が変わる色** (意味色・字の色・ダークで読めない固定色) をさらに 104 件、
 * トークン (`--danger` / `--warning` / `--success` / `--info` / `--text-muted` / `--on-accent` ほか) へ寄せた。
 * 台帳の件数が減るのは正しい向きで、床は件数に張り付けない (下の「走査が生きている」)。
 *
 * ## 規則 (双方向)
 *
 * 1. 意味色 11 の hex は、画面の出荷 code (pages / components / App / security) の inline に現れてはならない
 *    (書き出す書面・データ (`data/` / `web-templates.ts` / `web-shim.ts` の書き出し HTML) は対象外 —— 書き出した
 *    ファイルにトークンは無い)。
 * 2. ファイルごとの直書き hex の件数は台帳と一致する。増えたら「トークンで表せないか」を考えてから台帳を
 *    更新し、減ったら台帳も減らす。
 */
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const REPO = join(__dirname, '..', '..', '..');
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/** 意味を持つ色 —— トークンで表す。 */
// パス 503: 状態の札・警告の印・情報の青に使っていた 4 つ (`#e5484d` 危険の赤 / `#e08c1a` 要確認の橙 / `#3b82f6` 情報の青 / `#fca5a5` 淡い赤) も
// トークンへ寄せたので、同じ理由で戻さない (ダークで読めない・ライトでしか合わない固定色)。
export const SEMANTIC_HEX: readonly string[] = ['#22c55e', '#4ade80', '#ef4444', '#f87171', '#f59e0b', '#d97706', '#fbbf24', '#e5484d', '#e08c1a', '#3b82f6', '#fca5a5'];

export function hexLiterals(text: string): string[] {
  const out: string[] = [];
  // 注記は共有の字句解析器で落とす —— 行頭で見ると `color: '#ef4444', // 危険`
  // のような**行末の注記**が code として残る (法則 `mention-vs-declaration`)。
  for (const line of stripComments(text).split('\n')) {
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
  'src/renderer/components/AxonometricCharts.tsx': 16, // パス 503: 21 → 16 (状態の札・凡例の色をトークンへ)
  'src/renderer/components/BuildingIso.tsx': 5,
  'src/renderer/components/Charts.tsx': 10, // パス 503: 11 → 10 (円グラフの割合の字は系列の色から選ぶ `readableInk`)
  'src/renderer/components/CloudSyncPanel.tsx': 1,
  'src/renderer/components/FinancialAnalysis.tsx': 16, // パス 503: 31 → 16
  'src/renderer/components/RealtimeTicker.tsx': 7,
  'src/renderer/components/VoiceCommandBar.tsx': 1,
  'src/renderer/components/WelfareSchemeCard.tsx': 1,
  'src/renderer/pages/AssistantPage.tsx': 2, // パス 503: 5 → 2 (既定は画面の配色に追随・保存した色は触らない)
  'src/renderer/pages/ChartsPage.tsx': 9,
  'src/renderer/pages/EmotionsPage.tsx': 3,
  'src/renderer/pages/FreeePage.tsx': 10,
  'src/renderer/pages/FundingPage.tsx': 16,
  'src/renderer/pages/KpiPage.tsx': 1, // パス 503: 3 → 1 (系列の色は --success / --danger / --info / --warning / --text-muted)
  'src/renderer/pages/LibraryPage.tsx': 1,
  'src/renderer/pages/OverviewPage.tsx': 7,
  'src/renderer/pages/SalesPage.tsx': 6,
  'src/renderer/pages/SecurityPage.tsx': 2, // パス 503: 3 → 2
  'src/renderer/pages/SettingsPage.tsx': 4, // パス 503: 9 → 4
  'src/renderer/pages/ShopifyPage.tsx': 1,
  'src/renderer/pages/TaxPage.tsx': 8, // パス 503: 13 → 8
  'src/renderer/pages/TeamRadarPage.tsx': 2, // パス 493g: 8 色の写しを shared/teamRadarSvg の colorFor へ寄せた / パス 503: 6 → 2
  'src/renderer/pages/TemplatesPage.tsx': 10,
  'src/renderer/pages/VillagePage.tsx': 32,
};

const SOURCES = uiSources();

describe('画面の直書き色 (パス 315)', () => {
  it('走査が生きている (床: 画面のファイル 60 以上・直書きの合計 100 以上・台帳 15 ファイル以上)', () => {
    // 床は**測った件数に張り付けない** (パス 378): 直書きを減らすのは正しい向きで、直した日に落ちる門にしない。
    // 見るのは「走査が画面のファイルを読めていること」と「パレット・SVG の塗りなど残る直書きを数えられていること」だけ。
    const total = SOURCES.reduce((n, s) => n + hexLiterals(s.text).length, 0);
    expect(SOURCES.length).toBeGreaterThanOrEqual(60);
    expect(total).toBeGreaterThanOrEqual(100);
    expect(Object.keys(LEDGER).length).toBeGreaterThanOrEqual(15);
  });

  it('★ 意味色 11 の hex は画面の inline に現れない (0 件)', () => {
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
    // パス 503 で足した 4 つも、字面が走査に当たる (針が当たらなければ「現れない」は空の主張になる)
    expect(hexLiterals("color: '#E5484D', background: '#e08c1a', fill: '#3b82f6', stroke: '#fca5a5'").filter((h) => SEMANTIC_HEX.includes(h))).toEqual(['#e5484d', '#e08c1a', '#3b82f6', '#fca5a5']);
  });
});
