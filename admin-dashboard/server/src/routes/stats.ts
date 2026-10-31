import { Router } from 'express';
import { query } from '../db';
import { asyncHandler } from '../http';
import { getPipelineSummary } from '../services/analytics';
import { REQUEST_SELECT } from '../services/requests';

export const statsRouter = Router();

statsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [counts] = await query(
      `SELECT
         COUNT(*) FILTER (WHERE rs.category = 'new')::int AS pending,
         COUNT(*) FILTER (WHERE rs.category = 'booked'
           AND br.start_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
           AND br.end_date >= date_trunc('month', CURRENT_DATE))::int AS confirmed_this_month,
         COUNT(*) FILTER (WHERE rs.category = 'booked'
           AND br.start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS upcoming_week
       FROM booking_requests br
       JOIN request_statuses rs ON rs.key = br.status`,
    );
    const [{ active_offerings }] = await query(
      'SELECT COUNT(*)::int AS active_offerings FROM offerings WHERE is_active = TRUE',
    );
    const pendingRequests = await query(
      `${REQUEST_SELECT} WHERE rs.category = 'new' ORDER BY br.created_at DESC LIMIT 5`,
    );
    const upcomingRequests = await query(
      `${REQUEST_SELECT} WHERE rs.category = 'booked' AND br.end_date >= CURRENT_DATE
       ORDER BY br.start_date ASC LIMIT 5`,
    );
    const pipeline = await getPipelineSummary();
    res.json({
      ...counts,
      active_offerings,
      pending_requests: pendingRequests,
      upcoming_requests: upcomingRequests,
      pipeline,
    });
  }),
);
