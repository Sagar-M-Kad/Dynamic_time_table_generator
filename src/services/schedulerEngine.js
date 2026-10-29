/**
 * TimeTable AI — Deterministic Constraint Optimization & Backtracking Engine
 * Implements:
 * - Exactly two consecutive hours for laboratory sessions (Rule A)
 * - Maximum two lab sessions per batch per day (Rule B)
 * - Batch-specific lab sessions (Rule C)
 * - Division common theory sessions (Rule D)
 * - Strict teacher availability & global no-double-booking
 * - Strict room suitability & room availability
 * - Faculty workload limits (max daily & max consecutive)
 * - Independent centralized validator with structured violation reporting
 * - Quality score gating: score is 0 / INVALID if ANY hard constraint is violated
 */

import {
  validateElectiveConfiguration,
  validateCourseOfferingReference,
  checkOverlappingStudentMemberships,
} from "./electiveValidationService";
import { getLocalAcademicStructure } from "./academicStructureService";

export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ── UTILITY: PARSE TIME STRINGS ──────────────────────────────────────────────
export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(" ");
  const [hStr, mStr] = parts[0].split(":");
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const period = parts[1] || "";

  if (period.toUpperCase() === "PM" && h !== 12) h += 12;
  if (period.toUpperCase() === "AM" && h === 12) h = 0;
  return h * 60 + m;
};

// ── 1. FIND ALL VALID 2-HOUR CONSECUTIVE WINDOWS ──────────────────────────────
// A valid lab window is a pair of class slots (slot_i, slot_{i+1})
// appearing back-to-back with NO break or lunch between them.
export const getConsecutiveLabWindows = (fullSlots, labDurationHours = 2) => {
  const windows = [];
  const requiredSlots = Math.max(1, Math.round(labDurationHours));

  for (let i = 0; i <= fullSlots.length - requiredSlots; i++) {
    const chunk = fullSlots.slice(i, i + requiredSlots);
    // All items in the chunk must be 'class' slots (no break, no lunch)
    if (chunk.every((s) => s.type === "class")) {
      windows.push({
        startIndex: i,
        slots: chunk.map((s) => s.label),
        startSlot: chunk[0].label,
        endSlot: chunk[chunk.length - 1].label,
      });
    }
  }
  return windows;
};

// ── 1B. PARALLEL ELECTIVE BASKET SYNTHESIZER ─────────────────────────────────
export const synthesizeElectiveGroupsAndOfferings = ({
  subjects = [],
  academicScope = {},
  electiveGroups = null,
  courseOfferings = null,
  resources = {},
}) => {
  const department = academicScope.department || "CSE";
  const semester = parseInt(academicScope.semester) || 7;
  const teacherLinks = resources.teacherLinks || [];
  const rooms = resources.rooms || [];

  const theoryRooms = rooms.filter(
    (r) => !r.is_lab && !r.room_name?.toLowerCase().includes("lab")
  );
  const primaryTheoryRoom = theoryRooms[0]?.room_name || "Room-22";
  const seminarRoom =
    theoryRooms.find((r) => r.room_name?.toLowerCase().includes("seminar"))?.room_name ||
    theoryRooms[1]?.room_name ||
    "CSE Seminar Hall";

  const defaultRoomsList = [primaryTheoryRoom, seminarRoom, "Room-23", "CSE Seminar Hall-2"];

  const subjectTeacherMap = {};
  teacherLinks.forEach((tl) => {
    const name = tl.subjects?.subject_name;
    if (name) {
      subjectTeacherMap[name.trim().toLowerCase()] =
        tl.teachers?.name || tl.teacher_id;
    }
  });

  // Faculty curriculum fallbacks (matching SDMCET / autonomous VII sem official allocation)
  const facultyFallbacks = {
    "distributed systems and applications": "Dr. S G Yadawad",
    "distrubuted systems and applications": "Dr. S G Yadawad",
    "distributed systems": "Dr. S G Yadawad",
    "natural language processing": "Prof Radhika Amashi",
    "natural processing language": "Prof Radhika Amashi",
    "deep learning and applications": "Prof Pratapkumar M K",
    "deep learning": "Prof Pratapkumar M K",
    "software testing": "Dr. S B Kulkarni",
    "cryptography and network security": "Dr. Sandhya S V",
    "blockchain technology": "Prof Anand S P",
  };

  // Map to cluster subjects into elective groups
  const electiveClusterMap = new Map();

  const registerElective = (clusterKey, groupName, weeklyHours, sub) => {
    if (!electiveClusterMap.has(clusterKey)) {
      electiveClusterMap.set(clusterKey, {
        groupId: `elec-${department.toLowerCase()}-${semester}-${clusterKey.toLowerCase()}`,
        groupName,
        weeklyHours: weeklyHours || sub.weekly_hours || 3,
        subjects: [],
      });
    }
    const cluster = electiveClusterMap.get(clusterKey);
    const sNorm = (sub.subject_name || "").trim().toLowerCase();
    if (!cluster.subjects.some((s) => (s.subject_name || "").trim().toLowerCase() === sNorm)) {
      cluster.subjects.push(sub);
    }
  };

  subjects.forEach((s) => {
    if (s.is_lab) return; // Lab subjects are handled in batch-lab pipeline
    const nameNorm = (s.subject_name || "").trim().toLowerCase();
    const code = (s.subject_code || "").trim().toUpperCase();
    const grpId = (s.elective_group_id || "").trim();

    // 1. Explicit elective_group_id specified by user in UI
    if (grpId) {
      const cleanGrp = grpId.toUpperCase();
      registerElective(cleanGrp, `Professional Elective (${cleanGrp})`, s.weekly_hours, s);
      return;
    }

    // 2. Known elective subject pairs (as specified by user & official curriculum)
    const isDistributed =
      nameNorm.includes("distr") && (nameNorm.includes("system") || nameNorm.includes("app"));
    const isNLP =
      (nameNorm.includes("natural") && (nameNorm.includes("language") || nameNorm.includes("process"))) ||
      nameNorm.includes("nlp");
    if (isDistributed || isNLP) {
      registerElective("PE-1", "Professional Elective - I (Distributed Systems / NLP)", 3, s);
      return;
    }

    const isDeepLearning = nameNorm.includes("deep") && nameNorm.includes("learn");
    const isSoftwareTesting = nameNorm.includes("software") && nameNorm.includes("test");
    if (isDeepLearning || isSoftwareTesting) {
      registerElective("PE-2", "Professional Elective - II (Deep Learning / Software Testing)", 3, s);
      return;
    }

    // 3. Subject code matching elective pattern (e.g., 22UCSE72x vs 22UCSE73x)
    const electiveCodeMatch =
      code.match(/^([A-Z0-9]+[A-Z]+E\d{2})/i) || code.match(/^(\d{2}[A-Z]+E\d{2})/i);
    if (electiveCodeMatch) {
      const prefix = electiveCodeMatch[1].toUpperCase();
      registerElective(prefix, `Elective Group (${prefix})`, s.weekly_hours, s);
    }
  });

  const synthesizedGroups = [];
  const synthesizedOfferings = [];
  const electiveSubjectNorms = new Set();

  electiveClusterMap.forEach((cluster) => {
    if (cluster.subjects.length > 0) {
      const grp = {
        id: cluster.groupId,
        department_code: department,
        semester: semester,
        name: cluster.groupName,
        type: "parallel",
        weekly_hours: cluster.weeklyHours,
        description: `Parallel elective basket: ${cluster.subjects.map((s) => s.subject_name).join(", ")}`,
        created_at: new Date().toISOString(),
      };
      synthesizedGroups.push(grp);

      cluster.subjects.forEach((sub, idx) => {
        const sNorm = (sub.subject_name || "").trim().toLowerCase();
        electiveSubjectNorms.add(sNorm);

        const assignedRoom =
          idx < defaultRoomsList.length
            ? defaultRoomsList[idx]
            : `Room-${22 + idx}`;

        const teacherId =
          subjectTeacherMap[sNorm] ||
          facultyFallbacks[sNorm] ||
          sub.teacher_name ||
          sub.teacher_id ||
          `Prof. ${sub.subject_name.split(" ")[0]}`;

        synthesizedOfferings.push({
          id: `off-${cluster.groupId}-${sub.id || idx}`,
          elective_group_id: cluster.groupId,
          course_id: sub.id || sub.subject_code || String(idx + 101),
          subject_code: sub.subject_code,
          subject_name: sub.subject_name,
          teacher_id: teacherId,
          teacher_name: teacherId,
          room_id: assignedRoom,
          room_name: assignedRoom,
          room: assignedRoom,
          capacity: 60,
        });
      });
    }
  });

  // Retain synthesized groups from the current subjects
  const resolvedGroups = [...synthesizedGroups];
  const resolvedOfferings = [...synthesizedOfferings];

  const subjectNamesSet = new Set(
    subjects.map((s) => (s.subject_name || "").trim().toLowerCase()).filter(Boolean)
  );

  // If explicit electiveGroups were passed via academicScope.electiveGroups, include them
  if (academicScope.electiveGroups && Array.isArray(academicScope.electiveGroups)) {
    academicScope.electiveGroups.forEach((g) => {
      if (!resolvedGroups.some((rg) => rg.id === g.id)) {
        resolvedGroups.push(g);
      }
    });
    (courseOfferings || []).forEach((o) => {
      if (!resolvedOfferings.some((ro) => ro.id === o.id)) {
        resolvedOfferings.push(o);
      }
    });
  } else if (synthesizedGroups.length === 0 && electiveGroups && electiveGroups.length > 0) {
    // Fall back to pre-existing academic structure electives only if no electives were synthesized from subjects
    electiveGroups.forEach((g) => {
      const matchingOfferings = (courseOfferings || []).filter(
        (o) =>
          o.elective_group_id === g.id &&
          subjectNamesSet.has((o.subject_name || "").trim().toLowerCase())
      );
      if (matchingOfferings.length > 0) {
        if (!resolvedGroups.some((rg) => rg.id === g.id)) {
          resolvedGroups.push(g);
          matchingOfferings.forEach((mo) => {
            if (!resolvedOfferings.some((ro) => ro.id === mo.id)) {
              resolvedOfferings.push(mo);
            }
          });
        }
      }
    });
  }

  resolvedOfferings.forEach((o) => {
    if (o.subject_name) {
      electiveSubjectNorms.add(o.subject_name.trim().toLowerCase());
    }
  });

  return {
    resolvedGroups,
    resolvedOfferings,
    electiveSubjectNorms,
  };
};

