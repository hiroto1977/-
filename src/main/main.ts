import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import {
  clearToken,
  getStorageProtection,
  getValidToken,
  listConfiguredServices,
  setOAuthTokens,
  setToken,
} from './secrets';
import { LIVE_ACTIONS, LIVE_FETCHERS, LOCAL_SERVICES, type ServiceId } from './clients';
import { authorize, isOAuthSupported, OAUTH_CONFIGS } from './oauth';
import { repairExportPermissions } from './clients/exportPaths';
import { isServiceId } from '../shared/serviceId';
import { checkTokenInput } from '../shared/tokenInput';
import type { OsOpResult, TokenSaveResult } from '../preload/preload';
import { safeErrorMessage } from './clients/types';
import { externalUrlOrNull } from '../shared/externalUrlGate';
import { shellTargetOrNull } from './shellOpenGate';
import { evaluateUpdate, parseLatestRelease, type UpdateVerdict } from '../shared/updateCheck';
import { MAX_HTTP_RESPONSE_BYTES, readBodyWithCap } from '../shared/httpLimits';

const isDev = !app.isPackaged;

// In dev: build/icon.png at repo root. In production: shipped at app
// resource root via electron-builder.files (… actually we ship through
// asar; safer to load from the source path which is relative to __dirname).
function iconPath(): string {
  // dist-electron/main.js → ../build/icon.png in dev,
  // <appdir>/resources/app.asar/build/icon.png in prod.
  return path.join(__dirname, '..', 'build', 'icon.png');
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Service Hub',
    backgroundColor: '#0f1117',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      /*
       * **Electron の既定は `true`。** 綴り検査が要る場面がこのアプリに無い
       * のに、hunspell の辞書は Google がホストする CDN から取りに行く
       * 設計なので、既定のままだと「打ち始めたら外へ出る」経路を 1 本
       * 抱えることになる。ブラウザ版には e2e の `noBeacon` 節で
       * 「開いただけで外へ出ていかない」を留めてあるが、**デスクトップ版に
       * 同じ主張は無かった**。
       *
       * **正直に書く**: 2026-08-25 に実測した範囲では、`<textarea
       * spellcheck="true">` へ実キーイベントで綴り誤りを 56 文字打ち込み
       * 6 秒待っても、`session.webRequest` から見える取得は **0 件**だった。
       * ただし Chromium の部品更新系の取得は `webRequest` を通らないことが
       * あるので、**「起きない」ことを測り切れてはいない**。
       *
       * 日本語の入力は hunspell の対象外で、英字で打つのは URL と資格情報
       * ばかり —— 綴り検査が付いても波線が出るだけで役に立たない。
       * **得るものが無く、閉じ切れない経路が 1 本残る**ので切る。
       */
      spellcheck: false,
    },
  });

  /**
   * レンダラーへ許すブラウザ権限。**Electron の既定は「全部承認」である。**
   *
   * Electron の security checklist #5 —— ハンドラを置かない限り、
   * `session` は権限要求を自動で承認する。この窓が読むのは同梱した
   * `dist/index.html` だけで、遷移も `will-navigate` で止めてあるが、
   * **万一レンダラーへ任意コードが入った場合に、マイク・カメラ・位置情報が
   * 確認なしで開くかどうか**はここで決まる。既定のままだと開く。
   *
   * 許すのはクリップボードの 2 つだけ:
   *
   * - `clipboard-read` —— `LockScreen.tsx` が**復元フレーズを 30 秒後に
   *   消す**ために使う。「まだ自分がコピーした値のままか」を読んでから
   *   空にするので、読めないと**消せずに残る**。security のための読み取り。
   * - `clipboard-sanitized-write` —— 上の消去と、各画面のコピーボタン。
   *
   * それ以外 (media / geolocation / notifications / midi / display-capture /
   * hid / serial / usb / idle-detection / window-management …) は**全部拒否**。
   * このアプリはどれも使っていない (実測: `getUserMedia` 0 件・
   * `geolocation` 0 件・`new Notification` 0 件)。`SpeechRecognition` は
   * ブラウザ版だけで動くもので、Electron には実装が無い。
   */
  const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
  ]);
  /**
   * 判定は**ここ 1 つ**。要求側 (`setPermissionRequestHandler`) と
   * 問い合わせ側 (`setPermissionCheckHandler`) の 2 つの口があり、
   * 両方が同じ答えを返さないと `navigator.permissions.query()` が
   * 「granted」と言った権限を実際の要求が拒否する (逆もある)。
   * 同じ判断を 2 度書かない —— `externalUrlGate.ts` の扉と同じ理由。
   */
  const permissionAllowed = (permission: string): boolean => ALLOWED_PERMISSIONS.has(permission);
  /*
   * **綴り検査は session 側でも切る。**
   *
   * `webPreferences.spellcheck: false` は **webContents ごと**の設定で、
   * `session.isSpellCheckerEnabled()` には現れない (実測: 未設定でも
   * `spellcheck: false` でも `true` を返す)。**片方だけでは「切れている」
   * ことを外から確かめられない。** session 側も切ると観測可能になり、
   * 窓を増やしたときの取りこぼしも無くなる。
   *
   * 最初は webPreferences だけ入れて「効いていない」と読み違えかけた ——
   * **見ていた物が、設定した物と違っていた。**
   */
  win.webContents.session.setSpellCheckerEnabled(false);

  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permissionAllowed(permission));
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => permissionAllowed(permission));

  win.webContents.setWindowOpenHandler(({ url }) => {
    // IPC の扉と**同じ関門**を通す。以前ここは手書きの http(s) 判定で、
    // 関門の許可表を締めてもこちらだけ古い規則のまま開いた
    // (対照実験は externalUrlGate.ts の頭に記録)。
    const target = externalUrlOrNull(url);
    if (target !== null) shell.openExternal(target);
    return { action: 'deny' };
  });

  // Block all in-app navigation away from the loaded renderer; this
  // includes the renderer trying to navigate via window.location.
  //
  // The Vite HMR exemption is gated on dev: in a packaged build nothing of ours
  // listens on 5173, so leaving it open only let a compromised renderer aim the
  // main window at whatever local process happened to hold that port
  // (2026-07 audit). `will-redirect` gets the same treatment — otherwise a 3xx
  // during an allowed navigation would land somewhere unvetted.
  /**
   * 解析できなかった URL を**空文字**にする。`origin` は絶対に空文字にならない
   * ので、「読めた」と「読めなかった」が値の上で混ざらない。
   *
   * 制御の流れ (try/catch から抜けたか) で表していた頃は、catch の中身を空に
   * しても暗黙の `undefined` が返り、呼び出し側からは `false` と見分けが
   * 付かなかった — **守りを外しても誰も気付けない形**だった。読めなかったことを
   * 値で表すと、下の `target !== ''` がそれを見て落とせる。
   */
  const originOrEmpty = (url: string): string => {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  };
  /**
   * 実際に読み込んだ開発サーバの **origin** (scheme + host + port) とだけ
   * 突き合わせる。
   *
   * 2026-08-22 の点検まで `u.host === 'localhost:5173'` で見ていたが、`host` に
   * **スキームは入らない**。`https://localhost:5173/` も `ftp://localhost:5173/`
   * も同じ host なので素通りしていた — 「そのポートを握った別のプロセスへ窓を
   * 向けられないようにする」というこの例外の目的が、平文 http の相手にしか
   * 効いていなかった。ポートの決め打ちも外した (5173 が埋まると Vite は次の
   * 空き番へずれるので、通すべき本物を止めて通すべきでない相手を通しうる)。
   */
  const allowNavigation = (navigationUrl: string): boolean => {
    const devServer = process.env.VITE_DEV_SERVER_URL;
    if (!isDev || !devServer) return false;
    const target = originOrEmpty(navigationUrl);
    // 空文字どうしを「一致」と読まない。開発サーバの URL 自体が壊れていると、
    // 同じく壊れた遷移先が「同じ origin」に見えて通ってしまう。
    return target !== '' && target === originOrEmpty(devServer);
  };
  const guardNavigation = (event: { preventDefault: () => void }, navigationUrl: string): void => {
    if (allowNavigation(navigationUrl)) return;
    event.preventDefault();
  };
  win.webContents.on('will-navigate', guardNavigation);
  win.webContents.on('will-redirect', guardNavigation);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  createWindow();

  /*
   * 既に書き出されているファイルの緩い権限を一度だけ均す。
   *
   * `writeExportFile` は書くたびに 0600 へ直すが、**書き出しは「一度作って
   * それきり」になりうる**ので、それだけでは既存の 0644 が永遠に残る
   * (状態ファイルは保存のたびに書き換わるので、あちらは次の書き込みで足りる)。
   *
   * 窓を出してから走らせる —— 起動を待たせる価値のある処理ではない。
   * 失敗しても起動は続ける (権限を直せないことは、アプリが使えない理由にならない)。
   */
  void repairExportPermissions().catch(() => undefined);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app:getVersion', () => app.getVersion());

