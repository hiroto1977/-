/**
 * **マイクの入口 2 つに、声について書いた断りが無かった。** (2026-09-09 · パス 108)
 *
 * | 入口 | どこに在るか | 断り |
 * | --- | --- | --- |
 * | `VoiceCommandBar` | `App.tsx` に載っているので**全画面** | **無かった** |
 * | `VillagePage` の「話しかける」 | 村の画面 | **無かった** |
 *
 * パス 106〜107 で AI へ送る 8 画面に断りを足した。しかし**声は書き起こす前に
 * 端末を出ている可能性がある** —— `voice/speechAdapter.ts` は
 * `SpeechRecognition ?? webkitSpeechRecognition` を呼ぶだけの薄いラッパで、
 * **認識をどこで行うかはブラウザが決める**。この app は経路を選べない。
 * ティッカー記号を断っている画面が在り、**マイクの音声を断っていない入口が
 * 全画面に在った**。
 *
 * ## 走査は renderer 全体を見る
 *
 * パス 107 の AI の走査は `pages/` だけを見ていた —— `VoiceCommandBar` は
 * `components/` に在るので、その走査では**永久に見えない**。
 * `lint:network-targets` は 2026-08-22 に同じ理由でディレクトリの一覧をやめて
 * `src` 全体にしており、注記に「一覧に書き忘れると、そのディレクトリは丸ごと
 * 見えない。実際そうなっていた」と書いてある ——
 * **規準は隣のゲートに在った** (13 か所目)。
 *
 * ## 言えることと言えないことを分ける
 *
 * 言える (このリポジトリから確かめられる):
 *   - ブラウザの機能に委ねていること・押している間だけ聞き取ること
 *   - 書き起こした文を端末内で解釈すること (`voiceCommand.ts` は純粋関数)
 *   - 音声から実行できる action が `VOICE_ACTIONS` の範囲に限られ、
 *     **AI の action を含まない**こと (この検査が実装から導いて確かめる)
 *
 * 言えない: **ブラウザがどこで認識するか**。だから「送られます」と断定せず、
 * 「端末内で完結します」とも言わない。提供元の名前も書かない。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  VOICE_RECOGNITION_MECHANISM,
  voiceEgressNoticeLines,
} from '../../../shared/voiceEgressNotice';

const RENDERER = path.resolve(__dirname, '../..');

/** コメントを落とした本体 (説明の中の綴りを配線と読まない)。 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

/** renderer の .ts / .tsx をすべて (画面も部品も)。 */
function rendererFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p);
        continue;
      }
      if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(p);
    }
  };
  walk(RENDERER);
  return out;
}

