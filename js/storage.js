let storageWarning = "";
let storageFailed = false;
const volatileStorage = new Map();
let demoStorage = null;
const storageAdapter = {
  getItem(key) {
    if (demoStorage) return demoStorage.get(key) ?? null;
    if (storageFailed) return volatileStorage.get(key) ?? null;
    try {
      const value = localStorage.getItem(key);
      if (value !== null) volatileStorage.set(key, value);
      return value;
    } catch {
      storageFailed = true;
      storageWarning =
        "Browser storage unavailable; export JSON before closing.";
      return volatileStorage.get(key) ?? null;
    }
  },
  setItem(key, value) {
    if (demoStorage) {
      demoStorage.set(key, value);
      return;
    }
    volatileStorage.set(key, value);
    if (storageFailed) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      storageFailed = true;
      storageWarning =
        "Changes are in memory only; export JSON before closing.";
    }
  },
  removeItem(key) {
    if (demoStorage) {
      demoStorage.delete(key);
      return;
    }
    volatileStorage.delete(key);
    if (storageFailed) return;
    try {
      localStorage.removeItem(key);
    } catch {
      storageFailed = true;
      storageWarning =
        "Browser storage unavailable; export JSON before closing.";
    }
  },
};
function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}
function parseJSON(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
function nowISO() {
  return new Date().toISOString();
}
function isDateKey(k) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  const d = parseLocalDate(k);
  return localDateStr(d) === k;
}
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseLocalDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}
function selectedMonth() {
  const el = document.getElementById("month");
  return el && /^\d{4}-\d{2}$/.test(el.value) ? el.value : "";
}
function effectiveSettings(month = null) {
  return settingsFor(store, month || selectedMonth());
}
function hasCustomMonthSettings(month) {
  return !!(
    month &&
    store.monthSettings &&
    store.monthSettings[month] &&
    Object.keys(store.monthSettings[month]).length
  );
}
function effectiveConstraints() {
  return normalizeConstraints(editedJob()?.constraints || {});
}
function escapeHTML(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function solverAvailable() {
  return (
    typeof window.solver === "object" &&
    typeof window.solver.Solve === "function"
  );
}

function normalizeConstraints(raw) {
  const base = deepClone(DEFAULT_CONSTRAINTS);
  const hasExplicit =
    raw && typeof raw === "object" && Object.keys(raw).length > 0;
  if (!hasExplicit) return base;
  const blockedWeekdays = Array.isArray(raw.blockedWeekdays)
    ? raw.blockedWeekdays
        .map(Number)
        .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6)
    : base.blockedWeekdays;
  const dateOverrides = [];
  const sourceOverrides = Array.isArray(raw.dateOverrides)
    ? raw.dateOverrides
    : [];
  for (const r of sourceOverrides) {
    if (!r || !isDateKey(String(r.date || ""))) continue;
    const mode = ["block", "allow", "max"].includes(r.mode) ? r.mode : "block";
    const maxHours =
      mode === "max" ? Math.max(0, Number(r.maxHours) || 0) : null;
    dateOverrides.push({
      date: String(r.date),
      mode,
      maxHours,
      reason: String(r.reason || ""),
    });
  }
  const blockedRanges = [];
  const sourceRanges = Array.isArray(raw.blockedRanges)
    ? raw.blockedRanges
    : [];
  for (const r of sourceRanges) {
    const start = String((r && r.start) || "");
    const end = String((r && r.end) || "");
    if (!isDateKey(start) || !isDateKey(end)) continue;
    blockedRanges.push({
      start: start <= end ? start : end,
      end: start <= end ? end : start,
      reason: String(r.reason || ""),
      ...(r.mode === "allow" ? { mode: "allow" } : {}),
    });
  }
  return {
    blockWeekends:
      raw.blockWeekends !== undefined
        ? !!raw.blockWeekends
        : base.blockWeekends,
    useOriginalHolidays:
      raw.useOriginalHolidays !== undefined
        ? !!raw.useOriginalHolidays
        : base.useOriginalHolidays,
    blockedWeekdays,
    dateOverrides,
    blockedRanges,
    holidays: Array.isArray(raw.holidays)
      ? raw.holidays.map((x) => ({
          date: x.date,
          reason: String(x.reason || "Holiday"),
        }))
      : [],
  };
}

