/** @vitest-environment jsdom */
/**
 * **書き出した CSV が、画面の断り書きを連れて出るか。**
 *
 * 2026-09-07 の実測: 財務分析には書き出しが 3 本ある。Markdown レポートは
 * 「※ 本レポートは概算データに基づく一般情報であり、財務助言ではありません。」を
 * 中に持っていたのに、**CSV 2 本 (諸表・指標) はどちらも 1 行も持っていなかった**。
 *
 * 中身は `businessFinancials.ts` が月次 KPI から丸ごと組み立てた概算で、
 * 貸借対照表の現預金・売上債権・棚卸資産・仕入債務・短期借入金・長期借入金は
 * **どの画面でも入力されていない**。画面には「概算 BS/CF」「年次概算」
 * 「事業別の貸借対照表データが無いため…概算生成しています」と 3 か所出ているが、
 * `statement-bs-A-2026-09-07.csv` を受け取った会計事務所・金融機関には
 * 「項目, 金額」の 16 行しか届かない —— **会社の貸借対照表として読める。**
 *
 * 単体検査 (`data/__tests__/financialCsv.test.ts`) は「渡せば入る」を留める。
 * ここは**画面のボタンが実際に渡しているか**を、実 DOM で押して確かめる ——
 * 「関数は正しいが画面が呼んでいない」を見逃さないため。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';
import { statementEstimateNotes } from '../../data/financialStatements';

function unit(id: string, monthlyRevenue: number, sample?: boolean): FinancialUnit {
  const variableCost = Math.round(monthlyRevenue * 0.4);
  const fixedCost = Math.round(monthlyRevenue * 0.3);
  return {
    id,
    label: `${id}事業`,
    current: { revenue: monthlyRevenue, variableCost, fixedCost, profit: monthlyRevenue - variableCost - fixedCost, profitMargin: 30 },
    history: [],
    ...(sample === undefined ? {} : { sample }),
  };
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
/** ダウンロードされた中身 (Blob → 文字列)。 */
let downloads: string[];

beforeEach(() => {
  downloads = [];
  // 実際に押した結果が何になるかを掴む。URL.createObjectURL は jsdom に無い。
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      // Blob.text() は非同期なので、渡された部品から直接組み立てる。
      downloads.push((blob as unknown as { __parts?: string[] }).__parts?.join('') ?? '');
      return 'blob:stub';
    },
    revokeObjectURL: () => {},
  });
  // 部品を覚える Blob。jsdom の Blob は中身を同期で読み出せない。
  const RealBlob = globalThis.Blob;
  class RecordingBlob extends RealBlob {
    readonly __parts: string[];
    constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
      super(parts, options);
      this.__parts = parts.map((p) => String(p));
    }
  }
  vi.stubGlobal('Blob', RecordingBlob);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(units: readonly FinancialUnit[]): void {
  act(() => { root.render(createElement(FinancialAnalysis, { units })); });
}

/** 見出しの文字で押すボタンを選ぶ。 */
function clickButton(text: string): void {
  const btn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  expect(btn, `「${text}」のボタンが見つかりません`).toBeTruthy();
  act(() => { btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('財務分析の CSV 書き出し — 概算の断りが中に残る', () => {
  const units = [unit('A', 1_000_000), unit('S', 500_000, true)];

  it('★ 諸表 CSV を押すと、画面と同じ断り書きが中に入る', () => {
    render(units);
    clickButton('この諸表をCSV');
    expect(downloads).toHaveLength(1);
    const csv = downloads[0]!;
    for (const note of statementEstimateNotes()) expect(csv).toContain(note);
    // 綴りの錨 — 上の loop は同じ出所を両辺に置くので、文が空でも通る。
    // 中身そのものは `data/__tests__/financialStatements.test.ts` が綴りで留めており、
    // ここでは「その中身が実際にファイルへ届く」ことを 1 つ確かめる。
    expect(csv).toContain('概算であり財務助言ではありません');
  });

  it('★ 諸表 CSV は対象 (事業名 + 書類名) も中に持つ — ファイル名に頼らない', () => {
    render(units);
    clickButton('この諸表をCSV');
    expect(downloads[0]).toContain('対象: A事業・単体・損益計算書');
  });

  it('★ 書類を切り替えると、対象の書類名も追随する', () => {
    render(units);
    clickButton('貸借対照表');
    clickButton('この諸表をCSV');
    expect(downloads[0]).toContain('対象: A事業・単体・貸借対照表');
    // 表の中身も貸借対照表になっている (タブだけ変わって中身が変わらない、を防ぐ標本)。
    expect(downloads[0]).toContain('資産合計,');
  });

  it('★ 指標 CSV も断り書きと、サンプルを何件含むかを中に持つ', () => {
    render(units);
    clickButton('全事業の指標をCSVで書き出し');
    expect(downloads).toHaveLength(1);
    for (const note of statementEstimateNotes()) expect(downloads[0]).toContain(note);
    expect(downloads[0]).toContain('対象: 全事業 2 件（うちサンプル 1 件）');
  });

  it('対照: 断り書きは画面にも出ている (書き出しだけの文にしていない)', () => {
    render(units);
    const shown = host.textContent ?? '';
    for (const note of statementEstimateNotes()) expect(shown).toContain(note);
    expect(shown).toContain('概算であり財務助言ではありません');
    expect(shown).toContain('諸表・指標・チャートは同じ概算財務データに連動');
  });

  it('対照: 書き出す前は 1 件もダウンロードしていない', () => {
    render(units);
    expect(downloads).toHaveLength(0);
  });
});
