/**
 * **鍵を作る所は、母集団を走査して数える** (2026-09-12 · パス 171)。
 *
 * ## なぜ台帳ではなく走査か
 *
 * パス 171 は `deriveKey` だけを守って「直した」と思った。検査を書いたら
 * **`initialize` は素の TypeError を出し続けた** —— その経路は `generateMasterKey`
 * (`crypto.subtle.generateKey`) を先に触るからである。**守り漏れが 1 つ在ると、
 * その経路だけが内部 API の名前を見せる。**
 *
 * これは「3 か所のうち 1 か所を残す」形そのもの (パス 66 / 168 / 169)。手で並べた
 * 一覧では次に鍵の作り方が増えたときに同じことが起きるので、**走査で数える**。
 *
 * ## 何を母集団にするか
 *
 * `crypto.subtle` の呼びは 2 種類に分かれる:
 *
 * | 種類 | 呼び | 最初の触りになりうるか |
 * | --- | --- | --- |
 * | **鍵を作る** | `importKey` / `deriveKey` / `generateKey` | **なる** —— 鍵が無ければ何も始まらない |
 * | 鍵を使う | `encrypt` / `decrypt` / `exportKey` / `digest` | ならない (鍵が既に在る = 上を通っている) |
 *
 * だから母集団は**鍵を作る呼び**だけ。使う側にも守りを置くと、**到達できない行**が
 * 増えるだけになる (パス 169 で `waitForElement` の到達不能な防御を消したのと同じ
 * 判断 —— 測っていない防御は「守っているつもり」を増やす)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';

const SECURITY = path.resolve(__dirname, '..');

/** 鍵を作る呼び (最初の触りになりうる物)。 */
const KEY_PRODUCERS = /crypto\.subtle\.(importKey|deriveKey|generateKey)\s*\(/g;

/** 守りの印 —— 文面は `webCrypto.ts` が 1 つ持つので、その関数名で当てる。 */
const GUARD = /webCryptoUnavailableReason\s*\(/;

/** 鍵を作る呼びを含む関数を、走査で切り出す (定義行から次の定義行まで)。 */
function keyProducingFunctions(src: string): { name: string; body: string }[] {
  const lines = src.split('\n');
  const defs: { name: string; at: number }[] = [];
  // **制御構文を関数定義と見ない。** 最初の版は `  if (…)` を 2 空白の method 定義として
  // 掴み、関数本体を `if` 行で切ってしまった —— 守りと `crypto.subtle` が別の「関数」に
  // 分かれ、守っているのに守り漏れと報告された (走査を書いたら必ず現物で確かめる)。
  const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'try', 'else', 'do', 'return', 'await']);
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s{2}(?:async\s+)?(\w+)\s*\(/.exec(lines[i]!);
    if (!m) continue;
    const name = m[1] ?? m[2] ?? '?';
    if (KEYWORDS.has(name)) continue;
    defs.push({ name, at: i });
  }
  const out: { name: string; body: string }[] = [];
  for (let d = 0; d < defs.length; d += 1) {
    const from = defs[d]!.at;
    const to = d + 1 < defs.length ? defs[d + 1]!.at : lines.length;
    const body = lines.slice(from, to).join('\n');
    KEY_PRODUCERS.lastIndex = 0;
    if (KEY_PRODUCERS.test(body)) out.push({ name: defs[d]!.name, body });
  }
  return out;
}

/** 鍵を扱うモジュール (この 2 つが `crypto.subtle` を持つ。`mnemonic.ts` は digest だけ)。 */
const MODULES = ['vault.ts', 'dataCrypto.ts'] as const;

describe('鍵を作る所はすべて WebCrypto の有無を見る (走査で数える · パス 171)', () => {
  it('★ 走査が実物に当たる (鍵を作る関数が見つかる)', () => {
    const found = MODULES.flatMap((m) => keyProducingFunctions(readOriginalSource(path.join(SECURITY, m))));
    expect(found.length, '鍵を作る関数が 1 つも見つからない (走査が死んでいる)').toBeGreaterThanOrEqual(3);
    // 実測 (2026-09-12): vault の deriveKey / deriveKeyFromMnemonic / generateMasterKey
    // と dataCrypto の deriveKey。名前で 1 つ確かめて、走査が本物を見ていることを示す。
    expect(found.map((f) => f.name)).toContain('generateMasterKey');
  });

  it('★ 鍵を作る関数はすべて守っている (守り漏れが 0 件)', () => {
    const bare: string[] = [];
    for (const m of MODULES) {
      for (const f of keyProducingFunctions(readOriginalSource(path.join(SECURITY, m)))) {
        if (!GUARD.test(f.body)) bare.push(`${m}:${f.name}`);
      }
    }
    expect(bare, 'WebCrypto の有無を見ずに鍵を作る関数がある').toEqual([]);
  });

  it('★ 鍵を使うだけの呼びには守りを求めない (到達できない行を増やさない)', () => {
    // `encrypt` / `decrypt` しか呼ばない関数は母集団の外 —— 走査がそれを
    // 拾っていないことを、実物の中で確かめる。
    const src = readOriginalSource(path.join(SECURITY, 'vault.ts'));
    const names = keyProducingFunctions(src).map((f) => f.name);
    expect(names, 'encryptBytes を鍵の生産者として数えている').not.toContain('encryptBytes');
    expect(names, 'decryptBytes を鍵の生産者として数えている').not.toContain('decryptBytes');
    // ただし本物に encrypt/decrypt が在ることは確かめる (走査の対象が空でない)。
    expect(src).toContain('crypto.subtle.encrypt');
    expect(src).toContain('crypto.subtle.decrypt');
  });

  it('★ 対照: 守りを外した標本を掴み、守った標本は通す', () => {
    const bare = 'async function mk() {\n  return crypto.subtle.generateKey({}, true, []);\n}';
    const guarded =
      'async function mk() {\n  const m = webCryptoUnavailableReason();\n'
      + '  if (m !== null) throw new Error(m);\n  return crypto.subtle.generateKey({}, true, []);\n}';
    const usesOnly = 'async function enc() {\n  return crypto.subtle.encrypt({}, k, b);\n}';
    expect(keyProducingFunctions(bare)).toHaveLength(1);
    expect(GUARD.test(keyProducingFunctions(bare)[0]!.body), '守っていない標本を守り済みと見ている').toBe(false);
    expect(GUARD.test(keyProducingFunctions(guarded)[0]!.body), '守った標本を掴めていない').toBe(true);
    expect(keyProducingFunctions(usesOnly), '鍵を使うだけの標本を生産者として数えている').toHaveLength(0);
  });

  it('★ 文面は 1 か所 (`webCrypto.ts`) が持つ —— 各モジュールが写していない', () => {
    for (const m of MODULES) {
      const src = readOriginalSource(path.join(SECURITY, m));
      expect(src, `${m} が文面を写している`).not.toContain('WebCrypto) が使えないため');
      expect(src, `${m} が共有の判定を import していない`).toMatch(
        /import \{[^}]*webCryptoUnavailableReason[^}]*\} from '\.\/webCrypto'/,
      );
    }
  });
});
