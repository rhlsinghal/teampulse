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
  entries.forEach(e => {
    const eodTasks = e.eod?.tasks || [];
    const sodTasks = e.sod?.tasks || [];
    eodTasks.forEach((t, i) => {
      if (!t.text?.trim()) return;
      const sodTask = sodTasks[i] || {};
      const isCarry = t.outcome === "Carry over" || t.outcome === "Blocked" || sodTask.isCarryOver === true;
      if (!isCarry) return;
      const origin = sodTask.carryOverFrom || t.carryOverFrom || t.startDate || e.date;
      const key    = `${t.client||""}|${t.text}|${origin}`;
      if (!taskMap[key]) {
        taskMap[key] = {
          project: t.project || sodTask.project || "",
          client: t.client||"", text: t.text||"",
          priority:  t.priority  || sodTask.priority  || "Medium",
          startDate: t.startDate || sodTask.startDate || origin,
          dueDate:   t.dueDate   || sodTask.dueDate   || "",
          endDate:   t.endDate   || "",
          outcome:   t.outcome,
          blockerDetail: t.blockerDetail || "",
          blockerOwner:  t.blockerOwner  || "",
          notes:     t.notes || "",
        };
      }
      if (taskMap[key] && t.outcome === "Done" && taskMap[key].outcome !== "Done") {
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
                    <th style={{ width: 85 }}>Project</th>
                    <th style={{ width: 85 }}>Client</th>
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
                        <td style={{ fontSize: 11, color: t.project ? "var(--muted)" : "var(--faint)" }}>{t.project || "—"}</td>
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
                      <th style={{ width: 85 }}>Project</th>
                      <th style={{ width: 85 }}>Client</th>
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
                          <td style={{ fontSize: 11, color: t.project ? "var(--muted)" : "var(--faint)" }}>{t.project || "—"}</td>
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
          recurringMap[key] = { text: t.text, project: t.project || "", client: t.client || "", scheduledDays: 0, doneDays: 0 };
        }
        recurringMap[key].scheduledDays++;
        if (t.status === "Done" || t.outcome === "Done") recurringMap[key].doneDays++;
        return; // exclude from project totals
      }
      totalTasks++;
      const cl = t.client || "Internal";
      tasksByClient[cl] = (tasksByClient[cl] || 0) + 1;
      if (tasksByStatus[t.status] !== undefined) tasksByStatus[t.status]++;
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
      {tab === "monthly" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <select className="field-input" style={{ width: "auto" }} value={sumMonth} onChange={e => setSumMonth(+e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="field-input" style={{ width: "auto" }} value={sumYear} onChange={e => setSumYear(+e.target.value)}>
              {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{summary.daysSubmitted} days submitted</span>
          </div>
          {summary.daysSubmitted === 0 ? (
            <EmptyState icon="📊" message={`No updates found for ${MONTHS[sumMonth]} ${sumYear}.`} />
          ) : (
            <>
              {/* Stats — project tasks only, recurring excluded */}
              <div className="stats-grid stats-grid-4 mb-12">
                <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{summary.daysSubmitted}</div><div className="stat-label">Days submitted</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{summary.tasksByStatus["Done"] || 0}</div><div className="stat-label">Tasks done</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{summary.totalBlockers}</div><div className="stat-label">Blockers raised</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: BW_STYLES[summary.avgBw]?.color, fontSize: 16, paddingTop: 2 }}>{BANDWIDTH[summary.avgBw]?.label || "—"}</div><div className="stat-label">Avg bandwidth</div></div>
              </div>

              {/* Project completion bar */}
              <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--surface)", borderRadius: 8, border: "0.5px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Project task completion</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)" }}>
                    {summary.tasksByStatus["Done"] || 0} / {summary.totalTasks} tasks
                    {summary.totalTasks > 0 && ` (${Math.round((summary.tasksByStatus["Done"] || 0) / summary.totalTasks * 100)}%)`}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, transition: "width 0.3s",
                    width: `${summary.totalTasks ? Math.round((summary.tasksByStatus["Done"] || 0) / summary.totalTasks * 100) : 0}%`,
                    background: "var(--accent)" }} />
                </div>
                {summary.recurringTasks?.length > 0 && (
                  <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 5 }}>
                    Recurring tasks tracked separately below · excluded from this count
                  </div>
                )}
              </div>

              {/* Recurring compliance card */}
              {summary.recurringTasks?.length > 0 && (
                <div style={{ border: "0.5px solid var(--blue-bd)", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
                  <div style={{ padding: "9px 14px", background: "var(--blue-bg)", borderBottom: "0.5px solid var(--blue-bd)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>Recurring task compliance</span>
                      <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                        background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>
                        {summary.recurringTasks.length} task{summary.recurringTasks.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>Tracked separately · excluded from project stats</span>
                  </div>
                  <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {summary.recurringTasks.map((r, i) => {
                      const pct = r.scheduledDays ? Math.round(r.doneDays / r.scheduledDays * 100) : 0;
                      const col = pct === 100 ? "var(--green)" : pct >= 75 ? "var(--accent)" : pct >= 50 ? "var(--amber)" : "var(--red)";
                      return (
                        <div key={i}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                            {r.client && (
                              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                                background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>
                                {r.client}
                              </span>
                            )}
                            {r.project && <span style={{ fontSize:10,padding:"1px 6px",borderRadius:20,fontWeight:500,background:"var(--surface)",color:"var(--muted)",border:"0.5px solid var(--border)",marginRight:4 }}>{r.project}</span>}
                            <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{r.text}</span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: col }}>{r.doneDays} / {r.scheduledDays} days</span>
                            <span style={{ fontSize: 11, fontWeight: 500, color: col, minWidth: 36, textAlign: "right" }}>{pct}%</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: col, transition: "width 0.3s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="form-grid-2 mb-12">
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="card-header"><span className="card-title">Tasks by client</span></div>
                  <div className="card-body">
                    {Object.entries(summary.tasksByClient).sort((a,b) => b[1]-a[1]).map(([c, n]) => (
                      <div key={c} style={{ marginBottom: 10 }}>
                        <div className="flex justify-between mb-4"><span className="text-sm font-medium">{c}</span><span className="text-xs text-muted">{n} tasks · {Math.round(n/summary.totalTasks*100)}%</span></div>
                        <div className="progress-bar"><div className="progress-fill" style={{ width: `${n/summary.totalTasks*100}%`, background: "var(--accent)" }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="card-header"><span className="card-title">Tasks by status</span></div>
                  <div className="card-body">
                    {Object.entries(summary.tasksByStatus).filter(([,v]) => v > 0).map(([s, n]) => (
                      <div key={s} style={{ marginBottom: 10 }}>
                        <div className="flex justify-between mb-4"><span className="text-sm font-medium">{s}</span><span className="text-xs text-muted">{n} tasks</span></div>
                        <div className="progress-bar"><div className="progress-fill" style={{ width: `${summary.totalTasks ? n/summary.totalTasks*100 : 0}%`, background: s === "Done" ? "var(--green)" : s === "Blocked" ? "var(--red)" : "var(--blue)" }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
                const TH = ({ children, w }) => (
                  <th style={{ textAlign:"left",fontSize:9,fontWeight:500,textTransform:"uppercase",
                    letterSpacing:"0.07em",color:"var(--faint)",padding:"5px 12px",
                    borderBottom:"0.5px solid var(--border)",whiteSpace:"nowrap",width:w }}>{children}</th>
                );
                const cPill = c => c
                  ? <span style={{ fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:500,background:"var(--blue-bg)",color:"var(--blue)",border:"0.5px solid var(--blue-bd)" }}>{c}</span>
                  : <span style={{ fontSize:11,color:"var(--faint)" }}>—</span>;
                const pPill = p => { const s=PRIORITY_STYLE[p||"Medium"]; return <span style={{ fontSize:10,padding:"2px 6px",borderRadius:20,fontWeight:500,color:s.color,background:s.bg,border:`0.5px solid ${s.bd}` }}>{p||"Medium"}</span>; };
                const oPill = o => { const s=OUTCOME_STYLE[o]; return s ? <span style={{ fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:500,color:s.color,background:s.bg,border:`0.5px solid ${s.bd}` }}>{o}</span> : <span style={{ fontSize:11,color:"var(--faint)" }}>{o||"—"}</span>; };
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
                          <table style={{ width:"100%",borderCollapse:"collapse",minWidth:560 }}>
                            <thead><tr style={{ background:"var(--bg)" }}>
                              <TH w={85}>Client</TH><TH w={75}>Priority</TH><TH>Task</TH>
                              <TH w={88}>Started</TH><TH w={88}>Due</TH><TH w={80}>Age</TH>
                              <TH>Latest note</TH><TH w={95}>Status</TH>
                            </tr></thead>
                            <tbody>
                              {active.map((t, i) => {
                                const isBlocked = t.outcome === "Blocked";
                                const overdue   = t.dueDate && t.dueDate < TODAY;
                                return (
                                  <tr key={i} style={{ borderTop:"0.5px solid var(--border)",background:isBlocked?"var(--red-bg)":"transparent" }}>
                                    <td style={{ padding:"8px 12px" }}>{(() => { const lbl = t.project && t.client ? `${t.project} › ${t.client}` : t.project || t.client || null; return lbl ? <span style={{ fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:500,background:"var(--blue-bg)",color:"var(--blue)",border:"0.5px solid var(--blue-bd)" }}>{lbl}</span> : <span style={{ fontSize:11,color:"var(--faint)" }}>—</span>; })()}</td>
                                    <td style={{ padding:"8px 12px" }}>{pPill(t.priority)}</td>
                                    <td style={{ padding:"8px 12px" }}>
                                      <div style={{ fontSize:12,fontWeight:500 }}>{t.text}</div>
                                      {isBlocked && t.blockerDetail && (
                                        <div style={{ fontSize:10,color:"var(--red)",marginTop:2 }}>
                                          ⚑ {t.blockerDetail}{t.blockerOwner && <span style={{ color:"var(--muted)" }}> · {t.blockerOwner}</span>}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding:"8px 12px",fontSize:11,fontFamily:"JetBrains Mono, monospace",color:"var(--muted)",whiteSpace:"nowrap" }}>{t.startDate||"—"}</td>
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
                          <table style={{ width:"100%",borderCollapse:"collapse",minWidth:500 }}>
                            <thead><tr style={{ background:"var(--bg)" }}>
                              <TH w={85}>Client</TH><TH w={75}>Priority</TH><TH>Task</TH>
                              <TH w={88}>Started</TH><TH w={88}>Due</TH><TH w={80}>Days taken</TH><TH w={100}>Completed</TH>
                            </tr></thead>
                            <tbody>
                              {completed.map((t, i) => (
                                <tr key={i} style={{ borderTop:"0.5px solid var(--border)",background:i%2===1?"var(--bg)":"transparent" }}>
                                  <td style={{ padding:"7px 12px" }}>{cPill(t.client)}</td>
                                  <td style={{ padding:"7px 12px" }}>{pPill(t.priority)}</td>
                                  <td style={{ padding:"7px 12px",fontSize:12,fontWeight:500 }}>{t.text}</td>
                                  <td style={{ padding:"7px 12px",fontSize:11,fontFamily:"JetBrains Mono, monospace",color:"var(--muted)" }}>{t.startDate||"—"}</td>
                                  <td style={{ padding:"7px 12px",fontSize:11,fontFamily:"JetBrains Mono, monospace",color:"var(--muted)" }}>{t.dueDate||"—"}</td>
                                  <td style={{ padding:"7px 12px" }}><AgeBar startDate={t.startDate} dueDate={t.dueDate} isDone={true} /></td>
                                  <td style={{ padding:"7px 12px",fontSize:11,fontFamily:"JetBrains Mono, monospace",color:"var(--green)",fontWeight:500 }}>{t.endDate||"—"}</td>
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
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Task breakdown</span>
                  <span className="card-meta">{summary.daysSubmitted} days · {summary.totalTasks} project tasks</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width:88 }}>Date</th>
                      <th style={{ width:85 }}>Client</th>
                      <th style={{ width:75 }}>Priority</th>
                      <th>Task</th>
                      <th style={{ width:88 }}>Start</th>
                      <th style={{ width:88 }}>Due</th>
                      <th style={{ width:88 }}>End</th>
                      <th style={{ width:95 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.entries.flatMap((e, ei) =>
                      (e.tasks||[]).filter(t => t.text?.trim() && !t.isCarryOver).map((t, ti) => {
                        const os = OUTCOME_STYLE[t.status]||OUTCOME_STYLE[t.outcome];
                        const ps = PRIORITY_STYLE[t.priority||"Medium"];
                        const overdue = t.dueDate && t.dueDate < TODAY && (t.status||t.outcome) !== "Done";
                        return (
                          <tr key={`${ei}-${ti}`} style={{ background: (summary.rawEntries?.[ei]?.sod?.tasks?.[ti]?.isRecurring) ? "#EEEDFE15" : "transparent" }}>
                            <td style={{ fontFamily:"JetBrains Mono, monospace",fontSize:11,color:"var(--muted)" }}>{fmt(e.date)}</td>
                            <td style={{ fontSize:11,color:t.project?"var(--muted)":"var(--faint)" }}>{t.project||"—"}</td>
                            <td>{t.client ? <span className="badge badge-blue" style={{ fontSize:11 }}>{t.client}</span> : <span style={{ color:"var(--faint)" }}>—</span>}</td>
                            <td><span style={{ fontSize:10,padding:"2px 6px",borderRadius:20,fontWeight:500,color:ps.color,background:ps.bg,border:`0.5px solid ${ps.bd}` }}>{t.priority||"Medium"}</span></td>
                            <td className="text-sm">
                              {summary.rawEntries?.[ei]?.sod?.tasks?.[ti]?.isRecurring && (
                                <span style={{ fontSize:9, marginRight:5, padding:"1px 5px", borderRadius:10,
                                  background:"#EEEDFE", color:"#534AB7", border:"0.5px solid #AFA9EC", fontWeight:500 }}>↻</span>
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
                            <td>{os ? <span style={{ fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:500,background:os.bg,color:os.color,border:`0.5px solid ${os.bd}` }}>{t.status||t.outcome}</span> : <span style={{ fontSize:11,color:"var(--faint)" }}>{t.status||"—"}</span>}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <div style={{ padding:"7px 14px",fontSize:10,color:"var(--faint)",borderTop:"0.5px solid var(--border)" }}>
                  Carry-over tasks are tracked separately above
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}