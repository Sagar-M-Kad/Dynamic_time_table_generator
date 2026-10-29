import { supabase } from "../supabaseClient";
import {
  enrollStudentTransactional,
  enrollCohortTransactional,
  validateElectiveConfiguration,
} from "./electiveValidationService";

// ── DEFAULT INITIAL ACADEMIC STRUCTURE ──────────────────────────────────────
export const DEFAULT_DEPARTMENTS = [
  { id: "dept-cse", code: "CSE", name: "Computer Science & Engineering", is_active: true },
  { id: "dept-aiml", code: "AIML", name: "Artificial Intelligence & Machine Learning", is_active: true },
  { id: "dept-ise", code: "ISE", name: "Information Science & Engineering", is_active: true },
  { id: "dept-ece", code: "ECE", name: "Electronics & Communication Engineering", is_active: true },
  { id: "dept-me", code: "ME", name: "Mechanical Engineering", is_active: true },
  { id: "dept-cv", code: "CV", name: "Civil Engineering", is_active: true },
];

export const DEFAULT_DIVISIONS = [
  // CSE Semesters
  { id: "div-cse-5-a", department_code: "CSE", semester: 5, name: "CSE-A", is_active: true },
  { id: "div-cse-5-b", department_code: "CSE", semester: 5, name: "CSE-B", is_active: true },
  { id: "div-cse-6-a", department_code: "CSE", semester: 6, name: "CSE-A", is_active: true },
  { id: "div-cse-6-b", department_code: "CSE", semester: 6, name: "CSE-B", is_active: true },
  { id: "div-cse-7-a", department_code: "CSE", semester: 7, name: "CSE-A", is_active: true },
  { id: "div-cse-7-b", department_code: "CSE", semester: 7, name: "CSE-B", is_active: true },
  // AIML Semesters
  { id: "div-aiml-5-a", department_code: "AIML", semester: 5, name: "AIML-A", is_active: true },
  { id: "div-aiml-6-a", department_code: "AIML", semester: 6, name: "AIML-A", is_active: true },
  { id: "div-aiml-7-a", department_code: "AIML", semester: 7, name: "AIML-A", is_active: true },
  // ISE Semesters
  { id: "div-ise-6-a", department_code: "ISE", semester: 6, name: "ISE-A", is_active: true },
  { id: "div-ise-6-b", department_code: "ISE", semester: 6, name: "ISE-B", is_active: true },
];

export const DEFAULT_BATCHES = [
  // CSE-A Sem 5 (2 batches)
  { id: "batch-cse-5-a-b1", division_id: "div-cse-5-a", name: "B1", is_active: true },
  { id: "batch-cse-5-a-b2", division_id: "div-cse-5-a", name: "B2", is_active: true },
  // CSE-B Sem 5 (3 batches)
  { id: "batch-cse-5-b-b1", division_id: "div-cse-5-b", name: "B1", is_active: true },
  { id: "batch-cse-5-b-b2", division_id: "div-cse-5-b", name: "B2", is_active: true },
  { id: "batch-cse-5-b-b3", division_id: "div-cse-5-b", name: "B3", is_active: true },
  // CSE-A Sem 6 (2 batches)
  { id: "batch-cse-6-a-b1", division_id: "div-cse-6-a", name: "B1", is_active: true },
  { id: "batch-cse-6-a-b2", division_id: "div-cse-6-a", name: "B2", is_active: true },
  // CSE-B Sem 6 (3 batches)
  { id: "batch-cse-6-b-b1", division_id: "div-cse-6-b", name: "B1", is_active: true },
  { id: "batch-cse-6-b-b2", division_id: "div-cse-6-b", name: "B2", is_active: true },
  { id: "batch-cse-6-b-b3", division_id: "div-cse-6-b", name: "B3", is_active: true },
  // CSE-A Sem 7 (2 batches)
  { id: "batch-cse-7-a-b1", division_id: "div-cse-7-a", name: "B1", is_active: true },
  { id: "batch-cse-7-a-b2", division_id: "div-cse-7-a", name: "B2", is_active: true },
  // CSE-B Sem 7 (3 batches)
  { id: "batch-cse-7-b-b1", division_id: "div-cse-7-b", name: "B1", is_active: true },
  { id: "batch-cse-7-b-b2", division_id: "div-cse-7-b", name: "B2", is_active: true },
  { id: "batch-cse-7-b-b3", division_id: "div-cse-7-b", name: "B3", is_active: true },
  // AIML-A Sem 5 (2 batches)
  { id: "batch-aiml-5-a-b1", division_id: "div-aiml-5-a", name: "B1", is_active: true },
  { id: "batch-aiml-5-a-b2", division_id: "div-aiml-5-a", name: "B2", is_active: true },
  // AIML-A Sem 6 (2 batches)
  { id: "batch-aiml-6-a-b1", division_id: "div-aiml-6-a", name: "B1", is_active: true },
  { id: "batch-aiml-6-a-b2", division_id: "div-aiml-6-a", name: "B2", is_active: true },
  // ISE-A Sem 6 (2 batches)
  { id: "batch-ise-6-a-b1", division_id: "div-ise-6-a", name: "B1", is_active: true },
  { id: "batch-ise-6-a-b2", division_id: "div-ise-6-a", name: "B2", is_active: true },
  // ISE-B Sem 6 (3 batches)
  { id: "batch-ise-6-b-b1", division_id: "div-ise-6-b", name: "B1", is_active: true },
  { id: "batch-ise-6-b-b2", division_id: "div-ise-6-b", name: "B2", is_active: true },
  { id: "batch-ise-6-b-b3", division_id: "div-ise-6-b", name: "B3", is_active: true },
];

