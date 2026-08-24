import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CARD = readFileSync(
  path.join(REPO_ROOT, 'src/renderer/components/GoogleConnectCard.tsx'),
  'utf8',
);

/*
 * **トークンの保存方法について画面が言うこと**を留める。
 *
 * 2026-08-22 まで `GoogleConnectCard` は
 *
 *     「トークンは OS キーチェーンに暗号化保存されます。」
 *
 * と**条件なしで**書いていた。これは 2 通りに誤っていた:
 *
 *   1. **ブラウザ版には OS キーチェーンが無い。** このカードは
 *      Gmail / Calendar / Drive の各ページに出ており、その 3 ページは
 *      両方のビルドに載る。ブラウザ版の保存先は WebCrypto Vault
 *      (IndexedDB) である
 *   2. **デスクトップ版でもキーチェーンが無い環境がある。**
 *      gnome-keyring / kwallet 不在の Linux では `secrets.ts` が
 *      `plain:` 接頭辞つきの **base64 難読化**へ落とす (暗号化ではない)
 *
 * `secrets.ts` 自身は正直で、コンソールにも「NOT real encryption」と出すし、
 * 「設定」ページは実際の状態を `storageProtection()` で問い合わせて出している。
 * **嘘をついていたのはカードの地の文だけ**だった —— 利用者が
 * 「トークンを貼ってよいか」を判断する、まさにその場所である。
 *
 * ここは live な状態を再実装しない (それをやると 3 ページぶん増えて、
 * このリポジトリで何度も直している「同じ判断の N 実装」になる)。
 * 代わりに**条件つきで正しいことを書き、実際の状態は「設定」へ送る**。
 */
describe('トークン保存の説明が、環境によらず正しいこと', () => {
  it('「OS キーチェーンに暗号化保存されます」と断言していない', () => {
    // 条件を伴わない断言だけを禁じる。語そのものは正しい文にも出る。
    expect(CARD).not.toMatch(/トークンは\s*OS\s*キーチェーンに\s*暗号化保存されます/);
  });

  it('キーチェーンが無い環境では難読化のみ、と書いてある', () => {
    expect(CARD).toContain('base64 の難読化のみ');
  });

  it('ブラウザ版の保存先 (Vault) にも触れている', () => {
    expect(CARD).toMatch(/ブラウザ版は\s*Vault/);
  });

  it('実際の状態の確認先を案内している', () => {
    expect(CARD).toMatch(/設定/);
  });
});

/*
 * **同じ断言が他の画面へ増えていないか。**
 *
 * 直したのは 1 か所だが、次に誰かが別のカードへ同じ一文を書くと元に戻る。
 * レンダラー全体を走査して、条件を伴わない断言が無いことを見る。
 */
