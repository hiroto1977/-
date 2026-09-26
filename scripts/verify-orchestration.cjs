#!/usr/bin/env node
'use strict';

/**
 * AIオーケストレーション・レジストリの整合検証 + 次ラウンド計画の自己prescribe。
 *
 * 「進化し続ける仕組み」の中核。orchestration/registry.json を読み、次の不変条件を
 * 強制する:
 *   1. 最上位の必須キーが在る (一覧は registry.schema.json の `required` から読む —— 門に写さない)。
 *   2. rounds の teamCount は単調増加 (作業サイクルごとにチームが減らない)。
 *   3. 各 round は policy.minTeamsForRound の最低チーム数を満たす。
 *   4. rounds[].teams と backlog[].team は teams[].id に実在する。
 *   5. round.teamCount は round.teams の要素数と一致する。
 *   6. backlog の id は一意。
 *  13. teamFirstRound (製品が読む派生索引「チーム → 初出 round」) は rounds から
 *      導いた物と両方向に一致する (2026-09-26 · パス 483。導出は
 *      scripts/lib/team-first-round.cjs の 1 つで、書き手 orchestrate.cjs record も同じ物を通る)。
 *  14. registry は registry.schema.json の宣言を**すべて**満たす (2026-09-26 · パス 484)。
 *      それまで宣言を読む物は 1 つも無く、宣言された制約 153 件のうち 67 件が素通りしていた
 *      (チームの domain が無い / active が文字列 / backlog の status の綴り違い ——
 *      どれも製品が読む欄)。検証器は scripts/lib/json-schema-subset.cjs で、知らない
 *      キーワードは「未対応」として落とす (宣言に足した制約が門に届かないまま残らない)。
 *
 * さらに「次に何チームで・どの領域を細分化するか」を自動算出して出力する
 * (--plan)。これによりレジストリ自体が次サイクルの設計図になり、増やし続けても
 * 精度 (整合性) が保たれる。
 *
 * 使い方:
 *   node scripts/verify-orchestration.cjs          検証のみ (CI 用、失敗で exit 1)
 *   node scripts/verify-orchestration.cjs --plan    検証 + 次ラウンド計画を表示
 */

const fs = require('node:fs');
const path = require('node:path');
const { teamFirstRoundProblems } = require('./lib/team-first-round.cjs');
const { validateAgainstSchema } = require('./lib/json-schema-subset.cjs');
const { printableLines } = require('./lib/untrusted-text.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(REPO_ROOT, 'orchestration/registry.json');
/**
 * 台帳の形の宣言。**`--registry` で台帳を差し替えても、宣言は差し替えない** ——
 * 検査が写しの上で門を走らせるとき、写しが自分の宣言を持ち込んで門を緩められない
 * ようにする (門が読むのはリポジトリの宣言だけ)。
 */
const SCHEMA = path.join(REPO_ROOT, 'orchestration/registry.schema.json');

/** 宣言を読む。読めなければ落とす —— 宣言が読めないことを「制約が 0 件」と読まない (パス 467)。 */
function loadSchema() {
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
  } catch (e) {
    fail([`registry.schema.json を読めません: ${e.message}`]);
  }
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.required) || schema.required.length === 0) {
    fail(['registry.schema.json の最上位に required (必須キーの一覧) がありません']);
  }
  return schema;
}

/*
 * **端末へ刷る口はこの 2 つだけ** (2026-09-26 · パス 484)。
 *
 * この門は台帳の文字列を刷る —— 問題の文は台帳の値を引用し、`--plan` は組織図と
 * 着手候補を刷る。台帳の題名は宣言の `pattern` がこの門で落とすが、他の欄
 * (役員・管理職の `title`・チームの `domain` ほか) は開発側が書く欄で `pattern` を
 * 持たず、しかも `lint:charset` はファイルの字を読むので `JSON.stringify` が `\u001b` へ
 * 逃がした C0 を見ない。だから守るのは欄ではなく口である —— すべて `printableLines`
 * (改行だけ残し、他の危ない字を見える形へ) を通す (`orchestrate.cjs` と同じ形)。
 * **素の `console.*` はこの 2 行の外に置かない** (`importRequestsPath.test.ts` が数える)。
 */