function inferLegacySplit(v) {
  if (!v || typeof v !== "object") return { pt1: 0, pt2: 0 };
  if (v.pt1 !== undefined || v.pt2 !== undefined)
    return {
      pt1: Math.max(0, Number(v.pt1) || 0),
      pt2: Math.max(0, Number(v.pt2) || 0),
    };
  const total = Math.max(0, Number(v.hours) || 0);
  const note = String(v.note || "");
  let pt2 = 0;
  for (const raw of note
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)) {
    const m = raw.match(/^(.+?)\s+([\d.]+)$/);
    if (!m) continue;
    const cat = m[1].trim().toLowerCase();
    if (["r", "research", "pt2", "pt 2"].includes(cat))
      pt2 += Math.max(0, Number(m[2]) || 0);
  }
  pt2 = Math.min(total, pt2);
  return { pt1: Math.max(0, total - pt2), pt2 };
}
function normalizeSettingsObject(raw, base = {}) {
  const out = { ...base };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const v = Number(raw[key]);
    if (Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}
function getEmbeddedStore() {
  const parsed = parseJSON(
    document.getElementById("embedded-data").textContent,
    null,
  );
  return parsed && typeof parsed === "object"
    ? parsed
    : {
        version: 6,
        entries: {},
        settings: {},
        monthSettings: {},
        constraints: {},
      };
}
function normalizeStore(raw) {
  validateStore(raw);
  const next = migrateJobs(raw);
  ensurePlannerJob(next);
  validateStore(next);
  return next;
}

function loadStore() {
  const currentRaw = storageAdapter.getItem(STORE_KEY);
  let current = parseJSON(currentRaw, null);
  if (currentRaw) {
    try {
      validateStore(current);
    } catch {
      storageAdapter.setItem(STORE_KEY + ".corrupt", currentRaw);
      storageWarning =
        "Stored data is invalid; original retained under " +
        STORE_KEY +
        ".corrupt. Import a valid backup.";
      current = null;
    }
  }
  if (current && typeof current === "object") {
    const migrated = normalizeStore(current);
    if (
      current.version !== 7 ||
      current.plannerJobId !== migrated.plannerJobId
    ) {
      if (
        current.version !== 7 &&
        !storageAdapter.getItem(STORE_KEY + ".before-jobs")
      )
        storageAdapter.setItem(STORE_KEY + ".before-jobs", currentRaw);
      storageAdapter.setItem(STORE_KEY, JSON.stringify(migrated));
    }
    return migrated;
  }
  const embedded = getEmbeddedStore();
  if (
    (embedded.jobs && embedded.jobs.length) ||
    Object.keys(embedded.entries || {}).length ||
    Object.keys(embedded.settings || {}).length ||
    Object.keys(embedded.monthSettings || {}).length ||
    Object.keys(embedded.constraints || {}).length
  ) {
    const loaded = normalizeStore(embedded);
    storageAdapter.setItem(STORE_KEY, JSON.stringify(loaded));
    return loaded;
  }
  return normalizeStore({
    version: 3,
    entries: {},
    settings: {},
    constraints: {},
    updatedAt: null,
  });
}

function saveStore(message = "Saved") {
  store.updatedAt = nowISO();
  storageAdapter.setItem(STORE_KEY, JSON.stringify(store));
  const el = document.getElementById("saveStatus");
  if (el)
    el.textContent = `${storageWarning || message} • ${new Date().toLocaleTimeString()}`;
}
function updateHistoryButtons() {
  const backups = readHistory(BACKUP_KEY);
  const redo = readHistory(REDO_KEY);
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !backups.length;
  if (redoBtn) redoBtn.disabled = !redo.length;
}
function makeBackup(reason, clearRedo = true) {
  const backups = readHistory(BACKUP_KEY);
  backups.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowISO(),
    reason,
    store: deepClone(store),
  });
  storageAdapter.setItem(
    BACKUP_KEY,
    JSON.stringify(backups.slice(0, MAX_BACKUPS)),
  );
  if (clearRedo) storageAdapter.removeItem(REDO_KEY);
  renderBackupList();
  updateHistoryButtons();
}
function restoreVersion(id) {
  const backups = readHistory(BACKUP_KEY);
  const found = backups.find((b) => b.id === id);
  if (!found) {
    alert("That version is no longer available.");
    return;
  }
  if (
    !confirm(
      `Restore this version?\n\n${new Date(found.createdAt).toLocaleString()} — ${found.reason || "snapshot"}\n\nYour current state will be saved as a new recovery version first.`,
    )
  )
    return;
  makeBackup("before restoring an older version");
  store = normalizeStore(deepClone(found.store || {}));
  saveStore("Version restored");
  syncAllControls();
  generateCalendar();
  clearPlan();
  renderBackupList();
}
function restoreLatestBackup() {
  const backups = readHistory(BACKUP_KEY);
  if (!backups.length) {
    alert("No browser backup snapshot is available.");
    return;
  }
  restoreVersion(backups[0].id);
}
function undoLastChange() {
  const backups = readHistory(BACKUP_KEY);
  if (!backups.length) {
    alert("Nothing is available to undo yet.");
    return;
  }
  const target = backups.shift();
  const redo = readHistory(REDO_KEY);
  redo.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowISO(),
    reason: `redo after undoing: ${target.reason || "change"}`,
    store: deepClone(store),
  });
  storageAdapter.setItem(REDO_KEY, JSON.stringify(redo.slice(0, MAX_BACKUPS)));
  storageAdapter.setItem(BACKUP_KEY, JSON.stringify(backups));
  store = normalizeStore(deepClone(target.store || {}));
  saveStore(`Undid: ${target.reason || "last change"}`);
  syncAllControls();
  generateCalendar();
  clearPlan();
  renderBackupList();
  updateHistoryButtons();
}
function redoLastUndo() {
  const redo = readHistory(REDO_KEY);
  if (!redo.length) {
    alert("Nothing is available to redo.");
    return;
  }
  const target = redo.shift();
  const backups = readHistory(BACKUP_KEY);
  backups.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowISO(),
    reason: "before redo",
    store: deepClone(store),
  });
  storageAdapter.setItem(
    BACKUP_KEY,
    JSON.stringify(backups.slice(0, MAX_BACKUPS)),
  );
  storageAdapter.setItem(REDO_KEY, JSON.stringify(redo));
  store = normalizeStore(deepClone(target.store || {}));
  saveStore("Redo applied");
  syncAllControls();
  generateCalendar();
  clearPlan();
  renderBackupList();
  updateHistoryButtons();
}
function restoreEmbeddedSnapshot() {
  const embedded = getEmbeddedStore();
  if (
    !(embedded.jobs && embedded.jobs.length) &&
    !Object.keys(embedded.entries || {}).length &&
    !Object.keys(embedded.settings || {}).length &&
    !Object.keys(embedded.monthSettings || {}).length &&
    !Object.keys(embedded.constraints || {}).length
  ) {
    alert("This HTML file does not contain an embedded user snapshot yet.");
    return;
  }
  if (
    !confirm(
      "Restore the snapshot embedded inside this HTML file? Current browser data will be backed up first.",
    )
  )
    return;
  makeBackup("before restoring embedded snapshot");
  store = normalizeStore(embedded);
  saveStore("Embedded snapshot restored");
  syncAllControls();
  generateCalendar();
  clearPlan();
}

