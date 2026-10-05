import { ChevronRightIcon } from './ui/Icons';

interface SubPageHeaderProps {
  onBack: () => void;
  title: string;
}

export function SubPageHeader({ onBack, title }: SubPageHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <button type="button" className="month-switcher__btn" onClick={onBack} aria-label="بازگشت">
        <ChevronRightIcon width={18} height={18} />
      </button>
      <h2 style={{ fontSize: 17, fontWeight: 700 }}>{title}</h2>
    </div>
  );
}
