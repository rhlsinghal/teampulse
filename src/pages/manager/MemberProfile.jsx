import { useState, useEffect } from "react";
import { avatarColor, initials, BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY, MONTHS, MONTHS_SHORT, getDaysInMonth, getFirstDayOfMonth, isoDate } from "../../utils/dates";
import { Loading } from "../../components/index.jsx";
import { loadEntriesInRange } from "../../hooks/useHistory";
import { normaliseEntry } from "../../utils/aggregator";

// ── Constants ─────────────────────────────────────────────────────────────────
const OUTCOME_STYLE = {
  "Done":       { color: "var(--green)", bg: "var(--green-bg)", bd: "var(--green-bd)" },
  "Carry over": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Blocked":    { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "In Progress":{ color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
};
const PRIORITY_STYLE = {
  "High":   { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "Medium": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Low":    { color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
};

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function OutcomePill({ outcome }) {
  const s = OUTCOME_STYLE[outcome];
  if (!s) return <span style={{ fontSize: 11, color: "var(--faint)" }}>{outcome || "—"}</span>;
  return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 500,
    color: s.color, background: s.bg, border: `0.5px solid ${s.bd}` }}>{outcome}</span>;
}
function PriorityPill({ priority }) {
  const s = PRIORITY_STYLE[priority || "Medium"];
  return <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, fontWeight: 500,
    color: s.color, background: s.bg, border: `0.5px solid ${s.bd}` }}>{priority || "Medium"}</span>;
}
function ClientPill({ client }) {
  if (!client) return <span style={{ color: "var(--faint)", fontSize: 11 }}>—</span>;
  return <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
    background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>{client}</span>;
}

// ── Mini heatmap ──────────────────────────────────────────────────────────────
function MiniHeatmap({ year, month, entryDates, blockerDates, onNavigate }) {
  const days     = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells    = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => onNavigate(-1)} style={{ fontSize: 13, color: "var(--faint)", cursor: "pointer",
          padding: "2px 8px", border: "0.5px solid var(--border)", borderRadius: 5, background: "var(--bg)" }}>‹</button>
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => onNavigate(1)} style={{ fontSize: 13, color: "var(--faint)", cursor: "pointer",
          padding: "2px 8px", border: "0.5px solid var(--border)", borderRadius: 5, background: "var(--bg)" }}>›</button>
      </div>
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
          const bg     = isFuture ? "transparent" : hasEntry ? (isBlocker ? "var(--red-bg)" : "#5b5ff540") : "var(--bg)";
          const border = isFuture ? "none" : hasEntry ? (isBlocker ? "0.5px solid var(--red-bd)" : "none") : "0.5px solid var(--border)";
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

