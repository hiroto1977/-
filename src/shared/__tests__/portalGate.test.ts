import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_SCREENS,
  externalPortalScreens,
  isPortalId,
  PARTNER_SCREENS,
  PORTAL_IDS,
  PORTALS,
  portalScreenOrNull,
  portalScreenRef,
  type VettedPortalScreen,
} from '../portal';
import { isServiceId, SERVICE_IDS } from '../serviceId';
import { credentialUseOf } from '../credentialUse';

/*
 * **ポータルの台帳と入口の関門** (2026-11-11 · `shared/portal.mamori`)。
 *
 * 社外の人へ配る HTML に出してよい画面は、台帳に名指しした物だけ。関門 `portalScreenOrNull` は
 * 「そのポータルでその画面を開いてよいか」を答え、開く口はその戻り値 (印つき) しか受けない。
 *
 * 守る物は 3 つ:
 * 1. 社外のポータルは、台帳に無い画面を 1 つも通さない (社内の 78 画面を総当たりする)。
 * 2. 社外へ出すアプリの画面は、資格情報を預からない物だけ (預かる画面を社外へ配らない)。
 * 3. 印つきの値は、読み戻すと同じ (ポータル, 画面) になる。
 */

describe('ポータルの台帳', () => {
  it('3 つのポータルが並び順どおりに在り、id は一意', () => {
    expect(PORTAL_IDS).toEqual(['internal', 'partner', 'customer']);
    expect(PORTALS.map((p) => p.id)).toEqual([...PORTAL_IDS]);
    for (const p of PORTALS) {
      expect(p.label.endsWith('ポータル'), p.id).toBe(true);
      expect(p.audience.length, p.id).toBeGreaterThan(1);
      expect(p.summary.length, p.id).toBeGreaterThan(10);
      expect(p.delivery.length, p.id).toBeGreaterThan(10);
    }
  });

  it('isPortalId は 3 つだけを通す', () => {
    for (const id of PORTAL_IDS) expect(isPortalId(id)).toBe(true);
    for (const bad of ['', 'Internal', 'partner ', 'admin', 'constructor', '__proto__', 0, null, undefined, {}, ['partner']]) {
      expect(isPortalId(bad), String(bad)).toBe(false);
    }
  });

  it('社外の一覧: パートナーとカスタマーは空でなく、社内は一覧を持たない', () => {
    expect(externalPortalScreens('partner')).toBe(PARTNER_SCREENS);
    expect(externalPortalScreens('customer')).toBe(CUSTOMER_SCREENS);
    expect(externalPortalScreens('internal')).toEqual([]);
    expect(PARTNER_SCREENS.length).toBeGreaterThanOrEqual(2);
    expect(CUSTOMER_SCREENS.length).toBeGreaterThanOrEqual(2);
  });

  it('どの行も id が一意で、出す理由を持つ', () => {
    for (const [portal, screens] of [['partner', PARTNER_SCREENS], ['customer', CUSTOMER_SCREENS]] as const) {
      const ids = screens.map((s) => s.id);
      expect(new Set(ids).size, portal).toBe(ids.length);
      for (const s of screens) {
        expect(s.id, portal).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(s.label.length, `${portal}/${s.id}`).toBeGreaterThan(1);
        expect(s.why.length, `${portal}/${s.id}: 社外へ出す理由`).toBeGreaterThan(15);
      }
    }
  });

  it('★ 社外へ出すアプリの画面は実在する ServiceId で、資格情報を預からない', () => {
    const service = [...PARTNER_SCREENS, ...CUSTOMER_SCREENS].filter((s) => s.kind === 'service');
    expect(service.length, '走査が空でない').toBeGreaterThanOrEqual(1);
    for (const s of service) {
      if (!isServiceId(s.id)) throw new Error(`${s.id} は ServiceId ではない`);
      expect(credentialUseOf(s.id), `${s.id} は資格情報を預かる画面 —— 社外へ配らない`).toBe('none');
    }
  });

  it('★ カスタマーポータルはアプリの画面を 1 つも出さない (どれも社内の仕事の道具)', () => {
    expect(CUSTOMER_SCREENS.filter((s) => s.kind === 'service')).toEqual([]);
  });

  it('会社が載せる頁の id は ServiceId と重ならない (取り違えない)', () => {
    const published = [...PARTNER_SCREENS, ...CUSTOMER_SCREENS].filter((s) => s.kind === 'published');
    expect(published.length).toBeGreaterThanOrEqual(4);
    for (const s of published) {
      expect((SERVICE_IDS as readonly string[]).includes(s.id), `${s.id} が ServiceId と同じ綴り`).toBe(false);
    }
  });
});

