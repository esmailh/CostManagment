import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

/**
 * Icon of the lender behind each loan, keyed by loan id.
 *
 * Every installment is booked under the single «اقساط» category, so a month with
 * several loans shows the same icon over and over. The lender's own logo is what
 * tells the rows apart. A loan whose lender has no logo maps to null, which lets
 * the caller keep using the category icon as the fallback.
 */
export function useLoanLenderIcons(): Map<string, string | null> {
  return useLiveQuery(async () => {
    const [loans, lenders] = await Promise.all([db.loans.toArray(), db.lenders.toArray()]);
    const iconByLender = new Map(lenders.map((lender) => [lender.id, lender.icon || null]));
    return new Map(loans.map((loan) => [loan.id, iconByLender.get(loan.lenderId) ?? null]));
  }, []) ?? new Map<string, string | null>();
}
