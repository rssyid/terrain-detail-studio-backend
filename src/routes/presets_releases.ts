import { Hono } from 'hono';
import { db } from '../db.js';
import { presets, pluginReleases } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const presetsReleasesRouter = new Hono();

// GET /v1/presets
presetsReleasesRouter.get('/presets', async (c) => {
  const publishedPresets = await db.query.presets.findMany({
    where: eq(presets.status, 'published'),
  });

  return c.json({
    presets: publishedPresets.map((p) => ({
      code: p.code,
      name: p.name,
      version: p.version,
      min_plugin_version: p.minPluginVersion,
      required_features: p.requiredFeaturesJson,
      payload: p.payloadJson,
      published_at: p.publishedAt,
    })),
  });
});

// GET /v1/presets/:code
presetsReleasesRouter.get('/presets/:code', async (c) => {
  const code = c.req.param('code');
  const presetRecord = await db.query.presets.findFirst({
    where: eq(presets.code, code),
    orderBy: [desc(presets.publishedAt)],
  });

  if (!presetRecord || presetRecord.status !== 'published') {
    return c.json({ code: 'PRESET_NOT_FOUND', message: `Preset '${code}' not found or not published` }, 404);
  }

  return c.json({
    code: presetRecord.code,
    name: presetRecord.name,
    version: presetRecord.version,
    min_plugin_version: presetRecord.minPluginVersion,
    required_features: presetRecord.requiredFeaturesJson,
    payload: presetRecord.payloadJson,
    published_at: presetRecord.publishedAt,
  });
});

// GET /v1/releases/latest
presetsReleasesRouter.get('/releases/latest', async (c) => {
  const latestRelease = await db.query.pluginReleases.findFirst({
    where: eq(pluginReleases.status, 'published'),
    orderBy: [desc(pluginReleases.publishedAt)],
  });

  if (!latestRelease) {
    return c.json({
      version: '1.0.0',
      min_qgis_version: '3.28.0',
      download_url: 'https://downloads.terraindetailstudio.com/releases/terrain_detail_studio-1.0.0.zip',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      release_notes: 'Initial release',
      published_at: new Date().toISOString(),
    });
  }

  return c.json({
    version: latestRelease.version,
    min_qgis_version: latestRelease.minQgisVersion,
    download_url: latestRelease.downloadUrl,
    sha256: latestRelease.sha256,
    release_notes: latestRelease.releaseNotes,
    published_at: latestRelease.publishedAt,
  });
});
