import { useRef, useState } from 'react';
import type { BackupData } from '../../services/backup';
import {
  createBackup,
  downloadBackup,
  importBackup,
  validateBackup,
  type ImportMode,
} from '../../services/backup';
import { SubPageHeader } from '../../components/SubPageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { DownloadIcon, UploadIcon } from '../../components/ui/Icons';
import { formatNumber } from '../../lib/format';

interface Props {
  onBack: () => void;
}

export function Backup({ onBack }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupData | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleExport = async () => {
    setError('');
    try {
      const data = await createBackup();
      await downloadBackup(data);
    } catch {
      setError('ساخت یا ذخیره فایل پشتیبان ممکن نشد.');
    }
  };

  const handleFile = async (file: File) => {
    setError('');
    setSuccess(false);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!validateBackup(data)) {
        setError('فایل پشتیبان نامعتبر است.');
        return;
      }
      setPending(data);
    } catch {
      setError('خواندن فایل ممکن نشد.');
    }
  };

  const doImport = async (mode: ImportMode) => {
    if (!pending) return;
    try {
      await importBackup(pending, mode);
      setPending(null);
      setSuccess(true);
    } catch {
      setError('بازیابی اطلاعات ممکن نشد و داده‌های فعلی تغییر نکرد.');
    }
  };

  return (
    <div>
      <SubPageHeader onBack={onBack} title="پشتیبان‌گیری" />

      {error && (
        <div className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger-soft-text)', marginBottom: 12 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="badge" style={{ background: 'var(--success-soft)', color: 'var(--success)', marginBottom: 12 }}>
          بازیابی با موفقیت انجام شد.
        </div>
      )}

      <div className="card">
        <Button block variant="secondary" onClick={handleExport}>
          <DownloadIcon width={18} height={18} /> خروجی پشتیبان (JSON)
        </Button>
        <div style={{ height: 10 }} />
        <Button block variant="secondary" onClick={() => fileRef.current?.click()}>
          <UploadIcon width={18} height={18} /> بازیابی از پشتیبان
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="section-title">درباره پشتیبان</div>
      <p className="muted" style={{ fontSize: 13 }}>
        فایل پشتیبان شامل همه هزینه‌ها، هزینه‌های ثابت و دسته‌بندی‌هاست. برای جابه‌جایی داده‌ها بین
        دستگاه‌ها یا نگهداری نسخه امن از آن استفاده کنید.
      </p>

      <Modal open={pending !== null} onClose={() => setPending(null)} title="بازیابی پشتیبان">
        {pending && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              این فایل شامل {formatNumber(pending.categories.length)} دسته‌بندی،{' '}
              {formatNumber(pending.recurringExpenses.length)} هزینه ثابت و{' '}
              {formatNumber(pending.expenses.length)} هزینه است.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
              <Button block onClick={() => doImport('merge')}>
                ادغام با داده‌های فعلی
              </Button>
              <Button block variant="danger" onClick={() => setReplaceConfirm(true)}>
                جایگزینی همه داده‌ها
              </Button>
              <Button block variant="ghost" onClick={() => setPending(null)}>
                انصراف
              </Button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={replaceConfirm}
        title="جایگزینی همه داده‌ها"
        message="همه داده‌های فعلی پاک و با محتوای فایل پشتیبان جایگزین می‌شود. این عملیات قابل بازگشت نیست."
        confirmLabel="جایگزینی"
        danger
        onCancel={() => setReplaceConfirm(false)}
        onConfirm={() => {
          setReplaceConfirm(false);
          void doImport('replace');
        }}
      />
    </div>
  );
}
