import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEADER_DISQUALIFIERS,
  ORGAN_DISEASES,
  SKILL_STEPS,
  achievementGap,
  diagnoseOrg,
  judgeLeaderFitness,
  sanitizeInitiatives,
  sanitizeReports,
} from '../talent';

/**
 * 人材育成の判定が、**デスクトップ版とブラウザ版で同じ答えを返す**こと。
 *
 * teamradar の `save-state` は、main 側が `validateMembers` で検証するのに
 * ブラウザ版 (`web-shim.ts`) は素通しで、その非対称が web-shim.ts の注記に
 * 残っている ——「揃えるなら src/shared へ出す必要がある」。
 *
 * talent は最初から `src/shared/talent.ts` に判定を置き、main と web-shim の
 * 両方がそこを読む。**その約束が守られていることを、原文に対して確かめる。**
 * 判定を web-shim 側で書き直したら、この検査が鳴る。
 */

const repoRoot = join(__dirname, '..', '..', '..');
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8');

describe('talent — 2 つの実行環境で判定が割れていないこと', () => {
  it('★ web-shim は shared の判定を import している', () => {
    const shim = read('src/renderer/web-shim.ts');
    expect(shim).toContain("from '../shared/talent'");
    expect(shim).toContain('judgeLeaderFitness');
    // 標本: この検査が「原文を見ている」ことを、在るはずの物で確かめる。
    expect(shim).toContain('serviceHub');
  });

  it('★ main の client も shared の判定を import している', () => {
    const client = read('src/main/clients/talent.ts');
    expect(client).toContain("from '../../shared/talent'");
  });

  it('★ 判定の本体が web-shim に書き写されていない', () => {
    const shim = read('src/renderer/web-shim.ts');
    // 閾値と定義表の字面が web-shim に現れたら、写しが生まれている。
    expect(shim).not.toContain('うそをついてごまかす');
    expect(shim).not.toContain('職務定義の刷り込み誤認');
    // 上の not.toContain が空振りでないことを、同じ検査の中で確かめる。
    expect(LEADER_DISQUALIFIERS.some((d) => d.text === 'うそをついてごまかす')).toBe(true);
    expect(ORGAN_DISEASES.some((d) => d.name === '職務定義の刷り込み誤認')).toBe(true);
  });

  it('★ 判定の本体が画面側にも書き写されていない', () => {
    const page = read('src/renderer/pages/TalentPage.tsx');
    expect(page).not.toContain('うそをついてごまかす');
    expect(page).not.toContain('職務定義の刷り込み誤認');
    // 画面が閾値を持っていないこと (持つと main とズレる)。
    expect(page).not.toContain('STEP1_MASTERY_YEARS');
  });

  it('同じ入力に同じ答え — 共有関数なので当然だが、経路として固定する', () => {
    const flagged = ['lies'];
    expect(judgeLeaderFitness(flagged).eligible).toBe(false);
    expect(sanitizeReports([{ department: '営業', diseases: ['imprint'] }])).toHaveLength(1);
    expect(sanitizeInitiatives([{ name: 'a', probability: 40 }])).toHaveLength(1);
    expect(diagnoseOrg([{ department: '営業', diseases: ['imprint'] }]).systemic).toEqual([]);
    expect(achievementGap([{ name: 'a', probability: 40 }]).shortfall).toBe(60);
  });
});

describe('取得が失敗しても画面が使えること', () => {
  it('★ 定義表は取得に依存しない — snapshot が実物を指している', async () => {
    // smoke (Electron 実機) で取得を stub したところ、診断票も 10ヶ条も
    // STEP も**全部消えた**。定義表は定数であってデータではないので、
    // 取得の成否に関わらず読めなければならない。
    const { SNAPSHOT } = await import('../../renderer/data/snapshot');
    expect(SNAPSHOT.talent.diseases).toHaveLength(5);
    expect(SNAPSHOT.talent.disqualifiers).toHaveLength(10);
    expect(SNAPSHOT.talent.steps).toHaveLength(4);
  });

  it('★ 写しではなく参照 — shared の実物と同一である', async () => {
    const { SNAPSHOT } = await import('../../renderer/data/snapshot');
    expect(SNAPSHOT.talent.diseases).toBe(ORGAN_DISEASES);
    expect(SNAPSHOT.talent.disqualifiers).toBe(LEADER_DISQUALIFIERS);
    expect(SNAPSHOT.talent.steps).toBe(SKILL_STEPS);
  });
});
