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
