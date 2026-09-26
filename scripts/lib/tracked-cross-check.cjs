'use strict';

/**
 * **木を歩く走査に「2 つ目の数え方」を与える** (2026-09-25 · パス 471)。
 *
 * パス 468 は「母集団を空にすると落ちるか」を測り、パス 469 は「宣言した群が丸ごと
 * 消えたら落ちるか」を測って床を足した。**どちらも「全部」または「1 群まるごと」にしか
 * 当たらない。** 走査が*一様に*間引かれる形 (木の歩きが途中で止まる・ふるいが 1 つ
 * 緩む・親ディレクトリの 1 つが読めない) は、どの群も N% は残るので群ごとの床を満たす。
 *
 * 実測 (2026-09-25 · 隔離した写しの上で `readdirSync` を一様に間引き、6 ゲートの
 * 終了コードを読む):
 *
 * ```
 *   残した割合   鳴ったゲート                                        黙ったゲート
 *   99% (1% 死)  0 / 6                                               **6 / 6 が ✅ exit 0**
 *   90%          lint:network-targets                                5 / 6
 *   75%          lint:network-targets / lint:charset                 4 / 6
 *   50%          + lint:imports / lint:url-encoding                  2 / 6 (regex / sample-data)
 * ```
 *
 * ★ **走査が 1% 死んでも 6 本すべてが「問題なし」と刷った。** 鳴った 4 本はどれも
 * *合計の床が偶然半分をまたいだ*ためで (パス 470 の実測と同じ 4 本)、床を 1 つ下げれば
 * 黙る。**実測に張り付けた割合の床を足して塞ぐのではない** —— それは直した日に落ちる門に
 * なる (パス 378)。
 *
 * ## 塞ぎ方: 権威に独立して数えてもらう
 *
 * `lint:shell` / `lint:repo-size` はパス 470 でこれを持った —— 母集団が `git ls-files`
 * なので、**同じ問いを 2 つの綴りで訊いて一致を要求する**。木を歩く 6 本は母集団が
 * `readdirSync` なので、git は母集団ではなく**証人**として使える:
 *
 *   **追跡されていて、そのゲートの条件に合うファイルは、どれも走査されている。**
 *
 * ★ **向きは片側だけ** —— 逆 (走査した物はどれも追跡されている) は**偽**である。
 * 実測 (2026-09-25): `orchestration/dependency-audit.json` は木に在って追跡されておらず、
 * `lint:regex` / `lint:sample-data` は自分自身を走査から外しつつ読む。等号を要求すると
 * 生成物を 1 つ置いた日から鳴り続ける門になる。
 *
 * ★ **割合に依らない** —— 追跡ファイルが 1 件でも走査から落ちれば鳴るので、
 * 「何 % 死んだら鳴るか」を決める必要が無い。実測で今日の食い違いは 6 本とも **0 件**。
 *
 * ## 条件は 1 つの綴りで、数え方が 2 つ
 *
 * 走査の側とここで条件を別々に綴ると、**2 つ目の台帳が静かに古びる** (このリポジトリが
 * 繰り返し直してきた形)。だから呼ぶ側は `{ roots, skipDirs, accept }` を**走査が使っている
 * 定数そのもの**で渡し、`walk` も `accept(e.name)` / `skipDirs.has(e.name)` を通る。
 * 歩き方 (再帰) は写さない —— 写すのは条件だけである。
 *
 * ## git が使えないとき
 *
 * この 6 本の仕事 (木を歩いて読む) は git を要らない。tarball の展開の上でも走るべきなので
 * **落とさずに飛ばす** —— ただし**成功行が「照合したか」を名乗る** (パス 470 で
 * `lint:shell` の成功行が「使っていない出どころ」を名乗っていた欠陥を直した当のこと)。
 * `lint:repo-size` が git 無しで exit 1 なのは、あちらの**母集団そのもの**が git だからで、
 * ここと矛盾しない。
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');

/** 追跡ファイルの一覧。**投げる** —— 握り潰すかは呼ぶ側が決める (2 通りの契約が実在する)。 */
function gitLsFiles(repoRoot, extraArgs = []) {
  const out = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z', ...extraArgs], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter((rel) => rel.length > 0);
}

/** 同じ問い。読めなければ `null` (git が無い環境で走らせる側のため)。 */
function gitLsFilesOrNull(repoRoot, extraArgs = []) {
  try {
    return gitLsFiles(repoRoot, extraArgs);
  } catch {
    return null;
  }
}

/**
 * 追跡ファイルの一覧を、**ゲートの条件**で濾す。
 *
 * `roots` の `'.'` は「リポジトリ直下のファイルだけ」(木ではない) を指す ——
 * `lint:charset` が `SCAN_ROOT_FILES` でそうしている。
 *
 * `accept` は**ファイル名**を、`acceptPath` は**リポジトリ相対の経路**を受ける
 * (歩く側が `e.name` で判定する条件と、経路で判定する条件をそのまま渡すため ——
 * `lint:imports` は既知のゾーンの外を走査しない)。
 */
