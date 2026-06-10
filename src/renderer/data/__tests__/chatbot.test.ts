import { describe, expect, it } from 'vitest';
import {
  detectSpecialIntent,
  findService,
  routeForService,
  replyTo,
  type ChatContext,
  type ChatService,
} from '../chatbot';
import { buildOrgIndex, type RawTeam } from '../chatOrg';
import { orgSummaryLine } from '../chatOrg';

// --- フィクスチャ -----------------------------------------------------------

const ORG = buildOrgIndex(
  {
    executives: [{ id: 'cfo', title: '最高財務責任者 (CFO)', domain: '財務・税務・資金調達' }],
    managers: [{ id: 'mgr-tax', title: '税務部長', reportsTo: 'cfo', teams: ['tax-income'] }],
    secretaries: [{}, {}, {}, {}],
  },
  [
    { id: 'tax-income', domain: '税務(所得税)', focus: '所得税・速算表', manager: 'mgr-tax' },
  ] as readonly RawTeam[],
);

const SERVICES_FIXTURE: readonly ChatService[] = [
  { id: 'tax', label: '税務試算', description: '所得税/住民税/手取りの概算' },
  { id: 'github', label: 'GitHub', description: 'リポジトリ・PR・Issue・CI を表示' },
];

const CTX: ChatContext = {
  services: SERVICES_FIXTURE,
  org: ORG,
  capabilities: {
    serviceIds: ['tax', 'github'],
    actions: { github: ['create-issue'] },
  },
};

// --- detectSpecialIntent ----------------------------------------------------

describe('detectSpecialIntent', () => {
  it('detects request / org / help and returns null otherwise', () => {
    expect(detectSpecialIntent('れぽーと機能を追加して')).toBe('request');
    expect(detectSpecialIntent('組織の体制は？')).toBe('org');
    expect(detectSpecialIntent('何ができるの')).toBe('help');
    expect(detectSpecialIntent('こんにちは')).toBeNull();
  });

  it('prioritizes request over org when both match', () => {
    expect(detectSpecialIntent('組織図の機能を追加して')).toBe('request');
  });

  it('prioritizes org over help when both match', () => {
    expect(detectSpecialIntent('組織は何ができる')).toBe('org');
  });
});

// --- findService / routeForService -------------------------------------------

describe('findService', () => {
  it('finds a service by id and returns undefined for unknown/undefined', () => {
    expect(findService(SERVICES_FIXTURE, 'tax')?.label).toBe('税務試算');
    expect(findService(SERVICES_FIXTURE, 'slack')).toBeUndefined();
    expect(findService(SERVICES_FIXTURE, undefined)).toBeUndefined();
  });
});

describe('routeForService', () => {
  it('routes a service label through the org (税務試算 → 税務部長 → CFO)', () => {
    expect(routeForService(ORG, SERVICES_FIXTURE[0])).toBe('税務部長 → 最高財務責任者 (CFO)');
  });

  it('returns COO 直轄 for undefined service and unrouted labels', () => {
    expect(routeForService(ORG, undefined)).toBe('COO 直轄');
    expect(routeForService(ORG, SERVICES_FIXTURE[1])).toBe('COO 直轄');
  });
});

// --- replyTo ------------------------------------------------------------------

