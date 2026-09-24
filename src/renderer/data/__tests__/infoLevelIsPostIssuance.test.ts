/**
 * **`info` は「交付後にやること」—— 交付前に確かめる事を置いてはいけない** (2026-09-24 · パス 437)。
 *
 * `shared/issueLevel.ts` は `info` を「**交付・提出のあとに**期限内でやることの取りこぼし」と
 * 定義し、画面は「🕒 交付後にやること」と名乗る。そして交付前チェックの見出しは
 * `fatal === 0 && warn === 0` のとき「無効リスクは見つかりませんでした」になる ——
 * **`info` は「交付してよいか」の判定に入らない**。
 *
 * 実測 (2026-09-23 · 直す前 · 解雇予告通知書を法に適う形で埋める ——
 * 60 日前の予告・理由あり・数値欄も正):
 *
 * ```
 *   🔍 交付前チェック — 無効リスクは見つかりませんでした
 *     🕒 交付後にやること: 業務上の傷病による休業期間及びその後30日間、産前産後の休業期間
 *        及びその後30日間は原則として解雇できません。該当しないか確認してください。[労働基準法19条]
 * ```
 *
 * ★ **同じ画面が、自分が今挙げた無効リスクについて「見つかりませんでした」と述べていた。**
 * 労基法19条の期間中の解雇は**無効**で、同法119条1号の罰則 (6か月以下の懲役又は30万円
 * 以下の罰金) を伴う。**交付した後に気付いても、その解雇は既に無効である** ——
 * 確かめる場所は交付の前で、文自身が「該当しないか確認してください」と言っている。
 *
 * ★ **同じ形が 2 つの段階に分かれ、重い方が低い段階に居た** —— どちらも
 * 「アプリには観測できない前提条件・利用者が確かめる・当てはまれば交付できない」:
 *
 * | 書面 | 根拠 | 直す前 |
 * | --- | --- | --- |
 * | `taishoku-shomei` | 労基法22条3項 (30万円以下の罰金) | **`warn`** ⚠️ 要確認 |
 * | `kaiko-yokoku` | **労基法19条 (解雇は無効・懲役刑あり)** | **`info`** 🕒 交付後にやること |
 *
 * `fatal` にはしない —— アプリはこの前提条件を**観測できない**ので、「このままでは無効」と
 * 断定すると観測していない事実を主張することになる (パス 436 で ＊ の印について下したのと
 * 同じ判断)。
 *
 * ## この検査の形
 *
 * - **母集団は原文の走査で導く** —— `level: 'info'` の push を括弧の対応で切り出す。
 *   `info` を 1 つ足した日は「どの種類か・なぜか」を書けと鳴る (両方向)。
 * - **`pre-issuance` という種類は型に無い** —— それがこの台帳の要点である。機械は
 *   「交付前の事か」を判定できないので、**人に分類を書かせる**ことで問わせる。
 * - **背骨は振る舞い** —— 実物の `checkDoc` を法に適う入力で呼び、パネルと同じ式で
 *   見出しを組んで、無効リスクを挙げながら「見つかりませんでした」と言わないことを見る。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { STUDIO_TEMPLATES } from '../docStudioData';
import { checkDoc } from '../docStudioChecks';
import { countByLevel, type IssueLevel } from '../../../shared/issueLevel';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';

const SRC = readOriginalSource(join(__dirname, '..', 'docStudioChecks.ts'));

/**
 * ファイル全体の `{` と `}` を対応づける (文字列リテラルは飛ばす)。
 *
 * **綴りで切り出さない** —— この検査の最初の版は `out.push({` だけを探し、
 * `return [{ level: 'info' as const, … }]` の形の **13 件を 1 つも見なかった**
 * (実測 23 件中 10 件しか映らなかった)。パス 334 / 412 / 418 と同じ家系
 * (**綴りの針は、綴りでない物に動かされる**) なので、器そのものを対応づける。
 */
function bracePairs(src: string): ReadonlyMap<number, number> {
  const open: number[] = [];
  const pair = new Map<number, number>();
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (ch === '`' || ch === "'" || ch === '"') {
      const q = ch;
      i += 1;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i += 1;
        i += 1;
      }
    } else if (ch === '{') open.push(i);
    else if (ch === '}') {
      const o = open.pop();
      if (o !== undefined) pair.set(o, i);
    }
  }
  return pair;
}

/** `level: 'info'` を囲むいちばん内側のオブジェクトリテラルを返す。 */
function infoObjects(src: string): readonly string[] {
  const pairs = bracePairs(src);
  const opens = [...pairs.keys()].sort((a, b) => a - b);
  const out: string[] = [];
  const re = /level:\s*'info'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let best: readonly [number, number] | null = null;
    for (const o of opens) {
      if (o > m.index) break;
      const c = pairs.get(o)!;
      if (c > m.index && (best === null || o > best[0])) best = [o, c];
    }
    if (best) out.push(src.slice(best[0], best[1] + 1));
  }
  return out;
}

