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
 * ハンドラ本体の **`await` が、`catch` を持つ `try` ブロックの中に無い**ものを
 * 落とす。`await` が無いハンドラは通る。
 *
 * ### 2026-08-22: 「前にあるか」から「中にあるか」へ
 *
 * それまでの規則は `body.indexOf('try {') < body.indexOf('await ')` ——
 * **try が await より前に在ればよい**という位置判定だった。これは
 * `try { … } catch { … }` を**抜けた後**の await を通してしまう:
 *
 * ```ts
 * ipcMain.handle('app:openExternal', async (_e, url: string) => {
 *   try { parsed = new URL(url); } catch { return; }   // ← ここに try が在るので
 *   await openExternal(parsed.toString());             // ← ここは見られていなかった
 * });
 * ```
 *
 * この形は**このゲートを入れた時点から既に存在していた**。ゲートは緑で、
 * 守っている対象は守られていなかった (`app:openExternal` は `shell` が
 * reject すると IPC ごと reject する)。関門を切り出す作業で try が消えた
 * ときに初めて鳴り、そこで気付いた。
 *
 * 今は文字列・テンプレート・コメントを飛ばしながら波括弧を数え、
 * `try` ブロックの範囲を実際に求める。`catch` の無い `try {} finally {}` は
 * reject を止めないので**中に在っても通さない**。
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
 * `src/main/clients` 配下の全 `.ts` を返す (action ハンドラの置き場)。
 */
function clientFiles() {
  const dir = path.join(MAIN_DIR, 'clients');
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || !/\.ts$/.test(e.name)) continue;
    const full = path.join(dir, e.name);
    out.push({ file: path.relative(REPO_ROOT, full), text: fs.readFileSync(full, 'utf8') });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** `ctx.payload` から書き出し先パスを取り出している形。 */
const TAKES_PAYLOAD_PATH = [
  // const { path: customPath, … } = ctx.payload as ExportPayload;
  /\{[^}]*\bpath\b[^}]*\}\s*=\s*ctx\.payload/,
  // (ctx.payload as X).path / ctx.payload.path
  /ctx\.payload[^;\n]*\)?\.path\b/,
];

/**
 * **不変条件 #4: レンダラーが渡してきた書き出し先は、必ず関門を通す。**
 *
 * `isSafeExportPath` (`clients/exportPaths.ts`) は「$HOME 配下」「拡張子一致」
 * 「制御文字なし」「長さ上限」をまとめて見る唯一の関門で、書き出し系 4 サービス
 * (business / stocks / templates / teamradar) の 6 経路が全部ここを通っている
 * ——「今日は」。この 2 つを結んでいるものは何も無く、**新しい書き出し action を
 * 別のクライアントに足した人が呼び忘れれば、その瞬間に $HOME 配下の任意の場所へ
 * 書けるようになる** (`shell.openPath` の関門と対になる、書き込み側の入口)。
 *
 * 判定はファイル単位 —— `ctx.payload` から `path` を取り出しているファイルは
 * `isSafeExportPath` を参照していること。「import はしたが 1 箇所で呼び忘れた」
 * までは見ない (行単位の粗い判定という他ゲートと同じ方針)。狙いは
 * **関門の存在を知らずに新しい経路を生やすこと**を止めることにある。
 *
 * @param files `[{ file, text }]` — 自己検査から合成入力を渡せるようにしてある
 * @returns 問題の説明の配列 (空なら健全)
 */
