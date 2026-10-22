function plannerDayInfo(dateStr, s, state = store) {
  const actual = entryFor(state.entries, dateStr).hours;
  const availability = jobAvailability(dateStr, targetJob(state));
  let cap = Math.max(
    0,
    Math.min(s.pt2DailyMax - jobHours(state, dateStr), s.dailyMax - actual),
  );
  if (availability.blocked) cap = 0;
  if (availability.maxHours !== null)
    cap = Math.min(
      cap,
      Math.max(0, availability.maxHours - jobHours(state, dateStr)),
    );
  cap = Math.floor((cap + 1e-9) * 2) / 2;
  if (cap < s.minPt2Hours) cap = 0;
  return { actual, availability, cap };
}
function monthDateList(month) {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from(
    { length: n },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}
function variableSafe(dateStr) {
  return dateStr.replaceAll("-", "_");
}

function buildMILP(month, state = store) {
  const s = settingsFor(state, month);
  const dates = monthDateList(month);
  const monthStart = dates[0];
  const monthEnd = dates[dates.length - 1];
  const model = {
    optimize: "score",
    opType: "max",
    constraints: {},
    variables: {},
    ints: {},
    binaries: {},
    options: { timeout: 8000, tolerance: 0 },
  };
  const infos = {};
  const warnings = baselineIssues(month, state);
  const existingPt2Month = dates.reduce((a, d) => a + jobHours(state, d), 0);
  const monthlyRemaining = Math.max(0, s.monthlyPt2Limit - existingPt2Month);
  if (existingPt2Month > s.monthlyPt2Limit + 1e-9)
    warnings.push(
      `Recorded hours for the selected job is already ${existingPt2Month.toFixed(2)}h, above the monthly job cap.`,
    );
  model.constraints.monthly_pt2 = { max: monthlyRemaining };
  const weekResearch = {};
  for (const d of dates) {
    const wk = sundayKey(d);
    if (weekResearch[wk] !== undefined) continue;
    let total = 0;
    for (let i = 0; i < 7; i++) total += jobHours(state, addDays(wk, i));
    weekResearch[wk] = total;
  }
  for (const [wk, hrs] of Object.entries(weekResearch)) {
    const remaining = Math.max(0, fixedWeekLimit(wk, state) - hrs);
    if (hrs > fixedWeekLimit(wk, state) + 1e-9)
      warnings.push(
        `Recorded hours for the selected job in week starting ${wk} is ${hrs.toFixed(2)}h, above the weekly job cap.`,
      );
    model.constraints[`week_${wk.replaceAll("-", "_")}`] = { max: remaining };
  }
  for (const d of dates) {
    const key = variableSafe(d);
    const u = `u_${key}`;
    const z = `z_${key}`;
    const info = plannerDayInfo(d, s, state);
    infos[d] = info;
    const maxUnits = Math.floor(info.cap * 2 + 1e-9);
    const minUnits = Math.ceil(s.minPt2Hours * 2 - 1e-9);
    const upper = `link_max_${key}`;
    const lower = `link_min_${key}`;
    model.constraints[upper] = { max: 0 };
    model.constraints[lower] = { min: 0 };
    model.variables[u] = {
      score: 1000,
      [upper]: 1,
      [lower]: 1,
      monthly_pt2: 0.5,
    };
    model.variables[z] = { score: -1, [upper]: -maxUnits, [lower]: -minUnits };
    model.ints[u] = 1;
    model.binaries[z] = 1;
    const wk = sundayKey(d);
    model.variables[u][`week_${wk.replaceAll("-", "_")}`] = 0.5;
  }
  for (
    let cursor = monthStart;
    cursor <= addDays(monthEnd, 6);
    cursor = addDays(cursor, 1)
  ) {
    let fixed = 0;
    const vars = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(cursor, -i);
      fixed += entryFor(state.entries, d).hours;
      if (d >= monthStart && d <= monthEnd) vars.push(d);
    }
    const rollingSettings = settingsFor(state, cursor.slice(0, 7));
    const rollingLimit = rollingSettings.rollingLimit;
    const remaining = Math.max(0, rollingLimit - fixed);
    if (fixed > rollingLimit + 1e-9)
      warnings.push(
        `Actual hours already exceed the ${rollingLimit.toFixed(1)}h rolling limit through ${cursor} (${fixed.toFixed(2)}h).`,
      );
    const cname = `roll_${variableSafe(cursor)}`;
    model.constraints[cname] = { max: remaining };
    for (const d of vars) model.variables[`u_${variableSafe(d)}`][cname] = 0.5;
  }
  return { model, dates, infos, warnings, existingPt2Month };
}

