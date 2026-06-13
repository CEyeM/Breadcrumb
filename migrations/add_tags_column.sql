-- Voer uit in de Supabase SQL editor
-- Project: xbpkspxpxfeubdurvmpg

ALTER TABLE log_entries
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
