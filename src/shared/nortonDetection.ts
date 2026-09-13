/**
 * **Norton 360 を「見た結果」と「見られなかった」を分ける** (2026-09-12 · パス 165)。
 *
 * ## 実測した欠陥
 *
 * `SecurityPage` の Norton 節は `installed` の真偽 1 つだけで描いていた:
 *
 * ```tsx
 * <span className={norton.installed ? 'badge ok' : 'badge warn'}>
 *   {norton.installed ? 'Installed' : 'Not detected'}
 * </span>
 * <span>{norton.platform} · {norton.details}</span>
 * ```
 *
 * ブラウザ版 (単一 HTML) は端末のファイルを読めないので `web-shim` は同梱
 * スナップショットの `installed: false` / `platform: ''` / `details: ''` を返す。
 * jsdom でブラウザ版として描いた実測 (2026-09-12):
 *
 * ```
 *   [badge warn] Not detected   ·
 * ```
 *
 * **警告色の札が「あなたの端末に Norton は無い」と言い、説明は区切りの「·」だけ。**
 * アプリはその端末を 1 度も見ていない。これはパス 86/87/88/159/160 で繰り返し直した
 * 「**読めなかったことを『無い』に畳む**」形で、しかも**ウイルス対策の有無**という
 * 一番畳んではいけない主題である (画面を見た人が「入れ直さないと」と動きうる)。
 *
 * `web-shim` の注記は「これは嘘ではない」と書いていたが、**警告の札は主張である**。
 *
 * ## 4 つの状態
 *
 * | 状態 | 何が起きたか | 札 |
 * | --- | --- | --- |
 * | `found` | 既知のパスに実物が在った | 緑 |
 * | `absent` | **探して**見つからなかった (Windows / macOS) | 警告 |
 * | `unsupported` | その OS に製品が存在しない (Linux) | 中立 |
 * | `unavailable` | **探せない** (ブラウザ版・取得に失敗して同梱値を出しているとき) | 中立 |
 *
 * 警告色は `absent` だけ。`unsupported` / `unavailable` は利用者の端末について
 * 何も主張しないので、色で不安を作らない。
 *
 * 文面をここに 1 つ置くのは、**同じ判断が main・shim・画面の 3 か所に散るのを防ぐ**ため
 * (パス 62/80/113/116 で繰り返した「写しがずれる」形)。
 */

/** Norton 360 の検出結果。`installed` の真偽には畳めない 4 状態。 */
export type NortonDetection = 'found' | 'absent' | 'unsupported' | 'unavailable';

/** 札の文字。`found` だけが英語のままなのは既存の画面表記を保つため。 */
export function nortonBadgeLabel(detection: NortonDetection): string {
  switch (detection) {
    case 'found':
      return 'Installed';
    case 'absent':
      return 'Not detected';
    case 'unsupported':
      return '検出対象外';
    case 'unavailable':
      return '確認できません';
  }
}

/**
 * 札の色。**警告は `absent` だけ** —— 探して無かったときだけが利用者への警告で、
 * 探せなかった / 製品が無い OS は中立。
 */
export function nortonBadgeTone(detection: NortonDetection): 'ok' | 'warn' | 'muted' {
  switch (detection) {
    case 'found':
      return 'ok';
    case 'absent':
      return 'warn';
    case 'unsupported':
    case 'unavailable':
      return 'muted';
  }
}

/**
 * 「探せない」ときの説明。ブラウザ版に固有の理由なので、ここで 1 文にしておく
 * (`buildDestinations.localReadUnavailableNote` と同じ姿勢 —— パス 161)。
 */
export const NORTON_UNAVAILABLE_DETAILS =
  'この実行形態では端末のファイルを読めないため、Norton 360 の有無を確認できません'
  + '（ブラウザ版は単一 HTML で動きます）。デスクトップ版で開くと検出します。';

/**
 * 画面に出す説明。`details` が空でも**区切りだけの行を作らない** ——
 * 実測した欠陥そのものなので、ここで閉じる。
 */
export function nortonDetailsLine(
  detection: NortonDetection,
  platform: string,
  details: string,
): string {
  const body = detection === 'unavailable' && details.trim().length === 0 ? NORTON_UNAVAILABLE_DETAILS : details;
  const parts = [platform.trim(), body.trim()].filter((p) => p.length > 0);
  return parts.join(' · ');
}
