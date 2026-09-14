#!/usr/bin/env node
/**
 * 「**述語は共有したが、no と言われたあとの動作が両ビルドで違う**」の**母集団を数える**。
 *
 * この本が作るのは**分母**であって、欠陥の一覧ではない。共有モジュールが否定で
 * 答えられるとき、デスクトップ版とブラウザ版が同じように断っているかは
 * **読まないと決まらない** —— 対称な物 (`scanTarget`)・意図して非対称な物
 * (`ollama` の endpoint は main が固定・ブラウザ版が可変)・本物の欠陥
 * (`vaultToken`・パス 246) の 3 つが混ざる。だから本は「何件在るか」だけを
 * 決定的に出し、「どちらか」は下の `VERDICTS` と `docs/REMAINING_WORK.md` の
 * 散文が受け持つ。**数は機械が、判断は人が。**
 *
 * ## なぜ生成物にしたか (2026-09-14 · パス 248)
 *
 * パス 247 がこの母集団を初めて数え (44 / 21)、**その数を散文にだけ書いた**。
 * 同じことをパス 85 と パス 95 で 2 度やって 2 度腐らせている ——
 * 手で書いた表は誰も検算せず、パス 85 の台帳は母集団が 4 倍ずれていた。
 * だから件数と顔ぶれを機械に持たせ、**両方向**に鳴らす:
 *
 *   - 母集団に入ったのに `VERDICTS` に無い  → 鳴る (黙って増えない)
 *   - `VERDICTS` に在るのに母集団から消えた → 鳴る (死んだ判断を残さない)
 *
 * 判断そのものは機械化できない。**母集団が変わったことは機械が言える。**
 *
 * ## 走査の規則
 *
 * 1. `src/shared/` の .ts / .tsx (`__tests__` と `.d.ts` を除く) を数え上げる。
 * 2. そのうち `src/main/` と `src/renderer/` の**両方**から import されている物
 *    (どちらも `__tests__` を除く)。**モジュール単位**で見る —— シンボル単位に
 *    すると パス 246 の欠陥 (main が `hasUsableAccessToken`、renderer が
 *    `bearerFromStoredToken`) が母集団から落ちる。パス 247 でそれを実測している。
 * 3. そのうち export が**否定で答えられる**物 (`return null` / `return false` /
 *    `ok: false`。コメントと文字列は落として見る)。
 *
 *   node scripts/shared-judgement-census.cjs              表を再生成して書き戻す
 *   node scripts/shared-judgement-census.cjs --check      再生成が committed と一致するか
 *   node scripts/shared-judgement-census.cjs --self-test  検査そのものの対照 (陽性・陰性)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DOC = path.join(REPO_ROOT, 'docs', 'REMAINING_WORK.md');
const SRC = path.join(REPO_ROOT, 'src');

const BEGIN =
  '<!-- shared-judgement-census:begin — scripts/shared-judgement-census.cjs が生成する。手で編集しない (npm run lint:shared-judgement で再生成) -->';
const END = '<!-- shared-judgement-census:end -->';
const BEGIN_TAG = '<!-- shared-judgement-census:begin';
const HEADER = '| shared モジュール | main | renderer | 判定 |';
const RULE = '| --- | ---: | ---: | --- |';

/**
 * 走査の生死の床。**0 件を「問題なし」と読まない** —— 走査が壊れた
 * (import の綴り・src の場所替え) ときに静かに通らせないため。
 * 実測 (2026-09-14) は 138 / 44 / 21 なので、その 8 割弱を床にする。
 */
const MIN_SHARED = 110;
const MIN_BOTH = 34;
const MIN_JUDGEMENT = 16;

/** 否定で答えられる形。**過剰に拾う** (分母は多い側に外す)。 */
const NEGATIVE = /return\s+null\b|return\s+false\b|ok:\s*false/;

