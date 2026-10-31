import type { Server } from 'http';
import { createApp } from './app';
import { config } from './config';
import { pool } from './db';
import { ensureFirstAdmin } from './auth';
import { log } from './logger';
import { ensureStatusesTable } from './routes/statuses';
import { ensureCrmSchema } from './routes/pipelineStages';
import { ensureAgentsSchema } from './routes/agents';

const app = createApp();
let server: Server | undefined;
let shuttingDown = false;

async function start() {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      log('info', 'Waiting for database', { attempt });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await ensureStatusesTable();
  await ensureCrmSchema();
  await ensureAgentsSchema();
  await ensureFirstAdmin();
  server = app.listen(config.port, () => {
    log('info', 'Admin dashboard running', { port: config.port });
  });
}

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'Shutting down', { signal });
  const forceTimer = setTimeout(() => {
    log('error', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  const closePool = () =>
    pool
      .end()
      .then(() => {
        log('info', 'Database pool closed');
        process.exit(0);
      })
      .catch((err) => {
        log('error', 'Error closing database pool', {
          error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      });

  if (!server) {
    closePool();
    return;
  }
  server.close((err) => {
    if (err) {
      log('error', 'Error closing HTTP server', { error: err.message });
    }
    closePool();
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});

start().catch((err) => {
  log('error', 'Failed to start server', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