// ── Today's update section ────────────────────────────────────────────────────
function TodaySection({ entry }) {
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
  const valid     = displayTasks.filter(t => t.text?.trim());
  const done      = valid.filter(t => t.outcome === "Done").length;
  const pct       = eod?.submittedAt && valid.length ? Math.round(done / valid.length * 100) : null;
  const carryOvers = eodTasks.filter(t => t.outcome === "Carry over" && t.notes?.trim());
  const blockerDetails = eodTasks.filter(t => t.outcome === "Blocked" && t.blockerDetail?.trim());

  return (
    <div className="card mb-12">
      <div className="card-header">
        <span className="card-title">Today's update</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {sod?.submittedAt && (
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "var(--blue-bg)",
              color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>SOD {fmtTime(sod.submittedAt)}</span>
          )}
          {eod?.submittedAt ? (
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "var(--green-bg)",
              color: "var(--green)", border: "0.5px solid var(--green-bd)" }}>
              EOD {fmtTime(eod.submittedAt)}{pct != null ? ` · ${pct}%` : ""}
            </span>
          ) : sod?.submittedAt ? (
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "var(--amber-bg)",
              color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>EOD pending</span>
          ) : null}
        </div>
      </div>
      {valid.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th style={{ width: 85 }}>Client</th>
                <th style={{ width: 75 }}>Priority</th>
                <th>Task</th>
                <th style={{ width: 88 }}>Due</th>
                <th style={{ width: 88 }}>End date</th>
                {eod?.submittedAt && <th style={{ width: 95 }}>Outcome</th>}
              </tr>
            </thead>
            <tbody>
              {valid.map((t, i) => {
                const overdue = t.dueDate && t.dueDate < TODAY && t.outcome !== "Done";
                return (
                  <tr key={i} style={{ background: t.outcome === "Blocked" ? "var(--red-bg)" : t.adhoc ? "#fffbeb" : "transparent" }}>
                    <td><ClientPill client={t.client} /></td>
                    <td><PriorityPill priority={t.priority} /></td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>
                      {t.text}
                      {t.adhoc && <span style={{ fontSize: 9, marginLeft: 5, padding: "1px 4px", borderRadius: 8,
                        background: "#fffbeb", color: "#854F0B", border: "0.5px solid #FAC775" }}>ad-hoc</span>}
                    </td>
                    <td>
                      {t.dueDate ? (
                        <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                          color: overdue ? "var(--red)" : "var(--muted)",
                          background: overdue ? "var(--red-bg)" : "transparent",
                          padding: overdue ? "1px 4px" : 0, borderRadius: 3 }}>
                          {t.dueDate}{overdue ? " !" : ""}
                        </span>
                      ) : <span style={{ color: "var(--faint)", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                      color: t.endDate ? "var(--green)" : "var(--faint)" }}>{t.endDate || "—"}</td>
                    {eod?.submittedAt && <td><OutcomePill outcome={t.outcome} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(carryOvers.length > 0 || blockerDetails.length > 0) && (
        <div style={{ padding: "8px 14px 10px", borderTop: "0.5px solid var(--border)",
          display: "grid", gridTemplateColumns: carryOvers.length && blockerDetails.length ? "1fr 1fr" : "1fr", gap: 10 }}>
          {carryOvers.map((t, i) => (
            <div key={i} style={{ padding: "8px 10px", background: "var(--amber-bg)", borderRadius: 6, border: "0.5px solid var(--amber-bd)" }}>
              <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em",
                color: "var(--amber)", marginBottom: 3 }}>↪ {t.text} — carry over reason</div>
              <div style={{ fontSize: 11 }}>{t.notes}</div>
            </div>
          ))}
          {blockerDetails.map((t, i) => (
            <div key={i} style={{ padding: "8px 10px", background: "var(--red-bg)", borderRadius: 6, border: "0.5px solid var(--red-bd)" }}>
              <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em",
                color: "var(--red)", marginBottom: 3 }}>⚑ {t.text} — blocker</div>
              <div style={{ fontSize: 11, marginBottom: t.blockerOwner ? 3 : 0 }}>{t.blockerDetail}</div>
              {t.blockerOwner && <div style={{ fontSize: 10, color: "var(--muted)" }}>Owner: {t.blockerOwner}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stats card (month or YTD) ─────────────────────────────────────────────────
function StatsCard({ label, sublabel, entries, allTasks }) {
  const normed   = entries.map(normaliseEntry);
  const tasks    = normed.flatMap(e => e.tasks || []).filter(t => t.text?.trim());
  const done     = tasks.filter(t => t.status === "Done" || t.outcome === "Done").length;
  const blocked  = normed.filter(e => e.blockers?.trim()).length;
  const bwVals   = normed.map(e => e.bandwidth).filter(Boolean);
  const avgBw    = bwVals.length ? Math.round(bwVals.reduce((a,b) => a+b,0)/bwVals.length) : 3;
  const bwS      = BW_STYLES[avgBw] || BW_STYLES[3];
  const total    = tasks.length;
  const pct      = total ? Math.round(done / total * 100) : 0;

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <span className="card-title">{label}</span>
        <span className="card-meta">{sublabel}</span>
      </div>
      <div className="card-body">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
          <div style={{ background: "var(--bg)", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: "var(--accent)", lineHeight: 1, marginBottom: 2 }}>{entries.length}</div>
            <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Days in</div>
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: "var(--green)", lineHeight: 1, marginBottom: 2 }}>{done}</div>
            <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Done</div>
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: "var(--red)", lineHeight: 1, marginBottom: 2 }}>{blocked}</div>
            <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Blockers</div>
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: bwS.color, lineHeight: 1, marginBottom: 2, paddingTop: 3 }}>
              {BANDWIDTH[avgBw]?.label || "—"}
            </div>
            <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Avg bw</div>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>Completion rate</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--accent)" : "var(--amber)" }}>{pct}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3,
              background: pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--accent)" : "var(--amber)",
              width: `${pct}%`, transition: "width 0.3s" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Filterable task history table ─────────────────────────────────────────────
