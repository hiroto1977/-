import { describe, expect, it } from 'vitest';
import { STUDIO_CATEGORIES, STUDIO_TEMPLATES, type StudioDoc } from '../data/docStudioData';
import { checkDoc, countBlank, interestCap, isRegistrationNo, parseJpDate, toNum } from '../data/docStudioChecks';

const doc = (id: string): StudioDoc => {
  const found = STUDIO_TEMPLATES.find((d) => d.id === id);
  if (!found) throw new Error(`template not found: ${id}`);
  return found;
};
/** 個別ルールだけを見たいので、全項目を placeholder で埋めておく（数値欄は数値で）。 */
const filled = (id: string, over: Record<string, string> = {}): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of doc(id).fields) {
    out[f.k] = f.options ? f.options[0]! : (f.ph || (f.num ? '0' : '—'));
  }
  return { ...out, ...over };
};
const msgs = (id: string, v: Record<string, string>) => checkDoc(doc(id), v).map((i) => `${i.level}:${i.message}`);
const levels = (id: string, v: Record<string, string>) => checkDoc(doc(id), v).map((i) => i.level);

describe('数値・日付・登録番号のパース', () => {
  it('全角・カンマ・単位つきの入力から数値を取り出す', () => {
    expect(toNum('1,000,000')).toBe(1_000_000);
    expect(toNum('１２３')).toBe(123);
    expect(toNum('40時間')).toBe(40);
    expect(toNum('3.5')).toBe(3.5);
    expect(toNum('')).toBeNull();
    expect(toNum('未定')).toBeNull();
    expect(toNum(undefined)).toBeNull();
  });

  it('和暦を含まない3書式の日付を読み、存在しない日付は拒否する', () => {
    expect(parseJpDate('2026年8月5日')).toBe(Date.UTC(2026, 7, 5));
    expect(parseJpDate('2026/8/5')).toBe(Date.UTC(2026, 7, 5));
    expect(parseJpDate('2026-08-05')).toBe(Date.UTC(2026, 7, 5));
    expect(parseJpDate('2026年2月30日')).toBeNull();
    expect(parseJpDate('2026年13月1日')).toBeNull();
    expect(parseJpDate('来月')).toBeNull();
  });

  it('登録番号は T + 13 桁のみ通す', () => {
    expect(isRegistrationNo('T1234567890123')).toBe(true);
    expect(isRegistrationNo('t1234567890123')).toBe(true);
    expect(isRegistrationNo('T123456789012')).toBe(false); // 12 桁
    expect(isRegistrationNo('1234567890123')).toBe(false); // T なし
    expect(isRegistrationNo('')).toBe(false);
  });

  it('利息制限法の上限は元本の額で切り替わる', () => {
    expect(interestCap(99_999)).toBe(20);
    expect(interestCap(100_000)).toBe(18);
    expect(interestCap(999_999)).toBe(18);
    expect(interestCap(1_000_000)).toBe(15);
  });
});

describe('汎用チェック', () => {
  it('必須項目が空欄なら warn を返し、埋めれば消える', () => {
    const blank = msgs('nda', {});
    expect(blank.some((m) => m.startsWith('warn:') && m.includes('甲（自社名）'))).toBe(true);
    expect(msgs('nda', filled('nda')).some((m) => m.includes('甲（自社名）'))).toBe(false);
  });

  it('数値項目に数値以外が入っていたら警告する', () => {
    const out = msgs('ryoshu', filled('ryoshu', { amount: '応相談' }));
    expect(out.some((m) => m.startsWith('warn:') && m.includes('読み取れません'))).toBe(true);
  });

  it('countBlank は未入力のフィールド数を返す', () => {
    const d = doc('nda');
    expect(countBlank(d, {})).toBe(d.fields.length);
    expect(countBlank(d, { kou: '株式会社サンプル' })).toBe(d.fields.length - 1);
    expect(countBlank(d, { kou: '   ' })).toBe(d.fields.length); // 空白のみは未入力扱い
  });

  it('fatal → warn → info の順に並ぶ', () => {
    const out = levels('mimoto', { ...filled('mimoto'), limit: '', years: '10' });
    expect(out).toEqual([...out].sort((a, b) => ({ fatal: 0, warn: 1, info: 2 })[a] - ({ fatal: 0, warn: 1, info: 2 })[b]));
    expect(out[0]).toBe('fatal');
  });
});

