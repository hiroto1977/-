/*
 * **多層防御の配線** (2026-10-29 · パス 552 · threat: T-215 / T-216)。
 *
 * 判定そのものは純関数 (`outboundContentGate.ts` / `promptInjection.ts`) で、単体の検査が持つ。
 * ここが見るのは**どこで呼ばれているか** —— 「関門は呼べば効くのではなく、呼ばなければ効かない」
 * (パス 358 の `planPermittedSteps` は docblock が名指しした関門が出荷コードから 1 度も呼ばれて
 * いなかった)。振る舞いは mainIpc.test.ts / webShimOutboundGate.test.ts / emotions.test.ts /
 * skills.test.ts が持つ。ここは**順序** (本人確認より前・鍵を読むより前) を原文で留める。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

const ROOT = path.resolve(__dirname, '../../..');
const code = (rel: string): string => stripComments(readOriginalSource(path.join(ROOT, rel)));

describe('出力インターセプター (T-215) は全 action が通る漏斗に在り、本人確認より前に働く', () => {
  it('main の action:invoke —— outboundContentRefusal は requirePresence より前', () => {
    const src = code('src/main/main.ts');
    const handler = src.slice(src.indexOf("'action:invoke'"));
    const gate = handler.indexOf('outboundContentRefusal(serviceId, action, payload)');
    const presence = handler.indexOf('requirePresence(e, {');
    const run = handler.indexOf('await fn({ token, payload: safePayload })');
    expect(gate, '関門が呼ばれていない').toBeGreaterThan(0);
    expect(presence).toBeGreaterThan(gate);
    expect(run).toBeGreaterThan(gate);
    expect(src).toMatch(/import \{ outboundContentRefusal \} from '\.\.\/shared\/outboundContentGate'/);
  });

  it('ブラウザ版の shim.invoke —— outboundContentRefusal は unguarded.invoke より前', () => {
    const src = code('src/renderer/web-shim.ts');
    const shim = src.slice(src.indexOf('const shim = {'));
    const gate = shim.indexOf('outboundContentRefusal(serviceId, action, payload)');
    const inner = shim.indexOf('unguarded.invoke<T>(serviceId, action, payload)');
    expect(gate).toBeGreaterThan(0);
    expect(inner).toBeGreaterThan(gate);
  });
});

describe('入力の無害化 (T-216) は第三者の文が入る口に在り、鍵を読むより前に働く', () => {
  it('main の emotions/analyze-text —— 鍵の門 (MISSING_ANTHROPIC_KEY_MESSAGE) より前', () => {
    const src = code('src/main/clients/emotions.ts');
    const fn = src.slice(src.indexOf('async function analyzeText('));
    const gate = fn.indexOf("promptInjectionRefusal(text, '分析する本文')");
    const key = fn.indexOf('MISSING_ANTHROPIC_KEY_MESSAGE');
    expect(gate).toBeGreaterThan(0);
    expect(key).toBeGreaterThan(gate);
  });

  it('ブラウザ版の emotions/analyze-text —— 保管庫 (vault.getToken) より前', () => {
    const src = code('src/renderer/web-shim.ts');
    const fn = src.slice(src.indexOf('async function callEmotionsAnalyze('));
    const gate = fn.indexOf("promptInjectionRefusal(text, '分析する本文')");
    const vault = fn.indexOf("vault.getToken('emotions')");
    expect(gate).toBeGreaterThan(0);
    expect(vault).toBeGreaterThan(gate);
  });

  it('main の skills/run-skill —— SKILL.md の本文を読んだ直後・送る前', () => {
    const src = code('src/main/clients/skills.ts');
    const fn = src.slice(src.indexOf('async function runSkill('));
    const body = fn.indexOf('stripSmuggledChars(await readSkillBody(id))');
    const gate = fn.indexOf("promptInjectionRefusal(body, 'スキル本文 (SKILL.md)')");
    const send = fn.indexOf("'https://api.anthropic.com/v1/messages'");
    expect(body).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(body);
    expect(send).toBeGreaterThan(gate);
  });

  it('★ 母集団: 両ビルドの emotions/analyze-text と skills/run-skill の 3 か所が全部 (手で数えた 3 と一致)', () => {
    const count = (rel: string): number => (code(rel).match(/promptInjectionRefusal\(/g) ?? []).length;
    expect(count('src/main/clients/emotions.ts')).toBe(1);
    expect(count('src/renderer/web-shim.ts')).toBe(1);
    expect(count('src/main/clients/skills.ts')).toBe(1);
  });
});
