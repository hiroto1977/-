/**
 * **数える前にコメントと文字列を落とす。** (2026-09-12 · パス 174 / 2026-09-14 · パス 252 で切り出した)
 *
 * 走査が散文の中の引用を掴むのは、この一族の定番の罠である (パス 85 の 0 倒し census が
 * 最初に踏み、パス 174 も踏んだ)。**行番号は保つ** —— 落とした行の分だけ改行を残すので、
 * 掴んだ位置をそのまま実物の行として報せられる。
 *
 * 2026-09-14 まで `ceilingLiteralCensus.test.ts` が export していたが、**検査ファイルを
 * import すると中の describe がもう一度走る** (実測: 14 件と報告された)。走査の道具は
 * 検査ではないので、ここへ出す。
 */
export function stripNonCode(src: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' = 'code';
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (mode === 'code') {
      if (two === '//') { mode = 'line'; i += 2; continue; }
      if (two === '/*') { mode = 'block'; i += 2; continue; }
      if (src[i] === "'") { mode = 'sq'; i += 1; continue; }
      if (src[i] === '"') { mode = 'dq'; i += 1; continue; }
      if (src[i] === '`') { mode = 'tpl'; i += 1; continue; }
      out += src[i];
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (src[i] === '\n') { mode = 'code'; out += '\n'; }
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (two === '*/') { mode = 'code'; i += 2; continue; }
      if (src[i] === '\n') out += '\n';
      i += 1;
      continue;
    }
    // 文字列の中: 改行だけ残して行番号を保つ。エスケープは 1 文字飛ばす。
    if (src[i] === '\\') { i += 2; continue; }
    if ((mode === 'sq' && src[i] === "'") || (mode === 'dq' && src[i] === '"') || (mode === 'tpl' && src[i] === '`')) {
      mode = 'code';
    } else if (src[i] === '\n') {
      out += '\n';
    }
    i += 1;
  }
  return out;
}