/** マイクを開く入口か (アダプタ自身は除く)。 */
function opensMic(file: string, src: string): boolean {
  if (file.includes(`voice${path.sep}speechAdapter.ts`)) return false;
  return /startSpeechRecognition\s*\(/.test(code(src));
}

/** 断りの部品をタグの境目つきで探す (前方一致で別の部品を数えない)。 */
const DRAWS_NOTICE = /<VoiceEgressNotice[\s/>]/;

describe('機構 — 声の断りは 1 か所が持ち、確かめられないことは主張しない', () => {
  it('★ 仕組みと「押している間だけ」を必ず言う', () => {
    const lines = voiceEgressNoticeLines({ transcriptStaysLocal: true });
    expect(lines[0]).toContain(VOICE_RECOGNITION_MECHANISM);
    expect(lines[0]).toContain('押している間だけ');
  });

  it('★ 経路を選べないことを言い、断定はしない', () => {
    const text = voiceEgressNoticeLines({ transcriptStaysLocal: false }).join('\n');
    expect(text).toContain('ブラウザが決めます');
    expect(text).toContain('経路を選べません');
    // **「端末内で完結する」と言ってはいけない** (確かめられない)。
    expect(text, '確かめられない locality を主張している').not.toContain('端末内で完結します');
    expect(text).not.toContain('外部に送信しません');
    expect(text).not.toContain('安全');
  });

  it('★ 提供元の扱いは主張せず、名前も挙げない', () => {
    const text = voiceEgressNoticeLines({ transcriptStaysLocal: true }).join('\n');
    expect(text).toContain('確かめられないため主張しません');
    // どのブラウザが何をするかは、このリポジトリからは確かめられない。
    for (const vendor of ['Google', 'Chrome', 'Apple', 'Safari', 'Microsoft', 'Edge']) {
      expect(text, `${vendor} の振る舞いを主張している`).not.toContain(vendor);
    }
  });

  it('★ 端末内で解釈するだけの入口だけが、その 1 行を足す', () => {
    const local = voiceEgressNoticeLines({ transcriptStaysLocal: true });
    const remote = voiceEgressNoticeLines({ transcriptStaysLocal: false });
    expect(local.join('\n')).toContain('AI へは送りません');
    // 送信系の操作では内容が渡ることも同じ行で述べる (言い落とさない)。
    expect(local.join('\n')).toContain('対象のサービスへ渡り');
    expect(local.join('\n')).toContain('実行前に確認');
    // 対照: 村の画面では言わない (文の行き先は隣の AI の断りが述べる)。
    expect(remote.join('\n')).not.toContain('AI へは送りません');
    expect(local.length).toBe(remote.length + 1);
  });
});

describe('マイクを開く入口すべてに断りが在る (走査)', () => {
  it('★ 走査規則がタグの境目で当たる', () => {
    expect(DRAWS_NOTICE.test('  <VoiceEgressNotice subject={s} />')).toBe(true);
    expect(DRAWS_NOTICE.test('  <VoiceEgressNotice\n    subject={{')).toBe(true);
    expect(DRAWS_NOTICE.test('  <VoiceEgressNoticeXX subject={s} />'), '別の部品を断りと数えている').toBe(false);
  });

  it('★ 走査が実物に当たっている (入口 2 つを見つけている)', () => {
    const entries = rendererFiles()
      .filter((f) => opensMic(f, fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(RENDERER, f));
    // **標本が空なら何も検査していない。** 実測 2 件。
    expect(entries.length, 'マイクを開く入口が見つからない (走査が壊れている)').toBeGreaterThanOrEqual(2);
    expect(entries).toContain(path.join('components', 'VoiceCommandBar.tsx'));
    expect(entries).toContain(path.join('pages', 'VillagePage.tsx'));
    // アダプタ自身は入口ではない (定義と使用を区別している)。
    expect(entries, 'アダプタを入口として数えている').not.toContain(
      path.join('voice', 'speechAdapter.ts'),
    );
  });

  it('★ マイクを開く所はすべて断りを描く (3 つ目が黙って増えない)', () => {
    const missing: string[] = [];
    for (const f of rendererFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      if (!opensMic(f, src)) continue;
      if (!DRAWS_NOTICE.test(code(src))) missing.push(path.relative(RENDERER, f));
    }
    expect(
      missing,
      'マイクを開くのに、声がどこへ行くかを述べていない入口がある:\n' + missing.join('\n'),
    ).toEqual([]);
  });

  it('★ 文をさらに送る入口は「AI へは送りません」と書けない (実物と照らす)', () => {
    // **旗と実物を突き合わせる。** 文の行き先を持つ画面 (= `<AiEgressNotice>` を
    // 描く画面) が `transcriptStaysLocal: true` を渡すと、「AI へは送りません」と
    // 書きながら送ることになる。2026-09-09 の対照 E がこれで鳴らず、検査の穴として
    // 見つかった —— 旗を人が書く以上、実物と照らす節が要る。
    for (const f of rendererFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      if (!opensMic(f, src)) continue;
      const body = code(src);
      const forwards = /<AiEgressNotice[\s/>]/.test(body);
      const claimsLocal = /transcriptStaysLocal:\s*true/.test(body);
      const rel = path.relative(RENDERER, f);
      if (forwards) {
        expect(claimsLocal, `${rel} は文を AI へ送るのに「端末内で解釈するだけ」と書いている`).toBe(false);
      } else {
        // 逆向きも留める: 送らない入口は、言い切れるのだから言い切る。
        expect(claimsLocal, `${rel} は文を送らないのに、そう書いていない`).toBe(true);
      }
    }
  });

  it('★ どの入口も文面を自前で書かない (共有の 1 か所から読む)', () => {
    for (const f of rendererFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      if (!opensMic(f, src)) continue;
      expect(code(src), `${path.relative(RENDERER, f)} が断りの文面を自前で持っている`).not.toContain(
        'ブラウザが決めます',
      );
    }
  });
});

describe('「AI へは送りません」の根拠 — 音声から呼べる action の実測', () => {
  const BAR = path.join(RENDERER, 'components', 'VoiceCommandBar.tsx');

  /** `VOICE_ACTIONS` の宣言から action 名を取り出す。 */
  function voiceActions(): string[] {
    const src = code(fs.readFileSync(BAR, 'utf8'));
    const at = src.indexOf('const VOICE_ACTIONS');
    expect(at, 'VOICE_ACTIONS が見つからない').toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf('};', at));
    return [...block.matchAll(/'([a-z][a-z-]+)'/g)].map((m) => m[1]!);
  }

  it('★ 走査が実物に当たっている (action 名が取れている)', () => {
    const actions = voiceActions();
    expect(actions.length, 'action が 1 つも取れていない').toBeGreaterThanOrEqual(4);
    expect(actions).toContain('record-entry');
    expect(actions).toContain('send-message');
  });

  it('★ 音声から AI の action は呼べない (だから「AI へは送りません」と書ける)', () => {
    const actions = new Set(voiceActions());
    for (const ai of ['advise', 'analyze-text', 'chat', 'chatAll', 'run-skill']) {
      expect(actions.has(ai), `音声から ${ai} を呼べる —— 断りの「AI へは送りません」が嘘になる`).toBe(false);
    }
  });
});
