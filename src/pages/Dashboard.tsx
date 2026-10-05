import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { GenerateDialog } from '../components/GenerateDialog';
import { BarList } from '../components/charts/BarList';
import { seriesColor } from '../components/charts/chartColors';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useCategoryBreakdown, useComparison, useMonthTotals } from '../hooks/useReports';
import { formatMonthName } from '../lib/jalaali';
import { formatNumber, formatPercent, formatRial } from '../lib/format';

export function Dashboard() {
  const { year, month } = useApp();
  const totals = useMonthTotals(year, month);
  const breakdown = useCategoryBreakdown(year, month);
  const comparison = useComparison(year, month);
  const [genOpen, setGenOpen] = useState(false);

  const barItems = breakdown.map((b, i) => ({
    id: b.categoryId,
    label: b.name,
    icon: b.icon,
    value: b.total,
    display: formatPercent(b.percent),
    color: seriesColor(i),
  }));

  let comparisonLabel = '…';
  let comparisonClass = '';
  if (comparison && comparison.changePercent !== null) {
    const pct = comparison.changePercent;
    const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
    comparisonLabel = `${sign}${formatPercent(Math.abs(pct))}`;
    comparisonClass = pct > 0 ? 'comparison-badge--up' : 'comparison-badge--down';
  } else if (comparison) {
    comparisonLabel = '—';
  }

  return (
    <div>
      <MonthSwitcher />

      <div className="hero">
        <div className="hero__label">مجموع هزینه {formatMonthName(year, month)}</div>
        <div className="hero__value">{formatRial(totals.total)}</div>
      </div>

      <div className="stats-grid">
        <div className="stat">
          <div className="stat__label">هزینه‌های ثابت</div>
          <div className="stat__value">{formatRial(totals.fixed)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">هزینه‌های روزانه</div>
          <div className="stat__value">{formatRial(totals.daily)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">تعداد هزینه‌ها</div>
          <div className="stat__value">{formatNumber(totals.count)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">تغییر نسبت به ماه قبل</div>
          <div className={`stat__value comparison-badge ${comparisonClass}`}>{comparisonLabel}</div>
        </div>
      </div>

      <div className="section-title">دسته‌بندی هزینه‌ها</div>
      <div className="card">
        {breakdown.length === 0 ? (
          <EmptyState emoji="📊" title="هنوز هزینه‌ای ثبت نشده" subtitle="با دکمه + اولین هزینه را ثبت کنید." />
        ) : (
          <BarList items={barItems} />
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Button variant="secondary" block onClick={() => setGenOpen(true)}>
          ثبت هزینه‌های ثابت این ماه
        </Button>
      </div>

      <GenerateDialog open={genOpen} onClose={() => setGenOpen(false)} />
    </div>
  );
}
