import { db } from '../db/db';
import type { Lender } from '../db/types';
import { uuid } from '../lib/id';

export async function addLender(name: string, icon: string | null = '🏦'): Promise<Lender> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('نام بانک یا وام‌دهنده را وارد کنید.');
  const duplicate = await db.lenders.filter((item) => item.name.trim() === trimmed).first();
  if (duplicate) return duplicate;
  const now = new Date().toISOString();
  const lender: Lender = { id: uuid(), name: trimmed, icon, createdAt: now, updatedAt: now };
  await db.lenders.add(lender);
  return lender;
}

export async function deleteLender(id: string): Promise<boolean> {
  if (await db.loans.where('lenderId').equals(id).count()) return false;
  await db.lenders.delete(id);
  return true;
}

export async function updateLender(
  id: string,
  patch: Partial<Pick<Lender, 'name' | 'icon'>>,
): Promise<void> {
  const lender = await db.lenders.get(id);
  if (!lender) throw new Error('بانک یا وام‌دهنده پیدا نشد.');

  const name = patch.name === undefined ? lender.name : patch.name.trim();
  if (!name) throw new Error('نام بانک یا وام‌دهنده را وارد کنید.');

  const duplicate = await db.lenders
    .filter((item) => item.id !== id && item.name.trim() === name)
    .first();
  if (duplicate) throw new Error('بانک یا وام‌دهنده‌ای با این نام وجود دارد.');

  await db.lenders.update(id, {
    name,
    icon: patch.icon === undefined ? lender.icon : patch.icon,
    updatedAt: new Date().toISOString(),
  });
}