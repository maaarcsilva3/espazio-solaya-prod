import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'http';
import { createApp } from '../src/app';
import { publicRequestSchema } from '../src/schemas';

describe('publicRequestSchema', () => {
  it('rejects missing required fields', () => {
    const result = publicRequestSchema.safeParse({});
    assert.equal(result.success, false);
  });

  it('accepts a minimal valid payload', () => {
    const result = publicRequestSchema.safeParse({
      full_name: 'Ada Lovelace',
      email: 'ada@example.com',
      start_date: '2099-01-01',
      end_date: '2099-01-02',
    });
    assert.equal(result.success, true);
  });
});

describe('API smoke (no database required for these paths)', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('returns 401 for an auth-gated route without a session cookie', async () => {
    const res = await fetch(`${baseUrl}/api/offerings`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /log in/i);
  });

  it('accepts the public honeypot without touching booking creation', async () => {
    const res = await fetch(`${baseUrl}/api/public/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website: 'https://spam.example', full_name: 'Bot' }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it('returns 400 validation errors for an incomplete public request', async () => {
    const res = await fetch(`${baseUrl}/api/public/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'No Dates' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { message: string; errors?: Record<string, string[]> };
    assert.ok(body.message);
    assert.ok(body.errors);
  });

  it('rejects login with invalid credentials when the database is reachable', async (t) => {
    const { pool } = await import('../src/db');
    try {
      await pool.query('SELECT 1');
    } catch {
      t.skip('database unavailable');
      return;
    }
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' }),
    });
    assert.equal(res.status, 401);
  });
});
