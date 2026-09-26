/** @vitest-environment jsdom */
/**
 * **③ 全控除込みの精密試算 の控除欄の天井** (パス 217 / 218)。
 *
 * 名前はパス 218 で `taxIdecoCeiling` から変えた —— 同じ節の別の欄を足したので、
 * iDeCo だけの名前は狭い (**古い名前は仕様ではなく、その時点の記録である**)。
 *
 * ## パス 218 の実測 —— 残りの欄は既に法定上限で倒れていた
 *
 * `calcAllDeductions` に 9,999,999,999 を入れて控除合計の増分を測った
 * (総所得 500 万・令和8年分):
 *
 * | 欄 | 増分 | 判定 |
 * | --- | ---: | --- |
 * | 生命保険料 (新・一般) | +40,000 | 法定上限で倒れる |
 * | 生命保険料 (新・3区分) | +120,000 | 〃 |
 * | 生命保険料 (旧・一般) | +50,000 | 〃 |
 * | 地震保険料 | +50,000 | 〃 |
 * | 医療費 | +2,000,000 | 〃 (200 万) |
 * | セルフメディケーション | +88,000 | 〃 |
 * | 寄附金 | +2,000,000 | 〃 (総所得 40%) |
 * | **社会保険料** | **+9,999,999,999** | **天井が無い** |
 *
 * **予定していた「保険料の欄に `sane` を足す」は不要だった** —— 測ると全部
 * 倒れていた。残ったのは社会保険料 1 欄で、こちらは**法定上限が本当に無い**
 * (控除額 = 実際に支払った額)。だから ⛔ (`max`) は作れず、⚠️ (`sane`) を使う。
 * `money` の既定の `sane` は 10 兆円なので、100 億円は何も言わずに通っていた。
 *
 * ---
 *
 * **iDeCo 拠出に法定の天井が無く、所得税が ¥0 になっていた** (パス 217)。
 *
 * `TaxPage` の ③ 全控除込みの精密試算 は `iDeCo 職業区分 (拠出上限)` の選択肢に
 * 「未指定 (上限なし)」を持ち、`calcAllDeductions` はその枝で `Math.max(0, 拠出額)`
 * しか通していなかった —— **どの区分の上限も掛からなかった**。
 *
 * 実測 (直す前・既定の額面 5,000,000 円 / iDeCo 拠出 9,999,999,999 円):
 *
 * | タイル | 直す前 | 直した後 |
 * | --- | ---: | ---: |
 * | 所得税 (税額控除後) | **¥0** | ¥147,535 → 上限 81.6 万を引いた額 |
 * | 住民税 (税額控除後) | **¥5,000** | 同 |
 * | 共済+iDeCo (内訳) | **¥9,999,999,999** | **¥816,000** |
 *
 * 直し方は 2 段:
 *
 * 1. **計算** —— 区分が未選択なら `IDECO_ANNUAL_CAP_MAX` (= 区分ごとの上限の最大値・
 *    自営業 81.6 万) で倒す。**最小値 (公務員 14.4 万) に倒すのは誤り**で、区分が
 *    分からないだけで自営業の正当な拠出を削ることになる (パス 209 の教訓)。
 * 2. **関門** —— `guardAll` の欄に `max` を宣言し、⛔ を `GuardSummary` に出す。
 *    区分を選べばその区分の上限に切り替わる (`inputIssues` の deps に区分を入れた)。
 *
 * 小規模企業共済は `clampSmallBizMutualAid` が最初から 84 万で倒していたので
 * 計算の欠陥は無い。**関門だけが無かった** ので `max` を足した。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { IDECO_ANNUAL_CAPS, IDECO_ANNUAL_CAP_MAX } from '../../../shared/taxDeductions';
import { maxEmployeeSocialInsurance } from '../../../shared/taxSocialInsurance';

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
  const def = SERVICES.find((s) => s.id === 'tax');
  if (!def) throw new Error('tax service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/**
 * **真偽だけを返す**。`expect(text()).toContain(…)` は落ちたときに画面ぜんぶを
 * 刷るので (この画面は 3 万字を超える)、含むかどうかだけを見る (パス 214)。
 */
