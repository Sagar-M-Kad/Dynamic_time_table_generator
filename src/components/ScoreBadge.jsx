import React from "react";

// ── Score Badge component with strict Hard-Constraint Gating ────────────────
const ScoreBadge = ({ score, validation, violations = [] }) => {
  const hasHardConflicts = (violations && violations.length > 0) || (validation && !validation.isValid);

  if (hasHardConflicts) {
    const conflictCount = violations?.length || validation?.violations?.length || 1;
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "#fef2f2",
          border: "1.5px solid #ef4444",
          borderRadius: 10,
          padding: "6px 16px",
        }}
      >
        <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#dc2626" }}>
          INVALID (0/100)
        </span>
        <span
          style={{
            fontSize: "0.82rem",
            color: "#991b1b",
            fontWeight: 700,
            background: "#fee2e2",
            padding: "2px 8px",
            borderRadius: 6,
          }}
        >
          ⚠️ {conflictCount} Hard Constraint Violation(s)
        </span>
      </div>
    );
  }

  const numericScore = typeof score === "number" ? score : 100;
  const color =
    numericScore >= 85 ? "#16a34a" : numericScore >= 70 ? "#d97706" : "#dc2626";
  const label =
    numericScore >= 85 ? "Excellent (Conflict-Free)" : numericScore >= 70 ? "Good" : "Needs Review";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: color + "14",
        border: `1.5px solid ${color}`,
        borderRadius: 10,
        padding: "6px 16px",
      }}
    >
      <span style={{ fontSize: "1.2rem", fontWeight: 800, color }}>
        {numericScore}/100
      </span>
      <span style={{ fontSize: "0.82rem", color, fontWeight: 700 }}>
        ✅ {label}
      </span>
    </div>
  );
};

export default ScoreBadge;