function extractPlanFromResult(build, result) {
  const plan = {};
  for (const d of build.dates) {
    const units = Number(result[`u_${variableSafe(d)}`] ?? 0);
    plan[d] = validateSolverUnits(units) * 0.5;
  }
  return plan;
}

function verifyPlan(month, plan, state = store) {
  const s = settingsFor(state, month);
  const dates = monthDateList(month);
  const issues = [];
  let monthPlan = 0;
  const weekly = {};
  for (const key of Object.keys(plan))
    if (!dates.includes(key)) issues.push(`${key}: outside selected month`);
  for (const d of dates) {
    const info = plannerDayInfo(d, s, state);
    const x = Number(plan[d] ?? 0);
    if (!Number.isFinite(x)) issues.push(`${d}: nonfinite addition`);
    if (Math.abs(x * 2 - Math.round(x * 2)) > 1e-7)
      issues.push(`${d}: not on a 0.5h increment`);
    if (x < -1e-9 || x > info.cap + 1e-7)
      issues.push(`${d}: exceeds daily/availability cap`);
    if (x > 1e-9 && x < s.minPt2Hours - 1e-7)
      issues.push(`${d}: below minimum job block`);
    monthPlan += x;
    const wk = sundayKey(d);
    weekly[wk] = (weekly[wk] || 0) + x;
  }
  const existingPt2 = dates.reduce((a, d) => a + jobHours(state, d), 0);
  if (existingPt2 <= s.monthlyPt2Limit + 1e-7) {
    if (monthPlan + existingPt2 > s.monthlyPt2Limit + 1e-7)
      issues.push("monthly job cap exceeded");
  } else if (monthPlan > 1e-7)
    issues.push(
      "additional job hours scheduled although the monthly job cap is already exceeded by recorded job hours",
    );
  for (const [wk, x] of Object.entries(weekly)) {
    let existing = 0;
    for (let i = 0; i < 7; i++) existing += jobHours(state, addDays(wk, i));
    if (existing <= fixedWeekLimit(wk, state) + 1e-7) {
      if (x + existing > fixedWeekLimit(wk, state) + 1e-7)
        issues.push(`weekly job cap exceeded for ${wk}`);
    } else if (x > 1e-7)
      issues.push(
        `additional job hours scheduled in week ${wk} although its job cap is already exceeded`,
      );
  }
  const end = dates[dates.length - 1];
  for (
    let cursor = dates[0];
    cursor <= addDays(end, 6);
    cursor = addDays(cursor, 1)
  ) {
    let actual = 0,
      planned = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(cursor, -i);
      actual += entryFor(state.entries, d).hours;
      planned += plan[d] || 0;
    }
    const rollingLimit = settingsFor(state, cursor.slice(0, 7)).rollingLimit;
    if (actual <= rollingLimit + 1e-7) {
      if (actual + planned > rollingLimit + 1e-7)
        issues.push(`rolling limit exceeded through ${cursor}`);
    } else if (planned > 1e-7)
      issues.push(
        `additional job hours scheduled in an already-over-limit rolling window through ${cursor}`,
      );
  }
  return issues;
}

function heuristicPlan(month, state = store) {
  const s = settingsFor(state, month);
  const dates = monthDateList(month);
  const plan = Object.fromEntries(dates.map((d) => [d, 0]));
  const min = s.minPt2Hours;
  const choices = [];
  for (const d of dates) {
    const info = plannerDayInfo(d, s, state);
    if (info.cap >= min) choices.push(d);
  }
  const orders = [
    choices.slice(),
    choices.slice().reverse(),
    choices
      .slice()
      .sort(
        (a, b) =>
          plannerDayInfo(b, s, state).cap - plannerDayInfo(a, s, state).cap,
      ),
    choices
      .slice()
      .sort(
        (a, b) =>
          plannerDayInfo(a, s, state).cap - plannerDayInfo(b, s, state).cap,
      ),
  ];
  let best = null;
  function feasible(candidate) {
    return verifyPlan(month, candidate, state).length === 0;
  }
  for (const order of orders) {
    const p = Object.fromEntries(dates.map((d) => [d, 0]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of order) {
        const info = plannerDayInfo(d, s, state);
        const add = p[d] === 0 ? Math.max(0.5, Math.ceil(min * 2) / 2) : 0.5;
        if (add <= 0 || p[d] + add > info.cap + 1e-9) continue;
        const trial = { ...p, [d]: p[d] + add };
        if (feasible(trial)) {
          p[d] += add;
          changed = true;
        }
      }
    }
    const total = Object.values(p).reduce((a, b) => a + b, 0);
    const active = Object.values(p).filter((x) => x > 0).length;
    if (
      !best ||
      total > best.total + 1e-9 ||
      (Math.abs(total - best.total) < 1e-9 && active < best.active)
    )
      best = { plan: p, total, active };
  }
  return best ? best.plan : plan;
}

