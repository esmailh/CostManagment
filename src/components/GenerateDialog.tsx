import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { generateRecurringExpenses, getGenerationStatus } from '../services/generation';
import { formatMonthName } from '../lib/jalaali';
import { formatRial } from '../lib/format';
import { Button } from './ui/Button';
import { CheckIcon } from './ui/Icons';
import { Modal } from './ui/Modal';
import { EmptyState } from './ui/EmptyState';

interface GenerateDialogProps {
  open: boolean;
  onClose: () => void;
}

export function GenerateDialog({ open, onClose }: GenerateDialogProps) {
  const { year, month } = useApp();
  const status = useLiveQuery(() => getGenerationStatus(year, month), [year, month]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const pending = (status ?? []).filter((s) => !s.alreadyGenerated);
  const already = (status ?? []).filter((s) => s.alreadyGenerated);

  const handleGenerate = async () => {
    setBusy(true);
    const count = await generateRecurringExpenses(year, month);
    setResult(count);
    setBusy(false);
  };

  const renderRow = (s: { recurring: { title: string; amount: number }; alreadyGenerated: boolean }) => (
    <div className="list-item" key={s.recurring.title}>
      <div className="list-item__icon">
        {s.alreadyGenerated ? <CheckIcon width={20} height={20} style={{ color: 'var(--success)' }} /> : '💠'}
      </div>
      <div className="list-item__body">
        <div className="list-item__title">{s.recurring.title}</div>
        <div className="list-item__sub">{s.alreadyGenerated ? 'ثبت شده' : 'در انتظار'}</div>
      </div>
      <div className="list-item__amount">{formatRial(s.recurring.amount)}</div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={`هزینه‌های ثابت ${formatMonthName(year, month)}`}>
      {status && status.length === 0 && (
        <EmptyState emoji="📭" title="هزینه ثابتی تعریف نشده است" subtitle="ابتدا از تنظیمات یک هزینه ثابت بسازید." />
      )}

      {pending.length > 0 && <div className="section-title">در انتظار ثبت</div>}
      {pending.map((s) => renderRow(s))}

      {already.length > 0 && <div className="section-title">ثبت شده</div>}
      {already.map((s) => renderRow(s))}

      {result !== null && (
        <div className="badge" style={{ background: 'var(--success-soft)', color: 'var(--success)', marginTop: 8 }}>
          {result} هزینه ثبت شد.
        </div>
      )}

      <div className="modal__actions">
        <Button variant="secondary" onClick={onClose}>
          بستن
        </Button>
        <Button onClick={handleGenerate} disabled={busy || pending.length === 0}>
          {busy ? 'در حال ثبت…' : `ثبت ${pending.length} هزینه`}
        </Button>
      </div>
    </Modal>
  );
}
