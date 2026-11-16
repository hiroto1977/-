/**
 * 見張り番 (クラウド) が走らせる生成物 `scripts/inbound-watch.cjs` が、正本と同じ物であること。
 *
 * 見張り番のセッションは `npm ci` をせずにこの 1 本だけを走らせる。正本
 * (`src/shared/inboundWatch.ts` → `inboundThreat.ts`) を直して組み直しを忘れると、
 * **画面は新しい規則で・見張り番は古い規則で**判定することになる (標本の台帳で増やした規則が
 * クラウドの側にだけ届かない)。だから ① 組み直した物と byte 一致 ② 実際に走らせた答えが正本と一致、を見る。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { judgeInboundItems } from '../inboundWatch';
import { originalSourcePath, readOriginalSource } from './originalSource';

/*
 * 変異検査 (Stryker) は src を書き換えた写しを sandbox に置いて走らせる。生成物と突き合わせる相手は
 * **repo の本物** —— sandbox の写しから組み直すと、計器の印が入って必ず食い違う。
 * 走らせた答えは sandbox の `judgeInboundItems` (= 変異体) と比べるので、判定を変える変異体はここで落ちる。
 */
const REPO = join(originalSourcePath(__dirname), '..', '..', '..');
const SCRIPT = join(REPO, 'scripts', 'inbound-watch.cjs');
const BUILDER = join(REPO, 'scripts', 'build-inbound-watch.cjs');
const DIR = mkdtempSync(join(tmpdir(), 'inbound-watch-'));

afterAll(() => {
  rmSync(DIR, { recursive: true, force: true });
});

interface Sample {
  readonly id: string;
  readonly text: string;
  readonly sender?: string;
}

function ledgerItems(): { id: string; sender?: string; body: string }[] {
  const ledger = JSON.parse(readOriginalSource(join(REPO, 'security', 'inbound-samples.json'))) as { samples: Sample[] };
  return ledger.samples.map((s) => ({ id: s.id, sender: s.sender, body: s.text }));
}

function run(input: unknown): { status: number | null; stdout: string; stderr: string } {
  const file = join(DIR, 'in.json');
  writeFileSync(file, typeof input === 'string' ? input : JSON.stringify(input));
  const r = spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('見張り番の生成物 scripts/inbound-watch.cjs', () => {
  it('★ 正本から組み直した物と byte 一致する (組み直し忘れを落とす)', () => {
    const { build } = require(BUILDER) as { build: () => string };
    expect(build()).toBe(readOriginalSource(SCRIPT));
  });

  it('★ 標本の台帳の全件で、走らせた答えが正本の答えと同じ', () => {
    const items = ledgerItems();
    expect(items.length).toBeGreaterThanOrEqual(30);
    const r = run(items);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(JSON.parse(JSON.stringify(judgeInboundItems(items))));
    // 走査が空虚でない床: 台帳には札が付く標本と付かない標本の両方が在る。
    const labels = judgeInboundItems(items).verdicts.map((v) => v.label);
    expect(labels.filter((l) => l !== null).length).toBeGreaterThanOrEqual(10);
    expect(labels.filter((l) => l === null).length).toBeGreaterThanOrEqual(5);
  });

  it('形の合わない入力は判定せず件数で返す (正本と同じ)', () => {
    const r = run({ not: 'an array' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ verdicts: [], malformed: 1, overLimit: 0 });
  });

  it('★ 読めない入力は exit 2 で断り、標準出力に何も出さない (空の結果を「0 件」と読ませない)', () => {
    const broken = run('{ broken json');
    expect(broken.status).toBe(2);
    expect(broken.stdout).toBe('');
    expect(broken.stderr).toContain('JSON として読めません');

    const missing = spawnSync(process.execPath, [SCRIPT, join(DIR, 'no-such-file.json')], { encoding: 'utf8' });
    expect(missing.status).toBe(2);
    expect(missing.stdout).toBe('');

    const noArg = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    expect(noArg.status).toBe(2);
    expect(noArg.stdout).toBe('');
  });

  it('★ 生成物は網にも子プロセスにも触れない (読むのは入力ファイル 1 つだけ)', () => {
    const src = readOriginalSource(SCRIPT);
    const requires = [...src.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    expect(requires).toEqual(['node:fs']);
    const FORBIDDEN = /\bfetch\s*\(|node:https?|node:net|node:child_process|writeFile|appendFile|\bimport\s*\(/;
    expect(FORBIDDEN.test(src)).toBe(false);
    // 針が当たる標本。
    for (const s of ['fetch(url)', 'require("node:https")', 'fs.writeFileSync(p, x)', 'await import("x")', 'require("node:child_process")']) {
      expect(FORBIDDEN.test(s)).toBe(true);
    }
  });

  it('組み直しの --check が今の木で通る', () => {
    expect(execFileSync(process.execPath, [BUILDER, '--check'], { encoding: 'utf8' })).toContain('一致します');
  });
});
