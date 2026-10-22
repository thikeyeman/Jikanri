const JOB_FIELDS = {
  pt2DailyMax: "dailyMax",
  weeklyPt2Limit: "weeklyLimit",
  monthlyPt2Limit: "monthlyLimit",
  minPt2Hours: "minBlock",
  researchMonthlyWarning: "monthlyWarning",
};
function newJob(id, name, color = "#2563eb") {
  return {
    id,
    name,
    color,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    dailyMax: 8,
    weeklyLimit: 168,
    monthlyLimit: 744,
    minBlock: 0.5,
    monthlyWarning: 744,
    schedulable: true,
    archived: false,
    monthSettings: {},
    constraints: deepClone(DEFAULT_CONSTRAINTS),
  };
}
function targetJob(state = store) {
  return state.jobs.find((job) => job.id === state.plannerJobId) || null;
}
function eligibleJobs(state = store) {
  return state.jobs.filter((job) => job.schedulable && !job.archived);
}
function ensurePlannerJob(state = store) {
  const eligible = eligibleJobs(state);
  if (!eligible.some((job) => job.id === state.plannerJobId))
    state.plannerJobId = eligible[0]?.id || null;
}
function editedJob() {
  return store.jobs.find((job) => job.id === editingJobId) || null;
}
function jobHours(state, date, id = state.plannerJobId) {
  return state.entries[date]?.[id] || 0;
}
function jobSettings(job, month) {
  return { ...job, ...job?.monthSettings?.[month] };
}
function jobAvailability(date, job) {
  if (!job || job.archived || !job.schedulable)
    return {
      blocked: true,
      maxHours: 0,
      reason: "Job is not available for scheduling",
      source: "job",
    };
  const c = normalizeConstraints(job.constraints);
  c.blockedWeekdays = [
    ...new Set([
      ...c.blockedWeekdays,
      ...[0, 1, 2, 3, 4, 5, 6].filter((d) => !job.weekdays.includes(d)),
    ]),
  ];
  return availabilityFor(date, c);
}
function addJob(state, name, color) {
  const value = name.trim();
  if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color))
    throw Error("Choose a valid job color.");
  if (!value || value.length > 80)
    throw Error("Enter a job name of 1–80 characters.");
  const id =
    "job-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8);
  const job = newJob(id, value, color);
  state.jobs.push(job);
  ensurePlannerJob(state);
  return job;
}
function updateJob(state, id, patch) {
  const candidate = deepClone(state),
    job = candidate.jobs.find((j) => j.id === id);
  if (!job) throw Error("Job not found.");
  Object.assign(job, patch, { id });
  validateStore(candidate);
  Object.assign(
    state.jobs.find((j) => j.id === id),
    job,
  );
  ensurePlannerJob(state);
}
function recordHours(state, date, id, hours) {
  if (
    !isDateKey(date) ||
    !state.jobs.some((j) => j.id === id) ||
    !Number.isFinite(hours) ||
    hours < 0 ||
    hours > 24
  )
    throw Error("Enter hours between 0 and 24.");
  const entries = { ...state.entries[date] };
  if (hours === 0) delete entries[id];
  else entries[id] = hours;
  if (Object.keys(entries).length) state.entries[date] = entries;
  else delete state.entries[date];
}
function migrateJobs(raw) {
  if (raw.version === 7) return deepClone(raw);
  const first = newJob("pt1", "Job 1", "#2563eb"),
    second = newJob("pt2", "Job 2", "#15803d");
  first.schedulable = false;
  const settings = normalizeSettingsObject(
    raw.settings || {},
    DEFAULT_SETTINGS,
  );
  for (const [old, key] of Object.entries(JOB_FIELDS))
    second[key] = settings[old];
  second.constraints = normalizeConstraints(raw.constraints || {});
  const monthSettings = {};
  for (const [month, values] of Object.entries(raw.monthSettings || {})) {
    monthSettings[month] = Object.fromEntries(
      Object.entries(values).filter(([key]) =>
        ["rollingLimit", "dailyMax"].includes(key),
      ),
    );
    second.monthSettings[month] = Object.fromEntries(
      Object.entries(values)
        .filter(([key]) => JOB_FIELDS[key])
        .map(([key, value]) => [JOB_FIELDS[key], value]),
    );
  }
  return {
    version: 7,
    jobs: [first, second],
    plannerJobId: "pt2",
    entries: Object.fromEntries(
      Object.entries(raw.entries).map(([date, value]) => [
        date,
        inferLegacySplit(value),
      ]),
    ),
    settings: {
      rollingLimit: settings.rollingLimit,
      dailyMax: settings.dailyMax,
    },
    monthSettings,
    updatedAt: raw.updatedAt || null,
    legacySettings: {
      settings: deepClone(raw.settings || {}),
      monthSettings: deepClone(raw.monthSettings || {}),
      constraints: deepClone(raw.constraints || {}),
    },
  };
}
