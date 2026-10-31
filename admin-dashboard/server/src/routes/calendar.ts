import { Router } from 'express';
import { query } from '../db';
import { allDayRange } from '../domain/crm';
import { asyncHandler, HttpError } from '../http';
export const calendarRouter = Router();

const toDate = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '');
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

calendarRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const start = toDate(req.query.start);
    const end = toDate(req.query.end);
    if (!isDate(start) || !isDate(end)) throw new HttpError(400, 'start and end dates are required.');

    const requested =
      typeof req.query.statuses === 'string' && req.query.statuses ? req.query.statuses.split(',') : null;

    // FullCalendar treats all-day end dates as exclusive, so add one day.
    const rows = await query(
      `SELECT br.id, br.full_name, br.status, br.guests, br.event_type,
              o.name AS offering_name, o.type AS offering_type,
              br.start_date,
              to_char(br.end_date + 1, 'YYYY-MM-DD') AS end_exclusive
         FROM booking_requests br
         JOIN request_statuses rs ON rs.key = br.status
         LEFT JOIN offerings o ON o.id = br.offering_id
        WHERE br.start_date < $2 AND br.end_date >= $1
          AND (CASE WHEN $3::text[] IS NULL THEN rs.category IN ('new', 'booked')
                    ELSE br.status = ANY($3::text[]) END)
        ORDER BY br.start_date`,
      [start, end, requested],
    );

    const inquiries = await query<{
      id: number;
      customer_name: string;
      pipeline: string;
      guests: number | null;
      event_type: string | null;
      offering_name: string | null;
      start_at: string;
      end_at: string;
      stage_label: string;
      bg: string;
      text_color: string;
    }>(
      `SELECT i.id, i.customer_name, i.pipeline, i.guests, i.event_type,
              o.name AS offering_name,
              to_char(i.start_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_at,
              to_char(i.end_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS end_at,
              s.label AS stage_label, s.bg, s.text_color
         FROM inquiries i
         JOIN pipeline_stages s ON s.id = i.stage_id
         LEFT JOIN offerings o ON o.id = i.offering_id
        WHERE s.reserves_inventory
          AND i.start_at IS NOT NULL
          AND i.end_at IS NOT NULL
          AND i.start_at < $2::timestamp
          AND i.end_at > $1::timestamp
        ORDER BY i.start_at`,
      [start, end],
    );

    res.json([
      ...rows.map((r) => ({
        id: String(r.id),
        title: `${r.full_name}${r.offering_name ? ` - ${r.offering_name}` : ''}`,
        start: r.start_date,
        end: r.end_exclusive,
        allDay: true,
        extendedProps: {
          record_type: 'booking',
          status: r.status,
          offering_name: r.offering_name,
          offering_type: r.offering_type,
          guests: r.guests,
          event_type: r.event_type,
        },
      })),
      ...inquiries.map((r) => {
        const range = allDayRange(r.start_at, r.end_at);
        return {
          id: `inquiry-${r.id}`,
          title: `${r.customer_name}${r.offering_name ? ` - ${r.offering_name}` : ''}`,
          start: range.start,
          end: range.end,
          allDay: true,
          backgroundColor: r.bg.trim(),
          borderColor: r.bg.trim(),
          textColor: r.text_color.trim(),
          extendedProps: {
            record_type: 'inquiry',
            inquiry_id: r.id,
            pipeline: r.pipeline,
            stage_label: r.stage_label,
            offering_name: r.offering_name,
            guests: r.guests,
            event_type: r.event_type,
          },
        };
      }),
    ]);
  }),
);
