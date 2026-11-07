'use strict';

/**
 * **チームごとの backlog の状態** —— 村の輪の色と、ディスパッチ計画の 1 つ目の並びの鍵
 * (2026-09-26 · パス 486)。
 *
 * `orchestration/registry.json` の `teamBacklogStatus` は**この関数の出力そのもの**で、
 * 台帳を書く口 (`scripts/orchestrate.cjs` の `writeRegistryChecked`) が書くたびに引き直し、
 * 門 (`scripts/verify-orchestration.cjs` の不変条件 15) が `backlog` から導き直して
 * **両方向**に一致を検める。backlog の `status` を手で書き換えたら
 * `npm run orchestrate:reindex` で引き直す (門の断りもそれを名指しする)。
 * 導出はここに 1 つだけ置く —— パス 483 の `team-first-round.cjs` と同じ形である。
 *
 * ## なぜ派生を台帳に置くのか (実測 2026-09-26)
 *
 * 製品 (`villageData.backlogByTeam`) が backlog から読むのは **`team` と `status` だけ**
 * だった。ところが `VillagePage.tsx` が `backlog` を名前で import しており、Vite の JSON の
 * tree-shaking は**鍵の単位**でしか落とさないので、題名・`note`・`priority` まで両ビルドへ
 * 畳み込まれていた —— 組んだ `dist/standalone.html` / `standalone-lite.html` を実測すると
 * **題名 43 / 43・note 1 / 1 が逐語で入っていた** (UTF-8 で 7,323 B)。
 *
 * それは byte の話だけではない。パス 484 で取り込み口 (`import-requests`) が整い、
 * **利用者がチャットボットに打った文が題名としてそのまま台帳へ入る道**が正式に開いた ——
 * つまり外から来た文が、次のビルドで公開サイトの HTML へ逐語で畳み込まれる。実測:
 *
 * | 取り込んだ題名 | 取り込み・門 | 次の `npm run build:web` |
 * | --- | --- | --- |
 * | `請求書の自動化 <!-- 急ぎ` | 通る | 通る (`<!--` だけなら HTML の読み方は変わらない) |
 * | `請求書の自動化 <!-- <script>` | **通る** | **exit 1** —— `inline-html` が「閉じていない `<!--` のあとに `<script` を含む」で断る |
 *
 * 2 行目は `inline-html.cjs` の関門 (パス 480 以前から在る) が正しく落としたので、白画面の
 * 出荷物は出ない —— だが**公開サイトの組み立てと CI が、利用者が打った 1 行で止まる**。
 * 題名を制限するのは筋が違う (要望が `<script>` に触れるのは正当である)。直しは
 * **製品が読まない物を出荷しない**こと —— 製品が要る「チーム → 状態」だけを索引に置き、
 * 題名と note は台帳に**そのまま残る** (開発側の記録は 1 字も失わない)。
 *
 * ## 「状態」の定義 (直す前の製品と同じ算法)
 *
 * 同じチームに項目が複数あれば**より進行中の物**: in-progress > designed > blocked >
 * それ以外 (shipped / dropped)。重みが同じなら**先に現れた項目**の状態を残す
 * (直す前の `backlogByTeam` が `>` で比べていたのと同じ —— `>=` にすると後の項目が勝つ)。
 * shipped と dropped は製品にとって同じ意味 (輪は既定の色・並びは最後) なので、
 * どちらが残っても村の見た目は変わらないが、算法は写しのまま揃えておく。
 *
 * 出力の鍵の並びは「backlog を順に読んで初めて現れた順」で、書き直しても既存の行は
 * 動かない —— 差分が読める形にする。
 *
 * ★ `Object.fromEntries` で組む —— 素の代入 (`out[id] = s`) だと team が `__proto__`
 * のとき prototype を差し替える。team の形は門が別に検めるが、導出は形に依らず正しくしておく。
 */

/** 状態の重み。表に無い状態 (shipped / dropped / 未知) は 1。 */
const RANK = new Map([
  ['in-progress', 4],
  ['designed', 3],
  ['blocked', 2],
]);

function rankOf(status) {
  return RANK.get(status) ?? 1;
}

/**
 * @param {readonly { team: string, status: string }[]} backlog
 * @returns {Record<string, string>}
 */
function deriveTeamBacklogStatus(backlog) {
  const best = new Map();
  for (const b of backlog) {
    const prev = best.get(b.team);
    if (prev === undefined || rankOf(b.status) > rankOf(prev)) best.set(b.team, b.status);
  }
  return Object.fromEntries(best);
}

/**
 * 台帳の `teamBacklogStatus` が `backlog` から導いた物と一致するかを検め、
 * 食い違いを 1 件ずつ名指しする (空の配列なら一致)。
 *
 * **両方向**に見る —— 足りない鍵・値の違い・backlog に現れない余分な鍵。
 * 余分な鍵を見逃すと、項目を消した後も索引だけが古い色を持ち続ける。
 *
 * @param {unknown} stored 台帳に書かれている値 (`reg.teamBacklogStatus`)
 * @param {readonly { team: string, status: string }[]} backlog
 * @returns {string[]}
 */
function teamBacklogStatusProblems(stored, backlog) {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    return ['teamBacklogStatus が object ではありません (チーム id → backlog の状態の対応であること)'];
  }
  const want = deriveTeamBacklogStatus(backlog);
  const problems = [];
  for (const [team, status] of Object.entries(want)) {
    if (!Object.hasOwn(stored, team)) {
      problems.push(`teamBacklogStatus に "${team}" がありません (backlog では "${status}")`);
    } else if (stored[team] !== status) {
      problems.push(`teamBacklogStatus["${team}"] = ${JSON.stringify(stored[team])} が backlog から導いた "${status}" と違います`);
    }
  }
  for (const team of Object.keys(stored)) {
    if (!Object.hasOwn(want, team)) {
      problems.push(`teamBacklogStatus の "${team}" はどの backlog 項目にも現れません`);
    }
  }
  return problems;
}

module.exports = { deriveTeamBacklogStatus, teamBacklogStatusProblems };
