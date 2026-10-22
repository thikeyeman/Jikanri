function effectiveEntry(dateStr) {
  return entryFor(store.entries, dateStr);
}
function researchHoursForDate(dateStr) {
  return jobHours(store, dateStr);
}

function rollingActualThrough(dateStr) {
  return rollingWindow(store.entries, dateStr).reduce(
    (sum, row) => sum + row.hours,
    0,
  );
}
function sundayKey(dateStr) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() - d.getDay());
  return localDateStr(d);
}

function settingsFor(state, month, jobId = state.plannerJobId) {
  const global = {
    rollingLimit: 28,
    dailyMax: 8,
    ...state.settings,
    ...state.monthSettings?.[month],
  };
  const job = jobSettings(
    state.jobs.find((job) => job.id === jobId),
    month,
  );
  return {
    ...global,
    ...Object.fromEntries(
      Object.entries(JOB_FIELDS).map(([old, key]) => [old, job[key] ?? 0]),
    ),
  };
}
function entryFor(entries, date) {
  const byJob = entries[date] || {};
  return {
    byJob,
    hours: Object.values(byJob).reduce((sum, hours) => sum + hours, 0),
    source: entries[date] ? "browser" : "empty",
  };
}
function rollingWindow(entries, end) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(end, i - 6);
    return { date, ...entryFor(entries, date) };
  });
}
