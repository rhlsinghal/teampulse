import { useState, useEffect } from "react";
import { avatarColor, initials, BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY, MONTHS_SHORT, getDaysInMonth, getFirstDayOfMonth, isoDate } from "../../utils/dates";
import { ClientBadge, StatusBadge, BwBadge, Loading } from "../../components/index.jsx";
import { loadEntriesInRange } from "../../hooks/useHistory";

export default function MemberProfile({ memberName, memberRecord, onBack }) {
  const [entries,      setEntries]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calYear,      setCalYear]      = useState(new Date().getFullYear());
  const [calMonth,     setCalMonth]     = useState(new Date().getMonth());
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  useEffect(() => {
    const start = `${currentYear}-01-01`;
    const end   = TODAY;
    loadEntriesInRange(memberName, start, end).then(res => {
      setEntries(res);
      setLoading(false);
      if (res.find(e => e.date === TODAY)) setSelectedDate(TODAY);
    });
  }, [memberName]);

  if (loading) return <div className="main-content"><Loading /></div>;

  const color      = avatarColor(memberName);
  const entryDates = entries.map(e => e.date);

  // Blocker dates — check both new schema (sod.tasks) and legacy
  const blockerDates = entries.filter(e => {
    if (e.sod?.tasks) return e.sod.tasks.some(t => t.blocker && t.blocker !== "N/A");
    return !!e.blockers?.trim();
  }).map(e => e.date);

  // Stats — read from new or legacy schema
  const totalTasks = entries.reduce((acc, e) => {
    const tasks = e.sod?.tasks || e.tasks || [];
    return acc + tasks.filter(t => t.text?.trim()).length;
  }, 0);
  const doneTasks = entries.reduce((acc, e) => {
    if (e.eod?.tasks) return acc + e.eod.tasks.filter(t => t.outcome === "Done").length;
    return acc + (e.tasks || []).filter(t => t.status === "Done").length;
  }, 0);
  const blockers = blockerDates.length;
  const clients  = [...new Set(entries.flatMap(e => {
    const tasks = e.sod?.tasks || e.tasks || [];
    return tasks.map(t => t.client).filter(Boolean);
  }))];
  const bwValues = entries.map(e => e.sod?.bandwidth || e.bandwidth).filter(Boolean);
  const avgBw    = bwValues.length ? Math.round(bwValues.reduce((a, b) => a + b, 0) / bwValues.length) : 3;

  // Client breakdown
  const clientCounts = {};
  entries.forEach(e => {
    const tasks = e.sod?.tasks || e.tasks || [];
    tasks.forEach(t => {
      if (t.text?.trim()) clientCounts[t.client || "Internal"] = (clientCounts[t.client || "Internal"] || 0) + 1;
    });
  });
  const sortedClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]);
  const topClient = sortedClients[0]?.[0] || "—";

  const navigateCal = (dir) => {
    let m = calMonth + dir, y = calYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setCalMonth(m); setCalYear(y);
  };
  const selectedEntry = selectedDate ? entries.find(e => e.date === selectedDate) : null;

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
        {/* Clickable calendar */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title">Activity calendar</span>
            <span className="card-meta">{MONTHS_SHORT[calMonth]} {calYear}</span>
          </div>
          <div className="card-body">
            <ClickableHeatmap
              year={calYear} month={calMonth}
              entryDates={entryDates}
              blockerDates={blockerDates}
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
              onNavigate={navigateCal}
            />
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

      {/* Selected day detail */}
      {selectedDate && (
        <div className="card mt-12">
          <div className="card-header">
            <span className="card-title">
              {fmt(selectedDate)}
              {selectedDate === TODAY && <span className="badge badge-blue" style={{ marginLeft: 8, fontSize: 10 }}>Today</span>}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(null)}>✕ Close</button>
          </div>
          <div className="card-body">
            {selectedEntry ? <DayDetail entry={selectedEntry} /> : (
              <div style={{ color: "var(--faint)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No update submitted on this day.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const OUTCOME_STYLE_P = {
  "Done":       { color: "var(--green)", bg: "var(--green-bg)", bd: "var(--green-bd)" },
  "Carry over": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Blocked":    { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
};

function fmtTimeP(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function ClickableHeatmap({ year, month, entryDates, blockerDates, selectedDate, onSelect, onNavigate }) {
  const days     = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells    = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate(-1)} style={{ padding: "2px 8px" }}>‹</button>
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate(1)} style={{ padding: "2px 8px" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 6 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, color: "var(--faint)" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso       = isoDate(year, month, d);
          const hasEntry  = entryDates.includes(iso);
          const isBlocker = blockerDates.includes(iso);
          const isFuture  = iso > TODAY;
          const isSel     = iso === selectedDate;
          let bg     = isFuture ? "transparent" : hasEntry ? (isBlocker ? "var(--red-bg)" : "#5b5ff550") : "var(--bg)";
          let border = isFuture ? "0.5px solid transparent" : hasEntry ? (isBlocker ? "1px solid var(--red-bd)" : "1px solid #5b5ff530") : "0.5px solid var(--border)";
          if (isSel) { bg = "var(--accent)"; border = "1px solid var(--accent)"; }
          return (
            <div key={i} onClick={() => hasEntry && !isFuture && onSelect(iso)}
              style={{ aspectRatio: "1", borderRadius: 4, background: bg, border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: isSel ? "#fff" : "var(--faint)", cursor: hasEntry && !isFuture ? "pointer" : "default", fontWeight: isSel ? 600 : 400 }}>
              {d}
            </div>
          );
        })}
      </div>
      <div className="flex gap-10 mt-8" style={{ flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "#5b5ff550" }} />Submitted</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--red-bg)", border: "0.5px solid var(--red-bd)" }} />Blocker</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent)" }} />Selected</div>
      </div>
    </div>
  );
}

