/**
 * **AI への入力の天井 —— handler は持ち、画面は共有の定数を読む。母集団は実装から導く。**
 * (2026-09-09 · パス 112 / 114)
 *
 * 実測 (直す前) は 4 通りに割れていた: `assistant/chat` は最新の発話まで**黙って切り**
 * (8000)、`skills/run-skill` は**天井なし**、`business` / `stocks` の `advise` は断る (1000) が
 * 画面は `maxLength={1000}` と**数を写し**、`emotions/analyze-text` は断る (5000) が画面は
 * 何も持たなかった。数を写した画面は、定数を動かしても古い数で入力を止める
 * (パス 110 の `writeFieldLimits` と同じ規則: **画面の maxLength は台帳の値を読む**)。
 *
 * ここは 3 つを留める:
 *   1. AI へ出る handler (母集団は `ACTIONS` から到達可能性で導く) はすべて天井の**比較式**に届き、
 *      **黙って切る印 (`slice(0, MAX_…)`) には届かない** (届く物は理由つきの台帳に在る)。
 *   2. AI へ送る画面 (同じ母集団を invoke する .tsx) はすべて台帳に在り、`maxLength` に
 *      字面の数を持たず、AI へ行く入力欄は共有の定数を読む。
 * 母集団を手で書かないのは、パス 106 → 107 で 5 → 8 に動いたのと同じ理由。
 *
 * ## 端末内のモデルも数える (パス 114)
 *
 * パス 112 の母集団は「外へ出る印」(`AI_MARKS`) で導いた。**端末内の Ollama は入らず**、
 * `ollama/chat` だけが `slice(0, MAX_OLLAMA_PROMPT_CHARS)` で黙って切る形のまま残り、
 * `OllamaPage` の入力欄には天井が無かった。断り (パス 106 / 107) の母集団は外へ出る物で
 * 正しいが、入力の天井の話に「外か内か」は関係ない —— ここは `ANY_AI_MARKS` で数える。
 *
 * もう 1 つ、パス 112 の印は**名前**で当てていた (`MAX_ANALYZE_TEXT_CHARS` が本体に在れば合格)。
 * 名前が在ることと、その値で**断っている**ことは別 —— `slice(0, MAX_…)` でも名前は在る
 * (パス 113 の対照 H が鳴らなかったのはこの形)。印は比較式 (`.length > MAX_…`) で当てる。
 *
 * ## 画面側の天井は 1 形ではない —— そして AI の欄に**打ち止めは向かない** (パス 168 → 175)
 *
 * パス 112 は画面の天井を `maxLength={定数}` の**1 形だけ**で留めていた。パス 168 で、
 * **人が本文を貼る欄**ではそれが害になると実測した —— ブラウザは天井を超えた分を
 * **黙って**落とすので、`EmotionsPage` では先頭 5,000 字だけが Anthropic へ行き、
 * 返ってきた感情分析が「貼った文の分析」として出ていた。結果は正しく見えるので
 * 切れたことは誰にも見えない。貼る欄は**切らずに断る** (`charsOverCeiling` + 送らない)。
 *
 * パス 168 はそれを 1 画面だけ直し、台帳には「打ち止めが向くのは**自分で打つ短い欄**
 * (質問 1 行)」と書いた。**それが誤りだった** (パス 175 で数えた)。残っていた 8 欄の天井は
 * 1,000 / 8,000 / 8,192 / 32,768 字で、**どれも打って届く量ではない** —— つまり
 * `maxLength` が発火するのは貼り付けのときだけで、そのとき超過分は必ず黙って落ちる。
 * 「打っていて止まる」(指に伝わるので見える) 形は、この母集団に 1 つも無かった。
 * そして落ちた先で `latestTurnTooLong` / `checkAdvisorQuestion('too-long')` ——
 * パス 112 / 114 が両ビルドに置いた断り —— は**1 度も通らない**。
 *
 * 結果として **AI へ行く欄に `maxLength` は使わない**。台帳の行はすべて「断る」形で、
 * 走査は同じ定数が `maxLength={…}` に戻っていないことも見る (台帳は双方向 ——
 * 両方在るとブラウザが先に落とし、断る側に制御が来ない)。
 * 外へ**書く**欄 (`shared/writeFieldLimits.ts`・パス 172) は **2 形のまま**である ——
 * あちらには「自分で打つ短い欄」(チャンネル ID・ラベル・ページ ID) が実在する。
 *
 * ## 押せなくするだけでは足りない経路を、**源から導く** (パス 175)
 *
 * パス 168 は「送る手前が最後の砦」として 2 か所目の `charsOverCeiling` を求め、理由を
 * 「state が古いまま押された経路で切れた本文が出ていく」と書いた。**これも誤り**である ——
 * React の handler はその描画の state を掴むので、古い state で押されたなら送られるのは
 * **古くて短い**本文であり、天井を超えた本文ではない。押す道がボタンだけの画面では、
 * 2 か所目は**到達できない行**である (パス 169 の「到達できない行を増やさない」)。
 *
 * 2 か所目が本当に要るのは、**`disabled` を見ない送信経路**を持つ画面である。実測で 2 種:
 *
 *   - `onKeyDown` の Enter (`BusinessPage` / `StocksPage` の助言欄) —— `advisorBusy` しか見ない。
 *   - `onTranscript` のマイク (`VillagePage`) —— 欄を通らず `handleUtterance` へ直に来る。
 *
 * どちらも**源から導く** (`enterSubmitFns` / `micSubmitFns`)。台帳の `bypass` は導いた結果と
 * 一致していなければ鳴る —— 新しい Enter 経路が黙って増えたら、その画面は砦を要求される。
 * そして砦は**黙って `return` しない** —— 何字超えているかを述べる (`refusedCeilingNote`)。
 */
