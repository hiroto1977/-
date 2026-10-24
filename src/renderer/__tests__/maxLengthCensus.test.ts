/**
 * **`maxLength` 属性は関門ではない。だから入力欄に置かない。** (2026-09-13 · パス 197)
 *
 * ## 実機 chromium で測った挙動
 *
 * | 入力 | 天井 | 結果 | 孤立サロゲート |
 * | --- | --- | --- | --- |
 * | 😀😀😀 を貼る | 5 | `😀😀` (4 コード単位 / 2 字) | **無し** |
 * | abcd を打った後 😀 | 5 | `abcd` (絵文字は丸ごと拒否・理由は出ない) | 無し |
 * | abcdefgh を打つ | 5 | `abcde` | 無し |
 * | `el.value = '😀'.repeat(6)` | 5 | 12 単位すべて残る・`validity.tooLong === false` | 無し |
 *
 * 読み方:
 *
 * 1. **数えるのはコード単位** —— 「5 字」の欄が絵文字 2 つで満杯になる。
 * 2. **文字は壊さない** —— chromium はコードポイントの境界で止める。パス 195 で
 *    JS 側から消した孤立サロゲートが、ブラウザ側から入り直す道は**無い**
 *    (事前に疑った害で、実測して**外れた**)。
 * 3. **超えた貼り付けを黙って切る** —— 3 つ貼って 2 つ。画面に何も出ない。
 * 4. **1 単位だけ余ると絵文字が打てない** —— 理由は何も出ない。
 * 5. **関門ではない** —— プログラムで入れた超過値は素通りし `validity.tooLong` も
 *    `false`。つまり「画面が止めるから検証は要らない」は成り立たず、逆に
 *    **画面が先に切るので実装側の断りへ永久に届かない**。
 *
 * ## だから何を要求するか
 *
 * 人が打つ・貼る欄に `maxLength` を置かない。天井は
 * (a) 送る/保存する側が `countChars` で**断り**、
 * (b) 画面は `CeilingNotice` で**述べる**、
 * (c) ボタンは超過中 `disabled`。
 * これはパス 167/168/172/175/183 が 38 欄で決めた形で、残っていた 16 欄を
 * パス 197 で揃えた。
 *
 * ## 例外は 1 つだけ (構造で決まる長さ)
 *
 * `TemplatesPage` の色欄 `maxLength={7}` —— `#RRGGBB` は**構造上ちょうど 7 字**で、
 * 「切られると別の色になる」のではなく「7 字でない物は色ではない」。下流に
 * 本物の関門が在る (`isHexColor` (main) / `safeColor` (ブラウザ版)) ので、
 * 属性はブラウザに早く教える役だけを持つ。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const RENDERER = path.resolve(__dirname, '..');

/**
 * **構造で長さが決まる欄だけ** `maxLength` を許す。
 * 鍵は `ファイル:属性の値`、値は理由 (空文字は許さない)。
 */
const STRUCTURAL_LENGTH: Readonly<Record<string, string>> = {
  'pages/TemplatesPage.tsx:7':
    '#RRGGBB は構造上ちょうど 7 字。切られた値は「別の色」ではなく「色でない」ので、'
    + '下流の isHexColor / safeColor が本物の関門を持つ',
};

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') tsxFiles(p, out);
      continue;
    }
    if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

interface Hit {
  readonly key: string;
  readonly where: string;
  readonly line: string;
}

function scan(): { hits: Hit[]; files: number; notices: number } {
  const hits: Hit[] = [];
  let files = 0;
  let notices = 0;
  for (const f of tsxFiles(RENDERER)) {
    files++;
    const rel = path.relative(RENDERER, f);
    const src = stripComments(readOriginalSource(f));
    src.split('\n').forEach((line, i) => {
      const m = /maxLength=\{([^}]+)\}/.exec(line);
      if (m !== null) {
        hits.push({ key: `${rel}:${m[1]!.trim()}`, where: `${rel}:${i + 1}`, line: line.trim() });
      }
      if (/<CeilingNotice\b/.test(line)) notices++;
    });
  }
  return { hits, files, notices };
}

