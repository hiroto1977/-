/**
 * **取得の失敗文も 1 行に畳む (2026-10-15 · パス 523 · threat: T-065)。**
 *
 * `StatusBar` の `credentialError` は T-045 で `externalTextOnOneLine` を通していたが、
 * `useServiceData` が `fetchSnapshot` の `result.message` をそのまま渡す `errorMessage` は素だった ——
 * 58 画面が通る 1 か所。ブラウザ版の Ollama の失敗文は相手の本文を伏字と長さだけ掛けて運ぶので、
 * 改行・双方向制御 (U+202E)・不可視字がそのまま DOM に入り、RLO が後ろの文の見え方を入れ替えていた (実測)。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusBar } from '../StatusBar';
import { externalTextOnOneLine } from '../../data/assistantMarkdown';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
  };
});

const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);
const LF = String.fromCharCode(10);

describe('StatusBar — errorMessage は 1 行に畳む (threat: T-065)', () => {
  it('★ 改行・双方向制御・不可視字を持つ失敗文は、畳んだ形で描かれる (threat: T-065)', () => {
    const raw = `Ollama が HTTP 500 を返しました。${RLO}evil${LF}✅ 接続しました${ZWSP}`;
    const folded = externalTextOnOneLine(raw);
    // 標本が的に当たる: 畳むと生の制御字は 1 つも残らない。
    expect(folded).not.toContain(RLO);
    expect(folded).not.toContain(ZWSP);
    expect(folded).not.toContain(LF);
    const html = renderToStaticMarkup(createElement(StatusBar, { who: 'Ollama', status: 'error', errorMessage: raw }));
    expect(html).not.toContain(RLO);
    expect(html).not.toContain(ZWSP);
    expect(html).toContain(folded.replace(/\\/g, '\\'));
  });

  it('対照: 普通の失敗文はそのまま', () => {
    const html = renderToStaticMarkup(createElement(StatusBar, { who: 'GitHub', status: 'error', errorMessage: 'トークン未設定' }));
    expect(html).toContain('トークン未設定');
  });
});
