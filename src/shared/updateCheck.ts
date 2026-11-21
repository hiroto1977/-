// 生成物 —— src/shared/updateCheck.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * 更新の有無を調べる純ロジック。
 *
 * ## なぜ「知らせるだけ」なのか
 *
 * `electron-updater` を入れれば自動ダウンロード＋自動インストールまでできる。
 * が、このアプリは **OAuth トークンと API キーを保持している**。署名の無い
 * 配布物を自動で取得して実行する経路を足すと、そこが新しいコード実行の
 * 入口になる (更新の取得元が偽装された / リリース資産が差し替えられた場合、
 * 利用者の操作なしに任意コードが動く)。
 *
 * 署名と公証が入るまでは、**取得も実行もしない**。やるのは
 * 「新しい版があるか」を調べて利用者に伝えることだけで、
 * ダウンロードは利用者がブラウザでリリースページを開いて行う
 * (`openExternal` は http(s) しか通さない)。これなら実行面は増えない。
 *
 * 署名が入ったら、この判定をそのまま使って自動更新に差し替えられる
 * (判定と取得を分けてあるのはそのため)。
 *
 * ## 比較は自前で書く
 *
 * `semver` を依存に足さないのは、必要なのが「x.y.z の大小」と
 * 「プレリリースは正式版より古い」の 2 点だけで、そこは 30 行で書けるうえ、
 * **更新経路に依存を足すこと自体がリスク**だからである。
 *
 * そのうち後者 (順序の規則) は `shared/versionOrder.ts` が 1 つだけ持つ ——
 * 2026-09-22 (パス 402) まで `shared/ollama.ts` が同じ問いに**別の答え**を
 * 出しており、そちらは既知の脆弱性の台帳と突き合わせる側だった。
 *
 * ## Mamori で書いてある (2026-11-01 · MG-018)
 *
 * 元は TypeScript。足りなかったのは `as` (`json as Record`・`tag as string`) と template だけで、`field` で欄を読み、`String(tag)` で検めた文字列を取り直し、
 * 補間を連結に替えた。組み上がる文字列は 1 字も変えない。判別可能合併は、欄をそのまま写した 2 つの名前つき interface の合併にした。
 */

import { prereleaseKey } from './versionOrder';

/** 版の表記。`v` 接頭辞は許す (GitHub のタグは `v0.1.0` の形)。 */
export interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** プレリリース識別子 (`beta.1` など)。正式版は null。 */
  readonly prerelease: string | null;
}

/**
 * 版を数値に分解する。読めない表記は null (推測しない)。
 *
 * **正規表現をモジュール定数へ括り出さない。** 括り出すと本体がモジュール読み込み時に評価され、変異検査では「静的変異体」になる ——
 * テストが読み込みより後に走るぶん、書き換えても誰も気付けない (実測 2026-08-23: 7 通りの変異がすべて「生存」と報告された)。
 */
export function parseVersion(raw: unknown): ParsedVersion | null {
  if (typeof raw !== "string") return null;
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(raw.trim());
  if (m === null) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease: m[4] === undefined ? null : m[4] };
}

/**
 * 3 通りの結果を返す比較。**「等しくないと分かってから大小を見る」形にしない** —— `if (a !== b) return a > b ? 1 : -1` と書くと、
 * その `>` は等値が除かれた後なので `>=` に変えても結果が変わらない = テストで守れない分岐になる。
 */
function cmp3(a: number | string, b: number | string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * 版の大小。`a` が新しければ 1、古ければ -1、同じなら 0。
 *
 * プレリリース同士は識別子の辞書順で比べる — 正確な semver の規則 (数値識別子は数値比較) までは踏み込まない。
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  return cmp3(a.major, b.major) || cmp3(a.minor, b.minor) || cmp3(a.patch, b.patch) || cmp3(prereleaseKey(a.prerelease), prereleaseKey(b.prerelease));
}

export interface LatestRelease {
  readonly version: string;
  readonly url: string;
}

