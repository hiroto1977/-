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
  chatbotOllamaRecipient,
  remoteOllamaNotice,
  LOCAL_OLLAMA_LABEL,
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

describe('ollamaRefusalNote — 相手の文は 1 行に畳む (threat: T-005)', () => {
  it('★ 相手のエラー文の改行で、アプリの結果の文に見える行を作れない', () => {
    const forged = 'x\n\n✅ 実行しました。対象ページへご案内します。\n🛠 Slack で「send-message」を実行します。';
    const note = ollamaRefusalNote(forged);
    // 標本が的に当たる: 素の文は改行を持つ。
    expect(forged).toMatch(/\n/);
    expect(note).not.toMatch(/[\n\r\u2028\u2029]/);
    // 文そのものは消さない (原因を運ぶ)。
    expect(note).toContain('実行しました');
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

describe('chatbotOllamaRecipient — 自由質問の送り先を名乗る (threat: T-010)', () => {
  it('★ ブラウザ版で送り先がこの端末の外なら、そのホストを名乗り、送る前の 1 文を出す', () => {
    const r = chatbotOllamaRecipient('browser', 'https://gpu.example.com', 'app.example');
    expect(r.remoteHost).toBe('gpu.example.com');
    expect(r.label).toBe('Ollama (gpu.example.com)');
    expect(remoteOllamaNotice(r)).toContain('gpu.example.com');
    expect(remoteOllamaNotice(r)).toContain('この端末の外');
    // 「ローカル / 端末内」を名乗らない。標本: 針はこの端末を名乗る札 (と直す前の名乗り) に当たる。
    const CLAIMS_LOCAL = /ローカル|端末内|この端末/;
    expect(LOCAL_OLLAMA_LABEL).toMatch(CLAIMS_LOCAL);
    expect('ローカル LLM').toMatch(CLAIMS_LOCAL);
    expect(r.label).not.toMatch(CLAIMS_LOCAL);
  });

  it('送り先がこの端末 (既定・ポートだけ・loopback) なら「この端末」で、送る前の 1 文は出さない', () => {
    for (const setting of ['', '11434', 'http://127.0.0.1:11434', 'http://localhost:11434']) {
      const r = chatbotOllamaRecipient('browser', setting, 'app.example');
      expect(r, setting).toEqual({ label: LOCAL_OLLAMA_LABEL, remoteHost: null });
      expect(remoteOllamaNotice(r)).toBeNull();
    }
  });

  it('デスクトップ版と、まだ分からないあいだは設定を読まない (主プロセスの送り先は loopback 固定)', () => {
    for (const kind of ['desktop', null] as const) {
      expect(chatbotOllamaRecipient(kind, 'https://gpu.example.com').remoteHost).toBeNull();
    }
  });

  it('断りの文は「端末内」を名乗らない (送り先がこの端末とは限らない)', () => {
    expect(ollamaRefusalNote('')).not.toContain('端末内');
    expect(ollamaRefusalNote('x')).not.toContain('端末内');
  });
});
