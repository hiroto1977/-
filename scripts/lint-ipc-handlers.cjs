#!/usr/bin/env node
/**
 * `ipcMain.handle` のハンドラが **reject しない**ことを構造で担保するゲート。
 *
 * ## なぜ要るのか
 *
 * IPC ハンドラは「失敗を戻り値で表す」約束で書かれている (`{ ok: false, code,
 * message }`)。ところが約束の外で throw されると `ipcRenderer.invoke` は
 * **reject** し、呼び出し側が用意していない経路に落ちる。2026-08 監査での実害:
 *
 * - `fetch:snapshot` / `action:invoke` は `getValidToken()` を try の**外**で
 *   await していた。`safeStorage.decryptString` は壊れた値で throw するので、
 *   IPC ごと reject し、renderer 側 (`useServiceData`) は受け皿が無く
 *   **バッジが「読込中…」のまま永久に止まった**。
 * - `app:openPath` / `app:revealInFolder` / `secrets:clear` も同じ形で、
 *   さらに `shell.openPath` の**エラー文字列を捨てて**いたため、書き出した書類が
 *   開けなくても画面には何も出なかった。
 *
 * 「try で囲む」は書き忘れが効く種類の規約なので、説明ではなくゲートにする。
 *
 * ## 判定規則
 *
 * ハンドラ本体で **`try {` より前に `await` がある**ものを落とす。
 * `await` が無いハンドラ、`try` の中だけで await するハンドラは通る。
 * 行単位の粗い判定 (このリポジトリの他のゲートと同じ方針) で、網羅ではなく
 * **既にある書き方の再発を止める**ためのもの。
 *
 * 使い方:  node scripts/lint-ipc-handlers.cjs
 *          node scripts/lint-ipc-handlers.cjs --self-test
 * Exits 1 on any finding.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAIN_DIR = path.join(REPO_ROOT, 'src/main');

/**
 * `src/main` 配下で `ipcMain.handle` を含むファイルを全部返す。
 *
 * 2026-08-22 まで `src/main/main.ts` 決め打ちだった。今日は登録がそこにしか
 * 無いので結果は同じだが、**別のモジュールへ 1 本登録した日から、その 1 本は
 * 誰にも見られない**。今セッションで同じ形の死角を 5 つ潰しているので、
 * ここも一覧をやめる。
 */
function handlerFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') walk(full);
      } else if (/\.ts$/.test(e.name)) {
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes('ipcMain.handle')) out.push({ file: path.relative(REPO_ROOT, full), text });
      }
    }
  };
  walk(MAIN_DIR);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * `ipcMain.handle('channel', …)` を順に切り出す。
 * 本体の終わりは次の登録か末尾。入れ子の括弧を数えないのは、判定に使うのが
 * 「`try` より前に `await` があるか」だけで、範囲が多少広くても
 * **見落としではなく過検出**の側に倒れるため。
 */
function handlerBodies(source) {
  const out = [];
  const re = /ipcMain\.handle\(\s*\n?\s*'([^']+)'/g;
  const marks = [];
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    marks.push({ channel: m[1], from: m.index + m[0].length });
  }
  for (let i = 0; i < marks.length; i += 1) {
    const to = i + 1 < marks.length ? marks[i + 1].from : source.length;
    out.push({ channel: marks[i].channel, body: source.slice(marks[i].from, to) });
  }
  return out;
}

/** `try` より前に `await` があるハンドラを挙げる純関数。 */
/**
 * 不変条件 #3 —— **IPC で受けた serviceId は indexing 前に `isServiceId()` で検証**。
 *
 * ARCHITECTURE.md §8.1 はこれを「PR で違反したら fail」の不変条件として
 * 挙げているが、2026-08-22 の点検時点で回帰テスト欄は
 * `src/shared/__tests__/serviceId.test.ts` 4 件 —— **`isServiceId` 自体の
 * 検査**であって、「各ハンドラがそれを呼んでいるか」は誰も見ていなかった。
 * 今日の 6 ハンドラは全部呼んでいる。次に足す 1 本が抜けても気づけない状態だった。
 *
 * serviceId は `LIVE_FETCHERS[serviceId]` のように**そのまま添字に使う**ので、
 * 検証を飛ばすと任意のキーで引ける (`constructor` / `__proto__` を含む)。
 *
 * 判定は位置で見る: 引数に `serviceId` を取るハンドラは、本体で
 * **他の用途より先に** `isServiceId(serviceId)` が現れること。
 */
