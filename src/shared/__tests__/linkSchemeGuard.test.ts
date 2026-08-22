import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// scripts/knowledge-autopilot.cjs は CJS (Node スクリプト) 設計のため、テストだけが createRequire で読み込む。
const req = createRequire(import.meta.url);
const { isCheckableUrl } = req('../../../scripts/knowledge-autopilot.cjs') as {
  isCheckableUrl: (url: unknown) => boolean;
};

/*
 * 出典 URL の死活検査は「取りに行く先をデータが決める」唯一の経路。
 *
 * 実測 (2026-08-22, Node 22 / undici):
 *   file:///etc/hostname → throw     (読めはしない)
 *   data:text/plain,hi   → status 200 ← **出典が永久に「生きている」と誤報される**
 *   ftp://example.test/  → throw
 *
 * つまり `data:` を素通しにすると、リンク切れ検査の目的そのものが無効になる。
 * ここが緩んでも週次ワークフローは緑のままなので、機械で固定する。
 */
describe('isCheckableUrl (出典 URL の死活検査に出す前の関門)', () => {
  it('https は通す', () => {
    expect(isCheckableUrl('https://www.nta.go.jp/taxes/index.htm')).toBe(true);
  });

  it('http も通す (コーパスに 22 件ある。平文だが取得は可能)', () => {
    expect(isCheckableUrl('http://example.jp/x')).toBe(true);
  });

  it('data: は通さない — fetch が 200 を返すので「生きている」と誤報する', () => {
    expect(isCheckableUrl('data:text/plain,hi')).toBe(false);
  });

  it.each([
    ['file:///etc/hostname', 'ローカルファイル'],
    ['ftp://example.test/', 'ftp'],
    ['javascript:alert(1)', 'javascript'],
    ['blob:https://example.test/abc', 'blob'],
  ])('%s は通さない (%s)', (url) => {
    expect(isCheckableUrl(url)).toBe(false);
  });

  it.each([
    ['', '空文字'],
    ['not a url', 'URL として解釈できない'],
    ['//example.test/x', 'スキーム無しの相対形'],
  ])('%s は通さない (%s)', (url) => {
    expect(isCheckableUrl(url)).toBe(false);
  });

  it('文字列でない値は通さない', () => {
    for (const v of [null, undefined, 0, {}, ['https://a.example/']]) {
      expect(isCheckableUrl(v)).toBe(false);
    }
  });

  it('大文字スキームも正しく判定する (URL が正規化する)', () => {
    expect(isCheckableUrl('HTTPS://example.test/x')).toBe(true);
    expect(isCheckableUrl('DATA:text/plain,x')).toBe(false);
  });

  it('コーパスの出典 URL は全件が関門を通る (今日は 1 件も落とさない)', () => {
    const kc = req('../../../orchestration/knowledge-context.cjs') as {
      loadEntries: () => { sources?: { url?: string }[] }[];
    };
    const urls = new Set<string>();
    for (const e of kc.loadEntries()) {
      for (const s of e.sources ?? []) if (s.url) urls.add(s.url);
    }
    expect(urls.size).toBeGreaterThan(10000);
    const rejected = [...urls].filter((u) => !isCheckableUrl(u));
    expect(rejected).toEqual([]);
  });
});

/*
 * 関門を持っているだけでは足りない。**呼び出し側が本当に通しているか**を見る。
 * 上の describe は `isCheckableUrl` 単体しか見ないので、`checkLinks` の中で
 * 判定を外しても 13 件は全部通ってしまう (対照実験で確認)。
 */
describe('checkLinks が関門を実際に通していること', () => {
  const { checkLinks } = req('../../../scripts/knowledge-autopilot.cjs') as {
    checkLinks: (
      entries: { id: string; sources: { url: string }[] }[],
      today: Date,
      shardSize: number,
    ) => Promise<{ checked: number; dead: unknown[]; suspect: { url: string; status: unknown }[] }>;
  };

  /** fetch を差し替えて「何を取りに行ったか」を記録する。 */
  async function run(urls: string[]) {
    const attempted: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      attempted.push(String(input));
      return { status: 200 } as Response;
    }) as typeof fetch;
    try {
      const entries = urls.map((url, i) => ({ id: `e${i}`, sources: [{ url }] }));
      const res = await checkLinks(entries, new Date('2026-08-22T00:00:00Z'), urls.length);
      return { attempted, res };
    } finally {
      globalThis.fetch = original;
    }
  }

  it('data: URL は fetch されず、unsupported-scheme として報告される', async () => {
    const { attempted, res } = await run(['data:text/plain,hi']);
    expect(attempted).toEqual([]);
    expect(res.suspect).toEqual([
      { url: 'data:text/plain,hi', id: 'e0', status: 'unsupported-scheme' },
    ]);
  });

  it('https URL は fetch される', async () => {
    const { attempted, res } = await run(['https://example.test/x']);
    expect(attempted).toEqual(['https://example.test/x']);
    expect(res.suspect).toEqual([]);
    expect(res.dead).toEqual([]);
  });

  it('混在しても、通すものだけを取りに行く', async () => {
    const { attempted, res } = await run([
      'https://a.example/x',
      'file:///etc/hostname',
      'https://b.example/y',
    ]);
    expect(attempted.sort()).toEqual(['https://a.example/x', 'https://b.example/y']);
    expect(res.suspect.map((s) => s.url)).toEqual(['file:///etc/hostname']);
    // 弾いたものも「検査した」件数には数える (シャードの進み方を変えないため)。
    expect(res.checked).toBe(3);
  });
});
