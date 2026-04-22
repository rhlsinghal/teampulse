import { useState, useCallback, useEffect } from "react";
import { db } from "../../firebase";
import {
  collection, doc, setDoc, getDocs, deleteDoc, addDoc,
  orderBy, query,
} from "firebase/firestore";
import { Loading, EmptyState } from "../../components/index.jsx";
import { fmt, TODAY } from "../../utils/dates";

// ── Firestore path: milestones/{memberName}/items/{milestoneId}
// ── Updates stored inline as array on the milestone doc

const STATUSES = ["Not started", "In progress", "On track", "At risk", "Done"];

const STATUS_STYLE = {
  "Not started": { bg: "var(--surface)",    color: "var(--muted)",  bd: "var(--border)"    },
  "In progress": { bg: "var(--blue-bg)",    color: "var(--blue)",   bd: "var(--blue-bd)"   },
  "On track":    { bg: "var(--green-bg)",   color: "var(--green)",  bd: "var(--green-bd)"  },
  "At risk":     { bg: "var(--amber-bg)",   color: "var(--amber)",  bd: "var(--amber-bd)"  },
  "Done":        { bg: "var(--green-bg)",   color: "var(--green)",  bd: "var(--green-bd)"  },
};

const emptyForm = () => ({
  title: "", client: "", description: "",
  status: "In progress", targetDate: "", firstUpdate: "",
});

