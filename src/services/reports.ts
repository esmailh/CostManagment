import { db } from '../db/db';
import type { LoanInterestInfo } from '../lib/interest';
import { monthKey, previousMonth } from '../lib/jalaali';
import { calculateLoanSummary } from './loans';

export interface MonthTotals {
  total: number;
  fixed: number;
  daily: number;
  count: number;
}

export async function getMonthTotals(year: number, month: number): Promise<MonthTotals> {
  const rows = await db.expenses.where('[year+month]').equals([year, month]).toArray();
  let total = 0;
  let fixed = 0;
  let daily = 0;
  for (const e of rows) {
    total += e.amount;
    if (e.isRecurring) fixed += e.amount;
    else daily += e.amount;
  }
  return { total, fixed, daily, count: rows.length };
}

export interface CategoryBreakdown {
  categoryId: string;
  name: string;
  icon: string | null;
  total: number;
  percent: number;
}

export async function getCategoryBreakdown(
  year: number,
  month: number,
): Promise<CategoryBreakdown[]> {
  const rows = await db.expenses.where('[year+month]').equals([year, month]).toArray();
  const categories = await db.categories.toArray();
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const sums = new Map<string, number>();
  let total = 0;
  for (const e of rows) {
    sums.set(e.categoryId, (sums.get(e.categoryId) ?? 0) + e.amount);
    total += e.amount;
  }

  const out: CategoryBreakdown[] = [];
  for (const [categoryId, sum] of sums) {
    const category = categoryMap.get(categoryId);
    out.push({
      categoryId,
      name: category?.name ?? 'نامشخص',
      icon: category?.icon ?? null,
      total: sum,
      percent: total > 0 ? (sum / total) * 100 : 0,
    });
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

export interface MonthlyTotal {
  year: number;
  month: number;
  total: number;
}

/** Totals per month, optionally restricted to a single year. Sorted chronologically. */
export async function getMonthlyReport(year?: number): Promise<MonthlyTotal[]> {
  const rows = await db.expenses.toArray();
  const filtered = year === undefined ? rows : rows.filter((r) => r.year === year);

  const map = new Map<string, MonthlyTotal>();
  for (const e of filtered) {
    const key = monthKey(e.year, e.month);
    const current = map.get(key);
    if (current) current.total += e.amount;
    else map.set(key, { year: e.year, month: e.month, total: e.amount });
  }

  return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

export interface DailyTotal {
  year: number;
  month: number;
  day: number;
  total: number;
}

export async function getDailyReport(year: number, month: number): Promise<DailyTotal[]> {
  const rows = await db.expenses.where('[year+month]').equals([year, month]).toArray();
  const map = new Map<number, number>();
  for (const e of rows) {
    map.set(e.day, (map.get(e.day) ?? 0) + e.amount);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, total]) => ({ year, month, day, total }));
}

export interface MonthComparison {
  current: number;
  previous: number;
  /** null when the previous month has no spending (division by zero). */
  changePercent: number | null;
}

export async function getComparison(
  year: number,
  month: number,
): Promise<MonthComparison> {
  const current = (await getMonthTotals(year, month)).total;
  const prev = previousMonth(year, month);
  const previous = (await getMonthTotals(prev.year, prev.month)).total;

  if (previous === 0) return { current, previous, changePercent: null };
  return { current, previous, changePercent: ((current - previous) / previous) * 100 };
}

export interface LoanReportItem {
  id: string;
  title: string;
  lenderName: string;
  /** Logo of the lender, or null when it has none. */
  lenderIcon: string | null;
  installmentCount: number;
  paidCount: number;
  remainingCount: number;
  totalAmount: number | null;
  /** The amount borrowed, as recorded. Not the sum of the installments. */
  principal: number | null;
  /** Solved, typed or absent — null when the loan carries no interest. */
  interest: LoanInterestInfo | null;
  paidAmount: number | null;
  remainingAmount: number | null;
  /** Share of installments paid: `paidCount / installmentCount`. Never money-based. */
  progress: number;
  finishDate: { year: number; month: number; day: number | null } | null;
}

export interface LoansReport {
  items: LoanReportItem[];
  loanCount: number;
  completedCount: number;
  installmentCount: number;
  paidCount: number;
  remainingCount: number;
  totalAmount: number | null;
  paidAmount: number | null;
  remainingAmount: number | null;
  /** Total interest across the loans that carry it; null unless every one of them reports a figure. */
  totalInterest: number | null;
  interestBearingCount: number;
  progress: number;
}

export async function getLoansReport(): Promise<LoansReport> {
  const [loans, installments, lenders] = await Promise.all([
    db.loans.toArray(),
    db.loanInstallments.toArray(),
    db.lenders.toArray(),
  ]);
  const lenderNames = new Map(lenders.map((lender) => [lender.id, lender.name]));
  const lenderIcons = new Map(lenders.map((lender) => [lender.id, lender.icon || null]));
  const byLoan = new Map<string, typeof installments>();
  for (const installment of installments) {
    const group = byLoan.get(installment.loanId) ?? [];
    group.push(installment);
    byLoan.set(installment.loanId, group);
  }

  const items = loans.map((loan): LoanReportItem => {
    const loanInstallments = (byLoan.get(loan.id) ?? []).sort(
      (a, b) => a.installmentNumber - b.installmentNumber,
    );
    const summary = calculateLoanSummary(loan, loanInstallments);
    const paidCount = summary.paidCount;
    // A loan can carry installment rows without a declared count (an early migration left some
    // that way); the rows are the honest denominator, exactly as `calculateLoanSummary` reads it.
    const installmentCount = loan.installmentCount > 0 ? loan.installmentCount : loanInstallments.length;
    const lastDated = [...loanInstallments].reverse().find(
      (item) => item.dueYear !== null && item.dueMonth !== null,
    );
    return {
      id: loan.id,
      title: loan.title,
      lenderName: lenderNames.get(loan.lenderId) ?? 'وام‌دهنده نامشخص',
      lenderIcon: lenderIcons.get(loan.lenderId) ?? null,
      installmentCount,
      paidCount,
      remainingCount: summary.remainingCount,
      totalAmount: summary.totalAmount,
      principal: summary.principal,
      interest: summary.interest,
      paidAmount: summary.paidAmount,
      remainingAmount: summary.remainingAmount,
      progress: summary.progress ?? 0,
      finishDate: loan.mode === 'dated' && lastDated
        ? { year: lastDated.dueYear!, month: lastDated.dueMonth!, day: lastDated.dueDay }
        : null,
    };
  }).sort((a, b) => {
    const completionOrder = Number(a.remainingCount === 0) - Number(b.remainingCount === 0);
    return completionOrder || a.title.localeCompare(b.title, 'fa');
  });

  const knownAmounts = items.every(
    (item) => item.totalAmount !== null && item.paidAmount !== null && item.remainingAmount !== null,
  );
  const installmentCount = items.reduce((sum, item) => sum + item.installmentCount, 0);
  const paidCount = items.reduce((sum, item) => sum + item.paidCount, 0);
  const totalAmount = knownAmounts ? items.reduce((sum, item) => sum + item.totalAmount!, 0) : null;
  const paidAmount = knownAmounts ? items.reduce((sum, item) => sum + item.paidAmount!, 0) : null;
  const remainingAmount = knownAmounts ? items.reduce((sum, item) => sum + item.remainingAmount!, 0) : null;
  // Interest is summed only over the loans that actually carry it, and only when each of those
  // reports a figure: a partial sum would understate the total without saying so.
  const interestItems = items.filter((item) => item.interest !== null);
  const interestKnown = interestItems.length > 0
    && interestItems.every((item) => item.interest!.totalInterest !== null);
  const totalInterest = interestKnown
    ? interestItems.reduce((sum, item) => sum + item.interest!.totalInterest!, 0)
    : null;

  return {
    items,
    loanCount: items.length,
    completedCount: items.filter((item) => item.remainingCount === 0).length,
    installmentCount,
    paidCount,
    remainingCount: Math.max(0, installmentCount - paidCount),
    totalAmount,
    paidAmount,
    remainingAmount,
    totalInterest,
    interestBearingCount: interestItems.length,
    // Progress counts installments, so it always agrees with the «اقساط پرداختی X از Y» row
    // above it. Measuring it against the amounts would let a loan whose installments outrun its
    // principal (interest) report 100% while terms remain.
    progress: installmentCount > 0 ? Math.min(100, (paidCount / installmentCount) * 100) : 0,
  };
}
