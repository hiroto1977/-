'use strict';
/**
 * **操作子の見え方と届き方** —— 2026-10-03 (パス 504)。文字の対比 (`contrast.cjs`・パス 503) が測らなかった
 * 「字ではない物」と「操作できるか」を、**実機 (Chromium) で描画済みの状態**で測る。
 *
 * 測る 5 つ (規則はどれも WCAG 2.x の AA):
 *
 * | 軸 | 何を測るか | 基準 |
 * | --- | --- | --- |
 * | 入力欄の輪郭 | 入力欄・選択・複数行の**境界** (枠線 / 地の差) が、その下の地に 3:1 以上 | 1.4.11 非テキストのコントラスト |
 * | フォーカスの輪 | 操作子へ**キーボードで焦点を置いたとき**、幅 2px 以上で下の地に 3:1 以上の輪が出る | 1.4.11 / 2.4.7 |
 * | 押せる大きさ | 24×24 CSS px 未満の目標は、半径 12px の円が他の目標に触れない (間隔の例外) | 2.5.8 目標のサイズ (最低限) |
 * | キーボードで届く | `cursor: pointer` なのに焦点を取れず、焦点を取れる先祖も子孫も無い物が無い | 2.1.1 キーボード |
 * | 名前 | 操作子 (ボタン・入力欄・選択ほか) の**アクセシブルな名前**が空でない | 4.1.2 名前・役割・値 |
 *
 * 前の 4 つは**ページの中で走る** (`measureControls`)。5 つ目は**ブラウザ自身が計算した名前**を CDP の
 * アクセシビリティ木から読む (`axUnnamedControls`) —— 名前の計算 (`aria-labelledby` → `aria-label` → `<label>` →
 * 中身 → `title` ...) を自分で書くと、ブラウザの答えと食い違う。
 *
 * ## なぜ実機で測るか (パス 503 と同じ理由)
 *
 * トークン表の対 (`themeContrast.test.ts`) は「その色の枠を描けば見える」しか言わない。実測 (2026-10-03・4 配色 × 全 74 画面) では
 * **表を直しても、描く側が別の枠を作る**: 入力欄 758 のうち**画面の style が枠の色を直に決めている所が約 8 割** (`border: 1px solid var(--border)`)
 * で、全体の規則を直しても届かない。描いた結果を測る層が要る。
 *
 * ## 規則の置き場
 *
 * - 判定の**数** (3:1・2px・24px) と幾何は `controlMath()` に 1 つ。Node の検査 (`controlsLib.test.ts`) もページの中も同じ関数を読む。
 * - 地の色の数え方は `contrast.cjs` の `groundTools()` を読む (枠線もフォーカスの輪も「その下の地」で測る)。
 * - `measureControls()` / `controlMath()` は**自由変数を持たない** (ページへ**ソース文字列**として送る —— ページの CSP は `eval` を拒むので、
 *   `page.evaluate(文字列)` = CDP の `Runtime.evaluate` で評価する)。
 *
 * ## 測らない物 (正直に)
 *
 * ホバー / 押している最中の状態・開く前の折りたたみとモーダルの中・canvas・チャートの線や記号の 3:1 (図形そのものの対比)・
 * 状態を色だけで伝える物 (WCAG 1.4.1)・タッチ以外の入力・無効化された部品 (WCAG が対象外とする)。
 */

const { contrastMath, groundTools } = require('./contrast.cjs');

/**
 * 判定の数と幾何 (純関数・自由変数なし)。**ページの中でも Node でも同じ物を読む**ので、ここだけが数を持つ。
 */
