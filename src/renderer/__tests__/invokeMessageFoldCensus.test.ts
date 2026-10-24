/**
 * **invoke の失敗本文を画面へ出す所は、どれも 1 行に畳む** (2026-10-14 · パス 521 · threat: T-045)。
 *
 * ## 見つけた物 (実測 · 2026-10-14 · 直す前)
 *
 * `serviceHub.invoke(...)` が `{ ok: false, message }` で返す `message` は、第三者
 * (連携先 API・利用者が設定した互換 API / プロキシ / Ollama ホスト) の本文を含む。
 * web-shim の `err()` → `redactForMessage` は伏字と長さは掛けるが**改行・双方向制御
 * (Trojan Source · U+202E)・不可視字は残す**。T-005 / T-020 / T-025 はチャット・村・
 * ベスト3 の経路を `externalTextOnOneLine` で畳んだが、**同じ `message` を
 * `setXxxError(res.message)` / `message: res.message` / `'…失敗: ' + r.message` で
 * 素で画面へ流す出口が 50 か所 (30 ファイル) 残っていた**。AI 監査 (パス 521) が
 * `VoiceCommandBar` で再現した: Slack API の失敗本文に `\n✅ 実行しました。…\n\u202E…`
 * を仕込むと `.voice-error` (`role="alert"`) にそのまま届く。
 *
 * ## ここが見る物
 *
 * 1. `src/renderer/pages` と `src/renderer/components` の全 `.tsx` (検査を除く) を
 *    **コメントを落として**走査し、`(r|res|classified).message` の出現はどれも
 *    `externalTextOnOneLine(` に包まれているか、理由つきの台帳に在る (双方向)。
 * 2. 包んでいるファイルは `../data/assistantMarkdown` から import している
 *    (名前だけ在って別物を指す形を落とす)。
 * 3. 母集団の床 (走査が実物に当たっていること) と、針が素の形に当たる標本。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDir, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['pages', 'components'] as const;

/** 素で通してよい出現 —— `file::line-ish` ではなく「ファイル::その行の綴り」で名指しし、理由を書く。 */
const LEDGER: ReadonlyArray<{ file: string; needle: string; why: string }> = [
  {
    file: 'components/GoogleConnectCard.tsx',
    needle: "reason: r.message ?? ''",
    why: '`r` は readLocalString (端末の保存値を読んだ結果) で invoke の結果ではない。reason はアプリ自身の文。',
  },
  {
    file: 'components/ChatbotWidget.tsx',
    needle: 'ollamaRefusalNote(res.message)',
    why: 'ollamaRefusalNote が中で externalTextOnOneLine(redactForMessage(…)) を掛ける (T-005)。畳みは向こうが持つ。',
  },
];

const NEEDLE = /\b(?:r|res|classified)\.message\b/g;

/**
 * その行の `X.message` の出現が**すべて** `externalTextOnOneLine(` の括弧の中に在るか。
 * 三項 (`externalTextOnOneLine(res.ok ? '…' : res.message)`) も包んだ形として数える ——
 * 見るのは「外へ出る前に畳みを通るか」であって綴りの隣接ではない。
 */
function wrapped(line: string): boolean {
  const re = new RegExp(NEEDLE.source, 'g');
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = re.exec(line)) !== null) {
    any = true;
    const before = line.slice(0, m.index);
    const open = before.lastIndexOf('externalTextOnOneLine(');
    if (open < 0) return false;
    const between = before.slice(open + 'externalTextOnOneLine('.length);
    let depth = 0;
    for (const ch of between) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (depth < 0) return false;
    }
  }
  return any;
}

interface Hit {
  readonly file: string;
  readonly line: string;
}

function scan(): { hits: Hit[]; files: string[] } {
  const hits: Hit[] = [];
  const files: string[] = [];
  for (const dir of DIRS) {
    for (const name of readOriginalDir(path.join(ROOT, dir))) {
      if (!name.endsWith('.tsx')) continue;
      const rel = `${dir}/${name}`;
      files.push(rel);
      const src = stripComments(readOriginalSource(path.join(ROOT, rel)));
      for (const line of src.split('\n')) {
        if (!NEEDLE.test(line)) continue;
        NEEDLE.lastIndex = 0;
        hits.push({ file: rel, line: line.trim() });
      }
      NEEDLE.lastIndex = 0;
    }
  }
  return { hits, files };
}

const { hits, files } = scan();

describe('invoke の失敗本文の出口は 1 行に畳む (パス 521 · T-045)', () => {
  it('母集団: 走査が実物に当たっている', () => {
    expect(files.length).toBeGreaterThanOrEqual(80);
    expect(hits.length).toBeGreaterThanOrEqual(50);
  });

  it('★ 素の出現は台帳の行だけ (threat: T-045)', () => {
    const bare = hits.filter((h) => !wrapped(h.line));
    const unexplained = bare.filter((h) => !LEDGER.some((l) => l.file === h.file && h.line.includes(l.needle)));
    expect(unexplained, '畳んでいない invoke の失敗本文の出口').toEqual([]);
  });

  it('★ 台帳の行は実物に在る (逆向き)', () => {
    for (const l of LEDGER) {
      expect(l.why.length).toBeGreaterThanOrEqual(15);
      const found = hits.some((h) => h.file === l.file && h.line.includes(l.needle) && !wrapped(h.line));
      expect(found, `台帳に在るのに実物に無い: ${l.file} :: ${l.needle}`).toBe(true);
    }
  });

  it('★ 包んでいるファイルは assistantMarkdown から import している', () => {
    const wrappers = new Set(hits.filter((h) => wrapped(h.line)).map((h) => h.file));
    expect(wrappers.size).toBeGreaterThanOrEqual(28);
    for (const rel of wrappers) {
      const src = stripComments(readOriginalSource(path.join(ROOT, rel)));
      expect(src, `${rel}: externalTextOnOneLine の import が無い`).toMatch(
        /import\s*\{[^}]*\bexternalTextOnOneLine\b[^}]*\}\s*from\s*['"]\.\.\/data\/assistantMarkdown['"]/,
      );
    }
  });

  it('対照: 針は素の形に当たり、包んだ形には当たらない', () => {
    expect(NEEDLE.test('      setResult({ kind: "error", message: res.message });')).toBe(true);
    NEEDLE.lastIndex = 0;
    expect(wrapped('      setResult({ kind: "error", message: res.message });')).toBe(false);
    expect(wrapped('setExportMsg("x: " + externalTextOnOneLine(r.message));')).toBe(true);
    expect(wrapped("setAiError(externalTextOnOneLine(res.ok ? 'x' : res.message));")).toBe(true);
    expect(wrapped('setA(externalTextOnOneLine(r.code)); setB(r.message);')).toBe(false);
  });
});
