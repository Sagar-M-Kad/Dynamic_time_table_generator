import { supabase } from "../supabaseClient";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  generateDeterministicTimetable,
  validateSchedule,
  calculateTimetableQualityScore,
  repairSchedule,
} from "./schedulerEngine";
import { fetchAcademicStructure } from "./academicStructureService";

// API key loaded from .env — never hardcode secrets in source files.
const FALLBACK_API_KEY = process.env.REACT_APP_GEMINI_KEY || "";
let _activeApiKey = null;

let genAI = new GoogleGenerativeAI(FALLBACK_API_KEY);

let model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

(async () => {
  try {
    const { data } = await supabase
      .from("api_keys")
      .select("api_key")
      .eq("is_active", true)
      .maybeSingle();
    if (data?.api_key) {
      _activeApiKey = data.api_key;
      console.log("✅ Using DB API KEY:");
      genAI = new GoogleGenerativeAI(_activeApiKey);
      model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });
    } else {
      console.log("⚠️ Using fallback API KEY:");
    }
  } catch (e) {
    console.warn("[aiService] Could not load API key:", e.message);
    console.log("⚠️ Using fallback API KEY (error):");
  }
})();

export const setActiveApiKey = (key) => {
  _activeApiKey = key;
  console.log("🔁 Switched API KEY:");
  genAI = new GoogleGenerativeAI(_activeApiKey);
  model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
  });
};

const parseJSON = (text) => {
  try {
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("AI RAW RESPONSE:", text);
    throw new Error("Invalid JSON from AI – could not parse timetable.");
  }
};

export const fetchGenerationData = async (semester, department) => {
  const { data: subjects, error: subErr } = await supabase
    .from("subjects")
    .select("*")
    .eq("semester", parseInt(semester))
    .eq("department", department);

  if (subErr) throw new Error("Failed to fetch subjects: " + subErr.message);
  if (!subjects || subjects.length === 0)
    throw new Error(
      `No subjects found for ${department} Semester ${semester}. Please add subjects first.`
    );

  const { data: constraints, error: conErr } = await supabase
    .from("testconstraints")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (conErr || !constraints)
    throw new Error(
      "Constraints not found. Please add a row in testConstraints."
    );

  const { data: teacherLinks, error: tlErr } = await supabase
    .from("teacher_subjects")
    .select("*, subjects(*), teachers(*)");

  if (tlErr) console.warn("Could not fetch teacher links:", tlErr.message);

  const { data: teacherBusy, error: tbErr } = await supabase
    .from("teacher_availability")
    .select("*")
    .eq("is_busy", true);

  if (tbErr)
    console.warn("Could not fetch teacher availability:", tbErr.message);

  const { data: rooms, error: roomErr } = await supabase
    .from("rooms")
    .select("*")
    .eq("department", department);

  if (roomErr) console.warn("Could not fetch rooms:", roomErr.message);

  return {
    subjects: subjects || [],
    constraints,
    resources: {
      teacherLinks: teacherLinks || [],
      rooms: rooms || [],
    },
    busyMap: {
      teacherBusy: teacherBusy || [],
    },
  };
};

