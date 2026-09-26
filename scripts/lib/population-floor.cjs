'use strict';

/**
 * **宣言した母集団の「一部」が丸ごと消えたことを見る** (2026-09-25 · パス 469)。
 *
 * パス 468 は「母集団を空にすると落ちるか」を 37 ゲートについて振る舞いで測り、
 * 5 本に床を足して 33 / 33 が鳴るようにした。**ところが床は「0 件」にしか当たらない。**
 * 合計の床は実測の 10〜60% に置かれているので、走査が**一部だけ**死んでも素通りする。
 *
 * 実測 (2026-09-25 · 隔離した写しの上で `readdirSync` から `.tsx` を落として 13 ゲートを走らせる):
 *
 * ```
 *   .tsx 108 件 (= 画面そのもの) が走査から消えても ✅ exit 0:
 *     lint:network-targets / lint:url-encoding / lint:regex / lint:imports / lint:charset
 *   根が 1 つ丸ごと消えても ✅ exit 0:
 *     scripts (102 件) → lint:regex / lint:charset / lint:sample-data
 *     docs   ( 61 件) → lint:charset
 *     orchestration   → lint:regex / lint:sample-data
 * ```
 *
 * ★ **合計の床で捕まえたのは 13 のうち 2 本だけ** (`lint:parameter-prose` 170 < 200 /
 * `lint:zero-fold` 228 < 240) で、しかもどちらも**床がたまたま実測のすぐ下に在った**ため。
 * 残りで鳴った 4 本は台帳の双方向・生成物の一致という**別の機構が偶然**捕まえた物である。
 *
 * ★ **`lint:charset` は「宣言」を検めていた** —— 2026-09-14 (パス 255) から
 * 「`SCAN_EXTS` が `.sh .yml .html .css .js .svg` を含むこと」を自己テストで要求しているが、
 * それは**宣言に綴りが在ること**であって**1 件でも読んだこと**ではない。走査の側が
 * `.tsx` を落としても宣言は変わらないので、その検査は素通りする
 * (法則 `mention-vs-declaration` の、ゲート自身の中での現れ)。
 *
 * ## 床の置き方 (なぜ「実測の N%」にしないか)
 *
 * 実測に張り付けた床は**直した日に落ちる門**になる (パス 378 で `tickSensitivityLedger` が
 * 実際にそうなった)。だからここは割合ではなく **「宣言した群はどれも 1 件以上」** を要求する。
 * 走査が構造的に壊れる形 —— 拡張子のふるいが 1 つ落ちる・根が 1 つ歩かれない —— は
 * これで必ず鳴り、母集団が増えても減っても床は動かない。
 *
 * **正当に 0 になる群は宣言しない** (パス 467 の「正当に 0 になる母集団には床を置かない」)。
 * 何を要求するかは判断なので、呼ぶ側が `REQUIRED_GROUPS` として綴り、理由を注記に書く。
 */

const path = require('node:path');

/** 走査したファイルを「拡張子」と「リポジトリ直下の根」で数える。 */
function countByGroup(files, repoRoot) {
  const exts = new Map();
  const roots = new Map();
  for (const f of files) {
    const abs = path.isAbsolute(f) ? f : path.join(repoRoot, f);
    const rel = path.relative(repoRoot, abs);
    const ext = path.extname(abs).toLowerCase();
    const root = rel.split(path.sep)[0] || '(直下)';
    exts.set(ext, (exts.get(ext) ?? 0) + 1);
    roots.set(root, (roots.get(root) ?? 0) + 1);
  }
  return { exts, roots };
}

/**
 * 宣言した群がどれも 1 件以上かを見る。返すのは断りの文の配列 (空なら健全)。
 *
 * `required` は `{ exts?: string[], roots?: string[] }`。**空の `required` は受けない** ——
 * 呼ぶ側が群を綴り忘れたときに「問題 0 件」と答えるのは、この検査が塞ごうとしている
 * 当の形だからである。
 */
function groupFloorProblems(files, required, repoRoot) {
  const wantExts = required.exts ?? [];
  const wantRoots = required.roots ?? [];
  if (wantExts.length === 0 && wantRoots.length === 0) {
    return ['REQUIRED_GROUPS が空です —— 宣言しない群は検べられません (呼ぶ側の誤りです)。'];
  }
  const { exts, roots } = countByGroup(files, repoRoot);
  const out = [];
  for (const e of wantExts) {
    if (!((exts.get(e) ?? 0) > 0)) out.push(describe(`拡張子 ${e}`, exts));
  }
  for (const r of wantRoots) {
    if (!((roots.get(r) ?? 0) > 0)) out.push(describe(`根 ${r}/`, roots));
  }
  return out;
}

function describe(what, counts) {
  const seen = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => `${k}:${v}`).join(' ');
  return (
    `${what} のファイルを 1 件も走査できませんでした。合計の床は満たしていますが、`
    + '宣言した母集団の一部が丸ごと消えています —— 走査が「一部だけ」死んでいます'
    + ` (実際に読めた群: ${seen || 'なし'})。`
  );
}

/** 断りを刷って終了コードにする (どのゲートでも同じ文面にするため)。 */
function reportGroupFloor(files, required, repoRoot, label) {
  const problems = groupFloorProblems(files, required, repoRoot);
  if (problems.length === 0) return 0;
  console.error(`\n❌ ${label}: 宣言した母集団の一部が走査から消えています`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

module.exports = { countByGroup, groupFloorProblems, reportGroupFloor };
