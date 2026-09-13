/**
 * **貼る物の判定と文面** (2026-09-12 · パス 157)。
 *
 * 設定画面の Google OAuth は「表示される code を貼れ」と言い、受け取る側は
 * `code` と `state` の両方を要求していた。しかも既定のリダイレクト URI
 * (`urn:ietf:wg:oauth:2.0:oob`) では state が持ち帰れないので、**既定値に
 * 従うかぎり完了できなかった**。ここはその判定と文面を留める。
 */
import { describe, expect, it } from 'vitest';
import {
  CALLBACK_PASTE_HINT,
  CALLBACK_PASTE_PLACEHOLDER,
  LOOPBACK_REDIRECT_URI,
  OOB_REDIRECT_URI,
  describeCallbackPasteFailure,
  redirectBlockedReason,
  redirectKind,
} from '../callbackPaste';
import { parseGoogleCallback } from '../pkce';

describe('redirectKind', () => {
  it('http(s) は callback (アドレスバーに state が出る)', () => {
    expect(redirectKind('http://localhost')).toBe('callback');
    expect(redirectKind('http://127.0.0.1:8765/cb')).toBe('callback');
    expect(redirectKind('https://example.com/cb')).toBe('callback');
    expect(redirectKind(`  ${LOOPBACK_REDIRECT_URI}  `)).toBe('callback');
  });

  it('★ 以前の既定値 (OOB) は no-callback —— これが欠陥の中心だった', () => {
    expect(redirectKind(OOB_REDIRECT_URI)).toBe('no-callback');
  });

  it('独自スキームも同じ結果 (「OOB かどうか」ではなく「URL が戻るか」で分ける)', () => {
    expect(redirectKind('myapp://cb')).toBe('no-callback');
    // URL として解析できない物も同じ側 (完了できないことは変わらない)。
    expect(redirectKind('localhost:8080')).toBe('no-callback');
    expect(redirectKind('とりあえず')).toBe('no-callback');
  });

  it('空欄は empty', () => {
    expect(redirectKind('')).toBe('empty');
    expect(redirectKind('   ')).toBe('empty');
  });
});

describe('redirectBlockedReason', () => {
  it('http(s) は進める (null)', () => {
    expect(redirectBlockedReason(LOOPBACK_REDIRECT_URI)).toBeNull();
    expect(redirectBlockedReason('https://example.com/cb')).toBeNull();
  });

  it('★ OOB は理由つきで止める。理由は state を名指しし、代わりの形を示す', () => {
    const r = redirectBlockedReason(OOB_REDIRECT_URI);
    expect(r).not.toBeNull();
    expect(r).toContain('完了できません');
    expect(r).toContain('state');
    // **打ち手を書く。** 「駄目です」だけでは利用者は次に何をすればよいか分からない。
    expect(r).toContain(LOOPBACK_REDIRECT_URI);
  });

  it('空欄は「入力してください」で、例を添える', () => {
    const r = redirectBlockedReason('');
    expect(r).toContain('入力してください');
    expect(r).toContain(LOOPBACK_REDIRECT_URI);
  });

  it('文はすべて終止形で終わる (帯に並べて読める)', () => {
    for (const uri of ['', OOB_REDIRECT_URI, 'myapp://cb']) {
      const r = redirectBlockedReason(uri);
      expect(r).not.toBeNull();
      expect(r!.endsWith('。')).toBe(true);
    }
  });
});

describe('貼る欄の文面', () => {
  /**
   * **求める物そのものを見せる。** 以前の placeholder は
   * `4/0Ab... (Google から受け取った code)` で、貼ると必ず失敗する物を例示していた。
   */
  it('★ placeholder は URL の形で、code と state の両方を含む', () => {
    expect(CALLBACK_PASTE_PLACEHOLDER).toContain('code=');
    expect(CALLBACK_PASTE_PLACEHOLDER).toContain('state=');
    expect(CALLBACK_PASTE_PLACEHOLDER).toContain('http://localhost');
  });

  it('★ 説明は「接続できません」が出ることまで言う (利用者が失敗と読まないため)', () => {
    expect(CALLBACK_PASTE_HINT).toContain('接続できません');
    expect(CALLBACK_PASTE_HINT).toContain('アドレスバー');
    expect(CALLBACK_PASTE_HINT).toContain('code だけでは完了できません');
  });
});

