import type { LoanInterestMode } from '../db/types';

export interface LoanInterestInput {
  /** Amount borrowed (اصل وام), in rial. */
  principal: number;
  /** The level monthly installment (مبلغ هر قسط), in rial. */
  installmentAmount: number;
  /** Total number of installments. */
  installmentCount: number;
}

export interface LoanInterestResult {
  /** Monthly rate as a decimal fraction, e.g. 0.019166… for ۱٫۹۱۶۶٪. */
  monthlyRate: number;
  /** Nominal annual rate: `monthlyRate * 12`. */
  nominalAnnualRate: number;
  /** Effective annual rate — what compounding monthly actually costs: `(1 + monthlyRate) ** 12 - 1`. */
  effectiveAnnualRate: number;
  /** `installmentAmount * installmentCount`. */
  totalRepayment: number;
  /** `totalRepayment - principal`. */
  totalInterest: number;
}

/**
 * Present value of a level annuity: what a stream of `installmentCount` payments of
 * `installmentAmount` is worth today at monthly rate `rate`. Continuous at `rate === 0`, where the
 * formula's own division would be 0/0.
 */
function annuityPresentValue(installmentAmount: number, installmentCount: number, rate: number): number {
  if (rate === 0) return installmentAmount * installmentCount;
  return (installmentAmount * (1 - (1 + rate) ** -installmentCount)) / rate;
}

const BISECTION_ITERATIONS = 200;

/**
 * Solve the standard annuity equation
 *
 *   `P = A × (1 − (1 + r)^(−n)) / r`
 *
 * for the monthly rate `r`. There is no closed form for `r`, so `f(r) = PV(A, n, r) − P` is
 * bisected. `f` is strictly decreasing in `r` wherever `r > −1`, and `f(0) = A·n − P > 0` once we
 * are past the zero-interest case, so exactly one root lies above zero and bisection is safe.
 *
 * Returns `null` for input the equation cannot answer, rather than a plausible-looking number.
 */
export function solveMonthlyRate(
  principal: number,
  installmentAmount: number,
  installmentCount: number,
): number | null {
  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) return null;
  if (!Number.isInteger(installmentCount) || installmentCount < 1) return null;

  // Repaying no more than was borrowed means no interest at all. The root is exactly 0, and
  // bisection on [0, hi] would only ever approach it.
  if (installmentAmount * installmentCount <= principal) return 0;

  // With a single payment the equation collapses to `P = A / (1 + r)`, so it can be read directly.
  // Doing so also matters for the bracket below: `A = 3P` puts the root at r = 2.
  if (installmentCount === 1) return installmentAmount / principal - 1;

  const f = (rate: number) => annuityPresentValue(installmentAmount, installmentCount, rate) - principal;
  // `f(0) > 0` and `f` falls towards −P, so grow the bracket until it straddles the root. A fixed
  // upper bound cannot be used: for a short loan with a large installment the root can exceed 1.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60 && f(hi) > 0; i += 1) hi *= 2;
  if (f(hi) > 0) return null;

  for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The solved rate together with the totals the user sees beside it. */
export function loanInterest(input: LoanInterestInput): LoanInterestResult | null {
  const { principal, installmentAmount, installmentCount } = input;
  const monthlyRate = solveMonthlyRate(principal, installmentAmount, installmentCount);
  if (monthlyRate === null) return null;
  const totalRepayment = installmentAmount * installmentCount;
  return {
    monthlyRate,
    nominalAnnualRate: monthlyRate * 12,
    effectiveAnnualRate: (1 + monthlyRate) ** 12 - 1,
    totalRepayment,
    totalInterest: totalRepayment - principal,
  };
}

/**
 * Everything needed to show a loan's interest, with the unknowns left as `null` rather than
 * guessed. Deliberately *not* `totalInterest / principal`: that is the interest over the whole
 * term, not a rate, and it is roughly `annualRate × years`.
 */
export interface LoanInterestInfo {
  mode: 'manual' | 'auto';
  /** Monthly rate as a decimal fraction (0.019166…), never a percentage. */
  monthlyRate: number | null;
  nominalAnnualRate: number | null;
  effectiveAnnualRate: number | null;
  totalRepayment: number | null;
  /** `totalRepayment - principal`, exactly as specified. May be negative — see the flag below. */
  totalInterest: number | null;
  /** True when the installments differ, so a solved rate is an approximation. */
  approximate: boolean;
  /**
   * True when the schedule repays *less* than the principal, which makes `totalInterest` negative.
   * The subtraction is still the specified one, but a negative number is not an interest figure, so
   * the panels report that the two amounts disagree instead of labelling it «سود کل».
   */
  repaymentBelowPrincipal: boolean;
}

export interface LoanInterestSpec {
  mode: LoanInterestMode;
  principal: number | null;
  /** The level installment used in the equation; null when no amount is known yet. */
  installmentAmount: number | null;
  installmentCount: number;
  /** Annual rate in percent, exactly as the user typed it. Used only in 'manual' mode. */
  annualRatePercent: number | null;
  approximate?: boolean;
}

/**
 * Resolves the three interest modes into figures ready to render. `'none'` returns `null` — the
 * loan carries no interest and nothing should be shown for it. In `'auto'` mode the rate is solved
 * here, every time, from the numbers on hand, so a stored rate can never go stale behind an edited
 * installment.
 */
export function resolveLoanInterest(spec: LoanInterestSpec): LoanInterestInfo | null {
  if (spec.mode === 'none') return null;
  const approximate = spec.approximate ?? false;
  const { principal, installmentAmount, installmentCount, annualRatePercent } = spec;

  if (spec.mode === 'manual') {
    const monthlyRate = annualRatePercent !== null
      && Number.isFinite(annualRatePercent) && annualRatePercent >= 0
      ? annualRatePercent / 100 / 12 : null;
    const totalRepayment = installmentAmount !== null && installmentCount > 0
      ? installmentAmount * installmentCount : null;
    return {
      mode: 'manual',
      monthlyRate,
      nominalAnnualRate: monthlyRate === null ? null : monthlyRate * 12,
      effectiveAnnualRate: monthlyRate === null ? null : (1 + monthlyRate) ** 12 - 1,
      totalRepayment,
      totalInterest: totalRepayment !== null && principal !== null ? totalRepayment - principal : null,
      approximate,
      repaymentBelowPrincipal: totalRepayment !== null && principal !== null && totalRepayment < principal,
    };
  }

  const solved = principal === null || installmentAmount === null || installmentCount < 1
    ? null
    : loanInterest({ principal, installmentAmount, installmentCount });
  if (solved === null) {
    return {
      mode: 'auto',
      monthlyRate: null,
      nominalAnnualRate: null,
      effectiveAnnualRate: null,
      totalRepayment: null,
      totalInterest: null,
      approximate,
      repaymentBelowPrincipal: false,
    };
  }
  return {
    mode: 'auto',
    ...solved,
    approximate,
    // `solved` is only ever non-null once both amounts were known, so this compares two numbers.
    repaymentBelowPrincipal: principal !== null && solved.totalRepayment < principal,
  };
}
