import { useState } from "react";
import { ClientBadge, StatusBadge, Loading, EmptyState } from "../../components/index.jsx";
import { useHistory } from "../../hooks/useHistory";
import { normaliseEntry } from "../../utils/aggregator";
import { fmt, TODAY, MONTHS } from "../../utils/dates";
import { BANDWIDTH, BW_STYLES } from "../../utils/constants";

// ── Constants ─────────────────────────────────────────────────────────────────
const OUTCOME_STYLE = {
  "Done":       { color: "var(--green)", bg: "var(--green-bg)", bd: "var(--green-bd)" },
  "Carry over": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Blocked":    { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
};
const PRIORITY_STYLE = {
  "High":   { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "Medium": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Low":    { color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
};
const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri"];

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function AgeBar({ startDate, dueDate, isDone }) {
  if (!startDate) return null;
  const start  = new Date(startDate);
  const todayD = new Date(TODAY);
  const days   = Math.floor((todayD - start) / 86400000) + 1;
  if (days < 0) return null;
  let barColor = "var(--green)", pct = 30;
  if (!isDone && dueDate) {
    const total   = Math.max(1, Math.floor((new Date(dueDate) - start) / 86400000));
    const elapsed = Math.floor((todayD - start) / 86400000);
    pct      = Math.min(100, Math.round((elapsed / total) * 100));
    barColor = pct >= 100 ? "var(--red)" : pct >= 75 ? "var(--amber)" : "var(--green)";
  } else if (isDone) { barColor = "var(--green)"; pct = 100; }
  const textColor = !isDone && dueDate && new Date(dueDate) < todayD
    ? "var(--red)" : !isDone && pct >= 75 ? "var(--amber)" : isDone ? "var(--green)" : "var(--muted)";
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      <span style={{ fontSize:11, fontWeight:500, color:textColor }}>{days}d{!isDone ? " active" : " total"}</span>
      <div style={{ width:48, height:3, borderRadius:2, background:"var(--border)", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, borderRadius:2, background:barColor }} />
      </div>
    </div>
  );
}