function controlMath() {
  /** WCAG 1.4.11: 非テキストの部品とその状態に要る対比。 */
  const MIN_NON_TEXT_RATIO = 3;
  /** WCAG 2.5.8: 目標の最低の大きさ (CSS px)。 */
  const MIN_TARGET_PX = 24;
  /** フォーカスの輪の最低の太さ (CSS px)。1px の枠の色替えだけでは「輪」と数えない。 */
  const MIN_RING_PX = 2;

  /** 焦点を取った操作子が見えている (実効の不透明度)。ホバーでだけ現れる物は、焦点でも現れなければならない。 */
  const MIN_FOCUSED_OPACITY = 0.5;
  const revealOk = (opacity) => opacity >= MIN_FOCUSED_OPACITY;

  const isSmall = (r) => r.width < MIN_TARGET_PX || r.height < MIN_TARGET_PX;
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /**
   * 24px 未満の目標 `a` の、**間隔の例外**を満たさない相手の添字 (満たしていれば -1)。
   * WCAG 2.5.8: 小さい目標の外接の中心に**直径 24px の円**を置き、その円が (1) 他の目標、(2) 他の小さい目標の円 のどちらにも
   * 触れなければ適合。接する (距離がちょうど半径の和) だけなら触れていない。
   *
   * @param {{left:number,top:number,width:number,height:number,right:number,bottom:number}} a
   * @param {{left:number,top:number,width:number,height:number,right:number,bottom:number}[]} others
   */
  const spacingConflict = (a, others) => {
    const ca = centre(a);
    for (let i = 0; i < others.length; i++) {
      const b = others[i];
      if (isSmall(b)) {
        const cb = centre(b);
        if (Math.hypot(ca.x - cb.x, ca.y - cb.y) < MIN_TARGET_PX) return i;
      } else {
        const nx = clamp(ca.x, b.left, b.right);
        const ny = clamp(ca.y, b.top, b.bottom);
        if (Math.hypot(ca.x - nx, ca.y - ny) < MIN_TARGET_PX / 2) return i;
      }
    }
    return -1;
  };

  /**
   * 入力欄の輪郭: 枠線と、地との差 (塗り) の**どちらか**が 3:1 以上なら境界は見える。
   * @param {number} border 枠線の対比 (枠が無ければ 0)
   * @param {number} fill 塗りの対比 (地と同じなら 1)
   */
  const boundaryBest = (border, fill) => Math.max(border, fill);
  const boundaryOk = (border, fill) => boundaryBest(border, fill) >= MIN_NON_TEXT_RATIO;

  /**
   * フォーカスの輪: 部品 `{ kind, widthPx, ratio }` のうち、**幅が 2px 以上で対比が 3:1 以上**の物が 1 つでも在れば適合。
   * `best` は「数えられる (2px 以上の) 部品」の対比の最大 (無ければ 0)・`bestAny` は太さを問わない最大。
   */
  const indicatorVerdict = (parts) => {
    let best = 0;
    let bestAny = 0;
    for (const p of parts) {
      bestAny = Math.max(bestAny, p.ratio);
      if (p.widthPx >= MIN_RING_PX) best = Math.max(best, p.ratio);
    }
    return { ok: best >= MIN_NON_TEXT_RATIO, best, bestAny };
  };

  return { MIN_NON_TEXT_RATIO, MIN_TARGET_PX, MIN_RING_PX, MIN_FOCUSED_OPACITY, isSmall, centre, spacingConflict, boundaryBest, boundaryOk, indicatorVerdict, revealOk };
}

/**
 * **実機のページの中で走る測定。** 全部で 4 つの行の列を返す (名前は Node 側の CDP):
 *
 * - `fields`   入力欄の輪郭: { sig, border, fill, best, via ('self' | 'wrapper'), unknown, html }
 * - `focus`    フォーカスの輪: { sig, focused, focusVisible, changed, parts[], ok, best, bestAny, html }
 * - `targets`  押せる大きさ: { sig, w, h, undersized, spacingOk, via, html }
 * - `mouseOnly` キーボードで届かない: { sig, why, html }
 *
 * 自由変数を持たない (`M` = `contrastMath()`・`G` = `groundTools(M)`・`C` = `controlMath()` の結果だけ受け取る)。
 *
 * @param {ReturnType<typeof contrastMath>} M
 * @param {ReturnType<typeof groundTools>} G
 * @param {ReturnType<typeof controlMath>} C
 * @param {{ focusSample?: number }} [opts]
 */