describe('describeCallbackPasteFailure', () => {
  /** 読める入力に対しては何も言わない —— 呼び間違えても嘘を言わせない。 */
  it('★ 読めた入力には null (診断が「失敗」を捏造しない)', () => {
    const ok = 'http://localhost/?code=4%2F0Ab&state=xyz';
    expect(parseGoogleCallback(ok)).toEqual({ code: '4/0Ab', state: 'xyz' });
    expect(describeCallbackPasteFailure(ok)).toBeNull();
  });

  it('★ 生の認可コードだけ: 「それでは完了できない」と名指しする', () => {
    const bare = '4/0AbCdEfGhIjKlMnOpQrStUvWxYz';
    // まず実物が断ることを確かめる (標本が規則に当たっている)。
    expect(parseGoogleCallback(bare)).toBeNull();
    const m = describeCallbackPasteFailure(bare);
    expect(m).toContain('認可コードだけ');
    expect(m).toContain('URL 全体');
  });

  it('★ code はあるが state が無い: 欠けている側を言い、CSRF の理由も言う', () => {
    const m = describeCallbackPasteFailure('http://localhost/?code=4%2F0Ab');
    expect(m).toContain('state がありません');
    expect(m).toContain('CSRF');
    expect(m).toContain('&state=');
  });

  it('state はあるが code が無い', () => {
    const m = describeCallbackPasteFailure('?state=xyz');
    expect(m).toContain('code がありません');
  });

  it('★ Google が error= を返した形は、やり直しへ案内する (URL の書き方の話ではない)', () => {
    const m = describeCallbackPasteFailure('http://localhost/?error=access_denied&state=xyz');
    expect(m).toContain('error=access_denied');
    expect(m).toContain('やり直して');
    // 「URL 全体を貼れ」ではない —— 貼り方を直しても解決しない。
    expect(m).not.toContain('URL 全体');
  });

  it('URL として読めない形 (壊れた http URL) は、その旨を言う', () => {
    // `http://` で始まるので `new URL` を通るが、ホストが無く投げる。
    const m = describeCallbackPasteFailure('http://');
    expect(m).toContain('URL として読めませんでした');
  });

  it('空欄も読めない側に入る', () => {
    expect(describeCallbackPasteFailure('')).toContain('見つかりませんでした');
  });

  it('文はすべて終止形で終わる', () => {
    for (const input of ['', '4/0Ab', 'http://localhost/?code=a', '?state=x', 'http://']) {
      const m = describeCallbackPasteFailure(input);
      expect(m, input).not.toBeNull();
      expect(m!.endsWith('。'), input).toBe(true);
    }
  });

  /**
   * **診断と解析は同じ読み方を通る。** 別々に書くと「code だけが貼られています」
   * という説明が、実際に落とした理由と食い違う。母集団を総当たりして確かめる。
   */
  it('★ 対照: parseGoogleCallback が null を返す入力すべてに理由が付き、逆も成り立つ', () => {
    const samples = [
      'http://localhost/?code=a&state=b',
      'https://example.com/cb?code=a&state=b',
      'code=a&state=b',
      '?code=a&state=b',
      '4/0Ab',
      '',
      '   ',
      'http://localhost/?code=a',
      '?state=b',
      'http://',
      'http://localhost/?error=access_denied&state=b',
      'とりあえず',
    ];
    for (const s of samples) {
      const parsed = parseGoogleCallback(s);
      const why = describeCallbackPasteFailure(s);
      expect(parsed === null, s).toBe(why !== null);
    }
    // 走査が空振りしていない標本 (両側が現れている)。
    expect(samples.some((s) => parseGoogleCallback(s) !== null)).toBe(true);
    expect(samples.some((s) => parseGoogleCallback(s) === null)).toBe(true);
  });
});
