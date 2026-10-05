import { useState } from 'react';
import type { Category, Expense } from '../db/types';
import type { ExpenseInput } from '../services/expenses';
import { formatRial, parseDigits } from '../lib/format';
import { monthLength, todayJalali } from '../lib/jalaali';
import { JalaliDateFields } from './JalaliDateFields';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { isImageIcon } from './CategoryIcon';

interface ExpenseFormProps {
  categories: Category[];
  initial?: Expense;
  submitLabel?: string;
  onSubmit: (input: ExpenseInput) => Promise<void>;
  onCancel: () => void;
}

export function ExpenseForm({
  categories,
  initial,
  submitLabel = 'ذخیره',
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  const today = todayJalali();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '');
  const [year, setYear] = useState(initial?.year ?? today.year);
  const [month, setMonth] = useState(initial?.month ?? today.month);
  const [day, setDay] = useState(initial?.day ?? today.day);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');

  const amountNum = parseDigits(amount);
  const monthLen = monthLength(year, month);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('عنوان هزینه را وارد کنید.');
      return;
    }
    if (amountNum <= 0) {
      setError('مبلغ باید بزرگ‌تر از صفر باشد.');
      return;
    }
    if (!categoryId) {
      setError('یک دسته‌بندی انتخاب کنید.');
      return;
    }
    setError('');
    await onSubmit({
      title: trimmedTitle,
      amount: amountNum,
      categoryId,
      year,
      month,
      day: Math.min(day, monthLen),
      description,
    });
  };

  return (
    <div>
      {error && (
        <div className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger-soft-text)', marginBottom: 12 }}>
          {error}
        </div>
      )}

      <Field label="مبلغ (ریال)">
        <input
          className="input amount-input"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          autoFocus={!initial}
        />
        {amountNum > 0 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {formatRial(amountNum)}
          </div>
        )}
      </Field>

      <Field label="عنوان">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثلاً خرید سوپرمارکت"
        />
      </Field>

      <Field label="دسته‌بندی">
        <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {!categoryId && <option value="">انتخاب کنید</option>}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon && !isImageIcon(c.icon) ? `${c.icon} ` : ''}
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="تاریخ">
        <JalaliDateFields
          value={{ year, month, day }}
          onChange={(value) => {
            setYear(value.year);
            setMonth(value.month);
            setDay(value.day);
          }}
        />
      </Field>

      <Field label="توضیحات (اختیاری)">
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="توضیح کوتاه"
        />
      </Field>

      <div className="modal__actions">
        <Button variant="secondary" onClick={onCancel}>
          انصراف
        </Button>
        <Button onClick={handleSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );
}
