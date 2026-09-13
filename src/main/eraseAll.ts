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
import { secretsPath } from './secrets';
import { storePath as emotionsStorePath } from './clients/emotions';
import { defaultStatePath as talentStatePath } from './clients/talent';
import { defaultStatePath as teamRadarStatePath } from './clients/teamradar';
import { defaultDashboardPath, defaultStatePath as stocksStatePath } from './clients/stocks';

type FileIo = Pick<typeof fs, 'rm' | 'readdir'>;

/** 消す物の在庫 —— 各モジュールの置き場所の関数から。 */
export function desktopEraseTargets(): readonly string[] {
  return [
    secretsPath(),
    emotionsStorePath(),
    talentStatePath(),
    teamRadarStatePath(),
    stocksStatePath(),
    defaultDashboardPath(),
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
 */
export async function eraseFileAndLitter(target: string, io: FileIo = fs): Promise<EraseFileOutcome> {
  let outcome: EraseFileOutcome;
  try {
    await io.rm(target);
    outcome = 'deleted';
  } catch (e) {
    outcome = isMissing(e) ? 'missing' : 'failed';
  }
  try {
    await io.rm(`${target}.prev`);
  } catch (e) {
    if (!isMissing(e)) outcome = 'failed';
  }
  const dir = path.dirname(target);
  const prefix = `${path.basename(target)}.tmp-`;
  let names: string[] = [];
  try {
    names = await io.readdir(dir);
  } catch (e) {
    if (!isMissing(e)) outcome = 'failed';
  }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    try {
      await io.rm(path.join(dir, name));
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
  for (const target of targets) files[target] = await eraseFileAndLitter(target, io);
  let renderer: 'deleted' | 'failed';
  try {
    await (deps.clearRenderer ?? (() => session.defaultSession.clearStorageData()))();
    renderer = 'deleted';
  } catch {
    renderer = 'failed';
  }
  const allDeleted = renderer === 'deleted' && Object.values(files).every((outcome) => outcome !== 'failed');
  return { kind: 'desktop', files, renderer, allDeleted };
}