function generatePT2Plan() {
  if (
    !targetJob() ||
    !eligibleJobs().some((job) => job.id === store.plannerJobId)
  ) {
    clearPlan();
    return;
  }
  const button = document.getElementById("planBtn");
  button.disabled = true;
  button.textContent = "Finding hours…";
  const month = document.getElementById("month").value;
  const summary = document.getElementById("planSummary");
  summary.innerHTML =
    '<span class="pill info-pill">Optimizing</span> Finding available hours…';
  document.getElementById("planTable").innerHTML = "";
  setTimeout(() => {
    const build = buildMILP(month);
    let plan = null;
    let mode = "";
    let result = null;
    let solveError = solverAvailable()
      ? ""
      : "The solver is unavailable; using the fallback heuristic.";
    if (solverAvailable()) {
      try {
        result = window.solver.Solve(build.model);
        if (
          result &&
          result.feasible === true &&
          result.bounded === true &&
          Number.isFinite(result.result)
        )
          plan = extractPlanFromResult(build, result);
        else
          solveError =
            "The solver returned no usable complete result; using the fallback heuristic.";
        mode = "MILP feasible — optimality not certified";
      } catch (err) {
        solveError = String((err && err.message) || err);
      }
    }
    if (plan) {
      const issues = verifyPlan(month, plan);
      if (issues.length) {
        solveError = `Solver result failed independent verification: ${issues.slice(0, 3).join("; ")}`;
        plan = null;
      }
    }
    if (!plan) {
      plan = heuristicPlan(month);
      mode = "Offline fallback heuristic";
    }
    const issues = verifyPlan(month, plan);
    lastPlan = build.dates.map((d) => {
      const info = plannerDayInfo(d, effectiveSettings(month));
      const pt2 = plan[d] || 0;
      let rolling = 0;
      for (let i = 0; i < 7; i++) {
        const x = addDays(d, -i);
        rolling += effectiveEntry(x).hours + (plan[x] || 0);
      }
      return {
        date: d,
        weekday: parseLocalDate(d).toLocaleDateString(undefined, {
          weekday: "short",
        }),
        actual: info.actual,
        existingPt2: researchHoursForDate(d),
        pt2,
        total: info.actual + pt2,
        rolling,
        availability: info.availability,
        cap: info.cap,
      };
    });
    lastSolverMeta = {
      mode,
      jobId: store.plannerJobId,
      warnings: build.warnings,
      issues,
      solveError,
      solverAvailable: solverAvailable(),
      objective: result && result.result !== undefined ? result.result : null,
    };
    renderPlan();
    generateCalendar(false);
    button.disabled = !eligibleJobs().length;
    button.textContent = "Find available work hours";
  }, 0);
}

function applyOptimizedPlan() {
  if (!lastPlan.length) {
    alert("Find available work hours first.");
    return;
  }
  if (!validatePendingPlan()) return;
  const additions = lastPlan.filter((r) => r.pt2 > 0);
  if (!additions.length) {
    alert("The optimized plan has no additional hours to apply.");
    return;
  }
  const total = additions.reduce((a, r) => a + r.pt2, 0);
  if (
    !confirm(
      `Apply ALL ${total.toFixed(1)} suggested hours across ${additions.length} days?\n\nThis changes your saved entries for the selected job. A version snapshot will be created first so you can Undo.`,
    )
  )
    return;
  makeBackup("before applying all suggested hours");
  for (const r of additions) {
    const e = effectiveEntry(r.date);
    store.entries[r.date] = {
      ...e.byJob,
      [store.plannerJobId]: jobHours(store, r.date) + r.pt2,
    };
  }
  saveStore("All suggested hours applied");
  generateCalendar();
  clearPlan();
}
function applyPlanDate(dateStr) {
  const row = lastPlan.find((r) => r.date === dateStr);
  if (!row || row.pt2 <= 0) {
    alert("There is no unapplied suggestion for this date.");
    return;
  }
  if (!validatePendingPlan()) return;
  const amount = row.pt2;
  if (
    !confirm(
      `Apply +${amount.toFixed(1)}h for ${targetJob().name} to ${dateStr}?\n\nOnly this date will change. You can Undo afterward.`,
    )
  )
    return;
  makeBackup(`before applying suggested hours on ${dateStr}`);
  const e = effectiveEntry(dateStr);
  store.entries[dateStr] = {
    ...e.byJob,
    [store.plannerJobId]: jobHours(store, dateStr) + amount,
  };
  saveStore(
    `Applied +${amount.toFixed(1)}h for ${targetJob().name} on ${dateStr}`,
  );
  row.actual += amount;
  row.existingPt2 += amount;
  row.pt2 = 0;
  generateCalendar();
  clearPlan();
}

