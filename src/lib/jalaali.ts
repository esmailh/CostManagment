import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js';

export const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Convert ASCII digits in a string/number to Persian digits (۰۱۲۳…). */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

/** Today's date in the Jalali calendar. */
export function todayJalali(): JalaliDate {
  const j = toJalaali(new Date());
  return { year: j.jy, month: j.jm, day: j.jd };
}

/** Convert a Jalali date to a JS Date (Gregorian, local midnight). */
export function jalaliToGregorian(year: number, month: number, day: number): Date {
  const g = toGregorian(year, month, day);
  return new Date(g.gy, g.gm - 1, g.gd);
}

/** Number of days in a Jalali month. */
export function monthLength(year: number, month: number): number {
  return jalaaliMonthLength(year, month);
}

/** Stable sortable key for a month, e.g. "1405-06". */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Format a Jalali date as Persian digits, e.g. ۱۴۰۵/۰۶/۰۲. */
export function formatJalaliDate(year: number, month: number, day: number): string {
  return toPersianDigits(`${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`);
}

/** Format a month as "شهریور ۱۴۰۵". */
export function formatMonthName(year: number, month: number): string {
  return `${PERSIAN_MONTHS[month - 1]} ${toPersianDigits(year)}`;
}

/** The month preceding (year, month). */
export function previousMonth(year: number, month: number): JalaliDate {
  if (month === 1) return { year: year - 1, month: 12, day: 1 };
  return { year, month: month - 1, day: 1 };
}

/** The month following (year, month). */
export function nextMonth(year: number, month: number): JalaliDate {
  if (month === 12) return { year: year + 1, month: 1, day: 1 };
  return { year, month: month + 1, day: 1 };
}
