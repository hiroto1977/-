/**
 * **鍵導出のパラメータは凍結値を読む。書き写さない** (2026-09-19 · パス 327)。
 *
 * `shared/cryptoParams.ts` の docblock はこう述べている ——
 *
 * > 最も危ういのは `data/cloudBackup.ts` の鍵導出識別子で、**反復回数を文字列に焼き込んでいた**。
 * > vault 側の強度を上げても、バックアップに添える暗号メタは「600k」と言い続ける ——
 * > 後から復号する側が信じるのはこの文字列なので、実装とメタデータが食い違うと
 * > **「復号できないバックアップ」**になる。
 *
 * そして「**1 つであるべきもの (IV 長・反復回数・ハッシュ) だけ**をここへ集めた」と続く。
 * ところが実測すると、**ハッシュだけは 3 つの導出すべてが `'SHA-256'` のリテラルを書き写していた**
 * (`security/dataCrypto.ts` の 1 つと `security/vault.ts` の 2 つ = パスワード枝と合言葉の復元枝)。
 * 反復回数は引数で渡されて凍結値を通るのに、ハッシュだけが通っていなかった。
 *
 * 実際の壊れ方: `PBKDF2_HASH` を `'SHA-512'` にすると、封筒へ書く
 * `BACKUP_KEY_DERIVATION = kdfLabel()` は SHA-512 と名乗るのに、導出は SHA-256 のまま進む。
 * **メタデータを信じて復号する側は鍵を作り直せない** —— docblock が防ぐと書いているそれである。
 *
 * ## 何を母集団にするか
 *
 * PBKDF2 の**導出パラメータ** (`{ name: 'PBKDF2', … }`) だけ。
 * `crypto.subtle.digest('SHA-256', …)` は素のハッシュで、封筒のメタに残らず
 * 「後から復号する側が信じる文字列」にもならないので**別の話**として台帳に理由つきで並べる
 * (混ぜると、直したい 3 行が 6 行の中に埋もれる)。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';
import { PBKDF2_HASH, PBKDF2_ITERATIONS, kdfLabel } from '../cryptoParams';

const REPO = join(__dirname, '..', '..', '..');
const FROZEN = 'src/shared/cryptoParams.ts';
/** PBKDF2 の導出パラメータの行。 */
const KDF_PARAMS = /name:\s*'PBKDF2'/;
/** 素のハッシュ (封筒に残らない)。 */
const DIGEST = /\.digest\(\s*'SHA-\d+'/;

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function shippedSources(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**', '**/*.d.ts'],
  });
}

function sitesMatching(re: RegExp): Site[] {
  const out: Site[] = [];
  for (const abs of shippedSources()) {
    const file = relative(REPO, abs).split('\\').join('/');
    stripComments(readOriginalSource(abs)).split('\n').forEach((line, i) => {
      if (re.test(line)) out.push({ file, line: i + 1, text: line.trim() });
    });
  }
  return out;
}

/** `{ name: 'PBKDF2' }` は importKey にも出る (パラメータを持たない)。導出だけを採る。 */
const KDF_SITES = sitesMatching(KDF_PARAMS).filter((s) => s.text.includes('salt'));
const DIGEST_SITES = sitesMatching(DIGEST);

/** 素のハッシュはなぜ凍結値を読まなくてよいか (1 行ずつ)。 */
const DIGEST_LEDGER: readonly { readonly file: string; readonly why: string }[] = [
  { file: 'src/renderer/oauth/pkce.ts', why: 'PKCE の code_challenge。RFC 7636 が S256 を名指ししており、変えたら仕様違反になる (凍結値と連動させてはいけない)' },
  { file: 'src/renderer/data/backup.ts', why: 'バックアップの内容の指紋。鍵導出ではなく同一性の確認で、封筒のメタに残らない' },
  { file: 'src/renderer/security/mnemonic.ts', why: 'BIP-39 の検査和。規格が SHA-256 を定めているので凍結値とは別の決定' },
];

describe('鍵導出のパラメータ (パス 327)', () => {
  it('走査が生きている (PBKDF2 の導出が 1 か所以上)', () => {
    expect(KDF_SITES.length).toBeGreaterThanOrEqual(1);
  });

  it('★ PBKDF2 の導出は 3 か所で、どれも凍結値 PBKDF2_HASH を読む', () => {
    expect(KDF_SITES).toHaveLength(3);
    for (const s of KDF_SITES) {
      expect(s.text, `${s.file}:${s.line}`).toContain('hash: PBKDF2_HASH');
    }
    const files = [...new Set(KDF_SITES.map((s) => s.file))].sort();
    expect(files).toEqual(['src/renderer/security/dataCrypto.ts', 'src/renderer/security/vault.ts']);
  });

  it("★ 導出のハッシュに 'SHA-256' のリテラルを書き写した行は 0 (凍結値の宣言だけが持つ)", () => {
    const copies = KDF_SITES.filter((s) => /hash:\s*'SHA-\d+'/.test(s.text));
    expect(copies.map((s) => `${s.file}:${s.line} ${s.text}`)).toEqual([]);
    // 標本: 直す前の行は針に当たる (不在の主張に綴りを添える)
    const before = "    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },";
    expect(KDF_PARAMS.test(before)).toBe(true);
    expect(/hash:\s*'SHA-\d+'/.test(before)).toBe(true);
    // 直した形は当たらない
    expect(/hash:\s*'SHA-\d+'/.test(before.replace("'SHA-256'", 'PBKDF2_HASH'))).toBe(false);
  });

  it('★ 素のハッシュ (digest) は別の話として台帳に在る (両方向)', () => {
    const files = [...new Set(DIGEST_SITES.map((s) => s.file))].sort();
    expect(files).toEqual(DIGEST_LEDGER.map((r) => r.file).sort());
    for (const r of DIGEST_LEDGER) expect(r.why.length).toBeGreaterThan(20);
  });

  it('凍結値の宣言はこのファイルだけが持つ', () => {
    const decls = sitesMatching(/PBKDF2_HASH\s*=/);
    expect(decls.map((s) => s.file)).toEqual([FROZEN]);
  });

  /*
   * 封筒に書く名札は凍結値から組む。ここが凍結値と切れていると、
   * 「実装は SHA-256 / メタは SHA-512」という組が作れてしまう。
   */
  it('★ kdfLabel は凍結値のハッシュと反復回数を名乗る', () => {
    expect(kdfLabel()).toContain(PBKDF2_HASH);
    expect(kdfLabel()).toContain(String(PBKDF2_ITERATIONS / 1000));
    expect(kdfLabel(1000, 'SHA-512')).toContain('SHA-512');
  });
});
