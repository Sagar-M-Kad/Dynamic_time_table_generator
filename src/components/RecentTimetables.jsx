import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { toast } from "react-hot-toast";
import Button from "@mui/material/Button";
import { createSlotsWithBreaks } from "../services/aiService";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const PALETTE = [
  "#dbeafe",
  "#dcfce7",
  "#fef9c3",
  "#fce7f3",
  "#ede9fe",
  "#ffedd5",
  "#e0f2fe",
  "#d1fae5",
  "#fef3c7",
  "#f3e8ff",
];
const makeColorMap = (timetable) => {
  const map = {};
  let idx = 0;
  Object.values(timetable).forEach((daySlots) => {
    Object.values(daySlots).forEach((subject) => {
      if (subject && subject !== "-" && !map[subject])
        map[subject] = PALETTE[idx++ % PALETTE.length];
    });
  });
  return map;
};

// Parse slot start time → minutes from midnight (for chronological sorting)
// Handles BOTH formats:
//   12-hour: "08:00 AM-09:00 AM"  →  correct sort
//   24-hour: "08:00-09:00"        →  correct sort (old saved timetables)
const parseSlotStart = (label) => {
  if (!label) return 0;
  const start = label.split("-")[0].trim();
  const parts = start.split(" ");
  const timePart = parts[0];
  const period = parts[1]; // "AM", "PM", or undefined (24h format)
  const [hStr, mStr] = timePart.split(":");
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;

  if (period === "AM") {
    // 12h AM: 12:xx AM → 0:xx
    return (h % 12) * 60 + m;
  } else if (period === "PM") {
    // 12h PM: 12:xx PM → 12:xx, others +12
    return ((h % 12) + 12) * 60 + m;
  } else {
    // 24h format — use hour value directly
    return h * 60 + m;
  }
};

/**
 * Convert any slot label to 12-hour AM/PM for display.
 * "08:00-09:00"        → "08:00 AM-09:00 AM"   (old 24h saved timetables)
 * "08:00 AM-09:00 AM"  → "08:00 AM-09:00 AM"   (new format — unchanged)
 */
const formatSlotLabel = (label) => {
  if (!label || label === "BREAK" || label === "LUNCH") return label;
  // Already has AM/PM — return as-is
  if (label.includes("AM") || label.includes("PM")) return label;

  // Convert 24h "HH:MM-HH:MM" → "HH:MM AM/PM-HH:MM AM/PM"
  const parts = label.split("-");
  if (parts.length < 2) return label;

  const fmt = (timeStr) => {
    const [h, m] = timeStr.trim().split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const display = h % 12 || 12;
    return `${String(display).padStart(2, "0")}:${String(m).padStart(
      2,
      "0"
    )} ${period}`;
  };

  return `${fmt(parts[0])}-${fmt(parts[1])}`;
};

