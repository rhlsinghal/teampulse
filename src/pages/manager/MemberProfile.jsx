import { useState, useEffect } from "react";
import { avatarColor, initials, BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY, MONTHS, MONTHS_SHORT, getDaysInMonth, getFirstDayOfMonth, isoDate } from "../../utils/dates";
import { Loading } from "../../components/index.jsx";
import { loadEntriesInRange } from "../../hooks/useHistory";
import { useRecurring, scheduleLabel } from "../../hooks/useRecurring";
import { db } from "../../firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
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
const MILESTONE_STATUS_STYLE = {
  "Not started": { bg: "var(--surface)",   color: "var(--muted)",  bd: "var(--border)"   },
  "In progress": { bg: "var(--blue-bg)",   color: "var(--blue)",   bd: "var(--blue-bd)"  },
  "On track":    { bg: "var(--green-bg)",  color: "var(--green)",  bd: "var(--green-bd)" },
  "At risk":     { bg: "var(--amber-bg)",  color: "var(--amber)",  bd: "var(--amber-bd)" },
  "Done":        { bg: "var(--green-bg)",  color: "var(--green)",  bd: "var(--green-bd)" },
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, marginBottom: 3 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, color: "var(--faint)" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1 }}>
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
        priority:    t.priority    || sodTasks[i]?.priority    || "Medium",
        startDate:   t.startDate   || sodTasks[i]?.startDate   || "",
        dueDate:     t.dueDate     || sodTasks[i]?.dueDate     || "",
        isRecurring: sodTasks[i]?.isRecurring === true,
      }))
    : sodTasks;
  const valid        = displayTasks.filter(t => t.text?.trim());
  const projectValid = valid.filter(t => !t.isRecurring);
  const done         = projectValid.filter(t => t.outcome === "Done").length;
  const pct          = eod?.submittedAt && projectValid.length ? Math.round(done / projectValid.length * 100) : null;
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
                <th style={{ width: 88 }}>Start</th>
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
                      {t.isRecurring && (
                        <span style={{ fontSize: 9, marginRight: 5, padding: "1px 5px", borderRadius: 10,
                          background: "#EEEDFE", color: "#534AB7", border: "0.5px solid #AFA9EC",
                          fontWeight: 500 }}>↻</span>
                      )}
                      {t.text}
                      {t.adhoc && <span style={{ fontSize: 9, marginLeft: 5, padding: "1px 4px", borderRadius: 8,
                        background: "#fffbeb", color: "#854F0B", border: "0.5px solid #FAC775" }}>ad-hoc</span>}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted)" }}>{t.startDate || "—"}</td>
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
  const tasks    = normed.flatMap(e => e.tasks || []).filter(t => t.text?.trim() && !t.isRecurring);
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

// ── Days active counter ───────────────────────────────────────────────────────
function daysActive(startDate) {
  if (!startDate) return null;
  const start = new Date(startDate);
  const today = new Date(TODAY);
  const diff  = Math.floor((today - start) / 86400000);
  return diff >= 0 ? diff + 1 : null;
}

// ── Age bar ───────────────────────────────────────────────────────────────────
function AgeBar({ startDate, dueDate, isDone }) {
  const days = daysActive(startDate);
  if (!days) return null;
  let barColor = "var(--green)", pct = 30;
  if (!isDone && dueDate) {
    const total   = Math.max(1, Math.floor((new Date(dueDate) - new Date(startDate)) / 86400000));
    const elapsed = Math.floor((new Date(TODAY) - new Date(startDate)) / 86400000);
    pct = Math.min(100, Math.round((elapsed / total) * 100));
    barColor = pct >= 100 ? "var(--red)" : pct >= 75 ? "var(--amber)" : "var(--green)";
  } else if (isDone) { barColor = "var(--green)"; pct = 100; }
  const textColor = !isDone && dueDate && new Date(dueDate) < new Date(TODAY)
    ? "var(--red)" : !isDone && pct >= 75 ? "var(--amber)" : isDone ? "var(--green)" : "var(--muted)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: textColor }}>
        {days}d{!isDone ? " active" : " total"}
      </span>
      <div style={{ width: 52, height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: barColor }} />
      </div>
    </div>
  );
}

