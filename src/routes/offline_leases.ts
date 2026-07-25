import { Hono } from 'hono';
import { db } from '../db.js';
import { offlineLeases, licenses, devices } from '../../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import * as crypto from 'crypto';

export const offlineLeasesRouter = new Hono();
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

// POST /v1/offline-leases/issue
offlineLeasesRouter.post('/issue', async (c) => {
  const payload = await authenticate(c);
  if (!payload || !payload.sub || !payload.license_id || !payload.device_id) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Valid active Bearer token required' }, 401);
  }

  const license = await db.query.licenses.findFirst({
    where: eq(licenses.id, payload.license_id as string),
  });

  if (!license || license.status !== 'active' || new Date(license.expiresAt) < new Date()) {
    return c.json({ code: 'LICENSE_INACTIVE', message: 'Active license required for offline lease' }, 403);
  }

  const device = await db.query.devices.findFirst({
    where: and(eq(devices.id, payload.device_id as string), isNull(devices.revokedAt)),
  });

  if (!device) {
    return c.json({ code: 'DEVICE_REVOKED', message: 'Device is revoked or not found' }, 403);
  }

  const tokenId = `lease_${crypto.randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(Date.now() + license.offlineDays * 24 * 60 * 60 * 1000);

  // Features granted in lease
  const grantedFeatures = {
    md_hillshade: true,
    slope_texture: true,
    local_relief: true,
    cartographic_style: true,
    preset_pro: true,
    batch_processing: true,
    vrt_builder: true,
  };

  // Sign cryptographic lease JWT (valid for 7 days)
  const leaseToken = await new SignJWT({
    token_id: tokenId,
    license_id: license.id,
    device_id: device.id,
    user_id: payload.sub as string,
    features: grantedFeatures,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${license.offlineDays}d`)
    .sign(JWT_SECRET);

  const tokenHash = crypto.createHash('sha256').update(leaseToken).digest('hex');

  await db.insert(offlineLeases).values({
    licenseId: license.id,
    deviceId: device.id,
    tokenId: tokenId,
    tokenHash: tokenHash,
    issuedAt: new Date(),
    expiresAt: expiresAt,
  });

  return c.json({
    lease_token: leaseToken,
    token_id: tokenId,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    offline_days: license.offlineDays,
    features: grantedFeatures,
  });
});
