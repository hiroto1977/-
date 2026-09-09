/**
 * **和暦で書いた解雇予告通知書が、労基法 20 条の検査を失っていた。** (2026-09-08 · パス 100)
 *
 * `parseJpDate` は `(\d{4})` の年しか読まず、**和暦を 1 つも読めなかった**。
 * 読めなければ `day()` が NaN を返し、日数の比較はすべて false になる ——
 * つまり**法定の判定が黙って行われない**。
 *
 * 実測 (解雇予告通知書・通知から 4 日後に解雇・手当「支給しない」):
 *
 * | 日付の書き方 | 交付前チェックの結論 |
 * | --- | --- |
 * | `2026年9月1日` → `2026年9月5日` | **fatal: 予告期間が 4 日しかありません…解雇予告手当の支払が必要です** |
 * | `令和8年9月1日` → `令和8年9月5日` | **fatal が 1 件も出なかった** |
 *
 * 直す前に読めなかった書き方 (すべて null):
 * `令和8年9月30日` / `R8.9.30` / `R8/9/30` / `令8.9.30` / `平成31年4月30日` / `令8.9.30`
 *
 * **しかもこの app は自分で和暦を刷る。** `formatDate(..., { era: 'wareki' })` は
 * 税制の適用期限を「令和8年9月30日」と画面に出し、金融機関提出書面の既定も和暦である
 * (`BANK_FORMAT_DEFAULT.era === 'wareki'`)。**教えている書き方を読めなかった。**
 *
 * ## ★ 規準は手の届く所に在った (7 か所目)
 *
 * 元号の境目を持つ表 `ERAS` は `shared/bankFormat.ts` に在り、その注記に
 * 「**和暦の組み立てはここ 1 か所に置く**」と書いてある。足りなかったのは
 * **逆向きの変換**だけ。`fromWareki` は同じ `ERAS` を読む (境目を 2 か所に書くと
 * 次の改元で片方が腐る)。
 *
 * ## 境目は 1 日単位である
 *
 * 年だけの換算では足りない。`fromWareki` は両側の境目を見る:
 *
 * | 入力 | 西暦 | 在る / 無い |
 * | --- | --- | --- |
 * | 平成31年4月30日 | 2019-04-30 | **在る** (平成は 4/30 まで) |
 * | 令和元年4月30日 | — | **無い** (令和は 5/1 から) |
 * | 平成31年5月1日 | — | **無い** (平成は終わっている) |
 * | 令和元年5月1日 | 2019-05-01 | 在る |
 * | 昭和64年1月7日 | 1989-01-07 | 在る (昭和は 1/7 まで) |
 *
 * ## 読めない残りには橋を架けた (パス 94 と同じ)
 *
 * 和暦を読めるようにしても「きのう」のような入力は読めない。**空欄は「まだ
 * 書いていない」と分かるが、「読めない」は画面から見分けが付かない** ——
 * パス 94 で請求書の単価に架けたのと同じ橋を、日付にも架ける。段階は `warn`:
 * 書面が違法だと言うのではなく**検査ができなかった**と言う (`fatal` にすると、
 * 覆えていない書き方 1 つで印刷が止まる)。
 */
import { describe, expect, it } from 'vitest';
import { checkDoc, parseJpDate } from '../data/docStudioChecks';
import { STUDIO_TEMPLATES } from '../data/docStudioData';
import { formatDate, fromWareki, toWareki } from '../../shared/bankFormat';

const iso = (t: number | null): string | null => (t === null ? null : new Date(t).toISOString().slice(0, 10));

const kaiko = STUDIO_TEMPLATES.find((d) => d.id === 'kaiko-yokoku');
if (!kaiko) throw new Error('kaiko-yokoku doc missing');
const kenshu = STUDIO_TEMPLATES.find((d) => d.id === 'kenshu');
if (!kenshu) throw new Error('kenshu doc missing');

const messages = (doc: typeof kaiko, values: Record<string, string>): string[] =>
  checkDoc(doc, values).map((i) => `${i.level}: ${i.message}`);

