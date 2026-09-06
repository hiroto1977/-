import { describe, expect, it } from 'vitest';
import { SERVICE_DATA_ORIGIN, describeOrigin, isRefreshable, originOf, type DataOrigin, staleDataNote } from '../dataOrigin';
import { SERVICE_IDS, type ServiceId } from '../serviceId';

/**
 * 期待値は **手で書き出す**。`SERVICE_DATA_ORIGIN` から導出すると
 * 「表と表が一致する」ことしか確かめられず、表そのものの書き換えを検出できない
 * (同じ罠で overviewOverrides の ArrayDeclaration 変異 24 個が生き残った)。
 * ソースツリー側との照合は `scripts/lint-data-origin.cjs` が別経路で行う。
 */
const EXPECTED: ReadonlyArray<readonly [ServiceId, DataOrigin]> = [
  ['home', 'local'],
  ['village', 'local'],
  ['github', 'remote'],
  ['wordpress', 'remote'],
  ['atlassian', 'remote'],
  ['notion', 'remote'],
  ['drive', 'remote'],
  ['calendar', 'remote'],
  ['gmail', 'remote'],
  ['slack', 'remote'],
  ['canva', 'remote'],
  ['skills', 'local'],
  ['security', 'local'],
  ['cloudflare', 'remote'],
  ['emotions', 'local'],
  ['ollama', 'local'],
  ['kpi', 'local'],
  ['stocks', 'local'],
  ['business', 'local'],
  ['teamradar', 'local'],
  ['talent', 'local'],
  ['templates', 'local'],
  ['library', 'local'],
  ['settings', 'local'],
  ['uber-eats', 'sample'],
  ['demae-can', 'sample'],
  ['real-estate', 'sample'],
  ['mutual-funds', 'sample'],
  ['charts', 'sample'],
  ['quality', 'sample'],
  ['microsoft-365', 'remote'],
  ['dropbox', 'sample'],
  ['salesforce', 'sample'],
  ['discord', 'sample'],
  ['asana', 'sample'],
  ['linear', 'sample'],
  ['sentry', 'sample'],
  ['shopify', 'sample'],
  ['stripe', 'sample'],
  ['line', 'sample'],
  ['storage', 'sample'],
  ['tax-accountant', 'sample'],
  ['labor-consultant', 'sample'],
  ['lawyer', 'sample'],
  ['judicial-scrivener', 'sample'],
  ['admin-scrivener', 'sample'],
  ['sme-consultant', 'sample'],
  ['patent-attorney', 'sample'],
  ['cpa', 'sample'],
  ['base', 'remote'],
  ['netsea', 'sample'],
  ['super-delivery', 'sample'],
  ['topseller', 'sample'],
  ['a8net', 'sample'],
  ['ai-blogkun', 'sample'],
  ['moneyforward', 'sample'],
  ['amazon', 'sample'],
  ['amazon-associates', 'sample'],
  ['sales', 'sample'],
  ['team', 'sample'],
  ['youtube', 'remote'],
  ['overview', 'sample'],
  ['coconala', 'sample'],
  ['tiktok', 'sample'],
  ['tax', 'sample'],
  ['funding', 'local'],
  ['freee', 'remote'],
  ['connectors', 'sample'],
  ['linux', 'local'],
  ['compliance', 'sample'],
  ['obsidian', 'sample'],
  ['docker', 'sample'],
  ['assistant', 'local'],
  ['docstudio', 'local'],
  ['cursor', 'remote'],
];

