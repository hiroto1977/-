import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// 知識グラフのコアは非バンドルの CJS（orchestration/）— renderer から import しない
// 設計のため、テストだけが createRequire で読み込む。
const req = createRequire(import.meta.url);
const kg = req('../../../orchestration/knowledge-graph.cjs');
const edu = req('../../../orchestration/education.cjs');

interface Entry {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  collection: string;
  summary: string;
  meta: { label: string; value: string }[];
  sources: { url: string; type: string; label: string }[];
}

function entry(partial: Partial<Entry> & { id: string; title: string }): Entry {
  return {
    category: 'economics',
    categoryLabel: '経済学',
    collection: 'academic',
    summary: '',
    meta: [],
    sources: [],
    ...partial,
  } as Entry;
}

/** 合成コーパス: 各エッジ型が 1 つ以上成立するよう設計。 */
const CORPUS: Entry[] = [
  entry({
    id: 'a-monetary-rule',
    title: 'テイラールール（金融政策の金利ルール）',
    summary:
      'テイラールールは、中央銀行の政策金利をインフレ率ギャップと産出量ギャップの線形関数として定める金融政策の金利ルールである。インフレ率が目標を上回れば名目金利をより大きく引き上げるべきだとするテイラー原理を含意し、各国中央銀行の政策反応関数の実証分析の基準となった。',
    meta: [{ label: '提唱者・初出', value: 'ジョン・ブライアン・テイラー（1993 Carnegie-Rochester）' }],
    sources: [{ url: 'https://rare-host-alpha.example.org/taylor', type: 'academic', label: 'x' }],
  }),
  entry({
    id: 'b-monetary-principle',
    title: 'テイラー原理（インフレ安定化の金利反応条件）',
    summary:
      'テイラー原理は、インフレ率の上昇に対して中央銀行が名目金利を 1 対 1 を超えて引き上げるべきだという金融政策の安定化条件である。テイラールールの係数条件として定式化され、金利ルールがインフレ期待を安定化させるための必要条件を与える。',
    meta: [{ label: '提唱者・初出', value: 'ジョン・ブライアン・テイラー（1999）' }],
    sources: [{ url: 'https://rare-host-alpha.example.org/principle', type: 'academic', label: 'x' }],
  }),
  entry({
    id: 'c-fiscal-multiplier',
    title: '財政乗数（政府支出乗数）',
    summary:
      '財政乗数は、政府支出の 1 単位の増加が国民所得を何単位増やすかを表す係数である。限界消費性向が高いほど乗数は大きくなり、金融政策の反応や開放度によって実効値は変化する。',
    meta: [{ label: '提唱者・初出', value: 'ケインズ, ジョン・メイナード（1936）' }],
    sources: [{ url: 'https://macro-books.example.net/multiplier', type: 'reference', label: 'x' }],
  }),
  entry({
    id: 'd-mgmt-taylorism',
    title: '科学的管理法（テイラー・システム）',
    category: 'management',
    categoryLabel: '経営学',
    summary:
      '科学的管理法は、作業の時間研究と動作研究により標準作業量を科学的に定め、差別出来高給で動機づける管理手法である。工場管理の近代化を導いた一方、人間性軽視への批判から人間関係論が生まれた。',
    meta: [{ label: '提唱者・初出', value: 'フレデリック・ウィンズロー・テイラー（1911）' }],
    sources: [{ url: 'https://mgmt-classics.example.com/taylorism', type: 'academic', label: 'x' }],
  }),
  entry({
    id: 'e-econ-rational',
    title: '合理的期待形成仮説',
    summary:
      '合理的期待形成仮説は、経済主体が利用可能な全ての情報を用いて体系的な誤りなく将来を予想するという仮定である。金融政策の予見された変更は実体効果を持たないという政策無効命題を導き、マクロ経済学の方法論を転換させた。',
    meta: [{ label: '提唱者・初出', value: 'ルーカス, ロバート（1972）／サージェント, トーマス' }],
    sources: [{ url: 'https://macro-books.example.net/rational', type: 'reference', label: 'x' }],
  }),
  entry({
    id: 'f-legal-invoice',
    title: 'インボイス制度（適格請求書等保存方式）',
    category: 'tax',
    categoryLabel: '税務',
    collection: 'compliance',
    summary:
      'インボイス制度は、消費税の仕入税額控除の適用に適格請求書の保存を求める方式である。登録事業者のみが適格請求書を交付でき、免税事業者からの仕入は経過措置を除き控除できない。',
    meta: [{ label: '所管・根拠', value: '国税庁（消費税法）' }],
    sources: [{ url: 'https://rare-host-beta.example.org/invoice', type: 'government', label: 'x' }],
  }),
  entry({
    id: 'g-econ-vat',
    title: '付加価値税の理論（消費型 VAT とインボイス方式）',
    summary:
      '付加価値税は各取引段階の付加価値に課税する多段階課税であり、インボイス方式は前段階税額控除を適格請求書で担保する徴税技術である。消費税の帰着と逆進性の議論は税制設計の中心論点である。',
    meta: [{ label: '提唱者・初出', value: 'シャウプ, カール（1949 勧告）' }],
    sources: [{ url: 'https://rare-host-beta.example.org/vat', type: 'academic', label: 'x' }],
  }),
  entry({
    id: 'h-econ-menucost',
    title: 'メニューコスト理論',
    summary:
      'メニューコスト理論は、価格改定に伴う小さな固定費用が名目価格の硬直性を生み、貨幣の非中立性をもたらすことを示すニューケインジアンの価格硬直性理論である。',
    meta: [{ label: '提唱者・初出', value: 'マンキュー, グレゴリー（1985）' }],
    sources: [{ url: 'https://macro-books.example.net/menucost', type: 'reference', label: 'x' }],
  }),
];

