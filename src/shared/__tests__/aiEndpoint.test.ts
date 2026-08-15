import { describe, expect, it } from 'vitest';
import {
  MAX_AI_BASE_URL_LENGTH,
  describeAiEndpointFailure,
  isLoopbackHostname,
  normalizeAiBaseUrl,
  type AiEndpointFailure,
  type AiEndpointOptions,
} from '../aiEndpoint';

const withKey = { credentialed: true } as const;
const noKey = { credentialed: false } as const;

function reasonOf(raw: string, opts: AiEndpointOptions = withKey): AiEndpointFailure | 'ok' {
  const r = normalizeAiBaseUrl(raw, opts);
  return r.ok ? 'ok' : r.reason;
}
function baseOf(raw: string, opts: AiEndpointOptions = withKey): string {
  const r = normalizeAiBaseUrl(raw, opts);
  if (!r.ok) throw new Error(`通ると思ったが ${r.reason}: ${raw}`);
  return r.base;
}

describe('isLoopbackHostname', () => {
  it('ローカルを指す名前と IP を通す', () => {
    for (const h of ['localhost', 'LOCALHOST', 'ip6-localhost', 'ip6-loopback', '127.0.0.1', '127.1.2.3']) {
      expect(isLoopbackHostname(h), h).toBe(true);
    }
  });

  it('URL が付ける角括弧と末尾ドットを落としてから判定する', () => {
    // `new URL('http://[::1]/').hostname` は '[::1]'、
    // `new URL('http://localhost./').hostname` は 'localhost.' を返す。
    expect(isLoopbackHostname('[::1]')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('0:0:0:0:0:0:0:1')).toBe(true);
    expect(isLoopbackHostname('localhost.')).toBe(true);
    expect(isLoopbackHostname('[0:0:0:0:0:0:0:1]')).toBe(true);
  });

  it('角括弧は両側そろっているときだけ剥がす', () => {
    // 片側だけの括弧で中身を剥がすと、括弧でない 1 文字を落として
    // たまたまローカル名になる文字列が通ってしまう。
    expect(isLoopbackHostname('xlocalhost]')).toBe(false);
    expect(isLoopbackHostname('[localhostx')).toBe(false);
    expect(isLoopbackHostname('[localhost')).toBe(false);
    expect(isLoopbackHostname('localhost]')).toBe(false);
  });

  it('4 組それぞれが 1〜3 桁を受ける', () => {
    expect(isLoopbackHostname('127.10.0.1')).toBe(true);
    expect(isLoopbackHostname('127.0.10.1')).toBe(true);
    expect(isLoopbackHostname('127.0.0.10')).toBe(true);
    expect(isLoopbackHostname('127.100.100.100')).toBe(true);
  });

  it('IP の後ろに何か続くものは通さない（末尾アンカー）', () => {
    // アンカーが外れると `127.0.0.1.evil.com` の頭だけ一致して通る。
    expect(isLoopbackHostname('127.0.0.1.evil.com')).toBe(false);
    expect(isLoopbackHostname('127.0.0.1x')).toBe(false);
  });

  it('255 はオクテットとして妥当（上限の境界）', () => {
    expect(isLoopbackHostname('127.255.255.255')).toBe(true);
    expect(isLoopbackHostname('127.0.0.256')).toBe(false);
  });

  it('ローカルでないものは false', () => {
    for (const h of ['example.com', '192.168.1.5', '10.0.0.1', '8.8.8.8', 'notlocalhost', 'localhost.evil.com']) {
      expect(isLoopbackHostname(h), h).toBe(false);
    }
  });

  it('128.x は 127.x ではない（第 1 オクテットの境界）', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('128.0.0.1')).toBe(false);
    expect(isLoopbackHostname('126.0.0.1')).toBe(false);
  });

  it('オクテットが範囲外の見た目だけの IP は通さない', () => {
    expect(isLoopbackHostname('127.0.0.256')).toBe(false);
    expect(isLoopbackHostname('999.0.0.1')).toBe(false);
  });

  // 判定できない表記は「ローカルではない」に倒す（fail-closed）。
  // 取りこぼしても https を求めるだけで、平文で鍵が出ることはない。
  it('埋め込み v4 の IPv6 表記はローカルと見なさない', () => {
    expect(isLoopbackHostname('::ffff:127.0.0.1')).toBe(false);
  });
});

