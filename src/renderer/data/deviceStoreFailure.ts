/**
 * **端末の保管庫が読み書きを断ったことを、画面へ届ける 1 本の経路。**
 *
 * 対象は**同じ端末の同じ容量を分け合う 2 つ**である:
 *
 *   records … 業務レコード (`data/store.ts`。売上・KPI・事業・士業 CRM …)
 *   files   … 書き出した書類・図の実体 (`library/library.ts`)
 *
 * どちらも IndexedDB で、**片方が容量を埋めれば他方も断られる**。断られた
 * ときの打ち手 (何かを消す / 通常のウィンドウで開く / やり直す) も同じなので、
 * 経路と枠は 1 つで足りる。文面の主語だけが変わる (記録 / ファイル)。
 *
 * `localWrite.ts` は localStorage の書き込みを成否つきで返すようにした
 * (2026-09-06)。**その 1 つ下の層 —— レコードストア (IndexedDB) は、まだ誰も
 * 見ていなかった。** 実測 (2026-09-06):
 *
 * ```
 *   useCollection の add / addMany / edit / remove を呼ぶ 13 か所のうち、
 *   失敗を画面に出しているのは 3 か所 (ShigyoConsole の 2 つ・経営ハイライト) だけ。
 *   残る 10 か所は `void add()` / `onClick={async () => { await onSave(...) }}` で、
 *   **拒否された Promise を誰も受け取らない。**
 * ```
 *
 * 出方はどれも同じで、**何も起きない**:
 *
 *   追加 … 行は増えず、文言も出ない。打ち込んだ値は残るので「押せていない」に見える
 *   削除 … 行は消えず、文言も出ない
 *   保存 … 「保存しました」も出ないが、なぜ出ないのかも分からない
 *
 * さらに重いのは**読み**の側だった。`useCollection` のマウント effect は
 * `reload()` を投げっぱなしにしており、`indexedDB` が開けない端末
 * (プライベートモード・容量超過・別タブの versionchange) では
 * **全コレクションが空**になる。画面は「まだ何も入力していない」のと
 * 区別が付かない見た目になり、利用者から見れば**業務データが消えたのと同じ**である。
 * `dbPosture.ts` が「『無い』と『確認できない』を区別できていない」と書いている
 * のと同じ形が、いちばん下の層に在った。
 *
 * ここは判定と文面だけを持つ。**入口 (`useCollection` / `LibraryPage`) が失敗を
 * ここへ写し、画面 (`DeviceStoreFailureBanner`) が最後の 1 件を出す** ——
 * 15 か所へ同じ try/catch を書いて回ると、必ずどれか 1 つが漏れる
 * (`ManualDataSection` を 1 か所に置いたのと同じ理由)。
 *
 * 文面は「何ができなかったか（なぜ）。何が今どうなっているか。どうすればよいか」
 * の 3 つで組む。理由で打ち手が変わるので**理由ごとに分ける** (`localWrite.ts` と同じ判断)。
 */
import { describeStorageError } from './localWrite';

/** どちらの保管庫か。文面の主語が変わる。 */
export type DeviceStore = 'records' | 'files';

/** 断られた操作。文面の動詞と「今どうなっているか」が変わる。 */
export type DeviceStoreOp = 'read' | 'save' | 'delete';

/** 断られた理由。打ち手が変わる 3 通り。 */
export type DeviceStoreFailureKind = 'quota' | 'blocked' | 'unknown';

export interface DeviceStoreFailure {
  readonly store: DeviceStore;
  readonly op: DeviceStoreOp;
  /** どこで起きたか (コレクション名など。画面には出さない —— 診断と検査のため)。 */
  readonly where: string;
  readonly message: string;
}

const HEADING: Record<DeviceStore, Record<DeviceStoreOp, string>> = {
  records: {
    read: 'この端末に保存した記録を読めませんでした',
    save: 'この端末に保存できませんでした',
    delete: 'この端末から削除できませんでした',
  },
  files: {
    read: 'この端末に保存したファイルを読めませんでした',
    save: 'この端末にファイルを保存できませんでした',
    delete: 'この端末からファイルを削除できませんでした',
  },
};

/** 「今どうなっているか」。**利用者が次に何を見るか**を先に言う。 */
const STATE: Record<DeviceStore, Record<DeviceStoreOp, string>> = {
  records: {
    read: '画面は空でも、記録が消えたとは限りません。',
    save: '打ち込んだ内容は画面に残っています。',
    delete: '一覧はそのままです。',
  },
  files: {
    read: '一覧が 0 件でも、ファイルが消えたとは限りません。',
    save: '書き出した内容は端末に残っていません。',
    delete: '一覧はそのままです。',
  },
};

