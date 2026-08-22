import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import { isSafeSymbol as symMain, validateAdvisorJson as advMain } from '../stocks';
import { isSafeSymbol as symWeb } from '../../../renderer/data/stocksWatchlistWeb';
import { validateAdvisorJson as advWeb } from '../../../renderer/data/stocksAnalysisWeb';
import { parseSecurityKeys as keysMain } from '../security';
import { parseSecurityKeys as keysWeb } from '../../../renderer/data/saasWriteWeb';
import { extractJson as jsonMain, normalizeAnalysis as normMain } from '../emotions';
import { extractJson as jsonWeb, normalizeAnalysis as normWeb } from '../../../renderer/data/emotionsWeb';

/*
 * **デスクトップ版とブラウザ版で「同じ判断」を 2 度書いている関数**の突き合わせ。
 *
 * 2026-08-22 に main / renderer の両方で定義されている関数名を機械で洗ったら
 * 36 件あった。大半は株価指標 (sma / ema / rsi …) のような純計算だが、
 * security に関わるものが残っていて、そのうち検査が既にあったのは 3 つだけ
 * だった (`buildRfc2822` / `parseAtlassianToken` / `safeStateEquals`)。
 *
 * ここで足すのは残り 4 つ:
 *
 *   isSafeSymbol        銘柄記号の形の検査 (URL とマークアップに載る)
 *   parseSecurityKeys   HIBP / VirusTotal の**資格情報の解析**
 *   extractJson         **LLM の応答**から JSON を取り出す (信用できない入力)
 *   validateAdvisorJson LLM の応答を画面に載せてよい形へ絞る (株価側の写し)
 *   normalizeAnalysis   **LLM の応答**を画面の型へ丸める (範囲外の値を [0,1] に留める)
 *
 * `validateAdvisorJson` は **3 つ目の写し**である —— business 版とブラウザ版は
 * 別に `advisorValidationParity.test.ts` で突き合わせてある。
 *
 * 見るのは「同じ答えを返すか」だけ。例外の文言は側ごとに違ってよい。
 */

describe('isSafeSymbol — main とブラウザ版で一致する', () => {
  const CASES: unknown[] = [
    'AAPL',
    'aapl',
    '7203.T',
    'BRK-B',
    '^N225',
    'A',
    'A'.repeat(16),
    'A'.repeat(17),
    '',
    ' AAPL',
    'AAPL ',
    'AA PL',
    'AA/PL',
    'AA<PL',
    'AA"PL',
    'AA\\PL',
    'AA;PL',
    'AA%20PL',
    '../etc',
    'あ',
    null,
    undefined,
    42,
    {},
    [],
    true,
  ];
  it.each(CASES.map((v, i) => [i, v] as const))('#%i %o', (_i, v) => {
    expect(symWeb(v)).toBe(symMain(v));
  });

  it('「全部 false」で一致していない (通る側も在る)', () => {
    const accepted = CASES.filter((v) => symMain(v));
    expect(accepted.length).toBeGreaterThanOrEqual(6);
    expect(CASES.length - accepted.length).toBeGreaterThanOrEqual(15);
  });
});

describe('parseSecurityKeys — main とブラウザ版で一致する', () => {
  const CASES: string[] = [
    '',
    'raw-key',
    '{"hibp":"h","vt":"v"}',
    '{"hibp":"h"}',
    '{"vt":"v"}',
    '{}',
    '{"hibp":""}',
    '{"hibp":123}',
    '{"hibp":null}',
    '{"hibp":{"a":1}}',
    'null',
    '[]',
    '[1,2]',
    '123',
    '"just-a-string"',
    'true',
    '{broken',
    '   ',
  ];
  it.each(CASES)('%j', (raw) => {
    expect(keysWeb(raw)).toEqual(keysMain(raw));
  });

  it('鍵を取り出せる場合も一致している (空虚に {} 同士で揃っていない)', () => {
    expect(keysMain('{"hibp":"h","vt":"v"}')).toEqual({ hibp: 'h', vt: 'v' });
    expect(keysWeb('{"hibp":"h","vt":"v"}')).toEqual({ hibp: 'h', vt: 'v' });
  });
});

describe('extractJson — main とブラウザ版で一致する (LLM 応答の取り出し)', () => {
  const FENCE = '```';
  const CASES: string[] = [
    '{"a":1}',
    '  {"a":1}  ',
    `${FENCE}json\n{"a":1}\n${FENCE}`,
    `${FENCE}\n{"a":1}\n${FENCE}`,
    `まえがき\n${FENCE}json\n{"a":1}\n${FENCE}\nあとがき`,
    `${FENCE}json\n{"a":1}\n${FENCE}\n${FENCE}json\n{"b":2}\n${FENCE}`,
    `${FENCE}json{"a":1}${FENCE}`,
    `${FENCE}json\n${FENCE}`,
    `${FENCE}json\n\n${FENCE}`,
    `${FENCE} json\n{"a":1}\n${FENCE}`,
    'no fence at all',
    '',
    '   ',
  ];
  it.each(CASES)('%j', (text) => {
    expect(jsonWeb(text)).toBe(jsonMain(text));
  });

  it('囲みを剥がす側も一致している (素通し同士で揃っていない)', () => {
    const fenced = `${FENCE}json\n{"a":1}\n${FENCE}`;
    expect(jsonMain(fenced)).toBe('{"a":1}');
    expect(jsonWeb(fenced)).toBe('{"a":1}');
  });
});

