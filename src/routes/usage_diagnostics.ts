import { Hono } from 'hono';
import { db } from '../db.js';
import { usageEvents } from '../../db/schema.js';
import { jwtVerify } from 'jose';

export const usageDiagnosticsRouter = new Hono();
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'tds_jwt_secret_key_change_me_in_production_32bytes');

async function authenticate(c: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const { payload } = await jwtVerify(authHeader.split(' ')[1], JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

// POST /v1/usage-events
usageDiagnosticsRouter.post('/usage-events', async (c) => {
  const payload = await authenticate(c);
  if (!payload || !payload.sub) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Valid Bearer token required' }, 401);
  }

  const { event_type, idempotency_key, metadata } = await c.req.json().catch(() => ({}));

  if (!event_type || !idempotency_key) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Missing event_type or idempotency_key' }, 400);
  }

  try {
    await db.insert(usageEvents).values({
      userId: payload.sub as string,
      licenseId: payload.license_id as string || null,
      deviceId: payload.device_id as string || null,
      eventType: event_type,
      idempotencyKey: idempotency_key,
      metadataJson: metadata || {},
    });
    return c.json({ success: true, message: 'Usage event recorded' });
  } catch (err: any) {
    if (err.message?.includes('idempotency') || err.code === '23505') {
      return c.json({ success: true, message: 'Event already recorded (idempotent)' });
    }
    return c.json({ code: 'SERVER_ERROR', message: 'Failed to record usage event' }, 500);
  }
});

// POST /v1/diagnostics
usageDiagnosticsRouter.post('/diagnostics', async (c) => {
  const { plugin_version, qgis_version, os_family, log_payload } = await c.req.json().catch(() => ({}));

  return c.json({
    success: true,
    message: 'Diagnostic report received',
    report_id: `diag_${Date.now()}`,
  });
});
