/**
 * **端末に置く状態ファイルは封緘する** —— 母集団を実装から数える (パス 133)。
 *
 * 状態ファイルを持つモジュール = 置き場所を決める関数 (`defaultStatePath` / `storePath` / `secretsPath`)
 * を定義するファイル。それぞれ `sealJsonDocument(` (main/atRest.ts) か `safeStorage.encryptString(`
 * (secrets.ts) を通る。通らないなら台帳に理由を書く (双方向・理由は空でない)。
 *
 * 2026-09-09 (パス 132) まで、同じ端末に置く 5 つのうち封緘していたのは secrets.json だけで、
 * 誰も数えていなかった (`stateWritePolicy.test.ts` は原子性を数え、封緘は数えていない)。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');

/** 封緘しない状態ファイルと、その理由。 */
const PLAINTEXT_LEDGER: Record<string, string> = {
  'src/main/clients/stocks.ts':
    '`state.json` の中身はウォッチリストの銘柄記号だけ (氏名・評価・メモは無い)。封緘は「鍵違いで読めなくなる」道を'
    + '足すので、守る物が無い所には掛けない。銘柄以外を置く日が来たら同じ atRest.ts を通し、この行を消す。',
};

const STATE_PATH_DEF = /\bfunction (defaultStatePath|storePath|secretsPath)\(\): string\b/;
const SEALS = /\bsealJsonDocument\(|\bsafeStorage\.encryptString\(/;

/** コメント行を落とす (説明の中で名前を挙げる箇所がある)。 */
function code(src: string): string {
  return src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'));
    })
    .join('\n');
}

interface StateModule {
  readonly file: string;
  readonly sealed: boolean;
}

const MODULES: StateModule[] = globSync(['src/main/**/*.ts'], { cwd: REPO, absolute: true, ignore: ['**/__tests__/**'] })
  .map((abs) => ({ abs, src: code(readOriginalSource(abs)) }))
  .filter(({ src }) => STATE_PATH_DEF.test(src))
  .map(({ abs, src }) => ({ file: relative(REPO, abs).split('\\').join('/'), sealed: SEALS.test(src) }))
  .sort((a, b) => a.file.localeCompare(b.file));

describe('main: 状態ファイルの封緘の台帳 (母集団は実装から)', () => {
  it('走査が生きている (床: 4 モジュール以上・標本: talent / teamradar / emotions / secrets)', () => {
    const files = MODULES.map((m) => m.file);
    expect(files.length, files.join('\n')).toBeGreaterThanOrEqual(4);
    for (const f of [
      'src/main/clients/talent.ts',
      'src/main/clients/teamradar.ts',
      'src/main/clients/emotions.ts',
      'src/main/secrets.ts',
    ]) {
      expect(files, `${f} が走査に無い`).toContain(f);
    }
  });

  it('★ 封緘していない状態ファイルは、台帳に理由が無ければ落ちる', () => {
    const plain = MODULES.filter((m) => !m.sealed && !(m.file in PLAINTEXT_LEDGER)).map((m) => m.file);
    expect(plain, '状態ファイルは sealJsonDocument (main/atRest.ts) を通すこと。通さないなら台帳に理由を書く').toEqual([]);
  });

  it('★ 台帳に載っているのに、実際は封緘している (または状態ファイルを持たない) 項目は無い', () => {
    const stale = Object.keys(PLAINTEXT_LEDGER).filter((f) => {
      const m = MODULES.find((x) => x.file === f);
      return m === undefined || m.sealed;
    });
    expect(stale).toEqual([]);
  });

  it('理由は 20 字以上', () => {
    const thin = Object.entries(PLAINTEXT_LEDGER)
      .filter(([, why]) => why.length < 20)
      .map(([f]) => f);
    expect(thin).toEqual([]);
  });

  it('規則は標本に当たる (対照)', () => {
    expect(STATE_PATH_DEF.test('export function defaultStatePath(): string {')).toBe(true);
    expect(STATE_PATH_DEF.test('function storePath(): string {')).toBe(true);
    expect(STATE_PATH_DEF.test('function secretsPath(): string {')).toBe(true);
    expect(STATE_PATH_DEF.test('export function defaultSvgExportPath(): string {')).toBe(false);
    expect(SEALS.test('  await write(p, sealJsonDocument(JSON.stringify(clean)));')).toBe(true);
    expect(SEALS.test("    return safeStorage.encryptString(value).toString('base64');")).toBe(true);
    expect(SEALS.test('  await write(p, JSON.stringify(clean, null, 2));')).toBe(false);
    // コメントは数えない (説明の中で名前を挙げる)
    expect(SEALS.test(code('// sealJsonDocument( を通す\nconst x = 1;'))).toBe(false);
    expect(SEALS.test(code(' * safeStorage.encryptString( の写し\nconst y = 2;'))).toBe(false);
  });
});
