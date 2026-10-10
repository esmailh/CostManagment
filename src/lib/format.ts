import { toPersianDigits } from './jalaali';

/** Format a Rial amount with thousands separators and Persian digits, e.g. ۱٬۵۰۰٬۰۰۰ ریال. */
export function formatRial(amount: number): string {
  const rounded = Math.round(amount);
  const withSeparators = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${toPersianDigits(withSeparators)} ریال`;
}

/** Format a plain number with Persian digits and thousands separators (no unit). */
export function formatNumber(n: number): string {
  const rounded = Math.round(n);
  const withSeparators = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return toPersianDigits(withSeparators);
}

/** Format a percentage with Persian digits, e.g. ۱۱٫۶٪. */
export function formatPercent(pct: number): string {
  const value = Math.round(pct * 10) / 10;
  const s = value.toLocaleString('en-US').replace('.', '٫');
  return `${toPersianDigits(s)}٪`;
}

/**
 * Format a percentage to a fixed number of decimals, e.g. ۱٫۹۱۶۷٪. Interest rates need this where
 * a progress figure does not: rounding a monthly rate to one decimal throws away the difference
 * between ۱٫۹ and ۱٫۹۲, and the annual rate is read off it.
 */
export function formatPercentFixed(pct: number, digits = 2): string {
  return `${toPersianDigits(pct.toFixed(digits).replace('.', '٫'))}٪`;
}

const PERSIAN_DIGITS_STR = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS_STR = '٠١٢٣٤٥٦٧٨٩';

/** Parse a user-entered number: converts Persian/Arabic digits, strips separators. */
export function parseDigits(input: string): number {
  const normalized = input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS_STR.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS_STR.indexOf(d)))
    .replace(/[^\d]/g, '');
  return normalized ? parseInt(normalized, 10) : 0;
}

/**
 * Parse a number that may have a fractional part, e.g. an interest rate typed as ۲۳٫۵. This cannot
 * go through `parseDigits`, which keeps only digits: it would read ۱٫۹۲ as ۱۹۲. Persian and Arabic
 * digits are converted and both the Persian decimal separator «٫» and «.» are accepted, while
 * thousands separators are dropped. Returns null when there is no number to read, so an empty
 * field stays "not entered" instead of becoming zero.
 */
export function parseDecimal(input: string): number | null {
  const normalized = input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS_STR.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS_STR.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[^\d.]/g, '');
  if (!/\d/.test(normalized)) return null;
  // Keep the first separator and drop the rest, so a pasted "۱٫۲۳۴٫۵" still reads as a number.
  const firstDot = normalized.indexOf('.');
  const cleaned = firstDot === -1
    ? normalized
    : normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}
