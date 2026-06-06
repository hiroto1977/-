import { describe, expect, it, vi } from 'vitest';
import {
  fetchShopifySnapshot,
  ACTIONS,
  CONNECTORS,
  listConnectors,
  assertOrder,
  assertUniqueConnectors,
  orderHeadline,
  orderLines,
  type ShopifyConnector,
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

/** Parse the request body of the Nth (default first) fetch call as JSON. */
function jsonBody(fetchMock: ReturnType<typeof okJson>, call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]![1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function headers(fetchMock: ReturnType<typeof okJson>, call = 0): Record<string, string> {
  const init = fetchMock.mock.calls[call]![1] as RequestInit;
  return init.headers as Record<string, string>;
}

interface TaggedError {
  serviceId?: string;
  message: string;
}

/** Run a promise expected to reject and return the (typed) caught error. */
async function caught(p: Promise<unknown>): Promise<TaggedError> {
  try {
    await p;
    throw new Error('expected promise to reject, but it resolved');
  } catch (e) {
    return e as TaggedError;
  }
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
  it('assertOrder returns the order when valid', () => {
    expect(assertOrder({ order: ORDER })).toBe(ORDER);
  });

  it('assertOrder rejects a missing order', () => {
    expect(() => assertOrder({})).toThrow(/order is required/);
  });

  it('assertOrder rejects a non-object order', () => {
    expect(() => assertOrder({ order: 'nope' })).toThrow(/order is required/);
  });

  it('assertOrder rejects when only id is missing', () => {
    expect(() => assertOrder({ order: { id: '', name: '#9' } })).toThrow(
      /order.id and order.name are required/,
    );
  });

  it('assertOrder rejects when only name is missing', () => {
    expect(() => assertOrder({ order: { id: '1', name: '' } })).toThrow(
      /order.id and order.name are required/,
    );
  });

  it('orderHeadline is the exact composed subject line', () => {
    expect(orderHeadline(ORDER)).toBe('新規注文 #1001 — 山田太郎 (¥12,000)');
  });

  it('orderHeadline falls back to 匿名 for a blank customer', () => {
    expect(orderHeadline({ ...ORDER, customer: '' })).toBe('新規注文 #1001 — 匿名 (¥12,000)');
  });

  it('orderLines bullets each line item joined by newlines', () => {
    expect(orderLines(ORDER)).toBe('・Tシャツ × 2\n・マグカップ × 1');
  });

  it('orderLines renders the empty placeholder for no items', () => {
    expect(orderLines({ ...ORDER, lineItems: [] })).toBe('(明細なし)');
  });

  it('orderLines treats a missing lineItems array as empty', () => {
    expect(orderLines({ ...ORDER, lineItems: undefined as never })).toBe('(明細なし)');
  });
});

describe('ACTIONS["sync-to-slack"]', () => {
  it('posts the exact order message to the channel', async () => {
    const fetchMock = okJson({ ok: true, ts: '111.222', channel: 'C1' });
    const res = (await ACTIONS['sync-to-slack']!({
      token: 'shopify',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'xoxb-slack', channel: 'C1' },
    })) as { service: string; ts: string; channel: string };
    expect(res).toEqual({ service: 'slack', ts: '111.222', channel: 'C1' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect((init as RequestInit).method).toBe('POST');
    expect(headers(fetchMock)).toEqual({
      Authorization: 'Bearer xoxb-slack',
      'Content-Type': 'application/json; charset=utf-8',
    });
    const body = jsonBody(fetchMock);
    expect(body.channel).toBe('C1');
    // full order message = headline + lines + url tail
    expect(body.text).toBe(
      '新規注文 #1001 — 山田太郎 (¥12,000)\n・Tシャツ × 2\n・マグカップ × 1\nhttps://admin.shopify.com/orders/1',
    );
  });

  it('omits the url tail when the order has no url', async () => {
    const fetchMock = okJson({ ok: true, ts: 't', channel: 'C1' });
    await ACTIONS['sync-to-slack']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: { ...ORDER, url: undefined }, token: 'x', channel: 'C1' },
    });
    expect(jsonBody(fetchMock).text).toBe(
      '新規注文 #1001 — 山田太郎 (¥12,000)\n・Tシャツ × 2\n・マグカップ × 1',
    );
  });

  it('defaults the returned ts/channel to empty/given when absent in response', async () => {
    const fetchMock = okJson({ ok: true });
    const res = (await ACTIONS['sync-to-slack']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'x', channel: 'C9' },
    })) as { ts: string; channel: string };
    expect(res.ts).toBe('');
    expect(res.channel).toBe('C9');
  });

  it('requires both channel and slack token', async () => {
    await expect(
      ACTIONS['sync-to-slack']!({ token: 's', payload: { order: ORDER, token: 'x' } }),
    ).rejects.toThrow(/token \(Slack\) and channel are required/);
    await expect(
      ACTIONS['sync-to-slack']!({ token: 's', payload: { order: ORDER, channel: 'C1' } }),
    ).rejects.toThrow(/token \(Slack\) and channel are required/);
  });

  it('surfaces a Slack API error', async () => {
    const fetchMock = okJson({ ok: false, error: 'channel_not_found' });
    await expect(
      ACTIONS['sync-to-slack']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, token: 'x', channel: 'C1' },
      }),
    ).rejects.toThrow(/slack channel_not_found/);
  });

  it('surfaces a generic Slack error when no error field is present', async () => {
    const fetchMock = okJson({ ok: false });
    await expect(
      ACTIONS['sync-to-slack']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, token: 'x', channel: 'C1' },
      }),
    ).rejects.toThrow(/slack unknown_error/);
  });

  it('tags the application-level FetchError with the shopify→slack serviceId', async () => {
    const fetchMock = okJson({ ok: false, error: 'rate_limited' });
    const err = await caught(
      ACTIONS['sync-to-slack']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, token: 'x', channel: 'C1' },
      }),
    );
    expect(err.serviceId).toBe('shopify→slack');
  });

  it('tags an HTTP-level error with the shopify→slack serviceId', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('boom', { status: 500 }));
    const err = await caught(
      ACTIONS['sync-to-slack']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, token: 'x', channel: 'C1' },
      }),
    );
    expect(err.serviceId).toBe('shopify→slack');
    expect(err.message).toContain('shopify→slack 500');
  });
});