export const DEFAULT_TERMS = [
  { id: "term-2024-odd", name: "2024–2025 Odd Semester (Aug–Dec)", is_current: true },
  { id: "term-2024-even", name: "2024–2025 Even Semester (Jan–May)", is_current: false },
  { id: "term-2025-odd", name: "2025–2026 Odd Semester (Aug–Dec)", is_current: false },
];

// ── DEFAULT ELECTIVE GROUPS & CANONICAL OFFERINGS ───────────────────────────
export const DEFAULT_ELECTIVE_GROUPS = [
  {
    id: "elec-cse-7-pe3",
    department_code: "CSE",
    semester: 7,
    name: "Professional Elective - III",
    type: "parallel", // 'parallel' | 'common'
    academic_term: "term-2024-odd",
    weekly_hours: 3,
    description: "Parallel run: 3 separate course offerings with individual faculty & rooms",
    created_at: new Date().toISOString(),
  },
  {
    id: "elec-all-7-oe2",
    department_code: "ALL",
    semester: 7,
    name: "Open Elective - II",
    type: "common",
    academic_term: "term-2024-odd",
    weekly_hours: 3,
    description: "Common institutional elective block scheduled across departments",
    created_at: new Date().toISOString(),
  },
];

export const DEFAULT_COURSE_OFFERINGS = [
  // Professional Elective III offerings (referencing canonical courses)
  {
    id: "off-cse-7-pe3-cloud",
    elective_group_id: "elec-cse-7-pe3",
    course_id: "101",
    subject_code: "21CS71",
    subject_name: "Cloud Computing",
    teacher_id: "Prof. Cloud",
    teacher_name: "Dr. Robert Smith",
    room_id: "Hall A",
    room_name: "Hall A",
    capacity: 60,
  },
  {
    id: "off-cse-7-pe3-nlp",
    elective_group_id: "elec-cse-7-pe3",
    course_id: "102",
    subject_code: "21CS72",
    subject_name: "Natural Language Processing",
    teacher_id: "Prof. NLP",
    teacher_name: "Dr. Sarah Jenkins",
    room_id: "Hall B",
    room_name: "Hall B",
    capacity: 60,
  },
  {
    id: "off-cse-7-pe3-bigdata",
    elective_group_id: "elec-cse-7-pe3",
    course_id: "103",
    subject_code: "21CS73",
    subject_name: "Big Data Analytics",
    teacher_id: "Prof. BigData",
    teacher_name: "Prof. Alan Davis",
    room_id: "Hall C",
    room_name: "Hall C",
    capacity: 60,
  },
  // Open Elective II offerings
  {
    id: "off-all-7-oe2-cyber",
    elective_group_id: "elec-all-7-oe2",
    course_id: "201",
    subject_code: "21OE71",
    subject_name: "Cyber Law & Ethics",
    teacher_id: "Prof. Cyber",
    teacher_name: "Prof. Helen Clark",
    room_id: "Auditorium 1",
    room_name: "Auditorium 1",
    capacity: 120,
  },
  {
    id: "off-all-7-oe2-energy",
    elective_group_id: "elec-all-7-oe2",
    course_id: "202",
    subject_code: "21OE72",
    subject_name: "Renewable Energy Systems",
    teacher_id: "Prof. Energy",
    teacher_name: "Dr. Marcus Vance",
    room_id: "Auditorium 2",
    room_name: "Auditorium 2",
    capacity: 120,
  },
];

