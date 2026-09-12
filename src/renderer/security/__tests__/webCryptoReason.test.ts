/**
 * **`webCrypto.ts` 自身の契約を、分岐ごとに押す** (2026-09-12 · パス 171)。
 *
 * ## なぜ別に要るのか
 *
 * `webCryptoAbsent.test.ts` は**配線**を見る (保管庫・バックアップ・ロック画面まで
 * 1 文が届くか)。こちらは**この 3 関数そのもの**を見る —— パス 171 でこのファイルを
 * 完全性チェーンの保護対象にしたので、`lint:mutation-scope` が
 * 「保護対象なのに変異検査に載っていない」と鳴った。載せるには**変異体が全部死ぬ**
 * 必要があり、そのためには分岐と文面を 1 つずつ押さえなければならない。
 *
 * ## 変異体の一覧と、それを殺す検査 (手で当てて確かめた)
 *
 * | 変異 | 殺す検査 |
 * | --- | --- |
 * | `c == null` → `c != null` | 本物の暗号で `null` を期待する検査 |
 * | `return false` → `return true` | **`crypto` ごと無い**端末の検査 (この行はそこでしか通らない) |
 * | `s != null` → `s == null` | 本物の暗号で `null` を期待する検査 |
 * | `s != null && …` → `\|\|` | `subtle` が在って `digest` が無い端末の検査 |
 * | `typeof … === 'function'` → `!==` / `'function'` → `''` | 同上 |
 * | `if (hasSubtle())` → `true` / `false` | 上の 2 方向 (在る / 無い) |
 * | 文面の 3 つの文字列 → `''` / 連結の `+` → `-` | **全文一致**で持つ検査 |
 * | `missing !== null` → `===` | 暗号が無いときの `describeCryptoFailure` |
 * | `e instanceof Error ? …` → `true` / `false` | `Error` と**文字列**の 2 本 |
 * | `` `暗号処理に失敗しました: ${…}` `` → `''` | 同じ 2 本 (全文一致) |
 *
 * **文面は全文で持つ。** `toBe(webCryptoUnavailableReason())` のような自己参照で
 * 比べると、文字列を空にする変異体が**両側で同じだけ変わって**生き残る
 * (パス 168 で「不在を主張する検査には標本を添える」と書いたのと同じ家系 ——
 * 検査が自分の期待を本体から読むと、本体が壊れても鳴らない)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeCryptoFailure, webCryptoUnavailableReason } from '../webCrypto';

/** 断りの全文 (本体から読まず、ここに書き写して持つ)。 */
const REASON =
  'この端末のブラウザでは暗号処理 (WebCrypto) が使えないため、この操作はできません。'
  + '平文の http:// で開いている場合は、https:// か localhost、'
  + 'またはファイル (standalone.html) を直接開く形にすると使えるようになります。';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebCrypto の有無を見る (`webCrypto.ts` の契約 · パス 171)', () => {
  it('★ 標本: この harness には本物の WebCrypto が在り、使えるときは `null`', () => {
    expect(typeof crypto.subtle.digest, '本物の digest が無い (標本が空振り)').toBe('function');
    expect(webCryptoUnavailableReason()).toBeNull();
  });

  it('★ `crypto` ごと無い端末では、全文で断る', () => {
    vi.stubGlobal('crypto', undefined);
    expect(webCryptoUnavailableReason()).toBe(REASON);
  });

  it('★ `crypto.subtle` が無い端末 (平文 http://) でも、同じ全文で断る', () => {
    vi.stubGlobal('crypto', { getRandomValues: () => new Uint8Array(1) });
    expect(webCryptoUnavailableReason()).toBe(REASON);
  });

  it('★ `subtle` は在るが `digest` が無い実装 (古い WebView) を「在る」と言わない', () => {
    vi.stubGlobal('crypto', { getRandomValues: () => new Uint8Array(1), subtle: {} });
    expect(webCryptoUnavailableReason(), 'subtle の存在だけで「在る」と見ている').toBe(REASON);
  });

  it('★ 断りの全文には、打てる手が 3 つとも入っている', () => {
    vi.stubGlobal('crypto', undefined);
    const msg = webCryptoUnavailableReason() ?? '';
    for (const hint of ['WebCrypto', 'https://', 'localhost', 'standalone.html']) {
      expect(msg, `打てる手 ${hint} が無い`).toContain(hint);
    }
  });
});

describe('暗号の失敗を 1 文にする (`describeCryptoFailure` · パス 171)', () => {
  it('★ WebCrypto が無いときは、その説明を優先する (素の TypeError を見せない)', () => {
    vi.stubGlobal('crypto', undefined);
    const e = new TypeError("Cannot read properties of undefined (reading 'digest')");
    expect(describeCryptoFailure(e)).toBe(REASON);
  });

  it('★ 在るのに失敗したときは、元の文も残す (調べる手がかりを消さない)', () => {
    expect(describeCryptoFailure(new Error('boom'))).toBe('暗号処理に失敗しました: boom');
  });

  it('★ `Error` でない物を投げられても、そのまま文にする', () => {
    // `e.message` が無いので、`String(e)` 側を通らなければ `undefined` が出る。
    expect(describeCryptoFailure('ただの文字列')).toBe('暗号処理に失敗しました: ただの文字列');
  });
});
