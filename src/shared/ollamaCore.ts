// 生成物 —— src/shared/ollamaCore.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * Ollama 連携の共有ロジック (main / renderer 両方から使う純関数)。
 *
 * Electron 版は `src/main/clients/ollama.ts` が Node の fetch で叩き、
 * ブラウザ版は `src/renderer/network/ollamaWeb.ts` が window.fetch で叩く。
 * **どちらも同じ制約でなければ意味がない**ので、判定ロジックはここに 1 つだけ置く。
 *
 * 守っている制約 (docs/OLLAMA_SECURITY.md — Probllama / CVE-2024-37032 と
 * 0.1.46 のまとめ、および未パッチのパーサ OOB read):
 *   - **接続先は 3 通りだけ** (isAllowedOllamaBase)。任意ホストへの http を許すと
 *     ページが内部ネットワークの探索に使える踏み台になるため、次に限定する:
 *       (1) ループバック (127.0.0.1 / localhost / ::1) — 同じ端末で動かす通常ケース
 *       (2) **ページ自身と同じホスト名** への http — PC で配信したページをスマホから
 *           開く場合。既に利用者がそのホストからアプリを読み込んでいるので、新たな
 *           到達先を与えていない (探索には使えない)
 *       (3) 任意の **https** エンドポイント — cloudflared / Tailscale Serve 等の
 *           トンネル経由。https なので https ページから mixed content で弾かれず、
 *           経路も暗号化される。相手側が CORS で明示的に許可しないと読めないため、
 *           ホスト名を絞らなくても「勝手に内部を覗く」ことはできない
 *     いずれの場合も **平文 http で別ホストへ** は許可しない (ブラウザの
 *     mixed content でも弾かれるうえ、プロンプトが平文で流れる)。
 *   - **読み取り 3 エンドポイントのみ**。/api/pull・/api/create・/api/push・
 *     /api/copy・/api/delete・/api/blobs は呼ばない — これらが上記 CVE の攻撃
 *     ベクトルであり、GGUF 経由の脆弱性 (CVE-2026-7482 ほか) の入口でもある。
 *   - 台帳 (`OLLAMA_ADVISORIES`) のうち検出した版に当てはまる項目を名指しし、
 *     MIN_SAFE_VERSION (= 台帳の修正版の最大) 未満なら「脆弱」として UI に出す。
 */

import { charsOverCeiling, clampToCeiling } from './inputCeiling';
import { displayDateOf } from './isoDate';
import { MAX_LOCAL_MODEL_ERROR_CHARS, redactForMessage } from './redact';
import { prereleaseKey, splitVersionPrerelease } from './versionOrder';
import { hostNewDate, hostParseUtc, hostField } from './ollamaHost';

export interface OllamaAdvisory {
  readonly id: string;
  /** 1 文の要約 (画面に出る)。 */
  readonly summary: string;
  /** この版以上で修正。公表されていなければ null (画面は「修正版未公表」と言う)。 */
  readonly fixedIn: string | null;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  /** 出典 (この環境から取得できた物、または 2026-05-12 の監査で確認した物)。 */
  readonly source: string;
}

/** 台帳を最後に照合した日。 */
export const OLLAMA_ADVISORIES_VERIFIED_ON = '2026-09-09';

/** この日までに再照合する (`lint:rate-freshness` が 60 日前から警告し、過ぎたら落とす)。 */
export const OLLAMA_ADVISORIES_REVIEW_BY = '2027-03-09';

export const OLLAMA_ADVISORIES: readonly OllamaAdvisory[] = [{ id: 'CVE-2024-37032', summary: 'Probllama: /api/pull のパストラバーサル → 任意ファイル上書き → RCE', fixedIn: '0.1.34', severity: 'critical', source: 'https://nvd.nist.gov/vuln/detail/CVE-2024-37032' }, { id: 'CVE-2024-39719', summary: '/api/create 経由のファイル存在情報の漏洩', fixedIn: '0.1.46', severity: 'medium', source: 'https://nvd.nist.gov/vuln/detail/CVE-2024-39719' }, { id: 'CVE-2024-39720', summary: '不正な GGUF での範囲外読み取り → DoS', fixedIn: '0.1.46', severity: 'medium', source: 'https://nvd.nist.gov/vuln/detail/CVE-2024-39720' }, { id: 'CVE-2024-39721', summary: '/api/create に /dev/random を与える DoS', fixedIn: '0.1.46', severity: 'medium', source: 'https://nvd.nist.gov/vuln/detail/CVE-2024-39721' }, { id: 'CVE-2024-39722', summary: '/api/push 経由のファイルシステム情報の漏洩', fixedIn: '0.1.46', severity: 'medium', source: 'https://nvd.nist.gov/vuln/detail/CVE-2024-39722' }, { id: 'CVE-2025-66960', summary: 'GGUF v1 の文字列長で panic (readGGUFV1String) → DoS (0.12.10 で報告・修正版は未公表)', fixedIn: null, severity: 'high', source: 'https://github.com/advisories/GHSA-jr3x-q8gx-4gw3' }, { id: 'CVE-2026-7482', summary: 'GGUF 読み込み時のヒープ範囲外読み取り (/api/create に細工した GGUF) → プロセスメモリ (鍵・会話) の漏洩', fixedIn: '0.17.1', severity: 'high', source: 'https://github.com/advisories/GHSA-x8qc-fggm-mpqg' }, { id: 'CVE-2026-86289', summary: 'GGUF の文字列長の整数オーバーフロー (readGGUFV1String)', fixedIn: '0.31.2', severity: 'low', source: 'https://github.com/advisories/GHSA-c2q9-58w2-gjg4' }];

