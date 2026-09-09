/**
 * **音声・チャットから呼べる書き込み操作の必須項目 —— 台帳と、実行してよいかの判断。**
 *
 * ## なぜ要るか (2026-09-09 · パス 109)
 *
 * 音声バーとチャットは書き込み操作を**提案し、確認まで取り、実行して必ず失敗して
 * いた**。実測:
 *
 * | 音声から呼べる操作 | main の必須項目 | intent が渡す物 |
 * | --- | --- | --- |
 * | `slack/send-message` | `channel` · `text` | `{}` |
 * | `github/create-issue` | `owner` · `repo` · `title` | `{}` |
 * | `calendar/create-event` | `summary` · `start` · `end` | `{}` |
 * | `uber-eats` · `demae-can` · `real-estate` · `mutual-funds` の `record-entry` | `note` | `{}` |
 *
 * `VoiceIntent.params` は「将来拡張用; 現状は最小限」と書かれた欄で、
 * **`parseVoiceCommand` は一度も設定しない**。だから
 * `invoke(serviceId, action, intent.params ?? {})` は毎回
 * 「channel and text are required」で落ちる。それでも画面は
 * 「🛠 <サービス> で「<操作>」を実行します」「⚠ 書き込み操作のため、実行前に
 * 確認してください」と述べ、**利用者は起こり得ないことに承認を与えていた**。
 *
 * ## 規準は書類スタジオの取り込みパネルに在った (14 か所目)
 *
 * 経営サマリーからの取り込みは「取り込む前に**入力欄 / 値 / 出所**と注記・
 * 取り込めない物を全部見せ、押すまで localStorage には書かない」。
 * **端末内の書き込みは全部見せてから行い、外への送信は何も見せずに承認を求めて
 * いた。** 非対称そのものが欠陥である。
 *
 * ## 方針
 *
 * 必要な項目を渡せないなら**承認を求めない**。理由 (足りない項目) と次の手
 * (画面で入力する) を述べる。台帳に無い書き込み操作も**実行しない**
 * (fail closed —— `requiresConfirmation` が 2026-08-26 に選んだのと同じ向き)。
 *
 * **ラベルはここに書かない。** サービス名は `services.ts` が持つので、画面が
 * 引いて渡す (パス 101 で「断りがラベルを写して実物とずれる」を直した)。
 */

export interface VoiceWriteRequirement {
  readonly serviceId: string;
  readonly action: string;
  /** main / web-shim の実装が無いと落とす項目 (実装の検査から導いて突き合わせる)。 */
  readonly required: readonly string[];
  /**
   * その操作を**画面から**行えるか (実測)。
   * `slack` / `github` / `calendar` は各画面に入力欄が在り、
   * `real-estate` / `mutual-funds` は `ServiceActionPanel` が載っている。
   * `uber-eats` / `demae-can` は **どちらも無い** ——
   * `ServiceActionPanel` の注記は 4 サービスを挙げているが、載っているのは 2 つ。
   */
  readonly screenInput: boolean;
}

export const VOICE_WRITE_REQUIREMENTS: readonly VoiceWriteRequirement[] = [
  { serviceId: 'slack', action: 'send-message', required: ['channel', 'text'], screenInput: true },
  { serviceId: 'github', action: 'create-issue', required: ['owner', 'repo', 'title'], screenInput: true },
  { serviceId: 'calendar', action: 'create-event', required: ['summary', 'start', 'end'], screenInput: true },
  { serviceId: 'real-estate', action: 'record-entry', required: ['note'], screenInput: true },
  { serviceId: 'mutual-funds', action: 'record-entry', required: ['note'], screenInput: true },
  { serviceId: 'uber-eats', action: 'record-entry', required: ['note'], screenInput: false },
  { serviceId: 'demae-can', action: 'record-entry', required: ['note'], screenInput: false },
];

export function voiceWriteRequirement(
  serviceId: string | undefined,
  action: string | undefined,
): VoiceWriteRequirement | null {
  if (serviceId === undefined || action === undefined) return null;
  return VOICE_WRITE_REQUIREMENTS.find((r) => r.serviceId === serviceId && r.action === action) ?? null;
}

/** 実行を断る理由。`null` は「実行してよい」。 */
export type VoiceWriteRefusal =
  | {
      readonly kind: 'missing-fields';
      readonly missing: readonly string[];
      readonly screenInput: boolean;
    }
  | { readonly kind: 'unknown-action' };

/**
 * 書き込み操作を実行してよいか。**足りない項目が 1 つでも在れば断る。**
 *
 * 台帳に無い操作は `unknown-action` で断る (fail closed) ——
 * 新しい書き込みを音声から呼べるようにしたのに必須項目を書き忘れた、が
 * 「黙って invoke して落ちる」に戻らないため。
 */
export function voiceWriteRefusal(
  serviceId: string | undefined,
  action: string | undefined,
  params: Readonly<Record<string, string>> | undefined,
): VoiceWriteRefusal | null {
  const req = voiceWriteRequirement(serviceId, action);
  if (req === null) return { kind: 'unknown-action' };
  const missing = req.required.filter((k) => {
    const v = params?.[k];
    return v === undefined || v.trim() === '';
  });
  if (missing.length === 0) return null;
  return { kind: 'missing-fields', missing, screenInput: req.screenInput };
}

/**
 * 断りの文面。**ラベルは呼び出し側が `services.ts` から引いて渡す。**
 *
 * 行に割らないのは、音声パネルもチャットも 1 つの但し書き欄に収めるため
 * (`aiEgressNoticeLines` は帯なので行に割る —— 用途が違う)。
 */
export function voiceWriteRefusalMessage(
  label: string,
  action: string,
  refusal: VoiceWriteRefusal,
): string {
  if (refusal.kind === 'unknown-action') {
    return `「${label}」の「${action}」に必要な項目が分からないため実行しません。`;
  }
  const head =
    `「${label}」の「${action}」には ${refusal.missing.join(' / ')} が必要ですが、` +
    '音声・チャットの指示からは取り出せないため実行しません。';
  return refusal.screenInput
    ? `${head} 画面を開いて入力してください。`
    : `${head} この操作は画面にも入力欄がありません。`;
}
