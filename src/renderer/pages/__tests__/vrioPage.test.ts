// @vitest-environment jsdom
/**
 * VRIO 分析の画面 —— 値を変えると、その場で判定が変わる。
 *
 * 算定の正しさは `shared/__tests__/vrio.test.ts` が持つ。ここが見るのは**配線**である:
 * 画面の選択肢が `shared/vrio.ts` の判定に届き、結果が画面に出ること。
 *
 * 画面は保存も取得もしない (状態は部品の中だけ) ので、橋 (`window.serviceHub`) は置かない ——
 * 置かなくても描けること自体が「取得に依らない」ことの対照になる。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VrioPage } from '../VrioPage';
import { settleUntil } from '../../__tests__/jsdomWait';
import { VRIO_VERDICTS } from '../../../shared/vrio';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(VrioPage));
  });
  await settleUntil(() => container.querySelector('[data-vrio-page]') !== null, 'VRIO の画面が出る');
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

function select(label: string): HTMLSelectElement {
  const el = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!el) throw new Error(`選択欄「${label}」が無い`);
  return el;
}

async function choose(label: string, value: string): Promise<void> {
  const el = select(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const textOf = (selector: string): string => container.querySelector(selector)?.textContent ?? '';
const verdictId = (): string | null => container.querySelector('[data-vrio-verdict]')?.getAttribute('data-vrio-verdict') ?? null;

describe('VRIO 分析の画面: 開いた直後', () => {
  it('★ 記入例 (一般職・営業職 / V4 R3 I3 O2) の総合スコア 3.35 と、標準との差を出す', () => {
    expect(textOf('[data-vrio-employee-result]')).toContain('3.35');
    expect(textOf('[data-vrio-employee-result]')).toContain('標準 (3.00) より +0.35');
    expect(textOf('[data-vrio-rows]')).toContain('V 経済的価値: 4 点 × 50% = 2.00');
    expect(textOf('[data-vrio-rows]')).toContain('O 組織体制: 2 点 × 15% = 0.30');
  });

  it('記入例の札を 2 つの節の両方に出す (自分の入力と取り違えない)', () => {
    expect(textOf('[data-vrio-example="employee"]')).toContain('記入例');
    expect(textOf('[data-vrio-example="product"]')).toContain('記入例');
  });

  it('入力は選択欄だけで、名前を書く欄も保存・送信の操作子も無い', () => {
    expect(container.querySelectorAll('select')).toHaveLength(10);
    expect(container.querySelectorAll('input, textarea, button')).toHaveLength(0);
    expect(container.textContent).toContain('保存も送信もしません');
  });

  it('記入例の商品企画 (I だけ No) は「一時的競争優位」', () => {
    expect(verdictId()).toBe('temporary');
    expect(textOf('[data-vrio-verdict]')).toContain(VRIO_VERDICTS.temporary.title);
    expect(textOf('[data-vrio-note]')).toContain('今回は 3 問目まで使いました');
  });
});

describe('VRIO 分析の画面: 従業員の評価', () => {
  it('★ 点数を変えると総合スコアと内訳が変わり、記入例の札が消える (商品の側の札は残る)', async () => {
    await choose('V 経済的価値 の点数', '5');
    await settleUntil(() => textOf('[data-vrio-employee-result]').includes('3.85'), '総合スコアが 3.85 になる');
    expect(textOf('[data-vrio-rows]')).toContain('V 経済的価値: 5 点 × 50% = 2.50');
    expect(container.querySelector('[data-vrio-example="employee"]')).toBeNull();
    expect(container.querySelector('[data-vrio-example="product"]')).not.toBeNull();
  });

  it('★ 階層を変えるとウェイトが変わり、同じ点数でも総合スコアが変わる', async () => {
    await choose('階層', 'executive');
    // 役員: 4×0.20 + 3×0.20 + 3×0.30 + 2×0.30 = 2.90
    await settleUntil(() => textOf('[data-vrio-employee-result]').includes('2.90'), '総合スコアが 2.90 になる');
    expect(textOf('[data-vrio-employee-result]')).toContain('標準 (3.00) より −0.10');
    expect(textOf('[data-vrio-score="O"]')).toContain('ウェイト 30%');
  });

  it('★ 昇格の推奨ゲート: 一般職は V、リーダー職は O、管理職は設定なし', async () => {
    expect(textOf('[data-vrio-gate]')).toContain('リーダー職への昇格: 推奨ゲートを満たす');
    await choose('V 経済的価値 の点数', '3');
    await settleUntil(() => textOf('[data-vrio-gate]').includes('推奨ゲートに未達'), 'V 3 点でゲートに未達になる');
    expect(textOf('[data-vrio-gate]')).toContain('V が 4 点以上で満たします (今は 3 点)。');

    await choose('階層', 'lead');
    await settleUntil(() => textOf('[data-vrio-gate]').includes('管理職への昇格'), 'リーダー職のゲートが出る');
    expect(textOf('[data-vrio-gate]')).toContain('O が 4 点以上で満たします (今は 2 点)。');
    await choose('O 組織体制 の点数', '4');
    await settleUntil(() => textOf('[data-vrio-gate]').includes('推奨ゲートを満たす'), 'O 4 点でゲートを満たす');

    await choose('階層', 'manager');
    await settleUntil(() => textOf('[data-vrio-gate]').includes('昇格ゲートの設定なし'), '管理職はゲートなし');
  });

  it('職種を変えると、見る点と育成の一手がその職種の文になる', async () => {
    expect(textOf('[data-vrio-score="V"]')).toContain('目標達成・継続率');
    await choose('職種', 'tech');
    await settleUntil(() => textOf('[data-vrio-organization]').includes('社内勉強会を開き'), '技術職の育成の一手が出る');
    expect(textOf('[data-vrio-score="V"]')).not.toContain('目標達成・継続率');
  });

  it('強みと補う要素: 記入例は V が強み・O が補う要素。全部 4 点以上なら補う要素は無い', async () => {
    expect(textOf('[data-vrio-strengths]')).toContain('V 経済的価値 (4 点)');
    expect(textOf('[data-vrio-focus]')).toContain('O 組織体制 (2 点)');
    for (const label of ['R 希少性 の点数', 'I 模倣困難性 の点数', 'O 組織体制 の点数']) await choose(label, '4');
    await settleUntil(() => textOf('[data-vrio-focus]').includes('すべて 4 点以上です'), '補う要素が無くなる');
    expect(textOf('[data-vrio-organization]')).toContain('ほかのメンバーへ広げてください');
  });
});

describe('VRIO 分析の画面: 商品企画の判定', () => {
  it('★ 5 つの判定すべてに届く (答えを変えるたびに判定と見出しが変わる)', async () => {
    const set = async (v: string, r: string, i: string, o: string): Promise<void> => {
      await choose('V 経済的価値 の答え', v);
      await choose('R 希少性 の答え', r);
      await choose('I 模倣困難性 の答え', i);
      await choose('O 組織体制 の答え', o);
    };
    await set('yes', 'yes', 'yes', 'yes');
    await settleUntil(() => verdictId() === 'sustained', '全部 Yes で持続的競争優位');
    expect(textOf('[data-vrio-verdict]')).toContain(VRIO_VERDICTS.sustained.title);

    await set('yes', 'yes', 'yes', 'no');
    await settleUntil(() => verdictId() === 'latent', 'O が No で潜在的競争優位');
    expect(textOf('[data-vrio-verdict]')).toContain('宝の持ち腐れ');

    await set('yes', 'yes', 'no', 'yes');
    await settleUntil(() => verdictId() === 'temporary', 'I が No で一時的競争優位');

    await set('yes', 'no', 'yes', 'yes');
    await settleUntil(() => verdictId() === 'parity', 'R が No で競争均衡');
    expect(textOf('[data-vrio-note]')).toContain('元の判定ロジックに書かれていない組み合わせです');

    await set('no', 'yes', 'yes', 'yes');
    await settleUntil(() => verdictId() === 'stop', 'V が No で中止');
    expect(textOf('[data-vrio-verdict]')).toContain('中止、またはピボット');
    expect(textOf('[data-vrio-note]')).toContain('今回は 1 問目まで使いました');
  });

  it('判定だけで終わらない: 次の一手と「人材育成と仕組み化」を必ず並べる', async () => {
    expect(container.querySelectorAll('[data-vrio-next] li').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('[data-vrio-people] li').length).toBeGreaterThanOrEqual(2);
    await choose('V 経済的価値 の答え', 'no');
    await settleUntil(() => verdictId() === 'stop', 'V が No で中止');
    expect(container.querySelectorAll('[data-vrio-next] li')).toHaveLength(VRIO_VERDICTS.stop.next.length);
    expect(container.querySelectorAll('[data-vrio-people] li')).toHaveLength(VRIO_VERDICTS.stop.people.length);
    expect(container.querySelector('[data-vrio-example="product"]')).toBeNull();
    expect(container.querySelector('[data-vrio-example="employee"]')).not.toBeNull();
  });
});
