import { db } from '../db/db';
import type { Loan, LoanInstallment, LoanMode } from '../db/types';
import { monthLength, nextMonth, shiftMonth, todayJalali, type JalaliDate } from '../lib/jalaali';
import { uuid } from '../lib/id';

export interface LoanInput {
  title: string;
  lenderId: string;
  expenseCategoryId: string;
  mode: LoanMode;
  description?: string;
  installmentCount: number;
  defaultInstallmentAmount?: number | null;
  /** Optional explicit principal/total. Derived from effective installments when omitted. */
  totalAmount?: number | null;
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
  totalAmount: number | null;
  paidCount: number;
  paidAmount: number | null;
  remainingAmount: number | null;
  progress: number | null;
}

function normalizeOptionalAmount(amount: number | null | undefined, label: string): number | null {
  if (amount === null || amount === undefined) return null;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} باید بیشتر از صفر باشد.`);
  }
  return amount;
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

function normalizePaidCount(input: Pick<LoanInput, 'mode' | 'paidCount' | 'installmentCount'>): number {
  const paidCount = input.paidCount ?? 0;
  if (!Number.isInteger(paidCount) || paidCount < 0 || paidCount > input.installmentCount) {
    throw new Error('تعداد اقساط پرداخت‌شده نمی‌تواند بیشتر از تعداد کل اقساط باشد.');
  }
  return paidCount;
}

export function calculateLoanSummary(loan: Loan, installments: LoanInstallment[]): LoanSummary {
  const planned = installments.map((item) => effectiveAmount(loan, item));
  const derivedTotal = planned.every((amount): amount is number => amount !== null)
    ? planned.reduce((sum, amount) => sum + amount, 0) : null;
  // A stored total of 0 is a legacy artefact (a loan recorded without any amounts);
  // fall back to the derived sum so the card never claims a real zero total.
  const totalAmount = loan.totalAmount !== null && loan.totalAmount > 0 ? loan.totalAmount : derivedTotal;
  const paid = installments.filter((item) => item.isPaid);
  const paidAmount = paid.every((item) => item.paidAmount !== null)
    ? paid.reduce((sum, item) => sum + item.paidAmount!, 0) : null;
  const remainingAmount = totalAmount !== null && paidAmount !== null ? Math.max(0, totalAmount - paidAmount) : null;
  return {
    totalAmount,
    paidCount: paid.length,
    paidAmount,
    remainingAmount,
    progress: totalAmount !== null && totalAmount > 0 && paidAmount !== null
      ? Math.min(100, (paidAmount / totalAmount) * 100) : null,
  };
}

export async function addLoan(input: LoanInput): Promise<Loan> {
  const title = input.title.trim();
  if (!title) throw new Error('عنوان وام را وارد کنید.');
  if (!input.lenderId) throw new Error('بانک یا وام‌دهنده را انتخاب کنید.');
  if (!input.expenseCategoryId) throw new Error('دسته‌بندی هزینه اقساط را انتخاب کنید.');
  const [lender, expenseCategory] = await Promise.all([
    db.lenders.get(input.lenderId),
    db.categories.get(input.expenseCategoryId),
  ]);
  if (!lender) throw new Error('وام‌دهنده انتخاب‌شده پیدا نشد.');
  if (!expenseCategory) throw new Error('دسته‌بندی هزینه انتخاب‌شده پیدا نشد.');
  const defaultAmount = normalizeOptionalAmount(input.defaultInstallmentAmount, 'مبلغ پیش‌فرض قسط');
  const amounts = normalizedAmounts(input);
  const schedule = buildSchedule(input);
  const now = new Date().toISOString();
  const loanId = uuid();
  let paidCount = normalizePaidCount(input);
  if (input.mode === 'dated' && input.paidCount === undefined && input.startYear && input.startMonth) {
    const current = todayJalali();
    paidCount = Math.max(0, Math.min(input.installmentCount,
      (current.year - input.startYear) * 12 + current.month - input.startMonth + 1));
  }
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
    if (!Number.isInteger(entry.installmentNumber) || entry.installmentNumber < 1 || entry.installmentNumber > input.installmentCount) {
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
    lenderId: input.lenderId,
    expenseCategoryId: input.expenseCategoryId,
    mode: input.mode,
    description: input.description?.trim() ?? '',
    installmentCount: input.installmentCount,
    totalAmount: normalizeOptionalAmount(input.totalAmount, 'مبلغ کل وام') ?? totalOfEffective(defaultAmount, amounts),
    defaultInstallmentAmount: defaultAmount,
    includeInFixedExpenses: input.includeInFixedExpenses,
    startYear: input.startYear ?? schedule[0]?.year ?? null,
    startMonth: input.startMonth ?? schedule[0]?.month ?? null,
    endYear: input.mode === 'dated' ? input.endYear! : null,
    endMonth: input.mode === 'dated' ? input.endMonth! : null,
    dueDay: input.mode === 'dated' ? input.dueDay! : 1,
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
      expenseId: null,
      createdAt: now,
      updatedAt: now,
    };
  });

  await db.transaction('rw', db.loans, db.loanInstallments, db.expenses, async () => {
    await db.loans.add(loan);
    await db.loanInstallments.bulkAdd(installments);
    // Each installment already paid books its expense in its own month, dated at its
    // due date. A loan carried over from before the app existed therefore never piles
    // its past installments onto the current month.
    for (const item of installments) {
      if (!item.isPaid || item.paidAmount === null) continue;
      if (item.paidYear === null || item.paidMonth === null || item.paidDay === null) continue;
      await createPaymentExpense(loan, item, {
        year: item.paidYear, month: item.paidMonth, day: item.paidDay,
      }, item.paidAmount);
    }
  });
  return loan;
}

export async function updateLoan(loanId: string, input: LoanUpdateInput): Promise<Loan> {
  const title = input.title.trim();
  if (!title) throw new Error('عنوان وام را وارد کنید.');
  if (!input.lenderId) throw new Error('بانک یا وام‌دهنده را انتخاب کنید.');
  if (!input.expenseCategoryId) throw new Error('دسته‌بندی هزینه اقساط را انتخاب کنید.');
  const defaultAmount = normalizeOptionalAmount(input.defaultInstallmentAmount, 'مبلغ پیش‌فرض قسط');
  const amounts = normalizedAmounts(input);
  const schedule = buildSchedule(input);
  let paidCount = normalizePaidCount(input);
  if (input.mode === 'dated' && input.paidCount === undefined && input.startYear && input.startMonth) {
    const current = todayJalali();
    paidCount = Math.max(0, Math.min(input.installmentCount,
      (current.year - input.startYear) * 12 + current.month - input.startMonth + 1));
  }

  return db.transaction('rw', db.loans, db.loanInstallments, db.expenses, db.lenders, db.categories, async () => {
    const [current, lender, expenseCategory] = await Promise.all([
      db.loans.get(loanId),
      db.lenders.get(input.lenderId),
      db.categories.get(input.expenseCategoryId),
    ]);
    if (!current) throw new Error('وام پیدا نشد.');
    if (!lender) throw new Error('وام‌دهنده انتخاب‌شده پیدا نشد.');
    if (!expenseCategory) throw new Error('دسته‌بندی هزینه انتخاب‌شده پیدا نشد.');

    const installments = (await db.loanInstallments.where('loanId').equals(loanId).toArray())
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    const retainedCount = input.installmentCount;
    const removed = installments.slice(retainedCount);
    if (input.mode !== 'term' && removed.some((item) => item.isPaid || item.expenseId)) {
      throw new Error('تعداد اقساط نمی‌تواند اقساط پرداخت‌شده را حذف کند.');
    }

    const now = new Date().toISOString();
    const reconciliationDate = todayJalali();
    const updated: Loan = {
      ...current,
      title,
      lenderId: input.lenderId,
      expenseCategoryId: input.expenseCategoryId,
      mode: input.mode,
      description: input.description?.trim() ?? '',
      installmentCount: retainedCount,
      totalAmount: normalizeOptionalAmount(input.totalAmount, 'مبلغ کل وام') ?? totalOfEffective(defaultAmount, amounts),
      defaultInstallmentAmount: defaultAmount,
      includeInFixedExpenses: input.includeInFixedExpenses,
      startYear: input.mode === 'dated' ? input.startYear! : null,
      startMonth: input.mode === 'dated' ? input.startMonth! : null,
      endYear: input.mode === 'dated' ? input.endYear! : null,
      endMonth: input.mode === 'dated' ? input.endMonth! : null,
      dueDay: input.mode === 'dated' ? input.dueDay! : 1,
      updatedAt: now,
    };

    await db.loans.put(updated);
    for (let index = 0; index < retainedCount; index += 1) {
      const due = schedule[index];
      // Payments are dated at the installment's own due date, so a loan carried over
      // from before the app existed books each installment in its own month instead
      // of piling every past installment onto the current one.
      const dueDate: JalaliDate | null = due ? { year: due.year, month: due.month, day: due.day } : null;
      const existing = installments[index];
      if (existing) {
        // The paid count is authoritative for both modes: it is what the user reports
        // for a pre-existing loan, and editing the loan must not silently diverge from it.
        const shouldBePaid = index < paidCount;
        const newlyPaid = shouldBePaid && !existing.isPaid;
        const paidAmount = newlyPaid ? amounts[index] ?? defaultAmount : existing.paidAmount;
        if (newlyPaid && paidAmount === null) throw new Error(`مبلغ قسط ${index + 1} برای ثبت پرداخت مشخص نیست.`);
        if (!shouldBePaid && existing.expenseId) await db.expenses.delete(existing.expenseId);
        const recordedDate: JalaliDate | null = existing.paidYear !== null && existing.paidMonth !== null && existing.paidDay !== null
          ? { year: existing.paidYear, month: existing.paidMonth, day: existing.paidDay }
          : null;
        const paymentDate = resolvePaymentDate(recordedDate, dueDate, reconciliationDate, newlyPaid);
        const reconciled: LoanInstallment = {
          ...existing,
          installmentNumber: index + 1,
          plannedAmount: amounts[index],
          dueYear: due?.year ?? null,
          dueMonth: due?.month ?? null,
          dueDay: due?.day ?? null,
          isPaid: shouldBePaid,
          paidAmount: shouldBePaid ? paidAmount : null,
          paidYear: shouldBePaid ? paymentDate.year : null,
          paidMonth: shouldBePaid ? paymentDate.month : null,
          paidDay: shouldBePaid ? paymentDate.day : null,
          expenseId: shouldBePaid ? existing.expenseId : null,
          updatedAt: now,
        };
        await db.loanInstallments.put(reconciled);
        if (shouldBePaid && paidAmount !== null) {
          await createPaymentExpense(updated, reconciled, paymentDate, paidAmount);
        }
      } else {
        const shouldBePaid = index < paidCount;
        const paidAmount = shouldBePaid ? amounts[index] ?? defaultAmount : null;
        if (shouldBePaid && paidAmount === null) throw new Error(`مبلغ قسط ${index + 1} برای ثبت پرداخت مشخص نیست.`);
        const paymentDate = dueDate ?? reconciliationDate;
        const created: LoanInstallment = {
          id: uuid(), loanId, installmentNumber: index + 1,
          plannedAmount: amounts[index],
          dueYear: due?.year ?? null, dueMonth: due?.month ?? null, dueDay: due?.day ?? null,
          isPaid: shouldBePaid, paidAmount,
          paidYear: shouldBePaid ? paymentDate.year : null,
          paidMonth: shouldBePaid ? paymentDate.month : null,
          paidDay: shouldBePaid ? paymentDate.day : null,
          expenseId: null, createdAt: now, updatedAt: now,
        };
        await db.loanInstallments.add(created);
        if (shouldBePaid && paidAmount !== null) await createPaymentExpense(updated, created, paymentDate, paidAmount);
      }
    }
    if (removed.length) {
      const removedExpenseIds = removed.flatMap((item) => item.expenseId ? [item.expenseId] : []);
      if (removedExpenseIds.length) await db.expenses.bulkDelete(removedExpenseIds);
      await db.loanInstallments.bulkDelete(removed.map((item) => item.id));
    }
    return updated;
  });
}

async function createPaymentExpense(
  loan: Loan,
  installment: LoanInstallment,
  date: JalaliDate,
  amount: number,
): Promise<string> {
  const expenseId = installment.expenseId ?? uuid();
  const now = new Date().toISOString();
  await db.expenses.put({
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
    generationKey: `loan|${loan.id}|${installment.id}`,
    createdAt: now,
    updatedAt: now,
  });
  await db.loanInstallments.update(installment.id, { expenseId, updatedAt: now });
  return expenseId;
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
    const expenseId = await createPaymentExpense(loan, installment, effectiveDate, amount);
    await db.loanInstallments.update(installmentId, {
      isPaid: true,
      paidAmount: amount,
      paidYear: effectiveDate.year,
      paidMonth: effectiveDate.month,
      paidDay: Math.min(effectiveDate.day, monthLength(effectiveDate.year, effectiveDate.month)),
      expenseId,
      updatedAt: now,
    });
  });
}

export async function cancelInstallmentPayment(installmentId: string): Promise<void> {
  await db.transaction('rw', db.loanInstallments, db.expenses, async () => {
    const installment = await db.loanInstallments.get(installmentId);
    if (!installment) return;
    if (installment.expenseId) await db.expenses.delete(installment.expenseId);
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
    const installments = await db.loanInstallments.where('loanId').equals(loanId).toArray();
    const expenseIds = installments
      .map((item) => item.expenseId)
      .filter((id): id is string => Boolean(id));
    if (expenseIds.length > 0) await db.expenses.bulkDelete(expenseIds);
    await db.loanInstallments.bulkDelete(installments.map((item) => item.id));
    await db.loans.delete(loanId);
  });
}

