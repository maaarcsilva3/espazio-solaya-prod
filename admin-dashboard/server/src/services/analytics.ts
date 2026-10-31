import { query } from '../db';
import {
  averageStageSeconds,
  CONVERSION_DEFINITION,
  conversionCohort,
  groupedConversion,
  outcomeCounts,
  type GroupRow,
  type Pipeline,
  type StageOutcome,
  type StageSpan,
} from '../domain/crm';

export interface AnalyticsFilters {
  pipeline?: Pipeline | null;
  from?: string | null;
  to?: string | null;
}

const COHORT_SQL = `
  SELECT s.outcome,
         i.lead_source,
         i.pipeline,
         to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
         to_char(i.converted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS converted_at
    FROM inquiries i
    JOIN pipeline_stages s ON s.id = i.stage_id
   WHERE ($1::text IS NULL OR i.pipeline = $1)
     AND ($2::date IS NULL OR i.created_at >= $2::date)
     AND ($3::date IS NULL OR i.created_at < ($3::date + INTERVAL '1 day'))`;

async function cohortRows(filters: AnalyticsFilters): Promise<(GroupRow & { lead_source: string; pipeline: Pipeline })[]> {
  const rows = await query<{
    outcome: StageOutcome;
    lead_source: string;
    pipeline: Pipeline;
    created_at: string;
    converted_at: string | null;
  }>(COHORT_SQL, [filters.pipeline ?? null, filters.from ?? null, filters.to ?? null]);
  return rows.map((row) => ({ ...row, key: row.lead_source, label: row.lead_source }));
}

export async function getPipelineSummary() {
  const analytics = await getAnalytics({});
  return {
    open: analytics.summary.open,
    confirmed: analytics.summary.confirmed,
    conversion_rate: analytics.summary.conversion_rate,
  };
}

export async function getAnalytics(filters: AnalyticsFilters) {
  const rows = await cohortRows(filters);
  const counts = outcomeCounts(rows);
  const summary = conversionCohort(rows);
  const bySource = groupedConversion(rows.map((row) => ({ ...row, key: row.lead_source, label: row.lead_source })));

  const agentRows = await query<{
    key: string;
    label: string;
    outcome: StageOutcome;
    created_at: string;
    converted_at: string | null;
  }>(
    `SELECT a.id::text AS key, a.name AS label, s.outcome,
            to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
            to_char(i.converted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS converted_at
       FROM inquiries i
       JOIN pipeline_stages s ON s.id = i.stage_id
       JOIN inquiry_agents ia ON ia.inquiry_id = i.id
       JOIN agents a ON a.id = ia.agent_id
      WHERE ($1::text IS NULL OR i.pipeline = $1)
        AND ($2::date IS NULL OR i.created_at >= $2::date)
        AND ($3::date IS NULL OR i.created_at < ($3::date + INTERVAL '1 day'))`,
    [filters.pipeline ?? null, filters.from ?? null, filters.to ?? null],
  );

  const pipelineRows = await query<{
    key: string;
    label: string;
    outcome: StageOutcome;
    created_at: string;
    converted_at: string | null;
  }>(
    `SELECT i.pipeline AS key, i.pipeline AS label, s.outcome,
            to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
            to_char(i.converted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS converted_at
       FROM inquiries i
       JOIN pipeline_stages s ON s.id = i.stage_id
      WHERE ($1::date IS NULL OR i.created_at >= $1::date)
        AND ($2::date IS NULL OR i.created_at < ($2::date + INTERVAL '1 day'))`,
    [filters.from ?? null, filters.to ?? null],
  );

  const byStage = await query(
    `SELECT s.id, s.pipeline, s.label, s.outcome, s.sort_order, s.bg, s.text_color,
            COUNT(i.id)::int AS total
       FROM pipeline_stages s
       LEFT JOIN inquiries i
         ON i.stage_id = s.id
        AND ($1::text IS NULL OR i.pipeline = $1)
        AND ($2::date IS NULL OR i.created_at >= $2::date)
        AND ($3::date IS NULL OR i.created_at < ($3::date + INTERVAL '1 day'))
      WHERE ($1::text IS NULL OR s.pipeline = $1)
      GROUP BY s.id
      ORDER BY s.pipeline, s.sort_order, s.id`,
    [filters.pipeline ?? null, filters.from ?? null, filters.to ?? null],
  );

  const spanRows = await query<{
    stage_id: number | null;
    stage_label: string;
    entered_at: string;
    left_at: string | null;
  }>(
    `SELECT e.stage_id, e.stage_label,
            to_char(e.entered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS entered_at,
            to_char(
              LEAD(e.entered_at) OVER (PARTITION BY e.inquiry_id ORDER BY e.entered_at, e.id)
              AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ) AS left_at
       FROM inquiry_stage_events e
       JOIN inquiries i ON i.id = e.inquiry_id
      WHERE ($1::text IS NULL OR i.pipeline = $1)
        AND ($2::date IS NULL OR i.created_at >= $2::date)
        AND ($3::date IS NULL OR i.created_at < ($3::date + INTERVAL '1 day'))`,
    [filters.pipeline ?? null, filters.from ?? null, filters.to ?? null],
  );
  const spans: StageSpan[] = spanRows.map((row) => ({
    key: row.stage_id ? `stage-${row.stage_id}` : row.stage_label,
    label: row.stage_label,
    entered_at: row.entered_at,
    left_at: row.left_at,
  }));

  return {
    period: { from: filters.from ?? null, to: filters.to ?? null },
    definition: CONVERSION_DEFINITION,
    pipeline: filters.pipeline ?? null,
    summary: {
      total: rows.length,
      open: counts.open,
      confirmed: counts.confirmed,
      lost: counts.lost,
      ...summary,
    },
    by_stage: byStage,
    stage_time: averageStageSeconds(spans, new Date().toISOString()),
    by_agent: groupedConversion(agentRows),
    by_source: bySource,
    by_pipeline: groupedConversion(pipelineRows),
  };
}
