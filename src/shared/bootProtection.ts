/**
 * **起動の守りの点検** (2026-11-16)。
 *
 * ブートセクタ型 (電源を入れた直後・OS より先に動く) のウイルスを、このアプリは
 * **取り除けない** —— アプリが動き出すのは OS が起動した後だからである。それを止めるのは
 * 端末の「確認つき起動」(PC の セキュアブート / Android の 確認付きブート) で、起動のたびに
 * 起動用のプログラムの署名を検める。だからここがするのは **その守りが有効かを点検すること** と、
 * 端末ごとの確かめ方を示すことまでである (できない事をできると言わない)。
 *
 * ## 状態は「見た結果」と「見られなかった」を分ける
 *
 * `shared/nortonDetection.ts` (パス 165) と同じ形 —— 警告色は **見て・無効だった** ときだけ。
 *
 * | 状態 | 何が起きたか | 札 |
 * | --- | --- | --- |
 * | `enabled` | ファームウェアの変数を読み、セキュアブートが有効だった | 緑 |
 * | `disabled` | 読んで、無効だった | 警告 |
 * | `not-exposed` | UEFI の変数が見えない (旧式の BIOS 起動・仮想環境など) | 中立 |
 * | `unknown` | 変数は在るが読めない・想定外の中身 | 中立 |
 * | `manual` | この OS では自動で読まない (Windows / macOS) —— 手順を示す | 中立 |
 * | `unavailable` | 端末を読めない実行形態 (ブラウザ版・取得に失敗して同梱値のとき) | 中立 |
 *
 * 文面をここに 1 つ置くのは、同じ判断が main・shim・画面に散るのを防ぐためである。
 */

/** 起動の守りの点検結果。真偽には畳めない 6 状態。 */
export type BootProtection = 'enabled' | 'disabled' | 'not-exposed' | 'unknown' | 'manual' | 'unavailable';

const BOOT_STATES: readonly BootProtection[] = ['enabled', 'disabled', 'not-exposed', 'unknown', 'manual', 'unavailable'];

/**
 * 取得した値から状態を読む。知らない値・欠けた値は `unavailable` —— 読めない物を「有効」とも「無効」とも言わない
 * (古い版の主プロセスが返す payload にはこの欄が無い)。
 */
export function bootProtectionOf(status: unknown): BootProtection {
  if (typeof status !== 'object' || status === null) return 'unavailable';
  const detection: unknown = (status as { detection?: unknown }).detection;
  return BOOT_STATES.find((s) => s === detection) ?? 'unavailable';
}

/** 札の文字。 */
export function bootBadgeLabel(detection: BootProtection): string {
  switch (detection) {
    case 'enabled':
      return 'セキュアブート 有効';
    case 'disabled':
      return 'セキュアブート 無効';
    case 'not-exposed':
      return '確認できません';
    case 'unknown':
      return '読み取れません';
    case 'manual':
      return '手動で確認';
    case 'unavailable':
      return '確認できません';
  }
}

/** 札の色。**警告は `disabled` だけ** —— 読んで無効だったときだけが利用者への警告である。 */
export function bootBadgeTone(detection: BootProtection): 'ok' | 'warn' | 'muted' {
  switch (detection) {
    case 'enabled':
      return 'ok';
    case 'disabled':
      return 'warn';
    case 'not-exposed':
    case 'unknown':
    case 'manual':
    case 'unavailable':
      return 'muted';
  }
}

/** 状態ごとの説明 (1 文)。端末について、見ていない事を主張しない。 */
export function bootDetailsLine(detection: BootProtection): string {
  switch (detection) {
    case 'enabled':
      return 'この端末は、起動のたびに起動用プログラムの署名を確かめています。';
    case 'disabled':
      return 'この端末は、起動用プログラムの署名を確かめていません。下の手順で有効にできるか確認してください。';
    case 'not-exposed':
      return 'UEFI の情報が見えません（旧式の BIOS 起動・仮想環境など）。下の手順で端末の設定を確認してください。';
    case 'unknown':
      return 'セキュアブートの状態を読み取れませんでした。下の手順で端末の設定を確認してください。';
    case 'manual':
      return 'この OS では自動で読み取りません。下の手順で確認してください。';
    case 'unavailable':
      return 'この実行形態では端末の設定を読めません（ブラウザ版は単一 HTML で動きます）。下の手順で確認してください。';
  }
}

/**
 * Linux の UEFI 変数 `SecureBoot-…` の中身から状態を読む。
 *
 * efivarfs のファイルは **先頭 4 byte が属性・5 byte 目が値** (1 = 有効 / 0 = 無効)。
 * 5 byte に満たない・値が 0 / 1 以外は `unknown` —— 読めない物を「無効」と言わない。
 */
export function secureBootFromEfiVar(bytes: Uint8Array): BootProtection {
  if (bytes.length < 5) return 'unknown';
  const value = bytes[4];
  if (value === 1) return 'enabled';
  if (value === 0) return 'disabled';
  return 'unknown';
}

/** 端末ごとの確かめ方 1 件。 */
export interface BootCheckGuide {
  readonly device: string;
  readonly steps: readonly string[];
}

/**
 * 端末ごとの確かめ方。**アプリが代わりに設定を変えることは無い** —— 利用者が自分の端末で見る手順だけを書く。
 */
export const BOOT_CHECK_GUIDES: readonly BootCheckGuide[] = [
  {
    device: 'Android のスマホ・タブレット',
    steps: [
      '確認付きブートは最初から有効です（利用者が切り替える設定はありません）。',
      '電源を入れた直後に「ブートローダーがロック解除されています」などの警告画面が毎回出るなら、起動の守りが外れています。購入店かメーカーへ相談してください。',
      '「設定」からシステム（ソフトウェア）のアップデートを最新にしてください。',
    ],
  },
  {
    device: 'Windows のパソコン',
    steps: [
      'スタートで「システム情報」を開き、「セキュア ブートの状態」が「有効」かを見ます。',
      '「Windows セキュリティ」→「デバイス セキュリティ」にも同じ表示があります。',
      '「無効」のときは、パソコンのメーカーの案内に沿って UEFI の設定で有効にします。',
    ],
  },
  {
    device: 'Mac',
    steps: [
      'Apple シリコン・T2 チップ搭載の Mac は、起動のたびに OS の署名を確かめます（標準は「完全なセキュリティ」）。',
      '変更した覚えがなければ、そのままで有効です。確認は「起動セキュリティユーティリティ」で行えます。',
    ],
  },
  {
    device: 'Linux のパソコン',
    steps: [
      'デスクトップ版のこの画面が、UEFI の変数を読んで上に表示します。',
      '端末では「mokutil --sb-state」でも確認できます。',
    ],
  },
];

/** どの端末にも当てはまる心がけ。 */
export const BOOT_HABITS: readonly string[] = [
  'OS と本体のソフトウェア（BIOS / UEFI・ファームウェア）を最新に保つ。',
  '出どころの分からない USB メモリ・外付けディスクを挿したまま電源を入れない。',
  '起動直後に「ウイルスに感染しました」「今すぐ電話を」と出る画面は、多くが偽の警告です。電話をかけず、画面のボタンも押さず、ウイルス対策ソフトで調べてください。',
];

/** この点検にできる事・できない事 (画面にそのまま出す)。 */
export const BOOT_PROTECTION_LIMITS =
  'このアプリは OS が起動した後に動くので、起動より前に動くウイルス（ブートセクタ型）を取り除くことはできません。'
  + 'それを防ぐのは端末の「確認つき起動」です。ここでは、その守りが有効かの点検と確かめ方だけを示します。';
