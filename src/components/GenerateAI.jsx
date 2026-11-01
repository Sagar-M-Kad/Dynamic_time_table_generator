import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import Button from "@mui/material/Button";
import { supabase } from "../supabaseClient";
import ScoreBadge from "./ScoreBadge";
import { fetchAcademicStructure } from "../services/academicStructureService";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, Filter, Layers, Users, MapPin, Sparkles, Building, BookOpen } from "lucide-react";

import {
  generateTimetableFull,
  generateWithGemini,
  fixTimetableWithJS,
  validateTimetable,
  getLabLabel,
} from "../services/aiService";
import { resolveSubjectCode } from "../services/schedulerEngine";

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
const colorCache = {};
let colorIdx = 0;
const subjectColor = (name) => {
  if (!name || name === "-") return "#f8fafc";
  if (!colorCache[name])
    colorCache[name] = PALETTE[colorIdx++ % PALETTE.length];
  return colorCache[name];
};

const steps = [
  { title: "Enter Basic Details", desc: "Provide class, days, and periods." },
  { title: "Add Subjects", desc: "List all subjects." },
  { title: "Add Teachers", desc: "Assign teachers to subjects." },
  { title: "Define Constraints", desc: "Set scheduling rules." },
  { title: "Academic Structure", desc: "Configured Depts, Sems, Divisions & Batches." },
  { title: "Review Inputs", desc: "Verify details." },
  {
    title: "Generate Timetable",
    desc: "Deterministic solver guarantees conflict-free schedule.",
    highlight: true,
  },
  { title: "View & Filter", desc: "Division or specific batch view." },
  { title: "Export / Save", desc: "Download conflict-free PDF." },
];