const says = (needle: string): boolean => text().includes(needle);

function setNative(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

/**
 * ③ の 14 欄は `aria-label` を持たず、`<label>` の本文でしか呼べない
 * (パス 216 の「関門つきでない欄」の一族)。**部分一致ではなく先頭一致**で引く ——
 * 「iDeCo 拠出 (年)」と「iDeCo 職業区分 (拠出上限)」を取り違えないため。
 */
async function typeLabelled(labelPrefix: string, value: string): Promise<HTMLInputElement> {
  const hit = Array.from(container.querySelectorAll('label')).find((l) => {
    const own = Array.from(l.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent ?? '').trim())
      .join('');
    return own.startsWith(labelPrefix) && l.querySelector('input[type="text"]') !== null;
  });
  const input = hit?.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) throw new Error(`field not found: ${labelPrefix}`);
  await act(async () => {
    setNative(input, value);
  });
  await settle();
  return input;
}

async function pickOccupation(value: string): Promise<void> {
  const sel = Array.from(container.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'self-employed'));
  if (!sel) throw new Error('iDeCo 職業区分 の選択が見つからない');
  await act(async () => {
    setNative(sel, value);
  });
  await settle();
}

/**
 * タイル (`Stat`) を「ラベル → 値」で読む。`Stat` は印を持たないので、
 * `guardedJudgements.test.ts` の走査と同じ**形**で拾う ——
 * 「葉の要素の子がちょうど 2 つ・1 つ目が語・2 つ目が数字を含む」。
 */
