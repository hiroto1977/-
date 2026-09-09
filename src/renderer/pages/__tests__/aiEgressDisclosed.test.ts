/**
 * **Anthropic へ送る 5 画面のうち、断りが在るのは 1 つだけだった。** (2026-09-09 · パス 106)
 *
 * 実測 (直す前):
 *
 * | 画面 | Anthropic へ送る物 | egress の断り |
 * | --- | --- | --- |
 * | `StocksPage` | 質問文 + ウォッチリストのティッカー | **在った** (2026-08-23) |
 * | `BusinessPage` | 質問文 + **各事業カテゴリの現在 KPI・売上トレンド (JSON)** | **無かった** (免責のみ) |
 * | `EmotionsPage` | **貼り付けた本文そのまま** | **無かった** |
 * | `GmailPage` | 受信スレッドの**件名と送信者のメールアドレス** | **無かった** |
 * | `SlackPage` | チャンネル名と目的 | **無かった** |
 *
 * `EmotionsPage` が最も重い。入力欄の placeholder が「分析したいテキストを貼り付け —
 * メール本文、**自分の日記**、**誰かのメッセージ**など」と、最も秘めた内容と
 * **第三者の文面** (利用者に共有の同意が無い可能性がある) を明示的に誘っている。
 * ティッカー記号を断っている画面が在り、日記を断っていない画面が在った。
 *
 * `StocksPage` に断りを足したときのコメントはこう書いてある ——
 * 「このアプリは他の画面 (クラウド同期・保存状態) では『何が送られないか』まで
 * 書いているのに、**AI の画面**だけ書いていなかった (2026-08-23)」。
 * **「AI の画面」を単数として扱っており、実際は 5 つ在った** (パス 66 と同じ形)。
 *
 * ## 走査が 2 つ余分に見つけた (私の見立ては 3 画面だった)
 *
 * 最初は 3 画面だと思って直し、この走査を書いたら `GmailPage` と `SlackPage` が
 * 落ちた。どちらも `invoke('emotions', 'analyze-text', …)` を呼んでおり、
 * **`emotions` の action を他の画面から借りている**ので、AI の画面を「AI らしい名前の
 * 画面」で数えると漏れる。走査が私の見立てを訂正した。
 *
 * **送る物も実測して書いた。** 最初「メール本文」「Slack のメッセージ」と書きかけたが、
 * 実物は `threads.map(t => \`- ${t.subject} (from ${t.sender})\`)` と
 * `channels.map(c => \`#${c.name}: ${c.purpose}\`)` で、**本文は送っていない**。
 * 断りに嘘を書けば、それはこのパスが直している欠陥そのものになる。
 *
 * ## この検査が守るもの
 *
 * 文面を 5 度書かせない (`shared/aiEgressNotice.ts` が 1 か所) ことと、
 * **Anthropic へ送る画面が黙って 6 つ目に増えないこと**。後者が要点 ——
 * 画面を直しても、走査が無ければ次の画面はまた黙る。実際この走査は、私が
 * 「3 画面」と思って直した直後に 2 つ余分を見つけた。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AI_EGRESS_RECIPIENT_ANTHROPIC,
  aiEgressNoticeLines,
} from '../../../shared/aiEgressNotice';

const PAGES = path.resolve(__dirname, '..');
const read = (f: string): string => fs.readFileSync(path.join(PAGES, f), 'utf8');

/** Anthropic へ本文を送る action (`web-shim.ts` / main の client がどちらも実装)。 */
const AI_ACTIONS = ['advise', 'analyze-text'] as const;

/** `pages/` の .tsx をすべて。 */
function pageFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') walk(p);
        continue;
      }
      if (e.name.endsWith('.tsx')) out.push(p);
    }
  };
  walk(PAGES);
  return out;
}

/**
 * 断りの部品を**タグの境目つき**で探す。`includes('<AiEgressNotice')` は
 * `<AiEgressNoticeXX` にも当たるので、部品の名前を書き損じた画面を断り在りと
 * 数えてしまう (2026-09-09 の対照 A がこれで鳴らず、検査の穴として見つかった)。
 */
const DRAWS_NOTICE = /<AiEgressNotice[\s/>]/;

/** コメントを落とした本体 (説明の中の綴りを配線と読まない)。 */
function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

/**
 * `what:` に渡している字面を取り出す。**入れ子のテンプレート**
 * (`` `…${cond ? ` 25 件` : ` N 件`}…` ``) で切れないように、`${` の中は
 * 波括弧の対応で読み飛ばす —— 素朴な `` /`[^`]*`/ `` は内側の backtick で止まる。
 */
