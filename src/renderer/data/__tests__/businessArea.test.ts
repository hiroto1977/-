/**
 * 業務仕分け (`businessArea.ts` · 2026-11-23)。
 *
 * 81 の画面を 6 つの業務区分と共通基盤のどこか 1 か所に置く表と、そこから導く
 * 「人の確認が要るか」「外へ送るか」を留める。
 */
import { describe, expect, it } from 'vitest';
import { SERVICE_IDS } from '../../../shared/serviceId';
import { ACTION_TIER } from '../../../shared/actionTier';
import { SERVICES } from '../../services';
import {
  AREA_DUTY,
  AREA_EMOJI,
  AREA_LABEL,
  AREA_ORDER,
  LAYER_LABEL,
  SERVICE_AREA,
  areaOf,
  needsHumanApproval,
  sendsOutside,
} from '../businessArea';

describe('業務仕分けの表', () => {
  it('★ すべての画面がちょうど 1 か所に置かれている (表とサービスの一覧が両方向に一致)', () => {
    expect(Object.keys(SERVICE_AREA).sort()).toEqual([...SERVICE_IDS].sort());
  });

  it('★ 共通基盤の画面は層を持ち、業務区分の画面は層を持たない', () => {
    for (const [id, p] of Object.entries(SERVICE_AREA)) {
      if (p.area === 'platform') expect(p.layer, `${id} は共通基盤なのに層が無い`).toBeDefined();
      else expect(p.layer, `${id} は業務区分なのに層を持つ`).toBeUndefined();
    }
  });

  it('★ 理由が書かれていない置き場所は無い', () => {
    for (const [id, p] of Object.entries(SERVICE_AREA)) {
      expect(p.why.length, `${id} の理由が短すぎる`).toBeGreaterThanOrEqual(5);
      expect(p.why.endsWith('。'), `${id} の理由が文になっていない`).toBe(true);
    }
  });

  it('区分ごとの名前・印・受け持つ業務が全部ある', () => {
    expect(AREA_ORDER).toEqual(['front', 'center', 'middle', 'back', 'field', 'management', 'platform']);
    for (const a of AREA_ORDER) {
      expect(AREA_LABEL[a].length).toBeGreaterThan(0);
      expect(AREA_EMOJI[a].length).toBeGreaterThan(0);
      expect(AREA_DUTY[a].endsWith('。')).toBe(true);
    }
    expect(Object.keys(LAYER_LABEL).sort()).toEqual(['data', 'governance', 'orchestration']);
  });

  it('どの区分にもサイドバーの画面が 1 つ以上ある', () => {
    for (const a of AREA_ORDER) {
      expect(SERVICES.some((s) => areaOf(s.id).area === a), `${a} が空`).toBe(true);
    }
  });

  it.each([
    ['sales', 'center'],
    ['freee', 'back'],
    ['docstudio', 'middle'],
    ['kpi', 'management'],
    ['github', 'field'],
    ['shopify', 'front'],
  ] as const)('代表: %s は %s', (id, area) => {
    expect(areaOf(id).area).toBe(area);
  });

  it('代表: 共通基盤の層', () => {
    expect(areaOf('library')).toMatchObject({ area: 'platform', layer: 'data' });
    expect(areaOf('assistant')).toMatchObject({ area: 'platform', layer: 'orchestration' });
    expect(areaOf('security')).toMatchObject({ area: 'platform', layer: 'governance' });
  });
});

describe('人の確認と外への送信は ACTION_TIER から導く', () => {
  it('★ 外へ書き込む操作のある画面は「人の確認」、AI へ送るだけの画面は確認ではなく「外へ送る」', () => {
    expect(needsHumanApproval('github')).toBe(true); // github/create-issue = external-write
    expect(sendsOutside('github')).toBe(true);
    expect(needsHumanApproval('assistant')).toBe(false); // assistant/chat = egress
    expect(sendsOutside('assistant')).toBe(true);
    expect(needsHumanApproval('emotions')).toBe(true); // emotions/clear-history = destructive
    expect(sendsOutside('kpi')).toBe(false);
    expect(needsHumanApproval('kpi')).toBe(false);
  });

  it('★ 台帳の id の前置きで数える (似た名前の別の画面と混ぜない)', () => {
    // `stocks/` の行は `stock/` を名乗る画面を数えない —— 区切りの `/` まで一致させる。
    const keys = Object.keys(ACTION_TIER);
    expect(keys.some((k) => k.startsWith('microsoft-365/'))).toBe(true);
    expect(needsHumanApproval('microsoft-365')).toBe(true);
    expect(sendsOutside('mutual-funds')).toBe(true); // mutual-funds/advise = egress
    expect(needsHumanApproval('mutual-funds')).toBe(false); // record-entry は local-write
  });
});
