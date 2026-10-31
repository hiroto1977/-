/**
 * **`safeRemoteImageSrc` が送り先の関門に掛けるのは http(s) だけ —— `data:image/*` は関門を呼ばずに通す** (2026-10-01 · パス 502)。
 *
 * 全掃引 #180 の生存 2 件 (`if (!/^https?:/i.test(src)) return src;` の判定と、その正規表現の `^`) の分。
 * 本物の `isPrivateOrReservedTarget` は `data:` の URL (ホスト名が空) を「公開」と答える (実測: 空のホストは
 * どの規則にも当たらず false) ので、**早期 return を外しても答えは同じ**になり、既存の検査 (本物の関門のまま
 * `data:image/png;base64,AAA` が通ることを見る) は区別できなかった。
 *
 * だがその早期 return には役目が在る —— `data:image/*` は取得が起きないので送り先の関門に**掛けない**
 * (docblock「ホストを持たないのでそのまま通す」)。関門が将来「空のホストは拒む」へ強化されたとき
 * (fail closed として自然な強化) に、**同梱の見本の `data:` 画像が黙って消えない**ための床である。
 * 本物の関門のままではその日まで観測できないので、関門を差し替えて**呼ばれたか**を直接数える。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 送り先の関門は「何でも内側」と答える代役にして、呼ばれた回数と引数を見る。
const gate = vi.hoisted(() => vi.fn<(u: URL) => boolean>());
vi.mock('../privateTarget', () => ({ isPrivateOrReservedTarget: gate }));

import { safeRemoteImageSrc } from '../imageUrlGate';

/** `safeImageSrc` が通す `data:image/*` の形。後ろの 2 つは本文に `http:` / `https:` を含む (SVG の名前空間)。 */
const DATA_URIS = [
  'data:image/png;base64,AAA',
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E",
  "data:image/svg+xml;utf8,<svg xmlns='https://www.w3.org/2000/svg'/>",
];

beforeEach(() => {
  gate.mockReset();
  gate.mockReturnValue(true);
});

describe('safeRemoteImageSrc — 送り先の関門に掛けるのは http(s) だけ', () => {
  it.each(DATA_URIS)('★ %s は送り先の関門を呼ばずにそのまま通す (関門が何を答えても)', (uri) => {
    expect(safeRemoteImageSrc(uri)).toBe(uri);
    // 呼ばれていれば、代役が「内側」と答えるので上で undefined になっている —— 呼ばれた回数も直接留める。
    expect(gate).not.toHaveBeenCalled();
  });

  it('★ 関門へ流れない値 (許可外のスキーム・非文字列・空) は、関門が「内側」と答える状態でも関門を呼ばず undefined', () => {
    for (const v of ['javascript:alert(1)', 'ftp://example.com/a.png', '', '   ', 42, null, undefined, {}]) {
      expect(safeRemoteImageSrc(v), String(v)).toBeUndefined();
    }
    expect(gate).not.toHaveBeenCalled();
  });

  it('対照: http(s) は関門を 1 回ずつ呼び、答えで決まる (「内側」なら落とし、「公開」なら解析後の形で通す)', () => {
    // 代役が配線されていることの証拠 —— これが無いと上の「呼ばれない」は何も言っていない。
    gate.mockReturnValue(true);
    expect(safeRemoteImageSrc('http://example.com/a.png')).toBeUndefined();
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate.mock.calls[0]?.[0].href).toBe('http://example.com/a.png');

    gate.mockReturnValue(false);
    expect(safeRemoteImageSrc('HTTPS://CDN.EXAMPLE.COM/A.PNG')).toBe('https://cdn.example.com/A.PNG');
    expect(gate).toHaveBeenCalledTimes(2);
    expect(gate.mock.calls[1]?.[0].href).toBe('https://cdn.example.com/A.PNG');
  });
});
