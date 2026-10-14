import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { getBiometricStatus } from '../services/auth';

export function AuthScreen() {
  const { profile, setup, login, biometricLogin } = useAuth();
  const isSetup = !profile;
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('ورود بیومتریک');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const biometricPromptStarted = useRef(false);

  useEffect(() => {
    if (!profile?.biometricEnabled || biometricPromptStarted.current) return;
    biometricPromptStarted.current = true;
    let active = true;

    void (async () => {
      const status = await getBiometricStatus();
      if (!active) return;
      setBiometricAvailable(status.available);
      setBiometricLabel(status.label);
      if (!status.available) return;

      setBusy(true);
      setError('');
      try {
        if (!(await biometricLogin()) && active) setError('ورود بیومتریک انجام نشد. می‌توانید با رمز عبور وارد شوید.');
      } catch {
        if (active) setError('ورود بیومتریک لغو شد. می‌توانید با رمز عبور وارد شوید.');
      } finally {
        if (active) setBusy(false);
      }
    })();

    return () => { active = false; };
  }, [biometricLogin, profile?.biometricEnabled]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (isSetup) {
      if (!displayName.trim() || !username.trim()) return setError('نام و نام کاربری را وارد کنید.');
      if (password.length < 6) return setError('رمز عبور باید حداقل ۶ کاراکتر باشد.');
      if (password !== confirm) return setError('تکرار رمز عبور مطابقت ندارد.');
    }
    setBusy(true);
    try {
      if (isSetup) await setup(displayName, username, password);
      else if (!(await login(username, password))) setError('نام کاربری یا رمز عبور نادرست است.');
    } finally { setBusy(false); }
  }

  async function biometric() {
    setBusy(true); setError('');
    try {
      if (!(await biometricLogin())) setError('ورود بیومتریک انجام نشد.');
    } catch { setError('احراز هویت لغو شد یا ناموفق بود.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-page" dir="rtl">
      <section className="auth-card">
        <div className="auth-logo">ت</div>
        <h1>{isSetup ? 'ساخت پروفایل کاربری' : `سلام ${profile.displayName}`}</h1>
        <p>{isSetup ? 'برای محافظت از اطلاعات مالی، حساب محلی خود را بسازید.' : 'برای ورود به مدیریت هزینه احراز هویت کنید.'}</p>
        <form onSubmit={submit} className="auth-form">
          {isSetup && <label>نام و نام خانوادگی<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" /></label>}
          <label>نام کاربری<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" readOnly={!isSetup} /></label>
          <label>رمز عبور<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSetup ? 'new-password' : 'current-password'} /></label>
          {isSetup && <label>تکرار رمز عبور<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary-button" disabled={busy}>{busy ? 'کمی صبر کنید…' : isSetup ? 'ساخت پروفایل' : 'ورود'}</button>
        </form>
        {!isSetup && profile.biometricEnabled && biometricAvailable && (
          <button className="secondary-button biometric-button" disabled={busy} onClick={biometric}>ورود با {biometricLabel}</button>
        )}
      </section>
    </main>
  );
}
