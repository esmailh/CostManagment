import type { ReactNode } from 'react';

interface EmptyStateProps {
  emoji: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function EmptyState({ emoji, title, subtitle, children }: EmptyStateProps) {
  return (
    <div className="empty">
      <span className="empty__emoji">{emoji}</span>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {subtitle && <div className="muted">{subtitle}</div>}
      {children}
    </div>
  );
}