const GenerateAI = () => {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [matrix, setMatrix] = useState(null); // display rows
  const [conflicts, setConflicts] = useState([]);
  const [generationData, setGenerationData] = useState(null);

  const [academicStructure, setAcademicStructure] = useState(null);
  const [selectedSem, setSelectedSem] = useState("6");
  const [selectedDept, setSelectedDept] = useState("CSE");
  const [selectedSection, setSelectedSection] = useState("CSE-A");
  const [viewMode, setViewMode] = useState("DIVISION"); // 'DIVISION' | 'BATCH' | 'TEACHER' | 'ROOM' | 'ELECTIVE'
  const [selectedBatchFilter, setSelectedBatchFilter] = useState("ALL");
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState("ALL");
  const [selectedRoomFilter, setSelectedRoomFilter] = useState("ALL");
  const [selectedElectiveFilter, setSelectedElectiveFilter] = useState("ALL");

  const [draggedCell, setDraggedCell] = useState(null);
  const [modInput, setModInput] = useState("");
  const [modLoading, setModLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timetableScore, setTimetableScore] = useState(null);

  useEffect(() => {
    (async () => {
      const data = await fetchAcademicStructure();
      setAcademicStructure(data);
    })();
  }, []);

  // Compute available divisions based on selectedDept and selectedSem
  const availableDivisions = academicStructure?.divisions
    ? academicStructure.divisions
        .filter(
          (d) =>
            d.department_code?.toUpperCase() === selectedDept?.toUpperCase() &&
            parseInt(d.semester) === parseInt(selectedSem) &&
            d.is_active !== false
        )
        .map((d) => d.name)
    : ["CSE-A", "CSE-B"];

  const currentDivisions = availableDivisions.length > 0 ? availableDivisions : ["CSE-A", "CSE-B"];

  useEffect(() => {
    if (currentDivisions.length > 0 && !currentDivisions.includes(selectedSection)) {
      setSelectedSection(currentDivisions[0]);
    }
  }, [selectedDept, selectedSem, academicStructure]);

  // ── HELPERS ─────────────────────────────────────────────────────────────

  /**
   * Helper to retrieve teacher name by subject ID from generation resources
   */
  const getTeacherName = (subjectId) => {
    if (!generationData?.data?.resources?.teacherLinks) return "-";
    const link = generationData.data.resources.teacherLinks.find(
      (tl) => String(tl.subject_id) === String(subjectId)
    );
    if (!link) return "-";
    return link.teachers?.name || link.teacher_name || link.teacher_id || "-";
  };

  /**
   * Get active view title for display and PDF export
   */
  const getViewTitle = () => {
    if (viewMode === "BATCH") {
      return `${selectedDept} Sem ${selectedSem} (${selectedSection}) — Batch ${selectedBatchFilter} View`;
    }
    if (viewMode === "TEACHER") {
      const teachers = generationData?.data?.resources?.teachers || [];
      const tObj = teachers.find((t) => String(t.id) === String(selectedTeacherFilter) || t.name === selectedTeacherFilter);
      return `Faculty Schedule: ${tObj?.name || selectedTeacherFilter}`;
    }
    if (viewMode === "ROOM") {
      return `Room Schedule: ${selectedRoomFilter}`;
    }
    if (viewMode === "ELECTIVE") {
      const electives = academicStructure?.elective_groups || [];
      const eg = electives.find((e) => e.id === selectedElectiveFilter);
      return `Elective Group Schedule: ${eg?.name || "All Electives"}`;
    }
    return `${selectedDept} — Sem ${selectedSem} (${selectedSection})`;
  };

  /**
   * Build the display matrix from a timetable + slots list.
   * Supports Division view, Batch view, Faculty schedule view, Room allocation view, and Elective Group view.
   */
  const rebuildMatrix = (
    timetable,
    slots,
    subjects,
    filterOptions = {}
  ) => {
    const opts = typeof filterOptions === "string" ? { batchFilter: filterOptions } : (filterOptions || {});
    const mode = opts.mode || viewMode;
    const batchFilter = opts.batchFilter || selectedBatchFilter;
    const teacherFilter = opts.teacherFilter || selectedTeacherFilter;
    const roomFilter = opts.roomFilter || selectedRoomFilter;
    const electiveFilter = opts.electiveFilter || selectedElectiveFilter;

    const labs = (subjects || []).filter((s) => s.is_lab);
    const combinedLabLabel = labs.length > 0 ? getLabLabel(labs) : null;

    const newMatrix = DAYS.reduce((acc, day) => {
      const row = [];

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.type !== "class") {
          row.push({ ...slot });
          continue;
        }

        const rawCell = timetable[day]?.[slot.label] || "-";

        // ── 1. TEACHER VIEW FILTER ───────────────────────────────────────────
        if (mode === "TEACHER" && teacherFilter !== "ALL") {
          let matched = null;
          let matchedRoom = null;

          if (typeof rawCell === "object") {
            if (rawCell.batch_labs) {
              const bl = rawCell.batch_labs.find(
                (l) =>
                  String(l.teacher_id) === String(teacherFilter) ||
                  getTeacherName(l.subject_name) === teacherFilter
              );
              if (bl) {
                matched = `${bl.subject_name} (${bl.batch})`;
                matchedRoom = bl.room;
              }
            } else if (rawCell.is_elective && rawCell.offerings) {
              const off = rawCell.offerings.find(
                (o) =>
                  String(o.teacher_id) === String(teacherFilter) ||
                  o.teacher_name === teacherFilter
              );
              if (off) {
                matched = `${off.subject_name} (Elective)`;
                matchedRoom = off.room || off.room_name;
              }
            } else if (rawCell.subject_name) {
              const sub = (subjects || []).find((s) => s.subject_name === rawCell.subject_name);
              if (
                sub &&
                (String(getTeacherName(sub.id)) === String(teacherFilter) ||
                  String(rawCell.teacher_id) === String(teacherFilter))
              ) {
                matched = rawCell.subject_name;
                matchedRoom = rawCell.room || generationData?.theoryRoom;
              }
            }
          } else if (typeof rawCell === "string" && rawCell !== "-") {
            const sub = (subjects || []).find((s) => s.subject_name === rawCell);
            if (sub && String(getTeacherName(sub.id)) === String(teacherFilter)) {
              matched = rawCell;
              matchedRoom = generationData?.theoryRoom;
            }
          }

          if (matched) {
            row.push({
              type: "class",
              label: slot.label,
              subject: matched,
              subject_code: resolveSubjectCode(matched, subjects),
              room: matchedRoom,
              isTeacherMatch: true,
            });
          } else {
            row.push({
              type: "class",
              label: slot.label,
              subject: "— Free —",
              isFreePeriod: true,
            });
          }
          continue;
        }

        // ── 2. ROOM VIEW FILTER ──────────────────────────────────────────────
        if (mode === "ROOM" && roomFilter !== "ALL") {
          let matched = null;
          let matchedTeacher = null;

          if (typeof rawCell === "object") {
            if (rawCell.batch_labs) {
              const bl = rawCell.batch_labs.find(
                (l) => l.room?.toLowerCase() === roomFilter.toLowerCase()
              );
              if (bl) {
                matched = `${bl.subject_name} (${bl.batch})`;
                matchedTeacher = bl.teacher_id;
              }
            } else if (rawCell.is_elective && rawCell.offerings) {
              const off = rawCell.offerings.find(
                (o) => (o.room || o.room_name)?.toLowerCase() === roomFilter.toLowerCase()
              );
              if (off) {
                matched = `${off.subject_name} (Elective)`;
                matchedTeacher = off.teacher_name || off.teacher_id;
              }
            } else if (rawCell.subject_name) {
              const r = rawCell.room || generationData?.theoryRoom;
              if (r?.toLowerCase() === roomFilter.toLowerCase()) {
                matched = rawCell.subject_name;
                matchedTeacher = rawCell.teacher_id;
              }
            }
          } else if (typeof rawCell === "string" && rawCell !== "-") {
            if (generationData?.theoryRoom?.toLowerCase() === roomFilter.toLowerCase()) {
              matched = rawCell;
            }
          }

          if (matched) {
            row.push({
              type: "class",
              label: slot.label,
              subject: matched,
              subject_code: resolveSubjectCode(matched, subjects),
              teacher: matchedTeacher,
              room: roomFilter,
              isRoomMatch: true,
            });
          } else {
            row.push({
              type: "class",
              label: slot.label,
              subject: "— Vacant —",
              isFreePeriod: true,
            });
          }
          continue;
        }

        // ── 3. ELECTIVE GROUP VIEW FILTER ────────────────────────────────────
        if (mode === "ELECTIVE") {
          if (typeof rawCell === "object" && rawCell.is_elective) {
            if (electiveFilter === "ALL" || rawCell.elective_group_id === electiveFilter) {
              const enrichedOfferings = (rawCell.offerings || []).map((off) => ({
                ...off,
                subject_code: off.subject_code || resolveSubjectCode(off.subject_name, subjects),
              }));
              row.push({
                type: "class",
                label: slot.label,
                subject: rawCell.subject_name || "Parallel Electives",
                isElective: true,
                elective_group_name: rawCell.elective_group_name,
                offerings: enrichedOfferings,
                room: rawCell.room,
              });
              continue;
            }
          }
          row.push({
            type: "class",
            label: slot.label,
            subject: "— Non-Elective Period —",
            isFreePeriod: true,
          });
          continue;
        }

        // ── 4. DIVISION & BATCH VIEW FILTER ──────────────────────────────────
        if (typeof rawCell === "object" && rawCell.batch_labs) {
          const relevantLabs =
            batchFilter === "ALL"
              ? rawCell.batch_labs
              : rawCell.batch_labs.filter((bl) => bl.batch === batchFilter);

          if (relevantLabs.length === 0) {
            row.push({ type: "class", label: slot.label, subject: "-" });
            continue;
          }

          const isStart = relevantLabs.some((l) => l.is_block_start);
          const enrichedLabs = relevantLabs.map((l) => ({
            ...l,
            subject_code: l.subject_code || resolveSubjectCode(l.subject_name, subjects),
          }));

          if (isStart) {
            row.push({
              type: "class",
              label: slot.label,
              subject: enrichedLabs.map((l) => `${l.batch}: ${l.subject_name}`).join(" | "),
              batch_labs: enrichedLabs,
              labSpan: 2,
              isLab: true,
            });
            // Advance outer loop for the second slot of the 2-hour block
            if (i + 1 < slots.length && slots[i + 1].type === "class") {
              i++;
              row.push({
                type: "class",
                label: slots[i].label,
                subject: enrichedLabs.map((l) => `${l.batch}: ${l.subject_name}`).join(" | "),
                labSkip: true,
              });
            }
          } else {
            row.push({
              type: "class",
              label: slot.label,
              subject: enrichedLabs.map((l) => `${l.batch}: ${l.subject_name}`).join(" | "),
              batch_labs: enrichedLabs,
              isLab: true,
            });
          }
        } else if (typeof rawCell === "object" && rawCell.is_elective) {
          const enrichedOfferings = (rawCell.offerings || []).map((off) => ({
            ...off,
            subject_code: off.subject_code || resolveSubjectCode(off.subject_name, subjects),
          }));
          row.push({
            type: "class",
            label: slot.label,
            subject: rawCell.subject_name || "Parallel Electives",
            isElective: true,
            elective_group_name: rawCell.elective_group_name,
            offerings: enrichedOfferings,
            room: rawCell.room,
          });
        } else if (typeof rawCell === "object" && rawCell.subject_name) {
          const sCode = rawCell.subject_code || resolveSubjectCode(rawCell.subject_name, subjects);
          row.push({
            type: "class",
            label: slot.label,
            subject: rawCell.subject_name,
            subject_code: sCode,
            room: rawCell.room,
          });
        } else {
          // Legacy string cell
          const subject = rawCell;
          const sCode = subject && subject !== "-" ? resolveSubjectCode(subject, subjects) : "";
          const isLab = combinedLabLabel && subject === combinedLabLabel;

          if (isLab) {
            let span = 1;
            for (let j = i + 1; j < slots.length; j++) {
              if (slots[j].type !== "class") break;
              if ((timetable[day]?.[slots[j].label] || "-") !== combinedLabLabel)
                break;
              span++;
            }

            row.push({
              type: "class",
              label: slot.label,
              subject,
              subject_code: sCode,
              labSpan: span,
              isLab: true,
            });
            for (let k = 1; k < span; k++) {
              i++;
              row.push({
                type: "class",
                label: slots[i].label,
                subject,
                subject_code: sCode,
                labSkip: true,
              });
            }
          } else {
            row.push({
              type: "class",
              label: slot.label,
              subject,
              subject_code: sCode,
            });
          }
        }
      }

      acc[day] = row;
      return acc;
    }, {});

    setMatrix(newMatrix);
  };

  /**
   * Export the currently active timetable view to a formatted PDF
   */
  const handleExportPDF = () => {
    if (!matrix || !generationData) {
      return toast.error("Please generate a timetable before exporting to PDF.");
    }

    const tid = toast.loading("Generating synchronized PDF…");

    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const activeSlots = generationData.slots || [];

      // Document Title Header
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`TimeTable AI — ${getViewTitle()}`, 14, 15);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);

      const subHeader = `Department: ${selectedDept} | Semester: ${selectedSem} | Section: ${selectedSection} | Theory Room: ${
        generationData.theoryRoom || "-"
      } | Exported: ${new Date().toLocaleDateString()}`;
      doc.text(subHeader, 14, 21);
      doc.setTextColor(0);

      // Build head row
      const headRow = ["Day", ...activeSlots.map((s) => s.label)];
      const head = [headRow];

      // Build body rows
      const body = DAYS.map((day) => {
        const row = [day];
        const dayCells = matrix[day] || [];
        dayCells.forEach((c) => {
          if (c.labSkip) return;
          if (c.type === "break" || c.type === "lunch") {
            row.push(c.type.toUpperCase());
          } else if (c.batch_labs && c.batch_labs.length > 0) {
            const content = c.batch_labs
              .map((bl) => {
                const sCode = bl.subject_code || resolveSubjectCode(bl.subject_name, subjects) || bl.subject_name;
                return `${sCode} (${bl.batch})${bl.room ? ` - ${bl.room}` : ""}`;
              })
              .join("\n");
            if (c.labSpan > 1) {
              row.push({ content, colSpan: c.labSpan });
            } else {
              row.push(content);
            }
          } else if (c.isElective && c.offerings && c.offerings.length > 0) {
            const content = c.offerings
              .map((o) => {
                const sCode = o.subject_code || resolveSubjectCode(o.subject_name, subjects) || o.subject_name;
                return `${sCode}${o.room || o.room_name ? ` (${o.room || o.room_name})` : ""}`;
              })
              .join("\n");
            row.push(content);
          } else {
            if (c.subject && c.subject !== "-") {
              const sCode = c.subject_code || resolveSubjectCode(c.subject, subjects) || c.subject;
              const roomStr = c.room ? ` (${c.room})` : "";
              row.push(`${sCode}${roomStr}`);
            } else {
              row.push("-");
            }
          }
        });
        return row;
      });

      autoTable(doc, {
        head,
        body,
        startY: 26,
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
          fontSize: 7.5,
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
            const raw = data.cell.raw;
            const val = raw && typeof raw === "object" ? raw.content : raw;
            if (val === "BREAK" || val === "LUNCH") {
              data.cell.styles.fillColor = [253, 230, 138];
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.textColor = [120, 80, 0];
            } else if (val && typeof val === "string" && (val.includes("Lab") || val.includes("B1:"))) {
              data.cell.styles.fillColor = [224, 231, 255];
              data.cell.styles.textColor = [67, 56, 202];
            } else if (val && typeof val === "string" && val.includes("Elective")) {
              data.cell.styles.fillColor = [254, 243, 199];
              data.cell.styles.textColor = [146, 64, 14];
            }
          }
        },
        theme: "grid",
        margin: { left: 10, right: 10 },
      });

      // Course summary metadata table below
      const finalY = doc.lastAutoTable?.finalY || 130;
      const subjects = generationData?.data?.subjects || [];

      if (subjects.length > 0 && finalY < 165) {
        autoTable(doc, {
          startY: finalY + 6,
          head: [["Sl.No", "Course Title", "Code", "Credits", "Category", "L-T-P", "Course Instructor"]],
          body: subjects.map((s, idx) => [
            idx + 1,
            s.subject_name,
            s.subject_code || resolveSubjectCode(s.subject_name, subjects) || "-",
            s.weekly_hours,
            s.course_category || (s.is_lab ? "Laboratory" : "Theory"),
            s.ltp || (s.is_lab ? "0-0-2" : "3-0-0"),
            getTeacherName(s.id) || "-",
          ]),
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [237, 233, 254], textColor: [76, 29, 149], fontStyle: "bold" },
          theme: "grid",
          margin: { left: 10, right: 10 },
        });
      }

      doc.save(`Timetable_${selectedDept}_Sem${selectedSem}_${selectedSection}_${viewMode}.pdf`);
      toast.success("Timetable PDF exported successfully!", { id: tid });
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Failed to generate PDF: " + err.message, { id: tid });
    }
  };

  // ── DRAG & DROP ──────────────────────────────────────────────────────────
  const handleDragStart = (day, slotLabel) =>
    setDraggedCell({ day, slotLabel });

  /**
   * Check whether any lab room is double-booked with another semester
   * after a drag-and-drop swap.
   *
   * Uses data stored in generationData at generation time — no extra DB calls.
   *
   * labRoomBusyEntries: [{ room_id, day_of_week, time_slot }] from other sems
   * labRoomIdMap:       { "Lab 1": <uuid>, "Lab 2": <uuid>, ... }
   */
  const checkLabRoomConflicts = (timetable, genData) => {
    const roomConflicts = [];
    const {
      labRooms: labRoomMapping,
      labRoomBusyEntries,
      labRoomIdMap,
      data,
    } = genData || {};

    if (!labRoomMapping || !labRoomBusyEntries || !labRoomIdMap || !data)
      return roomConflicts;

    const labSubjects = data.subjects.filter((s) => s.is_lab);
    if (labSubjects.length === 0) return roomConflicts;
    const combinedLabLabel = labSubjects.map((l) => l.subject_name).join("/");

    // Build O(1) lookup set: "roomId_day_slot"
    const busySet = new Set(
      labRoomBusyEntries.map(
        (r) => `${r.room_id}_${r.day_of_week}_${r.time_slot}`
      )
    );

    // Walk the timetable — for every cell that holds the combined lab label,
    // check each assigned lab room against the busy set.
    for (const day in timetable) {
      for (const slot in timetable[day]) {
        if (timetable[day][slot] !== combinedLabLabel) continue;

        for (const [labName, roomName] of Object.entries(labRoomMapping)) {
          if (!roomName || roomName === "-") continue;
          const roomId = labRoomIdMap[roomName];
          if (!roomId) continue;

          if (busySet.has(`${roomId}_${day}_${slot}`)) {
            roomConflicts.push(
              `ROOM_CONFLICT: "${roomName}" is already booked on ${day} at ${slot} by another semester`
            );
          }
        }
      }
    }

    return roomConflicts;
  };

  const handleDrop = (targetDay, targetSlotLabel) => {
    if (!draggedCell) return;
    if (
      draggedCell.day === targetDay &&
      draggedCell.slotLabel === targetSlotLabel
    )
      return;

    const newTimetable = JSON.parse(JSON.stringify(generationData.timetable));
    const temp = newTimetable[draggedCell.day][draggedCell.slotLabel];
    newTimetable[draggedCell.day][draggedCell.slotLabel] =
      newTimetable[targetDay][targetSlotLabel];
    newTimetable[targetDay][targetSlotLabel] = temp;

    // Standard timetable validation (teacher conflicts, duplicates, over-limit)
    const timetableConflicts = validateTimetable(
      newTimetable,
      generationData.data.subjects,
      generationData.data.resources.teacherLinks,
      generationData.data.busyMap.teacherBusy
    );

    // Room conflict check: was this lab moved to a slot already booked by another semester?
    const roomConflicts = checkLabRoomConflicts(newTimetable, generationData);

    const allConflicts = [...timetableConflicts, ...roomConflicts];

    setGenerationData({ ...generationData, timetable: newTimetable });
    rebuildMatrix(
      newTimetable,
      generationData.slots,
      generationData.data.subjects
    );
    setConflicts(allConflicts);
    setDraggedCell(null);

    if (allConflicts.length > 0) {
      toast(`Swapped! But ${allConflicts.length} conflict(s) detected.`, {
        icon: "⚠️",
      });
    } else {
      toast.success("Slots swapped — no conflicts!");
    }
  };

  // ── GENERATE ─────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setLoading(true);
    setMatrix(null);
    setConflicts([]);
    setGenerationData(null);
    setTimetableScore(null);
    // reset colour cache so each generation is fresh
    Object.keys(colorCache).forEach((k) => delete colorCache[k]);
    colorIdx = 0;

    const tid = toast.loading("Starting generation…");

    try {
      const {
        timetable,
        slots,
        data,
        remainingConflicts,
        orderedClassSlots,
        batches,
        validation,
        qualityScore,
        theoryRoom: genTheoryRoom,
      } = await generateTimetableFull(selectedSem, selectedDept, (msg) => {
        setStatusMsg(msg);
        toast.loading(msg, { id: tid });
      }, selectedSection);

      // ── Allocate theory room for preview ─────────────────
      const rooms = data.resources.rooms || [];
      const theoryRooms = rooms.filter(
        (r) => r.room_type?.toLowerCase() === "theory"
      );

      let allocatedTheoryRoom = null;
      for (const room of theoryRooms) {
        const { data: existingBusy } = await supabase
          .from("room_availability")
          .select("*")
          .eq("room_id", room.id)
          .eq("is_busy", true);

        if (!existingBusy || existingBusy.length === 0) {
          allocatedTheoryRoom = room;
          break;
        }
      }

      // ── Allocate lab rooms ────────────────────────────────
      // Each individual lab subject gets its own unique lab room.
      // Lab rooms are shared infrastructure — always fetch ALL of them globally
      // so a room not tagged to this department is still considered.
      const { data: allLabRoomsData } = await supabase
        .from("rooms")
        .select("*")
        .ilike("room_type", "lab");
      const labRooms = allLabRoomsData || [];

      // Fetch busy entries for lab rooms from OTHER semesters only.
      // We exclude the current semester so that re-generating this semester's
      // timetable does NOT block itself with its own previous entries.
      const labRoomIds = labRooms.map((r) => r.id);
      let existingLabBusy = [];
      if (labRoomIds.length > 0) {
        const { data: lbData } = await supabase
          .from("room_availability")
          .select("room_id,day_of_week,time_slot")
          .in("room_id", labRoomIds)
          .eq("is_busy", true)
          .neq("semester_id", parseInt(selectedSem)); // ignore current sem's old entries
        existingLabBusy = lbData || [];
      }

      // Build a Set for O(1) DB-busy lookup: "roomId_day_slot"
      const dbBusySet = new Set(
        existingLabBusy.map(
          (r) => `${r.room_id}_${r.day_of_week}_${r.time_slot}`
        )
      );

      // Tracks slots made busy within THIS generation run
      const currentGenBusy = new Set();

      // Detect lab subjects and their combined label
      const labSubjects = data.subjects.filter((s) => s.is_lab);
      const combinedLabLabel =
        labSubjects.length > 0
          ? labSubjects.map((l) => l.subject_name).join("/")
          : null;

      // Find all (day, slot) pairs where the combined lab label appears
      const labOccurrences = []; // [{ day, slot }]
      if (combinedLabLabel) {
        for (const day in timetable) {
          for (const slot in timetable[day]) {
            if (timetable[day][slot] === combinedLabLabel) {
              labOccurrences.push({ day, slot });
            }
          }
        }
      }

      // Group occurrences by day
      const labSlotsByDay = {};
      labOccurrences.forEach(({ day, slot }) => {
        if (!labSlotsByDay[day]) labSlotsByDay[day] = [];
        labSlotsByDay[day].push(slot);
      });

      // ── Helpers ───────────────────────────────────────────────────────────
      const isRoomFreeForBlock = (roomId, day, blockSlots) =>
        blockSlots.every(
          (slot) =>
            !dbBusySet.has(`${roomId}_${day}_${slot}`) &&
            !currentGenBusy.has(`${roomId}_${day}_${slot}`)
        );

      // ── Step 1: find how many free rooms exist at the CURRENT lab position
      const labDays = Object.keys(labSlotsByDay);

      const freeRoomsAtCurrentPos = labRooms.filter(
        (room) =>
          !labDays.some(
            (day) => !isRoomFreeForBlock(room.id, day, labSlotsByDay[day])
          )
      );

      // ── Step 2: if not enough free rooms at current position,
      //    find the next consecutive slot window where EVERY lab day is
      //    simultaneously free in the timetable AND has enough free rooms.
      //    Search order: same days / next slots → same days / earlier slots → new day.
      if (
        combinedLabLabel &&
        labSubjects.length > 0 &&
        freeRoomsAtCurrentPos.length < labSubjects.length
      ) {
        const labDuration = parseInt(data.constraints.lab_duration) || 2;
        const ALL_DAYS = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];

        // The current window (same for every lab day)
        const currentWindow =
          labDays.length > 0 ? labSlotsByDay[labDays[0]] : [];

        // Build truly consecutive windows: scan the FULL slots array (with breaks/lunch).
        // A window is only valid when `labDuration` class slots appear back-to-back
        // with NO break or lunch slot in between.
        const allWindows = []; // [{ startIdx, window: [slotLabel, ...] }]
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].type !== "class") continue;

          const window = [];
          let j = i;
          while (window.length < labDuration && j < slots.length) {
            if (slots[j].type === "class") {
              window.push(slots[j].label);
              j++;
            } else {
              break; // break or lunch — not consecutive
            }
          }

          if (window.length === labDuration) {
            allWindows.push({ startIdx: i, window });
          }
        }

        // Order windows: those starting AFTER the current window come first (true "next"),
        // then wrap around to earlier windows.
        const currentStartIdx = slots.findIndex(
          (s) => s.type === "class" && s.label === currentWindow[0]
        );
        const orderedWindows = [
          ...allWindows.filter((w) => w.startIdx > currentStartIdx),
          ...allWindows.filter((w) => w.startIdx <= currentStartIdx),
        ].filter(
          (w) => JSON.stringify(w.window) !== JSON.stringify(currentWindow)
        );

        // Helper: is a given window valid for ALL lab days?
        //   - timetable slots free (or already the lab label) on every lab day
        //   - enough lab rooms free on every lab day
        const isWindowValidForAllDays = (window, days) => {
          const freeRooms = labRooms.filter((room) =>
            days.every((day) => isRoomFreeForBlock(room.id, day, window))
          );
          if (freeRooms.length < labSubjects.length) return false;

          return days.every((day) =>
            window.every((slot) => {
              const val = timetable[day]?.[slot];
              return (
                val === undefined || val === "-" || val === combinedLabLabel
              );
            })
          );
        };

        // Move ALL lab days to a new window
        const moveLabBlock = (newWindow, days) => {
          days.forEach((day) => {
            // Clear old slots
            (labSlotsByDay[day] || []).forEach((oldSlot) => {
              if (timetable[day]?.[oldSlot] === combinedLabLabel)
                timetable[day][oldSlot] = "-";
            });
            // Set new slots
            newWindow.forEach((newSlot) => {
              if (timetable[day]) timetable[day][newSlot] = combinedLabLabel;
            });
            labSlotsByDay[day] = newWindow;
          });
        };

        let moved = false;

        // Pass A: same days, next available consecutive slots
        for (const { window } of orderedWindows) {
          if (isWindowValidForAllDays(window, labDays)) {
            moveLabBlock(window, labDays);
            moved = true;
            break;
          }
        }

        // Pass B: different day — find any day + window with enough free rooms
        if (!moved) {
          for (const newDay of ALL_DAYS.filter((d) => !labDays.includes(d))) {
            for (const { window } of orderedWindows) {
              const ttFree = window.every((slot) => {
                const val = timetable[newDay]?.[slot];
                return val === undefined || val === "-";
              });
              if (!ttFree) continue;

              const freeRooms = labRooms.filter((room) =>
                isRoomFreeForBlock(room.id, newDay, window)
              );
              if (freeRooms.length < labSubjects.length) continue;

              // Replace the first lab day with this new day
              const srcDay = labDays[0];
              (labSlotsByDay[srcDay] || []).forEach((oldSlot) => {
                if (timetable[srcDay]?.[oldSlot] === combinedLabLabel)
                  timetable[srcDay][oldSlot] = "-";
              });
              window.forEach((newSlot) => {
                if (timetable[newDay])
                  timetable[newDay][newSlot] = combinedLabLabel;
              });
              labSlotsByDay[newDay] = window;
              delete labSlotsByDay[srcDay];
              moved = true;
              break;
            }
            if (moved) break;
          }
        }
      }

      // ── Step 3: assign one unique room per lab subject at the (possibly moved) position
      const labRoomMapping = {};
      const assignedRoomIds = new Set();
      const finalLabDays = Object.keys(labSlotsByDay);

      if (finalLabDays.length > 0 && labSubjects.length > 0) {
        for (const labSubject of labSubjects) {
          let assigned = false;

          // Pass 1 — perfectly free room at current/moved position
          for (const room of labRooms) {
            if (assignedRoomIds.has(room.id)) continue;
            const free = finalLabDays.every((day) =>
              isRoomFreeForBlock(room.id, day, labSlotsByDay[day])
            );
            if (free) {
              labRoomMapping[labSubject.subject_name] = room.room_name;
              assignedRoomIds.add(room.id);
              finalLabDays.forEach((day) =>
                labSlotsByDay[day].forEach((slot) =>
                  currentGenBusy.add(`${room.id}_${day}_${slot}`)
                )
              );
              assigned = true;
              break;
            }
          }

          // Pass 2 — least-conflicted room (last resort)
          if (!assigned) {
            let bestRoom = null;
            let minConflicts = Infinity;
            for (const room of labRooms) {
              if (assignedRoomIds.has(room.id)) continue;
              let conflicts = 0;
              finalLabDays.forEach((day) =>
                labSlotsByDay[day].forEach((slot) => {
                  if (
                    dbBusySet.has(`${room.id}_${day}_${slot}`) ||
                    currentGenBusy.has(`${room.id}_${day}_${slot}`)
                  )
                    conflicts++;
                })
              );
              if (conflicts < minConflicts) {
                minConflicts = conflicts;
                bestRoom = room;
              }
            }
            if (bestRoom) {
              labRoomMapping[labSubject.subject_name] = bestRoom.room_name;
              assignedRoomIds.add(bestRoom.id);
              finalLabDays.forEach((day) =>
                labSlotsByDay[day].forEach((slot) =>
                  currentGenBusy.add(`${bestRoom.id}_${day}_${slot}`)
                )
              );
              assigned = true;
            }
          }

          if (!assigned) labRoomMapping[labSubject.subject_name] = "-";
        }
      }

      setGenerationData({
        timetable,
        slots,
        data,
        batches: batches || ["B1", "B2"],
        validation,
        theoryRoom: genTheoryRoom || allocatedTheoryRoom?.room_name || "-",
        labRooms: labRoomMapping,
        // Store for drag-and-drop room conflict detection (no extra DB calls needed)
        labRoomBusyEntries: existingLabBusy, // [{ room_id, day_of_week, time_slot }] from other sems
        labRoomIdMap: Object.fromEntries(
          labRooms.map((r) => [r.room_name, r.id])
        ), // { "Lab 1": id, ... }
      });
      rebuildMatrix(timetable, slots, data.subjects, selectedBatchFilter);
      const finalScore = qualityScore ? qualityScore.score : (remainingConflicts.length === 0 ? 100 : 0);
      setTimetableScore(finalScore);
      setConflicts(remainingConflicts);

      if (remainingConflicts.length > 0) {
        toast(
          `Generated with ${remainingConflicts.length} unresolved conflict(s). Fix conflicts before saving.`,
          { id: tid, icon: "⚠️", duration: 6000 }
        );
      } else {
        toast.success("✅ Timetable generated & validated!", { id: tid });
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error generating timetable", { id: tid });
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  // ── NATURAL-LANGUAGE CHANGES ─────────────────────────────────────────────
  const handleApplyChanges = async () => {
    if (!modInput.trim()) return toast.error("Describe the change you want.");
    setModLoading(true);
    const tid = toast.loading("Applying changes…");

    try {
      const { timetable, slots, data } = generationData;

      const changePrompt = `You are a timetable editor.

      Current timetable:
      ${JSON.stringify(timetable, null, 2)}

      User request: "${modInput}"

      Subject list (respect weekly limits):
      ${JSON.stringify(
        data.subjects.map((s) => ({
          name: s.subject_name,
          max: s.weekly_hours,
        }))
      )}

      Apply the user's requested change. Keep all other slots EXACTLY the same.
      Do NOT exceed weekly_hours for any subject.
      Do NOT place a theory subject twice on the same day.
      Return ONLY the complete updated timetable as strict JSON — no explanation, no markdown.`;

      let updated = await generateWithGemini(changePrompt);
      updated = fixTimetableWithJS(updated, data.subjects);

      const newConflicts = validateTimetable(
        updated,
        data.subjects,
        data.resources.teacherLinks,
        data.busyMap.teacherBusy
      );

      setGenerationData((prev) => ({
        ...prev,
        timetable: updated,
      }));
      rebuildMatrix(updated, slots, data.subjects);
      const score = scoreTimetable(updated, data.subjects, slots);
      setTimetableScore(score);
      setConflicts(newConflicts);
      setModInput("");

      if (newConflicts.length > 0) {
        toast(`Changes applied — ${newConflicts.length} conflict(s) detected`, {
          id: tid,
          icon: "⚠️",
        });
      } else {
        toast.success("Changes applied successfully!", { id: tid });
      }
    } catch (err) {
      toast.error("Failed to apply changes", { id: tid });
    } finally {
      setModLoading(false);
    }
  };

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!generationData) return;

    // Phase 1: Validate the complete timetable before saving or publishing it
    if (conflicts.length > 0 || (generationData.validation && !generationData.validation.isValid)) {
      const errCount = conflicts.length || generationData.validation?.violations?.length || 1;
      toast.error(
        `Cannot save / publish: ${errCount} unresolved conflict(s) or configuration error(s) detected. Please resolve all issues first.`,
        { duration: 6000 }
      );
      return;
    }

    setSaving(true);

    try {
      const { timetable, data } = generationData;

      // ── 1. Save timetable snapshot — critical, must succeed ──────────────
      const insertPayload = {
        department: `${selectedDept} (${selectedSection})`,
        semester: parseInt(selectedSem),
        division: selectedSection,
        timetable_json: timetable,
        created_at: new Date().toISOString(),
      };

      let { data: saved, error: saveErr } = await supabase
        .from("saved_timetables")
        .insert([insertPayload])
        .select()
        .single();

      // Fallback if 'division' column is not yet present in user's Supabase schema
      if (saveErr && saveErr.message && saveErr.message.includes("division")) {
        delete insertPayload.division;
        const retry = await supabase
          .from("saved_timetables")
          .insert([insertPayload])
          .select()
          .single();
        saved = retry.data;
        saveErr = retry.error;
      }

      if (saveErr) throw new Error("Save failed: " + saveErr.message);

      toast.success("Timetable saved!", { duration: 3000 });

      // ── 2. Teacher availability — background, non-blocking ───────────────
      const subjectTeacherMap = {};
      (data.resources.teacherLinks || []).forEach((link) => {
        const subName = link.subjects?.subject_name;
        if (subName) subjectTeacherMap[subName] = link.teacher_id;
      });

      const labSubjectsForMap = data.subjects.filter((s) => s.is_lab);
      const combinedLabLabelForMap =
        labSubjectsForMap.length > 0
          ? labSubjectsForMap.map((l) => l.subject_name).join("/")
          : null;

      if (combinedLabLabelForMap) {
        labSubjectsForMap.forEach((lab) => {
          const tId = subjectTeacherMap[lab.subject_name];
          if (tId) subjectTeacherMap[combinedLabLabelForMap] = tId;
        });
      }

      const availabilityRows = [];
      const semesterId = parseInt(selectedSem);

      for (const day in timetable) {
        for (const slot in timetable[day]) {
          const cell = timetable[day][slot];
          if (!cell || cell === "-") continue;

          if (typeof cell === "string") {
            const teacherId = subjectTeacherMap[cell];
            if (teacherId) {
              availabilityRows.push({
                teacher_id: teacherId,
                day_of_week: day,
                time_slot: slot,
                semester_id: semesterId,
                is_busy: true,
              });
            }
          } else if (cell.batch_labs) {
            cell.batch_labs.forEach((l) => {
              const tId = l.teacher_id || subjectTeacherMap[l.subject_name || l.subject];
              if (tId) {
                availabilityRows.push({
                  teacher_id: tId,
                  day_of_week: day,
                  time_slot: slot,
                  semester_id: semesterId,
                  is_busy: true,
                });
              }
            });
          } else if (cell.offerings) {
            cell.offerings.forEach((off) => {
              const tId = off.teacher_id || subjectTeacherMap[off.subject_name];
              if (tId) {
                availabilityRows.push({
                  teacher_id: tId,
                  day_of_week: day,
                  time_slot: slot,
                  semester_id: semesterId,
                  is_busy: true,
                });
              }
            });
          }
        }
      }

      if (availabilityRows.length > 0) {
        const { error: availErr } = await supabase
          .from("teacher_availability")
          .upsert(availabilityRows, {
            onConflict: "teacher_id,day_of_week,time_slot",
          });
        if (availErr)
          console.warn("teacher_availability warn:", availErr.message);
        else
          console.log(
            `✅ ${availabilityRows.length} teacher slots marked busy`
          );
      }

      // ── 3. Room bookings — theory room (non-blocking) ───────────────────
      const allocatedTheoryRoomName = generationData.theoryRoom;
      const rooms = data.resources.rooms || [];
      const allocatedTheoryRoom = rooms.find(
        (r) => r.room_name === allocatedTheoryRoomName
      );

      if (allocatedTheoryRoom) {
        const roomRows = [];
        const labSubjectsForSave = data.subjects.filter((s) => s.is_lab);
        const combinedLabLabel =
          labSubjectsForSave.length > 0
            ? labSubjectsForSave.map((l) => l.subject_name).join("/")
            : null;

        for (const day in timetable) {
          for (const slot in timetable[day]) {
            const subject = timetable[day][slot];
            if (!subject || subject === "-" || subject === combinedLabLabel)
              continue;
            roomRows.push({
              room_id: allocatedTheoryRoom.id,
              day_of_week: day,
              time_slot: slot,
              semester_id: parseInt(selectedSem),
              is_busy: true,
            });
          }
        }

        if (roomRows.length > 0) {
          const uniqueRoomRows = Array.from(
            new Map(
              roomRows.map((r) => [
                `${r.room_id}_${r.day_of_week}_${r.time_slot}`,
                r,
              ])
            ).values()
          );
          await supabase.from("room_availability").upsert(uniqueRoomRows, {
            onConflict: "room_id,day_of_week,time_slot",
          });
        }

        await supabase
          .from("saved_timetables")
          .update({ theory_room: allocatedTheoryRoom.room_name })
          .eq("id", saved.id);

        setGenerationData((prev) => ({
          ...prev,
          theoryRoom: allocatedTheoryRoom?.room_name || "-",
        }));
      }

      // ── 4. Lab room bookings ──────────────────────────────────────────────
      const labRoomMapping = generationData.labRooms || {};

      if (Object.keys(labRoomMapping).length > 0) {
        // IMPORTANT: always fetch lab rooms GLOBALLY (not department-filtered)
        // because lab rooms are shared infrastructure — the same room may be
        // registered under a different department or no department at all.
        // Using department-filtered `rooms` here was the bug that caused rooms
        // to appear free when they were already booked by another semester.
        const { data: allLabRoomsForSave } = await supabase
          .from("rooms")
          .select("*")
          .ilike("room_type", "lab");
        const allLabRoomsGlobal = allLabRoomsForSave || [];

        const labSubjectsForSave2 = data.subjects.filter((s) => s.is_lab);
        const combinedLabLabelForSave =
          labSubjectsForSave2.length > 0
            ? labSubjectsForSave2.map((l) => l.subject_name).join("/")
            : null;

        const labSlotPairs = []; // [{ day, slot }]
        if (combinedLabLabelForSave) {
          for (const day in timetable) {
            for (const slot in timetable[day]) {
              if (timetable[day][slot] === combinedLabLabelForSave) {
                labSlotPairs.push({ day, slot });
              }
            }
          }
        }

        const labRoomAvailRows = [];

        for (const [labSubjectName, roomName] of Object.entries(
          labRoomMapping
        )) {
          if (!roomName || roomName === "-") continue;
          // Use the globally fetched lab rooms list — NOT the department-filtered one
          const labRoom = allLabRoomsGlobal.find(
            (r) => r.room_name === roomName
          );
          if (!labRoom) {
            console.warn(
              `[Save] Lab room "${roomName}" not found in global room list`
            );
            continue;
          }

          labSlotPairs.forEach(({ day, slot }) => {
            labRoomAvailRows.push({
              room_id: labRoom.id,
              day_of_week: day,
              time_slot: slot,
              semester_id: parseInt(selectedSem),
              is_busy: true,
            });
          });
        }

        if (labRoomAvailRows.length > 0) {
          const uniqueLabRows = Array.from(
            new Map(
              labRoomAvailRows.map((r) => [
                `${r.room_id}_${r.day_of_week}_${r.time_slot}`,
                r,
              ])
            ).values()
          );
          const { error: labAvailErr } = await supabase
            .from("room_availability")
            .upsert(uniqueLabRows, {
              onConflict: "room_id,day_of_week,time_slot",
            });
          if (labAvailErr) {
            console.warn("lab room_availability warn:", labAvailErr.message);
          } else {
            console.log(
              `✅ ${uniqueLabRows.length} lab room slots marked busy`
            );
          }
        }

        // Persist lab_rooms JSON into saved_timetables row
        await supabase
          .from("saved_timetables")
          .update({ lab_rooms: labRoomMapping })
          .eq("id", saved.id);
      }
    } catch (err) {
      toast.error(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 4px" }}>
      {/* CONTROL PANEL */}
      <div style={styles.card}>
        <h2 style={{ textAlign: "center", marginBottom: 4 }}>
          ⚡ AI Timetable Generator
        </h2>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: 24 }}>
          Generates, validates and auto-resolves conflicts
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={styles.label}>Department</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              style={styles.select}
            >
              {(academicStructure?.departments?.map((d) => d.code) || [
                "CSE",
                "AIML",
                "ISE",
                "ECE",
                "ME",
                "CV",
              ]).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={styles.label}>Semester</label>
            <select
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
              style={styles.select}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={styles.label}>Division / Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              style={styles.select}
            >
              {currentDivisions.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button
          variant="contained"
          fullWidth
          onClick={handleGenerate}
          disabled={loading}
          style={{ marginTop: 20, height: 50, fontSize: "1rem" }}
        >
          {loading ? "Generating…" : "🚀 Generate Timetable"}
        </Button>
      </div>

      {/* CONFLICT PANEL */}
      {conflicts.length > 0 && (
        <div
          style={{
            ...styles.card,
            borderColor: "#f97316",
            background: "#fff7ed",
            marginTop: 16,
          }}
        >
          <h3 style={{ color: "#c2410c", marginBottom: 10 }}>
            ⚠️ {conflicts.length} Unresolved Conflict
            {conflicts.length > 1 ? "s" : ""}
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {conflicts.map((c, i) => (
              <li
                key={i}
                style={{
                  color: "#7c3aed",
                  fontSize: "0.88rem",
                  marginBottom: 4,
                }}
              >
                {c}
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 10, color: "#64748b", fontSize: "0.82rem" }}>
            ⚠️ Conflicts must be resolved before saving. Try regenerating — the engine will automatically attempt to fix them.
          </p>
        </div>
      )}

      {!matrix && (
        <>
          <div style={{ ...styles.card, marginTop: 16 }}>
            <h3 style={{ marginBottom: "16px" }}>
              Steps to generate a timetable
            </h3>

            <div style={{ position: "relative", marginLeft: "20px" }}>
              {/* Vertical line */}
              <div
                style={{
                  position: "absolute",
                  left: "7px",
                  top: 0,
                  bottom: 0,
                  width: "2px",
                  background: "#cbd5e1",
                }}
              />

              {steps.map((step, index) => (
                <div
                  key={index}
                  style={{
                    position: "relative",
                    marginBottom: index === steps.length - 1 ? 0 : "20px",
                  }}
                >
                  {/* Circle */}
                  <div
                    style={{
                      position: "absolute",
                      left: "-2px",
                      top: "2px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: step.highlight ? "#22c55e" : "#6366f1",
                      color: "#fff",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {index + 1}
                  </div>

                  {/* Content */}
                  <div style={{ marginLeft: "30px" }}>
                    <b>{step.title}</b>
                    <p
                      style={{
                        margin: "4px 0",
                        color: "#64748b",
                        fontSize: "0.9rem",
                      }}
                    >
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* TIMETABLE GRID */}
      {matrix && (
        <>
          <div style={{ ...styles.card, marginTop: 16, overflowX: "auto" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>📅 Generated Timetable</h3>
                <span
                  style={{
                    background: "#e0e7ff",
                    color: "#4338ca",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 6,
                  }}
                >
                  {selectedDept} — Sem {selectedSem} ({selectedSection})
                </span>
                <ScoreBadge
                  score={timetableScore}
                  validation={generationData?.validation}
                  violations={conflicts}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {/* 1. Main View Mode Selector */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#f8fafc",
                    padding: "4px 10px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                  }}
                >
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>
                    View Mode:
                  </span>
                  <select
                    value={viewMode}
                    onChange={(e) => {
                      const mode = e.target.value;
                      setViewMode(mode);
                      if (generationData) {
                        rebuildMatrix(
                          generationData.timetable,
                          generationData.slots,
                          generationData.data.subjects,
                          { mode }
                        );
                      }
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      fontWeight: 700,
                      color: "#4338ca",
                      cursor: "pointer",
                      outline: "none",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="DIVISION">🏛️ Division View</option>
                    <option value="BATCH">👥 Batch View</option>
                    <option value="TEACHER">👨‍🏫 Faculty Schedule</option>
                    <option value="ROOM">📍 Room Allocation</option>
                    <option value="ELECTIVE">⚡ Elective Block</option>
                  </select>
                </div>

                {/* 2. Sub-selectors depending on active View Mode */}
                {viewMode === "BATCH" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#f8fafc",
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>
                      Batch:
                    </span>
                    <select
                      value={selectedBatchFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedBatchFilter(val);
                        if (generationData) {
                          rebuildMatrix(
                            generationData.timetable,
                            generationData.slots,
                            generationData.data.subjects,
                            { mode: "BATCH", batchFilter: val }
                          );
                        }
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontWeight: 700,
                        color: "#4338ca",
                        cursor: "pointer",
                        outline: "none",
                        fontSize: "0.85rem",
                      }}
                    >
                      <option value="ALL">All Batches</option>
                      {(generationData?.batches || ["B1", "B2", "B3"]).map((b) => (
                        <option key={b} value={b}>
                          Batch {b}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {viewMode === "TEACHER" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#f8fafc",
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>
                      Faculty:
                    </span>
                    <select
                      value={selectedTeacherFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedTeacherFilter(val);
                        if (generationData) {
                          rebuildMatrix(
                            generationData.timetable,
                            generationData.slots,
                            generationData.data.subjects,
                            { mode: "TEACHER", teacherFilter: val }
                          );
                        }
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontWeight: 700,
                        color: "#4338ca",
                        cursor: "pointer",
                        outline: "none",
                        fontSize: "0.85rem",
                      }}
                    >
                      <option value="ALL">-- Select Faculty --</option>
                      {(generationData?.data?.resources?.teachers || []).map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {viewMode === "ROOM" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#f8fafc",
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>
                      Room:
                    </span>
                    <select
                      value={selectedRoomFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedRoomFilter(val);
                        if (generationData) {
                          rebuildMatrix(
                            generationData.timetable,
                            generationData.slots,
                            generationData.data.subjects,
                            { mode: "ROOM", roomFilter: val }
                          );
                        }
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontWeight: 700,
                        color: "#4338ca",
                        cursor: "pointer",
                        outline: "none",
                        fontSize: "0.85rem",
                      }}
                    >
                      <option value="ALL">-- Select Room --</option>
                      {generationData?.theoryRoom && (
                        <option value={generationData.theoryRoom}>
                          Theory Room: {generationData.theoryRoom}
                        </option>
                      )}
                      {Object.values(generationData?.labRooms || {}).map((lr) => (
                        <option key={lr} value={lr}>
                          Lab Room: {lr}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {viewMode === "ELECTIVE" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#f8fafc",
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>
                      Elective Group:
                    </span>
                    <select
                      value={selectedElectiveFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedElectiveFilter(val);
                        if (generationData) {
                          rebuildMatrix(
                            generationData.timetable,
                            generationData.slots,
                            generationData.data.subjects,
                            { mode: "ELECTIVE", electiveFilter: val }
                          );
                        }
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontWeight: 700,
                        color: "#4338ca",
                        cursor: "pointer",
                        outline: "none",
                        fontSize: "0.85rem",
                      }}
                    >
                      <option value="ALL">All Elective Groups</option>
                      {(academicStructure?.elective_groups || []).map((eg) => (
                        <option key={eg.id} value={eg.id}>
                          {eg.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 3. Export PDF Button */}
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleExportPDF}
                  style={{
                    backgroundColor: "#4338ca",
                    color: "#fff",
                    textTransform: "none",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: 8,
                    padding: "6px 14px",
                    fontSize: "0.84rem",
                    boxShadow: "0 2px 4px rgba(67, 56, 202, 0.2)",
                  }}
                >
                  <Download size={15} /> Export PDF
                </Button>
              </div>
            </div>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 700,
              }}
            >
              <thead>
                <tr>
                  <th style={styles.th}>Day</th>
                  {matrix["Monday"].map((slot, idx) => {
                    if (slot.type !== "class") {
                      return (
                        <th
                          key={idx}
                          style={{ ...styles.th, background: "#fde68a" }}
                        >
                          {slot.label}
                        </th>
                      );
                    }
                    return (
                      <th key={idx} style={styles.th}>
                        {slot.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day}>
                    <td style={styles.dayCell}>{day}</td>
                    {matrix[day].map((cell, idx) => {
                      if (cell.labSkip) return null;

                      if (cell.type === "lunch" || cell.type === "break") {
                        return (
                          <td key={idx} style={styles.breakCell}>
                            {cell.label}
                          </td>
                        );
                      }

                      // Lab cell with colspan
                      if (cell.labSpan > 1) {
                        const isConflicted = conflicts.some(
                          (c) =>
                            c.includes(`on ${day}`) && c.includes(cell.label)
                        );
                        return (
                          <td
                            key={idx}
                            colSpan={cell.labSpan}
                            draggable
                            onDragStart={() => handleDragStart(day, cell.label)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDrop(day, cell.label)}
                            style={{
                              ...styles.labCell,
                              background: subjectColor(cell.subject),
                              outline: isConflicted
                                ? "2px solid #ef4444"
                                : "none",
                            }}
                            title={cell.subject}
                          >
                            {isConflicted && (
                              <span
                                style={{
                                  color: "#ef4444",
                                  fontSize: "0.7rem",
                                  display: "block",
                                }}
                              >
                                ⚠️
                              </span>
                            )}
                            {cell.batch_labs && cell.batch_labs.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                                {cell.batch_labs.map((bl, bIdx) => (
                                  <div
                                    key={bIdx}
                                    title={bl.subject_name}
                                    style={{
                                      background: "rgba(255, 255, 255, 0.85)",
                                      padding: "4px 8px",
                                      borderRadius: 5,
                                      fontSize: "0.78rem",
                                      textAlign: "left",
                                      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                                      border: "1px solid rgba(0,0,0,0.06)",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontWeight: 800,
                                        color: "#4338ca",
                                        background: "#e0e7ff",
                                        padding: "1px 6px",
                                        borderRadius: 4,
                                        marginRight: 6,
                                      }}
                                    >
                                      {bl.batch}
                                    </span>
                                    <b style={{ color: "#1e293b", fontSize: "0.85rem" }}>
                                      {bl.subject_code || bl.subject_name}
                                    </b>
                                    <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>
                                      📍 {bl.room}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div title={cell.subject}>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    fontSize: "0.88rem",
                                    color: "#1e1b4b",
                                    marginTop: 2,
                                  }}
                                >
                                  {cell.subject_code || cell.subject}
                                </div>
                                {cell.room && (
                                  <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>
                                    📍 {cell.room}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      }

                      // Regular theory cell
                      const isConflicted = conflicts.some(
                        (c) => c.includes(`on ${day}`) && c.includes(cell.label)
                      );
                      return (
                        <td
                          key={idx}
                          draggable
                          onDragStart={() => handleDragStart(day, cell.label)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop(day, cell.label)}
                          style={{
                            ...styles.classCell,
                            background: subjectColor(cell.subject),
                            outline: isConflicted
                              ? "2px solid #ef4444"
                              : "none",
                          }}
                          title={
                            isConflicted
                              ? "⚠️ Conflict detected here"
                              : cell.subject
                          }
                        >
                          {isConflicted && (
                            <span
                              style={{
                                color: "#ef4444",
                                fontSize: "0.7rem",
                                display: "block",
                              }}
                            >
                              ⚠️
                            </span>
                          )}
                          {cell.subject === "-" ? (
                            <span style={{ color: "#cbd5e1" }}>—</span>
                          ) : cell.isElective && cell.offerings && cell.offerings.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 800,
                                  color: "#b45309",
                                  background: "#fef3c7",
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  alignSelf: "flex-start",
                                }}
                              >
                                ⚡ {cell.elective_group_name || "PARALLEL ELECTIVE"}
                              </span>
                              {cell.offerings.map((off, oIdx) => (
                                <div
                                  key={oIdx}
                                  title={off.subject_name}
                                  style={{
                                    background: "rgba(255,255,255,0.9)",
                                    padding: "3px 6px",
                                    borderRadius: 4,
                                    fontSize: "0.78rem",
                                    border: "1px solid #fed7aa",
                                    textAlign: "left",
                                  }}
                                >
                                  <b style={{ color: "#9a3412", fontSize: "0.82rem" }}>
                                    {off.subject_code || off.subject_name}
                                  </b>
                                  {(off.room_name || off.room) && (
                                    <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: 1 }}>
                                      📍 {off.room_name || off.room}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div title={cell.subject}>
                              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#1e1b4b" }}>
                                {cell.subject_code || cell.subject}
                              </div>
                              {cell.room && (
                                <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>
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

            {/* SUBJECT DETAILS TABLE */}
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
                  {[
                    "Sl.No",
                    "Course Title",
                    "Code",
                    "Credits",
                    "Course Instructor",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        ...styles.detailsTh,
                        textAlign: "left",
                        padding: "10px 10px",
                        background: "rgb(237, 233, 254)",
                        fontSize: "smaller",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {generationData?.data?.subjects?.map((subject, index) => (
                  <tr key={subject.id}>
                    <td
                      style={{
                        ...styles.detailsTd,
                        padding: "5px 10px",
                        fontSize: "smaller",
                      }}
                    >
                      {index + 1}
                    </td>
                    <td
                      style={{
                        ...styles.detailsTd,
                        padding: "5px 10px",
                        fontSize: "smaller",
                      }}
                    >
                      {subject.subject_name}
                    </td>
                    <td
                      style={{
                        ...styles.detailsTd,
                        padding: "5px 10px",
                        fontSize: "smaller",
                      }}
                    >
                      {subject.subject_code || resolveSubjectCode(subject.subject_name, generationData?.data?.subjects) || "-"}
                    </td>
                    <td
                      style={{
                        ...styles.detailsTd,
                        padding: "5px 10px",
                        fontSize: "smaller",
                      }}
                    >
                      {subject.weekly_hours}
                    </td>
                    <td
                      style={{
                        ...styles.detailsTd,
                        padding: "5px 10px",
                        fontSize: "smaller",
                      }}
                    >
                      {getTeacherName(subject.id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MODIFICATION PANEL */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>✏️ Request Changes</h3>
            <p
              style={{
                color: "#64748b",
                fontSize: "0.85rem",
                marginBottom: 12,
              }}
            >
              Describe what you want to change — the AI will apply it while
              respecting all constraints.
            </p>
            <textarea
              value={modInput}
              onChange={(e) => setModInput(e.target.value)}
              placeholder="e.g. Move Machine Learning from Monday to Wednesday…"
              style={styles.textarea}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <Button
                variant="outlined"
                onClick={handleApplyChanges}
                disabled={modLoading || !modInput.trim()}
                style={{ flex: 1 }}
              >
                {modLoading ? "Applying…" : "Apply Changes"}
              </Button>
              <Button
                variant="contained"
                color={conflicts.length > 0 ? "error" : "success"}
                onClick={handleSave}
                disabled={saving || conflicts.length > 0}
                style={{ flex: 1 }}
              >
                {saving
                  ? "Saving…"
                  : conflicts.length > 0
                  ? "⚠️ Fix Conflicts to Enable Save"
                  : "💾 Save Validated Timetable"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const styles = {
  card: {
    background: "#fff",
    padding: "24px",
    borderRadius: "14px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontWeight: 600,
    fontSize: "0.88rem",
    color: "#374151",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: "0.95rem",
    background: "#f8fafc",
    cursor: "pointer",
  },
  th: {
    border: "1px solid #e2e8f0",
    padding: "10px 8px",
    background: "#f1f5f9",
    fontSize: "0.75rem",
    fontWeight: 700,
    whiteSpace: "nowrap",
    textAlign: "center",
  },
  detailsTh: {
    border: "1px solid #e2e8f0",
    fontWeight: 700,
  },
  detailsTd: {
    border: "1px solid #e2e8f0",
  },
  dayCell: {
    border: "1px solid #e2e8f0",
    padding: "10px 12px",
    fontWeight: 700,
    fontSize: "0.85rem",
    background: "#f8fafc",
    whiteSpace: "nowrap",
  },
  breakCell: {
    border: "1px solid #e2e8f0",
    background: "#fde68a",
    textAlign: "center",
    fontWeight: 700,
    fontSize: "0.8rem",
    padding: "6px",
  },
  classCell: {
    border: "1px solid #e2e8f0",
    padding: "10px 8px",
    textAlign: "center",
    cursor: "grab",
    fontSize: "0.78rem",
    fontWeight: 500,
    minWidth: 90,
  },
  labCell: {
    padding: "10px 12px",
    textAlign: "center",
    cursor: "grab",
    borderRadius: 4,
    verticalAlign: "middle",
  },
  labBadge: {
    display: "inline-block",
    background: "#6366f1",
    color: "#fff",
    borderRadius: 4,
    padding: "1px 6px",
    fontSize: "0.68rem",
    fontWeight: 700,
  },
  textarea: {
    width: "100%",
    minHeight: 80,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: "0.9rem",
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
};

export default GenerateAI;
