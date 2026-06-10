-- Migratie: RESET-timer sync tussen apparaten
-- Plak dit in de Supabase SQL Editor en voer uit

-- Kolom voor het moment waarop de sessietimer (opnieuw) gestart is.
-- NULL = timer loopt vanaf created_at (oude gedrag).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ;

-- Realtime aanzetten voor sessions zodat reset en fps-wijzigingen
-- direct doorkomen op andere apparaten
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
