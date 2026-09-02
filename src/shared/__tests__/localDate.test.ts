/**
 * 「今日」を利用者の時計で取る。
 *
 * 対照は 2 段で取る。
 *   1. **時間帯に依らない対照**: local getter は JST の当日を、`toISOString` は
 *      前日を返す Date の代役を渡す。実装が `toISOString` に戻れば落ちる。
 *      どの実行環境でも回る (Stryker の in-process vitest でも)。
 *   2. **本物の時間帯を切り替える対照**: `process.env.TZ` を差し替える。
 *      `npm test` は `pool: 'forks'` (子プロセスのメインスレッド) なので効くが、
 *      Stryker の実行系では効かない (2026-09-02 の実測: オフセットが 0 のまま)。
 *      効いていない環境では**黙って通さず skip にする** —— 差し替えが届いたかを
 *      先に見て、届いていなければ対照を取れない旨を skip で残す。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { localIsoDate } from '../localDate';

/** TZ の差し替えがこの実行系で Date に届くか (収集時に 1 度だけ確かめる)。 */
const tzSwitchable = (() => {
  const prev = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo';
  const ok = new Date(2026, 0, 1).getTimezoneOffset() === -540;
  if (prev === undefined) delete process.env.TZ;
  else process.env.TZ = prev;
  return ok;
})();

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('localIsoDate', () => {
  it('利用者の時計の年月日を YYYY-MM-DD で返す (月と日は 2 桁)', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
    expect(localIsoDate(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
    expect(localIsoDate(new Date(2026, 8, 2, 12))).toBe('2026-09-02');
  });

  it('引数を省くと今日 (呼んだ瞬間の日付)', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(localIsoDate()).toBe(expected);
  });

  it('local getter を読み、toISOString を読まない (時間帯に依らない対照)', () => {
    // 2026-09-02 00:30 JST = 2026-09-01T15:30Z。local getter は当日、UTC は前日。
    const jstMidnight = {
      getFullYear: () => 2026,
      getMonth: () => 8,
      getDate: () => 2,
      toISOString: () => '2026-09-01T15:30:00.000Z',
    } as unknown as Date;
    expect(jstMidnight.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(localIsoDate(jstMidnight)).toBe('2026-09-02');
  });

  it.skipIf(!tzSwitchable)('日本 (UTC+9) の午前 0 時 30 分: UTC の日付は前日、この関数は当日 (本物の時間帯)', () => {
    process.env.TZ = 'Asia/Tokyo';
    const d = new Date(2026, 8, 2, 0, 30); // 2026-09-02 00:30 JST
    expect(d.getTimezoneOffset()).toBe(-540);
    expect(d.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(localIsoDate(d)).toBe('2026-09-02');
  });

  it.skipIf(!tzSwitchable)('UTC より西 (UTC-5) の 23 時: UTC の日付は翌日、この関数は当日 (本物の時間帯)', () => {
    process.env.TZ = 'America/New_York';
    const d = new Date(2026, 0, 15, 23, 0); // 2026-01-15 23:00 EST
    expect(d.getTimezoneOffset()).toBe(300);
    expect(d.toISOString().slice(0, 10)).toBe('2026-01-16');
    expect(localIsoDate(d)).toBe('2026-01-15');
  });
});
