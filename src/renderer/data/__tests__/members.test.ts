import { describe, expect, it } from 'vitest';
import {
  parseMember,
  countOwners,
  MEMBERS_COLLECTION,
  computeWorkforceMetrics,
  roleComposition,
  seatUtilization,
  revenueNeededForHire,
  type Member,
} from '../members';

describe('parseMember', () => {
  const base = { name: '山田太郎', email: 'taro@example.com', role: 'member' };

  it('exposes the team-members collection key', () => {
    expect(MEMBERS_COLLECTION).toBe('team-members');
  });

  it('rejects an email with internal whitespace or trailing junk (anchored regex)', () => {
    // ^/$ アンカーを外す Regex mutant は部分一致で受理してしまうため、これらを reject。
    expect(() => parseMember({ ...base, email: 'a b@c.d' })).toThrow('メールアドレスの形式が正しくありません');
    expect(() => parseMember({ ...base, email: 'a@b.c d' })).toThrow('メールアドレスの形式が正しくありません');
  });

  it('accepts an email of exactly 254 chars but rejects 255 (length boundary)', () => {
    const at254 = 'a'.repeat(249) + '@b.cd'; // 254 文字, 形式は妥当
    const at255 = 'a'.repeat(250) + '@b.cd'; // 255 文字
    expect(parseMember({ ...base, email: at254 }).email).toBe(at254);
    expect(() => parseMember({ ...base, email: at255 })).toThrow('メールアドレスの形式が正しくありません');
  });

  it('accepts a name of exactly 64 chars (> strict)', () => {
    expect(parseMember({ ...base, name: 'x'.repeat(64) }).name).toBe('x'.repeat(64));
  });

  it('reports the field error (not a TypeError) when name/email are non-strings', () => {
    // typeof ガードを true 固定する mutant は .trim() で TypeError を投げるため、
    // 期待する日本語メッセージで殺せる。
    expect(() => parseMember({ ...base, name: 123 })).toThrow('氏名は 1〜64 文字で入力してください');
    expect(() => parseMember({ ...base, email: 123 })).toThrow('メールアドレスの形式が正しくありません');
  });

  it('trims a padded email before validating (trim must run)', () => {
    // .trim() を外す mutant は前後空白付きを invalid にするため、受理+整形結果で殺す。
    expect(parseMember({ ...base, email: '  ok@example.com  ' }).email).toBe('ok@example.com');
  });

  it('trims and accepts a valid member', () => {
    expect(parseMember({ ...base, name: '  山田太郎  ' })).toEqual({
      name: '山田太郎',
      email: 'taro@example.com',
      role: 'member',
    });
  });

  it('rejects an empty or oversized name', () => {
    expect(() => parseMember({ ...base, name: '  ' })).toThrow(/氏名/);
    expect(() => parseMember({ ...base, name: 'x'.repeat(65) })).toThrow(/氏名/);
  });

  it('rejects a malformed email', () => {
    expect(() => parseMember({ ...base, email: 'not-an-email' })).toThrow(/メール/);
    expect(() => parseMember({ ...base, email: 'a@b' })).toThrow(/メール/);
  });

  it('rejects an invalid role', () => {
    expect(() => parseMember({ ...base, role: 'superuser' })).toThrow(/役割/);
  });
});

