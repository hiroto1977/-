/**
 * 窓の下地色と配色 (パス 318) —— `windowPrefs.ts` の規則。
 *
 * ① 受け取る形は `light` / `dark` と `#rrggbb` だけ ② 読めない・壊れている・大きすぎる保存値は既定へ倒す
 * ③ 書きは原子的 (注入した writeFile に JSON が届く) ④ 既定の色は stylesheet の `--bg` (ライト) と同じ
 * —— main が palette の写しを持つのはこの 1 値だけで、その一致をここで留める。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/does-not-matter' } }));

import {
  DEFAULT_WINDOW_PREFS,
  defaultStatePath,
  isBackgroundColor,
  isWindowScheme,
  readWindowPrefs,
  sanitizeWindowPrefs,
  writeWindowPrefs,
} from '../windowPrefs';
import { MAX_STATE_FILE_BYTES } from '../stateFile';

describe('窓の配色: 形の関門', () => {
  it('scheme は light / dark だけ', () => {
    expect(isWindowScheme('light')).toBe(true);
    expect(isWindowScheme('dark')).toBe(true);
    for (const bad of ['system', 'Dark', '', null, 1, {}]) expect(isWindowScheme(bad)).toBe(false);
  });

  it('★ 色は #rrggbb だけ (名前色・rgba()・短縮形・スキームつきの文字列は通さない)', () => {
    expect(isBackgroundColor('#fff7fa')).toBe(true);
    expect(isBackgroundColor('#1B1520')).toBe(true);
    for (const bad of ['red', 'rgba(0,0,0,1)', '#fff', '#12345', '#gggggg', 'javascript:alert(1)', '', null, 0x1b1520]) {
      expect(isBackgroundColor(bad), String(bad)).toBe(false);
    }
  });

  it('sanitize は形の合う物だけを通し、色を小文字に揃える', () => {
    expect(sanitizeWindowPrefs({ scheme: 'dark', background: '#1B1520' })).toEqual({ scheme: 'dark', background: '#1b1520' });
    for (const bad of [null, 'dark', { scheme: 'dark' }, { background: '#1b1520' }, { scheme: 'system', background: '#1b1520' }, { scheme: 'dark', background: 'red' }]) {
      expect(sanitizeWindowPrefs(bad)).toBeNull();
    }
  });
});

describe('窓の配色: 読み書き', () => {
  const enoent = () => {
    const e = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return Promise.reject(e);
  };

  it('まだ無ければ既定 (ライト)', async () => {
    expect(await readWindowPrefs({ readFile: enoent })).toEqual(DEFAULT_WINDOW_PREFS);
  });

  it('読めなければ既定 (失うのは起動の一瞬の色だけ)', async () => {
    const eacces = () => Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    expect(await readWindowPrefs({ readFile: eacces })).toEqual(DEFAULT_WINDOW_PREFS);
  });

  it('壊れた JSON・形の合わない中身は既定', async () => {
    expect(await readWindowPrefs({ readFile: async () => '{not json' })).toEqual(DEFAULT_WINDOW_PREFS);
    expect(await readWindowPrefs({ readFile: async () => JSON.stringify({ scheme: 'dark', background: 'red' }) })).toEqual(DEFAULT_WINDOW_PREFS);
  });

  it('大きすぎるファイルは読まずに既定 (状態ファイルの門 · パス 313)', async () => {
    const stat = async () => ({ size: MAX_STATE_FILE_BYTES + 1 });
    let read = 0;
    const readFile = async () => {
      read += 1;
      return JSON.stringify({ scheme: 'dark', background: '#1b1520' });
    };
    expect(await readWindowPrefs({ readFile, stat })).toEqual(DEFAULT_WINDOW_PREFS);
    expect(read).toBe(0);
  });

  it('保存された配色を読む', async () => {
    const readFile = async () => JSON.stringify({ scheme: 'dark', background: '#1B1520' });
    expect(await readWindowPrefs({ readFile })).toEqual({ scheme: 'dark', background: '#1b1520' });
  });

  it('書きは JSON を置き場所へ (注入した writeFile に届く)', async () => {
    const writes: [string, string][] = [];
    await writeWindowPrefs(
      { scheme: 'dark', background: '#1b1520' },
      { statePath: () => '/x/service-hub-window.json', writeFile: async (p, c) => void writes.push([p, c]) },
    );
    expect(writes).toEqual([['/x/service-hub-window.json', '{"scheme":"dark","background":"#1b1520"}']]);
  });

  it('置き場所は userData の service-hub-window.json', () => {
    expect(defaultStatePath()).toBe(join('/tmp/does-not-matter', 'service-hub-window.json'));
  });
});

describe('窓の配色: 既定の色は stylesheet と同じ', () => {
  it('★ DEFAULT_WINDOW_PREFS.background は styles.css の :root { --bg } (ライト) と 1 字も違わない', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'renderer', 'styles.css'), 'utf8');
    const root = /^:root\s*\{([^}]*)\}/m.exec(css);
    expect(root).not.toBeNull();
    const bg = /^\s*--bg:\s*([^;]+);/m.exec(root![1]!);
    expect(bg).not.toBeNull();
    expect(DEFAULT_WINDOW_PREFS.background).toBe(bg![1]!.trim());
    expect(DEFAULT_WINDOW_PREFS.scheme).toBe('light');
  });
});
