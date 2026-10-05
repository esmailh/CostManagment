import { useEffect, useState } from 'react';
import type { Category } from '../../db/types';
import { useCategories } from '../../hooks/useCategories';
import { addCategory, deleteCategory, updateCategory } from '../../services/categories';
import { SubPageHeader } from '../../components/SubPageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { EditIcon, TrashIcon } from '../../components/ui/Icons';
import { CategoryIcon } from '../../components/CategoryIcon';
import { PRESET_IMAGE_ICONS } from '../../lib/presetIcons';

const EMOJI_OPTIONS = [
  '🏠', '🧾', '🍲', '🚗', '🛒', '🩺', '🎮', '📚', '👕',
  '🔁', '🏦', '📦', '💳', '🎁', '✈️', '💊', '🐾', '📱', '💡', '🚌',
];

interface CategoryDraft {
  name: string;
  icon: string | null;
}

interface Props {
  onBack: () => void;
}

export function CategoriesManager({ onBack }: Props) {
  const categories = useCategories();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [message, setMessage] = useState('');

  const handleDelete = async () => {
    if (!deleting) return;
    const result = await deleteCategory(deleting.id);
    if (!result.ok) {
      setMessage('این دسته‌بندی توسط هزینه‌ها استفاده می‌شود و قابل حذف نیست.');
    }
    setDeleting(null);
  };

  return (
    <div>
      <SubPageHeader onBack={onBack} title="دسته‌بندی‌ها" />

      {message && (
        <div className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger-soft-text)', marginBottom: 12 }}>
          {message}
        </div>
      )}

      <Button block onClick={() => setAdding(true)}>
        + دسته‌بندی جدید
      </Button>

      <div className="card" style={{ marginTop: 12 }}>
        {categories.map((c) => (
          <div className="list-item" key={c.id}>
            <div className="list-item__icon"><CategoryIcon icon={c.icon} fallback="🏷️" alt={c.name} /></div>
            <div className="list-item__body">
              <div className="list-item__title">{c.name}</div>
            </div>
            <button
              type="button"
              className="month-switcher__btn"
              onClick={() => setEditing(c)}
              aria-label="ویرایش"
            >
              <EditIcon width={16} height={16} />
            </button>
            <button
              type="button"
              className="month-switcher__btn"
              onClick={() => setDeleting(c)}
              aria-label="حذف"
              style={{ color: 'var(--danger)' }}
            >
              <TrashIcon width={16} height={16} />
            </button>
          </div>
        ))}
      </div>

      <CategoryForm
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={async (draft) => {
          await addCategory(draft.name, draft.icon);
          setAdding(false);
        }}
      />
      <CategoryForm
        open={editing !== null}
        initial={editing}
        onClose={() => setEditing(null)}
        onSubmit={async (draft) => {
          if (editing) await updateCategory(editing.id, draft);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="حذف دسته‌بندی"
        message={`«${deleting?.name ?? ''}» حذف شود؟`}
        confirmLabel="حذف"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function CategoryForm({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: Category | null;
  onClose: () => void;
  onSubmit: (draft: CategoryDraft) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setIcon(initial?.icon ?? null);
      setError('');
    }
  }, [open, initial]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('نام دسته‌بندی را وارد کنید.');
      return;
    }
    await onSubmit({ name: name.trim(), icon });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'ویرایش دسته‌بندی' : 'دسته‌بندی جدید'}>
      {error && (
        <div className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger-soft-text)', marginBottom: 12 }}>
          {error}
        </div>
      )}
      <Field label="نام">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثلاً رستوران"
          autoFocus
        />
      </Field>
      <Field label="آیکون (اختیاری)">
        <div className="icon-grid">
          <button
            type="button"
            className={'icon-option' + (icon === null ? ' icon-option--selected' : '')}
            onClick={() => setIcon(null)}
            aria-label="بدون آیکون"
          >
            ✕
          </button>
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={'icon-option' + (icon === emoji ? ' icon-option--selected' : '')}
              onClick={() => setIcon(emoji)}
            >
              {emoji}
            </button>
          ))}
          {PRESET_IMAGE_ICONS.map((option) => (
            <button
              key={option.path}
              type="button"
              className={'icon-option' + (icon === option.path ? ' icon-option--selected' : '')}
              onClick={() => setIcon(option.path)}
              aria-label={option.label}
              title={option.label}
            >
              <CategoryIcon icon={option.path} fallback="🖼️" alt={option.label} />
            </button>
          ))}
        </div>
      </Field>
      <div className="modal__actions">
        <Button variant="secondary" onClick={onClose}>
          انصراف
        </Button>
        <Button onClick={handleSubmit}>ذخیره</Button>
      </div>
    </Modal>
  );
}
