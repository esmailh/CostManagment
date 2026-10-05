import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { RecurringExpense } from '../db/types';

export function useRecurring(): RecurringExpense[] {
  return useLiveQuery(() => db.recurringExpenses.toArray(), []) ?? [];
}
