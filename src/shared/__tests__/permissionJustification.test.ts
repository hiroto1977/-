import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

/*
 * **権限を拒む根拠は「使っていない」—— その「使っていない」を測る。** (2026-09-11 · パス 148)
 *
 * `main/main.ts` の `ALLOWED_PERMISSIONS` はクリップボードの 2 つだけで、media /
 * geolocation / notifications / midi / display-capture を拒む。その判断の**根拠は
 * 散文に書かれた実測**だった —— 「このアプリはどれも使っていない (実測: `getUserMedia`
 * 0 件・`geolocation` 0 件・`new Notification` 0 件)」。
 *
 * 許可表そのものは `main/__tests__/mainWindow.test.ts` が留めている (Electron の
 * `.d.ts` から権限の union を読み、クリップボード 2 つ以外は要求側・問い合わせ側の
 * **両方**が拒むことを総当たりする)。**留まっていなかったのは根拠の側**である:
 * 誰かが音声録音のために `getUserMedia` を足すと、
 *
 *   - Electron では**権限が拒否されて黙って動かない** (許可表は変わらないので)
 *   - 散文の「実測 0 件」は**嘘になる**が、何も鳴らない
 *
 * という形になる。リポジトリの最上位の原則 (「手でやった検査は、その場でゲートにする」)
 * を、この実測に当てていなかった。
 *
 * **これは不在を主張する検査なので、標本を添える** (CLAUDE.md の規約)。
 * 綴りが 1 つ違えば黙る形なので、同じ走査が標本で鳴ることを下の対照で確かめる。
 */

const SRC = path.resolve(__dirname, '../..');

/**
 * 拒んでいる権限と、それを要求してしまう呼び出しの綴り。
 *
 * **この表は `main/main.ts` の散文から導いた** —— 散文が名前を挙げている 3 つに、
 * 同じ文が拒むと述べている権限の入口 2 つ (display-capture / midi) を足したもの。
 * 足すときは `ALLOWED_PERMISSIONS` の側と揃えること。
 */
const DENIED_API: readonly { readonly api: string; readonly permission: string }[] = [
  { api: 'getUserMedia', permission: 'media (マイク・カメラ)' },
  { api: 'navigator.geolocation', permission: 'geolocation' },
  { api: 'new Notification(', permission: 'notifications' },
  { api: 'Notification.requestPermission', permission: 'notifications' },
  { api: 'getDisplayMedia', permission: 'display-capture' },
  { api: 'requestMIDIAccess', permission: 'midi' },
];

/** 散文が根拠を書いているファイル (ここだけは綴りが出てよい —— 説明だから)。 */
const PROSE = 'main/main.ts';

/** コメントと文字列を落とす (説明の中の綴りを呼び出しと読まない)。 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/** `src/` の実装ファイル (検査・型定義を除く)。 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') sourceFiles(p, out);
      continue;
    }
    if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/**
 * 拒んでいる権限を要求する呼び出しを探す。**export して対照から呼ぶ。**
 * `files` は「相対の道 → 原文」の組 (対照は実物の代わりに標本を渡す)。
 */
export function deniedApiCallSites(
  files: readonly (readonly [string, string])[],
): { readonly where: string; readonly api: string; readonly permission: string }[] {
  const out: { where: string; api: string; permission: string }[] = [];
  for (const [rel, src] of files) {
    if (rel === PROSE) continue; // 根拠を書いている散文そのもの
    const body = code(src);
    for (const { api, permission } of DENIED_API) {
      const at = body.indexOf(api);
      if (at !== -1) out.push({ where: `${rel}:${body.slice(0, at).split('\n').length}`, api, permission });
    }
  }
  return out;
}

function realFiles(): (readonly [string, string])[] {
  return sourceFiles(SRC).map(
    (f) => [path.relative(SRC, f).split(path.sep).join('/'), readOriginalSource(f)] as const,
  );
}

describe('拒んでいる権限を要求する呼び出しが無い (許可表の根拠 · パス 148)', () => {
  const files = realFiles();

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    // 実測 2026-09-11: 実装ファイルは 400 本を超える。ここが落ちたら走査の道が変わった。
    expect(files.length).toBeGreaterThanOrEqual(300);
    expect(files.map(([rel]) => rel)).toContain(PROSE);
  });

  it('★ media / geolocation / notifications / midi / display-capture の入口を誰も呼んでいない', () => {
    const found = deniedApiCallSites(files).map((f) => `${f.where} → ${f.api} (${f.permission})`);
    expect(
      found,
      'この API は main/main.ts の ALLOWED_PERMISSIONS が拒むので Electron では黙って動かない。' +
        '使うなら許可表と main.ts の根拠の散文を同時に直すこと',
    ).toEqual([]);
  });

  /*
   * 対照 —— **走査が標本で鳴る。** 「どこにも無い」は綴りが 1 つ違えば黙る主張なので、
   * 6 つの綴りのそれぞれについて、同じ関数が標本を拾うことを見る。
   */
  describe('対照: 走査が標本で鳴る', () => {
    it.each(DENIED_API.map((d) => [d.api] as const))('%s を植えると拾う', (api) => {
      const found = deniedApiCallSites([['renderer/sample.ts', `const x = ${api});`]]);
      expect(found).toHaveLength(1);
      expect(found[0]?.api).toBe(api);
    });

    it('コメントの中の綴りは拾わない (根拠の散文を誤って掴まない)', () => {
      const sample = '// getUserMedia は使っていない\n/* navigator.geolocation も */\nconst x = 1;';
      expect(deniedApiCallSites([['renderer/sample.ts', sample]])).toEqual([]);
    });

    it('文字列の中の綴りは拾わない', () => {
      expect(deniedApiCallSites([['renderer/sample.ts', "const s = 'getUserMedia';"]])).toEqual([]);
    });

    it('根拠を書いている散文のファイルは走査から外す (そこには綴りが在る)', () => {
      const sample = 'const x = getUserMedia();';
      expect(deniedApiCallSites([[PROSE, sample]]), '散文のファイルを拾った').toEqual([]);
      expect(deniedApiCallSites([['renderer/other.ts', sample]]), '他のファイルでは拾うこと').toHaveLength(1);
    });
  });
});
