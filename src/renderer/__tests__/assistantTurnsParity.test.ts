import { describe, expect, it, vi } from 'vitest';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
    status: async () => 'locked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/assistant-parity', getVersion: () => '1.0.0', isPackaged: false },
}));

import {
  MAX_ASSISTANT_CONTENT_CHARS,
  MAX_ASSISTANT_MESSAGES,
} from '../../shared/assistantLimits';

/*
 * **名前が違うだけで、同じ判断を 2 度書いている。**
 *
 *   main     `clients/assistant.ts`  `sanitizeMessages`
 *   browser  `web-shim.ts`           `sanitizeAssistantTurns`
 *
 * `dualBuildDecisions.test.ts` の台帳は `^export function (\\w+)` を両ビルドで
 * 集めて**同じ名前**の重複を数える。だからこの組は**構造的に見えない** ——
 * 名前を変えるだけで台帳から消える形である。
 *
 * 中身は外部 API へ送る会話履歴の関門で、通った物がそのまま Anthropic /
 * OpenAI 等へ出て行く。上限が緩む方向へずれると送信量と課金に直接効く。
 * 2026-08-23 まで上限は**字面で 2 度**書いてあった (8000 / 40 / 60000×2)。
 * 今は `shared/assistantLimits.ts` を両方が読む。
 *
 * 見るのは「同じ物を返すか」だけ。
 */

type Sanitizer = (raw: unknown) => { role: string; content: string }[];

async function loadBoth(): Promise<{ web: Sanitizer; main: Sanitizer }> {
  const webMod = (await import('../web-shim')) as unknown as { sanitizeAssistantTurns: Sanitizer };
  const mainMod = (await import('../../main/clients/assistant')) as unknown as {
    sanitizeMessages: Sanitizer;
  };
  return { web: webMod.sanitizeAssistantTurns, main: mainMod.sanitizeMessages };
}

const turn = (role: string, content: string): unknown => ({ role, content });

const CASES: [string, unknown][] = [
  ['配列でない', 'nope'],
  ['null', null],
  ['空配列', []],
  ['正当な 1 件', [turn('user', 'hi')]],
  ['前後の空白は落とす', [turn('user', '  hi  ')]],
  ['空文字は落とす', [turn('user', '   ')]],
  ['role が許可外', [turn('system', 'x')]],
  ['role が無い', [{ content: 'x' }]],
  ['content が文字列でない', [turn('user', 1 as unknown as string)]],
  ['要素が null', [null]],
  ['要素がオブジェクトでない', ['x']],
  ['content が上限ちょうど', [turn('user', 'a'.repeat(MAX_ASSISTANT_CONTENT_CHARS))]],
  ['content が上限 +1 (切り詰め)', [turn('user', 'a'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 1))]],
  ['件数が上限ちょうど', Array.from({ length: MAX_ASSISTANT_MESSAGES }, (_, i) => turn('user', `m${i}`))],
  ['件数が上限 +1 (古い方を捨てる)', Array.from({ length: MAX_ASSISTANT_MESSAGES + 1 }, (_, i) => turn('user', `m${i}`))],
  ['不正と正当が混ざる', [null, turn('user', 'a'), turn('bad', 'b'), turn('assistant', 'c')]],
];

describe('会話履歴の整形は main とブラウザ版で同じ物を返す', () => {
  it.each(CASES)('%s', async (_label, raw) => {
    const { web, main } = await loadBoth();
    expect(web(raw)).toEqual(main(raw));
  });

  it('「全部空を返す」で一致していない (中身が出ている例も在る)', async () => {
    const { web } = await loadBoth();
    const nonEmpty = CASES.filter(([, raw]) => web(raw).length > 0);
    expect(nonEmpty.length, '中身が出る例が足りない — 検査が空虚').toBeGreaterThanOrEqual(6);
    const empty = CASES.length - nonEmpty.length;
    expect(empty, '空になる例が足りない — 検査が空虚').toBeGreaterThanOrEqual(6);
  });

  it('上限は両方とも共有の定数から来ている (字面の再登場を許さない)', async () => {
    const { web, main } = await loadBoth();
    const over = [turn('user', 'a'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 50))];
    expect(web(over)[0]!.content.length).toBe(MAX_ASSISTANT_CONTENT_CHARS);
    expect(main(over)[0]!.content.length).toBe(MAX_ASSISTANT_CONTENT_CHARS);
    const many = Array.from({ length: MAX_ASSISTANT_MESSAGES + 5 }, (_, i) => turn('user', `m${i}`));
    expect(web(many)).toHaveLength(MAX_ASSISTANT_MESSAGES);
    expect(main(many)).toHaveLength(MAX_ASSISTANT_MESSAGES);
  });
});
