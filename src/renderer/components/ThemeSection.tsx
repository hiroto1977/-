import { useEffect, useState } from 'react';
import {
  osPrefersDark,
  readThemeChoice,
  selectTheme,
  THEME_CHOICES,
  THEME_LABELS,
  type ThemeChoice,
} from '../theme';

/**
 * 配色の選択 (パス 317)。3 択のピル —— 押した瞬間に効き、端末に保存する。
 *
 * 保存できなければ (容量超過・プライベートウィンドウ) その理由を出す。見た目はもう変わっているので
 * 「保存した」とは言わず「次回のために保存できなかった」と言う。読めなかった時も同じく理由を出す
 * (既定のライトで描いている)。文はどちらも入口 `data/localWrite.ts` の物 (この画面は文を持たない)。
 */
export function ThemeSection() {
  const [read] = useState(() => readThemeChoice());
  const [choice, setChoice] = useState<ThemeChoice>(read.choice);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prefersDark, setPrefersDark] = useState(() => osPrefersDark());

  // 「OS に合わせる」の注記は OS 側の切り替えに追随する (適用そのものは theme.ts が追随する)。
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const pick = (next: ThemeChoice) => {
    setChoice(next);
    const result = selectTheme(next);
    setSaveError(result.ok ? null : result.message);
  };

  const showing = choice === 'system' ? (prefersDark ? 'ダーク' : 'ライト') : THEME_LABELS[choice];

  return (
    <div data-theme-section>
      <div role="group" aria-label="配色" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {THEME_CHOICES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={choice === c}
            data-theme-choice={c}
            className={choice === c ? 'primary' : undefined}
            onClick={() => pick(c)}
          >
            {THEME_LABELS[c]}
          </button>
        ))}
      </div>
      <p data-theme-note style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {choice === 'system'
          ? `OS の設定に合わせて${showing}で表示しています。OS 側を切り替えるとこの画面も追随します。`
          : `${showing}で表示しています。`}
        {' '}
        選択はこの端末 (ブラウザ) に保存され、バックアップには入りません。
      </p>
      {!read.readable && read.message && (
        <p data-theme-unreadable style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--warning)' }}>
          ⚠ 保存した配色を読めなかったので、既定のライトで表示しています: {read.message}
        </p>
      )}
      {saveError && (
        <p data-theme-save-error style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--danger)' }}>
          ⚠ 配色は変わりましたが、次回のために保存できませんでした: {saveError}
        </p>
      )}
    </div>
  );
}