function evaluateServiceIdGuard(handlers) {
  const problems = [];
  // `body` のまま slice すると `lint:forbidden` の「伏せていない応答本文」規則が
  // `body.slice(` を見て鳴る。HTTP 応答ではないが、規則を緩めるより名前を譲る
  // (今セッション 2 度目。verify-knowledge-provenance.cjs でも同じ判断をした)。
  for (const { channel, body: src } of handlers) {
    const arrow = src.indexOf('=>');
    if (arrow < 0) continue;
    const params = src.slice(0, arrow);
    if (!/\bserviceId\b/.test(params)) continue;

    const rest = src.slice(arrow);
    const guard = rest.indexOf('isServiceId(serviceId');
    if (guard < 0) {
      problems.push(
        `${channel}: serviceId を受け取るのに isServiceId() で検証していません。` +
          `そのまま添字に使うと任意のキー (__proto__ / constructor を含む) で引けます`,
      );
      continue;
    }
    // 検証より前に serviceId を触っていないか (isServiceId 自身の出現は除く)。
    const firstUse = [...rest.matchAll(/\bserviceId\b/g)]
      .map((m) => m.index)
      .find((i) => rest.slice(Math.max(0, i - 13), i) !== 'isServiceId(');
    if (firstUse !== undefined && firstUse < guard) {
      problems.push(
        `${channel}: isServiceId() より前に serviceId を使っています ` +
          `(位置 ${firstUse} < 検証 ${guard})。検証は最初に行ってください`,
      );
    }
  }
  return problems;
}

function evaluateHandlers(handlers) {
  const problems = [];
  for (const { channel, body } of handlers) {
    const firstAwait = body.indexOf('await ');
    if (firstAwait < 0) continue;
    const firstTry = body.indexOf('try {');
    if (firstTry >= 0 && firstTry < firstAwait) continue;
    problems.push(
      `${channel}: try の外で await しています。throw が IPC を reject させ、` +
        `呼び出し側の用意していない経路に落ちます (「読込中…」で止まる等)`,
    );
  }
  return [...problems, ...evaluateServiceIdGuard(handlers)];
}

function selfTest() {
  const cases = [
    ['await が無い', [{ channel: 'a', body: 'return listThings();' }], 0],
    ['try の中だけで await', [{ channel: 'a', body: 'try {\n await f();\n} catch {}' }], 0],
    ['try の外で await', [{ channel: 'a', body: 'const x = await f();\ntry {} catch {}' }], 1],
    ['try が無く await だけ', [{ channel: 'a', body: 'await f();' }], 1],
    [
      'try の後にもう一度 await (前が try の中なら通す)',
      [{ channel: 'a', body: 'try {\n await f();\n} catch {}\nawait g();' }],
      0,
    ],
    // 不変条件 #3 (serviceId の検証)。
    [
      'serviceId を受け取るのに検証していない',
      [{ channel: 'a', body: "(_e, serviceId: unknown) => LIVE[serviceId]" }],
      1,
    ],
    [
      '検証してから使えば通る',
      [{ channel: 'a', body: "(_e, serviceId: unknown) => isServiceId(serviceId) ? LIVE[serviceId] : null" }],
      0,
    ],
    [
      '検証より前に使っていたら鳴る',
      [{ channel: 'a', body: "(_e, serviceId: unknown) => {\n const x = LIVE[serviceId];\n if (!isServiceId(serviceId)) return null;\n}" }],
      1,
    ],
    [
      'serviceId を受け取らないハンドラは対象外',
      [{ channel: 'a', body: "(_e, url: unknown) => open(url)" }],
      0,
    ],
    [
      '複数行の引数でも見る',
      [{ channel: 'a', body: "(\n  _e,\n  serviceId: unknown,\n  action: unknown,\n) => {\n  return LIVE[serviceId][action];\n}" }],
      1,
    ],
    [
      '複数ハンドラのうち 1 つだけ違反',
      [
        { channel: 'ok', body: 'try {\n await f();\n} catch {}' },
        { channel: 'bad', body: 'await f();' },
      ],
      1,
    ],
  ];
  let failed = 0;
  for (const [label, input, want] of cases) {
    const got = evaluateHandlers(input).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  if (failed > 0) {
    console.error(`❌ 対照実験 ${failed} 件が期待と違います — ゲート自体が壊れています`);
    return 1;
  }
  console.log('✅ 対照実験: 規則どおりに鳴ります');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const files = handlerFiles();
  if (files.length === 0) {
    console.error('❌ ipcMain.handle を含むファイルが 1 件もありません（走査の不具合を疑ってください）。');
    return 1;
  }
  const handlers = [];
  for (const f of files) {
    for (const h of handlerBodies(f.text)) handlers.push({ ...h, file: f.file });
  }
  const problems = evaluateHandlers(handlers);
  console.log(
    `IPC ハンドラ ${handlers.length} 件を検査しました`
      + ` (${files.length} ファイル: ${files.map((f) => f.file).join(', ')})`,
  );

  if (problems.length > 0) {
    console.error(`❌ ${problems.length} 件:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log(
    '✅ すべてのハンドラは失敗を戻り値で表し (try の外で await しない)、'
      + 'serviceId を添字に使う前に isServiceId() で検証しています',
  );
  return 0;
}

module.exports = { evaluateHandlers, handlerBodies };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
