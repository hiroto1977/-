/** @vitest-environment jsdom */
/**
 * **背骨 —— 実物の保管層へ入れて、実物の欄を描く** (2026-09-24 · パス 447)。
 *
 * `inertOverrides.test.ts` は判定と文を直接見るが、この欠陥は
 * 「**判定が画面に配線されていない**」側だった —— `applyOverrides` は捨てた物を
 * `ignored` で返しており、**出荷コードにその読み手が 0 件**だった。
 * だから字面ではなく**描いて数える**。
 *
 * ## 直す前の実測 (2026-09-24 · `kpi` に一覧の 1 件 + 孤児 1 件)
 *
 * | 見るもの | 直す前 |
 * | --- | --- |
 * | 見出し | **置き換え 2 件** |
 * | 「手入力」の札 | **1 件** |
 * | 「自動に戻す」 | **1 件** |
 * | 孤児のパスの綴り | **画面に 1 字も無い** |
 *
 * `linux` (一覧を持たない画面) に 1 件置くと、見出しは「置き換え 1 件」と言い
 * **パネルそのものが出ず**、消すボタンは 0 件だった。
 *
 * ## 錠は構造で取る
 *
 * 「置き換え」という綴りはパネルの見出し (「計算値の置き換え」) にも在るので、
 * それで待つと**行が届く前の姿**を測る (パス 442 / 445 / 446 で踏んだ罠)。
 * 待つのは `[data-inert-override]`、つまりこの `it` が置いた行が landed した印。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ManualDataSection } from '../ManualDataSection';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { MANUAL_OVERRIDES_COLLECTION, catalogFor, hasCatalog } from '../../data/manualData';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;

const ORPHAN = 'zzzGoneField';

async function seed(scope: string, path: string, value: number): Promise<void> {
  await getRecordStore().insert(MANUAL_OVERRIDES_COLLECTION, { scope, path, value });
}

async function mountAndOpen(scope: string): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ManualDataSection, { scope }));
  });
  const head = await waitForElement(
    () => container.querySelector<HTMLButtonElement>('[data-manual-data] > button'),
    '見出しのボタン',
  );
  await act(async () => {
    head.click();
  });
  await waitForElement(() => container.querySelector('[data-business-units]'), '事業の節');
}

const text = (): string => container.textContent ?? '';

const buttons = (label: string): HTMLButtonElement[] =>
  [...container.querySelectorAll('button')].filter((b) => (b.textContent ?? '').trim() === label);

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe('使われていない置き換え — 画面 (パス 447)', () => {
  it('★ 一覧に無いパスの行が、綴りと値つきで出て「削除」で消せる', async () => {
    expect(hasCatalog('kpi'), 'kpi に一覧が無い (前提が崩れた)').toBe(true);
    const live = catalogFor('kpi')[0]!.path;
    await seed('kpi', live, 12345);
    await seed('kpi', ORPHAN, 999999);
    await mountAndOpen('kpi');
    // 錠: この it が置いた孤児の行が届いた印。見出しの綴りでは待たない。
    await waitForElement(() => container.querySelector('[data-inert-override]'), '効かない行');

    expect(text(), '孤児のパスが画面に出ていない').toContain(ORPHAN);
    expect(text(), '保存した値が出ていない').toContain('999,999');
    expect(container.querySelectorAll('[data-inert-override="no-field"]').length).toBe(1);
    expect(buttons('削除').length, '消す口が無い').toBe(1);

    // 効く行は置き換え欄の側に残る (片方だけを出す直しになっていない)。
    expect(container.querySelectorAll('[data-overridden]').length, '効く行の札が消えた').toBe(1);
    expect(text()).toContain('12,345');

    await act(async () => {
      buttons('削除')[0]!.click();
    });
    await settleUntil(
      () => container.querySelector('[data-inert-override]') === null,
      '削除しても行が残っている',
    );
    expect(text(), '消したのに綴りが残っている').not.toContain(ORPHAN);
    expect(await getRecordStore().list(MANUAL_OVERRIDES_COLLECTION)).toHaveLength(1);
  });

  it('★ 見出しは未適用の件数も言う', async () => {
    await seed('kpi', catalogFor('kpi')[0]!.path, 1);
    await seed('kpi', ORPHAN, 2);
    await mountAndOpen('kpi');
    await waitForElement(() => container.querySelector('[data-inert-override]'), '効かない行');
    const head = container.querySelector('[data-manual-data] > button')!;
    expect(head.textContent).toContain('置き換え 2 件');
    expect(head.textContent, '未適用の件数を言わない').toContain('うち 1 件は未適用');
  });

  it('★ 一覧を持たない画面でも、保存された行は見えて消せる', async () => {
    expect(hasCatalog('linux'), 'linux に一覧が在る (前提が崩れた)').toBe(false);
    await seed('linux', 'whatever', 42);
    await mountAndOpen('linux');
    await waitForElement(() => container.querySelector('[data-inert-override]'), '効かない行');
    // 置き換え欄そのものは出ない (置ける欄が無いので正しい)。
    expect(container.querySelector('[data-manual-overrides]'), '一覧が無いのに置き換え欄が出た').toBeNull();
    expect(text()).toContain('whatever');
    expect(buttons('削除').length, '消す口が無い').toBe(1);
  });

  it('★ 値が数として読めない行は「手入力」の緑の札を出さない', async () => {
    const live = catalogFor('kpi')[0]!.path;
    await seed('kpi', live, NaN);
    await mountAndOpen('kpi');
    await waitForElement(() => container.querySelector('[data-inert-override]'), '効かない行');
    expect(container.querySelectorAll('[data-inert-override="bad-value"]').length).toBe(1);
    expect(
      container.querySelectorAll('[data-overridden]').length,
      '適用されていないのに「手入力」と名乗っている',
    ).toBe(0);
    expect(text(), '適用されていない値を整形して刷っている').not.toContain('NaN 円');
    expect(text()).toContain('数として読めません');
  });

  it('★ 効く行だけなら、この節は出ない', async () => {
    await seed('kpi', catalogFor('kpi')[0]!.path, 777);
    await mountAndOpen('kpi');
    await waitForElement(() => container.querySelector('[data-overridden]'), '効く行の札');
    expect(container.querySelector('[data-inert-overrides]'), '効かない行が無いのに節が出た').toBeNull();
    expect(container.querySelector('[data-manual-data] > button')!.textContent).not.toContain('未適用');
  });

  it('★ 保管したパスは天井を通る —— 形の表は長さを見ない (パス 419 / 420 の家系)', async () => {
    // 形は `path: str` としか言わないので、復元や別の道具が入れた行はいくらでも長くなりうる。
    // ここが**その行を見せる唯一の面**なので、天井が無ければ 1 件で欄が使えなくなる。
    const BIG = 'z'.repeat(200_000);
    await seed('kpi', BIG, 1);
    await mountAndOpen('kpi');
    await waitForElement(() => container.querySelector('[data-inert-override]'), '効かない行');
    expect(text().length, '欄が保管値の長さで膨らんでいる').toBeLessThan(20_000);
    expect(text(), '切ったことを述べていない').toContain('…');
    expect(buttons('削除').length, '長いだけで消す口が消えた').toBe(1);
  });

  it('★ 別の画面の行はこの画面に出ない', async () => {
    await seed('sales', ORPHAN, 5);
    await mountAndOpen('kpi');
    // 効く行も効かない行も無いので、節が出ないことを待ってから見る。
    await settleUntil(
      () => container.querySelector('[data-manual-overrides]') !== null,
      '置き換え欄が出ない',
    );
    expect(container.querySelector('[data-inert-overrides]'), '別の画面の行が出ている').toBeNull();
    expect(text()).not.toContain(ORPHAN);
  });
});
