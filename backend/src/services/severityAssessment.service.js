const SEVERITY_RANK = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

// These are explicit emergency indicators, not a trained ML model.
const CRITICAL_PATTERNS = [
  /\b(exposed live wire|live electric wire|electric shock|electrocution)\b/i,
  /\b(severe injury|seriously injured|fatal accident|death|died)\b/i,
  /\b(major flooding|flooded homes|house flooding|building flooding)\b/i,
  /\b(road completely blocked|bridge collapse|building collapse)\b/i,
  /\b(major fire|fire outbreak|gas leak)\b/i,
];

const HIGH_PATTERNS = [
  /\b(accident|collision|injured|injury)\b/i,
  /\b(overflow|waterlogging|flooding)\b/i,
  /\b(burst pipe|pipe burst|major leakage)\b/i,
  /\b(contaminated|unsafe drinking water|sewage)\b/i,
  /\b(blocked main road|heavy traffic obstruction)\b/i,
  /\b(tree blocking road|tree fallen on|fallen tree)\b/i,
  /\b(sparking|electric sparks|power cable hanging)\b/i,
];

export const assessSeverity = ({
  categoryDefaultSeverity = "MEDIUM",
  title = "",
  description = "",
}) => {
  const defaultSeverity = SEVERITY_RANK[categoryDefaultSeverity]
    ? categoryDefaultSeverity
    : "MEDIUM";

  const text = `${title} ${description}`.trim();

  const criticalMatch = CRITICAL_PATTERNS.find(pattern =>
    pattern.test(text)
  );

  if (criticalMatch) {
    return {
      severity: "CRITICAL",
      basis: "CONTEXTUAL_RULE",
      reason: "An emergency-related indicator was found in the complaint text.",
    };
  }

  const highMatch = HIGH_PATTERNS.find(pattern =>
    pattern.test(text)
  );

  if (
    highMatch &&
    SEVERITY_RANK[defaultSeverity] < SEVERITY_RANK.HIGH
  ) {
    return {
      severity: "HIGH",
      basis: "CONTEXTUAL_RULE",
      reason: "A potentially high-impact condition was found in the complaint text.",
    };
  }

  return {
    severity: defaultSeverity,
    basis: "CATEGORY_DEFAULT",
    reason: `Severity assigned using the ${defaultSeverity} default for this complaint category.`,
  };
};