function renderPlan() {
  const container = document.getElementById("planTable"),
    summary = document.getElementById("planSummary");
  if (!lastPlan.length) {
    container.innerHTML = "";
    summary.textContent = targetJob()
      ? "Choose a job and find available work hours."
      : "Enable a job for scheduling to get started.";
    return;
  }
  const meta = lastSolverMeta || {},
    job = targetJob(),
    month = selectedMonth(),
    plan = Object.fromEntries(lastPlan.map((row) => [row.date, row.pt2]));
  const total = lastPlan.reduce((sum, row) => sum + row.pt2, 0),
    recorded = lastPlan.reduce((sum, row) => sum + row.actual, 0),
    active = lastPlan.filter((row) => row.pt2 > 0);
  const capacities = lastPlan.map((row) =>
    remainingCapacity(row.date, month, plan),
  );
  const monthlyRemaining = Math.max(
    0,
    effectiveSettings(month).monthlyPt2Limit -
      lastPlan.reduce((sum, row) => sum + row.existingPt2 + row.pt2, 0),
  );
  const reasons = [
    ...new Set(
      capacities
        .filter((capacity) => !capacity.canAdd)
        .flatMap((capacity) => capacity.reasons),
    ),
  ];
  summary.innerHTML = `<strong>${total > 0 ? "Schedule ready — " + total.toFixed(1) + " more hours" : "No additional hours fit within the current limits"}</strong><p>${escapeHTML(job.name)} · ${active.length} working ${active.length === 1 ? "day" : "days"}<br>Recorded across all jobs: ${recorded.toFixed(1)}h · Projected: ${(recorded + total).toFixed(1)}h<br>Monthly job capacity left after this plan: ${monthlyRemaining.toFixed(1)}h</p><p>${meta.issues?.length ? "Suggestions failed verification" : "Additional hours passed verification"}. ${meta.mode?.startsWith("MILP") ? "Solver result: feasible, optimality unproven." : "Heuristic result: optimality not guaranteed."}</p>${meta.solveError ? `<p class="note">${escapeHTML(meta.solveError)}</p>` : ""}${meta.warnings?.length ? `<details><summary>Existing records need attention (${meta.warnings.length})</summary><p class="warning">${escapeHTML(meta.warnings.join(" · "))}</p></details>` : ""}${meta.issues?.length ? `<p class="warning">${escapeHTML(meta.issues.join("; "))}</p>` : ""}${reasons.length ? `<details><summary>What limits more hours?</summary><p class="note">${escapeHTML(reasons.join(" · "))}</p><p class="note">These are the remaining bounds, not a proof that no better arrangement exists.</p></details>` : ""}`;
  container.innerHTML = active
    .map((row) => {
      const capacity = remainingCapacity(row.date, month, plan);
      return `<div class="suggestion"><div><strong>${row.date} · +${row.pt2.toFixed(1)}h proposed</strong><span>Recorded ${row.actual.toFixed(1)}h · Projected day ${row.total.toFixed(1)}h · Rolling ${row.rolling.toFixed(1)}h</span><span>${capacity.hours.toFixed(1)}h further capacity · ${escapeHTML(capacity.reasons[0] || "")}</span></div><button data-apply-plan-date="${row.date}" ${meta.issues?.length ? "disabled" : ""}>Apply</button></div>`;
    })
    .join("");
  document.getElementById("applyPlanBtn").disabled =
    !total || !!meta.issues?.length;
  renderMonthChart();
}

function clearPlan() {
  lastPlan = [];
  lastSolverMeta = null;
  document.getElementById("applyPlanBtn").disabled = true;
  renderPlan();
  generateCalendar(false);
  renderMonthChart();
}