describe('computeGraph — 合成コーパス', () => {
  // 極小コーパスでは上位 IDF 署名が「各エントリ固有の最希少語」に偏るため、
  // topTerms を広げて全内容語を署名に含める（本番既定 24 は 4,200+ 文書での値）。
  const OPTS = { topTerms: 200 };
  const g = kg.computeGraph(CORPUS, OPTS);

  it('決定論: 2 回の計算が JSON レベルで一致する', () => {
    expect(JSON.stringify(kg.computeGraph(CORPUS, OPTS))).toBe(JSON.stringify(g));
  });

  it('ノードは id 昇順で全件・degree はエッジと整合', () => {
    expect(g.nodes.map((n: { id: string }) => n.id)).toEqual([...CORPUS.map((e) => e.id)].sort());
    const deg = new Map<string, number>();
    for (const e of g.edges) {
      deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
      deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
    }
    for (const n of g.nodes) expect(n.degree).toBe(deg.get(n.id) ?? 0);
  });

  it('エッジは正準 a<b・自己ループなし・整数スコア 1..10000・既知型のみ', () => {
    expect(g.edges.length).toBeGreaterThan(0);
    for (const e of g.edges) {
      expect(e.a < e.b).toBe(true);
      expect(Number.isInteger(e.score)).toBe(true);
      expect(e.score).toBeGreaterThanOrEqual(1);
      expect(e.score).toBeLessThanOrEqual(10000);
      expect(Object.keys(kg.TYPE_PRIORITY)).toContain(e.type);
    }
  });

  it('term-overlap: テイラールール↔テイラー原理（強い語彙共有）が結ばれる', () => {
    const e = g.edges.find(
      (x: { a: string; b: string }) => x.a === 'a-monetary-rule' && x.b === 'b-monetary-principle',
    );
    expect(e).toBeTruthy();
    expect(['term-overlap', 'shares-thinker']).toContain(e.type); // 語彙・著者の両シグナルが成立
    const overlap = g.edges.filter(
      (x: { a: string; b: string; type: string }) =>
        x.a === 'a-monetary-rule' && x.b === 'b-monetary-principle' && x.type === 'term-overlap',
    );
    expect(overlap.length).toBe(1);
  });

  it('shares-thinker: 同一人物（ジョン・B・テイラー）のルール↔原理はつながる', () => {
    const e = g.edges.find(
      (x: { a: string; b: string; type: string }) =>
        x.a === 'a-monetary-rule' && x.b === 'b-monetary-principle' && x.type === 'shares-thinker',
    );
    expect(e).toBeTruthy();
  });

  it('shares-thinker: 同姓別人（金融政策のテイラー vs 科学的管理法のテイラー）は結ばれない', () => {
    // 複合キー（姓+名イニシャル）による同姓別人の分離 — 実データで発見した偽相関の回帰テスト。
    const e = g.edges.find(
      (x: { a: string; b: string; type: string }) =>
        ((x.a === 'a-monetary-rule' && x.b === 'd-mgmt-taylorism') ||
          (x.a === 'b-monetary-principle' && x.b === 'd-mgmt-taylorism')) &&
        x.type === 'shares-thinker',
    );
    expect(e).toBeUndefined();
  });

  it('discipline-bridge: コレクション横断（compliance インボイス↔academic VAT）が架かる', () => {
    const e = g.edges.find(
      (x: { a: string; b: string }) => x.a === 'f-legal-invoice' && x.b === 'g-econ-vat',
    );
    expect(e).toBeTruthy();
    expect(['discipline-bridge', 'shares-source', 'term-overlap']).toContain(e.type);
  });

  it('shares-source: 希少ホスト共有（rare-host-beta）がエッジになる', () => {
    const e = g.edges.find(
      (x: { a: string; b: string; type: string }) =>
        x.a === 'f-legal-invoice' && x.b === 'g-econ-vat' && x.type === 'shares-source',
    );
    expect(e).toBeTruthy();
  });

  it('same-category: 各カテゴリのノードが孤立しない（economics 全ノードに次数 ≥ 1）', () => {
    const eco = g.nodes.filter((n: { category: string }) => n.category === 'economics');
    for (const n of eco) expect(n.degree).toBeGreaterThan(0);
  });
});

