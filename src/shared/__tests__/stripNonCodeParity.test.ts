/**
 * **`stripNonCode` は 3 か所に在る。同じ標本で 1 字も違わないこと。** (2026-09-23 · パス 418)
 *
 * パス 417 で `.ts` の死角を閉じた —— テンプレートリテラルを**補間ごと**落としていたので
 * `` `…${salesNoteText(e)}` `` がどの走査にも映らず、**素の読みへ戻しても映らない**
 * 両方向の盲目だった。このリポジトリは利用者に見せる文をテンプレートで組むので、
 * そこは「散文」ではなく**最も危ない式が並ぶ場所**である。
 *
 * ## 写しは避けられないが、割れるのは避けられる
 *
 * `.cjs` のゲートは `.ts` を require できないので、同じ算法が 3 つ在る。
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
 * ## ここで見るもの
 *
 * - ★ 3 つの実装が**同じ標本で同じ文字列**を返す (1 つ直して 2 つ忘れたら鳴る)。
 * - ★ 母集団は**走査で導く** —— 4 つ目の写しが生えたら台帳に無いので鳴り、
 *   台帳の行が実物から消えても鳴る (両方向)。
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
    file: 'scripts/lint-collection-time-tests.cjs',
    why: '`.cjs` は `.ts` を require できない。`it()` の中で呼ばれたかを行単位で数えるので改行の保存が要る',
  },
  {
    file: 'scripts/lint-test-coverage.cjs',
    why: '同じ理由の写し。`DOM_GLOBALS` を当てる前に注記と文字列を落とす (判定は真偽だけなので行の保存は要らないが、算法は 1 つに揃える)',
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
      file: 'scripts/lint-collection-time-tests.cjs',
      fn: (require(path.join(REPO, 'scripts/lint-collection-time-tests.cjs')) as { stripNonCode: (s: string, o?: { keepQuoteChars?: boolean }) => string })
        .stripNonCode,
    },
    {
      file: 'scripts/lint-test-coverage.cjs',
      fn: (require(path.join(REPO, 'scripts/lint-test-coverage.cjs')) as { stripNonCode: (s: string, o?: { keepQuoteChars?: boolean }) => string })
        .stripNonCode,
    },
  ];
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
];

describe('stripNonCode の写し — 3 つが同じ答えを返す (パス 418)', () => {
  it('★ 母集団は走査で導き、台帳と両方向に一致する', () => {
    const found: string[] = [];
    for (const dir of ['src/shared/__tests__', 'scripts']) {
      for (const e of readOriginalDirEntries(path.join(REPO, dir))) {
        if (e.isDirectory()) continue;
        if (!/\.(?:ts|cjs)$/.test(e.name)) continue;
        const rel = `${dir}/${e.name}`;
        // 宣言だけを数える (呼び出しや注記の言及は母集団ではない)。
        if (/\bfunction stripNonCode\s*\(/.test(readOriginalSource(path.join(REPO, rel)))) found.push(rel);
      }
    }
    expect(found.sort()).toEqual(COPIES.map((c) => c.file).sort());
    // 走査が死んでいない床。
    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const c of COPIES) expect(c.why.length, `${c.file} の理由が空`).toBeGreaterThan(20);
  });

  it('★ 3 つの実装が同じ関数を読めている (借用が死んでいない)', () => {
    const impls = loadCopies();
    expect(impls).toHaveLength(COPIES.length);
    for (const im of impls) expect(typeof im.fn, `${im.file} が関数を export していない`).toBe('function');
  });

  it.each(SAMPLES.map((s) => [s.name, s.src] as const))(
    '★ 3 つの答えが 1 字も違わない — %s',
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
    expect(SAMPLES.length).toBeGreaterThanOrEqual(11);
  });
});
