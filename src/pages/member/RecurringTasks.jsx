import { useState } from "react";
import { useRecurring, scheduleLabel } from "../../hooks/useRecurring";
import { Loading } from "../../components/index.jsx";

const PRIORITIES = ["High", "Medium", "Low"];
const PRIORITY_STYLE = {
  "High":   { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "Medium": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Low":    { color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
};
const DAYS_OF_WEEK = [
  { label: "Sun", value: 0 }, { label: "Mon", value: 1 },
  { label: "Tue", value: 2 }, { label: "Wed", value: 3 },
  { label: "Thu", value: 4 }, { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

const emptyForm = () => ({
  client: "", text: "", priority: "Medium",
  schedule: "daily", days: [1,2,3,4,5],
  dayOfMonth: 1, active: true,
});

function SchedulePicker({ form, setForm }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { v: "daily",    label: "Every day" },
          { v: "weekdays", label: "Weekdays" },
          { v: "weekly",   label: "Specific days" },
          { v: "monthly",  label: "Monthly" },
        ].map(s => (
          <button key={s.v} onClick={() => setForm(f => ({ ...f, schedule: s.v }))}
            style={{ fontSize: 11, padding: "4px 11px", borderRadius: 7, cursor: "pointer",
              fontFamily: "inherit", border: "0.5px solid",
              background: form.schedule === s.v ? "var(--accent)" : "var(--surface)",
              color: form.schedule === s.v ? "#fff" : "var(--muted)",
              borderColor: form.schedule === s.v ? "var(--accent)" : "var(--border)" }}>
            {s.label}
          </button>
        ))}
      </div>
      {form.schedule === "weekly" && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {DAYS_OF_WEEK.map(d => {
            const sel = (form.days || []).includes(d.value);
            return (
              <button key={d.value}
                onClick={() => setForm(f => ({
                  ...f,
                  days: sel
                    ? (f.days || []).filter(x => x !== d.value)
                    : [...(f.days || []), d.value].sort(),
                }))}
                style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, cursor: "pointer",
                  fontFamily: "inherit", border: "0.5px solid",
                  background: sel ? "var(--accent)" : "var(--surface)",
                  color: sel ? "#fff" : "var(--muted)",
                  borderColor: sel ? "var(--accent)" : "var(--border)" }}>
                {d.label}
              </button>
            );
          })}
        </div>
      )}
      {form.schedule === "monthly" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Day of month:</span>
          <input type="number" min={1} max={28} value={form.dayOfMonth || 1}
            onChange={e => setForm(f => ({ ...f, dayOfMonth: +e.target.value }))}
            style={{ width: 60, fontSize: 12, padding: "4px 8px", borderRadius: 6,
              border: "0.5px solid var(--border)", background: "var(--surface)",
              color: "var(--text)", fontFamily: "inherit" }} />
        </div>
      )}
    </div>
  );
}

function TaskModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || emptyForm());
  const [saving, setSaving] = useState(false);

  const isEdit = !!initial?.id;

  const handleSave = async () => {
    if (!form.text.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      console.error("RecurringTasks save error:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, width: 480, maxWidth: "95vw", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {isEdit ? "Edit recurring task" : "New recurring task"}
          </span>
          <button onClick={onClose} style={{ fontSize: 16, color: "var(--faint)",
            background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        {/* Body */}
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Task name */}
          <div>
            <div className="field-label mb-6">Task description</div>
            <input className="field-input" placeholder="e.g. Manual upload — WM"
              value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              style={{ marginBottom: 0 }} autoFocus />
          </div>
          {/* Client + Priority */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div className="field-label mb-6">Client</div>
              <input className="field-input" placeholder="e.g. WM"
                value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
                style={{ marginBottom: 0 }} />
            </div>
            <div>
              <div className="field-label mb-6">Priority</div>
              <select className="field-input" value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                style={{ marginBottom: 0, cursor: "pointer" }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {/* Schedule */}
          <div>
            <div className="field-label mb-8">Schedule</div>
            <SchedulePicker form={form} setForm={setForm} />
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding: "10px 16px", borderTop: "0.5px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.text.trim()}>
            {saving ? "Saving..." : isEdit ? "Save changes" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecurringTasks({ memberName }) {
  const { tasks, loading, save, remove } = useRecurring(memberName);
  const [modal, setModal]   = useState(null); // null | "new" | task object
  const [deleting, setDeleting] = useState(null);

  if (loading) return <div className="main-content"><Loading /></div>;

  const handleToggle = async (task) => {
    await save({ ...task, active: !task.active });
  };
  const handleDelete = async (id) => {
    setDeleting(id);
    await remove(id);
    setDeleting(null);
  };

  return (
    <div className="main-content">
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Recurring tasks</div>
          <div className="text-sm text-muted">
            These tasks are auto-added to your SOD on their scheduled days
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal("new")}>＋ New task</button>
      </div>

      {tasks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔁</div>
          <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>
            No recurring tasks yet.<br />Add tasks that repeat daily, weekly, or monthly.
          </div>
          <button className="btn btn-primary" onClick={() => setModal("new")}>＋ Add first task</button>
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)",
          borderRadius: 12, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 100px 60px 80px",
            padding: "6px 14px", background: "var(--bg)",
            borderBottom: "0.5px solid var(--border)", gap: 8 }}>
            {["Task", "Client", "Schedule", "Priority", "Active", ""].map((h, i) => (
              <div key={i} style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                letterSpacing: "0.07em", color: "var(--faint)" }}>{h}</div>
            ))}
          </div>

          {tasks.map((task, i) => {
            const ps      = PRIORITY_STYLE[task.priority || "Medium"];
            const isLast  = i === tasks.length - 1;
            const sched   = scheduleLabel(task);
            return (
              <div key={task.id} style={{ display: "grid",
                gridTemplateColumns: "1fr 90px 120px 100px 60px 80px",
                padding: "10px 14px", gap: 8, alignItems: "center",
                borderBottom: isLast ? "none" : "0.5px solid var(--border)",
                opacity: task.active === false ? 0.5 : 1,
                background: task.active === false ? "var(--bg)" : "transparent" }}>

                {/* Task name */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{task.text}</div>
                </div>

                {/* Client */}
                <div>
                  {task.client
                    ? <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                        background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>
                        {task.client}
                      </span>
                    : <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>}
                </div>

                {/* Schedule */}
                <div>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                    background: "var(--blue-bg)", color: "var(--blue)",
                    border: "0.5px solid var(--blue-bd)" }}>
                    {sched}
                  </span>
                </div>

                {/* Priority */}
                <div>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, fontWeight: 500,
                    color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}` }}>
                    {task.priority || "Medium"}
                  </span>
                </div>

                {/* Toggle */}
                <div>
                  <div onClick={() => handleToggle(task)}
                    style={{ width: 32, height: 17, borderRadius: 20, cursor: "pointer",
                      background: task.active !== false ? "var(--green)" : "var(--border)",
                      position: "relative", transition: "background 0.2s", flexShrink: 0,
                      display: "inline-block" }}>
                    <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#fff",
                      position: "absolute", top: 2,
                      left: task.active !== false ? 17 : 2,
                      transition: "left 0.2s" }} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={() => setModal(task)}
                    style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, cursor: "pointer",
                      fontFamily: "inherit", border: "0.5px solid var(--border)",
                      background: "transparent", color: "var(--muted)" }}>Edit</button>
                  <button onClick={() => handleDelete(task.id)} disabled={deleting === task.id}
                    style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, cursor: "pointer",
                      fontFamily: "inherit", border: "0.5px solid var(--red-bd)",
                      background: "var(--red-bg)", color: "var(--red)" }}>
                    {deleting === task.id ? "…" : "Del"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <TaskModal
          initial={modal === "new" ? null : modal}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
