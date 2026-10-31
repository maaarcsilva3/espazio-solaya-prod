import { Router } from 'express';
import { query } from '../db';
import { asyncHandler, HttpError, parseId } from '../http';
import { agentSchema } from '../schemas';

export const agentsRouter = Router();

const SELECT = 'id, name, email, phone, created_at';

/** Fail fast if the agents schema was never applied. Schema changes belong in database/migrations. */
export async function ensureAgentsSchema() {
  const [{ exists }] = await query<{ exists: boolean }>(
    "SELECT to_regclass('agents') IS NOT NULL AS exists",
  );
  if (!exists) {
    throw new Error(
      'The agents table is missing. Apply database/migrations/001_agents.sql (or init/05_agents.sql on a new volume) first.',
    );
  }
}

agentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await query(`SELECT ${SELECT} FROM agents ORDER BY lower(name), id`));
  }),
);

agentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = agentSchema.parse(req.body);
    const [existing] = await query<{ id: number }>(
      'SELECT id FROM agents WHERE lower(name) = lower($1)',
      [input.name],
    );
    if (existing) throw new HttpError(409, 'An agent with this name already exists.');
    const [row] = await query(
      `INSERT INTO agents (name, email, phone) VALUES ($1, $2, $3) RETURNING ${SELECT}`,
      [input.name, input.email, input.phone],
    );
    res.status(201).json(row);
  }),
);

agentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const rows = await query('DELETE FROM agents WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) throw new HttpError(404, 'Agent not found.');
    res.json({ ok: true });
  }),
);
