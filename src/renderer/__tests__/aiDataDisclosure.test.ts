import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import path from 'node:path';
import {
  AI_EGRESS_RECIPIENT_ANTHROPIC,
  aiEgressNoticeLines,
  remoteOnly,
} from '../../shared/aiEgressNotice';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readOriginalSource(path.join(REPO_ROOT, rel));

const STOCKS_PAGE = read('src/renderer/pages/StocksPage.tsx');
const WEB_SHIM = read('src/renderer/web-shim.ts');

/*
 * **外へ出る物は、出る画面に書く。**
 *
 * 株価アドバイザーは質問文だけでなく、**登録済みウォッチリストのティッカー**を
 * Anthropic へ送る (`callStocksAdvisor` が `loadWatchlistSymbols()` をユニバースに
 * して、system / user 両方のプロンプトへ載せる)。指標そのものはモックだが、
 * **どの銘柄を見ているかは利用者が入れた情報**で、しかも別の目的 (自分の一覧を
 * 作る) で登録したものがここで外部へ出る。
 *
 * このアプリは他の画面では厳しい —— クラウド同期の欄は「データは送信されず」と
 * 書き、保存状態の欄は鍵の由来まで書く (どちらも本セッションで検査を足した)。
 * **AI の画面だけが、何が出るかを書いていなかった** (2026-08-23)。
 *
 * ここは「投資助言ではない」の免責とは別の話 —— あちらは**結果の使い方**、
 * こちらは**入力の行き先**。
 *
 * ## 文面は 2026-09-09 (パス 106) に共有へ移った
 *
 * 「AI の画面」は単数ではなく **5 画面**だった (ここ / BusinessPage /
 * EmotionsPage / GmailPage / SlackPage)。文面を 5 度書かせないため
 * `shared/aiEgressNotice.ts` が 1 か所で持ち、画面は**何を送るか**だけを
 * 自分の言葉で埋める。だからこの検査は「画面が 『送信内容』 という字を持つか」
 * ではなく、**画面が渡した `what` から組み立てた文**を見る —— 綴りの置き場所が
 * 変わっても、利用者が読む文に 3 つの主張が揃っていることを確かめられる。
 * 母集団の走査 (6 つ目の画面が黙って増えないこと) は
 * `pages/__tests__/aiEgressDisclosed.test.ts` が持つ。
 */

/** JSX コメントを落とす (説明文だけ直して画面が変わらない、を防ぐ)。 */
const withoutComments = (src: string): string => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/**
 * この画面が `what` に渡している字面 (次の欄 `recipients:` の手前まで)。
 * 画面の言葉を**画面から**取るので、検査側に文面を書き写さない。
 */
function whatSource(src: string): string {
  const body = withoutComments(src);
  const a = body.indexOf('what:');
  const b = body.indexOf('recipients:', a);
  expect(a, 'what を渡していない').toBeGreaterThan(-1);
  expect(b, 'recipients を渡していない').toBeGreaterThan(a);
  return body.slice(a + 'what:'.length, b);
}

describe('AI へ送る物を、その画面が明示している', () => {
  it('株価アドバイザーの欄が、ウォッチリストの送信を明示している', () => {
    const rendered = withoutComments(STOCKS_PAGE);
    // 断りそのものが在る (文面は共有、置くのは画面)。
    // タグの境目で当てる (`<AiEgressNoticeXX` を断りと数えない)。
    expect(rendered, '断りを描いていない').toMatch(/<AiEgressNotice[\s/>]/);
    // 送り先は共有の定数から読む (名前を 2 通りに書かない)。
    expect(rendered, '送り先を自前で書いている').toContain('AI_EGRESS_RECIPIENT_ANTHROPIC');
    // **画面が渡した what から、利用者が読む文を組み立てて見る。**
    const shown = aiEgressNoticeLines({
      what: whatSource(STOCKS_PAGE),
      recipients: remoteOnly(AI_EGRESS_RECIPIENT_ANTHROPIC),
    }).join('\n');
    expect(shown, '送信内容の記載が無い').toMatch(/送信内容/);
    expect(shown, 'ウォッチリストが出ることを書いていない').toMatch(/ウォッチリスト/);
    expect(shown, '送り先を書いていない').toMatch(/Anthropic/);
  });

  it('走査規則が実物に当たる (what を画面から取れている)', () => {
    // 規則を標本に当てる —— どの入力でも空を返す検査になっていないこと。
    const sample = 'subject={{\n  what: `質問文と、X`,\n  recipients: R,\n}}';
    expect(whatSource(sample)).toContain('質問文と、X');
    // 実物からも空でない字面が取れる。
    expect(whatSource(STOCKS_PAGE).trim().length).toBeGreaterThan(10);
  });

  /*
   * **記載と実装がずれないように、実装側も見る。** 画面に「ウォッチリストを
   * 送る」と書いてあるのに実装が送らない (またはその逆) を防ぐ。
   */
  it('実装が本当にウォッチリストをユニバースにしている (記載が空手形でない)', () => {
    const body = WEB_SHIM.slice(WEB_SHIM.indexOf('async function callStocksAdvisor'));
    const scoped = body.slice(0, body.indexOf('\n}\n'));
    expect(scoped, 'ウォッチリストを読んでいない').toContain('loadWatchlistSymbols()');
    expect(scoped, 'ユニバースをプロンプトへ載せていない').toMatch(/stockAdvisorSystemPrompt\(universe\)/);
  });

  it('指標がモックであることも書いてある (実データと誤解させない)', () => {
    // 画面固有の但し書きなので、共有の文面ではなく画面の what に載る。
    expect(whatSource(STOCKS_PAGE)).toMatch(/モック/);
  });
});