/**
 * 判定の台帳。**鍵は母集団と一致しなければならない (両方向)。**
 * 値は「読んだ結果」か `未読`。読んでいない物に「対称だろう」と書かない ——
 * それは判断ではなく願望である (パス 247 の方針)。
 */
const VERDICTS = {
  advisorQuestionLimits:
    '対称 (実測・パス 251) —— checkAdvisorQuestion の 3 つの理由 (empty / too-long / '
    + "control-chars) を呼ぶ所 3 つすべてが 1 つずつ扱う (main の stocks / business、"
    + 'ブラウザ版の web-shim)。**ただし文面の言語が割れている** —— main は英語で throw し、'
    + 'その文字列は safeErrorMessage を通って画面へ出る。母集団はパス 251 で 118 件と測った',
  'api/cursor':
    '対称 (実測・パス 250) —— 両ビルドが同じ `fetchCursorSnapshotWith` を呼び '
    + '(main は clients/cursor.ts、ブラウザ版は network/liveRead.ts)、否定 (acceptRate === null) の '
    + '消費者は CursorPage 1 つだけ。応答の上限も MAX_PROXY_RESPONSE_BYTES = MAX_HTTP_RESPONSE_BYTES で 1 つ',
  assistantLimits:
    '対称 (実測・パス 252) —— latestTurnTooLong の 4 つの消費者 (main の chat / chatAll、'
    + 'ブラウザ版の callAssistantChat / callAssistantChatAll) がすべて 1 つずつ断り、文面も '
    + 'inputTooLongMessage 1 つ。**ただし system の天井の単位が割れていた** —— main は '
    + '`.slice(0, MAX_SYSTEM)` (コード単位)・ブラウザ版は `clampToCeiling` (文字)。'
    + '絵文字 50,000 字の system で main 30,000 字 / ブラウザ版 50,000 字。パス 252 で直した',
  inputCeiling:
    '対称 (設計・パス 252 で新設) —— 天井と床の判定そのもの (countChars / clampToCeiling / '
    + 'atLeastChars / moreThanChars)。否定 (false) はどのビルドでも「天井を超えていない」「床を'
    + '満たさない」の 1 つの意味しか持たず、**動作を決めるのは呼ぶ側**である。'
    + '呼ぶ側の対称性は ceilingUnitCensus.test.ts が母集団で見る (両方向の台帳)',
  atlassianSite: '**非対称だった → パス 248 で直した** (述語は共有・欄の天井は main だけ)',
  emotionsLimits:
    '対称 (実測・パス 254) —— analyze-text の門は両ビルドとも '
    + '`countChars(text) > MAX_ANALYZE_TEXT_CHARS` (main/clients/emotions.ts:313 / web-shim.ts:733)、'
    + 'log-mood の note も同じ形 (emotions.ts:220 / emotionsWeb.ts:172)。'
    + 'packAnalyzeText の否定 (included === 0) の消費者も GmailPage / SlackPage の両方が '
    + '押せなくする。**ただし予算を積む単位が割れていた** —— 門は文字で測るのに '
    + 'packAnalyzeText は `row.length` (コード単位)。絵文字 10 個の件名 600 行で '
    + '2,617 字送った時点で 362 行を落とし、画面は「5000 字までのため」と '
    + '**成り立たない理由**を述べていた。パス 254 で countChars へ直した',
  eraseReport:
    '意図した非対称 (実測・パス 252) —— 報告の型と文面は共有で、否定 (allDeleted が偽) の扱いも '
    + '両ビルドで同じ (残った物を名指し・「データは残っています」・再読込/再起動をしない)。'
    + '**消す順序だけが逆向き**: ブラウザ版は保管庫を最後 (記録が平文の IndexedDB なので「保管庫'
    + 'だけ新しく記録は前の人の物」を避ける)、デスクトップ版はトークンを先頭。デスクトップ版は '
    + 'atRest.ts の封筒 1 組でトークンも状態ファイルも同じ強さなのでその非対称が起きず、'
    + 'process が途中で死んだときに残るのは「遠隔から使えるトークン」か「局所で読める記録」か'
    + 'の選択になる。前者のほうが重いのでトークンを先に消す。理由を desktopEraseTargets へ書いた',
  externalUrlGate: '閉じている (パス 241 で 3 経路を実測)',
  freeeIntake: '未読 (取り込みの取りこぼし)',
  funding: '未読 (計算の判定)',
  httpLimits:
    '対称 (部分実測・パス 248) —— 呼び出し側の網は両ビルドに在る (パス 249 で訂正。'
    + 'ブラウザ版は webShimTimeouts.test.ts。ただし手で選んだ 3 経路だけで母集団の総当たりではない)',
  hydroponicsControl: '未読 (計算の判定)',
  isoDate:
    '対称 (実測・パス 256) —— 負で答える関数は 8 つだが、**両ビルドが呼んでいるのは 2 つだけ** (main/preload 側の消費者を機械的に数えた):'
    + ' (1) `isCalendarDate` + `calendarDateMessage` —— main/clients/emotions.ts:212 と renderer/data/emotionsWeb.ts:177 が**同一の行**で投げる (`throw new Error(calendarDateMessage(\'date\'))`)。'
    + ' (2) `isoDateFromTimestamp` —— main/clients/stocks.ts:776 と renderer/data/stocksWatchlistWeb.ts:194 がともに `?? \'\'` で空文字に倒す。いずれも**見本のローソク生成の中**で、入力は `Date.now()` ± 日数なので `null` の枠は実質到達しない。'
    + ' 残り 6 つ (`parseIsoDate` / `isCalendarMonth` / `isCalendarDateOrMonth` / `parseTimestamp` / `addIsoDays` / `isoDaysBetween`) は **main/preload 側の消費者が 0 件** なので、ビルド間の非対称は**原理的に起きない**。'
    + ' ★ 台帳の粒度について: この台帳は**モジュール**単位で「両ビルドがimport」を数えるが、非対称が宿るのは**両ビルドが呼ぶ関数**だけである。isoDate はその差が最も大きい例 (33 のimport元・負で答える 8 関数・境界を越えるのは 2 つ)。',
  ollama: '**非対称だった → パス 248 で直した** (許可経路の台帳を読むのは renderer だけ)',
  radarPlot: '未読 (作図)',
  scanTarget: '対称 (実測・パス 247)',
  serviceAdvisor: '未読 (助言の生成)',
  talent:
    '対称 (実測・パス 260) —— 否定の枝を両側で読んだ: main は `loadTalentState` が '
    + "`{ kind: 'unreadable', reason }` を返し (talent.ts:85 / :90)、ブラウザ版は "
    + '`localStorage` が拒んでも同じ形を作る (web-shim.ts:1271)。そこから先は**両方が同じ '
    + '2 段**を通る —— `talentProvenance(stored)` → `buildTalentSnapshot(state, provenance)` '
    + '(main/clients/talent.ts:143-144 / web-shim.ts:1273-1274)。画面は `snap.storedNote` を '
    + '⚠ つきで刷る (TalentPage.tsx:219-221)。`reviewLadder` は境界を越えない '
    + '(唯一の呼び出しは shared/talent.ts:709 の `buildTalentSnapshot` の中)',
  tokenInput: '閉じている (パス 245 で両ビルドの保管層に床)',
  tokenResponse:
    '対称 (パス 260 で**そう作った**) —— 認可サーバのトークン端点の応答を見る規則で、'
    + '否定のあとの動作は両ビルドで同じ 2 行: `if (!parsed.ok) throw new Error(parsed.message)` '
    + '(main/oauth.ts の交換・更新の 2 か所と renderer/oauth/pkce.ts)。文面も共有の 1 組。'
    + 'この pass の前は main 側に検査そのものが無く (`JSON.parse(…) as TokenResponse`)、'
    + 'ブラウザ版だけが見ていた —— 非対称の極として在った',
  updateCheck:
    '対称 (実測・パス 250) —— 両ビルドが `evaluateUpdate(current, parseLatestRelease(...))` と '
    + '3 つの失敗経路 (!res.ok / catch / 形が違う) を同じ形で `evaluateUpdate(current, null)` へ寄せ、'
    + '画面は共有の describeUpdate を読む。**ただし締切の値だけ割れている** '
    + '(main は素の 10_000・ブラウザ版は DEFAULT_HTTP_TIMEOUT_MS = 30_000。理由はどこにも無い)',
  vaultToken: '**欠陥だった → パス 246 で直した** (main が生の JSON を Bearer に載せていた)',
  writeFieldLimits: '対称 (実測・パス 247)',
};

