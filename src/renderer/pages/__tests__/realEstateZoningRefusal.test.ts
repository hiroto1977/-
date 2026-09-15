/** @vitest-environment jsdom */
/**
 * **画面が ⛔ で断っている寸法から、都市計画上の判定を作らない** (パス 206)。
 *
 * `RealEstatePage` の敷地プランナーは 11 の欄を `GuardedNumber` で受け、
 * `guardNumber` が上限超過に `level: 'fatal'` (赤枠 + `aria-invalid`) を出していた。
 * **その判定は計算側に届いていなかった** —— ページに `guardAll` の呼び出しは 1 件も無く、
 * `reNum(zpHeightStr)` が断られた値をそのまま読んでいた。実測した結果:
 *
 * | 入力 | 画面 | 判定 |
 * | --- | --- | --- |
 * | 計画する最高高さ 400 m (上限 300) | ⛔ 赤枠「300 m 以下で入力してください」 | 道路斜線の高さ限度・最小後退・日影規制の上限を**そのまま刷る** |
 *
 * 上限超過の文面は「0 m として計算されています」と違って**何を計算したかを言わない**ので、
 * 利用者は ⛔ と並んで、その値で作られた建築基準法まわりの判定を読むことになる。
 *
 * 同じファイルのパス 77 が「空欄の敷地寸法から『0 ㎡しか建てられない』を作らない」と
 * 決めている。**未入力を断るのに、宣言した上限を超えた値は断っていなかった。**
 *
 * 断る単位は**判定の段**であり画面全体ではない —— 間口が範囲外でも `適用建ぺい率` は
 * 正しいので、読んでいない欄のせいで判定を消さない (`ZONING_READS`)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import {
  ZONING_READS,
  refusedZoningFields,
  zoningRefusalLabels,
  zoningRefusalNote,
  type ZoningField,
} from '../RealEstatePage';

beforeAll(() => {
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

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'real-estate');
  if (!def) throw new Error('real-estate service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 欄を `aria-label` で引いて値を入れる (GuardedNumber は spec.label を aria-label に出す)。 */
async function typeField(label: string, value: string): Promise<HTMLInputElement> {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`field not found: ${label}`);
  await act(async () => {
    changeInput(input, value);
  });
  await settle();
  return input;
}

// パス 209 で部品を `components/RefusedFieldsNote.tsx` に移したので、印は
// `data-refused-fields` になった (敷地と試算の段が同じ部品を使う)。
const refusals = (): readonly string[] =>
  Array.from(container.querySelectorAll('[data-refused-fields]')).map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' '),
  );

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('敷地プランナー — ⛔ の欄から判定を作らない', () => {
  it('★ 対照: 既定値はすべて範囲内なので、判定が出て断りは出ない', async () => {
    await mountPage();
    // **標本つきの対照** —— この文面が実際に画面へ出ることを確かめてから、
    // 下の検査で「消えること」を見る (綴り違いで黙る検査にしない)。
    expect(text()).toContain('道路斜線の高さ限度');
    expect(text()).toContain('適用建ぺい率');
    expect(text()).toContain('作業場 (栽培室等)');
    expect(refusals()).toEqual([]);
    expect(container.querySelector('input[data-guard="fatal"]')).toBeNull();
  });

  it('★ 計画する最高高さが上限超過なら、高さ制限の判定を出さず欄を名指しする', async () => {
    await mountPage();
    const input = await typeField('計画する最高高さ (m)', '400');
    // 画面は既に ⛔ を出している (これが「届いていなかった」判定)。
    expect(input.getAttribute('data-guard')).toBe('fatal');
    const t = text();
    expect(t).not.toContain('道路斜線の高さ限度');
    expect(t).not.toContain('この高さに必要な最小後退');
    expect(t).not.toContain('日影規制を避けられる上限');
    expect(refusals().join(' | ')).toContain('計画する最高高さ (m)が入力できる範囲の外');
    // **読んでいない段は黙らせない** —— 敷地の段は高さを読まない。
    expect(t).toContain('適用建ぺい率');
  });

  it('★ 建ぺい率が上限超過なら、敷地・トレードオフ・工場プランが揃って断る', async () => {
    await mountPage();
    await typeField('建ぺい率 (%)', '150');
    const t = text();
    expect(t).not.toContain('適用建ぺい率');
    expect(t).not.toContain('建築面積の上限');
    expect(t).not.toContain('作業場 (栽培室等)');
    expect(t).not.toContain('斜線を通す最小後退');
    // 高さの段は建ぺい率を読まないので残る。
    expect(t).toContain('道路斜線の高さ限度');
    expect(refusals().length).toBe(4);
    for (const note of refusals()) expect(note).toContain('建ぺい率 (%)');
  });

  it('★ 間口が上限超過なら、寸法を読む段だけが断る (高さ制限は残る)', async () => {
    await mountPage();
    await typeField('敷地の間口 (m)', '9999');
    const t = text();
    expect(t).not.toContain('斜線を通す最小後退');
    expect(t).toContain('道路斜線の高さ限度');
    expect(t).toContain('適用建ぺい率');
    expect(refusals().join(' | ')).toContain('敷地の間口 (m)');
  });
});

