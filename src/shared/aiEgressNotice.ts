/**
 * **AI へ何を送るかの断り —— 文面を 1 か所だけ持つ。**
 *
 * ## なぜ要るか (2026-09-09 · パス 106)
 *
 * この app は **5 つの画面**から利用者のデータを Anthropic へ送る。実測すると、
 * **断りが在るのは 1 つだけ**だった:
 *
 * | 画面 | 送る物 | 断り |
 * | --- | --- | --- |
 * | `StocksPage` | 質問文 + ウォッチリストのティッカー | **在った** (2026-08-23) |
 * | `BusinessPage` | 質問文 + **各事業の KPI・売上トレンド (JSON)** | **無かった** |
 * | `EmotionsPage` | **貼り付けた本文そのまま** | **無かった** |
 * | `GmailPage` | 受信スレッドの**件名と送信者のメールアドレス** | **無かった** |
 * | `SlackPage` | チャンネル名と目的 (purpose) | **無かった** |
 *
 * **5 という数は走査が教えた。** 私は 3 画面だと思って直し、
 * `pages/__tests__/aiEgressDisclosed.test.ts` の走査を書いたら `GmailPage` と
 * `SlackPage` が落ちた —— どちらも `invoke('emotions', 'analyze-text', …)` を呼んで
 * **`emotions` の action を借りている**ので、「AI らしい名前の画面」で数えると漏れる。
 *
 * `EmotionsPage` が最も重い。入力欄の placeholder が
 * 「分析したいテキストを貼り付け — メール本文、**自分の日記**、**誰かのメッセージ**など」
 * と、最も秘めた内容と**第三者の文面**を明示的に誘っている。ティッカー記号を断って
 * いる画面が在り、日記を断っていない画面が在った。
 *
 * しかも `StocksPage` に断りを足したときのコメントはこう書いてある ——
 * 「このアプリは他の画面 (クラウド同期・保存状態) では『何が送られないか』まで
 * 書いているのに、**AI の画面**だけ書いていなかった (2026-08-23)」。
 * **「AI の画面」を単数として扱っており、実際は 5 つ在った** (パス 66 と同じ形)。
 *
 * ## 手本は SecurityPage の HIBP の断り
 *
 * 同じリポジトリの `SecurityPage` は正しく書けている —— 第三者の名前を出し、
 * **端末内で完結しないこと**を明言し、ブラウザ版でプロキシ運用者にも見えることまで
 * 書き、そして
 *
 *     書けることだけを書く —— HIBP 側が検索語をどう扱うかはこのリポジトリからは
 *     確かめられないので**主張しない**。確かなのは「送られる」ことと
 *     「経路に誰が居るか」である。
 *
 * この方針をそのまま借りる。**受け取った側がどう扱うかは書かない。**
 *
 * ## プロキシは経由しない (実測して確かめた)
 *
 * Anthropic への呼び出しは `web-shim.ts` の `timedFetchAi` が
 * `https://api.anthropic.com/v1/messages` を**直接**叩く。`fetchViaProxy` を通るのは
 * notion / atlassian / cloudflare だけなので、**AI の画面でプロキシ運用者の話を
 * 書くと嘘になる**。HIBP の断りから文面を借りるときに、この 1 行だけは持ってこない。
 */

/** 送り先の第三者。名前を 2 通りに書かない。 */
export const AI_EGRESS_RECIPIENT_ANTHROPIC = 'Anthropic (Claude API)';

export interface AiEgressSubject {
  /** 送る物を**利用者の言葉**で (例: 「入力したテキスト本文」)。 */
  readonly what: string;
  /** 送り先の第三者 ({@link AI_EGRESS_RECIPIENT_ANTHROPIC})。 */
  readonly recipient: string;
  /**
   * 入力欄が**第三者の書いた文面**を貼る誘いをしているか。
   * true なら同意の確認を促す 1 行が増える (`EmotionsPage` の placeholder は
   * 「誰かのメッセージ」を明示的に挙げている)。
   */
  readonly mayIncludeOthers?: boolean;
}

/**
 * 断りの行を組み立てる。**画面はこれを刷るだけ**で、文面を持たない。
 *
 * 行に割って返すのは、画面が改行を挟んで並べられるようにするため、そして
 * 検査が**行ごとに**当てられるようにするため (1 本の長い文だと、どの主張が
 * 落ちたのか分からない)。
 */
export function aiEgressNoticeLines(subject: AiEgressSubject): readonly string[] {
  const lines = [
    `送信内容: ${subject.what}が ${subject.recipient} へ送信されます。`,
    'この処理は端末内で完結しません。',
  ];
  if (subject.mayIncludeOthers === true) {
    lines.push('第三者が書いた文面を貼る場合は、その人の同意を確認してください。');
  }
  // **書けることだけを書く** (SecurityPage の HIBP の断りと同じ方針)。
  lines.push(`${subject.recipient} 側での取り扱いは、このリポジトリからは確かめられないため主張しません。`);
  return lines;
}
