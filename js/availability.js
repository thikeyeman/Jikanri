function holidayMap(year) {
  return new Map(
    (effectiveConstraints().holidays || [])
      .filter((x) => x.date.startsWith(String(year)))
      .map((x) => [x.date, x.reason || "Holiday"]),
  );
}
function getDateOverride(dateStr, c) {
  return (c.dateOverrides || []).find((r) => r.date === dateStr) || null;
}
function getRangeBlock(dateStr, c) {
  return (
    [...(c.blockedRanges || [])]
      .reverse()
      .find((r) => dateStr >= r.start && dateStr <= r.end) || null
  );
}
function availabilityFor(dateStr, c) {
  const d = parseLocalDate(dateStr);
  const override = getDateOverride(dateStr, c);
  if (override) {
    if (override.mode === "block")
      return {
        blocked: true,
        maxHours: 0,
        reason: override.reason || "One-day unavailable override",
        source: "override",
      };
    if (override.mode === "max")
      return {
        blocked: false,
        maxHours: Math.max(0, Number(override.maxHours) || 0),
        reason: override.reason || `One-day max ${override.maxHours}h`,
        source: "override",
      };
    if (override.mode === "allow")
      return {
        blocked: false,
        maxHours: null,
        reason: override.reason || "One-day available override",
        source: "override",
      };
  }
  const range = getRangeBlock(dateStr, c);
  if (range)
    return {
      blocked: range.mode !== "allow",
      maxHours: range.mode === "allow" ? null : 0,
      reason:
        range.reason ||
        (range.mode === "allow"
          ? "Specially available range"
          : "Unavailable range"),
      source: "range",
    };
  const reasons = [];
  if (c.blockWeekends && (d.getDay() === 0 || d.getDay() === 6))
    reasons.push("weekend");
  if ((c.blockedWeekdays || []).includes(d.getDay()))
    reasons.push(
      `recurring ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()]}`,
    );
  if (c.useOriginalHolidays) {
    const label =
      (c.holidays || []).find((x) => x.date === dateStr)?.reason ||
      ((c.holidays || []).some((x) => x.date === dateStr) ? "Holiday" : null);
    if (label) reasons.push(label);
  }
  return {
    blocked: reasons.length > 0,
    maxHours: reasons.length ? 0 : null,
    reason: reasons.join("; "),
    source: reasons.length
      ? c.useOriginalHolidays &&
        (c.holidays || []).some((x) => x.date === dateStr)
        ? "date"
        : "weekday"
      : "none",
  };
}

function getAvailability(dateStr) {
  return jobAvailability(dateStr, targetJob());
}

function availabilityLabel(availability) {
  if (availability.blocked)
    return availability.source === "weekday" ? "Weekday off" : "Blocked";
  if (availability.maxHours !== null)
    return "Max " + availability.maxHours + "h";
  return ["override", "range"].includes(availability.source)
    ? "Special"
    : "Open";
}