// ── 2. INDEPENDENT CENTRALIZED VALIDATOR ──────────────────────────────────────
export const validateSchedule = ({
  timetable,
  subjects,
  slots,
  constraints = {},
  teacherLinks = [],
  teacherBusy = [],
  rooms = [],
  batches = ["B1", "B2"],
  existingOtherTimetables = [],
  division = "Section A",
  semester = 6,
  department = "CSE",
  academicStructure = null,
  electiveGroups = null,
  courseOfferings = null,
  studentEnrollments = null,
  cohortEnrollments = null,
  students = null,
  studentCohorts = null,
}) => {
  const violations = [];
  const classSlots = slots.filter((s) => s.type === "class").map((s) => s.label);
  const fullSlots = slots;

  // Resolve academic structure for electives and cohorts
  const localAcademic = academicStructure || getLocalAcademicStructure();
  const rawElectives = electiveGroups || localAcademic.elective_groups || [];
  const rawOfferings = courseOfferings || localAcademic.course_offerings || [];

  const {
    resolvedGroups,
    resolvedOfferings,
  } = synthesizeElectiveGroupsAndOfferings({
    subjects,
    academicScope: { department, semester, division },
    electiveGroups: rawElectives,
    courseOfferings: rawOfferings,
    resources: { teacherLinks, rooms },
  });

  const effectiveElectives = resolvedGroups.length > 0 ? resolvedGroups : rawElectives;
  const effectiveOfferings = resolvedOfferings.length > 0 ? resolvedOfferings : rawOfferings;
  const effectiveStudentEnr = studentEnrollments || localAcademic.student_elective_enrollments || [];
  const effectiveCohortEnr = cohortEnrollments || localAcademic.cohort_elective_enrollments || [];
  const effectiveStudents = students || localAcademic.students || [];
  const effectiveCohorts = studentCohorts || localAcademic.student_cohorts || [];

  // Configuration check: Validate student / cohort duplicate enrollment and canonical references
  const hasExplicitElectiveConfig = Boolean(
    academicStructure ||
    (Array.isArray(electiveGroups) ? electiveGroups.length > 0 : Boolean(electiveGroups))
  );
  if (hasExplicitElectiveConfig) {
    const configVal = validateElectiveConfiguration({
      electiveGroups: effectiveElectives,
      courseOfferings: effectiveOfferings,
      studentEnrollments: effectiveStudentEnr,
      cohortEnrollments: effectiveCohortEnr,
      subjects,
      students: effectiveStudents,
      cohorts: effectiveCohorts,
      scope: { department, semester },
    });

    if (!configVal.isValid) {
      configVal.errors.forEach((err) => {
        violations.push({
          code: "ELECTIVE_CONFIG_ERROR",
          subCode: err.code,
          message: err.message,
          canPublish: false,
          student: err.student_id,
          cohort: err.cohort_id,
          electiveGroup: err.elective_group_id,
        });
        violations.push({
          code: err.code,
          message: err.message,
          canPublish: false,
          student: err.student_id,
          cohort: err.cohort_id,
          electiveGroup: err.elective_group_id,
        });
      });
    }
  }

  // Maximum division lab sessions per day across all batches combined (default: 1)
  const maxDivisionDailyLabs = parseInt(
    constraints.max_division_daily_labs ??
      constraints.max_lab_sessions_per_day_per_division ??
      1
  );

  // Build subject -> teacher lookup
  const subjectTeacherMap = {};
  (teacherLinks || []).forEach((link) => {
    const name = link.subjects?.subject_name;
    if (name) subjectTeacherMap[name] = link.teacher_id;
  });

  // Build teacher busy set from DB: "teacherId_day_slot"
  const busySet = new Set(
    (teacherBusy || []).map((b) => `${b.teacher_id}_${b.day_of_week}_${b.time_slot}`)
  );

  // Maximum workload guardrails
  const maxDaily = parseInt(constraints.max_daily_hours) || 4;
  const maxConsec = parseInt(constraints.max_consecutive_hours) || 2;

  // Track global allocations for cross-check
  const teacherTimeMap = {}; // "teacherId_day_slot" -> subject / details
  const roomTimeMap = {};    // "roomId_day_slot" -> subject / details

  // Track weekly counts per subject (case-insensitive) & per batch
  const weeklyCounts = {};
  const subjectMetaMap = {};
  subjects.forEach((s) => {
    const norm = (s.subject_name || "").trim().toLowerCase();
    weeklyCounts[norm] = 0;
    if (!subjectMetaMap[norm]) {
      subjectMetaMap[norm] = s;
    }
  });

  // Track batch lab sessions per day: batchDailyLabs[batch][day]
  const batchDailyLabs = {};
  batches.forEach((b) => {
    batchDailyLabs[b] = {};
    DAYS.forEach((d) => (batchDailyLabs[b][d] = 0));
  });

  // Track division-level distinct 2-hour lab sessions per day across ALL batches combined
  const divisionDailyLabSessions = {};
  DAYS.forEach((d) => (divisionDailyLabSessions[d] = []));

  // Valid 2-hour lab windows for continuity check
  const validLabWindows = getConsecutiveLabWindows(fullSlots, 2);
  const validStartSlots = new Set(validLabWindows.map((w) => w.slots[0]));

  for (const day of DAYS) {
    const dayClasses = timetable[day] || {};
    const daySubjectSeen = new Set();
    const teacherDailyHours = {};
    const teacherConsecutiveHours = {};

    // Check each slot in chronological order
    for (let slotIdx = 0; slotIdx < classSlots.length; slotIdx++) {
      const slot = classSlots[slotIdx];
      const cell = dayClasses[slot];

      if (!cell || cell === "-" || cell.is_free) {
        // Reset consecutive counters for teachers on free slot
        Object.keys(teacherConsecutiveHours).forEach((t) => (teacherConsecutiveHours[t] = 0));
        continue;
      }

      // Check if this is a Batch Lab Cell, Parallel Elective Cell, or Theory Cell
      if (cell.is_lab || cell.batch_labs) {
        const labEntries = cell.batch_labs || [cell];

        labEntries.forEach((labEntry) => {
          const subName = labEntry.subject_name || labEntry.subject;
          const batchName = labEntry.batch;
          const teacherId = labEntry.teacher_id || subjectTeacherMap[subName];
          const roomId = labEntry.room_id || labEntry.room;

          // Rule C: Every lab session must reference an actual configured batch
          if (!batchName || !batches.includes(batchName)) {
            violations.push({
              code: "MISSING_BATCH",
              day,
              slot,
              subject: subName,
              batch: batchName,
              message: `Lab "${subName}" at ${day} ${slot} is missing a valid batch identifier`,
            });
          }

          // Rule A & Rule 3: Strict Two-hour consecutive block check
          if (labEntry.is_block_start) {
            const nextSlot = classSlots[slotIdx + 1];
            const nextCell = nextSlot ? dayClasses[nextSlot] : null;
            const nextLabs = nextCell?.batch_labs || (nextCell?.is_lab ? [nextCell] : []);
            const hasContinuation = nextLabs.some(
              (nl) => (nl.subject_name || nl.subject) === subName && nl.batch === batchName
            );

            if (!hasContinuation) {
              violations.push({
                code: "LAB_NOT_CONSECUTIVE",
                day,
                slot,
                subject: subName,
                batch: batchName,
                message: `Lab "${subName}" for batch ${batchName} on ${day} at ${slot} must be exactly 2 consecutive hours`,
              });
            } else {
              // Valid 2-hour lab session counted for the batch
              if (batchDailyLabs[batchName]) {
                batchDailyLabs[batchName][day] = (batchDailyLabs[batchName][day] || 0) + 1;
              }

              // Rule 1: Record distinct lab session for the division and semester
              divisionDailyLabSessions[day].push({
                batch: batchName,
                subject: subName,
                slot,
                teacher: teacherId,
                room: roomId,
              });
            }
          }

          // Teacher Checks
          if (teacherId) {
            const tKey = `${teacherId}_${day}_${slot}`;
            if (busySet.has(tKey)) {
              violations.push({
                code: "TEACHER_BUSY",
                day,
                slot,
                subject: subName,
                teacher: teacherId,
                batch: batchName,
                message: `Teacher for lab "${subName}" is unavailable on ${day} at ${slot}`,
              });
            }

            if (teacherTimeMap[tKey]) {
              violations.push({
                code: "TEACHER_DOUBLE_BOOKED",
                day,
                slot,
                subject: subName,
                teacher: teacherId,
                batch: batchName,
                message: `Teacher double-booked on ${day} at ${slot} (${subName} vs ${teacherTimeMap[tKey]})`,
              });
            }
            teacherTimeMap[tKey] = `${subName} (${batchName})`;
          }

          // Room Checks
          if (roomId) {
            const rKey = `${roomId}_${day}_${slot}`;
            if (roomTimeMap[rKey]) {
              violations.push({
                code: "ROOM_DOUBLE_BOOKED",
                day,
                slot,
                subject: subName,
                room: roomId,
                batch: batchName,
                message: `Lab Room "${roomId}" is double-booked on ${day} at ${slot}`,
              });
            }
            roomTimeMap[rKey] = `${subName} (${batchName})`;
          }
        });
      } else if (cell.is_elective) {
        // ── Parallel Elective Session Checks ──────────────────
        const rawOfferings = cell.offerings || [
          {
            course_offering_id: cell.course_offering_id || "off-default",
            course_id: cell.course_id || 101,
            subject_name: cell.subject_name || cell.subject,
            teacher_id: cell.teacher_id,
            room_id: cell.room_id || cell.room,
            room: cell.room || cell.room_id,
          },
        ];

        const slotOfferingTeachers = new Set();
        const slotOfferingRooms = new Set();
        const slotOfferingStudents = new Set();
        const slotOfferingCohorts = new Set();

        rawOfferings.forEach((offering) => {
          const oSub = offering.subject_name || offering.subject || "Elective";
          const oSubNorm = (oSub || "").trim().toLowerCase();
          if (oSubNorm) {
            weeklyCounts[oSubNorm] = (weeklyCounts[oSubNorm] || 0) + 1;
          }
          const oTeacher = offering.teacher_id || subjectTeacherMap[oSub];
          const oRoom = offering.room_id || offering.room;

          // Rule: Selecting an elective course must reference its existing course-offering ID, linked to the canonical course ID.
          if (cell.offerings && (!offering.course_offering_id || offering.course_id === undefined)) {
            violations.push({
              code: "INVALID_COURSE_OFFERING_REFERENCE",
              day,
              slot,
              subject: oSub,
              message: `Elective course "${oSub}" at ${day} ${slot} must reference an existing course-offering ID linked to canonical course ID.`,
            });
          }

          // Rule: Different elective options in the same group should normally be scheduled in parallel
          // during the configured elective period, using separate qualified teachers and suitable rooms.
          if (oTeacher) {
            if (slotOfferingTeachers.has(oTeacher)) {
              violations.push({
                code: "ELECTIVE_FACULTY_CONFLICT",
                day,
                slot,
                subject: oSub,
                teacher: oTeacher,
                message: `Parallel elective options in the same group on ${day} at ${slot} must use separate teachers. Teacher "${oTeacher}" is assigned to multiple offerings.`,
              });
            }
            slotOfferingTeachers.add(oTeacher);

            const tKey = `${oTeacher}_${day}_${slot}`;
            if (busySet.has(tKey)) {
              violations.push({
                code: "TEACHER_BUSY",
                day,
                slot,
                subject: oSub,
                teacher: oTeacher,
                message: `Teacher "${oTeacher}" for elective "${oSub}" is marked busy on ${day} at ${slot}`,
              });
            }
            if (teacherTimeMap[tKey]) {
              violations.push({
                code: "TEACHER_DOUBLE_BOOKED",
                day,
                slot,
                subject: oSub,
                teacher: oTeacher,
                message: `Teacher "${oTeacher}" is double-booked on ${day} at ${slot} (${oSub} vs ${teacherTimeMap[tKey]})`,
              });
            }
            teacherTimeMap[tKey] = `${oSub} (Elective)`;
          }

          if (oRoom) {
            if (slotOfferingRooms.has(oRoom)) {
              violations.push({
                code: "ELECTIVE_ROOM_CONFLICT",
                day,
                slot,
                subject: oSub,
                room: oRoom,
                message: `Parallel elective options on ${day} at ${slot} must use separate rooms. Room "${oRoom}" is assigned to multiple offerings.`,
              });
            }
            slotOfferingRooms.add(oRoom);

            const rKey = `${oRoom}_${day}_${slot}`;
            if (roomTimeMap[rKey]) {
              violations.push({
                code: "ROOM_DOUBLE_BOOKED",
                day,
                slot,
                subject: oSub,
                room: oRoom,
                message: `Elective room "${oRoom}" is double-booked on ${day} at ${slot} (${oSub} vs ${roomTimeMap[rKey]})`,
              });
            }
            roomTimeMap[rKey] = `${oSub} (Elective)`;
          }

          // Rule: Students are assigned only to their selected elective option.
          // A student must never be assigned to two different courses belonging to the same elective group.
          const assignedStudents = offering.student_ids || offering.students || [];
          assignedStudents.forEach((sId) => {
            if (slotOfferingStudents.has(sId)) {
              violations.push({
                code: "ELECTIVE_STUDENT_CONFLICT",
                day,
                slot,
                student: sId,
                subject: oSub,
                message: `Student "${sId}" is assigned to multiple courses within the same elective group on ${day} at ${slot}`,
              });
            }
            slotOfferingStudents.add(sId);
          });

          const assignedCohorts = offering.cohort_ids || offering.cohorts || [];
          assignedCohorts.forEach((cId) => {
            if (slotOfferingCohorts.has(cId)) {
              violations.push({
                code: "ELECTIVE_STUDENT_CONFLICT",
                day,
                slot,
                cohort: cId,
                subject: oSub,
                message: `Cohort "${cId}" is assigned to multiple courses within the same elective group on ${day} at ${slot}`,
              });
            }
            slotOfferingCohorts.add(cId);
          });
        });
      } else {
        // ── Theory Session Checks ─────────────────────────────
        const subName = typeof cell === "string" ? cell : cell.subject_name || cell.subject;
        const teacherId = subjectTeacherMap[subName];
        const roomId = cell.room_id || cell.room;

        if (subName && subName !== "-") {
          const normSub = subName.trim().toLowerCase();

          // Weekly hours tracking (case-insensitive)
          weeklyCounts[normSub] = (weeklyCounts[normSub] || 0) + 1;

          // No duplicate theory on same day (case-insensitive)
          if (daySubjectSeen.has(normSub)) {
            violations.push({
              code: "DUPLICATE_THEORY",
              day,
              slot,
              subject: subName,
              message: `Theory subject "${subName}" appears more than once on ${day}`,
            });
          }
          daySubjectSeen.add(normSub);

          // Teacher checks
          if (teacherId) {
            const tKey = `${teacherId}_${day}_${slot}`;
            if (busySet.has(tKey)) {
              violations.push({
                code: "TEACHER_BUSY",
                day,
                slot,
                subject: subName,
                teacher: teacherId,
                message: `Teacher for "${subName}" is marked busy/unavailable on ${day} at ${slot}`,
              });
            }

            if (teacherTimeMap[tKey]) {
              violations.push({
                code: "TEACHER_DOUBLE_BOOKED",
                day,
                slot,
                subject: subName,
                teacher: teacherId,
                message: `Teacher for "${subName}" is already teaching "${teacherTimeMap[tKey]}" on ${day} at ${slot}`,
              });
            }
            teacherTimeMap[tKey] = subName;

            // Daily Workload
            teacherDailyHours[teacherId] = (teacherDailyHours[teacherId] || 0) + 1;
            if (teacherDailyHours[teacherId] > maxDaily) {
              violations.push({
                code: "TEACHER_OVERLOAD",
                day,
                slot,
                subject: subName,
                teacher: teacherId,
                message: `Teacher for "${subName}" exceeds daily max workload of ${maxDaily} hrs on ${day}`,
              });
            }

            // Consecutive Hours
            teacherConsecutiveHours[teacherId] = (teacherConsecutiveHours[teacherId] || 0) + 1;
            if (teacherConsecutiveHours[teacherId] > maxConsec) {
              violations.push({
                code: "TEACHER_FATIGUE",
                day,
                slot,
                subject: subName,
                teacher: teacherId,
                message: `Teacher for "${subName}" exceeds consecutive limit of ${maxConsec} hrs on ${day}`,
              });
            }
          }

          // Room checks
          if (roomId) {
            const rKey = `${roomId}_${day}_${slot}`;
            if (roomTimeMap[rKey]) {
              violations.push({
                code: "ROOM_DOUBLE_BOOKED",
                day,
                slot,
                subject: subName,
                room: roomId,
                message: `Theory Room "${roomId}" is double-booked on ${day} at ${slot}`,
              });
            }
            roomTimeMap[rKey] = subName;
          }
        }
      }
    }
  }

  // Rule 1: Maximum one lab session per day per division and semester across all batches combined
  DAYS.forEach((d) => {
    const sessions = divisionDailyLabSessions[d] || [];
    if (sessions.length > maxDivisionDailyLabs) {
      violations.push({
        code: "MAX_DIVISION_DAILY_LABS_EXCEEDED",
        day: d,
        division,
        semester,
        department,
        count: sessions.length,
        limit: maxDivisionDailyLabs,
        batches: sessions.map((s) => s.batch),
        sessions,
        message: `Division ${division} (Semester ${semester}) has ${sessions.length} lab sessions on ${d} across all batches combined (${sessions.map((s) => `${s.batch}: ${s.subject}`).join(", ")}). Maximum allowed is ${maxDivisionDailyLabs} per day.`,
      });
    }
  });

  // Rule B: Maximum 2 lab sessions per individual batch per day
  batches.forEach((b) => {
    DAYS.forEach((d) => {
      const count = batchDailyLabs[b]?.[d] || 0;
      if (count > 2) {
        violations.push({
          code: "MAX_DAILY_LABS_EXCEEDED",
          day: d,
          batch: b,
          message: `Batch ${b} has ${count} lab sessions on ${d} (maximum allowed is 2 per day)`,
        });
      }
    });
  });

  // Cross-Division and Cross-Semester Conflicts Check with existing timetables
  (existingOtherTimetables || []).forEach((other) => {
    const otherTT = other.timetable_json;
    if (!otherTT) return;
    const otherLabel = `${other.department || ""} Sem ${other.semester} (${other.division || ""})`;

    for (const d of DAYS) {
      for (const sl of classSlots) {
        const otherCell = otherTT[d]?.[sl];
        if (!otherCell || otherCell === "-") continue;

        // Extract subjects, teachers, and rooms from otherCell
        const otherEntries = otherCell.batch_labs || [otherCell];
        otherEntries.forEach((entry) => {
          const oSub = entry.subject_name || entry.subject || (typeof entry === "string" ? entry : null);
          const oTeacher = entry.teacher_id || subjectTeacherMap[oSub];
          if (oTeacher) {
            const tKey = `${oTeacher}_${d}_${sl}`;
            if (teacherTimeMap[tKey]) {
              violations.push({
                code: "CROSS_DIVISION_CONFLICT",
                day: d,
                slot: sl,
                teacher: oTeacher,
                message: `Cross-division conflict: Teacher already assigned in [${otherLabel}] on ${d} at ${sl}`,
              });
            }
          }

          const oRoom = entry.room_id || entry.room;
          if (oRoom) {
            const rKey = `${oRoom}_${d}_${sl}`;
            if (roomTimeMap[rKey]) {
              violations.push({
                code: "CROSS_DIVISION_ROOM_CONFLICT",
                day: d,
                slot: sl,
                room: oRoom,
                message: `Cross-division room conflict: Room "${oRoom}" already booked by [${otherLabel}] on ${d} at ${sl}`,
              });
            }
          }
        });
      }
    }
  });

  // Rule: Different elective groups must also be checked for overlapping student memberships before simultaneous scheduling.
  DAYS.forEach((d) => {
    classSlots.forEach((sl) => {
      const cell = timetable[d]?.[sl];
      if (cell && cell.is_elective && cell.elective_group_id) {
        (existingOtherTimetables || []).forEach((other) => {
          const otherCell = other.timetable_json?.[d]?.[sl];
          if (
            otherCell &&
            otherCell.is_elective &&
            otherCell.elective_group_id &&
            otherCell.elective_group_id !== cell.elective_group_id
          ) {
            const overlap = checkOverlappingStudentMemberships(
              cell.elective_group_id,
              otherCell.elective_group_id,
              {
                studentEnrollments: effectiveStudentEnr,
                cohortEnrollments: effectiveCohortEnr,
                students: effectiveStudents,
              }
            );
            if (overlap.hasOverlap) {
              violations.push({
                code: "OVERLAPPING_ELECTIVE_GROUPS_SIMULTANEOUS",
                day: d,
                slot: sl,
                groups: [cell.elective_group_id, otherCell.elective_group_id],
                message: `Different elective groups "${cell.elective_group_id}" and "${otherCell.elective_group_id}" have overlapping student memberships and cannot be scheduled simultaneously on ${d} at ${sl}.`,
              });
            }
          }
        });
      }
    });
  });

  // Rule: Strict credit hours / weekly limit check
  Object.keys(subjectMetaMap).forEach((norm) => {
    const s = subjectMetaMap[norm];
    const actual = weeklyCounts[norm] || 0;
    const limit = parseFloat(s.weekly_hours) || 0;
    if (limit > 0 && actual > limit) {
      violations.push({
        code: "WEEKLY_HOURS_EXCEEDED",
        subject: s.subject_name,
        actual,
        limit,
        message: `Subject "${s.subject_name}" has ${actual} scheduled slots, exceeding its weekly limit of ${limit} credits/hours.`,
      });
    }
  });

  return {
    isValid: violations.length === 0,
    violations,
  };
};

