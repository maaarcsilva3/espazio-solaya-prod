import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db';
import {
  LEAD_SOURCES,
  quoteTotal,
  reservationWindow,
  sameIds,
  sameMoney,
  type LeadSource,
  type Pipeline,
  type VisitStatus,
} from '../domain/crm';
import { HttpError } from '../http';
import { assertOfferingAvailable } from './availability';

export interface InquiryInput {
  pipeline: Pipeline;
  stage_id?: number;
  customer_name: string;
  phone: string | null;
  email: string;
  lead_source: LeadSource;
  lead_source_detail: string | null;
  offering_id: number | null;
  event_type: string | null;
  guests: number | null;
  start_at: string | null;
  end_at: string | null;
  special_requests: string | null;
  additional_services: string | null;
  custom_arrangements: string | null;
  internal_notes: string | null;
  package_price: number;
  additional_charges: number;
  discounts: number;
  other_fees: number;
  final_agreed_price: number | null;
  deposit_amount: number | null;
  deposit_note: string | null;
  agent_ids: number[];
}

export interface VisitInput {
  scheduled_at: string;
  status: VisitStatus;
  notes: string | null;
  outcome: string | null;
}

export interface InquiryFilters {
  pipeline: Pipeline;
  search?: string;
  stageId?: number;
  agentId?: number;
  offeringId?: number;
  leadSource?: LeadSource;
  from?: string;
  to?: string;
  sort?: 'created_at' | 'start_at' | 'days_in_stage' | 'customer_name';
}

interface StageRow {
  id: number;
  pipeline: Pipeline;
  label: string;
  outcome: 'open' | 'won' | 'lost';
  reserves_inventory: boolean;
}

interface LockedInquiry {
  id: number;
  pipeline: Pipeline;
  stage_id: number;
  stage_label: string;
  customer_name: string;
  phone: string | null;
  email: string;
  lead_source: string;
  lead_source_detail: string | null;
  offering_id: number | null;
  offering_name: string | null;
  event_type: string | null;
  guests: number | null;
  start_at: string | null;
  end_at: string | null;
  special_requests: string | null;
  additional_services: string | null;
  custom_arrangements: string | null;
  internal_notes: string | null;
  package_price: number;
  additional_charges: number;
  discounts: number;
  other_fees: number;
  final_agreed_price: number | null;
  deposit_amount: number | null;
  deposit_note: string | null;
}

const SORT_SQL: Record<NonNullable<InquiryFilters['sort']>, string> = {
  created_at: 'i.created_at DESC, i.id DESC',
  start_at: 'i.start_at ASC NULLS LAST, i.id DESC',
  days_in_stage: 'i.stage_entered_at ASC, i.id ASC',
  customer_name: 'lower(i.customer_name) ASC, i.id DESC',
};

export const INQUIRY_SELECT = `
  SELECT i.id, i.pipeline, i.stage_id,
         s.label AS stage_label, s.bg AS stage_bg, s.text_color AS stage_text_color,
         s.outcome AS stage_outcome, s.reserves_inventory,
         i.customer_name, i.phone, i.email, i.lead_source, i.lead_source_detail,
         i.offering_id, o.name AS offering_name, o.type AS offering_type,
         i.event_type, i.guests,
         to_char(i.start_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_at,
         to_char(i.end_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS end_at,
         i.special_requests, i.additional_services, i.custom_arrangements, i.internal_notes,
         i.package_price, i.additional_charges, i.discounts, i.other_fees,
         (i.package_price + i.additional_charges + i.other_fees - i.discounts) AS total_quoted,
         i.final_agreed_price, i.deposit_amount, i.deposit_note,
         to_char(i.converted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS converted_at,
         to_char(i.stage_entered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS stage_entered_at,
         to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
         to_char(i.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
         EXTRACT(EPOCH FROM (NOW() - i.stage_entered_at))::int AS seconds_in_stage,
         EXTRACT(EPOCH FROM (NOW() - i.created_at))::int AS seconds_since_created,
         i.created_by, cb.name AS created_by_name,
         COALESCE(
           (SELECT json_agg(json_build_object('id', a.id, 'name', a.name) ORDER BY a.name)
              FROM inquiry_agents ia
              JOIN agents a ON a.id = ia.agent_id
             WHERE ia.inquiry_id = i.id),
           '[]'::json
         ) AS agents
    FROM inquiries i
    JOIN pipeline_stages s ON s.id = i.stage_id
    LEFT JOIN offerings o ON o.id = i.offering_id
    LEFT JOIN admins cb ON cb.id = i.created_by`;