describe('replyTo', () => {
  it('records a feature request routed to CSO and echoes the request text', () => {
    const r = replyTo('音声読み上げ機能を追加して', CTX);
    expect(r.kind).toBe('request');
    expect(r.routedThrough).toBe('要望受付 → 最高戦略責任者 (CSO) → COO');
    expect(r.text).toContain('音声読み上げ機能を追加して');
    expect(r.navigateTo).toBeUndefined();
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it('answers org questions with the live summary line', () => {
    const r = replyTo('いまの組織体制を教えて', CTX);
    expect(r.kind).toBe('org');
    expect(r.routedThrough).toBe('COO 直轄');
    expect(r.text).toContain(orgSummaryLine(ORG));
  });

  it('answers help with the injected service count and sample labels', () => {
    const r = replyTo('何ができる？', CTX);
    expect(r.kind).toBe('help');
    expect(r.text).toContain('2 のサービス');
    expect(r.text).toContain('税務試算');
  });

  it('navigates to a service and reports the org chain', () => {
    const r = replyTo('税務試算を開いて', CTX);
    expect(r.kind).toBe('navigate');
    expect(r.navigateTo).toBe('tax');
    expect(r.routedThrough).toBe('税務部長 → 最高財務責任者 (CFO)');
    expect(r.intent).toBeUndefined();
  });

  it('answers service questions with the description (query intent)', () => {
    const r = replyTo('税務試算って何？', CTX);
    expect(r.kind).toBe('service-info');
    expect(r.navigateTo).toBe('tax');
    expect(r.text).toContain('所得税/住民税/手取りの概算');
  });

  it('returns a confirmable action intent for write operations', () => {
    const r = replyTo('githubでissueを作って', CTX);
    expect(r.kind).toBe('action');
    expect(r.navigateTo).toBe('github');
    expect(r.intent?.kind).toBe('action');
    expect(r.intent?.serviceId).toBe('github');
    expect(r.intent?.action).toBe('create-issue');
    expect(r.needsConfirmation).toBe(true);
  });

  it('falls back when the navigate service is not in the injected services', () => {
    const slim: ChatContext = { ...CTX, services: [] };
    const r = replyTo('税務試算を開いて', slim);
    expect(r.kind).toBe('fallback');
    expect(r.routedThrough).toBe('COO 直轄');
  });

  it('falls back (without throwing) when an action service is not in the injected services', () => {
    // capabilities は github action を許すが services 一覧に無い → action 分岐に入らない。
    const slim: ChatContext = { ...CTX, services: [] };
    const r = replyTo('githubでissueを作って', slim);
    // '作って' は要望マーカーでもあるため、action へ解決できない場合は要望として受け付ける。
    expect(r.kind).toBe('request');
    expect(r.intent).toBeUndefined();
  });

  it('falls back for a service-independent backup action (no serviceId)', () => {
    // 'バックアップ' は service 非依存 action — service が引けないので action 分岐に
    // 入らず fallback になる (分岐ガード service !== undefined を固定)。
    const r = replyTo('バックアップ', CTX);
    expect(r.kind).toBe('fallback');
    expect(r.intent).toBeUndefined();
  });

  it('answers a take-home calc inline (額面→手取り)', () => {
    const r = replyTo('額面40万の手取りは？', CTX);
    expect(r.kind).toBe('calc');
    expect(r.text).toContain('¥310,080');
    expect(r.navigateTo).toBeUndefined();
    // 給与の話題は税務部長 (フィクスチャでは 給与 を含む語幹なし) → COO 直轄ではなく
    // routeTopic に委譲した結果をそのまま使う。フィクスチャでは未解決 = COO 直轄。
    expect(r.routedThrough).toBe('COO 直轄');
  });

  it('answers a required-gross calc and beats the request marker when an amount is present', () => {
    // 「欲しい」(要望マーカー) を含むが金額付きなので計算を優先する。
    const r = replyTo('手取りで26.5万欲しい', CTX);
    expect(r.kind).toBe('calc');
    expect(r.text).toContain('に必要な額面');
  });

  it('keeps amount-less 手取り wishes as feature requests', () => {
    const r = replyTo('手取りグラフ機能が欲しい', CTX);
    expect(r.kind).toBe('request');
  });

  it('falls back for unintelligible smalltalk', () => {
    const r = replyTo('こんにちは', CTX);
    expect(r.kind).toBe('fallback');
    expect(r.navigateTo).toBeUndefined();
    expect(r.suggestions.length).toBeGreaterThan(0);
  });
});
