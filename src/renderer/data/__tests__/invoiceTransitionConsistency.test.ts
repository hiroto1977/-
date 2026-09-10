/**
 * **経過措置の割合を語る文は、すべて同じ表から出る** (2026-09-10 · パス 142)。
 *
 * 2026-09-10 の実測: 免税事業者等からの課税仕入れの控除割合という 1 つの日程が
 * リポジトリの **6 か所に手で書かれ**、うち 2 か所が令和 8 年度税制改正の前の日程
 * (80% の次が 50%・2029 年 9 月で終了) のまま残っていた —— 知識台帳の `tax-invoice` と
 * `tax-invoice-input-credit` が**同じ期間について 70% と 50%** を言い、書類スタジオの
 * 経費精算テンプレートの注記も古い側だった。共有の定数は無く、一致を見る物も無かった。
 *
 * ここが見るのは 3 つ:
 * 1. 割合を語る文は、`INVOICE_TRANSITION_STAGES` の**段の順に**割合を述べる (古い日程は 70% を欠くので落ちる)
 * 2. 改正前の終わり (2029 年 9 月) を残していない —— 規則が当たることは標本で示す
 * 3. **母集団**: `免税事業者等` を書くファイルは台帳のとおり (黙って 7 か所目が増えない)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { VERIFIED_COMPLIANCE } from '../complianceKnowledge';
import { STUDIO_TEMPLATES } from '../docStudioData';
import { PROFESSIONAL_MAP } from '../professionalMap';
import {
  INVOICE_TRANSITION_END,
  INVOICE_TRANSITION_STAGES,
  invoiceTransitionPercent,
  invoiceTransitionScheduleLabel,
} from '../../../shared/invoiceTransition';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const req = createRequire(import.meta.url);
const gate = req('../../../../scripts/lint-rate-freshness.cjs') as {
  DATED_MEASURES: readonly { source: string; constName: string }[];
};

/** 段の割合を、表の順に並べた文字列 (`['80%', '70%', '50%', '30%']`)。 */
const PERCENTS = INVOICE_TRANSITION_STAGES.map((s) => `${invoiceTransitionPercent(s.rate)}%`);

/** 割合が**表の順で**現れるか。純関数 —— 下の標本で規則が当たることを示す。 */
export function statesScheduleInOrder(text: string): boolean {
  let at = -1;
  for (const p of PERCENTS) {
    const i = text.indexOf(p, at + 1);
    if (i < 0) return false;
    at = i;
  }
  return true;
}

/** 改正前の日程の名残 (80% の次が 50%・2029 年 9 月で終了)。 */
const STALE_MARKERS = ['2029年9月', '2029/9', '2029年09月'];

function fact(id: string): string {
  const f = VERIFIED_COMPLIANCE.find((c) => c.value.id === id);
  if (!f) throw new Error(`fact ${id} missing`);
  return f.value.statement;
}

/** 割合を語る文の一覧 —— 実装から取る (書き写さない)。 */
function carriers(): { where: string; text: string }[] {
  const studioNotes = STUDIO_TEMPLATES.flatMap((t) => t.note)
    .filter((n) => n.includes('免税事業者等'))
    .map((n, i) => ({ where: `docStudioData.ts の注記 ${i + 1}`, text: n }));
  return [
    { where: 'complianceKnowledge tax-invoice', text: fact('tax-invoice') },
    { where: 'complianceKnowledge tax-invoice-input-credit', text: fact('tax-invoice-input-credit') },
    {
      where: 'professionalMap 税理士 インボイス対応',
      text: PROFESSIONAL_MAP['tax-accountant'].duties.find((d) => d.title.includes('インボイス'))?.desc ?? '',
    },
    ...studioNotes,
    {
      where: 'scripts/build-docs-studio.cjs',
      text: fs.readFileSync(path.join(REPO_ROOT, 'scripts/build-docs-studio.cjs'), 'utf8'),
    },
  ];
}

