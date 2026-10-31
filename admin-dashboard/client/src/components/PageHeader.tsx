import type { ReactNode } from 'react';

/** The top bar already shows the page name on phones, so the big title only appears on larger screens. */
export default function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="hidden text-2xl font-semibold tracking-tight text-gray-900 dark:text-white sm:block">{title}</h2>
        {description && <p className="text-sm text-gray-500 dark:text-gray-400 sm:mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
