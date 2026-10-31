import { Router } from 'express';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db';
import { stageDeleteError, stageOrderError, wonStageError, type Pipeline } from '../domain/crm';
import { asyncHandler, HttpError, parseId } from '../http';
import { stageInputSchema, stageOrderSchema } from '../schemas';
import { inquiryIdsInStage, moveInquiryToStage } from '../services/inquiries';

export const pipelineStagesRouter = Router();

const COLUMNS = 'id, pipeline, label, bg, text_color, sort_order, outcome, reserves_inventory';

export async function ensureCrmSchema() {
  const [{ exists }] = await query<{ exists: boolean }>(
    "SELECT to_regclass('pipeline_stages') IS NOT NULL AS exists",
  );
  if (!exists) {
    throw new Error(
      'The pipeline_stages table is missing. Run database/init/04_crm.sql against this database first.',
    );
  }
}

async function listStages(pipeline?: string) {
  const params: unknown[] = [];
  let where = '';
  if (pipeline) {
    params.push(pipeline);
    where = 'WHERE s.pipeline = $1';
  }
  return query(
    `SELECT ${COLUMNS},
            (SELECT COUNT(*)::int FROM inquiries i WHERE i.stage_id = s.id) AS usage_count
       FROM pipeline_stages s
       ${where}
      ORDER BY s.pipeline, s.sort_order, s.id`,
    params,
  );
}

async function assertLabel(client: PoolClient, pipeline: string, label: string, excludeId = 0) {
  const { rows } = await client.query(
    'SELECT id FROM pipeline_stages WHERE pipeline = $1 AND lower(label) = lower($2) AND id <> $3',
    [pipeline, label, excludeId],
  );
  if (rows.length) throw new HttpError(400, 'A stage with this name already exists.');
}

async function assertOneWon(client: PoolClient, pipeline: string) {
  const { rows } = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM pipeline_stages WHERE pipeline = $1 AND outcome = 'won'`,
    [pipeline],
  );
  const message = wonStageError(rows[0].n);
  if (message) throw new HttpError(400, message);
}

pipelineStagesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pipeline = typeof req.query.pipeline === 'string' ? req.query.pipeline : '';
    res.json(await listStages(pipeline || undefined));
  }),
);

pipelineStagesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = stageInputSchema.parse(req.body);
    const id = await withTransaction(async (client) => {
      await assertLabel(client, input.pipeline, input.label);
      if (input.outcome === 'won') {
        await client.query(
          `UPDATE pipeline_stages SET outcome = 'open', reserves_inventory = FALSE
            WHERE pipeline = $1 AND outcome = 'won'`,
          [input.pipeline],
        );
      }
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO pipeline_stages (pipeline, label, bg, text_color, sort_order, outcome, reserves_inventory)
         VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM pipeline_stages WHERE pipeline = $1), $5, $6)
         RETURNING id`,
        [input.pipeline, input.label, input.bg, input.text_color, input.outcome, input.outcome === 'won'],
      );
      await assertOneWon(client, input.pipeline);
      return rows[0].id;
    });
    const stages = await listStages(input.pipeline);
    res.status(201).json(stages.find((stage) => stage.id === id));
  }),
);

pipelineStagesRouter.put(
  '/order',
  asyncHandler(async (req, res) => {
    const { pipeline, ids } = stageOrderSchema.parse(req.body);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        'SELECT id FROM pipeline_stages WHERE pipeline = $1 ORDER BY sort_order, id',
        [pipeline],
      );
      const message = stageOrderError(
        rows.map((row) => row.id),
        ids,
      );
      if (message) throw new HttpError(400, message);
      await client.query(
        `UPDATE pipeline_stages s SET sort_order = o.ord
           FROM UNNEST($1::int[]) WITH ORDINALITY AS o(id, ord)
          WHERE s.id = o.id AND s.pipeline = $2`,
        [ids, pipeline],
      );
    });
    res.json(await listStages(pipeline));
  }),
);

pipelineStagesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const input = stageInputSchema.parse(req.body);
    await withTransaction(async (client) => {
      const { rows: found } = await client.query<{ pipeline: Pipeline }>(
        'SELECT pipeline FROM pipeline_stages WHERE id = $1',
        [id],
      );
      if (!found.length) throw new HttpError(404, 'Stage not found.');
      if (found[0].pipeline !== input.pipeline) throw new HttpError(400, 'A stage cannot change pipeline.');
      await assertLabel(client, input.pipeline, input.label, id);
      if (input.outcome === 'won') {
        await client.query(
          `UPDATE pipeline_stages SET outcome = 'open', reserves_inventory = FALSE
            WHERE pipeline = $1 AND outcome = 'won' AND id <> $2`,
          [input.pipeline, id],
        );
      }
      const { rowCount } = await client.query(
        `UPDATE pipeline_stages
            SET label = $2, bg = $3, text_color = $4, outcome = $5, reserves_inventory = $6
          WHERE id = $1`,
        [id, input.label, input.bg, input.text_color, input.outcome, input.outcome === 'won'],
      );
      if (!rowCount) throw new HttpError(404, 'Stage not found.');
      await assertOneWon(client, input.pipeline);
    });
    res.json((await listStages(input.pipeline)).find((stage) => stage.id === id));
  }),
);

pipelineStagesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const moveTo =
      typeof req.query.moveTo === 'string' && req.query.moveTo ? parseId(req.query.moveTo) : null;
    const moved = await withTransaction(async (client) => {
      const { rows } = await client.query<{ pipeline: Pipeline; outcome: 'open' | 'won' | 'lost' }>(
        'SELECT pipeline, outcome FROM pipeline_stages WHERE id = $1',
        [id],
      );
      if (!rows.length) throw new HttpError(404, 'Stage not found.');
      const stage = rows[0];
      const ids = await inquiryIdsInStage(client, id);
      let targetOk = false;
      if (moveTo) {
        const { rows: target } = await client.query<{ pipeline: Pipeline }>(
          'SELECT pipeline FROM pipeline_stages WHERE id = $1',
          [moveTo],
        );
        targetOk = target.length > 0 && target[0].pipeline === stage.pipeline && moveTo !== id;
      }
      const message = stageDeleteError({
        outcome: stage.outcome,
        usage: ids.length,
        moveTo,
        moveToExists: targetOk,
      });
      if (message) throw new HttpError(400, message);
      for (const inquiryId of ids) {
        await moveInquiryToStage(client, inquiryId, moveTo!, req.admin!.id, null);
      }
      await client.query('DELETE FROM pipeline_stages WHERE id = $1', [id]);
      await assertOneWon(client, stage.pipeline);
      return ids.length;
    });
    res.json({ ok: true, moved });
  }),
);