/** 台帳の修正版の最大 —— これ未満の版には既知の脆弱性が少なくとも 1 つ当てはまる。 */
export const MIN_SAFE_VERSION = '0.31.2';

export const DEFAULT_OLLAMA_PORT = 11434;

/**
 * 初回セットアップで入れてもらうモデル。約 1.3 GB と小さく、CPU だけでも動く。
 * 「まず 1 回動かす」ことが目的なので、賢さより **確実に載ること** を優先する。
 * scripts/ollama-setup.sh も同じ値を使う (ollamaSetup.test.ts が一致を検証)。
 */
export const DEFAULT_SETUP_MODEL = 'llama3.2:1b';

/**
 * 許可するループバックホスト。これ以外は base URL として受け付けない。
 *
 * **`shared/aiEndpoint.ts` の同名関数へ寄せないこと (意図的に厳しい)。**
 * あちらは 127.0.0.0/8 全体・末尾ドット・`ip6-localhost`・展開形の `0:0:…:1` まで通す ——
 * 「平文 http を許してよいローカル相手か」という広い問いに答えるためで、正しい。こちらは
 * **Ollama の接続先として受け付ける先の許可リスト**で、Ollama の既定 bind は 127.0.0.1 なのでこの 4 つで足りる。
 * 統合は許可リストを緩める方向にしか働かない。違いが意図的であることは
 * `shared/__tests__/loopbackChecks.test.ts` が機械で留める。
 */
const LOOPBACK_HOSTS: string[] = ['127.0.0.1', 'localhost', '[::1]', '::1'];

/** チャットに載せる入力の上限 —— **両ビルドで 1 つだけ持つ。** */
export const MAX_OLLAMA_SYSTEM_CHARS = 8192;

export const MAX_OLLAMA_PROMPT_CHARS = 32768;

/** `ollama/chat` が返す形 —— **両ビルドと画面が同じ型を読む** (2026-09-09 · パス 113)。 */
export interface OllamaChatResult {
  /** モデルの返答本文 (`capAssistantReply` で天井つき)。 */
  readonly reply: string;
  readonly durationMs: number;
}

/** 呼んでよいパス。書き込み系は意図的に含めない。 */
export type OllamaReadPath = '/api/version' | '/api/tags' | '/api/chat';

export const OLLAMA_READ_PATHS: readonly OllamaReadPath[] = ['/api/version', '/api/tags', '/api/chat'];

/**
 * `http://127.0.0.1:11434` 形式のループバック base URL を組み立てる。
 * ポートが不正なら null (呼び出し側で入力エラーとして扱う)。
 */
export function buildLoopbackBase(port: number | string): string | null {
  // 数値も文字列も同じ経路で見る。10 進数字のみを受ける: Number() は '0x2b' を 43、'1e3' を 1000 と解釈するため、
  // そのまま通すと「入力した覚えのないポート」へ接続してしまう。
  const trimmed = String(port).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  // 正規表現が 10 進数字だけを通すので Number() の結果は必ず整数。
  const n = Number(trimmed);
  if (n < 1 || n > 65535) return null;
  return 'http://127.0.0.1:' + n;
}

/** ホスト名がループバックか。 */
export function isOllamaLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.includes(hostname);
}

/** base URL の形が Ollama の接続先として妥当か (スキーム・認証情報・パスなし)。 */
function isWellFormedBase(u: URL): boolean {
  // 認証情報付き URL (http://user:pass@…) は拒否 — パーサ差異の温床。
  if (u.username !== '' || u.password !== '') return false;
  // URL の pathname は最低でも '/' なので '' との比較は要らない。
  if (u.pathname !== '/') return false;
  return u.search === '' && u.hash === '';
}

/**
 * 接続先として許可するか。モジュール冒頭の 3 通りだけを通す。
 *
 * pageHostname: アプリを配信しているホスト名 (ブラウザなら location.hostname)。
 *               空文字なら「同じホスト」条件は無効化される (Electron 版など)。省略時の '' は入口 `ollama.ts` が補う。
 */
