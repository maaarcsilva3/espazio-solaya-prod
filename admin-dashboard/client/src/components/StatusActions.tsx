import { Button, Dropdown } from 'flowbite-react';
import type { IconType } from 'react-icons';
import { HiCheck, HiCheckCircle, HiChevronDown, HiDotsHorizontal, HiRefresh } from 'react-icons/hi';
import type { BookingRequest, StatusCategory, StatusDef } from '../lib/types';
import { useRequestActions } from '../hooks/useRequestActions';
import { useStatuses } from '../hooks/useStatuses';

const PRIMARY: Record<StatusCategory, { label: string; icon: IconType; target: StatusCategory }> = {
  new: { label: 'Confirm', icon: HiCheck, target: 'booked' },
  booked: { label: 'Mark done', icon: HiCheckCircle, target: 'closed' },
  closed: { label: 'Reopen', icon: HiRefresh, target: 'new' },
};

/**
 * One-tap action that moves the booking to the next stage (based on status type),
 * plus a menu to move it to any other status.
 */
export default function StatusActions({
  request,
  size = 'sm',
  compact = false,
}: {
  request: BookingRequest;
  size?: 'xs' | 'sm' | 'md';
  compact?: boolean;
}) {
  const { setStatus } = useRequestActions();
  const { statuses, get, firstOf, defaultKey } = useStatuses();
  const busy = setStatus.isPending;
  const current = get(request.status);
  const move = (status: string) => setStatus.mutate({ id: request.id, status });

  const primary = PRIMARY[current.category];
  const target: StatusDef | undefined =
    primary.target === 'new' ? statuses.find((s) => s.key === defaultKey) : firstOf(primary.target);
  const others = statuses.filter((s) => s.key !== request.status);

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {target && (
        <Button size={size} color="primary" disabled={busy} onClick={() => move(target.key)} title={`Move to ${target.label}`}>
          <primary.icon className="mr-1 h-4 w-4" /> {primary.label}
        </Button>
      )}
      {others.length > 0 && (
        <Dropdown
          dismissOnClick
          placement="bottom-end"
          renderTrigger={() => (
            <Button size={size} color="secondary" disabled={busy} aria-label="Move to another status">
              {compact ? (
                <HiDotsHorizontal className="h-4 w-4" />
              ) : (
                <>
                  Move to <HiChevronDown className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        >
          <Dropdown.Header>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Move to</span>
          </Dropdown.Header>
          {others.map((s) => (
            <Dropdown.Item key={s.key} onClick={() => move(s.key)}>
              <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.bg }} />
              {s.label}
            </Dropdown.Item>
          ))}
        </Dropdown>
      )}
    </div>
  );
}
