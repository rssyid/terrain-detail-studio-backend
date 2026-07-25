import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import * as dotenv from 'dotenv';

import { authRouter } from './routes/auth.js';
import { entitlementsRouter } from './routes/entitlements.js';
import { devicesRouter } from './routes/devices.js';
import { offlineLeasesRouter } from './routes/offline_leases.js';
import { presetsReleasesRouter } from './routes/presets_releases.js';
import { adminRouter } from './routes/admin.js';
import { usageDiagnosticsRouter } from './routes/usage_diagnostics.js';

dotenv.config();

const app = new Hono();

// Global Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-API-Key', 'x-admin-api-key'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Health Check
app.get('/health', (c) => c.json({ status: 'ok', service: 'Terrain Detail Studio API', timestamp: new Date().toISOString() }));
app.get('/v1/health', (c) => c.json({ status: 'ok', service: 'Terrain Detail Studio API v1', timestamp: new Date().toISOString() }));

// Mount Routers
app.route('/v1/auth', authRouter);
app.route('/v1', entitlementsRouter);
app.route('/v1/devices', devicesRouter);
app.route('/v1/offline-leases', offlineLeasesRouter);
app.route('/v1', presetsReleasesRouter);
app.route('/v1/admin', adminRouter);
app.route('/v1/portal', adminRouter);
app.route('/v1', usageDiagnosticsRouter);

// Global Error Handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    request_id: `req_${Date.now()}`,
  }, 500);
});

// Start Server when run directly
const PORT = Number(process.env.PORT) || 3000;

if (process.env.NODE_ENV !== 'test') {
  console.log(`🚀 Terrain Detail Studio Backend listening on http://localhost:${PORT}`);
  serve({
    fetch: app.fetch,
    port: PORT,
  });
}

export default app;
