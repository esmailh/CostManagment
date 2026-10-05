export interface Category {
  id: string;
  name: string;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A bank, person, or organization that issued a loan. */
export interface Lender {
  id: string;
  name: string;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpense {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  dayOfMonth: number;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  /** Persian (Jalali) year, e.g. 1405 */
  year: number;
  /** Persian month, 1–12 */
  month: number;
  /** Persian day, 1–31 */
  day: number;
  description: string;
  /** true when this expense was generated from a recurring template */
  isRecurring: boolean;
  recurringExpenseId: string | null;
  /** Set when this expense represents a paid loan installment. */
  loanId?: string | null;
  loanInstallmentId?: string | null;
  /**
   * Unique key used to guarantee a recurring template is generated at most once
   * per month. For recurring-generated expenses: `${recurringExpenseId}|${year}-${month}`.
   * For daily expenses: `d|${id}` (always unique).
   */
  generationKey: string;
  createdAt: string;
  updatedAt: string;
}

export type LoanMode = 'dated' | 'term';

export interface Loan {
  id: string;
  title: string;
  lenderId: string;
  /** Category used when a paid installment is recorded as an expense. */
  expenseCategoryId: string;
  mode: LoanMode;
  description: string;
  installmentCount: number;
  /** Sum of effective planned amounts; null when one or more amounts are unknown. */
  totalAmount: number | null;
  /** Optional amount inherited by installments without an explicit override. */
  defaultInstallmentAmount: number | null;
  /** Whether linked payment expenses participate in fixed-expense reports. */
  includeInFixedExpenses: boolean;
  /** Inclusive Jalali schedule boundaries; only present in dated mode. */
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  dueDay: number | null;
  /** Optional source metadata used by one-time/import migrations. */
  migrationSource?: string | null;
  migrationSourceId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoanInstallment {
  id: string;
  loanId: string;
  installmentNumber: number;
  /** Optional override; null means use the loan default, if one exists. */
  plannedAmount: number | null;
  /** Jalali due date; null for term-only loans. */
  dueYear: number | null;
  dueMonth: number | null;
  dueDay: number | null;
  isPaid: boolean;
  paidAmount: number | null;
  paidYear: number | null;
  paidMonth: number | null;
  paidDay: number | null;
  expenseId: string | null;
  createdAt: string;
  updatedAt: string;
}
