/** @vitest-environment jsdom */
/**
 * **ブラウザ版の入口 (`main.tsx`) を実行する唯一の検査** (2026-09-14 · パス 230)。
 *
 * ## 見つけ方 (測定が先・仮説は後)
 *
 * 全域のカバレッジを測り直したところ (93.88% st / 89.18% br)、**0% の実装ファイルは
 * `src/renderer/main.tsx` だけ**だった。18 行しかないが、そこに在るのは
 * 「クリックジャッキングを断る」判定と React の起動で、**どちらも配線そのもの**である。
 *
 * | | 単体としての被覆 | 配線としての被覆 |
 * | --- | ---: | ---: |
 * | `security/frameGuard.ts` | **100% / 100%** | — |
 * | `main.tsx` | **0% / 0%** | **0%** |
 *
 * **判定は完全に測られていて、判定を呼ぶ側が 1 度も実行されていなかった。**
 *
 * ## なぜ CI が気付かないのか
 *
 * 既定の CI (`ci.yml`) はブラウザ版を **作る**だけである —— `build:web` の後に
 * 見るのは「ファイルが在るか」「小さすぎないか」「16MB を超えないか」で、
 * **起動はしない**。実物を起動する `e2e` / `e2e:lite` / `perf` は `e2e.yml` に在り、
 * そちらは `workflow_dispatch` と `run-e2e` ラベルのときだけ走る (Actions 分の節約・
 * その判断自体は妥当)。つまり**既定の門では誰も入口を通らない**。
 *
 * これは `smoke:app` を足したときと同じ形である ——
 * 「実物の `electron .` を起動する唯一の検査で、それまで誰も主プロセスを通しておらず、
 * `dist-electron/main.js` は 2 週間ほど起動不能なまま全 CI が緑だった」。
 * **デスクトップ側で閉じた穴が、ブラウザ側では開いたままだった。**
 *
 * ## ここでしか測れない 3 つのこと
 *
 * 1. 枠の中なら**断りを描き、React を起動しない** —— `main.tsx` のコメントは
 *    「描画より先に判定する。React を立ち上げてから消すと、消えるまでのあいだ
 *    押せてしまう (クリックジャッキングは 1 クリックで足りる)」と述べている。
 *    `isFramed` の単体検査では**順序**を確かめられない。
 * 2. 枠の外なら `#root` へ **React を載せる** —— `document.getElementById('root')!`
 *    の `!` は非 null の断言なので、雛形の id が変わると**起動時に投げる**。
 *    型検査は通り、他のどの検査も緑のままである。
 * 3. どちらの筋でも**もう一方をしない** (断りと起動が二重に走らない)。
 *
 * ## 実行時の注意
 *
 * `main.tsx` は**読み込んだ瞬間に走る**副作用モジュールなので、筋ごとに
 * `vi.resetModules()` してから動的 `import()` する。`frameGuard` と
 * `react-dom/client` は差し替えて「何を呼んだか」を観測する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 筋ごとに切り替える `isFramed` の答え。`vi.mock` は巻き上げられるので外に置く。 */
let framed = false;
const isFramedCalls: number[] = [];
const refusalCalls: { href: string }[] = [];
const createRootCalls: { id: string | null }[] = [];
const renderCalls: number[] = [];

vi.mock('../security/frameGuard', () => ({
  isFramed: () => {
    isFramedCalls.push(1);
    return framed;
  },
  renderFrameRefusal: (_doc: Document, href: string) => {
    refusalCalls.push({ href });
  },
}));

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: (el: Element) => {
      createRootCalls.push({ id: el.getAttribute('id') });
      return {
        render: () => {
          renderCalls.push(1);
        },
      };
    },
  },
}));

// `web-shim` は `window.serviceHub` を生やす副作用モジュール。入口の筋を測るのに
// 実物は要らず、読み込むと IndexedDB などに触るので空にする。
vi.mock('../web-shim', () => ({}));
// CSS の import は入口の振る舞いに関係しない。
vi.mock('../styles.css', () => ({}));
// `App` は全画面を引き連れてくる。ここで測るのは「載せたか」だけなので札に替える。
vi.mock('../App', () => ({ App: () => null }));

function reset(): void {
  isFramedCalls.length = 0;
  refusalCalls.length = 0;
  createRootCalls.length = 0;
  renderCalls.length = 0;
}

beforeEach(() => {
  reset();
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ブラウザ版の入口 — 既定の CI が 1 度も実行しない 18 行 (パス 230)', () => {
  it('★ 枠の外なら #root へ React を載せる', async () => {
    framed = false;
    await import('../main');
    // **入口が実際に判定を呼んでいる** (呼ばずに素通りしていないこと)。
    expect(isFramedCalls.length, 'isFramed が呼ばれていない').toBe(1);
    expect(createRootCalls, 'React が #root に載っていない').toEqual([{ id: 'root' }]);
    expect(renderCalls.length, 'render が呼ばれていない').toBe(1);
    // 枠の外では断りを描かない。
    expect(refusalCalls, '枠の外なのに断りを描いている').toEqual([]);
  });

  it('★ 枠の中なら断りを描き、React を起動しない (順序がここでしか測れない)', async () => {
    framed = true;
    await import('../main');
    expect(isFramedCalls.length, 'isFramed が呼ばれていない').toBe(1);
    expect(refusalCalls.length, '断りを描いていない').toBe(1);
    expect(refusalCalls[0]?.href, '断りに今の URL を渡していない').toBe(window.location.href);
    // **ここが要点。** React を起動してから消す実装だと、消えるまでのあいだ
    // 押せてしまう (クリックジャッキングは 1 クリックで足りる)。
    expect(createRootCalls, '枠の中なのに React を起動している').toEqual([]);
    expect(renderCalls, '枠の中なのに描画している').toEqual([]);
  });

  it('★ 雛形の根の id は入口が探す id と同じ (`!` の断言が成り立つ)', async () => {
    // `main.tsx` は `document.getElementById('root')!` と書いている。雛形側の id が
    // 変わると**起動時に投げる**が、型検査は通り他の検査も緑のままである。
    // 出荷される雛形を読んで、同じ id が在ることを確かめる。
    // **`readOriginalSource` を通す。** 生の `readFileSync` だと、計器が書き換えた
    // 写しを読んで「綴りが在る」と言いうる = 空の検査になる
    // (`originalSourcePolicy.test.ts` が生の読みを落とす。実際にこれで 1 度落ちた)。
    const { readOriginalSource } = await import('../../shared/__tests__/originalSource');
    const { resolve } = await import('node:path');
    const html = readOriginalSource(resolve('src/renderer/index.html'));
    expect(html, 'index.html に id="root" が無い —— 入口の `!` が起動時に投げる').toContain('id="root"');
  });
});
