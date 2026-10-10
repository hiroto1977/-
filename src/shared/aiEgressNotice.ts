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
 * ## 母集団は 5 ではなく 8 だった (2026-09-09 · パス 107 で訂正)
 *
 * パス 106 の走査は `AI_ACTIONS = ['advise', 'analyze-text']` と**手で書いた
 * 一覧**で数えていた。母集団を手で書けば、手で書いた分だけしか見つからない ——
 * 実装から導き直すと 3 つ増えた:
 *
 * | 見落とし | 送る物 | なぜ漏れたか |
 * | --- | --- | --- |
 * | `AssistantPage` | 直近 16 往復の会話文 (`assistant/chat`・`chatAll`) | action 名が `chat` で、私の一覧に無かった |
 * | `SkillsPage` | 入力した指示文 + 選んだスキルの定義 (`skills/run-skill`) | 同上 |
 * | `VillagePage` | **マイクで話した内容の書き起こし** (`assistant/chat`) | 同上 |
 *
 * **数は 3 → 5 → 8 と動いた。** 手で 3 と見立て、パス 106 の (手書きの) 走査が 5 に
 * 訂正し、実装から導いた走査が 8 にした。`AssistantPage` はこの app の主チャットで
 * 「全AI合議」は設定済みの全プロバイダへ同時に送り、`VillagePage` は**声**を外へ出す
 * (しかも AI の切り替えは既定で入っている)。母集団の走査を書いた当のパスが、
 * 最も大きい画面と最も意外な画面を落としていた
 * (パス 85 / 95 と同じ形 —— 数える所を手で書くと、そこが穴になる)。
 * いまは `pages/__tests__/aiEgressDisclosed.test.ts` が
 * `main/clients/*.ts` の `ACTIONS` から**到達可能性で**導く。
 *
 * ## だから送り先は固定の文字列にできない
 *
 * `AssistantPage` / `VillagePage` の送り先は利用者が選ぶ (Anthropic / OpenAI /
 * Gemini / Ollama / 互換エンドポイント) し、「全AI合議」では**複数**へ同時に出る。
 * `VillagePage` は「AI」を切れば送らないので、そのときは「出ません」と書ける ——
 * どちらの判断も `renderer/data/assistantProviders.ts` が 1 か所で持つ。
 * さらに **Ollama は端末内**なので「外へ出ます」と書くと嘘になり、
 * 保管庫が施錠されていて設定状況が読めないときは「未設定 (=出ない)」と
 * 混ぜてはいけない (パス 86 / 87 / 88 で直した形)。
 * よって送り先は {@link AiEgressRecipients} で
 * **外へ出る / 端末内 / 確認できない**を分けて渡す。
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

/**
 * 送り先の内訳。**「外へ出る」「端末内」「確認できない」を混ぜない。**
 *
 * `remote` が空でも「出ない」とは限らない —— 設定状況が読めないときは
 * `unknown: true` で、画面は locality を**主張しない**。
 */
export interface AiEgressRecipients {
  /** 端末の外へ出る送り先の表示名 (空なら外へ出ない)。 */
  readonly remote: readonly string[];
  /** 端末内で処理される送り先 (例: `Ollama (この端末)`)。 */
  readonly local?: readonly string[];
  /**
   * 送り先を**確かめられない**とき true (保管庫が施錠・設定状況の取得に失敗)。
   * `remote: []` を「外へ出ない」と読ませないための欄。
   */
  readonly unknown?: boolean;
}

/** 外部の送り先が 1 つだけ、という最も多い形。 */
export function remoteOnly(name: string): AiEgressRecipients {
  return { remote: [name] };
}

export interface AiEgressSubject {
  /** 送る物を**利用者の言葉**で (例: 「入力したテキスト本文」)。 */
  readonly what: string;
  /** 送り先の内訳 ({@link remoteOnly} が最も多い形)。 */
  readonly recipients: AiEgressRecipients;
  /**
   * 入力欄が**第三者の書いた文面**を貼る誘いをしているか。
   * true なら同意の確認を促す 1 行が増える (`EmotionsPage` の placeholder は
   * 「誰かのメッセージ」を明示的に挙げている)。
   */
  readonly mayIncludeOthers?: boolean;
}

/** 送り先の並べ方を 1 か所に持つ (画面ごとに区切りを変えない)。 */
function joinNames(names: readonly string[]): string {
  return names.join(' / ');
}

/**
 * 断りの行を組み立てる。**画面はこれを刷るだけ**で、文面を持たない。
 *
 * 行に割って返すのは、画面が改行を挟んで並べられるようにするため、そして
 * 検査が**行ごとに**当てられるようにするため (1 本の長い文だと、どの主張が
 * 落ちたのか分からない)。
 */
export function aiEgressNoticeLines(subject: AiEgressSubject): readonly string[] {
  const { remote, local = [], unknown = false } = subject.recipients;
  const lines: string[] = [];
  if (unknown) {
    // **locality を主張しない。** 「読めなかった」を「送らない」と混ぜない。
    lines.push(`送信内容: ${subject.what}が送信されます。`);
    lines.push('送り先を今は確認できません (AI プロバイダの設定状況を読めませんでした)。外部へ出るかどうか、この画面は断言できません。');
  } else if (remote.length === 0) {
    // 端末内だけ (Ollama / 端末内の簡易応答)。**言えることは強く言う。**
    lines.push(`送信内容: ${subject.what}は ${local.length > 0 ? joinNames(local) : 'この端末内'} で処理されます。`);
    lines.push('端末の外へは出ません。');
  } else {
    lines.push(`送信内容: ${subject.what}が ${joinNames(remote)} へ送信されます。`);
    lines.push('この処理は端末内で完結しません。');
    if (local.length > 0) lines.push(`${joinNames(local)} はこの端末内で処理されます。`);
  }
  if (subject.mayIncludeOthers === true) {
    lines.push('第三者が書いた文面を貼る場合は、その人の同意を確認してください。');
  }
  // **書けることだけを書く** (SecurityPage の HIBP の断りと同じ方針)。
  // 送り先が分からない / 端末内で終わるときは、この行そのものが要らない。
  if (remote.length > 0 && !unknown) {
    lines.push(`${joinNames(remote)} 側での取り扱いは、このリポジトリからは確かめられないため主張しません。`);
  }
  return lines;
}
