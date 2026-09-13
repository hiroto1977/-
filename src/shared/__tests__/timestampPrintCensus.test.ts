/**
 * **時刻を刷る所は、刷る前に読む** (2026-09-12 · パス 185)。
 *
 * ## 実測 (直す前)
 *
 * 保存値・取得値から `Date` を作って刷る所は **7 か所**あり、読めない値を
 * 断っていたのは **1 か所だけ**だった:
 *
 * | 場所 | 直す前 | 読めない値が来る道 |
 * | --- | --- | --- |
 * | `renderer/data/backup.ts` (`backupExportedAt`) | **断っていた** (`Number.isFinite(Date.parse(v))` · パス 129) | 手で直したバックアップ |
 * | `pages/CalendarPage.tsx` (予定の開始) | 素の `new Date` | 取得側が `e.start.dateTime ?? ''` と倒す |
 * | `pages/KpiPage.tsx` (記録の作成時刻) | 素の `new Date` | 封筒の `createdAt` は `Number.isFinite` だけ (`1e20` が通る) |
 * | `pages/EmotionsPage.tsx` (分析の時刻) | 素の `new Date` | 同上 (`emotionsShape` も `Number.isFinite`) |
 * | `pages/YoutubePage.tsx` (公開日) | 素の `new Date` | API の文字列 |
 * | `components/CloudSyncPanel.tsx` (最終同期) | `try`/`catch` —— **捕まえられない** | 保存した数字 |
 * | `components/ServiceActionPanel.tsx` (記録した時刻) | 素の `new Date` | action の戻り値 |
 *
 * `CloudSyncPanel` の `try` は形だけだった: `new Date(1e20)` は**例外を投げず**、
 * `toLocaleString` が `Invalid Date` を返すだけなので `catch` は一度も走らない
 * (パス 12 の「守っている向きが違う」)。
 *
 * ## 規則
 *
 * `src/` (`__tests__` を除く) で、**`new Date(...)` の結果に直接 `toLocale…` を
 * 呼ぶ**形を禁じる。時刻は `shared/isoDate.ts` の `parseTimestamp` で読み、
 * `null` なら読めないことを言う。`new Date()` (引数なし = 現在時刻) は
 * 読む対象が無いので規則の外。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const SRC = path.resolve(__dirname, '../..');

/**
 * 走査本体 (標本を当てられるように、文字列を受ける純関数)。
 *
 * 行コメント・ブロックコメント・文字列リテラルを落としてから当てる ——
 * **この散文自身が同じ字面を含んでいる**ので、落とさないと自分で鳴る
 * (パス 181 で `lint:forbidden` に同じことをされた)。
 */
/**
 * コメントと文字列リテラルを落とす —— **1 度で走る小さな走査器**。
 *
 * **並べた `replace` では壊れる** (2026-09-12 · パス 188 で気付いた)。パス 185 は
 * ブロック → 行 → テンプレート → `'` → `"` の順で置換していたが、
 * **行コメントの規則が文字列の中の `https://…` にも当たる**ので、
 *
 *     const url = 'https://api.cursor.com/teams/daily-usage-data';
 *
 * は `const url = 'https:` になり、**閉じない引用符**が残る。その引用符は次の
 * 引用符と対にされ、**間に挟まれた本物のコードが丸ごと消える**。
 *
 * 実測: この壊れ方のせいで、`shared/api/cursor.ts` を元の (守りの無い) 形へ
 * 戻した対照が**鳴らなかった** —— 走査はそのファイルの後半を見ていなかった。
 * **対照が、私が広げた規則ではなく、前から在った走査の欠陥を教えた。**
 *
 * 状態を持って 1 度歩けば、どの規則も互いを壊せない。
 */
