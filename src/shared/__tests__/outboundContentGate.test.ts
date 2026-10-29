/*
 * 出力インターセプター (threat: T-215) —— 端末の外へ出る action の本文を、送る直前に**規則**で検める。
 *
 * 守るのは「AI が騙されて『送れ』と判断しても、送る側が止める」こと。だから検査は
 * **値の形**と**段階**の両方を見る: 資格情報 / マイナンバー / カード番号の形を持つ本文は
 * `external-write` / `egress` の action では断られ、端末内に書く action では止めない
 * (止めると資格情報の正当な保存が壊れる)。断りの文は**値を 1 字も引用しない**。
 */
import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_PAYLOAD_FIELDS,
  FINDING_LABELS,
  MAX_PAYLOAD_DEPTH,
  MAX_SCANNED_CHARS,
  MAX_SCANNED_STRINGS,
  SECRET_SHAPES,
  findCardNumber,
  findMyNumber,
  findSecret,
  isValidMyNumber,
  outboundContentRefusal,
  passesLuhn,
  scanPayload,
  scanText,
} from '../outboundContentGate';
import { ACTION_TIER, OUTBOUND_TIERS } from '../actionTier';

const ANTHROPIC = 'sk-ant-api03-' + 'abcdefghijklmnopqrstuvwxyz' + '0123456789';
const SLACK = 'xoxb-' + '1234567890' + '-abcdefghij';
/** 検査数字が合うマイナンバー (番号法施行令 §8 の算式で検算した標本)。 */
const MY_NUMBER = '123456789018';
const CARD = '4111 1111 1111 1111';

describe('資格情報の形 (findSecret)', () => {
  it.each([
    ['Anthropic', ANTHROPIC],
    ['OpenAI project', 'sk-proj-' + 'abcdefghijklmnopqrstuvwxyz0123'],
    ['GitHub PAT', 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789'],
    ['GitHub fine-grained', 'github_pat_' + '11AAAAAAA_abcdefghijklmnopqrstuv'],
    ['Slack bot', SLACK],
    ['Notion', 'ntn_' + '123456789012345678901234567890'],
    // 見本は組み立てる —— 字面で持つと GitHub の push protection が本物として止める
    ['Shopify', 'shpat_' + '0123456789abcdef'.repeat(2)],
    ['Stripe', 'sk_live_' + 'abcdefghijklm' + 'nopqrstuvwxyz'],
    ['AWS access key', 'AKIA' + 'IOSFODNN7EXAMPLE'],
    ['Google API key', 'AIzaSyA-' + 'abcdefghijklmnopqrstuvwxyz0123456'],
    ['Google refresh token', '1//0' + 'abcdefghijklmnopqrstuvwxyz0123456789'],
    ['JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijklmnop'],
    ['PEM', '-----BEGIN RSA ' + 'PRIVATE KEY-----\nMIIE'],
    ['線上のヘッダ', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz'],
    ['JSON の項目', '{"api-key":"abcdefghijklmnopqrstuvwxyz"}'],
  ])('%s の形は当たる', (_label, value) => {
    expect(findSecret(`メモ: ${value} です`)).toBe(true);
  });

  it.each([
    ['普通の業務文', '来週の会議の議題を整理してください。担当: 山田'],
    ['メールと電話', '連絡先 taro@example.com / 03-1234-5678'],
    ['短い sk-', 'sk-short'],
    ['散文の鍵の話', 'API キーは管理画面で設定済みです (値はここに書かない)'],
    ['URL', 'https://example.com/docs/getting-started?lang=ja'],
  ])('%s は当たらない (偽陽性で製品を壊さない)', (_label, value) => {
    expect(findSecret(value)).toBe(false);
  });

  it('SECRET_SHAPES の規則は id が一意で、どれも自分の標本に当たる', () => {
    const ids = SECRET_SHAPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SECRET_SHAPES.length).toBeGreaterThanOrEqual(14);
  });
});

describe('マイナンバーの形', () => {
  it('検査数字が合う 12 桁だけ', () => {
    expect(isValidMyNumber(MY_NUMBER)).toBe(true);
    expect(isValidMyNumber('123456789019')).toBe(false);
    expect(isValidMyNumber('12345678901')).toBe(false);
    expect(isValidMyNumber('1234567890123')).toBe(false);
  });

  it('空白・ハイフン区切りでも当たり、電話番号や注文番号には当たらない', () => {
    expect(findMyNumber('個人番号 1234 5678 9018')).toBe(true);
    expect(findMyNumber('1234-5678-9018')).toBe(true);
    expect(findMyNumber('注文番号 20261029000001 / 電話 090-1234-5678')).toBe(false);
  });
});

describe('クレジットカード番号の形', () => {
  it('Luhn', () => {
    expect(passesLuhn('4111111111111111')).toBe(true);
    expect(passesLuhn('4111111111111112')).toBe(false);
  });

  it('主要ブランドの先頭 + Luhn のときだけ当たる', () => {
    expect(findCardNumber(`カード ${CARD}`)).toBe(true);
    expect(findCardNumber('5555 5555 5555 4444')).toBe(true);
    expect(findCardNumber('3782 822463 10005')).toBe(true);
    expect(findCardNumber('4111111111111112')).toBe(false);
    // JAN コード (13 桁) は先頭がブランドではないので当たらない
    expect(findCardNumber('4901234567894')).toBe(false);
  });
});

describe('scanText / scanPayload', () => {
  it('3 類を順に返し、無ければ空', () => {
    expect(scanText(`${ANTHROPIC} ${MY_NUMBER} ${CARD}`)).toEqual(['secret', 'my-number', 'card-number']);
    expect(scanText('普通の文')).toEqual([]);
  });

  it('入れ子の欄も歩き、場所 (値ではない) を名指しする', () => {
    const v = scanPayload({ messages: [{ role: 'user', content: `鍵 ${ANTHROPIC}` }], system: 'x' });
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') throw new Error('unreachable');
    expect(v.findings).toEqual([{ kind: 'secret', path: 'messages[0].content', label: FINDING_LABELS.secret }]);
    expect(v.message).toContain('messages[0].content');
    expect(v.message).not.toContain(ANTHROPIC);
    expect(v.message).toContain('AI の判断には依りません');
  });

  it('最上位の正当な資格情報の欄 (skipFields) は検めないが、その下の別の欄は検める', () => {
    expect(scanPayload({ token: SLACK, channel: '#x' }, ['token']).kind).toBe('clear');
    const v = scanPayload({ token: SLACK, order: { note: SLACK } }, ['token']);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.findings.map((f) => f.path)).toEqual(['order.note']);
  });

  it('深すぎる payload は「安全」と見なさず断る (読めない = 通さない)', () => {
    let deep: unknown = 'x';
    for (let i = 0; i <= MAX_PAYLOAD_DEPTH + 1; i++) deep = { a: deep };
    expect(scanPayload(deep).kind).toBe('unreadable');
  });

  it('大きすぎる文字列・多すぎる文字列は「安全」と見なさず断る (上限は文字で数える)', () => {
    const ok = 'あ'.repeat(MAX_SCANNED_CHARS);
    expect(scanPayload({ note: ok }).kind).toBe('clear');
    // 絵文字 1 字は 2 符号単位 —— 文字で数えるので上限ちょうどは通る
    expect(scanPayload({ note: '😀'.repeat(MAX_SCANNED_CHARS) }).kind).toBe('clear');
    expect(scanPayload({ note: ok + 'あ' }).kind).toBe('unreadable');
    const many = Array.from({ length: MAX_SCANNED_STRINGS }, () => 'x');
    expect(scanPayload({ many }).kind).toBe('clear');
    expect(scanPayload({ many: [...many, 'x'] }).kind).toBe('unreadable');
  });

  it('同じ欄の同じ形は 1 度だけ名指しする', () => {
    const v = scanPayload({ note: `${ANTHROPIC} と ${ANTHROPIC}` });
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.message.split('資格情報の形').length - 1).toBe(1);
  });
});

