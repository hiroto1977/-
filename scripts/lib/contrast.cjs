'use strict';
/**
 * **文字色 × 地の色の対比 (WCAG 2.x の相対輝度)** —— 2026-10-02 (パス 503)。
 *
 * 使い手は 2 つで、どちらも**この 1 つの計算**を読む (写しを作らない):
 *
 *   - `src/renderer/__tests__/themeContrast.test.ts` —— トークン表 (4 枚) の対を Node で
 *   - `scripts/e2e/core.cjs` の `contrast` suite —— **実機 (Chromium) で描画済みの色**を全画面 × 4 配色で
 *
 * ## なぜ 2 層か
 *
 * トークン表の対は「そう描けば読める」しか言わない。実測 (2026-10-02 · 4 配色 × 75 画面 = 約 8.9 万の文字要素) では
 * **表の対は合っていても、描く側が別の対を作っていた**: 塗り (`--accent` / `--gradient`) の上に地の文字色
 * (`--text`) を載せる・意味色の塗りの上に固定の白 (`#fff`) を載せる・配色に追随しない面 (濃紺の盤・白い板) の上に
 * トークンの字を載せる。**どれもトークン表を見ても出てこない**。だから描画済みの色を測る層が要る。
 *
 * ## 規則
 *
 * - 通常の文字は 4.5:1、**大きい文字** (24px 以上 / 太字なら 18.66px 以上) は 3:1 (WCAG 1.4.3 AA)。
 * - 測らない物 (理由つき): 見えていない (opacity < 0.1・display:none・大きさ 0) / 無効化された部品
 *   (`:disabled` / `aria-disabled` —— WCAG が対象外とする) / 字も数も無い (絵文字・記号だけ) / `OPTION`。
 * - 地が**半透明**なら下の地に重ねて合成する。**地がグラデーション**なら全部の停止点で測って最悪を取る。
 *   **地が画像**のときは測れないので `unknown` として数える (見つからなかったとは言わない)。
 *
 * `contrastMath()` と `measureDocument()` は**自由変数を持たない** —— 実機のページへ関数の**ソース文字列**として
 * 送るため (`page.evaluate(関数)` はページの CSP の外で走るので送れるが、`new Function` / `eval` はページの CSP が拒む)。
 * そのため Node 側の検査も同じ関数を呼べる (`contrastMath()`)。
 */

/** @returns {{parse: (s: string) => ({r:number,g:number,b:number,a:number}|null), over: Function, lum: Function, ratio: Function, hex: Function}} */
function contrastMath() {
  const num = (s) => Number(s);
  /** CSS の色 (`#rgb` / `#rrggbb` / `#rrggbbaa` / `rgb(a)(…)` / `color(srgb …)`) → {r,g,b,a}。読めなければ null。 */
  const parse = (s) => {
    if (!s) return null;
    const str = String(s).trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(str);
    if (m) {
      const h = m[1];
      if (h.length === 3 || h.length === 4) {
        const v = [...h].map((c) => parseInt(c + c, 16));
        return { r: v[0], g: v[1], b: v[2], a: v.length === 4 ? v[3] / 255 : 1 };
      }
      if (h.length === 6 || h.length === 8) {
        const v = [0, 2, 4, 6].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
        return { r: v[0], g: v[1], b: v[2], a: h.length === 8 ? v[3] / 255 : 1 };
      }
      return null;
    }
    m = /rgba?\(([^)]+)\)/.exec(str) || /color\(srgb ([^)]+)\)/.exec(str);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(num);
    if (/^color\(srgb/.test(str)) return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  /** `top` を `bottom` の上に重ねた色 (不透明)。`extra` は要素全体の不透明度。 */
  const over = (top, bottom, extra = 1) => {
    const a = top.a * extra;
    return {
      r: top.r * a + bottom.r * (1 - a),
      g: top.g * a + bottom.g * (1 - a),
      b: top.b * a + bottom.b * (1 - a),
      a: 1,
    };
  };
  const chan = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const hex = (c) =>
    '#' +
    [c.r, c.g, c.b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('');
  return { parse, over, lum, ratio, hex };
}

/** 大きい文字 (WCAG: 18pt = 24px 以上、または 14pt = 18.66px 以上の太字)。 */
function isLargeText(sizePx, weight) {
  return sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);
}

/** その文字に要る対比。 */
function requiredRatio(sizePx, weight) {
  return isLargeText(sizePx, weight) ? 3 : 4.5;
}

/**
 * **実機のページの中で走る測定。** 文字を持つ可視の要素 (と placeholder) ごとに、描画済みの文字色と
 * 重なった地の色の対比の最悪値を返す。自由変数を持たない (`M` = `contrastMath()` の結果だけ受け取る)。
 *
 * 返す行: { key, text, fg, bg, ratio, size, weight, large, unknown, textAlpha, inInput, svg?, placeholder?, style?, parent?, pstyle? }
 *
 * @param {ReturnType<typeof contrastMath>} M
 */
