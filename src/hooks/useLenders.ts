import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Lender } from '../db/types';

export function useLenders(): Lender[] {
  return useLiveQuery(
    async () => (await db.lenders.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'fa')),
    [],
  ) ?? [];
}