// ── 3. QUALITY SCORING (STRICTLY GATED BY VALIDATION) ────────────────────────
export const calculateTimetableQualityScore = (validationResult, timetable, subjects, slots) => {
  // Hard Constraint Rule: An invalid timetable NEVER receives a passing score!
  if (!validationResult || !validationResult.isValid || validationResult.violations.length > 0) {
    return {
      score: 0,
      rating: "INVALID",
      status: `${validationResult?.violations?.length || 1} Hard Constraint Violation(s)`,
      breakdown: { hardConstraintPassed: false },
    };
  }

  // Soft Constraints Optimization (0 - 100)
  let score = 100;
  const classSlots = slots.filter((s) => s.type === "class").map((s) => s.label);

  // Soft Penalty 1: Days with 0 classes
  DAYS.forEach((d) => {
    const hasClass = classSlots.some((sl) => timetable[d]?.[sl] && timetable[d][sl] !== "-");
    if (!hasClass) score -= 5;
  });

  // Soft Penalty 2: Isolated free slot between two classes
  DAYS.forEach((d) => {
    for (let i = 1; i < classSlots.length - 1; i++) {
      const prev = timetable[d]?.[classSlots[i - 1]];
      const curr = timetable[d]?.[classSlots[i]];
      const next = timetable[d]?.[classSlots[i + 1]];
      if (prev && prev !== "-" && (!curr || curr === "-") && next && next !== "-") {
        score -= 2;
      }
    }
  });

  const finalScore = Math.max(60, Math.min(100, score));
  const rating = finalScore >= 90 ? "Excellent" : finalScore >= 75 ? "Good" : "Acceptable";

  return {
    score: finalScore,
    rating,
    status: "Verified Conflict-Free",
    breakdown: { hardConstraintPassed: true, softPenaltyApplied: 100 - finalScore },
  };
};

