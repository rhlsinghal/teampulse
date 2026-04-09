import { useState, useEffect } from "react";
import { avatarColor, initials } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { ClientBadge, Loading } from "../../components/index.jsx";
import { loadAllMembersLatest, loadEntriesInRange } from "../../hooks/useHistory";
import { db } from "../../firebase";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";

export default function Blockers({ members }) {
  const [blockerList, setBlockerList] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState("active"); // "active" | "all"

  useEffect(() => {
    if (!members.length) { setLoading(false); return; }
    // Load last 60 days to find blockers
    const start = new Date();
    start.setDate(start.getDate() - 60);
    const startStr = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")}`;

    Promise.all(members.map(m =>
      loadEntriesInRange(m.name, startStr, TODAY).then(entries =>
        entries.flatMap(e => {
          // New schema — each SOD task with a non-N/A blocker becomes its own row
          if (e.sod?.tasks) {
            return e.sod.tasks
              .filter(t => t.blocker && t.blocker !== "N/A")
              .map(t => {
                const isResolved  = t.blockerResolved === true;
                const displayText = t.blocker;
                return {
                  member:       m.name,
                  date:         e.date,
                  text:         displayText,
                  taskText:     t.text,
                  project:      t.project || null,
                client:       t.client || null,
                  resolved:     isResolved,
                  resolvedDate: t.blockerResolvedDate || null,
                };
              });
          }
          // Legacy schema
          if (!e.blockers?.trim()) return [];
          return [{
            member:       m.name,
            date:         e.date,
            text:         e.blockers,
            taskText:     null,
            project:      e.tasks?.[0]?.project || null,
            client:       e.tasks?.[0]?.client || null,
            resolved:     e.blockerResolved || false,
            resolvedDate: e.blockerResolvedDate || null,
          }];
        })
      )
    )).then(results => {
      const all = results.flat().sort((a, b) => b.date.localeCompare(a.date));
      setBlockerList(all);
      setLoading(false);
    });
  }, [members]);

  const displayed = filter === "active"
    ? blockerList.filter(b => !b.resolved)
    : blockerList;

  const activeCount   = blockerList.filter(b => !b.resolved).length;
  const resolvedCount = blockerList.filter(b => b.resolved).length;

  const markResolved = async (blocker) => {
    // Optimistic update — match by object identity, works correctly with filtered list
    setBlockerList(prev => prev.map(item =>
      item === blocker ? { ...item, resolved: true, resolvedDate: TODAY } : item
    ));
    try {
      const entryRef = doc(db, "standup", blocker.member, "entries", blocker.date);
      const snap     = await getDoc(entryRef);
      if (!snap.exists()) return;
      const entry = snap.data();

      if (entry.sod?.tasks) {
        // New schema — mark the specific SOD task blocker as resolved
        const updatedTasks = (entry.sod.tasks || []).map(t =>
          t.text === blocker.taskText && t.blocker === blocker.text
            ? { ...t, blockerResolved: true, blockerResolvedDate: TODAY }
            : t
        );
        await setDoc(entryRef, { ...entry, sod: { ...entry.sod, tasks: updatedTasks } });
      } else {
        // Legacy schema
        await updateDoc(entryRef, {
          blockerResolved:     true,
          blockerResolvedDate: TODAY,
        });
      }
    } catch (e) {
      console.error("markResolved error:", e);
      // Revert on failure
      setBlockerList(prev => prev.map(item =>
        item === blocker ? { ...item, resolved: false, resolvedDate: null } : item
      ));
    }
  };

  if (loading) return <div className="main-content"><Loading /></div>;

  return (
    <div className="main-content">
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Blocker tracking</div>
          <div className="text-sm text-muted">All active and resolved blockers across the team</div>
        </div>
        <div className="flex gap-6">
          <button className={`btn btn-sm ${filter === "active" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter("active")}>
            Active ({activeCount})
          </button>
          <button className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter("all")}>
            All ({blockerList.length})
          </button>
        </div>
      </div>

      <div className="stats-grid stats-grid-4 mb-16">
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{activeCount}</div><div className="stat-label">Open blockers</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{resolvedCount}</div><div className="stat-label">Resolved</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{blockerList.length}</div><div className="stat-label">Total this period</div></div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--muted)", fontSize: 16, paddingTop: 2 }}>
            {resolvedCount > 0 ? `${Math.round((resolvedCount / blockerList.length) * 100)}%` : "—"}
          </div>
          <div className="stat-label">Resolution rate</div>
        </div>
      </div>

      {displayed.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div className="text-sm">No {filter === "active" ? "active blockers" : "blockers"} found</div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Blocker</th>
                <th>Client</th>
                <th>Raised</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((b, i) => {
                const color = avatarColor(b.member);
                return (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-8">
                        <div className="avatar avatar-sq" style={{ width: 26, height: 26, background: color + "25", color, fontSize: 9 }}>{initials(b.member)}</div>
                        <span className="text-sm font-medium">{b.member}</span>
                      </div>
                    </td>
                    <td className="text-sm" style={{ maxWidth: 300 }}>
                      {b.taskText && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>Task: {b.taskText}</div>}
                      {b.text}
                    </td>
                    <td><ClientBadge project={b.project} client={b.client} /></td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted)" }}>{fmt(b.date)}</td>
                    <td>
                      <span className="badge" style={{
                        background: b.resolved ? "var(--green-bg)" : "var(--red-bg)",
                        color: b.resolved ? "var(--green)" : "var(--red)",
                        borderColor: b.resolved ? "var(--green-bd)" : "var(--red-bd)",
                      }}>
                        {b.resolved ? `Resolved ${b.resolvedDate ? fmt(b.resolvedDate) : ""}` : "Open"}
                      </span>
                    </td>
                    <td>
                      {!b.resolved && (
                        <button className="btn btn-sm" style={{ color: "var(--green)", borderColor: "var(--green-bd)", background: "var(--green-bg)" }} onClick={() => markResolved(b)}>
                          Mark resolved
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
