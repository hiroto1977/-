/**
 * 銘柄のウォッチリストの保存値を読む —— **両ビルドの読み込みが同じ 1 つを通す** (2026-09-17 · パス 309)。
 *
 * デスクトップ版は `~/.local/business-hub/state.json` (`{ "watchlist": [...] }`)、ブラウザ版は localStorage の
 * `stocks.watchlist` (裸の配列) に残す。2026-09-17 まで、読む側は両方とも**「まだ無い」と「読めなかった」を
 * 分けていなかった**:
 *
 * ```
 *   main  loadStocksState        catch { return DEFAULT_STATE }   ← ENOENT も EACCES も壊れた JSON も同じ空
 *   web   loadWatchlistSymbols   catch { return [] }              ← 同じ
 * ```
 *
 * どちらも空として続けるので、デスクトップ版は見本 5 銘柄を刷って画面は「初期状態（登録なし）」と言い、
 * ブラウザ版は空の一覧を刷る。そのまま 1 銘柄を登録すると `[新しい 1 件]` で**保存値が上書き**され、
 * 元の一覧は戻らない。チームレーダー (パス 120)・人材育成 (パス 121) が直した形の **4 つ目の兄弟**で、
 * main の docblock は「Returns DEFAULT_STATE on missing file / parse error / shape mismatch. Never throws.」と
 * 弱さを仕様として書き留めていた (パス 291 の検査の題名と同じ形)。
 *
 * ここは 3 つの状態を返し、画面には {@link watchlistStoredNote} の 1 行を渡す。読めなかった保存値を
 * どう扱うかは {@link symbolsOrEmpty} に**1 か所**で書く。
 */

import { countChars } from './inputCeiling';
import { MAX_TICKER_CHARS } from './advisorQuestionLimits';

/**
 * 銘柄コードの形。1〜{@link MAX_TICKER_CHARS} 字の `[A-Za-z0-9.-^]` —— 日本の証券コード (`7203.T`)・
 * 米国 (`AAPL`)・指数 (`^N225`) を通し、空白・NUL・パス区切り・シェルのメタ文字を弾く。
 *
 * 2026-09-17 まで main (`clients/stocks.ts`) と renderer (`data/stocksWatchlistWeb.ts`) に**同じ規則の写しが
 * 1 つずつ**在り、renderer 側の docblock が「Electron 版 `isSafeSymbol` と同じ規則」と言うだけで、
 * 一致を留める物は無かった。空文字は正規表現の `+` (1 字以上) が弾く。
 */
export function isSafeSymbol(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (countChars(value) > MAX_TICKER_CHARS) return false;
  return /^[A-Za-z0-9.\-^]+$/.test(value);
}

/**
 * 読む側が返す 3 つの状態。`saved` は落とした件数 (`dropped` = 銘柄コードとして読めなかった要素) を運ぶ ——
 * 人材育成の `describeUnreadEntries` と同じで、**上書きすると失われる物が在る**ことを画面が言えるように。
 */
export type StoredWatchlist =
  | { readonly kind: 'saved'; readonly symbols: readonly string[]; readonly dropped: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'unreadable'; readonly reason: string };

/**
 * 「読めなかった」の理由 (両ビルドで同じ文)。
 *
 * **文言は定数に固定する** —— V8 の `JSON.parse` の文言は入力を 30 字ほど引用する (パス 234 の実測)。
 * ここに在るのは銘柄コードだけで氏名や鍵は無いが、兄弟 2 つ (`readStoredTalent` / `readStoredTeamRadar`) と
 * 同じ規則で揃える: 壊れ方で画面の文が変わる物を作らない。
 */
export const WATCHLIST_UNREADABLE = Object.freeze({
  notJson: 'JSON として読めません',
  notShape: 'ウォッチリストの形ではありません',
});

