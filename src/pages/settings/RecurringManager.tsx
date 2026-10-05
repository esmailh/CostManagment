import { useEffect, useState } from 'react';
import type { Category, RecurringExpense } from '../../db/types';
import { useCategories } from '../../hooks/useCategories';
import { useRecurring } from '../../hooks/useRecurring';
import {
  addRecurring,
  deleteRecurring,
  updateRecurring,
  type RecurringInput,
} from '../../services/recurringExpenses';
import { SubPageHeader } from '../../components/SubPageHeader';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { EditIcon, TrashIcon } from '../../components/ui/Icons';
import { formatRial, parseDigits } from '../../lib/format';
import { toPersianDigits } from '../../lib/jalaali';

interface Props {
  onBack: () => void;
}

export function RecurringManager({ onBack }: Props) {
  const recurring = useRecurring();
  const categories = useCategories();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [deleting, setDeleting] = useState<RecurringExpense | null>(null);

  const categoryOf = (id: string) => categories.find((c) => c.id === id);

  return (
    <div>
      <SubPageHeader onBack={onBack} title="هزینه‌های ثابت ماهانه" />

      <Button block onClick={() => setAdding(true)}>
        + هزینه ثابت جدید
      </Button>

      <div className="card" style={{ marginTop: 12 }}>
        {recurring.length === 0 && (
          <EmptyState emoji="📆" title="هزینه ثابتی تعریف نشده" subtitle="اجاره، قسط و اشتراک‌ها را اینجا ثبت کنید." />
        )}
        {recurring.map((r) => (
          <div className="list-item" key={r.id} style={{ opacity: r.isActive ? 1 : 0.55 }}>
            <div className="list-item__icon">
              <CategoryIcon
                icon={categoryOf(r.categoryId)?.icon}
                fallback="💠"
                alt={categoryOf(r.categoryId)?.name}
              />
            </div>
            <div className="list-item__body">
              <div className="list-item__title">{r.title}</div>
              <div className="list-item__sub">
                روز {toPersianDigits(r.dayOfMonth)} ماه
                {!r.isActive && ' · غیرفعال'}
              </div>
            </div>
            <div className="list-item__amount">{formatRial(r.amount)}</div>
            <button
              type="button"
              className="month-switcher__btn"
              onClick={() => setEditing(r)}
              aria-label="ویرایش"
            >
              <EditIcon width={16} height={16} />
            </button>
            <button
              type="button"
              className="month-switcher__btn"
              onClick={() => setDeleting(r)}
              aria-label="حذف"
              style={{ color: 'var(--danger)' }}
            >
              <TrashIcon width={16} height={16} />
            </button>
          </div>
        ))}
      </div>

      <RecurringForm
        open={adding}
        categories={categories}
        onClose={() => setAdding(false)}
        onSubmit={async (input) => {
          await addRecurring(input);
          setAdding(false);
        }}
      />
      <RecurringForm
        open={editing !== null}
        initial={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSubmit={async (input) => {
          if (editing) await updateRecurring(editing.id, input);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="حذف هزینه ثابت"
        message={`«${deleting?.title ?? ''}» حذف شود؟ هزینه‌های قبلی ثبت‌شده از روی آن حذف نمی‌شوند.`}
        confirmLabel="حذف"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteRecurring(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function RecurringForm({
  open,
  initial,
  categories,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: RecurringExpense | null;
  categories: Category[];
  onClose: () => void;
  onSubmit: (input: RecurringInput) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setAmount(initial ? String(initial.amount) : '');
      setCategoryId(initial?.categoryId ?? categories[0]?.id ?? '');
      setDayOfMonth(initial?.dayOfMonth ?? 1);
      setDescription(initial?.description ?? '');
      setIsActive(initial?.isActive ?? true);
      setError('');
    }
  }, [open, initial, categories]);

  const amountNum = parseDigits(amount);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('عنوان را وارد کنید.');
      return;
    }
    if (amountNum <= 0) {
      setError('مبلغ باید بزرگ‌تر از صفر باشد.');
      return;
    }
    if (!categoryId) {
      setError('دسته‌بندی را انتخاب کنید.');
      return;
    }
    await onSubmit({
      title: title.trim(),
      amount: amountNum,
      categoryId,
      dayOfMonth,
      description,
      isActive,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'ویرایش هزینه ثابت' : 'هزینه ثابت جدید'}>
      {error && (
        <div className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger-soft-text)', marginBottom: 12 }}>
          {error}
        </div>
      )}
      <Field label="عنوان">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثلاً اجاره خانه"
          autoFocus
        />
      </Field>
      <Field label="مبلغ (ریال)">
        <input
          className="input amount-input"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
      </Field>
      <Field label="دسته‌بندی">
        <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {!categoryId && <option value="">انتخاب کنید</option>}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="روز ماه">
        <select
          className="select"
          value={dayOfMonth}
          onChange={(e) => setDayOfMonth(Number(e.target.value))}
        >
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              روز {toPersianDigits(d)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="توضیحات (اختیاری)">
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
        />
        <span>فعال</span>
      </label>
      <div className="modal__actions">
        <Button variant="secondary" onClick={onClose}>
          انصراف
        </Button>
        <Button onClick={handleSubmit}>ذخیره</Button>
      </div>
    </Modal>
  );
}