function measureControls(M, G, C, opts) {
  const { parse, over, ratio } = M;
  const { bgCandidates, opacityOf, visible, classOf } = G;
  const focusSample = (opts && opts.focusSample) || 60;

  const INTERACTIVE =
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="slider"], [role="option"], [role="combobox"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
  const FOCUSABLE_UP =
    'button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], label, summary, select, input, textarea, [tabindex]';
  const ROLE_INTERACTIVE = '[role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="combobox"]';
  const NATIVE_FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary';
  const FIELD =
    'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="hidden"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]), select, textarea';

  /** 開いていない `<details>` の中身 (見出し `summary` は除く) は、画面に出ていない。 */
  const inClosedDetails = (el) => {
    const d = el.closest('details:not([open])');
    if (d === null) return false;
    const sum = d.querySelector(':scope > summary');
    return !(sum && sum.contains(el));
  };
  /** 画面にレイアウトされている (display / visibility / 大きさ・aria-hidden・閉じた折りたたみ)。**見えるかどうか (opacity) は問わない** —— ホバーで現れる操作子も、キーボードでは焦点を取れる。 */
  const present = (el) => {
    if (!visible(el)) return false;
    if (inClosedDetails(el)) return false;
    // `inert` の中は押せず・焦点も取れず・読み上げにも出ない (閉じたドロワーの中身・開いたドロワーの後ろの本文 —— パス 506)
    for (let n = el; n; n = n.parentElement) if (n.getAttribute && (n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert'))) return false;
    return true;
  };
  /** `present` かつ、見える濃さ (実効の不透明度 0.1 以上)。 */
  const shown = (el) => present(el) && opacityOf(el) >= 0.1;
  const disabled = (el) => el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || !!el.closest('fieldset:disabled');
  const sig = (el) => el.tagName.toLowerCase() + classOf(el) + (el.getAttribute('type') ? '[' + el.getAttribute('type') + ']' : '');
  const html = (el) => el.outerHTML.replace(/\s+/g, ' ').slice(0, 140);
  /** el の**下**の地 (el 自身の背景は含めない)。 */
  const beneath = (el) => bgCandidates(el.parentElement || el);
  const round2 = (n) => Math.round(n * 100) / 100;

  const out = { fields: [], focus: [], targets: [], mouseOnly: [], sliders: [] };

  // ---- 入力欄の輪郭 ----
  const boundaryOf = (el) => {
    const cs = getComputedStyle(el);
    const { cands, unknown } = beneath(el);
    const own = parse(cs.backgroundColor);
    const bw = parseFloat(cs.borderTopWidth) || 0;
    const bcol = parse(cs.borderTopColor);
    const hasBorder = bw >= 1 && cs.borderTopStyle !== 'none' && cs.borderTopStyle !== 'hidden' && !!bcol && bcol.a > 0;
    let fillR = Infinity;
    let borderR = Infinity;
    for (const c of cands) {
      const fill = own && own.a > 0 ? over(own, c, 1) : c;
      fillR = Math.min(fillR, ratio(fill, c));
      if (hasBorder) borderR = Math.min(borderR, ratio(over(bcol, fill, 1), c));
    }
    return { border: hasBorder ? borderR : 0, fill: fillR, unknown };
  };
  /**
   * 入力欄を**囲む箱**。欄自身に境界が無くても、囲む箱が枠を持つ形がある (チャットの入力欄: 箱が枠を持ち、中の欄は枠を持たず、
   * 送信ボタンも同じ箱に入る)。欄を含み、左・上・下の余白が 24px 以内で、枠を持つ最も近い祖先 (2 段まで)。
   * 右は他の操作子が同じ箱に入りうるので問わない。
   */
  const wrapperOf = (el) => {
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement, depth = 0; p && depth < 2; p = p.parentElement, depth++) {
      const pr = p.getBoundingClientRect();
      const around = pr.left <= r.left + 0.5 && pr.top <= r.top + 0.5 && pr.right >= r.right - 0.5 && pr.bottom >= r.bottom - 0.5 && r.left - pr.left <= 24 && r.top - pr.top <= 24 && pr.bottom - r.bottom <= 24;
      if (!around) continue;
      const cs = getComputedStyle(p);
      if ((parseFloat(cs.borderTopWidth) || 0) >= 1 && cs.borderTopStyle !== 'none') return p;
    }
    return null;
  };
  /** 欄自身の境界が見えないときだけ、囲む箱を見る。 */
  const ownOrWrapper = (el) => {
    const own = boundaryOf(el);
    if (C.boundaryOk(own.border, own.fill)) return { b: own, via: 'self', wrapper: null };
    const w = wrapperOf(el);
    if (w === null) return { b: own, via: 'self', wrapper: null };
    const wb = boundaryOf(w);
    return C.boundaryBest(wb.border, wb.fill) > C.boundaryBest(own.border, own.fill) ? { b: wb, via: 'wrapper', wrapper: w } : { b: own, via: 'self', wrapper: null };
  };
  for (const el of document.querySelectorAll(FIELD)) {
    if (!shown(el) || disabled(el)) continue;
    const { b, via } = ownOrWrapper(el);
    out.fields.push({ sig: sig(el), border: round2(b.border), fill: round2(b.fill), best: round2(C.boundaryBest(b.border, b.fill)), via, unknown: b.unknown, html: html(el) });
  }

  // ---- スライダーのつまみ (値の位置を伝える部品。WCAG 1.4.11) ----
  // `getComputedStyle(el, '::-webkit-slider-thumb')` は**つまみの値を返さない** (要素自身の値が返る —— 実測で縁も塗りも空になり、
  // 何でも「見える」と測ってしまった)。つまみの規則は stylesheet に 1 つだけ在るので、**規則そのもの** (CSSOM) から縁と塗りを読み、
  // `var(--…)` は仮の要素に当てて**解決した色**にする。規則が見つからなければ `readable: false` (測れなかったと言う)。
  const thumbStyle = () => {
    let rule = null;
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const r of rules) if (r.selectorText && r.selectorText.includes('::-webkit-slider-thumb') && r.selectorText.includes('range')) rule = r;
    }
    if (rule === null) return null;
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    try {
      const colourOf = (text) => {
        probe.style.color = '';
        probe.style.color = text;
        return parse(getComputedStyle(probe).color);
      };
      const border = rule.style.getPropertyValue('border') || '';
      // `2px solid var(--accent-strong)` → 幅・線種・色 (括弧の中の空白では割らない)
      const parts = border.match(/(?:[^\s(]+|\([^)]*\))+/g) || [];
      const widthTok = parts.find((t) => /^\d+(\.\d+)?px$/.test(t));
      const styleTok = parts.find((t) => /^(solid|dashed|dotted|double)$/.test(t));
      const colourTok = parts.filter((t) => t !== widthTok && t !== styleTok).join(' ');
      const bg = rule.style.getPropertyValue('background') || rule.style.getPropertyValue('background-image') || '';
      probe.style.backgroundImage = '';
      probe.style.backgroundColor = '';
      probe.style.background = bg;
      const cs = getComputedStyle(probe);
      const stops = /gradient/.test(cs.backgroundImage) ? [...cs.backgroundImage.matchAll(/rgba?\([^)]*\)/g)].map((m) => parse(m[0])).filter(Boolean) : [parse(cs.backgroundColor)].filter((c) => c && c.a > 0);
      return {
        borderWidth: widthTok ? parseFloat(widthTok) : 0,
        borderColor: styleTok && colourTok ? colourOf(colourTok) : null,
        fillStops: stops,
        rule: rule.selectorText,
      };
    } finally {
      probe.remove();
    }
  };
  const thumb = thumbStyle();
  for (const el of document.querySelectorAll('input[type="range"]')) {
    if (!shown(el) || disabled(el)) continue;
    const { cands, unknown } = beneath(el);
    if (thumb === null) {
      out.sliders.push({ sig: sig(el), vsPage: 0, vsTrack: 0, best: 0, unknown, readable: false, html: html(el) });
      continue;
    }
    // 溝の色: 溝の規則は thumb とは別 (`::-webkit-slider-runnable-track`)。溝の上にもつまみは載るので、溝の色も同じ手で読む
    const trackCol = (() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const r of rules) {
          if (r.selectorText && r.selectorText.includes('::-webkit-slider-runnable-track') && r.selectorText.includes('range')) {
            const probe = document.createElement('span');
            document.body.appendChild(probe);
            probe.style.background = r.style.getPropertyValue('background') || '';
            const c = parse(getComputedStyle(probe).backgroundColor);
            probe.remove();
            return c;
          }
        }
      }
      return null;
    })();
    const onTrack = trackCol && trackCol.a > 0 ? cands.map((c) => over(trackCol, c, 1)) : cands;
    // つまみは「縁」か「塗り」のどちらかが、下の地にも溝にも 3:1 以上で見えればよい
    const against = (bgs) => {
      let w = Infinity;
      for (const g of bgs) {
        const fillR = thumb.fillStops.length ? Math.min(...thumb.fillStops.map((f) => ratio(over(f, g, 1), g))) : 0;
        const borderR = thumb.borderWidth >= 1 && thumb.borderColor && thumb.borderColor.a > 0 ? ratio(over(thumb.borderColor, g, 1), g) : 0;
        w = Math.min(w, Math.max(fillR, borderR));
      }
      return w;
    };
    const vsPage = against(cands);
    const vsTrack = against(onTrack);
    out.sliders.push({ sig: sig(el), vsPage: round2(vsPage), vsTrack: round2(vsTrack), best: round2(Math.min(vsPage, vsTrack)), unknown, readable: true, html: html(el) });
  }

  // ---- 目標と焦点 ----
  const all = [...document.querySelectorAll(INTERACTIVE)].filter((el) => present(el) && !disabled(el));

  // フォーカスの輪
  const snap = (el) => {
    const cs = getComputedStyle(el);
    return {
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      boxShadow: cs.boxShadow,
      borderColor: cs.borderTopColor,
      borderWidth: cs.borderTopWidth,
      background: cs.backgroundColor,
      color: cs.color,
      textDecoration: cs.textDecorationLine,
      filter: cs.filter,
      transform: cs.transform,
    };
  };
  const worstOf = (c, cands) => {
    let w = Infinity;
    for (const b of cands) w = Math.min(w, ratio(c.a < 1 ? over(c, b, 1) : c, b));
    return w;
  };
  const partsOf = (before, after, cands) => {
    const parts = [];
    if (after.outlineStyle !== 'none' && parseFloat(after.outlineWidth) > 0) {
      const c = parse(after.outlineColor);
      if (c && c.a > 0) parts.push({ kind: 'outline', widthPx: parseFloat(after.outlineWidth), ratio: round2(worstOf(c, cands)) });
    }
    if (after.boxShadow && after.boxShadow !== 'none') {
      // `color blur? offsets spread` の順は computed 値では `rgb(...) 0px 0px 0px 3px`
      for (const m of after.boxShadow.matchAll(/(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?(\s+inset)?/g)) {
        const spread = m[5] === undefined ? 0 : Number(m[5]);
        if (m[6] || Number(m[4]) !== 0 || spread <= 0) continue; // 内側の影・ぼかした光彩は輪ではない
        const c = parse(m[1]);
        if (c && c.a > 0) parts.push({ kind: 'ring', widthPx: spread, ratio: round2(worstOf(c, cands)) });
      }
    }
    if (before.borderColor !== after.borderColor) {
      const c = parse(after.borderColor);
      const w = parseFloat(after.borderWidth) || 0;
      if (c && c.a > 0 && w > 0) parts.push({ kind: 'border', widthPx: w, ratio: round2(worstOf(c, cands)) });
    }
    return parts;
  };
  const seen = new Set();
  const pick = [];
  for (const el of all) {
    if (!(el.tabIndex >= 0 || el.matches(NATIVE_FOCUSABLE))) continue;
    // 同じ見た目のものは 1 つ。インラインの style・下の地が違えば別に数える (style で輪を消した物を取りこぼさない)
    const key = sig(el) + '|' + (el.getAttribute('style') || '') + '|' + (el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : '');
    if (seen.has(key)) continue;
    seen.add(key);
    pick.push(el);
    if (pick.length >= focusSample) break;
  }
  const previous = document.activeElement;
  for (const el of pick) {
    try {
      if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
      // 欄自身に境界が無く囲む箱が境界を持つ形では、焦点の輪も**箱**に出る (`:focus-within`)。箱の変化も部品に数える
      const wrapper = el.matches(FIELD) ? ownOrWrapper(el).wrapper : null;
      const before = snap(el);
      const wBefore = wrapper ? snap(wrapper) : null;
      el.focus({ preventScroll: true });
      const focused = document.activeElement === el;
      const focusVisible = focused && el.matches(':focus-visible');
      const after = snap(el);
      const wAfter = wrapper ? snap(wrapper) : null;
      const changed = Object.keys(before).some((k) => before[k] !== after[k]) || (wBefore !== null && Object.keys(wBefore).some((k) => wBefore[k] !== wAfter[k]));
      const parts = partsOf(before, after, beneath(el).cands);
      if (wrapper) for (const p of partsOf(wBefore, wAfter, beneath(wrapper).cands)) parts.push({ ...p, via: 'wrapper' });
      const v = C.indicatorVerdict(parts);
      // 焦点を取った**あと**に見えているか。ホバーでだけ現れる操作子 (`opacity: 0`) は、輪が在っても見えない (WCAG 2.4.7)
      const opacityAfter = round2(opacityOf(el));
      const reveals = C.revealOk(opacityAfter);
      out.focus.push({ sig: sig(el), focused, focusVisible, changed, parts, ok: v.ok && reveals, ringOk: v.ok, reveals, opacityAfter, best: round2(v.best), bestAny: round2(v.bestAny), html: html(el) });
    } catch (e) {
      out.focus.push({ sig: sig(el), focused: false, focusVisible: false, changed: false, parts: [], ok: false, best: 0, bestAny: 0, error: String(e), html: html(el) });
    }
  }
  if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
  if (previous && previous.focus) previous.focus({ preventScroll: true });

  // 押せる大きさ (目標の矩形は、ラベルに包まれた入力欄ならラベルのほうが大きければそちら)
  const effectiveRect = (el) => {
    const r = el.getBoundingClientRect();
    let best = r;
    let via = 'self';
    if (el.labels && el.labels.length > 0) {
      for (const l of el.labels) {
        if (!visible(l)) continue;
        const lr = l.getBoundingClientRect();
        if (lr.width * lr.height > best.width * best.height) {
          best = lr;
          via = 'label';
        }
      }
    }
    return { r: best, via };
  };
  const targets = all.map((el) => ({ el, ...effectiveRect(el) }));
  /**
   * 文の中のリンク (WCAG 2.5.8 の例外: インライン —— 「文の中、または行の高さが目標でない字に縛られている」)。
   * 最も近いブロックの祖先が、**リンクの字を除いてなお 2 字以上の字**を持つとき (「出典: A / B」の `出典:` と区切り)。
   * リンクだけが並ぶ一覧 (`<li><a>…</a></li>`) は文ではないので例外にしない。
   */
  const inlineInText = (el) => {
    if (el.tagName !== 'A' || getComputedStyle(el).display !== 'inline') return false;
    let b = el.parentElement;
    while (b && getComputedStyle(b).display === 'inline') b = b.parentElement;
    if (!b) return false;
    const links = [...b.querySelectorAll('a, button')].reduce((n, x) => n + (x.textContent || '').trim().length, 0);
    return (b.textContent || '').trim().length - links >= 2;
  };
  for (const a of targets) {
    if (!C.isSmall(a.r)) continue;
    if (inlineInText(a.el)) continue; // 文の中のリンク (WCAG の例外: インライン)
    // 同じ目標を指す物 (ラベルとその入力欄) は他の目標と数えない。入れ子の操作子は**別の目標**として数える
    const others = targets.filter((b) => b !== a && !(a.el.labels && [...a.el.labels].some((l) => l === b.el || l.contains(b.el))) && !(b.el.labels && [...b.el.labels].some((l) => l.contains(a.el))));
    const i = C.spacingConflict(a.r, others.map((b) => b.r));
    out.targets.push({ sig: sig(a.el), w: round2(a.r.width), h: round2(a.r.height), undersized: true, spacingOk: i < 0, via: a.via, nested: i >= 0 && (others[i].el.contains(a.el) || a.el.contains(others[i].el)), html: html(a.el) });
  }

  // キーボードで届かない
  for (const el of document.querySelectorAll('body *')) {
    if (el.namespaceURI === 'http://www.w3.org/2000/svg' && el.tagName.toLowerCase() === 'svg') continue;
    const cs = getComputedStyle(el);
    const pointer = cs.cursor === 'pointer';
    const roleNoFocus = el.matches(ROLE_INTERACTIVE) && !el.matches(NATIVE_FOCUSABLE) && el.tabIndex < 0;
    if (!pointer && !roleNoFocus) continue;
    if (!shown(el) || disabled(el)) continue;
    if (roleNoFocus) {
      out.mouseOnly.push({ sig: sig(el), why: 'role-without-tabindex', html: html(el) });
      continue;
    }
    if (el.closest(FOCUSABLE_UP) || el.querySelector(FOCUSABLE_UP)) continue;
    const pe = el.parentElement;
    // `cursor` は継ぐので、最も外側 (先祖がすでに mouse-only なら子は重複) だけを数える
    if (pe && getComputedStyle(pe).cursor === 'pointer' && !pe.closest(FOCUSABLE_UP)) continue;
    out.mouseOnly.push({ sig: sig(el), why: 'pointer-without-focus', html: html(el) });
  }
  return out;
}

