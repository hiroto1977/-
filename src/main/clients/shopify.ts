import {
  jsonFetch,
  FetchError,
  redactSecrets,
  type ActionContext,
  type ActionMap,
  type ServiceAction,
  type FetchContext,
} from './types';

/**
 * Shopify — 連携先 + サービス間連携アクション。
 *
 * 読み取り (fetchShopifySnapshot) は公式 Admin API 配線が Phase 6+ 予定の
 * ため static stub。一方、書き込み側の ACTIONS は「Shopify の注文を他サービス
 * へ自動連携する」コネクタ骨組みを提供する。
 *
 * ## コネクタの設計方針 (skeleton)
 *
 * 各 `sync-to-<service>` アクションは Shopify の注文サマリ (`payload.order`)
 * を受け取り、連携先サービス向けに整形して送信する。連携先の認証情報は
 * `payload` 経由で渡す前提:
 *
 *   - `ctx.token` は **Shopify** のトークン (invoke 対象サービスのもの)。
 *   - 連携先 (Slack / Gmail 等) のトークンや Webhook URL は `payload` に載せる。
 *
 * 将来、main 側 secrets.ts から連携先トークンを引く配線 (cross-service token
 * resolution) を入れる際は、各コネクタの `payload.token` 解決部分だけを
 * 差し替えればよい。`fetch` は注入可能なので全コネクタが Node 上で
 * ネットワーク無しでユニットテストできる。
 */

export interface ShopifySnapshot {
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly count: number;
}

// Stryker disable next-line all
const STUB: ShopifySnapshot = { items: [], count: 0 };

export async function fetchShopifySnapshotImpl(_ctx: FetchContext): Promise<ShopifySnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchShopifySnapshot(ctx: FetchContext): Promise<ShopifySnapshot> {
  return fetchShopifySnapshotImpl(ctx);
}

// --- shared order model + formatting -------------------------------------

/** Normalized Shopify order summary that every connector consumes. The
 *  renderer builds this from a SNAPSHOT row (or, once the Admin API is
 *  wired, from a live order) and passes it through `serviceHub.invoke()`. */
export interface ShopifyOrderSummary {
  /** Shopify order GID or numeric id, as a string. */
  readonly id: string;
  /** Human order name, e.g. "#1001". */
  readonly name: string;
  /** Customer display name. */
  readonly customer: string;
  /** Customer email (optional — required only by email/CRM connectors). */
  readonly email?: string;
  /** Pre-formatted total incl. currency symbol, e.g. "¥12,000". */
  readonly total: string;
  /** ISO 4217 currency code, e.g. "JPY". */
  readonly currency: string;
  readonly lineItems: ReadonlyArray<{ readonly title: string; readonly quantity: number }>;
  /** Admin URL for the order (optional). */
  readonly url?: string;
}

/** Pull and shallow-validate `payload.order`. Throws a clear error if a
 *  connector was invoked without an order to sync. */
export function assertOrder(payload: Record<string, unknown>): ShopifyOrderSummary {
  const order = payload.order as ShopifyOrderSummary | undefined;
  if (!order || typeof order !== 'object') throw new Error('order is required');
  if (!order.id || !order.name) throw new Error('order.id and order.name are required');
  return order;
}

/** One-line headline used as the message subject across connectors. */
export function orderHeadline(o: ShopifyOrderSummary): string {
  return `新規注文 ${o.name} — ${o.customer || '匿名'} (${o.total})`;
}

/** Bulleted line-item block for chat/email bodies. */
export function orderLines(o: ShopifyOrderSummary): string {
  const items = o.lineItems ?? [];
  if (items.length === 0) return '(明細なし)';
  return items.map((li) => `・${li.title} × ${li.quantity}`).join('\n');
}

/** Full human-readable message body shared by Slack / Discord / LINE. */
function orderMessage(o: ShopifyOrderSummary): string {
  const tail = o.url ? `\n${o.url}` : '';
  return `${orderHeadline(o)}\n${orderLines(o)}${tail}`;
}

/** RFC 2047 "encoded-word" for a UTF-8 mail header (Subject) so Japanese
 *  text survives Gmail's MIME parsing. */
function encodeMimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** base64url (no padding) — the encoding Gmail's `drafts.create` expects
 *  for the raw RFC 822 message. */
function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** POST to an endpoint that returns an empty body on success (e.g. a
 *  Discord webhook → 204). `jsonFetch` can't be used because it always
 *  parses JSON. */
async function postExpectOk(
  url: string,
  init: RequestInit,
  ctx: { fetch?: typeof fetch; serviceId: string },
): Promise<void> {
  const f = ctx.fetch ?? fetch;
  const res = await f(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // redactSecrets: 連携先が応答にトークンを反射しても、エラー経由で漏らさない。
    throw new FetchError(
      `${ctx.serviceId} ${res.status}: ${redactSecrets(body.slice(0, 200))}`,
      res.status,
      ctx.serviceId,
    );
  }
}

