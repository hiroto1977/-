import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  describeUpdate,
  evaluateUpdate,
  isGithubReleaseUrl,
  parseLatestRelease,
  parseVersion,
  type UpdateStatus,
  type UpdateVerdict,
} from '../updateCheck';

/** 版文字列を分解して比較に渡す小道具（読めない表記は例外にして気付く）。 */
function cmp(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa === null || pb === null) throw new Error(`版が読めない: ${a} / ${b}`);
  return compareVersions(pa, pb);
}

describe('parseVersion', () => {
  it('x.y.z を分解する', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
  });

  it('v 接頭辞を許す（GitHub のタグの形）', () => {
    expect(parseVersion('v0.1.0')).toEqual({ major: 0, minor: 1, patch: 0, prerelease: null });
  });

  it('前後の空白を落とす', () => {
    expect(parseVersion('  v1.0.0  ')?.major).toBe(1);
  });

  it('プレリリース識別子を保持する', () => {
    expect(parseVersion('0.2.0-beta.1')?.prerelease).toBe('beta.1');
  });

  /*
   * 版の表記は **前後を固定して**読む。ここが緩むと、タグに紛れ込んだ
   * 余計な文字ごと「読めた」ことになり、更新の有無の判断が別物になる。
   * (2026-08-23 の変異検査で、この 7 通りがどれも検査を通り抜けていた。)
   */
  it('前後に余計な文字があるものは読まない (^ と $ を落とさない)', () => {
    expect(parseVersion('x1.2.3')).toBeNull();
    expect(parseVersion('1.2.3junk')).toBeNull();
    expect(parseVersion('1.2.3.4')).toBeNull();
  });

  // `\d+` を `\d` に縮めると 2 桁以上の版が読めなくなる。**10 系に上がった
  // 瞬間、更新が一切案内されなくなる**ので、桁を跨いだ例で固定する。
  it('2 桁以上の版も読む', () => {
    expect(parseVersion('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30, prerelease: null });
    expect(parseVersion('1.0.12')?.patch).toBe(12);
  });

  // プレリリース識別子は 1 文字ではない。`+` を落とすと `beta.1` が読めない。
  it('プレリリース識別子は複数文字を読む', () => {
    expect(parseVersion('1.0.0-rc')?.prerelease).toBe('rc');
    expect(parseVersion('1.0.0-a')?.prerelease).toBe('a');
    // 識別子に使えない文字が入っていれば読まない (文字クラスの反転を捕まえる)。
    expect(parseVersion('1.0.0-β')).toBeNull();
    expect(parseVersion('1.0.0-rc-2')?.prerelease).toBe('rc-2');
  });

  it('2 桁以上の数値も読む', () => {
    expect(parseVersion('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30, prerelease: null });
  });

  it('読めない表記は null（推測しない）', () => {
    for (const v of [
      '',
      '1',
      '1.2',
      '1.2.3.4',
      'x.y.z',
      '1.2.z',
      'v',
      'latest',
      '1.2.3-',
      '1.2.3+build',
      ' 1 . 2 . 3 ',
    ]) {
      expect(parseVersion(v), JSON.stringify(v)).toBeNull();
    }
  });

  it('文字列でない値は null', () => {
    for (const v of [null, undefined, 123, {}, [], true]) {
      expect(parseVersion(v), String(v)).toBeNull();
    }
  });
});

describe('compareVersions', () => {
  it('major / minor / patch の順に比べる', () => {
    expect(cmp('2.0.0', '1.9.9')).toBe(1);
    expect(cmp('1.9.9', '2.0.0')).toBe(-1);
    expect(cmp('1.2.0', '1.1.9')).toBe(1);
    expect(cmp('1.1.9', '1.2.0')).toBe(-1);
    expect(cmp('1.1.2', '1.1.1')).toBe(1);
    expect(cmp('1.1.1', '1.1.2')).toBe(-1);
  });

  it('同じ版は 0', () => {
    expect(cmp('1.2.3', '1.2.3')).toBe(0);
    expect(cmp('v1.2.3', '1.2.3')).toBe(0);
    expect(cmp('1.2.3-beta', '1.2.3-beta')).toBe(0);
  });

  // 0.2.0-beta.1 は 0.2.0 より古い。ここを逆にすると、正式版を出した後も
  // プレリリースの利用者に「最新です」と言ってしまう。
  it('プレリリースは同じ x.y.z の正式版より古い', () => {
    expect(cmp('1.2.3', '1.2.3-beta.1')).toBe(1);
    expect(cmp('1.2.3-beta.1', '1.2.3')).toBe(-1);
  });

  it('プレリリース同士は識別子の順で比べる', () => {
    expect(cmp('1.0.0-beta', '1.0.0-alpha')).toBe(1);
    expect(cmp('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
  });

  it('大小関係は反対称（a>b なら b<a）', () => {
    const pairs: readonly [string, string][] = [
      ['2.0.0', '1.0.0'],
      ['1.1.0', '1.0.0'],
      ['1.0.1', '1.0.0'],
      ['1.0.0', '1.0.0-rc'],
      ['1.0.0-b', '1.0.0-a'],
    ];
    for (const [hi, lo] of pairs) {
      expect(cmp(hi, lo), `${hi} > ${lo}`).toBe(1);
      expect(cmp(lo, hi), `${lo} < ${hi}`).toBe(-1);
    }
  });

  // major が違えば minor / patch は見ない（優先順位が入れ替わると誤判定する）。
  it('上位の桁が違えば下位は見ない', () => {
    expect(cmp('2.0.0', '1.99.99')).toBe(1);
    expect(cmp('1.2.0', '1.1.99')).toBe(1);
  });
});

describe('isGithubReleaseUrl', () => {
  it('https の github.com は通す', () => {
    expect(isGithubReleaseUrl('https://github.com/hiroto1977/-/releases/tag/v0.1.0')).toBe(true);
    expect(isGithubReleaseUrl('https://www.github.com/a/b')).toBe(true);
    expect(isGithubReleaseUrl('https://GITHUB.COM/a/b')).toBe(true);
  });

  // `new URL(x)` は引数を文字列化するので、toString を持つ値を渡すと
  // 検査を通り抜けられる。unknown を安全に受けるのがこの関数の役目。
  it('文字列でない値は断る（toString で化けた値も含む）', () => {
    for (const v of [null, undefined, 123, {}, [], true]) {
      expect(isGithubReleaseUrl(v), String(v)).toBe(false);
    }
    const disguised = { toString: () => 'https://github.com/a/b' };
    expect(String(disguised)).toBe('https://github.com/a/b');
    expect(isGithubReleaseUrl(disguised)).toBe(false);
  });

  // 応答を差し替えられたときに任意の URL を「更新はこちら」として
  // 見せられないようにする。
  it('別ホスト・平文・非 URL は断る', () => {
    for (const u of [
      'http://github.com/a/b',
      'https://github.com.evil.example/a',
      'https://evil.example/github.com',
      'https://notgithub.com/a',
      'ftp://github.com/a',
      'javascript:alert(1)',
      'not a url',
      '',
    ]) {
      expect(isGithubReleaseUrl(u), u).toBe(false);
    }
  });

  /*
   * **同型異字 (homograph) と userinfo。**
   *
   * 判定が `new URL()` で解析した `hostname` を見ていることが、ここで効く。
   * 生の文字列に `github.com` が含まれるかで見ていたら、下の 4 つは全部通る。
   */
  it('見た目が github.com でも、別ホストなら断る', () => {
    for (const u of [
      // キリル文字の小文字 i (U+0456)。punycode で xn--gthub-n2e.com になる。
      // **文字そのものは書かない** — lint:charset が混入として拾うため (実際に拾われた)。
      'https://g\u0456thub.com/a',
      // ギリシャ文字の ο (U+03BF)。github.xn--cm-jbc になる。
      'https://github.c\u03BFm/a',
      // 上を punycode で直接書いた形。
      'https://xn--gthub-n2e.com/a',
      // userinfo で本物に見せる古典。hostname は evil.example。
      'https://github.com@evil.example/a',
      // 部分ドメイン。リリースページは github.com 直下にしか無い。
      'https://sub.github.com/a',
    ]) {
      expect(isGithubReleaseUrl(u), u).toBe(false);
    }
  });

  /*
   * **ホストが本物でも、認証情報が付いていたら断る。**
   *
   * 上の `github.com@evil.example` は **hostname が evil.example なので
   * ホスト固定で既に落ちていた**。ここで見るのは逆の形 ——
   * `https://user:pw@github.com/` は hostname が**本物の github.com** で、
   * 2026-08-25 まで**通っていた**。
   *
   * 案内先として画面に出す値なので、頭から読んだ印象と実際の送り先を
   * 割らせない (同じ判断を `externalUrlGate.ts` も下している)。
   */
  it('★ ホストが本物でも認証情報つきは断る', () => {
    for (const u of [
      'https://user:pw@github.com/hiroto1977/-/releases',
      'https://github.com:secret@github.com/a',
      'https://user@github.com/a',
      'https://:pw@www.github.com/a',
    ]) {
      expect(isGithubReleaseUrl(u), u).toBe(false);
    }
    // 巻き添えの対照 —— パスの `@` は落とさない。
    expect(isGithubReleaseUrl('https://github.com/@hiroto1977')).toBe(true);
  });

  /*
   * **これは通してよい。** 全角の ｇ (U+FF47) は URL の解析時に NFKC で
   * ASCII の g へ畳まれるので、`hostname` は**本物の github.com** になる。
   * 実際に開かれるのも本物なので、断る理由が無い。
   *
   * この 1 件を固定しておくのは、判定を「生の文字列に github.com が
   * 含まれるか」へ書き換える改変を止めるため —— そうすると**この行は
   * 落ちないまま**、上の userinfo の行が通るようになる。
   * **通す側の標本が、弾く側の設計を守っている。**
   */
  it('正規化すると本物になる綴りは通す (判定が解析後のホストを見ている証拠)', () => {
    expect(new URL('https://\uFF47ithub.com/a').hostname).toBe('github.com');
    expect(isGithubReleaseUrl('https://\uFF47ithub.com/a')).toBe(true);
  });
});

describe('parseLatestRelease', () => {
  const good = { tag_name: 'v0.2.0', html_url: 'https://github.com/hiroto1977/-/releases/tag/v0.2.0' };

  it('tag_name と html_url を取り出す', () => {
    expect(parseLatestRelease(good)).toEqual({
      version: 'v0.2.0',
      url: 'https://github.com/hiroto1977/-/releases/tag/v0.2.0',
    });
  });

  it('余分な項目は無視する', () => {
    expect(parseLatestRelease({ ...good, body: 'x', assets: [1, 2] })?.version).toBe('v0.2.0');
  });

  it('形が違えば null', () => {
    for (const v of [null, undefined, 'string', 123, [], {}, { tag_name: 'v1.0.0' }, { html_url: good.html_url }]) {
      expect(parseLatestRelease(v), JSON.stringify(v)).toBeNull();
    }
  });

  it('版として読めないタグは null', () => {
    expect(parseLatestRelease({ ...good, tag_name: 'nightly' })).toBeNull();
  });

  it('GitHub 以外の URL は null', () => {
    expect(parseLatestRelease({ ...good, html_url: 'https://evil.example/x' })).toBeNull();
  });

  it('文字列でない tag_name / html_url は null', () => {
    expect(parseLatestRelease({ tag_name: 1, html_url: good.html_url })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v1.0.0', html_url: 2 })).toBeNull();
    expect(
      parseLatestRelease({ tag_name: 'v1.0.0', html_url: { toString: () => good.html_url } }),
    ).toBeNull();
  });
});

describe('evaluateUpdate', () => {
  const rel = (version: string) => ({
    version,
    url: 'https://github.com/hiroto1977/-/releases/latest',
  });

  it('公開版が新しければ update-available', () => {
    const v = evaluateUpdate('0.1.0', rel('v0.2.0'));
    expect(v.status).toBe('update-available');
    expect(v.latest).toBe('v0.2.0');
    expect(v.url).toBe('https://github.com/hiroto1977/-/releases/latest');
  });

  it('同じなら up-to-date', () => {
    expect(evaluateUpdate('0.1.0', rel('v0.1.0')).status).toBe('up-to-date');
  });

  it('手元が新しければ ahead（開発中のビルド）', () => {
    expect(evaluateUpdate('0.3.0', rel('v0.2.0')).status).toBe('ahead');
  });

  it('取得できなければ unknown', () => {
    const v = evaluateUpdate('0.1.0', null);
    expect(v.status).toBe('unknown');
    expect(v.latest).toBeNull();
    expect(v.url).toBeNull();
  });

  it('手元の版が読めなければ unknown（公開版の情報は残す）', () => {
    const v = evaluateUpdate('dev', rel('v0.2.0'));
    expect(v.status).toBe('unknown');
    expect(v.latest).toBe('v0.2.0');
    expect(v.url).toBe('https://github.com/hiroto1977/-/releases/latest');
  });

  it('公開版の表記が読めなければ unknown', () => {
    const v = evaluateUpdate('0.1.0', rel('nightly'));
    expect(v.status).toBe('unknown');
    expect(v.latest).toBe('nightly');
  });

  it('current はそのまま返す', () => {
    expect(evaluateUpdate('0.1.0-beta.2', rel('v0.1.0')).current).toBe('0.1.0-beta.2');
  });

  // プレリリースを使っている人に、正式版が出たことを伝える経路。
  it('プレリリースから正式版へは update-available', () => {
    expect(evaluateUpdate('0.2.0-beta.1', rel('v0.2.0')).status).toBe('update-available');
  });
});

describe('describeUpdate', () => {
  const ALL: readonly UpdateStatus[] = ['update-available', 'up-to-date', 'ahead', 'unknown'];

  it('全ての状態に文言がある', () => {
    for (const status of ALL) {
      const s = describeUpdate({ status, current: '0.1.0', latest: '0.2.0', url: null });
      expect(s.length, status).toBeGreaterThan(0);
    }
  });

  it('文言は状態ごとに違う', () => {
    const all = ALL.map((status) =>
      describeUpdate({ status, current: '0.1.0', latest: '0.2.0', url: null }),
    );
    expect(new Set(all).size).toBe(ALL.length);
  });

  it('必要な数字を含む', () => {
    expect(
      describeUpdate({ status: 'update-available', current: '0.1.0', latest: '0.2.0', url: null }),
    ).toContain('0.2.0');
    expect(
      describeUpdate({ status: 'up-to-date', current: '0.1.0', latest: '0.1.0', url: null }),
    ).toContain('0.1.0');
    expect(
      describeUpdate({ status: 'ahead', current: '0.3.0', latest: '0.2.0', url: null }),
    ).toContain('0.3.0');
  });

  // 自動でダウンロードしない方針なので、案内は「リリースページから」になる。
  it('更新がある文言は、自分で取得する旨を伝える', () => {
    const s = describeUpdate({ status: 'update-available', current: '0.1.0', latest: '0.2.0', url: null });
    expect(s).toContain('リリースページ');
  });

  it('判定不能の文言は再試行を促す', () => {
    expect(describeUpdate({ status: 'unknown', current: '0.1.0', latest: null, url: null })).toContain(
      '時間をおいて',
    );
  });
});

/**
 * **「更新あり」なのに版が分からない、は成り立たない状態である。**
 *
 * 2026-09-08 まで `UpdateVerdict` は平らな interface で `latest: string | null` を
 * **全 status に**持っていた。`describeUpdate` は
 * `` `新しい版 ${verdict.latest} があります` `` と**裸で補間する**ので、
 * その状態を 1 つ作れば利用者は**「新しい版 null があります」**を読む
 * (裸の `${}` は `tsc` を素通りする —— パス 76・78 で 2 度踏んだ)。
 * `evaluateUpdate` はそういう値を作らないが、**守っていたのは型ではなく実装**だった。
 *
 * 判別可能合併にしたので、ここは**型の側で**留める ——
 * `@ts-expect-error` は「その行が型エラーであること」を要求するので、
 * 合併が緩んだ瞬間に**この検査自身が `npm run typecheck` で落ちる** (自ら鳴る対照)。
 */
describe('UpdateVerdict — 版が分かる 3 状態で latest を null にできない (型)', () => {
  it('★ 版の比較ができた 3 状態は latest が必須 (null を代入できない)', () => {
    const ok: UpdateVerdict[] = [
      { status: 'update-available', current: '0.1.0', latest: '0.2.0', url: null },
      { status: 'up-to-date', current: '0.1.0', latest: '0.1.0', url: null },
      { status: 'ahead', current: '0.3.0', latest: '0.2.0', url: null },
    ];
    expect(ok).toHaveLength(3);

    // @ts-expect-error latest: null は 'update-available' では作れない (これが本命)
    const bad1: UpdateVerdict = { status: 'update-available', current: '0.1.0', latest: null, url: null };
    // @ts-expect-error 同じ規準を 'ahead' にも当てる
    const bad2: UpdateVerdict = { status: 'ahead', current: '0.3.0', latest: null, url: null };
    // @ts-expect-error 同じ規準を 'up-to-date' にも当てる
    const bad3: UpdateVerdict = { status: 'up-to-date', current: '0.1.0', latest: null, url: null };
    // 実行時には作れてしまう形なので、値としては触らず「型が拒む」ことだけを主張する。
    expect([bad1, bad2, bad3]).toHaveLength(3);
  });

  it('★ 対照: 判定不能 (unknown) のときだけ latest は null を取れる', () => {
    // ここが型エラーになるなら合併が締まりすぎている (`evaluateUpdate` が実際に返す形)。
    const unknownWithNull: UpdateVerdict = { status: 'unknown', current: '0.1.0', latest: null, url: null };
    const unknownWithVersion: UpdateVerdict = { status: 'unknown', current: 'x', latest: '0.2.0', url: null };
    expect(unknownWithNull.latest).toBeNull();
    expect(unknownWithVersion.latest).toBe('0.2.0');
  });

  it('★ どの status でも文面に文字列 "null" / "undefined" が出ない', () => {
    const verdicts: UpdateVerdict[] = [
      { status: 'update-available', current: '0.1.0', latest: '0.2.0', url: null },
      { status: 'up-to-date', current: '0.1.0', latest: '0.1.0', url: null },
      { status: 'ahead', current: '0.3.0', latest: '0.2.0', url: null },
      { status: 'unknown', current: '0.1.0', latest: null, url: null },
      { status: 'unknown', current: '0.1.0', latest: '0.2.0', url: null },
    ];
    for (const v of verdicts) {
      const s = describeUpdate(v);
      expect(s, v.status).not.toContain('null');
      expect(s, v.status).not.toContain('undefined');
      expect(s.length, v.status).toBeGreaterThan(0); // 標本 — 文面が実際に在る
    }
  });

  it('★ evaluateUpdate は「版が分かる 3 状態」で必ず latest を埋める (実装と型の一致)', () => {
    const v = evaluateUpdate('0.1.0', { version: '0.2.0', url: 'https://github.com/o/r/releases/tag/v0.2.0' });
    expect(v.status).toBe('update-available');
    expect(v.latest).toBe('0.2.0');
    // 読めない版は unknown に落ち、そこでだけ latest が null になりうる。
    expect(evaluateUpdate('not-a-version', null).status).toBe('unknown');
    expect(evaluateUpdate('not-a-version', null).latest).toBeNull();
  });
});
