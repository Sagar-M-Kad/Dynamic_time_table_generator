import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { toast } from "react-hot-toast";
import Button from "@mui/material/Button";

const SubjectManager = () => {
  const [subjects, setSubjects] = useState([]);
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("");
  const [courseCategory, setCourseCategory] = useState("Theory");
  const [ltpLecture, setLtpLecture] = useState("3");
  const [ltpTutorial, setLtpTutorial] = useState("0");
  const [ltpPractical, setLtpPractical] = useState("0");
  const [isLab, setIsLab] = useState(false);
  const [semester, setSemester] = useState("1");
  const [department, setDepartment] = useState("ISE");
  const [electiveGroup, setElectiveGroup] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedDept, setExpandedDept] = useState(null);
  const [expandedSem, setExpandedSem] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);
  const formRef = useRef(null);

  const [catalogQuery, setCatalogQuery] = useState("");

  const deptOptions = ["ISE", "CSE", "AIML", "ECE", "ME", "CV"];
  const semOptions = [1, 2, 3, 4, 5, 6, 7, 8];
  const categoryOptions = [
    "Theory",
    "Laboratory",
    "Tutorial",
    "Professional Elective",
    "Open Elective",
    "Major Project",
    "Seminar",
  ];

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("subjects")
      .select("*")
      .order("subject_name", { ascending: true });
    if (error) console.error("Error fetching subjects:", error);
    else setSubjects(data || []);
    setTimeout(() => setLoading(false), 500);
  };

  const cancelEdit = () => {
    setEditingSubject(null);
    setSubjectName("");
    setSubjectCode("");
    setWeeklyHours("");
    setIsLab(false);
    setCourseCategory("Theory");
    setElectiveGroup("");
    setLtpLecture("3");
    setLtpTutorial("0");
    setLtpPractical("0");
  };

  const startEditSubject = (sub) => {
    setEditingSubject(sub);
    setSubjectName(sub.subject_name || "");
    setSubjectCode(sub.subject_code || "");
    setWeeklyHours(sub.weekly_hours != null ? String(sub.weekly_hours) : "");
    setDepartment(sub.department || "ISE");
    setSemester(sub.semester != null ? String(sub.semester) : "1");
    setCourseCategory(sub.course_category || (sub.is_lab ? "Laboratory" : "Theory"));
    setIsLab(Boolean(sub.is_lab || sub.course_category === "Laboratory"));
    setElectiveGroup(sub.elective_group_id || sub.elective_group || "");

    if (sub.ltp && typeof sub.ltp === "string" && sub.ltp.includes("-")) {
      const parts = sub.ltp.split("-");
      setLtpLecture(parts[0] || "0");
      setLtpTutorial(parts[1] || "0");
      setLtpPractical(parts[2] || "0");
    } else {
      setLtpLecture(sub.is_lab ? "0" : (sub.weekly_hours ? Math.floor(sub.weekly_hours).toString() : "3"));
      setLtpTutorial("0");
      setLtpPractical(sub.is_lab ? (sub.weekly_hours ? String(sub.weekly_hours) : "2") : "0");
    }

    setExpandedDept(sub.department);
    setExpandedSem(`${sub.department}-${sub.semester}`);
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    toast(`Editing ${sub.subject_code || sub.subject_name}`, { icon: "✏️" });
  };

  const handleUpdateSubject = async (e) => {
    e?.preventDefault();
    if (!editingSubject) return;
    if (!subjectName || !subjectCode || !weeklyHours)
      return toast.error("Please fill in Subject Name, Code and Credits.");

    const cleanCode = subjectCode.toUpperCase().trim();
    const cleanName = subjectName.trim();
    const semNum = parseInt(semester);

    // Validation: Check code-to-subject consistency and local duplicates
    const validationError = validateSubjectUniqueness(
      cleanCode,
      cleanName,
      department,
      semNum,
      editingSubject.id
    );
    if (validationError) {
      return toast.error(validationError);
    }

    const tid = toast.loading("Updating subject...");
    const isLabActual = isLab || courseCategory === "Laboratory";
    const ltpString = `${ltpLecture || 0}-${ltpTutorial || 0}-${ltpPractical || (isLabActual ? 2 : 0)}`;

    const updatePayload = {
      subject_name: cleanName,
      subject_code: cleanCode,
      weekly_hours: parseFloat(weeklyHours),
      is_lab: isLabActual,
      semester: parseInt(semester),
      department,
      course_category: courseCategory,
      ltp: ltpString,
      elective_group_id: electiveGroup.trim() || null,
    };

    let { error } = await supabase
      .from("subjects")
      .update(updatePayload)
      .eq("id", editingSubject.id);

    // Graceful fallback if course_category, ltp, or elective_group_id columns don't exist yet in Supabase table
    if (error && (error.message.includes("course_category") || error.message.includes("ltp") || error.message.includes("elective_group_id"))) {
      delete updatePayload.course_category;
      delete updatePayload.ltp;
      delete updatePayload.elective_group_id;
      const retry = await supabase
        .from("subjects")
        .update(updatePayload)
        .eq("id", editingSubject.id);
      error = retry.error;
    }

    if (error) {
      toast.error(error.message || "Failed to update", { id: tid });
    } else {
      cancelEdit();
      fetchSubjects();
      toast.success("Subject updated successfully!", { id: tid });
    }
  };

  const validateSubjectUniqueness = (cleanCode, cleanName, dept, semNum, currentId = null) => {
    // 1. Same course code cannot be assigned to different subjects
    const existingWithSameCode = subjects.find(
      (s) =>
        s.id !== currentId &&
        s.subject_code?.toUpperCase().trim() === cleanCode &&
        s.subject_name?.trim().toLowerCase() !== cleanName.toLowerCase()
    );
    if (existingWithSameCode) {
      return `Course code "${cleanCode}" is already assigned to "${existingWithSameCode.subject_name}". The same course code cannot have different subjects.`;
    }

    // 2. Prevent duplicate course code in the same department and semester
    const duplicateCode = subjects.find(
      (s) =>
        s.id !== currentId &&
        s.subject_code?.toUpperCase().trim() === cleanCode &&
        s.department?.toUpperCase() === dept.toUpperCase() &&
        parseInt(s.semester) === semNum
    );
    if (duplicateCode) {
      return `Course code "${cleanCode}" already exists for ${dept} Sem ${semNum}.`;
    }

    // 3. Prevent duplicate subject name (case-insensitive) in the same department and semester
    const duplicateName = subjects.find(
      (s) =>
        s.id !== currentId &&
        s.subject_name?.trim().toLowerCase() === cleanName.toLowerCase() &&
        s.department?.toUpperCase() === dept.toUpperCase() &&
        parseInt(s.semester) === semNum
    );
    if (duplicateName) {
      return `Subject "${duplicateName.subject_name}" already exists for ${dept} Sem ${semNum}.`;
    }

    return null;
  };

  const handleAddSubject = async (e) => {
    e.preventDefault();
    if (!subjectName || !subjectCode || !weeklyHours)
      return toast.error("Please fill in Subject Name, Code and Credits.");

    const cleanCode = subjectCode.toUpperCase().trim();
    const cleanName = subjectName.trim();
    const semNum = parseInt(semester);

    // Validation: Check code-to-subject consistency and local duplicates
    const validationError = validateSubjectUniqueness(
      cleanCode,
      cleanName,
      department,
      semNum
    );
    if (validationError) {
      return toast.error(validationError);
    }

    const tid = toast.loading("Saving subject...");
    const isLabActual = isLab || courseCategory === "Laboratory";
    const ltpString = `${ltpLecture || 0}-${ltpTutorial || 0}-${ltpPractical || (isLabActual ? 2 : 0)}`;

    const insertPayload = {
      subject_name: cleanName,
      subject_code: cleanCode,
      weekly_hours: parseFloat(weeklyHours),
      is_lab: isLabActual,
      semester: parseInt(semester),
      department,
      course_category: courseCategory,
      ltp: ltpString,
      elective_group_id: electiveGroup.trim() || null,
    };

    let { error } = await supabase.from("subjects").insert([insertPayload]);

    // Graceful fallback if course_category, ltp, or elective_group_id columns don't exist yet in Supabase table
    if (error && (error.message.includes("course_category") || error.message.includes("ltp") || error.message.includes("elective_group_id"))) {
      delete insertPayload.course_category;
      delete insertPayload.ltp;
      delete insertPayload.elective_group_id;
      const retry = await supabase.from("subjects").insert([insertPayload]);
      error = retry.error;
    }

    if (error) {
      toast.error(error.message || "Failed to save", { id: tid });
    } else {
      cancelEdit();
      fetchSubjects();
      toast.success("Subject added with complete metadata!", { id: tid });
    }
  };

  const deleteSubject = async (id) => {
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) toast.error("Could not delete subject");
    else {
      if (editingSubject?.id === id) {
        cancelEdit();
      }
      fetchSubjects();
      toast.success("Subject removed");
    }
  };

  const toggleDept = (dept) =>
    setExpandedDept(expandedDept === dept ? null : dept);
  const toggleSem = (dept, sem) => {
    const key = `${dept}-${sem}`;
    setExpandedSem(expandedSem === key ? null : key);
  };

  const inp = {
    width: "100%",
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    marginTop: "5px",
    fontSize: "0.95rem",
  };

  return (
    <div
      className="card room-manager-card"
      style={{ maxWidth: "1000px", margin: "20px auto" }}
    >
      <div className="card-header" style={{ marginBottom: "30px" }}>
        <h2 style={{ color: "#0f172a" }}>Subject Management</h2>
        <p style={{ color: "#64748b" }}>
          Define curriculum requirements and credits per department.
        </p>
      </div>

      {/* ── FORM ── */}
      <div
        ref={formRef}
        style={{
          marginBottom: "40px",
          padding: "25px",
          background: "#f8fafc",
          borderRadius: "12px",
          border: editingSubject ? "2px solid #3b82f6" : "1px solid #e2e8f0",
          boxShadow: editingSubject ? "0 4px 14px rgba(59, 130, 246, 0.15)" : "none",
          transition: "all 0.2s ease",
        }}
      >
        {editingSubject && (
          <div
            style={{
              marginBottom: "20px",
              padding: "12px 16px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "1rem" }}>✏️</span>
                <strong style={{ color: "#1e40af", fontSize: "0.95rem" }}>
                  Editing Subject: {editingSubject.subject_code} — {editingSubject.subject_name}
                </strong>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#3b82f6" }}>
                Modify details below and click &quot;Update Subject&quot; to save changes.
              </p>
            </div>
            <Button
              size="small"
              variant="outlined"
              onClick={cancelEdit}
              style={{ textTransform: "none", borderColor: "#93c5fd", color: "#1d4ed8" }}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Row 1 — Name + Code */}
        <div className="room-form-grid">
          <div className="form-group">
            <label style={{ color: "#475569", fontWeight: "600" }}>
              Subject Name
            </label>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="e.g. Operating Systems"
              style={inp}
            />
          </div>
          <div className="form-group">
            <label style={{ color: "#475569", fontWeight: "600" }}>
              Subject Code <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              placeholder="e.g. CS601"
              style={inp}
            />
          </div>
        </div>

        {/* Row 2 — Dept + Sem + Credits */}
        <div className="subject-form-grid-3" style={{ marginTop: "20px" }}>
          <div className="form-group">
            <label style={{ color: "#475569", fontWeight: "600" }}>
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              style={inp}
            >
              {deptOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label style={{ color: "#475569", fontWeight: "600" }}>
              Semester
            </label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              style={inp}
            >
              {semOptions.map((s) => (
                <option key={s} value={s}>
                  {s} Semester
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label style={{ color: "#475569", fontWeight: "600" }}>
              Weekly Hours
            </label>
            <input
              type="number"
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
              placeholder="e.g. 4"
              style={inp}
            />
          </div>
        </div>

        {/* Row 3 — Category + L-T-P breakdown */}
        <div className="room-form-grid" style={{ marginTop: "20px" }}>
          <div className="form-group">
            <label style={{ color: "#475569", fontWeight: "600" }}>
              Course Category / Classification
            </label>
            <select
              value={courseCategory}
              onChange={(e) => {
                const cat = e.target.value;
                setCourseCategory(cat);
                if (cat === "Laboratory") setIsLab(true);
              }}
              style={inp}
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label style={{ color: "#475569", fontWeight: "600" }}>
              L-T-P (Lecture - Tutorial - Practical)
            </label>
            <div style={{ display: "flex", gap: "8px", marginTop: "5px" }}>
              <input
                type="number"
                min="0"
                value={ltpLecture}
                onChange={(e) => setLtpLecture(e.target.value)}
                placeholder="L"
                title="Lecture Hours"
                style={{ ...inp, marginTop: 0 }}
              />
              <input
                type="number"
                min="0"
                value={ltpTutorial}
                onChange={(e) => setLtpTutorial(e.target.value)}
                placeholder="T"
                title="Tutorial Hours"
                style={{ ...inp, marginTop: 0 }}
              />
              <input
                type="number"
                min="0"
                value={ltpPractical}
                onChange={(e) => setLtpPractical(e.target.value)}
                placeholder="P"
                title="Practical/Lab Hours"
                style={{ ...inp, marginTop: 0 }}
              />
            </div>
          </div>
        </div>

        {/* Row 3b — Elective Group (Parallel Basket) */}
        {courseCategory.includes("Elective") && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              background: "#fffbeb",
              borderRadius: "8px",
              border: "1px solid #fde68a",
            }}
          >
            <label style={{ color: "#92400e", fontWeight: "700", fontSize: "0.9rem" }}>
              ⚡ Elective Basket / Group (Courses in the same group run in parallel)
            </label>
            <div style={{ display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
              <select
                value={electiveGroup}
                onChange={(e) => setElectiveGroup(e.target.value)}
                style={{ ...inp, marginTop: 0, flex: 1, minWidth: 200, background: "#fff" }}
              >
                <option value="">-- Select Standard Basket or Enter Custom --</option>
                <option value="PE-1">PE-1 (e.g. Distributed Systems & NLP)</option>
                <option value="PE-2">PE-2 (e.g. Deep Learning & Software Testing)</option>
                <option value="PE-3">PE-3 (Professional Elective III)</option>
                <option value="OE-1">OE-1 (Open Elective I - Blockchain, etc.)</option>
                <option value="OE-2">OE-2 (Open Elective II)</option>
              </select>
              <input
                type="text"
                placeholder="Or custom group name (e.g. PE-1, PE-2, 22UCSE72x)"
                value={electiveGroup}
                onChange={(e) => setElectiveGroup(e.target.value)}
                style={{ ...inp, marginTop: 0, flex: 1, minWidth: 200, background: "#fff" }}
              />
            </div>
            <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "#b45309" }}>
              ℹ️ Electives with the same group name are scheduled simultaneously in parallel across separate rooms.
            </p>
          </div>
        )}

        {/* Lab checkbox */}
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="checkbox"
            id="labCheck"
            checked={isLab || courseCategory === "Laboratory"}
            onChange={(e) => setIsLab(e.target.checked)}
            style={{
              width: 18,
              height: 18,
              cursor: "pointer",
              accentColor: "#4f46e5",
            }}
          />
          <label
            htmlFor="labCheck"
            style={{ color: "#475569", cursor: "pointer", fontWeight: 600 }}
          >
            Requires Dedicated Laboratory (Consecutive 2-Hour Window)
          </label>
        </div>

        {editingSubject ? (
          <div style={{ display: "flex", gap: "12px", marginTop: "25px" }}>
            <Button
              variant="contained"
              onClick={handleUpdateSubject}
              style={{
                flex: 1,
                backgroundColor: "#2563eb",
                textTransform: "none",
                fontWeight: "600",
                padding: "10px",
              }}
            >
              Update Subject
            </Button>
            <Button
              variant="outlined"
              onClick={cancelEdit}
              style={{
                borderColor: "#cbd5e1",
                color: "#64748b",
                textTransform: "none",
                fontWeight: "600",
                padding: "10px 20px",
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="contained"
            onClick={handleAddSubject}
            style={{
              marginTop: "25px",
              width: "100%",
              backgroundColor: "#3b82f6",
              textTransform: "none",
              fontWeight: "600",
            }}
          >
            Register Subject
          </Button>
        )}
      </div>

      {/* ── CATALOG ── */}
      <div className="list">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: "20px",
          }}
        >
          <div>
            <h3 style={{ color: "#0f172a", margin: 0 }}>Academic Catalog</h3>
            <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
              {subjects.length} Canonical Courses Configured
            </span>
          </div>

          <div style={{ position: "relative", minWidth: 280 }}>
            <input
              type="text"
              placeholder="Search catalog by code or title…"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                fontSize: "0.88rem",
              }}
            />
            {catalogQuery && (
              <button
                type="button"
                onClick={() => setCatalogQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {loading
          ? [1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  height: 56,
                  backgroundColor: "#f1f5f9",
                  borderRadius: 8,
                  marginBottom: 12,
                }}
                className="skeleton-box"
              />
            ))
          : deptOptions.map((dept) => {
              const q = catalogQuery.trim().toLowerCase();
              const deptSubjects = subjects.filter((s) => {
                if (s.department !== dept) return false;
                if (!q) return true;
                return (
                  s.subject_code?.toLowerCase().includes(q) ||
                  s.subject_name?.toLowerCase().includes(q)
                );
              });
              const isDeptOpen = expandedDept === dept || (q.length > 0 && deptSubjects.length > 0);
              return (
                <div
                  key={dept}
                  style={{
                    marginBottom: 12,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    overflow: "hidden",
                  }}
                >
                  <div
                    onClick={() => toggleDept(dept)}
                    style={{
                      padding: "16px 20px",
                      background: isDeptOpen ? "#f1f5f9" : "#fff",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderLeft: `5px solid ${
                        isDeptOpen ? "#3b82f6" : "#cbd5e1"
                      }`,
                    }}
                  >
                    <h4
                      style={{ margin: 0, color: "#1e293b", fontWeight: 700 }}
                    >
                      {dept} DEPARTMENT
                    </h4>
                    <span style={{ color: "#94a3b8" }}>
                      {isDeptOpen ? "▲" : "▼"}
                    </span>
                  </div>

                  {isDeptOpen && (
                    <div style={{ padding: 12, background: "#f8fafc" }}>
                      {semOptions.map((sem) => {
                        const semKey = `${dept}-${sem}`;
                        const finalSubjects = deptSubjects.filter(
                          (s) => s.semester === sem
                        );
                        const isSemOpen =
                          expandedSem === semKey ||
                          (catalogQuery.trim().length > 0 && finalSubjects.length > 0);
                        return (
                          <div
                            key={sem}
                            style={{
                              marginBottom: 8,
                              border: "1px solid #e2e8f0",
                              borderRadius: 6,
                              overflow: "hidden",
                              background: "#fff",
                            }}
                          >
                            <div
                              onClick={() => toggleSem(dept, sem)}
                              style={{
                                padding: "12px 15px",
                                cursor: "pointer",
                                display: "flex",
                                justifyContent: "space-between",
                                background: isSemOpen ? "#f1f5f9" : "#fff",
                                alignItems: "center",
                              }}
                            >
                              <h4
                                style={{
                                  margin: 0,
                                  color: "#475569",
                                  fontWeight: 600,
                                }}
                              >
                                Semester {sem}
                              </h4>
                              <span
                                style={{ fontSize: "0.7rem", color: "#94a3b8" }}
                              >
                                {isSemOpen ? "▲" : "▼"}
                              </span>
                            </div>

                            {isSemOpen && (
                              <div style={{ padding: 10 }}>
                                {finalSubjects.length === 0 ? (
                                  <p
                                    style={{
                                      color: "#94a3b8",
                                      fontSize: "0.8rem",
                                      fontStyle: "italic",
                                      textAlign: "center",
                                      padding: 10,
                                    }}
                                  >
                                    No subjects registered.
                                  </p>
                                ) : (
                                  finalSubjects.map((sub) => {
                                    const isCurrentlyEditing = editingSubject?.id === sub.id;
                                    return (
                                      <div
                                        key={sub.id}
                                        className="data-item"
                                        style={{
                                          marginBottom: 8,
                                          padding: 12,
                                          border: isCurrentlyEditing
                                            ? "1.5px solid #3b82f6"
                                            : "1px solid #f1f5f9",
                                          borderRadius: 6,
                                          backgroundColor: isCurrentlyEditing
                                            ? "#f0f7ff"
                                            : "#fff",
                                          transition: "all 0.2s ease",
                                        }}
                                      >
                                        <div className="item-info">
                                          <div
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 10,
                                              flexWrap: "wrap",
                                            }}
                                          >
                                            <h4
                                              style={{
                                                margin: 0,
                                                fontSize: "0.95rem",
                                                color: isCurrentlyEditing ? "#1d4ed8" : "#0f172a",
                                              }}
                                            >
                                              {sub.subject_name}
                                            </h4>
                                            {/* Subject code badge */}
                                            <span
                                              style={{
                                                background: "#eff6ff",
                                                color: "#1d4ed8",
                                                padding: "2px 8px",
                                                borderRadius: 6,
                                                fontSize: "0.72rem",
                                                fontWeight: 700,
                                                letterSpacing: "0.5px",
                                              }}
                                            >
                                              {sub.subject_code || "—"}
                                            </span>
                                            {sub.course_category && (
                                              <span
                                                style={{
                                                  backgroundColor: "#ede9fe",
                                                  color: "#5b21b6",
                                                  padding: "2px 8px",
                                                  borderRadius: 6,
                                                  fontSize: "0.68rem",
                                                  fontWeight: 600,
                                                }}
                                              >
                                                {sub.course_category}
                                              </span>
                                            )}
                                            {sub.elective_group_id && (
                                              <span
                                                style={{
                                                  backgroundColor: "#fef3c7",
                                                  color: "#92400e",
                                                  padding: "2px 8px",
                                                  borderRadius: 6,
                                                  fontSize: "0.68rem",
                                                  fontWeight: 700,
                                                  border: "1px solid #fde68a",
                                                }}
                                              >
                                                ⚡ Group: {sub.elective_group_id}
                                              </span>
                                            )}
                                            {sub.ltp && (
                                              <span
                                                style={{
                                                  backgroundColor: "#f1f5f9",
                                                  color: "#334155",
                                                  padding: "2px 6px",
                                                  borderRadius: 4,
                                                  fontSize: "0.68rem",
                                                  fontWeight: 600,
                                                  letterSpacing: "0.5px",
                                                }}
                                              >
                                                L-T-P: {sub.ltp}
                                              </span>
                                            )}
                                            {sub.is_lab && (
                                              <span
                                                style={{
                                                  backgroundColor: "#fee2e2",
                                                  color: "#b91c1c",
                                                  padding: "2px 8px",
                                                  borderRadius: 12,
                                                  fontSize: "0.65rem",
                                                  fontWeight: "bold",
                                                }}
                                              >
                                                LAB
                                              </span>
                                            )}
                                            {isCurrentlyEditing && (
                                              <span
                                                style={{
                                                  backgroundColor: "#dbeafe",
                                                  color: "#1e40af",
                                                  padding: "2px 8px",
                                                  borderRadius: 12,
                                                  fontSize: "0.65rem",
                                                  fontWeight: "bold",
                                                }}
                                              >
                                                EDITING
                                              </span>
                                            )}
                                          </div>
                                          <p
                                            style={{
                                              margin: "4px 0 0",
                                              fontSize: "0.85rem",
                                              color: "#64748b",
                                            }}
                                          >
                                            Credits : <b>{sub.weekly_hours}</b>
                                            &nbsp;·&nbsp; {
                                              sub.department
                                            } Sem {sub.semester}
                                          </p>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <button
                                            className="btn-ghost"
                                            style={{
                                              color: isCurrentlyEditing ? "#1d4ed8" : "#2563eb",
                                              backgroundColor: isCurrentlyEditing ? "#dbeafe" : "#f1f5f9",
                                              padding: "4px 10px",
                                              borderRadius: 4,
                                              fontSize: "0.8rem",
                                              fontWeight: 600,
                                              cursor: "pointer",
                                              border: isCurrentlyEditing ? "1px solid #93c5fd" : "none",
                                            }}
                                            onClick={() =>
                                              isCurrentlyEditing ? cancelEdit() : startEditSubject(sub)
                                            }
                                          >
                                            {isCurrentlyEditing ? "Cancel" : "Edit"}
                                          </button>
                                          <button
                                            className="btn-ghost"
                                            style={{
                                              color: "#ef4444",
                                              fontSize: "0.8rem",
                                              fontWeight: 600,
                                              cursor: "pointer",
                                              padding: "4px 8px",
                                            }}
                                            onClick={() => deleteSubject(sub.id)}
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
      </div>
    </div>
  );
};

export default SubjectManager;
