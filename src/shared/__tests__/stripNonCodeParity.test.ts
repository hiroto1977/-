/**
 * **`stripNonCode` は 2 か所に在る。同じ標本で 1 字も違わないこと。** (2026-09-23 · パス 418)
 *
 * パス 417 で `.ts` の死角を閉じた —— テンプレートリテラルを**補間ごと**落としていたので
 * `` `…${salesNoteText(e)}` `` がどの走査にも映らず、**素の読みへ戻しても映らない**
 * 両方向の盲目だった。このリポジトリは利用者に見せる文をテンプレートで組むので、
 * そこは「散文」ではなく**最も危ない式が並ぶ場所**である。
 *
 * ## 写しは避けられないが、割れるのは避けられる
 *
 * `.cjs` のゲートは `.ts` を require できないので、同じ算法が 2 つ在る
 * (**パス 452 まで 3 つだった** —— 下の「写しを 1 つ減らした」を見よ)。
 * 前例は `scripts/inject-pwa.cjs` の `#[0-9a-fA-F]{6}` (パス 363) で、そこは
 * **台帳 + 同じ標本を両方に通すパリティ検査**で縛ってある。`stripNonCode` には
 * **どちらも無かった** —— だから `.ts` だけを直しても `.cjs` の 2 つは古い形のままで、
 * 気付く機械が 1 つも無い。
 *
 * ## `.cjs` の 2 つは今日の判定を変えない (実測してから直した)
 *
 * 2026-09-23 の実測: 両方の `.cjs` を「補間を残す」形へ替えても
 * **2 つのゲートの判定は 1 行も変わらなかった** (`lint:collection-time` /
 * `lint:test-coverage` の出力を before / after で diff)。
 *
 * | 写し | 今日の死角の実測 |
 * | --- | --- |
 * | `lint-test-coverage.cjs` | **0 件** —— DOM の語が補間の中だけに出る検査ファイルは **0 本** |
 * | `lint-collection-time-tests.cjs` | **0 件** —— 判定が変わらない (行単位・列に依らない走査) |
 *
 * つまりこれは**罠の除去**であって生きた欠陥の修復ではない。それでも揃えるのは、
 * **`.ts` の側で「この死角は実物を隠す」ことが既に実測された**からである
 * (法則 `copy-pinned-by-parity`)。
 *
 * ## 写しを 1 つ減らした (2026-09-24 · パス 452)
 *
 * パス 418 の時点で `.cjs` の写しは**ゲートごとに 1 つずつ**在った。3 人目の消費者
 * (`lint-credential-use.cjs` —— 針を `ctx.token` へ替えるのに要る) が現れたとき、
 * 素直に写すと **4 つ目**になる。写す代わりに `scripts/lib/strip-non-code.cjs` へ出し、
 * 2 つのゲートはそこを require する。**判定は 1 行も変わらない** (実測: 両ゲートの
 * 出力を before / after で diff して同一)。
 *
 * ★ **そのとき、この検査の走査自身の死角が出た** —— 母集団の走査は
 * `['src/shared/__tests__', 'scripts']` を**直下だけ**歩いており
 * (`if (e.isDirectory()) continue;`)、`scripts/lib/` は既に在るのに 1 度も見ていなかった。
 * つまり**写しを 1 階層下へ動かすだけで、両方向の台帳が黙る**。今日そこに写しは
 * 無かったので生きた欠陥ではないが、**私はまさにそこへ動かそうとしていた**。
 * 走査を再帰にした (対照: 再帰をやめると新しい置き場所が母集団から消える)。
 *
 * ## ここで見るもの
 *
 * - ★ 2 つの実装が**同じ標本で同じ文字列**を返す (片方だけ直したら鳴る)。
 * - ★ 母集団は**走査で導く** (再帰) —— 3 つ目の写しが生えたら台帳に無いので鳴り、
 *   台帳の行が実物から消えても鳴る (両方向)。
 * - ★ 2 つのゲートが**同じ関数の実体**を読んでいる (写しを作り直したら同一性が壊れる)。
 * - ★ 標本が**的に当たる** (走査が空虚でない床 —— どの標本も少なくとも 1 つ何かを落とす)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { stripNonCode } from './stripNonCode';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO = path.resolve(__dirname, '../../..');

/** 同じ算法を持つ実装の台帳。**両方向** —— 増えても消えても鳴る。 */
const COPIES: readonly { readonly file: string; readonly why: string }[] = [
  {
    file: 'src/shared/__tests__/stripNonCode.ts',
    why: '本体。`.ts` の走査 (ceilingUnitCensus / ceilingLiteralCensus / timestampPrintCensus / deadlineCensus / storedNoteReads) が読む',
  },
  {
    file: 'scripts/lib/strip-non-code.cjs',
    why: '`.cjs` は `.ts` を require できない。ゲート 3 本 (lint-collection-time-tests / lint-test-coverage / lint-credential-use) が**ここ 1 つ**を読む (パス 452 で 3 つの写しから畳んだ)',
  },
];

