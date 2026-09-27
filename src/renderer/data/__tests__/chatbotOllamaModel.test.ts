/**
 * AI コンシェルジュの自由質問が、どのモデルへ行き、断られたら何と言うか
 * (2026-09-24 · パス 449)。
 *
 * **背骨は「アプリ自身の 2 つの導入手順」** —— `npm run ollama:setup` は
 * `DEFAULT_SETUP_MODEL` (`llama3.2:1b`) を入れ、画面と CLI は
 * `ollama pull llama3.2` を勧める (そちらは `llama3.2:latest` になる)。
 * 直す前の直書き `'llama3.2'` は**後者にしか当たらない**。どちらの手順を
 * 踏んだ利用者でも通ることを、`DEFAULT_SETUP_MODEL` から導いて留める
 * (名前を写すと、既定を変えた日にこの検査だけが古びる)。
 */
import { describe, expect, it } from 'vitest';
import {
  CHATBOT_MODEL_KEY,
  CHATBOT_OLLAMA_ESCAPE,
  chatbotOllamaModel,
  ollamaRefusalNote,
} from '../chatbotOllama';
import { DEFAULT_SETUP_MODEL, isSafeModelName } from '../../../shared/ollama';
import { MAX_LOCAL_MODEL_ERROR_CHARS } from '../../../shared/redact';

/** `ollama pull llama3.2` が入れる実体 (タグは `:latest` になる)。 */
const PULLED = `${DEFAULT_SETUP_MODEL.split(':')[0]}:latest`;

describe('chatbotOllamaModel — 行き先は導入済みの一覧から決める', () => {
  it('★ アプリ自身の 2 つの導入手順が、どちらも導入済みのモデルへ当たる', () => {
    // npm run ollama:setup
    expect(chatbotOllamaModel(null, [DEFAULT_SETUP_MODEL])).toBe(DEFAULT_SETUP_MODEL);
    // ollama pull llama3.2 (実体は :latest)
    expect(chatbotOllamaModel(null, [PULLED])).toBe(PULLED);
  });

  it('★ 直す前の直書きは、setup で入れた側に当たらなかった (対照)', () => {
    // 直す前の式そのもの: `localStorage.getItem(...) ?? 'llama3.2'`。
    // 製品は直したので再現できないため、当時の値を算術で置く。
    const before = 'llama3.2';
    expect([DEFAULT_SETUP_MODEL].includes(before)).toBe(false);
    // 直した後はその一覧に当たる。
    expect([DEFAULT_SETUP_MODEL].includes(chatbotOllamaModel(null, [DEFAULT_SETUP_MODEL]))).toBe(true);
  });

  it('手で置いた上書きが導入済みに在るなら、それを使う (利用者の意思が最優先)', () => {
    expect(chatbotOllamaModel('qwen2.5:0.5b', ['qwen2.5:0.5b', DEFAULT_SETUP_MODEL]))
      .toBe('qwen2.5:0.5b');
  });

  it('一覧が読めなければ、上書き or アプリの既定 (推測する材料が無い)', () => {
    expect(chatbotOllamaModel(null, [])).toBe(DEFAULT_SETUP_MODEL);
    expect(chatbotOllamaModel('qwen2.5:0.5b', [])).toBe('qwen2.5:0.5b');
  });

  it('導入済みが 1 つだけなら、種が当たらなくてもそれを使う', () => {
    expect(chatbotOllamaModel(null, ['qwen2.5:0.5b'])).toBe('qwen2.5:0.5b');
  });

  it('当てられず候補が複数なら種のまま返す (断りが一覧を並べる)', () => {
    const got = chatbotOllamaModel(null, ['qwen2.5:0.5b', 'mistral:7b']);
    expect(got).toBe(DEFAULT_SETUP_MODEL);
  });

  it('安全でない上書き・一覧の項目は最初から候補にしない', () => {
    expect(chatbotOllamaModel({ a: 1 }, [])).toBe(DEFAULT_SETUP_MODEL);
    expect(chatbotOllamaModel('../../etc/passwd', [])).toBe(DEFAULT_SETUP_MODEL);
    // 非文字列・危ない名前が混ざった一覧でも、返すのは安全な名前だけ
    expect(isSafeModelName(chatbotOllamaModel(null, [42, null, '../x', 'qwen2.5:0.5b']))).toBe(true);
    expect(chatbotOllamaModel(null, [42, null, '../x', 'qwen2.5:0.5b'])).toBe('qwen2.5:0.5b');
  });

  it('返す物は必ず安全なモデル名 (送り先に素の保存値を載せない)', () => {
    for (const ov of [null, 'llama3.2', { z: 1 }, '', 'a'.repeat(500)]) {
      for (const inst of [[], [DEFAULT_SETUP_MODEL], [PULLED, 'mistral:7b']]) {
        expect(isSafeModelName(chatbotOllamaModel(ov, inst))).toBe(true);
      }
    }
  });

  it('上書きの鍵は、消す側 (eraseAll) が挙げている綴りと同じ', () => {
    expect(CHATBOT_MODEL_KEY).toBe('chatbot-ollama-model');
  });
});

describe('ollamaRefusalNote — 断りは原因を運び、逃げ口を名指しする', () => {
  it('★ アプリが組んだ原因をそのまま運ぶ (作り直さない)', () => {
    const advice = 'モデル「llama3.2」がまだ取得されていません。 (インストール済みの「llama3.2:1b」を指定すると動きます。)';
    const note = ollamaRefusalNote(advice);
    expect(note).toContain(advice);
    expect(note).toContain(CHATBOT_OLLAMA_ESCAPE);
  });

  it('原因が無いときも、断ったことと逃げ口は言う', () => {
    const note = ollamaRefusalNote('');
    expect(note).toContain('答えませんでした');
    expect(note).toContain(CHATBOT_OLLAMA_ESCAPE);
    // 空の詳細で「: 」だけが残らない
    expect(note).not.toContain('でした: ');
    // 針が的に当たることを、当たる標本で示す
    expect(ollamaRefusalNote('X')).toContain('でした: ');
  });

  it('文字列でない message も、非文字列のまま画面へ出さない', () => {
    for (const bad of [null, undefined, 42, { a: 1 }, ['x']]) {
      expect(ollamaRefusalNote(bad)).toBe(ollamaRefusalNote(''));
    }
  });

  it('★ 第三者の文は伏字と天井を通る (利用者が設定したホストの文が混ざる)', () => {
    const long = ollamaRefusalNote('あ'.repeat(MAX_LOCAL_MODEL_ERROR_CHARS + 500));
    expect(long.length).toBeLessThan(MAX_LOCAL_MODEL_ERROR_CHARS + 200);
    expect(ollamaRefusalNote('key=sk-ant-abcdefghijklmnop')).not.toContain('sk-ant-abcdefghijklmnop');
  });

  it('逃げ口は「Ollama」の画面を名指しする (この widget に選ぶ口は無い)', () => {
    expect(CHATBOT_OLLAMA_ESCAPE).toContain('Ollama');
  });
});
