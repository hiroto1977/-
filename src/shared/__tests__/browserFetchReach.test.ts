/**
 * **ブラウザ版で実データを取得できない連携先の画面は、そう案内する (赤い失敗にしない)。**
 *
 * 判定は `shared/browserFetchReach.ts` の 1 つ。橋 (`web-shim.ts`) と画面 (`StatusBar`) が同じ関数と
 * 同じ 1 文を読む。ここは純関数の側を値ごと留める (橋と画面は `renderer/__tests__/browserRemoteFetchReach.test.ts` と
 * `renderer/components/__tests__/statusBarFetchUnsupported.test.ts`)。
 */
import { describe, expect, it } from 'vitest';
import {
  BROWSER_FETCH_UNSUPPORTED_NOTE,
  BROWSER_LIVE_READ_SERVICES,
  browserFetchUnsupportedNote,
  browserReadsLive,
} from '../browserFetchReach';
import { SERVICE_DATA_ORIGIN, originOf } from '../dataOrigin';
import { isServiceId } from '../serviceId';

const REMOTE = Object.entries(SERVICE_DATA_ORIGIN)
  .filter(([, origin]) => origin === 'remote')
  .map(([id]) => id)
  .sort();

describe('ブラウザ版から読める連携先の一覧', () => {
  it('9 件を値ごと留める (凍結・昇順)', () => {
    expect([...BROWSER_LIVE_READ_SERVICES]).toEqual([
      'asana',
      'cursor',
      'discord',
      'dropbox',
      'line',
      'linear',
      'quality',
      'sentry',
      'stripe',
    ]);
    expect(Object.isFrozen(BROWSER_LIVE_READ_SERVICES)).toBe(true);
  });

  it('どれも実在する連携先 (remote) のサービス', () => {
    for (const id of BROWSER_LIVE_READ_SERVICES) {
      expect(isServiceId(id), id).toBe(true);
      expect(isServiceId(id) ? originOf(id) : null, id).toBe('remote');
    }
  });

  it('browserReadsLive は一覧の物だけ真 (他の id・prototype の鍵は偽)', () => {
    for (const id of BROWSER_LIVE_READ_SERVICES) expect(browserReadsLive(id), id).toBe(true);
    for (const id of ['github', 'gmail', 'kpi', '', 'constructor', '__proto__', 'length']) {
      expect(browserReadsLive(id), id).toBe(false);
    }
  });
});

describe('案内の文', () => {
  it('★ 文を値ごと留める (取得できない・どこで取得できるか・いま出ている物は何か、の 3 つを言う)', () => {
    expect(BROWSER_FETCH_UNSUPPORTED_NOTE).toBe(
      'ブラウザ版では、この画面の実データを取得できません（取得はデスクトップ版の機能です）。表示しているのは見本です。',
    );
  });

  it('★ ブラウザ版 × 連携先 × 読めないサービス のときだけ案内を返す', () => {
    expect(browserFetchUnsupportedNote('browser', 'remote', 'github')).toBe(BROWSER_FETCH_UNSUPPORTED_NOTE);
  });

  it('対照: 3 つの条件のどれか 1 つが外れると null', () => {
    // 実行形態
    expect(browserFetchUnsupportedNote('desktop', 'remote', 'github')).toBeNull();
    // 分かるまでは出さない
    expect(browserFetchUnsupportedNote(null, 'remote', 'github')).toBeNull();
    // 取得元
    expect(browserFetchUnsupportedNote('browser', 'local', 'github')).toBeNull();
    expect(browserFetchUnsupportedNote('browser', 'sample', 'github')).toBeNull();
    // 読めるサービス
    expect(browserFetchUnsupportedNote('browser', 'remote', 'stripe')).toBeNull();
    // serviceId を渡さない呼び出し元 (汎用パネル)
    expect(browserFetchUnsupportedNote('browser', 'remote', undefined)).toBeNull();
  });
});

describe('母集団 —— 連携先 (remote) の全サービス', () => {
  it('走査が生きている (連携先 20 以上)', () => {
    expect(REMOTE.length).toBeGreaterThanOrEqual(20);
  });

  it('★ ブラウザ版では、一覧に無い連携先だけが案内を受ける (両方向)', () => {
    const noted = REMOTE.filter((id) => browserFetchUnsupportedNote('browser', 'remote', id) !== null);
    const unreadable = REMOTE.filter((id) => !BROWSER_LIVE_READ_SERVICES.includes(id));
    expect(noted).toEqual(unreadable);
    // 実測 (2026-11-19): 読める 8 + 読めない 14 = 連携先 22。
    expect(noted).toEqual([
      'atlassian',
      'base',
      'calendar',
      'canva',
      'cloudflare',
      'drive',
      'freee',
      'github',
      'gmail',
      'microsoft-365',
      'notion',
      'slack',
      'wordpress',
      'youtube',
    ]);
  });

  it('デスクトップ版では、どの連携先にも案内を出さない (主プロセスが取得する)', () => {
    expect(REMOTE.filter((id) => browserFetchUnsupportedNote('desktop', 'remote', id) !== null)).toEqual([]);
  });
});