describe('ACTIONS["sync-to-discord"]', () => {
  it('delivers the order content via an https discord webhook', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const res = (await ACTIONS['sync-to-discord']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, webhookUrl: 'https://discord.com/api/webhooks/1/abc' },
    })) as { service: string; delivered: boolean };
    expect(res).toEqual({ service: 'discord', delivered: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://discord.com/api/webhooks/1/abc');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse((init as RequestInit).body as string) as { content: string };
    expect(body.content).toBe(
      '新規注文 #1001 — 山田太郎 (¥12,000)\n・Tシャツ × 2\n・マグカップ × 1\nhttps://admin.shopify.com/orders/1',
    );
  });

  it('requires a webhookUrl', async () => {
    await expect(
      ACTIONS['sync-to-discord']!({ token: 's', payload: { order: ORDER } }),
    ).rejects.toThrow(/webhookUrl is required/);
  });

  it('rejects a non-discord webhook host', async () => {
    await expect(
      ACTIONS['sync-to-discord']!({
        token: 's',
        payload: { order: ORDER, webhookUrl: 'https://evil.example/hook' },
      }),
    ).rejects.toThrow(/webhookUrl must be an https:\/\/discord\.com URL/);
  });

  it('rejects an http (non-https) discord url', async () => {
    await expect(
      ACTIONS['sync-to-discord']!({
        token: 's',
        payload: { order: ORDER, webhookUrl: 'http://discord.com/api/webhooks/1/abc' },
      }),
    ).rejects.toThrow(/webhookUrl must be an https:\/\/discord\.com URL/);
  });

  it('rejects a malformed webhook url', async () => {
    await expect(
      ACTIONS['sync-to-discord']!({ token: 's', payload: { order: ORDER, webhookUrl: 'not-a-url' } }),
    ).rejects.toThrow(/webhookUrl is not a valid URL/);
  });

  it('throws a FetchError with the upstream status on a non-ok response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('bad', { status: 400 }));
    const err = await caught(
      ACTIONS['sync-to-discord']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, webhookUrl: 'https://discord.com/api/webhooks/1/abc' },
      }),
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.serviceId).toBe('shopify→discord');
    expect(err.message).toContain('shopify→discord 400');
    expect(err.message).toContain('bad');
  });

  it('redacts secrets reflected in an error response body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('error: token xoxb-2222-secret rejected', { status: 401 }),
    );
    const err = await caught(
      ACTIONS['sync-to-discord']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, webhookUrl: 'https://discord.com/api/webhooks/1/abc' },
      }),
    );
    expect(err.message).not.toContain('xoxb-2222-secret');
    expect(err.message).toContain('[REDACTED]');
  });

  it('tolerates an unreadable error body (text() rejects) → empty detail', async () => {
    const res = new Response(null, { status: 502 });
    vi.spyOn(res, 'text').mockRejectedValue(new Error('stream broke'));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(res);
    const err = await caught(
      ACTIONS['sync-to-discord']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, webhookUrl: 'https://discord.com/api/webhooks/1/abc' },
      }),
    );
    expect(err.message).toBe('shopify→discord 502: ');
  });

  it('truncates a very long error body to 200 chars', async () => {
    const long = 'x'.repeat(500);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(long, { status: 400 }));
    const err = await caught(
      ACTIONS['sync-to-discord']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, webhookUrl: 'https://discord.com/api/webhooks/1/abc' },
      }),
    );
    // prefix "shopify→discord 400: " + exactly 200 x's, no more
    expect(err.message).toBe(`shopify→discord 400: ${'x'.repeat(200)}`);
  });
});

