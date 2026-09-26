/**
 * **ベスト3 の値を留める** (2026-09-26 · パス 482)。
 *
 * `bestAnswers.test.ts` は「働くか」を見る。こちらは**正確な値**を見る —— 変異検査の初回
 * (52.55%) の生存を読み直すと、検査が「在る」「大きい」「含む」しか主張しておらず、
 * 点の数・注記の文面・進み具合の順序・チャットへ渡す文面を壊しても通る形だった。
 * 採点は利用者に「なぜこの順位か」として見せる物なので、**数と文面そのものが仕様**である。
 *
 * ## 読み直し (`fresh`)
 *
 * lens と観点の台帳・軸の上限と名前・構造と断定の正規表現・相談の語・メダルは
 * **モジュール直下の値**で、変異検査はそれを書き換えてから検査を走らせても、先に読み込んだ
 * モジュールには届かない (`stryker.config.json` の `_commentIgnoreStatic`)。どの検査も
 * `vi.resetModules()` + 動的 import で読み直してから主張する (`callbackPaste.test.ts`・
 * パス 353 / 355 と同じ形。読み直しは 1 回 50 ms ほど —— 変換済みのコードを評価し直すだけ)。
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  AnswerScore,
  AnswerStrategy,
  AxisScore,
  BestAnswersProgress,
  BestAnswersResult,
  OntologyReading,
  ScoredCandidate,
  SendChat,
} from '../bestAnswers';
import { composeSystemPrompt, retrieveContext, type KnowledgeDoc } from '../assistantContext';
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../../shared/redact';

async function fresh() {
  vi.resetModules();
  return (await import('../bestAnswers')) as typeof import('../bestAnswers');
}

const doc = (id: string, title: string): KnowledgeDoc => ({ id, kind: 'コンプライアンス', title, body: '…' });
const INVOICE = doc('a', 'インボイス制度（適格請求書等保存方式）');
const SIMPLIFIED = doc('b', '消費税の簡易課税制度');
const IT_SUBSIDY = doc('c', 'IT導入補助金');
const DOCS: readonly KnowledgeDoc[] = [INVOICE, SIMPLIFIED, IT_SUBSIDY];
const NO_HITS: OntologyReading = { hits: [] };

/** 軸を 1 つ取り出す。 */
function axisOf(score: AnswerScore, id: AxisScore['axis']): AxisScore {
  const a = score.axes.find((x) => x.axis === id);
  if (a === undefined) throw new Error(`軸 ${id} が無い`);
  return a;
}

// ---------------------------------------------------------------------------
// 台帳
// ---------------------------------------------------------------------------

describe('台帳の値 (読み直して綴りごと留める)', () => {
  it('★ 7 つの lens は id・印・名前・働きを持ち、まとめ役は示す件数を名乗る', async () => {
    const m = await fresh();
    expect(m.BEST_ANSWERS_COUNT).toBe(3);
    expect(m.ENGINEERING_LENSES).toEqual([
      { id: 'ontology', icon: '🧭', label: 'オントロジー', does: '質問を士業の業務地図に当て、関係しうる専門家と独占業務かどうかを特定する' },
      { id: 'context', icon: '📚', label: 'コンテキスト', does: '確証済みナレッジ (出典つき) から根拠を検索して注入する' },
      { id: 'skill', icon: '🧰', label: 'スキル', does: 'このアプリで実際に操作できる画面を添える' },
      { id: 'prompt', icon: '✍️', label: 'プロンプト', does: '役割・制約・出力形式を観点ごとに組み立てる' },
      { id: 'subagent', icon: '🤖', label: 'サブエージェント', does: '観点の違う回答者を独立に並列で走らせ、設定済みの AI へ割り振る' },
      { id: 'harness', icon: '🧪', label: 'ハーネス', does: '各回答を根拠・網羅・形・安全・合意で採点する (決定論)' },
      { id: 'conductor', icon: '🎼', label: 'オーケストレーション', does: '採点を集計し、近い重複を畳んで上位 3 件を理由つきで選ぶ' },
    ]);
  });

  it('★ 観点 5 つ (指示の文面ごと)・送る上限は観点の数・同時は 3 つ', async () => {
    const m = await fresh();
    expect(m.ANSWER_STRATEGIES).toEqual([
      { id: 'expert', icon: '🎯', label: '結論先行の専門家', instruction: '1 行目に結論を書く。続けて根拠を 3 つ以内、最後に「次の一手」を 1〜3 個挙げる。' },
      { id: 'procedure', icon: '📋', label: '手順・チェックリスト', instruction: '実行する順に番号付きの手順で書く。期限・必要な書類・窓口があれば表にまとめる。' },
      { id: 'risk', icon: '⚠️', label: 'リスクと反証', instruction: 'よくある誤解・例外・落とし穴を先に挙げ、どこで専門家や一次情報に確認すべきかを明示する。' },
      {
        id: 'grounded',
        icon: '📚',
        label: '根拠厳格',
        instruction: '参考ナレッジに書かれていることだけで答える。書かれていない部分は「確証のある情報が見つかりません」と明示し、推測で補わない。',
      },
      { id: 'plain', icon: '🔰', label: 'やさしい説明', instruction: '専門用語をできるだけ使わず、初めての人にも分かる言葉で説明する。身近な例えを 1 つ入れる。' },
    ]);
    expect(m.MAX_BEST_ANSWER_CALLS).toBe(5);
    expect(m.BEST_ANSWERS_CONCURRENCY).toBe(3);
  });

  it('★ 採点の軸は 5 つで、上限 30/25/15/15/15・名前・減点・重複の線', async () => {
    const m = await fresh();
    expect(m.AXIS_MAX).toEqual({ grounding: 30, coverage: 25, structure: 15, safety: 15, consensus: 15 });
    expect(m.FABRICATED_CITATION_PENALTY).toBe(10);
    expect(m.DUPLICATE_AT).toBe(0.8);
    expect(m.QUESTION_ECHO_CHARS).toBe(40);
    const s = m.scoreAnswer('はい。', { question: 'ですか', docs: [], ontology: NO_HITS, peers: [] });
    expect(s.axes.map((x) => [x.axis, x.label, x.max])).toEqual([
      ['grounding', '根拠', 30],
      ['coverage', '網羅', 25],
      ['structure', '形', 15],
      ['safety', '安全', 15],
      ['consensus', '合意', 15],
    ]);
  });
});

