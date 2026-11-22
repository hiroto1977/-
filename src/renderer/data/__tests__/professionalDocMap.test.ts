/**
 * 書類スタジオの書類 → 士業の担当仕分け（主担当・副担当）。
 *
 * 固定すること: (1) 書類スタジオで作れる書類が全件、主担当か汎用の
 * どちらかに入っている（黙って落ちない）。(2) 仕分けが事業仕分け表
 * (`businessTriage`) の独占・相談先と食い違わない。(3) 士業ごとの
 * 期待セット（公認会計士・弁理士の主担当 0 件を含む）。
 */
import { describe, expect, it } from 'vitest';
import { EXTRA_DOC_IDS, TRIAGE_ROWS, docLabel, triageFor } from '../businessTriage';
import { STUDIO_TEMPLATES } from '../docStudioData';
import { PROFESSIONAL_IDS, type ProfessionalId } from '../professionalMap';
import {
  DOC_ASSIGNMENTS,
  assignmentFor,
  docCategory,
  docEntriesForProfessional,
  generalDocs,
  primaryDocsFor,
  secondaryDocsFor,
  type DocAssignment,
} from '../professionalDocMap';

/** 仕分けの対象となる全 doc id（書式 + 定款2 + 就業規則 + 計算書類）。 */
const EXPECTED_DOCS = [
  ...STUDIO_TEMPLATES.map((d) => d.id),
  'teikan-kk',
  'teikan-gk',
  'shugyo',
  'kessan',
];

const docsOf = (rows: readonly DocAssignment[]): string[] => rows.map((r) => r.doc);

describe('担当仕分けの網羅性', () => {
  it('書類スタジオで作れる書類が全件そろい、重複しない', () => {
    expect(docsOf(DOC_ASSIGNMENTS).sort()).toEqual([...EXPECTED_DOCS].sort());
    expect(new Set(docsOf(DOC_ASSIGNMENTS)).size).toBe(DOC_ASSIGNMENTS.length);
  });

  it('マップ内の書式 id はすべて docStudioData に実在する（特別枠は EXTRA_DOC_IDS の側）', () => {
    const templateIds = new Set(STUDIO_TEMPLATES.map((d) => d.id));
    for (const row of DOC_ASSIGNMENTS) {
      if (templateIds.has(row.doc)) continue;
      expect(EXTRA_DOC_IDS, row.doc).toContain(row.doc);
    }
  });

  it('事業仕分け表の全行と対象が一致する', () => {
    expect(docsOf(DOC_ASSIGNMENTS).sort()).toEqual(TRIAGE_ROWS.map((r) => r.doc).sort());
  });

  it('全行に根拠があり、主担当は実在の士業か汎用、副担当に主担当自身は入らない', () => {
    for (const row of DOC_ASSIGNMENTS) {
      expect(row.basis.length, row.doc).toBeGreaterThan(0);
      if (row.primary !== 'general') expect(PROFESSIONAL_IDS, row.doc).toContain(row.primary);
      for (const sub of row.secondary) {
        expect(PROFESSIONAL_IDS, row.doc).toContain(sub);
        expect(sub, row.doc).not.toBe(row.primary);
      }
      expect(new Set(row.secondary).size, row.doc).toBe(row.secondary.length);
    }
  });
});

describe('事業仕分けとの整合（導出どおりか）', () => {
  it('主担当 = 独占側の先頭、無ければ相談先の先頭、どちらも無ければ汎用。副担当は残り', () => {
    for (const row of DOC_ASSIGNMENTS) {
      const triage = triageFor(row.doc);
      expect(triage, row.doc).not.toBeNull();
      const named = [...triage!.exclusiveTo, ...triage!.consult.filter((id) => !triage!.exclusiveTo.includes(id))];
      if (named.length === 0) {
        expect(row.primary, row.doc).toBe('general');
        expect(row.secondary, row.doc).toEqual([]);
      } else {
        expect(row.primary, row.doc).toBe(named[0]);
        expect(row.secondary, row.doc).toEqual(named.slice(1));
      }
    }
  });

  it('汎用は社内文書 5 件で、事業仕分けでも独占・相談先のどちらにも名前が無い', () => {
    expect(docsOf(generalDocs()).sort()).toEqual(['gijiroku', 'houkoku', 'keihi', 'ringi', 'shucchou']);
    for (const row of generalDocs()) {
      const triage = triageFor(row.doc)!;
      expect(triage.exclusiveTo, row.doc).toEqual([]);
      expect(triage.consult, row.doc).toEqual([]);
    }
  });
});

