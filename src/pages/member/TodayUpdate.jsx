import { useState, useEffect } from "react";
import { BwBadge, StatusBadge, ClientBadge, Spinner, Toast, useToast } from "../../components/index.jsx";
import { BANDWIDTH, BW_STYLES, TASK_STATUS, STATUS_STYLES, emptyForm } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { useHistory } from "../../hooks/useHistory";

export default function TodayUpdate({ memberName }) {
  const { entries, saving, save, getTodayEntry, getStreak } = useHistory(memberName);
  const [form, setForm] = useState(emptyForm());
  const { toast, show: showToast } = useToast();

  const todayEntry = getTodayEntry();
  const submitted = !!todayEntry;

  // Pre-fill form if today's entry exists
  useEffect(() => {
    if (todayEntry) {
      setForm({
        yesterday: todayEntry.yesterday || "",
        today:     todayEntry.today     || "",
        blockers:  todayEntry.blockers  || "",
        bandwidth: todayEntry.bandwidth || 3,
        note:      todayEntry.note      || "",
        tasks:     todayEntry.tasks?.length
          ? todayEntry.tasks
          : [{ client: "", text: "", status: "In Progress" }],
      });
    }
  }, [entries]);

  const addTask = () => setForm(f => ({
    ...f, tasks: [...f.tasks, { client: "", text: "", status: "In Progress" }]
  }));

  const updateTask = (i, field, val) => setForm(f => ({
    ...f, tasks: f.tasks.map((t, idx) => idx === i ? { ...t, [field]: val } : t)
  }));

  const removeTask = (i) => setForm(f => ({
    ...f, tasks: f.tasks.filter((_, idx) => idx !== i)
  }));

  const handleSave = async () => {
    if (!form.yesterday.trim()) { showToast("Please fill in 'Yesterday' field", "error"); return; }
    const ok = await save(form);
    showToast(ok ? "Update saved ✓" : "Save failed — please try again", ok ? "success" : "error");
  };

  const doneTasks = (todayEntry?.tasks || []).filter(t => t.status === "Done").length;
  const blockedTasks = (todayEntry?.tasks || []).filter(t => t.status === "Blocked").length;
  const clients = [...new Set((todayEntry?.tasks || []).map(t => t.client).filter(Boolean))].length;

  return (
    <div className="main-content">
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Today's update</div>
      <div className="text-sm text-muted mb-16">{fmt(TODAY)}</div>

      {/* Stats */}
      <div className="stats-grid stats-grid-4 mb-16">
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{entries.length}</div><div className="stat-label">Total updates</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{doneTasks}</div><div className="stat-label">Done today</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{blockedTasks}</div><div className="stat-label">Blocked</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--amber)" }}>{clients}</div><div className="stat-label">Clients today</div></div>
      </div>

      {/* Form */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Standup form</span>
          <span className="card-meta">{submitted ? "✓ Submitted — editing" : "Not yet submitted"}</span>
        </div>
        <div className="card-body">
          <div className="form-grid-2">
            <div className="field">
              <label className="field-label">Yesterday — what did you complete?</label>
              <textarea className="field-input" rows={3} placeholder="Describe what you worked on yesterday..."
                value={form.yesterday} onChange={e => setForm(f => ({ ...f, yesterday: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Today — what are you working on?</label>
              <textarea className="field-input" rows={3} placeholder="Describe your plan for today..."
                value={form.today} onChange={e => setForm(f => ({ ...f, today: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">⚑ Blockers / dependencies</label>
              <textarea className="field-input" rows={2} placeholder="Any blockers? Leave blank if none."
                style={form.blockers ? { background: "var(--red-bg)", borderColor: "var(--red-bd)", color: "var(--red)" } : {}}
                value={form.blockers} onChange={e => setForm(f => ({ ...f, blockers: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Notes for manager</label>
              <textarea className="field-input" rows={2} placeholder="Anything your manager should know..."
                value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>

          {/* Bandwidth */}
          <div className="field-label mb-8">Bandwidth — how loaded are you today?</div>
          <div className="bw-row mb-16">
            {Object.entries(BANDWIDTH).map(([k, v]) => {
              const s = BW_STYLES[k];
              const sel = form.bandwidth === +k;
              return (
                <div key={k} className="bw-chip" onClick={() => setForm(f => ({ ...f, bandwidth: +k }))}
                  style={{ color: sel ? "#fff" : s.color, background: sel ? s.color : s.bg, borderColor: sel ? s.color : s.bd }}>
                  {v.label}
                </div>
              );
            })}
          </div>

          {/* Tasks */}
          <div className="flex items-center justify-between mb-8">
            <div className="field-label">Today's tasks</div>
            <button className="btn btn-ghost btn-sm" onClick={addTask}>＋ Add task</button>
          </div>
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>Client</th>
                <th style={{ width: "48%" }}>Task</th>
                <th style={{ width: "22%" }}>Status</th>
                <th style={{ width: "8%" }}></th>
              </tr>
            </thead>
            <tbody>
              {form.tasks.map((t, i) => (
                <tr key={i}>
                  <td>
                    <input className="task-cell-input" placeholder="Client name..." value={t.client}
                      onChange={e => updateTask(i, "client", e.target.value)} />
                  </td>
                  <td>
                    <input className="task-cell-input" placeholder="Task description..." value={t.text}
                      onChange={e => updateTask(i, "text", e.target.value)} />
                  </td>
                  <td>
                    <select className="task-status-select" value={t.status}
                      style={{ color: STATUS_STYLES[t.status]?.color }}
                      onChange={e => updateTask(i, "status", e.target.value)}>
                      {TASK_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><div className="task-del" onClick={() => removeTask(i)}>×</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="submit-row">
          <button className="btn btn-ghost" onClick={() => setForm(emptyForm())}>Clear</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><Spinner white /> Saving...</> : submitted ? "Update entry" : "Submit update"}
          </button>
        </div>
      </div>

      <Toast message={toast?.msg} type={toast?.type} />
    </div>
  );
}
