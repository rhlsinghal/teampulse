import { useState, useEffect } from "react";
import { fmt, fmtMonthYear, MONTHS, MONTHS_SHORT, getAllMonthsInYear, toYYYYMM } from "../../utils/dates";
import { ClientBadge, StatusBadge, BwBadge, Loading, Spinner } from "../../components/index.jsx";
import { loadEntriesInRange } from "../../hooks/useHistory";
import { aggregateMonth, loadMonthlySummary } from "../../utils/aggregator";
import { BANDWIDTH, BW_STYLES, avatarColor, initials } from "../../utils/constants";

export default function MonthlyReports({ members }) {
  const now = new Date();
  const [selectedMember, setSelectedMember] = useState(members[0]?.name || "");
  const [selectedYear,   setSelectedYear]   = useState(now.getFullYear());
  const [selectedMonth,  setSelectedMonth]  = useState(now.getMonth());
  const [entries,        setEntries]        = useState([]);
  const [summary,        setSummary]        = useState(null);
  const [loading,        setLoading]        = useState(false);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (!selectedMember) return;
    setLoading(true);
    const startDate = `${monthKey}-01`;
    const endDate   = `${monthKey}-31`;
    loadEntriesInRange(selectedMember, startDate, endDate).then(async (ents) => {
      setEntries(ents);
      let sum = await loadMonthlySummary(selectedMember, monthKey);
      if (!sum && ents.length) {
        sum = await aggregateMonth(selectedMember, monthKey, ents);
      }
      setSummary(sum);
      setLoading(false);
    });
  }, [selectedMember, monthKey]);

  const exportCSV = () => {
    if (!entries.length) return;
    const rows = [["Date","Client","Task","Status","Bandwidth","Blockers"]];
    entries.forEach(e => {
      (e.tasks || []).forEach(t => {
        rows.push([e.date, t.client || "Internal", t.text, t.status, BANDWIDTH[e.bandwidth]?.label || "", e.blockers || ""]);
      });
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${selectedMember}_${monthKey}.csv`; a.click();
  };

  const sortedClients = Object.entries(summary?.tasksByClient || {}).sort((a, b) => b[1] - a[1]);
  const totalTasks = summary?.totalTasks || 0;

  return (
    <div className="main-content">
      {/* Controls */}
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Monthly report</div>
          <div className="flex gap-8 items-center flex-wrap">
            <select className="field-input" style={{ width: "auto" }} value={selectedMember} onChange={e => setSelectedMember(e.target.value)}>
              {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
            <select className="field-input" style={{ width: "auto" }} value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="field-input" style={{ width: "auto" }} value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
              {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-ghost" onClick={exportCSV} disabled={!entries.length}>Export CSV</button>
          <button className="btn btn-primary" onClick={() => window.print()}>Export PDF</button>
        </div>
      </div>

      {loading ? <Loading /> : !summary ? (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div className="text-sm">No data for {selectedMember} in {MONTHS[selectedMonth]} {selectedYear}</div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="stats-grid stats-grid-4 mb-12">
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{summary.daysSubmitted}</div><div className="stat-label">Days submitted</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{summary.tasksByStatus?.Done || 0}</div><div className="stat-label">Tasks done</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{summary.totalBlockers}</div><div className="stat-label">Blockers raised</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--amber)" }}>{Object.keys(summary.tasksByClient || {}).length}</div><div className="stat-label">Clients served</div></div>
          </div>

          <div className="form-grid-2 mb-12">
            {/* Client breakdown */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header"><span className="card-title">Tasks by client</span></div>
              <div className="card-body">
                {sortedClients.map(([client, count]) => (
                  <div key={client} style={{ marginBottom: 10 }}>
                    <div className="flex justify-between mb-4">
                      <span className="text-sm font-medium">{client}</span>
                      <span className="text-xs text-muted">{count} tasks</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${totalTasks ? (count/totalTasks)*100 : 0}%`, background: client.toLowerCase().includes("internal") ? "var(--faint)" : client.toLowerCase().includes("b") ? "var(--amber)" : "var(--blue)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status breakdown */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header"><span className="card-title">Tasks by status</span></div>
              <div className="card-body">
                {Object.entries(summary.tasksByStatus || {}).map(([status, count]) => (
                  <div key={status} style={{ marginBottom: 10 }}>
                    <div className="flex justify-between mb-4">
                      <span className="text-sm font-medium">{status}</span>
                      <span className="text-xs text-muted">{count} tasks</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${totalTasks ? (count/totalTasks)*100 : 0}%`, background: status === "Done" ? "var(--green)" : status === "Blocked" ? "var(--red)" : status === "In Progress" ? "var(--blue)" : "var(--faint)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Task breakdown table */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Task breakdown</span>
              <span className="card-meta">{entries.length} days · {totalTasks} tasks</span>
            </div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Client</th><th>Task</th><th>Status</th></tr></thead>
              <tbody>
                {entries.flatMap(e =>
                  (e.tasks || []).filter(t => t.text?.trim()).map((t, ti) => (
                    <tr key={`${e.date}-${ti}`}>
                      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted)" }}>{fmt(e.date)}</td>
                      <td><ClientBadge client={t.client} /></td>
                      <td className="text-sm">{t.text}</td>
                      <td><StatusBadge status={t.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