// ── Active carry-overs section ────────────────────────────────────────────────
function CarryOverSection({ entries }) {
  const taskMap = {};

  entries.forEach(e => {
    const eodTasks = e.eod?.tasks || [];
    const sodTasks = e.sod?.tasks || [];

    eodTasks.forEach((t, i) => {
      if (!t.text?.trim()) return;
      const sodTask  = sodTasks[i] || {};
      const isCarry = t.outcome === "Carry over" || t.outcome === "Blocked" || sodTask.isCarryOver === true;
      if (!isCarry && !(t.outcome === "Done" && sodTask.isCarryOver === true)) return;

      const origin  = sodTask.carryOverFrom || t.carryOverFrom || t.startDate || e.date;
      const key     = `${t.client||""}|${t.text.trim()}`;
      const isCarryOutcome = t.outcome === "Carry over" || t.outcome === "Blocked";
      const isDone         = t.outcome === "Done" && sodTask.isCarryOver === true;

      if (isCarryOutcome && !taskMap[key]) {
        taskMap[key] = {
          client: t.client || "", text: t.text || "",
          priority:      t.priority      || sodTask.priority  || "Medium",
          startDate:     t.startDate     || sodTask.startDate || origin,
          dueDate:       t.dueDate       || sodTask.dueDate   || "",
          endDate:       "",
          outcome:       t.outcome,
          blockerDetail: t.blockerDetail || "",
          blockerOwner:  t.blockerOwner  || "",
          notes:         t.notes         || "",
        };
      }
      if (isCarryOutcome && taskMap[key] && taskMap[key].outcome !== "Done") {
        taskMap[key].outcome       = t.outcome;
        taskMap[key].notes         = t.notes         || taskMap[key].notes;
        taskMap[key].blockerDetail = t.blockerDetail || taskMap[key].blockerDetail;
        taskMap[key].blockerOwner  = t.blockerOwner  || taskMap[key].blockerOwner;
        taskMap[key].dueDate       = t.dueDate       || sodTask.dueDate || taskMap[key].dueDate;
      }
      if (isDone && taskMap[key] && taskMap[key].outcome !== "Done") {
        taskMap[key].outcome = "Done";
        taskMap[key].endDate = t.endDate || e.date;
      }
    });
  });

  const all       = Object.values(taskMap);
  const active    = all.filter(t => t.outcome !== "Done").sort((a,b) => {
    if (a.outcome === "Blocked" && b.outcome !== "Blocked") return -1;
    if (b.outcome === "Blocked" && a.outcome !== "Blocked") return 1;
    return (a.startDate||"").localeCompare(b.startDate||"");
  });
  const completed = all.filter(t => t.outcome === "Done")
    .sort((a,b) => (b.endDate||"").localeCompare(a.endDate||"")).slice(0,10);

  if (all.length === 0) return null;

  const blockedCount = active.filter(t => t.outcome === "Blocked").length;
  const TH = ({ children, w }) => (
    <th style={{ textAlign:"left", fontSize:9, fontWeight:500, textTransform:"uppercase",
      letterSpacing:"0.07em", color:"var(--faint)", padding:"5px 12px",
      borderBottom:"0.5px solid var(--border)", whiteSpace:"nowrap", width:w }}>{children}</th>
  );

  return (
    <div style={{ marginTop: 12 }}>
      {active.length > 0 && (
        <div style={{ border:"0.5px solid var(--amber-bd)", borderRadius:12, overflow:"hidden", marginBottom:10 }}>
          <div style={{ padding:"9px 14px", background:"var(--amber-bg)",
            borderBottom:"0.5px solid var(--amber-bd)", display:"flex",
            alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:12, fontWeight:500 }}>Active carry-overs</span>
              <span style={{ fontSize:9, padding:"1px 7px", borderRadius:20, fontWeight:500,
                background:"var(--amber-bg)", color:"var(--amber)", border:"0.5px solid var(--amber-bd)" }}>
                {active.length} open{blockedCount > 0 ? ` · ${blockedCount} blocked` : ""}
              </span>
            </div>
            <span style={{ fontSize:11, color:"var(--muted)" }}>Tasks spanning multiple days · active until marked Done</span>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:640 }}>
              <thead>
                <tr style={{ background:"var(--bg)" }}>
                  <TH w={85}>Client</TH><TH w={75}>Priority</TH>
                  <TH>Task</TH><TH w={92}>Started</TH>
                  <TH w={92}>Due</TH><TH w={90}>Age</TH>
                  <TH>Latest note</TH><TH w={95}>Status</TH>
                </tr>
              </thead>
              <tbody>
                {active.map((t, i) => {
                  const isBlocked = t.outcome === "Blocked";
                  const overdue   = t.dueDate && t.dueDate < TODAY;
                  return (
                    <tr key={i} style={{ borderTop:"0.5px solid var(--border)",
                      background: isBlocked ? "var(--red-bg)" : "transparent" }}>
                      <td style={{ padding:"8px 12px" }}><ClientPill client={t.client} /></td>
                      <td style={{ padding:"8px 12px" }}><PriorityPill priority={t.priority} /></td>
                      <td style={{ padding:"8px 12px" }}>
                        <div style={{ fontSize:12, fontWeight:500 }}>{t.text}</div>
                        {isBlocked && t.blockerDetail && (
                          <div style={{ fontSize:10, color:"var(--red)", marginTop:2 }}>
                            ⚑ {t.blockerDetail}
                            {t.blockerOwner && <span style={{ color:"var(--muted)" }}> · {t.blockerOwner}</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding:"8px 12px", fontSize:11,
                        fontFamily:"JetBrains Mono, monospace", color:"var(--muted)", whiteSpace:"nowrap" }}>
                        {t.startDate || "—"}
                      </td>
                      <td style={{ padding:"8px 12px", whiteSpace:"nowrap" }}>
                        {t.dueDate
                          ? <span style={{ fontSize:11, fontFamily:"JetBrains Mono, monospace",
                              color: overdue ? "var(--red)" : "var(--muted)",
                              fontWeight: overdue ? 500 : 400 }}>
                              {t.dueDate}{overdue ? " !" : ""}
                            </span>
                          : <span style={{ fontSize:11, color:"var(--faint)" }}>—</span>}
                      </td>
                      <td style={{ padding:"8px 12px" }}>
                        <AgeBar startDate={t.startDate} dueDate={t.dueDate} isDone={false} />
                      </td>
                      <td style={{ padding:"8px 12px", fontSize:11, color:"var(--muted)",
                        maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {t.notes || <span style={{ color:"var(--faint)" }}>—</span>}
                      </td>
                      <td style={{ padding:"8px 12px" }}>
                        <OutcomePill outcome={isBlocked ? "Blocked" : "Carry over"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div style={{ border:"0.5px solid var(--border)", borderRadius:12, overflow:"hidden", marginBottom:12 }}>
          <div style={{ padding:"9px 14px", background:"var(--surface)",
            borderBottom:"0.5px solid var(--border)", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:12, fontWeight:500 }}>Resolved carry-overs</span>
            <span style={{ fontSize:9, padding:"1px 7px", borderRadius:20, fontWeight:500,
              background:"var(--green-bg)", color:"var(--green)", border:"0.5px solid var(--green-bd)" }}>
              {completed.length} done
            </span>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:560 }}>
              <thead>
                <tr style={{ background:"var(--bg)" }}>
                  <TH w={85}>Client</TH><TH w={75}>Priority</TH>
                  <TH>Task</TH><TH w={92}>Started</TH>
                  <TH w={92}>Due</TH><TH w={90}>Days taken</TH>
                  <TH w={100}>Completed</TH>
                </tr>
              </thead>
              <tbody>
                {completed.map((t, i) => (
                  <tr key={i} style={{ borderTop:"0.5px solid var(--border)",
                    background: i%2===1 ? "var(--bg)" : "transparent" }}>
                    <td style={{ padding:"7px 12px" }}><ClientPill client={t.client} /></td>
                    <td style={{ padding:"7px 12px" }}><PriorityPill priority={t.priority} /></td>
                    <td style={{ padding:"7px 12px", fontSize:12, fontWeight:500 }}>{t.text}</td>
                    <td style={{ padding:"7px 12px", fontSize:11,
                      fontFamily:"JetBrains Mono, monospace", color:"var(--muted)" }}>{t.startDate||"—"}</td>
                    <td style={{ padding:"7px 12px", fontSize:11,
                      fontFamily:"JetBrains Mono, monospace", color:"var(--muted)" }}>{t.dueDate||"—"}</td>
                    <td style={{ padding:"7px 12px" }}>
                      <AgeBar startDate={t.startDate} dueDate={t.dueDate} isDone={true} />
                    </td>
                    <td style={{ padding:"7px 12px", fontSize:11,
                      fontFamily:"JetBrains Mono, monospace", color:"var(--green)", fontWeight:500 }}>
                      {t.endDate||"—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Read-only Milestones panel ───────────────────────────────────────────────
function MilestonesPanel({ memberName }) {
  const [milestones, setMilestones] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);

  useEffect(() => {
    if (!memberName) return;
    getDocs(query(collection(db, "milestones", memberName, "items"), orderBy("createdAt", "desc")))
      .then(snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMilestones(items);
        if (items.length) setSelected(items[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [memberName]);

  if (loading) return <Loading />;
  if (milestones.length === 0) return (
    <div style={{ textAlign:"center", padding:"48px 24px", color:"var(--faint)" }}>
      <div style={{ fontSize:32, marginBottom:12 }}>🎯</div>
      <div style={{ fontSize:13 }}>No milestones added yet</div>
    </div>
  );

  const selectedMilestone = milestones.find(m => m.id === selected) || null;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:12 }}>
      {/* Left list */}
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {milestones.map(m => {
          const ss = MILESTONE_STATUS_STYLE[m.status] || MILESTONE_STATUS_STYLE["In progress"];
          const isActive = selected === m.id;
          const lastUpdate = [...(m.updates || [])].sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
          const isOverdue  = m.targetDate && m.targetDate < TODAY && m.status !== "Done";
          return (
            <div key={m.id} onClick={() => setSelected(m.id)}
              style={{ padding:"10px 12px", borderRadius:10, cursor:"pointer",
                border: isActive ? "2px solid var(--accent)" : "0.5px solid var(--border)",
                background: isActive ? "var(--surface)" : "var(--bg)" }}>
              <div style={{ fontSize:12, fontWeight:500, marginBottom:5, lineHeight:1.4 }}>{m.title}</div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                <span style={{ fontSize:10, padding:"1px 7px", borderRadius:20, fontWeight:500,
                  background:ss.bg, color:ss.color, border:`0.5px solid ${ss.bd}` }}>{m.status}</span>
                {m.targetDate && (
                  <span style={{ fontSize:10, fontFamily:"JetBrains Mono, monospace",
                    color: isOverdue ? "var(--red)" : "var(--faint)" }}>{m.targetDate}</span>
                )}
              </div>
              {lastUpdate && (
                <div style={{ fontSize:11, color:"var(--faint)", marginTop:5,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {lastUpdate.text || (lastUpdate.type === "created" ? "Milestone created" : lastUpdate.fieldLabel ? `${lastUpdate.fieldLabel} changed` : "")}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Right detail */}
      {selectedMilestone && (() => {
        const ss = MILESTONE_STATUS_STYLE[selectedMilestone.status] || MILESTONE_STATUS_STYLE["In progress"];
        const isOverdue = selectedMilestone.targetDate && selectedMilestone.targetDate < TODAY && selectedMilestone.status !== "Done";
        const updates   = [...(selectedMilestone.updates || [])].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
        const STATUS_PILL_MAP = MILESTONE_STATUS_STYLE;
        return (
          <div style={{ border:"0.5px solid var(--border)", borderRadius:12, overflow:"hidden",
            background:"var(--surface)", display:"flex", flexDirection:"column" }}>
            {/* Detail header */}
            <div style={{ padding:"12px 16px", borderBottom:"0.5px solid var(--border)" }}>
              <div style={{ fontSize:14, fontWeight:500, marginBottom:6, lineHeight:1.4 }}>
                {selectedMilestone.title}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                {selectedMilestone.client && (
                  <span style={{ fontSize:10, padding:"1px 7px", borderRadius:20, fontWeight:500,
                    background:"var(--blue-bg)", color:"var(--blue)", border:"0.5px solid var(--blue-bd)" }}>
                    {selectedMilestone.client}
                  </span>
                )}
                <span style={{ fontSize:10, padding:"1px 7px", borderRadius:20, fontWeight:500,
                  background:ss.bg, color:ss.color, border:`0.5px solid ${ss.bd}` }}>
                  {selectedMilestone.status}
                </span>
                {selectedMilestone.targetDate && (
                  <span style={{ fontSize:11, fontFamily:"JetBrains Mono, monospace",
                    color: isOverdue ? "var(--red)" : "var(--muted)", fontWeight: isOverdue ? 500 : 400 }}>
                    Due {selectedMilestone.targetDate}{isOverdue ? " !" : ""}
                  </span>
                )}
              </div>
              {selectedMilestone.description && (
                <div style={{ fontSize:12, color:"var(--muted)", marginTop:8, lineHeight:1.6 }}>
                  {selectedMilestone.description}
                </div>
              )}
            </div>
            {/* Updates timeline */}
            <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", maxHeight:380 }}>
              {updates.length === 0 ? (
                <div style={{ fontSize:12, color:"var(--faint)", textAlign:"center", padding:"24px 0" }}>No updates yet</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                  {updates.map((u, i) => {
                    const dotColor = u.type === "update"       ? "var(--accent)"
                                   : u.type === "field_change" ? "var(--amber)"
                                   : u.type === "created"      ? "var(--green)"
                                   : "var(--accent)";
                    const ss2 = STATUS_PILL_MAP;
                    const pill = (val, field) => {
                      if (field === "status") {
                        const s = ss2[val] || ss2["Not started"];
                        return <span style={{ fontSize:10, padding:"1px 7px", borderRadius:20,
                          fontWeight:500, background:s.bg, color:s.color, border:`0.5px solid ${s.bd}` }}>{val||"—"}</span>;
                      }
                      return <span style={{ fontSize:10, padding:"1px 7px", borderRadius:20, fontWeight:500,
                        background:"var(--surface)", color:"var(--muted)", border:"0.5px solid var(--border)" }}>{val||"—"}</span>;
                    };
                    return (
                      <div key={i} style={{ display:"flex", gap:10 }}>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
                            background:dotColor, marginTop:4 }} />
                          {i < updates.length - 1 && (
                            <div style={{ width:1, flex:1, background:"var(--border)", minHeight:16 }} />
                          )}
                        </div>
                        <div style={{ flex:1, paddingBottom:14 }}>
                          {(!u.type || u.type === "update") && (
                            <div style={{ fontSize:12, color:"var(--text)", lineHeight:1.6 }}>{u.text}</div>
                          )}
                          {u.type === "field_change" && (
                            <div>
                              <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
                                <span style={{ fontSize:11, color:"var(--muted)", fontWeight:500 }}>
                                  {u.fieldLabel} changed
                                </span>
                                {pill(u.from, u.field)}
                                <span style={{ fontSize:11, color:"var(--faint)" }}>→</span>
                                {pill(u.to, u.field)}
                              </div>
                              {(u.field === "description" || u.field === "title") && u.to && (
                                <div style={{ fontSize:11, color:"var(--muted)", fontStyle:"italic",
                                  lineHeight:1.5, marginTop:2 }}>"{u.to}"</div>
                              )}
                            </div>
                          )}
                          {u.type === "created" && (
                            <span style={{ fontSize:11, padding:"1px 8px", borderRadius:20,
                              fontWeight:500, background:"var(--green-bg)", color:"var(--green)",
                              border:"0.5px solid var(--green-bd)" }}>Milestone created</span>
                          )}
                          <div style={{ fontSize:10, fontFamily:"JetBrains Mono, monospace",
                            color:"var(--faint)", marginTop:3 }}>{fmt(u.date)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Filterable daily task history table ───────────────────────────────────────
function TaskHistory({ entries }) {
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [clientFilter,  setClientFilter]  = useState("all");

  const normed = entries.map(normaliseEntry);

  // Build raw task list with eodMissing flag
  const rawTasks = normed.flatMap(e =>
    (e.tasks || [])
      .filter(t => t.text?.trim() && !t.isCarryOver)
      .map(t => ({ ...t, date: e.date, _eodMissing: e.eodMissing, _entryDate: e.date }))
  );

  // Count IP days per client|text key
  const ipDaysMap = {};
  rawTasks.forEach(t => {
    if ((t.outcome === "In Progress" || t.status === "In Progress") && !t._eodMissing) {
      const key = `${t.client||""}|${t.text.trim()}`;
      ipDaysMap[key] = (ipDaysMap[key] || 0) + 1;
    }
  });

  // Track latest IP entry per key
  const ipLatest = {};
  rawTasks.forEach(t => {
    if ((t.outcome === "In Progress" || t.status === "In Progress") && !t._eodMissing) {
      const key = `${t.client||""}|${t.text.trim()}`;
      if (!ipLatest[key] || t._entryDate > ipLatest[key]._entryDate) ipLatest[key] = t;
    }
  });

  // Deduplicate IP rows — keep latest occurrence only
  const ipSeen = new Set();
  const allTasks = rawTasks
    .filter(t => {
      if ((t.outcome === "In Progress" || t.status === "In Progress") && !t._eodMissing) {
        const key = `${t.client||""}|${t.text.trim()}`;
        if (ipSeen.has(key)) return false;
        ipSeen.add(key); return true;
      }
      return true;
    })
    .map(t => {
      const key = `${t.client||""}|${t.text.trim()}`;
      const base = (t.outcome === "In Progress" || t.status === "In Progress") && !t._eodMissing
        ? (ipLatest[key] || t) : t;
      return { ...base, _ipDays: ipDaysMap[key] || 0 };
    });

  const clients  = [...new Set(allTasks.map(t => t.client).filter(Boolean))].sort();
  const outcomes = ["Done", "Carry over", "Blocked", "In Progress", "EOD pending"];

  const filtered = allTasks.filter(t => {
    const effectiveStatus = t._eodMissing ? "EOD pending" : (t.status || t.outcome || "In Progress");
    const matchOutcome = outcomeFilter === "all" || effectiveStatus === outcomeFilter;
    const matchClient  = clientFilter  === "all" || t.client === clientFilter;
    return matchOutcome && matchClient;
  });

  const FP = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
      fontSize:10, padding:"2px 9px", borderRadius:20, fontWeight:500, cursor:"pointer",
      fontFamily:"inherit", border:"0.5px solid",
      background: active ? "var(--accent)" : "var(--surface)",
      color: active ? "#fff" : "var(--muted)",
      borderColor: active ? "var(--accent)" : "var(--border)",
    }}>{children}</button>
  );

  return (
    <div className="card mt-12">
      <div className="card-header" style={{ flexWrap:"wrap", gap:8 }}>
        <span className="card-title">Daily task history</span>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          <FP active={outcomeFilter==="all"} onClick={() => setOutcomeFilter("all")}>All</FP>
          {outcomes.map(o => (
            <FP key={o} active={outcomeFilter===o} onClick={() => setOutcomeFilter(o)}>{o}</FP>
          ))}
          <div style={{ width:"0.5px", background:"var(--border)", margin:"0 2px" }} />
          <FP active={clientFilter==="all"} onClick={() => setClientFilter("all")}>All clients</FP>
          {clients.map(c => (
            <FP key={c} active={clientFilter===c} onClick={() => setClientFilter(c)}>{c}</FP>
          ))}
        </div>
      </div>
      {filtered.length === 0
        ? <div style={{ padding:"24px", textAlign:"center", color:"var(--faint)", fontSize:12 }}>No tasks match this filter.</div>
        : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width:88 }}>Date</th>
                <th style={{ width:85 }}>Client</th>
                <th style={{ width:75 }}>Priority</th>
                <th>Task</th>
                <th style={{ width:88 }}>Start</th>
                <th style={{ width:88 }}>Due</th>
                <th style={{ width:88 }}>End date</th>
                <th style={{ width:95 }}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0,50).map((t, i) => {
                const overdue = t.dueDate && t.dueDate < TODAY && (t.status||t.outcome) !== "Done";
                return (
                  <tr key={i} style={{ background: t._eodMissing ? "var(--bg)" : "transparent" }}>
                    <td style={{ fontFamily:"JetBrains Mono, monospace", fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>{fmt(t.date)}</td>
                    <td><ClientPill client={t.client} /></td>
                    <td><PriorityPill priority={t.priority} /></td>
                    <td style={{ fontSize:12 }}>{t.text}</td>
                    <td style={{ fontSize:11, fontFamily:"JetBrains Mono, monospace", color:"var(--muted)", whiteSpace:"nowrap" }}>{t.startDate||"—"}</td>
                    <td>
                      {t.dueDate
                        ? <span style={{ fontSize:11, fontFamily:"JetBrains Mono, monospace",
                            color: overdue ? "var(--red)" : "var(--muted)", whiteSpace:"nowrap" }}>
                            {t.dueDate}{overdue ? " !" : ""}
                          </span>
                        : <span style={{ color:"var(--faint)", fontSize:11 }}>—</span>}
                    </td>
                    <td style={{ fontSize:11, fontFamily:"JetBrains Mono, monospace",
                      color: t.endDate ? "var(--green)" : "var(--faint)", whiteSpace:"nowrap" }}>{t.endDate||"—"}</td>
                    <td style={{ whiteSpace:"nowrap" }}>
                      {t._eodMissing
                        ? <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, fontWeight:500,
                            background:"var(--surface)", color:"var(--faint)", border:"0.5px solid var(--border)" }}>EOD pending</span>
                        : <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                            <OutcomePill outcome={t.status||t.outcome} />
                            {t._ipDays > 0 && (
                              <span style={{ fontSize:10, padding:"1px 6px", borderRadius:20,
                                background:"var(--surface)", color:"var(--muted)", border:"0.5px solid var(--border)" }}>
                                {t._ipDays}d
                              </span>
                            )}
                          </span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      {filtered.length > 50 && (
        <div style={{ padding:"8px 14px", textAlign:"center", fontSize:11, color:"var(--faint)",
          borderTop:"0.5px solid var(--border)" }}>
          Showing 50 of {filtered.length} tasks
        </div>
      )}
      <div style={{ padding:"7px 14px", fontSize:10, color:"var(--faint)",
        borderTop:"0.5px solid var(--border)" }}>
        Carry-over tasks are tracked separately above
      </div>
    </div>
  );
}


// ── Main ──────────────────────────────────────────────────────────────────────
export default function MemberProfile({ memberName, memberRecord, onBack }) {
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [calYear,    setCalYear]    = useState(new Date().getFullYear());
  const [calMonth,   setCalMonth]   = useState(new Date().getMonth());
  const [profileTab, setProfileTab] = useState("overview"); // "overview" | "milestones"
  const { tasks: recurringTasks } = useRecurring(memberName);
  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth();
  const monthKey     = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  useEffect(() => {
    // Load 6 months back for trend view
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    const startStr = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth()+1).padStart(2,"0")}-01`;
    loadEntriesInRange(memberName, startStr, TODAY).then(res => {
      setEntries(res); setLoading(false);
    });
  }, [memberName]);

  if (loading) return <div className="main-content"><Loading /></div>;
  const color      = avatarColor(memberName);
  const todayEntry = entries.find(e => e.date === TODAY) || null;

  // Shared normalised tasks for stats
  const normed    = entries.map(normaliseEntry);
  const allTasks  = normed.flatMap(e => e.tasks || []).filter(t => t.text?.trim() && !t.isRecurring);
  const monthEntries  = entries.filter(e => e.date?.startsWith(monthKey));
  const monthNormed   = monthEntries.map(normaliseEntry);
  const monthTasks    = monthNormed.flatMap(e => (e.tasks || []).filter(t => t.text?.trim() && !t.isRecurring && !e.eodMissing));
  const monthDone     = monthTasks.filter(t => t.status === "Done" || t.outcome === "Done").length;
  const monthTotal    = monthTasks.length;
  const monthPct      = monthTotal ? Math.round(monthDone / monthTotal * 100) : 0;
  const monthBlockers = monthNormed.filter(e => e.blockers?.trim());
  const monthBwVals   = monthNormed.map(e => e.bandwidth).filter(Boolean);
  const monthAvgBw    = monthBwVals.length ? Math.round(monthBwVals.reduce((a,b)=>a+b,0)/monthBwVals.length) : 3;

  // EOD submission rate for current month
  const monthWithSod   = monthEntries.filter(e => e.sod?.submittedAt);
  const monthWithEod   = monthEntries.filter(e => e.eod?.submittedAt);
  const eodMissingDays = monthWithSod.filter(e => !e.eod?.submittedAt);

  // Week-by-week buckets for current month
  const buildWeeks = () => {
    const weeks = [];
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    let d = new Date(currentYear, currentMonth, 1);
    while (d.getMonth() === currentMonth) {
      if (d.getDay() === 1 || d.getDate() === 1) {
        const wStart = new Date(d);
        const wEnd   = new Date(d); wEnd.setDate(wEnd.getDate() + (7 - (wEnd.getDay() || 7)));
        if (wEnd.getMonth() !== currentMonth) wEnd.setDate(lastDay);
        weeks.push({ start: wStart, end: wEnd, entries: [] });
      }
      d.setDate(d.getDate() + 1);
    }
    const seen = new Set();
    const deduped = weeks.filter(w => { const k = w.start.getDate(); if(seen.has(k))return false; seen.add(k); return true; });
    monthEntries.forEach(e => {
      const ed = new Date(e.date);
      const w  = deduped.find(w => ed >= w.start && ed <= w.end);
      if (w) w.entries.push(e);
    });
    return deduped;
  };
  const weeks = buildWeeks();

  // Bandwidth pattern — per submitted day this month
  const bwPattern = monthEntries
    .filter(e => e.sod?.submittedAt)
    .sort((a,b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, bw: e.sod?.bandwidth || 3 }));

  // Recurring compliance for current month
  const recurringCompliance = (recurringTasks || []).filter(r => r.active !== false).map(r => {
    const label   = scheduleLabel(r);
    // Count days in month this task was scheduled
    const daysInM = new Date(currentYear, currentMonth + 1, 0).getDate();
    let scheduled = 0;
    for (let d = 1; d <= daysInM; d++) {
      const date  = new Date(currentYear, currentMonth, d);
      const dow   = date.getDay();
      const iso   = `${currentYear}-${String(currentMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      if (iso > TODAY) continue;
      let isScheduled = false;
      if (r.schedule === "daily") isScheduled = true;
      else if (r.schedule === "weekdays") isScheduled = dow >= 1 && dow <= 5;
      else if (r.schedule === "weekly") isScheduled = (r.days || []).includes(dow);
      else if (r.schedule === "monthly") isScheduled = d === (r.dayOfMonth || 1);
      if (isScheduled) scheduled++;
    }
    // Count days this task was actually submitted (SOD has this recurring task)
    const done = monthEntries.filter(e => {
      return (e.sod?.tasks || []).some(t => t.recurringId === r.id || (t.isRecurring && t.text === r.text));
    }).length;
    return { text: r.text, client: r.client, scheduledDays: scheduled, doneDays: Math.min(done, scheduled) };
  }).filter(r => r.scheduledDays > 0);

  // 6-month trend data
  const sixMonthTrend = (() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(currentYear, currentMonth - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const lbl = d.toLocaleDateString("en-US", { month: "short" });
      const ents = entries.filter(e => e.date?.startsWith(key));
      const nrm  = ents.map(normaliseEntry);
      const tks  = nrm.flatMap(e => (e.tasks||[]).filter(t => t.text?.trim() && !t.isRecurring && !e.eodMissing));
      const done = tks.filter(t => t.status==="Done"||t.outcome==="Done").length;
      const pct  = tks.length ? Math.round(done/tks.length*100) : 0;
      months.push({ label: lbl, pct, tasks: tks.length, days: ents.length });
    }
    return months;
  })();

  // Header stats
  const entryDates   = entries.map(e => e.date);
  const blockerDates = normed.filter(e => e.blockers?.trim()).map(e => e.date);
  const clientCounts = {};
  allTasks.forEach(t => { const c = t.client || "Internal"; clientCounts[c] = (clientCounts[c] || 0) + 1; });
  const topClient  = Object.entries(clientCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "—";
  const totalTasks = allTasks.length;
  // Month client counts
  const monthClientCounts = {};
  monthTasks.forEach(t => { const c = t.client||"Internal"; monthClientCounts[c]=(monthClientCounts[c]||0)+1; });

  // Streak — weekend-aware (skip Sat/Sun)
  const calcStreak = () => {
    let s = 0;
    const d = new Date();
    while (true) {
      if (d.getDay() === 0) { d.setDate(d.getDate()-1); continue; } // skip Sun
      if (d.getDay() === 6) { d.setDate(d.getDate()-1); continue; } // skip Sat
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      if (iso === TODAY && !entryDates.includes(iso)) { d.setDate(d.getDate()-1); continue; }
      if (entryDates.includes(iso)) { s++; d.setDate(d.getDate()-1); }
      else break;
    }
    return s;
  };
  const streak = calcStreak();

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

      {/* ── Tab switcher ── */}
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[
          { key:"overview",   label:"Overview"   },
          { key:"milestones", label:"🎯 Milestones" },
        ].map(t => (
          <button key={t.key} onClick={() => setProfileTab(t.key)}
            style={{ fontSize:12, padding:"5px 14px", borderRadius:8, cursor:"pointer",
              fontFamily:"inherit", border:"0.5px solid",
              background: profileTab === t.key ? "var(--accent)" : "var(--surface)",
              color: profileTab === t.key ? "#fff" : "var(--muted)",
              borderColor: profileTab === t.key ? "var(--accent)" : "var(--border)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {profileTab === "milestones" && <MilestonesPanel memberName={memberName} />}

      {profileTab === "overview" && <>

      {/* ── Month to date + Year to date stats ── */}
      {(() => {
        const ytdNormed = entries.map(normaliseEntry);
        const ytdTasks  = ytdNormed.flatMap(e => (e.tasks||[]).filter(t => t.text?.trim() && !t.isRecurring && !e.eodMissing));
        const ytdDone   = ytdTasks.filter(t => t.status==="Done"||t.outcome==="Done").length;
        const ytdTotal  = ytdTasks.length;
        const ytdPct    = ytdTotal ? Math.round(ytdDone/ytdTotal*100) : 0;
        const ytdBlock  = ytdNormed.filter(e => e.blockers?.trim()).length;
        const ytdBwV    = ytdNormed.map(e=>e.bandwidth).filter(Boolean);
        const ytdAvgBw  = ytdBwV.length ? Math.round(ytdBwV.reduce((a,b)=>a+b,0)/ytdBwV.length) : 3;
        const Row = ({ label, items }) => (
          <div style={{ display:"grid", gridTemplateColumns:"100px repeat(5,minmax(0,1fr))", gap:0,
            border:"0.5px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
              background:"var(--bg)", borderRight:"0.5px solid var(--border)",
              padding:"8px 10px", fontSize:10, fontWeight:500, textTransform:"uppercase",
              letterSpacing:"0.06em", color:"var(--faint)", textAlign:"center" }}>
              {label}
            </div>
            {items.map((m,i) => (
              <div key={i} style={{ padding:"8px 6px", textAlign:"center", background:"var(--surface)",
                borderLeft: i>0 ? "0.5px solid var(--border)" : "none" }}>
                <div style={{ fontSize: m.small?14:20, fontWeight:500, color:m.color, lineHeight:1.1 }}>{m.val}</div>
                <div style={{ fontSize:9, color:"var(--muted)", marginTop:3 }}>{m.label}</div>
              </div>
            ))}
          </div>
        );
        return (
          <div style={{ marginBottom:12 }}>
            <Row label="This month" items={[
              { val: monthEntries.length, label:"Days submitted",  color:"var(--accent)" },
              { val: `${monthPct}%`,      label:"Completion",      color:"var(--green)"  },
              { val: monthTotal,          label:"Tasks tracked",   color:"var(--text)"   },
              { val: monthBlockers.length,label:"Blockers",        color: monthBlockers.length>0?"var(--red)":"var(--green)" },
              { val: BANDWIDTH[monthAvgBw]?.label||"—", label:"Avg bandwidth", color:BW_STYLES[monthAvgBw]?.color||"var(--muted)", small:true },
            ]} />
            <Row label="Year to date" items={[
              { val: entries.length,  label:"Days submitted",  color:"var(--accent)" },
              { val: `${ytdPct}%`,    label:"Completion",      color:"var(--green)"  },
              { val: ytdTotal,        label:"Tasks tracked",   color:"var(--text)"   },
              { val: ytdBlock,        label:"Blockers",        color: ytdBlock>0?"var(--red)":"var(--green)" },
              { val: BANDWIDTH[ytdAvgBw]?.label||"—", label:"Avg bandwidth", color:BW_STYLES[ytdAvgBw]?.color||"var(--muted)", small:true },
            ]} />
          </div>
        );
      })()}

      {/* ── Today's update ── */}
      {todayEntry && <TodaySection entry={todayEntry} />}

      {/* ── 3-column: work distribution + EOD rate + recurring ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
        {/* Work distribution */}
        <div className="card" style={{ marginBottom:0 }}>
          <div className="card-header" style={{ padding:"7px 12px" }}>
            <span className="card-title">Work distribution</span>
            <span className="card-meta">{MONTHS[currentMonth]}</span>
          </div>
          <div className="card-body" style={{ padding:"10px 12px" }}>
            {Object.entries(monthClientCounts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,n]) => (
              <div key={c} style={{ marginBottom:8 }}>
                <div className="flex justify-between mb-4">
                  <span className="text-sm font-medium">{c}</span>
                  <span className="text-xs text-muted">{n} · {monthTotal ? Math.round(n/monthTotal*100) : 0}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width:`${monthTotal ? n/monthTotal*100 : 0}%`,
                    background: c.toLowerCase()==="internal" ? "var(--faint)" : "var(--accent)" }} />
                </div>
              </div>
            ))}
            {Object.keys(monthClientCounts).length === 0 && (
              <span style={{ fontSize:12, color:"var(--faint)" }}>No tasks this month</span>
            )}
          </div>
        </div>

        {/* EOD submission rate */}
        <div className="card" style={{ marginBottom:0 }}>
          <div className="card-header" style={{ padding:"7px 12px" }}><span className="card-title">EOD submission rate</span></div>
          <div className="card-body" style={{ padding:"10px 12px" }}>
            {(() => {
              const total  = monthWithSod.length;
              const done   = monthWithEod.length;
              const pct    = total ? Math.round(done/total*100) : 0;
              const col    = pct >= 90 ? "var(--green)" : pct >= 70 ? "var(--amber)" : "var(--red)";
              return (
                <>
                  <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:6 }}>
                    <span style={{ fontSize:22, fontWeight:500, color:col }}>{pct}%</span>
                    <span style={{ fontSize:11, color:"var(--muted)" }}>{done} of {total} days</span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:"var(--border)", overflow:"hidden", marginBottom:8 }}>
                    <div style={{ height:"100%", borderRadius:3, width:`${pct}%`, background:col }} />
                  </div>
                  {eodMissingDays.length > 0 ? (
                    <>
                      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:6 }}>
                        {eodMissingDays.length} day{eodMissingDays.length !== 1 ? "s" : ""} missing EOD
                      </div>
                      {eodMissingDays.slice(0,3).map((e,i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 0",
                          borderBottom: i < Math.min(eodMissingDays.length,3)-1 ? "0.5px solid var(--border)" : "none" }}>
                          <span style={{ fontSize:11, fontFamily:"JetBrains Mono, monospace", color:"var(--muted)" }}>{e.date}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ fontSize:11, color:"var(--green)" }}>All days EOD submitted</div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Recurring compliance */}
        <div className="card" style={{ marginBottom:0 }}>
          <div className="card-header" style={{ padding:"7px 12px" }}><span className="card-title">Recurring compliance</span></div>
          <div className="card-body" style={{ padding:"10px 12px" }}>
            {recurringCompliance.length === 0 ? (
              <span style={{ fontSize:12, color:"var(--faint)" }}>No recurring tasks</span>
            ) : recurringCompliance.map((r,i) => {
              const pct = r.scheduledDays ? Math.round(r.doneDays/r.scheduledDays*100) : 0;
              const col = pct===100 ? "var(--green)" : pct>=75 ? "var(--accent)" : pct>=50 ? "var(--amber)" : "var(--red)";
              return (
                <div key={i} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:11, fontWeight:500 }}>{r.client ? `${r.client} · ` : ""}{r.text}</span>
                    <span style={{ fontSize:11, fontWeight:500, color:col }}>{r.doneDays}/{r.scheduledDays}</span>
                  </div>
                  <div style={{ height:5, borderRadius:3, background:"var(--border)", overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:3, width:`${pct}%`, background:col }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 2-column: week-by-week + blockers ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
        {/* Week-by-week */}
        <div className="card" style={{ marginBottom:0 }}>
          <div className="card-header" style={{ padding:"7px 12px" }}>
            <span className="card-title">Week-by-week</span>
            <span className="card-meta">{MONTHS[currentMonth]} {currentYear}</span>
          </div>
          <div className="card-body" style={{ padding:"8px 12px" }}>
            {weeks.filter(w => w.entries.length > 0).map((w, wi) => {
              const wEod   = w.entries.flatMap(e => (e.eod?.tasks||[]).filter(t=>t.text?.trim()));
              const wSod   = w.entries.flatMap(e => (e.sod?.tasks||[]).filter(t=>t.text?.trim()&&!t.isRecurring));
              const wDone  = wEod.filter(t=>t.outcome==="Done").length;
              const wCarry = wEod.filter(t=>t.outcome==="Carry over").length;
              const wBlock = wEod.filter(t=>t.outcome==="Blocked").length;
              const wTotal = wSod.length;
              const wPct   = wTotal ? Math.round(wDone/wTotal*100) : 0;
              const sd = w.start.getDate(), ed = Math.min(w.end.getDate(), new Date(currentYear,currentMonth+1,0).getDate());
              return (
                <div key={wi} style={{ display:"grid", gridTemplateColumns:"72px 1fr 110px", alignItems:"center",
                  gap:10, padding:"5px 0", borderBottom:"0.5px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize:11, color:"var(--text)", fontWeight:500 }}>Week {wi+1}</div>
                    <div style={{ fontSize:9, color:"var(--faint)" }}>{MONTHS[currentMonth].slice(0,3)} {sd}–{ed}</div>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:"var(--border)", overflow:"hidden" }}>
                    <div style={{ width:`${wPct}%`, height:"100%", borderRadius:3,
                      background: wPct===100?"var(--green)":wPct>=75?"var(--accent)":"var(--amber)" }} />
                  </div>
                  <div style={{ fontSize:10, color:"var(--muted)", textAlign:"right" }}>
                    {wTotal}t · {wDone}✓
                    {wCarry > 0 && <span style={{ color:"var(--amber)" }}> · {wCarry}↩</span>}
                    {wBlock > 0 && <span style={{ color:"var(--red)" }}> · {wBlock}⚑</span>}
                  </div>
                </div>
              );
            })}
            {weeks.filter(w=>w.entries.length>0).length===0 && (
              <div style={{ fontSize:12, color:"var(--faint)", textAlign:"center", padding:"12px 0" }}>No entries this month</div>
            )}
          </div>
        </div>

        {/* Blockers this month */}
        <div className="card" style={{ marginBottom:0 }}>
          <div className="card-header" style={{ padding:"7px 12px" }}>
            <span className="card-title">Blockers this month</span>
            <span style={{ fontSize:11, color:"var(--muted)" }}>{monthBlockers.length} raised</span>
          </div>
          <div className="card-body" style={{ padding:"8px 12px" }}>
            {monthBlockers.length === 0 ? (
              <div style={{ fontSize:12, color:"var(--faint)", textAlign:"center", padding:"12px 0" }}>No blockers this month</div>
            ) : monthNormed.filter(e=>e.blockers?.trim()).map((e,i) => (
              <div key={i} style={{ display:"flex", gap:8, alignItems:"center", padding:"5px 0",
                borderBottom:"0.5px solid var(--border)" }}>
                <span style={{ fontSize:11, fontFamily:"JetBrains Mono, monospace", color:"var(--muted)", minWidth:56, flexShrink:0 }}>{e.date}</span>
                <span style={{ fontSize:11, color:"var(--text)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.blockers}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 2-column: compact activity calendar + bandwidth pattern ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
        {/* Compact activity calendar */}
        <div className="card" style={{ marginBottom:0 }}>
          <div className="card-header" style={{ padding:"7px 12px" }}>
            <span className="card-title">Activity</span>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <button onClick={() => navigateCal(-1)} style={{ fontSize:11, padding:"1px 7px", borderRadius:5,
                border:"0.5px solid var(--border)", background:"var(--bg)", cursor:"pointer", color:"var(--muted)" }}>‹</button>
              <span style={{ fontSize:11, color:"var(--muted)" }}>
                {new Date(calYear,calMonth,1).toLocaleDateString("en-US",{month:"short",year:"numeric"})}
              </span>
              <button onClick={() => navigateCal(1)} style={{ fontSize:11, padding:"1px 7px", borderRadius:5,
                border:"0.5px solid var(--border)", background:"var(--bg)", cursor:"pointer", color:"var(--muted)" }}>›</button>
            </div>
          </div>
          <div className="card-body" style={{ padding:"8px 12px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,minmax(0,22px))", gap:2, marginBottom:2, justifyContent:"start" }}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                <div key={d} style={{ textAlign:"center", fontSize:9, color:"var(--faint)" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,minmax(0,22px))", gap:2, justifyContent:"start" }}>
              {(() => {
                const cells = [];
                for (let i = 0; i < getFirstDayOfMonth(calYear,calMonth); i++) cells.push(null);
                for (let d = 1; d <= getDaysInMonth(calYear,calMonth); d++) cells.push(d);
                return cells.map((d,i) => {
                  if (!d) return <div key={i} />;
                  const iso = isoDate(calYear,calMonth,d);
                  const has = entryDates.includes(iso);
                  const blk = blockerDates.includes(iso);
                  const fut = iso > TODAY;
                  return (
                    <div key={i} style={{ aspectRatio:"1", borderRadius:3, fontSize:9, color:"var(--faint)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      background: fut?"transparent":has?(blk?"var(--red-bg)":"#5b5ff540"):"var(--bg)",
                      border: fut?"none":has?(blk?"0.5px solid var(--red-bd)":"none"):"0.5px solid var(--border)" }}>
                      {d}
                    </div>
                  );
                });
              })()}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--muted)" }}>
                <div style={{ width:8, height:8, borderRadius:2, background:"#5b5ff540" }} />Submitted
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--muted)" }}>
                <div style={{ width:8, height:8, borderRadius:2, background:"var(--red-bg)", border:"0.5px solid var(--red-bd)" }} />Blocker
              </div>
            </div>
          </div>
        </div>

        {/* Bandwidth pattern */}
        <div className="card" style={{ marginBottom:0 }}>
          <div className="card-header" style={{ padding:"7px 12px" }}>
            <span className="card-title">Bandwidth pattern</span>
            <span className="card-meta">per day this month</span>
          </div>
          <div className="card-body" style={{ padding:"10px 12px" }}>
            {bwPattern.length === 0 ? (
              <div style={{ fontSize:12, color:"var(--faint)", textAlign:"center", padding:"20px 0" }}>No data</div>
            ) : (
              <>
                <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:72, marginBottom:8 }}>
                  {bwPattern.map((p,i) => {
                    const h = p.bw===3?35:p.bw===4?55:p.bw===5?75:35;
                    const c = p.bw===3?"var(--green)":p.bw===4?"var(--amber)":"var(--red)";
                    return <div key={i} style={{ flex:1, height:`${h}%`, background:c, borderRadius:"2px 2px 0 0", minWidth:4 }} />;
                  })}
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {[["var(--green)","Balanced"],["var(--amber)","Heavy"],["var(--red)","Overloaded"]].map(([c,l]) => (
                    <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--muted)" }}>
                      <div style={{ width:8, height:8, borderRadius:2, background:c }} />{l}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 6-month trend ── */}
      <div className="card mb-12">
        <div className="card-header" style={{ padding:"7px 12px" }}>
          <span className="card-title">6-month trend</span>
          <span className="card-meta">completion % and task volume</span>
        </div>
        <div className="card-body" style={{ padding:"10px 14px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(6,minmax(0,1fr))", gap:8 }}>
            {sixMonthTrend.map((m,i) => {
              const maxT = Math.max(...sixMonthTrend.map(x=>x.tasks), 1);
              const col  = m.pct>=85?"var(--green)":m.pct>=70?"var(--amber)":"var(--red)";
              return (
                <div key={i} style={{ textAlign:"center" }}>
                  <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center", gap:3, height:60, marginBottom:5 }}>
                    <div style={{ width:13, height:`${Math.max(m.tasks/maxT*60,4)}px`, background:"var(--blue-bd)", borderRadius:"2px 2px 0 0" }} />
                    <div style={{ width:13, height:`${Math.max(m.pct/100*60,4)}px`, background:col, borderRadius:"2px 2px 0 0" }} />
                  </div>
                  <div style={{ fontSize:11, fontWeight:500, color:col }}>{m.pct}%</div>
                  <div style={{ fontSize:10, color:"var(--muted)" }}>{m.label}</div>
                  <div style={{ fontSize:10, color:"var(--faint)" }}>{m.tasks}t</div>
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:14, marginTop:10 }}>
            {[["var(--blue-bd)","Task volume"],["var(--green)","Completion %"]].map(([c,l]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"var(--muted)" }}>
                <div style={{ width:10, height:10, borderRadius:2, background:c }} />{l}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Carry-over section ── */}
      <CarryOverSection entries={entries} />

      {/* ── Filterable daily task history ── */}
      <TaskHistory entries={entries} />

      </> /* end profileTab === "overview" */}
    </div>
  );
}
