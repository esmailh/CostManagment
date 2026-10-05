import { useApp } from '../context/AppContext';
import { formatMonthName, nextMonth, previousMonth } from '../lib/jalaali';
import { ChevronLeftIcon, ChevronRightIcon } from './ui/Icons';

export function MonthSwitcher() {
  const { year, month, setMonth } = useApp();
  const prev = previousMonth(year, month);
  const next = nextMonth(year, month);

  return (
    <div className="month-switcher">
      <button
        type="button"
        className="month-switcher__btn"
        onClick={() => setMonth(prev.year, prev.month)}
        aria-label="ماه قبل"
      >
        <ChevronRightIcon width={18} height={18} />
      </button>
      <div className="month-switcher__label">{formatMonthName(year, month)}</div>
      <button
        type="button"
        className="month-switcher__btn"
        onClick={() => setMonth(next.year, next.month)}
        aria-label="ماه بعد"
      >
        <ChevronLeftIcon width={18} height={18} />
      </button>
    </div>
  );
}
