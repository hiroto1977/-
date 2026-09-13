/**
 * **最新の発話は切らずに断る —— 両ビルドと skills が同じ 1 つの判断を読む。** (2026-09-09 · パス 112)
 *
 * 実測 (直す前): AI への入力の天井は 4 通りに割れていた。
 *
 * | 入口 | main | ブラウザ版 | 画面 |
 * | --- | --- | --- | --- |
 * | `assistant/chat` · `chatAll` | `slice(0, 8000)` **黙って切る** (最新の発話も) | 同じ | `maxLength` 無し |
 * | `skills/run-skill` | **天井なし** | (双子なし) | 無し |
 * | `business/advise` · `stocks/advise` | 1000 で断る | 同じ | `maxLength={1000}` **数を写す** |
 * | `emotions/analyze-text` | 5000 で断る | 同じ | 無し |
 *
 * そして応答側の規則は同じファイル (`assistantLimits.ts`) に在った ——
 * 「切り詰めたことを黙らせない」(`ASSISTANT_REPLY_TRUNCATED_NOTICE`)。**送る側だけが黙っていた。**
 */
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import path from 'node:path';
import {
  ASSISTANT_REPLY_TRUNCATED_NOTICE,
  MAX_ASSISTANT_CONTENT_CHARS,
  inputTooLongMessage,
  latestTurnTooLong,
} from '../assistantLimits';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string): string => readOriginalSource(path.join(SRC, rel));
const code = (rel: string): string =>
  read(rel)
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n');

describe('latestTurnTooLong — 最新の発話だけを見る', () => {
  const turn = (content: unknown, role = 'user'): unknown => ({ role, content });

  it('★ 天井ちょうどは通し、1 文字超で断る (境目の両側)', () => {
    expect(latestTurnTooLong([turn('a'.repeat(MAX_ASSISTANT_CONTENT_CHARS))])).toBe(false);
    expect(latestTurnTooLong([turn('a'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 1))])).toBe(true);
  });

  it('★ 前後の空白は数えない (sanitize と同じ発話を同じに扱う)', () => {
    expect(latestTurnTooLong([turn('a'.repeat(MAX_ASSISTANT_CONTENT_CHARS) + '   ')])).toBe(false);
    expect(latestTurnTooLong([turn('  ' + 'a'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 1))])).toBe(true);
  });

  it('★ 履歴の長い発話は見ない (窓に収めるのは sanitize の仕事)', () => {
    expect(latestTurnTooLong([turn('x'.repeat(MAX_ASSISTANT_CONTENT_CHARS * 3)), turn('ok')])).toBe(false);
  });

  it('★ 配列でない・空・末尾が発話でない・content が文字列でない物は「長すぎ」とは言わない (別の関門が断る)', () => {
    for (const raw of [undefined, null, 'x', {}, [], [null], ['x'], [turn(123)], [turn(undefined)]]) {
      expect(latestTurnTooLong(raw), JSON.stringify(raw)).toBe(false);
    }
  });
});

describe('断りの文面', () => {
  it('★ 天井の数を定数から刷る (写さない) と、何が長すぎたかを言う', () => {
    expect(inputTooLongMessage('入力')).toBe(`入力が長すぎます (${MAX_ASSISTANT_CONTENT_CHARS} 字以内)`);
    expect(inputTooLongMessage('プロンプト')).toContain('プロンプトが長すぎます');
    // 天井は渡せる (端末内の Ollama は別の天井 —— パス 114)。省略は既定の天井と同じ文。
    expect(inputTooLongMessage('プロンプト', 32_768)).toBe('プロンプトが長すぎます (32768 字以内)');
    expect(inputTooLongMessage('入力', MAX_ASSISTANT_CONTENT_CHARS)).toBe(inputTooLongMessage('入力'));
    // 応答側の規則 (同じファイル) と同じ方針 —— 黙らない。
    expect(ASSISTANT_REPLY_TRUNCATED_NOTICE).toContain('打ち切りました');
  });
});

describe('両ビルドと skills が同じ判断を読む (写していない)', () => {
  it('★ main の chat / chatAll と ブラウザ版の双子が、sanitize の前に最新の発話を断る', () => {
    const main = code('main/clients/assistant.ts');
    const web = code('renderer/web-shim.ts');
    // 出現回数で「両方の handler」を留める (chat と chatAll)。
    expect(main.split('latestTurnTooLong(messages)').length - 1).toBe(2);
    expect(web.split("latestTurnTooLong(payload['messages'])").length - 1).toBe(2);
    // 断りが sanitize より先に在る (切ってから測ると必ず通る)。
    for (const [src, guard, sanitize] of [
      [main, 'latestTurnTooLong(messages)', 'sanitizeMessages(messages)'],
      [web, "latestTurnTooLong(payload['messages'])", "sanitizeAssistantTurns(payload['messages'])"],
    ] as const) {
      let from = 0;
      for (let i = 0; i < 2; i += 1) {
        const g = src.indexOf(guard, from);
        const s = src.indexOf(sanitize, from);
        expect(g, `${i + 1} つ目: 断りが無い`).toBeGreaterThan(-1);
        expect(g, `${i + 1} つ目: 切ってから測っている`).toBeLessThan(s);
        from = s + sanitize.length;
      }
    }
    // 文面は共有の 1 つ (字面で持たない)。advisor / emotions の断りは別の家系なので
    // ここでは「入力が長すぎます」だけを見る。
    expect(main).not.toContain('入力が長すぎます');
    expect(web).not.toContain('入力が長すぎます');
  });

  it('★ skills の prompt はアシスタントと同じ天井を読む (自前の数を持たない)', () => {
    const skills = code('main/clients/skills.ts');
    // パス 195: 単位を「字」に揃えたので `countChars(prompt)` を通る。
    expect(skills).toContain('countChars(prompt) > MAX_ASSISTANT_CONTENT_CHARS');
    expect(skills).toContain("inputTooLongMessage('プロンプト')");
    // 字面の数に戻っていないこと (対照つき)。
    expect(skills).not.toMatch(/countChars\(prompt\) > \d/);
    expect('countChars(prompt) > 8192').toMatch(/countChars\(prompt\) > \d/);
  });
});
