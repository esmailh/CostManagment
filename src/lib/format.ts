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