describe('ZONING_READS / refusedZoningFields — 表そのもの', () => {
  const all: Record<ZoningField, string> = {
    site: '200', coverage: '60', far: '200', road: '6',
    height: '12', setback: '1', shadowThreshold: '10',
    siteDepth: '20', siteWidth: '10', rear: '1', side: '2',
    // 工場プランの 2 欄 (パス 216 で表に足した)。どちらも空欄に意味が在るので
    // 既定は空欄 —— `allowEmpty` なので ⛔ にも ⚠️ にもならない。
    workshopCap: '', workshopDesired: '',
  };

  it('★ 範囲内なら ⛔ は 0 件 (対照)', () => {
    expect(refusedZoningFields(all)).toEqual([]);
  });

  it('★ 工場プランの 2 欄も表に在る (パス 216 — 落ちていた 2 欄)', () => {
    // **パス 206 がこの表を手で書いたときに落としていた。** 素の `<input>` だったので
    // ⛔ が 1 度も出ず、常設の走査 (`input[data-guard]` を踏む) からも外れ、
    // `作業場の法定上限 = −9999` で `作業場 150 ㎡ → 0 ㎡`・`1階の残り 90 ㎡ → 240 ㎡`
    // という**都市計画上の答え**が出ていた (パス 216 で実測)。
    expect(refusedZoningFields({ ...all, workshopCap: '-9999' })).toEqual(['workshopCap']);
    expect(refusedZoningFields({ ...all, workshopDesired: '-1' })).toEqual(['workshopDesired']);
    // 工場プランと立体プレビューの両方がこの 2 欄を読む。
    expect(zoningRefusalLabels(['workshopCap'], ZONING_READS.factory))
      .toEqual(['作業場の法定上限 (㎡・空欄=制限なし)']);
    expect(zoningRefusalLabels(['workshopDesired'], ZONING_READS.iso))
      .toEqual(['希望する作業場面積 (㎡・空欄=上限まで)']);
    // **敷地・高さ・トレードオフの段は読まない** —— ⛔ 1 件で画面全体を黙らせない。
    expect(zoningRefusalLabels(['workshopCap'], ZONING_READS.site)).toEqual([]);
    expect(zoningRefusalLabels(['workshopCap'], ZONING_READS.height)).toEqual([]);
    expect(zoningRefusalLabels(['workshopCap'], ZONING_READS.tradeoff)).toEqual([]);
  });

  it('★ 0 は通る (作業場を建てられない用途地域 / 作業場を置かない)', () => {
    // `area` は既定で 0 を ⛔ にするので `allowZero` を明示した。**0 には意味が在る。**
    expect(refusedZoningFields({ ...all, workshopCap: '0', workshopDesired: '0' })).toEqual([]);
  });

  it('★ 空欄は warn なので ⛔ に入らない (パス 77 の未入力の扱いを壊さない)', () => {
    expect(refusedZoningFields({ ...all, siteDepth: '', siteWidth: '' })).toEqual([]);
  });

  it('★ 上限超過・下限未満・負値はすべて ⛔', () => {
    expect(refusedZoningFields({ ...all, coverage: '150' })).toEqual(['coverage']);
    expect(refusedZoningFields({ ...all, coverage: '0' })).toEqual(['coverage']);
    expect(refusedZoningFields({ ...all, road: '-1' })).toEqual(['road']);
    expect(refusedZoningFields({ ...all, height: '400', site: '-5' })).toEqual(['site', 'height']);
  });

  it('★ 段ごとの名指しは、その段が読んでいる欄だけ', () => {
    const refused = refusedZoningFields({ ...all, height: '400' });
    expect(zoningRefusalLabels(refused, ZONING_READS.height)).toEqual(['計画する最高高さ (m)']);
    expect(zoningRefusalLabels(refused, ZONING_READS.site)).toEqual([]);
    expect(zoningRefusalLabels(refused, ZONING_READS.factory)).toEqual([]);
    expect(zoningRefusalLabels(refused, ZONING_READS.tradeoff)).toEqual(['計画する最高高さ (m)']);
  });

  it('★ トレードオフと立体プレビューは敷地の段の出力を受けるので、敷地の欄も読む', () => {
    for (const k of ZONING_READS.site) {
      expect(ZONING_READS.tradeoff).toContain(k);
      expect(ZONING_READS.iso).toContain(k);
    }
  });

  it('★ 断りは 0 件なら null、1 件以上なら欄の名前を必ず含む', () => {
    expect(zoningRefusalNote([])).toBeNull();
    expect(zoningRefusalNote(['敷地面積 (㎡)'])).toContain('敷地面積 (㎡)');
    expect(zoningRefusalNote(['a', 'b'])).toContain('a・b');
    expect(zoningRefusalNote(['a'])).toContain('算定していません');
  });
});
