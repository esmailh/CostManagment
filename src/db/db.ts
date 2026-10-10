import Dexie, { type Table } from 'dexie';
import type { Category, Expense, Lender, Loan, LoanInstallment, RecurringExpense } from './types';

export class ExpenseTrackerDB extends Dexie {
  categories!: Table<Category, string>;
  recurringExpenses!: Table<RecurringExpense, string>;
  expenses!: Table<Expense, string>;
  lenders!: Table<Lender, string>;
  loans!: Table<Loan, string>;
  loanInstallments!: Table<LoanInstallment, string>;

  constructor() {
    super('expense-tracker');
    this.version(1).stores({
      categories: 'id, name',
      recurringExpenses: 'id, categoryId',
      expenses: 'id, categoryId, [year+month], &generationKey',
    });
    this.version(2).stores({
      categories: 'id, name',
      recurringExpenses: 'id, categoryId',
      expenses:
        'id, categoryId, [year+month], &generationKey, loanId, loanInstallmentId',
      loans: 'id, categoryId, mode',
      loanInstallments:
        'id, loanId, &[loanId+installmentNumber], [dueYear+dueMonth], isPaid, expenseId',
    });
    this.version(3).stores({
      categories: 'id, name',
      recurringExpenses: 'id, categoryId',
      expenses:
        'id, categoryId, [year+month], &generationKey, loanId, loanInstallmentId',
      lenders: 'id, name',
      loans: 'id, lenderId, expenseCategoryId, mode, migrationSourceId',
      loanInstallments:
        'id, loanId, &[loanId+installmentNumber], [dueYear+dueMonth], isPaid, expenseId',
    }).upgrade(async (tx) => {
      const now = new Date().toISOString();
      const lenderIds = new Set<string>();
      await tx.table('loans').toCollection().modify((loan) => {
        const legacyCategoryId = loan.categoryId as string | undefined;
        if (!loan.lenderId && legacyCategoryId) {
          loan.lenderId = `legacy-category-${legacyCategoryId}`;
          lenderIds.add(legacyCategoryId);
        }
        if (!loan.expenseCategoryId && legacyCategoryId) loan.expenseCategoryId = legacyCategoryId;
        delete loan.categoryId;
      });
      for (const categoryId of lenderIds) {
        const category = await tx.table('categories').get(categoryId);
        await tx.table('lenders').put({
          id: `legacy-category-${categoryId}`,
          name: category?.name ?? 'وام‌دهنده قدیمی',
          icon: category?.icon ?? '🏦',
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    this.version(4).stores({
      categories: 'id, name',
      recurringExpenses: 'id, categoryId',
      expenses:
        'id, categoryId, [year+month], &generationKey, loanId, loanInstallmentId',
      lenders: 'id, name',
      loans: 'id, lenderId, expenseCategoryId, mode, migrationSourceId',
      loanInstallments:
        'id, loanId, &[loanId+installmentNumber], [dueYear+dueMonth], isPaid, expenseId',
    }).upgrade(async (tx) => {
      const installments = await tx.table('loanInstallments').toArray();
      const byLoan = new Map<string, Array<{ plannedAmount?: number | null }>>();
      for (const installment of installments) {
        const items = byLoan.get(installment.loanId) ?? [];
        items.push(installment);
        byLoan.set(installment.loanId, items);
      }
      await tx.table('loans').toCollection().modify((loan) => {
        const items = byLoan.get(loan.id) ?? [];
        const known = items
          .map((item) => item.plannedAmount)
          .filter((amount): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount > 0);
        const common = known.length === items.length && known.length > 0 && known.every((amount) => amount === known[0])
          ? known[0] : null;
        loan.defaultInstallmentAmount = common;
        loan.includeInFixedExpenses = true;
        // A loan with no installments has an unknown total — never 0, which would
        // look like a real amount and fail backup validation.
        loan.totalAmount = items.length > 0 && known.length === items.length
          ? known.reduce((sum, amount) => sum + amount, 0)
          : null;
      });
      await tx.table('loanInstallments').toCollection().modify((installment) => {
        const items = byLoan.get(installment.loanId) ?? [];
        const known = items
          .map((item) => item.plannedAmount)
          .filter((amount): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount > 0);
        const hasCommon = known.length === items.length && known.length > 0 && known.every((amount) => amount === known[0]);
        if (hasCommon) installment.plannedAmount = null;
        else if (typeof installment.plannedAmount !== 'number' || installment.plannedAmount <= 0) installment.plannedAmount = null;
      });
    });
    this.version(5).stores({
      categories: 'id, name',
      recurringExpenses: 'id, categoryId',
      expenses:
        'id, categoryId, [year+month], &generationKey, loanId, loanInstallmentId',
      lenders: 'id, name',
      loans: 'id, lenderId, expenseCategoryId, mode, migrationSourceId',
      loanInstallments:
        'id, loanId, &[loanId+installmentNumber], [dueYear+dueMonth], isPaid, expenseId',
    }).upgrade(async (tx) => {
      // An earlier automatic migration turned recurring loan payments into loans
      // without any installment data. Those shells render as "0 installments / 0 of 0"
      // and cannot be restored from a backup, so they are removed and the user is
      // expected to record the loan properly through the loan form.
      const installments = await tx.table('loanInstallments').toArray();
      const rowsByLoan = new Map<string, number>();
      for (const installment of installments) {
        rowsByLoan.set(installment.loanId, (rowsByLoan.get(installment.loanId) ?? 0) + 1);
      }
      const expenses = await tx.table('expenses').toArray();
      const loansWithExpenses = new Set<string>();
      for (const expense of expenses) {
        if (expense.loanId) loansWithExpenses.add(expense.loanId);
      }
      const emptyLoanIds: string[] = [];
      await tx.table('loans').toCollection().modify((loan) => {
        if (loan.totalAmount === 0) loan.totalAmount = null;
        if (typeof loan.defaultInstallmentAmount === 'number' && loan.defaultInstallmentAmount <= 0) {
          loan.defaultInstallmentAmount = null;
        }
        if (typeof loan.includeInFixedExpenses !== 'boolean') loan.includeInFixedExpenses = true;
        const rows = rowsByLoan.get(loan.id) ?? 0;
        const count = Number.isFinite(loan.installmentCount) ? loan.installmentCount : 0;
        if (rows === 0 && count <= 0 && !loansWithExpenses.has(loan.id)) emptyLoanIds.push(loan.id);
      });
      if (emptyLoanIds.length > 0) await tx.table('loans').bulkDelete(emptyLoanIds);
    });
    this.version(6).stores({
      categories: 'id, name',
      recurringExpenses: 'id, categoryId',
      expenses:
        'id, categoryId, [year+month], &generationKey, loanId, loanInstallmentId',
      lenders: 'id, name',
      loans: 'id, lenderId, expenseCategoryId, mode, migrationSourceId',
      loanInstallments:
        'id, loanId, &[loanId+installmentNumber], [dueYear+dueMonth], isPaid, expenseId',
    }).upgrade(async (tx) => {
      await tx.table('loans').toCollection().modify((loan) => {
        // None of the existing loans carries interest data, and an unknown rate is honest where a
        // 0 would read as a real figure: backfill with null, never 0, exactly as version 5 did for
        // `totalAmount`. `'none'` says "no interest recorded", which the user can change per loan.
        loan.principal = null;
        loan.interestMode = 'none';
        loan.interestRateAnnual = null;
      });
    });
  }
}

export const db = new ExpenseTrackerDB();
