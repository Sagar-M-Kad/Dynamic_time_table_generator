/**
 * TimeTable AI — Comprehensive Regression & Constraint Test Suite
 * Strictly validates all 12 requirements from "Critical Scheduling Fix: One Lab Per Day Per Division and Semester"
 */

import {
  getConsecutiveLabWindows,
  validateSchedule,
  calculateTimetableQualityScore,
  generateDeterministicTimetable,
  repairSchedule,
  DAYS,
} from "../services/schedulerEngine";

import {
  getLocalAcademicStructure,
  getDivisionsForScope,
  getBatchesForDivision,
} from "../services/academicStructureService";

import { createSlotsWithBreaks } from "../services/aiService";

// Mock timing constraints
const mockConstraints = {
  start_hour: 9,
  start_min: 0,
  end_hour: 17,
  end_min: 0,
  lunch_hour: 13,
  lunch_min: 0,
  lunch_duration: 1,
  break_hour: 11,
  break_min: 0,
  break_duration: 0.5,
  period_duration: 1,
  lab_duration: 2,
  max_daily_hours: 4,
  max_consecutive_hours: 2,
  max_division_daily_labs: 1, // Default mandatory limit: 1 lab session/day across all batches combined
};

describe("Critical Scheduling Fix: One Lab Per Day Per Division and Semester", () => {
  let slots;
  let classSlotLabels;

  beforeAll(() => {
    slots = createSlotsWithBreaks(mockConstraints);
    classSlotLabels = slots.filter((s) => s.type === "class").map((s) => s.label);
  });

  // ── TEST 1: B1, B2, B3 CANNOT RECEIVE LAB ON SAME DAY FOR SAME DIVISION ─────────────
  test("1. B1, B2, and B3 cannot each receive a lab on the same day for the same division and semester", () => {
    const testTT = {};
    DAYS.forEach((d) => {
      testTT[d] = {};
      classSlotLabels.forEach((sl) => (testTT[d][sl] = "-"));
    });

    const s0 = classSlotLabels[0];
    const s1 = classSlotLabels[1];

    // Monday schedule with B1, B2, and B3 performing labs simultaneously or sequentially
    testTT["Monday"][s0] = {
      is_lab: true,
      batch_labs: [
        { subject_name: "Cryptography Lab", batch: "B1", room: "Lab 1", is_block_start: true },
        { subject_name: "Cryptography Lab", batch: "B2", room: "Lab 2", is_block_start: true },
        { subject_name: "Cryptography Lab", batch: "B3", room: "Lab 3", is_block_start: true },
      ],
    };
    testTT["Monday"][s1] = {
      is_lab: true,
      batch_labs: [
        { subject_name: "Cryptography Lab", batch: "B1", room: "Lab 1", is_block_start: false },
        { subject_name: "Cryptography Lab", batch: "B2", room: "Lab 2", is_block_start: false },
        { subject_name: "Cryptography Lab", batch: "B3", room: "Lab 3", is_block_start: false },
      ],
    };

    const result = validateSchedule({
      timetable: testTT,
      subjects: [{ subject_name: "Cryptography Lab", is_lab: true, weekly_hours: 2 }],
      slots,
      constraints: mockConstraints,
      batches: ["B1", "B2", "B3"],
      division: "CSE-B",
      semester: 7,
      department: "CSE",
    });

    // Must be rejected as INVALID because Monday has 3 lab sessions across batches combined
    expect(result.isValid).toBe(false);
    const violation = result.violations.find((v) => v.code === "MAX_DIVISION_DAILY_LABS_EXCEEDED");
    expect(violation).toBeDefined();
    expect(violation.day).toBe("Monday");
    expect(violation.count).toBe(3);
    expect(violation.limit).toBe(1);
    expect(violation.batches).toEqual(["B1", "B2", "B3"]);
  });

  // ── TEST 2: SECOND LAB SESSION REJECTED EVEN FOR ANOTHER BATCH ─────────────────
  test("2. A second lab session for the same division and semester on the same day is rejected even when it belongs to another batch", () => {
    const testTT = {};
    DAYS.forEach((d) => {
      testTT[d] = {};
      classSlotLabels.forEach((sl) => (testTT[d][sl] = "-"));
    });

    // Session 1: Batch B1 in slots 0 & 1
    testTT["Monday"][classSlotLabels[0]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Compiler Lab", batch: "B1", room: "Lab 1", is_block_start: true }],
    };
    testTT["Monday"][classSlotLabels[1]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Compiler Lab", batch: "B1", room: "Lab 1", is_block_start: false }],
    };

    // Session 2: Batch B2 in slots 2 & 3 on the SAME DAY
    testTT["Monday"][classSlotLabels[2]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Compiler Lab", batch: "B2", room: "Lab 2", is_block_start: true }],
    };
    testTT["Monday"][classSlotLabels[3]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Compiler Lab", batch: "B2", room: "Lab 2", is_block_start: false }],
    };

    const result = validateSchedule({
      timetable: testTT,
      subjects: [{ subject_name: "Compiler Lab", is_lab: true, weekly_hours: 2 }],
      slots,
      constraints: { max_division_daily_labs: 1 },
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 6,
    });

    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.code === "MAX_DIVISION_DAILY_LABS_EXCEEDED")).toBe(true);
  });

  // ── TEST 3: DIFFERENT DIVISIONS CAN RUN LABS SIMULTANEOUSLY ───────────────────
  test("3. Labs for different divisions can run simultaneously when all resources are available", () => {
    const ttDivA = {};
    DAYS.forEach((d) => {
      ttDivA[d] = {};
      classSlotLabels.forEach((sl) => (ttDivA[d][sl] = "-"));
    });

    const s0 = classSlotLabels[0];
    const s1 = classSlotLabels[1];

    // Division A has Lab in Lab 1 with Teacher A on Monday at s0-s1
    ttDivA["Monday"][s0] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Web Lab", batch: "B1", room: "Lab 1", teacher_id: "teacher-A", is_block_start: true }],
    };
    ttDivA["Monday"][s1] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Web Lab", batch: "B1", room: "Lab 1", teacher_id: "teacher-A", is_block_start: false }],
    };

    // Division B's timetable has Lab in Lab 2 with Teacher B on Monday at the exact same time
    const existingSavedDivB = [
      {
        department: "CSE",
        semester: 6,
        division: "CSE-B",
        timetable_json: {
          Monday: {
            [s0]: { is_lab: true, batch_labs: [{ subject_name: "AI Lab", batch: "B1", room: "Lab 2", teacher_id: "teacher-B" }] },
            [s1]: { is_lab: true, batch_labs: [{ subject_name: "AI Lab", batch: "B1", room: "Lab 2", teacher_id: "teacher-B" }] },
          },
        },
      },
    ];

    const result = validateSchedule({
      timetable: ttDivA,
      subjects: [{ subject_name: "Web Lab", is_lab: true, weekly_hours: 2 }],
      slots,
      constraints: mockConstraints,
      teacherLinks: [{ teacher_id: "teacher-A", subjects: { subject_name: "Web Lab" } }],
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 6,
      existingOtherTimetables: existingSavedDivB,
    });

    // Should pass: distinct division, distinct room (Lab 1 vs Lab 2), distinct teacher (A vs B)
    expect(result.isValid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  // ── TEST 4: DIFFERENT SEMESTERS CAN RUN LABS SIMULTANEOUSLY ───────────────────
  test("4. Labs for different semesters can run simultaneously when all resources are available", () => {
    const ttSem5 = {};
    DAYS.forEach((d) => {
      ttSem5[d] = {};
      classSlotLabels.forEach((sl) => (ttSem5[d][sl] = "-"));
    });

    const s0 = classSlotLabels[0];
    const s1 = classSlotLabels[1];

    // Sem 5 uses Lab 1 with Teacher 5
    ttSem5["Tuesday"][s0] = {
      is_lab: true,
      batch_labs: [{ subject_name: "DBMS Lab", batch: "B1", room: "Lab 1", teacher_id: "t-sem5", is_block_start: true }],
    };
    ttSem5["Tuesday"][s1] = {
      is_lab: true,
      batch_labs: [{ subject_name: "DBMS Lab", batch: "B1", room: "Lab 1", teacher_id: "t-sem5", is_block_start: false }],
    };

    // Sem 7 uses Lab 2 with Teacher 7 simultaneously on Tuesday
    const savedSem7 = [
      {
        department: "CSE",
        semester: 7,
        division: "CSE-A",
        timetable_json: {
          Tuesday: {
            [s0]: { is_lab: true, batch_labs: [{ subject_name: "Cloud Lab", batch: "B1", room: "Lab 2", teacher_id: "t-sem7" }] },
            [s1]: { is_lab: true, batch_labs: [{ subject_name: "Cloud Lab", batch: "B1", room: "Lab 2", teacher_id: "t-sem7" }] },
          },
        },
      },
    ];

    const result = validateSchedule({
      timetable: ttSem5,
      subjects: [{ subject_name: "DBMS Lab", is_lab: true, weekly_hours: 2 }],
      slots,
      constraints: mockConstraints,
      teacherLinks: [{ teacher_id: "t-sem5", subjects: { subject_name: "DBMS Lab" } }],
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 5,
      existingOtherTimetables: savedSem7,
    });

    expect(result.isValid).toBe(true);
  });

  // ── TEST 5: SHARED TEACHER CONFLICTS ACROSS DIVISIONS/SEMESTERS REJECTED ──────
  test("5. Shared teacher conflicts across divisions and semesters are rejected", () => {
    const tt = {};
    DAYS.forEach((d) => {
      tt[d] = {};
      classSlotLabels.forEach((sl) => (tt[d][sl] = "-"));
    });

    const s0 = classSlotLabels[0];
    tt["Wednesday"][s0] = {
      subject_name: "Computer Networks",
      is_lab: false,
      teacher_id: "prof-sharma",
    };

    const savedOtherDept = [
      {
        department: "ISE",
        semester: 6,
        division: "ISE-A",
        timetable_json: {
          Wednesday: {
            [s0]: { subject_name: "Operating Systems", teacher_id: "prof-sharma" },
          },
        },
      },
    ];

    const result = validateSchedule({
      timetable: tt,
      subjects: [{ subject_name: "Computer Networks", is_lab: false, weekly_hours: 4 }],
      slots,
      teacherLinks: [{ teacher_id: "prof-sharma", subjects: { subject_name: "Computer Networks" } }],
      existingOtherTimetables: savedOtherDept,
    });

    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.code === "CROSS_DIVISION_CONFLICT")).toBe(true);
  });

  // ── TEST 6: SHARED ROOM CONFLICTS ACROSS DIVISIONS/SEMESTERS REJECTED ─────────
  test("6. Shared room conflicts across divisions and semesters are rejected", () => {
    const tt = {};
    DAYS.forEach((d) => {
      tt[d] = {};
      classSlotLabels.forEach((sl) => (tt[d][sl] = "-"));
    });

    const s0 = classSlotLabels[0];
    const s1 = classSlotLabels[1];

    // Sem 6 tries to book "Lab 1" on Thursday
    tt["Thursday"][s0] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Networks Lab", batch: "B1", room: "Lab 1", is_block_start: true }],
    };
    tt["Thursday"][s1] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Networks Lab", batch: "B1", room: "Lab 1", is_block_start: false }],
    };

    // Another saved timetable already booked "Lab 1" on Thursday at s0
    const savedTimetable = [
      {
        department: "AIML",
        semester: 6,
        division: "AIML-A",
        timetable_json: {
          Thursday: {
            [s0]: { is_lab: true, batch_labs: [{ subject_name: "ML Lab", room: "Lab 1" }] },
            [s1]: { is_lab: true, batch_labs: [{ subject_name: "ML Lab", room: "Lab 1" }] },
          },
        },
      },
    ];

    const result = validateSchedule({
      timetable: tt,
      subjects: [{ subject_name: "Networks Lab", is_lab: true, weekly_hours: 2 }],
      slots,
      batches: ["B1", "B2"],
      existingOtherTimetables: savedTimetable,
    });

    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.code === "CROSS_DIVISION_ROOM_CONFLICT")).toBe(true);
  });

  // ── TEST 7: EVERY LAB OCCUPIES EXACTLY TWO CONSECUTIVE HOURS ──────────────────
  test("7. Every lab occupies exactly two consecutive hours (1-hr lab is invalid)", () => {
    const tt = {};
    DAYS.forEach((d) => {
      tt[d] = {};
      classSlotLabels.forEach((sl) => (tt[d][sl] = "-"));
    });

    // Single 1-hour lab slot (no continuation)
    tt["Friday"][classSlotLabels[0]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Physics Lab", batch: "B1", room: "Lab 1", is_block_start: true }],
    };

    const result = validateSchedule({
      timetable: tt,
      subjects: [{ subject_name: "Physics Lab", is_lab: true, weekly_hours: 2 }],
      slots,
      batches: ["B1", "B2"],
    });

    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.code === "LAB_NOT_CONSECUTIVE")).toBe(true);
  });

  // ── TEST 8: EVERY REQUIRED WEEKLY LAB SESSION IS SCHEDULED ────────────────────
  test("8. Every required weekly lab session is scheduled across distinct days", () => {
    const testSubjects = [
      { id: 10, subject_name: "Data Mining", is_lab: false, weekly_hours: 3 },
      { id: 20, subject_name: "Security Lab", is_lab: true, weekly_hours: 2 },
    ];

    const testRooms = [
      { room_name: "Room 201", is_lab: false },
      { room_name: "Security Lab Room", is_lab: true },
    ];

    const testTeacherLinks = [
      { teacher_id: "t-dm", subjects: { subject_name: "Data Mining" } },
      { teacher_id: "t-sec", subjects: { subject_name: "Security Lab" } },
    ];

    const generated = generateDeterministicTimetable({
      subjects: testSubjects,
      slots,
      constraints: mockConstraints,
      resources: { teacherLinks: testTeacherLinks, rooms: testRooms },
      busyMap: { teacherBusy: [] },
      academicScope: {
        department: "CSE",
        semester: 7,
        division: "CSE-B",
        batches: ["B1", "B2", "B3"],
      },
    });

    expect(generated.validation.isValid).toBe(true);

    // Verify each batch received its required 2-hour lab session
    const scheduledBatches = new Set();
    const labDays = [];

    DAYS.forEach((d) => {
      classSlotLabels.forEach((sl) => {
        const cell = generated.timetable[d]?.[sl];
        if (cell?.batch_labs) {
          cell.batch_labs.forEach((l) => {
            if (l.is_block_start) {
              scheduledBatches.add(l.batch);
              labDays.push(d);
            }
          });
        }
      });
    });

    expect(scheduledBatches.has("B1")).toBe(true);
    expect(scheduledBatches.has("B2")).toBe(true);
    expect(scheduledBatches.has("B3")).toBe(true);

    // Verify all lab sessions are placed on completely distinct days
    const uniqueLabDays = new Set(labDays);
    expect(uniqueLabDays.size).toBe(3); // 3 distinct days for 3 batches
  });

  // ── TEST 9: TIMETABLE CANNOT BE FINALIZED IF DAILY LAB LIMIT IS VIOLATED ─────
  test("9. The timetable cannot be finalized if the daily lab limit is violated", () => {
    const testTT = {};
    DAYS.forEach((d) => {
      testTT[d] = {};
      classSlotLabels.forEach((sl) => (testTT[d][sl] = "-"));
    });

    // 2 lab sessions on Monday for same division
    testTT["Monday"][classSlotLabels[0]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab A", batch: "B1", is_block_start: true }],
    };
    testTT["Monday"][classSlotLabels[1]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab A", batch: "B1", is_block_start: false }],
    };
    testTT["Monday"][classSlotLabels[2]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab B", batch: "B2", is_block_start: true }],
    };
    testTT["Monday"][classSlotLabels[3]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab B", batch: "B2", is_block_start: false }],
    };

    const val = validateSchedule({
      timetable: testTT,
      subjects: [{ subject_name: "Lab A", is_lab: true }, { subject_name: "Lab B", is_lab: true }],
      slots,
      constraints: { max_division_daily_labs: 1 },
      batches: ["B1", "B2"],
    });

    expect(val.isValid).toBe(false);

    // Quality score must reflect INVALID status and score 0
    const score = calculateTimetableQualityScore(val, testTT, [], slots);
    expect(score.score).toBe(0);
    expect(score.rating).toBe("INVALID");
  });

  // ── TEST 10: QUALITY SCORE NEVER CONFLICT-FREE WHEN HARD CONSTRAINT FAILS ────
  test("10. The quality score is not presented as conflict-free when a hard constraint fails", () => {
    const invalidValidation = {
      isValid: false,
      violations: [
        {
          code: "MAX_DIVISION_DAILY_LABS_EXCEEDED",
          message: "Division CSE-A has 2 lab sessions on Monday across batches (max allowed: 1)",
        },
      ],
    };

    const quality = calculateTimetableQualityScore(invalidValidation, {}, [], slots);
    expect(quality.score).toBe(0);
    expect(quality.rating).toBe("INVALID");
    expect(quality.status).not.toContain("Verified Conflict-Free");
    expect(quality.status).toContain("Hard Constraint Violation");
  });

  // ── TEST 11: CONFIGURED DAILY LIMIT ENFORCED BY GENERATION AND VALIDATION ────
  test("11. The configured daily limit is enforced by both generation and validation", () => {
    // If daily limit is configured to 2, 2 labs on the same day must be valid
    const testTT = {};
    DAYS.forEach((d) => {
      testTT[d] = {};
      classSlotLabels.forEach((sl) => (testTT[d][sl] = "-"));
    });

    testTT["Monday"][classSlotLabels[0]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab A", batch: "B1", is_block_start: true }],
    };
    testTT["Monday"][classSlotLabels[1]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab A", batch: "B1", is_block_start: false }],
    };
    testTT["Monday"][classSlotLabels[2]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab B", batch: "B2", is_block_start: true }],
    };
    testTT["Monday"][classSlotLabels[3]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab B", batch: "B2", is_block_start: false }],
    };

    const valWithLimit2 = validateSchedule({
      timetable: testTT,
      subjects: [{ subject_name: "Lab A", is_lab: true }, { subject_name: "Lab B", is_lab: true }],
      slots,
      constraints: { max_division_daily_labs: 2 },
      batches: ["B1", "B2"],
    });

    expect(valWithLimit2.isValid).toBe(true);
  });

  // ── TEST 12: EXISTING SAVED TIMETABLES CHECKED FOR SHARED RESOURCES ──────────
  test("12. Existing saved timetables are checked when they share teachers, rooms, or student groups", () => {
    const tt = {};
    DAYS.forEach((d) => {
      tt[d] = {};
      classSlotLabels.forEach((sl) => (tt[d][sl] = "-"));
    });

    const s0 = classSlotLabels[0];
    tt["Monday"][s0] = {
      subject_name: "Advanced Java",
      is_lab: false,
      teacher_id: "teacher-shared",
      room: "Room 101",
    };

    const savedOtherTT = [
      {
        department: "CSE",
        semester: 5,
        division: "CSE-A",
        timetable_json: {
          Monday: {
            [s0]: { subject_name: "Database Systems", teacher_id: "teacher-shared" },
          },
        },
      },
    ];

    const result = validateSchedule({
      timetable: tt,
      subjects: [{ subject_name: "Advanced Java", is_lab: false, weekly_hours: 4 }],
      slots,
      teacherLinks: [{ teacher_id: "teacher-shared", subjects: { subject_name: "Advanced Java" } }],
      existingOtherTimetables: savedOtherTT,
    });

    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.code === "CROSS_DIVISION_CONFLICT")).toBe(true);
  });

  // ── TEST 13: AUTOMATIC REPAIR RESOLVES SAME-DAY LAB VIOLATIONS ───────────────
  test("13. Automatic repair reallocates same-day lab violations across available free days", () => {
    const invalidTT = {};
    DAYS.forEach((d) => {
      invalidTT[d] = {};
      classSlotLabels.forEach((sl) => (invalidTT[d][sl] = "-"));
    });

    // Schedule 2 labs on Monday (violates max 1 lab per day)
    invalidTT["Monday"][classSlotLabels[0]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab A", batch: "B1", room: "Lab 1", is_block_start: true }],
    };
    invalidTT["Monday"][classSlotLabels[1]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab A", batch: "B1", room: "Lab 1", is_block_start: false }],
    };
    invalidTT["Monday"][classSlotLabels[2]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab B", batch: "B2", room: "Lab 2", is_block_start: true }],
    };
    invalidTT["Monday"][classSlotLabels[3]] = {
      is_lab: true,
      batch_labs: [{ subject_name: "Lab B", batch: "B2", room: "Lab 2", is_block_start: false }],
    };

    const repairResult = repairSchedule({
      timetable: invalidTT,
      subjects: [{ subject_name: "Lab A", is_lab: true }, { subject_name: "Lab B", is_lab: true }],
      slots,
      constraints: { max_division_daily_labs: 1 },
      batches: ["B1", "B2"],
    });

    expect(repairResult.repaired).toBe(true);
    expect(repairResult.validation.isValid).toBe(true);
    expect(repairResult.validation.violations.length).toBe(0);
  });

  // ── TEST 14: PROVEN INFEASIBLE CONFIGURATION DETECTED EARLY ─────────────────
  test("14. Distinguish a proven infeasible configuration from search exhaustion", () => {
    // 4 lab subjects * 2 batches = 8 lab sessions required
    // Available days = 6, max_division_daily_labs = 1 => Max capacity = 6
    // 8 > 6 => Physically impossible!
    const testLabSubjects = [
      { subject_name: "Lab 1", is_lab: true, weekly_hours: 2 },
      { subject_name: "Lab 2", is_lab: true, weekly_hours: 2 },
      { subject_name: "Lab 3", is_lab: true, weekly_hours: 2 },
      { subject_name: "Lab 4", is_lab: true, weekly_hours: 2 },
    ];

    const result = generateDeterministicTimetable({
      subjects: testLabSubjects,
      slots,
      constraints: { max_division_daily_labs: 1 },
      resources: { teacherLinks: [], rooms: [] },
      academicScope: {
        department: "CSE",
        semester: 6,
        division: "CSE-A",
        batches: ["B1", "B2"],
      },
    });

    expect(result.isInfeasible).toBe(true);
    expect(result.status).toBe("PROVEN_INFEASIBLE");
    expect(result.error).toContain("Infeasible configuration");
    expect(result.qualityScore.rating).toBe("INVALID");
  });

  // ── TEST 15: STRICT WEEKLY CREDIT HOURS ENFORCEMENT ───────────────────────
  test("15. Flags WEEKLY_HOURS_EXCEEDED if a subject is scheduled for more slots than its weekly_hours", () => {
    const testSubjects = [
      { subject_name: "Software Testing", is_lab: false, weekly_hours: 3 },
    ];

    // Build timetable with 4 slots of Software Testing (exceeding 3)
    const badTimetable = {};
    DAYS.forEach((d) => {
      badTimetable[d] = {};
      classSlotLabels.forEach((s) => (badTimetable[d][s] = "-"));
    });
    badTimetable["Monday"]["09:00 AM-10:00 AM"] = { subject_name: "Software Testing" };
    badTimetable["Tuesday"]["09:00 AM-10:00 AM"] = { subject_name: "Software Testing" };
    badTimetable["Wednesday"]["09:00 AM-10:00 AM"] = { subject_name: "Software Testing" };
    badTimetable["Thursday"]["09:00 AM-10:00 AM"] = { subject_name: "Software Testing" }; // 4th slot!

    const val = validateSchedule({
      timetable: badTimetable,
      subjects: testSubjects,
      slots,
      constraints: {},
      batches: ["B1", "B2"],
    });

    expect(val.isValid).toBe(false);
    const hourViolation = val.violations.find((v) => v.code === "WEEKLY_HOURS_EXCEEDED");
    expect(hourViolation).toBeDefined();
    expect(hourViolation.actual).toBe(4);
    expect(hourViolation.limit).toBe(3);
  });

  // ── TEST 16: CASE-INSENSITIVE DEDUPLICATION OF DUPLICATE ENTRIES ──────────
  test("16. Deduplicates subjects with different casing (e.g., Software Testing vs Software testing) and respects 3 weekly hours", () => {
    const duplicateSubjects = [
      { subject_name: "Software Testing", is_lab: false, weekly_hours: 3 },
      { subject_name: "Software testing", is_lab: false, weekly_hours: 3 },
    ];

    const result = generateDeterministicTimetable({
      subjects: duplicateSubjects,
      slots,
      constraints: {},
      resources: { teacherLinks: [], rooms: [] },
      academicScope: {
        department: "CSE",
        semester: 7,
        division: "CSE-A",
        batches: ["B1", "B2"],
      },
    });

    expect(result.timetable).toBeDefined();

    // Count how many times Software Testing / Software testing appears in total across the week
    let totalScheduled = 0;
    DAYS.forEach((d) => {
      classSlotLabels.forEach((sl) => {
        const cell = result.timetable[d]?.[sl];
        const name = (typeof cell === "string" ? cell : cell?.subject_name || "").toLowerCase();
        if (name === "software testing") {
          totalScheduled++;
        }
      });
    });

    // Must be exactly 3, NOT 6!
    expect(totalScheduled).toBe(3);
  });

  // ── TEST 17: PARALLEL ELECTIVE BASKET SCHEDULING (PE-1 & PE-2) ─────────────
  test("17. Elective groups PE-1 (Distributed Systems & NLP) and PE-2 (Deep Learning & Software Testing) run simultaneously in parallel across separate rooms with 3 slots each", () => {
    const sdmSubjects = [
      {
        id: 1,
        subject_name: "Cryptography and Network Security",
        subject_code: "22UCSC700",
        weekly_hours: 4,
        is_lab: false,
        course_category: "Core",
      },
      {
        id: 2,
        subject_name: "Distributed Systems and Applications",
        subject_code: "22UCSE720",
        weekly_hours: 3,
        is_lab: false,
        course_category: "Professional Elective",
        elective_group_id: "PE-1",
      },
      {
        id: 3,
        subject_name: "Natural Language Processing",
        subject_code: "22UCSE721",
        weekly_hours: 3,
        is_lab: false,
        course_category: "Professional Elective",
        elective_group_id: "PE-1",
      },
      {
        id: 4,
        subject_name: "Deep Learning And Applications",
        subject_code: "22UCSE730",
        weekly_hours: 3,
        is_lab: false,
        course_category: "Professional Elective",
        elective_group_id: "PE-2",
      },
      {
        id: 5,
        subject_name: "Software Testing",
        subject_code: "22UCSE731",
        weekly_hours: 3,
        is_lab: false,
        course_category: "Professional Elective",
        elective_group_id: "PE-2",
      },
      {
        id: 6,
        subject_name: "Blockchain Technology",
        subject_code: "22UCSO740",
        weekly_hours: 3,
        is_lab: false,
        course_category: "Open Elective",
      },
      {
        id: 7,
        subject_name: "Cryptography and Network Security Laboratory",
        subject_code: "22UCSL701",
        weekly_hours: 1,
        is_lab: true,
        course_category: "Laboratory",
      },
    ];

    const sdmRooms = [
      { room_name: "Room-22", is_lab: false },
      { room_name: "CSE Seminar Hall", is_lab: false },
      { room_name: "Lab 1", is_lab: true },
    ];

    const result = generateDeterministicTimetable({
      subjects: sdmSubjects,
      slots,
      constraints: mockConstraints,
      resources: { teacherLinks: [], rooms: sdmRooms },
      academicScope: {
        department: "CSE",
        semester: 7,
        division: "CSE-B",
        batches: ["B1", "B2", "B3"],
      },
    });

    expect(result.timetable).toBeDefined();
    expect(result.validation.isValid).toBe(true);
    expect(result.qualityScore.score).toBe(100);

    // Track parallel elective slots
    let pe1ParallelSlots = 0;
    let pe2ParallelSlots = 0;
    let standaloneElectiveCount = 0;
    let cryptoCount = 0;
    let blockchainCount = 0;

    DAYS.forEach((d) => {
      classSlotLabels.forEach((sl) => {
        const cell = result.timetable[d]?.[sl];
        if (!cell || cell === "-") return;

        if (cell.is_elective && cell.offerings) {
          const names = cell.offerings.map((o) => o.subject_name.toLowerCase());
          const rooms = cell.offerings.map((o) => o.room || o.room_name);
          const teachers = cell.offerings.map((o) => o.teacher_id || o.teacher_name);

          // Rule: Each parallel elective slot must have distinct rooms & teachers
          expect(new Set(rooms).size).toBe(cell.offerings.length);
          expect(new Set(teachers).size).toBe(cell.offerings.length);

          if (names.some((n) => n.includes("distr")) && names.some((n) => n.includes("natural"))) {
            pe1ParallelSlots++;
          }
          if (names.some((n) => n.includes("deep")) && names.some((n) => n.includes("software"))) {
            pe2ParallelSlots++;
          }
        } else if (!cell.is_lab) {
          const name = (typeof cell === "string" ? cell : cell.subject_name || "").toLowerCase();
          if (
            name.includes("software testing") ||
            name.includes("deep learning") ||
            name.includes("distr") ||
            name.includes("natural")
          ) {
            standaloneElectiveCount++;
          }
          if (name.includes("cryptography and network security") && !name.includes("laboratory")) {
            cryptoCount++;
          }
          if (name.includes("blockchain")) {
            blockchainCount++;
          }
        }
      });
    });

    // PE-1 must have exactly 3 parallel slots
    expect(pe1ParallelSlots).toBe(3);
    // PE-2 must have exactly 3 parallel slots
    expect(pe2ParallelSlots).toBe(3);
    // None of the electives should be scheduled as standalone solo classes
    expect(standaloneElectiveCount).toBe(0);
    // Core theory classes
    expect(cryptoCount).toBe(4);
    expect(blockchainCount).toBe(3);
  });
});

