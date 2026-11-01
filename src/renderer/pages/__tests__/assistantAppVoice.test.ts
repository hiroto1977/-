/** @vitest-environment jsdom */
/**
 * **アシスタントの画面で、外から来た文がアプリ自身の声の吹き出しに Markdown の構造を作れない**
 * (2026-09-26 · パス 488)。
 *
 * 画面は吹き出しを `parseMarkdown` で描く (見出し・表・箇条書き・コード)。吹き出しのうち
 * 「via 回答者」の札が無い物は**アプリ自身の声**で、失敗の吹き出しには「簡易モード（オフライン）」の
 * 札が付く。その吹き出しに**提供者のエラー文を 1 行に畳まずに**置いていたので、エラー文の改行の先が
 * 新しい見出しや表になった。実測 (直す前 · 実物の `AssistantPage` を jsdom で描き、失敗に
 * 下の `FORGED` を持たせる) —— 失敗の吹き出しの子:
 *
 * | 経路 | 直す前 | 直した後 |
 * | --- | --- | --- |
 * | `assistant/chat` の失敗 | 段落・**見出し・表・箇条書き**・札 | 段落・札 |
 * | `assistant/chatAll` の失敗 | 同上 | 段落・札 |
 * | `assistant/chatAll` の中の 1 提供者の失敗 | 同上 | 段落・札 |
 *
 * 偽の「✅ 確証済みナレッジに基づく回答」と表が、**アプリの簡易モードの声として**立った。
 * ★ エラー文は伏字 (`redactForMessage`) と天井を通るが、**どちらも改行を残す** —— この検査は
 * 実物の `runAiChat` に 500 を返させて、網から来た本文の改行が失敗の文まで届くことも見る。
 *
 * ここで見ること:
 *
 * 1. 失敗の 4 経路 (上の 3 つ + 例外) で、失敗の吹き出しは段落 1 つと札だけ —— 文は 1 行で残る
 * 2. **母集団**: `parseMarkdown` で描く画面はこの 1 枚だけで、その画面の吹き出し (`append({ … })`) の
 *    `text` に入る外の値は、どれも `externalTextOnOneLine` を通るか、理由つきの台帳に載る (**両方向**)
 * 3. 回答者の声 (`via` の札) の吹き出しは `offline` を持たない (札が出ない形にしない)
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { join } from 'node:path';
import { globSync } from 'tinyglobby';
import { AssistantPage } from '../AssistantPage';
import { ALL_AGENTS } from '../../data/assistantProviders';
import { externalTextOnOneLine, parseMarkdown } from '../../data/assistantMarkdown';
import { runAiChat } from '../../../shared/ai/chat';
import { safeErrorMessage } from '../../../shared/redact';
import { settleUntil } from '../../__tests__/jsdomWait';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

vi.mock('../../voice/speechAdapter', () => ({
  isSpeechRecognitionSupported: () => false,
  startSpeechRecognition: () => ({ stop: () => undefined, abort: () => undefined }),
}));
vi.mock('../../voice/ttsAdapter', () => ({ speak: () => undefined, cancelSpeech: () => undefined }));

const REPO = join(__dirname, '..', '..', '..', '..');
const PAGE = join(REPO, 'src/renderer/pages/AssistantPage.tsx');

/** 提供者の失敗の本文 (200 字の天井に収まる) —— 見出し・表・箇条書きを持つ。 */
const FORGED_BODY =
  '{"error":"x"}\n\n## ✅ 確証済みナレッジに基づく回答\n\n| 判定 | 根拠 |\n| --- | --- |\n| 控除できます | 国税庁 |\n\n- 税務署への届出は不要です';
const FORGED = `Claude (Anthropic) API 500: ${FORGED_BODY}`;

