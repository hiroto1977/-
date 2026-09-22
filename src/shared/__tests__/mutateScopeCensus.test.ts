/**
 * **変異検査の分母の外を数える** (2026-09-20 · パス 354)。
 *
 * ## 何が在ったか
 *
 * `stryker.config.json` の `mutate` は**名指しの一覧**である。
 * `lint:mutation-scope` の docblock 自身が「上の検査は `mutate` に**載っている**
 * ファイルしか見ない」と書いており、**外側を数える物はどこにも無かった**。
 *
 * その結果、`docs/QUALITY.md` は「**Overall: 100.00% / 0 survived**」を
 * **分母の範囲を述べずに**公開していた —— 読んだ人は「製品ぜんぶが 100%」と
 * 受け取る。実測 (2026-09-20): `src/` の `.ts` は **413 本**、`mutate` は **295 本**、
 * **118 本が分母の外**である。
 *
 * パス 353 は、その外に **`shared/storageDurability.ts`** が居ることを見つけた ——
 * docblock が「**測られるために画面から出した**」と書いてあるのに一覧に無く、
 * 実測 27.78% / 生存 13 (全部が「API キー・トークンは戻せません」の表) だった。
 * **1 本見つかったなら、外を数える物が要る。**
 *
 * ## この検査が数えるもの
 *
 * 1. 母集団 (live): `src/**{/}*.ts` (検査と `.d.ts` を除く) / `mutate` / その差。
 * 2. **外に居て、かつ判断を持っていそうな物**を台帳で持つ (両方向)。
 *    「持っていそう」の機械的な定義は **同名の検査が在り、かつ 100 行以上** ——
 *    薄いスタブ (`main/clients/<id>.ts` の 11〜40 行) と、検査すら無い物を外す。
 *    実測 31 本 (パス 355 で `oauth/callbackPaste.ts` が分母へ入って 32 → 31)。
 * 3. 公開している頁が**分母の範囲を述べている**こと (`docs/QUALITY.md` と、
 *    それを作る `scripts/quality-report.cjs` の両方)。
 *
 * **台帳は「入れる / 入れない」の判断であって、機械が決めた物ではない。**
 * `kind` が `data` の行は「entry を書き換える変異体は**データ**を試すだけで
 * コードを試さない」という `triage-mutations.cjs` の方針そのもので、
 * `measure-next` の行は**入れるべきだが今日はまだ 100% ではない**物である
 * (入れた瞬間に週次 CI が `thresholds.break = 99.8` で赤になる)。
 */
import { describe, expect, it } from 'vitest';
import { basename, join, relative, sep } from 'node:path';
import { readOriginalDir, readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');

interface Scan {
  readonly files: string[];
  readonly tests: Set<string>;
}

/** 出荷される `.ts` と、同名の検査の名前を集める (依存を足さずに歩く)。 */
function scan(dir: string, acc: Scan): Scan {
  for (const e of readOriginalDirEntries(dir)) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') {
        for (const t of readOriginalDir(full)) {
          if (t.endsWith('.test.ts')) acc.tests.add(t.slice(0, -'.test.ts'.length));
        }
        continue;
      }
      scan(full, acc);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      acc.files.push(relative(REPO, full).split(sep).join('/'));
    }
  }
  return acc;
}

const scanned = scan(join(REPO, 'src'), { files: [], tests: new Set<string>() });
const named: string[] = (
  JSON.parse(readOriginalSource(join(REPO, 'stryker.config.json'))) as { mutate: string[] }
).mutate;
const inScope = new Set(named);
const outside = scanned.files.filter((f) => !inScope.has(f)).sort();

const LINES = (f: string): number => readOriginalSource(join(REPO, f)).split('\n').length;

/** 外に居て、同名の検査が在り、100 行以上 —— 「判断を持っていそう」な物。 */
const ledgerPopulation = outside
  .filter((f) => scanned.tests.has(basename(f, '.ts')) && LINES(f) >= 100)
  .sort();

type Kind = 'data' | 'measure-next';

