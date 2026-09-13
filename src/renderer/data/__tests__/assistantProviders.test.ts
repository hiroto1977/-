/**
 * **送り先の判断と、設定状況の読み方。** (2026-09-09 · パス 107)
 *
 * `assistant/chat` を呼ぶ画面 (`AssistantPage` / `VillagePage`) が
 * 「いま何処へ送るのか」を利用者へ書くための分岐。断りの真偽はここで決まるので、
 * 画面を描かずに全分岐を留める。
 *
 * ## 直した欠陥 — 「未設定」と「確認できません」を混ぜていた
 *
 * `AssistantPage.refreshProviders` は 2026-09-09 まで
 *
 *     if (res.ok && Array.isArray(res.data.providers)) setProviders(res.data.providers);
 *     } catch { (取得失敗は無視というコメントつきで空振り) }
 *
 * と書いており、**`{ ok: false }` (ブラウザ版で保管庫が施錠されている) と例外を
 * どちらも空配列にしていた**。空配列は画面では「未設定 = 外へ出ない」と読めるが、
 * `chat` は保存済みの資格情報で**実際に送る**ので、その読みは嘘になる。
 * 下の層 (`web-shim.ts` の `callAssistantProviders`) は
 * `credsRead.res` をそのまま返して**区別を渡していた** ——
 * **規準は手の届く所に在り、画面が捨てていた** (12 か所目)。
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  ALL_AGENTS,
  assistantEgressRecipients,
  readProviderStatuses,
  type ProviderStatus,
} from '../assistantProviders';
import { aiEgressNoticeLines } from '../../../shared/aiEgressNotice';
import type { AiProviderId } from '../../../shared/ai/providers';

const mk = (
  id: AiProviderId,
  label: string,
  configured: boolean,
  isDefault = false,
): ProviderStatus => ({
  id,
  label,
  configured,
  isDefault,
  browserDirect: true,
  needsApiKey: id !== 'ollama',
  defaultModel: 'm',
});

const ANTHROPIC = mk('anthropic', 'Anthropic (Claude)', true, true);
const OPENAI = mk('openai', 'OpenAI (ChatGPT)', true);
const OLLAMA = mk('ollama', 'Ollama (ローカル)', true);
const GEMINI_OFF = mk('gemini', 'Google Gemini', false);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('送り先の内訳 — 選んだ物によって変わる', () => {
  it('★ 無指定なら既定のプロバイダ 1 つ', () => {
    const r = assistantEgressRecipients({
      providers: [ANTHROPIC, OPENAI, GEMINI_OFF],
      providersUnknown: false,
      selected: '',
    });
    expect(r.remote).toEqual(['Anthropic (Claude)']);
    expect(r.local).toEqual([]);
  });

  it('★ 指名すればその 1 つだけ (既定を混ぜない)', () => {
    const r = assistantEgressRecipients({
      providers: [ANTHROPIC, OPENAI],
      providersUnknown: false,
      selected: 'openai',
    });
    expect(r.remote).toEqual(['OpenAI (ChatGPT)']);
  });

  it('★ 合議は設定済みの全部へ (未設定は入れない)', () => {
    const r = assistantEgressRecipients({
      providers: [ANTHROPIC, OPENAI, GEMINI_OFF],
      providersUnknown: false,
      selected: ALL_AGENTS,
    });
    expect(r.remote).toEqual(['Anthropic (Claude)', 'OpenAI (ChatGPT)']);
    expect(r.remote, '未設定のプロバイダを送り先にしている').not.toContain('Google Gemini');
  });

  it('★ Ollama は端末内として分ける (外へ出ると書かない)', () => {
    const r = assistantEgressRecipients({
      providers: [OLLAMA],
      providersUnknown: false,
      selected: 'ollama',
    });
    expect(r.remote).toEqual([]);
    expect(r.local?.[0]).toContain('Ollama');
    // 断りは「出ません」と言い切る。
    const text = aiEgressNoticeLines({ what: '会話', recipients: r }).join('\n');
    expect(text).toContain('端末の外へは出ません');
    expect(text).not.toContain('端末内で完結しません');
  });

  it('★ 合議で Ollama が混ざれば、外と内を両方書く', () => {
    const r = assistantEgressRecipients({
      providers: [ANTHROPIC, OLLAMA],
      providersUnknown: false,
      selected: ALL_AGENTS,
    });
    expect(r.remote).toEqual(['Anthropic (Claude)']);
    expect(r.local?.length).toBe(1);
    const text = aiEgressNoticeLines({ what: '会話', recipients: r }).join('\n');
    expect(text).toContain('Anthropic (Claude) へ送信されます');
    expect(text).toContain('この端末内で処理されます');
  });

  it('★ 指名したプロバイダが未設定なら 0 件 (実際に送らないので「出ない」が正しい)', () => {
    const r = assistantEgressRecipients({
      providers: [GEMINI_OFF],
      providersUnknown: false,
      selected: 'gemini',
    });
    expect(r.remote).toEqual([]);
    expect(r.local).toEqual([]);
  });

  it('★ 1 つも設定が無ければ外へ出ない (端末内の簡易応答が答える)', () => {
    const r = assistantEgressRecipients({ providers: [], providersUnknown: false, selected: '' });
    const text = aiEgressNoticeLines({ what: '会話', recipients: r }).join('\n');
    expect(text).toContain('端末の外へは出ません');
  });

  it('★ 読めなかったときは locality を主張しない (未設定と混ぜない)', () => {
    const r = assistantEgressRecipients({
      providers: [],
      providersUnknown: true,
      selected: '',
    });
    expect(r.unknown).toBe(true);
    const text = aiEgressNoticeLines({ what: '会話', recipients: r }).join('\n');
    expect(text).toContain('送り先を今は確認できません');
    // **ここが直した中身。** 空配列を「出ない」と読ませない。
    expect(text, '読めないのに「出ない」と言っている').not.toContain('端末の外へは出ません');
  });
});

describe('設定状況の読み方 — 失敗を空配列に丸めない', () => {
  const stub = (invoke: unknown): void => {
    vi.stubGlobal('window', { serviceHub: { invoke } });
  };

  it('★ 取れたらそのまま返す (unknown ではない)', async () => {
    stub(() => Promise.resolve({ ok: true, data: { providers: [ANTHROPIC] } }));
    const read = await readProviderStatuses();
    expect(read.providers).toEqual([ANTHROPIC]);
    expect(read.unknown).toBe(false);
  });

  it('★ ok:false (保管庫が施錠) は unknown', async () => {
    stub(() => Promise.resolve({ ok: false, code: 'locked', message: '施錠されています' }));
    const read = await readProviderStatuses();
    expect(read.providers).toEqual([]);
    expect(read.unknown, '施錠を「未設定」として扱っている').toBe(true);
  });

  it('★ 例外も unknown (黙って捨てない)', async () => {
    stub(() => Promise.reject(new Error('boom')));
    const read = await readProviderStatuses();
    expect(read.unknown).toBe(true);
  });

  it('★ 形が違う応答も unknown (配列でない providers を信じない)', async () => {
    stub(() => Promise.resolve({ ok: true, data: { providers: 'すべて' } }));
    const read = await readProviderStatuses();
    expect(read.unknown).toBe(true);
  });

  it('★ bridge が無ければ送る道が無い (unknown ではなく未設定)', async () => {
    vi.stubGlobal('window', {});
    const read = await readProviderStatuses();
    expect(read.providers).toEqual([]);
    expect(read.unknown, 'bridge 不在を「確認できない」にしている').toBe(false);
  });
});