export function stripNonCode(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (two === '/*') {
      i += 2;
      while (i < src.length && src.slice(i, i + 2) !== '*/') i += 1;
      i += 2;
      continue;
    }
    const ch = src[i]!;
    if (ch === "'" || ch === '"' || ch === '`') {
      i += 1;
      while (i < src.length && src[i] !== ch) {
        // バックスラッシュの次の 1 文字は中身として飛ばす。
        i += src[i] === '\\' ? 2 : 1;
      }
      i += 1;
      // 中身は落とすが、**引用符は残す** (字面の境界が消えると
      // `new Date('x').getHours()` のような形が繋がって見える)。
      out += `${ch}${ch}`;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * **`Date` から読み出す口の一覧** (2026-09-12 · パス 188 で広げた)。
 *
 * パス 185 は `toLocale…` だけを見ていた。だが**同じ害は暦の部品を読む形にも
 * 在り、`toISOString` はさらに悪い**:
 *
 * | 読み口 | 読めない `Date` での振る舞い |
 * | --- | --- |
 * | `toLocaleString` ほか | 英語で `Invalid Date` を返す (刷られる) |
 * | `getFullYear` / `getHours` ほか | `NaN` を返す (`NaN/NaN/NaN NaN:NaN` と刷られる) |
 * | **`toISOString`** | **`RangeError: Invalid time value` を投げる** |
 *
 * 実測 (2026-09-12): この広げた規則に当たる 7 か所のうち **1 つも守られて
 * いなかった**。中でも `shared/api/cursor.ts` の `normalizeUsage` は
 * `api.cursor.com` の JSON の `date` をそのまま `toISOString` の側へ渡しており、
 * **1 行の日付が読めないだけで取得そのものが失敗する** (`1e20` は有効な JSON で
 * `Number.isFinite` を通る)。`getTime` は入れない —— 読めない値は `NaN` になるが、
 * そこから先の算術は `Number.isFinite` で判定されるのが普通で、刷る口ではない。
 */
const READERS = 'toLocale|getFullYear|getMonth|getDate|getDay|getHours|getMinutes|getSeconds|toISOString|toJSON';

export function rawDatePrints(src: string): string[] {
  const code = stripNonCode(src);
  const out: string[] = [];
  // (a) 直に繋いだ形: new Date(<引数あり>) から**読む**形。
  for (const m of code.matchAll(new RegExp(`new Date\\(\\s*[^)\\s][^)]*\\)\\s*\\.\\s*(?:${READERS})`, 'g'))) out.push(m[0]);
  /*
   * (b) **変数に置いてから刷る形。**
   *
   * これは後から足した —— 対照 C1 で「元の形」に戻したら (a) だけの規則は
   * **鳴らなかった**。`CalendarPage` の直す前のコードはまさに
   * `const d = new Date(startDate);` → `return d.toLocaleString(…)` の 2 段で、
   * **このパスを始めた当の欠陥を規則が見逃していた** (パス 183 の対照 C3 と
   * 同じ、「対照が私の検査の欠陥を教えた」形)。
   */
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new Date\(\s*([^)\s][^)]*)\)/g)) {
    const name = m[1]!;
    // **「今」の写しは投げも NaN も作れない** —— 引数が同じファイルで
    // `new Date()` (引数なし) を受けた識別子なら、それは必ず有効な Date である
    // (`new Date(<Date>)` は複製)。これは規則の穴ではなく、**危なくない形を
    // 台帳の免除ではなく判定で外す**ためのもの。実測で `EmotionsPage` の
    // 30 日スパークラインがこの形 (`const today = new Date();` →
    // `const d = new Date(today);` → `d.setDate(d.getDate() - i)`)。
    if (isCopyOfNow(m[2]!.trim(), code)) continue;
    if (new RegExp(`\\b${name}\\s*\\.\\s*(?:${READERS})`).test(code)) out.push(m[0]);
  }
  return out;
}

/** 引数が、同じ範囲で `new Date()` (引数なし) を受けた識別子か。 */
function isCopyOfNow(arg: string, code: string): boolean {
  if (!/^[A-Za-z_$][\w$]*$/.test(arg)) return false;
  return new RegExp(`(?:const|let|var)\\s+${arg}\\s*=\\s*new Date\\(\\s*\\)`).test(code);
}

/** `src/` を歩いて、規則に当たる行を持つファイルを集める。 */
function scan(dir: string, rel = ''): { file: string; hits: string[] }[] {
  const out: { file: string; hits: string[] }[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      out.push(...scan(path.join(dir, e.name), r));
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      const hits = rawDatePrints(readOriginalSource(path.join(dir, e.name)));
      if (hits.length > 0) out.push({ file: r, hits });
    }
  }
  return out;
}

