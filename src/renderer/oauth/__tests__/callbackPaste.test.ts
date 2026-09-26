/**
 * **貼る物の判定と文面** (2026-09-12 · パス 157)。
 *
 * 設定画面の Google OAuth は「表示される code を貼れ」と言い、受け取る側は
 * `code` と `state` の両方を要求していた。しかも既定のリダイレクト URI
 * (`urn:ietf:wg:oauth:2.0:oob`) では state が持ち帰れないので、**既定値に
 * 従うかぎり完了できなかった**。ここはその判定と文面を留める。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CALLBACK_PASTE_HINT,
  CALLBACK_PASTE_PLACEHOLDER,
  LOOPBACK_REDIRECT_URI,
  OOB_REDIRECT_URI,
  describeCallbackPasteFailure,
  redirectBlockedReason,
  redirectKind,
  OAUTH_FIELD_CHARS,
  OAUTH_FIELD_LABEL,
  oauthFieldTooLong,
} from '../callbackPaste';
import { MAX_AUTH_CODE_CHARS, parseGoogleCallback } from '../pkce';

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

describe('oauthFieldTooLong — 天井を持つのは画面の maxLength だけだった (パス 197)', () => {
  /*
   * 2026-09-13 まで、この 3 欄の天井は入力欄の `maxLength` 属性だけが持っていた
   * (定数の doc 自身が「検証側に写しは無い (画面だけが持つ)」と書いていた)。
   * 実機 chromium で測ると `maxLength` は関門ではない —— プログラムで入れた
   * 超過値は素通りし `validity.tooLong` も false。**つまり天井は実質存在しなかった。**
   */
  it('★ 天井ちょうどは通り、1 字超えたら断る (3 欄すべて)', () => {
    for (const field of ['clientId', 'redirectUri', 'callbackPaste'] as const) {
      const max = OAUTH_FIELD_CHARS[field];
      expect(oauthFieldTooLong(field, 'a'.repeat(max))).toBe(false);
      expect(oauthFieldTooLong(field, 'a'.repeat(max + 1))).toBe(true);
    }
  });

  it('★ 数えるのは「字」 (絵文字は天井いっぱいまで入る)', () => {
    const max = OAUTH_FIELD_CHARS.clientId;
    const atLimit = '\u{1F600}'.repeat(max);
    expect(atLimit.length).toBe(max * 2);            // コード単位では 2 倍
    expect(oauthFieldTooLong('clientId', atLimit)).toBe(false);
    expect(oauthFieldTooLong('clientId', atLimit + '\u{1F600}')).toBe(true);
  });

  it('★ 貼る欄の天井は認可コードの天井より広い (量が違うから名前も別)', () => {
    // `pkce.ts` の MAX_AUTH_CODE_CHARS は code 1 本、こちらは URL 全体。
    expect(OAUTH_FIELD_CHARS.callbackPaste).toBeGreaterThan(MAX_AUTH_CODE_CHARS);
  });

  it('★ 3 欄すべてに画面向けの呼び方が在る (断りが欄名を写さない)', () => {
    for (const field of ['clientId', 'redirectUri', 'callbackPaste'] as const) {
      expect(OAUTH_FIELD_LABEL[field].length).toBeGreaterThan(0);
    }
  });
});

/**
 * **モジュール直下の定数を、読み直してから見る** (2026-09-20 · パス 355)。
 *
 * この検査は最初から定数を import して使っていたが、**変異検査からは
 * 見えていなかった**。`stryker.config.json` の `_commentIgnoreStatic` が
 * 書いているとおり、モジュール直下の値は**変異体の有効化より前に**評価される
 * ため、覆われていても「生存」として報告される。実測 (2026-09-20・
 * `--mutate src/renderer/oauth/callbackPaste.ts`): **81.82% / 生存 16**、
 * その 16 件のうち **13 件がこの定数群**だった (残り 3 件は下の `join('')`)。
 *
 * 解析そのものは 72 件すべて Killed で、**穴は「値」と「文面」の側にだけ在った**。
 * `vi.resetModules()` + 動的 `await import()` で読み直せば、値を書き換える
 * 変異体が比較で落ちる (`oauth.test.ts` の `freshConfigs`・パス 353 の
 * `backupCoverage.test.ts` と同じ形)。
 *
 * ## なぜこの値を留めるのか
 *
 * `LOOPBACK_REDIRECT_URI` は**利用者が Google Cloud Console に登録する綴り**
 * そのもので、画面の placeholder・断りの文面・例示がすべてこの 1 つを読む。
 * 書き換わると、登録した綴りと画面が言う綴りが食い違い、**利用者は
 * 「登録したはずなのに弾かれる」側に立たされる**。
 */
