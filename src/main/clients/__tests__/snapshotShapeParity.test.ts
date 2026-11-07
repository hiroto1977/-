/**
 * **取ってきた形と、同梱の形は同じでなければならない。**
 *
 * CLAUDE.md の約束はこう書いてある —— 「A fetcher takes `{ token, fetch? }` and
 * returns a value with the same shape as `SNAPSHOT[id]`」。画面は
 * `useServiceData(id, SNAPSHOT[id])` で**まず同梱の形**を描き、取得できたら
 * 差し替えるので、両者の欄が食い違うと**片方の道でだけ** `undefined` を読む:
 *
 *   同梱にしか無い欄 … 取得成功後にその欄が消え、画面は空欄か `¥NaN` になる
 *     (取得できた瞬間に壊れる、という最も気づきにくい壊れ方)。
 *   取得にしか無い欄 … 未連携のあいだ画面に出ない (同梱を見ている間ずっと)。
 *
 * この約束は文章だけで、誰も測っていなかった (2026-09-06)。**実測では 50 件すべて
 * 一致していた** —— つまりこれは「直す」検査ではなく「崩れたら気づく」検査である。
 *
 * 対象は資格情報の要らない `LOCAL_SERVICES` だけ。ここは fetcher を**実際に呼べる**
 * (通信もトークンも要らない)。SaaS 側は本物の API を叩くので、同じ形の検査は
 * 各 client のテストが応答の雛形に対して行っている。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/service-hub-shape-parity', getVersion: () => '0.0.0' },
  shell: { openExternal: () => Promise.resolve() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const { LIVE_FETCHERS, LOCAL_SERVICES } = await import('../index');
const { SNAPSHOT } = await import('../../../renderer/data/snapshot');
const { SERVICE_IDS } = await import('../../../shared/serviceId');
const { shapeDiff } = await import('../../../shared/__tests__/shapeDiff');

/**
 * 同梱スナップショットの鍵は id と綴りが違うものがある (kebab のまま置いた 3 件と、
 * camel に直した残り)。**綴りの対応はここが唯一の表** —— 新しいサービスの鍵が
 * どちらでもない綴りだと、下の検査が「同梱が無い」と言って落ちる。
 */
const SNAPSHOT_KEY: Readonly<Record<string, string>> = {
  'mutual-funds': 'mutualFunds',
  'real-estate': 'realEstate',
  'uber-eats': 'uberEats',
  'demae-can': 'demaeCan',
  'tax-accountant': 'taxAccountant',
  'labor-consultant': 'laborConsultant',
  'judicial-scrivener': 'judicialScrivener',
  'administrative-scrivener': 'administrativeScrivener',
  'sme-consultant': 'smeConsultant',
  'patent-attorney': 'patentAttorney',
  'certified-accountant': 'certifiedAccountant',
};

/**
 * 同梱スナップショットを持たないサービスの台帳 (理由つき・**双方向**)。
 * 同梱を持たせたら、ここから消さないと落ちる。
 */
const NO_SNAPSHOT: Readonly<Record<string, string>> = {
  village: 'AIの村は registry.json から renderer 側で全画面を組むので useServiceData を通らない (SNAPSHOT の欄も無い)',
};

const snap = SNAPSHOT as unknown as Record<string, unknown>;

function snapshotKeyOf(id: string): string {
  const camel = id.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
  return SNAPSHOT_KEY[id] ?? (snap[id] !== undefined ? id : camel);
}

/** fetcher を呼ぶ。通信は使わせない (使ったら census の前提が崩れるので投げる)。 */
async function fetchedShape(id: string): Promise<unknown> {
  const fetchers = LIVE_FETCHERS as unknown as Record<string, (ctx: unknown) => Promise<unknown>>;
  return fetchers[id]!({
    token: '',
    fetch: () => {
      throw new Error(`local service ${id} must not use the network`);
    },
  });
}

const LOCAL_IDS = SERVICE_IDS.filter((id) => LOCAL_SERVICES.has(id));

