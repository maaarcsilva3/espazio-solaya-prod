import { Router } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { query } from '../db';
import { asyncHandler, HttpError } from '../http';
import { publicRequestSchema } from '../schemas';
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
