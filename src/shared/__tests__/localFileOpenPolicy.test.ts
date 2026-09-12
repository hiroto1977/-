import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { externalUrlOrNull } from '../externalUrlGate';

/*
 * **ローカルのファイルは `openPath` で開く。`openExternal` に `file:` を渡さない。** (2026-09-12 · パス 151)
 *
 * `externalUrlGate.ts` の `EXTERNAL_URL_SCHEMES` は `http:` / `https:` だけで、
 * 同じファイルの散文が「`file:` はローカル読み出し」を拒む理由として挙げている。
 * だから `openExternal` に `file:` を渡す呼び出しは**関門に落とされて何も起きない** ——
 * 例外も出ず、画面にも出ず、押した人には「無反応」に見えるだけである。
 *
 * 2026-09-12 まで `StocksPage` がその形を持っていた (書き出したダッシュボードの
 * 「外部ブラウザで開く」)。他の書き出し画面は最初から `ExportActions` →
 * `openPath` を通っており、**1 画面だけが取り残されていた**。しかもその行は
 * カバレッジ 28.45% の中に在り、**1 度も実行されたことがなかった**。
 *
 * ## なぜ「呼び出しの引数」ではなくファイル単位で見るか
 *
 * 直す前の実物はこう書かれていた:
 *
 * ```ts
 * const url = 'file:///' + exportPath.replace(/\\/g, '/').replace(/^\//, '');
 * window.serviceHub.openExternal(url);
 * ```
 *
 * **引数は `url` という変数**なので、呼び出しの括弧の中だけを見る走査では
 * 見つからない。組み立てと呼び出しが 2 行に分かれている形を捕まえるには、
 * 「`openExternal` を呼ぶファイルに `file:` の URL リテラルが在るか」を見る。
 */

const SRC = path.resolve(__dirname, '../..');

/** 走査が実物に当たっていることの床。実測 2026-09-12: 21 ファイル。 */
const CALLER_FLOOR = 15;

/**
 * コメントだけを落とす。**文字列は残す** —— 探している物 (`'file:///'`) が
 * 文字列リテラルそのものなので、文字列を消す走査では何も見つからない。
 */
export function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

/** `src/` の実装ファイル (検査・型定義を除く)。 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') sourceFiles(p, out);
      continue;
    }
    if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/**
 * `openExternal` を呼び、かつ `file:` の URL を組んでいるファイル。
 * **export して対照から呼ぶ** (`files` は「相対の道 → 原文」の組)。
 */
export function fileUrlOpenSites(
  files: readonly (readonly [string, string])[],
): { readonly where: string; readonly line: number }[] {
  const out: { where: string; line: number }[] = [];
  for (const [rel, raw] of files) {
    const body = withoutComments(raw);
    if (!body.includes('openExternal(')) continue;
    /*
     * **綴りは URL の形 (`file://`) に絞る。** 最初は `file:` で書いていて、
     * TypeScript の**属性名**に当たった —— 実測で 3 件の偽検知
     * (`profile: ApplicantProfile` / `profile: EmotionProfile` / `file: string;`)。
     * 探している物は URL なので、スキームの後ろの `//` まで要求する。
     */
    const at = body.indexOf('file://');
    if (at !== -1) out.push({ where: rel, line: body.slice(0, at).split('\n').length });
  }
  return out;
}

/** `openExternal` を呼ぶファイルの一覧 (母集団)。 */
export function openExternalCallers(
  files: readonly (readonly [string, string])[],
): string[] {
  return files.filter(([, raw]) => withoutComments(raw).includes('openExternal(')).map(([rel]) => rel);
}

function realFiles(): (readonly [string, string])[] {
  return sourceFiles(SRC).map(
    (f) => [path.relative(SRC, f).split(path.sep).join('/'), readOriginalSource(f)] as const,
  );
}

