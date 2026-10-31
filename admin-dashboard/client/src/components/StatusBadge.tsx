import type { RequestStatus } from '../lib/types';
import { useStatuses } from '../hooks/useStatuses';

export function StatusPill({ label, bg, text, size = 'sm' }: { label: string; bg: string; text: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${
        size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'
      }`}
      style={{ backgroundColor: bg, color: text }}
    >
      <span className="h-1.5 w-1.5 rounded-full opacity-80" style={{ backgroundColor: text }} />
      {label}
    </span>
  );
}

export default function StatusBadge({ status, size }: { status: RequestStatus; size?: 'sm' | 'md' }) {
  const s = useStatuses().get(status);
  return <StatusPill label={s.label} bg={s.bg} text={s.text_color} size={size} />;
}