/** 台帳の鍵は**利用者が読む文の書き出し**。文を書き換えたら分類を問い直すべきなので、それでよい。 */
const keyOf = (message: string): string => message.replace(/\s+/g, '').slice(0, 20);

interface InfoRow {
  /** message の書き出し 20 字 (空白を除く)。 */
  readonly key: string;
  /**
   * いつやる事か。**`pre-issuance` はこの型に無い** —— 交付前に確かめる事は
   * `info` ではなく `warn` (アプリが観測できないとき) か `fatal` (断定できるとき)。
   */
  readonly kind: 'post-issuance' | 'at-issuance' | 'content-advisory' | 'informational';
  readonly why: string;
}

/** `level: 'info'` の指摘の全件。**両方向** —— 増えても減っても鳴る。 */
const INFO_LEDGER: readonly InfoRow[] = [
  { key: '消費税額の端数処理は一の適格請求書につき', kind: 'content-advisory',
    why: '本書式が既に区分ごと1回で処理していることの説明。利用者に作業は無い。' },
  { key: '協定を締結しただけでは時間外労働はさせら', kind: 'post-issuance',
    why: '所轄労働基準監督署長への届出と周知。協定を結んだ後の手続そのもの。' },
  { key: '紙で作成する場合は印紙税第1号の3文書と', kind: 'at-issuance',
    why: '収入印紙は紙を作る時に貼る。貼り忘れても契約自体は有効 (過怠税の問題)。' },
  { key: '仕入明細書が仕入税額控除の要件を満たすに', kind: 'post-issuance',
    why: '相手方の確認を受けるのは交付した後の手続。' },
  { key: '委託事業者は、給付の内容・代金の額・支払', kind: 'post-issuance',
    why: '発注書面の交付と 2 年間の保存。受領した後に続く義務。' },
  { key: '請負に関する注文請書は印紙税第2号文書と', kind: 'at-issuance',
    why: '同上 —— 印紙は交付する紙に貼る。文書の効力には影響しない。' },
  { key: '継続的取引の基本となる契約書は印紙税第7', kind: 'at-issuance',
    why: '同上 —— 印紙税の話で、契約の成立とは別。' },
  { key: '紙で交付する受取書は、受取金額5万円以上', kind: 'at-issuance',
    why: '同上 —— 受取書に貼る印紙。領収の効力は変わらない。' },
  { key: '役員変更は原則として就任の日から2週間以', kind: 'post-issuance',
    why: '変更登記は議事録を作った後の手続で、2 週間の期限つき。' },
  { key: '本店移転・役員変更は2週間以内の変更登記', kind: 'post-issuance',
    why: '同上 —— 登記と各官庁への届出。決議の後に続く。' },
  { key: '催告による時効の完成猶予は6か月です。そ', kind: 'post-issuance',
    why: '催告状を出した後の 6 か月に何をするか。送る前の要件ではない。' },
  { key: '督促状の送付（催告）は6か月の完成猶予に', kind: 'post-issuance',
    why: '同上 —— 送った後の選択肢 (支払督促・少額訴訟) の案内。' },
  { key: '「従事する業務の種類」が空欄です。常時3', kind: 'content-advisory',
    why: '名簿の記載事項の話。30 人未満なら記入不要で、労働者名簿は誰かへ交付する書面ではない。' },
  { key: '保存期間は5年（経過措置により当分の間3', kind: 'post-issuance',
    why: '作成した名簿をいつまで持つか。作る前の要件ではない。' },
  { key: '給与明細を綴じただけでは賃金台帳の記載事', kind: 'content-advisory',
    why: '台帳の中身が足りているかの助言。賃金台帳は備え置く帳簿で交付物ではない。' },
  { key: '労働時間の状況の把握は管理監督者・裁量労', kind: 'content-advisory',
    why: '誰を対象に記録するかの助言。特定の 1 枚の交付を止める話ではない。' },
  { key: '時季・日数・基準日の3点を労働者ごとに明', kind: 'post-issuance',
    why: '管理簿を作った後の保存 (期間中および満了後 3 年間)。' },
  { key: '借入円を年で返す場合、元金だけで年', kind: 'informational',
    why: '返済額の試算を示すだけ。やる事も直す事も無い。' },
  { key: '契約を結んだだけでは委託先の監督義務を果', kind: 'post-issuance',
    why: '委託先の選定・定期確認・再委託の記録。契約した後に続く義務。' },
  { key: '公表しただけでは足りません。記載した利用', kind: 'post-issuance',
    why: '年 1 回の突き合わせ。公表した後の運用。' },
  { key: '常時10人以上の労働者を使用する事業場で', kind: 'post-issuance',
    why: '意見書を添えた届出と周知。規程を作った後の手続。' },
  { key: '規程の制定だけでは措置義務を果たしたこと', kind: 'post-issuance',
    why: '相談窓口の周知・手順の共有・記録の整備。制定した後に続く。' },
];

