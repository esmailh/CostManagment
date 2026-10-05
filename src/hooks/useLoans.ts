import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Loan, LoanInstallment } from '../db/types';
import { calculateLoanSummary, type LoanSummary } from '../services/loans';

export interface LoanWithDetails {
  loan: Loan;
  installments: LoanInstallment[];
  summary: LoanSummary;
}

/** Live, newest-first loans together with their ordered installments and totals. */
export function useLoans(): LoanWithDetails[] {
  return (
    useLiveQuery(async () => {
      const [loans, installments] = await Promise.all([
        db.loans.toArray(),
        db.loanInstallments.toArray(),
      ]);
      const byLoan = new Map<string, LoanInstallment[]>();
      for (const installment of installments) {
        const group = byLoan.get(installment.loanId) ?? [];
        group.push(installment);
        byLoan.set(installment.loanId, group);
      }
      return loans
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((loan) => {
          const items = (byLoan.get(loan.id) ?? []).sort(
            (a, b) => a.installmentNumber - b.installmentNumber,
          );
          return { loan, installments: items, summary: calculateLoanSummary(loan, items) };
        });
    }, []) ?? []
  );
}
