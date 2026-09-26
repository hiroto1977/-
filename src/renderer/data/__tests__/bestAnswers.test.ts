/**
 * **ベストアンサー 3 の engine** —— 7 つの lens が本当に働いているかを振る舞いで見る。
 *
 * 見ること: ① lens と観点の台帳 ② 割り振り (観点 × AI の掛け算にしない) ③ オントロジーが
 * 確証済みの業務地図から導かれる (語彙の表を持たない) ④ ハーネスの採点 (捏造した参照・
 * 独占業務・断定・決定論) ⑤ 上位 3 件の選び方 (失敗・同点・近い重複・足りないときの理由)
 * ⑥ 走らせ方 (並列の上限・失敗の隔離・取り消し・伏字) ⑦ チャットへ渡す形。
 */
import { describe, expect, it } from 'vitest';
import {
  ANSWER_STRATEGIES,
  AXIS_MAX,
  BEST_ANSWERS_CONCURRENCY,
  DUPLICATE_AT,
  ENGINEERING_LENSES,
  FABRICATED_CITATION_PENALTY,
  MAX_BEST_ANSWER_CALLS,
  contentSimilarity,
  fabricatedCitations,
  formatBestAnswers,
  pickBestThree,
  planCalls,
  readOntology,
  runBestAnswers,
  scoreAnswer,
  type BestAnswersProgress,
  type OntologyReading,
  type ScoredCandidate,
  type SendChat,
  questionEcho,
  QUESTION_ECHO_CHARS,
} from '../bestAnswers';
import { ASSISTANT_BASE_INSTRUCTIONS, type KnowledgeDoc } from '../assistantContext';
import { PROFESSIONAL_IDS, PROFESSIONAL_MAP } from '../professionalMap';
import { parseMarkdown } from '../assistantMarkdown';

const DOCS: readonly KnowledgeDoc[] = [
  { id: 'a', kind: 'コンプライアンス', title: 'インボイス制度（適格請求書等保存方式）', body: '…' },
  { id: 'b', kind: 'コンプライアンス', title: '消費税の簡易課税制度', body: '…' },
  { id: 'c', kind: '補助金・助成金', title: 'IT導入補助金', body: '…' },
];

const NO_ONTOLOGY: OntologyReading = { hits: [] };
const TAX_EXCLUSIVE: OntologyReading = {
  hits: [
    {
      id: 'tax-accountant',
      label: PROFESSIONAL_MAP['tax-accountant'].label,
      score: 9,
      duties: [{ title: '申告代理・納税スケジュール', scope: 'exclusive' }],
      exclusive: true,
    },
  ],
};

const LONG_GOOD = [
  '結論: 免税事業者からの仕入れでも、経過措置により一定割合は控除できます。',
  '',
  '- インボイス制度（適格請求書等保存方式）では、登録番号のない請求書は原則として仕入税額控除の対象外です。',
  '- ただし経過措置の期間中は一定割合を控除できます。',
  '- 消費税の簡易課税制度を選んでいる場合は計算の仕方が変わります。',
  '',
  '個別の判断は税理士に確認してください。',
  '参照: インボイス制度（コンプライアンス）、消費税の簡易課税制度（コンプライアンス）',
].join('\n');

describe('lens と観点の台帳', () => {
  it('★ 7 つのエンジニアリングが揃い、id は重ならない', () => {
    expect(ENGINEERING_LENSES.map((l) => l.id)).toEqual([
      'ontology',
      'context',
      'skill',
      'prompt',
      'subagent',
      'harness',
      'conductor',
    ]);
    for (const l of ENGINEERING_LENSES) expect(l.does.length, `${l.id} が何をするかを名乗っていない`).toBeGreaterThan(10);
  });

  it('★ 観点は互いに違い、送る回数の上限は観点の数と同じ', () => {
    const ids = ANSWER_STRATEGIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ANSWER_STRATEGIES.map((s) => s.instruction)).size).toBe(ids.length);
    expect(MAX_BEST_ANSWER_CALLS).toBe(ANSWER_STRATEGIES.length);
  });
});

