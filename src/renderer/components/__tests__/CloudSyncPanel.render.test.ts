/**
 * CloudSyncPanel (round 85) のレンダー回帰テスト。
 *
 * 純粋核 (cloudSync.ts) の型を使う設定 UI が render 時にクラッシュしないこと
 * を担保する。**送信路はまだ無い** (台帳は `renderer/__tests__/cloudSyncClaims.test.ts`)。
renderToStaticMarkup は render を同期実行するため、初期状態
 * (idle / 未同期) の描画で throw する不具合をここで捕捉できる。useEffect は
 * SSR では走らないため副作用アクセスは発生しない。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CloudSyncPanel } from '../CloudSyncPanel';

describe('CloudSyncPanel renders without crashing', () => {
  it('renders the initial (未接続 / idle / 未同期) state to static markup', () => {
    const html = renderToStaticMarkup(createElement(CloudSyncPanel));
    expect(html).toContain('クラウド自動バックアップ');
    // 2026-08-22: バッジは有効/無効ではなく**未接続**になった。送信路が
    // 無いので「有効」は嘘になる (toggle は接続後の設定を先に置いてあるだけ)。
    expect(html).toContain('未接続');
    expect(html).toContain('待機中');
    expect(html).toContain('未同期');
  });

  /*
   * **押せば「同期した」と読む。** 送信路が無いあいだ、ボタンは無条件で
   * 押せないこと。`disabled={!enabled}` に戻すと、トグルを入れた人が
   * 押せてしまう。
   */
  it('送信路が無いので「今すぐ同期」は押せない', () => {
    const html = renderToStaticMarkup(createElement(CloudSyncPanel));
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain('未実装のため実行できません');
  });

  it('includes the non-destructive safety note (no auto-delete)', () => {
    const html = renderToStaticMarkup(createElement(CloudSyncPanel));
    expect(html).toContain('暗号文のみ');
    expect(html).toContain('自動削除');
  });

  /*
   * 「暗号文のみを送る」は**接続後の設計**であって、いま起きていることでは
   * ない。現在形で読ませないこと —— 利用者が失うのはデータである。
   */
  it('いま送信されていないことを、送信の説明より先に言っている', () => {
    const html = renderToStaticMarkup(createElement(CloudSyncPanel));
    expect(html).toContain('データは送信されず');
    expect(html).toContain('接続後の設計');
    expect(html.indexOf('データは送信されず')).toBeLessThan(html.indexOf('暗号文のみ'));
  });
});
