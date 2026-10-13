/**
 * `docStudioChecks.ts` の**原文から指摘の器を切り出す**道具 —— 検査 2 本が読む 1 つ。
 *
 * パス 437 がこの走査を書き、パス 438 が 2 本目の読み手になった。**写しにしない** ——
 * この repo は同じ走査の写しが片方だけ古びる形を繰り返し直している (パス 418 の
 * `stripNonCode` が 3 つだと思ったら 4 つで、4 つ目だけ契約が違った)。
 *
 * 原文の読み取りは**呼ぶ側**が `readOriginalSource` で行う (Stryker の sandbox で
 * 書き換えられた写しを読まないため —— `originalSourcePolicy` の規約)。
 */

/**
 * ファイル全体の `{` と `}` を対応づける (文字列リテラルは飛ばす)。
 *
 * **綴りで切り出さない** —— パス 437 の最初の版は `out.push({` だけを探し、
 * `return [{ level: 'info' as const, … }]` の形の **13 件を 1 つも見なかった**
 * (実測 23 件中 10 件しか映らなかった)。パス 334 / 412 / 418 と同じ家系
 * (**綴りの針は、綴りでない物に動かされる**) なので、器そのものを対応づける。
 */
export function bracePairs(src: string): ReadonlyMap<number, number> {
  const open: number[] = [];
  const pair = new Map<number, number>();
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (ch === '`' || ch === "'" || ch === '"') {
      const q = ch;
      i += 1;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i += 1;
        i += 1;
      }
    } else if (ch === '{') open.push(i);
    else if (ch === '}') {
      const o = open.pop();
      if (o !== undefined) pair.set(o, i);
    }
  }
  return pair;
}

/** `needle` の各一致を囲む**いちばん内側**のオブジェクトリテラルを返す。 */
export function objectsMatching(src: string, needle: RegExp): readonly string[] {
  const pairs = bracePairs(src);
  const opens = [...pairs.keys()].sort((a, b) => a - b);
  const out: string[] = [];
  const re = new RegExp(needle.source, needle.flags.includes('g') ? needle.flags : `${needle.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let best: readonly [number, number] | null = null;
    for (const o of opens) {
      if (o > m.index) break;
      const c = pairs.get(o)!;
      if (c > m.index && (best === null || o > best[0])) best = [o, c];
    }
    if (best) out.push(src.slice(best[0], best[1] + 1));
  }
  return out;
}

/**
 * 器の中の `message:` が**組み上がる前の綴り**を返す (補間 `${…}` は落とす)。
 *
 * 文はリテラル 1 つとは限らない —— `` `a${x}b` + 'c' `` のように `+` で繋がる。
 * 最初のリテラルだけを読むと**後半の綴りが走査から消える**ので、`+` で続く限り読む。
 * 走らせて得た文ではなく綴りを見るのは、補間された**値**を綴りと取り違えないため。
 */
export function messageSource(objectBody: string): string | null {
  const at = objectBody.indexOf('message:');
  if (at < 0) return null;
  let i = at + 'message:'.length;
  const parts: string[] = [];
  for (;;) {
    while (i < objectBody.length && /\s/.test(objectBody[i]!)) i += 1;
    const q = objectBody[i];
    if (q !== '`' && q !== "'" && q !== '"') break;
    i += 1;
    let lit = '';
    while (i < objectBody.length && objectBody[i] !== q) {
      if (objectBody[i] === '\\') i += 1;
      lit += objectBody[i];
      i += 1;
    }
    i += 1;
    parts.push(lit);
    while (i < objectBody.length && /\s/.test(objectBody[i]!)) i += 1;
    if (objectBody[i] !== '+') break;
    i += 1;
  }
  if (parts.length === 0) return null;
  return parts.join('').replace(/\$\{[^}]*\}/g, '');
}