function say(text = '') { console.log(printableLines(text)); }
function sayErr(text = '') { console.error(printableLines(text)); }

function fail(messages) {
  sayErr(`\n❌ orchestration registry: ${messages.length} 件の問題`);
  for (const m of messages) sayErr(`  - ${m}`);
  process.exit(1);
}

/**
 * **空にすると検査が丸ごと消える母集団の床** (2026-09-25 · パス 467)。
 *
 * このゲートは 2026-08-22 に同じ家系を 2 度直している —— `org` を消すと
 * 不変条件 7〜11 が、`policy.cycles` を消すと 12 が、**静かに検査対象外**に
 * なった。どちらも「鍵を必須にする」で閉じた。ところが**配列を空にする**側は
 * 残っていた。実測 (2026-09-25 · 実物の registry を 1 か所ずつ壊す):
 *
 * | 壊し方 | exit | 何が起きたか |
 * | --- | ---: | --- |
 * | `rounds: []` | **0** | 「rounds: 0 / 直近 round 0 は 0 チーム」と刷って ✅ (不変条件 2〜5 が空虚) |
 * | `policy.minTeamsForRound: []` | **0** | 最低チーム数 (不変条件 3) がまるごと消えて ✅ |
 * | `org.secretaries` を消す | **0** | 「秘書室 0室(計0体)」と刷って ✅ |
 * | `teams: []` | 1 | 鳴る —— ただし round / 管理職の参照が外れる**副作用**で、床としてではない |
 * | `backlog: []` | **0** | **床を置かない** (下記) |
 *
 * ★ **`backlog` だけは床を置かない** —— 着手候補が片付けば 0 件になりうるので、
 * 実測に張り付けた床は**直した日に落ちる門**になる (パス 378 の tick 台帳と
 * 同じ形)。空の backlog では「id が一意 / team が実在」が空虚に成立するが、
 * それは**確かめる物が無い**のであって、消えた検査ではない。
 */
function checkPopulations(reg) {
  const problems = [];
  const need = [
    ['teams', reg.teams, '一般職 (teams) が 0 件 —— round と管理職の参照検査が空虚になる'],
    ['rounds', reg.rounds, 'rounds が 0 件 —— 単調増加・最低チーム数・teamCount の一致 (不変条件 2〜5) がまるごと空虚になる'],
    ['policy.minTeamsForRound', reg.policy && reg.policy.minTeamsForRound,
      'policy.minTeamsForRound が 0 件 —— 最低チーム数 (不変条件 3) がどの round にも当たらなくなる'],
    ['org.executives', reg.org && reg.org.executives, '役員が 0 名 —— 秘書室・管理職の所属検査が空虚になる'],
    ['org.managers', reg.org && reg.org.managers, '管理職が 0 名 —— 全 active team の所属検査 (不変条件 11) が空虚になる'],
    ['org.secretaries', reg.org && reg.org.secretaries,
      '秘書室が 0 室 —— 不変条件 9b は「各 AI役員 に 1 室を常設」と述べている'],
  ];
  for (const [name, arr, why] of need) {
    if (!Array.isArray(arr) || arr.length === 0) problems.push(`${name}: ${why}`);
  }
  return problems;
}