// ---------------------------------------------------------------------------
// オントロジー
// ---------------------------------------------------------------------------

describe('オントロジー: 業務地図への当て方 (実物の地図で値を留める)', () => {
  it('★ 1 つの業務に内容語がちょうど 2 つ当たれば拾う (1 つは拾わない)', async () => {
    const m = await fresh();
    // 「商標」「出願」は「サービス名・ロゴの商標出願」に両方当たり、「発明・ノウハウの記録管理」には
    // 「出願」だけが当たる —— 後者は拾わない。
    expect(m.readOntology('商標 出願')).toEqual({
      hits: [
        {
          id: 'patent-attorney',
          label: '弁理士',
          score: 2,
          duties: [{ title: 'サービス名・ロゴの商標出願', scope: 'exclusive' }],
          exclusive: true,
        },
      ],
    });
  });

  it('★ ひらがなだけの 2 字 (膠着語) は内容語に数えない', async () => {
    const m = await fresh();
    // 「なの」「ので」は同じ業務の本文に在るが重み 0.2 —— 内容語は「商標」の 1 つだけ。
    expect(m.readOntology('商標 なので')).toEqual({ hits: [] });
  });

  it('★ 士業の名前そのものは 3 点を足す / 同点の業務は台帳の順 / 独占業務の有無は当たった業務で決まる', async () => {
    const m = await fresh();
    expect(m.readOntology('弁理士に相談')).toEqual({
      hits: [
        {
          id: 'patent-attorney',
          label: '弁理士',
          score: 6,
          duties: [
            { title: 'EC 出店ブランドの保護', scope: 'advisory' },
            { title: '動画・デザインの著作権契約', scope: 'advisory' },
          ],
          exclusive: false,
        },
        {
          id: 'tax-accountant',
          label: '税理士',
          score: 2,
          duties: [
            { title: '適格請求書 (インボイス) 対応', scope: 'exclusive' },
            { title: 'クラウド会計の記帳・月次決算', scope: 'advisory' },
          ],
          exclusive: true,
        },
      ],
    });
  });

  it('★ 業務は点の高い順に 3 件まで・士業も点の高い順に 3 件まで (同点は台帳の順)', async () => {
    const m = await fresh();
    const r = m.readOntology('独占 申告 税務 代理 税理士 相談 経過措置 判断');
    expect(r).toEqual({
      hits: [
        {
          id: 'tax-accountant',
          label: '税理士',
          score: 12,
          duties: [
            { title: '適格請求書 (インボイス) 対応', scope: 'exclusive' },
            { title: '申告代理・納税スケジュール', scope: 'exclusive' },
            { title: '税務調査の立会い・不服申立て', scope: 'exclusive' },
          ],
          exclusive: true,
        },
        {
          // 台帳の順は 商標出願 → EC 保護 → 著作権契約。当たった点 (2 / 3 / 4) の高い順に並べ直す。
          id: 'patent-attorney',
          label: '弁理士',
          score: 4,
          duties: [
            { title: '動画・デザインの著作権契約', scope: 'advisory' },
            { title: 'EC 出店ブランドの保護', scope: 'advisory' },
            { title: 'サービス名・ロゴの商標出願', scope: 'exclusive' },
          ],
          exclusive: true,
        },
        // 2 点は 公認会計士・弁護士・司法書士 の 3 つ —— 台帳の順で公認会計士だけが残る。
        { id: 'cpa', label: '公認会計士', score: 2, duties: [{ title: '定款の機関設計 (会計監査人)', scope: 'advisory' }], exclusive: false },
      ],
    });
  });

  it('★ 名前だけの質問でも業務は 3 件まで (4 件当たっても)', async () => {
    const m = await fresh();
    const tax = m.readOntology('税理士').hits[0]!;
    expect(tax).toEqual({
      id: 'tax-accountant',
      label: '税理士',
      score: 5,
      duties: [
        { title: '適格請求書 (インボイス) 対応', scope: 'exclusive' },
        { title: '申告代理・納税スケジュール', scope: 'exclusive' },
        { title: '税務調査の立会い・不服申立て', scope: 'exclusive' },
      ],
      exclusive: true,
    });
  });

  it('★ 英字は大小を問わずに当てる (業務地図の「IPO」と質問の「ipo」)', async () => {
    const m = await fresh();
    const cpa = [{ id: 'cpa', label: '公認会計士', score: 2, duties: [{ title: '監査証明業務 (法定・任意)', scope: 'exclusive' }], exclusive: true }];
    expect(m.readOntology('IPO の準備').hits).toEqual(cpa);
    expect(m.readOntology('ipo の準備').hits).toEqual(cpa);
  });

  it('★ 回答者へ渡す節: 独占業務に印・業務が無い士業は名前だけ・読みが空なら空文字', async () => {
    const m = await fresh();
    expect(m.formatOntologySection(NO_HITS)).toBe('');
    expect(
      m.formatOntologySection({
        hits: [
          {
            id: 'tax-accountant',
            label: '税理士',
            score: 5,
            duties: [
              { title: '申告代理', scope: 'exclusive' },
              { title: '記帳', scope: 'advisory' },
            ],
            exclusive: true,
          },
          { id: 'patent-attorney', label: '弁理士', score: 3, duties: [], exclusive: false },
        ],
      }),
    ).toBe(
      [
        '',
        '## この質問に関係しうる専門家（士業の業務地図より）',
        '- 税理士: 申告代理（独占業務） / 記帳',
        '- 弁理士',
        '独占業務に触れる内容では、その専門家への相談を回答の中で明示すること。',
      ].join('\n'),
    );
  });
});

// ---------------------------------------------------------------------------
// プロンプトと割り振り
// ---------------------------------------------------------------------------

