import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Select } from 'flowbite-react';
import { HiChevronDown, HiChevronUp, HiColorSwatch, HiPencil, HiPlus, HiStar, HiTrash } from 'react-icons/hi';
import { api, errorMessage } from '../lib/api';
import { CATEGORY_HINTS, CATEGORY_LABELS, STATUS_CATEGORIES } from '../lib/format';
import type { StatusCategory, StatusDef } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { STATUSES_KEY, useStatuses } from '../hooks/useStatuses';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusFormModal from '../components/StatusFormModal';
import { StatusPill } from '../components/StatusBadge';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Skeleton';

const CATEGORY_STYLES: Record<StatusCategory, string> = {
  new: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  booked: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  closed: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600',
};

function ReorderButton({ dir, disabled, onClick }: { dir: 'up' | 'down'; disabled: boolean; onClick: () => void }) {
  const Icon = dir === 'up' ? HiChevronUp : HiChevronDown;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'up' ? 'Move up' : 'Move down'}
      className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-gray-700 dark:hover:text-white"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export default function StatusesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { statuses, isLoading } = useStatuses();
  const [editing, setEditing] = useState<StatusDef | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<StatusDef | null>(null);
  const [moveTo, setMoveTo] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: STATUSES_KEY });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['requests'] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
  };

  const reorder = useMutation({
    mutationFn: (keys: string[]) => api.put('/statuses/order', { keys }),
    onMutate: async (keys) => {
      await queryClient.cancelQueries({ queryKey: STATUSES_KEY });
      const previous = queryClient.getQueryData<StatusDef[]>(STATUSES_KEY);
      if (previous) {
        const byKey = new Map(previous.map((s) => [s.key, s]));
        queryClient.setQueryData(
          STATUSES_KEY,
          keys.map((k, i) => ({ ...byKey.get(k)!, sort_order: i + 1 })),
        );
      }
      return { previous };
    },
    onError: (err, _keys, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(STATUSES_KEY, ctx.previous);
      toast(errorMessage(err), 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: STATUSES_KEY }),
  });

  const remove = useMutation({
    mutationFn: ({ key, moveTo }: { key: string; moveTo?: string }) =>
      api.delete<{ moved: number }>(`/statuses/${encodeURIComponent(key)}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`),
    onSuccess: (res) => {
      refresh();
      toast(res.moved ? `Status deleted. ${res.moved} booking(s) moved.` : 'Status deleted');
      setDeleting(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const move = (index: number, delta: number) => {
    const keys = statuses.map((s) => s.key);
    const [k] = keys.splice(index, 1);
    keys.splice(index + delta, 0, k);
    reorder.mutate(keys);
  };

  const openForm = (s: StatusDef | null) => {
    setEditing(s);
    setFormOpen(true);
  };

  const startDelete = (s: StatusDef) => {
    setMoveTo(statuses.find((o) => o.key !== s.key && o.category === s.category)?.key ?? statuses.find((o) => o.key !== s.key)?.key ?? '');
    setDeleting(s);
  };

  const inUse = deleting?.usage_count ?? 0;

  return (
    <>
      <PageHeader
        title="Statuses"
        description="The stages a booking moves through. Use the arrows to put them in the order you work in."
        actions={
          <Button color="primary" onClick={() => openForm(null)}>
            <HiPlus className="mr-2 h-5 w-5" /> Add status
          </Button>
        }
      />

      <Card bodyClassName="px-2 sm:px-3">
        {isLoading ? (
          <div className="px-3">
            <SkeletonRows count={5} />
          </div>
        ) : statuses.length === 0 ? (
          <EmptyState icon={HiColorSwatch} title="No statuses yet" />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {statuses.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2 py-3 sm:gap-4 sm:px-2">
                <div className="flex flex-col">
                  <ReorderButton dir="up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} />
                  <ReorderButton
                    dir="down"
                    disabled={i === statuses.length - 1 || reorder.isPending}
                    onClick={() => move(i, 1)}
                  />
                </div>

                <button className="flex min-w-0 flex-1 flex-col gap-1.5 text-left sm:flex-row sm:items-center sm:gap-4" onClick={() => openForm(s)}>
                  <div className="sm:w-44">
                    <StatusPill label={s.label} bg={s.bg} text={s.text_color} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${CATEGORY_STYLES[s.category]}`}>
                      {CATEGORY_LABELS[s.category]}
                    </span>
                    {s.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 font-medium text-primary-700 ring-1 ring-inset ring-primary-200 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/30">
                        <HiStar className="h-3.5 w-3.5" /> Default for new requests
                      </span>
                    )}
                    <span className="text-gray-500 dark:text-gray-400">
                      {s.usage_count ?? 0} booking{s.usage_count === 1 ? '' : 's'}
                    </span>
                  </div>
                </button>

                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openForm(s)}
                    aria-label={`Edit ${s.label}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                  >
                    <HiPencil className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => startDelete(s)}
                    disabled={s.is_default}
                    title={s.is_default ? 'Make another status the default before deleting this one' : `Delete ${s.label}`}
                    aria-label={`Delete ${s.label}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  >
                    <HiTrash className="h-5 w-5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {STATUS_CATEGORIES.map((c) => (
          <div key={c} className="rounded-xl border border-dashed border-gray-300 p-4 text-sm dark:border-gray-600">
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CATEGORY_STYLES[c]}`}>
              {CATEGORY_LABELS[c]}
            </span>
            <p className="mt-2 text-gray-600 dark:text-gray-400">{CATEGORY_HINTS[c]}</p>
          </div>
        ))}
      </div>

      <StatusFormModal open={formOpen} status={editing} onClose={() => setFormOpen(false)} />

      <ConfirmDialog
        open={!!deleting}
        title={`Delete "${deleting?.label}"?`}
        message={
          inUse > 0
            ? `${inUse} booking${inUse === 1 ? ' uses' : 's use'} this status. Choose where to move ${inUse === 1 ? 'it' : 'them'}.`
            : 'No bookings use this status.'
        }
        confirmDisabled={inUse > 0 && !moveTo}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate({ key: deleting.key, moveTo: inUse > 0 ? moveTo : undefined })}
        onClose={() => setDeleting(null)}
      >
        {inUse > 0 && (
          <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move bookings to">
            {statuses
              .filter((s) => s.key !== deleting?.key)
              .map((s) => (
                <option key={s.key} value={s.key}>
                  Move to {s.label}
                </option>
              ))}
          </Select>
        )}
      </ConfirmDialog>
    </>
  );
}
