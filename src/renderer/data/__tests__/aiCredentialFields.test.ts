/**
 * **アプリが読む資格情報の欄は、画面から書けなければならない** (2026-09-24 · パス 450)。
 *
 * 母集団は `AI_CREDENTIAL_STRING_KEYS` —— `parseAiCredentials` が受理し
 * `configForProvider` が要求へ載せる欄そのもの。入力欄の表と**両方向**で
 * 突き合わせるので、12 個目の欄が足された日に「表に書け」と鳴り、
 * 逆に表に残った古い欄も鳴る。
 *
 * 直す前の実測 (出荷コードの走査・注記は落とす) は
 * `data/aiCredentialFields.ts` の docblock に在る —— 3 欄が書き手 0 件だった。
 */
import { describe, expect, it } from 'vitest';
import { stripNonCode } from '../../../shared/__tests__/stripNonCode';
import {
  AI_CREDENTIAL_STRING_KEYS,
  type AiCredentialStringKey,
} from '../../../shared/ai/credentials';
import { AI_PROVIDERS } from '../../../shared/ai/providers';
import {
  AI_CREDENTIAL_FIELDS,
  emptyAiCredentialForm,
} from '../aiCredentialFields';


describe('資格情報の欄 —— 読める欄は書ける (両方向)', () => {
  it('★ アプリが読む欄はすべて入力欄を持つ', () => {
    const inForm = new Set(AI_CREDENTIAL_FIELDS.map((f) => f.key));
    const missing = AI_CREDENTIAL_STRING_KEYS.filter((k) => !inForm.has(k));
    expect(missing, '読むのに画面から書けない欄がある').toEqual([]);
  });

  it('★ 入力欄はすべてアプリが読む欄 (古い欄が残っていない)', () => {
    const read = new Set<string>(AI_CREDENTIAL_STRING_KEYS);
    const extra = AI_CREDENTIAL_FIELDS.map((f) => f.key).filter((k) => !read.has(k));
    expect(extra, '誰も読まない欄を画面が集めている').toEqual([]);
  });

  it('★ 走査が実物に当たっている (床) / 重複が無い', () => {
    // 床: 母集団が空になったら上の 2 件は自明に通る。
    expect(AI_CREDENTIAL_STRING_KEYS.length).toBeGreaterThanOrEqual(11);
    const keys = AI_CREDENTIAL_FIELDS.map((f) => f.key);
    expect(new Set(keys).size, '同じ欄が 2 行ある').toBe(keys.length);
  });

  it('★ パス 450 で書けるようになった 3 欄を名指しで留める', () => {
    // 回帰の錠。表から落ちた瞬間に、上の両方向より先にここが名前を出す。
    const keys = new Set(AI_CREDENTIAL_FIELDS.map((f) => f.key));
    for (const k of ['anthropicModel', 'openaiModel', 'geminiModel'] as AiCredentialStringKey[]) {
      expect(keys.has(k), `${k} の入力欄が無い`).toBe(true);
    }
  });

  it('★ 空のフォームは欄の一覧から導く', () => {
    const empty = emptyAiCredentialForm();
    expect(Object.keys(empty).sort()).toEqual(
      ['default', ...AI_CREDENTIAL_STRING_KEYS].sort(),
    );
    expect(Object.values(empty).every((v) => v === '')).toBe(true);
  });
});

describe('既定モデルの綴りを写さない', () => {
  const derived = [
    ['anthropicModel', 'anthropic'],
    ['openaiModel', 'openai'],
    ['geminiModel', 'gemini'],
    ['ollamaModel', 'ollama'],
  ] as const;

  it.each(derived)('★ %s の placeholder は spec の既定モデルそのもの', (key, provider) => {
    const field = AI_CREDENTIAL_FIELDS.find((f) => f.key === key);
    expect(field, `${key} が表に無い`).toBeDefined();
    expect(field!.placeholder).toBe(AI_PROVIDERS[provider].defaultModel);
  });

  /*
   * **綴りの走査は書けない (測った)。** `stripNonCode` は**文字列の中身を落とす**
   * のが仕事なので、`placeholder: 'claude-…'` の形は針に 1 文字も映らない ——
   * 「直書きされていない」を走査で主張すると**どの入力でも通る空の検査**になる
   * (最初にそう書き、下の標本の `it` がその場で捕まえた)。
   *
   * 綴りの漂流を止めているのは**上の等値そのもの**である: placeholder を写した
   * 人が居ても、既定を変えた日にこの比較が落ちる。下の `it` はその等値が
   * 効いていること (= 古い綴りなら落ちること) を標本で示す。
   */
  it('★ 等値が効いている —— 古い綴りを置けば落ちる', () => {
    const stale = 'stale-model-id';
    expect(stale).not.toBe(AI_PROVIDERS.anthropic.defaultModel);
    // 上の it.each と同じ比較。写した placeholder はこの形で必ず鳴る。
    expect(() => expect(stale).toBe(AI_PROVIDERS.anthropic.defaultModel)).toThrow();
  });

  it('★ 針の限界を標本で留める (文字列の中身は走査に映らない)', () => {
    const sample = `placeholder: '${AI_PROVIDERS.anthropic.defaultModel}',`;
    expect(sample.includes(AI_PROVIDERS.anthropic.defaultModel)).toBe(true);
    // 落とすのが仕事 —— だから上の走査は書かない。
    expect(stripNonCode(sample).includes(AI_PROVIDERS.anthropic.defaultModel)).toBe(false);
    // 注記の中の言及も落ちる (法則 mention-vs-declaration)。
    expect(stripNonCode(`/* ${AI_PROVIDERS.anthropic.defaultModel} */`).trim()).toBe('');
  });

  it('★ 互換 API だけは導けない —— その理由が今も真', () => {
    // 既定が空なので placeholder を導けず、例を書いている。
    expect(AI_PROVIDERS.compat.defaultModel).toBe('');
    const field = AI_CREDENTIAL_FIELDS.find((f) => f.key === 'compatModel');
    expect(field!.placeholder).not.toBe('');
  });
});

describe('伏せる欄と見せる欄', () => {
  it('★ モデル名は伏せない (秘密ではないし、打った字が見えないと直せない)', () => {
    const shown = AI_CREDENTIAL_FIELDS.filter((f) => f.key.endsWith('Model'));
    expect(shown.length).toBeGreaterThanOrEqual(5);
    expect(shown.filter((f) => f.secret).map((f) => f.key)).toEqual([]);
  });

  it('★ 鍵は伏せる', () => {
    const secrets = ['anthropic', 'openai', 'gemini', 'compatKey'];
    for (const k of secrets) {
      expect(AI_CREDENTIAL_FIELDS.find((f) => f.key === k)!.secret, k).toBe(true);
    }
  });

  it('★ どの欄もラベルと読み上げ名を持つ', () => {
    for (const f of AI_CREDENTIAL_FIELDS) {
      expect(f.label.trim().length, f.key).toBeGreaterThan(0);
      expect(f.aria.trim().length, f.key).toBeGreaterThan(0);
      expect(f.placeholder.trim().length, f.key).toBeGreaterThan(0);
    }
  });
});
