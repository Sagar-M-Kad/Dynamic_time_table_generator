-- ============================================================
-- Phase 1 Migration: Add division & batch support
-- TimeTable AI — Run this in Supabase SQL Editor
-- ============================================================
-- IMPORTANT: Review each statement before running.
-- All changes use IF NOT EXISTS / safe defaults so existing
-- data is never overwritten or deleted.
-- ============================================================

-- 1. Add `division` column to saved_timetables
--    Stores the Section/Division (e.g. "Section A", "Section B")
ALTER TABLE saved_timetables
  ADD COLUMN IF NOT EXISTS division TEXT DEFAULT '';

-- 2. Add `division` column to subjects (optional — if you want
--    per-division subject lists in the future)
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS division TEXT DEFAULT '';

-- 3. Add `max_daily_hours` and `max_consecutive_hours` to testconstraints
--    so the validator can read them from the DB instead of localStorage
ALTER TABLE testconstraints
  ADD COLUMN IF NOT EXISTS max_daily_hours INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS max_consecutive_hours INTEGER DEFAULT 2;

-- 4. Create index on saved_timetables for fast division+semester lookups
CREATE INDEX IF NOT EXISTS idx_saved_timetables_division
  ON saved_timetables (semester, division);

-- 5. Create index on subjects for fast dept+semester+division lookups
CREATE INDEX IF NOT EXISTS idx_subjects_division
  ON subjects (department, semester, division);

-- ============================================================
-- VERIFICATION: Run these to confirm columns were added
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'saved_timetables' ORDER BY ordinal_position;
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'subjects' ORDER BY ordinal_position;
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'testconstraints' ORDER BY ordinal_position;