/**
 * 更新の有無を調べる。**取得もインストールもしない。**
 *
 * 署名と公証が入るまで自動更新は入れない (署名の無い配布物を自動で取得して
 * 実行する経路は、トークンを持つこのアプリでは新しいコード実行の入口になる)。
 * ここでやるのは公開されている最新版の版番号を読むことだけで、
 * ダウンロードは利用者がリリースページを開いて行う。
 *
 * 送り先は定数。応答は `parseLatestRelease` が形と URL のホストまで確かめる
 * ので、応答を差し替えられても任意の URL を案内先にはできない。
 */
ipcMain.handle('app:checkUpdate', async (): Promise<UpdateVerdict> => {
  const current = app.getVersion();
  try {
    const res = await fetch('https://api.github.com/repos/hiroto1977/-/releases/latest', {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return evaluateUpdate(current, null);
    // 本文は上限つきで読む。ブラウザ版の同じ口 (`web-shim.ts` の `checkUpdate`)
    // は `readCappedText` を通しているのに、**こちらだけ `res.json()` の
    // 素通しだった** (2026-08-31)。宛先は定数で https だが、同じ問いに答えが
    // 2 つある状態を残さない —— 実行対象が違うだけで判断が変わる理由が無い。
    return evaluateUpdate(
      current,
      parseLatestRelease(JSON.parse(await readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, 'update'))),
    );
  } catch {
    // 通信できない・応答が JSON でない等はすべて「判定不能」に寄せる。
    // 更新の確認が失敗してアプリが使えなくなる理由は無い。
    return evaluateUpdate(current, null);
  }
});
ipcMain.handle('app:openExternal', async (_e, url: unknown) => {
  // Defense-in-depth: the renderer is sandboxed and contextIsolated,
  // but the IPC channel accepts any value. 関門は `externalUrlGate.ts` に
  // 1 つだけ置く —— 新窓ハンドラも同じものを通る。
  const target = externalUrlOrNull(url);
  if (target === null) return;
  // `shell` は OS 側が開けないと **reject する** (既定ブラウザ未設定、
  // Linux で xdg-open が無い等)。この口の約束は `Promise<void>` で、
  // レンダラー側に受け皿が無い —— reject をそのまま返すと呼び出し元で
  // 未処理の rejection になる。握り潰さず、main の記録には残す
  // (`secrets.ts` と同じ扱い。GUI 利用者には見えないが、不具合報告の
  // ログには出る)。
  try {
    await shell.openExternal(target);
  } catch (e) {
    console.error(`[openExternal] OS が URL を開けませんでした: ${safeErrorMessage(e)}`);
  }
});

// 開く側の関門は `shellOpenGate.ts` に 1 つだけ置く (書き出し側の
// `exportPaths.ts` と対になる)。ここに直接書いていた頃はテストが一本も無かった。
const REJECTED_PATH_MESSAGE =
  '指定されたパスは開けません。書き出し先の外にあるか、対応していない拡張子です。';

ipcMain.handle('app:revealInFolder', async (_e, filePath: unknown): Promise<OsOpResult> => {
  // Reveal a saved file in the OS file manager (Finder / Explorer / Nautilus).
  // 弾いた時・失敗した時は理由を返す。黙って `undefined` を返すと、呼び出し側は
  // 握り潰すしかなく「押しても何も起きない」画面になる。
  try {
    const target = await shellTargetOrNull(filePath);
    if (target === null) return { ok: false, message: REJECTED_PATH_MESSAGE };
    shell.showItemInFolder(target);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: safeErrorMessage(e) };
  }
});

