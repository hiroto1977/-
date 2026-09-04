import { describe, expect, it } from 'vitest';
import { STUDIO_CATEGORIES, STUDIO_TEMPLATES, type StudioDoc } from '../data/docStudioData';
import { DEFAULT_SHAREHOLDERS } from '../data/shareholders';
import { checkDoc, countBlank, interestCap, isRegistrationNo, parseJpDate, toNum, ruleDocIds, type DocIssue } from '../data/docStudioChecks';

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
  // 株主名簿の株主欄は可変行になり `doc.fields` に無い。「全部埋めた」状態を
  // 作るのがこのヘルパの役目なので、既定の行数ぶんは名前を入れておく
  // (入れないと、埋めたはずなのに「株主が1名も記載されていません」が出る)。
  if (id === 'kabunushi-meibo') {
    for (let i = 1; i <= DEFAULT_SHAREHOLDERS; i++) out[`s${i}name`] = `株主${i}`;
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

/* ------------------------------------------------------------------ *
 * 全ルールの網羅。
 *
 * 25 ある個別ルールのうち、これまで assert していたのは一部だけだった
 * （mutation testing で「一度も実行されていないルール」が 88 変異体ぶん
 * 見つかった）。ここでは全書式について checkDoc を 2 状態で実行し、
 * 出てくる指摘（レベル・文面・根拠）をスナップショットで固定する。
 * 目的は「文面が黙って変わらないこと」。中身の妥当性は上の個別テストで
 * 見ているので、ここは差分検知に徹する。
 * ------------------------------------------------------------------ */

/** 指摘を比較しやすい 1 行にする。 */
const flat = (id: string, v: Record<string, string>) =>
  checkDoc(doc(id), v).map((i) => `${i.level}|${i.field ?? '-'}|${i.message}|${i.basis ?? '-'}`);

/**
 * 個別ルールを持つ書式。下の網羅テストが `ruleDocIds()` と突き合わせるので、
 * ルールを足してここへ入れ忘れると落ちる（以前は 議事録 3 件が漏れていた）。
 */
const RULE_IDS = [
  'mimoto', 'saburoku', 'shohi', 'chintai', 'kaiko-yokoku', 'taishoku-shomei', 'roudou',
  'invoice', 'shiharai', 'nouhin', 'kenshu', 'hacchu', 'chuumon-uke', 'baibai', 'ryoshu',
  'sokai', 'rinji-sokai', 'torishimari',
  'kabunushi-meibo', 'shunin', 'annai', 'naiyo', 'tokusoku', 'kaijo', 'kojin-itaku',
  'privacy', 'chingin', 'harassment',
  'chotatsu-keikaku', 'jigyo-keikaku',
  'roudousha-meibo', 'chingin-daichou', 'shukkinbo', 'yukyu-kanribo',
] as const;

describe('全ルールの網羅 — 指摘の文面を固定する', () => {
  it('個別ルールを持つ書式がすべて実在する', () => {
    for (const id of RULE_IDS) expect(STUDIO_TEMPLATES.some((d) => d.id === id), id).toBe(true);
  });

  it('ルールを持つ書式が網羅リストから漏れていない', () => {
    // ルールだけ足して RULE_IDS に入れ忘れると、その書式が検査から静かに外れる。
    expect([...ruleDocIds()].sort()).toEqual([...RULE_IDS].sort());
  });

  it('placeholder で埋めた状態の指摘', () => {
    const out: Record<string, string[]> = {};
    for (const id of RULE_IDS) out[id] = flat(id, filled(id));
    expect(out).toMatchSnapshot('filled');
  });

  it('全欄が空の状態の指摘', () => {
    const out: Record<string, string[]> = {};
    for (const id of RULE_IDS) out[id] = flat(id, {});
    expect(out).toMatchSnapshot('empty');
  });

  it('ルールを持たない書式は空欄チェックだけを返す', () => {
    // nda は個別ルールが無い。必須項目の warn だけが出る。
    const issues = checkDoc(doc('nda'), {});
    expect(issues.every((i) => i.level === 'warn' && i.message.endsWith('が未入力です。'))).toBe(true);
    expect(checkDoc(doc('nda'), filled('nda'))).toEqual([]);
  });

  it('すべての指摘は fatal → warn → info の順に並ぶ', () => {
    const rank = { fatal: 0, warn: 1, info: 2 } as const;
    for (const id of RULE_IDS) {
      for (const v of [filled(id), {}]) {
        const levels = checkDoc(doc(id), v).map((i) => rank[i.level]);
        expect([...levels].sort((a, b) => a - b), id).toEqual(levels);
      }
    }
  });

  it('根拠つきの指摘は必ず条文か制度名を含む', () => {
    for (const id of RULE_IDS) {
      for (const i of checkDoc(doc(id), filled(id))) {
        if (!i.basis) continue;
        expect(i.basis, `${id}: ${i.basis}`).toMatch(/法|規則|指針|ガイドライン|Q&A/);
      }
    }
  });
});

describe('共通ヘルパの境界', () => {
  it('toNum は全角・区切りを外し、小数を桁数によらず読む', () => {
    expect(toNum('１，２３４．５６')).toBe(1234.56);
    expect(toNum('－５')).toBe(-5);
    expect(toNum('3.25')).toBe(3.25);
    expect(toNum('12.3456')).toBe(12.3456);
    expect(toNum('第5条')).toBe(5); // 数字を含めば拾う
    expect(toNum('あいう')).toBeNull();
  });

  it('parseJpDate は全角数字も読み、区切りを問わない', () => {
    expect(parseJpDate('２０２６年８月５日')).toBe(Date.UTC(2026, 7, 5));
    expect(parseJpDate('2026.8.5')).toBe(Date.UTC(2026, 7, 5));
    expect(parseJpDate('2026 年 8 月 5 日')).toBe(Date.UTC(2026, 7, 5));
  });

  it('parseJpDate は月・日の範囲を個別に弾く', () => {
    expect(parseJpDate('2026年0月5日')).toBeNull();
    expect(parseJpDate('2026年13月5日')).toBeNull();
    expect(parseJpDate('2026年8月0日')).toBeNull();
    expect(parseJpDate('2026年8月32日')).toBeNull();
    // 31日まである月は通る
    expect(parseJpDate('2026年8月31日')).toBe(Date.UTC(2026, 7, 31));
  });

  it('parseJpDate は存在しない日（月・日それぞれ）を弾く', () => {
    expect(parseJpDate('2026年2月29日')).toBeNull(); // 平年
    expect(parseJpDate('2028年2月29日')).toBe(Date.UTC(2028, 1, 29)); // 閏年
    expect(parseJpDate('2026年4月31日')).toBeNull();
  });

  it('isRegistrationNo は全角・ハイフン・小文字を吸収する', () => {
    expect(isRegistrationNo('Ｔ１２３４５６７８９０１２３')).toBe(true);
    expect(isRegistrationNo('T-1234-5678-90123')).toBe(true);
    expect(isRegistrationNo('T 1234567890123')).toBe(true);
    expect(isRegistrationNo('T12345678901234')).toBe(false); // 14 桁
    expect(isRegistrationNo(undefined)).toBe(false);
  });
});

describe('品目別の税率区分チェック（invoice / shiharai 共通）', () => {
  const inv = (over: Record<string, string>) => checkDoc(doc('invoice'), filled('invoice', over));

  it('入力があるのに「（使わない）」なら明細に載らない旨を warn', () => {
    const out = inv({ i3name: '追加品', i3kind: '（使わない）' });
    expect(out.some((i) => i.field === 'i3kind' && i.message.includes('請求書に載りません'))).toBe(true);
    // 単価だけでも同じ
    expect(inv({ i4price: '1000', i4kind: '（使わない）' }).some((i) => i.field === 'i4kind')).toBe(true);
    // どちらも空なら出ない
    expect(inv({ i5name: '', i5price: '', i5kind: '（使わない）' }).some((i) => i.field === 'i5kind')).toBe(false);
  });

  it('区分は選んでいるのに単価が空なら warn', () => {
    const out = inv({ i3name: '追加品', i3price: '', i3kind: '標準税率' });
    expect(out.some((i) => i.field === 'i3price' && i.message.includes('0 円として計算'))).toBe(true);
  });

  it('任意税率A / B をそれぞれ独立に検査する', () => {
    expect(inv({ i3name: 'A品', i3price: '100', i3kind: '任意税率A', rateA: '' })
      .some((i) => i.field === 'rateA' && i.level === 'fatal')).toBe(true);
    expect(inv({ i3name: 'B品', i3price: '100', i3kind: '任意税率B', rateB: '' })
      .some((i) => i.field === 'rateB' && i.level === 'fatal')).toBe(true);
    // A を使っていなければ rateA が空でも指摘しない
    expect(inv({ rateA: '' }).some((i) => i.field === 'rateA')).toBe(false);
  });

  it('任意税率の範囲外は fatal（0 と 50 は通す）', () => {
    const withA = (rateA: string) => inv({ i3name: 'A', i3price: '100', i3kind: '任意税率A', rateA });
    expect(withA('-1').some((i) => i.field === 'rateA' && i.message.includes('0〜50%'))).toBe(true);
    expect(withA('51').some((i) => i.field === 'rateA' && i.message.includes('0〜50%'))).toBe(true);
    expect(withA('0').some((i) => i.field === 'rateA')).toBe(false);
    expect(withA('50').some((i) => i.field === 'rateA')).toBe(false);
  });

  it('どの品目にも区分が無ければ明細が空である旨を warn', () => {
    const allUnused: Record<string, string> = {};
    for (let n = 1; n <= 6; n += 1) allUnused[`i${n}kind`] = '（使わない）';
    expect(inv(allUnused).some((i) => i.message.includes('明細が空のまま'))).toBe(true);
    // 1 つでも選ばれていれば出ない
    expect(inv({}).some((i) => i.message.includes('明細が空のまま'))).toBe(false);
  });

  it('支払通知書は品目 4 件まで検査する', () => {
    const out = checkDoc(doc('shiharai'), filled('shiharai', { i4name: 'X', i4kind: '（使わない）' }));
    expect(out.some((i) => i.field === 'i4kind')).toBe(true);
  });
});

describe('各ルールの分岐を個別に踏む', () => {
  const at = (id: string, over: Record<string, string>) => checkDoc(doc(id), filled(id, over));

  it('36協定: 月45時間ちょうど・年360時間ちょうどは指摘なし、超えると warn', () => {
    expect(at('saburoku', { monthLimit: '45', yearLimit: '360' }).some((i) => i.level === 'warn')).toBe(false);
    expect(at('saburoku', { monthLimit: '46', yearLimit: '360' }).some((i) => i.field === 'monthLimit')).toBe(true);
    expect(at('saburoku', { monthLimit: '45', yearLimit: '361' }).some((i) => i.field === 'yearLimit')).toBe(true);
  });

  it('36協定: 月99時間は warn、100時間ちょうどで fatal', () => {
    expect(at('saburoku', { monthLimit: '99', yearLimit: '360' }).some((i) => i.level === 'fatal')).toBe(false);
    expect(at('saburoku', { monthLimit: '100', yearLimit: '360' }).some((i) => i.level === 'fatal')).toBe(true);
  });

  it('36協定: 年720時間ちょうどは warn、721で fatal', () => {
    expect(at('saburoku', { monthLimit: '80', yearLimit: '720' }).some((i) => i.field === 'yearLimit' && i.level === 'fatal')).toBe(false);
    expect(at('saburoku', { monthLimit: '80', yearLimit: '721' }).some((i) => i.field === 'yearLimit' && i.level === 'fatal')).toBe(true);
  });

  it('36協定: 年が 月×12 を超えると整合性の warn を追加で出す', () => {
    const out = at('saburoku', { monthLimit: '30', yearLimit: '400' });
    expect(out.some((i) => i.message.includes('× 12'))).toBe(true);
    expect(at('saburoku', { monthLimit: '40', yearLimit: '360' }).some((i) => i.message.includes('× 12'))).toBe(false);
  });

  it('36協定: 対象者数が同数なら指摘なし', () => {
    expect(at('saburoku', { monthLimit: '40', yearLimit: '320', workers: '8', target: '8' })
      .some((i) => i.field === 'target')).toBe(false);
  });

  it('建物賃貸借: 12か月ちょうどは指摘なし、11か月は warn、「年」表記があれば見ない', () => {
    expect(at('chintai', { term: '12か月' }).some((i) => i.field === 'term')).toBe(false);
    expect(at('chintai', { term: '11ヶ月' }).some((i) => i.field === 'term')).toBe(true);
    expect(at('chintai', { term: '6カ月' }).some((i) => i.field === 'term')).toBe(true);
    expect(at('chintai', { term: '1年6箇月' }).some((i) => i.field === 'term')).toBe(false);
  });

  it('建物賃貸借: 敷金が賃料12か月ちょうどは指摘なし、13か月分で warn', () => {
    expect(at('chintai', { rent: '100000', shikikin: '1200000' }).some((i) => i.field === 'shikikin')).toBe(false);
    expect(at('chintai', { rent: '100000', shikikin: '1300000' }).some((i) => i.field === 'shikikin')).toBe(true);
    // 賃料 0 なら比較しない
    expect(at('chintai', { rent: '0', shikikin: '1300000' }).some((i) => i.field === 'shikikin')).toBe(false);
  });

  it('解雇予告: 30日ちょうどは指摘なし、29日で不足を出す', () => {
    const base = { noticeDate: '2026年9月1日' };
    expect(at('kaiko-yokoku', { ...base, dismissDate: '2026年10月1日', teate: '支給しない（30日前に予告するため）' })
      .some((i) => i.level === 'fatal')).toBe(false);
    expect(at('kaiko-yokoku', { ...base, dismissDate: '2026年9月30日', teate: '支給しない（30日前に予告するため）' })
      .some((i) => i.level === 'fatal')).toBe(true);
  });

  it('解雇予告: 理由が空なら warn、あれば出ない', () => {
    expect(at('kaiko-yokoku', { reason: '' }).some((i) => i.field === 'reason')).toBe(true);
    expect(at('kaiko-yokoku', { reason: '就業規則第10条該当' }).some((i) => i.field === 'reason')).toBe(false);
  });

  it('解雇予告: 日付が読めなければ日数の指摘は出ない', () => {
    expect(at('kaiko-yokoku', { noticeDate: '未定', dismissDate: '未定' })
      .some((i) => i.field === 'teate' || i.field === 'teateAmount' || i.field === 'dismissDate')).toBe(false);
  });

  it('領収書: 印紙の info は 5万円が境界', () => {
    expect(at('ryoshu', { amount: '49999' }).some((i) => i.level === 'info')).toBe(false);
    expect(at('ryoshu', { amount: '50000' }).some((i) => i.level === 'info')).toBe(true);
    expect(at('ryoshu', { amount: '' }).some((i) => i.level === 'info')).toBe(false);
  });

  it('金銭消費貸借: 印紙の info は 1万円が境界', () => {
    expect(at('shohi', { amount: '9999', rate: '3' }).some((i) => i.level === 'info')).toBe(false);
    expect(at('shohi', { amount: '10000', rate: '3' }).some((i) => i.level === 'info')).toBe(true);
  });

  it('金銭消費貸借: 元本か利率が読めなければ上限判定をしない', () => {
    expect(at('shohi', { amount: '未定', rate: '30' }).some((i) => i.field === 'rate')).toBe(false);
    expect(at('shohi', { amount: '3000000', rate: '応相談' }).some((i) => i.field === 'rate')).toBe(false);
  });

  it('金銭消費貸借: 上限ちょうどは通す（元本区分ごと）', () => {
    expect(at('shohi', { amount: '50000', rate: '20' }).some((i) => i.field === 'rate')).toBe(false);
    expect(at('shohi', { amount: '50000', rate: '20.1' }).some((i) => i.field === 'rate')).toBe(true);
    expect(at('shohi', { amount: '500000', rate: '18' }).some((i) => i.field === 'rate')).toBe(false);
    expect(at('shohi', { amount: '500000', rate: '18.1' }).some((i) => i.field === 'rate')).toBe(true);
  });

  it('株主名簿: 合計が一致すれば指摘なし、少なければ warn、超えれば fatal', () => {
    const set = (t: string, a: string, b: string, c: string) =>
      at('kabunushi-meibo', { totalShares: t, s1shares: a, s2shares: b, s3shares: c });
    expect(set('100株', '60', '40', '').some((i) => i.field === 'totalShares')).toBe(false);
    expect(set('100株', '60', '30', '').some((i) => i.level === 'warn' && i.field === 'totalShares')).toBe(true);
    expect(set('100株', '60', '50', '').some((i) => i.level === 'fatal')).toBe(true);
    // 誰も入力していなければ判定しない
    expect(set('100株', '', '', '').some((i) => i.field === 'totalShares')).toBe(false);
  });

  it('身元保証書: 極度額 0 も無効扱い、1円以上なら通す', () => {
    expect(at('mimoto', { limit: '0' }).some((i) => i.field === 'limit' && i.level === 'fatal')).toBe(true);
    expect(at('mimoto', { limit: '1' }).some((i) => i.field === 'limit')).toBe(false);
    expect(at('mimoto', { limit: '読めない' }).some((i) => i.field === 'limit' && i.level === 'fatal')).toBe(true);
  });

  it('身元保証書: 期間が読めなければ期間の指摘は出ない', () => {
    expect(at('mimoto', { years: '未定' }).some((i) => i.field === 'years')).toBe(false);
  });

  it('検収書: 60日ちょうどは通す、日付が読めなければ判定しない', () => {
    expect(at('kenshu', { receiveDate: '2026年9月30日', payday: '2026年11月29日' }).some((i) => i.field === 'payday')).toBe(false);
    expect(at('kenshu', { receiveDate: '2026年9月30日', payday: '2026年11月30日' }).some((i) => i.field === 'payday')).toBe(true);
    expect(at('kenshu', { receiveDate: '未定', payday: '2026年12月31日' }).some((i) => i.field === 'payday')).toBe(false);
  });

  it('登録番号は空欄なら形式の指摘を出さない（未入力の指摘に任せる）', () => {
    // req: true の空欄警告も同じ field に出るうえ、ラベル自体が「登録番号（T+13桁）」なので
    // 桁数だけでは区別できない。形式ルール側にしか無い 「T」＋13桁 で拾う。
    const fmt = (id: string, over: Record<string, string>) =>
      at(id, over).some((i) => i.message.includes('「T」＋13桁'));
    expect(fmt('invoice', { regno: '' })).toBe(false);
    expect(fmt('invoice', { regno: 'T123' })).toBe(true);
    expect(fmt('shiharai', { toReg: '' })).toBe(false);
    expect(fmt('nouhin', { reg: '' })).toBe(false);
    expect(fmt('nouhin', { reg: 'T1234567890123' })).toBe(false);
    expect(fmt('nouhin', { reg: 'T123' })).toBe(true);
  });

  it('退職証明書: 全項目の記載を請求されている場合は 22条3項の warn を出さない', () => {
    expect(at('taishoku-shomei', { requested: '全項目の記載を請求されている' })
      .some((i) => i.basis?.includes('22条3項'))).toBe(false);
  });

  it('契約解除通知: 催告解除なら要件確認の warn を出さない', () => {
    expect(at('kaijo', { kind: '催告のうえ解除する（催告解除）' }).some((i) => i.field === 'kind')).toBe(false);
  });
});

/**
 * 分岐ごとの「読まれる文面」を丸ごと固定する。
 *
 * レベルや field だけを見ていると、文面が空になっても・条文が消えても・
 * 数値の差し込みが壊れても素通りする。この書式群では文面そのものが成果物なので、
 * 各分岐を1回ずつ踏んだうえで level|field|message|basis を全部スナップショットする。
 */
describe('分岐ごとの文面を丸ごと固定する', () => {
  /** [書式 id, 分岐の名前, 差し替える値] */
  const SCENARIOS: readonly (readonly [string, string, Record<string, string>])[] = [
    // 身元保証書 — 極度額・保証期間
    ['mimoto', '極度額なし', { limit: '' }],
    ['mimoto', '極度額0', { limit: '0' }],
    ['mimoto', '期間6年', { limit: '3000000', years: '6' }],
    // 36協定 — 上限規制の各段
    ['saburoku', '月100時間', { monthLimit: '100', yearLimit: '360' }],
    ['saburoku', '月46時間', { monthLimit: '46', yearLimit: '360' }],
    ['saburoku', '年721時間', { monthLimit: '45', yearLimit: '721' }],
    ['saburoku', '年361時間', { monthLimit: '45', yearLimit: '361' }],
    ['saburoku', '年が月×12超', { monthLimit: '10', yearLimit: '361' }],
    ['saburoku', '対象者数が超過', { monthLimit: '45', yearLimit: '360', target: '11', workers: '10' }],
    // 金銭消費貸借 — 利息制限法の3区分と印紙
    ['shohi', '元本9万・21%', { amount: '90000', rate: '21' }],
    ['shohi', '元本50万・19%', { amount: '500000', rate: '19' }],
    ['shohi', '元本100万・16%', { amount: '1000000', rate: '16' }],
    // 建物賃貸借
    ['chintai', '期間11か月', { term: '11か月' }],
    ['chintai', '敷金13か月分', { term: '2年', rent: '100000', shikikin: '1300000' }],
    // 解雇予告
    ['kaiko-yokoku', '解雇日が通知日より前', { noticeDate: '2026年5月1日', dismissDate: '2026年4月1日', reason: '就業規則第50条' }],
    ['kaiko-yokoku', '29日・手当なし', { noticeDate: '2026年5月1日', dismissDate: '2026年5月30日', teate: '支給しない', reason: '就業規則第50条' }],
    ['kaiko-yokoku', '29日・手当あり', { noticeDate: '2026年5月1日', dismissDate: '2026年5月30日', teate: '支給する', reason: '就業規則第50条' }],
    ['kaiko-yokoku', '理由が空', { noticeDate: '2026年5月1日', dismissDate: '2026年7月1日', reason: '' }],
    // 退職証明書 / 労働条件通知書
    ['taishoku-shomei', '一部のみ請求', { requested: 'はい（一部の事項のみ）' }],
    ['roudou', '就業場所の範囲が空', { placeRange: '' }],
    ['roudou', '業務の範囲が空', { dutyRange: '' }],
    // 適格請求書 — 品目別の税率区分
    ['invoice', '登録番号の形式誤り', { regno: 'T123' }],
    ['invoice', '入力ありで使わない', { i1name: '事務用品', i1kind: '（使わない）' }],
    ['invoice', '区分ありで単価が空', { i1name: '事務用品', i1price: '' }],
    ['invoice', '任意税率A未入力', { i1kind: '任意税率A', rateA: '' }],
    ['invoice', '任意税率Aが51%', { i1kind: '任意税率A', rateA: '51' }],
    ['invoice', '任意税率Bが-1%', { i2kind: '任意税率B', rateB: '-1' }],
    ['shiharai', '相手方登録番号の形式誤り', { toReg: 'T123' }],
    ['nouhin', '登録番号の形式誤り', { reg: 'T123' }],
    // 検収書 — 支払期日
    ['kenshu', '61日後', { receiveDate: '2026年4月1日', payday: '2026年6月1日' }],
    // 領収書 — 印紙
    ['ryoshu', '5万円ちょうど', { amount: '50000' }],
    // 議事録 — 定足数（株主総会と取締役会でラベルが違う）
    ['sokai', '出席が総数超過', { totalShares: '100', presentShares: '101' }],
    ['rinji-sokai', '出席が総数超過', { totalShares: '100', presentShares: '101' }],
    ['torishimari', '出席が総数超過', { total: '5', present: '6' }],
    // 株主名簿
    ['kabunushi-meibo', '合計が不足', { totalShares: '100', s1shares: '50', s2shares: '20', s3shares: '10' }],
    ['kabunushi-meibo', '合計が超過', { totalShares: '100', s1shares: '80', s2shares: '80', s3shares: '0' }],
    // 契約解除通知
    ['kaijo', '無催告解除', { kind: '催告を要せず解除する（無催告解除）' }],
    // 資金調達計画書 — 必要資金と調達の一致
    ['chotatsu-keikaku', '必要資金と調達が食い違う', { equip: '8000000', working: '4000000', selfFund: '3000000', loanBank: '7000000', loanPublic: '0', subsidy: '0', otherFund: '0' }],
    ['chotatsu-keikaku', '自己資金が1割未満', { equip: '9000000', working: '1000000', selfFund: '500000', loanBank: '9500000', loanPublic: '0', subsidy: '0', otherFund: '0' }],
    ['chotatsu-keikaku', '補助金を当て込んでいる', { equip: '5000000', working: '0', selfFund: '2000000', loanBank: '2000000', loanPublic: '0', subsidy: '1000000', otherFund: '0' }],
    // 事業計画書
    ['jigyo-keikaku', '利益が売上を上回る', { y1sales: '1000000', y1profit: '2000000' }],
    ['jigyo-keikaku', '3年で5倍超', { y1sales: '1000000', y3sales: '6000000' }],
    ['jigyo-keikaku', '算出根拠が空欄', { basis: '' }],
    // 法定帳簿
    ['roudousha-meibo', '退職日だけ入って事由が空', { retired: '2027年3月31日', retireReason: '' }],
    ['roudousha-meibo', '業務の種類が空', { duty: '' }],
    ['chingin-daichou', '内数が労働時間を超える', { workHours: '160', overtimeHours: '100', holidayHours: '40', nightHours: '40' }],
    ['chingin-daichou', '控除が支給を超える', { basic: '100000', overtimePay: '0', commute: '0', otherPay: '0', health: '90000', pension: '90000' }],
    ['shukkinbo', '自己申告での把握', { method: '自己申告' }],
    ['shukkinbo', '内数が総労働時間を超える', { totalHours: '100', overtime: '80', holidayWork: '40', night: '0' }],
    ['yukyu-kanribo', '10日付与で取得4日', { granted: '10', taken: '4' }],
    ['yukyu-kanribo', '時季の数と取得日数が食い違う', { granted: '10', taken: '5', d1: '2026年5月1日', d2: '2026年5月2日', d3: '', d4: '', d5: '', d6: '' }],
  ];

  it('固有の分岐名で重複していない', () => {
    const keys = SCENARIOS.map(([id, name]) => `${id}/${name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('シナリオはすべて何らかの指摘を出す（分岐を踏み外していないことの確認）', () => {
    for (const [id, name, over] of SCENARIOS) {
      expect(flat(id, filled(id, over)).length, `${id}/${name}`).toBeGreaterThan(0);
    }
  });

  for (const [id, name, over] of SCENARIOS) {
    it(`${id} — ${name}`, () => {
      expect(flat(id, filled(id, over))).toMatchSnapshot();
    });
  }
});

/**
 * 「読めない値は判定しない」の徹底。
 *
 * 数値も日付も、読めなければ NaN として扱い、どの閾値にも引っかからない。
 * 一方で「読めないこと自体で判定を止める」箇所（元本・発行済総数）は明示的に止める。
 * ここが崩れると、空欄の書類に根拠のない fatal が並ぶか、逆に無効な書類が素通りする。
 */
describe('読めない値の扱い', () => {
  const at = (id: string, over: Record<string, string>) => checkDoc(doc(id), filled(id, over));

  it('金銭消費貸借: 元本が読めなければ上限区分が決まらないので利率を判定しない', () => {
    // 元本が NaN のまま interestCap に渡すと 15% 扱いになり、根拠のない fatal が出る。
    expect(at('shohi', { amount: 'あとで', rate: '30' }).some((i) => i.field === 'rate')).toBe(false);
    expect(at('shohi', { amount: '5000', rate: '30' }).some((i) => i.field === 'rate')).toBe(true);
  });

  it('株主名簿: 発行済総数が読めなければ突き合わせない', () => {
    const set = (t: string) =>
      at('kabunushi-meibo', { totalShares: t, s1shares: '60', s2shares: '40', s3shares: '' });
    expect(set('未定').some((i) => i.field === 'totalShares' || i.level === 'fatal')).toBe(false);
    expect(set('90').some((i) => i.field === 'totalShares')).toBe(true);
  });

  it('株主名簿: 合計が総数ちょうどなら fatal を出さない', () => {
    const out = at('kabunushi-meibo', { totalShares: '100', s1shares: '100', s2shares: '', s3shares: '' });
    expect(out.some((i) => i.level === 'fatal')).toBe(false);
  });

  it('36協定: 年が 月×12 ちょうどなら整合性の warn は出さない', () => {
    const has = (m: string, y: string) =>
      at('saburoku', { monthLimit: m, yearLimit: y }).some((i) => i.message.includes('を上回っています'));
    expect(has('30', '360')).toBe(false);
    expect(has('30', '361')).toBe(true);
    // どちらかが読めなければ比較しない
    expect(has('未定', '361')).toBe(false);
    expect(has('30', '未定')).toBe(false);
  });

  it('議事録: 出席が総数以下・読めない場合は指摘を出さない', () => {
    expect(checkDoc(doc('sokai'), filled('sokai', { totalShares: '100', presentShares: '100' }))).toEqual([]);
    expect(checkDoc(doc('sokai'), filled('sokai', { totalShares: '100', presentShares: '未集計' }))).toEqual([]);
    expect(checkDoc(doc('torishimari'), filled('torishimari', { total: '5', present: '5' }))).toEqual([]);
  });

  it('解雇予告: 通知日と解雇日が同日なら「通知日より前」ではなく不足日数を出す', () => {
    const out = at('kaiko-yokoku', {
      noticeDate: '2026年9月1日', dismissDate: '2026年9月1日', teate: '支給する', reason: '就業規則第10条',
    });
    expect(out.some((i) => i.message.includes('通知日より前'))).toBe(false);
    expect(out.some((i) => i.message.includes('予告期間は 0 日'))).toBe(true);
  });

  it('解雇予告: 手当の選択が無ければ fatal ではなく不足日数の warn にとどめる', () => {
    // teate 自体が未選択の状態。「支給しない」と決め打ちすると根拠なく fatal になる。
    const out = checkDoc(doc('kaiko-yokoku'), {
      noticeDate: '2026年9月1日', dismissDate: '2026年9月10日', reason: '就業規則第10条',
    });
    expect(out.some((i) => i.field === 'teate' && i.level === 'fatal')).toBe(false);
    expect(out.some((i) => i.field === 'teateAmount')).toBe(true);
  });

  it('契約解除通知・退職証明書: 選択が無ければ判定しない', () => {
    // 未入力の warn とは別物なので、条文の根拠が付いた指摘だけを見る。
    expect(checkDoc(doc('kaijo'), {}).some((i) => i.basis?.includes('542条'))).toBe(false);
    expect(checkDoc(doc('taishoku-shomei'), {}).some((i) => i.basis?.includes('22条3項'))).toBe(false);
  });

  it('選択肢は「書き出し」で見る（末尾一致では拾わない）', () => {
    // '催告を要せず…（無催告解除）' は前方一致でのみ当たる。
    expect(at('kaijo', { kind: '催告を要せず解除する（無催告解除）' }).some((i) => i.field === 'kind')).toBe(true);
    expect(at('kaijo', { kind: '本件は催告を要せず' }).some((i) => i.field === 'kind')).toBe(false);
  });
});

describe('前後の空白は入力とみなさない', () => {
  it('必須項目が空白だけなら未入力として扱う', () => {
    const out = checkDoc(doc('invoice'), { regno: '   ' });
    expect(out.some((i) => i.field === 'regno' && i.message.endsWith('が未入力です。'))).toBe(true);
  });

  it('数値項目が空白だけなら「読み取れません」ではなく未入力として扱う', () => {
    const numField = doc('shohi').fields.find((f) => f.num)!;
    const out = checkDoc(doc('shohi'), { [numField.k]: '   ' });
    expect(out.some((i) => i.message.includes('数値として読み取れません'))).toBe(false);
  });

  it('品目名が空白だけなら明細に入力があるとみなさない', () => {
    const out = checkDoc(doc('invoice'), { i1name: '   ', i1price: '  ', i1kind: '（使わない）' });
    expect(out.some((i) => i.field === 'i1kind' || i.field === 'i1price')).toBe(false);
  });

  it('税率区分の前後に空白が入っても選択として読む', () => {
    const out = checkDoc(doc('invoice'), { i1name: '事務用品', i1kind: ' 任意税率A ', rateA: '' });
    expect(out.some((i) => i.field === 'rateA' && i.level === 'fatal')).toBe(true);
  });

  it('単価だけの入力でも明細に入力があるとみなす', () => {
    const out = checkDoc(doc('invoice'), { i1name: '', i1price: '1000', i1kind: '（使わない）' });
    expect(out.some((i) => i.field === 'i1kind')).toBe(true);
  });

  it('区分が未選択のまま入力されていれば載らない旨を出す', () => {
    const out = checkDoc(doc('invoice'), { i1name: '事務用品', i1price: '1000', i1kind: '' });
    expect(out.some((i) => i.field === 'i1kind')).toBe(true);
  });
});

describe('日付・登録番号の追加境界', () => {
  it('parseJpDate は月の範囲を上下とも弾く', () => {
    expect(parseJpDate('2026年0月10日')).toBeNull();
    expect(parseJpDate('2026年13月10日')).toBeNull();
    expect(parseJpDate('2026年1月10日')).toBe(Date.UTC(2026, 0, 10));
    expect(parseJpDate('2026年12月10日')).toBe(Date.UTC(2026, 11, 10));
  });

  it('parseJpDate は日の繰り上がり・繰り下がりを弾く', () => {
    expect(parseJpDate('2026年1月0日')).toBeNull();
    expect(parseJpDate('2026年1月32日')).toBeNull();
    expect(parseJpDate('2026年1月31日')).toBe(Date.UTC(2026, 0, 31));
  });

  it('isRegistrationNo は先頭から見る（前に何か付いていれば不可）', () => {
    expect(isRegistrationNo('XT1234567890123')).toBe(false);
    expect(isRegistrationNo('T1234567890123')).toBe(true);
  });

  it('建物賃貸借: 年・か月の間に空白が入っても読む', () => {
    // 「1 年6か月」の年を見落とすと、6か月契約と誤認して余計な warn を出す。
    expect(at2('chintai', { term: '1 年6か月' }).some((i) => i.field === 'term')).toBe(false);
    expect(at2('chintai', { term: '6 か月' }).some((i) => i.field === 'term')).toBe(true);
  });
});

const at2 = (id: string, over: Record<string, string>) => checkDoc(doc(id), filled(id, over));

describe('資金調達計画書の検算', () => {
  const at = (over: Record<string, string>) => checkDoc(doc('chotatsu-keikaku'), filled('chotatsu-keikaku', over));
  /** 必要資金 1,200万 / 調達 1,200万 で釣り合った状態。 */
  const BALANCED = {
    equip: '8000000', working: '4000000',
    selfFund: '3000000', loanBank: '7000000', loanPublic: '2000000', subsidy: '0', otherFund: '0',
  };

  it('必要資金と調達が一致していれば fatal は出ない', () => {
    expect(at(BALANCED).some((i) => i.level === 'fatal')).toBe(false);
  });

  it('食い違えば差額を金額で示す', () => {
    const out = at({ ...BALANCED, loanPublic: '1000000' });
    const gap = out.find((i) => i.level === 'fatal');
    expect(gap?.message).toContain('12,000,000 円');
    expect(gap?.message).toContain('11,000,000 円');
    expect(gap?.message).toContain('1,000,000 円 食い違って');
  });

  it('どちらも 0 なら判定しない（書きかけの状態を責めない）', () => {
    const zero = { equip: '0', working: '0', selfFund: '0', loanBank: '0', loanPublic: '0', subsidy: '0', otherFund: '0' };
    expect(at(zero).some((i) => i.level === 'fatal')).toBe(false);
  });

  it('片方だけ入っていれば食い違いとして拾う', () => {
    const only = { equip: '1000000', working: '0', selfFund: '0', loanBank: '0', loanPublic: '0', subsidy: '0', otherFund: '0' };
    expect(at(only).some((i) => i.level === 'fatal')).toBe(true);
  });

  it('使わない調達手段が空欄でも合計は 0 として扱う（書面の合計欄と一致させる）', () => {
    // 空欄を「読めない」扱いにすると合計が NaN になり、書面には差額が出ているのに
    // 何も指摘されないという最悪の状態になる。空欄は 0。
    const out = checkDoc(doc('chotatsu-keikaku'), {
      equip: '8000000', working: '4000000', selfFund: '3000000', loanBank: '7000000',
    });
    const gap = out.find((i) => i.level === 'fatal');
    expect(gap?.message).toContain('12,000,000 円');
    expect(gap?.message).toContain('10,000,000 円');
    expect(gap?.message).toContain('2,000,000 円 食い違って');
  });

  it('空欄だけを埋めて一致させれば fatal が消える', () => {
    const out = checkDoc(doc('chotatsu-keikaku'), {
      equip: '8000000', working: '4000000', selfFund: '3000000', loanBank: '7000000', loanPublic: '2000000',
    });
    expect(out.some((i) => i.level === 'fatal')).toBe(false);
  });

  it('調達の 5 区分すべてが合計に効く', () => {
    // どれか 1 つでも集計から漏れると、差額が出ているのに気づけない。
    const base = { equip: '5000000', working: '0' };
    const each: Record<string, string> = {
      selfFund: '1000000', loanBank: '1000000', loanPublic: '1000000', subsidy: '1000000', otherFund: '1000000',
    };
    // 5 区分で 500 万 → 必要資金と一致
    expect(checkDoc(doc('chotatsu-keikaku'), { ...base, ...each }).some((i) => i.level === 'fatal')).toBe(false);
    // どれか 1 つを外すと必ず食い違う
    for (const k of Object.keys(each)) {
      const dropped = { ...each, [k]: '0' };
      expect(
        checkDoc(doc('chotatsu-keikaku'), { ...base, ...dropped }).some((i) => i.level === 'fatal'),
        `${k} が合計に効いていない`,
      ).toBe(true);
    }
  });

  it('金額が読めなければ一致判定をしない', () => {
    expect(at({ ...BALANCED, equip: '未定' }).some((i) => i.level === 'fatal')).toBe(false);
    expect(at({ ...BALANCED, selfFund: '未定' }).some((i) => i.level === 'fatal')).toBe(false);
  });

  it('自己資金が調達総額の1割未満なら warn、ちょうど1割は通す', () => {
    const tenth = { equip: '10000000', working: '0', selfFund: '1000000', loanBank: '9000000', loanPublic: '0', subsidy: '0', otherFund: '0' };
    expect(at(tenth).some((i) => i.field === 'selfFund' && i.level === 'warn')).toBe(false);
    const under = { ...tenth, selfFund: '999999', loanBank: '9000001' };
    expect(at(under).some((i) => i.field === 'selfFund' && i.level === 'warn')).toBe(true);
  });

  it('調達が 0 なら自己資金の割合を判定しない', () => {
    const none = { equip: '0', working: '0', selfFund: '0', loanBank: '0', loanPublic: '0', subsidy: '0', otherFund: '0' };
    expect(at(none).some((i) => i.field === 'selfFund')).toBe(false);
  });

  it('補助金を計上したら精算払いであることを警告する', () => {
    expect(at({ ...BALANCED, subsidy: '1000000', loanPublic: '1000000' }).some((i) => i.field === 'subsidy')).toBe(true);
    expect(at(BALANCED).some((i) => i.field === 'subsidy')).toBe(false);
  });

  it('返済期間と借入があれば年あたりの元金返済を示す', () => {
    const out = at({ ...BALANCED, years: '10' });
    expect(out.some((i) => i.level === 'info' && i.message.includes('900,000 円 の返済'))).toBe(true);
  });

  it('返済期間が無い・借入が無ければ返済額を出さない', () => {
    expect(at({ ...BALANCED, years: '0' }).some((i) => i.message.includes('元金だけで年'))).toBe(false);
    const noDebt = { equip: '3000000', working: '0', selfFund: '3000000', loanBank: '0', loanPublic: '0', subsidy: '0', otherFund: '0', years: '5' };
    expect(at(noDebt).some((i) => i.message.includes('元金だけで年'))).toBe(false);
  });
});

describe('事業計画書の検算', () => {
  const at = (over: Record<string, string>) => checkDoc(doc('jigyo-keikaku'), filled('jigyo-keikaku', over));

  it('利益が売上を上回る年を名指しする', () => {
    expect(at({ y1sales: '100', y1profit: '200' }).some((i) => i.field === 'y1profit')).toBe(true);
    expect(at({ y2sales: '100', y2profit: '200' }).some((i) => i.field === 'y2profit')).toBe(true);
    expect(at({ y3sales: '100', y3profit: '200' }).some((i) => i.field === 'y3profit')).toBe(true);
  });

  it('利益と売上が同額なら指摘しない', () => {
    expect(at({ y1sales: '100', y1profit: '100', y2sales: '100', y2profit: '100', y3sales: '100', y3profit: '100' })
      .some((i) => /経常利益が売上高を上回/.test(i.message))).toBe(false);
  });

  it('3年目が1年目の5倍を超えたら根拠を問う', () => {
    expect(at({ y1sales: '1000', y3sales: '5001' }).some((i) => i.field === 'y3sales')).toBe(true);
    // ちょうど5倍は通す
    expect(at({ y1sales: '1000', y3sales: '5000' }).some((i) => i.field === 'y3sales')).toBe(false);
  });

  it('1年目の売上が 0 なら伸び率を判定しない', () => {
    expect(at({ y1sales: '0', y3sales: '99999999' }).some((i) => i.field === 'y3sales')).toBe(false);
  });

  it('算出根拠が空欄なら fatal', () => {
    expect(at({ basis: '' }).some((i) => i.field === 'basis' && i.level === 'fatal')).toBe(true);
    expect(at({ basis: '   ' }).some((i) => i.field === 'basis' && i.level === 'fatal')).toBe(true);
    expect(at({ basis: '単価5万 × 20社 × 12か月' }).some((i) => i.field === 'basis' && i.level === 'fatal')).toBe(false);
  });
});

describe('法定帳簿の検算', () => {
  const at = (id: string, over: Record<string, string>) => checkDoc(doc(id), filled(id, over));
  /** 条件に当たる指摘をちょうど 1 件だけ取り出す。0 件でも 2 件でも落とす。 */
  const one = (out: readonly DocIssue[], re: RegExp): DocIssue => {
    const hits = out.filter((i) => re.test(i.message));
    expect(hits).toHaveLength(1);
    return hits[0]!;
  };

  describe('労働者名簿', () => {
    it('退職日が入っているのに事由が空なら warn', () => {
      const hit = one(at('roudousha-meibo', { retired: '2027年3月31日', retireReason: '' }), /退職の事由が空欄/);
      expect(hit.level).toBe('warn');
      expect(hit.field).toBe('retireReason');
      expect(hit.basis).toBe('労働基準法施行規則53条1項');
      expect(hit.message).toContain('解雇の場合はその理由');
      expect(at('roudousha-meibo', { retired: '2027年3月31日', retireReason: '自己都合' })
        .some((i) => i.field === 'retireReason')).toBe(false);
      // 在職中（退職日が空）なら事由も空でよい
      expect(at('roudousha-meibo', { retired: '', retireReason: '' })
        .some((i) => i.field === 'retireReason')).toBe(false);
      // 空白だけの入力は「空」と同じ扱い（退職日側）
      expect(at('roudousha-meibo', { retired: '   ', retireReason: '' })
        .some((i) => i.field === 'retireReason')).toBe(false);
    });

    it('業務の種類が空なら 30人未満の例外を案内する（責めない）', () => {
      const hit = one(at('roudousha-meibo', { duty: '' }), /従事する業務の種類/);
      expect(hit.level).toBe('info');
      expect(hit.field).toBe('duty');
      expect(hit.basis).toBe('労働基準法施行規則53条2項');
      expect(hit.message).toContain('30人未満');
      expect(hit.message).toContain('30人以上なら必要');
      expect(at('roudousha-meibo', { duty: '開発' }).some((i) => i.field === 'duty')).toBe(false);
      expect(at('roudousha-meibo', { duty: '  ' }).some((i) => i.field === 'duty')).toBe(true);
    });

    it('保存の起算日を必ず案内する', () => {
      const hit = one(at('roudousha-meibo', {}), /保存期間は5年/);
      expect(hit.level).toBe('info');
      expect(hit.field).toBeUndefined();
      expect(hit.basis).toBe('労働基準法109条・附則143条');
      expect(hit.message).toContain('死亡・退職・解雇の日');
      expect(hit.message).toContain('在職中に破棄せず');
    });
  });

  describe('賃金台帳', () => {
    it('時間外・休日・深夜は内数なので、合計が労働時間を超えたら warn', () => {
      const hit = one(
        at('chingin-daichou', { workHours: '160', overtimeHours: '100', holidayHours: '40', nightHours: '40' }),
        /内数として記載/,
      );
      expect(hit.level).toBe('warn');
      expect(hit.field).toBe('workHours');
      expect(hit.basis).toBe('労働基準法施行規則54条');
      // 3 項目の合計（100+40+40=180）と労働時間（160）を両方本文に出す
      expect(hit.message).toContain('180 時間');
      expect(hit.message).toContain('160 時間');
      // ちょうど一致は通す
      expect(at('chingin-daichou', { workHours: '160', overtimeHours: '100', holidayHours: '40', nightHours: '20' })
        .some((i) => /内数として記載/.test(i.message))).toBe(false);
      // 内数 3 項目はどれか 1 つでも効く
      expect(at('chingin-daichou', { workHours: '0', overtimeHours: '1', holidayHours: '0', nightHours: '0' })
        .some((i) => /内数として記載/.test(i.message))).toBe(true);
      expect(at('chingin-daichou', { workHours: '0', overtimeHours: '0', holidayHours: '1', nightHours: '0' })
        .some((i) => /内数として記載/.test(i.message))).toBe(true);
      expect(at('chingin-daichou', { workHours: '0', overtimeHours: '0', holidayHours: '0', nightHours: '1' })
        .some((i) => /内数として記載/.test(i.message))).toBe(true);
    });

    it('労働時間が出勤日数 × 24 を超えたら warn', () => {
      const zero = { overtimeHours: '0', holidayHours: '0', nightHours: '0' };
      const hit = one(at('chingin-daichou', { ...zero, workDays: '20', workHours: '481' }), /24時間/);
      expect(hit.level).toBe('warn');
      expect(hit.field).toBe('workHours');
      expect(hit.basis).toBeUndefined();
      expect(hit.message).toContain('（480 時間）'); // 20 × 24。割り算・引き算に化けたら落ちる
      expect(at('chingin-daichou', { ...zero, workDays: '20', workHours: '480' })
        .some((i) => /24時間/.test(i.message))).toBe(false);
      // 日数が 0 なら判定しない（0 × 24 = 0 を超えた、で全件警告になるのを防ぐ）
      expect(at('chingin-daichou', { ...zero, workDays: '0', workHours: '999' })
        .some((i) => /24時間/.test(i.message))).toBe(false);
      expect(at('chingin-daichou', { ...zero, workDays: '1', workHours: '25' })
        .some((i) => /24時間/.test(i.message))).toBe(true);
    });

    it('控除が支給を超えたら warn', () => {
      const over = { basic: '100000', overtimePay: '0', commute: '0', otherPay: '0',
        health: '90000', pension: '90000', employment: '0', incomeTax: '0', residentTax: '0', otherDeduct: '0' };
      const hit = one(at('chingin-daichou', over), /控除額の合計/);
      expect(hit.level).toBe('warn');
      expect(hit.field).toBe('otherDeduct');
      expect(hit.message).toContain('180,000 円');
      expect(hit.message).toContain('100,000 円');
      expect(at('chingin-daichou', { ...over, pension: '5000' }).some((i) => /控除額の合計/.test(i.message))).toBe(false);
      // 支給 4 項目・控除 6 項目のどれを動かしても効く（合計キーの取りこぼし検出）。
      // 支給側は「その 1 項目だけで控除を上回る」形にする。0 を置いても合計から
      // 落ちたことが観測できないので、必ず金額を持たせて指摘が消えることを確かめる。
      for (const k of ['basic', 'overtimePay', 'commute', 'otherPay']) {
        const onlyPaid = { basic: '0', overtimePay: '0', commute: '0', otherPay: '0',
          health: '50000', pension: '0', employment: '0', incomeTax: '0', residentTax: '0', otherDeduct: '0',
          [k]: '100000' };
        expect(at('chingin-daichou', onlyPaid).some((i) => /控除額の合計/.test(i.message))).toBe(false);
        expect(at('chingin-daichou', { ...onlyPaid, [k]: '0' })
          .some((i) => /控除額の合計/.test(i.message))).toBe(true);
      }
      for (const k of ['health', 'pension', 'employment', 'incomeTax', 'residentTax', 'otherDeduct']) {
        const only = { basic: '0', overtimePay: '0', commute: '0', otherPay: '0',
          health: '0', pension: '0', employment: '0', incomeTax: '0', residentTax: '0', otherDeduct: '0', [k]: '1' };
        expect(at('chingin-daichou', only).some((i) => /控除額の合計/.test(i.message))).toBe(true);
      }
    });

    it('給与明細との違いを必ず案内する', () => {
      const hit = one(at('chingin-daichou', {}), /給与明細を綴じただけ/);
      expect(hit.level).toBe('info');
      expect(hit.field).toBeUndefined();
      expect(hit.basis).toBe('労働基準法108条・施行規則54条');
      expect(hit.message).toContain('事業場に備え付ける帳簿');
    });
  });

  describe('出勤簿', () => {
    it('内数が総労働時間を超えたら warn', () => {
      const hit = one(at('shukkinbo', { totalHours: '100', overtime: '80', holidayWork: '40', night: '0' }), /時間外・休日・深夜/);
      expect(hit.level).toBe('warn');
      expect(hit.field).toBe('totalHours');
      expect(hit.message).toContain('120 時間');
      expect(hit.message).toContain('100 時間');
      expect(at('shukkinbo', { totalHours: '160', overtime: '10', holidayWork: '0', night: '0' })
        .some((i) => /時間外・休日・深夜/.test(i.message))).toBe(false);
      for (const k of ['overtime', 'holidayWork', 'night']) {
        expect(at('shukkinbo', { totalHours: '0', overtime: '0', holidayWork: '0', night: '0', [k]: '1' })
          .some((i) => /時間外・休日・深夜/.test(i.message))).toBe(true);
      }
    });

    it('総労働時間が出勤日数 × 24 を超えたら warn', () => {
      const zero = { overtime: '0', holidayWork: '0', night: '0' };
      const hit = one(at('shukkinbo', { ...zero, workDays: '10', totalHours: '241' }), /24時間/);
      expect(hit.level).toBe('warn');
      expect(hit.field).toBe('totalHours');
      expect(hit.message).toContain('（240 時間）'); // 10 × 24
      expect(at('shukkinbo', { ...zero, workDays: '10', totalHours: '240' })
        .some((i) => /24時間/.test(i.message))).toBe(false);
      // 日数 0 は判定しない
      expect(at('shukkinbo', { ...zero, workDays: '0', totalHours: '999' })
        .some((i) => /24時間/.test(i.message))).toBe(false);
      expect(at('shukkinbo', { ...zero, workDays: '1', totalHours: '25' })
        .some((i) => /24時間/.test(i.message))).toBe(true);
    });

    it('自己申告なら乖離の是正を求める', () => {
      const hit = one(at('shukkinbo', { method: '自己申告' }), /自己申告による把握/);
      expect(hit.level).toBe('warn');
      expect(hit.field).toBe('method');
      expect(hit.basis).toBe('労働時間の適正な把握のために使用者が講ずべき措置に関するガイドライン');
      expect(hit.message).toContain('客観的な記録');
      expect(at('shukkinbo', { method: 'タイムカード' }).some((i) => i.field === 'method')).toBe(false);
      expect(at('shukkinbo', { method: 'ICカード' }).some((i) => i.field === 'method')).toBe(false);
      expect(at('shukkinbo', { method: '使用者による現認' }).some((i) => i.field === 'method')).toBe(false);
    });

    it('管理監督者も把握対象であることを案内する', () => {
      const hit = one(at('shukkinbo', {}), /労働時間の状況の把握/);
      expect(hit.level).toBe('info');
      expect(hit.field).toBeUndefined();
      expect(hit.basis).toBe('労働安全衛生法66条の8の3');
      expect(hit.message).toContain('裁量労働制');
    });
  });

  describe('年次有給休暇管理簿', () => {
    it('10日以上付与で取得5日未満なら fatal（5日取得義務）', () => {
      const hit = one(at('yukyu-kanribo', { granted: '10', taken: '4' }), /5日を取得させる義務/);
      expect(hit.level).toBe('fatal');
      expect(hit.field).toBe('taken');
      expect(hit.basis).toBe('労働基準法39条7項・120条（労働者1人につき30万円以下の罰金）');
      expect(hit.message).toContain('付与日数が 10 日');
      expect(hit.message).toContain('取得日数が 4 日');
      expect(hit.message).toContain('本人が希望しなかった');
      expect(hit.message).toContain('使用者が時季を指定');
    });

    it('取得ちょうど5日は通す', () => {
      expect(at('yukyu-kanribo', { granted: '10', taken: '5' }).some((i) => i.level === 'fatal')).toBe(false);
      expect(at('yukyu-kanribo', { granted: '10', taken: '4' }).some((i) => i.level === 'fatal')).toBe(true);
    });

    it('付与9日なら 5日義務の対象外', () => {
      expect(at('yukyu-kanribo', { granted: '9', taken: '0' }).some((i) => i.level === 'fatal')).toBe(false);
      // 10 日ちょうどから対象
      expect(at('yukyu-kanribo', { granted: '10', taken: '0' }).some((i) => i.level === 'fatal')).toBe(true);
    });

    it('記入した時季の数と取得日数が食い違えば warn', () => {
      const base = { granted: '10', d1: '2026年5月1日', d2: '2026年5月2日', d3: '', d4: '', d5: '', d6: '' };
      const hit = one(at('yukyu-kanribo', { ...base, taken: '5' }), /記入された時季/);
      expect(hit.level).toBe('warn');
      expect(hit.field).toBe('taken');
      expect(hit.basis).toBeUndefined();
      expect(hit.message).toContain('時季は 2 件');
      expect(hit.message).toContain('取得日数は 5 日');
      expect(hit.message).toContain('半日単位・時間単位');
      expect(at('yukyu-kanribo', { ...base, taken: '2' }).some((i) => /記入された時季/.test(i.message))).toBe(false);
      // 6 欄すべてを数える（どれか 1 欄でも落とすと件数がずれる）
      for (const k of ['d1', 'd2', 'd3', 'd4', 'd5', 'd6']) {
        const only = { granted: '10', taken: '5', d1: '', d2: '', d3: '', d4: '', d5: '', d6: '', [k]: '2026年5月1日' };
        expect(at('yukyu-kanribo', only).some((i) => /時季は 1 件/.test(i.message))).toBe(true);
      }
      // 空白だけの欄は数えない
      expect(at('yukyu-kanribo', { granted: '10', taken: '5', d1: '   ', d2: '', d3: '', d4: '', d5: '', d6: '' })
        .some((i) => /記入された時季/.test(i.message))).toBe(false);
    });

    it('時季を 1 件も書いていなければ数の突合はしない', () => {
      const none = { granted: '10', taken: '5', d1: '', d2: '', d3: '', d4: '', d5: '', d6: '' };
      expect(at('yukyu-kanribo', none).some((i) => /記入された時季/.test(i.message))).toBe(false);
    });

    it('取得が付与＋繰越を超えたら warn', () => {
      const hit = one(at('yukyu-kanribo', { granted: '10', carried: '5', taken: '16' }), /付与＋繰越/);
      expect(hit.level).toBe('warn');
      expect(hit.field).toBe('taken');
      expect(hit.basis).toBeUndefined();
      expect(hit.message).toContain('取得日数（16 日）');
      expect(hit.message).toContain('（15 日）'); // 10 + 5。引き算・掛け算に化けたら落ちる
      expect(at('yukyu-kanribo', { granted: '10', carried: '5', taken: '15' })
        .some((i) => /付与＋繰越/.test(i.message))).toBe(false);
      // 付与も繰越も 0 なら判定しない
      expect(at('yukyu-kanribo', { granted: '0', carried: '0', taken: '3' })
        .some((i) => /付与＋繰越/.test(i.message))).toBe(false);
      // 繰越だけでも上限になる
      expect(at('yukyu-kanribo', { granted: '0', carried: '2', taken: '3' })
        .some((i) => /付与＋繰越/.test(i.message))).toBe(true);
    });

    it('3点セット（時季・日数・基準日）を必ず案内する', () => {
      const hit = one(at('yukyu-kanribo', {}), /時季・日数・基準日/);
      expect(hit.level).toBe('info');
      expect(hit.field).toBeUndefined();
      expect(hit.basis).toBe('労働基準法施行規則24条の7');
      expect(hit.message).toContain('労働者ごとに');
      // 保存期間の根拠を取り違えないこと — 109条の「5年・当分の間3年」ではなく規則が直接3年
      expect(hit.message).toContain('満了後3年間保存');
      expect(hit.message).toContain('労働基準法109条の帳簿とは根拠が別');
    });
  });
});
