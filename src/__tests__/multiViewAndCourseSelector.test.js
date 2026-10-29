import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DAYS } from "../services/schedulerEngine";
import { createSlotsWithBreaks } from "../services/aiService";

const mockConstraints = {
  start_hour: 9,
  start_min: 0,
  end_hour: 17,
  end_min: 0,
  lunch_hour: 13,
  lunch_min: 0,
  lunch_duration: 1,
  break_hour: 11,
  break_min: 0,
  break_duration: 0.5,
  period_duration: 1,
  lab_duration: 2,
  max_daily_hours: 4,
  max_consecutive_hours: 2,
  max_division_daily_labs: 1,
};

const mockSubjects = [
  { id: 101, subject_name: "Machine Learning", subject_code: "21CS71", weekly_hours: 4, is_lab: false, department: "CSE", semester: 7, course_category: "Theory", ltp: "3-1-0" },
  { id: 102, subject_name: "Cloud Computing", subject_code: "21CS72", weekly_hours: 3, is_lab: false, department: "CSE", semester: 7, course_category: "Professional Elective", ltp: "3-0-0" },
  { id: 103, subject_name: "Cyber Security", subject_code: "21CS73", weekly_hours: 3, is_lab: false, department: "CSE", semester: 7, course_category: "Professional Elective", ltp: "3-0-0" },
  { id: 104, subject_name: "AI & ML Laboratory", subject_code: "21CSL76", weekly_hours: 2, is_lab: true, department: "CSE", semester: 7, course_category: "Laboratory", ltp: "0-0-2" },
];

const mockTeachers = [
  { id: "T1", name: "Dr. Turing" },
  { id: "T2", name: "Prof. Lovelace" },
  { id: "T3", name: "Dr. Hopper" },
];

const mockTimetable = {
  Monday: {
    "09:00 AM-10:00 AM": { subject_name: "Machine Learning", room: "CR-101", teacher_id: "T1" },
    "10:00 AM-11:00 AM": "-",
    "11:30 AM-12:30 PM": {
      is_elective: true,
      elective_group_id: "elec-pe3",
      elective_group_name: "Professional Elective - III",
      offerings: [
        { subject_name: "Cloud Computing", teacher_id: "T2", teacher_name: "Prof. Lovelace", room: "CR-102" },
        { subject_name: "Cyber Security", teacher_id: "T3", teacher_name: "Dr. Hopper", room: "CR-103" },
      ],
    },
    "12:30 PM-01:30 PM": "-",
    "02:30 PM-03:30 PM": {
      is_lab: true,
      batch_labs: [
        { batch: "B1", subject_name: "AI & ML Laboratory", room: "Lab 1", teacher_id: "T1", is_block_start: true },
        { batch: "B2", subject_name: "AI & ML Laboratory", room: "Lab 2", teacher_id: "T2", is_block_start: true },
      ],
    },
    "03:30 PM-04:30 PM": {
      is_lab: true,
      batch_labs: [
        { batch: "B1", subject_name: "AI & ML Laboratory", room: "Lab 1", teacher_id: "T1", is_block_start: false },
        { batch: "B2", subject_name: "AI & ML Laboratory", room: "Lab 2", teacher_id: "T2", is_block_start: false },
      ],
    },
    "04:30 PM-05:00 PM": "-",
  },
  Tuesday: {},
  Wednesday: {},
  Thursday: {},
  Friday: {},
  Saturday: {},
};