describe('outboundContentRefusal —— 段階で決める', () => {
  it('egress (AI へ) と external-write (SaaS へ) は断る', () => {
    expect(outboundContentRefusal('assistant', 'chat', { messages: [{ role: 'user', content: ANTHROPIC }] })).not.toBeNull();
    expect(outboundContentRefusal('slack', 'send-message', { channel: '#x', text: `番号 ${MY_NUMBER}` })).not.toBeNull();
    expect(outboundContentRefusal('github', 'create-issue', { title: 't', body: CARD })).not.toBeNull();
  });

  it('端末内に書く段階 (local-write / read) は止めない', () => {
    expect(outboundContentRefusal('stocks', 'register-ticker', { note: ANTHROPIC })).toBeNull();
    expect(outboundContentRefusal('stocks', 'backtest', { note: ANTHROPIC })).toBeNull();
  });

  it('台帳に無い action は external-write に倒れるので検める (fail closed)', () => {
    expect(ACTION_TIER['nobody/nothing']).toBeUndefined();
    expect(outboundContentRefusal('nobody', 'nothing', { x: ANTHROPIC })).not.toBeNull();
  });

  it('きれいな本文は通す (答えは 1 つも変わらない)', () => {
    expect(outboundContentRefusal('assistant', 'chat', { system: 'あなたは相談役です', messages: [{ role: 'user', content: '後輩への伝え方 (連絡先 taro@example.com)' }] })).toBeNull();
    expect(outboundContentRefusal('gmail', 'create-draft', { to: 'a@example.com', subject: 'お礼', body: '昨日はありがとうございました。03-1234-5678' })).toBeNull();
  });

  it('OUTBOUND_TIERS は external-write と egress の 2 つだけ', () => {
    expect([...OUTBOUND_TIERS].sort()).toEqual(['egress', 'external-write']);
  });
});

describe('正当に資格情報を運ぶ欄の台帳 (両方向)', () => {
  it('台帳の action は実在し、段階は external-write で、理由を持つ', () => {
    for (const [key, row] of Object.entries(CREDENTIAL_PAYLOAD_FIELDS)) {
      expect(ACTION_TIER[key], `${key} は台帳 ACTION_TIER に無い`).toBe('external-write');
      expect(row.fields.length).toBeGreaterThan(0);
      expect(row.why.length).toBeGreaterThan(20);
    }
  });

  it('★ 台帳の欄は本当に検めない (鍵をそこへ置いても通る) —— 対照: 別の欄なら止まる', () => {
    for (const [key, row] of Object.entries(CREDENTIAL_PAYLOAD_FIELDS)) {
      const [service, action] = key.split('/') as [string, string];
      const payload: Record<string, unknown> = { order: { id: 1 } };
      for (const f of row.fields) payload[f] = SLACK;
      expect(outboundContentRefusal(service, action, payload), key).toBeNull();
      expect(outboundContentRefusal(service, action, { ...payload, order: { note: SLACK } }), `${key} の別の欄`).not.toBeNull();
    }
  });

  it('★ 母集団: shopify/sync-to-* はすべて台帳に在る (payload でトークンを受ける設計)', () => {
    const sync = Object.keys(ACTION_TIER).filter((k) => k.startsWith('shopify/sync-to-'));
    expect(sync.length).toBeGreaterThanOrEqual(7);
    expect(sync.filter((k) => !(k in CREDENTIAL_PAYLOAD_FIELDS))).toEqual([]);
  });
});