import { describe, expect, it } from 'vitest';
import { originalSourcePath, readOriginalSource } from '../../shared/__tests__/originalSource';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  ANY_AI_MARKS,
  RENDERER,
  aiActionHandlers,
  code,
  invokesAi,
  pageFiles,
  reaches,
} from '../pages/__tests__/aiEgressPairs.helpers';

/**
 * handler が入力の天井で**断っている**印 (呼び出し先で持っていてもよい)。
 * 名前ではなく比較の場所で当てる —— 共有の判定関数 (自分の検査を持つ) か、`.length > MAX_…`。
 */
const CAP_MARKS: readonly RegExp[] = [
  /\blatestTurnTooLong\s*\(/,
  /\bcheckAdvisorQuestion\s*\(/,
  /\.length\s*>\s*MAX_[A-Z0-9_]+\b/,
];

/** 黙って切る印。母集団の handler は**届いてはいけない** (パス 112 / 114 の規則)。 */
const SILENT_CUT_MARKS: readonly RegExp[] = [/\.slice\(\s*0\s*,\s*MAX_[A-Za-z0-9_]+\s*\)/];

/**
 * 黙って切る印に届いてよい handler と、その理由。**利用者の最新の発話ではない物**に限る。
 * 台帳が古くなったら鳴る (印に届かなくなった行は消す)。
 */
const SILENT_CUT_ALLOWED: Readonly<Record<string, string>> = {
  'assistant/chat':
    'system は app が組む (AssistantPage の RAG 文脈 / VillagePage の人格)。履歴の発話は窓 (sanitizeMessages) —— 最新の発話は latestTurnTooLong が先に断る (パス 112 で分けた判断)',
  'assistant/chatAll': '同上',
  'emotions/analyze-text':
    '切るのは保存する履歴の件数 (MAX_ANALYSES) で、入力ではない。text は MAX_ANALYZE_TEXT_CHARS で先に断る',
};

/** `disabled` を見ない送信経路の種類。**源から導き**、台帳の `bypass` と突き合わせる。 */
type Bypass = 'enter' | 'mic';

/** 画面がこの天井を**断る形**で持っていること (`maxLength` は使わない。上の散文)。 */
interface Bound {
  /**
   * `charsOverCeiling(…, 定数)` が要る回数 —— 欄で超過を述べるのに 1 か所、
   * `bypass` を持つ画面はその送信関数の中にもう 1 か所 (`disabled` が効かない道の砦)。
   */
  readonly reads: number;
  /** この画面の `disabled` を迂回する送信経路。**導いた結果と一致していること** (双方向)。 */
  readonly bypass: readonly Bypass[];
  /** この欄に人が何を入れるか (= 打ち止めではなく断りが向く理由)。 */
  readonly why: string;
  /**
   * 振る舞い (押せない・`invoke` しない・全文が残る・迂回経路が断る) を留めている検査
   * (`RENDERER` からの相対)。ここの走査は綴りしか見られないので、
   * **断りが本当に効いているか**はその検査が持つ。消えたらここが鳴る。
   */
  readonly provenBy: string;
}

/** 画面 → AI へ行く入力欄が読む定数 (`null` = 利用者の入力欄は AI へ行かない。理由を書く)。 */
type PageCap =
  | {
      /** `invoke` を持つ関数の名 —— 迂回経路 (Enter / マイク) をこの名から導く。 */
      readonly submitFn: string;
      readonly constants: Readonly<Record<string, Bound>>;
    }
  | { readonly constants: null; readonly why: string };

/** 断りの振る舞いを留めている検査 (8 欄すべてを 1 か所で駆動する。パス 175)。 */
const PROVEN = '__tests__/aiCeilingOnScreen.test.ts';

const PAGE_CAPS: Readonly<Record<string, PageCap>> = {
  'pages/AssistantPage.tsx': {
    submitFn: 'send',
    constants: {
      MAX_ASSISTANT_CONTENT_CHARS: {
        reads: 1,
        bypass: [],
        why: '「創業計画のたたき台を作って」と誘う画面 —— 人は自分の計画・メール・議事録を貼る。8,000 字は打って届かない',
        provenBy: PROVEN,
      },
    },
  },
  'pages/VillagePage.tsx': {
    submitFn: 'handleUtterance',
    constants: {
      MAX_ASSISTANT_CONTENT_CHARS: {
        reads: 2,
        bypass: ['mic'],
        why: '文字でも話しかけられる欄 (貼り付けが通る)。マイクは欄を通らないので、'
          + '`handleUtterance` にも砦が要る —— 送った先の断りは `if (res.ok && …)` に else が無く、誰にも届かない',
        provenBy: PROVEN,
      },
    },
  },
  'pages/SkillsPage.tsx': {
    submitFn: 'run',
    constants: {
      MAX_ASSISTANT_CONTENT_CHARS: {
        reads: 1,
        bypass: [],
        why: '「このスキルに何を依頼するか」の複数行の欄 —— 資料を貼って渡す使い方が主である',
        provenBy: PROVEN,
      },
    },
  },
  'pages/BusinessPage.tsx': {
    submitFn: 'runAdvisor',
    constants: {
      MAX_ADVISOR_QUESTION_CHARS: {
        reads: 2,
        bypass: ['enter'],
        why: '1 行の欄だが天井は 1,000 字 —— 打って届く量ではなく、状況説明を貼ると超える。'
          + 'Enter は `advisorBusy` しか見ないので、押せなくするだけでは送れてしまう',
        provenBy: PROVEN,
      },
    },
  },
  'pages/StocksPage.tsx': {
    submitFn: 'runAdvisor',
    constants: {
      MAX_ADVISOR_QUESTION_CHARS: {
        reads: 2,
        bypass: ['enter'],
        why: '経営ダッシュボードの助言欄と同じ作り・同じ天井・同じ Enter の迂回',
        provenBy: PROVEN,
      },
    },
  },
  // 端末内 (Ollama)。prompt と system は別の天井 —— 欄ごとに読む定数が違う。
  'pages/OllamaPage.tsx': {
    submitFn: 'sendChat',
    constants: {
      MAX_OLLAMA_PROMPT_CHARS: {
        reads: 1,
        bypass: [],
        why: '端末内モデルへの複数行のプロンプト。32,768 字は貼り付け専用の天井である',
        provenBy: PROVEN,
      },
      MAX_OLLAMA_SYSTEM_CHARS: {
        reads: 1,
        bypass: [],
        why: '同じ画面の System prompt (8,192 字)。handler は 2 つを別々に断る (パス 114)',
        provenBy: PROVEN,
      },
    },
  },
  'components/ChatbotWidget.tsx': {
    submitFn: 'send',
    constants: {
      MAX_OLLAMA_PROMPT_CHARS: {
        reads: 1,
        bypass: [],
        why: '解釈できなかった入力が端末内モデルへ回る (`tryOllama`) —— 天井は Ollama の物',
        provenBy: PROVEN,
      },
    },
  },
  'pages/EmotionsPage.tsx': {
    submitFn: 'analyze',
    constants: {
      MAX_ANALYZE_TEXT_CHARS: {
        reads: 1,
        bypass: [],
        why:
          'この画面の欄は**人が本文を貼る** (placeholder が「メール本文、自分の日記」と貼り付けを誘い、'
          + 'どちらも 5,000 字をふつうに超える)。maxLength に任せると超過分が黙って落ち、先頭 5,000 字への'
          + '分析が全文への分析として画面に出る —— 結果は正しく見えるので利用者に見分けられない (パス 168)',
        provenBy: 'pages/__tests__/emotionsCeilingOnScreen.test.ts',
      },
    },
  },
  'pages/GmailPage.tsx': {
    constants: null,
    why: '受信スレッドの件名と送信者 (取得済みデータ) を送る。利用者の入力欄 (下書き) は AI へ行かない',
  },
  'pages/SlackPage.tsx': {
    constants: null,
    why: 'チャンネル名と目的 (取得済みデータ) を送る。利用者の入力欄 (送信) は AI へ行かない',
  },
};

/**
 * `onKeyDown` が Enter のときに呼ぶ関数の名 —— **`disabled` を見ない送信経路**を源から導く。
 * (`<button disabled>` は Enter の暗黙の submit を止めるが、`onKeyDown` の手書きは止まらない。)
 */
function enterSubmitFns(src: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/onKeyDown=\{\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\}/g)) {
    const body = m[1] ?? '';
    if (!/['"]Enter['"]/.test(body)) continue;
    for (const c of body.matchAll(/\b([a-z][A-Za-z0-9_]*)\s*\(/g)) out.add(c[1]!);
  }
  return out;
}

/** `onTranscript` (マイクの確定文) が呼ぶ関数の名 —— 欄を通らない送信経路。 */
function micSubmitFns(src: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/onTranscript:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\},/g)) {
    for (const c of (m[1] ?? '').matchAll(/\b([a-z][A-Za-z0-9_]*)\s*\(/g)) out.add(c[1]!);
  }
  return out;
}

/** この画面で `submitFn` へ届く「`disabled` を見ない」経路 (導いた結果)。 */
function derivedBypass(src: string, submitFn: string): Bypass[] {
  const found: Bypass[] = [];
  if (enterSubmitFns(src).has(submitFn)) found.push('enter');
  if (micSubmitFns(src).has(submitFn)) found.push('mic');
  return found;
}

/** `maxLength={定数}` が在る回数 (ブラウザに打ち止めさせている欄の数)。 */
function maxLengthReads(src: string, constant: string): number {
  return src.split(`maxLength={${constant}}`).length - 1;
}

/** `charsOverCeiling(…, 定数)` が在る回数 (断る形でこの天井を読んでいる回数)。 */
function refusalReads(src: string, constant: string): number {
  return src.match(new RegExp(`charsOverCeiling\\(\\s*[^()]*\\b${constant}\\b`, 'g'))?.length ?? 0;
}

/**
 * その天井の `<CeilingNotice … max={定数} />` が在る回数 (**超過を画面が述べている**か)。
 *
 * `refusalReads` だけでは足りない —— パス 175 の対照 C3 で実測した: 節 (`<CeilingNotice>`) を
 * 消しても `const over = charsOverCeiling(…)` は残るので、読みの数は 1 のまま通ってしまう
 * (画面は何も言わなくなっているのに)。**読んでいることと、述べていることは別**である。
 */
function noticeReads(src: string, constant: string): number {
  return src.match(new RegExp(`<CeilingNotice[^>]*max=\\{\\s*${constant}\\s*\\}`, 'g'))?.length ?? 0;
}

describe('AI へ出る handler はすべて入力の天井で断る (母集団は ACTIONS から導く。端末内も数える)', () => {
  const handlers = aiActionHandlers(ANY_AI_MARKS);
  const keys = handlers.map((h) => `${h.service}/${h.action}`);

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(keys).toContain('assistant/chat');
    expect(keys).toContain('assistant/chatAll');
    expect(keys).toContain('skills/run-skill');
    // 端末内のモデル (パス 114 で母集団に入れた)。
    expect(keys).toContain('ollama/chat');
    // `/api/chat` は Slack の `chat.postMessage` にも当たる —— 印は Ollama の接続先と組で見る。
    expect(keys).not.toContain('slack/send-message');
    expect(keys.length).toBeGreaterThanOrEqual(7);
  });

  it('★ 天井の比較式に届かない handler が 0 件', () => {
    const bare = handlers
      .filter((h) => !reaches(h.handler, h.bodies, CAP_MARKS))
      .map((h) => `${h.service}/${h.action}`);
    expect(bare, '入力の天井で断らずに AI へ送る handler がある').toEqual([]);
  });

  it('★ 黙って切る印に届く handler は、理由つきの台帳の物だけ', () => {
    const cutting = handlers
      .filter((h) => reaches(h.handler, h.bodies, SILENT_CUT_MARKS))
      .map((h) => `${h.service}/${h.action}`);
    expect(cutting.filter((k) => !(k in SILENT_CUT_ALLOWED)), '黙って切る handler がある').toEqual([]);
    // 対照: 台帳が古くなっていない (切らなくなった handler の行は消す)。
    for (const k of Object.keys(SILENT_CUT_ALLOWED)) {
      expect(cutting, `${k} は黙って切っていない (台帳が古い)`).toContain(k);
      expect(SILENT_CUT_ALLOWED[k]!.length, `${k}: 理由が無い`).toBeGreaterThan(1);
    }
  });

  it('★ 対照: 印を外せば handler が落ちる。名前だけ在る本体 (slice) は天井の印に届かない', () => {
    const bodies = new Map<string, string>([
      ['h', "const p = checkAdvisorQuestion(q);\nawait fetch('https://api.anthropic.com/v1/messages');\n"],
      ['cmp', 'if (text.length > MAX_ANALYZE_TEXT_CHARS) throw new Error(x);\n'],
      ['cut', 'const t = text.slice(0, MAX_ANALYZE_TEXT_CHARS);\n'],
    ]);
    expect(reaches('h', bodies, CAP_MARKS)).toBe(true);
    expect(reaches('cmp', bodies, CAP_MARKS)).toBe(true);
    // 名前は在るが比較していない —— パス 112 の印 (名前) なら通っていた。
    expect(reaches('cut', bodies, CAP_MARKS)).toBe(false);
    expect(reaches('cut', bodies, SILENT_CUT_MARKS)).toBe(true);
    expect(reaches('cmp', bodies, SILENT_CUT_MARKS)).toBe(false);
    expect(reaches('h', bodies, [/\bnever_present_mark\b/])).toBe(false);
  });
});

