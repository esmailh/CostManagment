import { useMemo, useState } from 'react';
import type { Expense } from '../db/types';
import { useApp } from '../context/AppContext';
import { useCategories } from '../hooks/useCategories';
import { useLoanLenderIcons } from '../hooks/useLoanLenderIcons';
import { useMonthExpenses } from '../hooks/useMonthExpenses';
import { deleteExpense, updateExpense } from '../services/expenses';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { ExpenseForm } from '../components/ExpenseForm';
import { CategoryIcon } from '../components/CategoryIcon';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EditIcon, TrashIcon } from '../components/ui/Icons';
import { formatJalaliDate } from '../lib/jalaali';
import { formatNumber, formatRial, parseDigits } from '../lib/format';

type TypeFilter = 'all' | 'fixed' | 'daily';

export function Expenses() {
  const { year, month } = useApp();
  const expenses = useMonthExpenses(year, month);
  const categories = useCategories();
  const loanLenderIcons = useLoanLenderIcons();

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const [detail, setDetail] = useState<Expense | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const categoryOf = (id: string) => categories.find((c) => c.id === id);

  /**
   * An installment expense belongs to one lender, so it shows that bank's logo
   * instead of the shared «اقساط» category icon — several loans paid in the same
   * month would otherwise all look alike. Anything without a lender logo (a
   * non-installment expense, or a loan whose lender has none) keeps the category
   * icon, which is also the fallback when the logo image fails to load.
   */
  const iconOf = (expense: Expense) => {
    const category = categoryOf(expense.categoryId);
    const lenderIcon = expense.loanId ? loanLenderIcons.get(expense.loanId) : null;
    return (
      <CategoryIcon
        icon={lenderIcon || category?.icon}
        fallback={category?.icon ?? '📦'}
        alt={category?.name}
      />
    );
  };

  const filtered = useMemo(() => {
    const min = parseDigits(minAmount);
    const max = parseDigits(maxAmount);
    const q = search.trim();

    let rows = expenses;
    if (q) rows = rows.filter((e) => e.title.includes(q) || e.description.includes(q));
    if (catFilter) rows = rows.filter((e) => e.categoryId === catFilter);
    if (typeFilter === 'fixed') rows = rows.filter((e) => e.isRecurring);
    if (typeFilter === 'daily') rows = rows.filter((e) => !e.isRecurring);
    if (minAmount !== '') rows = rows.filter((e) => e.amount >= min);
    if (maxAmount !== '') rows = rows.filter((e) => e.amount <= max);

    if (sortBy === 'date') {
      return [...rows].sort((a, b) => b.day - a.day || b.createdAt.localeCompare(a.createdAt));
    }
    return [...rows].sort((a, b) => b.amount - a.amount);
  }, [expenses, search, catFilter, typeFilter, sortBy, minAmount, maxAmount]);

  const filteredSum = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <MonthSwitcher />

      <div className="filter-bar">
        <input
          className="input filter-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجوی عنوان…"
        />
        <select className="select" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="">همه دسته‌ها</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <SegmentedControl<TypeFilter>
        value={typeFilter}
        onChange={setTypeFilter}
        options={[
          { value: 'all', label: 'همه' },
          { value: 'fixed', label: 'ثابت' },
          { value: 'daily', label: 'روزانه' },
        ]}
      />

      <div className="filter-bar" style={{ marginTop: 8 }}>
        <input
          className="input"
          inputMode="numeric"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
          placeholder="حداقل مبلغ"
          style={{ flex: 1 }}
        />
        <input
          className="input"
          inputMode="numeric"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
          placeholder="حداکثر مبلغ"
          style={{ flex: 1 }}
        />
        <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')} style={{ flex: 1 }}>
          <option value="date">مرتب‌سازی: تاریخ</option>
          <option value="amount">مرتب‌سازی: مبلغ</option>
        </select>
      </div>

      <div className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
        {formatNumber(filtered.length)} هزینه · مجموع {formatRial(filteredSum)}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title={expenses.length === 0 ? 'هزینه‌ای در این ماه ثبت نشده' : 'موردی یافت نشد'}
          subtitle={expenses.length === 0 ? 'با دکمه + هزینه ثبت کنید.' : 'فیلترها را تغییر دهید.'}
        />
      ) : (
        <div className="card">
          {filtered.map((e) => {
            const cat = categoryOf(e.categoryId);
            return (
              <button
                key={e.id}
                type="button"
                className="list-item"
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'right', cursor: 'pointer' }}
                onClick={() => setDetail(e)}
              >
                <div className="list-item__icon">{iconOf(e)}</div>
                <div className="list-item__body">
                  <div className="list-item__title">
                    {e.isRecurring && <span className="badge chip--recurring" style={{ marginLeft: 6 }}>ثابت</span>}
                    {e.title}
                  </div>
                  <div className="list-item__sub">
                    {cat?.name ?? 'نامشخص'} · {formatJalaliDate(e.year, e.month, e.day)}
                  </div>
                </div>
                <div className="list-item__amount">{formatRial(e.amount)}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title="جزئیات هزینه">
        {detail && (
          <div>
            {(() => {
              const cat = categoryOf(detail.categoryId);
              return (
                <div className="list-item" style={{ padding: '0 0 12px' }}>
                  <div className="list-item__icon">{iconOf(detail)}</div>
                  <div className="list-item__body">
                    <div className="list-item__title">{detail.title}</div>
                    <div className="list-item__sub">{cat?.name ?? 'نامشخص'}</div>
                  </div>
                  <div className="list-item__amount">{formatRial(detail.amount)}</div>
                </div>
              );
            })()}
            <p className="muted" style={{ margin: '8px 0' }}>
              تاریخ: {formatJalaliDate(detail.year, detail.month, detail.day)}
              {detail.isRecurring && ' · هزینه ثابت'}
            </p>
            {detail.description && <p style={{ margin: '8px 0' }}>{detail.description}</p>}
            <div className="modal__actions">
              <Button variant="danger-soft" onClick={() => setDeleting(detail)}>
                <TrashIcon width={16} height={16} /> حذف
              </Button>
              <Button
                onClick={() => {
                  setEditing(detail);
                  setDetail(null);
                }}
              >
                <EditIcon width={16} height={16} /> ویرایش
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit modal */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="ویرایش هزینه">
        {editing && (
          <ExpenseForm
            categories={categories}
            initial={editing}
            submitLabel="ذخیره"
            onSubmit={async (input) => {
              await updateExpense(editing.id, input);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title="حذف هزینه"
        message={`«${deleting?.title ?? ''}» حذف شود؟ این عملیات قابل بازگشت نیست.`}
        confirmLabel="حذف"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteExpense(deleting.id);
          setDeleting(null);
          setDetail(null);
        }}
      />
    </div>
  );
}