describe('プロンプトの組み立てと割り振り', () => {
  it('★ 観点の節は文面ごと (役割の名前と指示を 1 文に)', async () => {
    const m = await fresh();
    const risk = m.ANSWER_STRATEGIES.find((s) => s.id === 'risk')!;
    expect(m.formatStrategySection(risk)).toBe(
      [
        '',
        '## 回答の観点（この回答者の役割）',
        'あなたは複数の回答者のうち「リスクと反証」を担当します。よくある誤解・例外・落とし穴を先に挙げ、どこで専門家や一次情報に確認すべきかを明示する。',
        '同じ質問に別の観点の回答者も答えています。自分の観点に徹してください。',
      ].join('\n'),
    );
  });

  it('★ system は「基本方針 → 観点 → 業務地図 → ナレッジ」の順で、組み立て方はチャットと同じ 1 つ', async () => {
    const m = await fresh();
    const s = m.ANSWER_STRATEGIES[0]!;
    const ctx = retrieveContext('インボイス制度', []);
    const onto = m.readOntology('商標 出願');
    const system = m.buildStrategySystem(s, ctx, onto);
    expect(system).toBe(composeSystemPrompt(ctx, [m.formatStrategySection(s), m.formatOntologySection(onto)]));
    const at = (needle: string) => system.indexOf(needle);
    expect(at('「結論先行の専門家」を担当')).toBeGreaterThan(0);
    expect(at('## この質問に関係しうる専門家')).toBeGreaterThan(at('「結論先行の専門家」を担当'));
  });

  it('★ 観点が 5 つを超えて渡されても送るのは 5 回まで (先頭の 5 つ)', async () => {
    const m = await fresh();
    const extra: AnswerStrategy = { id: 'extra', icon: '➕', label: '6 つ目', instruction: '余分な観点。' };
    const plan = m.planCalls(['x'], [...m.ANSWER_STRATEGIES, extra]);
    expect(plan.map((c) => c.strategy.id)).toEqual(['expert', 'procedure', 'risk', 'grounded', 'plain']);
    expect(plan.map((c) => c.provider)).toEqual(['x', 'x', 'x', 'x', 'x']);
  });
});

// ---------------------------------------------------------------------------
// 根拠: 触れた項目と捏造した参照
// ---------------------------------------------------------------------------

