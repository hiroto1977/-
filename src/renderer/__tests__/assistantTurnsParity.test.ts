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
  MAX_ASSISTANT_SYSTEM_CHARS,
  MAX_ENSEMBLE_ERROR_CHARS,
} from '../../shared/assistantLimits';
import { clampToCeiling, countChars } from '../../shared/inputCeiling';
import { resolve } from 'node:path';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { ERROR_MESSAGE_MAX_CHARS } from '../../shared/redact';
import { hasLoneSurrogate } from '../../shared/__tests__/loneSurrogate';

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
  /*
   * **上のどの例も ASCII だった** —— `'a'.repeat(N)` ではコード単位と文字数が
   * 一致するので、天井の**単位**が割れていても両ビルドは同じ答えを返す。
   * 区別が現れる標本を足す (2026-09-14 · パス 252)。
   */
  ['content が絵文字で上限ちょうど (文字数)', [turn('user', '😀'.repeat(MAX_ASSISTANT_CONTENT_CHARS))]],
  ['content が絵文字で上限 +1 (孤立サロゲートを作らずに切る)', [turn('user', '😀'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 1))]],
  ['content が JIS2004 漢字で上限 +1', [turn('user', '𠮟'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 1))]],
  ['content が絵文字 + ASCII の混在で上限 +1', [turn('user', `${'😀'.repeat(MAX_ASSISTANT_CONTENT_CHARS)}${'a'.repeat(10)}`)]],
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

