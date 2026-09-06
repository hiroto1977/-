/**
 * **端末への書き込みは、台帳に載っている場所からしか行わない。**
 *
 * 2026-09-06 の 2 パスで、「保存したと画面が言うのに保存できていない」を 2 系統直した
 * (書類スタジオ / Team Radar の `catch {}`、書き出し 3 か所の `catch {}`)。どちらも
 * **後から足された 1 行**で、誰の目にも留まらずに入っていた。同じ物がまた足されるのを
 * 止めるのがこの検査である。
 *
 * 規則: `src/renderer` の `localStorage.setItem` / `sessionStorage.setItem` は
 *
 *   - `data/localWrite.ts` (成否を返す唯一の入口) か、
 *   - この台帳に**理由つきで**載っている場所
 *
 * のどちらかでなければならない。台帳には「失敗をどう扱うか」を 3 通りで書く:
 *
 *   entrance            … 成否を返す入口そのもの
 *   surfaced            … 投げる / 失敗を返す → 画面か action の結果に出る
 *   deliberate-swallow  … 捨てる。**捨ててよい理由**を書く (失って困る物でないこと)
 *
 * 台帳は**双方向**に検査する —— 載っているのに現物が無い項目も落とす (腐った台帳は
 * 「守っているつもり」を生む)。走査が死んだら落ちるように件数の床も置く。
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';

type Policy = 'entrance' | 'surfaced' | 'deliberate-swallow';

interface LedgerEntry {
  readonly policy: Policy;
  /** その場所が書く鍵 (定数名でも実際の鍵でもよい。読む人が追えることが目的)。 */
  readonly keys: readonly string[];
  /** 失敗をそう扱ってよい理由。空欄と一言は認めない。 */
  readonly why: string;
}

const REPO = join(__dirname, '..', '..', '..');

/**
 * 台帳。**新しい保存箇所を足したら、ここにも足さないと落ちる。**
 * `deliberate-swallow` を選ぶときは「失っても利用者が困らない」ことを書く ——
 * 書けたと画面が言うなら、それは `surfaced` にするか `localWrite` を通すこと。
 */
const LEDGER: Record<string, LedgerEntry> = {
  'src/renderer/data/localWrite.ts': {
    policy: 'entrance',
    keys: ['(呼び出し側が渡す鍵)'],
    why: '成否を返す唯一の入口。ここだけが setItem を直接呼んでよい理由は、失敗の種別を文面に写して返すため。',
  },
  'src/renderer/App.tsx': {
    policy: 'deliberate-swallow',
    keys: ['servicehub.recents', 'servicehub.favorites'],
    why: '最近開いた / お気に入りの並び。失っても次に開いた物から積み直せるので、警告を出す方が邪魔になる。',
  },
  'src/renderer/components/ChatbotWidget.tsx': {
    policy: 'deliberate-swallow',
    keys: ['chatbot-history'],
    why: '会話の表示履歴。会話そのものは続けられ、失うのは過去の吹き出しだけ。要望の記録 (chatbot-requests) は返事が「記録します」と言い切るので localWrite を通す。',
  },
  'src/renderer/components/GoogleConnectCard.tsx': {
    policy: 'deliberate-swallow',
    keys: ['google-client-id'],
    why: 'OAuth のクライアント ID (秘密ではない)。保存できなくてもサインインはそのまま進み、次回に入れ直せる。',
  },
  'src/renderer/pages/Microsoft365Page.tsx': {
    policy: 'deliberate-swallow',
    keys: ['ms365-client-id'],
    why: 'OAuth のクライアント ID (秘密ではない)。GoogleConnectCard と同じ理由で、失っても入れ直すだけで済む。',
  },
  'src/renderer/pages/AssistantPage.tsx': {
    policy: 'deliberate-swallow',
    keys: ['assistant-history', 'assistant-provider', 'assistant-theme'],
    why: '会話の表示履歴と、提供元・配色の選択。どれも失っても既定に戻るだけで、打ち込んだ物は消えない。',
  },
  'src/renderer/pages/OllamaPage.tsx': {
    policy: 'surfaced',
    keys: ['servicehub.ollama.endpoint'],
    why: '接続先の保存。「保存しました」の表示を setItem の**後**に置いているので、失敗したときに成功とは言わない。',
  },
  'src/renderer/plan/usePlan.ts': {
    policy: 'deliberate-swallow',
    keys: ['servicehub.plan'],
    why: '料金プランの選択。失っても既定のプランに戻るだけで、機能は招待コード側 (internalLicense) が決める。',
  },
  'src/renderer/plan/internalLicense.ts': {
    policy: 'deliberate-swallow',
    keys: ['servicehub.internalLicense'],
    why: '招待コードの引き換え状態。コードは単回消費ではないので、保存できなくても入れ直せる (このセッションは有効として扱う)。',
  },
  'src/renderer/oauth/pkceSession.ts': {
    policy: 'surfaced',
    keys: ['pkce verifier / state / clientId / redirectUri (sessionStorage)'],
    why: 'トークン交換に要る 4 つ。捨てると後の交換が理由不明で失敗するので、投げて呼び出し側に伝える。',
  },
  'src/renderer/data/emotionsWeb.ts': {
    policy: 'surfaced',
    keys: ['emotions.store'],
    why: '気分の記録。壊れた保管値には書かない方針で、投げた失敗は shim が action_failed に写して画面に出す。',
  },
  'src/renderer/data/recordEncryption.ts': {
    policy: 'surfaced',
    keys: ['servicehub.recordEncryption'],
    why: '暗号化の salt と KCV。投げれば有効化そのものが止まる —— 封緘より先に保存する順序なので、失敗しても失う物が無い。',
  },
  'src/renderer/data/stocksWatchlistWeb.ts': {
    policy: 'surfaced',
    keys: ['stocks.watchlist'],
    why: '銘柄のウォッチリスト。投げた失敗は invoke の失敗として返り、画面がその文面を出す。',
  },
  'src/renderer/web-shim.ts': {
    policy: 'surfaced',
    keys: ['servicehub.talent.state.v1', 'teamradar.state'],
    why: '人材育成の状態は失敗を action_failed で返し、画面が「保存できませんでした」を出す。teamradar.state は読む所が無い (実質デッド) と別途記録済み。',
  },
};