// ── Milestone form modal ───────────────────────────────────────────────────────
function MilestoneModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || emptyForm());
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial?.id;

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { console.error("Milestone save:", e); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, width: 520, maxWidth: "95vw", overflow: "hidden" }}>
        <div style={{ background: "#0C447C", padding: "10px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>
            {isEdit ? "Edit milestone" : "New milestone"}
          </span>
          <button onClick={onClose} style={{ fontSize: 16, color: "#85B7EB",
            background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="field-label mb-6">Title</div>
            <input className="field-input" placeholder="What is this milestone?"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ marginBottom: 0 }} autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div className="field-label mb-6">Client / project</div>
              <input className="field-input" placeholder="e.g. WM, PS70, Internal"
                value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
                style={{ marginBottom: 0 }} />
            </div>
            <div>
              <div className="field-label mb-6">Target date</div>
              <input type="date" className="field-input" value={form.targetDate}
                onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
                style={{ marginBottom: 0, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div className="field-label mb-6">Status</div>
              <select className="field-input" value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ marginBottom: 0, cursor: "pointer" }}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="field-label mb-6">Description</div>
            <textarea className="field-input" rows={2}
              placeholder="Brief context — what is this, who is involved, why it matters?"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ marginBottom: 0, resize: "none" }} />
          </div>
          {!isEdit && (
            <div>
              <div className="field-label mb-6">First update <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 400 }}>(optional)</span></div>
              <textarea className="field-input" rows={2}
                placeholder="Where are you right now? What's the next step?"
                value={form.firstUpdate}
                onChange={e => setForm(f => ({ ...f, firstUpdate: e.target.value }))}
                style={{ marginBottom: 0, resize: "none" }} />
            </div>
          )}
        </div>
        <div style={{ padding: "10px 16px", borderTop: "0.5px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}
            disabled={saving || !form.title.trim()}>
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create milestone"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ───────────────────────────────────────────────────────
function ConfirmDelete({ title, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, width: 380, padding: "20px 20px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Delete milestone?</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
          "{title}" and all its updates will be permanently deleted.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={onConfirm}
            style={{ background: "var(--red)", color: "#fff", borderColor: "var(--red)" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Milestone detail panel ─────────────────────────────────────────────────────
function MilestoneDetail({ milestone, onEdit, onDelete, onUpdatePosted, memberName }) {
  const [updateText, setUpdateText] = useState("");
  const [posting, setPosting] = useState(false);

  const ss = STATUS_STYLE[milestone.status] || STATUS_STYLE["In progress"];
  const isOverdue = milestone.targetDate && milestone.targetDate < TODAY && milestone.status !== "Done";
  const updates = [...(milestone.updates || [])].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );

  const handlePost = async () => {
    if (!updateText.trim()) return;
    setPosting(true);
    try {
      const newUpdate = { text: updateText.trim(), date: TODAY, postedAt: Date.now() };
      const updatedDoc = {
        ...milestone,
        updates: [...(milestone.updates || []), newUpdate],
        updatedAt: Date.now(),
      };
      await setDoc(
        doc(db, "milestones", memberName, "items", milestone.id),
        updatedDoc
      );
      onUpdatePosted(updatedDoc);
      setUpdateText("");
    } catch (e) { console.error("Post update:", e); }
    finally { setPosting(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Detail header */}
      <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, lineHeight: 1.4 }}>
              {milestone.title}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {milestone.client && (
                <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                  background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>
                  {milestone.client}
                </span>
              )}
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                background: ss.bg, color: ss.color, border: `0.5px solid ${ss.bd}` }}>
                {milestone.status}
              </span>
              {milestone.targetDate && (
                <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                  color: isOverdue ? "var(--red)" : "var(--muted)", fontWeight: isOverdue ? 500 : 400 }}>
                  Due {milestone.targetDate}{isOverdue ? " !" : ""}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={onEdit}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                fontFamily: "inherit", border: "0.5px solid var(--border)",
                background: "transparent", color: "var(--muted)" }}>Edit</button>
            <button onClick={onDelete}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                fontFamily: "inherit", border: "0.5px solid var(--red-bd)",
                background: "var(--red-bg)", color: "var(--red)" }}>Delete</button>
          </div>
        </div>
        {milestone.description && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
            {milestone.description}
          </div>
        )}
      </div>

      {/* Updates list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {updates.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--faint)", fontSize: 12 }}>
            No updates yet — add the first one below
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {updates.map((u, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: i === 0 ? "var(--accent)" : "var(--border)",
                    marginTop: 3 }} />
                  {i < updates.length - 1 && (
                    <div style={{ width: 1, flex: 1, background: "var(--border)", minHeight: 16 }} />
                  )}
                </div>
                <div style={{ flex: 1, paddingBottom: 4 }}>
                  <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>{u.text}</div>
                  <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace",
                    color: "var(--faint)", marginTop: 3 }}>{fmt(u.date)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add update */}
      <div style={{ padding: "12px 16px", borderTop: "0.5px solid var(--border)" }}>
        <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase",
          letterSpacing: "0.07em", color: "var(--faint)", marginBottom: 7 }}>Add update</div>
        <textarea className="field-input" rows={3}
          placeholder="Where are you on this? Any blockers, decisions, or next steps?"
          value={updateText}
          onChange={e => setUpdateText(e.target.value)}
          style={{ marginBottom: 8, resize: "none", fontSize: 12 }} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={handlePost}
            disabled={posting || !updateText.trim()}>
            {posting ? "Posting..." : "Post update"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Milestones({ memberName }) {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null); // id of selected milestone
  const [modal, setModal]           = useState(null); // null | "new" | milestone object
  const [confirmDelete, setConfirmDelete] = useState(null); // milestone to delete

  const load = useCallback(async () => {
    if (!memberName) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "milestones", memberName, "items"), orderBy("createdAt", "desc"))
      );
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMilestones(items);
      if (items.length && !selected) setSelected(items[0].id);
    } catch (e) { console.error("Load milestones:", e); }
    finally { setLoading(false); }
  }, [memberName]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    const isEdit = !!form.id;
    if (isEdit) {
      // Update existing — preserve updates array
      const existing = milestones.find(m => m.id === form.id);
      const updated = {
        ...existing,
        title: form.title,
        client: form.client,
        description: form.description,
        status: form.status,
        targetDate: form.targetDate,
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, "milestones", memberName, "items", form.id), updated);
      setMilestones(prev => prev.map(m => m.id === form.id ? updated : m));
    } else {
      // Create new
      const firstUpdates = form.firstUpdate?.trim()
        ? [{ text: form.firstUpdate.trim(), date: TODAY, postedAt: Date.now() }]
        : [];
      const newDoc = {
        title: form.title, client: form.client, description: form.description,
        status: form.status, targetDate: form.targetDate,
        updates: firstUpdates,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      const ref = doc(collection(db, "milestones", memberName, "items"));
      await setDoc(ref, newDoc);
      const created = { id: ref.id, ...newDoc };
      setMilestones(prev => [created, ...prev]);
      setSelected(ref.id);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteDoc(doc(db, "milestones", memberName, "items", confirmDelete.id));
    const remaining = milestones.filter(m => m.id !== confirmDelete.id);
    setMilestones(remaining);
    if (selected === confirmDelete.id) setSelected(remaining[0]?.id || null);
    setConfirmDelete(null);
  };

  const handleUpdatePosted = (updatedMilestone) => {
    setMilestones(prev => prev.map(m => m.id === updatedMilestone.id ? updatedMilestone : m));
  };

  const selectedMilestone = milestones.find(m => m.id === selected) || null;

  if (loading) return <div className="main-content"><Loading /></div>;

  return (
    <div className="main-content">
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Milestones</div>
          <div className="text-sm text-muted">Quarterly goals and cross-team projects</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal("new")}>＋ Add milestone</button>
      </div>

      {milestones.length === 0 ? (
        <EmptyState icon="🎯" message="No milestones yet. Add a quarterly goal or cross-team project to track your progress." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, alignItems: "start" }}>

          {/* Left — compact list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {milestones.map(m => {
              const ss = STATUS_STYLE[m.status] || STATUS_STYLE["In progress"];
              const isActive = selected === m.id;
              const lastUpdate = [...(m.updates || [])].sort((a, b) =>
                (b.date || "").localeCompare(a.date || "")
              )[0];
              const isOverdue = m.targetDate && m.targetDate < TODAY && m.status !== "Done";
              return (
                <div key={m.id} onClick={() => setSelected(m.id)}
                  style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                    border: isActive ? "2px solid var(--accent)" : "0.5px solid var(--border)",
                    background: isActive ? "var(--surface)" : "var(--bg)",
                    transition: "border-color 0.15s" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 5,
                    color: "var(--text)", lineHeight: 1.4 }}>
                    {m.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                      background: ss.bg, color: ss.color, border: `0.5px solid ${ss.bd}` }}>
                      {m.status}
                    </span>
                    {m.targetDate && (
                      <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace",
                        color: isOverdue ? "var(--red)" : "var(--faint)" }}>
                        {m.targetDate}
                      </span>
                    )}
                  </div>
                  {lastUpdate && (
                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 5,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lastUpdate.text}
                    </div>
                  )}
                </div>
              );
            })}
            <button className="btn btn-ghost btn-sm"
              style={{ width: "100%", justifyContent: "center", marginTop: 2 }}
              onClick={() => setModal("new")}>
              ＋ Add milestone
            </button>
          </div>

          {/* Right — detail panel */}
          <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden",
            background: "var(--surface)", minHeight: 420 }}>
            {selectedMilestone ? (
              <MilestoneDetail
                milestone={selectedMilestone}
                memberName={memberName}
                onEdit={() => setModal(selectedMilestone)}
                onDelete={() => setConfirmDelete(selectedMilestone)}
                onUpdatePosted={handleUpdatePosted}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                height: 420, color: "var(--faint)", fontSize: 12 }}>
                Select a milestone to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {modal && (
        <MilestoneModal
          initial={modal === "new" ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDelete
          title={confirmDelete.title}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
