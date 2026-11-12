/**
 * レコードストアが変わったことを、読んでいる画面へ知らせる仕組み (2026-09-24 · パス 448)。
 *
 * ★ **2026-09-24 まで、この仕組みは `useCollection` の中に在った** —— つまり
 * **hook を通らない書き込みは、どの画面にも届かなかった**。出荷コードに 3 本在る
 * (実測):
 *
 * | 書く所 | 何を書くか | 直す前 |
 * | --- | --- | --- |
 * | `connectorSinks.insertStorage` | コネクタ実行の結果 | 画面に出ない |
 * | `RecordShapeAuditPanel` の削除 | 形式の合わない行 | 消しても一覧が古いまま |
 * | `BackupPanel` の復元 (`importAll`) | **全 collection** | 復元しても画面が古いまま |
 *
 * いちばん重いのは 3 本目で、**同じ画面の中で起きる** —— 設定画面は
 * `BackupPanel` (SettingsPage:1125) と `ParametersPanel` (:1132) を並べて描く。
 * 実測 (2026-09-24 · 直す前 · 消費税率の上書きを 5% で置き、25% の控えを置換復元):
 *
 * ```
 * 復元の前: 有効値=0.05
 * 復元の後: 有効値=0.05   ← 画面と計算が使う値
 * 保管層:   [{"values":{"tax.consumptionStandardRate":0.25}}]
 * ```
 *
 * **保管層は 25%、画面は 5%。** 利用者はその食い違いを知らされず、税の計算は
 * 復元する前の率で回り続ける (再読込まで)。パス 384 が「購読の写しを判定に使うと
 * 一覧が届く前に働かない」を直した当の家系で、こちらは**書いた側が黙っている**形である。
 *
 * **知らせる先は collection で絞らない (理由を測って決めた)。**
 * `remove(id)` は collection を引数に持たず、`importAll(..., {replace:true})` は
 * **控えに 1 行も無い collection を空にする** —— どちらも「どの collection が
 * 変わったか」を別に計算しないと分からない。その計算を誤ると**画面が古いまま**に
 * なる、つまり**いま直している欠陥そのもの**が戻る。**失敗の形が直している欠陥と
 * 同じ最適化は採らない。** 代わりの費用は「読んでいる hook の数だけ `list()` が
 * 1 回ずつ」で、`notifyCollection` の docblock が 2026-08 に同じ天秤で同じ側を
 * 選んでいる (「読み直しは IndexedDB の 1 read なので、分岐を消すほうを採る」)。
 *
 * 購読は collection を鍵に持つ —— **それは「この hook が何を見ているか」という
 * 事実**で、解除が効いているかを数える検査が読む。配る側が絞らないだけである。
 *
 * ## 別のタブへも配る (2026-09-27 · パス 499)
 *
 * ★ **2026-09-27 まで、知らせはこの JS 文脈 (= 1 枚のタブ) の中にしか届かなかった。**
 * 保管層 (IndexedDB) はオリジンで 1 つなので、タブ A が書いた行はタブ B の保管層にも
 * 在る —— **ところが B の画面はそれを知らず、再読込まで書く前の姿を出し続ける。**
 * 実測 (2026-09-27 · 直す前 · 実 chromium · 同じ `file://` の HTML を 2 枚):
 *
 * | 操作 | タブ B が見る物 |
 * | --- | --- |
 * | A で投資信託の銘柄を 1 件足す | B の一覧は 0 件のまま (保管層は 1 件) |
 * | A でその銘柄の評価額を 300,000 → 500,000 に書き換える | B の一覧は 300,000 のまま。**B が開いていた編集の欄で保存すると、A の 500,000 を 300,000 へ黙って戻す** |
 * | A で 7,777,777 円の売上を記録する | B の金融機関等提出用の書面は、その売上を含まないまま刷られる |
 *
 * 2 行目がいちばん重く、表示が古いだけでなく**古い表示から組んだ書き込みが新しい値を消す**
 * (lost update)。書き込みの側 (欄を開いた時の中身のままなら書く) は `store.ts` の
 * `updateIfUnchanged` が持ち、ここは**古い表示を作らない**側を持つ。
 *
 * 配る道は `BroadcastChannel` —— 施錠を配る `security/lockWorkspace.ts` と同じ形で、
 * 同じ実測 (実 chromium · `file://` の 2 文書間で届く・送った channel 自身には返らない・
 * 同じ文書の**別の** channel には届く) に立つ。だから送受を **1 本の channel** で持つ
 * (送信ごとに作ると、このタブが自分の合図を拾って読み直しが 2 回走る)。
 *
 * 受け口は**購読した時に開く** —— 読んでいる画面が在るタブだけが受け取れば足りる
 * (読んでいないタブに知らせても、読み直す物が無い)。受けた合図は**このタブの中にだけ**
 * 配り、送り返さない (配り合いにしない —— 仕様上 送り元へは返らないが、
 * ここで配らなければ**そもそも起こり得ない**)。
 *
 * **中身は運ばない** —— 合図は「何かが変わった」だけで、どの行がどう変わったかは
 * 受けた側が保管層を読み直して知る。合図に中身を載せると、封緘した記録
 * (`recordEncryption`) の平文を別の文脈へ流す道になるうえ、受けた側が
 * **保管層ではなく合図を信じる**形になる (パス 497 の「写しで決める」と同じ家系)。
 *
 * 無い環境 (古いブラウザ・拒まれた場合) では黙って諦める —— このタブの中の知らせは
 * 今までどおりで、別のタブは再読込で追いつく (直す前と同じ)。
 */

