/**
 * **プレリリースは対応する正式版より前** —— 順序の規則は 1 つ。 (2026-09-22 · パス 402)
 *
 * ## 見つけた欠陥 (実測 2026-09-22 · 直す前)
 *
 * `shared/ollama.ts` の `compareVersions` は `v.split('-')[0]` で識別子を**捨てて**
 * おり、`compareVersions('0.1.34-rc1', '0.1.34') === 0` だった。効いたのは下流の
 * 2 つで、**どちらも安全側の判断**である:
 *
 * | 版 | 直す前の該当 | 直した後 |
 * | --- | ---: | ---: |
 * | `0.1.33`     | 7 件 | 7 件 |
 * | `0.1.34-rc1` | **6 件** (CVE-2024-37032 が黙る) | **7 件** |
 * | `0.1.46-rc5` | **2 件** | **6 件** |
 * | `0.17.1-rc1` | **1 件** (CVE-2026-7482 · CVSS 8.8 が黙る) | **2 件** |
 * | `0.31.2-rc1` | `isVersionSafe` = **true** | **false** |
 *
 * 台帳 8 件のうち `fixedIn` を持つ 7 件は、**全部**が `fixedIn + '-rc1'` を名乗る
 * だけで黙った。`/api/version` が返すのは利用者の Ollama が名乗る文字列で、
 * Ollama は `-rc` 付きのリリースを実際に公開している。
 *
 * ## 同じ問いに、同じアプリが 2 通り答えていた
 *
 * `shared/updateCheck.ts` は**正しく**答えていた (`prereleaseKey` で正式版を
 * U+FFFF に置く)。その docblock は「必要なのは『x.y.z の大小』と『プレリリースは
 * 正式版より古い』の 2 点だけ」と、この規則を名指ししている。**弱い方が
 * security の側に在った** —— どちらが危ない側に立っているかは名前からは分からない。
 *
 * ## 揃えなかった物 (意図)
 *
 * 数の読み方は共有しない。`updateCheck` は自分たちのタグを読むので厳格で、
 * 読めなければ null を返す。`ollama` は第三者が名乗る任意の文字列を読むので
 * 読めない成分を 0 に倒して**必ず答えを出す** —— 不明な版を「安全」と言わない
 * ための fail-closed で、下の「壊れた版は今も古い側へ倒れる」がそれを留める。
 * 揃えると片方が必ず緩む (`loopbackChecks.test.ts` と同じ判断)。
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_SAFE_VERSION,
  OLLAMA_ADVISORIES,
  applicableAdvisories,
  buildWarnings,
  compareVersions,
  isVersionSafe,
  prereleaseIsBelowFloor,
  unsafeVersionCause,
  unsafeVersionTexts,
  type UnsafeVersionCause,
} from '../ollama';
import {
  RELEASE_SORTS_AFTER_PRERELEASE,
  prereleaseKey,
  splitVersionPrerelease,
} from '../versionOrder';
import { compareVersions as compareParsed, parseVersion } from '../updateCheck';

/** 台帳から導く —— 版を手で並べると、台帳に 9 件目が入った日に黙る。 */
const FIXED_IN = OLLAMA_ADVISORIES.filter((a) => a.fixedIn !== null).map((a) => ({
  id: a.id,
  fixedIn: a.fixedIn as string,
  severity: a.severity,
}));

