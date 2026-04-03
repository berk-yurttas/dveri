-- =============================================================================
-- Service status UI test seed (platform features + ServiceChecker endpoints)
-- =============================================================================
-- 1) Run the PLATFORM section against your main Dashboard DB (e.g. dt_report).
--    Set :platform_code to a platform you actually use (see: SELECT code FROM platforms;).
-- 2) Run the SERVICE_CHECKER section against the ServiceChecker PostgreSQL database
--    (same URLs as in theme_config so badges match).
-- 3) Ensure dtbackend/.env has SERVICE_CHECKER_BASE_URL pointing at ServiceChecker.
-- 4) Restart ServiceChecker or call POST /api/check-now so is_up is populated.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) MAIN APP DATABASE — merge test features into theme_config
-- ---------------------------------------------------------------------------
-- Pick your platform code:
--   romiot | deriniz | ivme | seyir | amom | ... (must exist in `platforms`)

UPDATE platforms
SET theme_config = jsonb_set(
  COALESCE(theme_config, '{}'::jsonb),
  '{features}',
  COALESCE(theme_config->'features', '[]'::jsonb) || '[
    {
      "title": "Service test — Example.com",
      "description": "Single external link (should show Çevrimiçi when up).",
      "url": "https://example.com",
      "icon": "Globe",
      "backgroundColor": "#EFF6FF",
      "iconColor": "#2563EB",
      "useImage": false,
      "underConstruction": false
    },
    {
      "title": "Service test — subfeatures",
      "description": "Click to expand; sub-cards use httpbin & Wikipedia.",
      "icon": "Layout",
      "backgroundColor": "#F0FDF4",
      "iconColor": "#16A34A",
      "useImage": false,
      "underConstruction": false,
      "subfeatures": [
        {
          "title": "HTTPBin (GET)",
          "description": "Public echo endpoint — good for health checks.",
          "url": "https://httpbin.org/get",
          "icon": "Zap"
        },
        {
          "title": "Wikipedia",
          "description": "Public site for UI testing.",
          "url": "https://www.wikipedia.org/",
          "icon": "Globe"
        }
      ]
    }
  ]'::jsonb,
  true
)
WHERE code = 'romiot';

-- If no row updated, change WHERE code = 'romiot' to your platform (SELECT code FROM platforms;).
-- To remove only these test cards later, edit theme_config JSON manually or restore from backup.


-- ---------------------------------------------------------------------------
-- B) SERVICE CHECKER DATABASE — same URLs as above (for badge matching)
-- ---------------------------------------------------------------------------
-- Connect to the DB used by ServiceChecker (DATABASE_URL in ServiceChecker .env),
-- e.g. postgresql://postgres:postgres@localhost:5432/servicechecker

DELETE FROM api_endpoints WHERE name LIKE 'Test seed:%';

INSERT INTO api_endpoints (name, url, http_method, is_active)
VALUES
  ('Test seed: example.com', 'https://example.com', 'GET', true),
  ('Test seed: httpbin', 'https://httpbin.org/get', 'GET', true),
  ('Test seed: wikipedia', 'https://www.wikipedia.org/', 'GET', true);