ipcMain.handle('app:openPath', async (_e, filePath: unknown): Promise<OsOpResult> => {
  // Open a file with the OS default application (SVG → image viewer,
  // HTML → browser, MD → text editor, etc.). Same gate as revealInFolder.
  //
  // `shell.openPath` は成功で空文字、失敗でエラー文字列を返す契約。監査前は
  // その戻り値を捨てていたため (契約はこのコメントに書いてあった)、関連付けの
  // 無いファイル種別などで開けなくても呼び出し側には成功と見えていた。
  try {
    const target = await shellTargetOrNull(filePath);
    if (target === null) return { ok: false, message: REJECTED_PATH_MESSAGE };
    const failure = await shell.openPath(target);
    return failure === '' ? { ok: true } : { ok: false, message: failure };
  } catch (e) {
    return { ok: false, message: safeErrorMessage(e) };
  }
});

// 弾いた理由を **返す**。以前は `return;` で黙って捨てており、renderer からは
// 保存できた場合と区別が付かなかった (上限超えの貼り付けが「保存した」ように
// 見えていた)。規則は shared/tokenInput.ts に 1 つだけ置く。
ipcMain.handle('secrets:set', async (_e, serviceId: unknown, token: unknown): Promise<TokenSaveResult> => {
  if (!isServiceId(serviceId)) {
    return { ok: false, code: 'invalid_service', message: 'unknown service id' };
  }
  const checked = checkTokenInput(token);
  if (!checked.ok) {
    return { ok: false, code: 'invalid_token', message: checked.message };
  }
  try {
    await setToken(serviceId, checked.value);
  } catch (e) {
    // **ここも伏字の合流点を通す。** 13 本のハンドラのうち、生の `e.message` を
    // 返していたのはここだけだった —— しかも**資格情報が生きている唯一の
    // ハンドラ**である。今日の `setToken` は fs エラー (userData のパスが載る)
    // しか投げないが、片側だけ関門の外に居る状態を残さない。
    // `safeErrorMessage` は伏字に加えて長さも切る。
    //
    // **この「13 本のうち」という数え方は足りなかった (2026-08-23)。**
    // ハンドラの `message` 欄は数えたが、**ハンドラが返す*データの中*に載る
    // 文言**を数えていない。実測すると 2 経路が関門の外に居た:
    //   action:invoke  → assistant.chatAll の `answers[].error`
    //   fetch:snapshot → ollama スナップショットの `warnings[]`
    // どちらも `sk-ant-...` を含む例外を**逐語で** renderer へ渡していた。
    // 数える単位は「ハンドラ」ではなく **「外へ出る値に載る文言」**である。
    // `main/__tests__/rendererBoundMessages.test.ts` が実測で留めている。
    return { ok: false, code: 'write_failed', message: safeErrorMessage(e) };
  }
  return { ok: true };
});
ipcMain.handle('secrets:clear', async (_e, serviceId: unknown): Promise<OsOpResult> => {
  if (!isServiceId(serviceId)) return { ok: false, message: 'unknown service id' };
  // 削除の失敗を黙ると「消したつもりの資格情報が残っている」状態になる。
  try {
    await clearToken(serviceId);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: safeErrorMessage(e) };
  }
});
ipcMain.handle('secrets:list', () => listConfiguredServices());
// Read-only report of at-rest protection. Returns no secret material — only
// whether the OS keychain is usable, how many values are still `plain:`, and the
// file path — so the UI can warn the user instead of degrading silently.
ipcMain.handle('secrets:protection', () => getStorageProtection());

