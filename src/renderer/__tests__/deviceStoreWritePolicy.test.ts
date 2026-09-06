/**
 * **端末の保管庫 (IndexedDB) の書き込みは、報せる入口からしか行わない。**
 *
 * 対象は 2 つ —— 業務レコード (`data/store.ts`) と、書き出したファイル
 * (`library/library.ts`)。同じ端末の同じ容量を分け合っているので、規則も台帳も
 * 1 つで見る。
 *
 * `storageWritePolicy.test.ts` が localStorage について同じことを見ている。
 * その 1 つ下の層 —— レコードストアには、2026-09-06 まで規則が無かった。
 * 実測: `useCollection` の書き込みを呼ぶ 15 か所のうち 12 か所が
 * 拒否された Promise を捨てており (`void add()` /
 * `onClick={async () => { await onSave(...) }}`)、**断られても画面には何も出なかった**。
 *
 * 規則は 2 つ。
 *
 * 1. レコードストアを**書き換える**のは `data/useCollection.ts` (失敗を
 *    `deviceStoreFailure` へ写す唯一の入口) か、この台帳に理由つきで載っている場所。
 * 2. 書き込みの Promise を `void` で捨てない。捨てるなら `fireReported()` を通す
 *    —— **既に報せてあるから捨ててよい**ことが、読む人に分かる形で書かれる。
 *
 * 台帳は**双方向**に検査する (腐った台帳は「守っているつもり」を生む)。
 * 走査が死んだら落ちるように件数の床も置き、規則が実際に当たることを
 * 標本 (fixtures/undeclaredDeviceWrite.txt) で確かめる。
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';

const REPO = join(__dirname, '..', '..', '..');

/**
 * 保管庫を書き換える呼び出し。`getRecordStore().insert<T>(...)` のように
 * **型引数が挟まる形**も拾う (拾えないと入口の 3 行が台帳の外に落ちる)。
 */
const WRITE =
  /(?:getRecordStore\(\)|getLibrary\(\)|\bstore|\blib|\blibrary)\.(insert|insertMany|update|remove|clear|clearCollection|importAll|reencryptAll|put)\s*(?:<[^>()]*>)?\s*\(/;

/** 報せずに捨てている呼び出し (`void add()` など)。`fireReported(...)` は当たらない。 */
const DROPPED = /\bvoid\s+(?:[A-Za-z_$][\w$]*\.)*(add|addMany|edit|remove|save|onSave|onRemove|onClear|onCropsChange)\s*\(/;

type Policy = 'entrance' | 'surfaced';

interface LedgerEntry {
  readonly policy: Policy;
  /** 失敗をどう扱うか。空欄と一言は認めない。 */
  readonly why: string;
}

const LEDGER: Record<string, LedgerEntry> = {
  'src/renderer/data/useCollection.ts': {
    policy: 'entrance',
    why: '失敗を deviceStoreFailure へ写してから投げ直す唯一の入口。読み (list) も同じ経路で read として報せる。',
  },
  'src/renderer/components/BackupPanel.tsx': {
    policy: 'surfaced',
    why: '復元 (importAll)。try/catch で受けてパネルの誤り欄に出す —— 何件入ったかも併せて出す画面なので、黙ることがない。',
  },
  'src/renderer/data/connectorSinks.ts': {
    policy: 'surfaced',
    why: 'コネクタ実行の保存シンク (レコードとファイルの両方)。投げた失敗は connectorExecution が段ごとの結果に写し、実行ログに出る。',
  },
  'src/renderer/pages/LibraryPage.tsx': {
    policy: 'surfaced',
    why: '書き出したファイルの削除と読み出し。断られたら deviceStoreFailure へ files として報せ、画面上端の枠が理由と打ち手を出す (「削除しました」は言わない)。',
  },
  'src/renderer/web-shim.ts': {
    policy: 'surfaced',
    why: 'ブラウザ版の書き出し action がライブラリへ入れる所。投げた失敗は action の結果 (action_failed) になり、画面がその文面を出す。',
  },
  'src/renderer/data/recordShapeAudit.ts': {
    policy: 'surfaced',
    why: '形の合わないレコードの削除。途中で失敗したら投げる契約で、診断パネルが受けて件数つきで出す。',
  },
  'src/renderer/data/recordEncryption.ts': {
    policy: 'surfaced',
    why: '暗号化の有効化/解除に伴う再封緘。投げれば有効化そのものが止まり、設定画面がその文面を出す (salt は先に保存済み)。',
  },
};

/**
 * `void` で捨ててよいと認めたファイル。**レコードストアを触らない**もの限定
 * (下の検査がそれを機械的に確かめる)。名前が一般的すぎる動詞 (`save`) は
 * 走査に当たってしまうので、当たったものを消すのではなく理由を書いて残す。
 */
const DROP_ALLOWED: Record<string, string> = {
  'src/renderer/pages/TalentPage.tsx':
    'talent の save-state は serviceHub の action 経由で、拒否は関数の中の try/catch/finally が受けて「保存できませんでした」を自分の欄に出す。レコードストアは触らない。',
};

interface Site {
  readonly file: string;
  readonly line: number;
}

/** コメント行は数えない (説明の中に `store.importAll()` と書くことがある)。 */
function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
}

function findSites(files: readonly string[], pattern: RegExp): Site[] {
  const found: Site[] = [];
  for (const abs of files) {
    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!isComment(line) && pattern.test(line)) {
          found.push({ file: relative(REPO, abs).split('\\').join('/'), line: i + 1 });
        }
      });
  }
  return found;
}

