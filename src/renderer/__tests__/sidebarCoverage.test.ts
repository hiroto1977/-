import { describe, expect, it } from 'vitest';
import { SERVICES } from '../services';
import { SERVICE_IDS, type ServiceId } from '../../shared/serviceId';
import { SNAPSHOT } from '../data/snapshot';

/*
 * **サイドバーは、利用者がサービスへ辿り着く唯一の道である。**
 *
 * `SERVICE_CREDENTIAL_USE` も `SERVICE_DATA_ORIGIN` も `SERVICE_IDS` へ
 * **総当たりで束ねられている** (それぞれの test が全 id との一致を見る)。
 * ところが `SERVICES` —— 画面に出る一覧 —— だけは束ねられていなかった。
 *
 * `SERVICES` は写像ではなく配列なので、1 行落としても型は通る。
 * 落ちたことに気付ける物も無かった (2026-08-25 に実測):
 *
 *   - `verify:arch` の service count は `SERVICE_IDS` を読む → 変わらない
 *   - `build:landing` の自己検査は「解析した数 == SERVICES の数」→ 両方減る
 *   - `smoke` も `services.ts` から導出する → 両方減る
 *   - `connectionStatus` の検査は `SERVICES.length` を両辺に置く → 両方減る
 *
 * **害**: そのサービスの画面へ行けなくなるだけでなく、**保存済みの資格情報を
 * 画面から消せなくなる**。`unusedStoredCredentials` が拾うのは
 * 「宣言上どの経路でも資格情報を読まないサービス」だけで、サイドバー不在は
 * 見ていない —— 接続状況ハブも `SERVICES` を回すので、そこにも出ない。
 * 金庫の中に、開ける扉の無い引き出しが残る。
 *
 * 例外は台帳で固定する。**双方向** —— 台帳にあるのにサイドバーへ出ていれば
 * それも落とす (「もう例外ではない」ことに気付けるように)。
 */
const SIDEBAR_LESS: Readonly<Record<string, string>> = {
  'uber-eats': 'BusinessPage が snapshot を内部消費するだけで、独立した画面を持たない',
  'demae-can': '同上 (出前館)。BusinessPage の中で使う',
};

describe('サイドバーは SERVICE_IDS を覆う', () => {
  const sidebar = new Set<string>(SERVICES.map((s) => s.id));

  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(SERVICE_IDS.length).toBeGreaterThan(50);
    expect(sidebar.size).toBeGreaterThan(50);
  });

  it('台帳に無いサービスは、すべてサイドバーに出る', () => {
    const missing = SERVICE_IDS.filter(
      (id) => !sidebar.has(id) && !Object.hasOwn(SIDEBAR_LESS, id),
    );
    expect(
      missing,
      'サイドバーから消えたサービスがあります — 画面へ行けず、保存済みの資格情報も消せなくなります',
    ).toEqual([]);
  });

  it('台帳の項目は本当にサイドバーに出ていない (古い例外を残さない)', () => {
    const stale = Object.keys(SIDEBAR_LESS).filter((id) => sidebar.has(id));
    expect(stale, '台帳にあるのにサイドバーへ出ています — 例外を消してください').toEqual([]);
  });

  it('台帳の項目は実在する ServiceId である', () => {
    const all = new Set<string>(SERVICE_IDS);
    expect(Object.keys(SIDEBAR_LESS).filter((id) => !all.has(id))).toEqual([]);
  });

  it('台帳のすべての項目に理由がある', () => {
    expect(Object.entries(SIDEBAR_LESS).filter(([, why]) => why.trim() === '')).toEqual([]);
  });

  it('サイドバーに ServiceId でない id は無い', () => {
    const all = new Set<string>(SERVICE_IDS);
    expect([...sidebar].filter((id) => !all.has(id))).toEqual([]);
  });

  it('サイドバーの id に重複が無い', () => {
    expect(sidebar.size).toBe(SERVICES.length);
  });

  it('数の内訳が実測と合う (74 = 72 + 台帳 2)', () => {
    expect(sidebar.size + Object.keys(SIDEBAR_LESS).length).toBe(SERVICE_IDS.length);
  });

  it('すべてのサイドバー項目が page を持つ', () => {
    const noPage = SERVICES.filter((s) => typeof s.page !== 'function').map((s) => s.id);
    expect(noPage as ServiceId[]).toEqual([]);
  });
});

