/**
 * **原文の綴りに当てる検査のための、原文の在り処。** (2026-09-07)
 *
 * 変異検査 (Stryker) は `mutate` 台帳のファイルを**書き換えてから** sandbox
 * (`.stryker-tmp/sandbox-XXXXXX/`) に置いて走らせる。書き換わった原文はこうなる:
 *
 * ```ts
 * export const BALANCE_SHEET_COLLECTION = stryMutAct_9fa48("7644") ? "" : (stryCov_9fa48("7644"), 'balance-sheet')
 * ```
 *
 * だから**原文の綴りに当てる検査は sandbox の中で意味を失う** —— 走査は 0 件になり、
 * 「無いこと」の主張は**どの入力でも通る空の検査**になる。
 *
 * ## 実測 (2026-09-07)
 *
 * 原文を読む検査は 56 件で、うち **37 件が `mutate` 台帳のファイルを読んでいた**。
 * そのうち走査の生死を見る床を持つのは **1 件だけ** (`collectionShapes.test.ts` の
 * 「0 件なら走査の死」)。その 1 件が**変異検査の初回実行そのものを落として**
 * 教えてくれた (`expected 0 to be greater than or equal to 20`)。床の無い 36 件は
 * 黙って空の検査になっており、誰にも見えていなかった。
 *
 * なお `collectionShapes.test.ts` は `main` にまだ無い (このブランチで足した) ので、
 * 直前の週次の変異検査は緑だった —— **合流したら初回実行で落ちる**ところだった。
 * しかも文面は「初回実行で失敗したテストが在る」で、原因のファイル名しか出ない。
 *
 * ## 直し方 —— 飛ばすのではなく、本物の原文を読む
 *
 * 「変異検査のときは飛ばす」では床を捨てることになる。sandbox は repo の直下に
 * 在るので、**道から `.stryker-tmp/sandbox-XXXXXX/` を抜けば元の場所に戻る**。
 * そうすれば検査は sandbox の中でも本来の仕事をする。
 *
 * 戻れなかったとき (repo の道が実在しないとき) に読んだ写しがまだ書き換わっていたら
 * **投げる** —— 空の検査として通すよりも、鳴らないことを鳴らすほうが良い。
 * 戻れたときは印を探さない (印について書いた文書を誤って掴むため。下の `isInstrumented`)。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';

/**
 * 計器が書き換えた印。Stryker が差し込むのは**呼び出しの形** (`stryMutAct_9fa48(`)
 * なので、接頭辞だけでなく括弧まで見る。
 *
 * **接頭辞だけを見て一度やらかした** (2026-09-07): このファイル自身が説明文の中で
 * 印を書いているので、`includes('stryMutAct_')` だと**自分を読んだときに真**になり、
 * 検査 2 件が「書き換えられている」で落ちた。印について書いた文書は、印そのものと
 * 見分けられなければならない。
 */
export function isInstrumented(text: string): boolean {
  return /stryMutAct_[0-9a-f]+\(/.test(text);
}

/**
 * sandbox の中の道を、repo の中の元の道へ戻す。sandbox の外ではそのまま返す。
 *
 * 正規表現は**関数の中**に置く (module 直下の const にすると読み込み時に 1 度だけ
 * 評価される「静的な変異体」になり、測れる場所から出る)。
 */
export function originalSourcePath(absPath: string): string {
  return absPath.replace(/[\\/]\.stryker-tmp[\\/]sandbox-[^\\/]+(?=[\\/])/, '');
}

/** sandbox の中に居るか (道に sandbox の 2 段が在るか)。 */
export function insideInstrumentedSandbox(absPath: string): boolean {
  return originalSourcePath(absPath) !== absPath;
}

/**
 * 原文を読む。sandbox の中なら repo の本物を読む。
 *
 * **書き換わりの検査は「戻れなかったとき」だけ当てる。** repo の道が実在して
 * そこから読めたなら、その文字は定義により原文である —— そこで印を探すと、
 * 印について書いた文書 (このファイル自身や、それを引く検査) を誤って掴む。
 * 戻れずに sandbox の写しを読んだときは、黙って空の検査になるより投げる。
 */
export function readOriginalSource(absPath: string): string {
  const mapped = originalSourcePath(absPath);
  if (existsSync(mapped)) return readFileSync(mapped, 'utf8');
  const text = readFileSync(absPath, 'utf8');
  if (isInstrumented(text)) {
    throw new Error(
      `原文へ戻れず、計器が書き換えた写しを読んだ (${absPath})。この検査は原文の綴りに` +
        '当てるので、書き換わった文字を読むと空の検査になる。sandbox の置き場が変わった可能性。',
    );
  }
  return text;
}

/** ディレクトリの一覧を、repo の本物から取る。 */
export function readOriginalDir(absDir: string): string[] {
  const mapped = originalSourcePath(absDir);
  return readdirSync(existsSync(mapped) ? mapped : absDir);
}
