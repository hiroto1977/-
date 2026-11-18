/** @vitest-environment jsdom */
/**
 * 補助金・助成金の申請書類の下書きの欄 —— 実物を描いて、実際に打つ (2026-11-18)。
 *
 * 判定と文面は `data/__tests__/fundingApplication.test.ts` が値ごと留めている。ここが見るのは画面の約束:
 *
 * - 所定の様式ではないこと・保存も送信もしないことを、入力の前に述べる
 * - 空欄は断らず、下書きに「（未記入）」と書いて件数を述べる
 * - 読めない数・範囲の外の数・長すぎる文が在る間は、下書きを出さず、保存もコピーもできない (直す欄を名指しする)
 * - 画面に出ていない欄 (個人事業主の資本金・助成金の補助率) は、下書きを止めない
 * - 「Markdown で保存」で落ちる中身は、画面の下書きと同じ物・名前に利用者の入力は入らない
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FundingApplicationDraft } from '../FundingApplicationDraft';
import { DRAFT_CAUTIONS, GRANT_AMOUNT_NOTE, draftWithheldNote } from '../../data/fundingApplication';
import { VERIFIED_SUBSIDIES } from '../../data/subsidyKnowledge';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    openExternal: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;
/** ダウンロードされた中身と名前。 */
let downloads: Array<{ body: string; name: string }>;
let clipboardWrites: string[];
let clipboardFails: boolean;
let savedUrlStatics: { create: unknown; revoke: unknown } = { create: undefined, revoke: undefined };

beforeEach(async () => {
  downloads = [];
  clipboardWrites = [];
  clipboardFails = false;
  let lastBody = '';
  // `URL` そのものは差し替えない (差し替えると `new URL(…)` が使えなくなり、リンクの関門ごと壊れる)。
  // jsdom が持たない 2 つの口だけを、この検査の間だけ置く。
  const urlStatics = URL as unknown as {
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (url: string) => void;
  };
  savedUrlStatics = { create: urlStatics.createObjectURL, revoke: urlStatics.revokeObjectURL };
  urlStatics.createObjectURL = (blob: Blob) => {
    lastBody = (blob as unknown as { __parts?: string[] }).__parts?.join('') ?? '';
    return 'blob:stub';
  };
  urlStatics.revokeObjectURL = () => {};
  const RealBlob = globalThis.Blob;
  class RecordingBlob extends RealBlob {
    readonly __parts: string[];
    constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
      super(parts, options);
      this.__parts = parts.map((p) => String(p));
    }
  }
  vi.stubGlobal('Blob', RecordingBlob);
  vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ body: lastBody, name: this.download });
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (value: string) => {
        if (clipboardFails) return Promise.reject(new Error('denied'));
        clipboardWrites.push(value);
        return Promise.resolve();
      },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(FundingApplicationDraft));
  });
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
  const urlStatics = URL as unknown as Record<string, unknown>;
  urlStatics.createObjectURL = savedUrlStatics.create;
  urlStatics.revokeObjectURL = savedUrlStatics.revoke;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const q = <T extends Element>(selector: string): T | null => container.querySelector<T>(selector);
const need = <T extends Element>(selector: string): T => {
  const el = q<T>(selector);
  if (el === null) throw new Error(`要素が無い: ${selector}`);
  return el;
};
const draftText = (): string => (q('[data-application-draft]')?.textContent ?? '').replace(/\s+/g, ' ');
const withheld = (): string | null => q('[data-application-withheld]')?.textContent ?? null;
const saveButton = (): HTMLButtonElement => need<HTMLButtonElement>('[data-save-application]');
const copyButton = (): HTMLButtonElement => need<HTMLButtonElement>('[data-copy-application]');

