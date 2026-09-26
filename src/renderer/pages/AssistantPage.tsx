/**
 * AssistantPage — 確証済みナレッジと全サービスを統合した、Claude 駆動の
 * 専用 AI チャットページ。
 *
 *   - 頭脳     → `serviceHub.invoke('assistant','chat', { system, messages })`
 *                (Electron: main の Anthropic 中継 / ブラウザ: web-shim が直接呼ぶ)
 *   - 文脈     → `data/assistantContext.buildSystemPrompt` が確証済みナレッジ +
 *                関連サービスを RAG 注入 (単一の真実源から導出)
 *   - 成果物   → `data/assistantMarkdown.parseMarkdown` で表・箇条書きを安全描画
 *   - 代替     → API 未設定/失敗時は決定論ルールエンジン (`data/chatbot.replyTo`) に
 *                フォールバックし、案内・手取り計算・カウンセリングは常時オフライン動作
 *   - 背景     → ユーザーがカスタマイズ可能 (既定: 背景白 / 文字黒)。localStorage 永続化
 *
 * 画面遷移は `servicehub:navigate` CustomEvent (App.tsx が listen)。
 */
import { navigateTo } from '../navigate';
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../shared/redact';
import {
  deleteCredentialConfirm,
  deletedCredentialMessage,
  readMechanism,
  savedCredentialMessage,
  type StorageMechanism,
} from '../data/credentialSaveMessage';
import { chatMessages } from '../data/persistedShape';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICES } from '../services';
import type { ServiceId } from '../../shared/serviceId';
import {
  buildOfflineKnowledgeAnswer,
  buildSystemPrompt,
  retrieveServices,
  type AssistantService,
} from '../data/assistantContext';
import { parseMarkdown, type Block, type InlineToken } from '../data/assistantMarkdown';
import { replyTo } from '../data/chatbot';
import { buildOrgIndex, type RawOrg, type RawTeam } from '../data/chatOrg';
import { CAPABILITIES } from '../components/VoiceCommandBar';
import { org as registryOrg, teams as registryTeams } from '../../../orchestration/registry.json';
import { safeCssUrl } from '../../shared/imageUrlGate';
import { AiEgressNotice } from '../components/AiEgressNotice';
import {
  ALL_AGENTS,
  BEST3_AGENTS,
  assistantEgressRecipients,
  readProviderStatuses,
  type ProviderStatus,
} from '../data/assistantProviders';
import { MAX_ASSISTANT_CONTENT_CHARS } from '../../shared/assistantLimits';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import { checkTokenInput } from '../../shared/tokenInput';
import {
  AI_CREDENTIAL_FIELDS,
  emptyAiCredentialForm,
  type AiCredentialFormValues,
} from '../data/aiCredentialFields';
import type { ActionData } from '../../shared/actionData';
import {
  BEST_ANSWERS_COUNT,
  ENGINEERING_LENSES,
  formatBestAnswers,
  MAX_BEST_ANSWER_CALLS,
  planCalls,
  questionEcho,
  type SendChat,
} from '../data/bestAnswers';
import { markBestJobDelivered, startBestJob } from '../data/bestAnswersJob';
import { useBestJob } from '../data/useBestJob';
import { BestAnswersProgress } from '../components/BestAnswersProgress';
import { AI_PROVIDERS } from '../../shared/ai/providers';
import { lookup } from '../../shared/lookup';

interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  /** 関連サービス (アシスタント発話のとき、回答に紐づく案内ボタン用)。 */
  readonly services?: readonly AssistantService[];
  /** オフライン (ルールエンジン) 応答か。 */
  readonly offline?: boolean;
  /** 応答した AI プロバイダ (assistant 発話・オンライン時)。 */
  readonly provider?: string;
}

/**
 * エージェント設定パネルの入力フィールド (保存時に空欄は除外)。
 *
 * **欄は `data/aiCredentialFields.ts` が持つ** —— 手で並べていた 2026-09-24 まで、
 * `anthropicModel` / `openaiModel` / `geminiModel` の 3 欄は「アプリが読むのに
 * 画面からは書けない」状態だった (パス 450。理由と実測はあのファイルの docblock)。
 */
type AgentCredsForm = AiCredentialFormValues;

const EMPTY_CREDS_FORM: AgentCredsForm = emptyAiCredentialForm();

interface Theme {
  readonly bg: string;
  readonly fg: string;
  readonly image: string;
}

const HISTORY_KEY = 'assistant-history';
const THEME_KEY = 'assistant-theme';
const PROVIDER_KEY = 'assistant-provider';
/** chatAll (全AI合議) の 1 プロバイダ分の回答。 */
// `EnsembleAnswer` は台帳 `shared/actionData.ts` から読む (パス 116) —— main と同じ型。
const HISTORY_MAX = 50;
/**
 * AI へ渡す直近の**発話数** (往復ではない —— 利用者と AI の発話を合わせて数える)。
 *
 * 検査がこの値を読むために輸出する (数を写すと、片方だけ動いて断り書きがずれる ——
 * 2026-09-12 のパス 186 まで断りは「16 往復」と書いており、実際の 2 倍を述べていた)。
 */
