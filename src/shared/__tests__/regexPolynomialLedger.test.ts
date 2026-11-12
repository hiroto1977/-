/**
 * **`lint:regex` が「指数だけ」を門にする理由を、実物と突き合わせる** (2026-09-20 · パス 337)。
 *
 * あの門は多項式 (O(n²)) を意図して外している。その判断は正しいが、
 * 2026-09-20 まで**書かれていた理由が実測と食い違っていた**:
 *
 * > このリポジトリの入力は上限が掛かっており (`MAX_ANALYZE_TEXT_CHARS` 5000、
 * > `MAX_MOOD_NOTE_CHARS` 2000 等)、その長さでの O(n²) は 30ms 程度で
 * > 画面は止まらない。
 *
 * **5000 はこのリポジトリで最大の上限ではない。** 実測 (2026-09-20):
 *
 * ```
 *   MAX_TEXT_PREVIEW_CHARS      200,000   ← 最大。取り込んだファイルの本文
 *   MAX_ASSISTANT_REPLY_CHARS   100,000     モデルの応答
 *   MAX_TOKEN_INPUT_CHARS        65,536     資格情報の入口
 *   MAX_ANALYZE_TEXT_CHARS        5,000   ← 上の文が挙げていた数
 * ```
 *
 * その最大の長さで測ると、O(n²) の式は **30ms ではなく 1 呼び出し 31 秒**かかる
 * (`npm run audit:regex-poly` の実測)。**長さの議論としては premise が偽**だった。
 *
 * それでも門の結論は生きている —— ただし理由が違う。出荷 `src/` の式 588 本のうち
 * 遅いのは 4 本で、どれも**長い文字列が届かない所**に在る (到達可能性の議論)。
 *
 * ## ここが見る物 (時間は測らない)
 *
 * 壁時計時間の判定は CI で誤爆する (門自身の docblock が「誤って鳴る門は、
 * 鳴らない門より悪い」と書いている)。だから**測定は定期点検の道具**
 * (`npm run audit:regex-poly`) が持ち、ここは決定的な 2 つだけを見る:
 *
 *   1. 台帳の各行が「何がその入力を短く保つか」を書いている
 *   2. 門の説明文が**実物の最大の上限**を引いている ——
 *      もっと大きい上限が足されたら、この行が鳴って説明を読み直させる
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDir, readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');
const AUDIT = 'scripts/audit-regex-polynomial.cjs';
const GATE = 'scripts/lint-regex-complexity.cjs';

/** `export const MAX_…_CHARS = 123_456` を全部集める (出荷 `src/` のみ)。 */
export function charCaps(): { name: string; value: number; file: string }[] {
  const out: { name: string; value: number; file: string }[] = [];
  const walk = (rel: string): void => {
    for (const name of readOriginalDir(join(REPO, rel))) {
      const next = `${rel}/${name}`;
      if (name === '__tests__' || name === 'node_modules') continue;
      if (/\.(ts|tsx)$/.test(name)) {
        if (name.endsWith('.d.ts')) continue;
        const src = readOriginalSource(join(REPO, next));
        const re = /export const (MAX_[A-Z0-9_]*CHARS) = ([0-9_]+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          out.push({ name: m[1]!, value: Number(m[2]!.replace(/_/g, '')), file: next });
        }
      } else if (!name.includes('.')) {
        walk(next);
      }
    }
  };
  walk('src');
  return out;
}

/** 一番大きい文字上限 —— 門の説明文が引くべき数。 */
export function largestCharCap(): { name: string; value: number; file: string } {
  const caps = charCaps();
  if (caps.length === 0) throw new Error('走査の死: MAX_*_CHARS が 1 つも見つからない');
  return caps.reduce((a, b) => (b.value > a.value ? b : a));
}

const audit = require(join(REPO, AUDIT)) as {
  LEDGER: readonly { body: string; bound: string }[];
  N: number;
  LIMIT_MS: number;
};

describe('多項式を外した理由が、実物と合っている (パス 337)', () => {
  it('走査が死んでいない (文字上限が実物から取れている)', () => {
    const caps = charCaps();
    expect(caps.length).toBeGreaterThanOrEqual(20);
    // 名指しの標本 —— 走査がこの 2 つを実際に拾っていること。
    expect(caps.map((c) => c.name)).toContain('MAX_TEXT_PREVIEW_CHARS');
    expect(caps.map((c) => c.name)).toContain('MAX_ANALYZE_TEXT_CHARS');
  });

  it('★ 一番大きい文字上限は、門が挙げていた 5,000 ではない', () => {
    const largest = largestCharCap();
    expect(largest.value).toBeGreaterThan(5_000);
    // 実測 (2026-09-20): 取り込んだファイルのプレビュー。
    expect(largest.name).toBe('MAX_TEXT_PREVIEW_CHARS');
    expect(largest.value).toBe(200_000);
  });

  it('★ 門の説明文は、実物の最大の上限を引いている (増えたら読み直させる)', () => {
    const gate = readOriginalSource(join(REPO, GATE));
    const largest = largestCharCap();
    // 「200000」でも「200,000」でも良い (説明文は読み物なので桁区切りを許す)。
    const plain = String(largest.value);
    const grouped = largest.value.toLocaleString('en-US');
    expect(
      gate.includes(plain) || gate.includes(grouped),
      `門の説明文が最大の上限 ${grouped} (${largest.name}) を引いていない`,
    ).toBe(true);
    expect(gate, '門の説明文が最大の上限の名前を引いていない').toContain(largest.name);
  });

  it('★ 台帳の各行は「何がその入力を短く保つか」を書いている', () => {
    expect(audit.LEDGER.length).toBeGreaterThan(0);
    for (const row of audit.LEDGER) {
      expect(() => new RegExp(row.body)).not.toThrow();
      expect(row.bound.trim().length, `/${row.body}/ の理由が短すぎる`).toBeGreaterThan(30);
      // 「上限が掛かっているから」だけで終わらせない —— 何がその式に届くかを書く。
      expect(row.bound, `/${row.body}/ の理由が出所を名指ししていない`).toMatch(
        /src\/|base64|静的|規格上/,
      );
    }
  });

  it('★ 台帳の式は実物の出荷 src に在る (消えた式を抱え込まない)', () => {
    const shipped: string[] = [];
    const walk = (rel: string): void => {
      for (const name of readOriginalDir(join(REPO, rel))) {
        const next = `${rel}/${name}`;
        if (name === '__tests__' || name === 'node_modules') continue;
        if (/\.(ts|tsx)$/.test(name)) shipped.push(readOriginalSource(join(REPO, next)));
        else if (!name.includes('.')) walk(next);
      }
    };
    walk('src');
    const all = shipped.join('\n');
    for (const row of audit.LEDGER) {
      expect(all, `/${row.body}/ が出荷 src に無い —— 台帳から消す`).toContain(`/${row.body}/`);
    }
  });

  it('定期点検の道具は CI のゲートではない (壁時計時間で判定するため)', () => {
    const pkg = JSON.parse(readOriginalSource(join(REPO, 'package.json'))) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['audit:regex-poly']).toContain('audit-regex-polynomial.cjs');
    expect(pkg.scripts['verify:all'], 'verify:all に入れてはいけない').not.toContain(
      'audit:regex-poly',
    );
    // 対照 —— 同じ理由で CI の外に在る道具が既に在る (audit:floors)。
    expect(pkg.scripts['audit:floors']).toBeDefined();
    expect(pkg.scripts['verify:all']).not.toContain('audit:floors');
  });
});