function measureDocument(M) {
  const { parse, over, ratio, hex } = M;
  const stopsOf = (img) => {
    if (!img || img === 'none') return null;
    if (!/gradient/.test(img)) return 'image';
    const stops = [...img.matchAll(/rgba?\([^)]*\)/g)].map((m) => parse(m[0])).filter(Boolean);
    return stops.length ? stops : 'image';
  };
  const canvas = { r: 255, g: 255, b: 255, a: 1 };
  const darkScheme = getComputedStyle(document.documentElement).colorScheme.includes('dark');
  // ブラウザの既定の地 (何も塗られていない所): color-scheme に追随する
  const base0 = darkScheme ? { r: 18, g: 18, b: 18, a: 1 } : canvas;
  /** 先祖の地を上から順に重ねる。グラデーションは停止点ごとに分けて、最悪を後で選ぶ。 */
  function bgCandidates(el) {
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.push(n);
    chain.reverse();
    let cands = [base0];
    let unknown = false;
    for (const n of chain) {
      const cs = getComputedStyle(n);
      const col = parse(cs.backgroundColor);
      if (col && col.a > 0) cands = cands.map((c) => over(col, c, 1));
      const st = stopsOf(cs.backgroundImage);
      if (st === 'image') unknown = true;
      else if (st) {
        const next = [];
        for (const c of cands) for (const s of st) next.push(over(s, c, 1));
        cands = next.length > 24 ? next.slice(0, 24) : next;
      }
    }
    return { cands, unknown };
  }
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  /**
   * **SVG の文字の地** —— 先祖の `background` は SVG の中の図形を知らない。円グラフの扇・濃紺の下地の `<rect>`・
   * 凡例の枠の上に置いた字は、**その図形の塗り**の上に載る (見ないと、扇の上の白い字を「白い頁の上の白」と測って
   * 1:1 と誤り、濃紺の下地の上の明るい字を「白い頁の上の明るい字」と測って 1.2:1 と誤る —— 2026-10-02 の実測では、
   * SVG の字で割った 23 行のうち 22 行がこの誤り (円グラフの割合 12・チームレーダーの軸名 10) で、本物は 1 行だった)。
   *
   * 同じ `<svg>` の中で**この字より前 (= 下) に描かれた**図形のうち、字の中心を塗っている物を下から順に返す。
   * 図形の判定は `isPointInFill` (幾何だけを見る・`fill-rule` も効く) で、点は図形の座標系へ戻して渡す。
   * 塗りがグラデーション・パターン (`url(…)`) のときは色が決まらないので `unknown`。
   */
  const shapeCache = new Map();
  const shapeInfo = (s, svg) => {
    let info = shapeCache.get(s);
    if (info !== undefined) return info;
    const cs = getComputedStyle(s);
    info = { skip: false, unknown: false, col: null, alpha: 1 };
    if (cs.display === 'none' || cs.visibility === 'hidden' || !cs.fill || cs.fill === 'none') {
      info.skip = true;
    } else if (/url\(/.test(cs.fill)) {
      info.unknown = true;
    } else {
      const col = parse(cs.fill);
      if (!col) info.skip = true;
      else {
        let a = Number(cs.fillOpacity || 1);
        // この図形から <svg> まで (SVG の中だけ。外側の不透明度は字にも等しく掛かるので字の側で数える)
        for (let n = s; n && n !== svg; n = n.parentElement) a *= Number(getComputedStyle(n).opacity);
        info.col = col;
        info.alpha = a;
      }
    }
    shapeCache.set(s, info);
    return info;
  };
  const svgGround = (el) => {
    const svg = el.ownerSVGElement;
    const none = { shapes: [], unknown: false };
    if (!svg || typeof DOMPoint === 'undefined') return none;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const shapes = [];
    let unknown = false;
    for (const s of svg.querySelectorAll('rect, circle, ellipse, polygon, polyline, path')) {
      if (!(el.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
      const info = shapeInfo(s, svg);
      if (info.skip) continue;
      let inside = false;
      try {
        const m = s.getScreenCTM();
        if (m && typeof s.isPointInFill === 'function') inside = s.isPointInFill(new DOMPoint(cx, cy).matrixTransform(m.inverse()));
      } catch {
        inside = false;
      }
      if (!inside) continue;
      if (info.unknown) unknown = true;
      else shapes.push(info);
    }
    return { shapes, unknown };
  };
  const visible = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const classOf = (el) =>
    el && typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const txt = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!txt) continue;
    const el = node.parentElement;
    if (!el || seen.has(el)) continue;
    if (/^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(el.tagName)) continue;
    if (!visible(el)) continue;
    if (opacityOf(el) < 0.1) continue; // 見えていない (ホバーで現れる ♡ ほか)
    // 無効化された部品は WCAG の対象外
    if (el.closest('button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled="true"], fieldset:disabled')) continue;
    if (!/[\p{L}\p{N}]/u.test(txt)) continue; // 字も数も無い (絵文字・記号だけ) は文字の対比の対象にしない
    seen.add(el);
    const cs = getComputedStyle(el);
    const isSvg = typeof SVGElement !== 'undefined' && el instanceof SVGElement;
    // SVG の文字の色は `color` ではなく `fill`
    const fg0 = isSvg
      ? (() => {
          const f = parse(cs.fill);
          return f ? { ...f, a: f.a * Number(cs.fillOpacity || 1) } : null;
        })()
      : parse(cs.color);
    if (!fg0) continue;
    const textAlpha = fg0.a * opacityOf(el);
    const html = bgCandidates(el);
    let cands = html.cands;
    let unknown = html.unknown;
    if (isSvg) {
      const g = svgGround(el);
      if (g.unknown) unknown = true;
      // 図形の塗りを下から順に、HTML の地の上へ重ねる (半透明の図形の重なりも合成される)
      if (g.shapes.length > 0) cands = cands.map((b) => g.shapes.reduce((acc, s) => over(s.col, acc, s.alpha), b));
    }
    let worst = Infinity;
    let worstBg = null;
    let worstFg = null;
    for (const bg of cands) {
      const fg = over(fg0, bg, opacityOf(el));
      const r = ratio(fg, bg);
      if (r < worst) {
        worst = r;
        worstBg = bg;
        worstFg = fg;
      }
    }
    let size = parseFloat(cs.fontSize);
    if (isSvg) {
      // viewBox の縮尺 (描画幅 / viewBox 幅) を掛けて、実際に見える大きさにする
      const svg = el.ownerSVGElement;
      const vb = svg && svg.viewBox && svg.viewBox.baseVal;
      if (svg && vb && vb.width > 0) size = size * (svg.getBoundingClientRect().width / vb.width);
    }
    const weight = Number(cs.fontWeight) || 400;
    out.push({
      key: el.tagName.toLowerCase() + classOf(el),
      text: txt.slice(0, 40),
      fg: hex(worstFg),
      bg: hex(worstBg),
      ratio: Number(worst.toFixed(2)),
      size,
      weight,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      unknown,
      textAlpha: Number(textAlpha.toFixed(2)),
      inInput: /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName),
      svg: isSvg || undefined,
      style: (el.getAttribute('style') || '').slice(0, 160),
      parent: el.parentElement ? el.parentElement.tagName.toLowerCase() + classOf(el.parentElement) : '',
      pstyle: el.parentElement ? (el.parentElement.getAttribute('style') || '').slice(0, 160) : '',
    });
  }
  // placeholder (擬似要素の色)
  for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    if (!visible(el)) continue;
    const ph = getComputedStyle(el, '::placeholder');
    const fg0 = parse(ph.color);
    if (!fg0) continue;
    const { cands } = bgCandidates(el);
    let worst = Infinity;
    let worstBg = null;
    let worstFg = null;
    const o = opacityOf(el) * Number(ph.opacity || 1);
    for (const bg of cands) {
      const fg = over(fg0, bg, o);
      const r = ratio(fg, bg);
      if (r < worst) {
        worst = r;
        worstBg = bg;
        worstFg = fg;
      }
    }
    out.push({
      key: 'placeholder:' + el.tagName.toLowerCase() + classOf(el),
      text: String(el.getAttribute('placeholder')).slice(0, 40),
      fg: hex(worstFg),
      bg: hex(worstBg),
      ratio: Number(worst.toFixed(2)),
      size: parseFloat(getComputedStyle(el).fontSize),
      weight: 400,
      large: false,
      unknown: false,
      textAlpha: 1,
      inInput: true,
      placeholder: true,
    });
  }
  return out;
}

