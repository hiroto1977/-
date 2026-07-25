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

  it('firm/phone/email も前後の空白を落として保存する', () => {
    const c = parseShigyoContact({
      serviceId: 'cpa',
      name: '中村 六実',
      firm: ' 中村会計事務所 ',
      phone: ' 03-1234-5678 ',
      email: ' nakamura@example.com ',
    });
    expect(c.firm).toBe('中村会計事務所');
    expect(c.phone).toBe('03-1234-5678');
    expect(c.email).toBe('nakamura@example.com');
  });

  it('氏名が文字列でない (未入力・数値) 場合も氏名エラーになる', () => {
    expect(() => parseShigyoContact({ serviceId: 'cpa' })).toThrow('氏名は 1〜64 文字で入力してください');
    expect(() => parseShigyoContact({ serviceId: 'cpa', name: 123 })).toThrow('氏名は 1〜64 文字で入力してください');
  });

  it('氏名 64 文字は受理・65 文字は拒否 / 事務所名 80 文字は受理 (境界)', () => {
    expect(parseShigyoContact({ ...valid, name: 'あ'.repeat(64) }).name).toBe('あ'.repeat(64));
    expect(() => parseShigyoContact({ ...valid, name: 'あ'.repeat(65) })).toThrow('氏名');
    expect(parseShigyoContact({ ...valid, firm: 'あ'.repeat(80) }).firm).toBe('あ'.repeat(80));
  });

  it('メール形式: ローカル部は複数文字可・前後に余分な文字を許さない', () => {
    expect(parseShigyoContact({ ...valid, email: 'nakamura@example.co.jp' }).email).toBe('nakamura@example.co.jp');
    // 先頭・末尾アンカーが効いていること (部分一致で通してはいけない)。
    expect(() => parseShigyoContact({ ...valid, email: 'a b@example.com' })).toThrow('メールアドレス');
    expect(() => parseShigyoContact({ ...valid, email: 'a@example.com b' })).toThrow('メールアドレス');
  });

  it('メールアドレスは 254 文字まで受理・255 文字は拒否 (RFC 上限の境界)', () => {
    const domain = '@example.com';
    const at254 = 'a'.repeat(254 - domain.length) + domain;
    const at255 = 'a'.repeat(255 - domain.length) + domain;
    expect(at254).toHaveLength(254);
    expect(at255).toHaveLength(255);
    expect(parseShigyoContact({ ...valid, email: at254 }).email).toBe(at254);
    expect(() => parseShigyoContact({ ...valid, email: at255 })).toThrow('メールアドレス');
  });

  it('電話形式: 数字・記号以外を含むものは前後どちらでも拒否する', () => {
    expect(() => parseShigyoContact({ ...valid, phone: 'TEL03-1234-5678' })).toThrow('電話番号');
    expect(() => parseShigyoContact({ ...valid, phone: '03-1234-5678 まで' })).toThrow('電話番号');
    expect(parseShigyoContact({ ...valid, phone: '03-1' }).phone).toBe('03-1');
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

  it('ステータスの選択肢は表示順どおりの 4 種で固定', () => {
    expect(CONSULTATION_STATUSES).toEqual(['相談予約', '相談中', '対応中', '完了']);
  });

  it('rejects bad date / empty topic / unknown status', () => {
    expect(() => parseShigyoConsultation({ ...valid, date: '2026/07/25' })).toThrow('YYYY-MM-DD');
    expect(() => parseShigyoConsultation({ ...valid, date: '' })).toThrow('相談日');
    expect(() => parseShigyoConsultation({ ...valid, topic: '' })).toThrow('相談テーマ');
    expect(() => parseShigyoConsultation({ ...valid, status: '検討中' })).toThrow('ステータス');
  });

  it('date/topic も前後の空白を落として保存する', () => {
    const c = parseShigyoConsultation({ ...valid, date: ' 2026-07-25 ', topic: ' 決算前の節税相談 ' });
    expect(c.date).toBe('2026-07-25');
    expect(c.topic).toBe('決算前の節税相談');
  });

  it('相談日は前後に余分な文字を許さない (アンカー)', () => {
    expect(() => parseShigyoConsultation({ ...valid, date: 'x2026-07-25' })).toThrow('相談日');
    expect(() => parseShigyoConsultation({ ...valid, date: '2026-07-25x' })).toThrow('相談日');
  });

  it('date/topic が文字列でない場合もそれぞれのエラーになる', () => {
    expect(() => parseShigyoConsultation({ serviceId: 'tax-accountant', topic: '相談', status: '完了' }))
      .toThrow('相談日は YYYY-MM-DD 形式で入力してください (例: 2026-07-25)');
    expect(() => parseShigyoConsultation({ ...valid, topic: undefined }))
      .toThrow('相談テーマは 1〜80 文字で入力してください');
  });

  it('相談テーマ 80 文字は受理・81 文字は拒否 (境界)', () => {
    expect(parseShigyoConsultation({ ...valid, topic: 'あ'.repeat(80) }).topic).toBe('あ'.repeat(80));
    expect(() => parseShigyoConsultation({ ...valid, topic: 'あ'.repeat(81) })).toThrow('相談テーマ');
  });

  it('exposes stable collection names', () => {
    expect(SHIGYO_CONTACTS_COLLECTION).toBe('shigyo-contacts');
    expect(SHIGYO_CONSULTATIONS_COLLECTION).toBe('shigyo-consultations');
  });
});
