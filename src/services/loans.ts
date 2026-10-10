import { db } from '../db/db';
import type { Expense, Loan, LoanInstallment, LoanInterestMode, LoanMode } from '../db/types';
import type { LoanInterestInfo } from '../lib/interest';
import { resolveLoanInterest } from '../lib/interest';
import { monthLength, nextMonth, shiftMonth, todayJalali, type JalaliDate } from '../lib/jalaali';
import { uuid } from '../lib/id';

export interface LoanInput {
  title: string;
  lenderId: string;
  expenseCategoryId: string;
  mode: LoanMode;
  description?: string;
  /** Required for term loans. A dated loan derives it from its start/end months when absent. */
  installmentCount: number;
  defaultInstallmentAmount?: number | null;
  /** Optional explicit total. Derived from effective installments when omitted. */
  totalAmount?: number | null;
  /** The amount borrowed, used as `P` when the interest rate is solved. See `Loan.principal`. */
  principal?: number | null;
  /** Defaults to 'none' — a loan is assumed to carry no interest until the user says otherwise. */
  interestMode?: LoanInterestMode;
  /** Annual rate in percent, as typed. Required when `interestMode` is 'manual'. */
  interestRateAnnual?: number | null;
  /** Per-installment overrides. Missing/null entries inherit the default. */
  installmentAmounts?: Array<number | null>;
  includeInFixedExpenses: boolean;
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
  dueDay?: number;
  historicalPayments?: HistoricalPaymentInput[];
  /** For term-only loans, mark the first N installments paid at their effective amount. */
  paidCount?: number;
}

export type LoanUpdateInput = Omit<LoanInput, 'historicalPayments'>;

export interface HistoricalPaymentInput {
  installmentNumber: number;
  amount?: number | null;
  paidDate: JalaliDate;
}

export interface LoanSummary {
  /** The loan's own stated total: the figure the user entered, else the sum of the schedule. */
  totalAmount: number | null;
  /** Sum of every installment's effective amount, when all of them are known. */
  scheduledTotal: number | null;
  /** The amount borrowed, as the user recorded it. Never derived from the schedule. */
  principal: number | null;
  /** Solved, typed or absent — null when the loan carries no interest. */
  interest: LoanInterestInfo | null;
  paidCount: number;
  remainingCount: number;
  paidAmount: number | null;
  remainingAmount: number | null;
  /** Share of *installments* paid. Money is deliberately not part of this. */
  progress: number | null;
}