describe('士業ごとの期待セット', () => {
  const PRIMARY: Record<ProfessionalId, string[]> = {
    'tax-accountant': [
      'invoice', 'shiharai', 'ryoshu', 'nouhin', 'kenshu', 'mitsumori', 'hacchu', 'chuumon-uke',
      'yakuin-hoshu-meisai', 'yakuin-shoyo-meisai', 'cf-keikaku', 'shikin-guri', 'kessan',
    ],
    cpa: [],
    'labor-consultant': [
      'roudou', 'saburoku', 'chingin', 'harassment', 'kaiko-yokoku', 'taishoku-shomei',
      'roudousha-meibo', 'kyuyo-meisai', 'shoyo-meisai', 'chingin-daichou', 'shukkinbo',
      'yukyu-kanribo', 'naitei', 'shugyo',
    ],
    lawyer: ['privacy', 'security', 'naiyo', 'tokusoku', 'kaijo'],
    'judicial-scrivener': ['sokai', 'rinji-sokai', 'torishimari', 'shunin', 'shoshu', 'inin', 'kabunushi-meibo', 'annai'],
    'admin-scrivener': [
      'nda', 'gyomu', 'baibai', 'chintai', 'shohi', 'oboegaki', 'kojin-itaku', 'seiyaku',
      'taishoku-himitsu', 'mimoto', 'teikan-kk', 'teikan-gk',
    ],
    'sme-consultant': [
      'jigyo-keikaku', 'jigyo-keikaku-shosai', 'chotatsu-keikaku-shosai', 'chotatsu-keikaku',
      'plantfactory-plan', 'plantfactory-funding',
    ],
    'patent-attorney': [],
  };

  it('主担当の集合が士業ごとに期待どおり（公認会計士・弁理士は 0 件）', () => {
    for (const id of PROFESSIONAL_IDS) {
      expect(docsOf(primaryDocsFor(id)).sort(), id).toEqual([...PRIMARY[id]].sort());
    }
  });

  it('公認会計士は計算書類の、弁理士は秘密保持契約書の副担当としてだけ出る', () => {
    expect(docsOf(secondaryDocsFor('cpa'))).toEqual(['kessan']);
    expect(docsOf(secondaryDocsFor('patent-attorney'))).toEqual(['nda']);
  });

  it('副担当の合計は主担当との重なりなく、全書類が主担当+汎用で覆われる', () => {
    const primaryAll = PROFESSIONAL_IDS.flatMap((id) => docsOf(primaryDocsFor(id)));
    expect(primaryAll.length + generalDocs().length).toBe(DOC_ASSIGNMENTS.length);
    for (const id of PROFESSIONAL_IDS) {
      for (const doc of docsOf(secondaryDocsFor(id))) {
        const row = assignmentFor(doc)!;
        expect(row.primary, doc).not.toBe(id);
      }
    }
  });
});

describe('assignmentFor / docCategory', () => {
  it('計算書類を 1 点ずつ引いても 4 点の行に寄る', () => {
    for (const sheet of ['kessan-pl', 'kessan-bs', 'kessan-equity', 'kessan-notes']) {
      expect(assignmentFor(sheet)?.doc).toBe('kessan');
    }
    expect(assignmentFor('no-such-doc')).toBeNull();
  });

  it('カテゴリは書式の cat、特別枠はその名前、無ければ空', () => {
    expect(docCategory('nda')).toBe('契約');
    expect(docCategory('invoice')).toBe('経理');
    expect(docCategory('teikan-kk')).toBe('定款');
    expect(docCategory('shugyo')).toBe('就業規則');
    expect(docCategory('kessan-bs')).toBe('計算書類');
    expect(docCategory('no-such-doc')).toBe('');
  });
});

describe('docEntriesForProfessional（士業のページの一覧）', () => {
  it('主担当と副担当を合わせた集合が出て、役割が仕分けと一致する', () => {
    for (const id of PROFESSIONAL_IDS) {
      const entries = docEntriesForProfessional(id);
      const expected = [...docsOf(primaryDocsFor(id)), ...docsOf(secondaryDocsFor(id))].sort();
      expect(entries.map((e) => e.doc).sort(), id).toEqual(expected);
      for (const e of entries) {
        const row = assignmentFor(e.doc)!;
        expect(e.role, `${id}/${e.doc}`).toBe(row.primary === id ? 'primary' : 'secondary');
        expect(e.label).toBe(docLabel(e.doc));
        expect(e.basis).toBe(row.basis);
        expect(e.cat.length, e.doc).toBeGreaterThan(0);
      }
    }
  });

  it('税理士では計算書類が主担当、公認会計士では副担当として出る', () => {
    const tax = docEntriesForProfessional('tax-accountant').find((e) => e.doc === 'kessan');
    expect(tax?.role).toBe('primary');
    const cpa = docEntriesForProfessional('cpa');
    expect(cpa.map((e) => e.doc)).toEqual(['kessan']);
    expect(cpa[0]!.role).toBe('secondary');
    const patent = docEntriesForProfessional('patent-attorney');
    expect(patent.map((e) => e.doc)).toEqual(['nda']);
    expect(patent[0]!.role).toBe('secondary');
  });

  it('汎用の書類はどの士業の一覧にも出ない', () => {
    for (const id of PROFESSIONAL_IDS) {
      const docs = docEntriesForProfessional(id).map((e) => e.doc);
      for (const g of docsOf(generalDocs())) expect(docs, `${id}/${g}`).not.toContain(g);
    }
  });
});
