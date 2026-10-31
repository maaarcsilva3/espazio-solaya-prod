import { Router } from 'express';
import { query } from '../db';
import { asyncHandler, HttpError, parseId } from '../http';
import { adminUserSchema, passwordChangeSchema } from '../schemas';
import { hashPassword, verifyPassword } from '../auth';

export const adminsRouter = Router();

adminsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await query('SELECT id, name, email, created_at FROM admins ORDER BY name'));
  }),
);

adminsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = adminUserSchema.parse(req.body);
    const [row] = await query(
      `INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [d.name, d.email, await hashPassword(d.password)],
    );
    res.status(201).json(row);
  }),
);

adminsRouter.post(
  '/me/password',
  asyncHandler(async (req, res) => {
    const d = passwordChangeSchema.parse(req.body);
    const [admin] = await query<{ password_hash: string }>(
      'SELECT password_hash FROM admins WHERE id = $1',
      [req.admin!.id],
    );
    if (!admin || !(await verifyPassword(d.current_password, admin.password_hash))) {
      throw new HttpError(400, 'Current password is incorrect.');
    }
    await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [
      await hashPassword(d.new_password),
      req.admin!.id,
    ]);
    res.json({ ok: true });
  }),
);

adminsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === req.admin!.id) throw new HttpError(400, 'You cannot delete your own account.');
    const rows = await query('DELETE FROM admins WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) throw new HttpError(404, 'Admin not found.');
    res.json({ ok: true });
  }),
);
