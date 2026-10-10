import { db } from '../db/db';
import type { Category, Expense, Lender, Loan, LoanInstallment, RecurringExpense } from '../db/types';

const MIGRATION_SOURCE = 'recurringExpense';
const INSTALLMENT_CATEGORY_NAME = 'اقساط';

/** Verified recurring records from the production-phone export. Rent is deliberately absent. */
const VERIFIED_LOAN_SOURCE_IDS = new Set([
  '1d8756ea-560a-4495-9c3e-72b0620b7b6d', // وام ملت
  '383ced3a-daf4-4c4b-af7b-d8c80537509b', // وام ازدواج
  '423a2592-5d54-4b9f-810a-f787db1f5f49', // وام بلو
  'aa396d7f-0d3e-4a8e-94bd-6acf61a3d4c6', // قسط وام مهربانی
  'b5096193-3006-4e1e-a440-c7164eea60c0', // وام مسکن
]);

const VERIFIED_LENDER_NAMES: Record<string, string> = {
  '1d8756ea-560a-4495-9c3e-72b0620b7b6d': 'بانک ملت',
  '383ced3a-daf4-4c4b-af7b-d8c80537509b': 'وام‌دهنده نامشخص',
  '423a2592-5d54-4b9f-810a-f787db1f5f49': 'بلو بانک',
  'aa396d7f-0d3e-4a8e-94bd-6acf61a3d4c6': 'بانک مهر ایران',
  'b5096193-3006-4e1e-a440-c7164eea60c0': 'بانک مسکن',
};

export interface LoanMigrationReport {
  migratedSourceIds: string[];
  loansCreated: number;
  lendersCreated: number;
  installmentsCreated: number;
  expensesLinked: number;
  recurringSourcesDeactivated: number;
  alreadyMigrated: number;
  /** Sources with no historical payments: no loan can be derived, so they are left alone. */
  skippedSourceIds: string[];
}

export function normalizePersian(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa-IR');
}

function deterministicId(kind: string, sourceId: string): string {
  return `migration-${kind}-${sourceId}`;
}

function byJalaliDate(a: Expense, b: Expense): number {
  return a.year - b.year || a.month - b.month || a.day - b.day || a.createdAt.localeCompare(b.createdAt);
}

async function findOrCreateInstallmentCategory(now: string): Promise<Category> {
  const categories = await db.categories.toArray();
  const existing = categories.find((item) => normalizePersian(item.name) === normalizePersian(INSTALLMENT_CATEGORY_NAME));
  if (existing) return existing;

  const category: Category = {
    id: deterministicId('category', 'installments'),
    name: INSTALLMENT_CATEGORY_NAME,
    icon: '💳',
    createdAt: now,
    updatedAt: now,
  };
  await db.categories.put(category);
  return category;
}

async function findOrCreateLender(
  source: RecurringExpense,
  now: string,
  report: LoanMigrationReport,
): Promise<Lender> {
  const name = VERIFIED_LENDER_NAMES[source.id] ?? 'وام‌دهنده نامشخص';
  const lenders = await db.lenders.toArray();
  const existing = lenders.find((item) => normalizePersian(item.name) === normalizePersian(name));
  if (existing) return existing;

  const lender: Lender = {
    id: deterministicId('lender', normalizePersian(name)),
    name,
    icon: '🏦',
    createdAt: now,
    updatedAt: now,
  };
  await db.lenders.put(lender);
  report.lendersCreated += 1;
  return lender;
}

/**
 * Converts only the five recurring sources verified in the phone export.
 * Historical expense rows are patched in place: IDs, generation keys, amounts,
 * dates, descriptions, and timestamps are preserved. Unknown future terms are
 * intentionally not invented; the migrated loan contains only observed payments.
 */