describe('同梱スナップショットと fetcher の形', () => {
  it('走査が生きている (床: 45 サービス以上を突き合わせる)', () => {
    const compared = LOCAL_IDS.filter((id) => !(id in NO_SNAPSHOT));
    expect(compared.length).toBeGreaterThanOrEqual(45);
  });

  it('★ 全ローカルサービスで、同梱と取得の欄が一致する', async () => {
    const bad: string[] = [];
    for (const id of LOCAL_IDS) {
      if (id in NO_SNAPSHOT) continue;
      const s = snap[snapshotKeyOf(id)];
      if (s === undefined) {
        bad.push(`${id}: 同梱スナップショットが見つからない (鍵 ${snapshotKeyOf(id)})`);
        continue;
      }
      const d = shapeDiff(s, await fetchedShape(id));
      if (d.snapshotOnly.length || d.fetchedOnly.length) {
        bad.push(`${id}: 同梱だけ=[${d.snapshotOnly.join(',')}] 取得だけ=[${d.fetchedOnly.join(',')}]`);
      }
    }
    expect(bad, '同梱と取得で欄が違うと、片方の道でだけ undefined を読む').toEqual([]);
  });

  it('★ 同梱を持たない台帳は実測と一致する (持たせたら消す)', async () => {
    const stale = Object.keys(NO_SNAPSHOT).filter((id) => snap[snapshotKeyOf(id)] !== undefined);
    expect(stale, '同梱を持たせたなら NO_SNAPSHOT から消すこと').toEqual([]);
    for (const [id, why] of Object.entries(NO_SNAPSHOT)) {
      expect(why.length, id).toBeGreaterThanOrEqual(20);
    }
  });

  it('標本: 欄が 1 つ足りない / 1 つ多い形を実際に差として拾う', () => {
    expect(shapeDiff({ a: 1, b: 2 }, { a: 1 })).toEqual({ snapshotOnly: ['b'], fetchedOnly: [] });
    expect(shapeDiff({ a: 1 }, { a: 1, c: 3 })).toEqual({ snapshotOnly: [], fetchedOnly: ['c'] });
    expect(shapeDiff({ a: 1 }, { a: 9 })).toEqual({ snapshotOnly: [], fetchedOnly: [] });
  });

  it('★ 標本: 入れ子の 1 欄の違いも拾う (上端だけ見る版では鳴らなかった形)', () => {
    const s = { summary: { total: 0, tax: 0 }, rows: [{ month: '', amount: 0 }] };
    expect(shapeDiff(s, { summary: { total: 1 }, rows: [{ month: 'x', amount: 1 }] })).toEqual({
      snapshotOnly: ['summary.tax'], fetchedOnly: [],
    });
    expect(shapeDiff(s, { summary: { total: 1, tax: 1 }, rows: [{ month: 'x', amount: 1, note: '' }] })).toEqual({
      snapshotOnly: [], fetchedOnly: ['rows[].note'],
    });
  });

  it('標本: 片方が空の配列なら要素の形は問わない (分からないことは鳴らさない)', () => {
    expect(shapeDiff({ rows: [] }, { rows: [{ a: 1 }] })).toEqual({ snapshotOnly: [], fetchedOnly: [] });
    expect(shapeDiff({ rows: [{ a: 1 }] }, { rows: [] })).toEqual({ snapshotOnly: [], fetchedOnly: [] });
  });

  it('標本: null / undefined の欄は比べない (「まだ無い」は普通の値)', () => {
    expect(shapeDiff({ a: null }, { a: { x: 1 } })).toEqual({ snapshotOnly: [], fetchedOnly: [] });
    expect(shapeDiff({ a: { x: 1 } }, { a: null })).toEqual({ snapshotOnly: [], fetchedOnly: [] });
  });

  it('標本: 片方が空の物 (Map 相当) なら鍵は問わない', () => {
    expect(shapeDiff({ byStep: {} }, { byStep: { 1: [], 2: [] } })).toEqual({ snapshotOnly: [], fetchedOnly: [] });
  });

  it('標本: 物と物でない値が向き合っていたら型の違いとして鳴る', () => {
    expect(shapeDiff({ a: { b: 1 } }, { a: 42 }).snapshotOnly).toEqual(['a:型が違う']);
    expect(shapeDiff({ a: [1] }, { a: { x: 1 } }).snapshotOnly).toEqual(['a:型が違う']);
  });
});
