/**
 * **デスクトップ版の「すべてのデータを削除」。** (2026-09-09 · パス 137)
 *
 * 設定画面の「⚠ すべてのデータを削除 (ハードリセット)」はデスクトップ版にも出るが、2026-09-09 までは
 * renderer の保存領域 (パス 136 までは、その中の使われていない保管庫 1 つ) しか消せなかった。
 * デスクトップ版のトークンは main の `service-hub-secrets.json` (と控え `.prev`) に、気分の記録・
 * 人材育成・チームレーダー・ウォッチリストは状態ファイルに、書き込みの残骸は `<名前>.tmp-*` に在り、
 * どれも OS のユーザー領域に残ったまま「最初の状態」の画面が出ていた。
 *
 * **在庫は置き場所を決める関数から作る** (綴りを写さない): secrets / emotions / talent / teamradar / stocks が
 * export する path 関数を読む。封緘 (`atRestPolicy.test.ts`) と同じ母集団。
 *
 * **消えたと言うのは消えた時だけ** (パス 20): ファイルごとに deleted / missing / failed を返し、控えと残骸が
 * 残れば本体が消えていても failed。renderer の保存領域は `session.clearStorageData()` (IndexedDB・
 * localStorage・Cache Storage …)。呼ぶ側 (main.ts の `app:eraseAll`) は全部消えた時だけ再起動する。
 */
import { session } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DesktopEraseReport, EraseFileOutcome } from '../shared/eraseReport';
import { beginErase, endErase, secretsPath } from './secrets';
import { backupPathOf, isAtomicLitterOf } from './atomicWrite';
import { storePath as emotionsStorePath } from './clients/emotions';
import { defaultStatePath as talentStatePath } from './clients/talent';
import { defaultStatePath as teamRadarStatePath } from './clients/teamradar';
import { defaultDashboardPath, defaultStatePath as stocksStatePath } from './clients/stocks';
import { defaultStatePath as windowPrefsPath } from './windowPrefs';

type FileIo = Pick<typeof fs, 'rm' | 'readdir'>;

/**
 * 消す物の在庫 —— 各モジュールの置き場所の関数から。
 *
 * **順序は「トークンが先」で、ブラウザ版とは逆向きである** (2026-09-14 · パス 252 で実測して裁定)。
 *
 * ブラウザ版 (`renderer/security/eraseAll.ts`) は `ERASE_INDEXEDDB` の**最後**に保管庫を置き、
 * 理由をこう書いている —— 「途中で止まっても『保管庫だけ新しく、記録は前の人の物』の向きには
 * ならない」。こちらは `secretsPath()` が**先頭**なので、字面だけ見ると規則に反している。
 *
 * **反していない。前提が違う。** ブラウザ版であの順序が要るのは、**保管庫だけが暗号化されていて
 * 業務レコードは平文の IndexedDB** だからである —— 保管庫が消えると画面は初回起動を出すのに、
 * 前の人のレコードは同じ生成元に平文で残る。デスクトップ版は `atRest.ts` の封筒 1 組で
 * **トークンも状態ファイルも同じ強さ** (キーチェーンが在れば safeStorage、無ければ `plain:` の
 * 難読化) なので、その非対称が起きない。
 *
 * そのうえで**process が途中で死んだとき** (強制終了・電源断) に何が残るかで選ぶと:
 *
 * | 順序 | 残る物 | 危険 |
 * | --- | --- | --- |
 * | **トークンが先 (現在)** | 気分の記録・人材・チームレーダー・ウォッチリスト | その端末を持つ人が読める (**局所**) |
 * | トークンが後 | OAuth のアクセス / 更新トークン | **遠隔から**相手先 API を叩ける |
 *
 * 遠隔から使える残骸のほうが重いので、トークンを先に消す。**報告される失敗**
 * (`failed`) はどちらの順序でも `describeDesktopEraseReport` が残った物をパスで名指しし、
 * `allDeleted` が偽なら main は再起動しない —— 順序が効くのは「誰も報せないまま止まった」
 * ときだけである。
 */
export function desktopEraseTargets(): readonly string[] {
  return [
    secretsPath(),
    emotionsStorePath(),
    talentStatePath(),
    teamRadarStatePath(),
    stocksStatePath(),
    defaultDashboardPath(),
    // 窓の配色 (パス 318)。秘密は無いが「前の人の選んだ配色」も残さない。
    windowPrefsPath(),
  ];
}

