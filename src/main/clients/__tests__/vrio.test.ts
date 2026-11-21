import { describe, expect, it, vi } from 'vitest';
import { fetchVrioSnapshot } from '../vrio';
import { VRIO_JOB_IDS, VRIO_TIER_IDS, VRIO_VERDICT_IDS } from '../../../shared/vrio';
import { SNAPSHOT } from '../../../renderer/data/snapshot';

describe('fetchVrioSnapshot (ローカル; 入力は画面の中だけ)', () => {
  it('網を叩かず、階層・職種・判定の台帳の見出しだけを返す (人の評価は持たない)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchVrioSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.tiers).toEqual([...VRIO_TIER_IDS]);
    expect(snap.jobs).toEqual([...VRIO_JOB_IDS]);
    expect(snap.verdicts).toEqual([...VRIO_VERDICT_IDS]);
    expect(Object.keys(snap)).toEqual(['tiers', 'jobs', 'verdicts']);
  });

  it('資格情報が無くても失敗しない (LOCAL_SERVICES)', async () => {
    await expect(fetchVrioSnapshot({ token: '' })).resolves.toEqual(SNAPSHOT.vrio);
  });
});