describe('同じ断言が他の画面に無い', () => {
  function tsxFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') tsxFiles(p, out);
        continue;
      }
      if (name.endsWith('.tsx')) out.push(p);
    }
    return out;
  }

  /*
   * **判定は「ファイルに但し書きが在るか」ではなく、断言そのものを見る。**
   *
   * 最初これを「キーチェーンと暗号化保存が近接し、かつファイル内に『難読化』
   * が無ければ違反」と書いた。すると**直した文が 1 つ在るだけでファイル全体が
   * 免除**され、同じファイルへ断言を足しても鳴らなかった (対照実験で判明)。
   * 「守っているつもりの守り」なので、出現ごとに見る形へ直した。
   */
  /*
   * **文言を 1 つ留めても、別の言い回しは素通りする。** (2026-08-23)
   *
   * この正規表現は「トークンは OS キーチェーンに暗号化保存されます」を
   * 見ていた。`SettingsPage` の保存状態カードは
   *
   *   「トークンは OS の**キーチェーン由来の鍵で**暗号化して保存されています」
   *
   * と書いており、**同じ主張なのに当たらなかった**。ブラウザ版の
   * `storageProtection` は `encrypted: true` を固定で返すので、この一文が
   * **常に**出ていた —— ブラウザに OS キーチェーンは無いのに。
   *
   * 0-a-17 と同じ形である: 特定の字面で判定すると、言い換えで抜ける。
   * **主張の単位** —— 「キーチェーンが鍵を握っていると読める文」——
   * で見るように広げた。
   */
  const UNCONDITIONAL = /トークンは\s*OS\s*キーチェーンに\s*暗号化保存されます/g;

  it('断言そのものが、どの画面にも 1 つも無い', () => {
    const offenders: string[] = [];
    for (const f of tsxFiles(path.join(REPO_ROOT, 'src/renderer'))) {
      const text = readFileSync(f, 'utf8');
      const hits = text.match(UNCONDITIONAL);
      if (hits) offenders.push(`${path.relative(REPO_ROOT, f)} (${hits.length})`);
    }
    expect(offenders, `条件なしの断言が残っている: ${offenders.join(', ')}`).toEqual([]);
  });

  it('直した文が在るファイルでも、断言を足せば鳴る (免除されない)', () => {
    // 実ファイルではなく文字列で規則そのものを確かめる —— 「但し書きが在るから
    // 免除」に戻っていないことを、ファイルの中身に依存せず留める。
    const corrected =
      'トークンの保存方法はビルドと環境で変わります… base64 の難読化のみ になります。';
    const withBoth = corrected + 'トークンは OS キーチェーンに暗号化保存されます';
    expect(corrected.match(UNCONDITIONAL)).toBeNull();
    expect(withBoth.match(UNCONDITIONAL)).toHaveLength(1);
  });

  it('走査が空振りしていない (実ファイルを読めている)', () => {
    expect(tsxFiles(path.join(REPO_ROOT, 'src/renderer')).length).toBeGreaterThan(20);
  });
});

/*
 * **同じ画面が矛盾したことを言っていないか。**
 *
 * `OllamaPage` は「接続設定」で接続先の入力欄を出しながら (プレースホルダは
 * `192.168.1.10:11434` / `https://xxx.trycloudflare.com` を勧める)、
 * 同じページの「セキュリティポリシー」で
 *
 *     🔒 接続先は http://127.0.0.1:11434 に **ハードコード** (他ホストへの送信不可)
 *
 * と書いていた (2026-08-23 まで)。前者はブラウザ版で実際に効く ——
 * **入力欄が在る画面が「変更できない」と言っていた**。
 *
 * 断言そのものは正しい文にも出る (デスクトップ版の話としては真) ので、
 * 「ブラウザ版は変更できる」という打ち消しが同居していることを要求する。
 */
describe('Ollama 画面が、接続先について矛盾したことを言っていない', () => {
  const PAGE = readFileSync(
    path.join(REPO_ROOT, 'src/renderer/pages/OllamaPage.tsx'),
    'utf8',
  );

  it('接続先の入力欄がある (前提)', () => {
    expect(PAGE).toMatch(/aria-label="Ollama の接続先"/);
  });

  it('入力欄がある以上、「変更できない」で終わっていない', () => {
    // 「ハードコード」と書くなら、ブラウザ版で変更できることも同じ画面に在ること。
    if (PAGE.includes('ハードコード')) {
      expect(PAGE, 'ハードコードとだけ書いて、変更できる旨が無い').toMatch(
        /ブラウザ版は[^。]*変更できる/,
      );
    }
  });

  it('許可される 3 経路を、ポリシー欄でも説明している', () => {
    expect(PAGE).toMatch(/①同じ端末/);
    expect(PAGE).toMatch(/②このページと同じホスト/);
    expect(PAGE).toMatch(/③https/);
  });

  it('平文 http で別ホストへ繋がないと書いてある', () => {
    expect(PAGE).toMatch(/平文 http で別ホストへは接続しない/);
  });
});

/*
 * **数字はビルドで違う。画面が片方の値だけを書いていないか。**
 *
 * 2026-08-23 まで Ollama 画面の「セキュリティポリシー」欄は
 * 「リクエストは 30 秒タイムアウト、レスポンスは 10 MB で切り詰め」と
 * 1 行で書いていた。これは**デスクトップ版の値**で、ブラウザ版は
 * 疎通確認 5 秒 / チャット 120 秒・上限 2 MB —— **4 倍長い待ち時間**を
 * 「30 秒」と説明していた。
 *
 * 数字を 2 か所に書くとまたずれるので、画面は実物の定数から出す。
 * ここではその**台帳**を確かめる —— 定数を変えたら画面の表示も動くこと。
 */
