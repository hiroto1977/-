import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import { readOriginalDir, readOriginalSource } from '../../shared/__tests__/originalSource';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CARD = readOriginalSource(path.join(REPO_ROOT, 'src/renderer/components/GoogleConnectCard.tsx'));

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
/*
 * **不在の主張には、実行される標本を添える** (2026-09-15 · パス 293)。
 *
 * 下の `not.toMatch` を非空にしているのは、上の docblock が引用している
 * 2026-08-22 までの実物の一文である。**だが docblock は落ちない** ——
 * 綴りを 1 字外した規則も、注記を読まなければ見分けられない。
 * `dbSecurityPosture.test.ts` が 2026-08-25 の失敗から作った形
 * (`OLD_WORDINGS` + 肯定の `it`) をここにも置く。
 *
 * 規則の綴りは**この定数 1 つ**に持たせ、不在の主張と標本が同じ物を読む
 * (写しを 2 つ置くと離れて腐る)。
 */
const KEYCHAIN_ASSERTION = /トークンは\s*OS\s*キーチェーンに\s*暗号化保存されます/;
/** 2026-08-22 まで実際にカードに在った一文 (この節の docblock が引用している物)。 */
const OLD_KEYCHAIN_WORDING = 'トークンは OS キーチェーンに暗号化保存されます。';

