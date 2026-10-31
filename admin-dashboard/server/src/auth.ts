import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import { query } from './db';
import { log } from './logger';

export const AUTH_COOKIE = 'booking_admin_token';
const TOKEN_TTL_SECONDS = 60 * 60 * 12;

export interface AdminUser {
  id: number;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminUser;
    }
  }
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function setAuthCookie(res: Response, admin: AdminUser) {
  const token = jwt.sign({ sub: admin.id }, config.jwtSecret, { expiresIn: TOKEN_TTL_SECONDS });
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: config.cookiePath,
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: config.cookiePath,
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    return res.status(401).json({ message: 'Please log in.' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as unknown as { sub: number };
    const [admin] = await query<AdminUser>('SELECT id, name, email FROM admins WHERE id = $1', [
      payload.sub,
    ]);
    if (!admin) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Please log in.' });
    }
    req.admin = admin;
    next();
  } catch {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
}

export async function ensureFirstAdmin() {
  const [{ count }] = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM admins');
  if (Number(count) > 0) return;

  if (!config.adminEmail || !config.adminPassword) {
    log('warn', 'No admin users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first one.');
    return;
  }
  const hash = await hashPassword(config.adminPassword);
  await query('INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)', [
    config.adminName,
    config.adminEmail.toLowerCase(),
    hash,
  ]);
  log('info', 'Created first admin user', { email: config.adminEmail });
}