describe('Ollama 画面の数字が、実物の定数から出ている', () => {
  const PAGE = readFileSync(path.join(REPO_ROOT, 'src/renderer/pages/OllamaPage.tsx'), 'utf8');

  /*
   * **ファイル単位で「どこかに書いてあるか」を見ない。**
   *
   * 最初これを「`30 秒` が在るなら `ブラウザ版は` も在ること」と書いた。
   * だが `ブラウザ版は` は別の項 (接続先の説明) にも出るので、
   * **数字の行を古い直書きへ戻しても通ってしまった** (対照実験で判明)。
   * 前に keychain の検査で直したのと同じ誤りを、同じセッションで繰り返した。
   *
   * 「定数を**使っている**」ことと「古い一文が**無い**」ことを直接見る。
   */
  it('ブラウザ版の値を定数から描画している (import だけでなく JSX で使っている)', () => {
    expect(PAGE).toMatch(/\{WEB_CHAT_TIMEOUT_MS \/ 1000\}/);
    expect(PAGE).toMatch(/\{WEB_REQUEST_TIMEOUT_MS \/ 1000\}/);
    expect(PAGE).toMatch(/\{WEB_MAX_RESPONSE_BYTES \/ \(1024 \* 1024\)\}/);
  });

  /*
   * **数字を書くなら、どの版の数字かを名乗る。** (2026-08-23)
   *
   * ここは元々「リクエストは 30 秒タイムアウト、レスポンスは 10 MB で切り詰め」
   * という*その一文*を禁じていた。**周りの言い回しごと固定していた**ので、
   * 別の言い方なら素通りした —— 実測: `OllamaPage` へ
   *
   *   （既定 30 秒・上限 10 MB）
   *
   * を足しても (定数描画は残したまま) **23 件すべて通った**。
   * これはデスクトップ版の値で、ブラウザ版は 5 秒 / 120 秒 / 2MB なので、
   * ブラウザ利用者に他版の数字を見せる状態に戻る。
   *
   * 誤りの本体は「**どの版の数字か言わずに数字を書いていること**」。
   * だから「秒 / MB の字面がある塊は、デスクトップ版と名乗っていること」を見る。
   * ブラウザ版の値は定数から描くので字面の数字にならない。
   */
  it('数字を書いている塊は、どの版の値か名乗っている', () => {
    const code = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const blocks = code.match(/<div>[\s\S]*?<\/div>/g) ?? [];
    expect(blocks.length, 'ブロックが取れていない — 検査が的を外している').toBeGreaterThan(3);
    const unlabeled = blocks
      .filter((b) => /\d+\s*(秒|MB|MiB)/.test(b) && !b.includes('デスクトップ版'))
      .map((b) => b.trim().replace(/\s+/g, ' ').slice(0, 70));
    expect(unlabeled, 'どの版の数字か名乗らずに数字を書いています').toEqual([]);
  });

  it('表示する正規表現が実物と一致している (長さ上限と大小無視を落としていない)', () => {
    const shared = readFileSync(path.join(REPO_ROOT, 'src/shared/ollama.ts'), 'utf8');
    // **束ね方ではなく模様そのものを見る。** 以前は
    // `const MODEL_NAME_RE = …;` という**行の形**に一致させていたが、
    // モジュール定数を関数の中へ移した (静的変異体になって変異検査から
    // 見えなくなるため) 途端に落ちた —— 守りたいのは「画面が実物と同じ
    // 制約を出していること」で、実物をどう束ねているかではない。
    const real = /\/\^\[a-z0-9\]\[a-z0-9\._:\/-\]\{0,127\}\$\/i/.test(shared);
    expect(real, '実物の正規表現が変わった — 画面の表示も直すこと').toBe(true);
    expect(PAGE).toMatch(/0,127/);
    expect(PAGE).toMatch(/大文字小文字は/);
  });
});

