import { navigateTo } from '../navigate';
import { START_GOALS } from '../data/startGuide';

/**
 * ホームの先頭に置く「やりたいことから始める」。
 * 用事の言葉で選び、開く画面を 1 つだけ示す (サイドバーの 74 項目を読まなくてよい)。
 */
export function StartGuide() {
  return (
    <section className="home-start" aria-label="やりたいことから始める" data-start-guide>
      <h3 className="home-start-title">やりたいことから始める</h3>
      <p className="home-start-lead">どの画面を使えばいいか分からないときは、用事に近いものを選んでください。</p>
      <div className="home-start-grid">
        {START_GOALS.map((g) => (
          <article key={g.id} className="home-start-card" data-start-goal={g.id}>
            <h4>{g.title}</h4>
            <p className="home-start-when">{g.when}</p>
            <p className="home-start-prepare">
              <strong>用意するもの:</strong> {g.prepare}
            </p>
            <ol className="home-start-steps">
              {g.steps.map((s) => (
                <li key={s}>{s}</li>
                ))}
              </ol>
              <button type="button" className="primary" onClick={() => navigateTo(g.target)}>
                「{g.targetLabel}」を開く
              </button>
            </article>
        ))}
      </div>
    </section>
  );
}