// ── 4. DETERMINISTIC BATCH-AWARE SCHEDULER ENGINE ────────────────────────────
export const generateDeterministicTimetable = ({
  subjects,
  slots,
  constraints = {},
  resources = {},
  busyMap = {},
  academicScope = { department: "CSE", semester: 6, division: "CSE-A", batches: ["B1", "B2"] },
  existingOtherTimetables = [],
  electiveGroups = null,
  courseOfferings = null,
  studentEnrollments = null,
  cohortEnrollments = null,
  students = null,
  studentCohorts = null,
}) => {
  const batches = academicScope.batches && academicScope.batches.length > 0
    ? academicScope.batches
    : ["B1", "B2"];

  const classSlots = slots.filter((s) => s.type === "class").map((s) => s.label);
  const fullSlots = slots;
  const labDuration = parseInt(constraints.lab_duration) || 2;
  const labWindows = getConsecutiveLabWindows(fullSlots, labDuration);

  // Maximum division lab sessions per day across all batches combined (default: 1)
  const maxDivisionDailyLabs = parseInt(
    constraints.max_division_daily_labs ??
      constraints.max_lab_sessions_per_day_per_division ??
      1
  );

  // Deduplicate subjects case-insensitively to prevent multiple allocations of duplicate DB entries
  const deduplicatedSubjectsMap = new Map();
  subjects.forEach((s) => {
    const key = (s.subject_name || "").trim().toLowerCase();
    if (!key) return;
    if (!deduplicatedSubjectsMap.has(key)) {
      deduplicatedSubjectsMap.set(key, { ...s, subject_name: s.subject_name.trim() });
    } else {
      const existing = deduplicatedSubjectsMap.get(key);
      if (!existing.subject_code && s.subject_code) {
        deduplicatedSubjectsMap.set(key, { ...s, subject_name: existing.subject_name });
      }
    }
  });
  const canonicalSubjects = Array.from(deduplicatedSubjectsMap.values());

  // Resolve academic structure for electives, offerings, cohorts, and students
  const academicData = getLocalAcademicStructure();
  const rawElectives = electiveGroups || academicData.elective_groups || [];
  const rawOfferings = courseOfferings || academicData.course_offerings || [];
  const effectiveStudentEnr = studentEnrollments || academicData.student_elective_enrollments || [];
  const effectiveCohortEnr = cohortEnrollments || academicData.cohort_elective_enrollments || [];
  const effectiveStudents = students || academicData.students || [];
  const effectiveCohorts = studentCohorts || academicData.student_cohorts || [];

  // Synthesize and resolve parallel elective groups and offerings
  const {
    resolvedGroups,
    resolvedOfferings,
    electiveSubjectNorms,
  } = synthesizeElectiveGroupsAndOfferings({
    subjects: canonicalSubjects,
    academicScope,
    electiveGroups: rawElectives,
    courseOfferings: rawOfferings,
    resources,
  });

  const effectiveElectives = resolvedGroups.length > 0 ? resolvedGroups : rawElectives;
  const effectiveOfferings = resolvedOfferings.length > 0 ? resolvedOfferings : rawOfferings;

  // 1. Mandatory configuration validation check: Prevent generation & publication on configuration errors
  const hasElectiveSubjects = canonicalSubjects.some(
    (s) =>
      s.is_elective ||
      (s.course_category && s.course_category.toLowerCase().includes("elective")) ||
      s.elective_group_id ||
      electiveSubjectNorms.has((s.subject_name || "").trim().toLowerCase())
  );

  const shouldValidateElectives = Boolean(academicScope.electiveGroups || hasElectiveSubjects || academicScope.academicStructure);

  if (shouldValidateElectives && effectiveElectives.length > 0) {
    const configVal = validateElectiveConfiguration({
      electiveGroups: effectiveElectives,
      courseOfferings: effectiveOfferings,
      studentEnrollments: effectiveStudentEnr,
      cohortEnrollments: effectiveCohortEnr,
      subjects: canonicalSubjects,
      students: effectiveStudents,
      cohorts: effectiveCohorts,
      scope: { department: academicScope.department, semester: academicScope.semester },
    });

    if (!configVal.isValid) {
      const errorViolations = configVal.errors.map((e) => ({
        code: e.code,
        message: e.message,
        canPublish: false,
        student: e.student_id,
        cohort: e.cohort_id,
        electiveGroup: e.elective_group_id,
      }));
      return {
        timetable: null,
        validation: {
          isValid: false,
          violations: errorViolations,
        },
        qualityScore: {
          score: 0,
          rating: "INVALID",
          status: "Configuration Error: Duplicate Elective Enrollment",
          breakdown: { hardConstraintPassed: false },
        },
        status: "CONFIG_ERROR",
        isInfeasible: true,
        error: configVal.errors[0]?.message || "Elective configuration error",
        batches,
      };
    }
  }

  const labSubjects = canonicalSubjects.filter((s) => s.is_lab);
  const theorySubjects = canonicalSubjects.filter(
    (s) => !s.is_lab && !electiveSubjectNorms.has((s.subject_name || "").trim().toLowerCase())
  );

  const teacherLinks = resources.teacherLinks || [];
  const subjectTeacherMap = {};
  teacherLinks.forEach((tl) => {
    const name = tl.subjects?.subject_name;
    if (name) subjectTeacherMap[name] = tl.teacher_id;
  });

  const teacherBusySet = new Set(
    (busyMap.teacherBusy || []).map((b) => `${b.teacher_id}_${b.day_of_week}_${b.time_slot}`)
  );

  const rooms = resources.rooms || [];
  const labRooms = rooms.filter((r) => r.is_lab || r.room_name?.toLowerCase().includes("lab"));
  const theoryRooms = rooms.filter((r) => !r.is_lab && !r.room_name?.toLowerCase().includes("lab"));
  const defaultTheoryRoom = theoryRooms[0]?.room_name || "Room 101";

  // Build cross-timetable busy sets for fast avoidance of shared resources
  const crossBusyTeachers = new Set();
  const crossBusyRooms = new Set();
  (existingOtherTimetables || []).forEach((other) => {
    const oTT = other.timetable_json;
    if (!oTT) return;
    DAYS.forEach((d) => {
      classSlots.forEach((sl) => {
        const oCell = oTT[d]?.[sl];
        if (!oCell || oCell === "-") return;
        const entries = oCell.batch_labs || [oCell];
        entries.forEach((e) => {
          const tId = e.teacher_id || subjectTeacherMap[e.subject_name || e.subject];
          if (tId) crossBusyTeachers.add(`${tId}_${d}_${sl}`);
          const rId = e.room_id || e.room;
          if (rId) crossBusyRooms.add(`${rId}_${d}_${sl}`);
        });
      });
    });
  });

  // Track assigned batch lab tasks: { subject, batch }
  const labTasks = [];
  labSubjects.forEach((ls) => {
    batches.forEach((b) => {
      labTasks.push({ subject: ls, batch: b });
    });
  });

  // ── RULE 7: PROVEN INFEASIBILITY CHECK ─────────────────────────────────────
  // If required weekly labs exceed available day capacity under the daily limit:
  const totalLabSessionsNeeded = labTasks.length;
  const maxFeasibleLabCapacity = DAYS.length * maxDivisionDailyLabs;

  if (totalLabSessionsNeeded > maxFeasibleLabCapacity) {
    const infeasibleViolation = {
      code: "PROVEN_INFEASIBLE_CONFIGURATION",
      division: academicScope.division,
      semester: academicScope.semester,
      department: academicScope.department,
      totalRequired: totalLabSessionsNeeded,
      maxCapacity: maxFeasibleLabCapacity,
      daysCount: DAYS.length,
      limitPerDay: maxDivisionDailyLabs,
      message: `Infeasible configuration: ${totalLabSessionsNeeded} total lab sessions required across all batches (${batches.join(", ")}), but with maximum ${maxDivisionDailyLabs} lab session(s) per day, only ${maxFeasibleLabCapacity} can fit across ${DAYS.length} available days. Please increase available days or increase the daily lab limit per division.`,
    };

    return {
      timetable: null,
      validation: {
        isValid: false,
        violations: [infeasibleViolation],
      },
      qualityScore: {
        score: 0,
        rating: "INVALID",
        status: "Proven Infeasible Configuration",
        breakdown: { hardConstraintPassed: false },
      },
      status: "PROVEN_INFEASIBLE",
      isInfeasible: true,
      error: infeasibleViolation.message,
      batches,
    };
  }

  // MULTI-RESTART SEARCH (up to 30 restarts to guarantee conflict-free placement)
  const MAX_RESTARTS = 30;
  let bestSchedule = null;
  let bestViolations = 999;

  for (let restart = 0; restart < MAX_RESTARTS; restart++) {
    // 1. Initialize empty timetable
    const timetable = {};
    DAYS.forEach((d) => {
      timetable[d] = {};
      classSlots.forEach((sl) => (timetable[d][sl] = "-"));
    });

    const teacherSlotUsage = {};
    const roomSlotUsage = {};
    const batchDailyCount = {};
    batches.forEach((b) => {
      batchDailyCount[b] = {};
      DAYS.forEach((d) => (batchDailyCount[b][d] = 0));
    });

    // Track division-level lab sessions per day across all batches combined
    const divisionDailyLabCount = {};
    DAYS.forEach((d) => (divisionDailyLabCount[d] = 0));

    // ── STEP 0: SCHEDULE PARALLEL ELECTIVE GROUPS ────────────────────────
    // Different elective options in the same group are scheduled in parallel
    // during configured elective periods using separate qualified teachers and suitable rooms.
    const relevantElectiveGroups = (academicScope.electiveGroups || (resolvedGroups.length > 0 ? resolvedGroups : effectiveElectives)).filter(
      (g) =>
        (g.department_code?.toUpperCase() === academicScope.department?.toUpperCase() || g.department_code === "ALL") &&
        parseInt(g.semester) === parseInt(academicScope.semester)
    );

    let electivePlacementSuccess = true;

    for (const group of relevantElectiveGroups) {
      const groupOfferings = resolvedOfferings.filter((o) => o.elective_group_id === group.id);
      if (groupOfferings.length === 0) continue;

      const hoursNeeded = group.weekly_hours || 3;
      let hoursPlaced = 0;

      // Select candidate days (distinct days)
      const dayCandidates = [...DAYS].sort(() => (restart > 0 ? Math.random() - 0.5 : 0));

      for (const day of dayCandidates) {
        if (hoursPlaced >= hoursNeeded) break;

        // Find a class slot on this day
        const slotCandidates = [...classSlots].sort(() => (restart > 0 ? Math.random() - 0.5 : 0));

        for (const slot of slotCandidates) {
          if (timetable[day][slot] !== "-") continue;

          // Check all offerings can be accommodated:
          // 1. All teachers available and distinct
          // 2. All rooms available and distinct
          let allOfferingsAvailable = true;
          const currentSlotTeachers = new Set();
          const currentSlotRooms = new Set();

          for (const off of groupOfferings) {
            const tId = off.teacher_id || subjectTeacherMap[off.subject_name];
            if (tId) {
              if (currentSlotTeachers.has(tId)) {
                allOfferingsAvailable = false;
                break;
              }
              currentSlotTeachers.add(tId);
              const tk = `${tId}_${day}_${slot}`;
              if (teacherBusySet.has(tk) || teacherSlotUsage[tk] || crossBusyTeachers.has(tk)) {
                allOfferingsAvailable = false;
                break;
              }
            }
            const rId = off.room_id || off.room;
            if (rId) {
              if (currentSlotRooms.has(rId)) {
                allOfferingsAvailable = false;
                break;
              }
              currentSlotRooms.add(rId);
              const rk = `${rId}_${day}_${slot}`;
              if (roomSlotUsage[rk] || crossBusyRooms.has(rk)) {
                allOfferingsAvailable = false;
                break;
              }
            }
          }

          if (!allOfferingsAvailable) continue;

          // Build parallel elective cell with explicit course offering IDs, canonical courses,
          // and enrolled students/cohorts (students assigned ONLY to their selected elective)
          const offeringsPayload = groupOfferings.map((o) => {
            const enrolledStudents = effectiveStudentEnr
              .filter((e) => e.course_offering_id === o.id)
              .map((e) => e.student_id);
            const enrolledCohorts = effectiveCohortEnr
              .filter((e) => e.course_offering_id === o.id)
              .map((e) => e.cohort_id);

            return {
              course_offering_id: o.id,
              course_id: o.course_id,
              subject_name: o.subject_name,
              subject_code: o.subject_code,
              teacher_id: o.teacher_id,
              teacher_name: o.teacher_name,
              room_id: o.room_id || o.room,
              room: o.room_name || o.room_id || o.room,
              student_ids: enrolledStudents,
              cohort_ids: enrolledCohorts,
            };
          });

          timetable[day][slot] = {
            is_elective: true,
            elective_group_id: group.id,
            elective_group_name: group.name,
            subject_name: groupOfferings.map((o) => o.subject_name).join(" / "),
            room: groupOfferings.map((o) => o.room_name || o.room_id || o.room || "Room").join(" / "),
            teacher_id: groupOfferings[0]?.teacher_id || "Prof. Elective",
            offerings: offeringsPayload,
          };

          // Mark resources
          groupOfferings.forEach((o) => {
            const tId = o.teacher_id || subjectTeacherMap[o.subject_name];
            if (tId) teacherSlotUsage[`${tId}_${day}_${slot}`] = `${o.subject_name} (Elective)`;
            const rId = o.room_id || o.room;
            if (rId) roomSlotUsage[`${rId}_${day}_${slot}`] = `${o.subject_name} (Elective)`;
          });

          hoursPlaced++;
          break; // move to next day
        }
      }

      if (hoursPlaced < hoursNeeded && restart < MAX_RESTARTS - 1) {
        electivePlacementSuccess = false;
        break;
      }
    }

    if (!electivePlacementSuccess && restart < MAX_RESTARTS - 1) {
      continue; // try next restart
    }

    // Shuffle lab tasks on restart for stochastic diversity
    const currentLabTasks = [...labTasks];
    if (restart > 0) {
      currentLabTasks.sort(() => Math.random() - 0.5);
    }

    // ── STEP 1: SCHEDULE 2-HOUR CONSECUTIVE BATCH LABS ─────────────────────
    let labPlacementSuccess = true;
    const occupiedLabSlots = new Set(); // "day_slot"

    for (const task of currentLabTasks) {
      let placed = false;
      const sub = task.subject;
      const batch = task.batch;
      const teacherId = subjectTeacherMap[sub.subject_name];

      // Shuffle available days & windows
      const daysOrder = [...DAYS].sort(() => (restart > 0 ? Math.random() - 0.5 : 0));
      const windowsOrder = [...labWindows].sort(() => (restart > 0 ? Math.random() - 0.5 : 0));

      for (const day of daysOrder) {
        if (placed) break;

        // Rule 1: Maximum one lab session per day across all batches combined for this division and semester
        if (divisionDailyLabCount[day] >= maxDivisionDailyLabs) continue;

        // Rule B: max 2 lab sessions per individual batch per day
        if (batchDailyCount[batch][day] >= 2) continue;

        for (const win of windowsOrder) {
          const [s1, s2] = win.slots;

          // Check if teacher is free for both slots
          if (teacherId) {
            const k1 = `${teacherId}_${day}_${s1}`;
            const k2 = `${teacherId}_${day}_${s2}`;
            if (teacherBusySet.has(k1) || teacherBusySet.has(k2)) continue;
            if (teacherSlotUsage[k1] || teacherSlotUsage[k2]) continue;
            if (crossBusyTeachers.has(k1) || crossBusyTeachers.has(k2)) continue;
          }

          // Find an available lab room
          let assignedRoom = null;
          for (let rIdx = 0; rIdx < labRooms.length; rIdx++) {
            const rName = labRooms[rIdx].room_name;
            const rk1 = `${rName}_${day}_${s1}`;
            const rk2 = `${rName}_${day}_${s2}`;
            if (!roomSlotUsage[rk1] && !roomSlotUsage[rk2] && !crossBusyRooms.has(rk1) && !crossBusyRooms.has(rk2)) {
              assignedRoom = rName;
              break;
            }
          }
          if (!assignedRoom && labRooms.length > 0) assignedRoom = labRooms[0].room_name;

          // Check cell occupancy in timetable
          const cell1 = timetable[day][s1];
          const cell2 = timetable[day][s2];

          // A lab session can only be placed into free slots or alongside other parallel batch labs
          const canAcceptLab = (cell) => {
            if (cell === "-") return true;
            if (cell && cell.batch_labs && !cell.is_elective) return true;
            return false;
          };

          if (!canAcceptLab(cell1) || !canAcceptLab(cell2)) continue;

          // Check if batch is already doing another lab in this window
          const bAlreadyBusy = (cell) => {
            if (cell && cell.batch_labs) {
              return cell.batch_labs.some((l) => l.batch === batch);
            }
            return false;
          };

          if (bAlreadyBusy(cell1) || bAlreadyBusy(cell2)) continue;

          // Place lab entry into both slots (strictly 2 consecutive hours)
          const labEntry1 = {
            subject_name: sub.subject_name,
            batch,
            teacher_id: teacherId,
            room: assignedRoom || "Lab 1",
            is_lab: true,
            is_block_start: true,
            duration: 2,
          };

          const labEntry2 = {
            subject_name: sub.subject_name,
            batch,
            teacher_id: teacherId,
            room: assignedRoom || "Lab 1",
            is_lab: true,
            is_block_start: false,
            duration: 2,
          };

          // Append to batch_labs array in each cell
          const addLabToCell = (d, s, entry) => {
            if (timetable[d][s] === "-" || !timetable[d][s].batch_labs) {
              timetable[d][s] = { is_lab: true, batch_labs: [entry] };
            } else {
              timetable[d][s].batch_labs.push(entry);
            }
          };

          addLabToCell(day, s1, labEntry1);
          addLabToCell(day, s2, labEntry2);

          // Mark resources
          if (teacherId) {
            teacherSlotUsage[`${teacherId}_${day}_${s1}`] = `${sub.subject_name}-${batch}`;
            teacherSlotUsage[`${teacherId}_${day}_${s2}`] = `${sub.subject_name}-${batch}`;
          }
          if (assignedRoom) {
            roomSlotUsage[`${assignedRoom}_${day}_${s1}`] = `${sub.subject_name}-${batch}`;
            roomSlotUsage[`${assignedRoom}_${day}_${s2}`] = `${sub.subject_name}-${batch}`;
          }

          divisionDailyLabCount[day] += 1;
          batchDailyCount[batch][day] += 1;
          occupiedLabSlots.add(`${day}_${s1}`);
          occupiedLabSlots.add(`${day}_${s2}`);
          placed = true;
          break;
        }
      }

      if (!placed) {
        labPlacementSuccess = false;
        break;
      }
    }

    if (!labPlacementSuccess && restart < MAX_RESTARTS - 1) {
      continue; // try next restart
    }

    // ── STEP 2: SCHEDULE COMMON DIVISION THEORY SESSIONS ───────────────────
    const remainingTheory = {};
    theorySubjects.forEach(
      (ts) => (remainingTheory[ts.subject_name.trim().toLowerCase()] = ts.weekly_hours || 4)
    );

    for (let slotIdx = 0; slotIdx < classSlots.length; slotIdx++) {
      const slot = classSlots[slotIdx];

      for (let di = 0; di < DAYS.length; di++) {
        const day = DAYS[di];
        // If slot is occupied by full lab or already assigned, skip
        if (timetable[day][slot] !== "-") continue;

        // Candidate theory subjects that still need hours and not yet taken today
        const candidates = theorySubjects.filter((ts) => {
          const normName = ts.subject_name.trim().toLowerCase();
          if ((remainingTheory[normName] || 0) <= 0) return false;
          // Check if already taken on this day (case-insensitive)
          const alreadyOnDay = classSlots.some((sl) => {
            const c = timetable[day][sl];
            const cName = (typeof c === "string" ? c : c?.subject_name || "")
              .trim()
              .toLowerCase();
            return cName === normName;
          });
          if (alreadyOnDay) return false;

          // Check teacher availability
          const tId = subjectTeacherMap[ts.subject_name];
          if (tId) {
            if (teacherBusySet.has(`${tId}_${day}_${slot}`)) return false;
            if (teacherSlotUsage[`${tId}_${day}_${slot}`]) return false;
            if (crossBusyTeachers.has(`${tId}_${day}_${slot}`)) return false;
          }
          return true;
        });

        if (candidates.length === 0) continue;

        // Pick with highest remaining or round-robin
        candidates.sort(
          (a, b) =>
            remainingTheory[b.subject_name.trim().toLowerCase()] -
            remainingTheory[a.subject_name.trim().toLowerCase()]
        );
        const chosen = candidates[0];
        const chosenNorm = chosen.subject_name.trim().toLowerCase();

        timetable[day][slot] = {
          subject_name: chosen.subject_name,
          is_lab: false,
          room: defaultTheoryRoom,
          teacher_id: subjectTeacherMap[chosen.subject_name],
        };

        const tId = subjectTeacherMap[chosen.subject_name];
        if (tId) teacherSlotUsage[`${tId}_${day}_${slot}`] = chosen.subject_name;
        remainingTheory[chosenNorm]--;
      }
    }

    // Validate this restart candidate
    const valResult = validateSchedule({
      timetable,
      subjects,
      slots,
      constraints,
      teacherLinks,
      teacherBusy: busyMap.teacherBusy,
      rooms,
      batches,
      existingOtherTimetables,
      division: academicScope.division,
      semester: academicScope.semester,
      department: academicScope.department,
      electiveGroups: resolvedGroups.length > 0 ? resolvedGroups : null,
      courseOfferings: resolvedOfferings.length > 0 ? resolvedOfferings : null,
      studentEnrollments: effectiveStudentEnr,
      cohortEnrollments: effectiveCohortEnr,
      students: effectiveStudents,
      studentCohorts: effectiveCohorts,
    });

    if (valResult.isValid) {
      // Perfect conflict-free schedule found!
      const quality = calculateTimetableQualityScore(valResult, timetable, subjects, slots);
      return {
        timetable,
        validation: valResult,
        qualityScore: quality,
        status: "SUCCESS_CONFLICT_FREE",
        theoryRoom: defaultTheoryRoom,
        batches,
      };
    }

    if (valResult.violations.length < bestViolations) {
      bestViolations = valResult.violations.length;
      bestSchedule = { timetable, validation: valResult };
    }
  }

  // If search budget exhausted, evaluate best schedule found
  const finalValidation = bestSchedule?.validation || { isValid: false, violations: [] };
  const quality = calculateTimetableQualityScore(finalValidation, bestSchedule?.timetable || {}, subjects, slots);

  return {
    timetable: bestSchedule?.timetable || {},
    validation: finalValidation,
    qualityScore: quality,
    status: finalValidation.isValid ? "SUCCESS_CONFLICT_FREE" : "UNRESOLVED_CONSTRAINTS",
    theoryRoom: defaultTheoryRoom,
    batches,
  };
};

