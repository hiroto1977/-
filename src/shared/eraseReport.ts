/**
 * **「すべてのデータを削除」の報告の形 —— 両ビルドで 1 つ。** (2026-09-09 · パス 137)
 *
 * ブラウザ版は媒体ごと (IndexedDB / Web Storage / Cache Storage)、デスクトップ版はファイルごと +
 * renderer の保存領域。どちらも**全部消えた時だけ** `allDeleted` が真 (パス 20 の規則)。橋
 * (`window.serviceHub.eraseAll`) はこの型の union を返し、画面は `kind` で文面を選ぶ。
 *
 * デスクトップ版は 2026-09-09 まで、設定画面の「すべてのデータを削除」が renderer の保存領域
 * (パス 136 まではその中の保管庫 1 つ) しか消せず、main 側のトークン (`service-hub-secrets.json` と
 * その控え `.prev`)・状態ファイル (気分の記録・人材育成・チームレーダー・ウォッチリスト) と
 * 書き込みの残骸 (`*.tmp-*`) は OS のユーザー領域に残っていた。
 */
export type EraseOutcome = 'deleted' | 'blocked' | 'failed' | 'unavailable';

export interface BrowserEraseReport {
  readonly kind: 'browser';
  readonly indexeddb: Readonly<Record<string, EraseOutcome>>;
  readonly localStorage: EraseOutcome;
  readonly sessionStorage: EraseOutcome;
  readonly cacheStorage: EraseOutcome;
  /** 全部が `deleted` か `unavailable`。これが真の時だけ再読込してよい。 */
  readonly allDeleted: boolean;
}

/** `missing` = 元から無い (消す物が無い = 消えたのと同じ)。`failed` = 本体か控え・残骸のどれかが残った。 */
export type EraseFileOutcome = 'deleted' | 'missing' | 'failed';

export interface DesktopEraseReport {
  readonly kind: 'desktop';
  /** ファイルの絶対パス → 結果。控え (`.prev`) と残骸 (`<名前>.tmp-*`) は本体の行に畳む。 */
  readonly files: Readonly<Record<string, EraseFileOutcome>>;
  /** renderer の保存領域 (業務レコード・ライブラリ・設定 …) —— `session.clearStorageData()`。 */
  readonly renderer: 'deleted' | 'failed';
  /** 全ファイルが deleted / missing で、renderer も deleted。これが真の時だけ main が再起動する。 */
  readonly allDeleted: boolean;
  /** 手順そのものが途中で投げた時だけ (設計上は投げないが、IPC を reject させない —— `lint:ipc-handlers`)。 */
  readonly error?: string;
}

export type EraseAllReport = BrowserEraseReport | DesktopEraseReport;

/** デスクトップ版の報告の文面。全部消えたら null。残った物はパスで名指しする (利用者が手で消せるように)。 */
export function describeDesktopEraseReport(report: DesktopEraseReport): string | null {
  if (report.allDeleted) return null;
  if (report.error !== undefined) {
    return `消去の途中で止まりました: ${report.error}。どこまで消えたか分からないので、アプリを終了してからファイルを手で確かめてください。データは残っている可能性があります。`;
  }
  const left = Object.entries(report.files)
    .filter(([, outcome]) => outcome === 'failed')
    .map(([file]) => file);
  const parts: string[] = [];
  if (left.length > 0) parts.push(`消せなかったファイル: ${left.join(' / ')}`);
  if (report.renderer === 'failed') parts.push('画面側の保存領域 (業務レコード・ライブラリ・設定) を消せませんでした');
  return (
    `${parts.join('。')}。アプリを終了してから、そのファイル (と同じ場所の .prev / .tmp-*) を手で消してください。` +
    'データは残っています。'
  );
}

/** デスクトップ版の説明文 (設定画面)。数は言わない —— ファイルの一覧は main が置き場所の関数から作る。 */
export function desktopEraseScopeSummary(): string {
  return (
    'このパソコンにアプリが保存した物をすべて消します: 保存済みトークン (secrets.json とその控え)、' +
    '気分の記録・人材育成・チームレーダー・ウォッチリストの状態ファイル (とその残骸)、' +
    '画面側の保存領域 (業務レコード・ライブラリの書類・プロキシ設定・画面の設定・下書き・会話履歴)。' +
    '消えない物: 書き出したファイル・OS のキーチェーンに残る鍵の器 (中身の暗号文は消える)・アプリ本体。' +
    '全部消えた時だけアプリが再起動し、最初の状態に戻ります。'
  );
}
