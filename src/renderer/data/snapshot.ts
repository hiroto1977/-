// Snapshot of live data fetched from each service's MCP server.
// Captured on 2026-05-11. Refreshing this snapshot is a manual step
// until each ServiceClient is wired up to call the live REST APIs.

import type { ShigyoSnapshot } from '../../shared/shigyoTypes';

export const SNAPSHOT = {
  home: {
    greeting: 'こんにちは。今日は何を作りましょう?',
    fetchedAt: '',
    isMock: true,
  },
  library: {
    note: 'ライブラリの実体はブラウザの IndexedDB に保存されます',
    fetchedAt: '',
    isMock: true,
  },
  settings: {
    note: 'API キーはマスターパスワードで暗号化されてブラウザに保管されます',
    fetchedAt: '',
    isMock: true,
  },

  fetchedAt: '2026-05-11T09:30:00Z',

  github: {
    user: {
      login: 'hiroto1977',
      name: 'AMITARIS',
      company: 'アミタリス',
      avatarUrl: 'https://avatars.githubusercontent.com/u/267496817?v=4',
      profileUrl: 'https://github.com/hiroto1977',
      publicRepos: 0,
      followers: 0,
    },
    pullRequests: [
      {
        number: 2,
        title: 'Add CLAUDE.md',
        state: 'open',
        draft: true,
        head: 'claude/add-claude-documentation-F7HIa',
        base: 'main',
        updatedAt: '2026-05-11T09:09:04Z',
        htmlUrl: 'https://github.com/hiroto1977/-/pull/2',
      },
      {
        number: 1,
        title:
          'feat: ローカルファースト 業務 AI 統合スイート + L8 オーケストレーション',
        state: 'open',
        draft: false,
        head: 'claude/improve-desktop-usability-81QHo',
        base: 'main',
        updatedAt: '2026-05-07T01:28:49Z',
        htmlUrl: 'https://github.com/hiroto1977/-/pull/1',
      },
    ],
  },

  wordpress: {
    sites: [
      {
        blogId: 230249395,
        name: '～なごみ館～',
        description: '今を生きるあなたへ',
        url: 'https://nagomikan.wordpress.com',
        platform: 'simple',
        status: 'active',
        lastUpdated: '2025-11-18',
        paidPlan: false,
      },
      {
        blogId: 230495299,
        name: '笑楽生(しょうがくせい)の独り言',
        description: '',
        url: 'https://onceinlifetime2015gmail.wordpress.com',
        platform: 'simple',
        status: 'active',
        lastUpdated: '2025-07-01',
        paidPlan: false,
      },
      {
        blogId: 230242450,
        name: '介護徒然日記～笑楽生の日々～',
        description: '日々のブログを通じて、皆様が少しでも笑顔で過ごして頂く為のサイトです。',
        url: 'https://kaigo17.wordpress.com',
        platform: 'simple',
        status: 'active',
        lastUpdated: '2024-03-05',
        paidPlan: false,
      },
    ],
  },

  atlassian: {
    sites: [
      {
        cloudId: 'cd488b16-45f1-4f43-9b53-48bbc0f0b748',
        name: 'onceinlifetime2015',
        url: 'https://onceinlifetime2015.atlassian.net',
        scopes: ['read:jira-work', 'write:jira-work'],
      },
    ],
    jiraProjects: [
      { key: 'KAN', name: 'AMITARIS', projectTypeKey: 'software', style: 'next-gen' },
      {
        key: 'SAM1',
        name: '(Example) Sales Outreach Strategy',
        projectTypeKey: 'software',
        style: 'next-gen',
      },
    ],
  },

  notion: {
    teams: [] as { id: string; name: string }[],
    note: '参加中のチームスペースなし。Notion AI 検索でもヒットなし。',
    pages: [] as { id: string; title: string; url: string; lastEditedTime: string; kind: string }[],
  },

  drive: {
    files: [
      {
        id: '1Wv5ioEERsYR_LozadFLm9uSD6emuQA1IrzJDDbDbVDk',
        title: 'SYSTEM_BLUEPRINT.md',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-04-24',
        viewUrl:
          'https://docs.google.com/document/d/1Wv5ioEERsYR_LozadFLm9uSD6emuQA1IrzJDDbDbVDk/edit',
      },
      {
        id: '15BsNdLk-MUwv7zC0iZc-JbcToBZCzZXErqFenen7Tvw',
        title: 'ROLLBACK.md',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-04-23',
        viewUrl:
          'https://docs.google.com/document/d/15BsNdLk-MUwv7zC0iZc-JbcToBZCzZXErqFenen7Tvw/edit',
      },
      {
        id: '1KgiNBuy9Ck2oEZF62JRtm_guNQR0hkkTcnZQFrPRFW0',
        title: 'キャッシュフロー計画書',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        modifiedTime: '2026-04-21',
        viewUrl:
          'https://docs.google.com/spreadsheets/d/1KgiNBuy9Ck2oEZF62JRtm_guNQR0hkkTcnZQFrPRFW0/edit',
      },
      {
        id: '17TRYAnchZpSc8-u5VaIpoctIyuQLzV48V55ASnwKKSY',
        title: '全スキル_ルール_カテゴリ別カタログ',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-04-17',
        viewUrl:
          'https://docs.google.com/document/d/17TRYAnchZpSc8-u5VaIpoctIyuQLzV48V55ASnwKKSY/edit',
      },
      {
        id: '1Yldcys5yrIaokY8FMV2EhHIhVLAstNJtj_8vRvr0v74',
        title: 'AI最強環境_構築完全手順書',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-04-16',
        viewUrl:
          'https://docs.google.com/document/d/1Yldcys5yrIaokY8FMV2EhHIhVLAstNJtj_8vRvr0v74/edit',
      },
      {
        id: '1tWFgZKW-o_JyP8W1mRpqdtW5OFU8X0Jp',
        title: 'video_scripts_3本.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        modifiedTime: '2026-04-09',
        viewUrl: 'https://drive.google.com/file/d/1tWFgZKW-o_JyP8W1mRpqdtW5OFU8X0Jp/view',
      },
    ],
  },

  calendar: {
    calendars: [
      { id: 'onceinlifetime2015@gmail.com', summary: 'プライマリ', timeZone: 'Asia/Tokyo' },
      {
        id: 'family04474762199381740224@group.calendar.google.com',
        summary: '家族',
        timeZone: 'Asia/Tokyo',
      },
      {
        id: 'ja.japanese#holiday@group.v.calendar.google.com',
        summary: '日本の祝日',
        timeZone: 'Asia/Tokyo',
      },
    ],
    events: [
      { id: 'e1', summary: '（終日予定）', startDate: '2026-05-12', allDay: true },
      { id: 'e2', summary: '（終日予定）', startDate: '2026-05-15', allDay: true },
      { id: 'e3', summary: '（終日予定）', startDate: '2026-05-15', allDay: true },
      { id: 'e4', summary: '（終日予定）', startDate: '2026-05-15', allDay: true },
      { id: 'e5', summary: '（終日予定）', startDate: '2026-05-16', allDay: true },
      {
        id: 'e6',
        summary: '起床～前日の達成率管理（未達成部改善策自己提案）',
        startDate: '2026-05-16T06:00:00+09:00',
        allDay: false,
      },
      { id: 'e7', summary: '（終日予定）', startDate: '2026-05-19', allDay: true },
      { id: 'e8', summary: '（終日予定）', startDate: '2026-05-22', allDay: true },
    ],
  },

  gmail: {
    threads: [
      {
        id: '19e16a59c2898dab',
        sender: 'enquete@info.macromill.jp',
        subject: '［マクロミル］アンケートのお願い <おまとめメール05/11>',
        date: '2026-05-11',
      },
      {
        id: '19e168686032d310',
        sender: 'support@coincheck.com',
        subject: '「ピザポテト」が当たる！「ビットコインピザポテト・デー キャンペーン」',
        date: '2026-05-11',
      },
      {
        id: '19e1677d28418488',
        sender: 'career-mail@cosme.net',
        subject: '【平均勤続年数約10年・賞与年3回】美容部員・セラピスト募集ほか',
        date: '2026-05-11',
      },
      {
        id: '19e166c5628d148f',
        sender: 'noreply@kaigoagent.com',
        subject: '【新着】糟屋郡志免町周辺の求人 (2026/5/11)',
        date: '2026-05-11',
      },
      {
        id: '19e1666d61958768',
        sender: 'info-send-only@info.kabu.com',
        subject: 'FXマーケット動画のご案内',
        date: '2026-05-11',
      },
      {
        id: '19e164f1590a3312',
        sender: 'info@qiita.com',
        subject: '【参加無料】Qiita Conference 2026 特別ご招待',
        date: '2026-05-11',
      },
      {
        id: '19e16334b0933527',
        sender: 'no-reply@rakumachi.jp',
        subject: '【楽待】福岡県で近日開催の不動産投資セミナー',
        date: '2026-05-11',
      },
    ],
  },

  slack: {
    channels: [
      {
        id: 'C0AL7N42GBH',
        name: 'general',
        purpose:
          'このチャンネルには、常にすべてのメンバーが含まれます。社内通知やチーム全体の会話にぴったりです。',
        isArchived: false,
        permalink: 'https://w1773561847-p42622301.slack.com/archives/C0AL7N42GBH',
      },
    ],
  },

  skills: {
    items: [] as {
      name: string;
      description: string;
      source: 'user' | 'project' | 'plugin';
      path: string;
    }[],
  },

  security: {
    norton: {
      installed: false,
      installPath: '' as string,
      platform: '' as string,
      details: '' as string,
    },
    breaches: [] as { email: string; checkedAt: string; count: number }[],
    lastUrlScan: null as { url: string; scannedAt: string; positives: number; total: number } | null,
    keysConfigured: { hibp: false, vt: false },
  },

  cloudflare: {
    user: { email: '', username: '' },
    zones: [] as {
      id: string;
      name: string;
      status: string;
      plan: string;
      accountName: string;
      nameServers: string[];
      devModeRemainingSec: number;
    }[],
  },

  emotions: {
    moods: [] as { date: string; score: number; note: string }[],
    analyses: [] as {
      id: string;
      timestamp: number;
      excerpt: string;
      scores: { joy: number; sadness: number; anger: number; fear: number; surprise: number; disgust: number };
      sentiment: 'positive' | 'neutral' | 'negative';
      dominant: string;
    }[],
    keyConfigured: false,
  },

  ollama: {
    running: false,
    version: '' as string,
    versionSafe: false,
    versionMinRecommended: '0.1.46',
    models: [] as {
      name: string;
      family: string;
      parameterSize: string;
      quantization: string;
      sizeMb: number;
      modifiedAt: string;
    }[],
    warnings: [] as string[],
  },

  uberEats: {
    // Snapshot-only (no LIVE_FETCHERS entry yet). Eats Merchants API
    // requires partner approval; until that's wired, the page renders
    // synthetic-but-realistic store performance data.
    stores: [
      { id: 'store-shibuya', name: 'Shibuya 本店', orders: 142, revenue: 285_400, rating: 4.7, openRate: 0.98 },
      { id: 'store-shinjuku', name: 'Shinjuku 東口店', orders: 98, revenue: 196_800, rating: 4.5, openRate: 0.95 },
      { id: 'store-ikebukuro', name: 'Ikebukuro West', orders: 76, revenue: 152_300, rating: 4.6, openRate: 0.97 },
    ] as { id: string; name: string; orders: number; revenue: number; rating: number; openRate: number }[],
    topItems: [
      { name: 'スパイシーチキンバーガー', sold: 89, revenue: 71_200 },
      { name: 'クラシックチーズバーガー', sold: 67, revenue: 50_250 },
      { name: 'ガーリックフライ (L)', sold: 124, revenue: 49_600 },
    ] as { name: string; sold: number; revenue: number }[],
    weekRevenue: 634_500,
    weekOrders: 316,
    avgRating: 4.6,
  },

  demaeCan: {
    // Snapshot-only — 出前館 has no public REST API; data here is
    // illustrative of the operational dashboard shape.
    orders: [
      { id: 'DC-20260518-001', customer: '田中様', items: 3, total: 2_450, status: '配達中', area: '渋谷区' },
      { id: 'DC-20260518-002', customer: '佐藤様', items: 2, total: 1_780, status: '調理中', area: '新宿区' },
      { id: 'DC-20260518-003', customer: '鈴木様', items: 5, total: 4_120, status: '配達完了', area: '世田谷区' },
      { id: 'DC-20260518-004', customer: '高橋様', items: 1, total: 980, status: '受付済み', area: '中野区' },
    ] as { id: string; customer: string; items: number; total: number; status: string; area: string }[],
    monthSummary: {
      orders: 612,
      revenue: 1_245_300,
      avgOrderValue: 2_035,
      cancellationRate: 0.018,
    },
    topAreas: [
      { area: '渋谷区', orders: 178, revenue: 362_400 },
      { area: '新宿区', orders: 134, revenue: 273_600 },
      { area: '世田谷区', orders: 89, revenue: 181_200 },
    ] as { area: string; orders: number; revenue: number }[],
  },

  realEstate: {
    // Snapshot-only. Real-world integration would pull from REIT data
    // feeds (J-REIT XBRL, 楽待 API 等); for now the page surfaces a
    // hand-curated portfolio shape so the dashboard is meaningful.
    properties: [
      { id: 're-001', name: '渋谷区マンション 1LDK', type: '区分所有', monthlyRent: 168_000, occupied: true, yieldPct: 4.8, purchasePrice: 42_000_000 },
      { id: 're-002', name: '横浜市戸建て', type: '一棟', monthlyRent: 235_000, occupied: true, yieldPct: 6.2, purchasePrice: 45_400_000 },
      { id: 're-003', name: '大阪市ワンルーム', type: '区分所有', monthlyRent: 72_000, occupied: false, yieldPct: 5.5, purchasePrice: 15_700_000 },
      { id: 're-004', name: '札幌市アパート 6 戸', type: '一棟', monthlyRent: 420_000, occupied: true, yieldPct: 8.1, purchasePrice: 62_000_000 },
    ] as { id: string; name: string; type: string; monthlyRent: number; occupied: boolean; yieldPct: number; purchasePrice: number }[],
    // Numbers below are internally consistent: grossRent = 入居中 3 物件
    // の実家賃 (168+235+420=823k)。空室の大阪 72k は除外して実収入で算出。
    // netCashflow = 823k − 168k − 412k = 243k。
    monthlyCashflow: {
      grossRent: 823_000,
      operatingExpenses: 168_000,
      mortgagePayment: 412_000,
      netCashflow: 243_000,
    },
    // portfolioYield = 個別 yieldPct の単純平均: (4.8+6.2+5.5+8.1)/4 = 6.15。
    portfolioYield: 6.15,
    // by-property 入居率: 3/4 物件入居 (札幌アパート 6 戸は 1 物件としてカウント)。
    occupancyRate: 0.75,
  },

  mutualFunds: {
    // Snapshot-only. A future live integration could call SBI / 楽天証券
    // for holdings, but for now the page renders an illustrative holdings
    // view to validate UI flow.
    holdings: [
      { code: '0331C152', name: 'eMAXIS Slim 米国株式 (S&P500)', units: 1_240_000, navPerUnit: 26_140, valuation: 3_241_360, ytdReturnPct: 14.2 },
      { code: '03313187', name: 'eMAXIS Slim 全世界株式 (オール・カントリー)', units: 980_000, navPerUnit: 24_870, valuation: 2_437_260, ytdReturnPct: 11.8 },
      { code: '0331C129', name: 'eMAXIS Slim 先進国債券インデックス', units: 520_000, navPerUnit: 13_420, valuation: 697_840, ytdReturnPct: 3.4 },
      { code: '64311074', name: 'ひふみプラス', userTag: '積立中', units: 320_000, navPerUnit: 58_240, valuation: 1_863_680, ytdReturnPct: 8.7 },
    ] as { code: string; name: string; units: number; navPerUnit: number; valuation: number; ytdReturnPct: number; userTag?: string }[],
    portfolio: {
      totalValuation: 8_240_140,
      totalCostBasis: 7_180_000,
      unrealizedGain: 1_060_140,
      unrealizedGainPct: 14.8,
    },
    recentDividends: [
      { code: '0331C152', amount: 12_400, paidAt: '2026-03-20' },
      { code: '64311074', amount: 8_900, paidAt: '2026-02-15' },
    ] as { code: string; amount: number; paidAt: string }[],
  },

  quality: {
    // Snapshot-only. Future iteration will pull values from
    // `npm run quality:report` (scripts/quality-report.cjs).
    unitTests: { staticCount: 1175, runtimeCount: 1224 },
    mutation: { score: 100.00, mutateModules: 36, killed: 2447, threshold: 99.8 },
    verifications: [
      { name: 'typecheck', status: 'pass' },
      { name: 'ESLint (0 errors / 0 warnings)', status: 'pass' },
      { name: 'verify:arch (170 file:line refs + 6 metrics)', status: 'pass' },
      { name: 'lint:forbidden (8 patterns scanned)', status: 'pass' },
      { name: 'lint:imports (273 imports / 88 files)', status: 'pass' },
      { name: 'lint:docs (4 cross-doc facts)', status: 'pass' },
      { name: 'lint:test-coverage (27 services)', status: 'pass' },
      { name: 'CI quality / test / build', status: 'pass' },
    ] as { name: string; status: 'pass' | 'fail' }[],
    reviewHistory: [
      // PR #2 — Phase E
      { pr: 2, round: 1, verdict: '要修正',     blocking: 0, shouldFix: 7, nit: 5 },
      { pr: 2, round: 2, verdict: '要修正',     blocking: 3, shouldFix: 5, nit: 3 },
      { pr: 2, round: 3, verdict: 'マージ可',   blocking: 2, shouldFix: 3, nit: 0 },
      // PR #3 — フードデリバリー + 投資
      { pr: 3, round: 1, verdict: '要修正',     blocking: 3, shouldFix: 5, nit: 2 },
      { pr: 3, round: 2, verdict: 'マージ可',   blocking: 0, shouldFix: 0, nit: 3 },
      { pr: 3, round: 3, verdict: 'マージ推奨', blocking: 0, shouldFix: 0, nit: 0 },
      { pr: 3, round: 4, verdict: 'マージ推奨', blocking: 0, shouldFix: 0, nit: 3 },
    ] as {
      pr: number; round: number;
      verdict: '要修正' | 'マージ可' | 'マージ推奨';
      blocking: number; shouldFix: number; nit: number;
    }[],
    artifactSizes: { standaloneHtmlKb: 421, electronMainKb: 113 },
    latestCommit: 'ff50f63',
  },

  microsoft365: {
    userName: '',
    messages: [] as { id: string; subject: string; from: string; received: string; unread: boolean }[],
    events: [] as { id: string; subject: string; start: string; location: string }[],
    items: [
      { id: 'outlook-1', name: '📧 Outlook: 未読 23 件 / 今日の送信 7 件' },
      { id: 'onedrive-1', name: '☁ OneDrive: 12.4 GB / 1 TB (1.2%) · 最近 4 ファイル' },
      { id: 'teams-1', name: '👥 Teams: 今日 3 会議 / 未読 8 メッセージ' },
    ] as { id: string; name: string }[],
    count: 3,
  },

  dropbox: {
    items: [
      { id: 'f-1', name: '📁 Q3-report.xlsx · 2026-05-18 · 共有 3 名' },
      { id: 'f-2', name: '📁 marketing-assets/ · 142 ファイル · 4.2 GB' },
      { id: 'f-3', name: '📁 contracts-signed.pdf · 2026-05-15' },
    ] as { id: string; name: string }[],
    count: 3,
  },

  salesforce: {
    items: [
      { id: 'opp-001', name: '🎯 商談: ACME 大型案件 (¥18M) — Stage 4/6' },
      { id: 'opp-002', name: '🎯 商談: Beta Corp 更新 (¥6M) — Stage 5/6' },
      { id: 'lead-001', name: '👤 リード: Gamma Industries (確度高)' },
      { id: 'kpi', name: '📊 月次パイプライン: ¥124M / 商談 18 件' },
    ] as { id: string; name: string }[],
    count: 4,
  },

  discord: {
    items: [
      { id: 'srv-1', name: '🔵 Service Hub Dev (1,242 メンバー · 8 チャンネル)' },
      { id: 'srv-2', name: '🟢 ユーザーコミュニティ (4,521 メンバー · 12 チャンネル)' },
      { id: 'msg', name: '💬 今日の活動: 89 メッセージ / 4 スレッド' },
    ] as { id: string; name: string }[],
    count: 3,
  },

  asana: {
    items: [
      { id: 't-1', name: '✅ Phase 6: Live API 接続 — 進捗 40% (12/30 完了)' },
      { id: 't-2', name: '🚧 Q3 OKR 設定 — 期限 7 日後 / 担当 5 名' },
      { id: 't-3', name: '⏳ ユーザーインタビュー × 8 — 5 件実施済' },
    ] as { id: string; name: string }[],
    count: 3,
  },

  linear: {
    items: [
      { id: 'ENG-142', name: '🐛 ENG-142: SSRF guard で NAT64 prefix 取りこぼし (P1)' },
      { id: 'ENG-148', name: '✨ ENG-148: AI advisor の Anthropic 接続 (P2)' },
      { id: 'cycle', name: '🔄 Cycle 23: 8 issues / 完了 5 / 進行中 2' },
    ] as { id: string; name: string }[],
    count: 3,
  },

  sentry: {
    items: [
      { id: 'err-1', name: '🔴 [main] Uncaught TypeError in autoLock.ts (24 件 / 4h)' },
      { id: 'err-2', name: '🟡 [renderer] Slow vault.unlock (>3s, 12 件)' },
      { id: 'rel', name: '🚀 v1.4.2 release: 0 new issues / 142 regressions resolved' },
    ] as { id: string; name: string }[],
    count: 3,
  },

  shopify: {
    items: [
      { id: 'ord-001', name: '🛒 注文 #1042: ¥18,400 · 配送準備中' },
      { id: 'ord-002', name: '🛒 注文 #1043: ¥6,200 · 出荷済' },
      { id: 'rev', name: '💰 今月売上: ¥2,840,500 / 注文 187 件 / 顧客 142 名' },
      { id: 'prod', name: '📦 在庫切れ警告: 商品 3 点 (補充推奨)' },
    ] as { id: string; name: string }[],
    count: 4,
  },

  stripe: {
    items: [
      { id: 'mrr', name: '💳 MRR: $48,200 (前月比 +8.4%)' },
      { id: 'cust', name: '👥 アクティブ顧客: 412 名 / 解約率 1.8%' },
      { id: 'inv', name: '📄 未払い請求書: 7 件 ($3,420 相当)' },
      { id: 'today', name: '⚡ 今日の決済: 23 件 / $4,180 / 失敗 1 件' },
    ] as { id: string; name: string }[],
    count: 4,
  },

  line: {
    items: [
      { id: 'fr', name: '👤 友だち: 18,420 名 (前月比 +312)' },
      { id: 'br', name: '📢 直近配信: 「Q3 新機能のご紹介」配信数 17,890 · 開封率 24%' },
      { id: 'msg', name: '💬 今日の応答メッセージ: 142 件 / 自動応答 89 件' },
    ] as { id: string; name: string }[],
    count: 3,
  },

  storage: {
    // Snapshot-only. Phase 6 で Electron main プロセスの `os` / `fs` API
    // を使った live 取得に切替予定。現状は NEC LAVIE FAQ の標準的な PC
    // 状態を illustrative データとして提示。
    disks: [
      { mount: 'C:', label: 'Windows (SSD)', totalGb: 512, usedGb: 387, freeGb: 125, usagePct: 75.6 },
      { mount: 'D:', label: 'Data (HDD)', totalGb: 1000, usedGb: 642, freeGb: 358, usagePct: 64.2 },
    ] as { mount: string; label: string; totalGb: number; usedGb: number; freeGb: number; usagePct: number }[],
    largeFolders: [
      { path: 'C:\\Users\\<user>\\Downloads', sizeGb: 28.4, fileCount: 1_842, category: 'downloads' },
      { path: 'C:\\Windows\\SoftwareDistribution\\Download', sizeGb: 14.2, fileCount: 312, category: 'system' },
      { path: 'C:\\Users\\<user>\\AppData\\Local\\Temp', sizeGb: 8.7, fileCount: 4_120, category: 'cache' },
      { path: 'C:\\Users\\<user>\\AppData\\Local\\Google\\Chrome\\User Data', sizeGb: 6.3, fileCount: 12_840, category: 'cache' },
      { path: 'C:\\Users\\<user>\\OneDrive (sync)', sizeGb: 24.1, fileCount: 8_624, category: 'user' },
      { path: 'C:\\Windows.old', sizeGb: 32.0, fileCount: 184_212, category: 'system' },
    ] as { path: string; sizeGb: number; fileCount: number; category: 'system' | 'downloads' | 'cache' | 'user' | 'app' }[],
    cleanupTasks: [
      {
        id: 'windows-old',
        title: 'Windows.old フォルダの削除 (旧 OS バックアップ)',
        potentialFreeMb: 32_000,
        difficulty: 'safe',
        executable: false,
        howTo: '設定 → システム → 記憶域 → 一時ファイル → 「以前の Windows のインストール」をチェックして削除',
      },
      {
        id: 'temp-files',
        title: '一時ファイル削除 (Temp / WindowsUpdate キャッシュ)',
        potentialFreeMb: 14_500,
        difficulty: 'safe',
        executable: false,
        howTo: '設定 → システム → 記憶域 → 一時ファイル → すべての項目をチェックして削除',
      },
      {
        id: 'recycle-bin',
        title: 'ゴミ箱を空にする',
        potentialFreeMb: 4_200,
        difficulty: 'safe',
        executable: false,
        howTo: 'デスクトップ → ゴミ箱を右クリック → 「ゴミ箱を空にする」',
      },
      {
        id: 'downloads-cleanup',
        title: 'Downloads フォルダの整理 (30 日以上前のファイル)',
        potentialFreeMb: 18_300,
        difficulty: 'caution',
        executable: false,
        howTo: 'エクスプローラー → Downloads → 「更新日時」で並び替え → 古いファイルを確認して削除',
      },
      {
        id: 'chrome-cache',
        title: 'Chrome / Edge キャッシュのクリア',
        potentialFreeMb: 3_400,
        difficulty: 'safe',
        executable: false,
        howTo: 'ブラウザ → 設定 → プライバシー → 「閲覧データの削除」 → キャッシュされた画像とファイル',
      },
      {
        id: 'defrag-hdd',
        title: 'D ドライブ (HDD) のデフラグ',
        potentialFreeMb: 0,
        difficulty: 'caution',
        executable: false,
        howTo: 'エクスプローラー → D: を右クリック → プロパティ → ツール → 「最適化」(SSD は不要)',
      },
      {
        id: 'startup-trim',
        title: 'スタートアップアプリの整理',
        potentialFreeMb: 0,
        difficulty: 'manual',
        executable: false,
        howTo: 'タスクマネージャー → スタートアップ タブ → 不要なアプリを無効化 (起動時間が短縮)',
      },
      {
        id: 'onedrive-files-ondemand',
        title: 'OneDrive の「ファイル オン デマンド」を有効化',
        potentialFreeMb: 24_100,
        difficulty: 'safe',
        executable: false,
        howTo: 'タスクバー → OneDrive アイコン → 設定 → 同期とバックアップ → 「ファイル オン デマンド」をオン',
      },
    ] as {
      id: string; title: string; potentialFreeMb: number;
      difficulty: 'safe' | 'caution' | 'manual'; executable: boolean; howTo: string;
    }[],
    performance: {
      fragmentationPct: 12.4,    // HDD (D:) のみ
      startupSec: 38,            // 標準: 20-30 秒
      runningProcesses: 142,
      memoryUsedGb: 11.2,
      memoryTotalGb: 16.0,
    },
    recommendations: [
      'Cドライブの使用率 75.6% — 「Windows.old」削除 (32 GB 解放) を最優先で実施推奨',
      'HDD (D:) のフラグメント率 12.4% — デフラグで I/O 速度向上が期待できます',
      'スタートアップ 38 秒 — タスクマネージャーで不要アプリを無効化すれば 20 秒台に短縮可能',
      'OneDrive ファイル オン デマンドが無効 — オンに切替で 24 GB 即時解放',
      'メモリ使用率 70% — 警告閾値 80% 未満で良好。80% を超えるようなら Chrome タブ数の整理 / 常駐アプリの見直しを推奨',
    ] as string[],
  },

  // ── 士業連携 (snapshot 専用)。個別の専門家との連絡先 / 相談履歴 /
  //    書類 / 顧問料を軽量 CRM として管理する。Phase 6 で IndexedDB
  //    永続化 + 「専門家を追加」フォームに対応予定。

  // 士業 7 種は共通の ShigyoSnapshot 構造。各ブロックを `satisfies
  // ShigyoSnapshot` で検証することで、従来の per-field `as {...}[]` /
  // `as number` キャストを排した (HANDOFF 罠 5 / PR #7 R1 #4)。月次料金は
  // ShigyoSnapshot.monthlyFee が `number` 型なのでリテラル narrow されない。
  taxAccountant: {
    contacts: [
      { id: 'ta-1', name: '山田 太郎', firm: '山田税理士事務所', email: 'yamada@example.com', phone: '03-1234-5678' },
    ],
    recentConsultations: [
      { id: 'tc-1', contactId: 'ta-1', date: '2026-05-10', topic: '法人税申告書のレビュー', status: '完了' },
      { id: 'tc-2', contactId: 'ta-1', date: '2026-05-18', topic: '消費税インボイス対応', status: '対応中' },
    ],
    pendingDocuments: [
      { id: 'td-1', title: '4 月度 試算表', direction: 'received', date: '2026-05-15' },
      { id: 'td-2', title: '源泉徴収簿', direction: 'sent', date: '2026-05-12' },
    ],
    monthlyFee: 33_000,
    outstandingInvoice: 0,
  } satisfies ShigyoSnapshot,

  laborConsultant: {
    contacts: [
      { id: 'lc-1', name: '鈴木 花子', firm: '鈴木社労士事務所', email: 'suzuki-sr@example.com' },
    ],
    recentConsultations: [
      { id: 'lcc-1', contactId: 'lc-1', date: '2026-05-08', topic: '新入社員の社会保険手続', status: '完了' },
      { id: 'lcc-2', contactId: 'lc-1', date: '2026-05-20', topic: '就業規則の改定', status: '相談予約' },
    ],
    pendingDocuments: [
      { id: 'lcd-1', title: '労働保険申告書', direction: 'received', date: '2026-05-14' },
    ],
    monthlyFee: 22_000,
    outstandingInvoice: 22_000,
  } satisfies ShigyoSnapshot,

  lawyer: {
    contacts: [
      { id: 'lw-1', name: '佐藤 一郎', firm: '佐藤法律事務所', email: 'sato@law.example.com', phone: '03-3000-1100' },
    ],
    recentConsultations: [
      { id: 'lwc-1', contactId: 'lw-1', date: '2026-05-05', topic: '取引基本契約書 v3 レビュー', status: '完了' },
      { id: 'lwc-2', contactId: 'lw-1', date: '2026-05-19', topic: '退職トラブル相談', status: '対応中' },
    ],
    pendingDocuments: [
      { id: 'lwd-1', title: '基本契約書 修正版', direction: 'received', date: '2026-05-12' },
    ],
    monthlyFee: 55_000,
    outstandingInvoice: 0,
  } satisfies ShigyoSnapshot,

  judicialScrivener: {
    contacts: [
      { id: 'js-1', name: '高橋 二郎', firm: '高橋司法書士事務所', email: 'takahashi@js.example.com' },
    ],
    recentConsultations: [
      { id: 'jsc-1', contactId: 'js-1', date: '2026-04-22', topic: '本店所在地変更登記', status: '完了' },
      { id: 'jsc-2', contactId: 'js-1', date: '2026-05-15', topic: '不動産抵当権抹消', status: '対応中' },
    ],
    pendingDocuments: [
      { id: 'jsd-1', title: '登記完了証 (本店移転)', direction: 'received', date: '2026-05-02' },
    ],
    monthlyFee: 0,
    outstandingInvoice: 88_000,
  } satisfies ShigyoSnapshot,

  adminScrivener: {
    contacts: [
      { id: 'as-1', name: '田中 三郎', firm: '田中行政書士事務所', phone: '03-5500-2200' },
    ],
    recentConsultations: [
      { id: 'asc-1', contactId: 'as-1', date: '2026-05-12', topic: 'IT 導入補助金 2026 申請', status: '対応中' },
    ],
    pendingDocuments: [
      { id: 'asd-1', title: '事業計画書 (補助金申請用)', direction: 'sent', date: '2026-05-16' },
    ],
    monthlyFee: 0,
    outstandingInvoice: 0,
  } satisfies ShigyoSnapshot,

  smeConsultant: {
    contacts: [
      { id: 'sm-1', name: '伊藤 四郎', firm: '伊藤経営コンサルティング', email: 'ito@sme.example.com' },
    ],
    recentConsultations: [
      { id: 'smc-1', contactId: 'sm-1', date: '2026-04-30', topic: '事業承継診断', status: '完了' },
      { id: 'smc-2', contactId: 'sm-1', date: '2026-05-17', topic: '中期経営計画策定', status: '相談中' },
    ],
    pendingDocuments: [
      { id: 'smd-1', title: '経営診断レポート Q1', direction: 'received', date: '2026-04-28' },
    ],
    monthlyFee: 44_000,
    outstandingInvoice: 0,
  } satisfies ShigyoSnapshot,

  patentAttorney: {
    contacts: [
      { id: 'pa-1', name: '渡辺 五郎', firm: '渡辺特許事務所', email: 'watanabe@patent.example.com', phone: '03-7700-3300' },
    ],
    recentConsultations: [
      { id: 'pac-1', contactId: 'pa-1', date: '2026-05-03', topic: '商標出願 (新サービス名)', status: '対応中' },
      { id: 'pac-2', contactId: 'pa-1', date: '2026-05-18', topic: '特許出願戦略相談', status: '相談予約' },
    ],
    pendingDocuments: [
      { id: 'pad-1', title: '商標出願書 ドラフト', direction: 'received', date: '2026-05-11' },
      { id: 'pad-2', title: '先行技術調査結果', direction: 'received', date: '2026-05-08' },
    ],
    monthlyFee: 0,
    outstandingInvoice: 165_000,
  } satisfies ShigyoSnapshot,

  base: {
    items: [
      { id: 'base-1', name: 'オリジナルパーカー', price: 6800, stock: 24, visible: true },
      { id: 'base-2', name: 'キャンバストートバッグ', price: 2400, stock: 53, visible: true },
      { id: 'base-3', name: '限定ステッカーセット', price: 800, stock: 0, visible: false },
    ] as { id: string; name: string; price: number; stock: number; visible: boolean }[],
  },

  netsea: {
    items: [
      { id: 'ns-1001', name: '無地Tシャツ 5枚セット (卸)' },
      { id: 'ns-1002', name: 'ステンレスボトル 350ml' },
      { id: 'ns-1003', name: 'LED デスクライト 調光式' },
    ] as { id: string; name: string }[],
  },

  'super-delivery': {
    items: [
      { id: 'sd-2001', name: 'アロマディフューザー 木目調' },
      { id: 'sd-2002', name: 'コットントートバッグ 無地' },
      { id: 'sd-2003', name: '陶器マグ 6個セット' },
    ] as { id: string; name: string }[],
  },

  topseller: {
    items: [
      { id: 'ts-3001', name: 'ワイヤレスイヤホン (ドロップシッピング)' },
      { id: 'ts-3002', name: 'スマホスタンド 折りたたみ' },
      { id: 'ts-3003', name: 'フィットネスバンド 心拍計付き' },
    ] as { id: string; name: string }[],
  },

  a8net: {
    items: [
      { id: 'a8-4001', name: '[確定] 動画配信サービス 登録 — ¥1,200' },
      { id: 'a8-4002', name: '[確定] クレジットカード発行 — ¥3,000' },
      { id: 'a8-4003', name: '[保留] 格安SIM 申込 — ¥1,500' },
    ] as { id: string; name: string }[],
  },

  'ai-blogkun': {
    items: [
      { id: 'ab-5001', name: '[公開] 2026年 EC トレンド 10選' },
      { id: 'ab-5002', name: '[公開] 初心者向け SEO 内部対策ガイド' },
      { id: 'ab-5003', name: '[下書き] ふるさと納税 おすすめ返礼品' },
    ] as { id: string; name: string }[],
  },

  moneyforward: {
    items: [
      { id: 'mf-6001', name: '5月度 売上仕訳 (自動連携)' },
      { id: 'mf-6002', name: '経費精算 — 交通費 ¥3,200' },
      { id: 'mf-6003', name: '請求書 #INV-0512 — ¥165,000' },
    ] as { id: string; name: string }[],
  },

  amazon: {
    items: [
      { id: 'az-7001', name: 'オリジナルTシャツ (FBA) — 在庫 42' },
      { id: 'az-7002', name: 'ステンレスタンブラー — 在庫 18' },
      { id: 'az-7003', name: 'スマホケース 手帳型 — 在庫 7' },
    ] as { id: string; name: string }[],
  },

  'amazon-associates': {
    items: [
      { id: 'aa-8001', name: '[確定] Kindle 書籍 紹介料 — ¥420' },
      { id: 'aa-8002', name: '[確定] 家電 紹介料 — ¥1,860' },
      { id: 'aa-8003', name: '[保留] 日用品 紹介料 — ¥230' },
    ] as { id: string; name: string }[],
  },

  sales: {
    items: [] as { id: string; name: string }[],
  },

  team: {
    items: [] as { id: string; name: string }[],
  },

  youtube: {
    channel: { id: 'UC_demo', title: 'デモチャンネル', subscribers: 12_500, views: 982_000, videos: 142 },
    recentVideos: [
      { videoId: 'demo1', title: '【2026年版】ネットショップの始め方', publishedAt: '2026-05-20T09:00:00Z', url: 'https://www.youtube.com/watch?v=demo1' },
      { videoId: 'demo2', title: '売上が伸びる商品写真の撮り方', publishedAt: '2026-05-12T09:00:00Z', url: 'https://www.youtube.com/watch?v=demo2' },
      { videoId: 'demo3', title: 'EC 運営の月次ルーティン公開', publishedAt: '2026-05-03T09:00:00Z', url: 'https://www.youtube.com/watch?v=demo3' },
    ] as { videoId: string; title: string; publishedAt: string; url: string }[],
  },

  overview: {
    items: [] as { id: string; name: string }[],
  },

  coconala: {
    items: [] as { id: string; name: string }[],
  },

  tiktok: {
    items: [
      { id: 'tt-1', name: '[投稿] 新商品紹介リール — 12.4万 再生 / いいね 8,200' },
      { id: 'tt-2', name: '[投稿] 使い方ハウツー — 3.1万 再生 / 保存 1,450' },
      { id: 'tt-3', name: '[広告] 認知キャンペーン — CPM ¥420 / CTR 1.8%' },
      { id: 'tt-4', name: 'フォロワー 2.7万人（前月比 +6.3%）' },
      { id: 'tt-5', name: '[TikTok Lite] 報酬プログラム経由の流入 1,820 セッション（軽量版アプリ）' },
    ] as { id: string; name: string }[],
  },

  tax: {
    items: [] as { id: string; name: string }[],
  },

  // SCAFFOLD:ADD_SNAPSHOT_SLICE_BELOW (scaffold inserts new service slices before `canva:` ↓)

  funding: {
    items: [] as {
      id: string;
      kind: 'subsidy' | 'grant' | 'loan' | 'jfc' | 'benefit' | 'crowdfunding';
      name: string;
      amount: number;
      status: 'received' | 'approved' | 'applied' | 'planned';
      month: string;
      repayable: boolean;
      compressedEntry?: boolean;
      repayment?: { annualRate: number; months: number; startMonth: string; gracePeriodMonths?: number; method?: 'equal-payment' | 'equal-principal' };
      probability?: number;
    }[],
    byKind: [] as {
      kind: 'subsidy' | 'grant' | 'loan' | 'jfc' | 'benefit' | 'crowdfunding';
      label: string;
      secured: number;
      pipeline: number;
      count: number;
    }[],
    radar: [] as number[],
    monthly: [] as {
      month: string;
      funding: number;
      fundingAfterTax: number;
      repayment: number;
      interest: number;
      interestTaxShield: number;
      netCashflow: number;
      operatingCashflow: number;
      portfolioValue: number;
    }[],
    bars: [] as { label: string; secured: number; pipeline: number }[],
    summary: {
      nonRepayableSecured: 0,
      repayableSecured: 0,
      totalSecured: 0,
      totalPipeline: 0,
      taxableSecured: 0,
      deferredSecured: 0,
      afterTaxSecured: 0,
      consumptionTaxExemptSecured: 0,
      consumptionTaxableSecured: 0,
      consumptionTaxEstimate: 0,
      count: 0,
    },
    runway: {
      rows: [] as { month: string; netCashflow: number; balance: number }[],
      openingBalance: 0,
      minBalance: 0,
      shortfallMonth: null as string | null,
    },
    scenario: {
      securedTotal: 0,
      pipelineTotal: 0,
      expectedPipeline: 0,
      expectedTotal: 0,
    },
    scenarioRunways: (() => {
      const emptyRunway = {
        rows: [] as { month: string; netCashflow: number; balance: number }[],
        openingBalance: 0,
        minBalance: 0,
        shortfallMonth: null as string | null,
      };
      return { optimistic: emptyRunway, expected: emptyRunway, pessimistic: emptyRunway };
    })(),
    qualityScore: { nonRepayableRatio: 0, afterTaxRatio: 0, compositeScore: 0 },
    accountingLinked: false,
    stocksLinked: false,
    fetchedAt: '',
    isMock: true,
  },

  freee: {
    companyName: '',
    monthly: [] as { month: string; income: number; expense: number; net: number }[],
    fetchedAt: '',
  },

  kpi: {
    units: [] as {
      id: string;
      label: string;
      fundamentals: {
        revenue: number;
        cogs: number;
        advertising: number;
        sga: number;
        depreciation: number;
      };
      kpi: {
        variableCost: number;
        fixedCost: number;
        contribution: number;
        contributionRatio: number;
        variableRatio: number;
        fixedRatio: number;
        bep: number;
        bepRatio: number;
        safetyMargin: number;
        operatingProfit: number;
        operatingLeverage: number;
      };
      history: {
        revenue: number;
        cogs: number;
        advertising: number;
        sga: number;
        depreciation: number;
      }[];
    }[],
    aggregate: {
      id: 'all',
      label: '全社合算',
      fundamentals: { revenue: 0, cogs: 0, advertising: 0, sga: 0, depreciation: 0 },
      kpi: {
        variableCost: 0,
        fixedCost: 0,
        contribution: 0,
        contributionRatio: 0,
        variableRatio: 0,
        fixedRatio: 0,
        bep: 0,
        bepRatio: 0,
        safetyMargin: 0,
        operatingProfit: 0,
        operatingLeverage: 0,
      },
      history: [] as {
        revenue: number;
        cogs: number;
        advertising: number;
        sga: number;
        depreciation: number;
      }[],
    },
    fetchedAt: '',
    isMock: true,
  },

  stocks: {
    watchlist: [] as {
      symbol: string;
      label: string;
      latestClose: number;
      previousClose: number;
      changePct: number;
      signal: {
        date: string;
        action: 'buy' | 'sell' | 'hold';
        confidence: number;
        reason: string;
        strategy: string;
      };
      candles: {
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }[];
    }[],
    portfolio: {
      cash: 1_000_000,
      initialCash: 1_000_000,
      positions: {} as Record<string, { shares: number; avgCost: number }>,
      history: [] as {
        date: string;
        ticker: string;
        action: 'buy' | 'sell';
        shares: number;
        price: number;
        cashAfter: number;
        reason: string;
      }[],
    },
    fetchedAt: '',
    isMock: true,
  },

  business: {
      units: [
        {
          id: "ec",
          label: "EC / ネットショップ",
          description: "Shopify / BASE / STORES などでの自社 EC 運営",
          trafficKind: "session",
          current: {
            revenue: 2449859,
            variableCost: 1347422,
            fixedCost: 600000,
            totalCost: 1947422,
            profit: 502437,
            profitMargin: 20.508812956174214,
            traffic: 16901,
            conversion: 372,
            conversionRatePct: 2.2010531921188092,
            aov: 6586,
            roas: 4.341207578592003,
            contentOutput: 8,
          },
          history: [
            {
              revenue: 2449292,
              variableCost: 1347111,
              fixedCost: 600000,
              totalCost: 1947111,
              profit: 502181,
              profitMargin: 20.50310865343944,
              traffic: 16893,
              conversion: 372,
              conversionRatePct: 2.2020955425324096,
              aov: 6584,
              roas: 4.3400902004214,
              contentOutput: 8,
            },
            {
              revenue: 2449178,
              variableCost: 1347048,
              fixedCost: 600000,
              totalCost: 1947048,
              profit: 502130,
              profitMargin: 20.50198066453316,
              traffic: 16895,
              conversion: 372,
              conversionRatePct: 2.2018348623853212,
              aov: 6584,
              roas: 4.340462721744553,
              contentOutput: 8,
            },
            {
              revenue: 2449519,
              variableCost: 1347235,
              fixedCost: 600000,
              totalCost: 1947235,
              profit: 502284,
              profitMargin: 20.50541351179558,
              traffic: 16894,
              conversion: 372,
              conversionRatePct: 2.201965194743696,
              aov: 6585,
              roas: 4.34033856948372,
              contentOutput: 8,
            },
            {
              revenue: 2449405,
              variableCost: 1347173,
              fixedCost: 600000,
              totalCost: 1947173,
              profit: 502232,
              profitMargin: 20.504244908457363,
              traffic: 16897,
              conversion: 372,
              conversionRatePct: 2.20157424394863,
              aov: 6584,
              roas: 4.339685575012118,
              contentOutput: 8,
            },
            {
              revenue: 2449746,
              variableCost: 1347360,
              fixedCost: 600000,
              totalCost: 1947360,
              profit: 502386,
              profitMargin: 20.50767712244453,
              traffic: 16896,
              conversion: 372,
              conversionRatePct: 2.2017045454545454,
              aov: 6585,
              roas: 4.339561422751285,
              contentOutput: 8,
            },
            {
              revenue: 2449632,
              variableCost: 1347298,
              fixedCost: 600000,
              totalCost: 1947298,
              profit: 502334,
              profitMargin: 20.506508732740265,
              traffic: 16899,
              conversion: 372,
              conversionRatePct: 2.2013136872004258,
              aov: 6585,
              roas: 4.3399339440744376,
              contentOutput: 8,
            },
            {
              revenue: 2449973,
              variableCost: 1347485,
              fixedCost: 600000,
              totalCost: 1947485,
              profit: 502488,
              profitMargin: 20.509940313627947,
              traffic: 16898,
              conversion: 372,
              conversionRatePct: 2.201443957864836,
              aov: 6586,
              roas: 4.339809791813605,
              contentOutput: 8,
            },
            {
              revenue: 2449859,
              variableCost: 1347422,
              fixedCost: 600000,
              totalCost: 1947422,
              profit: 502437,
              profitMargin: 20.508812956174214,
              traffic: 16901,
              conversion: 372,
              conversionRatePct: 2.2010531921188092,
              aov: 6586,
              roas: 4.341207578592003,
              contentOutput: 8,
            },
          ],
        },
        {
          id: "dropship",
          label: "ドロップシッピング",
          description: "在庫を持たず仕入元から直送する小売",
          trafficKind: "session",
          current: {
            revenue: 1284984,
            variableCost: 925188,
            fixedCost: 240000,
            totalCost: 1165188,
            profit: 119796,
            profitMargin: 9.3227619954801,
            traffic: 9422,
            conversion: 141,
            conversionRatePct: 1.4964975589046912,
            aov: 9113,
            roas: 3.2939999954309314,
            contentOutput: 12,
          },
          history: [
            {
              revenue: 1277932,
              variableCost: 920111,
              fixedCost: 240000,
              totalCost: 1160111,
              profit: 117821,
              profitMargin: 9.21966114002936,
              traffic: 9419,
              conversion: 141,
              conversionRatePct: 1.4969742010829175,
              aov: 9063,
              roas: 3.299277577386238,
              contentOutput: 12,
            },
            {
              revenue: 1277876,
              variableCost: 920071,
              fixedCost: 240000,
              totalCost: 1160071,
              profit: 117805,
              profitMargin: 9.218813092976157,
              traffic: 9421,
              conversion: 141,
              conversionRatePct: 1.496656405901709,
              aov: 9063,
              roas: 3.29418322162237,
              contentOutput: 12,
            },
            {
              revenue: 1284682,
              variableCost: 924971,
              fixedCost: 240000,
              totalCost: 1164971,
              profit: 119711,
              profitMargin: 9.318337144912125,
              traffic: 9422,
              conversion: 141,
              conversionRatePct: 1.4964975589046912,
              aov: 9111,
              roas: 3.294280771317426,
              contentOutput: 12,
            },
            {
              revenue: 1284742,
              variableCost: 925014,
              fixedCost: 240000,
              totalCost: 1165014,
              profit: 119728,
              profitMargin: 9.319225182955021,
              traffic: 9420,
              conversion: 141,
              conversionRatePct: 1.496815286624204,
              aov: 9112,
              roas: 3.2943665402010085,
              contentOutput: 12,
            },
            {
              revenue: 1284561,
              variableCost: 924884,
              fixedCost: 240000,
              totalCost: 1164884,
              profit: 119677,
              profitMargin: 9.316568072672299,
              traffic: 9421,
              conversion: 141,
              conversionRatePct: 1.496656405901709,
              aov: 9110,
              roas: 3.2944640898960644,
              contentOutput: 12,
            },
            {
              revenue: 1284622,
              variableCost: 924928,
              fixedCost: 240000,
              totalCost: 1164928,
              profit: 119694,
              profitMargin: 9.317449023915206,
              traffic: 9423,
              conversion: 141,
              conversionRatePct: 1.4963387456224133,
              aov: 9111,
              roas: 3.2938166768522934,
              contentOutput: 12,
            },
            {
              revenue: 1284924,
              variableCost: 925145,
              fixedCost: 240000,
              totalCost: 1165145,
              profit: 119779,
              profitMargin: 9.321874289841267,
              traffic: 9424,
              conversion: 141,
              conversionRatePct: 1.4961799660441426,
              aov: 9113,
              roas: 3.2939142265473493,
              contentOutput: 12,
            },
            {
              revenue: 1284984,
              variableCost: 925188,
              fixedCost: 240000,
              totalCost: 1165188,
              profit: 119796,
              profitMargin: 9.3227619954801,
              traffic: 9422,
              conversion: 141,
              conversionRatePct: 1.4964975589046912,
              aov: 9113,
              roas: 3.2939999954309314,
              contentOutput: 12,
            },
          ],
        },
        {
          id: "oem-odm",
          label: "OEM / ODM",
          description: "製造委託で自社ブランド製品を作る BtoB / DtoC",
          trafficKind: "project",
          current: {
            revenue: 6829538,
            variableCost: 3278178,
            fixedCost: 1400000,
            totalCost: 4678178,
            profit: 2151360,
            profitMargin: 31.500813085746067,
            traffic: 15,
            conversion: 5,
            conversionRatePct: 33.33333333333333,
            aov: 1365908,
            roas: 0,
            contentOutput: 3,
          },
          history: [
            {
              revenue: 6828098,
              variableCost: 3277487,
              fixedCost: 1400000,
              totalCost: 4677487,
              profit: 2150611,
              profitMargin: 31.49648701585712,
              traffic: 15,
              conversion: 5,
              conversionRatePct: 33.33333333333333,
              aov: 1365620,
              roas: 0,
              contentOutput: 3,
            },
            {
              revenue: 6828290,
              variableCost: 3277579,
              fixedCost: 1400000,
              totalCost: 4677579,
              profit: 2150711,
              profitMargin: 31.497065883259207,
              traffic: 15,
              conversion: 5,
              conversionRatePct: 33.33333333333333,
              aov: 1365658,
              roas: 0,
              contentOutput: 3,
            },
            {
              revenue: 6828481,
              variableCost: 3277671,
              fixedCost: 1400000,
              totalCost: 4677671,
              profit: 2150810,
              profitMargin: 31.49763468625013,
              traffic: 15,
              conversion: 5,
              conversionRatePct: 33.33333333333333,
              aov: 1365696,
              roas: 0,
              contentOutput: 3,
            },
            {
              revenue: 6828772,
              variableCost: 3277811,
              fixedCost: 1400000,
              totalCost: 4677811,
              profit: 2150961,
              profitMargin: 31.49850368411773,
              traffic: 15,
              conversion: 5,
              conversionRatePct: 33.33333333333333,
              aov: 1365754,
              roas: 0,
              contentOutput: 3,
            },
            {
              revenue: 6828963,
              variableCost: 3277902,
              fixedCost: 1400000,
              totalCost: 4677902,
              profit: 2151061,
              profitMargin: 31.499087050259316,
              traffic: 15,
              conversion: 5,
              conversionRatePct: 33.33333333333333,
              aov: 1365793,
              roas: 0,
              contentOutput: 3,
            },
            {
              revenue: 6829155,
              variableCost: 3277994,
              fixedCost: 1400000,
              totalCost: 4677994,
              profit: 2151161,
              profitMargin: 31.499665771241098,
              traffic: 15,
              conversion: 5,
              conversionRatePct: 33.33333333333333,
              aov: 1365831,
              roas: 0,
              contentOutput: 3,
            },
            {
              revenue: 6829346,
              variableCost: 3278086,
              fixedCost: 1400000,
              totalCost: 4678086,
              profit: 2151260,
              profitMargin: 31.500234429475384,
              traffic: 15,
              conversion: 5,
              conversionRatePct: 33.33333333333333,
              aov: 1365869,
              roas: 0,
              contentOutput: 3,
            },
            {
              revenue: 6829538,
              variableCost: 3278178,
              fixedCost: 1400000,
              totalCost: 4678178,
              profit: 2151360,
              profitMargin: 31.500813085746067,
              traffic: 15,
              conversion: 5,
              conversionRatePct: 33.33333333333333,
              aov: 1365908,
              roas: 0,
              contentOutput: 3,
            },
          ],
        },
        {
          id: "blog",
          label: "自社ブログ",
          description: "広告 / 自社商品導線としての所有メディア",
          trafficKind: "session",
          current: {
            revenue: 574739,
            variableCost: 68969,
            fixedCost: 60000,
            totalCost: 128969,
            profit: 445770,
            profitMargin: 77.5604230789976,
            traffic: 153026,
            conversion: 459,
            conversionRatePct: 0.2999490282697058,
            aov: 1252,
            roas: 0,
            contentOutput: 18,
          },
          history: [
            {
              revenue: 574891,
              variableCost: 68987,
              fixedCost: 60000,
              totalCost: 128987,
              profit: 445904,
              profitMargin: 77.56322502874457,
              traffic: 153275,
              conversion: 460,
              conversionRatePct: 0.3001141738704942,
              aov: 1250,
              roas: 0,
              contentOutput: 18,
            },
            {
              revenue: 574909,
              variableCost: 68989,
              fixedCost: 60000,
              totalCost: 128989,
              profit: 445920,
              profitMargin: 77.5635796273845,
              traffic: 153006,
              conversion: 459,
              conversionRatePct: 0.2999882357554606,
              aov: 1253,
              roas: 0,
              contentOutput: 18,
            },
            {
              revenue: 574789,
              variableCost: 68975,
              fixedCost: 60000,
              totalCost: 128975,
              profit: 445814,
              profitMargin: 77.56133120153656,
              traffic: 152995,
              conversion: 459,
              conversionRatePct: 0.30000980424196866,
              aov: 1252,
              roas: 0,
              contentOutput: 18,
            },
            {
              revenue: 574807,
              variableCost: 68977,
              fixedCost: 60000,
              totalCost: 128977,
              profit: 445830,
              profitMargin: 77.56168592240526,
              traffic: 152984,
              conversion: 459,
              conversionRatePct: 0.30003137583015216,
              aov: 1252,
              roas: 0,
              contentOutput: 18,
            },
            {
              revenue: 574823,
              variableCost: 68979,
              fixedCost: 60000,
              totalCost: 128979,
              profit: 445844,
              profitMargin: 77.56196255195077,
              traffic: 152973,
              conversion: 459,
              conversionRatePct: 0.30005295052068015,
              aov: 1252,
              roas: 0,
              contentOutput: 18,
            },
            {
              revenue: 574841,
              variableCost: 68981,
              fixedCost: 60000,
              totalCost: 128981,
              profit: 445860,
              profitMargin: 77.56231723206939,
              traffic: 153048,
              conversion: 459,
              conversionRatePct: 0.29990591187078564,
              aov: 1252,
              roas: 0,
              contentOutput: 18,
            },
            {
              revenue: 574721,
              variableCost: 68967,
              fixedCost: 60000,
              totalCost: 128967,
              profit: 445754,
              profitMargin: 77.56006827660727,
              traffic: 153037,
              conversion: 459,
              conversionRatePct: 0.2999274685206845,
              aov: 1252,
              roas: 0,
              contentOutput: 18,
            },
            {
              revenue: 574739,
              variableCost: 68969,
              fixedCost: 60000,
              totalCost: 128969,
              profit: 445770,
              profitMargin: 77.5604230789976,
              traffic: 153026,
              conversion: 459,
              conversionRatePct: 0.2999490282697058,
              aov: 1252,
              roas: 0,
              contentOutput: 18,
            },
          ],
        },
        {
          id: "blog-affiliate",
          label: "ブログアフィリエイト",
          description: "SEO 流入 + 成果報酬広告で収益化するメディア",
          trafficKind: "session",
          current: {
            revenue: 1316876,
            variableCost: 105350,
            fixedCost: 80000,
            totalCost: 185350,
            profit: 1131526,
            profitMargin: 85.92502255337632,
            traffic: 230018,
            conversion: 1840,
            conversionRatePct: 0.7999373962037754,
            aov: 716,
            roas: 0,
            contentOutput: 24,
          },
          history: [
            {
              revenue: 1316913,
              variableCost: 105353,
              fixedCost: 80000,
              totalCost: 185353,
              profit: 1131560,
              profitMargin: 85.92519019859323,
              traffic: 264408,
              conversion: 2115,
              conversionRatePct: 0.7999001543069801,
              aov: 623,
              roas: 0,
              contentOutput: 24,
            },
            {
              revenue: 1316954,
              variableCost: 105356,
              fixedCost: 80000,
              totalCost: 185356,
              profit: 1131598,
              profitMargin: 85.9254005834676,
              traffic: 264389,
              conversion: 2115,
              conversionRatePct: 0.79995763817708,
              aov: 623,
              roas: 0,
              contentOutput: 24,
            },
            {
              revenue: 1316991,
              variableCost: 105359,
              fixedCost: 80000,
              totalCost: 185359,
              profit: 1131632,
              profitMargin: 85.92556820813506,
              traffic: 264370,
              conversion: 2115,
              conversionRatePct: 0.8000151303097931,
              aov: 623,
              roas: 0,
              contentOutput: 24,
            },
            {
              revenue: 1317032,
              variableCost: 105363,
              fixedCost: 80000,
              totalCost: 185363,
              profit: 1131669,
              profitMargin: 85.92570264048254,
              traffic: 264499,
              conversion: 2116,
              conversionRatePct: 0.8000030245861043,
              aov: 622,
              roas: 0,
              contentOutput: 24,
            },
            {
              revenue: 1316757,
              variableCost: 105341,
              fixedCost: 80000,
              totalCost: 185341,
              profit: 1131416,
              profitMargin: 85.92443404515791,
              traffic: 264480,
              conversion: 2116,
              conversionRatePct: 0.8000604960677556,
              aov: 622,
              roas: 0,
              contentOutput: 24,
            },
            {
              revenue: 1316798,
              variableCost: 105344,
              fixedCost: 80000,
              totalCost: 185344,
              profit: 1131454,
              profitMargin: 85.92464447850013,
              traffic: 264461,
              conversion: 2116,
              conversionRatePct: 0.8001179758073969,
              aov: 622,
              roas: 0,
              contentOutput: 24,
            },
            {
              revenue: 1316835,
              variableCost: 105347,
              fixedCost: 80000,
              totalCost: 185347,
              profit: 1131488,
              profitMargin: 85.92481214427016,
              traffic: 264442,
              conversion: 2116,
              conversionRatePct: 0.8001754638068083,
              aov: 622,
              roas: 0,
              contentOutput: 24,
            },
            {
              revenue: 1316876,
              variableCost: 105350,
              fixedCost: 80000,
              totalCost: 185350,
              profit: 1131526,
              profitMargin: 85.92502255337632,
              traffic: 230018,
              conversion: 1840,
              conversionRatePct: 0.7999373962037754,
              aov: 716,
              roas: 0,
              contentOutput: 24,
            },
          ],
        },
        {
          id: "ppc-affiliate",
          label: "PPC アフィリエイト",
          description: "有料広告で送客し成果報酬を取る短期回収型",
          trafficKind: "impression",
          current: {
            revenue: 3431056,
            variableCost: 2401739,
            fixedCost: 150000,
            totalCost: 2551739,
            profit: 879317,
            profitMargin: 25.628173949944273,
            traffic: 3187116,
            conversion: 38245,
            conversionRatePct: 1.1999877004790538,
            aov: 90,
            roas: 1.389349181758007,
            contentOutput: 60,
          },
          history: [
            {
              revenue: 3430309,
              variableCost: 2401216,
              fixedCost: 150000,
              totalCost: 2551216,
              profit: 879093,
              profitMargin: 25.62722483601332,
              traffic: 3186866,
              conversion: 38242,
              conversionRatePct: 1.1999876995141936,
              aov: 90,
              roas: 1.3895580577896907,
              contentOutput: 60,
            },
            {
              revenue: 3430434,
              variableCost: 2401304,
              fixedCost: 150000,
              totalCost: 2551304,
              profit: 879130,
              profitMargin: 25.627369598132482,
              traffic: 3186667,
              conversion: 38240,
              conversionRatePct: 1.1999998744770006,
              aov: 90,
              roas: 1.3896009310206863,
              contentOutput: 60,
            },
            {
              revenue: 3430534,
              variableCost: 2401374,
              fixedCost: 150000,
              totalCost: 2551374,
              profit: 879160,
              profitMargin: 25.627497060224442,
              traffic: 3186468,
              conversion: 38238,
              conversionRatePct: 1.2000120509604992,
              aov: 90,
              roas: 1.3894667806918732,
              contentOutput: 60,
            },
            {
              revenue: 3430633,
              variableCost: 2401443,
              fixedCost: 150000,
              totalCost: 2551443,
              profit: 879190,
              profitMargin: 25.627631985117617,
              traffic: 3186270,
              conversion: 38235,
              conversionRatePct: 1.1999924676816467,
              aov: 90,
              roas: 1.3895096539228688,
              contentOutput: 60,
            },
            {
              revenue: 3430732,
              variableCost: 2401512,
              fixedCost: 150000,
              totalCost: 2551512,
              profit: 879220,
              profitMargin: 25.62776690222378,
              traffic: 3187712,
              conversion: 38253,
              conversionRatePct: 1.2000143049309349,
              aov: 90,
              roas: 1.3893975856248288,
              contentOutput: 60,
            },
            {
              revenue: 3430857,
              variableCost: 2401600,
              fixedCost: 150000,
              totalCost: 2551600,
              profit: 879257,
              profitMargin: 25.627911626745153,
              traffic: 3187513,
              conversion: 38250,
              conversionRatePct: 1.1999951059023133,
              aov: 90,
              roas: 1.3894404588558245,
              contentOutput: 60,
            },
            {
              revenue: 3430957,
              variableCost: 2401670,
              fixedCost: 150000,
              totalCost: 2551670,
              profit: 879287,
              profitMargin: 25.628039057324237,
              traffic: 3187314,
              conversion: 38248,
              conversionRatePct: 1.2000072788561154,
              aov: 90,
              roas: 1.3893063085270114,
              contentOutput: 60,
            },
            {
              revenue: 3431056,
              variableCost: 2401739,
              fixedCost: 150000,
              totalCost: 2551739,
              profit: 879317,
              profitMargin: 25.628173949944273,
              traffic: 3187116,
              conversion: 38245,
              conversionRatePct: 1.1999877004790538,
              aov: 90,
              roas: 1.389349181758007,
              contentOutput: 60,
            },
          ],
        },
        {
          id: "video-production",
          label: "動画制作 (受託)",
          description: "企業案件の動画制作を受託する BtoB",
          trafficKind: "project",
          current: {
            revenue: 1538527,
            variableCost: 584640,
            fixedCost: 540000,
            totalCost: 1124640,
            profit: 413887,
            profitMargin: 26.901510340735,
            traffic: 5,
            conversion: 2,
            conversionRatePct: 40,
            aov: 769264,
            roas: 0,
            contentOutput: 6,
          },
          history: [
            {
              revenue: 1537698,
              variableCost: 584325,
              fixedCost: 540000,
              totalCost: 1124325,
              profit: 413373,
              profitMargin: 26.88258682784266,
              traffic: 5,
              conversion: 2,
              conversionRatePct: 40,
              aov: 768849,
              roas: 0,
              contentOutput: 6,
            },
            {
              revenue: 1537773,
              variableCost: 584354,
              fixedCost: 540000,
              totalCost: 1124354,
              profit: 413419,
              profitMargin: 26.88426705371989,
              traffic: 5,
              conversion: 2,
              conversionRatePct: 40,
              aov: 768887,
              roas: 0,
              contentOutput: 6,
            },
            {
              revenue: 1538770,
              variableCost: 584733,
              fixedCost: 540000,
              totalCost: 1124733,
              profit: 414037,
              profitMargin: 26.907010144466035,
              traffic: 5,
              conversion: 2,
              conversionRatePct: 40,
              aov: 769385,
              roas: 0,
              contentOutput: 6,
            },
            {
              revenue: 1538844,
              variableCost: 584761,
              fixedCost: 540000,
              totalCost: 1124761,
              profit: 414083,
              profitMargin: 26.908705495813738,
              traffic: 5,
              conversion: 2,
              conversionRatePct: 40,
              aov: 769422,
              roas: 0,
              contentOutput: 6,
            },
            {
              revenue: 1538611,
              variableCost: 584672,
              fixedCost: 540000,
              totalCost: 1124672,
              profit: 413939,
              profitMargin: 26.90342133261754,
              traffic: 5,
              conversion: 2,
              conversionRatePct: 40,
              aov: 769306,
              roas: 0,
              contentOutput: 6,
            },
            {
              revenue: 1538686,
              variableCost: 584701,
              fixedCost: 540000,
              totalCost: 1124701,
              profit: 413985,
              profitMargin: 26.905099545976242,
              traffic: 5,
              conversion: 2,
              conversionRatePct: 40,
              aov: 769343,
              roas: 0,
              contentOutput: 6,
            },
            {
              revenue: 1538453,
              variableCost: 584612,
              fixedCost: 540000,
              totalCost: 1124612,
              profit: 413841,
              profitMargin: 26.89981429396933,
              traffic: 5,
              conversion: 2,
              conversionRatePct: 40,
              aov: 769227,
              roas: 0,
              contentOutput: 6,
            },
            {
              revenue: 1538527,
              variableCost: 584640,
              fixedCost: 540000,
              totalCost: 1124640,
              profit: 413887,
              profitMargin: 26.901510340735,
              traffic: 5,
              conversion: 2,
              conversionRatePct: 40,
              aov: 769264,
              roas: 0,
              contentOutput: 6,
            },
          ],
        },
        {
          id: "video-upload",
          label: "動画投稿 (自社チャンネル)",
          description: "YouTube / TikTok 等の自社チャンネル運営 (広告収益 + 案件)",
          trafficKind: "view",
          current: {
            revenue: 674160,
            variableCost: 121349,
            fixedCost: 180000,
            totalCost: 301349,
            profit: 372811,
            profitMargin: 55.30007713302481,
            traffic: 1031293,
            conversion: 1238,
            conversionRatePct: 0.12004347939916203,
            aov: 545,
            roas: 0,
            contentOutput: 12,
          },
          history: [
            {
              revenue: 673797,
              variableCost: 121283,
              fixedCost: 180000,
              totalCost: 301283,
              profit: 372514,
              profitMargin: 55.28579082423934,
              traffic: 1031833,
              conversion: 1238,
              conversionRatePct: 0.11998065578441473,
              aov: 544,
              roas: 0,
              contentOutput: 12,
            },
            {
              revenue: 673830,
              variableCost: 121289,
              fixedCost: 180000,
              totalCost: 301289,
              profit: 372541,
              profitMargin: 55.28709021563303,
              traffic: 1031634,
              conversion: 1238,
              conversionRatePct: 0.12000379979721491,
              aov: 544,
              roas: 0,
              contentOutput: 12,
            },
            {
              revenue: 673728,
              variableCost: 121271,
              fixedCost: 180000,
              totalCost: 301271,
              profit: 372457,
              profitMargin: 55.28299254298471,
              traffic: 1031690,
              conversion: 1238,
              conversionRatePct: 0.11999728600645541,
              aov: 544,
              roas: 0,
              contentOutput: 12,
            },
            {
              revenue: 673760,
              variableCost: 121277,
              fixedCost: 180000,
              totalCost: 301277,
              profit: 372483,
              profitMargin: 55.284225837093324,
              traffic: 1031520,
              conversion: 1238,
              conversionRatePct: 0.12001706219947263,
              aov: 544,
              roas: 0,
              contentOutput: 12,
            },
            {
              revenue: 673658,
              variableCost: 121258,
              fixedCost: 180000,
              totalCost: 301258,
              profit: 372400,
              profitMargin: 55.28027574822833,
              traffic: 1031577,
              conversion: 1238,
              conversionRatePct: 0.12001043063193538,
              aov: 544,
              roas: 0,
              contentOutput: 12,
            },
            {
              revenue: 673691,
              variableCost: 121264,
              fixedCost: 180000,
              totalCost: 301264,
              profit: 372427,
              profitMargin: 55.28157567787012,
              traffic: 1031407,
              conversion: 1238,
              conversionRatePct: 0.1200302111581558,
              aov: 544,
              roas: 0,
              contentOutput: 12,
            },
            {
              revenue: 674128,
              variableCost: 121343,
              fixedCost: 180000,
              totalCost: 301343,
              profit: 372785,
              profitMargin: 55.298845323143375,
              traffic: 1031463,
              conversion: 1238,
              conversionRatePct: 0.12002369449994814,
              aov: 545,
              roas: 0,
              contentOutput: 12,
            },
            {
              revenue: 674160,
              variableCost: 121349,
              fixedCost: 180000,
              totalCost: 301349,
              profit: 372811,
              profitMargin: 55.30007713302481,
              traffic: 1031293,
              conversion: 1238,
              conversionRatePct: 0.12004347939916203,
              aov: 545,
              roas: 0,
              contentOutput: 12,
            },
          ],
        },
        {
          id: "video-distribution",
          label: "動画配信 (有料広告)",
          description: "YouTube / TikTok Ads / IG Reels に有料配信する獲得チャネル",
          trafficKind: "impression",
          current: {
            revenue: 1281974,
            variableCost: 846103,
            fixedCost: 120000,
            totalCost: 966103,
            profit: 315871,
            profitMargin: 24.639423264434377,
            traffic: 7243125,
            conversion: 6519,
            conversionRatePct: 0.09000258866166193,
            aov: 197,
            roas: 1.9197719128336759,
            contentOutput: 22,
          },
          history: [
            {
              revenue: 1282308,
              variableCost: 846323,
              fixedCost: 120000,
              totalCost: 966323,
              profit: 315985,
              profitMargin: 24.64189570680367,
              traffic: 7220243,
              conversion: 6498,
              conversionRatePct: 0.08999697101607246,
              aov: 197,
              roas: 1.9103590458980761,
              contentOutput: 22,
            },
            {
              revenue: 1282370,
              variableCost: 846364,
              fixedCost: 120000,
              totalCost: 966364,
              profit: 316006,
              profitMargin: 24.642341913800227,
              traffic: 7219051,
              conversion: 6497,
              conversionRatePct: 0.08999797895873017,
              aov: 197,
              roas: 1.9104102309851443,
              contentOutput: 22,
            },
            {
              revenue: 1282176,
              variableCost: 846236,
              fixedCost: 120000,
              totalCost: 966236,
              profit: 315940,
              profitMargin: 24.64092293101727,
              traffic: 7219449,
              conversion: 6498,
              conversionRatePct: 0.09000686894526162,
              aov: 197,
              roas: 1.9104684456950054,
              contentOutput: 22,
            },
            {
              revenue: 1282238,
              variableCost: 846277,
              fixedCost: 120000,
              totalCost: 966277,
              profit: 315961,
              profitMargin: 24.641369230985198,
              traffic: 7244715,
              conversion: 6520,
              conversionRatePct: 0.08999663892920563,
              aov: 197,
              roas: 1.9100820850057063,
              contentOutput: 22,
            },
            {
              revenue: 1282044,
              variableCost: 846149,
              fixedCost: 120000,
              totalCost: 966149,
              profit: 315895,
              profitMargin: 24.639949954915743,
              traffic: 7244292,
              conversion: 6520,
              conversionRatePct: 0.09000189390488401,
              aov: 197,
              roas: 1.9101402997155674,
              contentOutput: 22,
            },
            {
              revenue: 1282106,
              variableCost: 846190,
              fixedCost: 120000,
              totalCost: 966190,
              profit: 315916,
              profitMargin: 24.640396347883872,
              traffic: 7243920,
              conversion: 6520,
              conversionRatePct: 0.09000651580911992,
              aov: 197,
              roas: 1.9101914848026356,
              contentOutput: 22,
            },
            {
              revenue: 1281912,
              variableCost: 846062,
              fixedCost: 120000,
              totalCost: 966062,
              profit: 315850,
              profitMargin: 24.63897677843721,
              traffic: 7243497,
              conversion: 6519,
              conversionRatePct: 0.0899979664518395,
              aov: 197,
              roas: 1.9102496995124967,
              contentOutput: 22,
            },
            {
              revenue: 1281974,
              variableCost: 846103,
              fixedCost: 120000,
              totalCost: 966103,
              profit: 315871,
              profitMargin: 24.639423264434377,
              traffic: 7243125,
              conversion: 6519,
              conversionRatePct: 0.09000258866166193,
              aov: 197,
              roas: 1.9197719128336759,
              contentOutput: 22,
            },
          ],
        },
        {
          id: "sns-ops",
          label: "SNS 運用",
          description: "X / Instagram / TikTok のオーガニック+広告運用",
          trafficKind: "impression",
          current: {
            revenue: 641338,
            variableCost: 269362,
            fixedCost: 220000,
            totalCost: 489362,
            profit: 151976,
            profitMargin: 23.696709067605536,
            traffic: 1563670,
            conversion: 4378,
            conversionRatePct: 0.27998234921690635,
            aov: 146,
            roas: 2.124502553232014,
            contentOutput: 90,
          },
          history: [
            {
              revenue: 641135,
              variableCost: 269277,
              fixedCost: 220000,
              totalCost: 489277,
              profit: 151858,
              profitMargin: 23.68580720129146,
              traffic: 1564849,
              conversion: 4382,
              conversionRatePct: 0.28002701858134554,
              aov: 146,
              roas: 2.12386407321319,
              contentOutput: 90,
            },
            {
              revenue: 641162,
              variableCost: 269288,
              fixedCost: 220000,
              totalCost: 489288,
              profit: 151874,
              profitMargin: 23.687305236430106,
              traffic: 1564980,
              conversion: 4382,
              conversionRatePct: 0.2800035783204897,
              aov: 146,
              roas: 2.123793110623956,
              contentOutput: 90,
            },
            {
              revenue: 641189,
              variableCost: 269299,
              fixedCost: 220000,
              totalCost: 489299,
              profit: 151890,
              profitMargin: 23.688803145406425,
              traffic: 1564063,
              conversion: 4379,
              conversionRatePct: 0.2799759344732277,
              aov: 146,
              roas: 2.1242896654643117,
              contentOutput: 90,
            },
            {
              revenue: 641446,
              variableCost: 269407,
              fixedCost: 220000,
              totalCost: 489407,
              profit: 152039,
              profitMargin: 23.702540821830674,
              traffic: 1564194,
              conversion: 4380,
              conversionRatePct: 0.2800164174009106,
              aov: 146,
              roas: 2.1242187028750776,
              contentOutput: 90,
            },
            {
              revenue: 641473,
              variableCost: 269419,
              fixedCost: 220000,
              totalCost: 489419,
              profit: 152054,
              profitMargin: 23.70388153515425,
              traffic: 1564325,
              conversion: 4380,
              conversionRatePct: 0.2799929682131271,
              aov: 146,
              roas: 2.1241477760486305,
              contentOutput: 90,
            },
            {
              revenue: 641500,
              variableCost: 269430,
              fixedCost: 220000,
              totalCost: 489430,
              profit: 152070,
              profitMargin: 23.705378020265,
              traffic: 1564456,
              conversion: 4380,
              conversionRatePct: 0.2799695229523873,
              aov: 146,
              roas: 2.1240768134593964,
              contentOutput: 90,
            },
            {
              revenue: 641527,
              variableCost: 269441,
              fixedCost: 220000,
              totalCost: 489441,
              profit: 152086,
              profitMargin: 23.706874379410376,
              traffic: 1563793,
              conversion: 4379,
              conversionRatePct: 0.2800242743125209,
              aov: 147,
              roas: 2.124573515821248,
              contentOutput: 90,
            },
            {
              revenue: 641338,
              variableCost: 269362,
              fixedCost: 220000,
              totalCost: 489362,
              profit: 151976,
              profitMargin: 23.696709067605536,
              traffic: 1563670,
              conversion: 4378,
              conversionRatePct: 0.27998234921690635,
              aov: 146,
              roas: 2.124502553232014,
              contentOutput: 90,
            },
          ],
        },
      ],
      aggregate: {
        revenue: 20023051,
        totalCost: 13538300,
        profit: 6484751,
        profitMargin: 32.3864280223828,
        contentOutput: 255,
      },
      fetchedAt: "",
      isMock: true,
    },

  canva: {
    brandKits: [{ id: 'kAGWm36LGZk' }],
    designs: [
      {
        id: 'DAG2yKvS8Os',
        title: '「ミニマル自動業務連携（POS・会計・CRM連携コード例）」のコピー',
        updatedAt: 1774314452,
        pageCount: 1,
        thumbnailUrl: 'https://design.canva.ai/Zbgju-da6LVUe0P',
        viewUrl: 'https://www.canva.com/d/4YOUQJwiec4AWBX',
      },
      {
        id: 'DAHDtNxb1bw',
        title: '紫 緑 黄色 シンプル レーダーチャート ホワイトボード',
        updatedAt: 1773289908,
        pageCount: 1,
        thumbnailUrl: 'https://design.canva.ai/w2-Bcvz7hCt130e',
        viewUrl: 'https://www.canva.com/d/I9DmEpdX-v6CIZC',
      },
      {
        id: 'DAG9PRY1zjY',
        title: '「SCM-OP 利益率80%革命Webページ構成」のコピー',
        updatedAt: 1769305850,
        pageCount: 2,
        thumbnailUrl: 'https://design.canva.ai/4zaspuCbOqdzoLy',
        viewUrl: 'https://www.canva.com/d/OZ4_ut4GinvX9na',
      },
      {
        id: 'DAG_Yaj8LqQ',
        title: '家計簿 白黒 記録 シンプル A4文書',
        updatedAt: 1769305945,
        pageCount: 4,
        thumbnailUrl: 'https://design.canva.ai/r53kVHEyjOn19_y',
        viewUrl: 'https://www.canva.com/d/OeXIv-KMM3i3ftp',
      },
      {
        id: 'DAGWm1FKPBw',
        title: 'グリーン ホワイト シンプル お知らせ Instagram投稿画像',
        updatedAt: 1731729931,
        pageCount: 1,
        thumbnailUrl: 'https://design.canva.ai/TX38mlBwpwdmX6Y',
        viewUrl: 'https://www.canva.com/d/xFA4S1j9zacJdCS',
      },
      {
        id: 'DAF-6u3Ei-E',
        title: 'ネイビーと白と黒 落書き風 ビジネス計画 プレゼンテーション',
        updatedAt: 1709893109,
        pageCount: 20,
        thumbnailUrl: 'https://design.canva.ai/CRcf5KDfLiHuc0H',
        viewUrl: 'https://www.canva.com/d/4crF0MynXkvoknT',
      },
    ],
  },

  teamradar: {
    department: '営業部',
    evaluatedAt: '2035-04-15',
    axes: ['営業力', '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'] as readonly string[],
    members: [
      {
        id: 'morita-takuya',
        name: '森田 拓也',
        scores: [5, 3, 4, 2, 3] as number[],
        notes: {
          0: '新規営業の実績が高い',
          1: '社内調整はやや苦手',
          2: '説明は得意だが時間配分に課題',
          3: '押しが弱く譲歩しやすい',
          4: '訪問頻度が安定している',
        } as Record<number, string>,
      },
      {
        id: 'kasai-miho',
        name: '葛西 美保',
        scores: [3, 4, 5, 3, 2] as number[],
        notes: {
          0: '数字は平均的、伸びしろあり',
          1: 'オンラインでのやりとりが上手い',
          2: '提案資料の完成度が高く好評',
          3: '交渉は標準的',
          4: 'フォロー業務が弱め',
        } as Record<number, string>,
      },
      {
        id: 'ichimura-sara',
        name: '市村 紗良',
        scores: [2, 4, 2, 5, 5] as number[],
        notes: {
          0: '新規営業の経験はまだ少ない',
          1: '顧客対応に強くフォローも丁寧',
          2: '緊張しやすい',
          3: '契約をまとめやすい交渉力あり',
          4: '顧客フォローが丁寧で潜在度が高い',
        } as Record<number, string>,
      },
    ],
    fetchedAt: '',
    isMock: true,
  },

  templates: {
    templates: [
      {
        id: 'presentation-cover',
        label: 'プレゼン表紙 (16:9)',
        description: '提案資料 / 社内発表の表紙スライド (1920×1080)',
        width: 1920,
        height: 1080,
        defaults: {
          title: '次世代 営業戦略 2035',
          subtitle: 'Q2 全社レビュー · 5/15 オンライン',
          body: '営業部 / 経営企画チーム · Internal Use Only',
          accentColor: '#5b8def',
          secondaryColor: '#0f1117',
          brandText: 'Acme Corp.',
        },
      },
      {
        id: 'business-card',
        label: '名刺 (91×55mm)',
        description: '日本標準サイズの名刺テンプレート (1075×650 @ 300dpi)',
        width: 1075,
        height: 650,
        defaults: {
          title: '山田 太郎',
          subtitle: '営業部 主任',
          body: 'taro.yamada@example.com · +81-3-1234-5678',
          accentColor: '#0f5fac',
          secondaryColor: '#f8f8f8',
          brandText: 'Acme Corp.',
        },
      },
      {
        id: 'social-square',
        label: 'SNS 投稿 (1:1)',
        description: 'Instagram / Twitter 用スクエア投稿 (1080×1080)',
        width: 1080,
        height: 1080,
        defaults: {
          title: '新製品リリースのお知らせ',
          subtitle: '5月20日から全国主要書店で発売開始',
          body: '@acme · #新製品 #本日発売',
          accentColor: '#ec9a3d',
          secondaryColor: '#181c25',
          brandText: 'Acme Corp.',
        },
      },
      {
        id: 'social-story',
        label: 'SNS ストーリー (9:16)',
        description: 'Instagram / TikTok ストーリー縦型 (1080×1920)',
        width: 1080,
        height: 1920,
        defaults: {
          title: '春の限定セール',
          subtitle: '対象商品 30% OFF',
          body: '5月20日まで · オンラインストア限定',
          accentColor: '#e36b6b',
          secondaryColor: '#0f1117',
          brandText: 'Acme Corp.',
        },
      },
      {
        id: 'flyer-a4',
        label: 'A4 チラシ (縦)',
        description: 'A4 ポートレートのイベント / 販促チラシ (210×297mm)',
        width: 1240,
        height: 1754,
        defaults: {
          title: '無料セミナー開催',
          subtitle: '中小企業のための DX 入門',
          body: '日時: 2035年5月20日 14:00-16:00\n会場: 東京都港区 Acme ホール\n申込: acme.example/seminar',
          accentColor: '#5cb85c',
          secondaryColor: '#181c25',
          brandText: 'Acme Corp.',
        },
      },
      {
        id: 'certificate',
        label: '証明書 (A4 横)',
        description: '修了証 / 表彰状 (A4 ランドスケープ)',
        width: 1754,
        height: 1240,
        defaults: {
          title: '修了証書',
          subtitle: '山田 太郎 殿',
          body: '上記の方は当社が定める研修プログラムを修了されたことを証明します。\n2035年4月15日',
          accentColor: '#a06bd2',
          secondaryColor: '#fdfbf7',
          brandText: 'Acme Training Institute',
        },
      },
      {
        id: 'invoice-header',
        label: '請求書ヘッダー',
        description: '請求書 / 見積書のヘッダーバナー (1240×350)',
        width: 1240,
        height: 350,
        defaults: {
          title: 'INVOICE',
          subtitle: '請求書番号: INV-2035-0042',
          body: '発行日: 2035-05-15 · 支払期限: 2035-06-15',
          accentColor: '#0f5fac',
          secondaryColor: '#f8f8f8',
          brandText: 'Acme Corp.',
        },
      },
      {
        id: 'resume-header',
        label: '履歴書ヘッダー',
        description: '履歴書 / 職務経歴書のヘッダー (A4 上部)',
        width: 1240,
        height: 600,
        defaults: {
          title: '山田 太郎',
          subtitle: '営業部 / Sales Lead · 7年',
          body: 'Tokyo, Japan · taro.yamada@example.com',
          accentColor: '#43c3b8',
          secondaryColor: '#0f1117',
          brandText: '',
        },
      },
    ],
    fetchedAt: '',
    isMock: true,
  },
} as const;

export type Snapshot = typeof SNAPSHOT;
