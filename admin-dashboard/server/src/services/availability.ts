import type { PoolClient } from 'pg';
import {
  availabilityMessage,
  bookingWindow,
  rangesOverlap,
  type TimeWindow,
} from '../domain/crm';
import { HttpError } from '../http';

/**
 * Counts confirmed inquiries and booked requests that overlap `window`.
 * Locks the offering row so two confirms cannot both pass the check.
 * Callers that also lock an inquiry or booking row must take that lock first.
 */
export async function assertOfferingAvailable(
  client: PoolClient,
  args: {
    offeringId: number;
    window: TimeWindow;
    excludeInquiryId?: number | null;
    excludeRequestId?: number | null;
  },
) {
  const { rows: offerings } = await client.query<{ id: number; name: string; quantity: number }>(
    'SELECT id, name, quantity FROM offerings WHERE id = $1 FOR UPDATE',
    [args.offeringId],
  );
  if (!offerings.length) throw new HttpError(400, 'Selected package is not available.');
  const offering = offerings[0];
  const start = args.window.start.replace('T', ' ');
  const end = args.window.end.replace('T', ' ');

  const { rows: inquiries } = await client.query<{ start_at: string; end_at: string }>(
    `SELECT to_char(i.start_at, 'YYYY-MM-DD HH24:MI:SS') AS start_at,
            to_char(i.end_at, 'YYYY-MM-DD HH24:MI:SS') AS end_at
       FROM inquiries i
       JOIN pipeline_stages s ON s.id = i.stage_id
      WHERE i.offering_id = $1
        AND s.reserves_inventory
        AND i.start_at IS NOT NULL
        AND i.end_at IS NOT NULL
        AND ($2::int IS NULL OR i.id <> $2)`,
    [args.offeringId, args.excludeInquiryId ?? null],
  );

  const { rows: bookings } = await client.query<{ start_date: string; end_date: string }>(
    `SELECT br.start_date::text AS start_date, br.end_date::text AS end_date
       FROM booking_requests br
       JOIN request_statuses rs ON rs.key = br.status
      WHERE br.offering_id = $1
        AND rs.category = 'booked'
        AND ($2::int IS NULL OR br.id <> $2)`,
    [args.offeringId, args.excludeRequestId ?? null],
  );

  let used = 0;
  for (const row of inquiries) {
    if (rangesOverlap(start, end, row.start_at, row.end_at)) used += 1;
  }
  for (const row of bookings) {
    const window = bookingWindow(row.start_date, row.end_date);
    if (rangesOverlap(start, end, window.start, window.end)) used += 1;
  }
  if (used >= offering.quantity) {
    throw new HttpError(409, availabilityMessage(offering.name, offering.quantity, used, start, end));
  }
}

/** Booked-category requests hold inventory. Other statuses do not. */
export async function assertBookedRequestAvailable(
  client: PoolClient,
  args: {
    status: string;
    offeringId: number | null;
    startDate: string;
    endDate: string;
    excludeRequestId?: number | null;
  },
) {
  const { rows } = await client.query<{ category: string }>(
    'SELECT category FROM request_statuses WHERE key = $1',
    [args.status],
  );
  if (!rows.length) throw new HttpError(400, 'That status does not exist. Refresh the page and try again.');
  if (rows[0].category !== 'booked' || args.offeringId == null) return;
  await assertOfferingAvailable(client, {
    offeringId: args.offeringId,
    window: bookingWindow(args.startDate, args.endDate),
    excludeRequestId: args.excludeRequestId,
  });
}
