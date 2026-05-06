// v19/ui/modules/markdown.js — XSS 安全な Markdown レンダラ (governance/12 INV-8)
//
// このモジュールは「外部入力の HTML エスケープ」と「Markdown → HTML 変換」を
// 担う **セキュリティ境界**。INV-8 (UI Markdown は XSS 安全) の 検証は
// tests/js/test_md.mjs で 13 件 確認済。
//
// サポート subset:
//   - Fenced code blocks (```lang ... ```)
//   - Inline code (`x`)
//   - 太字 / 斜体
//   - 見出し # ## ###
//   - 箇条書き (* / - / 数字)
//   - 引用 (>)
//   - リンク (http/https のみ、javascript: は escape されて無害化)
//
// 戦略: code span を退避 → escape → markup → 復元
// (code 内の <script> 等は escape された状態で表示される)

// ── HTML エスケープ (5 文字) ──
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── Markdown → HTML (XSS 安全) ──
export function renderMarkdown(src) {
  const placeholders = [];
  const blockKinds = []; // parallel: true if the placeholder is a block element
  const stash = (html, isBlock = false) => {
    const k = `\x00MD${placeholders.length}\x00`;
    placeholders.push(html);
    blockKinds.push(isBlock);
    return k;
  };

  let s = String(src ?? '');

  // 1. Fenced code blocks (block-level)
  s = s.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langCls = (lang || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    const escaped = escapeHtml(code.replace(/\n$/, ''));
    return stash(
      `<pre class="md-pre" data-lang="${langCls}"><button type="button" class="md-copy" aria-label="コピー">コピー</button><code class="md-code">${escaped}</code></pre>`,
      true,
    );
  });

  // 2. Inline code (inline-level)
  s = s.replace(/`([^`\n]+)`/g, (_, c) =>
    stash(`<code class="md-inline">${escapeHtml(c)}</code>`, false));

  // 3. Escape remaining text — anything outside code is now safe to mark up
  s = escapeHtml(s);

  // 4. Block-level rules (line-based)
  const lines = s.split('\n');
  const out = [];
  let listType = null;
  let para = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p class="md-p">${para.join(' ')}</p>`); para = []; }
  };
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const blockPhMatch = (line) => {
    const m = line.trim().match(/^\x00MD(\d+)\x00$/);
    return (m && blockKinds[+m[1]]) ? placeholders[+m[1]] : null;
  };

  for (const line of lines) {
    // A line that is purely a block-level placeholder (e.g. fenced code) is itself a block.
    const blockPh = blockPhMatch(line);
    if (blockPh) {
      flushPara(); closeList();
      out.push(blockPh);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flushPara(); closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl + 2} class="md-h">${h[2]}</h${lvl + 2}>`);
      continue;
    }
    const bq = line.match(/^&gt;\s?(.*)$/);
    if (bq) {
      flushPara(); closeList();
      out.push(`<blockquote class="md-bq">${bq[1]}</blockquote>`);
      continue;
    }
    const ul = line.match(/^[*-]\s+(.+)$/);
    if (ul) {
      flushPara();
      if (listType !== 'ul') { closeList(); out.push('<ul class="md-ul">'); listType = 'ul'; }
      out.push(`<li>${ul[1]}</li>`);
      continue;
    }
    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      if (listType !== 'ol') { closeList(); out.push('<ol class="md-ol">'); listType = 'ol'; }
      out.push(`<li>${ol[1]}</li>`);
      continue;
    }
    if (!line.trim()) {
      flushPara(); closeList();
      continue;
    }
    closeList();
    para.push(line);
  }
  flushPara(); closeList();
  s = out.join('\n');

  // 5. Inline rules (bold, italic, links)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => {
    const safeUrl = escapeHtml(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // 6. Restore inline placeholders (block ones were emitted directly above)
  s = s.replace(/\x00MD(\d+)\x00/g, (_, i) => placeholders[+i]);

  return s;
}

// ── レンダ後の <pre> 内の copy ボタン を有効化 ──
// onCopyError は失敗時に呼ばれる callback (toast 等)。省略時は console.warn
export function activateCopyButtons(container, onCopyError) {
  container.querySelectorAll('.md-copy').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const code = btn.parentElement?.querySelector('code')?.innerText ?? '';
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'コピー済み';
        setTimeout(() => { btn.textContent = 'コピー'; }, 1500);
      } catch (err) {
        if (typeof onCopyError === 'function') {
          onCopyError(err);
        } else {
          console.warn('clipboard write failed:', err);
        }
      }
    });
  });
}
