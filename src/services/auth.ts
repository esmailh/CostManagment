import { Capacitor } from '@capacitor/core';
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';

const PROFILE_KEY = 'expense-tracker:profile';
const SESSION_KEY = 'expense-tracker:authenticated';
const BIOMETRIC_SERVER = 'expense-tracker.local';

export interface UserProfile {
  displayName: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  biometricEnabled: boolean;
}

export interface BiometricStatus {
  available: boolean;
  label: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 210_000 },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

export function getProfile(): UserProfile | null {
  try {
    const value = localStorage.getItem(PROFILE_KEY);
    return value ? JSON.parse(value) as UserProfile : null;
  } catch {
    return null;
  }
}

export async function saveProfile(displayName: string, username: string, password: string): Promise<UserProfile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const previous = getProfile();
  const profile: UserProfile = {
    displayName: displayName.trim(),
    username: username.trim(),
    passwordHash: await hashPassword(password, salt),
    passwordSalt: bytesToBase64(salt),
    biometricEnabled: previous?.biometricEnabled ?? false,
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export async function verifyPassword(username: string, password: string): Promise<boolean> {
  const profile = getProfile();
  if (!profile || profile.username !== username.trim()) return false;
  const candidate = await hashPassword(password, base64ToBytes(profile.passwordSalt));
  if (candidate.length !== profile.passwordHash.length) return false;
  let different = 0;
  for (let i = 0; i < candidate.length; i += 1) different |= candidate.charCodeAt(i) ^ profile.passwordHash.charCodeAt(i);
  return different === 0;
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function setAuthenticated(value: boolean): void {
  if (value) sessionStorage.setItem(SESSION_KEY, '1');
  else sessionStorage.removeItem(SESSION_KEY);
}

function biometricLabel(type: BiometryType): string {
  if (type === BiometryType.FACE_ID || type === BiometryType.FACE_AUTHENTICATION) return 'تشخیص چهره';
  if (type === BiometryType.FINGERPRINT || type === BiometryType.TOUCH_ID) return 'اثر انگشت';
  if (type === BiometryType.MULTIPLE) return 'اثر انگشت یا تشخیص چهره';
  return 'ورود بیومتریک';
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  if (!Capacitor.isNativePlatform()) return { available: false, label: 'ورود بیومتریک' };
  try {
    const result = await NativeBiometric.isAvailable({ useFallback: false });
    return { available: result.isAvailable, label: biometricLabel(result.biometryType) };
  } catch {
    return { available: false, label: 'ورود بیومتریک' };
  }
}

export async function enableBiometric(password: string): Promise<void> {
  const profile = getProfile();
  if (!profile) throw new Error('پروفایل پیدا نشد.');
  const status = await getBiometricStatus();
  if (!status.available) throw new Error('اثر انگشت یا تشخیص چهره روی این دستگاه فعال نیست.');
  await NativeBiometric.verifyIdentity({ reason: 'تأیید هویت برای فعال‌سازی ورود سریع', title: 'تأیید هویت', negativeButtonText: 'انصراف', useFallback: false });
  await NativeBiometric.setCredentials({ server: BIOMETRIC_SERVER, username: profile.username, password });
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, biometricEnabled: true }));
}

export async function disableBiometric(): Promise<void> {
  const profile = getProfile();
  try { await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER }); } catch { /* no saved credential */ }
  if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, biometricEnabled: false }));
}

export async function clearAccount(): Promise<void> {
  try { await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER }); } catch { /* no saved credential */ }
  localStorage.removeItem(PROFILE_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export async function loginWithBiometric(): Promise<boolean> {
  const profile = getProfile();
  if (!profile?.biometricEnabled) return false;
  await NativeBiometric.verifyIdentity({ reason: 'ورود به برنامه', title: 'ورود امن', negativeButtonText: 'استفاده از رمز عبور', useFallback: false });
  const credentials = await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER });
  return verifyPassword(credentials.username, credentials.password);
}