/** `unknown` は載せない —— そちらは例外の種別を出す (`describeStorageError`)。
 *  空文字を置くと、**どのテストからも読まれない欄**が 1 つ残る。 */
const CAUSE: Record<Exclude<DeviceStoreFailureKind, 'unknown'>, string> = {
  quota: 'この端末の保存領域が一杯です',
  blocked: 'ブラウザの設定 (プライベートモードなど) で端末への保存が禁じられています',
};

const REMEDY: Record<DeviceStoreFailureKind, string> = {
  quota: 'ライブラリの不要なファイルを削除してから、やり直してください。',
  blocked: '通常のウィンドウで開き直してください。',
  unknown: '画面を再読み込みしてやり直し、直らないときは設定のバックアップで控えを取ってください。',
};

/**
 * 例外を 3 通りに分ける。名前で見るのは `localWrite.ts` と同じ理由
 * (ブラウザによって name が違い、code は要らない)。
 *
 * IndexedDB は localStorage より断り方が多い。`InvalidStateError` は
 * 「ストアが使えない」で出る (Firefox がプライベートウィンドウで返す形) ため
 * `blocked` に寄せる —— 利用者の打ち手が「通常のウィンドウで開く」で同じになる。
 */
export function deviceStoreFailureKind(err: unknown): DeviceStoreFailureKind {
  if (!(err instanceof Error)) return 'unknown';
  if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota';
  if (err.name === 'SecurityError' || err.name === 'InvalidStateError') return 'blocked';
  return 'unknown';
}

/** 画面に出す 1 行。 */
export function deviceStoreFailureMessage(store: DeviceStore, op: DeviceStoreOp, err: unknown): string {
  const kind = deviceStoreFailureKind(err);
  const cause = kind === 'unknown' ? describeStorageError(err) : CAUSE[kind];
  return `${HEADING[store][op]}（${cause}）。${STATE[store][op]}${REMEDY[kind]}`;
}

/**
 * **押しただけの操作を、宙ぶらりんの拒否を残さずに走らせる。**
 *
 * 入口 (`useCollection`) が失敗をこの経路へ写してから投げ直すので、
 * 押しただけの場所 (ボタンの `onClick`) には**もう出すものが無い**。それでも
 * `void p` と書くと拒否が宙に浮き、`unhandledrejection` として端末の
 * コンソールにだけ出る —— 画面には何も出ないまま、検査では「未処理の拒否」
 * として鳴る (2026-09-06 実測で 3 件)。
 *
 * ここで受け取って落とす。**落としてよいのは、既に報せてあるからである** ——
 * 報せていない失敗をこの関数で消してはいけない。
 */
export function fireReported(p: Promise<unknown> | void): void {
  void Promise.resolve(p).catch(() => undefined);
}

let latest: DeviceStoreFailure | null = null;
const listeners = new Set<(f: DeviceStoreFailure | null) => void>();

/** 最後に断られた 1 件 (画面が出すもの)。 */
export function currentDeviceStoreFailure(): DeviceStoreFailure | null {
  return latest;
}

/**
 * 断られたことを届ける。**入口 (`useCollection`) だけが呼ぶ。**
 *
 * 最後の 1 件だけを持つ。原因はたいてい端末側 (容量・設定・接続) で、
 * 同時に何件失敗しても打ち手は 1 つなので、並べても選べるものが増えない。
 */
export function reportDeviceStoreFailure(
  store: DeviceStore,
  op: DeviceStoreOp,
  where: string,
  err: unknown,
): void {
  publish({ store, op, where, message: deviceStoreFailureMessage(store, op, err) });
}

/** 画面から閉じたとき。次に失敗すればまた出る。 */
export function clearDeviceStoreFailure(): void {
  publish(null);
}

function publish(next: DeviceStoreFailure | null): void {
  latest = next;
  for (const fn of listeners) fn(next);
}

/** 画面が購読する。戻り値を呼ぶと解除。 */
export function subscribeDeviceStoreFailure(fn: (f: DeviceStoreFailure | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** テスト用: 最後の 1 件と購読者を空にする。 */
export function _resetDeviceStoreFailureForTests(): void {
  latest = null;
  listeners.clear();
}
