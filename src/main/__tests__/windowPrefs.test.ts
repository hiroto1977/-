/**
 * 窓の下地色と配色 (パス 318) —— `windowPrefs.ts` の規則。
 *
 * ① 受け取る形は `light` / `dark` と `#rrggbb` だけ ② 読めない・壊れている・大きすぎる保存値は既定へ倒す
 * ③ 書きは原子的 (注入した writeFile に JSON が届く) ④ 既定の色は stylesheet の `--bg` (ライト) と同じ
 * —— main が palette の写しを持つのはこの 1 値だけで、その一致をここで留める。
 */
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// `getPath` は**名前を見て**答える —— 引数を無視する代役だと、`userData` を別の名前にしても置き場所が変わらず、
// 「置き場所は userData」の検査が名前を 1 字も見ないまま通る (パス 502)。
vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? '/tmp/does-not-matter' : `/unexpected/${name}`) },
}));

import {
  DEFAULT_WINDOW_PREFS,
  defaultStatePath,
  isBackgroundColor,
  isWindowScheme,
  readWindowPrefs,
  sanitizeWindowPrefs,
  writeWindowPrefs,
} from '../windowPrefs';
import { MAX_STATE_FILE_BYTES, readStateFile } from '../stateFile';

describe('窓の配色: 形の関門', () => {
  it('scheme は light / dark だけ', () => {
    expect(isWindowScheme('light')).toBe(true);
    expect(isWindowScheme('dark')).toBe(true);
    for (const bad of ['system', 'Dark', '', null, 1, {}]) expect(isWindowScheme(bad)).toBe(false);
  });

  it('★ 色は #rrggbb だけ (名前色・rgba()・短縮形・スキームつきの文字列は通さない)', () => {
    expect(isBackgroundColor('#fff7fa')).toBe(true);
    expect(isBackgroundColor('#1B1520')).toBe(true);
    // 前後に余分な字が付いた物 (`^` / `$` の錨が要る) も通さない: 先頭に付く・7 桁目が在る・末尾に空白
    for (const bad of ['red', 'rgba(0,0,0,1)', '#fff', '#12345', '#gggggg', 'javascript:alert(1)', '', null, 0x1b1520, 'x#1b1520', '#1b15200', '#1b1520 ']) {
      expect(isBackgroundColor(bad), String(bad)).toBe(false);
    }
  });

  /*
   * **文字列ではないが、文字列に化ける値は通さない** (パス 502)。`RegExp#test` は引数を文字列へ変換するので、
   * 型を見ずに正規表現だけで判れば `['#fff7fa']` (配列は `String` で `#fff7fa`) も `{ toString: () => … }` も
   * 色として通ってしまう。`setBackgroundColor` へ渡る物は `typeof` で文字列と確かめた物だけでなければならない。
   */
  it('★ 文字列に化ける値 (配列・toString を持つ物) は色として通さない', () => {
    const asText = { toString: () => '#1b1520' };
    // 針が的に当たる標本: どちらも `String(x)` は正しい色の綴りになる (= 型を見なければ正規表現は通る)
    expect(String(['#1b1520'])).toBe('#1b1520');
    expect(/^#[0-9a-f]{6}$/i.test(asText as unknown as string)).toBe(true);
    expect(isBackgroundColor(['#1b1520'])).toBe(false);
    expect(isBackgroundColor(asText)).toBe(false);
    expect(sanitizeWindowPrefs({ scheme: 'dark', background: ['#1b1520'] })).toBeNull();
    expect(sanitizeWindowPrefs({ scheme: 'dark', background: asText })).toBeNull();
  });

  it('sanitize は形の合う物だけを通し、色を小文字に揃える', () => {
    expect(sanitizeWindowPrefs({ scheme: 'dark', background: '#1B1520' })).toEqual({ scheme: 'dark', background: '#1b1520' });
    for (const bad of [null, 'dark', { scheme: 'dark' }, { background: '#1b1520' }, { scheme: 'system', background: '#1b1520' }, { scheme: 'dark', background: 'red' }]) {
      expect(sanitizeWindowPrefs(bad)).toBeNull();
    }
  });

  it('★ 物でない値 (undefined・数・真偽値) は投げずに null (分解代入は undefined を受け付けない)', () => {
    // 壊れた JSON は `JSON.parse` が投げ、`readWindowPrefs` は `undefined` をそのまま渡す —— ここが投げると起動が止まる。
    for (const bad of [undefined, 42, true, Symbol.for('x')]) {
      expect(() => sanitizeWindowPrefs(bad), String(bad)).not.toThrow();
      expect(sanitizeWindowPrefs(bad)).toBeNull();
    }
    expect(sanitizeWindowPrefs([])).toBeNull();
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

  it('★ 書き手を渡さなければ実ファイルへ原子的に書く (権限 600・次の起動が読み戻せる)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'window-prefs-'));
    try {
      const file = join(dir, 'service-hub-window.json');
      await writeWindowPrefs({ scheme: 'dark', background: '#1b1520' }, { statePath: () => file });
      // 中身は状態ファイルの読み口 (`readStateFile`) で見る —— 生の読みを書かない (一時ファイルでも
      // `originalSourcePolicy` の台帳が要る) し、次の起動が読むのと同じ口で確かめることにもなる。
      expect(await readStateFile(file)).toEqual({ kind: 'read', text: '{"scheme":"dark","background":"#1b1520"}' });
      expect((statSync(file).mode & 0o777).toString(8)).toBe('600');
      expect(await readWindowPrefs({ statePath: () => file })).toEqual({ scheme: 'dark', background: '#1b1520' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
