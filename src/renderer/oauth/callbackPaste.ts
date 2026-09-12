/**
 * **画面が「貼れ」と言う物と、コードが受け取る物を一致させる** (2026-09-12 · パス 157)。
 *
 * ## 実測した欠陥
 *
 * 設定画面の `GoogleOAuthSection` (両ビルドに載る・行カバレッジ 0%。`start` も
 * `complete` も一度も走ったことがなかった) は、画面の文面と実装が食い違っていた:
 *
 * | どこ | 何と書いてあったか |
 * | --- | --- |
 * | 説明文 | 「認可後に**表示される code** をこの画面に貼り付けて完了」 |
 * | 入力欄の placeholder | `4/0Ab... (Google から受け取った code)` |
 * | リダイレクト URI の既定値 | `urn:ietf:wg:oauth:2.0:oob` |
 * | `oauth/pkce.ts` の冒頭 | 「認可ページの URL から **code を**コピー」 |
 *
 * ところが受け取る側 `parseGoogleCallback` は **`code` と `state` の両方**を要求し、
 * 片方でも欠ければ `null` を返す (CSRF 対策で `exchangeGoogleCode` が
 * `receivedState` を必須にしているため。これは正しい)。**つまり画面が指示する
 * とおりに「code」だけを貼ると、必ず失敗する。** 押した後に初めて
 * 「URL 全体 (code= と state= を含む) を貼り付けてください」という別の文面が出る。
 *
 * さらに既定のリダイレクト URI (`urn:ietf:wg:oauth:2.0:oob`) は**構造上 state を
 * 持ち帰れない** —— ブラウザがどこへも飛ばないので「URL 全体」というものが存在しない。
 * 既定値に従うかぎり、この画面は**どうやっても完了できなかった**。
 *
 * ## どちらを直すか
 *
 * 「`code` だけを受け付ける」方向には直さない —— `state` の照合は CSRF 防御で、
 * `exchangeGoogleCode` の署名がそれを強制するために今の形になっている
 * (Security Audit R2 #3)。**落とすべきは、できない指示の方である。**
 *
 * 直した形: リダイレクト先を `http://localhost` のような http(s) にしておくと、
 * Google は認可後にブラウザをそこへ飛ばす。受け手は居ないので「接続できません」に
 * なるが、**アドレスバーには `?code=…&state=…` の付いた URL が出ている**。
 * それを丸ごと貼る。`file://` で開いた standalone でも成立する (実際に
 * コールバックを受け取るのではなく、人が手で運ぶ)。
 *
 * ## この寄せ場が持つもの
 *
 * - 選んだリダイレクト URI が**そもそも完了可能か** (`redirectKind`)
 * - 進めない場合の理由 (`redirectBlockedReason`) —— **認可ページを開く前**に言う
 * - 貼る物の文面 1 組 (`CALLBACK_PASTE_PLACEHOLDER` / `CALLBACK_PASTE_HINT`)
 * - 読めなかったときに**何が欠けていたか** (`describeCallbackPasteFailure`)
 *
 * 解析は `pkce.ts` の `callbackParams` **1 つだけ**を通す。診断が別の読み方を
 * 持つと、「code だけが貼られています」という説明が実物とずれる。
 *
 * ## なぜこのファイルは integrity chain の保護対象に入れないか
 *
 * `pkce.ts` は保護対象 (このパスの変更で ブロック #172 を採掘した) だが、ここは
 * 入れていない —— **この寄せ場は security の判断を 1 つも持たない。** `state` の
 * 照合は `exchangeGoogleCode` が握っており、`redirectBlockedReason` を「常に null」に
 * 書き換えても**通るのは完了できないリダイレクト先だけ**で、`complete()` の
 * CSRF 照合は迂回できない。関門ではなく**文面と入口の案内**である。
 * (`main.ts` を保護対象に足した 2026-08-22 の理由 ——「関門を呼ぶ側が
 * 迂回口になっていた」—— はここには当たらない。)
 */
import { callbackParams } from './pkce';

/** 既定のリダイレクト URI。アドレスバーに `code` と `state` が出る形。 */
export const LOOPBACK_REDIRECT_URI = 'http://localhost';

/**
 * 以前の既定値。**完了できないので既定から外した**が、判定が名前で
 * 分かるように定数として残す (入力欄にこれを貼った人にも同じ理由を出す)。
 */
export const OOB_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