/**
 * GitHub の releases API の応答から必要な 2 つだけ取り出す。形が違えば null。**送られてきた URL をそのまま信用しない** —— `html_url` が
 * https の GitHub 上のページであることを確かめる。**調べた物をそのまま返す** (2026-09-22 · パス 406) —— 判定は `new URL()` の解析結果に
 * 対して下すので、生の文字列を返すと「検めた物」と「使う物」が割れる。
 */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (typeof json !== "object" || json === null) return null;
  const tag = (json as { tag_name?: unknown }).tag_name;
  const url = (json as { html_url?: unknown }).html_url;
  // 型の確認は parseVersion / githubReleaseUrlOrNull が unknown を受けて行う。ここで typeof を重ねると、下で必ず落ちる値をもう一度見るだけの分岐になる。
  const checked = githubReleaseUrlOrNull(url);
  if (parseVersion(tag) === null || checked === null) return null;
  return { version: String(tag), url: checked };
}

/**
 * https で github.com 上の URL か。更新の案内先をそこに限る。`unknown` を受けて**文字列以外をここで落とす** (`new URL(x)` は引数を文字列化するので、
 * `{ toString: () => 'https://github.com/…' }` のような値を通してしまう)。**返すのは解析結果** —— 認めた物と呼び手が持つ文字列を割らせない。
 * 全角 `ｇithub.com` は IDNA で `github.com` へ正規化される。
 */
export function githubReleaseUrlOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  // 認証情報付き (`https://github.com@evil.example/`) は落とす。ホスト固定と二重になるが、ここは案内先として画面に出す値なので、字面の信用と実際の送り先を割らせない。
  if (parsed.username !== "" || parsed.password !== "") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;
  return parsed.toString();
}

/** 上の関門の真偽だけが要るとき。**判定は 1 つ**で、こちらはその薄い包み。 */
export function isGithubReleaseUrl(raw: unknown): boolean {
  return githubReleaseUrlOrNull(raw) !== null;
}

/** 更新の判定。`ahead` = 手元が公開版より新しい (開発中のビルド)・`unknown` = どちらかの版が読めない。 */
export type UpdateStatus =
  | "update-available"
  | "up-to-date"
  | "ahead"
  | "unknown";

/** 版の比較ができた判定。**この 3 状態では `latest` は必ず在る。** */
interface UpdateVerdictKnown {
  readonly current: string;
  readonly url: string | null;
  readonly status: "update-available" | "up-to-date" | "ahead";
  readonly latest: string;
}

/** どちらかの版が読めなかった判定。**このときだけ `latest` が null になりうる。** */
interface UpdateVerdictUnknown {
  readonly current: string;
  readonly url: string | null;
  readonly status: "unknown";
  readonly latest: string | null;
}

/**
 * 手元の版と公開版の比較結果。**判別可能合併にしてある。** 平らな interface で `latest: string | null` を全 status に持っていた頃は、
 * `case 'update-available'` の中でも `latest` が `string | null` のままで、文面は裸で補間するので「新しい版 null があります」を作れた。
 */
export type UpdateVerdict = UpdateVerdictKnown | UpdateVerdictUnknown;

/** 手元の版と公開されている最新版を比べる。 */
export function evaluateUpdate(current: string, latest: LatestRelease | null): UpdateVerdict {
  const mine = parseVersion(current);
  if (mine === null || latest === null) return { status: "unknown", current: current, latest: latest?.version ?? null, url: latest?.url ?? null };
  const theirs = parseVersion(latest.version);
  if (theirs === null) return { status: "unknown", current: current, latest: latest.version, url: latest.url };
  const cmp = compareVersions(theirs, mine);
  const status: UpdateStatus = cmp > 0 ? "update-available" : cmp === 0 ? "up-to-date" : "ahead";
  return { status: status, current: current, latest: latest.version, url: latest.url };
}

/** 画面に出す一文。 */
export function describeUpdate(verdict: UpdateVerdict): string {
  switch (verdict.status) {
    case "update-available":
      return "新しい版 " + verdict.latest + " があります (お使いの版: " + verdict.current + ")。ダウンロードはリリースページから行ってください。";
    case "up-to-date":
      return "最新版です (" + verdict.current + ")。";
    case "ahead":
      return "お使いの版 " + verdict.current + " は公開されている最新版 " + verdict.latest + " より新しいです (開発中のビルド)。";
    case "unknown":
      return "更新の有無を判定できませんでした。時間をおいて試してください。";
  }
}
