import { useEffect, useRef, useState } from 'react';
import type { Lender } from '../../db/types';
import { CategoryIcon } from '../../components/CategoryIcon';
import { SubPageHeader } from '../../components/SubPageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { EditIcon, TrashIcon, UploadIcon } from '../../components/ui/Icons';
import { Modal } from '../../components/ui/Modal';
import { useLenders } from '../../hooks/useLenders';
import { imageFileToDataUrl } from '../../lib/image';
import { PRESET_IMAGE_ICONS } from '../../lib/presetIcons';
import { addLender, deleteLender, updateLender } from '../../services/lenders';

const ICON_OPTIONS = ['🏦', '💳', '💰', '🤝', '👤', '🏢'];

interface Props { onBack: () => void }
interface Draft { name: string; icon: string | null }

export function LendersManager({ onBack }: Props) {
  const lenders = useLenders();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Lender | null>(null);
  const [deleting, setDeleting] = useState<Lender | null>(null);
  const [message, setMessage] = useState('');

  const handleDelete = async () => {
    if (!deleting) return;
    if (!(await deleteLender(deleting.id))) {
      setMessage('این بانک یا وام‌دهنده در وام‌ها استفاده شده و قابل حذف نیست.');
    }
    setDeleting(null);
  };

  return (
    <div>
      <SubPageHeader onBack={onBack} title="بانک‌ها و وام‌دهندگان" />
      {message && <div className="loan-error">{message}</div>}
      <Button block onClick={() => setAdding(true)}>+ بانک یا وام‌دهنده جدید</Button>
      <div className="card" style={{ marginTop: 12 }}>
        {lenders.length === 0 && <div className="empty" style={{ padding: 20 }}>هنوز بانکی ثبت نشده است.</div>}
        {lenders.map((lender) => (
          <div className="list-item" key={lender.id}>
            <div className="list-item__icon"><CategoryIcon icon={lender.icon} fallback="🏦" alt={lender.name} /></div>
            <div className="list-item__body"><div className="list-item__title">{lender.name}</div></div>
            <button type="button" className="month-switcher__btn" onClick={() => setEditing(lender)} aria-label={`ویرایش ${lender.name}`}>
              <EditIcon width={16} height={16} />
            </button>
            <button type="button" className="month-switcher__btn" onClick={() => setDeleting(lender)} aria-label={`حذف ${lender.name}`} style={{ color: 'var(--danger)' }}>
              <TrashIcon width={16} height={16} />
            </button>
          </div>
        ))}
      </div>

      <LenderForm open={adding} onClose={() => setAdding(false)} onSubmit={async (draft) => {
        await addLender(draft.name, draft.icon);
        setAdding(false);
      }} />
      <LenderForm open={editing !== null} initial={editing} onClose={() => setEditing(null)} onSubmit={async (draft) => {
        if (editing) await updateLender(editing.id, draft);
        setEditing(null);
      }} />
      <ConfirmDialog open={deleting !== null} title="حذف بانک یا وام‌دهنده" message={`«${deleting?.name ?? ''}» حذف شود؟`} confirmLabel="حذف" danger onCancel={() => setDeleting(null)} onConfirm={handleDelete} />
    </div>
  );
}

function LenderForm({ open, initial, onClose, onSubmit }: {
  open: boolean;
  initial?: Lender | null;
  onClose: () => void;
  onSubmit: (draft: Draft) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>('🏦');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setIcon(initial?.icon ?? '🏦');
    setError('');
    setProcessing(false);
  }, [open, initial]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setProcessing(true);
    setError('');
    try {
      setIcon(await imageFileToDataUrl(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'افزودن لوگو ناموفق بود.');
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return setError('نام بانک یا وام‌دهنده را وارد کنید.');
    setProcessing(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), icon });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ذخیره اطلاعات ناموفق بود.');
      setProcessing(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'ویرایش بانک یا وام‌دهنده' : 'بانک یا وام‌دهنده جدید'}>
      {error && <div className="loan-error">{error}</div>}
      <Field label="نام">
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="مثلاً بانک ملت" autoFocus />
      </Field>
      <Field label="لوگو یا آیکون">
        <div className="lender-logo-preview"><CategoryIcon icon={icon} fallback="🏦" alt={name || 'پیش‌نمایش لوگو'} /></div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void handleFile(event.target.files?.[0])} />
        <Button type="button" variant="secondary" block small disabled={processing} onClick={() => inputRef.current?.click()}>
          <UploadIcon width={17} height={17} /> {processing ? 'در حال پردازش…' : 'انتخاب لوگو از گوشی'}
        </Button>
        <div className="icon-grid lender-icon-grid">
          {ICON_OPTIONS.map((option) => <button key={option} type="button" className={'icon-option' + (icon === option ? ' icon-option--selected' : '')} onClick={() => setIcon(option)}>{option}</button>)}
          {PRESET_IMAGE_ICONS.map((option) => <button key={option.path} type="button" className={'icon-option' + (icon === option.path ? ' icon-option--selected' : '')} onClick={() => setIcon(option.path)} aria-label={option.label} title={option.label}><CategoryIcon icon={option.path} fallback="🖼️" alt={option.label} /></button>)}
        </div>
      </Field>
      <div className="modal__actions">
        <Button variant="secondary" onClick={onClose} disabled={processing}>انصراف</Button>
        <Button onClick={() => void handleSubmit()} disabled={processing}>ذخیره</Button>
      </div>
    </Modal>
  );
}