// --- connectors ----------------------------------------------------------

interface SlackPostResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

/** Shopify → Slack: post an order notification to a channel.
 *  payload: `{ order, token (Slack bot token), channel }`. */
async function syncToSlack(ctx: ActionContext): Promise<{ service: 'slack'; ts: string; channel: string }> {
  const order = assertOrder(ctx.payload);
  const { token, channel } = ctx.payload as { token?: string; channel?: string };
  if (!token || !channel) throw new Error('token (Slack) and channel are required');

  const res = await jsonFetch<SlackPostResponse>(
    'https://slack.com/api/chat.postMessage',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, text: orderMessage(order) }),
    },
    { fetch: ctx.fetch, serviceId: 'shopify→slack' },
  );
  if (!res.ok) throw new FetchError(`slack ${res.error ?? 'unknown_error'}`, 0, 'shopify→slack');
  return { service: 'slack', ts: res.ts ?? '', channel: res.channel ?? channel };
}

/** Shopify → Discord: deliver an order notification via an incoming webhook.
 *  payload: `{ order, webhookUrl }`. */
async function syncToDiscord(ctx: ActionContext): Promise<{ service: 'discord'; delivered: true }> {
  const order = assertOrder(ctx.payload);
  const { webhookUrl } = ctx.payload as { webhookUrl?: string };
  if (!webhookUrl) throw new Error('webhookUrl is required');
  let u: URL;
  try {
    u = new URL(webhookUrl);
  } catch {
    throw new Error('webhookUrl is not a valid URL');
  }
  if (u.protocol !== 'https:' || u.hostname !== 'discord.com') {
    throw new Error('webhookUrl must be an https://discord.com URL');
  }

  await postExpectOk(
    webhookUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: orderMessage(order) }),
    },
    { fetch: ctx.fetch, serviceId: 'shopify→discord' },
  );
  return { service: 'discord', delivered: true };
}

interface LinePushResponse {
  message?: string;
}

/** Shopify → LINE: push an order notification to a user/group.
 *  payload: `{ order, token (LINE channel access token), to }`. */
async function syncToLine(ctx: ActionContext): Promise<{ service: 'line'; delivered: true }> {
  const order = assertOrder(ctx.payload);
  const { token, to } = ctx.payload as { token?: string; to?: string };
  if (!token || !to) throw new Error('token (LINE) and to are required');

  await jsonFetch<LinePushResponse>(
    'https://api.line.me/v2/bot/message/push',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages: [{ type: 'text', text: orderMessage(order) }] }),
    },
    { fetch: ctx.fetch, serviceId: 'shopify→line' },
  );
  return { service: 'line', delivered: true };
}

interface GmailDraftResponse {
  id: string;
}

/** Shopify → Gmail: create a draft order-confirmation email to the customer.
 *  payload: `{ order, token (Gmail OAuth access token) }`. */
