import { db } from '../db/db';
import type { RecurringExpense } from '../db/types';
import { uuid } from '../lib/id';

export interface RecurringInput {
  title: string;
  amount: number;
  categoryId: string;
  dayOfMonth: number;
  description?: string;
  isActive: boolean;
}

export async function addRecurring(input: RecurringInput): Promise<RecurringExpense> {
  const now = new Date().toISOString();
  const recurring: RecurringExpense = {
    id: uuid(),
    title: input.title.trim(),
    amount: input.amount,
    categoryId: input.categoryId,
    dayOfMonth: input.dayOfMonth,
    description: input.description?.trim() ?? '',
    isActive: input.isActive,
    createdAt: now,
    updatedAt: now,
  };
  await db.recurringExpenses.add(recurring);
  return recurring;
}

export async function updateRecurring(
  id: string,
  input: Partial<RecurringInput>,
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.amount !== undefined) updates.amount = input.amount;
  if (input.categoryId !== undefined) updates.categoryId = input.categoryId;
  if (input.dayOfMonth !== undefined) updates.dayOfMonth = input.dayOfMonth;
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.isActive !== undefined) updates.isActive = input.isActive;
  await db.recurringExpenses.update(id, updates);
}

/** Delete a template; historical generated expenses are intentionally left intact. */
export async function deleteRecurring(id: string): Promise<void> {
  await db.recurringExpenses.delete(id);
}