function rendererSources(): string[] {
  return globSync(['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    // 保存層そのもの (store.ts) は自分の中で this.* を呼ぶので対象外。
    // 保管庫そのもの (store.ts / library.ts) は自分の中で this.* を呼ぶので対象外。
    ignore: ['**/__tests__/**', 'src/renderer/data/store.ts', 'src/renderer/library/library.ts'],
  });
}

const SOURCES = rendererSources();
const WRITES = findSites(SOURCES, WRITE);
const DROPS = findSites(SOURCES, DROPPED);

describe('レコードストアの書き込みの台帳', () => {
  it('走査が生きている (床: 10 か所以上)', () => {
    // 走査が死んだら「違反 0 件」で通ってしまうので、実測 (13) に床を置く。
    expect(WRITES.length).toBeGreaterThanOrEqual(10);
  });

  it('★ 台帳に無い書き込みは無い', () => {
    const undeclared = WRITES.filter((s) => !(s.file in LEDGER)).map((s) => `${s.file}:${s.line}`);
    expect(undeclared, '新しい書き込みは台帳 (LEDGER) に理由つきで登録すること').toEqual([]);
  });

  it('★ 台帳に載っているのに現物が無い項目は無い (腐った台帳を許さない)', () => {
    const withSites = new Set(WRITES.map((s) => s.file));
    const stale = Object.keys(LEDGER).filter((f) => !withSites.has(f));
    expect(stale, '書き込みが消えたら台帳からも消すこと').toEqual([]);
  });

  it('★ 報せずに捨てている呼び出しは無い (捨てるなら fireReported を通す)', () => {
    const dropped = DROPS.filter((s) => !(s.file in DROP_ALLOWED)).map((s) => `${s.file}:${s.line}`);
    expect(dropped, 'void で捨てると拒否が宙に浮き、画面には何も出ない').toEqual([]);
  });

  it('★ 捨ててよいと認めたファイルは、レコードストアを触っていない', () => {
    // 認めた理由 (「action 経由なので自分で出している」) が本当かを機械的に確かめる。
    // useCollection を使い始めたら、この検査が先に鳴る。
    const touching = Object.keys(DROP_ALLOWED).filter((f) =>
      readFileSync(join(REPO, f), 'utf8').includes('useCollection'),
    );
    expect(touching, 'レコードストアを触るなら fireReported を通すこと').toEqual([]);
  });

  it('捨ててよいと認めた項目には現物があり、理由が書かれている', () => {
    const files = new Set(DROPS.map((s) => s.file));
    expect(Object.keys(DROP_ALLOWED).filter((f) => !files.has(f))).toEqual([]);
    expect(Object.entries(DROP_ALLOWED).filter(([, why]) => why.length < 20)).toEqual([]);
  });

  it('入口は 1 つだけ', () => {
    const entrances = Object.entries(LEDGER)
      .filter(([, e]) => e.policy === 'entrance')
      .map(([f]) => f);
    expect(entrances).toEqual(['src/renderer/data/useCollection.ts']);
  });

  it('理由は 20 字以上 (一言で済ませると次の人が判断できない)', () => {
    const thin = Object.entries(LEDGER)
      .filter(([, e]) => e.why.length < 20)
      .map(([f]) => f);
    expect(thin).toEqual([]);
  });

  it('標本: 走査は画面 (.tsx) の中も見ている', () => {
    expect(WRITES.some((s) => s.file.endsWith('.tsx'))).toBe(true);
  });

  it('標本: 2 つの保管庫の**両方**を見ている (片方だけの走査で通らない)', () => {
    const text = (f: string) => readFileSync(join(REPO, f), 'utf8');
    const hit = (needle: string) =>
      WRITES.some((s) => text(s.file).split('\n')[s.line - 1]?.includes(needle) === true);
    expect(hit('getRecordStore()'), '業務レコードの書き込みを 1 件も拾っていない').toBe(true);
    expect(hit('getLibrary()'), 'ライブラリの書き込みを 1 件も拾っていない').toBe(true);
  });

  it('対照: 台帳に無いファイルを混ぜると、両方の規則が鳴る', () => {
    const fixture = [join(__dirname, 'fixtures', 'undeclaredDeviceWrite.txt')];
    const writes = findSites(fixture, WRITE);
    expect(writes).toHaveLength(1);
    expect(writes.filter((s) => !(s.file in LEDGER))).toHaveLength(1);
    expect(findSites(fixture, DROPPED)).toHaveLength(1);
  });

  it('対照: fireReported を通した呼び出しは「捨てている」に数えない', () => {
    expect(DROPPED.test('onClick={() => fireReported(add())}')).toBe(false);
    expect(DROPPED.test('onClick={() => void add()}')).toBe(true);
  });
});