export const createSlotsWithBreaks = (c) => {
  const slots = [];

  const toMins = (h, m) => parseInt(h) * 60 + parseInt(m);
  const fromMins = (total) => {
    const h = Math.floor(total / 60);
    const m = total % 60;
    const date = new Date(2026, 0, 1, h, m);
    // Force 12-hour AM/PM format regardless of system locale
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  let curr = toMins(c.start_hour, c.start_min);
  const end = toMins(c.end_hour, c.end_min);
  const lunchStart = toMins(c.lunch_hour, c.lunch_min);
  const breakStart = toMins(c.break_hour, c.break_min);

  // duration fields are in hours (possibly fractional like 0.5)
  const periodMins = Math.round(parseFloat(c.period_duration) * 60);
  const lunchMins = Math.round(parseFloat(c.lunch_duration) * 60);
  const breakMins = Math.round(parseFloat(c.break_duration) * 60);

  const inserted = { lunch: false, break: false };

  while (curr < end) {
    if (!inserted.lunch && curr === lunchStart) {
      slots.push({ type: "lunch", label: "LUNCH", span: 1 });
      curr += lunchMins;
      inserted.lunch = true;
      continue;
    }
    if (!inserted.break && curr === breakStart) {
      slots.push({ type: "break", label: "BREAK", span: 1 });
      curr += breakMins;
      inserted.break = true;
      continue;
    }

    const next = curr + periodMins;
    if (next > end) break;

    const label = `${fromMins(curr)}-${fromMins(next)}`;
    slots.push({ type: "class", label });
    curr = next;
  }

  return slots;
};

/**
 * Returns the combined display label for all labs.
 * e.g.  ["WEB LAB", "CN LAB"]  →  "WEB LAB/CN LAB"
 */
export const getLabLabel = (labs) =>
  labs.length > 1
    ? labs.map((l) => l.subject_name).join("/")
    : labs.length === 1
    ? labs[0].subject_name
    : null;

/**
 * Given the full ordered classSlots array (pre-lunch then post-lunch),
 * find the index of `slotLabel` — used to check adjacency correctly.
 */
const slotIndexIn = (orderedSlots, label) => orderedSlots.indexOf(label);

export const buildTimetableWithJS = (subjects, slots, constraints) => {
  const DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const labDuration = parseInt(constraints.lab_duration) || 2;

  // All class slot labels in the order they appear in the day
  const classSlots = slots
    .filter((s) => s.type === "class")
    .map((s) => s.label);

  // Pre-lunch / post-lunch split — used for priority ordering only
  const lunchIdx = slots.findIndex((s) => s.type === "lunch");
  const preLunchSlots = slots
    .slice(0, lunchIdx === -1 ? slots.length : lunchIdx)
    .filter((s) => s.type === "class")
    .map((s) => s.label);
  const postLunchSlots = slots
    .slice(lunchIdx === -1 ? slots.length : lunchIdx + 1)
    .filter((s) => s.type === "class")
    .map((s) => s.label);

  // orderedSlots = pre-lunch first, then post-lunch — used for fill priority
  const orderedSlots = [...preLunchSlots, ...postLunchSlots];

  // Init timetable: every class slot = "-"
  const timetable = {};
  DAYS.forEach((day) => {
    timetable[day] = {};
    classSlots.forEach((slot) => (timetable[day][slot] = "-"));
  });

  const remaining = {};
  subjects.forEach((s) => (remaining[s.subject_name] = s.weekly_hours));

  const labs = subjects.filter((s) => s.is_lab);
  const theories = subjects.filter((s) => !s.is_lab);

  // Combined label shown in every lab slot cell  e.g. "WEB LAB/CN LAB"
  const labLabel = getLabLabel(labs);

  // Track what's placed per day (avoid same-subject twice on same day)
  const dayUsed = {};
  DAYS.forEach((d) => (dayUsed[d] = new Set()));

  // ── STEP 1: Place each lab in exactly `labDuration` TRULY CONSECUTIVE slots ──
  // We scan the FULL slots array (including break/lunch markers).
  // A window is valid only when `labDuration` class slots appear back-to-back
  // with NO break or lunch between them — prevents 09:00-10:00 + 10:30-11:30.
  // Priority: Morning (before BREAK) → After Break → After Lunch
  // Each new lab day prefers a DIFFERENT time window (no repeated 8-10 Mon+Tue).

  // Determine the boundary indices for BREAK and LUNCH in the full slots array
  const breakIdx = slots.findIndex((s) => s.type === "break");
  const lunchIdx2 = slots.findIndex((s) => s.type === "lunch");

  // Build Sets for each zone
  const morningSlotSet = new Set(
    slots
      .slice(0, breakIdx === -1 ? slots.length : breakIdx)
      .filter((s) => s.type === "class")
      .map((s) => s.label)
  );
  const afterBreakSlotSet = new Set(
    slots
      .slice(
        breakIdx === -1 ? 0 : breakIdx + 1,
        lunchIdx2 === -1 ? slots.length : lunchIdx2
      )
      .filter((s) => s.type === "class")
      .map((s) => s.label)
  );
  // afterLunch = anything not in morning or afterBreak

  // Build all truly consecutive windows from the full slot list
  const allLabWindows = []; // each entry: [slotLabel, slotLabel, ...]
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].type !== "class") continue;
    const win = [];
    let j = i;
    while (win.length < labDuration && j < slots.length) {
      if (slots[j].type === "class") {
        win.push(slots[j].label);
        j++;
      } else break; // hit break or lunch — not consecutive
    }
    if (win.length === labDuration) allLabWindows.push(win);
  }

  // Classify each window by its starting slot's zone
  const morningWindows = allLabWindows.filter((w) => morningSlotSet.has(w[0]));
  const afterBreakWindows = allLabWindows.filter((w) =>
    afterBreakSlotSet.has(w[0])
  );
  const afterLunchWindows = allLabWindows.filter(
    (w) => !morningSlotSet.has(w[0]) && !afterBreakSlotSet.has(w[0])
  );

  let labDayIdx = 0;
  const usedLabWindowKeys = new Set(); // JSON.stringify(window) for used windows

  labs.forEach((lab) => {
    let placed = false;

    for (let di = 0; di < DAYS.length && !placed; di++) {
      const day = DAYS[(labDayIdx + di) % DAYS.length];

      // Priority: unused morning → unused afterBreak → unused afterLunch
      //           → used morning → used afterBreak → used afterLunch
      const ordered = [
        ...morningWindows.filter(
          (w) => !usedLabWindowKeys.has(JSON.stringify(w))
        ),
        ...afterBreakWindows.filter(
          (w) => !usedLabWindowKeys.has(JSON.stringify(w))
        ),
        ...afterLunchWindows.filter(
          (w) => !usedLabWindowKeys.has(JSON.stringify(w))
        ),
        ...morningWindows.filter((w) =>
          usedLabWindowKeys.has(JSON.stringify(w))
        ),
        ...afterBreakWindows.filter((w) =>
          usedLabWindowKeys.has(JSON.stringify(w))
        ),
        ...afterLunchWindows.filter((w) =>
          usedLabWindowKeys.has(JSON.stringify(w))
        ),
      ];

      for (const block of ordered) {
        if (placed) break;
        // All slots in the block must be free on this day
        if (!block.every((sl) => timetable[day][sl] === "-")) continue;

        // Place lab label in every slot of the block
        block.forEach((sl) => {
          timetable[day][sl] = labLabel;
        });
        dayUsed[day].add(labLabel);
        remaining[lab.subject_name] = Math.max(
          0,
          (remaining[lab.subject_name] || 0) - 1
        );
        usedLabWindowKeys.add(JSON.stringify(block)); // mark window as used
        placed = true;
        labDayIdx = (labDayIdx + di + 1) % DAYS.length;
      }
    }
  });

  // ── STEP 2: Round-robin theory placement ───────────────────────────────
  // Iterate orderedSlots (pre-lunch first) so mornings fill before afternoons.
  // For each slot, rotate which day we start from (dayOffset = slotIdx % 6)
  // so that the same time column gets DIFFERENT subjects across days.
  for (let slotIdx = 0; slotIdx < orderedSlots.length; slotIdx++) {
    const slot = orderedSlots[slotIdx];
    const dayOffset = slotIdx % DAYS.length;

    for (let di = 0; di < DAYS.length; di++) {
      const day = DAYS[(dayOffset + di) % DAYS.length];
      if (timetable[day][slot] !== "-") continue; // already occupied

      const candidates = theories.filter(
        (s) =>
          remaining[s.subject_name] > 0 && !dayUsed[day].has(s.subject_name)
      );
      if (candidates.length === 0) continue;

      const pick = candidates[(slotIdx + di) % candidates.length];
      timetable[day][slot] = pick.subject_name;
      remaining[pick.subject_name]--;
      dayUsed[day].add(pick.subject_name);
    }
  }

  // ── STEP 3: Guarantee every day has at least one class ─────────────────
  DAYS.forEach((emptyDay) => {
    const hasClass = classSlots.some((sl) => timetable[emptyDay][sl] !== "-");
    if (hasClass) return;

    let filled = false;

    // Use a subject that still has remaining quota
    for (const s of theories) {
      if (remaining[s.subject_name] > 0) {
        const targetSlot = orderedSlots.find(
          (sl) => timetable[emptyDay][sl] === "-"
        );
        if (!targetSlot) break;
        timetable[emptyDay][targetSlot] = s.subject_name;
        remaining[s.subject_name]--;
        dayUsed[emptyDay].add(s.subject_name);
        filled = true;
        break;
      }
    }

    // Borrow from a donor day that has 2+ theory classes
    if (!filled) {
      for (const donor of DAYS) {
        if (donor === emptyDay) continue;
        const donorSlots = classSlots.filter(
          (sl) =>
            timetable[donor][sl] !== "-" && timetable[donor][sl] !== labLabel
        );
        if (donorSlots.length <= 1) continue;
        const donorSlot = donorSlots[donorSlots.length - 1];
        const subjectToMove = timetable[donor][donorSlot];
        if (dayUsed[emptyDay].has(subjectToMove)) continue;
        const freeSlot = orderedSlots.find(
          (sl) => timetable[emptyDay][sl] === "-"
        );
        if (!freeSlot) continue;
        timetable[emptyDay][freeSlot] = subjectToMove;
        timetable[donor][donorSlot] = "-";
        dayUsed[emptyDay].add(subjectToMove);
        filled = true;
        break;
      }
    }
  });

  return timetable;
};