function normalizeOptionalAmount(amount: number | null | undefined, label: string): number | null {
  if (amount === null || amount === undefined) return null;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} باید بیشتر از صفر باشد.`);
  }
  return amount;
}

/**
 * A rate cannot be normalised as an amount: 0 is not "unknown" here, it is a loan with no
 * interest, so `normalizeOptionalAmount`'s rejection of zero would make ۰٪ impossible to record.
 */
function normalizeOptionalRate(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined) return null;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('نرخ سود باید عددی نامنفی باشد.');
  }
  return amount;
}

/**
 * Validates the requested interest mode against the numbers it depends on. A solved rate needs
 * both sides of the equation, and saying so at save time is better than leaving a loan that
 * quietly shows «نامشخص» wherever its rate should be.
 */
function normalizeInterestMode(
  input: Pick<LoanUpdateInput, 'interestMode'>,
  principal: number | null,
  defaultAmount: number | null,
  amounts: Array<number | null>,
): LoanInterestMode {
  const mode = input.interestMode ?? 'none';
  if (mode === 'auto' && principal === null) {
    throw new Error('برای محاسبه خودکار سود، مبلغ اصل وام را وارد کنید.');
  }
  if (mode === 'auto' && defaultAmount === null && amounts.every((amount) => amount === null)) {
    throw new Error('برای محاسبه خودکار سود، مبلغ هر قسط را مشخص کنید.');
  }
  return mode;
}

function normalizedAmounts(input: LoanUpdateInput): Array<number | null> {
  if (!Number.isInteger(input.installmentCount) || input.installmentCount < 1 || input.installmentCount > 120) {
    throw new Error('تعداد اقساط باید بین ۱ تا ۱۲۰ باشد.');
  }
  const supplied = input.installmentAmounts ?? [];
  if (supplied.length > input.installmentCount) throw new Error('تعداد مبالغ اقساط معتبر نیست.');
  return Array.from({ length: input.installmentCount }, (_, index) =>
    normalizeOptionalAmount(supplied[index], `مبلغ قسط ${index + 1}`));
}

function effectiveAmount(loan: Pick<Loan, 'defaultInstallmentAmount'>, installment: Pick<LoanInstallment, 'plannedAmount'>): number | null {
  return installment.plannedAmount ?? loan.defaultInstallmentAmount;
}

function totalOfEffective(defaultAmount: number | null, overrides: Array<number | null>): number | null {
  const effective = overrides.map((amount) => amount ?? defaultAmount);
  return effective.every((amount): amount is number => amount !== null)
    ? effective.reduce((sum, amount) => sum + amount, 0)
    : null;
}

function datedSchedule(input: LoanUpdateInput): JalaliDate[] {
  const { startYear, startMonth, endYear, endMonth, dueDay } = input;
  if (!startYear || !startMonth || !endYear || !endMonth || !dueDay) {
    throw new Error('بازه و روز سررسید وام را کامل کنید.');
  }
  if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12 || dueDay < 1 || dueDay > 31) {
    throw new Error('تاریخ واردشده معتبر نیست.');
  }
  if (startYear * 12 + startMonth > endYear * 12 + endMonth) {
    throw new Error('ماه پایان نمی‌تواند قبل از ماه شروع باشد.');
  }

  const result: JalaliDate[] = [];
  let cursor = { year: startYear, month: startMonth };
  while (cursor.year * 12 + cursor.month <= endYear * 12 + endMonth) {
    result.push({
      ...cursor,
      day: Math.min(dueDay, monthLength(cursor.year, cursor.month)),
    });
    cursor = nextMonth(cursor.year, cursor.month);
  }
  return result;
}

/**
 * A dated loan whose installment count the user left empty takes its count from the months in
 * its own range: the user defines the window (ماه شروع … ماه پایان) and the app works out how
 * many installments fit in it. A term-only loan has no range to read, so its count is required.
 */
function resolveInstallmentCount(input: LoanUpdateInput): LoanUpdateInput {
  if (Number.isInteger(input.installmentCount) && input.installmentCount >= 1) return input;
  if (input.mode !== 'dated') throw new Error('تعداد اقساط باید بین ۱ تا ۱۲۰ باشد.');
  return { ...input, installmentCount: datedSchedule(input).length };
}

function buildSchedule(input: LoanUpdateInput): Array<JalaliDate | null> {
  if (!Number.isInteger(input.installmentCount) || input.installmentCount < 1 || input.installmentCount > 120) {
    throw new Error('تعداد اقساط باید بین ۱ تا ۱۲۰ باشد.');
  }
  if (input.mode === 'term') {
    // A term-only loan carries no explicit schedule, so the installments the user has
    // already paid anchor it: the schedule is laid out so that the last paid one falls
    // due in the current month. Reading that count as a schedule starting from the
    // current month would date every payment made so far — and the expense booked for
    // it — in the future. That is only right while nothing has been paid yet, where the
    // first installment is simply due next month.
    const requested = input.paidCount ?? 0;
    const paidCount = Number.isInteger(requested) && requested > 0
      ? Math.min(requested, input.installmentCount)
      : 0;
    const today = todayJalali();
    let cursor = shiftMonth(today.year, today.month, paidCount > 0 ? 1 - paidCount : 1);
    const dates: JalaliDate[] = [];
    for (let i = 0; i < input.installmentCount; i += 1) {
      dates.push({ ...cursor, day: 1 });
      cursor = nextMonth(cursor.year, cursor.month);
    }
    return dates;
  }
  const schedule = datedSchedule(input);
  if (schedule.length !== input.installmentCount) {
    throw new Error('تعداد اقساط باید با ماه‌های بازه وام برابر باشد.');
  }
  return schedule;
}

function validateDate(date: JalaliDate, label = 'تاریخ پرداخت'): void {
  if (!Number.isInteger(date.year) || date.year < 1200 || date.year > 1600
    || !Number.isInteger(date.month) || date.month < 1 || date.month > 12
    || !Number.isInteger(date.day) || date.day < 1 || date.day > monthLength(date.year, date.month)) {
    throw new Error(`${label} معتبر نیست.`);
  }
}

/** Whether `date` falls in a later month than `reference`. */
function isLaterMonth(date: JalaliDate, reference: JalaliDate): boolean {
  return date.year * 12 + date.month > reference.year * 12 + reference.month;
}

/**
 * The date a payment is booked at. A payment recorded just now follows its
 * installment's due date, and one already recorded keeps its own date so that merely
 * editing a loan never moves past expenses. A date beyond both today and the due date
 * is the exception: nothing already paid can be dated after the day it was due, and a
 * term loan used to produce exactly that when its paid count was read as a schedule
 * starting from the current month. Such a payment follows the corrected due date, so
 * its expense lands in the month the installment belongs to.
 */
function resolvePaymentDate(
  previous: JalaliDate | null,
  due: JalaliDate | null,
  fallback: JalaliDate,
  isNewPayment: boolean,
): JalaliDate {
  if (isNewPayment || !previous || !due) return due ?? fallback;
  if (isLaterMonth(previous, fallback) && isLaterMonth(previous, due)) return due;
  return previous;
}

/** For a dated loan the user left open, installments up to the current month count as paid. */
function resolvePaidCount(
  input: Pick<LoanInput, 'mode' | 'paidCount' | 'installmentCount' | 'startYear' | 'startMonth'>,
): number {
  if (input.mode === 'dated' && input.paidCount === undefined && input.startYear && input.startMonth) {
    const current = todayJalali();
    return Math.max(0, Math.min(input.installmentCount,
      (current.year - input.startYear) * 12 + current.month - input.startMonth + 1));
  }
  const paidCount = input.paidCount ?? 0;
  if (!Number.isInteger(paidCount) || paidCount < 0 || paidCount > input.installmentCount) {
    throw new Error('تعداد اقساط پرداخت‌شده نمی‌تواند بیشتر از تعداد کل اقساط باشد.');
  }
  return paidCount;
}

/**
 * The interest figures for a loan, or null when it carries none. The installment used in the
 * equation is the schedule's average rather than the loan default, so that `A × n` is exactly the
 * «جمع اقساط» shown beside it and the two never appear to disagree; a loan with no known amounts
 * falls back to its default. A rate the app solved is always recomputed here, never read back from
 * storage, so editing an installment cannot leave a stale rate on the card.
 */
function loanInterestOf(
  loan: Loan,
  installments: LoanInstallment[],
  count: number,
  scheduledTotal: number | null,
): LoanInterestInfo | null {
  const mode = loan.interestMode ?? 'none';
  if (mode === 'none') return null;
  const amounts = installments.map((item) => effectiveAmount(loan, item));
  return resolveLoanInterest({
    mode,
    principal: loan.principal ?? null,
    installmentAmount: scheduledTotal !== null && count > 0
      ? scheduledTotal / count
      : loan.defaultInstallmentAmount,
    installmentCount: count,
    annualRatePercent: loan.interestRateAnnual ?? null,
    // The annuity equation assumes equal payments. A loan with an override (Mellat's first
    // installment is 14,109,133 against a 14,095,000 default) has no single rate, so the solved
    // figure is an approximation and says so rather than pretending to more precision. Compared
    // against the schedule's own first amount, not against the loan default: a loan whose default
    // is null but whose installments all carry the same explicit amount is a level annuity too, and
    // comparing each amount to a null default flagged every one of them as different.
    approximate: amounts.length > 0 && amounts.some((amount) => amount !== amounts[0]),
  });
}

export function calculateLoanSummary(loan: Loan, installments: LoanInstallment[]): LoanSummary {
  const planned = installments.map((item) => effectiveAmount(loan, item));
  const scheduledTotal = planned.every((amount): amount is number => amount !== null)
    ? planned.reduce((sum, amount) => sum + amount, 0) : null;
  // A stored total of 0 is a legacy artefact (a loan recorded without any amounts);
  // fall back to the derived sum so the card never claims a real zero total.
  const totalAmount = loan.totalAmount !== null && loan.totalAmount > 0 ? loan.totalAmount : scheduledTotal;
  const paid = installments.filter((item) => item.isPaid);
  const paidAmount = paid.every((item) => item.paidAmount !== null)
    ? paid.reduce((sum, item) => sum + item.paidAmount!, 0) : null;
  // Progress counts installments, never money. The installments of an interest-bearing loan add
  // up to more than the principal the user typed (Mellat: 60 × 14,095,000 against a 500,000,000
  // principal), so a paid-over-principal ratio passes 100% while installments still remain —
  // which is how a loan with 23 terms left came to read "۱۰۰٪".
  const count = loan.installmentCount > 0 ? loan.installmentCount : installments.length;
  // What is still owed is likewise measured against the schedule, not the principal.
  const repaymentTotal = scheduledTotal ?? totalAmount;
  return {
    totalAmount,
    scheduledTotal,
    principal: loan.principal ?? null,
    interest: loanInterestOf(loan, installments, count, scheduledTotal),
    paidCount: paid.length,
    remainingCount: Math.max(0, count - paid.length),
    paidAmount,
    remainingAmount: repaymentTotal !== null && paidAmount !== null
      ? Math.max(0, repaymentTotal - paidAmount) : null,
    progress: count > 0 ? Math.min(100, (paid.length / count) * 100) : null,
  };
}

const LOAN_EXPENSE_PREFIX = 'loan';

function linkKey(loanId: string, installmentId: string): string {
  return `${LOAN_EXPENSE_PREFIX}|${loanId}|${installmentId}`;
}

/**
 * The installment a loan expense pays, read from its back-reference or, failing that, from its
 * generation key. The forward link (`loanInstallmentId`) is the one that survives on device, so
 * it is what every lookup here resolves from.
 */
function linkedInstallmentId(expense: Expense): string | null {
  if (expense.loanInstallmentId) return expense.loanInstallmentId;
  const parts = expense.generationKey.split('|');
  return parts.length === 3 && parts[0] === LOAN_EXPENSE_PREFIX ? parts[2] : null;
}

/** Every expense belonging to a loan, grouped by the installment it pays. */
async function expensesByInstallment(loanId: string): Promise<Map<string, Expense[]>> {
  const rows = await db.expenses.where('loanId').equals(loanId).toArray();
  const grouped = new Map<string, Expense[]>();
  for (const row of rows) {
    const installmentId = linkedInstallmentId(row);
    if (!installmentId) continue;
    grouped.set(installmentId, [...(grouped.get(installmentId) ?? []), row]);
  }
  return grouped;
}

/**
 * The expense that books one paid installment in its own month. `expenseId`, `generationKey` and
 * `createdAt` are supplied by the caller from the expense the installment already owns: the
 * generation key is unique per installment, so reusing an existing row updates it, while minting
 * a fresh id for an installment that already has one violates the index and rolls the save back.
 */
function paymentExpense(
  loan: Loan,
  installment: LoanInstallment,
  date: JalaliDate,
  amount: number,
  expenseId: string,
  generationKey: string,
  createdAt: string,
): Expense {
  return {
    id: expenseId,
    title: `قسط ${installment.installmentNumber} - ${loan.title}`,
    amount,
    categoryId: loan.expenseCategoryId,
    year: date.year,
    month: date.month,
    day: Math.min(date.day, monthLength(date.year, date.month)),
    description: loan.description,
    // Loan installments are intentionally reported as fixed expenses.
    isRecurring: loan.includeInFixedExpenses,
    recurringExpenseId: null,
    loanId: loan.id,
    loanInstallmentId: installment.id,
    generationKey,
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}

export async function addLoan(input: LoanInput): Promise<Loan> {
  const resolved = resolveInstallmentCount(input);
  const title = resolved.title.trim();
  if (!title) throw new Error('عنوان وام را وارد کنید.');
  if (!resolved.lenderId) throw new Error('بانک یا وام‌دهنده را انتخاب کنید.');
  if (!resolved.expenseCategoryId) throw new Error('دسته‌بندی هزینه اقساط را انتخاب کنید.');
  const [lender, expenseCategory] = await Promise.all([
    db.lenders.get(resolved.lenderId),
    db.categories.get(resolved.expenseCategoryId),
  ]);
  if (!lender) throw new Error('وام‌دهنده انتخاب‌شده پیدا نشد.');
  if (!expenseCategory) throw new Error('دسته‌بندی هزینه انتخاب‌شده پیدا نشد.');
  const defaultAmount = normalizeOptionalAmount(resolved.defaultInstallmentAmount, 'مبلغ پیش‌فرض قسط');
  const amounts = normalizedAmounts(resolved);
  const principal = normalizeOptionalAmount(resolved.principal, 'مبلغ اصل وام');
  const interestMode = normalizeInterestMode(resolved, principal, defaultAmount, amounts);
  const annualRate = normalizeOptionalRate(resolved.interestRateAnnual);
  if (interestMode === 'manual' && annualRate === null) throw new Error('نرخ سود سالانه را وارد کنید.');
  const schedule = buildSchedule(resolved);
  const now = new Date().toISOString();
  const loanId = uuid();
  const paidCount = resolvePaidCount(resolved);
  const history = input.historicalPayments ?? [];
  const historyByInstallment = new Map<number, HistoricalPaymentInput>();
  const today = todayJalali();
  for (let installmentNumber = 1; installmentNumber <= paidCount; installmentNumber += 1) {
    const amount = amounts[installmentNumber - 1] ?? defaultAmount;
    if (amount === null) throw new Error(`مبلغ قسط ${installmentNumber} برای ثبت پرداخت مشخص نیست.`);
    const due = schedule[installmentNumber - 1] ?? today;
    historyByInstallment.set(installmentNumber, { installmentNumber, amount, paidDate: due });
  }
  for (const entry of history) {
    if (!Number.isInteger(entry.installmentNumber) || entry.installmentNumber < 1 || entry.installmentNumber > resolved.installmentCount) {
      throw new Error('شماره قسط در سوابق پرداخت معتبر نیست.');
    }
    if (historyByInstallment.has(entry.installmentNumber)) throw new Error('برای هر قسط فقط یک سابقه پرداخت وارد کنید.');
    validateDate(entry.paidDate);
    normalizeOptionalAmount(entry.amount, 'مبلغ پرداخت');
    historyByInstallment.set(entry.installmentNumber, entry);
  }

  const loan: Loan = {
    id: loanId,
    title,
    lenderId: resolved.lenderId,
    expenseCategoryId: resolved.expenseCategoryId,
    mode: resolved.mode,
    description: resolved.description?.trim() ?? '',
    installmentCount: resolved.installmentCount,
    totalAmount: normalizeOptionalAmount(resolved.totalAmount, 'مبلغ کل وام') ?? totalOfEffective(defaultAmount, amounts),
    principal,
    interestMode,
    interestRateAnnual: interestMode === 'manual' ? annualRate : null,
    defaultInstallmentAmount: defaultAmount,
    includeInFixedExpenses: resolved.includeInFixedExpenses,
    startYear: resolved.startYear ?? schedule[0]?.year ?? null,
    startMonth: resolved.startMonth ?? schedule[0]?.month ?? null,
    endYear: resolved.mode === 'dated' ? resolved.endYear! : null,
    endMonth: resolved.mode === 'dated' ? resolved.endMonth! : null,
    dueDay: resolved.mode === 'dated' ? resolved.dueDay! : 1,
    createdAt: now,
    updatedAt: now,
  };

  const installments: LoanInstallment[] = amounts.map((plannedAmount, index) => {
    const due = schedule[index];
    const historical = historyByInstallment.get(index + 1);
    const paidAmount = normalizeOptionalAmount(historical?.amount, 'مبلغ پرداخت');
    return {
      id: uuid(),
      loanId,
      installmentNumber: index + 1,
      plannedAmount,
      dueYear: due?.year ?? null,
      dueMonth: due?.month ?? null,
      dueDay: due?.day ?? null,
      isPaid: Boolean(historical),
      paidAmount,
      paidYear: historical?.paidDate.year ?? null,
      paidMonth: historical?.paidDate.month ?? null,
      paidDay: historical?.paidDate.day ?? null,
      // Assigned before the row is written, so the link cannot be lost by a follow-up write.
      // A lost link is not cosmetic: it makes the loan unsavable (see `updateLoan`).
      expenseId: historical && paidAmount !== null ? uuid() : null,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Each installment already paid books its expense in its own month, dated at its due date. A
  // loan carried over from before the app existed therefore never piles its past installments
  // onto the current month.
  const expenses = installments.flatMap((item) => {
    if (item.expenseId === null || item.paidAmount === null) return [];
    if (item.paidYear === null || item.paidMonth === null || item.paidDay === null) return [];
    return [paymentExpense(loan, item, { year: item.paidYear, month: item.paidMonth, day: item.paidDay },
      item.paidAmount, item.expenseId, linkKey(loanId, item.id), now)];
  });

  await db.transaction('rw', db.loans, db.loanInstallments, db.expenses, async () => {
    await db.loans.put(loan);
    await db.loanInstallments.bulkPut(installments);
    if (expenses.length > 0) await db.expenses.bulkPut(expenses);
  });
  return loan;
}

export async function updateLoan(loanId: string, input: LoanUpdateInput): Promise<Loan> {
  const resolved = resolveInstallmentCount(input);
  const title = resolved.title.trim();
  if (!title) throw new Error('عنوان وام را وارد کنید.');
  if (!resolved.lenderId) throw new Error('بانک یا وام‌دهنده را انتخاب کنید.');
  if (!resolved.expenseCategoryId) throw new Error('دسته‌بندی هزینه اقساط را انتخاب کنید.');
  const defaultAmount = normalizeOptionalAmount(resolved.defaultInstallmentAmount, 'مبلغ پیش‌فرض قسط');
  const amounts = normalizedAmounts(resolved);
  const schedule = buildSchedule(resolved);
  const paidCount = resolvePaidCount(resolved);

  return db.transaction('rw', db.loans, db.loanInstallments, db.expenses, db.lenders, db.categories, async () => {
    const [current, lender, expenseCategory] = await Promise.all([
      db.loans.get(loanId),
      db.lenders.get(resolved.lenderId),
      db.categories.get(resolved.expenseCategoryId),
    ]);
    if (!current) throw new Error('وام پیدا نشد.');
    if (!lender) throw new Error('وام‌دهنده انتخاب‌شده پیدا نشد.');
    if (!expenseCategory) throw new Error('دسته‌بندی هزینه انتخاب‌شده پیدا نشد.');

    const installments = (await db.loanInstallments.where('loanId').equals(loanId).toArray())
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    const owned = await expensesByInstallment(loanId);
    const retainedCount = resolved.installmentCount;
    const removed = installments.slice(retainedCount);
    if (resolved.mode !== 'term' && removed.some((item) => item.isPaid || item.expenseId)) {
      throw new Error('تعداد اقساط نمی‌تواند اقساط پرداخت‌شده را حذف کند.');
    }

    const now = new Date().toISOString();
    const reconciliationDate = todayJalali();
    // A caller that does not mention interest leaves whatever the loan already had in place: only
    // an explicit value overwrites it, so an unrelated edit cannot silently drop a recorded rate.
    // Safe to do inside the transaction because `current` is only available here.
    const principal = resolved.principal === undefined
      ? current.principal ?? null
      : normalizeOptionalAmount(resolved.principal, 'مبلغ اصل وام');
    const interestMode = normalizeInterestMode(
      { interestMode: resolved.interestMode ?? current.interestMode ?? 'none' },
      principal, defaultAmount, amounts,
    );
    const annualRate = resolved.interestRateAnnual === undefined
      ? current.interestRateAnnual ?? null
      : normalizeOptionalRate(resolved.interestRateAnnual);
    if (interestMode === 'manual' && annualRate === null) throw new Error('نرخ سود سالانه را وارد کنید.');
    const updated: Loan = {
      ...current,
      title,
      lenderId: resolved.lenderId,
      expenseCategoryId: resolved.expenseCategoryId,
      mode: resolved.mode,
      description: resolved.description?.trim() ?? '',
      installmentCount: retainedCount,
      totalAmount: normalizeOptionalAmount(resolved.totalAmount, 'مبلغ کل وام') ?? totalOfEffective(defaultAmount, amounts),
      principal,
      interestMode,
      interestRateAnnual: interestMode === 'manual' ? annualRate : null,
      defaultInstallmentAmount: defaultAmount,
      includeInFixedExpenses: resolved.includeInFixedExpenses,
      startYear: resolved.mode === 'dated' ? resolved.startYear! : null,
      startMonth: resolved.mode === 'dated' ? resolved.startMonth! : null,
      endYear: resolved.mode === 'dated' ? resolved.endYear! : null,
      endMonth: resolved.mode === 'dated' ? resolved.endMonth! : null,
      dueDay: resolved.mode === 'dated' ? resolved.dueDay! : 1,
      updatedAt: now,
    };

    const rows: LoanInstallment[] = [];
    const payments: Expense[] = [];
    const staleExpenseIds: string[] = [];
    for (let index = 0; index < retainedCount; index += 1) {
      const due = schedule[index];
      // Payments are dated at the installment's own due date, so a loan carried over
      // from before the app existed books each installment in its own month instead
      // of piling every past installment onto the current one.
      const dueDate: JalaliDate | null = due ? { year: due.year, month: due.month, day: due.day } : null;
      const existing = installments[index];
      // The paid count is authoritative for both modes: it is what the user reports
      // for a pre-existing loan, and editing the loan must not silently diverge from it.
      const shouldBePaid = index < paidCount;
      const wasPaid = existing?.isPaid ?? false;
      const newlyPaid = shouldBePaid && !wasPaid;
      const amount = amounts[index] ?? defaultAmount;
      // An amount the user has not confirmed is never invented: a payment recorded earlier keeps
      // whatever amount it was recorded with, however it was recorded.
      const paidAmount = newlyPaid ? amount : shouldBePaid ? existing!.paidAmount : null;
      if (newlyPaid && paidAmount === null) throw new Error(`مبلغ قسط ${index + 1} برای ثبت پرداخت مشخص نیست.`);
      const hasPaymentDate = Boolean(existing
        && existing.paidYear !== null && existing.paidMonth !== null && existing.paidDay !== null);
      // A payment recorded now is dated at the installment's due date; one already
      // recorded keeps its date, so merely editing a loan never moves past expenses.
      const previousPaymentDate: JalaliDate | null = hasPaymentDate
        ? { year: existing!.paidYear!, month: existing!.paidMonth!, day: existing!.paidDay! }
        : null;
      const paymentDate = shouldBePaid
        ? resolvePaymentDate(previousPaymentDate, dueDate, reconciliationDate, newlyPaid)
        : null;
      const rowId = existing?.id ?? uuid();
      const ownedExpenses = existing ? owned.get(existing.id) ?? [] : [];
      // Reusing the expense the installment already owns is what keeps the unique generation
      // key free. Trusting `expenseId` alone is not enough: when that back-reference has been
      // lost, minting a fresh id collides with the existing row's key and aborts the save.
      const kept = ownedExpenses.find((item) => item.id === existing?.expenseId) ?? ownedExpenses[0];
      // Expenses are dropped only when this save actually un-pays an installment that was paid.
      // An installment that was already un-paid keeps any expense it has, rather than having
      // unrelated history deleted out from under a routine edit.
      if (wasPaid && !shouldBePaid) {
        staleExpenseIds.push(...ownedExpenses.map((item) => item.id));
      } else if (shouldBePaid) {
        staleExpenseIds.push(...ownedExpenses.filter((item) => item !== kept).map((item) => item.id));
      }
      // A brand new id is minted only alongside the expense that will carry it; an installment
      // that cannot book one keeps the reference it has rather than gaining a dangling id.
      const willBookExpense = shouldBePaid && paidAmount !== null;
      const expenseId = willBookExpense ? kept?.id ?? uuid() : kept?.id ?? null;

      const row: LoanInstallment = {
        id: rowId,
        loanId,
        installmentNumber: index + 1,
        plannedAmount: amounts[index],
        dueYear: due?.year ?? null,
        dueMonth: due?.month ?? null,
        dueDay: due?.day ?? null,
        isPaid: shouldBePaid,
        paidAmount,
        paidYear: paymentDate?.year ?? null,
        paidMonth: paymentDate?.month ?? null,
        paidDay: paymentDate?.day ?? null,
        expenseId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      rows.push(row);
      if (willBookExpense && expenseId !== null && paymentDate) {
        // An adopted expense keeps its own generation key, which for a loan migrated from a
        // recurring payment is still the recurring one; only a fresh row claims the loan key.
        payments.push(paymentExpense(updated, row, paymentDate, paidAmount, expenseId,
          kept?.generationKey ?? linkKey(loanId, rowId), kept?.createdAt ?? now));
      }
    }

    if (removed.length > 0) {
      for (const item of removed) {
        if (item.expenseId) staleExpenseIds.push(item.expenseId);
        staleExpenseIds.push(...(owned.get(item.id) ?? []).map((expense) => expense.id));
      }
    }

    await db.loans.put(updated);
    await db.loanInstallments.bulkPut(rows);
    const writtenIds = new Set(payments.map((item) => item.id));
    // Deleting before re-inserting keeps a generation key free for a row that adopts it from a
    // duplicate removed in the same save; ids being written are never among the stale ones.
    const stale = [...new Set(staleExpenseIds)].filter((id) => !writtenIds.has(id));
    if (stale.length > 0) await db.expenses.bulkDelete(stale);
    if (payments.length > 0) await db.expenses.bulkPut(payments);
    if (removed.length > 0) await db.loanInstallments.bulkDelete(removed.map((item) => item.id));
    return updated;
  });
}

export async function markInstallmentPaid(
  installmentId: string,
  amount: number,
  paidDate?: JalaliDate,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('مبلغ پرداخت باید بیشتر از صفر باشد.');
  if (paidDate) validateDate(paidDate);
  await db.transaction('rw', db.loans, db.loanInstallments, db.expenses, async () => {
    const installment = await db.loanInstallments.get(installmentId);
    if (!installment) throw new Error('قسط پیدا نشد.');
    const loan = await db.loans.get(installment.loanId);
    if (!loan) throw new Error('وام پیدا نشد.');
    const now = new Date().toISOString();
    const effectiveDate = paidDate ?? (installment.dueYear && installment.dueMonth && installment.dueDay
      ? { year: installment.dueYear, month: installment.dueMonth, day: installment.dueDay } : todayJalali());
    const ownedExpenses = (await expensesByInstallment(installment.loanId)).get(installmentId) ?? [];
    const kept = ownedExpenses.find((item) => item.id === installment.expenseId) ?? ownedExpenses[0];
    const row: LoanInstallment = {
      ...installment,
      isPaid: true,
      paidAmount: amount,
      paidYear: effectiveDate.year,
      paidMonth: effectiveDate.month,
      paidDay: Math.min(effectiveDate.day, monthLength(effectiveDate.year, effectiveDate.month)),
      expenseId: kept?.id ?? uuid(),
      updatedAt: now,
    };
    const stale = ownedExpenses.filter((item) => item !== kept).map((item) => item.id);
    await db.loanInstallments.put(row);
    if (stale.length > 0) await db.expenses.bulkDelete(stale);
    await db.expenses.put(paymentExpense(loan, row, effectiveDate, amount, row.expenseId!,
      kept?.generationKey ?? linkKey(installment.loanId, installmentId), kept?.createdAt ?? now));
  });
}

export async function cancelInstallmentPayment(installmentId: string): Promise<void> {
  await db.transaction('rw', db.loanInstallments, db.expenses, async () => {
    const installment = await db.loanInstallments.get(installmentId);
    if (!installment) return;
    const expenseIds = new Set(
      ((await expensesByInstallment(installment.loanId)).get(installmentId) ?? []).map((item) => item.id),
    );
    // Also catch a back-reference that points at a row the forward link would not have found.
    if (installment.expenseId) expenseIds.add(installment.expenseId);
    if (expenseIds.size > 0) await db.expenses.bulkDelete([...expenseIds]);
    await db.loanInstallments.update(installmentId, {
      isPaid: false,
      paidAmount: null,
      paidYear: null,
      paidMonth: null,
      paidDay: null,
      expenseId: null,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function updateInstallmentAmount(installmentId: string, plannedAmount: number | null): Promise<void> {
  const normalized = normalizeOptionalAmount(plannedAmount, 'مبلغ قسط');
  await db.transaction('rw', db.loans, db.loanInstallments, async () => {
    const installment = await db.loanInstallments.get(installmentId);
    if (!installment) throw new Error('قسط پیدا نشد.');
    await db.loanInstallments.update(installmentId, {
      plannedAmount: normalized,
      updatedAt: new Date().toISOString(),
    });
    const all = await db.loanInstallments.where('loanId').equals(installment.loanId).toArray();
    const loan = await db.loans.get(installment.loanId);
    if (!loan) throw new Error('وام پیدا نشد.');
    const updatedOverrides = all.map((item) => item.id === installmentId ? normalized : item.plannedAmount);
    // A total the user entered by hand is authoritative and stays untouched; only a
    // loan without one is recomputed from its installments.
    await db.loans.update(installment.loanId, {
      totalAmount: loan.totalAmount !== null && loan.totalAmount > 0
        ? loan.totalAmount
        : totalOfEffective(loan.defaultInstallmentAmount, updatedOverrides),
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function deleteLoan(loanId: string): Promise<void> {
  await db.transaction('rw', db.loans, db.loanInstallments, db.expenses, async () => {
    // Deleting by loanId rather than by each installment's back-reference also clears expenses
    // whose link was lost, which would otherwise linger in the expense history forever.
    const expenses = await db.expenses.where('loanId').equals(loanId).toArray();
    const installments = await db.loanInstallments.where('loanId').equals(loanId).toArray();
    if (expenses.length > 0) await db.expenses.bulkDelete(expenses.map((item) => item.id));
    if (installments.length > 0) await db.loanInstallments.bulkDelete(installments.map((item) => item.id));
    await db.loans.delete(loanId);
  });
}

/**
 * Removes every loan along with its installments and the expenses those installments booked.
 * Deliberately scoped to loans: expenses that have nothing to do with a loan are left untouched.
 * Returns how many loans were deleted.
 */
export async function deleteAllLoans(): Promise<number> {
  return db.transaction('rw', db.loans, db.loanInstallments, db.expenses, async () => {
    const loans = await db.loans.toArray();
    for (const loan of loans) {
      const installments = await db.loanInstallments.where('loanId').equals(loan.id).toArray();
      // By loanId rather than by each installment's back-reference, so a loan payment whose link
      // was lost still goes with the loan instead of lingering in the expense history.
      const doomed = new Set((await db.expenses.where('loanId').equals(loan.id).toArray())
        .map((item) => item.id));
      if (installments.length > 0) {
        // The mirror case: an expense that lost its loanId but still points at one of this loan's
        // installments. Only a hand-edited or legacy backup can produce one, but leaving it behind
        // would strand a dangling reference and keep its generationKey occupied in the unique index,
        // blocking a later insert that reuses the key.
        const byInstallment = await db.expenses
          .where('loanInstallmentId').anyOf(installments.map((item) => item.id)).toArray();
        for (const expense of byInstallment) doomed.add(expense.id);
      }
      if (doomed.size > 0) await db.expenses.bulkDelete([...doomed]);
      if (installments.length > 0) await db.loanInstallments.bulkDelete(installments.map((item) => item.id));
    }
    if (loans.length > 0) await db.loans.bulkDelete(loans.map((loan) => loan.id));
    return loans.length;
  });
}

export interface LoanLinkRepairReport {
  loansChecked: number;
  /** Paid installments whose back-reference was rebuilt from the expense that pays them. */
  linksRestored: number;
  /** Back-references cleared: they named a deleted expense, or sat on an un-paid installment. */
  linksCleared: number;
  /** Expenses whose forward link was filled in from their generation key. */
  expensesAdopted: number;
  duplicatesRemoved: number;
}

/**
 * Rebuilds the installment → expense back-reference from the forward link that every loan
 * expense already carries. Without it a paid installment looks unbooked and, worse, the next
 * save mints a fresh expense id for an installment whose generation key is already taken — a
 * unique-index violation that rolls the whole save back and leaves the loan uneditable.
 *
 * Deliberately conservative: it never creates an expense, never deletes an expense belonging to
 * an installment the user has not paid, and never changes `isPaid`. Several loans on the
 * production phone hold expenses whose installments read un-paid (وام شرکتی بلو ۲۴, وام ودیعه
 * مسکن بلو ۴۰); that disagreement is the user's to settle by saving the loan with the paid
 * count they mean, which then reconciles both sides.
 */
export async function repairLoanExpenseLinks(): Promise<LoanLinkRepairReport> {
  const report: LoanLinkRepairReport = {
    loansChecked: 0, linksRestored: 0, linksCleared: 0, expensesAdopted: 0, duplicatesRemoved: 0,
  };
  await db.transaction('rw', db.loans, db.loanInstallments, db.expenses, async () => {
    const loans = await db.loans.toArray();
    report.loansChecked = loans.length;
    const now = new Date().toISOString();
    for (const loan of loans) {
      const owned = await expensesByInstallment(loan.id);
      if (owned.size === 0) continue;
      const installments = await db.loanInstallments.where('loanId').equals(loan.id).toArray();
      const updates: LoanInstallment[] = [];
      const adopted: Expense[] = [];
      const staleExpenseIds: string[] = [];
      for (const installment of installments) {
        const rows = owned.get(installment.id) ?? [];
        if (rows.length === 0) {
          // A back-reference to a row that no longer exists (deleted from the expenses page) is
          // dropped, so the installment stops claiming a payment record it cannot show.
          if (installment.expenseId) {
            updates.push({ ...installment, expenseId: null, updatedAt: now });
            report.linksCleared += 1;
          }
          continue;
        }
        const kept = rows.find((item) => item.id === installment.expenseId) ?? rows[0];
        if (!installment.isPaid) {
          // An un-paid installment holds no link, but its expense rows are left alone: whether
          // the payment or the expense is the stale half is not this function's call to make.
          if (installment.expenseId) {
            updates.push({ ...installment, expenseId: null, updatedAt: now });
            report.linksCleared += 1;
          }
          continue;
        }
        if (kept.loanId !== loan.id || kept.loanInstallmentId !== installment.id) {
          adopted.push({ ...kept, loanId: loan.id, loanInstallmentId: installment.id });
          report.expensesAdopted += 1;
        }
        if (installment.expenseId !== kept.id) {
          updates.push({ ...installment, expenseId: kept.id, updatedAt: now });
          report.linksRestored += 1;
        }
        for (const extra of rows) {
          if (extra.id === kept.id) continue;
          staleExpenseIds.push(extra.id);
          report.duplicatesRemoved += 1;
        }
      }
      if (updates.length > 0) await db.loanInstallments.bulkPut(updates);
      if (adopted.length > 0) await db.expenses.bulkPut(adopted);
      if (staleExpenseIds.length > 0) await db.expenses.bulkDelete(staleExpenseIds);
    }
  });
  return report;
}
