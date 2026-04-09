import { useState, useEffect } from "react";
import { Spinner, Toast, useToast } from "../../components/index.jsx";
import { BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { useHistory } from "../../hooks/useHistory";
import { useRecurring } from "../../hooks/useRecurring";

const emptySOD = () => ({
  bandwidth: 3,
  tasks: [{ client: "", text: "", blocker: "", priority: "Medium", startDate: "", dueDate: "" }],
});

const emptyEOD = () => ({});

const OUTCOMES = ["Done", "Carry over", "Blocked"];
const OUTCOME_STYLE = {
  "Done":       { bg: "var(--green-bg)", color: "var(--green)", bd: "var(--green-bd)" },
  "Carry over": { bg: "var(--amber-bg)", color: "var(--amber)", bd: "var(--amber-bd)" },
  "Blocked":    { bg: "var(--red-bg)",   color: "var(--red)",   bd: "var(--red-bd)"   },
};

const PRIORITIES = ["High", "Medium", "Low"];
const PRIORITY_STYLE = {
  "High":   { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "Medium": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Low":    { color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
};

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function calcPct(eodTasks) {
  if (!eodTasks?.length) return null;
  return Math.round(eodTasks.filter(t => t.outcome === "Done").length / eodTasks.length * 100);
}

// ── SOD read-only ─────────────────────────────────────────────────────────────
function SODReadOnly({ sod }) {
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <div className="field-label mb-8">Bandwidth</div>
        <div className="bw-row">
          {Object.entries(BANDWIDTH).map(([k, v]) => {
            const s = BW_STYLES[k];
            const sel = sod.bandwidth === +k;
            return (
              <div key={k} className="bw-chip"
                style={{ color: sel ? "#fff" : s.color, background: sel ? s.color : s.bg, borderColor: sel ? s.color : s.bd, cursor: "default" }}>
                {v.label}
              </div>
            );
          })}
        </div>
      </div>
      <div className="field-label mb-8">Tasks planned</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(sod.tasks || []).map((t, i) => (
          <div key={i} style={{ border: "0.5px solid var(--border)", borderRadius: 8, padding: "9px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              {t.client
                ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{t.client}</span>
                : <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>}
              <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{t.text || "—"}</span>
              {t.blocker?.trim() && (
                <span style={{ fontSize: 11, color: "var(--red)", background: "var(--red-bg)", padding: "2px 8px", borderRadius: 4, border: "0.5px solid var(--red-bd)" }}>
                  {t.blocker}
                </span>
              )}
            </div>
            {(t.startDate || t.dueDate) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {[["Start", t.startDate], ["Due", t.dueDate]].map(([lbl, val], di) => val ? (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    {di > 0 && <span style={{ color: "var(--faint)", fontSize: 10, marginRight: 6 }}>→</span>}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--surface)", padding: "2px 8px", borderRadius: 5, border: "0.5px solid var(--border)" }}>
                      <span style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{lbl}</span>
                      <span style={{ fontSize: 11, color: "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>{val}</span>
                    </div>
                  </div>
                ) : null)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TodayUpdate({ memberName }) {
  const { entries, saving, saveSOD, saveEOD, getTodayEntry, getStreak } = useHistory(memberName);
  const { todayTasks: recurringToday } = useRecurring(memberName);
  const { toast, show: showToast } = useToast();

  const todayEntry   = getTodayEntry();
  const sodData      = todayEntry?.sod || null;
  const eodData      = todayEntry?.eod || null;
  const sodSubmitted = !!sodData?.submittedAt;
  const eodSubmitted = !!eodData?.submittedAt;

  const [sodForm, setSODForm] = useState(emptySOD());
  const [eodForm, setEODForm] = useState({ tasks: [], ...emptyEOD() });
  const [eodExpanded, setEodExpanded] = useState(null);

  // Pre-fill SOD — if no SOD yet today, check yesterday's EOD for carry-overs
  useEffect(() => {
    if (sodData) {
      setSODForm({
        bandwidth: sodData.bandwidth || 3,
        tasks: sodData.tasks?.length
          ? sodData.tasks.map(t => ({ client: "", text: "", blocker: "", priority: "Medium", startDate: "", dueDate: "", ...t }))
          : [{ client: "", text: "", blocker: "", priority: "Medium", startDate: "", dueDate: "" }],
      });
    } else if (entries.length > 0) {
      // No SOD today — check yesterday's EOD for carry-over tasks
      const yesterday = entries.find(e => e.date !== TODAY && e.eod?.tasks?.length);
      if (yesterday) {
        const carryOvers = (yesterday.eod.tasks || []).filter(t => t.outcome === "Carry over" || t.carryOver);
        if (carryOvers.length) {
          setSODForm(f => ({
            ...f,
            tasks: carryOvers.map(t => ({
              client: t.client || "", text: t.text || "", blocker: "",
              priority: t.priority || "Medium", startDate: t.startDate || "", dueDate: t.dueDate || "",
              isCarryOver: true, carryOverFrom: yesterday.date,
            })),
          }));
        }
      }
    }
  }, [entries]);

  // Inject recurring tasks into SOD when not yet submitted
  useEffect(() => {
    if (sodData || !recurringToday.length) return;
    setSODForm(f => {
      const existingTexts = new Set(f.tasks.map(t => t.text?.trim()).filter(Boolean));
      const toAdd = recurringToday.filter(r => !existingTexts.has(r.text?.trim()));
      if (!toAdd.length) return f;
      const recurringTasks = toAdd.map(r => ({
        client: r.client || "", text: r.text || "", blocker: "",
        priority: r.priority || "Medium", startDate: TODAY, dueDate: TODAY,
        isRecurring: true, recurringId: r.id,
      }));
      const realTasks = f.tasks.filter(t => t.text?.trim());
      const empty     = f.tasks.filter(t => !t.text?.trim());
      return { ...f, tasks: [...recurringTasks, ...realTasks, ...(realTasks.length ? [] : empty)] };
    });
  }, [recurringToday, sodData]);

  // Pre-fill EOD from SOD — carry startDate/dueDate from SOD tasks
  useEffect(() => {
    if (sodSubmitted) {
      const sodTasks = sodData?.tasks || [];
      const existing = eodData?.tasks || [];
      const merged = sodTasks.map((t, i) => ({
        client:        t.client,
        text:          t.text,
        priority:      t.priority || "Medium",
        startDate:     t.startDate || "",
        dueDate:       t.dueDate   || "",
        fromSOD:       true,
        outcome:       existing[i]?.outcome       || "Done",
        carryOver:     existing[i]?.carryOver      ?? false,
        notes:         existing[i]?.notes          || "",
        blockerDetail: existing[i]?.blockerDetail  || "",
        blockerOwner:  existing[i]?.blockerOwner   || "",
        endDate:       existing[i]?.endDate        || "",
      }));
      const extras = existing.slice(sodTasks.length).map(t => ({ ...t, fromSOD: false }));
      setEODForm({ tasks: [...merged, ...extras] });
    }
  }, [entries]);

  // SOD helpers
  const addSODTask    = () => setSODForm(f => ({ ...f, tasks: [...f.tasks, { client: "", text: "", blocker: "", priority: "Medium", startDate: "", dueDate: "" }] }));
  const updateSODTask = (i, field, val) => setSODForm(f => ({ ...f, tasks: f.tasks.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const removeSODTask = (i) => setSODForm(f => ({ ...f, tasks: f.tasks.filter((_, idx) => idx !== i) }));

  // EOD helpers
  const updateEODTask = (i, field, val) => setEODForm(f => ({ ...f, tasks: f.tasks.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const addEODTask    = () => setEODForm(f => ({ ...f, tasks: [...f.tasks, { client: "", text: "", fromSOD: false, adhoc: true, priority: "Medium", startDate: TODAY, dueDate: "", outcome: "Done", carryOver: false, notes: "", blockerDetail: "", blockerOwner: "" }] }));
  const removeEODTask = (i) => setEODForm(f => ({ ...f, tasks: f.tasks.filter((_, idx) => idx !== i) }));

  const handleSaveSOD = async () => {
    if (!sodForm.tasks.some(t => t.text.trim())) { showToast("Add at least one task", "error"); return; }
    const ok = await saveSOD({ ...sodForm, submittedAt: Date.now() });
    showToast(ok ? "SOD submitted ✓" : "Save failed — try again", ok ? "success" : "error");
  };
  const handleSaveEOD = async () => {
    // Validate mandatory notes for carry-over and blocked tasks
    for (const t of eodForm.tasks) {
      if (t.outcome === "Carry over" && !t.notes?.trim()) {
        showToast("Please add a reason for carry-over tasks", "error"); return;
      }
      if (t.outcome === "Blocked" && !t.blockerDetail?.trim()) {
        showToast("Please describe the blocker for blocked tasks", "error"); return;
      }
    }
    // Auto-set endDate for Done tasks
    const tasksWithEnd = eodForm.tasks.map(t =>
      t.outcome === "Done" && !t.endDate ? { ...t, endDate: TODAY } : t
    );
    const ok = await saveEOD({ tasks: tasksWithEnd, submittedAt: Date.now() });
    showToast(ok ? "EOD submitted ✓" : "Save failed — try again", ok ? "success" : "error");
  };

  const streak     = getStreak();
  const pct        = calcPct(eodData?.tasks);
  const doneCount  = (eodData?.tasks || []).filter(t => t.outcome === "Done").length;
  const carryCount = (eodData?.tasks || []).filter(t => t.outcome === "Carry over").length;

  // Shared date strip style

  return (
    <div className="main-content">
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Today's update</div>
      <div className="text-sm text-muted mb-16">{fmt(TODAY)}</div>

      {/* Stats */}
      <div className="stats-grid stats-grid-4 mb-16">
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{streak}</div><div className="stat-label">Day streak</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{doneCount}</div><div className="stat-label">Done today</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--amber)" }}>{carryCount}</div><div className="stat-label">Carried over</div></div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--accent)", fontSize: pct != null ? 18 : 22 }}>
            {pct != null ? `${pct}%` : "—"}
          </div>
          <div className="stat-label">Completion</div>
        </div>
      </div>

      {/* ── SOD ── */}
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        {/* SOD header — dark navy */}
        <div style={{ background: "#1e1b4b", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: sodSubmitted ? "#6ee7b7" : "#fbbf24" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>Start of day</span>
            {sodSubmitted && (
              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "#c7d2fe" }}>
                Submitted · {fmtTime(sodData.submittedAt)}
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: "#6366f1" }}>
            {sodSubmitted ? "locked after submit" : "fill in at start of day"}
          </span>
        </div>

        <div style={{ padding: "12px 16px 0" }}>
          {sodSubmitted ? <SODReadOnly sod={sodData} /> : (
            <>
              <div className="field-label mb-8">Bandwidth — how loaded are you today?</div>
              <div className="bw-row mb-16">
                {Object.entries(BANDWIDTH).map(([k, v]) => {
                  const s = BW_STYLES[k];
                  const sel = sodForm.bandwidth === +k;
                  return (
                    <div key={k} className="bw-chip"
                      onClick={() => setSODForm(f => ({ ...f, bandwidth: +k }))}
                      style={{ color: sel ? "#fff" : s.color, background: sel ? s.color : s.bg, borderColor: sel ? s.color : s.bd }}>
                      {v.label}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mb-8">
                <div className="field-label">Tasks planned for today</div>
              </div>

              {/* Task table — flat Option B layout */}
              <div style={{ overflowX: "auto", marginBottom: 12 }}>
                <table className="task-table" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 115 }}>Client</th>
                      <th style={{ width: 100 }}>Priority</th>
                      <th style={{ minWidth: 260 }}>Task</th>
                      <th style={{ width: 120 }}>Start date</th>
                      <th style={{ width: 120 }}>Due date</th>
                      <th style={{ minWidth: 155 }}>Blocker / notes</th>
                      <th style={{ width: 28 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Recurring separator */}
                    {sodForm.tasks.some(t => t.isRecurring) && (
                      <tr>
                        <td colSpan={7} style={{ padding: "5px 10px", background: "#EEEDFE",
                          borderBottom: "0.5px solid #AFA9EC" }}>
                          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                            letterSpacing: "0.07em", color: "#534AB7" }}>
                            ↻ Recurring — auto added for today
                          </span>
                        </td>
                      </tr>
                    )}
                    {sodForm.tasks.map((t, i) => {
                      const ps = PRIORITY_STYLE[t.priority || "Medium"];
                      const isFirstProject = !t.isRecurring &&
                        sodForm.tasks.some(x => x.isRecurring) &&
                        sodForm.tasks.findIndex(x => !x.isRecurring) === i;
                      return (
                        <>
                          {isFirstProject && (
                            <tr>
                              <td colSpan={7} style={{ padding: "5px 10px",
                                background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
                                <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                                  letterSpacing: "0.07em", color: "var(--faint)" }}>
                                  Project tasks
                                </span>
                              </td>
                            </tr>
                          )}
                          <tr key={i} style={{ background: t.isRecurring ? "#EEEDFE20" : "transparent" }}>
                          <td>
                            <input className="task-cell-input" placeholder="Client..." value={t.client}
                              onChange={e => updateSODTask(i, "client", e.target.value)} />
                          </td>
                          <td>
                            <select value={t.priority || "Medium"}
                              onChange={e => updateSODTask(i, "priority", e.target.value)}
                              style={{ width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 6, border: `0.5px solid ${ps?.bd || "var(--border)"}`, background: ps?.bg || "var(--surface)", color: ps?.color || "var(--text)", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </td>
                          <td>
                            <input className="task-cell-input" placeholder="What are you working on?" value={t.text}
                              onChange={e => updateSODTask(i, "text", e.target.value)}
                              style={{ fontWeight: t.text ? 500 : 400 }} />
                          </td>
                          <td>
                            <input type="date" className="task-cell-input" value={t.startDate || ""}
                              onChange={e => updateSODTask(i, "startDate", e.target.value)}
                              style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
                          </td>
                          <td>
                            <input type="date" className="task-cell-input" value={t.dueDate || ""}
                              onChange={e => updateSODTask(i, "dueDate", e.target.value)}
                              style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
                          </td>
                          <td>
                            <input className="task-cell-input" value={t.blocker} placeholder="Leave blank if none"
                              onChange={e => updateSODTask(i, "blocker", e.target.value)}
                              style={{ fontSize: 11, ...(t.blocker?.trim() ? { color: "var(--red)", background: "var(--red-bg)", borderColor: "var(--red-bd)" } : { color: "var(--faint)", fontStyle: "italic" }) }} />
                          </td>
                          <td><div className="task-del" onClick={() => removeSODTask(i)}>×</div></td>
                          </tr>
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {!sodSubmitted && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "0.5px solid var(--border)", marginTop: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={addSODTask}>＋ Add task</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setSODForm(emptySOD())}>Clear</button>
              <button className="btn btn-primary" onClick={handleSaveSOD} disabled={saving}>
                {saving ? <><Spinner white /> Saving...</> : "Submit SOD"}
              </button>
            </div>
          </div>
        )}
        {sodSubmitted && <div style={{ height: 12 }} />}
      </div>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 16px" }}>
        <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
        <span style={{ fontSize: 10, fontWeight: 500, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>End of day</span>
        <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
      </div>

      {/* ── EOD ── */}
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {/* EOD header — dark green */}
        <div style={{ background: "#0f4c35", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: eodSubmitted ? "#6ee7b7" : "#fbbf24" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>End of day</span>
            {eodSubmitted && (
              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "#6ee7b7" }}>
                Submitted · {fmtTime(eodData.submittedAt)}
              </span>
            )}
            {!eodSubmitted && sodSubmitted && (
              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>Pending</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: "#6ee7b7" }}>
            {!sodSubmitted ? "submit SOD first" : eodSubmitted ? "you can still update before midnight" : "fill in before end of day"}
          </span>
        </div>

        {!sodSubmitted ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
            Submit your SOD first — EOD will unlock once you do.
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 16px 0" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                Update the status of each task — add notes or mark tasks added outside SOD
              </div>

              {/* EOD task table */}
              <div style={{ overflowX: "auto", marginBottom: 14 }}>
                <table className="task-table" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Client</th>
                      <th style={{ width: 95 }}>Priority</th>
                      <th style={{ minWidth: 220 }}>Task</th>
                      <th style={{ width: 115 }}>Outcome</th>
                      <th style={{ width: 108 }}>Start date</th>
                      <th style={{ width: 108 }}>Due date</th>
                      <th style={{ width: 108 }}>End date</th>
                      <th style={{ width: 28 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eodForm.tasks.map((t, i) => {
                      const s         = OUTCOME_STYLE[t.outcome] || OUTCOME_STYLE["Done"];
                      const isAdhoc   = !t.fromSOD;
                      const isDuePast = t.dueDate && t.dueDate < TODAY && t.outcome !== "Done";
                      const ps        = PRIORITY_STYLE[t.priority || "Medium"];
                      return (
                        <tr key={i} style={{ background: isAdhoc ? "#fffbeb" : "transparent" }}>
                          {/* Client */}
                          <td>
                            {isAdhoc
                              ? <input className="task-cell-input" placeholder="Client..." value={t.client}
                                  onChange={e => updateEODTask(i, "client", e.target.value)} />
                              : t.client
                                ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{t.client}</span>
                                : <span style={{ color: "var(--faint)" }}>—</span>}
                          </td>
                          {/* Priority */}
                          <td>
                            {isAdhoc
                              ? <select value={t.priority || "Medium"}
                                  onChange={e => updateEODTask(i, "priority", e.target.value)}
                                  style={{ width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 6, border: `0.5px solid ${ps?.bd}`, background: ps?.bg, color: ps?.color, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              : ps && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500, color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}` }}>{t.priority}</span>}
                          </td>
                          {/* Task */}
                          <td>
                            {isAdhoc
                              ? <input className="task-cell-input" placeholder="What did you work on?" value={t.text}
                                  onChange={e => updateEODTask(i, "text", e.target.value)}
                                  style={{ fontWeight: t.text ? 500 : 400 }} />
                              : <span style={{ fontSize: 12, fontWeight: 500 }}>{t.text || "—"}</span>}
                          </td>
                          {/* Outcome */}
                          <td>
                            <select value={t.outcome}
                              onChange={e => { const v = e.target.value; updateEODTask(i, "outcome", v); updateEODTask(i, "carryOver", v === "Carry over"); }}
                              style={{ width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 6, border: `0.5px solid ${s.bd}`, background: s.bg, color: s.color, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                              {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                          {/* Start date */}
                          <td>
                            {isAdhoc
                              ? <input type="date" className="task-cell-input" value={t.startDate || ""}
                                  onChange={e => updateEODTask(i, "startDate", e.target.value)}
                                  style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
                              : <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted)" }}>{t.startDate || <span style={{ color: "var(--faint)" }}>—</span>}</span>}
                          </td>
                          {/* Due date */}
                          <td>
                            {isAdhoc
                              ? <input type="date" className="task-cell-input" value={t.dueDate || ""}
                                  onChange={e => updateEODTask(i, "dueDate", e.target.value)}
                                  style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
                              : <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: isDuePast ? 500 : 400, color: isDuePast ? "var(--red)" : "var(--muted)", background: isDuePast ? "var(--red-bg)" : "transparent", padding: isDuePast ? "1px 6px" : 0, borderRadius: isDuePast ? 4 : 0 }}>
                                  {t.dueDate || <span style={{ color: "var(--faint)" }}>—</span>}
                                  {isDuePast && " ⚠"}
                                </span>}
                          </td>
                          {/* End date */}
                          <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
                            {t.outcome === "Done"
                              ? <span style={{ color: "var(--green)", fontWeight: 500 }}>{t.endDate || TODAY}</span>
                              : <span style={{ color: "var(--faint)" }}>—</span>}
                          </td>
                          {/* Delete — only for ad-hoc */}
                          <td>{isAdhoc && <div className="task-del" onClick={() => removeEODTask(i)}>×</div>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Carry-over mandatory notes + Blocked detail — rendered below table */}
              {eodForm.tasks.some(t => t.outcome === "Carry over" || t.outcome === "Blocked") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {eodForm.tasks.map((t, i) => {
                    if (t.outcome === "Carry over") return (
                      <div key={i} style={{ padding: "10px 12px", background: "var(--amber-bg)", borderRadius: 7, border: "0.5px solid var(--amber-bd)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                          {t.client && <span className="badge badge-blue" style={{ fontSize: 10 }}>{t.client}</span>}
                          <span style={{ fontSize: 11, fontWeight: 500, flex: 1 }}>{t.text}</span>
                          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--amber)" }}>Why carry over?</span>
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "var(--amber)", color: "#fff", fontWeight: 500 }}>required</span>
                        </div>
                        <textarea className="field-input" rows={2}
                          placeholder="Why wasn't this completed today? e.g. blocked waiting for feedback, ran out of time..."
                          value={t.notes}
                          onChange={e => updateEODTask(i, "notes", e.target.value)}
                          style={{ marginBottom: 0, borderColor: t.notes?.trim() ? "var(--amber-bd)" : "var(--red-bd)", background: t.notes?.trim() ? "var(--amber-bg)" : "#fff" }} />
                      </div>
                    );
                    if (t.outcome === "Blocked") return (
                      <div key={i} style={{ padding: "10px 12px", background: "var(--red-bg)", borderRadius: 7, border: "0.5px solid var(--red-bd)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          {t.client && <span className="badge badge-blue" style={{ fontSize: 10 }}>{t.client}</span>}
                          <span style={{ fontSize: 11, fontWeight: 500, flex: 1 }}>{t.text}</span>
                          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--red)" }}>Blocker detail</span>
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "var(--red)", color: "#fff", fontWeight: 500 }}>required</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--red)", marginBottom: 4 }}>What is blocking this?</div>
                            <textarea className="field-input" rows={2}
                              placeholder="Describe what is blocking this task..."
                              value={t.blockerDetail}
                              onChange={e => updateEODTask(i, "blockerDetail", e.target.value)}
                              style={{ marginBottom: 0, borderColor: t.blockerDetail?.trim() ? "var(--red-bd)" : "var(--red)" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--red)", marginBottom: 4 }}>Who / what needs to resolve it?</div>
                            <input className="task-cell-input"
                              placeholder="e.g. Infra team, awaiting design approval..."
                              value={t.blockerOwner}
                              onChange={e => updateEODTask(i, "blockerOwner", e.target.value)}
                              style={{ borderColor: t.blockerOwner?.trim() ? "var(--red-bd)" : "var(--red)" }} />
                          </div>
                        </div>
                      </div>
                    );
                    return null;
                  })}
                </div>
              )}



              {/* Completion bar */}
              {eodForm.tasks.length > 0 && (() => {
                const done  = eodForm.tasks.filter(t => t.outcome === "Done").length;
                const total = eodForm.tasks.length;
                const p     = Math.round(done / total * 100);
                return (
                  <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--surface)", borderRadius: 8, border: "0.5px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Completion</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: p === 100 ? "var(--green)" : "var(--accent)" }}>{done} / {total} tasks ({p}%)</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: p === 100 ? "var(--green)" : "var(--accent)", width: `${p}%`, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })()}


            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "0.5px solid var(--border)", marginTop: 4 }}>
<button className="btn btn-ghost btn-sm" onClick={addEODTask}>＋ Add task</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEODForm(f => ({ ...f, tasks: f.tasks.map(t => ({ ...t, outcome: "Done", notes: "", blockerDetail: "", blockerOwner: "" })) }))}>Reset outcomes</button>
              <button className="btn btn-primary" onClick={handleSaveEOD} disabled={saving}
                style={{ background: "var(--green)", borderColor: "var(--green)" }}>
                {saving ? <><Spinner white /> Saving...</> : eodSubmitted ? "Update EOD" : "Submit EOD"}
              </button>
            </div>
            </div>
          </>
        )}
      </div>

      <Toast message={toast?.msg} type={toast?.type} />
    </div>
  );
}