export const constructGeminiPrompt = (
  subjects,
  slots,
  department,
  constraints,
  jsTimetable
) => {
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const classSlots = slots
    .filter((s) => s.type === "class")
    .map((s) => s.label);
  const labDuration = parseInt(constraints.lab_duration) || 2;

  const cleanSubjects = subjects.map((s) => ({
    name: s.subject_name,
    hours: s.weekly_hours,
    isLab: s.is_lab || false,
  }));

  const labs = cleanSubjects.filter((s) => s.isLab);
  const labLabel =
    labs.length > 1
      ? labs.map((l) => l.name).join("/")
      : labs.length === 1
      ? labs[0].name
      : null;

  return `You are an expert academic timetable validator and patcher.

  A JS scheduling algorithm already generated this timetable. Your job is ONLY to:
  1. Check for any remaining rule violations
  2. Fix ONLY broken slots — do NOT reshuffle correct slots
  3. Return the full corrected timetable

  Department: ${department}

  ===== CURRENT TIMETABLE =====
  ${JSON.stringify(jsTimetable, null, 2)}

  ===== SUBJECTS & WEEKLY LIMITS =====
  ${JSON.stringify(cleanSubjects)}

  ===== RULES =====
  1. Every day MUST have at least one class (not all dashes)
  2. No theory subject appears more than once per day
  3. Pre-lunch slots must be filled BEFORE post-lunch — if pre-lunch is "-" but post-lunch has a subject on the same day, swap them
  4. No same subject in the same time column for more than 2 consecutive days
  5. Lab ("${
    labLabel || "LAB"
  }") must occupy exactly ${labDuration} CONSECUTIVE slots on the SAME day (no break or lunch between them)
  6. No subject exceeds its weekly_hours total
  7. CRITICAL: DO NOT move or reschedule any lab ("${
    labLabel || "LAB"
  }") sessions.
     Lab sessions are already correctly placed at DIFFERENT time windows on each day.
     Keep every lab cell EXACTLY where it appears in the current timetable.

  ===== OUTPUT =====
  Return ONLY the complete corrected timetable as strict JSON. No markdown. No explanation.
  `;
};

