/**
 * TimeTable AI — Elective Validation & Transactional Enrollment Service
 * 
 * Enforces the Mandatory Elective-Group Selection Rule:
 * 1. Each student may enroll in only ONE course offering per elective group for an academic term.
 * 2. If individual student enrollment data is unavailable, use explicitly configured student cohorts.
 *    Never invent student enrollment.
 * 3. Selecting an elective course must reference its existing course-offering ID linked to the canonical course ID.
 *    Never rely on course titles or comma-separated strings.
 * 4. Different elective groups must be checked for overlapping student memberships before simultaneous scheduling.
 * 5. If configuration assigns a student or cohort to multiple alternatives in the same group, report error and prevent publication.
 */

/**
 * Validate that an elective course offering references a valid existing course-offering ID
 * and canonical course ID (never freeform text or comma-separated strings).
 */
export const validateCourseOfferingReference = (offering, canonicalSubjects = []) => {
  if (!offering || typeof offering !== "object") {
    return {
      isValid: false,
      code: "INVALID_OFFERING_OBJECT",
      message: "Offering must be a valid object referencing existing course offering ID.",
    };
  }

  if (!offering.id || typeof offering.id !== "string" || offering.id.trim() === "") {
    return {
      isValid: false,
      code: "MISSING_OFFERING_ID",
      message: "Elective course offering must reference an explicit course_offering_id.",
    };
  }

  // Must reference canonical course_id
  const courseId = offering.course_id;
  if (courseId === undefined || courseId === null || courseId === "") {
    return {
      isValid: false,
      code: "MISSING_CANONICAL_COURSE_ID",
      message: `Course offering "${offering.id}" must link to a canonical course ID. Never rely on course titles or raw strings.`,
    };
  }

  // If canonical subjects list provided, verify membership
  if (canonicalSubjects && canonicalSubjects.length > 0) {
    const exists = canonicalSubjects.some(
      (s) =>
        String(s.id) === String(courseId) ||
        String(s.subject_code) === String(offering.subject_code) ||
        s.subject_name === offering.subject_name
    );
    if (!exists) {
      return {
        isValid: false,
        code: "INVALID_CANONICAL_COURSE_ID",
        message: `Course offering "${offering.id}" references course_id "${courseId}" which does not exist in canonical subjects catalog.`,
      };
    }
  }

  return { isValid: true };
};

/**
 * Transactional validation for enrolling a student into an elective group course offering.
 * Prevents duplicate enrollment in the same elective group for the given academic term.
 * Throws or returns an error if a student is already enrolled in another offering in this group.
 */
export const enrollStudentTransactional = (
  { student_id, elective_group_id, course_offering_id, academic_term = "current" },
  existingEnrollments = []
) => {
  if (!student_id || !elective_group_id || !course_offering_id) {
    throw new Error("Missing required enrollment fields: student_id, elective_group_id, course_offering_id.");
  }

  // Check if student already enrolled in this elective group for this term
  const duplicate = existingEnrollments.find(
    (e) =>
      e.student_id === student_id &&
      e.elective_group_id === elective_group_id &&
      (e.academic_term || "current") === academic_term
  );

  if (duplicate) {
    if (duplicate.course_offering_id === course_offering_id) {
      // Already enrolled in this exact offering, idempotent no-op
      return existingEnrollments;
    }
    // Attempting to enroll in a SECOND offering of the same elective group!
    const err = new Error(
      `[DUPLICATE_ELECTIVE_ENROLLMENT] Mandatory Elective Rule Violation: Student "${student_id}" is already enrolled in course offering "${duplicate.course_offering_id}" within elective group "${elective_group_id}". A student may enroll in only ONE course offering per group.`
    );
    err.code = "DUPLICATE_ELECTIVE_ENROLLMENT";
    err.student_id = student_id;
    err.elective_group_id = elective_group_id;
    throw err;
  }

  const newRecord = {
    id: `enr-stu-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    student_id,
    elective_group_id,
    course_offering_id,
    academic_term,
    created_at: new Date().toISOString(),
  };

  return [...existingEnrollments, newRecord];
};

/**
 * Transactional validation for assigning a student cohort to an elective course offering.
 * Prevents assigning a cohort to multiple alternatives within the same elective group.
 */
export const enrollCohortTransactional = (
  { cohort_id, elective_group_id, course_offering_id, academic_term = "current" },
  existingEnrollments = []
) => {
  if (!cohort_id || !elective_group_id || !course_offering_id) {
    throw new Error("Missing required cohort enrollment fields: cohort_id, elective_group_id, course_offering_id.");
  }

  const duplicate = existingEnrollments.find(
    (e) =>
      e.cohort_id === cohort_id &&
      e.elective_group_id === elective_group_id &&
      (e.academic_term || "current") === academic_term
  );

  if (duplicate) {
    if (duplicate.course_offering_id === course_offering_id) {
      return existingEnrollments;
    }
    const err = new Error(
      `[DUPLICATE_COHORT_ELECTIVE_ENROLLMENT] Mandatory Elective Rule Violation: Cohort "${cohort_id}" is already assigned to course offering "${duplicate.course_offering_id}" within elective group "${elective_group_id}". A cohort may enroll in only ONE course offering per group.`
    );
    err.code = "DUPLICATE_COHORT_ELECTIVE_ENROLLMENT";
    err.cohort_id = cohort_id;
    err.elective_group_id = elective_group_id;
    throw err;
  }

  const newRecord = {
    id: `enr-coh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    cohort_id,
    elective_group_id,
    course_offering_id,
    academic_term,
    created_at: new Date().toISOString(),
  };

  return [...existingEnrollments, newRecord];
};