ipcMain.handle('fetch:snapshot', async (_e, serviceId: unknown) => {
  if (!isServiceId(serviceId)) {
    return { ok: false, code: 'not_implemented', message: 'unknown service id' };
  }
  // Object.hasOwn() avoids prototype-chain lookups even though the
  // serviceId guard above already covers this.
  const fetcher = Object.hasOwn(LIVE_FETCHERS, serviceId)
    ? LIVE_FETCHERS[serviceId as ServiceId]
    : undefined;
  if (!fetcher) {
    return { ok: false, code: 'not_implemented', message: `${serviceId} はライブフェッチ未対応` };
  }
  // LOCAL_SERVICES (e.g. 'skills', 'security') read primarily from disk
  // and must work without a saved token. We still pass any saved token
  // through — security uses it for opt-in HIBP/VT enrichment.
  // 資格情報の読み出しは try の**中**で行う。以前は外にあったため、
  // `safeStorage.decryptString` が壊れた値で throw すると IPC ハンドラごと
  // reject し、renderer 側 (`useServiceData`) は「読込中…」のまま止まっていた。
  let token = '';
  try {
    const read = await getValidToken(serviceId);
    if (!read.ok) {
      // LOCAL_SERVICES は資格情報なしでも動くので、読めないことは異常ではない。
      // ただし「保存済みだが復号できない」場合はローカルでも黙らない。
      if (read.reason === 'undecryptable') {
        return { ok: false, code: 'not_configured', message: read.message };
      }
      if (!LOCAL_SERVICES.has(serviceId)) {
        return { ok: false, code: 'not_configured', message: 'トークン未設定' };
      }
    } else {
      token = read.token;
    }
  } catch (err) {
    return { ok: false, code: 'fetch_failed', message: safeErrorMessage(err) };
  }
  try {
    const data = await fetcher({ token });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, code: 'fetch_failed', message: safeErrorMessage(err) };
  }
});

