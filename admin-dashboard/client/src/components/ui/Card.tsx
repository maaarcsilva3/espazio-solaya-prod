import type { ReactNode } from 'react';

export default function Card({
  title,
  description,
  actions,
  children,
  className = '',
  bodyClassName = 'p-5',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div className="min-w-0">
            {title && <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>}
            {description && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
