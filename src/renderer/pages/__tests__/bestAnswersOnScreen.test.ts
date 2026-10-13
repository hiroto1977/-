/** @vitest-environment jsdom */
/**
 * **ベストアンサー 3 を実物の画面で** —— 選ぶ・送る・画面を離れる・戻る、を押して確かめる。
 *
 * 見ること: ① 選ぶと「何回・どこへ」を送る前に述べる (断りは入力欄より上) ② 送ると 5 つの
 * 回答者が走り、進み具合が出る ③ **画面を外しても仕事は続き、戻った画面が 1 度だけ受け取る**
 * (= バックグラウンド) ④ 上位 3 件が 🥇🥈🥉 の順でチャットに出る ⑤ 走っている間も入力欄は使える。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { BEST3_AGENTS } from '../../data/assistantProviders';
import { ANSWER_STRATEGIES, MAX_BEST_ANSWER_CALLS } from '../../data/bestAnswers';
import { _resetBestJobForTests, getBestJob } from '../../data/bestAnswersJob';

const QUESTION = 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか';

/** 送られた chat の要求 (system から観点を読む)。手で解けるように待たせる。 */
const pending: { system: string; resolve: () => void }[] = [];
let chatCalls = 0;

function answerFor(system: string): string {
  const s = ANSWER_STRATEGIES.find((x) => system.includes(`「${x.label}」を担当`));
  return `${s?.label ?? '?'}の回答です。インボイス制度では登録番号の無い請求書は原則として控除できません。${'補足。'.repeat(10 + chatCalls)}\n- 税理士に確認してください`;
}

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['assistant']),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (service: string, action: string, payload: { system?: string }) => {
      if (service === 'assistant' && action === 'providers') {
        return Promise.resolve({
          ok: true,
          data: {
            providers: [
              { id: 'anthropic', label: 'Claude (Anthropic)', configured: true, isDefault: true, defaultModel: 'm', browserDirect: true },
            ],
          },
        });
      }
      if (service === 'assistant' && action === 'chat') {
        chatCalls += 1;
        const system = payload.system ?? '';
        return new Promise((resolve) => {
          pending.push({
            system,
            resolve: () => resolve({ ok: true, data: { text: answerFor(system), provider: 'anthropic', model: 'm' } }),
          });
        });
      }
      return Promise.resolve({ ok: false, code: 'x', message: 'x' });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
    storageProtection: () =>
      Promise.resolve({ mechanism: 'os-keychain', encrypted: true, plainCount: 0, file: '/x' }),
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

/**
 * 画面を付ける。`strict` は React の StrictMode で包む —— 出荷する `main.tsx` と同じ包み方で、
 * **開発時は付けた直後の effect を 2 度走らせる** (その 2 度目は同じ古い描画の値を見る)。
 */
async function mount(opts: { readonly strict?: boolean } = {}): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'assistant');
  if (!def) throw new Error('assistant service missing');
  root = createRoot(container);
  const page = createElement(def.page);
  await act(async () => {
    root!.render(opts.strict === true ? createElement(StrictMode, null, page) : page);
  });
  // 設定状況が届いた印: 接続チップが出る。
  await waitForText(() => container.textContent ?? '', 'Claude (Anthropic)');
}

async function unmount(): Promise<void> {
  if (!root) return;
  const r = root;
  await act(async () => r.unmount());
  root = null;
}

async function chooseBest3(): Promise<void> {
  const select = await waitForElement<HTMLSelectElement>(
    () => container.querySelector<HTMLSelectElement>('select[aria-label="AI エージェントを選択"]'),
    'エージェントの選択',
  );
  await act(async () => {
    select.value = BEST3_AGENTS;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitForElement(() => container.querySelector('[data-best3-plan]'), 'ベスト3 の送り方の説明');
}

async function ask(text: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="アシスタントへの入力"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    input.form!.requestSubmit();
  });
}

