import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

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
 */

describe('AI へ送る物を、その画面が明示している', () => {
  it('株価アドバイザーの欄が、ウォッチリストの送信を明示している', () => {
    // コメントは数えない (説明文だけ直して画面が変わらない、を防ぐ)。
    const rendered = STOCKS_PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(rendered, '送信内容の記載が無い').toMatch(/送信内容/);
    expect(rendered, 'ウォッチリストが出ることを書いていない').toMatch(/ウォッチリスト/);
    expect(rendered, '送り先を書いていない').toMatch(/Anthropic/);
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
    const rendered = STOCKS_PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(rendered).toMatch(/モック/);
  });
});
