import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: {
  icon: IconType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-400">
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-medium text-gray-900 dark:text-white">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