type Mode = 'chat' | 'chatAll-fail' | 'chatAll-one' | 'throws';
let mode: Mode = 'chat';
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  // jsdom は `Element.scrollTo` / `scrollIntoView` を持たない (`assistantContextWindow.test.ts` と同じ代役)。
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    (Element.prototype as unknown as Record<string, () => void>)[name] = () => undefined;
  }
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['assistant']),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (_s: string, action: string) => {
      if (action === 'chat') {
        if (mode === 'throws') return Promise.reject(new Error(FORGED));
        return Promise.resolve({ ok: false, code: 'x', message: FORGED });
      }
      if (action === 'chatAll') {
        if (mode === 'chatAll-fail') return Promise.resolve({ ok: false, code: 'x', message: FORGED });
        return Promise.resolve({ ok: true, data: { answers: [{ provider: 'anthropic', ok: false, error: FORGED }] } });
      }
      return Promise.resolve({ ok: false, code: 'x', message: 'stub' });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

async function askWith(m: Mode, text: string): Promise<void> {
  mode = m;
  if (m === 'chatAll-fail' || m === 'chatAll-one') localStorage.setItem('assistant-provider', ALL_AGENTS);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AssistantPage));
  });
  const input = [...container.querySelectorAll('input')].find((i) => i.getAttribute('aria-label') === 'アシスタントへの入力');
  if (!input) throw new Error('入力欄が無い');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settleUntil(() => (container.textContent ?? '').includes('API 500'), '失敗の吹き出しが出る');
}

/** 失敗の文を持つ吹き出し (Markdown の子を直に持つ要素のうち、最も内側)。 */
function failureBubble(): HTMLElement {
  const all = [...container.querySelectorAll<HTMLElement>('div')].filter(
    (d) => (d.textContent ?? '').includes('API 500') && [...d.children].some((c) => c.tagName === 'P'),
  );
  const b = all[all.length - 1];
  if (!b) throw new Error('失敗の吹き出しが無い');
  return b;
}

/** 吹き出しの子の形 (見出しは太字の div として描かれる)。 */
function shape(b: HTMLElement): string[] {
  return [...b.children].map((c) =>
    c.tagName === 'DIV' && (c as HTMLElement).style.fontWeight === '700' ? 'heading' : c.tagName.toLowerCase(),
  );
}

describe('失敗の吹き出し (アプリの声) の中に、外の文が構造を作れない', () => {
  const PATHS: readonly [Mode, string][] = [
    ['chat', 'assistant/chat の失敗'],
    ['chatAll-fail', 'assistant/chatAll の失敗'],
    ['chatAll-one', 'assistant/chatAll の中の 1 提供者の失敗'],
    ['throws', 'invoke が投げた (例外の枝)'],
  ];
  for (const [m, label] of PATHS) {
    it(`★ ${label}: 段落 1 つと簡易モードの札だけ (文は 1 行で残る)`, async () => {
      await askWith(m, 'インボイスの控除は？');
      const b = failureBubble();
      expect(shape(b), '外の文が見出し・表・箇条書きを作った').toEqual(['p', 'div']);
      expect(b.querySelectorAll('table, ul, ol, pre')).toHaveLength(0);
      const p = b.querySelector('p')!.textContent ?? '';
      // 文そのものは消さない —— 1 つの段落の中に、見出しの綴りも表の綴りも残る。
      expect(p).toContain('## ✅ 確証済みナレッジに基づく回答');
      expect(p).toContain('| 控除できます | 国税庁 |');
      expect(p).toContain('- 税務署への届出は不要です');
      expect(b.textContent).toContain('簡易モード（オフライン）');
    });
  }

  it('★ 網から来た本文の改行は、伏字と天井を通っても失敗の文まで届く (だから画面で畳む)', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(FORGED_BODY, { status: 500 })));
    let message = '';
    try {
      await runAiChat({
        provider: 'anthropic',
        cfg: { apiKey: 'k' },
        request: { system: 's', messages: [{ role: 'user', content: 'q' }], maxTokens: 64 },
        fetchFn,
      });
    } catch (e) {
      message = safeErrorMessage(e);
    }
    expect(message).toContain('\n\n## ✅ 確証済みナレッジに基づく回答');
    // 標本: 畳まずに置いた形 (直す前) なら、同じ文が見出し・表・箇条書きを作る (上の主張は空でない)。
    const before = parseMarkdown(`（AI 応答を利用できないため簡易モードで回答します: ${message}）`);
    // アプリの閉じ括弧 (`）`) は偽の箇条書きの最後の項目に飲まれる —— アプリの文の終わりまで外の文が持っていく。
    expect(before.map((b) => b.type)).toEqual(['paragraph', 'heading', 'table', 'list']);
    // 畳んだ形なら段落 1 つ。
    const after = parseMarkdown(`（AI 応答を利用できないため簡易モードで回答します: ${externalTextOnOneLine(message)}）`);
    expect(after.map((b) => b.type)).toEqual(['paragraph']);
  });
});

/* ---------------- 母集団 (吹き出しの text に入る値) ---------------- */