interface Impl {
  readonly file: string;
  readonly fn: (src: string, opts?: { keepQuoteChars?: boolean }) => string;
}

function loadCopies(): Impl[] {
  return [
    { file: 'src/shared/__tests__/stripNonCode.ts', fn: stripNonCode },
    {
      file: 'scripts/lib/strip-non-code.cjs',
      fn: (require(path.join(REPO, 'scripts/lib/strip-non-code.cjs')) as { stripNonCode: (s: string, o?: { keepQuoteChars?: boolean }) => string })
        .stripNonCode,
    },
  ];
}

/**
 * 宣言の針。**注記の中の言及と区別が付かないので、当てる前に注記を落とす。**
 *
 * ★ **次の 1 行は標本である。消さないこと** —— `function stripNonCode(` という綴りを
 * 注記の中に置いてあるので、注記を落とさない針ならこのファイルが母集団に入る。
 * 下の `it` がその両方 (原文では当たる / 注記を落とすと当たらない) を主張する。
 */
const DECLARATION = /\bfunction stripNonCode\s*\(/;

/**
 * この算法を宣言しているファイルを**再帰**で集める。
 *
 * ★ **直下だけを歩く形だと `scripts/lib/` が死角になる** (パス 452 で実測) ——
 * そして写しはまさにそこへ移った。
 *
 * ★ **針は注記を落としてから当てる** —— さもないと**この検査自身が母集団に入る**。
 * 最初に書いた版は素の原文へ当てており、上の `DECLARATION` の説明文が宣言として
 * 数えられて 2 件のはずが 3 件になった (法則 `mention-vs-declaration`)。
 * つまり**この道具を自分自身に当てるのが正しい形**である。
 */
function declarationsUnder(roots: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readOriginalDirEntries(path.join(REPO, rel))) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(child);
        continue;
      }
      if (!/\.(?:ts|cjs)$/.test(e.name)) continue;
      const code = stripNonCode(readOriginalSource(path.join(REPO, child)));
      if (DECLARATION.test(code)) found.push(child);
    }
  };
  for (const r of roots) walk(r);
  return found;
}

/**
 * 標本。**パス 417 の死角 (補間) を先頭に置く** —— 残りは行番号の保存・入れ子・
 * エスケープ・両方の引用符・注記という、3 つの実装が食い違いうる軸である。
 */