/** collection ごとの購読者。鍵は「その hook が何を見ているか」を記録する。 */
const subscribers = new Map<string, Set<() => void>>();

/**
 * その collection の購読者集合。無ければ作る。
 *
 * `subscribers.get(c) ?? []` と書くと、**到達しない既定値**が残る
 * (通知は必ず購読済みの hook から来るので undefined にならない)。
 * 集合を必ず返す入口を 1 つ置けば、その分岐ごと消える。
 */
function subscriberSet(collection: string): Set<() => void> {
  const existing = subscribers.get(collection);
  if (existing !== undefined) return existing;
  const created = new Set<() => void>();
  subscribers.set(collection, created);
  return created;
}

/**
 * 別のタブへ知らせを配る道の名前。送り手と受け手で共有する。
 *
 * 検査が**線の上を直接見る**ために公開している (何が流れたか / 流れなかったかは、
 * 同じ名前の channel をもう 1 本開いて見るしかない)。施錠の道
 * (`servicehub.lock`) とは**別の名前**にする —— 同じ道に載せると、
 * 記録の合図が施錠の受け手に届き、値で分けるしかなくなる。
 */
export const RECORD_CHANGE_CHANNEL = 'servicehub.records';

/** 配る合図。受け手は値を見て分岐するので、他の用途の合図と混ざらない。 */
export const RECORD_CHANGE_MESSAGE = 'changed';

/**
 * 送受で**共有する 1 本の道**。送信ごとに作らない理由は上の docblock。
 * 開けなかった環境では `null` のまま (次の呼び出しでもう 1 度だけ試す)。
 */
let relay: BroadcastChannel | null = null;

function relayChannel(): BroadcastChannel | null {
  if (relay !== null) return relay;
  try {
    const channel = new BroadcastChannel(RECORD_CHANGE_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      // 別のタブが書いた —— このタブで読んでいる画面にだけ配る (送り返さない)。
      if (event.data === RECORD_CHANGE_MESSAGE) notifyThisTab();
    };
    relay = channel;
  } catch {
    // BroadcastChannel が無い / 使えない環境。このタブの中の知らせは今までどおり。
  }
  return relay;
}

/** 購読する。返り値を呼ぶと解除。 */
export function subscribeCollection(collection: string, fn: () => void): () => void {
  // 受け口を開く —— 読んでいる画面が在るタブは、別のタブの書き込みも受け取る。
  relayChannel();
  const set = subscriberSet(collection);
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/** このタブで読んでいる hook すべてに読み直させる (別のタブへは配らない)。 */
function notifyThisTab(): void {
  for (const set of subscribers.values()) {
    for (const fn of set) fn();
  }
}

/**
 * レコードストアの中身が変わった —— 読んでいる hook すべてに読み直させる。
 * **このタブの中と、同じ保管層を開いている別のタブの両方へ** (パス 499)。
 *
 * 書いた本人も含めて呼ぶ。「自分以外」に絞ると読み直しが 1 回減るが、
 * **観測できる差が無いぶんテストで守れない**分岐が増える。
 */
export function notifyRecordStoreChanged(): void {
  notifyThisTab();
  relayChannel()?.postMessage(RECORD_CHANGE_MESSAGE);
}

/**
 * テスト用: 購読者を空にし、共有の道も閉じる。
 *
 * **閉じてから捨てる** —— 閉じずに捨てると `onmessage` を付けたままの受け口が残り、
 * 次の検査が別のタブの役として開いた channel の合図で、前の検査の購読者
 * (もう居ない) ではなく**このモジュールの新しい購読者**へ二重に配ることになる
 * (`lockWorkspace.ts` の `_resetLockSubscribersForTests` と同じ理由)。
 */
export function _resetCollectionSubscribersForTests(): void {
  subscribers.clear();
  if (relay !== null) relay.close();
  relay = null;
}

/** テスト用: 購読者数。解除が効いているかを見るために公開する。 */
export function _collectionSubscriberCountForTests(collection: string): number {
  return subscribers.get(collection)?.size ?? 0;
}
