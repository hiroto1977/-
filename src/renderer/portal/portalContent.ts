/**
 * 社外向けのポータルに載せる情報 (お知らせ・ガイドライン・説明書・よくある質問・問い合わせ先)。
 *
 * **ここに在るのは見本である** (2026-11-11)。会社名も連絡先も架空で、実在の会社・個人・電話番号・
 * メールアドレスを使っていない (ドメインは予約済みの `example.co.jp`・電話は書かない)。配る前に、
 * この 1 ファイルを自社の内容へ書き換えて `npm run build:portal:partner` / `build:portal:customer` で組み直す。
 * 見本のまま配らないよう、画面は `PORTAL_CONTENT_IS_SAMPLE` が真のあいだ「見本」の札を出す
 * (書き換えたらこの定数を `false` にする)。
 *
 * 載せるのは**社外の人が読んでよい内容だけ**にする —— このファイルの文は配る HTML へそのまま入る。
 * 画面は文をテキストとして描く (HTML として解釈しない)。リンクは `VettedLink` を通るので、
 * http / https 以外の行き先は開かない。
 */

/** 見本のままか。自社の内容へ書き換えたら `false` にする (画面の「見本」の札が消える)。 */
export const PORTAL_CONTENT_IS_SAMPLE: boolean = true;

export interface PortalNotice {
  /** 掲載日 (YYYY-MM-DD)。 */
  readonly date: string;
  readonly title: string;
  readonly body: string;
}

export interface PortalGuideline {
  readonly title: string;
  /** 1 項目ずつの箇条書き。 */
  readonly points: readonly string[];
}

export interface PortalManual {
  readonly title: string;
  readonly summary: string;
  /** 置き場所の URL (http / https)。無ければ「窓口へ請求」と出す。 */
  readonly url: string | null;
}

export interface PortalFaq {
  readonly question: string;
  readonly answer: string;
}

export interface PortalContact {
  readonly desk: string;
  readonly email: string;
  readonly hours: string;
  /** 問い合わせのときに伝えてほしいこと。 */
  readonly include: readonly string[];
}

export interface PortalContent {
  /** 載せている会社の名前。 */
  readonly company: string;
  readonly notices: readonly PortalNotice[];
  readonly guidelines: readonly PortalGuideline[];
  readonly manuals: readonly PortalManual[];
  readonly faq: readonly PortalFaq[];
  readonly contact: PortalContact;
}

export const PARTNER_CONTENT: PortalContent = {
  company: '株式会社サンプル商事（見本）',
  notices: [
    {
      date: '2026-11-01',
      title: '年末年始の発注締切について（見本）',
      body: '12 月の最終発注は 12 月 20 日までにお願いします。それ以降の発注は翌年 1 月 6 日からの手配になります。',
    },
    {
      date: '2026-10-01',
      title: '請求書の送付先を変更しました（見本）',
      body: '請求書は下の窓口のメールアドレスへ PDF でお送りください。紙での郵送は不要です。',
    },
  ],
  guidelines: [
    {
      title: '発注から支払までの流れ',
      points: [
        '発注は発注書で行います。口頭・チャットだけの依頼は、発注書が届くまで着手しないでください。',
        '納品のときは納品書を添えてください。当社は受け取ってから 7 営業日以内に検収し、検収書をお返しします。',
        '請求書は検収書の日付の月末締めで発行してください。支払は翌月末です。',
      ],
    },
    {
      title: '情報の取り扱い',
      points: [
        '当社から受け取った仕様書・図面・顧客の情報は、委託した業務のためだけに使ってください。',
        '再委託するときは、事前に書面で当社の承諾を得てください。',
        '業務が終わったら、受け取った資料は返すか、消したことを知らせてください。',
      ],
    },
    {
      title: '書式について',
      points: [
        '発注書・納品書・検収書・業務委託契約・秘密保持契約の書式は、このポータルの「書類スタジオ」で作れます。',
        '入力した内容は、お使いの端末の中にだけ保存されます。当社へ自動で送られることはありません。',
      ],
    },
  ],
  manuals: [],
  faq: [],
  contact: {
    desk: '購買部 取引先窓口（見本）',
    email: 'partners@example.co.jp',
    hours: '平日 9:00〜17:00',
    include: ['貴社名とご担当者名', '発注書の番号', 'お問い合わせの内容'],
  },
};

export const CUSTOMER_CONTENT: PortalContent = {
  company: '株式会社サンプル商事（見本）',
  notices: [
    {
      date: '2026-11-01',
      title: '年末年始の休業のお知らせ（見本）',
      body: '12 月 28 日から 1 月 4 日まで窓口を休みます。この間にいただいたお問い合わせは、1 月 5 日から順にお答えします。',
    },
  ],
  guidelines: [],
  manuals: [
    {
      title: '製品 A 取扱説明書（見本）',
      summary: '設置・毎日の使い方・お手入れ・困ったときの確かめ方。',
      url: 'https://example.co.jp/manuals/product-a',
    },
    {
      title: '保証書・保証規定（見本）',
      summary: '保証の期間と、保証の対象にならない場合。',
      url: null,
    },
  ],
  faq: [
    {
      question: '契約の内容を確かめたい',
      answer: 'ご契約のときにお渡しした契約書の控えをご覧ください。控えが見当たらないときは、下の窓口へ契約者のお名前とご契約の時期をお知らせください。',
    },
    {
      question: '契約の内容を変えたい・解約したい',
      answer: '下の窓口へメールでお知らせください。手続きの書類をお送りします。変更・解約は書類を受け取った日から扱います。',
    },
    {
      question: '説明書をなくした',
      answer: '「取扱説明書・資料」の頁から開けます。載っていない資料は窓口へお知らせください。',
    },
    {
      question: '製品が動かない',
      answer: '取扱説明書の「困ったときは」を先にお確かめください。直らないときは、製品の型番と症状を添えて窓口へお知らせください。',
    },
  ],
  contact: {
    desk: 'お客様窓口（見本）',
    email: 'support@example.co.jp',
    hours: '平日 10:00〜17:00',
    include: ['ご契約者のお名前', '製品の型番', '困っていること・いつから起きているか'],
  },
};

/** 社外向けのポータルの内容。社内ポータルは載せる頁を持たない。 */
export function portalContentFor(portal: 'partner' | 'customer'): PortalContent {
  return portal === 'partner' ? PARTNER_CONTENT : CUSTOMER_CONTENT;
}
