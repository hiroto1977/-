import { describe, expect, it, vi } from 'vitest';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: true },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: {},
  ipcMain: {},
  BrowserWindow: class {},
  dialog: {},
}));

import { LIVE_ACTIONS } from '../clients/index';
import { ACTION_TIER, CONFIRMED_TIERS, tierOfAction } from '../userPresence';

/*
 * **本人確認の母集団** (threat: T-147)。
 *
 * ① 登録された action はすべて段階を持つ (台帳 ⟷ `LIVE_ACTIONS` の両方向)。
 *    載っていない新しい action は `external-write` として確かめる (fail closed) ので、
 *    台帳に書き忘れても無確認では通らないが、**黙って最も厳しくなるのではなく名指しで落とす**。
 * ② IPC の全ハンドラは「確認の対象」か「対象外 (理由つき)」のどちらかで、
 *    確認の対象は**副作用の前**に `requirePresence` を呼ぶ。
 */
const src = stripComments(readOriginalSource('src/main/main.ts'));

const GUARDED: Readonly<Record<string, string>> = {
  'app:eraseAll': 'eraseDesktopData(',
  'secrets:set': 'await setToken(',
  'secrets:clear': 'await clearToken(',
  'action:invoke': 'await fn(',
  'app:openExternal': 'await openExternalVetted(',
  'oauth:authorize': 'await authorize(',
};

const NOT_GUARDED: Readonly<Record<string, string>> = {
  'app:getVersion': '版の文字列を返すだけ',
  'secrets:list': '設定済みの id の一覧だけ (秘密は戻さない)',
  'secrets:protection': '件数と仕組みの名前だけ (秘密は戻さない)',
  'oauth:isSupported': '提供者が OAuth 対応かの真偽だけ',
};

/**
 * **速度の上限と記録だけを掛ける口** (確認は出さない · threat: T-159)。呼び出し元フレームの検査と
 * 段階ごとの速度の上限・警戒への記録を受ける。値は段階 (`read` は確認しない・`local-write` は警戒中だけ確認する)。
 */
const THROTTLED: Readonly<Record<string, 'read' | 'local-write'>> = {
  'app:checkUpdate': 'read', // 固定の GitHub API へ読みの要求 1 本
  'app:setColorScheme': 'read', // 配色 2 値 (形で絞る)・設定ファイルへ書く
  'fetch:snapshot': 'read', // 保存済みトークンで外部 API を読む (書き込みは無い)
  'app:revealInFolder': 'local-write', // shellOpenGate を通った書き出し先をファイラで示す
  'app:openPath': 'local-write', // shellOpenGate を通った書き出し物を OS の既定アプリで開く
};

function handlerBodies(): Map<string, string> {
  const out = new Map<string, string>();
  const re = /ipcMain\.handle\(\s*'([^']+)'/g;
  const starts: { name: string; at: number }[] = [];
  for (let m = re.exec(src); m !== null; m = re.exec(src)) starts.push({ name: m[1]!, at: m.index });
  starts.forEach((s, i) => out.set(s.name, src.slice(s.at, starts[i + 1]?.at ?? src.length)));
  return out;
}

describe('本人確認の母集団 (threat: T-147)', () => {
  it('★ 登録 action の段階の台帳は LIVE_ACTIONS と両方向に一致する', () => {
    const live = new Set<string>();
    for (const [svc, actions] of Object.entries(LIVE_ACTIONS)) {
      for (const a of Object.keys(actions as object)) live.add(`${svc}/${a}`);
    }
    expect(live.size).toBeGreaterThan(50);
    expect([...live].filter((k) => !Object.hasOwn(ACTION_TIER, k)).sort(), '台帳に無い action (段階を書く)').toEqual([]);
    expect(Object.keys(ACTION_TIER).filter((k) => !live.has(k)).sort(), '実在しない行').toEqual([]);
  });

  it('★ 外部へ書き込む名前 (create-/send-/sync-/purge-) は確かめる段階に居る', () => {
    const risky = /\/(create-|send-|sync-|purge-|post-)/;
    for (const key of Object.keys(ACTION_TIER)) {
      if (!risky.test(key)) continue;
      const [svc, ...rest] = key.split('/');
      expect(CONFIRMED_TIERS.has(tierOfAction(svc!, rest.join('/'))), key).toBe(true);
    }
  });

  it('★ 全 IPC ハンドラは「確認の対象」か「対象外 (理由つき)」のどちらかで、両方向に一致する', () => {
    const bodies = handlerBodies();
    const names = [...bodies.keys()].sort();
    expect(names).toHaveLength(15);
    const claimed = [...Object.keys(GUARDED), ...Object.keys(THROTTLED), ...Object.keys(NOT_GUARDED)].sort();
    expect(names).toEqual(claimed);
    for (const [name, why] of Object.entries(NOT_GUARDED)) {
      expect(why.length, `${name} の理由`).toBeGreaterThanOrEqual(10);
      expect(bodies.get(name)!, `${name} は確認を呼ばないと宣言している`).not.toContain('requirePresence(');
    }
  });

  it('★ 速度だけを掛ける口は、副作用より前に throttleMessage を段階つきで呼び、断られたら戻る (threat: T-159)', () => {
    const bodies = handlerBodies();
    for (const [name, tier] of Object.entries(THROTTLED)) {
      const body = bodies.get(name)!;
      const call = `throttleMessage(e, '${name}', '${tier}'`;
      const gate = body.indexOf(call);
      expect(gate, `${name} は ${call} を呼ぶ`).toBeGreaterThan(-1);
      expect(body, `${name} は確認を直には呼ばない (速度だけ)`).not.toContain('requirePresence(');
      // 副作用 (取得・開く・書く・通信) より前に置き、断られたら戻る。
      const effect = { 'app:checkUpdate': 'await fetch(', 'app:setColorScheme': 'windowPrefs = prefs', 'fetch:snapshot': 'isServiceId(', 'app:revealInFolder': 'shellTargetOrNull(', 'app:openPath': 'shellTargetOrNull(' }[name]!;
      const side = body.indexOf(effect);
      expect(side, `${name} の副作用 ${effect}`).toBeGreaterThan(-1);
      expect(gate, `${name}: 門が副作用より前`).toBeLessThan(side);
      expect(body.slice(gate, side), `${name}: 断られたら戻る`).toMatch(/return/);
    }
  });

  it('★ 確認の対象は、副作用より前に requirePresence を呼び、断られたら戻る', () => {
    const bodies = handlerBodies();
    for (const [name, effect] of Object.entries(GUARDED)) {
      const body = bodies.get(name)!;
      const gate = body.indexOf('requirePresence(');
      const side = body.indexOf(effect);
      expect(gate, `${name} は requirePresence を呼ぶ`).toBeGreaterThan(-1);
      expect(side, `${name} の副作用 ${effect}`).toBeGreaterThan(-1);
      expect(gate, `${name}: 確認が副作用より前`).toBeLessThan(side);
      const after = body.slice(gate, side);
      expect(after, `${name}: 断られたら戻る`).toMatch(/if \(!presence\.ok\)/);
      expect(after, `${name}: 戻る`).toMatch(/return/);
    }
  });

  it('針は実物に当たる (空の検査にしない)', () => {
    expect(src).toContain("ipcMain.handle('secrets:set'");
    expect(stripComments('// requirePresence(\nconst x = 1;')).not.toContain('requirePresence(');
  });
});
