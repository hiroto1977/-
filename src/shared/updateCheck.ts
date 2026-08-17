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
 */

/** 版の表記。`v` 接頭辞は許す (GitHub のタグは `v0.1.0` の形)。 */
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** プレリリース識別子 (`beta.1` など)。正式版は null。 */
  readonly prerelease: string | null;
}

/** 版を数値に分解する。読めない表記は null（推測しない）。 */
export function parseVersion(raw: unknown): ParsedVersion | null {
  if (typeof raw !== 'string') return null;
  const m = VERSION_RE.exec(raw.trim());
  if (m === null) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] === undefined ? null : m[4],
  };
}

/**
 * 3 通りの結果を返す比較。**「等しくないと分かってから大小を見る」形にしない**。
 *
 * `if (a !== b) return a > b ? 1 : -1` と書くと、その `>` は等値が除かれた
 * 後なので `>=` に変えても結果が変わらない = テストで守れない分岐になる。
 * 大小と等値を 1 か所で見れば、3 つの枝すべてが観測できる。
 */
function cmp3(a: number | string, b: number | string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * プレリリース識別子の比較キー。
 *
 * 正式版 (prerelease なし) は**どのプレリリースより後**に来る (0.2.0-beta < 0.2.0)。
 * 版の正規表現は `[0-9A-Za-z.-]` しか通さないので、そこに現れない U+FFFF を
 * 正式版のキーにすれば、辞書順の比較 1 本で順序が付く。
 */
function prereleaseKey(prerelease: string | null): string {
  return prerelease === null ? '\uFFFF' : prerelease;
}

/**
 * 版の大小。`a` が新しければ 1、古ければ -1、同じなら 0。
 *
 * プレリリース同士は識別子の辞書順で比べる — 正確な semver の規則
 * (数値識別子は数値比較) までは踏み込まない。ここで要るのは
 * 「利用者に新しい版があると伝えるか」の判断だけである。
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  return (
    cmp3(a.major, b.major) ||
    cmp3(a.minor, b.minor) ||
    cmp3(a.patch, b.patch) ||
    cmp3(prereleaseKey(a.prerelease), prereleaseKey(b.prerelease))
  );
}

export interface LatestRelease {
  readonly version: string;
  readonly url: string;
}

/**
 * GitHub の releases API の応答から必要な 2 つだけ取り出す。
 *
 * 形が違えば null。**送られてきた URL をそのまま信用しない** —
 * `html_url` が https の GitHub 上のページであることを確かめる。
 * ここを緩めると、応答を差し替えられたときに任意の URL を
 * 「更新はこちら」として見せられてしまう。
 */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  const tag = o['tag_name'];
  const url = o['html_url'];
  // 型の確認は parseVersion / isGithubReleaseUrl が unknown を受けて行う。
  // ここで typeof を重ねると、下で必ず落ちる値をもう一度見るだけの
  // 分岐になり、テストで守れない。
  if (parseVersion(tag) === null || !isGithubReleaseUrl(url)) return null;
  return { version: tag as string, url: url as string };
}

/**
 * https で github.com 上の URL か。更新の案内先をそこに限る。
 *
 * `unknown` を受けて**文字列以外をここで落とす**。`new URL(x)` は引数を
 * 文字列化するので、`{ toString: () => 'https://github.com/…' }` のような値を
 * そのまま渡すと通ってしまう。JSON からはそんな値は来ないが、
 * 「unknown を安全に受ける」のがこの関数の役目なので入口で断つ。
 */
export function isGithubReleaseUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return host === 'github.com' || host === 'www.github.com';
}

export type UpdateStatus =
  | 'update-available'
  | 'up-to-date'
  /** 手元が公開版より新しい（開発中のビルド）。 */
  | 'ahead'
  /** どちらかの版が読めない。 */
  | 'unknown';

export interface UpdateVerdict {
  readonly status: UpdateStatus;
  readonly current: string;
  readonly latest: string | null;
  readonly url: string | null;
}

/** 手元の版と公開されている最新版を比べる。 */
export function evaluateUpdate(current: string, latest: LatestRelease | null): UpdateVerdict {
  const mine = parseVersion(current);
  if (mine === null || latest === null) {
    return { status: 'unknown', current, latest: latest?.version ?? null, url: latest?.url ?? null };
  }
  const theirs = parseVersion(latest.version);
  if (theirs === null) {
    return { status: 'unknown', current, latest: latest.version, url: latest.url };
  }
  const cmp = compareVersions(theirs, mine);
  const status: UpdateStatus = cmp > 0 ? 'update-available' : cmp === 0 ? 'up-to-date' : 'ahead';
  return { status, current, latest: latest.version, url: latest.url };
}

/** 画面に出す一文。 */
export function describeUpdate(verdict: UpdateVerdict): string {
  switch (verdict.status) {
    case 'update-available':
      return `新しい版 ${verdict.latest} があります (お使いの版: ${verdict.current})。ダウンロードはリリースページから行ってください。`;
    case 'up-to-date':
      return `最新版です (${verdict.current})。`;
    case 'ahead':
      return `お使いの版 ${verdict.current} は公開されている最新版 ${verdict.latest} より新しいです (開発中のビルド)。`;
    case 'unknown':
      return '更新の有無を判定できませんでした。時間をおいて試してください。';
  }
}
