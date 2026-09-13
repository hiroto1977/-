import { describe, expect, it } from 'vitest';
import { safeErrorMessage, ERROR_MESSAGE_MAX_CHARS, REDACT_SCAN_LIMIT, redactForMessage, redactSecrets } from '../redact';

/*
 * `safeErrorMessage` — 例外を「利用者へ見せてよい 1 行」にする規則。
 *
 * 2026-08-22 まで main.ts の中にだけ private に置いてあり、ブラウザ版の
 * `web-shim.ts` は main の役目をそのまま引き受けているのに同じ関門が
 * ありませんでした。片側にしか無い関門は、新しい経路が足されたときに効きます。
 */

describe('safeErrorMessage', () => {
  it('Error のメッセージを取り出す', () => {
    expect(safeErrorMessage(new Error('普通の失敗'))).toBe('普通の失敗');
  });

  it('Error でないものは文字列にする', () => {
    expect(safeErrorMessage('文字列で投げられた')).toBe('文字列で投げられた');
    expect(safeErrorMessage(42)).toBe('42');
    expect(safeErrorMessage(null)).toBe('null');
    expect(safeErrorMessage(undefined)).toBe('undefined');
    expect(safeErrorMessage({ a: 1 })).toBe('[object Object]');
  });

  it('資格情報を伏せる — 線上の形も JSON の形も', () => {
    const wire = safeErrorMessage(
      new Error('upstream 401: Authorization: Bearer ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    );
    expect(wire).not.toContain('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(wire).toContain('[REDACTED]');

    // プロキシがヘッダを JSON にして返す形。コロン直結ではないので、
    // 昔の規則ではここが素通りしていた。
    const json = safeErrorMessage(
      new Error('proxy 500: {"headers":{"authorization":"Bearer sk-ant-abcdefghijklmnopqrstuvwxyz01"}}'),
    );
    expect(json).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz01');
  });

  it('Error でない値に混ざった資格情報も伏せる', () => {
    // `String(x)` を先に通すので、投げられたのが Error でなくても素通りしない。
    const out = safeErrorMessage({
      toString: () => 'ya29.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(out).not.toContain('ya29.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('長すぎるメッセージは上限で切る', () => {
    const out = safeErrorMessage(new Error('あ'.repeat(ERROR_MESSAGE_MAX_CHARS + 500)));
    expect(out).toHaveLength(ERROR_MESSAGE_MAX_CHARS);
  });

  it('上限ちょうどは切らない', () => {
    const out = safeErrorMessage(new Error('あ'.repeat(ERROR_MESSAGE_MAX_CHARS)));
    expect(out).toHaveLength(ERROR_MESSAGE_MAX_CHARS);
  });

  /*
   * **切る所は文字の境界** (2026-09-13 · パス 196)。
   * 上の 2 本は 'あ' (BMP・1 コード単位) なので、コード単位で切っても文字で
   * 切っても同じ結果になる —— **単位の違いが出ない標本**である。
   * この関数は両ビルドのすべてのエラー 1 行が通る漏斗なので、境界が
   * サロゲート対の真ん中に落ちると孤立サロゲートが画面と IPC へ出る。
   */
  function hasLoneSurrogate(str: string): boolean {
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = i + 1 < str.length ? str.charCodeAt(i + 1) : -1;
        if (next < 0xdc00 || next > 0xdfff) return true;
        i++;
      } else if (c >= 0xdc00 && c <= 0xdfff) return true;
    }
    return false;
  }

  it('★ 絵文字が境界に来ても文字を割らない (孤立サロゲートを残さない)', () => {
    // 'a' を 1999 個 + 絵文字 → コード単位で切ると 2000 番目で対が割れる。
    const msg = 'a'.repeat(ERROR_MESSAGE_MAX_CHARS - 1) + '\u{1F600}' + 'b'.repeat(50);
    const out = safeErrorMessage(new Error(msg));
    expect(hasLoneSurrogate(out)).toBe(false);
    // 天井は「字」なので、絵文字 1 つを含めて 2000 字ちょうど。
    expect([...out]).toHaveLength(ERROR_MESSAGE_MAX_CHARS);
    expect(out.endsWith('\u{1F600}')).toBe(true);
    // 対照の対照 —— 壊れた文字列は UTF-8 を往復すると `\uFFFD` に化ける。
    expect(Buffer.from(out, 'utf8').toString('utf8')).toBe(out);
  });

  it('★ 走査の上限 (REDACT_SCAN_LIMIT) の側でも文字を割らない', () => {
    /*
     * 8192 番目の境界。**`safeErrorMessage` 経由では測れない** ——
     * 外側の 2000 字で切るので、8192 で割れた対はそこまで残らない。
     * 最初はそう書いて**対照が鳴らなかった** (鳴らない対照は「合格」ではない)。
     * 天井を走査上限より広く渡して、内側の切り口を束縛する側にする。
     */
    const msg = 'a'.repeat(REDACT_SCAN_LIMIT - 1) + '\u{1F600}' + 'b'.repeat(10);
    const out = redactForMessage(msg, 100_000);
    expect(hasLoneSurrogate(out)).toBe(false);
    // 走査上限で切れているので、絵文字までの 8192 字。
    expect([...out]).toHaveLength(REDACT_SCAN_LIMIT);
    expect(out.endsWith('\u{1F600}')).toBe(true);
  });

  it('伏字は冪等 — 既に伏せてある文字列を通しても形が変わらない', () => {
    // これが成り立つので、経路の途中で伏せてある文字列を、出口でもう一度
    // 通してよい (関門を二重に置ける)。
    for (const s of [
      'proxy 401: {"headers":{"authorization":"Bearer ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}',
      'GitHub 403: sk-ant-abcdefghijklmnopqrstuvwxyz012345',
      'Authorization: Basic dXNlcjpwYXNzd29yZGxvbmc=',
      '{"access_token":"ya29.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
      'ふつうの失敗',
    ]) {
      const once = redactSecrets(s);
      expect(redactSecrets(once), s).toBe(once);
      expect(safeErrorMessage(new Error(once)), s).toBe(once);
    }
  });

  it('秘密が無ければそのまま通す (読みにくくしない)', () => {
    const msg = 'ネットワークに接続できません (ECONNREFUSED 127.0.0.1:11434)';
    expect(safeErrorMessage(new Error(msg))).toBe(msg);
  });
});
