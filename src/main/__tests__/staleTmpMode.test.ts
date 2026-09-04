import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveStocksState } from '../clients/stocks';
import { saveTeamRadarState } from '../clients/teamradar';

/*
 * **締めるのは、書いた後である。**
 *
 * `fs.writeFile(既存ファイル, …, { mode })` は**既存の権限を変えない** ——
 * このリポジトリが `emotions.ts` と `exportPaths.ts` の注記で 2 度書いている形。
 *
 * `stocks` / `teamradar` の保存は `p + '.tmp'` という**固定名**へ書いて
 * `rename` で被せる。本体の古い権限は rename で消えるので「直る」と
 * 書いてあったが、**`.tmp` 自身が 644 で残っていた場合**は別である ——
 * `writeFile` はその 644 を変えずに上書きし、rename がそれを本体へ被せる。
 *
 * 実測 (2026-08-25・修正前):
 *
 * ```
 *   事前の .tmp = 644 → 保存後の本体 = 644
 *   .tmp 無し          → 保存後の本体 = 600
 * ```
 *
 * 古い版 (権限を付ける前) が書き込み途中で落ちると、まさにこの `.tmp` が残る。
 * teamradar が持つのは**同僚の評価**なので、同じ機械の他の利用者に読まれる。
 */

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stale-tmp-mode-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const modeOf = async (p: string): Promise<string> => ((await fs.stat(p)).mode & 0o777).toString(8);

type Save = (target: string) => Promise<void>;
type SaveInjected = (target: string, writeFile: (p: string, c: string) => Promise<void>) => Promise<void>;

const SAVERS: readonly [string, Save, SaveInjected][] = [
  [
    'stocks',
    (target) => saveStocksState({ watchlist: [] } as never, { statePath: () => target }),
    (target, writeFile) =>
      saveStocksState({ watchlist: [] } as never, {
        statePath: () => target,
        writeFile,
        rename: async () => undefined,
      }),
  ],
  [
    'teamradar',
    (target) =>
      saveTeamRadarState(
        { department: '営業部', evaluatedAt: '2026-08-25', members: [] },
        { statePath: () => target },
      ),
    (target, writeFile) =>
      saveTeamRadarState(
        { department: '営業部', evaluatedAt: '2026-08-25', members: [] },
        { statePath: () => target, writeFile, rename: async () => undefined },
      ),
  ],
];

describe.each(SAVERS)('%s の保存は必ず 0600 で置く', (name, save, saveInjected) => {
  it('新規に作ると 0600', async () => {
    const target = join(dir, `${name}.json`);
    await save(target);
    expect(await modeOf(target)).toBe('600');
  });

  it('★ 古い版が残した 644 の .tmp があっても、本体は 0600 になる', async () => {
    const target = join(dir, `${name}.json`);
    // 権限を付ける前の版が書き込み途中で落ちた状態。
    await fs.writeFile(`${target}.tmp`, '{"partial":1}');
    await fs.chmod(`${target}.tmp`, 0o644);
    expect(await modeOf(`${target}.tmp`), '前提が作れていない').toBe('644');

    await save(target);

    expect(await modeOf(target)).toBe('600');
  });

  it('本体が 644 で残っていても、次の保存で締まる', async () => {
    const target = join(dir, `${name}.json`);
    await fs.writeFile(target, '{"old":1}');
    await fs.chmod(target, 0o644);
    await save(target);
    expect(await modeOf(target)).toBe('600');
  });

  /*
   * **差し替え口を壊していないこと。** chmod は**既定の実装の中**に置いた ——
   * 検査が注入する `writeFile` は実ファイルを作らないので、外へ出すと
   * 注入側が `chmod` の ENOENT で落ちる。
   */
  it('注入した writeFile は chmod に巻き込まれない', async () => {
    const target = join(dir, `${name}-injected.json`);
    const seen: string[] = [];
    await saveInjected(target, async (p: string) => {
      seen.push(p);
    });
    expect(seen, '注入した writeFile が呼ばれていない').toHaveLength(1);
    // 実ファイルは作られていない = 既定経路の chmod は走っていない。
    await expect(fs.stat(target)).rejects.toThrow();
  });
});
