import { db } from '../db/db';
import type { Category, Expense, Lender, Loan, LoanInstallment, RecurringExpense } from '../db/types';
import { todayJalali } from '../lib/jalaali';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const BACKUP_VERSION = 4;

export interface BackupData {
  version: number;
  exportedAt: string;
  categories: Category[];
  recurringExpenses: RecurringExpense[];
  expenses: Expense[];
  /** Missing in legacy version-1 and version-2 backups. */
  lenders?: Lender[];
  /** Missing in legacy version-1 backups. */
  loans?: Loan[];
  /** Missing in legacy version-1 backups. */
  loanInstallments?: LoanInstallment[];
  settings: {
    theme: string | null;
    onboarded: string | null;
  };
}

export async function createBackup(): Promise<BackupData> {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: await db.categories.toArray(),
    recurringExpenses: await db.recurringExpenses.toArray(),
    expenses: await db.expenses.toArray(),
    lenders: await db.lenders.toArray(),
    loans: await db.loans.toArray(),
    loanInstallments: await db.loanInstallments.toArray(),
    settings: {
      theme: localStorage.getItem('expense-tracker:theme'),
      onboarded: localStorage.getItem('expense-tracker:onboarded'),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Loan amounts may legitimately be unknown. Older exports also wrote a literal 0
 * for "not recorded", which must not make a file impossible to restore.
 */
function isOptionalMoney(value: unknown): boolean {
  return value === null || value === undefined || value === 0 || isPositiveMoney(value);
}

/** Normalises the legacy "0 means unknown" convention to null. */
function zeroToNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Validate a parsed JSON object against the backup schema. */
export function validateBackup(data: unknown): data is BackupData {
  if (!isRecord(data)) return false;
  const d = data as Partial<BackupData>;
  if (![1, 2, 3, BACKUP_VERSION].includes(d.version ?? -1)) return false;
  const version = d.version as number;
  if (!Array.isArray(d.categories) || !Array.isArray(d.recurringExpenses) || !Array.isArray(d.expenses)) {
    return false;
  }
  // v1 predates loans, v2 has category-based loans, and v3 introduced lenders.
  if (version >= 2 && (!Array.isArray(d.loans) || !Array.isArray(d.loanInstallments))) {
    return false;
  }
  if (version >= 3 && !Array.isArray(d.lenders)) {
    return false;
  }
  if (d.lenders !== undefined && !Array.isArray(d.lenders)) return false;
  if (d.loans !== undefined && !Array.isArray(d.loans)) return false;
  if (d.loanInstallments !== undefined && !Array.isArray(d.loanInstallments)) return false;
  if (d.settings !== undefined) {
    if (typeof d.settings !== 'object' || d.settings === null) return false;
    if (d.settings.theme !== null && !['light', 'dark', 'system'].includes(d.settings.theme)) return false;
    if (d.settings.onboarded !== null && d.settings.onboarded !== '1') return false;
  }

  for (const c of d.categories) {
    if (!isRecord(c)) return false;
    if (typeof c.id !== 'string' || typeof c.name !== 'string') return false;
  }
  for (const r of d.recurringExpenses) {
    if (!isRecord(r)) return false;
    if (typeof r.id !== 'string' || typeof r.title !== 'string') return false;
    if (!isPositiveMoney(r.amount)) return false;
    if (typeof r.categoryId !== 'string' || typeof r.dayOfMonth !== 'number') return false;
  }
  for (const e of d.expenses) {
    if (!isRecord(e)) return false;
    if (typeof e.id !== 'string' || typeof e.title !== 'string') return false;
    if (!isPositiveMoney(e.amount)) return false;
    if (typeof e.categoryId !== 'string') return false;
    if (typeof e.year !== 'number' || typeof e.month !== 'number' || typeof e.day !== 'number') return false;
    if (typeof e.isRecurring !== 'boolean' || typeof e.generationKey !== 'string') return false;
  }
  for (const lender of d.lenders ?? []) {
    if (!isRecord(lender)) return false;
    if (typeof lender.id !== 'string' || typeof lender.name !== 'string') return false;
  }
  for (const loan of d.loans ?? []) {
    if (!isRecord(loan)) return false;
    if (typeof loan.id !== 'string' || typeof loan.title !== 'string') return false;
    const candidate = loan as unknown as Loan & { categoryId?: string };
    if (version >= 3) {
      if (typeof candidate.lenderId !== 'string' || typeof candidate.expenseCategoryId !== 'string') return false;
    } else if (typeof candidate.categoryId !== 'string') return false;
    if (!['dated', 'term'].includes(candidate.mode)) return false;
    if (!Number.isInteger(loan.installmentCount) || loan.installmentCount < 0) return false;
    if (!isOptionalMoney(loan.totalAmount)) return false;
    if (loan.defaultInstallmentAmount !== undefined && !isOptionalMoney(loan.defaultInstallmentAmount)) return false;
    if (loan.includeInFixedExpenses !== undefined && typeof loan.includeInFixedExpenses !== 'boolean') return false;
    if (loan.mode === 'dated') {
      if (!Number.isInteger(loan.startYear) || !Number.isInteger(loan.startMonth)) return false;
      if (!Number.isInteger(loan.endYear) || !Number.isInteger(loan.endMonth)) return false;
      if (!Number.isInteger(loan.dueDay)) return false;
    }
  }
  for (const installment of d.loanInstallments ?? []) {
    if (!isRecord(installment)) return false;
    if (typeof installment.id !== 'string' || typeof installment.loanId !== 'string') return false;
    if (!Number.isInteger(installment.installmentNumber) || installment.installmentNumber <= 0) return false;
    if (!isOptionalMoney(installment.plannedAmount)) return false;
    if (typeof installment.isPaid !== 'boolean') return false;
    if (!isOptionalMoney(installment.paidAmount)) return false;
    if (installment.expenseId !== null && typeof installment.expenseId !== 'string') return false;
  }
  return true;
}

export type ImportMode = 'merge' | 'replace';

/** Replace clears all tables first; merge unions by id (UUIDs prevent collisions). */
export async function importBackup(data: BackupData, mode: ImportMode): Promise<void> {
  const categoriesById = new Map(data.categories.map((category) => [category.id, category]));
  const importedLenders = [...(data.lenders ?? [])];
  const installmentsByLoan = new Map<string, LoanInstallment[]>();
  for (const installment of data.loanInstallments ?? []) {
    const items = installmentsByLoan.get(installment.loanId) ?? [];
    items.push(installment);
    installmentsByLoan.set(installment.loanId, items);
  }
  const commonDefaults = new Map<string, number | null>();
  if (data.version < BACKUP_VERSION) {
    for (const [loanId, items] of installmentsByLoan) {
      const knownPlannedAmounts = items.map((item) => item.plannedAmount)
        .filter((amount): amount is number => isPositiveMoney(amount));
      commonDefaults.set(
        loanId,
        knownPlannedAmounts.length === items.length
          && knownPlannedAmounts.length > 0
          && knownPlannedAmounts.every((amount) => amount === knownPlannedAmounts[0])
          ? knownPlannedAmounts[0]
          : null,
      );
    }
  }
  const importedLoans = (data.loans ?? []).map((loan) => {
    const legacy = loan as Loan & { categoryId?: string };
    const normalized = {
      ...loan,
      totalAmount: zeroToNull(loan.totalAmount),
      defaultInstallmentAmount: data.version === BACKUP_VERSION
        ? zeroToNull(loan.defaultInstallmentAmount)
        : commonDefaults.get(loan.id) ?? null,
      includeInFixedExpenses: loan.includeInFixedExpenses ?? true,
    } as Loan;
    if (legacy.lenderId && legacy.expenseCategoryId) return normalized;
    const categoryId = legacy.categoryId;
    if (!categoryId) throw new Error('دسته‌بندی وام قدیمی نامعتبر است.');
    const lenderId = `legacy-category-${categoryId}`;
    if (!importedLenders.some((lender) => lender.id === lenderId)) {
      const category = categoriesById.get(categoryId);
      const timestamp = legacy.createdAt || new Date().toISOString();
      importedLenders.push({
        id: lenderId,
        name: category?.name ?? 'وام‌دهنده قدیمی',
        icon: category?.icon ?? '🏦',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    const { categoryId: _categoryId, ...rest } = legacy;
    return { ...rest, lenderId, expenseCategoryId: categoryId,
      defaultInstallmentAmount: normalized.defaultInstallmentAmount,
      includeInFixedExpenses: normalized.includeInFixedExpenses } as Loan;
  });
  const importedInstallments = (data.loanInstallments ?? []).map((installment) => ({
    ...installment,
    plannedAmount: data.version < BACKUP_VERSION && commonDefaults.get(installment.loanId) != null
      ? null
      : installment.plannedAmount,
  }));
  // Shells left behind by the older automatic migration carry no installments and no
  // count. Restoring them would only reproduce the "0 of 0" cards, so they are dropped.
  const restoredLoans = importedLoans.filter((loan) => loan.installmentCount > 0);
  const restoredLoanIds = new Set(restoredLoans.map((loan) => loan.id));
  const restoredInstallments = importedInstallments.filter((item) => restoredLoanIds.has(item.loanId));

  await db.transaction(
    'rw',
    [db.categories, db.recurringExpenses, db.expenses, db.lenders, db.loans, db.loanInstallments],
    async () => {
    if (mode === 'replace') {
      await db.loanInstallments.clear();
      await db.expenses.clear();
      await db.loans.clear();
      await db.lenders.clear();
      await db.recurringExpenses.clear();
      await db.categories.clear();
    }
    await db.categories.bulkPut(data.categories);
    await db.recurringExpenses.bulkPut(data.recurringExpenses);
    await db.expenses.bulkPut(data.expenses);
    await db.lenders.bulkPut(importedLenders);
    await db.loans.bulkPut(restoredLoans);
    await db.loanInstallments.bulkPut(restoredInstallments);
    },
  );
  if (data.settings) {
    if (data.settings.theme) localStorage.setItem('expense-tracker:theme', data.settings.theme);
    if (data.settings.onboarded) localStorage.setItem('expense-tracker:onboarded', data.settings.onboarded);
  }
}

export async function resetAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.categories, db.recurringExpenses, db.expenses, db.lenders, db.loans, db.loanInstallments],
    async () => {
    await db.loanInstallments.clear();
    await db.expenses.clear();
    await db.loans.clear();
    await db.lenders.clear();
    await db.recurringExpenses.clear();
    await db.categories.clear();
    },
  );
}

/** Trigger a browser download of the backup JSON file. */
export async function downloadBackup(data: BackupData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const today = todayJalali();
  const filename = `expense-tracker-backup-${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}.json`;

  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: 'پشتیبان مدیریت هزینه', url: file.uri, dialogTitle: 'ذخیره یا ارسال پشتیبان' });
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
