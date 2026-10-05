import { db } from './db';
import type { Category } from './types';
import { uuid } from '../lib/id';

const DEFAULT_CATEGORIES: Array<{ name: string; icon: string }> = [
  { name: 'مسکن', icon: '🏠' },
  { name: 'قبوض', icon: '🧾' },
  { name: 'خوراک', icon: '🍲' },
  { name: 'حمل و نقل', icon: '🚗' },
  { name: 'خرید', icon: '🛒' },
  { name: 'سلامت', icon: '🩺' },
  { name: 'تفریح', icon: '🎮' },
  { name: 'آموزش', icon: '📚' },
  { name: 'پوشاک', icon: '👕' },
  { name: 'اشتراک‌ها', icon: '🔁' },
  { name: 'اقساط', icon: '🏦' },
  { name: 'سایر', icon: '📦' },
];

/** Seed the 12 default categories on first launch only (idempotent). */
export async function seedDefaultCategories(): Promise<void> {
  const count = await db.categories.count();
  if (count > 0) return;

  const now = new Date().toISOString();
  const rows: Category[] = DEFAULT_CATEGORIES.map((c) => ({
    id: uuid(),
    name: c.name,
    icon: c.icon,
    createdAt: now,
    updatedAt: now,
  }));

  await db.categories.bulkAdd(rows);
}