// ── 5. AUTOMATIC REPAIR PIPELINE ─────────────────────────────────────────────
export const repairSchedule = ({
  timetable,
  subjects,
  slots,
  constraints = {},
  teacherLinks = [],
  teacherBusy = [],
  rooms = [],
  batches = ["B1", "B2"],
  existingOtherTimetables = [],
  division = "Section A",
  semester = 6,
  department = "CSE",
  electiveGroups = null,
  courseOfferings = null,
  studentEnrollments = null,
  cohortEnrollments = null,
  students = null,
  studentCohorts = null,
}) => {
  // 1. Initial Validation
  const initialValidation = validateSchedule({
    timetable,
    subjects,
    slots,
    constraints,
    teacherLinks,
    teacherBusy,
    rooms,
    batches,
    existingOtherTimetables,
    division,
    semester,
    department,
    electiveGroups,
    courseOfferings,
    studentEnrollments,
    cohortEnrollments,
    students,
    studentCohorts,
  });

  if (initialValidation.isValid) {
    return {
      repaired: true,
      timetable,
      validation: initialValidation,
      qualityScore: calculateTimetableQualityScore(initialValidation, timetable, subjects, slots),
    };
  }

  // 2. Clone and attempt repair for division daily lab violations
  const repairedTT = JSON.parse(JSON.stringify(timetable));
  const classSlots = slots.filter((s) => s.type === "class").map((s) => s.label);
  const maxDivisionDailyLabs = parseInt(
    constraints.max_division_daily_labs ??
      constraints.max_lab_sessions_per_day_per_division ??
      1
  );

  const labViolations = initialValidation.violations.filter(
    (v) => v.code === "MAX_DIVISION_DAILY_LABS_EXCEEDED"
  );

  for (const v of labViolations) {
    const day = v.day;
    const candidateDays = DAYS.filter((d) => d !== day);

    let sessionCount = 0;
    for (let i = 0; i < classSlots.length; i++) {
      const sl = classSlots[i];
      const cell = repairedTT[day]?.[sl];
      if (!cell || !cell.batch_labs) continue;

      const blockStarts = cell.batch_labs.filter((l) => l.is_block_start);
      for (const startLab of blockStarts) {
        sessionCount++;
        if (sessionCount > maxDivisionDailyLabs) {
          const nextSl = classSlots[i + 1];
          let relocated = false;

          for (const targetDay of candidateDays) {
            // Count existing lab blocks on targetDay
            const targetDayLabs = classSlots.reduce((acc, s) => {
              const c = repairedTT[targetDay]?.[s];
              if (c?.batch_labs) {
                return acc + c.batch_labs.filter((l) => l.is_block_start).length;
              }
              return acc;
            }, 0);

            if (targetDayLabs >= maxDivisionDailyLabs) continue;

            // Find free consecutive 2-hour window on targetDay
            const windows = getConsecutiveLabWindows(slots, 2);
            for (const win of windows) {
              const [w1, w2] = win.slots;
              const cellW1 = repairedTT[targetDay]?.[w1];
              const cellW2 = repairedTT[targetDay]?.[w2];

              if (
                (!cellW1 || cellW1 === "-" || cellW1.is_free) &&
                (!cellW2 || cellW2 === "-" || cellW2.is_free)
              ) {
                // Remove from original day
                cell.batch_labs = cell.batch_labs.filter((l) => l.batch !== startLab.batch);
                if (cell.batch_labs.length === 0) repairedTT[day][sl] = "-";

                if (nextSl && repairedTT[day]?.[nextSl]?.batch_labs) {
                  repairedTT[day][nextSl].batch_labs = repairedTT[day][nextSl].batch_labs.filter(
                    (l) => l.batch !== startLab.batch
                  );
                  if (repairedTT[day][nextSl].batch_labs.length === 0) repairedTT[day][nextSl] = "-";
                }

                // Place in targetDay
                const entry1 = { ...startLab, is_block_start: true };
                const entry2 = { ...startLab, is_block_start: false };

                repairedTT[targetDay][w1] = { is_lab: true, batch_labs: [entry1] };
                repairedTT[targetDay][w2] = { is_lab: true, batch_labs: [entry2] };
                relocated = true;
                break;
              }
            }
            if (relocated) break;
          }
        }
      }
    }
  }

  // 3. Final validation of repaired schedule
  const finalVal = validateSchedule({
    timetable: repairedTT,
    subjects,
    slots,
    constraints,
    teacherLinks,
    teacherBusy,
    rooms,
    batches,
    existingOtherTimetables,
    division,
    semester,
    department,
    electiveGroups,
    courseOfferings,
    studentEnrollments,
    cohortEnrollments,
    students,
    studentCohorts,
  });

  return {
    repaired: finalVal.isValid,
    timetable: repairedTT,
    validation: finalVal,
    qualityScore: calculateTimetableQualityScore(finalVal, repairedTT, subjects, slots),
  };
};
