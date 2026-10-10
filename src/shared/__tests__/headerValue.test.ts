/**
 * **関門とプラットフォームの一致** (2026-09-16 · パス 296)
 *
 * この検査の主役は「★ 実物の `new Headers()` と全行で一致する」である。規則が
 * 正しいことを散文で言い直すのではなく、**プラットフォームに訊いて突き合わせる**。
 * パス 271 / 289 / 291 / 295 が繰り返し直してきたのは「調べた物と開く物が違う」
 * 形で、そのたびに関門の側だけを人が書き直していた。書き直しが合っているかを
 * 機械が見ていなければ、次に同じずれが入る。
 *
 * 併せて、`Headers` が値を**黙って書き換える**ことも留める: 受理された値は
 * 前後の HTTP 空白が落ちた物なので、`h.get()` は正規化後と一致しなければ
 * ならない (= 保存した物と送る物が同じ)。
 */
import { describe, expect, it } from 'vitest';
import { isHeaderName, isHeaderValue, normalizeHeaderValue } from '../headerValue';

const ch = (n: number) => String.fromCharCode(n);
const TAB = ch(0x09);
const LF = ch(0x0a);
const CR = ch(0x0d);
const NUL = ch(0x00);
const NBSP = ch(0xa0);
const DEL = ch(0x7f);

/** 表: プラットフォームと突き合わせる入力。名前は落ちたときに読めるように付ける。 */
const ROWS: readonly (readonly [string, string])[] = [
  ['素の ASCII', 'sk-abcdef0123456789'],
  ['空', ''],
  ['空白だけ', '   '],
  ['末尾 LF (貼り付けで最も普通に混ざる)', 'sk-abcdef' + LF],
  ['先頭空白', ' sk-abcdef'],
  ['末尾 TAB', 'sk-abcdef' + TAB],
  ['末尾 CR', 'sk-abcdef' + CR],
  ['前後とも空白', '  sk-abcdef  '],
  ['途中の LF', 'sk-abc' + LF + 'def'],
  ['途中の CRLF (ヘッダ注入の形)', 'sk-abcdef' + CR + LF + 'X-Injected: 1'],
  ['NUL', 'sk-abc' + NUL + 'def'],
  ['DEL (0x7f・Latin1 なので通る)', 'sk-abc' + DEL + 'def'],
  ['C1 (0x85・Latin1 なので通る)', 'sk-abc' + ch(0x85) + 'def'],
  ['Latin1 上端 0xff', 'sk-abc' + ch(0xff) + 'def'],
  ['NBSP (Latin1・Headers は剥がさない)', NBSP + 'sk-abcdef' + NBSP],
  ['非 Latin1 (あ)', 'sk-abc' + ch(0x3042) + 'def'],
  ['キリル文字 (U+0414)', 'sk-abc' + ch(0x0414) + 'def'],
  ['絵文字 (サロゲート対)', 'sk-abc' + String.fromCodePoint(0x1f600) + 'def'],
  ['途中の空白 (落とさない)', 'sk abc def'],
];

/** 実物の `Headers` に訊く。受理なら送られる値も返す。 */
function askPlatform(value: string): { accepted: boolean; sent: string | null } {
  try {
    const h = new Headers({ 'x-probe': value });
    return { accepted: true, sent: h.get('x-probe') };
  } catch {
    return { accepted: false, sent: null };
  }
}

describe('headerValue — 関門は Headers と一致する', () => {
  it('★ 実物の new Headers() と全行で一致する (受理/拒否)', () => {
    const disagreements: string[] = [];
    for (const [name, value] of ROWS) {
      const mine = isHeaderValue(normalizeHeaderValue(value));
      const platform = askPlatform(value).accepted;
      if (mine !== platform) {
        disagreements.push(`${name}: 関門=${String(mine)} / Headers=${String(platform)}`);
      }
    }
    expect(disagreements).toEqual([]);
    // 走査が死んで「0 件だから一致」にならないための生存下限。
    expect(ROWS.length).toBeGreaterThanOrEqual(19);
  });

  it('★ 受理した値は「送られる値」と一致する (保存した物と送る物が同じ)', () => {
    const drifted: string[] = [];
    for (const [name, value] of ROWS) {
      const { accepted, sent } = askPlatform(value);
      if (!accepted) continue;
      const normalized = normalizeHeaderValue(value);
      if (sent !== normalized) drifted.push(`${name}: 送信=${JSON.stringify(sent)} / 正規化=${JSON.stringify(normalized)}`);
    }
    expect(drifted).toEqual([]);
  });

  it('★ 正規化しないと 4 行が「通したのに送れない/別の値になる」— ずれの実測', () => {
    // 対照: パス 296 より前の規則 (正規化せずに素の値を見る) では何行ずれるか。
    // 0 件になったら、この検査が守っている前提が消えたということ。
    const silentlyChanged = ROWS.filter(([, v]) => {
      const { accepted, sent } = askPlatform(v);
      return accepted && sent !== v;
    });
    expect(silentlyChanged.map(([n]) => n)).toEqual([
      '空白だけ',
      '末尾 LF (貼り付けで最も普通に混ざる)',
      '先頭空白',
      '末尾 TAB',
      '末尾 CR',
      '前後とも空白',
    ]);
  });
});

