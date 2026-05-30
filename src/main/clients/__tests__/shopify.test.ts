import { describe, expect, it, vi } from 'vitest';
import {
  fetchShopifySnapshot,
  ACTIONS,
  CONNECTORS,
  listConnectors,
  assertOrder,
  orderHeadline,
  orderLines,
  type ShopifyOrderSummary,
} from '../shopify';

const ORDER: ShopifyOrderSummary = {
  id: 'gid://shopify/Order/1',
  name: '#1001',
  customer: '山田太郎',
  email: 'taro@example.com',
  total: '¥12,000',
  currency: 'JPY',
  lineItems: [
    { title: 'Tシャツ', quantity: 2 },
    { title: 'マグカップ', quantity: 1 },
  ],
  url: 'https://admin.shopify.com/orders/1',
};

/** Build a `fetch` mock returning one JSON (or empty) response. */
function okJson(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

describe('fetchShopifySnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchShopifySnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
    expect(snap.count).toBe(0);
  });
});

describe('order formatting helpers', () => {
  it('assertOrder rejects a missing/invalid order', () => {
    expect(() => assertOrder({})).toThrow(/order is required/);
    expect(() => assertOrder({ order: { id: '', name: '' } })).toThrow(/order.id and order.name/);
    expect(assertOrder({ order: ORDER })).toBe(ORDER);
  });

  it('orderHeadline includes name, customer and total', () => {
    expect(orderHeadline(ORDER)).toContain('#1001');
    expect(orderHeadline(ORDER)).toContain('山田太郎');
    expect(orderHeadline(ORDER)).toContain('¥12,000');
  });

  it('orderLines bullets each line item and handles empty', () => {
    expect(orderLines(ORDER)).toContain('・Tシャツ × 2');
    expect(orderLines({ ...ORDER, lineItems: [] })).toBe('(明細なし)');
  });
});

describe('ACTIONS["sync-to-slack"]', () => {
  it('posts an order message to a channel', async () => {
    const fetchMock = okJson({ ok: true, ts: '111.222', channel: 'C1' });
    const res = (await ACTIONS['sync-to-slack']!({
      token: 'shopify',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'xoxb-slack', channel: 'C1' },
    })) as { service: string; ts: string };
    expect(res.service).toBe('slack');
    expect(res.ts).toBe('111.222');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(JSON.parse((init as RequestInit).body as string).text).toContain('#1001');
  });

  it('requires channel + slack token', async () => {
    await expect(
      ACTIONS['sync-to-slack']!({ token: 's', payload: { order: ORDER, token: 'x' } }),
    ).rejects.toThrow(/channel/);
  });

  it('surfaces a Slack API error', async () => {
    const fetchMock = okJson({ ok: false, error: 'channel_not_found' });
    await expect(
      ACTIONS['sync-to-slack']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, token: 'x', channel: 'C1' },
      }),
    ).rejects.toThrow(/channel_not_found/);
  });
});

describe('ACTIONS["sync-to-discord"]', () => {
  it('delivers via an https discord webhook', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const res = (await ACTIONS['sync-to-discord']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, webhookUrl: 'https://discord.com/api/webhooks/1/abc' },
    })) as { delivered: boolean };
    expect(res.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects a non-discord webhook host', async () => {
    await expect(
      ACTIONS['sync-to-discord']!({
        token: 's',
        payload: { order: ORDER, webhookUrl: 'https://evil.example/hook' },
      }),
    ).rejects.toThrow(/discord\.com/);
  });

  it('rejects a malformed webhook url', async () => {
    await expect(
      ACTIONS['sync-to-discord']!({ token: 's', payload: { order: ORDER, webhookUrl: 'not-a-url' } }),
    ).rejects.toThrow(/valid URL/);
  });

  it('redacts secrets reflected in an error response body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('error: token xoxb-2222-secret rejected', { status: 401 }),
    );
    const err = await ACTIONS['sync-to-discord']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, webhookUrl: 'https://discord.com/api/webhooks/1/abc' },
    }).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(err).not.toContain('xoxb-2222-secret');
    expect(err).toContain('[REDACTED]');
  });
});

describe('ACTIONS["sync-to-line"]', () => {
  it('pushes a text message', async () => {
    const fetchMock = okJson({});
    const res = (await ACTIONS['sync-to-line']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'line-tok', to: 'U123' },
    })) as { delivered: boolean };
    expect(res.delivered).toBe(true);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
  });

  it('requires to + line token', async () => {
    await expect(
      ACTIONS['sync-to-line']!({ token: 's', payload: { order: ORDER, token: 'x' } }),
    ).rejects.toThrow(/to are required/);
  });
});