describe('ACTIONS["sync-to-line"]', () => {
  it('pushes a text message to the recipient', async () => {
    const fetchMock = okJson({});
    const res = (await ACTIONS['sync-to-line']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'line-tok', to: 'U123' },
    })) as { service: string; delivered: boolean };
    expect(res).toEqual({ service: 'line', delivered: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
    expect((init as RequestInit).method).toBe('POST');
    expect(headers(fetchMock)).toEqual({
      Authorization: 'Bearer line-tok',
      'Content-Type': 'application/json',
    });
    const body = jsonBody(fetchMock) as { to: string; messages: Array<Record<string, string>> };
    expect(body.to).toBe('U123');
    expect(body.messages).toEqual([
      {
        type: 'text',
        text: '新規注文 #1001 — 山田太郎 (¥12,000)\n・Tシャツ × 2\n・マグカップ × 1\nhttps://admin.shopify.com/orders/1',
      },
    ]);
  });

  it('requires both to and line token', async () => {
    await expect(
      ACTIONS['sync-to-line']!({ token: 's', payload: { order: ORDER, token: 'x' } }),
    ).rejects.toThrow(/token \(LINE\) and to are required/);
    await expect(
      ACTIONS['sync-to-line']!({ token: 's', payload: { order: ORDER, to: 'U1' } }),
    ).rejects.toThrow(/token \(LINE\) and to are required/);
  });

  it('tags an HTTP-level error with the shopify→line serviceId', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 400 }));
    const err = await caught(
      ACTIONS['sync-to-line']!({
        token: 's',
        fetch: fetchMock,
        payload: { order: ORDER, token: 'x', to: 'U1' },
      }),
    );
    expect(err.serviceId).toBe('shopify→line');
    expect(err.message).toContain('shopify→line 400');
  });
});

