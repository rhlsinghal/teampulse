import { useState, useEffect } from "react";
import { avatarColor, initials, BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { loadAllMembersLatest } from "../../hooks/useHistory";
import { BwBadge, Loading, StatusBadge, ClientBadge } from "../../components/index.jsx";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

export default function TeamOverview({ members, onViewProfile }) {
  const [latest,  setLatest]  = useState({});
  const [loading, setLoading] = useState(true);
  const [slackSending, setSlackSending] = useState(false);

  useEffect(() => {
    if (!members.length) return;
    loadAllMembersLatest(members.map(m => m.name)).then(res => {
      setLatest(res);
      setLoading(false);
    });
  }, [members]);

  if (loading) return <div className="main-content"><Loading /></div>;

  const submittedToday = members.filter(m => latest[m.name]?.date === TODAY);
  const notSubmitted   = members.filter(m => latest[m.name]?.date !== TODAY);
  const blocked = members.filter(m => latest[m.name]?.date === TODAY && latest[m.name]?.blockers?.trim());

  const bwValues = submittedToday.map(m => latest[m.name]?.bandwidth).filter(Boolean);
  const avgBw = bwValues.length ? Math.round(bwValues.reduce((a,b) => a+b, 0) / bwValues.length) : null;
  const avgBwLabel = avgBw ? BANDWIDTH[avgBw]?.label : "—";

  const sendSlackReminder = async () => {
    setSlackSending(true);
    // In production: call a cloud function or GitHub Action webhook
    // For now: show which members would be pinged
    setTimeout(() => {
      setSlackSending(false);
      alert(`Slack reminders would be sent to:\n${notSubmitted.map(m => m.name).join("\n")}\n\n(Connect your Slack webhook in settings to enable this)`);
    }, 1000);
  };

  return (
    <div className="main-content">
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Team overview</div>
          <div className="text-sm text-muted">{fmt(TODAY)} · {members.length} team members</div>
        </div>
        <div className="flex gap-8">
          {notSubmitted.length > 0 && (
            <button className="btn btn-green" onClick={sendSlackReminder} disabled={slackSending}>
              {slackSending ? "Sending..." : `💬 Send reminder (${notSubmitted.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid stats-grid-4 mb-16">
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{submittedToday.length}</div><div className="stat-label">Submitted today</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--faint)" }}>{notSubmitted.length}</div><div className="stat-label">Not yet submitted</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{blocked.length}</div><div className="stat-label">Active blockers</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--amber)", fontSize: 16, paddingTop: 2 }}>{avgBwLabel}</div><div className="stat-label">Avg bandwidth</div></div>
      </div>

      {/* Member cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
        {members.map(m => {
          const entry = latest[m.name];
          const hasToday = entry?.date === TODAY;
          const color = avatarColor(m.name);
          const bwS = BW_STYLES[entry?.bandwidth] || BW_STYLES[3];
          const bwLabel = BANDWIDTH[entry?.bandwidth]?.label;
          return (
            <div key={m.name} className="card" style={{ cursor: "pointer", marginBottom: 0, borderColor: hasToday ? "var(--border)" : "var(--amber-bd)", background: hasToday ? "var(--surface)" : "var(--amber-bg)" }}
              onClick={() => onViewProfile(m.name)}>
              <div className="card-body" style={{ padding: "12px 13px" }}>
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-6">
                    <div className="avatar avatar-sq" style={{ width: 28, height: 28, background: color + "25", color, fontSize: 10 }}>{initials(m.name)}</div>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</span>
                  </div>
                  <span className={`sdot ${hasToday ? "sdot-green" : "sdot-amber"}`} />
                </div>
                {hasToday ? (
                  <>
                    <span className="badge" style={{ color: bwS.color, background: bwS.bg, borderColor: bwS.bd, marginBottom: 6, display: "inline-block" }}>{bwLabel}</span>
                    <div className="text-xxs text-muted">{entry.tasks?.length || 0} tasks</div>
                    {entry.blockers && (
                      <div style={{ fontSize: 10, color: "var(--red)", background: "var(--red-bg)", border: "0.5px solid var(--red-bd)", borderRadius: 5, padding: "3px 7px", marginTop: 5 }}>
                        ⚑ Blocked
                      </div>
                    )}
                  </>
                ) : (
                  <span className="badge badge-amber" style={{ fontSize: 10 }}>Not submitted</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
