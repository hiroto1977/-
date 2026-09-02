/**
 * 「今日」の日付 —— **利用者の時計で** YYYY-MM-DD。
 *
 * `new Date().toISOString().slice(0, 10)` は UTC の日付を返す。日本 (UTC+9) では
 * 0 時から 9 時までの間、**前日**になる。2026-09-02 の総当たりで 13 か所がこれを
 * 「今日」として使っていた —— 経営レポートの作成日、Shopify 取り込みの売上日
 * (月初の未明の注文が前月に付く)、福祉の説明資料の日付、気分ログの折れ線の
 * 日付キー (保存側は利用者の時計で書くので、朝は今日の記録が図から消える)。
 *
 * ここに 1 つだけ置く。`emotions.ts` と `emotionsWeb.ts` が同じ関数を別々に
 * 持っていたので寄せた (同じ判断を 2 か所に書くと、必ずどちらかが欠ける)。
 *
 * 瞬間 (epoch) を日付にするときも、利用者に見せるなら同じ関数でよい
 * (`localIsoDate(new Date(ms))`)。API へ渡す UTC の日付はここでは扱わない。
 */
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
