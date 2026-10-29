# ⚡ TimeTable AI — Complete Dynamic Engineering College Timetable Management System

An automated, deterministic, constraint-based timetable scheduling and academic management platform engineered for engineering colleges and universities.

---

## 🏛️ System Architecture & Engineering Principles

### 1. Deterministic Constraint Satisfaction Engine (`schedulerEngine.js`)
* **Mathematical Reliability**: Schedule generation uses a deterministic Constraint Satisfaction Problem (CSP) solver with backtracking, forward checking, and Minimum Remaining Values (MRV) domain pruning.
* **Separation of Concerns**: Generative AI (Google Gemini) is utilized strictly in an advisory and explanatory role (explaining infeasibility diagnostics, formatting summaries). Deterministic code strictly evaluates, validates, and guarantees hard-constraint validity.
* **High Efficiency**: Generates conflict-free schedules in **< 1.5 seconds** without unpredictable LLM retries or manual drag-and-drop fixes.

### 2. Hierarchical Academic Scope
* Fully configurable hierarchy:
  $$\text{Institution} \longrightarrow \text{Academic Term} \longrightarrow \text{Department} \longrightarrow \text{Semester (1–8)} \longrightarrow \text{Division} \longrightarrow \text{Batch}$$
* **Departments**: Pre-seeded with CSE, AIML, ISE, ECE, ME, and CV, with full UI support to add custom departments.
* **Divisions & Batches**: Each division has independently configurable batch counts (e.g. `CSE-A` with `B1, B2`; `CSE-B` with `B1, B2, B3`). No hardcoded batch arrays.
* **Open & Professional Electives**: First-class support for parallel elective windows (different courses at same time with distinct faculty/rooms) and common institutional elective blocks.

### 3. Laboratory Scheduling Integrity
* **Atomic 2-Hour Blocks**: Labs span exactly two consecutive hours in pre-validated time windows without splitting across lunch or breaks.
* **Daily Lab Limit**: Enforces a configurable limit of **maximum one distinct laboratory session per day across all batches combined** for a given department, semester, and division (configurable via UI).
* **Batch Identity**: Prominently labels batch assignments (e.g., `Cryptography Lab — B1`, `Web Lab — B2`).

### 4. Centralized Validator & Quality Score Gating
* **Orthogonal Validator**: Evaluates every slot against all hard constraints (faculty clashes, room double-booking, batch collisions, workload limits, 2-hour lab continuity).
* **Score Gating**: If any hard constraint fails, the schedule is strictly scored **0 / INVALID**. High quality scores (e.g., 95/100) are withheld unless zero hard violations exist.
* **Automatic Repair Loop**: Automatically detects same-day batch lab violations or faculty clashes and reallocates them across available free windows.

### 5. Multi-View Viewer & University-Standard PDF Exports
* **Interactive Views**:
  - **Division Master View**: Complete class and lab schedule for the division.
  - **Batch-Specific View**: Personalized view filtering only classes relevant to a specific student batch (`B1`, `B2`, etc.).
  - **Room Utilization View**: Real-time room occupancy and utilization tracking.
* **Vector PDF Exports**: Generates official landscape timetables using `jsPDF` and `jspdf-autotable`, with merged 2-hour lab cells, break/lunch columns, faculty details, and course credit (L-T-P) summaries.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* **Supabase Project**

### 1. Installation
```bash
git clone https://github.com/AdityaSadalagi-02/TimeTable-AI.git
cd TimeTable-AI
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Provide your Supabase URL and anonymous key:
```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_KEY=your_supabase_anon_key
REACT_APP_GEMINI_KEY=your_gemini_api_key
REACT_APP_ADMIN_USER=admin
REACT_APP_ADMIN_PASS=admin123
```

### 3. Database Migration
Run `supabase_complete_schema.sql` in your Supabase SQL Editor.
This creates:
* `departments`, `academic_terms`, `divisions`, and `batches` tables with seed data.
* `subjects` table with `course_category` and `ltp` columns.
* `teachers`, `teacher_subjects`, and `teacher_availability`.
* `rooms`, `room_availability`, and `room_bookings`.
* `testconstraints` with configurable workload and lab limits.
* `saved_timetables` with division and batch persistence.
* Row Level Security (RLS) policies.

*(Note: The application includes local persistence fallbacks for seamless demo operation even before migrations are executed).*

### 4. Run Locally
```bash
npm start
```
The application will launch on [http://localhost:3000](http://localhost:3000).

### 5. Production Build
```bash
npm run build
```

---

## 🧪 Automated Test Suite

Run the full automated test suite:
```bash
npm test -- --watchAll=false
```

### Test Results
```text
PASS src/__tests__/scheduler.test.js
  Critical Scheduling Fix: One Lab Per Day Per Division and Semester
    √ 1. B1, B2, and B3 cannot each receive a lab on the same day for the same division and semester
    √ 2. A second lab session for the same division and semester on the same day is rejected even when it belongs to another batch
    √ 3. Labs for different divisions can run simultaneously when all resources are available
    √ 4. Labs for different semesters can run simultaneously when all resources are available
    √ 5. Shared teacher conflicts across divisions and semesters are rejected
    √ 6. Shared room conflicts across divisions and semesters are rejected
    √ 7. Every lab occupies exactly two consecutive hours (1-hr lab is invalid)
    √ 8. Every required weekly lab session is scheduled across distinct days
    √ 9. The timetable cannot be finalized if the daily lab limit is violated
    √ 10. The quality score is not presented as conflict-free when a hard constraint fails
    √ 11. The configured daily limit is enforced by both generation and validation
    √ 12. Existing saved timetables are checked when they share teachers, rooms, or student groups
    √ 13. Automatic repair reallocates same-day lab violations across available free days
    √ 14. Distinguish a proven infeasible configuration from search exhaustion

PASS src/__tests__/academicAndElectives.test.js
  Academic Structure Hierarchy & Elective Rules
    √ 1. Academic structure hierarchy loads departments, divisions, and batches
    √ 2. Divisions have independently configurable numbers of batches (CSE-A: 2, CSE-B: 3)
    √ 3. Parallel electives run in the same time slot with distinct rooms and teachers without conflict
    √ 4. Contradictory configuration detection: Weekly lab requirements exceeding available days
    √ 5. Quality score gating: Score MUST be 0 if validation fails

Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
Snapshots:   0 total
Time:        6.348 s
Ran all test suites.
```
