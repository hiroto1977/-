import { describe, expect, it } from 'vitest';
import {
  parseShigyoContact,
  parseShigyoConsultation,
  contactToForm,
  CONSULTATION_STATUSES,
  SHIGYO_CONTACTS_COLLECTION,
  SHIGYO_CONSULTATIONS_COLLECTION,
} from '../shigyoDirectory';

describe('parseShigyoContact (専門家の任意登録)', () => {
  const valid = { serviceId: 'cpa' as const, name: '中村 六実', firm: '中村会計事務所', phone: '03-1234-5678', email: 'n@example.com' };

  it('parses a valid contact (trim 込み)', () => {
    const c = parseShigyoContact({ ...valid, name: ' 中村 六実 ' });
    expect(c).toEqual({ serviceId: 'cpa', name: '中村 六実', firm: '中村会計事務所', phone: '03-1234-5678', email: 'n@example.com' });
  });

  it('firm/phone/email は任意 (空欄可)', () => {
    const c = parseShigyoContact({ serviceId: 'lawyer', name: '佐藤' });
    expect(c.firm).toBe('');
    expect(c.phone).toBe('');
    expect(c.email).toBe('');
  });

  it('rejects empty name / bad phone / bad email / long firm', () => {
    expect(() => parseShigyoContact({ ...valid, name: '' })).toThrow('氏名');
    expect(() => parseShigyoContact({ ...valid, phone: 'abc' })).toThrow('電話番号');
    expect(() => parseShigyoContact({ ...valid, email: 'not-an-email' })).toThrow('メールアドレス');
    expect(() => parseShigyoContact({ ...valid, firm: 'あ'.repeat(81) })).toThrow('事務所名');
  });

  it('contactToForm で往復等価', () => {
    const c = parseShigyoContact(valid);
    expect(parseShigyoContact({ serviceId: 'cpa', ...contactToForm(c) })).toEqual(c);
  });
});

describe('parseShigyoConsultation (相談履歴の任意登録)', () => {
  const valid = { serviceId: 'tax-accountant' as const, date: '2026-07-25', topic: '決算前の節税相談', status: '相談予約' as const };

  it('parses a valid consultation', () => {
    expect(parseShigyoConsultation(valid)).toEqual(valid);
  });

  it('全ステータスを受理する (4 種)', () => {
    expect(CONSULTATION_STATUSES).toHaveLength(4);
    for (const status of CONSULTATION_STATUSES) {
      expect(parseShigyoConsultation({ ...valid, status }).status).toBe(status);
    }
  });

  it('rejects bad date / empty topic / unknown status', () => {
    expect(() => parseShigyoConsultation({ ...valid, date: '2026/07/25' })).toThrow('YYYY-MM-DD');
    expect(() => parseShigyoConsultation({ ...valid, date: '' })).toThrow('相談日');
    expect(() => parseShigyoConsultation({ ...valid, topic: '' })).toThrow('相談テーマ');
    expect(() => parseShigyoConsultation({ ...valid, status: '検討中' })).toThrow('ステータス');
  });

  it('exposes stable collection names', () => {
    expect(SHIGYO_CONTACTS_COLLECTION).toBe('shigyo-contacts');
    expect(SHIGYO_CONSULTATIONS_COLLECTION).toBe('shigyo-consultations');
  });
});
