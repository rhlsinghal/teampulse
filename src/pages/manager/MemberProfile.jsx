import { useState, useEffect } from "react";
import { avatarColor, initials, BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY, MONTHS, MONTHS_SHORT, getDaysInMonth, getFirstDayOfMonth, isoDate } from "../../utils/dates";
import { Loading } from "../../components/index.jsx";
import { loadEntriesInRange } from "../../hooks/useHistory";
import { normaliseEntry } from "../../utils/aggregator";

const PRIORITY_STYLE = {
  "High":   { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "Medium": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Low":    { color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
};
const OUTCOME_STYLE = {
  "Done":       { color: "var(--green)", bg: "var(--green-bg)", bd: "var(--green-bd)" },
  "Carry over": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Blocked":    { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "In Progress":{ color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
};

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Mini heatmap ──────────────────────────────────────────────────────────────
function MiniHeatmap({ year, month, entryDates, blockerDates }) {
  const days     = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells    = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, color: "var(--faint)" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso       = isoDate(year, month, d);
          const hasEntry  = entryDates.includes(iso);
          const isBlocker = blockerDates.includes(iso);
          const isFuture  = iso > TODAY;
          const bg = isFuture ? "transparent"
            : hasEntry ? (isBlocker ? "var(--red-bg)" : "#5b5ff540") : "var(--bg)";
          const border = isFuture ? "none"
            : hasEntry ? (isBlocker ? "0.5px solid var(--red-bd)" : "none") : "0.5px solid var(--border)";
          return (
            <div key={i} style={{ aspectRatio: "1", borderRadius: 3, background: bg, border,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--faint)" }}>
              {d}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)" }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: "#5b5ff540" }} />Submitted
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)" }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--red-bg)", border: "0.5px solid var(--red-bd)" }} />Blocker
        </div>
      </div>
    </div>
  );
}