export function isAllowedOllamaBase(base: string, pageHostname: string): boolean {
  // 文字列以外は弾く。`{ toString: () => 'http://127.0.0.1:11434' }` のようなオブジェクトは
  // `new URL()` を通ってしまうため、ここで止める必要がある。空文字は `new URL('')` が throw するので下の catch に任せる。
  if (typeof base !== 'string') return false;
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return false;
  }
  if (!isWellFormedBase(u)) return false;
  // (3) https は任意ホストを許可 — 相手が CORS で許可しない限り読めないため、内部探索には使えない。
  if (u.protocol === 'https:') return true;
  if (u.protocol !== 'http:') return false;
  return isAllowedOllamaPlaintextHost(u.hostname, pageHostname);
}

/**
 * **平文 http の宛先として許してよいホストか** —— 経路 (1) と (2) だけ。
 *
 * `isAllowedOllamaBase` から切り出してある。AI プロバイダ経路用で、**ホストの絞りだけ**が要る ——
 * あちらは `https://tunnel.example/ollama` のようなパス付き base を正当に受ける (リバースプロキシ)。
 * 2026-08-23 まで AI プロバイダ経路はこの絞りを**一切通っていなかった**
 * (実測: `http://example.com:11434` も `http://169.254.169.254` も通した)。
 * 絞る理由は内部ネットワーク探索の踏み台化と、**プロンプトの平文送信**を防ぐため。
 */
export function isAllowedOllamaPlaintextHost(hostname: string, pageHostname: string = ''): boolean {
  // (1) ループバック
  if (isOllamaLoopbackHostname(hostname)) return true;
  // (2) ページ自身と同じホスト名 (PC で配信したページをスマホから開くケース)。
  //     大文字小文字は URL 側で正規化済み。pageHostname 側も揃える。`pageHostname !== ''` の前置きは要らない
  //     — http URL の hostname は必ず非空なので、pageHostname が空なら一致しようがない。
  return hostname === pageHostname.toLowerCase();
}

/** base + 許可パス を結合する。base が未許可 / パスが未許可なら null。 */
export function buildOllamaUrl(base: string, path: OllamaReadPath, pageHostname: string): string | null {
  if (!isAllowedOllamaBase(base, pageHostname)) return null;
  if (!OLLAMA_READ_PATHS.includes(path)) return null;
  // 末尾スラッシュは高々 1 本。`isAllowedOllamaBase` が pathname === '/' しか通さないので、
  // 2 本以上ある base はここへ来ない (検査で固定してある)。
  return base.replace(/\/$/, '') + path;
}

/**
 * 利用者が入力した接続先文字列を正規化する。
 * 受け付ける形: `11434` (ポートのみ = ループバック) / `http://host:port` / `https://host`
 * ホスト名のみ・スキーム省略も http:// を補って解釈する。
 */
export function parseOllamaEndpoint(input: string, pageHostname: string): string | null {
  const raw = (input ?? '').trim();
  if (raw === '') return buildLoopbackBase(DEFAULT_OLLAMA_PORT);
  // 数字のみ → ループバックのポート指定
  if (/^\d+$/.test(raw)) return buildLoopbackBase(raw);
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'http://' + raw;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  // ポート未指定なら Ollama の既定ポートを補う (https トンネルは 443 のままにする)。
  // 元は `u.port = …` で URL を書き換えていたが、Mamori は作っていない物の欄へ書かない (0.17) ので、補った host を組み立てる。
  const host = u.port === '' && u.protocol === 'http:' ? u.hostname + ':' + DEFAULT_OLLAMA_PORT : u.host;
  const base = u.protocol + '//' + host;
  return isAllowedOllamaBase(base, pageHostname) ? base : null;
}

/**
 * モデル識別子の検証。"llama3.2" / "qwen2.5-coder:7b" / "library/mistral:latest"
 * は許可し、空白・`..`・バックスラッシュ・スキーム記号などは拒否する。
 */
export function isSafeModelName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.includes('..')) return false;
  // 連続スラッシュは Ollama の正規なモデル名 (library/mistral:latest) には現れず、URL 風の文字列 ('http://x/y') を弾くための防御。
  if (name.includes('//')) return false;
  // **モジュール定数へ括り出さない。** 括り出すと本体がモジュール読み込み時に評価され、変異検査では「静的変異体」になる。
  return /^[a-z0-9][a-z0-9._:/-]{0,127}$/i.test(name);
}

/** 数の成分だけを読む。読めない成分は 0 (第三者が名乗る任意の文字列を相手にするので必ず答えを出す)。 */
function versionNumbers(core: string): number[] {
  return core.split('.').map((x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
});
}