const SAMPLES: readonly { readonly name: string; readonly src: string }[] = [
  { name: '補間の中の呼び出し', src: 'const k = `a|${salesNoteText(e)}|b`;' },
  { name: '補間が 2 つ (地続きにしない)', src: 'const k = `${aa}${bb}`;' },
  { name: '入れ子のテンプレート', src: 'const k = `x${ inner(`y${ deep(z) }`) }w`;' },
  { name: '補間の中のオブジェクト', src: 'const k = `${ f({ a: 1 }) }`;' },
  { name: '行コメント', src: 'const a = 1; // document.title\nconst b = 2;\n' },
  { name: 'ブロックコメント (行番号を保つ)', src: 'const a = 1;\n/* x\n y\n z */\nconst b = 2;\n' },
  { name: '単引用符', src: "const s = 'document.title';\n" },
  { name: '二重引用符', src: 'const s = "document.title";\n' },
  { name: 'エスケープした引用符', src: "const s = 'a\\'b';\nconst t = 2;\n" },
  { name: 'テンプレートの中の改行', src: 'const s = `a\nb`;\nconst t = 2;\n' },
  { name: '普通のコード (何も落ちない)', src: 'function f(x) { return x + 1; }\n' },
  /*
   * **正規表現のリテラル** (2026-09-24 · パス 451)。1 つ目が本物の欠陥そのもので、
   * 引用符を含む正規表現を見ると文字列へ入り**次の同じ引用符までを飲んでいた** ——
   * 実測で `main/clients/skills.ts` の 82% が走査から消え、その先の
   * `'x-api-key': ctx.token,` が見えなかった。
   */
  { name: '正規表現に引用符 (飲まない)', src: 'const m = s.match(/^(["\'])(.*)\\1$/);\nconst t = ctx.token;\n' },
  { name: '正規表現の文字クラスに / ', src: 'const r = /[a-z/]+/g;\nconst t = 2;\n' },
  { name: 'エスケープした / ', src: 'const r = /a\\/b/;\nconst t = 2;\n' },
  { name: '割り算は正規表現ではない', src: 'const q = (a + b) / c / d;\n' },
  { name: '識別子の後ろの / も割り算', src: 'const q = total / count;\n' },
  { name: 'return の後ろは正規表現', src: 'function f(s) { return /x"y/.test(s); }\n' },
  { name: '閉じない / は飲まない (割り算へ倒れる)', src: 'const q = a / b;\nconst t = ctx.token;\n' },
  /*
   * **JSX の素のテキストは落ちない / 文字列リテラルの中身は落ちる** (2026-09-25 · パス 459)。
   * 下の `describe` がこの非対称そのものを主張する。ここに置くのは**写しが揃って
   * いること**を見るため (片方だけが JSX を別扱いし始めたら鳴る)。
   */
  { name: 'JSX の素のテキスト', src: 'const el = <b>削除</b>;\n' },
  { name: '文字列リテラルの中の日本語', src: "const m = '削除しました';\n" },
];

describe('stripNonCode の写し — 2 つが同じ答えを返す (パス 418 / 452)', () => {
  it('★ 母集団は走査で導き、台帳と両方向に一致する', () => {
    const found = declarationsUnder(['src/shared/__tests__', 'scripts']);
    expect(found.sort()).toEqual(COPIES.map((c) => c.file).sort());
    // 走査が死んでいない床。
    expect(found.length).toBeGreaterThanOrEqual(2);
    /*
     * ★ **針が注記を飛ばすことの標本 —— このファイル自身である。**
     * 上の `DECLARATION` の docblock はこの算法の名前を綴るので、注記を落とさない
     * 針では宣言として数えられる (パス 452 で実際にそうなった)。
     */
    const self = 'src/shared/__tests__/stripNonCodeParity.test.ts';
    expect(found).not.toContain(self);
    const raw = readOriginalSource(path.join(REPO, self));
    expect(DECLARATION.test(raw), '標本が古い (`DECLARATION` の上の注記を消した?)').toBe(true);
    expect(DECLARATION.test(stripNonCode(raw))).toBe(false);
    // 合成の標本 (注記の言い換えに依らない側) —— 針は宣言に当たり、注記には当たらない。
    expect(DECLARATION.test('function stripNonCode(src, opts) {')).toBe(true);
    expect(DECLARATION.test(stripNonCode('// function stripNonCode(x) の写し\n'))).toBe(false);
    for (const c of COPIES) expect(c.why.length, `${c.file} の理由が空`).toBeGreaterThan(20);
  });

  it('★ 2 つの実装が同じ関数を読めている (借用が死んでいない)', () => {
    const impls = loadCopies();
    expect(impls).toHaveLength(COPIES.length);
    for (const im of impls) expect(typeof im.fn, `${im.file} が関数を export していない`).toBe('function');
  });

  /**
   * **写しではなく実体を共有していること** (パス 452)。走査は「宣言が 1 つ」を言うが、
   * ゲートが宣言せずに**中身だけ貼り直す**形 (別名の関数・無名関数) は映らない。
   * 同一性で見ると、その形もその場で鳴る。
   */
  it('★ ゲート 3 本が同じ関数の実体を読んでいる', () => {
    const shared = (require(path.join(REPO, 'scripts/lib/strip-non-code.cjs')) as { stripNonCode: unknown }).stripNonCode;
    for (const gate of ['lint-collection-time-tests', 'lint-test-coverage']) {
      const mod = require(path.join(REPO, `scripts/${gate}.cjs`)) as { stripNonCode: unknown };
      expect(mod.stripNonCode, `${gate}.cjs が自分の写しを持っている`).toBe(shared);
    }
    // 3 本目 (`lint-credential-use.cjs`) は re-export しないので、綴りで読んでいることを見る。
    const use = readOriginalSource(path.join(REPO, 'scripts/lint-credential-use.cjs'));
    expect(use).toContain("require('./lib/strip-non-code.cjs')");
  });

  it.each(SAMPLES.map((s) => [s.name, s.src] as const))(
    '★ 2 つの答えが 1 字も違わない — %s',
    (_name, src) => {
      const impls = loadCopies();
      // **両方のモードで比べる** —— `keepQuoteChars` は `timestampPrintCensus` が
      // 使う側 (パス 418 でそこの私有の写しをやめ、この引数へ寄せた)。
      for (const opts of [undefined, { keepQuoteChars: true }] as const) {
        const base = impls[0]!.fn(src, opts);
        for (const im of impls.slice(1)) {
          expect(im.fn(src, opts), `${im.file} の答えが本体と違う (opts=${JSON.stringify(opts)})`).toBe(base);
        }
      }
    },
  );

  it('★ keepQuoteChars は引用符だけを残す (中身は落ちる)', () => {
    const impls = loadCopies();
    for (const im of impls) {
      expect(im.fn("const u = 'a//b';\nconst v = 1;", { keepQuoteChars: true }), im.file)
        .toBe("const u = '';\nconst v = 1;");
      // 既定は引用符ごと落とす (2 つの答えが本当に違うこと = 引数が効いている床)。
      expect(im.fn("const u = 'a//b';", {}), im.file).not.toContain("'");
    }
  });

  it('★ 標本が的に当たる (どれかは必ず何かを落とす / 補間は残る)', () => {
    // 補間の中身は残る —— パス 417 の死角そのもの。
    expect(stripNonCode('const k = `a|${salesNoteText(e)}|b`;')).toContain('salesNoteText(e)');
    // 文字列の中身は落ちる。
    expect(stripNonCode("const s = 'document.title';\n")).not.toContain('document');
    // 行番号は保たれる (落とした行のぶんだけ改行が残る)。
    const lines = stripNonCode('const a = 1;\n/* x\n y\n z */\nconst b = 2;\n').split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[4]).toContain('const b = 2;');
    // 隣り合う補間が地続きにならない (実物に無い綴りを作らない)。
    expect(stripNonCode('const k = `${aa}${bb}`;')).not.toContain('aabb');
    // 標本の総数が縮んでいないこと (母集団の床)。
    expect(SAMPLES.length).toBeGreaterThanOrEqual(18);
  });
});

