function renderMonthChart() {
  const month = selectedMonth();
  if (!month) return;
  const dates = monthDateList(month),
    plan = Object.fromEntries(lastPlan.map((row) => [row.date, row.pt2 || 0]));
  const recorded = dates.reduce(
      (sum, date) => sum + effectiveEntry(date).hours,
      0,
    ),
    suggested = Object.values(plan).reduce((a, b) => a + b, 0);
  document.getElementById("monthMetrics").innerHTML =
    `<div><span>Recorded</span><strong>${recorded.toFixed(1)}h</strong></div><div><span>Suggested</span><strong>${suggested.toFixed(1)}h</strong></div><div><span>Projected</span><strong>${(recorded + suggested).toFixed(1)}h</strong></div>`;
  const max = Math.max(
      8,
      ...dates.map((date) => effectiveEntry(date).hours + (plan[date] || 0)),
    ),
    height = 200,
    step = 960 / dates.length,
    width = step * 0.7;
  let out = "";
  for (let hours = 0; hours <= max; hours += Math.max(2, Math.ceil(max / 4))) {
    const y = 220 - (hours / max) * height;
    out += `<line x1="30" x2="1000" y1="${y}" y2="${y}" stroke="#e5e7eb"/><text x="0" y="${y}" font-size="12">${hours}h</text>`;
  }
  dates.forEach((date, index) => {
    const x = 30 + index * step;
    let y = 220;
    for (const job of [
      ...store.jobs,
      { id: "suggested", name: "Suggested", color: "#94a3b8" },
    ]) {
      const hours =
          job.id === "suggested"
            ? plan[date] || 0
            : jobHours(store, date, job.id),
        h = (hours / max) * height;
      y -= h;
      if (h)
        out += `<rect x="${x}" y="${y}" width="${width}" height="${h}" fill="${job.color}"><title>${date}: ${escapeHTML(job.name)} ${hours}h</title></rect>`;
    }
    if (index % 5 === 0)
      out += `<text x="${x}" y="244" font-size="12">${index + 1}</text>`;
  });
  document.getElementById("monthChart").innerHTML = out;
}
