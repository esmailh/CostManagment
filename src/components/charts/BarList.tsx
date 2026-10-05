import { formatNumber } from '../../lib/format';
import { CategoryIcon } from '../CategoryIcon';

export interface BarListItem {
  id?: string;
  label: string;
  icon?: string | null;
  /** Drives bar length (relative to the largest value). */
  value: number;
  /** Text shown next to the label; defaults to formatValue(value). */
  display?: string;
  color: string;
}

interface BarListProps {
  items: BarListItem[];
  formatValue?: (n: number) => string;
}

/** Horizontal bars that grow from the right (RTL-native). */
export function BarList({ items, formatValue = formatNumber }: BarListProps) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div>
      {items.map((item) => (
        <div key={item.id ?? item.label} className="hbar">
          <div className="hbar__head">
            <span className="hbar__name">
              {item.icon !== undefined && (
                <span className="chart-category-icon">
                  <CategoryIcon icon={item.icon} fallback="🏷️" alt={item.label} />
                </span>
              )}
              <span>{item.label}</span>
            </span>
            <span className="hbar__value">{item.display ?? formatValue(item.value)}</span>
          </div>
          <div className="hbar__track">
            <div
              className="hbar__fill"
              style={{ width: `${(item.value / max) * 100}%`, background: item.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
