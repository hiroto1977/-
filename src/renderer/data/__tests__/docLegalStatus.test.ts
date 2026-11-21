import { describe, expect, it } from 'vitest';
import { STUDIO_TEMPLATES } from '../docStudioData';
import {
  DOC_LEGAL_STATUS,
  STATUS_DESCRIPTION,
  STATUS_LABEL,
  STATUS_ORDER,
  countByStatus,
  legalStatusOf,
  retentionOf,
  statusRank,
  type LegalStatus,
} from '../docLegalStatus';

/** STUDIO_TEMPLATES に無い別コレクション。仕分けの対象からは外さない。 */
const OTHER_COLLECTIONS = ['teikan-kk', 'teikan-gk', 'shugyo', 'kessan', 'kessan-pl', 'kessan-bs', 'kessan-equity', 'kessan-notes'] as const;

describe('仕分けの網羅', () => {
  it('全書式が仕分けされている（足して忘れたら落ちる）', () => {
    const missing = STUDIO_TEMPLATES.filter((d) => legalStatusOf(d.id).status === 'unclassified');
    expect(missing.map((d) => `${d.id} (${d.label})`)).toEqual([]);
  });

  it('定款・就業規則・決算書も仕分けされている', () => {
    for (const id of OTHER_COLLECTIONS) {
      expect(legalStatusOf(id).status, `${id} が未分類`).not.toBe('unclassified');
    }
  });

  it('仕分け表に、実在しない書式 id が混ざっていない', () => {
    // 書式を消したのに仕分けが残ると、件数が合わずに数字だけが狂う。
    const known = new Set<string>([...STUDIO_TEMPLATES.map((d) => d.id), ...OTHER_COLLECTIONS]);
    const stale = Object.keys(DOC_LEGAL_STATUS).filter((id) => !known.has(id));
    expect(stale).toEqual([]);
  });

  it('知らない id は「任意」ではなく「未分類」にする', () => {
    // 任意に倒すと、仕分け漏れが「義務なし」として黙って混ざる。
    expect(legalStatusOf('no-such-doc').status).toBe('unclassified');
  });
});

describe('根拠のない「法定」を作らない', () => {
  it('法定・条件付きには必ず根拠条文がある', () => {
    for (const [id, info] of Object.entries(DOC_LEGAL_STATUS)) {
      if (info.status === 'mandatory' || info.status === 'conditional') {
        expect(info.basis, `${id} に根拠条文が無い`).toBeTruthy();
      }
    }
  });

  it('条件付きには「どういう場合に義務か」が書いてある', () => {
    for (const [id, info] of Object.entries(DOC_LEGAL_STATUS)) {
      if (info.status === 'conditional') {
        expect(info.when, `${id} に条件が無い`).toBeTruthy();
      }
    }
  });

  it('注意書き・保存期間は、書くなら中身がある（空文字で置かない）', () => {
    // 空の caveat は「注意点なし」と読めてしまう。無いなら省く、書くなら書く。
    for (const [id, info] of Object.entries(DOC_LEGAL_STATUS)) {
      if ('caveat' in info) expect(info.caveat, `${id} の caveat が空`).toBeTruthy();
      if ('retention' in info) expect(info.retention, `${id} の retention が空`).toBeTruthy();
      if ('basis' in info) expect(info.basis, `${id} の basis が空`).toBeTruthy();
      if ('when' in info) expect(info.when, `${id} の when が空`).toBeTruthy();
    }
  });

  it('注意書きは条文番号か具体的な条件を含む（中身のない一言にしない）', () => {
    for (const [id, info] of Object.entries(DOC_LEGAL_STATUS)) {
      if (info.caveat === undefined) continue;
      expect(info.caveat.length, `${id} の caveat が短すぎる`).toBeGreaterThan(10);
    }
  });

  it('任意に根拠条文を付けない（義務でないものを義務らしく見せない）', () => {
    for (const [id, info] of Object.entries(DOC_LEGAL_STATUS)) {
      if (info.status === 'optional') {
        expect(info.basis, `${id} は任意なのに根拠条文がある`).toBeUndefined();
        expect(info.when, `${id} は任意なのに条件がある`).toBeUndefined();
      }
    }
  });
});

describe('法定三帳簿と年次有給休暇管理簿', () => {
  it('法定三帳簿はいずれも法定', () => {
    for (const id of ['roudousha-meibo', 'chingin-daichou', 'shukkinbo']) {
      expect(legalStatusOf(id).status, id).toBe('mandatory');
    }
  });

  it('労働基準法109条の帳簿は 5年（当分の間3年）', () => {
    for (const id of ['roudousha-meibo', 'chingin-daichou', 'shukkinbo']) {
      expect(retentionOf(id), id).toBe('5年（労働基準法109条。附則143条により当分の間3年）');
    }
  });

  it('年次有給休暇管理簿だけ保存期間の根拠が別で 3年', () => {
    // 109条の帳簿と同じ 5年 だと思い込む取り違えが多い。
    const info = legalStatusOf('yukyu-kanribo');
    expect(info.status).toBe('mandatory');
    expect(info.basis).toBe('労働基準法施行規則24条の7');
    expect(info.retention).toBe('3年（有給休暇を与えた期間中および満了後3年間）');
    expect(retentionOf('yukyu-kanribo')).not.toBe(retentionOf('chingin-daichou'));
  });

  it('出勤簿は「法律が名指ししていない」ことを添える', () => {
    expect(legalStatusOf('shukkinbo').caveat).toContain('名指しで定める帳簿ではない');
  });
});