describe('normalizeAiBaseUrl', () => {
  it('https をホスト+パスに正規化し、末尾スラッシュを落とす', () => {
    expect(baseOf('https://api.example.com')).toBe('https://api.example.com');
    expect(baseOf('https://api.example.com/')).toBe('https://api.example.com');
    expect(baseOf('https://api.example.com///')).toBe('https://api.example.com');
    expect(baseOf('https://api.example.com/anthropic/')).toBe('https://api.example.com/anthropic');
  });

  it('ポートは保つ（別ポートの自前ゲートウェイが動かなくなるため）', () => {
    expect(baseOf('https://gw.example.com:8443/v1')).toBe('https://gw.example.com:8443/v1');
  });

  it('前後の空白は落とす', () => {
    expect(baseOf('  https://api.example.com/  ')).toBe('https://api.example.com');
  });

  it('空・空白のみは empty', () => {
    expect(reasonOf('')).toBe('empty');
    expect(reasonOf('   ')).toBe('empty');
  });

  it('長すぎるものは too-long', () => {
    const long = 'https://a.example.com/' + 'x'.repeat(MAX_AI_BASE_URL_LENGTH);
    expect(reasonOf(long)).toBe('too-long');
    expect(long.length).toBeGreaterThan(MAX_AI_BASE_URL_LENGTH);
  });

  it('ちょうど上限は通す（境界）', () => {
    const head = 'https://a.example.com/';
    const exact = head + 'x'.repeat(MAX_AI_BASE_URL_LENGTH - head.length);
    expect(exact.length).toBe(MAX_AI_BASE_URL_LENGTH);
    expect(reasonOf(exact)).toBe('ok');
  });

  it('制御文字は URL 解析より先に弾く', () => {
    expect(reasonOf('https://api.example.com/\u0000')).toBe('control-char');
    expect(reasonOf('https://api.example.com/\nHost: evil')).toBe('control-char');
    expect(reasonOf('https://api.example.com/\u007f')).toBe('control-char');
  });

  it('URL として解釈できないものは not-a-url', () => {
    expect(reasonOf('api.example.com')).toBe('not-a-url');
    expect(reasonOf('/v1/messages')).toBe('not-a-url');
  });

  it('http/https 以外のスキームは not-http', () => {
    for (const bad of ['ftp://x.example.com', 'file:///etc/passwd', 'data:text/plain,x']) {
      expect(reasonOf(bad), bad).toBe('not-http');
    }
  });

  it('ユーザー名・パスワード付きは has-userinfo（本当の送り先が隠れる）', () => {
    expect(reasonOf('https://user:pass@evil.example.com')).toBe('has-userinfo');
    expect(reasonOf('https://user@evil.example.com')).toBe('has-userinfo');
    expect(reasonOf('https://:pass@evil.example.com')).toBe('has-userinfo');
  });

  it('クエリや # 付きは has-query-or-fragment', () => {
    expect(reasonOf('https://api.example.com/?key=1')).toBe('has-query-or-fragment');
    expect(reasonOf('https://api.example.com/#x')).toBe('has-query-or-fragment');
  });

  describe('平文 http は「鍵が乗るとき」だけ弾く', () => {
    it('鍵を送るなら loopback 以外の http は insecure-remote', () => {
      expect(reasonOf('http://api.example.com', withKey)).toBe('insecure-remote');
      expect(reasonOf('http://192.168.1.5:11434', withKey)).toBe('insecure-remote');
    });

    it('鍵を送るときでも loopback の http は通す', () => {
      expect(baseOf('http://127.0.0.1:11434', withKey)).toBe('http://127.0.0.1:11434');
      expect(baseOf('http://localhost:1234', withKey)).toBe('http://localhost:1234');
      expect(baseOf('http://[::1]:11434', withKey)).toBe('http://[::1]:11434');
    });

    it('鍵を送らないなら LAN の平文 http も通す（Ollama の実際の使い方）', () => {
      expect(baseOf('http://192.168.1.5:11434/', noKey)).toBe('http://192.168.1.5:11434');
      expect(baseOf('http://ollama.lan:11434', noKey)).toBe('http://ollama.lan:11434');
    });

    it('鍵の有無に関わらず、他の検査は同じように効く', () => {
      expect(reasonOf('http://user:pass@h.example.com', noKey)).toBe('has-userinfo');
      expect(reasonOf('ftp://h.example.com', noKey)).toBe('not-http');
      expect(reasonOf('', noKey)).toBe('empty');
    });
  });
});

describe('describeAiEndpointFailure', () => {
  const ALL: AiEndpointFailure[] = [
    'empty',
    'too-long',
    'control-char',
    'not-a-url',
    'not-http',
    'has-userinfo',
    'has-query-or-fragment',
    'insecure-remote',
  ];

  it('全ての理由に文言があり、重複しない', () => {
    const msgs = ALL.map(describeAiEndpointFailure);
    for (const m of msgs) expect(m.length).toBeGreaterThan(0);
    expect(new Set(msgs).size).toBe(ALL.length);
  });

  it('長さ上限の文言に実際の上限値が入る', () => {
    expect(describeAiEndpointFailure('too-long')).toContain(String(MAX_AI_BASE_URL_LENGTH));
  });

  it('平文の文言は「なぜ駄目か」を含む', () => {
    expect(describeAiEndpointFailure('insecure-remote')).toContain('平文');
  });
});