describe('fromWareki — 元号の境目を 1 日単位で見る', () => {
  it('★ 元号の中の日付は西暦に直る', () => {
    expect(fromWareki('令和', 8, 9, 30)).toBe(2026);
    expect(fromWareki('平成', 31, 4, 30)).toBe(2019);
    expect(fromWareki('昭和', 64, 1, 7)).toBe(1989);
  });

  it('★ 元号の外の日付は null —— 存在しない日を通さない', () => {
    // 令和は 2019-05-01 から。令和元年 4/30 は存在しない。
    expect(fromWareki('令和', 1, 4, 30)).toBeNull();
    // 平成は 2019-04-30 まで。平成31年 5/1 は存在しない。
    expect(fromWareki('平成', 31, 5, 1)).toBeNull();
    // 昭和は 1926-12-25 から。昭和元年 12/24 は存在しない。
    expect(fromWareki('昭和', 1, 12, 24)).toBeNull();
    // 対照: それぞれ 1 日ずらすと在る
    expect(fromWareki('令和', 1, 5, 1)).toBe(2019);
    expect(fromWareki('平成', 31, 4, 30)).toBe(2019);
    expect(fromWareki('昭和', 1, 12, 25)).toBe(1926);
  });

  it('★ 元号は名前・1 文字・頭文字のどれでもよい (大小も問わない)', () => {
    for (const era of ['令和', '令', 'R', 'r']) {
      expect(fromWareki(era, 8, 9, 30), era).toBe(2026);
    }
    for (const era of ['平成', '平', 'H', 'h']) {
      expect(fromWareki(era, 31, 4, 30), era).toBe(2019);
    }
    // 対照: 知らない元号は null
    expect(fromWareki('大正', 1, 1, 1)).toBeNull();
    expect(fromWareki('X', 8, 9, 30)).toBeNull();
    expect(fromWareki('', 8, 9, 30)).toBeNull();
  });

  it('★ 元号年は 1 以上の整数だけ', () => {
    expect(fromWareki('令和', 0, 1, 1)).toBeNull();
    expect(fromWareki('令和', -1, 1, 1)).toBeNull();
    expect(fromWareki('令和', 1.5, 5, 1)).toBeNull();
    expect(fromWareki('令和', Number.NaN, 5, 1)).toBeNull();
  });

  it('★ toWareki と往復する (同じ台帳を両向きに読んでいる)', () => {
    for (const [y, m, d] of [[2026, 9, 30], [2019, 5, 1], [2019, 4, 30], [1989, 1, 7], [1926, 12, 25]] as const) {
      const w = toWareki(y, m, d);
      expect(w, `${y}-${m}-${d}`).not.toBeNull();
      expect(fromWareki(w!.era, w!.year, m, d), `${w!.era}${w!.year}年${m}月${d}日`).toBe(y);
    }
  });
});

describe('parseJpDate — 和暦を読む', () => {
  it('★ 直す前に読めなかった書き方が、すべて読める', () => {
    expect(iso(parseJpDate('令和8年9月30日'))).toBe('2026-09-30');
    expect(iso(parseJpDate('R8.9.30'))).toBe('2026-09-30');
    expect(iso(parseJpDate('R8/9/30'))).toBe('2026-09-30');
    expect(iso(parseJpDate('令8.9.30'))).toBe('2026-09-30');
    expect(iso(parseJpDate('平成31年4月30日'))).toBe('2019-04-30');
    // 元年
    expect(iso(parseJpDate('令和元年5月1日'))).toBe('2019-05-01');
    // 全角の数字も (既存の半角化が先に走る)
    expect(iso(parseJpDate('令和８年９月３０日'))).toBe('2026-09-30');
  });

  it('★ 対照: 西暦は今までどおり読める (壊していない)', () => {
    expect(iso(parseJpDate('2026-09-30'))).toBe('2026-09-30');
    expect(iso(parseJpDate('2026/9/30'))).toBe('2026-09-30');
    expect(iso(parseJpDate('2026年9月30日'))).toBe('2026-09-30');
    expect(iso(parseJpDate('２０２６年９月３０日'))).toBe('2026-09-30');
  });

  it('★ 暦に無い日・元号の外・知らない元号は読まない', () => {
    expect(parseJpDate('令和8年2月30日')).toBeNull(); // 2 月 30 日
    expect(parseJpDate('令和8年13月1日')).toBeNull(); // 13 月
    expect(parseJpDate('令和0年1月1日')).toBeNull(); // 0 年
    expect(parseJpDate('令和元年4月30日')).toBeNull(); // 令和より前
    expect(parseJpDate('平成31年5月1日')).toBeNull(); // 平成より後
    expect(parseJpDate('X8.9.30')).toBeNull();
    expect(parseJpDate('きのう')).toBeNull();
    expect(parseJpDate('')).toBeNull();
    expect(parseJpDate(undefined)).toBeNull();
  });

  it('★ 画面が刷る和暦を、そのまま読み返せる (往復)', () => {
    // **この app は和暦を刷る。** 刷った文字列を読み返せなければ、
    // 「教えている書き方を読めない」状態がまた生まれる。
    for (const day of ['2026-09-30', '2019-05-01', '2019-04-30', '1989-01-07']) {
      const printed = formatDate(day, { era: 'wareki' });
      expect(printed).not.toBe('―');
      expect(iso(parseJpDate(printed)), `${day} → ${printed}`).toBe(day);
    }
  });
});

