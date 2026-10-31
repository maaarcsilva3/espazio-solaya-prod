import type { IconType } from 'react-icons';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconType;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-900 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex min-h-[36px] flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition ${
              active
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {opt.icon && <opt.icon className="h-4 w-4" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