/**
 * 保存された文字列 (無ければ null) を読む。
 *
 * 受け付ける包みは 2 つ —— `{ "watchlist": [...] }` (デスクトップ版が書く形) と裸の配列 (ブラウザ版が書く形)。
 * どちらの版もこれまで書いてきた形を変えない (変えると古い版がこの値を読めず、**黙って空に畳んでいた頃の**
 * 動作へ戻る)。`watchlist` の欄が**無い**オブジェクトは古い版の空 (要素 0) として読む。
 *
 * 要素は {@link isSafeSymbol} を通る物だけを大文字に揃えて残し (重複は 1 つに)、通らない物は `dropped` に数える。
 */
export function readStoredWatchlist(raw: string | null): StoredWatchlist {
  if (raw === null) return { kind: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { kind: 'unreadable', reason: WATCHLIST_UNREADABLE.notJson };
  }
  let list: unknown;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed !== null && typeof parsed === 'object') {
    const field = (parsed as Record<string, unknown>)['watchlist'];
    if (field === undefined) {
      list = [];
    } else if (Array.isArray(field)) {
      list = field;
    } else {
      return { kind: 'unreadable', reason: WATCHLIST_UNREADABLE.notShape };
    }
  } else {
    return { kind: 'unreadable', reason: WATCHLIST_UNREADABLE.notShape };
  }
  const seen = new Set<string>();
  const symbols: string[] = [];
  let dropped = 0;
  for (const v of list as readonly unknown[]) {
    if (!isSafeSymbol(v)) {
      dropped += 1;
      continue;
    }
    const upper = v.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    symbols.push(upper);
  }
  return { kind: 'saved', symbols, dropped };
}

/** 読めなかったとき、その代わりに画面へ出ている物。デスクトップは見本の銘柄、ブラウザ版は空 (パス 161 の決定)。 */
export type WatchlistFallback = 'demo' | 'empty';

/** 読めなかったときに画面が刷る 1 行 (両ビルドで同じ文・出ている物だけが違う)。 */
export function unreadableWatchlistNote(reason: string, shown: WatchlistFallback): string {
  const showing = shown === 'demo' ? '見本の銘柄を表示しています' : '一覧は空です';
  return (
    `保存したウォッチリストを読めませんでした (${reason})。${showing}。`
    + 'このまま銘柄を登録・解除すると空の一覧を基に上書きされ、元の保存値は戻りません。'
  );
}

/** 読み込みで落とした要素が在るときの 1 行。無ければ null。 */
export function droppedWatchlistNote(dropped: number): string | null {
  if (dropped < 1) return null;
  return (
    `保存したウォッチリストのうち ${dropped} 件は銘柄コードとして読めず、読み込みで落としました。`
    + 'このまま登録・解除すると、これらは失われます。'
  );
}

/** 画面に渡す注記。読めなかった → その理由、読めたが落とした物が在る → その件数、それ以外 → null。 */
export function watchlistStoredNote(stored: StoredWatchlist, shown: WatchlistFallback): string | null {
  if (stored.kind === 'unreadable') return unreadableWatchlistNote(stored.reason, shown);
  if (stored.kind === 'saved') return droppedWatchlistNote(stored.dropped);
  return null;
}

/**
 * 読めなかった保存値を**空として扱う**所は、この関数を通る 3 つだけ:
 *
 *   1. スナップショット (画面の一覧) —— 空のときデスクトップは見本・ブラウザ版は空を出し、
 *      {@link watchlistStoredNote} が「読めなかった」と同じ画面で言う。
 *   2. 登録・解除 (明示の操作) —— 注記が先に「登録・解除すると上書きされ、元の保存値は戻りません」と
 *      述べたうえで通す。チームレーダーの「保存を押すと上書き」(パス 120) と同じ規則:
 *      **明示の操作は警告のうえ通し、暗黙の書き込み (自動保存) だけ断る** (パス 160)。
 *   3. ブラウザ版の助言の対象 —— 画面が送る universe が優先で、保存値は補助 (パス 105)。
 *
 * ここ以外で `kind !== 'saved'` を空に畳まない。
 */
export function symbolsOrEmpty(stored: StoredWatchlist): readonly string[] {
  return stored.kind === 'saved' ? stored.symbols : [];
}