describe('プレリリースは正式版より前 (順序の規則は 1 つ)', () => {
  it('★ 台帳の修正版の rc を名乗っても、その勧告は黙らない (欠陥そのものの回帰)', () => {
    expect(FIXED_IN.length, 'fixedIn を持つ勧告の件数 (走査が空虚でない床)').toBeGreaterThanOrEqual(5);
    for (const a of FIXED_IN) {
      const rc = `${a.fixedIn}-rc1`;
      const hit = applicableAdvisories(rc, OLLAMA_ADVISORIES).map((x) => x.id);
      expect(hit, `${a.id} (fixedIn ${a.fixedIn}) は ${rc} にも当てはまる`).toContain(a.id);
      // 正式版では黙る (両方向 —— 常に当てはめる実装でも落ちる)
      const onFixed = applicableAdvisories(a.fixedIn, OLLAMA_ADVISORIES).map((x) => x.id);
      expect(onFixed, `${a.id} は正式版 ${a.fixedIn} では当てはまらない`).not.toContain(a.id);
    }
  });

  it('★ critical / high の勧告が実際にこの家系に居る (賭け金の床)', () => {
    const heavy = FIXED_IN.filter((a) => a.severity === 'critical' || a.severity === 'high');
    expect(heavy.length, 'critical / high の件数').toBeGreaterThanOrEqual(2);
    for (const a of heavy) {
      expect(
        applicableAdvisories(`${a.fixedIn}-rc1`, OLLAMA_ADVISORIES).map((x) => x.id),
        `${a.severity} の ${a.id}`,
      ).toContain(a.id);
    }
  });

  it('★ isVersionSafe: 床の rc は安全でない / 床そのものは安全', () => {
    expect(isVersionSafe(`${MIN_SAFE_VERSION}-rc1`)).toBe(false);
    expect(isVersionSafe(MIN_SAFE_VERSION)).toBe(true);
    // 床より後の rc は安全 (プレリリースを一律に落とすのではない)
    expect(isVersionSafe('99.0.0-rc1')).toBe(true);
  });

  it('compareVersions は識別子で順序を付ける (ビルドメタデータは順序に関与しない)', () => {
    expect(compareVersions('0.1.34-rc1', '0.1.34')).toBe(-1);
    expect(compareVersions('0.1.34', '0.1.34-rc1')).toBe(1);
    expect(compareVersions('0.1.34-rc1', '0.1.34-rc2')).toBe(-1);
    expect(compareVersions('0.1.34-rc-1', '0.1.34')).toBe(-1); // 識別子は最初の - から後ろ全部
    expect(compareVersions('0.1.34+build', '0.1.34')).toBe(0); // semver §10
    expect(compareVersions('0.1.34', '0.1.34')).toBe(0);
  });

  it('★ 壊れた版は今も古い側へ倒れる (fail-closed は残す)', () => {
    for (const bad of ['', 'garbage', '0.x.y', 'v', '..']) {
      expect(isVersionSafe(bad), `isVersionSafe('${bad}')`).toBe(false);
    }
    // 読めない成分は 0 —— 「答えを出さない」ではなく「古い」と答える
    expect(compareVersions('garbage', MIN_SAFE_VERSION)).toBe(-1);
  });
});

describe('原因は 1 か所で選び、3 つの面が同じ判定から出る', () => {
  const SAMPLES = [
    '',
    'garbage',
    '0.1.33',
    '0.1.34-rc1',
    MIN_SAFE_VERSION,
    `${MIN_SAFE_VERSION}-rc1`,
    '99.0.0',
    '99.0.0-rc1',
  ];

  it('★ 両方向の不変条件: 原因が無い ⟺ isVersionSafe', () => {
    let safe = 0;
    let unsafe = 0;
    for (const v of SAMPLES) {
      const cause = unsafeVersionCause(v);
      expect(cause === null, `unsafeVersionCause('${v}') と isVersionSafe('${v}')`).toBe(
        isVersionSafe(v),
      );
      if (cause === null) safe += 1;
      else unsafe += 1;
    }
    // 走査が片側に潰れていない床 (常に null / 常に非 null の実装でも落ちる)
    expect(safe, '安全と判定された標本').toBeGreaterThanOrEqual(2);
    expect(unsafe, '安全でないと判定された標本').toBeGreaterThanOrEqual(4);
  });

  it('★ 原因は取り違えない (読めない / プレリリース / 古い)', () => {
    expect(unsafeVersionCause('')).toBe('unreadable');
    expect(unsafeVersionCause(`${MIN_SAFE_VERSION}-rc1`)).toBe('prerelease');
    expect(unsafeVersionCause('0.1.33')).toBe('outdated');
    expect(unsafeVersionCause(MIN_SAFE_VERSION)).toBeNull();
  });

  it('★ 順序は isVersionSafe と同じ —— 空文字は「プレリリース」ではなく「読めない」', () => {
    // '' は prereleaseIsBelowFloor では判定できない。原因の選択が isVersionSafe の
    // 早期 return と同じ順序でなければ、ここが 'outdated' か例外になる。
    expect(unsafeVersionCause('')).toBe('unreadable');
    expect(prereleaseIsBelowFloor('', MIN_SAFE_VERSION)).toBe(false);
  });

  it('★ プレリリースの文だけが「番号は足りて見える」ことを述べる', () => {
    const texts = unsafeVersionTexts('prerelease');
    expect(texts.note).toContain('プレリリース');
    expect(texts.note).toContain(MIN_SAFE_VERSION);
    expect(texts.note).toContain('正式版');
    // 対照: 他の 2 つはこの理由を述べない (述べたら原因を取り違えている)
    expect(unsafeVersionTexts('unreadable').note).not.toContain('プレリリースは');
    expect(unsafeVersionTexts('outdated').note).not.toContain('プレリリースは');
  });

  it('★ 3 つの面は 1 つの switch から出る (原因ごとに 3 つとも別物・空でない)', () => {
    const causes: UnsafeVersionCause[] = ['unreadable', 'prerelease', 'outdated'];
    const seen = new Set<string>();
    for (const c of causes) {
      const t = unsafeVersionTexts(c);
      for (const [face, text] of Object.entries(t)) {
        expect(text, `${c}.${face}`).not.toBe('');
        expect(seen.has(text), `${c}.${face} が他の原因と同じ文面`).toBe(false);
        seen.add(text);
      }
    }
    expect(seen.size).toBe(causes.length * 3);
  });

  it('★ 警告文は「番号が同じでも修正が入っているとは限らない」を、その状態だけで言う', () => {
    const floor = FIXED_IN[FIXED_IN.length - 1] as { fixedIn: string };
    const rc = buildWarnings(`${floor.fixedIn}-rc1`).join('\n');
    expect(rc).toContain('プレリリースは対応する正式版より前');
    // 対照: 単に古いだけの版には足さない (同じ事実を要らない所で言わない)
    const old = buildWarnings('0.1.0').join('\n');
    expect(old).toContain('既知の脆弱性');
    expect(old).not.toContain('プレリリースは対応する正式版より前');
  });
});

