/**
 * **保管層そのものの床 — 呼び出し側が関門を忘れても、制御文字は入らない。**
 *
 * パス 244 は資格情報の**入口** 2 本を `checkTokenInput` へ通した (設定画面の
 * スロット 9 枚とアシスタントの JSON 包み)。そのとき残件として記録した 2 本が
 * これである:
 *
 *   `main/secrets.ts` の `setOAuthTokens` → `setToken(id, JSON.stringify(tokens))`
 *   `SettingsPage.tsx` の Google トークン 4 本 → `getVault().setToken()`
 *
 * どちらも **IPC ハンドラ / 画面の関門を通らない**。`secrets.setToken` には
 * 検証が**1 つも無く** (長さも制御文字も見ない —— 規則はすべて `main.ts:326` の
 * ハンドラ側に在る)、`vault.setToken` は型・空・`MAX_TOKEN_CHARS` だけを見る。
 *
 * **中身は認可サーバが発行した値なので制御文字は入りにくい。だが
 * 「入りにくい」は関門ではない。** パス 244 の実測どおり、制御文字が
 * ヘッダに載ると `new Headers()` が値ごと文面に載せて投げ、その文面は
 * 画面へ出る。入口ごとに関門を足していく形は「n か所のうち n-1 か所を
 * 直した」を生むので、**保管層に床を置く**。
 *
 * ## 規則の綴りは 1 つ
 *
 * 制御文字の文字クラスは `shared/tokenInput.ts` の `hasControlChars` だけが
 * 持つ。`checkTokenInput` も床もそこを読む —— 同じ規則を 3 通りに綴ると
 * 必ず食い違う (パス 201 で消毒の綴りが 5 通りに割れていたのと同じ形)。
 *
 * ## 正直な限界
 *
 * **床は包みの中を見られない。** `JSON.stringify` は制御文字を 6 文字の
 * エスケープ列へ逃がすので、包んだ値はどちらの床も通る。包みの中は
 * **包む側の画面**で断るしかなく、そちらはパス 244 で直した
 * (`AssistantPage.saveAgentCreds`)。ここが覆うのは**生の文字列として
 * 保存される値**である。
 */
import { describe, expect, it } from 'vitest';
import { checkTokenInput, hasControlChars } from '../tokenInput';

const NUL = String.fromCharCode(0);
const LF = String.fromCharCode(10);
const VT = String.fromCharCode(11);
const DEL = String.fromCharCode(127);

describe('制御文字の規則 — 綴りは 1 つ', () => {
  it('★ `hasControlChars` は C0 と DEL を拾い、普通の鍵は拾わない', () => {
    for (const bad of [NUL, LF, VT, DEL, String.fromCharCode(31)]) {
      expect(hasControlChars(`abc${bad}def`), JSON.stringify(bad)).toBe(true);
    }
    for (const ok of ['sk-ant-api03-abc', `ghp_${'a'.repeat(36)}`, 'c'.repeat(64), 'a b', 'é']) {
      expect(hasControlChars(ok), ok.slice(0, 16)).toBe(false);
    }
  });

  it('★ `checkTokenInput` はその述語を使う (同じ入力で同じ答え)', () => {
    // 規則が 2 通りに割れていたら、どちらかの入力で答えが食い違う
    for (const v of [`a${NUL}b`, `a${VT}b`, `a${DEL}b`, 'plain-key-value']) {
      const refused = !checkTokenInput(`${'x'.repeat(20)}${v}`).ok;
      expect(refused, JSON.stringify(v)).toBe(hasControlChars(v));
    }
  });

  it('対照: 前後の空白だけなら断らない (trim が受け持つ)', () => {
    const res = checkTokenInput(`  ${'c'.repeat(40)}  `);
    expect(res.ok).toBe(true);
    expect(res.ok && res.value).toBe('c'.repeat(40));
  });

  it('限界: JSON で包むと制御文字は逃がされるので、床は中を見られない', () => {
    const inner = `sk-ant-${NUL}broken`;
    expect(hasControlChars(inner)).toBe(true);
    // 包んだ後は素通り —— だから包む側の画面で断る (パス 244)
    expect(hasControlChars(JSON.stringify({ anthropic: inner }))).toBe(false);
  });
});
