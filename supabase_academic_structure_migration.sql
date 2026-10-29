-- ============================================================================
-- TIME TABLE AI: Comprehensive Academic Structure & Constraint Migration
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- All operations are safe and idempotent (IF NOT EXISTS guards).
-- ============================================================================

-- 1. DEPARTMENTS TABLE
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Default Departments
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

-- 2. DIVISIONS TABLE
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

-- Seed Default Divisions for CSE & AIML & ISE
INSERT INTO divisions (id, department_code, semester, name, is_active)
VALUES
  -- CSE Semesters
  ('div-cse-5-a', 'CSE', 5, 'CSE-A', TRUE),
  ('div-cse-5-b', 'CSE', 5, 'CSE-B', TRUE),
  ('div-cse-6-a', 'CSE', 6, 'CSE-A', TRUE),
  ('div-cse-6-b', 'CSE', 6, 'CSE-B', TRUE),
  ('div-cse-7-a', 'CSE', 7, 'CSE-A', TRUE),
  ('div-cse-7-b', 'CSE', 7, 'CSE-B', TRUE),
  -- AIML Semesters
  ('div-aiml-5-a', 'AIML', 5, 'AIML-A', TRUE),
  ('div-aiml-6-a', 'AIML', 6, 'AIML-A', TRUE),
  ('div-aiml-7-a', 'AIML', 7, 'AIML-A', TRUE),
  -- ISE Semesters
  ('div-ise-6-a', 'ISE', 6, 'ISE-A', TRUE),
  ('div-ise-6-b', 'ISE', 6, 'ISE-B', TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- 3. BATCHES TABLE (Per-Division Lab Batches: B1, B2, B3, etc.)
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

-- Seed Default Lab Batches (Configurable per division)
INSERT INTO batches (id, division_id, name, is_active)
VALUES
  -- CSE-A Sem 5 (2 batches: B1, B2)
  ('batch-cse-5-a-b1', 'div-cse-5-a', 'B1', TRUE),
  ('batch-cse-5-a-b2', 'div-cse-5-a', 'B2', TRUE),
  -- CSE-B Sem 5 (3 batches: B1, B2, B3)
  ('batch-cse-5-b-b1', 'div-cse-5-b', 'B1', TRUE),
  ('batch-cse-5-b-b2', 'div-cse-5-b', 'B2', TRUE),
  ('batch-cse-5-b-b3', 'div-cse-5-b', 'B3', TRUE),
  -- CSE-A Sem 6 (2 batches: B1, B2)
  ('batch-cse-6-a-b1', 'div-cse-6-a', 'B1', TRUE),
  ('batch-cse-6-a-b2', 'div-cse-6-a', 'B2', TRUE),
  -- CSE-B Sem 6 (3 batches: B1, B2, B3)
  ('batch-cse-6-b-b1', 'div-cse-6-b', 'B1', TRUE),
  ('batch-cse-6-b-b2', 'div-cse-6-b', 'B2', TRUE),
  ('batch-cse-6-b-b3', 'div-cse-6-b', 'B3', TRUE),
  -- CSE-A Sem 7 (2 batches)
  ('batch-cse-7-a-b1', 'div-cse-7-a', 'B1', TRUE),
  ('batch-cse-7-a-b2', 'div-cse-7-a', 'B2', TRUE),
  -- CSE-B Sem 7 (3 batches)
  ('batch-cse-7-b-b1', 'div-cse-7-b', 'B1', TRUE),
  ('batch-cse-7-b-b2', 'div-cse-7-b', 'B2', TRUE),
  ('batch-cse-7-b-b3', 'div-cse-7-b', 'B3', TRUE),
  -- AIML-A Sem 5 & 6 (2 batches)
  ('batch-aiml-5-a-b1', 'div-aiml-5-a', 'B1', TRUE),
  ('batch-aiml-5-a-b2', 'div-aiml-5-a', 'B2', TRUE),
  ('batch-aiml-6-a-b1', 'div-aiml-6-a', 'B1', TRUE),
  ('batch-aiml-6-a-b2', 'div-aiml-6-a', 'B2', TRUE),
  -- ISE Sem 6
  ('batch-ise-6-a-b1', 'div-ise-6-a', 'B1', TRUE),
  ('batch-ise-6-a-b2', 'div-ise-6-a', 'B2', TRUE),
  ('batch-ise-6-b-b1', 'div-ise-6-b', 'B1', TRUE),
  ('batch-ise-6-b-b2', 'div-ise-6-b', 'B2', TRUE),
  ('batch-ise-6-b-b3', 'div-ise-6-b', 'B3', TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- 4. SAVED TIMETABLES ENHANCEMENTS
ALTER TABLE saved_timetables
  ADD COLUMN IF NOT EXISTS division TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS batches JSONB DEFAULT '[]'::jsonb;

-- 5. TESTCONSTRAINTS WORKLOAD & LAB LIMITS
ALTER TABLE testconstraints
  ADD COLUMN IF NOT EXISTS max_daily_hours INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS max_consecutive_hours INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_division_daily_labs INTEGER DEFAULT 1;

-- 6. ELECTIVE GROUPS & MANDATORY ENROLLMENT CONSTRAINTS
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

-- Course Offerings referencing canonical courses
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

-- Student Cohorts (for cohort-based grouping when individual student data is not available)
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

-- Students (Individual enrollment data)
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

-- Student Elective Enrollments
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

-- Cohort Elective Enrollments
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

-- 7. ENABLE ROW LEVEL SECURITY SAFELY
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE elective_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_elective_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_elective_enrollments ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for local demo/admin access
CREATE POLICY IF NOT EXISTS "Allow all for departments" ON departments FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for divisions" ON divisions FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for batches" ON batches FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for elective_groups" ON elective_groups FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for course_offerings" ON course_offerings FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for student_cohorts" ON student_cohorts FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for students" ON students FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for student_elective_enrollments" ON student_elective_enrollments FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for cohort_elective_enrollments" ON cohort_elective_enrollments FOR ALL USING (true);