async function type(label: string, value: string): Promise<void> {
  const el = need<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function choose(label: string, value: string): Promise<void> {
  const el = need<HTMLSelectElement>(`select[aria-label="${label}"]`);
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const BUSINESS = VERIFIED_SUBSIDIES.find((p) => p.domain === 'business')!;
const EMPLOYMENT = VERIFIED_SUBSIDIES.find((p) => p.domain === 'employment')!;

describe('申請書類の下書きの欄 — 入力の前に述べること', () => {
  it('所定の様式ではない・保証しないと述べる', () => {
    const text = need('[data-funding-application]').textContent ?? '';
    expect(text).toContain('制度ごとの所定の様式ではありません');
    expect(text).toContain('採択や支給を保証するものでもありません');
  });

  it('保存も送信もしない・画面を離れると消えると述べる', () => {
    const note = need('[data-application-privacy]').textContent ?? '';
    expect(note).toContain('保存されず、端末の外へも送りません');
    expect(note).toContain('この画面を離れると消える');
  });

  it('制度の一覧は、事業向けと雇用向けの確証済みの制度を全部並べる (福祉の給付・税の特例は並べない)', () => {
    const options = [...need<HTMLSelectElement>('select[aria-label="制度"]').querySelectorAll('option')].map((o) => o.value);
    const expected = VERIFIED_SUBSIDIES.filter((p) => p.domain === 'business' || p.domain === 'employment').map((p) => p.id);
    expect(expected.length).toBeGreaterThan(100);
    expect(options.slice(2).sort()).toEqual([...expected].sort());
    expect(options.slice(0, 2)).toEqual(['', '__custom__']);
    const welfare = VERIFIED_SUBSIDIES.find((p) => p.domain === 'welfare')!;
    expect(options).not.toContain(welfare.id);
  });

  it('業種は 20 の大分類から選ぶ', () => {
    const options = [...need<HTMLSelectElement>('select[aria-label="業種"]').querySelectorAll('option')];
    expect(options.length).toBe(21);
    expect(options[5]?.textContent).toBe('製造業');
  });
});

describe('申請書類の下書きの欄 — 空欄は断らない', () => {
  it('何も入れていなくても下書きは出る (未記入と書き、件数を述べる)', () => {
    expect(withheld()).toBeNull();
    expect(draftText()).toContain('【下書き】補助金・助成金 申請書類');
    expect(draftText()).toContain('事業者名: （未記入）');
    // 個人事業主・補助金: 資本金を除く 15 項目。
    const missing = need('[data-application-missing]').textContent ?? '';
    expect(missing).toContain('未記入の項目が 15 件あります');
    expect(missing).toContain('申請する制度');
    expect(missing).not.toContain('資本金');
    expect(saveButton().disabled).toBe(false);
    expect(copyButton().disabled).toBe(false);
  });

  it('下書きの先頭に断りを 2 つ置く', () => {
    const cautions = [...container.querySelectorAll('[data-application-caution]')].map((el) => el.textContent ?? '');
    expect(cautions).toEqual(DRAFT_CAUTIONS.map((c) => `⚠ ${c}`));
  });

  it('入れた内容が下書きに出る (文・数・月・業種の観点)', async () => {
    await type('事業者名', '見本商店');
    await type('所在地', '見本県見本市');
    await choose('業種', 'E');
    await type('創業・設立の年 (西暦)', '2015');
    await type('従業員数', '5');
    await type('直近の年間売上高', '20,000,000');
    await type('計画の名前', '見本の計画');
    await type('現状と課題', '課題の文。\n2 行目。');
    await type('取り組む内容', '取組の文。');
    await type('期待される効果', '効果の文。');
    await type('開始の月', '2026-04');
    await type('完了の月', '2027-03');
    const text = draftText();
    for (const part of [
      '事業者名: 見本商店',
      '所在地: 見本県見本市',
      '業種: 製造業',
      '創業・設立の年 (西暦): 2015年',
      '従業員数: 5 人',
      '直近の年間売上高: 20,000,000 円',
      '計画の名前: 見本の計画',
      '課題の文。 2 行目。',
      '数字で書くとよい観点 (製造業)',
      '取組の文。',
      '効果の文。',
      '開始: 2026年4月',
      '完了: 2027年3月',
    ]) {
      expect(text, part).toContain(part);
    }
  });
});

describe('申請書類の下書きの欄 — 制度と型', () => {
  it('事業向けの制度を選ぶと、所管と出典が出る (出典は関門を通したリンク)', async () => {
    await choose('制度', BUSINESS.id);
    const text = draftText();
    expect(text).toContain(`【下書き】${BUSINESS.name} 申請書類`);
    expect(text).toContain(`所管・実施機関: ${BUSINESS.authority}`);
    const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-application-draft] a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(BUSINESS.sources.map((s) => new URL(s.url).toString()));
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(need<HTMLSelectElement>('select[aria-label="書類の型"]').value).toBe('subsidy');
  });

  it('雇用向けの制度を選ぶと、型は助成金になり、経費の欄は出ない (あとから戻せる)', async () => {
    expect(q('[data-application-expenses]')).not.toBeNull();
    await choose('制度', EMPLOYMENT.id);
    expect(need<HTMLSelectElement>('select[aria-label="書類の型"]').value).toBe('grant');
    expect(q('[data-application-expenses]')).toBeNull();
    expect(draftText()).toContain('7. 支給額について');
    expect(draftText()).toContain(GRANT_AMOUNT_NOTE);
    await choose('書類の型', 'subsidy');
    expect(q('[data-application-expenses]')).not.toBeNull();
    expect(draftText()).toContain('7. 経費の内訳と申請額の目安');
    // 事業向けを選び直すと、型も補助金へ戻る。
    await choose('書類の型', 'grant');
    await choose('制度', BUSINESS.id);
    expect(need<HTMLSelectElement>('select[aria-label="書類の型"]').value).toBe('subsidy');
  });

  it('一覧に無い制度は、名前の欄が出て、入れた名前が題に出る (別の制度へ替えると名前は使わない)', async () => {
    expect(q('[aria-label="制度の名前"]')).toBeNull();
    await choose('制度', '__custom__');
    await type('制度の名前', '自分の制度');
    expect(draftText()).toContain('【下書き】自分の制度 申請書類');
    expect(draftText()).toContain('確証済みの一覧に収録していません');
    await choose('制度', '');
    expect(q('[aria-label="制度の名前"]')).toBeNull();
    expect(draftText()).toContain('【下書き】補助金・助成金 申請書類');
  });

  it('資本金の欄は法人のときだけ出る', async () => {
    expect(q('[aria-label="資本金"]')).toBeNull();
    await choose('事業形態', 'corporation');
    expect(q('[aria-label="資本金"]')).not.toBeNull();
    expect(draftText()).toContain('事業形態: 法人');
    expect(draftText()).toContain('資本金: （未記入）');
    await type('資本金', '3000000');
    expect(draftText()).toContain('資本金: 3,000,000 円');
    await choose('事業形態', 'individual');
    expect(q('[aria-label="資本金"]')).toBeNull();
    expect(draftText()).not.toContain('資本金');
  });
});

describe('申請書類の下書きの欄 — 直すまで下書きを作らない', () => {
  it('★ 読めない数が在る間は、下書きを出さず、保存もコピーもできない (欄を名指しする)', async () => {
    await type('従業員数', '5人くらい');
    expect(withheld()).toBe(draftWithheldNote(['従業員数']));
    expect(q('[data-application-draft]')).toBeNull();
    expect(q('[data-application-missing]')).toBeNull();
    expect(saveButton().disabled).toBe(true);
    expect(copyButton().disabled).toBe(true);
    // 欄の下の文は「保存できません」と述べる (0 として扱うとは言わない)。
    const field = need<HTMLInputElement>('[aria-label="従業員数"]');
    expect(field.getAttribute('data-guard-outcome')).toBe('refused');
    expect(field.closest('label')?.textContent).toContain('直すまで保存できません。');
    // 押しても何も起きない。
    await click(saveButton());
    await click(copyButton());
    expect(downloads).toEqual([]);
    expect(clipboardWrites).toEqual([]);
    // 直すと下書きが戻る。
    await type('従業員数', '5');
    expect(withheld()).toBeNull();
    expect(draftText()).toContain('従業員数: 5 人');
    expect(saveButton().disabled).toBe(false);
  });

  it('マイナス・範囲の外の年も断る・並びは欄の順', async () => {
    await type('直近の年間売上高', '-1');
    await type('創業・設立の年 (西暦)', '202');
    expect(withheld()).toBe(draftWithheldNote(['創業・設立の年 (西暦)', '直近の年間売上高']));
    await type('創業・設立の年 (西暦)', '2101');
    expect(withheld()).toBe(draftWithheldNote(['創業・設立の年 (西暦)', '直近の年間売上高']));
    await type('創業・設立の年 (西暦)', '2100');
    await type('直近の年間売上高', '0');
    expect(withheld()).toBeNull();
    expect(draftText()).toContain('直近の年間売上高: 0 円');
  });

  it('補助率は 0 より大きく 100 以下 (0 と 101 は断る・100 は通す)', async () => {
    await type('補助率', '0');
    expect(withheld()).toBe(draftWithheldNote(['補助率']));
    await type('補助率', '101');
    expect(withheld()).toBe(draftWithheldNote(['補助率']));
    await type('補助率', '100');
    expect(withheld()).toBeNull();
    expect(draftText()).toContain('補助率 (公募要領から入れた値): 100%');
  });

  it('★ 画面に出ていない欄は、下書きを止めない (個人事業主の資本金・助成金の補助率と費目)', async () => {
    await choose('事業形態', 'corporation');
    await type('資本金', 'abc');
    expect(withheld()).toBe(draftWithheldNote(['資本金']));
    await choose('事業形態', 'individual');
    expect(withheld()).toBeNull();
    await type('補助率', 'abc');
    await type('費目 1 の金額', 'abc');
    expect(withheld()).toBe(draftWithheldNote(['補助率', '費目 1 の金額']));
    await choose('書類の型', 'grant');
    expect(withheld()).toBeNull();
    expect(q('[data-application-draft]')).not.toBeNull();
  });

  it('長すぎる文が在る間も下書きを作らない (何字超えたかは欄の下が述べる)', async () => {
    await type('事業者名', 'あ'.repeat(80));
    expect(withheld()).toBeNull();
    await type('事業者名', 'あ'.repeat(81));
    expect(withheld()).toBe(draftWithheldNote(['事業者名']));
    expect(need('[data-ceiling-notice="事業者名"]').textContent).toContain('1 字超えています');
    await type('現状と課題', 'あ'.repeat(1201));
    expect(withheld()).toBe(draftWithheldNote(['事業者名', '現状と課題']));
    await type('費目 2 の名前', 'a'.repeat(41));
    expect(withheld()).toBe(draftWithheldNote(['事業者名', '現状と課題', '費目 2 の名前']));
    expect(q('[data-ceiling-notice="費目 2 の名前"]')).not.toBeNull();
  });
});

describe('申請書類の下書きの欄 — 経費', () => {
  it('費目と補助率を入れると、合計と申請額の目安が出る', async () => {
    await type('費目 1 の名前', '機械装置費');
    await type('費目 1 の金額', '1,000,000');
    await type('費目 2 の名前', '広報費');
    await type('費目 2 の金額', '500001');
    await type('補助率', '50');
    await type('上限額', '2000000');
    const text = draftText();
    expect(text).toContain('機械装置費1,000,000 円');
    expect(text).toContain('合計 (金額の入っている費目)1,500,001 円');
    expect(text).toContain('申請額の目安: 750,000 円');
    expect(text).toContain('自己負担の目安: 750,001 円');
    await type('上限額', '100000');
    expect(draftText()).toContain('申請額の目安: 100,000 円 (上限額で頭打ち)');
  });

  it('補助率が無ければ、申請額は計算しないと述べる (0 円と出さない)', async () => {
    await type('費目 1 の名前', '機械装置費');
    await type('費目 1 の金額', '1000');
    expect(draftText()).toContain('補助率が未記入のため、申請額は計算していません。');
    // 見出し (「7. 経費の内訳と申請額の目安」) には同じ語が在るので、額の行そのもの (「申請額の目安: 」) で見る。
    expect(draftText()).toContain('7. 経費の内訳と申請額の目安');
    expect(draftText()).not.toContain('申請額の目安: ');
  });

  it('費目の金額が読めなければ、行の番号つきで名指しする', async () => {
    await type('費目 2 の金額', '10万円');
    expect(withheld()).toBe(draftWithheldNote(['費目 2 の金額']));
    await type('費目 2 の金額', '100000');
    expect(withheld()).toBeNull();
  });

  it('費目は足せる (12 行まで)・消せる (最後の 1 行は消せない)・消すと番号が詰まる', async () => {
    const rows = (): number => container.querySelectorAll('[data-expense-row]').length;
    const add = (): HTMLButtonElement => need<HTMLButtonElement>('[data-add-expense]');
    expect(rows()).toBe(3);
    for (let i = 0; i < 9; i += 1) await click(add());
    expect(rows()).toBe(12);
    expect(add().disabled).toBe(true);
    await click(add());
    expect(rows()).toBe(12);
    // 2 行目に名前を入れて 1 行目を消すと、その行が 1 行目になる。
    await type('費目 2 の名前', '残る費目');
    await click(need('[aria-label="費目 1 を削除"]'));
    expect(rows()).toBe(11);
    expect(need<HTMLInputElement>('[aria-label="費目 1 の名前"]').value).toBe('残る費目');
    expect(add().disabled).toBe(false);
    for (let i = 0; i < 10; i += 1) await click(need('[aria-label="費目 1 を削除"]'));
    expect(rows()).toBe(1);
    expect(need<HTMLButtonElement>('[aria-label="費目 1 を削除"]').disabled).toBe(true);
    // 消したあとに足した行は、空で始まる (消した行の中身を引き継がない)。
    await click(add());
    expect(need<HTMLInputElement>('[aria-label="費目 2 の名前"]').value).toBe('');
  });
});

describe('申請書類の下書きの欄 — 保存とコピー', () => {
  it('★ 「Markdown で保存」で落ちる中身は下書きそのもの・名前に入力は入らない', async () => {
    await type('事業者名', '見本商店');
    await click(saveButton());
    expect(downloads.length).toBe(1);
    const { body, name } = downloads[0]!;
    expect(name).toMatch(/^funding-application-draft-\d{4}-\d{2}-\d{2}\.md$/);
    expect(name).not.toContain('見本商店');
    expect(body.startsWith('# 【下書き】補助金・助成金 申請書類 (作成日 ')).toBe(true);
    expect(body).toContain(`> ${DRAFT_CAUTIONS[0]}`);
    expect(body).toContain('- 事業者名: 見本商店');
    expect(body).toContain('- [ ] 最新の公募要領 (助成金は支給要領) と様式を入手した');
  });

  it('コピーは同じ中身を置き、置けたと述べる (入力を変えると、その文は消える)', async () => {
    await type('事業者名', '見本商店');
    await click(copyButton());
    expect(clipboardWrites.length).toBe(1);
    expect(clipboardWrites[0]).toContain('- 事業者名: 見本商店');
    expect(need('[data-application-copied]').textContent).toBe('コピーしました。');
    await type('事業者名', '別の商店');
    expect(q('[data-application-copied]')).toBeNull();
    await click(saveButton());
    expect(downloads[0]?.body).toBe(clipboardWrites[0]?.replace('見本商店', '別の商店'));
  });

  it('コピーできなかったら、そう述べて保存を案内する', async () => {
    clipboardFails = true;
    await click(copyButton());
    expect(q('[data-application-copied]')).toBeNull();
    expect(need('[data-application-copy-failed]').textContent).toBe('コピーできませんでした。「Markdown で保存」を使ってください。');
  });
});