describe('ACTIONS["sync-to-gmail"]', () => {
  it('creates a base64url draft addressed to the customer', async () => {
    const fetchMock = okJson({ id: 'draft-9' });
    const res = (await ACTIONS['sync-to-gmail']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'ya29.token' },
    })) as { service: string; draftId: string };
    expect(res).toEqual({ service: 'gmail', draftId: 'draft-9' });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/drafts');
    expect(headers(fetchMock)).toEqual({
      Authorization: 'Bearer ya29.token',
      'Content-Type': 'application/json',
    });

    const raw = (jsonBody(fetchMock).message as { raw: string }).raw;
    // base64url: no +, /, or = padding
    expect(raw).not.toMatch(/[+/=]/);
    // decode back to the RFC 822 message and assert its exact structure
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const subject = `=?UTF-8?B?${Buffer.from('ご注文ありがとうございます #1001', 'utf8').toString('base64')}?=`;
    expect(decoded).toBe(
      [
        'To: taro@example.com',
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        '山田太郎様\n\nご注文を承りました。\n\n・Tシャツ × 2\n・マグカップ × 1\n\n合計: ¥12,000',
      ].join('\r\n'),
    );
  });

  it.each([
    { name: '#1', desc: 'two padding chars (==)' },
    { name: '#11', desc: 'one padding char (=)' },
    { name: '#11111', desc: 'no padding' },
  ])('strips all base64url padding and round-trips: $desc', async ({ name }) => {
    const fetchMock = okJson({ id: 'd' });
    const order = { ...ORDER, name };
    await ACTIONS['sync-to-gmail']!({
      token: 's',
      fetch: fetchMock,
      payload: { order, token: 'ya29' },
    });
    const raw = (jsonBody(fetchMock).message as { raw: string }).raw;
    // no leftover padding / non-url chars
    expect(raw).not.toMatch(/[+/=]/);
    // and it must still decode back losslessly (so we didn't over-strip)
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(decoded).toContain(`To: ${order.email}`);
    expect(decoded).toContain('合計: ¥12,000');
    const subject = `=?UTF-8?B?${Buffer.from(`ご注文ありがとうございます ${name}`).toString('base64')}?=`;
    expect(decoded).toContain(`Subject: ${subject}`);
  });

  it('falls back to お客様 when the customer name is blank', async () => {
    const fetchMock = okJson({ id: 'd' });
    await ACTIONS['sync-to-gmail']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: { ...ORDER, customer: '' }, token: 'ya29' },
    });
    const raw = (jsonBody(fetchMock).message as { raw: string }).raw;
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(decoded).toContain('お客様\n\nご注文を承りました。');
  });

  it('requires a gmail token', async () => {
    await expect(
      ACTIONS['sync-to-gmail']!({ token: 's', payload: { order: ORDER } }),
    ).rejects.toThrow(/token \(Gmail\) is required/);
  });

  it('requires an order email', async () => {
    await expect(
      ACTIONS['sync-to-gmail']!({
        token: 's',
        payload: { order: { ...ORDER, email: undefined }, token: 'ya29' },
      }),
    ).rejects.toThrow(/order.email is required to draft a customer email/);
  });
});

describe('ACTIONS["sync-to-notion"]', () => {
  it('appends an order row with headline + total to the database', async () => {
    const fetchMock = okJson({ id: 'page-1', url: 'https://notion.so/page-1' });
    const res = (await ACTIONS['sync-to-notion']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'secret_x', databaseId: 'db1' },
    })) as { service: string; pageId: string; url: string };
    expect(res).toEqual({ service: 'notion', pageId: 'page-1', url: 'https://notion.so/page-1' });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect(headers(fetchMock)).toEqual({
      Authorization: 'Bearer secret_x',
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    });
    expect(jsonBody(fetchMock)).toEqual({
      parent: { database_id: 'db1' },
      properties: {
        Name: { title: [{ text: { content: '新規注文 #1001 — 山田太郎 (¥12,000)' } }] },
        Total: { rich_text: [{ text: { content: '¥12,000' } }] },
      },
    });
  });

  it('defaults the returned url to empty when absent in response', async () => {
    const fetchMock = okJson({ id: 'page-2' });
    const res = (await ACTIONS['sync-to-notion']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'x', databaseId: 'db1' },
    })) as { url: string };
    expect(res.url).toBe('');
  });

  it('requires both token and databaseId', async () => {
    await expect(
      ACTIONS['sync-to-notion']!({ token: 's', payload: { order: ORDER, token: 'x' } }),
    ).rejects.toThrow(/token \(Notion\) and databaseId are required/);
    await expect(
      ACTIONS['sync-to-notion']!({ token: 's', payload: { order: ORDER, databaseId: 'db1' } }),
    ).rejects.toThrow(/token \(Notion\) and databaseId are required/);
  });
});