function selfTest() {
  const base = () => ({
    teams: [{ id: 't' }],
    rounds: [{ round: 1 }],
    policy: { minTeamsForRound: [{ round: 1, minTeams: 1 }] },
    org: { executives: [{ id: 'e' }], managers: [{ id: 'm' }], secretaries: [{ id: 's' }] },
    backlog: [],
  });
  const strip = (mut) => {
    const reg = base();
    mut(reg);
    return checkPopulations(reg).length;
  };
  const cases = [
    ['健全な registry は 0 件', (r) => r, 0],
    ['★ rounds を空にすると鳴る', (r) => { r.rounds = []; }, 1],
    ['★ minTeamsForRound を空にすると鳴る', (r) => { r.policy.minTeamsForRound = []; }, 1],
    ['★ 秘書室を消すと鳴る', (r) => { delete r.org.secretaries; }, 1],
    ['★ teams を空にすると鳴る', (r) => { r.teams = []; }, 1],
    ['★ 役員を空にすると鳴る', (r) => { r.org.executives = []; }, 1],
    ['★ 管理職を空にすると鳴る', (r) => { r.org.managers = []; }, 1],
    ['配列でなければ鳴る (鍵の綴りが変わった形)', (r) => { r.rounds = {}; }, 1],
    ['空の backlog は鳴らない (課題が片付けば 0 になる)', (r) => { r.backlog = []; }, 0],
    ['まとめて空にすると全部鳴る', (r) => { r.rounds = []; r.teams = []; r.policy.minTeamsForRound = []; }, 3],
  ];
  let bad = 0;
  for (const [name, mut, want] of cases) {
    const got = strip(mut);
    const pass = got === want;
    if (!pass) bad += 1;
    say(`  ${pass ? '✓' : '✗'} ${name}: ${got} 件 (期待 ${want})`);
  }

  // 不変条件 13 —— 派生索引 teamFirstRound (パス 483)。
  const rounds = [
    { round: 1, teams: ['a', 'b'] },
    { round: 2, teams: ['a', 'b', 'c'] },
  ];
  const good = () => ({ a: 1, b: 1, c: 2 });
  const indexCases = [
    ['健全な索引は 0 件', good(), rounds, 0],
    ['★ 新しいチームの行が無い (round を足して引き直さなかった形)', { a: 1, b: 1 }, rounds, 1],
    ['★ 初出が違う (最後に出た round を書いた形)', { a: 2, b: 1, c: 2 }, rounds, 1],
    ['★ どの round にも現れない行が残る (逆向き)', { ...good(), zz: 1 }, rounds, 1],
    ['★ 索引が無い / object でない', undefined, rounds, 1],
    ['配列は object と見なさない', [], rounds, 1],
    ['初出は配列の順ではなく番号の最小', { a: 1, b: 1, c: 2 }, [rounds[1], rounds[0]], 0],
    ['文字列の番号は数と見なさない', { a: '1', b: 1, c: 2 }, rounds, 1],
  ];
  for (const [name, stored, rs, want] of indexCases) {
    const got = teamFirstRoundProblems(stored, rs).length;
    const pass = got === want;
    if (!pass) bad += 1;
    say(`  ${pass ? '✓' : '✗'} ${name}: ${got} 件 (期待 ${want})`);
  }
  // 不変条件 14 —— 宣言をすべて満たす (パス 484)。判定は共有の検証器 1 つ。
  const miniSchema = {
    type: 'object',
    required: ['teams', 'backlog'],
    properties: {
      teams: { type: 'array', items: { type: 'object', required: ['id', 'domain', 'active'], properties: {
        id: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' }, domain: { type: 'string' }, active: { type: 'boolean' },
      } } },
      backlog: { type: 'array', items: { type: 'object', properties: {
        status: { type: 'string', enum: ['designed', 'shipped'] }, title: { type: 'string', minLength: 1, maxLength: 3 },
      } } },
    },
  };
  const okReg = () => ({ teams: [{ id: 't', domain: 'd', active: true }], backlog: [{ status: 'designed', title: 'abc' }] });
  const schemaCases = [
    ['健全な台帳は 0 件', (r) => r, miniSchema, 0],
    ['★ status の綴り違い (designd) は鳴る', (r) => { r.backlog[0].status = 'designd'; }, miniSchema, 1],
    ['★ active が文字列 "false" は鳴る (真として数えられる形)', (r) => { r.teams[0].active = 'false'; }, miniSchema, 1],
    ['★ domain が無いチームは鳴る (村とチャットの振り分けが投げる形)', (r) => { delete r.teams[0].domain; }, miniSchema, 1],
    ['★ 空の題名は鳴る (minLength)', (r) => { r.backlog[0].title = ''; }, miniSchema, 1],
    ['★ 題名は文字で数える (絵文字 3 字は 3 字 —— 通る)', (r) => { r.backlog[0].title = '😀😀😀'; }, miniSchema, 0],
    ['★ 題名が長すぎれば鳴る (maxLength)', (r) => { r.backlog[0].title = 'abcd'; }, miniSchema, 1],
    ['★ 知らないキーワードは宣言の側で鳴る (黙って読み飛ばさない)', (r) => r, { ...miniSchema, format: 'x' }, 1],
  ];
  for (const [name, mut, sch, want] of schemaCases) {
    const reg = okReg();
    mut(reg);
    const got = validateAgainstSchema(sch, reg).length;
    const pass = got === want;
    if (!pass) bad += 1;
    say(`  ${pass ? '✓' : '✗'} ${name}: ${got} 件 (期待 ${want})`);
  }
  if (bad > 0) {
    sayErr(`\n❌ self-test ${bad} 件が不一致`);
    process.exit(1);
  }
  say('✅ self-test 全件一致');
}

