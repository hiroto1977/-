import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CARD = readFileSync(
  path.join(REPO_ROOT, 'src/renderer/components/GoogleConnectCard.tsx'),
  'utf8',
);

/*
 * **トークンの保存方法について画面が言うこと**を留める。
 *
 * 2026-08-22 まで `GoogleConnectCard` は
 *
 *     「トークンは OS キーチェーンに暗号化保存されます。」
 *
 * と**条件なしで**書いていた。これは 2 通りに誤っていた:
 *
 *   1. **ブラウザ版には OS キーチェーンが無い。** このカードは
 *      Gmail / Calendar / Drive の各ページに出ており、その 3 ページは
 *      両方のビルドに載る。ブラウザ版の保存先は WebCrypto Vault
 *      (IndexedDB) である
 *   2. **デスクトップ版でもキーチェーンが無い環境がある。**
 *      gnome-keyring / kwallet 不在の Linux では `secrets.ts` が
 *      `plain:` 接頭辞つきの **base64 難読化**へ落とす (暗号化ではない)
 *
 * `secrets.ts` 自身は正直で、コンソールにも「NOT real encryption」と出すし、
 * 「設定」ページは実際の状態を `storageProtection()` で問い合わせて出している。
 * **嘘をついていたのはカードの地の文だけ**だった —— 利用者が
 * 「トークンを貼ってよいか」を判断する、まさにその場所である。
 *
 * ここは live な状態を再実装しない (それをやると 3 ページぶん増えて、
 * このリポジトリで何度も直している「同じ判断の N 実装」になる)。
 * 代わりに**条件つきで正しいことを書き、実際の状態は「設定」へ送る**。
 */
describe('トークン保存の説明が、環境によらず正しいこと', () => {
  it('「OS キーチェーンに暗号化保存されます」と断言していない', () => {
    // 条件を伴わない断言だけを禁じる。語そのものは正しい文にも出る。
    expect(CARD).not.toMatch(/トークンは\s*OS\s*キーチェーンに\s*暗号化保存されます/);
  });

  it('キーチェーンが無い環境では難読化のみ、と書いてある', () => {
    expect(CARD).toContain('base64 の難読化のみ');
  });

  it('ブラウザ版の保存先 (Vault) にも触れている', () => {
    expect(CARD).toMatch(/ブラウザ版は\s*Vault/);
  });

  it('実際の状態の確認先を案内している', () => {
    expect(CARD).toMatch(/設定/);
  });
});

/*
 * **同じ断言が他の画面へ増えていないか。**
 *
 * 直したのは 1 か所だが、次に誰かが別のカードへ同じ一文を書くと元に戻る。
 * レンダラー全体を走査して、条件を伴わない断言が無いことを見る。
 */
describe('同じ断言が他の画面に無い', () => {
  function tsxFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') tsxFiles(p, out);
        continue;
      }
      if (name.endsWith('.tsx')) out.push(p);
    }
    return out;
  }

  /*
   * **判定は「ファイルに但し書きが在るか」ではなく、断言そのものを見る。**
   *
   * 最初これを「キーチェーンと暗号化保存が近接し、かつファイル内に『難読化』
   * が無ければ違反」と書いた。すると**直した文が 1 つ在るだけでファイル全体が
   * 免除**され、同じファイルへ断言を足しても鳴らなかった (対照実験で判明)。
   * 「守っているつもりの守り」なので、出現ごとに見る形へ直した。
   */
  const UNCONDITIONAL = /トークンは\s*OS\s*キーチェーンに\s*暗号化保存されます/g;

  it('断言そのものが、どの画面にも 1 つも無い', () => {
    const offenders: string[] = [];
    for (const f of tsxFiles(path.join(REPO_ROOT, 'src/renderer'))) {
      const text = readFileSync(f, 'utf8');
      const hits = text.match(UNCONDITIONAL);
      if (hits) offenders.push(`${path.relative(REPO_ROOT, f)} (${hits.length})`);
    }
    expect(offenders, `条件なしの断言が残っている: ${offenders.join(', ')}`).toEqual([]);
  });

  it('直した文が在るファイルでも、断言を足せば鳴る (免除されない)', () => {
    // 実ファイルではなく文字列で規則そのものを確かめる —— 「但し書きが在るから
    // 免除」に戻っていないことを、ファイルの中身に依存せず留める。
    const corrected =
      'トークンの保存方法はビルドと環境で変わります… base64 の難読化のみ になります。';
    const withBoth = corrected + 'トークンは OS キーチェーンに暗号化保存されます';
    expect(corrected.match(UNCONDITIONAL)).toBeNull();
    expect(withBoth.match(UNCONDITIONAL)).toHaveLength(1);
  });

  it('走査が空振りしていない (実ファイルを読めている)', () => {
    expect(tsxFiles(path.join(REPO_ROOT, 'src/renderer')).length).toBeGreaterThan(20);
  });
});