describe('ACTIONS["sync-to-salesforce"]', () => {
  it('creates a Contact at the instance origin', async () => {
    const fetchMock = okJson({ id: '003xx', success: true }, 201);
    const res = (await ACTIONS['sync-to-salesforce']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'sf', instanceUrl: 'https://my.my.salesforce.com/path?q=1' },
    })) as { service: string; contactId: string };
    expect(res).toEqual({ service: 'salesforce', contactId: '003xx' });

    const [url] = fetchMock.mock.calls[0]!;
    // uses base.origin only — strips path/query
    expect(url).toBe('https://my.my.salesforce.com/services/data/v59.0/sobjects/Contact/');
    expect(headers(fetchMock)).toEqual({
      Authorization: 'Bearer sf',
      'Content-Type': 'application/json',
    });
    expect(jsonBody(fetchMock)).toEqual({ LastName: '山田太郎', Email: 'taro@example.com' });
  });

  it('falls back to the order name as LastName when customer is blank', async () => {
    const fetchMock = okJson({ id: 'c', success: true });
    await ACTIONS['sync-to-salesforce']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: { ...ORDER, customer: '' }, token: 'sf', instanceUrl: 'https://x.com' },
    });
    expect(jsonBody(fetchMock).LastName).toBe('#1001');
  });

  it('requires both token and instanceUrl', async () => {
    await expect(
      ACTIONS['sync-to-salesforce']!({ token: 's', payload: { order: ORDER, token: 'x' } }),
    ).rejects.toThrow(/token \(Salesforce\) and instanceUrl are required/);
    await expect(
      ACTIONS['sync-to-salesforce']!({
        token: 's',
        payload: { order: ORDER, instanceUrl: 'https://x.com' },
      }),
    ).rejects.toThrow(/token \(Salesforce\) and instanceUrl are required/);
  });

  it('rejects a non-https instanceUrl', async () => {
    await expect(
      ACTIONS['sync-to-salesforce']!({
        token: 's',
        payload: { order: ORDER, token: 'x', instanceUrl: 'http://insecure.com' },
      }),
    ).rejects.toThrow(/instanceUrl must be https/);
  });

  it('rejects a malformed instanceUrl', async () => {
    await expect(
      ACTIONS['sync-to-salesforce']!({
        token: 's',
        payload: { order: ORDER, token: 'x', instanceUrl: 'not a url' },
      }),
    ).rejects.toThrow(/instanceUrl is not a valid URL/);
  });
});