function whatOf(src: string): string {
  const body = code(src);
  const at = body.indexOf('what:');
  if (at < 0) return '';
  let i = at + 'what:'.length;
  while (body[i] === ' ' || body[i] === '\n') i += 1;
  const quote = body[i];
  if (quote !== '`' && quote !== "'") return '';
  const start = i;
  i += 1;
  let depth = 0;
  while (i < body.length) {
    const c = body[i];
    if (quote === '`' && c === '$' && body[i + 1] === '{') {
      depth += 1;
      i += 2;
      continue;
    }
    if (depth > 0) {
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      i += 1;
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === quote) return body.slice(start, i + 1);
    i += 1;
  }
  return '';
}

/** その画面が AI の action を invoke しているか。 */
function invokesAi(src: string): boolean {
  const body = code(src);
  return AI_ACTIONS.some((a) => new RegExp(`invoke<[^>]*>\\([^)]*'${a}'`).test(body) || body.includes(`'${a}'`));
}

describe('機構 — 断りの文面は 1 か所が持ち、書けることだけを書く', () => {
  it('★ 送る物と送り先を必ず名指しする', () => {
    const lines = aiEgressNoticeLines({
      what: '入力したテキスト本文',
      recipient: AI_EGRESS_RECIPIENT_ANTHROPIC,
    });
    expect(lines[0]).toContain('入力したテキスト本文');
    expect(lines[0]).toContain(AI_EGRESS_RECIPIENT_ANTHROPIC);
    // 端末内で完結しないことを述べる (これが断りの本体)。
    expect(lines.join('\n')).toContain('端末内で完結しません');
  });

  it('★ 受け取った側の扱いは主張しない (SecurityPage の HIBP と同じ方針)', () => {
    const text = aiEgressNoticeLines({ what: 'x', recipient: 'Z' }).join('\n');
    expect(text).toContain('確かめられないため主張しません');
    // **安全だとは言わない。** 言えないことを言わないための検査。
    expect(text).not.toContain('安全');
    expect(text).not.toContain('保存されません');
    expect(text).not.toContain('学習に使われません');
  });

  it('★ 第三者の文面を貼る誘いがある画面だけ、同意の 1 行が増える', () => {
    const withOthers = aiEgressNoticeLines({ what: 'x', recipient: 'Z', mayIncludeOthers: true });
    const without = aiEgressNoticeLines({ what: 'x', recipient: 'Z' });
    expect(withOthers.join('\n')).toContain('その人の同意を確認してください');
    // 対照: 既定では出ない (どの画面でも同じ文になっていない)。
    expect(without.join('\n')).not.toContain('同意');
    expect(withOthers.length).toBe(without.length + 1);
  });

  it('★ プロキシの話を書かない (Anthropic へは直接送るので嘘になる)', () => {
    const text = aiEgressNoticeLines({ what: 'x', recipient: 'Z', mayIncludeOthers: true }).join('\n');
    // `fetchViaProxy` を通るのは notion / atlassian / cloudflare だけ。
    expect(text).not.toContain('プロキシ');
    expect(text).not.toContain('Cloudflare');
  });
});

describe('Anthropic へ送る画面すべてに断りが在る (走査)', () => {
  it('★ 走査規則がタグの境目で当たる (名前の書き損じを断りと数えない)', () => {
    // 規則を標本に当てる。前方一致だとこの 2 つが区別できない。
    expect(DRAWS_NOTICE.test('  <AiEgressNotice\n    subject={{')).toBe(true);
    expect(DRAWS_NOTICE.test('  <AiEgressNotice subject={s} />')).toBe(true);
    expect(DRAWS_NOTICE.test('  <AiEgressNotice/>')).toBe(true);
    expect(DRAWS_NOTICE.test('  <AiEgressNoticeXX subject={s} />'), '別の部品を断りと数えている').toBe(false);
    expect(DRAWS_NOTICE.test('  <div>断りはここに無い</div>')).toBe(false);
  });

  it('★ 走査が実物に当たっている (AI の画面を見つけている)', () => {
    const ai = pageFiles().filter((f) => invokesAi(fs.readFileSync(f, 'utf8')));
    // **標本が空なら何も検査していない。** 実測で 5 画面。
    expect(ai.length, 'AI の action を呼ぶ画面が見つからない (走査が壊れている)').toBeGreaterThanOrEqual(5);
    const names = ai.map((f) => path.basename(f)).sort();
    // AI らしい名前の画面だけでは足りない —— Gmail / Slack は emotions の action を借りる。
    for (const n of ['StocksPage.tsx', 'BusinessPage.tsx', 'EmotionsPage.tsx', 'GmailPage.tsx', 'SlackPage.tsx']) {
      expect(names, `${n} を走査が見落としている`).toContain(n);
    }
  });

  it('★ 送る画面はすべて断りを描く (6 つ目が黙って増えない)', () => {
    const missing: string[] = [];
    for (const f of pageFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      if (!invokesAi(src)) continue;
      if (!DRAWS_NOTICE.test(code(src))) missing.push(path.basename(f));
    }
    expect(
      missing,
      'Anthropic へ利用者のデータを送るのに、何が外へ出るかを述べていない画面がある:\n' + missing.join('\n'),
    ).toEqual([]);
  });

  it('★ どの画面も文面を自前で書かない (共有の 1 か所から読む)', () => {
    for (const f of pageFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      if (!invokesAi(src)) continue;
      const body = code(src);
      // 「へ送信されます」の文を画面が持っていたら、それは写しである。
      expect(body, `${path.basename(f)} が断りの文面を自前で持っている`).not.toContain(
        'へ送信されます',
      );
    }
  });
});

