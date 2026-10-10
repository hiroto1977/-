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
 *
 * ## 届く道が開いた (2026-10-08 · パス 507)
 *
 * パス 109 からこの判断は常に断っていた —— 解析器が `params` を 1 度も設定しない
 * ので、音声の確認 (alertdialog) とチャットの `pendingIntent` は**どの発話からも届かない
 * 死んだ UI**だった (パス 506 の実測: 標本 9 発話で届く物 0)。パス 507 で解析器が
 * 生の発話から欄を取り出す (`extractWriteParams` —— 引用の中身・`#channel`・`owner/repo`)
 * ようになり、同じ標本で 5 発話が届く。届くようになったので、ここは 2 つを足した:
 *
 * 1. **必須だけでなく天井も見る** —— 必須欄が揃っても、天井 (`writeFieldLimits.ts` の
 *    台帳・`record-entry` は `MAX_RECORD_NOTE_CHARS`) を超える値や制御文字を含む値は
 *    main / web-shim が断る。確認を取ってから落ちる形へ戻さないため、確認の前に同じ
 *    台帳 (`checkWriteFields`) で見る (`invalid-field`)。
 * 2. **確認は何を送るかを見せる** (`voiceWritePreview`) —— 台帳の docblock が名指しした
 *    非対称 (端末内の書き込みは全部見せてから行い、外への送信は何も見せずに承認を
 *    求めていた) を閉じる。法則 `egress-notice-before-send` と同じ向きで、欄と値は
 *    操作子より前に在る。
 */

import { displayField } from './apiResponse';
import { countChars } from './inputCeiling';
import { MAX_RECORD_NOTE_CHARS } from './recordEntryLimits';
import {
  CALENDAR_EVENT_FIELDS,
  GITHUB_ISSUE_FIELDS,
  SLACK_MESSAGE_FIELDS,
  checkWriteFields,
  describeWriteFieldFailure,
  requiredWriteFields,
  type WriteFieldFailure,
  type WriteFieldRule,
} from './writeFieldLimits';

