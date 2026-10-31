import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction';
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import { Button } from 'flowbite-react';
import { HiAdjustments, HiCheck } from 'react-icons/hi';
import { api } from '../lib/api';
import type { StatusDef } from '../lib/types';
import { useStatuses } from '../hooks/useStatuses';
import { useNewBooking } from '../context/NewBookingContext';
import PageHeader from '../components/PageHeader';
import RequestDetailsPanel from '../components/RequestDetailsPanel';
import Sheet from '../components/ui/Sheet';

function useIsMobile() {
  const query = '(max-width: 767px)';
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

function FilterChip({ status, active, onClick }: { status: StatusDef; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[36px] items-center gap-2 rounded-full px-3 text-sm ring-1 ring-inset transition ${
        active
          ? 'bg-white font-medium text-gray-900 ring-gray-300 dark:bg-gray-800 dark:text-white dark:ring-gray-600'
          : 'text-gray-400 ring-gray-200 hover:text-gray-600 dark:text-gray-500 dark:ring-gray-700 dark:hover:text-gray-300'
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${active ? '' : 'bg-gray-200 dark:bg-gray-600'}`}
        style={active ? { backgroundColor: status.bg } : undefined}
      />
      {status.label}
    </button>
  );
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useIsMobile();
  const { statuses, get, byCategory } = useStatuses();
  const openNewBooking = useNewBooking();
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  // null = the default view: New and Booked statuses.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const visible = useMemo(
    () => chosen ?? [...byCategory('new'), ...byCategory('booked')].map((s) => s.key),
    [chosen, byCategory],
  );

  useEffect(() => {
    calendarRef.current?.getApi().changeView(isMobile ? 'listMonth' : 'dayGridMonth');
  }, [isMobile]);

  const { data: rawEvents = [] } = useQuery({
    queryKey: ['calendar', range, chosen],
    queryFn: () =>
      api.get<EventInput[]>('/calendar', {
        start: range!.start,
        end: range!.end,
        statuses: chosen ? chosen.join(',') : undefined,
      }),
    enabled: !!range && (chosen === null || chosen.length > 0),
  });

  const events = useMemo(
    () =>
      chosen?.length === 0
        ? []
        : rawEvents.map((e) => {
            if (e.extendedProps?.record_type === 'inquiry') return e;
            const s = get(String(e.extendedProps?.status ?? ''));
            return { ...e, backgroundColor: s.bg, borderColor: s.bg, textColor: s.text_color };
          }),
    [rawEvents, chosen, get],
  );

  const toggle = (key: string) =>
    setChosen((cur) => {
      const list = cur ?? visible;
      return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    });

  const onDatesSet = (arg: DatesSetArg) => {
    setRange({ start: arg.startStr.slice(0, 10), end: arg.endStr.slice(0, 10) });
  };
  const onEventClick = (arg: EventClickArg) => {
    const props = arg.event.extendedProps;
    if (props.record_type === 'inquiry') {
      const path = props.pipeline === 'room_booking' ? '/pipeline/rooms' : '/pipeline/events';
      navigate(`${path}?inquiry=${props.inquiry_id}`);
      return;
    }
    setSelectedId(Number(arg.event.id));
  };
  const onDateClick = (arg: DateClickArg) => openNewBooking(arg.dateStr.slice(0, 10));

  return (
    <>
      <PageHeader
        title="Calendar"
        description={isMobile ? 'Tap a booking to see details.' : 'Click a booking to see details, or an empty day to add one.'}
        actions={
          isMobile && (
            <Button color="secondary" size="sm" onClick={() => setFilterOpen(true)}>
              <HiAdjustments className="mr-2 h-4 w-4" /> Statuses ({visible.length}/{statuses.length})
            </Button>
          )
        }
      />

      {!isMobile && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {statuses.map((s) => (
            <FilterChip key={s.key} status={s} active={visible.includes(s.key)} onClick={() => toggle(s.key)} />
          ))}
          {chosen !== null && (
            <button
              onClick={() => setChosen(null)}
              className="ml-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              Reset
            </button>
          )}
        </div>
      )}

      <div className="card p-3 sm:p-5">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={isMobile ? 'listMonth' : 'dayGridMonth'}
          headerToolbar={
            isMobile
              ? { left: 'prev,next', center: 'title', right: 'today' }
              : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' }
          }
          footerToolbar={isMobile ? { center: 'dayGridMonth,listMonth' } : undefined}
          buttonText={{ today: 'Today', month: 'Month', list: 'List' }}
          events={events}
          datesSet={onDatesSet}
          eventClick={onEventClick}
          dateClick={onDateClick}
          dayMaxEvents={3}
          height="auto"
          firstDay={0}
          noEventsText="No bookings this month"
        />
      </div>

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} side="bottom" title="Show statuses">
        <div className="space-y-1 px-4 pb-4 pt-2">
          {statuses.map((s) => {
            const active = visible.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggle(s.key)}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-left text-base text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.bg }} />
                <span className="flex-1">{s.label}</span>
                {active && <HiCheck className="h-5 w-5 text-primary-600 dark:text-primary-400" />}
              </button>
            );
          })}
          <div className="flex gap-2 pt-3">
            <Button color="secondary" className="flex-1" onClick={() => setChosen(null)}>
              Reset
            </Button>
            <Button color="primary" className="flex-1" onClick={() => setFilterOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Sheet>

      <RequestDetailsPanel requestId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