/** `parts` の `i` 番目 (無ければ 0)。添字は引数で受けて数と分かる形にする。 */
function partAt(parts: number[], i: number): number {
  // 添字の結果 (inert) は戻り値に入れられない (0.17 · T-257)。`Number(…)` は数だけを返す組み込みなので、その引数には置ける。
  return Number(parts[+(i)] ?? 0);
}

/**
 * semver 風の比較。-1 / 0 / +1 を返す (Array.sort と同じ規約)。
 *
 * **プレリリースは対応する正式版より前** (semver §11.3)。2026-09-22 (パス 402) まで識別子を**捨てて**おり、
 * `0.1.34-rc1` と `0.1.34` が等しくなっていた。効くのは下流の 2 つで、どちらも安全側の判断である:
 *   - `applicableAdvisories` —— 実測で台帳 8 件のうち **7 件**が `fixedIn + '-rc1'` を名乗るだけで黙った。
 *   - `isVersionSafe` —— `isVersionSafe('0.31.2-rc1')` が **true** を返し、画面の「Up to date」の帯が出ていた。
 * 順序の規則は `shared/versionOrder.ts` **ただ 1 つ**。数の読み方は共有しない (理由は versionOrder.ts の docblock)。
 */
export function compareOllamaVersions(a: string, b: string): number {
  const sa = splitVersionPrerelease(a);
  const sb = splitVersionPrerelease(b);
  const pa = versionNumbers(sa.core);
  const pb = versionNumbers(sb.core);
  // 添字は数えて回す (再帰にしない: 第三者が名乗る版は何万個でも「.」を並べられ、再帰は呼び出しの深さで落ちる)。
  // Stryker disable next-line EqualityOperator: 長さが等しいときは pa と pb のどちらを選んでも添字の範囲は同じ (等価)。
  const longer = pa.length >= pb.length ? pa : pb;
  for (const i of longer.map((_v, k) => k)) {
    const ai = partAt(pa, i);
    const bi = partAt(pb, i);
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  const ka = prereleaseKey(sa.prerelease);
  const kb = prereleaseKey(sb.prerelease);
  if (ka > kb) return 1;
  if (ka < kb) return -1;
  return 0;
}

/**
 * `version` がプレリリースで、**識別子を無視すれば `floor` 以上になる**場合に true。
 *
 * つまり「番号だけ読むと足りているように見えるのに、足りていない」状態。これは画面と警告文が
 * **理由を述べなければならない唯一の状態**である —— `0.31.2-rc1` の利用者は「0.31.2 以上へ更新してください」を読んで、
 * 自分は 0.31.2 だと思う。
 */
export function prereleaseIsBelowFloor(version: string, floor: string): boolean {
  const { core } = splitVersionPrerelease(version);
  return compareOllamaVersions(version, floor) < 0 && compareOllamaVersions(core, floor) >= 0;
}

/** MIN_SAFE_VERSION 以上か。空文字や壊れた文字列は「安全でない」扱い — 不明なバージョンを黙って通すより安全側に倒す。 */
export function isVersionSafe(version: string): boolean {
  if (!version || typeof version !== 'string') return false;
  return compareOllamaVersions(version, MIN_SAFE_VERSION) >= 0;
}

/**
 * `versionSafe` が false である**原因**。選ぶのはここ 1 か所で、順序は `isVersionSafe` の判定と同じ。
 *
 * - `unreadable`  —— 版が読めなかった (パス 264。「古い」と言わない)
 * - `prerelease`  —— 番号だけ読めば足りているが、プレリリースなので足りない (パス 402)
 * - `outdated`    —— 単純に古い
 *
 * 安全なら null。
 */
export type UnsafeVersionCause = 'unreadable' | 'prerelease' | 'outdated';

export function unsafeVersionCause(version: string): UnsafeVersionCause | null {
  if (!version || typeof version !== 'string') return 'unreadable';
  if (isVersionSafe(version)) return null;
  if (prereleaseIsBelowFloor(version, MIN_SAFE_VERSION)) return 'prerelease';
  return 'outdated';
}

/**
 * 原因を 3 つの面 (札 / 1 行 / 全文) へ。**switch は 1 つ** —— 面ごとに分けて書くと、札は新しい原因を出しているのに
 * 文は古い原因のまま、という形が型の上で開く (パス 386 の `bepDisplay` と同じ理由)。
 */
export interface UnsafeVersionTexts {
  /** 帯の短い札。 */
  readonly badge: string;
  /** ボタンの隣に出す 1 行。 */
  readonly short: string;
  /** 全文 (tooltip)。 */
  readonly note: string;
}

export function unsafeVersionTexts(cause: UnsafeVersionCause): UnsafeVersionTexts {
  switch (cause) {
    case 'unreadable':
      return { badge: 'Version unknown', short: '⚠ バージョンを読み取れませんでした — 版を確認してください', note: 'バージョンを読み取れませんでした (/api/version の応答に version がありません)。最低 ' + MIN_SAFE_VERSION + ' 以上か確認してください' };
    case 'prerelease':
      return { badge: 'Pre-release — not the fixed build', short: '⚠ プレリリース版で実行中 — 正式版へ更新してください', note: 'プレリリース版で実行中です。番号は ' + MIN_SAFE_VERSION + ' 以上に見えますが、プレリリースは対応する正式版より前なので、修正が入っているとは限りません。正式版へ更新してください' };
    case 'outdated':
      return { badge: 'Outdated — known CVEs', short: '⚠ 古いバージョンで実行中 — アップグレード推奨', note: '既知 CVE。最低 ' + MIN_SAFE_VERSION + ' へ更新推奨' };
  }
}

/** 修正版が公表されている項目 (`fixedIn` が文字列に狭まっている)。 */
export type FixedAdvisory = OllamaAdvisory & { readonly fixedIn: string };

/**
 * 台帳のうち、この版に当てはまる項目 (修正版が公表され、その版未満)。版が不明なら空。
 *
 * 返す型は `fixedIn` が文字列に狭まっている (`FixedAdvisory`)。呼び手が `null` の枝を書き直さずに済む ——
 * 書くと**到達しない枝**になり、変異させても答えが変わらない等価変異が残る (パス 501)。
 */
export function applicableAdvisories(version: string, ledger: readonly OllamaAdvisory[] = OLLAMA_ADVISORIES): FixedAdvisory[] {
  if (!version || typeof version !== 'string') return [];
  const out: FixedAdvisory[] = [];
  for (const a of ledger) {
    const fixed = a.fixedIn;
    if (fixed !== null && compareOllamaVersions(version, fixed) < 0) {
      out.push({ ...a, fixedIn: fixed });
    }
  }
  return out;
}

/** 修正版が公表されていない項目 (版に関係なく注意として出す)。 */
export function unfixedAdvisories(ledger: readonly OllamaAdvisory[] = OLLAMA_ADVISORIES): OllamaAdvisory[] {
  return ledger.filter((a) => a.fixedIn === null);
}

/** 再照合の期限 (その日の終わり・UTC) を過ぎたか。 */
export function advisoriesOverdue(now: Date, reviewBy: string = OLLAMA_ADVISORIES_REVIEW_BY): boolean {
  return now.getTime() > hostParseUtc(reviewBy + 'T23:59:59Z');
}

/**
 * 台帳の日付つきの注意 (毎スナップショットに載せる)。
 *
 * 2026-09-09 までここは「未パッチの out-of-bounds read が公表されています」という日付の無い固定文で、
 * その OOB read は書いた時点で既に修正済みだった。文面は**いつの事実か**と**いつまでに見直すか**を必ず持つ。
 */
export function advisoryLedgerNotice(now: Date = hostNewDate(), ledger: readonly OllamaAdvisory[] = OLLAMA_ADVISORIES): string {
  const unfixed = unfixedAdvisories(ledger);
  const overdue = advisoriesOverdue(now) ? ' ⚠ 再照合期限を過ぎており、新しい脆弱性が台帳に無い可能性があります。' : '';
  const unfixedText = unfixed.length > 0 ? ' 修正版が未公表の項目 ' + unfixed.length + ' 件 (' + unfixed.map((a) => a.id).join(', ') + ')。' : '';
  return 'Ollama の既知の脆弱性 ' + ledger.length + ' 件の台帳は ' + OLLAMA_ADVISORIES_VERIFIED_ON + ' 時点 ' + '(再照合期限 ' + OLLAMA_ADVISORIES_REVIEW_BY + ')。' + overdue + unfixedText + ' 本アプリは /api/pull・/api/create・/api/push を呼ばず、モデルファイル (GGUF) 経由の攻撃面を持ち込みません。' + 'CLI でモデルを取得する場合は検証済みソースのみを使用してください。詳細は docs/OLLAMA_SECURITY.md。';
}

/**
 * モデル一覧の 1 行に並ぶ「**相手が名乗る**」欄の上限 (**文字**) —— 2026-09-22 · パス 408。
 *
 * `name` は `isSafeModelName` の正規表現が **128 字**で切る (超えた項目は行ごと落とす)のに、隣の 3 欄には天井が無かった。
 * 実測: 1 件に 200,000 字を 4 欄入れると `OllamaPage` の meta 行が 800,038 字になる。相手は「利用者が設定した Ollama ホスト」で、
 * 127.0.0.1 の別プロセスや LAN のホストが相手になりうる。**64 にした根拠は実物の値** —— `family` は ≤ 6、`parameter_size` は ≤ 5、
 * `quantization_level` は ≤ 6 で、いちばん長い実物の 10 倍の余地が在る。**切ったことは `…` で述べる**。
 * 行ごと落とさないのは、`family` が長いだけのモデルが一覧から消えるほうが利用者にとって悪いからである。
 */
export const MAX_OLLAMA_MODEL_DETAIL_CHARS = 64;

/** /api/tags の 1 件を UI 用に正規化した形。 */
export interface OllamaModelInfo {
  name: string;
  family: string;
  parameterSize: string;
  quantization: string;
  sizeMb: number;
  /** 更新日 (`YYYY-MM-DD`・**利用者の時計**)。**読めなければ `null`** (パス 408)。 */
  modifiedAt: string | null;
}

/** Ollama ページが描画する状態 (main / browser 共通)。 */
export interface OllamaSnapshot {
  running: boolean;
  version: string;
  versionSafe: boolean;
  versionMinRecommended: string;
  models: OllamaModelInfo[];
  warnings: string[];
}

/**
 * 一覧に並ぶ欄を 1 つ読む —— **型と長さの両方**を検める (パス 408)。
 *
 * 非文字列は `—` (既定の綴りは 1 つ)。天井を超えたら切って `…` を付ける —— **黙って切ると、利用者は
 * 「この Ollama はこういう値を返す」と読む**。空文字はそのまま返す (画面が `m.family || '?'` で `?` に倒す既存の振る舞いを変えない)。
 */
function modelDetail(v: unknown): string {
  if (typeof v !== 'string') return '—';
  if (charsOverCeiling(v, MAX_OLLAMA_MODEL_DETAIL_CHARS) === 0) return v;
  return clampToCeiling(v, MAX_OLLAMA_MODEL_DETAIL_CHARS) + '…';
}

/** /api/tags のレスポンスを OllamaModelInfo[] へ正規化する (未知形状は捨てる)。 */
export function normalizeModels(raw: unknown): OllamaModelInfo[] {
  const list = hostField(raw, 'models');
  if (!Array.isArray(list)) return [];
  const out: OllamaModelInfo[] = [];
  for (const item of list) {
    const name = hostField(item, 'name');
    // isSafeModelName が非文字列を弾くので typeof の前置きは要らない。
    if (!isSafeModelName(name)) {
      continue;
    }
    // `Number.isFinite` は値を変換しないので、文字列も Infinity も 0 になる。**負も 0 へ** (パス 408) ——
    // ファイルの大きさに負は無いので壊れた応答であり、実測で `size: -1e300` は `-9.5367431640625e+293 MB` を画面に刷っていた。
    const size = hostField(item, 'size');
    const sizeBytes = nonNegativeBytes(size);
    const details = hostField(item, 'details');
    out.push({ name, family: modelDetail(hostField(details, 'family')), parameterSize: modelDetail(hostField(details, 'parameter_size')), quantization: modelDetail(hostField(details, 'quantization_level')), sizeMb: Math.round(sizeBytes / (1024 * 1024)), modifiedAt: displayDateOf(hostField(item, 'modified_at')) });
  }
  return out;
}

/** ファイルの大きさ (バイト)。数でない・有限でない・負は 0。 */
function nonNegativeBytes(size: unknown): number {
  if (typeof size !== 'number') return 0;
  if (!Number.isFinite(size)) return 0;
  return Math.max(0, size);
}

/** エラー封筒 `{"error": "…"}` から本文を取り出す。取れなければ空文字。 */
export function extractOllamaError(json: unknown, text: string = ''): string {
  const err = hostField(json, 'error');
  // 空判定は要らない — 空白だけの本文は trim すると '' になり、下へ落としても最後は '' を返す。
  if (typeof err === 'string') return redactForMessage(err.trim(), MAX_LOCAL_MODEL_ERROR_CHARS);
  // 稀に {"error": {"message": "…"}} の入れ子で返す経路もある。
  const nested = hostField(err, 'message');
  if (typeof nested === 'string') return redactForMessage(nested.trim(), MAX_LOCAL_MODEL_ERROR_CHARS);
  // JSON として読めたのに error が無いなら、本文を出しても情報がない。
  if (json !== null && json !== undefined) return '';
  // JSON ですらない本文 (Ollama が素の "Forbidden" を返す経路など) は短く返す。
  // Stryker disable next-line StringLiteral: 型は string だが JS の呼び手は undefined を渡しうる。その場合の '' は番人の値でも伏字の後は空に等しい詳細なし (観測できない)。
  return redactForMessage((text ?? '').trim(), MAX_LOCAL_MODEL_ERROR_CHARS);
}

/**
 * 種類: model-not-found (指定したモデルが未取得) / out-of-memory (端末の空きメモリより大きい) /
 * runner-failed (推論プロセスが落ちた: 壊れたモデル・GPU ドライバ等) / forbidden-origin (OLLAMA_ORIGINS 未設定で拒否) /
 * no-such-endpoint (そのパスが無い: 古い Ollama・前段のプロキシ) / unknown。
 */
export type OllamaErrorKind =
  | 'model-not-found'
  | 'out-of-memory'
  | 'runner-failed'
  | 'forbidden-origin'
  | 'no-such-endpoint'
  | 'unknown';

/** ステータスとエラー本文から種類を判定する。 */
export function classifyOllamaError(status: number, detail: string): OllamaErrorKind {
  // Stryker disable next-line StringLiteral: detail 省略時の '' はどの正規表現にも当たらない。番人の値を入れても同じく当たらないので観測できない。
  const d = (detail ?? '').toLowerCase();
  if (/not found, try pulling it first|model .* not found|no such model/.test(d)) return 'model-not-found';
  if (/more system memory|out of memory|insufficient memory|not enough memory/.test(d)) return 'out-of-memory';
  if (/runner process has terminated|llama runner|error loading model|failed to load model/.test(d)) return 'runner-failed';
  if (status === 403) return 'forbidden-origin';
  if (status === 404) return 'no-such-endpoint';
  return 'unknown';
}

/** `model "llama3" not found, try pulling it first` からモデル名を取り出す。 */
export function extractMissingModel(detail: string): string {
  // Stryker disable next-line StringLiteral: detail 省略時の '' はこの正規表現に当たらない。番人の値でも当たらないので既定値そのものは観測できない。
  const m = /model\s+["'“”`]?([A-Za-z0-9._:/-]+)["'“”`]?\s+not found/i.exec(detail ?? '');
  if (m === null) return '';
  const name = m[1];
  return isSafeModelName(name) ? name : '';
}

/** `n` の `:` より前 (タグを除いた名前)。`split(':')[0]` と同じ答え (改行を含む名前でも途中で切れない)。 */
function baseOf(n: string): string {
  const lower = n.toLowerCase();
  const colon = lower.indexOf(':');
  return colon === -1 ? lower : lower.slice(0, colon);
}

/**
 * 指定されたモデル名に近い **インストール済み** モデルを 1 つ提案する。
 * `llama3.2` と入力したが実体は `llama3.2:latest`、といった食い違いが実運用でいちばん多いので、
 * タグ補完 → 前方一致 の順に見る。無ければ空文字。
 */
export function suggestInstalledModel(requested: string, installed: string[]): string {
  // Stryker disable next-line StringLiteral: requested 省略時の '' は直後の `want === ''` で早期に抜け、番人の値でも一覧に一致せず '' を返す。
  const want = (requested ?? '').trim().toLowerCase();
  if (want === '') return '';
  // 空文字は後段のどの比較にも一致しないので、除外の判定は結果を変えない。
  // Stryker disable next-line ArrayDeclaration: installed 省略時の [] は「候補なし」。番人の要素が入っても要求名に一致しないので、どちらも '' を返す。
  const list = (installed ?? []).filter((n) => typeof n === 'string');
  if (list.some((n) => n.toLowerCase() === want)) {
    return '';
    // 一致しているなら提案不要
  }
  const base = baseOf(want);
  return list.find((n) => n.toLowerCase() === want + ':latest') ?? list.find((n) => baseOf(n) === base) ?? list.find((n) => n.toLowerCase().startsWith(base)) ?? '';
}

export interface OllamaErrorAdvice {
  kind: OllamaErrorKind;
  /** Ollama が返した生のエラー文 (無ければ空)。ログ・詳細表示用。 */
  detail: string;
  /** 利用者向けの 1 行説明。 */
  message: string;
  /** 次にやること。順序に意味がある (上から試す)。 */
  hints: string[];
}

/** 種類ごとの説明と「次の一手」の対。 */
interface OllamaAdviceText {
  message: string;
  hints: string[];
}

function adviceModelNotFound(requested: string, detail: string, installed: string[]): OllamaAdviceText {
  const name = requested || extractMissingModel(detail) || '(不明)';
  const near = suggestInstalledModel(name, installed);
  const hints: string[] = [];
  if (near !== '') {
    hints.push('インストール済みの「' + near + '」を指定すると動きます。');
  }
  hints.push('取得する: ollama pull ' + name);
  if (installed.length > 0) {
    hints.push('現在あるモデル: ' + installed.join(', '));
  } else {
    hints.push('まだ 1 つもモデルがありません。例: ollama pull llama3.2');
  }
  return { message: 'モデル「' + name + '」がまだ取得されていません。', hints };
}

function adviceRunnerFailed(requested: string): OllamaAdviceText {
  const target = requested || '<モデル>';
  return { message: '推論プロセスが起動できませんでした (モデル破損 / GPU ドライバの可能性)。', hints: ['モデルを取り直す: ollama rm ' + target + ' && ollama pull ' + target, 'Ollama を再起動する', 'CPU で動かす: OLLAMA_NUM_GPU=0 ollama serve'] };
}

function adviceUnknown(status: number, detail: string): OllamaAdviceText {
  const hints: string[] = [];
  if (detail !== '') {
    hints.push(detail);
  }
  return { message: 'Ollama が HTTP ' + status + ' を返しました。', hints };
}

/** 種類ごとの説明と「次の一手」(describeOllamaError が使う)。 */
function adviceFor(kind: OllamaErrorKind, status: number, detail: string, requested: string, installed: string[]): OllamaAdviceText {
  switch (kind) {
    case 'model-not-found':
      return adviceModelNotFound(requested, detail, installed);
    case 'out-of-memory':
      return { message: 'モデルが大きすぎて、この端末の空きメモリに載りませんでした。', hints: ['より小さいモデルを試す (例: llama3.2:1b / qwen2.5:0.5b)', '量子化の強い版を選ぶ (Q4_K_M など)', '他のアプリを閉じて空きメモリを増やす'] };
    case 'runner-failed':
      return adviceRunnerFailed(requested);
    case 'forbidden-origin':
      return { message: 'Ollama にリクエストは届きましたが、接続元が許可されていません。', hints: ['Ollama 側に OLLAMA_ORIGINS を設定して再起動してください。'] };
    case 'no-such-endpoint':
      return { message: 'Ollama がそのエンドポイントを知りません (HTTP ' + status + ')。', hints: ['Ollama のバージョンが古い可能性があります (ollama --version)。', '別のサーバがそのポートを使っていないか確認してください。'] };
    case 'unknown':
      return adviceUnknown(status, detail);
  }
}

/**
 * HTTP エラー応答を利用者向けの説明へ変換する。
 *
 * status: HTTP ステータス / detail: extractOllamaError の結果 / ctx.model: リクエストで指定したモデル名 (chat のとき) /
 * ctx.installed: /api/tags で取れたモデル名一覧 (あれば提案に使う)
 */
export function describeOllamaError(status: number, detail: string, ctx: { model ?: string; installed ?: string[] } = {}): OllamaErrorAdvice {
  const kind = classifyOllamaError(status, detail);
  const requested = ctx.model ?? extractMissingModel(detail);
  const installed = ctx.installed ?? [];
  const advice = adviceFor(kind, status, detail, requested, installed);
  return { kind, detail: detail ?? '', message: advice.message, hints: advice.hints };
}

/**
 * HTTP エラー応答の **生本文** から直接 advice を作る。
 * 呼び出し側 (main / CLI) が JSON.parse を各自で書くと、パース失敗時の扱いがばらつくので入口を 1 つにする。
 * 本文が空・非 JSON でも必ず結果を返す。
 */
export function adviseFromBody(status: number, body: string, ctx: { model ?: string; installed ?: string[] } = {}): OllamaErrorAdvice {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body);
    // Stryker disable BlockStatement: parsed は null で初期化済みなので、catch の中の代入を消しても答えは同じ (等価)。
  } catch {
    parsed = null;
  }
  // Stryker restore BlockStatement
  return describeOllamaError(status, extractOllamaError(parsed, body), ctx);
}

