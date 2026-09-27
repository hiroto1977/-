import { describe, expect, it } from 'vitest';
import { MAX_TOKEN_INPUT_CHARS, NON_LATIN1_MESSAGE, checkTokenInput } from '../tokenInput';
import { isHeaderValue } from '../headerValue';

/**
 * `secrets:set` は上限超えなどを `return;` で黙って捨てていて、renderer からは
 * 保存できた場合と区別が付かなかった (2026-08 監査)。規則と**理由**をここに置く。
 */
describe('checkTokenInput — 受理', () => {
  it('前後の空白を落として返す', () => {
    expect(checkTokenInput('  ghp_abc  ')).toEqual({ ok: true, value: 'ghp_abc' });
  });

  it('上限ちょうどは受理する (境界)', () => {
    const value = 'a'.repeat(MAX_TOKEN_INPUT_CHARS);
    expect(checkTokenInput(value)).toEqual({ ok: true, value });
  });

  it('空白を落とした結果が上限内なら受理する', () => {
    const value = 'a'.repeat(MAX_TOKEN_INPUT_CHARS);
    expect(checkTokenInput(`  ${value}  `)).toEqual({ ok: true, value });
  });
});

describe('checkTokenInput — 拒否', () => {
  it('空文字は empty', () => {
    const r = checkTokenInput('');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toBe('empty');
    expect(r.message).toContain('入力してください');
  });

  it('空白のみは empty (trim 後に判定する)', () => {
    expect(checkTokenInput('   \t\n  ')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('上限 +1 は too-long で、実長と上限を message に出す', () => {
    const r = checkTokenInput('a'.repeat(MAX_TOKEN_INPUT_CHARS + 1));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toBe('too-long');
    expect(r.message).toContain(String(MAX_TOKEN_INPUT_CHARS + 1));
    expect(r.message).toContain(String(MAX_TOKEN_INPUT_CHARS));
  });

  /*
   * **刷る数も「字」である** (2026-09-13 · パス 196)。文面は
   * 「N 文字 / 上限 M 文字」と言うのに、N は `value.length` (コード単位) だった ——
   * 絵文字の資格情報では**実際の倍の数**を刷り、しかもその値は天井を超えていない。
   *
   * **2026-09-16 (パス 296) で、この検査は実験台を変えた。** 絵文字は
   * 「要求ヘッダに載らない文字」として入口で断られるようになったので、
   * もう天井の実験台には使えない。代わりに下の `★ 字とコード単位の差は…` が
   * 「なぜ絵文字で測れなくなったか」を機械で主張している ——
   * **実験台を静かに ASCII へ差し替えると、区別を観測しない空の検査になる。**
   */
  it('天井は字で数え、文面も字を刷る (Latin1 の実験台)', () => {
    const atLimit = 'a'.repeat(MAX_TOKEN_INPUT_CHARS);
    expect(checkTokenInput(atLimit)).toMatchObject({ ok: true });
    const over = checkTokenInput(atLimit + 'a');
    expect(over.ok).toBe(false);
    if (over.ok) throw new Error('unreachable');
    expect(over.reason).toBe('too-long');
    expect(over.message).toContain(`${MAX_TOKEN_INPUT_CHARS + 1} 文字`);
  });

  /*
   * **字とコード単位の差は、ヘッダに載る値では起こり得ない** (パス 296)。
   *
   * 差が出るのはサロゲート対、つまり符号位置 ≥ 0x10000 の文字だけで、それは
   * 定義上 Latin1 の外である。`isHeaderValue` が非 Latin1 を断つので、資格情報に
   * ついては `countChars(s) === s.length` が常に成り立つ。
   *
   * だから `tokenInput` の `countChars` は**もう効いていない** (綴りを 1 つに
   * 揃えるために残してある)。これを散文だけで言うと次の人が信じるしかないので、
   * Latin1 の全 256 文字を総当たりして主張する。
   */
  it('★ 字とコード単位の差は、ヘッダに載る値では観測できない (Latin1 全 256 文字)', () => {
    const differing: number[] = [];
    for (let c = 0; c <= 0xff; c += 1) {
      const s = String.fromCharCode(c);
      if (!isHeaderValue(s)) continue;
      if ([...s].length !== s.length) differing.push(c);
    }
    expect(differing).toEqual([]);
    // 対照: 非 Latin1 なら差が出る (走査が死んで「差は無い」にならないため)。
    const emoji = String.fromCodePoint(0x1f600);
    expect([...emoji].length).toBe(1);
    expect(emoji.length).toBe(2);
    expect(isHeaderValue(emoji)).toBe(false);
  });

  it('文字列でない入力は empty (undefined / null / 数値 / オブジェクト)', () => {
    for (const value of [undefined, null, 0, 42, {}, [], true]) {
      expect(checkTokenInput(value), JSON.stringify(value) ?? 'undefined').toMatchObject({
        ok: false,
        reason: 'empty',
      });
    }
  });
});

describe('MAX_TOKEN_INPUT_CHARS', () => {
  it('64KiB — main と renderer で同じ値を使う唯一の定義', () => {
    expect(MAX_TOKEN_INPUT_CHARS).toBe(65536);
  });
});

/*
 * 改行・制御文字 (2026-08-22 に追加)。
 *
 * 注入はできない —— 実測で `new Headers()` が CR/LF/NUL を含む値を
 * 「is an invalid header value」で throw する。直す理由は**失敗する場所**で、
 * 折り返した PAT を貼ると「保存は成功 → 次の取得で不可解な TypeError」に
 * なっていた。保存時に理由つきで断る。
 */
describe('checkTokenInput — 改行・制御文字', () => {
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const NUL = String.fromCharCode(0);

  it.each([
    ['CRLF が途中にある', 'ghp_aaa' + CR + LF + 'bbb'],
    ['LF だけ', 'ghp_aaa' + LF + 'bbb'],
    ['CR だけ', 'ghp_aaa' + CR + 'bbb'],
    ['NUL', 'ghp_aaa' + NUL + 'bbb'],
    ['タブ', 'ghp_aaa\tbbb'],
    ['DEL (0x7f)', 'ghp_aaa' + String.fromCharCode(127) + 'bbb'],
  ])('%s は断る', (_label, raw) => {
    const r = checkTokenInput(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('control-char');
      expect(r.message).toContain('制御文字');
    }
  });

  it('前後の改行は trim で落ちるので受理する (折り返しではなく余白)', () => {
    const r = checkTokenInput(LF + '  ghp_valid  ' + CR + LF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('ghp_valid');
  });

  it('通常のトークンは今までどおり通る', () => {
    const r = checkTokenInput('ghp_' + 'a'.repeat(36));
    expect(r.ok).toBe(true);
  });
});

/*
 * **要求ヘッダに載らない文字** (2026-09-16 · パス 296)。
 *
 * 上の制御文字の判定は「`new Headers()` が CR/LF/NUL を throw する」という
 * 2026-08 時点の理解で書かれていた。パス 295 が応答側で測ったのはより広い規則
 * (ByteString = Latin1) で、その学びはここへ持ち帰られていなかった。実測すると
 * 下の 4 形はすべて**入口を通り**、保存され、以後
 * `Authorization: Bearer …` の組み立てで必ず throw していた ——
 * このモジュールが名指しで直したと書いている
 * 「保存は成功 → 次の取得で不可解な TypeError」そのものの形である。
 */
describe('checkTokenInput — 非 Latin1 (要求ヘッダに載らない)', () => {
  it.each([
    ['日本語 (あ)', 'ghp_' + String.fromCharCode(0x3042) + '_aaa'],
    ['全角英数 (ａ)', 'ghp_' + String.fromCharCode(0xff41) + '_aaa'],
    ['キリル文字 (U+0414)', 'ghp_' + String.fromCharCode(0x0414) + '_aaa'],
    ['絵文字', 'ghp_' + String.fromCodePoint(0x1f600) + '_aaa'],
  ])('%s は断る', (_label, raw) => {
    const r = checkTokenInput(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('non-latin1');
      expect(r.message).toBe(NON_LATIN1_MESSAGE);
    }
  });

  it('★ 断った値は実際に Headers が拒む / 通した値は実際に載る (関門と一致)', () => {
    const rejected = 'ghp_' + String.fromCharCode(0x3042) + '_aaa';
    expect(() => new Headers({ Authorization: `Bearer ${rejected}` })).toThrow();
    const accepted = 'ghp_' + String.fromCharCode(0xff) + '_aaa';
    expect(checkTokenInput(accepted)).toMatchObject({ ok: true });
    expect(new Headers({ Authorization: `Bearer ${accepted}` }).get('authorization')).toBe(
      `Bearer ${accepted}`,
    );
  });

  it('Latin1 の上端 0xff は通す (境界)', () => {
    expect(checkTokenInput('ghp_' + String.fromCharCode(0xff))).toMatchObject({ ok: true });
    expect(checkTokenInput('ghp_' + String.fromCharCode(0x100))).toMatchObject({
      ok: false,
      reason: 'non-latin1',
    });
  });
});