export const generateWithGemini = async (prompt) => {
  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    });
    const text = result.response.text();
    return parseJSON(text);
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("AI generation failed: " + error.message);
  }
};

const buildSubjectTeacherMap = (teacherLinks) => {
  const map = {};
  (teacherLinks || []).forEach((link) => {
    const name = link.subjects?.subject_name;
    if (name) map[name] = link.teacher_id;
  });
  return map;
};

/**
 * Full conflict detection.
 * Returns array of conflict strings.
 */
export const validateTimetable = (
  timetable,
  subjects,
  teacherLinks,
  teacherBusy,
  constraints = {},
  orderedSlots = null  // ordered slot labels array from createSlotsWithBreaks
) => {
  const conflicts = [];
  const subjectTeacherMap = buildSubjectTeacherMap(teacherLinks);

  const busySet = new Set(
    (teacherBusy || []).map(
      (b) => `${b.teacher_id}_${b.day_of_week}_${b.time_slot}`
    )
  );

  const subjectWeeklyCount = {};
  subjects.forEach((s) => (subjectWeeklyCount[s.subject_name] = 0));

  const teacherSlotUsage = {};

  // Combined lab label — cells with this value are intentionally repeated across consecutive slots
  const labSubjectList = subjects.filter((s) => s.is_lab);
  const combinedLabLabel =
    labSubjectList.length > 0 ? getLabLabel(labSubjectList) : null;

  // Teacher Workload Guardrails — use passed constraints, not localStorage
  const maxDailyHours = parseInt(constraints.max_daily_hours) || 4;
  const maxConsecHours = parseInt(constraints.max_consecutive_hours) || 2;
  const teacherDailyHours = {};

  for (const day in timetable) {
    const daySubjectSeen = new Set();
    const teacherConsecutiveCount = {};

    for (const slot in timetable[day]) {
      const subject = timetable[day][slot];
      if (!subject || subject === "-") {
        Object.keys(teacherConsecutiveCount).forEach(
          (t) => (teacherConsecutiveCount[t] = 0)
        );
        continue;
      }

      // Weekly count
      if (subjectWeeklyCount[subject] !== undefined) {
        subjectWeeklyCount[subject]++;
      }

      // isLab = combined label match OR individual subject marked is_lab
      const subjectMeta = subjects.find((s) => s.subject_name === subject);
      const isLab =
        (combinedLabLabel && subject === combinedLabLabel) ||
        subjectMeta?.is_lab ||
        false;

      // Skip duplicate check for lab cells — multiple slots intentionally share the same label
      if (!isLab) {
        if (daySubjectSeen.has(subject)) {
          conflicts.push(
            `DUPLICATE: "${subject}" appears more than once on ${day}`
          );
        } else {
          daySubjectSeen.add(subject);
        }
      }

      // Teacher checks
      const teacherId = subjectTeacherMap[subject];
      if (teacherId) {
        const key = `${teacherId}_${day}_${slot}`;

        if (busySet.has(key)) {
          conflicts.push(
            `TEACHER_BUSY: Teacher for "${subject}" is unavailable on ${day} at ${slot}`
          );
        }

        if (teacherSlotUsage[key] && teacherSlotUsage[key] !== subject) {
          conflicts.push(
            `TEACHER_CONFLICT: Teacher for "${subject}" is already teaching "${teacherSlotUsage[key]}" on ${day} at ${slot}`
          );
        }
        teacherSlotUsage[key] = subject;

        // Daily Workload Check
        if (!teacherDailyHours[teacherId]) teacherDailyHours[teacherId] = {};
        teacherDailyHours[teacherId][day] = (teacherDailyHours[teacherId][day] || 0) + 1;
        if (teacherDailyHours[teacherId][day] > maxDailyHours) {
          conflicts.push(
            `TEACHER_OVERLOAD: Teacher for "${subject}" exceeds daily limit of ${maxDailyHours} hrs on ${day}`
          );
        }

        // Consecutive Hours Check
        teacherConsecutiveCount[teacherId] = (teacherConsecutiveCount[teacherId] || 0) + 1;
        if (teacherConsecutiveCount[teacherId] > maxConsecHours) {
          conflicts.push(
            `TEACHER_FATIGUE: Teacher for "${subject}" exceeds consecutive limit of ${maxConsecHours} hrs on ${day}`
          );
        }
      }
    }
  }

  // Weekly hours over-limit
  subjects.forEach((s) => {
    const actual = subjectWeeklyCount[s.subject_name] || 0;
    if (actual > s.weekly_hours) {
      conflicts.push(
        `OVER_LIMIT: "${s.subject_name}" has ${actual} slots but weekly limit is ${s.weekly_hours}`
      );
    }
  });

  // Lab continuity check — use orderedSlots to guarantee correct time ordering.
  // Object.keys() order is not guaranteed for time-string keys across all runtimes.
  const labsInSubjects = subjects.filter((s) => s.is_lab);
  if (labsInSubjects.length > 0) {
    const combinedLabel = getLabLabel(labsInSubjects);
    for (const day in timetable) {
      // Use the ordered slot labels if provided, otherwise fall back to Object.keys()
      const slotKeys = orderedSlots
        ? orderedSlots.filter((sl) => timetable[day][sl] !== undefined)
        : Object.keys(timetable[day]);

      for (let i = 0; i < slotKeys.length; i++) {
        const val = timetable[day][slotKeys[i]];
        if (val !== combinedLabel) continue;

        const prevVal = i > 0 ? timetable[day][slotKeys[i - 1]] : null;
        if (prevVal === combinedLabel) continue; // middle/end of block — OK

        // Start of a lab block: next slot must also be the lab
        const nextVal =
          i + 1 < slotKeys.length ? timetable[day][slotKeys[i + 1]] : null;
        if (nextVal !== combinedLabel) {
          conflicts.push(
            `LAB_NOT_CONSECUTIVE: Lab block on ${day} at ${slotKeys[i]} is not followed by a consecutive lab slot`
          );
        }
      }
    }
  }

  return conflicts;
};

