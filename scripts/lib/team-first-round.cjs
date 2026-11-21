'use strict';

/**
 * **チームの初出ラウンド** —— そのチームが最初に編成された round の番号
 * (2026-09-26 · パス 483)。
 *
 * `orchestration/registry.json` の `teamFirstRound` は**この関数の出力そのもの**で、
 * 書き手 (`scripts/orchestrate.cjs record`) が round を足すたびに引き直し、
 * 門 (`scripts/verify-orchestration.cjs`) が `rounds` から導き直して**両方向**に
 * 一致を検める。導出はここに 1 つだけ置く —— 書き手と門が別々に書くと、
 * 「書き手が正しいと思う索引」と「門が正しいと思う索引」の 2 つができる。
 *
 * ## なぜ派生を台帳に置くのか (実測)
 *
 * 製品 (村のディスパッチ計画 `villageData.buildDispatchPlan`) が `rounds` から
 * 読むのは **「チーム → 初出ラウンド」の対応だけ**である。ところが
 * `rounds` を名前で import すると、Vite の JSON の tree-shaking は**鍵の単位**でしか
 * 落とさないので、102 ラウンドの編成表とリリースノート (minified **160,558 B**) が
 * 両ビルドへ丸ごと畳み込まれていた (パス 396 の実測)。この索引は **2,610 B** で済む。
 * 開発側の履歴 (`rounds`) は台帳に**そのまま残る** —— 製品が読むのをやめるだけである。
 *
 * ## 「初出」の定義
 *
 * **そのチームを含む round の番号の最小値。** 配列の順ではなく番号で決める ——
 * `record` は連番で末尾に足すので今日は同じ答えになるが、手で並べ替えた台帳でも
 * 意味が変わらないようにする。
 *
 * 出力の鍵の並びは「`rounds` を順に読んで初めて現れた順」で、書き直しても
 * 既存の行は動かない (新しいチームは末尾に足される) —— 差分が読める形にする。
 *
 * ★ `Object.fromEntries` で組む —— 素の代入 (`out[id] = n`) だと id が
 * `__proto__` のとき prototype を差し替える。id の形は門が別に検めるが、
 * 導出そのものは形に依らず正しくしておく。
 *
 * @param {readonly { round: number, teams: readonly string[] }[]} rounds
 * @returns {Record<string, number>}
 */
function deriveTeamFirstRound(rounds) {
  const first = new Map();
  for (const r of rounds) {
    for (const id of r.teams) {
      const prev = first.get(id);
      if (prev === undefined || r.round < prev) first.set(id, r.round);
    }
  }
  return Object.fromEntries(first);
}

/**
 * 台帳の `teamFirstRound` が `rounds` から導いた物と一致するかを検め、
 * 食い違いを 1 件ずつ名指しする (空の配列なら一致)。
 *
 * **両方向**に見る —— 足りない鍵・値の違い・`rounds` に現れない余分な鍵。
 * 余分な鍵を見逃すと、チームを消した後も索引だけが古い行を持ち続ける。
 *
 * @param {unknown} stored 台帳に書かれている値 (`reg.teamFirstRound`)
 * @param {readonly { round: number, teams: readonly string[] }[]} rounds
 * @returns {string[]}
 */
function teamFirstRoundProblems(stored, rounds) {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    return ['teamFirstRound が object ではありません (チーム id → 初出 round 番号の対応であること)'];
  }
  const want = deriveTeamFirstRound(rounds);
  const problems = [];
  for (const [id, round] of Object.entries(want)) {
    if (!Object.hasOwn(stored, id)) {
      problems.push(`teamFirstRound に "${id}" がありません (rounds では round ${round} が初出)`);
    } else if (stored[id] !== round) {
      problems.push(`teamFirstRound["${id}"] = ${JSON.stringify(stored[id])} が rounds の初出 (round ${round}) と違います`);
    }
  }
  for (const id of Object.keys(stored)) {
    if (!Object.hasOwn(want, id)) {
      problems.push(`teamFirstRound の "${id}" はどの round にも現れません`);
    }
  }
  return problems;
}

module.exports = { deriveTeamFirstRound, teamFirstRoundProblems };
