import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { HiUser } from 'react-icons/hi';
import { formatDuration, formatTimestamp } from '../../lib/format';
import type { Inquiry } from '../../lib/types';

export function InquiryCardView({
  inquiry,
  onOpen,
  dragging,
  extra,
}: {
  inquiry: Inquiry;
  onOpen?: () => void;
  dragging?: boolean;
  extra?: ReactNode;
}) {
  const agents = inquiry.agents.map((agent) => agent.name).join(', ');
  return (
    <article
      className={`rounded-xl border border-gray-200 border-l-4 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${
        dragging ? 'opacity-60' : ''
      }`}
      style={{ borderLeftColor: inquiry.stage_bg.trim() }}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <p className="font-medium text-gray-900 dark:text-white">{inquiry.customer_name}</p>
        {inquiry.booking_request_id ? (
          <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">Confirmed booking</p>
        ) : null}
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {inquiry.pipeline === 'event_venue'
            ? formatTimestamp(inquiry.start_at)
            : inquiry.start_at
              ? `${formatTimestamp(inquiry.start_at)} – ${formatTimestamp(inquiry.end_at)}`
              : 'Dates not set'}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {inquiry.pipeline === 'event_venue' && inquiry.event_type && <span>{inquiry.event_type}</span>}
          <span>{inquiry.guests != null ? `${inquiry.guests} guests` : 'Guests not set'}</span>
          <span>{inquiry.offering_name ?? 'No package'}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex min-w-0 items-center gap-1">
            <HiUser className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{agents || 'Unassigned'}</span>
          </span>
          <span className="shrink-0" title="Time in the current stage">
            {formatDuration(inquiry.seconds_in_stage)}
          </span>
        </div>
      </button>
      {extra}
    </article>
  );
}

export default function InquiryCard({ inquiry, onOpen }: { inquiry: Inquiry; onOpen: () => void }) {
  if (inquiry.booking_request_id) return <InquiryCardView inquiry={inquiry} onOpen={onOpen} />;
  return <DraggableInquiryCard inquiry={inquiry} onOpen={onOpen} />;
}

function DraggableInquiryCard({ inquiry, onOpen }: { inquiry: Inquiry; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `inquiry-${inquiry.id}`,
    data: { inquiry },
  });
  return (
    <div ref={setNodeRef} className={isDragging ? 'opacity-40' : undefined} {...listeners} {...attributes}>
      <InquiryCardView inquiry={inquiry} onOpen={onOpen} />
    </div>
  );
}
