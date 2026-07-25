-- Terrain Detail Studio PostgreSQL Initial DDL Migration
-- Target: Neon PostgreSQL

-- Enable UUID extension if required
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL UNIQUE,
    "full_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "last_login_at" TIMESTAMPTZ
);

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS "organizations" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Organization Members Table
CREATE TABLE IF NOT EXISTS "organization_members" (
    "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("organization_id", "user_id")
);

-- 4. Plans Table
CREATE TABLE IF NOT EXISTS "plans" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. Features Table
CREATE TABLE IF NOT EXISTS "features" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE
);

-- 6. Plan Features Table
CREATE TABLE IF NOT EXISTS "plan_features" (
    "plan_id" UUID NOT NULL REFERENCES "plans"("id") ON DELETE CASCADE,
    "feature_id" UUID NOT NULL REFERENCES "features"("id") ON DELETE CASCADE,
    "config_json" JSONB,
    PRIMARY KEY ("plan_id", "feature_id")
);

-- 7. Licenses Table
CREATE TABLE IF NOT EXISTS "licenses" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "organization_id" UUID REFERENCES "organizations"("id") ON DELETE SET NULL,
    "plan_id" UUID NOT NULL REFERENCES "plans"("id"),
    "status" TEXT NOT NULL DEFAULT 'active',
    "starts_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "max_devices" INTEGER NOT NULL DEFAULT 2,
    "offline_days" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial Index for Active Licenses
CREATE INDEX IF NOT EXISTS "idx_licenses_status_expires" ON "licenses" ("status", "expires_at");

-- 8. Devices Table
CREATE TABLE IF NOT EXISTS "devices" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "license_id" UUID NOT NULL REFERENCES "licenses"("id") ON DELETE CASCADE,
    "installation_id_hash" TEXT NOT NULL,
    "label" TEXT,
    "platform" TEXT,
    "qgis_version" TEXT,
    "plugin_version" TEXT,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "revoked_at" TIMESTAMPTZ
);

-- Unique index for device per license and installation hash
CREATE UNIQUE INDEX IF NOT EXISTS "idx_devices_license_inst_hash" ON "devices" ("license_id", "installation_id_hash");

-- 9. Refresh Tokens Table
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "device_id" UUID NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Offline Leases Table
CREATE TABLE IF NOT EXISTS "offline_leases" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "license_id" UUID NOT NULL REFERENCES "licenses"("id") ON DELETE CASCADE,
    "device_id" UUID NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
    "token_id" TEXT NOT NULL UNIQUE,
    "token_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ
);

-- 11. Presets Table
CREATE TABLE IF NOT EXISTS "presets" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "required_features_json" JSONB NOT NULL,
    "payload_json" JSONB NOT NULL,
    "min_plugin_version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'published',
    "published_at" TIMESTAMPTZ
);

-- Unique Index for Presets Code + Version
CREATE UNIQUE INDEX IF NOT EXISTS "idx_presets_code_version" ON "presets" ("code", "version");

-- 12. Plugin Releases Table
CREATE TABLE IF NOT EXISTS "plugin_releases" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "version" TEXT NOT NULL UNIQUE,
    "min_qgis_version" TEXT NOT NULL DEFAULT '3.28.0',
    "download_url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "release_notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Usage Events Table
CREATE TABLE IF NOT EXISTS "usage_events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "license_id" UUID REFERENCES "licenses"("id") ON DELETE SET NULL,
    "device_id" UUID REFERENCES "devices"("id") ON DELETE SET NULL,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "idempotency_key" TEXT NOT NULL UNIQUE,
    "metadata_json" JSONB
);

-- 14. Audit Logs Table
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "actor_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "ip_hash" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (RLS) Configuration
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "licenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offline_leases" ENABLE ROW LEVEL SECURITY;

-- Default Policies (Applies when using direct Postgres user tokens)
CREATE POLICY users_self_policy ON "users" FOR SELECT USING (id = current_setting('app.current_user_id', true)::uuid);
CREATE POLICY licenses_self_policy ON "licenses" FOR SELECT USING (user_id = current_setting('app.current_user_id', true)::uuid);
CREATE POLICY devices_self_policy ON "devices" FOR ALL USING (user_id = current_setting('app.current_user_id', true)::uuid);