describe('入口の関門 portalScreenOrNull', () => {
  it('社内: アプリの画面ならどれでも通す', () => {
    for (const id of SERVICE_IDS) {
      expect(portalScreenOrNull('internal', id), id).toBe(`internal/${id}`);
    }
  });

  it('社内: アプリの画面でない物は通さない (会社が載せる頁も社内には無い)', () => {
    for (const bad of ['', 'no-such-page', 'guidelines', 'notices', 'constructor', '__proto__', 'settings/../x', 'SETTINGS']) {
      expect(portalScreenOrNull('internal', bad), bad).toBeNull();
    }
  });

  it('社外: 台帳に名指しした画面は通す', () => {
    for (const s of PARTNER_SCREENS) expect(portalScreenOrNull('partner', s.id)).toBe(`partner/${s.id}`);
    for (const s of CUSTOMER_SCREENS) expect(portalScreenOrNull('customer', s.id)).toBe(`customer/${s.id}`);
  });

  it('★ 社外: 台帳に無い画面は 1 つも通さない (社内の全画面を総当たり)', () => {
    for (const portal of ['partner', 'customer'] as const) {
      const listed = new Set(externalPortalScreens(portal).map((s) => s.id));
      let refused = 0;
      for (const id of SERVICE_IDS) {
        if (listed.has(id)) continue;
        expect(portalScreenOrNull(portal, id), `${portal} が ${id} を通した`).toBeNull();
        refused += 1;
      }
      // 走査が空でない床: 社内の画面のほとんどは社外に出ない。
      expect(refused, portal).toBeGreaterThanOrEqual(SERVICE_IDS.length - 5);
    }
  });

  it('★ 社外: 保管庫・設定・AI・外部サービス連携の画面を名指しで断る (標本)', () => {
    for (const id of ['settings', 'assistant', 'github', 'slack', 'gmail', 'stripe', 'team', 'overview', 'kpi', 'tax-accountant']) {
      expect((SERVICE_IDS as readonly string[]).includes(id), `${id} は実在する (標本が的に当たる)`).toBe(true);
      expect(portalScreenOrNull('partner', id), id).toBeNull();
      expect(portalScreenOrNull('customer', id), id).toBeNull();
    }
  });

  it('社外: 隣のポータルの画面は通さない (パートナーの画面をカスタマーで開けない)', () => {
    const partnerOnly = PARTNER_SCREENS.filter((p) => !CUSTOMER_SCREENS.some((c) => c.id === p.id));
    expect(partnerOnly.length).toBeGreaterThanOrEqual(1);
    for (const s of partnerOnly) expect(portalScreenOrNull('customer', s.id), s.id).toBeNull();
    const customerOnly = CUSTOMER_SCREENS.filter((c) => !PARTNER_SCREENS.some((p) => p.id === c.id));
    expect(customerOnly.length).toBeGreaterThanOrEqual(1);
    for (const s of customerOnly) expect(portalScreenOrNull('partner', s.id), s.id).toBeNull();
  });

  it('知らないポータル・文字列でない値は通さない (閉じる向き)', () => {
    const listed = PARTNER_SCREENS[0]!.id;
    for (const portal of ['', 'admin', 'Partner', 'partner/', 'internal/partner', 'constructor', '__proto__', 1, null, undefined, {}, ['partner']]) {
      expect(portalScreenOrNull(portal, listed), String(portal)).toBeNull();
      expect(portalScreenOrNull(portal, 'settings'), String(portal)).toBeNull();
    }
    for (const screen of [1, null, undefined, {}, [listed], { toString: () => listed }]) {
      expect(portalScreenOrNull('partner', screen), String(screen)).toBeNull();
      expect(portalScreenOrNull('internal', screen), String(screen)).toBeNull();
    }
  });

  it('画面の綴りは完全一致 (前後の空白・大文字・道の区切りを受けない)', () => {
    const listed = PARTNER_SCREENS[0]!.id;
    for (const bad of [` ${listed}`, `${listed} `, listed.toUpperCase(), `${listed}/x`, `x/${listed}`, `${listed}\n`, `${listed}#x`]) {
      expect(portalScreenOrNull('partner', bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('印の読み戻し portalScreenRef', () => {
  it('関門を通った値は、同じポータル・画面・種類に戻る', () => {
    for (const portal of ['partner', 'customer'] as const) {
      for (const s of externalPortalScreens(portal)) {
        const v = portalScreenOrNull(portal, s.id);
        expect(v).not.toBeNull();
        expect(portalScreenRef(v as VettedPortalScreen)).toEqual({ portal, screen: s.id, kind: s.kind });
      }
    }
    const v = portalScreenOrNull('internal', 'settings');
    expect(portalScreenRef(v as VettedPortalScreen)).toEqual({ portal: 'internal', screen: 'settings', kind: 'service' });
  });

  it('台帳に無い値は読み戻さずに投げる (印を偽造した値を黙って通さない)', () => {
    // 型の守りを外して作った値 (関門を通っていない)。検査の中だけの形である。
    const forged = (s: string): VettedPortalScreen => s as unknown as VettedPortalScreen;
    for (const bad of ['partner/settings', 'customer/docstudio', 'internal/guidelines', 'admin/settings', 'settings', '', 'partner/']) {
      expect(() => portalScreenRef(forged(bad)), bad).toThrow(new Error('印つきのポータルの画面が台帳に無い: ' + bad));
    }
  });
});

/*
 * 型の守りの対照 (`npm run typecheck` が検査する)。素の string を開く口の引数へ渡すと `tsc` が断る。
 */
function compileTimeControls(raw: string): void {
  const takesScreen = (s: VettedPortalScreen): string => s;
  // @ts-expect-error 素の string は印つきのポータルの画面ではない
  takesScreen(raw);
  const gated = portalScreenOrNull('partner', raw);
  if (gated !== null) takesScreen(gated);
}
void compileTimeControls;
