import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { Search, X, BookOpen, Layers, Check, Plus, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

/**
 * CourseSelector
 * Searchable course selector component.
 * Allows searching canonical courses by code or title with instant typeahead.
 * Returns canonical course record & ID (prevents free-text string mismatches & duplicates).
 */
const CourseSelector = ({
  selectedCourseId = null,
  selectedCourse = null,
  onSelect,
  onClear,
  departmentFilter = null,
  semesterFilter = null,
  placeholder = "Search course by code (e.g. CS601, 21CS71) or title...",
  label = "Canonical Course",
  allowNew = false,
  disabled = false,
  required = false,
  courses: externalCourses = null,
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [coursesList, setCoursesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentSelection, setCurrentSelection] = useState(selectedCourse || null);
  const [showAllDepts, setShowAllDepts] = useState(!departmentFilter);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Sync internal state when external selectedCourse or selectedCourseId changes
  useEffect(() => {
    if (selectedCourse) {
      setCurrentSelection(selectedCourse);
    } else if (selectedCourseId && coursesList.length > 0) {
      const match = coursesList.find((c) => String(c.id) === String(selectedCourseId));
      if (match) setCurrentSelection(match);
    } else if (!selectedCourseId) {
      setCurrentSelection(null);
    }
  }, [selectedCourseId, selectedCourse, coursesList]);

  // Fetch courses from Supabase or use external courses
  useEffect(() => {
    if (externalCourses && Array.isArray(externalCourses)) {
      setCoursesList(externalCourses);
    } else {
      fetchCourses();
    }
  }, [externalCourses]);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .order("subject_code", { ascending: true });
      if (!error && data) {
        setCoursesList(data);
      }
    } catch (err) {
      console.warn("Could not fetch subjects:", err);
    } finally {
      setLoading(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter courses based on query, department, and semester
  const filteredCourses = coursesList.filter((course) => {
    // Search query matches code or title
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      course.subject_code?.toLowerCase().includes(q) ||
      course.subject_name?.toLowerCase().includes(q);

    if (!matchesQuery) return false;

    // Department filtering
    if (!showAllDepts && departmentFilter) {
      const deptMatch =
        course.department?.toUpperCase() === departmentFilter.toUpperCase() ||
        course.department === "ALL";
      if (!deptMatch) return false;
    }

    // Semester filtering (optional)
    if (semesterFilter && !showAllDepts) {
      const semMatch = parseInt(course.semester) === parseInt(semesterFilter);
      if (!semMatch) return false;
    }

    return true;
  });

  const handleSelect = (course) => {
    setCurrentSelection(course);
    setIsOpen(false);
    setQuery("");
    if (onSelect) {
      onSelect(course);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setCurrentSelection(null);
    setQuery("");
    if (onClear) {
      onClear();
    }
    if (inputRef.current) inputRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < filteredCourses.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCourses[highlightIndex]) {
        handleSelect(filteredCourses[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const getCategoryBadgeStyle = (category) => {
    const cat = (category || "").toLowerCase();
    if (cat.includes("lab")) {
      return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
    }
    if (cat.includes("professional") || cat.includes("pe")) {
      return { background: "#ede9fe", color: "#5b21b6", border: "1px solid #ddd6fe" };
    }
    if (cat.includes("open") || cat.includes("oe")) {
      return { background: "#ffedd5", color: "#9a3412", border: "1px solid #fed7aa" };
    }
    return { background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" };
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", marginBottom: 12 }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>
            {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
          </label>
          {departmentFilter && (
            <button
              type="button"
              onClick={() => setShowAllDepts(!showAllDepts)}
              style={{
                background: "none",
                border: "none",
                fontSize: "0.75rem",
                color: "#4338ca",
                cursor: "pointer",
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              {showAllDepts ? `Scope: ${departmentFilter} only` : "Show all departments"}
            </button>
          )}
        </div>
      )}

      {/* Selected Course Pill / Search Input */}
      {currentSelection ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            background: "#f0fdf4",
            border: "1.5px solid #86efac",
            borderRadius: 8,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1 }}>
            <span
              style={{
                background: "#4338ca",
                color: "#fff",
                padding: "2px 8px",
                borderRadius: 5,
                fontWeight: 800,
                fontSize: "0.78rem",
                letterSpacing: "0.5px",
              }}
            >
              {currentSelection.subject_code || "NO-CODE"}
            </span>
            <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.92rem" }}>
              {currentSelection.subject_name}
            </span>
            {currentSelection.course_category && (
              <span
                style={{
                  ...getCategoryBadgeStyle(currentSelection.course_category),
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontSize: "0.72rem",
                  fontWeight: 600,
                }}
              >
                {currentSelection.course_category}
              </span>
            )}
            {currentSelection.ltp && (
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontSize: "0.72rem",
                  fontWeight: 600,
                }}
              >
                L-T-P: {currentSelection.ltp}
              </span>
            )}
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              {currentSelection.weekly_hours} cr · {currentSelection.department} Sem {currentSelection.semester}
            </span>
          </div>

          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear selection"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
                color: "#64748b",
                borderRadius: "50%",
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#fff",
              border: isOpen ? "1.5px solid #4338ca" : "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "0 10px",
              boxShadow: isOpen ? "0 0 0 3px rgba(67, 56, 202, 0.12)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <Search size={16} style={{ color: "#94a3b8", marginRight: 8 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              disabled={disabled}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
                setHighlightIndex(0);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              style={{
                width: "100%",
                padding: "10px 0",
                border: "none",
                outline: "none",
                fontSize: "0.92rem",
                color: "#1e293b",
                background: "transparent",
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                  padding: 2,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                zIndex: 9999,
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {loading ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
                  Loading courses…
                </div>
              ) : filteredCourses.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
                  <AlertCircle size={20} style={{ margin: "0 auto 6px", display: "block", color: "#f59e0b" }} />
                  No courses found matching "{query}".
                </div>
              ) : (
                filteredCourses.map((c, idx) => {
                  const isHighlighted = idx === highlightIndex;
                  return (
                    <div
                      key={c.id || `${c.subject_code}-${idx}`}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      onClick={() => handleSelect(c)}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        background: isHighlighted ? "#f8fafc" : "#ffffff",
                        borderBottom: "1px solid #f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "background 0.1s ease",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span
                            style={{
                              background: "#e0e7ff",
                              color: "#4338ca",
                              padding: "2px 7px",
                              borderRadius: 4,
                              fontWeight: 800,
                              fontSize: "0.78rem",
                            }}
                          >
                            {c.subject_code || "CODE"}
                          </span>
                          <span style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.9rem" }}>
                            {c.subject_name}
                          </span>
                          {c.course_category && (
                            <span
                              style={{
                                ...getCategoryBadgeStyle(c.course_category),
                                padding: "1px 6px",
                                borderRadius: 4,
                                fontSize: "0.7rem",
                                fontWeight: 600,
                              }}
                            >
                              {c.course_category}
                            </span>
                          )}
                          {c.ltp && (
                            <span
                              style={{
                                background: "#f1f5f9",
                                color: "#475569",
                                padding: "1px 5px",
                                borderRadius: 4,
                                fontSize: "0.68rem",
                                fontWeight: 600,
                              }}
                            >
                              {c.ltp}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                          Dept: <b>{c.department}</b> · Sem: <b>{c.semester}</b> · Credits:{" "}
                          <b>{c.weekly_hours}</b>
                          {c.is_lab && <span style={{ color: "#ef4444", marginLeft: 6, fontWeight: 700 }}>[LAB]</span>}
                        </div>
                      </div>

                      <Check
                        size={16}
                        style={{
                          color: currentSelection?.id === c.id ? "#16a34a" : "transparent",
                          marginLeft: 10,
                        }}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CourseSelector;
