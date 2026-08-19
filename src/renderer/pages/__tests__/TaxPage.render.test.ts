/**
 * 税務試算ページ (TaxPage) のレンダー回帰テスト。
 *
 * 新設の「⑪ 不動産・資産にかかる税 (概算)」セクション (固定資産税/不動産取得税/
 * 登録免許税/印紙税/取得コスト総額の5ブロック) が、既定の入力値で
 *   (a) クラッシュせず描画される (TDZ / NaN throw がない)
 *   (b) 各ブロックが純粋モジュールをライブ呼び出しし、期待税額を表示する
 * ことを検証する。
 *
 * 既存の financePages.render.test.ts と同じ renderToStaticMarkup ベース
 * (render を同期実行し、render 時の throw を捕捉できる)。各ブロックは useState の
 * 既定値で計算するため、SSR 出力にその税額が現れることを実値照合する。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaxPage } from '../TaxPage';

beforeAll(() => {
  // render 中は触れないが、念のため window.serviceHub を最小スタブしておく。
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

function renderTax(): string {
  let html = '';
  expect(() => {
    html = renderToStaticMarkup(createElement(TaxPage));
  }).not.toThrow();
  return html;
}

describe('TaxPage 不動産・資産にかかる税セクション', () => {
  it('新セクション込みでクラッシュせず描画される', () => {
    const html = renderTax();
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('不動産・資産にかかる税 (概算)');
  });

  it('5つの小ブロックの見出しがすべて描画される', () => {
    const html = renderTax();
    expect(html).toContain('(a) 固定資産税・都市計画税');
    expect(html).toContain('(b) 不動産取得税');
    expect(html).toContain('(c) 登録免許税');
    expect(html).toContain('(d) 印紙税');
    expect(html).toContain('(e) 不動産取得コスト総額');
  });

  it('各ブロック冒頭に概算・税務助言ではない旨の注記が出る', () => {
    const html = renderTax();
    expect(html).toContain('概算であり税務助言ではありません');
  });

  it('(a) 固定資産税: 既定入力 (評価額3,000万/200㎡/住宅用地特例) で期待税額を表示', () => {
    const html = renderTax();
    // 固定資産税 30M/6×1.4% = ¥70,000 / 都市計画税 30M/3×0.3% = ¥30,000 / 合計 ¥100,000
    expect(html).toContain('¥70,000');
    expect(html).toContain('¥30,000');
    expect(html).toContain('¥100,000');
  });

  it('(b) 不動産取得税: 既定入力 (住宅家屋2,000万・軽減3%) で ¥600,000 を表示', () => {
    const html = renderTax();
    // 20M × 3% = ¥600,000、税率 3.0% を表示。
    expect(html).toContain('¥600,000');
    expect(html).toContain('3.0%');
  });

  it('(c) 登録免許税: 既定入力 (評価額2,000万・売買2.0%) で ¥400,000 を表示', () => {
    const html = renderTax();
    // 20M × 2.0% = ¥400,000、税率 2.0% を表示。
    expect(html).toContain('¥400,000');
    expect(html).toContain('2.0%');
  });

  it('(d) 印紙税: 既定入力 (第1号・記載金額3,000万) で ¥20,000 を表示', () => {
    const html = renderTax();
    // 第1号文書 5,000万円以下 → ¥20,000。
    expect(html).toContain('¥20,000');
  });

  it('(e) 取得コスト総額: 既定入力で取得税+登録免許税+印紙税 = ¥1,020,000 を表示', () => {
    const html = renderTax();
    // 600,000 + 400,000 + 20,000 = ¥1,020,000。
    expect(html).toContain('¥1,020,000');
  });
});

// --- ⑩-3 本則課税の仕入控除税額 ------------------------------------------
//
// ⑩ の「本則課税」は課税仕入れの消費税を**全額引ける**前提の式で、成り立つのは
// 課税売上割合 95% 以上かつ課税売上高 5億円以下のときだけ。非課税売上があると
// 按分が要る。按分せずに全額を引くと**納付が過少に出る**ので、実際の 2 方式で
// 計算する節を足した。既定入力で実際の金額が出ることまで見る。

describe('TaxPage ⑩-3 本則課税の仕入控除税額', () => {
  it('節が描画され、2 方式の見出しが出る', () => {
    const html = renderTax();
    expect(html).toContain('本則課税の仕入控除税額 (全額控除 / 個別対応 / 一括比例配分)');
    expect(html).toContain('個別対応方式 — 控除税額');
    expect(html).toContain('一括比例配分方式 — 控除税額');
    expect(html).toContain('個別対応方式 — 納付税額');
    expect(html).toContain('一括比例配分方式 — 納付税額');
  });

  it('既定入力の課税売上割合と控除税額を実値で出す', () => {
    // 既定: 課税売上 800万 + 軽減 0 + 免税 0、非課税 200万 → 割合 80.00%
    const html = renderTax();
    expect(html).toContain('80.00%');
    // 個別対応: 課税売上対応 200万 × 10% + 共通 40万 × 10% × 0.8 = 20万 + 3.2万 = 23.2万
    expect(html).toContain('232,000');
    // 一括比例配分: (200万 + 60万 + 40万) × 10% × 0.8 = 24万
    expect(html).toContain('240,000');
  });

  it('全額控除の要件を満たさないので按分が要ると告げる', () => {
    const html = renderTax();
    expect(html).toContain('全額控除の要件を満たしません');
    // 控除が多い一括比例配分方式が有利と出る (24万 > 23.2万)
    expect(html).toContain('一括比例配分方式</strong>');
  });

  it('一括比例配分方式の 2 年継続適用の縛りを明示する', () => {
    expect(renderTax()).toContain('2 年間は継続適用');
  });
});
