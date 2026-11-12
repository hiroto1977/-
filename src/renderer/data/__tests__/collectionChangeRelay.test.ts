/**
 * **レコードストアの知らせは、同じ保管層を開いている別のタブへも届く** (2026-09-27 · パス 499)。
 *
 * 直す前、知らせはこの JS 文脈の中にしか届かず、別のタブの画面は再読込まで書く前の姿を出し続けた
 * (実測は `collectionChange.ts` の docblock —— 古い表示から組んだ保存が、別のタブの新しい値を
 * 黙って消していた)。
 *
 * 別のタブの役は、**同じ名前の BroadcastChannel をもう 1 本開く**ことで作る。仕様上、送った
 * channel 自身には返らず、同じ文脈の**別の** channel には届く (実 chromium でも同じ ——
 * `security/lockWorkspace.ts` の実測)。だから線の上は直接見られる。
 *
 * 待ちは**回数ではなく条件で** (法則 `wait-for-condition-not-ticks`)。届かないことの主張は、
 * **後から送った印が届いたこと**を錠にして取る —— 印より前に送られた物は、印より先に届いている。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECORD_CHANGE_CHANNEL,
  RECORD_CHANGE_MESSAGE,
  notifyRecordStoreChanged,
  subscribeCollection,
  _resetCollectionSubscribersForTests,
} from '../collectionChange';
import { LOCK_CHANNEL } from '../../security/lockWorkspace';

/** 別のタブ (と、線の上を見る者) の役。検査ごとに開いて閉じる。 */
const opened: BroadcastChannel[] = [];
function otherTab(): { channel: BroadcastChannel; seen: unknown[] } {
  const channel = new BroadcastChannel(RECORD_CHANGE_CHANNEL);
  const seen: unknown[] = [];
  channel.onmessage = (e: MessageEvent) => {
    seen.push(e.data);
  };
  opened.push(channel);
  return { channel, seen };
}

/** 開かれた channel を数える (道が 1 本であること・閉じたことを見るため)。 */
function countChannels(): BroadcastChannel[] & { restore(): void } {
  const Real = globalThis.BroadcastChannel;
  const created = [] as unknown as BroadcastChannel[] & { restore(): void };
  globalThis.BroadcastChannel = class extends Real {
    constructor(name: string) {
      super(name);
      created.push(this);
      opened.push(this);
    }
  } as typeof BroadcastChannel;
  created.restore = () => {
    globalThis.BroadcastChannel = Real;
  };
  return created;
}

async function until(cond: () => boolean, label: string, ms = 5_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`${ms}ms 待っても ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

let fired = 0;

beforeEach(() => {
  _resetCollectionSubscribersForTests();
  fired = 0;
});

afterEach(() => {
  for (const c of opened.splice(0)) c.close();
  _resetCollectionSubscribersForTests();
});

describe('別のタブへ配る', () => {
  it('★ 書いたら、線の上に合図を 1 つ流す (中身は運ばない)', async () => {
    const watcher = otherTab();
    notifyRecordStoreChanged();
    await until(() => watcher.seen.length >= 1, '合図が流れない');
    expect(watcher.seen).toEqual([RECORD_CHANGE_MESSAGE]);
  });

  it('★ 別のタブの合図で、このタブの読んでいる画面が読み直す', async () => {
    subscribeCollection('sales-entries', () => {
      fired++;
    });
    const tabB = otherTab();
    tabB.channel.postMessage(RECORD_CHANGE_MESSAGE);
    await until(() => fired === 1, 'このタブの購読者に届かない');
  });

  it('★ 受け口は購読した時に開く (このタブが 1 度も書いていなくても届く)', async () => {
    // 書く前に購読だけ —— 読むだけのタブ (開いたままの一覧) がまさにこの形。
    subscribeCollection('mutualfund-holdings', () => {
      fired++;
    });
    otherTab().channel.postMessage(RECORD_CHANGE_MESSAGE);
    await until(() => fired === 1, '読むだけのタブに届かない');
  });

  it('★ 受けた合図は送り返さない (配り合いにしない)', async () => {
    subscribeCollection('sales-entries', () => {
      fired++;
    });
    const tabB = otherTab();
    const watcher = otherTab();
    tabB.channel.postMessage(RECORD_CHANGE_MESSAGE);
    await until(() => fired === 1, 'このタブに届かない');
    // 錠: このタブが読み直した後に、別の印を流す。送り返していれば、その合図は印より先に届く。
    tabB.channel.postMessage('sentinel');
    await until(() => watcher.seen.includes('sentinel'), '印が届かない');
    expect(watcher.seen).toEqual([RECORD_CHANGE_MESSAGE, 'sentinel']);
  });

  it('★ 知らない合図では読み直さない (施錠の合図と混ざらない)', async () => {
    subscribeCollection('sales-entries', () => {
      fired++;
    });
    const tabB = otherTab();
    tabB.channel.postMessage('lock');
    tabB.channel.postMessage({ changed: true });
    tabB.channel.postMessage(RECORD_CHANGE_MESSAGE);
    await until(() => fired >= 1, '正しい合図が届かない');
    expect(fired).toBe(1);
    // 施錠の道とは名前が違う (同じ道に載せると、値で分けるしかなくなる)。
    expect(RECORD_CHANGE_CHANNEL).not.toBe(LOCK_CHANNEL);
  });

  it('★ 送受は 1 本の道 —— 何度購読しても、何度書いても、開くのは 1 本 (自分の合図を拾わない)', () => {
    const created = countChannels();
    try {
      subscribeCollection('sales-entries', () => {});
      subscribeCollection('kpi-actuals', () => {});
      notifyRecordStoreChanged();
      notifyRecordStoreChanged();
      // 送信ごとに作ると、仕様上このタブの別の channel として自分の合図を受け取る。
      expect(created.map((c) => c.name)).toEqual([RECORD_CHANGE_CHANNEL]);
    } finally {
      created.restore();
    }
  });

  it('★ リセットは受け口を閉じる (閉じずに捨てると、次の購読者へ同じ合図を 2 度配る)', () => {
    const created = countChannels();
    try {
      subscribeCollection('sales-entries', () => {});
      expect(created).toHaveLength(1);
      const close = vi.spyOn(created[0]!, 'close');
      _resetCollectionSubscribersForTests();
      expect(close).toHaveBeenCalledTimes(1);
      // 次の購読は新しい 1 本を開く (閉じた道を使い回さない)。
      subscribeCollection('sales-entries', () => {});
      expect(created).toHaveLength(2);
    } finally {
      created.restore();
    }
  });
});

describe('BroadcastChannel が無い環境', () => {
  it('このタブの中の知らせは今までどおり届き、投げない', () => {
    const saved = globalThis.BroadcastChannel;
    // 無い / 使えない環境 —— 作ろうとすると投げる。
    globalThis.BroadcastChannel = class {
      constructor() {
        throw new Error('not supported');
      }
    } as unknown as typeof BroadcastChannel;
    try {
      _resetCollectionSubscribersForTests();
      subscribeCollection('sales-entries', () => {
        fired++;
      });
      expect(() => notifyRecordStoreChanged()).not.toThrow();
      expect(fired).toBe(1);
    } finally {
      globalThis.BroadcastChannel = saved;
      _resetCollectionSubscribersForTests();
    }
  });
});