function preciseTiles(): Map<string, string> {
  const m = new Map<string, string>();
  for (const el of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(el.children);
    const [head, tail] = kids;
    if (kids.length !== 2 || head === undefined || tail === undefined) continue;
    if (head.children.length > 0 || tail.children.length > 0) continue;
    const label = (head.textContent ?? '').replace(/\s+/g, ' ').trim();
    const value = (tail.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (label === '' || value === '') continue;
    m.set(label, value);
  }
  return m;
}

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

describe('iDeCo 拠出の法定上限 (パス 217)', () => {
  it('★ 対照: 既定値では所得税・住民税に金額が出て、⛔ は出ない', async () => {
    await mountPage();
    const t = preciseTiles();
    expect(t.get('所得税 (税額控除後)')).toBe('¥147,535');
    expect(t.get('住民税 (税額控除後)')).toBe('¥305,500');
    expect(container.querySelector('[data-guard-summary]')).toBeNull();
  });

  it('★ 巨大な拠出でも所得税が ¥0 にならない (上限 81.6 万で倒す)', async () => {
    await mountPage();
    await typeLabelled('iDeCo 拠出 (年)', '9999999999');
    const t = preciseTiles();
    // **直す前はここが ¥0 / ¥5,000 だった。**
    expect(t.get('所得税 (税額控除後)')).not.toBe('¥0');
    expect(t.get('住民税 (税額控除後)')).not.toBe('¥5,000');
    // 内訳の「共済+iDeCo」が上限で止まっている (9,999,999,999 が刷られていない)。
    expect(says(`共済+iDeCo ¥${IDECO_ANNUAL_CAP_MAX.toLocaleString('en-US')}`)).toBe(true);
    expect(says('9,999,999,999')).toBe(false);
  });

  it('★ 上限超過は ⛔ として名指しされ、上限の額を述べる', async () => {
    await mountPage();
    await typeLabelled('iDeCo 拠出 (年)', '9999999999');
    const summary = container.querySelector('[data-guard-summary]');
    expect(summary).not.toBeNull();
    expect(summary?.getAttribute('data-fatal')).toBe('1');
    expect(says('「iDeCo 掛金 (円)」816000 円 以下で入力してください')).toBe(true);
  });

  it('★ 区分を選ぶと、関門の上限がその区分の上限に切り替わる', async () => {
    await mountPage();
    // 公務員 (14.4 万) の上限を 1 円超える額。未選択 (81.6 万) なら通る額。
    await typeLabelled('iDeCo 拠出 (年)', String(IDECO_ANNUAL_CAPS['civil-servant'] + 1));
    expect(container.querySelector('[data-guard-summary]')).toBeNull();
    await pickOccupation('civil-servant');
    // **deps に区分が入っていなければ、ここで ⛔ が出ない** (関門が古い上限のまま)。
    expect(says('「iDeCo 掛金 (円)」144000 円 以下で入力してください')).toBe(true);
    // 計算も区分の上限で倒れる。
    expect(says(`共済+iDeCo ¥${IDECO_ANNUAL_CAPS['civil-servant'].toLocaleString('en-US')}`)).toBe(true);
  });

  it('★ 「上限なし」という断りが画面に残っていない', async () => {
    await mountPage();
    // **標本つきの対照** —— 選択肢の文面そのものが在ることを先に確かめる
    // (綴りが変われば黙る検査にしないため)。
    expect(says('未指定 (上限 ¥816,000 で試算)')).toBe(true);
    expect(says('未指定 (上限なし)')).toBe(false);
  });

  it('★ 小規模企業共済も上限超過を ⛔ で名指しする (計算は元から 84 万で倒れていた)', async () => {
    await mountPage();
    await typeLabelled('小規模企業共済 (年・上限', '9999999999');
    expect(says('「小規模企業共済 (円)」840000 円 以下で入力してください')).toBe(true);
    expect(says('9,999,999,999')).toBe(false);
  });
});

describe('社会保険料の桁の目安 (パス 218)', () => {
  it('★ 対照: 既定の ¥900,000 では ⚠️ も ⛔ も出ない', async () => {
    await mountPage();
    // 既定の 額面年収 は 6,000,000 円・支払社会保険料 は 900,000 円。
    expect(container.querySelector('[data-guard-summary]')).toBeNull();
  });

  it('★ 100 億円は ⚠️ で名指しされ、控除合計にも入らない…わけではないので警告で伝える', async () => {
    await mountPage();
    await typeLabelled('支払社会保険料 (実額/年)', '9999999999');
    const summary = container.querySelector('[data-guard-summary]');
    expect(summary).not.toBeNull();
    // **法定上限が無いので ⛔ ではなく ⚠️。** fatal は 0 件・warn が 1 件。
    expect(summary?.getAttribute('data-fatal')).toBe('0');
    expect(summary?.getAttribute('data-warn')).toBe('1');
    expect(says('「社会保険料 (円)」9,999,999,999 円 は想定の範囲を超えています')).toBe(true);
    // 計算は法定どおり実額を引くので、控除合計はその額になる。**画面はそれを隠さず、
    // 桁を確かめるよう促す** (断ると「払った額を引けない」という別の嘘になる)。
    expect(says('所得控除合計')).toBe(true);
  });

  it('★ 目安は「申告した給与収入」と「被用者としての法定最大額」の緩い方', async () => {
    await mountPage();
    const max = maxEmployeeSocialInsurance();
    // 給与収入 6,000,000 > 法定最大額 (約 366 万) なので、境界は給与収入の側。
    expect(max).toBeLessThan(6_000_000);
    await typeLabelled('支払社会保険料 (実額/年)', '6000000');
    expect(container.querySelector('[data-guard-summary]')).toBeNull(); // 境界そのものは通す
    await typeLabelled('支払社会保険料 (実額/年)', '6000001');
    expect(says('「社会保険料 (円)」')).toBe(true);
  });

  it('★ 給与収入を下げると、境界は法定最大額の側に切り替わる', async () => {
    await mountPage();
    const max = maxEmployeeSocialInsurance();
    await typeLabelled('額面年収 (円)', '1000000');
    // 給与収入 100 万 < 法定最大額 なので、100 万を超えても警告しない
    // (事業所得から国民年金を払う人が居るため断らない)。
    await typeLabelled('支払社会保険料 (実額/年)', String(max));
    expect(says('「社会保険料 (円)」')).toBe(false);
    await typeLabelled('支払社会保険料 (実額/年)', String(max + 1));
    expect(says('「社会保険料 (円)」')).toBe(true);
  });
});