/**
 * コメントと文字列リテラルを落とす (改行は保つ)。
 * 落とす理由: 「`return null` と書いていた」という散文を実装として数えないため ——
 * このファイル自身の doc コメントがまさにそれである。
 */
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      out += '""';
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * **コメントだけ**落とす (文字列リテラルは残す)。
 *
 * `stripCommentsAndStrings` と分けてあるのは import の走査のため —— module
 * specifier は文字列リテラルそのもので、文字列を潰すと綴りが消える。
 * 文字列の中に入った `//` を誤ってコメント開始と読まないよう、文字列は
 * 「読み飛ばして原文のまま出す」。
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i];
          i += 1;
        }
        out += src[i] ?? '';
        i += 1;
      }
      out += src[i] ?? '';
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** `root` 配下の .ts / .tsx (`__tests__` / `.d.ts` を除く) をパス順で。 */
function sourceFiles(root) {
  const found = [];
  if (!fs.existsSync(root)) return found;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p);
      } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
        found.push(p);
      }
    }
  };
  walk(root);
  return found;
}

/** モジュール鍵: `src/shared/` からの相対パス (拡張子なし・区切りは `/`)。 */
function moduleKey(abs, sharedRoot) {
  return path.relative(sharedRoot, abs).replace(/\.tsx?$/, '').split(path.sep).join('/');
}