/** 待っている送信を全部解く (並列の上限ぶんずつ来るので、終わるまで繰り返す)。 */
async function releaseAll(): Promise<void> {
  await settleUntil(
    () => {
      while (pending.length > 0) pending.shift()!.resolve();
      return getBestJob()?.status !== 'running';
    },
    'ベスト3 が終わる',
  );
}

beforeEach(async () => {
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
  pending.length = 0;
  chatCalls = 0;
  localStorage.clear();
  _resetBestJobForTests();
  stubHub();
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await unmount();
  container.remove();
  _resetBestJobForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ベストアンサー 3 (実物の画面)', () => {
  it('★ 選ぶと、送る前に「何回・どこへ」を述べる (断りは入力欄より上)', async () => {
    await mount();
    await chooseBest3();
    const plan = container.querySelector('[data-best3-plan]')!;
    expect(plan.textContent).toContain(`計 ${MAX_BEST_ANSWER_CALLS} 回`);
    const notice = container.querySelector('[data-ai-egress]')!;
    expect(notice.textContent, '断りが合議と同じ送り先を名乗っていない').toContain('Claude (Anthropic)');
    const input = container.querySelector('input[aria-label="アシスタントへの入力"]')!;
    // 断りも説明も入力欄より前に在る (押してから知る形にしない)。
    expect(notice.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(plan.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * **AI が 1 つも設定されていないとき、説明は断りと矛盾しない。** 断りは「端末の外へは出ません」と
   * 言うので、説明が「上の送り先へ計 5 回送ります」と言うと同じ画面が 2 通りに答える
   * (1 度目の実装はそうだった —— 説明が送り先を自分で数えていた)。
   */
  it('★ AI が未設定なら、説明は「外へは出ない」と言い、回数を送り先へ送るとは言わない', async () => {
    const hub = (globalThis as unknown as { serviceHub: { invoke: (s: string, a: string, p: unknown) => Promise<unknown> } }).serviceHub;
    const base = hub.invoke;
    hub.invoke = (service, action, payload) =>
      service === 'assistant' && action === 'providers'
        ? Promise.resolve({
            ok: true,
            data: {
              providers: [
                { id: 'anthropic', label: 'Claude (Anthropic)', configured: false, isDefault: true, defaultModel: 'm', browserDirect: true },
              ],
            },
          })
        : base(service, action, payload);
    await mount();
    await chooseBest3();
    const plan = container.querySelector('[data-best3-plan]')!.textContent ?? '';
    const notice = container.querySelector('[data-ai-egress]')!.textContent ?? '';
    expect(notice, '断りが「外へ出ない」を言っていない (前提が崩れた)').toContain('端末の外へは出ません');
    expect(plan).toContain('設定済みの AI がありません');
    expect(plan).toContain('外へは出ません');
    expect(plan, '送り先の無いときに「上の送り先へ送ります」と言っている').not.toContain('上の送り先へ');
    // 標本: 針は設定済みのときの文には当たる (当たらなければ上の not は空の検査)。
    expect('観点の違う回答者 5 人が、上の送り先へ同じ内容を 1 回ずつ送ります').toContain('上の送り先へ');
  });

  it('★ 送ると回答者が走り、7 つの lens の進み具合が出て、上位 3 件が 🥇🥈🥉 の順に届く', async () => {
    await mount();
    await chooseBest3();
    await ask(QUESTION);
    await waitForElement(() => container.querySelector('[data-best3-progress]'), '進み具合');
    expect(container.querySelectorAll('[data-best3-progress] [data-lens]')).toHaveLength(7);
    await releaseAll();
    expect(chatCalls).toBe(MAX_BEST_ANSWER_CALLS);
    await waitForText(() => container.textContent ?? '', '🥉 3 位');
    const t = container.textContent ?? '';
    expect(t.indexOf('🥇 1 位')).toBeLessThan(t.indexOf('🥈 2 位'));
    expect(t.indexOf('🥈 2 位')).toBeLessThan(t.indexOf('🥉 3 位'));
    expect(t).toContain('🏆 ベスト3');
    expect(container.querySelector('[data-best3-progress]'), '終わったのに進み具合が残っている').toBeNull();
  });

  it('★ 画面を外しても仕事は続き、戻った画面が 1 度だけ受け取る (バックグラウンド)', async () => {
    await mount();
    await chooseBest3();
    await ask(QUESTION);
    await waitForElement(() => container.querySelector('[data-best3-progress]'), '進み具合');
    await unmount(); // 別の画面へ移った
    await releaseAll(); // 画面の無いまま終わる
    expect(getBestJob()?.status).toBe('done');
    expect(getBestJob()?.delivered, '画面が無いのに届けたことになっている').toBe(false);
    await mount(); // 戻る
    await waitForText(() => container.textContent ?? '', '🥉 3 位');
    expect(getBestJob()?.delivered).toBe(true);
    // 表示名は仕様の表から引く —— 戻った瞬間は設定状況の読み (非同期) より先に渡るので、
    // そこから引くと生の id が出た (1 度目の形: 居たまま受け取ると表示名・戻ると id)。
    const back = container.textContent ?? '';
    expect(back, '戻って受け取ると表示名が生の id になった').toContain('via Claude (Anthropic)');
    expect(back).not.toContain('via anthropic');
    await unmount();
    await mount(); // もう 1 度戻っても 2 度は渡さない
    await waitForText(() => container.textContent ?? '', '🥉 3 位');
    const count = (container.textContent ?? '').split('🥉 3 位').length - 1;
    expect(count, '同じ結果が 2 度チャットに入った').toBe(1);
  });

  /**
   * **StrictMode で戻っても 2 度は渡さない** —— 出荷する `main.tsx` は StrictMode で包むので、
   * 開発版では付けた直後の effect が 2 度走り、2 度目は同じ古い `bestJob` (delivered: false) を見る。
   * 渡すかどうかを描いた時点の値で決めると、結果が 2 度チャットに入る (1 度目にそう書いていた)。
   */
  it('★ StrictMode で戻っても、結果は 1 度だけ渡る (開発時は effect が 2 度走る)', async () => {
    await mount();
    await chooseBest3();
    await ask(QUESTION);
    await waitForElement(() => container.querySelector('[data-best3-progress]'), '進み具合');
    await unmount(); // 別の画面へ移った
    await releaseAll(); // 画面の無いまま終わる
    await mount({ strict: true }); // StrictMode で戻る
    await waitForText(() => container.textContent ?? '', '🥉 3 位');
    const t = container.textContent ?? '';
    expect(t.split('🏆 ベスト3 ——').length - 1, '見出しが 2 度チャットに入った').toBe(1);
    expect(t.split('🥇 1 位').length - 1, '1 位が 2 度チャットに入った').toBe(1);
  });

  it('★ 走っている間も入力欄は使える (待たせない)', async () => {
    await mount();
    await chooseBest3();
    await ask(QUESTION);
    await waitForElement(() => container.querySelector('[data-best3-progress]'), '進み具合');
    const input = container.querySelector<HTMLInputElement>('input[aria-label="アシスタントへの入力"]')!;
    expect(input.disabled).toBe(false);
    await releaseAll();
  });

  it('★ 走っている間に 2 つ目を頼むと、理由を言って断る (「取り消す」は実在する)', async () => {
    await mount();
    await chooseBest3();
    await ask(QUESTION);
    await waitForElement(() => container.querySelector('[data-best3-progress]'), '進み具合');
    await ask('別の質問です');
    await waitForText(() => container.textContent ?? '', 'ベスト3 を作成中です');
    const cancel = container.querySelector<HTMLButtonElement>('[data-best3-cancel]');
    expect(cancel?.textContent).toBe('取り消す');
    await act(async () => cancel!.click());
    await waitForText(() => container.textContent ?? '', 'ベスト3 を取り消しました');
    expect(getBestJob()?.status).toBe('cancelled');
  });
});
