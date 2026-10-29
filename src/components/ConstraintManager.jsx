import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { toast } from "react-hot-toast";
import Button from "@mui/material/Button";
import {
  fetchAcademicStructure,
  saveAcademicStructure,
} from "../services/academicStructureService";

const to24Hour = (hour, min, period) => {
  let h = parseInt(hour);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return { hour: h, min: parseInt(min) };
};

const to12Hour = (hour) => {
  const period = hour >= 12 ? "PM" : "AM";
  let h = hour % 12;
  if (h === 0) h = 12;
  return { hour: h, period };
};

const ConstraintManager = () => {
  const [activeTab, setActiveTab] = useState("academic"); // 'academic' | 'labs' | 'timing'

  const [settings, setSettings] = useState({
    start: "09:00 AM",
    end: "05:00 PM",
    theory: "1",
    lab: "2",
    lunchStart: "01:00 PM",
    lunchDur: "1",
    breakStart: "11:00 AM",
    breakDur: "0.5",
    maxDaily: "4",
    maxConsec: "2",
    maxDivisionDailyLabs: "1",
  });

  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const minutes = ["00", "15", "30", "45"];
  const periods = ["AM", "PM"];
  const durations = [0.5, 1, 2, 2.5, 3];

  const startH = useRef();
  const startM = useRef();
  const startP = useRef();
  const endH = useRef();
  const endM = useRef();
  const endP = useRef();
  const lunchH = useRef();
  const lunchM = useRef();
  const lunchP = useRef();
  const breakH = useRef();
  const breakM = useRef();
  const breakP = useRef();

  const theoryRef = useRef();
  const labRef = useRef();
  const lunchDurRef = useRef();
  const breakDurRef = useRef();
  const maxDailyRef = useRef();
  const maxConsecRef = useRef();
  const maxDivisionDailyLabsRef = useRef();

  // ── ACADEMIC STRUCTURE STATE ──────────────────────────────────────────────
  const [structure, setStructure] = useState({
    departments: [],
    divisions: [],
    batches: [],
  });
  const [selectedDeptCode, setSelectedDeptCode] = useState("CSE");
  const [selectedSem, setSelectedSem] = useState(6);
  const [selectedDivId, setSelectedDivId] = useState("");

  // New item inputs
  const [newDeptCode, setNewDeptCode] = useState("");
  const [newDeptName, setNewDeptName] = useState("");
  const [showAddDept, setShowAddDept] = useState(false);

  const [newDivName, setNewDivName] = useState("");
  const [newBatchName, setNewBatchName] = useState("");

  useEffect(() => {
    fetchConstraints();
    loadAcademicStructure();
  }, []);

  const loadAcademicStructure = async () => {
    const data = await fetchAcademicStructure();
    setStructure(data);

    // Default selected division
    const cse6Divs = data.divisions.filter(
      (d) => d.department_code === "CSE" && parseInt(d.semester) === 6
    );
    if (cse6Divs.length > 0) {
      setSelectedDivId(cse6Divs[0].id);
    }
  };

  const fetchConstraints = async () => {
    const { data } = await supabase
      .from("testconstraints")
      .select("*")
      .eq("id", 1)
      .limit(1)
      .maybeSingle();

    if (data) {
      const start = to12Hour(data.start_hour);
      const end = to12Hour(data.end_hour);
      const lunch = to12Hour(data.lunch_hour);
      const br = to12Hour(data.break_hour);

      setSettings({
        start: `${start.hour}:${String(data.start_min).padStart(2, "0")} ${
          start.period
        }`,
        end: `${end.hour}:${String(data.end_min).padStart(2, "0")} ${
          end.period
        }`,
        theory: data.period_duration,
        lab: data.lab_duration,
        lunchStart: `${lunch.hour}:${String(data.lunch_min).padStart(2, "0")} ${
          lunch.period
        }`,
        lunchDur: data.lunch_duration,
        breakStart: `${br.hour}:${String(data.break_min).padStart(2, "0")} ${
          br.period
        }`,
        breakDur: data.break_duration,
        maxDaily:
          data.max_teacher_daily_hours ||
          localStorage.getItem("maxDailyHours") ||
          "4",
        maxConsec:
          data.max_teacher_consecutive_hours ||
          localStorage.getItem("maxConsecHours") ||
          "2",
        maxDivisionDailyLabs:
          data.max_division_daily_labs?.toString() ||
          localStorage.getItem("maxDivisionDailyLabs") ||
          "1",
      });
    }
  };

  const handleSaveConstraints = async () => {
    // Helper to safely parse time strings like "09:00 AM" into 24-hour { hour, min }
    const parseTimeStringTo24Hour = (timeStr, fallbackH, fallbackM, fallbackP) => {
      if (!timeStr) return { hour: fallbackH, min: fallbackM };
      const parts = timeStr.trim().split(" ");
      const [hStr, mStr] = (parts[0] || "").split(":");
      const h = parseInt(hStr, 10) || fallbackH;
      const m = parseInt(mStr, 10) || fallbackM;
      const period = parts[1] || fallbackP || (h >= 12 ? "PM" : "AM");
      return to24Hour(h, m, period);
    };

    // If timing refs are mounted (user is on 'timing' tab), read from refs;
    // otherwise fallback safely to current settings state!
    const start =
      startH.current?.value && startM.current?.value && startP.current?.value
        ? to24Hour(startH.current.value, startM.current.value, startP.current.value)
        : parseTimeStringTo24Hour(settings.start, 9, 0, "AM");

    const end =
      endH.current?.value && endM.current?.value && endP.current?.value
        ? to24Hour(endH.current.value, endM.current.value, endP.current.value)
        : parseTimeStringTo24Hour(settings.end, 17, 0, "PM");

    const lunch =
      lunchH.current?.value && lunchM.current?.value && lunchP.current?.value
        ? to24Hour(lunchH.current.value, lunchM.current.value, lunchP.current.value)
        : parseTimeStringTo24Hour(settings.lunchStart, 13, 0, "PM");

    const br =
      breakH.current?.value && breakM.current?.value && breakP.current?.value
        ? to24Hour(breakH.current.value, breakM.current.value, breakP.current.value)
        : parseTimeStringTo24Hour(settings.breakStart, 11, 0, "AM");

    const maxDailyVal = parseInt(maxDailyRef.current?.value || settings.maxDaily || "4");
    const maxConsecVal = parseInt(maxConsecRef.current?.value || settings.maxConsec || "2");
    const maxDivDailyVal = parseInt(
      maxDivisionDailyLabsRef.current?.value || settings.maxDivisionDailyLabs || "1"
    );

    localStorage.setItem("maxDailyHours", maxDailyVal);
    localStorage.setItem("maxConsecHours", maxConsecVal);
    localStorage.setItem("maxDivisionDailyLabs", maxDivDailyVal);

    const coreSettings = {
      start_hour: start.hour,
      start_min: start.min,
      end_hour: end.hour,
      end_min: end.min,
      lunch_hour: lunch.hour,
      lunch_min: lunch.min,
      lunch_duration: parseFloat(lunchDurRef.current?.value || settings.lunchDur || 1),
      break_hour: br.hour,
      break_min: br.min,
      break_duration: parseFloat(breakDurRef.current?.value || settings.breakDur || 0.5),
      period_duration: parseFloat(theoryRef.current?.value || settings.theory || 1),
      lab_duration: parseFloat(labRef.current?.value || settings.lab || 2),
    };

    // Attempt saving with extended columns (created in migrations)
    const extendedSettings = {
      ...coreSettings,
      max_division_daily_labs: maxDivDailyVal,
      max_daily_hours: maxDailyVal,
      max_consecutive_hours: maxConsecVal,
    };

    let { error } = await supabase
      .from("testconstraints")
      .update(extendedSettings)
      .eq("id", 1);

    // If extended columns are not yet in user's schema cache, cleanly fall back to core columns
    if (error && (error.message.includes("schema cache") || error.message.includes("column"))) {
      const fallback = await supabase
        .from("testconstraints")
        .update(coreSettings)
        .eq("id", 1);
      error = fallback.error;
    }

    if (error) {
      toast.error("Error saving to database: " + error.message);
    } else {
      toast.success("Constraints updated successfully! (Max 1 lab/day enforced)");
      await fetchConstraints();
    }
  };

  // ── ACADEMIC STRUCTURE ACTIONS ────────────────────────────────────────────

  // Add Department
  const handleAddDepartment = () => {
    if (!newDeptCode.trim() || !newDeptName.trim()) {
      return toast.error("Please enter department code and name.");
    }
    const code = newDeptCode.trim().toUpperCase();
    if (structure.departments.some((d) => d.code === code)) {
      return toast.error(`Department "${code}" already exists.`);
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
    setStructure(updated);
    saveAcademicStructure(updated);
    setSelectedDeptCode(code);
    setNewDeptCode("");
    setNewDeptName("");
    setShowAddDept(false);
    toast.success(`Department "${code}" added!`);
  };

  // Add Division
  const handleAddDivision = () => {
    if (!newDivName.trim()) {
      return toast.error("Please enter a division name (e.g. CSE-C)");
    }
    const name = newDivName.trim();
    const existing = structure.divisions.filter(
      (d) =>
        d.department_code === selectedDeptCode &&
        parseInt(d.semester) === parseInt(selectedSem)
    );

    if (existing.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      return toast.error(
        `Division "${name}" already exists in ${selectedDeptCode} Sem ${selectedSem}`
      );
    }

    const divId = `div-${selectedDeptCode.toLowerCase()}-${selectedSem}-${name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")}`;
    const newDiv = {
      id: divId,
      department_code: selectedDeptCode,
      semester: parseInt(selectedSem),
      name,
      is_active: true,
    };

    // Also auto-create default batch B1 for convenience
    const defaultBatch = {
      id: `batch-${divId}-b1`,
      division_id: divId,
      name: "B1",
      is_active: true,
    };

    const updated = {
      ...structure,
      divisions: [...structure.divisions, newDiv],
      batches: [...structure.batches, defaultBatch],
    };

    setStructure(updated);
    saveAcademicStructure(updated);
    setSelectedDivId(divId);
    setNewDivName("");
    toast.success(`Division "${name}" created with Batch B1!`);
  };

  // Toggle Division Active/Archive
  const handleToggleDivision = (divId) => {
    const updatedDivs = structure.divisions.map((d) =>
      d.id === divId ? { ...d, is_active: !d.is_active } : d
    );
    const updated = { ...structure, divisions: updatedDivs };
    setStructure(updated);
    saveAcademicStructure(updated);
    toast.success("Division status updated");
  };

  // Add Batch
  const handleAddBatch = () => {
    if (!selectedDivId) {
      return toast.error("Please select a division first.");
    }
    if (!newBatchName.trim()) {
      return toast.error("Please enter a batch name (e.g. B3)");
    }
    const name = newBatchName.trim().toUpperCase();
    const existingBatches = structure.batches.filter(
      (b) => b.division_id === selectedDivId
    );

    if (existingBatches.some((b) => b.name === name)) {
      return toast.error(`Batch "${name}" already exists in this division`);
    }

    const newBatch = {
      id: `batch-${selectedDivId}-${name.toLowerCase()}`,
      division_id: selectedDivId,
      name,
      is_active: true,
    };

    const updated = {
      ...structure,
      batches: [...structure.batches, newBatch],
    };
    setStructure(updated);
    saveAcademicStructure(updated);
    setNewBatchName("");
    toast.success(`Batch "${name}" added to division!`);
  };

  // Toggle Batch Active/Archive
  const handleToggleBatch = (batchId) => {
    const updatedBatches = structure.batches.map((b) =>
      b.id === batchId ? { ...b, is_active: !b.is_active } : b
    );
    const updated = { ...structure, batches: updatedBatches };
    setStructure(updated);
    saveAcademicStructure(updated);
    toast.success("Batch status updated");
  };

  // Filtered views
  const currentDivisions = structure.divisions.filter(
    (d) =>
      d.department_code === selectedDeptCode &&
      parseInt(d.semester) === parseInt(selectedSem)
  );

  const activeDiv = structure.divisions.find((d) => d.id === selectedDivId);
  const currentBatches = selectedDivId
    ? structure.batches.filter((b) => b.division_id === selectedDivId)
    : [];

  const TimePicker = ({ hRef, mRef, pRef, defaultH, defaultP }) => (
    <div style={{ display: "flex", gap: "5px" }}>
      <select ref={hRef} className="custom-select" defaultValue={defaultH}>
        {hours.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <select ref={mRef} className="custom-select">
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select ref={pRef} className="custom-select" defaultValue={defaultP}>
        {periods.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="card" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="card-header" style={{ marginBottom: 15 }}>
        <h2>⚙️ Configuration & Academic Rules</h2>
        <p style={{ color: "#64748b", margin: "4px 0 0 0", fontSize: "0.9rem" }}>
          Configure college timings, workload guardrails, and hierarchical academic structure (Departments, Semesters, Divisions, and Lab Batches).
        </p>
      </div>

      {/* Top Tab Switcher */}
      <div
        style={{
          display: "flex",
          gap: 10,
          borderBottom: "2px solid #e2e8f0",
          paddingBottom: 10,
          marginBottom: 20,
        }}
      >
        <button
          onClick={() => setActiveTab("academic")}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "0.95rem",
            background: activeTab === "academic" ? "var(--primary-color, #4338ca)" : "#f1f5f9",
            color: activeTab === "academic" ? "#fff" : "#475569",
            transition: "all 0.2s ease",
          }}
        >
          🏛️ Academic Structure (Depts, Sems, Divisions & Batches)
        </button>

        <button
          onClick={() => setActiveTab("labs")}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "0.95rem",
            background: activeTab === "labs" ? "var(--primary-color, #4338ca)" : "#f1f5f9",
            color: activeTab === "labs" ? "#fff" : "#475569",
            transition: "all 0.2s ease",
          }}
        >
          🧪 Laboratory Allocation & Daily Limits
        </button>

        <button
          onClick={() => setActiveTab("timing")}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "0.95rem",
            background: activeTab === "timing" ? "var(--primary-color, #4338ca)" : "#f1f5f9",
            color: activeTab === "timing" ? "#fff" : "#475569",
            transition: "all 0.2s ease",
          }}
        >
          🕒 College Timing & Guardrails
        </button>
      </div>

      {/* ── TAB 1: ACADEMIC STRUCTURE ────────────────────────────────────────── */}
      {activeTab === "academic" && (
        <div>
          {/* Overview Banner */}
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              padding: "14px 18px",
              marginBottom: 20,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <b style={{ color: "#1e40af" }}>Hierarchy:</b>{" "}
              <span style={{ color: "#3b82f6" }}>
                Department → Semester → Divisions → Lab Batches (B1, B2, B3)
              </span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: "0.85rem" }}>
              <span style={{ background: "#dbeafe", padding: "4px 8px", borderRadius: 6, fontWeight: 600 }}>
                {structure.departments.length} Departments
              </span>
              <span style={{ background: "#dbeafe", padding: "4px 8px", borderRadius: 6, fontWeight: 600 }}>
                {structure.divisions.length} Divisions
              </span>
              <span style={{ background: "#dbeafe", padding: "4px 8px", borderRadius: 6, fontWeight: 600 }}>
                {structure.batches.length} Lab Batches
              </span>
            </div>
          </div>

          {/* Department & Semester Selection Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            {/* Department Selector */}
            <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontWeight: 700, color: "#334155" }}>1. Department</label>
                <button
                  onClick={() => setShowAddDept(!showAddDept)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--primary-color, #4338ca)",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "0.82rem",
                  }}
                >
                  {showAddDept ? "Cancel" : "+ Add Department"}
                </button>
              </div>

              {showAddDept ? (
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    type="text"
                    placeholder="Code (e.g. AI)"
                    value={newDeptCode}
                    onChange={(e) => setNewDeptCode(e.target.value)}
                    style={{ width: "30%", padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                  />
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                  />
                  <Button variant="contained" size="small" onClick={handleAddDepartment}>
                    Save
                  </Button>
                </div>
              ) : null}

              <select
                value={selectedDeptCode}
                onChange={(e) => {
                  setSelectedDeptCode(e.target.value);
                  // update default selected division for this dept
                  const divs = structure.divisions.filter(
                    (d) => d.department_code === e.target.value && parseInt(d.semester) === parseInt(selectedSem)
                  );
                  setSelectedDivId(divs[0]?.id || "");
                }}
                className="custom-select"
                style={{ width: "100%", padding: "8px 12px" }}
              >
                {structure.departments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester Selector */}
            <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <label style={{ fontWeight: 700, color: "#334155", display: "block", marginBottom: 8 }}>
                2. Semester
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <button
                    key={sem}
                    onClick={() => {
                      setSelectedSem(sem);
                      const divs = structure.divisions.filter(
                        (d) => d.department_code === selectedDeptCode && parseInt(d.semester) === sem
                      );
                      setSelectedDivId(divs[0]?.id || "");
                    }}
                    style={{
                      flex: 1,
                      minWidth: 40,
                      padding: "8px 4px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      cursor: "pointer",
                      fontWeight: 700,
                      background: parseInt(selectedSem) === sem ? "var(--primary-color, #4338ca)" : "#fff",
                      color: parseInt(selectedSem) === sem ? "#fff" : "#334155",
                    }}
                  >
                    Sem {sem}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Divisions & Lab Batches Management Columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
            {/* ── DIVISIONS CARD ── */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 16,
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h4 style={{ margin: 0, color: "#1e293b" }}>
                    3. Divisions for {selectedDeptCode} Sem {selectedSem}
                  </h4>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    {currentDivisions.length} configured division(s)
                  </span>
                </div>
              </div>

              {/* Add Division Input */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder={`e.g. ${selectedDeptCode}-A`}
                  value={newDivName}
                  onChange={(e) => setNewDivName(e.target.value)}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
                <Button variant="contained" onClick={handleAddDivision}>
                  + Add Division
                </Button>
              </div>

              {/* List of Divisions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {currentDivisions.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontStyle: "italic", margin: "10px 0" }}>
                    No divisions yet for {selectedDeptCode} Semester {selectedSem}. Add one above.
                  </p>
                ) : (
                  currentDivisions.map((div) => {
                    const isSelected = div.id === selectedDivId;
                    const batchCount = structure.batches.filter(
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
                          padding: "10px 14px",
                          borderRadius: 8,
                          cursor: "pointer",
                          border: isSelected ? "2px solid #4338ca" : "1px solid #e2e8f0",
                          background: isSelected ? "#f5f3ff" : div.is_active ? "#fff" : "#f8fafc",
                          opacity: div.is_active ? 1 : 0.6,
                        }}
                      >
                        <div>
                          <b style={{ color: isSelected ? "#4338ca" : "#1e293b" }}>{div.name}</b>
                          <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "#64748b" }}>
                            ({batchCount} Lab Batches)
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleDivision(div.id);
                            }}
                            style={{
                              background: div.is_active ? "#fee2e2" : "#dcfce7",
                              color: div.is_active ? "#991b1b" : "#166534",
                              border: "none",
                              borderRadius: 4,
                              padding: "4px 8px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            {div.is_active ? "Archive" : "Activate"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── LAB BATCHES CARD ── */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 16,
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <h4 style={{ margin: 0, color: "#1e293b" }}>
                  4. Lab Batches for {activeDiv ? activeDiv.name : "Selected Division"}
                </h4>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Each lab session is scheduled specifically for these batches.
                </span>
              </div>

              {/* Add Batch Input */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder="e.g. B1, B2, B3"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
                <Button variant="contained" onClick={handleAddBatch}>
                  + Add Batch
                </Button>
              </div>

              {/* List of Batches */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {currentBatches.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontStyle: "italic", margin: "10px 0" }}>
                    No batches configured for this division yet. Add B1, B2 above.
                  </p>
                ) : (
                  currentBatches.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                        background: b.is_active ? "#f8fafc" : "#f1f5f9",
                        opacity: b.is_active ? 1 : 0.6,
                      }}
                    >
                      <div>
                        <span
                          style={{
                            background: "#e0e7ff",
                            color: "#4338ca",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: 4,
                            marginRight: 8,
                            fontSize: "0.85rem",
                          }}
                        >
                          {b.name}
                        </span>
                        <span style={{ fontSize: "0.82rem", color: "#475569" }}>
                          Lab Batch {b.name}
                        </span>
                      </div>
                      <button
                        onClick={() => handleToggleBatch(b.id)}
                        style={{
                          background: b.is_active ? "#fee2e2" : "#dcfce7",
                          color: b.is_active ? "#991b1b" : "#166534",
                          border: "none",
                          borderRadius: 4,
                          padding: "3px 6px",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {b.is_active ? "Archive" : "Activate"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: LABORATORY ALLOCATION & DAILY LIMITS ───────────────────────── */}
      {activeTab === "labs" && (
        <div>
          {/* Rule 1 Banner */}
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 8,
              padding: "16px 20px",
              marginBottom: 20,
            }}
          >
            <h4 style={{ margin: "0 0 8px 0", color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
              <span>🛡️</span> Mandatory Rule: Maximum 1 Lab Session Per Day Per Division (Across All Batches Combined)
            </h4>
            <p style={{ margin: "0 0 8px 0", fontSize: "0.92rem", color: "#15803d", lineHeight: 1.5 }}>
              For each specific division and semester, allow <strong>at most one laboratory session per day across all its lab batches combined</strong>.
              If B1 has a lab on Monday, B2 and B3 must <em>not</em> have another lab session on Monday for that same division and semester.
            </p>
            <div style={{ background: "#dcfce7", padding: "8px 12px", borderRadius: 6, fontSize: "0.85rem", color: "#14532d" }}>
              💡 <strong>Example:</strong> CSE, Semester 7, Division B has batches B1, B2, B3.
              The scheduler allocates: <strong>Monday: B1 lab</strong> | <strong>Tuesday: B2 lab</strong> | <strong>Wednesday: B3 lab</strong> across distinct days.
            </div>
          </div>

          {/* Academic Scope Selector */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "16px 20px",
              marginBottom: 20,
            }}
          >
            <h4 style={{ margin: "0 0 14px 0", color: "#334155" }}>
              1. Select Academic Scope for Laboratory Configuration
            </h4>
            <div className="grid-3" style={{ gap: 15 }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b" }}>Department</label>
                <select
                  value={selectedDeptCode}
                  onChange={(e) => setSelectedDeptCode(e.target.value)}
                  className="custom-select"
                  style={{ width: "100%", marginTop: 4 }}
                >
                  {structure.departments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b" }}>Semester</label>
                <select
                  value={selectedSem}
                  onChange={(e) => setSelectedSem(parseInt(e.target.value))}
                  className="custom-select"
                  style={{ width: "100%", marginTop: 4 }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Semester {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b" }}>Division</label>
                <select
                  value={selectedDivId}
                  onChange={(e) => setSelectedDivId(e.target.value)}
                  className="custom-select"
                  style={{ width: "100%", marginTop: 4 }}
                >
                  {currentDivisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Laboratory Constraints Form */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "20px",
              marginBottom: 20,
            }}
          >
            <h4 style={{ margin: "0 0 14px 0", color: "#334155" }}>
              2. Division & Semester Laboratory Allocation Guardrails
            </h4>

            <div className="grid-2" style={{ gap: 20 }}>
              <div className="form-group">
                <label style={{ fontWeight: 600, color: "#1e293b" }}>
                  Max Lab Sessions Per Day (Across ALL Batches Combined)
                </label>
                <p style={{ margin: "2px 0 6px 0", fontSize: "0.8rem", color: "#64748b" }}>
                  Enforced strictly by generator and independent validator.
                </p>
                <select
                  value={settings.maxDivisionDailyLabs || "1"}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, maxDivisionDailyLabs: e.target.value }))
                  }
                  className="custom-select"
                  style={{ width: "100%" }}
                >
                  <option value="1">1 lab session / day (Default — Recommended)</option>
                  <option value="2">2 lab sessions / day</option>
                  <option value="3">3 lab sessions / day</option>
                </select>
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 600, color: "#1e293b" }}>
                  Strict Laboratory Duration
                </label>
                <p style={{ margin: "2px 0 6px 0", fontSize: "0.8rem", color: "#64748b" }}>
                  Rule 3: Must occupy exactly two consecutive hours without break interruption.
                </p>
                <input
                  type="text"
                  readOnly
                  value="2 Hours (Consecutive Block, No Split, No Break)"
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontWeight: 600,
                    color: "#334155",
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ fontWeight: 600, color: "#1e293b" }}>
                Participating Batches for Division {activeDiv?.name || "Selected Division"}:
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                {currentBatches.map((b) => (
                  <span
                    key={b.id}
                    style={{
                      background: "#e0e7ff",
                      color: "#3730a3",
                      padding: "6px 14px",
                      borderRadius: 20,
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      border: "1px solid #c7d2fe",
                    }}
                  >
                    Batch {b.name}
                  </span>
                ))}
                {currentBatches.length === 0 && (
                  <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                    No batches configured yet. Go to Academic Structure tab to add batches.
                  </span>
                )}
              </div>
            </div>

            <Button
              variant="contained"
              onClick={handleSaveConstraints}
              style={{ marginTop: 25, padding: "10px 24px", fontWeight: 700 }}
            >
              💾 Save & Apply Laboratory Allocation Rules
            </Button>
          </div>
        </div>
      )}

      {/* ── TAB 3: COLLEGE TIMING & OPERATING RULES ─────────────────────────── */}
      {activeTab === "timing" && (
        <div>
          <div
            className="list"
            style={{
              marginTop: "10px",
              background: "#f8fafc",
              padding: "16px 20px",
              borderRadius: "10px",
              borderLeft: "5px solid var(--primary-color, #4338ca)",
              marginBottom: 20,
            }}
          >
            <h4 style={{ color: "var(--primary-color, #4338ca)", marginBottom: "10px" }}>
              Active Operating Rules :
            </h4>
            <div className="active-rules-grid">
              <p>
                🕒 College: <strong>{settings.start} - {settings.end}</strong>
              </p>
              <p>
                📖 Theory: <strong>{settings.theory} hr</strong>
              </p>
              <p>
                🧪 Lab: <strong>{settings.lab} hr (Strictly Consecutive)</strong>
              </p>
              <p>
                🍱 Lunch: <strong>{settings.lunchDur} hr @ {settings.lunchStart}</strong>
              </p>
              <p>
                ☕ Break: <strong>{settings.breakDur} hr @ {settings.breakStart}</strong>
              </p>
              <p>
                👨‍🏫 Max Daily Load: <strong>{settings.maxDaily || 4} hrs/day</strong>
              </p>
              <p>
                ⏳ Max Consecutive: <strong>{settings.maxConsec || 2} hrs back-to-back</strong>
              </p>
            </div>
          </div>

          <div className="form-section">
            <h3 style={{ marginBottom: "15px", color: "var(--primary-color, #4338ca)" }}>
              1. College Operating Hours
            </h3>
            <div className="grid-2">
              <div className="form-group">
                <label>Start Time</label>
                <TimePicker
                  hRef={startH}
                  mRef={startM}
                  pRef={startP}
                  defaultH="9"
                  defaultP="AM"
                />
              </div>
              <div className="form-group">
                <label>End Time</label>
                <TimePicker
                  hRef={endH}
                  mRef={endM}
                  pRef={endP}
                  defaultH="5"
                  defaultP="PM"
                />
              </div>
            </div>

            <hr style={{ margin: "25px 0", border: "0", borderTop: "1px solid #eee" }} />

            <h3 style={{ marginBottom: "15px", color: "var(--primary-color, #4338ca)" }}>
              2. Session Durations (Hours)
            </h3>
            <div className="grid-3">
              <div className="form-group">
                <label>Theory Duration</label>
                <select ref={theoryRef} className="custom-select" defaultValue="1">
                  {durations.map((d) => (
                    <option key={d} value={d}>
                      {d} hr
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Lab Duration (Strictly 2 hrs)</label>
                <select ref={labRef} className="custom-select" defaultValue="2">
                  <option value="2">2 hrs (Standard Consecutive Block)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Max Labs / Day / Division</label>
                <select
                  ref={maxDivisionDailyLabsRef}
                  value={settings.maxDivisionDailyLabs || "1"}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, maxDivisionDailyLabs: e.target.value }))
                  }
                  className="custom-select"
                >
                  <option value="1">1 lab session / day max</option>
                  <option value="2">2 lab sessions / day max</option>
                  <option value="3">3 lab sessions / day max</option>
                </select>
              </div>
            </div>

            <hr style={{ margin: "25px 0", border: "0", borderTop: "1px solid #eee" }} />

            <h3 style={{ marginBottom: "15px", color: "var(--primary-color, #4338ca)" }}>
              3. Breaks & Intervals
            </h3>
            <div className="grid-2" style={{ marginBottom: "20px" }}>
              <div className="form-group">
                <label>Lunch Start Time</label>
                <TimePicker
                  hRef={lunchH}
                  mRef={lunchM}
                  pRef={lunchP}
                  defaultH="1"
                  defaultP="PM"
                />
              </div>
              <div className="form-group">
                <label>Lunch Duration</label>
                <select ref={lunchDurRef} className="custom-select" defaultValue="1">
                  {durations.map((d) => (
                    <option key={d} value={d}>
                      {d} hr
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Short Break Start Time</label>
                <TimePicker
                  hRef={breakH}
                  mRef={breakM}
                  pRef={breakP}
                  defaultH="11"
                  defaultP="AM"
                />
              </div>
              <div className="form-group">
                <label>Short Break Duration</label>
                <select ref={breakDurRef} className="custom-select" defaultValue="0.5">
                  {durations.map((d) => (
                    <option key={d} value={d}>
                      {d} hr
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <hr style={{ margin: "25px 0", border: "0", borderTop: "1px solid #eee" }} />

            <h3 style={{ marginBottom: "15px", color: "var(--primary-color, #4338ca)" }}>
              4. Faculty Workload & Rest Guardrails
            </h3>
            <div className="grid-2">
              <div className="form-group">
                <label>Max Daily Hours Per Teacher</label>
                <select ref={maxDailyRef} className="custom-select" defaultValue={settings.maxDaily || "4"}>
                  {[2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      {d} hours / day max
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Max Consecutive Hours Per Teacher</label>
                <select ref={maxConsecRef} className="custom-select" defaultValue={settings.maxConsec || "2"}>
                  {[1, 2, 3, 4].map((d) => (
                    <option key={d} value={d}>
                      {d} hours back-to-back max
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              variant="contained"
              onClick={handleSaveConstraints}
              style={{ marginTop: "30px", width: "100%", padding: "12px 0", fontSize: "1rem" }}
            >
              Apply Timing & Workload Constraints
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConstraintManager;
