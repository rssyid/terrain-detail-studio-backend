-- Seed Initial Data for Terrain Detail Studio

-- 1. Insert Plans
INSERT INTO "plans" ("code", "name", "active") VALUES
('free', 'Terrain Detail Studio Free', true),
('individual_pro', 'Terrain Detail Studio Individual Pro', true)
ON CONFLICT ("code") DO NOTHING;

-- 2. Insert Features
INSERT INTO "features" ("code", "name", "active") VALUES
('md_hillshade', 'Multidirectional Hillshade', true),
('slope_texture', 'Slope Texture Derivative', true),
('local_relief', 'Gaussian Local Relief Model', true),
('cartographic_style', 'Cartographic Style & Grouping', true),
('preset_pro', 'Pro Cartographic Presets', true),
('batch_processing', 'Batch Folder Processing Queue', true),
('vrt_builder', 'Automatic VRT Builder', true)
ON CONFLICT ("code") DO NOTHING;

-- 3. Link Features to Plans
-- Free Plan features
INSERT INTO "plan_features" ("plan_id", "feature_id")
SELECT p.id, f.id FROM "plans" p, "features" f
WHERE p.code = 'free' AND f.code IN ('md_hillshade')
ON CONFLICT DO NOTHING;

-- Pro Plan features (All features)
INSERT INTO "plan_features" ("plan_id", "feature_id")
SELECT p.id, f.id FROM "plans" p, "features" f
WHERE p.code = 'individual_pro'
ON CONFLICT DO NOTHING;

-- 4. Insert Default Published Presets (v1.0.0)
INSERT INTO "presets" ("code", "name", "version", "required_features_json", "payload_json", "min_plugin_version", "status", "published_at") VALUES
(
  'balanced-detail',
  'Balanced Detail',
  '1.0.0',
  '["md_hillshade", "slope_texture", "local_relief", "cartographic_style"]'::jsonb,
  '{
    "code": "balanced-detail",
    "name": "Balanced Detail",
    "version": "1.0.0",
    "min_plugin_version": "1.0.0",
    "required_features": ["md_hillshade", "slope_texture", "local_relief", "cartographic_style"],
    "input_rules": {
      "band_count": 1,
      "horizontal_unit": "meter",
      "vertical_unit": "meter",
      "pixel_size_m": {"min": 0.1, "max": 2.0}
    },
    "pipeline": {
      "mdhs": {"method": "gdal_multidirectional", "altitude_deg": 45},
      "slope": {"unit": "degree", "output_dtype": "float32"},
      "local_relief": {
        "method": "dtm_minus_gaussian_smoothed_dtm",
        "algorithm_version": "lrm-gaussian-v1",
        "radius_m": 10,
        "sigma_mode": "radius_divided_by_3",
        "nodata_policy": "valid_cells_renormalized"
      }
    },
    "style": {
      "mdhs": {"blend_mode": "normal", "opacity_percent": 100},
      "slope": {"blend_mode": "multiply", "opacity_percent": 18},
      "lrm": {"blend_mode": "multiply", "opacity_percent": 25, "statistics_mode": "robust_percentile"}
    }
  }'::jsonb,
  '1.0.0',
  'published',
  NOW()
),
(
  'linear-feature',
  'Linear Feature (Drains, Roads, Bunds)',
  '1.0.0',
  '["md_hillshade", "slope_texture", "local_relief", "cartographic_style"]'::jsonb,
  '{
    "code": "linear-feature",
    "name": "Linear Feature",
    "version": "1.0.0",
    "min_plugin_version": "1.0.0",
    "required_features": ["md_hillshade", "slope_texture", "local_relief", "cartographic_style"],
    "input_rules": {
      "band_count": 1,
      "horizontal_unit": "meter",
      "vertical_unit": "meter",
      "pixel_size_m": {"min": 0.1, "max": 2.0}
    },
    "pipeline": {
      "mdhs": {"method": "gdal_multidirectional", "altitude_deg": 45},
      "slope": {"unit": "degree", "output_dtype": "float32"},
      "local_relief": {
        "method": "dtm_minus_gaussian_smoothed_dtm",
        "algorithm_version": "lrm-gaussian-v1",
        "radius_m": 20,
        "sigma_mode": "radius_divided_by_3",
        "nodata_policy": "valid_cells_renormalized"
      }
    },
    "style": {
      "mdhs": {"blend_mode": "normal", "opacity_percent": 100},
      "slope": {"blend_mode": "multiply", "opacity_percent": 30},
      "lrm": {"blend_mode": "multiply", "opacity_percent": 40, "statistics_mode": "robust_percentile"}
    }
  }'::jsonb,
  '1.0.0',
  'published',
  NOW()
),
(
  'subtle-basemap',
  'Subtle Basemap Relief',
  '1.0.0',
  '["md_hillshade", "slope_texture", "local_relief", "cartographic_style"]'::jsonb,
  '{
    "code": "subtle-basemap",
    "name": "Subtle Basemap",
    "version": "1.0.0",
    "min_plugin_version": "1.0.0",
    "required_features": ["md_hillshade", "slope_texture", "local_relief", "cartographic_style"],
    "input_rules": {
      "band_count": 1,
      "horizontal_unit": "meter",
      "vertical_unit": "meter",
      "pixel_size_m": {"min": 0.1, "max": 2.0}
    },
    "pipeline": {
      "mdhs": {"method": "gdal_multidirectional", "altitude_deg": 45},
      "slope": {"unit": "degree", "output_dtype": "float32"},
      "local_relief": {
        "method": "dtm_minus_gaussian_smoothed_dtm",
        "algorithm_version": "lrm-gaussian-v1",
        "radius_m": 6,
        "sigma_mode": "radius_divided_by_3",
        "nodata_policy": "valid_cells_renormalized"
      }
    },
    "style": {
      "mdhs": {"blend_mode": "normal", "opacity_percent": 100},
      "slope": {"blend_mode": "multiply", "opacity_percent": 10},
      "lrm": {"blend_mode": "multiply", "opacity_percent": 15, "statistics_mode": "robust_percentile"}
    }
  }'::jsonb,
  '1.0.0',
  'published',
  NOW()
)
ON CONFLICT ("code", "version") DO NOTHING;

-- 5. Insert Initial Plugin Release Manifest
INSERT INTO "plugin_releases" ("version", "min_qgis_version", "download_url", "sha256", "release_notes", "status", "published_at") VALUES
(
  '1.0.0',
  '3.28.0',
  'https://downloads.terraindetailstudio.com/releases/terrain_detail_studio-1.0.0.zip',
  '9a2ee35c2c49c768a13b663610e09db481d6b829b774aa47774df4d5321936f5',
  'Initial commercial v1.0.0 release of Terrain Detail Studio for QGIS.',
  'published',
  NOW()
)
ON CONFLICT ("version") DO NOTHING;