/** `免税事業者等` を書くファイル (検査を除く) —— 母集団。 */
function filesMentioningMeasure(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        walk(abs);
      } else if (/\.(ts|tsx|cjs|mjs|js)$/.test(e.name)) {
        if (readOriginalSource(abs).includes('免税事業者等')) found.push(path.relative(REPO_ROOT, abs));
      }
    }
  };
  walk(path.join(REPO_ROOT, 'src'));
  walk(path.join(REPO_ROOT, 'scripts'));
  return found.sort();
}

describe('経過措置の割合 — 語る文はすべて表と同じ順', () => {
  it('前提: 割合は 4 段で、表の順は 80% → 70% → 50% → 30%', () => {
    expect(PERCENTS).toEqual(['80%', '70%', '50%', '30%']);
    expect(carriers().length).toBeGreaterThanOrEqual(5); // 母集団が死んだら鳴る床
  });

  it('★ 割合を語る文は、すべて段の順に割合を述べる', () => {
    for (const c of carriers()) {
      expect(c.text, c.where).not.toBe('');
      expect(statesScheduleInOrder(c.text), `${c.where}: ${c.text.slice(0, 60)}`).toBe(true);
    }
  });

  it('★ 規則は実際に当たる —— 改正前の文は落ち、改正後の文は通る (標本)', () => {
    const stale = '免税事業者等からの課税仕入れには経過措置（2023/10〜2026/9は80%、2026/10〜2029/9は50%控除）がある。';
    const current = `控除割合は ${invoiceTransitionScheduleLabel()} と段階縮小します。`;
    expect(statesScheduleInOrder(stale)).toBe(false);
    expect(statesScheduleInOrder(current)).toBe(true);
    expect(statesScheduleInOrder('')).toBe(false);
  });

  it('★ 改正前の終わり (2029 年 9 月) を残していない + 標本', () => {
    for (const c of carriers()) {
      for (const m of STALE_MARKERS) expect(c.text.includes(m), `${c.where} に ${m}`).toBe(false);
    }
    const stale = '2023年10月から2029年9月までは、免税事業者等からの課税仕入れについて…';
    expect(STALE_MARKERS.some((m) => stale.includes(m))).toBe(true); // 規則が当たる標本
  });

  it('★ 知識台帳の 2 項目は、同じ期間について同じ割合を言う', () => {
    const a = fact('tax-invoice');
    const b = fact('tax-invoice-input-credit');
    for (const p of PERCENTS) {
      expect(a.includes(p), `tax-invoice に ${p}`).toBe(true);
      expect(b.includes(p), `tax-invoice-input-credit に ${p}`).toBe(true);
    }
    // 終わりの年月も同じ (2031 年 9 月)。
    const [ey, em] = INVOICE_TRANSITION_END.split('-');
    for (const t of [a, b]) expect(t).toContain(`${Number(ey)}年${Number(em)}月`);
  });

  it('★ 画面と書類の文面は表から組む (綴り直しではない)', () => {
    const label = invoiceTransitionScheduleLabel();
    const notes = STUDIO_TEMPLATES.flatMap((t) => t.note).filter((n) => n.includes('免税事業者等'));
    expect(notes.length).toBeGreaterThanOrEqual(2);
    for (const n of notes) expect(n).toContain(label);
  });

  it('★ 期限は台帳 (lint:rate-freshness) に載っている', () => {
    const entry = gate.DATED_MEASURES.find((m) => m.constName === 'INVOICE_TRANSITION_END');
    expect(entry?.source).toBe('src/shared/invoiceTransition.ts');
  });

  it('★ 母集団: 免税事業者等 を書くファイルは台帳のとおり', () => {
    expect(filesMentioningMeasure()).toEqual([
      'scripts/build-docs-studio.cjs',
      'scripts/lint-rate-freshness.cjs',
      'src/renderer/data/complianceKnowledge.ts',
      'src/renderer/data/docStudioData.ts',
      'src/renderer/pages/TaxPage.tsx',
      'src/shared/invoiceTransition.ts',
      'src/shared/taxConsumption.ts',
    ]);
  });
});