export interface VoiceWriteRequirement {
  readonly serviceId: string;
  readonly action: string;
  /**
   * 欄の台帳 (必須・天井・改行・選択肢)。外へ書く 3 つは `writeFieldLimits.ts` の台帳
   * そのもの (main の中継が読む物と同じ 1 つ)、`record-entry` は `note` の 1 欄。
   * 確認の前の判定 (`voiceWriteRefusal`) と確認に見せる欄 (`voiceWritePreview`) が読む。
   */
  readonly fields: Readonly<Record<string, WriteFieldRule>>;
  /** main / web-shim の実装が無いと落とす項目 (`fields` から導く —— 手で写さない)。 */
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

/**
 * `record-entry` の欄 (4 サービス共通)。天井は `recordEntryLimits.ts` の 1 つ (main の 4 つの
 * handler と web-shim が「note は 1-2000 文字」と断る当の数) で、本文なので改行を許す。
 */
export const RECORD_ENTRY_NOTE_FIELDS: Readonly<Record<string, WriteFieldRule>> = {
  note: { required: true, max: MAX_RECORD_NOTE_CHARS, multiline: true },
};

function requirement(
  serviceId: string,
  action: string,
  fields: Readonly<Record<string, WriteFieldRule>>,
  screenInput: boolean,
): VoiceWriteRequirement {
  // 必須欄は**書く欄の台帳**から導く —— 写すと片方だけ動く
  // (パス 110 で台帳を作った時に、ここの手書きを導出へ替えた)。
  return { serviceId, action, fields, required: requiredWriteFields(fields), screenInput };
}

export const VOICE_WRITE_REQUIREMENTS: readonly VoiceWriteRequirement[] = [
  requirement('slack', 'send-message', SLACK_MESSAGE_FIELDS, true),
  requirement('github', 'create-issue', GITHUB_ISSUE_FIELDS, true),
  requirement('calendar', 'create-event', CALENDAR_EVENT_FIELDS, true),
  requirement('real-estate', 'record-entry', RECORD_ENTRY_NOTE_FIELDS, true),
  requirement('mutual-funds', 'record-entry', RECORD_ENTRY_NOTE_FIELDS, true),
  requirement('uber-eats', 'record-entry', RECORD_ENTRY_NOTE_FIELDS, false),
  requirement('demae-can', 'record-entry', RECORD_ENTRY_NOTE_FIELDS, false),
];

export function voiceWriteRequirement(
  serviceId: string | undefined,
  action: string | undefined,
): VoiceWriteRequirement | null {
  // `undefined` の門は置かない —— 台帳の行は両方の欄を文字列で持つので、どちらかが `undefined` なら
  // `find` は何にも当たらず `null` になる (門は等価変異で、形ごと消した · 法則 115)。
  return VOICE_WRITE_REQUIREMENTS.find((r) => r.serviceId === serviceId && r.action === action) ?? null;
}

/** 実行を断る理由。`null` は「実行してよい」。 */
export type VoiceWriteRefusal =
  | {
      readonly kind: 'missing-fields';
      readonly missing: readonly string[];
      readonly screenInput: boolean;
    }
  | {
      /** 欄は揃っているが、台帳の天井・改行・選択肢を外れている (main / web-shim が断る値)。 */
      readonly kind: 'invalid-field';
      readonly failure: WriteFieldFailure;
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
  if (missing.length > 0) return { kind: 'missing-fields', missing, screenInput: req.screenInput };
  // 揃っていても、天井・改行・選択肢を外れた値は実行側が断る —— 承認を取ってから落ちる形へ
  // 戻さないため、同じ台帳で先に見る (`checkWriteFields` は台帳の順で最初の問題を返す)。
  const failure = checkWriteFields(params ?? {}, req.fields);
  if (failure !== null) return { kind: 'invalid-field', failure, screenInput: req.screenInput };
  return null;
}

/** 確認に見せる 1 行。`value` は天井 (`MAX_VOICE_PREVIEW_CHARS`) で切り、切ったら `truncated`。 */
export interface VoiceWritePreviewRow {
  readonly field: string;
  readonly value: string;
  readonly truncated: boolean;
}

/**
 * 確認に見せる値の天井。本文の台帳は 20,000 字まで受けるが、確認の窓にその全文は載らない。
 * 切ったことは行が `truncated` で名乗り、画面が「先頭 N 字」と述べる (切ったことを黙らない)。
 */
export const MAX_VOICE_PREVIEW_CHARS = 256;

/**
 * **確認が見せる物** —— 台帳の欄の順に、intent が持つ値を並べる (持たない欄は出さない)。
 * 値は利用者自身の発話だが、確認の窓は 1 画面なので天井で切って `…` を付ける
 * (`displayField` —— 第三者の文字列に使う物と同じ切り方)。
 * 台帳に無い操作は空 (そのとき確認は出ない —— `voiceWriteRefusal` が `unknown-action` で断る)。
 */
export function voiceWritePreview(
  serviceId: string | undefined,
  action: string | undefined,
  params: Readonly<Record<string, string>> | undefined,
): readonly VoiceWritePreviewRow[] {
  const req = voiceWriteRequirement(serviceId, action);
  if (req === null) return [];
  const rows: VoiceWritePreviewRow[] = [];
  for (const field of Object.keys(req.fields)) {
    const v = params?.[field];
    if (v === undefined) continue;
    rows.push({ field, value: displayField(v, MAX_VOICE_PREVIEW_CHARS), truncated: countChars(v) > MAX_VOICE_PREVIEW_CHARS });
  }
  return rows;
}

/**
 * 欄ごとに利用者へ見せる名前と、その欄を音声で言うときの作法。
 *
 * 欄名 (`channel` / `text`) は台帳の英語の名前で、日本語の利用者に見せると読めない
 * (パス 508 の実測: 「channel / text が必要です」)。作法は**実際に通る言い方**だけを書く —— 本文は
 * 引用の中身を取るので「」で囲めば通り、チャンネルは `#名前`、リポジトリは `所有者/名前` で通る
 * (`extractWriteParams`)。引用の無い本文は取らない (推測で埋めない)。
 * 台帳の欄と 1 対 1 で結ぶ検査が `voiceWriteRequirements.test.ts` に在る。
 */
export const FIELD_PHRASES: Readonly<Record<string, { readonly name: string; readonly how: string }>> = {
  channel: { name: 'チャンネル', how: 'チャンネルは「#general」のように # で始まる名前で言ってください' },
  text: { name: '本文', how: '本文は「こんにちは」のように「」で囲んで言ってください' },
  owner: { name: 'リポジトリの所有者', how: 'リポジトリは「a/b」のように 所有者/名前 の形で言ってください' },
  repo: { name: 'リポジトリ', how: 'リポジトリは「a/b」のように 所有者/名前 の形で言ってください' },
  title: { name: '件名', how: '件名は「落ちる」のように「」で囲んで言ってください' },
  summary: { name: '件名', how: '件名は「打合せ」のように「」で囲んで言ってください' },
  note: { name: '記録する内容', how: '記録する内容は「内見の結果」のように「」で囲んで言ってください' },
  // 予定の開始・終了は音声では取らない (日付を推測しない) —— 作法は無く、画面で入力する。
  start: { name: '開始日時', how: '' },
  end: { name: '終了日時', how: '' },
};

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
  if (refusal.kind === 'invalid-field') {
    // 台帳の断りの文 (「note は 2000 文字以内で指定してください」) をそのまま使う ——
    // 実行側が返す文と同じ物なので、確認の前と後で言い分けが割れない。
    const head = `「${label}」の「${action}」は ${describeWriteFieldFailure(refusal.failure)}。この指示では実行しません。`;
    return refusal.screenInput ? `${head} 画面を開いて入力してください。` : `${head} この操作は画面にも入力欄がありません。`;
  }
  const names = refusal.missing.map((k) => FIELD_PHRASES[k]?.name ?? k);
  const hows = [...new Set(refusal.missing.map((k) => FIELD_PHRASES[k]?.how ?? '').filter((h) => h !== ''))];
  // 「取り出せない」は、この指示から取れなかったことだけを言う —— 引用で言えば通る道を
  // 「音声・チャットからは取れない」と書くと、読んだ人は道が無いと思う (パス 508)。
  const head =
    `「${label}」の「${action}」には ${names.join(' / ')} が必要ですが、` +
    'この指示からは取り出せなかったため実行しません。';
  const hint = hows.length > 0 ? ` ${hows.join('。 ')}。` : '';
  return refusal.screenInput
    ? `${head}${hint} 画面を開いて入力してください。`
    : `${head}${hint} この操作は画面にも入力欄がありません。`;
}