describe('ACTIONS["sync-to-stripe"]', () => {
  it('creates a customer with email, name and shopify metadata', async () => {
    const fetchMock = okJson({ id: 'cus_1' });
    const res = (await ACTIONS['sync-to-stripe']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: ORDER, token: 'sk_test' },
    })) as { service: string; customerId: string };
    expect(res).toEqual({ service: 'stripe', customerId: 'cus_1' });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.stripe.com/v1/customers');
    expect(headers(fetchMock)).toEqual({
      Authorization: 'Bearer sk_test',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const form = new URLSearchParams(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(form.get('email')).toBe('taro@example.com');
    expect(form.get('name')).toBe('山田太郎');
    expect(form.get('metadata[shopify_order_id]')).toBe('gid://shopify/Order/1');
    expect(form.get('metadata[shopify_order_name]')).toBe('#1001');
  });

  it('omits email when the order has none and falls back to name', async () => {
    const fetchMock = okJson({ id: 'cus_2' });
    await ACTIONS['sync-to-stripe']!({
      token: 's',
      fetch: fetchMock,
      payload: { order: { ...ORDER, email: undefined, customer: '' }, token: 'sk' },
    });
    const form = new URLSearchParams(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(form.has('email')).toBe(false);
    expect(form.get('name')).toBe('#1001');
  });

  it('requires a stripe token', async () => {
    await expect(
      ACTIONS['sync-to-stripe']!({ token: 's', payload: { order: ORDER } }),
    ).rejects.toThrow(/token \(Stripe\) is required/);
  });
});

describe('connector registry', () => {
  it('declares the exact 7 connectors with ids, actions, labels and required fields', () => {
    expect(
      CONNECTORS.map((c) => ({
        id: c.id,
        action: c.action,
        label: c.label,
        requiredFields: c.requiredFields,
      })),
    ).toEqual([
      { id: 'slack', action: 'sync-to-slack', label: 'Slack', requiredFields: ['token', 'channel'] },
      { id: 'discord', action: 'sync-to-discord', label: 'Discord', requiredFields: ['webhookUrl'] },
      { id: 'line', action: 'sync-to-line', label: 'LINE', requiredFields: ['token', 'to'] },
      { id: 'gmail', action: 'sync-to-gmail', label: 'Gmail', requiredFields: ['token'] },
      { id: 'notion', action: 'sync-to-notion', label: 'Notion', requiredFields: ['token', 'databaseId'] },
      { id: 'salesforce', action: 'sync-to-salesforce', label: 'Salesforce', requiredFields: ['token', 'instanceUrl'] },
      { id: 'stripe', action: 'sync-to-stripe', label: 'Stripe', requiredFields: ['token'] },
    ]);
  });

  it('derives ACTIONS from CONNECTORS (keys match, 1:1, same run fn)', () => {
    const actionKeys = Object.keys(ACTIONS).sort();
    const connectorActions = CONNECTORS.map((c) => c.action).sort();
    expect(actionKeys).toEqual(connectorActions);
    for (const c of CONNECTORS) expect(ACTIONS[c.action]).toBe(c.run);
  });

  it('has unique ids and actions, and action = sync-to-<id>', () => {
    expect(new Set(CONNECTORS.map((c) => c.id)).size).toBe(CONNECTORS.length);
    expect(new Set(CONNECTORS.map((c) => c.action)).size).toBe(CONNECTORS.length);
    for (const c of CONNECTORS) expect(c.action).toBe(`sync-to-${c.id}`);
  });

  it('listConnectors exposes metadata without the run fn', () => {
    const meta = listConnectors();
    expect(meta).toHaveLength(CONNECTORS.length);
    for (const m of meta) expect(m).not.toHaveProperty('run');
    expect(meta).toEqual(
      CONNECTORS.map((c) => ({
        id: c.id,
        action: c.action,
        label: c.label,
        requiredFields: c.requiredFields,
      })),
    );
  });
});

describe('connector HTTP method + serviceId tagging', () => {
  // The POST method and the per-connector serviceId tag (used when the upstream
  // returns a non-2xx) are load-bearing wire details. Assert method on the happy
  // path and serviceId on an HTTP error for the jsonFetch-based connectors that
  // aren't already covered by a dedicated error test above.
  it.each([
    {
      action: 'sync-to-gmail',
      serviceId: 'shopify→gmail',
      payload: { order: ORDER, token: 'ya29' },
    },
    {
      action: 'sync-to-notion',
      serviceId: 'shopify→notion',
      payload: { order: ORDER, token: 'x', databaseId: 'db1' },
    },
    {
      action: 'sync-to-salesforce',
      serviceId: 'shopify→salesforce',
      payload: { order: ORDER, token: 'x', instanceUrl: 'https://x.com' },
    },
    {
      action: 'sync-to-stripe',
      serviceId: 'shopify→stripe',
      payload: { order: ORDER, token: 'sk' },
    },
  ])('$action issues a POST and tags HTTP errors with $serviceId', async ({ action, serviceId, payload }) => {
    const okMock = okJson({ id: 'x', success: true, url: '' });
    await ACTIONS[action]!({ token: 's', fetch: okMock, payload });
    expect((okMock.mock.calls[0]![1] as RequestInit).method).toBe('POST');

    const errMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('err', { status: 500 }));
    const err = await caught(ACTIONS[action]!({ token: 's', fetch: errMock, payload }));
    expect(err.serviceId).toBe(serviceId);
    expect(err.message).toContain(`${serviceId} 500`);
  });
});

describe('assertUniqueConnectors invariant', () => {
  const base: ShopifyConnector = CONNECTORS[0]!;

  it('accepts the real (unique) connector list', () => {
    expect(() => assertUniqueConnectors(CONNECTORS)).not.toThrow();
  });

  it('throws on a duplicate id', () => {
    expect(() =>
      assertUniqueConnectors([base, { ...base, action: 'sync-to-other' }]),
    ).toThrow(/duplicate connector id "slack"/);
  });

  it('throws on a duplicate action (with distinct ids)', () => {
    expect(() =>
      assertUniqueConnectors([base, { ...base, id: 'other' }]),
    ).toThrow(/duplicate connector action "sync-to-slack"/);
  });

  it('accepts an empty connector list', () => {
    expect(() => assertUniqueConnectors([])).not.toThrow();
  });
});
