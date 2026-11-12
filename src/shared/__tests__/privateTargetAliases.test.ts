import { describe, expect, it } from 'vitest';
import { isPrivateOrReservedTarget } from '../privateTarget';

const blocked = (u: string): boolean => isPrivateOrReservedTarget(new URL(u));

describe('SSRF の遮断表: hosts の既定の別名と 6to4 の短い形', () => {
  it('★ RHEL / Fedora 系の hosts の既定の別名・Kubernetes の Service 名を遮断する (threat: T-192)', () => {
    for (const u of [
      'http://localhost.localdomain:8080/a.png',
      'http://localhost6.localdomain6/a.png',
      'http://LOCALHOST.LOCALDOMAIN./a.png',
      'http://kubernetes.default.svc/a.png',
      'http://anything.localdomain/a.png',
    ]) {
      expect(blocked(u), u).toBe(true);
    }
    // 近い綴りの公開名は止めない (最終ラベルだけを見る)。
    for (const u of ['https://example.com/', 'https://localdomain.example.com/', 'https://svc.example.com/', 'https://example.localdomaincom/']) {
      expect(blocked(u), u).toBe(false);
    }
  });

  it('★ 6to4 で下位の群が :: に畳まれた形も、埋め込まれた v4 で判定する (threat: T-191)', () => {
    for (const u of [
      'https://[2002:7f00::1]/', // 127.0.0.0
      'https://[2002:a9fe::]/', // 169.254.0.0
      'https://[2002:a00::]/', // 10.0.0.0
      'https://[2002::]/', // 0.0.0.0
      'https://[2002:7f00:1::]/', // 既存の 2 群の形 (127.0.0.1)
    ]) {
      expect(blocked(u), u).toBe(true);
    }
    // 公開 v4 を埋め込む 6to4 は止めない (過剰に止めない・既存の標本と同じ向き)。
    for (const u of ['https://[2002:5db8:d822::]/', 'https://[2002:5db8::1]/']) {
      expect(blocked(u), u).toBe(false);
    }
  });
  it('★ 6to4 の 3 群目 (下位 16 bit) も v4 の判定に使う —— 2 群目だけでは決まらない形 (変異検査)', () => {
    // 2002:c000:0105:: は 192.0.1.5 (公開)。3 群目を 0 と見なすと 192.0.0.0 (IETF 予約) になり誤って止まる。
    expect(blocked('https://[2002:c000:105::]/'), '192.0.1.5 は公開').toBe(false);
    // 逆向き: 3 群目が予約帯に入れば止まる (192.0.2.5 = TEST-NET-1)。
    expect(blocked('https://[2002:c000:205::]/'), '192.0.2.5 は文書用').toBe(true);
  });

  it('★ `2002::` は先頭に在るときだけ 6to4 として読む (途中の `2002::` は別の群)', () => {
    expect(blocked('https://[2002::]/'), '先頭の 2002:: は 0.0.0.0').toBe(true);
    expect(blocked('https://[1:2002::1]/'), '途中の 2002:: は 6to4 ではない').toBe(false);
    expect(blocked('https://[2606:2002::1]/'), '途中の 2002:: は 6to4 ではない (2)').toBe(false);
  });
});