/** `file` が import している shared モジュールの鍵の集合 (相対指定のみ)。 */
function sharedImportsOf(file, sharedRoot) {
  // **コメントだけ落としてから読む。** 落とさないとコメントアウトした import
  // (`// import { x } from '../shared/foo';`) が「両ビルドが使っている」証拠として
  // 数えられる。文字列は落とせない —— module specifier は文字列リテラルそのもので、
  // `stripCommentsAndStrings` に通すと `""` に潰れて綴りが消える。
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const keys = new Set();
  for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const abs = path.resolve(path.dirname(file), spec);
    const rel = path.relative(sharedRoot, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    keys.add(rel.split(path.sep).join('/'));
  }
  return keys;
}

/** 母集団を数える。`{ rows, shared, both, judgement }`。 */
function census(srcRoot = SRC) {
  const sharedRoot = path.join(srcRoot, 'shared');
  const sharedFiles = sourceFiles(sharedRoot);
  const byKey = new Map();
  for (const abs of sharedFiles) byKey.set(moduleKey(abs, sharedRoot), abs);

  const count = (buildRoot) => {
    const per = new Map();
    for (const f of sourceFiles(path.join(srcRoot, buildRoot))) {
      for (const k of sharedImportsOf(f, sharedRoot)) per.set(k, (per.get(k) ?? 0) + 1);
    }
    return per;
  };
  const mainPer = count('main');
  const rendPer = count('renderer');

  const rows = [];
  let both = 0;
  for (const key of [...byKey.keys()].sort()) {
    if (!mainPer.has(key) || !rendPer.has(key)) continue;
    both += 1;
    const body = stripCommentsAndStrings(fs.readFileSync(byKey.get(key), 'utf8'));
    if (!NEGATIVE.test(body)) continue;
    rows.push({ module: key, main: mainPer.get(key), renderer: rendPer.get(key) });
  }
  return { rows, shared: byKey.size, both, judgement: rows.length };
}

