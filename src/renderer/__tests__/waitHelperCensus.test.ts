/**
 * **jsdom で「待つ」道は何本あるか — 母集団を走査で数える** (2026-09-12 · パス 169)。
 *
 * ## なぜ数えるか
 *
 * この repo の jsdom harness は 2 通りの待ち方を持っている:
 *
 * 1. **固定回数の `settle`** — `for (let i = 0; i < 8; i += 1) await act(…)`。
 *    回数を当てているだけで条件を見ていない。実測 2026-09-12 で
 *    `settle` を定義するのは 85 ファイル、うち **50 が固定 8 周**。
 * 2. **条件で待つ** — 出るまで回し、出なければ落ちる。
 *
 * (1) は空いている機械では足り、**全件実行の負荷の下では足りないことがある**。
 * 実際に 2 度起きた: 2026-09-09 (`recordShapeAuditPanel`・IndexedDB の往復) と
 * 2026-09-12 (`settingsGoogleOAuth`・`crypto.subtle.digest`)。どちらも
 * **1 万 4 千〜1 万 5 千件のうちその 1 本だけ**が落ち、単独では通った。
 *
 * 1 度目のとき、その場に待つ helper が手書きされた。**寄せなかったので 2 度目が
 * 別のファイルで起きた** —— パス 66 / 168 と同じ「母集団のうち 1 か所だけ直す」形。
 * だから (2) を `__tests__/jsdomWait.ts` に 1 つ置き、**自前で回しているファイルを
 * 走査で数えて台帳と突き合わせる**。7 本目が黙って増えたらここが鳴る。
 *
 * ## 台帳に残す 2 つの理由
 *
 * 手書きが残っているのは「直していない」のではなく、**契約が違う**物が在るため:
 *
 * | 形 | 時間切れで | 共有 helper に在るか |
 * | --- | --- | --- |
 * | 出るまで待つ | **落ちる** (出るはずの物が出ていない) | ✅ `settleUntil` / `waitForElement` / `waitForText` |
 * | 届くのを待つ | **落ちない** (届かないことも検査したい) | ❌ 未だ無い —— だから手書きが残る |
 *
 * 2 つ目 (`waitFor(seen)` の形) は BroadcastChannel の配達を待ち、届かない場合も
 * 「0 件のまま」と確かめる。落ちる待ちに置き換えると**不在の検査ができなくなる**ので
 * 変えていない。共有側に非投げの待ちを足すのは別のパスで (理由が要るのはこの差である)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const SRC = path.resolve(__dirname, '../..');

/** `src` 以下の検査ファイルを全部集める (母集団を手で書かない)。 */
function testFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...testFiles(full));
    else if (/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

/**
 * 「自前で待ちを回している」印。**時間を見ながら回す**形を掴む
 * (固定回数の `settle` は時間を見ないので、ここには入らない)。
 */
const POLL_MARKS: readonly RegExp[] = [
  /setTimeout\(\s*tick\s*,/,
  /while\s*\([^)]*\)\s*\{[\s\S]{0,300}?await act\s*\(/,
  /Date\.now\(\)\s*>\s*until\b/,
  /Date\.now\(\)\s*-\s*started\s*>=?/,
];

function pollsByHand(src: string): boolean {
  return POLL_MARKS.some((re) => re.test(src));
}

/**
 * **この検査ファイル自身**は母集団から外す。
 *
 * 下の対照は、印が実際に当たることを標本で確かめるために
 * `Date.now() > until` などを**文字列として持っている** —— 走査はそれを現物として
 * 掴む (パス 161 / 167 で 2 度踏んだ「規則について書いた文書を現物と見分けられない」形)。
 *
 * 除外は**綴りの一致ではなく自分の名前**で行い、**ちょうど 1 件外れる**ことを
 * 下の検査が確かめる —— 名前で外すと他のファイルまで巻き込む余地が無い。
 */
const SELF = path.basename(__filename);

/** 自前で回してよいファイルと、その理由 (`src` からの相対)。 */
const HAND_ROLLED_ALLOWED: Readonly<Record<string, string>> = {
  'renderer/components/__tests__/recordShapeAuditPanel.test.ts':
    '文が出るまで待つ形。2026-09-09 にこの 1 本が全件実行で落ちた当事者で、doc に経緯が書かれている。共有の waitForText へ寄せられる (別パス)',
  'renderer/components/__tests__/restorePassphraseField.test.ts':
    '保管庫の鍵導出 (PBKDF2 60 万回) の後の文を待つ。上限 20 秒は共有の既定 (5 秒) より長く、上限を渡す形で寄せられる (別パス)',
  'renderer/components/__tests__/backupPassphraseFloor.test.ts': '同上 (同じ形の兄弟)',
  'renderer/pages/__tests__/settingsHardReset.test.ts':
    '**届くのを待つ形** —— 時間切れでも落ちず、届かなかったことも検査する。落ちる待ちに置き換えると不在の検査ができない',
  'renderer/security/__tests__/LockScreen.test.ts':
    '同上 (BroadcastChannel の配達を待ち、配られないことも見る)',
  'renderer/security/__tests__/lockWorkspace.test.ts': '同上 (同じ形の兄弟)',
};

describe('jsdom の待ちは 1 か所に寄せる (母集団は走査で数える · パス 169)', () => {
  const files = testFiles();
  const scanned = files.filter((f) => path.basename(f) !== SELF);
  const handRolled = scanned
    .filter((f) => pollsByHand(readOriginalSource(f)))
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'));

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(files.length, '検査ファイルが集まっていない').toBeGreaterThanOrEqual(500);
    expect(handRolled.length, '自前の待ちが 1 件も見つからない (走査が死んでいる)').toBeGreaterThanOrEqual(3);
  });

  it('★ 除外はこのファイル 1 件だけ (標本を持つ側が母集団を削っていない)', () => {
    expect(files.length - scanned.length, '除外が 1 件ではない').toBe(1);
    // 外したファイルは実際に印を持つ (外す意味が在る)。
    const self = files.find((f) => path.basename(f) === SELF);
    expect(self, 'この検査ファイル自身が母集団から消えている').toBeDefined();
    expect(pollsByHand(readOriginalSource(self!)), '標本が印に当たっていない').toBe(true);
  });

  it('★ 自前で待ちを回すファイルはすべて台帳に在る (7 本目が黙って増えない)', () => {
    expect(
      handRolled.filter((f) => !(f in HAND_ROLLED_ALLOWED)),
      '台帳に無い自前の待ち —— 共有の jsdomWait へ寄せるか、寄せられない理由を台帳に書く',
    ).toEqual([]);
  });

  it('★ 台帳の行はすべて現物 (寄せ終わった行が残っていない)', () => {
    expect(
      Object.keys(HAND_ROLLED_ALLOWED).filter((f) => !handRolled.includes(f)),
      '台帳の古い行',
    ).toEqual([]);
  });

  it('★ 台帳の理由が空でない', () => {
    for (const [f, why] of Object.entries(HAND_ROLLED_ALLOWED)) {
      expect(why.length, `${f}: 理由が無い`).toBeGreaterThan(10);
    }
  });

  it('★ 共有の待ちは実在し、3 つとも公開されている', () => {
    const src = readOriginalSource(path.join(SRC, 'renderer/__tests__/jsdomWait.ts'));
    for (const name of ['settleUntil', 'waitForElement', 'waitForText']) {
      expect(src, `${name} が公開されていない`).toContain(`export async function ${name}`);
    }
    // 時間切れで**落ちる**こと (黙って通る待ちにしない) を綴りで留める。
    expect(src).toContain('throw new Error');
  });

  it('★ 対照: 印が自前の待ちに当たり、固定回数の settle には当たらない', () => {
    const byHand = 'while (!ok) {\n  await act(async () => { await tick(); });\n}';
    const tickForm = 'const tick = () => { if (done) return resolve(); setTimeout(tick, 5); };';
    const untilForm = 'if (Date.now() > until) throw new Error("timeout");';
    const fixed = 'for (let i = 0; i < 8; i += 1) {\n  await act(async () => {});\n}';
    expect(pollsByHand(byHand), '自前の while + act を掴めていない').toBe(true);
    expect(pollsByHand(tickForm), 'setTimeout(tick, …) を掴めていない').toBe(true);
    expect(pollsByHand(untilForm), 'Date.now() > until を掴めていない').toBe(true);
    // 固定回数は「待ち」ではないので、この台帳の対象外 (数えるのは別の話)。
    expect(pollsByHand(fixed), '固定回数の settle を自前の待ちとして掴んでいる').toBe(false);
    expect(pollsByHand('const x = 1;'), '無関係な文を掴んでいる').toBe(false);
  });
});
