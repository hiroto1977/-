/**
 * localStorage への書き込みを**成否つきで**返す。**投げない。**
 *
 * 読み取り側は 2026-09-05 に形の検査で固めたが、**書き込み側は誰も見ていなかった**。
 * 実測 (2026-09-06): 19 か所の `setItem` のうち、利用者が打ち込んだ物を保存する 3 か所
 * (書類スタジオの差込値・Team Radar の下書き・チャット履歴) が `catch {}` で**黙って
 * 捨てていた**。書類スタジオは画面に「入力は端末内に自動保存」と書いてあるので、
 * 容量超過やプライベートモードでは**画面が嘘をつく** —— 打ち続けられ、閉じると消える。
 * (2026-08 の監査で見つけた「クラウドに退避します、実際は 1 バイトも送らない」と同じ形。)
 *
 * localStorage が失敗する現実の理由は 3 つあり、利用者の打ち手が違うので**文面を分ける**:
 *
 *   容量超過      … 別の物を消せば直る (同じオリジンの他機能と共有している)
 *   書き込み禁止  … プライベートモード / ブラウザの設定 → 設定を変えるか別ブラウザ
 *   それ以外      … 理由を出して、控えを取るよう促すしかない
 *
 * 呼び出し側は `ok` を見て画面に出す。**投げない**のは、保存の失敗で入力中の画面を
 * 落とすと打ち込んだ物まで消えるため —— 画面には残し、警告して控えを促す。
 */

/** 書き込みの結果。失敗しても入力は画面に残るので、`message` は「どうすればよいか」まで書く。 */
export type LocalWriteResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * 容量超過を表す名前。ブラウザによって name が違う (Firefox は NS_ERROR_DOM_QUOTA_REACHED)。
 * code 22 / 1014 も同じ意味だが、name だけで両ブラウザを拾えるので数値は見ない。
 * Error でない物は `instanceof` で落ちる —— 一旦 name を空文字へ落とす書き方は、
 * その空文字がどの比較にも当たらないので変異検査で等価として残る (2026-09-06 実測)。
 */
function isQuota(err: unknown): boolean {
  return err instanceof Error
    && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

/** プライベートモードやブラウザ設定で保存自体が禁じられている。 */
function isBlocked(err: unknown): boolean {
  return err instanceof Error && err.name === 'SecurityError';
}

/**
 * 値を JSON にして書く。失敗の理由を分けて返す。
 *
 * `JSON.stringify` 側の失敗 (循環参照) も同じ経路で返す —— 呼び出し側から見れば
 * 「保存できなかった」であって、原因の別は文面に出す。
 */
export function writeLocalJson(key: string, value: unknown): LocalWriteResult {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch (err) {
    return { ok: false, message: `保存する値を組み立てられませんでした (${describeStorageError(err)})。` };
  }
  return writeLocalString(key, json);
}

/** 文字列をそのまま書く (JSON でない値のため)。 */
export function writeLocalString(key: string, json: string): LocalWriteResult {
  try {
    localStorage.setItem(key, json);
    /*
     * ここで組む。モジュールの定数 (`const OK = { ok: true }`) にしていたが、
     * **読み込み時に組まれる値は変異検査が測れない** —— 定数を `{}` へ潰しても、
     * その差が出るのは import の瞬間だけで、テストが走る時点では既に
     * 組み終わった写しが使われる (2026-09-06 実測で 2 件生存)。
     * 呼ばれるたびに組めば、成功の形を見ている検査がそのまま鳴る。
     */
    return { ok: true };
  } catch (err) {
    if (isQuota(err)) {
      return {
        ok: false,
        message:
          'この端末の保存領域が一杯で保存できませんでした。'
          + 'ライブラリの不要なファイルを削除するか、書き出して控えを取ってください。',
      };
    }
    if (isBlocked(err)) {
      return {
        ok: false,
        message:
          'ブラウザの設定 (プライベートモードなど) で端末への保存が禁じられています。'
          + '通常のウィンドウで開くか、印刷して控えを取ってください。',
      };
    }
    return { ok: false, message: `端末に保存できませんでした (${describeStorageError(err)})。控えを取ってください。` };
  }
}

/**
 * 例外の説明を 1 行に。Error でない物を投げる実装もあるので `String()` に落とし、
 * 文面が画面を埋めないよう 60 字で切る。`name` が空の Error もあるので既定を置く
 * (`message` は秘密を含みうるので出さない —— 出すのは種別だけ)。
 *
 * レコードストア側 (`deviceStoreFailure.ts`) も同じ名乗り方を使う ——
 * 保存先が違っても「どの種別で断られたか」の書き方を 2 つ持つ理由が無い。
 */
export function describeStorageError(err: unknown): string {
  if (err instanceof Error) return err.name || 'Error';
  return String(err).slice(0, MAX_REASON_CHARS);
}

/** 理由の文面に載せる長さの上限 (安全上限。台帳には載せない)。 */
const MAX_REASON_CHARS = 60;