describe('SERVICE_DATA_ORIGIN', () => {
  it('全 ServiceId を網羅する (tsc の総和型チェックの実行時裏取り)', () => {
    expect(Object.keys(SERVICE_DATA_ORIGIN).sort()).toEqual([...SERVICE_IDS].sort());
  });

  it('宣言が期待表と一致する', () => {
    expect(EXPECTED.length).toBe(SERVICE_IDS.length);
    for (const [id, origin] of EXPECTED) {
      expect(SERVICE_DATA_ORIGIN[id], id).toBe(origin);
    }
  });

  it('3 分類の件数を固定する — 片方向に倒れた表を検出する', () => {
    const count = (o: DataOrigin) => EXPECTED.filter(([, v]) => v === o).length;
    expect(count('sample')).toBe(42);
    expect(count('local')).toBe(18);
    expect(count('remote')).toBe(15);
  });
});

describe('originOf', () => {
  it('宣言された値を返す', () => {
    expect(originOf('github')).toBe('remote');
    expect(originOf('kpi')).toBe('local');
    expect(originOf('tax-accountant')).toBe('sample');
  });

  it('未知の id は sample に倒す (取得を試みない側が安全)', () => {
    expect(originOf('not-a-service' as ServiceId)).toBe('sample');
  });

  it('プロトタイプ由来のキーを値として拾わない', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(originOf(key as ServiceId), key).toBe('sample');
    }
  });
});

describe('isRefreshable', () => {
  it('sample だけが取得不可', () => {
    expect(isRefreshable('remote')).toBe(true);
    expect(isRefreshable('local')).toBe(true);
    expect(isRefreshable('sample')).toBe(false);
  });
});

describe('describeOrigin', () => {
  it('sample は取得状態に関係なく「内蔵サンプル」', () => {
    expect(describeOrigin('sample', 'snapshot')).toEqual({ text: '内蔵サンプル', tone: 'neutral' });
    expect(describeOrigin('sample', 'live')).toEqual({ text: '内蔵サンプル', tone: 'neutral' });
  });

  it('未取得はどの取得元でも「スナップショット」', () => {
    // remote は「未連携でサンプルを出している」と言い切る。「スナップショット」
    // だと実データを写したものと読め、架空の人物が実在と受け取られる。
    expect(describeOrigin('remote', 'snapshot')).toEqual({ text: 'サンプル（未連携）', tone: 'neutral' });
    expect(describeOrigin('local', 'snapshot')).toEqual({ text: 'スナップショット', tone: 'neutral' });
  });

  it('取得済みは取得元で言葉を分ける', () => {
    expect(describeOrigin('local', 'live')).toEqual({ text: 'ローカル', tone: 'ok' });
    expect(describeOrigin('remote', 'live')).toEqual({ text: 'ライブ', tone: 'ok' });
  });

  it('緑 (ok) は実際に取ってきた時だけ', () => {
    const ok = (['remote', 'local', 'sample'] as const).flatMap((o) =>
      (['snapshot', 'live'] as const).map((s) => [o, s, describeOrigin(o, s).tone] as const),
    );
    expect(ok.filter(([, , tone]) => tone === 'ok')).toEqual([
      ['remote', 'live', 'ok'],
      ['local', 'live', 'ok'],
    ]);
  });
});

/*
 * **`describeOrigin` の札は 1 枠しか無いバッジに出る。**
 *
 * `StatusBar` は `status === 'error'` のときそのバッジを「認証エラー」等へ
 * 差し替えるので、**取得が失敗したまさにその時に取得元の宣言が消えていた**
 * (2026-09-06 実測)。画面の下には `SNAPSHOT[id]` の同梱データ —— このファイルの
 * `describeOrigin` の注記が「架空の 3 人」と書いているあの類 —— がそのまま
 * 並んでおり、残る手掛かりは `401 Bad credentials` だけだった。
 */
