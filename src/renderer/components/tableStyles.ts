/**
 * Shared table styles for business dashboard pages.
 *
 * Pages compose their own tables (different columns / conditional cells
 * / aggregate rows), so we export constants rather than a `<Table>`
 * component — composition is the right abstraction here. Used by
 * UberEatsPage / DemaeCanPage / RealEstatePage / MutualFundsPage.
 */
import type { CSSProperties } from 'react';

export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-mute)',
  fontWeight: 600,
};

export const thNum: CSSProperties = { ...thStyle, textAlign: 'right' };

export const tdStyle: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
};

export const tdNum: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};
