/** @vitest-environment jsdom */
/**
 * **⛔ の「マイナスの値」から判定を作らない** (パス 209)。
 *
 * パス 206〜208 で閉じたのは `max`（上限）の家系。`guardNumber` が `fatal` を返す
 * もう一つの道は **`negativeIsFatal`** ——「マイナスの値（−9999）は指定できません」——
 * で、`percent` 以外のすべての kind が既定でこの道を持つ。誰も読んでいなかった。
 *
 * 全画面の ⛔ 欄に **−9999** を入れて Stat タイルの差分を取った実測。
 * **★ は「より good な方向」へ動く** —— 10^163 のような明らかに変な値ではなく、
 * **より安心させる答え**が出るので、読む側に気づく手がかりが無い:
 *
 * | 画面 | 欄 | 出ていた物 |
 * | --- | --- | --- |
 * | real-estate | ★ 年間経費 | `実質利回り 3.37% → **4.80%**`・**`DSCR 0.88 → 1.28`**（危険水域から目安超えへ）・`損益分岐入居率 104% → 74.4%` |
 * | real-estate | ★ 年間返済額 | `返済後CF −84,000 → **+1,416,000**`・`CCR −0.84% → 14.16%`・`IRR 12.84% → 22.62%` |
 * | real-estate | ★ 保有年数 | `IRR 12.84% → **249.16%**` |
 * | real-estate | 月額賃料 | `NOI ¥-600,000`・**`DSCR -0.40`**・`CCR -21.00%` |
 * | mutual-funds | ★ 目標額 (円) | `到達見込み (不足 ¥5,816,560)` → **`(達成)`** |
 * | mutual-funds | ★ 取得時レート | `為替損益 ¥200,000 → **¥1,500,000**` |
 * | mutual-funds | 現在レート | `損益率 15.4% → **-7791.5%**` |
 *
 * **`nonNeg` を足すだけでは足りない** —— 0 に倒すと「経費 0 円の物件」「取得レート 0」
 * という**別の判定**になる（パス 205 の「天井を床にした」の裏返し）。だからパス 206 と
 * 同じ形を採った: **段ごとに ⛔ の欄を名指しして算定しない。**
 *
 * **`team` (5 欄) と `overview` (12 欄) はタイルが 1 つも動かない** ので触っていない ——
 * 実測で確かめた（パス 208 で「対象外」と書いた根拠を負値でも確かめた）。
 * `mutual-funds` のほかの ⛔ 欄と `tax` の金額欄は 0 に倒れるだけで、`nonNeg` の
 * 契約どおり（「負は無意味なので 0」）なので defect ではない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';

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

async function mountPage(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`service missing: ${id}`);
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

async function typeField(label: string, value: string): Promise<HTMLInputElement> {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`field not found: ${label}`);
  await act(async () => {
    changeInput(input, value);
  });
  await settle();
  return input;
}

/** `.stat-grid` のタイルを「ラベル → 値」で読む。 */
function tiles(): Map<string, string> {
  const m = new Map<string, string>();
  for (const grid of Array.from(container.querySelectorAll('.stat-grid'))) {
    for (const card of Array.from(grid.children)) {
      const kids = Array.from(card.children);
      const label = (kids[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const value = (kids[1]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (label !== '') m.set(label, value);
    }
  }
  return m;
}

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

describe('不動産の試算 — ⛔ のマイナスから判定を作らない (パス 209)', () => {
  it('★ 対照: 既定値では 4 段すべてに数字が出て、断りは出ない', async () => {
    await mountPage('real-estate');
    // **標本つきの対照** —— まず在ることを確かめてから、下で「消えること」を見る。
    const t = tiles();
    expect(t.get('実質利回り')).toBe('3.37%');
    expect(t.get('DSCR')).toBe('0.88');
    expect(t.get('IRR (年率概算)')).toBe('12.84%');
    expect(t.get('年間減価償却費 (定額法)')).toBe('¥531,915');
    expect(t.get('償却年数')).toBe('47 年');
    expect(refusals()).toEqual([]);
  });

  it('★ 年間経費がマイナスなら、利回りも DSCR も出さない (1.28 と答えない)', async () => {
    await mountPage('real-estate');
    const input = await typeField('年間経費', '-9999');
    expect(input.getAttribute('data-guard')).toBe('fatal');
    const t = tiles();
    // レバレッジ・精緻化・NPV の 3 段が読む欄。
    expect(t.get('実質利回り')).toBeUndefined();
    expect(t.get('DSCR')).toBeUndefined();
    expect(t.get('IRR (年率概算)')).toBeUndefined();
    // **「より good な方向」の数字が 1 つも残っていない。**
    const body = text();
    expect(body).not.toContain('4.80%');
    expect(body).not.toContain('1.28');
    expect(refusals().join(' | ')).toContain('年間経費が入力できる範囲の外');
    // 減価償却は別の欄を読むので黙らせない。
    expect(t.get('年間減価償却費 (定額法)')).toBe('¥531,915');
  });

  it('★ 年間返済額がマイナスなら、返済後CF・CCR・IRR を出さない', async () => {
    await mountPage('real-estate');
    await typeField('年間返済額', '-9999');
    const t = tiles();
    expect(t.get('返済後CF (年)')).toBeUndefined();
    expect(t.get('CCR (自己資金回収率)')).toBeUndefined();
    expect(t.get('IRR (年率概算)')).toBeUndefined();
    expect(text()).not.toContain('+1,416,000');
    expect(refusals().join(' | ')).toContain('年間返済額');
  });

  it('★ 保有年数がマイナスなら NPV/IRR の段だけを断る (レバレッジは残る)', async () => {
    await mountPage('real-estate');
    await typeField('保有年数', '-9999');
    const t = tiles();
    expect(t.get('IRR (年率概算)')).toBeUndefined();
    expect(text()).not.toContain('249.16%');
    // 保有年数は NPV/IRR の段しか読まない。
    expect(t.get('実質利回り')).toBe('3.37%');
    expect(t.get('DSCR')).toBe('0.88');
    expect(refusals().join(' | ')).toContain('保有年数');
  });

  it('★ 月額賃料がマイナスなら、NOI も DSCR も出さない (-0.40 と答えない)', async () => {
    await mountPage('real-estate');
    await typeField('月額賃料', '-9999');
    const t = tiles();
    expect(t.get('NOI (年)')).toBeUndefined();
    expect(t.get('DSCR')).toBeUndefined();
    expect(text()).not.toContain('-0.40');
    expect(refusals().join(' | ')).toContain('月額賃料');
  });

  it('★ 耐用年数が空欄なら「償却年数 —」(⚠️ の段は描くので、ここが案内文の出口だった)', async () => {
    await mountPage('real-estate');
    const input = await typeField('耐用年数 (年)', '');
    // **空欄は ⚠️ (fatal ではない)** ので段は描かれる —— 欄が「未入力です。0 年 として
    // 計算されています」と既に述べているため。だから `DASH` の枝に届くのはこの道だけで、
    // 直す前はここに **「1〜100 年で入力してください」が Stat の値として**入っていた。
    expect(input.getAttribute('data-guard')).toBe('warn');
    const t = tiles();
    expect(t.get('償却年数')).toBe('—');
    expect(text()).not.toContain('年で入力してください');
    // 段は断っていないので、隣のタイルは出る (0 年での償却費は 0 円)。
    expect(t.get('年間減価償却費 (定額法)')).toBe('¥0');
    expect(refusals()).toEqual([]);
  });

  it('★ 耐用年数がマイナスなら、償却の段を断る (数の枠に案内文を入れない)', async () => {
    await mountPage('real-estate');
    await typeField('耐用年数 (年)', '-9999');
    expect(tiles().get('償却年数')).toBeUndefined();
    // **以前はここに「1〜100 年で入力してください」が値として入っていた。**
    expect(text()).not.toContain('年で入力してください');
    expect(refusals().join(' | ')).toContain('耐用年数 (年)');
    // ほかの段は読まないので残る。
    expect(tiles().get('実質利回り')).toBe('3.37%');
  });
});

describe('投資信託 — ⛔ のマイナスから判定を作らない (パス 209)', () => {
  it('★ 対照: 既定値では貯蓄計画と為替に数字が出て、断りは出ない', async () => {
    await mountPage('mutual-funds');
    const t = tiles();
    expect(t.get('目標達成に必要な毎月積立額')).toBe('¥71,711');
    expect(t.get('為替損益')).toBe('¥200,000');
    expect(t.get('損益率')).toBe('15.4%');
    expect(refusals()).toEqual([]);
  });

  it('★ 目標額がマイナスなら「(達成)」と答えない', async () => {
    await mountPage('mutual-funds');
    const input = await typeField('目標額 (円)', '-9999');
    expect(input.getAttribute('data-guard')).toBe('fatal');
    const t = tiles();
    expect(t.get('現行積立での到達見込み')).toBeUndefined();
    expect(t.get('目標達成に必要な毎月積立額')).toBeUndefined();
    expect(text()).not.toContain('(達成)');
    expect(refusals().join(' | ')).toContain('目標額 (円)');
    // 為替の段は別の欄なので残る。
    expect(t.get('為替損益')).toBe('¥200,000');
  });

  it('★ 取得時レートがマイナスなら「為替損益 ¥1,500,000」を出さない', async () => {
    await mountPage('mutual-funds');
    await typeField('取得時レート', '-9999');
    const t = tiles();
    expect(t.get('為替損益')).toBeUndefined();
    expect(t.get('損益率')).toBeUndefined();
    expect(text()).not.toContain('¥1,500,000');
    expect(refusals().join(' | ')).toContain('取得時レート');
    // 貯蓄計画の段は残る。
    expect(t.get('目標達成に必要な毎月積立額')).toBe('¥71,711');
  });

  it('★ 現在レートがマイナスなら「損益率 -7791.5%」を出さない', async () => {
    await mountPage('mutual-funds');
    await typeField('現在レート', '-9999');
    expect(tiles().get('損益率')).toBeUndefined();
    expect(text()).not.toContain('-7791.5%');
    expect(refusals().join(' | ')).toContain('現在レート');
  });
});

describe('投資信託 — 0 に倒れて「より good な方向」へ動いていた 2 件 (パス 211)', () => {
  // パス 209 は「`nonNeg` の契約どおりなので defect ではない」と書いた。**甘かった。**
  // 0 倒しの向きは欄ごとに違い、この 2 件は**利用者を安心させる方向**へ動く。
  // パス 210 の走査 (`guardedJudgements.test.ts`) が台帳に載せ、ここで閉じた。

  it('★ 達成年数がマイナスなら「実質価値 = 目標額そのまま」と答えない', async () => {
    await mountPage('mutual-funds');
    const input = await typeField('達成年数', '-9999');
    expect(input.getAttribute('data-guard')).toBe('fatal');
    const t = tiles();
    // **割引年数が 0 になると、インフレ調整が何もしないのと同じ**になる ——
    // 「10 年後の 1,000 万円の実質価値は 1,000 万円」という、いちばん都合のよい答え。
    expect(t.get('目標額のインフレ調整後 実質価値')).toBeUndefined();
    expect(text()).not.toContain('¥10,000,000');
    expect(t.get('現行積立での到達見込み')).toBeUndefined();
    expect(refusals().join(' | ')).toContain('達成年数');
    // 予備資金は別の欄を読むので残る (段を分けた・パス 211)。
    expect(t.get('現預金でまかなえる月数')).toBe('約 3 か月');
  });

  it('★ 為替手数料がマイナスなら「両替無料 (TTS = TTB)」と答えない', async () => {
    await mountPage('mutual-funds');
    const before = tiles();
    expect(before.get('TTS (売・顧客が買う)')).toBe('150.5');
    expect(before.get('TTB (買・顧客が売る)')).toBe('149.5');
    expect(before.get('売り戻し後の円')).toBe('¥1,490,033');
    const input = await typeField('為替手数料 (片道・円)', '-9999');
    expect(input.getAttribute('data-guard')).toBe('fatal');
    const t = tiles();
    // 手数料が 0 に倒れると **TTS と TTB が一致し、往復コストが消える** ——
    // 「売り戻したら出したお金がそのまま戻る」という、実在しない答え。
    expect(t.get('TTS (売・顧客が買う)')).toBeUndefined();
    expect(t.get('TTB (買・顧客が売る)')).toBeUndefined();
    expect(t.get('売り戻し後の円')).toBeUndefined();
    expect(t.get('往復両替コスト')).toBeUndefined();
    expect(t.get('往復コスト率')).toBeUndefined();
    // **`text()` 全体に `¥1,500,000` が無いことは主張できない** —— 隣の
    // `現在の円換算額` (外貨額 10,000 × 現在レート 150) が正しく ¥1,500,000 を
    // 刷っている。危ないのは「往復したのに減らない」= `売り戻し後の円` が
    // 同じ額になることなので、**タイルの単位で見る**。
    expect(t.get('現在の円換算額')).toBe('¥1,500,000');
    expect(refusals().join(' | ')).toContain('為替手数料 (片道・円)');
    // 損益の段は手数料を読まないので残る。
    expect(t.get('為替損益')).toBe('¥200,000');
  });

  it('★ 手元資金がマイナスでも「目標達成に必要な毎月積立額」は出し続ける (段を分けた)', async () => {
    await mountPage('mutual-funds');
    await typeField('手元資金 (円)', '-9999');
    const t = tiles();
    expect(t.get('予備資金 充足率')).toBeUndefined();
    expect(t.get('現預金でまかなえる月数')).toBeUndefined();
    // **⛔ 1 件で節全体を黙らせない** (パス 206 の規準)。
    expect(t.get('目標達成に必要な毎月積立額')).toBe('¥71,711');
    expect(refusals().join(' | ')).toContain('手元資金 (円)');
  });
});

describe('チーム・ホーム — ⛔ でもタイルが動かないことを確かめる (触っていない根拠)', () => {
  // **触っていないことの根拠を検査で持つ。** 「対象外」と散文で書くだけだと、
  // あとで動くようになっても誰も気づかない (パス 148 の形)。
  for (const [id, label, tile] of [
    ['team', '賞与額 (円)', null],
    ['overview', '床面積 (m²)', null],
  ] as const) {
    it(`★ ${id}: ${label} がマイナスでも Stat タイルは変わらない`, async () => {
      await mountPage(id);
      const before = JSON.stringify([...tiles()]);
      const input = await typeField(label, '-9999');
      expect(input.getAttribute('data-guard'), `${label} が ⛔ にならない`).toBe('fatal');
      expect(JSON.stringify([...tiles()])).toBe(before);
      expect(tile).toBeNull(); // 変わるタイルは無い
    });
  }
});
