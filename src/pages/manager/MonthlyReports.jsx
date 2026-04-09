import { useState, useEffect } from "react";
import { fmt, MONTHS, toYYYYMM } from "../../utils/dates";
import { ClientBadge, StatusBadge, Loading, Spinner } from "../../components/index.jsx";
import { loadEntriesInRange } from "../../hooks/useHistory";
import { aggregateMonth, loadMonthlySummary, normaliseEntry } from "../../utils/aggregator";
import { BANDWIDTH } from "../../utils/constants";

const AI_PROXY_URL = "https://teampulse-api-pied.vercel.app/api/chat";

export default function MonthlyReports({ members }) {
  const now = new Date();
  const [selectedMember, setSelectedMember] = useState(members[0]?.name || "");
  const [selectedYear,   setSelectedYear]   = useState(now.getFullYear());
  const [selectedMonth,  setSelectedMonth]  = useState(now.getMonth());
  const [entries,        setEntries]        = useState([]);
  const [summary,        setSummary]        = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [aiLoading,      setAiLoading]      = useState(false);
  const [aiSummary,      setAiSummary]      = useState(null);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (!selectedMember) return;
    setLoading(true);
    setAiSummary(null);
    const startDate = `${monthKey}-01`;
    const endDate   = `${monthKey}-31`;
    loadEntriesInRange(selectedMember, startDate, endDate).then(async (rawEnts) => {
      const ents = rawEnts.map(normaliseEntry);
      setEntries(ents);
      // Always re-aggregate from live entries so blockers and tasks are always current
      let sum = null;
      if (ents.length) {
        sum = await aggregateMonth(selectedMember, monthKey, rawEnts);
      } else {
        sum = await loadMonthlySummary(selectedMember, monthKey);
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
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${selectedMember}_${monthKey}.csv`; a.click();
  };

  const generateAI = async () => {
    if (!summary) return;
    setAiLoading(true);
    try {
      const topClients = Object.entries(summary.tasksByClient || {})
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${c}: ${n} tasks`)
        .join(", ");

      const blockerList = (summary.blockerList || [])
        .map(b => `"${b.text}" on ${b.date}`)
        .join("; ") || "none";

      const bwLabel = BANDWIDTH[summary.avgBandwidth]?.label || "Balanced";

      const res = await fetch(AI_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 900,
          messages: [{
            role: "user",
            content: `You are an HR and engineering manager assistant. Write a monthly performance summary for ${selectedMember} for ${MONTHS[selectedMonth]} ${selectedYear}.

Data:
- Days submitted: ${summary.daysSubmitted}
- Tasks completed (Done): ${summary.tasksByStatus?.Done || 0}
- Tasks in progress: ${summary.tasksByStatus?.["In Progress"] || 0}
- Blocked tasks: ${summary.tasksByStatus?.Blocked || 0}
- Blockers raised: ${summary.totalBlockers} — details: ${blockerList}
- Client distribution: ${topClients || "no tasks recorded"}
- Average bandwidth: ${bwLabel}

Reply ONLY with this exact JSON (no markdown):
{
  "overview": "2-3 sentence summary of this month's performance",
  "highlights": "Key achievements this month (bullet points starting with •, newline-separated)",
  "concerns": "Any concerns, blockers or patterns to watch, or 'No concerns this month ✓'",
  "recommendation": "1-2 sentence recommendation for next month"
}`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      setAiSummary(JSON.parse(text.replace(/```json|```/g, "").trim()));
    } catch (e) {
      setAiSummary({ overview: "Failed to generate summary. Please try again.", highlights: "", concerns: "", recommendation: "" });
    }
    setAiLoading(false);
  };

  const sortedClients = Object.entries(summary?.tasksByClient || {}).sort((a, b) => b[1] - a[1]);
  const totalTasks    = summary?.totalTasks || 0;

  return (
    <div className="main-content">
      {/* Controls */}
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Monthly report</div>
          <div className="flex gap-8 items-center flex-wrap">
            <select className="field-input" style={{ width: "auto" }} value={selectedMember}
              onChange={e => { setSelectedMember(e.target.value); setAiSummary(null); }}>
              {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
            <select className="field-input" style={{ width: "auto" }} value={selectedMonth}
              onChange={e => { setSelectedMonth(+e.target.value); setAiSummary(null); }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="field-input" style={{ width: "auto" }} value={selectedYear}
              onChange={e => { setSelectedYear(+e.target.value); setAiSummary(null); }}>
              {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-ghost" onClick={exportCSV} disabled={!entries.length}>Export CSV</button>
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!summary}>Export PDF</button>
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
                {sortedClients.length ? sortedClients.map(([client, count]) => (
                  <div key={client} style={{ marginBottom: 10 }}>
                    <div className="flex justify-between mb-4">
                      <span className="text-sm font-medium">{client}</span>
                      <span className="text-xs text-muted">{count} tasks</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${totalTasks ? (count / totalTasks) * 100 : 0}%`, background: client.toLowerCase().includes("internal") ? "var(--faint)" : client.toLowerCase().includes("b") ? "var(--amber)" : "var(--blue)" }} />
                    </div>
                  </div>
                )) : <div className="text-sm text-muted">No tasks recorded</div>}
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
                      <div className="progress-fill" style={{ width: `${totalTasks ? (count / totalTasks) * 100 : 0}%`, background: status === "Done" ? "var(--green)" : status === "Blocked" ? "var(--red)" : status === "In Progress" ? "var(--blue)" : "var(--faint)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Monthly Summary */}
          <div className="ai-box mb-12">
            <div className="ai-box-header">
              <div className="ai-box-title">
                <div className="ai-icon">AI</div>
                AI-generated monthly summary
              </div>
              <div className="flex gap-6">
                <button className="btn btn-ghost btn-sm" onClick={generateAI} disabled={aiLoading}>
                  {aiLoading ? <><Spinner /> Generating...</> : aiSummary ? "Regenerate" : "✦ Generate summary"}
                </button>
                {aiSummary && <button className="btn btn-ghost btn-sm" onClick={() => setAiSummary(null)}>Clear</button>}
              </div>
            </div>
            {aiSummary ? (
              <div className="ai-grid">
                {[
                  { label: "Overview",        key: "overview"        },
                  { label: "Highlights",       key: "highlights"      },
                  { label: "Concerns",         key: "concerns"        },
                  { label: "Recommendation",   key: "recommendation"  },
                ].map(s => aiSummary[s.key] ? (
                  <div key={s.key}>
                    <div className="ai-section-label">{s.label}</div>
                    <div className="ai-section-text" style={{ whiteSpace: "pre-wrap" }}>{aiSummary[s.key]}</div>
                  </div>
                ) : null)}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: 13 }}>
                Click "Generate summary" to create an AI-written monthly review for {selectedMember} — {MONTHS[selectedMonth]} {selectedYear}
              </div>
            )}
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
