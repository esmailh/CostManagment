import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState } from '../components/ui/EmptyState';
import { BarList } from '../components/charts/BarList';
import { BarChart } from '../components/charts/BarChart';
import { DonutChart } from '../components/charts/DonutChart';
import { seriesColor } from '../components/charts/chartColors';
import {
  useCategoryBreakdown,
  useComparison,
  useDailyReport,
  useMonthlyReport,
  useLoansReport,
} from '../hooks/useReports';
import {
  formatJalaliDate,
  formatMonthName,
  PERSIAN_MONTHS,
  previousMonth,
  toPersianDigits,
} from '../lib/jalaali';
import { formatNumber, formatPercent, formatPercentFixed, formatRial } from '../lib/format';

type ReportType = 'monthly' | 'category' | 'daily' | 'comparison' | 'loans';

export function Reports() {
  const { year, month } = useApp();
  const [type, setType] = useState<ReportType>('monthly');

  return (
    <div>
      <MonthSwitcher />

      <SegmentedControl<ReportType>
        value={type}
        onChange={setType}
        options={[
          { value: 'monthly', label: 'ماهانه' },
          { value: 'category', label: 'دسته‌بندی' },
          { value: 'daily', label: 'روزانه' },
          { value: 'comparison', label: 'مقایسه' },
          { value: 'loans', label: 'وام‌ها' },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        {type === 'monthly' && <MonthlyReport year={year} />}
        {type === 'category' && <CategoryReport year={year} month={month} />}
        {type === 'daily' && <DailyReport year={year} month={month} />}
        {type === 'comparison' && <ComparisonReport year={year} month={month} />}
        {type === 'loans' && <LoansReport />}
      </div>
    </div>
  );
}

function MonthlyReport({ year }: { year: number }) {
  const report = useMonthlyReport(year);
  if (report.length === 0) {
    return <EmptyState emoji="📅" title="داده‌ای برای این سال نیست" />;
  }
  const items = report.map((m, i) => ({
    label: PERSIAN_MONTHS[m.month - 1],
    value: m.total,
    display: formatRial(m.total),
    color: seriesColor(i),
  }));
  return (
    <>
      <div className="section-title">گزارش ماهانه {toPersianDigits(year)}</div>
      <div className="card">
        <BarList items={items} />
      </div>
    </>
  );
}

function CategoryReport({ year, month }: { year: number; month: number }) {
  const breakdown = useCategoryBreakdown(year, month);
  if (breakdown.length === 0) {
    return <EmptyState emoji="🥧" title="هزینه‌ای برای دسته‌بندی نیست" />;
  }

  const MAX = 8;
  let slices = breakdown.map((b, i) => ({
    id: b.categoryId,
    label: b.name,
    icon: b.icon,
    value: b.total,
    color: seriesColor(i),
  }));
  if (slices.length > MAX) {
    const top = slices.slice(0, MAX - 1);
    const rest = slices.slice(MAX - 1);
    const restSum = rest.reduce((s, x) => s + x.value, 0);
    slices = [
      ...top,
      { id: 'other', label: 'سایر', icon: null, value: restSum, color: seriesColor(MAX - 1) },
    ];
  }

  const total = breakdown.reduce((s, b) => s + b.total, 0);

  return (
    <>
      <div className="section-title">هزینه به تفکیک دسته‌بندی — {formatMonthName(year, month)}</div>
      <div className="card">
        <DonutChart
          slices={slices}
          centerValue={formatRial(total)}
          centerLabel="مجموع"
          formatValue={formatRial}
        />
      </div>
    </>
  );
}

function DailyReport({ year, month }: { year: number; month: number }) {
  const report = useDailyReport(year, month);
  if (report.length === 0) {
    return <EmptyState emoji="📈" title="داده‌ای برای این ماه نیست" />;
  }
  const data = report.map((d) => ({ label: toPersianDigits(d.day), value: d.total }));
  return (
    <>
      <div className="section-title">هزینه روزانه — {formatMonthName(year, month)}</div>
      <div className="card">
        <BarChart data={data} />
      </div>
      <div className="section-title">مبالغ روزانه</div>
      <div className="card">
        {report.map((d) => (
          <div className="list-item" key={d.day}>
            <div className="list-item__body">
              <div className="list-item__title">{formatJalaliDate(year, month, d.day)}</div>
            </div>
            <div className="list-item__amount">{formatRial(d.total)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function LoansReport() {
  const report = useLoansReport();
  if (!report) return <EmptyState emoji="💳" title="در حال بارگذاری…" />;
  if (report.items.length === 0) return <EmptyState emoji="💳" title="وامی ثبت نشده است" />;
  const amount = (value: number | null) => value === null ? 'نامشخص' : formatRial(value);

  return (
    <div className="loan-report">
      <div className="section-title">خلاصه وام‌ها</div>
      <div className="loan-report__overview card">
        <div><span>کل وام‌ها</span><strong>{formatNumber(report.loanCount)}</strong></div>
        <div><span>تسویه‌شده</span><strong>{formatNumber(report.completedCount)}</strong></div>
        <div><span>اقساط پرداختی</span><strong>{formatNumber(report.paidCount)} از {formatNumber(report.installmentCount)}</strong></div>
        <div><span>مجموع پرداختی</span><strong>{amount(report.paidAmount)}</strong></div>
        <div><span>مانده کل</span><strong>{amount(report.remainingAmount)}</strong></div>
        {/* Interest is summed over the loans that carry it, so the two cells are read together. */}
        <div><span>مجموع سود</span><strong>{amount(report.totalInterest)}</strong></div>
        <div><span>وام‌های سوددار</span><strong>{formatNumber(report.interestBearingCount)}</strong></div>
        <div><span>پیشرفت کل</span><strong>{formatPercent(report.progress)}</strong></div>
        <div><span>اقساط باقی‌مانده</span><strong>{formatNumber(report.remainingCount)}</strong></div>
      </div>

      <div className="section-title">جزئیات وام‌ها</div>
      <div className="loans-list">
        {report.items.map((loan) => {
          const finish = loan.remainingCount === 0
            ? 'تسویه‌شده'
            : loan.finishDate
              ? loan.finishDate.day === null
                ? `${PERSIAN_MONTHS[loan.finishDate.month - 1]} ${toPersianDigits(loan.finishDate.year)}`
                : formatJalaliDate(loan.finishDate.year, loan.finishDate.month, loan.finishDate.day)
              : `${formatNumber(loan.remainingCount)} قسط باقی‌مانده`;
          return (
            <article className="loan-card loan-report__card" key={loan.id}>
              <div className="loan-card__summary">
                <div className="loan-card__icon">
                  <CategoryIcon icon={loan.lenderIcon} fallback="💳" alt={loan.lenderName} />
                </div>
                <div className="loan-card__main">
                  <div className="loan-card__title"><strong>{loan.title}</strong><span>{loan.lenderName}</span></div>
                  <div className="loan-progress"><span style={{ width: `${Math.min(100, loan.progress)}%` }} /></div>
                  <div className="loan-card__meta"><span>{formatNumber(loan.paidCount)} از {formatNumber(loan.installmentCount)} قسط</span><b>{formatPercent(loan.progress)}</b></div>
                </div>
              </div>
              <div className="loan-totals">
                <div><span>پرداخت‌شده</span><strong>{amount(loan.paidAmount)}</strong></div>
                <div><span>مانده</span><strong>{amount(loan.remainingAmount)}</strong></div>
                <div><span>پایان</span><strong>{finish}</strong></div>
              </div>
              {loan.interest && loan.interest.monthlyRate !== null && loan.interest.effectiveAnnualRate !== null && <div className="loan-interest">
                <span>سود</span>
                <strong>{formatPercentFixed(loan.interest.monthlyRate * 100, 4)} ماهانه</strong>
                <strong>{formatPercentFixed(loan.interest.effectiveAnnualRate * 100, 2)} مؤثر سالانه</strong>
                {/* A schedule that repays less than the principal yields a negative subtraction; the
                    strip reports the disagreement rather than labelling a negative number «سود کل». */}
                {loan.interest.totalInterest !== null && !loan.interest.repaymentBelowPrincipal
                  && <strong>{formatRial(loan.interest.totalInterest)} سود کل</strong>}
                {loan.interest.repaymentBelowPrincipal && <em className="loan-interest__badge">جمع اقساط از اصل وام کمتر است</em>}
                {loan.interest.approximate && <em className="loan-interest__badge">تقریبی</em>}
              </div>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonReport({ year, month }: { year: number; month: number }) {
  const comparison = useComparison(year, month);
  const prev = previousMonth(year, month);

  if (!comparison) {
    return <EmptyState emoji="⚖️" title="در حال بارگذاری…" />;
  }

  let changeText = 'ماه قبل هزینه‌ای ندارد';
  let changeClass = '';
  if (comparison.changePercent !== null) {
    const pct = comparison.changePercent;
    const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
    changeText = `${sign}${formatPercent(Math.abs(pct))}`;
    changeClass = pct > 0 ? 'comparison-badge--up' : 'comparison-badge--down';
  }

  return (
    <>
      <div className="card">
        <div className="stat__label">هزینه {formatMonthName(year, month)}</div>
        <div className="hero__value" style={{ fontSize: 26 }}>{formatRial(comparison.current)}</div>
      </div>
      <div className="card">
        <div className="stat__label">هزینه {formatMonthName(prev.year, prev.month)}</div>
        <div className="stat__value" style={{ fontSize: 18 }}>{formatRial(comparison.previous)}</div>
      </div>
      <div className="card">
        <div className="stat__label">تغییر</div>
        <div className={`stat__value comparison-badge ${changeClass}`}>{changeText}</div>
      </div>
    </>
  );
}
