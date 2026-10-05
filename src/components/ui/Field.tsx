import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  children: ReactNode;
  /** Extra classes, e.g. "field--full" to span every column of a form grid. */
  className?: string;
}

export function Field({ label, children, className }: FieldProps) {
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label className="field__label">{label}</label>
      {children}
    </div>
  );
}
