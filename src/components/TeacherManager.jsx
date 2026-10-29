import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import Button from "@mui/material/Button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { createSlotsWithBreaks } from "../services/aiService";
import CourseSelector from "./CourseSelector";

const TeacherManager = () => {
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [name, setName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [expandedScheduleId, setExpandedScheduleId] = useState(null);
  const [teacherBusyMap, setTeacherBusyMap] = useState({});
  const [allTimetables, setAllTimetables] = useState([]);
  const [activeSlots, setActiveSlots] = useState([
    "08:00 AM-09:00 AM",
    "09:00 AM-10:00 AM",
    "10:00 AM-11:00 AM",
    "11:00 AM-12:00 PM",
    "12:00 PM-01:00 PM",
    "01:00 PM-02:00 PM",
    "02:00 PM-03:00 PM",
    "03:00 PM-04:00 PM",
  ]);

  const DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  useEffect(() => {
    fetchAll();
    fetchTeacherAvailability();
    fetchSavedTimetablesAndConstraints();
  }, []);

  const fetchTeacherAvailability = async () => {
    const { data } = await supabase.from("teacher_availability").select("*");
    const map = {};
    (data || []).forEach((row) => {
      if (row.is_busy) {
        if (!map[row.teacher_id]) map[row.teacher_id] = new Set();
        map[row.teacher_id].add(`${row.day_of_week}_${row.time_slot}`);
      }
    });
    setTeacherBusyMap(map);
  };

  const fetchSavedTimetablesAndConstraints = async () => {
    const { data: ttData } = await supabase.from("saved_timetables").select("*");
    const timetables = ttData || [];
    setAllTimetables(timetables);

    // Extract dynamic slots from constraints or saved timetables
    const { data: conData } = await supabase.from("testconstraints").select("*").eq("id", 1).maybeSingle();
    const collectedSlots = [];

    if (conData) {
      const slotsFromCon = createSlotsWithBreaks(conData)
        .filter((s) => s.type === "class")
        .map((s) => s.label);
      collectedSlots.push(...slotsFromCon);
    }

    // Also collect any unique slot labels found in saved timetables
    timetables.forEach((row) => {
      const json = row.timetable_json || {};
      Object.values(json).forEach((daySlots) => {
        if (daySlots && typeof daySlots === "object") {
          Object.keys(daySlots).forEach((k) => {
            if (k && !collectedSlots.includes(k) && k !== "BREAK" && k !== "LUNCH") {
              collectedSlots.push(k);
            }
          });
        }
      });
    });

    if (collectedSlots.length > 0) {
      setActiveSlots(collectedSlots);
    }
  };

  const toggleAvailabilitySlot = async (teacherId, day, slot) => {
    const key = `${day}_${slot}`;
    const currentSet = new Set(teacherBusyMap[teacherId] || []);
    const isCurrentlyBusy = currentSet.has(key);

    // 1. Instant optimistic UI update
    if (isCurrentlyBusy) {
      currentSet.delete(key);
    } else {
      currentSet.add(key);
    }

    setTeacherBusyMap((prev) => ({
      ...prev,
      [teacherId]: currentSet,
    }));

    // 2. Database sync
    if (isCurrentlyBusy) {
      const { error } = await supabase
        .from("teacher_availability")
        .delete()
        .eq("teacher_id", teacherId)
        .eq("day_of_week", day)
        .eq("time_slot", slot);

      if (error) {
        toast.error("Database update failed: " + error.message);
        fetchTeacherAvailability();
      } else {
        toast.success(`Slot (${day} @ ${slot.split("-")[0]}) marked AVAILABLE.`);
      }
    } else {
      const { error } = await supabase.from("teacher_availability").insert([
        {
          teacher_id: teacherId,
          day_of_week: day,
          time_slot: slot,
          is_busy: true,
          semester_id: 0,
        },
      ]);

      if (error) {
        const { error: err2 } = await supabase.from("teacher_availability").insert([
          {
            teacher_id: teacherId,
            day_of_week: day,
            time_slot: slot,
            is_busy: true,
          },
        ]);

        if (err2) {
          toast.error("Could not save availability: " + err2.message);
          fetchTeacherAvailability();
          return;
        }
      }
      toast.success(`Slot (${day} @ ${slot.split("-")[0]}) marked UNAVAILABLE.`);
    }
  };

  const exportFacultyPDF = (teacher) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Faculty Master Schedule: ${teacher.name}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Department & Cross-Semester Schedule Report`, 14, 22);

    const links = teacher.teacher_subjects || [];
    const linkedSubjects = links.map((ts) => ts.subjects).filter(Boolean);
    const teacherSubNames = linkedSubjects.map((s) => s.subject_name?.trim().toLowerCase()).filter(Boolean);
    const teacherSubCodes = linkedSubjects.map((s) => s.subject_code?.trim().toLowerCase()).filter(Boolean);

    const rows = DAYS.map((day) => {
      const row = [day];
      activeSlots.forEach((slot) => {
        let assigned = "-";
        for (const tt of allTimetables) {
          const timetableObj = tt.timetable_json || {};
          const daySlots = timetableObj[day];
          if (!daySlots) continue;

          for (const [slotKey, subVal] of Object.entries(daySlots)) {
            if (!subVal || subVal === "-") continue;

            const slotMatch =
              slotKey === slot ||
              slotKey.split("-")[0].trim() === slot.split("-")[0].trim();

            if (slotMatch) {
              const parts = subVal.includes("/") ? subVal.split("/") : [subVal];
              const isMatch = parts.some((p) => {
                const cleanP = p.trim().toLowerCase();
                return (
                  teacherSubNames.some((n) => n === cleanP || cleanP.includes(n) || n.includes(cleanP)) ||
                  teacherSubCodes.some((c) => c === cleanP)
                );
              });

              if (isMatch) {
                assigned = `${subVal} (${tt.department} S${tt.semester})`;
                break;
              }
            }
          }
          if (assigned !== "-") break;
        }
        row.push(assigned);
      });
      return row;
    });

    autoTable(doc, {
      head: [["Day", ...activeSlots.map((s) => s.split("-")[0])]],
      body: rows,
      startY: 28,
      styles: { fontSize: 7, cellPadding: 2 },
    });

    doc.save(`${teacher.name.replace(/\s+/g, "_")}_Schedule.pdf`);
    toast.success("Schedule exported to PDF!");
  };

  const getInitials = (name) => {
    if (!name) return "";

    const ignore = ["dr", "prof", "mr", "mrs", "ms"];

    return name
      .replace(/\./g, " ")
      .trim()
      .split(/\s+/)
      .filter((word) => !ignore.includes(word.toLowerCase()))
      .map((word) => word[0].toUpperCase())
      .join("");
  };

  const fetchAll = async () => {
    setLoading(true);

    const { data: teacherData, error: te } = await supabase
      .from("teachers")
      .select(
        `
        id, name, created_at,
        teacher_subjects (
          id,
          subject_id,
          subjects ( id, subject_name, subject_code, department, semester )
        )
      `
      )
      .order("name", { ascending: true });

    if (te) console.error("Error fetching teachers:", te);
    else setTeachers(teacherData || []);

    const { data: subData } = await supabase
      .from("subjects")
      .select("id, subject_name, subject_code, department, semester")
      .order("subject_code", { ascending: true });

    setSubjects(subData || []);
    setLoading(false);
  };

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    if (!name.trim() || (!subjectCode.trim() && !selectedCourse))
      return toast.error("Please fill in Teacher Name and select a Subject.");

    const cleanName = name.trim();
    const code = (selectedCourse?.subject_code || subjectCode).toUpperCase().trim();

    // Find matching subjects (either directly the selectedCourse or by code)
    const matched = selectedCourse
      ? [selectedCourse]
      : subjects.filter((s) => s.subject_code?.toUpperCase() === code);
    if (matched.length === 0)
      return toast.error(
        `No subject found with code "${code}". Register the subject first.`
      );

    const tid = "add-teacher-toast";

    // ── Step 1: Find or create teacher ──────────────────────────────────────
    let teacherId = null;

    const { data: existing } = await supabase
      .from("teachers")
      .select("id, name")
      .ilike("name", cleanName) // case-insensitive match
      .maybeSingle();

    if (existing) {
      // Teacher already exists — reuse their id
      teacherId = existing.id;
    } else {
      // New teacher — insert
      const { data: created, error: ce } = await supabase
        .from("teachers")
        .insert([{ name: cleanName }])
        .select()
        .single();

      if (ce)
        return toast.error("Failed to create teacher: " + ce.message, {
          id: tid,
        });
      teacherId = created.id;
    }

    // ── Step 2: Link teacher → subjects (skip duplicates) ───────────────────
    // Fetch existing links for this teacher
    const { data: existingLinks } = await supabase
      .from("teacher_subjects")
      .select("subject_id")
      .eq("teacher_id", teacherId);

    const alreadyLinked = new Set(
      (existingLinks || []).map((l) => l.subject_id)
    );

    const newLinks = matched
      .filter((s) => !alreadyLinked.has(s.id))
      .map((s) => ({ teacher_id: teacherId, subject_id: s.id }));

    const skipped = matched.length - newLinks.length;

    if (newLinks.length === 0) {
      toast(
        `"${cleanName}" is already assigned to all subjects with code ${code}.`,
        {
          id: tid,
          icon: "ℹ️",
          duration: 4000,
        }
      );
      setName("");
      setSubjectCode("");
      return;
    }

    const { error: le } = await supabase
      .from("teacher_subjects")
      .insert(newLinks);
    if (le)
      return toast.error("Failed to link subjects: " + le.message, { id: tid });

    // Dismiss spinner FIRST before any async work
    const msg =
      skipped > 0
        ? `Linked ${newLinks.length} subject(s) to "${cleanName}" (${skipped} already existed).`
        : `"${cleanName}" linked to ${newLinks.length} subject(s) with code ${code}.`;

    toast.success("Teacher added successfully");
    setName("");
    setSubjectCode("");
    setSelectedCourse(null);
    fetchAll(); // no await — let it refresh in background
  };

  // ── REMOVE A SINGLE SUBJECT LINK ──────────────────────────────────────────
  // Removes just the teacher_subjects row.
  // If it was the teacher's last link, also removes the teacher row itself.
  const handleRemoveLink = async (teacher, linkId, isLastLink) => {
    const tid = "remove-link-toast";

    const { error } = await supabase
      .from("teacher_subjects")
      .delete()
      .eq("id", linkId);

    if (error) return toast.error("Could not remove assignment", { id: tid });

    if (isLastLink) {
      await supabase.from("teachers").delete().eq("id", teacher.id);
      toast.success(`"${teacher.name}" fully removed (no subjects left).`, {
        id: tid,
      });
    } else {
      toast.success("Subject assignment removed.", { id: tid });
    }

    fetchAll(); // background refresh
  };

  // ── DELETE ENTIRE TEACHER (all links + teacher row) ───────────────────────
  const handleDeleteTeacher = async (teacher) => {
    if (
      !window.confirm(
        `Remove "${teacher.name}" and all their subject assignments?`
      )
    )
      return;
    const tid = "delete-teacher-toast";
    await supabase
      .from("teacher_subjects")
      .delete()
      .eq("teacher_id", teacher.id);
    const { error } = await supabase
      .from("teachers")
      .delete()
      .eq("id", teacher.id);
    if (error) return toast.error("Could not delete teacher", { id: tid });
    toast.success(`"${teacher.name}" removed.`, { id: tid });
    fetchAll(); // background refresh
  };

  // Unique subject codes for autocomplete
  const uniqueCodes = [
    ...new Set(subjects.map((s) => s.subject_code).filter(Boolean)),
  ];

  // Live preview — subjects matching current input code
  const previewSubjects =
    subjectCode.trim().length >= 2
      ? subjects.filter(
          (s) =>
            s.subject_code?.toUpperCase() === subjectCode.toUpperCase().trim()
        )
      : [];

  // Live preview — does teacher already exist?
  const existingTeacherPreview =
    name.trim().length >= 2
      ? teachers.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())
      : null;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Faculty Management</h2>
        <p>
          Each teacher is one record. Assign multiple subjects to the same
          teacher by entering their name again — no duplicate records created.
        </p>
      </div>

      {/* ── FORM ── */}
      <div
        style={{
          marginBottom: 30,
          padding: 20,
          background: "#f8fafc",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
        }}
      >
        <div className="grid-2">
          {/* Teacher name */}
          <div className="form-group">
            <label>Teacher Name</label>
            <input
              type="text"
              placeholder="e.g. Prof. JDP"
              value={name}
              onChange={(e) => setName(e.target.value)}
              list="teacher-name-list"
            />
            {/* Autocomplete from existing teachers */}
            <datalist id="teacher-name-list">
              {teachers.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>

            {/* Preview: show if teacher already exists */}
            {existingTeacherPreview ? (
              <p
                style={{
                  marginTop: 5,
                  color: "#4f46e5",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                }}
              >
                ↩ Existing teacher found — new subject will be added to their
                record
              </p>
            ) : name.trim().length >= 2 ? (
              <p
                style={{ marginTop: 5, color: "#059669", fontSize: "0.78rem" }}
              >
                ✦ New teacher will be created
              </p>
            ) : null}
          </div>

          {/* Canonical Subject Selector */}
          <div className="form-group" style={{ flex: 1 }}>
            <CourseSelector
              selectedCourse={selectedCourse}
              selectedCourseId={selectedCourse?.id}
              courses={subjects}
              onSelect={(course) => {
                setSelectedCourse(course);
                setSubjectCode(course.subject_code || "");
              }}
              onClear={() => {
                setSelectedCourse(null);
                setSubjectCode("");
              }}
              label="Subject / Course"
              placeholder="Search by code (e.g. CS601) or title..."
              required
            />
          </div>
        </div>

        <Button
          onClick={handleAddAssignment}
          variant="contained"
          style={{ marginTop: 16 }}
        >
          + Assign Subject to Teacher
        </Button>
      </div>

      {/* ── LIST ── */}
      <div className="list">
        <h3>Current Faculty ({teachers.length})</h3>

        {loading ? (
          <div style={{ marginTop: 15 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-box" />
            ))}
          </div>
        ) : teachers.length === 0 ? (
          <p style={{ color: "var(--text-muted)", marginTop: 10 }}>
            No teachers added yet.
          </p>
        ) : (
          teachers.map((teacher) => {
            const links = teacher.teacher_subjects || [];
            const linked = links.map((ts) => ts.subjects).filter(Boolean);

            return (
              <div
                key={teacher.id}
                style={{
                  marginBottom: 12,
                  padding: "14px 16px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  background: "#fff",
                }}
              >
                {/* Teacher name row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg,#6366f1,#4f46e5)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(teacher.name)}
                      {/* {teacher.name.charAt(0).toUpperCase()} */}
                    </div>
                    <div>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: "0.95rem",
                          color: "#1e293b",
                        }}
                      >
                        {teacher.name}
                      </h4>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.75rem",
                          color: "#94a3b8",
                        }}
                      >
                        ID : <b>{teacher.id}</b> | Subjects :{" "}
                        <b>{links.length}</b>
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      className="btn-ghost"
                      style={{
                        color: "#4f46e5",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        background: "#eef2ff",
                        padding: "4px 10px",
                        borderRadius: 6,
                      }}
                      onClick={() =>
                        setExpandedScheduleId(
                          expandedScheduleId === teacher.id ? null : teacher.id
                        )
                      }
                    >
                      {expandedScheduleId === teacher.id
                        ? "▲ Hide Matrix"
                        : "📅 Availability & Schedule"}
                    </button>
                    <button
                      className="btn-ghost"
                      style={{
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                      }}
                      onClick={() => handleDeleteTeacher(teacher)}
                    >
                      Delete All
                    </button>
                  </div>
                </div>

                {/* Subject assignments */}
                <div style={{ marginTop: 10, paddingLeft: 46 }}>
                  {linked.length === 0 ? (
                    <span style={{ color: "#f59e0b", fontSize: "0.78rem" }}>
                      ⚠ No subjects assigned
                    </span>
                  ) : (
                    linked.map((s, idx) => {
                      const linkId = links[idx]?.id;
                      const isLastLink = links.length === 1;
                      return (
                        <div
                          key={s.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 10px",
                            marginBottom: 6,
                            background: "#f8fafc",
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                padding: "2px 7px",
                                borderRadius: 5,
                                fontSize: "0.72rem",
                                fontWeight: 700,
                              }}
                            >
                              {s.subject_code}
                            </span>
                            <span
                              style={{
                                fontSize: "0.85rem",
                                color: "#1e293b",
                                fontWeight: 500,
                              }}
                            >
                              {s.subject_name}
                            </span>
                            <span
                              style={{ fontSize: "0.72rem", color: "#94a3b8" }}
                            >
                              {s.department} · Sem {s.semester}
                            </span>
                          </div>
                          <button
                            className="btn-ghost"
                            style={{
                              color: "#ef4444",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                            onClick={() =>
                              handleRemoveLink(teacher, linkId, isLastLink)
                            }
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Expanded Schedule & Availability Matrix */}
                {expandedScheduleId === teacher.id && (
                  <div
                    style={{
                      marginTop: 15,
                      padding: 15,
                      background: "#f8fafc",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <h4
                          style={{
                            margin: 0,
                            color: "#1e293b",
                            fontSize: "0.9rem",
                            fontWeight: 700,
                          }}
                        >
                          📅 Availability Matrix & Assigned Slots: {teacher.name}
                        </h4>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.75rem",
                            color: "#64748b",
                          }}
                        >
                          Click any slot cell to toggle Availability (🟩 Available / 🟥 Blocked).
                        </p>
                      </div>
                      <button
                        style={{
                          background: "#3b82f6",
                          color: "#fff",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: 6,
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        onClick={() => exportFacultyPDF(teacher)}
                      >
                        📄 Download PDF Schedule
                      </button>
                    </div>

                    {/* Matrix Grid */}
                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "0.78rem",
                          textAlign: "center",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#e2e8f0" }}>
                            <th style={{ padding: 6, border: "1px solid #cbd5e1" }}>
                              Day / Slot
                            </th>
                            {activeSlots.map((sl) => (
                              <th
                                key={sl}
                                style={{
                                  padding: 6,
                                  border: "1px solid #cbd5e1",
                                  fontSize: "0.7rem",
                                }}
                              >
                                {sl.split("-")[0]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {DAYS.map((day) => (
                            <tr key={day}>
                              <td
                                style={{
                                  padding: 6,
                                  fontWeight: 700,
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                }}
                              >
                                {day}
                              </td>
                              {activeSlots.map((slot) => {
                                const isBusy = teacherBusyMap[teacher.id]?.has(
                                  `${day}_${slot}`
                                );

                                // Robust subject assignment check across all saved timetables
                                let assignedSubject = null;
                                const teacherSubNames = linked.map((s) => s.subject_name?.trim().toLowerCase()).filter(Boolean);
                                const teacherSubCodes = linked.map((s) => s.subject_code?.trim().toLowerCase()).filter(Boolean);

                                for (const tt of allTimetables) {
                                  const ttJson = tt.timetable_json || {};
                                  const daySlots = ttJson[day];
                                  if (!daySlots) continue;

                                  for (const [slotKey, subVal] of Object.entries(daySlots)) {
                                    if (!subVal || subVal === "-") continue;

                                    const slotMatch =
                                      slotKey === slot ||
                                      slotKey.split("-")[0].trim() === slot.split("-")[0].trim();

                                    if (slotMatch) {
                                      const parts = subVal.includes("/") ? subVal.split("/") : [subVal];
                                      const isMatch = parts.some((p) => {
                                        const cleanP = p.trim().toLowerCase();
                                        return (
                                          teacherSubNames.some((n) => n === cleanP || cleanP.includes(n) || n.includes(cleanP)) ||
                                          teacherSubCodes.some((c) => c === cleanP)
                                        );
                                      });

                                      if (isMatch) {
                                        assignedSubject = `${subVal} (${tt.department} S${tt.semester})`;
                                        break;
                                      }
                                    }
                                  }
                                  if (assignedSubject) break;
                                }

                                return (
                                  <td
                                    key={slot}
                                    style={{
                                      padding: 6,
                                      border: "1px solid #cbd5e1",
                                      background: assignedSubject
                                        ? "#dbeafe"
                                        : isBusy
                                        ? "#fecdd3"
                                        : "#dcfce7",
                                      color: assignedSubject
                                        ? "#1e40af"
                                        : isBusy
                                        ? "#9f1239"
                                        : "#166534",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                    title={
                                      assignedSubject
                                        ? `Teaching: ${assignedSubject}`
                                        : isBusy
                                        ? "Click to mark Available"
                                        : "Click to mark Unavailable"
                                    }
                                    onClick={() =>
                                      toggleAvailabilitySlot(
                                        teacher.id,
                                        day,
                                        slot
                                      )
                                    }
                                  >
                                    {assignedSubject ? (
                                      <span>📖 {assignedSubject}</span>
                                    ) : isBusy ? (
                                      <span>⛔ Blocked</span>
                                    ) : (
                                      <span>✓ Free</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TeacherManager;
