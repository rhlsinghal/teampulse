import { useState } from "react";
import { Calendar, BwBadge, StatusBadge, ClientBadge, Loading, EmptyState } from "../../components/index.jsx";
import { useHistory } from "../../hooks/useHistory";
import { fmt, TODAY, MONTHS } from "../../utils/dates";
import { BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { normaliseEntry } from "../../utils/aggregator";

// ── Monthly summary builder ───────────────────────────────────────────────────
function buildSummary(entries, year, month) {
  const monthKey     = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthEntries = entries.filter(e => e.date?.startsWith(monthKey)).map(normaliseEntry);
  const tasksByClient = {};
  const tasksByStatus = { "Done": 0, "In Progress": 0, "Blocked": 0, "Pending": 0 };
  let totalTasks = 0, totalBlockers = 0;
  const bwValues = [];
  monthEntries.forEach(e => {
    if (e.blockers?.trim()) totalBlockers++;
    if (e.bandwidth) bwValues.push(e.bandwidth);
    (e.tasks || []).forEach(t => {
      if (!t.text?.trim()) return;
      totalTasks++;
      const client = t.client || "Internal";
      tasksByClient[client] = (tasksByClient[client] || 0) + 1;
      if (tasksByStatus[t.status] !== undefined) tasksByStatus[t.status]++;
    });
  });
  const avgBw = bwValues.length ? Math.round(bwValues.reduce((a, b) => a + b, 0) / bwValues.length) : 3;
  return { monthKey, daysSubmitted: monthEntries.length, totalTasks, totalBlockers, tasksByClient, tasksByStatus, avgBw, entries: monthEntries };
}

export default function MyHistory({ memberName }) {
  const { entries, loading } = useHistory(memberName);
  const now = new Date();
  const [tab,      setTab]      = useState("calendar");
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(TODAY);
  const [sumYear,  setSumYear]  = useState(now.getFullYear());
  const [sumMonth, setSumMonth] = useState(now.getMonth());

  const entryDates  = entries.map(e => e.date);
  const blockerDates = entries.filter(e => {
    if (e.sod?.tasks) return e.sod.tasks.some(t => t.blocker && t.blocker !== "N/A");
    return !!e.blockers?.trim();
  }).map(e => e.date);

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
      {/* Header + tab switcher */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>My history</div>
          <div className="text-sm text-muted">Your personal performance log</div>
        </div>
        <div style={{ display: "flex", gap: 0, borderRadius: 8, border: "0.5px solid var(--border)", overflow: "hidden" }}>
          {[{ key: "calendar", label: "Calendar view" }, { key: "monthly", label: "Monthly summary" }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: "7px 16px", fontSize: 12, fontWeight: tab === t.key ? 500 : 400,
                background: tab === t.key ? "var(--accent)" : "var(--surface)",
                color: tab === t.key ? "#fff" : "var(--muted)",
                border: "none", cursor: "pointer", fontFamily: "inherit",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Calendar view ── */}
      {tab === "calendar" && (
        <div className="flex gap-16 items-start">
          <Calendar
            year={calYear} month={calMonth}
            onNavigate={navigateCal}
            entryDates={entryDates}
            blockerDates={blockerDates}
            selectedDate={selected}
            onSelect={setSelected}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedEntry ? (
              <EntryDetail entry={selectedEntry} />
            ) : (
              <EmptyState icon="📅" message={`No update found for ${fmt(selected)}.\nSelect a highlighted date on the calendar.`} />
            )}
            {entries.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10, color: "var(--muted)" }}>
                  All entries — {entries.length} total
                </div>
                {entries.filter(e => e.date !== selected).slice(0, 5).map((e, i) => {
                  const bw  = e.sod?.bandwidth || e.bandwidth;
                  const bwS = BW_STYLES[bw] || BW_STYLES[3];
                  const bwL = BANDWIDTH[bw]?.label || "—";
                  return (
                    <div key={i} className="card" style={{ cursor: "pointer", marginBottom: 8 }}
                      onClick={() => { setSelected(e.date); setCalYear(+e.date.slice(0,4)); setCalMonth(+e.date.slice(5,7)-1); }}>
                      <div className="card-header">
                        <span className="text-xs" style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--muted)" }}>{fmt(e.date)}</span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span className="badge" style={{ color: bwS.color, background: bwS.bg, borderColor: bwS.bd }}>{bwL}</span>
                          {e.sod?.submittedAt && <span className="badge badge-blue" style={{ fontSize: 10 }}>SOD</span>}
                          {e.eod?.submittedAt && <span className="badge badge-green" style={{ fontSize: 10 }}>EOD</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {entries.length > 6 && (
                  <div className="text-xs text-faint" style={{ textAlign: "center", padding: "8px 0" }}>
                    + {entries.length - 6} more entries — use calendar to navigate
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Monthly summary ── */}
      {tab === "monthly" && (
        <MonthlySummaryView
          summary={summary}
          sumYear={sumYear} sumMonth={sumMonth}
          setSumYear={setSumYear} setSumMonth={setSumMonth}
          now={now}
        />
      )}
    </div>
  );
}

// ── Monthly summary view ─────────────────────────────────────────────────────
function MonthlySummaryView({ summary, sumYear, sumMonth, setSumYear, setSumMonth, now }) {
  const { daysSubmitted, totalTasks, totalBlockers, tasksByClient, tasksByStatus, avgBw, entries } = summary;
  const sortedClients  = Object.entries(tasksByClient).sort((a, b) => b[1] - a[1]);
  const bwS            = BW_STYLES[avgBw] || BW_STYLES[3];
  const bwL            = BANDWIDTH[avgBw]?.label || "—";
  const completionPct  = totalTasks ? Math.round(((tasksByStatus["Done"] || 0) / totalTasks) * 100) : 0;

  return (
    <div>
      {/* Month / year selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <select className="field-input" style={{ width: "auto" }} value={sumMonth}
          onChange={e => setSumMonth(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select className="field-input" style={{ width: "auto" }} value={sumYear}
          onChange={e => setSumYear(+e.target.value)}>
          {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{daysSubmitted} days submitted</span>
      </div>

      {daysSubmitted === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div className="text-sm">No updates found for {MONTHS[sumMonth]} {sumYear}</div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="stats-grid stats-grid-4 mb-12">
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{daysSubmitted}</div><div className="stat-label">Days submitted</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{tasksByStatus["Done"] || 0}</div><div className="stat-label">Tasks done</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{totalBlockers}</div><div className="stat-label">Blockers raised</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: bwS.color, fontSize: 16, paddingTop: 2 }}>{bwL}</div><div className="stat-label">Avg bandwidth</div></div>
          </div>

          {/* Completion bar */}
          <div className="card mb-12">
            <div className="card-body">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Overall completion rate</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: completionPct === 100 ? "var(--green)" : "var(--accent)" }}>
                  {tasksByStatus["Done"] || 0} / {totalTasks} tasks ({completionPct}%)
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${completionPct}%`, background: completionPct === 100 ? "var(--green)" : "var(--accent)", transition: "width 0.3s" }} />
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="form-grid-2 mb-12">
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header"><span className="card-title">Tasks by client</span></div>
              <div className="card-body">
                {sortedClients.length ? sortedClients.map(([client, count]) => (
                  <div key={client} style={{ marginBottom: 10 }}>
                    <div className="flex justify-between mb-4">
                      <span className="text-sm font-medium">{client}</span>
                      <span className="text-xs text-muted">{count} tasks · {Math.round((count / totalTasks) * 100)}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${(count / totalTasks) * 100}%`, background: client.toLowerCase() === "internal" ? "var(--faint)" : "var(--accent)" }} />
                    </div>
                  </div>
                )) : <div className="text-sm text-muted">No tasks recorded</div>}
              </div>
            </div>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header"><span className="card-title">Tasks by status</span></div>
              <div className="card-body">
                {Object.entries(tasksByStatus).filter(([, v]) => v > 0).map(([status, count]) => (
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

          {/* Task breakdown table */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Task breakdown</span>
              <span className="card-meta">{daysSubmitted} days · {totalTasks} tasks</span>
            </div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Client</th><th>Task</th><th>Status</th></tr></thead>
              <tbody>
                {entries.flatMap((e, ei) =>
                  (e.tasks || []).filter(t => t.text?.trim()).map((t, ti) => (
                    <tr key={`${ei}-${ti}`}>
                      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted)" }}>{fmt(e.date)}</td>
                      <td>{t.client ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{t.client}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                      <td className="text-sm">{t.text}</td>
                      <td>
                        {(() => {
                          const key = t.status || t.outcome;
                          const styles = { "Done": { bg: "var(--green-bg)", color: "var(--green)", bd: "var(--green-bd)" }, "Blocked": { bg: "var(--red-bg)", color: "var(--red)", bd: "var(--red-bd)" }, "Carry over": { bg: "var(--amber-bg)", color: "var(--amber)", bd: "var(--amber-bd)" }, "In Progress": { bg: "var(--blue-bg)", color: "var(--blue)", bd: "var(--blue-bd)" } };
                          const s = styles[key];
                          return s
                            ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500, background: s.bg, color: s.color, border: `0.5px solid ${s.bd}` }}>{key}</span>
                            : <span style={{ fontSize: 11, color: "var(--faint)" }}>{key || "—"}</span>;
                        })()}
                      </td>
                    </tr>
                  ))
                )}
                {entries.filter(e => e.blockers?.trim()).map((e, i) => (
                  <tr key={`bl-${i}`} style={{ background: "var(--red-bg)" }}>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted)" }}>{fmt(e.date)}</td>
                    <td colSpan={2} style={{ fontSize: 12, color: "var(--red)" }}>⚑ {e.blockers}</td>
                    <td><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "var(--red-bg)", color: "var(--red)", border: "0.5px solid var(--red-bd)" }}>Blocker</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const OUTCOME_STYLE = {
  "Done":       { color: "var(--green)", bg: "var(--green-bg)", bd: "var(--green-bd)" },
  "Carry over": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Blocked":    { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
};

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function EntryDetail({ entry }) {
  if (entry.sod) return <NewEntryDetail entry={entry} />;
  return <LegacyEntryDetail entry={entry} />;
}

function NewEntryDetail({ entry }) {
  const { sod, eod } = entry;
  const bw  = sod?.bandwidth || 3;
  const bwS = BW_STYLES[bw] || BW_STYLES[3];
  const bwL = BANDWIDTH[bw]?.label || "—";
  const pct = eod?.tasks?.length
    ? Math.round(eod.tasks.filter(t => t.outcome === "Done").length / eod.tasks.length * 100)
    : null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "var(--muted)" }}>{fmt(entry.date)}</span>
        {entry.date === TODAY && <span className="badge badge-blue">Today</span>}
        <span className="badge" style={{ color: bwS.color, background: bwS.bg, borderColor: bwS.bd }}>{bwL}</span>
        {pct != null && <span className="badge badge-green">{pct}% complete</span>}
      </div>
      {/* SOD */}
      <div className="card mb-12">
        <div className="card-header">
          <span className="card-title">Start of day</span>
          {sod?.submittedAt && <span className="badge badge-green" style={{ fontSize: 10 }}>{fmtTime(sod.submittedAt)}</span>}
        </div>
        <div className="card-body">
          {sod?.tasks?.length > 0 ? (
            <table className="task-table">
              <thead><tr><th style={{ width: "20%" }}>Client</th><th style={{ width: "44%" }}>Task</th><th style={{ width: "36%" }}>Blockers / notes</th></tr></thead>
              <tbody>
                {sod.tasks.map((t, i) => (
                  <tr key={i}>
                    <td>{t.client ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{t.client}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                    <td style={{ fontSize: 12 }}>{t.text}</td>
                    <td>{t.blocker && t.blocker !== "N/A"
                      ? <span style={{ fontSize: 11, color: "var(--red)", background: "var(--red-bg)", padding: "2px 8px", borderRadius: 4 }}>{t.blocker}</span>
                      : <span style={{ fontSize: 11, color: "var(--faint)", fontStyle: "italic" }}>N/A</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div style={{ color: "var(--faint)", fontSize: 12 }}>No tasks recorded.</div>}
        </div>
      </div>
      {/* EOD */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">End of day</span>
          {eod?.submittedAt
            ? <span className="badge badge-green" style={{ fontSize: 10 }}>{fmtTime(eod.submittedAt)}</span>
            : <span className="badge badge-amber" style={{ fontSize: 10 }}>Not submitted</span>}
        </div>
        <div className="card-body">
          {eod?.tasks?.length > 0 ? (
            <>
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8, padding: "5px 10px", background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
                  <div className="field-label" style={{ margin: 0 }}>Task</div>
                  <div className="field-label" style={{ margin: 0 }}>Outcome</div>
                </div>
                {eod.tasks.map((t, i) => {
                  const s = OUTCOME_STYLE[t.outcome] || OUTCOME_STYLE["Done"];
                  return (
                    <div key={i}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8, alignItems: "center", padding: "7px 10px", borderBottom: "0.5px solid var(--border)" }}>
                        <div>
                          {t.client && <span className="badge badge-blue" style={{ fontSize: 10, marginRight: 5 }}>{t.client}</span>}
                          <span style={{ fontSize: 12 }}>{t.text || "—"}</span>
                          {!t.fromSOD && <span className="badge badge-amber" style={{ fontSize: 9, marginLeft: 5 }}>added in EOD</span>}
                        </div>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500, background: s.bg, color: s.color, border: `0.5px solid ${s.bd}`, display: "inline-block" }}>{t.outcome}</span>
                      </div>
                      {t.notes && <div style={{ padding: "5px 10px 7px", background: "var(--surface)", borderBottom: "0.5px solid var(--border)", fontSize: 11, color: "var(--muted)" }}>Note: {t.notes}</div>}
                    </div>
                  );
                })}
              </div>
              {pct != null && (
                <div style={{ padding: "8px 10px", background: "var(--surface)", borderRadius: 8, border: "0.5px solid var(--border)", marginBottom: 12 }}>
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
          ) : <div style={{ color: "var(--faint)", fontSize: 12 }}>EOD not submitted.</div>}
          {(eod?.notCompleted || eod?.tomorrowFocus) && (
            <div className="form-grid-2" style={{ marginTop: 8 }}>
              {eod.notCompleted && <div><div className="field-label mb-4">What wasn't completed</div><div className="text-sm" style={{ lineHeight: 1.6 }}>{eod.notCompleted}</div></div>}
              {eod.tomorrowFocus && <div><div className="field-label mb-4">Tomorrow's focus</div><div className="text-sm" style={{ lineHeight: 1.6 }}>{eod.tomorrowFocus}</div></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegacyEntryDetail({ entry }) {
  const bwS = BW_STYLES[entry.bandwidth] || BW_STYLES[3];
  const bwL = BANDWIDTH[entry.bandwidth]?.label || "—";
  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--muted)" }}>{fmt(entry.date)}</span>
        <div className="flex gap-6 items-center">
          <span className="badge" style={{ color: bwS.color, background: bwS.bg, borderColor: bwS.bd }}>{bwL}</span>
          {entry.date === TODAY && <span className="badge badge-blue">Today</span>}
        </div>
      </div>
      <div className="card-body">
        <div className="form-grid-2 mb-12">
          <div><div className="field-label mb-4">Yesterday</div><div className="text-sm" style={{ lineHeight: 1.6, color: "var(--text)" }}>{entry.yesterday || "—"}</div></div>
          <div><div className="field-label mb-4">Today</div><div className="text-sm" style={{ lineHeight: 1.6, color: "var(--text)" }}>{entry.today || "—"}</div></div>
        </div>
        {entry.blockers && <div className="mb-12"><div className="field-label mb-4">⚑ Blockers</div><div className="text-sm" style={{ color: "var(--red)", lineHeight: 1.6 }}>{entry.blockers}</div></div>}
        {entry.tasks?.length > 0 && (
          <div>
            <div className="field-label mb-8">Tasks</div>
            <table className="task-table">
              <thead><tr><th>Client</th><th>Task</th><th>Status</th></tr></thead>
              <tbody>{entry.tasks.map((t, i) => (<tr key={i}><td><ClientBadge client={t.client} /></td><td className="text-sm">{t.text}</td><td><StatusBadge status={t.status} /></td></tr>))}</tbody>
            </table>
          </div>
        )}
        {entry.note && <div className="mt-12"><div className="field-label mb-4">Note for manager</div><div className="text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>{entry.note}</div></div>}
      </div>
    </div>
  );
}