describe('AI へ送る画面は台帳に在り、入力欄は共有の定数を読む (数を写さない)', () => {
  const pairs = aiActionHandlers(ANY_AI_MARKS).map((h) => [h.service, h.action] as const);
  const aiPages = pageFiles()
    .filter((f) => invokesAi(readOriginalSource(f), pairs))
    .map((f) => path.relative(RENDERER, f));

  it('★ 走査が実物に当たる', () => {
    expect(aiPages).toContain('pages/AssistantPage.tsx');
    expect(aiPages).toContain('pages/OllamaPage.tsx');
    expect(aiPages).toContain('components/ChatbotWidget.tsx');
    expect(aiPages.length).toBeGreaterThanOrEqual(10);
  });

  it('★ AI へ送る画面はすべて台帳に在る (11 個目が黙って増えない)', () => {
    expect(aiPages.filter((p) => !(p in PAGE_CAPS)), '台帳に無い AI の画面').toEqual([]);
  });

  it('★ 台帳の画面はすべて AI へ送っている (古い行が残っていない)', () => {
    expect(Object.keys(PAGE_CAPS).filter((p) => !aiPages.includes(p)), '台帳の古い行').toEqual([]);
  });

  it('★ 入力欄は字面の数を持たず、AI へ行く欄は断る形でその天井の定数を読む (maxLength は使わない)', () => {
    for (const p of aiPages) {
      const src = code(readOriginalSource(path.join(RENDERER, p)));
      expect(src, `${p} が maxLength に数を写している`).not.toMatch(/maxLength=\{\s*\d/);
      const cap = PAGE_CAPS[p]!;
      if (cap.constants === null) {
        expect(cap.why.length, `${p}: 理由が無い`).toBeGreaterThan(10);
        continue;
      }
      for (const [constant, bound] of Object.entries(cap.constants)) {
        expect(src, `${p} が ${constant} を import していない`).toMatch(
          new RegExp(`import[^;]*\\b${constant}\\b[^;]*from`),
        );
        // **綴りで当てられるのはここまで** —— 効いているかは provenBy が持つ。
        expect(
          refusalReads(src, constant),
          `${p} が ${constant} で断っていない (charsOverCeiling が足りない)`,
        ).toBeGreaterThanOrEqual(bound.reads);
        // 読むだけでは足りない —— **超過を述べる節**が在ること (対照 C3)。
        expect(
          noticeReads(src, constant),
          `${p}: ${constant} の超過を画面が述べていない (<CeilingNotice> が無い)`,
        ).toBeGreaterThanOrEqual(1);
        // 台帳は双方向: `maxLength` が戻っていたらブラウザが先に黙って落とし、
        // 断る側に制御が来ない (パス 175 —— AI の欄に打ち止めは向かない)。
        expect(
          maxLengthReads(src, constant),
          `${p}: ${constant} を maxLength でも止めている (超過分が黙って落ちる)`,
        ).toBe(0);
        expect(bound.why.length, `${p}: ${constant} を断る形にした理由が無い`).toBeGreaterThan(10);
        const proof = path.join(RENDERER, bound.provenBy);
        expect(
          existsSync(originalSourcePath(proof)),
          `${p}: ${constant} の振る舞いを留める検査 (${bound.provenBy}) が無い`,
        ).toBe(true);
        expect(
          readOriginalSource(proof),
          `${bound.provenBy} が ${constant} を見ていない`,
        ).toContain(constant);
      }
    }
  });

  it('★ `disabled` を見ない送信経路は源から導き、台帳と一致する (両方向)', () => {
    for (const p of aiPages) {
      const cap = PAGE_CAPS[p]!;
      if (cap.constants === null) continue;
      const src = code(readOriginalSource(path.join(RENDERER, p)));
      // 送信関数が実在すること —— 名前が変わったら導出が黙って空になる。
      expect(src, `${p}: 台帳の送信関数 ${cap.submitFn} が見つからない`).toMatch(
        new RegExp(`\\b${cap.submitFn}\\b`),
      );
      const derived = derivedBypass(src, cap.submitFn);
      for (const [constant, bound] of Object.entries(cap.constants)) {
        expect(
          [...bound.bypass].sort(),
          `${p}: ${constant} の bypass が実装と食い違う (導出: ${derived.join(',') || 'なし'})`,
        ).toEqual([...derived].sort());
        // 迂回経路が在るなら、欄の注記だけでは足りない —— その関数の中に砦が要る。
        expect(
          bound.reads,
          `${p}: ${constant} は迂回経路 (${derived.join(',')}) を持つので 2 か所目 (${cap.submitFn} の中) が要る`,
        ).toBeGreaterThanOrEqual(derived.length > 0 ? 2 : 1);
        if (derived.length === 0) continue;
        // 砦は**黙って return しない** (何字超えているかを述べる)。振る舞いは provenBy が持つ。
        expect(src, `${p}: 迂回経路の砦が何も述べていない`).toMatch(/\brefusedCeilingNote\s*\(/);
        const proof = readOriginalSource(path.join(RENDERER, bound.provenBy));
        for (const kind of derived) {
          const mark = kind === 'enter' ? 'Enter' : 'onTranscript';
          expect(proof, `${bound.provenBy}: ${kind} の迂回経路を通していない`).toContain(mark);
        }
      }
    }
  });

  it('★ 対照: 2 つの形の印は互いに取り違えない (どちらも空の検査になっていない)', () => {
    const withMax = '<textarea maxLength={MAX_X} />';
    const withRefuse =
      'const over = charsOverCeiling(text, MAX_X);\n'
      + 'if (charsOverCeiling(text, MAX_X) > 0) return;\n';
    expect(maxLengthReads(withMax, 'MAX_X')).toBe(1);
    expect(refusalReads(withMax, 'MAX_X')).toBe(0);
    expect(refusalReads(withRefuse, 'MAX_X')).toBe(2);
    expect(maxLengthReads(withRefuse, 'MAX_X')).toBe(0);
    // 別の定数を読んでいる呼び・別の定数の欄は数えない (欄ごとに天井が違う)。
    expect(refusalReads('charsOverCeiling(raw, MAX_XY)', 'MAX_X')).toBe(0);
    expect(maxLengthReads('maxLength={MAX_XY}', 'MAX_X')).toBe(0);
    // 述べる節の印も、読みの印とは別に当たる (C3 が鳴らなかったので足した)。
    expect(noticeReads('<CeilingNotice label="本文" value={t} max={MAX_X} />', 'MAX_X')).toBe(1);
    expect(noticeReads(withRefuse, 'MAX_X'), '読みだけで節が在ると数えている').toBe(0);
    expect(noticeReads('<CeilingNotice label="x" value={t} max={MAX_XY} />', 'MAX_X')).toBe(0);
    // 字面の数を掴む規則が実際に当たる (不在の主張に標本を添える)。
    expect('<input maxLength={2000} />').toMatch(/maxLength=\{\s*\d/);
    expect(withMax).not.toMatch(/maxLength=\{\s*\d/);
  });

  it('★ 対照: 迂回経路の導出が実物に当たり、似て非なる形では鳴らない', () => {
    const enter = [
      '            onKeyDown={(e) => {',
      "              if (e.key === 'Enter' && !advisorBusy) runAdvisor();",
      '            }}',
    ].join('\n');
    expect([...enterSubmitFns(enter)]).toContain('runAdvisor');
    // Enter を見ない onKeyDown は送信経路ではない (Escape で閉じるだけの欄など)。
    const esc = [
      '            onKeyDown={(e) => {',
      "              if (e.key === 'Escape') setOpen(false);",
      '            }}',
    ].join('\n');
    expect([...enterSubmitFns(esc)]).toEqual([]);
    const mic = [
      '      onTranscript: (t, isFinal) => {',
      '        setTranscript(t);',
      '        if (isFinal) handleUtterance(t);',
      '      },',
    ].join('\n');
    expect([...micSubmitFns(mic)]).toContain('handleUtterance');
    expect([...micSubmitFns(enter)]).toEqual([]);
    expect(derivedBypass(enter + '\n' + mic, 'runAdvisor')).toEqual(['enter']);
    expect(derivedBypass(enter + '\n' + mic, 'handleUtterance')).toEqual(['mic']);
    expect(derivedBypass(enter + '\n' + mic, 'sendChat')).toEqual([]);
  });
});
