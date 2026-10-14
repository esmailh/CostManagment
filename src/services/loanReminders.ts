import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema, type PendingLocalNotificationSchema } from '@capacitor/local-notifications';
import { db } from '../db/db';
import type { Loan, LoanInstallment } from '../db/types';
import { jalaliToGregorian, monthLength } from '../lib/jalaali';

const OWNER = 'loan-reminder-v1';
// Keep the namespace small and feature-specific. Ownership checks still use `extra.owner`.
const ID_MIN = 1_986_000_000;
const ID_SPAN = 1_000_000;
// iOS permits only 64 pending local notifications per app; leave room for other features.
const MAX_SCHEDULED_REMINDERS = 60;

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function triggerAt(year: number | null, month: number | null, day: number | null): Date | null {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > monthLength(year, month)) return null;
  const date = jalaliToGregorian(year, month, day);
  date.setDate(date.getDate() - 1);
  date.setHours(9, 0, 0, 0);
  return date.getTime() > Date.now() ? date : null;
}

interface Candidate { key: string; loan: Loan; installment?: LoanInstallment; at: Date }

let reconciliationQueue: Promise<void> = Promise.resolve();

/** Reconciles the nearest reminders with database state. Native failures are non-fatal. */
export function reconcileLoanReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  reconciliationQueue = reconciliationQueue.then(runReconciliation, runReconciliation);
  return reconciliationQueue;
}

function isOwned(item: PendingLocalNotificationSchema): boolean {
  return item.extra?.owner === OWNER;
}

async function runReconciliation(): Promise<void> {
  try {
    // Reconciliation can run during startup/resume, so it must never prompt or open settings.
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return;

    const [loans, installments, pending] = await Promise.all([
      db.loans.toArray(),
      db.loanInstallments.toArray(),
      LocalNotifications.getPending(),
    ]);
    const byLoan = new Map<string, LoanInstallment[]>();
    for (const item of installments) {
      const rows = byLoan.get(item.loanId) ?? [];
      rows.push(item);
      byLoan.set(item.loanId, rows);
    }

    const candidates: Candidate[] = [];
    for (const loan of loans) {
      if (loan.reminderMode === 'custom') {
        const at = triggerAt(loan.reminderYear, loan.reminderMonth, loan.reminderDay);
        if (at) candidates.push({ key: `custom:${loan.id}`, loan, at });
      } else if (loan.reminderMode === 'due-date') {
        for (const item of byLoan.get(loan.id) ?? []) {
          if (item.isPaid) continue;
          const at = triggerAt(item.dueYear, item.dueMonth, item.dueDay);
          if (at) candidates.push({ key: `due:${loan.id}:${item.id}`, loan, installment: item, at });
        }
      }
    }

    const owned = pending.notifications.filter(isOwned);
    const unrelatedCount = pending.notifications.length - owned.length;
    const capacity = Capacitor.getPlatform() === 'ios'
      ? Math.max(0, Math.min(MAX_SCHEDULED_REMINDERS, 64 - unrelatedCount))
      : MAX_SCHEDULED_REMINDERS;
    const desired = candidates
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.key.localeCompare(b.key))
      .slice(0, capacity);
    const existingIdByKey = new Map(
      owned
        .filter((item) => typeof item.extra?.key === 'string')
        .map((item) => [item.extra!.key as string, item.id]),
    );
    const unrelatedIds = new Set(pending.notifications.filter((item) => !isOwned(item)).map((item) => item.id));
    const used = new Set<number>();
    const desiredIds = new Set<number>();

    const notifications: LocalNotificationSchema[] = desired.map((candidate) => {
      let id = existingIdByKey.get(candidate.key);
      if (id === undefined || unrelatedIds.has(id) || used.has(id)) {
        id = ID_MIN + (hash(candidate.key) % ID_SPAN);
        while (unrelatedIds.has(id) || used.has(id)) id = ID_MIN + ((id - ID_MIN + 1) % ID_SPAN);
      }
      used.add(id);
      desiredIds.add(id);
      const number = candidate.installment?.installmentNumber;
      return {
        id,
        title: 'یادآوری قسط',
        body: number
          ? `قسط ${number} وام «${candidate.loan.title}» فردا سررسید می‌شود.`
          : `یادآور وام «${candidate.loan.title}» برای فرداست.`,
        // 09:00 reminders do not warrant Android exact-alarm access or a settings prompt.
        schedule: { at: candidate.at },
        extra: { owner: OWNER, key: candidate.key },
      };
    });

    const existingIds = new Set(owned.map((item) => item.id));
    const refresh = notifications.filter((item) => existingIds.has(item.id));
    const additions = notifications.filter((item) => !existingIds.has(item.id));
    const stale = owned.filter((item) => !desiredIds.has(item.id));

    // Refreshes and free-capacity additions are non-destructive: failures leave stale reminders intact.
    const initiallyAvailable = Capacitor.getPlatform() === 'ios'
      ? Math.max(0, 64 - pending.notifications.length)
      : additions.length;
    const firstAdditions = additions.slice(0, initiallyAvailable);
    if (refresh.length || firstAdditions.length) {
      await LocalNotifications.schedule({ notifications: [...refresh, ...firstAdditions] });
    }

    // At the iOS limit, replacement requires freeing capacity; keep each destructive window small.
    const remainingAdditions = additions.slice(firstAdditions.length);
    let staleOffset = 0;
    for (let offset = 0; offset < remainingAdditions.length; offset += 8) {
      const batch = remainingAdditions.slice(offset, offset + 8);
      const replaced = stale.slice(staleOffset, staleOffset + batch.length);
      if (replaced.length) {
        await LocalNotifications.cancel({ notifications: replaced.map(({ id }) => ({ id })) });
        staleOffset += replaced.length;
      }
      await LocalNotifications.schedule({ notifications: batch });
    }
    const staleSurplus = stale.slice(staleOffset);
    if (staleSurplus.length) {
      await LocalNotifications.cancel({ notifications: staleSurplus.map(({ id }) => ({ id })) });
    }
  } catch (error) {
    console.warn('[loan-reminders] reconciliation failed', error);
  }
}
