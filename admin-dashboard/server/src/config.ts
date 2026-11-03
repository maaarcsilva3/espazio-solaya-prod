import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32 || jwtSecret.includes('replace-with')) {
  throw new Error(
    'JWT_SECRET must be a strong random string of at least 32 characters (e.g. openssl rand -base64 48).',
  );
}

/** Public URL prefix when nginx mounts under a path (e.g. `/dev/espazio-admin`). Empty at domain root. */
function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') return '';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.replace(/\/$/, '');
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  /** Only for managed DBs that present non-public CAs. Prefer proper CA verification. */
  databaseSslInsecure: process.env.DATABASE_SSL_INSECURE === 'true',
  jwtSecret,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  /** Cookie Path attribute; `/` when served at domain root. */
  cookiePath: normalizeBasePath(process.env.BASE_PATH) || '/',
  basePath: normalizeBasePath(process.env.BASE_PATH),
  adminName: process.env.ADMIN_NAME ?? 'Administrator',
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  clientDist: path.resolve(__dirname, '../../client/dist'),
  uploadsDir: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(__dirname, '../../uploads'),
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024),
};
