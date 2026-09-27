/** @vitest-environment jsdom */
/**
 * **給与デザインの欄は、読めない入力を黙って 0 にしない** (2026-09-27 · パス 493k)。
 *
 * ## 見つけた物 (実測・直す前)
 *
 * 福利厚生カードの 11 の数の欄は局所の `num(raw, 0)` で読み、**読めない値・負の値を
 * 黙って 0 にしていた**。この節は 1 文もそれを言わなかった —— 同じ税金ページの
 * 所得控除の節は 2026-08 から ⛔ / ⚠ で言う (`GuardSummary`)。
 *
 * そして扶養親族の人数は**天井なしで `Array(人数)` を作っていた**:
 *
 * | 一般扶養親族の欄 | 直す前 |
 * | --- | --- |
 * | `100000000` (1 億) | 1 回の描画が **28 秒・4,089 MB** (1 文字打つたびに走る) |
 * | `5000000000` (50 億) | `RangeError: Invalid array length` —— **税金ページごと落ちる** |
 *
 * 税金ページの同じ欄は 20 で止めていたが、その数は画面の中の字面だった。
 * 人数の並びは `dependentsFromCounts` (shared) の 1 つで作り、天井は
 * `MAX_DEPENDENTS_PER_KIND` 1 つ、関門は `dependentCountSpec` 1 つを両画面が読む。
 *
 * ★ **検査の標本は 50 億を使う** —— 1 億だと、直す前の形へ戻す対照が 4 GB を確保して
 * 検査のプロセスごと落ちうる。50 億は配列の長さの上限 (2^32 − 1) を超えるので、
 * 直す前の形では**すぐに** `RangeError` になる (決定的で速い対照)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WelfareSchemeCard } from '../WelfareSchemeCard';
import { MAX_DEPENDENTS_PER_KIND } from '../../../shared/taxDeductions';
import { guardNumber } from '../../data/inputGuards';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';

beforeAll(() => {
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    openExternal: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
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

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const summaryEl = (): Element | null => container.querySelector('[data-guard-summary]');
/** 確認欄の中だけを読む (画面の他の文が同じ語を持っても当たらないように)。 */
const summaryText = (): string => (summaryEl()?.textContent ?? '').replace(/\s+/g, ' ');

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(WelfareSchemeCard));
  });
  await waitForText(text, '従業員の実質手元残り');
}

/** 欄は aria-label を持つ (字下げの「┗ 」も含めた画面の札そのもの)。 */
async function typeField(ariaLabel: string, value: string): Promise<void> {
  const input = await waitForElement(
    () => container.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`),
    `欄「${ariaLabel}」`,
  );
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function check(ariaLabel: string): Promise<void> {
  const box = await waitForElement(
    () => container.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${ariaLabel}"]`),
    `チェック「${ariaLabel}」`,
  );
  await act(async () => {
    box.click();
  });
}

