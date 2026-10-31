import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db';
import { asyncHandler, HttpError } from '../http';
import { clearAuthCookie, requireAuth, setAuthCookie, verifyPassword } from '../auth';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const [admin] = await query<{ id: number; name: string; email: string; password_hash: string }>(
      'SELECT id, name, email, password_hash FROM admins WHERE email = $1',
      [email],
    );
    if (!admin || !(await verifyPassword(password, admin.password_hash))) {
      throw new HttpError(401, 'Incorrect email or password.');
    }
    const user = { id: admin.id, name: admin.name, email: admin.email };
    setAuthCookie(res, user);
    res.json(user);
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(req.admin);
});
