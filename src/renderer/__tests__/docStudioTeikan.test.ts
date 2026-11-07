import { describe, expect, it } from 'vitest';
import {
  buildGkChapters,
  buildKkChapters,
  teikanClosing,
  type TeikanChapter,
} from '../data/docStudioTeikan';

/** 差込値を関数の形で渡す（未入力は空文字）。 */
const V = (over: Record<string, string> = {}) => (k: string) => over[k] ?? '';

const flat = (cs: readonly TeikanChapter[]) =>
  cs.flatMap((c) => c.articles.flatMap((a) => [a.t, ...a.body, ...(a.list ?? [])]));
const titles = (cs: readonly TeikanChapter[]) => cs.flatMap((c) => c.articles.map((a) => a.t));
const find = (cs: readonly TeikanChapter[], t: string) => {
  const a = cs.flatMap((c) => c.articles).find((x) => x.t === t);
  if (!a) throw new Error(`条が見つからない: ${t}`);
  return a;
};

/**
 * 定款は登記に使う法的文書で、章がひとつ落ちても条文が空になっても
 * 「それらしい書面」のまま出てしまう。章立てと本文を丸ごと固定する。
 */
describe('定款の章立てを固定する', () => {
  it('株式会社: 全項目を入力した状態', () => {
    expect(buildKkChapters(V({
      shogo: '株式会社サンプル商会',
      p1: 'ソフトウェアの開発及び販売', p2: '経営コンサルティング業',
      honten: '東京都千代田区',
      koukoku: '電子公告', kohoUrl: 'https://example.com/ir',
      hakko: '1000', shihon: '1,000,000', fyStart: '4月',
      firstFyEnd: '2027年3月31日', firstDirector: '山田 太郎',
      f1name: '山田 太郎', f1addr: '東京都千代田区1-1', f1kabu: '100株・100万円',
    }))).toMatchSnapshot();
  });

  it('株式会社: 全項目が未入力の状態（【】が残る）', () => {
    expect(buildKkChapters(V())).toMatchSnapshot();
  });

  it('合同会社: 全項目を入力した状態', () => {
    expect(buildGkChapters(V({
      shogo: '合同会社サンプル',
      p1: 'Web サービスの企画・運営',
      honten: '大阪府大阪市',
      koukoku: '官報',
      shihon: '300,000', fyStart: '1月',
      firstFyEnd: '2026年12月31日', daihyo: '鈴木 花子',
      f1name: '鈴木 花子', f1addr: '大阪府大阪市2-2', f1kabu: '30万円',
    }))).toMatchSnapshot();
  });

  it('合同会社: 全項目が未入力の状態', () => {
    expect(buildGkChapters(V())).toMatchSnapshot();
  });
});

describe('定款の構造の健全性', () => {
  // describe の直下で生成しない。生成が例外を投げるとファイルごと収集に失敗し、
  // 「テストが落ちた」ではなく「テストが無い」になってしまう（mutation では生存扱い）。
  const both = (): readonly (readonly [string, TeikanChapter[]])[] => [
    ['kk', buildKkChapters(V())],
    ['gk', buildGkChapters(V())],
  ];

  it('章の見出しが「第N章」で連番になっている', () => {
    for (const [name, cs] of both()) {
      expect(cs.map((c) => c.chapter.replace(/ .*$/, '')), name)
        .toEqual(cs.map((_, i) => `第${i + 1}章`));
    }
  });

  it('条の見出しは（）で囲まれ、重複しない', () => {
    for (const [name, cs] of both()) {
      const ts = titles(cs);
      for (const t of ts) expect(t, `${name}: ${t}`).toMatch(/^（.+）$/);
      expect(new Set(ts).size, name).toBe(ts.length);
    }
  });

  it('本文に空文字・undefined が混ざらない', () => {
    for (const [name, cs] of both()) {
      for (const line of flat(cs)) {
        expect(line, name).toBeTypeOf('string');
        expect(line.trim().length, `${name}: 「${line}」`).toBeGreaterThan(0);
        expect(line, name).not.toContain('undefined');
        expect(line, name).not.toContain('NaN');
      }
    }
  });

  it('株式会社にだけ株式・取締役の章があり、合同会社には社員の章がある', () => {
    const kk = buildKkChapters(V()).map((c) => c.chapter).join('/');
    const gk = buildGkChapters(V()).map((c) => c.chapter).join('/');
    expect(kk).toContain('株式');
    expect(kk).toContain('取締役');
    expect(gk).toContain('社員');
    expect(gk).not.toContain('株式');
  });

  it('登記に効く条が落ちていない（会社法27条・576条の絶対的記載事項）', () => {
    // 目的・商号・本店・出資額（+ 株式会社は発行可能株式総数）が欠けると定款は無効。
    for (const [name, cs] of both()) {
      const ts = titles(cs);
      expect(ts, name).toContain('（商号）');
      expect(ts, name).toContain('（目的）');
      expect(ts, name).toContain('（本店の所在地）');
      expect(ts.join(''), name).toMatch(/出資|資本金/);
    }
    expect(titles(buildKkChapters(V()))).toContain('（発行可能株式総数）');
  });
});

