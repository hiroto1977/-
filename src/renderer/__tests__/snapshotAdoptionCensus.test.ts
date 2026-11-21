/**
 * **スナップショットを画面の編集状態へ取り込む所の母集団** (2026-09-20 · パス 335)。
 *
 * `useServiceData` が返す `data` は 3 つのうちどれかである —— 利用者が保存した物 /
 * まだ何も無いときの**同梱の見本** / 読めなかったときの**同梱の見本**。最後の 2 つは飾りで、
 * 利用者の物ではない。それを `useEffect` で画面の編集状態 (`useState`) へ写すと、
 * 自動保存を持つ画面では**その見本がそのまま端末へ書かれ**、利用者が何も押していないのに
 * 編集中の内容が消える (実測は `pages/__tests__/teamRadarSampleNeverOverwrites.test.ts`)。
 *
 * ## 針 —— 別名を機械で解決する
 *
 * `data` という綴りだけを数えると **母集団の半分が映らない**: `TalentPage` は
 * `const snap = data as TalentSnapshot;` と置き直してから `[source, loaded, snap]` を
 * 依存に書く。パス 334 で同じ死角 (本体が 1 行の別名の先に在る呼び出しが 1 件も映らない) を
 * 踏んだばかりなので、ここでは最初から**代入の連鎖を収束まで追う**。
 * 実測: 綴りだけなら 1 件 → 別名を解くと 2 件。
 *
 * ## 認める守り方は 2 種
 *
 * - `stored-saved` … 取り込む前に「これは利用者が保存した物か」を確かめる。
 * - `no-local-draft` … その画面は端末へ自動保存しない (保存はボタンだけ) ので、
 *   取り込んでも**書き戻す先が無い**。これは字面で確かめる (localStorage へ書く綴りが無い)。
 *
 * 「まだ直していない」は理由にならない —— それは残作業なので `docs/REMAINING_WORK.md` へ。
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDir, readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');
const DIRS = ['src/renderer/pages', 'src/renderer/components'];

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const d of DIRS) {
    for (const f of readOriginalDir(join(REPO, d))) {
      if (f.endsWith('.tsx')) out.push(`${d}/${f}`);
    }
  }
  return out.sort();
}

/** `useServiceData` の `data` に付いた名前と、そこから作られた別名 (収束まで)。 */
export function snapshotNames(src: string): string[] {
  const names = new Set<string>();
  const bind = /const\s*\{([^}]*)\}\s*=\s*useServiceData/g;
  let m: RegExpExecArray | null;
  while ((m = bind.exec(src)) !== null) {
    for (const part of m[1]!.split(',')) {
      const t = part.trim();
      if (t === '') continue;
      const kv = t.split(':').map((x) => x.trim());
      if (kv[0] === 'data') names.add(kv.length > 1 ? kv[1]! : kv[0]!);
    }
  }
  // `const snap = data as TalentSnapshot;` / `const x = snap;` を収束まで辿る。
  for (let pass = 0; pass < 5; pass += 1) {
    const before = names.size;
    const alias = /const\s+(\w+)\s*=\s*(\w+)(?:\s+as\s+[^;]+)?;/g;
    let a: RegExpExecArray | null;
    while ((a = alias.exec(src)) !== null) if (names.has(a[2]!)) names.add(a[1]!);
    if (names.size === before) break;
  }
  return [...names].sort();
}

export interface Adoption {
  readonly file: string;
  readonly deps: string;
  readonly setters: readonly string[];
  readonly body: string;
}

/**
 * スナップショット (またはその別名) を依存に持ち、本体で `setX(` を呼ぶ `useEffect`。
 * 依存配列は複数行のことが在る (実測 4 ファイル) ので改行を許す。
 */
export function adoptions(files: readonly string[]): Adoption[] {
  const out: Adoption[] = [];
  for (const file of files) {
    const src = readOriginalSource(join(REPO, file));
    const names = snapshotNames(src);
    if (names.length === 0) continue;
    const deps = /\}\s*,\s*\[([^\]]*)\]\s*\)\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = deps.exec(src)) !== null) {
      const list = m[1]!;
      if (!names.some((n) => new RegExp(`\\b${n}\\b`).test(list))) continue;
      const before = src.slice(0, m.index);
      const i = before.lastIndexOf('useEffect(');
      if (i < 0) continue;
      if (before.lastIndexOf('useMemo(') > i || before.lastIndexOf('useCallback(') > i) continue;
      const body = before.slice(i);
      const setters = [...new Set([...body.matchAll(/\bset[A-Z]\w*\(/g)].map((x) => x[0]))];
      if (setters.length === 0) continue;
      out.push({ file, deps: list.replace(/\s+/g, ' ').trim(), setters, body });
    }
  }
  return out;
}

