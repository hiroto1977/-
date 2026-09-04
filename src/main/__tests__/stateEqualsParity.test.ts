import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

/*
 * OAuth の `state` 比較は **2 か所にしかない**。
 *
 * main は Node の `timingSafeEqual`、renderer は手書きの XOR ループ ——
 * ブラウザに `Buffer` も `node:crypto` も無いので、片方は手書きにするしかない。
 * つまりこれは「まとめられる重複」ではなく、**同じ判断の 2 実装**である。
 *
 * 同じ形は既に 2 つ検査してある (`rfc2822Parity` / `atlassianSiteParity`)。
 * ここだけ検査が無く、実際にずれていた:
 *
 *   safeStateEquals('あ'.repeat(43), 'a'.repeat(43))
 *     main     → RangeError: Input buffers must have the same byte length
 *     renderer → false
 *
 * JS の length が同じでも UTF-8 のバイト長は違いうる ('あ' は 1 文字 3 バイト)
 * のに、main はバイト長を確かめずに `timingSafeEqual` に渡していた。
 * ループバックの待受へこの形の偽コールバックを投げると応答が返らず
 * `uncaughtException` になり、main.ts に受け手が無いので **Electron の
 * 主プロセスごと落ちた** (2026-08-22 に実測)。
 */
describe('safeStateEquals は main とブラウザ版で一致する', () => {
  const CASES: [string, unknown, unknown][] = [
    ['同じ ASCII', 'abc', 'abc'],
    ['違う ASCII', 'abc', 'abd'],
    ['長さ違い', 'abc', 'abcd'],
    ['空同士', '', ''],
    ['先頭だけ違う', 'xbc', 'abc'],
    ['末尾だけ違う', 'abx', 'abc'],
    ['同じ非 ASCII', 'あいう', 'あいう'],
    ['違う非 ASCII', 'あいう', 'あいえ'],
    // ↓ ずれていた形。JS 長は同じでバイト長だけ違う。
    ['JS 長は同じ・バイト長が違う (1 文字)', 'あ', 'a'],
    ['JS 長は同じ・バイト長が違う (state と同じ 43 文字)', 'あ'.repeat(43), 'a'.repeat(43)],
    ['43 文字のうち 1 つだけ全角', `${'a'.repeat(42)}あ`, 'a'.repeat(43)],
    ['サロゲートペア', '\u{1F600}', 'ab'],
    ['文字列でない (null)', null, 'abc'],
    ['文字列でない (数値)', 'abc', 7],
    ['文字列でない (undefined)', undefined, 'abc'],
  ];

  it.each(CASES)('%s — 同じ答えを返し、どちらも throw しない', async (_label, a, b) => {
    const { safeStateEquals: main } = await import('../oauth');
    const { safeStateEquals: web } = await import('../../renderer/oauth/pkce');
    const call = (f: (x: string, y: string) => boolean): boolean | string => {
      try {
        return f(a as string, b as string);
      } catch (e) {
        return `THROW: ${(e as Error).message}`;
      }
    };
    const m = call(main);
    const w = call(web);
    expect(typeof m, `main が throw した: ${String(m)}`).toBe('boolean');
    expect(m).toBe(w);
  });

  it('正しい state は両方 true (空虚に「全部 false」で一致していない)', async () => {
    const { safeStateEquals: main } = await import('../oauth');
    const { safeStateEquals: web } = await import('../../renderer/oauth/pkce');
    const s = 'x'.repeat(43);
    expect(main(s, s)).toBe(true);
    expect(web(s, s)).toBe(true);
  });
});
