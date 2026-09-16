/**
 * imageUrlGate — 画像 URL の関門そのものの検査。
 *
 * ## なぜこのファイルが在るか (2026-08-25 に移した)
 *
 * この関門は 2026-08-24 まで `components/DataList.tsx` の中に居た。
 * `mutate` に `.tsx` が 1 件も無いので**変異体が 1 つも作られず**、
 * 「必ず測る壁」の名簿にも載りようがなかった —— **関門がコンポーネントの
 * 中に隠れていたことが、見落とされた原因そのもの**だった。
 * そこで実装を `src/shared/imageUrlGate.ts` へ出した。
 *
 * **ところが、検査は `DataList.render.test.ts` に置き去りにした。**
 * 実装だけを移して検査を残すと、
 *
 *   - `MUST_MEASURE` の壁で唯一、名前の対応する検査ファイルが無くなる
 *   - 探す人は `shared/__tests__/imageUrlGate.test.ts` を見て「無い」と判断する
 *   - コンポーネントの描画テストを整理する変更に、関門の検査が巻き込まれうる
 *
 * 移動だけで、中身は変えていない (描画を通す検査は
 * `DataList.render.test.ts` に残してある —— あちらはコンポーネントの話)。
 */
import { describe, expect, it } from 'vitest';
import { safeImageSrc, safeCssUrl } from '../imageUrlGate';
import { externalUrlOrNull } from '../externalUrlGate';

/**
 * 2026-07 セキュリティ監査（多層防御）: 第三者由来の画像 URL のスキーム検証。
 * `<img src>` 自体はスクリプトを実行しないが、同じ値が `<a href>` / CSS `url()` /
 * SVG `<use>` に移った瞬間に危険になるため、入口で許可スキームに限定する。
 */
describe('safeImageSrc — 許可スキーム', () => {
  it('https / http は**解析後の形**で通す (パス 299)', () => {
    expect(safeImageSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(safeImageSrc('http://example.com/a.png')).toBe('http://example.com/a.png');
    /*
     * パス 299 まで「そのまま通す」で、`HTTPS://EXAMPLE.COM/A.PNG` が
     * 字面のまま返っていた。いまは解析した形を返す —— **スキームとホストは
     * 小文字へ、パスは大小を保つ** (パスは大小が意味を持つので変えない)。
     * これはブラウザが `<img src>` を取りに行くときにする正規化と同じで、
     * 「調べた文字列」と「取りに行く文字列」を一致させるために返している。
     */
    expect(safeImageSrc('HTTPS://EXAMPLE.COM/A.PNG')).toBe('https://example.com/A.PNG');
  });

  it('data:image/* は通す（base64 / 非 base64 とも）', () => {
    expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(safeImageSrc('data:image/svg+xml,%3Csvg%2F%3E')).toBe('data:image/svg+xml,%3Csvg%2F%3E');
  });

  it('javascript: を拒否する', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeUndefined();
    expect(safeImageSrc('JaVaScRiPt:alert(1)')).toBeUndefined();
  });

  it('tab/改行で難読化した javascript: も拒否する', () => {
    // HTML は URL 属性のパース前に tab/LF/CR を除去するため、検証側も同じ正規化が必要。
    expect(safeImageSrc('java\tscript:alert(1)')).toBeUndefined();
    expect(safeImageSrc('  java\nscript:alert(1)  ')).toBeUndefined();
  });

  it('data:image/* 以外の data: URI を拒否する', () => {
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeImageSrc('data:image')).toBeUndefined();
    expect(safeImageSrc('data:imagex/png;base64,AA')).toBeUndefined();
  });

  it('その他のスキーム / 相対パス / 空値を拒否する', () => {
    expect(safeImageSrc('vbscript:msgbox(1)')).toBeUndefined();
    expect(safeImageSrc('file:///etc/passwd')).toBeUndefined();
    expect(safeImageSrc('//example.com/a.png')).toBeUndefined();
    expect(safeImageSrc('./a.png')).toBeUndefined();
    expect(safeImageSrc('')).toBeUndefined();
    expect(safeImageSrc(undefined)).toBeUndefined();
  });
});