/**
 * **飲み込みが閉じたことを実物で留める** (2026-09-24 · パス 451)。
 *
 * 上の標本は算法を縛るが、「実物のどのファイルが見えるようになったか」は言わない。
 * ここは**実在の 3 本**について、正規表現より後ろのコードが走査に映ることを見る ——
 * 直す前の実測は 79.5% / 79.7% / 85.2% が消えていた。
 */
describe('★ 実物: 正規表現より後ろのコードが見える (パス 451)', () => {
  const CASES = [
    // 90 行目の `/^(["'])([\s\S]*)\1$/` より後ろ。466 行目が鍵をヘッダへ載せる。
    { file: 'src/main/clients/skills.ts', needle: 'ctx.token' },
    // Google の API のパスを組む所 —— 正規表現より後ろに在る。
    { file: 'src/shared/api/google.ts', needle: 'export' },
    // 音声コマンドの語彙表 —— 85.2% が消えていた。
    { file: 'src/renderer/data/voiceCommand.ts', needle: 'export' },
  ] as const;

  it.each(CASES.map((c) => [c.file, c.needle] as const))(
    '%s の %s が走査に映る',
    (file, needle) => {
      const raw = readOriginalSource(path.join(REPO, file));
      const code = stripNonCode(raw);
      expect(raw.includes(needle), `${file}: 原文に ${needle} が無い (標本が古い)`).toBe(true);
      expect(code.includes(needle), `${file}: 走査から ${needle} が消えている`).toBe(true);
    },
  );

  it('★ 対照: 飲み込みの形を再現すると見えなくなる', () => {
    // 引用符を含む正規表現 → その後ろの `ctx.token` は、正規表現を知らない走査では消える。
    const src = 'const m = s.match(/^(["\'])$/);\nconst t = ctx.token;\n';
    expect(stripNonCode(src).includes('ctx.token')).toBe(true);
    // 標本が的に当たることを示す —— 引用符が 1 つだけ残る形なら、文字列として飲まれる。
    expect(stripNonCode('const s = "a\nconst t = ctx.token;\n').includes('ctx.token')).toBe(false);
  });
});

