/**
 * **AI プロバイダの設定状況 —— 読み方と、断りに書く送り先を 1 か所で持つ。**
 *
 * ## なぜ共有するか (2026-09-09 · パス 107)
 *
 * `assistant/chat` を呼ぶ画面は 1 つではない (`AssistantPage` と `VillagePage`)。
 * どちらも「いま何処へ送るのか」を利用者へ書く必要があり、その判断は
 *
 *   - 送り先は利用者が選ぶ (Anthropic / OpenAI / Gemini / Ollama / 互換)
 *   - 「全AI合議」は**設定済みの全プロバイダへ同時に**送る
 *   - **Ollama は端末内**なので「外へ出ます」と書くと嘘になる
 *   - 設定状況が**読めなかった**ときは locality を主張してはいけない
 *
 * という 4 つの分岐を持つ。**同じ判断を 2 度書くと、片方だけ動かしたときに誰も
 * 気付かない** (`advisorQuestionLimits.ts` の注記と同じ理由)。
 *
 * ## 「未設定」と「確認できません」を混ぜない
 *
 * `assistant/providers` は保管庫が施錠されていると `{ ok: false }` を返す
 * (`web-shim.ts` の `callAssistantProviders` が `credsRead.res` をそのまま返す)。
 * `AssistantPage` は 2026-09-09 まで**それを黙って捨てて空配列**にしていた。
 * 空配列は画面では「未設定 = 外へ出ない」と読めるが、`chat` は保存済みの資格情報で
 * **実際に送る**ので、その読みは嘘になる。パス 86 / 87 / 88 で直したのと同じ形 ——
 * **規準は既に下の層に在り、画面が捨てていた。**
 */
import type { AiEgressRecipients } from '../../shared/aiEgressNotice';
import type { ActionData } from '../../shared/actionData';
import type { AiProviderStatus } from '../../shared/ai/credentials';

/**
 * `assistant/providers` アクションが返すプロバイダ設定状況 —— **`shared/ai/credentials.ts` の
 * `AiProviderStatus` そのもの** (パス 116)。2026-09-09 までここに同じ 7 欄を手で写していた
 * (main は `unknown[]` と宣言していたので、写しがずれても誰も気づかない)。
 */
export type ProviderStatus = AiProviderStatus;

/** エージェント選択の特別値: 設定済みの全プロバイダへ同時に質問する合議モード。 */
export const ALL_AGENTS = '__all__';

/**
 * エージェント選択の特別値: **ベストアンサー 3** (2026-09-26)。7 つのエンジニアリングが
 * 裏で協調し、観点の違う回答者を設定済みの AI へ**割り振って**上位 3 件を示す
 * (`data/bestAnswers.ts`)。送り先は合議と同じ集合 (設定済みの全 AI) である。
 */
export const BEST3_AGENTS = '__best3__';

/** 端末内で完結するプロバイダ (宛先は `shared/ollama.ts` の絞りを通る)。 */
const LOCAL_PROVIDER_IDS: readonly string[] = ['ollama'];

export interface ProviderStatusRead {
  readonly providers: readonly ProviderStatus[];
  /** 設定状況を**読めなかった**か (空配列と区別する)。 */
  readonly unknown: boolean;
}

/**
 * 設定状況を読む。**読めなかったことを `unknown` で返す** ——
 * 空配列に丸めない (それが上の注記の欠陥だった)。
 */
export async function readProviderStatuses(): Promise<ProviderStatusRead> {
  const hub = window.serviceHub;
  // bridge が無ければ送る道自体が無い (端末内の簡易応答が答える)。未設定と同じ扱い。
  if (!hub) return { providers: [], unknown: false };
  try {
    const res = await hub.invoke<ActionData<'assistant/providers'>>('assistant', 'providers', {});
    if (res.ok && Array.isArray(res.data.providers)) {
      return { providers: res.data.providers, unknown: false };
    }
    return { providers: [], unknown: true };
  } catch {
    return { providers: [], unknown: true };
  }
}

/**
 * 断りに書く送り先の内訳を決める。**画面はこれを刷るだけ。**
 *
 * `selected` は `''` (既定プロバイダ) / プロバイダ id / {@link ALL_AGENTS}。
 * 指名したプロバイダが未設定なら 0 件 —— そのとき `chat` は失敗し、端末内の
 * 簡易応答が答えるので「外へ出ない」が実際に正しい。
 */
export function assistantEgressRecipients(input: {
  readonly providers: readonly ProviderStatus[];
  readonly providersUnknown: boolean;
  readonly selected: string;
  /** ブラウザ版か (プロキシ経由の提供元を名乗るため)。`null` / 省略は「分からない」= 名乗らない。 */
  readonly browser?: boolean | null;
  /** このページの host 名 (保存した Ollama の URL が同じホストなら端末内として扱う)。 */
  readonly pageHostname?: string;
}): AiEgressRecipients {
  if (input.providersUnknown) return { remote: [], unknown: true };
  const configured = input.providers.filter((p) => p.configured);
  const targets =
    input.selected === ALL_AGENTS || input.selected === BEST3_AGENTS
      ? configured
      : configured.filter((p) => (input.selected ? p.id === input.selected : p.isDefault));
  // 端末内のはずの提供元でも、保存した URL が**端末の外のホスト**を指していれば外へ出る
  // (任意の https ホスト・トンネルを保存できる · パス 529 · AI-N1)。ページと同じホストは端末内のまま。
  const isLocal = (p: ProviderStatus): boolean =>
    LOCAL_PROVIDER_IDS.includes(p.id) && (p.endpointHost === null || p.endpointHost === input.pageHostname);
  const remoteTargets = targets.filter((p) => !isLocal(p));
  // ブラウザ版で CORS 非対応の提供元は、利用者のプロキシを通る。分からないとき (null / 省略) は名乗らない。
  const viaProxy =
    input.browser === true
      ? remoteTargets.filter((p) => !p.browserDirect && !LOCAL_PROVIDER_IDS.includes(p.id)).map((p) => p.label)
      : [];
  return {
    remote: remoteTargets.map((p) => (LOCAL_PROVIDER_IDS.includes(p.id) ? `${p.label} (${p.endpointHost})` : p.label)),
    local: targets.filter(isLocal).map((p) => `${p.label} — この端末、または本アプリと同じホスト`),
    ...(viaProxy.length > 0 ? { viaProxy } : {}),
  };
}