function DayDetail({ entry }) {
  const isNew = !!entry.sod;
  if (!isNew) {
    const bwS = BW_STYLES[entry.bandwidth] || BW_STYLES[3];
    return (
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <span className="badge" style={{ color: bwS.color, background: bwS.bg, borderColor: bwS.bd }}>{BANDWIDTH[entry.bandwidth]?.label || "—"}</span>
        </div>
        <div className="form-grid-2 mb-12">
          <div><div className="field-label mb-4">Yesterday</div><div className="text-sm" style={{ lineHeight: 1.6 }}>{entry.yesterday || "—"}</div></div>
          <div><div className="field-label mb-4">Today</div><div className="text-sm" style={{ lineHeight: 1.6 }}>{entry.today || "—"}</div></div>
        </div>
        {entry.tasks?.length > 0 && (
          <table className="task-table">
            <thead><tr><th>Client</th><th>Task</th><th>Status</th></tr></thead>
            <tbody>{entry.tasks.map((t,i) => <tr key={i}><td><span className="badge badge-blue" style={{fontSize:11}}>{t.client||"—"}</span></td><td className="text-sm">{t.text}</td><td style={{fontSize:11}}>{t.status}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    );
  }
  const { sod, eod } = entry;
  const bw  = sod?.bandwidth || 3;
  const bwS = BW_STYLES[bw] || BW_STYLES[3];
  const pct = eod?.tasks?.length ? Math.round(eod.tasks.filter(t=>t.outcome==="Done").length/eod.tasks.length*100) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--faint)" }}>Start of day</div>
          {sod?.submittedAt && <span className="badge badge-blue" style={{ fontSize: 10 }}>{fmtTimeP(sod.submittedAt)}</span>}
          <span className="badge" style={{ color: bwS.color, background: bwS.bg, borderColor: bwS.bd, fontSize: 10 }}>{BANDWIDTH[bw]?.label}</span>
        </div>
        {sod?.tasks?.length > 0 ? (
          <table className="task-table">
            <thead><tr><th style={{width:"20%"}}>Client</th><th style={{width:"44%"}}>Task</th><th style={{width:"36%"}}>Blockers / notes</th></tr></thead>
            <tbody>
              {sod.tasks.map((t,i) => (
                <tr key={i}>
                  <td>{t.client?<span className="badge badge-blue" style={{fontSize:11}}>{t.client}</span>:<span style={{color:"var(--faint)"}}>—</span>}</td>
                  <td style={{fontSize:12}}>{t.text}</td>
                  <td>{t.blocker&&t.blocker!=="N/A"?<span style={{fontSize:11,color:"var(--red)",background:"var(--red-bg)",padding:"2px 7px",borderRadius:4}}>{t.blocker}</span>:<span style={{fontSize:11,color:"var(--faint)",fontStyle:"italic"}}>N/A</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div style={{ color:"var(--faint)",fontSize:12 }}>No tasks.</div>}
      </div>
      <div style={{ height:"0.5px",background:"var(--border)" }} />
      <div>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
          <div style={{ fontSize:11,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--faint)" }}>End of day</div>
          {eod?.submittedAt?<span className="badge badge-green" style={{fontSize:10}}>{fmtTimeP(eod.submittedAt)}</span>:<span className="badge badge-amber" style={{fontSize:10}}>Not submitted</span>}
          {pct!=null&&<span className="badge badge-green" style={{fontSize:10}}>{pct}% complete</span>}
        </div>
        {eod?.tasks?.length > 0 ? (
          <div style={{ border:"0.5px solid var(--border)",borderRadius:8,overflow:"hidden" }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 100px",gap:8,padding:"5px 10px",background:"var(--surface)",borderBottom:"0.5px solid var(--border)" }}>
              <div className="field-label" style={{margin:0}}>Task</div>
              <div className="field-label" style={{margin:0}}>Outcome</div>
            </div>
            {eod.tasks.map((t,i) => {
              const s = OUTCOME_STYLE_P[t.outcome]||OUTCOME_STYLE_P["Done"];
              return (
                <div key={i}>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 100px",gap:8,alignItems:"center",padding:"7px 10px",borderBottom:"0.5px solid var(--border)" }}>
                    <div>
                      {t.client&&<span className="badge badge-blue" style={{fontSize:10,marginRight:5}}>{t.client}</span>}
                      <span style={{fontSize:12}}>{t.text||"—"}</span>
                      {!t.fromSOD&&<span className="badge badge-amber" style={{fontSize:9,marginLeft:5}}>added in EOD</span>}
                    </div>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:500,background:s.bg,color:s.color,border:`0.5px solid ${s.bd}`,display:"inline-block"}}>{t.outcome}</span>
                  </div>
                  {t.notes&&<div style={{padding:"4px 10px 6px",background:"var(--surface)",borderBottom:"0.5px solid var(--border)",fontSize:11,color:"var(--muted)"}}>Note: {t.notes}</div>}
                </div>
              );
            })}
          </div>
        ) : <div style={{color:"var(--faint)",fontSize:12}}>EOD not submitted.</div>}
        {(eod?.notCompleted||eod?.tomorrowFocus)&&(
          <div className="form-grid-2" style={{marginTop:12}}>
            {eod.notCompleted&&<div><div className="field-label mb-4">What wasn't completed</div><div className="text-sm" style={{lineHeight:1.6}}>{eod.notCompleted}</div></div>}
            {eod.tomorrowFocus&&<div><div className="field-label mb-4">Tomorrow's focus</div><div className="text-sm" style={{lineHeight:1.6}}>{eod.tomorrowFocus}</div></div>}
          </div>
        )}
      </div>
    </div>
  );
}
