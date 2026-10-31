import { Router } from 'express';
import { query } from '../db';
import { asyncHandler, HttpError, parseId } from '../http';
import { offeringSchema } from '../schemas';

export const offeringsRouter = Router();

const COLUMNS = `id, name, type, description, capacity, price, price_unit, quantity, is_active, created_at, updated_at`;

offeringsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const params: unknown[] = [];
    const where: string[] = [];
    if (typeof req.query.type === 'string' && req.query.type) {
      params.push(req.query.type);
      where.push(`type = $${params.length}`);
    }
    if (req.query.active === 'true') where.push('is_active = TRUE');
    const rows = await query(
      `SELECT ${COLUMNS},
         (SELECT COUNT(*)::int FROM booking_requests br WHERE br.offering_id = o.id)
         + (SELECT COUNT(*)::int FROM booking_request_amenities bra WHERE bra.offering_id = o.id)
         + (SELECT COUNT(*)::int FROM inquiries i WHERE i.offering_id = o.id) AS usage_count
       FROM offerings o
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY type, name`,
      params,
    );
    res.json(rows);
  }),
);

offeringsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const [row] = await query(`SELECT ${COLUMNS} FROM offerings WHERE id = $1`, [parseId(req.params.id)]);
    if (!row) throw new HttpError(404, 'Offering not found.');
    res.json(row);
  }),
);

offeringsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = offeringSchema.parse(req.body);
    const [row] = await query(
      `INSERT INTO offerings (name, type, description, capacity, price, price_unit, quantity, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
      [d.name, d.type, d.description, d.capacity, d.price, d.price_unit, d.quantity, d.is_active],
    );
    res.status(201).json(row);
  }),
);

offeringsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = offeringSchema.parse(req.body);
    const [row] = await query(
      `UPDATE offerings SET name = $1, type = $2, description = $3, capacity = $4,
         price = $5, price_unit = $6, quantity = $7, is_active = $8
       WHERE id = $9 RETURNING ${COLUMNS}`,
      [d.name, d.type, d.description, d.capacity, d.price, d.price_unit, d.quantity, d.is_active, parseId(req.params.id)],
    );
    if (!row) throw new HttpError(404, 'Offering not found.');
    res.json(row);
  }),
);

offeringsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [usage] = await query<{ count: number }>(
      `SELECT (SELECT COUNT(*)::int FROM booking_requests WHERE offering_id = $1)
            + (SELECT COUNT(*)::int FROM booking_request_amenities WHERE offering_id = $1)
            + (SELECT COUNT(*)::int FROM inquiries WHERE offering_id = $1) AS count`,
      [id],
    );
    if (usage.count > 0) {
      throw new HttpError(
        409,
        'This offering is used by existing bookings. Set it to inactive instead of deleting it.',
      );
    }
    const rows = await query('DELETE FROM offerings WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) throw new HttpError(404, 'Offering not found.');
    res.json({ ok: true });
  }),
);
