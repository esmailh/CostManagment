import { useEffect, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { resetAllData } from '../services/backup';
import { seedDefaultCategories } from '../db/seed';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ChevronRightIcon } from '../components/ui/Icons';
import { CategoriesManager } from './settings/CategoriesManager';
import { RecurringManager } from './settings/RecurringManager';
import { Backup } from './settings/Backup';
import { LendersManager } from './settings/LendersManager';

type View = 'root' | 'categories' | 'lenders' | 'recurring' | 'backup';

export function Settings() {
  const [view, setView] = useState<View>('root');
  const [theme, setTheme] = useTheme();
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (view === 'root') return;
    const onBack = (event: Event) => {
      if (document.querySelector('.backdrop, .sheet-backdrop')) return;
      event.preventDefault();
      setView('root');
    };
    window.addEventListener('app-back', onBack);
    return () => window.removeEventListener('app-back', onBack);
  }, [view]);

  if (view === 'categories') {
    return <CategoriesManager onBack={() => setView('root')} />;
  }
  if (view === 'lenders') {
    return <LendersManager onBack={() => setView('root')} />;
  }
  if (view === 'recurring') {
    return <RecurringManager onBack={() => setView('root')} />;
  }
  if (view === 'backup') {
    return <Backup onBack={() => setView('root')} />;
  }

  return (
    <div>
      <div className="card">
        <button type="button" className="settings-row" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('categories')}>
          <span>
            <div className="settings-row__title">دسته‌بندی‌ها</div>
            <div className="settings-row__sub">مدیریت دسته‌های هزینه</div>
          </span>
          <ChevronRightIcon width={20} height={20} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button type="button" className="settings-row" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('lenders')}>
          <span>
            <div className="settings-row__title">بانک‌ها و وام‌دهندگان</div>
            <div className="settings-row__sub">افزودن، ویرایش و انتخاب لوگو</div>
          </span>
          <ChevronRightIcon width={20} height={20} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button type="button" className="settings-row" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('recurring')}>
          <span>
            <div className="settings-row__title">هزینه‌های ثابت ماهانه</div>
            <div className="settings-row__sub">اجاره، قسط، اشتراک و…</div>
          </span>
          <ChevronRightIcon width={20} height={20} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button type="button" className="settings-row" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('backup')}>
          <span>
            <div className="settings-row__title">پشتیبان‌گیری</div>
            <div className="settings-row__sub">خروجی و بازیابی داده‌ها</div>
          </span>
          <ChevronRightIcon width={20} height={20} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      <div className="section-title">ظاهر</div>
      <div className="card">
        <SegmentedControl
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: 'روشن' },
            { value: 'dark', label: 'تاریک' },
            { value: 'system', label: 'سیستم' },
          ]}
        />
      </div>

      <div className="section-title">داده‌ها</div>
      <div className="card">
        <Button variant="danger-soft" block onClick={() => setResetOpen(true)}>
          حذف تمام اطلاعات
        </Button>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="حذف تمام اطلاعات"
        message="تمام هزینه‌ها، دسته‌بندی‌ها و تنظیمات حذف خواهند شد. این عملیات قابل بازگشت نیست."
        confirmLabel="حذف همه اطلاعات"
        danger
        onCancel={() => setResetOpen(false)}
        onConfirm={async () => {
          await resetAllData();
          await seedDefaultCategories();
          setResetOpen(false);
        }}
      />
    </div>
  );
}