describe('ローカルのファイルは openPath で開く (関門が落とす道へ渡さない · パス 151)', () => {
  const files = realFiles();

  it('★ 前提: 関門は file: を落とす (この検査が意味を持つ理由)', () => {
    /*
     * **不在の主張の前に、前提を肯定形で確かめる。** ここが通らなくなったら
     * (誰かが `EXTERNAL_URL_SCHEMES` に `file:` を足したら) 下の規則は
     * 守る物を失うので、その時はこの検査ごと読み直すこと。
     */
    for (const url of [
      'file:///home/user/dashboard.html',
      'file:///C:/Users/x/dashboard.html',
      'file:///tmp/out/My Reports/stocks.html',
    ]) {
      expect(externalUrlOrNull(url), `${url} が通ってしまった`).toBeNull();
    }
    // 対照: http(s) は通る (関門が全部落としているわけではない)。
    expect(externalUrlOrNull('https://example.com/x')).toBe('https://example.com/x');
  });

  it('★ 走査が実物に当たる (openExternal を呼ぶファイルが床を下回らない)', () => {
    const callers = openExternalCallers(files);
    expect(callers.length).toBeGreaterThanOrEqual(CALLER_FLOOR);
    /*
     * 錨は**呼び出しを持つ**ファイルにする。最初は `renderer/web-shim.ts` に
     * していて落ちた —— あれは `openExternal: (url: string) => {…}` の**定義**side で、
     * 走査が見ている `openExternal(` には当たらない (2026-09-12 · この検査自身の誤り)。
     */
    expect(callers).toContain('renderer/components/ExportActions.tsx');
    expect(callers).toContain('renderer/components/DataList.tsx');
  });

  it('★ openExternal を呼ぶファイルが file: の URL を組んでいない', () => {
    const found = fileUrlOpenSites(files).map((f) => `${f.where}:${f.line}`);
    expect(
      found,
      'file: は externalUrlGate が落とすので、この呼び出しは「押しても何も起きない」。' +
        'ローカルのファイルは serviceHub.openPath (→ shell.openPath) で開くこと ' +
        '(components/ExportActions.tsx が戻り値の失敗まで画面に出す)',
    ).toEqual([]);
  });

  /*
   * 対照 —— **走査が標本で鳴る。** 直す前の実物と同じ 2 行の形と、
   * 引数に直接書く形の両方を拾うことを見る。
   */
  describe('対照: 走査が標本で鳴る', () => {
    it('組み立てと呼び出しが 2 行に分かれていても拾う (直す前の実物の形)', () => {
      const sample = [
        "const url = 'file:///' + p.replace(/\\\\/g, '/');",
        'window.serviceHub.openExternal(url);',
      ].join('\n');
      expect(fileUrlOpenSites([['renderer/pages/Sample.tsx', sample]])).toEqual([
        { where: 'renderer/pages/Sample.tsx', line: 1 },
      ]);
    });

    it('引数に直接書く形も拾う', () => {
      const sample = "window.serviceHub.openExternal('file:///tmp/x.html');";
      expect(fileUrlOpenSites([['renderer/pages/Sample.tsx', sample]])).toHaveLength(1);
    });

    it('コメントの中の file: は拾わない (この検査自身の散文を掴まない)', () => {
      const sample = [
        '// file:/// は関門が落とす',
        '/* file:///tmp/x も同じ */',
        'window.serviceHub.openExternal(u);',
      ].join('\n');
      expect(fileUrlOpenSites([['renderer/pages/Sample.tsx', sample]])).toEqual([]);
    });

    it('文字列は残す (文字列を消す走査では何も見つからない)', () => {
      // `withoutComments` の性質そのもの。ここが壊れると上の 2 本が空振りする。
      expect(withoutComments("const u = 'file:///x';")).toContain('file:///x');
      expect(withoutComments("const u = 'https://x';")).toContain('https://x');
    });

    it('openExternal を呼ばないファイルの file: は拾わない (proxy の遮断表など)', () => {
      const sample = "const BLOCKED = ['file:', 'data:'];";
      expect(fileUrlOpenSites([['renderer/security/sample.ts', sample]])).toEqual([]);
    });
  });
});
