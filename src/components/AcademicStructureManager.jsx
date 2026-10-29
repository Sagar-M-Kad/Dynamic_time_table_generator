import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import Button from "@mui/material/Button";
import {
  Layers,
  Building,
  GraduationCap,
  Users2,
  BookmarkCheck,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  Archive,
  RefreshCw,
  FolderTree,
  BookOpen,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  fetchAcademicStructure,
  saveAcademicStructure,
  getLocalAcademicStructure,
  enrollStudentInGroup,
  enrollCohortInGroup,
} from "../services/academicStructureService";
import { validateElectiveConfiguration } from "../services/electiveValidationService";
import { supabase } from "../supabaseClient";
import CourseSelector from "./CourseSelector";

const DEFAULT_TERMS = [
  { id: "term-2024-odd", name: "2024–2025 Odd Semester (Aug–Dec)", is_current: true },
  { id: "term-2024-even", name: "2024–2025 Even Semester (Jan–May)", is_current: false },
  { id: "term-2025-odd", name: "2025–2026 Odd Semester (Aug–Dec)", is_current: false },
];

const AcademicStructureManager = () => {
  const [activeTab, setActiveTab] = useState("hierarchy"); // 'hierarchy' | 'depts' | 'divs' | 'electives' | 'terms'
  const [structure, setStructure] = useState({
    departments: [],
    divisions: [],
    batches: [],
    elective_groups: [],
    course_offerings: [],
    student_cohorts: [],
    students: [],
    student_elective_enrollments: [],
    cohort_elective_enrollments: [],
  });
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [loading, setLoading] = useState(true);

  // Department & Division filter states
  const [selectedDept, setSelectedDept] = useState("CSE");
  const [selectedSem, setSelectedSem] = useState(7);
  const [selectedDivId, setSelectedDivId] = useState("");

  // Canonical subjects, teachers, and rooms catalog
  const [subjectsList, setSubjectsList] = useState([]);
  const [teachersList, setTeachersList] = useState([]);
  const [roomsList, setRoomsList] = useState([]);

  // Modals & form states
  const [showAddDept, setShowAddDept] = useState(false);
  const [newDeptCode, setNewDeptCode] = useState("");
  const [newDeptName, setNewDeptName] = useState("");

  const [newDivName, setNewDivName] = useState("");
  const [newBatchName, setNewBatchName] = useState("");

  // Elective Group form
  const [showAddElective, setShowAddElective] = useState(false);
  const [newElectiveName, setNewElectiveName] = useState("");
  const [newElectiveType, setNewElectiveType] = useState("parallel");
  const [newElectiveDept, setNewElectiveDept] = useState("CSE");
  const [newElectiveSem, setNewElectiveSem] = useState(7);
  const [newElectiveTerm, setNewElectiveTerm] = useState("term-2024-odd");
  const [newElectiveHours, setNewElectiveHours] = useState(3);

  // Offering modal state
  const [showAddOfferingModal, setShowAddOfferingModal] = useState(false);
  const [activeOfferingGroupId, setActiveOfferingGroupId] = useState(null);
  const [offeringCourseId, setOfferingCourseId] = useState("");
  const [offeringTeacherId, setOfferingTeacherId] = useState("");
  const [offeringRoomId, setOfferingRoomId] = useState("");
  const [offeringCapacity, setOfferingCapacity] = useState(60);

  // Enrollment modal state
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [activeEnrollOfferingId, setActiveEnrollOfferingId] = useState(null);
  const [activeEnrollGroupId, setActiveEnrollGroupId] = useState(null);
  const [enrollMode, setEnrollMode] = useState("cohort"); // 'cohort' | 'student'
  const [enrollCohortId, setEnrollCohortId] = useState("");
  const [enrollStudentUsn, setEnrollStudentUsn] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchAcademicStructure();
    setStructure(data);

    // Read stored terms if present
    try {
      const storedTerms = localStorage.getItem("timetable_terms_v1");
      if (storedTerms) setTerms(JSON.parse(storedTerms));
    } catch (e) {
      console.warn("Storage read error:", e);
    }

    // Fetch canonical subjects, teachers, and rooms for elective course offering dropdowns
    try {
      const [subRes, teachRes, roomRes] = await Promise.all([
        supabase.from("subjects").select("*").order("subject_name", { ascending: true }),
        supabase.from("teachers").select("*").order("name", { ascending: true }),
        supabase.from("rooms").select("*").order("room_name", { ascending: true }),
      ]);

      if (subRes.data && subRes.data.length > 0) {
        setSubjectsList(subRes.data);
      } else {
        setSubjectsList([
          { id: "101", subject_code: "21CS71", subject_name: "Cloud Computing", is_lab: false },
          { id: "102", subject_code: "21CS72", subject_name: "Natural Language Processing", is_lab: false },
          { id: "103", subject_code: "21CS73", subject_name: "Big Data Analytics", is_lab: false },
          { id: "201", subject_code: "21OE71", subject_name: "Cyber Law & Ethics", is_lab: false },
          { id: "202", subject_code: "21OE72", subject_name: "Renewable Energy Systems", is_lab: false },
        ]);
      }

      if (teachRes.data && teachRes.data.length > 0) {
        setTeachersList(teachRes.data);
      } else {
        setTeachersList([
          { id: "Prof. Cloud", name: "Dr. Robert Smith" },
          { id: "Prof. NLP", name: "Dr. Sarah Jenkins" },
          { id: "Prof. BigData", name: "Prof. Alan Davis" },
          { id: "Prof. Cyber", name: "Prof. Helen Clark" },
          { id: "Prof. Energy", name: "Dr. Marcus Vance" },
        ]);
      }

      if (roomRes.data && roomRes.data.length > 0) {
        setRoomsList(roomRes.data);
      } else {
        setRoomsList([
          { id: "Hall A", room_name: "Hall A", capacity: 60 },
          { id: "Hall B", room_name: "Hall B", capacity: 60 },
          { id: "Hall C", room_name: "Hall C", capacity: 60 },
          { id: "Auditorium 1", room_name: "Auditorium 1", capacity: 120 },
          { id: "Auditorium 2", room_name: "Auditorium 2", capacity: 120 },
        ]);
      }
    } catch (e) {
      console.warn("Error fetching reference metadata:", e);
    }

    // Auto-select first division if available
    const divs = (data.divisions || []).filter(
      (d) => d.department_code === "CSE" && parseInt(d.semester) === 7
    );
    if (divs.length > 0) setSelectedDivId(divs[0].id);

    setLoading(false);
  };

  // Sync state to local and Supabase
  const persistStructure = async (updated) => {
    setStructure(updated);
    await saveAcademicStructure(updated);
  };

  const persistTerms = (updated) => {
    setTerms(updated);
    try {
      localStorage.setItem("timetable_terms_v1", JSON.stringify(updated));
    } catch (e) {
      console.warn(e);
    }
  };

  // ── DEPARTMENTS ACTIONS ──────────────────────────────────────────────
  const handleAddDept = async (e) => {
    e.preventDefault();
    if (!newDeptCode.trim() || !newDeptName.trim()) {
      return toast.error("Please enter Department Code and Name");
    }
    const code = newDeptCode.trim().toUpperCase();
    if (structure.departments.some((d) => d.code === code)) {
      return toast.error(`Department ${code} already exists.`);
    }

    const newDept = {
      id: `dept-${code.toLowerCase()}`,
      code,
      name: newDeptName.trim(),
      is_active: true,
    };

    const updated = {
      ...structure,
      departments: [...structure.departments, newDept],
    };

    await persistStructure(updated);
    setNewDeptCode("");
    setNewDeptName("");
    setShowAddDept(false);
    setSelectedDept(code);
    toast.success(`Department ${code} created successfully!`);
  };

  const toggleDeptStatus = async (deptId) => {
    const updatedDepts = structure.departments.map((d) =>
      d.id === deptId ? { ...d, is_active: !d.is_active } : d
    );
    const updated = { ...structure, departments: updatedDepts };
    await persistStructure(updated);
    toast.success("Department status updated");
  };

  // ── DIVISIONS ACTIONS ────────────────────────────────────────────────
  const currentDivisions = (structure.divisions || []).filter(
    (d) =>
      d.department_code?.toUpperCase() === selectedDept?.toUpperCase() &&
      parseInt(d.semester) === parseInt(selectedSem) &&
      d.is_active !== false
  );

  const handleAddDivision = async () => {
    if (!newDivName.trim()) {
      return toast.error("Please provide a division name (e.g. CSE-A, Section B)");
    }
    const cleanName = newDivName.trim().toUpperCase();
    if (currentDivisions.some((d) => d.name.toUpperCase() === cleanName)) {
      return toast.error(`Division "${cleanName}" already exists for ${selectedDept} Sem ${selectedSem}.`);
    }

    const divId = `div-${selectedDept.toLowerCase()}-${selectedSem}-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    const newDiv = {
      id: divId,
      department_code: selectedDept.toUpperCase(),
      semester: parseInt(selectedSem),
      name: cleanName,
      is_active: true,
    };

    // Default 2 lab batches (B1, B2) for the newly created division
    const defaultBatches = [
      { id: `batch-${divId}-b1`, division_id: divId, name: "B1", is_active: true },
      { id: `batch-${divId}-b2`, division_id: divId, name: "B2", is_active: true },
    ];

    const updated = {
      ...structure,
      divisions: [...structure.divisions, newDiv],
      batches: [...structure.batches, ...defaultBatches],
    };

    await persistStructure(updated);
    setNewDivName("");
    setSelectedDivId(divId);
    toast.success(`Division "${cleanName}" added with default batches B1 & B2!`);
  };

  const handleArchiveDivision = async (divId) => {
    if (!window.confirm("Archive this division? Existing timetable records will preserve reference.")) return;
    const updatedDivs = structure.divisions.map((d) =>
      d.id === divId ? { ...d, is_active: false } : d
    );
    const updated = { ...structure, divisions: updatedDivs };
    await persistStructure(updated);
    toast.success("Division safely archived");
  };

  // ── BATCHES ACTIONS ──────────────────────────────────────────────────
  const activeDiv = structure.divisions.find((d) => d.id === selectedDivId);
  const currentBatches = (structure.batches || []).filter(
    (b) => b.division_id === selectedDivId && b.is_active !== false
  );

  const handleAddBatch = async () => {
    if (!selectedDivId) return toast.error("Please select a division first.");
    if (!newBatchName.trim()) return toast.error("Enter a batch identifier (e.g. B3, Batch-C)");

    const cleanBatch = newBatchName.trim().toUpperCase();
    if (currentBatches.some((b) => b.name === cleanBatch)) {
      return toast.error(`Batch "${cleanBatch}" already exists in this division.`);
    }

    const newBatch = {
      id: `batch-${selectedDivId}-${cleanBatch.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      division_id: selectedDivId,
      name: cleanBatch,
      is_active: true,
    };

    const updated = {
      ...structure,
      batches: [...structure.batches, newBatch],
    };

    await persistStructure(updated);
    setNewBatchName("");
    toast.success(`Batch ${cleanBatch} added to ${activeDiv?.name || "division"}!`);
  };

  const handleRemoveBatch = async (batchId) => {
    const updatedBatches = structure.batches.filter((b) => b.id !== batchId);
    const updated = { ...structure, batches: updatedBatches };
    await persistStructure(updated);
    toast.success("Batch removed");
  };

  // ── ELECTIVES & COURSE OFFERINGS ACTIONS ─────────────────────────────
  const handleAddElectiveGroup = async (e) => {
    e.preventDefault();
    if (!newElectiveName.trim()) {
      return toast.error("Please provide an elective group title.");
    }

    const groupId = `elec-${newElectiveDept.toLowerCase()}-${newElectiveSem}-${Date.now().toString().slice(-4)}`;
    const newGroup = {
      id: groupId,
      name: newElectiveName.trim(),
      department_code: newElectiveDept,
      semester: parseInt(newElectiveSem),
      type: newElectiveType,
      academic_term: newElectiveTerm,
      weekly_hours: parseInt(newElectiveHours) || 3,
      description:
        newElectiveType === "parallel"
          ? "Parallel run: different elective offerings scheduled simultaneously with separate teachers & rooms"
          : "Common elective period reserved across student cohorts",
      created_at: new Date().toISOString(),
    };

    const updated = {
      ...structure,
      elective_groups: [...(structure.elective_groups || []), newGroup],
    };
    await persistStructure(updated);
    setNewElectiveName("");
    setShowAddElective(false);
    toast.success(`Elective Group "${newGroup.name}" created! Now configure canonical course offerings.`);
  };

  const handleDeleteElectiveGroup = async (groupId) => {
    if (!window.confirm("Delete this elective group and all associated offerings and student enrollments?")) return;
    const updatedGroups = (structure.elective_groups || []).filter((g) => g.id !== groupId);
    const updatedOfferings = (structure.course_offerings || []).filter((o) => o.elective_group_id !== groupId);
    const updatedStudentEnr = (structure.student_elective_enrollments || []).filter((e) => e.elective_group_id !== groupId);
    const updatedCohortEnr = (structure.cohort_elective_enrollments || []).filter((e) => e.elective_group_id !== groupId);

    const updated = {
      ...structure,
      elective_groups: updatedGroups,
      course_offerings: updatedOfferings,
      student_elective_enrollments: updatedStudentEnr,
      cohort_elective_enrollments: updatedCohortEnr,
    };
    await persistStructure(updated);
    toast.success("Elective group deleted");
  };

  const handleAddCourseOffering = async (e) => {
    e.preventDefault();
    if (!activeOfferingGroupId) return;
    if (!offeringCourseId) return toast.error("Please select a canonical subject.");
    if (!offeringTeacherId) return toast.error("Please assign a qualified faculty member.");
    if (!offeringRoomId) return toast.error("Please assign a suitable room.");

    const activeGroup = (structure.elective_groups || []).find((g) => g.id === activeOfferingGroupId);
    const existingOfferings = (structure.course_offerings || []).filter((o) => o.elective_group_id === activeOfferingGroupId);

    // Enforce database UNIQUE constraint: uq_group_course (elective_group_id, course_id)
    if (existingOfferings.some((o) => String(o.course_id) === String(offeringCourseId))) {
      return toast.error("This course offering already exists in this elective group (Unique course constraint).");
    }

    const canonicalSubject = subjectsList.find((s) => String(s.id) === String(offeringCourseId));
    if (!canonicalSubject) return toast.error("Selected course ID is not found in canonical subjects catalog.");

    const teacherObj = teachersList.find((t) => String(t.id) === String(offeringTeacherId));
    const roomObj = roomsList.find((r) => String(r.id) === String(offeringRoomId));

    const newOffering = {
      id: `off-${activeOfferingGroupId}-${canonicalSubject.subject_code.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      elective_group_id: activeOfferingGroupId,
      course_id: String(canonicalSubject.id),
      subject_code: canonicalSubject.subject_code,
      subject_name: canonicalSubject.subject_name,
      teacher_id: offeringTeacherId,
      teacher_name: teacherObj?.name || offeringTeacherId,
      room_id: offeringRoomId,
      room_name: roomObj?.room_name || offeringRoomId,
      capacity: parseInt(offeringCapacity) || 60,
    };

    const updated = {
      ...structure,
      course_offerings: [...(structure.course_offerings || []), newOffering],
    };
    await persistStructure(updated);
    setOfferingCourseId("");
    setOfferingTeacherId("");
    setOfferingRoomId("");
    setShowAddOfferingModal(false);
    setActiveOfferingGroupId(null);
    toast.success(`Offering "${canonicalSubject.subject_name}" added to ${activeGroup?.name}!`);
  };

  const handleDeleteCourseOffering = async (offeringId) => {
    if (!window.confirm("Remove this course offering and any associated student enrollments?")) return;
    const updatedOfferings = (structure.course_offerings || []).filter((o) => o.id !== offeringId);
    const updatedStudentEnr = (structure.student_elective_enrollments || []).filter((e) => e.course_offering_id !== offeringId);
    const updatedCohortEnr = (structure.cohort_elective_enrollments || []).filter((e) => e.course_offering_id !== offeringId);

    const updated = {
      ...structure,
      course_offerings: updatedOfferings,
      student_elective_enrollments: updatedStudentEnr,
      cohort_elective_enrollments: updatedCohortEnr,
    };
    await persistStructure(updated);
    toast.success("Course offering removed");
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    if (!activeEnrollOfferingId || !activeEnrollGroupId) return;

    const group = (structure.elective_groups || []).find((g) => g.id === activeEnrollGroupId);
    const offering = (structure.course_offerings || []).find((o) => o.id === activeEnrollOfferingId);
    const term = group?.academic_term || terms.find((t) => t.is_current)?.id || "term-2024-odd";

    try {
      if (enrollMode === "cohort") {
        if (!enrollCohortId) return toast.error("Please select or enter a student cohort.");
        // Call transactional enrollment helper - strictly enforces: single course offering per group!
        const enrollment = {
          id: `enr-c-${Date.now().toString().slice(-6)}`,
          cohort_id: enrollCohortId,
          elective_group_id: activeEnrollGroupId,
          course_offering_id: activeEnrollOfferingId,
          academic_term: term,
        };
        const updated = await enrollCohortInGroup(structure, enrollment);
        setStructure(updated);
        toast.success(`Cohort ${enrollCohortId} enrolled in ${offering?.subject_name}!`);
      } else {
        if (!enrollStudentUsn.trim()) return toast.error("Please enter student USN / ID.");
        const cleanUsn = enrollStudentUsn.trim().toUpperCase();
        // Call transactional enrollment helper - strictly enforces: single course offering per group!
        const enrollment = {
          id: `enr-s-${Date.now().toString().slice(-6)}`,
          student_id: cleanUsn,
          elective_group_id: activeEnrollGroupId,
          course_offering_id: activeEnrollOfferingId,
          academic_term: term,
        };
        const updated = await enrollStudentInGroup(structure, enrollment);
        setStructure(updated);
        toast.success(`Student ${cleanUsn} enrolled in ${offering?.subject_name}!`);
      }
      setShowEnrollModal(false);
      setActiveEnrollOfferingId(null);
      setActiveEnrollGroupId(null);
      setEnrollStudentUsn("");
    } catch (err) {
      toast.error(err.message, { duration: 6000 });
    }
  };

  const handleUnenrollStudent = async (enrollmentId) => {
    const updatedEnr = (structure.student_elective_enrollments || []).filter((e) => e.id !== enrollmentId);
    const updated = { ...structure, student_elective_enrollments: updatedEnr };
    await persistStructure(updated);
    toast.success("Student un-enrolled");
  };

  const handleUnenrollCohort = async (enrollmentId) => {
    const updatedEnr = (structure.cohort_elective_enrollments || []).filter((e) => e.id !== enrollmentId);
    const updated = { ...structure, cohort_elective_enrollments: updatedEnr };
    await persistStructure(updated);
    toast.success("Cohort un-enrolled");
  };

  // ── TERMS ACTIONS ────────────────────────────────────────────────────
  const handleSetCurrentTerm = (termId) => {
    const updated = terms.map((t) => ({
      ...t,
      is_current: t.id === termId,
    }));
    persistTerms(updated);
    toast.success("Active academic term updated");
  };

  return (
    <div className="card" style={{ maxWidth: "1150px", margin: "20px auto", padding: "28px" }}>
      {/* ── TOP HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FolderTree size={28} color="#4f46e5" />
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
              Academic Structure & Scope Management
            </h1>
          </div>
          <p style={{ color: "#64748b", margin: "6px 0 0 0", fontSize: "0.95rem" }}>
            Manage the full academic hierarchy: Institution → Academic Term → Department → Semester → Division → Batch.
          </p>
        </div>
        <Button
          variant="outlined"
          startIcon={<RefreshCw size={16} />}
          onClick={loadData}
          style={{ textTransform: "none", borderRadius: "8px" }}
        >
          Reload
        </Button>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <div style={{ display: "flex", gap: "10px", borderBottom: "2px solid #e2e8f0", paddingBottom: "12px", marginBottom: "24px" }}>
        {[
          { id: "hierarchy", label: "Hierarchy Tree", icon: Layers },
          { id: "depts", label: "Departments", icon: Building },
          { id: "divs", label: "Divisions & Batches", icon: Users2 },
          { id: "electives", label: "Elective Groups", icon: BookmarkCheck },
          { id: "terms", label: "Academic Terms", icon: GraduationCap },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
              background: activeTab === tab.id ? "#4f46e5" : "#f8fafc",
              color: activeTab === tab.id ? "#ffffff" : "#475569",
              transition: "all 0.2s ease",
            }}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: HIERARCHY TREE OVERVIEW ── */}
      {activeTab === "hierarchy" && (
        <div>
          <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
            <h3 style={{ margin: "0 0 10px 0", color: "#1e293b", fontSize: "1.1rem" }}>
              Active Academic Scope Overview
            </h3>
            <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "0.9rem" }}>
              All timetable constraints, faculty workloads, and batch-level lab assignments automatically adhere to this structure.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
              <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Current Term</span>
                <h4 style={{ margin: "6px 0 0 0", color: "#0f172a" }}>
                  {terms.find((t) => t.is_current)?.name || "2024–2025 Odd Semester"}
                </h4>
              </div>
              <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Active Departments</span>
                <h4 style={{ margin: "6px 0 0 0", color: "#0f172a" }}>
                  {structure.departments.filter((d) => d.is_active !== false).length} Departments
                </h4>
              </div>
              <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Total Divisions</span>
                <h4 style={{ margin: "6px 0 0 0", color: "#0f172a" }}>
                  {structure.divisions.filter((d) => d.is_active !== false).length} Configured Divisions
                </h4>
              </div>
              <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Configured Lab Batches</span>
                <h4 style={{ margin: "6px 0 0 0", color: "#0f172a" }}>
                  {structure.batches.filter((b) => b.is_active !== false).length} Batches
                </h4>
              </div>
            </div>
          </div>

          {/* Department Breakdown Cards */}
          <h3 style={{ margin: "24px 0 14px 0", color: "#0f172a", fontSize: "1.15rem" }}>
            Departmental Divisions & Batches
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {structure.departments.map((dept) => {
              const deptDivs = (structure.divisions || []).filter(
                (d) => d.department_code === dept.code && d.is_active !== false
              );
              return (
                <div
                  key={dept.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "18px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          background: "#e0e7ff",
                          color: "#4338ca",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                        }}
                      >
                        {dept.code}
                      </span>
                      <strong style={{ fontSize: "0.95rem", color: "#1e293b" }}>{dept.name}</strong>
                    </div>
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "12px" }}>
                    {deptDivs.length === 0 ? (
                      <em>No divisions configured yet</em>
                    ) : (
                      deptDivs.map((div) => {
                        const divBatches = (structure.batches || []).filter(
                          (b) => b.division_id === div.id && b.is_active !== false
                        );
                        return (
                          <div
                            key={div.id}
                            style={{
                              background: "#f8fafc",
                              padding: "8px 12px",
                              borderRadius: "8px",
                              marginTop: "6px",
                              border: "1px solid #f1f5f9",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "#334155" }}>
                              <span>Sem {div.semester} — {div.name}</span>
                              <span style={{ fontSize: "0.75rem", color: "#6366f1" }}>
                                {divBatches.length} Batches
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                              {divBatches.map((b) => (
                                <span
                                  key={b.id}
                                  style={{
                                    background: "#ede9fe",
                                    color: "#5b21b6",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  {b.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 2: DEPARTMENTS ── */}
      {activeTab === "depts" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, color: "#0f172a" }}>Department Directory</h3>
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => setShowAddDept(true)}
              style={{ background: "#4f46e5", textTransform: "none", borderRadius: "8px" }}
            >
              Add Department
            </Button>
          </div>

          {showAddDept && (
            <form
              onSubmit={handleAddDept}
              style={{
                background: "#f8fafc",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                marginBottom: "20px",
                display: "grid",
                gridTemplateColumns: "1fr 2fr auto",
                gap: "12px",
                alignItems: "end",
              }}
            >
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Department Code</label>
                <input
                  type="text"
                  placeholder="e.g. DS, AI"
                  value={newDeptCode}
                  onChange={(e) => setNewDeptCode(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Department Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Data Science & Big Data"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button type="submit" variant="contained" style={{ background: "#10b981", textTransform: "none" }}>
                  Save
                </Button>
                <Button variant="outlined" onClick={() => setShowAddDept(false)} style={{ textTransform: "none" }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {structure.departments.map((dept) => (
              <div
                key={dept.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 20px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <span
                    style={{
                      background: "#e0e7ff",
                      color: "#4338ca",
                      fontWeight: 700,
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "0.9rem",
                    }}
                  >
                    {dept.code}
                  </span>
                  <div>
                    <strong style={{ color: "#0f172a", fontSize: "1rem" }}>{dept.name}</strong>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>ID: {dept.id}</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      padding: "4px 8px",
                      borderRadius: "6px",
                      background: dept.is_active !== false ? "#dcfce7" : "#fee2e2",
                      color: dept.is_active !== false ? "#15803d" : "#b91c1c",
                    }}
                  >
                    {dept.is_active !== false ? "Active" : "Archived"}
                  </span>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => toggleDeptStatus(dept.id)}
                    style={{ textTransform: "none", fontSize: "0.8rem" }}
                  >
                    {dept.is_active !== false ? "Archive" : "Activate"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: DIVISIONS & BATCHES ── */}
      {activeTab === "divs" && (
        <div>
          {/* Scope Selector: Dept & Sem */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              background: "#f8fafc",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              marginBottom: "24px",
            }}
          >
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Select Department</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: "4px" }}
              >
                {structure.departments.map((d) => (
                  <option key={d.id} value={d.code}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Select Semester (1 to 8)</label>
              <select
                value={selectedSem}
                onChange={(e) => setSelectedSem(parseInt(e.target.value))}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: "4px" }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "24px" }}>
            {/* Left: Divisions Column */}
            <div style={{ background: "#ffffff", padding: "18px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h4 style={{ margin: 0, color: "#0f172a" }}>
                  Divisions ({selectedDept} Sem {selectedSem})
                </h4>
              </div>

              {/* Add Division Input */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <input
                  type="text"
                  placeholder="e.g. CSE-A or Section C"
                  value={newDivName}
                  onChange={(e) => setNewDivName(e.target.value)}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
                <Button
                  variant="contained"
                  onClick={handleAddDivision}
                  style={{ background: "#4f46e5", textTransform: "none" }}
                >
                  Add Div
                </Button>
              </div>

              {/* Division List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {currentDivisions.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", textAlign: "center", padding: "20px 0" }}>
                    No divisions configured for {selectedDept} Sem {selectedSem}.
                  </p>
                ) : (
                  currentDivisions.map((div) => {
                    const isSelected = selectedDivId === div.id;
                    const bCount = (structure.batches || []).filter(
                      (b) => b.division_id === div.id && b.is_active !== false
                    ).length;
                    return (
                      <div
                        key={div.id}
                        onClick={() => setSelectedDivId(div.id)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px 14px",
                          borderRadius: "8px",
                          border: isSelected ? "2px solid #4f46e5" : "1px solid #e2e8f0",
                          background: isSelected ? "#eef2ff" : "#f8fafc",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div>
                          <strong style={{ color: isSelected ? "#3730a3" : "#1e293b" }}>{div.name}</strong>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{bCount} Lab Batches</div>
                        </div>
                        <Button
                          size="small"
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveDivision(div.id);
                          }}
                          style={{ minWidth: 0, padding: "4px" }}
                        >
                          <Archive size={16} />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Batches Column */}
            <div style={{ background: "#ffffff", padding: "18px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: "0 0 14px 0", color: "#0f172a" }}>
                Batches for {activeDiv ? activeDiv.name : "Selected Division"}
              </h4>

              {selectedDivId ? (
                <>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                    <input
                      type="text"
                      placeholder="e.g. B3, Batch-C"
                      value={newBatchName}
                      onChange={(e) => setNewBatchName(e.target.value)}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleAddBatch}
                      style={{ background: "#10b981", textTransform: "none" }}
                    >
                      Add Batch
                    </Button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {currentBatches.length === 0 ? (
                      <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>No batches assigned to this division.</p>
                    ) : (
                      currentBatches.map((batch) => (
                        <div
                          key={batch.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 14px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span
                              style={{
                                background: "#ede9fe",
                                color: "#5b21b6",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                              }}
                            >
                              {batch.name}
                            </span>
                            <span style={{ fontSize: "0.85rem", color: "#475569" }}>
                              {activeDiv?.name} — {batch.name}
                            </span>
                          </div>
                          <Button
                            size="small"
                            color="error"
                            onClick={() => handleRemoveBatch(batch.id)}
                            style={{ minWidth: 0, padding: "4px" }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <p style={{ color: "#94a3b8" }}>Select a division on the left to configure its batches.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: ELECTIVE GROUPS & CANONICAL OFFERINGS ── */}
      {activeTab === "electives" && (() => {
        const activeScopeValidation = validateElectiveConfiguration(
          structure,
          subjectsList,
          { department: selectedDept, semester: selectedSem }
        );

        const currentElectiveGroups = (structure.elective_groups || []).filter(
          (g) =>
            (g.department_code?.toUpperCase() === selectedDept?.toUpperCase() || g.department_code === "ALL") &&
            parseInt(g.semester) === parseInt(selectedSem)
        );

        return (
          <div>
            {/* Scope Filter for Elective Groups */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                background: "#f8fafc",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                marginBottom: "20px",
              }}
            >
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Select Department Scope</label>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                >
                  {structure.departments.map((d) => (
                    <option key={d.id} value={d.code}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Select Semester Scope (1 to 8)</label>
                <select
                  value={selectedSem}
                  onChange={(e) => setSelectedSem(parseInt(e.target.value))}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Semester {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Real-time Scope Validation Banner */}
            <div
              style={{
                background: activeScopeValidation.isValid ? "#f0fdf4" : "#fef2f2",
                border: activeScopeValidation.isValid ? "1.5px solid #86efac" : "1.5px solid #fca5a5",
                borderRadius: "12px",
                padding: "16px 20px",
                marginBottom: "24px",
                display: "flex",
                alignItems: "flex-start",
                gap: "14px",
              }}
            >
              {activeScopeValidation.isValid ? (
                <ShieldCheck size={28} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
              ) : (
                <ShieldAlert size={28} color="#dc2626" style={{ flexShrink: 0, marginTop: "2px" }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ margin: 0, color: activeScopeValidation.isValid ? "#166534" : "#991b1b", fontSize: "1.05rem" }}>
                    {activeScopeValidation.isValid
                      ? `Mandatory Elective Rule Compliant (${selectedDept} Sem ${selectedSem})`
                      : `Elective Configuration Issues Detected (${activeScopeValidation.violations.length})`}
                  </h4>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: activeScopeValidation.isValid ? "#bbf7d0" : "#fee2e2",
                      color: activeScopeValidation.isValid ? "#15803d" : "#b91c1c",
                      textTransform: "uppercase",
                    }}
                  >
                    {activeScopeValidation.isValid ? "Publication Permitted" : "Publication Blocked"}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: activeScopeValidation.isValid ? "#15803d" : "#b91c1c" }}>
                  {activeScopeValidation.isValid
                    ? "Strict 1-course-per-student/cohort rule enforced. Parallel offerings have qualified faculty & rooms assigned without conflict."
                    : "The scheduler strictly prevents publication until all duplicate enrollments and missing canonical course references are resolved:"}
                </p>
                {!activeScopeValidation.isValid && (
                  <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px", fontSize: "0.85rem", color: "#b91c1c" }}>
                    {activeScopeValidation.violations.map((v, i) => (
                      <li key={i} style={{ marginBottom: "3px" }}>
                        <strong>[{v.code}]</strong>: {v.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Header & Add Elective Button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <div>
                <h3 style={{ margin: 0, color: "#0f172a" }}>
                  Elective Groups for {selectedDept} — Sem {selectedSem}
                </h3>
                <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                  Each student may enroll in only ONE course offering per group. Offerings run in parallel with separate teachers & rooms.
                </p>
              </div>
              <Button
                variant="contained"
                startIcon={<Plus size={16} />}
                onClick={() => {
                  setNewElectiveDept(selectedDept);
                  setNewElectiveSem(selectedSem);
                  setShowAddElective(true);
                }}
                style={{ background: "#4f46e5", textTransform: "none", borderRadius: "8px" }}
              >
                Add Elective Group
              </Button>
            </div>

            {/* Create Elective Group Form Modal */}
            {showAddElective && (
              <form
                onSubmit={handleAddElectiveGroup}
                style={{
                  background: "#f8fafc",
                  padding: "20px",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                  marginBottom: "24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <h4 style={{ margin: 0, color: "#1e293b" }}>Create New Elective Group</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Elective Group Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Professional Elective - III"
                      value={newElectiveName}
                      onChange={(e) => setNewElectiveName(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Department</label>
                    <select
                      value={newElectiveDept}
                      onChange={(e) => setNewElectiveDept(e.target.value)}
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                    >
                      <option value="ALL">ALL (College-wide / Open Elective)</option>
                      {structure.departments.map((d) => (
                        <option key={d.id} value={d.code}>{d.code}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Semester</label>
                    <select
                      value={newElectiveSem}
                      onChange={(e) => setNewElectiveSem(e.target.value)}
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                        <option key={s} value={s}>Semester {s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Scheduling Arrangement</label>
                    <select
                      value={newElectiveType}
                      onChange={(e) => setNewElectiveType(e.target.value)}
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                    >
                      <option value="parallel">Parallel Electives (Simultaneous window, separate rooms/teachers)</option>
                      <option value="common">Common Elective Block (Reserved institutional window)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Academic Term</label>
                    <select
                      value={newElectiveTerm}
                      onChange={(e) => setNewElectiveTerm(e.target.value)}
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                    >
                      {terms.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Weekly Hours</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={newElectiveHours}
                      onChange={(e) => setNewElectiveHours(e.target.value)}
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
                  <Button variant="outlined" onClick={() => setShowAddElective(false)} style={{ textTransform: "none" }}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="contained" style={{ background: "#4f46e5", textTransform: "none" }}>
                    Create Elective Group
                  </Button>
                </div>
              </form>
            )}

            {/* List of Elective Groups */}
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {currentElectiveGroups.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                  <BookmarkCheck size={36} color="#94a3b8" style={{ marginBottom: "10px" }} />
                  <p style={{ color: "#64748b", margin: 0, fontWeight: 500 }}>
                    No elective groups configured for {selectedDept} Sem {selectedSem}.
                  </p>
                  <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "4px 0 0 0" }}>
                    Click "Add Elective Group" above to set up professional or open electives.
                  </p>
                </div>
              ) : (
                currentElectiveGroups.map((group) => {
                  const offerings = (structure.course_offerings || []).filter(
                    (o) => o.elective_group_id === group.id
                  );

                  return (
                    <div
                      key={group.id}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        padding: "20px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      {/* Group Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <span
                              style={{
                                background: group.type === "parallel" ? "#dbeafe" : "#fef3c7",
                                color: group.type === "parallel" ? "#1d4ed8" : "#b45309",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "4px",
                                textTransform: "uppercase",
                              }}
                            >
                              {group.type === "parallel" ? "Parallel Window" : "Common Block"}
                            </span>
                            <strong style={{ fontSize: "1.15rem", color: "#0f172a" }}>{group.name}</strong>
                            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                              ({group.department_code} — Sem {group.semester} | {group.weekly_hours}h/wk)
                            </span>
                          </div>
                          <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                            {group.description}
                          </p>
                        </div>

                        <div style={{ display: "flex", gap: "8px" }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Plus size={14} />}
                            onClick={() => {
                              setActiveOfferingGroupId(group.id);
                              setShowAddOfferingModal(true);
                            }}
                            style={{ textTransform: "none", borderRadius: "6px" }}
                          >
                            Add Course Offering
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            onClick={() => handleDeleteElectiveGroup(group.id)}
                            style={{ minWidth: 0, padding: "6px" }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>

                      {/* Course Offerings List */}
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "10px" }}>
                          Configured Course Offerings ({offerings.length}):
                        </div>

                        {offerings.length === 0 ? (
                          <p style={{ color: "#94a3b8", fontSize: "0.85rem", fontStyle: "italic", margin: "6px 0" }}>
                            No course offerings added yet. Click "+ Add Course Offering" to link canonical courses.
                          </p>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
                            {offerings.map((off) => {
                              const enrolledCohorts = (structure.cohort_elective_enrollments || []).filter(
                                (e) => e.course_offering_id === off.id
                              );
                              const enrolledStudents = (structure.student_elective_enrollments || []).filter(
                                (e) => e.course_offering_id === off.id
                              );

                              return (
                                <div
                                  key={off.id}
                                  style={{
                                    background: "#f8fafc",
                                    border: "1px solid #cbd5e1",
                                    borderRadius: "8px",
                                    padding: "14px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <div>
                                      <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.95rem" }}>
                                        [{off.subject_code}] {off.subject_name}
                                      </div>
                                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                                        Canonical Course ID: {off.course_id}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleDeleteCourseOffering(off.id)}
                                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: "2px" }}
                                      title="Remove Offering"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>

                                  <div style={{ fontSize: "0.8rem", color: "#475569", display: "flex", flexDirection: "column", gap: "3px" }}>
                                    <div>👨‍🏫 <strong>Teacher:</strong> {off.teacher_name || off.teacher_id}</div>
                                    <div>🚪 <strong>Room:</strong> {off.room_name || off.room_id} (Cap: {off.capacity || 60})</div>
                                  </div>

                                  {/* Enrolled Cohorts & Students */}
                                  <div style={{ borderTop: "1px dashed #e2e8f0", paddingTop: "8px", marginTop: "4px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                                        Enrolled: {enrolledCohorts.length} Cohorts, {enrolledStudents.length} Students
                                      </span>
                                      <Button
                                        size="small"
                                        variant="text"
                                        startIcon={<UserCheck size={12} />}
                                        onClick={() => {
                                          setActiveEnrollOfferingId(off.id);
                                          setActiveEnrollGroupId(group.id);
                                          setShowEnrollModal(true);
                                        }}
                                        style={{ fontSize: "0.75rem", textTransform: "none", padding: "2px 6px" }}
                                      >
                                        + Enroll
                                      </Button>
                                    </div>

                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                      {enrolledCohorts.map((ec) => (
                                        <span
                                          key={ec.id}
                                          style={{
                                            background: "#e0e7ff",
                                            color: "#3730a3",
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            fontSize: "0.75rem",
                                            fontWeight: 600,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "4px",
                                          }}
                                        >
                                          Cohort: {ec.cohort_id}
                                          <X
                                            size={12}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => handleUnenrollCohort(ec.id)}
                                          />
                                        </span>
                                      ))}
                                      {enrolledStudents.map((es) => (
                                        <span
                                          key={es.id}
                                          style={{
                                            background: "#ecfdf5",
                                            color: "#065f46",
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            fontSize: "0.75rem",
                                            fontWeight: 600,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "4px",
                                          }}
                                        >
                                          USN: {es.student_id}
                                          <X
                                            size={12}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => handleUnenrollStudent(es.id)}
                                          />
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal: Add Course Offering */}
            {showAddOfferingModal && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(15, 23, 42, 0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 9999,
                }}
              >
                <form
                  onSubmit={handleAddCourseOffering}
                  style={{
                    background: "#ffffff",
                    borderRadius: "14px",
                    padding: "24px",
                    width: "90%",
                    maxWidth: "520px",
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, color: "#0f172a" }}>Add Canonical Course Offering</h3>
                    <button
                      type="button"
                      onClick={() => setShowAddOfferingModal(false)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                    Select an existing course from the canonical catalog. Free-text strings are strictly disallowed.
                  </p>

                  <div>
                    <CourseSelector
                      selectedCourseId={offeringCourseId}
                      courses={subjectsList}
                      onSelect={(course) => setOfferingCourseId(course.id)}
                      onClear={() => setOfferingCourseId("")}
                      label="Canonical Subject"
                      placeholder="Search by code (e.g. 21CS71) or title..."
                      departmentFilter={selectedDept}
                      semesterFilter={selectedSem}
                      required
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Assigned Teacher</label>
                      <select
                        value={offeringTeacherId}
                        onChange={(e) => setOfferingTeacherId(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                      >
                        <option value="">-- Select Teacher --</option>
                        {teachersList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Assigned Room</label>
                      <select
                        value={offeringRoomId}
                        onChange={(e) => setOfferingRoomId(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                      >
                        <option value="">-- Select Room --</option>
                        {roomsList.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.room_name} (Cap: {r.capacity})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Section Capacity</label>
                    <input
                      type="number"
                      min="10"
                      max="200"
                      value={offeringCapacity}
                      onChange={(e) => setOfferingCapacity(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                    <Button variant="outlined" onClick={() => setShowAddOfferingModal(false)} style={{ textTransform: "none" }}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="contained" style={{ background: "#4f46e5", textTransform: "none" }}>
                      Save Offering
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Modal: Enroll Cohort or Student */}
            {showEnrollModal && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(15, 23, 42, 0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 9999,
                }}
              >
                <form
                  onSubmit={handleEnroll}
                  style={{
                    background: "#ffffff",
                    borderRadius: "14px",
                    padding: "24px",
                    width: "90%",
                    maxWidth: "480px",
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, color: "#0f172a" }}>Enroll Cohort or Student</h3>
                    <button
                      type="button"
                      onClick={() => setShowEnrollModal(false)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: "8px", background: "#f1f5f9", padding: "4px", borderRadius: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setEnrollMode("cohort")}
                      style={{
                        flex: 1,
                        padding: "8px",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        background: enrollMode === "cohort" ? "#ffffff" : "transparent",
                        color: enrollMode === "cohort" ? "#4f46e5" : "#64748b",
                        boxShadow: enrollMode === "cohort" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      }}
                    >
                      Student Cohort
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnrollMode("student")}
                      style={{
                        flex: 1,
                        padding: "8px",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        background: enrollMode === "student" ? "#ffffff" : "transparent",
                        color: enrollMode === "student" ? "#4f46e5" : "#64748b",
                        boxShadow: enrollMode === "student" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      }}
                    >
                      Individual Student
                    </button>
                  </div>

                  {enrollMode === "cohort" ? (
                    <div>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Select Student Cohort</label>
                      <select
                        value={enrollCohortId}
                        onChange={(e) => setEnrollCohortId(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                      >
                        <option value="">-- Choose Cohort --</option>
                        {(structure.student_cohorts || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || c.id} ({c.department_code} Sem {c.semester})
                          </option>
                        ))}
                        {(structure.divisions || [])
                          .filter((d) => d.department_code === selectedDept && parseInt(d.semester) === parseInt(selectedSem))
                          .map((div) => (
                            <option key={`cohort-${div.id}`} value={`cohort-${div.name.toLowerCase()}`}>
                              {div.name} (Full Division Cohort)
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Student USN / Roll ID</label>
                      <input
                        type="text"
                        placeholder="e.g. 1MS21CS001"
                        value={enrollStudentUsn}
                        onChange={(e) => setEnrollStudentUsn(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                      />
                      <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                        Enforce single-choice rule: System will immediately reject if this student is already enrolled in another offering in this group.
                      </p>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                    <Button variant="outlined" onClick={() => setShowEnrollModal(false)} style={{ textTransform: "none" }}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="contained" style={{ background: "#4f46e5", textTransform: "none" }}>
                      Enroll
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── TAB 5: ACADEMIC TERMS ── */}
      {activeTab === "terms" && (
        <div>
          <h3 style={{ margin: "0 0 16px 0", color: "#0f172a" }}>Academic Terms & Calendar</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {terms.map((term) => (
              <div
                key={term.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 20px",
                  background: term.is_current ? "#f0fdf4" : "#ffffff",
                  border: term.is_current ? "2px solid #22c55e" : "1px solid #e2e8f0",
                  borderRadius: "10px",
                }}
              >
                <div>
                  <strong style={{ fontSize: "1rem", color: "#0f172a" }}>{term.name}</strong>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                    ID: {term.id}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {term.is_current && (
                    <span
                      style={{
                        background: "#dcfce7",
                        color: "#16a34a",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        padding: "4px 10px",
                        borderRadius: "20px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <CheckCircle size={14} /> Active Term
                    </span>
                  )}
                  {!term.is_current && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleSetCurrentTerm(term.id)}
                      style={{ textTransform: "none" }}
                    >
                      Set Active
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicStructureManager;
