import { describe, expect, it } from 'vitest';
import {
  SERVICE_DATA_ORIGIN,
  describeOrigin,
  isRefreshable,
  originOf,
  type DataOrigin,
} from '../dataOrigin';
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