/**
 * 実機のページで評価する式 (文字列)。`page.evaluate(controlsExpression())` で呼ぶ。
 * 関数ではなく**文字列**にするのは、4 つの自由変数なしの関数を 1 つの式へ束ねるため
 * (Playwright は文字列の式を CDP の `Runtime.evaluate` で走らせるので、ページの CSP に拒まれない)。
 *
 * @param {{ focusSample?: number }} [opts]
 */
function controlsExpression(opts) {
  return `(() => { const M = (${contrastMath.toString()})(); const G = (${groundTools.toString()})(M); const C = (${controlMath.toString()})(); return (${measureControls.toString()})(M, G, C, ${JSON.stringify(opts || {})}); })()`;
}

/** アクセシビリティ木で「名前が要る」役割 (WCAG 4.1.2)。 */
const NAME_ROLES = [
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'treeitem',
];

/**
 * **ブラウザ自身が計算した名前**が空の操作子を返す (CDP のアクセシビリティ木)。無効化された物・無視された物 (`ignored`)・
 * 見えていない物 (大きさ 0) は数えない。`option` は選択の中身で、名前を持つのは `select` のほうなので母集団に入れない。
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ total: number, rows: { role: string, html: string }[] }>}
 */
async function axUnnamedControls(page) {
  const roles = new Set(NAME_ROLES);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const rows = [];
    let total = 0;
    for (const n of nodes) {
      if (n.ignored) continue;
      const role = n.role && n.role.value;
      if (!roles.has(role)) continue;
      const props = new Map((n.properties || []).map((p) => [p.name, p.value && p.value.value]));
      if (props.get('disabled')) continue;
      if (n.backendDOMNodeId === undefined) continue;
      const name = n.name && n.name.value ? String(n.name.value).trim() : '';
      let seenHtml = null;
      try {
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId });
        const r = await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration:
            'function(){ const r=this.getBoundingClientRect(); return r.width<1||r.height<1 ? null : this.outerHTML.replace(/\\s+/g," ").slice(0,160); }',
          returnByValue: true,
        });
        seenHtml = r.result.value;
      } catch {
        seenHtml = null;
      }
      if (seenHtml === null) continue; // 見えていない (大きさ 0)・取れなかった
      total += 1;
      if (name === '') rows.push({ role, html: seenHtml });
    }
    return { total, rows };
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/** 入力欄の輪郭が 3:1 を割った行 (測れなかった行 `unknown` は割ったとは数えない)。 */
function fieldViolations(rows, C = controlMath()) {
  return rows.filter((r) => !r.unknown && !C.boundaryOk(r.border, r.fill));
}

