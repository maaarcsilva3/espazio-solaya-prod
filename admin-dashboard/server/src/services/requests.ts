import type { PoolClient } from 'pg';
import { pool, query } from '../db';
import { HttpError } from '../http';
import { defaultStatusKey } from '../routes/statuses';
import { assertBookedRequestAvailable } from './availability';

export interface RequestInput {
  full_name: string;
  email: string;
  phone: string | null;
  offering_id: number | null;
  start_date: string;
  end_date: string;
  guests: number | null;
  event_type: string | null;
  message: string | null;
  amenity_ids: number[];
  status?: string;
  admin_notes?: string | null;
  source?: string;
}

export const REQUEST_SELECT = `
  SELECT br.id, br.full_name, br.email, br.phone, br.offering_id,
         o.name AS offering_name, o.type AS offering_type,
         br.start_date, br.end_date, br.guests, br.event_type, br.message,
         br.status, br.admin_notes, br.source, br.created_at, br.updated_at,
         COALESCE(
           (SELECT json_agg(json_build_object('id', a.id, 'name', a.name) ORDER BY a.name)
              FROM booking_request_amenities bra
              JOIN offerings a ON a.id = bra.offering_id
             WHERE bra.request_id = br.id),
           '[]'::json
         ) AS amenities
    FROM booking_requests br
    JOIN request_statuses rs ON rs.key = br.status
    LEFT JOIN offerings o ON o.id = br.offering_id`;

export async function getRequest(id: number) {
  const [row] = await query(`${REQUEST_SELECT} WHERE br.id = $1`, [id]);
  return row ?? null;
}

async function validateOfferings(client: PoolClient, input: RequestInput, activeOnly: boolean) {
  const activeClause = activeOnly ? 'AND is_active = TRUE' : '';
  if (input.offering_id !== null) {
    const { rows } = await client.query(
      `SELECT id FROM offerings WHERE id = $1 AND type <> 'amenity' ${activeClause}`,
      [input.offering_id],
    );
    if (!rows.length) throw new HttpError(400, 'Selected offering is not available.');
  }
  const amenityIds = [...new Set(input.amenity_ids)];
  if (amenityIds.length) {
    const { rows } = await client.query(
      `SELECT id FROM offerings WHERE id = ANY($1::int[]) AND type = 'amenity' ${activeClause}`,
      [amenityIds],
    );
    if (rows.length !== amenityIds.length) {
      throw new HttpError(400, 'One or more selected amenities are not available.');
    }
  }
  return amenityIds;
}

async function saveAmenities(client: PoolClient, requestId: number, amenityIds: number[]) {
  await client.query('DELETE FROM booking_request_amenities WHERE request_id = $1', [requestId]);
  if (amenityIds.length) {
    await client.query(
      `INSERT INTO booking_request_amenities (request_id, offering_id)
       SELECT $1, UNNEST($2::int[])`,
      [requestId, amenityIds],
    );
  }
}

export async function createRequest(input: RequestInput, opts: { activeOnly: boolean }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const amenityIds = await validateOfferings(client, input, opts.activeOnly);
    const status = input.status ?? (await defaultStatusKey(client));
    await assertBookedRequestAvailable(client, {
      status,
      offeringId: input.offering_id,
      startDate: input.start_date,
      endDate: input.end_date,
    });
    const { rows } = await client.query(
      `INSERT INTO booking_requests
         (full_name, email, phone, offering_id, start_date, end_date, guests, event_type, message,
          status, admin_notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        input.full_name,
        input.email,
        input.phone,
        input.offering_id,
        input.start_date,
        input.end_date,
        input.guests,
        input.event_type,
        input.message,
        status,
        input.admin_notes ?? null,
        input.source ?? 'website',
      ],
    );
    const id = rows[0].id as number;
    await saveAmenities(client, id, amenityIds);
    await client.query('COMMIT');
    return id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateRequest(id: number, input: RequestInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const amenityIds = await validateOfferings(client, input, false);
    const { rows: existing } = await client.query<{ status: string }>(
      'SELECT status FROM booking_requests WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!existing.length) throw new HttpError(404, 'Request not found.');
    await assertBookedRequestAvailable(client, {
      status: input.status ?? existing[0].status,
      offeringId: input.offering_id,
      startDate: input.start_date,
      endDate: input.end_date,
      excludeRequestId: id,
    });
    const { rowCount } = await client.query(
      `UPDATE booking_requests SET
         full_name = $1, email = $2, phone = $3, offering_id = $4, start_date = $5, end_date = $6,
         guests = $7, event_type = $8, message = $9, status = COALESCE($10, status), admin_notes = $11
       WHERE id = $12`,
      [
        input.full_name,
        input.email,
        input.phone,
        input.offering_id,
        input.start_date,
        input.end_date,
        input.guests,
        input.event_type,
        input.message,
        input.status ?? null,
        input.admin_notes ?? null,
        id,
      ],
    );
    if (!rowCount) throw new HttpError(404, 'Request not found.');
    await saveAmenities(client, id, amenityIds);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setRequestStatus(id: number, status: string, adminNotes?: string | null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ offering_id: number | null; start_date: string; end_date: string }>(
      `SELECT offering_id, start_date::text AS start_date, end_date::text AS end_date
         FROM booking_requests WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!rows.length) throw new HttpError(404, 'Request not found.');
    await assertBookedRequestAvailable(client, {
      status,
      offeringId: rows[0].offering_id,
      startDate: rows[0].start_date,
      endDate: rows[0].end_date,
      excludeRequestId: id,
    });
    if (adminNotes === undefined) {
      await client.query('UPDATE booking_requests SET status = $1 WHERE id = $2', [status, id]);
    } else {
      await client.query('UPDATE booking_requests SET status = $1, admin_notes = $2 WHERE id = $3', [
        status,
        adminNotes,
        id,
      ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
