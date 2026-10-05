import { db } from '../db/db';
import type { Expense, RecurringExpense } from '../db/types';
import { uuid } from '../lib/id';
import { monthKey, monthLength } from '../lib/jalaali';

/** Deterministic dedup key: one recurring template, one month. */
export function generationKeyFor(recurringId: string, year: number, month: number): string {
  return `${recurringId}|${monthKey(year, month)}`;
}

export interface GenerationStatus {
  recurring: RecurringExpense;
  alreadyGenerated: boolean;
}

/** Which active templates are/aren't yet materialized for a given month. */
export async function getGenerationStatus(
  year: number,
  month: number,
): Promise<GenerationStatus[]> {
  const templates = await db.recurringExpenses.toArray();
  const existing = await db.expenses.where('[year+month]').equals([year, month]).toArray();
  const keys = new Set(existing.map((e) => e.generationKey));

  return templates
    .filter((t) => t.isActive)
    .map((recurring) => ({
      recurring,
      alreadyGenerated: keys.has(generationKeyFor(recurring.id, year, month)),
    }));
}

/**
 * Materialize all active recurring templates into ordinary expenses for the month.
 * Already-generated templates are skipped (enforced by the unique `generationKey` index),
 * so this can never create duplicates. Returns the number of expenses created.
 */
export async function generateRecurringExpenses(
  year: number,
  month: number,
): Promise<number> {
  const templates = await db.recurringExpenses.toArray();
  const active = templates.filter((t) => t.isActive);
  if (active.length === 0) return 0;

  const monthLen = monthLength(year, month);
  const now = new Date().toISOString();

  const existingKeys = new Set(
    (await db.expenses.where('[year+month]').equals([year, month]).toArray()).map(
      (e) => e.generationKey,
    ),
  );

  const toAdd: Expense[] = [];
  for (const template of active) {
    const key = generationKeyFor(template.id, year, month);
    if (existingKeys.has(key)) continue;

    toAdd.push({
      id: uuid(),
      title: template.title,
      amount: template.amount,
      categoryId: template.categoryId,
      year,
      month,
      day: Math.min(template.dayOfMonth, monthLen),
      description: template.description,
      isRecurring: true,
      recurringExpenseId: template.id,
      generationKey: key,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (toAdd.length > 0) {
    await db.expenses.bulkAdd(toAdd);
  }
  return toAdd.length;
}