describe('extractAuthorSurnames — 人物キーの正規化（姓+名イニシャル複合）', () => {
  it('同一表記の氏名は同じキーになる（中黒氏名）', () => {
    const a = kg.extractAuthorSurnames('ジョン・メイナード・ケインズ（1936）');
    const b = kg.extractAuthorSurnames('ジョン・メイナード・ケインズ');
    expect(a.size).toBe(1);
    expect([...a]).toEqual([...b]);
    const key = [...a][0];
    expect(key).toContain('ケインズ');
    expect(key).not.toContain('メイナード');
  });
  it('同姓別人は異なるキーになる（テイラー分離の回帰テスト）', () => {
    const shelley = [...kg.extractAuthorSurnames('シェリー・テイラー（2000）')][0];
    const frederick = [...kg.extractAuthorSurnames('フレデリック・ウィンズロー・テイラー（1911）')][0];
    const john = [...kg.extractAuthorSurnames('ジョン・ブライアン・テイラー（1993）')][0];
    expect(new Set([shelley, frederick, john]).size).toBe(3);
  });
  it('ラテン "Surname, First" とカタカナ "姓, 名" の両形式を解釈する', () => {
    const s = kg.extractAuthorSurnames('Kahan, Dan M. （2012）／Slovic, Paul／ルーカス, ロバート（1972）');
    const keys = [...s];
    expect(keys.some((k) => k.startsWith('kahan|d'))).toBe(true);
    expect(keys.some((k) => k.startsWith('slovic|p'))).toBe(true);
    expect(keys.some((k) => k.startsWith('ルーカス|ロ'))).toBe(true);
  });
  it('散文調の一般語（ルール等）や機関語は人名にしない', () => {
    expect(kg.extractAuthorSurnames('政策金利をインフレ率に反応させるルール').size).toBe(0);
    expect(kg.extractAuthorSurnames('ノーベル賞／Harvard University Press').size).toBe(0);
  });
  it('裸のカタカナ 1 トークンは「（西暦」が続くときだけ人名と認める', () => {
    expect(kg.extractAuthorSurnames('クルーガー（1974）').size).toBe(1);
    expect(kg.extractAuthorSurnames('労働契約の民事的ルールを定める法').size).toBe(0);
  });
});

describe('education — 幻覚ゼロの学習素材', () => {
  const cards = edu.buildFlashcards(CORPUS);
  const quiz = edu.buildQuiz(CORPUS);

  it('フラッシュカードは 1 概念 1 枚・表裏とも既存フィールド由来', () => {
    expect(cards.length).toBe(CORPUS.length);
    for (const c of cards) {
      const src = CORPUS.find((e) => e.id === c.ref)!;
      expect(c.front).toBe(src.title);
      expect(src.summary.startsWith(c.back.replace(/…$/, '').slice(0, 20))).toBe(true);
    }
  });

  it('クイズの選択肢は 4 件ユニーク・全て実在タイトル・正答 index 整合', () => {
    expect(quiz.length).toBeGreaterThan(0);
    const titles = new Set(CORPUS.map((e) => e.title));
    for (const q of quiz) {
      expect(q.options.length).toBe(4);
      expect(new Set(q.options).size).toBe(4);
      for (const o of q.options) expect(titles.has(o)).toBe(true);
      const src = CORPUS.find((e) => e.id === q.ref)!;
      expect(q.options[q.answer]).toBe(src.title);
    }
  });

  it('決定論: flashcards / quiz とも 2 回生成で一致', () => {
    expect(JSON.stringify(edu.buildFlashcards(CORPUS))).toBe(JSON.stringify(cards));
    expect(JSON.stringify(edu.buildQuiz(CORPUS))).toBe(JSON.stringify(quiz));
  });

  it('leadSentences: 文境界で切り、上限内・句点区切りの接頭辞を返す', () => {
    const out = edu.leadSentences('一文目。二文目。三文目。', 12);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.endsWith('。')).toBe(true);
    expect('一文目。二文目。三文目。'.startsWith(out)).toBe(true);
    expect(edu.leadSentences('短い。', 100)).toBe('短い。');
  });

  it('leadSentences: 句点のない長文は上限で切って省略記号を付す', () => {
    const out = edu.leadSentences('あ'.repeat(50), 12);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.endsWith('…')).toBe(true);
  });
});
