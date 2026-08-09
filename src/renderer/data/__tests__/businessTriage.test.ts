import { describe, expect, it } from 'vitest';
import {
  CONTRACT_NOTE,
  DISPUTE_CASE,
  EXTRA_DOC_IDS,
  REGISTRY_CASE,
  TRIAGE_ROWS,
  exclusiveCount,
  expectedDocIds,
  labelOf,
  lawOf,
  professionalsForService,
  triageFor,
} from '../businessTriage';
import { PROFESSIONAL_IDS, PROFESSIONAL_MAP, type ProfessionalProfile } from '../professionalMap';
import { STUDIO_TEMPLATES } from '../docStudioData';

describe('仕分けの網羅', () => {
  it('書式・定款・就業規則のすべてに仕分けがある', () => {
    // 書式を足して仕分けを忘れると、その書式だけ黙って何も出なくなる。
    const missing = expectedDocIds().filter((id) => triageFor(id) === null);
    expect(missing).toEqual([]);
  });

  it('仕分けに余計な行がない（リネームの取りこぼし検出）', () => {
    const expected = new Set(expectedDocIds());
    expect(TRIAGE_ROWS.filter((r) => !expected.has(r.doc)).map((r) => r.doc)).toEqual([]);
  });

  it('doc が重複していない', () => {
    const ids = TRIAGE_ROWS.map((r) => r.doc);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('対象は 48 書式 + 定款2 + 就業規則 + 決算書', () => {
    expect(STUDIO_TEMPLATES).toHaveLength(48);
    expect(EXTRA_DOC_IDS).toHaveLength(4);
    expect(TRIAGE_ROWS).toHaveLength(52);
    expect(expectedDocIds()).toHaveLength(52);
  });
});

describe('仕分けの中身', () => {
  it('自社分の注意は必ず書かれている', () => {
    for (const r of TRIAGE_ROWS) {
      expect(r.ownNote.trim().length, r.doc).toBeGreaterThan(20);
    }
  });

  it('独占に触れる相手は実在する士業だけ', () => {
    for (const r of TRIAGE_ROWS) {
      for (const id of [...r.exclusiveTo, ...r.consult]) {
        expect(PROFESSIONAL_IDS, `${r.doc}: ${id}`).toContain(id);
      }
    }
  });

  it('独占なしの中小企業診断士は exclusiveTo に現れない', () => {
    // 診断士は登録制の国家資格だが独占業務を持たない。ここに現れたら誤り。
    for (const r of TRIAGE_ROWS) {
      expect(r.exclusiveTo, r.doc).not.toContain('sme-consultant');
    }
    expect(PROFESSIONAL_MAP['sme-consultant'].exclusive).toContain('独占業務なし');
  });

  it('exclusiveTo と consult が同じ士業で重複しない', () => {
    for (const r of TRIAGE_ROWS) {
      const dup = r.exclusiveTo.filter((id) => r.consult.includes(id));
      expect(dup, r.doc).toEqual([]);
    }
  });

  it('caseByCase は断定せず、事案で変わる事実だけを書く', () => {
    for (const r of TRIAGE_ROWS) {
      if (!r.caseByCase) continue;
      expect(r.caseByCase.length, r.doc).toBeGreaterThan(30);
      // 「必ず違法」「絶対に不可」のような言い切りを caseByCase に置かない
      expect(r.caseByCase, r.doc).not.toMatch(/必ず違法|絶対に/);
    }
  });

  it('ownUse は 2 値のいずれか', () => {
    for (const r of TRIAGE_ROWS) {
      expect(['ok', 'ok-with-care'], r.doc).toContain(r.ownUse);
    }
  });
});

describe('労務書類は社労士の帳簿書類に寄せる', () => {
  const laborDocs = ['roudou', 'saburoku', 'chingin', 'shugyo'];

  it('就業規則・労使協定・雇用契約書・賃金規程は社労士の独占に触れる', () => {
    // 社会保険労務士法2条1項2号の帳簿書類の例示に含まれる。
    for (const doc of laborDocs) {
      expect(triageFor(doc)?.exclusiveTo, doc).toContain('labor-consultant');
    }
  });

  it('いずれも自社分は作れると明示する', () => {
    for (const doc of laborDocs) {
      const t = triageFor(doc)!;
      expect(t.ownUse, doc).toMatch(/^ok/);
      expect(t.caseByCase ?? '', doc).toContain('制限されない');
    }
  });

  it('相談だけなら独占ではない（社労士法27条は1号〜2号のみ）', () => {
    // 3号の相談・指導は 27 条の制限対象外。相談を独占として書いていないこと。
    const consultOnly = TRIAGE_ROWS.filter((r) => r.consult.includes('labor-consultant') && r.exclusiveTo.length === 0);
    expect(consultOnly.length).toBeGreaterThan(0);
  });
});

describe('争いのある通知は担当を断定しない', () => {
  for (const doc of ['naiyo', 'tokusoku', 'kaijo']) {
    it(`${doc} は紛争性で担当が変わることを書く`, () => {
      const t = triageFor(doc)!;
      expect(t.exclusiveTo).toEqual([]);
      expect(t.caseByCase).toContain('弁護士法72条');
      expect(t.consult).toContain('lawyer');
    });
  }
});

describe('登記の添付書類は用途で担当が変わる', () => {
  for (const doc of ['sokai', 'rinji-sokai', 'torishimari', 'shunin', 'kabunushi-meibo']) {
    it(`${doc} は社内保管と登記添付を区別する`, () => {
      const t = triageFor(doc)!;
      expect(t.caseByCase).toContain('司法書士法3条1項2号');
      expect(t.consult).toContain('judicial-scrivener');
    });
  }
});

describe('業務 → 担当士業の逆引き', () => {
  it('duty.link のあるサービスは必ず引ける', () => {
    const linked = new Set(
      Object.values(PROFESSIONAL_MAP).flatMap((p) => p.duties.flatMap((d) => (d.link ? [d.link.serviceId] : []))),
    );
    for (const s of linked) {
      expect(professionalsForService(s).length, s).toBeGreaterThan(0);
    }
  });

  it('link のないサービスは空を返す', () => {
    expect(professionalsForService('github')).toEqual([]);
    expect(professionalsForService('存在しない')).toEqual([]);
  });

  it('同じサービスを複数の士業が担当することがある', () => {
    const multi = [...new Set(
      Object.values(PROFESSIONAL_MAP).flatMap((p) => p.duties.flatMap((d) => (d.link ? [d.link.serviceId] : []))),
    )].filter((s) => professionalsForService(s).length > 1);
    expect(multi.length).toBeGreaterThan(0);
  });

  it('逆引きは士業名・担当領域名・区分を返す', () => {
    const rows = professionalsForService('docstudio');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(PROFESSIONAL_IDS).toContain(r.id);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(0);
      expect(['exclusive', 'advisory']).toContain(r.scope);
    }
  });
});

describe('根拠は professionalMap の検証済みの値をそのまま引く', () => {
  it('labelOf / lawOf は元データと一致する', () => {
    for (const id of PROFESSIONAL_IDS) {
      expect(labelOf(id)).toBe(PROFESSIONAL_MAP[id].label);
      expect(lawOf(id)).toBe(PROFESSIONAL_MAP[id].law);
    }
  });

  it('根拠法にはすべて条文番号が入っている', () => {
    for (const id of PROFESSIONAL_IDS) {
      expect(lawOf(id), id).toMatch(/法\d+条|法第?\d+条/);
    }
  });
});

describe('集計', () => {
  it('独占に触れる書式の数を数える', () => {
    const n = exclusiveCount();
    expect(n).toBe(TRIAGE_ROWS.filter((r) => r.exclusiveTo.length > 0).length);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(TRIAGE_ROWS.length);
  });

  it('仕分け全体をスナップショットで固定する', () => {
    expect(TRIAGE_ROWS.map((r) => [
      r.doc, r.ownUse, r.exclusiveTo.join('+') || '-', r.consult.join('+') || '-', r.caseByCase ? 'case' : '-',
    ].join('|'))).toMatchSnapshot();
  });
});

/**
 * 使い回している定型文は、片方の連結だけ落ちても「それらしい文」が残る。
 * 文面ごと固定して、欠けたら落ちるようにする。
 */
describe('共通の定型文', () => {
  it('契約書の定型注意は前後半そろっている', () => {
    expect(CONTRACT_NOTE).toBe(
      '契約書は自社が当事者である限り自由に作って交わせる。相手方に押印を求める前に、'
      + '記載した条件で本当に回るか（支払期日・解除・損害の範囲）を先に確認すること。',
    );
    expect(triageFor('baibai')!.ownNote).toBe(CONTRACT_NOTE);
  });

  it('登記添付の但し書きは「社内保管なら自由」と「登記添付なら司法書士」を両方言う', () => {
    expect(REGISTRY_CASE).toBe(
      '社内に保管するだけなら自由。ただし同じ書面を登記の添付書類として、他人のために'
      + '作成すると司法書士法3条1項2号（法務局へ提出する書類の作成）の領域に入る。'
      + '登記申請そのものの代理も同じ。自社の登記を自社で申請する分には制限されない。',
    );
    expect(triageFor('sokai')!.caseByCase).toBe(REGISTRY_CASE);
  });

  it('紛争性の但し書きは「争いがあれば72条」と「自社分は制限されない」を両方言う', () => {
    expect(DISPUTE_CASE).toBe(
      '相手が争う姿勢を見せているか、金額や事実関係に争いがあるなら、報酬を得て他人の'
      + 'ために交渉・請求を行うことは弁護士法72条の法律事務に当たり得る。争いのない'
      + '段階の書面作成にとどまるか、すでに紛争かで担当が変わる。自社の債権を自社で'
      + '請求する分には制限されない。',
    );
    expect(triageFor('naiyo')!.caseByCase).toBe(DISPUTE_CASE);
  });
});

describe('書式の系統ごとの既定', () => {
  it('契約書は行政書士の独占に触れ、相談先は既定では空', () => {
    const t = triageFor('baibai')!;
    expect(t.exclusiveTo).toEqual(['admin-scrivener']);
    expect(t.consult).toEqual([]);
    expect(t.ownUse).toBe('ok');
  });

  it('契約書でも相談先を足せる（NDA は知財が絡む）', () => {
    expect(triageFor('nda')!.consult).toEqual(['patent-attorney']);
  });

  it('証憑は独占に触れず、税理士に相談', () => {
    for (const doc of ['invoice', 'ryoshu', 'nouhin', 'kenshu', 'mitsumori', 'hacchu', 'chuumon-uke', 'shiharai']) {
      const t = triageFor(doc)!;
      expect(t.exclusiveTo, doc).toEqual([]);
      expect(t.consult, doc).toEqual(['tax-accountant']);
      expect(t.ownUse, doc).toBe('ok');
    }
  });

  it('社内文書は独占にも相談にも触れない', () => {
    for (const doc of ['ringi', 'gijiroku', 'keihi', 'shucchou', 'houkoku']) {
      const t = triageFor(doc)!;
      expect(t.exclusiveTo, doc).toEqual([]);
      expect(t.consult, doc).toEqual([]);
      expect(t.caseByCase, doc).toBeUndefined();
      expect(t.ownUse, doc).toBe('ok');
    }
  });

  it('見つからない doc は null', () => {
    expect(triageFor('存在しない書式')).toBeNull();
    expect(triageFor('')).toBeNull();
  });
});

describe('逆引きは link を持たない duty を飛ばす', () => {
  const withoutLink: ProfessionalProfile = {
    id: 'tax-accountant',
    label: 'テスト士',
    law: 'テスト法1条',
    exclusive: 'テスト',
    summary: 'テスト',
    duties: [
      { title: 'link なし', desc: 'アプリ内機能に対応しない担当領域', scope: 'advisory' },
      { title: 'link あり', desc: '対応する', scope: 'exclusive', link: { serviceId: 'tax', label: '税務試算' } },
    ],
  };

  it('link の無い duty を渡しても落ちず、拾わない', () => {
    expect(professionalsForService('tax', [withoutLink])).toEqual([
      { id: 'tax-accountant', label: 'テスト士', title: 'link あり', scope: 'exclusive' },
    ]);
  });

  it('link が無い duty しか無ければ空', () => {
    const only: ProfessionalProfile = { ...withoutLink, duties: [withoutLink.duties[0]!] };
    expect(professionalsForService('tax', [only])).toEqual([]);
  });

  it('プロファイルを渡さなければ本番データを見る', () => {
    expect(professionalsForService('tax').length).toBeGreaterThan(0);
  });
});
