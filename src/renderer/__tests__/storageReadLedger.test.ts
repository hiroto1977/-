/**
 * **端末から読むときに「読めなかった」をどう扱うかは、台帳に載っている場所からしか決めない。**
 * (2026-09-17 · パス 310。`storageWritePolicy.test.ts` の**読みの側**の台帳)
 *
 * 隣の `storageReadPolicy.test.ts` (2026-09-06) は「`getItem` / `removeItem` が**同じ関数の中で
 * 失敗を受ける**か」(try の内側か) を見る —— 投げるか投げないかの話。ここは**受けた後にどう扱うか**
 * (畳むのか・言うのか・断るのか) を、場所ごとに方針と理由で留める。2 つは対で、片方では足りない:
 * try の中で `return []` と畳めば前者は通る (パス 309 の stocks がそれだった)。
 *
 * 書き込みには 2026-09-06 から台帳が在った。読みには無く、その間に同じ穴が 4 回出た:
 *
 *   チームレーダーの保存状態 (パス 120) / 人材育成 (パス 121) / 書類スタジオと
 *   チームレーダーの下書き (パス 160) / 銘柄のウォッチリスト (パス 309)
 *
 * どれも `catch { return 既定 }` で **「まだ無い」と「読めなかった」を同じ見た目に畳み**、
 * 次の書き込みが元の保存値を上書きする形だった。パス 160 の走査は `readLocalJson` へ寄せた
 * 2 つを直したが、**残りの `getItem` を数える物が無かった**ので、パス 309 の穴は
 * 「壊れていれば空配列」という docblock のまま 5 日残った。
 *
 * 規則: `src/renderer` の `localStorage.getItem` / `sessionStorage.getItem`、および入口
 * (`data/localWrite.ts` の `readLocalString` / `readLocalJson`) の呼び出しは、この台帳に
 * **方針と理由つきで**載っていなければならない。方針は 4 通り:
 *
 *   entrance     … 「読めた」と「保存領域そのものを読めなかった」を分けて返す入口そのもの
 *   three-state  … 「まだ無い」「読めなかった」「読めた」を分け、読めなかった時は画面が言う
 *                  か書き込みを断る (上書きで失わせない)
 *   fold         … 読めなければ既定へ倒す。**失う物と、失ってよい理由**を書く
 *                  (書きの台帳で deliberate-swallow と宣言した物と同じ物であること)
 *   abort        … 読めなければその操作をやり直しへ倒す (途中まで残った状態で続けない)
 *
 * 台帳は**双方向**に検査する —— 載っているのに現物が無い項目も落とす。走査が死んだら
 * 落ちるように件数の床も置く。`three-state` の項は、読めなかったことを運ぶ語
 * (`readable` / `unreadable` / `degraded`) を実際に持っていなければならない ——
 * 方針だけ書いて中身が `fold` の物を台帳が「三状態」と呼ばないため。
 */
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

type Policy = 'entrance' | 'three-state' | 'fold' | 'abort';

interface LedgerEntry {
  readonly policy: Policy;
  /** その場所が読む鍵 (定数名でも実際の鍵でもよい。読む人が追えることが目的)。 */
  readonly keys: readonly string[];
  /** 読めなかった時をそう扱ってよい理由。空欄と一言は認めない。 */
  readonly why: string;
}

const REPO = join(__dirname, '..', '..', '..');
const ENTRANCE = 'src/renderer/data/localWrite.ts';

/**
 * 台帳。**新しい読み取り箇所を足したら、ここにも足さないと落ちる。**
 * `fold` を選ぶときは「読めなくても利用者が失って困らない」ことを書く ——
 * 利用者が書いた物・明示に保存した物なら、それは `three-state` にするか入口を通すこと。
 */
