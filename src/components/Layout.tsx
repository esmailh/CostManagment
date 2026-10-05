import { useApp, type Tab } from '../context/AppContext';
import { BottomNav } from './BottomNav';
import { Dashboard } from '../pages/Dashboard';
import { Expenses } from '../pages/Expenses';
import { Reports } from '../pages/Reports';
import { Settings } from '../pages/Settings';
import { Loans } from '../pages/Loans';
import { PlusIcon } from './ui/Icons';

const TITLES: Record<Tab, string> = {
  home: 'خانه',
  expenses: 'هزینه‌های ماه',
  loans: 'وام‌ها و اقساط',
  reports: 'گزارش‌ها',
  settings: 'تنظیمات',
};

export function Layout() {
  const { tab, setAddOpen } = useApp();
  const isLoans = tab === 'loans';

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">{TITLES[tab]}</h1>
        <button
          type="button"
          className="app__add-expense"
          onClick={() => setAddOpen(true)}
          aria-label={isLoans ? 'افزودن وام' : 'ثبت هزینه جدید'}
        >
          <PlusIcon />
          <span>{isLoans ? 'افزودن وام' : 'هزینه جدید'}</span>
        </button>
      </header>
      <main className="app__main">
        {tab === 'home' && <Dashboard />}
        {tab === 'expenses' && <Expenses />}
        {tab === 'loans' && <Loans />}
        {tab === 'reports' && <Reports />}
        {tab === 'settings' && <Settings />}
      </main>
      <BottomNav />
    </div>
  );
}