function renderTable(result, verdicts = VERDICTS) {
  const body = result.rows.map(
    (r) => `| \`${r.module}\` | ${r.main} | ${r.renderer} | ${verdicts[r.module] ?? '（台帳に無し）'} |`,
  );
  const unread = result.rows.filter((r) => (verdicts[r.module] ?? '').startsWith('未読')).length;
  return [
    BEGIN,
    `shared **${result.shared}** モジュール / 両ビルドが import **${result.both}** / うち否定で答えられる **${result.judgement}**` +
      `（うち未読 **${unread}**）。これは分母であって欠陥の一覧ではない。`,
    '',
    HEADER,
    RULE,
    ...body,
    END,
  ].join('\n');
}

/** 台帳と母集団の食い違い (両方向)。一致なら空配列。 */
function ledgerMismatch(result, verdicts = VERDICTS) {
  const inPop = new Set(result.rows.map((r) => r.module));
  const lines = [];
  for (const m of [...inPop].sort()) {
    if (!Object.hasOwn(verdicts, m)) {
      lines.push(`母集団に入ったが台帳に無い: ${m} —— 読んで判定を書く (読んでいなければ '未読 (…)' と書く)`);
    }
  }
  for (const m of Object.keys(verdicts).sort()) {
    if (!inPop.has(m)) {
      lines.push(`台帳に在るが母集団から消えた: ${m} —— 死んだ判断なので台帳から外す`);
    }
  }
  return lines;
}

function findTable(doc) {
  // **マーカーは 1 組だけ。** 綴りを縮めた別形が在ると `indexOf` がそちらを先に
  // 拾い、生成物が別の場所へ書かれて**本物が黙って腐る** (パス 95 で実際に起きた)。
  let n = 0;
  for (let i = doc.indexOf(BEGIN_TAG); i >= 0; i = doc.indexOf(BEGIN_TAG, i + 1)) n += 1;
  if (n > 1) {
    throw new Error(`開始マーカー "${BEGIN_TAG}…" が ${n} 組あります。生成物の行き先が定まらないので 1 組にしてください`);
  }
  const begin = doc.indexOf(BEGIN);
  if (begin < 0) {
    if (n === 1) throw new Error(`開始マーカーの綴りが違います。次の 1 行にしてください:\n${BEGIN}`);
    return null;
  }
  const end = doc.indexOf(END, begin);
  if (end < 0) throw new Error(`終端マーカー "${END}" がありません`);
  return { begin, end: end + END.length };
}

function applyTable(doc, table) {
  const found = findTable(doc);
  if (found) return doc.slice(0, found.begin) + table + doc.slice(found.end);
  return `${doc.replace(/\n+$/, '')}\n\n${table}\n`;
}

/** committed と再生成が食い違う理由 (一致なら null)。 */
function staleReason(doc, table) {
  const found = findTable(doc);
  if (!found) return 'census の生成ブロックが docs/REMAINING_WORK.md にありません';
  const committed = doc.slice(found.begin, found.end);
  if (committed === table) return null;
  const a = committed.split('\n');
  const b = table.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return `${i + 1} 行目が違います:\n  committed: ${a[i] ?? '(無し)'}\n  再生成:    ${b[i] ?? '(無し)'}`;
    }
  }
  return '内容が違います';
}