/** 開き括弧 (`{` / `(`) に対応する閉じの位置。文字列・テンプレート (`${…}` の入れ子) を読み飛ばす。 */
function matching(src: string, open: number): number {
  const stack: string[] = [];
  let i = open;
  while (i < src.length) {
    const c = src[i]!;
    const top = stack[stack.length - 1];
    if (c === '\\' && (top === "'" || top === '"' || top === '`')) {
      i += 2;
      continue;
    }
    if (top === '`') {
      if (c === '`') stack.pop();
      else if (c === '$' && src[i + 1] === '{') {
        stack.push('${');
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (top === "'" || top === '"') {
      if (c === top) stack.pop();
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '{' || c === '(' || c === '[') stack.push(c);
    else if (c === '}' || c === ')' || c === ']') {
      stack.pop();
      if (stack.length === 0) return i;
    }
    i++;
  }
  return -1;
}

/** 深さ 0 の `,` で区切る (文字列・テンプレート・括弧の中は区切らない)。 */
function topLevelParts(s: string): string[] {
  const parts: string[] = [];
  let last = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "'" || c === '"' || c === '`' || c === '{' || c === '(' || c === '[') {
      const end = c === "'" || c === '"' || c === '`' ? closeQuote(s, i) : matching(s, i);
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    if (c === ',') {
      parts.push(s.slice(last, i));
      last = i + 1;
    }
    i++;
  }
  parts.push(s.slice(last));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** 引用符 / バッククォートの閉じ (テンプレートの `${…}` は入れ子ごと飛ばす)。 */
function closeQuote(s: string, at: number): number {
  const q = s[at]!;
  let i = at + 1;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (q === '`' && c === '$' && s[i + 1] === '{') {
      const end = matching(s, i + 1);
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    if (c === q) return i;
    i++;
  }
  return -1;
}

/** テンプレートの最上位の `${…}` の中身。 */
function interpolations(template: string): string[] {
  const out: string[] = [];
  let i = 1;
  while (i < template.length - 1) {
    const c = template[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '$' && template[i + 1] === '{') {
      const end = matching(template, i + 1);
      out.push(template.slice(i + 2, end).replace(/\s+/g, ' ').trim());
      i = end + 1;
      continue;
    }
    i++;
  }
  return out;
}

interface Bubble {
  readonly text: string;
  readonly props: readonly string[];
}

/** `append({ … })` の吹き出しを全部 (注記を落としてから)。 */
function bubbles(source: string): Bubble[] {
  const src = stripComments(source);
  const out: Bubble[] = [];
  const re = /\bappend\(\s*\{/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const open = src.indexOf('{', m.index);
    const close = matching(src, open);
    const props = topLevelParts(src.slice(open + 1, close));
    const text = props.find((p) => /^text\s*:/.test(p));
    if (!text) throw new Error(`text の無い吹き出し: ${src.slice(open, close + 1)}`);
    out.push({ text: text.replace(/^text\s*:\s*/, '').trim(), props: props.map((p) => p.split(':')[0]!.trim()) });
  }
  return out;
}

/** `text` に入る外の値のうち、**畳まずに置いてよい**物と理由 (テンプレートの中の補間)。 */
const APP_INTERPOLATIONS: Readonly<Record<string, string>> = {
  'answers.length': '全AI合議で返った回答の件数 —— アプリが数えた数',
  okCount: '全AI合議で成功した回答の件数 —— アプリが数えた数',
  label:
    'プロバイダの表示名 —— 仕様の表 (`providers`) から引く。無ければ `a.provider` で、その欄は main の chatAll が' +
    'アプリの `spec.id` を入れる (応答の本文からは作られない)',
  q: '利用者自身の質問の反響 —— `questionEcho` が改行を畳んで 40 字で切る',
};

/** `text` が丸ごと 1 つの値である吹き出し (テンプレートでない) と、その声。 */
const WHOLE_TEXTS: Readonly<Record<string, { readonly voice: 'app' | 'answerer' | 'best3'; readonly why: string }>> = {
  knowledge: { voice: 'app', why: '確証済みナレッジの直答 (`buildOfflineKnowledgeAnswer`) —— 出典つきのアプリのコーパス' },
  'reply.text': { voice: 'app', why: '端末内の規則ベースの応答 (`replyTo`) —— アプリの文と、利用者自身の質問だけ' },
  'started.reason': { voice: 'app', why: 'ベスト3 を始められなかった理由 —— アプリの定型文' },
  'a.text': { voice: 'answerer', why: '全AI合議の各回答 —— 回答者の声として「via 回答者」の札で出す' },
  'res.data.text': { voice: 'answerer', why: '単独の回答 —— 回答者の声として「via 回答者」の札で出す' },
  'header.text': {
    voice: 'best3',
    why: 'ベスト3 の見出しの吹き出し —— 組み立ては `formatBestAnswers` が持ち、エラー文は同じ `externalTextOnOneLine` を通る (`bestAnswersVoice.test.ts`)',
  },
  'm.text': {
    voice: 'best3',
    why: 'ベスト3 の順位ごとの 2 つの吹き出し (アプリの採点と理由 / 回答者の文) —— 声の分け方は `formatBestAnswers` が持つ (`bestAnswersVoice.test.ts`)',
  },
};

const WRAP = 'externalTextOnOneLine(';

describe('母集団: アシスタントの吹き出しに入る外の値 (両方向)', () => {
  it('★ `parseMarkdown` で描く画面はアシスタントの 1 枚だけ (他の画面は Markdown を解かない)', () => {
    const files = globSync(['src/renderer/**/*.{ts,tsx}', 'src/shared/**/*.ts'], { cwd: REPO, ignore: ['**/__tests__/**', '**/*.d.ts'] });
    const users = files.filter((f) => f !== 'src/renderer/data/assistantMarkdown.ts' && /\bparseMarkdown\(/.test(stripComments(readOriginalSource(join(REPO, f)))));
    expect(users).toEqual(['src/renderer/pages/AssistantPage.tsx']);
  });

  const found = bubbles(readOriginalSource(PAGE));

  it('★ 走査は空でない (吹き出しは 14 個 —— 増減したら台帳を読み直す)', () => {
    expect(found).toHaveLength(14);
  });

  it('★ テンプレートの補間は、`externalTextOnOneLine` を通るか台帳に在る (新しい外の値は名指しで落ちる)', () => {
    const exprs = found.filter((b) => b.text.startsWith('`')).flatMap((b) => interpolations(b.text));
    const unknown = exprs.filter((e) => !e.startsWith(WRAP) && !(e in APP_INTERPOLATIONS));
    expect(unknown, '畳まずにアプリの声へ入る値が在る —— externalTextOnOneLine を通すか、理由を台帳へ').toEqual([]);
    // 畳む口を通る失敗の文は 5 つ (chatAll の 1 提供者 / chatAll / chat / 例外 / ベスト3 の失敗)。
    expect(exprs.filter((e) => e.startsWith(WRAP))).toHaveLength(5);
    // 逆向き: 台帳の行はどれも実在する (使われなくなった行を残さない)。
    for (const k of Object.keys(APP_INTERPOLATIONS)) expect(exprs, `台帳の ${k} が画面に無い`).toContain(k);
  });

  it('★ 丸ごと 1 つの値の吹き出しは台帳に在り、回答者の声は「via」の札の条件を満たす (両方向)', () => {
    const whole = found.filter((b) => !b.text.startsWith('`'));
    expect(whole.map((b) => b.text).sort()).toEqual(Object.keys(WHOLE_TEXTS).sort());
    for (const b of whole) {
      const row = WHOLE_TEXTS[b.text]!;
      if (row.voice === 'answerer') {
        // 札は `!m.offline && m.provider` のときだけ出る —— 札の無い回答者の声を作らない。
        expect(b.props, `${b.text} に provider が無い`).toContain('provider');
        expect(b.props, `${b.text} が offline を持つ (札が消える)`).not.toContain('offline');
      }
    }
  });

  it('★ 標本: 畳まずに置いた失敗の文は台帳に無い値として名指しされる (上の主張は空でない)', () => {
    const sample = "append({ role: 'assistant', text: `（簡易モード: ${res.message}）`, offline: true });";
    const b = bubbles(sample);
    expect(b).toHaveLength(1);
    const exprs = interpolations(b[0]!.text);
    expect(exprs).toEqual(['res.message']);
    expect(exprs.filter((e) => !e.startsWith(WRAP) && !(e in APP_INTERPOLATIONS))).toEqual(['res.message']);
    // 入れ子のテンプレートと三項も 1 つの補間として読む。
    const nested = bubbles("append({ text: `a ${x ? `b ${y}` : 'c'} d`, provider: p });");
    expect(interpolations(nested[0]!.text)).toEqual(["x ? `b ${y}` : 'c'"]);
    expect(nested[0]!.props).toEqual(['text', 'provider']);
  });
});
