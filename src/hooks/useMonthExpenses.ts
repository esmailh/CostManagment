import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Expense } from '../db/types';

/** All expenses for a month, newest day first. */
export function useMonthExpenses(year: number, month: number): Expense[] {
  return (
    useLiveQuery(async () => {
      const rows = await db.expenses.where('[year+month]').equals([year, month]).toArray();
      return rows.sort((a, b) => b.day - a.day || b.createdAt.localeCompare(a.createdAt));
    }, [year, month]) ?? []
  );
}
