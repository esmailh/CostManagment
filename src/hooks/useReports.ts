import { useLiveQuery } from 'dexie-react-hooks';
import {
  getCategoryBreakdown,
  getComparison,
  getDailyReport,
  getMonthTotals,
  getMonthlyReport,
  getLoansReport,
  type CategoryBreakdown,
  type DailyTotal,
  type MonthComparison,
  type MonthTotals,
  type MonthlyTotal,
  type LoansReport,
} from '../services/reports';

export function useMonthTotals(year: number, month: number): MonthTotals {
  return (
    useLiveQuery(() => getMonthTotals(year, month), [year, month]) ?? {
      total: 0,
      fixed: 0,
      daily: 0,
      count: 0,
    }
  );
}

export function useCategoryBreakdown(year: number, month: number): CategoryBreakdown[] {
  return useLiveQuery(() => getCategoryBreakdown(year, month), [year, month]) ?? [];
}

export function useMonthlyReport(year?: number): MonthlyTotal[] {
  return useLiveQuery(() => getMonthlyReport(year), [year]) ?? [];
}

export function useDailyReport(year: number, month: number): DailyTotal[] {
  return useLiveQuery(() => getDailyReport(year, month), [year, month]) ?? [];
}

export function useComparison(year: number, month: number): MonthComparison | undefined {
  return useLiveQuery(() => getComparison(year, month), [year, month]);
}

export function useLoansReport(): LoansReport | undefined {
  return useLiveQuery(() => getLoansReport(), []);
}
