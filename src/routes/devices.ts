import { Hono } from 'hono';
import { db } from '../db.js';
import { devices, licenses } from '../../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { jwtVerify } from 'jose';

export const devicesRouter = new Hono();
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

// POST /v1/devices/activate
devicesRouter.post('/activate', async (c) => {
  const payload = await authenticate(c);
  if (!payload || !payload.sub || !payload.license_id) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Valid Bearer token required' }, 401);
  }

  const { installation_id_hash, label, platform, qgis_version, plugin_version } = await c.req.json().catch(() => ({}));

  if (!installation_id_hash) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Missing installation_id_hash' }, 400);
  }

  const license = await db.query.licenses.findFirst({
    where: eq(licenses.id, payload.license_id as string),
  });

  if (!license || license.status !== 'active') {
    return c.json({ code: 'LICENSE_INACTIVE', message: 'License is inactive or expired' }, 403);
  }

  // Check if device already exists
  let device = await db.query.devices.findFirst({
    where: and(
      eq(devices.licenseId, license.id),
      eq(devices.installationIdHash, installation_id_hash)
    ),
  });

  if (device) {
    // If revoked, un-revoke or return warning
    if (device.revokedAt) {
      return c.json({ code: 'DEVICE_REVOKED', message: 'This device was previously revoked. Contact support or use admin reset.' }, 403);
    }
    // Update last seen
    await db.update(devices)
      .set({
        lastSeenAt: new Date(),
        label: label || device.label,
        platform: platform || device.platform,
        qgisVersion: qgis_version || device.qgisVersion,
        pluginVersion: plugin_version || device.pluginVersion,
      })
      .where(eq(devices.id, device.id));

    return c.json({
      device_id: device.id,
      status: 'active',
      label: device.label,
      activated_at: device.firstSeenAt,
    });
  }

  // Check device limit
  const activeDevices = await db.query.devices.findMany({
    where: and(eq(devices.licenseId, license.id), isNull(devices.revokedAt)),
  });

  if (activeDevices.length >= license.maxDevices) {
    return c.json({
      code: 'DEVICE_LIMIT_REACHED',
      message: `Device limit of ${license.maxDevices} reached for this license.`,
    }, 409);
  }

  const [newDevice] = await db.insert(devices).values({
    userId: payload.sub as string,
    licenseId: license.id,
    installationIdHash: installation_id_hash,
    label: label || `QGIS Installation (${installation_id_hash.substring(0, 8)})`,
    platform: platform || 'Unknown',
    qgisVersion: qgis_version,
    pluginVersion: plugin_version,
  }).returning();

  return c.json({
    device_id: newDevice.id,
    status: 'active',
    label: newDevice.label,
    activated_at: newDevice.firstSeenAt,
  });
});

// GET /v1/devices
devicesRouter.get('/', async (c) => {
  const payload = await authenticate(c);
  if (!payload || !payload.sub) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Valid Bearer token required' }, 401);
  }

  const userDevices = await db.query.devices.findMany({
    where: eq(devices.userId, payload.sub as string),
  });

  return c.json({
    devices: userDevices.map((d) => ({
      id: d.id,
      label: d.label,
      platform: d.platform,
      qgis_version: d.qgisVersion,
      plugin_version: d.pluginVersion,
      first_seen_at: d.firstSeenAt,
      last_seen_at: d.lastSeenAt,
      revoked_at: d.revokedAt,
      status: d.revokedAt ? 'revoked' : 'active',
    })),
  });
});

// POST /v1/devices/:id/revoke
devicesRouter.post('/:id/revoke', async (c) => {
  const payload = await authenticate(c);
  if (!payload || !payload.sub) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Valid Bearer token required' }, 401);
  }

  const deviceId = c.req.param('id');
  const device = await db.query.devices.findFirst({
    where: and(eq(devices.id, deviceId), eq(devices.userId, payload.sub as string)),
  });

  if (!device) {
    return c.json({ code: 'NOT_FOUND', message: 'Device not found' }, 404);
  }

  await db.update(devices)
    .set({ revokedAt: new Date() })
    .where(eq(devices.id, deviceId));

  return c.json({ success: true, message: 'Device revoked successfully' });
});
