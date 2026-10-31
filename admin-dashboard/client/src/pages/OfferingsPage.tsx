import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ToggleSwitch } from 'flowbite-react';
import { HiPencil, HiPlus, HiSparkles, HiTrash, HiUsers } from 'react-icons/hi';
import { api, errorMessage } from '../lib/api';
import { formatPrice, OFFERING_TYPE_LABELS, OFFERING_TYPES } from '../lib/format';
import type { Offering, OfferingType } from '../lib/types';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import OfferingFormModal from '../components/OfferingFormModal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';

export default function OfferingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<OfferingType | ''>('');
  const [editing, setEditing] = useState<Offering | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Offering | null>(null);

  const { data: offerings = [], isLoading } = useQuery({
    queryKey: ['offerings'],
    queryFn: () => api.get<Offering[]>('/offerings'),
  });

  const grouped = useMemo(() => {
    const list = typeFilter ? offerings.filter((o) => o.type === typeFilter) : offerings;
    return OFFERING_TYPES.map((type) => ({ type, items: list.filter((o) => o.type === type) })).filter(
      (g) => g.items.length > 0,
    );
  }, [offerings, typeFilter]);

  const toggleActive = useMutation({
    mutationFn: (o: Offering) => api.put(`/offerings/${o.id}`, { ...o, is_active: !o.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const remove = useMutation({
    mutationFn: (o: Offering) => api.delete(`/offerings/${o.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast('Offering deleted');
      setDeleting(null);
    },
    onError: (err) => {
      toast(errorMessage(err), 'error');
      setDeleting(null);
    },
  });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Offerings & Amenities"
        description="Venues, rooms, packages and extras your guests can book."
        actions={
          <Button color="primary" className="w-full sm:w-auto" onClick={openNew}>
            <HiPlus className="mr-2 h-5 w-5" /> Add offering
          </Button>
        }
      />

      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {(['', ...OFFERING_TYPES] as (OfferingType | '')[]).map((t) => (
          <button
            key={t || 'all'}
            onClick={() => setTypeFilter(t)}
            className={`min-h-[40px] shrink-0 rounded-full px-4 text-sm font-medium transition ${
              typeFilter === t
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-white text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700'
            }`}
          >
            {t ? OFFERING_TYPE_LABELS[t] : 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={HiSparkles}
            title={typeFilter ? 'Nothing of this type yet' : 'No offerings yet'}
            description="Add the venues, rooms and extras guests can book."
            action={
              <Button color="primary" onClick={openNew}>
                <HiPlus className="mr-2 h-5 w-5" /> Add offering
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.type}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {OFFERING_TYPE_LABELS[group.type]}
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((o) => (
                  <div
                    key={o.id}
                    className={`flex flex-col rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md dark:bg-gray-800 ${
                      o.is_active
                        ? 'border-gray-200 dark:border-gray-700'
                        : 'border-dashed border-gray-300 opacity-70 dark:border-gray-600'
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{o.name}</h4>
                      <Badge color={o.is_active ? 'success' : 'gray'}>{o.is_active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    {o.description && (
                      <p className="mb-3 line-clamp-3 text-sm text-gray-600 dark:text-gray-400">{o.description}</p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">{formatPrice(o.price, o.price_unit)}</span>
                      {o.capacity !== null && (
                        <span className="flex items-center gap-1">
                          <HiUsers className="h-4 w-4 text-primary-500" /> {o.capacity}
                        </span>
                      )}
                      <span>Qty {o.quantity}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
                      <ToggleSwitch
                        checked={o.is_active}
                        color="primary"
                        sizing="sm"
                        label="Active"
                        disabled={toggleActive.isPending}
                        onChange={() => toggleActive.mutate(o)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          color="secondary"
                          onClick={() => {
                            setEditing(o);
                            setFormOpen(true);
                          }}
                        >
                          <HiPencil className="mr-1 h-4 w-4" /> Edit
                        </Button>
                        <Button size="sm" color="light" onClick={() => setDeleting(o)} title="Delete">
                          <HiTrash className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <OfferingFormModal open={formOpen} offering={editing} onClose={() => setFormOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete offering?"
        message={
          deleting?.usage_count
            ? `"${deleting.name}" is used by ${deleting.usage_count} booking(s) and cannot be deleted. Set it to inactive instead.`
            : `"${deleting?.name}" will be permanently removed.`
        }
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
