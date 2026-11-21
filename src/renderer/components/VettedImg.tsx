import type { ImgHTMLAttributes } from 'react';
import type { VettedImageSrc } from '../../shared/vetted';

/**
 * **`<img>` の唯一の口** (2026-10-30 · パス 560 · threat: T-221)。
 *
 * `<img src>` は素の `string` を受けるので、関門 (`safeImageSrc` / `safeRemoteImageSrc`) を飛ばした値を
 * 渡しても `tsc` は何も言わない —— 取得そのものは起きるので、第三者の応答が指す先 (追跡画素・利用者の網の内側)
 * へ利用者のブラウザが GET を飛ばす。ここは `src` を**関門が作る印つきの型 `VettedImageSrc` だけ**で受ける:
 *
 * ```
 *   <VettedImg src={thumbnailUrl} />            // error TS2322: 'string' is not assignable to 'VettedImageSrc'
 *   <VettedImg src={safeRemoteImageSrc(u)!} />  // 関門の戻り値だけが渡せる
 * ```
 *
 * 関門は Mamori で書いてある (`src/shared/imageUrlGate.mamori` —— 印は gate 関数の `mint` でだけ作れる)。
 * この部品は JSX なので Mamori の外 (言語は JSX を持たない) で、型の守りは TypeScript が持つ。
 * 素の `<img` が**このファイルの外に 1 つも無い**ことは `src/shared/__tests__/vettedTypes.test.ts` が見る。
 */
export function VettedImg({
  src,
  ...rest
}: { readonly src: VettedImageSrc } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'>) {
  return <img src={src} {...rest} />;
}
