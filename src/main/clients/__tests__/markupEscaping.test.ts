import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import { exportTeamRadarSvgImpl } from '../teamradar';
import { renderBusinessDashboardHtml } from '../business';

/*
 * **書き出す markup へ、利用者やモデル由来の文字列が生のまま載らないか。**
 *
 * ## なぜ*振る舞い*で見るのか —— 字面の規則は作れなかった
 *
 * 「markup の中の `${}` は全部 `escapeXml` を通すこと」を規則にしようとして、
 * 先に**誤検知の量を数えた**:
 *
 * ```
 *   エスケープ済み : 119 件
 *   素の補間       : 632 件   ← 大半は数値 (W / H / W / 2) と計算値と
 *                              `safeColor` 済みの色
 * ```
 *
 * **受理すべき対象が 632 件ある規則は作らない** —— 鳴らし続けて無視される
 * のが最悪の結末である (このリポジトリが繰り返し書いている判断)。
 * 型を追えば絞れるが、そのために AST の依存を足すのは釣り合わない。
 *
 * 代わりに**敵性入力を通して出口を見る**。こちらは対象が「書き出す物」に
 * 限られるので、数え上げではなく実測で足りる。
 *
 * ## ここで足すのは 2 つ (2026-08-23)
 *
 * markup を組み立てるのは 7 ファイルあり、5 つは既に押さえてあった
 * (`templateParamsParity` / `stocks` の 2 つのダッシュボード / `web-templates`)。
 * **押さえていなかったのがこの 2 つ** ——
 *
 *   `teamradar` の SVG 書き出し … payload の `title` がそのまま SVG へ載る
 *   `business` のダッシュボード … LLM の応答 (summary / rationale /
 *                                  actionItems / riskFactors) が HTML へ載る
 *
 * 実測の結果**どちらも正しくエスケープしていた**。ここで留めるのは、
 * 消えたときに気づくため。
 */

/** `</title>` で閉じてから開くので、素通しなら確実にタグとして効く。 */
const XSS = '</title><script>alert(1)</script>';
const ATTR = '" onload="alert(1)';

describe('teamradar の SVG 書き出し', () => {
  const run = async (title: unknown): Promise<string> => {
    let written = '';
    await exportTeamRadarSvgImpl(
      {
        token: '',
        payload: { path: `${os.homedir()}/.local/business-hub/data/probe.svg`, title },
      } as never,
      {
        writeFile: async (_p: string, c: string) => {
          written = c;
        },
        mkdir: async () => {},
        now: () => new Date('2026-01-01T00:00:00.000Z'),
      },
    );
    return written;
  };

  it('payload の title が生のタグとして出ない', async () => {
    const svg = await run(XSS);
    expect(svg.length, '書き出しが走っていない — 検査が的を外している').toBeGreaterThan(50);
    expect(svg).not.toContain('<script>');
  });

  it('payload の title が属性から抜け出さない', async () => {
    expect(await run(ATTR)).not.toContain('onload="alert');
  });

  /* 対照 —— ふつうの題名はそのまま (何も出ない経路を見ていない)。 */
  it('対照: ふつうの題名は SVG に載る', async () => {
    expect(await run('チーム状況')).toContain('チーム状況');
  });
});

describe('business のダッシュボード', () => {
  const render = (bad: string): string =>
    renderBusinessDashboardHtml({
      snapshot: {
        units: [
          {
            id: bad,
            label: bad,
            current: { revenue: 1, totalCost: 1, profit: 1, profitMargin: 0.1, contentOutput: 1 },
            history: [{ month: '2026-01', revenue: 1 }],
          },
        ],
        aggregate: { revenue: 1, totalCost: 1, profit: 1, profitMargin: 0.1, contentOutput: 1 },
        fetchedAt: '2026-01-01',
        isMock: true,
      },
      advisorResult: {
        summary: bad,
        recommendations: [
          { categoryId: 'ec', rank: 1, rationale: bad, actionItems: [bad], riskFactors: [bad] },
        ],
        disclaimer: bad,
      },
      generatedAt: '2026-01-01T00:00:00.000Z',
    } as never);

  it('LLM 応答と単位名が生のタグとして出ない', () => {
    const html = render(XSS);
    expect(html.length).toBeGreaterThan(100);
    expect(html).not.toContain('<script>');
  });

  it('LLM 応答が属性から抜け出さない', () => {
    expect(render(ATTR)).not.toContain('onload="alert');
  });

  it('対照: ふつうの文字列はそのまま載る', () => {
    expect(render('売上が伸びています')).toContain('売上が伸びています');
  });
});
