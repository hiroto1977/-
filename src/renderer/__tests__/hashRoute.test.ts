import { describe, it, expect } from 'vitest';
import { PORTAL_IDS } from '../../shared/portal';
import { serviceIdFromHash, hashForService, portalIdFromHash, hashForPortal } from '../hashRoute';

describe('serviceIdFromHash', () => {
  it('先頭以外の # は除去しない (アンカー ^ を外すと別サービスへ誤ルーティングする)', () => {
    // /^#\/?/ の ^ を落とすと 'gith#ub' → 'github' になり、壊れた hash が
    // 実在サービスへ解決してしまう。アンカーが効いていることを固定する。
    expect(serviceIdFromHash('gith#ub')).toBeNull();
    expect(serviceIdFromHash('stock#s')).toBeNull();
  });

  it('有効な #<id> を ServiceId に解決する', () => {
    expect(serviceIdFromHash('#stocks')).toBe('stocks');
    expect(serviceIdFromHash('#github')).toBe('github');
  });

  it('先頭スラッシュ形式 (#/<id>) も解決する', () => {
    expect(serviceIdFromHash('#/stocks')).toBe('stocks');
  });

  it('ハイフン ID を解決する', () => {
    expect(serviceIdFromHash('#tax-accountant')).toBe('tax-accountant');
  });

  it('空ハッシュは null', () => {
    expect(serviceIdFromHash('')).toBeNull();
    expect(serviceIdFromHash('#')).toBeNull();
  });

  it('未知の id は null', () => {
    expect(serviceIdFromHash('#not-a-real-service')).toBeNull();
  });

  it('前後空白を無視する', () => {
    expect(serviceIdFromHash('#  stocks  ')).toBe('stocks');
  });

  it('hashForService は往復する', () => {
    expect(serviceIdFromHash(hashForService('notion'))).toBe('notion');
  });
});

describe('hashForService', () => {
  it('#<id> 形式を返す', () => {
    expect(hashForService('slack')).toBe('#slack');
  });
});

describe('portalIdFromHash (2026-11-11)', () => {
  it('#portal/<id> と #/portal/<id> を解決する (3 つとも)', () => {
    expect(portalIdFromHash('#portal/internal')).toBe('internal');
    expect(portalIdFromHash('#portal/partner')).toBe('partner');
    expect(portalIdFromHash('#portal/customer')).toBe('customer');
    expect(portalIdFromHash('#/portal/customer')).toBe('customer');
  });

  it('前後空白を無視する (serviceIdFromHash と同じ読み方)', () => {
    expect(portalIdFromHash('#  portal/partner  ')).toBe('partner');
  });

  it('先頭以外の # は除去しない (アンカー ^ を外すと壊れた hash がポータルへ解決する)', () => {
    // /^#\/?/ の ^ を落とすと 'portal/#partner' → 'portal/partner' になる。
    expect(portalIdFromHash('portal/#partner')).toBeNull();
    expect(portalIdFromHash('por#tal/customer')).toBeNull();
  });

  it('★ 接頭辞が無ければ null —— 接頭辞と同じ長さの別の字のあとに id が続く形も断る', () => {
    // 接頭辞の判定を外すと、先頭 7 字を何であれ切り落として残りを id として読む。
    expect(portalIdFromHash('#1234567partner')).toBeNull();
    expect(portalIdFromHash('#service/internal')).toBeNull();
    expect(portalIdFromHash('#partner')).toBeNull();
    expect(portalIdFromHash('#stocks')).toBeNull();
  });

  it('未知の id・空・接頭辞だけは null', () => {
    expect(portalIdFromHash('#portal/nope')).toBeNull();
    expect(portalIdFromHash('#portal/')).toBeNull();
    expect(portalIdFromHash('#portal')).toBeNull();
    expect(portalIdFromHash('#portal/partner/x')).toBeNull();
    expect(portalIdFromHash('')).toBeNull();
    expect(portalIdFromHash('#')).toBeNull();
  });

  it('ポータルの hash はサービスの hash として読まれない (逆も)', () => {
    for (const id of PORTAL_IDS) {
      expect(serviceIdFromHash(hashForPortal(id)), id).toBeNull();
    }
    expect(portalIdFromHash(hashForService('docstudio'))).toBeNull();
  });
});

describe('hashForPortal', () => {
  it('#portal/<id> 形式を返し、往復する (全ポータル)', () => {
    expect(hashForPortal('partner')).toBe('#portal/partner');
    expect(PORTAL_IDS.length).toBe(3);
    for (const id of PORTAL_IDS) {
      expect(portalIdFromHash(hashForPortal(id))).toBe(id);
    }
  });
});