describe('差込値による分岐', () => {
  it('商号は未入力なら種類ごとの既定表記になる', () => {
    expect(find(buildKkChapters(V()), '（商号）').body[0]).toContain('株式会社【商号】');
    expect(find(buildGkChapters(V()), '（商号）').body[0]).toContain('合同会社【商号】');
    expect(find(buildKkChapters(V({ shogo: '株式会社あ' })), '（商号）').body[0]).toContain('株式会社あ');
  });

  it('目的は入力された分だけ列挙し、末尾に附帯事業を必ず足す', () => {
    const list = (over: Record<string, string>) => find(buildKkChapters(V(over)), '（目的）').list ?? [];
    expect(list({})).toEqual(['前各号に附帯又は関連する一切の事業']);
    expect(list({ p1: 'A', p3: 'C' })).toEqual(['A', 'C', '前各号に附帯又は関連する一切の事業']);
    expect(list({ p1: 'A', p2: 'B', p3: 'C', p4: 'D', p5: 'E' }))
      .toEqual(['A', 'B', 'C', 'D', 'E', '前各号に附帯又は関連する一切の事業']);
  });

  it('公告方法は電子公告を選んだときだけ URL 条項になる', () => {
    const body = (over: Record<string, string>) => find(buildKkChapters(V(over)), '（公告方法）').body[0]!;
    expect(body({})).toBe('当会社の公告は、官報に掲載する方法により行う。');
    expect(body({ koukoku: '官報' })).toBe('当会社の公告は、官報に掲載する方法により行う。');
    expect(body({ koukoku: '電子公告', kohoUrl: 'https://example.com' })).toContain('https://example.com');
    expect(body({ koukoku: '電子公告', kohoUrl: 'https://example.com' })).toContain('電子公告により行う');
    // URL 未入力なら差込の目印を残す（黙って空欄にしない）
    expect(body({ koukoku: '電子公告' })).toContain('【電子公告のURL】');
    // 電子公告でも事故時は官報に落ちる旨を必ず併記する（会社法940条3項）
    expect(body({ koukoku: '電子公告' })).toContain('官報に掲載する方法により行う');
  });

  it('事業年度は開始月から末日を導く（1月始まりだけ同年で閉じる）', () => {
    const fy = (m: string) => find(buildKkChapters(V({ fyStart: m })), '（事業年度）').body[0]!;
    expect(fy('4月')).toContain('毎年4月1日から翌年3月末日まで');
    expect(fy('1月')).toContain('毎年1月1日から同年12月末日まで');
    expect(fy('12月')).toContain('毎年12月1日から翌年11月末日まで');
    expect(fy('2月')).toContain('毎年2月1日から翌年1月末日まで');
    // 未選択は 4 月始まり（日本の既定）
    expect(fy('')).toContain('毎年4月1日から翌年3月末日まで');
  });

  it('合同会社の事業年度も同じ規則で導く', () => {
    expect(find(buildGkChapters(V({ fyStart: '1月' })), '（事業年度）').body[0])
      .toContain('毎年1月1日から同年12月末日まで');
    expect(find(buildGkChapters(V({ fyStart: '7月' })), '（事業年度）').body[0])
      .toContain('毎年7月1日から翌年6月末日まで');
  });

  it('発起人は入力された人数だけ並び、誰も居なければ差込の目印を 1 名分残す', () => {
    const body = (over: Record<string, string>) =>
      find(buildKkChapters(V(over)), '（発起人の氏名、住所及び引受株式）').body;
    expect(body({})).toHaveLength(2); // 前書き + 目印 1 名
    expect(body({})[1]).toBe('発起人 【発起人1 氏名】（住所: 【発起人1 住所】）: 【引受株数・出資額】');
    expect(body({ f1name: '甲' })).toHaveLength(2);
    expect(body({ f1name: '甲', f2name: '乙' })).toHaveLength(3);
    // 住所・引受株式は行ごとに本人のものを引く（1人目の値を使い回さない）
    expect(body({
      f1name: '甲', f1addr: '東京都港区1-1', f1kabu: '60株',
      f2name: '乙', f2addr: '大阪市北区2-2', f2kabu: '40株',
    }).slice(1)).toEqual([
      '発起人 甲（住所: 東京都港区1-1）: 60株',
      '発起人 乙（住所: 大阪市北区2-2）: 40株',
    ]);
    // 2人目だけ入力された場合も取りこぼさず、その人の値を引く
    expect(body({ f2name: '乙', f2addr: '福岡市中央区3-3', f2kabu: '100株' })[1])
      .toBe('発起人 乙（住所: 福岡市中央区3-3）: 100株');
    // 氏名だけ入力された行は住所・出資の目印を残す
    expect(body({ f1name: '甲' })[1]).toBe('発起人 甲（住所: 【発起人1 住所】）: 【引受株数・出資額】');
  });

  it('合同会社の社員条も同じ規則で並ぶ', () => {
    const body = (over: Record<string, string>) =>
      find(buildGkChapters(V(over)), '（社員の氏名、住所、出資及び責任）').body;
    expect(body({})).toHaveLength(1);
    expect(body({})[0]).toBe('社員 【社員1 氏名】（住所: 【社員1 住所】）は有限責任社員とし、その出資額は 【出資額】 とする。');
    expect(body({ f1name: '甲', f2name: '乙' })).toHaveLength(2);
    expect(body({ f1name: '甲', f1addr: '京都市', f1kabu: '30万円' })[0])
      .toBe('社員 甲（住所: 京都市）は有限責任社員とし、その出資額は 30万円 とする。');
    expect(body({ f2name: '乙', f2addr: '神戸市', f2kabu: '20万円' })[0])
      .toBe('社員 乙（住所: 神戸市）は有限責任社員とし、その出資額は 20万円 とする。');
  });

  it('株式会社は出資額と成立後の資本金を同額で記載する', () => {
    const cs = buildKkChapters(V({ shihon: '5,000,000' }));
    expect(find(cs, '（設立に際して出資される財産の価額）').body[0]).toContain('金5,000,000円');
    expect(find(cs, '（成立後の資本金の額）').body[0]).toContain('金5,000,000円');
  });
});

