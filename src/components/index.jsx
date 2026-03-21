import { useState } from "react";
import { avatarColor, initials, BW_STYLES, STATUS_STYLES } from "../utils/constants";
import { DAYS_SHORT, getDaysInMonth, getFirstDayOfMonth, isoDate, TODAY } from "../utils/dates";

// ─── Toast ────────────────────────────────────────────────────────────────────
export function Toast({ message, type = "success" }) {
  if (!message) return null;
  return <div className={`toast toast-${type}`}>{message}</div>;
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  };
  return { toast, show };
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ white }) {
  return <span className={`spinner ${white ? "spinner-white" : ""}`} />;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
export function Login({ onLogin, loading, error }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", position: "relative" }}>
      <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,#5b5ff512 0%,transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
      <div className="card" style={{ width: "100%", maxWidth: 380, textAlign: "center", padding: 0, borderRadius: 16, position: "relative", zIndex: 1 }}>
        <div style={{ padding: "40px 32px" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 22 }}>🧩</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 5 }}>team<em style={{ fontStyle: "normal", color: "var(--accent)" }}>pulse</em></div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 28, lineHeight: 1.7 }}>
            Daily standup tracker for your team.<br />Sign in with your approved Google account.
          </div>
          <button className="btn btn-ghost w-full" style={{ justifyContent: "center", marginBottom: 14, padding: "10px 16px" }} onClick={onLogin} disabled={loading}>
            {loading ? <Spinner /> : (
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Sign in with Google
          </button>
          {error && <div className="badge badge-red" style={{ display: "block", marginBottom: 12, padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>{error}</div>}
          <div style={{ fontSize: 11, color: "var(--faint)", padding: "5px 12px", border: "0.5px solid var(--border)", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span className="sdot sdot-amber" />
            Access by invitation only
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Access Denied ────────────────────────────────────────────────────────────
export function AccessDenied({ user, onLogout }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div className="card" style={{ maxWidth: 400, textAlign: "center", padding: 0 }}>
        <div style={{ padding: "40px 32px" }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>🚫</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--red)", marginBottom: 8 }}>Access Denied</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 24 }}>
            Your account <strong>{user?.email}</strong> is not on the approved access list.<br /><br />
            Contact your manager to request access.
          </div>
          <button className="btn btn-danger" onClick={onLogout} style={{ margin: "0 auto" }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

// ─── Top Nav ──────────────────────────────────────────────────────────────────
export function TopNav({ displayName, photoURL, isManager, onLogout }) {
  return (
    <div className="topnav">
      <div className="topnav-logo">team<em>pulse</em></div>
      <div className="topnav-right">
        <span className="text-sm text-muted">{displayName}</span>
        {photoURL ? (
          <img src={photoURL} alt="" style={{ width: 28, height: 28, borderRadius: "50%", border: "0.5px solid var(--border2)" }} />
        ) : (
          <div className="avatar avatar-sm" style={{ background: "var(--accent)" }}>{initials(displayName)}</div>
        )}
        {isManager && <span className="badge badge-manager">Manager</span>}
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>
      </div>
    </div>
  );
}

// ─── Member Sidebar ───────────────────────────────────────────────────────────
export function MemberSidebar({ page, onChange, streak, submittedToday }) {
  const items = [
    { key: "today",   icon: "📋", label: "Today's update" },
    { key: "history", icon: "🕓", label: "My history" },
  ];
  return (
    <div className="sidebar">
      <div className="sidebar-section">My workspace</div>
      {items.map(item => (
        <div key={item.key} className={`nav-item ${page === item.key ? "active" : ""}`} onClick={() => onChange(item.key)}>
          <span className="nav-item-icon">{item.icon}</span>
          <span className="nav-item-label">{item.label}</span>
        </div>
      ))}
      {streak > 0 && (
        <div className="streak-pill">
          <span style={{ fontSize: 16 }}>🔥</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--amber)" }}>{streak} day streak!</div>
            <div style={{ fontSize: 10, color: "var(--amber)" }}>Keep it going</div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, padding: "8px 10px", background: submittedToday ? "var(--green-bg)" : "var(--amber-bg)", border: `0.5px solid ${submittedToday ? "var(--green-bd)" : "var(--amber-bd)"}`, borderRadius: 8 }}>
        <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Today</div>
        <div className="flex items-center gap-4">
          <span className={`sdot ${submittedToday ? "sdot-green" : "sdot-amber"}`} />
          <span style={{ fontSize: 11, color: submittedToday ? "var(--green)" : "var(--amber)", fontWeight: 500 }}>
            {submittedToday ? "Submitted" : "Not yet submitted"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Manager Tabs ─────────────────────────────────────────────────────────────
export function ManagerTabs({ page, onChange }) {
  const tabs = [
    { key: "overview",  label: "Team overview"    },
    { key: "blockers",  label: "Blockers"         },
    { key: "annual",    label: "Annual reports"   },
    { key: "monthly",   label: "Monthly reports"  },
    { key: "ai",        label: "AI assistant"     },
    { key: "users",     label: "Allowed users"    },
  ];
  return (
    <div className="topnav-tabs">
      {tabs.map(t => (
        <div key={t.key} className={`topnav-tab ${page === t.key ? "active" : ""}`} onClick={() => onChange(t.key)}>
          {t.label}
        </div>
      ))}
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
export function Calendar({ year, month, onNavigate, entryDates = [], selectedDate, onSelect, blockerDates = [] }) {
  const days = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayIso = TODAY;

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div className="cal-box">
      <div className="cal-header">
        <button className="cal-nav" onClick={() => onNavigate(-1)}>‹</button>
        <span className="cal-month">{new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button className="cal-nav" onClick={() => onNavigate(1)}>›</button>
      </div>
      <div className="cal-day-labels">
        {DAYS_SHORT.map(d => <div key={d} className="cal-dl">{d}</div>)}
      </div>
      <div className="cal-cells">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = isoDate(year, month, d);
          const hasEntry = entryDates.includes(iso);
          const isToday = iso === todayIso;
          const isSel = iso === selectedDate;
          const isFuture = iso > todayIso;
          const isBlocker = blockerDates.includes(iso);
          let cls = "cal-cell";
          if (isSel) cls += " selected";
          else if (isBlocker && hasEntry) cls += " has-entry";
          else if (hasEntry) cls += " has-entry";
          else if (isToday) cls += " is-today";
          if (isFuture) cls += " is-future";
          const style = isBlocker && hasEntry && !isSel ? { background: "var(--red-bg)", borderColor: "var(--red-bd)", color: "var(--red)" } : {};
          return (
            <div key={i} className={cls} style={style} onClick={() => hasEntry && !isFuture && onSelect && onSelect(iso)}>
              {d}
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        <div className="cal-legend-item"><div className="cal-legend-dot" style={{ background: "#5b5ff540", border: "0.5px solid #5b5ff530" }} />Entry</div>
        <div className="cal-legend-item"><div className="cal-legend-dot" style={{ background: "var(--red-bg)", border: "0.5px solid var(--red-bd)" }} />Blocker</div>
      </div>
    </div>
  );
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
export function BwBadge({ bw }) {
  if (!bw) return null;
  const { label, color, bg, bd } = { ...BW_STYLES[bw], label: require("../utils/constants").BANDWIDTH[bw]?.label };
  return <span className="badge" style={{ color, background: bg, borderColor: bd }}>{label}</span>;
}

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES["Pending"];
  return <span className="badge" style={{ color: s.color, background: s.bg, borderColor: s.bd }}>{status}</span>;
}

export function ClientBadge({ client }) {
  if (!client) return <span className="badge badge-gray">—</span>;
  const lower = client.toLowerCase();
  if (lower.includes("internal")) return <span className="badge badge-gray">{client}</span>;
  if (lower.includes("client a") || lower.includes("sprint")) return <span className="badge badge-blue">{client}</span>;
  if (lower.includes("client b") || lower.includes("infra")) return <span className="badge badge-amber">{client}</span>;
  return <span className="badge badge-accent">{client}</span>;
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon = "📋", message }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 13, lineHeight: 1.8 }}>{message}</div>
    </div>
  );
}

// ─── Loading state ────────────────────────────────────────────────────────────
export function Loading() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      <Spinner />
    </div>
  );
}