describe('書式ごとの無効リスク（fatal）', () => {
  it('身元保証書: 極度額がなければ契約そのものが無効', () => {
    const bad = checkDoc(doc('mimoto'), filled('mimoto', { limit: '' }));
    expect(bad.some((i) => i.level === 'fatal' && i.field === 'limit' && i.basis?.includes('465条の2'))).toBe(true);
    const ok = checkDoc(doc('mimoto'), filled('mimoto', { limit: '1,000,000' }));
    expect(ok.some((i) => i.field === 'limit')).toBe(false);
  });

  it('身元保証書: 保証期間5年超は fatal、5年ちょうどは通す', () => {
    expect(checkDoc(doc('mimoto'), filled('mimoto', { years: '6' })).some((i) => i.level === 'fatal' && i.field === 'years')).toBe(true);
    expect(checkDoc(doc('mimoto'), filled('mimoto', { years: '5' })).some((i) => i.field === 'years')).toBe(false);
  });

  it('36協定: 月100時間以上・年720時間超は fatal、45/360超は warn', () => {
    const hard = checkDoc(doc('saburoku'), filled('saburoku', { monthLimit: '100時間', yearLimit: '800時間' }));
    expect(hard.filter((i) => i.level === 'fatal')).toHaveLength(2);
    const soft = checkDoc(doc('saburoku'), filled('saburoku', { monthLimit: '60時間', yearLimit: '500時間' }));
    expect(soft.some((i) => i.level === 'fatal')).toBe(false);
    expect(soft.filter((i) => i.level === 'warn' && (i.field === 'monthLimit' || i.field === 'yearLimit')).length).toBeGreaterThanOrEqual(2);
    const within = checkDoc(doc('saburoku'), filled('saburoku', { monthLimit: '40時間', yearLimit: '320時間', target: '8', workers: '12' }));
    expect(within.some((i) => i.level === 'fatal' || i.level === 'warn')).toBe(false);
    expect(within.some((i) => i.level === 'info' && i.message.includes('届出'))).toBe(true);
  });

  it('36協定: 対象労働者数が事業場の労働者数を超えたら warn', () => {
    const out = checkDoc(doc('saburoku'), filled('saburoku', { monthLimit: '40', yearLimit: '320', workers: '5', target: '8' }));
    expect(out.some((i) => i.level === 'warn' && i.field === 'target')).toBe(true);
  });

  it('金銭消費貸借: 利息制限法の上限を超える利率は fatal', () => {
    const over = checkDoc(doc('shohi'), filled('shohi', { amount: '3,000,000', rate: '18' }));
    expect(over.some((i) => i.level === 'fatal' && i.field === 'rate' && i.message.includes('15%'))).toBe(true);
    const ok = checkDoc(doc('shohi'), filled('shohi', { amount: '3,000,000', rate: '15' }));
    expect(ok.some((i) => i.level === 'fatal')).toBe(false);
    // 元本が小さいと上限は上がる
    const small = checkDoc(doc('shohi'), filled('shohi', { amount: '50,000', rate: '18' }));
    expect(small.some((i) => i.level === 'fatal')).toBe(false);
  });

  it('解雇予告: 30日未満かつ手当なしは fatal、手当ありなら不足日数を warn で示す', () => {
    const base = filled('kaiko-yokoku', { noticeDate: '2026年9月1日', dismissDate: '2026年9月11日' });
    const noPay = checkDoc(doc('kaiko-yokoku'), { ...base, teate: '支給しない（30日前に予告するため）' });
    expect(noPay.some((i) => i.level === 'fatal' && i.basis?.includes('20条'))).toBe(true);
    const withPay = checkDoc(doc('kaiko-yokoku'), { ...base, teate: '不足日数分の平均賃金を支給する' });
    expect(withPay.some((i) => i.level === 'fatal')).toBe(false);
    expect(withPay.some((i) => i.level === 'warn' && i.message.includes('20 日分'))).toBe(true);
    // 30 日以上あれば指摘なし
    const ok = checkDoc(doc('kaiko-yokoku'), filled('kaiko-yokoku', { noticeDate: '2026年9月1日', dismissDate: '2026年10月1日' }));
    expect(ok.some((i) => i.level === 'fatal' || i.field === 'teate' || i.field === 'teateAmount')).toBe(false);
  });

  it('解雇予告: 解雇日が通知日より前なら warn', () => {
    const out = checkDoc(doc('kaiko-yokoku'), filled('kaiko-yokoku', { noticeDate: '2026年9月10日', dismissDate: '2026年9月1日' }));
    expect(out.some((i) => i.level === 'warn' && i.field === 'dismissDate')).toBe(true);
  });

  it('労働条件通知書: 変更の範囲が空欄なら fatal（2024年4月改正）', () => {
    const out = checkDoc(doc('roudou'), filled('roudou', { placeRange: '', dutyRange: '' }));
    expect(out.filter((i) => i.level === 'fatal')).toHaveLength(2);
    expect(checkDoc(doc('roudou'), filled('roudou')).some((i) => i.level === 'fatal')).toBe(false);
  });

  it('検収書: 支払期日が受領日から60日を超えたら fatal', () => {
    const over = checkDoc(doc('kenshu'), filled('kenshu', { receiveDate: '2026年9月30日', payday: '2026年12月10日' }));
    expect(over.some((i) => i.level === 'fatal' && i.field === 'payday')).toBe(true);
    const ok = checkDoc(doc('kenshu'), filled('kenshu', { receiveDate: '2026年9月30日', payday: '2026年11月29日' }));
    expect(ok.some((i) => i.level === 'fatal')).toBe(false);
  });

  it('議事録: 出席数が総数を超えたら fatal', () => {
    expect(checkDoc(doc('sokai'), filled('sokai', { totalShares: '100個', presentShares: '120個' })).some((i) => i.level === 'fatal')).toBe(true);
    expect(checkDoc(doc('torishimari'), filled('torishimari', { total: '3名', present: '4名' })).some((i) => i.level === 'fatal')).toBe(true);
    expect(checkDoc(doc('torishimari'), filled('torishimari', { total: '3名', present: '3名' })).some((i) => i.level === 'fatal')).toBe(false);
  });

  it('株主名簿: 保有株式数の合計が発行済総数と食い違ったら指摘する', () => {
    const over = checkDoc(doc('kabunushi-meibo'), filled('kabunushi-meibo', { totalShares: '100株', s1shares: '60', s2shares: '30', s3shares: '30' }));
    expect(over.some((i) => i.level === 'fatal')).toBe(true);
    const short = checkDoc(doc('kabunushi-meibo'), filled('kabunushi-meibo', { totalShares: '100株', s1shares: '60', s2shares: '30', s3shares: '' }));
    expect(short.some((i) => i.level === 'warn' && i.field === 'totalShares')).toBe(true);
    const exact = checkDoc(doc('kabunushi-meibo'), filled('kabunushi-meibo', { totalShares: '100株', s1shares: '60', s2shares: '40', s3shares: '' }));
    expect(exact.some((i) => i.field === 'totalShares')).toBe(false);
  });
});

