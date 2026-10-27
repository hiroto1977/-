import { counsel, detectCrisis, detectHarmToOthers } from '../data/counseling';

/**
 * **質問が危機・他害の文面のとき、外部のモデルへは送らず、確証済みの窓口を出す** (threat: T-207)。
 *
 * AI 投資アドバイザー / AI 経営アドバイザーの質問欄は質問文を Anthropic へ送る。つらい気持ちが書かれた
 * 質問が、窓口を出さないまま端末の外へ出ていた (実測: 「もう死にたい。株をどうすれば」が invoke へ渡った)。
 * 村・コンシェルジュ・AI アシスタント・感情ページ (T-090) と同じく、判定が先で、当たれば送らずに窓口を出す。
 * 文面と窓口は `counseling.ts` の `counsel` が決める (ここで番号を持たない —— 窓口の台帳は 1 つ)。
 */

/** 送る前に止める文面か (危機・他害)。判定の口は感情ページ・AI アシスタントと同じ 2 つ。 */
export function shouldHoldFromExternalModel(text: string): boolean {
  return detectCrisis(text) || detectHarmToOthers(text);
}

export function CrisisHeldNotice({ text }: { readonly text: string }) {
  const response = counsel({ note: text });
  return (
    <div
      data-crisis-held
      role="alert"
      style={{ border: '1px solid var(--danger)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, lineHeight: 1.8 }}
    >
      <p style={{ margin: 0 }}>
        つらい気持ちや強い衝動が書かれているため、この質問は外部サービスへは送っていません。
      </p>
      <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{response.message}</p>
      <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>💡 {response.suggestion}</p>
      <strong style={{ color: 'var(--danger)' }}>相談できる窓口（日本）</strong>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {response.resources.map((r) => (
          <li key={r.label}>
            <strong>{r.label}</strong>: {r.detail}
          </li>
        ))}
      </ul>
      <button
        type="button"
        style={{ marginTop: 8, fontSize: 12 }}
        onClick={() => window.serviceHub?.openExternal('https://www.mhlw.go.jp/mamorouyokokoro/')}
      >
        厚労省「まもろうよこころ」を開く
      </button>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{response.disclaimer}</p>
    </div>
  );
}