describe('時刻を刷る所の母集団 (パス 185)', () => {
  it('★ 素の `new Date(x).toLocale…` は 1 か所も無い', () => {
    expect(scan(SRC).map((h) => `${h.file}: ${h.hits.join(' / ')}`)).toEqual([]);
  });

  /*
   * **陰性対照** —— 規則が直す前の形に当たることを標本で見る。
   * 走査が空を返すだけの検査になっていないことの確認である。
   */
  it('★ 対照: 直す前の 4 つの形はどれも規則に当たる', () => {
    expect(rawDatePrints("new Date(startDate).toLocaleString('ja-JP')")).toHaveLength(1);
    expect(rawDatePrints('new Date(ms).toLocaleString()')).toHaveLength(1);
    expect(rawDatePrints("new Date(v.publishedAt).toLocaleDateString('ja-JP')")).toHaveLength(1);
    // **2 段の形** —— `CalendarPage` が直す前に書いていた形そのもの。
    expect(
      rawDatePrints("const d = new Date(startDate);\nreturn d.toLocaleString('ja-JP', {});"),
    ).toHaveLength(1);
  });

  it('★ 対照: 現在時刻 (`new Date()`) と、読んでから刷る形は当たらない', () => {
    expect(rawDatePrints('new Date().toLocaleString()')).toEqual([]);
    // 2 段でも、刷らない (計算にだけ使う) なら当たらない。
    expect(rawDatePrints('const probe = new Date(Date.UTC(y, m, d));\nreturn probe.getUTCDate();')).toEqual([]);
    expect(rawDatePrints("parseTimestamp(v)?.toLocaleString('ja-JP') ?? '時刻不明'")).toEqual([]);
    // 散文の中に同じ字面が在っても当たらない (この検査自身がそう書いている)。
    expect(rawDatePrints("// new Date(x).toLocaleString() は禁止")).toEqual([]);
    expect(rawDatePrints("/* new Date(x).toLocaleString() */")).toEqual([]);
  });

  /**
   * **「今」の写しを外す判定に、両方向の標本を添える** (パス 188)。
   * 片方向だけ見ると「何にも当たらない規則」になりうる。
   */
  it('★ 対照: `new Date()` の写しは当たらないが、値から作った Date は当たる', () => {
    // 免除される形 (EmotionsPage の 30 日スパークライン)。
    expect(
      rawDatePrints('const today = new Date();\nconst d = new Date(today);\nd.setDate(d.getDate() - i);'),
    ).toEqual([]);
    // **同じ綴りでも、値から作っていれば当たる** —— 免除が広すぎないこと。
    expect(
      rawDatePrints('const today = payload.at;\nconst d = new Date(today);\nreturn d.getFullYear();'),
    ).toHaveLength(1);
    // 引数が式なら免除しない。
    expect(rawDatePrints('const d = new Date(today + 1);\nreturn d.getHours();')).toHaveLength(1);
  });

  it('★ 対照: パス 188 で広げた 3 つの読み口はどれも当たる', () => {
    expect(rawDatePrints('new Date(ts).getFullYear()')).toHaveLength(1);
    expect(rawDatePrints('new Date(epochMs as number).toISOString().slice(0, 10)')).toHaveLength(1);
    expect(rawDatePrints('const d = new Date(ms);\nreturn p(d.getHours());')).toHaveLength(1);
    // 直した形は当たらない (共有の判定を通している)。
    expect(rawDatePrints("const d = parseTimestamp(ts);\nreturn d.getFullYear();")).toEqual([]);
    expect(rawDatePrints("isoDateFromTimestamp(epochMs) ?? ''")).toEqual([]);
  });

  /**
   * **走査器そのものの対照** (パス 188)。並べた `replace` だと URL の `//` で
   * 文字列が切れ、閉じない引用符が後続のコードを食った —— それで実ファイルの
   * 欠陥が見えなくなっていた。**この検査はその壊れ方を直接再現する。**
   */
  it('★ 対照: URL を含む文字列の後ろのコードも見える (走査器が食わない)', () => {
    const sample = [
      "const url = 'https://api.cursor.com/teams/daily-usage-data';",
      'return new Date(epochMs as number).toISOString();',
    ].join('\n');
    // 直す前の並べた replace はここで空を返した (URL の // で切れ、引用符が残った)。
    expect(rawDatePrints(sample)).toHaveLength(1);
    // 走査器の単体: 文字列の中身は落ちるが、境界の引用符は残り、後続は残る。
    expect(stripNonCode("const u = 'a//b';\nconst v = 1;")).toBe("const u = '';\nconst v = 1;");
    expect(stripNonCode('// 行コメント\nconst v = 1;')).toBe('\nconst v = 1;');
    expect(stripNonCode('/* 塊 */const v = 1;')).toBe('const v = 1;');
    // 逃した引用符も飲み込まない。
    expect(stripNonCode("const s = 'a\\'b';\nconst v = 2;")).toBe("const s = '';\nconst v = 2;");
  });

  it('★ 走査が実ファイルを読めている (0 ファイルで通る検査になっていない)', () => {
    let files = 0;
    const count = (dir: string): void => {
      for (const e of readOriginalDirEntries(dir)) {
        if (e.isDirectory()) {
          if (e.name !== '__tests__') count(path.join(dir, e.name));
        } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) files += 1;
      }
    };
    count(SRC);
    expect(files).toBeGreaterThan(300);
  });
});