// ── DEFAULT STUDENT COHORTS & ENROLLMENTS ───────────────────────────────────
// Rule: If individual student enrollment data is unavailable, use explicitly configured student cohorts.
export const DEFAULT_STUDENT_COHORTS = [
  { id: "cohort-cse-7-a-c1", name: "Cohort A1", department_code: "CSE", semester: 7, division_id: "div-cse-7-a" },
  { id: "cohort-cse-7-a-c2", name: "Cohort A2", department_code: "CSE", semester: 7, division_id: "div-cse-7-a" },
  { id: "cohort-cse-7-a-c3", name: "Cohort A3", department_code: "CSE", semester: 7, division_id: "div-cse-7-a" },
];

export const DEFAULT_STUDENTS = [
  { id: "stu-cse-7-001", usn: "1CR21CS001", name: "Aarav Sharma", department_code: "CSE", semester: 7, division_id: "div-cse-7-a", cohort_id: "cohort-cse-7-a-c1" },
  { id: "stu-cse-7-002", usn: "1CR21CS002", name: "Aditi Rao", department_code: "CSE", semester: 7, division_id: "div-cse-7-a", cohort_id: "cohort-cse-7-a-c1" },
  { id: "stu-cse-7-003", usn: "1CR21CS003", name: "Bhavya Patel", department_code: "CSE", semester: 7, division_id: "div-cse-7-a", cohort_id: "cohort-cse-7-a-c2" },
  { id: "stu-cse-7-004", usn: "1CR21CS004", name: "Chirag Hegde", department_code: "CSE", semester: 7, division_id: "div-cse-7-a", cohort_id: "cohort-cse-7-a-c2" },
  { id: "stu-cse-7-005", usn: "1CR21CS005", name: "Deepak Kumar", department_code: "CSE", semester: 7, division_id: "div-cse-7-a", cohort_id: "cohort-cse-7-a-c3" },
  { id: "stu-cse-7-006", usn: "1CR21CS006", name: "Divya Nair", department_code: "CSE", semester: 7, division_id: "div-cse-7-a", cohort_id: "cohort-cse-7-a-c3" },
];

// MANDATORY RULE: Each student enrolls in ONLY ONE course offering per elective group!
export const DEFAULT_STUDENT_ENROLLMENTS = [
  // stu-001, stu-002 -> Cloud Computing
  { id: "enr-s1-pe3", student_id: "stu-cse-7-001", elective_group_id: "elec-cse-7-pe3", course_offering_id: "off-cse-7-pe3-cloud", academic_term: "term-2024-odd" },
  { id: "enr-s2-pe3", student_id: "stu-cse-7-002", elective_group_id: "elec-cse-7-pe3", course_offering_id: "off-cse-7-pe3-cloud", academic_term: "term-2024-odd" },
  // stu-003, stu-004 -> Natural Language Processing
  { id: "enr-s3-pe3", student_id: "stu-cse-7-003", elective_group_id: "elec-cse-7-pe3", course_offering_id: "off-cse-7-pe3-nlp", academic_term: "term-2024-odd" },
  { id: "enr-s4-pe3", student_id: "stu-cse-7-004", elective_group_id: "elec-cse-7-pe3", course_offering_id: "off-cse-7-pe3-nlp", academic_term: "term-2024-odd" },
  // stu-005, stu-006 -> Big Data Analytics
  { id: "enr-s5-pe3", student_id: "stu-cse-7-005", elective_group_id: "elec-cse-7-pe3", course_offering_id: "off-cse-7-pe3-bigdata", academic_term: "term-2024-odd" },
  { id: "enr-s6-pe3", student_id: "stu-cse-7-006", elective_group_id: "elec-cse-7-pe3", course_offering_id: "off-cse-7-pe3-bigdata", academic_term: "term-2024-odd" },
];

