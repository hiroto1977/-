/**
 * Ollama 連携の共有ロジックの入口 (main / renderer 両方がここを import する)。
 *
 * 中身は Mamori で書いた `ollamaCore.mamori` (生成物 `ollamaCore.ts`) に移した
 * (MG-035 · 2026-11-05)。守っている制約 (接続先は 3 通りだけ・読み取り 3 エンドポイントのみ・
 * 台帳 `OLLAMA_ADVISORIES` の日付つき主張) の説明も `ollamaCore.mamori` が持つ。
 *
 * Mamori は関数名がモジュールをまたいで一意でなければならず、`isLoopbackHostname` と
 * `compareVersions` は他のモジュールが同名の関数を持つので、Core の側では
 * `isOllamaLoopbackHostname` / `compareOllamaVersions` と名乗り、ここで元の名前へ戻す。
 * 他の名前はそのまま再 export する。呼び出し側は 1 字も変えない。
 */
export * from './ollamaCore';
export {
  isOllamaLoopbackHostname as isLoopbackHostname,
  compareOllamaVersions as compareVersions,
} from './ollamaCore';
