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

/** `assistant/providers` アクションが返すプロバイダ設定状況。 */
export interface ProviderStatus {
  readonly id: string;
  readonly label: string;
  readonly configured: boolean;
  readonly isDefault: boolean;
  readonly browserDirect: boolean;
  readonly needsApiKey: boolean;
  readonly defaultModel: string;
}

/** エージェント選択の特別値: 設定済みの全プロバイダへ同時に質問する合議モード。 */
export const ALL_AGENTS = '__all__';

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
    const res = await hub.invoke<{ providers: ProviderStatus[] }>('assistant', 'providers', {});
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
}): AiEgressRecipients {
  if (input.providersUnknown) return { remote: [], unknown: true };
  const configured = input.providers.filter((p) => p.configured);
  const targets =
    input.selected === ALL_AGENTS
      ? configured
      : configured.filter((p) => (input.selected ? p.id === input.selected : p.isDefault));
  return {
    remote: targets.filter((p) => !LOCAL_PROVIDER_IDS.includes(p.id)).map((p) => p.label),
    local: targets
      .filter((p) => LOCAL_PROVIDER_IDS.includes(p.id))
      .map((p) => `${p.label} — この端末、または本アプリと同じホスト`),
  };
}
