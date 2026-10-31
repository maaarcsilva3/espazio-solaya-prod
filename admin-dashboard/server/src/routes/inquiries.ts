import { Router } from 'express';
import { LEAD_SOURCES, PIPELINES, type LeadSource, type Pipeline } from '../domain/crm';
import { asyncHandler, HttpError, parseId } from '../http';
import { inquirySchema, inquiryUpdateSchema, stageMoveSchema, visitSchema } from '../schemas';
import { getAnalytics } from '../services/analytics';
import {
  changeInquiryStage,
  createInquiry,
  createVisit,
  deleteInquiry,
  deleteVisit,
  getInquiry,
  listInquiries,
  updateInquiry,
  updateVisit,
} from '../services/inquiries';

export const inquiriesRouter = Router();

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function pipelineOf(value: unknown): Pipeline {
  if (typeof value === 'string' && (PIPELINES as readonly string[]).includes(value)) return value as Pipeline;
  throw new HttpError(400, 'Choose an event venue or room booking pipeline.');
}

inquiriesRouter.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const pipeline = typeof req.query.pipeline === 'string' && req.query.pipeline ? pipelineOf(req.query.pipeline) : null;
    if (req.query.from && !isDate(req.query.from)) throw new HttpError(400, 'Use YYYY-MM-DD for the start date.');
    if (req.query.to && !isDate(req.query.to)) throw new HttpError(400, 'Use YYYY-MM-DD for the end date.');
    res.json(
      await getAnalytics({
        pipeline,
        from: isDate(req.query.from) ? req.query.from : null,
        to: isDate(req.query.to) ? req.query.to : null,
      }),
    );
  }),
);

inquiriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pipeline = pipelineOf(req.query.pipeline);
    const sort = req.query.sort;
    const allowed = ['created_at', 'start_at', 'days_in_stage', 'customer_name'] as const;
    const lead = typeof req.query.lead_source === 'string' ? req.query.lead_source : '';
    if (lead && !(LEAD_SOURCES as readonly string[]).includes(lead)) {
      throw new HttpError(400, 'That lead source is not valid.');
    }
    if (req.query.from && !isDate(req.query.from)) throw new HttpError(400, 'Use YYYY-MM-DD for the start date.');
    if (req.query.to && !isDate(req.query.to)) throw new HttpError(400, 'Use YYYY-MM-DD for the end date.');
    res.json(
      await listInquiries({
        pipeline,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        stageId: typeof req.query.stage_id === 'string' && req.query.stage_id ? parseId(req.query.stage_id) : undefined,
        agentId: typeof req.query.agent_id === 'string' && req.query.agent_id ? parseId(req.query.agent_id) : undefined,
        offeringId:
          typeof req.query.offering_id === 'string' && req.query.offering_id ? parseId(req.query.offering_id) : undefined,
        leadSource: lead ? (lead as LeadSource) : undefined,
        from: isDate(req.query.from) ? req.query.from : undefined,
        to: isDate(req.query.to) ? req.query.to : undefined,
        sort: typeof sort === 'string' && (allowed as readonly string[]).includes(sort) ? (sort as (typeof allowed)[number]) : 'created_at',
      }),
    );
  }),
);

inquiriesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await getInquiry(parseId(req.params.id));
    if (!row) throw new HttpError(404, 'Inquiry not found.');
    res.json(row);
  }),
);

inquiriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = inquirySchema.parse(req.body);
    const id = await createInquiry(input, req.admin!.id);
    res.status(201).json(await getInquiry(id));
  }),
);

inquiriesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const input = inquiryUpdateSchema.parse(req.body);
    await updateInquiry(id, input, input.updated_at, req.admin!.id);
    res.json(await getInquiry(id));
  }),
);

inquiriesRouter.patch(
  '/:id/stage',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = stageMoveSchema.parse(req.body);
    await changeInquiryStage(id, body.stage_id, body.updated_at, req.admin!.id);
    const row = await getInquiry(id);
    if (!row) throw new HttpError(404, 'Inquiry not found.');
    res.json(row);
  }),
);

inquiriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteInquiry(parseId(req.params.id));
    res.json({ ok: true });
  }),
);

inquiriesRouter.post(
  '/:id/visits',
  asyncHandler(async (req, res) => {
    const inquiryId = parseId(req.params.id);
    const input = visitSchema.parse(req.body);
    await createVisit(inquiryId, input, req.admin!.id);
    res.status(201).json(await getInquiry(inquiryId));
  }),
);

inquiriesRouter.put(
  '/:id/visits/:visitId',
  asyncHandler(async (req, res) => {
    const inquiryId = parseId(req.params.id);
    const input = visitSchema.parse(req.body);
    await updateVisit(inquiryId, parseId(req.params.visitId), input, req.admin!.id);
    res.json(await getInquiry(inquiryId));
  }),
);

inquiriesRouter.delete(
  '/:id/visits/:visitId',
  asyncHandler(async (req, res) => {
    const inquiryId = parseId(req.params.id);
    await deleteVisit(inquiryId, parseId(req.params.visitId), req.admin!.id);
    res.json(await getInquiry(inquiryId));
  }),
);