/** スライダーのつまみが、下の地か溝に 3:1 を割った行 (つまみの色が読めなかった行・地が画像の行は数えない)。 */
function sliderViolations(rows, C = controlMath()) {
  return rows.filter((r) => !r.unknown && r.readable && r.best < C.MIN_NON_TEXT_RATIO);
}

/** フォーカスの輪が基準を割った行。焦点を取れなかった行 (`focused` が偽) は測れていないので数えない。 */
function focusViolations(rows) {
  return rows.filter((r) => r.focused && !r.ok);
}

/** 24px 未満で、間隔の例外も満たさない目標。 */
function targetViolations(rows) {
  return rows.filter((r) => r.undersized && !r.spacingOk);
}

/**
 * 割った行を「何が・どの値で」で畳む (同じ原因の行を 1 つにする)。多い順。
 * @template T
 * @param {T[]} rows
 * @param {(r: T) => string} keyOf
 */
function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const g = groups.get(k) || { k, n: 0, pages: new Set(), sample: r };
    g.n += 1;
    if (r.page) g.pages.add(r.page);
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => b.pages.size - a.pages.size || b.n - a.n);
}

module.exports = {
  controlMath,
  measureControls,
  controlsExpression,
  axUnnamedControls,
  NAME_ROLES,
  fieldViolations,
  sliderViolations,
  focusViolations,
  targetViolations,
  groupBy,
};
