/**
 * エージェント設定パネルの入力欄を、**アプリが読む欄から導く** (2026-09-24 · パス 450)。
 *
 * ## 見つけ方と実測 (直す前)
 *
 * パス 449 の技 (**面の側から数え、読み手が在って書き手が 0 件の物を探す**) を
 * localStorage の外へ当てた。`AiCredentials` は文字列の欄を **11** 持ち、
 * `configForProvider` がそれを `AiProviderConfig` へ載せ、`resolveModel` が
 * `req.model ?? cfg.model ?? spec.defaultModel` の 2 段目として読む ——
 * つまり**どのモデルを呼ぶかを決める欄**である。ところが画面のフォームは
 * **手書きの 8 欄**だった。実測 (2026-09-24 · 出荷コードの走査・注記は落とす):
 *
 * | 欄 | 出荷コードの出現 | 書き手 |
 * | --- | ---: | --- |
 * | `ollamaModel` / `compatModel` | 7〜9 | **画面に入力欄が在る** |
 * | **`anthropicModel`** | **3** | **0 件** (宣言・受理一覧・読み手だけ) |
 * | **`openaiModel`** | **3** | **0 件** |
 * | **`geminiModel`** | **3** | **0 件** |
 *
 * ★ **非対称が逆を向いていた** —— 利用者が自分でモデルを選んでから使う側
 * (端末内の Ollama・自分で建てた互換サーバ) には入力欄が在り、**提供者が
 * 自分の都合でモデルを退役させる側 (クラウドの 3 つ) に無い**。
 *
 * ★ **欄は書ければ効く** (実測・偽の fetch で要求の本体を読む): 欄が無いときは
 * `spec.defaultModel` がそのまま要求の `model` になり、`anthropicModel` に別の
 * 名前を置くとその名前が載る。つまりアプリは**つまみを作ってあり、回す口だけが
 * 無かった**。(モデル ID は写さない —— `lint:forbidden` の当の規則であり、
 * パス 450 で私の実測の引用がその場で捕まった。)
 *
 * ★ **パネルの一文が事態を 1 段重くしていた** ——「空欄は未変更ではなく「未設定」
 * として保存」。保存はフォームの 8 欄から組んだ JSON の**まるごと置き換え**なので、
 * 他の手段でこの 3 欄を置いた人が居ても**次にパネルを保存した時点で消える**。
 * 消えたあと、入力欄が無いので**戻す手が無い** (法則 `escape-hatch-stays-open`)。
 *
 * ★ **既定が拒まれたときの文は正しい** (実測):
 * `Claude (Anthropic) API 404: {"type":"error",…"message":"model: claude-sonnet-4-6"}`
 * —— 本文は `redactForMessage` の梯子を通っており、モデル名も出る。
 * **足りなかったのは逃げ口のほう**で、読んだ人が直しに行ける場所が無かった。
 *
 * ## 直し
 *
 * 入力欄の一覧をここに 1 つ置き、**母集団は `AI_CREDENTIAL_STRING_KEYS`**
 * (= 受理して読む欄) から導く。画面はこの表から組み、フォームの型もこの表から
 * 導くので、12 個目の欄が足された日は「表に書け」と検査が鳴る (両方向)。
 *
 * ★ **既定モデルの綴りは写さない** —— placeholder は `AI_PROVIDERS[id].defaultModel`
 * を読む。写すと既定を変えた日に**画面だけが古い名前を案内する** (パス 449 で
 * 期待値を `DEFAULT_SETUP_MODEL` から導いたのと同じ判断)。`ollamaModel` の
 * placeholder は 2026-09-24 まで `'llama3.2'` の手書きで、**既定と同じ綴りの写し**
 * だった —— この表へ寄せたので写しが 1 つ減る。
 */
import { AI_CREDENTIAL_STRING_KEYS, type AiCredentialStringKey } from '../../shared/ai/credentials';
import { AI_PROVIDERS } from '../../shared/ai/providers';

export interface AiCredentialField {
  readonly key: AiCredentialStringKey;
  /** 画面に見える文字列。 */
  readonly label: string;
  /** 読み上げ用。ラベルが括弧つきでも、操作子の名前は短く保つ。 */
  readonly aria: string;
  readonly placeholder: string;
  /** 秘密なら伏せて入力する (`type="password"` + `autoComplete="off"`)。 */
  readonly secret: boolean;
}

/** モデル欄の placeholder は既定モデルそのもの (綴りを写さない)。 */
const defaultModelOf = (id: keyof typeof AI_PROVIDERS): string => AI_PROVIDERS[id].defaultModel;

export const AI_CREDENTIAL_FIELDS: readonly AiCredentialField[] = [
  {
    key: 'anthropic',
    label: 'Anthropic API キー',
    aria: 'Anthropic API キー',
    placeholder: 'sk-ant-…',
    secret: true,
  },
  {
    key: 'anthropicModel',
    label: 'Claude モデル (任意)',
    aria: 'Claude モデル',
    placeholder: defaultModelOf('anthropic'),
    secret: false,
  },
  {
    key: 'openai',
    label: 'OpenAI API キー (ChatGPT)',
    aria: 'OpenAI API キー',
    placeholder: 'sk-…',
    secret: true,
  },
  {
    key: 'openaiModel',
    label: 'ChatGPT モデル (任意)',
    aria: 'ChatGPT モデル',
    placeholder: defaultModelOf('openai'),
    secret: false,
  },
  {
    key: 'gemini',
    label: 'Google Gemini API キー',
    aria: 'Google Gemini API キー',
    placeholder: 'AIza…',
    secret: true,
  },
  {
    key: 'geminiModel',
    label: 'Gemini モデル (任意)',
    aria: 'Gemini モデル',
    placeholder: defaultModelOf('gemini'),
    secret: false,
  },
  {
    key: 'ollamaUrl',
    label: 'Ollama URL (ローカル)',
    aria: 'Ollama URL',
    placeholder: 'http://127.0.0.1:11434',
    secret: false,
  },
  {
    key: 'ollamaModel',
    label: 'Ollama モデル (任意)',
    aria: 'Ollama モデル',
    placeholder: defaultModelOf('ollama'),
    secret: false,
  },
  {
    key: 'compatUrl',
    label: '互換 API ベース URL (LiteLLM / Groq 等)',
    aria: '互換 API ベース URL',
    placeholder: 'http://localhost:4000 または https://…/openai/v1',
    secret: false,
  },
  {
    key: 'compatKey',
    label: '互換 API キー (任意)',
    aria: '互換 API キー',
    placeholder: 'キー不要のサーバーは空欄',
    secret: true,
  },
  {
    key: 'compatModel',
    // 既定が空 (`AI_PROVIDERS.compat.defaultModel === ''`) なので必須。
    // placeholder は導けないので例を書く。
    label: '互換 API モデル',
    aria: '互換 API モデル',
    placeholder: '例: groq/llama-3.3-70b',
    secret: false,
  },
];

/** フォームの器。`default` (プロバイダ選択) だけは `<select>` なので別に持つ。 */
export type AiCredentialFormValues = Record<AiCredentialStringKey, string> & { default: string };

/** 空のフォーム。**欄は一覧から導く** (手で並べると表と食い違う)。 */
export function emptyAiCredentialForm(): AiCredentialFormValues {
  const out = { default: '' } as AiCredentialFormValues;
  for (const key of AI_CREDENTIAL_STRING_KEYS) out[key] = '';
  return out;
}
