import { useEffect, useState } from 'react';

export function isImageIcon(icon: string | null | undefined): icon is string {
  return Boolean(
    icon && (
      icon.startsWith('/') ||
      icon.startsWith('./') ||
      icon.startsWith('data:') ||
      icon.startsWith('blob:') ||
      /^https?:\/\//i.test(icon)
    )
  );
}

export function resolveCategoryIcon(icon: string): string {
  if (!icon.startsWith('/')) return icon;
  return `${import.meta.env.BASE_URL}${icon.slice(1)}`;
}

interface CategoryIconProps {
  icon: string | null | undefined;
  fallback?: string;
  alt?: string;
  className?: string;
}

export function CategoryIcon({
  icon,
  fallback = '🏷️',
  alt = '',
  className = '',
}: CategoryIconProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [icon]);

  if (!isImageIcon(icon) || failed) return <>{failed ? fallback : (icon ?? fallback)}</>;

  return (
    <img
      className={`category-icon__image ${className}`.trim()}
      src={resolveCategoryIcon(icon)}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
