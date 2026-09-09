/**
 * **AI へ利用者のデータを送る画面すべてに断りが在ること。母集団は実装から導く。**
 *
 * ## 出発点 (2026-09-09 · パス 106)
 *
 * `StocksPage` に egress の断りを足した 2026-08-23 のコメントはこう書いていた ——
 * 「他の画面 (クラウド同期・保存状態) では『何が送られないか』まで書いているのに、
 * **AI の画面**だけ書いていなかった」。**「AI の画面」を単数として扱っており**、
 * 実際は複数在った。パス 106 で 5 画面に断りを足した。
 *
 * ## その走査が母集団を手で書いていた (パス 107 で訂正)
 *
 * パス 106 の走査は `AI_ACTIONS = ['advise', 'analyze-text']` という**手書きの
 * 一覧**で数えていた。手で書けば、手で書いた分だけしか見つからない ——
 * 実装から導き直すと 2 画面増えた:
 *
 * | 見落とし | 送る物 | なぜ漏れたか |
 * | --- | --- | --- |
 * | `AssistantPage` | 直近 16 往復の会話 (`assistant/chat`・`chatAll`) | action 名が `chat` で一覧に無い |
 * | `SkillsPage` | 指示文 + 選んだスキルの定義 (`skills/run-skill`) | 同上 |
 * | `VillagePage` | **マイクで話した内容の書き起こし** (`assistant/chat`) | 同上 |
 *
 * **数は 3 → 5 → 8 と動いた。** 手で 3 と見立て、パス 106 の (手書きの) 走査が 5 に
 * 訂正し、実装から導いたこの走査が 8 にした。`AssistantPage` はこの app の主チャットで
 * 「全AI合議」は設定済みの全プロバイダへ同時に送り、`VillagePage` は**声**を送る
 * (しかも AI の切り替えは既定で入っている)。母集団の走査を書いた当のパスが、
 * 最も大きい画面と最も意外な画面を落としていた
 * (パス 85 / 95 と同じ形 —— **数える所を手で書くと、そこが穴になる**)。
 *
 * だからいまは `main/clients/*.ts` の `ACTIONS` から**到達可能性で**導く:
 * AI へ出る印 (`api.anthropic.com` / `runAiChat(`) に到達する handler の action だけを
 * 母集団とし、その組を invoke する画面を数える。action を足しても一覧を直さなくてよい。
 *
 * ## 走査が守るもの
 *
 * 文面を 8 度書かせないこと (`shared/aiEgressNotice.ts` が 1 か所) と、
 * **送る画面が黙って 9 つ目に増えないこと**。後者が要点 —— 画面を直しても、
 * 走査が無ければ次の画面はまた黙る。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AI_EGRESS_RECIPIENT_ANTHROPIC,
  aiEgressNoticeLines,
  remoteOnly,
} from '../../../shared/aiEgressNotice';
import {
  PAGES,
  RENDERER,
  aiActionPairs,
  code,
  functionBodies,
  invokesAi,
  pageFiles,
  reachesAi,
} from './aiEgressPairs.helpers';

const read = (f: string): string => fs.readFileSync(path.join(PAGES, f), 'utf8');

/**
 * 断りの部品を**タグの境目つき**で探す。`includes('<AiEgressNotice')` は
 * `<AiEgressNoticeXX` にも当たるので、部品の名前を書き損じた画面を断り在りと
 * 数えてしまう (2026-09-09 の対照 A がこれで鳴らず、検査の穴として見つかった)。
 */
const DRAWS_NOTICE = /<AiEgressNotice[\s/>]/;

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

