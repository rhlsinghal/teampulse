import { useState, useEffect } from "react";
import { avatarColor, initials, BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY, MONTHS_SHORT, getDaysInMonth, getFirstDayOfMonth, isoDate } from "../../utils/dates";
import { ClientBadge, StatusBadge, BwBadge, Loading } from "../../components/index.jsx";
import { loadEntriesInRange } from "../../hooks/useHistory";

export default function MemberProfile({ memberName, memberRecord, onBack }) {
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  useEffect(() => {
    const start = `${currentYear}-01-01`;
    const end   = TODAY;
    loadEntriesInRange(memberName, start, end).then(res => {
      setEntries(res);
      setLoading(false);
    });
  }, [memberName]);

  if (loading) return <div className="main-content"><Loading /></div>;

  const color = avatarColor(memberName);
  const entryDates = entries.map(e => e.date);

  // Stats
  const totalTasks = entries.reduce((acc, e) => acc + (e.tasks?.filter(t => t.text?.trim()).length || 0), 0);
  const doneTasks  = entries.reduce((acc, e) => acc + (e.tasks?.filter(t => t.status === "Done").length || 0), 0);
  const blockers   = entries.filter(e => e.blockers?.trim()).length;
  const clients    = [...new Set(entries.flatMap(e => (e.tasks || []).map(t => t.client).filter(Boolean)))];
  const bwValues   = entries.map(e => e.bandwidth).filter(Boolean);
  const avgBw      = bwValues.length ? Math.round(bwValues.reduce((a, b) => a + b, 0) / bwValues.length) : 3;

  // Client breakdown
  const clientCounts = {};
  entries.forEach(e => (e.tasks || []).forEach(t => {
    if (t.text?.trim()) clientCounts[t.client || "Internal"] = (clientCounts[t.client || "Internal"] || 0) + 1;
  }));
  const sortedClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]);
  const topClient = sortedClients[0]?.[0] || "—";

  // Streak
  let streak = 0;
  const d = new Date();
  const sortedDates = [...entryDates].sort((a,b) => b.localeCompare(a));
  for (const date of sortedDates) {
    const expected = d.toISOString().slice(0, 10);
    if (date === expected) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }

  const recentTasks = entries.slice(0, 3).flatMap(e =>
    (e.tasks || []).filter(t => t.text?.trim()).map(t => ({ ...t, date: e.date }))
  ).slice(0, 5);

  return (
    <div className="main-content">
      <button className="btn btn-ghost btn-sm mb-16" onClick={onBack}>← Back to overview</button>

      {/* Profile header */}
      <div className="card mb-12">
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div className="avatar avatar-lg" style={{ background: color + "25", color, fontSize: 20 }}>{initials(memberName)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{memberName}</div>
            <div className="flex items-center gap-8 flex-wrap">
              <span className="text-sm text-muted">{memberRecord?.email || ""}</span>
              <span className="badge badge-green">Active</span>
              {topClient !== "—" && <span className="badge badge-blue">Primary: {topClient}</span>}
              {streak > 0 && <span className="badge badge-amber">🔥 {streak} day streak</span>}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => alert("Navigate to annual report for this member")}>
            Generate report
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid mb-12" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{entries.length}</div><div className="stat-label">Days submitted</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{doneTasks}</div><div className="stat-label">Tasks done</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{blockers}</div><div className="stat-label">Blockers raised</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--amber)" }}>{clients.length}</div><div className="stat-label">Clients served</div></div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: BW_STYLES[avgBw]?.color, fontSize: 16, paddingTop: 2 }}>{BANDWIDTH[avgBw]?.label || "—"}</div>
          <div className="stat-label">Avg bandwidth</div>
        </div>
      </div>

      <div className="form-grid-2">
        {/* Mini heatmap for current month */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header"><span className="card-title">Activity — {MONTHS_SHORT[currentMonth]} {currentYear}</span></div>
          <div className="card-body">
            <MiniHeatmap year={currentYear} month={currentMonth} entryDates={entryDates} blockerDates={entries.filter(e=>e.blockers?.trim()).map(e=>e.date)} />
          </div>
        </div>

        {/* Client distribution */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header"><span className="card-title">Work distribution</span><span className="card-meta">This year</span></div>
          <div className="card-body">
            {sortedClients.slice(0, 4).map(([client, count]) => (
              <div key={client} style={{ marginBottom: 10 }}>
                <div className="flex justify-between mb-4">
                  <span className="text-sm font-medium">{client}</span>
                  <span className="text-xs text-muted">{count} tasks · {Math.round((count/totalTasks)*100)}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(count/totalTasks)*100}%`, background: client.toLowerCase().includes("internal") ? "var(--faint)" : client.toLowerCase().includes("b") ? "var(--amber)" : "var(--blue)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent tasks */}
      {recentTasks.length > 0 && (
        <div className="card mt-12">
          <div className="card-header"><span className="card-title">Recent tasks</span><span className="card-meta">Last 5</span></div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Client</th><th>Task</th><th>Status</th></tr></thead>
            <tbody>
              {recentTasks.map((t, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted)" }}>{fmt(t.date)}</td>
                  <td><ClientBadge client={t.client} /></td>
                  <td className="text-sm">{t.text}</td>
                  <td><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MiniHeatmap({ year, month, entryDates, blockerDates }) {
  const days = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayIso = TODAY;
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 6 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, color: "var(--faint)" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = isoDate(year, month, d);
          const hasEntry = entryDates.includes(iso);
          const isBlocker = blockerDates.includes(iso);
          const isFuture = iso > todayIso;
          let bg = isFuture ? "transparent" : hasEntry ? (isBlocker ? "var(--red-bg)" : "#5b5ff550") : "var(--bg)";
          let border = isFuture ? "none" : hasEntry ? (isBlocker ? "0.5px solid var(--red-bd)" : "none") : "0.5px solid var(--border)";
          return (
            <div key={i} style={{ aspectRatio: "1", borderRadius: 3, background: bg, border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--faint)" }}>
              {d}
            </div>
          );
        })}
      </div>
      <div className="flex gap-10 mt-8" style={{ flexWrap: "wrap" }}>
        <div className="cal-legend-item" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)" }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: "#5b5ff550" }} />Submitted
        </div>
        <div className="cal-legend-item" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)" }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--red-bg)", border: "0.5px solid var(--red-bd)" }} />Blocker
        </div>
      </div>
    </div>
  );
}