/**
 * 実機のページで評価する式 (文字列)。`page.evaluate(sweepExpression())` で呼ぶ —— 関数ではなく**文字列**にするのは、
 * 2 つの自由変数なしの関数を 1 つの式へ束ねるため (Playwright は文字列の式を CDP の `Runtime.evaluate` で走らせるので、
 * ページの CSP (`unsafe-eval` なし) に拒まれない)。
 */
function sweepExpression() {
  return `(() => { const M = (${contrastMath.toString()})(); return (${measureDocument.toString()})(M); })()`;
}

/** 測った行 → 基準を割った行 (測れなかった行 `unknown` は割ったとは数えない)。 */
function violationsOf(rows) {
  return rows.filter((r) => !r.unknown && r.ratio < requiredRatio(r.size, r.weight));
}

/** 割った行を「何が・どの色で」で畳む (同じ原因の行を 1 つにする)。多い順。 */
function groupViolations(rows) {
  const groups = new Map();
  for (const r of violationsOf(rows)) {
    const k = `${r.key} | fg ${r.fg} | bg ${r.bg} | ${r.size}px/${r.weight}`;
    const g = groups.get(k) || { n: 0, pages: new Set(), sample: r.text, ratio: r.ratio, key: r.key, fg: r.fg, bg: r.bg, large: r.large, placeholder: !!r.placeholder, svg: !!r.svg };
    g.n += 1;
    if (r.page) g.pages.add(r.page);
    groups.set(k, g);
  }
  return [...groups.entries()]
    .map(([k, g]) => ({ k, ...g }))
    .sort((a, b) => b.pages.size - a.pages.size || b.n - a.n);
}

module.exports = { contrastMath, measureDocument, sweepExpression, isLargeText, requiredRatio, violationsOf, groupViolations };