function fixedWeekLimit(wk, state = store) {
  return Math.min(
    ...Array.from(
      { length: 7 },
      (_, i) => settingsFor(state, addDays(wk, i).slice(0, 7)).weeklyPt2Limit,
    ),
  );
}
function validateSolverUnits(units) {
  if (
    !Number.isFinite(units) ||
    units < -1e-7 ||
    Math.abs(units - Math.round(units)) > 1e-7
  )
    throw new Error("Solver returned invalid half-hour units");
  return Math.max(0, Math.round(units));
}
function validatePendingPlan() {
  if (lastSolverMeta?.jobId && lastSolverMeta.jobId !== store.plannerJobId) {
    clearPlan();
    alert("The job changed. Find available hours again.");
    return false;
  }
  const issues = verifyPlan(
    selectedMonth(),
    Object.fromEntries(lastPlan.map((r) => [r.date, r.pt2])),
  );
  if (issues.length) {
    clearPlan();
    alert("Plan invalidated: " + issues.join("; "));
    return false;
  }
  return true;
}
function baselineIssues(month, state = store) {
  const issues = [];
  for (const date of monthDateList(month)) {
    const entry = entryFor(state.entries, date),
      s = settingsFor(state, date.slice(0, 7));
    if (entry.hours > s.dailyMax + 1e-7)
      issues.push(date + ": recorded total exceeds daily limit");
    for (const job of state.jobs) {
      const hours = jobHours(state, date, job.id),
        limits = jobSettings(job, date.slice(0, 7));
      if (hours > limits.dailyMax + 1e-7)
        issues.push(`${date}: ${job.name} exceeds its daily limit`);
      if (hours > 0 && Math.abs(hours * 2 - Math.round(hours * 2)) > 1e-7)
        issues.push(
          `${date}: ${job.name} has hours outside the half-hour grid`,
        );
      if (job.id === state.plannerJobId && hours > 0) {
        const availability = jobAvailability(date, job);
        if (
          !job.archived &&
          job.schedulable &&
          (availability.blocked ||
            (availability.maxHours !== null && hours > availability.maxHours))
        )
          issues.push(
            `${date}: recorded ${job.name} hours fall outside planning availability (historical hours retained)`,
          );
      }
    }
  }
  return issues;
}

function remainingCapacity(date, month, plan = {}, state = store) {
  const s = settingsFor(state, date.slice(0, 7)),
    entry = entryFor(state.entries, date),
    availability = jobAvailability(date, targetJob(state));
  const used = plan[date] || 0;
  const bounds = [
    { name: "Combined daily limit", hours: s.dailyMax - entry.hours - used },
    {
      name: "Job daily limit",
      hours: s.pt2DailyMax - jobHours(state, date) - used,
    },
  ];
  if (availability.blocked)
    bounds.push({ name: availability.reason || "Unavailable date", hours: 0 });
  else if (availability.maxHours !== null)
    bounds.push({
      name: "Date-specific maximum",
      hours: availability.maxHours - jobHours(state, date) - used,
    });
  const monthSettings = settingsFor(state, month),
    dates = monthDateList(month);
  bounds.push({
    name: "Monthly job limit",
    hours:
      monthSettings.monthlyPt2Limit -
      dates.reduce((sum, d) => sum + jobHours(state, d) + (plan[d] || 0), 0),
  });
  const week = sundayKey(date);
  bounds.push({
    name: "Sunday–Saturday job limit",
    hours:
      fixedWeekLimit(week, state) -
      Array.from({ length: 7 }, (_, i) => addDays(week, i)).reduce(
        (sum, d) => sum + jobHours(state, d) + (plan[d] || 0),
        0,
      ),
  });
  for (let i = 0; i < 7; i++) {
    const end = addDays(date, i),
      hours = rollingWindow(state.entries, end).reduce(
        (sum, row) => sum + row.hours + (plan[row.date] || 0),
        0,
      );
    bounds.push({
      name: "Rolling window ending " + end,
      hours: settingsFor(state, end.slice(0, 7)).rollingLimit - hours,
    });
  }
  const minimum = Math.min(...bounds.map((bound) => bound.hours)),
    hours = Math.max(0, Math.floor((minimum + 1e-9) * 2) / 2),
    block = used > 0 ? 0.5 : Math.max(0.5, Math.ceil(s.minPt2Hours * 2) / 2);
  const reasons = bounds
    .filter((bound) => bound.hours <= minimum + 1e-7)
    .map((bound) => bound.name);
  if (hours > 0 && hours < block)
    reasons.push("Less than the " + block + "h minimum additional block");
  return { hours, canAdd: hours >= block, reasons };
}
