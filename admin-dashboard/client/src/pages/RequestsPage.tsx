import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Pagination, Select, TextInput } from 'flowbite-react';
import { HiCalendar, HiInbox, HiPlus, HiSearch, HiUsers, HiX } from 'react-icons/hi';
import { api } from '../lib/api';
import { CATEGORY_LABELS, formatDateRange, formatDateTime } from '../lib/format';
import type { BookingRequest, Offering, Paginated, StatusCategory } from '../lib/types';
import { useStatuses } from '../hooks/useStatuses';
import { useNewBooking } from '../context/NewBookingContext';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import StatusActions from '../components/StatusActions';
import RequestDetailsPanel from '../components/RequestDetailsPanel';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Skeleton';

const PAGE_SIZE = 20;

function Chip({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${
        active
          ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
          : 'bg-white text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      {count !== undefined && (
        <span className={`text-xs ${active ? 'opacity-70' : 'text-gray-400 dark:text-gray-500'}`}>{count}</span>
      )}
    </button>
  );
}

export default function RequestsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const category = (params.get('category') ?? '') as StatusCategory | '';
  const { statuses } = useStatuses();
  const openNewBooking = useNewBooking();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offeringId, setOfferingId] = useState('');
  const [page, setPage] = useState(1);
  const requestParam = params.get('request');
  const [selectedId, setSelectedId] = useState<number | null>(requestParam ? Number(requestParam) : null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [status, category, debouncedSearch, offeringId]);

  useEffect(() => {
    if (requestParam) setSelectedId(Number(requestParam));
  }, [requestParam]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['requests', { status, category, search: debouncedSearch, offeringId, page }],
    queryFn: () =>
      api.get<Paginated<BookingRequest>>('/requests', {
        status,
        category,
        search: debouncedSearch,
        offering_id: offeringId,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const { data: offerings = [] } = useQuery({
    queryKey: ['offerings'],
    queryFn: () => api.get<Offering[]>('/offerings'),
  });

  const setFilter = (key: 'status' | 'category', value: string) => {
    const next = new URLSearchParams(params);
    next.delete('status');
    next.delete('category');
    if (value) next.set(key, value);
    setParams(next, { replace: true });
  };

  const rows = data?.data ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const totalAll = statuses.reduce((sum, s) => sum + (s.usage_count ?? 0), 0);
  const filtered = !!(status || category || debouncedSearch || offeringId);

  return (
    <>
      <PageHeader
        title="Booking requests"
        description="Requests from the website and bookings you add yourself."
      />

      {/* Sticky filters */}
      <div className="sticky top-14 z-10 -mx-4 mb-5 space-y-3 border-b border-gray-200 bg-gray-50/95 px-4 pb-3 pt-1 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 sm:-mx-6 sm:px-6 lg:top-16 lg:-mx-8 lg:px-8">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <TextInput
            icon={HiSearch}
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:col-span-2"
          />
          <Select value={offeringId} onChange={(e) => setOfferingId(e.target.value)} aria-label="Offering">
            <option value="">All offerings</option>
            {offerings
              .filter((o) => o.type !== 'amenity')
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </Select>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {category ? (
            <button
              onClick={() => setFilter('category', '')}
              className="flex min-h-[40px] shrink-0 items-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
            >
              All {CATEGORY_LABELS[category].toLowerCase()} statuses <HiX className="h-4 w-4" />
            </button>
          ) : (
            <Chip active={!status} label="All" count={totalAll} onClick={() => setFilter('status', '')} />
          )}
          {statuses.map((s) => (
            <Chip
              key={s.key}
              active={status === s.key}
              label={s.label}
              count={s.usage_count}
              color={s.bg}
              onClick={() => setFilter('status', s.key)}
            />
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="card px-5">
          <SkeletonRows count={6} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={HiInbox}
            title={filtered ? 'No requests match these filters' : 'No booking requests yet'}
            description={
              filtered
                ? 'Try a different status or search.'
                : 'Requests from your website form will show up here. You can also add one yourself.'
            }
            action={
              <Button color="primary" onClick={() => openNewBooking()}>
                <HiPlus className="mr-2 h-5 w-5" /> Add booking
              </Button>
            }
          />
        </div>
      ) : (
        <div className={isFetching ? 'opacity-70 transition' : 'transition'}>
          {/* Desktop table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Guest</th>
                  <th className="px-5 py-3 font-medium">Booking</th>
                  <th className="px-5 py-3 font-medium">Dates</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-700/40"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900 dark:text-white">{r.full_name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-gray-900 dark:text-gray-100">{r.offering_name ?? '-'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {[r.event_type, r.guests ? `${r.guests} guests` : null].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-700 dark:text-gray-300">
                      {formatDateRange(r.start_date, r.end_date)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <StatusActions request={r} size="xs" compact />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="card p-4 active:bg-gray-50 dark:active:bg-gray-700/40" onClick={() => setSelectedId(r.id)}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-gray-900 dark:text-white">{r.full_name}</p>
                    <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                      {r.offering_name ?? 'No offering selected'}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                  <span className="flex items-center gap-1.5">
                    <HiCalendar className="h-4 w-4 text-gray-400" />
                    {formatDateRange(r.start_date, r.end_date)}
                  </span>
                  {r.guests !== null && (
                    <span className="flex items-center gap-1.5">
                      <HiUsers className="h-4 w-4 text-gray-400" /> {r.guests}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Received {formatDateTime(r.created_at)}</p>
                  <StatusActions request={r} size="sm" compact />
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex justify-center">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} showIcons layout="navigation" />
            </div>
          )}
          <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
            {data?.total ?? 0} request{data?.total === 1 ? '' : 's'}
          </p>
        </div>
      )}

      <RequestDetailsPanel
        requestId={selectedId}
        onClose={() => {
          setSelectedId(null);
          if (params.get('request')) {
            const next = new URLSearchParams(params);
            next.delete('request');
            setParams(next);
          }
        }}
      />
    </>
  );
}
