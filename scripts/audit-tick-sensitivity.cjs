#!/usr/bin/env node
/*
 * **「固定回数の待ち」に寄りかかっている検査の定期点検** (`npm run audit:tick-sensitivity`)。
 *
 * ## なぜ静的な走査では足りないか (2026-09-21 · パス 369 の実測)
 *
 * パス 368 で `fixedTickAssertionCensus.test.ts` を足したとき、私は
 * 「固定回数で待ったあとに**文が出ている**と主張する検査」を綴りで数えた:
 *
 * ```js
 * /expect\([^)]*textContent[^)]*\)\s*\.toContain\(/
 * ```
 *
 * この針は**両方向に外れる**。実測で確かめた:
 *
 * - **見落とす側** —— `[^)]*` は入れ子の括弧を跨げないので
 *   `expect(q.sheet()!.textContent).toContain(…)` が映らない。matcher も
 *   `.toContain` しか見ないので `expect(el?.textContent).toBe('確認できません')` が映らない。
 *   さらに文を読むのが helper (`q.header()` / `q.cell(…)`) なら、`expect(…)` の
 *   行に `textContent` の綴りが 1 字も無い —— パス 334 が名指しした
 *   「**その関数を使っている場所ではなく、同じことをしている場所を数えろ**」の形。
 * - **数えすぎる側** —— 条件で待った**あと**の `expect(…).toContain(…)` は
 *   もう当て物ではない。針はその区別ができないので、寄せ終えたファイルの
 *   残りの主張を危険として数え続ける。実測: 針を広げると 30 ファイル / 116 か所
 *   挙がるが、下の実測ではそのうち大半が **0 周でも通る**。
 *
 * ## だから振る舞いで測る
 *
 * 知りたいのは綴りではなく「**この主張は settle の回数に依っているか**」で、
 * それは**回数を 0 にして走らせれば直接答えが出る**。この道具は
 * 固定回数の `settle` を持つ検査すべての周回数を 0 に書き換え、走らせ、
 * 必ず元へ戻し (`finally` + 内容の照合)、落ちたファイルを台帳と突き合わせる。
 *
 * パス 356 の `audit:survivors` と同じ家系である —— あちらは変異検査の
 * 「生存」報告が偽だったことを、報告ではなく**当て直して**確かめた。
 *
 * ## なぜ CI で走らせないか
 *
 * ① 判定のためにソースを書き換えるので、他の作業と同時に走らせられない。
 * ② 落ちること自体は欠陥ではない —— IndexedDB の往復を待つ `expect(await stored())`
 *    や要素の在否 `not.toBeNull()` は**回数に依って当然**で、条件で待つ形に
 *    置き換える価値があるとは限らない。判断は台帳の `why` が持つ。
 * `audit:floors` / `audit:survivors` / `audit:regex-poly` と同じ**定期点検の道具**。
 * 台帳の形は `src/renderer/__tests__/tickSensitivityLedger.test.ts` が毎回の
 * `npm test` で見る。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const REPO = path.join(__dirname, '..');

/** 固定回数の待ち (`for (let i = 0; i < N; i += 1) { … setTimeout … }`)。 */
const TICK_LOOP = /for \(let (\w+) = 0; \1 < (\d+); \1 \+= 1\)/g;
/** その回数が「待ち」であることの印 —— 近くに `setTimeout` が在る。 */
const IS_SETTLE = /for \(let \w+ = 0; \w+ < \d+; \w+ \+= 1\)[\s\S]{0,200}?setTimeout/;