function matchingTracked(tracked, criteria) {
  const { roots, skipDirs, accept, acceptPath, ignore } = criteria;
  const skip = skipDirs instanceof Set ? skipDirs : new Set(skipDirs ?? []);
  const ignored = new Set((ignore ?? []).map((p) => p.split(path.sep).join('/')));
  const out = new Set();
  for (const raw of tracked) {
    const rel = raw.split(path.sep).join('/');
    if (ignored.has(rel)) continue;
    const parts = rel.split('/');
    const base = parts[parts.length - 1];
    const dirs = parts.slice(0, -1);
    const inRoot = dirs.length === 0
      ? roots.includes('.')
      : roots.includes(dirs[0]);
    if (!inRoot) continue;
    if (dirs.some((d) => skip.has(d))) continue;
    if (!accept(base)) continue;
    // 経路そのものの条件 (`lint:imports` は既知のゾーンの外を走査しない)。
    if (acceptPath && !acceptPath(rel)) continue;
    out.add(rel);
  }
  return out;
}

/** 走査した絶対パス (または相対パス) を、リポジトリ相対の `/` 区切りへ揃える。 */
function relSet(walked, repoRoot) {
  const out = new Set();
  for (const f of walked) {
    const abs = path.isAbsolute(f) ? f : path.join(repoRoot, f);
    out.add(path.relative(repoRoot, abs).split(path.sep).join('/'));
  }
  return out;
}

/**
 * 照合する。返すのは
 *   `{ source: 'git' | 'unavailable', missing: string[], disagreement: string | null }`
 *
 * `disagreement` は**権威に 2 度訊いた結果の食い違い** —— 広い一覧 (`ls-files`) と
 * pathspec つき (`ls-files -- .`) が同じ集合を答えなければ、証人そのものが narrow されて
 * いる。証人が narrow されると `missing` は 0 件になる (**失敗が開く向き**) ので、
 * ここを見ないと照合が静かに空になる。
 */
function trackedCrossCheck(walked, criteria, repoRoot) {
  const broad = gitLsFilesOrNull(repoRoot);
  if (broad === null) return { source: 'unavailable', missing: [], disagreement: null };
  const witness = gitLsFilesOrNull(repoRoot, ['--', '.']);
  const want = matchingTracked(broad, criteria);
  let disagreement = null;
  if (witness === null) {
    disagreement = 'git に 2 度目を訊けませんでした (証人が確かめられないので照合は信用できません)。';
  } else {
    const second = matchingTracked(witness, criteria);
    const onlyBroad = [...want].filter((f) => !second.has(f));
    const onlySecond = [...second].filter((f) => !want.has(f));
    if (onlyBroad.length > 0 || onlySecond.length > 0) {
      disagreement =
        `git の答えが綴りで食い違いました (広い一覧だけ ${onlyBroad.length} 件 / `
        + `pathspec つきだけ ${onlySecond.length} 件): `
        + [...onlyBroad.slice(0, 3), ...onlySecond.slice(0, 3)].join(' ');
    }
  }
  const seen = relSet(walked, repoRoot);
  const missing = [...want].filter((f) => !seen.has(f)).sort();
  return { source: 'git', missing, disagreement };
}

/** 成功行に添える「照合したか」の名乗り。**使った出どころを名乗る** (パス 470)。 */
function crossCheckSuffix(source) {
  return source === 'git'
    ? '追跡ファイルの一覧と照合済み'
    : 'git が使えないため追跡ファイルとの照合はしていません';
}

/** 断りを刷って終了コードにする (どのゲートでも同じ文面にするため)。 */
function reportTrackedCrossCheck(walked, criteria, repoRoot, label) {
  const res = trackedCrossCheck(walked, criteria, repoRoot);
  if (res.disagreement) {
    console.error(`\n❌ ${label}: 追跡ファイルの一覧が信用できません`);
    console.error(`  ${res.disagreement}`);
    return { code: 1, source: res.source };
  }
  if (res.missing.length === 0) return { code: 0, source: res.source };
  console.error(`\n❌ ${label}: 追跡されているのに走査されていないファイルが ${res.missing.length} 件あります`);
  for (const f of res.missing.slice(0, 10)) console.error(`  ${f}`);
  if (res.missing.length > 10) console.error(`  … ほか ${res.missing.length - 10} 件`);
  console.error(
    '  合計の床と群ごとの床はどちらも満たしていますが、走査が「一部だけ」死んでいます'
    + ' —— 歩き方・ふるい・読めないディレクトリのどれかを疑ってください。',
  );
  return { code: 1, source: res.source };
}

module.exports = {
  gitLsFiles, gitLsFilesOrNull, matchingTracked, trackedCrossCheck,
  crossCheckSuffix, reportTrackedCrossCheck,
};