/** 分母の外に在る「判断を持っていそうな物」の台帳。 */
const LEDGER: Readonly<Record<string, { kind: Kind; why: string }>> = {
  'src/main/clients/talent.ts': { kind: 'measure-next', why: '人材の採用判定と育成計画を組む fetcher。判断を持つので入れる側だが、未測定。' },
  'src/renderer/cloud/cloudProviderAdapter.ts': { kind: 'measure-next', why: '同期計画を実 I/O へ写す薄いラッパ。純粋核 (cloudSync.ts) は分母に在るが、写す側が外。' },
  'src/renderer/data/assistantContext.ts': { kind: 'measure-next', why: 'AI へ送る文脈を組む純ロジック。何を入れ何を落とすかを決めるので、送信内容そのものを左右する。' },
  'src/renderer/data/hydroponicsLog.ts': { kind: 'measure-next', why: '運転記録の保存と読み戻し。壊れた保存値の扱いを決める (パス 120 の家系)。' },
  'src/renderer/data/kessanSheets.ts': { kind: 'measure-next', why: '計算書類 4 点をどの紙に載せるかの切り分け。会社法435条2項の範囲を決める。' },
  'src/renderer/data/knowledgeProvenance.ts': { kind: 'measure-next', why: '知識の採用可否 (独立 2 出典) を判定する。採用の基準が緩めば出典の無い記述が通る。' },
  'src/renderer/data/portfolioAnnex.ts': { kind: 'measure-next', why: '計算書類に併記する別紙の組み立てと 3 つの断り。法定書類の外であることを述べる側。' },
  'src/renderer/data/professionalMap.ts': { kind: 'data', why: '士業 8 種の担当領域の単一データ源。行を書き換える変異体はデータを試すだけで、判定は読む側 (ShigyoPanel) に在る。' },
  'src/renderer/data/recordRelations.ts': { kind: 'measure-next', why: '保存する記録の欄と欄の関係 (内数 ≦ 親項目 ほか)。画面と復元の 2 入口が読む唯一の台帳。' },
  'src/renderer/data/subsidyKnowledge.ts': { kind: 'data', why: '補助金の確証済み知識ベース (出典つきの定数 2,665 行)。中身の正しさは lint:citations と vault:check が別に見る。' },
  'src/renderer/data/villageData.ts': { kind: 'measure-next', why: 'registry.json から村のシーンを組む決定論的ロジック。画面の見た目を決める。' },
  'src/renderer/data/wordpressMcpAccess.ts': { kind: 'measure-next', why: '取得した payload から「MCP ツールが使えるか」を述べる (パス 177)。名乗りを作る判断。' },
  'src/renderer/hooks/useRealtimeTick.ts': { kind: 'measure-next', why: '描画の刻み。止め忘れると毎秒の再描画が残る。' },
  'src/renderer/plan/usePlan.ts': { kind: 'measure-next', why: '内部ライセンスの有効化と「全機能を使えるか」の出どころ。機能の開閉を決める。' },
  'src/renderer/theme.ts': { kind: 'measure-next', why: '配色の解決と適用 (パス 317)。OS 追随の停止まで持つ。' },
  'src/shared/api/cloudflare.ts': { kind: 'measure-next', why: '**資格情報を使う書き込み口**。DNS レコードとキャッシュ削除の欄を検める。2026-09-20 (パス 357): ad-hoc の報告は生存 21 件だったが `audit:survivors` で **21/21 が偽** (既存の検査が全部殺す)。全掃引で確かめてから入れる。' },
  'src/shared/api/microsoft365.ts': { kind: 'measure-next', why: '**資格情報を使う書き込み口**。両ビルドが 1 つの実装を通る (パス 274) のに未測定。2026-09-20 (パス 357): ad-hoc の報告は生存 9 件だったが `audit:survivors` で **9/9 が偽**。全掃引で確かめてから入れる。' },
  'src/shared/api/security.ts': { kind: 'measure-next', why: '**資格情報を使う書き込み口** (HIBP / VirusTotal)。両ビルドが同じ関数を通る (パス 321)。2026-09-20 (パス 357): ad-hoc の報告は生存 5 件だったが `audit:survivors` で **5/5 が偽**。全掃引で確かめてから入れる。' },
  'src/shared/apiResponse.ts': { kind: 'measure-next', why: '**第三者の「成功した」応答を読むところで検証する** (パス 261・311・330)。ここが緩むと空の応答が成功として通る。' },
  'src/shared/buildDestinations.ts': { kind: 'measure-next', why: '実行形態ごとの置き場と読み場所を述べる (パス 161)。書き出し先の説明の出どころ。' },
  'src/shared/connectors/freeConnectors.ts': { kind: 'data', why: '認証不要コネクタのカタログ。宣言の集まりで、実行は connectorRegistry / pluginRuntime (どちらも分母に在る) が持つ。' },
  'src/shared/connectors/mcpConnectors.ts': { kind: 'data', why: 'MCP サーバの宣言的レジストリ。docs/MCP_SETUP.md と 1 対 1 で、判断は持たない。' },
  'src/shared/freeeIntake.ts': { kind: 'measure-next', why: '会計連携で落ちた取引を数えて述べる (パス 153)。数え落としは画面の数字を静かに変える。' },
  'src/shared/hydroponicsControl.ts': { kind: 'measure-next', why: '**1,390 行の運転管理**。日々の測定から判定と次の作業を出す、この機能の中核の判断。2026-09-22 (パス 399) に測った —— **67.15% / 覆われた分 68.20%・Killed 652 / Survived 304 / NoCoverage 15**。`thresholds.break = 99.8` を大きく下回るので**入れれば週次 CI が永続的に赤くなる**。生存を潰すのが先で、`audit:survivors` はここでは全件に使えない (1 変異体 3 分 02 秒 × 321 件 ≒ 16 時間・`--top=N` の標本で見る)。' },
  'src/shared/nortonDetection.ts': { kind: 'measure-next', why: '「見た結果」と「見られなかった」を分ける (パス 165)。安全の名乗りを作る側。' },
  'src/shared/paperAccount.ts': { kind: 'measure-next', why: '取引 0 件の口座を「損益 ±0」と言わない判断 (パス 189)。e2e の suite が別に在る。' },
  'src/shared/parameterConsistency.ts': { kind: 'measure-next', why: '台帳 (parameters.ts) の欄と欄の順序・相異を検める。ここが緩むと設定できる値の関門が消える。' },
  'src/shared/radarPlot.ts': { kind: 'measure-next', why: 'レーダー図に何を描き何を描かないか (パス 190)。画面と書き出しが同じ 1 つを読む。' },
  'src/shared/realtimeProjection.ts': { kind: 'measure-next', why: '時刻から決まる値。毎秒動く物だけをここに置くという切り分けそのもの。' },
  'src/shared/securityResponse.ts': { kind: 'measure-next', why: '**安全の判定を作る応答を読む** (パス 261)。空の「漏洩」をでっち上げない関門。' },
  'src/shared/voiceWriteRequirements.ts': { kind: 'measure-next', why: '音声・チャットから呼べる書き込みの必須項目と、実行してよいかの判断。' },
};