function selfTest() {
  const fails = [];
  const check = (name, ok) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) fails.push(name);
  };

  // --- 否定の形 (陽性・陰性) ---
  check('★ `return null` を否定とみなす', NEGATIVE.test('function f() { return null; }'));
  check('★ `return false` を否定とみなす', NEGATIVE.test('function f() { return false; }'));
  check('★ `ok: false` を否定とみなす', NEGATIVE.test('return { ok: false, reason: 1 };'));
  check('肯定だけなら否定でない', NEGATIVE.test('return { ok: true };') === false);
  check(
    'コメントの中の「return null」は数えない',
    NEGATIVE.test(stripCommentsAndStrings('// かつては return null だった\nexport const x = 1;')) === false,
  );
  check(
    '文字列の中の「ok: false」は数えない',
    NEGATIVE.test(stripCommentsAndStrings("const s = 'ok: false';")) === false,
  );
  check(
    '★ この本自身の doc を数えない (落とし忘れの対照)',
    NEGATIVE.test(stripCommentsAndStrings(fs.readFileSync(__filename, 'utf8').split('function selfTest')[0])) === false,
  );

  // --- import の走査: コメントは落とす・綴りは残す ---
  check(
    '★ コメントアウトした import は数えない',
    !stripComments("// import { x } from '../shared/ghost';\nexport const y = 1;").includes('ghost'),
  );
  check(
    '★ 生きている import の綴りは残る (文字列を潰していない)',
    stripComments("import { x } from '../shared/real';").includes("'../shared/real'"),
  );
  check(
    '文字列の中の // をコメント開始と読まない',
    stripComments("const u = 'https://x/y';").includes('https://x/y'),
  );

  // --- 実測と床 ---
  const real = census();
  check(`実測が shared の床を超えている (${real.shared} >= ${MIN_SHARED})`, real.shared >= MIN_SHARED);
  check(`実測が両ビルドの床を超えている (${real.both} >= ${MIN_BOTH})`, real.both >= MIN_BOTH);
  check(`実測が判定の床を超えている (${real.judgement} >= ${MIN_JUDGEMENT})`, real.judgement >= MIN_JUDGEMENT);
  check(
    '★ 空の木を走査したら床に掛かる (走査の死が「問題なし」にならない)',
    census(path.join(REPO_ROOT, 'scripts')).shared < MIN_SHARED,
  );

  // --- ★ 走査は パス 246 の欠陥を拾えるか (モジュール単位であることの対照) ---
  check(
    '★ vaultToken が母集団に在る (シンボル単位に戻したら落ちる形・パス 247)',
    real.rows.some((r) => r.module === 'vaultToken'),
  );

  // --- 台帳の双方向 ---
  check('実測と台帳が一致している (どちらの向きにもずれが無い)', ledgerMismatch(real).length === 0);
  {
    const sample = { rows: [{ module: 'a', main: 1, renderer: 1 }], shared: 1, both: 1, judgement: 1 };
    check(
      '★ 母集団に入ったのに台帳に無ければ鳴る',
      ledgerMismatch(sample, {}).join('|').includes('母集団に入ったが台帳に無い: a'),
    );
    check(
      '★ 台帳に在るのに母集団から消えたら鳴る',
      ledgerMismatch(sample, { a: 'x', gone: 'y' }).join('|').includes('台帳に在るが母集団から消えた: gone'),
    );
    check('対照: 一致していれば鳴らない', ledgerMismatch(sample, { a: 'x' }).length === 0);
  }

  // --- 表の生成と突き合わせ ---
  const sample = {
    rows: [{ module: 'a', main: 2, renderer: 3 }, { module: 'b', main: 1, renderer: 1 }],
    shared: 9,
    both: 4,
    judgement: 2,
  };
  const table = renderTable(sample, { a: '対称 (実測)', b: '未読 (見本)' });
  check('合計を載せる', table.includes('shared **9** モジュール / 両ビルドが import **4** / うち否定で答えられる **2**'));
  check('未読の数も載せる', table.includes('（うち未読 **1**）'));
  check('呼ぶ所の数を両ビルド分載せる', table.includes('| `a` | 2 | 3 | 対称 (実測) |'));
  check('台帳に無い行はそう書く', renderTable(sample, {}).includes('（台帳に無し）'));

  const doc = applyTable('# 見出し\n\n本文\n', table);
  check('マーカーが無ければ末尾へ足す', findTable(doc) !== null);
  check('一致していれば鳴らない', staleReason(doc, table) === null);
  check(
    '★ 呼ぶ所の数が 1 つ違えば鳴る',
    typeof staleReason(doc, renderTable({ ...sample, rows: [{ module: 'a', main: 2, renderer: 4 }, sample.rows[1]] }, { a: '対称 (実測)', b: '未読 (見本)' })) === 'string',
  );
  check(
    '★ 行が 1 つ増えても鳴る',
    typeof staleReason(doc, renderTable({ ...sample, rows: [...sample.rows, { module: 'c', main: 1, renderer: 1 }], judgement: 3 }, { a: '対称 (実測)', b: '未読 (見本)', c: '未読' })) === 'string',
  );
  check('★ ブロックが無ければ鳴る', typeof staleReason('# 見出しだけ\n', table) === 'string');
  check('2 度当てても増えない', applyTable(doc, table) === doc);

  let threwOnDup = false;
  try {
    findTable(`${doc}\n${BEGIN_TAG} -->\n${END}\n`);
  } catch {
    threwOnDup = true;
  }
  check('★ 開始マーカーが 2 組あれば鳴る', threwOnDup);
  let threwOnTypo = false;
  try {
    findTable(`# 見出し\n\n${BEGIN_TAG} -->\n${END}\n`);
  } catch {
    threwOnTypo = true;
  }
  check('★ 綴りの違う開始マーカーだけなら鳴る', threwOnTypo);
  check('対照: マーカーが 1 つも無ければ null (初回の足し込みは通す)', findTable('# 見出しだけ\n') === null);

  if (fails.length > 0) {
    console.error(`\n❌ self-test ${fails.length} 件不一致`);
    process.exit(1);
  }
  console.log('✅ self-test 全件一致');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }

  const result = census();
  if (result.shared < MIN_SHARED || result.both < MIN_BOTH || result.judgement < MIN_JUDGEMENT) {
    console.error(
      `❌ 走査が死んでいます: shared ${result.shared} / 両ビルド ${result.both} / 否定 ${result.judgement} ` +
        `(床は ${MIN_SHARED} / ${MIN_BOTH} / ${MIN_JUDGEMENT})。0 件を「問題なし」と読まないための床です。`,
    );
    process.exit(1);
  }

  const mismatch = ledgerMismatch(result);
  if (mismatch.length > 0) {
    console.error('❌ 母集団と判定の台帳 (VERDICTS) が食い違っています:');
    for (const line of mismatch) console.error(`   ${line}`);
    console.error('   台帳: scripts/shared-judgement-census.cjs の VERDICTS');
    process.exit(1);
  }

  const table = renderTable(result);
  const doc = fs.readFileSync(DOC, 'utf8');

  if (args.includes('--check')) {
    const reason = staleReason(doc, table);
    if (reason !== null) {
      console.error(
        `❌ census が古くなっています。\`npm run lint:shared-judgement\` で再生成してください。\n${reason}`,
      );
      process.exit(1);
    }
    console.log(
      `✅ census は最新 (shared ${result.shared} / 両ビルド ${result.both} / 否定 ${result.judgement})`,
    );
    return;
  }

  fs.writeFileSync(DOC, applyTable(doc, table));
  console.log(
    `✅ census を再生成しました (shared ${result.shared} / 両ビルド ${result.both} / 否定 ${result.judgement})`,
  );
}

if (require.main === module) main();

module.exports = {
  NEGATIVE,
  VERDICTS,
  stripComments,
  stripCommentsAndStrings,
  sourceFiles,
  moduleKey,
  sharedImportsOf,
  census,
  renderTable,
  ledgerMismatch,
  findTable,
  applyTable,
  staleReason,
  MIN_SHARED,
  MIN_BOTH,
  MIN_JUDGEMENT,
};