function validateStore(raw) {
  const object = (x) => x && typeof x === "object" && !Array.isArray(x);
  const fail = (message) => {
    throw new Error("Invalid backup: " + message);
  };
  const number = (x, label) => {
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 100000)
      fail(label);
  };
  if (!object(raw) || !object(raw.entries)) fail("entries must be an object");
  if (
    raw.version !== undefined &&
    (!Number.isInteger(raw.version) || raw.version < 1 || raw.version > 7)
  )
    fail("unsupported schema version");
  for (const [d, e] of Object.entries(raw.entries)) {
    if (!isDateKey(d) || !object(e)) fail("entry date or record");
    if (raw.version === 7) {
      for (const [id, hours] of Object.entries(e)) {
        if (!raw.jobs?.some((j) => j.id === id)) fail("unknown job in entry");
        number(hours, d + " hours");
      }
      continue;
    }
    for (const k of ["pt1", "pt2", "hours"])
      if (e[k] !== undefined) number(e[k], d + " " + k);
    if (e.pt1 === undefined && e.pt2 === undefined && e.hours === undefined)
      fail("missing hours");
  }
  for (const settings of [
    raw.settings || {},
    ...Object.values(raw.monthSettings || {}),
  ]) {
    if (!object(settings)) fail("settings");
    for (const k of Object.keys(DEFAULT_SETTINGS))
      if (settings[k] !== undefined) number(settings[k], k);
  }
  for (const month of Object.keys(raw.monthSettings || {}))
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail("month");
  if (raw.version === 7) {
    if (!object(raw.settings) || !object(raw.monthSettings))
      fail("global settings and month settings must be objects");
    if (!Array.isArray(raw.jobs) || !raw.jobs.length)
      fail("jobs must contain at least one job");
    const ids = new Set();
    for (const job of raw.jobs) {
      if (
        !object(job) ||
        typeof job.id !== "string" ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(job.id) ||
        ids.has(job.id)
      )
        fail("job ID");
      ids.add(job.id);
      if (
        typeof job.name !== "string" ||
        !job.name.trim() ||
        job.name.length > 80 ||
        !/^#[0-9a-f]{6}$/i.test(job.color)
      )
        fail("job name or color");
      if (
        typeof job.archived !== "boolean" ||
        typeof job.schedulable !== "boolean"
      )
        fail("job status");
      if (
        !Array.isArray(job.weekdays) ||
        job.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
      )
        fail("working days");
      for (const key of [
        "dailyMax",
        "weeklyLimit",
        "monthlyLimit",
        "minBlock",
        "monthlyWarning",
      ])
        number(job[key], key);
      if (!object(job.monthSettings)) fail("job month settings");
      for (const [month, limits] of Object.entries(job.monthSettings)) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !object(limits))
          fail("job month");
        for (const [key, value] of Object.entries(limits)) {
          if (
            ![
              "dailyMax",
              "weeklyLimit",
              "monthlyLimit",
              "minBlock",
              "monthlyWarning",
            ].includes(key)
          )
            fail("job limit");
          number(value, key);
        }
      }
      validateConstraints(job.constraints);
    }
    if (raw.plannerJobId !== null && !ids.has(raw.plannerJobId))
      fail("selected job");
  } else validateConstraints(raw.constraints || {});
  function validateConstraints(c) {
    if (!object(c)) fail("constraints");
    for (const k of [
      "blockedWeekdays",
      "dateOverrides",
      "blockedRanges",
      "holidays",
    ])
      if (c[k] !== undefined && !Array.isArray(c[k])) fail(k);
    for (const x of c.blockedWeekdays || [])
      if (!Number.isInteger(x) || x < 0 || x > 6) fail("weekday");
    for (const k of ["blockWeekends", "useOriginalHolidays"])
      if (c[k] !== undefined && typeof c[k] !== "boolean") fail(k);
    for (const x of c.dateOverrides || []) {
      if (
        !object(x) ||
        !isDateKey(x.date) ||
        !["allow", "block", "max"].includes(x.mode)
      )
        fail("override");
      if (x.mode === "max") number(x.maxHours, "override max");
    }
    for (const x of c.blockedRanges || [])
      if (
        !object(x) ||
        !isDateKey(x.start) ||
        !isDateKey(x.end) ||
        x.start > x.end ||
        (x.mode !== undefined && !["allow", "block"].includes(x.mode))
      )
        fail("range");
    for (const x of c.holidays || [])
      if (!object(x) || !isDateKey(x.date)) fail("holiday");
  }

  return raw;
}

function readHistory(key) {
  const raw = parseJSON(storageAdapter.getItem(key), []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => {
      try {
        return !!x.id && !!x.createdAt && !!validateStore(x.store);
      } catch {
        return false;
      }
    })
    .slice(0, MAX_BACKUPS);
}
