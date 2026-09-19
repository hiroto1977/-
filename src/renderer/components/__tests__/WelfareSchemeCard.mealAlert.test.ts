/** @vitest-environment jsdom */
/**
 * **食事補助の非課税要件を、画面が機械で判定して断る** (パス 219)。
 *
 * `MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN` (7,500) と `MEAL_SUBSIDY_SELF_PAY_RATIO` (0.5) は
 * 2026-08-21 に出典つきで定数へ寄せられたが、**読んでいたのは規程ひな形と
 * この画面の免責文 (散文) だけ**だった —— 後者には消費者が 1 つも無かった。
 * `designWelfareScheme` は会社負担の全額を非課税の現物支給として扱うので、
 * **要件を外れた設計でも「非課税で税と社保が下がる」と表示できた**。
 *
 * 実測 (直す前・食事 総額 20,000 円 / 会社負担 9,999,999,999 円):
 * `従業員の実質手元残り 200,000 → 10,000,269,999`、断りは **0 件**。
 * 免責文は「各非課税要件…の充足は税理士・社労士にご確認ください」と述べていた ——
 * **機械で判定できることを人に投げていた** (パス 10 / 11 と同じ形)。
 *
 * ここで見るのは「判定が画面に落ちるところ」だけ。判定そのものは
 * `shared/__tests__/welfareScheme.test.ts` の `mealSubsidyVerdict` が持つ。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WelfareSchemeCard } from '../WelfareSchemeCard';
import { MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN } from '../../../shared/welfareScheme';

beforeAll(() => {
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    openExternal: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(WelfareSchemeCard));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
/** 落ちたときに画面ぜんぶを刷らせないため、真偽だけを返す (パス 214 / 217)。 */
const says = (needle: string): boolean => text().includes(needle);

