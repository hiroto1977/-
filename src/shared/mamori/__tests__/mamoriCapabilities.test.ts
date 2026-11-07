import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource } from '../../__tests__/originalSource';
import { compileProject } from '../compile';
import { parse } from '../parser';
import { checkCapabilities, deriveCapabilities, type CapabilityPolicy } from '../capabilities';

/*
 * **能力の台帳 (M7 · 0.5 · threat: T-242)** —— 守りの層が届く先を、導いた表と台帳の両方向の一致で固定する。
 * 「マイナスデイ・マインド」(脆弱性は書いた時点で入っている前提) を言語の規則にした物。
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const req = createRequire(__filename);
const { sources } = req(join(ROOT, 'scripts', 'mamori.cjs')) as { sources: () => string[] };

const SAMPLE = [
  'use { pathToFileURL } from "node:url";',
  'use { local } from "./other";',
  'extern sink { shell } from "electron";',
  'extern sink global window;',
  'export vetted VU = "u";',
  'export gate fn mk(s: string) -> VU | null {',
  '  if (s === "") {',
  '    return null;',
  '  }',
  '  return mint VU(s);',
  '}',
  'export sink fn open(u: VU) -> Promise<void> {',
  '  return shell.openExternal(u);',
  '}',
  '',
].join('\n');
const FILE = 'src/x/a.mamori';
const modules = (src = SAMPLE, file = FILE): { file: string; module: ReturnType<typeof parse> }[] => [{ file, module: parse(file, src) }];
const policyOf = (src = SAMPLE): CapabilityPolicy => ({ modules: deriveCapabilities(modules(src)) });
const msgs = (src: string, policy: CapabilityPolicy): string[] => checkCapabilities(modules(src), policy).map((d) => `${d.rule} ${d.message}`);

describe('能力の導出 (threat: T-242)', () => {
  it('外の値・外の module・印を作る関数・危ない口を呼ぶ関数の 4 つを、整列して導く', () => {
    expect(deriveCapabilities(modules())).toEqual({
      [FILE]: {
        externals: ['sink electron: shell', 'sink global: window'],
        imports: ['node:url: pathToFileURL'],
        gates: ['mk -> VU | null'],
        sinks: ['open(VU)'],
      },
    });
  });
  it('相対の use は外の module ではないので imports に入らない・default も数える', () => {
    const t = deriveCapabilities(modules('use default path from "node:path";\nuse { a } from "../b";\n'));
    expect(t[FILE]!.imports).toEqual(['node:path: default path']);
  });
  it('表は道の順に整列する', () => {
    const t = deriveCapabilities([...modules('', 'src/z.mamori'), ...modules('', 'src/b.mamori'), ...modules('', 'src/a.mamori')]);
    expect(Object.keys(t)).toEqual(['src/a.mamori', 'src/b.mamori', 'src/z.mamori']);
  });
  it('1 つの宣言に名前が複数在れば ", " で繋ぎ、能力の並びは宣言の順に依らず整列する', () => {
    const src = [
      'extern sink global window;',
      'extern sink { zeta, alpha } from "electron";',
      'use { qq, pp } from "node:url";',
      'use default fs from "node:fs";',
      'use default zz from "node:zz";',
      '',
    ].join('\n');
    expect(deriveCapabilities(modules(src))[FILE]).toEqual({
      externals: ['sink electron: zeta, alpha', 'sink global: window'],
      imports: ['node:fs: default fs', 'node:url: qq, pp', 'node:zz: default zz'],
      gates: [],
      sinks: [],
    });
  });
});

describe('能力の台帳との突き合わせ (M7 · threat: T-242)', () => {
  it('導いた表と台帳が一致すれば通る', () => {
    expect(msgs(SAMPLE, policyOf())).toEqual([]);
  });
  it('★ 台帳に無い外の値 (extern) は断る (threat: T-242)', () => {
    expect(msgs(`${SAMPLE}extern sink { exec } from "node:child_process";\n`, policyOf())).toEqual([expect.stringContaining('M7 能力の台帳 (security/mamori-capabilities.json) に無い externals です: sink node:child_process: exec')]);
  });
  it('★ 台帳に無い外の module の import は断る (threat: T-242)', () => {
    expect(msgs(`use { x } from "left-pad";\n${SAMPLE}`, policyOf())).toEqual([expect.stringContaining('に無い imports です: left-pad: x')]);
  });
  it('★ 台帳に無い gate (印を作れる関数の追加) は断る (threat: T-242)', () => {
    const more = `${SAMPLE}export gate fn mk2(s: string) -> VU | null {\n  if (s === "") {\n    return null;\n  }\n  return mint VU(s);\n}\n`;
    expect(msgs(more, policyOf())).toEqual([expect.stringContaining('に無い gates です: mk2 -> VU | null')]);
  });
  it('★ 台帳に無い sink (危ない口を呼べる関数の追加) は断る (threat: T-242)', () => {
    const more = `${SAMPLE}export sink fn open2(u: VU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n`;
    expect(msgs(more, policyOf())).toEqual([expect.stringContaining('に無い sinks です: open2(VU)')]);
  });
  it('★ 台帳に在るのに実在しない能力 (古い申告) も断る (threat: T-242)', () => {
    const p = policyOf();
    const stale: CapabilityPolicy = { modules: { [FILE]: { ...p.modules[FILE]!, imports: [...p.modules[FILE]!.imports, 'old: gone'] } } };
    expect(msgs(SAMPLE, stale)).toEqual([expect.stringContaining('M7 能力の台帳に在るのに実在しない imports です: old: gone')]);
  });
  it('★ 台帳に無いモジュールは、能力が空でも全部が台帳に無い扱いになる・台帳だけにあるモジュールも断る (threat: T-242)', () => {
    expect(msgs(SAMPLE, { modules: {} }).length).toBe(5);
    const ghost: CapabilityPolicy = { modules: { ...policyOf().modules, 'src/x/gone.mamori': { externals: [], imports: [], gates: [], sinks: [] } } };
    expect(msgs(SAMPLE, ghost)).toEqual([expect.stringContaining('M7 能力の台帳に在るのに、このモジュールが見つかりません: src/x/gone.mamori')]);
  });
  it('誤りの位置は、能力を宣言した行を指す', () => {
    const d = checkCapabilities(modules(`${SAMPLE}extern sink { exec } from "node:child_process";\n`), policyOf());
    expect(d.map((x) => [x.line, x.col])).toEqual([[15, 1]]);
  });
});

describe('compileProject への配線 (threat: T-242)', () => {
  const files = [{ path: FILE, source: SAMPLE }];
  it('★ 台帳を渡さない呼び方は検めない (ライブラリとしての呼び方)・渡せば M7 で断る (threat: T-242)', () => {
    expect(compileProject(files).ok).toBe(true);
    const r = compileProject(files, { capabilities: { modules: {} } });
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.diagnostics.map((d) => d.rule)).toEqual(['M7', 'M7', 'M7', 'M7', 'M7']);
  });
  it('他の誤りが在れば台帳は見ない (誤りを直してから出る)', () => {
    const r = compileProject([{ path: FILE, source: 'export fn f() -> unknown {\n  return fetch("x");\n}\n' }], { capabilities: { modules: {} } });
    expect(r.ok ? [] : r.diagnostics.map((d) => d.rule)).toEqual(['M6']);
  });
});

describe('実物の台帳 (threat: T-242)', () => {
  const files = sources().map((p) => ({ path: p, source: readOriginalSource(join(ROOT, p)) }));
  const committed = JSON.parse(readOriginalSource(join(ROOT, 'security', 'mamori-capabilities.json'))) as CapabilityPolicy;
  it('★ 実物の .mamori の導いた能力は、コミットした台帳と 1 つも違わない (threat: T-242)', () => {
    const derived = deriveCapabilities(files.map((f) => ({ file: f.path, module: parse(f.path, f.source) })));
    expect(derived).toEqual(committed.modules);
  });
  it('台帳を渡して実物をコンパイルすると通る', () => {
    expect(compileProject(files, { capabilities: committed }).ok).toBe(true);
  });
  it('★ 出荷の道 (CLI) は必ず台帳を渡し、読めなければ断る (threat: T-242)', () => {
    const cli = readOriginalSource(join(ROOT, 'scripts', 'mamori.cjs'));
    expect(cli).toContain('compileProject(files, { capabilities: policy })');
    expect(cli).toContain('能力の台帳 (security/mamori-capabilities.json) が読めません');
  });
  it('台帳は危ない口を持つモジュールを実際に含む (空の台帳が通らない床)', () => {
    const flat = Object.values(committed.modules).flatMap((m) => [...m.externals, ...m.sinks]);
    expect(flat.some((x) => x.startsWith('sink electron'))).toBe(true);
    expect(Object.keys(committed.modules).length).toBeGreaterThanOrEqual(11);
  });
});
