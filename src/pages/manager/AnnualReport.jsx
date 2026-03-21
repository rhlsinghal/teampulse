import { useState, useEffect } from "react";
import { MONTHS, MONTHS_SHORT, getAllMonthsInYear, fmtMonthYear } from "../../utils/dates";
import { ClientBadge, StatusBadge, Loading, Spinner } from "../../components/index.jsx";
import { loadEntriesInRange } from "../../hooks/useHistory";
import { aggregateMonth, loadMonthlySummary, buildAnnualSummary } from "../../utils/aggregator";
import { BANDWIDTH, BW_STYLES, avatarColor, initials } from "../../utils/constants";

export default function AnnualReport({ members }) {
  const now = new Date();
  const [selectedMember, setSelectedMember] = useState(members[0]?.name || "");
  const [selectedYear,   setSelectedYear]   = useState(now.getFullYear());
  const [annualData,     setAnnualData]     = useState(null);
  const [monthlySums,    setMonthlySums]    = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [aiLoading,      setAiLoading]      = useState(false);
  const [aiSummary,      setAiSummary]      = useState(null);

  useEffect(() => {
    if (!selectedMember) return;
    setLoading(true);
    setAiSummary(null);

    const months = getAllMonthsInYear(selectedYear);
    Promise.all(months.map(async (mk) => {
      let sum = await loadMonthlySummary(selectedMember, mk);
      if (!sum) {
        const startDate = `${mk}-01`;
        const endDate   = `${mk}-31`;
        const entries   = await loadEntriesInRange(selectedMember, startDate, endDate);
        if (entries.length) sum = await aggregateMonth(selectedMember, mk, entries);
      }
      return sum;
    })).then(sums => {
      const valid = sums.filter(Boolean);
      setMonthlySums(sums); // keep nulls for chart alignment
      setAnnualData(buildAnnualSummary(valid));
      setLoading(false);
    });
  }, [selectedMember, selectedYear]);

  const generateAI = async () => {
    if (!annualData) return;
    setAiLoading(true);
    try {
      const snapshot = monthlySums.map((s, i) => s
        ? `${MONTHS_SHORT[i]}: submitted=${s.daysSubmitted}, tasks=${s.totalTasks}, blockers=${s.totalBlockers}, topClient=${s.topClient}, avgBw=${BANDWIDTH[s.avgBandwidth]?.label}`
        : `${MONTHS_SHORT[i]}: no data`
      ).join("\n");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1200,
          messages: [{
            role: "user",
            content: `You are an HR and engineering manager assistant. Write an annual performance review for ${selectedMember} for the year ${selectedYear}.

Monthly data:
${snapshot}

Annual totals: ${annualData.totalDaysSubmitted} days submitted, ${annualData.totalTasks} tasks completed, ${annualData.totalBlockers} blockers raised.

Reply ONLY with this exact JSON (no markdown):
{
  "overall": "2-3 sentence overall performance summary",
  "highlights": "3-4 key achievements this year (bullet points starting with •, newline-separated)",
  "growth": "2-3 sentences on areas of growth or improvement observed",
  "recommendations": "2-3 sentences on recommendations for next year"
}`
          }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      setAiSummary(JSON.parse(text.replace(/```json|```/g, "").trim()));
    } catch (e) {
      setAiSummary({ overall: "Failed to generate summary. Please try again.", highlights: "", growth: "", recommendations: "" });
    }
    setAiLoading(false);
  };

  const exportCSV = () => {
    if (!monthlySums.length) return;
    const rows = [["Month","Days Submitted","Tasks Completed","Blockers","Top Client","Avg Bandwidth"]];
    monthlySums.forEach((s, i) => {
      rows.push([
        `${MONTHS[i]} ${selectedYear}`,
        s?.daysSubmitted || 0,
        s?.totalTasks || 0,
        s?.totalBlockers || 0,
        s?.topClient || "—",
        s ? BANDWIDTH[s.avgBandwidth]?.label || "—" : "—"
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${selectedMember}_${selectedYear}_annual.csv`; a.click();
  };

  const color = avatarColor(selectedMember);
  const submissionRate = annualData
    ? Math.round((annualData.totalDaysSubmitted / 240) * 100) // ~240 working days
    : 0;

  const sortedClients = annualData
    ? Object.entries(annualData.tasksByClient).sort((a, b) => b[1] - a[1])
    : [];

  const maxMonthTasks = Math.max(...(monthlySums.map(s => s?.totalTasks || 0)), 1);

  return (
    <div className="main-content">
      {/* Controls */}
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Annual report</div>
          <div className="flex gap-8 items-center flex-wrap">
            <select className="field-input" style={{ width: "auto" }} value={selectedMember} onChange={e => { setSelectedMember(e.target.value); setAiSummary(null); }}>
              {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
            <select className="field-input" style={{ width: "auto" }} value={selectedYear} onChange={e => { setSelectedYear(+e.target.value); setAiSummary(null); }}>
              {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {annualData && <span className="text-xs text-faint">Jan 1 — Dec 31, {selectedYear}</span>}
          </div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-ghost" onClick={exportCSV} disabled={!annualData}>Export CSV</button>
          <button className="btn btn-ghost" onClick={() => window.print()} disabled={!annualData}>Export PDF</button>
          <button className="btn btn-primary" onClick={() => alert("Report sent to employee email")} disabled={!annualData}>Send to employee</button>
        </div>
      </div>

      {loading ? <Loading /> : !annualData ? (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div className="text-sm">No data found for {selectedMember} in {selectedYear}</div>
        </div>
      ) : (
        <>
          {/* Profile strip */}
          <div className="card mb-12">
            <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div className="avatar avatar-lg" style={{ background: color + "25", color, fontSize: 18 }}>{initials(selectedMember)}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{selectedMember}</div>
                <div className="flex gap-8 flex-wrap">
                  <span className="badge badge-green">Active</span>
                  {sortedClients[0] && <span className="badge badge-blue">Primary: {sortedClients[0][0]}</span>}
                </div>
              </div>
              {[
                { val: `${submissionRate}%`, label: "Submission rate", sub: `${annualData.totalDaysSubmitted} of ~240 days`, color: "var(--accent)" },
                { val: annualData.totalTasks,    label: "Total tasks",       sub: "across 12 months",          color: "var(--green)" },
                { val: sortedClients.length,     label: "Clients served",    sub: sortedClients.map(([c])=>c).join(", ").slice(0,30), color: "var(--amber)" },
                { val: annualData.totalBlockers, label: "Blockers raised",   sub: "tracked this year",          color: "var(--red)" },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: "center", padding: "0 20px", borderLeft: "0.5px solid var(--border)" }}>
                  <div style={{ fontSize: 22, fontWeight: 500, color: s.color }}>{s.val}</div>
                  <div className="text-xs font-medium" style={{ marginBottom: 2 }}>{s.label}</div>
                  <div className="text-xxs text-faint">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Month-by-month bar chart */}
          <div className="card mb-12">
            <div className="card-header">
              <span className="card-title">Tasks completed — month by month</span>
              <div className="flex gap-10">
                {sortedClients.slice(0,3).map(([c]) => (
                  <div key={c} className="flex items-center gap-4 text-xxs text-muted">
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: c.toLowerCase().includes("internal") ? "var(--faint)" : c.toLowerCase().includes("b") ? "var(--amber)" : "var(--blue)" }} />
                    {c}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
                {monthlySums.map((s, i) => {
                  const total = s?.totalTasks || 0;
                  const h = total ? Math.round((total / maxMonthTasks) * 100) : 0;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1 }}>
                      {total > 0 && (
                        <div style={{ height: `${h}%`, background: "var(--blue)", borderRadius: "2px 2px 0 0", opacity: 0.85, minHeight: 3 }}
                          title={`${MONTHS_SHORT[i]}: ${total} tasks`} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {MONTHS_SHORT.map(m => <div key={m} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--faint)" }}>{m}</div>)}
              </div>
            </div>
          </div>

          <div className="form-grid-2 mb-12">
            {/* Client distribution */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header"><span className="card-title">Client distribution</span><span className="card-meta">Full year</span></div>
              <div className="card-body">
                {sortedClients.map(([client, count]) => (
                  <div key={client} style={{ marginBottom: 10 }}>
                    <div className="flex justify-between mb-4">
                      <span className="text-sm font-medium">{client}</span>
                      <span className="text-xs text-muted">{count} tasks · {Math.round((count/annualData.totalTasks)*100)}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${(count/annualData.totalTasks)*100}%`, background: client.toLowerCase().includes("internal") ? "var(--faint)" : client.toLowerCase().includes("b") ? "var(--amber)" : "var(--blue)" }} />
                    </div>
                  </div>
                ))}
                <div className="border-top mt-12">
                  <div className="field-label mb-8">Task status breakdown</div>
                  <div className="flex gap-6">
                    {Object.entries(annualData.tasksByStatus).map(([status, count]) => {
                      const colors = { Done: ["var(--green)", "var(--green-bg)", "var(--green-bd)"], "In Progress": ["var(--blue)", "var(--blue-bg)", "var(--blue-bd)"], Blocked: ["var(--red)", "var(--red-bg)", "var(--red-bd)"], Pending: ["var(--faint)", "var(--bg)", "var(--border)"] };
                      const [c, bg, bd] = colors[status] || colors.Pending;
                      return (
                        <div key={status} style={{ flex: 1, textAlign: "center", padding: "8px 6px", background: bg, border: `0.5px solid ${bd}`, borderRadius: 7 }}>
                          <div style={{ fontSize: 16, fontWeight: 500, color: c }}>{count}</div>
                          <div style={{ fontSize: 9, color: c }}>{status}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Bandwidth trend */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header"><span className="card-title">Bandwidth trend</span><span className="card-meta">Monthly average · 1=Overloaded · 5=Open</span></div>
              <div className="card-body">
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70 }}>
                  {monthlySums.map((s, i) => {
                    const bw = s?.avgBandwidth || 0;
                    const h = bw ? (bw / 5) * 100 : 0;
                    const c = bw >= 4 ? "var(--green)" : bw === 3 ? "var(--blue)" : bw === 2 ? "var(--amber)" : "var(--red)";
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                        {bw > 0 && <div style={{ height: `${h}%`, background: c, borderRadius: "2px 2px 0 0", opacity: 0.8, minHeight: 4 }} title={`${MONTHS_SHORT[i]}: ${BANDWIDTH[bw]?.label}`} />}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                  {MONTHS_SHORT.map(m => <div key={m} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--faint)" }}>{m}</div>)}
                </div>
                <div className="border-top mt-12">
                  <div className="field-label mb-8">Avg bandwidth per quarter</div>
                  <div className="flex gap-6">
                    {["Q1","Q2","Q3","Q4"].map((q, qi) => {
                      const qMonths = monthlySums.slice(qi*3, qi*3+3).filter(Boolean);
                      const avg = qMonths.length ? Math.round(qMonths.reduce((a,b) => a + (b.avgBandwidth||3), 0) / qMonths.length) : null;
                      const bwS = avg ? BW_STYLES[avg] : null;
                      const bwL = avg ? BANDWIDTH[avg]?.label : "—";
                      return (
                        <div key={q} style={{ flex: 1, textAlign: "center", padding: "8px 6px", background: bwS?.bg || "var(--bg)", border: `0.5px solid ${bwS?.bd || "var(--border)"}`, borderRadius: 7 }}>
                          <div style={{ fontSize: 9, color: "var(--faint)", marginBottom: 3 }}>{q}</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: bwS?.color || "var(--faint)" }}>{bwL}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Annual Narrative */}
          <div className="ai-box mb-12">
            <div className="ai-box-header">
              <div className="ai-box-title">
                <div className="ai-icon">AI</div>
                AI-generated annual summary
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
                  { label: "Overall performance", key: "overall" },
                  { label: "Key highlights",      key: "highlights" },
                  { label: "Areas of growth",     key: "growth" },
                  { label: "Recommendations",     key: "recommendations" },
                ].map(s => (
                  <div key={s.key}>
                    <div className="ai-section-label">{s.label}</div>
                    <div className="ai-section-text" style={{ whiteSpace: "pre-wrap" }}>{aiSummary[s.key]}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)", fontSize: 13 }}>
                Click "Generate summary" to create an AI-written annual review narrative for {selectedMember}
              </div>
            )}
          </div>

          {/* Month-by-month table */}
          <div className="card">
            <div className="card-header"><span className="card-title">Month-by-month breakdown</span><span className="card-meta">{selectedYear}</span></div>
            <table className="data-table">
              <thead><tr><th>Month</th><th>Submitted</th><th>Tasks done</th><th>Blockers</th><th>Top client</th><th>Avg bandwidth</th></tr></thead>
              <tbody>
                {monthlySums.map((s, i) => {
                  const bwS = s ? BW_STYLES[s.avgBandwidth] : null;
                  const bwL = s ? BANDWIDTH[s.avgBandwidth]?.label : "—";
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{MONTHS[i]} {selectedYear}</td>
                      <td className="text-muted">{s?.daysSubmitted || "—"}</td>
                      <td style={{ color: "var(--green)", fontWeight: 500 }}>{s?.tasksByStatus?.Done || "—"}</td>
                      <td style={{ color: s?.totalBlockers > 0 ? "var(--red)" : "var(--muted)" }}>{s?.totalBlockers ?? "—"}</td>
                      <td>{s?.topClient ? <ClientBadge client={s.topClient} /> : <span className="text-faint">—</span>}</td>
                      <td style={{ color: bwS?.color || "var(--faint)", fontWeight: bwS ? 500 : 400 }}>{bwL}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