describe('トークン保存の説明が、環境によらず正しいこと', () => {
  it('★ この規則が空でない (実際に在った一文に当たる)', () => {
    expect(OLD_KEYCHAIN_WORDING, '規則が実物の文面に当たらない — 綴りを実物から取り直すこと').toMatch(
      KEYCHAIN_ASSERTION,
    );
  });

  it('★ 直したあとの文面には当たらない (過剰でない)', () => {
    expect(CARD).toContain('base64 の難読化のみ');
    expect('キーチェーンがあれば暗号化、無ければ base64 の難読化のみ。').not.toMatch(
      KEYCHAIN_ASSERTION,
    );
  });

  it('「OS キーチェーンに暗号化保存されます」と断言していない', () => {
    // 条件を伴わない断言だけを禁じる。語そのものは正しい文にも出る。
    expect(CARD).not.toMatch(KEYCHAIN_ASSERTION);
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
    for (const name of readOriginalDir(dir)) {
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
      const text = readOriginalSource(f);
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
  const PAGE = readOriginalSource(path.join(REPO_ROOT, 'src/renderer/pages/OllamaPage.tsx'));

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
  const PAGE = readOriginalSource(path.join(REPO_ROOT, 'src/renderer/pages/OllamaPage.tsx'));

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
  it('4 つの数をすべて定数から描画している (import だけでなく JSX で使っている)', () => {
    expect(PAGE).toMatch(/\{WEB_REQUEST_TIMEOUT_MS \/ 1000\}/);
    // 2026-09-23 (パス 424) から、**生成の締切は両ビルドで 1 つ** (shared) ——
    // それまでデスクトップ版は疎通確認の 30 秒で生成を切っており、
    // 画面はその 30 秒を**直書き**していた。
    expect(PAGE).toMatch(/\{OLLAMA_CHAT_TIMEOUT_MS \/ 1000\}/);
    expect(PAGE).toMatch(/\{DEFAULT_HTTP_TIMEOUT_MS \/ 1000\}/);
    // 2026-09-20 (パス 336) から、応答の上限は両ビルドで 1 つ (shared)。
    // それまで「デスクトップ版 10 MB」だけが**画面に直書き**されていた。
    expect(PAGE).toMatch(/\{MAX_OLLAMA_RESPONSE_BYTES \/ \(1024 \* 1024\)\}/);
    expect(PAGE).not.toMatch(/レスポンス 10 MB/);
    // 標本 — この針は禁じたい字面に実際に当たる (綴り違いで黙る検査を作らない)。
    expect('🔒 デスクトップ版はリクエスト 30 秒・レスポンス 10 MB、').toMatch(/レスポンス 10 MB/);
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
   * だから最初は「秒 / MB の字面がある塊は、デスクトップ版と名乗っていること」を見た。
   *
   * ★ **その免除そのものが穴だった** (2026-09-23 · パス 424)。
   *   名乗ることと**定数から出すこと**は別である —— 名乗った直書きは
   *   実物が動いた日に黙ってずれる。実際、免除されていた 1 行
   *   「🔒 デスクトップ版はリクエスト 30 秒、」の 30 秒は、
   *   **疎通確認の予算が生成にも掛かっていた**実物の姿を刷っており、
   *   ブラウザ版の同じ生成は 120 秒だった。
   *
   *   直書きが残っていた理由は構造的で、renderer は `src/main/` から
   *   import できない (`lint:imports`)。だから定数を `shared` へ置いた
   *   —— 応答の上限がパス 336 で辿ったのと同じ道である。
   *
   *   **今この欄に秒 / MB の裸の数は 1 つも無い** (実測 0 / 10 ブロック)。
   *   だから免除ごと外す: 名乗っていても直書きは落とす。
   */
  it('秒 / MB の数は 1 つも直書きしていない (名乗っても免除しない)', () => {
    const code = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const blocks = code.match(/<div>[\s\S]*?<\/div>/g) ?? [];
    expect(blocks.length, 'ブロックが取れていない — 検査が的を外している').toBeGreaterThan(3);
    const literal = blocks
      .filter((b) => /\d+\s*(秒|MB|MiB)/.test(b))
      .map((b) => b.trim().replace(/\s+/g, ' ').slice(0, 70));
    expect(literal, '秒 / MB を直書きしています — 実物の定数から出すこと').toEqual([]);
  });

  /*
   * **標本 —— この針は禁じたい形に実際に当たる。**
   *
   * 免除を外した以上、「デスクトップ版」と名乗る直書きも落ちなければ
   * ならない。落とす側と落とさない側を 1 件ずつ当てる (綴りを変えただけで
   * 黙る検査を作らない · パス 293 の規約)。
   */
  it('★ 針の標本 — 名乗った直書きも、定数から出した行も、正しく分かれる', () => {
    const needle = /\d+\s*(秒|MB|MiB)/;
    // 名乗っていても直書きなら鳴る (パス 424 まで素通りしていた当の形)。
    expect(needle.test('<div>🔒 デスクトップ版はリクエスト 30 秒、</div>')).toBe(true);
    expect(needle.test('<div>🔒 レスポンスは 10 MB で切り詰め</div>')).toBe(true);
    // 定数から出した行は字面の数にならないので鳴らない。
    expect(needle.test('<div>🔒 生成はどちらも {OLLAMA_CHAT_TIMEOUT_MS / 1000} 秒</div>')).toBe(false);
  });

  it('表示する正規表現が実物と一致している (長さ上限と大小無視を落としていない)', () => {
    const shared = readOriginalSource(path.join(REPO_ROOT, 'src/shared/ollama.ts'));
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
  const SETTINGS = readOriginalSource(path.join(REPO_ROOT, 'src/renderer/pages/SettingsPage.tsx'));
  const LOCK = readOriginalSource(path.join(REPO_ROOT, 'src/renderer/security/LockScreen.tsx'));
  const VAULT = readOriginalSource(path.join(REPO_ROOT, 'src/renderer/security/vault.ts'));

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

  it('事前検査は関門そのものを読む (定数だけ共有して式を書き直さない)', () => {
    /*
     * **2026-09-14 (パス 252) に要求を強めた。** それまでは
     * `newPw.length < MIN_PASSWORD_LENGTH` という**式の写し**を要求していた ——
     * 定数は 1 つでも**規則が 2 か所**に在る形で、実際その写しが
     * `password.length` (コード単位) を数えており、`'😀'.repeat(6)` (実文字数 6) が
     * 「12 文字以上」の関門を通っていた。式ごと `meetsPasswordPolicy` を読む。
     */
    expect(SETTINGS).toMatch(/meetsPasswordPolicy\(newPw\)/);
    expect(SETTINGS, '長さの式を書き直している (関門を読むこと)').not.toMatch(/newPw\.length\s*[<>]/);
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
  const PAGE = readOriginalSource('src/renderer/pages/SettingsPage.tsx');

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
    const shim = readOriginalSource('src/renderer/web-shim.ts');
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
  const SETTINGS = readOriginalSource(path.join(REPO_ROOT, 'src/renderer/pages/SettingsPage.tsx'));

  it('入力欄がある (前提)', () => {
    expect(SETTINGS).toMatch(/MAX_PROXY_SECRET_CHARS/);
  });

  /* 不在の主張の綴りを 1 つに持ち、標本と共有する (パス 293)。 */
  const OPTIONAL_ONLY_LABEL = /共有秘密 \(任意・空欄可\)/;

  it('★ この規則が空でない (「任意・空欄可」だけの旧ラベルに当たる)', () => {
    expect('共有秘密 (任意・空欄可)').toMatch(OPTIONAL_ONLY_LABEL);
    // 過剰でない: 危険を述べている今のラベルには当たらない。
    expect('共有秘密 (空欄にすると誰でも中継できます)').not.toMatch(OPTIONAL_ONLY_LABEL);
  });

  it('「任意・空欄可」とだけ言って終わっていない', () => {
    expect(SETTINGS).not.toMatch(OPTIONAL_ONLY_LABEL);
  });

  it('空欄にすると誰でも中継できる、と書いてある', () => {
    expect(SETTINGS).toMatch(/空欄[^。]*誰でも/);
  });

  /*
   * **逆向きが書かれていなかった (2026-08-25)。**
   *
   * 上の 4 件は「**他人があなたの Worker を使う**」側で、失うのは帯域である。
   * ところが欄は自由入力の URL で、**あなたが他人の Worker を使う**ことも
   * 止められない (どの URL が「あなたの物」かは判定できない)。
   * そして経由するとき渡るのは宛先だけではない —— `fetchViaProxy` は
   * 呼び出し側のヘッダをそのまま封筒へ載せる (`headers: flatHeaders`) ので、
   * **`Authorization: Bearer <トークン>` が Worker の運用者に見える**。
   *
   * 説明文は「**自前で** Cloudflare Worker 等を立てて」とだけ書いており、
   * これは**前提であって警告ではない**。判定できない以上、
   * 言うことが唯一の対策になる。
   */
  it('★ 自分が管理する Worker だけを入れるよう言っている', () => {
    expect(SETTINGS).toMatch(/あなたが管理している Worker だけ/);
  });

  it('★ 何が渡るのか (トークン) を名指ししている', () => {
    expect(SETTINGS).toMatch(/Authorization ヘッダ/);
    expect(SETTINGS).toMatch(/資格情報が渡ります/);
  });

  /*
   * **「自前で」だけに戻していないこと。** 前提を書いただけの状態へ戻ると、
   * 他人の URL を入れる利用者には何も届かない。
   */
  it('「自前で」の一文だけで終わっていない', () => {
    const idx = SETTINGS.indexOf('自前で Cloudflare Worker');
    expect(idx, '前提の一文が消えた — 検査の綴りを実物から取り直すこと').toBeGreaterThan(0);
    /*
     * **固定長の窓を使わない** (2026-09-12 · パス 166)。
     * ここは `slice(idx, idx + 1400)` だった。実測すると目標の一文は **+1009** ——
     * **余裕は 391 文字**しかなく、この節に注記や欄を足せば越える。越えたとき
     * 守っている性質は何も壊れていないのに**誤った理由で鳴る**
     * (パス 165 で `browserSnapshotGates` の窓 4000 を 28 文字で踏み抜いた形)。
     *
     * 留めたいのは「前提の一文の**後ろに**、誰の Worker かを述べる一文が在る」——
     * 距離ではなく**順序**なので、順序で書く。
     */
    const follow = SETTINGS.indexOf('あなたが管理している Worker だけ');
    expect(follow, '誰の Worker かを述べる一文が消えた').toBeGreaterThan(0);
    expect(follow, '前提の一文より後ろに在ること').toBeGreaterThan(idx);
  });

  it('設定済みの表示でも、秘密が無ければそう出す', () => {
    // `cfg.sharedSecret ? … : ''` に戻ると、無いことが画面から消える。
    expect(SETTINGS).toMatch(/共有秘密なし/);
  });

  /*
   * 過剰に脅していないことの対照 —— **この節** (他人があなたの Worker を
   * 使う側) で「資格情報が盗まれる」と書いてはいけない。中継する側は自分の
   * 資格情報を送るので、それは起きない。
   *
   * **窓の起点を説明文そのものへ移した (2026-08-25)。** 以前は入力欄の
   * placeholder (「誰でも中継」) を起点に ±600 字を見ていたが、その間に
   * **別の話** (あなたが他人の Worker を使う側 = 資格情報が実際に渡る) の
   * 警告を足したら、宥める一文が窓から押し出されて落ちた。**文面は正しい
   * ままで、窓がずれただけ**だった。
   *
   * 説明文と宥めは同じ `div` の中に並んでいるので、そちらを起点にすれば
   * 無関係な挿入で動かない。
   */
  it('資格情報が盗まれるとは書いていない (実際に起きないこと)', () => {
    /*
     * **起点は 1 つだけであること。** 注記が同じ文言を引き写すと
     * `indexOf` はそちらを拾い、窓が本文からずれる (2026-08-25 に実際に
     * 起きた —— 文面は正しいまま検査だけが落ちた)。
     * 数を確かめておけば、囮ができた日に**位置ではなく囮**を疑える。
     */
    const hits = SETTINGS.split('共有秘密を空欄にすると').length - 1;
    expect(hits, '同じ文言が複数ある — 注記が本文を引き写していないか見ること').toBe(1);
    const at = SETTINGS.indexOf('共有秘密を空欄にすると');
    expect(at, '説明文が見つからない — 検査の綴りを実物から取り直すこと').toBeGreaterThan(0);
    const around = SETTINGS.slice(at, at + 400);
    expect(around).toMatch(/資格情報は渡りません|盗れ(ない|ません)/);
  });
});