const RecentTimetables = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [constraints, setConstraints] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [courseDetails, setCourseDetails] = useState([]);
  const printRef = useRef();

  useEffect(() => {
    fetchHistory();
    fetchConstraints();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("saved_timetables")
      .select(
        "id, department, semester, created_at, timetable_json, theory_room, lab_rooms"
      )
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Could not load timetables");
      console.error(error);
    } else setHistory(data || []);
    setLoading(false);
  };

  const fetchConstraints = async () => {
    const { data } = await supabase
      .from("testconstraints")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) setConstraints(data);
  };

  // Build full slot list (class + break + lunch) from constraints
  const getFullSlots = () => {
    if (!constraints) return null;
    return createSlotsWithBreaks(constraints);
  };

  // ── DELETE ────────────────────────────────────────────────────────────────
  const handleDelete = async (item) => {
    if (
      !window.confirm(
        `Delete timetable for ${item.department} Sem ${
          item.semester
        } (${formatDate(item.created_at)})?`
      )
    )
      return;

    setDeleting(item.id);
    const tid = toast.loading("Deleting…");
    try {
      const tt = item.timetable_json || {};

      // ── 1. Build the set of (teacher_id, day, slot) to remove ────────────
      // Fetch teacher_subjects to map subject_name → teacher_id
      const { data: teacherLinks } = await supabase
        .from("teacher_subjects")
        .select("teacher_id, subjects(subject_name)");

      const subjectTeacherMap = {};
      (teacherLinks || []).forEach((link) => {
        const name = link.subjects?.subject_name;
        if (name) subjectTeacherMap[name] = link.teacher_id;
      });

      // Also handle combined lab label (e.g. "WEB LAB/CN LAB")
      // Any value containing "/" could be a combined lab label — map it too
      Object.keys(subjectTeacherMap).forEach((name) => {
        // Already individual names mapped above
      });

      // Collect every (teacher_id, day_of_week, time_slot) used in this timetable
      const slotsToFree = [];
      for (const day in tt) {
        for (const slot in tt[day]) {
          const subject = tt[day][slot];
          if (!subject || subject === "-") continue;

          // Handle combined lab label — try matching each part
          const parts = subject.includes("/") ? subject.split("/") : [subject];
          parts.forEach((part) => {
            const teacherId = subjectTeacherMap[part.trim()];
            if (teacherId) {
              slotsToFree.push({
                teacher_id: teacherId,
                day_of_week: day,
                time_slot: slot,
              });
            }
          });
        }
      }

      // ── 2. Delete teacher_availability rows for this timetable's slots ────
      // We delete only slots that match BOTH teacher_id AND semester_id
      // so other semesters' busy slots for the same teacher are untouched
      const semesterId = item.semester;
      for (const row of slotsToFree) {
        await supabase
          .from("teacher_availability")
          .delete()
          .eq("teacher_id", row.teacher_id)
          .eq("day_of_week", row.day_of_week)
          .eq("time_slot", row.time_slot)
          .eq("semester_id", semesterId);
      }

      // ── 3. Delete room bookings ───────────────────────────────────────────
      await supabase.from("room_bookings").delete().eq("timetable_id", item.id);
      // ── Delete room availability ─────────────────

      const { data: roomData } = await supabase
        .from("rooms")
        .select("id")
        .eq("room_name", item.theory_room)
        .maybeSingle();

      if (roomData?.id) {
        await supabase
          .from("room_availability")
          .delete()
          .eq("room_id", roomData.id)
          .eq("semester_id", item.semester);
      }

      // ── Delete lab room availability ─────────────────────────────────────
      const labRoomsMap = item.lab_rooms || {};
      for (const [, labRoomName] of Object.entries(labRoomsMap)) {
        if (!labRoomName || labRoomName === "-") continue;
        const { data: labRoomData } = await supabase
          .from("rooms")
          .select("id")
          .eq("room_name", labRoomName)
          .maybeSingle();
        if (labRoomData?.id) {
          await supabase
            .from("room_availability")
            .delete()
            .eq("room_id", labRoomData.id)
            .eq("semester_id", item.semester);
        }
      }

      // ── 4. Delete the timetable itself ───────────────────────────────────
      const { error } = await supabase
        .from("saved_timetables")
        .delete()
        .eq("id", item.id);
      if (error) throw new Error(error.message);

      toast.success(`Timetable deleted successfully.`, {
        id: tid,
        duration: 4000,
      });
      fetchHistory();
    } catch (err) {
      toast.error(err.message, { id: tid });
    } finally {
      setDeleting(null);
    }
  };

  const fetchCourseDetails = async (semester, department) => {
    const cleanDept = (department || "").replace(/\s*\([^)]*\)/, "").trim();
    const { data, error } = await supabase
      .from("subjects")
      .select(
        `
        id,
        subject_name,
        subject_code,
        weekly_hours,
        teacher_subjects(
          teachers(
            name
          )
        )
      `
      )
      .eq("semester", semester)
      .eq("department", cleanDept);

    if (error) {
      console.error(error);
      return [];
    }

    return data || [];
  };

  // ── FORMAT DATE ───────────────────────────────────────────────────────────
  const formatDate = (ds) =>
    new Date(ds).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // ── DOWNLOAD as PDF ───────────────────────────────────────────────────────
  const handleDownload = async (item) => {
    const tt = item.timetable_json;

    const getTeacherName = (subject) => {
      const teachers =
        subject?.teacher_subjects
          ?.map((t) => t.teachers?.name)
          ?.filter(Boolean) || [];

      return teachers.length > 0 ? teachers.join(", ") : "-";
    };

    const cleanDept = (item.department || "").replace(/\s*\([^)]*\)/, "").trim();
    const { data: courseDetails } = await supabase
      .from("subjects")
      .select(
        `
          id,
          subject_name,
          subject_code,
          weekly_hours,
          teacher_subjects(
            teachers(
              name
            )
          )
        `
      )
      .eq("semester", item.semester)
      .eq("department", cleanDept);

    if (!tt) return toast.error("No timetable data");
    const tid = toast.loading("Generating PDF…");

    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      // Full slots including break/lunch
      const fullSlots = getFullSlots();
      // Class-only slot labels sorted chronologically
      const firstDay = DAYS.find((d) => tt[d]) || DAYS[0];
      const classSlotKeys = [...Object.keys(tt[firstDay] || {})].sort(
        (a, b) => parseSlotStart(a) - parseSlotStart(b)
      );

      // Build ordered column list: interleave break/lunch in correct positions
      const columns = buildOrderedColumns(fullSlots, classSlotKeys);

      // Detect lab labels
      const labLabels = detectLabLabels(tt);

      // Title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(
        `${item.department} — Semester ${item.semester} Timetable`,
        14,
        16
      );
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);

      // Build room info line: Theory + each lab room
      const roomParts = [`Theory : ${item.theory_room || "-"}`];
      const labRoomsMap = item.lab_rooms || {};
      Object.entries(labRoomsMap).forEach(([labName, roomName]) => {
        roomParts.push(`${labName} : ${roomName || "-"}`);
      });
      doc.text(roomParts.join("  |  "), 14, 22);

      doc.setTextColor(0);

      // Build head row
      const headRow = [
        "Day",
        ...columns.map((c) => (c.type !== "class" ? c.label : c.label)),
      ];
      const head = [headRow];

      // Build body rows — merge consecutive lab cells with colSpan
      const body = DAYS.map((day) => {
        const row = [day];
        let i = 0;
        while (i < columns.length) {
          const col = columns[i];
          if (col.type === "break") {
            row.push("BREAK");
            i++;
            continue;
          }
          if (col.type === "lunch") {
            row.push("LUNCH");
            i++;
            continue;
          }

          const rawVal = tt[day]?.[col.label] || "—";
          const isLab =
            (typeof rawVal === "object" && rawVal.is_lab) ||
            labLabels.has(rawVal);

          const formattedContent = (cell) => {
            if (!cell || cell === "-" || cell === "—") return "—";
            if (typeof cell === "string") return cell;
            if (cell.batch_labs && cell.batch_labs.length > 0) {
              return cell.batch_labs
                .map((bl) => `${bl.batch}: ${bl.subject_name} (${bl.room || "Lab"})`)
                .join("\n");
            }
            if (cell.subject_name) {
              return cell.room ? `${cell.subject_name} (${cell.room})` : cell.subject_name;
            }
            return String(cell);
          };

          if (isLab) {
            let span = 1;
            let j = i + 1;
            while (
              j < columns.length &&
              columns[j].type === "class" &&
              span < 2
            ) {
              span++;
              j++;
            }

            const contentText = formattedContent(rawVal);
            row.push(span > 1 ? { content: contentText, colSpan: span } : contentText);
            i += span;
          } else {
            row.push(formattedContent(rawVal));
            i++;
          }
        }
        return row;
      });

      const colorMap = {};
      const hexPalette = [
        [219, 234, 254],
        [220, 252, 231],
        [254, 249, 195],
        [252, 231, 243],
        [237, 233, 254],
        [255, 237, 213],
        [224, 242, 254],
        [209, 250, 229],
        [254, 243, 199],
        [243, 232, 255],
      ];
      let ci = 0;
      body.forEach((row) =>
        row.slice(1).forEach((val) => {
          if (
            val &&
            val !== "—" &&
            val !== "BREAK" &&
            val !== "LUNCH" &&
            !colorMap[val]
          )
            colorMap[val] = hexPalette[ci++ % hexPalette.length];
        })
      );

      autoTable(doc, {
        head,
        body,
        startY: 28,
        styles: {
          fontSize: 7.5,
          cellPadding: 3,
          halign: "center",
          valign: "middle",
          lineColor: [226, 232, 240],
          lineWidth: 0.3,
          overflow: "linebreak",
          minCellHeight: 12,
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [30, 41, 59],
          fontStyle: "bold",
          fontSize: 7,
        },
        columnStyles: {
          0: {
            fontStyle: "bold",
            fillColor: [248, 250, 252],
            halign: "left",
            cellWidth: 22,
          },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index > 0) {
            // Support both plain string cells and colSpan object cells
            const raw = data.cell.raw;
            const val = raw && typeof raw === "object" ? raw.content : raw;
            if (val === "BREAK" || val === "LUNCH") {
              data.cell.styles.fillColor = [253, 230, 138];
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.textColor = [120, 80, 0];
            } else if (val && val !== "—") {
              if (labLabels.has(val)) {
                data.cell.styles.fillColor = [224, 231, 255];
                data.cell.styles.fontStyle = "bold";
                data.cell.styles.textColor = [67, 56, 202];
              } else {
                data.cell.styles.fillColor = colorMap[val] || [255, 255, 255];
              }
            }
          }
          // Style break/lunch header cells
          if (data.section === "head" && data.column.index > 0) {
            const label = data.cell.raw;
            if (label === "BREAK" || label === "LUNCH") {
              data.cell.styles.fillColor = [253, 230, 138];
              data.cell.styles.textColor = [120, 80, 0];
            }
          }
        },
        theme: "grid",
        margin: { left: 10, right: 10 },
      });

      // ── COURSE DETAILS TABLE ─────────────────────────────

      const finalY = doc.lastAutoTable.finalY || 40;

      autoTable(doc, {
        startY: finalY + 3,

        tableWidth: 276.5,

        head: [
          ["Sl.No", "Course Title", "Code", "Credits", "Course Instructor"],
        ],

        body: (courseDetails || []).map((subject, index) => [
          index + 1,
          subject.subject_name,
          subject.subject_code || "-",
          subject.weekly_hours,
          getTeacherName(subject),
        ]),

        styles: {
          fontSize: 7.2,
          cellPadding: 2.2,
          textColor: [0, 0, 0],
          lineColor: [160, 160, 160],
          lineWidth: 0.2,
          valign: "middle",
          halign: "left",
          overflow: "linebreak",
          minCellHeight: 6,
        },

        headStyles: {
          fillColor: [214, 210, 228],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          fontSize: 7.5,
          halign: "left",
          minCellHeight: 7,
        },

        bodyStyles: {
          fillColor: [245, 245, 245],
        },

        columnStyles: {
          0: {
            cellWidth: 18,
          },

          1: {
            cellWidth: 118,
          },

          2: {
            cellWidth: 40,
          },

          3: {
            cellWidth: 24,
          },

          4: {
            cellWidth: 76,
          },
        },

        margin: {
          left: 10,
          right: 10,
          bottom: 5,
        },

        theme: "grid",

        pageBreak: "avoid",
      });

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: "center" }
        );
      }

      doc.save(`Timetable_${item.department}_Sem${item.semester}.pdf`);
      toast.success("PDF downloaded!", { id: tid });
    } catch (err) {
      console.error(err);
      toast.error("PDF generation failed: " + err.message, { id: tid });
    }
  };

  /**
   * Merge the full slots list (which has break/lunch markers) with the
   * sorted class slot keys from the saved timetable.
   * Returns an ordered array of { type, label } for every column.
   */
  const buildOrderedColumns = (fullSlots, classSlotKeys) => {
    if (!fullSlots) {
      // No constraints loaded yet — just show class slots
      return classSlotKeys.map((label) => ({ type: "class", label }));
    }
    // fullSlots already in correct day order; map class slots in order
    const result = [];
    let classIdx = 0;
    for (const slot of fullSlots) {
      if (slot.type === "class") {
        if (classIdx < classSlotKeys.length) {
          result.push({ type: "class", label: classSlotKeys[classIdx++] });
        }
      } else {
        result.push({ type: slot.type, label: slot.label }); // BREAK or LUNCH
      }
    }
    return result;
  };

  /** Detect which values in the timetable are lab blocks (appear consecutively) */
  const detectLabLabels = (tt) => {
    const labLabels = new Set();
    DAYS.forEach((day) => {
      const keys = Object.keys(tt[day] || {}).sort(
        (a, b) => parseSlotStart(a) - parseSlotStart(b)
      );
      for (let i = 0; i < keys.length - 1; i++) {
        const v = tt[day][keys[i]];
        if (v && v !== "-" && v === tt[day][keys[i + 1]]) labLabels.add(v);
      }
    });
    return labLabels;
  };

  const TimetableModal = ({ item, onClose }) => {
    const tt = item.timetable_json || {};
    const colorMap = makeColorMap(tt);
    const [viewMode, setViewMode] = useState("division"); // 'division' | 'batch' | 'teacher' | 'room'
    const [selectedBatch, setSelectedBatch] = useState("ALL");
    const [selectedRoom, setSelectedRoom] = useState("ALL");

    // Extract all unique batch names from timetable
    const extractedBatches = new Set();
    Object.values(tt).forEach((daySlots) => {
      Object.values(daySlots || {}).forEach((cell) => {
        if (cell && cell.batch_labs) {
          cell.batch_labs.forEach((bl) => {
            if (bl.batch) extractedBatches.add(bl.batch);
          });
        }
      });
    });
    const batchList = Array.from(extractedBatches).sort();

    // Extract rooms
    const roomList = [
      ...(item.theory_room ? [{ name: item.theory_room, type: "Theory" }] : []),
      ...Object.entries(item.lab_rooms || {}).map(([lab, r]) => ({ name: r, type: lab })),
    ].filter((r) => r.name && r.name !== "-");

    const firstDay = DAYS.find((d) => tt[d]) || DAYS[0];
    const classSlotKeys = [...Object.keys(tt[firstDay] || {})].sort(
      (a, b) => parseSlotStart(a) - parseSlotStart(b)
    );

    const fullSlots = getFullSlots();
    const columns = buildOrderedColumns(fullSlots, classSlotKeys);
    const labLabels = detectLabLabels(tt);

    // Build one row — handles lab colspan, skips break/lunch in body (they get their own td)
    const buildRow = (day) => {
      const cells = [];
      let skipCount = 0;
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];

        if (col.type === "break" || col.type === "lunch") {
          cells.push({ colType: col.type, label: col.label });
          continue;
        }

        if (skipCount > 0) {
          skipCount--;
          continue;
        }

        const rawSubject = tt[day]?.[col.label] || "-";
        const isLab =
          (typeof rawSubject === "object" && rawSubject.is_lab) ||
          labLabels.has(rawSubject);
        let span = 1;

        if (isLab) {
          span = 2;
          skipCount = 1;
        }

        // Apply View Filters
        let displaySubject = "-";
        let filteredBatchLabs = null;

        if (typeof rawSubject === "object") {
          if (rawSubject.batch_labs) {
            if (viewMode === "batch" && selectedBatch !== "ALL") {
              const matched = rawSubject.batch_labs.filter((bl) => bl.batch === selectedBatch);
              filteredBatchLabs = matched;
              displaySubject = matched.length > 0 ? `${matched[0].batch}: ${matched[0].subject_name} (${matched[0].room || "Lab"})` : "-";
            } else if (viewMode === "room" && selectedRoom !== "ALL") {
              const matched = rawSubject.batch_labs.filter((bl) => bl.room === selectedRoom);
              filteredBatchLabs = matched;
              displaySubject = matched.length > 0 ? matched.map((m) => `${m.batch}: ${m.subject_name}`).join(" | ") : "-";
            } else {
              filteredBatchLabs = rawSubject.batch_labs;
              displaySubject = rawSubject.batch_labs.map((l) => `${l.batch}: ${l.subject_name}`).join(" | ");
            }
          } else {
            displaySubject = rawSubject.subject_name || "-";
            if (viewMode === "room" && selectedRoom !== "ALL") {
              if (item.theory_room !== selectedRoom) displaySubject = "-";
            }
          }
        } else {
          displaySubject = rawSubject;
          if (viewMode === "room" && selectedRoom !== "ALL" && displaySubject !== "-") {
            if (item.theory_room !== selectedRoom) displaySubject = "-";
          }
        }

        cells.push({
          colType: "class",
          label: col.label,
          subject: displaySubject,
          batch_labs: filteredBatchLabs,
          room: rawSubject?.room,
          span,
          isLab: isLab && displaySubject !== "-",
        });
      }
      return cells;
    };

    return (
      <div style={modal.overlay} onClick={onClose}>
        <div style={modal.box} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={modal.header}>
            <div>
              <h2 style={{ margin: 0 }}>
                📅 {item.department} | Semester {item.semester} {item.division ? `(${item.division})` : ""}
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "#64748b",
                  fontSize: "0.85rem",
                }}
              >
                Theory : {item.theory_room || "-"}
                {item.lab_rooms &&
                  Object.entries(item.lab_rooms).map(([labName, roomName]) => (
                    <span
                      key={labName}
                      style={{ marginLeft: 10, color: "#7c3aed" }}
                    >
                      | {labName} : {roomName || "-"}
                    </span>
                  ))}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleDownload(item)}
              >
                ⬇ Download PDF
              </Button>
              <button onClick={onClose} style={modal.closeBtn}>
                ✕
              </button>
            </div>
          </div>

          {/* View Mode Toolbar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "14px",
              padding: "10px 14px",
              background: "#f8fafc",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { id: "division", label: "Division Master View" },
                { id: "batch", label: "Batch-Specific View" },
                { id: "room", label: "Room Utilization View" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setViewMode(m.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: viewMode === m.id ? "#4f46e5" : "#ffffff",
                    color: viewMode === m.id ? "#ffffff" : "#475569",
                    boxShadow: viewMode === m.id ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {viewMode === "batch" && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.82rem", color: "#475569", fontWeight: 600 }}>Filter Batch:</span>
                <select
                  value={selectedBatch}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                >
                  <option value="ALL">All Batches</option>
                  {batchList.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}

            {viewMode === "room" && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.82rem", color: "#475569", fontWeight: 600 }}>Filter Room:</span>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                >
                  <option value="ALL">All Rooms</option>
                  {roomList.map((r, i) => (
                    <option key={i} value={r.name}>{r.name} ({r.type})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Grid */}
          <div style={{ overflowX: "auto", marginTop: 16 }} ref={printRef}>
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                minWidth: 700,
              }}
            >
              <thead>
                <tr>
                  <th style={tStyle.th}>Day</th>
                  {columns.map((col, idx) => {
                    if (col.type === "break" || col.type === "lunch") {
                      return (
                        <th
                          key={idx}
                          style={{
                            ...tStyle.th,
                            background: "#fde68a",
                            color: "#92400e",
                            minWidth: 60,
                          }}
                        >
                          {col.label}
                        </th>
                      );
                    }
                    return (
                      <th key={idx} style={tStyle.th}>
                        {formatSlotLabel(col.label)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day}>
                    <td style={tStyle.dayCell}>{day}</td>
                    {buildRow(day).map((cell, idx) => {
                      // Break / Lunch cell
                      if (
                        cell.colType === "break" ||
                        cell.colType === "lunch"
                      ) {
                        return (
                          <td key={idx} style={tStyle.breakCell}>
                            {cell.label}
                          </td>
                        );
                      }
                      // Lab cell (colspan)
                      if (cell.isLab) {
                        return (
                          <td
                            key={idx}
                            colSpan={cell.span}
                            style={{
                              ...tStyle.labCell,
                              background: colorMap[cell.subject] || "#e0e7ff",
                            }}
                          >
                            {cell.batch_labs && cell.batch_labs.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                {cell.batch_labs.map((bl, bIdx) => (
                                  <div
                                    key={bIdx}
                                    style={{
                                      fontSize: "0.78rem",
                                      background: "rgba(255,255,255,0.7)",
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                    }}
                                  >
                                    <b style={{ color: "#4338ca" }}>{bl.batch}:</b> {bl.subject_name} ({bl.room || "Lab"})
                                  </div>
                                ))}
                              </div>
                            ) : (
                              cell.subject
                            )}
                          </td>
                        );
                      }
                      // Regular theory cell
                      return (
                        <td
                          key={idx}
                          style={{
                            ...tStyle.cell,
                            background:
                              cell.subject === "-"
                                ? "#f8fafc"
                                : colorMap[cell.subject] || "#fff",
                          }}
                        >
                          {cell.subject === "-" ? (
                            <span style={{ color: "#cbd5e1" }}>—</span>
                          ) : (
                            <div>
                              <div>{cell.subject}</div>
                              {cell.room && (
                                <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                                  📍 {cell.room}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 646.5,
                borderColor: "gray",
                marginTop: "10px",
              }}
              border={1}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      background: "rgb(237, 233, 254)",
                      fontSize: "smaller",
                    }}
                  >
                    Sl.No
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      background: "rgb(237, 233, 254)",
                      fontSize: "smaller",
                    }}
                  >
                    Course Title
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      background: "rgb(237, 233, 254)",
                      fontSize: "smaller",
                    }}
                  >
                    Code
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      background: "rgb(237, 233, 254)",
                      fontSize: "smaller",
                    }}
                  >
                    Credits
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      background: "rgb(237, 233, 254)",
                      fontSize: "smaller",
                    }}
                  >
                    Course Instructor
                  </th>
                </tr>
              </thead>

              <tbody>
                {courseDetails.map((subject, index) => (
                  <tr key={subject.id}>
                    <td style={{ padding: "5px 10px", fontSize: "smaller" }}>
                      {index + 1}
                    </td>

                    <td style={{ padding: "5px 10px", fontSize: "smaller" }}>
                      {subject.subject_name}
                    </td>

                    <td style={{ padding: "5px 10px", fontSize: "smaller" }}>
                      {subject.subject_code || "-"}
                    </td>

                    <td style={{ padding: "5px 10px", fontSize: "smaller" }}>
                      {subject.weekly_hours}
                    </td>

                    <td style={{ padding: "5px 10px", fontSize: "smaller" }}>
                      {getTeacherName(subject)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const getTeacherName = (subject) => {
    const teachers =
      subject?.teacher_subjects
        ?.map((t) => t.teachers?.name)
        ?.filter(Boolean) || [];

    return teachers.length > 0 ? teachers.join(", ") : "-";
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Recent Timetables</h2>
        <p>View, download or delete previously generated schedules.</p>
      </div>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton-box"
                style={{ marginBottom: 12, height: 60, borderRadius: 10 }}
              />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>📭</div>
            <p style={{ color: "#94a3b8", fontSize: "1rem" }}>
              No saved timetables yet. Generate one first!
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {history.map((item) => (
              <div key={item.id} style={listCard}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    flex: 1,
                  }}
                >
                  <div style={deptBadge}>
                    <span style={{ fontWeight: 800, fontSize: "1rem" }}>
                      {item.department}
                    </span>
                    <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                      Sem {item.semester}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>
                      {item.department} — Semester {item.semester}
                    </div>
                    <div
                      style={{
                        fontSize: "0.82rem",
                        color: "#64748b",
                        marginTop: 2,
                      }}
                    >
                      🕐 {formatDate(item.created_at)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    style={{
                      ...actionBtn,
                      color: "#4f46e5",
                      borderColor: "#c7d2fe",
                    }}
                    onClick={async () => {
                      const details = await fetchCourseDetails(
                        item.semester,
                        item.department
                      );

                      setCourseDetails(details);
                      setViewItem(item);
                    }}
                  >
                    👁 View
                  </button>
                  <button
                    style={{
                      ...actionBtn,
                      color: "#059669",
                      borderColor: "#a7f3d0",
                    }}
                    onClick={() => handleDownload(item)}
                  >
                    ⬇ Download PDF
                  </button>
                  <button
                    style={{
                      ...actionBtn,
                      color: "#ef4444",
                      borderColor: "#fecaca",
                      opacity: deleting === item.id ? 0.5 : 1,
                    }}
                    disabled={deleting === item.id}
                    onClick={() => handleDelete(item)}
                  >
                    {deleting === item.id ? "…" : "🗑 Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewItem && (
        <TimetableModal item={viewItem} onClose={() => setViewItem(null)} />
      )}
    </div>
  );
};

const listCard = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px",
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  flexWrap: "wrap",
  gap: 12,
};
const deptBadge = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg,#6366f1,#4f46e5)",
  color: "#fff",
  borderRadius: 10,
  padding: "8px 14px",
  minWidth: 64,
};
const actionBtn = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid",
  background: "#fff",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 600,
  transition: "opacity .15s",
};
const modal = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  box: {
    background: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 1200,
    maxHeight: "92vh",
    overflowY: "auto",
    padding: 28,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
  },
  closeBtn: {
    background: "#f1f5f9",
    border: "none",
    borderRadius: 8,
    width: 36,
    height: 36,
    cursor: "pointer",
    fontSize: "1rem",
  },
};
const tStyle = {
  th: {
    border: "1px solid #e2e8f0",
    padding: "8px 10px",
    background: "#f1f5f9",
    fontSize: "0.72rem",
    fontWeight: 700,
    whiteSpace: "nowrap",
    textAlign: "center",
  },
  dayCell: {
    border: "1px solid #e2e8f0",
    padding: "10px 14px",
    fontWeight: 700,
    fontSize: "0.82rem",
    background: "#f8fafc",
    whiteSpace: "nowrap",
  },
  cell: {
    border: "1px solid #e2e8f0",
    padding: "10px 8px",
    textAlign: "center",
    fontSize: "0.75rem",
    fontWeight: 500,
  },
  breakCell: {
    border: "1px solid #e2e8f0",
    background: "#fde68a",
    textAlign: "center",
    fontWeight: 700,
    fontSize: "0.78rem",
    padding: "6px 8px",
    color: "#92400e",
  },
  labCell: {
    // border: "2px solid #6366f1",
    padding: "10px 12px",
    textAlign: "center",
    borderRadius: 4,
  },
  labBadge: {
    display: "inline-block",
    background: "#6366f1",
    color: "#fff",
    borderRadius: 4,
    padding: "1px 6px",
    fontSize: "0.65rem",
    fontWeight: 700,
  },
};

export default RecentTimetables;
