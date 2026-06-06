/** @vitest-environment jsdom */
/**
 * CloudSyncPanel (round 85) のレンダー回帰テスト。
 *
 * 純粋核 (cloudSync.ts) を実際に動かす最小 UI が render 時にクラッシュしない
 * ことを担保する。renderToStaticMarkup は render を同期実行するため、初期状態
 * (idle / 未同期) の描画で throw する不具合をここで捕捉できる。useEffect は
 * SSR では走らないため副作用アクセスは発生しない。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CloudSyncPanel } from '../CloudSyncPanel';

describe('CloudSyncPanel renders without crashing', () => {
  it('renders the initial (idle / disabled) state to static markup', () => {
    const html = renderToStaticMarkup(createElement(CloudSyncPanel));
    expect(html).toContain('クラウド自動バックアップ');
    // 初期状態は無効 / 待機中 / 未同期。
    expect(html).toContain('無効');
    expect(html).toContain('待機中');
    expect(html).toContain('未同期');
  });

  it('includes the non-destructive safety note (no auto-delete)', () => {
    const html = renderToStaticMarkup(createElement(CloudSyncPanel));
    expect(html).toContain('暗号文のみ');
    expect(html).toContain('自動削除');
  });
});