describe('順序の規則は 2 つの比較器で一致する', () => {
  const PAIRS: readonly (readonly [string, string])[] = [
    ['0.1.34-rc1', '0.1.34'],
    ['0.1.34', '0.1.34-rc1'],
    ['0.1.34-rc1', '0.1.34-rc2'],
    ['1.0.0-alpha', '1.0.0-beta'],
    ['1.0.0', '1.0.1'],
    ['2.0.0', '1.9.9'],
    ['0.31.2', '0.31.2'],
    ['0.31.2-rc1', '0.31.2-rc1'],
  ];

  it('★ 両方が読める版では、符号が一致する (規則を 2 度書いていない証拠)', () => {
    let compared = 0;
    for (const [a, b] of PAIRS) {
      const pa = parseVersion(a);
      const pb = parseVersion(b);
      if (pa === null || pb === null) continue;
      compared += 1;
      expect(Math.sign(compareVersions(a, b)), `${a} vs ${b}`).toBe(
        Math.sign(compareParsed(pa, pb)),
      );
    }
    expect(compared, '両方が読めた組 (走査が空虚でない床)').toBeGreaterThanOrEqual(6);
  });

  it('正式版のキーは識別子に使えない字 —— だから辞書順 1 本で順序が付く', () => {
    expect(prereleaseKey(null)).toBe(RELEASE_SORTS_AFTER_PRERELEASE);
    expect(prereleaseKey('rc1')).toBe('rc1');
    // 版の正規表現が通す字はすべて U+FFFF より小さい
    for (const ch of '0123456789abzABZ.-') {
      expect(ch < RELEASE_SORTS_AFTER_PRERELEASE, `'${ch}' < U+FFFF`).toBe(true);
    }
  });

  it('splitVersionPrerelease: ビルドメタデータを先に落とし、識別子は最初の - から後ろ全部', () => {
    expect(splitVersionPrerelease('0.1.34')).toEqual({ core: '0.1.34', prerelease: null });
    expect(splitVersionPrerelease('0.1.34-rc1')).toEqual({ core: '0.1.34', prerelease: 'rc1' });
    expect(splitVersionPrerelease('0.1.34-rc-1')).toEqual({ core: '0.1.34', prerelease: 'rc-1' });
    expect(splitVersionPrerelease('0.1.34+b-1')).toEqual({ core: '0.1.34', prerelease: null });
    expect(splitVersionPrerelease('0.1.34-rc1+b')).toEqual({ core: '0.1.34', prerelease: 'rc1' });
  });
});
