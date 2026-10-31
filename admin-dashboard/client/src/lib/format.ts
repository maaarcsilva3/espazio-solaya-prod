import type { LeadSource, OfferingType, Pipeline, StageOutcome, StatusCategory, VisitStatus } from './types';

export const OFFERING_TYPE_LABELS: Record<OfferingType, string> = {
  event_place_with_rooms: 'Event Place + Rooms',
  event_place_only: 'Event Place Only',
  room_only: 'Room Only',
  amenity: 'Amenity',
};

export const OFFERING_TYPES = Object.keys(OFFERING_TYPE_LABELS) as OfferingType[];

export const CATEGORY_LABELS: Record<StatusCategory, string> = {
  new: 'New',
  booked: 'Booked',
  closed: 'Closed',
};

export const CATEGORY_HINTS: Record<StatusCategory, string> = {
  new: 'Needs action. Counted as pending on the dashboard.',
  booked: 'A confirmed booking. Shown on the calendar and in upcoming bookings.',
  closed: 'Finished or declined. Hidden from the calendar by default.',
};

export const STATUS_CATEGORIES = Object.keys(CATEGORY_LABELS) as StatusCategory[];

/** Black or white, whichever reads better on the given hex background. */
export function readableTextColor(bg: string): string {
  const n = parseInt(bg.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111827' : '#ffffff';
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} - ${formatDate(end)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatPrice(price: number | null, unit: string | null): string {
  if (price === null || price === undefined) return '-';
  const amount = price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return unit ? `${amount} / ${unit.replace(/^per\s+/i, '')}` : amount;
}

export const PIPELINE_LABELS: Record<Pipeline, string> = {
  event_venue: 'Event venue',
  room_booking: 'Room booking',
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Website',
  facebook: 'Facebook',
  instagram: 'Instagram',
  social_media: 'Social media',
  referral: 'Referral',
  walk_in: 'Walk-in',
  other: 'Other',
};

export const LEAD_SOURCES = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];

export const STAGE_OUTCOME_LABELS: Record<StageOutcome, string> = {
  open: 'Open',
  won: 'Confirmed',
  lost: 'Lost',
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};

export const VISIT_STATUSES = Object.keys(VISIT_STATUS_LABELS) as VisitStatus[];

export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const safe = Math.max(0, Math.round(seconds));
  if (safe < 3600) return '< 1h';
  const hours = Math.floor(safe / 3600);
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  if (days === 0) return `${hours}h`;
  if (remainder === 0) return `${days}d`;
  return `${days}d ${remainder}h`;
}

export function formatRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `${rate}%`;
}

/** Venue-local timestamps stay local. Instants from the server end with Z. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.endsWith('Z')) return formatDateTime(value);
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return formatDateTime(normalized);
}

export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(' ', 'T').slice(0, 16);
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
