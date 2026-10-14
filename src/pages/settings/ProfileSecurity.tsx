import { useEffect, useState, type FormEvent } from 'react';
import { SubPageHeader } from '../../components/SubPageHeader';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { disableBiometric, enableBiometric, getBiometricStatus, saveProfile, verifyPassword } from '../../services/auth';

export function ProfileSecurity({ onBack }: { onBack(): void }) {
  const { profile, refresh, lock } = useAuth();
  const name = profile?.displayName ?? '';
  const [status, setStatus] = useState({ available: false, label: 'ورود بیومتریک' });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [biometricDialogOpen, setBiometricDialogOpen] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');
  const [biometricError, setBiometricError] = useState('');

  useEffect(() => { void getBiometricStatus().then(setStatus); }, []);
  if (!profile) return null;
  const activeProfile = profile;

  async function changePassword() {
    setBusy(true); setMessage('');
    try {
      if (!(await verifyPassword(activeProfile.username, currentPassword))) return setMessage('رمز عبور فعلی نادرست است.');
      if (newPassword.length < 6) return setMessage('رمز جدید باید حداقل ۶ کاراکتر باشد.');
      if (activeProfile.biometricEnabled) await disableBiometric();
      await saveProfile(name, activeProfile.username, newPassword);
      refresh(); setCurrentPassword(''); setNewPassword('');
      setMessage('رمز عبور تغییر کرد. برای استفاده، ورود بیومتریک را دوباره فعال کنید.');
    } finally { setBusy(false); }
  }

  function closeBiometricDialog() {
    if (busy) return;
    setBiometricDialogOpen(false);
    setBiometricPassword('');
    setBiometricError('');
  }

  async function toggleBiometric() {
    setMessage('');
    if (!activeProfile.biometricEnabled) {
      setBiometricPassword('');
      setBiometricError('');
      setBiometricDialogOpen(true);
      return;
    }

    setBusy(true);
    try {
      await disableBiometric();
      refresh();
      setMessage('ورود بیومتریک غیرفعال شد.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'عملیات انجام نشد.'); }
    finally { setBusy(false); }
  }

  async function confirmBiometric(event: FormEvent) {
    event.preventDefault();
    if (!biometricPassword) return;
    setBusy(true); setBiometricError(''); setMessage('');
    try {
      if (!(await verifyPassword(activeProfile.username, biometricPassword))) {
        setBiometricError('رمز عبور نادرست است.');
        return;
      }
      await enableBiometric(biometricPassword);
      refresh();
      setBiometricDialogOpen(false);
      setBiometricPassword('');
      setMessage(`${status.label} فعال شد.`);
    } catch (error) {
      setBiometricError(error instanceof Error ? error.message : 'فعال‌سازی انجام نشد.');
    } finally { setBusy(false); }
  }

  return (
    <div className="profile-security" dir="rtl">
      <SubPageHeader title="پروفایل و امنیت" onBack={onBack} />

      <section className="profile-summary" aria-label="اطلاعات حساب">
        <div className="profile-avatar">{name.trim().charAt(0) || 'ک'}</div>
        <strong>{name}</strong>
        <span>@{activeProfile.username}</span>
      </section>

      <div className="section-title">تغییر رمز عبور</div>
      <div className="card profile-form">
        <p className="profile-help">پس از تغییر رمز، ورود بیومتریک غیرفعال می‌شود و باید دوباره آن را فعال کنید.</p>
        <label>رمز عبور فعلی<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></label>
        <label>رمز عبور جدید<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></label>
        <button type="button" className="secondary-button" disabled={busy || !currentPassword || newPassword.length < 6} onClick={changePassword}>تغییر رمز عبور</button>
      </div>

      <div className="section-title">ورود سریع و امن</div>
      <div className="card biometric-card">
        <div className="settings-row">
          <span className="settings-row__content">
            <span className="settings-row__title">{status.label}</span>
            <span className="settings-row__sub">{status.available ? 'پس از فعال‌سازی می‌توانید بدون تایپ رمز وارد برنامه شوید.' : 'این قابلیت روی دستگاه فعال نیست یا در دسترس قرار ندارد.'}</span>
          </span>
          <button type="button" className="toggle-button" role="switch" aria-checked={activeProfile.biometricEnabled} disabled={!status.available || busy} onClick={toggleBiometric}>{activeProfile.biometricEnabled ? 'فعال' : 'غیرفعال'}</button>
        </div>
        {!activeProfile.biometricEnabled && status.available && <p className="profile-help biometric-help">برای فعال‌سازی، رمز عبور شما در یک پنجره امن درخواست می‌شود.</p>}
      </div>

      {message && <div className="auth-message" role="status">{message}</div>}
      <button type="button" className="danger-link" onClick={lock}>خروج از حساب</button>

      <Modal open={biometricDialogOpen} onClose={closeBiometricDialog} title={`فعال‌سازی ${status.label}`}>
        <form className="profile-form biometric-dialog" onSubmit={confirmBiometric}>
          <p className="profile-help">برای تأیید هویت و فعال‌سازی ورود بیومتریک، رمز عبور فعلی خود را وارد کنید.</p>
          <label>
            رمز عبور فعلی
            <input
              type="password"
              value={biometricPassword}
              onChange={(event) => { setBiometricPassword(event.target.value); setBiometricError(''); }}
              autoComplete="current-password"
              autoFocus
              disabled={busy}
            />
          </label>
          {biometricError && <div className="auth-message auth-message--error" role="alert">{biometricError}</div>}
          <div className="modal__actions">
            <button type="button" className="secondary-button" onClick={closeBiometricDialog} disabled={busy}>انصراف</button>
            <button type="submit" className="primary-button" disabled={busy || !biometricPassword}>{busy ? 'در حال بررسی…' : 'فعال‌سازی'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}