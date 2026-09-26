/**
 * **`MAX_*_CHARS` は「字」である。数える所・切る所を母集団から総当たりする。**
 * (2026-09-13 · パス 195)
 *
 * ## 何を留めているか
 *
 * 定数の名前が `_CHARS` なら単位は**文字**であり、画面もそう刷る (「2000 字まで」)。
 * ところが 2026-09-13 まで、その天井に突き合わせる側・切る側はすべて
 * `String.length` (UTF-16 コード単位) だった。**名前と実装の単位が違っていた。**
 *
 * 実測した害 (`'a' + '😀'.repeat(1000)` = 2001 コード単位 / 1001 文字・天井 2000):
 *
 * - 断りが「1 字超えていた」と言う —— 実際は **999 字下回っている**
 * - 画面の clamp `raw.slice(0, 2000)` がサロゲート対を割り、**孤立サロゲート**が
 *   入力欄と payload に残る (UTF-8 を往復すると `�` に化ける)
 * - main の検証 `note.length > 2000` は 2000 なので**通す** —— 壊れた文字列が保存側へ
 *
 * 実測 47 件 / 20 ファイルが `length` か `slice` で `_CHARS` を扱っていた。
 * 直した後は **0 件**。
 *
 * ## なぜ台帳ではなく走査か
 *
 * 母集団は「`MAX_*_CHARS` を使う所」で、**新しい欄が増えるたびに増える**。
 * 手で並べると足した人が気付かない (パス 107 で母集団を手書きして 3 画面落とした形)。
 * 名前の規則から導けるので、走査で総当たりする。
 *
 * ## 例外の扱い
 *
 * `_CHARS` と名乗る定数はすべて人が読み書きする文字列に掛かり、どれも文字で
 * 数えるのが正しい。**例外は無い。**
 *
 * ## パス 195 でここに書いた主張は誤りだった (2026-09-13 · パス 196)
 *
 * 前日ここには「バイト数や符号単位が要る天井は `_BYTES` / `_ITEMS` など別の名前を
 * 持つ」と書いた。**`_LENGTH` を数えていなかった。** 実測すると `MAX_*_LENGTH` /
 * `*_MAX_LENGTH` が 8 つ在り、そのうち 6 つは**人が貼る文字列の天井で、断りの文面が
 * 「N 文字まで」と言いながら `.length` で数えていた** ——
 * `MAX_PROXY_URL_LENGTH` (1024)・`MAX_PROXY_SECRET_LENGTH` (256)・
 * `MAX_AI_BASE_URL_LENGTH` (2048)・`MAX_SCAN_URL_LENGTH` (2048)・
 * `TOKEN_MAX_LENGTH` (65536)・`PROFILE_MAX_LENGTH` (100)。
 * `tokenInput.ts` は更に `${value.length} 文字` と**刷って**いたので、絵文字の
 * 資格情報では実際の倍の数を見せていた。
 *
 * パス 195 の走査は名前で単位を判断するので、**`_CHARS` でない天井はすべて
 * 走査の外に在った。** 6 つを `_CHARS` へ改名し `countChars` に替えたので、
 * 走査が自動で覆う (新しい規則を足さずに済む)。
 *
 * 残る 2 つは**符号単位のままが正しい** —— OS が符号単位/バイトで上限を持つので、
 * 文字で数えると OS の上限を超える値を通してしまう (下の `UNIT_LEDGER`)。
 *
 * ## 綴りで拾う針は、綴りでない物に動かされる (2026-09-23 · パス 422)
 *
 * 上の走査は**定数の名前**を錨にする。だから名前が `_CHARS` でなければ、
 * 文面が「N 文字」と言っていても見えない。実測 **6 か所**がそこに在った:
 *
 * | 入口 | 天井 | 直す前の実測 |
 * | --- | --- | --- |
 * | 事業名 (`businessUnits`) | `BUSINESS_NAME_MAX` 60 | 絵文字 **31 個 (= 31 文字)** で「60 文字までです」 |
 * | 区分 (同) | `BUSINESS_CATEGORY_MAX` 30 | 絵文字 **16 個**で「30 文字までです」 |
 * | メモ (同) | `BUSINESS_NOTE_MAX` 200 | 同じ形 |
 * | 項目名 (`overviewOverrides`) | `CUSTOM_METRIC_MAX_LABEL` 40 | 絵文字 **21 個**で「40 文字までです」 |
 * | メモ (同) | `CUSTOM_METRIC_MAX_NOTE` 200 | 同じ形 |
 * | 事業名 (`kpiActuals`) | **裸の 64** | 絵文字 **33 個**で「1〜64 文字で入力してください」 |
 *
 * ★ **文面が、その文面を読む利用者に対して証明可能に偽である** —— 31 文字を打った人が
 *   「60 文字までです」と断られる。★ **しかも出口と食い違っていた** —— パス 419 が
 *   同じ 5 つの定数を `displayField` に通したが、`clampToCeiling` は**文字**を数える。
 *   つまり**入口はコード単位・出口は文字**で、パス 359 の「入口が出口より厳しい」の
 *   別の現れである。
 *
 * **だから 2 本目の錨を足した** —— `DECLARED_UNIT` は名前ではなく
 * **その場の文面が名乗る単位**で拾う: 「`${CONST} 文字`」または「`64 文字`」と
 * 述べる文の近くで、その同じ天井を `.length` で比べていたら鳴る。
 * 綴りがどうであれ、**アプリが利用者に約束した単位**で数えているかだけを見る。
 * 6 つ目 (裸の 64) には名前 (`MAX_KPI_UNIT_CHARS`) も付けたので、
 * **上の名前の走査も同時に覆う** (パス 196 と同じ直し方)。
 *
 * ## この走査が見えない所 (対照で実測した死角)
 *
 * **名前で拾う走査は、名前が消えた所を拾えない。** 定数を引数や台帳の欄に
 * 渡し替えた 2 か所は、この走査の外に在る:
 *
 * | 場所 | なぜ見えないか | 代わりに留めている物 |
 * | --- | --- | --- |
 * | `shared/writeFieldLimits.ts` の `checkWriteField` | 天井が `rule.max` (台帳の欄) | `writeFieldLimits.test.ts` の絵文字の境界 (★) |
 * | `components/serviceActionUtils.ts` の `sanitizeNote` | 天井が `maxLen` (引数) | `serviceActionUtils.test.ts` の絵文字の境界 (★) |
 *
 * どちらも**対照を回して実測した** —— `countChars` / `clampToCeiling` を
 * `length` / `slice` に戻しても、この走査は 0 件のまま緑だった。
 * `.length > max` のような形まで拾うと、文字列でない物の件数比較を大量に
 * 誤検知するので、走査は名前で拾うままにし、**2 か所は振る舞いで留めた**
 * (書き方に依らないので、どう書き換えても鳴る)。
 * **走査の死角は、書いておかないと次の人には見えない。**
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const SRC = path.resolve(__dirname, '../..');

/** 走査対象 (test は除く —— 検査の中の標本は意図して壊した文字列を持つ)。 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  // 一覧も原文から取る (sandbox の中でも同じ木を歩く)。
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') sourceFiles(p, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** 単位を取り違えている形。 */
const WRONG: readonly (readonly [RegExp, string])[] = [
  [/\.length\s*(?:>=|<=|>|<|===|!==)\s*(MAX_[A-Z0-9_]*_CHARS)/, 'length で _CHARS と突き合わせている'],
  [/(MAX_[A-Z0-9_]*_CHARS)\s*(?:>=|<=|>|<|===|!==)\s*[A-Za-z0-9_.$[\]']*\.length/, '_CHARS と length を突き合わせている'],
  [/\.(?:slice|substring|substr)\s*\(\s*0\s*,\s*(MAX_[A-Z0-9_]*_CHARS)/, 'コード単位で _CHARS まで切っている'],
];

/** 正しい形 (走査が死んでいないことの床に使う)。 */
const RIGHT = /\b(?:countChars|clampToCeiling|charsOverCeiling)\s*\(/;

/**
 * **符号単位で数えるのが正しい天井** (2026-09-13 · パス 196 / 2026-09-23 · パス 419)。
 *
 * `_LENGTH` / `_LEN` という名前は単位を言わないので、**台帳に載る物だけ**に許す。
 * どれも**外の規格が符号単位かバイトで持っている上限**に当てる関門で、
 * 文字で数えると 256 個の絵文字 (= 512 符号単位) のファイル名が通り、
 * **OS の上限を超えた名前を作りに行く**。人へ出す文面も持たないので
 * 「N 文字」と言って裏切ることもない。
 *
 * **向きが大事である** —— 文字で数えるのが「厳しすぎる」のではなく**緩すぎる**:
 * 絵文字 1 字は UTF-8 で 4 オクテットなので、254 文字のアドレスは 1,016 オクテット
 * になりうる。`_CHARS` へ改名して `countChars` を当てると、その緩みが
 * 「単位を揃えた」という見かけを得てしまう。
 */
const UNIT_LEDGER: Readonly<Record<string, string>> = {
  MAX_FILENAME_LENGTH: 'ファイル名の上限は OS 側が符号単位/バイトで持つ (NTFS 255 UTF-16 単位 / ext4 255 バイト)',
  MAX_SHELL_PATH_LENGTH: 'パスの上限は OS 側が符号単位/バイトで持つ (shell へ渡す前の関門)',
  MAX_MEMBER_EMAIL_LEN: 'RFC 5321 §4.5.3.1.3 の経路 256 オクテット − 山括弧 2。上限はオクテットで、文字数ではない',
  MAX_CONTACT_EMAIL_LEN: '同上 (士業の連絡先。members.ts と同じ規格の同じ数)',
};

/**
 * **文面が名乗る単位で拾う針** (パス 422)。名前ではなく、同じ場所の断りの文が
 * 「N 文字」と述べているかを錨にする。窓はコードの行で数えず**素の行**でよい ——
 * 文面は判定のすぐ後ろ (同じ `if` の本体) に在り、間に注記が挟まっても
 * `stripComments` が空白に潰すので行数は変わらない。
 */
const DECLARED_WINDOW = 6;

/** 文面は「文字」と言うのに、コード単位で比べている形。 */
const DECLARED_WRONG: readonly RegExp[] = [
  /([A-Za-z0-9_.$[\]']+)\.length\s*(?:>=|<=|>|<)\s*([A-Z][A-Z0-9_]*)\b/g,
  /([A-Za-z0-9_.$[\]']+)\.length\s*(?:>=|<=|>|<)\s*(\d+)\b/g,
];

/** 文面も比較も「文字」の形 (走査が死んでいないことの床に使う)。 */
const DECLARED_RIGHT: readonly RegExp[] = [
  /\b(?:moreThanChars|atLeastChars)\s*\([^,]+,\s*([A-Z][A-Z0-9_]*)\s*\)/g,
  /\b(?:moreThanChars|atLeastChars)\s*\([^,]+,\s*(\d+)\s*\)/g,
];

/** その窓が「この天井は N 文字だ」と名乗っているか。 */
function declaresChars(window: string, token: string): boolean {
  // 名前つき: `${CONST} 文字` / 裸の数: `64 文字` (数の途中に当たらないよう前を見る)。
  const named = new RegExp(`\\$\\{${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\s*文字`);
  if (named.test(window)) return true;
  if (!/^\d+$/.test(token)) return false;
  return new RegExp(`(?<!\\d)${token}\\s*文字`).test(window);
}

/**
 * **文面が「N 文字」と名乗りながらコード単位で数えてよい所** (両方向・今日 **0 件**)。
 *
 * 空なのは「要らない」ではない —— 次に 1 つ生えたらここへ理由を書くことになり、
 * 消し忘れれば「鳴らないのに台帳に在る」で落ちる。
 */
const DECLARED_UNIT_LEDGER: Readonly<Record<string, string>> = {};

interface Hit {
  readonly where: string;
  readonly why: string;
  readonly line: string;
}

function scan(): { wrong: Hit[]; right: number; filesWithChars: number; lengthNames: Hit[] } {
  const wrong: Hit[] = [];
  const lengthNames: Hit[] = [];
  let right = 0;
  let filesWithChars = 0;
  for (const f of sourceFiles(SRC)) {
    // **原文を読む** —— `mutate` 台帳のファイルは変異検査の sandbox で書き換わるので、
    // 生の `readFileSync` だと走査が 0 件になり空の検査になる (`originalSource.ts`)。
    const src = stripComments(readOriginalSource(f));
    if (/MAX_[A-Z0-9_]*_CHARS/.test(src)) filesWithChars++;
    src.split('\n').forEach((line, i) => {
      for (const [re, why] of WRONG) {
        if (re.test(line)) {
          wrong.push({ where: `${path.relative(SRC, f)}:${i + 1}`, why, line: line.trim() });
        }
      }
      if (RIGHT.test(line)) right++;
      // **単位を言わない名前**を宣言している所を集める (台帳と突き合わせる)。
      const decl = /export const ((?:MAX_[A-Z0-9_]*|[A-Z0-9_]+_MAX)_(?:LENGTH|LEN))\b/.exec(line);
      if (decl !== null) {
        lengthNames.push({ where: `${path.relative(SRC, f)}:${i + 1}`, why: decl[1]!, line: line.trim() });
      }
    });
  }
  return { wrong, right, filesWithChars, lengthNames };
}

/** 文面が名乗る単位で走査する (パス 422)。名前ではなく約束した単位を錨にする。 */
function scanDeclared(): { wrong: Hit[]; right: number } {
  const wrong: Hit[] = [];
  let right = 0;
  for (const f of sourceFiles(SRC)) {
    const lines = stripComments(readOriginalSource(f)).split('\n');
    lines.forEach((line, i) => {
      const win = lines.slice(i, i + DECLARED_WINDOW).join('\n');
      for (const re of DECLARED_WRONG) {
        for (const m of line.matchAll(re)) {
          if (declaresChars(win, m[2]!)) {
            wrong.push({
              where: `${path.relative(SRC, f)}:${i + 1}`,
              why: `文面は「${m[2]!} 文字」と言うのに ${m[1]!}.length (コード単位) で比べている`,
              line: line.trim(),
            });
          }
        }
      }
      for (const re of DECLARED_RIGHT) {
        for (const m of line.matchAll(re)) if (declaresChars(win, m[1]!)) right++;
      }
    });
  }
  return { wrong, right };
}

describe('天井の単位 — `MAX_*_CHARS` は文字で数え、文字で切る', () => {
  const { wrong, right, filesWithChars, lengthNames } = scan();

  it('走査が実物に届いている (空撃ちでない)', () => {
    // `_CHARS` を使うファイルが十分ある / 正しい呼び出しも十分ある。
    // **床を実測より高くすると落ちる** (2026-09-13 実測: 44 ファイル / 111 行)。
    expect(filesWithChars, '_CHARS を使うファイルが見つからない — 走査が死んでいる').toBeGreaterThan(25);
    expect(right, 'countChars / clampToCeiling / charsOverCeiling が 1 つも無い').toBeGreaterThan(60);
  });

  it('★ コード単位で `_CHARS` を数える・切る箇所は 0 件', () => {
    const report = wrong.map((h) => `  ${h.where}  ${h.why}\n    ${h.line}`).join('\n');
    expect(
      wrong,
      `天井の単位が「字」でない箇所があります (countChars / clampToCeiling を使ってください):\n${report}`,
    ).toEqual([]);
  });

  it('★ 単位を言わない名前 (`_LENGTH` / `_LEN`) は台帳に載る物だけ', () => {
    // 名前で単位を判断する走査にとって、`_LENGTH` は**読めない名前**である。
    // 人が貼る文字列の天井なら `_CHARS` と名乗り `countChars` で数える;
    // OS の制約に当てる 2 つだけ、理由つきで符号単位を許す。
    const unexpected = lengthNames.filter((h) => !(h.why in UNIT_LEDGER));
    const report = unexpected.map((h) => `  ${h.where}  ${h.why}\n    ${h.line}`).join('\n');
    expect(
      unexpected,
      '単位を言わない天井の名前があります。文字で数えるなら `_CHARS` へ改名し'
        + ` countChars を使ってください (符号単位が正しいなら UNIT_LEDGER に理由を書く):\n${report}`,
    ).toEqual([]);
    // 台帳の側も死んでいないこと —— 載っている物はすべて実在する
    // (消えた定数が台帳に残ると、次に足された 1 つを隠す)。
    expect(new Set(lengthNames.map((h) => h.why))).toEqual(new Set(Object.keys(UNIT_LEDGER)));
  });

  it('★ 対照: 走査は取り違えた形を拾う (綴り違いで黙っていない)', () => {
    // 標本 —— 直す前に実在した 3 つの形。どれも 1 行ごとに当たる。
    const samples = [
      "  if (typeof p.note !== 'string' || p.note.length > MAX_RECORD_NOTE_CHARS) {",
      '  if (MAX_MEMBER_NOTE_CHARS < text.length) return null;',
      '      setNote(raw.slice(0, MAX_RECORD_NOTE_CHARS));',
    ];
    for (const s of samples) {
      expect(
        WRONG.some(([re]) => re.test(s)),
        s,
      ).toBe(true);
    }
    // 対照の対照 —— 直した形は拾わない。
    const fixed = [
      "  if (typeof p.note !== 'string' || countChars(p.note) > MAX_RECORD_NOTE_CHARS) {",
      '      setNote(clampToCeiling(raw, MAX_RECORD_NOTE_CHARS));',
      '  const over = charsOverCeiling(raw, MAX_RECORD_NOTE_CHARS);',
      '  const bytes = buf.length > MAX_RESPONSE_BYTES;', // `_CHARS` でない天井は対象外
    ];
    for (const s of fixed) {
      expect(
        WRONG.some(([re]) => re.test(s)),
        s,
      ).toBe(false);
    }
  });

  // --- 2 本目の錨: 文面が名乗る単位 (パス 422) --------------------------------

  const declared = scanDeclared();

  it('★ 文面が「N 文字」と名乗るのにコード単位で数える箇所は 0 件', () => {
    const unexpected = declared.wrong.filter((h) => !(h.where in DECLARED_UNIT_LEDGER));
    const report = unexpected.map((h) => `  ${h.where}  ${h.why}\n    ${h.line}`).join('\n');
    expect(
      unexpected,
      'アプリが利用者に約束した単位と、実際に数える単位が違います'
        + ` (moreThanChars / atLeastChars を使ってください):\n${report}`,
    ).toEqual([]);
    // 台帳の側も両方向 —— 鳴らなくなった行が残っていると、次の 1 件を隠す。
    const found = new Set(declared.wrong.map((h) => h.where));
    for (const k of Object.keys(DECLARED_UNIT_LEDGER)) {
      expect(found.has(k), `${k} はもう鳴らない —— DECLARED_UNIT_LEDGER から消すこと`).toBe(true);
    }
  });

  it('★ この走査が空撃ちでない (文面と比較が揃っている所を実際に数えている)', () => {
    // 2026-09-23 (パス 422) 実測 14 件。床はその 7 割 —— 「0 件」が自明に真に
    // ならないための物で、実測に張り付けると正しい削除で落ちる (パス 378 の形)。
    expect(
      declared.right,
      '文面が「N 文字」と名乗る天井が 1 つも見つからない —— 走査が死んでいる',
    ).toBeGreaterThanOrEqual(10);
  });

  it('★ 対照: 針はパス 422 で直した 6 つの形を拾い、直した形は拾わない', () => {
    // 直す前に実在した形 (名前つき 5 + 裸の数 1)。
    const broken: readonly (readonly [string, string])[] = [
      ['  if (name.length > BUSINESS_NAME_MAX) {', '    return { ok: false, reason: `事業名は ${BUSINESS_NAME_MAX} 文字までです。` };'],
      ['  if (label.length > CUSTOM_METRIC_MAX_LABEL) {', '    return { ok: false, reason: `項目名は ${CUSTOM_METRIC_MAX_LABEL} 文字までです。` };'],
      ["  if (unit.length === 0 || unit.length > 64) throw new Error('事業名は 1〜64 文字で入力してください');", ''],
    ];
    for (const [head, body] of broken) {
      const win = `${head}\n${body}`;
      const hit = DECLARED_WRONG.some((re) =>
        [...head.matchAll(re)].some((m) => declaresChars(win, m[2]!)),
      );
      expect(hit, head).toBe(true);
    }
    // 直した形は拾わない。
    const fixedNow: readonly (readonly [string, string])[] = [
      ['  if (moreThanChars(name, BUSINESS_NAME_MAX)) {', '    return { ok: false, reason: `事業名は ${BUSINESS_NAME_MAX} 文字までです。` };'],
      ['  if (moreThanChars(unit, MAX_KPI_UNIT_CHARS)) {', '    throw new Error(`事業名は 1〜${MAX_KPI_UNIT_CHARS} 文字で入力してください`);'],
      // 文面が「文字」と言わない天井は対象外 (件数・バイト)。
      ['  if (obj.recommendations.length > MAX_ADVISOR_RECOMMENDATIONS) {', '    throw new Error(`推奨は ${MAX_ADVISOR_RECOMMENDATIONS} 件までです`);'],
      ['  if (buf.length > MAX_RESPONSE_BYTES) {', '    throw new Error(`応答は ${MAX_RESPONSE_BYTES} バイトまでです`);'],
    ];
    for (const [head, body] of fixedNow) {
      const win = `${head}\n${body}`;
      const hit = DECLARED_WRONG.some((re) =>
        [...head.matchAll(re)].some((m) => declaresChars(win, m[2]!)),
      );
      expect(hit, head).toBe(false);
    }
  });
});
