import { useState, useEffect } from "react";
import { Spinner, Toast, useToast } from "../../components/index.jsx";
import { BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { useHistory } from "../../hooks/useHistory";

const emptySOD = () => ({
  bandwidth: 3,
  tasks: [{ client: "", text: "", blocker: "N/A", startDate: "", dueDate: "", endDate: "" }],
});

const emptyEOD = () => ({ notCompleted: "", tomorrowFocus: "" });

const OUTCOMES = ["Done", "Carry over", "Blocked"];
const OUTCOME_STYLE = {
  "Done":       { bg: "var(--green-bg)", color: "var(--green)", bd: "var(--green-bd)" },
  "Carry over": { bg: "var(--amber-bg)", color: "var(--amber)", bd: "var(--amber-bd)" },
  "Blocked":    { bg: "var(--red-bg)",   color: "var(--red)",   bd: "var(--red-bd)"   },
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
              {t.blocker && t.blocker !== "N/A" && (
                <span style={{ fontSize: 11, color: "var(--red)", background: "var(--red-bg)", padding: "2px 8px", borderRadius: 4, border: "0.5px solid var(--red-bd)" }}>
                  {t.blocker}
                </span>
              )}
            </div>
            {(t.startDate || t.dueDate || t.endDate) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {[["Start", t.startDate], ["Due", t.dueDate], ["End", t.endDate]].map(([lbl, val], di) => val ? (
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
  const { toast, show: showToast } = useToast();

  const todayEntry   = getTodayEntry();
  const sodData      = todayEntry?.sod || null;
  const eodData      = todayEntry?.eod || null;
  const sodSubmitted = !!sodData?.submittedAt;
  const eodSubmitted = !!eodData?.submittedAt;

  const [sodForm, setSODForm] = useState(emptySOD());
  const [eodForm, setEODForm] = useState({ tasks: [], ...emptyEOD() });
  const [eodExpanded, setEodExpanded] = useState(null);

  // Pre-fill SOD
  useEffect(() => {
    if (sodData) {
      setSODForm({
        bandwidth: sodData.bandwidth || 3,
        tasks: sodData.tasks?.length
          ? sodData.tasks.map(t => ({ client: "", text: "", blocker: "N/A", startDate: "", dueDate: "", endDate: "", ...t }))
          : [{ client: "", text: "", blocker: "N/A", startDate: "", dueDate: "", endDate: "" }],
      });
    }
  }, [entries]);

  // Pre-fill EOD from SOD
  useEffect(() => {
    if (sodSubmitted) {
      const sodTasks = sodData?.tasks || [];
      const existing = eodData?.tasks || [];
      const merged = sodTasks.map((t, i) => ({
        client: t.client, text: t.text, fromSOD: true,
        outcome:   existing[i]?.outcome   || "Done",
        carryOver: existing[i]?.carryOver ?? false,
        notes:     existing[i]?.notes     || "",
      }));
      const extras = existing.slice(sodTasks.length).map(t => ({ ...t, fromSOD: false }));
      setEODForm({
        tasks:         [...merged, ...extras],
        notCompleted:  eodData?.notCompleted  || "",
        tomorrowFocus: eodData?.tomorrowFocus || "",
      });
    }
  }, [entries]);

  // SOD helpers
  const addSODTask    = () => setSODForm(f => ({ ...f, tasks: [...f.tasks, { client: "", text: "", blocker: "N/A", startDate: "", dueDate: "", endDate: "" }] }));
  const updateSODTask = (i, field, val) => setSODForm(f => ({ ...f, tasks: f.tasks.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const removeSODTask = (i) => setSODForm(f => ({ ...f, tasks: f.tasks.filter((_, idx) => idx !== i) }));

  // EOD helpers
  const updateEODTask = (i, field, val) => setEODForm(f => ({ ...f, tasks: f.tasks.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const addEODTask    = () => setEODForm(f => ({ ...f, tasks: [...f.tasks, { client: "", text: "", fromSOD: false, outcome: "Done", carryOver: false, notes: "" }] }));
  const removeEODTask = (i) => setEODForm(f => ({ ...f, tasks: f.tasks.filter((_, idx) => idx !== i) }));

  const handleSaveSOD = async () => {
    if (!sodForm.tasks.some(t => t.text.trim())) { showToast("Add at least one task", "error"); return; }
    const ok = await saveSOD({ ...sodForm, submittedAt: Date.now() });
    showToast(ok ? "SOD submitted ✓" : "Save failed — try again", ok ? "success" : "error");
  };
  const handleSaveEOD = async () => {
    const ok = await saveEOD({ ...eodForm, submittedAt: Date.now() });
    showToast(ok ? "EOD submitted ✓" : "Save failed — try again", ok ? "success" : "error");
  };

  const streak     = getStreak();
  const pct        = calcPct(eodData?.tasks);
  const doneCount  = (eodData?.tasks || []).filter(t => t.outcome === "Done").length;
  const carryCount = (eodData?.tasks || []).filter(t => t.outcome === "Carry over").length;

  // Shared date strip style
  const datePillStyle = { display: "flex", alignItems: "center", gap: 4, background: "var(--surface)", padding: "3px 8px", borderRadius: 5, border: "0.5px solid var(--border)" };
  const dateLblStyle  = { fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.06em" };
  const dateInputStyle = { border: "none", background: "transparent", padding: 0, fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--text)", outline: "none", width: 94 };

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
                <button className="btn btn-ghost btn-sm" onClick={addSODTask}>＋ Add task</button>
              </div>

              {/* Task cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {sodForm.tasks.map((t, i) => (
                  <div key={i} style={{ border: "0.5px solid var(--border)", borderRadius: 8, padding: "9px 10px" }}>
                    {/* Row 1: client + task name + delete */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <input className="task-cell-input" placeholder="Client..." value={t.client}
                        onChange={e => updateSODTask(i, "client", e.target.value)}
                        style={{ width: 90, flexShrink: 0 }} />
                      <input className="task-cell-input" placeholder="Task description..." value={t.text}
                        onChange={e => updateSODTask(i, "text", e.target.value)}
                        style={{ flex: 1, fontWeight: t.text ? 500 : 400 }} />
                      <div className="task-del" onClick={() => removeSODTask(i)}>×</div>
                    </div>
                    {/* Row 2: date strip + blockers */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {[["Start", "startDate"], ["Due", "dueDate"], ["End", "endDate"]].map(([lbl, field], di) => (
                        <div key={field} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                          {di > 0 && <span style={{ color: "var(--faint)", fontSize: 11, marginRight: 6 }}>→</span>}
                          <div style={datePillStyle}>
                            <span style={dateLblStyle}>{lbl}</span>
                            <input type="date" value={t[field] || ""} onChange={e => updateSODTask(i, field, e.target.value)} style={dateInputStyle} />
                          </div>
                        </div>
                      ))}
                      {/* Blocker inline */}
                      <div style={{ marginLeft: "auto" }}>
                        <input className="task-cell-input" value={t.blocker} placeholder="N/A"
                          onChange={e => updateSODTask(i, "blocker", e.target.value)}
                          onFocus={e => { if (e.target.value === "N/A") updateSODTask(i, "blocker", ""); }}
                          onBlur={e => { if (!e.target.value.trim()) updateSODTask(i, "blocker", "N/A"); }}
                          style={{
                            width: 160, fontSize: 11,
                            ...(t.blocker && t.blocker !== "N/A"
                              ? { color: "var(--red)", background: "var(--red-bg)", borderColor: "var(--red-bd)" }
                              : { color: "var(--faint)", fontStyle: "italic" })
                          }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {!sodSubmitted && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "0.5px solid var(--border)", marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => setSODForm(emptySOD())}>Clear</button>
            <button className="btn btn-primary" onClick={handleSaveSOD} disabled={saving}>
              {saving ? <><Spinner white /> Saving...</> : "Submit SOD"}
            </button>
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

              {/* EOD task list */}
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 60px 28px", gap: 8, padding: "6px 10px", background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
                  <div className="field-label" style={{ margin: 0 }}>Task</div>
                  <div className="field-label" style={{ margin: 0 }}>Outcome</div>
                  <div className="field-label" style={{ margin: 0 }}>Notes</div>
                  <div />
                </div>
                {eodForm.tasks.map((t, i) => {
                  const s       = OUTCOME_STYLE[t.outcome] || OUTCOME_STYLE["Done"];
                  const isExtra = !t.fromSOD;
                  const expanded = eodExpanded === i;
                  return (
                    <div key={i}>
                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 110px 60px 28px", gap: 8,
                        alignItems: "center", padding: "8px 10px",
                        borderBottom: "0.5px solid var(--border)",
                        background: isExtra ? "var(--amber-bg)" : "transparent",
                      }}>
                        <div>
                          {isExtra ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <input className="task-cell-input" placeholder="Client..." value={t.client}
                                onChange={e => updateEODTask(i, "client", e.target.value)} style={{ width: 80 }} />
                              <input className="task-cell-input" placeholder="Task description..."
                                value={t.text} onChange={e => updateEODTask(i, "text", e.target.value)} />
                            </div>
                          ) : (
                            <div>
                              {t.client && <span className="badge badge-blue" style={{ fontSize: 10, marginRight: 5 }}>{t.client}</span>}
                              <span style={{ fontSize: 12 }}>{t.text || "—"}</span>
                            </div>
                          )}
                        </div>
                        <select value={t.outcome}
                          onChange={e => { const v = e.target.value; updateEODTask(i, "outcome", v); updateEODTask(i, "carryOver", v === "Carry over"); }}
                          style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: `0.5px solid ${s.bd}`, background: s.bg, color: s.color, fontWeight: 500, cursor: "pointer" }}>
                          {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => setEodExpanded(expanded ? null : i)}
                          style={{ fontSize: 10, padding: "3px 6px", color: t.notes ? "var(--accent)" : "var(--faint)" }}>
                          {t.notes ? "Notes ✓" : "Notes"}
                        </button>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          {isExtra
                            ? <div className="task-del" onClick={() => removeEODTask(i)}>×</div>
                            : <div style={{ width: 20 }} />}
                        </div>
                      </div>
                      {expanded && (
                        <div style={{ padding: "8px 10px", borderBottom: "0.5px solid var(--border)", background: "var(--surface)" }}>
                          <textarea className="field-input" rows={2}
                            placeholder="Add notes, blockers, or context for this task..."
                            value={t.notes} onChange={e => updateEODTask(i, "notes", e.target.value)}
                            style={{ marginBottom: 0 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ padding: "8px 10px" }}>
                  <button className="btn btn-ghost btn-sm" onClick={addEODTask} style={{ fontSize: 11, color: "var(--muted)" }}>
                    ＋ Add task not in SOD
                  </button>
                </div>
              </div>

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

              {/* Text fields */}
              <div className="form-grid-2">
                <div className="field">
                  <label className="field-label">What wasn't completed and why?</label>
                  <textarea className="field-input" rows={3} placeholder="Brief reason for any carry-overs or blocked tasks..."
                    value={eodForm.notCompleted} onChange={e => setEODForm(f => ({ ...f, notCompleted: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">
                    Tomorrow's focus
                    <span style={{ fontWeight: 400, color: "var(--faint)", marginLeft: 4 }}>(pre-fills next SOD)</span>
                  </label>
                  <textarea className="field-input" rows={3} placeholder="What will you prioritise tomorrow?"
                    value={eodForm.tomorrowFocus} onChange={e => setEODForm(f => ({ ...f, tomorrowFocus: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "0.5px solid var(--border)", marginTop: 4 }}>
              <button className="btn btn-ghost" onClick={() => setEODForm(f => ({ ...f, notCompleted: "", tomorrowFocus: "" }))}>Clear</button>
              <button className="btn btn-primary" onClick={handleSaveEOD} disabled={saving}
                style={{ background: "var(--green)", borderColor: "var(--green)" }}>
                {saving ? <><Spinner white /> Saving...</> : eodSubmitted ? "Update EOD" : "Submit EOD"}
              </button>
            </div>
          </>
        )}
      </div>

      <Toast message={toast?.msg} type={toast?.type} />
    </div>
  );
}