/**
 * Cross-division teacher conflict check.
 * Loads all saved timetables for the same department (excluding the current generation's
 * semester+division combination) and checks if any teacher is already assigned
 * to a slot that this new timetable also uses.
 *
 * Returns an array of conflict strings.
 */
export const checkCrossDivisionConflicts = async (
  newTimetable,
  teacherLinks,
  currentSemester,
  currentDivision
) => {
  const conflicts = [];

  try {
    // Fetch all other saved timetables (different division or semester)
    const { data: savedTimetables } = await supabase
      .from("saved_timetables")
      .select("id, department, semester, division, timetable_json")
      .neq("semester", parseInt(currentSemester));

    // Also check same-semester different divisions if division tracking is present
    const { data: sameSemOther } = await supabase
      .from("saved_timetables")
      .select("id, department, semester, division, timetable_json")
      .eq("semester", parseInt(currentSemester))
      .neq("division", currentDivision || "");

    const allOther = [...(savedTimetables || []), ...(sameSemOther || [])];

    if (allOther.length === 0) return conflicts;

    // Build subject→teacher map for the NEW timetable
    const subjectTeacherMap = buildSubjectTeacherMap(teacherLinks);

    // Build a set: "teacherId_day_slot" for all slots in the new timetable
    const newTeacherSlots = new Set();
    for (const day in newTimetable) {
      for (const slot in newTimetable[day]) {
        const subject = newTimetable[day][slot];
        if (!subject || subject === "-") continue;
        const teacherId = subjectTeacherMap[subject];
        if (teacherId) newTeacherSlots.add(`${teacherId}_${day}_${slot}`);
      }
    }

    // Check each existing timetable for overlapping teacher slots
    for (const saved of allOther) {
      const otherTT = saved.timetable_json;
      if (!otherTT || typeof otherTT !== "object") continue;

      const label = saved.division
        ? `${saved.department || ""} Sem ${saved.semester} ${saved.division}`
        : `Sem ${saved.semester}`;

      for (const day in otherTT) {
        for (const slot in otherTT[day]) {
          const subject = otherTT[day][slot];
          if (!subject || subject === "-") continue;

          // We only know teacher IDs for this division's teacher links.
          // Check if a teacher from our teacherLinks is already used in the other timetable.
          for (const link of teacherLinks) {
            const subName = link.subjects?.subject_name;
            if (!subName) continue;
            if (otherTT[day][slot] !== subName) continue;
            const teacherId = link.teacher_id;
            if (!teacherId) continue;

            if (newTeacherSlots.has(`${teacherId}_${day}_${slot}`)) {
              conflicts.push(
                `CROSS_DIVISION_CONFLICT: Teacher for "${subName}" is already assigned in [${label}] on ${day} at ${slot}`
              );
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[checkCrossDivisionConflicts] Could not run check:", err.message);
  }

  return conflicts;
};

export const fixTimetableWithJS = (timetable, subjects) => {
  const result = JSON.parse(JSON.stringify(timetable));

  // 1. Count current usage
  const counts = {};
  subjects.forEach((s) => (counts[s.subject_name] = 0));

  for (const day in result) {
    for (const slot in result[day]) {
      const sub = result[day][slot];
      if (counts[sub] !== undefined) counts[sub]++;
    }
  }

  // 2. Remove over-limit occurrences
  for (const day in result) {
    for (const slot in result[day]) {
      const sub = result[day][slot];
      const meta = subjects.find((s) => s.subject_name === sub);
      if (meta && counts[sub] > meta.weekly_hours) {
        result[day][slot] = "-";
        counts[sub]--;
      }
    }
  }

  // 3. Fix duplicate-per-day (theory only — skip combined lab labels)
  const labSubjects = subjects.filter((s) => s.is_lab);
  const combinedLabLabel =
    labSubjects.length > 0 ? getLabLabel(labSubjects) : null;

  for (const day in result) {
    const seen = new Set();
    for (const slot in result[day]) {
      const sub = result[day][slot];
      if (!sub || sub === "-") continue;
      // Skip lab combined label — multiple slots intentionally carry the same value
      if (combinedLabLabel && sub === combinedLabLabel) continue;
      const meta = subjects.find((s) => s.subject_name === sub);
      if (meta?.is_lab) continue;
      if (seen.has(sub)) {
        result[day][slot] = "-";
        if (counts[sub] !== undefined) counts[sub]--;
      } else {
        seen.add(sub);
      }
    }
  }

  return result;
};

export const constructConflictFixPrompt = (timetable, conflicts, subjects) => {
  return `You are an expert timetable conflict resolver.

===== CURRENT TIMETABLE =====
${JSON.stringify(timetable, null, 2)}

===== CONFLICTS TO FIX =====
${conflicts.map((c, i) => `${i + 1}. ${c}`).join("\n")}

===== SUBJECT WEEKLY LIMITS =====
${JSON.stringify(
  subjects.map((s) => ({
    name: s.subject_name,
    max: s.weekly_hours,
    isLab: s.is_lab,
  })),
  null,
  2
)}

===== YOUR TASK =====
Fix ONLY the listed conflicts. Keep everything else identical.

Rules:
1. Resolve ALL conflicts listed above
2. Do NOT exceed any subject's weekly limit
3. No subject can appear twice on the same day (except labs which span consecutive slots)
4. Labs MUST remain in consecutive slots on the same day
5. Maintain all slot keys exactly as they appear
6. Use "-" for truly empty slots

Strategy:
- TEACHER_CONFLICT / TEACHER_BUSY: move the subject to a free slot on another day
- DUPLICATE: remove the extra occurrence (set to "-")
- OVER_LIMIT: remove excess occurrences (set to "-")
- LAB_NOT_CONSECUTIVE: place the lab in two consecutive free slots on the same day

Return ONLY the complete updated timetable as strict JSON.
NO explanation, NO markdown, ONLY JSON.
`;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR WITH BATCH-AWARE DETERMINISTIC ENGINE
// ─────────────────────────────────────────────────────────────────────────────
export const generateTimetableFull = async (
  semester,
  department,
  onStatusUpdate,
  division = "Section A"
) => {
  const status = (msg) => {
    console.log("[TimetableGen]", msg);
    if (onStatusUpdate) onStatusUpdate(msg);
  };

  // 1. Fetch all data
  status("Fetching subjects, constraints, teachers & rooms…");
  const data = await fetchGenerationData(semester, department);

  // 2. Fetch academic structure to resolve configured batches
  status("Loading academic structure & batches for " + department + " Sem " + semester + "…");
  let batches = ["B1", "B2"];
  try {
    const academicData = await fetchAcademicStructure();
    const divObj = (academicData.divisions || []).find(
      (d) =>
        d.department_code?.toUpperCase() === department?.toUpperCase() &&
        parseInt(d.semester) === parseInt(semester) &&
        (d.name === division || d.name?.includes(division) || division?.includes(d.name))
    );
    if (divObj) {
      const configuredBatches = (academicData.batches || [])
        .filter((b) => b.division_id === divObj.id && b.is_active !== false)
        .map((b) => b.name);
      if (configuredBatches.length > 0) batches = configuredBatches;
    }
  } catch (e) {
    console.warn("Could not load dynamic batches, using defaults:", e.message);
  }

  // 3. Build slot list
  status("Building time slots & 2-hour consecutive lab windows…");
  const slots = createSlotsWithBreaks(data.constraints);
  const orderedClassSlots = slots
    .filter((s) => s.type === "class")
    .map((s) => s.label);

  // 4. Fetch other saved timetables for cross-division checks
  let otherTimetables = [];
  try {
    const { data: saved } = await supabase
      .from("saved_timetables")
      .select("id, department, semester, division, timetable_json");
    otherTimetables = saved || [];
  } catch (e) {
    console.warn("Could not fetch other timetables:", e.message);
  }

  // 5. Run Deterministic Constraint Engine
  status(`Executing constraint-satisfaction scheduler for ${division} with batches [${batches.join(", ")}]…`);
  const engineResult = generateDeterministicTimetable({
    subjects: data.subjects,
    slots,
    constraints: data.constraints,
    resources: data.resources,
    busyMap: data.busyMap,
    academicScope: { department, semester: parseInt(semester), division, batches },
    existingOtherTimetables: otherTimetables,
  });

  let timetable = engineResult.timetable;
  let validation = engineResult.validation;
  let qualityScore = engineResult.qualityScore;

  if (engineResult.isInfeasible) {
    status(`❌ ${engineResult.error}`);
    return {
      timetable: null,
      slots,
      data,
      validation,
      qualityScore,
      remainingConflicts: [engineResult.error],
      orderedClassSlots,
      batches,
      theoryRoom: null,
      isInfeasible: true,
      error: engineResult.error,
    };
  }

  // If initial schedule has violations, attempt automatic repair
  if (!validation.isValid && timetable) {
    status("Attempting automatic repair of schedule violations…");
    const repairResult = repairSchedule({
      timetable,
      subjects: data.subjects,
      slots,
      constraints: data.constraints,
      teacherLinks: data.resources.teacherLinks,
      teacherBusy: data.busyMap.teacherBusy,
      rooms: data.resources.rooms,
      batches,
      existingOtherTimetables: otherTimetables,
      division,
      semester: parseInt(semester),
      department,
    });
    if (repairResult.repaired) {
      timetable = repairResult.timetable;
      validation = repairResult.validation;
      qualityScore = repairResult.qualityScore;
      status("✅ Violations automatically resolved by repair pipeline!");
    }
  }

  // 6. Independent validation confirmation
  const remainingConflicts = validation.violations.map((v) => v.message || JSON.stringify(v));

  if (validation.isValid) {
    status("✅ Timetable generated: 0 conflicts, fully validated!");
  } else {
    status(`⚠️ Generated with ${remainingConflicts.length} unresolved conflict(s). Reviewing…`);
  }

  return {
    timetable,
    slots,
    data,
    validation,
    qualityScore,
    remainingConflicts,
    orderedClassSlots,
    batches,
    theoryRoom: engineResult.theoryRoom,
  };
};
