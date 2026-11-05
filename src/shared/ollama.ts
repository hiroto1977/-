/**
 * Ollama 連携の共有ロジックの入口 (main / renderer 両方がここを import する)。
 *
 * 中身は Mamori で書いた `ollamaCore.mamori` (生成物 `ollamaCore.ts`) に移した
 * (MG-035 · 2026-11-05)。守っている制約 (接続先は 3 通りだけ・読み取り 3 エンドポイントのみ・
 * 台帳 `OLLAMA_ADVISORIES` の日付つき主張) の説明も `ollamaCore.mamori` が持つ。
 *
 * ここがすることは 2 つだけで、判断は持たない:
 *  1. Mamori は関数名がモジュールをまたいで一意でなければならず、`isLoopbackHostname` と
 *     `compareVersions` は他のモジュールが同名の関数を持つので、Core では
 *     `isOllamaLoopbackHostname` / `compareOllamaVersions` と名乗り、ここで元の名前へ戻す。
 *  2. 「アプリを配信しているホスト名」(`pageHostname`) の省略時の既定 `''` を補う。
 *     Mamori には引数の既定値の位置に注記を置く口が無く、既定値の文字列は観測できない (番人の値を
 *     入れても後段はホスト名が一致せず同じ結論になる) 変異体を生むので、Core は必須の引数にして
 *     既定はここで持つ。意味は元のまま。
 * 他の名前は `export *` でそのまま再 export する。呼び出し側は 1 字も変えない。
 */
import {
  buildOllamaUrl as buildOllamaUrlCore,
  isAllowedOllamaBase as isAllowedOllamaBaseCore,
  parseOllamaEndpoint as parseOllamaEndpointCore,
  type OllamaReadPath,
} from './ollamaCore';

export * from './ollamaCore';
export {
  isOllamaLoopbackHostname as isLoopbackHostname,
  compareOllamaVersions as compareVersions,
} from './ollamaCore';

export function isAllowedOllamaBase(base: string, pageHostname = ''): boolean {
  return isAllowedOllamaBaseCore(base, pageHostname);
}

export function buildOllamaUrl(base: string, path: OllamaReadPath, pageHostname = ''): string | null {
  return buildOllamaUrlCore(base, path, pageHostname);
}

export function parseOllamaEndpoint(input: string, pageHostname = ''): string | null {
  return parseOllamaEndpointCore(input, pageHostname);
}