function shape<T extends { agents: unknown }>(row: T) {
  const agents = typeof row.agents === 'string' ? JSON.parse(row.agents) : row.agents;
  return { ...row, agents: agents ?? [], booking_request_id: null as number | null };
}

async function relations(id: number) {
  const [activities, visits, priceEvents, stageEvents] = await Promise.all([
    query(
      `SELECT act.id, act.kind, act.summary,
              to_char(act.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
              act.admin_id, ad.name AS admin_name
         FROM inquiry_activities act
         LEFT JOIN admins ad ON ad.id = act.admin_id
        WHERE act.inquiry_id = $1
        ORDER BY act.created_at DESC, act.id DESC`,
      [id],
    ),
    query(
      `SELECT id, to_char(scheduled_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS scheduled_at,
              status, notes, outcome, created_by,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
         FROM site_visits WHERE inquiry_id = $1
        ORDER BY scheduled_at DESC, id DESC`,
      [id],
    ),
    query(
      `SELECT id, package_price, additional_charges, discounts, other_fees, total_quoted, final_agreed_price,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, admin_id
         FROM inquiry_price_events WHERE inquiry_id = $1
        ORDER BY created_at DESC, id DESC`,
      [id],
    ),
    query(
      `SELECT e.id, e.stage_id, e.stage_label,
              to_char(e.entered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS entered_at,
              e.admin_id, ad.name AS admin_name
         FROM inquiry_stage_events e
         LEFT JOIN admins ad ON ad.id = e.admin_id
        WHERE e.inquiry_id = $1
        ORDER BY e.entered_at ASC, e.id ASC`,
      [id],
    ),
  ]);
  return { activities, visits, price_events: priceEvents, stage_events: stageEvents };
}

export async function getInquiry(id: number) {
  const [row] = await query(`${INQUIRY_SELECT} WHERE i.id = $1`, [id]);
  if (!row) return null;
  return { ...shape(row), ...(await relations(id)) };
}

export async function listInquiries(filters: InquiryFilters) {
  const params: unknown[] = [filters.pipeline];
  const where = ['i.pipeline = $1'];
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(i.customer_name ILIKE ${p} OR i.email ILIKE ${p} OR COALESCE(i.phone, '') ILIKE ${p})`);
  }
  if (filters.stageId) {
    params.push(filters.stageId);
    where.push(`i.stage_id = $${params.length}`);
  }
  if (filters.agentId) {
    params.push(filters.agentId);
    where.push(
      `EXISTS (SELECT 1 FROM inquiry_agents ia WHERE ia.inquiry_id = i.id AND ia.agent_id = $${params.length})`,
    );
  }
  if (filters.offeringId) {
    params.push(filters.offeringId);
    where.push(`i.offering_id = $${params.length}`);
  }
  if (filters.leadSource) {
    params.push(filters.leadSource);
    where.push(`i.lead_source = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`i.end_at > $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`i.start_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  const sort = SORT_SQL[filters.sort ?? 'created_at'] ?? SORT_SQL.created_at;
  const rows = await query(`${INQUIRY_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${sort}`, params);
  const inquiries = rows.map(shape);
  const bookings = await bookedRequestsOnPipeline(filters);
  return [...inquiries, ...bookings];
}