ipcMain.handle(
  'action:invoke',
  async (_e, serviceId: unknown, action: unknown, payload: unknown) => {
    if (!isServiceId(serviceId)) {
      return { ok: false, code: 'action_not_found', message: 'unknown service id' };
    }
    if (typeof action !== 'string' || action.length === 0 || action.length > 64) {
      return { ok: false, code: 'action_not_found', message: 'invalid action name' };
    }
    const actions = Object.hasOwn(LIVE_ACTIONS, serviceId)
      ? LIVE_ACTIONS[serviceId as ServiceId]
      : undefined;
    const fn = actions && Object.hasOwn(actions, action) ? actions[action] : undefined;
    if (!fn) {
      return {
        ok: false,
        code: 'action_not_found',
        message: `${serviceId} に action "${action}" は登録されていません`,
      };
    }
    // fetch:snapshot と同じ理由で try の中に入れる。
    let token: string;
    try {
      const read = await getValidToken(serviceId);
      if (!read.ok) {
        return {
          ok: false,
          code: 'not_configured',
          message: read.reason === 'undecryptable' ? read.message : 'トークン未設定',
        };
      }
      token = read.token;
    } catch (err) {
      return { ok: false, code: 'action_failed', message: safeErrorMessage(err) };
    }
    // Validate payload is a plain object, not an array / primitive / null
    const safePayload =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    try {
      const data = await fn({ token, payload: safePayload });
      return { ok: true, data };
    } catch (err) {
      return { ok: false, code: 'action_failed', message: safeErrorMessage(err) };
    }
  },
);

ipcMain.handle('oauth:isSupported', (_e, serviceId: unknown) =>
  isServiceId(serviceId) ? isOAuthSupported(serviceId) : false,
);

// ランタイム クライアント ID の妥当性 (英数・ドット・ハイフン・アンダースコア、8〜200 文字)。
// Entra の GUID / Google の *.apps.googleusercontent.com の双方を許容しつつ、
// 制御文字・空白などの混入を IPC 境界で拒否する。
const CLIENT_ID_RE = /^[A-Za-z0-9._-]{8,200}$/;

ipcMain.handle('oauth:authorize', async (_e, serviceId: unknown, clientIdOverride?: unknown) => {
  if (!isServiceId(serviceId)) {
    return { ok: false, code: 'not_supported', message: 'unknown service id' };
  }
  const baseConfig = Object.hasOwn(OAUTH_CONFIGS, serviceId)
    ? OAUTH_CONFIGS[serviceId as ServiceId]
    : undefined;
  // 環境変数未設定でも、UI から渡されたクライアント ID で実行できる (アプリ内かんたん接続)。
  const override =
    typeof clientIdOverride === 'string' && CLIENT_ID_RE.test(clientIdOverride.trim())
      ? clientIdOverride.trim()
      : '';
  const config = baseConfig
    ? { ...baseConfig, clientId: override || baseConfig.clientId }
    : undefined;
  if (!config || !config.clientId) {
    return {
      ok: false,
      code: 'not_supported',
      message: 'このサービスは OAuth 未対応、または OAuth クライアント ID 未設定',
    };
  }
  try {
    const tokens = await authorize(config);
    await setOAuthTokens(serviceId, tokens);
    return { ok: true, data: { scope: tokens.scope, expiresAt: tokens.expiresAt } };
  } catch (err) {
    return { ok: false, code: 'authorize_failed', message: safeErrorMessage(err) };
  }
});
