import { useState, useEffect } from "react";
import { Spinner, Toast, useToast } from "../../components/index.jsx";
import { BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { useHistory } from "../../hooks/useHistory";

const emptySOD = () => ({
  bandwidth: 3,
  tasks: [{ client: "", text: "", blocker: "N/A" }],
});

const emptyEOD = () => ({
  notCompleted: "",
  tomorrowFocus: "",
});

const OUTCOMES = ["Done", "Carry over", "Blocked"];

const OUTCOME_STYLE = {
  "Done":       { bg: "var(--green-bg)",  color: "var(--green)",  bd: "var(--green-bd)"  },
  "Carry over": { bg: "var(--amber-bg)",  color: "var(--amber)",  bd: "var(--amber-bd)"  },
  "Blocked":    { bg: "var(--red-bg)",    color: "var(--red)",    bd: "var(--red-bd)"    },
};

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function calcPct(eodTasks) {
  if (!eodTasks?.length) return null;
  return Math.round(eodTasks.filter(t => t.outcome === "Done").length / eodTasks.length * 100);
}

// ── SOD read-only view ───────────────────────────────────────────────────────
function SODReadOnly({ sod }) {
  return (
    <>
      <div className="field-label mb-8">Bandwidth</div>
      <div className="bw-row mb-16">
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
      <div className="field-label mb-8">Tasks planned</div>
      <table className="task-table">
        <thead>
          <tr>
            <th style={{ width: "20%" }}>Client</th>
            <th style={{ width: "44%" }}>Task</th>
            <th style={{ width: "36%" }}>Blockers / notes</th>
          </tr>
        </thead>
        <tbody>
          {(sod.tasks || []).map((t, i) => (
            <tr key={i}>
              <td>{t.client
                ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{t.client}</span>
                : <span style={{ color: "var(--faint)", fontSize: 12 }}>—</span>}
              </td>
              <td style={{ fontSize: 12 }}>{t.text || "—"}</td>
              <td>
                {t.blocker && t.blocker !== "N/A"
                  ? <span style={{ fontSize: 11, color: "var(--red)", background: "var(--red-bg)", padding: "2px 8px", borderRadius: 4, border: "0.5px solid var(--red-bd)" }}>{t.blocker}</span>
                  : <span style={{ fontSize: 11, color: "var(--faint)", fontStyle: "italic" }}>N/A</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function TodayUpdate({ memberName }) {
  const { entries, saving, saveSOD, saveEOD, getTodayEntry, getStreak } = useHistory(memberName);
  const { toast, show: showToast } = useToast();

  const todayEntry   = getTodayEntry();
  const sodData      = todayEntry?.sod  || null;
  const eodData      = todayEntry?.eod  || null;
  const sodSubmitted = !!sodData?.submittedAt;
  const eodSubmitted = !!eodData?.submittedAt;

  const [sodForm, setSODForm] = useState(emptySOD());
  const [eodForm, setEODForm] = useState({ tasks: [], ...emptyEOD() });

  // Pre-fill SOD
  useEffect(() => {
    if (sodData) {
      setSODForm({
        bandwidth: sodData.bandwidth || 3,
        tasks: sodData.tasks?.length ? sodData.tasks : [{ client: "", text: "", blocker: "N/A" }],
      });
    }
  }, [entries]);

  // Pre-fill EOD from SOD tasks
  useEffect(() => {
    if (sodData?.tasks?.length) {
      const existing = eodData?.tasks || [];
      setEODForm({
        tasks: sodData.tasks.map((t, i) => ({
          client:    t.client,
          text:      t.text,
          outcome:   existing[i]?.outcome  || "Done",
          carryOver: existing[i]?.carryOver ?? false,
        })),
        notCompleted:  eodData?.notCompleted  || "",
        tomorrowFocus: eodData?.tomorrowFocus || "",
      });
    }
  }, [entries]);

  // SOD task helpers
  const addSODTask    = () => setSODForm(f => ({ ...f, tasks: [...f.tasks, { client: "", text: "", blocker: "N/A" }] }));
  const updateSODTask = (i, field, val) => setSODForm(f => ({ ...f, tasks: f.tasks.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const removeSODTask = (i) => setSODForm(f => ({ ...f, tasks: f.tasks.filter((_, idx) => idx !== i) }));

  // EOD task helpers
  const updateEODTask = (i, field, val) => setEODForm(f => ({ ...f, tasks: f.tasks.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));

  const handleSaveSOD = async () => {
    if (!sodForm.tasks.some(t => t.text.trim())) { showToast("Add at least one task", "error"); return; }
    const ok = await saveSOD({ ...sodForm, submittedAt: Date.now() });
    showToast(ok ? "SOD submitted ✓" : "Save failed — try again", ok ? "success" : "error");
  };

  const handleSaveEOD = async () => {
    const ok = await saveEOD({ ...eodForm, submittedAt: Date.now() });
    showToast(ok ? "EOD submitted ✓" : "Save failed — try again", ok ? "success" : "error");
  };

  // Stats
  const streak     = getStreak();
  const pct        = calcPct(eodData?.tasks);
  const doneCount  = (eodData?.tasks || []).filter(t => t.outcome === "Done").length;
  const carryCount = (eodData?.tasks || []).filter(t => t.outcome === "Carry over").length;

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

      {/* ── SOD Card ── */}
      <div className="card mb-16">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="card-title">Start of day</span>
            {sodSubmitted && (
              <span className="badge badge-green" style={{ fontSize: 10 }}>
                Submitted · {fmtTime(sodData.submittedAt)}
              </span>
            )}
          </div>
          <span className="card-meta">
            {sodSubmitted ? "read only — locked after submit" : "fill in at start of day"}
          </span>
        </div>

        <div className="card-body">
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
              <table className="task-table">
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Client</th>
                    <th style={{ width: "42%" }}>Task</th>
                    <th style={{ width: "30%" }}>Blockers / notes</th>
                    <th style={{ width: "8%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sodForm.tasks.map((t, i) => (
                    <tr key={i}>
                      <td>
                        <input className="task-cell-input" placeholder="Client..." value={t.client}
                          onChange={e => updateSODTask(i, "client", e.target.value)} />
                      </td>
                      <td>
                        <input className="task-cell-input" placeholder="Task description..." value={t.text}
                          onChange={e => updateSODTask(i, "text", e.target.value)} />
                      </td>
                      <td>
                        <input className="task-cell-input"
                          value={t.blocker}
                          placeholder="N/A"
                          onChange={e => updateSODTask(i, "blocker", e.target.value)}
                          onFocus={e => { if (e.target.value === "N/A") updateSODTask(i, "blocker", ""); }}
                          onBlur={e => { if (!e.target.value.trim()) updateSODTask(i, "blocker", "N/A"); }}
                          style={t.blocker && t.blocker !== "N/A"
                            ? { color: "var(--red)", background: "var(--red-bg)", borderColor: "var(--red-bd)" }
                            : { color: "var(--faint)", fontStyle: "italic" }}
                        />
                      </td>
                      <td><div className="task-del" onClick={() => removeSODTask(i)}>×</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {!sodSubmitted && (
          <div className="submit-row">
            <button className="btn btn-ghost" onClick={() => setSODForm(emptySOD())}>Clear</button>
            <button className="btn btn-primary" onClick={handleSaveSOD} disabled={saving}>
              {saving ? <><Spinner white /> Saving...</> : "Submit SOD"}
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
        <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
        <span style={{ fontSize: 10, fontWeight: 500, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          End of day
        </span>
        <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
      </div>

      {/* ── EOD Card ── */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="card-title">End of day</span>
            {eodSubmitted && (
              <span className="badge badge-green" style={{ fontSize: 10 }}>
                Submitted · {fmtTime(eodData.submittedAt)}
              </span>
            )}
            {!eodSubmitted && sodSubmitted && (
              <span className="badge badge-amber" style={{ fontSize: 10 }}>Pending</span>
            )}
          </div>
          <span className="card-meta">
            {!sodSubmitted ? "submit SOD first"
              : eodSubmitted ? "you can still update before midnight"
              : "fill in before end of day"}
          </span>
        </div>

        {!sodSubmitted ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
            Submit your SOD first — EOD will unlock once you do.
          </div>
        ) : (
          <>
            <div className="card-body">
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                Update the status of each task you planned this morning
              </div>

              {/* EOD task list */}
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px", gap: 8, padding: "6px 10px", background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
                  <div className="field-label" style={{ margin: 0 }}>Task</div>
                  <div className="field-label" style={{ margin: 0 }}>Outcome</div>
                  <div className="field-label" style={{ margin: 0 }}>Carry over?</div>
                </div>
                {eodForm.tasks.map((t, i) => {
                  const s = OUTCOME_STYLE[t.outcome] || OUTCOME_STYLE["Done"];
                  return (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "1fr 100px 80px", gap: 8,
                      alignItems: "center", padding: "8px 10px",
                      borderBottom: i < eodForm.tasks.length - 1 ? "0.5px solid var(--border)" : "none",
                    }}>
                      <div>
                        {t.client && <span className="badge badge-blue" style={{ fontSize: 10, marginRight: 5 }}>{t.client}</span>}
                        <span style={{ fontSize: 12 }}>{t.text || "—"}</span>
                      </div>
                      <select
                        value={t.outcome}
                        onChange={e => {
                          const v = e.target.value;
                          updateEODTask(i, "outcome", v);
                          updateEODTask(i, "carryOver", v === "Carry over");
                        }}
                        style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: `0.5px solid ${s.bd}`, background: s.bg, color: s.color, fontWeight: 500, cursor: "pointer" }}>
                        {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <div style={{ fontSize: 12, color: t.carryOver ? "var(--amber)" : "var(--faint)", fontWeight: t.carryOver ? 500 : 400, paddingLeft: 4 }}>
                        {t.carryOver ? "Yes" : "No"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live completion bar */}
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
                  <textarea className="field-input" rows={3}
                    placeholder="Brief reason for any carry-overs or blocked tasks..."
                    value={eodForm.notCompleted}
                    onChange={e => setEODForm(f => ({ ...f, notCompleted: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">
                    Tomorrow's focus
                    <span style={{ fontWeight: 400, color: "var(--faint)", marginLeft: 4 }}>(pre-fills next SOD)</span>
                  </label>
                  <textarea className="field-input" rows={3}
                    placeholder="What will you prioritise tomorrow?"
                    value={eodForm.tomorrowFocus}
                    onChange={e => setEODForm(f => ({ ...f, tomorrowFocus: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="submit-row">
              <button className="btn btn-ghost"
                onClick={() => setEODForm(f => ({ ...f, notCompleted: "", tomorrowFocus: "" }))}>
                Clear
              </button>
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
