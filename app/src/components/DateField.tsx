import { useEffect, useRef, useState } from 'react';

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function monthOf(iso: string): string {
  return /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : todayIso().slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  );
}

/** Six Monday-first weeks, so the grid never changes height between months. */
function calendarDays(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const today = todayIso();
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, monthNumber - 1, index - offset + 1);
    const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return {
      iso,
      day: date.getDate(),
      inMonth: date.getMonth() === monthNumber - 1,
      today: iso === today,
    };
  });
}

function displayValue(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}

/**
 * The prototype's compact calendar with two client changes: the week starts on
 * Monday and there are no Clear/Today buttons. Choosing a day applies it and
 * closes the panel straight away.
 */
export function DateField({ value, onChange, ariaLabel, placeholder = 'dd/mm/yyyy' }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOf(value));
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const anchor = root.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(296, window.innerWidth - 16);
      const height = Math.min(panel.current?.scrollHeight ?? 320, 360);
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
      const below = anchor.bottom + height + 4 <= window.innerHeight;
      const top = below ? anchor.bottom + 4 : Math.max(8, anchor.top - height - 4);
      setPosition({ left, top, width });
    };

    const frame = window.requestAnimationFrame(place);
    const onScroll = () => place();
    const onResize = () => place();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggle() {
    setOpen((current) => {
      if (!current) setMonth(monthOf(value));
      return !current;
    });
  }

  function choose(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  function moveMonth(offset: number) {
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(year, monthNumber - 1 + offset, 1);
    setMonth(`${next.getFullYear()}-${pad(next.getMonth() + 1)}`);
  }

  return (
    <span className="date-field" ref={root}>
      <input
        className="input"
        type="text"
        readOnly
        inputMode="none"
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        value={displayValue(value)}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault();
            toggle();
          }
        }}
      />
      <svg
        className="date-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 11h18" />
      </svg>

      {open && (
        <div
          className="date-panel"
          role="dialog"
          aria-label="Pilih tanggal"
          ref={panel}
          style={
            position
              ? { left: position.left, top: position.top, width: position.width }
              : { left: -9999, top: -9999, width: 296 }
          }
        >
          <div className="date-panel-head">
            <button type="button" className="date-nav" aria-label="Bulan sebelumnya" onClick={() => moveMonth(-1)}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M12.78 4.22a.75.75 0 010 1.06L8.06 10l4.72 4.72a.75.75 0 11-1.06 1.06l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <strong className="date-panel-title">{monthLabel(month)}</strong>
            <button type="button" className="date-nav" aria-label="Bulan berikutnya" onClick={() => moveMonth(1)}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M7.22 4.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.94 10 7.22 5.28a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <div className="date-weekdays">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="date-grid">
            {calendarDays(month).map((day) => (
              <button
                key={day.iso}
                type="button"
                className={`date-cell${day.today ? ' is-today' : ''}${day.iso === value ? ' is-selected' : ''}`}
                disabled={!day.inMonth}
                aria-label={day.iso}
                aria-pressed={day.iso === value}
                onClick={() => choose(day.iso)}
              >
                {day.day}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