describe('モジュール直下の定数 (読み直して見る・パス 355)', () => {
  async function fresh() {
    vi.resetModules();
    return (await import('../callbackPaste')) as typeof import('../callbackPaste');
  }

  it('★ リダイレクト URI の 2 値は綴りごと固定する', async () => {
    const m = await fresh();
    expect(m.LOOPBACK_REDIRECT_URI).toBe('http://localhost');
    // RFC 6749 時代の OOB。**名前で分かるように残している**値なので、綴りが本体。
    expect(m.OOB_REDIRECT_URI).toBe('urn:ietf:wg:oauth:2.0:oob');
    // 2 つは同じ判定の別の答えになる (片方が他方に化けない)。
    expect(m.redirectKind(m.LOOPBACK_REDIRECT_URI)).toBe('callback');
    expect(m.redirectKind(m.OOB_REDIRECT_URI)).toBe('no-callback');
  });

  it('★ 欄の呼び方 3 つを固定する (断りの文面が使う・画面が言い換えない)', async () => {
    const m = await fresh();
    expect(m.OAUTH_FIELD_LABEL).toEqual({
      clientId: 'Client ID',
      redirectUri: 'リダイレクト URI',
      callbackPaste: '貼り付けた URL',
    });
  });

  it('★ placeholder は空でなく、URL の形と 2 つの引数を見せる', async () => {
    const m = await fresh();
    expect(m.CALLBACK_PASTE_PLACEHOLDER.length).toBeGreaterThan(20);
    expect(m.CALLBACK_PASTE_PLACEHOLDER).toContain('http://localhost/?code=');
    expect(m.CALLBACK_PASTE_PLACEHOLDER).toContain('&state=');
    expect(m.CALLBACK_PASTE_PLACEHOLDER).toContain('URL 全体');
  });

  it('★ 説明は 4 つのことを言い、1 行に繋がっている', async () => {
    const m = await fresh();
    const hint = m.CALLBACK_PASTE_HINT;
    expect(hint.length).toBeGreaterThan(80);
    // 改行で区切らない (欄の上の 1 行として出る)。
    expect(hint).not.toContain('\n');
    for (const part of ['リダイレクト先へ飛びます', '接続できません', 'アドレスバー', 'code だけでは完了できません']) {
      expect(hint, part).toContain(part);
    }
    // **繋ぎ目に何も挟まっていない** (`join('')` が別の区切りに化けたら落ちる)。
    expect(hint).toContain('飛びます。受け取るものは無いので');
    expect(hint).toContain('出ています。その URL を丸ごとコピーして');
  });
});

/**
 * **繋ぎ目に何も挟まらない** (2026-09-20 · パス 355)。
 *
 * 文面はどれも `[...].join('')` で組む。`''` が別の文字列に化けても
 * 断片ごとの `toContain` は通るので、**繋ぎ目を跨ぐ文字列**で留める。
 * 実測 (2026-09-20) では、この 3 か所が生存していた。
 */
describe('文面の繋ぎ目 (パス 355)', () => {
  it('★ OOB の断りは 3 文が続けて読める', () => {
    const r = redirectBlockedReason(OOB_REDIRECT_URI);
    expect(r).toContain('完了できません。token の交換には');
    expect(r).toContain('しか載りません。http://localhost のような');
  });

  it('★ state 欠けの診断は 3 文が続けて読める', () => {
    const m = describeCallbackPasteFailure('http://localhost/?code=4%2F0Ab');
    expect(m).toContain('state がありません。state は CSRF');
    expect(m).toContain('交換できません。アドレスバーの URL 全体');
  });

  it('★ code も state も無い診断は 3 文が続けて読める', () => {
    const m = describeCallbackPasteFailure('4/0AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(m).toContain('見つかりませんでした。認可コードだけ');
    expect(m).toContain('完了できません —— ブラウザのアドレスバーに');
  });
});