describe('validateAdvisorJson (株価) — main とブラウザ版で同じ判断をする', () => {
  const ALLOWED = new Set(['AAPL', 'MSFT']);
  const rec = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    symbol: 'AAPL',
    rank: 1,
    rationale: '理由',
    riskFactors: ['risk'],
    ...over,
  });
  const wrap = (r: unknown): unknown => ({ recommendations: [r] });
  const accepts = (f: (raw: unknown, a: ReadonlySet<string>) => unknown, raw: unknown): boolean => {
    try {
      f(raw, ALLOWED);
      return true;
    } catch {
      return false;
    }
  };

  const CASES: [string, unknown][] = [
    ['正当な 1 件', wrap(rec())],
    ['オブジェクトでない', 'nope'],
    ['null', null],
    ['recommendations が無い', {}],
    ['recommendations が配列でない', { recommendations: 'x' }],
    ['recommendations が空', { recommendations: [] }],
    ['6 件 (境界・弾く)', { recommendations: [rec(), rec(), rec(), rec(), rec(), rec()] }],
    ['5 件 (境界・通す)', { recommendations: [rec(), rec(), rec(), rec(), rec()] }],
    ['entry がオブジェクトでない', wrap('x')],
    ['symbol が許可外', wrap(rec({ symbol: 'NOPE' }))],
    ['symbol が文字列でない', wrap(rec({ symbol: 7 }))],
    ['symbol がプロトタイプ側の名前', wrap(rec({ symbol: 'constructor' }))],
    ['rank が数値でない', wrap(rec({ rank: '1' }))],
    ['rank が 0', wrap(rec({ rank: 0 }))],
    ['rank が NaN', wrap(rec({ rank: Number.NaN }))],
    ['rationale が空', wrap(rec({ rationale: '' }))],
    ['rationale が文字列でない', wrap(rec({ rationale: 1 }))],
    ['riskFactors が配列でない', wrap(rec({ riskFactors: 'x' }))],
    ['riskFactors が空', wrap(rec({ riskFactors: [] }))],
    ['riskFactor が空文字', wrap(rec({ riskFactors: [''] }))],
    ['riskFactor が文字列でない', wrap(rec({ riskFactors: [1] }))],
  ];

  it.each(CASES)('%s', (_label, raw) => {
    expect(accepts(advWeb as never, raw)).toBe(accepts(advMain as never, raw));
  });

  it('「全部弾く」で一致していない (通す側も在る)', () => {
    const accepted = CASES.filter(([, raw]) => accepts(advMain as never, raw));
    expect(accepted.length).toBeGreaterThanOrEqual(2);
    expect(CASES.length - accepted.length).toBeGreaterThanOrEqual(15);
  });
});

describe('normalizeAnalysis — main とブラウザ版で一致する (LLM 応答の丸め)', () => {
  const CASES: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['空オブジェクト', {}],
    ['文字列', 'nope'],
    ['数値', 7],
    ['配列', []],
    ['scores が無い', { sentiment: 'positive' }],
    ['scores が配列', { scores: [] }],
    ['scores が文字列', { scores: 'x' }],
    ['ふつうの応答', { scores: { joy: 0.8, anger: 0.1 }, sentiment: 'positive', dominant: 'joy' }],
    ['スコアが範囲外 (上)', { scores: { joy: 5 } }],
    ['スコアが範囲外 (下)', { scores: { joy: -3 } }],
    ['スコアが数値でない', { scores: { joy: 'たくさん' } }],
    ['スコアが NaN', { scores: { joy: Number.NaN } }],
    ['スコアが Infinity', { scores: { joy: Number.POSITIVE_INFINITY } }],
    ['スコアが数値文字列', { scores: { joy: '0.5' } }],
    ['全部 0', { scores: { joy: 0, anger: 0, sadness: 0 } }],
    ['sentiment が未知', { sentiment: 'ecstatic' }],
    ['sentiment が数値', { sentiment: 1 }],
    ['sentiment が negative', { sentiment: 'negative' }],
    ['dominant が未知', { scores: { joy: 0.5 }, dominant: 'nope' }],
    ['dominant が数値', { scores: { joy: 0.5 }, dominant: 3 }],
    ['dominant が mixed', { scores: { joy: 0.5 }, dominant: 'mixed' }],
    ['dominant がプロトタイプ側の名前', { scores: { joy: 0.5 }, dominant: 'constructor' }],
    ['同点', { scores: { joy: 0.5, anger: 0.5 } }],
  ];

  it.each(CASES)('%s', (_label, raw) => {
    expect(normWeb(raw)).toEqual(normMain(raw));
  });

  it('丸めが効いている (素通し同士で揃っていない)', () => {
    const out = normMain({ scores: { joy: 5 } }) as { scores: Record<string, number> };
    expect(out.scores.joy).toBe(1);
    const low = normMain({ scores: { joy: -3 } }) as { scores: Record<string, number> };
    expect(low.scores.joy).toBe(0);
  });
});