const REQUEST_SORT_SQL: Record<NonNullable<InquiryFilters['sort']>, string> = {
  created_at: 'br.created_at DESC, br.id DESC',
  start_at: 'br.start_date ASC, br.id DESC',
  days_in_stage: 'br.updated_at ASC, br.id ASC',
  customer_name: 'lower(br.full_name) ASC, br.id DESC',
};

/** Booked requests already hold inventory. Show them on the confirmed stage without creating a second inquiry. */
async function bookedRequestsOnPipeline(filters: InquiryFilters) {
  if (filters.agentId) return [];
  const [stage] = await query<{
    id: number;
    label: string;
    bg: string;
    text_color: string;
    outcome: 'won';
    reserves_inventory: boolean;
  }>(
    `SELECT id, label, bg, text_color, outcome, reserves_inventory
       FROM pipeline_stages
      WHERE pipeline = $1 AND outcome = 'won'
      ORDER BY sort_order, id
      LIMIT 1`,
    [filters.pipeline],
  );
  if (!stage) return [];
  if (filters.stageId && filters.stageId !== stage.id) return [];

  const offeringTypes =
    filters.pipeline === 'event_venue' ? ['event_place_only', 'event_place_with_rooms'] : ['room_only'];
  const params: unknown[] = [offeringTypes];
  const where = [`rs.category = 'booked'`, `o.type::text = ANY($1::text[])`];
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(br.full_name ILIKE ${p} OR br.email ILIKE ${p} OR COALESCE(br.phone, '') ILIKE ${p})`);
  }
  if (filters.offeringId) {
    params.push(filters.offeringId);
    where.push(`br.offering_id = $${params.length}`);
  }
  if (filters.leadSource) {
    params.push(filters.leadSource);
    where.push(
      `(CASE WHEN br.source = ANY($${params.length + 1}::text[]) THEN br.source ELSE 'other' END) = $${params.length}`,
    );
    params.push([...LEAD_SOURCES]);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`br.end_date >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`br.start_date <= $${params.length}::date`);
  }
  const sort = REQUEST_SORT_SQL[filters.sort ?? 'created_at'] ?? REQUEST_SORT_SQL.created_at;
  const rows = await query<{
    id: number;
    full_name: string;
    phone: string | null;
    email: string;
    source: string;
    offering_id: number;
    offering_name: string;
    offering_type: string;
    event_type: string | null;
    guests: number | null;
    start_date: string;
    end_date: string;
    message: string | null;
    admin_notes: string | null;
    created_at: string;
    updated_at: string;
    seconds_in_stage: number;
    seconds_since_created: number;
  }>(
    `SELECT br.id, br.full_name, br.phone, br.email, br.source,
            br.offering_id, o.name AS offering_name, o.type::text AS offering_type,
            br.event_type, br.guests,
            to_char(br.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(br.end_date, 'YYYY-MM-DD') AS end_date,
            br.message, br.admin_notes,
            to_char(br.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
            to_char(br.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
            EXTRACT(EPOCH FROM (NOW() - br.updated_at))::int AS seconds_in_stage,
            EXTRACT(EPOCH FROM (NOW() - br.created_at))::int AS seconds_since_created
       FROM booking_requests br
       JOIN request_statuses rs ON rs.key = br.status
       JOIN offerings o ON o.id = br.offering_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sort}`,
    params,
  );

  return rows.map((row) => {
    const known = (LEAD_SOURCES as readonly string[]).includes(row.source);
    return {
      id: -row.id,
      booking_request_id: row.id,
      pipeline: filters.pipeline,
      stage_id: stage.id,
      stage_label: stage.label,
      stage_bg: stage.bg,
      stage_text_color: stage.text_color,
      stage_outcome: stage.outcome,
      reserves_inventory: false,
      customer_name: row.full_name,
      phone: row.phone,
      email: row.email,
      lead_source: (known ? row.source : 'other') as LeadSource,
      lead_source_detail: known ? null : row.source,
      offering_id: row.offering_id,
      offering_name: row.offering_name,
      offering_type: row.offering_type,
      event_type: row.event_type,
      guests: row.guests,
      start_at: `${row.start_date}T00:00:00`,
      end_at: `${row.end_date}T00:00:00`,
      special_requests: row.message,
      additional_services: null,
      custom_arrangements: null,
      internal_notes: row.admin_notes,
      package_price: 0,
      additional_charges: 0,
      discounts: 0,
      other_fees: 0,
      total_quoted: 0,
      final_agreed_price: null,
      deposit_amount: null,
      deposit_note: null,
      converted_at: row.updated_at,
      stage_entered_at: row.updated_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      seconds_in_stage: row.seconds_in_stage,
      seconds_since_created: row.seconds_since_created,
      created_by: null,
      created_by_name: null,
      agents: [],
    };
  });
}

