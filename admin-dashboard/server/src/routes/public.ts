import { Router } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { query } from '../db';
import { bookingWindow, type Pipeline } from '../domain/crm';
import { asyncHandler, HttpError } from '../http';
import { publicInquirySchema, publicRequestSchema } from '../schemas';
import { createInquiry, type InquiryInput } from '../services/inquiries';
import { createRequest } from '../services/requests';

export const publicRouter = Router();

publicRouter.use(
  cors({
    origin: (origin, cb) => {
      // Non-browser clients omit Origin (CORS does not apply). Browsers must match the allowlist.
      // Do not set CORS_ORIGIN=* in production.
      if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(null, false);
    },
    methods: ['GET', 'POST'],
  }),
);

const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true });

publicRouter.get(
  '/offerings',
  asyncHandler(async (_req, res) => {
    res.json(
      await query(
        `SELECT id, name, type, description, capacity, price, price_unit
           FROM offerings WHERE is_active = TRUE ORDER BY type, name`,
      ),
    );
  }),
);

publicRouter.post(
  '/requests',
  submitLimiter,
  asyncHandler(async (req, res) => {
    // Honeypot: real users never fill the hidden "website" field.
    if (req.body?.website) {
      return res.status(201).json({ ok: true });
    }
    const input = publicRequestSchema.parse(req.body);
    const today = new Date().toISOString().slice(0, 10);
    if (input.start_date < today) throw new HttpError(400, 'Start date cannot be in the past.');
    const id = await createRequest({ ...input, source: 'website' }, { activeOnly: true });
    res.status(201).json({ ok: true, id });
  }),
);

function pipelineFromOfferingType(type: string): Pipeline {
  if (type === 'room_only') return 'room_booking';
  if (type === 'event_place_only' || type === 'event_place_with_rooms') return 'event_venue';
  throw new HttpError(400, 'Selected package is not available.');
}

publicRouter.post(
  '/inquiries',
  submitLimiter,
  asyncHandler(async (req, res) => {
    if (req.body?.website) {
      return res.status(201).json({ ok: true });
    }

    const parsed = publicInquirySchema.parse(req.body);
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.start_date < today) throw new HttpError(400, 'Start date cannot be in the past.');

    const offerings = await query<{ id: number; name: string; type: string }>(
      `SELECT id, name, type FROM offerings WHERE id = $1 AND is_active = TRUE`,
      [parsed.offering_id],
    );
    const offering = offerings[0];
    if (!offering || offering.type === 'amenity') {
      throw new HttpError(400, 'Selected package is not available.');
    }

    const pipeline = pipelineFromOfferingType(offering.type);
    if (pipeline === 'event_venue' && !parsed.event_type) {
      throw new HttpError(400, 'Choose Corporate, Wedding, or Socials.');
    }

    const amenityIds = [...new Set(parsed.amenity_ids)];
    let amenityNames: string[] = [];
    if (amenityIds.length) {
      const amenities = await query<{ id: number; name: string }>(
        `SELECT id, name FROM offerings WHERE id = ANY($1::int[]) AND type = 'amenity' AND is_active = TRUE`,
        [amenityIds],
      );
      if (amenities.length !== amenityIds.length) {
        throw new HttpError(400, 'One or more selected amenities are not available.');
      }
      amenityNames = amenities.map((row) => row.name);
    }

    const messageParts: string[] = [];
    if (parsed.message) messageParts.push(parsed.message);
    if (amenityNames.length) messageParts.push(`Requested amenities: ${amenityNames.join(', ')}`);
    const special_requests = messageParts.length ? messageParts.join('\n\n') : null;

    // Event halls: inclusive calendar days (Nov 9–Nov 9 is a valid one-day booking).
    // Rooms: half-open stay window via bookingWindow (check-in morning → day after checkout).
    let start_at: string;
    let end_at: string;
    if (pipeline === 'event_venue') {
      start_at = `${parsed.start_date}T00:00`;
      end_at = `${parsed.end_date}T23:55`;
    } else {
      const stay = bookingWindow(parsed.start_date, parsed.end_date);
      start_at = stay.start.replace(' ', 'T').slice(0, 16);
      end_at = stay.end.replace(' ', 'T').slice(0, 16);
    }

    const input: InquiryInput = {
      pipeline,
      customer_name: parsed.customer_name,
      phone: parsed.phone,
      email: parsed.email,
      lead_source: 'website',
      lead_source_detail: null,
      offering_id: offering.id,
      event_type: pipeline === 'event_venue' ? parsed.event_type : null,
      guests: parsed.guests,
      start_at,
      end_at,
      cocktail_time: null,
      accommodation_date: null,
      special_requests,
      additional_services: null,
      custom_arrangements: null,
      internal_notes: null,
      package_price: 0,
      additional_charges: 0,
      discounts: 0,
      discount_percent: null,
      other_fees: 0,
      final_agreed_price: null,
      deposit_amount: null,
      deposit_note: null,
      agent_ids: [],
    };

    const id = await createInquiry(input, null);
    res.status(201).json({ ok: true, id });
  }),
);