function buildCarryOvers(entries) {
  const taskMap = {};

  // Sort entries chronologically to process in order
  const sorted = [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  sorted.forEach(e => {
    const eodTasks = e.eod?.tasks || [];
    const sodTasks = e.sod?.tasks || [];

    eodTasks.forEach((t, i) => {
      if (!t.text?.trim()) return;
      const sodTask = sodTasks[i] || {};

      // Stable key — text + client only, no date-based origin that can drift
      const key     = `${t.client || ""}|${t.text.trim()}`;
      const isCarry = t.outcome === "Carry over" || t.outcome === "Blocked" || sodTask.isCarryOver === true;
      const isDone  = t.outcome === "Done" && sodTask.isCarryOver === true;

      // Create entry on first carry-over occurrence
      if (isCarry && !taskMap[key]) {
        taskMap[key] = {
          client:        t.client        || "",
          text:          t.text          || "",
          priority:      t.priority      || sodTask.priority  || "Medium",
          startDate:     t.startDate     || sodTask.startDate || sodTask.carryOverFrom || e.date,
          dueDate:       t.dueDate       || sodTask.dueDate   || "",
          endDate:       "",
          outcome:       t.outcome,
          blockerDetail: t.blockerDetail || "",
          blockerOwner:  t.blockerOwner  || "",
          notes:         t.notes         || "",
        };
      }

      // Update with latest carry-over notes/status while still active
      if (isCarry && taskMap[key] && taskMap[key].outcome !== "Done") {
        taskMap[key].outcome       = t.outcome;
        taskMap[key].notes         = t.notes         || taskMap[key].notes;
        taskMap[key].blockerDetail = t.blockerDetail || taskMap[key].blockerDetail;
        taskMap[key].blockerOwner  = t.blockerOwner  || taskMap[key].blockerOwner;
        taskMap[key].dueDate       = t.dueDate       || sodTask.dueDate || taskMap[key].dueDate;
      }

      // Resolve when carried-over task is marked Done
      if (isDone && taskMap[key] && taskMap[key].outcome !== "Done") {
        taskMap[key].outcome = "Done";
        taskMap[key].endDate = t.endDate || e.date;
      }
    });
  });

  return Object.values(taskMap);
}
// ── Week strip calendar ───────────────────────────────────────────────────────
function WeekCalendar({ year, month, entries, selectedDate, onSelect, onNavigate }) {
  // Build weekday-only cells for the month
  const firstDay   = new Date(year, month, 1);
  const lastDay    = new Date(year, month + 1, 0);
  const entryMap   = {};
  entries.forEach(e => { entryMap[e.date] = e; });

  // Group days into Mon-Fri weeks
  const weeks = [];
  let week    = [];
  const d     = new Date(firstDay);
  // rewind to Monday of the week containing the 1st
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));

  while (d <= lastDay || week.length > 0) {
    const dayOfWeek = d.getDay(); // 0=Sun,6=Sat
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      // ISO date string
      const iso  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const inMonth = d.getMonth() === month && d.getFullYear() === year;
      const entry   = entryMap[iso];
      const isFuture = iso > TODAY;

      // Outcome summary for tooltip pills
      const eodTasks   = entry?.eod?.tasks || (entry?.tasks) || [];
      const doneCount  = eodTasks.filter(t => t.outcome === "Done"   || t.status === "Done").length;
      const carryCount = eodTasks.filter(t => t.outcome === "Carry over").length;
      const blockCount = eodTasks.filter(t => t.outcome === "Blocked" || t.status === "Blocked").length;
      const hasBlocker = entry?.sod?.tasks?.some(t => t.blocker?.trim()) ||
                         !!entry?.blockers?.trim();

      week.push({ day: d.getDate(), iso, inMonth, entry: inMonth ? entry : null, isFuture, doneCount, carryCount, blockCount, hasBlocker });
    }
    if (dayOfWeek === 5 || d > lastDay) {
      if (week.length > 0) {
        // Pad to 5 if short
        while (week.length < 5) week.push(null);
        weeks.push(week);
        week = [];
      }
    }
    d.setDate(d.getDate() + 1);
    if (d > lastDay && week.length === 0) break;
  }

  // Week number helper
  const getWeekNum = (isoDate) => {
    const d2 = new Date(isoDate);
    d2.setHours(0,0,0,0);
    d2.setDate(d2.getDate() + 3 - (d2.getDay() + 6) % 7);
    const w1 = new Date(d2.getFullYear(), 0, 4);
    return 1 + Math.round(((d2 - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  };

  return (
    <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 16, minWidth: 340 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={() => onNavigate(-1)}
          style={{ width: 26, height: 26, border: "0.5px solid var(--border)", borderRadius: 5, background: "var(--bg)", cursor: "pointer", fontSize: 13, color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{MONTHS[month]} {year}</span>
        <button onClick={() => onNavigate(1)}
          style={{ width: 26, height: 26, border: "0.5px solid var(--border)", borderRadius: 5, background: "var(--bg)", cursor: "pointer", fontSize: 13, color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "28px repeat(5,1fr)", gap: 3, marginBottom: 3 }}>
        <div />
        {WEEKDAYS.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 500, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.07em", padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => {
        const firstValid = week.find(c => c?.iso);
        const weekNum    = firstValid ? getWeekNum(firstValid.iso) : wi + 1;
        return (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "28px repeat(5,1fr)", gap: 3, marginBottom: 3 }}>
            <div style={{ fontSize: 8, color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4 }}>
              W{weekNum}
            </div>
            {week.map((cell, ci) => {
              if (!cell) return <div key={ci} style={{ borderRadius: 6, background: "var(--bg)", border: "0.5px solid transparent", minHeight: 40 }} />;
              const { day, iso, inMonth, entry, isFuture, doneCount, carryCount, blockCount, hasBlocker } = cell;
              const isSelected = iso === selectedDate;
              const isToday    = iso === TODAY;
              const clickable  = !!entry && !isFuture;

              let bg     = "var(--bg)";
              let border = "0.5px solid var(--border)";
              let opacity = 1;

              if (!inMonth || isFuture) { bg = "transparent"; border = "0.5px solid transparent"; opacity = 0.3; }
              else if (isSelected) { bg = "var(--accent)"; border = "1.5px solid var(--accent)"; }
              else if (hasBlocker) { bg = "var(--red-bg)"; border = "0.5px solid var(--red-bd)"; }
              else if (entry) { bg = "var(--surface)"; border = "0.5px solid var(--border2)"; }
              if (isToday && !isSelected) border = `1.5px solid var(--accent)`;

              return (
                <div key={ci} onClick={() => clickable && onSelect(iso)}
                  style={{ borderRadius: 6, background: bg, border, minHeight: 44, padding: "4px 5px", cursor: clickable ? "pointer" : "default", opacity, transition: "background 0.1s" }}>
                  <div style={{ fontSize: 9, fontWeight: isToday ? 600 : 400, color: isSelected ? "#fff" : isToday ? "var(--accent)" : "var(--muted)", marginBottom: 3 }}>{day}</div>
                  {entry && inMonth && !isFuture && !isSelected && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {doneCount  > 0 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "var(--green-bg)", color: "var(--green)", fontWeight: 500 }}>{doneCount} done</span>}
                      {carryCount > 0 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "var(--amber-bg)", color: "var(--amber)", fontWeight: 500 }}>{carryCount} carry</span>}
                      {blockCount > 0 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "var(--red-bg)", color: "var(--red)", fontWeight: 500 }}>⚑ {blockCount}</span>}
                      {(!doneCount && !carryCount && !blockCount && entry.sod?.submittedAt) && (
                        <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "var(--blue-bg)", color: "var(--blue)", fontWeight: 500 }}>SOD</span>
                      )}
                    </div>
                  )}
                  {isSelected && entry && (
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>
                      {doneCount > 0 ? `${doneCount} done` : entry.sod?.submittedAt ? "SOD" : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Legend */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { bg: "var(--green-bg)", color: "var(--green)", label: "Done" },
          { bg: "var(--amber-bg)", color: "var(--amber)", label: "Carry over" },
          { bg: "var(--red-bg)",   color: "var(--red)",   label: "Blocker" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "var(--muted)" }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.bg, border: `0.5px solid ${l.color}` }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day detail panel ──────────────────────────────────────────────────────────
function DayDetail({ entry, date }) {
  if (!entry) return (
    <EmptyState icon="📅" message={`No update found for ${fmt(date)}.\nClick any highlighted day to view details.`} />
  );
  if (entry.sod) return <NewDayDetail entry={entry} />;
  return <LegacyDayDetail entry={entry} />;
}

function NewDayDetail({ entry }) {
  const { sod, eod } = entry;
  const bw   = sod?.bandwidth || 3;
  const bwS  = BW_STYLES[bw]  || BW_STYLES[3];
  const bwL  = BANDWIDTH[bw]?.label || "—";
  const pct  = eod?.tasks?.length
    ? Math.round(eod.tasks.filter(t => t.outcome === "Done").length / eod.tasks.length * 100)
    : null;

  return (
    <div>
      {/* Day header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "var(--muted)" }}>{fmt(entry.date)}</span>
        {entry.date === TODAY && <span className="badge badge-blue">Today</span>}
        <span className="badge" style={{ color: bwS.color, background: bwS.bg, borderColor: bwS.bd }}>{bwL}</span>
        {pct != null && <span className="badge badge-green">{pct}% complete</span>}
      </div>

      {/* SOD card */}
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ background: "#1e1b4b", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: sod?.submittedAt ? "#6ee7b7" : "#fbbf24" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "#fff" }}>Start of day</span>
          </div>
          {sod?.submittedAt && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "#c7d2fe" }}>{fmtTime(sod.submittedAt)}</span>}
        </div>
        <div style={{ padding: "10px 14px" }}>
          {sod?.tasks?.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="task-table" style={{ minWidth: 500 }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Client</th>
                    <th style={{ width: 80 }}>Priority</th>
                    <th>Task</th>
                    <th style={{ width: 96 }}>Start</th>
                    <th style={{ width: 96 }}>Due</th>
                    <th style={{ width: 140 }}>Blocker</th>
                  </tr>
                </thead>
                <tbody>
                  {sod.tasks.map((t, i) => {
                    const ps = PRIORITY_STYLE[t.priority || "Medium"];
                    return (
                      <tr key={i}>
                        <td>{t.client ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{t.client}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                        <td><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, fontWeight: 500, color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}` }}>{t.priority || "Medium"}</span></td>
                        <td style={{ fontSize: 12, fontWeight: 500 }}>{t.text || "—"}</td>
                        <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted)" }}>{t.startDate || <span style={{ color: "var(--faint)" }}>—</span>}</td>
                        <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted)" }}>{t.dueDate || <span style={{ color: "var(--faint)" }}>—</span>}</td>
                        <td>{t.blocker?.trim() ? <span style={{ fontSize: 11, color: "var(--red)", background: "var(--red-bg)", padding: "2px 7px", borderRadius: 4 }}>⚑ {t.blocker}</span> : <span style={{ fontSize: 11, color: "var(--faint)", fontStyle: "italic" }}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div style={{ fontSize: 12, color: "var(--faint)" }}>No tasks recorded.</div>}
        </div>
      </div>

      {/* EOD card */}
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: "#0f4c35", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: eod?.submittedAt ? "#6ee7b7" : "#fbbf24" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "#fff" }}>End of day</span>
            {pct != null && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "#6ee7b7" }}>{pct}% complete</span>}
          </div>
          {eod?.submittedAt
            ? <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "#6ee7b7" }}>{fmtTime(eod.submittedAt)}</span>
            : <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>Not submitted</span>}
        </div>
        <div style={{ padding: "10px 14px" }}>
          {eod?.tasks?.length > 0 ? (
            <>
              <div style={{ overflowX: "auto", marginBottom: 10 }}>
                <table className="task-table" style={{ minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Client</th>
                      <th style={{ width: 80 }}>Priority</th>
                      <th>Task</th>
                      <th style={{ width: 108 }}>Outcome</th>
                      <th style={{ width: 100 }}>End date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eod.tasks.map((t, i) => {
                      const s  = OUTCOME_STYLE[t.outcome] || OUTCOME_STYLE["Done"];
                      const ps = PRIORITY_STYLE[t.priority || "Medium"];
                      return (
                        <tr key={i}>
                          <td>{t.client ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{t.client}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                          <td><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, fontWeight: 500, color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}` }}>{t.priority || "Medium"}</span></td>
                          <td style={{ fontSize: 12, fontWeight: 500 }}>
                            {t.text || "—"}
                            {t.adhoc && <span style={{ fontSize: 9, marginLeft: 5, padding: "1px 5px", borderRadius: 10, background: "#fffbeb", color: "#854F0B", border: "0.5px solid #FAC775" }}>ad-hoc</span>}
                          </td>
                          <td><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500, background: s.bg, color: s.color, border: `0.5px solid ${s.bd}` }}>{t.outcome}</span></td>
                          <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: t.endDate ? "var(--green)" : "var(--faint)" }}>{t.endDate || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Carry-over notes + blocker details */}
              {eod.tasks.filter(t => (t.outcome === "Carry over" && t.notes) || (t.outcome === "Blocked" && (t.blockerDetail || t.blockerOwner))).map((t, i) => (
                <div key={i} style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 7, background: t.outcome === "Blocked" ? "var(--red-bg)" : "var(--amber-bg)", border: `0.5px solid ${t.outcome === "Blocked" ? "var(--red-bd)" : "var(--amber-bd)"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    {t.client && <span className="badge badge-blue" style={{ fontSize: 10 }}>{t.client}</span>}
                    <span style={{ fontSize: 11, fontWeight: 500 }}>{t.text}</span>
                  </div>
                  {t.outcome === "Carry over" && t.notes && <div style={{ fontSize: 11, color: "var(--amber)" }}>↪ {t.notes}</div>}
                  {t.outcome === "Blocked" && t.blockerDetail && <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 2 }}>⚑ {t.blockerDetail}</div>}
                  {t.outcome === "Blocked" && t.blockerOwner && <div style={{ fontSize: 11, color: "var(--muted)" }}>Owner: {t.blockerOwner}</div>}
                </div>
              ))}
              {/* Completion bar */}
              {pct != null && (
                <div style={{ padding: "8px 10px", background: "var(--surface)", borderRadius: 8, border: "0.5px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>Completion</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: pct === 100 ? "var(--green)" : "var(--accent)" }}>{pct}%</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "var(--green)" : "var(--accent)", borderRadius: 2 }} />
                  </div>
                </div>
              )}
            </>
          ) : <div style={{ fontSize: 12, color: "var(--faint)" }}>EOD not submitted.</div>}
        </div>
      </div>
    </div>
  );
}

function LegacyDayDetail({ entry }) {
  const bwS = BW_STYLES[entry.bandwidth] || BW_STYLES[3];
  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--muted)" }}>{fmt(entry.date)}</span>
        <div className="flex gap-6 items-center">
          <span className="badge" style={{ color: bwS.color, background: bwS.bg, borderColor: bwS.bd }}>{BANDWIDTH[entry.bandwidth]?.label || "—"}</span>
          {entry.date === TODAY && <span className="badge badge-blue">Today</span>}
        </div>
      </div>
      <div className="card-body">
        <div className="form-grid-2 mb-12">
          <div><div className="field-label mb-4">Yesterday</div><div className="text-sm" style={{ lineHeight: 1.6 }}>{entry.yesterday || "—"}</div></div>
          <div><div className="field-label mb-4">Today</div><div className="text-sm" style={{ lineHeight: 1.6 }}>{entry.today || "—"}</div></div>
        </div>
        {entry.blockers && <div className="mb-12"><div className="field-label mb-4">⚑ Blockers</div><div className="text-sm" style={{ color: "var(--red)", lineHeight: 1.6 }}>{entry.blockers}</div></div>}
        {entry.tasks?.length > 0 && (
          <div>
            <div className="field-label mb-8">Tasks</div>
            <table className="task-table">
              <thead><tr><th>Client</th><th>Task</th><th>Status</th></tr></thead>
              <tbody>{entry.tasks.map((t, i) => (
                <tr key={i}>
                  <td><ClientBadge client={t.client} /></td>
                  <td className="text-sm">{t.text}</td>
                  <td><StatusBadge status={t.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Monthly summary builder ───────────────────────────────────────────────────
function buildSummary(entries, year, month) {
  const monthKey     = `${year}-${String(month + 1).padStart(2, "0")}`;
  const rawEntries   = entries.filter(e => e.date?.startsWith(monthKey));
  const monthEntries = rawEntries.map(normaliseEntry);
  const tasksByClient = {}, tasksByStatus = { "Done": 0, "In Progress": 0, "Blocked": 0, "Pending": 0 };
  let totalTasks = 0, totalBlockers = 0;
  const bwValues = [];
  const recurringMap = {};

  monthEntries.forEach((e, ei) => {
    if (e.blockers?.trim()) totalBlockers++;
    if (e.bandwidth) bwValues.push(e.bandwidth);
    const rawSodTasks = rawEntries[ei]?.sod?.tasks || [];
    (e.tasks || []).forEach((t, ti) => {
      if (!t.text?.trim()) return;
      const rawSod      = rawSodTasks[ti] || {};
      const isRecurring = rawSod.isRecurring === true || t.isRecurring === true;
      if (isRecurring) {
        const key = rawSod.recurringId || `${t.client || ""}|${t.text}`;
        if (!recurringMap[key]) {
          recurringMap[key] = { text: t.text, client: t.client || "", scheduledDays: 0, doneDays: 0 };
        }
        recurringMap[key].scheduledDays++;
        if (t.status === "Done" || t.outcome === "Done") recurringMap[key].doneDays++;
        return; // exclude from project totals
      }
      // Only count tasks toward stats when EOD was actually submitted
      if (!e.eodMissing) {
        totalTasks++;
        const cl = t.client || "Internal";
        tasksByClient[cl] = (tasksByClient[cl] || 0) + 1;
        if (tasksByStatus[t.status] !== undefined) tasksByStatus[t.status]++;
      }
    });
  });
  const avgBw = bwValues.length ? Math.round(bwValues.reduce((a, b) => a + b, 0) / bwValues.length) : 3;
  const recurringTasks = Object.values(recurringMap);
  return { daysSubmitted: monthEntries.length, totalTasks, totalBlockers, tasksByClient, tasksByStatus, avgBw, entries: monthEntries, rawEntries, recurringTasks };
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MyHistory({ memberName }) {
  const { entries, loading } = useHistory(memberName);
  const now = new Date();
  const [tab,        setTab]        = useState("calendar");
  const [calYear,    setCalYear]    = useState(now.getFullYear());
  const [calMonth,   setCalMonth]   = useState(now.getMonth());
  const [selected,   setSelected]   = useState(TODAY);
  const [sumYear,    setSumYear]    = useState(now.getFullYear());
  const [sumMonth,   setSumMonth]   = useState(now.getMonth());
  const [bdClientFilter, setBdClientFilter] = useState("all");
  const [bdStatusFilter, setBdStatusFilter] = useState("all");

  const navigateCal = (dir) => {
    let m = calMonth + dir, y = calYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setCalMonth(m); setCalYear(y);
  };

  const selectedEntry = entries.find(e => e.date === selected) || null;
  const summary       = buildSummary(entries, sumYear, sumMonth);

  if (loading) return <div className="main-content"><Loading /></div>;

  return (
    <div className="main-content">
      {/* Header + tabs */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>My history</div>
          <div className="text-sm text-muted">Your personal performance log</div>
        </div>
        <div style={{ display: "flex", gap: 0, borderRadius: 8, border: "0.5px solid var(--border)", overflow: "hidden" }}>
          {[{ key: "calendar", label: "Calendar view" }, { key: "monthly", label: "Monthly summary" }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "7px 16px", fontSize: 12, fontWeight: tab === t.key ? 500 : 400, background: tab === t.key ? "var(--accent)" : "var(--surface)", color: tab === t.key ? "#fff" : "var(--muted)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Calendar view ── */}
      {tab === "calendar" && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <WeekCalendar
            year={calYear} month={calMonth}
            entries={entries}
            selectedDate={selected}
            onSelect={d => { setSelected(d); setCalYear(+d.slice(0,4)); setCalMonth(+d.slice(5,7)-1); }}
            onNavigate={navigateCal}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <DayDetail entry={selectedEntry} date={selected} />
          </div>
        </div>
      )}

      {/* ── Monthly summary ── */}
      {tab === "monthly" && (() => {
        // ── Week-by-week helper ──────────────────────────────────────────────
        const getWeekNum = (dateStr) => {
          if (!dateStr) return -1;
          const d   = new Date(dateStr);
          const dom = d.getDate();
          const dow = d.getDay(); // 0=Sun
          const monOffset = dow === 0 ? -6 : 1 - dow;
          const weekStart = new Date(d);
          weekStart.setDate(dom + monOffset);
          return weekStart.getDate();
        };

        const buildWeeks = (rawEntries, yr, mo) => {
          const weeks = [];
          const firstDay = new Date(yr, mo, 1);
          const lastDay  = new Date(yr, mo + 1, 0).getDate();
          // Build Mon-based week buckets
          let d = new Date(yr, mo, 1);
          while (d.getMonth() === mo) {
            if (d.getDay() === 1 || d.getDate() === 1) {
              const wStart = new Date(d);
              // find end of this week (Sun) or end of month
              const wEnd = new Date(d);
              wEnd.setDate(wEnd.getDate() + (7 - (wEnd.getDay() || 7)));
              if (wEnd.getMonth() !== mo) wEnd.setDate(lastDay);
              weeks.push({ start: wStart, end: wEnd, entries: [] });
            }
            d.setDate(d.getDate() + 1);
          }
          // De-duplicate weeks
          const seen = new Set();
          const dedupedWeeks = weeks.filter(w => {
            const key = w.start.getDate();
            if (seen.has(key)) return false;
            seen.add(key); return true;
          });
          // Assign entries to weeks
          (rawEntries || []).forEach(e => {
            if (!e.date) return;
            const eDate = new Date(e.date);
            const w = dedupedWeeks.find(w => eDate >= w.start && eDate <= w.end);
            if (w) w.entries.push(e);
          });
          return dedupedWeeks;
        };

        const fmt2 = (d) => {
          const mo = String(d.getMonth()+1).padStart(2,'0');
          const da = String(d.getDate()).padStart(2,'0');
          return `${d.getFullYear()}-${mo}-${da}`;
        };

        // ── Narrative builder ────────────────────────────────────────────────
        const buildNarrative = (summary, memberName) => {
          const done       = summary.tasksByStatus["Done"] || 0;
          const total      = summary.totalTasks;
          const pct        = total > 0 ? Math.round(done / total * 100) : 0;
          const bwLabel    = BANDWIDTH[summary.avgBw]?.label || "Balanced";
          const topClients = Object.entries(summary.tasksByClient).sort((a,b) => b[1]-a[1]);
          const topClient  = topClients[0]?.[0] || null;
          const allCO      = buildCarryOvers(summary.rawEntries || []);
          const activeCO   = allCO.filter(t => t.outcome !== "Done");
          const coNote     = activeCO.length > 0
            ? `${activeCO.length} task${activeCO.length !== 1 ? "s" : ""} carried over into next month`
            : "no active carry-overs heading into next month";
          const blockNote  = summary.totalBlockers > 0
            ? `${summary.totalBlockers} blocker${summary.totalBlockers !== 1 ? "s" : ""} raised`
            : "no blockers raised";
          const missingEOD = summary.rawEntries?.filter(e => e.sod?.submittedAt && !e.eod?.submittedAt).length || 0;
          return {
            text: `${memberName} was active for ${summary.daysSubmitted} day${summary.daysSubmitted !== 1 ? "s" : ""} this month, completing ${done} of ${total} tracked tasks (${pct}%).${topClient ? ` ${topClient} was the most active client.` : ""} Bandwidth was primarily ${bwLabel} with ${blockNote}.`,
            highlights: [
              done > 0 && pct >= 80 ? { color: "var(--green)", text: `${pct}% completion rate` } : null,
              summary.recurringTasks?.length > 0 ? {
                color: "var(--accent)",
                text: `Recurring compliance: ${Math.round(summary.recurringTasks.reduce((a,r) => a + (r.scheduledDays ? r.doneDays/r.scheduledDays : 0), 0) / summary.recurringTasks.length * 100)}% avg`,
              } : null,
              activeCO.length > 0 ? { color: "var(--amber)", text: coNote } : { color: "var(--green)", text: "All tasks resolved — " + coNote },
              summary.totalBlockers > 0 ? { color: "var(--red)", text: blockNote } : null,
              missingEOD > 0 ? { color: "var(--faint)", text: `${missingEOD} day${missingEOD !== 1 ? "s" : ""} missing EOD` } : null,
            ].filter(Boolean),
          };
        };

        const weeks    = buildWeeks(summary.rawEntries, sumYear, sumMonth);
        const narrative = summary.daysSubmitted > 0 ? buildNarrative(summary, memberName) : null;
        const done      = summary.tasksByStatus["Done"]    || 0;
        const carryOv   = summary.tasksByStatus["Carry over"] || 0;
        const blocked   = summary.tasksByStatus["Blocked"] || 0;
        const total     = summary.totalTasks;
        const pct       = total > 0 ? Math.round(done / total * 100) : 0;
        const missingEOD = summary.rawEntries?.filter(e => e.sod?.submittedAt && !e.eod?.submittedAt).length || 0;
        const topClients = Object.entries(summary.tasksByClient).sort((a,b) => b[1]-a[1]);

        // Pill helpers for carry-over section
        const cPill = c => c
          ? <span style={{ fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:500,background:"var(--blue-bg)",color:"var(--blue)",border:"0.5px solid var(--blue-bd)" }}>{c}</span>
          : <span style={{ fontSize:11,color:"var(--faint)" }}>—</span>;
        const pPill = p => { const s=PRIORITY_STYLE[p||"Medium"]; return <span style={{ fontSize:10,padding:"2px 6px",borderRadius:20,fontWeight:500,color:s.color,background:s.bg,border:`0.5px solid ${s.bd}` }}>{p||"Medium"}</span>; };
        const oPill = o => { const s=OUTCOME_STYLE[o]; return s ? <span style={{ fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:500,color:s.color,background:s.bg,border:`0.5px solid ${s.bd}` }}>{o}</span> : <span style={{ fontSize:11,color:"var(--faint)" }}>{o||"—"}</span>; };
        const TH = ({ children, w }) => (
          <th style={{ textAlign:"left",fontSize:9,fontWeight:500,textTransform:"uppercase",
            letterSpacing:"0.07em",color:"var(--faint)",padding:"5px 12px",
            borderBottom:"0.5px solid var(--border)",whiteSpace:"nowrap",width:w }}>{children}</th>
        );

        return (
          <div>
            {/* Header row */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <select className="field-input" style={{ width:"auto" }} value={sumMonth} onChange={e => setSumMonth(+e.target.value)}>
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select className="field-input" style={{ width:"auto" }} value={sumYear} onChange={e => setSumYear(+e.target.value)}>
                  {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                {summary.daysSubmitted > 0 && (
                  <span style={{ fontSize:12, color:"var(--muted)" }}>{summary.daysSubmitted} days submitted</span>
                )}
              </div>
              {summary.daysSubmitted > 0 && (
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    const rows = [["Date","Client","Priority","Task","Start","Due","End","Status"]];
                    summary.entries.forEach(e => {
                      (e.tasks||[]).filter(t => t.text?.trim() && !t.isCarryOver && t.outcome !== "Carry over").forEach(t => {
                        const status = e.eodMissing ? "EOD pending" : (t.status||t.outcome||"In Progress");
                        rows.push([e.date, t.client||"Internal", t.priority||"Medium", t.text, t.startDate||"", t.dueDate||"", t.endDate||"", status]);
                      });
                    });
                    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
                    const a = document.createElement("a");
                    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
                    a.download = `${memberName}_${MONTHS[sumMonth]}_${sumYear}.csv`;
                    a.click();
                  }}>Export CSV</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Export PDF</button>
                </div>
              )}
            </div>

            {summary.daysSubmitted === 0 ? (
              <EmptyState icon="📊" message={`No updates found for ${MONTHS[sumMonth]} ${sumYear}.`} />
            ) : (
              <>
                {/* ── Metric cards ── */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,minmax(0,1fr))", gap:10, marginBottom:12 }}>
                  {[
                    { val: summary.daysSubmitted, label: "Days submitted", sub: `of ${new Date(sumYear, sumMonth+1, 0).getDate()} working days`, color: "var(--accent)" },
                    { val: done, label: "Tasks done", sub: `${pct}% completion`, color: "var(--green)" },
                    { val: total, label: "Tasks tracked", sub: "excl. recurring", color: "var(--text)" },
                    { val: summary.totalBlockers, label: "Blockers raised", sub: summary.totalBlockers > 0 ? "this month" : "clean month", color: summary.totalBlockers > 0 ? "var(--red)" : "var(--green)" },
                    { val: BANDWIDTH[summary.avgBw]?.label || "—", label: "Avg bandwidth", sub: `mode this month`, color: BW_STYLES[summary.avgBw]?.color || "var(--muted)", small: true },
                  ].map((m, i) => (
                    <div key={i} style={{ background:"var(--surface)", borderRadius:8, padding:"12px", textAlign:"center", border:"0.5px solid var(--border)" }}>
                      <div style={{ fontSize: m.small ? 15 : 24, fontWeight:500, color:m.color, lineHeight:1.1 }}>{m.val}</div>
                      <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>{m.label}</div>
                      <div style={{ fontSize:10, color:m.color, marginTop:2, fontWeight:500 }}>{m.sub}</div>
                    </div>
                  ))}
                </div>

                {/* ── Narrative ── */}
                {narrative && (
                  <div style={{ marginBottom:12, padding:"12px 16px", background:"var(--surface)", borderRadius:8,
                    borderLeft:"3px solid var(--accent)", borderTop:"0.5px solid var(--border)",
                    borderRight:"0.5px solid var(--border)", borderBottom:"0.5px solid var(--border)" }}>
                    <p style={{ fontSize:13, color:"var(--text)", lineHeight:1.6, marginBottom: narrative.highlights.length > 0 ? 8 : 0 }}>
                      {narrative.text}
                    </p>
                    {narrative.highlights.length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                        {narrative.highlights.map((h, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--muted)" }}>
                            <div style={{ width:6, height:6, borderRadius:"50%", background:h.color, flexShrink:0 }} />
                            {h.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Completion bar ── */}
                <div style={{ marginBottom:12, padding:"10px 14px", background:"var(--surface)", borderRadius:8, border:"0.5px solid var(--border)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:12, color:"var(--muted)" }}>Monthly completion</span>
                    <span style={{ fontSize:13, fontWeight:500, color:"var(--green)" }}>
                      {done} / {total} tasks ({pct}%)
                    </span>
                  </div>
                  <div style={{ height:8, borderRadius:4, background:"var(--border)", overflow:"hidden", display:"flex", marginBottom:6 }}>
                    <div style={{ width:`${total ? done/total*100 : 0}%`, background:"var(--green)", transition:"width 0.3s" }} />
                    <div style={{ width:`${total ? carryOv/total*100 : 0}%`, background:"var(--amber)" }} />
                    <div style={{ width:`${total ? blocked/total*100 : 0}%`, background:"var(--red)" }} />
                  </div>
                  <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                    {[
                      { col:"var(--green)",  label:`Done (${done})` },
                      { col:"var(--amber)",  label:`Carry over (${carryOv})` },
                      { col:"var(--red)",    label:`Blocked (${blocked})` },
                      { col:"var(--border)", label:`EOD missing (${missingEOD} days)`, border:true },
                    ].map((it, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--muted)" }}>
                        <div style={{ width:10, height:10, borderRadius:2, background:it.col, border: it.border ? "0.5px solid var(--muted)" : "none" }} />
                        {it.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── 3-column grid: work dist + status + blockers ── */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                  <div className="card" style={{ marginBottom:0 }}>
                    <div className="card-header"><span className="card-title">Work distribution</span></div>
                    <div className="card-body" style={{ maxHeight:220, overflowY:"auto" }}>
                      {topClients.length === 0 ? (
                        <span style={{ fontSize:12, color:"var(--faint)" }}>No data</span>
                      ) : topClients.map(([c, n]) => (
                        <div key={c} style={{ marginBottom:10 }}>
                          <div className="flex justify-between mb-4">
                            <span className="text-sm font-medium">{c}</span>
                            <span className="text-xs text-muted">{n} · {total ? Math.round(n/total*100) : 0}%</span>
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width:`${total ? n/total*100 : 0}%`, background:"var(--accent)" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card" style={{ marginBottom:0 }}>
                    <div className="card-header"><span className="card-title">Status breakdown</span></div>
                    <div className="card-body" style={{ maxHeight:220, overflowY:"auto" }}>
                      {Object.entries(summary.tasksByStatus).filter(([,v]) => v > 0).map(([s, n]) => (
                        <div key={s} style={{ marginBottom:10 }}>
                          <div className="flex justify-between mb-4">
                            <span className="text-sm font-medium">{s}</span>
                            <span className="text-xs text-muted">{n} · {total ? Math.round(n/total*100) : 0}%</span>
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width:`${total ? n/total*100 : 0}%`,
                              background: s === "Done" ? "var(--green)" : s === "Blocked" ? "var(--red)" : s === "Carry over" ? "var(--amber)" : "var(--blue)" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card" style={{ marginBottom:0 }}>
                    <div className="card-header">
                      <span className="card-title">Blockers this month</span>
                      <span style={{ fontSize:11, color:"var(--muted)" }}>{summary.totalBlockers} raised</span>
                    </div>
                    <div className="card-body" style={{ maxHeight:220, overflowY:"auto" }}>
                      {summary.totalBlockers === 0 ? (
                        <div style={{ fontSize:12, color:"var(--faint)", padding:"4px 0" }}>No blockers this month</div>
                      ) : (
                        summary.entries
                          .filter(e => e.blockers?.trim())
                          .map((e, i) => (
                            <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", paddingBottom:8, marginBottom:8, borderBottom:"0.5px solid var(--border)" }}>
                              <span style={{ fontSize:11, color:"var(--muted)", fontFamily:"JetBrains Mono, monospace", minWidth:52, flexShrink:0 }}>{fmt(e.date)}</span>
                              <span style={{ fontSize:12, color:"var(--text)", flex:1 }}>{e.blockers}</span>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Week-by-week progress ── */}
                <div className="card" style={{ marginBottom:12 }}>
                  <div className="card-header">
                    <span className="card-title">Week-by-week progress</span>
                    <span className="card-meta">{MONTHS[sumMonth]} {sumYear}</span>
                  </div>
                  <div className="card-body" style={{ paddingTop:4 }}>
                    {weeks.filter(w => w.entries.length > 0 || w.start.getMonth() === sumMonth).map((w, wi) => {
                      const wEntries = w.entries;
                      const wTasksAll = wEntries.flatMap(e => (e.eod?.tasks || e.sod?.tasks || []).filter(t => t.text?.trim()));
                      const wDone    = wEntries.reduce((a, e) => a + (e.eod?.tasks || []).filter(t => t.outcome === "Done").length, 0);
                      const wCarry   = wEntries.reduce((a, e) => a + (e.eod?.tasks || []).filter(t => t.outcome === "Carry over").length, 0);
                      const wBlock   = wEntries.reduce((a, e) => a + (e.eod?.tasks || []).filter(t => t.outcome === "Blocked").length, 0);
                      const wTotal   = wTasksAll.length;
                      const wPct     = wTotal > 0 ? Math.round(wDone / wTotal * 100) : 0;
                      const startD   = w.start.getDate();
                      const endD     = Math.min(w.end.getDate(), new Date(sumYear, sumMonth+1, 0).getDate());
                      const note     = wCarry > 0 ? `${wCarry} carry` : wBlock > 0 ? `${wBlock} blocked` : wDone === wTotal && wTotal > 0 ? "all done" : "";
                      const noteColor = wCarry > 0 ? "var(--amber)" : wBlock > 0 ? "var(--red)" : "var(--green)";
                      if (wTotal === 0) return null;
                      return (
                        <div key={wi} style={{ display:"grid", gridTemplateColumns:"80px 1fr 160px", alignItems:"center", gap:12, padding:"7px 0", borderBottom:"0.5px solid var(--border)" }}>
                          <div>
                            <div style={{ fontSize:12, color:"var(--text)", fontWeight:500 }}>Week {wi+1}</div>
                            <div style={{ fontSize:10, color:"var(--faint)" }}>Apr {startD}–{endD}</div>
                          </div>
                          <div style={{ background:"var(--border)", borderRadius:3, height:7, overflow:"hidden" }}>
                            <div style={{ width:`${wPct}%`, height:"100%", borderRadius:3, background: wPct === 100 ? "var(--green)" : wPct >= 75 ? "var(--accent)" : "var(--amber)", transition:"width 0.3s" }} />
                          </div>
                          <div style={{ fontSize:11, color:"var(--muted)", textAlign:"right" }}>
                            {wTotal} tasks · {wDone} done
                            {note && <span style={{ color:noteColor }}> · {note}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Recurring compliance card ── */}
                {summary.recurringTasks?.length > 0 && (
                  <div style={{ border:"0.5px solid var(--blue-bd)", borderRadius:12, overflow:"hidden", marginBottom:12 }}>
                    <div style={{ padding:"9px 14px", background:"var(--blue-bg)", borderBottom:"0.5px solid var(--blue-bd)",
                      display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:12, fontWeight:500 }}>Recurring task compliance</span>
                        <span style={{ fontSize:9, padding:"1px 7px", borderRadius:20, fontWeight:500,
                          background:"var(--blue-bg)", color:"var(--blue)", border:"0.5px solid var(--blue-bd)" }}>
                          {summary.recurringTasks.length} task{summary.recurringTasks.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span style={{ fontSize:11, color:"var(--muted)" }}>Tracked separately · excluded from project stats</span>
                    </div>
                    <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
                      {summary.recurringTasks.map((r, i) => {
                        const pct2 = r.scheduledDays ? Math.round(r.doneDays / r.scheduledDays * 100) : 0;
                        const col2 = pct2 === 100 ? "var(--green)" : pct2 >= 75 ? "var(--accent)" : pct2 >= 50 ? "var(--amber)" : "var(--red)";
                        return (
                          <div key={i}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                              {r.client && (
                                <span style={{ fontSize:10, padding:"1px 6px", borderRadius:20, fontWeight:500,
                                  background:"var(--blue-bg)", color:"var(--blue)", border:"0.5px solid var(--blue-bd)" }}>
                                  {r.client}
                                </span>
                              )}
                              <span style={{ fontSize:12, fontWeight:500, flex:1 }}>{r.text}</span>
                              <span style={{ fontSize:12, fontWeight:500, color:col2 }}>{r.doneDays} / {r.scheduledDays} days</span>
                              <span style={{ fontSize:11, fontWeight:500, color:col2, minWidth:36, textAlign:"right" }}>{pct2}%</span>
                            </div>
                            <div style={{ height:5, borderRadius:3, background:"var(--border)", overflow:"hidden" }}>
                              <div style={{ height:"100%", borderRadius:3, width:`${pct2}%`, background:col2, transition:"width 0.3s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Carry-over section ── */}
                {(() => {
                  const allCO  = buildCarryOvers(summary.rawEntries || []);
                  if (allCO.length === 0) return null;
                  const active = allCO.filter(t => t.outcome !== "Done").sort((a,b) => {
                    if (a.outcome === "Blocked" && b.outcome !== "Blocked") return -1;
                    if (b.outcome === "Blocked" && a.outcome !== "Blocked") return 1;
                    return (a.startDate||"").localeCompare(b.startDate||"");
                  });
                  const completed = allCO.filter(t => t.outcome === "Done")
                    .sort((a,b) => (b.endDate||"").localeCompare(a.endDate||"")).slice(0,10);
                  const blockedCnt = active.filter(t => t.outcome === "Blocked").length;
                  return (
                    <div style={{ marginBottom:12 }}>
                      {active.length > 0 && (
                        <div style={{ border:"0.5px solid var(--amber-bd)",borderRadius:12,overflow:"hidden",marginBottom:10 }}>
                          <div style={{ padding:"9px 14px",background:"var(--amber-bg)",borderBottom:"0.5px solid var(--amber-bd)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8 }}>
                            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                              <span style={{ fontSize:12,fontWeight:500 }}>Active carry-overs</span>
                              <span style={{ fontSize:9,padding:"1px 7px",borderRadius:20,fontWeight:500,background:"var(--amber-bg)",color:"var(--amber)",border:"0.5px solid var(--amber-bd)" }}>
                                {active.length} open{blockedCnt > 0 ? ` · ${blockedCnt} blocked` : ""}
                              </span>
                            </div>
                            <span style={{ fontSize:11,color:"var(--muted)" }}>Active until marked Done</span>
                          </div>
                          <div style={{ overflowX:"auto" }}>
                            <table style={{ width:"100%",borderCollapse:"collapse",minWidth:720 }}>
                              <thead><tr style={{ background:"var(--bg)" }}>
                                <TH w={115}>Client</TH><TH w={75}>Priority</TH><TH>Task</TH>
                                <TH w={115}>Started</TH><TH w={115}>Due</TH><TH w={80}>Age</TH>
                                <TH>Latest note</TH><TH w={95}>Status</TH>
                              </tr></thead>
                              <tbody>
                                {active.map((t, i) => {
                                  const isBlocked = t.outcome === "Blocked";
                                  const overdue   = t.dueDate && t.dueDate < TODAY;
                                  return (
                                    <tr key={i} style={{ borderTop:"0.5px solid var(--border)",background:isBlocked?"var(--red-bg)":"transparent" }}>
                                      <td style={{ padding:"8px 12px",whiteSpace:"nowrap" }}>{cPill(t.client)}</td>
                                      <td style={{ padding:"8px 12px",whiteSpace:"nowrap" }}>{pPill(t.priority)}</td>
                                      <td style={{ padding:"8px 12px" }}>
                                        <div style={{ fontSize:12,fontWeight:500 }}>{t.text}</div>
                                        {isBlocked && t.blockerDetail && (
                                          <div style={{ fontSize:10,color:"var(--red)",marginTop:2 }}>
                                            ⚑ {t.blockerDetail}{t.blockerOwner && <span style={{ color:"var(--muted)" }}> · {t.blockerOwner}</span>}
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding:"8px 12px",fontSize:11,fontFamily:"JetBrains Mono, monospace",color:"var(--muted)",whiteSpace:"nowrap",minWidth:115 }}>{t.startDate||"—"}</td>
                                      <td style={{ padding:"8px 12px",whiteSpace:"nowrap" }}>
                                        {t.dueDate
                                          ? <span style={{ fontSize:11,fontFamily:"JetBrains Mono, monospace",color:overdue?"var(--red)":"var(--muted)",fontWeight:overdue?500:400 }}>{t.dueDate}{overdue?" !":""}</span>
                                          : <span style={{ fontSize:11,color:"var(--faint)" }}>—</span>}
                                      </td>
                                      <td style={{ padding:"8px 12px" }}><AgeBar startDate={t.startDate} dueDate={t.dueDate} isDone={false} /></td>
                                      <td style={{ padding:"8px 12px",fontSize:11,color:"var(--muted)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                                        {t.notes || <span style={{ color:"var(--faint)" }}>—</span>}
                                      </td>
                                      <td style={{ padding:"8px 12px" }}>{oPill(isBlocked?"Blocked":"Carry over")}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {completed.length > 0 && (
                        <div style={{ border:"0.5px solid var(--border)",borderRadius:12,overflow:"hidden",marginBottom:10 }}>
                          <div style={{ padding:"9px 14px",background:"var(--surface)",borderBottom:"0.5px solid var(--border)",display:"flex",alignItems:"center",gap:8 }}>
                            <span style={{ fontSize:12,fontWeight:500 }}>Resolved carry-overs</span>
                            <span style={{ fontSize:9,padding:"1px 7px",borderRadius:20,fontWeight:500,background:"var(--green-bg)",color:"var(--green)",border:"0.5px solid var(--green-bd)" }}>
                              {completed.length} done
                            </span>
                          </div>
                          <div style={{ overflowX:"auto" }}>
                            <table style={{ width:"100%",borderCollapse:"collapse",minWidth:720 }}>
                              <thead><tr style={{ background:"var(--bg)" }}>
                                <TH w={115}>Client</TH><TH w={75}>Priority</TH><TH>Task</TH>
                                <TH w={115}>Started</TH><TH w={115}>Due</TH><TH w={80}>Days taken</TH><TH w={115}>Completed</TH>
                              </tr></thead>
                              <tbody>
                                {completed.map((t, i) => (
                                  <tr key={i} style={{ borderTop:"0.5px solid var(--border)",background:i%2===1?"var(--bg)":"transparent" }}>
                                    <td style={{ padding:"7px 12px",whiteSpace:"nowrap" }}>{cPill(t.client)}</td>
                                    <td style={{ padding:"7px 12px",whiteSpace:"nowrap" }}>{pPill(t.priority)}</td>
                                    <td style={{ padding:"7px 12px",fontSize:12,fontWeight:500 }}>{t.text}</td>
                                    <td style={{ padding:"7px 12px",fontSize:11,fontFamily:"JetBrains Mono, monospace",color:"var(--muted)",whiteSpace:"nowrap",minWidth:115 }}>{t.startDate||"—"}</td>
                                    <td style={{ padding:"7px 12px",fontSize:11,fontFamily:"JetBrains Mono, monospace",color:"var(--muted)",whiteSpace:"nowrap",minWidth:115 }}>{t.dueDate||"—"}</td>
                                    <td style={{ padding:"7px 12px" }}><AgeBar startDate={t.startDate} dueDate={t.dueDate} isDone={true} /></td>
                                    <td style={{ padding:"7px 12px",fontSize:11,fontFamily:"JetBrains Mono, monospace",color:"var(--green)",fontWeight:500,whiteSpace:"nowrap",minWidth:115 }}>{t.endDate||"—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Task breakdown table ── */}
                {(() => {
                  const bdAllTasks = summary.entries.flatMap((e, ei) =>
                    (e.tasks||[])
                      .filter(t => t.text?.trim() && !t.isCarryOver && t.outcome !== "Carry over")
                      .map((t, ti) => ({ ...t, _ei: ei, _ti: ti, _eodMissing: e.eodMissing }))
                  );
                  const bdClients  = ["all", ...new Set(bdAllTasks.map(t => t.client||"Internal").filter(Boolean))].sort((a,b) => a==="all"?-1:b==="all"?1:a.localeCompare(b));
                  const bdStatuses = ["all", "Done", "In Progress", "Blocked", "EOD pending"];
                  const bdFiltered = bdAllTasks.filter(t => {
                    const matchClient = bdClientFilter === "all" || (t.client||"Internal") === bdClientFilter;
                    const effectiveStatus = t._eodMissing ? "EOD pending" : (t.status || t.outcome || "In Progress");
                    const matchStatus = bdStatusFilter === "all" || effectiveStatus === bdStatusFilter;
                    return matchClient && matchStatus;
                  });
                  const FP = ({ val, opts, onChange }) => (
                    <select value={val} onChange={e => onChange(e.target.value)}
                      style={{ fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid var(--border)",
                        background:"var(--surface)",color:"var(--text)",fontFamily:"inherit",cursor:"pointer" }}>
                      {opts.map(o => <option key={o} value={o}>{o === "all" ? "All" : o}</option>)}
                    </select>
                  );
                  return (
                    <div className="card">
                      <div className="card-header">
                        <span className="card-title">Task breakdown</span>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:11,color:"var(--faint)" }}>Client</span>
                          <FP val={bdClientFilter} opts={bdClients} onChange={v => { setBdClientFilter(v); }} />
                          <span style={{ fontSize:11,color:"var(--faint)",marginLeft:4 }}>Status</span>
                          <FP val={bdStatusFilter} opts={bdStatuses} onChange={v => { setBdStatusFilter(v); }} />
                        </div>
                      </div>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ width:115, whiteSpace:"nowrap" }}>Date</th>
                            <th style={{ width:115, whiteSpace:"nowrap" }}>Client</th>
                            <th style={{ width:75 }}>Priority</th>
                            <th>Task</th>
                            <th style={{ width:105, whiteSpace:"nowrap" }}>Start</th>
                            <th style={{ width:105, whiteSpace:"nowrap" }}>Due</th>
                            <th style={{ width:105, whiteSpace:"nowrap" }}>End</th>
                            <th style={{ width:120, whiteSpace:"nowrap" }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bdFiltered.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign:"center",padding:"20px",color:"var(--faint)",fontSize:12 }}>No tasks match the selected filters</td></tr>
                          ) : bdFiltered.map((t, idx) => {
                            const os      = OUTCOME_STYLE[t.status]||OUTCOME_STYLE[t.outcome];
                            const ps      = PRIORITY_STYLE[t.priority||"Medium"];
                            const overdue = t.dueDate && t.dueDate < TODAY && (t.status||t.outcome) !== "Done";
                            const isRecur = summary.rawEntries?.[t._ei]?.sod?.tasks?.[t._ti]?.isRecurring;
                            return (
                              <tr key={idx} style={{ background: isRecur ? "#EEEDFE15" : t._eodMissing ? "var(--bg)" : "transparent" }}>
                                <td style={{ fontFamily:"JetBrains Mono, monospace",fontSize:11,color:"var(--muted)",whiteSpace:"nowrap" }}>{fmt(summary.entries[t._ei]?.date)}</td>
                                <td style={{ whiteSpace:"nowrap" }}>{t.client ? <span className="badge badge-blue" style={{ fontSize:11 }}>{t.client}</span> : <span style={{ color:"var(--faint)" }}>—</span>}</td>
                                <td><span style={{ fontSize:10,padding:"2px 6px",borderRadius:20,fontWeight:500,color:ps.color,background:ps.bg,border:`0.5px solid ${ps.bd}` }}>{t.priority||"Medium"}</span></td>
                                <td className="text-sm">
                                  {isRecur && (
                                    <span style={{ fontSize:9,marginRight:5,padding:"1px 5px",borderRadius:10,
                                      background:"#EEEDFE",color:"#534AB7",border:"0.5px solid #AFA9EC",fontWeight:500 }}>↻</span>
                                  )}
                                  {t.text}
                                </td>
                                <td style={{ fontFamily:"JetBrains Mono, monospace",fontSize:11,color:"var(--muted)" }}>{t.startDate||"—"}</td>
                                <td>
                                  {t.dueDate
                                    ? <span style={{ fontFamily:"JetBrains Mono, monospace",fontSize:11,color:overdue?"var(--red)":"var(--muted)",fontWeight:overdue?500:400 }}>{t.dueDate}{overdue?" !":""}</span>
                                    : <span style={{ color:"var(--faint)",fontSize:11 }}>—</span>}
                                </td>
                                <td style={{ fontFamily:"JetBrains Mono, monospace",fontSize:11,color:t.endDate?"var(--green)":"var(--faint)" }}>{t.endDate||"—"}</td>
                                <td style={{ whiteSpace:"nowrap" }}>
                                  {t._eodMissing
                                    ? <span style={{ fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:500,background:"var(--bg)",color:"var(--faint)",border:"0.5px solid var(--border)" }}>EOD pending</span>
                                    : os
                                      ? <span style={{ fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:500,background:os.bg,color:os.color,border:`0.5px solid ${os.bd}` }}>{t.status||t.outcome}</span>
                                      : <span style={{ fontSize:11,color:"var(--faint)" }}>{t.status||"—"}</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div style={{ padding:"7px 14px",fontSize:10,color:"var(--faint)",borderTop:"0.5px solid var(--border)" }}>
                        Carry-over tasks tracked separately above · EOD pending = no EOD submitted that day
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}