describe('締め文と署名欄', () => {
  it('株式会社は発起人、合同会社は社員が署名する', () => {
    const kk = teikanClosing(V({ shogo: '株式会社甲', f1name: '山田', date: '2026年8月6日' }), 'kk');
    expect(kk.closing).toContain('株式会社甲');
    expect(kk.closing).toContain('発起人が次に電子署名する');
    expect(kk.signers).toHaveLength(1);
    expect(kk.signers[0]).toContain('発起人');
    expect(kk.signers[0]).toContain('山田');
    expect(kk.date).toBe('2026年8月6日');

    const gk = teikanClosing(V({ f1name: '鈴木', f2name: '佐藤' }), 'gk');
    expect(gk.closing).toContain('合同会社【商号】');
    expect(gk.closing).toContain('社員が次に電子署名する');
    expect(gk.signers).toHaveLength(2);
    expect(gk.signers.every((s) => s.startsWith('社員'))).toBe(true);
  });

  it('氏名未入力なら人数つきの差込目印を残す', () => {
    const { signers, date } = teikanClosing(V(), 'kk');
    expect(signers).toEqual(['発起人　【発起人1 氏名】　（電子署名）']);
    expect(date).toBe('【定款作成日】');
  });

  it('2 人目だけ入力されていても署名欄はその人 1 行になる', () => {
    // members() は入力された人だけを詰めるので、空行が残らない。
    expect(teikanClosing(V({ f2name: '乙' }), 'gk').signers).toEqual(['社員　乙　（電子署名）']);
    expect(teikanClosing(V({ f2name: '乙' }), 'kk').signers).toEqual(['発起人　乙　（電子署名）']);
  });

  it('商号が未入力なら締め文も種類ごとの目印になる', () => {
    expect(teikanClosing(V(), 'kk').closing).toContain('株式会社【商号】');
    expect(teikanClosing(V(), 'gk').closing).toContain('合同会社【商号】');
  });

  it('未入力の署名欄は種類ごとの目印になる', () => {
    expect(teikanClosing(V(), 'gk').signers).toEqual(['社員　【社員1 氏名】　（電子署名）']);
    expect(teikanClosing(V(), 'kk').signers).toEqual(['発起人　【発起人1 氏名】　（電子署名）']);
  });

  it('署名欄は全角空白で区切る（印刷時に欄として読める幅を確保する）', () => {
    for (const s of teikanClosing(V({ f1name: '甲' }), 'kk').signers) {
      expect(s.split('　')).toHaveLength(3);
    }
  });
});