export const DEFAULT_COHORT_ENROLLMENTS = [
  { id: "enr-c1-pe3", cohort_id: "cohort-cse-7-a-c1", elective_group_id: "elec-cse-7-pe3", course_offering_id: "off-cse-7-pe3-cloud", academic_term: "term-2024-odd" },
  { id: "enr-c2-pe3", cohort_id: "cohort-cse-7-a-c2", elective_group_id: "elec-cse-7-pe3", course_offering_id: "off-cse-7-pe3-nlp", academic_term: "term-2024-odd" },
  { id: "enr-c3-pe3", cohort_id: "cohort-cse-7-a-c3", elective_group_id: "elec-cse-7-pe3", course_offering_id: "off-cse-7-pe3-bigdata", academic_term: "term-2024-odd" },
];

const STORAGE_KEY = "timetable_academic_structure_v2";

// ── LOCAL STORAGE HELPERS ───────────────────────────────────────────────────
export const getLocalAcademicStructure = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.departments && parsed.divisions && parsed.batches) {
        return {
          departments: parsed.departments || DEFAULT_DEPARTMENTS,
          divisions: parsed.divisions || DEFAULT_DIVISIONS,
          batches: parsed.batches || DEFAULT_BATCHES,
          terms: parsed.terms || DEFAULT_TERMS,
          elective_groups: parsed.elective_groups || DEFAULT_ELECTIVE_GROUPS,
          course_offerings: parsed.course_offerings || DEFAULT_COURSE_OFFERINGS,
          student_cohorts: parsed.student_cohorts || DEFAULT_STUDENT_COHORTS,
          students: parsed.students || DEFAULT_STUDENTS,
          student_elective_enrollments: parsed.student_elective_enrollments || DEFAULT_STUDENT_ENROLLMENTS,
          cohort_elective_enrollments: parsed.cohort_elective_enrollments || DEFAULT_COHORT_ENROLLMENTS,
        };
      }
    }
  } catch (e) {
    console.warn("Could not read local academic structure:", e);
  }
  return {
    departments: DEFAULT_DEPARTMENTS,
    divisions: DEFAULT_DIVISIONS,
    batches: DEFAULT_BATCHES,
    terms: DEFAULT_TERMS,
    elective_groups: DEFAULT_ELECTIVE_GROUPS,
    course_offerings: DEFAULT_COURSE_OFFERINGS,
    student_cohorts: DEFAULT_STUDENT_COHORTS,
    students: DEFAULT_STUDENTS,
    student_elective_enrollments: DEFAULT_STUDENT_ENROLLMENTS,
    cohort_elective_enrollments: DEFAULT_COHORT_ENROLLMENTS,
  };
};

export const setLocalAcademicStructure = (structure) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(structure));
  } catch (e) {
    console.warn("Could not save local academic structure:", e);
  }
};

// ── SUPABASE SYNCHRONIZATION ────────────────────────────────────────────────
export const fetchAcademicStructure = async () => {
  const localData = getLocalAcademicStructure();

  try {
    const [
      deptRes,
      divRes,
      batchRes,
      groupRes,
      offeringRes,
      cohortRes,
      studentRes,
      studentEnrRes,
      cohortEnrRes,
    ] = await Promise.all([
      supabase.from("departments").select("*").order("code"),
      supabase.from("divisions").select("*").order("name"),
      supabase.from("batches").select("*").order("name"),
      supabase.from("elective_groups").select("*").order("name"),
      supabase.from("course_offerings").select("*"),
      supabase.from("student_cohorts").select("*"),
      supabase.from("students").select("*"),
      supabase.from("student_elective_enrollments").select("*"),
      supabase.from("cohort_elective_enrollments").select("*"),
    ]);

    const merged = {
      departments: deptRes?.data && deptRes.data.length > 0 ? deptRes.data : localData.departments,
      divisions: divRes?.data && divRes.data.length > 0 ? divRes.data : localData.divisions,
      batches: batchRes?.data && batchRes.data.length > 0 ? batchRes.data : localData.batches,
      terms: localData.terms,
      elective_groups: groupRes?.data && groupRes.data.length > 0 ? groupRes.data : localData.elective_groups,
      course_offerings: offeringRes?.data && offeringRes.data.length > 0 ? offeringRes.data : localData.course_offerings,
      student_cohorts: cohortRes?.data && cohortRes.data.length > 0 ? cohortRes.data : localData.student_cohorts,
      students: studentRes?.data && studentRes.data.length > 0 ? studentRes.data : localData.students,
      student_elective_enrollments: studentEnrRes?.data && studentEnrRes.data.length > 0 ? studentEnrRes.data : localData.student_elective_enrollments,
      cohort_elective_enrollments: cohortEnrRes?.data && cohortEnrRes.data.length > 0 ? cohortEnrRes.data : localData.cohort_elective_enrollments,
    };

    setLocalAcademicStructure(merged);
    return merged;
  } catch (err) {
    console.warn("Supabase academic tables not available yet, using local store:", err.message);
  }

  return localData;
};