/** 追跡されている jsdom 検査のうち、固定回数の待ちを持つ物。 */
function collect() {
  // 引数は配列で渡す (**シェルを経由しない**)。母集団は git に聞く —— 無視の規則を
  // 書き写すと生成物を拾い、未追跡を落とすと「手元では緑・CI では赤」になる (パス 342)。
  const out = cp.execFileSync('git', ['ls-files', 'src/**/__tests__/*.test.ts'], {
    cwd: REPO, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  return out.split('\n').filter(Boolean).filter((f) => {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8');
    return IS_SETTLE.test(src);
  });
}

/** 周回数を 0 にした写し。変わらなければ `null`。 */
function zeroTicks(src) {
  const out = src.replace(TICK_LOOP, (m, v) => `for (let ${v} = 0; ${v} < 0; ${v} += 1)`);
  return out === src ? null : out;
}

/**
 * **0 周でも通らなかったファイルと、その理由** (2026-09-21 · パス 369 実測)。
 *
 * 落ちること自体は欠陥ではない —— `kind` が「回数に依っていることをどう読むか」を言う:
 *
 *   - `store-roundtrip` —— IndexedDB へ書いて読み直す主張。解決が `act` の外なので、
 *     条件で待つには**非同期の述語**が要る (共有の待ちは同期の述語しか取らない)。
 *   - `setup-flush` —— 落ちるのは主張ではなく**操作**の側。固定回数の周回が
 *     「待ち」ではなく**状態遷移の流し込み**として効いている。
 *     **条件で待っても、遷移が起きていなければ待てない** —— この 0 周の掃引が
 *     ファイル単位であることの限界でもある (寄せ終えた主張まで巻き込んで落ちる)。
 *   - `text-captured` / `text-helper` / `text-with-message` / `attribute`
 *     / `hook-state` / `mock-call` —— 寄せられるが未着手。**パス 368 の針が
 *     見落とした形**はここに集まっている (`toBe` の matcher・helper 越しの読み・
 *     入れ子の括弧)。
 *   - `element-presence` —— **2026-09-21 (パス 378) に 5 本とも寄せ終えて空になった。**
 *     語を残すのは、次に同じ形が出たときに分類として使うため (`waitForElement` か、
 *     行数のように**数える**条件なら `settleUntil`)。
 */
const LEDGER = [
  {
    file: 'src/renderer/components/__tests__/ParametersPanel.render.test.ts',
    kind: 'store-roundtrip',
    why: '上書きを保存してから `expect(await stored())` で読み直す。書き込みは `act` の外で解決するので、条件で待つには**非同期の述語**が要る (共有の待ちは同期の述語しか取らない)',
  },
  {
    file: 'src/renderer/components/__tests__/plaintextBackupNotice.test.ts',
    kind: 'mock-call',
    why: '`expect(confirm).toHaveBeenCalledTimes(1)` —— 画面に出た文ではなく**呼ばれた回数**を見る。文の主張はパス 369 で共有の待ちへ寄せた',
  },
  {
    file: 'src/renderer/components/__tests__/restorePlan.test.ts',
    kind: 'mock-call',
    why: '確認ダイアログが 1 度だけ呼ばれたことを見る。画面の文ではないので待ちの対象外',
  },
  {
    file: 'src/renderer/data/__tests__/parameterOverrides.test.ts',
    kind: 'hook-state',
    why: '画面ではなく hook の戻り (`ref.current.loading`) を見る。DOM に出ない値なので `waitForText` の対象外 —— `settleUntil` で寄せられる (未着手)',
  },
  {
    file: 'src/renderer/pages/__tests__/balanceSheetCurrent.test.ts',
    kind: 'attribute',
    why: '`getAttribute(\'data-bs-row\')` —— 文ではなく属性。`waitForElement` + 属性の主張に寄せられる (未着手)',
  },
  {
    file: 'src/renderer/pages/__tests__/investmentDemoMixOnScreen.test.ts',
    kind: 'text-captured',
    why: '文を `const t = text();` へ取ってから主張する。読み直さないので待ちに渡せない',
  },
  {
    file: 'src/renderer/pages/__tests__/libraryCorruptContent.test.ts',
    kind: 'text-with-message',
    why: '`expect(text(), \'説明\').toContain(…)` —— 第 2 引数の説明を持つ形。寄せると説明が落ちるので、待ってから主張する 2 段にする (未着手)',
  },
  {
    file: 'src/renderer/pages/__tests__/manualOverrideDisclosure.test.ts',
    kind: 'text-captured',
    why: '文を `const t = text();` へ取ってから主張する。加えてコピー操作の流し込みが 2 件',
  },
  {
    file: 'src/renderer/pages/__tests__/mutualFundsCostUnentered.test.ts',
    kind: 'setup-flush',
    why: '落ちるのは主張ではなく**操作**の側 (`addHolding` が欄を掴めない)。固定回数の周回が「待ち」ではなく**状態遷移の流し込み**として効いている',
  },
  {
    file: 'src/renderer/pages/__tests__/mutualFundsDoubleSubmit.test.ts',
    kind: 'store-roundtrip',
    why: '`expect(await getRecordStore().list(…))` —— 非同期の述語が要る',
  },
  {
    file: 'src/renderer/pages/__tests__/mutualFundsImpossibleReturn.test.ts',
    kind: 'setup-flush',
    why: 'helper (`ytdCell`) が行を掴めない。上と同じく操作の側',
  },
  {
    file: 'src/renderer/pages/__tests__/mutualFundsYtdUnentered.test.ts',
    kind: 'setup-flush',
    why: '`addHolding` が欄を掴めない。落ちるのは主張ではなく操作の側',
  },
  {
    file: 'src/renderer/pages/__tests__/overviewBankSheet.test.ts',
    kind: 'text-helper',
    why: '文を読むのが helper (`q.cell` / `q.sheet`) で、`expect(…)` の行に `textContent` の綴りが無い —— **パス 368 の針が見落とした形そのもの**',
  },
  {
    file: 'src/renderer/pages/__tests__/overviewHydroponics.test.ts',
    kind: 'setup-flush',
    why: '`q.button(…)` が押す物を掴めない (17 件)。操作の側',
  },
  {
    file: 'src/renderer/pages/__tests__/parameterWiring.test.ts',
    kind: 'setup-flush',
    why: '99 か所を共有の待ちへ寄せた**あとも**落ちる —— 落ちるのは寄せた `waitForText` 自身で、その前の上書きの適用が流れていない。**条件で待っても、遷移が起きていなければ待てない**',
  },
  {
    file: 'src/renderer/pages/__tests__/refusedSave.test.ts',
    kind: 'text-helper',
    why: '`says(…)` が真偽値を返す helper。待ちに渡すには述語を切り出す (未着手)',
  },
  {
    file: 'src/renderer/pages/__tests__/salesDuplicateImport.test.ts',
    kind: 'setup-flush',
    why: '寄せた `waitForText` 自身が届かない (取り込みが流れていない) + `toBeDefined()` が 1 件',
  },
  {
    file: 'src/renderer/pages/__tests__/shopifyDuplicateOrder.test.ts',
    kind: 'store-roundtrip',
    why: '`expect(await sales()).toHaveLength(2)` —— 非同期の述語が要る',
  },
  {
    file: 'src/renderer/pages/__tests__/taxPageMethodAvailability.test.ts',
    kind: 'text-helper',
    why: '`recommended()` が文を返す helper。`toBe` の厳密一致',
  },
  {
    file: 'src/renderer/pages/__tests__/teamLastOwner.test.ts',
    kind: 'setup-flush',
    why: '`roleSelectFor(…)` が欄を掴めない。操作の側',
  },
];

function patchAll(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-sensitivity-'));
  const saved = [];
  files.forEach((f, i) => {
    const abs = path.join(REPO, f);
    const src = fs.readFileSync(abs, 'utf8');
    const zero = zeroTicks(src);
    if (zero === null) return;
    const bak = path.join(dir, `${i}.bak`);
    fs.writeFileSync(bak, src);
    saved.push({ file: f, abs, bak, src });
    fs.writeFileSync(abs, zero);
  });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(saved.map((s) => [s.bak, s.file]), null, 2));
  return { dir, saved };
}

/** 必ず戻す。**戻したことを内容で確かめる** —— 戻し損ねたまま緑を返さない。 */
function restoreAll(saved) {
  const bad = [];
  for (const s of saved) {
    try {
      fs.writeFileSync(s.abs, s.src);
      if (fs.readFileSync(s.abs, 'utf8') !== s.src) bad.push(s.file);
    } catch {
      bad.push(s.file);
    }
  }
  return bad;
}

function failingFiles(stdout) {
  const out = new Set();
  for (const m of stdout.matchAll(/(?:FAIL|❯)\s+(src\/[^\s:]+\.test\.ts)/g)) out.add(m[1]);
  return [...out].sort();
}

function run(outPath) {
  const files = collect();
  console.log(`固定回数の待ちを持つ検査: ${files.length} 本 —— 周回数を 0 にして走らせる`);
  const { dir, saved } = patchAll(files);
  console.log(`  控え: ${dir} (落ちたらここから戻す)`);
  let stdout;
  let bad;
  try {
    const r = cp.spawnSync('npx', ['vitest', 'run', ...saved.map((s) => s.file)], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    stdout = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    if (outPath) fs.writeFileSync(outPath, stdout);
  } finally {
    // **戻すのは finally で、答えを返すのはその外。** finally から return すると
    // 途中で投げた例外を握り潰す (eslint `no-unsafe-finally`) —— 書き換えた
    // ソースを戻すことと、戻せなかったことを報せることは別の仕事である。
    bad = restoreAll(saved);
  }
  if (bad.length > 0) {
    console.error(`\n❌ 戻せなかったファイルが ${bad.length} 本 —— ${dir} から手で戻すこと`);
    for (const b of bad) console.error(`   ${b}`);
    return 2;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 全件を元へ戻した (内容で照合)');
  const failing = failingFiles(stdout);
  console.log(`\n0 周で落ちたファイル: ${failing.length} 本 / ${saved.length} 本`);
  for (const f of failing) {
    const row = LEDGER.find((r) => r.file === f);
    console.log(`  ${row ? `[${row.kind}]` : '[台帳に無い]'} ${f}`);
  }
  const unlisted = failing.filter((f) => !LEDGER.some((r) => r.file === f));
  const gone = LEDGER.filter((r) => !failing.includes(r.file));
  if (unlisted.length > 0) {
    console.error(`\n❌ 台帳に無いファイルが ${unlisted.length} 本 —— 条件で待つ形へ寄せるか、依る理由を台帳へ`);
  }
  if (gone.length > 0) {
    console.error(`\n❌ 台帳に在るのに落ちなかったファイルが ${gone.length} 本 —— 直ったなら台帳からも消す`);
    for (const g of gone) console.error(`   ${g.file}`);
  }
  if (unlisted.length === 0 && gone.length === 0) {
    console.log('\n✅ 落ちたファイルは台帳どおり (双方向)');
    return 0;
  }
  return 1;
}

function selfTest() {
  const fails = [];
  const ok = (label, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
    if (!cond) fails.push(label);
  };
  const sample = 'async function settle() {\n  for (let i = 0; i < 8; i += 1) {\n'
    + '    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });\n  }\n}\n';
  ok('★ 針が実物の形に当たる (標本)', IS_SETTLE.test(sample));
  ok('★ 書き換えが実際に 0 周にする (標本)', (zeroTicks(sample) ?? '').includes('i < 0'));
  ok('待ちでない for は書き換えても印が立たない', !IS_SETTLE.test('for (let i = 0; i < 3; i += 1) sum += i;\n'));
  ok('同じ文字列を 2 度書き換えても増えない (冪等)', zeroTicks(zeroTicks(sample)) === null);
  ok('走査が実物に届いている (30 本以上)', collect().length >= 30);
  ok('落ちたファイルの読み取りが FAIL 行に当たる (標本)',
    failingFiles(' FAIL  src/renderer/__tests__/x.test.ts > a > b\n').length === 1);
  ok('台帳の行はすべて理由を持つ', LEDGER.every((r) => typeof r.why === 'string' && r.why.trim().length > 10));
  ok('台帳の行はすべて実在するファイルを指す',
    LEDGER.every((r) => fs.existsSync(path.join(REPO, r.file))));
  if (fails.length > 0) {
    console.error(`\n❌ self-test ${fails.length} 件失敗`);
    return 1;
  }
  console.log('\n✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const out = argv.find((a) => a.startsWith('--out='));
  return run(out ? out.slice('--out='.length) : null);
}

module.exports = { LEDGER, collect, zeroTicks, failingFiles, IS_SETTLE };

if (require.main === module) process.exit(main(process.argv.slice(2)));
