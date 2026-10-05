import { useEffect, useRef, useState } from 'react';
import {
  PERSIAN_MONTHS,
  formatMonthName,
  jalaliToGregorian,
  monthLength,
  todayJalali,
  toPersianDigits,
} from '../lib/jalaali';
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from './ui/Icons';

export interface JalaliDateValue { year: number; month: number; day: number }

interface Props {
  value: JalaliDateValue;
  onChange: (value: JalaliDateValue) => void;
  monthOnly?: boolean;
  minYear?: number;
  maxYear?: number;
}

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const WEEKDAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

/** Column of a day within a Persian week: Saturday is 0, Friday is 6. */
function weekdayIndex(year: number, month: number, day = 1): number {
  return (jalaliToGregorian(year, month, day).getDay() + 1) % 7;
}

/** Persian-calendar picker. Values are always valid Jalali dates. */
export function JalaliDateFields({ value, onChange, monthOnly = false, minYear, maxYear }: Props) {
  const today = todayJalali();
  const firstYear = minYear ?? today.year - 20;
  const lastYear = maxYear ?? today.year + 20;

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'days' | 'months'>('days');
  const [cursor, setCursor] = useState({ year: value.year, month: value.month });
  const rootRef = useRef<HTMLDivElement>(null);

  // The picker grows inside a scrollable sheet; keep it in sight when it opens.
  useEffect(() => {
    if (open) rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  const clampYear = (year: number) => Math.min(lastYear, Math.max(firstYear, year));

  const toggle = () => {
    setCursor({ year: value.year, month: value.month });
    setView(monthOnly ? 'months' : 'days');
    setOpen((prev) => !prev);
  };

  const shift = (delta: number) => {
    if (view === 'months') {
      setCursor((c) => ({ ...c, year: clampYear(c.year + delta) }));
      return;
    }
    const index = cursor.year * 12 + (cursor.month - 1) + delta;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    if (year < firstYear || year > lastYear) return;
    setCursor({ year, month });
  };

  const pickDay = (day: number) => {
    onChange({ year: cursor.year, month: cursor.month, day });
    setOpen(false);
  };

  const pickMonth = (month: number) => {
    if (monthOnly) {
      onChange({ year: cursor.year, month, day: 1 });
      setOpen(false);
      return;
    }
    setCursor((c) => ({ ...c, month }));
    setView('days');
  };

  const pickToday = () => {
    onChange(monthOnly ? { year: today.year, month: today.month, day: 1 } : today);
    setOpen(false);
  };

  const length = monthLength(cursor.year, cursor.month);
  const cells: (number | null)[] = [
    ...Array.from({ length: weekdayIndex(cursor.year, cursor.month, 1) }, () => null),
    ...Array.from({ length }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isCurrentMonth = cursor.year === value.year && cursor.month === value.month;

  return (
    <div className={`jalali-picker${open ? ' jalali-picker--open' : ''}`} ref={rootRef}>
      <button type="button" className="jalali-picker__trigger" onClick={toggle} aria-expanded={open}>
        <CalendarIcon width={18} height={18} className="jalali-picker__icon" />
        <span className="jalali-picker__value">
          {monthOnly
            ? formatMonthName(value.year, value.month)
            : `${toPersianDigits(value.day)} ${PERSIAN_MONTHS[value.month - 1]} ${toPersianDigits(value.year)}`}
        </span>
        {!monthOnly && (
          <span className="jalali-picker__weekday">{WEEKDAY_NAMES[weekdayIndex(value.year, value.month, value.day)]}</span>
        )}
        <ChevronDownIcon width={16} height={16} className="jalali-picker__chevron" />
      </button>

      {open && (
        <div className="jalali-cal">
          <div className="jalali-cal__head">
            <button type="button" className="jalali-cal__nav" onClick={() => shift(-1)} aria-label={view === 'months' ? 'سال قبل' : 'ماه قبل'}>
              <ChevronRightIcon width={18} height={18} />
            </button>
            <button
              type="button"
              className="jalali-cal__title"
              onClick={() => !monthOnly && setView(view === 'days' ? 'months' : 'days')}
            >
              {view === 'months' ? toPersianDigits(cursor.year) : formatMonthName(cursor.year, cursor.month)}
            </button>
            <button type="button" className="jalali-cal__nav" onClick={() => shift(1)} aria-label={view === 'months' ? 'سال بعد' : 'ماه بعد'}>
              <ChevronLeftIcon width={18} height={18} />
            </button>
          </div>

          {view === 'days' ? (
            <>
              <div className="jalali-cal__weekdays">
                {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="jalali-cal__grid">
                {cells.map((day, index) => day === null
                  ? <span key={`gap-${index}`} className="jalali-cal__day jalali-cal__day--empty" />
                  : (
                    <button
                      key={day}
                      type="button"
                      className={
                        'jalali-cal__day'
                        + (isCurrentMonth && day === value.day ? ' jalali-cal__day--selected' : '')
                        + (day === today.day && cursor.year === today.year && cursor.month === today.month ? ' jalali-cal__day--today' : '')
                        + (weekdayIndex(cursor.year, cursor.month, day) === 6 ? ' jalali-cal__day--holiday' : '')
                      }
                      aria-pressed={isCurrentMonth && day === value.day}
                      onClick={() => pickDay(day)}
                    >
                      {toPersianDigits(day)}
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <div className="jalali-cal__months">
              {PERSIAN_MONTHS.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  className={
                    'jalali-cal__month'
                    + (cursor.year === value.year && index + 1 === value.month ? ' jalali-cal__month--selected' : '')
                  }
                  onClick={() => pickMonth(index + 1)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <div className="jalali-cal__foot">
            <button type="button" className="jalali-cal__quick" onClick={pickToday}>
              {monthOnly ? 'ماه جاری' : 'امروز'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