describe('★ system プロンプトの天井も、両ビルドが同じ単位で切る (パス 252)', () => {
  /*
   * `system` は `chat` / `chatAll` の中で切られるので、上の純関数の対照からは
   * 見えない。2026-09-14 まで:
   *
   *   main      `system.slice(0, MAX_SYSTEM)`                      ← コード単位
   *   browser   `clampToCeiling(system, MAX_ASSISTANT_SYSTEM_CHARS)` ← 文字
   *
   * 天井の**値**は共有の定数から来ていたが**単位**が割れていた。
   */
  it('★ 同じ入力に対し、両ビルドの切り方が同じ物を返す (絵文字 50,000 字)', () => {
    const sys = '😀'.repeat(50_000); // 実文字数 50,000 / コード単位 100,000
    const shared = clampToCeiling(sys, MAX_ASSISTANT_SYSTEM_CHARS);
    expect(countChars(shared)).toBe(50_000); // 天井 (60,000 字) の中なので切られない
    // 対照 —— main が 2026-09-14 まで使っていた式は、同じ入力を 30,000 字へ切っていた。
    expect(countChars(sys.slice(0, MAX_ASSISTANT_SYSTEM_CHARS))).toBe(30_000);
  });

  it('★ 天井ちょうどで絵文字が来ても、孤立サロゲートを残さない', () => {
    const sys = `${'あ'.repeat(MAX_ASSISTANT_SYSTEM_CHARS - 1)}😀${'あ'.repeat(10)}`;
    const shared = clampToCeiling(sys, MAX_ASSISTANT_SYSTEM_CHARS);
    expect(hasLoneSurrogate(shared)).toBe(false);
    expect(countChars(shared)).toBe(MAX_ASSISTANT_SYSTEM_CHARS);
    // 対照 —— `.slice` は 60,000 コード単位で切るので末尾が U+D83D で残る。
    const cut = sys.slice(0, MAX_ASSISTANT_SYSTEM_CHARS);
    expect(hasLoneSurrogate(cut)).toBe(true);
    expect(cut.codePointAt(cut.length - 1)).toBe(0xd83d);
    // その文字列を JSON にすると、壊れたエスケープが本文に載る。
    expect(JSON.stringify(cut).endsWith('\\ud83d"')).toBe(true);
  });

  /*
   * **原文で読む。** 2026-09-15 まで `node:fs/promises` の `readFile` を使っていた ——
   * `src/main/clients/assistant.ts` は `stryker.config.json` の `mutate` 台帳に在るので、
   * 変異検査の sandbox ではこのファイルは計器に書き換えられており、下の
   * **`not.toContain(…)` は「どの入力でも通る空の検査」になっていた**
   * (2026-09-07 に 36 件直したのと同じ欠陥。網が同期の綴りしか見ていなかったので
   * この 1 件だけが規則の外に残っていた —— `originalSourcePolicy.test.ts` の規則 3)。
   */
  const sources = (): { mainSrc: string; webSrc: string } => ({
    mainSrc: readOriginalSource(resolve(__dirname, '../../main/clients/assistant.ts')),
    webSrc: readOriginalSource(resolve(__dirname, '../web-shim.ts')),
  });

  it('★ 両ビルドの実装が同じ綴りで切っている (字面の再登場を許さない)', () => {
    const { mainSrc, webSrc } = sources();
    // main は局所名 (MAX_SYSTEM = MAX_ASSISTANT_SYSTEM_CHARS) を使う。
    expect(mainSrc).toContain('clampToCeiling(system, MAX_SYSTEM)');
    expect(mainSrc).not.toContain('system.slice(0, MAX_SYSTEM)');
    expect(webSrc).toContain('clampToCeiling(payload[\'system\'] as string, MAX_ASSISTANT_SYSTEM_CHARS)');
  });

  /*
   * **1 つの数字を 2 度書くと、片方だけが動く。**
   *
   * 提供者ごとのエラー文の天井 300 字は、2026-09-15 まで
   * `redactForMessage(msg, 300)` という**字面がビルドごとに 1 つずつ**在った。
   * 応答の天井 (`ERROR_MESSAGE_MAX_CHARS` = 2,000) とは別の数で、最大 5 提供者ぶんが
   * 1 つの文に積まれるので狭い —— つまり「なぜ 300 か」が書かれるべき所に何も無かった。
   * パス 167 (入力欄の天井の写し 12 件)・パス 250・パス 252 と同じ家系である。
   *
   * **肯定形で留める** —— 共有の名を通していることを確かめ、そのうえで字面の再登場を禁じる。
   */
  it('★ 提供者ごとのエラー文の天井は、両ビルドが共有の名を読む', () => {
    const { mainSrc, webSrc } = sources();
    expect(mainSrc).toContain('redactForMessage(msg, MAX_ENSEMBLE_ERROR_CHARS)');
    expect(webSrc).toContain('redactForMessage(msg, MAX_ENSEMBLE_ERROR_CHARS)');
    // 名は `shared/assistantLimits.ts` の 1 つだけから来る (局所の再宣言を許さない)。
    for (const src of [mainSrc, webSrc]) {
      expect(src).toContain('MAX_ENSEMBLE_ERROR_CHARS');
      expect(src).not.toMatch(/(?:const|let)\s+MAX_ENSEMBLE_ERROR_CHARS/);
    }
  });

  it('★ 字面の 300 が同じ位置に戻っていない (対照つき)', () => {
    const { mainSrc, webSrc } = sources();
    const drift = /redactForMessage\(\s*msg\s*,\s*\d/;
    expect(mainSrc).not.toMatch(drift);
    expect(webSrc).not.toMatch(drift);
    // 対照 —— 規則が実際にこの形へ当たる (綴りが 1 つ違えば黙る検査にしない)。
    expect('error: redactForMessage(msg, 300),').toMatch(drift);
    expect("error: redactForMessage(msg, MAX_ENSEMBLE_ERROR_CHARS)").not.toMatch(drift);
  });

  it('★ 共有の天井は応答の天井より狭い (積まれるので)', () => {
    expect(MAX_ENSEMBLE_ERROR_CHARS).toBe(300);
    expect(MAX_ENSEMBLE_ERROR_CHARS).toBeLessThan(ERROR_MESSAGE_MAX_CHARS);
  });
});