/*
 * **画面が言う最小長と、実際に強制される最小長が一致していること。**
 *
 * 2026-08-23 まで食い違っていた:
 *
 *   vault.ts        MIN_PASSWORD_LENGTH = 12  ← 実際に強制する側
 *   LockScreen      「12 文字以上」           ← 合っていた (直書き)
 *   SettingsPage    「8 文字以上」で事前検査   ← **違う数字**
 *
 * 10 文字を入れると、まず「8 文字以上にしてください」と言われ (通ると読める)、
 * その後 vault が「12 文字以上」で弾く。守り自体は vault にあるので破れては
 * いないが、**画面が嘘の規則を教えていた**。
 *
 * 数字を 2 か所に持たないのが直し方。ここではそれを台帳として留める。
 */
describe('パスワードの最小長が、画面と実装で 1 つになっている', () => {
  const SETTINGS = readFileSync(path.join(REPO_ROOT, 'src/renderer/pages/SettingsPage.tsx'), 'utf8');
  const LOCK = readFileSync(path.join(REPO_ROOT, 'src/renderer/security/LockScreen.tsx'), 'utf8');
  const VAULT = readFileSync(path.join(REPO_ROOT, 'src/renderer/security/vault.ts'), 'utf8');

  it('強制する側の定数が 1 つだけ在る', () => {
    expect(VAULT).toMatch(/export const MIN_PASSWORD_LENGTH = \d+;/);
  });

  /*
   * **禁止の型からは「周りの文」を落とす。** (2026-08-23)
   *
   * ここは元々 `パスワードは \d+ 文字以上` と `placeholder="\d+ 文字以上"` を
   * 禁じていた。**周りの言い回しごと固定していた**ので、別の言い方なら
   * 素通りした —— 実測: `LockScreen` へ
   *
   *   title="8文字以上で入力してください"
   *
   * を足しても (定数参照は残したまま) **22 件すべて通った**。
   * 保管庫が強制するのは 12 なので、画面だけが 8 と言う状態に戻る。
   *
   * 誤りの本体は「**長さを字面の数字で言っていること**」であって、
   * その数字を囲む文ではない。だから禁止の型は `\d+ 文字以上` だけに絞る。
   * (定数から描くと原文は `${MIN_PASSWORD_LENGTH} 文字以上` になり、
   *  字面の数字は現れない。)
   *
   * コメントは落としてから見る —— 直した経緯を書いた注記に当ててしまうため。
   */
  const stripComments = (t: string): string =>
    t
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it.each([
    ['SettingsPage', () => SETTINGS],
    ['LockScreen', () => LOCK],
  ])('%s は長さを字面の数字で言っていない (言い回しを問わない)', (_label, get) => {
    const hits = [...stripComments(get()).matchAll(/\d+\s*文字以上/g)].map((m) => m[0]);
    expect(hits, '最小長を直書きしている (定数から描くこと)').toEqual([]);
  });

  it('両画面とも定数を使っている', () => {
    expect(SETTINGS).toMatch(/MIN_PASSWORD_LENGTH/);
    expect(LOCK).toMatch(/MIN_PASSWORD_LENGTH/);
  });

  it('事前検査も同じ定数で比べている (別の閾値を持たない)', () => {
    expect(SETTINGS).toMatch(/newPw\.length < MIN_PASSWORD_LENGTH/);
    expect(SETTINGS, '古い 8 文字の閾値が残っている').not.toMatch(/newPw\.length < 8\b/);
  });

  /*
   * クリップボード消去も同じ形 —— 本文の「30 秒」と `setTimeout` の
   * `30_000` が別々に書かれていた。
   */
  it('クリップボード消去の秒数も定数から描いている', () => {
    expect(LOCK).toMatch(/const CLIPBOARD_WIPE_MS = /);
    expect(LOCK).toMatch(/\$\{CLIPBOARD_WIPE_MS \/ 1000\} 秒後/);
    expect(LOCK, '30_000 が直書きで残っている').not.toMatch(/\}, 30_000\)/);
  });
});

/*
 * **保存状態カードは、何が鍵を握っているかを取り違えない。**
 *
 * ブラウザ版には OS キーチェーンが無く、鍵はマスターパスワードから
 * PBKDF2 で導出している。「OS が守る」と「あなたのパスフレーズが守る」は
 * 利用者にとって別の話 —— 後者はパスフレーズの強さがそのまま強度になる。
 */