/**
 * バージョンから警告リストを組み立てる (UI 表示順を固定するため純関数化)。
 * **両ビルドで 1 つ** —— main も browser もこれを呼ぶ。当てはまる項目は **名指し**する
 * (「既知の脆弱性が修正された X 未満」と丸めない —— どの CVE がその版に当てはまるかを利用者が読める)。
 */
export function buildWarnings(version: string, now: Date = hostNewDate(), ledger: readonly OllamaAdvisory[] = OLLAMA_ADVISORIES): string[] {
  const warnings: string[] = [advisoryLedgerNotice(now, ledger)];
  const applicable = applicableAdvisories(version, ledger);
  if (applicable.length > 0) {
    // **番号だけ読めば足りて見える版には、なぜ足りないかを言う** (パス 402)。これを言わないと `0.31.2-rc1` の利用者は
    // 「0.31.2 で修正・0.31.2 以上へ」を読んで、自分は 0.31.2 だと思う —— 紙の上で矛盾した文になる。
    const looksEnough = applicable.some((a) => prereleaseIsBelowFloor(version, a.fixedIn));
    const named = applicable.map((a) => a.id + ' (' + a.summary + '・' + a.fixedIn + ' で修正)').join(' / ');
    warnings.unshift('検出された Ollama ' + version + ' には既知の脆弱性 ' + applicable.length + ' 件が当てはまります: ' + named + '。' + MIN_SAFE_VERSION + ' 以上へ更新してください。' + (looksEnough ? 'プレリリースは対応する正式版より前なので、番号が同じでも修正が入っているとは限りません。' : ''));
  }
  return warnings;
}