export const ASSISTANT_TURN_WINDOW = 16;
const TURN_WINDOW = ASSISTANT_TURN_WINDOW;

const DEFAULT_THEME: Theme = { bg: '#ffffff', fg: '#000000', image: '' };

// 注: `SERVICES` への依存はモジュール評価時ではなくコンポーネント内 (useMemo) で
// 解決する。services.ts → AssistantPage の循環 import があるため、トップレベルで
// SERVICES を読むと初期化前で undefined になる (罠)。
const ORG_INDEX = buildOrgIndex(registryOrg as RawOrg, registryTeams as readonly RawTeam[]);

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    // 保存値は型が守らない —— role / text の形が合う要素だけ (null が 1 つ混じると描画で落ちる)。
    return chatMessages<ChatMessage>(JSON.parse(raw), ['user', 'assistant'], HISTORY_MAX);
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_MAX)));
  } catch {
    /* 保存失敗は無視 */
  }
}

function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return DEFAULT_THEME;
    const p = JSON.parse(raw) as Partial<Theme>;
    return {
      bg: typeof p.bg === 'string' ? p.bg : DEFAULT_THEME.bg,
      fg: typeof p.fg === 'string' ? p.fg : DEFAULT_THEME.fg,
      image: typeof p.image === 'string' ? p.image : '',
    };
  } catch {
    return DEFAULT_THEME;
  }
}

/** インライントークン列を React ノードへ。 */
function renderInline(spans: readonly InlineToken[], fg: string) {
  return spans.map((t, i) => {
    if (t.code) {
      return (
        <code
          key={i}
          style={{
            background: 'rgba(127,127,127,0.18)',
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: '0.9em',
          }}
        >
          {t.text}
        </code>
      );
    }
    if (t.bold) return <strong key={i}>{t.text}</strong>;
    return <span key={i} style={{ color: fg }}>{t.text}</span>;
  });
}

