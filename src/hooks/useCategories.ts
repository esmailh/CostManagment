import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Category } from '../db/types';

export function useCategories(): Category[] {
  return (
    useLiveQuery(async () => {
      const categories = await db.categories.toArray();
      return categories.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    }, []) ?? []
  );
}
