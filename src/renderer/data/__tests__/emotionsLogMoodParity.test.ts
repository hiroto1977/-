/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_ANALYSES, MAX_MOODS } from '../../../shared/emotionsLimits';
import { tmpdir } from 'node:os';

const EMOTIONS_UD = mkdtempSync(`${tmpdir()}/emotions-parity-`);

vi.mock('electron', () => ({
  app: { getPath: () => EMOTIONS_UD, getVersion: () => '1.0.0', isPackaged: false },
}));

import { MAX_MOOD_NOTE_CHARS } from '../../../shared/emotionsLimits';
import { logMood as logMoodWeb, loadStore, EMOTIONS_STORE_KEY } from '../emotionsWeb';

/*
 * **`log-mood` の note の上限を、注記ではなく振る舞いで留める。**
 *
 * `emotionsLimits.ts` は当初こう書いていた ——
 *
 *     ブラウザ   5000 字で断る              2000 字で断る
 *     main       空でなければ通す           検査なし
 *
 * それを根拠に **main 側にだけ**上限が入った。だが実測すると、ブラウザ版で
 * 上限を持っていたのは `analyze-text` だけで、`log-mood` の note は
 * **素通し**だった。5 万字を渡すと 5 万字そのまま localStorage に載った。
 *
 * 注記が「向こうは持っている」と言い、誰もそれを確かめなかった。
 * **持っているかどうかは、渡してみれば分かる。**
 */

describe('log-mood の note は、どちらの版でも同じ長さで断られる', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('上限ちょうどは通る (境界・両版)', () => {
    const at = 'あ'.repeat(MAX_MOOD_NOTE_CHARS);
    expect(() => logMoodWeb({ date: '2026-01-01', score: 3, note: at })).not.toThrow();
    expect(loadStore().moods[0]?.note.length).toBe(MAX_MOOD_NOTE_CHARS);
  });

  it('上限 +1 は断る (境界・ブラウザ版)', () => {
    const over = 'あ'.repeat(MAX_MOOD_NOTE_CHARS + 1);
    expect(() => logMoodWeb({ date: '2026-01-01', score: 3, note: over })).toThrow(/note exceeds/);
  });

  it('断ったときは 1 件も保存しない', () => {
    const over = 'あ'.repeat(MAX_MOOD_NOTE_CHARS + 1);
    expect(() => logMoodWeb({ date: '2026-01-01', score: 3, note: over })).toThrow();
    expect(loadStore().moods, '断ったのに保存されている').toEqual([]);
    expect(localStorage.getItem(EMOTIONS_STORE_KEY), '断ったのに書き込んでいる').toBeNull();
  });

  /*
   * **これが本体。** 5 万字を投げて、保管先が 5 万字ぶん育たないこと。
   * ブラウザ版の保存先は localStorage で、容量はオリジン全体で共有する ——
   * ここが青天井だと、保管庫のメタや proxy 設定の書き込みが先に落ちる。
   */
  it('巨大な note で保管先が育たない', () => {
    const huge = 'あ'.repeat(50_000);
    expect(() => logMoodWeb({ date: '2026-01-01', score: 3, note: huge })).toThrow();
    const raw = localStorage.getItem(EMOTIONS_STORE_KEY) ?? '';
    expect(raw.length, 'localStorage が巨大な note を飲み込んでいる').toBeLessThan(1000);
  });

  /*
   * main 側の `logMood` は非公開だが、`ACTIONS['log-mood']` から掴める
   * (`action:invoke` が実際に通る経路そのもの)。
   *
   * **比較が空回りしないことを先に確かめる。** 最初にこれを書いたときは
   * `logMood` を名前で import しようとして `is not a function` になり、
   * 全件が「判断が一致した」ことにされていた —— 空虚検査が鳴って気付いた。
   */
  it('main 側と同じ判断をする (通す / 断るの一致)', async () => {
    const mainMod = (await import('../../../main/clients/emotions')) as unknown as {
      ACTIONS: Record<string, (ctx: { payload: unknown }) => Promise<unknown>>;
    };
    const mainLogMood = mainMod.ACTIONS['log-mood'];
    expect(typeof mainLogMood, 'main 側の log-mood を掴めていない').toBe('function');

    const call = async (len: number): Promise<boolean> => {
      const note = 'あ'.repeat(len);
      localStorage.clear();
      let webOk = true;
      try {
        logMoodWeb({ date: '2026-01-01', score: 3, note });
      } catch {
        webOk = false;
      }
      let mainOk = true;
      try {
        await mainLogMood!({ payload: { date: '2026-01-01', score: 3, note } });
      } catch (e) {
        // 上限以外の理由 (保存先に触れない等) で落ちたら、比較が成立していない。
        // 黙って読み飛ばすと「一致した」ことにされるので、そこで落とす。
        expect(
          (e as Error).message,
          `main が上限以外の理由で落ちた — 比較が成立していない (len=${len})`,
        ).toMatch(/note exceeds/);
        mainOk = false;
      }
      expect(webOk, `len=${len}: 版によって判断が違う`).toBe(mainOk);
      return webOk;
    };

    const results = [await call(0), await call(MAX_MOOD_NOTE_CHARS), await call(MAX_MOOD_NOTE_CHARS + 1), await call(50_000)];
    // 全部通す / 全部断るで「一致」しても意味が無い。両方の側が出ていること。
    expect(results.filter((r) => r).length, '通した例が無い — 検査が空虚').toBeGreaterThanOrEqual(2);
    expect(results.filter((r) => !r).length, '断った例が無い — 検査が空虚').toBeGreaterThanOrEqual(2);
  });
});

/*
 * **保持件数の上限も、両ビルドで 1 つだけ持つ (2026-08-25)。**
 *
 * `MAX_MOODS` / `MAX_ANALYSES` は**両方のファイルで `const` として宣言されて
 * いた**。`dualBuildDecisions.test.ts` の検出器は **export された関数名**の
 * 積集合を見るので、**モジュール直下の `const` は見えない** —— note/text の
 * 上限をここへ寄せたときも、この 2 つは残っていた。
 *
 * ずれると「どちらのビルドで記録したかで残る件数が変わる」。字面が戻って
 * いないことを、両方のファイルについて留める。
 */
describe('保持件数の上限は共有の 1 つ', () => {
  const SRC = [
    ['main/clients/emotions.ts', join(__dirname, '../../../main/clients/emotions.ts')],
    ['renderer/data/emotionsWeb.ts', join(__dirname, '../emotionsWeb.ts')],
  ] as const;

  it('値が共有されている', () => {
    expect(MAX_MOODS).toBe(365);
    expect(MAX_ANALYSES).toBe(50);
  });

  it.each(SRC)('%s が自前で宣言していない', (_label, path) => {
    const code = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code, 'MAX_MOODS を自前で宣言しています').not.toMatch(/const\s+MAX_MOODS\s*=/);
    expect(code, 'MAX_ANALYSES を自前で宣言しています').not.toMatch(/const\s+MAX_ANALYSES\s*=/);
    // 空撃ちでないこと —— そのファイルが実際に共有の値を使っている。
    expect(code).toContain('emotionsLimits');
  });

  /* 「無いことの検査」に標本を添える。 */
  it('★ 上の規則は、元の書き方に本当に当たる', () => {
    expect('const MAX_MOODS = 365;').toMatch(/const\s+MAX_MOODS\s*=/);
    expect('const MAX_ANALYSES = 50;').toMatch(/const\s+MAX_ANALYSES\s*=/);
  });
});
