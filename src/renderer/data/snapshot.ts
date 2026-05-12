// Snapshot of live data fetched from each service's MCP server.
// Captured on 2026-05-11. Refreshing this snapshot is a manual step
// until each ServiceClient is wired up to call the live REST APIs.

export const SNAPSHOT = {
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

  // SCAFFOLD:ADD_SNAPSHOT_SLICE_BELOW (scaffold inserts new service slices before `canva:` ↓)

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
} as const;

export type Snapshot = typeof SNAPSHOT;