async function syncToGmail(ctx: ActionContext): Promise<{ service: 'gmail'; draftId: string }> {
  const order = assertOrder(ctx.payload);
  const { token } = ctx.payload as { token?: string };
  if (!token) throw new Error('token (Gmail) is required');
  if (!order.email) throw new Error('order.email is required to draft a customer email');

  const mime = [
    `To: ${order.email}`,
    `Subject: ${encodeMimeHeader(`ご注文ありがとうございます ${order.name}`)}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    `${order.customer || 'お客'}様\n\nご注文を承りました。\n\n${orderLines(order)}\n\n合計: ${order.total}`,
  ].join('\r\n');

  const res = await jsonFetch<GmailDraftResponse>(
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw: toBase64Url(mime) } }),
    },
    { fetch: ctx.fetch, serviceId: 'shopify→gmail' },
  );
  return { service: 'gmail', draftId: res.id };
}

interface NotionPageResponse {
  id: string;
  url?: string;
}

/** Shopify → Notion: append the order as a row in an order-log database.
 *  payload: `{ order, token (Notion integration token), databaseId }`. */
async function syncToNotion(ctx: ActionContext): Promise<{ service: 'notion'; pageId: string; url: string }> {
  const order = assertOrder(ctx.payload);
  const { token, databaseId } = ctx.payload as { token?: string; databaseId?: string };
  if (!token || !databaseId) throw new Error('token (Notion) and databaseId are required');

  const res = await jsonFetch<NotionPageResponse>(
    'https://api.notion.com/v1/pages',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Name: { title: [{ text: { content: orderHeadline(order) } }] },
          Total: { rich_text: [{ text: { content: order.total } }] },
        },
      }),
    },
    { fetch: ctx.fetch, serviceId: 'shopify→notion' },
  );
  return { service: 'notion', pageId: res.id, url: res.url ?? '' };
}

interface SalesforceCreateResponse {
  id: string;
  success: boolean;
}

/** Shopify → Salesforce: create a CRM Contact for the customer.
 *  payload: `{ order, token (Salesforce access token), instanceUrl }`. */
async function syncToSalesforce(ctx: ActionContext): Promise<{ service: 'salesforce'; contactId: string }> {
  const order = assertOrder(ctx.payload);
  const { token, instanceUrl } = ctx.payload as { token?: string; instanceUrl?: string };
  if (!token || !instanceUrl) throw new Error('token (Salesforce) and instanceUrl are required');
  let base: URL;
  try {
    base = new URL(instanceUrl);
  } catch {
    throw new Error('instanceUrl is not a valid URL');
  }
  if (base.protocol !== 'https:') throw new Error('instanceUrl must be https');

  const res = await jsonFetch<SalesforceCreateResponse>(
    `${base.origin}/services/data/v59.0/sobjects/Contact/`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ LastName: order.customer || order.name, Email: order.email }),
    },
    { fetch: ctx.fetch, serviceId: 'shopify→salesforce' },
  );
  return { service: 'salesforce', contactId: res.id };
}

interface StripeCustomerResponse {
  id: string;
}

/** Shopify → Stripe: record the customer for payment reconciliation.
 *  payload: `{ order, token (Stripe secret key) }`. */
async function syncToStripe(ctx: ActionContext): Promise<{ service: 'stripe'; customerId: string }> {
  const order = assertOrder(ctx.payload);
  const { token } = ctx.payload as { token?: string };
  if (!token) throw new Error('token (Stripe) is required');

  const form = new URLSearchParams();
  if (order.email) form.set('email', order.email);
  form.set('name', order.customer || order.name);
  form.set('metadata[shopify_order_id]', order.id);
  form.set('metadata[shopify_order_name]', order.name);

  const res = await jsonFetch<StripeCustomerResponse>(
    'https://api.stripe.com/v1/customers',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    },
    { fetch: ctx.fetch, serviceId: 'shopify→stripe' },
  );
  return { service: 'stripe', customerId: res.id };
}

/** Declarative description of one Shopify→external connector. Centralizing
 *  this (rather than a loose ACTIONS object) lets the registry self-check —
 *  the ACTIONS map and the `lint:test-coverage` gate both derive from it, so
 *  a connector can't be half-wired. `requiredFields` are the payload keys a
 *  connector needs *in addition to* `order`, used for docs + UI hints. */
export interface ShopifyConnector {
  /** Short target id, e.g. 'slack'. */
  readonly id: string;
  /** Action key exposed via serviceHub.invoke('shopify', <action>). */
  readonly action: string;
  /** Human label for the target service. */
  readonly label: string;
  /** Payload fields required beyond `order`. */
  readonly requiredFields: readonly string[];
  readonly run: ServiceAction;
}

export const CONNECTORS: readonly ShopifyConnector[] = [
  { id: 'slack', action: 'sync-to-slack', label: 'Slack', requiredFields: ['token', 'channel'], run: syncToSlack },
  { id: 'discord', action: 'sync-to-discord', label: 'Discord', requiredFields: ['webhookUrl'], run: syncToDiscord },
  { id: 'line', action: 'sync-to-line', label: 'LINE', requiredFields: ['token', 'to'], run: syncToLine },
  { id: 'gmail', action: 'sync-to-gmail', label: 'Gmail', requiredFields: ['token'], run: syncToGmail },
  { id: 'notion', action: 'sync-to-notion', label: 'Notion', requiredFields: ['token', 'databaseId'], run: syncToNotion },
  { id: 'salesforce', action: 'sync-to-salesforce', label: 'Salesforce', requiredFields: ['token', 'instanceUrl'], run: syncToSalesforce },
  { id: 'stripe', action: 'sync-to-stripe', label: 'Stripe', requiredFields: ['token'], run: syncToStripe },
];

// Runtime invariant: connector ids + action keys are unique. Trips at module
// load if a future edit introduces a duplicate, mirroring the LIVE_FETCHERS
// guard in clients/index.ts.
{
  const ids = new Set<string>();
  const actions = new Set<string>();
  for (const c of CONNECTORS) {
    if (ids.has(c.id)) throw new Error(`[shopify] duplicate connector id "${c.id}"`);
    if (actions.has(c.action)) throw new Error(`[shopify] duplicate connector action "${c.action}"`);
    ids.add(c.id);
    actions.add(c.action);
  }
}

/** Connector metadata (without the run fn) for UI/discovery. */
export function listConnectors(): { id: string; action: string; label: string; requiredFields: readonly string[] }[] {
  return CONNECTORS.map(({ id, action, label, requiredFields }) => ({ id, action, label, requiredFields }));
}

export const ACTIONS: ActionMap = Object.fromEntries(CONNECTORS.map((c) => [c.action, c.run]));