describe('ACTIONS["sync-to-gmail"]', () => {
  it('creates a draft addressed to the customer', async () => {
    const fetchMock = okJson({ id: 'draft-9' });
    const res = (await ACTIONS['sync-to-gmail']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'ya29.token' },
    })) as { draftId: string };
    expect(res.draftId).toBe('draft-9');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    // raw is base64url: no +, /, or = padding
    expect(body.message.raw).not.toMatch(/[+/=]/);
  });

  it('requires an order email', async () => {
    await expect(
      ACTIONS['sync-to-gmail']!({
        token: 's',
        payload: { order: { ...ORDER, email: undefined }, token: 'ya29' },
      }),
    ).rejects.toThrow(/order.email/);
  });
});

describe('ACTIONS["sync-to-notion"]', () => {
  it('appends an order row to a database', async () => {
    const fetchMock = okJson({ id: 'page-1', url: 'https://notion.so/page-1' });
    const res = (await ACTIONS['sync-to-notion']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'secret_x', databaseId: 'db1' },
    })) as { pageId: string };
    expect(res.pageId).toBe('page-1');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Notion-Version']).toBe('2022-06-28');
  });

  it('requires databaseId', async () => {
    await expect(
      ACTIONS['sync-to-notion']!({ token: 's', payload: { order: ORDER, token: 'x' } }),
    ).rejects.toThrow(/databaseId/);
  });
});

describe('ACTIONS["sync-to-salesforce"]', () => {
  it('creates a Contact at the instance origin', async () => {
    const fetchMock = okJson({ id: '003xx', success: true }, 201);
    const res = (await ACTIONS['sync-to-salesforce']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'sf', instanceUrl: 'https://my.my.salesforce.com' },
    })) as { contactId: string };
    expect(res.contactId).toBe('003xx');
    expect(fetchMock.mock.calls[0]![0]).toContain('/services/data/v59.0/sobjects/Contact/');
  });

  it('rejects a non-https instanceUrl', async () => {
    await expect(
      ACTIONS['sync-to-salesforce']!({
        token: 's',
        payload: { order: ORDER, token: 'x', instanceUrl: 'http://insecure' },
      }),
    ).rejects.toThrow(/https/);
  });

  it('rejects a malformed instanceUrl', async () => {
    await expect(
      ACTIONS['sync-to-salesforce']!({
        token: 's',
        payload: { order: ORDER, token: 'x', instanceUrl: 'not a url' },
      }),
    ).rejects.toThrow(/valid URL/);
  });
});

describe('ACTIONS["sync-to-stripe"]', () => {
  it('creates a customer with shopify metadata', async () => {
    const fetchMock = okJson({ id: 'cus_1' });
    const res = (await ACTIONS['sync-to-stripe']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'sk_test' },
    })) as { customerId: string };
    expect(res.customerId).toBe('cus_1');
    const body = (fetchMock.mock.calls[0]![1] as RequestInit).body as string;
    expect(body).toContain('metadata%5Bshopify_order_id%5D');
  });

  it('requires a stripe token', async () => {
    await expect(
      ACTIONS['sync-to-stripe']!({ token: 's', payload: { order: ORDER } }),
    ).rejects.toThrow(/Stripe/);
  });
});

describe('connector registry', () => {
  it('derives ACTIONS from CONNECTORS (keys match, 1:1)', () => {
    const actionKeys = Object.keys(ACTIONS).sort();
    const connectorActions = CONNECTORS.map((c) => c.action).sort();
    expect(actionKeys).toEqual(connectorActions);
    // every action resolves to the connector's run fn
    for (const c of CONNECTORS) expect(ACTIONS[c.action]).toBe(c.run);
  });

  it('has unique ids and actions, and action = sync-to-<id>', () => {
    expect(new Set(CONNECTORS.map((c) => c.id)).size).toBe(CONNECTORS.length);
    expect(new Set(CONNECTORS.map((c) => c.action)).size).toBe(CONNECTORS.length);
    for (const c of CONNECTORS) expect(c.action).toBe(`sync-to-${c.id}`);
  });

  it('covers the 7 business targets with declared required fields', () => {
    const ids = CONNECTORS.map((c) => c.id).sort();
    expect(ids).toEqual(['discord', 'gmail', 'line', 'notion', 'salesforce', 'slack', 'stripe']);
    const slack = CONNECTORS.find((c) => c.id === 'slack')!;
    expect(slack.requiredFields).toEqual(['token', 'channel']);
  });

  it('listConnectors exposes metadata without the run fn', () => {
    const meta = listConnectors();
    expect(meta).toHaveLength(CONNECTORS.length);
    expect(meta[0]).not.toHaveProperty('run');
    expect(meta.find((m) => m.id === 'notion')?.requiredFields).toEqual(['token', 'databaseId']);
  });
});