const LEDGER: Record<string, LedgerEntry> = {
  [ENTRANCE]: {
    policy: 'entrance',
    keys: ['(呼び出し側が渡す鍵)'],
    why: '「読めた」と「保存領域そのものを読めなかった」を分けて返す唯一の入口 (パス 160)。壊れた保存値は呼び出し側の sanitize が既定へ倒す。',
  },
  'src/renderer/pages/DocstudioPage.tsx': {
    policy: 'three-state',
    keys: ['servicehub.docstudio.v1'],
    why: '入口 (readLocalJson) を通す。保存領域を読めなければ画面がそう言う (パス 160)。壊れた下書きは sanitizeDocstudioStore が空へ倒す —— 下書きは自動保存で、画面は「自動保存」と言う代わりに読めなかったことを言う。',
  },
  'src/renderer/pages/TeamRadarPage.tsx': {
    policy: 'three-state',
    keys: ['servicehub.teamradar.draft.v1'],
    why: '入口 (readLocalJson) を通す。読めなかった下書きは書き戻さない (パス 160: 読みを断った localStorage は書きも断る)。',
  },
  'src/renderer/components/GoogleConnectCard.tsx': {
    policy: 'three-state',
    keys: ['google-client-id'],
    why: '入口 (readLocalString) を通す。読めなければ「1 回貼れば各ページで使えます」を取り下げる (パス 86 / 155)。パス 310 まで同じ形を自前の try/catch で写しており、プライベートウィンドウの案内文だけが入口側に在った。',
  },
  'src/renderer/theme.ts': {
    policy: 'three-state',
    keys: ['servicehub.theme'],
    why: '入口 (readLocalString) を通す。読めなければ既定のライトで描き、設定画面がその理由を言う (パス 317)。壊れた保存値は sanitizeThemeChoice が既定へ倒す —— 選択は設定画面から選び直せる。',
  },
  'src/renderer/web-shim.ts': {
    policy: 'three-state',
    keys: ['servicehub.talent.state.v1', 'teamradar.state'],
    why: 'shared の readStoredTalent / readStoredTeamRadar が none / unreadable / saved を返し、画面は storedNote で言う (パス 120 / 121)。',
  },
  'src/renderer/data/stocksWatchlistWeb.ts': {
    policy: 'three-state',
    keys: ['stocks.watchlist'],
    why: 'shared の readStoredWatchlist が none / unreadable / saved (落とした件数つき) を返し、画面は storedNote で言う。登録・解除は警告のうえ通す (パス 309)。',
  },
  'src/renderer/data/emotionsWeb.ts': {
    policy: 'three-state',
    keys: ['emotions.store'],
    why: '読めなかった・落とした要素が在れば degraded に数え、書き込みは断る (clear-history だけは通す —— 壊れた保存先から抜け出す唯一の道)。',
  },
  'src/renderer/data/recordEncryption.ts': {
    policy: 'three-state',
    keys: ['servicehub.recordEncryption'],
    why: '読めなければ degraded に数え、assertMetaWritable が上書きを断って salt を失わせない (投げると控えを取り出す画面ごと消えるので投げない)。',
  },
  'src/renderer/oauth/pkceSession.ts': {
    policy: 'abort',
    keys: ['pkce verifier / state / clientId / redirectUri (sessionStorage)'],
    why: '4 つ揃わなければ null を返し、交換は「やり直してください」へ倒す。途中まで残った状態で交換を試させない。',
  },
  'src/renderer/App.tsx': {
    policy: 'fold',
    keys: ['servicehub.recents', 'servicehub.favorites'],
    why: '最近開いた / お気に入りの並び。読めなければ空から積み直す —— 失うのは並びだけ (書きの台帳でも deliberate-swallow)。',
  },
  'src/renderer/components/ChatbotWidget.tsx': {
    policy: 'fold',
    keys: ['chatbot-history', 'chatbot-requests', 'chatbot-ollama-model'],
    why: '会話の表示履歴は失うのは過去の吹き出しだけ (書きの台帳と同じ理由)。要望の記録は「壊れた保存値はもう誰にも読めないので空から積み直す」と code に理由が在り、記録の成否は recordRequest が返す。モデル名は既定に戻るだけ。',
  },
  'src/renderer/pages/AssistantPage.tsx': {
    policy: 'fold',
    keys: ['assistant-history', 'assistant-theme', 'assistant-provider'],
    why: '会話の表示履歴と配色・提供元の選択。読めなければ既定に戻るだけで、打ち込んだ物は消えない (書きの台帳と同じ)。',
  },
  'src/renderer/plan/usePlan.ts': {
    policy: 'fold',
    keys: ['servicehub.plan'],
    why: '料金プランの選択。読めなければ既定のプランに戻るだけで、機能は招待コード側 (internalLicense) が決める。',
  },
  'src/renderer/plan/internalLicense.ts': {
    policy: 'fold',
    keys: ['servicehub.internalLicense'],
    why: '招待コードの引き換え状態。読めなければ未適用として扱い、コードは単回消費ではないので入れ直せる。',
  },
  'src/renderer/network/ollamaWeb.ts': {
    policy: 'fold',
    keys: ['servicehub.ollama.endpoint', 'servicehub.ollama.port'],
    why: '接続先の文字列。読めなければ空 = 既定の接続先で、設定画面から入れ直せる (秘密は持たない)。',
  },
  'src/renderer/pages/Microsoft365Page.tsx': {
    policy: 'fold',
    keys: ['ms365-client-id'],
    why: 'OAuth のクライアント ID (秘密ではない)。画面は保存を約束していないので、読めなければ空欄から入れ直す (書きの台帳と同じ)。',
  },
};

interface Site {
  readonly file: string;
  readonly line: number;
  /** 生の getItem か、入口の呼び出しか。 */
  readonly via: 'getItem' | 'entrance';
}

