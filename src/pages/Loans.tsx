import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Sheet } from '../components/ui/Sheet';
import { CheckIcon, EditIcon, PlusIcon, TrashIcon, WalletIcon } from '../components/ui/Icons';
import { EmptyState } from '../components/ui/EmptyState';
import { CategoryIcon } from '../components/CategoryIcon';
import { JalaliDateFields } from '../components/JalaliDateFields';
import { useApp } from '../context/AppContext';
import { useCategories } from '../hooks/useCategories';
import { useLenders } from '../hooks/useLenders';
import { useLoanLenderIcons } from '../hooks/useLoanLenderIcons';
import { useLoans, type LoanWithDetails } from '../hooks/useLoans';
import { formatPercent, formatPercentFixed, formatRial, parseDecimal, parseDigits } from '../lib/format';
import { resolveLoanInterest, type LoanInterestSpec } from '../lib/interest';
import { formatJalaliDate, todayJalali, toPersianDigits } from '../lib/jalaali';
import {
  addLoan,
  cancelInstallmentPayment,
  deleteLoan,
  markInstallmentPaid,
  updateInstallmentAmount,
  updateLoan,
  type LoanUpdateInput,
} from '../services/loans';
import type { LoanInterestMode, LoanMode } from '../db/types';

interface FormState {
  title: string; lenderId: string; expenseCategoryId: string; mode: LoanMode; description: string;
  installmentCount: string; principal: string; defaultAmount: string; includeInFixedExpenses: boolean;
  interestMode: LoanInterestMode; annualRate: string;
  startYear: string; startMonth: string; endYear: string; endMonth: string; dueDay: string;
  overrides: string[]; paidCount: string;
}

const today = todayJalali();
const blankForm = (): FormState => ({
  title: '', lenderId: '', expenseCategoryId: '', mode: 'term', description: '', installmentCount: '',
  principal: '', defaultAmount: '', includeInFixedExpenses: true, interestMode: 'none', annualRate: '',
  startYear: String(today.year), startMonth: String(today.month),
  endYear: String(today.year), endMonth: String(today.month), dueDay: '1', overrides: [], paidCount: '',
});
const optionalAmount = (value: string): number | null => value.trim() ? parseDigits(value) : null;
const money = (value: number | null) => value === null ? 'نامشخص' : formatRial(value);

/**
 * End month implied by a start month and an installment count. Defaulting to the
 * first day of each month means installment N falls in month start + N - 1.
 */
function endMonthFor(startYear: number, startMonth: number, count: number): { year: number; month: number } {
  const index = startYear * 12 + (startMonth - 1) + Math.max(0, count - 1);
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Installment count implied by a dated range — the inverse of `endMonthFor`, and the same span
 * `datedSchedule` walks (the start month is included). This lets the user define only the window
 * (ماه شروع … ماه پایان) and have the count work itself out.
 */
function countFor(startYear: number, startMonth: number, endYear: number, endMonth: number): number {
  if (!startYear || !startMonth || !endYear || !endMonth) return 0;
  if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12) return 0;
  return Math.max(0, (endYear * 12 + endMonth) - (startYear * 12 + startMonth) + 1);
}

