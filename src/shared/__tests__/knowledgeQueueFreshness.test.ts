import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// scripts/knowledge-autopilot.cjs は CJS (Node スクリプト) 設計のため、テストだけが createRequire で読み込む。
const req = createRequire(import.meta.url);
const { corpusFingerprint, staleQueueReport } = req('../../../scripts/knowledge-autopilot.cjs') as {
  corpusFingerprint: (entries: unknown[]) => string;
  staleQueueReport: (
    queue: unknown,
    entries: unknown[],
  ) => { stale: boolean; reasons: string[]; missingIds: string[] };
};

type Entry = { collection: string; id: string; summary: string };
const academic: Entry = { collection: 'academic', id: 'a-1', summary: 'あいうえお' };
const compliance: Entry = { collection: 'compliance', id: 'c-1', summary: 'かきくけこ' };
const entries: Entry[] = [academic, compliance];
const freshQueue = (over: Record<string, unknown> = {}) => ({
  corpusFingerprint: corpusFingerprint(entries),
  queues: { enrich: [{ id: 'a-1', collection: 'academic', chars: 5 }], missingAsOf: [{ collection: 'academic', count: 3 }] },
  ...over,
});

describe('corpusFingerprint', () => {
  it('同じコーパスなら同じ指紋になる', () => {
    expect(corpusFingerprint(entries)).toBe(corpusFingerprint(entries));
  });

  it('項目の並び順には依存しない', () => {
    expect(corpusFingerprint([...entries].reverse())).toBe(corpusFingerprint(entries));
  });

  it('本文の長さが変わると指紋も変わる（増強を検出できる）', () => {
    const grown = [{ ...academic, summary: `${academic.summary}さ` }, compliance];
    expect(corpusFingerprint(grown)).not.toBe(corpusFingerprint(entries));
  });

  it('項目が消えると指紋も変わる（統合削除を検出できる）', () => {
    expect(corpusFingerprint([academic])).not.toBe(corpusFingerprint(entries));
  });

  it('id が変わると指紋も変わる', () => {
    expect(corpusFingerprint([{ ...academic, id: 'a-2' }, compliance])).not.toBe(corpusFingerprint(entries));
  });

  it('同じ id でもコレクションが違えば別物として数える', () => {
    expect(corpusFingerprint([{ ...academic, collection: 'compliance' }, compliance])).not.toBe(
      corpusFingerprint(entries),
    );
  });

  it('本文が無い項目でも落ちずに 0 字として扱う', () => {
    expect(() => corpusFingerprint([{ collection: 'academic', id: 'a-1' }])).not.toThrow();
  });
});

describe('staleQueueReport', () => {
  it('指紋が一致し実在 id だけを指していれば古くない', () => {
    const r = staleQueueReport(freshQueue(), entries);
    expect(r.stale).toBe(false);
    expect(r.reasons).toEqual([]);
    expect(r.missingIds).toEqual([]);
  });

  it('指紋が違えば古いと判定する', () => {
    const r = staleQueueReport(freshQueue({ corpusFingerprint: '0'.repeat(64) }), entries);
    expect(r.stale).toBe(true);
    expect(r.reasons).toContain('コーパス指紋が一致しない');
  });

  it('指紋が無い旧形式のキューも古いと判定する', () => {
    const q = freshQueue() as Record<string, unknown>;
    delete q.corpusFingerprint;
    const r = staleQueueReport(q, entries);
    expect(r.stale).toBe(true);
    expect(r.reasons).toContain('コーパス指紋が無い（旧形式のキュー）');
  });

  it('統合で消えた id を指していれば、その id を挙げて古いと判定する', () => {
    const q = freshQueue();
    q.queues.enrich.push({ id: 'gone-1', collection: 'academic', chars: 80 });
    const r = staleQueueReport(q, entries);
    expect(r.stale).toBe(true);
    expect(r.missingIds).toEqual(['gone-1']);
    expect(r.reasons).toContain('コーパスに存在しない id を 1 件参照している');
  });

  it('同じ欠番 id が複数のキューに現れても 1 件として数える', () => {
    const q = freshQueue();
    q.queues.enrich.push({ id: 'gone-1', collection: 'academic', chars: 80 });
    (q.queues as Record<string, unknown[]>).sourceHygiene = [{ id: 'gone-1' }];
    expect(staleQueueReport(q, entries).missingIds).toEqual(['gone-1']);
  });

  it('id を持たない項目（asOf 欠落の集計など）は欠番として数えない', () => {
    expect(staleQueueReport(freshQueue(), entries).missingIds).toEqual([]);
  });

  it('文字列だけが並ぶキューでも id として照合する', () => {
    const q = freshQueue();
    (q.queues as Record<string, unknown[]>).reverify = ['gone-2'];
    expect(staleQueueReport(q, entries).missingIds).toEqual(['gone-2']);
  });

  it('queues が無いキューでも落ちない', () => {
    expect(staleQueueReport({ corpusFingerprint: corpusFingerprint(entries) }, entries).stale).toBe(false);
  });

  it('配列でないキューは無視する', () => {
    const q = freshQueue({ queues: { enrich: 'これは配列ではない' } });
    expect(staleQueueReport(q, entries).stale).toBe(false);
  });

  it('読めないキュー（null）は古いと判定する', () => {
    expect(staleQueueReport(null, entries)).toEqual({ stale: true, reasons: ['キューが読めない'], missingIds: [] });
  });

  it('読めないキュー（文字列）も古いと判定する', () => {
    expect(staleQueueReport('壊れている', entries).stale).toBe(true);
  });
});