function infoMessages(): readonly string[] {
  const out: string[] = [];
  for (const body of infoObjects(SRC)) {
    const m = /message:\s*([`'])([\s\S]*?)\1/.exec(body);
    // 補間 (`${…}`) は落とす —— 値によって変わるので鍵にできない。
    if (m) out.push(m[2]!.replace(/\$\{[^}]*\}/g, ''));
  }
  return out;
}

describe('info の段階 — 母集団 (原文の走査)', () => {
  it('★ `level: info` の指摘はすべて台帳に在る (両方向)', () => {
    const found = infoMessages().map(keyOf);
    const declared = INFO_LEDGER.map((r) => r.key);
    expect([...found].sort(), '走査 vs 台帳').toEqual([...declared].sort());
    expect(found.length, '走査が空虚でない (床)').toBeGreaterThanOrEqual(15);
  });

  it('★ どの行も理由を持つ (省略形は認めない)', () => {
    for (const r of INFO_LEDGER) {
      expect(r.why.length, `${r.key}: 理由`).toBeGreaterThanOrEqual(15);
      expect(r.why, `${r.key}: 「同上」だけでは次に読む人が確かめ直すことになる`)
        .not.toMatch(/^同上[。）)]?$/);
    }
    // 針が的に当たる標本 —— 禁じたい文面は実際にこの針へ当たる。
    expect('同上。').toMatch(/^同上[。）)]?$/);
    expect(INFO_LEDGER[5]!.why, '「同上 —— …」と続けるのは可').not.toMatch(/^同上[。）)]?$/);
  });

  it('★ 鍵は重複しない (同じ鍵が 2 行を隠さない)', () => {
    expect(new Set(INFO_LEDGER.map((r) => r.key)).size).toBe(INFO_LEDGER.length);
  });
});

/** パネルの見出しと同じ式 (`CheckPanel` の `clean`)。 */
const cleanHeadline = (issues: readonly { readonly level: IssueLevel }[]): boolean => {
  const c = countByLevel(issues);
  return c.fatal === 0 && c.warn === 0;
};

/** 書面を法に適う形で埋める (数値欄は数・既定値が在ればそれ)。 */
function fill(id: string, over: Record<string, string> = {}): Record<string, string> {
  const d = STUDIO_TEMPLATES.find((x) => x.id === id);
  if (!d) throw new Error(`書式が無い: ${id}`);
  const v: Record<string, string> = {};
  for (const f of d.fields) v[f.k] = f.def ?? (f.num ? '1' : 'x');
  return { ...v, ...over };
}

describe('info の段階 — 振る舞い', () => {
  const LEGAL_NOTICE = {
    noticeDate: '2026-01-01',
    dismissDate: '2026-03-01', // 60 日前 = 労基法20条を満たす
    reason: '就業規則第40条第1項第3号に基づく',
    teate: '支給しない',
  };

  it('★ 労基法19条 の指摘が出ている間、パネルは「無効リスクは見つかりませんでした」と言わない', () => {
    const d = STUDIO_TEMPLATES.find((x) => x.id === 'kaiko-yokoku')!;
    const issues = checkDoc(d, fill('kaiko-yokoku', LEGAL_NOTICE));
    const art19 = issues.find((i) => i.basis === '労働基準法19条');
    expect(art19, '19条 の指摘が出ている').toBeDefined();
    // 直す前はここが true で、画面は「無効リスクは見つかりませんでした」と出していた。
    expect(cleanHeadline(issues), 'パネルの見出しが clean になっていない').toBe(false);
  });

  it('★ 19条 は `info` ではない —— 交付後にやる事ではないから', () => {
    const d = STUDIO_TEMPLATES.find((x) => x.id === 'kaiko-yokoku')!;
    const art19 = checkDoc(d, fill('kaiko-yokoku', LEGAL_NOTICE)).find((i) => i.basis === '労働基準法19条');
    expect(art19!.level).not.toBe('info');
    // 文自身が「確かめてくれ」と言っている —— それは `warn` (要確認) の仕事である。
    expect(art19!.message).toContain('確認してください');
  });

  it('★ 同じ形の 2 件は同じ段階 (アプリが観測できない前提条件)', () => {
    const level = (id: string, basis: string): IssueLevel | undefined => {
      const d = STUDIO_TEMPLATES.find((x) => x.id === id)!;
      return checkDoc(d, fill(id, { requested: 'はい', ...LEGAL_NOTICE })).find((i) => i.basis === basis)?.level;
    };
    const a = level('kaiko-yokoku', '労働基準法19条');
    const b = level('taishoku-shomei', '労働基準法22条3項');
    expect(a, '19条').toBeDefined();
    expect(b, '22条3項').toBeDefined();
    expect(a, '重い方 (無効・懲役刑あり) が低い段階に居てはならない').toBe(b);
  });

  it('★ 法に適う解雇予告通知書に `fatal` は出ない (19条 を fatal へ倒していない)', () => {
    // アプリは休業期間中かを観測できないので、断定してはいけない。
    const d = STUDIO_TEMPLATES.find((x) => x.id === 'kaiko-yokoku')!;
    expect(countByLevel(checkDoc(d, fill('kaiko-yokoku', LEGAL_NOTICE))).fatal).toBe(0);
  });
});
