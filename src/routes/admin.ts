import { Hono } from 'hono';
import { db } from '../db.js';
import { licenses, devices, presets, pluginReleases, auditLogs, users, plans } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export const adminRouter = new Hono();

// Admin Authentication Middleware
adminRouter.use('*', async (c, next) => {
  const apiKey = c.req.header('X-Admin-API-Key') || c.req.header('Authorization')?.replace('Bearer ', '');
  const expectedKey = process.env.ADMIN_API_KEY || 'tds_admin_secret_key_change_in_production';

  if (!apiKey || apiKey !== expectedKey) {
    return c.json({ code: 'UNAUTHORIZED_ADMIN', message: 'Valid Admin credentials required' }, 401);
  }
  await next();
});

// POST /v1/admin/licenses
adminRouter.post('/licenses', async (c) => {
  const { user_email, plan_code, duration_days, max_devices } = await c.req.json().catch(() => ({}));

  if (!user_email) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Missing user_email' }, 400);
  }

  let user = await db.query.users.findFirst({ where: eq(users.email, user_email) });
  if (!user) {
    const [newUser] = await db.insert(users).values({ email: user_email, fullName: user_email.split('@')[0] }).returning();
    user = newUser;
  }

  const targetPlanCode = plan_code || 'individual_pro';
  const planRecord = await db.query.plans.findFirst({ where: eq(plans.code, targetPlanCode) });

  const days = duration_days || 365;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const [newLicense] = await db.insert(licenses).values({
    userId: user.id,
    planId: planRecord?.id || '00000000-0000-0000-0000-000000000000',
    status: 'active',
    expiresAt: expiresAt,
    maxDevices: max_devices || 2,
    offlineDays: 7,
  }).returning();

  await db.insert(auditLogs).values({
    action: 'CREATE_LICENSE',
    targetType: 'LICENSE',
    targetId: newLicense.id,
    metadataJson: { user_email, plan_code: targetPlanCode, expires_at: expiresAt.toISOString() },
  });

  return c.json({ success: true, license: newLicense });
});

// POST /v1/admin/devices/:id/reset
adminRouter.post('/devices/:id/reset', async (c) => {
  const deviceId = c.req.param('id');
  const { reason } = await c.req.json().catch(() => ({}));

  if (!reason) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Mandatory support reason required for device reset' }, 400);
  }

  const device = await db.query.devices.findFirst({ where: eq(devices.id, deviceId) });
  if (!device) {
    return c.json({ code: 'NOT_FOUND', message: 'Device not found' }, 404);
  }

  await db.update(devices).set({ revokedAt: null, lastSeenAt: new Date() }).where(eq(devices.id, deviceId));

  await db.insert(auditLogs).values({
    action: 'RESET_DEVICE',
    targetType: 'DEVICE',
    targetId: deviceId,
    metadataJson: { reason, license_id: device.licenseId },
  });

  return c.json({ success: true, message: 'Device reset successfully' });
});

// POST /v1/admin/presets
adminRouter.post('/presets', async (c) => {
  const { code, name, version, required_features, payload, min_plugin_version } = await c.req.json().catch(() => ({}));

  if (!code || !version || !payload) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Missing code, version, or payload' }, 400);
  }

  const [newPreset] = await db.insert(presets).values({
    code,
    name: name || code,
    version,
    requiredFeaturesJson: required_features || ['md_hillshade', 'slope_texture', 'local_relief'],
    payloadJson: payload,
    minPluginVersion: min_plugin_version || '1.0.0',
    status: 'published',
    publishedAt: new Date(),
  }).returning();

  await db.insert(auditLogs).values({
    action: 'PUBLISH_PRESET',
    targetType: 'PRESET',
    targetId: newPreset.id,
    metadataJson: { code, version },
  });

  return c.json({ success: true, preset: newPreset });
});

// POST /v1/admin/releases
adminRouter.post('/releases', async (c) => {
  const { version, min_qgis_version, download_url, sha256, release_notes } = await c.req.json().catch(() => ({}));

  if (!version || !download_url || !sha256) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Missing version, download_url, or sha256' }, 400);
  }

  const [newRelease] = await db.insert(pluginReleases).values({
    version,
    minQgisVersion: min_qgis_version || '3.28.0',
    downloadUrl: download_url,
    sha256,
    releaseNotes: release_notes || '',
    status: 'published',
    publishedAt: new Date(),
  }).returning();

// GET /v1/admin/metrics
adminRouter.get('/metrics', async (c) => {
  const allUsers = await db.select().from(users);
  const allLicenses = await db.select().from(licenses);
  const allDevices = await db.select().from(devices);

  const activeLicenses = allLicenses.filter(l => l.status === 'active');
  const now = new Date();
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiringLicenses = allLicenses.filter(l => l.expiresAt && new Date(l.expiresAt) <= thirtyDaysLater && new Date(l.expiresAt) > now);

  return c.json({
    total_users: allUsers.length,
    active_licenses: activeLicenses.length,
    expiring_in_30_days: expiringLicenses.length,
    active_devices: allDevices.filter(d => d.status === 'active').length,
    neon_db_status: 'connected',
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// GET /v1/admin/audit-logs
adminRouter.get('/audit-logs', async (c) => {
  const logs = await db.select().from(auditLogs).limit(50);
  return c.json({
    audit_logs: logs.map(l => ({
      id: l.id,
      actor_user_id: l.actorUserId || 'admin_sys_01',
      action: l.action,
      target_type: l.targetType,
      target_id: l.targetId,
      metadata: l.metadataJson || {},
      created_at: l.createdAt,
    })),
  });
});

// GET /v1/admin/devices
adminRouter.get('/devices', async (c) => {
  const allDevices = await db.select().from(devices);
  return c.json({
    devices: allDevices.map(d => ({
      id: d.id,
      label: d.hardwareName || d.deviceFingerprint,
      platform: d.platformOS || 'Windows 11 x86_64',
      qgis_version: d.qgisVersion || '3.34.4',
      plugin_version: d.pluginVersion || '1.0.0',
      first_seen_at: d.firstSeenAt,
      last_seen_at: d.lastSeenAt,
      revoked_at: d.revokedAt,
      status: d.status,
    })),
  });
});
