import { useApp, type Tab } from '../context/AppContext';
import { ChartIcon, HomeIcon, ListIcon, SettingsIcon, WalletIcon } from './ui/Icons';

interface NavItem {
  tab: Tab;
  label: string;
  Icon: typeof HomeIcon;
}

const ITEMS: NavItem[] = [
  { tab: 'home', label: 'خانه', Icon: HomeIcon },
  { tab: 'expenses', label: 'هزینه‌ها', Icon: ListIcon },
  { tab: 'loans', label: 'وام‌ها', Icon: WalletIcon },
  { tab: 'reports', label: 'گزارش‌ها', Icon: ChartIcon },
  { tab: 'settings', label: 'تنظیمات', Icon: SettingsIcon },
];

export function BottomNav() {
  const { tab, setTab } = useApp();

  const renderItem = ({ tab: itemTab, label, Icon }: NavItem) => (
    <button
      key={itemTab}
      type="button"
      className={'bottom-nav__item' + (tab === itemTab ? ' bottom-nav__item--active' : '')}
      onClick={() => setTab(itemTab)}
    >
      <Icon />
      <span>{label}</span>
    </button>
  );

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav__inner">
        {ITEMS.map(renderItem)}
      </div>
    </nav>
  );
}
