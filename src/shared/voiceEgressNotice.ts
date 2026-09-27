/**
 * **マイクの声について書く断り —— 文面を 1 か所だけ持つ。**
 *
 * ## なぜ要るか (2026-09-09 · パス 108)
 *
 * この app には**マイクの入口が 2 つ**ある:
 *
 * | 入口 | どこに在るか | 断り |
 * | --- | --- | --- |
 * | `VoiceCommandBar` | `App.tsx` に載っているので**全画面** | **無かった** |
 * | `VillagePage` の「話しかける」 | 村の画面 | **無かった** |
 *
 * パス 106〜107 で AI へ送る 8 画面に断りを足したが、**声は書き起こす前から
 * 端末を出ている可能性がある**。`voice/speechAdapter.ts` は
 * `SpeechRecognition ?? webkitSpeechRecognition` を使う薄いラッパで、
 * **認識をどこで行うかはブラウザが決める** —— この app は経路を選べない。
 * ティッカー記号を断っている画面が在り、**マイクの音声を断っていない入口が
 * 全画面に在った**。
 *
 * ## 書けることだけを書く (`SecurityPage` の HIBP と同じ方針)
 *
 * このリポジトリから確かめられるのは
 *
 *   - **ブラウザの機能に委ねている**こと (`speechAdapter.ts` がそれだけをする)
 *   - 押している間だけ聞き取ること (`start` / `abort` の対応)
 *   - 書き起こした文を端末内で解釈すること (`voiceCommand.ts` は純粋関数)
 *   - 音声から実行できる操作が `VOICE_ACTIONS` の 7 サービスに限られ、
 *     **AI の action は含まれない**こと (検査が実装から導いて確かめる)
 *   - 実行前に必ず確認を出すこと (`requiresConfirmation` は 2026-08-26 から
 *     fail closed で、`isExecutableIntent && !requiresConfirmation` が空である
 *     ことをゲートが留めている)
 *
 * 確かめられないのは**ブラウザがどこで認識するか**である。だから
 * 「送られます」と断定もせず、「端末内で完結します」とも言わない ——
 * **選べないことと、確かめられないことを、そのまま書く。**
 * 提供元の名前 (どのブラウザが何をするか) も書かない ——
 * このリポジトリからは確かめられないので。
 */

/** 認識を担う仕組み。名前を 2 通りに書かない。 */
export const VOICE_RECOGNITION_MECHANISM = 'ブラウザの音声認識 (Web Speech API)';

export interface VoiceEgressSubject {
  /**
   * 書き起こした文が**端末内で解釈されるだけ**か。
   *
   * `VoiceCommandBar` は true (解釈してコマンドにする。ただし送信系の操作を
   * 選べば、その内容は対象のサービスへ渡る —— 実行前に確認が出る)。
   * `VillagePage` は false —— 文は AI へ送られるので、その行き先は隣の
   * `AiEgressNotice` が**送り先の内訳つきで**述べる (ここで重ねると、
   * 2 か所が別々の送り先を書く形になる)。
   */
  readonly transcriptStaysLocal: boolean;
}

/**
 * 断りの行を組み立てる。**画面はこれを刷るだけ**で、文面を持たない。
 *
 * 行に割って返すのは `aiEgressNoticeLines` と同じ理由 —— 検査が行ごとに
 * 当てられるようにするため。
 */
export function voiceEgressNoticeLines(subject: VoiceEgressSubject): readonly string[] {
  const lines = [
    `マイクは押している間だけ聞き取り、話した内容を ${VOICE_RECOGNITION_MECHANISM} で文字にします。`,
    '変換をどこで行うかはブラウザが決めます —— 実装によっては音声そのものがブラウザの提供元へ送られ、この app は経路を選べません。',
    'そのため「端末内で完結する」とは言えず、提供元での取り扱いも、このリポジトリからは確かめられないため主張しません。',
  ];
  if (subject.transcriptStaysLocal) {
    lines.push(
      '書き起こした文は端末内で解釈してコマンドにします (AI へは送りません)。送信系の操作を選んだときはその内容が対象のサービスへ渡り、実行前に確認が出ます。',
    );
  }
  return lines;
}
