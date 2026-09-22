/**
 * **「誰も解析していない」を「きれい」と言わない。** (2026-09-22 · パス 403)
 *
 * ## 見つけた欠陥 (実測 2026-09-22 · 直す前)
 *
 * | VirusTotal の応答 | positives / total | 画面の帯 |
 * | --- | --- | --- |
 * | **解析が未完了 (0 エンジン)** | **0 / 0** | **`badge ok` (緑)**「0 / 0 エンジン検出」 |
 * | きれい (70 エンジンが無害) | 0 / 75 | `badge ok` (緑)「0 / 75 エンジン検出」 |
 * | 1 件検出 | 1 / 75 | `badge warn` |
 *
 * **「誰も調べていない」と「75 台が調べて何も出なかった」が同じ緑の帯**で、違いは
 * 利用者が安全の合図として読まない `total` の数字だけだった。
 *
 * ## これは異常な応答ではなく、新しい URL の通常の経路である
 *
 * `security/scan-url` は **POST `/urls` で解析を投入してから GET でレポートを読む**
 * (`vtSubmitInit` → `vtReportPath`)。VirusTotal がその URL を初めて見たときは解析が
 * 待ち行列に入っただけなので、`last_analysis_stats` は 4 欄とも 0 で返る。
 *
 * ## パス 261 の網は通り抜ける
 *
 * `vtScanStats` は 4 欄を 1 つずつ要求し、欠けていれば断る (「数えられなかったことを
 * 数え上げてはいけない」)。**4 欄とも在って値が 0** はその網を通る —— 欄の欠落と
 * 「エンジンが 0 台」は別の状態である。
 *
 * ## 直し
 *
 * 判定・札・重さ・文を `describeScan` **ただ 1 つ**から返す (パス 386 / 402 と同じ形)。
 * しきい値 (0 / 1〜2 / 3 以上) も画面の className と style から 1 か所へ移した。
 */
import { describe, expect, it } from 'vitest';
import { describeScan, summarizeVtReport, type ScanVerdict } from '../api/security';

const URL_ = 'https://example.com/x';
const report = (stats: Record<string, number>): unknown => ({
  data: { attributes: { last_analysis_stats: stats } },
});
const stats = (harmless: number, malicious: number, suspicious = 0, undetected = 0) => ({
  harmless,
  malicious,
  suspicious,
  undetected,
});

describe('スキャンの判定 — 0 件検出には 2 つの意味が在る', () => {
  it('★ 解析が未完了 (0 エンジン) は「きれい」ではない —— 緑にしない', () => {
    const s = summarizeVtReport(URL_, report(stats(0, 0)));
    expect(s, '4 欄とも 0 はパス 261 の網を通る (欄は在る)').toMatchObject({ positives: 0, total: 0 });

    const d = describeScan(s);
    expect(d.verdict).toBe('unscanned');
    expect(d.level, '緑にしてはいけない').not.toBe('ok');
    expect(d.label, '札が「0 / 0 エンジン検出」のままだと、きれいな結果と見分けが付かない').not.toBe(
      '0 / 0 エンジン検出',
    );
    expect(d.note).toContain('まだどのエンジンも解析していません');
    expect(d.note, '「安全」と読まれないことを明示する').toContain('「安全」を意味しません');
  });

  it('★ 70 エンジンが解析して検出 0 件は「きれい」(緑)', () => {
    const d = describeScan(summarizeVtReport(URL_, report(stats(70, 0, 0, 5))));
    expect(d.verdict).toBe('clean');
    expect(d.level).toBe('ok');
    expect(d.label).toBe('0 / 75 エンジン検出');
  });

  it('★ 未解析ときれいは、札も文も重さも別物 (見分けが付く)', () => {
    const un = describeScan({ positives: 0, total: 0 });
    const clean = describeScan({ positives: 0, total: 75 });
    expect(un.label).not.toBe(clean.label);
    expect(un.note).not.toBe(clean.note);
    expect(un.level).not.toBe(clean.level);
  });

  it('検出が在れば件数で重さが決まる (しきい値はここ 1 か所)', () => {
    expect(describeScan({ positives: 1, total: 75 }).verdict).toBe('few-detections');
    expect(describeScan({ positives: 2, total: 75 }).verdict).toBe('few-detections');
    expect(describeScan({ positives: 3, total: 75 }).verdict).toBe('many-detections');
    expect(describeScan({ positives: 3, total: 75 }).level).toBe('danger');
    expect(describeScan({ positives: 1, total: 75 }).level).toBe('warn');
  });

  it('★ 検出が在れば、解析したエンジン数に関わらず「検出」である (順序が先)', () => {
    // total が 0 のまま positives が立つ応答は今日来ないが、来たら「未解析」と
    // 言ってはいけない —— 検出の側が先に答える。
    const d = describeScan({ positives: 1, total: 0 });
    expect(d.verdict).toBe('few-detections');
    expect(d.level).not.toBe('ok');
  });

  it('★ 4 つの判定はどれも空でなく、札・文が互いに重ならない', () => {
    const samples: { v: ScanVerdict; s: { positives: number; total: number } }[] = [
      { v: 'unscanned', s: { positives: 0, total: 0 } },
      { v: 'clean', s: { positives: 0, total: 75 } },
      { v: 'few-detections', s: { positives: 1, total: 75 } },
      { v: 'many-detections', s: { positives: 9, total: 75 } },
    ];
    const seen = new Set<string>();
    for (const { v, s } of samples) {
      const d = describeScan(s);
      expect(d.verdict, JSON.stringify(s)).toBe(v);
      for (const [face, text] of [
        ['label', d.label],
        ['note', d.note],
      ] as const) {
        expect(text, `${v}.${face}`).not.toBe('');
        expect(seen.has(text), `${v}.${face} が他の判定と同じ文面`).toBe(false);
        seen.add(text);
      }
    }
    expect(seen.size).toBe(samples.length * 2);
  });

  it('対照: 緑 (ok) になるのは「エンジンが 1 台以上あって検出 0」だけ', () => {
    let green = 0;
    for (const total of [0, 1, 2, 75]) {
      for (const positives of [0, 1, 5]) {
        if (positives > total && total > 0) continue;
        const d = describeScan({ positives, total });
        if (d.level === 'ok') {
          green += 1;
          expect(positives, `緑なのに検出 ${positives}`).toBe(0);
          expect(total, '緑なのにエンジン 0 台').toBeGreaterThan(0);
        }
      }
    }
    expect(green, '緑になった標本 (走査が空虚でない床)').toBeGreaterThanOrEqual(3);
  });
});
