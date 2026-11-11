/**
 * 会社が載せる情報の頁 (お知らせ・取引ガイドライン・取扱説明書・よくある質問・お問い合わせ)。
 *
 * アプリの画面 (ServiceId) ではなく、社外向けのポータルだけが持つ頁。内容は `portalContent.ts` の
 * 1 ファイルから来る —— 利用者の入力も第三者の応答も描かない。文はテキストとして描き、リンクは
 * `VettedLink` (= 関門 `externalUrlOrNull` を通った行き先だけ) を通す。
 *
 * 問い合わせは**送らない** —— このポータルはサーバを持たない単一 HTML なので、連絡先と、伝えてほしい
 * ことを示すだけにする (フォームを置くと「送った」つもりの問い合わせがどこにも届かない)。
 */
import { externalUrlOrNull } from '../../shared/externalUrlGate';
import { Section } from '../components/StatusBar';
import { VettedLink } from '../components/VettedLink';
import { PORTAL_CONTENT_IS_SAMPLE, portalContentFor, type PortalContact, type PortalContent } from './portalContent';

const MUTED = { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 } as const;
const BODY = { fontSize: 13, lineHeight: 1.8, margin: '4px 0 0' } as const;

function SampleBadge() {
  if (!PORTAL_CONTENT_IS_SAMPLE) return null;
  return (
    <p role="note" data-portal-sample style={{ ...MUTED, margin: '0 0 12px' }}>
      <span className="badge warn">見本</span> ここに出ている会社名・連絡先・お知らせは見本です
      (配る前に自社の内容へ書き換えます)。
    </p>
  );
}

function Notices({ content }: { content: PortalContent }) {
  return (
    <Section title="お知らせ" count={content.notices.length}>
      {content.notices.length === 0 ? (
        <p style={MUTED}>いま載せているお知らせはありません。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {content.notices.map((n) => (
            <li key={`${n.date}-${n.title}`} data-portal-notice>
              <div style={MUTED}>{n.date}</div>
              <strong style={{ fontSize: 14 }}>{n.title}</strong>
              <p style={BODY}>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Guidelines({ content }: { content: PortalContent }) {
  return (
    <Section title="取引ガイドライン" count={content.guidelines.length}>
      {content.guidelines.map((g) => (
        <div key={g.title} data-portal-guideline style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>{g.title}</strong>
          <ul style={{ ...BODY, paddingLeft: 20 }}>
            {g.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}

function Manuals({ content }: { content: PortalContent }) {
  return (
    <Section title="取扱説明書・資料" count={content.manuals.length}>
      {content.manuals.length === 0 ? (
        <p style={MUTED}>いま載せている資料はありません。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {content.manuals.map((m) => {
            const href = externalUrlOrNull(m.url);
            return (
              <li key={m.title} data-portal-manual>
                <strong style={{ fontSize: 14 }}>{m.title}</strong>
                <p style={BODY}>{m.summary}</p>
                {href !== null ? (
                  <VettedLink href={href}>{m.title} を開く</VettedLink>
                ) : (
                  <span style={MUTED}>この資料は窓口へご請求ください（「お問い合わせ」の頁）。</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function Faq({ content }: { content: PortalContent }) {
  return (
    <Section title="よくある質問" count={content.faq.length}>
      {content.faq.length === 0 ? (
        <p style={MUTED}>いま載せている質問はありません。</p>
      ) : (
        <dl style={{ margin: 0, display: 'grid', gap: 14 }}>
          {content.faq.map((f) => (
            <div key={f.question} data-portal-faq>
              <dt style={{ fontSize: 14, fontWeight: 700 }}>Q. {f.question}</dt>
              <dd style={{ ...BODY, marginLeft: 0 }}>A. {f.answer}</dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );
}

function Contact({ contact }: { contact: PortalContact }) {
  return (
    <Section title="お問い合わせ">
      <dl data-portal-contact style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', fontSize: 13 }}>
        <dt style={MUTED}>窓口</dt>
        <dd style={{ margin: 0 }}>{contact.desk}</dd>
        <dt style={MUTED}>メール</dt>
        <dd style={{ margin: 0, userSelect: 'all' }}>{contact.email}</dd>
        <dt style={MUTED}>受付時間</dt>
        <dd style={{ margin: 0 }}>{contact.hours}</dd>
      </dl>
      <p style={{ ...BODY, marginTop: 12 }}>お問い合わせのときは、次のことをお知らせください。</p>
      <ul style={{ ...BODY, paddingLeft: 20 }}>
        {contact.include.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p style={{ ...MUTED, marginTop: 12 }}>
        このポータルから問い合わせを送ることはできません（お使いの端末の中だけで動く頁です）。上のメールアドレスへ、お使いのメールソフトからお送りください。
      </p>
    </Section>
  );
}

/** 載せる頁の id (台帳 `shared/portal.mamori` の `published` の画面と同じ綴り)。 */
export const PUBLISHED_SCREEN_IDS = ['guidelines', 'notices', 'manuals', 'faq', 'contact'] as const;
export type PublishedScreenId = (typeof PUBLISHED_SCREEN_IDS)[number];

export function isPublishedScreenId(v: string): v is PublishedScreenId {
  return (PUBLISHED_SCREEN_IDS as readonly string[]).includes(v);
}

export function PublishedScreen({ portal, screen }: { portal: 'partner' | 'customer'; screen: PublishedScreenId }) {
  const content = portalContentFor(portal);
  return (
    <div data-portal-published={screen}>
      <SampleBadge />
      {screen === 'guidelines' && (
        <>
          <Notices content={content} />
          <Guidelines content={content} />
          <Contact contact={content.contact} />
        </>
      )}
      {screen === 'notices' && <Notices content={content} />}
      {screen === 'manuals' && <Manuals content={content} />}
      {screen === 'faq' && <Faq content={content} />}
      {screen === 'contact' && <Contact contact={content.contact} />}
    </div>
  );
}