describe('母集団を実装から導く (手書きの一覧に頼らない)', () => {
  it('★ 戻り値の型の波括弧を本体と読まない (最初の試作が落ちた所)', () => {
    const sample = [
      'async function f(ctx: Ctx): Promise<{ text: string }> {',
      "  await fetch('https://api.anthropic.com/v1/messages');",
      '}',
      '',
      'function g(): void {',
      '  return;',
      '}',
    ].join('\n');
    const bodies = functionBodies(sample);
    expect(bodies.get('f'), '戻り値の型を本体と読んでいる').toContain('api.anthropic.com');
    expect(reachesAi('f', bodies)).toBe(true);
    // 対照: AI へ出ない関数は false (どの入力でも true を返す形になっていない)。
    expect(reachesAi('g', bodies)).toBe(false);
    expect(reachesAi('存在しない関数', bodies)).toBe(false);
  });

  it('★ helper 経由でも辿る (直呼びだけを見ていない)', () => {
    const sample = [
      'function handler(ctx: Ctx): Promise<void> {',
      '  return helper(ctx);',
      '}',
      '',
      'function helper(ctx: Ctx): Promise<void> {',
      '  return runAiChat({ ...ctx });',
      '}',
    ].join('\n');
    const bodies = functionBodies(sample);
    expect(reachesAi('handler', bodies), 'helper 経由の到達を見落としている').toBe(true);
  });

  it('★ 導いた組が実物に当たっている (空でない・既知の 6 組を含む)', () => {
    const pairs = aiActionPairs().map(([s, a]) => `${s}/${a}`);
    // **標本が空なら何も検査していない。**
    expect(pairs.length, 'AI へ出る action が 1 つも導けていない (走査が壊れている)').toBeGreaterThanOrEqual(6);
    for (const known of [
      'assistant/chat',
      'assistant/chatAll',
      'business/advise',
      'emotions/analyze-text',
      'skills/run-skill',
      'stocks/advise',
    ]) {
      expect(pairs, `${known} を導けていない`).toContain(known);
    }
    // AI へ出ない action を巻き込んでいない (母集団が広すぎない)。
    for (const notAi of ['stocks/backtest', 'stocks/export-dashboard', 'emotions/log-mood', 'assistant/providers']) {
      expect(pairs, `${notAi} を AI 経路と誤判定している`).not.toContain(notAi);
    }
  });
});

describe('機構 — 断りの文面は 1 か所が持ち、書けることだけを書く', () => {
  it('★ 送る物と送り先を必ず名指しする', () => {
    const lines = aiEgressNoticeLines({
      what: '入力したテキスト本文',
      recipients: remoteOnly(AI_EGRESS_RECIPIENT_ANTHROPIC),
    });
    expect(lines[0]).toContain('入力したテキスト本文');
    expect(lines[0]).toContain(AI_EGRESS_RECIPIENT_ANTHROPIC);
    // 端末内で完結しないことを述べる (これが断りの本体)。
    expect(lines.join('\n')).toContain('端末内で完結しません');
  });

  it('★ 受け取った側の扱いは主張しない (SecurityPage の HIBP と同じ方針)', () => {
    const text = aiEgressNoticeLines({ what: 'x', recipients: remoteOnly('Z') }).join('\n');
    expect(text).toContain('確かめられないため主張しません');
    // **安全だとは言わない。** 言えないことを言わないための検査。
    expect(text).not.toContain('安全');
    expect(text).not.toContain('保存されません');
    expect(text).not.toContain('学習に使われません');
  });

  it('★ 複数の送り先を全部名指しする (合議で 1 社だけ書かない)', () => {
    const lines = aiEgressNoticeLines({
      what: 'x',
      recipients: { remote: ['A 社', 'B 社', 'C 社'] },
    });
    // **「何処へ送るか」の行そのものが全社を挙げること。** 文書のどこかに
    // 名前が在るだけでは足りない —— 末尾の「取り扱いは主張しません」に
    // 名前が並んでいれば通ってしまい、送信の行が 1 社だけでも鳴らない
    // (2026-09-09 の対照 E がこれで鳴らず、検査の穴として見つかった)。
    for (const n of ['A 社', 'B 社', 'C 社']) {
      expect(lines[0], `送信の行が ${n} を挙げていない`).toContain(n);
    }
    expect(lines.join('\n')).toContain('端末内で完結しません');
  });

  it('★ 端末内だけなら「出ません」と言い切る (逆に嘘をつかない)', () => {
    const text = aiEgressNoticeLines({
      what: '会話',
      recipients: { remote: [], local: ['Ollama (この端末)'] },
    }).join('\n');
    expect(text).toContain('Ollama (この端末)');
    expect(text).toContain('端末の外へは出ません');
    // 出ないのだから、受け手の扱いの話も「完結しません」も出さない。
    expect(text).not.toContain('端末内で完結しません');
    expect(text).not.toContain('主張しません');
  });

  it('★ 端末内と外部が混ざるときは両方書く', () => {
    const text = aiEgressNoticeLines({
      what: 'x',
      recipients: { remote: ['A 社'], local: ['Ollama (この端末)'] },
    }).join('\n');
    expect(text).toContain('A 社 へ送信されます');
    expect(text).toContain('端末内で完結しません');
    expect(text).toContain('Ollama (この端末) はこの端末内で処理されます');
  });

  it('★ 設定状況が読めないときは locality を主張しない (未設定と混ぜない)', () => {
    const text = aiEgressNoticeLines({ what: 'x', recipients: { remote: [], unknown: true } }).join('\n');
    expect(text).toContain('送り先を今は確認できません');
    // **「出ません」と言ってはいけない** —— 保存済みの資格情報で実際に送る場合がある。
    expect(text).not.toContain('端末の外へは出ません');
    expect(text).not.toContain('主張しません');
  });

  it('★ 第三者の文面を貼る誘いがある画面だけ、同意の 1 行が増える', () => {
    const withOthers = aiEgressNoticeLines({
      what: 'x',
      recipients: remoteOnly('Z'),
      mayIncludeOthers: true,
    });
    const without = aiEgressNoticeLines({ what: 'x', recipients: remoteOnly('Z') });
    expect(withOthers.join('\n')).toContain('その人の同意を確認してください');
    // 対照: 既定では出ない (どの画面でも同じ文になっていない)。
    expect(without.join('\n')).not.toContain('同意');
    expect(withOthers.length).toBe(without.length + 1);
  });

  it('★ プロキシの話を書かない (Anthropic へは直接送るので嘘になる)', () => {
    const text = aiEgressNoticeLines({
      what: 'x',
      recipients: remoteOnly('Z'),
      mayIncludeOthers: true,
    }).join('\n');
    // `fetchViaProxy` を通るのは notion / atlassian / cloudflare だけ。
    expect(text).not.toContain('プロキシ');
    expect(text).not.toContain('Cloudflare');
  });
});