/**
 * Validates the complete institutional elective configuration.
 * Reports all configuration errors and prevents timetable publication.
 * Supports both validateElectiveConfiguration(structure, subjects, scope)
 * and validateElectiveConfiguration({ electiveGroups, ... }) signatures.
 */
export const validateElectiveConfiguration = (arg1 = {}, arg2 = null, arg3 = null) => {
  let electiveGroups, courseOfferings, studentEnrollments, cohortEnrollments, subjects, students, cohorts, scope;

  const isPositional = arg1 && (arg1.departments || Array.isArray(arg2) || (arg1.divisions && arg1.elective_groups));

  if (isPositional) {
    const structure = arg1;
    electiveGroups = structure.elective_groups || structure.electiveGroups || [];
    courseOfferings = structure.course_offerings || structure.courseOfferings || [];
    studentEnrollments = structure.student_elective_enrollments || structure.studentEnrollments || [];
    cohortEnrollments = structure.cohort_elective_enrollments || structure.cohortEnrollments || [];
    students = structure.students || [];
    cohorts = structure.student_cohorts || structure.cohorts || [];
    subjects = Array.isArray(arg2) ? arg2 : [];
    scope = arg3 || null;
  } else {
    const opts = arg1 || {};
    electiveGroups = opts.electiveGroups || opts.elective_groups || [];
    courseOfferings = opts.courseOfferings || opts.course_offerings || [];
    studentEnrollments = opts.studentEnrollments || opts.student_elective_enrollments || [];
    cohortEnrollments = opts.cohortEnrollments || opts.cohort_elective_enrollments || [];
    subjects = opts.subjects || [];
    students = opts.students || [];
    cohorts = opts.cohorts || opts.student_cohorts || [];
    scope = opts.scope || null;
  }

  const errors = [];
  const warnings = [];

  const relevantGroups = scope && (scope.department || scope.semester)
    ? electiveGroups.filter(
        (g) =>
          (!scope.department || g.department_code?.toUpperCase() === scope.department?.toUpperCase() || (g.department_code === "ALL" && (scope.department === "ALL" || scope.includeCollegeWide))) &&
          (!scope.semester || parseInt(g.semester) === parseInt(scope.semester))
      )
    : electiveGroups;

  const groupMap = {};
  relevantGroups.forEach((g) => (groupMap[g.id] = g));

  const relevantOfferings = courseOfferings.filter((o) => groupMap[o.elective_group_id]);
  const offeringMap = {};
  relevantOfferings.forEach((o) => (offeringMap[o.id] = o));

  // 1. Verify relevant offerings have valid canonical references
  relevantOfferings.forEach((offering) => {
    const refCheck = validateCourseOfferingReference(offering, subjects);
    if (!refCheck.isValid) {
      errors.push({
        code: refCheck.code,
        offeringId: offering.id,
        groupId: offering.elective_group_id,
        message: refCheck.message,
      });
    }
  });

  // 2. Check for duplicate student enrollments in the same group
  const studentIdToCanonical = {};
  students.forEach((s) => {
    const primary = s.id || s.usn;
    if (s.id) studentIdToCanonical[s.id] = primary;
    if (s.usn) {
      studentIdToCanonical[s.usn] = primary;
      studentIdToCanonical[s.usn.toUpperCase()] = primary;
    }
  });

  const studentGroupSeen = {}; // key: "canonicalStudentId_groupId_term" -> courseOfferingId
  studentEnrollments.forEach((enr) => {
    const term = enr.academic_term || "current";
    const canonicalStudent = studentIdToCanonical[enr.student_id] || studentIdToCanonical[enr.student_id?.toUpperCase()] || enr.student_id;
    const key = `${canonicalStudent}_${enr.elective_group_id}_${term}`;
    if (studentGroupSeen[key] && studentGroupSeen[key] !== enr.course_offering_id) {
      const groupName = groupMap[enr.elective_group_id]?.name || enr.elective_group_id;
      errors.push({
        code: "DUPLICATE_ELECTIVE_ENROLLMENT",
        student_id: enr.student_id,
        elective_group_id: enr.elective_group_id,
        firstOffering: studentGroupSeen[key],
        secondOffering: enr.course_offering_id,
        message: `Configuration Error: Student "${enr.student_id}" is enrolled in multiple courses (${studentGroupSeen[key]} and ${enr.course_offering_id}) within the same elective group "${groupName}". Publication blocked.`,
      });
    } else {
      studentGroupSeen[key] = enr.course_offering_id;
    }
  });

  // 3. Check for duplicate cohort assignments in the same group
  const cohortGroupSeen = {}; // key: "cohortId_groupId_term" -> courseOfferingId
  cohortEnrollments.forEach((enr) => {
    const term = enr.academic_term || "current";
    const key = `${enr.cohort_id}_${enr.elective_group_id}_${term}`;
    if (cohortGroupSeen[key] && cohortGroupSeen[key] !== enr.course_offering_id) {
      const groupName = groupMap[enr.elective_group_id]?.name || enr.elective_group_id;
      errors.push({
        code: "DUPLICATE_COHORT_ELECTIVE_ENROLLMENT",
        cohort_id: enr.cohort_id,
        elective_group_id: enr.elective_group_id,
        firstOffering: cohortGroupSeen[key],
        secondOffering: enr.course_offering_id,
        message: `Configuration Error: Cohort "${enr.cohort_id}" is assigned to multiple alternatives (${cohortGroupSeen[key]} and ${enr.course_offering_id}) within the same elective group "${groupName}". Publication blocked.`,
      });
    } else {
      cohortGroupSeen[key] = enr.course_offering_id;
    }
  });

  // 4. Student Enrollment Availability Check
  // "If individual student enrollment data is unavailable, use explicitly configured student cohorts and elective-group assignments. Do not invent student enrollment."
  const hasStudentData = students.length > 0 && studentEnrollments.length > 0;
  const hasCohortData = cohorts.length > 0 || cohortEnrollments.length > 0;

  if (!hasStudentData && !hasCohortData) {
    warnings.push({
      code: "NO_STUDENT_OR_COHORT_DATA",
      message: "Neither individual student enrollments nor student cohorts configured. Configure cohorts before publishing.",
    });
  }

  return {
    isValid: errors.length === 0,
    canPublish: errors.length === 0,
    errors,
    violations: errors,
    warnings,
    enrollmentMode: hasStudentData ? "STUDENT_BASED" : "COHORT_BASED",
  };
};

