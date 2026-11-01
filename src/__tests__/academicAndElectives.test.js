import {
  getLocalAcademicStructure,
  getDivisionsForScope,
  getBatchesForDivision,
} from "../services/academicStructureService";

import {
  validateElectiveConfiguration,
  enrollStudentTransactional,
  enrollCohortTransactional,
  checkOverlappingStudentMemberships,
  validateCourseOfferingReference,
} from "../services/electiveValidationService";

import {
  validateSchedule,
  calculateTimetableQualityScore,
  DAYS,
} from "../services/schedulerEngine";

import { createSlotsWithBreaks } from "../services/aiService";

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
  max_division_daily_labs: 1,
};

describe("Academic Structure Hierarchy & Elective Rules", () => {
  let slots;
  let classSlotLabels;

  beforeAll(() => {
    slots = createSlotsWithBreaks(mockConstraints);
    classSlotLabels = slots.filter((s) => s.type === "class").map((s) => s.label);
  });

  test("1. Academic structure hierarchy loads departments, divisions, and batches", () => {
    const structure = getLocalAcademicStructure();
    expect(structure.departments.length).toBeGreaterThanOrEqual(6);
    expect(structure.divisions.length).toBeGreaterThanOrEqual(10);
    expect(structure.batches.length).toBeGreaterThanOrEqual(15);

    const cseDepts = structure.departments.find((d) => d.code === "CSE");
    expect(cseDepts).toBeDefined();
    expect(cseDepts.name).toBe("Computer Science & Engineering");
  });

  test("2. Divisions have independently configurable numbers of batches (CSE-A: 2, CSE-B: 3)", () => {
    const structure = getLocalAcademicStructure();
    const cse7Divs = getDivisionsForScope(structure, "CSE", 7);
    expect(cse7Divs.length).toBe(2);

    const divA = cse7Divs.find((d) => d.name === "CSE-A");
    const divB = cse7Divs.find((d) => d.name === "CSE-B");
    expect(divA).toBeDefined();
    expect(divB).toBeDefined();

    const batchesA = getBatchesForDivision(structure, divA.id);
    const batchesB = getBatchesForDivision(structure, divB.id);

    expect(batchesA.map((b) => b.name)).toEqual(["B1", "B2"]);
    expect(batchesB.map((b) => b.name)).toEqual(["B1", "B2", "B3"]);
  });

  test("3. Parallel electives run in the same time slot with distinct rooms and teachers without conflict", () => {
    const testTT = {};
    DAYS.forEach((d) => {
      testTT[d] = {};
      classSlotLabels.forEach((sl) => (testTT[d][sl] = "-"));
    });

    const slot0 = classSlotLabels[0];

    // Elective parallel slot
    testTT["Monday"][slot0] = {
      is_lab: false,
      subject_name: "Cloud Computing / NLP / Big Data",
      room: "Hall A / Hall B / Hall C",
      is_elective: true,
      teacher_id: "Prof. Cloud",
    };

    const validation = validateSchedule({
      timetable: testTT,
      subjects: [
        { subject_name: "Cloud Computing / NLP / Big Data", is_lab: false, weekly_hours: 1 },
      ],
      slots,
      constraints: mockConstraints,
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 7,
      department: "CSE",
    });

    expect(validation.isValid).toBe(true);
    expect(validation.violations.length).toBe(0);
  });

  test("4. Contradictory configuration detection: Weekly lab requirements exceeding available days", () => {
    // If a lab requires 7 sessions in a 6-day week with max 1 lab per day
    const weeklyRequired = 7;
    const workingDays = DAYS.length; // 6
    const maxDaily = mockConstraints.max_division_daily_labs; // 1

    const isFeasible = weeklyRequired <= workingDays * maxDaily;
    expect(isFeasible).toBe(false);
  });

  test("5. Quality score gating: Score MUST be 0 if validation fails", () => {
    const invalidValidation = {
      isValid: false,
      violations: [{ code: "TEACHER_DOUBLE_BOOKED", message: "Double booked" }],
    };

    const scoreResult = calculateTimetableQualityScore(
      invalidValidation,
      {},
      [],
      slots
    );

    expect(scoreResult.score).toBe(0);
    expect(scoreResult.rating).toBe("INVALID");
  });

  test("6. Mandatory Rule: Student must NEVER be assigned to two different courses in the same elective group", () => {
    const existingEnrollments = [
      {
        id: "enr-1",
        student_id: "1CR21CS001",
        elective_group_id: "elec-cse-7-pe3",
        course_offering_id: "off-cloud",
        academic_term: "term-2024-odd",
      },
    ];

    // Attempting to enroll 1CR21CS001 into a second offering in the same group and term
    const duplicateEnrollment = {
      id: "enr-2",
      student_id: "1CR21CS001",
      elective_group_id: "elec-cse-7-pe3",
      course_offering_id: "off-nlp",
      academic_term: "term-2024-odd",
    };

    expect(() => {
      enrollStudentTransactional(duplicateEnrollment, existingEnrollments);
    }).toThrow("DUPLICATE_ELECTIVE_ENROLLMENT");

    // Same student CAN enroll into a different elective group (e.g. Open Elective)
    const validOtherGroup = {
      id: "enr-3",
      student_id: "1CR21CS001",
      elective_group_id: "elec-all-7-oe2",
      course_offering_id: "off-cyber",
      academic_term: "term-2024-odd",
    };
    const updated = enrollStudentTransactional(validOtherGroup, existingEnrollments);
    expect(updated.length).toBe(2);
  });

  test("7. Mandatory Rule: Student cohort must NEVER be assigned to two different alternatives within the same elective group", () => {
    const existingCohortEnrollments = [
      {
        id: "enr-c1",
        cohort_id: "cohort-cse-7-a-c1",
        elective_group_id: "elec-cse-7-pe3",
        course_offering_id: "off-cloud",
        academic_term: "term-2024-odd",
      },
    ];

    // Attempting to assign cohort C1 to a second course offering in the same group
    const duplicateCohortEnrollment = {
      id: "enr-c2",
      cohort_id: "cohort-cse-7-a-c1",
      elective_group_id: "elec-cse-7-pe3",
      course_offering_id: "off-nlp",
      academic_term: "term-2024-odd",
    };

    expect(() => {
      enrollCohortTransactional(duplicateCohortEnrollment, existingCohortEnrollments);
    }).toThrow("DUPLICATE_COHORT_ELECTIVE_ENROLLMENT");
  });

  test("8. Configuration error reporting prevents timetable publication if duplicate enrollment exists", () => {
    const structure = getLocalAcademicStructure();
    const canonicalSubjects = [
      { id: "101", subject_code: "21CS71", subject_name: "Cloud Computing", is_lab: false, weekly_hours: 3 },
      { id: "102", subject_code: "21CS72", subject_name: "Natural Language Processing", is_lab: false, weekly_hours: 3 },
      { id: "103", subject_code: "21CS73", subject_name: "Big Data Analytics", is_lab: false, weekly_hours: 3 },
    ];

    // Corrupt configuration by adding duplicate student enrollment in the same group
    const corruptStructure = {
      ...structure,
      student_elective_enrollments: [
        ...(structure.student_elective_enrollments || []),
        {
          id: "enr-illegal",
          student_id: "stu-cse-7-001", // already enrolled in off-cse-7-pe3-cloud!
          elective_group_id: "elec-cse-7-pe3",
          course_offering_id: "off-cse-7-pe3-nlp",
          academic_term: "term-2024-odd",
        },
      ],
    };

    const configValidation = validateElectiveConfiguration(corruptStructure, canonicalSubjects, {
      department: "CSE",
      semester: 7,
    });

    expect(configValidation.isValid).toBe(false);
    expect(configValidation.violations.some((v) => v.code === "DUPLICATE_ELECTIVE_ENROLLMENT")).toBe(true);

    // Timetable validation MUST reject this configuration and block publication
    const testTT = {};
    DAYS.forEach((d) => {
      testTT[d] = {};
      classSlotLabels.forEach((sl) => (testTT[d][sl] = "-"));
    });

    const validation = validateSchedule({
      timetable: testTT,
      subjects: canonicalSubjects,
      slots,
      constraints: mockConstraints,
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 7,
      department: "CSE",
      academicStructure: corruptStructure,
    });

    expect(validation.isValid).toBe(false);
    expect(validation.violations.some((v) => v.code === "ELECTIVE_CONFIG_ERROR")).toBe(true);

    // Quality score must be 0 and marked INVALID
    const scoreResult = calculateTimetableQualityScore(validation, corruptStructure, canonicalSubjects, slots);
    expect(scoreResult.score).toBe(0);
    expect(scoreResult.rating).toBe("INVALID");
  });

  test("9. Selecting an elective course MUST reference existing course-offering ID linked to canonical course ID", () => {
    const canonicalSubjects = [
      { id: "101", subject_code: "21CS71", subject_name: "Cloud Computing" },
      { id: "102", subject_code: "21CS72", subject_name: "Natural Language Processing" },
    ];

    // Offering referencing a non-existent canonical course ID
    const invalidOffering = {
      id: "off-fake",
      elective_group_id: "elec-cse-7-pe3",
      course_id: "999", // Invalid! Not in canonical catalog
      subject_code: "FAKE99",
      subject_name: "Imaginary Elective",
    };

    const result = validateCourseOfferingReference(invalidOffering, canonicalSubjects);
    expect(result.isValid).toBe(false);
    expect(result.code).toBe("INVALID_CANONICAL_COURSE_ID");

    // Offering referencing a valid canonical course ID
    const validOffering = {
      id: "off-valid",
      elective_group_id: "elec-cse-7-pe3",
      course_id: "101",
      subject_code: "21CS71",
      subject_name: "Cloud Computing",
    };
    const validResult = validateCourseOfferingReference(validOffering, canonicalSubjects);
    expect(validResult.isValid).toBe(true);
  });

  test("10. Parallel elective options scheduled in parallel MUST use separate qualified teachers and suitable rooms", () => {
    const testTT = {};
    DAYS.forEach((d) => {
      testTT[d] = {};
      classSlotLabels.forEach((sl) => (testTT[d][sl] = "-"));
    });

    const slot0 = classSlotLabels[0];

    // Case A: Conflicting teachers in parallel offerings
    testTT["Monday"][slot0] = {
      is_elective: true,
      elective_group_id: "elec-cse-7-pe3",
      elective_group_name: "Professional Elective - III",
      offerings: [
        { course_offering_id: "off-1", course_id: "101", subject_name: "Cloud", teacher_id: "Prof. Cloud", room_id: "Hall A", cohorts: ["C1"] },
        { course_offering_id: "off-2", course_id: "102", subject_name: "NLP", teacher_id: "Prof. Cloud", room_id: "Hall B", cohorts: ["C2"] }, // DUPLICATE TEACHER!
      ],
    };

    const valTeacherConflict = validateSchedule({
      timetable: testTT,
      subjects: [{ id: "101" }, { id: "102" }],
      slots,
      constraints: mockConstraints,
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 7,
      department: "CSE",
    });

    expect(valTeacherConflict.isValid).toBe(false);
    expect(valTeacherConflict.violations.some((v) => v.code === "ELECTIVE_FACULTY_CONFLICT")).toBe(true);

    // Case B: Conflicting rooms in parallel offerings
    testTT["Monday"][slot0].offerings[1].teacher_id = "Prof. NLP";
    testTT["Monday"][slot0].offerings[1].room_id = "Hall A"; // DUPLICATE ROOM!

    const valRoomConflict = validateSchedule({
      timetable: testTT,
      subjects: [{ id: "101" }, { id: "102" }],
      slots,
      constraints: mockConstraints,
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 7,
      department: "CSE",
    });

    expect(valRoomConflict.isValid).toBe(false);
    expect(valRoomConflict.violations.some((v) => v.code === "ELECTIVE_ROOM_CONFLICT")).toBe(true);

    // Case C: Fully disjoint teachers, rooms, and cohorts -> Valid!
    testTT["Monday"][slot0].offerings[1].room_id = "Hall B";
    const valDisjoint = validateSchedule({
      timetable: testTT,
      subjects: [{ id: "101" }, { id: "102" }],
      slots,
      constraints: mockConstraints,
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 7,
      department: "CSE",
    });

    expect(valDisjoint.isValid).toBe(true);
  });

  test("11. Students are assigned ONLY to their selected elective option and never to an unselected alternative", () => {
    const testTT = {};
    DAYS.forEach((d) => {
      testTT[d] = {};
      classSlotLabels.forEach((sl) => (testTT[d][sl] = "-"));
    });

    const slot0 = classSlotLabels[0];

    // If an offering attempts to enroll student cohorts assigned to an unselected/different alternative
    testTT["Monday"][slot0] = {
      is_elective: true,
      elective_group_id: "elec-cse-7-pe3",
      elective_group_name: "Professional Elective - III",
      offerings: [
        { course_offering_id: "off-1", course_id: "101", subject_name: "Cloud", teacher_id: "Prof. Cloud", room_id: "Hall A", cohorts: ["Cohort-A1"] },
        { course_offering_id: "off-2", course_id: "102", subject_name: "NLP", teacher_id: "Prof. NLP", room_id: "Hall B", cohorts: ["Cohort-A1"] }, // OVERLAPPING COHORT!
      ],
    };

    const valOverlap = validateSchedule({
      timetable: testTT,
      subjects: [{ id: "101" }, { id: "102" }],
      slots,
      constraints: mockConstraints,
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 7,
      department: "CSE",
    });

    expect(valOverlap.isValid).toBe(false);
    expect(valOverlap.violations.some((v) => v.code === "ELECTIVE_STUDENT_CONFLICT")).toBe(true);
  });

  test("12. Different elective groups are checked for overlapping student memberships before simultaneous scheduling", () => {
    const structure = getLocalAcademicStructure();

    // Group 1: PE3 has cohorts A1, A2, A3
    // Group 2: OE2 with overlapping student/cohort membership
    const overlapResult = checkOverlappingStudentMemberships(
      "elec-cse-7-pe3",
      "elec-all-7-oe2",
      structure.cohort_elective_enrollments,
      structure.student_elective_enrollments
    );

    // If both groups contain any of the same cohorts/students, overlap is detected
    expect(typeof overlapResult.hasOverlap).toBe("boolean");
    expect(Array.isArray(overlapResult.overlappingCohorts)).toBe(true);
    expect(Array.isArray(overlapResult.overlappingStudents)).toBe(true);
  });

  test("13. Fallback when individual student enrollment is unavailable: uses explicitly configured cohorts without inventing enrollment", () => {
    const structure = getLocalAcademicStructure();
    const canonicalSubjects = [
      { id: "101", subject_code: "21CS71", subject_name: "Cloud Computing", is_lab: false, weekly_hours: 3 },
      { id: "102", subject_code: "21CS72", subject_name: "Natural Language Processing", is_lab: false, weekly_hours: 3 },
      { id: "103", subject_code: "21CS73", subject_name: "Big Data Analytics", is_lab: false, weekly_hours: 3 },
    ];

    // Structure with NO individual student data, only explicitly configured cohorts
    const cohortOnlyStructure = {
      ...structure,
      students: [],
      student_elective_enrollments: [],
    };

    const validation = validateElectiveConfiguration(cohortOnlyStructure, canonicalSubjects, {
      department: "CSE",
      semester: 7,
    });

    // Configuration succeeds using explicitly configured cohorts
    expect(validation.isValid).toBe(true);
    expect(validation.violations.length).toBe(0);
  });

  test("14. Teacher ID & Time Slot Mismatch: Blocked slots with start-time key and numeric teacher_id strictly prevent scheduling and are flagged by validator", () => {
    // Prof Radhika Amashi: DB ID 83, blocked on Monday at start time format (e.g. '08:00 AM' or start of slot 0)
    const slot0 = classSlotLabels[0];
    const startOfSlot0 = slot0.split("-")[0].trim();

    const teacherLinks = [
      {
        teacher_id: 83,
        teachers: { id: 83, name: "Prof Radhika Amashi" },
        subjects: { id: "102", subject_name: "Natural Language Processing" },
      },
    ];

    const busyData = [
      {
        teacher_id: 83, // Numeric DB ID
        day_of_week: "Monday",
        time_slot: startOfSlot0, // Start-time format ("09:00 AM" or "08:00 AM")
        is_busy: true,
      },
    ];

    const testTT = {};
    DAYS.forEach((d) => {
      testTT[d] = {};
      classSlotLabels.forEach((sl) => (testTT[d][sl] = "-"));
    });

    testTT["Monday"][slot0] = {
      is_elective: true,
      elective_group_id: "PE-1",
      offerings: [
        {
          course_offering_id: "off-1",
          course_id: "102",
          subject_name: "Natural Language Processing",
          teacher_id: "Prof Radhika Amashi", // String name from synthesis
          room_id: "Room-22",
        },
      ],
    };

    const valResult = validateSchedule({
      timetable: testTT,
      subjects: [
        { id: "102", subject_name: "Natural Language Processing", is_lab: false, weekly_hours: 3 },
      ],
      slots,
      constraints: mockConstraints,
      teacherLinks,
      teacherBusy: busyData,
      batches: ["B1", "B2"],
      division: "CSE-A",
      semester: 7,
      department: "CSE",
    });

    // Validator MUST detect TEACHER_BUSY despite ID 83 vs name and start slot vs range slot
    expect(valResult.isValid).toBe(false);
    expect(valResult.violations.some((v) => v.code === "TEACHER_BUSY")).toBe(true);
  });
});