/*
 * **静的スナップショットも `SERVICE_IDS` へ束ねる。**
 *
 * `SNAPSHOT` は型注釈の無いオブジェクトリテラルで、`Record<ServiceId, …>` では
 * ない。つまり項目を落としても型は通り、`SNAPSHOT[id]` が `undefined` になる。
 * 多くのサービスの fetcher は「`SNAPSHOT[id]` をそのまま返す」だけの静的
 * スタブなので、落ちた項目のページは**常に空**になる。
 *
 * `lint:test-coverage` は test と action を `SERVICE_IDS` へ束ねているが、
 * スナップショットは見ていなかった (2026-08-25 実測)。
 *
 * 鍵は id の camelCase (`microsoft-365` → `microsoft365`)。scaffold が
 * そう作るので、**照合もその規則で行う** —— 素の id で比べると 12 件が
 * 「無い」と出る (一度そう誤読した)。
 */
const camelKey = (id: string): string => id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** スナップショットを持たないサービス。理由つき・双方向。 */
const SNAPSHOT_LESS: Readonly<Record<string, string>> = {
  village: '専用の fetcher (fetchVillageSnapshot) を持ち、VillagePage は SNAPSHOT を読まない',
};

/** サービス id に対応しないトップレベル鍵。 */
const NON_SERVICE_KEYS: Readonly<Record<string, string>> = {
  fetchedAt: 'スナップショット全体の取得時刻 (サービスではない)',
};

describe('静的スナップショットは SERVICE_IDS を覆う', () => {
  const keys = new Set(Object.keys(SNAPSHOT));

  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(keys.size).toBeGreaterThan(50);
  });

  it('台帳に無いサービスは、すべてスナップショットを持つ', () => {
    const missing = SERVICE_IDS.filter(
      (id) => !keys.has(id) && !keys.has(camelKey(id)) && !Object.hasOwn(SNAPSHOT_LESS, id),
    );
    expect(
      missing,
      'スナップショットの無いサービスがあります — 静的スタブの fetcher なら画面は常に空になります',
    ).toEqual([]);
  });

  it('台帳の項目は本当にスナップショットを持たない (古い例外を残さない)', () => {
    const stale = Object.keys(SNAPSHOT_LESS).filter((id) => keys.has(id) || keys.has(camelKey(id)));
    expect(stale, '台帳にあるのにスナップショットがあります — 例外を消してください').toEqual([]);
  });

  it('どの ServiceId にも対応しない鍵は、台帳にあるものだけ', () => {
    const known = new Set(SERVICE_IDS.flatMap((id) => [id as string, camelKey(id)]));
    const extra = [...keys].filter((k) => !known.has(k) && !Object.hasOwn(NON_SERVICE_KEYS, k));
    expect(extra, 'サービスに対応しない鍵があります — 綴り違いか、台帳への追記漏れです').toEqual([]);
  });

  it('台帳の項目に理由がある', () => {
    const noWhy = [...Object.entries(SNAPSHOT_LESS), ...Object.entries(NON_SERVICE_KEYS)].filter(
      ([, why]) => why.trim() === '',
    );
    expect(noWhy).toEqual([]);
  });

  it('camelCase 変換が実物に効いている (素の id では合わない鍵がある)', () => {
    // この変換が無いと照合は破綻する。効いていることを固定する。
    const needsCamel = SERVICE_IDS.filter((id) => !keys.has(id) && keys.has(camelKey(id)));
    expect(needsCamel.length).toBeGreaterThan(0);
  });
});