describe('画面ごとに「何を送るか」を自分の言葉で埋めている', () => {
  const AI_PAGES = [
    'StocksPage.tsx',
    'BusinessPage.tsx',
    'EmotionsPage.tsx',
    'GmailPage.tsx',
    'SlackPage.tsx',
  ];

  it('★ 走査規則が実物に当たる (入れ子のテンプレートで切れない)', () => {
    // 規則そのものを標本に当てる (どの入力でも '' を返す空の検査になっていないこと)。
    expect(whatOf('what: `a${x ? `b${y}c` : 1}e`,')).toBe('`a${x ? `b${y}c` : 1}e`');
    expect(whatOf("what: 'plain',")).toBe("'plain'");
    expect(whatOf(' * what: `説明の中の綴り`'), 'コメントを配線と読んでいる').toBe('');
    expect(whatOf('recipient: X'), 'what が無いのに字面を返している').toBe('');
  });

  it('★ 5 画面が違う what を渡す (同じ文を貼り回していない)', () => {
    const whats = AI_PAGES.map((f) => {
      const w = whatOf(read(f));
      expect(w, `${f} が what を渡していない`).not.toBe('');
      return w;
    });
    expect(new Set(whats).size, '同じ what を貼り回している画面がある').toBe(AI_PAGES.length);
  });

  it('★ Gmail / Slack は実物どおりに書く (本文は送っていない)', () => {
    // 実物は `threads.map(t => `- ${t.subject} (from ${t.sender})`)` —— 本文は載らない。
    expect(whatOf(read('GmailPage.tsx'))).toContain('件名と送信者のメールアドレス');
    expect(whatOf(read('GmailPage.tsx')), 'Gmail が「本文」を送ると偽っている').not.toContain(
      'メール本文',
    );
    // 実物は `channels.map(c => `#${c.name}: ${c.purpose}`)` —— 発言は載らない。
    expect(whatOf(read('SlackPage.tsx'))).toContain('チャンネル名と目的');
    expect(whatOf(read('SlackPage.tsx')), 'Slack が発言を送ると偽っている').not.toContain(
      'メッセージ',
    );
  });

  it('★ EmotionsPage だけが第三者の同意に触れる (placeholder がそれを誘うから)', () => {
    const emotions = code(read('EmotionsPage.tsx'));
    expect(emotions).toContain('mayIncludeOthers: true');
    // placeholder が実際に他人の文面を誘っていることを、同じ検査の中で確かめる。
    expect(read('EmotionsPage.tsx')).toContain('誰かのメッセージ');
    // 対照: 貼り付け欄でない画面には付けない (どの画面でも同じ文になっていない)。
    for (const f of ['StocksPage.tsx', 'BusinessPage.tsx', 'GmailPage.tsx', 'SlackPage.tsx']) {
      expect(code(read(f)), `${f} が同意の行まで出している`).not.toContain('mayIncludeOthers');
    }
  });

  it('★ StocksPage は件数を what に載せる (パス 105 の申告を落としていない)', () => {
    const stocks = code(read('StocksPage.tsx'));
    expect(stocks).toContain('MAX_ADVISOR_UNIVERSE_SYMBOLS');
    expect(stocks).toContain('data.watchlist.length');
    expect(stocks).toContain('data-advisor-universe-capped');
  });
});
