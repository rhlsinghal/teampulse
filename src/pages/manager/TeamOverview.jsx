import { useState, useEffect } from "react";
import { avatarColor, initials, BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { loadAllMembersLatest } from "../../hooks/useHistory";
import { Loading } from "../../components/index.jsx";

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// Normalise both new (sod/eod) and legacy entry schemas
function parseEntry(entry) {
  if (!entry) return null;
  if (entry.sod) {
    const eodTasks = entry.eod?.tasks || [];
    const done     = eodTasks.filter(t => t.outcome === "Done").length;
    const pct      = eodTasks.length ? Math.round(done / eodTasks.length * 100) : null;
    return {
      isNew:        true,
      sodSubmitted: !!entry.sod?.submittedAt,
      eodSubmitted: !!entry.eod?.submittedAt,
      sodTime:      fmtTime(entry.sod?.submittedAt),
      eodTime:      fmtTime(entry.eod?.submittedAt),
      bandwidth:    entry.sod?.bandwidth,
      tasks:        entry.sod?.tasks || [],
      blockers:     (entry.sod?.tasks || []).filter(t => t.blocker && t.blocker !== "N/A"),
      eod:          entry.eod || null,
      pct,
    };
  }
  // Legacy schema
  return {
    isNew:        false,
    sodSubmitted: true,
    eodSubmitted: false,
    sodTime:      null,
    eodTime:      null,
    bandwidth:    entry.bandwidth,
    tasks:        entry.tasks || [],
    blockers:     entry.blockers ? [{ blocker: entry.blockers }] : [],
    eod:          null,
    pct:          null,
  };
}

export default function TeamOverview({ members, onViewProfile }) {
  const [latest,       setLatest]       = useState({});
  const [loading,      setLoading]      = useState(false);
  const [slackSending, setSlackSending] = useState(false);
  const [tick,         setTick]         = useState(0);

  const reload = () => setTick(t => t + 1);

  useEffect(() => {
    if (!members.length) { setLoading(false); return; }
    setLoading(true);
    loadAllMembersLatest(members.map(m => m.name)).then(res => {
      setLatest(res);
      setLoading(false);
    });
  }, [members, tick]);

  if (loading) return <div className="main-content"><Loading /></div>;

  if (!members.length) return (
    <div className="main-content">
      <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--muted)" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>No team members yet.<br />Go to <strong>Allowed Users</strong> to invite your team.</div>
      </div>
    </div>
  );

  const hasToday     = (name) => latest[name]?.date === TODAY;
  const parsed       = Object.fromEntries(members.map(m => [m.name, parseEntry(latest[m.name])]));
  const sodSubmitted = members.filter(m => hasToday(m.name) && parsed[m.name]?.sodSubmitted);
  const eodSubmitted = members.filter(m => hasToday(m.name) && parsed[m.name]?.eodSubmitted);
  const notSubmitted = members.filter(m => !hasToday(m.name));
  const hasBlockers  = members.filter(m => hasToday(m.name) && parsed[m.name]?.blockers?.length > 0);
  const pcts         = members.filter(m => parsed[m.name]?.pct != null).map(m => parsed[m.name].pct);
  const avgPct       = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;

  const sendSlackReminder = async () => {
    if (!notSubmitted.length) return;
    setSlackSending(true);
    try {
      const res = await fetch("https://teampulse-api-pied.vercel.app/api/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members: notSubmitted.map(m => ({ name: m.name, email: m.email })) }),
      });
      const data = await res.json();
      if (data.success) {
        const msg = data.namedOnly > 0
          ? `Reminder sent! ${data.mentioned} member${data.mentioned !== 1 ? "s" : ""} @mentioned, ${data.namedOnly} listed by name.`
          : `Reminder sent! ${data.reminded} member${data.reminded !== 1 ? "s" : ""} @mentioned successfully.`;
        alert(msg);
      } else {
        alert(`Failed to send reminder: ${data.error}`);
      }
    } catch (e) {
      alert("Failed to send Slack reminder. Please check your connection.");
    }
    setSlackSending(false);
  };

  return (
    <div className="main-content">
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Team overview</div>
          <div className="text-sm text-muted">{fmt(TODAY)} · {members.length} team members</div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-ghost" onClick={reload}>↺ Refresh</button>
          {notSubmitted.length > 0 && (
            <button className="btn btn-green" onClick={sendSlackReminder} disabled={slackSending}>
              {slackSending ? "Sending..." : `💬 Send reminder (${notSubmitted.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Stats — 5 columns */}
      <div className="stats-grid mb-16" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{sodSubmitted.length}</div><div className="stat-label">SOD submitted</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{eodSubmitted.length}</div><div className="stat-label">EOD submitted</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--amber)" }}>{notSubmitted.length}</div><div className="stat-label">SOD pending</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{hasBlockers.length}</div><div className="stat-label">Active blockers</div></div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--amber)", fontSize: avgPct != null ? 18 : 22 }}>
            {avgPct != null ? `${avgPct}%` : "—"}
          </div>
          <div className="stat-label">Avg completion</div>
        </div>
      </div>

      {/* Member cards — full width rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {members.map(m => {
          const p      = parsed[m.name];
          const today  = hasToday(m.name);
          const color  = avatarColor(m.name);
          const bwS    = BW_STYLES[p?.bandwidth] || BW_STYLES[3];
          const bwLbl  = BANDWIDTH[p?.bandwidth]?.label;

          return (
            <div key={m.name}
              style={{
                background: "var(--bg)",
                border: `0.5px solid ${!today ? "var(--amber-bd)" : "var(--border)"}`,
                borderRadius: 10,
                overflow: "hidden",
                cursor: "pointer",
              }}
              onClick={() => onViewProfile(m.name)}>

              {/* Header row */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 14px",
                borderBottom: today ? "0.5px solid var(--border)" : "none",
                background: !today ? "var(--amber-bg)" : "var(--surface)",
              }}>
                <div className="avatar avatar-sq"
                  style={{ width: 28, height: 28, background: color + "22", color, fontSize: 10, borderRadius: 7, flexShrink: 0 }}>
                  {initials(m.name)}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: !today ? "var(--amber)" : "var(--text)" }}>
                  {m.name}
                </span>

                {today && p ? (
                  <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                    {p.sodSubmitted && (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 500, background: "var(--blue-bg,#eff6ff)", color: "var(--blue,#1d4ed8)", border: "0.5px solid var(--blue-bd,#bfdbfe)" }}>
                        SOD {p.sodTime ? `· ${p.sodTime}` : "✓"}
                      </span>
                    )}
                    {p.eodSubmitted ? (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 500, background: "var(--green-bg)", color: "var(--green)", border: "0.5px solid var(--green-bd)" }}>
                        EOD {p.eodTime ? `· ${p.eodTime}` : "✓"}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 500, background: "var(--amber-bg)", color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>
                        EOD pending
                      </span>
                    )}
                    {p.pct != null && (
                      <span className="badge badge-green" style={{ fontSize: 10 }}>{p.pct}% done</span>
                    )}
                    {p.blockers?.length > 0 && (
                      <span className="badge badge-red" style={{ fontSize: 10 }}>⚑ Blocker</span>
                    )}
                  </div>
                ) : (
                  <span className="badge badge-amber" style={{ fontSize: 10 }}>SOD not submitted</span>
                )}
              </div>

              {/* Body — shown when submitted today */}
              {today && p && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "11px 14px" }}>

                  {/* Planned tasks */}
                  <div>
                    <div className="field-label" style={{ marginBottom: 4 }}>Planned</div>
                    {p.tasks?.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {p.tasks.slice(0, 3).map((t, i) => (
                          <div key={i} style={{ fontSize: 12 }}>
                            {t.client && <span className="badge badge-blue" style={{ fontSize: 9, marginRight: 4 }}>{t.client}</span>}
                            {t.text}
                          </div>
                        ))}
                        {p.tasks.length > 3 && (
                          <div style={{ fontSize: 11, color: "var(--faint)" }}>+{p.tasks.length - 3} more</div>
                        )}
                      </div>
                    ) : <span style={{ fontSize: 12, color: "var(--faint)" }}>—</span>}
                  </div>

                  {/* Blockers */}
                  <div>
                    <div className="field-label" style={{ marginBottom: 4 }}>Blockers</div>
                    {p.blockers?.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {p.blockers.slice(0, 2).map((b, i) => (
                          <div key={i} style={{ fontSize: 11, color: "var(--red)", background: "var(--red-bg)", border: "0.5px solid var(--red-bd)", borderRadius: 4, padding: "2px 7px" }}>
                            {b.blocker || b}
                          </div>
                        ))}
                      </div>
                    ) : <span style={{ fontSize: 12, color: "var(--faint)", fontStyle: "italic" }}>None</span>}
                  </div>

                  {/* Completion / bandwidth */}
                  <div>
                    {p.eodSubmitted ? (
                      <>
                        <div className="field-label" style={{ marginBottom: 4 }}>Completion</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                          {p.eod?.tasks?.filter(t => t.outcome === "Done").length || 0} of {p.eod?.tasks?.length || 0} tasks done
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 2, width: `${p.pct}%`, background: p.pct === 100 ? "var(--green)" : "var(--accent)" }} />
                        </div>
                        {p.eod?.tomorrowFocus && (
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                            <span style={{ color: "var(--faint)" }}>Tomorrow: </span>{p.eod.tomorrowFocus}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="field-label" style={{ marginBottom: 4 }}>Bandwidth</div>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500, background: bwS.bg, color: bwS.color, border: `0.5px solid ${bwS.bd}` }}>
                          {bwLbl || "—"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {!today && (
                <div style={{ padding: "9px 14px", fontSize: 12, color: "var(--faint)", fontStyle: "italic" }}>
                  No update submitted today.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
