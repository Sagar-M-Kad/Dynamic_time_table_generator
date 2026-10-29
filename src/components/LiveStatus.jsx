import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DEPT_OPTIONS = ["All", "CSE", "ISE", "ECE", "ME", "CV"];

const parseTime = (timeStr) => {
  try {
    const [time, modifier] = timeStr.trim().split(" ");
    let [hours, minutes] = time.split(":");
    hours = parseInt(hours);
    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    return hours * 60 + parseInt(minutes);
  } catch {
    return -1;
  }
};

const isCurrentSlot = (slotLabel) => {
  try {
    const parts = slotLabel.split("-");
    if (parts.length < 2) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = parseTime(parts[0]);
    const endMinutes = parseTime(parts.slice(1).join("-"));
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false;
  }
};

const getActiveSlot = (timetable, today) => {
  const todayData = timetable?.[today];
  if (!todayData) return null;
  for (const slot in todayData) {
    if (isCurrentSlot(slot)) {
      return { slot, subject: todayData[slot] };
    }
  }
  return null;
};

const LiveStatus = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [liveData, setLiveData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedSem, setSelectedSem] = useState("All");

  // Tick clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchLiveStatus = useCallback(async () => {
    setLoading(true);
    try {
      const today = DAYS[new Date().getDay()];

      // Fetch all saved timetables
      const { data: timetables } = await supabase
        .from("saved_timetables")
        .select("id, department, semester, division, timetable_json, theory_room, lab_rooms")
        .order("created_at", { ascending: false });

      // Fetch teacher links for subject → teacher name lookup
      const { data: teacherLinks } = await supabase
        .from("teacher_subjects")
        .select("*, subjects(*), teachers(*)");

      const teacherMap = {};
      (teacherLinks || []).forEach((link) => {
        const subName = link.subjects?.subject_name;
        if (subName && link.teachers?.name) {
          if (!teacherMap[subName]) teacherMap[subName] = [];
          teacherMap[subName].push(link.teachers.name);
        }
      });

      const result = [];

      for (const table of timetables || []) {
        const tt = table.timetable_json || {};
        const activeSlotInfo = getActiveSlot(tt, today);
        const subject = activeSlotInfo?.subject;
        const slot = activeSlotInfo?.slot;

        // Parse dept from "CSE (Section A)" format or plain "CSE"
        const deptRaw = table.department || "";
        const deptMatch = deptRaw.match(/^([A-Z]+)/);
        const dept = deptMatch ? deptMatch[1] : deptRaw;

        let teacherNames = [];
        if (subject && subject !== "-") {
          // Handle combined lab label like "WEB LAB/CN LAB"
          const parts = subject.includes("/") ? subject.split("/") : [subject];
          parts.forEach((p) => {
            const names = teacherMap[p.trim()];
            if (names) teacherNames.push(...names);
          });
        }

        result.push({
          id: table.id,
          dept,
          division: table.division || "",
          semester: table.semester,
          theoryRoom: table.theory_room || "-",
          labRooms: table.lab_rooms || {},
          subject: subject && subject !== "-" ? subject : null,
          teacher: teacherNames.length > 0 ? teacherNames.join(", ") : null,
          slot: slot || null,
          isOccupied: !!(subject && subject !== "-"),
          today,
        });
      }

      setLiveData(result);
    } catch (err) {
      console.error("[LiveStatus]", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveStatus();
    const refresh = setInterval(fetchLiveStatus, 60000);
    return () => clearInterval(refresh);
  }, [fetchLiveStatus]);

  // Filter logic
  const filtered = liveData.filter((r) => {
    const deptMatch = selectedDept === "All" || r.dept === selectedDept;
    const semMatch =
      selectedSem === "All" || String(r.semester) === String(selectedSem);
    return deptMatch && semMatch;
  });

  const groupedByDept = filtered.reduce((acc, item) => {
    if (!acc[item.dept]) acc[item.dept] = [];
    acc[item.dept].push(item);
    return acc;
  }, {});

  const occupiedCount = filtered.filter((r) => r.isOccupied).length;

  return (
    <div className="card">
      {/* Header */}
      <div
        className="card-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2>📡 Live Status</h2>
          <p style={{ color: "#64748b", marginTop: 4 }}>
            Real-time ongoing classes — filtered by division & department.
          </p>
        </div>

        {/* Live Clock */}
        <div
          style={{
            background: "var(--sidebar-bg)",
            color: "white",
            padding: "10px 20px",
            borderRadius: 10,
            textAlign: "right",
            minWidth: 160,
          }}
        >
          <div style={{ fontSize: "1.3rem", fontWeight: "bold", letterSpacing: 1 }}>
            {currentTime.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            })}
          </div>
          <div style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: 2 }}>
            {DAYS[currentTime.getDay()]},{" "}
            {currentTime.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 20,
          marginBottom: 8,
          alignItems: "center",
        }}
      >
        <div>
          <label style={labelStyle}>Department</label>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            style={selectStyle}
          >
            {DEPT_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Semester</label>
          <select
            value={selectedSem}
            onChange={(e) => setSelectedSem(e.target.value)}
            style={selectStyle}
          >
            <option value="All">All</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                Sem {s}
              </option>
            ))}
          </select>
        </div>

        <button onClick={fetchLiveStatus} style={refreshBtnStyle} title="Refresh">
          🔄 Refresh
        </button>

        {/* Stats pill */}
        <div style={statsPillStyle}>
          <span style={{ color: "#16a34a", fontWeight: 700 }}>{occupiedCount}</span>
          &nbsp;active /{" "}
          <span style={{ color: "#64748b" }}>{filtered.length}</span>
          &nbsp;total
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
          Loading live status…
        </div>
      )}

      {/* No data */}
      {!loading && filtered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: "#94a3b8",
            fontSize: "0.95rem",
          }}
        >
          No saved timetables found for the selected filters.
          <br />
          <small>Generate and save timetables from the Generate AI page.</small>
        </div>
      )}

      {/* Department groups */}
      {!loading &&
        Object.entries(groupedByDept).map(([dept, items]) => (
          <div key={dept} style={{ marginTop: 32 }}>
            <h3
              style={{
                borderLeft: "4px solid var(--primary-color)",
                paddingLeft: 14,
                marginBottom: 18,
                color: "var(--text-dark)",
                fontSize: "1rem",
              }}
            >
              {dept} Department
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: `1.5px solid ${item.isOccupied ? "#6366f1" : "#e2e8f0"}`,
                    borderRadius: 12,
                    padding: 18,
                    background: item.isOccupied ? "#faf5ff" : "#f8fafc",
                    position: "relative",
                    transition: "box-shadow 0.2s",
                  }}
                >
                  {/* Live indicator dot */}
                  {item.isOccupied && (
                    <span
                      style={{
                        position: "absolute",
                        top: 14,
                        right: 14,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#22c55e",
                        display: "inline-block",
                        boxShadow: "0 0 0 3px #dcfce7",
                        animation: "pulse 1.5s infinite",
                      }}
                    />
                  )}

                  {/* Title row */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>
                      {item.dept}{" "}
                      {item.division ? `— ${item.division}` : ""}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 2 }}>
                      Semester {item.semester}
                      {item.theoryRoom && item.theoryRoom !== "-"
                        ? ` · Room: ${item.theoryRoom}`
                        : ""}
                    </div>
                  </div>

                  <div
                    style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10 }}
                  >
                    {item.isOccupied ? (
                      <>
                        <div style={{ marginBottom: 6 }}>
                          <small style={{ color: "#94a3b8", fontSize: "0.72rem" }}>
                            CURRENT CLASS
                          </small>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: "0.92rem",
                              color: "#4338ca",
                              marginTop: 2,
                            }}
                          >
                            {item.subject}
                          </div>
                        </div>
                        {item.slot && (
                          <div style={{ marginBottom: 6 }}>
                            <small style={{ color: "#94a3b8", fontSize: "0.72rem" }}>
                              TIME SLOT
                            </small>
                            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151" }}>
                              {item.slot}
                            </div>
                          </div>
                        )}
                        <div>
                          <small style={{ color: "#94a3b8", fontSize: "0.72rem" }}>
                            FACULTY
                          </small>
                          <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#374151" }}>
                            {item.teacher || "—"}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: "0.85rem",
                          padding: "10px 0",
                          textAlign: "center",
                        }}
                      >
                        No active session right now
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 #86efac; }
          70% { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
      `}</style>
    </div>
  );
};

const labelStyle = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#64748b",
  marginBottom: 4,
};

const selectStyle = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: "0.9rem",
  background: "#f8fafc",
  cursor: "pointer",
};

const refreshBtnStyle = {
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  fontSize: "0.85rem",
  alignSelf: "flex-end",
};

const statsPillStyle = {
  padding: "6px 14px",
  background: "#f1f5f9",
  borderRadius: 20,
  fontSize: "0.83rem",
  color: "#475569",
  alignSelf: "flex-end",
};

export default LiveStatus;