/**
 * リダイレクト URI の種類 —— **「state を持ち帰れるか」で分ける。**
 *
 * `no-callback` は「OOB かどうか」ではなく「ブラウザが URL を持って戻って
 * こないので、貼れる URL が存在しない」という結果を名前にしている
 * (`urn:…:oob` も、`myapp://cb` のような独自スキームも同じ結果になる)。
 */
export type RedirectKind = 'callback' | 'no-callback' | 'empty';

export function redirectKind(uri: string): RedirectKind {
  // `typeof uri === 'string'` の防御は置かない —— 呼び出し側は入力欄の state で
  // 必ず文字列であり、測れない枝を 1 つ増やすだけになる (パス 79 の規準)。
  const trimmed = uri.trim();
  if (trimmed.length === 0) return 'empty';
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'no-callback';
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? 'callback' : 'no-callback';
}

/**
 * 進めない理由 (`null` なら進める)。**認可ページを開く前**に呼ぶ ——
 * Google まで往復してから「その形式では完了できません」と言うのでは遅い。
 */
export function redirectBlockedReason(uri: string): string | null {
  switch (redirectKind(uri)) {
    case 'callback':
      return null;
    case 'empty':
      return `リダイレクト URI を入力してください (例: ${LOOPBACK_REDIRECT_URI})。`;
    case 'no-callback':
      return [
        'このリダイレクト URI では認可を完了できません。',
        'token の交換には Google が返す state が必要で、state はブラウザが飛ばされた先の URL にしか載りません。',
        `${LOOPBACK_REDIRECT_URI} のような http(s) の URI を、Google Cloud Console で登録したものと同じ綴りで入れてください。`,
      ].join('');
  }
}

/** 貼る欄の placeholder。**求める物そのものを見せる** (code だけを求めない)。 */
export const CALLBACK_PASTE_PLACEHOLDER = 'http://localhost/?code=4/0Ab…&state=… ← アドレスバーの URL 全体';

/** 貼る欄の上に出す説明。1 か所だけに置く (画面が言い換えない)。 */
export const CALLBACK_PASTE_HINT = [
  'Google で認可すると、ブラウザは上で指定したリダイレクト先へ飛びます。',
  '受け取るものは無いので「接続できません」と表示されますが、',
  'アドレスバーには code と state の付いた URL が出ています。',
  'その URL を丸ごとコピーして、下に貼ってください (code だけでは完了できません)。',
].join('');

/**
 * 読めなかった理由を述べる。**`parseGoogleCallback` が `null` を返したときだけ**
 * 呼ぶ (読めた入力に対しては `null` を返す —— 呼び間違えても嘘を言わない)。
 */
export function describeCallbackPasteFailure(input: string): string | null {
  const params = callbackParams(input);
  if (params === null) {
    return 'URL として読めませんでした。アドレスバーの URL 全体 (code= と state= を含む) を貼り付けてください。';
  }
  const code = params.get('code');
  const state = params.get('state');
  if (code && state) return null;
  /*
   * **`error=` は code/state の勘定より先に見る。** Google は認可を断られたとき
   * `?error=access_denied&state=…` を返す —— `state` は載っているので、後ろに
   * 置いたままだと「state は読めましたが code がありません」という
   * **貼り方の話**にすり替わる。貼り方を直しても解決しない形なので、
   * ここで分ける (この順序は自分の検査が捕まえた: 最初は下に書いていた)。
   */
  const error = params.get('error');
  if (error) {
    return `Google が認可を返しませんでした (error=${error})。もう一度「認可ページを開く」からやり直してください。`;
  }
  if (code && !state) {
    return [
      'code は読めましたが state がありません。',
      'state は CSRF を防ぐために必ず照合するので、code だけでは token を交換できません。',
      'アドレスバーの URL 全体 (末尾の &state=… まで) を貼り付けてください。',
    ].join('');
  }
  if (!code && state) {
    return 'state は読めましたが code がありません。アドレスバーの URL 全体を貼り付けてください。';
  }
  /*
   * `code` も `state` も無い —— 生の認可コード (`4/0Ab…`) を貼った形が
   * ここに来る (`=` が無いので `URLSearchParams` は空になる)。**画面が
   * 長らくこれを指示していた**ので、名指しで言う。
   */
  return [
    'code も state も見つかりませんでした。',
    '認可コードだけ (4/0Ab… の 1 行) では完了できません —— ',
    'ブラウザのアドレスバーに出ている URL 全体を貼り付けてください。',
  ].join('');
}