describe('`maxLength` は入力欄に置かない (関門ではないから)', () => {
  const { hits, files, notices } = scan();

  it('走査が実物に届いている (空撃ちでない)', () => {
    // **床を実測より高くすると落ちる** (2026-09-13 実測: 106 ファイル / 通知 58 件)。
    expect(files, '.tsx が見つからない — 走査が死んでいる').toBeGreaterThan(80);
    expect(notices, 'CeilingNotice が 1 つも無い — 直しの側が死んでいる').toBeGreaterThan(40);
  });

  it('★ `maxLength` は構造で決まる 1 欄だけ', () => {
    const unexpected = hits.filter((h) => !(h.key in STRUCTURAL_LENGTH));
    const report = unexpected.map((h) => `  ${h.where}\n    ${h.line}`).join('\n');
    expect(
      unexpected,
      'maxLength は関門ではありません (超えた貼り付けを黙って切るだけで、'
        + 'プログラムで入れた値は素通りします)。天井は送る側が countChars で断り、'
        + `画面は CeilingNotice で述べてください:\n${report}`,
    ).toEqual([]);
  });

  it('★ 台帳の側も死んでいない (許した欄は実在する)', () => {
    // 例外が消えたら台帳から外す —— 「要らない穴」を残さない
    // (`lint:forbidden` が同じ規則を持つ)。
    expect(new Set(hits.map((h) => h.key))).toEqual(new Set(Object.keys(STRUCTURAL_LENGTH)));
    for (const [key, why] of Object.entries(STRUCTURAL_LENGTH)) {
      expect(why.length, `${key} の理由が空`).toBeGreaterThan(20);
    }
  });

  /*
   * **足した関門に呼び手が在ることを留める** (パス 197)。
   *
   * これは**字面の走査**で、描いて押す検査ではない —— `GoogleOAuthSection` を
   * jsdom で動かすには保管庫・`pkceSession`・`serviceHub` の代役が要り、
   * この節のためだけに用意すると検査の方が仕掛けだらけになる。
   * 代わりに「関門に呼び手が居る」ことを最小限で留め、**判定そのものの正しさは
   * 単体検査が持つ** (`callbackPaste.test.ts` / `templateFieldCeiling.test.ts`)。
   * ブラウザ版の書き出しは invoke の経路で本物を押している
   * (`templateFieldCeiling.test.ts` の後半)。
   *
   * パス 197 で足した関門はどれも「今まで誰も強制していなかった天井」なので、
   * 呼び手が消えると**元の状態 (天井が実質無い) に戻る**。だから字面でも留める。
   */
  it('★ 足した関門に呼び手が居る (口だけにしない)', () => {
    const settings = readOriginalSource(path.join(RENDERER, 'pages/SettingsPage.tsx'));
    const stripped = stripComments(settings);
    // start() と complete() の 2 か所。
    const calls = stripped.match(/oauthFieldTooLong\(/g) ?? [];
    expect(calls.length, 'oauthFieldTooLong の呼び手が足りない (start / complete の 2 か所)').toBeGreaterThanOrEqual(2);

    const shim = stripComments(readOriginalSource(path.resolve(RENDERER, 'web-shim.ts')));
    expect(shim, 'ブラウザ版の書き出しがテンプレートの天井を見ていない').toMatch(/tooLongTemplateFields\(/);
  });

  it('★ 対照: 走査は `maxLength` を拾い、注記の中の字面は拾わない', () => {
    const sample = '            maxLength={MAX_TICKER_CHARS}';
    expect(/maxLength=\{([^}]+)\}/.test(sample)).toBe(true);
    // コメントの中は潰れる (パス 195/196 の注記が `maxLength={2000}` に触れている)。
    const commented = stripComments(' * 入力欄は `maxLength={2000}` を字面で持っていた。\n');
    expect(/maxLength=\{/.test(commented)).toBe(true); // 行コメントでない単独行は残る
    const block = stripComments('/**\n * `maxLength={2000}` を持っていた\n */\n');
    expect(/maxLength=\{/.test(block)).toBe(false);
  });
});
