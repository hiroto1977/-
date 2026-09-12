import { charsOverCeiling, refusedCeilingNote } from '../../shared/inputCeiling';

/**
 * **天井を超えた本文について、送る前に画面が述べる 1 文** (2026-09-12 · パス 172)。
 *
 * ## なぜ `maxLength` ではないのか
 *
 * 外へ書く欄 (Slack のメッセージ・issue の本文・下書きのメール・Notion のページ) は
 * パス 110/111 で台帳 `writeFieldLimits.ts` の天井を得たが、画面はそれを
 * **`maxLength` で持っていた** —— ブラウザは `maxLength` を超えた**貼り付けを黙って切る**。
 * 実測 (2026-09-12): 25,000 字の本文を貼ると 20,000 字だけが Notion へ行き、画面は
 * 「作成成功」と言う。**利用者が貼った物と、外部サービスに残る物が違う。**
 * しかも main / ブラウザ版はどちらも `too-long` を断るように書かれているのに、
 * 画面が先に切るのでその断りには**永久に届かない**。
 *
 * パス 168 が同じ形を `EmotionsPage` (AI へ送る本文) で直したときの判断がここでも効く ——
 * **人が本文を貼る欄は、切らずに断る。** 切った本文を外へ送ると、送られた物が
 * 正しく見えるので、切れたことは誰にも見えない。
 *
 * ## 文面は持たない
 *
 * 文は `shared/inputCeiling.ts` の {@link refusedCeilingNote} が 1 つ持つ
 * (パス 168 で寄せた)。ここに在るのは**出す / 出さないの判断と見せ方**だけ ——
 * 画面ごとに ⚠ の書式を書き写すと、パス 101 の「断りがラベルを写してずれる」形になる。
 *
 * `data-ceiling-notice` には**欄の名前を載せる** (パス 175) —— 1 つの画面に 2 つの天井が
 * 在ることがある (`OllamaPage` の prompt と system)。属性の有無で引く検査はそのままで、
 * どちらの欄の断りかを言い分けられる。
 */
export function CeilingNotice({
  label,
  value,
  max,
}: {
  /** 欄の名前 (「本文」「Description」など画面が使っている呼び方)。 */
  readonly label: string;
  /** 欄がいま持っている文字列。 */
  readonly value: string;
  /** 台帳の天井 (数を写さず `writeFieldLimits` から読む)。 */
  readonly max: number;
}) {
  const over = charsOverCeiling(value, max);
  // 超えていないときは**何も描かない** —— 常に字数を出すと、天井が近いことに
  // 気付かせる役には立つが、この節の用は「送れない理由」を言うことである。
  if (over === 0) return null;
  return (
    <div
      data-ceiling-notice={label}
      /* 送れない理由は**読み上げられる**べき —— 画面を見ていない人にも届く
         (`EmotionsPage` がパス 168 で手書きしていた `role="alert"` を、ここへ寄せた・パス 175)。 */
      role="alert"
      style={{ color: 'var(--danger)', fontSize: 12, lineHeight: 1.5 }}
    >
      ⚠ {refusedCeilingNote(label, value.length, max)}
    </div>
  );
}