interface Site {
  readonly file: string;
  readonly line: number;
}

/** 走査本体。`files` は絶対パス。 */
function findSites(files: readonly string[]): Site[] {
  const found: Site[] = [];
  for (const abs of files) {
    const text = readFileSync(abs, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (/(?:localStorage|sessionStorage)\.setItem\(/.test(line)) {
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
    ignore: ['**/__tests__/**'],
  });
}

const SITES = findSites(rendererSources());

describe('端末への書き込みの台帳', () => {
  it('走査が生きている (床: 15 か所以上)', () => {
    // 走査が死んだら「違反 0 件」で通ってしまうので、実測 (17) に床を置く。
    expect(SITES.length).toBeGreaterThanOrEqual(15);
  });

  it('★ 台帳に無い保存箇所は無い', () => {
    const undeclared = SITES.filter((s) => !(s.file in LEDGER)).map((s) => `${s.file}:${s.line}`);
    expect(undeclared, '新しい setItem は台帳 (LEDGER) に理由つきで登録すること').toEqual([]);
  });

  it('★ 台帳に載っているのに現物が無い項目は無い (腐った台帳を許さない)', () => {
    const withSites = new Set(SITES.map((s) => s.file));
    const stale = Object.keys(LEDGER).filter((f) => !withSites.has(f));
    expect(stale, '保存箇所が消えたら台帳からも消すこと').toEqual([]);
  });

  it('理由は 20 字以上 (一言で済ませると次の人が判断できない)', () => {
    const thin = Object.entries(LEDGER)
      .filter(([, e]) => e.why.length < 20)
      .map(([f]) => f);
    expect(thin).toEqual([]);
  });

  it('鍵が 1 つも書かれていない項目は無い', () => {
    const empty = Object.entries(LEDGER)
      .filter(([, e]) => e.keys.length === 0)
      .map(([f]) => f);
    expect(empty).toEqual([]);
  });

  it('成否を返す入口は 1 つだけ', () => {
    const entrances = Object.entries(LEDGER)
      .filter(([, e]) => e.policy === 'entrance')
      .map(([f]) => f);
    expect(entrances).toEqual(['src/renderer/data/localWrite.ts']);
  });

  it('標本: 走査は画面 (.tsx) の中も見ている', () => {
    // 「無い」の検査 (上の undeclared) は、走査が .tsx を見ていなければ空で通る。
    expect(SITES.some((s) => s.file === 'src/renderer/pages/AssistantPage.tsx')).toBe(true);
  });

  it('★ localWrite を通した画面には、生の setItem が残っていない', () => {
    // 2026-09-06 のパスで書類スタジオ / Team Radar / 要望の記録を入口へ寄せた。
    // ここが再び現れたら、そのときは台帳にも載るので上の検査が鳴る —— この検査は
    // 「寄せた物が戻っていない」ことを直接見る。
    const moved = SITES.filter(
      (s) =>
        s.file === 'src/renderer/pages/DocstudioPage.tsx'
        || s.file === 'src/renderer/pages/TeamRadarPage.tsx',
    );
    expect(moved).toEqual([]);
  });

  it('対照: 台帳に無いファイルを混ぜると鳴る', () => {
    // 規則が**実際に当たる**ことを、同じ走査で確かめる (綴り違いで黙る検査にしない)。
    const fake = findSites([join(__dirname, 'fixtures', 'undeclaredWrite.txt')]);
    expect(fake).toHaveLength(1);
    const undeclared = fake.filter((s) => !(s.file in LEDGER));
    expect(undeclared).toHaveLength(1);
  });
});
