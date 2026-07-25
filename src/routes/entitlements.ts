import { Hono } from 'hono';
import { db } from '../db.js';
import { users, licenses, plans } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { jwtVerify } from 'jose';

export const entitlementsRouter = new Hono();
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'tds_jwt_secret_key_change_me_in_production_32bytes');

// Middleware to extract auth token
async function authenticate(c: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

// GET /v1/me
entitlementsRouter.get('/me', async (c) => {
  const payload = await authenticate(c);
  if (!payload || !payload.sub) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Valid Bearer token required' }, 401);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub as string),
  });

  if (!user) {
    return c.json({ code: 'USER_NOT_FOUND', message: 'User profile not found' }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    status: user.status,
    created_at: user.createdAt,
  });
});

// GET /v1/entitlements
entitlementsRouter.get('/entitlements', async (c) => {
  const payload = await authenticate(c);
  if (!payload || !payload.sub) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Valid Bearer token required' }, 401);
  }

  const userId = payload.sub as string;
  const licenseId = payload.license_id as string;

  let license = await db.query.licenses.findFirst({
    where: eq(licenses.id, licenseId),
  });

  if (!license) {
    license = await db.query.licenses.findFirst({
      where: eq(licenses.userId, userId),
    });
  }

  if (!license) {
    return c.json({
      license_id: null,
      plan_code: 'free',
      status: 'none',
      expires_at: null,
      offline_until: null,
      limits: { devices: 1, batch_items_per_run: 1 },
      features: {
        md_hillshade: true,
        slope_texture: false,
        local_relief: false,
        cartographic_style: false,
        preset_pro: false,
        batch_processing: false,
        vrt_builder: false,
      },
    });
  }

  const isExpired = new Date(license.expiresAt) < new Date();
  const isActive = license.status === 'active' && !isExpired;

  const offlineUntil = new Date(Date.now() + license.offlineDays * 24 * 60 * 60 * 1000).toISOString();

  return c.json({
    license_id: license.id,
    plan_code: 'individual_pro',
    status: isActive ? 'active' : isExpired ? 'expired' : license.status,
    expires_at: license.expiresAt,
    offline_until: offlineUntil,
    limits: {
      devices: license.maxDevices,
      batch_items_per_run: 100,
    },
    features: {
      md_hillshade: true,
      slope_texture: isActive,
      local_relief: isActive,
      cartographic_style: isActive,
      preset_pro: isActive,
      batch_processing: isActive,
      vrt_builder: isActive,
    },
  });
});
