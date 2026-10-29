-- ============================================================================
-- TIMETABLE AI: Complete Unified PostgreSQL Database Migration Schema
-- Suitable for Supabase SQL Editor. Fully idempotent with IF NOT EXISTS guards.
-- ============================================================================

-- 1. DEPARTMENTS
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Initial Departments
INSERT INTO departments (id, code, name, is_active)
VALUES
  ('dept-cse', 'CSE', 'Computer Science & Engineering', TRUE),
  ('dept-aiml', 'AIML', 'Artificial Intelligence & Machine Learning', TRUE),
  ('dept-ise', 'ISE', 'Information Science & Engineering', TRUE),
  ('dept-ece', 'ECE', 'Electronics & Communication Engineering', TRUE),
  ('dept-me', 'ME', 'Mechanical Engineering', TRUE),
  ('dept-cv', 'CV', 'Civil Engineering', TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- 2. ACADEMIC TERMS
CREATE TABLE IF NOT EXISTS academic_terms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO academic_terms (id, name, is_current)
VALUES
  ('term-2024-odd', '2024–2025 Odd Semester (Aug–Dec)', TRUE),
  ('term-2024-even', '2024–2025 Even Semester (Jan–May)', FALSE),
  ('term-2025-odd', '2025–2026 Odd Semester (Aug–Dec)', FALSE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_current = EXCLUDED.is_current;

-- 3. DIVISIONS
CREATE TABLE IF NOT EXISTS divisions (
  id TEXT PRIMARY KEY,
  department_code TEXT NOT NULL,
  semester INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_dept_sem_div UNIQUE (department_code, semester, name)
);

CREATE INDEX IF NOT EXISTS idx_divisions_scope
  ON divisions (department_code, semester);

INSERT INTO divisions (id, department_code, semester, name, is_active)
VALUES
  ('div-cse-5-a', 'CSE', 5, 'CSE-A', TRUE),
  ('div-cse-5-b', 'CSE', 5, 'CSE-B', TRUE),
  ('div-cse-6-a', 'CSE', 6, 'CSE-A', TRUE),
  ('div-cse-6-b', 'CSE', 6, 'CSE-B', TRUE),
  ('div-cse-7-a', 'CSE', 7, 'CSE-A', TRUE),
  ('div-cse-7-b', 'CSE', 7, 'CSE-B', TRUE),
  ('div-aiml-5-a', 'AIML', 5, 'AIML-A', TRUE),
  ('div-aiml-6-a', 'AIML', 6, 'AIML-A', TRUE),
  ('div-aiml-7-a', 'AIML', 7, 'AIML-A', TRUE),
  ('div-ise-6-a', 'ISE', 6, 'ISE-A', TRUE),
  ('div-ise-6-b', 'ISE', 6, 'ISE-B', TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- 4. BATCHES (Per-Division Lab Batches)
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_division_batch UNIQUE (division_id, name)
);

CREATE INDEX IF NOT EXISTS idx_batches_division
  ON batches (division_id);

INSERT INTO batches (id, division_id, name, is_active)
VALUES
  ('batch-cse-5-a-b1', 'div-cse-5-a', 'B1', TRUE),
  ('batch-cse-5-a-b2', 'div-cse-5-a', 'B2', TRUE),
  ('batch-cse-5-b-b1', 'div-cse-5-b', 'B1', TRUE),
  ('batch-cse-5-b-b2', 'div-cse-5-b', 'B2', TRUE),
  ('batch-cse-5-b-b3', 'div-cse-5-b', 'B3', TRUE),
  ('batch-cse-6-a-b1', 'div-cse-6-a', 'B1', TRUE),
  ('batch-cse-6-a-b2', 'div-cse-6-a', 'B2', TRUE),
  ('batch-cse-6-b-b1', 'div-cse-6-b', 'B1', TRUE),
  ('batch-cse-6-b-b2', 'div-cse-6-b', 'B2', TRUE),
  ('batch-cse-6-b-b3', 'div-cse-6-b', 'B3', TRUE),
  ('batch-cse-7-a-b1', 'div-cse-7-a', 'B1', TRUE),
  ('batch-cse-7-a-b2', 'div-cse-7-a', 'B2', TRUE),
  ('batch-cse-7-b-b1', 'div-cse-7-b', 'B1', TRUE),
  ('batch-cse-7-b-b2', 'div-cse-7-b', 'B2', TRUE),
  ('batch-cse-7-b-b3', 'div-cse-7-b', 'B3', TRUE),
  ('batch-aiml-5-a-b1', 'div-aiml-5-a', 'B1', TRUE),
  ('batch-aiml-5-a-b2', 'div-aiml-5-a', 'B2', TRUE),
  ('batch-aiml-6-a-b1', 'div-aiml-6-a', 'B1', TRUE),
  ('batch-aiml-6-a-b2', 'div-aiml-6-a', 'B2', TRUE),
  ('batch-ise-6-a-b1', 'div-ise-6-a', 'B1', TRUE),
  ('batch-ise-6-a-b2', 'div-ise-6-a', 'B2', TRUE),
  ('batch-ise-6-b-b1', 'div-ise-6-b', 'B1', TRUE),
  ('batch-ise-6-b-b2', 'div-ise-6-b', 'B2', TRUE),
  ('batch-ise-6-b-b3', 'div-ise-6-b', 'B3', TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- 5. ELECTIVE GROUPS
CREATE TABLE IF NOT EXISTS elective_groups (
  id TEXT PRIMARY KEY,
  department_code TEXT NOT NULL,
  semester INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'parallel', -- 'parallel' or 'common'
  academic_term TEXT DEFAULT 'term-2024-odd',
  weekly_hours INTEGER DEFAULT 3,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Initial Elective Groups
INSERT INTO elective_groups (id, department_code, semester, name, type, academic_term, weekly_hours, description)
VALUES
  ('elec-cse-7-pe3', 'CSE', 7, 'Professional Elective - III', 'parallel', 'term-2024-odd', 3, 'Parallel run: 3 separate course offerings with individual faculty & rooms'),
  ('elec-all-7-oe2', 'ALL', 7, 'Open Elective - II', 'common', 'term-2024-odd', 3, 'Common institutional elective block scheduled across departments')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  weekly_hours = EXCLUDED.weekly_hours;

-- 5b. COURSE OFFERINGS (Referencing canonical course ID; never free-form comma strings)
CREATE TABLE IF NOT EXISTS course_offerings (
  id TEXT PRIMARY KEY,
  elective_group_id TEXT NOT NULL REFERENCES elective_groups(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL,
  subject_code TEXT,
  subject_name TEXT NOT NULL,
  teacher_id TEXT,
  room_id TEXT,
  capacity INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_group_course UNIQUE (elective_group_id, course_id)
);

-- 5c. STUDENT COHORTS (For cohort-based enrollment when individual student data is not available)
CREATE TABLE IF NOT EXISTS student_cohorts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department_code TEXT NOT NULL,
  semester INTEGER NOT NULL,
  division_id TEXT REFERENCES divisions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO student_cohorts (id, name, department_code, semester, division_id)
VALUES
  ('cohort-cse-7-a-c1', 'Cohort A1', 'CSE', 7, 'div-cse-7-a'),
  ('cohort-cse-7-a-c2', 'Cohort A2', 'CSE', 7, 'div-cse-7-a'),
  ('cohort-cse-7-a-c3', 'Cohort A3', 'CSE', 7, 'div-cse-7-a')
ON CONFLICT (id) DO NOTHING;

-- 5d. STUDENTS (Individual enrollment data)
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  usn TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  department_code TEXT NOT NULL,
  semester INTEGER NOT NULL,
  division_id TEXT REFERENCES divisions(id) ON DELETE SET NULL,
  cohort_id TEXT REFERENCES student_cohorts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO students (id, usn, name, department_code, semester, division_id, cohort_id)
VALUES
  ('stu-cse-7-001', '1CR21CS001', 'Aarav Sharma', 'CSE', 7, 'div-cse-7-a', 'cohort-cse-7-a-c1'),
  ('stu-cse-7-002', '1CR21CS002', 'Aditi Rao', 'CSE', 7, 'div-cse-7-a', 'cohort-cse-7-a-c1'),
  ('stu-cse-7-003', '1CR21CS003', 'Bhavya Patel', 'CSE', 7, 'div-cse-7-a', 'cohort-cse-7-a-c2'),
  ('stu-cse-7-004', '1CR21CS004', 'Chirag Hegde', 'CSE', 7, 'div-cse-7-a', 'cohort-cse-7-a-c2'),
  ('stu-cse-7-005', '1CR21CS005', 'Deepak Kumar', 'CSE', 7, 'div-cse-7-a', 'cohort-cse-7-a-c3'),
  ('stu-cse-7-006', '1CR21CS006', 'Divya Nair', 'CSE', 7, 'div-cse-7-a', 'cohort-cse-7-a-c3')
ON CONFLICT (id) DO NOTHING;

-- 5e. STUDENT ELECTIVE ENROLLMENTS
-- MANDATORY DATABASE CONSTRAINT: A student may enroll in only ONE course offering per group per academic term
CREATE TABLE IF NOT EXISTS student_elective_enrollments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  elective_group_id TEXT NOT NULL REFERENCES elective_groups(id) ON DELETE CASCADE,
  course_offering_id TEXT NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  academic_term TEXT NOT NULL DEFAULT 'term-2024-odd',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_student_elective_group UNIQUE (student_id, elective_group_id, academic_term)
);

-- 5f. COHORT ELECTIVE ENROLLMENTS
-- MANDATORY DATABASE CONSTRAINT: A cohort may be assigned to only ONE course offering per group per academic term
CREATE TABLE IF NOT EXISTS cohort_elective_enrollments (
  id TEXT PRIMARY KEY,
  cohort_id TEXT NOT NULL REFERENCES student_cohorts(id) ON DELETE CASCADE,
  elective_group_id TEXT NOT NULL REFERENCES elective_groups(id) ON DELETE CASCADE,
  course_offering_id TEXT NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  academic_term TEXT NOT NULL DEFAULT 'term-2024-odd',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_cohort_elective_group UNIQUE (cohort_id, elective_group_id, academic_term)
);

-- 6. SUBJECTS (With Category and LTP Support)
CREATE TABLE IF NOT EXISTS subjects (
  id BIGSERIAL PRIMARY KEY,
  subject_name TEXT NOT NULL,
  subject_code TEXT,
  weekly_hours NUMERIC DEFAULT 4,
  is_lab BOOLEAN DEFAULT FALSE,
  semester INTEGER NOT NULL,
  department TEXT NOT NULL,
  division TEXT DEFAULT '',
  course_category TEXT DEFAULT 'Theory',
  ltp TEXT DEFAULT '3-0-0',
  elective_group_id TEXT REFERENCES elective_groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS division TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS course_category TEXT DEFAULT 'Theory',
  ADD COLUMN IF NOT EXISTS ltp TEXT DEFAULT '3-0-0',
  ADD COLUMN IF NOT EXISTS elective_group_id TEXT;

CREATE INDEX IF NOT EXISTS idx_subjects_scope
  ON subjects (department, semester);

-- 7. TEACHERS & ASSIGNMENTS
CREATE TABLE IF NOT EXISTS teachers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  email TEXT,
  max_weekly_hours INTEGER DEFAULT 18,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id BIGINT REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_teacher_subject UNIQUE (teacher_id, subject_id)
);

CREATE TABLE IF NOT EXISTS teacher_availability (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  semester_id INTEGER,
  is_busy BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_teacher_slot UNIQUE (teacher_id, day_of_week, time_slot)
);

-- 8. ROOMS & BOOKINGS
CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  room_name TEXT UNIQUE NOT NULL,
  room_type TEXT NOT NULL, -- 'theory' or 'lab'
  capacity INTEGER DEFAULT 60,
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_availability (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  semester_id INTEGER,
  is_busy BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_room_slot UNIQUE (room_id, day_of_week, time_slot)
);

CREATE TABLE IF NOT EXISTS room_bookings (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  timetable_id BIGINT,
  day_of_week TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  subject_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. DYNAMIC CONSTRAINTS CONFIGURATION
CREATE TABLE IF NOT EXISTS testconstraints (
  id SERIAL PRIMARY KEY,
  start_hour INTEGER DEFAULT 9,
  start_min INTEGER DEFAULT 0,
  end_hour INTEGER DEFAULT 17,
  end_min INTEGER DEFAULT 0,
  period_duration NUMERIC DEFAULT 1,
  lab_duration NUMERIC DEFAULT 2,
  lunch_hour INTEGER DEFAULT 13,
  lunch_min INTEGER DEFAULT 0,
  lunch_duration NUMERIC DEFAULT 1,
  break_hour INTEGER DEFAULT 11,
  break_min INTEGER DEFAULT 0,
  break_duration NUMERIC DEFAULT 0.5,
  max_teacher_daily_hours INTEGER DEFAULT 4,
  max_teacher_consecutive_hours INTEGER DEFAULT 2,
  max_division_daily_labs INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE testconstraints
  ADD COLUMN IF NOT EXISTS max_daily_hours INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS max_consecutive_hours INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_division_daily_labs INTEGER DEFAULT 1;

-- Seed default institutional constraints row (id: 1)
INSERT INTO testconstraints (
  id, start_hour, start_min, end_hour, end_min, period_duration, lab_duration,
  lunch_hour, lunch_min, lunch_duration, break_hour, break_min, break_duration,
  max_teacher_daily_hours, max_teacher_consecutive_hours, max_division_daily_labs
)
VALUES (1, 9, 0, 17, 0, 1, 2, 13, 0, 1, 11, 0, 0.5, 4, 2, 1)
ON CONFLICT (id) DO NOTHING;

-- 10. SAVED TIMETABLES
CREATE TABLE IF NOT EXISTS saved_timetables (
  id BIGSERIAL PRIMARY KEY,
  department TEXT NOT NULL,
  semester INTEGER NOT NULL,
  division TEXT DEFAULT '',
  batches JSONB DEFAULT '[]'::jsonb,
  timetable_json JSONB NOT NULL,
  theory_room TEXT DEFAULT '',
  lab_rooms JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE saved_timetables
  ADD COLUMN IF NOT EXISTS division TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS batches JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS theory_room TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS lab_rooms JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_saved_timetables_lookup
  ON saved_timetables (semester, division);

-- 11. ROW LEVEL SECURITY (RLS)
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE elective_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE testconstraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_elective_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_elective_enrollments ENABLE ROW LEVEL SECURITY;

-- Permissive administrative demo policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for departments') THEN
    CREATE POLICY "Allow all for departments" ON departments FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for divisions') THEN
    CREATE POLICY "Allow all for divisions" ON divisions FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for batches') THEN
    CREATE POLICY "Allow all for batches" ON batches FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for elective_groups') THEN
    CREATE POLICY "Allow all for elective_groups" ON elective_groups FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for course_offerings') THEN
    CREATE POLICY "Allow all for course_offerings" ON course_offerings FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for student_cohorts') THEN
    CREATE POLICY "Allow all for student_cohorts" ON student_cohorts FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for students') THEN
    CREATE POLICY "Allow all for students" ON students FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for student_elective_enrollments') THEN
    CREATE POLICY "Allow all for student_elective_enrollments" ON student_elective_enrollments FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for cohort_elective_enrollments') THEN
    CREATE POLICY "Allow all for cohort_elective_enrollments" ON cohort_elective_enrollments FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for subjects') THEN
    CREATE POLICY "Allow all for subjects" ON subjects FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for teachers') THEN
    CREATE POLICY "Allow all for teachers" ON teachers FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for rooms') THEN
    CREATE POLICY "Allow all for rooms" ON rooms FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for saved_timetables') THEN
    CREATE POLICY "Allow all for saved_timetables" ON saved_timetables FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for testconstraints') THEN
    CREATE POLICY "Allow all for testconstraints" ON testconstraints FOR ALL USING (true);
  END IF;
END $$;

