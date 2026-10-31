import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { IconType } from 'react-icons';
import { HiArrowRight, HiCalendar, HiCheckCircle, HiClock, HiInboxIn, HiSparkles } from 'react-icons/hi';
import { api } from '../lib/api';
import { formatDateRange, formatRate } from '../lib/format';
import type { BookingRequest, Stats } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import StatusActions from '../components/StatusActions';
import StatusBadge from '../components/StatusBadge';
import RequestDetailsPanel from '../components/RequestDetailsPanel';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Skeleton, { SkeletonRows } from '../components/ui/Skeleton';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function StatCard({
  label,
  hint,
  value,
  icon: Icon,
  to,
  tone,
}: {
  label: string;
  hint: string;
  value: number;
  icon: IconType;
  to: string;
  tone: string;
}) {
  return (
    <Link to={to} className="card group flex flex-col gap-4 p-5 transition hover:border-gray-300 hover:shadow-md dark:hover:border-gray-600">
      <div className="flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <HiArrowRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600" />
      </div>
      <div>
        <p className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">{value}</p>
        <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      </div>
    </Link>
  );
}

function RequestList({
  title,
  empty,
  emptyIcon,
  items,
  onOpen,
  showActions,
  viewAll,
}: {
  title: string;
  empty: string;
  emptyIcon: IconType;
  items: BookingRequest[] | undefined;
  onOpen: (id: number) => void;
  showActions?: boolean;
  viewAll: string;
}) {
  return (
    <Card
      title={title}
      bodyClassName="px-5"
      actions={
        <Link to={viewAll} className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
          View all
        </Link>
      }
    >
      {!items ? (
        <SkeletonRows count={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={emptyIcon} title={empty} className="py-10" />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => onOpen(r.id)}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400">
                      {r.full_name}
                    </p>
                    {!showActions && <StatusBadge status={r.status} />}
                  </div>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    {formatDateRange(r.start_date, r.end_date)}
                    {r.offering_name ? ` · ${r.offering_name}` : ''}
                  </p>
                </div>
              </button>
              {showActions && <StatusActions request={r} size="xs" compact />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { admin } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<Stats>('/stats'),
  });

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${admin?.name?.split(' ')[0] ?? 'there'}`}
        description="Here is what needs your attention today."
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {!data ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          ) : (
            <>
              <StatCard
                label="Needs action"
                hint="New requests to review"
                value={data.pending}
                icon={HiClock}
                to="/requests?category=new"
                tone="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
              />
              <StatCard
                label="Booked this month"
                hint="Confirmed stays and events"
                value={data.confirmed_this_month}
                icon={HiCheckCircle}
                to="/requests?category=booked"
                tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
              />
              <StatCard
                label="Next 7 days"
                hint="Bookings starting soon"
                value={data.upcoming_week}
                icon={HiCalendar}
                to="/calendar"
                tone="bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"
              />
              <StatCard
                label="Active offerings"
                hint="Shown on the website"
                value={data.active_offerings}
                icon={HiSparkles}
                to="/offerings"
                tone="bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300"
              />
            </>
          )}
        </div>

        {data?.pipeline && (
          <Card
            title="Sales pipeline"
            description="Open inquiries, leads currently confirmed, and the all-time conversion rate. Lost inquiries are excluded from the rate."
            actions={
              <Link to="/pipeline/analytics" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
                Performance
              </Link>
            }
          >
            <div className="grid grid-cols-3 gap-4">
              <Link to="/pipeline/events" className="rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{data.pipeline.open}</p>
                <p className="text-sm text-gray-500">Open</p>
              </Link>
              <Link to="/pipeline/events" className="rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{data.pipeline.confirmed}</p>
                <p className="text-sm text-gray-500">Confirmed now</p>
              </Link>
              <Link to="/pipeline/analytics" className="rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{formatRate(data.pipeline.conversion_rate)}</p>
                <p className="text-sm text-gray-500">Conversion</p>
              </Link>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <RequestList
            title="Needs action"
            empty="All caught up. No new requests."
            emptyIcon={HiInboxIn}
            items={data?.pending_requests}
            onOpen={setSelectedId}
            showActions
            viewAll="/requests?category=new"
          />
          <RequestList
            title="Upcoming bookings"
            empty="No upcoming bookings yet."
            emptyIcon={HiCalendar}
            items={data?.upcoming_requests}
            onOpen={setSelectedId}
            viewAll="/calendar"
          />
        </div>
      </div>

      <RequestDetailsPanel requestId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