describe('変異検査の分母の外 (パス 354)', () => {
  it('走査が生きている (床: 出荷される .ts を 400 本以上読めている)', () => {
    expect(scanned.files.length).toBeGreaterThanOrEqual(400);
    expect(scanned.tests.size).toBeGreaterThanOrEqual(400);
  });

  it('★ 分母は名指しの一覧で、外に居る物が在る (実測 2026-09-20: 413 / 296 / 117)', () => {
    expect(named.length).toBeGreaterThanOrEqual(290);
    expect(outside.length).toBe(scanned.files.length - named.length);
    // 名指しの一覧はすべて実在する (消えたファイルが載ったままにならない)。
    for (const f of named) expect(scanned.files, f).toContain(f);
  });

  it('★ 「判断を持っていそうな外の物」が台帳と一致する (両方向)', () => {
    expect(ledgerPopulation).toEqual(Object.keys(LEDGER).sort());
  });

  it('★ 台帳の理由が実物を述べている (保留の決まり文句を置かない)', () => {
    const DEFERRAL = /分かる人が決め|誰かが決め|要検討|TODO|同上/;
    for (const [file, row] of Object.entries(LEDGER)) {
      expect(row.why.length, file).toBeGreaterThan(20);
      expect(row.why, file).not.toMatch(DEFERRAL);
    }
    // 標本: 針が保留の文面に当たる。
    expect('同上。').toMatch(DEFERRAL);
  });

  it('★ `data` と言えるのは宣言の集まりだけ —— 判断を持つ物は measure-next', () => {
    const data = Object.entries(LEDGER).filter(([, r]) => r.kind === 'data');
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data.length).toBeLessThan(Object.keys(LEDGER).length / 2);
    // measure-next が大多数であること自体が「外に判断が残っている」という報せ。
    expect(Object.values(LEDGER).filter((r) => r.kind === 'measure-next').length).toBeGreaterThan(data.length);
  });

  it('★ パス 353 / 355 で入れた 2 本は、もう外に居ない', () => {
    for (const f of ['src/shared/storageDurability.ts', 'src/renderer/oauth/callbackPaste.ts']) {
      expect(inScope.has(f), f).toBe(true);
      expect(outside, f).not.toContain(f);
    }
    // 標本: この針は「外に居る」側にも当たる (当たらなければ上の not は空の検査)。
    expect(outside).toContain('src/shared/apiResponse.ts');
  });

  it('★ 公開している頁が分母の範囲を述べている (生成物と、それを作る側の両方)', () => {
    const doc = readOriginalSource(join(REPO, 'docs/QUALITY.md'));
    expect(doc).toContain('分母の範囲');
    expect(doc).toMatch(/`mutate` が名指しする \*\*\d+ 本\*\*/);
    const gen = readOriginalSource(join(REPO, 'scripts/quality-report.cjs'));
    expect(gen).toContain('mutateScopeLine');
    expect(gen).toContain('分母の範囲');
  });

  /**
   * **散文に書いた行数を、機械が引き直す。**
   *
   * 2026-09-22 (パス 399) に `hydroponicsControl.ts` の行を直したとき、そこには
   * **「1,165 行」**と書かれていた —— 実物は **1,389 行**で、**209 行ずれていた**
   * (2026-09 の 6 パスがこのファイルへ足した分)。理由の欄は誰も検算しないので、
   * ファイルが伸びても文だけが古びる —— このリポジトリが繰り返し直してきた形である
   * (パス 346 の e2e の床・パス 363 の色・パス 372 のゲート数と同じ)。
   *
   * だから**数は機械が持ち、判断は散文が持つ**: 理由の中の `N 行` は実物と一致すること。
   * 書きたくなければ書かなくてよい (この検査は在る物だけを見る)。
   *
   * 数え方は `LINES` (= `split('\n').length`) で、**この census が母集団を決めるのに
   * 使っているのと同じ 1 つ**である。末尾の改行が 1 要素になるので `wc -l` より 1 大きい ——
   * 2 通りに数えるほうが危ないので、閾値と理由の欄で同じ関数を読む。
   *
   * 対照 3 方向とも鳴る: 古い 1,165 へ戻す ❌1 (**この検査が在れば 209 行の古びは
   * その日に鳴っていた**) / 行数を名乗る文を数ごと消す ❌1 (床) / 1 件だけ残す ❌1 (床)。
   * ★ **1 度目の「消す」対照は鳴らなかったが、当てていなかっただけだった** ——
   * `' 行'` を `' 行目あたり'` へ替えたので針 `/([\d,]+) 行/` は**まだ当たっていた**。
   * 「落ちなかった」と「当てていなかった」を混ぜない (パス 397 と同じ形)。
   */
  it('★ 台帳の理由が名乗る行数は実物と一致する (数は機械が持つ)', () => {
    let checked = 0;
    for (const [file, row] of Object.entries(LEDGER)) {
      for (const m of row.why.matchAll(/([\d,]+) 行/g)) {
        const digits = m[1] ?? '';
        checked += 1;
        expect(Number(digits.replace(/,/g, '')), `${file} の理由が名乗る行数`).toBe(LINES(file));
      }
    }
    // 走査が空虚でない床 —— 行数を名乗る行が実際に在る。
    expect(checked, '行数を名乗る理由の件数').toBeGreaterThanOrEqual(2);
  });

  it('薄いスタブと検査の無い物は台帳に要らない (母集団の定義が効いている)', () => {
    const thin = outside.filter((f) => LINES(f) < 100);
    expect(thin.length).toBeGreaterThan(10);
    for (const f of thin) expect(Object.keys(LEDGER), f).not.toContain(f);
  });
});
