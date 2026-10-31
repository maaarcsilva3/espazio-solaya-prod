import { Router } from 'express';
import { query } from '../db';
import { asyncHandler, HttpError, parseId } from '../http';
import { adminRequestSchema, STATUS_CATEGORIES, statusSchema } from '../schemas';
import { createRequest, getRequest, REQUEST_SELECT, setRequestStatus, updateRequest } from '../services/requests';

export const requestsRouter = Router();

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

requestsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const params: unknown[] = [];
    const where: string[] = [];
    const { status, category, offering_id, from, to, search } = req.query;

    if (typeof status === 'string' && status) {
      params.push(status);
      where.push(`br.status = $${params.length}`);
    }
    if (typeof category === 'string' && (STATUS_CATEGORIES as readonly string[]).includes(category)) {
      params.push(category);
      where.push(`rs.category = $${params.length}`);
    }
    if (typeof offering_id === 'string' && offering_id) {
      params.push(parseId(offering_id));
      where.push(`br.offering_id = $${params.length}`);
    }
    if (isDate(from)) {
      params.push(from);
      where.push(`br.end_date >= $${params.length}`);
    }
    if (isDate(to)) {
      params.push(to);
      where.push(`br.start_date <= $${params.length}`);
    }
    if (typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim()}%`);
      const p = `$${params.length}`;
      where.push(`(br.full_name ILIKE ${p} OR br.email ILIKE ${p} OR br.phone ILIKE ${p} OR br.event_type ILIKE ${p})`);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [{ total }] = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
         FROM booking_requests br JOIN request_statuses rs ON rs.key = br.status
         ${whereSql}`,
      params,
    );
    const rows = await query(
      `${REQUEST_SELECT} ${whereSql}
       ORDER BY (rs.category = 'new') DESC, br.start_date ASC, br.id DESC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    res.json({ data: rows, total, page, pageSize });
  }),
);

requestsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await getRequest(parseId(req.params.id));
    if (!row) throw new HttpError(404, 'Request not found.');
    res.json(row);
  }),
);

requestsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = adminRequestSchema.parse(req.body);
    const id = await createRequest(input, { activeOnly: false });
    res.status(201).json(await getRequest(id));
  }),
);

requestsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const input = adminRequestSchema.parse(req.body);
    await updateRequest(id, input);
    res.json(await getRequest(id));
  }),
);

requestsRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { status, admin_notes } = statusSchema.parse(req.body);
    await setRequestStatus(id, status, admin_notes);
    res.json(await getRequest(id));
  }),
);

requestsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const rows = await query('DELETE FROM booking_requests WHERE id = $1 RETURNING id', [
      parseId(req.params.id),
    ]);
    if (!rows.length) throw new HttpError(404, 'Request not found.');
    res.json({ ok: true });
  }),
);
