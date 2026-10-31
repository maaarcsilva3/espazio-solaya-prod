import { Router } from 'express';
import type { PoolClient } from 'pg';
import { pool, query } from '../db';
import { asyncHandler, HttpError } from '../http';
import { STATUS_CATEGORIES, statusInputSchema, statusOrderSchema } from '../schemas';

export const statusesRouter = Router();

const STATUS_COLUMNS = 'key, label, bg, text_color, category, sort_order, is_default';

const CATEGORY_LABELS: Record<string, string> = { new: 'New', booked: 'Booked', closed: 'Closed' };

export async function ensureStatusesTable() {
  const [{ exists }] = await query<{ exists: boolean }>(
    "SELECT to_regclass('request_statuses') IS NOT NULL AS exists",
  );
  if (!exists) {
    throw new Error(
      'The request_statuses table is missing. Run database/init/03_custom_statuses.sql against this database first.',
    );
  }
}

/** The status given to bookings when none is chosen (e.g. website requests). */
export async function defaultStatusKey(client?: PoolClient): Promise<string> {
  const sql = `SELECT key FROM request_statuses WHERE is_default
               UNION ALL (SELECT key FROM request_statuses WHERE category = 'new' ORDER BY sort_order LIMIT 1)
               LIMIT 1`;
  const rows = client ? (await client.query(sql)).rows : await query(sql);
  if (!rows.length) throw new HttpError(500, 'No booking statuses are set up.');
  return rows[0].key;
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Every category needs at least one status, and exactly one New status must be the default. */
async function assertValidSet(client: PoolClient) {
  const { rows } = await client.query<{ category: string; n: number; defaults: number }>(
    `SELECT category, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE is_default)::int AS defaults
       FROM request_statuses GROUP BY category`,
  );
  for (const category of STATUS_CATEGORIES) {
    if (!rows.some((r) => r.category === category && r.n > 0)) {
      throw new HttpError(400, `You need at least one "${CATEGORY_LABELS[category]}" status.`);
    }
  }
  if (rows.reduce((sum, r) => sum + r.defaults, 0) !== 1) {
    throw new HttpError(400, 'Choose another status as the default for new requests first.');
  }
}

function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return slug || 'status';
}

statusesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(
      await query(
        `SELECT ${STATUS_COLUMNS},
                (SELECT COUNT(*)::int FROM booking_requests br WHERE br.status = s.key) AS usage_count
           FROM request_statuses s ORDER BY sort_order, label`,
      ),
    );
  }),
);

statusesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = statusInputSchema.parse(req.body);
    if (d.is_default && d.category !== 'new') {
      throw new HttpError(400, 'Only a "New" status can be the default for new requests.');
    }
    const row = await withTransaction(async (client) => {
      const base = slugify(d.label);
      const { rows: taken } = await client.query<{ key: string }>(
        'SELECT key FROM request_statuses WHERE key = $1 OR key LIKE $2',
        [base, `${base}_%`],
      );
      const used = new Set(taken.map((r) => r.key));
      let key = base;
      for (let i = 2; used.has(key); i++) key = `${base}_${i}`;

      if (d.is_default) await client.query('UPDATE request_statuses SET is_default = FALSE WHERE is_default');
      const { rows } = await client.query(
        `INSERT INTO request_statuses (key, label, bg, text_color, category, sort_order, is_default)
         VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM request_statuses), $6)
         RETURNING ${STATUS_COLUMNS}`,
        [key, d.label, d.bg, d.text_color, d.category, d.is_default],
      );
      await assertValidSet(client);
      return rows[0];
    });
    res.status(201).json(row);
  }),
);

statusesRouter.put(
  '/order',
  asyncHandler(async (req, res) => {
    const { keys } = statusOrderSchema.parse(req.body);
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE request_statuses s SET sort_order = o.ord
           FROM UNNEST($1::text[]) WITH ORDINALITY AS o(key, ord)
          WHERE s.key = o.key`,
        [keys],
      );
    });
    res.json({ ok: true });
  }),
);

statusesRouter.put(
  '/:key',
  asyncHandler(async (req, res) => {
    const d = statusInputSchema.parse(req.body);
    if (d.is_default && d.category !== 'new') {
      throw new HttpError(400, 'Only a "New" status can be the default for new requests.');
    }
    const row = await withTransaction(async (client) => {
      if (d.is_default) {
        await client.query('UPDATE request_statuses SET is_default = FALSE WHERE is_default AND key <> $1', [
          req.params.key,
        ]);
      }
      const { rows } = await client.query(
        `UPDATE request_statuses SET label = $2, bg = $3, text_color = $4, category = $5, is_default = $6
          WHERE key = $1 RETURNING ${STATUS_COLUMNS}`,
        [req.params.key, d.label, d.bg, d.text_color, d.category, d.is_default],
      );
      if (!rows.length) throw new HttpError(404, 'Status not found.');
      await assertValidSet(client);
      return rows[0];
    });
    res.json(row);
  }),
);

statusesRouter.delete(
  '/:key',
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    const moveTo = typeof req.query.moveTo === 'string' && req.query.moveTo ? req.query.moveTo : null;
    const moved = await withTransaction(async (client) => {
      const { rows: found } = await client.query('SELECT is_default FROM request_statuses WHERE key = $1', [key]);
      if (!found.length) throw new HttpError(404, 'Status not found.');
      if (found[0].is_default) {
        throw new HttpError(400, 'This is the default status for new requests. Make another status the default first.');
      }

      const { rows: usage } = await client.query<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM booking_requests WHERE status = $1',
        [key],
      );
      const inUse = usage[0].n;
      if (inUse > 0) {
        if (!moveTo || moveTo === key) {
          throw new HttpError(400, `${inUse} booking(s) use this status. Choose a status to move them to.`);
        }
        const { rowCount } = await client.query('SELECT 1 FROM request_statuses WHERE key = $1', [moveTo]);
        if (!rowCount) throw new HttpError(400, 'The status to move bookings to does not exist.');
        await client.query('UPDATE booking_requests SET status = $1 WHERE status = $2', [moveTo, key]);
      }

      await client.query('DELETE FROM request_statuses WHERE key = $1', [key]);
      await assertValidSet(client);
      return inUse;
    });
    res.json({ ok: true, moved });
  }),
);
