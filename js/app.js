function populateMonthDropdown() {
  const monthSelect = document.getElementById("month");
  monthSelect.innerHTML = "";
  const now = new Date();
  const years = [selectedDate, ...Object.keys(store.entries)]
    .map((k) => Number(k.slice(0, 4)))
    .filter(Number.isFinite);
  const startYear = Math.min(now.getFullYear() - 2, ...years);
  const endYear = Math.max(now.getFullYear() + 2, ...years);
  for (let y = startYear; y <= endYear; y++)
    for (let m = 1; m <= 12; m++) {
      const val = `${y}-${String(m).padStart(2, "0")}`;
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      if (
        val ===
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      )
        opt.selected = true;
      monthSelect.appendChild(opt);
    }
}

function updateControllerSummary() {
  const c = effectiveConstraints();
  const parts = [];
  if (c.blockWeekends) parts.push("weekends blocked");
  if (c.useOriginalHolidays) parts.push("holidays on");
  if (c.blockedWeekdays.length)
    parts.push(
      `${c.blockedWeekdays.length} recurring weekday rule${c.blockedWeekdays.length === 1 ? "" : "s"}`,
    );
  if (c.dateOverrides.length)
    parts.push(
      `${c.dateOverrides.length} date override${c.dateOverrides.length === 1 ? "" : "s"}`,
    );
  if (c.blockedRanges.length)
    parts.push(
      `${c.blockedRanges.length} date range${c.blockedRanges.length === 1 ? "" : "s"}`,
    );
  document.getElementById("controllerSummary").textContent =
    (editedJob()?.name || "New job") +
    " · " +
    (parts.length ? parts.join(" • ") : "No date restrictions");
}
function monthDisplayName(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}
function updatePlanningScopeStatus() {
  const month = selectedMonth(),
    job = editedJob();
  document.getElementById("planningMonthTitle").textContent =
    "Combined limits — " + monthDisplayName(month);
  document.getElementById("planningScopeStatus").textContent =
    "Combined overrides for " +
    monthDisplayName(month) +
    ". Other months keep their own settings.";
  const defaults = document.getElementById("jobLimitScope").value === "default";
  document.getElementById("jobLimitsTitle").textContent =
    (job?.name || "New job") +
    " — " +
    (defaults ? "default limits" : monthDisplayName(month));
  document.getElementById("jobLimitStatus").textContent = defaults
    ? "Normal limits for every month. Existing monthly overrides stay unchanged."
    : "Overrides for " +
      monthDisplayName(month) +
      ". Unchanged fields inherit defaults; reset to use all defaults.";
  document.getElementById("jobMonthActions").hidden = defaults;
  document.getElementById("controllerTitle").textContent =
    (job?.name || "New job") + " — availability";
  document.getElementById("resetMonthLimitsBtn").disabled =
    !job || !Object.keys(job.monthSettings[month] || {}).length;
  document.getElementById("resetGlobalLimitsBtn").disabled =
    !hasCustomMonthSettings(month);
}
function writeMonthLimits(month, values, scope = "job") {
  if (scope === "global")
    store.monthSettings[month] = {
      rollingLimit: values.rollingLimit,
      dailyMax: values.dailyMax,
    };
  else if (editedJob())
    editedJob().monthSettings[month] = Object.fromEntries(
      Object.entries(JOB_FIELDS).map(([old, key]) => [key, values[old]]),
    );
}
function displayedLimitValues() {
  const values = settingsFor(store, selectedMonth(), editingJobId);
  if (
    document.getElementById("jobLimitScope").value === "default" &&
    editedJob()
  )
    for (const [id, key] of Object.entries(JOB_FIELDS))
      values[id] = editedJob()[key];
  return values;
}
function readSettingsFromInputs() {
  const month = selectedMonth();
  if (!month) return;
  const next = {};
  for (const id of Object.keys(DEFAULT_SETTINGS)) {
    const value = Number(document.getElementById(id).value);
    if (
      document.getElementById(id).value.trim() === "" ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      document.getElementById("saveStatus").textContent =
        "Enter non-negative limits.";
      return;
    }
    next[id] = value;
  }
  const before = displayedLimitValues();
  if (Object.keys(next).every((key) => next[key] === before[key])) return;
  makeBackup("before changing limits");
  for (const [key, value] of Object.entries(next)) {
    if (value === before[key]) continue;
    if (JOB_FIELDS[key] && editedJob()) {
      if (document.getElementById("jobLimitScope").value === "default")
        editedJob()[JOB_FIELDS[key]] = value;
      else
        editedJob().monthSettings[month] = {
          ...editedJob().monthSettings[month],
          [JOB_FIELDS[key]]: value,
        };
    } else if (!JOB_FIELDS[key]) {
      store.monthSettings[month] = {
        ...store.monthSettings[month],
        [key]: value,
      };
    }
  }
  saveStore("Limits saved");
  syncSettingsInputs();
  generateCalendar();
  clearPlan();
}
function syncSettingsInputs() {
  const values = displayedLimitValues();
  for (const id of Object.keys(DEFAULT_SETTINGS)) {
    document.getElementById(id).value = values[id];
    if (JOB_FIELDS[id] && editedJob()) {
      const key = JOB_FIELDS[id];
      document.getElementById(id).title =
        "Default: " +
        editedJob()[key] +
        "h" +
        (Object.hasOwn(editedJob().monthSettings[selectedMonth()] || {}, key)
          ? " · Month override saved"
          : " · Inherits default");
    }
  }
  updatePlanningScopeStatus();
}
function resetSelectedMonthLimits(scope = "job") {
  const job = editedJob();
  if (scope !== "global" && !job) return;
  if (
    !confirm(
      `Use default ${scope === "global" ? "combined" : job.name} limits for this month? You can undo.`,
    )
  )
    return;
  makeBackup("before resetting month limits");
  if (scope === "global") delete store.monthSettings[selectedMonth()];
  else delete job.monthSettings[selectedMonth()];
  saveStore();
  syncSettingsInputs();
  generateCalendar();
  clearPlan();
}
function setDisplayedLimitsAsDefaults(scope = "job") {
  const job = editedJob();
  if (scope !== "global" && !job) return;
  if (
    !confirm(
      `Make this month's ${scope === "global" ? "combined" : job.name} limits the defaults? Other month overrides stay unchanged.`,
    )
  )
    return;
  const values = settingsFor(store, selectedMonth(), editingJobId);
  makeBackup("before changing default limits");
  if (scope === "global")
    store.settings = {
      ...store.settings,
      rollingLimit: values.rollingLimit,
      dailyMax: values.dailyMax,
    };
  else
    for (const [old, key] of Object.entries(JOB_FIELDS)) job[key] = values[old];
  saveStore();
  syncAllControls();
  generateCalendar();
  clearPlan();
}
function copyPreviousMonthLimits(scope = "job") {
  if (scope !== "global" && !editedJob()) return;
  const month = selectedMonth(),
    previous = addDays(month + "-01", -1).slice(0, 7);
  makeBackup("before copying month limits");
  writeMonthLimits(month, settingsFor(store, previous, editingJobId), scope);
  saveStore();
  syncSettingsInputs();
  generateCalendar();
  clearPlan();
}
function syncControllerInputs() {
  const c = effectiveConstraints();
  document.getElementById("blockWeekends").checked = c.blockWeekends;
  document.getElementById("useOriginalHolidays").checked =
    c.useOriginalHolidays;
  const host = document.getElementById("weekdayChecks");
  host.innerHTML = "";
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name, idx) => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = c.blockedWeekdays.includes(idx);
    cb.dataset.weekday = String(idx);
    cb.addEventListener("change", saveRecurringRules);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(name));
    host.appendChild(label);
  });
  renderRuleLists();
  renderHolidayPreview();
  toggleOverrideMax();
  updateControllerSummary();
}
function saveRecurringRules() {
  makeBackup("before changing recurring availability rules");
  const c = effectiveConstraints();
  c.blockWeekends = document.getElementById("blockWeekends").checked;
  c.useOriginalHolidays = document.getElementById(
    "useOriginalHolidays",
  ).checked;
  c.blockedWeekdays = [
    ...document.querySelectorAll("#weekdayChecks input:checked"),
  ].map((x) => Number(x.dataset.weekday));
  editedJob().constraints = c;
  saveStore("Availability rules saved");
  generateCalendar();
  clearPlan();
  updateControllerSummary();
}
function addDateOverride() {
  const date = document.getElementById("overrideDate").value;
  const mode = document.getElementById("overrideMode").value;
  const reason = document.getElementById("overrideReason").value.trim();
  const maxHours =
    mode === "max"
      ? parseFloat(document.getElementById("overrideMax").value)
      : null;
  if (!isDateKey(date)) {
    alert("Choose a valid date.");
    return;
  }
  if (mode === "max" && (!Number.isFinite(maxHours) || maxHours < 0)) {
    alert("Enter a valid non-negative job hours max.");
    return;
  }
  makeBackup(`before changing availability override for ${date}`);
  const c = effectiveConstraints();
  c.dateOverrides = c.dateOverrides.filter((r) => r.date !== date);
  c.dateOverrides.push({
    date,
    mode,
    maxHours: mode === "max" ? maxHours : null,
    reason,
  });
  c.dateOverrides.sort((a, b) => a.date.localeCompare(b.date));
  editedJob().constraints = c;
  document.getElementById("overrideDate").value = "";
  document.getElementById("overrideReason").value = "";
  saveStore("One-day override saved");
  renderRuleLists();
  generateCalendar();
  clearPlan();
  updateControllerSummary();
}
function addBlockedRange() {
  let start = document.getElementById("rangeStart").value;
  let end = document.getElementById("rangeEnd").value;
  const reason = document.getElementById("rangeReason").value.trim();
  const mode =
    document.getElementById("rangeMode").value === "allow" ? "allow" : "block";
  if (!isDateKey(start) || !isDateKey(end)) {
    alert("Choose valid start and end dates.");
    return;
  }
  if (start > end) [start, end] = [end, start];
  makeBackup(`before adding date range ${start} to ${end}`);
  const c = effectiveConstraints();
  c.blockedRanges.push({
    start,
    end,
    reason,
    ...(mode === "allow" ? { mode } : {}),
  });
  editedJob().constraints = c;
  for (const id of ["rangeStart", "rangeEnd", "rangeReason"])
    document.getElementById(id).value = "";
  saveStore("Date range saved");
  renderRuleLists();
  generateCalendar();
  clearPlan();
}
function removeOverride(index) {
  makeBackup("before removing one-day availability override");
  const c = effectiveConstraints();
  c.dateOverrides.splice(index, 1);
  editedJob().constraints = c;
  saveStore("One-day override removed");
  renderRuleLists();
  generateCalendar();
  clearPlan();
}
function removeRange(index) {
  makeBackup("before removing blocked date range");
  const c = effectiveConstraints();
  c.blockedRanges.splice(index, 1);
  editedJob().constraints = c;
  saveStore("Blocked range removed");
  renderRuleLists();
  generateCalendar();
  clearPlan();
}
function renderRuleLists() {
  updateControllerSummary();
  const c = effectiveConstraints();
  const o = document.getElementById("overrideList");
  const r = document.getElementById("rangeList");
  o.innerHTML = c.dateOverrides.length
    ? c.dateOverrides
        .map(
          (x, i) =>
            `<div class="rule-item"><div class="rule-main"><strong>${escapeHTML(x.date)} — ${escapeHTML(x.mode === "block" ? "Cannot work" : x.mode === "allow" ? "Available override" : `Available, max ${Number(x.maxHours).toFixed(1)}h for this job`)}</strong><span class="note">${escapeHTML(x.reason || "No reason")}</span></div><button class="small danger" data-remove-override="${i}">Remove</button></div>`,
        )
        .join("")
    : '<div class="rule-item"><span class="note">No one-day overrides.</span></div>';
  r.innerHTML = c.blockedRanges.length
    ? c.blockedRanges
        .map(
          (x, i) =>
            `<div class="rule-item"><div class="rule-main"><strong>${escapeHTML(x.start)} → ${escapeHTML(x.end)} — ${x.mode === "allow" ? "Specially available" : "Unavailable"}</strong><span class="note">${escapeHTML(x.reason || "Blocked range")}</span></div><button class="small danger" data-remove-range="${i}">Remove</button></div>`,
        )
        .join("")
    : '<div class="rule-item"><span class="note">No date ranges.</span></div>';
  o.querySelectorAll("[data-remove-override]").forEach((b) =>
    b.addEventListener("click", () =>
      removeOverride(Number(b.dataset.removeOverride)),
    ),
  );
  r.querySelectorAll("[data-remove-range]").forEach((b) =>
    b.addEventListener("click", () =>
      removeRange(Number(b.dataset.removeRange)),
    ),
  );
}
function renderHolidayPreview() {
  const month = document.getElementById("month").value;
  if (!month) return;
  const year = Number(month.slice(0, 4));
  const c = effectiveConstraints();
  const host = document.getElementById("holidayPreview");
  const rows = [...holidayMap(year).entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  host.innerHTML = rows
    .map(
      ([d, label]) =>
        `<div class="rule-item"><div class="rule-main"><strong>${escapeHTML(d)}</strong><span class="note">${escapeHTML(label)}</span></div><span class="pill ${c.useOriginalHolidays ? "good" : ""}">${c.useOriginalHolidays ? "active" : "off"}</span><button class="small" data-remove-holiday="${escapeHTML(d)}">Remove</button></div>`,
    )
    .join("");
}
function toggleOverrideMax() {
  document.getElementById("overrideMaxLabel").style.display =
    document.getElementById("overrideMode").value === "max" ? "flex" : "none";
}
function resetControllerRules() {
  const typed = prompt(
    "Restore the availability controller to the empty availability defaults? Your current full store will be backed up first.\n\nType RESET RULES to continue:",
  );
  if (typed !== "RESET RULES") return;
  makeBackup("before resetting availability rules");
  editedJob().constraints = deepClone(DEFAULT_CONSTRAINTS);
  saveStore("Date restrictions restored");
  syncControllerInputs();
  generateCalendar();
  clearPlan();
}

function resetCurrentMonth() {
  const month = document.getElementById("month").value;
  const typed = prompt(
    `This clears browser-entered hours/notes for ${month}. Controller rules stay intact.\n\nType RESET to continue:`,
  );
  if (typed !== "RESET") return;
  makeBackup(`before reset month ${month}`);
  Object.keys(store.entries).forEach((k) => {
    if (k.startsWith(month)) delete store.entries[k];
  });
  saveStore("Month entries reset (recoverable)");
  generateCalendar();
  clearPlan();
}
function resetAll() {
  const typed = prompt(
    "This clears recorded hours for every job. Planning limits and controller rules stay intact. A full recovery snapshot is saved first.\n\nType RESET ALL to continue:",
  );
  if (typed !== "RESET ALL") return;
  makeBackup("before reset all browser entries");
  store.entries = {};
  saveStore("All browser entries reset (recoverable)");
  generateCalendar();
  clearPlan();
}

function exportBackup() {
  const payload = {
    app: "Jikanri",
    formatVersion: 3,
    exportedAt: nowISO(),
    store: deepClone(store),
  };
  downloadBlob(
    JSON.stringify(payload, null, 2),
    `Jikanri-full-backup-${localDateStr(new Date())}.json`,
    "application/json",
  );
}
function downloadBlob(text, filename, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}
function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const payload = parseJSON(String(reader.result || ""), null);
    if (!payload) {
      alert("Invalid JSON file.");
      return;
    }
    let candidate = null;
    if (payload.store) candidate = payload.store;
    else if (payload.entries) candidate = payload;
    else if (Object.keys(payload).some(isDateKey))
      candidate = {
        version: 2,
        entries: payload,
        settings: {},
        constraints: {},
      };
    if (!candidate) {
      alert("This backup format is not recognized.");
      return;
    }
    try {
      candidate = normalizeStore(candidate);
    } catch (error) {
      alert(error.message);
      return;
    }
    if (
      !confirm(
        "Import this backup and replace current browser entries/settings/controller? Current data will be backed up first.",
      )
    )
      return;
    makeBackup("before import");
    store = normalizeStore(candidate);
    saveStore("Backup imported");
    syncAllControls();
    generateCalendar();
    clearPlan();
  };
  reader.readAsText(file);
}
function renderBackupList() {
  const backups = readHistory(BACKUP_KEY);
  const el = document.getElementById("backupList");
  if (!backups.length) {
    el.textContent = "No recovery versions yet.";
    updateHistoryButtons();
    return;
  }
  el.innerHTML = backups
    .slice(0, 12)
    .map(
      (b) =>
        `<div class="version-row"><div class="version-meta"><strong>${escapeHTML(new Date(b.createdAt).toLocaleString())}</strong><span>${escapeHTML(b.reason || "snapshot")}</span></div><button class="small" data-restore-version="${escapeHTML(b.id)}">Restore</button></div>`,
    )
    .join("");
  updateHistoryButtons();
}
function syncAllControls() {
  updateDemoControls();
  const month = selectedMonth();
  populateMonthDropdown();
  if (
    [...document.getElementById("month").options].some(
      (option) => option.value === month,
    )
  )
    document.getElementById("month").value = month;
  ensurePlannerJob();
  resetJobForm(editedJob());
  renderJobs();
  syncSettingsInputs();
  syncControllerInputs();
}
async function downloadPortableCopy() {
  try {
    const clone = document.documentElement.cloneNode(true);
    for (const node of clone.querySelectorAll(
      'link[rel="stylesheet"],script[src]',
    )) {
      const url = node.getAttribute("href") || node.getAttribute("src");
      const response = await fetch(new URL(url, document.baseURI));
      if (!response.ok) throw new Error(url + " could not be loaded");
      const text = await response.text(),
        inline = document.createElement(
          node.tagName === "LINK" ? "style" : "script",
        );
      inline.textContent = text.replace(/<\/script/gi, "<\\/script");
      node.replaceWith(inline);
    }
    clone.querySelector("#embedded-data").textContent = JSON.stringify(
      store,
    ).replace(/</g, "\\u003c");
    downloadBlob(
      "<!DOCTYPE html>\n" + clone.outerHTML,
      "Jikanri-private-snapshot.html",
      "text/html",
    );
  } catch (error) {
    alert(
      "Portable export failed: " +
        error.message +
        ". Use JSON backup, or open Jikanri through a local server.",
    );
  }
}
let selectedDate = localDateStr(new Date());
let editingJobId = null;
let jobEditorOpen = false;
function generateCalendar(refreshEditor = true) {
  const month = selectedMonth(),
    calendar = document.getElementById("calendar");
  if (!month) return;
  if (!selectedDate.startsWith(month)) selectedDate = month + "-01";
  const dates = monthDateList(month),
    first = parseLocalDate(dates[0]).getDay();
  const plan = Object.fromEntries(lastPlan.map((row) => [row.date, row.pt2]));
  document.getElementById("calendarHelp").textContent = targetJob()
    ? "Planning availability: " +
      targetJob().name +
      ". Off days can still have recorded work."
    : "No planning job selected. You can still record hours for every job.";
  calendar.innerHTML =
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      .map((day) => `<div class="day-header">${day}</div>`)
      .join("") +
    '<div class="day empty" aria-hidden="true"></div>'.repeat(first) +
    dates
      .map((date) => {
        const entry = effectiveEntry(date),
          limits = effectiveSettings(month),
          availability = getAvailability(date),
          proposed = plan[date] || 0;
        const rollingRoom = Math.min(
          ...Array.from({ length: 7 }, (_, i) => {
            const end = addDays(date, i);
            return (
              effectiveSettings(end.slice(0, 7)).rollingLimit -
              rollingActualThrough(end)
            );
          }),
        );
        const over =
          entry.hours > limits.dailyMax + 1e-7 || rollingRoom < -1e-7;
        const near =
          !over && Math.min(limits.dailyMax - entry.hours, rollingRoom) <= 2;
        const jobs = store.jobs.filter(
          (job) => jobHours(store, date, job.id) > 0,
        );
        const state = over
          ? "Over limit"
          : near
            ? "Near limit"
            : targetJob()
              ? availabilityLabel(availability)
              : "";
        const detail = jobs
          .map(
            (job) => job.name + ": " + jobHours(store, date, job.id) + " hours",
          )
          .join(", ");
        return `<button class="day ${date === localDateStr(new Date()) ? "today" : ""} ${date === selectedDate ? "selected" : ""} ${over ? "warning-red" : near ? "near-limit" : ""} ${availability.blocked ? "unavailable" : ""}" data-date="${date}" ${date === localDateStr(new Date()) ? 'aria-current="date"' : ""} aria-pressed="${date === selectedDate}" title="${escapeHTML(availability.reason || "Normally available")}" aria-label="${date}, ${entry.hours} recorded hours${detail ? ", " + escapeHTML(detail) : ""}${proposed ? ", " + proposed + " proposed hours" : ""}, ${state}, ${escapeHTML(availability.reason || "Normally available")}"><span class="day-number">${Number(date.slice(-2))}</span><span class="day-hours">${entry.hours ? entry.hours.toFixed(1) + "h" : "—"}</span>${jobs
          .slice(0, 2)
          .map(
            (job) =>
              `<span class="day-entry" title="${escapeHTML(job.name)}"><i style="background:${job.color}"></i><span class="job-full">${escapeHTML(job.name)}</span><span class="job-short">${escapeHTML([...job.name][0])}</span> ${jobHours(store, date, job.id)}h</span>`,
          )
          .join(
            "",
          )}${jobs.length > 2 ? `<span class="more-jobs">+${jobs.length - 2} jobs</span>` : ""}${proposed ? `<span class="day-proposal">+${proposed}h plan</span>` : ""}<span class="day-state">${state}</span></button>`;
      })
      .join("");
  document.getElementById("rollingDate").value = selectedDate;
  if (refreshEditor !== false) renderDayEditor();
  else {
    document.getElementById("dayTotal").textContent =
      "Day total: " + effectiveEntry(selectedDate).hours.toFixed(1) + "h";
    document.querySelectorAll("[data-remove-entry]").forEach((button) => {
      button.disabled = !jobHours(
        store,
        selectedDate,
        button.dataset.removeEntry,
      );
    });
  }
  updateTotals();
  renderHolidayPreview();
}
function renderMonthlyOverview() {
  const dates = Object.keys(store.entries).filter((date) =>
    date.startsWith(selectedMonth()),
  );
  const totals = store.jobs.map((job) => ({
    job,
    hours: dates.reduce((sum, date) => sum + jobHours(store, date, job.id), 0),
  }));
  const format = (value) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 10 });
  document.getElementById("monthlyOverview").innerHTML =
    `<div class="month-total"><span>Recorded this month</span><strong>${format(totals.reduce((sum, row) => sum + row.hours, 0))}h</strong></div>` +
    totals
      .filter((row) => !row.job.archived || row.hours > 0)
      .map(
        ({ job, hours }) =>
          `<div><span><i class="job-dot" style="background:${job.color}"></i>${escapeHTML(job.name)}${job.archived ? " (archived)" : ""}</span><strong>${format(hours)}h</strong></div>`,
      )
      .join("");
}
function previousRecordedEntry() {
  return (
    Object.keys(store.entries)
      .filter(
        (date) =>
          date < selectedDate &&
          Object.entries(store.entries[date]).some(
            ([id, hours]) =>
              hours > 0 && store.jobs.some((job) => job.id === id),
          ),
      )
      .sort()
      .at(-1) || null
  );
}
function updateCopyEntryButton() {
  const date = previousRecordedEntry();
  document.getElementById("copyLastEntryBtn").disabled = !date;
  document.getElementById("copyEntryStatus").textContent = date
    ? "Copy recorded hours from " + date
    : "No earlier recorded entry to copy.";
}
function copyLastEntry() {
  const date = previousRecordedEntry();
  if (!date) return;
  if (
    effectiveEntry(selectedDate).hours > 0 &&
    !confirm(
      "Replace recorded hours on " +
        selectedDate +
        " with the entry from " +
        date +
        "? You can undo.",
    )
  )
    return;
  makeBackup("before copying entry from " + date);
  store.entries[selectedDate] = Object.fromEntries(
    Object.entries(store.entries[date]).filter(([id]) =>
      store.jobs.some((job) => job.id === id),
    ),
  );
  saveStore("Entry copied");
  clearPlan();
  generateCalendar();
}
function goToToday() {
  selectedDate = localDateStr(new Date());
  selectMonth(selectedDate.slice(0, 7));
  syncSettingsInputs();
  clearPlan();
  generateCalendar();
}
function renderDayEditor() {
  const availability = getAvailability(selectedDate);
  document.getElementById("dayAvailability").textContent = targetJob()
    ? targetJob().name +
      " · " +
      availabilityLabel(availability) +
      (availability.reason ? " — " + availability.reason : "") +
      ". Actual work can always be recorded."
    : "Actual work can always be recorded.";
  document.getElementById("dayTitle").textContent = parseLocalDate(
    selectedDate,
  ).toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  document.getElementById("dayEditor").innerHTML = store.jobs
    .map(
      (job) =>
        `<div class="entry-row"><label><span class="job-name"><span class="job-dot" style="background:${job.color}"></span>${escapeHTML(job.name)}${job.archived ? " <small>(archived)</small>" : ""}</span><input data-job="${job.id}" type="number" min="0" max="24" step="0.5" inputmode="decimal" value="${jobHours(store, selectedDate, job.id) || ""}" placeholder="0" aria-label="${escapeHTML(job.name)} hours on ${selectedDate}"></label><span>h</span><button class="remove-entry" data-remove-entry="${job.id}" aria-label="Remove ${escapeHTML(job.name)} hours" ${!jobHours(store, selectedDate, job.id) ? "disabled" : ""}>×</button></div>`,
    )
    .join("");
  document.getElementById("dayTotal").textContent =
    "Day total: " + effectiveEntry(selectedDate).hours.toFixed(1) + "h";
}
function saveDay(dateStr = selectedDate) {
  const values = [
    ...document.querySelectorAll("#dayEditor input[data-job]"),
  ].map((input) => ({
    id: input.dataset.job,
    hours: input.value === "" ? 0 : Number(input.value),
  }));
  if (
    values.some((v) => !Number.isFinite(v.hours) || v.hours < 0 || v.hours > 24)
  ) {
    document.getElementById("saveStatus").textContent =
      "Enter hours between 0 and 24.";
    return;
  }
  if (!values.some((v) => jobHours(store, dateStr, v.id) !== v.hours)) return;
  makeBackup("before editing " + dateStr);
  for (const value of values)
    recordHours(store, dateStr, value.id, value.hours);
  saveStore();
  clearPlan();
  generateCalendar(false);
}
function updateTotals() {
  renderMonthlyOverview();
  updateCopyEntryButton();
  const dates = monthDateList(selectedMonth()),
    totals = store.jobs.map((job) => ({
      job,
      hours: dates.reduce((sum, d) => sum + jobHours(store, d, job.id), 0),
    })),
    total = totals.reduce((sum, row) => sum + row.hours, 0),
    worked = dates.filter((d) => effectiveEntry(d).hours > 0).length;
  document.getElementById("category-summary").textContent = totals
    .map((row) => row.job.name + ": " + row.hours.toFixed(1) + "h")
    .join(" · ");
  document.getElementById("monthly-total").textContent =
    "Combined month: " + total.toFixed(1) + "h";
  document.getElementById("daily-average").textContent =
    "Average per worked day: " + (total / (worked || 1)).toFixed(1) + "h";
  fullWeekSummary();
}
function renderRolling() {
  const end = document.getElementById("rollingDate").value;
  if (!isDateKey(end)) return;
  const rows = rollingWindow(store.entries, end),
    total = rows.reduce((sum, row) => sum + row.hours, 0),
    limit = effectiveSettings(end.slice(0, 7)).rollingLimit;
  document.getElementById("rollingDetail").innerHTML =
    `<div class="rolling-days">${rows.map((row) => `<div><time datetime="${row.date}" title="${row.date}">${row.date.slice(5).replace("-", "/")}</time><strong>${row.hours.toFixed(1)}h</strong></div>`).join("")}</div><strong>${total.toFixed(1)} / ${limit}h</strong><span class="capacity ${total > limit ? "warning" : ""}">${total > limit ? "Limit exceeded by " + (total - limit).toFixed(1) : "Remaining: " + (limit - total).toFixed(1)}h</span>`;
}
function fullWeekSummary() {
  const month = selectedMonth(),
    dates = monthDateList(month),
    job = targetJob();
  document.getElementById("weekly-summary").innerHTML = [
    ...new Set(dates.map(sundayKey)),
  ]
    .map((week) => {
      const target = Array.from({ length: 7 }, (_, i) =>
        jobHours(store, addDays(week, i)),
      ).reduce((a, b) => a + b, 0);
      return `<p>${week} – ${addDays(week, 6)}: ${escapeHTML(job?.name || "No planning job")} ${target.toFixed(1)} / ${fixedWeekLimit(week)}h</p>`;
    })
    .join("");
  const issues = [...new Set(buildMILP(month).warnings)];
  if (
    dates.reduce((sum, d) => sum + jobHours(store, d), 0) >
    effectiveSettings().researchMonthlyWarning
  )
    issues.push((job?.name || "Job") + ": monthly warning threshold exceeded");
  const host = document.getElementById("research-warnings");
  host.textContent = issues.length
    ? "Recorded-hour warnings: " + issues.join(" · ")
    : "";
  host.hidden = !issues.length;
  renderRolling();
  renderMonthChart();
}
function renderJobs() {
  ensurePlannerJob();
  const eligible = eligibleJobs();
  document.getElementById("plannerJob").innerHTML = eligible.length
    ? eligible
        .map(
          (job) => `<option value="${job.id}">${escapeHTML(job.name)}</option>`,
        )
        .join("")
    : '<option value="">No jobs available</option>';
  document.getElementById("plannerJob").value = store.plannerJobId || "";
  document.getElementById("plannerJob").disabled = !eligible.length;
  document.getElementById("planBtn").disabled = !eligible.length;
  document.getElementById("plannerHelp").textContent = eligible.length
    ? "Choose one job to plan. Recorded hours from every job count toward combined limits."
    : "No jobs are available for scheduling. Enable a job in Settings → Jobs, or restore an archived job.";
  document.getElementById("jobLegend").innerHTML = store.jobs
    .filter(
      (j) =>
        !j.archived || Object.values(store.entries).some((e) => e[j.id] > 0),
    )
    .map(
      (job) =>
        `<span><i class="job-dot" style="background:${job.color}"></i>${escapeHTML(job.name)}${job.archived ? " (archived)" : ""}</span>`,
    )
    .join("");
  const editor = document.getElementById("jobEditor");
  document.getElementById("jobEditorHome").appendChild(editor);
  document.getElementById("jobsList").innerHTML = store.jobs
    .map(
      (job) =>
        `<div class="job-row"><span><i class="job-dot" style="background:${job.color}"></i><strong>${escapeHTML(job.name)}</strong><small>${job.archived ? "Archived" : job.schedulable ? "Available for scheduling" : "Tracking only"}</small></span><div><button data-edit-job="${job.id}" aria-expanded="${jobEditorOpen && editingJobId === job.id}" aria-controls="jobEditor">${jobEditorOpen && editingJobId === job.id ? "Close edit" : "Edit"}</button><button data-archive-job="${job.id}">${job.archived ? "Restore" : "Archive"}</button></div></div><div id="job-slot-${job.id}"></div>`,
    )
    .join("");
  editor.hidden = !jobEditorOpen;
  if (jobEditorOpen)
    document
      .getElementById(editedJob() ? "job-slot-" + editingJobId : "newJobSlot")
      .appendChild(editor);
  document
    .getElementById("newJobBtn")
    .setAttribute("aria-expanded", String(jobEditorOpen && !editingJobId));
}
function resetJobForm(job = null) {
  document.getElementById("jobEditor").style.borderColor =
    job?.color || "var(--accent)";
  editingJobId = job?.id || null;
  document.getElementById("jobMonthLimits").hidden = !job;
  document.getElementById("jobAvailability").hidden = !job;
  document.getElementById("jobFormTitle").textContent = job
    ? "Edit " + job.name
    : "Add a job";
  document.getElementById("jobName").value = job?.name || "";
  document.getElementById("jobColor").value = job?.color || "#2563eb";
  document.getElementById("jobSchedulable").checked = job?.schedulable ?? true;
  document.getElementById("jobWeekdays").innerHTML = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ]
    .map(
      (name, index) =>
        `<label><input type="checkbox" value="${index}" ${(job?.weekdays || [0, 1, 2, 3, 4, 5, 6]).includes(index) ? "checked" : ""}>${name}</label>`,
    )
    .join("");
  document.getElementById("saveJobBtn").textContent = job
    ? "Save job details"
    : "Add job";
  document.getElementById("cancelJobBtn").hidden = false;
  document.getElementById("jobError").textContent = "";
  document.getElementById("jobOverrides").textContent =
    job && Object.keys(job.monthSettings).length
      ? "This job has month-specific limits. Choose This month’s limits below to review them."
      : "";
}
function hasUnsavedJobChanges() {
  if (!jobEditorOpen) return false;
  const job = editedJob();
  const weekdays = [
    ...document.querySelectorAll("#jobWeekdays input:checked"),
  ].map((input) => Number(input.value));
  return (
    document.getElementById("jobName").value.trim() !== (job?.name || "") ||
    document.getElementById("jobColor").value !== (job?.color || "#2563eb") ||
    document.getElementById("jobSchedulable").checked !==
      (job?.schedulable ?? true) ||
    JSON.stringify(weekdays.sort()) !==
      JSON.stringify([...(job?.weekdays || [0, 1, 2, 3, 4, 5, 6])].sort()) ||
    (job &&
      Object.keys(JOB_FIELDS).some(
        (id) =>
          document.getElementById(id).value.trim() === "" ||
          Number(document.getElementById(id).value) !==
            displayedLimitValues()[id],
      )) ||
    [
      "overrideDate",
      "overrideReason",
      "rangeStart",
      "rangeEnd",
      "rangeReason",
      "holidayDate",
    ].some((id) => document.getElementById(id).value)
  );
}
function confirmJobDiscard() {
  return (
    !hasUnsavedJobChanges() ||
    confirm(
      "Discard unsaved job details, working days and unfinished date exceptions? Limits and exceptions already saved stay saved.",
    )
  );
}
function closeJobEditor() {
  if (!confirmJobDiscard()) return;
  const id = editingJobId;
  jobEditorOpen = false;
  editingJobId = null;
  renderJobs();
  (id
    ? document.querySelector(`[data-edit-job="${id}"]`)
    : document.getElementById("newJobBtn")
  )?.focus();
}
function selectEditingJob(id) {
  if (jobEditorOpen && editingJobId === id) {
    closeJobEditor();
    return;
  }
  if (!confirmJobDiscard()) return;
  jobEditorOpen = true;
  resetJobForm(store.jobs.find((job) => job.id === id) || null);
  for (const field of [
    "overrideDate",
    "overrideReason",
    "rangeStart",
    "rangeEnd",
    "rangeReason",
    "holidayDate",
  ])
    document.getElementById(field).value = "";
  document.getElementById("jobBasic").open = true;
  document.getElementById("jobWorking").open = false;
  document.getElementById("jobMonthLimits").open = false;
  renderJobs();
  syncSettingsInputs();
  syncControllerInputs();
  document.getElementById("jobName").focus();
}
function saveJob(event) {
  event.preventDefault();
  const patch = {
    name: document.getElementById("jobName").value.trim(),
    color: document.getElementById("jobColor").value,
    weekdays: [...document.querySelectorAll("#jobWeekdays input:checked")].map(
      (input) => Number(input.value),
    ),
    schedulable: document.getElementById("jobSchedulable").checked,
  };
  try {
    const next = deepClone(store);
    if (editingJobId) updateJob(next, editingJobId, patch);
    else {
      const job = addJob(next, patch.name, patch.color);
      updateJob(next, job.id, patch);
      editingJobId = job.id;
    }
    makeBackup("before saving job");
    store = next;
    jobEditorOpen = true;
    saveStore("Job saved");
    clearPlan();
    syncAllControls();
    generateCalendar();
  } catch (error) {
    document.getElementById("jobError").textContent = error.message;
  }
}
let demoSession = null;
function updateDemoControls() {
  document.getElementById("demoBtn").hidden = !!demoSession;
  for (const id of ["demoMode", "exitDemoBtn", "demoIntro"])
    document.getElementById(id).hidden = !demoSession;
}
function enterDemo() {
  if (demoSession || !confirmJobDiscard()) return;
  const demo = normalizeStore(
    JSON.parse(document.getElementById("demo-data").textContent),
  );
  demoSession = { store, month: selectedMonth(), date: selectedDate };
  demoStorage = new Map();
  store = demo;
  editingJobId = null;
  jobEditorOpen = false;
  selectedDate = "2026-10-01";
  selectMonth("2026-10");
  saveStore("Demo ready — changes stay in this tab");
  syncAllControls();
  clearPlan();
  renderDayEditor();
  renderBackupList();
}
function exitDemo() {
  if (!demoSession || !confirmJobDiscard()) return;
  const previous = demoSession;
  demoSession = null;
  demoStorage = null;
  store = previous.store;
  editingJobId = null;
  jobEditorOpen = false;
  selectedDate = previous.date;
  selectMonth(previous.month);
  syncAllControls();
  clearPlan();
  renderDayEditor();
  renderBackupList();
  document.getElementById("saveStatus").textContent =
    "Your normal schedule is back";
}
function bindEvents() {
  document.getElementById("todayBtn").addEventListener("click", goToToday);
  document
    .getElementById("copyLastEntryBtn")
    .addEventListener("click", copyLastEntry);
  document
    .getElementById("jobLimitScope")
    .addEventListener("change", syncSettingsInputs);
  document
    .getElementById("copyGlobalLimitsBtn")
    .addEventListener("click", () => copyPreviousMonthLimits("global"));
  document
    .getElementById("resetGlobalLimitsBtn")
    .addEventListener("click", () => resetSelectedMonthLimits("global"));
  document
    .getElementById("defaultGlobalLimitsBtn")
    .addEventListener("click", () => setDisplayedLimitsAsDefaults("global"));
  document
    .getElementById("newJobBtn")
    .addEventListener("click", () => selectEditingJob(null));
  document
    .querySelector('a[href="#settings"]')
    .addEventListener("click", () => {
      document.getElementById("settings").open = true;
    });
  document.getElementById("calendar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    selectedDate = button.dataset.date;
    generateCalendar();
    document.querySelector(`[data-date="${selectedDate}"]`).focus();
  });
  document.getElementById("calendar").addEventListener("keydown", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    const days = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ];
    if (!days) return;
    event.preventDefault();
    const next = addDays(button.dataset.date, days);
    selectMonth(next.slice(0, 7));
    selectedDate = next;
    syncSettingsInputs();
    clearPlan();
    generateCalendar();
    document.querySelector(`[data-date="${next}"]`).focus();
  });
  document
    .getElementById("dayEditor")
    .addEventListener("change", () => saveDay());
  document.getElementById("dayEditor").addEventListener("click", (event) => {
    const id = event.target.dataset.removeEntry;
    if (!id) return;
    makeBackup("before removing hours");
    recordHours(store, selectedDate, id, 0);
    saveStore();
    clearPlan();
    generateCalendar();
  });
  document.getElementById("month").addEventListener("change", () => {
    syncSettingsInputs();
    clearPlan();
    generateCalendar();
  });
  for (const [id, delta] of [
    ["prevMonthBtn", -1],
    ["nextMonthBtn", 1],
  ])
    document.getElementById(id).addEventListener("click", () => {
      const current = selectedMonth(),
        date = parseLocalDate(current + "-01");
      date.setMonth(date.getMonth() + delta);
      const next = localDateStr(date).slice(0, 7);
      selectMonth(next);
      syncSettingsInputs();
      clearPlan();
      generateCalendar();
    });
  document.getElementById("rollingDate").addEventListener("change", (event) => {
    const date = event.target.value;
    if (!isDateKey(date)) return;
    const month = date.slice(0, 7);
    selectMonth(month);
    selectedDate = date;
    syncSettingsInputs();
    generateCalendar();
    clearPlan();
  });
  document.getElementById("plannerJob").addEventListener("change", (event) => {
    makeBackup("before changing selected job");
    store.plannerJobId = event.target.value;
    saveStore();
    clearPlan();
    renderJobs();
    generateCalendar();
  });
  document.getElementById("jobForm").addEventListener("submit", saveJob);
  document
    .getElementById("cancelJobBtn")
    .addEventListener("click", closeJobEditor);
  document.getElementById("jobsList").addEventListener("click", (event) => {
    const edit = event.target.dataset.editJob,
      archive = event.target.dataset.archiveJob;
    if (edit) selectEditingJob(edit);
    if (archive) {
      if (!confirmJobDiscard()) return;
      makeBackup("before changing archive status");
      const job = store.jobs.find((j) => j.id === archive);
      updateJob(store, archive, { archived: !job.archived });
      saveStore("Job status saved");
      clearPlan();
      syncAllControls();
      generateCalendar();
    }
  });
  const actions = {
    planBtn: generatePT2Plan,
    applyPlanBtn: applyOptimizedPlan,
    undoBtn: undoLastChange,
    redoBtn: redoLastUndo,
    exportBtn: exportBackup,
    portableBtn: downloadPortableCopy,
    restoreEmbeddedBtn: restoreEmbeddedSnapshot,
    restoreBackupBtn: restoreLatestBackup,
    resetMonthBtn: resetCurrentMonth,
    resetAllBtn: resetAll,
    resetRulesBtn: resetControllerRules,
    addOverrideBtn: addDateOverride,
    addRangeBtn: addBlockedRange,
    resetMonthLimitsBtn: resetSelectedMonthLimits,
    setDefaultLimitsBtn: setDisplayedLimitsAsDefaults,
    copyPrevLimitsBtn: copyPreviousMonthLimits,
  };
  for (const [id, action] of Object.entries(actions))
    document.getElementById(id).addEventListener("click", action);
  document.getElementById("planTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-apply-plan-date]");
    if (button) applyPlanDate(button.dataset.applyPlanDate);
  });
  document.getElementById("backupList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-restore-version]");
    if (button) restoreVersion(button.dataset.restoreVersion);
  });
  document
    .getElementById("importBtn")
    .addEventListener("click", () =>
      document.getElementById("importFile").click(),
    );
  document.getElementById("importFile").addEventListener("change", (event) => {
    if (event.target.files[0]) importBackupFile(event.target.files[0]);
    event.target.value = "";
  });
  for (const id of Object.keys(DEFAULT_SETTINGS))
    document
      .getElementById(id)
      .addEventListener("change", readSettingsFromInputs);
  for (const id of ["blockWeekends", "useOriginalHolidays"])
    document.getElementById(id).addEventListener("change", saveRecurringRules);
  document
    .getElementById("overrideMode")
    .addEventListener("change", toggleOverrideMax);
  document.getElementById("presetBtn").addEventListener("click", () => {
    makeBackup("before student planning preset");
    store.monthSettings[selectedMonth()] = {
      ...store.monthSettings[selectedMonth()],
      rollingLimit: 28,
    };
    saveStore();
    syncSettingsInputs();
    clearPlan();
    generateCalendar();
  });
  document.getElementById("demoBtn").addEventListener("click", enterDemo);
  document.getElementById("exitDemoBtn").addEventListener("click", exitDemo);
  document.getElementById("demoPlanLink").addEventListener("click", () => {
    document.getElementById("planner").open = true;
  });
  document.getElementById("addHolidayBtn").addEventListener("click", () => {
    const date = document.getElementById("holidayDate").value;
    if (!isDateKey(date)) {
      alert("Choose a valid date.");
      return;
    }
    makeBackup("before adding holiday");
    const c = effectiveConstraints();
    c.holidays = c.holidays.filter((x) => x.date !== date);
    c.holidays.push({ date, reason: "Holiday" });
    document.getElementById("holidayDate").value = "";
    c.useOriginalHolidays = true;
    editedJob().constraints = c;
    saveStore();
    syncControllerInputs();
    generateCalendar();
    clearPlan();
  });
  document
    .getElementById("holidayPreview")
    .addEventListener("click", (event) => {
      const date = event.target.dataset.removeHoliday;
      if (!date) return;
      makeBackup("before removing holiday");
      editedJob().constraints.holidays = effectiveConstraints().holidays.filter(
        (x) => x.date !== date,
      );
      saveStore();
      generateCalendar();
      clearPlan();
    });
}
store = loadStore();
window.addEventListener("load", () => {
  populateMonthDropdown();
  bindEvents();
  syncAllControls();
  generateCalendar();
  renderBackupList();
  clearPlan();
  if (storageWarning)
    document.getElementById("saveStatus").textContent = storageWarning;
});

function selectMonth(month) {
  const select = document.getElementById("month");
  if (![...select.options].some((option) => option.value === month)) {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = month;
    select.appendChild(option);
  }
  select.value = month;
}