export const saveAcademicStructure = async (structure) => {
  setLocalAcademicStructure(structure);

  try {
    const promises = [];
    if (structure.departments?.length) {
      promises.push(supabase.from("departments").upsert(structure.departments, { onConflict: "id" }));
    }
    if (structure.divisions?.length) {
      promises.push(supabase.from("divisions").upsert(structure.divisions, { onConflict: "id" }));
    }
    if (structure.batches?.length) {
      promises.push(supabase.from("batches").upsert(structure.batches, { onConflict: "id" }));
    }
    if (structure.elective_groups?.length) {
      promises.push(supabase.from("elective_groups").upsert(structure.elective_groups, { onConflict: "id" }));
    }
    if (structure.course_offerings?.length) {
      promises.push(supabase.from("course_offerings").upsert(structure.course_offerings, { onConflict: "id" }));
    }
    if (structure.student_cohorts?.length) {
      promises.push(supabase.from("student_cohorts").upsert(structure.student_cohorts, { onConflict: "id" }));
    }
    if (structure.students?.length) {
      promises.push(supabase.from("students").upsert(structure.students, { onConflict: "id" }));
    }
    if (structure.student_elective_enrollments?.length) {
      promises.push(supabase.from("student_elective_enrollments").upsert(structure.student_elective_enrollments, { onConflict: "id" }));
    }
    if (structure.cohort_elective_enrollments?.length) {
      promises.push(supabase.from("cohort_elective_enrollments").upsert(structure.cohort_elective_enrollments, { onConflict: "id" }));
    }
    await Promise.all(promises);
  } catch (err) {
    console.warn("Could not sync academic structure to Supabase DB:", err.message);
  }

  return structure;
};

// ── GETTERS FOR SPECIFIC ACADEMIC SCOPES ─────────────────────────────────────
export const getDivisionsForScope = (structure, departmentCode, semester) => {
  if (!structure || !structure.divisions) return [];
  const semNum = parseInt(semester);
  return structure.divisions.filter(
    (d) =>
      d.department_code?.toUpperCase() === departmentCode?.toUpperCase() &&
      parseInt(d.semester) === semNum &&
      d.is_active !== false
  );
};

export const getBatchesForDivision = (structure, divisionId) => {
  if (!structure || !structure.batches) return [];
  return structure.batches.filter(
    (b) => b.division_id === divisionId && b.is_active !== false
  );
};

export const getElectivesForScope = (structure, departmentCode, semester) => {
  if (!structure || !structure.elective_groups) return [];
  const semNum = parseInt(semester);
  return structure.elective_groups.filter(
    (g) =>
      (g.department_code?.toUpperCase() === departmentCode?.toUpperCase() || g.department_code === "ALL") &&
      parseInt(g.semester) === semNum
  );
};

export const getCourseOfferingsForGroup = (structure, groupId) => {
  if (!structure || !structure.course_offerings) return [];
  return structure.course_offerings.filter((o) => o.elective_group_id === groupId);
};

// ── TRANSACTIONAL ENROLLMENT OPERATIONS ─────────────────────────────────────
/**
 * Safely enroll a student into an elective offering with transactional duplicate protection.
 */
export const enrollStudentInGroup = async (structure, enrollment) => {
  const currentEnrollments = structure.student_elective_enrollments || [];
  // Throws if duplicate enrollment in the same group is attempted
  const updated = enrollStudentTransactional(enrollment, currentEnrollments);
  const updatedStructure = {
    ...structure,
    student_elective_enrollments: updated,
  };
  await saveAcademicStructure(updatedStructure);
  return updatedStructure;
};

/**
 * Safely assign a cohort to an elective offering with transactional duplicate protection.
 */
export const enrollCohortInGroup = async (structure, enrollment) => {
  const currentEnrollments = structure.cohort_elective_enrollments || [];
  const updated = enrollCohortTransactional(enrollment, currentEnrollments);
  const updatedStructure = {
    ...structure,
    cohort_elective_enrollments: updated,
  };
  await saveAcademicStructure(updatedStructure);
  return updatedStructure;
};
