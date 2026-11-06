import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **橋 (src/preload/preload.mamori) の書き方を破る試し** (2026-11-06 · MG-046 · 移植の周)。
 *
 * 橋は `electron` の `ipcRenderer` / `contextBridge` を直接触らず、host の薄い 2 つの口 (`invokeIpc` / `exposeBridge`) だけを
 * `extern pure` で読む。これを Mamori の側から破れるかを、橋の形のまま試した:
 *   1. `use { ipcRenderer } from "electron"` —— 能力モジュールを素の import で読む
 *   2. `extern pure { ipcRenderer } from "electron"` —— 能力モジュールを pure と偽って読む
 *   3. 宣言していない `fetch` / `window` へ届く —— 橋の中から網や窓を使う
 * 3 つとも断る。**断らない物も 1 つ正直に固定する**: 呼び出し側が渡した文字列をチャンネルにする橋 (`(c) => invokeIpc(c)`) は
 * Mamori の規則では通る —— チャンネルが固定であることは言語ではなく振る舞いの検査 (bridgeStatic.test.ts の
 * 「呼び出し側はチャンネルを選べない」) が守る。言語に「文字列の字面だけ」を言う規則は無い。
 */

const HOST = 'extern pure { invokeIpc, exposeBridge } from "./preloadHost";\n';
function compile(source: string, path = 'src/preload/x.mamori'): { ok: boolean; text: string } {
  const r = compileProject([{ path, source }]);
  return r.ok ? { ok: true, text: [...r.outputs.values()][0]! } : { ok: false, text: r.diagnostics.map(formatDiagnostic).join('\n') };
}

describe('橋の書き方を破る', () => {
  it('① electron を素の import で読む形は断る', () => {
    const r = compile('use { ipcRenderer } from "electron";\n' + HOST + 'export const x = invokeIpc<string>("a");\n');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('electron');
  });

  it('② electron を pure と偽って読む形は断る', () => {
    const r = compile('extern pure { ipcRenderer } from "electron";\nexport const x = 1;\n');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('electron');
  });

  it('③ 宣言していない fetch / window へ届く橋は断る', () => {
    const f = compile(HOST + 'const api = { a: () => fetch("https://example.com") };\nexport const e = exposeBridge("serviceHub", api);\n');
    expect(f.ok).toBe(false);
    expect(f.text).toContain('[M6]');
    const w = compile(HOST + 'const api = { a: () => window };\nexport const e = exposeBridge("serviceHub", api);\n');
    expect(w.ok).toBe(false);
    expect(w.text).toContain('[M6]');
  });

  it('★ 正直な限界: 呼び出し側が選んだ文字列をチャンネルにする橋は規則では通る (守るのは振る舞いの検査)', () => {
    const r = compile(HOST + 'const api = { raw: (c: string) => invokeIpc<unknown>(c) };\nexport const e = exposeBridge("serviceHub", api);\n');
    expect(r.ok).toBe(true);
  });

  it('対照: 本物の橋の形 (固定のチャンネル) は通り、host の口だけを呼ぶ', () => {
    const r = compile(HOST + 'const api = { v: () => invokeIpc<string>("app:getVersion") };\nexport const e = exposeBridge("serviceHub", api);\n');
    expect(r.ok).toBe(true);
    expect(r.text).toContain('invokeIpc<string>("app:getVersion")');
    expect(r.text).not.toContain('electron');
  });
});
