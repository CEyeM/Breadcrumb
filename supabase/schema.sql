-- LiveLog database schema
-- Plak dit in de Supabase SQL Editor en voer uit

-- ── SESSIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  operator    TEXT NOT NULL DEFAULT '',
  fps         INT  NOT NULL DEFAULT 25,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gebruikers beheren eigen sessies"
  ON sessions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── LOG ENTRIES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS log_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timecode    TEXT NOT NULL,
  elapsed_s   NUMERIC(10,3) NOT NULL DEFAULT 0,
  note        TEXT NOT NULL,
  wall_time   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE log_entries ENABLE ROW LEVEL SECURITY;

-- Lezen: alleen als de bijbehorende sessie van jou is
CREATE POLICY "Lees eigen log entries"
  ON log_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = log_entries.session_id
        AND sessions.user_id = auth.uid()
    )
  );

-- Schrijven: alleen als de bijbehorende sessie van jou is
CREATE POLICY "Schrijf naar eigen sessie"
  ON log_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = log_entries.session_id
        AND sessions.user_id = auth.uid()
    )
  );

-- Verwijderen: alleen eigen entries
CREATE POLICY "Verwijder eigen entries"
  ON log_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = log_entries.session_id
        AND sessions.user_id = auth.uid()
    )
  );

-- ── REALTIME ─────────────────────────────────────────────────────────
-- Zet Realtime aan voor log_entries in het Supabase dashboard:
-- Database → Replication → log_entries → enable INSERT en DELETE
--
-- Of via SQL (alleen voor Supabase-projecten met de replication extension):
-- ALTER PUBLICATION supabase_realtime ADD TABLE log_entries;
