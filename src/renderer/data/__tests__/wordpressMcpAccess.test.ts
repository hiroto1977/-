/**
 * **MCP ツールが使えるかは、取得したサイトから述べる** (2026-09-12 · パス 177)。
 *
 * 直す前の画面は固定文で「すべてのサイトが free プラン」と言っていた ——
 * 同じ画面の一覧が `paid` のバッジを刷っていても。ここは 4 つの枝と、
 * 「分からないを free に倒さない」を留める。
 */
import { describe, expect, it } from 'vitest';
import { mcpAccessNote, type McpAccessSite } from '../wordpressMcpAccess';

const free = (name: string): McpAccessSite => ({ name, paidPlan: false });
const paid = (name: string): McpAccessSite => ({ name, paidPlan: true });

describe('mcpAccessNote', () => {
  it('★ 0 件は「判定できません」 (free に倒さない)', () => {
    const n = mcpAccessNote([]);
    expect(n.kind).toBe('unknown');
    expect(n.text).toContain('判定できません');
    // アップグレードの要求も、プランの断定もしない。
    expect(n.text).not.toContain('free プラン');
    expect(n.text).not.toContain('アップグレードが必要');
  });

  it('★ すべて free なら件数を言ってアップグレードを案内する', () => {
    const n = mcpAccessNote([free('A'), free('B')]);
    expect(n.kind).toBe('all-free');
    expect(n.text).toContain('所有サイト 2 件はすべて free プラン');
    expect(n.text).toContain('アップグレードが必要');
    expect(n.paidNames).toEqual([]);
    expect(n.freeNames).toEqual(['A', 'B']);
  });

  it('★ すべて有料なら「すべて free」と言わない (元の欠陥)', () => {
    const n = mcpAccessNote([paid('ブログ A'), paid('ブログ B')]);
    expect(n.kind).toBe('all-paid');
    expect(n.text).not.toContain('free プラン');
    expect(n.text).not.toContain('アップグレードが必要');
    expect(n.text).toContain('すべて有料プラン');
    expect(n.text).toContain('ブログ A・ブログ B');
  });

  it('★ 混在なら両方を件数と名前で言う', () => {
    const n = mcpAccessNote([paid('P1'), free('F1'), free('F2')]);
    expect(n.kind).toBe('mixed');
    expect(n.text).toContain('有料プラン 1 件 (P1)');
    expect(n.text).toContain('free プラン 2 件 (F1・F2)');
    expect(n.text).toContain('アップグレードが必要');
    expect(n.paidNames).toEqual(['P1']);
    expect(n.freeNames).toEqual(['F1', 'F2']);
  });

  it('★ 名前は 3 件までで、残りは件数にする (1 行に収める)', () => {
    const n = mcpAccessNote([paid('A'), paid('B'), paid('C'), paid('D'), paid('E')]);
    expect(n.text).toContain('A・B・C ほか 2 件');
    expect(n.text).not.toContain('D');
  });

  it('★ 3 件ちょうどは全部並べる (境界)', () => {
    expect(mcpAccessNote([paid('A'), paid('B'), paid('C')]).text).toContain('A・B・C)');
  });

  it('★ どの枝でも「プランからの推定」と述べる (mcp_access は取得していない)', () => {
    for (const sites of [[free('A')], [paid('A')], [paid('A'), free('B')]]) {
      const n = mcpAccessNote(sites);
      expect(n.text, n.kind).toContain('plan) からの推定');
      expect(n.text, n.kind).toContain('mcp_access 欄は取得していません');
    }
  });

  it('対照: 同じ入力でも paidPlan を裏返すと枝が変わる (欄を読んでいる)', () => {
    expect(mcpAccessNote([free('A')]).kind).toBe('all-free');
    expect(mcpAccessNote([paid('A')]).kind).toBe('all-paid');
  });
});
