import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { todayJalali } from '../lib/jalaali';

export type Tab = 'home' | 'expenses' | 'loans' | 'reports' | 'settings';

interface AppState {
  tab: Tab;
  setTab: (tab: Tab) => void;
  year: number;
  month: number;
  setMonth: (year: number, month: number) => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const today = useMemo(() => todayJalali(), []);
  const [tab, setTab] = useState<Tab>('home');
  const [selected, setSelected] = useState({ year: today.year, month: today.month });
  const [addOpen, setAddOpen] = useState(false);

  const value = useMemo<AppState>(
    () => ({
      tab,
      setTab,
      year: selected.year,
      month: selected.month,
      setMonth: (year, month) => setSelected({ year, month }),
      addOpen,
      setAddOpen,
    }),
    [tab, selected, addOpen],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
