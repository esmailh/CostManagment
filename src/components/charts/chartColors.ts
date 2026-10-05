/** Fixed categorical order (never cycled). Slots are `--c1`…`--c8` in theme.css. */
export function seriesColor(index: number): string {
  return `var(--c${(index % 8) + 1})`;
}

export const CHART_SERIES = [
  'var(--c1)',
  'var(--c2)',
  'var(--c3)',
  'var(--c4)',
  'var(--c5)',
  'var(--c6)',
  'var(--c7)',
  'var(--c8)',
];