describe('safeCssUrl — CSS url() へ入れる形', () => {
  /*
   * `safeImageSrc` の冒頭は「同じ値が CSS `url()` へ流れた瞬間に危険」と
   * 書いていたのに、その CSS `url()` (`pages/AssistantPage.tsx` の背景画像)
   * だけが関門を通っていなかった (2026-08-24)。値は localStorage の
   * `assistant-theme` から来るので、同一オリジンの別ページや拡張から
   * 書き換えられる。
   */
  it('許可スキームは引用して返す', () => {
    expect(safeCssUrl('https://example.com/a.png')).toBe('url("https://example.com/a.png")');
    expect(safeCssUrl('data:image/png;base64,AAAA')).toBe('url("data:image/png;base64,AAAA")');
  });

  it.each([
    ['javascript:alert(1)'],
    ['java\tscript:alert(1)'], // tab を挟んでスキーム判定を外す形
    ['data:text/html,<script>x</script>'],
    ['vbscript:x'],
    ['file:///etc/passwd'],
    [''],
  ])('許可外は undefined を返す: %s', (v) => {
    expect(safeCssUrl(v)).toBeUndefined();
  });

  it('undefined / null はそのまま undefined', () => {
    expect(safeCssUrl(undefined)).toBeUndefined();
    expect(safeCssUrl(null)).toBeUndefined();
  });

  it('★ 宣言を壊す文字が入っても引用の中に収まる', () => {
    // `)` や空白は実在しうる URL の一部。素の url() へ差し込むと
    // 宣言が壊れて背景が黙って出なくなる。
    expect(safeCssUrl('https://example.com/a(b).png')).toBe('url("https://example.com/a(b).png")');
    // パス 299 から http(s) は解析後の形になるので、空白は `%20` になる
    // (ブラウザが取りに行くときと同じ符号化)。引用の中に収まる性質は変わらない。
    expect(safeCssUrl('https://example.com/a b.png')).toBe('url("https://example.com/a%20b.png")');
  });

  it('★ 引用符とバックスラッシュは退避する — 生きている入口は data: の側 (パス 299)', () => {
    /*
     * **この退避の「生きた入力」が移った。** パス 299 で http(s) を
     * 解析するようにしたので、実測 (2026-09-16):
     *
     *   https://e.com/a".png  → https://e.com/a%22.png   (`"` は符号化される)
     *   https://e.com/a\b.png → https://e.com/a/b.png    (特別スキームは `\` を `/` へ)
     *
     * つまり **http(s) からは `"` も `\` も届かなくなった**。それでも退避を
     * 消さないのは、`data:image/*` の枝は**解析しない**ので両方そのまま
     * 通るからで、そこが本来まずい側 (中身が攻撃者の形をしている) である。
     * 「効いていない防御は消す」(`exportPaths.ts` の 2026-08-30) の逆で、
     * これは**効いている入口が変わった**だけ —— どちらの枝が退避を
     * 生かしているかを書いておかないと、次の読み手が消しに来る。
     */
    expect(safeCssUrl('data:image/svg+xml,a".png')).toBe('url("data:image/svg+xml,a\\".png")');
    expect(safeCssUrl('data:image/svg+xml,a\\.png')).toBe('url("data:image/svg+xml,a\\\\.png")');
    // 標本: http(s) 側はもう退避の対象を運べない (符号化・正規化で消える)
    expect(safeCssUrl('https://example.com/a".png')).toBe('url("https://example.com/a%22.png")');
    expect(safeCssUrl('https://example.com/a\\.png')).toBe('url("https://example.com/a/.png")');
  });

  it('safeImageSrc と同じ判断をする (関門は 1 つ)', () => {
    for (const v of [
      'https://x/a.png', 'http://x/a.png', 'data:image/svg+xml,<svg/>',
      'javascript:x', 'data:text/html,x', 'ftp://x/a.png', '',
    ]) {
      expect(safeCssUrl(v) === undefined).toBe(safeImageSrc(v) === undefined);
    }
  });
});

describe('imageUrlGate — 変異検査で見つかった穴 (2026-08-24)', () => {
  /*
   * この関門は `mutate` から外れていた (`components/` の中に居たので
   * `.tsx` が 1 件も対象になっていない構成に隠れていた)。`src/shared/` へ
   * 出して測ったら **80.00%・生存 5** で、うち 3 件は実際の抜けだった。
   */

  it('★ 先頭の ^ が効いている — 中に https:// を含む javascript: を通さない', () => {
    // 実測: アンカーを外すと通る。`<img src>` では実害が出ないが、
    // `safeCssUrl` 経由で CSS へ流れる値でもあり、関門の意味が消える。
    expect(safeImageSrc('javascript:alert("https://example.com")')).toBeUndefined();
    expect(safeCssUrl('javascript:alert("https://example.com")')).toBeUndefined();
  });

  it('★ data: 側のアンカーも効いている — 中に data:image を含む別スキームを通さない', () => {
    expect(safeImageSrc('javascript:void("data:image/png;")')).toBeUndefined();
    expect(safeImageSrc('data:text/html,<img src="https://example.com">')).toBeUndefined();
  });

  it('★ data:image の直後に ; か , を必須にしている', () => {
    // `data:image/png` だけでは中身が無い (`;base64,` も `,` も無い)。
    expect(safeImageSrc('data:image/png')).toBeUndefined();
    // 逆に `pngX` は綴りとしては正当なサブタイプ形なので通る。
    // (最初この行を「弾くはず」と書いて落ちた —— 規則が正しく、期待が誤りだった。)
    expect(safeImageSrc('data:image/pngX,AAAA')).toBe('data:image/pngX,AAAA');
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeImageSrc('data:image/svg+xml,<svg/>')).toBe('data:image/svg+xml,<svg/>');
  });

  it('★ tab/CR/LF は「取り除いた値」が返る (判定と返り値がずれない)', () => {
    // HTML の URL 属性はパース前に tab/LF/CR を落とすので、検証側も同じ
    // 正規化をしたうえで **その値を返す**必要がある。別の文字に置き換える
    // 実装だと、判定は通るのに出力が壊れる。
    expect(safeImageSrc('https://example.com/a\tb.png')).toBe('https://example.com/ab.png');
    expect(safeImageSrc('https://example.com/a\nb.png')).toBe('https://example.com/ab.png');
    expect(safeCssUrl('https://example.com/a\tb.png')).toBe('url("https://example.com/ab.png")');
  });

  it('★ 前後の空白は落として返る', () => {
    expect(safeImageSrc('  https://example.com/a.png  ')).toBe('https://example.com/a.png');
    expect(safeCssUrl('  https://example.com/a.png  ')).toBe('url("https://example.com/a.png")');
  });
});

