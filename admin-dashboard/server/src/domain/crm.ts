/** Pure CRM rules. Availability SQL and analytics queries call these so the definitions stay in one place. */

export const PIPELINES = ['event_venue', 'room_booking'] as const;
export type Pipeline = (typeof PIPELINES)[number];

export const LEAD_SOURCES = [
  'website',
  'facebook',
  'instagram',
  'social_media',
  'referral',
  'walk_in',
  'other',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const STAGE_OUTCOMES = ['open', 'won', 'lost'] as const;
export type StageOutcome = (typeof STAGE_OUTCOMES)[number];

export const VISIT_STATUSES = ['scheduled', 'completed', 'cancelled', 'rescheduled'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const CONVERSION_DEFINITION =
  'Eligible inquiries are those created in the selected period whose current stage is not lost. ' +
  'The conversion rate is confirmed inquiries divided by eligible inquiries. A confirmed inquiry is one that has entered the confirmed stage at least once. ' +
  'Average time to conversion is the average elapsed time from creation to that first confirmed transition, for converted eligible inquiries. ' +
  'Leaving the confirmed stage does not clear the original confirmed time. ' +
  'Lost inquiries are excluded from both the numerator and the denominator. Deleted inquiries are not counted.';

export interface QuoteParts {
  package_price: number;
  additional_charges: number;
  discounts: number;
  other_fees: number;
}

export function toCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function quoteTotal(
  parts: QuoteParts,
): { ok: true; total: number } | { ok: false; message: string } {
  const cents =
    toCents(parts.package_price) +
    toCents(parts.additional_charges) +
    toCents(parts.other_fees) -
    toCents(parts.discounts);
  if (cents < 0) return { ok: false, message: 'Discount cannot exceed the other amounts.' };
  return { ok: true, total: cents / 100 };
}

export function sameMoney(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return toCents(a) === toCents(b);
}

export function sameIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((id, i) => id === right[i]);
}

/** `YYYY-MM-DD HH:mm:ss`, or null when the text is not a date or timestamp. */
export function normalizeTimestamp(value: string): string | null {
  const v = value.trim().replace('T', ' ');
  const match = v.match(/^(\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const date = match[1];
  const hh = match[2] ?? '00';
  const mm = match[3] ?? '00';
  const ss = match[4] ?? '00';
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${date} ${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}`;
}

export function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export interface TimeWindow {
  start: string;
  end: string;
}

/**
 * Half-open stay used for inventory. A missing end expands to the end of the start's calendar day.
 * A date-only start holds that whole day. A timed start without an end holds from that time until midnight.
 */
export function reservationWindow(
  startAt: string | null,
  endAt: string | null,
): { ok: true; window: TimeWindow | null } | { ok: false; message: string } {
  if (!startAt && !endAt) return { ok: true, window: null };
  if (!startAt) return { ok: false, message: 'Set a start date.' };
  const start = normalizeTimestamp(startAt);
  if (!start) return { ok: false, message: 'Use a valid start date and time.' };
  if (!endAt) {
    const day = start.slice(0, 10);
    const end = `${nextDay(day)} 00:00:00`;
    if (start.endsWith('00:00:00')) return { ok: true, window: { start: `${day} 00:00:00`, end } };
    return { ok: true, window: { start, end } };
  }
  const end = normalizeTimestamp(endAt);
  if (!end) return { ok: false, message: 'Use a valid end date and time.' };
  if (!(start < end)) return { ok: false, message: 'End must be after the start.' };
  return { ok: true, window: { start, end } };
}

/** Inclusive booking dates become `[start 00:00, day after end 00:00)`. */
export function bookingWindow(startDate: string, endDate: string): TimeWindow {
  return {
    start: `${startDate.slice(0, 10)} 00:00:00`,
    end: `${nextDay(endDate.slice(0, 10))} 00:00:00`,
  };
}

/** True when the half-open ranges `[aStart, aEnd)` and `[bStart, bEnd)` overlap. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function allDayRange(startAt: string, endAt: string): { start: string; end: string } {
  const start = startAt.slice(0, 10);
  const endTime = endAt.slice(11, 19);
  const endDate = endAt.slice(0, 10);
  return { start, end: endTime === '00:00:00' ? endDate : nextDay(endDate) };
}

export function availabilityMessage(name: string, quantity: number, used: number, start: string, end: string): string {
  const unit = quantity === 1 ? 'unit' : 'units';
  const reservation = used === 1 ? 'reservation' : 'reservations';
  return `${name} has ${quantity} ${unit} available and ${used} confirmed ${reservation} already overlap ${start} to ${end}.`;
}

export interface CohortRow {
  outcome: StageOutcome;
  created_at: string;
  converted_at: string | null;
}

export interface ConversionCohort {
  eligible: number;
  converted: number;
  conversion_rate: number | null;
  average_seconds: number | null;
}

export function conversionCohort(rows: CohortRow[]): ConversionCohort {
  const eligible = rows.filter((row) => row.outcome !== 'lost');
  const converted = eligible.filter((row) => row.converted_at);
  const conversion_rate =
    eligible.length === 0 ? null : Math.round((converted.length / eligible.length) * 1000) / 10;
  let average_seconds: number | null = null;
  if (converted.length) {
    const sum = converted.reduce((total, row) => {
      return total + (Date.parse(row.converted_at!) - Date.parse(row.created_at)) / 1000;
    }, 0);
    average_seconds = Math.round(sum / converted.length);
  }
  return { eligible: eligible.length, converted: converted.length, conversion_rate, average_seconds };
}

export function outcomeCounts(rows: { outcome: StageOutcome }[]) {
  return {
    open: rows.filter((row) => row.outcome === 'open').length,
    confirmed: rows.filter((row) => row.outcome === 'won').length,
    lost: rows.filter((row) => row.outcome === 'lost').length,
  };
}

export interface GroupRow extends CohortRow {
  key: string;
  label: string;
}

export function groupedConversion(rows: GroupRow[]) {
  const groups = new Map<string, { label: string; rows: CohortRow[] }>();
  for (const row of rows) {
    const group = groups.get(row.key) ?? { label: row.label, rows: [] };
    group.rows.push(row);
    groups.set(row.key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      ...conversionCohort(group.rows),
      ...outcomeCounts(group.rows),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface StageSpan {
  key: string;
  label: string;
  entered_at: string;
  left_at: string | null;
}

export function averageStageSeconds(spans: StageSpan[], nowIso: string) {
  const now = Date.parse(nowIso);
  const groups = new Map<string, { label: string; total: number; visits: number }>();
  for (const span of spans) {
    const start = Date.parse(span.entered_at);
    const end = span.left_at ? Date.parse(span.left_at) : now;
    const seconds = Math.max(0, (end - start) / 1000);
    const group = groups.get(span.key) ?? { label: span.label, total: 0, visits: 0 };
    group.total += seconds;
    group.visits += 1;
    groups.set(span.key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    average_seconds: group.visits ? Math.round(group.total / group.visits) : 0,
    visits: group.visits,
  }));
}

export function stageDeleteError(input: {
  outcome: StageOutcome;
  usage: number;
  moveTo: number | null;
  moveToExists: boolean;
}): string | null {
  if (input.outcome === 'won') return 'The confirmed stage cannot be deleted. Rename it instead.';
  if (input.usage > 0) {
    if (input.moveTo == null) {
      return `${input.usage} inquiry(s) are in this stage. Choose a stage to move them to.`;
    }
    if (!input.moveToExists) return 'The stage to move inquiries to does not exist.';
  }
  return null;
}

export function stageOrderError(existingIds: number[], nextIds: number[]): string | null {
  if (existingIds.length !== nextIds.length || new Set(nextIds).size !== nextIds.length) {
    return 'Send every stage in this pipeline, in the new order.';
  }
  const existing = new Set(existingIds);
  if (nextIds.some((id) => !existing.has(id))) return 'Stage order includes an unknown stage.';
  return null;
}

export function wonStageError(wonCount: number): string | null {
  if (wonCount !== 1) return 'Each pipeline needs exactly one confirmed stage.';
  return null;
}