describe('給与デザイン — 読めない入力と扶養人数の天井 (パス 493k)', () => {
  it('★ 対照: 既定値では確認欄が出ない (画面は描けている)', async () => {
    await mount();
    expect(text()).toContain('給与デザイン');
    expect(summaryEl()).toBeNull();
  });

  it('★ 扶養親族 50 億人でも落ちず、⛔ で断り、控除は天井 (20 人) で数える', async () => {
    await mount();
    await typeField('一般扶養親族の人数', '5000000000');
    await waitForText(summaryText, `「一般扶養親族の人数」${MAX_DEPENDENTS_PER_KIND} 人 以下で入力してください（現在 5000000000）。`);
    expect(summaryEl()?.getAttribute('data-fatal')).toBe('1');
    // 単位は「人」—— `count` (件) を借りない。標本が的に当たる: 借りた形はこの文を出す
    expect(summaryText()).not.toContain('件 以下で入力してください');
    expect(guardNumber('5000000000', { label: 'X', kind: 'count', max: MAX_DEPENDENTS_PER_KIND })?.message).toContain(
      '件 以下で入力してください',
    );
    // 控除は天井の 20 人ぶん (税金ページの同じ欄と同じ答え)
    await waitForText(text, `扶養控除 所得税 ¥${(MAX_DEPENDENTS_PER_KIND * 380_000).toLocaleString('ja-JP')}`);
    expect(text()).toContain(`住民税 ¥${(MAX_DEPENDENTS_PER_KIND * 330_000).toLocaleString('ja-JP')}`);
  });

  it('★ 読めない金額 / マイナスは ⛔、目標の空欄は ⚠ で言う (他の欄の空欄は「使わない」で正当)', async () => {
    await mount();
    await typeField('家賃 総額', 'abc');
    await waitForText(summaryText, '「家賃 総額」「abc」を数値として読み取れません。0 円 として計算されています。');
    await typeField('食事 総額', '-5000');
    await waitForText(summaryText, '「食事 総額」マイナスの値（-5000）は指定できません。');
    await typeField('目標の手元残り', '');
    await waitForText(summaryText, '「目標の手元残り」未入力です。0 円 として計算されています。');
    // 字下げの「┗ 」は札から外す (画面の欄の名前と同じ字で言う)。標本が的に当たる:
    // 欄の札そのものは「┗ 」で始まる (外さなければ確認欄にそのまま出る)
    expect(container.querySelector('input[aria-label="┗ 会社負担(社宅)"]')).not.toBeNull();
    await typeField('┗ 会社負担(社宅)', 'x');
    await waitForText(summaryText, '「会社負担(社宅)」「x」を数値として読み取れません。');
    expect(summaryText()).not.toContain('「┗ ');
    // 任意の欄: 読めない字は言い、空欄 (= その制度を使わない) は言わない
    await typeField('EC ポイント(カフェテリア)', 'abc');
    await waitForText(summaryText, '「EC ポイント(カフェテリア)」');
    await typeField('EC ポイント(カフェテリア)', '');
    await settleUntil(() => !summaryText().includes('EC ポイント'), 'EC ポイントの空欄が確認欄から消える');
    expect(summaryEl()).not.toBeNull(); // 他の欄の断りは残っている
  });

  it('★ 配偶者の合計所得は type="text" —— 「100万」を打っても欄が空のまま黙らない', async () => {
    await mount();
    await check('配偶者の有無');
    const field = await waitForElement(
      () => container.querySelector<HTMLInputElement>('input[aria-label="配偶者の合計所得金額"]'),
      '配偶者の合計所得の欄',
    );
    // type="number" の欄は数でない字を値に持てない (jsdom も同じく空にする) —— 直す前はここで黙った
    expect(field.type).toBe('text');
    await typeField('配偶者の合計所得金額', 'abc');
    await waitForText(summaryText, '「配偶者の合計所得」「abc」を数値として読み取れません。');
    // 標本が的に当たる: type="number" の欄に同じ字を入れると値は空になる (この検査が空でない)
    const numberField = document.createElement('input');
    numberField.type = 'number';
    numberField.value = 'abc';
    expect(numberField.value).toBe('');
  });

  it('対照: 配偶者を選ばないあいだは、配偶者の欄を確認しない (外すと断りも消える)', async () => {
    await mount();
    expect(container.querySelector('input[aria-label="配偶者の合計所得金額"]')).toBeNull();
    await typeField('家賃 総額', 'abc');
    await waitForText(summaryText, '「家賃 総額」');
    expect(summaryText()).not.toContain('配偶者');
    // 標本が的に当たる: 選んで読めない字を入れると「配偶者」が確認欄に出る
    await check('配偶者の有無');
    await typeField('配偶者の合計所得金額', 'abc');
    await waitForText(summaryText, '「配偶者の合計所得」');
    // 選択を外すと、計算に入らない欄の断りは消える (家賃の断りは残る)
    await check('配偶者の有無');
    await settleUntil(() => !summaryText().includes('配偶者'), '配偶者の断りが消える');
    expect(summaryText()).toContain('「家賃 総額」');
  });
});