// ── Today's full SOD + EOD detail ─────────────────────────────────────────────
function TodayDetail({ entry }) {
  const sod = entry?.sod;
  const eod = entry?.eod;
  if (!sod && !eod) return null;

  const sodTasks = sod?.tasks || [];
  const eodTasks = eod?.tasks || [];
  const displayTasks = eod?.submittedAt
    ? eodTasks.map((t, i) => ({
        ...t,
        priority:  t.priority  || sodTasks[i]?.priority  || "Medium",
        startDate: t.startDate || sodTasks[i]?.startDate || "",
        dueDate:   t.dueDate   || sodTasks[i]?.dueDate   || "",
      }))
    : sodTasks;

  const pct = eod?.submittedAt && eodTasks.length
    ? Math.round(eodTasks.filter(t => t.outcome === "Done").length / eodTasks.length * 100)
    : null;

  return (
    <div className="card mb-12">
      <div className="card-header">
        <span className="card-title">Today's update</span>
        <div style={{ display: "flex", gap: 6 }}>
          {sod?.submittedAt && (
            <span className="badge badge-blue" style={{ fontSize: 10 }}>SOD {fmtTime(sod.submittedAt)}</span>
          )}
          {eod?.submittedAt
            ? <span className="badge badge-green" style={{ fontSize: 10 }}>EOD {fmtTime(eod.submittedAt)}</span>
            : sod?.submittedAt && <span className="badge badge-amber" style={{ fontSize: 10 }}>EOD pending</span>}
          {pct != null && (
            <span className="badge badge-green" style={{ fontSize: 10 }}>{pct}% complete</span>
          )}
        </div>
      </div>
      {displayTasks.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Client</th>
                <th style={{ width: 80 }}>Priority</th>
                <th>Task</th>
                <th style={{ width: 95 }}>Start</th>
                <th style={{ width: 95 }}>Due</th>
                <th style={{ width: 95 }}>End date</th>
                {eod?.submittedAt && <th style={{ width: 100 }}>Outcome</th>}
              </tr>
            </thead>
            <tbody>
              {displayTasks.filter(t => t.text?.trim()).map((t, i) => {
                const ps = PRIORITY_STYLE[t.priority || "Medium"];
                const os = OUTCOME_STYLE[t.outcome];
                const overdue = t.dueDate && t.dueDate < TODAY && t.outcome !== "Done";
                return (
                  <tr key={i} style={{ background: t.outcome === "Blocked" ? "var(--red-bg)" : t.adhoc ? "#fffbeb" : "transparent" }}>
                    <td>{t.client
                      ? <span className="badge badge-blue" style={{ fontSize: 10 }}>{t.client}</span>
                      : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                    <td><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, fontWeight: 500,
                      color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}` }}>{t.priority || "Medium"}</span></td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>
                      {t.text}
                      {t.adhoc && <span style={{ fontSize: 9, marginLeft: 5, padding: "1px 4px", borderRadius: 8,
                        background: "#fffbeb", color: "#854F0B", border: "0.5px solid #FAC775" }}>ad-hoc</span>}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted)" }}>{t.startDate || "—"}</td>
                    <td>
                      {t.dueDate
                        ? <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                            color: overdue ? "var(--red)" : "var(--muted)",
                            background: overdue ? "var(--red-bg)" : "transparent",
                            padding: overdue ? "1px 4px" : 0, borderRadius: 3 }}>
                            {t.dueDate}{overdue ? " ⚠" : ""}
                          </span>
                        : <span style={{ color: "var(--faint)", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                      color: t.endDate ? "var(--green)" : "var(--faint)" }}>{t.endDate || "—"}</td>
                    {eod?.submittedAt && (
                      <td>{os
                        ? <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                            color: os.color, background: os.bg, border: `0.5px solid ${os.bd}` }}>{t.outcome}</span>
                        : <span style={{ color: "var(--faint)", fontSize: 11 }}>—</span>}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Carry-over notes + blocker details */}
      {eod?.submittedAt && eodTasks.some(t => (t.outcome === "Carry over" && t.notes) || (t.outcome === "Blocked" && t.blockerDetail)) && (
        <div style={{ padding: "8px 14px 10px", borderTop: "0.5px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
          {eodTasks.filter(t => t.outcome === "Carry over" && t.notes).map((t, i) => (
            <div key={`co-${i}`} style={{ fontSize: 11, color: "var(--amber)", display: "flex", gap: 6 }}>
              <span>↪</span><span><span style={{ fontWeight: 500 }}>{t.text}:</span> {t.notes}</span>
            </div>
          ))}
          {eodTasks.filter(t => t.outcome === "Blocked" && t.blockerDetail).map((t, i) => (
            <div key={`bl-${i}`}>
              <div style={{ fontSize: 11, color: "var(--red)", display: "flex", gap: 6 }}>
                <span>⚑</span><span><span style={{ fontWeight: 500 }}>{t.text}:</span> {t.blockerDetail}</span>
              </div>
              {t.blockerOwner && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginLeft: 16 }}>Owner: {t.blockerOwner}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MemberProfile({ memberName, memberRecord, onBack }) {
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth();

  useEffect(() => {
    loadEntriesInRange(memberName, `${currentYear}-01-01`, TODAY).then(res => {
      setEntries(res); setLoading(false);
    });
  }, [memberName]);

  if (loading) return <div className="main-content"><Loading /></div>;

  const color      = avatarColor(memberName);
  const todayEntry = entries.find(e => e.date === TODAY) || null;

  // Normalise for stats
  const normed = entries.map(normaliseEntry);
  const allTasks = normed.flatMap(e => e.tasks || []);
  const totalTasks = allTasks.filter(t => t.text?.trim()).length;
  const doneTasks  = allTasks.filter(t => t.status === "Done" || t.outcome === "Done").length;
  const blockers   = normed.filter(e => e.blockers?.trim()).length;
  const clientSet  = [...new Set(allTasks.map(t => t.client).filter(Boolean))];
  const bwValues   = normed.map(e => e.bandwidth).filter(Boolean);
  const avgBw      = bwValues.length ? Math.round(bwValues.reduce((a,b) => a+b, 0) / bwValues.length) : 3;

  // Client breakdown
  const clientCounts = {};
  allTasks.forEach(t => {
    if (t.text?.trim()) clientCounts[t.client || "Internal"] = (clientCounts[t.client || "Internal"] || 0) + 1;
  });
  const sortedClients = Object.entries(clientCounts).sort((a,b) => b[1]-a[1]);
  const topClient = sortedClients[0]?.[0] || "—";

  // Streak
  let streak = 0;
  const d = new Date();
  const sortedDates = [...entries.map(e => e.date)].sort((a,b) => b.localeCompare(a));
  for (const date of sortedDates) {
    const expected = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (date === expected) { streak++; d.setDate(d.getDate()-1); } else break;
  }

  const entryDates  = entries.map(e => e.date);
  const blockerDates = normed.filter(e => e.blockers?.trim()).map(e => e.date);

  // Priority breakdown
  const priorityCounts = { "High": 0, "Medium": 0, "Low": 0 };
  allTasks.forEach(t => { const p = t.priority || "Medium"; if (priorityCounts[p] !== undefined) priorityCounts[p]++; });

  return (
    <div className="main-content">
      <button className="btn btn-ghost btn-sm mb-16" onClick={onBack}>← Back to overview</button>

      {/* Profile header */}
      <div className="card mb-12">
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: color + "22", color,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 500 }}>
            {initials(memberName)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 5 }}>{memberName}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {memberRecord?.email && <span className="text-sm text-muted">{memberRecord.email}</span>}
              <span className="badge badge-green">Active</span>
              {topClient !== "—" && <span className="badge badge-blue">Primary: {topClient}</span>}
              {streak > 0 && <span className="badge badge-amber">🔥 {streak} day streak</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid mb-12" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{entries.length}</div><div className="stat-label">Days submitted</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{doneTasks}</div><div className="stat-label">Tasks done</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{blockers}</div><div className="stat-label">Blockers raised</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--amber)" }}>{clientSet.length}</div><div className="stat-label">Clients served</div></div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: BW_STYLES[avgBw]?.color, fontSize: 16, paddingTop: 2 }}>
            {BANDWIDTH[avgBw]?.label || "—"}
          </div>
          <div className="stat-label">Avg bandwidth</div>
        </div>
      </div>

      {/* Today's detail */}
      {todayEntry && <TodayDetail entry={todayEntry} />}

      <div className="form-grid-2 mb-12">
        {/* Heatmap */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title">Activity — {MONTHS_SHORT[currentMonth]} {currentYear}</span>
          </div>
          <div className="card-body">
            <MiniHeatmap year={currentYear} month={currentMonth}
              entryDates={entryDates} blockerDates={blockerDates} />
          </div>
        </div>

        {/* Work distribution */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title">Work distribution</span>
            <span className="card-meta">This year</span>
          </div>
          <div className="card-body">
            {sortedClients.slice(0, 5).map(([client, count]) => (
              <div key={client} style={{ marginBottom: 10 }}>
                <div className="flex justify-between mb-4">
                  <span className="text-sm font-medium">{client}</span>
                  <span className="text-xs text-muted">{count} tasks · {totalTasks ? Math.round(count/totalTasks*100) : 0}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${totalTasks ? (count/totalTasks)*100 : 0}%`, background: "var(--accent)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Priority breakdown */}
      <div className="card mb-12">
        <div className="card-header">
          <span className="card-title">Tasks by priority</span>
          <span className="card-meta">{totalTasks} total this year</span>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {Object.entries(priorityCounts).map(([p, count]) => {
              const ps = PRIORITY_STYLE[p];
              return (
                <div key={p} style={{ padding: "10px 14px", borderRadius: 8, background: ps.bg,
                  border: `0.5px solid ${ps.bd}` }}>
                  <div style={{ fontSize: 22, fontWeight: 500, color: ps.color, marginBottom: 2 }}>{count}</div>
                  <div style={{ fontSize: 11, color: ps.color }}>{p} priority</div>
                  <div style={{ fontSize: 10, color: ps.color, opacity: 0.7 }}>
                    {totalTasks ? Math.round(count/totalTasks*100) : 0}% of tasks
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent entries */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent entries</span>
          <span className="card-meta">Last 10 days</span>
        </div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Client</th><th>Task</th><th>Priority</th><th>Status</th><th>End date</th></tr></thead>
          <tbody>
            {normed.slice(0, 10).flatMap((e, ei) =>
              (e.tasks || []).filter(t => t.text?.trim()).map((t, ti) => {
                const os = OUTCOME_STYLE[t.status || t.outcome];
                const ps = PRIORITY_STYLE[t.priority || "Medium"];
                return (
                  <tr key={`${ei}-${ti}`}>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted)" }}>{fmt(e.date)}</td>
                    <td>{t.client ? <span className="badge badge-blue" style={{ fontSize: 10 }}>{t.client}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                    <td style={{ fontSize: 12 }}>{t.text}</td>
                    <td><span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                      color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}` }}>{t.priority || "Medium"}</span></td>
                    <td>{os ? <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                      color: os.color, background: os.bg, border: `0.5px solid ${os.bd}` }}>{t.status || t.outcome}</span>
                      : <span style={{ color: "var(--faint)", fontSize: 11 }}>{t.status || "—"}</span>}</td>
                    <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                      color: t.endDate ? "var(--green)" : "var(--faint)" }}>{t.endDate || "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
