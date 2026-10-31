import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Select } from 'flowbite-react';
import { HiCalendar, HiMail, HiPencil, HiPhone, HiTrash, HiUsers } from 'react-icons/hi';
import { api } from '../lib/api';
import { formatDateRange, formatDateTime, OFFERING_TYPE_LABELS } from '../lib/format';
import type { BookingRequest } from '../lib/types';
import { useRequestActions } from '../hooks/useRequestActions';
import { useStatuses } from '../hooks/useStatuses';
import StatusBadge from './StatusBadge';
import StatusActions from './StatusActions';
import RequestFormModal from './RequestFormModal';
import ConfirmDialog from './ConfirmDialog';
import Sheet from './ui/Sheet';
import Skeleton from './ui/Skeleton';

const CONTACT_LINK =
  'inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-3 text-sm">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="col-span-2 break-words text-gray-900 dark:text-gray-100">{children || '-'}</dd>
    </div>
  );
}

function Highlight({ icon: Icon, label, value }: { icon: typeof HiCalendar; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
      <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Icon className="h-4 w-4" /> {label}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export default function RequestDetailsPanel({
  requestId,
  onClose,
}: {
  requestId: number | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { setStatus, remove } = useRequestActions();
  const { statuses } = useStatuses();

  const { data: r, isLoading } = useQuery({
    queryKey: ['request', requestId],
    queryFn: () => api.get<BookingRequest>(`/requests/${requestId}`),
    enabled: requestId !== null,
  });

  const open = requestId !== null && !editing && !confirmDelete;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={r ? `Booking #${r.id}` : 'Booking'}
        footer={
          r && (
            <div className="flex items-center justify-between gap-2">
              <Button color="secondary" onClick={() => setConfirmDelete(true)}>
                <HiTrash className="mr-1.5 h-4 w-4 text-red-600 dark:text-red-400" /> Delete
              </Button>
              <Button color="primary" onClick={() => setEditing(true)}>
                <HiPencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            </div>
          )
        }
      >
        {isLoading || !r ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <Skeleton className="h-40" />
          </div>
        ) : (
          <div className="space-y-6 p-5">
            <div>
              <div className="mb-2">
                <StatusBadge status={r.status} size="md" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{r.full_name}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`mailto:${r.email}`} className={CONTACT_LINK}>
                  <HiMail className="h-4 w-4" /> {r.email}
                </a>
                {r.phone && (
                  <a href={`tel:${r.phone}`} className={CONTACT_LINK}>
                    <HiPhone className="h-4 w-4" /> {r.phone}
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Highlight icon={HiCalendar} label="Dates" value={formatDateRange(r.start_date, r.end_date)} />
              <Highlight icon={HiUsers} label="Guests" value={r.guests ?? '-'} />
            </div>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <p className="mb-3 text-sm font-medium text-gray-900 dark:text-white">Status</p>
              <div className="flex flex-col gap-3">
                <StatusActions request={r} />
                <Select
                  sizing="md"
                  value={r.status}
                  disabled={setStatus.isPending}
                  onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value })}
                  aria-label="Status"
                >
                  {statuses.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <dl className="divide-y divide-gray-100 dark:divide-gray-700">
              <Row label="Booking">
                {r.offering_name &&
                  `${r.offering_name}${r.offering_type ? ` (${OFFERING_TYPE_LABELS[r.offering_type]})` : ''}`}
              </Row>
              <Row label="Amenities">{r.amenities.map((a) => a.name).join(', ')}</Row>
              <Row label="Event type">{r.event_type}</Row>
              <Row label="Message">{r.message && <span className="whitespace-pre-line">{r.message}</span>}</Row>
              <Row label="Internal notes">
                {r.admin_notes && <span className="whitespace-pre-line">{r.admin_notes}</span>}
              </Row>
              <Row label="Source">{r.source}</Row>
              <Row label="Received">{formatDateTime(r.created_at)}</Row>
            </dl>
          </div>
        )}
      </Sheet>

      <RequestFormModal open={editing} request={r ?? null} onClose={() => setEditing(false)} />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete booking?"
        message={`The booking for ${r?.full_name ?? 'this guest'} will be permanently removed.`}
        loading={remove.isPending}
        onConfirm={() =>
          r &&
          remove.mutate(r.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            },
          })
        }
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
