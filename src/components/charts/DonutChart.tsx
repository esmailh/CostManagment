import { formatNumber } from '../../lib/format';
import { CategoryIcon } from '../CategoryIcon';

export interface DonutSlice {
  id?: string;
  label: string;
  icon?: string | null;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
  formatValue?: (n: number) => string;
}

/** Donut with a 2px surface gap between slices and a legend (text ink, colored dots). */
export function DonutChart({
  slices,
  size = 168,
  thickness = 24,
  centerValue,
  centerLabel,
  formatValue = formatNumber,
}: DonutChartProps) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gap = 2; // px surface gap between slices

  let accumulated = 0;

  return (
    <div className="donut">
      <div className="donut__figure" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            style={{ stroke: 'var(--surface-2)' }}
            strokeWidth={thickness}
          />
          {slices.map((slice, i) => {
            const length = total > 0 ? (slice.value / total) * circumference : 0;
            const drawLength = Math.max(length - gap, 0);
            const dashoffset = -accumulated;
            accumulated += length;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                style={{ stroke: slice.color }}
                strokeWidth={thickness}
                strokeDasharray={`${drawLength} ${circumference - drawLength}`}
                strokeDashoffset={dashoffset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
          })}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="donut__center">
            {centerValue && <div className="donut__center-value">{centerValue}</div>}
            {centerLabel && <div className="donut__center-label">{centerLabel}</div>}
          </div>
        )}
      </div>

      <div className="legend">
        {slices.map((slice) => (
          <div key={slice.id ?? slice.label} className="legend__item">
            <span className="legend__dot" style={{ background: slice.color }} />
            <span className="legend__name">
              {slice.icon !== undefined && (
                <span className="chart-category-icon">
                  <CategoryIcon icon={slice.icon} fallback="🏷️" alt={slice.label} />
                </span>
              )}
              <span>{slice.label}</span>
            </span>
            <span className="legend__value">{formatValue(slice.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