/**
 * 検査する registry の道。既定は実物で、`--registry <path>` で差し替えられる。
 *
 * ★ **継ぎ目を開けたのは「床を main から外す」対照が鳴らなかったため**
 * (2026-09-25 · パス 467)。`checkPopulations` を借りる検査は床の**中身**しか
 * 見ないので、`main` がそれを**呼ばなくなっても**両方の層が黙った
 * (実測: self-test ✗0 / 検査 0 失敗 / 実物は exit 0 に戻る)。
 * **鳴らない対照は合格ではなく、その検査についての報せ**なので、門を丸ごと
 * 走らせられるようにした。
 */
function registryPath() {
  const i = process.argv.indexOf('--registry');
  return i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : REGISTRY;
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const wantPlan = process.argv.includes('--plan');
  const raw = fs.readFileSync(registryPath(), 'utf8');
  let reg;
  try {
    reg = JSON.parse(raw);
  } catch (e) {
    fail([`registry.json が JSON として解析できません: ${e.message}`]);
  }

  const problems = [];

  // 1. 必須キー。
  /*
   * `org` を必須にしたのは 2026-08-22。それまで下の組織階層の検証は
   * `if (reg.org)` で丸ごと囲まれていて、**`org` を消すと不変条件 7〜11 が
   * 静かに検査対象外**になった。対照実験で確認: CEO / COO / 役員 5 /
   * 秘書室 5 室 / 管理職 8 と「全 active team は管理職に 1 つだけ属する」を
   * まとめて消しても、このゲートは
   *
   *   ✅ orchestration registry OK — 組織: CEO 1 / COO 0 / 役員 0 / 管理職 0 …
   *
   * と exit 0 を返した。`org` を残したまま中身を空にした場合は 108 件鳴る
   * (検査自体は生きている) ので、穴は外側の条件 1 つだけだった。
   */
  // 一覧は宣言 (registry.schema.json の required) から読む —— 2026-09-26 まで門が
  // 自分で並べており、宣言のほうは `org` を落としていた (門より弱い宣言)。
  const schema = loadSchema();
  for (const key of schema.required) {
    if (!Object.hasOwn(reg, key)) problems.push(`必須キー "${key}" がありません`);
  }
  if (problems.length) fail(problems);

  // 14. 宣言をすべて満たす (パス 484)。下の不変条件は形が合っていることを前提に
  //     書かれている (`team.domain` を文字列として読む等) ので、先に落とす。
  problems.push(...validateAgainstSchema(schema, reg).map((p) => `宣言 (registry.schema.json) に合いません: ${p}`));
  if (problems.length) fail(problems);

  // 母集団の床 (空にすると下の不変条件が丸ごと空虚になる物)。
  problems.push(...checkPopulations(reg));
  if (problems.length) fail(problems);

  // teams の id 集合。
  const teamIds = new Set();
  for (const t of reg.teams) {
    if (!/^[a-z][a-z0-9-]*$/.test(t.id || '')) problems.push(`team id が不正: ${JSON.stringify(t.id)}`);
    if (teamIds.has(t.id)) problems.push(`team id が重複: ${t.id}`);
    teamIds.add(t.id);
  }

  // --- 組織階層 (org) の検証: CEO(人間) → COO(オーケストレーター) → 役員層 →
  //     管理職層 → 一般職層 ---
  // 7. CEO は AI に配置しない (人間=オーナー)。8. COO は CEO 直属で AI 非配置
  //    (実装本体)。9. 役員は COO 直属。10. 各管理職は実在の役員 or COO直轄に属し、
  //    束ねる teams は実在。11. 全 active team は実在の管理職に 1 つだけ属する。
  // `org` は上で必須キーとして検証済み (欠けていれば fail 済み)。
  // 条件で囲むと「消せば検査が消える」形に戻るので、素のブロックにする。
  {
    const org = reg.org;
    const ceoId = org.ceo && org.ceo.id;
    if (org.ceo && org.ceo.staffedByAI === true) {
      problems.push('org.ceo.staffedByAI は false であること (CEO は人間=オーナー。AIに配置しない)');
    }
    const execIds = new Set((org.executives || []).map((e) => e.id));
    const mgrIds = new Set((org.managers || []).map((m) => m.id));

    // 8. COO (オーケストレーター) は CEO 直属で AI 非配置。
    const coo = org.coo;
    if (!coo) {
      problems.push('org.coo がありません (COO=オーケストレーターを CEO 直下に配置すること)');
    } else {
      if (coo.reportsTo !== ceoId) {
        problems.push(`COO ${coo.id} の reportsTo は CEO であること (現在: ${coo.reportsTo})`);
      }
      if (coo.staffedByAI === true) {
        problems.push('org.coo.staffedByAI は false であること (COO はオーケストレーター本体。研究Agentには配置しない)');
      }
      for (const o of coo.owns || []) {
        if (!execIds.has(o) && !mgrIds.has(o)) {
          problems.push(`COO が未知の配下 "${o}" を保有 (役員 or 管理職であること)`);
        }
      }
    }
    const cooId = coo && coo.id;

    // 9. 役員は COO 直属。役員の owns は実在の管理職。
    for (const e of org.executives || []) {
      if (e.reportsTo !== cooId) {
        problems.push(`役員 ${e.id} の reportsTo は COO であること (現在: ${e.reportsTo})`);
      }
      for (const m of e.owns || []) {
        if (!mgrIds.has(m)) problems.push(`役員 ${e.id} が未知の管理職 "${m}" を保有`);
      }
    }

    // 9b. 秘書室: 各 "AI役員" に 1 室 (4 体の AI チーム) を常設し継続サポートする。
    //     支援先 (supports) は AI役員 のみ (人間のCEO・オーケストレーターのCOOは対象外) /
    //     メンバーは 4 体 / id 一意 / 全役員に過不足なく 1 室 (役員と秘書室は 1 対 1)。
    const secIds = new Set();
    const supportedExecs = new Map();
    const nonExecIds = new Set([ceoId, cooId].filter(Boolean));
    for (const s of org.secretaries || []) {
      if (secIds.has(s.id)) problems.push(`秘書室 id が重複: ${s.id}`);
      secIds.add(s.id);
      if (nonExecIds.has(s.supports)) {
        problems.push(`秘書室 ${s.id} の supports は AI役員 であること (CEO/COO は支援先にできない: "${s.supports}")`);
      } else if (!execIds.has(s.supports)) {
        problems.push(`秘書室 ${s.id} の supports が未知の AI役員 "${s.supports}"`);
      } else if (supportedExecs.has(s.supports)) {
        problems.push(`役員 ${s.supports} に秘書室が重複 (${supportedExecs.get(s.supports)} / ${s.id})`);
      } else {
        supportedExecs.set(s.supports, s.id);
      }
      if (s.members !== 4) problems.push(`秘書室 ${s.id} は 4 体であること (現在: ${s.members})`);
      if (s.staffedByAI === false) problems.push(`秘書室 ${s.id} は AI 配置であること (staffedByAI=true)`);
    }
    /*
     * 全役員がちょうど 1 室を持つ (常設サポート)。
     *
     * ★ 2026-09-25 まで `if ((org.secretaries || []).length > 0)` で囲まれており、
     * **全室を消すとこの検査ごと消えて緑のまま**だった —— このファイルが
     * 2026-08-22 に `if (reg.org)` について直した当の形である。囲いを外した。
     *
     * ★ **「任意か常設か」は勝手に決めていない** —— 冒頭の不変条件 9b は
     * 「各 "AI役員" に 1 室 (4 体の AI チーム) を**常設**し継続サポートする」と
     * 書き、`--plan` の組織図も「(常設サポート)」と刷る。**リポジトリは既に
     * 常設と宣言していて、囲いだけがそれを任意として扱っていた**。
     * 室の存在そのものは `checkPopulations` の床が見る。
     */
    for (const e of org.executives || []) {
      if (!supportedExecs.has(e.id)) problems.push(`役員 ${e.id} に秘書室が未配置 (各役員に1室を常設)`);
    }

    // 10. 各管理職が属する上位 (役員 or COO直轄) の owns に含まれるか (双方向整合)。
    const mgrToOwner = new Map();
    for (const e of org.executives || []) for (const m of e.owns || []) mgrToOwner.set(m, e.id);
    for (const m of (coo && coo.owns) || []) if (mgrIds.has(m)) mgrToOwner.set(m, cooId);
    const ownerIds = new Set([...execIds, cooId]);
    for (const m of org.managers || []) {
      if (!ownerIds.has(m.reportsTo)) {
        problems.push(`管理職 ${m.id} の reportsTo が未知の上位 "${m.reportsTo}" (役員 or COO であること)`);
      } else if (mgrToOwner.get(m.id) !== m.reportsTo) {
        problems.push(`管理職 ${m.id} の reportsTo(${m.reportsTo}) と上位の owns が不一致`);
      }
      for (const t of m.teams || []) {
        if (!teamIds.has(t)) problems.push(`管理職 ${m.id} が未知の team "${t}" を保有`);
      }
    }
    // 11. 全 active team が実在の管理職に 1 つだけ属する。
    const teamToMgr = new Map();
    for (const m of org.managers || []) for (const t of m.teams || []) {
      if (teamToMgr.has(t)) problems.push(`team ${t} が複数の管理職に属する (${teamToMgr.get(t)} / ${m.id})`);
      teamToMgr.set(t, m.id);
    }
    for (const t of reg.teams) {
      if (!t.active) continue;
      if (!t.manager || !mgrIds.has(t.manager)) {
        problems.push(`team ${t.id} の manager が未設定 or 未知 (${t.manager})`);
      } else if (teamToMgr.get(t.id) !== t.manager) {
        problems.push(`team ${t.id} の manager(${t.manager}) と管理職の teams が不一致`);
      }
    }
  }

  // minTeamsForRound のマップ。
  const minTeams = new Map();
  for (const e of reg.policy.minTeamsForRound || []) minTeams.set(e.round, e.minTeams);

  // 2/3/4/5. rounds の検証。
  let prevCount = 0;
  const seenRounds = new Set();
  for (const r of reg.rounds) {
    if (seenRounds.has(r.round)) problems.push(`round ${r.round} が重複`);
    seenRounds.add(r.round);
    // 5. teamCount と teams.length の一致。
    if (r.teamCount !== r.teams.length) {
      problems.push(`round ${r.round}: teamCount=${r.teamCount} が teams.length=${r.teams.length} と不一致`);
    }
    // 2. 単調増加。
    if (r.teamCount < prevCount) {
      problems.push(`round ${r.round}: teamCount=${r.teamCount} が前ラウンド(${prevCount})より少ない (単調増加に違反)`);
    }
    prevCount = Math.max(prevCount, r.teamCount);
    // 3. 最低チーム数。
    const min = minTeams.get(r.round);
    if (min !== undefined && r.teamCount < min) {
      problems.push(`round ${r.round}: teamCount=${r.teamCount} が policy の最低(${min})未満`);
    }
    // 4. 参照する team が実在。
    for (const id of r.teams) {
      if (!teamIds.has(id)) problems.push(`round ${r.round}: 未知の team "${id}"`);
    }
  }

  // 13. 製品が読む派生索引 teamFirstRound は rounds から導いた物と両方向に一致する。
  //     製品 (村のディスパッチ計画) は rounds (160 KB) を import せずにこの索引だけを
  //     読むので、ここが食い違うと村の並び順が台帳の履歴と黙って食い違う。
  //     直し方: `node scripts/orchestrate.cjs record …` で round を足せば引き直される。
  problems.push(...teamFirstRoundProblems(reg.teamFirstRound, reg.rounds));

  // 6. backlog の検証。
  const backlogIds = new Set();
  for (const b of reg.backlog) {
    if (backlogIds.has(b.id)) problems.push(`backlog id が重複: ${b.id}`);
    backlogIds.add(b.id);
    if (!teamIds.has(b.team)) problems.push(`backlog "${b.id}": 未知の team "${b.team}"`);
  }

  // 12. サイクル定義 (v3): policy.cycles があれば、各サイクルは非空のステージ配列で、
  //     各ステージは stage / owner / desc(文字列) を持つ (parallel は任意 boolean)。
  //     実行ランタイム (orchestrate.cjs) が依存するため構造を強制する。
  /*
   * `policy.cycles` を必須にしたのは 2026-08-22。上のコメントが
   * 「実行ランタイム (orchestrate.cjs) が依存するため構造を強制する」と
   * 言っているのに、**キーごと消せば検査が丸ごと飛んで緑になった**
   * (対照実験で確認)。`orchestrate.cjs` は `|| {}` で落ちはしないが、
   * 使えるサイクルが 0 件になり dispatch が全部 "未知のサイクル" になる。
   */
  if (!reg.policy || !reg.policy.cycles) {
    problems.push('policy.cycles がありません (orchestrate.cjs が依存する構造)');
  } else {
    for (const [name, stages] of Object.entries(reg.policy.cycles)) {
      if (name === 'description') continue;
      if (!Array.isArray(stages) || stages.length === 0) {
        problems.push(`policy.cycles.${name} は非空の配列であること`);
        continue;
      }
      stages.forEach((s, i) => {
        for (const key of ['stage', 'owner', 'desc']) {
          if (typeof s[key] !== 'string' || s[key] === '') {
            problems.push(`policy.cycles.${name}[${i}] の "${key}" が文字列でない`);
          }
        }
        if ('parallel' in s && typeof s.parallel !== 'boolean') {
          problems.push(`policy.cycles.${name}[${i}] の "parallel" は boolean であること`);
        }
      });
    }
  }

  if (problems.length) fail(problems);

  const lastRound = reg.rounds.reduce((m, r) => Math.max(m, r.round), 0);
  const lastCount = reg.rounds.find((r) => r.round === lastRound)?.teamCount ?? 0;
  const execCount = reg.org ? (reg.org.executives || []).length : 0;
  const mgrCount = reg.org ? (reg.org.managers || []).length : 0;
  const cooCount = reg.org && reg.org.coo ? 1 : 0;
  const secList = reg.org ? reg.org.secretaries || [] : [];
  const secMembers = secList.reduce((s, x) => s + (x.members || 0), 0);
  /*
   * 0 室でも表示する。以前は `length > 0` のときだけ出していたので、
   * **全室を消すと出力から消えるだけで緑のまま**だった (対照実験で確認)。
   *
   * ★ **ここに在った「秘書室を必須にはしない ... 0 室になったら CI の出力で
   * そう分かる」は 2026-09-25 (パス 467) に撤回した** —— 緑のゲートの成功行は
   * 誰も読まないので、**出力に出すことは検査することではない**。実測でも
   * `org.secretaries` を消すと「秘書室 0室(計0体)」と刷って **exit 0** だった。
   * 「どちらが意図かコードからは決まらない」も偽で、冒頭の不変条件 9b と
   * `--plan` の組織図が**どちらも「常設」と述べている** —— 決まっていなかった
   * のではなく、囲いだけがそれを読んでいなかった。
   */
  const secLabel = `秘書室 ${secList.length}室(計${secMembers}体) / `;
  say(
    `✅ orchestration registry OK — 組織: CEO 1 / COO ${cooCount} / 役員 ${execCount} / ${secLabel}管理職 ${mgrCount} / 一般職(teams) ${reg.teams.length} / ` +
    `rounds: ${reg.rounds.length} / 直近 round ${lastRound} は ${lastCount} チーム / backlog 未着手: ` +
    `${reg.backlog.filter((b) => b.status === 'designed').length} 件`,
  );

  if (wantPlan && reg.org) {
    const managers = reg.org.managers || [];
    const mgrById = (id) => managers.find((x) => x.id === id);
    const printManager = (mid, indent) => {
      const m = mgrById(mid);
      if (m) say(`${indent}└ ${m.title} [${m.id}] — ${m.teams.length} チーム`);
    };
    const secOf = (execId) => (reg.org.secretaries || []).find((s) => s.supports === execId);
    say('\n🏢 組織図 (CEO → COO → 役員層(+秘書室) → 管理職層 → 一般職層):');
    say(`  CEO: ${reg.org.ceo.title}`);
    const coo = reg.org.coo;
    if (coo) {
      say(`   └ ${coo.title} [${coo.id}]`);
      // COO 直轄の管理職 (owns のうち管理職 id)。
      for (const oid of coo.owns || []) {
        if (mgrById(oid)) printManager(oid, '       ');
      }
      // COO 配下の役員 → 秘書室 + その配下の管理職。
      for (const e of reg.org.executives || []) {
        say(`       └ ${e.title} [${e.id}]`);
        const sec = secOf(e.id);
        if (sec) say(`           └ 🗂 ${sec.title} [${sec.id}] — ${sec.members}体 (常設サポート)`);
        for (const mid of e.owns || []) printManager(mid, '           ');
      }
    }
  }

  if (wantPlan) {
    const nextRound = lastRound + 1;
    // 進化ルール: 次ラウンドは直近以上、かつ最低 +1 チームで細分化を促す。
    const nextMinTeams = Math.max(lastCount + 1, minTeams.get(nextRound) ?? 0);
    const designed = reg.backlog
      .filter((b) => b.status === 'designed')
      .sort((a, b) => a.priority - b.priority);
    say(`\n📋 次ラウンド計画 (round ${nextRound}):`);
    say(`  - 推奨チーム数: ${nextMinTeams} 以上 (前ラウンド ${lastCount} から単調増加)`);
    say(`  - 着手候補 (優先度順):`);
    for (const b of designed) {
      const team = reg.teams.find((t) => t.id === b.team);
      say(`      [P${b.priority}] ${b.title}  (担当: ${team ? team.domain : b.team})`);
    }
    if (designed.length < nextMinTeams) {
      say(
        `  - ⚠ designed backlog (${designed.length}) が推奨チーム数 (${nextMinTeams}) 未満。` +
        `新領域の調査チームを追加して論点を補充すること。`,
      );
    }
  }
}

if (require.main === module) main();

module.exports = { checkPopulations };
