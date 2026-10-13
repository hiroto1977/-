/** @vitest-environment jsdom */
/**
 * **背骨 —— 実物の画面で押して、実物の保管層を見る** (2026-09-24 · パス 448)。
 *
 * この欠陥は「判定が無い」のではなく「**書いた物を見せる面が無い**」側だったので、
 * 字面ではなく**押して描いて**測る。
 *
 * 直す前の実測 (`stocks-to-storage-export` を 3 回押す):
 * 行は 3 件保管され、画面には 1 行も出ず、点検パネルは「調べた 3 件 / 形式不正 0 件」。
 * つまり**どの面にも現れない**。
 *
 * 錠は構造で取る —— 「ストレージ」はコネクタ一覧の説明文にも出るので、
 * その綴りで待つと**行が届く前の姿**を測る (パス 442 / 445 / 446 / 447 で踏んだ罠)。
 * 待つのは `[data-connector-output-row]`。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConnectorsPage } from '../ConnectorsPage';
import { getRecordStore } from '../../data/store';
import { CONNECTOR_OUTPUT_COLLECTION } from '../../data/connectorExecution';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;

/** storage へ書く無料コネクタ (直す前は face が無かった側)。 */
const STORAGE_CONNECTOR = 'stocks-to-storage-export';

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ConnectorsPage));
  });
  await waitForElement(
    () => container.querySelector(`[aria-label="${STORAGE_CONNECTOR} を実行"]`),
    '実行ボタン',
  );
}

const text = (): string => container.textContent ?? '';

const button = (label: string): HTMLButtonElement => {
  const el = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`ボタンが無い: ${label}`);
  return el;
};

const outputRows = (): Element[] => [...container.querySelectorAll('[data-connector-output-row]')];

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
    await act(async () => { r.unmount(); });
  }
  container.remove();
});

describe('ストレージに記録した実行結果 — 画面 (パス 448)', () => {
  it('★ 押すと保管され、その行が画面に出て「削除」で消せる', async () => {
    await mount();
    expect(outputRows(), '押す前から行が出ている').toHaveLength(0);
    expect(text(), '空の断りが出ていない').toContain('まだ 1 件も記録していません');

    await act(async () => { button(`${STORAGE_CONNECTOR} を実行`).click(); });
    // 錠: この it が作った行が届いた印 (見出しの綴りでは待たない)。
    await waitForElement(() => container.querySelector('[data-connector-output-row]'), '記録の行');

    expect(await getRecordStore().list(CONNECTOR_OUTPUT_COLLECTION), '保管されていない').toHaveLength(1);
    expect(outputRows(), '保管したのに画面に出ない').toHaveLength(1);
    expect(text(), 'どのコネクタの行か分からない').toContain(STORAGE_CONNECTOR);

    await act(async () => { button(`${STORAGE_CONNECTOR} の記録を削除`).click(); });
    await settleUntil(() => outputRows().length === 0, '削除しても行が残っている');
    expect(await getRecordStore().list(CONNECTOR_OUTPUT_COLLECTION), '保管層から消えていない').toHaveLength(0);
    expect(text()).toContain('まだ 1 件も記録していません');
  });

  it('★ 押すたびに 1 件増え、消すのは押した行だけ', async () => {
    await mount();
    for (let i = 0; i < 3; i += 1) {
      await act(async () => { button(`${STORAGE_CONNECTOR} を実行`).click(); });
      await settleUntil(() => outputRows().length === i + 1, `${i + 1} 件目が出ない`);
    }
    expect(outputRows()).toHaveLength(3);

    const firstId = outputRows()[0]!.getAttribute('data-connector-output-row');
    await act(async () => { button(`${STORAGE_CONNECTOR} の記録を削除`).click(); });
    await settleUntil(() => outputRows().length === 2, '1 件だけ減らない');
    expect(
      outputRows().map((el) => el.getAttribute('data-connector-output-row')),
      '消したのと別の行が消えた',
    ).not.toContain(firstId);
    expect(await getRecordStore().list(CONNECTOR_OUTPUT_COLLECTION)).toHaveLength(2);
  });

  it('★ 保管層に先に在る行も出て消せる (押していない行を締め出さない)', async () => {
    await getRecordStore().insert(CONNECTOR_OUTPUT_COLLECTION, {
      connectorId: 'zzz-older-run',
      key: 'K1',
      payload: {},
    });
    await mount();
    await waitForElement(() => container.querySelector('[data-connector-output-row]'), '既存の行');
    expect(text()).toContain('zzz-older-run');
    expect(button('zzz-older-run の記録を削除')).toBeTruthy();
  });

  it('★ 欄が読めない行でも、行そのものは出て消せる', async () => {
    await getRecordStore().insert(CONNECTOR_OUTPUT_COLLECTION, {
      connectorId: 42 as unknown as string,
      key: 42 as unknown as string,
      payload: {},
    });
    await mount();
    await waitForElement(() => container.querySelector('[data-connector-output-row]'), '読めない行');
    expect(outputRows(), '読めないだけで行が消えた').toHaveLength(1);
    expect(text()).toContain('(読めません)');
    expect(button('(読めません) の記録を削除')).toBeTruthy();
  });

  it('★ library 側の逃げ口を名指しする (storage だけが宙に浮かない)', async () => {
    await mount();
    expect(text(), 'library へ書いた分の行き先を言わない').toContain('ライブラリ');
  });
});