/*
 * **`stripNonCode` を通した本文に、文字列リテラルの中身を探してはいけない**
 * (2026-09-25 · パス 459)。
 *
 * ## なぜここに書くか
 *
 * パス 458 で、私はこの罠に落ちた。`web-shim.ts` に「ダウンロードフォルダに
 * 保存されています」という文が**無いこと**を、`stripNonCode` を通した本文に対して
 * `not.toContain` で主張した —— **この道具は文字列リテラルの中身を落とす**ので、
 * その主張は**どの入力でも通る空の検査**だった。対照を当てても鳴らず、
 * 原因が製品ではなく自分の検査だと分かるまで時間を使った。
 *
 * ## 罠が見えにくい理由 (実測)
 *
 * 同じ日本語でも**どこに住んでいるか**で答えが割れる:
 *
 * | 住んでいる所 | `stripNonCode` の後 | 不在の主張は |
 * | --- | --- | --- |
 * | JSX の素のテキスト (`<b>削除</b>`) | **残る** | 意味が在る |
 * | 文字列リテラル (`'削除しました'`) | **落ちる** | **空 (どの入力でも通る)** |
 * | 注記 | 落ちる | 空 |
 *
 * 主張の字面はどちらも同じなので、**書いた人には見分けが付かない**。
 * だから見分けを機械に持たせる。
 *
 * ★ **数えたら、今日この罠に落ちている検査は 0 件だった** (2026-09-25 実測:
 * 本物の `stripNonCode` を読む 18 ファイルで、stripped な本文へ日本語の針を
 * 当てている所は 0 —— 見つかった 8 行は「注記を食わせる標本」3 件と
 * 「日本語は主張の説明文で、針は ASCII」4 件と、JSX テキストを探す 1 件だった)。
 * ここが留めるのは**次に書く人のため**で、規約
 * 「不在の主張には標本を添える」に 1 行足す: **標本は、走査に掛ける物と
 * 同じ加工を通す。** 生の文字列に当てた標本は「針は生きている」しか示さない。
 */
describe('不在の主張を空にする非対称 (パス 459)', () => {
  it('★ 文字列リテラルの中身は落ち、JSX の素のテキストは残る', () => {
    const inLiteral = stripNonCode("const m = '保存されています';\n");
    expect(inLiteral, '文字列の中身が残っている').not.toContain('保存されています');
    const inJsx = stripNonCode('const el = <b>保存されています</b>;\n');
    expect(inJsx, 'JSX の素のテキストまで落ちている').toContain('保存されています');
  });

  it('★ 引用符を残す指定でも、中身は落ちる (見た目に騙されない)', () => {
    const kept = stripNonCode("const m = '保存されています';\n", { keepQuoteChars: true });
    expect(kept, '引用符が消えている').toContain("''");
    expect(kept, '中身が残っている').not.toContain('保存されています');
  });

  it('★ だから「stripped な本文に日本語の文が無い」は主張になっていない', () => {
    // 実物にその文が**在って**も、走査の後には無い —— 対照の両側を並べて示す。
    const src = "alert('ダウンロードフォルダに保存されています。');\n";
    expect(src, '標本が古い').toContain('ダウンロードフォルダに保存されています');
    expect(stripNonCode(src)).not.toContain('ダウンロードフォルダに保存されています');
    // 同じ文が JSX テキストなら、走査の後も残る (= そこでの不在の主張は生きている)。
    const jsx = 'const el = <p>ダウンロードフォルダに保存されています。</p>;\n';
    expect(stripNonCode(jsx)).toContain('ダウンロードフォルダに保存されています');
  });

  it('★ 識別子は落ちないので、綴りの側は識別子で見る', () => {
    const src = "import { LIBRARY_HATCH_TEXT } from './data/exportOutcome';\n";
    const code = stripNonCode(src, { keepQuoteChars: true });
    expect(code).toContain('LIBRARY_HATCH_TEXT');
    // module 指定子は**文字列リテラル**なので落ちる —— ここを錠にしてはいけない。
    expect(code).not.toContain('./data/exportOutcome');
  });
});
