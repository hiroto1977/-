/**
 * **収まった先のうち、この実行形態で実際に開ける物を名指しする** (2026-09-25 · パス 458)。
 *
 * ## 直す前の実測 (2026-09-25 · jsdom で実物の `ExportActions` を描いて押す)
 *
 * ブラウザ版の書き出しは 3 か所 (端末のダウンロード / ライブラリ / PC の指定フォルダ)
 * へ置こうとし、結末を `libraryCopy` / `folderCopy` / `downloaded` として返す。
 * ところが書き出しの後に出る 3 つの操作子はすべて**デスクトップ版の語彙**で話し、
 * **この実行形態で実際に開ける「ライブラリ」をどこも名指ししていなかった**:
 *
 * | 操作子 | ブラウザ版の実測 |
 * | --- | --- |
 * | ファイルを開く | 断る (`data-os-op-error`) —— 名指しするのは「ダウンロードフォルダ」だけ |
 * | 保存先フォルダを開く | 同 |
 * | 保存場所をコピー | **静かに `team-radar-….svg` を置き「✓ コピー済み」と言う** |
 *
 * 働く道が文になるのは**失敗したときだけ** (`DOWNLOAD_FAILED_TEXT` の
 * 「ライブラリから開いて保存し直してください」) —— **成功した人には 1 度も
 * 示されない** (法則 `escape-hatch-stays-open`)。
 *
 * ## だからこの検査は 3 つを見る
 *
 * 1. **実行形態は問わない** —— 欄の有無で決まる (`exportWarning` と同じ規則)。
 *    デスクトップ版の action は `libraryCopy` を返さないので `undefined`。
 * 2. **`⚠` と食い違わない** —— ライブラリに残せていないときは黙る
 *    (`LIBRARY_FAILED_TEXT` が既に述べる)。
 * 3. **母集団** —— `exportWarning` を読む画面は `exportSavedNote` も読む (両方向)。
 */
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripNonCode } from '../../../shared/__tests__/stripNonCode';
import {
  LIBRARY_FAILED_TEXT,
  LIBRARY_HATCH_TEXT,
  exportSavedNote,
  exportWarning,
} from '../exportOutcome';

/** ブラウザ版の書き出しが返す形 (`web-shim.ts` の 4 か所と同じ欄)。 */
function webResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    path: 'team-radar-1758000000000.svg',
    bytes: 4096,
    generatedAt: '2026-09-25T00:00:00.000Z',
    downloaded: true,
    libraryCopy: 'saved',
    folderCopy: 'off',
    ...over,
  };
}
/** デスクトップ版の書き出しが返す形 (`main/clients/*.ts` —— 収まった先の欄を持たない)。 */
const DESKTOP_RESULT = {
  path: '/home/user/Documents/team-radar.svg',
  bytes: 4096,
  generatedAt: '2026-09-25T00:00:00.000Z',
};

/** `exportWarning` / `exportSavedNote` を読む画面 (走査で導く)。 */
const PAGES = ['StocksPage', 'TemplatesPage', 'TeamRadarPage', 'BusinessPage', 'HomePage'] as const;

describe('exportSavedNote — 働く道を名指しする (パス 458)', () => {
  it('ライブラリに残ったら「ライブラリ」の画面を名指しする', () => {
    expect(exportSavedNote(webResult())).toBe(LIBRARY_HATCH_TEXT);
    expect(LIBRARY_HATCH_TEXT).toContain('「ライブラリ」の画面');
  });

  it('★ デスクトップ版は欄が無いので何も言わない (実行形態を問わずに正しくなる)', () => {
    expect(exportSavedNote(DESKTOP_RESULT)).toBeUndefined();
    // 欄が 1 つでも在れば「ブラウザ版の結末」として扱う。
    expect(exportSavedNote({ ...DESKTOP_RESULT, libraryCopy: 'saved' })).toBe(LIBRARY_HATCH_TEXT);
  });

  it('★ ライブラリに残せなかったら黙る —— ⚠ が既にそう述べる', () => {
    const failed = webResult({ libraryCopy: 'failed' });
    expect(exportSavedNote(failed)).toBeUndefined();
    // 同じ入力について ⚠ が述べていること (画面が同じ問いに 2 通り答えない)。
    expect(exportWarning(failed)).toContain(LIBRARY_FAILED_TEXT);
  });

  it('端末へのダウンロードが失敗しても、ライブラリに在れば道は名指しする', () => {
    const r = webResult({ downloaded: false });
    expect(exportSavedNote(r)).toBe(LIBRARY_HATCH_TEXT);
    expect(exportWarning(r)).toBeTruthy();
  });

  it('物でない値・null は何も言わない (別の action / 古い版)', () => {
    for (const v of [null, undefined, 42, 'x', [], true]) {
      expect(exportSavedNote(v), JSON.stringify(v)).toBeUndefined();
    }
  });

  it('★ 母集団: exportWarning を読む画面は exportSavedNote も読む (両方向)', () => {
    const warns: string[] = [];
    const saves: string[] = [];
    for (const f of PAGES) {
      const src = readOriginalSource(`src/renderer/pages/${f}.tsx`);
      if (src.includes('exportWarning(')) warns.push(f);
      if (src.includes('exportSavedNote(')) saves.push(f);
    }
    // 走査が空虚でないこと (針が死んだら鳴る)。
    expect(warns.length).toBeGreaterThanOrEqual(5);
    expect(saves.sort()).toEqual(warns.sort());
  });

  /**
   * ★ **自戒: 最初にここへ書いた主張は空だった** —— `stripNonCode` は
   * **文字列リテラルの中身を落とす**ので (パス 453 で自分で書いた罠)、
   * 日本語の文を code 側で探す `not.toContain` は**どの入力でも通る**。
   * 対照 H (断りを「場所の断定」へ戻す) を当てても鳴らず、そこで気付いた。
   * **断りの文面は振る舞いで測る** (`webShimExportSinks.test.ts`) ——
   * ここは「同じ定数を読んでいる」という、**コードとして見える事**だけを見る。
   */
  it('★ 断りの綴りは 1 つ —— web-shim も同じ定数を読む', () => {
    const code = stripNonCode(readOriginalSource('src/renderer/web-shim.ts'), { keepQuoteChars: true });
    // import 1 + alert 1 + message 1 = 3。**識別子はコードとして残る**
    // (文字列リテラルの中身と違い、`stripNonCode` が落とさない)。
    expect((code.match(/LIBRARY_HATCH_TEXT/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // **写しではなく import であること** —— 同じ文を局所の定数で持っても
    // 振る舞いは変わらないので、そちらは綴りの側でしか見られない
    // (法則 `center-then-count-callers`)。
    expect(code).toMatch(/import\s*\{[^}]*LIBRARY_HATCH_TEXT[^}]*\}\s*from/);
  });
});