const RAW_READ = /(?:localStorage|sessionStorage)\.getItem\(/;
const ENTRANCE_CALL = /\breadLocal(?:Json|String)\(/;

/** 走査本体。`files` は絶対パス。 */
export function findReadSites(files: readonly string[]): Site[] {
  const found: Site[] = [];
  for (const abs of files) {
    const file = relative(REPO, abs).split('\\').join('/');
    const text = readOriginalSource(abs);
    text.split('\n').forEach((line, i) => {
      if (RAW_READ.test(line)) found.push({ file, line: i + 1, via: 'getItem' });
      // 入口の**定義**は数えない (呼び出しだけ)。
      else if (file !== ENTRANCE && ENTRANCE_CALL.test(line)) found.push({ file, line: i + 1, via: 'entrance' });
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

const SITES = findReadSites(rendererSources());

/** 読めなかったことを運ぶ語。`three-state` の項はこのどれかを実際に持つ。 */
const SECOND_STATE = /\breadable\b|\bunreadable\b|[dD]egraded/;

describe('端末からの読み取りの台帳 (パス 310)', () => {
  it('走査が生きている (床: 15 か所以上)', () => {
    // 走査が死んだら「違反 0 件」で通ってしまうので、実測 (22) に床を置く。
    expect(SITES.length).toBeGreaterThanOrEqual(15);
  });

  it('★ 台帳に無い読み取り箇所は無い', () => {
    const undeclared = SITES.filter((s) => !(s.file in LEDGER)).map((s) => `${s.file}:${s.line}`);
    expect(undeclared, '新しい getItem / readLocal* は台帳 (LEDGER) に方針と理由つきで登録すること').toEqual([]);
  });

  it('★ 台帳に載っているのに現物が無い項目は無い (腐った台帳を許さない)', () => {
    const withSites = new Set(SITES.map((s) => s.file));
    const stale = Object.keys(LEDGER).filter((f) => !withSites.has(f));
    expect(stale, '読み取り箇所が消えたら台帳からも消すこと').toEqual([]);
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

  it('入口は 1 つだけで、生の getItem を持つ', () => {
    const entrances = Object.entries(LEDGER)
      .filter(([, e]) => e.policy === 'entrance')
      .map(([f]) => f);
    expect(entrances).toEqual([ENTRANCE]);
    expect(SITES.some((s) => s.file === ENTRANCE && s.via === 'getItem')).toBe(true);
  });

  it('★ three-state の項は、読めなかったことを運ぶ語を実際に持つ (方針だけの三状態を許さない)', () => {
    const hollow = Object.entries(LEDGER)
      .filter(([f, e]) => e.policy === 'three-state' && !SECOND_STATE.test(readOriginalSource(join(REPO, f))))
      .map(([f]) => f);
    expect(hollow, 'readable / unreadable / degraded のどれも持たない三状態は、実際には fold である').toEqual([]);
  });

  it('対照: fold の項の多くはその語を持たない (上の検査が空振りしていない)', () => {
    // 語の検査は「three-state と名乗る物が中身も三状態か」を見る。fold 側にも語が在れば
    // 検査は何も見分けていない —— 標本として fold の過半が語を持たないことを確かめる。
    const folds = Object.entries(LEDGER).filter(([, e]) => e.policy === 'fold');
    const without = folds.filter(([f]) => !SECOND_STATE.test(readOriginalSource(join(REPO, f))));
    expect(without.length).toBeGreaterThan(folds.length / 2);
  });

  it('標本: 走査は画面 (.tsx) の中も見ている', () => {
    // 「無い」の検査 (上の undeclared) は、走査が .tsx を見ていなければ空で通る。
    expect(SITES.some((s) => s.file === 'src/renderer/pages/AssistantPage.tsx')).toBe(true);
  });

  it('★ 入口へ寄せた画面には、生の getItem が残っていない', () => {
    // パス 160 で書類スタジオ / Team Radar の下書きを、パス 310 で Google の「かんたん接続」
    // カードを入口へ寄せた。戻っていないことを直接見る (戻れば台帳の via も変わる)。
    const moved = SITES.filter(
      (s) =>
        s.via === 'getItem'
        && (s.file === 'src/renderer/pages/DocstudioPage.tsx'
          || s.file === 'src/renderer/pages/TeamRadarPage.tsx'
          || s.file === 'src/renderer/components/GoogleConnectCard.tsx'),
    );
    expect(moved).toEqual([]);
    expect(SITES.some((s) => s.file === 'src/renderer/components/GoogleConnectCard.tsx' && s.via === 'entrance')).toBe(true);
  });

  it('対照: 台帳に無いファイルを混ぜると鳴る', () => {
    // 規則が**実際に当たる**ことを、同じ走査で確かめる (綴り違いで黙る検査にしない)。
    const fake = findReadSites([join(__dirname, 'fixtures', 'undeclaredRead.txt')]);
    expect(fake).toHaveLength(1);
    expect(fake[0]!.via).toBe('getItem');
    const undeclared = fake.filter((s) => !(s.file in LEDGER));
    expect(undeclared).toHaveLength(1);
  });
});
