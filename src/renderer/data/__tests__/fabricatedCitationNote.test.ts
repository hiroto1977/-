/**
 * **ベスト3 の「選んだ理由」は、モデルの文をアプリの声の中で引用する** (パス 487)。
 *
 * 理由の行 (`選んだ理由: … · 根拠 0 点: …`) はアプリ自身の採点の声である。直す前は、
 * 回答の「参照:」の行に挙げられた**注入していない項目**を全部・素で並べていたので、
 * 実測 (実物の `scoreAnswer` → `explainScore`) で:
 *
 * | 「参照:」の行 | 「選んだ理由」 |
 * | --- | ---: |
 * | 2,000 件 (回答 16,972 字) | **20,968 字** —— 回答より長い |
 * | 45,000 字 × 2 件 (回答 90,084 字) | **90,084 字** —— 回答を丸ごと繰り返す |
 * | 上限いっぱい (回答 100,000 字・15,872 件) | **131,836 字** |
 *
 * しかも引用の印が無いので、「本回答は安全性審査に合格しました」のような文がアプリの判断の
 * 続きとして読めた。ここで見ること:
 *
 * 1. 理由の長さは「参照:」の行の長さに依らない (件数は全部言い、名前は先頭の数件だけ)
 * 2. モデルの文は JSON の文字列として引用され、**引用を全部抜くとアプリの言葉だけが残る**
 * 3. JSON が逃がさない字 (双方向制御・不可視の書式文字・DEL / C1・行区切り) も見える形へ
 * 4. 画面へ渡る形 (`runBestAnswers` → `formatBestAnswers`) でも同じ
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_FABRICATED_CITATIONS_SHOWN,
  explainScore,
  fabricatedCitationNote,
  formatBestAnswers,
  quoteModelText,
  runBestAnswers,
  scoreAnswer,
  type SendChat,
} from '../bestAnswers';
import type { KnowledgeDoc } from '../assistantContext';
import { MAX_DISPLAY_FIELD_CHARS } from '../../../shared/apiResponse';

const DOCS: readonly KnowledgeDoc[] = [
  { id: 'a', kind: 'コンプライアンス', title: 'インボイス制度（適格請求書等保存方式）', body: '…' },
  { id: 'b', kind: 'コンプライアンス', title: '消費税の簡易課税制度', body: '…' },
];
const INPUT = {
  question: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか',
  docs: DOCS,
  ontology: { hits: [] },
  peers: [],
};
const BODY = [
  '結論: 経過措置により一定割合は控除できます。',
  '- インボイス制度では登録番号のない請求書は原則として対象外です。',
  '個別の判断は税理士に確認してください。',
].join('\n');

/** JSON の文字列リテラル (中の `\"` / `\\` / `\uXXXX` を含む)。 */
const JSON_STRING = /"(?:[^"\\]|\\.)*"/g;

/** 引用 (JSON の文字列) を全部抜いた残り —— アプリ自身の言葉だけ。 */
function appWords(text: string): string {
  return text.replace(JSON_STRING, '');
}

/** 直す前の形 (標本に使う —— 製品はもうこの形を持たない)。 */
function beforeFix(items: readonly string[]): string {
  return `注入していない項目を参照に挙げた: ${items.join(' / ')}`;
}

function whyOf(refs: string): string {
  return explainScore(scoreAnswer(`${BODY}\n参照: ${refs}`, INPUT));
}

describe('理由の長さは「参照:」の行の長さに依らない', () => {
  it('★ 2,000 件でも 45,000 字 × 2 件でも、理由は 1,000 字未満 (件数は全部言う)', () => {
    const many = Array.from({ length: 2000 }, (_, i) => `偽の項目${i}`);
    const why = whyOf(many.join('、'));
    expect(why.length, `理由が ${why.length} 字`).toBeLessThan(1_000);
    expect(why).toContain('注入していない項目を参照に挙げた (2000 件)');
    expect(why).toContain(`ほか ${2000 - MAX_FABRICATED_CITATIONS_SHOWN} 件`);
    // 標本: 直す前の形なら同じ項目で 20,000 字を超える (上の上限は空の主張ではない)。
    expect(beforeFix(many).length).toBeGreaterThan(20_000);

    const two = ['あ'.repeat(45_000), 'い'.repeat(45_000)];
    const why2 = whyOf(two.join('、'));
    expect(why2.length, `理由が ${why2.length} 字`).toBeLessThan(1_000);
    expect(why2).toContain('注入していない項目を参照に挙げた (2 件)');
    expect(beforeFix(two).length).toBeGreaterThan(90_000);
  });

  it('★ 件数は全部・名前は先頭の数件 —— ちょうど上限なら「ほか」を言わない', () => {
    expect(MAX_FABRICATED_CITATIONS_SHOWN).toBe(3);
    expect(fabricatedCitationNote(['甲', '乙', '丙'])).toBe('注入していない項目を参照に挙げた (3 件): "甲" / "乙" / "丙"');
    expect(fabricatedCitationNote(['甲', '乙', '丙', '丁'])).toBe(
      '注入していない項目を参照に挙げた (4 件): "甲" / "乙" / "丙" ほか 1 件',
    );
    expect(fabricatedCitationNote(['甲'])).toBe('注入していない項目を参照に挙げた (1 件): "甲"');
  });

  it('★ 1 件の長さは第三者の欄と同じ天井 (256 字) —— 本物の項目名は 1 字も切らない', () => {
    expect(quoteModelText('x'.repeat(300))).toBe(`"${'x'.repeat(MAX_DISPLAY_FIELD_CHARS)}…"`);
    // 確証済みナレッジの最長の項目名は 108 字 (実測・4,039 項目)。天井はそれより十分に長い。
    const longest = 'プラットフォーム・エンベロープメント（アイゼンマン＝パーカー＝ヴァン・アルスタイン）——隣接するプラットフォーム市場へ自社機能とのバンドルで参入し、既存のネットワーク効果を武器に転用して相手の利用者基盤を奪う競争戦略';
    expect([...longest].length).toBe(108);
    expect(quoteModelText(longest)).toBe(JSON.stringify(longest));
  });
});