async function lockInquiry(client: PoolClient, id: number): Promise<LockedInquiry | null> {
  const { rows } = await client.query<LockedInquiry>(
    `SELECT i.id, i.pipeline, i.stage_id, s.label AS stage_label,
            i.customer_name, i.phone, i.email, i.lead_source, i.lead_source_detail,
            i.offering_id, o.name AS offering_name, i.event_type, i.guests,
            to_char(i.start_at, 'YYYY-MM-DD HH24:MI:SS') AS start_at,
            to_char(i.end_at, 'YYYY-MM-DD HH24:MI:SS') AS end_at,
            i.special_requests, i.additional_services, i.custom_arrangements, i.internal_notes,
            i.package_price, i.additional_charges, i.discounts, i.other_fees,
            i.final_agreed_price, i.deposit_amount, i.deposit_note
       FROM inquiries i
       JOIN pipeline_stages s ON s.id = i.stage_id
       LEFT JOIN offerings o ON o.id = i.offering_id
      WHERE i.id = $1
      FOR UPDATE OF i`,
    [id],
  );
  return rows[0] ?? null;
}

async function assertFresh(client: PoolClient, id: number, updatedAt: string) {
  const { rows } = await client.query<{ fresh: boolean }>(
    `SELECT date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz) AS fresh
       FROM inquiries WHERE id = $1`,
    [id, updatedAt],
  );
  if (!rows[0]?.fresh) {
    throw new HttpError(409, 'This inquiry was updated somewhere else. Refresh and try again.');
  }
}

async function agentIdsOf(client: PoolClient, inquiryId: number) {
  const { rows } = await client.query<{ agent_id: number }>(
    'SELECT agent_id FROM inquiry_agents WHERE inquiry_id = $1',
    [inquiryId],
  );
  return rows.map((row) => row.agent_id);
}

async function assertAgents(client: PoolClient, ids: number[]) {
  if (!ids.length) return;
  const { rows } = await client.query<{ id: number }>('SELECT id FROM agents WHERE id = ANY($1::int[])', [ids]);
  if (rows.length !== ids.length) throw new HttpError(400, 'One or more agents do not exist.');
}

async function agentNames(client: PoolClient, ids: number[]) {
  if (!ids.length) return [];
  const { rows } = await client.query<{ name: string }>(
    'SELECT name FROM agents WHERE id = ANY($1::int[]) ORDER BY name',
    [ids],
  );
  return rows.map((row) => row.name);
}

async function loadOffering(client: PoolClient, id: number | null) {
  if (id == null) return null;
  const { rows } = await client.query<{ id: number; name: string; type: string }>(
    'SELECT id, name, type FROM offerings WHERE id = $1',
    [id],
  );
  if (!rows.length) throw new HttpError(400, 'Selected package is not available.');
  return rows[0];
}

function assertOfferingType(pipeline: Pipeline, offering: { type: string } | null) {
  if (!offering) return;
  if (offering.type === 'amenity') throw new HttpError(400, 'Amenities cannot be the main package.');
  if (pipeline === 'room_booking' && offering.type !== 'room_only') {
    throw new HttpError(400, 'Room bookings must use a room package.');
  }
  if (pipeline === 'event_venue' && offering.type === 'room_only') {
    throw new HttpError(400, 'Event venue inquiries must use an event hall package.');
  }
}

