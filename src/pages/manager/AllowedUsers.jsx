import { useState, useEffect } from "react";
import { db } from "../../firebase";
import {
  collection, getDocs, doc, setDoc, deleteDoc, query, orderBy,
} from "firebase/firestore";
import { avatarColor, initials } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { Spinner, Toast, useToast } from "../../components/index.jsx";

export default function AllowedUsers({ currentUserEmail }) {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ name: "", email: "", role: "member" });
  const { toast, show: showToast } = useToast();

  const loadUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "allowedUsers"));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        if (a.role === "manager" && b.role !== "manager") return -1;
        if (b.role === "manager" && a.role !== "manager") return 1;
        return a.name?.localeCompare(b.name || "");
      });
      setUsers(list);
    } catch (e) {
      showToast("Failed to load users", "error");
    }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const addUser = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      showToast("Name and email are required", "error"); return;
    }
    if (!form.email.includes("@")) {
      showToast("Please enter a valid email address", "error"); return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "allowedUsers", form.email.toLowerCase()), {
        name:      form.name.trim(),
        email:     form.email.toLowerCase().trim(),
        role:      form.role,
        addedOn:   TODAY,
        addedBy:   currentUserEmail,
        active:    true,
      });
      setForm({ name: "", email: "", role: "member" });
      setShowForm(false);
      await loadUsers();
      showToast(`${form.name} added successfully`);
    } catch (e) {
      showToast("Failed to add user", "error");
    }
    setSaving(false);
  };

  const removeUser = async (email, name) => {
    if (email === currentUserEmail) {
      showToast("You cannot remove your own account", "error"); return;
    }
    if (!window.confirm(`Remove ${name} from TeamPulse? They will lose access immediately.`)) return;
    try {
      await deleteDoc(doc(db, "allowedUsers", email));
      setUsers(prev => prev.filter(u => u.email !== email));
      showToast(`${name} removed`);
    } catch (e) {
      showToast("Failed to remove user", "error");
    }
  };

  const toggleRole = async (user) => {
    if (user.email === currentUserEmail) {
      showToast("You cannot change your own role", "error"); return;
    }
    const newRole = user.role === "manager" ? "member" : "manager";
    try {
      await setDoc(doc(db, "allowedUsers", user.email), { ...user, role: newRole }, { merge: true });
      setUsers(prev => prev.map(u => u.email === user.email ? { ...u, role: newRole } : u));
      showToast(`${user.name} is now a ${newRole}`);
    } catch (e) {
      showToast("Failed to update role", "error");
    }
  };

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="main-content">
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Allowed users</div>
          <div className="text-sm text-muted">Only users on this list can log in to TeamPulse</div>
        </div>
        <div className="flex gap-8">
          <input
            className="field-input"
            style={{ width: 180 }}
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "+ Invite user"}
          </button>
        </div>
      </div>

      {/* Add user form */}
      {showForm && (
        <div className="card mb-12">
          <div className="card-header"><span className="card-title">Invite new user</span></div>
          <div className="card-body">
            <div className="form-grid-2 mb-12">
              <div className="field">
                <label className="field-label">Full name</label>
                <input className="field-input" placeholder="e.g. Lenin Bakhara"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field">
                <label className="field-label">Email address</label>
                <input className="field-input" type="email" placeholder="e.g. lenin@company.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="field mb-12">
              <label className="field-label">Role</label>
              <div className="flex gap-8">
                {["member", "manager"].map(r => (
                  <label key={r} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="radio" name="role" value={r} checked={form.role === r}
                      onChange={() => setForm(f => ({ ...f, role: r }))} />
                    <span className="text-sm" style={{ textTransform: "capitalize" }}>{r}</span>
                    {r === "manager" && <span className="badge badge-blue" style={{ fontSize: 9 }}>sees all data + reports</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="submit-row">
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setForm({ name: "", email: "", role: "member" }); }}>Cancel</button>
            <button className="btn btn-primary" onClick={addUser} disabled={saving}>
              {saving ? <><Spinner white /> Adding...</> : "Add user"}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid stats-grid-4 mb-16">
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{users.length}</div><div className="stat-label">Total users</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--blue)" }}>{users.filter(u => u.role === "manager").length}</div><div className="stat-label">Managers</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{users.filter(u => u.role === "member").length}</div><div className="stat-label">Members</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--amber)" }}>{users.filter(u => u.active).length}</div><div className="stat-label">Active</div></div>
      </div>

      {/* Users table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spinner /></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Added on</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const color = avatarColor(u.name || "");
                const isMe = u.email === currentUserEmail;
                return (
                  <tr key={u.email}>
                    <td>
                      <div className="flex items-center gap-8">
                        <div className="avatar avatar-sq" style={{ width: 26, height: 26, background: color + "25", color, fontSize: 9 }}>
                          {initials(u.name || "")}
                        </div>
                        <span className="text-sm font-medium">{u.name}</span>
                        {isMe && <span className="badge badge-gray" style={{ fontSize: 9 }}>you</span>}
                      </div>
                    </td>
                    <td className="text-muted text-sm">{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === "manager" ? "badge-manager" : "badge-accent"}`} style={{ textTransform: "capitalize" }}>
                        {u.role}
                      </span>
                    </td>
                    <td className="text-muted text-sm">{u.addedOn ? fmt(u.addedOn) : "—"}</td>
                    <td>
                      <div className="flex gap-6">
                        {!isMe && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggleRole(u)}>
                              Make {u.role === "manager" ? "member" : "manager"}
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => removeUser(u.email, u.name)}>
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Security note */}
      <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--blue-bg)", border: "0.5px solid var(--blue-bd)", borderRadius: 8 }}>
        <div className="text-xs" style={{ color: "var(--blue)", lineHeight: 1.6 }}>
          <strong>How access works:</strong> When someone signs in with Google, their email is checked against this list in real time. If not found, they are shown an Access Denied screen and cannot view any data. Removing a user takes effect immediately — they will be signed out on their next page load.
        </div>
      </div>

      <Toast message={toast?.msg} type={toast?.type} />
    </div>
  );
}