describe('サブエージェント: 観点を AI へ割り振る (掛け算にしない)', () => {
  it('★ AI が無ければ既定へ、1 つならその AI へ、観点の数だけ送る', () => {
    expect(planCalls([]).map((c) => c.provider)).toEqual(['', '', '', '', '']);
    expect(planCalls(['anthropic']).map((c) => c.provider)).toEqual(Array(5).fill('anthropic'));
  });

  it('★ 複数の AI には順繰りに割り振り、回数は増えない', () => {
    expect(planCalls(['a', 'b']).map((c) => c.provider)).toEqual(['a', 'b', 'a', 'b', 'a']);
    const many = planCalls(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(many).toHaveLength(MAX_BEST_ANSWER_CALLS);
    expect(many.map((c) => c.provider)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('オントロジー: 確証済みの業務地図から導く (語彙の表を持たない)', () => {
  it('★ 業務地図のどの業務も、その業務名と説明で問えばその士業に当たる (母集団は地図から)', () => {
    let n = 0;
    for (const id of PROFESSIONAL_IDS) {
      for (const duty of PROFESSIONAL_MAP[id].duties) {
        const hits = readOntology(`${duty.title}について。${duty.desc}`).hits.map((h) => h.id);
        expect(hits, `${id} / ${duty.title} に当たらない`).toContain(id);
        n += 1;
      }
    }
    expect(n, '業務地図が空 —— 走査が壊れている').toBeGreaterThanOrEqual(24);
  });

  it('★ 独占業務に当たれば exclusive を立てる / 士業の名前そのものでも当たる', () => {
    const tax = PROFESSIONAL_MAP['tax-accountant'];
    const excl = tax.duties.find((d) => d.scope === 'exclusive')!;
    const r = readOntology(`${excl.title}を頼みたい。${excl.desc}`);
    expect(r.hits.find((h) => h.id === 'tax-accountant')?.exclusive).toBe(true);
    expect(readOntology(`${tax.label}に相談したい`).hits.map((h) => h.id)).toContain('tax-accountant');
  });

  it('★ 関係の無い質問は当てない (空の読みを返す)', () => {
    expect(readOntology('今日の夕飯の献立を考えて').hits).toEqual([]);
    expect(readOntology('').hits).toEqual([]);
  });
});

describe('ハーネス: 決定論の採点', () => {
  const input = { question: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか', docs: DOCS, ontology: TAX_EXCLUSIVE, peers: [] };

  it('★ 同じ入力に同じ点を返し、軸は上限の中・合計は軸の和', () => {
    const a = scoreAnswer(LONG_GOOD, input);
    expect(scoreAnswer(LONG_GOOD, input)).toEqual(a);
    for (const x of a.axes) {
      expect(x.points).toBeGreaterThanOrEqual(0);
      expect(x.points).toBeLessThanOrEqual(x.max);
    }
    expect(a.total).toBe(a.axes.reduce((s, x) => s + x.points, 0));
    expect(Object.values(AXIS_MAX).reduce((s, v) => s + v, 0)).toBe(100);
  });

  it('★ 注入した項目に触れた回答は、触れない回答より根拠が高い', () => {
    const g = (t: string) => scoreAnswer(t, input).axes.find((x) => x.axis === 'grounding')!.points;
    expect(g(LONG_GOOD)).toBeGreaterThan(g('一般論として、仕入税額控除には書類の保存が要ります。'));
  });

  it('★ 注入していない項目を「参照:」に挙げると減点し、その名前を言う (標本つき)', () => {
    const fake = `${LONG_GOOD}\n参照: 架空の特例措置法（コンプライアンス）`;
    expect(fabricatedCitations(fake, DOCS)).toEqual(['架空の特例措置法']);
    // 標本: 本物の項目 (表記の揺れを含む) は捏造と数えない —— 針が広すぎない。
    expect(fabricatedCitations(LONG_GOOD, DOCS)).toEqual([]);
    const honest = scoreAnswer(LONG_GOOD, input).axes.find((x) => x.axis === 'grounding')!;
    const lying = scoreAnswer(fake, input).axes.find((x) => x.axis === 'grounding')!;
    // **減点の値を借りて主張しない** —— 借りると、減点を 0 にしても差が 0 で一致して通る
    // (2026-09-26 の対照 A が実際にそれで鳴らなかった)。捏造は必ず点を下げる、を先に言う。
    expect(lying.points, '捏造した参照が点を下げていない').toBeLessThan(honest.points);
    expect(honest.points - lying.points).toBe(FABRICATED_CITATION_PENALTY);
    expect(lying.note).toContain('架空の特例措置法');
  });

  it('★ 独占業務に触れる質問で、その士業を名指さない回答は安全 0 点', () => {
    const silent = LONG_GOOD.replace('個別の判断は税理士に確認してください。', '');
    const s = scoreAnswer(silent, input).axes.find((x) => x.axis === 'safety')!;
    expect(s.points).toBe(0);
    expect(s.note).toContain(PROFESSIONAL_MAP['tax-accountant'].label);
    expect(scoreAnswer(LONG_GOOD, input).axes.find((x) => x.axis === 'safety')!.points).toBe(AXIS_MAX.safety);
  });

  it('★ 「必ず儲かる」の類の断定は安全を減らす', () => {
    const base = { ...input, ontology: NO_ONTOLOGY };
    const calm = scoreAnswer('この投資は値下がりのリスクがあります。', base).axes.find((x) => x.axis === 'safety')!;
    const hype = scoreAnswer('この投資は必ず儲かるので安心です。', base).axes.find((x) => x.axis === 'safety')!;
    expect(calm.points - hype.points).toBeGreaterThan(0);
  });

  it('★ 質問の語に触れるほど網羅が高い / 形は長さ・構造・要点で決まる', () => {
    const cov = (t: string) => scoreAnswer(t, input).axes.find((x) => x.axis === 'coverage')!.points;
    expect(cov(LONG_GOOD)).toBeGreaterThan(cov('はい。'));
    const form = (t: string) => scoreAnswer(t, input).axes.find((x) => x.axis === 'structure')!.points;
    expect(form(LONG_GOOD)).toBe(AXIS_MAX.structure);
    expect(form('はい。')).toBeLessThan(AXIS_MAX.structure);
  });

  it('★ 合意: 比べる回答が無ければ中立、同じ内容なら満点', () => {
    const alone = scoreAnswer(LONG_GOOD, input).axes.find((x) => x.axis === 'consensus')!;
    expect(alone.points).toBe(Math.round(AXIS_MAX.consensus / 2));
    const twin = scoreAnswer(LONG_GOOD, { ...input, peers: [LONG_GOOD] }).axes.find((x) => x.axis === 'consensus')!;
    expect(twin.points).toBe(AXIS_MAX.consensus);
  });
});

function scored(id: string, total: number, text: string, ok = true): ScoredCandidate {
  const strategy = ANSWER_STRATEGIES.find((s) => s.id === id)!;
  // 答えられなかった回答者は本文も点も持たない (型がそう言う)。
  return ok
    ? { strategy, provider: 'anthropic', ok: true, text, score: { total, axes: [], fabricated: [] } }
    : { strategy, provider: 'anthropic', ok: false, error: '失敗' };
}

describe('オーケストレーション: 上位 3 件', () => {
  it('★ 失敗を除き、点の高い順・同点は観点の順', () => {
    const r = pickBestThree([
      scored('expert', 70, 'あいうえお かきくけこ'),
      scored('procedure', 90, 'さしすせそ たちつてと'),
      scored('risk', 0, '', false),
      scored('grounded', 70, 'なにぬねの はひふへほ'),
      scored('plain', 50, 'まみむめも やゆよ'),
    ]);
    expect(r.ranked.map((x) => x.strategy.id)).toEqual(['procedure', 'expert', 'grounded']);
    expect(r.ranked.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(r.failed).toBe(1);
    expect(r.shortfall).toBeNull();
  });

  it('★ 近い重複は畳み、次の候補を繰り上げる', () => {
    const same = 'インボイス制度の経過措置で控除できる割合は段階的に下がります';
    expect(contentSimilarity(same, `${same}。`)).toBeGreaterThanOrEqual(DUPLICATE_AT);
    const r = pickBestThree([
      scored('expert', 90, same),
      scored('procedure', 85, `${same}。`),
      scored('risk', 60, '全く別の観点: 取引先へ登録の有無を確かめる手順'),
      scored('grounded', 50, '参考ナレッジに無い部分は確証が見つかりません'),
    ]);
    expect(r.ranked.map((x) => x.strategy.id)).toEqual(['expert', 'risk', 'grounded']);
    expect(r.duplicates).toBe(1);
  });

  it('★ 3 件に満たなければ理由 (失敗・重複の件数) を言う', () => {
    const r = pickBestThree([scored('expert', 80, 'ひとつだけ'), scored('risk', 0, '', false)]);
    expect(r.ranked).toHaveLength(1);
    expect(r.shortfall).toContain('1 件');
    expect(r.shortfall).toContain('失敗 1 件');
  });
});

/** 観点ごとに違う回答を返す送り手。system から観点を読む。 */
function strategyEcho(): { send: SendChat; seen: { system: string; provider: string }[] } {
  const seen: { system: string; provider: string }[] = [];
  const send: SendChat = (req) => {
    seen.push({ system: req.system, provider: req.provider });
    const s = ANSWER_STRATEGIES.find((x) => req.system.includes(`「${x.label}」を担当`))!;
    return Promise.resolve({ ok: true, text: `${s.label}としての回答。${'内容'.repeat(20 + s.id.length)}\n- 要点 ${s.id}`, provider: req.provider || 'anthropic', model: 'm' });
  };
  return { send, seen };
}

const REQ = {
  question: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか',
  ragQuery: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか',
  turns: [{ role: 'user' as const, content: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか' }],
  catalog: [{ id: 'tax', label: '税務試算', description: '消費税・インボイスの試算' }],
  providerIds: ['anthropic'],
};

describe('走らせる: 7 つの lens を順に働かせ、回答者を並列に', () => {
  it('★ 観点の数だけ送り、どの system も基本方針・観点・会話を持つ', async () => {
    const { send, seen } = strategyEcho();
    const r = await runBestAnswers(REQ, send);
    expect(seen).toHaveLength(MAX_BEST_ANSWER_CALLS);
    for (const s of ANSWER_STRATEGIES) {
      expect(seen.some((x) => x.system.includes(`「${s.label}」を担当`)), `${s.label} の回答者が走っていない`).toBe(true);
    }
    for (const x of seen) expect(x.system.startsWith(ASSISTANT_BASE_INSTRUCTIONS)).toBe(true);
    expect(r.best.ranked).toHaveLength(3);
    expect(r.cancelled).toBe(false);
  });

  it(`★ 同時に走るのは ${BEST_ANSWERS_CONCURRENCY} つまで`, async () => {
    let inFlight = 0;
    let peak = 0;
    const send: SendChat = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { ok: true, text: `回答 ${peak}` };
    };
    await runBestAnswers(REQ, send);
    expect(peak).toBe(BEST_ANSWERS_CONCURRENCY);
  });

  it('★ 1 つの失敗 (断り・例外) は隔離し、伏字を通してから残す', async () => {
    const key = 'sk-ant-api03-' + 'A'.repeat(40);
    let n = 0;
    const send: SendChat = (req) => {
      n += 1;
      if (n === 1) return Promise.resolve({ ok: false, message: `401 key ${key} is invalid` });
      if (n === 2) return Promise.reject(new Error(`network down ${key}`));
      return strategyEcho().send(req);
    };
    const r = await runBestAnswers(REQ, send);
    const failed = r.candidates.filter((c) => !c.ok);
    expect(failed).toHaveLength(2);
    for (const f of failed) {
      expect(f.error, '失敗の文面が伏字を通っていない').not.toContain(key);
      // 標本: 伏字を通さなければ鍵が残る形だった (針が当たる)。
      expect(`401 key ${key} is invalid`).toContain(key);
    }
    expect(r.best.failed).toBe(2);
  });

  it('★ 取り消すと新しい送信を始めず、cancelled を返す', async () => {
    const ac = new AbortController();
    let calls = 0;
    const send: SendChat = async () => {
      calls += 1;
      ac.abort();
      return { ok: true, text: '最初の回答' };
    };
    const r = await runBestAnswers(REQ, send, { signal: ac.signal, concurrency: 1 });
    expect(calls).toBe(1);
    expect(r.cancelled).toBe(true);
  });

  it('★ 進み具合: lens は waiting → running → done と進み、最後は全部 done', async () => {
    const seen: BestAnswersProgress[] = [];
    await runBestAnswers(REQ, strategyEcho().send, { onProgress: (p) => seen.push(p) });
    const last = seen[seen.length - 1]!;
    expect(Object.values(last.lenses).every((s) => s === 'done')).toBe(true);
    expect(last.answered).toBe(last.total);
    for (const l of ENGINEERING_LENSES) {
      expect(seen.some((p) => p.lenses[l.id] === 'running' || p.lenses[l.id] === 'done'), `${l.id} が一度も働いていない`).toBe(true);
    }
  });
});

describe('チャットへ渡す形', () => {
  it('★ 見出し 1 つ + 順位ごとに 1 つ。見出しは 7 つの lens を全部名乗る', async () => {
    const r = await runBestAnswers(REQ, strategyEcho().send);
    const msgs = formatBestAnswers(r, (id) => (id === 'anthropic' ? 'Claude (Anthropic)' : id || '既定'));
    expect(msgs).toHaveLength(1 + r.best.ranked.length);
    for (const l of ENGINEERING_LENSES) expect(msgs[0]!.text, `${l.label} を名乗っていない`).toContain(l.label);
    expect(msgs[1]!.text).toContain('🥇 1 位');
    expect(msgs[2]!.text).toContain('🥈 2 位');
    expect(msgs[3]!.text).toContain('🥉 3 位');
    expect(msgs[1]!.servedBy).toBe('Claude (Anthropic)');
  });

  it('★ 既存の Markdown 描画が採点の表を表として読む (見出しの 1 行目は見出し)', async () => {
    const r = await runBestAnswers(REQ, strategyEcho().send);
    const msgs = formatBestAnswers(r, (id) => id);
    const blocks = parseMarkdown(msgs[1]!.text);
    expect(blocks[0]!.type).toBe('heading');
    expect(blocks.some((b) => b.type === 'table'), '採点が表として描かれない').toBe(true);
  });

  /**
   * **結果は裏で終わってから届く** —— その間に別の質問をしていても、見出しがどの質問への
   * 答えかを言う。改行を畳まないと見出しの行が切れ、残りが見出しの外へ出る。
   */
  it('★ 見出しはどの質問への答えかを言う (1 行に畳み、天井を掛ける)', async () => {
    const long = `1 行目の質問\n2 行目も続く ${'長い'.repeat(40)}`;
    const r = await runBestAnswers({ ...REQ, question: long }, strategyEcho().send);
    const head = formatBestAnswers(r, (id) => id)[0]!.text;
    const first = head.split('\n')[0]!;
    expect(first).toContain(`「${questionEcho(long)}」`);
    expect(first, '改行が見出しの行を切っている').toContain('1 行目の質問 2 行目も続く');
    expect(questionEcho(long).endsWith('…'), '天井を超えたのに切ったことを言わない').toBe(true);
    expect([...questionEcho(long)].length).toBe(QUESTION_ECHO_CHARS + 1);
    expect(parseMarkdown(head)[0]!.type, '見出しの 1 行目が見出しとして読まれない').toBe('heading');
    // 短い質問はそのまま (切ったと偽らない)。
    expect(questionEcho('  短い  質問 ')).toBe('短い 質問');
  });

  it('★ 応答できなかった回答者と、足りない理由を見出しに書く', async () => {
    let n = 0;
    const send: SendChat = (req) => {
      n += 1;
      return n <= 3 ? Promise.resolve({ ok: false, message: '設定済みの AI プロバイダがありません' }) : strategyEcho().send(req);
    };
    const r = await runBestAnswers(REQ, send);
    const head = formatBestAnswers(r, (id) => id)[0]!.text;
    expect(head).toContain('応答できなかった回答者');
    expect(head).toContain('設定済みの AI プロバイダがありません');
    expect(head).toContain('示せるのは 2 件');
  });
});