describe('解雇予告通知書 — 和暦でも労基法 20 条の判定が出る', () => {
  const NOTICE = '予告期間が';

  it('★ 和暦の日付で fatal が出る (直す前は 1 件も出なかった)', () => {
    const msgs = messages(kaiko, { noticeDate: '令和8年9月1日', dismissDate: '令和8年9月5日', teate: '支給しない' });
    const fatal = msgs.filter((m) => m.startsWith('fatal: ') && m.includes(NOTICE));
    expect(fatal).toHaveLength(1);
    expect(fatal[0]).toContain('4 日');
    expect(fatal[0]).toContain('解雇予告手当');
  });

  it('★ 対照: 同じ日を西暦で入れると同じ答え (和暦だけ特別扱いしていない)', () => {
    const w = messages(kaiko, { noticeDate: '令和8年9月1日', dismissDate: '令和8年9月5日', teate: '支給しない' });
    const s = messages(kaiko, { noticeDate: '2026年9月1日', dismissDate: '2026年9月5日', teate: '支給しない' });
    expect(w).toEqual(s);
  });

  it('★ 対照: 30 日以上前の予告なら fatal は出ない (いつでも鳴る形になっていない)', () => {
    const msgs = messages(kaiko, { noticeDate: '令和8年8月1日', dismissDate: '令和8年9月5日', teate: '支給しない' });
    expect(msgs.filter((m) => m.startsWith('fatal: ') && m.includes(NOTICE))).toEqual([]);
  });
});

describe('読めない日付には断りを出す (パス 94 と同じ橋)', () => {
  it('★ 解雇予告: 読めない通知日で「判定を行いませんでした」と言う', () => {
    const msgs = messages(kaiko, { noticeDate: 'きのう', dismissDate: '令和8年9月5日', teate: '支給しない' });
    const said = msgs.filter((m) => m.includes('読み取れません'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('通知日');
    expect(said[0]).toContain('きのう'); // 入力値そのものを載せる
    expect(said[0]).toContain('30日前の予告の判定を行いませんでした');
  });

  it('★ 検収/支払: 読めない支払期日で 60 日の判定について断る', () => {
    const msgs = messages(kenshu, { receiveDate: '令和8年9月1日', payday: 'そのうち' });
    const said = msgs.filter((m) => m.includes('読み取れません'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('支払期日');
    expect(said[0]).toContain('60日以内の判定を行いませんでした');
  });

  it('★ 対照: 空欄では断らない (空欄と「読めない」を区別している)', () => {
    const msgs = messages(kaiko, { noticeDate: '', dismissDate: '', teate: '支給しない' });
    expect(msgs.filter((m) => m.includes('読み取れません'))).toEqual([]);
  });

  it('★ 対照: 読める日付では断らない (いつでも鳴る形になっていない)', () => {
    for (const raw of ['2026年9月1日', '令和8年9月1日', 'R8.9.1', '2026-09-01']) {
      const msgs = messages(kaiko, { noticeDate: raw, dismissDate: '令和8年9月5日', teate: '支給しない' });
      expect(msgs.filter((m) => m.includes('読み取れません')), raw).toEqual([]);
    }
  });

  it('★ 両方読めなければ 2 件出る (欄ごとに言う)', () => {
    const msgs = messages(kaiko, { noticeDate: 'きのう', dismissDate: 'あした', teate: '支給しない' });
    const said = msgs.filter((m) => m.includes('読み取れません'));
    expect(said).toHaveLength(2);
    expect(said.some((m) => m.includes('通知日'))).toBe(true);
    expect(said.some((m) => m.includes('解雇の日'))).toBe(true);
  });
});
