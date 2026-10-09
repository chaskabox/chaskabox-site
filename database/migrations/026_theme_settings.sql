-- ChaskaBox Theme Settings (key-value store)
-- Stores design tokens: colors, fonts, logo, spacing, header/footer options.

CREATE TABLE IF NOT EXISTS theme_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE theme_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS theme_service_all ON theme_settings;
CREATE POLICY theme_service_all ON theme_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Defaults (match current site design)
INSERT INTO theme_settings (key, value) VALUES
('primary_color', '#1a2b5c'),
('accent_color', '#f59e0b'),
('background_color', '#ffffff'),
('text_color', '#1f2937'),
('font_family', 'system-ui'),
('border_radius', '12'),
('logo_url', '/logo.png'),
('favicon_url', '/favicon.ico'),
('header_style', 'standard'),
('announcement_text', ''),
('announcement_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
