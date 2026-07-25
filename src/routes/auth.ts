import { Hono } from 'hono';
import { db } from '../db.js';
import { users, refreshTokens, devices, licenses } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { SignJWT } from 'jose';
import * as crypto from 'crypto';

export const authRouter = new Hono();

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'tds_jwt_secret_key_change_me_in_production_32bytes');

// In-memory store for PKCE auth sessions (for demonstration/dev)
const authSessions = new Map<string, { codeChallenge: string; expiresAt: number }>();

// POST /v1/auth/start
authRouter.post('/start', async (c) => {
  const { code_challenge, code_challenge_method } = await c.req.json().catch(() => ({}));
  
  if (!code_challenge) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Missing code_challenge' }, 400);
  }

  const authCode = crypto.randomBytes(16).toString('hex');
  authSessions.set(authCode, {
    codeChallenge: code_challenge,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  return c.json({
    auth_code: authCode,
    login_url: `https://auth.terraindetailstudio.com/login?code=${authCode}`,
    expires_in: 600,
  });
});

// POST /v1/auth/token
authRouter.post('/token', async (c) => {
  const { auth_code, email, installation_id_hash } = await c.req.json().catch(() => ({}));

  if (!email || !installation_id_hash) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Missing email or installation_id_hash' }, 400);
  }

  // Find or create user (for dev/demo flow)
  let user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    const [newUser] = await db.insert(users).values({
      email,
      fullName: email.split('@')[0],
      status: 'active',
    }).returning();
    user = newUser;
  }

  // Find user active license
  let license = await db.query.licenses.findFirst({
    where: eq(licenses.userId, user.id),
  });

  if (!license) {
    // Automatically issue individual_pro license for dev/demo testing if none exists
    const [newLic] = await db.insert(licenses).values({
      userId: user.id,
      planId: (await db.query.plans.findFirst({ where: eq(users.status, 'active') }))?.id || '00000000-0000-0000-0000-000000000000',
      status: 'active',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      maxDevices: 2,
      offlineDays: 7,
    }).returning();
    license = newLic;
  }

  // Find or create device
  let device = await db.query.devices.findFirst({
    where: and(
      eq(devices.licenseId, license.id),
      eq(devices.installationIdHash, installation_id_hash)
    ),
  });

  if (!device) {
    // Check device count
    const existingDevices = await db.query.devices.findMany({
      where: and(eq(devices.licenseId, license.id), eq(devices.revokedAt, null as any)),
    });

    if (existingDevices.length >= license.maxDevices) {
      return c.json({
        code: 'DEVICE_LIMIT_REACHED',
        message: `Maximum device limit (${license.maxDevices}) reached for this license. Revoke an existing device to register this installation.`,
      }, 409);
    }

    const [newDev] = await db.insert(devices).values({
      userId: user.id,
      licenseId: license.id,
      installationIdHash: installation_id_hash,
      label: `QGIS Installation (${installation_id_hash.substring(0, 8)})`,
      platform: 'Windows',
    }).returning();
    device = newDev;
  }

  // Generate short-lived access token (60 mins)
  const accessToken = await new SignJWT({
    sub: user.id,
    email: user.email,
    license_id: license.id,
    device_id: device.id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET);

  // Generate refresh token (7 days)
  const refreshTokenRaw = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');

  await db.insert(refreshTokens).values({
    userId: user.id,
    deviceId: device.id,
    tokenHash: tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return c.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: refreshTokenRaw,
    user_id: user.id,
    license_id: license.id,
    device_id: device.id,
  });
});

// POST /v1/auth/refresh
authRouter.post('/refresh', async (c) => {
  const { refresh_token } = await c.req.json().catch(() => ({}));

  if (!refresh_token) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Missing refresh_token' }, 400);
  }

  const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');

  const tokenRecord = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, tokenHash),
  });

  if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt < new Date()) {
    return c.json({ code: 'TOKEN_EXPIRED', message: 'Refresh token is invalid or expired' }, 401);
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, tokenRecord.userId) });
  const device = await db.query.devices.findFirst({ where: eq(devices.id, tokenRecord.deviceId) });

  if (!user || !device) {
    return c.json({ code: 'UNAUTHORIZED', message: 'User or device not found' }, 401);
  }

  const newAccessToken = await new SignJWT({
    sub: user.id,
    email: user.email,
    license_id: device.licenseId,
    device_id: device.id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET);

  return c.json({
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: 3600,
  });
});

// POST /v1/auth/logout
authRouter.post('/logout', async (c) => {
  const { refresh_token } = await c.req.json().catch(() => ({}));

  if (refresh_token) {
    const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }

  return c.json({ success: true, message: 'Logged out successfully' });
});
