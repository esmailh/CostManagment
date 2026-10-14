import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { AppProvider } from './context/AppContext';
import { useTheme } from './hooks/useTheme';
import { Onboarding } from './components/Onboarding';
import { Layout } from './components/Layout';
import { AddExpense } from './pages/AddExpense';
import { useApp } from './context/AppContext';
import { reconcileLoanReminders } from './services/loanReminders';
import { useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';

const ONBOARDING_KEY = 'expense-tracker:onboarded';

function Root() {
  useTheme();
  const { tab, setTab, addOpen, setAddOpen } = useApp();
  const { profile, authenticated, lock } = useAuth();
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDING_KEY) === '1');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => {
      const event = new Event('app-back', { cancelable: true });
      window.dispatchEvent(event);
      if (event.defaultPrevented) return;
      if (addOpen) setAddOpen(false);
      else if (tab !== 'home') setTab('home');
      else void NativeApp.exitApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [addOpen, setAddOpen, setTab, tab]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void reconcileLoanReminders();
      else if (authenticated) lock();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [authenticated, lock]);

  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          localStorage.setItem(ONBOARDING_KEY, '1');
          setOnboarded(true);
        }}
      />
    );
  }

  if (!profile || !authenticated) return <AuthScreen />;

  return (
    <>
      <Layout />
      <AddExpense />
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