async function getStage(client: PoolClient, id: number): Promise<StageRow | null> {
  const { rows } = await client.query<StageRow>(
    `SELECT id, pipeline, label, outcome, reserves_inventory FROM pipeline_stages WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function defaultStage(client: PoolClient, pipeline: Pipeline): Promise<StageRow> {
  const { rows } = await client.query<StageRow>(
    `SELECT id, pipeline, label, outcome, reserves_inventory
       FROM pipeline_stages
      WHERE pipeline = $1
      ORDER BY (outcome = 'open') DESC, sort_order, id
      LIMIT 1`,
    [pipeline],
  );
  if (!rows.length) throw new HttpError(500, 'This pipeline has no stages.');
  return rows[0];
}

async function logActivity(client: PoolClient, inquiryId: number, adminId: number | null, kind: string, summary: string) {
  await client.query(
    'INSERT INTO inquiry_activities (inquiry_id, admin_id, kind, summary) VALUES ($1, $2, $3, $4)',
    [inquiryId, adminId, kind, summary],
  );
}

async function logStage(client: PoolClient, inquiryId: number, stage: StageRow, adminId: number | null) {
  await client.query(
    'INSERT INTO inquiry_stage_events (inquiry_id, stage_id, stage_label, admin_id) VALUES ($1, $2, $3, $4)',
    [inquiryId, stage.id, stage.label, adminId],
  );
}

async function logPrice(
  client: PoolClient,
  inquiryId: number,
  adminId: number | null,
  input: InquiryInput,
  total: number,
) {
  await client.query(
    `INSERT INTO inquiry_price_events
       (inquiry_id, admin_id, package_price, additional_charges, discounts, other_fees, total_quoted, final_agreed_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      inquiryId,
      adminId,
      input.package_price,
      input.additional_charges,
      input.discounts,
      input.other_fees,
      total,
      input.final_agreed_price,
    ],
  );
}

async function saveAgents(client: PoolClient, inquiryId: number, ids: number[]) {
  await client.query('DELETE FROM inquiry_agents WHERE inquiry_id = $1', [inquiryId]);
  if (ids.length) {
    await client.query('INSERT INTO inquiry_agents (inquiry_id, agent_id) SELECT $1, UNNEST($2::int[])', [
      inquiryId,
      ids,
    ]);
  }
}

function priceChanged(current: LockedInquiry, input: InquiryInput) {
  return (
    !sameMoney(current.package_price, input.package_price) ||
    !sameMoney(current.additional_charges, input.additional_charges) ||
    !sameMoney(current.discounts, input.discounts) ||
    !sameMoney(current.other_fees, input.other_fees) ||
    !sameMoney(current.final_agreed_price, input.final_agreed_price) ||
    !sameMoney(current.deposit_amount, input.deposit_amount) ||
    (current.deposit_note ?? null) !== input.deposit_note
  );
}

async function holdIfNeeded(
  client: PoolClient,
  stage: StageRow,
  offeringId: number | null,
  window: { start: string; end: string } | null,
  excludeInquiryId: number | null,
) {
  if (!stage.reserves_inventory) return;
  if (!offeringId) throw new HttpError(400, 'Choose a package before confirming this inquiry.');
  if (!window) throw new HttpError(400, 'Set the dates before confirming this inquiry.');
  await assertOfferingAvailable(client, { offeringId, window, excludeInquiryId });
}

