import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

/*
 * **秘密を受ける入力欄は、ブラウザの資格情報ストアに対する態度を必ず宣言する。** (2026-09-11 · パス 147)
 *
 * 直す前は `type="password"` の欄が **16 個**在り、`autoComplete` を宣言していたのは
 * `LockScreen.tsx` の 4 つだけだった。残り 12 (API キー 4・サービストークン 2・
 * 保管庫パスワード変更 3・バックアップの合言葉・プロキシの共有秘密・強度チェッカー) は無宣言で、
 * **宣言が無いとブラウザの判断に委ねられる** —— 保存を勧める / 保存済みの物を流し込む、
 * どちらもこちらが選んでいないことになる。
 *
 * ここが他の媒体と違うのは、**ブラウザの資格情報ストアはこの app が消せない**ことである。
 * 台帳 4 つ (`scripts/lint-storage-ledger.cjs` の `STORES` / `docs/DATA_PROTECTION.md` /
 * `shared/atRestInventory.ts` / `renderer/security/eraseAll.ts`) はどれもこの媒体を持たない ——
 * Web Storage の API ではないので `lint:storage` の走査は**仕組み上**届かない。
 * だから「すべてのデータを削除」の**消えない物**の側に書いた (パス 136 の一覧)。
 *
 * **この検査は綴りに当たる。** だから 2 つの穴を同時に閉じる:
 *   1. `type="password"` の欄はすべて `autoComplete` を宣言する (token も限る)
 *   2. `type` を計算で決める欄を作らない —— 作れば 1 の走査を綴りで抜けられる
 */

const SRC = path.resolve(__dirname, '../..');

/** 宣言してよい token。`on` は「ブラウザに任せる」なので秘密の欄では選べない。 */
const ALLOWED_TOKENS: readonly string[] = ['off', 'new-password', 'current-password'];

/** 走査が実物に当たっていることの床 (空の母集団で通らない)。実測 2026-09-11: 16。 */
const POPULATION_FLOOR = 16;

interface Field {
  /** `src/` からの相対の道 + 行。 */
  readonly where: string;
  /** 宣言していた token (無宣言なら null)。 */
  readonly token: string | null;
}

/** `src/` の実装ファイル (検査・型定義を除く .tsx)。 */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') tsxFiles(p, out);
      continue;
    }
    if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/**
 * 1 ファイルの原文から `type="password"` の欄を取る。
 *
 * 囲む札は `<` から直後の `>` / `/>` まで。属性が複数行に散っていても同じ札の中に入る
 * (だから 1 行ずつの grep では読めず、ここで札を組み立てている)。
 * **export して対照から呼ぶ** —— 走査そのものが鳴ることを標本で確かめるため。
 */
export function passwordFields(src: string, label: string): Field[] {
  const out: Field[] = [];
  for (let i = src.indexOf('type="password"'); i !== -1; i = src.indexOf('type="password"', i + 1)) {
    const open = src.lastIndexOf('<', i);
    const selfClose = src.indexOf('/>', i);
    const plain = src.indexOf('>', i);
    const close = selfClose !== -1 && (plain === -1 || selfClose <= plain) ? selfClose : plain;
    const tag = src.slice(open, close + 1);
    const declared = /autoComplete="([^"]*)"/.exec(tag);
    out.push({ where: `${label}:${src.slice(0, i).split('\n').length}`, token: declared?.[1] ?? null });
  }
  return out;
}

function census(): Field[] {
  return tsxFiles(SRC).flatMap((f) =>
    passwordFields(readOriginalSource(f), path.relative(SRC, f).split(path.sep).join('/')),
  );
}

describe('秘密を受ける入力欄は autoComplete を宣言する (母集団は走査で数える · パス 147)', () => {
  const found = census();

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(found.length).toBeGreaterThanOrEqual(POPULATION_FLOOR);
    // 保管庫の入口は必ず母集団に居る (ここが落ちたら走査の道が変わった)。
    expect(found.map((f) => f.where).filter((w) => w.startsWith('renderer/security/LockScreen.tsx')).length)
      .toBeGreaterThanOrEqual(4);
  });

  it('★ 無宣言の欄が 1 つも無い', () => {
    const bare = found.filter((f) => f.token === null).map((f) => f.where);
    expect(bare, 'autoComplete を宣言していない type="password" の欄').toEqual([]);
  });

  it('★ token は限った 3 つのどれか (`on` = ブラウザに任せる、は選べない)', () => {
    const odd = found.filter((f) => f.token !== null && !ALLOWED_TOKENS.includes(f.token));
    expect(odd.map((f) => `${f.where}=${f.token ?? ''}`), `使える token: ${ALLOWED_TOKENS.join(' / ')}`).toEqual([]);
  });

  it('★ `type` を計算で決める欄が無い (綴りの走査を抜けられない)', () => {
    const computed = tsxFiles(SRC)
      .filter((f) => /type=\{[^}]*password/.test(readOriginalSource(f)))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'));
    expect(computed, 'type を式で書くと type="password" の走査に当たらない').toEqual([]);
  });

  /*
   * 対照 —— **走査そのものが鳴ることを標本で確かめる。**
   * 「無宣言が 0 件」は綴りが 1 つ違えば黙る形の主張なので、
   * 同じ関数に無宣言の札を食わせて「拾う」ことを見る (CLAUDE.md の規約)。
   */
  describe('対照: 走査が標本で鳴る', () => {
    it('無宣言の札を拾う', () => {
      const sample = '<input\n  type="password"\n  value={v}\n/>';
      expect(passwordFields(sample, 'sample')).toEqual([{ where: 'sample:2', token: null }]);
    });

    it('複数行に散った宣言を同じ札の中として読む (1 行ずつの grep では読めない形)', () => {
      const sample = '<input\n  type="password"\n  autoComplete="off"\n  value={v}\n/>';
      expect(passwordFields(sample, 'sample')).toEqual([{ where: 'sample:2', token: 'off' }]);
    });

    it('隣の札の宣言を自分の物として数えない', () => {
      const sample = '<input type="password" />\n<input type="text" autoComplete="off" />';
      expect(passwordFields(sample, 'sample')).toEqual([{ where: 'sample:1', token: null }]);
    });

    it('`on` は限った token に入っていない (規則が実際にその文面へ当たる)', () => {
      expect(ALLOWED_TOKENS).not.toContain('on');
      const sample = '<input type="password" autoComplete="on" />';
      const [field] = passwordFields(sample, 'sample');
      expect(field?.token).toBe('on');
      expect(ALLOWED_TOKENS.includes(field?.token ?? '')).toBe(false);
    });
  });
});
