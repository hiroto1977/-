import { describe, expect, it } from 'vitest';
import {
  BROWSER_BUNDLED_FETCH_SERVICES,
  bundledPayloadForBrowser,
  servesBundledInBrowser,
} from '../browserBundledFetch';
import { SNAPSHOT } from '../snapshot';
import { originOf } from '../../../shared/dataOrigin';
import { SERVICE_IDS, isServiceId } from '../../../shared/serviceId';

const SNAPSHOTS = SNAPSHOT as unknown as Readonly<Record<string, Record<string, unknown>>>;

describe('ブラウザ版の取得が同梱の内容を返すサービス', () => {
  it('一覧を値ごと留める (10 件)', () => {
    expect([...BROWSER_BUNDLED_FETCH_SERVICES]).toEqual([
      'business',
      'docstudio',
      'funding',
      'kpi',
      'linux',
      'skills',
      'templates',
      'docker',
      'obsidian',
      'storage',
    ]);
    expect(Object.isFrozen(BROWSER_BUNDLED_FETCH_SERVICES)).toBe(true);
  });

  it('一覧のどれも実在するサービスで、取得元は local、同梱の内容を持つ', () => {
    for (const id of BROWSER_BUNDLED_FETCH_SERVICES) {
      expect(isServiceId(id), id).toBe(true);
      // 'sample' は「更新」が取得を呼ばないので、ここへ載せる意味が無い。'remote' は実データの画面。
      expect(originOf(id as (typeof SERVICE_IDS)[number]), id).toBe('local');
      expect(typeof SNAPSHOTS[id], id).toBe('object');
    }
  });

  it('判定は一覧のサービスだけを受ける (他のサービス・prototype の鍵・空文字は受けない)', () => {
    for (const id of BROWSER_BUNDLED_FETCH_SERVICES) expect(servesBundledInBrowser(id), id).toBe(true);
    for (const id of ['github', 'a8net', 'tax', 'uber-eats', '', 'constructor', '__proto__', 'KPI', 'kpi ']) {
      expect(servesBundledInBrowser(id), JSON.stringify(id)).toBe(false);
    }
  });
});

describe('bundledPayloadForBrowser —— 返す中身', () => {
  it('★ 同梱の内容の全部の欄に、isMock: true を重ねた物を返す', () => {
    for (const id of BROWSER_BUNDLED_FETCH_SERVICES) {
      expect(bundledPayloadForBrowser(id, SNAPSHOTS), id).toEqual({ ...SNAPSHOTS[id], isMock: true });
    }
  });

  it('★ 同梱の内容が名乗っていなくても (Linux / Skills)、返す物は isMock: true を名乗る', () => {
    // 標本: この 2 つの同梱の内容は isMock を持たない (デスクトップ版は端末を実際に読むため)。
    expect('isMock' in SNAPSHOTS.linux!).toBe(false);
    expect('isMock' in SNAPSHOTS.skills!).toBe(false);
    expect(bundledPayloadForBrowser('linux', SNAPSHOTS).isMock).toBe(true);
    expect(bundledPayloadForBrowser('skills', SNAPSHOTS)).toEqual({ items: [], isMock: true });
  });

  it('同梱の内容が isMock: false を名乗っていても、返す物は true (後から重ねる)', () => {
    expect(bundledPayloadForBrowser('x', { x: { a: 1, isMock: false } })).toEqual({ a: 1, isMock: true });
  });

  it('写しを返す —— 受け取った側が書き換えても、同梱の内容は動かない', () => {
    const source = { x: { a: 1 } };
    const out = bundledPayloadForBrowser('x', source);
    expect(out).not.toBe(source.x);
    out.a = 2;
    expect(source.x).toEqual({ a: 1 });
    expect(bundledPayloadForBrowser('x', source)).not.toBe(bundledPayloadForBrowser('x', source));
  });
});