function exportPathProblems(files) {
  const problems = [];
  for (const f of files) {
    if (!TAKES_PAYLOAD_PATH.some((re) => re.test(f.text))) continue;
    if (f.text.includes('isSafeExportPath')) continue;
    problems.push(
      `${f.file}: ctx.payload から書き出し先 path を受けているのに isSafeExportPath を通していません`,
    );
  }
  return problems;
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

/**
 * 文字列・テンプレート・コメントの中を空白に潰した写しを返す。
 *
 * 波括弧を数えるのに、`'{'` や `` `${x}` `` やコメント中の `}` を数えては
 * ならない。**長さを保ったまま**潰すので、返り値の添字は元の添字と一致する。
 */
function blankOutLiterals(src) {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') out[i++] = ' ';
      continue;
    }
    if (c === '/' && d === '*') {
      out[i++] = ' ';
      out[i++] = ' ';
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < n) {
        out[i++] = ' ';
        out[i++] = ' ';
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out[i++] = ' ';
      while (i < n) {
        if (src[i] === '\\') {
          out[i] = ' ';
          if (i + 1 < n && src[i + 1] !== '\n') out[i + 1] = ' ';
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          out[i++] = ' ';
          break;
        }
        if (src[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * `catch` を持つ `try` ブロックの `{...}` の範囲を `[start, end]` で返す。
 *
 * `finally` だけの `try` は含めない —— reject を止めないので、
 * その中の await は「守られている」と数えてはいけない。
 */
function guardedTryRanges(blank) {
  const ranges = [];
  const re = /\btry\s*\{/g;
  let m;
  while ((m = re.exec(blank)) !== null) {
    const open = blank.indexOf('{', m.index);
    let depth = 0;
    let end = -1;
    for (let i = open; i < blank.length; i += 1) {
      if (blank[i] === '{') depth += 1;
      else if (blank[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    // 閉じ括弧の直後に catch が続いているか (空白を挟んでよい)。
    if (!/^\s*catch\b/.test(blank.slice(end + 1))) continue;
    ranges.push([open, end]);
  }
  return ranges;
}

function evaluateHandlers(handlers) {
  const problems = [];
  for (const { channel, body } of handlers) {
    const blank = blankOutLiterals(body);
    const ranges = guardedTryRanges(blank);
    const awaits = [...blank.matchAll(/\bawait\s/g)].map((a) => a.index);
    const bare = awaits.filter((i) => !ranges.some(([s, e]) => i > s && i < e));
    if (bare.length === 0) continue;
    problems.push(
      `${channel}: try の外で await しています (${bare.length} 箇所)。` +
        `throw が IPC を reject させ、` +
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
    // ここが 2026-08-22 に**期待値ごと変わった**ケース。以前は「try が前に
    // 在れば通す」だったので 0 を期待していた —— が、この形こそ
    // `app:openExternal` が長らく素通りしていた形そのものだった。
    [
      'try を抜けた後の await は通さない (旧規則が見逃していた形)',
      [{ channel: 'a', body: 'try {\n await f();\n} catch {}\nawait g();' }],
      1,
    ],
    [
      'try の前で await していても、後ろに try が在れば見逃していた形',
      [{ channel: 'a', body: 'const x = await f();\ntry {\n await g();\n} catch {}' }],
      1,
    ],
    [
      'catch の無い try/finally は守りにならない (reject は止まらない)',
      [{ channel: 'a', body: 'try {\n await f();\n} finally {\n cleanup();\n}' }],
      1,
    ],
    [
      '入れ子の波括弧を跨いでも try の中と数える',
      [{ channel: 'a', body: 'try {\n if (x) {\n  for (const y of z) {\n   await f(y);\n  }\n }\n} catch {}' }],
      0,
    ],
    [
      '文字列の中の await は数えない',
      [{ channel: 'a', body: "return { message: 'await f() は文字列' };" }],
      0,
    ],
    [
      'コメントの中の await は数えない',
      [{ channel: 'a', body: '// await f() と書きたくなるが\n/* await g() も */\nreturn 1;' }],
      0,
    ],
    [
      '文字列の中の波括弧で範囲を読み違えない',
      [{ channel: 'a', body: "try {\n const s = '}';\n await f();\n} catch {}" }],
      0,
    ],
    [
      'テンプレートの中の波括弧でも読み違えない',
      [{ channel: 'a', body: 'try {\n const s = `${x}}`;\n await f();\n} catch {}' }],
      0,
    ],
    [
      'catch の中の await は守られていない (そこが throw すれば reject する)',
      [{ channel: 'a', body: 'try {\n f();\n} catch {\n await report();\n}' }],
      1,
    ],
    [
      'await が複数外に出ていれば件数を数える',
      [{ channel: 'a', body: 'await f();\nawait g();\ntry {} catch {}' }],
      1,
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

  // 不変条件 #4 (payload の書き出し先)。ファイル単位なので別の入力で回す。
  const exportCases = [
    [
      '分割代入で path を受けるのに関門が無い',
      [{ file: 'a.ts', text: 'const { path: p, x } = ctx.payload as E;\nawait write(p);' }],
      1,
    ],
    [
      '関門を通していれば通る',
      [{ file: 'a.ts', text: 'const { path: p } = ctx.payload as E;\nif (!isSafeExportPath(p, home, ".svg")) throw 0;' }],
      0,
    ],
    [
      '直接プロパティで受ける形も見る',
      [{ file: 'a.ts', text: 'const p = (ctx.payload as E).path;\nawait write(p);' }],
      1,
    ],
    [
      'path を受けないファイルは対象外',
      [{ file: 'a.ts', text: 'const { title } = ctx.payload as E;\nawait write(title);' }],
      0,
    ],
    [
      '「path」を含む別名は拾わない (customPath だけでは鳴らない)',
      [{ file: 'a.ts', text: 'const { customPath } = ctx.payload as E;\nawait write(customPath);' }],
      0,
    ],
    [
      '複数ファイルのうち 1 つだけ違反',
      [
        { file: 'ok.ts', text: 'const { path: p } = ctx.payload as E;\nisSafeExportPath(p, h, ".md");' },
        { file: 'bad.ts', text: 'const { path: p } = ctx.payload as E;\nawait write(p);' },
      ],
      1,
    ],
  ];
  let failed = 0;
  for (const [label, input, want] of exportCases) {
    const got = exportPathProblems(input).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  for (const [label, input, want] of cases) {
    const got = evaluateHandlers(input).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  // --- preload 規則の対照 (境界のもう半分) ---
  // 実ファイルではなく**判定そのもの**を突く。`preloadProblems` は木を読むので、
  // ここでは一時ファイルを置いて振る舞いで確かめる。
  const preDir = path.join(REPO_ROOT, 'src/preload');
  const probe = path.join(preDir, '__lint_probe__.ts');
  const preCases = [
    {
      name: 'チャンネル名が変数なら鳴る',
      src: "import { ipcRenderer } from 'electron';\nexport const f = (c: string) => ipcRenderer.invoke(c);\n",
      want: 1,
    },
    {
      name: 'チャンネル名がリテラルなら鳴らない',
      src: "import { ipcRenderer } from 'electron';\nexport const f = () => ipcRenderer.invoke('app:getVersion');\n",
      want: 0,
    },
    {
      name: 'exposeInMainWorld に ipcRenderer を渡すと鳴る',
      src: "import { contextBridge, ipcRenderer } from 'electron';\ncontextBridge.exposeInMainWorld('raw', ipcRenderer);\nconst _k = ipcRenderer.invoke('app:getVersion');\nvoid _k;\n",
      want: 1,
    },
    {
      name: 'コメント内の変数チャンネルは数えない',
      src: "import { ipcRenderer } from 'electron';\n// 悪い例: ipcRenderer.invoke(channel)\nexport const f = () => ipcRenderer.invoke('app:getVersion');\n",
      want: 0,
    },
  ];
  for (const c of preCases) {
    fs.writeFileSync(probe, c.src);
    let got;
    try {
      // 実ファイル由来の指摘は差し引き、probe が出した分だけを数える。
      got = preloadProblems().filter((x) => x.includes('__lint_probe__')).length;
    } finally {
      fs.unlinkSync(probe);
    }
    const ok = got === c.want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} preload: ${c.name}: ${got} 件 (期待 ${c.want})`);
  }

  if (failed > 0) {
    console.error(`❌ 対照実験 ${failed} 件が期待と違います — ゲート自体が壊れています`);
    return 1;
  }
  console.log('✅ 対照実験: 規則どおりに鳴ります');
  return 0;
}

/**
 * preload 側の口を検査する —— **境界のもう半分**。
 *
 * `ipcMain.handle` をいくら固めても、preload が
 * `invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)` を
 * 1 行足せば、renderer は**全チャンネルへ到達できる**。CLAUDE.md は
 * 「`window.serviceHub` が main を呼ぶ唯一の道」と書いているが、それを
 * 守らせている物が無かった —— 実測 (2026-08-23) で汎用の通し口を足しても
 * `lint:forbidden` / `lint:imports` / `lint:ipc-handlers` / `typecheck` の
 * **4 つとも緑のまま**だった。
 *
 * 規則は 2 つ:
 *
 * 1. `ipcRenderer.<method>(...)` の**第 1 引数は文字列リテラル**であること。
 *    変数で受けると、その 1 本が全チャンネルの合鍵になる。
 * 2. `exposeInMainWorld` に `ipcRenderer` を**そのまま**渡さないこと。
 *    渡すと renderer が生の IPC を握る (contextIsolation の意味が消える)。
 *
 * 走査時点の preload は `invoke` 13 件すべてがリテラルで、誤検知 0。
 */
function preloadProblems() {
  const dir = path.join(REPO_ROOT, 'src/preload');
  if (!fs.existsSync(dir)) return ['src/preload が見つかりません（走査の不具合を疑ってください）'];
  const problems = [];
  let calls = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.tsx?$/.test(name) || name.endsWith('.d.ts')) continue;
    const file = path.join('src/preload', name);
    const raw = fs.readFileSync(path.join(dir, name), 'utf8');
    // コメント・文字列を潰した像で位置を採り、引数の中身は生から読む。
    // 説明文に書かれた例を指摘すると直しようが無くなる (0-a-17)。
    const blank = blankOutLiterals(raw);
    const callRe = /\bipcRenderer\s*\.\s*([A-Za-z]+)\s*\(/g;
    let m;
    while ((m = callRe.exec(blank))) {
      calls += 1;
      const argStart = m.index + m[0].length;
      // 引数の先頭だけを示す。行末まで載せると、後続の行まで指摘文に混ざる。
      const firstArg = raw.slice(argStart).replace(/^\s+/, '').split(/[,)\n]/)[0];
      if (!/^['"`]/.test(firstArg)) {
        const line = raw.slice(0, argStart).split('\n').length;
        problems.push(
          `${file}:${line} ipcRenderer.${m[1]}() のチャンネル名が文字列リテラルでない`
            + `（変数で受けると全チャンネルの合鍵になります）: ${firstArg.slice(0, 60)}`,
        );
      }
    }
    const exposeRe = /exposeInMainWorld\s*\(([^)]*)\)/g;
    while ((m = exposeRe.exec(blank))) {
      const args = raw.slice(m.index, m.index + m[0].length);
      if (/\bipcRenderer\b/.test(args)) {
        const line = raw.slice(0, m.index).split('\n').length;
        problems.push(`${file}:${line} exposeInMainWorld に ipcRenderer をそのまま渡しています`);
      }
    }
  }
  // 数え方が壊れて黙って 0 件になる形を塞ぐ。
  if (calls === 0) problems.push('preload に ipcRenderer 呼び出しが 1 件もありません（走査の不具合を疑ってください）');
  return problems;
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
  const clients = clientFiles();
  const guarded = clients.filter((f) => TAKES_PAYLOAD_PATH.some((re) => re.test(f.text)));
  const problems = [...evaluateHandlers(handlers), ...exportPathProblems(clients), ...preloadProblems()];
  console.log(
    `IPC ハンドラ ${handlers.length} 件を検査しました`
      + ` (${files.length} ファイル: ${files.map((f) => f.file).join(', ')})`,
  );
  console.log(
    `書き出し先を payload で受けるクライアント ${guarded.length} 件`
      + ` (${clients.length} 件中): ${guarded.map((f) => path.basename(f.file)).join(', ')}`,
  );

  if (problems.length > 0) {
    console.error(`❌ ${problems.length} 件:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log(
    '✅ すべてのハンドラは失敗を戻り値で表し (try の外で await しない)、'
      + 'serviceId を添字に使う前に isServiceId() で検証し、'
      + 'payload の書き出し先は isSafeExportPath を通し、'
      + 'preload はチャンネル名をリテラルで固定しています',
  );
  return 0;
}

module.exports = { evaluateHandlers, handlerBodies, exportPathProblems, preloadProblems };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
