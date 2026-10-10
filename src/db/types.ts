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

/**
 * How a loan's interest rate is arrived at: the user says there is none, types one in, or lets the
 * app solve it from the principal, the installment amount and the installment count.
 */
export type LoanInterestMode = 'none' | 'manual' | 'auto';

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
  /**
   * The amount actually borrowed — the principal `P` of the annuity equation. Deliberately kept
   * apart from `totalAmount`, which is the sum of the installments and so answers a different
   * question. For an interest-bearing loan the two differ (Mellat: a 500,000,000 principal repaid
   * as 60 × 14,095,000), and feeding the repayment total in as the principal would solve to a
   * 0% rate — a wrong answer that still looks plausible.
   */
  principal: number | null;
  /** How this loan's interest is determined. */
  interestMode: LoanInterestMode;
  /**
   * Annual interest rate in percent, exactly as the user typed it (23 for ۲۳٪), so editing the
   * loan shows the same number back. Set only in 'manual' mode; 'auto' stores nothing and
   * re-solves the rate from the loan's own numbers, so it can never go stale behind an edit.
   */
  interestRateAnnual: number | null;
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
