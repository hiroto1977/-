// @vitest-environment jsdom
/**
 * LINE の画面 (2026-11-18) —— 実物の client に応答を食わせ、その戻りで画面を描く。
 *
 * 算定の正しさは `shared/api/__tests__/line.test.ts` が持つ。ここが見るのは**配線**:
 * 通数の言い分け・読めなかった物の名指しが画面に届くこと、
 * そして画面に書き込みの操作子が無いこと。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LinePage } from '../LinePage';
import { fetchLineSnapshot } from '../../../main/clients/line';
import { waitForText } from '../../__tests__/jsdomWait';
import { WEB_BUILD_SUFFIX } from '../../../shared/buildDestinations';

/** 相手の応答を順に返す `fetch`。 */
function replying(bodies: readonly unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root | null = null;
let invoke: ReturnType<typeof vi.fn>;

async function mount(
  Page: ComponentType,
  configured: boolean,
  data: unknown,
  waitFor: string,
  version: string | null = '0.1.0',
): Promise<string> {
  invoke = vi.fn(() => Promise.resolve({ ok: true, data: {} }));
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    // `null` は「実行形態がまだ分からない」(橋が答えない) 状態を作る。
    getVersion: () => (version === null ? new Promise<string>(() => {}) : Promise.resolve(version)),
    listConfigured: () => Promise.resolve(configured ? ['line'] : []),
    fetchSnapshot: () => Promise.resolve({ ok: true, data }),
    invoke,
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Page));
  });
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

const live = async (bodies: readonly unknown[]): Promise<unknown> =>
  fetchLineSnapshot({ token: 'token-example', fetch: replying(bodies) });

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

const BODIES = [
  { userId: 'U0', basicId: '@shop', displayName: 'お店', chatMode: 'chat' },
  { type: 'limited', value: 5000 },
  { totalUsage: 1200 },
] as const;

describe('LINE の画面: 鍵を登録する前 (同梱の見本)', () => {
  it('見本の配信数を出し、鍵の扱い (送信の権限も持つ・照会だけに使う) を案内する', async () => {
    const t = await mount(LinePage, false, null, '今月の配信');
    expect(t).toContain('見本の公式アカウント');
    expect(t).toContain('@sample');
    expect(t).toContain('5,000 通');
    expect(t).toContain('1,240 通');
    expect(t).toContain('3,760 通');
    expect(t).toContain('Bot (自動で応答)');
    const guide = container.querySelector('[data-line-key-guide]')?.textContent ?? '';
    expect(guide).toContain('チャネルアクセストークン');
    expect(guide).toContain('メッセージを送る権限も持つ');
    expect(guide).toContain('メッセージの送信や友だちの情報の照会はしません');
    expect(container.querySelector('[data-line-intake-note]')).toBeNull();
  });
});

describe('LINE の画面: 実物の client の戻りを描く', () => {
  it('★ アカウントと今月の配信 (上限・配信数・残り) を出す', async () => {
    const data = await live(BODIES);
    const t = await mount(LinePage, true, data, 'お店');
    expect(t).toContain('@shop');
    expect(t).toContain('5,000 通');
    expect(t).toContain('1,200 通');
    expect(t).toContain('3,800 通');
    expect(t).toContain('チャット (人が応答)');
    expect(container.querySelector('[data-line-intake-note]')).toBeNull();
    // 内部 ID は画面に出さない。
    expect(t).not.toContain('U0');
  });

  it('★ 読めなかった配信数は「0 通」にせず、⚠ で名指しする (画面は落ちない)', async () => {
    const data = await live([BODIES[0], BODIES[1], { totalUsage: '1200' }]);
    const t = await mount(LinePage, true, data, '読み取れませんでした');
    const note = container.querySelector('[data-line-intake-note]');
    expect(note?.getAttribute('role')).toBe('alert');
    expect(note?.textContent).toContain('今月の配信数を読み取れませんでした');
    expect(t).toContain('今月の配信数が読めません');
    expect(t).toContain('算定できません (上限か配信数が読めないため)');
    // 行は「題 + 値」で並ぶ。読めた 0 なら `今月の配信数0 通` になる (標本: 下の 0 通の検査がその綴りを肯定形で見る)。
    expect(t).not.toContain('今月の配信数0 通');
  });

  it('対照: 0 通と答えた応答は「0 通」と出し、⚠ を出さない', async () => {
    const data = await live([BODIES[0], BODIES[1], { totalUsage: 0 }]);
    const t = await mount(LinePage, true, data, '今月の配信数0 通');
    expect(t).toContain('残り5,000 通');
    expect(container.querySelector('[data-line-intake-note]')).toBeNull();
  });

  it('★ 上限なしの応答は「上限なし」と言い、⚠ を出さない', async () => {
    const data = await live([BODIES[0], { type: 'none' }, BODIES[2]]);
    const t = await mount(LinePage, true, data, '上限なし');
    expect(t).toContain('1,200 通');
    expect(container.querySelector('[data-line-intake-note]')).toBeNull();
  });

  it('★ 配信数が上限を超えていれば、超えた通数を述べる', async () => {
    const data = await live([BODIES[0], { type: 'limited', value: 200 }, { totalUsage: 260 }]);
    const t = await mount(LinePage, true, data, '超えています');
    expect(t).toContain('上限を 60 通超えています');
  });

  it('★ 欄の無い応答 ({}) では、読めなかった 3 つを名指しし、名前は「(名前なし)」と言う', async () => {
    const data = await live([{}, {}, {}]);
    const t = await mount(LinePage, true, data, '読み取れませんでした');
    expect(container.querySelector('[data-line-intake-note]')?.textContent).toContain(
      'アカウントの情報・配信の上限・今月の配信数を読み取れませんでした',
    );
    expect(t).toContain('(名前なし)');
    expect(t).toContain('応答モードが読めません');
  });

  it('★ 画面は読むだけ —— 書き込みの action を 1 つも呼ばない', async () => {
    const data = await live(BODIES);
    await mount(LinePage, true, data, 'お店');
    expect(invoke).not.toHaveBeenCalled();
    // 入力欄は資格情報の 1 つだけ (畳まれている間は 0)。メッセージや宛先を打つ欄は無い。
    expect(container.querySelectorAll('input:not([type=password]), textarea, select')).toHaveLength(0);
  });
});

describe('LINE の画面: ブラウザ版はプロキシが要ると、押す前に述べる', () => {
  it('★ ブラウザ版では、プロキシの登録と許可リストへの追加を案内する', async () => {
    await mount(LinePage, false, null, 'api.line.me', `0.1.0${WEB_BUILD_SUFFIX}`);
    const note = container.querySelector('[data-line-proxy-note]');
    expect(note?.textContent).toContain('「BYO プロキシ」');
    expect(note?.textContent).toContain('api.line.me');
    expect(container.querySelector('[data-line-key-guide]')).not.toBeNull();
  });

  it('対照: デスクトップ版では述べない (直接つなぐので、プロキシを建てさせない)', async () => {
    const t = await mount(LinePage, false, null, '今月の配信');
    expect(t).toContain('チャネルアクセストークン');
    expect(container.querySelector('[data-line-proxy-note]')).toBeNull();
  });

  it('対照: 実行形態がまだ分からない間も述べない (間違って述べるより 1 フレーム遅れて述べる)', async () => {
    const t = await mount(LinePage, false, null, '今月の配信', null);
    expect(t).toContain('チャネルアクセストークン');
    expect(container.querySelector('[data-line-proxy-note]')).toBeNull();
  });
});