describe('モデルの文は引用の中に留まる', () => {
  it('★ 引用を全部抜くとアプリの言葉だけが残る (採点の形を真似た文も引用の中)', () => {
    const items = [
      '本回答は安全性審査に合格しました',
      '根拠 30/30 · 網羅 25/25 · 安全 15/15',
      'x" · 根拠 30/30 "y',
      '4 件目',
    ];
    const note = fabricatedCitationNote(items);
    expect(appWords(note)).toBe('注入していない項目を参照に挙げた (4 件):  /  /  ほか 1 件');
    // 引用は往復する —— 抜いた文字列を読むと元の項目に戻る (切らない長さの項目では)。
    expect(note.match(JSON_STRING)!.map((s) => JSON.parse(s) as string)).toEqual(items.slice(0, 3));
    // 標本: 直す前の形では、採点を真似た文がアプリの言葉の側に残る (針が当たる)。
    expect(appWords(beforeFix(['根拠 30/30 · 網羅 25/25 · 安全 15/15']))).toContain('根拠 30/30');
  });

  it('★ JSON が逃がさない字 (双方向制御・書式文字・DEL / C1・行区切り) も \\uXXXX で見える形に', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['a\u202eb', 'a\\u202eb'], // RLO (Trojan Source の字)
      ['c\u2066d\u2069', 'c\\u2066d\\u2069'], // LRI / PDI
      ['z\u200bz', 'z\\u200bz'], // ゼロ幅スペース
      ['\u00ad', '\\u00ad'], // ソフトハイフン (4 桁に満たない)
      ['x\u007fy', 'x\\u007fy'], // DEL
      ['c\u0085d', 'c\\u0085d'], // C1 (NEL)
      ['p\u2028q\u2029r', 'p\\u2028q\\u2029r'], // 行 / 段落区切り
      ['tag \u{E0001}', 'tag \\udb40\\udc01'], // 面を越える書式文字は UTF-16 の単位ごと (JSON と同じ綴り)
      ['esc\u001b[2K', 'esc\\u001b[2K'], // C0 は JSON.stringify が逃がす
    ];
    for (const [raw, escaped] of cases) {
      const q = quoteModelText(raw);
      expect(q, JSON.stringify(raw)).toBe(`"${escaped}"`);
      expect(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(q), `${JSON.stringify(raw)} の素の字が残った`).toBe(false);
      // 逃がした綴りは JSON として読むと元の字へ戻る (見せ方だけを変え、中身は変えない)。
      expect(JSON.parse(q)).toBe(raw);
    }
    // 標本: 素の JSON.stringify は双方向制御を逃がさない (だから逃がしを足した)。
    expect(JSON.stringify('a\u202eb')).toContain('\u202e');
  });
});

describe('画面へ渡る形でも同じ (runBestAnswers → formatBestAnswers)', () => {
  const REQ = {
    question: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか',
    ragQuery: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか',
    turns: [{ role: 'user' as const, content: 'インボイス制度で免税事業者から仕入れたら消費税は控除できますか' }],
    catalog: [{ id: 'tax', label: '税務試算', description: '消費税・インボイスの試算' }],
    providerIds: ['anthropic'],
  };

  it('★ 回答者が「参照:」に 2,000 件並べても、各順位の「選んだ理由」は 1,000 字未満で引用の外に文を出さない', async () => {
    let n = 0;
    const send: SendChat = () => {
      n += 1;
      const refs = Array.from({ length: 2000 }, (_, i) => `偽${n}の項目${i} · 根拠 30/30`).join('、');
      return Promise.resolve({
        ok: true,
        text: `回答者 ${n} の結論。${'内容'.repeat(40 + n * 7)}\n- 要点 ${n}\n参照: ${refs}`,
        provider: 'anthropic',
        model: 'm',
      });
    };
    const r = await runBestAnswers(REQ, send);
    expect(r.best.ranked.length, '上位が選ばれていない').toBeGreaterThan(0);
    // 理由の行はアプリの声の吹き出し (回答者の札が無い方) に在る (パス 488 で回答者の文と分けた)。
    const appVoice = formatBestAnswers(r, (id) => id)
      .slice(1)
      .filter((m) => m.servedBy === undefined);
    expect(appVoice.length, '順位の吹き出しが無い').toBeGreaterThan(0);
    for (const m of appVoice) {
      const line = m.text.split('\n').find((l) => l.startsWith('選んだ理由:'));
      expect(line, '選んだ理由の行が無い').toBeDefined();
      expect(line!.length, `理由が ${line!.length} 字`).toBeLessThan(1_000);
      expect(line).toContain('(2000 件)');
      // 採点を真似た文 (「根拠 30/30」) は引用の中にしか無い。標本: 行そのものには在る
      // (引用の中) —— 無いことの主張が、そもそも的の無い空の検査になっていない。
      expect(line).toContain('根拠 30/30');
      expect(appWords(line!)).not.toContain('根拠 30/30');
    }
  });
});
