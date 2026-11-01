import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// scripts/*.cjs は Node ビルドスクリプト。テストだけが createRequire で読み込む。
const req = createRequire(import.meta.url);
const { assertRawTextInert, endTagHazard, escapeHazard, scriptEndIndex, inlineStandalone } = req(
  '../../../scripts/inline-html.cjs',
) as {
  assertRawTextInert: (text: string, tag: string, what: string) => void;
  endTagHazard: (text: string, tag: string) => number;
  escapeHazard: (text: string) => number;
  scriptEndIndex: (html: string, from: number) => number;
  inlineStandalone: (html: string, readAsset: (rel: string) => string) => string;
};

/**
 * 標本は**実行時に組み立てる**。`</script` や `<!--<script>` を字面で置くと、
 * このリポジトリの走査器 (lint:forbidden / lint-artifact-csp の類) に引っ掛かるうえ、
 * 「検査の材料が本物の走査器に引っ掛かる」を何度もやらかしている。
 */
const LT = '<';
const S = 'script';
const CLOSE = `${LT}/${S}`;
const CMT_OPEN = `${LT}!--`;
const CMT_CLOSE = '--' + '>';
const OPEN_TAG = `${LT}${S}>`;

/**
 * chromium 1194 (`--dump-dom`) で実測した表。各標本を `<head>` 内の
 * `<script id="s">…</script>` に綴じ込み、**後続の**報告係スクリプトに
 * `document.getElementById('s').textContent.length` を書かせて確かめた。
 *
 *   - `inert`    … 中身は綴じ込んだ通り (length が一致)
 *   - `early`    … そこで閉じてしまい text が短くなる
 *   - `swallow`  … 終端ごと飲み込まれ、報告係も消える (頁が丸ごと script の文字列)
 *
 * この表は**ブラウザが決めたこと**であって、こちらの解釈ではない。
 */
const MEASURED: ReadonlyArray<readonly [name: string, body: string, verdict: 'inert' | 'early' | 'swallow']> = [
  ['ただの JS', 'var a=1;', 'inert'],
  ['終了タグ', `var a="${CLOSE}>";`, 'early'],
  ['終了タグ+空白', `var a="${CLOSE} >";`, 'early'],
  ['終了タグ+タブ', `var a="${CLOSE}\t>";`, 'early'],
  ['終了タグ+斜線', `var a="${CLOSE}/";`, 'early'],
  ['終了タグ 大文字', `var a="${LT}/SCRIPT>";`, 'early'],
  ['終了タグ+英字 (区切りでない)', `var a="${CLOSE}x>";`, 'inert'],
  ['コメント開きだけ', `var a="${CMT_OPEN}";`, 'inert'],
  ['コメント開き→開始タグ', `var a="${CMT_OPEN}${OPEN_TAG}";`, 'swallow'],
  ['コメントが先に閉じている', `var a="${CMT_OPEN} ${CMT_CLOSE}${OPEN_TAG}";`, 'inert'],
];

describe('生テキスト要素へ綴じ込む前の関門 (assertRawTextInert)', () => {
  it.each(MEASURED)('%s → %s', (_name, body, verdict) => {
    const run = () => {
      assertRawTextInert(body, S, '標本');
    };
    if (verdict === 'inert') {
      // 「コメント開き→終了タグ→開始タグ」のような珍しい形はこちらが安全側へ倒す
      // ことがあるが、この表の inert 行はすべて通ること。
      expect(run).not.toThrow();
    } else {
      expect(run).toThrow(/inline-html/);
    }
  });

  it('`indexOf` では取りこぼす 3 形 —— 素朴な検索との差がそのまま穴だった', () => {
    const missed = MEASURED.filter(
      ([, body, verdict]) => verdict !== 'inert' && !body.includes(`${CLOSE}>`),
    );
    // 標本が本当に「素朴な検索では見つからない」ことを、同じ検査の中で確かめる。
    for (const [, body] of missed) expect(body.indexOf(`${CLOSE}>`)).toBe(-1);
    expect(missed.length).toBeGreaterThanOrEqual(3);
    for (const [, body] of missed) {
      expect(() => {
        assertRawTextInert(body, S, '標本');
      }).toThrow();
    }
  });

  it('例外の文面は、どの字面か・どこかを言う', () => {
    const body = `var a="${CLOSE} >";`;
    expect(() => {
      assertRawTextInert(body, S, 'インライン JS (assets/x.js)');
    }).toThrow(/assets\/x\.js.*offset \d+/s);
  });
});

describe('endTagHazard / escapeHazard', () => {
  it('英字が続く終了タグ風は区切りではない', () => {
    expect(endTagHazard(`${CLOSE}x>`, S)).toBe(-1);
    expect(endTagHazard(`${CLOSE} >`, S)).toBe(0);
  });

  it('style は escaped 状態を持たないので、コメントは無害', () => {
    expect(endTagHazard(`${LT}/style >`, 'style')).toBe(0);
    // script 専用の飲み込みは style には当てない。
    expect(() => {
      assertRawTextInert(`${CMT_OPEN}${OPEN_TAG}`, 'style', 'CSS');
    }).not.toThrow();
  });

  it('閉じたコメントは数え直され、開いたままのものだけが鳴る', () => {
    expect(escapeHazard(`${CMT_OPEN} ${CMT_CLOSE} ${OPEN_TAG}`)).toBe(-1);
    expect(escapeHazard(`${CMT_OPEN} ${CMT_CLOSE} ${CMT_OPEN} ${OPEN_TAG}`)).toBeGreaterThan(0);
  });

  it('コメントの後に開始タグが無ければ鳴らない', () => {
    expect(escapeHazard(`${CMT_OPEN} なにも続かない`)).toBe(-1);
  });
});

describe('scriptEndIndex —— 検算側の走査器も同じ規則で見る', () => {
  it('空白入りの終了タグを終端として見つける', () => {
    const html = `${LT}${S}>body${CLOSE} >tail`;
    expect(scriptEndIndex(html, html.indexOf('>'))).toBe(html.indexOf(CLOSE));
  });

  it('見つからなければ -1', () => {
    expect(scriptEndIndex(`${LT}${S}>body`, 0)).toBe(-1);
  });
});

describe('綴じ込み経路そのもの', () => {
  const INDEX_HTML = [
    '<!doctype html><html><head>',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'" />`,
    `${LT}${S} type="module" crossorigin src="./assets/app.js">${CLOSE}>`,
    '<link rel="stylesheet" crossorigin href="./assets/app.css">',
    '</head><body><div id="root"></div></body></html>',
  ].join('');

  const build = (js: string, css = 'body{margin:0}') =>
    inlineStandalone(INDEX_HTML, (rel: string) => (rel.endsWith('.css') ? css : js));

  it('無害なバンドルは通る (対照)', () => {
    expect(() => build('var a=1;')).not.toThrow();
  });

  it('XSS 標本が 1 つ増えただけでビルドが落ちる —— 白画面を出荷しない', () => {
    expect(() => build(`var payloads=["${CMT_OPEN}${OPEN_TAG}"];`)).toThrow(/inline-html.*script/s);
  });

  it('CSS 側も同じ関門を通る', () => {
    expect(() => build('var a=1;', `.a::after{content:"${LT}/style >"}`)).toThrow(/インライン CSS/);
  });
});