describe('根拠: 注入した項目に触れたか・参照を捏造したか', () => {
  it('★ 項目名の核 (括弧の前) に触れれば数える / 空白や改行を挟んでも同じ', async () => {
    const m = await fresh();
    expect(m.citedDocs('インボイス制度だけに触れた', DOCS)).toEqual([INVOICE]);
    expect(m.citedDocs('インボイス 制度 と\nit導入補助金', DOCS)).toEqual([INVOICE, IT_SUBSIDY]);
  });

  it('★ 核を切る印は 4 つ (全角・半角の括弧とコロン)', async () => {
    const m = await fresh();
    for (const mark of ['（', '(', '：', ':']) {
      const d = doc('k', `インボイス制度${mark}補足`);
      expect(m.citedDocs('インボイス制度だけ', [d]), mark).toEqual([d]);
    }
  });

  it('★ 括弧の無い名前は全体が核 (1 字足りなければ数えない)', async () => {
    const m = await fresh();
    expect(m.citedDocs('IT導入補助について', [IT_SUBSIDY])).toEqual([]);
    expect(m.citedDocs('IT導入補助金について', [IT_SUBSIDY])).toEqual([IT_SUBSIDY]);
  });

  it('★ 括弧で始まる名前は全体が核 / 核は 2 字以上 (ちょうど 2 字は数え、1 字は数えない)', async () => {
    const m = await fresh();
    const bracketFirst = doc('x', '（仮）新制度');
    expect(m.citedDocs('（仮）新制度の話', [bracketFirst])).toEqual([bracketFirst]);
    const two = doc('y', 'ab（注）');
    expect(m.citedDocs('xxabyy', [two])).toEqual([two]);
    const one = doc('z', 'x（注）');
    expect(m.citedDocs('xyz', [one])).toEqual([]);
  });

  it('★ 「参照:」の行の読み方: 行頭・字下げ・箇条書き・全角コロン・コロン前の空白・CRLF', async () => {
    const m = await fresh();
    const cases: readonly [string, string[]][] = [
      ['参照: 架空', ['架空']],
      ['参照: x', []],
      ['  参照: 架空の法', ['架空の法']],
      ['- 参照: 架空の法', ['架空の法']],
      ['* 参照: 架空の法', ['架空の法']],
      ['・参照: 架空の法', ['架空の法']],
      ['-参照: 架空の法', ['架空の法']],
      ['参照 : 架空の法', ['架空の法']],
      ['参照：架空の法', ['架空の法']],
      ['なお参照: 架空の法', []],
      ['本文\r\n参照: 架空の法\r\n', ['架空の法']],
      ['参照: 架空1\n本文\n参照: 架空2', ['架空1', '架空2']],
    ];
    for (const [answer, want] of cases) expect(m.fabricatedCitations(answer, DOCS), JSON.stringify(answer)).toEqual(want);
  });

  it('★ 区切り 5 種・括弧 (全角/半角・2 つ)・かぎ括弧 4 種を剥がしてから比べる', async () => {
    const m = await fresh();
    for (const sep of ['、', ',', '，', ';', '；']) {
      expect(m.fabricatedCitations(`参照: インボイス制度${sep}架空の法`, DOCS), sep).toEqual(['架空の法']);
    }
    expect(m.fabricatedCitations('参照: 架空の法(メモ)、別の法（注）（補足）', DOCS)).toEqual(['架空の法', '別の法']);
    expect(m.fabricatedCitations('参照: 「架空A」、『架空B』、〈架空C〉、【架空D】', DOCS)).toEqual(['架空A', '架空B', '架空C', '架空D']);
  });

  it('★ 注入した項目と見なす 3 つの道は、それぞれ単独で効く', async () => {
    const m = await fresh();
    // ① 名前の近さ (バイグラム Jaccard がちょうど 0.5) —— 包含でも核でもない。
    const near = doc('n', 'abxbc');
    expect(m.contentSimilarity('abc', 'abxbc')).toBe(0.5);
    expect(m.fabricatedCitations('参照: abc', [near])).toEqual([]);
    expect(m.fabricatedCitations('参照: abd', [near])).toEqual(['abd']);
    // ② 項目名が注入した名前の一部 —— 近さは 0.25・核を含まない。
    expect(m.fabricatedCitations('参照: 適格請求書', [INVOICE])).toEqual([]);
    // ③ 項目名が核を含む —— 近さは 0.25 未満・包含でもない。
    expect(m.fabricatedCitations('参照: インボイス制度の経過措置と特例のまとめ', [INVOICE])).toEqual([]);
    // 核は 2 字以上 (ちょうど 2 字は効き、1 字は効かない)。
    expect(m.fabricatedCitations('参照: xyz123', [doc('p', 'xy（注）')])).toEqual([]);
    expect(m.fabricatedCitations('参照: xyz', [doc('q', 'x（注）')])).toEqual(['xyz']);
  });

  it('★ 近さは 0 から 1 の Jaccard (空は 0・大小と記号は落とす)', async () => {
    const m = await fresh();
    expect(m.contentSimilarity('abcd', 'bcde')).toBe(0.5);
    expect(m.contentSimilarity('AB-CD', 'abcd')).toBe(1);
    expect(m.contentSimilarity('', '')).toBe(0);
    expect(m.contentSimilarity('ab', '')).toBe(0);
    expect(m.contentSimilarity('abcdef', 'abcde')).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// ハーネス: 軸ごとの点と注記
// ---------------------------------------------------------------------------

describe('ハーネス: 軸ごとの点と注記 (文面ごと)', () => {
  it('★ 何も無い質問への短い答えは 56 点 (中立 3 軸 + 形 5 + 安全 15)', async () => {
    const m = await fresh();
    const s = m.scoreAnswer('はい。', { question: 'ですか', docs: [], ontology: NO_HITS, peers: [] });
    expect(s.axes.map((x) => [x.points, x.note])).toEqual([
      [15, '参考ナレッジに該当が無い質問なので中立'],
      [13, '質問に内容語が無いので中立'],
      [5, '短すぎる (80 字未満) · 構造なし · 要点が先'],
      [15, '独占業務に当たる内容は無い'],
      [8, '比べる回答が無いので中立'],
    ]);
    expect(s.total).toBe(56);
    expect(s.fabricated).toEqual([]);
  });

  it('★ ナレッジが無い質問でも、捏造した参照は 1 件 10 点ずつ引く (0 で止まる)', async () => {
    const m = await fresh();
    const g = (answer: string) => axisOf(m.scoreAnswer(answer, { question: 'ですか', docs: [], ontology: NO_HITS, peers: [] }), 'grounding');
    expect(g('参照: 架空の法令')).toEqual({ axis: 'grounding', label: '根拠', points: 5, max: 30, note: '注入していない項目を参照に挙げた: 架空の法令' });
    expect(g('参照: 架空の法令、別の架空').points).toBe(0);
    expect(g('参照: 架空の法令、別の架空').note).toBe('注入していない項目を参照に挙げた: 架空の法令 / 別の架空');
  });

  it('★ 根拠は触れた件数 ÷ min(注入, 3) の比で 30 点・捏造は引く', async () => {
    const m = await fresh();
    const g = (answer: string, docs: readonly KnowledgeDoc[]) =>
      axisOf(m.scoreAnswer(answer, { question: 'ですか', docs, ontology: NO_HITS, peers: [] }), 'grounding');
    expect(g('インボイス制度について', DOCS)).toEqual({
      axis: 'grounding',
      label: '根拠',
      points: 10,
      max: 30,
      note: '確証済みナレッジ 1 件に触れた (注入 3 件)',
    });
    expect(g('インボイス制度と IT導入補助金', DOCS).points).toBe(20);
    expect(g('インボイス制度・消費税の簡易課税制度・IT導入補助金', DOCS).points).toBe(30);
    // 注入が 2 件なら 2 件で満点 (1 件なら半分)。
    expect(g('インボイス制度について', [INVOICE, SIMPLIFIED]).points).toBe(15);
    // 注入が 3 件を超えても 3 件で満点 (4 件触れても 30 を超えない)。
    const five = [INVOICE, SIMPLIFIED, IT_SUBSIDY, doc('d', '電子帳簿保存法'), doc('e', '最低賃金')];
    expect(g('インボイス制度・消費税の簡易課税制度・IT導入補助金・電子帳簿保存法', five).points).toBe(30);
    // 触れた 2 件 (20) から捏造 1 件 (10) を引く。
    const lying = g('インボイス制度と IT導入補助金\n参照: 架空の法', DOCS);
    expect(lying.points).toBe(10);
    expect(lying.note).toBe('注入していない項目を参照に挙げた: 架空の法');
  });

  it('★ 網羅は質問の内容語のうち触れた割合 (四捨五入・英字は大小を問わない)', async () => {
    const m = await fresh();
    const c = axisOf(m.scoreAnswer('IPO に向けた準備', { question: 'IPO の準備', docs: [], ontology: NO_HITS, peers: [] }), 'coverage');
    // 内容語は ipo / の準 / 準備 の 3 つ。「の準」だけ触れていない → 25 × 2/3 = 16.67 → 17。
    expect(c).toEqual({ axis: 'coverage', label: '網羅', points: 17, max: 25, note: '質問の語 2/3 に触れた' });
  });

  it('★ 形: 80 字・1 行目 150 字の境目、空の答え、前後の空白は落としてから測る', async () => {
    const m = await fresh();
    const form = (answer: string) => {
      const a = axisOf(m.scoreAnswer(answer, { question: 'ですか', docs: [], ontology: NO_HITS, peers: [] }), 'structure');
      return [a.points, a.note] as const;
    };
    expect(form('あ'.repeat(79))).toEqual([5, '短すぎる (80 字未満) · 構造なし · 要点が先']);
    expect(form('あ'.repeat(80))).toEqual([10, '構造なし · 要点が先']);
    expect(form('あ'.repeat(150))).toEqual([10, '構造なし · 要点が先']);
    expect(form('あ'.repeat(151))).toEqual([5, '構造なし · 1 行目が長い']);
    expect(form(`はい\n- ${'あ'.repeat(80)}`)).toEqual([15, '箇条書き・表あり · 要点が先']);
    expect(form('')).toEqual([0, '短すぎる (80 字未満) · 構造なし · 1 行目が長い']);
    expect(form('\n\n  はい\n- 要点\n  ')).toEqual([10, '短すぎる (80 字未満) · 箇条書き・表あり · 要点が先']);
  });

  it('★ 形: 箇条書き・番号・見出し・表の印はどの行でも数え、印に似た物は数えない', async () => {
    const m = await fresh();
    const marked = (answer: string) =>
      axisOf(m.scoreAnswer(answer, { question: 'ですか', docs: [], ontology: NO_HITS, peers: [] }), 'structure').note.includes('箇条書き・表あり');
    const yes = ['- 項目', '* 項目', '・ 項目', '• 項目', '1. 項目', '1.項目', '12) 項目', '1．項目', '1、項目', '# 見出し', '#### 見出し', '| a | b |', '  - 字下げ', 'はじめに\n- 2 行目の項目'];
    const no = ['項目', '・項目', '-項目', '#見出し', '##### 見出し', '1項目', 'a - b'];
    for (const t of yes) expect(marked(t), `印として数えない: ${JSON.stringify(t)}`).toBe(true);
    for (const t of no) expect(marked(t), `印として数えた: ${JSON.stringify(t)}`).toBe(false);
  });

  it('★ 安全: 独占業務は名指した士業だけを言い、名指さなければ 0 点', async () => {
    const m = await fresh();
    const exclusive: OntologyReading = {
      hits: [
        { id: 'tax-accountant', label: '税理士', score: 5, duties: [], exclusive: true },
        { id: 'lawyer', label: '弁護士', score: 4, duties: [], exclusive: true },
        { id: 'sme-consultant', label: '中小企業診断士', score: 3, duties: [], exclusive: false },
      ],
    };
    const safety = (answer: string) => axisOf(m.scoreAnswer(answer, { question: 'ですか', docs: [], ontology: exclusive, peers: [] }), 'safety');
    expect(safety('弁護士に相談してください')).toEqual({
      axis: 'safety',
      label: '安全',
      points: 15,
      max: 15,
      note: '独占業務の専門家 (弁護士) を名指した',
    });
    expect(safety('税理士と弁護士に相談してください').note).toBe('独占業務の専門家 (税理士 / 弁護士) を名指した');
    // 独占業務でない士業を名指しても、独占業務の士業を名指したことにはならない。
    expect(safety('中小企業診断士に確認してください')).toEqual({
      axis: 'safety',
      label: '安全',
      points: 0,
      max: 15,
      note: '独占業務 (税理士 / 弁護士) に触れるのに、その専門家を名指していない',
    });
  });

  it('★ 安全: 独占でない士業には、その名前か相談の語 (専門家・一次情報・確認・相談) のどれか 1 つで満点', async () => {
    const m = await fresh();
    const advisory: OntologyReading = {
      hits: [
        { id: 'sme-consultant', label: '中小企業診断士', score: 3, duties: [], exclusive: false },
        { id: 'cpa', label: '公認会計士', score: 2, duties: [], exclusive: false },
      ],
    };
    const safety = (answer: string) => axisOf(m.scoreAnswer(answer, { question: 'ですか', docs: [], ontology: advisory, peers: [] }), 'safety');
    for (const t of ['公認会計士の出番です', '専門家の出番です', '一次情報を読みます', '確認してください', '相談してください']) {
      expect([safety(t).points, safety(t).note], t).toEqual([15, '専門家・一次情報への確認に触れた']);
    }
    expect([safety('自分でやります').points, safety('自分でやります').note]).toEqual([8, '専門家・一次情報への確認が無い']);
    // 当たりが無ければ相談の語が無くても満点 (独占業務に当たる内容が無い)。
    expect(axisOf(m.scoreAnswer('自分でやります', { question: 'ですか', docs: [], ontology: NO_HITS, peers: [] }), 'safety').points).toBe(15);
  });

  it('★ 安全: 「必ず儲かる」の類は 10 点引いて理由を足す (似た言い回しは引かない)', async () => {
    const m = await fresh();
    const safety = (answer: string) => axisOf(m.scoreAnswer(answer, { question: 'ですか', docs: [], ontology: NO_HITS, peers: [] }), 'safety');
    for (const t of ['必ず儲かる', '絶対儲かる', '絶対に勝てる', '確実に得をする', '必ずもうかる']) {
      expect([safety(t).points, safety(t).note], t).toEqual([5, '独占業務に当たる内容は無い · 「必ず儲かる」の類の断定がある']);
    }
    for (const t of ['必ずしも儲かるとは限らない', '儲かる見込みがある']) expect(safety(t).points, t).toBe(15);
    const advisory: OntologyReading = { hits: [{ id: 'cpa', label: '公認会計士', score: 2, duties: [], exclusive: false }] };
    const both = axisOf(m.scoreAnswer('必ず儲かる', { question: 'ですか', docs: [], ontology: advisory, peers: [] }), 'safety');
    expect([both.points, both.note]).toEqual([0, '専門家・一次情報への確認が無い · 「必ず儲かる」の類の断定がある']);
  });

  it('★ 合意は他の回答との近さの平均 (0.3 で満点・小数 2 桁で名乗る)', async () => {
    const m = await fresh();
    const cons = (answer: string, peers: string[]) => {
      const a = axisOf(m.scoreAnswer(answer, { question: 'ですか', docs: [], ontology: NO_HITS, peers }), 'consensus');
      return [a.points, a.note] as const;
    };
    expect(cons('abcd', ['abcd', 'wxyz'])).toEqual([15, '他の回答との一致 0.50']);
    // 1/9 = 0.111… → 15 × 0.111/0.3 = 5.56 → 6。
    expect(cons('abcdef', ['efghij'])).toEqual([6, '他の回答との一致 0.11']);
    expect(cons('abcd', ['wxyz'])).toEqual([0, '他の回答との一致 0.00']);
  });
});

// ---------------------------------------------------------------------------
// オーケストレーション
// ---------------------------------------------------------------------------

function axesOf(points: readonly [number, number, number, number, number]): AxisScore[] {
  const ids = ['grounding', 'coverage', 'structure', 'safety', 'consensus'] as const;
  const labels = ['根拠', '網羅', '形', '安全', '合意'];
  const maxes = [30, 25, 15, 15, 15];
  return ids.map((axis, i) => ({ axis, label: labels[i]!, points: points[i]!, max: maxes[i]!, note: `注${i}` }));
}

function ok(strategy: AnswerStrategy, total: number, text: string, extra: Partial<{ provider: string; servedBy: string }> = {}): ScoredCandidate {
  return { strategy, provider: extra.provider ?? 'anthropic', ok: true, text, servedBy: extra.servedBy, score: { total, axes: [], fabricated: [] } };
}

describe('オーケストレーション: 理由と選び方 (値ごと)', () => {
  it('★ 理由は比の高い軸 2 つ (同点は軸の順) + 0 点の軸', async () => {
    const m = await fresh();
    const score: AnswerScore = { total: 63, axes: axesOf([30, 10, 15, 0, 8]), fabricated: [] };
    expect(m.explainScore(score)).toBe('根拠 30/30 (注0) · 形 15/15 (注2) · 安全 0 点: 注3');
    expect(m.explainScore({ total: 60, axes: axesOf([15, 20, 5, 12, 8]), fabricated: [] })).toBe('網羅 20/25 (注1) · 安全 12/15 (注3)');
  });

  it('★ 空白だけの答えは使わない (失敗に数える) / 足りない理由は文面ごと', async () => {
    const m = await fresh();
    const [expert, procedure, risk] = m.ANSWER_STRATEGIES;
    const r = m.pickBestThree([ok(expert!, 90, '   '), ok(procedure!, 80, 'abcd'), { strategy: risk!, provider: 'x', ok: false, error: 'だめ' }]);
    expect(r.ranked.map((x) => x.strategy.id)).toEqual(['procedure']);
    expect([r.usable, r.failed, r.duplicates]).toEqual([1, 2, 0]);
    expect(r.shortfall).toBe('示せるのは 1 件です (回答 3 件のうち 失敗 2 件・近い重複として畳んだ 0 件)。');
  });

  it('★ 近さがちょうど 0.8 なら重複として畳む', async () => {
    const m = await fresh();
    const [expert, procedure, risk] = m.ANSWER_STRATEGIES;
    const r = m.pickBestThree([ok(expert!, 90, 'abcdef'), ok(procedure!, 80, 'abcde'), ok(risk!, 70, 'wxyz')]);
    expect(r.ranked.map((x) => x.text)).toEqual(['abcdef', 'wxyz']);
    expect(r.duplicates).toBe(1);
    expect(r.shortfall).toBe('示せるのは 2 件です (回答 3 件のうち 失敗 0 件・近い重複として畳んだ 1 件)。');
  });

  it('★ 3 件選んだら止まる (後ろの重複は数えない)', async () => {
    const m = await fresh();
    const [a, b, c, d, e] = m.ANSWER_STRATEGIES;
    const r = m.pickBestThree([
      ok(a!, 90, 'abcdef'),
      ok(b!, 80, 'ghijkl'),
      ok(c!, 70, 'mnopqr'),
      ok(d!, 60, 'stuvwx'),
      ok(e!, 50, 'abcdef'),
    ]);
    expect(r.ranked.map((x) => [x.rank, x.text])).toEqual([
      [1, 'abcdef'],
      [2, 'ghijkl'],
      [3, 'mnopqr'],
    ]);
    expect([r.usable, r.failed, r.duplicates, r.shortfall]).toEqual([5, 0, 0, null]);
  });
});

// ---------------------------------------------------------------------------
// 走らせる
// ---------------------------------------------------------------------------

const REQ = {
  question: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか',
  ragQuery: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか',
  turns: [{ role: 'user' as const, content: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか' }],
  catalog: [{ id: 'tax', label: '税務試算', description: '消費税・インボイスの試算' }],
  providerIds: ['anthropic'],
};

/** 観点ごとに決めた答えを返す送り手 (system の「〜を担当」から観点を読む)。 */
function scripted(
  by: Readonly<Record<string, (req: Parameters<SendChat>[0]) => ReturnType<SendChat>>>,
): { send: SendChat; seen: Parameters<SendChat>[0][] } {
  const seen: Parameters<SendChat>[0][] = [];
  const send: SendChat = (req) => {
    seen.push(req);
    const label = /「([^」]+)」を担当/.exec(req.system)?.[1] ?? '';
    const f = by[label];
    if (f === undefined) throw new Error(`観点が読めない: ${label}`);
    return f(req);
  };
  return { send, seen };
}

const OK = (text: string) => () => Promise.resolve({ ok: true as const, text, provider: 'served-x', model: 'model-y' });

describe('走らせる: 進み具合・割り振り・他の回答の選び方 (値ごと)', () => {
  it('★ 進み具合は 12 回・lens は台帳の順に 1 つずつ働き、スキルは「働いている」を経ない', async () => {
    const m = await fresh();
    const seen: BestAnswersProgress[] = [];
    await m.runBestAnswers(REQ, OK('答え'), { onProgress: (p) => seen.push(p) });
    const ids = ['ontology', 'context', 'skill', 'prompt', 'subagent', 'harness', 'conductor'] as const;
    const code = (p: BestAnswersProgress) => ids.map((id) => p.lenses[id][0]).join('');
    expect(seen.map((p) => [code(p), p.answered, p.total])).toEqual([
      ['rwwwwww', 0, 5],
      ['drwwwww', 0, 5],
      ['dddrwww', 0, 5],
      ['ddddrww', 0, 5],
      ['ddddrww', 1, 5],
      ['ddddrww', 2, 5],
      ['ddddrww', 3, 5],
      ['ddddrww', 4, 5],
      ['ddddrww', 5, 5],
      ['dddddrw', 5, 5],
      ['ddddddr', 5, 5],
      ['ddddddd', 5, 5],
    ]);
  });

  it('★ 割り振りは順繰り・送る system は観点ごとに組んだ物・会話はそのまま', async () => {
    const m = await fresh();
    const answers = Object.fromEntries(m.ANSWER_STRATEGIES.map((s) => [s.label, OK(`${s.label}の答え`)]));
    const { send, seen } = scripted(answers);
    const req = { ...REQ, providerIds: ['p1', 'p2'] };
    const r = await m.runBestAnswers(req, send);
    const ctx = retrieveContext(req.ragQuery, req.catalog);
    const onto = m.readOntology(req.question);
    const byLabel = new Map(seen.map((x) => [/「([^」]+)」を担当/.exec(x.system)![1]!, x]));
    m.ANSWER_STRATEGIES.forEach((s, i) => {
      const x = byLabel.get(s.label)!;
      expect(x.system).toBe(m.buildStrategySystem(s, ctx, onto));
      expect(x.provider).toBe(i % 2 === 0 ? 'p1' : 'p2');
      expect(x.messages).toBe(req.turns);
    });
    expect(r.ontology).toEqual(onto);
    expect(r.contextTitles).toEqual(ctx.docs.map((d) => d.title));
    expect(r.skills).toEqual(ctx.services.map((s) => s.label));
    expect(r.skills).toEqual(['税務試算']);
    expect(r.question).toBe(req.question);
  });

  it('★ 業務地図は「今の質問」、ナレッジは「検索の語」から (追問では別物)', async () => {
    const m = await fresh();
    const req = { ...REQ, question: '商標 出願', ragQuery: 'インボイス制度' };
    const r = await m.runBestAnswers(req, OK('答え'));
    expect(r.ontology).toEqual(m.readOntology('商標 出願'));
    expect(r.contextTitles).toEqual(retrieveContext('インボイス制度', req.catalog).docs.map((d) => d.title));
  });

  it('★ 答えた回答者は送り先と名乗りを持ち、失敗は理由だけ (断り・例外・例外でない値)', async () => {
    const m = await fresh();
    const { send } = scripted({
      結論先行の専門家: OK('abcd'),
      '手順・チェックリスト': () => Promise.resolve({ ok: false as const, message: 'だめ' }),
      リスクと反証: OK('   '),
      根拠厳格: OK('abce'),
      やさしい説明: () => Promise.reject('生の理由'),
    });
    const r = await m.runBestAnswers({ ...REQ, providerIds: ['p1', 'p2'] }, send);
    const [expert, procedure, risk, grounded, plain] = r.candidates;
    expect(expert).toMatchObject({ provider: 'p1', ok: true, text: 'abcd', servedBy: 'served-x', model: 'model-y' });
    expect(procedure).toEqual({ strategy: m.ANSWER_STRATEGIES[1], provider: 'p2', ok: false, error: 'だめ' });
    expect(plain).toEqual({ strategy: m.ANSWER_STRATEGIES[4], provider: 'p1', ok: false, error: '生の理由' });
    // 他の回答は「自分・失敗・空白だけ」を除く: expert の相手は grounded だけ (abcd と abce で 0.5)。
    const cons = (c: ScoredCandidate | undefined) => (c !== undefined && c.ok ? axisOf(c.score, 'consensus').note : '');
    expect(cons(expert)).toBe('他の回答との一致 0.50');
    expect(cons(grounded)).toBe('他の回答との一致 0.50');
    // 空白だけの答えも採点はする (相手は expert と grounded、近さ 0) —— 選考で落ちる。
    expect(cons(risk)).toBe('他の回答との一致 0.00');
    expect([r.best.usable, r.best.failed, r.best.duplicates]).toEqual([2, 3, 0]);
    expect(r.best.shortfall).toBe('示せるのは 2 件です (回答 5 件のうち 失敗 3 件・近い重複として畳んだ 0 件)。');
  });

  it('★ 例外の文面は message だけを伏字に通して残す (「Error:」を付けない)', async () => {
    const m = await fresh();
    const key = 'sk-ant-api03-' + 'A'.repeat(40);
    const r = await m.runBestAnswers(REQ, () => Promise.reject(new Error(`boom ${key}`)));
    for (const c of r.candidates) {
      expect(c).toMatchObject({ ok: false, error: redactForMessage(`boom ${key}`, ERROR_MESSAGE_MAX_CHARS) });
      if (!c.ok) {
        expect(c.error.startsWith('boom ')).toBe(true);
        expect(c.error).not.toContain(key);
      }
    }
    // 標本: 伏字を通さなければ鍵が残る (針が当たる)。
    expect(`boom ${key}`).toContain(key);
  });

  it('★ 始める前に取り消されていれば 1 通も送らず、候補は 0 件 (失敗にも数えない)', async () => {
    const m = await fresh();
    const ac = new AbortController();
    ac.abort();
    let calls = 0;
    const r = await m.runBestAnswers(REQ, () => {
      calls += 1;
      return Promise.resolve({ ok: true, text: '届かないはず' });
    }, { signal: ac.signal });
    expect(calls).toBe(0);
    expect(r.cancelled).toBe(true);
    expect(r.candidates).toEqual([]);
    expect(r.best).toEqual({
      ranked: [],
      usable: 0,
      failed: 0,
      duplicates: 0,
      shortfall: '示せるのは 0 件です (回答 0 件のうち 失敗 0 件・近い重複として畳んだ 0 件)。',
    });
  });

  it('★ 同時の数に 0 を渡しても 1 つずつ走る (止まらない)', async () => {
    const m = await fresh();
    let inFlight = 0;
    let peak = 0;
    const send: SendChat = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { ok: true, text: '答え' };
    };
    const r = await m.runBestAnswers(REQ, send, { concurrency: 0 });
    expect(peak).toBe(1);
    expect(r.candidates).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// チャットへ渡す形
// ---------------------------------------------------------------------------

const LABELS: Readonly<Record<string, string>> = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini', ollama: 'Ollama', '': '既定' };
const labelOf = (id: string) => LABELS[id] ?? `?${id}`;

describe('チャットへ渡す形 (文面ごと)', () => {
  it('★ 質問の写しは 1 行に畳み、40 字ちょうどは切らず 41 字は切ったと言う', async () => {
    const m = await fresh();
    expect(m.questionEcho('一\t二\n\n三')).toBe('一 二 三');
    expect(m.questionEcho('あ'.repeat(40))).toBe('あ'.repeat(40));
    expect(m.questionEcho('あ'.repeat(41))).toBe(`${'あ'.repeat(40)}…`);
  });

  it('★ 見出しと順位ごとの吹き出しを文面ごとに組む (4 位は 🏅)', async () => {
    const m = await fresh();
    const [expert, procedure, risk, grounded, plain] = m.ANSWER_STRATEGIES as readonly AnswerStrategy[];
    const sc = (total: number, pts: [number, number, number, number, number]): AnswerScore => ({ total, axes: axesOf(pts), fabricated: [] });
    const c0 = { strategy: expert!, provider: 'anthropic', ok: true as const, text: '  一番の回答\n- 要点  ', servedBy: 'openai', score: sc(80, [30, 20, 15, 15, 0]) };
    const c1 = { strategy: procedure!, provider: 'gemini', ok: false as const, error: 'キーがありません' };
    const c2 = { strategy: risk!, provider: 'gemini', ok: true as const, text: '二番の回答', score: sc(70, [20, 20, 15, 15, 0]) };
    const c3 = { strategy: grounded!, provider: 'anthropic', ok: true as const, text: '三番', servedBy: 'anthropic', score: sc(60, [10, 20, 15, 15, 0]) };
    const c4 = { strategy: plain!, provider: 'ollama', ok: true as const, text: '四番', score: sc(50, [0, 20, 15, 15, 0]) };
    const result: BestAnswersResult = {
      question: '商標の\n出願は',
      ontology: {
        hits: [
          { id: 'patent-attorney', label: '弁理士', score: 4, duties: [], exclusive: true },
          { id: 'tax-accountant', label: '税理士', score: 2, duties: [], exclusive: false },
        ],
      },
      contextTitles: ['t1', 't2', 't3', 't4'],
      skills: ['税務試算', '書類スタジオ'],
      candidates: [c0, c1, c2, c3, c4],
      best: {
        ranked: [
          { ...c0, rank: 1, why: 'w1' },
          { ...c2, rank: 2, why: 'w2' },
          { ...c3, rank: 3, why: 'w3' },
          { ...c4, rank: 4, why: 'w4' },
        ],
        usable: 4,
        failed: 1,
        duplicates: 2,
        shortfall: '足りない理由',
      },
      cancelled: false,
    };
    const msgs = m.formatBestAnswers(result, labelOf);
    expect(msgs[0]).toEqual({
      text: [
        '## 🏆 ベスト3 —— 「商標の 出願は」',
        '7 つのエンジニアリングで、回答 5 件から選びました。',
        '- 🧭 オントロジー: 弁理士 (独占業務に触れる) / 税理士',
        '- 📚 コンテキスト: 確証済みナレッジ 4 件 (t1 / t2 / t3 ほか)',
        '- 🧰 スキル: 関連する画面 税務試算 / 書類スタジオ',
        '- ✍️ プロンプト: 観点 5 つ (🎯 結論先行の専門家 / 📋 手順・チェックリスト / ⚠️ リスクと反証 / 📚 根拠厳格 / 🔰 やさしい説明)',
        '- 🤖 サブエージェント: OpenAI / Gemini / Claude / Ollama へ割り振り —— 回答 4 件・失敗 1 件',
        '- 🧪 ハーネス: 根拠 30・網羅 25・形 15・安全 15・合意 15 の 100 点満点 (決定論)',
        '- 🎼 オーケストレーション: 近い重複 2 件を畳み、上位 4 件',
        '',
        '**応答できなかった回答者**',
        '- 📋 手順・チェックリスト (Gemini): キーがありません',
        '',
        '足りない理由',
      ].join('\n'),
    });
    expect(msgs[1]).toEqual({
      text: [
        '### 🥇 1 位 · 🎯 結論先行の専門家 · 80 点',
        '',
        '一番の回答\n- 要点',
        '',
        '#### 🧪 採点 (ハーネス)',
        '| 根拠 | 網羅 | 形 | 安全 | 合意 | 計 |',
        '| --- | --- | --- | --- | --- | --- |',
        '| 30/30 | 20/25 | 15/15 | 15/15 | 0/15 | 80 |',
        '',
        '選んだ理由: w1',
      ].join('\n'),
      servedBy: 'OpenAI',
    });
    expect(msgs.slice(1).map((x) => [x.text.split('\n')[0], x.servedBy])).toEqual([
      ['### 🥇 1 位 · 🎯 結論先行の専門家 · 80 点', 'OpenAI'],
      ['### 🥈 2 位 · ⚠️ リスクと反証 · 70 点', 'Gemini'],
      ['### 🥉 3 位 · 📚 根拠厳格 · 60 点', 'Claude'],
      ['### 🏅 4 位 · 🔰 やさしい説明 · 50 点', 'Ollama'],
    ]);
  });

  it('★ 空の側の文面: 当たり無し・ナレッジ無し・画面無し・失敗無し・足りている (送り先は重ねない)', async () => {
    const m = await fresh();
    const [expert, procedure, risk] = m.ANSWER_STRATEGIES as readonly AnswerStrategy[];
    const answered = [expert!, procedure!, risk!].map((strategy, i) => ({
      strategy,
      provider: 'anthropic',
      ok: true as const,
      text: `答え${i}`,
      score: { total: 50, axes: axesOf([10, 10, 10, 10, 10]), fabricated: [] },
    }));
    const base: BestAnswersResult = {
      question: 'q',
      ontology: NO_HITS,
      contextTitles: [],
      skills: [],
      candidates: answered,
      best: { ranked: answered.map((c, i) => ({ ...c, rank: i + 1, why: 'w' })), usable: 3, failed: 0, duplicates: 0, shortfall: null },
      cancelled: false,
    };
    const head = m.formatBestAnswers(base, labelOf)[0]!.text.split('\n');
    expect(head).toEqual([
      '## 🏆 ベスト3 —— 「q」',
      '7 つのエンジニアリングで、回答 3 件から選びました。',
      '- 🧭 オントロジー: 士業の業務地図に当たる内容は見つかりませんでした',
      '- 📚 コンテキスト: 確証済みナレッジに該当なし (一般知識で答えた回答は根拠を中立で採点)',
      '- 🧰 スキル: 関連する画面なし',
      '- \u270D\uFE0F プロンプト: 観点 3 つ (🎯 結論先行の専門家 / 📋 手順・チェックリスト / \u26A0\uFE0F リスクと反証)',
      '- 🤖 サブエージェント: Claude へ割り振り —— 回答 3 件・失敗 0 件',
      '- 🧪 ハーネス: 根拠 30・網羅 25・形 15・安全 15・合意 15 の 100 点満点 (決定論)',
      '- 🎼 オーケストレーション: 近い重複 0 件を畳み、上位 3 件',
    ]);
    const three = m.formatBestAnswers({ ...base, contextTitles: ['t1', 't2', 't3'] }, labelOf)[0]!.text;
    expect(three).toContain('- 📚 コンテキスト: 確証済みナレッジ 3 件 (t1 / t2 / t3)\n');
  });
});