/** Markdown ブロックを安全に描画 (HTML 文字列を使わない)。 */
function MarkdownView({ blocks, fg }: { blocks: Block[]; fg: string }) {
  const border = '1px solid rgba(127,127,127,0.4)';
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          const size = b.level <= 2 ? 18 : b.level === 3 ? 16 : 14;
          return (
            <div key={i} style={{ fontWeight: 700, fontSize: size, margin: '8px 0 4px', color: fg }}>
              {renderInline(b.spans, fg)}
            </div>
          );
        }
        if (b.type === 'paragraph') {
          return (
            <p key={i} style={{ margin: '4px 0', lineHeight: 1.7, color: fg }}>
              {renderInline(b.spans, fg)}
            </p>
          );
        }
        if (b.type === 'code') {
          return (
            <pre
              key={i}
              style={{
                background: 'rgba(127,127,127,0.14)',
                padding: 10,
                borderRadius: 8,
                overflowX: 'auto',
                fontSize: 12.5,
                margin: '6px 0',
              }}
            >
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return (
            <Tag key={i} style={{ margin: '4px 0', paddingLeft: 22, lineHeight: 1.7, color: fg }}>
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it, fg)}</li>
              ))}
            </Tag>
          );
        }
        // table
        return (
          <div key={i} style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, color: fg }}>
              <thead>
                <tr>
                  {b.headers.map((cell, c) => (
                    <th
                      key={c}
                      style={{ border, padding: '6px 10px', textAlign: 'left', background: 'rgba(127,127,127,0.12)' }}
                    >
                      {renderInline(cell, fg)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} style={{ border, padding: '6px 10px' }}>
                        {renderInline(cell, fg)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

/**
 * 保管の守り方を橋へ問い合わせる。取れなければ null —— **分からないことを
 * 「暗号化しました」と言い換えない** (古い橋・問い合わせの失敗の両方でここへ来る)。
 */
async function storageMechanismOrNull(hub: Window['serviceHub']): Promise<StorageMechanism | null> {
  try {
    return readMechanism(await hub.storageProtection());
  } catch {
    return null;
  }
}

export function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState('');
  /*
   * **貼り付けを黙って切らない** (パス 175)。`maxLength` に任せると、ブラウザが天井を超えた分を
   * 黙って落とし、先頭 8,000 字だけが AI へ行く —— 切れた質問への答えが全文への答えとして返る。
   * 天井は打てば届く量ではないので、`maxLength` が発火するのは**貼り付けのときだけ**であり、
   * そのときは必ず見えない (パス 168 が感情分析の欄で実測した形)。
   */
  const inputOver = charsOverCeiling(input, MAX_ASSISTANT_CONTENT_CHARS);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [showTheme, setShowTheme] = useState(false);
  const [providers, setProviders] = useState<readonly ProviderStatus[]>([]);
  /** 設定状況を**読めなかった**か (空配列と区別する。パス 107)。 */
  const [providersUnknown, setProvidersUnknown] = useState(false);
  const [provider, setProvider] = useState<string>(() => {
    try {
      return localStorage.getItem(PROVIDER_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [showAgents, setShowAgents] = useState(false);
  const [credsForm, setCredsForm] = useState<AgentCredsForm>(EMPTY_CREDS_FORM);
  const [credsMessage, setCredsMessage] = useState('');
  /**
   * `assistant` スロットに何か預かっているか。**「消す口」を出すかを決める唯一の判断**で、
   * 出どころは設定画面の掃除の節と `StatusBar` の「削除」が読むのと同じ `listConfigured()`。
   *
   * ★ **分からないときは出す側へ倒す** (`null` で出す・`false` のときだけ隠す)。
   * プロバイダの設定状況 (`providers`) から導くと、保管庫が施錠されていて読めないときや、
   * 包みに互換 API の URL しか入っていないとき (どの提供者も `configured` にならない) に
   * **預かっているのに消す口が消える** —— それはこのパスで直している欠陥そのものである。
   */
  const [credsStored, setCredsStored] = useState<boolean | null>(null);
  /** 削除の実行中 (二重押しで確認を 2 度出さない)。 */
  const [credsBusy, setCredsBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  /**
   * プロバイダ設定状況を取得する。**「未設定」と「確認できません」を混ぜない** ——
   * 読み方は `data/assistantProviders.ts` が 1 か所で持つ (`VillagePage` も同じ
   * 判断を要るので。2026-09-09 · パス 107)。
   */
  const refreshProviders = async () => {
    const read = await readProviderStatuses();
    setProviders(read.providers);
    setProvidersUnknown(read.unknown);
    // 預かりの有無は別に読む (上の注記のとおり `providers` からは導けない)。
    // 読めなければ `null` のまま = 消す口は出したままにする。
    const hub = window.serviceHub;
    if (!hub) return;
    try {
      setCredsStored((await hub.listConfigured()).includes('assistant'));
    } catch {
      setCredsStored(null);
    }
  };

  useEffect(() => {
    void refreshProviders();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PROVIDER_KEY, provider);
    } catch {
      /* 無視 */
    }
  }, [provider]);

  const egressRecipients = useMemo(
    () => assistantEgressRecipients({ providers, providersUnknown, selected: provider }),
    [providers, providersUnknown, provider],
  );

  /** エージェント設定 (JSON マルチプロバイダ資格情報) を assistant スロットへ保存。 */
  const saveAgentCreds = async () => {
    const hub = window.serviceHub;
    if (!hub) {
      setCredsMessage('serviceHub が利用できません');
      return;
    }
    const creds: Record<string, string> = {};
    /*
     * **包む前に 1 欄ずつ検証する。**
     *
     * `setToken` は `shared/tokenInput.ts` の規則を通すが、見ているのは
     * `JSON.stringify` した**後**の文字列である。`JSON.stringify` は制御文字を
     * `\u0000` の 6 文字へ逃がすので、包みの中に制御文字が在っても外側からは
     * 「制御文字なし」に見え、そのまま保存される。取り出す側
     * (`clients/assistant.ts`) は JSON を解いて中の鍵をそのまま
     * `'x-api-key': ctx.token` に載せるので**制御文字は復活し**、
     * `new Headers()` が投げる文面に鍵が入って画面へ出る
     * (`shared/__tests__/headerValueLeak.test.ts` が実測)。
     *
     * **黙って落とさず断る。** 落とすと「保存しました」と言いながらその鍵だけ
     * 入っていない状態になる (このリポジトリが外へ出す欄で繰り返し選んできた側 ——
     * パス 183 ほか)。どの欄かを言わないと打ち直しようがないので、名前も出す。
     */
    const refused: string[] = [];
    (Object.keys(credsForm) as Array<keyof AgentCredsForm>).forEach((k) => {
      const v = credsForm[k].trim();
      if (!v) return;
      const checked = checkTokenInput(v);
      if (!checked.ok) {
        refused.push(`${k}: ${checked.message}`);
        return;
      }
      creds[k] = checked.value;
    });
    if (refused.length > 0) {
      setCredsMessage(`保存できませんでした — ${refused.join(' / ')}`);
      return; // 入力は残す (打ち直しのため)
    }
    if (Object.keys(creds).length === 0) {
      setCredsMessage('少なくとも 1 つの API キー / URL を入力してください');
      return;
    }
    try {
      // **戻り値で判断する。** `setToken` は上限超え・保管庫の施錠などを
      // `{ ok: false }` で返すので、await が解けたことを成功と読んではいけない
      // (`components/StatusBar.tsx` は同じ理由で res を見ている)。ここは
      // 2026-09-06 まで結果を捨てており、**保存できていないのに「保存しました」と
      // 言い、入力欄まで空にしていた** (打ち直しになる)。
      const res = await hub.setToken('assistant', JSON.stringify(creds));
      if (!res.ok) {
        setCredsMessage(`保存できませんでした: ${res.message}`);
        return; // 入力は残す
      }
      // 何が鍵を握っているかで文面を選ぶ (`data/credentialSaveMessage.ts`)。
      // 分からないときは暗号化を名乗らない。
      setCredsMessage(savedCredentialMessage(await storageMechanismOrNull(hub)));
      setCredsForm(EMPTY_CREDS_FORM);
      await refreshProviders();
    } catch (e) {
      setCredsMessage(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /**
   * **預けた API キーを消す。**
   *
   * ## なぜこの口が要るのか (2026-09-24 · パス 453)
   *
   * この画面は `hub.setToken('assistant', …)` で**自分でスロットへ書く**のに、
   * 消す口をどこにも持っていなかった。実測 (jsdom で実物を描いて押す):
   *
   *   - このパネルのボタンは「保存」だけ (「🗑 消去」は `clearChat` = 会話履歴)
   *   - 空のフォームで「保存」を押しても**断られる** (「少なくとも 1 つの…」) ので、
   *     空の包みで上書きして消すこともできない
   *   - `collectsCredential('assistant')` は true なので
   *     `unusedStoredCredentials(['assistant'])` は `[]` —— 設定画面の掃除の節にも出ない
   *   - この画面は `tokenSetup` を渡さないので `StatusBar` の「削除」も出ない
   *
   * つまり **AI の API キーを預けた利用者には、「すべてのデータを削除」以外に
   * 消す手段が 1 つも無かった** (法則 `escape-hatch-stays-open`)。対象はこのアプリが
   * 預かるうちで最も価値の高い資格情報 —— 使うと課金される —— である。
   *
   * ## 形は既に在る 2 つに揃える
   *
   * 確認つき・`res.ok` を見る・失敗を黙らないのは `components/StatusBar.tsx` の
   * 「削除」と `SettingsPage` の保管庫スロットの `clear()` と同じ。**削除の失敗を黙ると
   * 「消したつもりの資格情報が残っている」状態になる**ので、そこだけは必ず述べる。
   */
  const clearAgentCreds = async () => {
    const hub = window.serviceHub;
    if (!hub) {
      setCredsMessage('serviceHub が利用できません');
      return;
    }
    if (!window.confirm(deleteCredentialConfirm())) return;
    setCredsBusy(true);
    try {
      const res = await hub.clearToken('assistant');
      if (!res.ok) {
        setCredsMessage(`削除できませんでした: ${res.message}`);
        return;
      }
      setCredsMessage(deletedCredentialMessage());
      setCredsForm(EMPTY_CREDS_FORM);
      await refreshProviders();
    } catch (e) {
      /*
       * **例外の文面は梯子の最後の段を通す。** `clearToken` は橋 (デスクトップ版) と
       * 保管庫 (ブラウザ版) のどちらでも投げうる。今日この文面に鍵が載る道は見つかって
       * いないが、**伏せられるなら伏せる**のがこのリポジトリの既定で (法則
       * `mention-vs-declaration` の隣 —— パス 290 が `redactForMessage` を
       * 「全経路の最後の関門」と定めた当のこと)、しかも同じ段が天井も掛ける。
       *
       * ★ **これはゲートが捕まえた** —— パス 314 の `errorMessageSurfaceCensus` が
       * 「伏字を通らずに例外の文面を流す行が台帳とずれた」と鳴らし、その注記が
       * 「同じ行で伏せられるなら伏せる」と言っていた (2026-09-24 · パス 453)。
       */
      // 1 行に置く —— census の判定は**行単位** (`REDACTED_ON_LINE.test(line)`) なので、
      // `const raw = …` へ分けると「伏字を通らない行」として数えられる (実際に 1 度そうなった)。
      setCredsMessage(`削除できませんでした: ${redactForMessage(e instanceof Error ? e.message : String(e), ERROR_MESSAGE_MAX_CHARS)}`);
    } finally {
      setCredsBusy(false);
    }
  };

  // SERVICES は循環 import 回避のためコンポーネント内で解決する (初期化済み)。
  const serviceCatalog = useMemo<AssistantService[]>(
    () => SERVICES.map((s) => ({ id: s.id, label: s.label, description: s.description })),
    [],
  );
  const chatContext = useMemo(
    () => ({
      services: serviceCatalog.map((s) => ({
        id: s.id as ServiceId,
        label: s.label,
        description: s.description,
      })),
      org: ORG_INDEX,
      capabilities: CAPABILITIES,
    }),
    [serviceCatalog],
  );

  const suggestions = useMemo(
    () => ['資金調達の選択肢を表で比較して', '今月の経営課題を3つ挙げて', '額面50万円の手取りは？', '何ができる？'],
    [],
  );

  useEffect(() => {
    saveHistory(messages);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    } catch {
      /* 無視 */
    }
  }, [theme]);

  const append = (msg: ChatMessage) => setMessages((prev) => [...prev, msg].slice(-HISTORY_MAX));

  /** ルールエンジンによるオフライン応答 (フォールバック)。 */
  const replyOffline = (text: string) => {
    const reply = replyTo(text, chatContext);
    // 解釈不能 (fallback) のときだけ確証済みナレッジの直答を先に試す。危機対応・
    // 手取り計算・案内などの決定論インテントはルールエンジンの優先順位を維持する。
    if (reply.kind === 'fallback') {
      const knowledge = buildOfflineKnowledgeAnswer(text);
      if (knowledge) {
        append({
          role: 'assistant',
          text: knowledge,
          services: retrieveServices(text, serviceCatalog),
          offline: true,
        });
        return;
      }
    }
    const services = reply.navigateTo
      ? serviceCatalog.filter((s) => s.id === reply.navigateTo)
      : retrieveServices(text, serviceCatalog);
    append({ role: 'assistant', text: reply.text, services, offline: true });
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    const history = [...messages, { role: 'user' as const, text }];
    setMessages(history.slice(-HISTORY_MAX));
    setBusy(true);
    try {
      const hub = window.serviceHub;
      if (!hub) {
        replyOffline(text);
        return;
      }
      const turns = history
        .slice(-TURN_WINDOW)
        .map((m) => ({ role: m.role, content: m.text }));
      // 追問 (「それを詳しく」等) で RAG 文脈が切れないよう、直前のユーザー発話を
      // 検索クエリへ連結する (AI へ渡す会話履歴 turns とは別物)。
      const prevUser = [...messages].reverse().find((m) => m.role === 'user')?.text ?? '';
      const ragQuery = prevUser && prevUser !== text ? `${prevUser}\n${text}` : text;
      const system = buildSystemPrompt(ragQuery, serviceCatalog);

      // 🏆 ベスト3: 7 つのエンジニアリング (ENGINEERING_LENSES) が裏で協調する (data/bestAnswers.ts)。
      // **送るのはこの画面** —— 仕事場へは送り手を渡すだけで、部品は送らない (断りの走査の内に置く)。
      // 仕事場はモジュールの中に在るので、この画面を離れても走り続ける (= バックグラウンド)。
      // 結果は下の effect が受け取り、チャットへ 1 度だけ渡す。
      if (provider === BEST3_AGENTS) {
        const ids = providers.filter((p) => p.configured).map((p) => p.id);
        const sendChat: SendChat = async (req) => {
          const r = await hub.invoke<ActionData<'assistant/chat'>>('assistant', 'chat', {
            system: req.system,
            messages: req.messages,
            ...(req.provider ? { provider: req.provider } : {}),
          });
          return r.ok
            ? { ok: true, text: r.data.text, provider: r.data.provider, model: r.data.model }
            : { ok: false, message: r.message };
        };
        const started = startBestJob(
          { question: text, ragQuery, turns, catalog: serviceCatalog, providerIds: ids },
          sendChat,
          planCalls(ids).length,
        );
        if (!started.ok) append({ role: 'assistant', text: started.reason, offline: true });
        return;
      }

      // 🤝 全AI合議: 設定済みの全プロバイダへ同時に質問し、回答を並べて表示する。
      if (provider === ALL_AGENTS) {
        const resAll = await hub.invoke<ActionData<'assistant/chatAll'>>('assistant', 'chatAll', {
          system,
          messages: turns,
        });
        if (resAll.ok && Array.isArray(resAll.data.answers) && resAll.data.answers.length > 0) {
          const answers = resAll.data.answers;
          const okCount = answers.filter((a) => a.ok).length;
          const relServices = retrieveServices(text, serviceCatalog);
          append({
            role: 'assistant',
            text: `🤝 全AI合議 — ${answers.length} プロバイダに同時質問（回答 ${okCount} 件）`,
            offline: true,
          });
          for (const a of answers) {
            const label = providers.find((p) => p.id === a.provider)?.label ?? a.provider;
            if (a.ok) {
              append({
                role: 'assistant',
                text: a.text,
                services: relServices,
                provider: `${label}${a.model ? ` (${a.model})` : ''}`,
              });
            } else {
              append({
                role: 'assistant',
                text: `⚠ ${label} は応答できませんでした: ${a.error ?? '不明なエラー'}`,
                offline: true,
              });
            }
          }
          return;
        }
        append({
          role: 'assistant',
          text: `（全AI合議を利用できないため簡易モードで回答します: ${resAll.ok ? '回答がありません' : resAll.message}）`,
          offline: true,
        });
        replyOffline(text);
        return;
      }

      const res = await hub.invoke<ActionData<'assistant/chat'>>(
        'assistant',
        'chat',
        {
          system,
          messages: turns,
          ...(provider ? { provider } : {}),
        },
      );
      if (res.ok) {
        append({
          role: 'assistant',
          text: res.data.text,
          services: retrieveServices(text, serviceCatalog),
          provider: res.data.provider,
        });
      } else {
        // API 未設定/失敗 → 決定論フォールバック。一度だけ理由を添える。
        append({
          role: 'assistant',
          text: `（AI 応答を利用できないため簡易モードで回答します: ${res.message}）`,
          offline: true,
        });
        replyOffline(text);
      }
    } catch (e) {
      append({ role: 'assistant', text: `エラー: ${e instanceof Error ? e.message : String(e)}`, offline: true });
      replyOffline(text);
    } finally {
      setBusy(false);
    }
  };

  /**
   * ベスト3 の結果を**1 度だけ**チャットへ渡す。仕事場は画面の外に在るので、この画面が
   * 外れている間に終わった仕事は、次にこの画面が付いたときにここで受け取る。
   */
  const bestJob = useBestJob();
  useEffect(() => {
    if (bestJob === null || bestJob.status === 'running') return;
    // 渡すのは権利を取れたときだけ —— 描いた時点の `bestJob.delivered` で決めると、
    // StrictMode の 2 度目の effect が同じ古い値を見て 2 度渡す (開発版で実際にそうなる)。
    if (!markBestJobDelivered(bestJob.id)) return;
    const q = questionEcho(bestJob.question);
    if (bestJob.status === 'done' && bestJob.result !== null) {
      // 表示名は**仕様の表から**引く (`AiProviderStatus.label` の出どころと同じ `AI_PROVIDERS`)。
      // 設定状況 (`providers`) は付けた直後に非同期で読むので、画面を離れている間に終わった
      // 仕事を戻った瞬間に渡すと、その読みより先にここへ来る —— 1 度目は `providers` から引いており、
      // 同じ結果が「居たまま受け取ると Claude (Anthropic)・戻って受け取ると anthropic」と
      // 渡る時機で 2 通りに書かれた。
      const labelOf = (id: string): string => lookup(AI_PROVIDERS, id)?.label ?? (id || '既定の AI');
      const [header, ...ranked] = formatBestAnswers(bestJob.result, labelOf);
      if (header) append({ role: 'assistant', text: header.text });
      for (const m of ranked) append({ role: 'assistant', text: m.text, provider: m.servedBy });
      // 1 件も示せなければ、チャットと同じく端末内の簡易応答で答える (空にしない)。
      if (ranked.length === 0) replyOffline(bestJob.question);
    } else if (bestJob.status === 'cancelled') {
      append({ role: 'assistant', text: `🏆 ベスト3 を取り消しました（「${q}」）。`, offline: true });
    } else {
      append({ role: 'assistant', text: `🏆 ベスト3 を作れませんでした（「${q}」）: ${bestJob.error ?? '理由不明'}`, offline: true });
      replyOffline(bestJob.question);
    }
  }, [bestJob]);

  const clearChat = () => setMessages([]);

  const pageStyle: React.CSSProperties = {
    background: theme.bg,
    // 生の文字列を url() へ差し込まない。スキーム検証と引用は safeCssUrl に 1 つだけ置く
    // (safeImageSrc の冒頭が「CSS url() へ流れた瞬間に危険」と書いていた当の経路)。
    backgroundImage: safeCssUrl(theme.image),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: theme.fg,
    borderRadius: 12,
    padding: 16,
    minHeight: 'calc(100vh - 120px)',
    display: 'flex',
    flexDirection: 'column',
  };

  const bubbleBase: React.CSSProperties = {
    maxWidth: '88%',
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    lineHeight: 1.7,
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
  };

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <strong style={{ fontSize: 18 }}>🤖 AI アシスタント</strong>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            選択した AI エージェント (Claude / ChatGPT / Gemini / Ollama / 互換API) を頭脳に、
            確証済みナレッジと {SERVICES.length} サービスを統合して回答します
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={provider}
            aria-label="AI エージェントを選択"
            title="このチャットが使う AI エージェント"
            onChange={(e) => setProvider(e.target.value)}
            style={{ fontSize: 12, borderRadius: 10, padding: '4px 8px' }}
          >
            <option value="">エージェント自動 (既定)</option>
            <option value={ALL_AGENTS}>
              🤝 全AI合議 (設定済み {providers.filter((p) => p.configured).length} 社へ同時質問)
            </option>
            <option value={BEST3_AGENTS}>
              🏆 ベスト3 ({ENGINEERING_LENSES.length} つのエンジニアリングが裏で協調・観点 {MAX_BEST_ANSWER_CALLS} つから上位 {BEST_ANSWERS_COUNT} 件)
            </option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.configured ? '' : ' (未設定)'}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setShowAgents((v) => !v)} title="AI エージェントの接続設定">
            ⚙ エージェント
          </button>
          <button type="button" onClick={() => setShowTheme((v) => !v)} title="背景をカスタマイズ">
            🎨 背景
          </button>
          <button type="button" onClick={clearChat} title="会話履歴を消去" disabled={messages.length === 0}>
            🗑 消去
          </button>
        </div>
      </div>

      {providers.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {providers.map((p) => (
            <span
              key={p.id}
              title={
                p.configured
                  ? `${p.label} 接続済み${p.isDefault ? ' (既定)' : ''}`
                  : `${p.label} 未設定 — ⚙ エージェント から設定`
              }
              style={{
                fontSize: 11,
                borderRadius: 999,
                padding: '2px 10px',
                border: '1px solid rgba(127,127,127,0.35)',
                opacity: p.configured ? 1 : 0.5,
              }}
            >
              {p.configured ? '🟢' : '⚪'} {p.label}
              {p.isDefault ? ' ★' : ''}
            </span>
          ))}
        </div>
      ) : null}

      {showAgents ? (
        <div
          style={{
            padding: '12px 14px',
            marginBottom: 10,
            border: '1px solid rgba(127,127,127,0.4)',
            borderRadius: 10,
            fontSize: 13,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 10,
          }}
        >
          <div style={{ gridColumn: '1 / -1', fontWeight: 700 }}>
            🔌 AI エージェント接続設定
            <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 8 }}>
              入力したキーは暗号化スロットに JSON でまとめて保存されます (空欄は未変更ではなく「未設定」として保存)。
            </span>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            既定エージェント
            <select
              value={credsForm.default}
              aria-label="既定エージェント"
              onChange={(e) => setCredsForm((f) => ({ ...f, default: e.target.value }))}
            >
              <option value="">自動 (設定済みの先頭)</option>
              <option value="anthropic">Claude (Anthropic)</option>
              <option value="openai">ChatGPT (OpenAI)</option>
              <option value="gemini">Gemini (Google)</option>
              <option value="ollama">Ollama (ローカル)</option>
              <option value="compat">OpenAI 互換 API</option>
            </select>
          </label>
          {/*
            * **入力の種類は式で書かない。** 秘密の欄と見せる欄を枝で分け、属性は字面で置く ——
            * `__tests__/secretFieldAutocomplete.test.ts` は綴りで母集団を数えるので、
            * 三項演算子で組むと**その欄が走査から消える** (2026-09-24 · パス 450 で
            * 実際に母集団を 16 → 12 へ落とし、門が捕まえた)。
            *
            * 表から組むので**枝は 1 つずつ**になり、走査の母集団は 4 → 1 に縮む。
            * 縮んだ分は `pages/__tests__/aiCredentialFieldsWritable.test.ts` が
            * **描いた DOM で**受け持つ (秘密の欄は 1 つ残らず伏せ字 + 補完なし)。
            */}
          {AI_CREDENTIAL_FIELDS.map((f) => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {f.label}
              {f.secret ? (
                <input
                  type="password"
                  autoComplete="off"
                  value={credsForm[f.key]}
                  placeholder={f.placeholder}
                  aria-label={f.aria}
                  onChange={(e) => setCredsForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  type="text"
                  value={credsForm[f.key]}
                  placeholder={f.placeholder}
                  aria-label={f.aria}
                  onChange={(e) => setCredsForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="primary" onClick={() => void saveAgentCreds()}>
              保存
            </button>
            {/*
              * **預かっていないと分かったときだけ隠す。** `credsStored === null`
              * (まだ読めていない / 読めなかった) では出したままにする —— 隠す側へ倒すと、
              * 保管庫が施錠されている利用者から消す口が消える (パス 453 の欠陥そのもの)。
              */}
            {credsStored === false ? null : (
              <button
                type="button"
                data-clear-agent-creds
                disabled={credsBusy}
                onClick={() => void clearAgentCreds()}
              >
                API キーを削除
              </button>
            )}
            <span style={{ fontSize: 12, opacity: 0.75 }}>{credsMessage}</span>
          </div>
          <div style={{ gridColumn: '1 / -1', fontSize: 11, opacity: 0.65, lineHeight: 1.6 }}>
            ブラウザ版: ChatGPT / 互換 API は CORS のため「設定」ページのプロキシ (Cloudflare Worker)
            経由で呼び出します。Ollama は <code>OLLAMA_ORIGINS</code> の設定が必要な場合があります。
            既存の Anthropic 単独キー (生文字列) もそのまま利用できます (後方互換)。
          </div>
        </div>
      ) : null}

      {showTheme ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'center',
            padding: '10px 12px',
            marginBottom: 10,
            border: '1px solid rgba(127,127,127,0.4)',
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            背景色
            <input
              type="color"
              value={theme.bg}
              aria-label="背景色"
              onChange={(e) => setTheme((t) => ({ ...t, bg: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            文字色
            <input
              type="color"
              value={theme.fg}
              aria-label="文字色"
              onChange={(e) => setTheme((t) => ({ ...t, fg: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 180 }}>
            背景画像URL
            <input
              type="url"
              value={theme.image}
              placeholder="https://… (任意)"
              aria-label="背景画像URL"
              onChange={(e) => setTheme((t) => ({ ...t, image: e.target.value.trim() }))}
              style={{ flex: 1, padding: '4px 8px', borderRadius: 10 }}
            />
          </label>
          <button type="button" onClick={() => setTheme(DEFAULT_THEME)}>
            既定に戻す
          </button>
        </div>
      ) : null}

      <div
        ref={listRef}
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}
      >
        {messages.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.8 }}>
            ご質問・ご相談をどうぞ。経営・税務・労務・法務のアドバイス、表や計画などの成果物作成、
            アプリ内サービスへの案内ができます。確証済みナレッジ（出典つき）を根拠に回答します。
          </div>
        ) : null}

        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          return (
            <div key={i} style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
              <div
                style={{
                  ...bubbleBase,
                  background: isUser ? 'var(--accent, #4f7cff)' : 'rgba(127,127,127,0.10)',
                  color: isUser ? '#fff' : theme.fg,
                  border: isUser ? 'none' : '1px solid rgba(127,127,127,0.28)',
                  whiteSpace: isUser ? 'pre-wrap' : 'normal',
                }}
              >
                {isUser ? m.text : <MarkdownView blocks={parseMarkdown(m.text)} fg={theme.fg} />}
                {m.offline ? (
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>簡易モード（オフライン）</div>
                ) : null}
                {!isUser && !m.offline && m.provider ? (
                  <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4 }}>via {m.provider}</div>
                ) : null}
              </div>
              {!isUser && m.services && m.services.length > 0 ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {m.services.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => navigateTo(s.id as ServiceId)}
                      style={{ fontSize: 11, borderRadius: 999, padding: '3px 10px' }}
                      title={s.description}
                    >
                      ↗ {s.label}を開く
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {busy ? <div style={{ fontSize: 12, opacity: 0.7 }}>考え中…</div> : null}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 0 6px', flexWrap: 'wrap' }}>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void send(s)}
            disabled={busy}
            style={{ fontSize: 11, borderRadius: 999, padding: '3px 10px' }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* **何が外へ出るかを、送る画面が書く。** この画面はパス 106 の走査から
          漏れていた (走査が action 名を手で書いており `chat` / `chatAll` が
          一覧に無かった) —— この app の主チャットで、しかも「全AI合議」は
          設定済みの全プロバイダへ同時に送る。文面は `shared/aiEgressNotice.ts`。 */}
      <AiEgressNotice
        subject={{
          /*
           * **単位を実装に合わせた** (2026-09-12 · パス 186)。
           *
           * ここは「直近 16 **往復**までの会話」と書いていたが、送っているのは
           * `history.slice(-TURN_WINDOW)` —— 平らな発話の列の**末尾 16 発話**で、
           * 往復 (利用者 + AI の 1 組) に直すと約 8 往復である。つまり断り書きが
           * **送る量を 2 倍に述べていた**。外へ何が出るかの断りなので、
           * 単位を取り違えたままにはしない (パス 101 の「断りが実物とずれる」形)。
           *
           * **1 つのテンプレートリテラルで書く。** 走査 (`aiEgressDisclosed` の
           * `whatOf`) は `what:` の**最初のリテラル**だけを読むので、`+` で
           * 連結すると文の後半が走査から見えなくなる (断りの一部が検査の外に出る)。
           */
          what: `入力した質問文と、直近 ${TURN_WINDOW} 発話までの会話 (利用者と AI の発話を合わせて数えるので約 ${Math.floor(TURN_WINDOW / 2)} 往復。AI の返答を含む。1 発話は先頭 ${MAX_ASSISTANT_CONTENT_CHARS} 字まで) `,
          recipients: egressRecipients,
        }}
      />

      {provider === BEST3_AGENTS ? (
        /*
         * **送り先の言い方は上の断りと同じ内訳から組む** (`egressRecipients`)。別々に判断すると、
         * AI が 1 つも設定されていないとき断りは「端末の外へは出ません」と言い、ここは
         * 「上の送り先へ計 5 回送ります」と言う —— 同じ画面が 2 通りに答える (1 度目はそうだった)。
         */
        <p data-best3-plan style={{ fontSize: 12, margin: '0 0 8px', lineHeight: 1.7 }}>
          {(() => {
            const calls = planCalls(providers.filter((p) => p.configured).map((p) => p.id)).length;
            if (egressRecipients.unknown === true) {
              return (
                <>
                  🏆 ベスト3: 観点の違う回答者 {calls} 人が、<strong>同じ内容を 1 回ずつ</strong>送ります（計 {calls} 回）。
                  送り先は上の断りのとおり、今は確かめられません。
                </>
              );
            }
            if (egressRecipients.remote.length === 0 && (egressRecipients.local ?? []).length === 0) {
              return (
                <>
                  🏆 ベスト3: いま設定済みの AI がありません。送ると回答者 {calls} 人がそれぞれ「未設定」で断られ（外へは出ません）、
                  端末内の簡易応答で答えます。
                </>
              );
            }
            return (
              <>
                🏆 ベスト3: 観点の違う回答者 {calls} 人が、上の送り先へ<strong>同じ内容を 1 回ずつ</strong>送ります（計 {calls} 回・設定済みの AI へ順繰りに割り振り）。
              </>
            );
          })()}
          {' '}採点はこの端末内で行い、上位 {BEST_ANSWERS_COUNT} 件をチャットへ出します。作成中もこの画面を離れて構いません。
        </p>
      ) : null}
      <BestAnswersProgress />
      <CeilingNotice label="入力" value={input} max={MAX_ASSISTANT_CONTENT_CHARS} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        style={{ display: 'flex', gap: 8, paddingTop: 4 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例: 補助金の候補を表で比較して / 創業計画のたたき台を作って"
          aria-label="アシスタントへの入力"
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '1px solid rgba(127,127,127,0.4)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.6)',
            color: '#111',
            fontSize: 14,
          }}
        />
        <button type="submit" className="primary" disabled={busy || !input.trim() || inputOver > 0}>
          送信
        </button>
      </form>
    </div>
  );
}
