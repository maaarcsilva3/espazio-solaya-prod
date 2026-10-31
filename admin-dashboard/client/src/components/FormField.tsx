import type { ReactNode } from 'react';
import { Label } from 'flowbite-react';

export default function FormField({
  id,
  label,
  error,
  hint,
  children,
  className = '',
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} value={label} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300" />
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}
    </div>
  );
}
