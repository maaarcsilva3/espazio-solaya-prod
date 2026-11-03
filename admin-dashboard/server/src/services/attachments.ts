import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { config } from '../config';
import { query, withTransaction } from '../db';
import { ATTACHMENT_KINDS, type AttachmentKind } from '../domain/crm';
import { HttpError } from '../http';
import { logActivity } from './inquiries';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export interface InquiryAttachment {
  id: number;
  inquiry_id: number;
  kind: AttachmentKind;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
}

export function ensureUploadsDir() {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

function assertKind(kind: string): AttachmentKind {
  if (!(ATTACHMENT_KINDS as readonly string[]).includes(kind)) {
    throw new HttpError(400, 'Attachment kind must be qualify or payment.');
  }
  return kind as AttachmentKind;
}

function safeOriginalName(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 200);
  return base || 'file';
}

function extensionFor(mime: string, original: string) {
  const fromName = path.extname(original).toLowerCase();
  if (fromName && fromName.length <= 8) return fromName;
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  return '';
}

export async function listAttachments(inquiryId: number): Promise<InquiryAttachment[]> {
  return query(
    `SELECT a.id, a.inquiry_id, a.kind, a.original_name, a.stored_name, a.mime_type, a.size_bytes,
            a.created_by, ad.name AS created_by_name,
            to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
       FROM inquiry_attachments a
       LEFT JOIN admins ad ON ad.id = a.created_by
      WHERE a.inquiry_id = $1
      ORDER BY a.created_at DESC, a.id DESC`,
    [inquiryId],
  );
}

export async function getAttachment(inquiryId: number, attachmentId: number) {
  const [row] = await query<InquiryAttachment>(
    `SELECT a.id, a.inquiry_id, a.kind, a.original_name, a.stored_name, a.mime_type, a.size_bytes,
            a.created_by, ad.name AS created_by_name,
            to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
       FROM inquiry_attachments a
       LEFT JOIN admins ad ON ad.id = a.created_by
      WHERE a.inquiry_id = $1 AND a.id = $2`,
    [inquiryId, attachmentId],
  );
  return row ?? null;
}

export function attachmentPath(storedName: string) {
  const resolved = path.resolve(config.uploadsDir, storedName);
  if (!resolved.startsWith(path.resolve(config.uploadsDir) + path.sep)) {
    throw new HttpError(400, 'Invalid attachment path.');
  }
  return resolved;
}

export async function createAttachment(
  inquiryId: number,
  kindRaw: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  adminId: number,
) {
  const kind = assertKind(kindRaw);
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new HttpError(400, 'Only PDF, PNG, JPG, and WEBP files are allowed.');
  }
  if (file.size <= 0 || file.size > config.uploadMaxBytes) {
    throw new HttpError(400, `File must be between 1 byte and ${Math.round(config.uploadMaxBytes / (1024 * 1024))} MB.`);
  }

  ensureUploadsDir();
  const original = safeOriginalName(file.originalname);
  const stored = `${randomUUID()}${extensionFor(file.mimetype, original)}`;
  const dest = attachmentPath(stored);

  return withTransaction(async (client) => {
    const exists = await client.query('SELECT id FROM inquiries WHERE id = $1 FOR UPDATE', [inquiryId]);
    if (!exists.rows.length) throw new HttpError(404, 'Inquiry not found.');

    fs.writeFileSync(dest, file.buffer);
    try {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO inquiry_attachments
           (inquiry_id, kind, original_name, stored_name, mime_type, size_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [inquiryId, kind, original, stored, file.mimetype, file.size, adminId],
      );
      await client.query('UPDATE inquiries SET customer_name = customer_name WHERE id = $1', [inquiryId]);
      const label = kind === 'qualify' ? 'quotation' : 'proof of payment';
      await logActivity(client, inquiryId, adminId, 'attachment', `Uploaded ${label}: ${original}`);
      return rows[0].id;
    } catch (err) {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      throw err;
    }
  });
}

export async function deleteAttachment(inquiryId: number, attachmentId: number, adminId: number) {
  await withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query<InquiryAttachment>(
      `SELECT id, inquiry_id, kind, original_name, stored_name, mime_type, size_bytes, created_by,
              NULL::text AS created_by_name,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM inquiry_attachments
        WHERE inquiry_id = $1 AND id = $2
        FOR UPDATE`,
      [inquiryId, attachmentId],
    );
    const row = rows[0];
    if (!row) throw new HttpError(404, 'Attachment not found.');
    await client.query('DELETE FROM inquiry_attachments WHERE id = $1', [attachmentId]);
    await client.query('UPDATE inquiries SET customer_name = customer_name WHERE id = $1', [inquiryId]);
    const label = row.kind === 'qualify' ? 'quotation' : 'proof of payment';
    await logActivity(client, inquiryId, adminId, 'attachment', `Removed ${label}: ${row.original_name}`);
    try {
      fs.unlinkSync(attachmentPath(row.stored_name));
    } catch {
      /* file may already be gone */
    }
  });
}