export async function createInquiry(input: InquiryInput, adminId: number) {
  return withTransaction(async (client) => {
    const quote = quoteTotal(input);
    if (!quote.ok) throw new HttpError(400, quote.message);
    const stay = reservationWindow(input.start_at, input.end_at);
    if (!stay.ok) throw new HttpError(400, stay.message);
    const stage = input.stage_id ? await getStage(client, input.stage_id) : await defaultStage(client, input.pipeline);
    if (!stage || stage.pipeline !== input.pipeline) {
      throw new HttpError(400, 'That stage is not in this pipeline.');
    }
    const agentIds = [...new Set(input.agent_ids)];
    await assertAgents(client, agentIds);
    const offering = await loadOffering(client, input.offering_id);
    assertOfferingType(input.pipeline, offering);
    await holdIfNeeded(client, stage, offering?.id ?? null, stay.window, null);
    const won = stage.outcome === 'won';
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO inquiries (
         pipeline, stage_id, customer_name, phone, email, lead_source, lead_source_detail,
         offering_id, event_type, guests, start_at, end_at, special_requests, additional_services,
         custom_arrangements, internal_notes, package_price, additional_charges, discounts, other_fees,
         final_agreed_price, deposit_amount, deposit_note, converted_at, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20,
         $21, $22, $23, CASE WHEN $24::boolean THEN NOW() ELSE NULL END, $25
       ) RETURNING id`,
      [
        input.pipeline,
        stage.id,
        input.customer_name,
        input.phone,
        input.email,
        input.lead_source,
        input.lead_source_detail,
        offering?.id ?? null,
        input.event_type,
        input.guests,
        stay.window?.start ?? null,
        stay.window?.end ?? null,
        input.special_requests,
        input.additional_services,
        input.custom_arrangements,
        input.internal_notes,
        input.package_price,
        input.additional_charges,
        input.discounts,
        input.other_fees,
        input.final_agreed_price,
        input.deposit_amount,
        input.deposit_note,
        won,
        adminId,
      ],
    );
    const id = rows[0].id;
    await saveAgents(client, id, agentIds);
    await logStage(client, id, stage, adminId);
    await logPrice(client, id, adminId, input, quote.total);
    await logActivity(client, id, adminId, 'created', 'Inquiry created');
    if (agentIds.length) {
      const names = await agentNames(client, agentIds);
      await logActivity(client, id, adminId, 'agents_changed', `Assigned to ${names.join(', ')}`);
    }
    return id;
  });
}

export async function updateInquiry(id: number, input: InquiryInput, updatedAt: string, adminId: number) {
  await withTransaction(async (client) => {
    const current = await lockInquiry(client, id);
    if (!current) throw new HttpError(404, 'Inquiry not found.');
    await assertFresh(client, id, updatedAt);
    if (input.pipeline !== current.pipeline) throw new HttpError(400, 'An inquiry cannot change pipeline.');
    const quote = quoteTotal(input);
    if (!quote.ok) throw new HttpError(400, quote.message);
    const stay = reservationWindow(input.start_at, input.end_at);
    if (!stay.ok) throw new HttpError(400, stay.message);
    const stage = input.stage_id ? await getStage(client, input.stage_id) : await getStage(client, current.stage_id);
    if (!stage || stage.pipeline !== current.pipeline) {
      throw new HttpError(400, 'That stage is not in this pipeline.');
    }
    const agentIds = [...new Set(input.agent_ids)];
    await assertAgents(client, agentIds);
    const offering = await loadOffering(client, input.offering_id);
    assertOfferingType(input.pipeline, offering);
    await holdIfNeeded(client, stage, offering?.id ?? null, stay.window, id);

    const wonMove = stage.outcome === 'won' && stage.id !== current.stage_id;
    await client.query(
      `UPDATE inquiries SET
         stage_id = $2, customer_name = $3, phone = $4, email = $5, lead_source = $6, lead_source_detail = $7,
         offering_id = $8, event_type = $9, guests = $10, start_at = $11, end_at = $12,
         special_requests = $13, additional_services = $14, custom_arrangements = $15, internal_notes = $16,
         package_price = $17, additional_charges = $18, discounts = $19, other_fees = $20,
         final_agreed_price = $21, deposit_amount = $22, deposit_note = $23,
         stage_entered_at = CASE WHEN stage_id IS DISTINCT FROM $2 THEN NOW() ELSE stage_entered_at END,
         converted_at = CASE
           WHEN converted_at IS NULL AND $24::boolean THEN NOW()
           ELSE converted_at
         END
       WHERE id = $1`,
      [
        id,
        stage.id,
        input.customer_name,
        input.phone,
        input.email,
        input.lead_source,
        input.lead_source_detail,
        offering?.id ?? null,
        input.event_type,
        input.guests,
        stay.window?.start ?? null,
        stay.window?.end ?? null,
        input.special_requests,
        input.additional_services,
        input.custom_arrangements,
        input.internal_notes,
        input.package_price,
        input.additional_charges,
        input.discounts,
        input.other_fees,
        input.final_agreed_price,
        input.deposit_amount,
        input.deposit_note,
        wonMove,
      ],
    );

    const previousAgents = await agentIdsOf(client, id);
    await saveAgents(client, id, agentIds);

    if (stage.id !== current.stage_id) {
      await logStage(client, id, stage, adminId);
      await logActivity(client, id, adminId, 'stage_changed', `Moved from ${current.stage_label} to ${stage.label}`);
    }
    if (!sameIds(previousAgents, agentIds)) {
      const names = await agentNames(client, agentIds);
      await logActivity(
        client,
        id,
        adminId,
        'agents_changed',
        names.length ? `Assigned to ${names.join(', ')}` : 'Agents cleared',
      );
    }
    if (current.offering_id !== (offering?.id ?? null)) {
      const nextName = offering?.name ?? null;
      const summary =
        current.offering_name && nextName
          ? `Package changed from ${current.offering_name} to ${nextName}`
          : nextName
            ? `Package set to ${nextName}`
            : 'Package cleared';
      await logActivity(client, id, adminId, 'package_changed', summary);
    }
    if (priceChanged(current, input)) {
      await logPrice(client, id, adminId, input, quote.total);
      await logActivity(
        client,
        id,
        adminId,
        'price_changed',
        `Quote changed to ${quote.total.toLocaleString('en-US')}`,
      );
    }
    if ((current.internal_notes ?? null) !== input.internal_notes) {
      await logActivity(client, id, adminId, 'note', 'Updated internal notes');
    }
    const bits: string[] = [];
    if (current.customer_name !== input.customer_name) bits.push('name');
    if ((current.phone ?? null) !== input.phone) bits.push('phone');
    if (current.email !== input.email) bits.push('email');
    if (current.lead_source !== input.lead_source || (current.lead_source_detail ?? null) !== input.lead_source_detail) {
      bits.push('lead source');
    }
    if ((current.event_type ?? null) !== input.event_type) bits.push('event type');
    if ((current.guests ?? null) !== input.guests) bits.push('guest count');
    if ((current.start_at ?? null) !== (stay.window?.start ?? null) || (current.end_at ?? null) !== (stay.window?.end ?? null)) {
      bits.push('dates');
    }
    if ((current.special_requests ?? null) !== input.special_requests) bits.push('special requests');
    if ((current.additional_services ?? null) !== input.additional_services) bits.push('additional services');
    if ((current.custom_arrangements ?? null) !== input.custom_arrangements) bits.push('arrangements');
    if (bits.length) await logActivity(client, id, adminId, 'updated', `Updated ${bits.join(', ')}`);
  });
}

/** `updatedAt` is required for a drag-and-drop move and omitted when a stage delete reassigns rows. */
export async function moveInquiryToStage(
  client: PoolClient,
  inquiryId: number,
  stageId: number,
  adminId: number | null,
  updatedAt: string | null,
) {
  const current = await lockInquiry(client, inquiryId);
  if (!current) throw new HttpError(404, 'Inquiry not found.');
  if (updatedAt) await assertFresh(client, inquiryId, updatedAt);
  const stage = await getStage(client, stageId);
  if (!stage || stage.pipeline !== current.pipeline) {
    throw new HttpError(400, 'That stage is not in this pipeline.');
  }
  if (stage.id === current.stage_id) return;

  const stay = reservationWindow(current.start_at, current.end_at);
  if (!stay.ok) throw new HttpError(400, stay.message);
  await holdIfNeeded(client, stage, current.offering_id, stay.window, inquiryId);
  await client.query(
    `UPDATE inquiries SET
       stage_id = $2,
       start_at = $3,
       end_at = $4,
       stage_entered_at = NOW(),
       converted_at = CASE WHEN converted_at IS NULL AND $5::boolean THEN NOW() ELSE converted_at END
     WHERE id = $1`,
    [inquiryId, stage.id, stay.window?.start ?? current.start_at, stay.window?.end ?? current.end_at, stage.outcome === 'won'],
  );
  await logStage(client, inquiryId, stage, adminId);
  await logActivity(client, inquiryId, adminId, 'stage_changed', `Moved from ${current.stage_label} to ${stage.label}`);
}

export async function changeInquiryStage(id: number, stageId: number, updatedAt: string, adminId: number) {
  await withTransaction(async (client) => {
    await moveInquiryToStage(client, id, stageId, adminId, updatedAt);
  });
}

export async function inquiryIdsInStage(client: PoolClient, stageId: number) {
  const { rows } = await client.query<{ id: number }>(
    'SELECT id FROM inquiries WHERE stage_id = $1 ORDER BY id',
    [stageId],
  );
  return rows.map((row) => row.id);
}

export async function deleteInquiry(id: number) {
  const rows = await query('DELETE FROM inquiries WHERE id = $1 RETURNING id', [id]);
  if (!rows.length) throw new HttpError(404, 'Inquiry not found.');
}

async function requireEventInquiry(client: PoolClient, inquiryId: number) {
  const current = await lockInquiry(client, inquiryId);
  if (!current) throw new HttpError(404, 'Inquiry not found.');
  if (current.pipeline !== 'event_venue') {
    throw new HttpError(400, 'Site visits are only for event venue inquiries.');
  }
  return current;
}

export async function createVisit(inquiryId: number, input: VisitInput, adminId: number) {
  return withTransaction(async (client) => {
    await requireEventInquiry(client, inquiryId);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO site_visits (inquiry_id, scheduled_at, status, notes, outcome, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [inquiryId, input.scheduled_at, input.status, input.notes, input.outcome, adminId],
    );
    await client.query('UPDATE inquiries SET customer_name = customer_name WHERE id = $1', [inquiryId]);
    await logActivity(client, inquiryId, adminId, 'site_visit', `Scheduled a site visit (${input.status})`);
    return rows[0].id;
  });
}

export async function updateVisit(inquiryId: number, visitId: number, input: VisitInput, adminId: number) {
  await withTransaction(async (client) => {
    await requireEventInquiry(client, inquiryId);
    const { rowCount } = await client.query(
      `UPDATE site_visits SET scheduled_at = $3, status = $4, notes = $5, outcome = $6
        WHERE id = $2 AND inquiry_id = $1`,
      [inquiryId, visitId, input.scheduled_at, input.status, input.notes, input.outcome],
    );
    if (!rowCount) throw new HttpError(404, 'Site visit not found.');
    await client.query('UPDATE inquiries SET customer_name = customer_name WHERE id = $1', [inquiryId]);
    await logActivity(client, inquiryId, adminId, 'site_visit', `Updated a site visit (${input.status})`);
  });
}

export async function deleteVisit(inquiryId: number, visitId: number, adminId: number) {
  await withTransaction(async (client) => {
    await requireEventInquiry(client, inquiryId);
    const { rowCount } = await client.query('DELETE FROM site_visits WHERE id = $2 AND inquiry_id = $1', [
      inquiryId,
      visitId,
    ]);
    if (!rowCount) throw new HttpError(404, 'Site visit not found.');
    await client.query('UPDATE inquiries SET customer_name = customer_name WHERE id = $1', [inquiryId]);
    await logActivity(client, inquiryId, adminId, 'site_visit', 'Removed a site visit');
  });
}
