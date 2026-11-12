/**
 * **どこに置かれ・どこから読むかの文面** (2026-09-12 · パス 161)。
 *
 * 5 画面がデスクトップのパスを無条件に刷っており、ブラウザ版でも同じ文字列が出ていた
 * (そこへは 1 バイトも書かれず、`~/.claude/skills` は読めない)。
 * ここは「実行形態ごとに別の文になる」ことと、**ブラウザ版がパスを名乗らない**ことを留める。
 */
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_PATHS,
  emptyWatchlistNote,
  exportDestinationNote,
  localReadUnavailableNote,
  persistDestinationNote,
} from '../buildDestinations';

describe('DESKTOP_PATHS', () => {
  it('デスクトップのパスはここだけが持つ (6 本)', () => {
    expect(Object.keys(DESKTOP_PATHS)).toEqual([
      'businessDashboard',
      'stocksState',
      'stocksDashboard',
      'teamRadarSvg',
      'templateSvg',
      'claudeSkills',
    ]);
  });

  it('すべて ~ から始まるホーム相対のパス (走査が当たる形)', () => {
    for (const v of Object.values(DESKTOP_PATHS)) expect(v.startsWith('~/.')).toBe(true);
  });
});

describe('exportDestinationNote', () => {
  it('デスクトップは OS のパスを名乗る', () => {
    expect(exportDestinationNote('desktop', DESKTOP_PATHS.stocksDashboard)).toBe(
      '保存先: ~/.local/business-hub/data/dashboard.html',
    );
  });

  it('★ ブラウザはパスを名乗らず、3 か所を述べる', () => {
    const note = exportDestinationNote('browser', DESKTOP_PATHS.stocksDashboard);
    // **パスを混ぜない** —— 混ぜると「そこを開けば在る」と読める。
    expect(note).not.toContain('~/');
    expect(note).toContain('ダウンロード');
    expect(note).toContain('ライブラリ');
    expect(note).toContain('PC のフォルダ');
  });

  it('★ 同じ引数でも実行形態で別の文になる (畳まれていない)', () => {
    expect(exportDestinationNote('desktop', DESKTOP_PATHS.teamRadarSvg)).not.toBe(
      exportDestinationNote('browser', DESKTOP_PATHS.teamRadarSvg),
    );
  });
});

describe('persistDestinationNote', () => {
  it('デスクトップは state.json を名乗る', () => {
    expect(persistDestinationNote('desktop', DESKTOP_PATHS.stocksState)).toContain(
      '~/.local/business-hub/state.json',
    );
  });

  it('★ ブラウザは「このブラウザの保存領域」と言い、控えの取り方まで書く', () => {
    const note = persistDestinationNote('browser', DESKTOP_PATHS.stocksState);
    expect(note).not.toContain('~/');
    expect(note).toContain('このブラウザの保存領域');
    expect(note).toContain('バックアップ');
  });
});

describe('localReadUnavailableNote', () => {
  it('★ ブラウザでは読めない理由と、代わりの打ち手を言う', () => {
    const note = localReadUnavailableNote('browser', DESKTOP_PATHS.claudeSkills);
    expect(note).not.toBeNull();
    expect(note).toContain('読み取れません');
    expect(note).toContain('単一 HTML');
    expect(note).toContain('デスクトップ版で開く');
  });

  it('デスクトップでは何も言わない (読めるので断りが要らない)', () => {
    expect(localReadUnavailableNote('desktop', DESKTOP_PATHS.claudeSkills)).toBeNull();
  });
});

describe('emptyWatchlistNote', () => {
  it('★ デスクトップは見本に倒すが、ブラウザは空のまま (同じ文で語れない)', () => {
    expect(emptyWatchlistNote('desktop')).toContain('見本');
    expect(emptyWatchlistNote('browser')).toContain('空です');
    expect(emptyWatchlistNote('desktop')).not.toBe(emptyWatchlistNote('browser'));
  });

  it('★ 件数を名乗らない (見本の数は src/main に在り、renderer は import できない)', () => {
    for (const kind of ['desktop', 'browser'] as const) {
      expect(emptyWatchlistNote(kind)).not.toMatch(/\d/);
    }
  });
});

describe('文の作り', () => {
  it('どの文も終止形で終わる (帯に並べて読める)', () => {
    const notes = [
      exportDestinationNote('browser', DESKTOP_PATHS.stocksDashboard),
      persistDestinationNote('desktop', DESKTOP_PATHS.stocksState),
      persistDestinationNote('browser', DESKTOP_PATHS.stocksState),
      localReadUnavailableNote('browser', DESKTOP_PATHS.claudeSkills)!,
      emptyWatchlistNote('desktop'),
      emptyWatchlistNote('browser'),
    ];
    for (const n of notes) expect(n.endsWith('。'), n).toBe(true);
  });
});