describe('2 分にすると誤りになるものを条件付きにしている', () => {
  it('36協定は時間外労働をさせる場合の義務', () => {
    const info = legalStatusOf('saburoku');
    expect(info.status).toBe('conditional');
    expect(info.basis).toBe('労働基準法36条1項');
    expect(info.when).toContain('法定労働時間を超えて');
  });

  it('就業規則は常時10人以上の事業場の義務', () => {
    const info = legalStatusOf('shugyo');
    expect(info.status).toBe('conditional');
    expect(info.when).toContain('10人以上');
  });

  it('適格請求書は発行事業者が求められたときの義務', () => {
    const info = legalStatusOf('invoice');
    expect(info.status).toBe('conditional');
    expect(info.basis).toBe('消費税法57条の4');
  });

  it('退職証明書は請求があったときの義務', () => {
    expect(legalStatusOf('taishoku-shomei').status).toBe('conditional');
    expect(legalStatusOf('taishoku-shomei').when).toContain('請求');
  });
});

describe('明らかに法定のもの / 明らかに任意のもの', () => {
  it('株主名簿・議事録・定款・計算書類は法定', () => {
    for (const id of ['kabunushi-meibo', 'sokai', 'torishimari', 'rinji-sokai', 'teikan-kk', 'teikan-gk', 'kessan', 'kessan-pl', 'kessan-bs', 'kessan-equity', 'kessan-notes']) {
      expect(legalStatusOf(id).status, id).toBe('mandatory');
    }
  });

  it('社内文書・事業計画は任意', () => {
    for (const id of ['ringi', 'gijiroku', 'keihi', 'shucchou', 'houkoku', 'jigyo-keikaku', 'shikin-guri']) {
      expect(legalStatusOf(id).status, id).toBe('optional');
    }
  });

  it('社内の議事録と株主総会議事録を取り違えないよう注意書きがある', () => {
    expect(legalStatusOf('gijiroku').caveat).toContain('株主総会・取締役会の議事録は別');
  });

  it('労働条件通知書は明示義務があるので法定', () => {
    expect(legalStatusOf('roudou').status).toBe('mandatory');
    expect(legalStatusOf('roudou').basis).toContain('労働基準法15条1項');
  });
});

describe('表示の補助', () => {
  it('4 つの区分すべてにラベルがある', () => {
    const all: LegalStatus[] = ['mandatory', 'conditional', 'optional', 'unclassified'];
    for (const s of all) expect(STATUS_LABEL[s]).toBeTruthy();
    expect(STATUS_LABEL.mandatory).toBe('法定');
    expect(STATUS_LABEL.conditional).toBe('条件付き');
    expect(STATUS_LABEL.optional).toBe('任意');
    expect(STATUS_LABEL.unclassified).toBe('未分類');
  });

  it('4 つの区分すべてに説明文がある', () => {
    const all: LegalStatus[] = ['mandatory', 'conditional', 'optional', 'unclassified'];
    for (const st of all) {
      expect(STATUS_DESCRIPTION[st], st).toBeTruthy();
      expect(STATUS_DESCRIPTION[st].length, st).toBeGreaterThan(5);
    }
    // 「法定」と「任意」の説明が同じ文言だと、色以外に区別が付かない。
    expect(STATUS_DESCRIPTION.mandatory).not.toBe(STATUS_DESCRIPTION.optional);
    expect(STATUS_DESCRIPTION.conditional).not.toBe(STATUS_DESCRIPTION.mandatory);
    expect(STATUS_DESCRIPTION.unclassified).toContain('不具合');
  });

  it('区分のラベルは互いに違う（同じ字面だと仕分けの意味がない）', () => {
    const labels = Object.values(STATUS_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('並び順は義務の重い順', () => {
    expect([...STATUS_ORDER]).toEqual(['mandatory', 'conditional', 'optional', 'unclassified']);
    expect(statusRank('mandatory')).toBeLessThan(statusRank('conditional'));
    expect(statusRank('conditional')).toBeLessThan(statusRank('optional'));
    expect(statusRank('optional')).toBeLessThan(statusRank('unclassified'));
  });

  it('件数を区分ごとに数える', () => {
    const c = countByStatus(['roudousha-meibo', 'chingin-daichou', 'saburoku', 'ringi', 'no-such-doc']);
    expect(c).toEqual({ mandatory: 2, conditional: 1, optional: 1, unclassified: 1 });
  });

  it('空の入力ではすべて 0', () => {
    expect(countByStatus([])).toEqual({ mandatory: 0, conditional: 0, optional: 0, unclassified: 0 });
  });

  it('保存期間は分かっているものだけ返す', () => {
    expect(retentionOf('chingin-daichou')).toBeTruthy();
    expect(retentionOf('ringi')).toBeNull();
    expect(retentionOf('no-such-doc')).toBeNull();
  });

  it('全書式で数えると合計が書式数と一致する', () => {
    const c = countByStatus(STUDIO_TEMPLATES.map((d) => d.id));
    expect(c.mandatory + c.conditional + c.optional + c.unclassified).toBe(STUDIO_TEMPLATES.length);
    expect(c.unclassified).toBe(0);
    // 「法定だけ」で絞ったときに 0 件になっては道具にならない。
    expect(c.mandatory).toBeGreaterThan(0);
    expect(c.conditional).toBeGreaterThan(0);
    expect(c.optional).toBeGreaterThan(0);
  });
});