/**
 * 「キーチェーンが鍵を握っていると読める文」を**主張の単位**で捕まえる。
 *
 * 字面 1 つ (`トークンは OS キーチェーンに暗号化保存されます`) だけを見ていた
 * ため、`SettingsPage` の「OS の**キーチェーン由来の鍵で**暗号化して保存されて
 * います」が素通りしていた (2026-08-23)。0-a-17 と同じ形。
 */
const KEYCHAIN_CLAIM = /キーチェーン(に|由来の鍵で|の鍵で)[^。\n]*(暗号化|保存)/;

describe('保存状態カードの文言は mechanism で分かれる', () => {
  const PAGE = readFileSync('src/renderer/pages/SettingsPage.tsx', 'utf8');

  it('キーチェーンの一文は mechanism を見た分岐の中にある', () => {
    const claim = KEYCHAIN_CLAIM;
    const idx = PAGE.search(claim);
    expect(idx, 'キーチェーンの一文が見つからない — 検査が的を外している').toBeGreaterThan(-1);
    // その一文より前に mechanism の分岐が在ること。
    expect(
      PAGE.slice(0, idx).includes("state.mechanism === 'webcrypto-vault'"),
      'キーチェーンの一文が mechanism を見ずに出ている',
    ).toBe(true);
  });

  it('ブラウザ版の枝はパスフレーズが鍵だと書いている', () => {
    expect(PAGE).toMatch(/マスターパスワードから導出した鍵/);
    expect(PAGE).toMatch(/強度はパスフレーズの強さで決まります/);
  });

  it('web-shim は webcrypto-vault と名乗る', () => {
    const shim = readFileSync('src/renderer/web-shim.ts', 'utf8');
    expect(shim).toMatch(/mechanism:\s*'webcrypto-vault'/);
  });
});

/*
 * **BYO プロキシの共有秘密を省いたとき、画面がそれを言うこと。**
 *
 * 2026-08-23 まで入力欄の説明は「共有秘密 (任意・空欄可)」だけで、
 * 省いても何も起きないように読めた。実際は `docs/PROXY_EXAMPLE.md` の
 * Worker が `SHARED_SECRET = ''` を既定にしており、空欄のまま配ると
 * **URL を知っている人なら誰でも中継できる**。同じ文書は「公開サーバとして
 * 第三者に開放しないでください」と書いているのに、その情報は画面に無かった。
 *
 * 資格情報が盗まれる形ではない (中継する側は自分の資格情報を送る。宛先も
 * Worker の allowlist に限られる) ので、直し方は文面である。ここでは
 * 「省いたときに何が起きるかが書いてあること」だけを留める。
 */
describe('BYO プロキシ — 共有秘密を省いたときの説明', () => {
  const SETTINGS = readFileSync(
    path.join(REPO_ROOT, 'src/renderer/pages/SettingsPage.tsx'),
    'utf8',
  );

  it('入力欄がある (前提)', () => {
    expect(SETTINGS).toMatch(/MAX_PROXY_SECRET_LENGTH/);
  });

  it('「任意・空欄可」とだけ言って終わっていない', () => {
    expect(SETTINGS).not.toMatch(/共有秘密 \(任意・空欄可\)/);
  });

  it('空欄にすると誰でも中継できる、と書いてある', () => {
    expect(SETTINGS).toMatch(/空欄[^。]*誰でも/);
  });

  it('設定済みの表示でも、秘密が無ければそう出す', () => {
    // `cfg.sharedSecret ? … : ''` に戻ると、無いことが画面から消える。
    expect(SETTINGS).toMatch(/共有秘密なし/);
  });

  // 過剰に脅していないことの対照 — 資格情報が盗まれると書いてはいけない
  // (中継する側は自分の資格情報を送るので、それは起きない)。
  it('資格情報が盗まれるとは書いていない (実際に起きないこと)', () => {
    const around = SETTINGS.slice(
      Math.max(0, SETTINGS.indexOf('誰でも中継') - 600),
      SETTINGS.indexOf('誰でも中継') + 600,
    );
    expect(around).toMatch(/資格情報は渡りません|盗れ(ない|ません)/);
  });
});