describe('staleDataNote — 失敗時に数字の出どころを言う', () => {
  it('★ 未取得の remote で失敗: 同梱のサンプルだと言う', () => {
    expect(staleDataNote('remote', 'snapshot', true)).toBe(
      '表示中の数字は同梱のサンプルです（まだあなたのデータではありません）',
    );
  });

  it('★ 取得済みで失敗: 前回取得できた内容だと言う (実データだが今回の更新は入っていない)', () => {
    expect(staleDataNote('remote', 'live', true)).toBe(
      '表示中の数字は前回取得できた内容です（今回の更新は反映されていません）',
    );
  });

  it('★ local も同じ規則 (取得先が手元でも、失敗したら出どころを言う)', () => {
    expect(staleDataNote('local', 'snapshot', true)).toContain('同梱のサンプル');
    expect(staleDataNote('local', 'live', true)).toContain('前回取得できた内容');
  });

  it('対照: 失敗していなければ出さない', () => {
    expect(staleDataNote('remote', 'snapshot', false)).toBeNull();
    expect(staleDataNote('remote', 'live', false)).toBeNull();
    expect(staleDataNote('local', 'snapshot', false)).toBeNull();
  });

  it('★ 取得しない画面では出さない (常設の注記と二重に言わない)', () => {
    // 標本: 取得する画面なら同じ引数で文が返る (走査が空振りしていない)。
    expect(staleDataNote('sample', 'snapshot', true)).toBeNull();
    expect(staleDataNote('remote', 'snapshot', true)).not.toBeNull();
  });

  it('★ 2 つの文面は取り違えられない (どちらも「あなたのデータ」の扱いが逆)', () => {
    const sample = staleDataNote('remote', 'snapshot', true);
    const last = staleDataNote('remote', 'live', true);
    expect(sample).not.toBe(last);
    expect(sample).toContain('まだあなたのデータではありません');
    expect(last).toContain('今回の更新は反映されていません');
  });
});

/*
 * **取ってきた中身が「同梱データ」を名乗るなら、緑にしない** (2026-09-06)。
 *
 * `tone: 'ok'` は上の `describeOrigin` の注記どおり「実際に取ってきた」時だけの色。
 * ところが `main/clients/funding.ts` は `MOCK_ITEMS` と固定の期首残高 300 万円から
 * 補助金・融資の一覧・キャッシュランウェイ・債務償還年数・特定収入割合を組み立てて
 * 返し、自ら `isMock: true` を立てている —— それでも「更新」を押すと `source` が
 * `live` になるので緑の「ローカル」が付いていた。
 */
describe('describeOrigin — 同梱データを名乗る中身', () => {
  it('★ local + live でも、名乗っていれば「同梱データ」で緑にしない', () => {
    expect(describeOrigin('local', 'live', true)).toEqual({ text: '同梱データ', tone: 'neutral' });
  });

  it('★ remote + live でも同じ (取得先の種別で緩めない)', () => {
    expect(describeOrigin('remote', 'live', true)).toEqual({ text: '同梱データ', tone: 'neutral' });
  });

  it('対照: 名乗っていなければ従来どおり緑の「ローカル」/「ライブ」', () => {
    expect(describeOrigin('local', 'live', false)).toEqual({ text: 'ローカル', tone: 'ok' });
    expect(describeOrigin('remote', 'live', false)).toEqual({ text: 'ライブ', tone: 'ok' });
  });

  it('対照: 既定 (引数を省略) は名乗っていない扱い —— 既存の呼び出しを変えない', () => {
    expect(describeOrigin('local', 'live')).toEqual({ text: 'ローカル', tone: 'ok' });
  });

  it('★ 未取得のときは名乗りを見ない (札は「サンプル（未連携）」のまま)', () => {
    // 同梱の値を表示しているのは snapshot でも同じだが、そちらは既に言い切っている。
    // ここで「同梱データ」に差し替えると、未連携であることが消えて弱くなる。
    expect(describeOrigin('remote', 'snapshot', true)).toEqual({ text: 'サンプル（未連携）', tone: 'neutral' });
  });

  it('★ `sample` の画面は変わらない (常に「内蔵サンプル」)', () => {
    expect(describeOrigin('sample', 'live', true)).toEqual({ text: '内蔵サンプル', tone: 'neutral' });
  });
});
