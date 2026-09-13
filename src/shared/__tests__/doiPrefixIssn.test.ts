import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/*
 * `lint:doi-prefix` の ISSN 照合 (2026-09-05)。
 *
 * プレフィックス照合は「出版社が違う」ことしか見ず、AOM / AEA の誌略号照合は
 * 2 社しか覆っていなかった。APA (10.1037/<ISSN>.)、Elsevier の PII (10.1016/S<ISSN>(年))、
 * Wiley の旧形式 (10.1111/j.<ISSN>.)、SAGE (10.1177/<ISSN 8 桁>) は **ISSN そのものを
 * 接尾辞に埋め込む**ので、(1) ラベルの誌名と ISSN の誌の食い違い、(2) ISSN の検査数字が
 * 合わない＝解決しない DOI、の 2 つを機械で拾える。初回走査 (2026-09-05) で (1) が 31 件、
 * (2) が 10 件出た —— 年照合にもラベル照合にも見えなかった「単発の誤 DOI」である。
 *
 * ここでは鳴る標本と通る対照、そして台帳そのものの自己整合 (ISSN の検査数字・
 * 誌名の正規表現が誌名自身に当たること) を留める。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-doi-prefix.cjs') as {
  JOURNAL_CODES: { re: RegExp; name: string; label: RegExp; issn?: string; form?: string }[];
  ISSN_JOURNALS: [string, string, string, RegExp][];
  ISSN_FORMS: Record<string, (issn: string) => RegExp>;
  issnCheckDigitOk: (issn: string) => boolean;
  embeddedIssn: (doi: string) => string | null;
  journalConflict: (doi: string, label: string) => { own: string; named: string[] | null } | null;
};
const { JOURNAL_CODES, ISSN_JOURNALS, ISSN_FORMS, issnCheckDigitOk, embeddedIssn, journalConflict } = gate;

describe('issnCheckDigitOk — ISO 3297 の検査数字', () => {
  it('実在する ISSN は通る (X を含むものも)', () => {
    for (const issn of ['0033-295X', '1540-6261', '0170-8406', '1530-9134', '0304-405X', '2053-9517']) {
      expect(issnCheckDigitOk(issn), issn).toBe(true);
    }
  });

  it('★ 1 桁違いは鳴る (コーパスで実測した j.1430-9134 = JEMS 1530-9134 の転記ミス)', () => {
    expect(issnCheckDigitOk('1430-9134')).toBe(false);
    expect(issnCheckDigitOk('0002-7649')).toBe(false);
    expect(issnCheckDigitOk('0033-2950')).toBe(false);
  });

  it('形式が違えば偽 (ハイフン無し・桁不足・小文字 x)', () => {
    expect(issnCheckDigitOk('0033295X')).toBe(false);
    expect(issnCheckDigitOk('0033-29')).toBe(false);
    expect(issnCheckDigitOk('0033-295x')).toBe(false);
  });
});

describe('embeddedIssn — DOI に埋め込まれた ISSN', () => {
  it('4 形式から ISSN を取り出す (大文字に正規化)', () => {
    expect(embeddedIssn('10.1037/0033-295X.98.3.569')).toBe('0033-295X');
    expect(embeddedIssn('10.1037/0033-295x.98.3.569')).toBe('0033-295X');
    expect(embeddedIssn('10.1016/S1573-4404(84)01006-4')).toBe('1573-4404');
    expect(embeddedIssn('10.1016/s0304-405x(85)90044-3')).toBe('0304-405X');
    expect(embeddedIssn('10.1111/j.1540-6261.1994.tb04418.x')).toBe('1540-6261');
    expect(embeddedIssn('10.1177/0170840607081138')).toBe('0170-8406');
    expect(embeddedIssn('10.1177/0308518X15621245')).toBe('0308-518X');
  });

  it('対照: ISSN を埋め込まない形式は null', () => {
    expect(embeddedIssn('10.2307/2393339')).toBeNull();
    expect(embeddedIssn('10.1002/smj.4250140303')).toBeNull();
    expect(embeddedIssn('10.1016/j.jfineco.2011.03.016')).toBeNull();
    expect(embeddedIssn('10.5465/amr.2005.16387885')).toBeNull();
    expect(embeddedIssn('10.1287/orsc.1050.0133')).toBeNull();
  });
});

describe('journalConflict — ISSN の誌とラベルの誌', () => {
  it('★ 標本: Psychological Review の DOI に Journal of Abnormal Psychology のラベルは鳴る', () => {
    const r = journalConflict('10.1037/0033-295X.98.3.569', 'Nolen-Hoeksema, S. (1991) Responses to Depression — Journal of Abnormal Psychology 100(4)');
    expect(r).toEqual({ own: 'Psychological Review', named: ['Journal of Abnormal Psychology'] });
  });

  it('★ 標本: Elsevier PII / Wiley j. / SAGE でも同じ規則が働く', () => {
    expect(journalConflict('10.1016/S1573-4404(84)01009-X', 'Dixit (1985) Tax Policy in Open Economies — Handbook of Public Economics')?.named).toEqual(['Handbook of Public Economics']);
    expect(journalConflict('10.1111/j.1540-6261.1990.tb03695.x', 'Bernanke (1990) — NBER Macroeconomics Annual')?.named).toBeNull();
    expect(journalConflict('10.1111/j.1540-5982.2005.00305.x', 'Smith (2005) — Journal of Finance 60(1)')?.named).toEqual(['The Journal of Finance']);
    expect(journalConflict('10.1177/1354068804039120', 'Katz & Mair (2004) — American Political Science Review')?.named).toBeNull();
    expect(journalConflict('10.1177/0022022108326196', 'X (2008) — Journal of Child Psychology and Psychiatry 49')?.named).toEqual(['Journal of Child Psychology and Psychiatry']);
  });

  it('対照: 正しい誌名・略号・誌名を含む誌は通る', () => {
    expect(journalConflict('10.1037/0022-3514.36.8.917', 'Brickman et al. (1978) — Journal of Personality and Social Psychology 36(8)')?.named).toBeNull();
    expect(journalConflict('10.1037/0022-3514.36.8.917', 'Brickman et al. (1978) — JPSP 36(8)')?.named).toBeNull();
    expect(journalConflict('10.1111/j.1467-6486.1988.tb00039.x', 'Weick (1988) — Journal of Management Studies 25(4)')?.named).toBeNull();
    expect(journalConflict('10.1016/S0149-2063(03)00035-5', 'Ireland et al. (2003) — Journal of Management 29(6)')?.named).toBeNull();
    expect(journalConflict('10.1177/0963721411410837', 'Hickok (2011) — Current Directions in Psychological Science 20')?.named).toBeNull();
    expect(journalConflict('10.1177/0956797611417632', 'X (2011) — Psychological Science 22')?.named).toBeNull();
  });

  it('対照: 誌名を名乗らないラベルと台帳に無い ISSN は判定しない', () => {
    expect(journalConflict('10.1037/0033-295X.98.3.569', 'Nolen-Hoeksema 1991 — Responses to depression')?.named).toBeNull();
    expect(journalConflict('10.1177/9999999900000000', 'X — Journal of Finance')).toBeNull();
    expect(journalConflict('10.2307/2393339', 'Weick (1993) — Administrative Science Quarterly')).toBeNull();
  });
});

describe('ISSN_JOURNALS 台帳の自己整合', () => {
  it('台帳は 4 形式・100 件以上で、ISSN は検査数字が合い、誌名の正規表現は誌名自身に当たる', () => {
    expect(ISSN_JOURNALS.length).toBeGreaterThan(100);
    const forms = new Set(ISSN_JOURNALS.map((r) => r[0]));
    expect([...forms].sort()).toEqual(['apa', 'elsevier', 'sage', 'wiley']);
    for (const [form, issn, name, label] of ISSN_JOURNALS) {
      expect(issnCheckDigitOk(issn), `${form} ${issn} ${name}`).toBe(true);
      expect(label.test(name), `${issn} ${name}`).toBe(true);
      expect(Object.keys(ISSN_FORMS)).toContain(form);
    }
  });

  it('同じ形式に同じ ISSN が二度出ない (二重登録)', () => {
    const keys = ISSN_JOURNALS.map((r) => `${r[0]}|${r[1]}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('台帳は JOURNAL_CODES へ取り込まれている (own の探索に効く)', () => {
    expect(JOURNAL_CODES.length).toBeGreaterThanOrEqual(ISSN_JOURNALS.length + 8);
    expect(JOURNAL_CODES.some((j) => j.issn === '0033-295X' && j.form === 'apa')).toBe(true);
  });
});

describe('CODE_JOURNALS 台帳 — 誌の略号を接尾辞に持つ出版社 (2026-09-05)', () => {
  const { CODE_JOURNALS, CODE_FORMS } = gate as unknown as {
    CODE_JOURNALS: [string, string, string, RegExp][];
    CODE_FORMS: Record<string, (code: string) => RegExp>;
  };

  it('台帳は 7 形式・100 件以上で、誌名の正規表現は誌名自身に当たる', () => {
    expect(CODE_JOURNALS.length).toBeGreaterThan(100);
    expect([...new Set(CODE_JOURNALS.map((r) => r[0]))].sort()).toEqual(['annualreviews', 'emerald', 'informs', 'mit', 'oxford', 'springer', 'wiley']);
    for (const [form, code, name, label] of CODE_JOURNALS) {
      expect(label.test(name), `${form}/${code} ${name}`).toBe(true);
      expect(Object.keys(CODE_FORMS)).toContain(form);
    }
    const keys = CODE_JOURNALS.map((r) => `${r[0]}|${r[1]}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('★ 標本: 略号の誌とラベルの誌が違えば鳴る (実測した 10 件から)', () => {
    expect(journalConflict('10.1093/qje/qjr014', 'Lustig, Roussanov & Verdelhan (2011) Common Risk Factors in Currency Markets — Review of Financial Studies 24(11)')?.named).toEqual(['Review of Financial Studies']);
    expect(journalConflict('10.1002/smj.4250130606', 'Eden, C. (1992) On the Nature of Cognitive Maps — Journal of Management Studies 29(3)')?.named).toEqual(['Journal of Management Studies']);
    expect(journalConflict('10.1287/mnsc.1120.1541', 'Shaw & Hill (2014) Laboratories of Oligarchy? — Journal of Communication 64(2)')?.named).toEqual(['Journal of Communication']);
    expect(journalConflict('10.1007/s11948-016-9776-z', 'Danaher, J. (2016) The Threat of Algocracy — Philosophy & Technology 29(3)')?.named).toEqual(['Philosophy & Technology']);
    expect(journalConflict('10.1146/annurev-financial-012820-012020', 'Du & Schreger (2022) CIP Deviations — Annual Review of Economics 14')?.named).toEqual(['Annual Review of Economics']);
  });

  it('対照: 正しい誌名・略号・誌名を含む誌は通る', () => {
    expect(journalConflict('10.1287/orsc.1050.0133', 'Weick, Sutcliffe & Obstfeld (2005) — Organization Science 16(4)')?.named).toBeNull();
    expect(journalConflict('10.1287/mnsc.35.12.1504', 'Dierickx & Cool (1989) — Management Science 35(12)')?.named).toBeNull();
    expect(journalConflict('10.1093/qje/qjt001', 'X (2013) — QJE 128(1)')?.named).toBeNull();
    expect(journalConflict('10.1002/smj.640', 'Teece (2007) Explicating Dynamic Capabilities — SMJ 28(13)')?.named).toBeNull();
    expect(journalConflict('10.1002/job.678', 'Oldham & Hackman (2010) — Journal of Organizational Behavior 31(2-3)')?.named).toBeNull();
    expect(journalConflict('10.1007/s10551-015-2693-2', 'X (2015) — Journal of Business Ethics 130')?.named).toBeNull();
    expect(journalConflict('10.1146/annurev-psych-010213-115208', 'Parker (2014) — Annual Review of Psychology 65')?.named).toBeNull();
    expect(journalConflict('10.1146/annurev-orgpsych-031413-091235', 'X (2014) — Annual Review of Organizational Psychology and Organizational Behavior 1')?.named).toBeNull();
    expect(journalConflict('10.1162/rest.2010.11855', 'X (2010) — Review of Economics and Statistics 92')?.named).toBeNull();
    expect(journalConflict('10.1108/tlo-01-2019-0001', 'X (2019) — The Learning Organization 26')?.named).toBeNull();
  });

  it('対照: 台帳に無い略号 (書籍コード oso / acprof など) と誌名を名乗らないラベルは判定しない', () => {
    expect(journalConflict('10.1093/oso/9780195092691.001.0001', 'Nonaka & Takeuchi (1995) — Oxford University Press')).toBeNull();
    expect(journalConflict('10.1093/acprof:oso/9780195073683.001.0001', 'Hasbrouck (2007) — Oxford University Press')).toBeNull();
    expect(journalConflict('10.1002/smj.4250050207', 'Wernerfelt (1984) A Resource-Based View of the Firm')?.named).toBeNull();
  });
});
