/**
 * `shared/atRestInventory.ts` (「保存時の保護状態」の節が言う、トークン以外の保存物の在庫) が実装と一致する (パス 135)。
 *
 * shared は renderer を import できないので、ブラウザ版の鍵は文字列で持つ —— ここで各モジュールの定数と突き合わせる。
 * デスクトップ版のファイル名は、封緘する main のモジュールに書かれている名前そのもの。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { STATE_STORES, describeStateStores, stateStoreLabels } from '../../shared/atRestInventory';
import { EMOTIONS_STORE_KEY } from '../data/emotionsWeb';
import { TALENT_STORAGE_KEY } from '../../shared/talent';
import { TEAM_RADAR_STORAGE_KEY } from '../../shared/teamRadarState';

const REPO = join(__dirname, '..', '..', '..');

const SEALING_MODULE: Readonly<Record<string, string>> = {
  'service-hub-emotions.json': 'src/main/clients/emotions.ts',
  'talent.json': 'src/main/clients/talent.ts',
  'team-radar.json': 'src/main/clients/teamradar.ts',
};

describe('保存物の在庫 (atRestInventory) は実装と一致する', () => {
  it('3 つの保存物: ブラウザ版の鍵は各モジュールの定数そのもの', () => {
    expect(STATE_STORES).toHaveLength(3);
    expect([...STATE_STORES.map((s) => s.browserKey)].sort()).toEqual(
      [EMOTIONS_STORE_KEY, TALENT_STORAGE_KEY, TEAM_RADAR_STORAGE_KEY].sort(),
    );
  });

  it('★ デスクトップ版のファイル名は、封緘する main のモジュールに書かれている名前 (封緘の口も同じファイルに在る)', () => {
    for (const s of STATE_STORES) {
      const file = SEALING_MODULE[s.desktopFile];
      expect(file, `${s.desktopFile} を書くモジュールが台帳に無い`).toBeDefined();
      const text = readOriginalSource(join(REPO, file!));
      expect(text, `${file} に '${s.desktopFile}' が無い`).toContain(`'${s.desktopFile}'`);
      expect(text, `${file} は封緘していない`).toContain('sealJsonDocument(');
    }
  });

  it('文は 3 つの名前を全部言い、仕組みごとに何が守っているか (いないか) を言う', () => {
    for (const m of ['os-keychain', 'obfuscated', 'webcrypto-vault'] as const) {
      const t = describeStateStores(m);
      for (const s of STATE_STORES) expect(t, m).toContain(s.label);
    }
    expect(describeStateStores('os-keychain')).toContain('同じ OS のキーチェーン由来の鍵で封緘');
    expect(describeStateStores('obfuscated')).toContain('難読化のみ');
    expect(describeStateStores('webcrypto-vault')).toContain('localStorage に平文');
    expect(describeStateStores('webcrypto-vault')).toContain('マスターパスワードでは守られません');
    expect(stateStoreLabels()).toBe(STATE_STORES.map((s) => s.label).join('・'));
  });
});