describe('AI へ送る画面すべてに断りが在る (走査)', () => {
  const pairs = aiActionPairs();

  it('★ 走査規則がタグの境目で当たる (名前の書き損じを断りと数えない)', () => {
    expect(DRAWS_NOTICE.test('  <AiEgressNotice\n    subject={{')).toBe(true);
    expect(DRAWS_NOTICE.test('  <AiEgressNotice subject={s} />')).toBe(true);
    expect(DRAWS_NOTICE.test('  <AiEgressNotice/>')).toBe(true);
    expect(DRAWS_NOTICE.test('  <AiEgressNoticeXX subject={s} />'), '別の部品を断りと数えている').toBe(false);
    expect(DRAWS_NOTICE.test('  <div>断りはここに無い</div>')).toBe(false);
  });

  it('★ 走査は renderer 全体を見る (components/ が丸ごと抜けていない)', () => {
    const files = pageFiles().map((f) => path.relative(RENDERER, f));
    // 画面と部品の両方が標本に入っていること (パス 107 の走査は pages/ だけだった)。
    expect(files, '画面が走査に入っていない').toContain(path.join('pages', 'StocksPage.tsx'));
    expect(files, 'components/ が走査に入っていない').toContain(
      path.join('components', 'VoiceCommandBar.tsx'),
    );
    expect(files.length, '走査するファイルが少なすぎる (歩き方が壊れている)').toBeGreaterThan(60);
  });

  it('★ 部品は AI へ送っていない (実測 — 送るなら断りが要る)', () => {
    // `ServiceActionPanel` は `advise` を**可変の serviceId** で呼ぶが、
    // 載っているのは real-estate / mutual-funds で、どちらの advise も
    // 規則ベース (`phase: 'rules'`、shared/serviceAdvisor.ts。AI へは送らない) なので導出した AI の組に入らない。
    // `ChatbotWidget` / `VoiceCommandBar` は `VOICE_ACTIONS` の範囲でしか
    // invoke しない。**これは主張ではなく測定**で、変わればここが鳴る。
    const senders = pageFiles()
      .filter((f) => invokesAi(fs.readFileSync(f, 'utf8'), pairs))
      .map((f) => path.relative(RENDERER, f));
    for (const f of senders) {
      expect(f.startsWith(`pages${path.sep}`), `${f} が AI へ送っている (断りの配線を確かめること)`).toBe(true);
    }
  });

  it('★ 走査が実物に当たっている (AI の画面 8 つを見つけている)', () => {
    const ai = pageFiles().filter((f) => invokesAi(fs.readFileSync(f, 'utf8'), pairs));
    expect(ai.length, 'AI の action を呼ぶ画面が見つからない (走査が壊れている)').toBeGreaterThanOrEqual(8);
    const names = ai.map((f) => path.basename(f)).sort();
    // AI らしい名前の画面だけでは足りない —— Gmail / Slack は emotions の action を借り、
    // Assistant / Skills / Village は action 名が `chat` / `run-skill` である。
    for (const n of [
      'AssistantPage.tsx',
      'BusinessPage.tsx',
      'EmotionsPage.tsx',
      'GmailPage.tsx',
      'SkillsPage.tsx',
      'SlackPage.tsx',
      'StocksPage.tsx',
      'VillagePage.tsx',
    ]) {
      expect(names, `${n} を走査が見落としている`).toContain(n);
    }
  });

  it('★ 送る画面はすべて断りを描く (9 つ目が黙って増えない)', () => {
    const missing: string[] = [];
    for (const f of pageFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      if (!invokesAi(src, pairs)) continue;
      if (!DRAWS_NOTICE.test(code(src))) missing.push(path.basename(f));
    }
    expect(
      missing,
      'AI へ利用者のデータを送るのに、何が外へ出るかを述べていない画面がある:\n' + missing.join('\n'),
    ).toEqual([]);
  });

  it('★ どの画面も文面を自前で書かない (共有の 1 か所から読む)', () => {
    for (const f of pageFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      if (!invokesAi(src, pairs)) continue;
      const body = code(src);
      // 「へ送信されます」の文を画面が持っていたら、それは写しである。
      expect(body, `${path.basename(f)} が断りの文面を自前で持っている`).not.toContain('へ送信されます');
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
    'SkillsPage.tsx',
    'AssistantPage.tsx',
    'VillagePage.tsx',
  ];

  it('★ 走査規則が実物に当たる (入れ子のテンプレートで切れない)', () => {
    expect(whatOf('what: `a${x ? `b${y}c` : 1}e`,')).toBe('`a${x ? `b${y}c` : 1}e`');
    expect(whatOf("what: 'plain',")).toBe("'plain'");
    expect(whatOf(' // what: `説明の中の綴り`'), 'コメントを配線と読んでいる').toBe('');
    expect(whatOf('recipients: X'), 'what が無いのに字面を返している').toBe('');
  });

  it('★ 8 画面が違う what を渡す (同じ文を貼り回していない)', () => {
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
    expect(whatOf(read('GmailPage.tsx')), 'Gmail が「本文」を送ると偽っている').not.toContain('メール本文');
    // 実物は `channels.map(c => `#${c.name}: ${c.purpose}`)` —— 発言は載らない。
    expect(whatOf(read('SlackPage.tsx'))).toContain('チャンネル名と目的');
    expect(whatOf(read('SlackPage.tsx')), 'Slack が発言を送ると偽っている').not.toContain('メッセージ');
  });

  it('★ Skills はスキルの定義も送ることを書く (指示文だけではない)', () => {
    // `runSkill` は `readSkillBody(name)` の Markdown を system プロンプトに載せる。
    const what = whatOf(read('SkillsPage.tsx'));
    expect(what).toContain('指示文');
    expect(what, 'スキルの定義が送られることを書いていない').toContain('スキルの定義');
  });

  it('★ Assistant は会話の範囲を書く (1 往復だけと誤解させない)', () => {
    const what = whatOf(read('AssistantPage.tsx'));
    expect(what).toContain('会話');
    // 実物の窓 (`TURN_WINDOW`) を字面で写さず、値から刷る。
    expect(what).toContain('${TURN_WINDOW}');
    expect(code(read('AssistantPage.tsx'))).toContain('const TURN_WINDOW = 16');
  });

  it('★ VillagePage は声が出ることを書く (画面の入力はマイクだから)', () => {
    const what = whatOf(read('VillagePage.tsx'));
    expect(what).toContain('マイク');
    expect(what, '書き起こしが送られることを書いていない').toContain('書き起こし');
    // **AI を切れば送らない** —— その分岐が実際に在ることを確かめる
    // (切っているのに「送信されます」と書けば、それは嘘になる)。
    const body = code(read('VillagePage.tsx'));
    expect(body).toMatch(/aiOn\s*\n?\s*\?\s*assistantEgressRecipients/);
    expect(body).toContain('{ remote: [], local: [] }');
  });

  it('★ 会話を送る 3 画面は送り先の判断を共有する (2 度書かない)', () => {
    // `assistant/chat` を呼ぶ画面は送り先が可変 —— 判断を写すと片方だけ動く。
    for (const f of ['AssistantPage.tsx', 'VillagePage.tsx']) {
      expect(code(read(f)), `${f} が送り先の判断を自前で持っている`).toContain(
        'assistantEgressRecipients',
      );
      expect(code(read(f)), `${f} が設定状況の読み方を自前で持っている`).toContain(
        'readProviderStatuses',
      );
    }
  });

  it('★ EmotionsPage だけが第三者の同意に触れる (placeholder がそれを誘うから)', () => {
    const emotions = code(read('EmotionsPage.tsx'));
    expect(emotions).toContain('mayIncludeOthers: true');
    // placeholder が実際に他人の文面を誘っていることを、同じ検査の中で確かめる。
    expect(read('EmotionsPage.tsx')).toContain('誰かのメッセージ');
    // 対照: 貼り付け欄でない画面には付けない (どの画面でも同じ文になっていない)。
    for (const f of AI_PAGES.filter((n) => n !== 'EmotionsPage.tsx')) {
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