describe('countOwners', () => {
  it('counts owners in a list', () => {
    const members: Member[] = [
      { name: 'A', email: 'a@x.com', role: 'owner' },
      { name: 'B', email: 'b@x.com', role: 'admin' },
      { name: 'C', email: 'c@x.com', role: 'owner' },
    ];
    expect(countOwners(members)).toBe(2);
    expect(countOwners([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// round 76: 人員・組織分析の精緻化 (加算的)
// ---------------------------------------------------------------------------

describe('computeWorkforceMetrics (労働生産性・人件費効率)', () => {
  const base = {
    headcount: 10,
    revenue: 100_000_000,
    operatingProfit: 12_000_000,
    valueAdded: 40_000_000,
    laborCost: 24_000_000,
  };

  it('一人当たり売上/営業利益/付加価値を人数で割る', () => {
    const m = computeWorkforceMetrics(base);
    expect(m.revenuePerHead).toBe(10_000_000);
    expect(m.operatingProfitPerHead).toBe(1_200_000);
    expect(m.valueAddedPerHead).toBe(4_000_000);
  });

  it('人件費率 = 人件費 ÷ 売上 (%)、労働分配率 = 人件費 ÷ 付加価値 (%)', () => {
    const m = computeWorkforceMetrics(base);
    expect(m.laborCostRatioPct).toBe(24); // 24,000,000 / 100,000,000 = 24%
    expect(m.laborSharePct).toBe(60); // 24,000,000 / 40,000,000 = 60%
  });

  it('小数の比率を第 1 位まで丸める (四捨五入)', () => {
    // laborCost/revenue = 1/3 = 33.333..% → 33.3
    const m = computeWorkforceMetrics({ ...base, laborCost: 1, revenue: 3, valueAdded: 7 });
    expect(m.laborCostRatioPct).toBe(33.3);
    // 1/7 = 14.2857..% → 14.3
    expect(m.laborSharePct).toBe(14.3);
  });

  it('一人当たり金額は四捨五入で整数に丸める', () => {
    // 10 / 3 = 3.333.. → 3, 20 / 3 = 6.666.. → 7
    const m = computeWorkforceMetrics({
      headcount: 3,
      revenue: 10,
      operatingProfit: 20,
      valueAdded: 8,
      laborCost: 0,
    });
    expect(m.revenuePerHead).toBe(3);
    expect(m.operatingProfitPerHead).toBe(7);
  });

  it('人数 0 は一人当たり指標を null にする (ゼロ除算ガード)', () => {
    const m = computeWorkforceMetrics({ ...base, headcount: 0 });
    expect(m.revenuePerHead).toBeNull();
    expect(m.operatingProfitPerHead).toBeNull();
    expect(m.valueAddedPerHead).toBeNull();
    // 売上・付加価値ベースの比率は人数に依存しないので算定可
    expect(m.laborCostRatioPct).toBe(24);
    expect(m.laborSharePct).toBe(60);
  });

  it('人数が負/非有限なら一人当たり指標は null', () => {
    expect(computeWorkforceMetrics({ ...base, headcount: -5 }).revenuePerHead).toBeNull();
    expect(computeWorkforceMetrics({ ...base, headcount: NaN }).revenuePerHead).toBeNull();
    expect(computeWorkforceMetrics({ ...base, headcount: Infinity }).revenuePerHead).toBeNull();
  });

  it('売上 0/負は人件費率を null、付加価値 0/負は労働分配率を null にする', () => {
    expect(computeWorkforceMetrics({ ...base, revenue: 0 }).laborCostRatioPct).toBeNull();
    expect(computeWorkforceMetrics({ ...base, revenue: -1 }).laborCostRatioPct).toBeNull();
    expect(computeWorkforceMetrics({ ...base, valueAdded: 0 }).laborSharePct).toBeNull();
    expect(computeWorkforceMetrics({ ...base, valueAdded: -1 }).laborSharePct).toBeNull();
  });

  it('営業利益の損失 (マイナス) は一人当たりに反映する (分子は弾かない)', () => {
    const m = computeWorkforceMetrics({ ...base, operatingProfit: -5_000_000 });
    expect(m.operatingProfitPerHead).toBe(-500_000);
  });

  it('分子が非有限なら一人当たりは null', () => {
    expect(computeWorkforceMetrics({ ...base, revenue: Infinity }).revenuePerHead).toBeNull();
    expect(computeWorkforceMetrics({ ...base, laborCost: NaN }).laborCostRatioPct).toBeNull();
  });
});

describe('roleComposition (ロール別構成比)', () => {
  it('全ロールを ROLE_ORDER 順 (member→admin→owner) で網羅し構成比を出す', () => {
    const members: Member[] = [
      { name: 'A', email: 'a@x.com', role: 'owner' },
      { name: 'B', email: 'b@x.com', role: 'admin' },
      { name: 'C', email: 'c@x.com', role: 'member' },
      { name: 'D', email: 'd@x.com', role: 'member' },
    ];
    const comp = roleComposition(members);
    expect(comp.map((c) => c.role)).toEqual(['member', 'admin', 'owner']);
    expect(comp.map((c) => c.count)).toEqual([2, 1, 1]);
    // 2/4=50, 1/4=25, 1/4=25
    expect(comp.map((c) => c.sharePct)).toEqual([50, 25, 25]);
  });

  it('在籍 0 のロールも count 0 / sharePct で必ず含める', () => {
    const members: Member[] = [{ name: 'A', email: 'a@x.com', role: 'owner' }];
    const comp = roleComposition(members);
    const pick = (role: string) => comp.find((c) => c.role === role)!;
    expect(pick('member').count).toBe(0);
    expect(pick('member').sharePct).toBe(0); // 0/1 = 0
    expect(pick('admin').count).toBe(0);
    expect(pick('owner').count).toBe(1);
    expect(pick('owner').sharePct).toBe(100);
  });

  it('空リストは全ロール count 0 / sharePct null (ゼロ除算ガード)', () => {
    const comp = roleComposition([]);
    expect(comp).toHaveLength(3);
    for (const c of comp) {
      expect(c.count).toBe(0);
      expect(c.sharePct).toBeNull();
    }
  });

  it('構成比は四捨五入で第 1 位まで', () => {
    // 1/3 = 33.333% → 33.3
    const members: Member[] = [
      { name: 'A', email: 'a@x.com', role: 'owner' },
      { name: 'B', email: 'b@x.com', role: 'admin' },
      { name: 'C', email: 'c@x.com', role: 'member' },
    ];
    const comp = roleComposition(members);
    for (const c of comp) expect(c.sharePct).toBe(33.3);
  });
});

describe('seatUtilization (シート充足率・空席数)', () => {
  it('充足率 = 在籍 ÷ 上限、空席 = 上限 − 在籍', () => {
    const s = seatUtilization(7, 10);
    expect(s.used).toBe(7);
    expect(s.limit).toBe(10);
    expect(s.fillRatePct).toBe(70);
    expect(s.openSeats).toBe(3);
    expect(s.atCapacity).toBe(false);
  });

  it('在籍が上限と等しいと充足率 100% / 空席 0 / atCapacity true', () => {
    const s = seatUtilization(10, 10);
    expect(s.fillRatePct).toBe(100);
    expect(s.openSeats).toBe(0);
    expect(s.atCapacity).toBe(true);
  });

  it('在籍が上限を超えても空席は 0 にクランプ (負にしない)', () => {
    const s = seatUtilization(12, 10);
    expect(s.openSeats).toBe(0);
    expect(s.fillRatePct).toBe(120);
    expect(s.atCapacity).toBe(true);
  });

  it('上限 0 (未設定) は充足率 null・空席 0・atCapacity false', () => {
    const s = seatUtilization(5, 0);
    expect(s.fillRatePct).toBeNull();
    expect(s.openSeats).toBe(0);
    expect(s.atCapacity).toBe(false);
  });

  it('上限 Infinity (無制限) は充足率 null・空席 Infinity・atCapacity false', () => {
    const s = seatUtilization(5, Infinity);
    expect(s.limit).toBe(Infinity);
    expect(s.fillRatePct).toBeNull();
    expect(s.openSeats).toBe(Infinity);
    expect(s.atCapacity).toBe(false);
  });

  it('上限が負/NaN/-Infinity は未設定 (0) に寄せる', () => {
    expect(seatUtilization(5, -3).limit).toBe(0);
    expect(seatUtilization(5, NaN).limit).toBe(0);
    expect(seatUtilization(5, -Infinity).limit).toBe(0);
    expect(seatUtilization(5, -3).openSeats).toBe(0);
    expect(seatUtilization(5, -3).atCapacity).toBe(false);
  });

  it('在籍が負/NaN/Infinity は 0 に丸める', () => {
    expect(seatUtilization(-2, 10).used).toBe(0);
    expect(seatUtilization(NaN, 10).used).toBe(0);
    expect(seatUtilization(Infinity, 10).used).toBe(0);
    // used=0, limit=10 → 空席 10
    expect(seatUtilization(-2, 10).openSeats).toBe(10);
  });

  it('在籍 0 で有限上限なら atCapacity は false (空席あり)', () => {
    const s = seatUtilization(0, 5);
    expect(s.fillRatePct).toBe(0);
    expect(s.openSeats).toBe(5);
    expect(s.atCapacity).toBe(false);
  });

  it('充足率は四捨五入で第 1 位まで', () => {
    // 1/3 = 33.333% → 33.3
    expect(seatUtilization(1, 3).fillRatePct).toBe(33.3);
  });
});

describe('revenueNeededForHire (1名増員に必要な売上の逆算)', () => {
  it('必要売上 = 1名人件費 ÷ 人件費率 (人件費率 = laborCost/revenue)', () => {
    // 人件費率 = 24M/100M = 0.24、必要売上 = 6M / 0.24 = 25M
    expect(
      revenueNeededForHire({ revenue: 100_000_000, laborCost: 24_000_000, perHeadLaborCost: 6_000_000 }),
    ).toBe(25_000_000);
  });

  it('四捨五入で整数に丸める', () => {
    // 率 = 1/3、必要売上 = 1 / (1/3) = 3
    expect(revenueNeededForHire({ revenue: 3, laborCost: 1, perHeadLaborCost: 1 })).toBe(3);
    // 率 = 2/3、必要売上 = 1 / (2/3) = 1.5 → 2
    expect(revenueNeededForHire({ revenue: 3, laborCost: 2, perHeadLaborCost: 1 })).toBe(2);
  });

  it('売上 ≤ 0 は null', () => {
    expect(revenueNeededForHire({ revenue: 0, laborCost: 10, perHeadLaborCost: 5 })).toBeNull();
    expect(revenueNeededForHire({ revenue: -1, laborCost: 10, perHeadLaborCost: 5 })).toBeNull();
  });

  it('人件費 ≤ 0 は null (人件費率 0 で割れない)', () => {
    expect(revenueNeededForHire({ revenue: 100, laborCost: 0, perHeadLaborCost: 5 })).toBeNull();
    expect(revenueNeededForHire({ revenue: 100, laborCost: -1, perHeadLaborCost: 5 })).toBeNull();
  });

  it('1名人件費 ≤ 0 は null', () => {
    expect(revenueNeededForHire({ revenue: 100, laborCost: 10, perHeadLaborCost: 0 })).toBeNull();
    expect(revenueNeededForHire({ revenue: 100, laborCost: 10, perHeadLaborCost: -5 })).toBeNull();
  });

  it('非有限 (NaN/Infinity) はいずれも null', () => {
    expect(revenueNeededForHire({ revenue: NaN, laborCost: 10, perHeadLaborCost: 5 })).toBeNull();
    expect(revenueNeededForHire({ revenue: 100, laborCost: Infinity, perHeadLaborCost: 5 })).toBeNull();
    expect(revenueNeededForHire({ revenue: 100, laborCost: 10, perHeadLaborCost: NaN })).toBeNull();
  });
});
