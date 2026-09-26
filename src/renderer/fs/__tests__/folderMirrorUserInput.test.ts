/**
 * **利用者が打った文字列は、実ディスクへ書くファイル名に届く** (2026-09-21 · パス 362)。
 *
 * `fsa.ts` には 2026-08-22 から、ファイル名の関門の隣にこう書いてあった:
 *
 * > (渡ってくる名前はアプリが組み立てたもの (`service-hub-YYYYMMDD-HHMM.txt`
 * >  など) で利用者入力ではないため、これは多層防御。)
 *
 * **その主張は 2026-08-23 に偽と測られ、`shared/safeFilename.ts` では撤回された**
 * (「『利用者入力ではない』は誤りだった」という節が、teamradar の SVG 書き出しを
 * 反例として名指ししている)。ところが**同じ文の写しが `fsa.ts` に残り、
 * パス 362 まで誰も直さなかった** —— 撤回が 2 部のうち 1 部にしか届いていない。
 *
 * ## なぜ散文の綴りではなく振る舞いを留めるのか
 *
 * 「その文が無いこと」を主張する検査にすると、**言い換えられた瞬間に黙る**
 * (規約「不在を主張する検査には標本を添える」の、より悪い側)。ここで固定するのは
 * **事実**のほう —— 利用者が打った題名が実ディスクの書き手へ届くこと。
 * これが通る限り「利用者入力ではない」とは書けない。
 *
 * ## 実物の経路 (実測)
 *
 * ```
 *   teamradar の export-svg → filenameFromTitle(p.title, …)   ← p.title は画面で利用者が打つ
 *     → saveToLibrary('teamradar', filename, …)
 *       → mirrorToFolder(REAL_MIRROR, filename, blob)
 *         → REAL_MIRROR.write === writeBlobToFolder            ← 実ディスクへ書く
 * ```
 *
 * **今日この関門は破れない** —— 敵性の題名でも `filenameFromTitle` が
 * 区切りも制御文字も落とし、`isSafeFilename` が最後に立つ。危ないのは説明の方で、
 * 「入力は安全だからここは飾り」と読んだ次の人が、**既に偽と分かっている前提**から
 * この関門を緩める判断を下すことになる。
 */
import { describe, expect, it, vi } from 'vitest';
import { mirrorToFolder, REAL_MIRROR, type MirrorDeps } from '../folderMirror';
import { writeBlobToFolder } from '../fsa';
import { filenameFromTitle, isSafeFilename } from '../../../shared/safeFilename';

/** 画面から打てる敵性の題名 (2026-08-23 の 17 種から、性質の違う物を採った)。 */
const HOSTILE_TITLES = [
  '../../../etc/passwd',
  '..',
  '.',
  'a/b\\c',
  'x\u0000y',
  'line\r\nbreak',
  '~/.ssh/authorized_keys',
  'A'.repeat(500),
  '',
  '   ',
  '🎯'.repeat(50),
];

describe('利用者の入力は実ディスクの書き手へ届く (パス 362)', () => {
  it('★ 実物の配線は writeBlobToFolder を指す (差し替えではなく本物を見る)', () => {
    // これが `writeBlobToFolder` でなくなったら、下の経路の主張は別の物になる。
    expect(REAL_MIRROR.write).toBe(writeBlobToFolder);
  });

  it('★ 利用者が打った題名から作った名前が、そのまま書き手へ渡る', async () => {
    const seen: string[] = [];
    const deps: MirrorDeps = {
      load: () =>
        Promise.resolve({
          handle: {} as FileSystemDirectoryHandle,
          permission: 'granted' as const,
        }),
      write: (_h, filename) => {
        seen.push(filename);
        return Promise.resolve();
      },
    };
    // web-shim の export-svg と同じ組み立て。
    const userTyped = '四半期レビュー';
    const filename = filenameFromTitle(userTyped, 1_700_000_000_000, '.svg');
    const outcome = await mirrorToFolder(deps, filename, new Blob(['<svg/>']));
    expect(outcome).toBe('saved');
    // **利用者が打った物に由来する名前が届いている** —— つまり「利用者入力ではない」は偽。
    expect(seen).toEqual([filename]);
    expect(filename).toContain('1700000000000');
    expect(filename.endsWith('.svg')).toBe(true);
  });

  it.each(HOSTILE_TITLES.map((t) => [t.length > 24 ? `${t.slice(0, 24)}… (${t.length})` : JSON.stringify(t), t] as const))(
    '★ 敵性の題名 %s でも、届く名前は 1 階層の安全な名前になる',
    (_label, title) => {
      const filename = filenameFromTitle(title, 1_700_000_000_000, '.svg');
      // 関門を通る = `writeBlobToFolder` の 1 行目で断られない。
      expect(isSafeFilename(filename), filename).toBe(true);
      // 区切りも制御文字も残らない (1 階層の名前であること)。
      expect(filename).not.toMatch(/[/\\\0\r\n]/);
      // `.` / `..` そのものにはならない (時刻の接尾辞が不変条件)。
      expect(filename === '.' || filename === '..').toBe(false);
      expect(filename).toContain('1700000000000');
    },
  );

  it('★ 針が当たることの標本 (区切りを残す組み立てなら上の検査は鳴る)', () => {
    // `filenameFromTitle` を通さずに題名をそのまま使うと関門に落ちる ——
    // つまり上の検査は「何を入れても通る空の検査」ではない。
    expect(isSafeFilename('../../../etc/passwd')).toBe(false);
    expect(isSafeFilename('a/b\\c')).toBe(false);
    expect('../../../etc/passwd').toMatch(/[/\\\0\r\n]/);
  });

  it('★ 書き手が投げても mirrorToFolder は投げない (best-effort の約束)', async () => {
    const write = vi.fn(() => Promise.reject(new Error('disk full')));
    const deps: MirrorDeps = {
      load: () => Promise.resolve({ handle: {} as FileSystemDirectoryHandle, permission: 'granted' as const }),
      write,
    };
    await expect(mirrorToFolder(deps, 'service-hub-1700000000000.svg', new Blob(['x']))).resolves.toBe('failed');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
