import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import * as auth from '../services/auth';

interface AuthContextValue {
  profile: auth.UserProfile | null;
  authenticated: boolean;
  setup(displayName: string, username: string, password: string): Promise<void>;
  login(username: string, password: string): Promise<boolean>;
  biometricLogin(): Promise<boolean>;
  lock(): void;
  clearAccount(): Promise<void>;
  refresh(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(auth.getProfile());
  const [authenticated, setAuthenticatedState] = useState(auth.isAuthenticated());

  const markAuthenticated = useCallback(() => {
    auth.setAuthenticated(true);
    setAuthenticatedState(true);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    profile,
    authenticated,
    async setup(displayName, username, password) {
      setProfile(await auth.saveProfile(displayName, username, password));
      markAuthenticated();
    },
    async login(username, password) {
      const valid = await auth.verifyPassword(username, password);
      if (valid) markAuthenticated();
      return valid;
    },
    async biometricLogin() {
      const valid = await auth.loginWithBiometric();
      if (valid) markAuthenticated();
      return valid;
    },
    lock() {
      auth.setAuthenticated(false);
      setAuthenticatedState(false);
    },
    async clearAccount() {
      await auth.clearAccount();
      setProfile(null);
      setAuthenticatedState(false);
    },
    refresh() { setProfile(auth.getProfile()); },
  }), [profile, authenticated, markAuthenticated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
