/**
 * **同梱の形と取ってきた形を突き合わせる**ための道具 (検査専用・出荷物ではない)。
 *
 * `src/main/clients/__tests__/snapshotShapeParity.test.ts` (デスクトップの
 * fetcher) と `src/renderer/__tests__/webShimSnapshotParity.test.ts`
 * (ブラウザ版の合成) の両方が同じ物差しを使う —— 物差しを 2 つ持つと、
 * 片方だけ緩くなる。
 *
 * `__tests__` の下に置いた素のモジュールなので vitest は検査として集めない
 * (`src/shared/__tests__/electron.stub.ts` と同じ置き方)。
 */
function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 欄の差を**入れ子まで**見る (`path.to.field` で報告)。
 *
 * 上端だけ比べる形では足りない —— 対照で `summary.consumptionTaxEstimate` を
 * 同梱から消しても `summary` という鍵は残るので、差として出なかった (2026-09-06、
 * 最初に書いた版がこれで、対照が鳴らないことで分かった)。
 *
 * 配列は**両方に 1 件以上あるときだけ**先頭要素の形を比べる。片方が空の配列
 * (同梱に「まだ 1 件も無い」を置くのはこのアプリの普通の形) では要素の形が
 * 分からないので、そこは黙る —— 分からないことを差として鳴らすと、
 * 台帳が「鳴って当たり前」になって守らなくなる。
 *
 * **この決めごとの裏側 (拾えない形)**: 片方の物の中身が**全部**消えた場合は
 * 空の物と区別できないので鳴らない。使う側の標本
 * (`src/renderer/__tests__/webShimSnapshotParity.test.ts`) に、拾える形と
 * 拾えない形の両方を置いてある —— 「全部見ている」と思い込まないため。
 */
export function shapeDiff(snapshotValue: unknown, fetchedValue: unknown): {
  snapshotOnly: string[];
  fetchedOnly: string[];
} {
  const snapshotOnly: string[] = [];
  const fetchedOnly: string[] = [];
  const walk = (a: unknown, b: unknown, path: string, depth: number): void => {
    if (depth > 6) return;
    // `null` は「まだ無い」を表す普通の値 (同梱には `null as {…}` で置く欄がある。
    // 例: funding の diversification —— 画面側が真偽で守っている)。形は比べられない。
    if (a === null || b === null || a === undefined || b === undefined) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length > 0 && b.length > 0) walk(a[0], b[0], `${path}[]`, depth + 1);
      return;
    }
    if (isObj(a) && isObj(b)) {
      // 中身で鍵が決まる表 (talent の `ladder.byStep` のような Map 相当) は、
      // 片方が空なら鍵の集合を比べても意味が無い。配列と同じ扱いにする。
      if (Object.keys(a).length === 0 || Object.keys(b).length === 0) return;
      for (const k of Object.keys(a)) {
        if (!Object.hasOwn(b, k)) snapshotOnly.push(path ? `${path}.${k}` : k);
        else walk(a[k], b[k], path ? `${path}.${k}` : k, depth + 1);
      }
      for (const k of Object.keys(b)) {
        if (!Object.hasOwn(a, k)) fetchedOnly.push(path ? `${path}.${k}` : k);
      }
      return;
    }
    // 物と物でない値が向き合っている場合だけ形の違いとして報告する。
    if (isObj(a) !== isObj(b) || Array.isArray(a) !== Array.isArray(b)) {
      snapshotOnly.push(`${path || '<root>'}:型が違う`);
    }
  };
  walk(snapshotValue, fetchedValue, '', 0);
  return { snapshotOnly, fetchedOnly };
}