export function Loans() {
  const { addOpen, setAddOpen } = useApp();
  const loans = useLoans();
  const lenders = useLenders();
  const lenderIcons = useLoanLenderIcons();
  const categories = useCategories();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LoanWithDetails | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoanWithDetails | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<{ detail: LoanWithDetails; index: number } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [amountTarget, setAmountTarget] = useState<LoanWithDetails['installments'][number] | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [overrideNumber, setOverrideNumber] = useState('1');
  const [overrideAmount, setOverrideAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState({ year: today.year, month: today.month, day: today.day });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lenderNames = useMemo(() => new Map(lenders.map((x) => [x.id, x.name])), [lenders]);
  // A dated loan may leave the count empty and let its range speak for it, so the preview here
  // mirrors what the service derives when saving and keeps the amount editor in step with it.
  const rangeCount = countFor(
    parseDigits(form.startYear), parseDigits(form.startMonth),
    parseDigits(form.endYear), parseDigits(form.endMonth),
  );
  const installmentCount = form.installmentCount.trim()
    ? Math.min(120, parseDigits(form.installmentCount))
    : form.mode === 'dated' ? Math.min(120, rangeCount) : 0;
  // The rate the user is asking for, worked out from the form as they type it. An 'auto' rate is
  // solved here by the very same function the service calls on save, so the figure shown while
  // filling the form is the figure that ends up on the card.
  const interestSpec = useMemo((): LoanInterestSpec => {
    const defaultAmount = optionalAmount(form.defaultAmount);
    const overrides = Array.from({ length: installmentCount }, (_, i) => optionalAmount(form.overrides[i] ?? ''));
    const effective = overrides.map((amount) => amount ?? defaultAmount);
    const scheduledTotal = effective.length > 0 && effective.every((amount): amount is number => amount !== null)
      ? effective.reduce((sum, amount) => sum + amount, 0) : null;
    return {
      mode: form.interestMode,
      principal: optionalAmount(form.principal),
      // Averaged over the schedule rather than taken from the default, so A × n is exactly the
      // «جمع اقساط» the same loan will show and the two cannot appear to disagree.
      installmentAmount: scheduledTotal !== null && installmentCount > 0
        ? scheduledTotal / installmentCount : defaultAmount,
      installmentCount,
      annualRatePercent: parseDecimal(form.annualRate),
      // Compared against the schedule's own first amount rather than the default: when the default
      // is empty but every installment carries the same explicit amount, the schedule is still a
      // level annuity, and testing each amount against a null default called all of them different.
      approximate: effective.some((amount) => amount !== effective[0]),
    };
  }, [form, installmentCount]);
  const interestPreview = resolveLoanInterest(interestSpec);

  function openCreate() { setEditing(null); setForm(blankForm()); setOverrideNumber('1'); setOverrideAmount(''); setError(''); setFormOpen(true); }
  useEffect(() => {
    if (!addOpen) return;
    openCreate();
    setAddOpen(false);
  }, [addOpen, setAddOpen]);
  function openEdit(detail: LoanWithDetails) {
    const { loan, installments } = detail;
    setEditing(detail);
    setForm({
      title: loan.title, lenderId: loan.lenderId, expenseCategoryId: loan.expenseCategoryId, mode: loan.mode,
      description: loan.description, installmentCount: String(loan.installmentCount),
      principal: loan.principal === null || loan.principal === undefined ? '' : String(loan.principal),
      defaultAmount: loan.defaultInstallmentAmount === null ? '' : String(loan.defaultInstallmentAmount),
      interestMode: loan.interestMode ?? 'none',
      annualRate: loan.interestRateAnnual === null || loan.interestRateAnnual === undefined
        ? '' : String(loan.interestRateAnnual),
      includeInFixedExpenses: loan.includeInFixedExpenses, startYear: loan.startYear?.toString() ?? String(today.year),
      startMonth: loan.startMonth?.toString() ?? String(today.month), endYear: loan.endYear?.toString() ?? String(today.year),
      endMonth: loan.endMonth?.toString() ?? String(today.month), dueDay: loan.dueDay?.toString() ?? '1',
      overrides: installments.map((x) => x.plannedAmount?.toString() ?? ''),
      paidCount: String(installments.findIndex((x) => !x.isPaid) < 0 ? installments.length : installments.findIndex((x) => !x.isPaid)),
    });
    setOverrideNumber('1'); setOverrideAmount('');
    setError(''); setFormOpen(true);
  }
  function buildInput(): LoanUpdateInput {
    return {
      title: form.title, lenderId: form.lenderId, expenseCategoryId: form.expenseCategoryId, mode: form.mode,
      description: form.description, installmentCount, principal: optionalAmount(form.principal), defaultInstallmentAmount: optionalAmount(form.defaultAmount),
      // A rate is stored only for a loan the user typed one in for; every other mode derives it.
      interestMode: form.interestMode,
      interestRateAnnual: form.interestMode === 'manual' ? parseDecimal(form.annualRate) : null,
      installmentAmounts: Array.from({ length: installmentCount }, (_, i) => optionalAmount(form.overrides[i] ?? '')),
      includeInFixedExpenses: form.includeInFixedExpenses,
      paidCount: form.paidCount.trim() ? parseDigits(form.paidCount) : undefined,
      ...(form.mode === 'dated' ? { startYear: parseDigits(form.startYear), startMonth: parseDigits(form.startMonth), endYear: parseDigits(form.endYear), endMonth: parseDigits(form.endMonth), dueDay: parseDigits(form.dueDay) } : {}),
    };
  }
  /** The range and the count are two views of one thing: editing one carries the other along. */
  function setRange(value: { year: number; month: number }) {
    setForm((prev) => {
      const next = { ...prev, endYear: String(value.year), endMonth: String(value.month) };
      // A count the user already recorded has to follow the window, or the two would disagree
      // and the loan could not be saved at all. An empty count stays empty: the range alone
      // defines the loan, and the service derives the same number on save.
      if (prev.installmentCount.trim()) {
        const count = countFor(parseDigits(prev.startYear), parseDigits(prev.startMonth), value.year, value.month);
        if (count > 0) next.installmentCount = String(count);
      }
      return next;
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const input = buildInput();
      if (editing) await updateLoan(editing.loan.id, input);
      else await addLoan(input);
      setFormOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'ثبت وام انجام نشد.'); }
    finally { setBusy(false); }
  }
  async function submitPayment(event: FormEvent) {
    event.preventDefault(); if (!paymentTarget) return;
    if (!paymentAmount.trim()) { setError('مبلغ واقعی پرداخت را وارد کنید.'); return; }
    setBusy(true); setError('');
    try {
      await markInstallmentPaid(paymentTarget.detail.installments[paymentTarget.index].id, parseDigits(paymentAmount), {
        year: paymentDate.year, month: paymentDate.month, day: paymentDate.day,
      });
      setPaymentTarget(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'ثبت پرداخت انجام نشد.'); }
    finally { setBusy(false); }
  }
  async function submitInstallmentAmount(event: FormEvent) {
    event.preventDefault(); if (!amountTarget) return; setBusy(true); setError('');
    try {
      await updateInstallmentAmount(amountTarget.id, optionalAmount(installmentAmount));
      setAmountTarget(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'ویرایش مبلغ قسط انجام نشد.'); }
    finally { setBusy(false); }
  }

  return <section className="page loans-page">
    {!loans.length ? <EmptyState emoji="💳" title="هنوز وامی ثبت نشده" subtitle="مشخصات اصلی و تعداد اقساط را وارد کنید."><Button onClick={openCreate}><PlusIcon width={18} /> افزودن وام</Button></EmptyState> :
      <div className="loans-list">{loans.map((detail) => {
        const { loan, installments, summary } = detail;
        // The card is driven by what the user actually entered. A loan with no installment count
        // and no rows yet says so instead of claiming "0 of 0"; one that only has rows (an early
        // migration left some that way) is charted from those.
        const hasSchedule = loan.installmentCount > 0 || installments.length > 0;
        const count = loan.installmentCount > 0 ? loan.installmentCount : installments.length;
        const progress = summary.progress;
        const interest = summary.interest;
        const isExpanded = expanded === loan.id;
        return <article className="card loan-card" key={loan.id}>
          <div className="loan-card__header">
            <button type="button" className="loan-card__summary" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : loan.id)}>
              <span className="loan-card__icon"><CategoryIcon icon={lenderIcons.get(loan.id)} fallback={<WalletIcon />} alt={lenderNames.get(loan.lenderId)} /></span>
              <span className="loan-card__main">
                <span className="loan-card__title"><strong>{loan.title}</strong>{hasSchedule && <span>{toPersianDigits(count)} قسط</span>}</span>
                {progress !== null && <span className="loan-progress"><span style={{ width: `${progress}%` }} /></span>}
                {/* Count first, percentage second: the percentage is that same ratio, so the two
                    can never appear to disagree the way "۳۷ از ۶۰" beside "۱۰۰٪" did. */}
                <span className="loan-card__meta"><span>{lenderNames.get(loan.lenderId) ?? 'وام‌دهنده نامشخص'}</span><b>{hasSchedule ? `${toPersianDigits(summary.paidCount)} از ${toPersianDigits(count)}${progress === null ? '' : ` · ${formatPercent(progress)}`}` : 'تعداد اقساط ثبت نشده'}</b></span>
              </span>
            </button>
            <div className="loan-card__actions">
              <button type="button" className="loan-icon-btn loan-icon-btn--lg" aria-label="ویرایش وام" title="ویرایش وام" onClick={() => openEdit(detail)}><EditIcon /></button>
              <button type="button" className="loan-icon-btn loan-icon-btn--lg loan-icon-btn--danger" aria-label="حذف وام" title="حذف وام" onClick={() => setDeleteTarget(detail)}><TrashIcon /></button>
            </div>
          </div>
          <div className="loan-totals">{hasSchedule ? <><div><span>جمع اقساط</span><strong>{money(summary.scheduledTotal ?? summary.totalAmount)}</strong></div><div><span>پرداخت‌شده</span><strong>{money(summary.paidAmount)}</strong></div><div><span>مانده</span><strong>{money(summary.remainingAmount)}</strong></div></> : <div><span>مبلغ هر قسط</span><strong>{money(loan.defaultInstallmentAmount)}</strong></div>}</div>
          {/* A loan with no interest renders nothing here: the card already carries enough, and the
              absence of the strip is itself the statement that no interest is recorded. */}
          {interest && interest.monthlyRate !== null && interest.effectiveAnnualRate !== null && <div className="loan-interest">
            <span>سود</span>
            <strong>{formatPercentFixed(interest.monthlyRate * 100, 4)} ماهانه</strong>
            <strong>{formatPercentFixed(interest.effectiveAnnualRate * 100, 2)} مؤثر سالانه</strong>
            {/* A schedule that repays less than the principal yields a negative subtraction; the
                strip reports the disagreement rather than labelling a negative number «سود کل». */}
            {interest.totalInterest !== null && !interest.repaymentBelowPrincipal
              && <strong>{formatRial(interest.totalInterest)} سود کل</strong>}
            {interest.repaymentBelowPrincipal && <em className="loan-interest__badge">جمع اقساط از اصل وام کمتر است</em>}
            {interest.approximate && <em className="loan-interest__badge">تقریبی</em>}
          </div>}
          {isExpanded && <div className="loan-card__details">
            {loan.description && <p className="loan-description">{loan.description}</p>}
            {!installments.length && <p className="muted">برای این وام هنوز قسطی ثبت نشده است. با دکمه ویرایش روی کارت وام، تعداد اقساط و مبلغ هر قسط را وارد کنید.</p>}
            <div className="loan-installments">{installments.map((item, index) => {
            const effective = item.plannedAmount ?? loan.defaultInstallmentAmount;
            return <div className={`loan-installment ${item.isPaid ? 'loan-installment--paid' : ''}`} key={item.id}>
              <span className="loan-installment__number">{item.isPaid ? <CheckIcon /> : toPersianDigits(item.installmentNumber)}</span>
              <span className="loan-installment__body"><strong>قسط {toPersianDigits(item.installmentNumber)}</strong><span>{item.dueYear ? `سررسید ${formatJalaliDate(item.dueYear, item.dueMonth!, item.dueDay!)}` : 'بدون تاریخ سررسید'}</span></span>
              <span className="loan-installment__side"><strong>{money(item.isPaid ? item.paidAmount : effective)}</strong><div>{item.isPaid ? <button type="button" className="loan-action loan-action--cancel" onClick={async () => { setBusy(true); setError(''); try { await cancelInstallmentPayment(item.id); } catch (e) { setError(e instanceof Error ? e.message : 'لغو پرداخت انجام نشد.'); } finally { setBusy(false); } }} disabled={busy}>لغو پرداخت</button> : <><button type="button" className="loan-icon-btn" aria-label={`ویرایش مبلغ قسط ${toPersianDigits(item.installmentNumber)}`} onClick={() => { setAmountTarget(item); setInstallmentAmount(item.plannedAmount?.toString() ?? ''); setError(''); }}><EditIcon /></button><button type="button" className="loan-action" onClick={() => { setPaymentTarget({ detail, index }); setPaymentAmount(effective?.toString() ?? ''); setPaymentDate(item.dueYear !== null && item.dueMonth !== null && item.dueDay !== null ? { year: item.dueYear, month: item.dueMonth, day: item.dueDay } : today); setError(''); }}>ثبت پرداخت</button></>}</div></span>
            </div>;
          })}</div>
          </div>}
        </article>;
      })}</div>}

    <Sheet open={formOpen} onClose={() => setFormOpen(false)}>
      <h2 className="modal__title">{editing ? 'ویرایش وام' : 'افزودن وام'}</h2>
      <form className="loan-form" onSubmit={submit}>
        <div className="form-grid"><Field label="عنوان وام"><input className="input" autoFocus={!editing} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثلاً وام مسکن" /></Field><Field label="وام‌دهنده"><select className="select" value={form.lenderId} onChange={(e) => setForm({ ...form, lenderId: e.target.value })}><option value="">انتخاب کنید</option>{lenders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><Field label="دسته هزینه پرداخت"><select className="select" value={form.expenseCategoryId} onChange={(e) => setForm({ ...form, expenseCategoryId: e.target.value })}><option value="">انتخاب کنید</option>{categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><Field label="تعداد اقساط">{form.mode === 'dated' ? <><input className="input amount-input" inputMode="numeric" value={form.installmentCount} onChange={(e) => { const value = e.target.value; const count = Math.min(120, parseDigits(value)); setForm((prev) => { const next = { ...prev, installmentCount: value }; if (count > 0) { const end = endMonthFor(parseDigits(prev.startYear), parseDigits(prev.startMonth), count); next.endYear = String(end.year); next.endMonth = String(end.month); } return next; }); }} placeholder="خالی: از بازه محاسبه می‌شود" />{!form.installmentCount.trim() && rangeCount > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>از بازه انتخاب‌شده {toPersianDigits(Math.min(120, rangeCount))} قسط محاسبه می‌شود</div>}</> : <input className="input amount-input" inputMode="numeric" value={form.installmentCount} onChange={(e) => setForm({ ...form, installmentCount: e.target.value })} placeholder="مثلاً ۱۲" />}</Field><Field label="مبلغ اصل وام (اختیاری)"><input className="input amount-input" inputMode="numeric" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} placeholder="مبلغی که قرض گرفته‌اید، نه جمع اقساط" />{optionalAmount(form.principal) !== null && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{formatRial(optionalAmount(form.principal)!)}</div>}</Field><Field label="مبلغ پیش‌فرض هر قسط (اختیاری)"><input className="input amount-input" inputMode="numeric" value={form.defaultAmount} onChange={(e) => setForm({ ...form, defaultAmount: e.target.value })} placeholder="در صورت نامشخص بودن خالی بگذارید" />{optionalAmount(form.defaultAmount) !== null && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{formatRial(optionalAmount(form.defaultAmount)!)}</div>}</Field></div>
        <div className="loan-interest-form">
          <Field label="سود وام">
            <SegmentedControl
              value={form.interestMode}
              onChange={(interestMode) => setForm({ ...form, interestMode })}
              options={[
                { value: 'none', label: 'بدون سود' },
                { value: 'manual', label: 'نرخ دستی' },
                { value: 'auto', label: 'محاسبه خودکار' },
              ]}
            />
          </Field>
          {form.interestMode === 'manual' && <Field label="نرخ سود سالانه (٪)" className="field--full"><input className="input amount-input" inputMode="decimal" value={form.annualRate} onChange={(e) => setForm({ ...form, annualRate: e.target.value })} placeholder="مثلاً ۲۳" /></Field>}
          {form.interestMode === 'auto' && interestPreview?.monthlyRate === null && <p className="loan-schedule-note">
            {interestSpec.principal === null
              ? 'برای محاسبه خودکار سود، مبلغ اصل وام را وارد کنید.'
              : 'برای محاسبه خودکار سود، مبلغ هر قسط را مشخص کنید.'}
          </p>}
          {interestPreview && interestPreview.monthlyRate !== null && interestPreview.effectiveAnnualRate !== null && <div className="loan-interest-panel">
            <div><span>نرخ ماهانه</span><strong>{formatPercentFixed(interestPreview.monthlyRate * 100, 4)}</strong></div>
            {interestPreview.nominalAnnualRate !== null && <div><span>نرخ اسمی سالانه</span><strong>{formatPercentFixed(interestPreview.nominalAnnualRate * 100, 2)}</strong></div>}
            <div><span>نرخ مؤثر سالانه</span><strong>{formatPercentFixed(interestPreview.effectiveAnnualRate * 100, 2)}</strong></div>
            {interestPreview.totalRepayment !== null && <div><span>جمع بازپرداخت</span><strong>{formatRial(interestPreview.totalRepayment)}</strong></div>}
            {interestPreview.totalInterest !== null && !interestPreview.repaymentBelowPrincipal && <div><span>سود کل</span><strong>{formatRial(interestPreview.totalInterest)}</strong></div>}
            {interestPreview.repaymentBelowPrincipal && <p className="loan-schedule-note">جمع اقساط از اصل وام کمتر است؛ این دو عدد با هم نمی‌خوانند، مبالغ را بررسی کنید.</p>}
            {interestPreview.approximate && <p className="loan-schedule-note">مبالغ اقساط یکسان نیستند؛ نرخ محاسبه‌شده تقریبی است.</p>}
          </div>}
        </div>
        <label className="switch-row"><input type="checkbox" checked={form.includeInFixedExpenses} onChange={(e) => setForm({ ...form, includeInFixedExpenses: e.target.checked })} /><span>پرداخت اقساط در گزارش هزینه‌های ثابت محاسبه شود</span></label>
        <details className="loan-details"><summary>زمان‌بندی و جزئیات اختیاری</summary><div className="form-grid"><Field label="نوع برنامه"><select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as LoanMode })}><option value="term">فقط شماره اقساط</option><option value="dated">سررسید ماهانه</option></select></Field><Field label="تعداد اقساط پرداخت‌شده (اختیاری)"><input inputMode="numeric" value={form.paidCount} onChange={(e) => setForm({ ...form, paidCount: e.target.value })} placeholder={form.mode === 'dated' ? 'خالی: محاسبه خودکار تا ماه جاری' : '۰'} /></Field>{form.mode === 'dated' && <><Field label="ماه شروع" className="field--full"><JalaliDateFields monthOnly value={{ year: parseDigits(form.startYear), month: parseDigits(form.startMonth), day: 1 }} onChange={(value) => setForm((prev) => { const next = { ...prev, startYear: String(value.year), startMonth: String(value.month) }; const count = Math.min(120, parseDigits(prev.installmentCount)); if (count > 0) { const end = endMonthFor(value.year, value.month, count); next.endYear = String(end.year); next.endMonth = String(end.month); } return next; })} /></Field><Field label="ماه پایان" className="field--full"><JalaliDateFields monthOnly value={{ year: parseDigits(form.endYear), month: parseDigits(form.endMonth), day: 1 }} onChange={setRange} /></Field><Field label="روز سررسید (پیش‌فرض اول ماه)"><select className="select" value={form.dueDay || '1'} onChange={(e) => setForm({ ...form, dueDay: e.target.value })}>{Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <option key={day} value={day}>{toPersianDigits(day)}</option>)}</select></Field></>}<Field label="توضیحات"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
          {installmentCount > 0 && <details className="loan-details"><summary>مبلغ متفاوت برای بعضی اقساط</summary><div className="override-editor"><select value={overrideNumber} onChange={(e) => { const number = e.target.value; setOverrideNumber(number); setOverrideAmount(form.overrides[Number(number) - 1] ?? ''); }}>{Array.from({ length: installmentCount }, (_, i) => <option key={i} value={i + 1}>قسط {toPersianDigits(i + 1)}</option>)}</select><input inputMode="numeric" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} placeholder="مبلغ متفاوت" /><Button type="button" small onClick={() => { const number = Number(overrideNumber); if (!number || !overrideAmount.trim()) return; const overrides = [...form.overrides]; overrides[number - 1] = overrideAmount; setForm({ ...form, overrides }); setOverrideAmount(''); }}>افزودن / به‌روزرسانی</Button></div><div className="override-list">{form.overrides.slice(0, installmentCount).map((amount, i) => amount ? <span key={i}>قسط {toPersianDigits(i + 1)}: {formatRial(parseDigits(amount))}<button type="button" aria-label="حذف مبلغ متفاوت" onClick={() => { const overrides = [...form.overrides]; overrides[i] = ''; setForm({ ...form, overrides }); }}>×</button></span> : null)}</div></details>}
        </details>
        {error && <div className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger-soft-text)', marginBottom: 12 }}>{error}</div>}<div className="modal__actions"><Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>انصراف</Button><Button type="submit" disabled={busy}>{busy ? 'در حال ثبت…' : editing ? 'ذخیره تغییرات' : 'ثبت'}</Button></div>
      </form>
    </Sheet>

    <Sheet open={Boolean(paymentTarget)} onClose={() => setPaymentTarget(null)}>
      <h2 className="modal__title">ثبت پرداخت قسط</h2>
      <form className="loan-form" onSubmit={submitPayment}>
        <div className="form-grid"><Field label="مبلغ واقعی پرداخت" className="field--full"><input className="input amount-input" autoFocus inputMode="numeric" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></Field><Field label="تاریخ پرداخت (سررسید قسط)" className="field--full"><JalaliDateFields value={paymentDate} onChange={setPaymentDate} /></Field></div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal__actions"><Button type="button" variant="secondary" onClick={() => setPaymentTarget(null)}>انصراف</Button><Button type="submit" disabled={busy}>ثبت پرداخت</Button></div>
      </form>
    </Sheet>
    <Sheet open={Boolean(amountTarget)} onClose={() => setAmountTarget(null)}>
      <h2 className="modal__title">ویرایش مبلغ قسط</h2>
      <form className="loan-form" onSubmit={submitInstallmentAmount}>
        <div className="form-grid"><Field label="مبلغ اختصاصی قسط"><input className="input amount-input" autoFocus inputMode="numeric" value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} placeholder="برای استفاده از مبلغ پیش‌فرض خالی بگذارید" /></Field></div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal__actions"><Button type="button" variant="secondary" onClick={() => setAmountTarget(null)}>انصراف</Button><Button type="submit" disabled={busy}>ذخیره مبلغ</Button></div>
      </form>
    </Sheet>
    <ConfirmDialog open={Boolean(deleteTarget)} title="حذف وام" message="وام، اقساط و هزینه‌های پرداختی متصل به آن حذف می‌شوند. ادامه می‌دهید؟" confirmLabel="حذف" danger onCancel={() => setDeleteTarget(null)} onConfirm={async () => { if (deleteTarget) await deleteLoan(deleteTarget.loan.id); setDeleteTarget(null); }} />
  </section>;
}
