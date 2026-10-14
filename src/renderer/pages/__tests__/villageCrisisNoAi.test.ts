/**
 * **村の AI 送信は危機の文を通さない** (2026-10-13 · パス 518 · threat: T-029)。
 *
 * `VillagePage.handleUtterance` は、端末内の相談窓口 (`replyTo` → `buildCounselReply`,
 * いのちの電話 / 119・110) を吹き出しに出した**あと**、AI を呼んで `res.data.text` で
 * その吹き出しを上書きしていた。危機の文 (「もう死にたい」) が端末の外へ出て、窓口は
 * モデルの返答に置き換わる。旗艦の AI 画面 (AssistantPage) は pass 514 で同じ判定を入れて
 * いる —— 村も同じ網で塞ぐ。
 *
 * ここは (1) 判定の述語が危機の文に当たる (2) ハンドラの中で AI の `invoke` より前に
 * 危機の判定が在り、AI の条件に入っていることを、コメントを落とした実コードで見る。
 * 実際の描画は VillagePage.render.test.ts が別に留める。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';
import { detectCrisis, detectHarmToOthers } from '../../data/counseling';

const SRC = stripComments(readOriginalSource(path.resolve(__dirname, '..', 'VillagePage.tsx')));

describe('村の AI 送信は危機の文を通さない (パス 518 · T-029)', () => {
  it('★ 危機の判定の述語が、危機の文に当たる (標本つき · threat: T-029)', () => {
    expect(detectCrisis('もう死にたい')).toBe(true);
    // 針が死んでいない確認: 普通の文には当たらない (判定が常に真だと AI が一切呼べなくなる)。
    expect(detectCrisis('今日の売上を教えて')).toBe(false);
  });

  it('★ VillagePage は危機の判定を import している (threat: T-029)', () => {
    expect(SRC, '危機の判定を import していない').toMatch(
      /import\s*\{[^}]*detectCrisis[^}]*detectHarmToOthers[^}]*\}\s*from\s*['"]\.\.\/data\/counseling['"]/,
    );
  });

  it('★ AI の invoke は危機の判定の後ろに在り、その判定を条件に含む (threat: T-029)', () => {
    const guard = SRC.indexOf('const crisisOrHarm = detectCrisis(text) || detectHarmToOthers(text);');
    const invoke = SRC.indexOf("hub.invoke<ActionData<'assistant/chat'>>('assistant', 'chat'");
    expect(guard, '危機の判定が無い (AI を呼ぶ前に危機を見ていない)').toBeGreaterThan(-1);
    expect(invoke, 'assistant/chat の呼びが見つからない (走査が実物に当たっていない)').toBeGreaterThan(-1);
    expect(guard, '危機の判定が AI の呼びの後ろに在る').toBeLessThan(invoke);
    // AI の条件 (aiOn && hub && …) に危機の判定が入っている。
    expect(SRC, 'AI の条件に危機の判定が入っていない').toMatch(
      /if\s*\(\s*aiOn\s*&&\s*hub\s*&&\s*reply\.kind\s*!==\s*'action'\s*&&\s*!crisisOrHarm\s*\)/,
    );
  });

  it('★ 対照: 危機の判定を条件から外すと、上の検査の条件が成り立たない (針が死んでいない)', () => {
    const withoutGuard = 'if (aiOn && hub && reply.kind !== \'action\') {';
    expect(/if\s*\(\s*aiOn\s*&&\s*hub\s*&&\s*reply\.kind\s*!==\s*'action'\s*&&\s*!crisisOrHarm\s*\)/.test(withoutGuard)).toBe(false);
    expect(detectHarmToOthers('人を殺したい')).toBe(true);
  });
});