function TaskHistory({ entries }) {
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [clientFilter,  setClientFilter]  = useState("all");

  const normed   = entries.map(normaliseEntry);
  const allTasks = normed.flatMap(e =>
    (e.tasks || []).filter(t => t.text?.trim()).map(t => ({ ...t, date: e.date }))
  );

  const clients = [...new Set(allTasks.map(t => t.client).filter(Boolean))].sort();
  const outcomes = ["Done", "Carry over", "Blocked", "In Progress"];

  const filtered = allTasks.filter(t => {
    const matchOutcome = outcomeFilter === "all" || (t.status || t.outcome) === outcomeFilter;
    const matchClient  = clientFilter  === "all" || t.client === clientFilter;
    return matchOutcome && matchClient;
  });

  const FilterPill = ({ value, active, onClick, children }) => (
    <button onClick={onClick} style={{
      fontSize: 10, padding: "2px 9px", borderRadius: 20, fontWeight: 500, cursor: "pointer",
      fontFamily: "inherit", border: "0.5px solid",
      background: active ? "var(--accent)" : "var(--surface)",
      color: active ? "#fff" : "var(--muted)",
      borderColor: active ? "var(--accent)" : "var(--border)",
    }}>{children}</button>
  );

  return (
    <div className="card mt-12">
      <div className="card-header" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="card-title">Task history</span>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <FilterPill active={outcomeFilter === "all"} onClick={() => setOutcomeFilter("all")}>All</FilterPill>
          {outcomes.map(o => (
            <FilterPill key={o} active={outcomeFilter === o} onClick={() => setOutcomeFilter(o)}>{o}</FilterPill>
          ))}
          <div style={{ width: "0.5px", background: "var(--border)", margin: "0 2px" }} />
          <FilterPill active={clientFilter === "all"} onClick={() => setClientFilter("all")}>All clients</FilterPill>
          {clients.map(c => (
            <FilterPill key={c} active={clientFilter === c} onClick={() => setClientFilter(c)}>{c}</FilterPill>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>No tasks match this filter.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 88 }}>Date</th>
              <th style={{ width: 85 }}>Client</th>
              <th style={{ width: 75 }}>Priority</th>
              <th>Task</th>
              <th style={{ width: 88 }}>Due</th>
              <th style={{ width: 88 }}>End date</th>
              <th style={{ width: 95 }}>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((t, i) => {
              const overdue = t.dueDate && t.dueDate < TODAY && (t.status || t.outcome) !== "Done";
              return (
                <tr key={i}>
                  <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted)" }}>{fmt(t.date)}</td>
                  <td><ClientPill client={t.client} /></td>
                  <td><PriorityPill priority={t.priority} /></td>
                  <td style={{ fontSize: 12 }}>{t.text}</td>
                  <td>
                    {t.dueDate ? (
                      <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                        color: overdue ? "var(--red)" : "var(--muted)" }}>
                        {t.dueDate}{overdue ? " !" : ""}
                      </span>
                    ) : <span style={{ color: "var(--faint)", fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                    color: t.endDate ? "var(--green)" : "var(--faint)" }}>{t.endDate || "—"}</td>
                  <td><OutcomePill outcome={t.status || t.outcome} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {filtered.length > 50 && (
        <div style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, color: "var(--faint)",
          borderTop: "0.5px solid var(--border)" }}>
          Showing 50 of {filtered.length} tasks
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MemberProfile({ memberName, memberRecord, onBack }) {
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [calYear,    setCalYear]    = useState(new Date().getFullYear());
  const [calMonth,   setCalMonth]   = useState(new Date().getMonth());
  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth();
  const monthKey     = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  useEffect(() => {
    loadEntriesInRange(memberName, `${currentYear}-01-01`, TODAY).then(res => {
      setEntries(res); setLoading(false);
    });
  }, [memberName]);

  if (loading) return <div className="main-content"><Loading /></div>;

  const color      = avatarColor(memberName);
  const todayEntry = entries.find(e => e.date === TODAY) || null;

  // Shared normalised tasks for stats
  const normed    = entries.map(normaliseEntry);
  const allTasks  = normed.flatMap(e => e.tasks || []).filter(t => t.text?.trim());
  const monthEntries = entries.filter(e => e.date?.startsWith(monthKey));

  // Header stats
  const entryDates   = entries.map(e => e.date);
  const blockerDates = normed.filter(e => e.blockers?.trim()).map(e => e.date);
  const clientCounts = {};
  allTasks.forEach(t => { const c = t.client || "Internal"; clientCounts[c] = (clientCounts[c] || 0) + 1; });
  const topClient = Object.entries(clientCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "—";
  const totalTasks = allTasks.length;

  // Streak
  let streak = 0;
  const d = new Date();
  const sorted = [...entryDates].sort((a,b)=>b.localeCompare(a));
  for (const date of sorted) {
    const exp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (date === exp) { streak++; d.setDate(d.getDate()-1); } else break;
  }

  // Today's live stats for header
  const todaySod = todayEntry?.sod;
  const todayEod = todayEntry?.eod;
  const todayBw  = todaySod?.bandwidth || todayEntry?.bandwidth;
  const todayBwS = BW_STYLES[todayBw] || BW_STYLES[3];
  const todayBwL = BANDWIDTH[todayBw]?.label;
  const todayTasks   = todayEod?.submittedAt ? todayEod.tasks || [] : todaySod?.tasks || [];
  const todayValid   = todayTasks.filter(t => t.text?.trim());
  const todayDone    = todayValid.filter(t => t.outcome === "Done").length;
  const todayBlocked = todayValid.filter(t => t.outcome === "Blocked").length;
  const todayPct     = todayEod?.submittedAt && todayValid.length ? Math.round(todayDone / todayValid.length * 100) : null;

  const navigateCal = (dir) => {
    let m = calMonth + dir, y = calYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setCalMonth(m); setCalYear(y);
  };

  return (
    <div className="main-content">
      <button className="btn btn-ghost btn-sm mb-16" onClick={onBack}>← Back to overview</button>

      {/* ── Improvement 1: Rich header ── */}
      <div className="card mb-12">
        <div className="card-body" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: color + "22", color,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 500, flexShrink: 0 }}>
              {initials(memberName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 17, fontWeight: 600 }}>{memberName}</span>
                <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                  background: "var(--green-bg)", color: "var(--green)", border: "0.5px solid var(--green-bd)" }}>Active</span>
                {streak > 0 && (
                  <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                    background: "var(--amber-bg)", color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>
                    🔥 {streak} day streak
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                {memberRecord?.email || ""}
                {topClient !== "—" && <> · Primary: {topClient}</>}
              </div>
              {/* Today's live status row */}
              {todayEntry && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  {todaySod?.submittedAt && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--bg)",
                      padding: "4px 9px", borderRadius: 7, border: "0.5px solid var(--border)" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)" }} />
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>SOD {fmtTime(todaySod.submittedAt)}</span>
                    </div>
                  )}
                  {todayEod?.submittedAt ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--bg)",
                      padding: "4px 9px", borderRadius: 7, border: "0.5px solid var(--border)" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>EOD {fmtTime(todayEod.submittedAt)}</span>
                    </div>
                  ) : todaySod?.submittedAt && (
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                      background: "var(--amber-bg)", color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>
                      EOD pending
                    </span>
                  )}
                  {todayBwL && (
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                      color: todayBwS.color, background: todayBwS.bg, border: `0.5px solid ${todayBwS.bd}` }}>
                      {todayBwL}
                    </span>
                  )}
                  {todayBlocked > 0 && (
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                      background: "var(--red-bg)", color: "var(--red)", border: "0.5px solid var(--red-bd)" }}>
                      ⚑ {todayBlocked} blocker{todayBlocked > 1 ? "s" : ""}
                    </span>
                  )}
                  {todayPct != null && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                      <span style={{ fontSize: 12, fontWeight: 500,
                        color: todayPct === 100 ? "var(--green)" : "var(--accent)" }}>{todayPct}%</span>
                      <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${todayPct}%`, borderRadius: 2,
                          background: todayPct === 100 ? "var(--green)" : "var(--accent)" }} />
                      </div>
                      <span style={{ fontSize: 10, color: "var(--faint)" }}>today</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }}
              onClick={() => alert("Navigate to report")}>Generate report</button>
          </div>
        </div>
      </div>

      {/* ── Improvement 2: Stats split this month vs YTD ── */}
      <div className="form-grid-2 mb-12">
        <StatsCard label="This month" sublabel={`${MONTHS[currentMonth]} ${currentYear}`} entries={monthEntries} allTasks={allTasks} />
        <StatsCard label="Year to date" sublabel={`Jan – ${MONTHS_SHORT[currentMonth]} ${currentYear}`} entries={entries} allTasks={allTasks} />
      </div>

      {/* ── Improvement 3: Today's update ── */}
      {todayEntry && <TodaySection entry={todayEntry} />}

      {/* Heatmap + client distribution */}
      <div className="form-grid-2 mb-12">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header"><span className="card-title">Activity</span></div>
          <div className="card-body">
            <MiniHeatmap year={calYear} month={calMonth}
              entryDates={entryDates} blockerDates={blockerDates} onNavigate={navigateCal} />
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header"><span className="card-title">Work distribution</span><span className="card-meta">This year</span></div>
          <div className="card-body">
            {Object.entries(clientCounts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c, n]) => (
              <div key={c} style={{ marginBottom: 10 }}>
                <div className="flex justify-between mb-4">
                  <span className="text-sm font-medium">{c}</span>
                  <span className="text-xs text-muted">{n} tasks · {totalTasks ? Math.round(n/totalTasks*100) : 0}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${totalTasks ? n/totalTasks*100 : 0}%`,
                    background: c.toLowerCase() === "internal" ? "var(--faint)" : "var(--accent)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Improvement 4: Filterable task history ── */}
      <TaskHistory entries={entries} />
    </div>
  );
}