/** その画面が端末へ自分で書くか (自動保存の有無を字面で見る)。 */
export function writesToDevice(file: string): boolean {
  const src = readOriginalSource(join(REPO, file));
  return /localStorage\.setItem\(|writeLocalJson\(|writeLocalString\(|saveDraft\(/.test(src);
}

type Guard = 'stored-saved' | 'no-local-draft';

const LEDGER: readonly { readonly file: string; readonly guard: Guard; readonly why: string }[] = [
  {
    file: 'src/renderer/pages/TalentPage.tsx',
    guard: 'no-local-draft',
    why: '保存は「保存」ボタンだけ (invoke talent/save-state)。端末へ自動保存しないので、取り込んでも書き戻す先が無い。読めなかったときに返るのも見本ではなく空 (パス 121)',
  },
  {
    file: 'src/renderer/pages/TeamRadarPage.tsx',
    guard: 'stored-saved',
    why: '下書きを `servicehub.teamradar.draft.v1` へ自動保存するので、見本を取り込むと端末の編集内容が消える。取り込むのは stored === "saved" のときだけ (パス 335)',
  },
];

describe('スナップショットを編集状態へ取り込む所 (パス 335)', () => {
  const files = sourceFiles();
  const found = adoptions(files);

  it('走査が死んでいない (画面の母集団に床)', () => {
    expect(files.length).toBeGreaterThanOrEqual(60);
    expect(found.length).toBeGreaterThan(0);
  });

  it('★ 母集団と台帳は両方向に一致する', () => {
    expect([...new Set(found.map((a) => a.file))].sort()).toEqual(
      LEDGER.map((r) => r.file).sort(),
    );
  });

  it('★ 別名を解かないと母集団の半分が消える (針の標本)', () => {
    // `data` の綴りだけを数える針 —— パス 334 で踏んだ死角と同じ形。
    const naive = found.filter((a) => /\bdata\b/.test(a.deps));
    expect(naive).toHaveLength(1);
    expect(found.length).toBeGreaterThan(naive.length);
    // 別名の解決そのものを、実物の 1 行で示す。
    expect(snapshotNames('const { data } = useServiceData(x);\nconst snap = data as T;')).toEqual(
      ['data', 'snap'],
    );
    expect(snapshotNames('const { data: mf } = useServiceData(x);')).toEqual(['mf']);
    // 対照 — `useServiceData` を使わない画面からは 1 つも採らない。
    expect(snapshotNames('const snap = somethingElse as T;')).toEqual([]);
  });

  it('★ stored-saved の行は、取り込む前に「利用者が保存した物か」を確かめている', () => {
    const rows = LEDGER.filter((r) => r.guard === 'stored-saved');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const effects = found.filter((a) => a.file === r.file);
      expect(effects.length, r.file).toBeGreaterThan(0);
      for (const e of effects) {
        expect(e.body, `${r.file}: 見本を取り込まない判定が無い`).toMatch(
          /stored\s*!==\s*'saved'|!\s*\w*[Ii]sMock|payloadIsMock/,
        );
      }
    }
  });

  it('★ no-local-draft の行は、実際に端末へ書いていない', () => {
    for (const r of LEDGER.filter((x) => x.guard === 'no-local-draft')) {
      expect(writesToDevice(r.file), `${r.file}: 端末へ書いているなら守りが要る`).toBe(false);
    }
    // 標本 — 針は「書いている画面」を実際に拾う (どの入力でも false を返す針ではない)。
    expect(writesToDevice('src/renderer/pages/TeamRadarPage.tsx')).toBe(true);
  });

  it('台帳の理由は 2 種のどちらかで、空でない', () => {
    for (const r of LEDGER) {
      expect(['stored-saved', 'no-local-draft']).toContain(r.guard);
      expect(r.why.length, r.file).toBeGreaterThan(30);
    }
  });

  it('★ 実測を凝固させる (走査が広がったら読み直す)', () => {
    expect(found).toHaveLength(2);
    expect(found.map((a) => a.file)).toEqual([
      'src/renderer/pages/TalentPage.tsx',
      'src/renderer/pages/TeamRadarPage.tsx',
    ]);
  });

  it('対照 — 針は「依存にスナップショットが無い useEffect」を拾わない', () => {
    // 同じファイルの中に在る他の useEffect (自動保存・鍵の購読など) は入っていない。
    const teamRadar = readOriginalSource(join(REPO, 'src/renderer/pages/TeamRadarPage.tsx'));
    const allEffects = (teamRadar.match(/useEffect\(/g) ?? []).length;
    expect(allEffects).toBeGreaterThan(1);
    expect(found.filter((a) => a.file === 'src/renderer/pages/TeamRadarPage.tsx')).toHaveLength(1);
  });
});