describe('isHeaderName — 関門は Headers と一致する', () => {
  /*
   * 名前側は**元から正しかった** (パス 296 の実測で食い違い 0)。それでも表に
   * 載せるのは、一致を留めている物が無かったから —— 値側がずれていたのと
   * 同じ理由で、将来ずれても誰も気付かない状態だった。
   */
  it('★ ASCII 全域 + 非 ASCII 4 例で new Headers() と一致する', () => {
    const codes: number[] = [];
    for (let c = 1; c <= 0x7f; c += 1) codes.push(c);
    codes.push(0xa0, 0xff, 0x3042, 0x1f600);
    const disagreements: string[] = [];
    for (const c of codes) {
      const name = String.fromCodePoint(c);
      const mine = isHeaderName(name);
      let platform = true;
      try {
        new Headers({ [name]: 'v' });
      } catch {
        platform = false;
      }
      if (mine !== platform) disagreements.push(`0x${c.toString(16)}: 関門=${String(mine)} / Headers=${String(platform)}`);
    }
    expect(disagreements).toEqual([]);
    expect(codes.length).toBe(131);
  });

  it.each([
    ['実際に送る名前', 'x-proxy-auth', true],
    ['大文字混じり', 'X-Proxy-Auth', true],
    ['ETag', 'ETag', true],
    ['アンダースコア', 'x_y', true],
    ['空白入り', 'a b', false],
    ['コロン入り', 'a:b', false],
    ['空文字列', '', false],
  ])('%s は %s (関門も Headers も同じ答え)', (_label, name, expected) => {
    expect(isHeaderName(name)).toBe(expected);
    let platform = true;
    try {
      new Headers({ [name]: 'v' });
    } catch {
      platform = false;
    }
    expect(platform).toBe(expected);
  });
});

describe('isHeaderValue — 対照', () => {
  it('非 Latin1 は弾く (≥0x100)', () => {
    expect(isHeaderValue('ok' + ch(0x3042))).toBe(false);
    expect(isHeaderValue('ok' + ch(0x0100))).toBe(false);
    expect(isHeaderValue('ok' + String.fromCodePoint(0x1f600))).toBe(false);
  });

  it('Latin1 の上端 0xff は通す (境界)', () => {
    expect(isHeaderValue('ok' + ch(0xff))).toBe(true);
    expect(isHeaderValue('ok' + ch(0x100))).toBe(false);
  });

  it('NUL / CR / LF は弾く', () => {
    expect(isHeaderValue('a' + NUL + 'b')).toBe(false);
    expect(isHeaderValue('a' + CR + 'b')).toBe(false);
    expect(isHeaderValue('a' + LF + 'b')).toBe(false);
  });

  it('制御文字でも Latin1 で NUL/CR/LF でなければ通す (Headers と同じ)', () => {
    expect(isHeaderValue('a' + TAB + 'b')).toBe(true);
    expect(isHeaderValue('a' + DEL + 'b')).toBe(true);
    expect(isHeaderValue('a' + ch(0x01) + 'b')).toBe(true);
  });

  it('空文字列は通す', () => {
    expect(isHeaderValue('')).toBe(true);
  });
});

describe('normalizeHeaderValue — 対照', () => {
  it('前後の HTTP 空白 4 種を落とす', () => {
    expect(normalizeHeaderValue(' a ')).toBe('a');
    expect(normalizeHeaderValue(TAB + 'a' + TAB)).toBe('a');
    expect(normalizeHeaderValue(LF + 'a' + LF)).toBe('a');
    expect(normalizeHeaderValue(CR + 'a' + CR)).toBe('a');
    expect(normalizeHeaderValue(CR + LF + ' ' + TAB + 'a')).toBe('a');
  });

  it('★ trim() ではない — NBSP (Latin1) は Headers が保つので落とさない', () => {
    expect(normalizeHeaderValue(NBSP + 'a' + NBSP)).toBe(NBSP + 'a' + NBSP);
    expect((NBSP + 'a' + NBSP).trim()).toBe('a'); // trim なら消える = 別の規則
  });

  it('途中の空白は落とさない', () => {
    expect(normalizeHeaderValue('a b')).toBe('a b');
    expect(normalizeHeaderValue('a' + LF + 'b')).toBe('a' + LF + 'b');
  });

  it('空白だけなら空になる / 空はそのまま', () => {
    expect(normalizeHeaderValue(' ' + TAB + LF)).toBe('');
    expect(normalizeHeaderValue('')).toBe('');
  });
});