/** この画面の欄は `<label><span>ラベル</span><input/></label>` で、aria-label を持たない。 */
async function typeField(label: string, value: string): Promise<void> {
  const hit = Array.from(container.querySelectorAll('label')).find(
    (l) => (l.querySelector('span')?.textContent ?? '').trim() === label,
  );
  const input = hit?.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) throw new Error(`field not found: ${label}`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

const alertEl = (): Element | null => container.querySelector('[data-meal-subsidy-alert]');

/**
 * 比較表の 1 行を `[ラベル, これまで, 新制度]` で読む (パス 228)。
 *
 * **対照が鳴らなかったので足した検査。** 「給与課税される現物給与」の行を画面へ
 * 足したあと、その行を消す対照を回したら**何も落ちなかった** ——
 * 配線しただけで留めていなかった。**鳴らない対照は「合格」ではなく、
 * その検査についての報せである。**
 */
function tableRow(label: string): readonly string[] {
  const tr = Array.from(container.querySelectorAll('tbody tr')).find(
    (row) => (row.querySelector('td')?.textContent ?? '').trim() === label,
  );
  if (!tr) throw new Error(`row not found: ${label}`);
  return Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
}

/**
 * **断りの中だけを読む。** 画面の下の免責文も「会社負担が月 7,500円以下」と
 * 同じ語を持つので、`says()` (画面ぜんぶ) で「出ていない」を主張すると
 * **免責文に当たって必ず true になる** —— 最初にこれで 1 本落ちた。
 * 不在を主張するときは、主張する範囲もいっしょに決める。
 */
const alertSays = (needle: string): boolean =>
  ((alertEl()?.textContent ?? '').replace(/\s+/g, ' ')).includes(needle);

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

describe('食事補助の非課税要件の断り (パス 219)', () => {
  it('★ 対照: 既定値 (食事 20,000 / 会社負担 7,000) では断りが出ない', async () => {
    await mount();
    // **標本つきの対照** —— まず画面が本当に描けていることを確かめる
    // (綴りが変われば黙る検査にしないため)。
    expect(says('給与デザイン')).toBe(true);
    expect(says('従業員の実質手元残り')).toBe(true);
    expect(alertEl()).toBeNull();
    // **行は 0 のときも出す** (パス 228) —— 「¥0」は「要件を満たしている」という
    // 情報で、行が消えると読み手は「0 なのか、そもそも見ていないのか」を区別できない。
    expect(tableRow('給与課税される現物給与')).toEqual(['給与課税される現物給与', '¥0', '¥0']);
  });

  it('★ 会社負担が限度額を超えると ⛔ で断り、限度額を述べる', async () => {
    await mount();
    // 本人負担の割合は保ったまま (食事 40,000)、会社負担だけを限度額超えに。
    await typeField('食事 総額', '40000');
    await typeField('┗ 会社負担(食事補助)', String(MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN + 1));
    expect(alertEl()).not.toBeNull();
    expect(alertEl()?.getAttribute('role')).toBe('alert');
    expect(alertSays('非課税の要件を満たしていません')).toBe(true);
    expect(alertSays('会社負担が月')).toBe(true);
    expect(alertSays('7,500 円を超えています')).toBe(true);
    // **断りと数字が一致している** (パス 228)。パス 219 ではここが
    // `alertSays('給与として課税されます')` で、断りは「本来課税される」と述べつつ
    // 下表は非課税として計算していた —— つまり**断りが「表は間違っている」と
    // 認めるだけ**だった。今は計算に入っているので、断りはそう述べる。
    expect(alertSays('給与課税として下表の計算に入れています')).toBe(true);
    expect(alertSays('現物支給の福利厚生価値 (非課税)」からは外しています')).toBe(true);
    // 課税に回した額を数字で名指しする (⛔ の欄の値と同じ出所)。
    expect(alertEl()?.querySelector('[data-meal-taxable-yen]')?.getAttribute('data-meal-taxable-yen'))
      .toBe(String(MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN + 1));
    // **表の行にも出る** —— 断りだけでなく、比較表の中で金額が動いたことが見える。
    expect(tableRow('給与課税される現物給与')).toEqual([
      '給与課税される現物給与', '¥0', `¥${(MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN + 1).toLocaleString('ja-JP')}`,
    ]);
    // 非課税の側からは外れている (同じ表の隣の行で対照が取れる)。
    expect(tableRow('現物支給の福利厚生価値 (非課税)')[2]).not.toContain(
      `¥${(MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN + 1).toLocaleString('ja-JP')}`,
    );
  });

  it('★ 本人負担が半額を下回ると、そちらの要件を名指しする', async () => {
    await mount();
    // 食事 10,000 / 会社負担 7,500 (限度額の内側) → 本人 25%
    await typeField('食事 総額', '10000');
    await typeField('┗ 会社負担(食事補助)', String(MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN));
    expect(alertEl()).not.toBeNull();
    expect(alertSays('本人負担が食事の価額の 50% 未満です')).toBe(true);
    // こちらの要件だけが外れているので、断りの中に限度額の理由は出ない
    // (画面の下の免責文には出るので、範囲を断りに限る)。
    expect(alertSays('会社負担が月')).toBe(false);
  });

  it('★ 実測の組 (会社負担 100 億) では理由が 2 つ並ぶ', async () => {
    await mount();
    await typeField('┗ 会社負担(食事補助)', '9999999999');
    expect(alertEl()).not.toBeNull();
    expect(alertSays('本人負担が食事の価額の')).toBe(true);
    expect(alertSays('会社負担が月')).toBe(true);
  });

  it('★ 冒頭の説明が「いずれも非課税」と無条件に言い切っていない', async () => {
    await mount();
    // 直す前の文面は「（いずれも非課税の現物/役務支給）」だった。
    expect(says('いずれも非課税の現物/役務支給')).toBe(false);
    expect(says('非課税の要件を満たす限りにおいて')).toBe(true);
  });
});