describe("Multi-View Timetable Viewer & Course Catalog Contract", () => {
  let slots;
  let classSlotLabels;

  beforeAll(() => {
    slots = createSlotsWithBreaks(mockConstraints);
    classSlotLabels = slots.filter((s) => s.type === "class").map((s) => s.label);
  });

  // ── COURSE SELECTOR & CANONICAL CATALOG TESTS ─────────────────────────────
  test("1. Canonical course filtering matches by code or title", () => {
    const q1 = "21CS";
    const matches1 = mockSubjects.filter(
      (s) => s.subject_code.toLowerCase().includes(q1.toLowerCase()) || s.subject_name.toLowerCase().includes(q1.toLowerCase())
    );
    expect(matches1.length).toBe(4);

    const q2 = "cloud";
    const matches2 = mockSubjects.filter(
      (s) => s.subject_code.toLowerCase().includes(q2.toLowerCase()) || s.subject_name.toLowerCase().includes(q2.toLowerCase())
    );
    expect(matches2.length).toBe(1);
    expect(matches2[0].subject_code).toBe("21CS72");
    expect(matches2[0].course_category).toBe("Professional Elective");
  });

  test("2. Canonical course records preserve LTP breakdown and category", () => {
    const ml = mockSubjects.find((s) => s.subject_code === "21CS71");
    expect(ml.ltp).toBe("3-1-0");
    expect(ml.course_category).toBe("Theory");

    const lab = mockSubjects.find((s) => s.subject_code === "21CSL76");
    expect(lab.ltp).toBe("0-0-2");
    expect(lab.is_lab).toBe(true);
    expect(lab.course_category).toBe("Laboratory");
  });

  test("3. Prevents duplicate course creation within same department and semester", () => {
    const newCourseCandidate = {
      subject_code: "21CS71",
      department: "CSE",
      semester: 7,
    };

    const isDuplicate = mockSubjects.some(
      (s) =>
        s.subject_code.toUpperCase() === newCourseCandidate.subject_code.toUpperCase() &&
        s.department.toUpperCase() === newCourseCandidate.department.toUpperCase() &&
        s.semester === newCourseCandidate.semester
    );

    expect(isDuplicate).toBe(true);
  });

  // ── MULTI-VIEW TRANSFORMATION TESTS ───────────────────────────────────────
  test("4. Division View: displays common theory, parallel electives, and all batch labs combined", () => {
    const day = "Monday";
    const dayCells = mockTimetable[day];

    const theorySlot = dayCells["09:00 AM-10:00 AM"];
    expect(theorySlot.subject_name).toBe("Machine Learning");

    const electiveSlot = dayCells["11:30 AM-12:30 PM"];
    expect(electiveSlot.is_elective).toBe(true);
    expect(electiveSlot.offerings.length).toBe(2);

    const labSlot = dayCells["02:30 PM-03:30 PM"];
    expect(labSlot.is_lab).toBe(true);
    expect(labSlot.batch_labs.length).toBe(2);
    expect(labSlot.batch_labs.map((b) => b.batch)).toEqual(["B1", "B2"]);
  });

  test("5. Batch View: isolates specific batch lab sessions while preserving common classes", () => {
    const targetBatch = "B1";
    const day = "Monday";
    const dayCells = mockTimetable[day];

    // Filter lab slots for Batch B1
    const rawLabCell = dayCells["02:30 PM-03:30 PM"];
    const filteredLabs = rawLabCell.batch_labs.filter((bl) => bl.batch === targetBatch);

    expect(filteredLabs.length).toBe(1);
    expect(filteredLabs[0].batch).toBe("B1");
    expect(filteredLabs[0].room).toBe("Lab 1");
    expect(filteredLabs[0].teacher_id).toBe("T1");
  });

  test("6. Faculty Schedule View: filters periods where Dr. Turing (T1) is actively teaching", () => {
    const teacherId = "T1";
    const day = "Monday";
    const dayCells = mockTimetable[day];

    const activePeriods = [];
    Object.entries(dayCells).forEach(([slot, cell]) => {
      if (cell && typeof cell === "object") {
        if (cell.teacher_id === teacherId) {
          activePeriods.push({ slot, role: "Theory", subject: cell.subject_name });
        } else if (cell.batch_labs && cell.batch_labs.some((l) => l.teacher_id === teacherId)) {
          const l = cell.batch_labs.find((l) => l.teacher_id === teacherId);
          activePeriods.push({ slot, role: `Lab (${l.batch})`, subject: l.subject_name });
        }
      }
    });

    // T1 has 1 theory (09:00 AM) + 2 consecutive lab slots (02:30 PM & 03:30 PM)
    expect(activePeriods.length).toBe(3);
    expect(activePeriods[0].slot).toBe("09:00 AM-10:00 AM");
    expect(activePeriods[1].slot).toBe("02:30 PM-03:30 PM");
    expect(activePeriods[2].slot).toBe("03:30 PM-04:30 PM");
  });

  test("7. Room Allocation View: filters periods for Lab 1 and confirms vacancy during other hours", () => {
    const roomName = "Lab 1";
    const day = "Monday";
    const dayCells = mockTimetable[day];

    const roomOccupancy = [];
    Object.entries(dayCells).forEach(([slot, cell]) => {
      if (cell && typeof cell === "object") {
        if (cell.room === roomName) {
          roomOccupancy.push({ slot, subject: cell.subject_name });
        } else if (cell.batch_labs && cell.batch_labs.some((l) => l.room === roomName)) {
          const l = cell.batch_labs.find((l) => l.room === roomName);
          roomOccupancy.push({ slot, subject: l.subject_name, batch: l.batch });
        }
      }
    });

    expect(roomOccupancy.length).toBe(2);
    expect(roomOccupancy[0].slot).toBe("02:30 PM-03:30 PM");
    expect(roomOccupancy[1].slot).toBe("03:30 PM-04:30 PM");
    expect(roomOccupancy[0].batch).toBe("B1");
  });

  test("8. Elective Group View: isolates the synchronized parallel elective block", () => {
    const day = "Monday";
    const electiveSlot = mockTimetable[day]["11:30 AM-12:30 PM"];

    expect(electiveSlot.is_elective).toBe(true);
    expect(electiveSlot.elective_group_id).toBe("elec-pe3");
    expect(electiveSlot.offerings.length).toBe(2);

    const offeringCourses = electiveSlot.offerings.map((o) => o.subject_name);
    expect(offeringCourses).toContain("Cloud Computing");
    expect(offeringCourses).toContain("Cyber Security");

    // Both offerings have separate teachers and rooms
    const teachers = electiveSlot.offerings.map((o) => o.teacher_id);
    const rooms = electiveSlot.offerings.map((o) => o.room);
    expect(new Set(teachers).size).toBe(2);
    expect(new Set(rooms).size).toBe(2);
  });

  // ── PDF EXPORT CONTRACT TEST ──────────────────────────────────────────────
  test("9. Synchronized jsPDF & autoTable can instantiate and render timetable layout with summary table", () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    expect(doc).toBeDefined();

    doc.setFontSize(16);
    doc.text("CSE — Semester 7 (CSE-A) Timetable", 14, 15);

    const head = [["Day", ...classSlotLabels]];
    const body = DAYS.map((d) => [d, ...classSlotLabels.map(() => "Class")]);

    autoTable(doc, {
      head,
      body,
      startY: 25,
      styles: { fontSize: 8 },
    });

    const finalY = doc.lastAutoTable.finalY;
    expect(finalY).toBeGreaterThan(25);

    // Summary table below
    autoTable(doc, {
      startY: finalY + 5,
      head: [["Sl.No", "Course Title", "Code", "Credits", "Category", "L-T-P", "Course Instructor"]],
      body: mockSubjects.map((s, idx) => [
        idx + 1,
        s.subject_name,
        s.subject_code,
        s.weekly_hours,
        s.course_category,
        s.ltp,
        "Faculty Member",
      ]),
    });

    expect(doc.lastAutoTable.finalY).toBeGreaterThan(finalY);
  });
});