export interface DesktopEraseDeps {
  readonly targets?: readonly string[];
  readonly clearRenderer?: () => Promise<void>;
  readonly io?: FileIo;
}

function isMissing(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'ENOENT';
}

/**
 * 本体・控え (`.prev`)・残骸 (`<名前>.tmp-*`) をまとめて消す。本体が元から無ければ missing
 * (残骸が在れば消す)。控えか残骸が 1 つでも残れば failed —— 本体だけ消して「消えた」と言わない
 * (パス 134: 控えは本体と同じ中身を持つ)。
 *
 * **rm は `recursive: true`** (threat: T-023)。書き出しの入口 (`isSafeExportPath`) は
 * 設計上 `data/` の下なら任意の深さを許す (パス 511 の T-002 回帰: `data/a/b/c/deep.md`・
 * `data/state.json.tmp/x.svg` が true) ので、乗っ取られたレンダラーは
 * `invoke('stocks','export-dashboard',{path:'…/data/dashboard.html/x.html'})` で
 * **ファイル目標 `data/dashboard.html` をディレクトリに化けさせられる** (書き出しの
 * `mkdir(dirname)` が中間ディレクトリを作る)。非再帰の rm はそこで `EISDIR` を投げ、
 * `outcome='failed'` → `allDeleted=false` → **ハードリセットが永久に完了せず再起動もせず、
 * 植えたファイルがワイプを生き延びる** (control / litter も同じ: `dashboard.html.prev` /
 * `dashboard.html.tmp-*` も同じ手でディレクトリ化できる)。再帰 rm なら化けたディレクトリ
 * ごと消えてワイプは必ず完了する。**`force: true` は付けない** —— ENOENT を潰すと
 * 「元から無い (missing)」と「消した (deleted)」の区別が消える (パス 134 の契約)。
 */
export async function eraseFileAndLitter(target: string, io: FileIo = fs): Promise<EraseFileOutcome> {
  let outcome: EraseFileOutcome;
  try {
    await io.rm(target, { recursive: true });
    outcome = 'deleted';
  } catch (e) {
    outcome = isMissing(e) ? 'missing' : 'failed';
  }
  try {
    await io.rm(backupPathOf(target), { recursive: true });
  } catch (e) {
    if (!isMissing(e)) outcome = 'failed';
  }
  const dir = path.dirname(target);
  let names: string[];
  try {
    names = await io.readdir(dir);
  } catch (e) {
    // 一覧を引けなければ探す残骸も無い (ここで返すので、空の一覧を代わりに置かない)。
    // 引けない理由が「無い」(ENOENT) 以外なら、残骸が残っていないことを確かめられなかった
    // のだから failed —— 「消えた」と言うのは消えたと分かったときだけ (パス 20)。
    return isMissing(e) ? outcome : 'failed';
  }
  for (const name of names) {
    if (!isAtomicLitterOf(target, name)) continue;
    try {
      await io.rm(path.join(dir, name), { recursive: true });
    } catch (e) {
      if (!isMissing(e)) outcome = 'failed';
    }
  }
  return outcome;
}

/** 在庫の全部を消し、ファイルごと + renderer の結果を返す。投げない (何が残ったかを画面が言えるように)。 */
export async function eraseDesktopData(deps: DesktopEraseDeps = {}): Promise<DesktopEraseReport> {
  const targets = deps.targets ?? desktopEraseTargets();
  const io = deps.io ?? fs;
  const files: Record<string, EraseFileOutcome> = {};
  // 進行中の資格情報の保存が消した後に tmp を rename して中身を復活させない (T-079)。
  await beginErase();
  for (const target of targets) files[target] = await eraseFileAndLitter(target, io);
  let renderer: 'deleted' | 'failed';
  try {
    await (deps.clearRenderer ?? (() => session.defaultSession.clearStorageData()))();
    renderer = 'deleted';
  } catch {
    renderer = 'failed';
  }
  const allDeleted = renderer === 'deleted' && Object.values(files).every((outcome) => outcome !== 'failed');
  // 完了しなかった (再起動しない) ときは書き込みを再開する —— 再起動するなら旗は要らない。
  if (!allDeleted) endErase();
  return { kind: 'desktop', files, renderer, allDeleted };
}
