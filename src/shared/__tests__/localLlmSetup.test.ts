import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { MIN_SAFE_VERSION } from '../ollama';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

/*
 * ローカル LLM のセットアップ (scripts/local-llm-setup.sh) の守りを留める。
 * 実際の導入は利用者の機械でしか走らせないので、ここで見るのは「勝手に変えない」「床が台帳と一致する」
 * 「外向きの待ち受けでは始めない」という、**導入前に決まっている規則**だけ。
 */
const SH = 'scripts/local-llm-setup.sh';
const src = readOriginalSource(SH);

function run(args: string[], env: Record<string, string> = {}): { code: number | null; out: string } {
  const r = spawnSync('bash', [SH, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 30_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('local-llm-setup.sh', () => {
  it('★ Ollama の床は src/shared/ollama.ts の台帳の最大 fixedIn と一致する', () => {
    const m = /^OLLAMA_MIN_VERSION="([0-9.]+)"/m.exec(src);
    expect(m?.[1]).toBe(MIN_SAFE_VERSION);
  });

  it('★ llama.cpp の床は GGUF 解析の修正版 (b8146) 以上', () => {
    const m = /^LLAMACPP_MIN_BUILD=(\d+)/m.exec(src);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(8146);
  });

  it('★ 既定は計画の表示だけで、何も変えず exit 0 (--yes が無ければ導入しない)', () => {
    const r = run([]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('計画の表示だけです');
    expect(r.out).not.toContain('1/4 Ollama');
  });

  it('--check は現状だけを報告する', () => {
    const r = run(['--check']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('現状');
  });

  it('不正な引数は exit 2 で断る (--tier / --skip / 不明な引数)', () => {
    expect(run(['--tier', 'huge']).code).toBe(2);
    expect(run(['--skip', 'a;b']).code).toBe(2);
    expect(run(['--nope']).code).toBe(2);
  });

  it('★ 外向きの OLLAMA_HOST では導入を始めない (認証の無い API を LAN へ出さない)', () => {
    const r = run(['--yes', '--skip', 'vscode,continue,llamacpp'], { OLLAMA_HOST: '0.0.0.0' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('外向きです');
    expect(r.out).not.toContain('1/4 Ollama');
  });

  it('★ モデルは Ollama の公式ライブラリのタグだけ・出所の分からない GGUF は取りに行かない', () => {
    const code = stripComments(src);
    expect(code).not.toMatch(/huggingface\.co|hf\.co\/|\.gguf\b.*(curl|wget)|(curl|wget).*\.gguf/);
    expect(code).toMatch(/ollama pull/);
  });

  it('★ 待ち受けは 127.0.0.1 だけ (0.0.0.0 を設定に書かない)', () => {
    const code = stripComments(src);
    expect(code).toContain('apiBase: http://127.0.0.1:');
    expect(code).not.toMatch(/--host\s+0\.0\.0\.0|apiBase:\s*http:\/\/0\.0\.0\.0/);
  });

  it('★ 既存の Continue 設定は上書きしない', () => {
    expect(stripComments(src)).toContain('config.local-llm.yaml');
  });
});