describe('書式ごとの実務チェック（warn / info）', () => {
  it('登録番号の形式誤りを請求書・支払通知書・納品書で検出する', () => {
    expect(checkDoc(doc('invoice'), filled('invoice', { regno: '1234567890123' })).some((i) => i.field === 'regno')).toBe(true);
    expect(checkDoc(doc('invoice'), filled('invoice', { regno: 'T1234567890123' })).some((i) => i.field === 'regno')).toBe(false);
    expect(checkDoc(doc('shiharai'), filled('shiharai', { toReg: 'T123' })).some((i) => i.field === 'toReg')).toBe(true);
    expect(checkDoc(doc('nouhin'), filled('nouhin', { reg: 'T123' })).some((i) => i.field === 'reg')).toBe(true);
  });

  it('建物賃貸借: 期間1年未満は「期間の定めなし」とみなされる旨を警告する', () => {
    expect(checkDoc(doc('chintai'), filled('chintai', { term: '6か月間' })).some((i) => i.field === 'term')).toBe(true);
    expect(checkDoc(doc('chintai'), filled('chintai', { term: '2026年9月1日から2028年8月31日まで（2年間）' })).some((i) => i.field === 'term')).toBe(false);
  });

  it('建物賃貸借: 敷金が賃料12か月分を超えたら warn', () => {
    expect(checkDoc(doc('chintai'), filled('chintai', { rent: '250,000', shikikin: '5,000,000' })).some((i) => i.field === 'shikikin')).toBe(true);
    expect(checkDoc(doc('chintai'), filled('chintai', { rent: '250,000', shikikin: '750,000' })).some((i) => i.field === 'shikikin')).toBe(false);
  });

  it('契約解除通知: 無催告解除を選ぶと要件の確認を促す', () => {
    expect(checkDoc(doc('kaijo'), filled('kaijo', { kind: '催告を要せず直ちに解除する（無催告解除）' })).some((i) => i.level === 'warn' && i.field === 'kind')).toBe(true);
    expect(checkDoc(doc('kaijo'), filled('kaijo', { kind: '催告のうえ解除する（催告解除）' })).some((i) => i.field === 'kind')).toBe(false);
  });

  it('領収書: 5万円以上のときだけ印紙の info を出す', () => {
    expect(checkDoc(doc('ryoshu'), filled('ryoshu', { amount: '50,000' })).some((i) => i.level === 'info')).toBe(true);
    expect(checkDoc(doc('ryoshu'), filled('ryoshu', { amount: '49,999' })).some((i) => i.level === 'info')).toBe(false);
  });

  it('退職証明書: 請求のあった事項のみ記載するよう促す', () => {
    const out = checkDoc(doc('taishoku-shomei'), filled('taishoku-shomei'));
    expect(out.some((i) => i.level === 'warn' && i.basis?.includes('22条3項'))).toBe(true);
  });

  it('期限のある書式は交付後にやることを info で必ず出す', () => {
    for (const id of ['saburoku', 'shunin', 'annai', 'naiyo', 'tokusoku', 'hacchu', 'kojin-itaku', 'chingin', 'harassment']) {
      expect(checkDoc(doc(id), filled(id)).some((i) => i.level === 'info'), id).toBe(true);
    }
  });
});