/**
 * Checks whether two elective groups have overlapping student or cohort memberships.
 * Used before simultaneous scheduling of different elective groups.
 */
export const checkOverlappingStudentMemberships = (
  groupAId,
  groupBId,
  arg3 = {},
  arg4 = []
) => {
  if (groupAId === groupBId) {
    return { hasOverlap: true, overlappingStudents: [], overlappingCohorts: [] };
  }

  let studentEnrollments = [];
  let cohortEnrollments = [];
  let students = [];

  if (Array.isArray(arg3)) {
    cohortEnrollments = arg3;
    studentEnrollments = Array.isArray(arg4) ? arg4 : [];
  } else if (arg3 && typeof arg3 === "object") {
    studentEnrollments = arg3.studentEnrollments || arg3.student_elective_enrollments || [];
    cohortEnrollments = arg3.cohortEnrollments || arg3.cohort_elective_enrollments || [];
    students = arg3.students || [];
  }

  // 1. Check individual students if enrolled
  const studentsA = new Set(
    studentEnrollments.filter((e) => e.elective_group_id === groupAId).map((e) => e.student_id)
  );
  const studentsB = new Set(
    studentEnrollments.filter((e) => e.elective_group_id === groupBId).map((e) => e.student_id)
  );

  const overlappingStudents = [];
  studentsA.forEach((sId) => {
    if (studentsB.has(sId)) overlappingStudents.push(sId);
  });

  // 2. Check cohorts
  const cohortsA = new Set(
    cohortEnrollments.filter((e) => e.elective_group_id === groupAId).map((e) => e.cohort_id)
  );
  const cohortsB = new Set(
    cohortEnrollments.filter((e) => e.elective_group_id === groupBId).map((e) => e.cohort_id)
  );

  const overlappingCohorts = [];
  cohortsA.forEach((cId) => {
    if (cohortsB.has(cId)) overlappingCohorts.push(cId);
  });

  // If students belong to overlapping cohorts
  if (overlappingStudents.length === 0 && students.length > 0) {
    students.forEach((s) => {
      if (s.cohort_id && cohortsA.has(s.cohort_id) && cohortsB.has(s.cohort_id)) {
        if (!overlappingStudents.includes(s.id)) overlappingStudents.push(s.id);
      }
    });
  }

  const hasOverlap = overlappingStudents.length > 0 || overlappingCohorts.length > 0;

  return {
    hasOverlap,
    overlappingStudents,
    overlappingCohorts,
  };
};