/**
 * 2 つの関門の答えを**突き合わせる** (2026-09-16 · パス 299)。
 *
 * `safeImageSrc` の docblock は自分を `openExternal` の関門と「同じ方針」と
 * 名乗っていた。同じ 15 形を両方に当てると **9 形で割れ**、うち 5 形は
 * こちらが緩い側だった (字面の前置き一致なので、**解析すると別のホストへ
 * 取りに行く**形が通っていた)。
 *
 * ここで留めるのは 2 つ:
 *   1. **割れていて正しい形** (`data:image/*`) は、割れたまま名前をつけて固定する
 *   2. **割れていてはいけない形** (見せかけのホスト・解析不能) は一致させる
 *
 * 「同じ方針」と散文で書くのではなく、**両方を呼んで比べる**。
 */
describe('safeImageSrc と externalUrlOrNull の突き合わせ (パス 299)', () => {
  /** 画像だけが通してよい形 —— `<img>` は data: を要り、OS へ渡す関門は拒む。 */
  const IMAGE_ONLY = ['data:image/png;base64,AAA', 'data:image/svg+xml,%3Csvg%2F%3E'];

  /**
   * **どちらも落とさなければならない形。** 前 3 つは `externalUrlGate` が
   * 「本当の送り先を見せかけで隠す形」として名指ししている authority の
   * 認証情報で、実際に取りに行くのは `@` の**右側**である。
   */
  const BOTH_REFUSE = [
    'https://accounts.google.com@evil.example/pixel.png',
    'https://user:pass@evil.example/pixel.png',
    'https://cdn.example.com@127.0.0.1/pixel.png',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com/a.png',
  ];

  it('★ 画像だけが通す形は、URL 関門が落とす (割れていて正しい)', () => {
    for (const v of IMAGE_ONLY) {
      expect(safeImageSrc(v), v).not.toBeUndefined();
      expect(externalUrlOrNull(v), v).toBeNull();
    }
  });

  it('★ 見せかけのホストは両方が落とす (割れていてはいけない)', () => {
    for (const v of BOTH_REFUSE) {
      expect(safeImageSrc(v), v).toBeUndefined();
      expect(externalUrlOrNull(v), v).toBeNull();
    }
  });

  it('★ 通した値が実際に取りに行くホストは、字面の先頭と一致する', () => {
    // 肯定形: 通った値は解析でき、その host が意図した先である。
    for (const [input, host] of [
      ['https://cdn.example.com/a.png', 'cdn.example.com'],
      ['HTTPS://CDN.EXAMPLE.COM/A.PNG', 'cdn.example.com'],
      ['  http://cdn.example.com/a.png  ', 'cdn.example.com'],
    ] as const) {
      const out = safeImageSrc(input);
      expect(out, input).not.toBeUndefined();
      expect(new URL(out!).host, input).toBe(host);
    }
  });

  it('★ 解析できない形は落とす (字面だけでは通っていた)', () => {
    // 制御文字は先に落ちるので、関門が「解析できない」で断る形を直接置く。
    expect(safeImageSrc('https://' + String.fromCharCode(10) + 'javascript:alert(1)')).toBeUndefined();
    expect(safeImageSrc('http://' + String.fromCharCode(0) + 'evil/x.png')).toBeUndefined();
    expect(safeImageSrc('https://')).toBeUndefined();
  });

  it('★ 対照 — 認証情報が無ければ同じ値を通す (門が全部落としていない)', () => {
    // 上の 2 本は「落とす」の主張なので、**落とさない側**を並べて置く。
    // これが無いと `return undefined` 固定でも 4 本すべて通ってしまう。
    expect(safeImageSrc('https://evil.example/pixel.png')).toBe('https://evil.example/pixel.png');
    expect(externalUrlOrNull('https://evil.example/pixel.png')).toBe(
      'https://evil.example/pixel.png',
    );
  });
});