describe('テンプレート集合の健全性', () => {
  it('id が重複していない', () => {
    const ids = STUDIO_TEMPLATES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('すべての cat が STUDIO_CATEGORIES に登録されている', () => {
    for (const d of STUDIO_TEMPLATES) expect(STUDIO_CATEGORIES, d.id).toContain(d.cat);
  });

  it('本文の {{k}} プレースホルダがすべて fields に存在する', () => {
    for (const d of STUDIO_TEMPLATES) {
      const keys = new Set(d.fields.map((f) => f.k));
      const texts: string[] = [];
      for (const b of d.body) {
        for (const t of [b.center, b.h, b.p, b.right]) if (t) texts.push(t);
        if (b.list) texts.push(...b.list);
        if (b.table) for (const row of b.table.rows) texts.push(...row);
      }
      for (const t of texts) {
        for (const m of t.matchAll(/{{(\w+)}}/g)) expect(keys, `${d.id} → {{${m[1]}}}`).toContain(m[1]);
      }
    }
  });

  it('表ブロックの列数が見出しと一致し、sum の対象キーが存在する', () => {
    for (const d of STUDIO_TEMPLATES) {
      for (const b of d.body) {
        if (!b.table) continue;
        const keys = new Set(d.fields.map((f) => f.k));
        for (const row of b.table.rows) expect(row.length, d.id).toBeLessThanOrEqual(b.table.head.length);
        if (b.table.align) expect(b.table.align.length, d.id).toBe(b.table.head.length);
        for (const k of b.table.sum?.keys ?? []) expect(keys, `${d.id} → sum ${k}`).toContain(k);
      }
    }
  });

  it('すべての書式に根拠つきの注意書きがある', () => {
    for (const d of STUDIO_TEMPLATES) expect(d.note.length, d.id).toBeGreaterThan(0);
  });

  it('個別ルールを持つ書式の id が実在する（リネームの取りこぼし検出）', () => {
    // checkDoc は未知 id を無視するため、ルール側のタイプミスはテストでしか気づけない。
    const withRules = ['mimoto', 'saburoku', 'shohi', 'chintai', 'kaiko-yokoku', 'taishoku-shomei', 'roudou',
      'invoice', 'shiharai', 'nouhin', 'kenshu', 'hacchu', 'chuumon-uke', 'baibai', 'ryoshu', 'sokai',
      'rinji-sokai', 'torishimari', 'kabunushi-meibo', 'shunin', 'annai', 'naiyo', 'tokusoku', 'kaijo',
      'kojin-itaku', 'privacy', 'chingin', 'harassment'];
    for (const id of withRules) expect(STUDIO_TEMPLATES.some((d) => d.id === id), id).toBe(true);
  });
});
