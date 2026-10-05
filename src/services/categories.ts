import { db } from '../db/db';
import type { Category } from '../db/types';
import { uuid } from '../lib/id';

export async function addCategory(name: string, icon: string | null): Promise<Category> {
  const now = new Date().toISOString();
  const category: Category = {
    id: uuid(),
    name: name.trim(),
    icon,
    createdAt: now,
    updatedAt: now,
  };
  await db.categories.add(category);
  return category;
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, 'name' | 'icon'>>,
): Promise<void> {
  await db.categories.update(id, { ...patch, updatedAt: new Date().toISOString() });
}

export interface DeleteResult {
  ok: boolean;
  reason?: 'in-use';
}

/** Delete a category only if no expense, recurring template, or loan references it. */
export async function deleteCategory(id: string): Promise<DeleteResult> {
  const expenseCount = await db.expenses.where('categoryId').equals(id).count();
  if (expenseCount > 0) return { ok: false, reason: 'in-use' };

  const recurringCount = await db.recurringExpenses.where('categoryId').equals(id).count();
  if (recurringCount > 0) return { ok: false, reason: 'in-use' };

  const loanCount = await db.loans.where('expenseCategoryId').equals(id).count();
  if (loanCount > 0) return { ok: false, reason: 'in-use' };

  await db.categories.delete(id);
  return { ok: true };
}
