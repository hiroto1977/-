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
 *
 * ## `${…}` は文字列ではなく**式**である (2026-09-22 · パス 417)
 *
 * 2026-09-22 まで `tpl` は閉じのバッククォートまで丸ごと落としており、**中の
 * `${…}` も一緒に消えていた**。このリポジトリは利用者に見せる文をテンプレートで
 * 組むので、そこは「散文」ではなく**最も危ない式が並ぶ場所**である。
 *
 * 実測でその死角に落ちていた物 (パス 417):
 *
 * | 実物 | 見えていたか |
 * | --- | --- |
 * | `sales.ts` の `` return `…|${salesNoteText(e)}`; `` | **見えない** (3 / 4 件しか数えられなかった) |
 * | 同じ行を `` `…|${(e.note ?? '').trim()}` `` へ戻す | **見えない** —— 針は**両方向**に盲目だった |
 *
 * 落とした側を数える針にとって、これは「0 件だから健全」を作る形である
 * (法則 `mention-vs-declaration` の裏 —— 宣言を見落とす側)。`${` で code へ戻り、
 * 対応する `}` で文字列へ帰る (入れ子のテンプレートに耐えるため戻り先を積む)。
 * **区切りに空白を出す** —— `` `a${x}b${y}` `` の `x` と `y` が地続きになると、
 * 実物に無い綴り (`xy`) を針が掴む。
 */
type Mode = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl';

export function stripNonCode(src: string): string {
  let out = '';
  let i = 0;
  let mode: Mode = 'code';
  /** 戻り先と、そのとき保留にした `{}` の深さ (入れ子のテンプレートに耐えるため)。 */
  const stack: { mode: Mode; depth: number }[] = [];
  /** 今の code フレームの `{}` の深さ。0 で `}` を見たら補間の終わり。 */
  let depth = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (mode === 'code') {
      if (two === '//') { mode = 'line'; i += 2; continue; }
      if (two === '/*') { mode = 'block'; i += 2; continue; }
      if (src[i] === "'") { stack.push({ mode, depth }); mode = 'sq'; i += 1; continue; }
      if (src[i] === '"') { stack.push({ mode, depth }); mode = 'dq'; i += 1; continue; }
      if (src[i] === '`') { stack.push({ mode, depth }); mode = 'tpl'; i += 1; continue; }
      if (src[i] === '{') { depth += 1; out += '{'; i += 1; continue; }
      if (src[i] === '}') {
        const frame = depth === 0 ? stack.pop() : undefined;
        if (frame !== undefined) {
          // 補間の終わり —— 文字列へ帰る。区切りの空白で隣の補間と地続きにしない。
          out += ' ';
          mode = frame.mode;
          depth = frame.depth;
        } else {
          if (depth > 0) depth -= 1;
          out += '}';
        }
        i += 1;
        continue;
      }
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
    if (mode === 'tpl' && two === '${') {
      // **補間は式** —— code として出す (区切りの空白つき)。
      out += ' ';
      stack.push({ mode, depth });
      mode = 'code';
      depth = 0;
      i += 2;
      continue;
    }
    if ((mode === 'sq' && src[i] === "'") || (mode === 'dq' && src[i] === '"') || (mode === 'tpl' && src[i] === '`')) {
      const frame = stack.pop();
      mode = frame === undefined ? 'code' : frame.mode;
      if (frame !== undefined) depth = frame.depth;
    } else if (src[i] === '\n') {
      out += '\n';
    }
    i += 1;
  }
  return out;
}
