import { db } from '../db/db';
import type { Expense } from '../db/types';
import { uuid } from '../lib/id';

export interface ExpenseInput {
  title: string;
  amount: number;
  categoryId: string;
  year: number;
  month: number;
  day: number;
  description?: string;
}

export async function addExpense(input: ExpenseInput): Promise<Expense> {
  const now = new Date().toISOString();
  const id = uuid();
  const expense: Expense = {
    id,
    title: input.title.trim(),
    amount: input.amount,
    categoryId: input.categoryId,
    year: input.year,
    month: input.month,
    day: input.day,
    description: input.description?.trim() ?? '',
    isRecurring: false,
    recurringExpenseId: null,
    generationKey: `d|${id}`,
    createdAt: now,
    updatedAt: now,
  };
  await db.expenses.add(expense);
  return expense;
}

export async function updateExpense(id: string, input: Partial<ExpenseInput>): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.amount !== undefined) updates.amount = input.amount;
  if (input.categoryId !== undefined) updates.categoryId = input.categoryId;
  if (input.year !== undefined) updates.year = input.year;
  if (input.month !== undefined) updates.month = input.month;
  if (input.day !== undefined) updates.day = input.day;
  if (input.description !== undefined) updates.description = input.description.trim();
  await db.expenses.update(id, updates);
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.delete(id);
}

export async function getExpense(id: string): Promise<Expense | undefined> {
  return db.expenses.get(id);
}
