const SEVERITY_POINTS = {
  CRITICAL: 80,
  HIGH: 60,
  MEDIUM: 40,
  LOW: 20
};

const getPriorityLevel = (score) => {
  if (score >= 80) return "URGENT";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
};

export const assessPriority = ({
  severity = "MEDIUM",
  createdAt,
  confirmedDuplicateCount = 0,
  status,
  duplicateOf = null
}) => {
  // A confirmed duplicate remains in the record but is not independently actionable.
  if (duplicateOf) {
    return {
      level: "DUPLICATE",
      score: 0,
      factors: {
        severityPoints: 0,
        agePoints: 0,
        duplicatePoints: 0,
        confirmedDuplicateCount
      },
      reason: "This complaint has been confirmed as a duplicate of another complaint."
    };
  }

  if (["RESOLVED", "REJECTED"].includes(status)) {
    return {
      level: "CLOSED",
      score: 0,
      factors: {
        severityPoints: 0,
        agePoints: 0,
        duplicatePoints: 0,
        confirmedDuplicateCount
      },
      reason: "Complaint is resolved or rejected."
    };
  }

  const severityPoints = SEVERITY_POINTS[severity] ?? 40;

  const ageInDays = createdAt
    ? Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 86400000)
    : 0;

  const agePoints = Math.min(15, (ageInDays / 10) * 15);

  const duplicatePoints = Math.min(
    5,
    Math.max(0, confirmedDuplicateCount) * 2.5
  );

  const score = Math.min(
    100,
    Math.round(severityPoints + agePoints + duplicatePoints)
  );

  return {
    level: getPriorityLevel(score),
    score,
    factors: {
      severityPoints,
      agePoints: Number(agePoints.toFixed(2)),
      duplicatePoints,
      confirmedDuplicateCount
    },
    reason: "Priority is calculated from severity, complaint age and confirmed duplicate reports."
  };
};
