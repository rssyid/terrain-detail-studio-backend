import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, uniqueIndex, index, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  fullName: text('full_name'),
  status: text('status').notNull().default('active'), // active, suspended
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

// 2. Organizations
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 3. Organization Members
export const organizationMembers = pgTable('organization_members', {
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // owner, admin, member
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.organizationId, t.userId] }),
}));

// 4. Plans
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(), // free, individual_pro
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
});

// 5. Features
export const features = pgTable('features', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(), // md_hillshade, slope_texture, local_relief, cartographic_style, preset_pro, batch_processing, vrt_builder
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
});

// 6. Plan Features
export const planFeatures = pgTable('plan_features', {
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  configJson: jsonb('config_json'),
}, (t) => ({
  pk: primaryKey({ columns: [t.planId, t.featureId] }),
}));

// 7. Licenses
export const licenses = pgTable('licenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: text('status').notNull().default('active'), // trial, active, past_due, expired, revoked
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  maxDevices: integer('max_devices').notNull().default(2),
  offlineDays: integer('offline_days').notNull().default(7),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  activeStatusIdx: index('idx_licenses_status_expires').on(t.status, t.expiresAt),
}));

// 8. Devices
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  licenseId: uuid('license_id').notNull().references(() => licenses.id, { onDelete: 'cascade' }),
  installationIdHash: text('installation_id_hash').notNull(),
  label: text('label'),
  platform: text('platform'),
  qgisVersion: text('qgis_version'),
  pluginVersion: text('plugin_version'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => ({
  uniqueLicenseDevice: uniqueIndex('idx_devices_license_inst_hash').on(t.licenseId, t.installationIdHash),
}));

// 9. Refresh Tokens
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 10. Offline Leases
export const offlineLeases = pgTable('offline_leases', {
  id: uuid('id').primaryKey().defaultRandom(),
  licenseId: uuid('license_id').notNull().references(() => licenses.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull().unique(),
  tokenHash: text('token_hash').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// 11. Presets
export const presets = pgTable('presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  requiredFeaturesJson: jsonb('required_features_json').notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  minPluginVersion: text('min_plugin_version').notNull().default('1.0.0'),
  status: text('status').notNull().default('published'), // draft, published, archived
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, (t) => ({
  uniqueCodeVersion: uniqueIndex('idx_presets_code_version').on(t.code, t.version),
}));

// 12. Plugin Releases
export const pluginReleases = pgTable('plugin_releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull().unique(),
  minQgisVersion: text('min_qgis_version').notNull().default('3.28.0'),
  downloadUrl: text('download_url').notNull(),
  sha256: text('sha256').notNull(),
  releaseNotes: text('release_notes'),
  status: text('status').notNull().default('published'), // draft, published, archived
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
});

// 13. Usage Events
export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  licenseId: uuid('license_id').references(() => licenses.id, { onDelete: 'set null' }),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  metadataJson: jsonb('metadata_json'),
});

// 14. Audit Logs
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  ipHash: text('ip_hash'),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  licenses: many(licenses),
  devices: many(devices),
  memberships: many(organizationMembers),
}));

export const licensesRelations = relations(licenses, ({ one, many }) => ({
  user: one(users, { fields: [licenses.userId], references: [users.id] }),
  plan: one(plans, { fields: [licenses.planId], references: [plans.id] }),
  devices: many(devices),
  offlineLeases: many(offlineLeases),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, { fields: [devices.userId], references: [users.id] }),
  license: one(licenses, { fields: [devices.licenseId], references: [licenses.id] }),
  refreshTokens: many(refreshTokens),
  offlineLeases: many(offlineLeases),
}));