export async function migrateVerifiedRecurringLoans(): Promise<LoanMigrationReport> {
  const report: LoanMigrationReport = {
    migratedSourceIds: [],
    loansCreated: 0,
    lendersCreated: 0,
    installmentsCreated: 0,
    expensesLinked: 0,
    recurringSourcesDeactivated: 0,
    alreadyMigrated: 0,
    skippedSourceIds: [],
  };

  await db.transaction(
    'rw',
    [db.categories, db.recurringExpenses, db.expenses, db.lenders, db.loans, db.loanInstallments],
    async () => {
      const now = new Date().toISOString();
      const sources = (await db.recurringExpenses.bulkGet([...VERIFIED_LOAN_SOURCE_IDS]))
        .filter((source): source is RecurringExpense => Boolean(source));
      if (sources.length === 0) return;

      const installmentCategory = await findOrCreateInstallmentCategory(now);

      for (const source of sources) {
        const normalizedTitle = normalizePersian(source.title);
        if (normalizedTitle.includes('اجاره') || normalizedTitle.includes('کرایه')) continue;

        const historicalExpenses = (await db.expenses
          .filter((expense) => expense.recurringExpenseId === source.id)
          .toArray())
          .sort(byJalaliDate);
        if (historicalExpenses.length === 0) {
          // Nothing observed to convert. An empty loan shell would render as
          // "0 installments / 0 of 0" and could not be exported to a backup, so the
          // recurring source is deliberately left untouched — active or inactive as
          // the user left it — and any previously created empty shell is removed.
          const staleLoan = await db.loans.where('migrationSourceId').equals(source.id).first();
          if (staleLoan) {
            const rows = await db.loanInstallments.where('loanId').equals(staleLoan.id).count();
            if (rows === 0) await db.loans.delete(staleLoan.id);
          }
          report.skippedSourceIds.push(source.id);
          continue;
        }
        const existingLoan = await db.loans.where('migrationSourceId').equals(source.id).first();
        const loanId = existingLoan?.id ?? deterministicId('loan', source.id);
        const lender = await findOrCreateLender(source, now, report);
        const first = historicalExpenses[0];
        const last = historicalExpenses[historicalExpenses.length - 1];

        const loan: Loan = {
          id: loanId,
          title: source.title,
          lenderId: lender.id,
          expenseCategoryId: installmentCategory.id,
          mode: 'dated',
          description: 'انتقال خودکار از پرداخت ثابت؛ مدت و اقساط آینده در داده‌های قبلی مشخص نبوده است.',
          installmentCount: historicalExpenses.length,
          // The recurring record carries the contractual installment amount. The
          // number of remaining terms is unknown, so the total stays underived
          // until the user completes the loan through the loan form.
          totalAmount: null,
          // The recurring record says what was paid, never what was borrowed, and nothing here
          // knows whether the loan carried interest.
          principal: null,
          interestMode: 'none',
          interestRateAnnual: null,
          defaultInstallmentAmount: typeof source.amount === 'number' && Number.isFinite(source.amount) && source.amount > 0
            ? source.amount
            : null,
          includeInFixedExpenses: true,
          startYear: first?.year ?? null,
          startMonth: first?.month ?? null,
          endYear: last?.year ?? null,
          endMonth: last?.month ?? null,
          dueDay: source.dayOfMonth ?? first?.day ?? null,
          migrationSource: MIGRATION_SOURCE,
          migrationSourceId: source.id,
          createdAt: existingLoan?.createdAt ?? source.createdAt ?? now,
          updatedAt: existingLoan?.updatedAt ?? now,
        };
        await db.loans.put(loan);
        if (existingLoan) report.alreadyMigrated += 1;
        else report.loansCreated += 1;

        for (const [index, expense] of historicalExpenses.entries()) {
          const installmentId = expense.loanInstallmentId ?? deterministicId('installment', expense.id);
          const existingInstallment = await db.loanInstallments.get(installmentId);
          const installment: LoanInstallment = {
            id: installmentId,
            loanId,
            installmentNumber: index + 1,
            plannedAmount: null,
            dueYear: expense.year,
            dueMonth: expense.month,
            dueDay: expense.day,
            isPaid: true,
            paidAmount: expense.amount,
            paidYear: expense.year,
            paidMonth: expense.month,
            paidDay: expense.day,
            expenseId: expense.id,
            createdAt: existingInstallment?.createdAt ?? expense.createdAt,
            updatedAt: existingInstallment?.updatedAt ?? expense.updatedAt,
          };
          await db.loanInstallments.put(installment);
          if (!existingInstallment) report.installmentsCreated += 1;

          if (expense.loanId !== loanId || expense.loanInstallmentId !== installmentId) {
            await db.expenses.update(expense.id, { loanId, loanInstallmentId: installmentId });
            report.expensesLinked += 1;
          }
        }

        if (source.isActive) {
          await db.recurringExpenses.update(source.id, { isActive: false, updatedAt: now });
          report.recurringSourcesDeactivated += 1;
        }
        report.migratedSourceIds.push(source.id);
      }
    },
  );

  return report;
}
