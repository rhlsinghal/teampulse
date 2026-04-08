import { useState, useEffect } from "react";
import { avatarColor, initials, BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { loadAllMembersLatest } from "../../hooks/useHistory";
import { Loading } from "../../components/index.jsx";

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Inline tri-bar (done / carry / blocked) ───────────────────────────────────
function TriBar({ done, carry, blocked, total }) {
  if (!total) return <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>;
  const donePct    = Math.round(done    / total * 100);
  const carryPct   = Math.round(carry   / total * 100);
  const blockedPct = Math.round(blocked / total * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {[
        { pct: donePct,    color: "var(--green)",  label: `${done} done`    },
        { pct: carryPct,   color: "var(--amber)",  label: `${carry} carry`  },
        { pct: blockedPct, color: "var(--red)",    label: `${blocked} blocked` },
      ].map(({ pct, color, label }) => (
        pct > 0 ? (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: color }} />
            </div>
            <span style={{ fontSize: 9, color, width: 56, whiteSpace: "nowrap" }}>{label}</span>
          </div>
        ) : null
      ))}
    </div>
  );
}

// ── Completion % circle ───────────────────────────────────────────────────────
function PctBadge({ done, total, eodSubmitted }) {
  if (!eodSubmitted || !total) return <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>;
  const pct = Math.round(done / total * 100);
  const color = pct === 100 ? "var(--green)" : pct > 50 ? "var(--accent)" : "var(--amber)";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 500, color, lineHeight: 1 }}>{pct}%</div>
      <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 1 }}>{done}/{total}</div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
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
      setLatest(res); setLoading(false);
    });
  }, [members, tick]);

  if (loading) return <div className="main-content"><Loading /></div>;

  if (!members.length) return (
    <div className="main-content">
      <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--muted)" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          No team members yet.<br />Go to <strong>Allowed Users</strong> to invite your team.
        </div>
      </div>
    </div>
  );

  const submittedToday = members.filter(m => latest[m.name]?.date === TODAY);
  const notSubmitted   = members.filter(m => latest[m.name]?.date !== TODAY);
  const blockedMembers = members.filter(m => {
    const e = latest[m.name];
    if (e?.date !== TODAY) return false;
    return (e?.eod?.tasks || []).some(t => t.outcome === "Blocked") ||
           (e?.sod?.tasks || []).some(t => t.blocker?.trim()) ||
           !!e?.blockers?.trim();
  });
  const bwValues   = submittedToday.map(m => latest[m.name]?.sod?.bandwidth || latest[m.name]?.bandwidth).filter(Boolean);
  const avgBw      = bwValues.length ? Math.round(bwValues.reduce((a, b) => a + b, 0) / bwValues.length) : null;
  const avgBwS     = BW_STYLES[avgBw] || BW_STYLES[3];
  const avgBwLabel = avgBw ? BANDWIDTH[avgBw]?.label : "—";

  const sendSlackReminder = async () => {
    if (!notSubmitted.length) return;
    setSlackSending(true);
    try {
      const res = await fetch("https://teampulse-api-pied.vercel.app/api/slack", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members: notSubmitted.map(m => ({ name: m.name, email: m.email })) }),
      });
      const data = await res.json();
      alert(data.success
        ? `Reminder sent to ${data.reminded} member${data.reminded !== 1 ? "s" : ""}.`
        : `Failed: ${data.error}`);
    } catch { alert("Failed to send Slack reminder."); }
    setSlackSending(false);
  };

  // Sort: blocked first, then submitted, then not submitted
  const sorted = [
    ...members.filter(m => {
      const e = latest[m.name];
      return e?.date === TODAY && (
        (e?.eod?.tasks || []).some(t => t.outcome === "Blocked") ||
        (e?.sod?.tasks || []).some(t => t.blocker?.trim())
      );
    }),
    ...members.filter(m => {
      const e = latest[m.name];
      if (e?.date !== TODAY) return false;
      return !(e?.eod?.tasks || []).some(t => t.outcome === "Blocked") &&
             !(e?.sod?.tasks || []).some(t => t.blocker?.trim());
    }),
    ...members.filter(m => latest[m.name]?.date !== TODAY),
  ];

  return (
    <div className="main-content">
      {/* Header */}
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Team overview</div>
          <div className="text-sm text-muted">{fmt(TODAY)} · {members.length} members</div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-ghost" onClick={reload}>↺ Refresh</button>
          {notSubmitted.length > 0 && (
            <button className="btn btn-green" onClick={sendSlackReminder} disabled={slackSending}>
              {slackSending ? "Sending..." : `💬 Remind (${notSubmitted.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid stats-grid-4 mb-16">
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{submittedToday.length}</div><div className="stat-label">Submitted today</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--faint)" }}>{notSubmitted.length}</div><div className="stat-label">Not submitted</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{blockedMembers.length}</div><div className="stat-label">Active blockers</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: avgBwS.color, fontSize: 16, paddingTop: 2 }}>{avgBwLabel}</div><div className="stat-label">Avg bandwidth</div></div>
      </div>

      {/* Roster table */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "180px 85px 95px 1fr 190px 64px",
          padding: "7px 14px",
          background: "var(--bg)",
          borderBottom: "0.5px solid var(--border)",
          gap: 8,
        }}>
          {["Member", "Bandwidth", "Status", "Today's tasks", "Task progress", "Done"].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--faint)" }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {sorted.map((m, idx) => {
          const entry        = latest[m.name];
          const hasToday     = entry?.date === TODAY;
          const sod          = entry?.sod  || null;
          const eod          = entry?.eod  || null;
          const sodSubmitted = !!sod?.submittedAt;
          const eodSubmitted = !!eod?.submittedAt;
          const color        = avatarColor(m.name);
          const bw           = sod?.bandwidth || entry?.bandwidth;
          const bwS          = BW_STYLES[bw]  || BW_STYLES[3];
          const bwL          = BANDWIDTH[bw]?.label;

          const sodTasks = sod?.tasks || [];
          const eodTasks = eod?.tasks || [];
          const displayTasks = eodSubmitted
            ? eodTasks.map((t, i) => ({ ...t, priority: t.priority || sodTasks[i]?.priority || "Medium" }))
            : sodTasks;
          const valid    = displayTasks.filter(t => t.text?.trim());
          const total    = valid.length;
          const done     = valid.filter(t => t.outcome === "Done").length;
          const carry    = valid.filter(t => t.outcome === "Carry over").length;
          const blocked  = valid.filter(t => t.outcome === "Blocked").length;

          const hasBlocker = blocked > 0 || sodTasks.some(t => t.blocker?.trim());
          const isLast     = idx === sorted.length - 1;

          // Compact task list — client + task name, comma separated
          return (
            <div key={m.name}
              onClick={() => onViewProfile(m.name)}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 85px 95px 1fr 190px 64px",
                padding: "10px 14px",
                gap: 8,
                alignItems: "center",
                cursor: "pointer",
                borderBottom: isLast ? "none" : "0.5px solid var(--border)",
                background: !hasToday ? "var(--amber-bg)"
                  : hasBlocker ? "var(--red-bg)" + "18"
                  : "transparent",
              }}>

              {/* Member */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  background: color + "22", color, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 10, fontWeight: 500 }}>
                  {initials(m.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500,
                    color: !hasToday ? "var(--muted)" : "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 1 }}>
                    {sodSubmitted ? `SOD ${fmtTime(sod.submittedAt)}` : ""}
                    {eodSubmitted ? ` · EOD ${fmtTime(eod.submittedAt)}` : sodSubmitted ? " · EOD pending" : ""}
                  </div>
                </div>
              </div>

              {/* Bandwidth */}
              <div>
                {bwL && hasToday ? (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                    color: bwS.color, background: bwS.bg, border: `0.5px solid ${bwS.bd}` }}>{bwL}</span>
                ) : <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>}
              </div>

              {/* Status */}
              <div>
                {!hasToday ? (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                    background: "var(--amber-bg)", color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>
                    Not submitted
                  </span>
                ) : hasBlocker ? (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                    background: "var(--red-bg)", color: "var(--red)", border: "0.5px solid var(--red-bd)" }}>
                    ⚑ Blocked
                  </span>
                ) : eodSubmitted ? (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                    background: "var(--green-bg)", color: "var(--green)", border: "0.5px solid var(--green-bd)" }}>
                    EOD done
                  </span>
                ) : sodSubmitted ? (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                    background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>
                    SOD only
                  </span>
                ) : <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>}
              </div>

              {/* Today's tasks — stacked, up to 3 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {!hasToday ? (
                  <span style={{ fontSize: 11, fontStyle: "italic", color: "var(--faint)" }}>Last: {entry ? fmt(entry.date) : "never"}</span>
                ) : total > 0 ? (
                  <>
                    {valid.slice(0, 3).map((t, ti) => (
                      <div key={ti} style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        {t.client && (
                          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 10, fontWeight: 500,
                            background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)",
                            flexShrink: 0, whiteSpace: "nowrap" }}>{t.client}</span>
                        )}
                        <span style={{ fontSize: 11, color: "var(--muted)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.text}</span>
                      </div>
                    ))}
                    {valid.length > 3 && (
                      <span style={{ fontSize: 10, color: "var(--faint)" }}>+{valid.length - 3} more</span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 11, fontStyle: "italic", color: "var(--faint)" }}>No tasks</span>
                )}
              </div>

              {/* Task progress bars */}
              <div>
                {hasToday && eodSubmitted && total > 0
                  ? <TriBar done={done} carry={carry} blocked={blocked} total={total} />
                  : hasToday && total > 0
                    ? <div style={{ fontSize: 11, color: "var(--muted)" }}>{total} planned · EOD pending</div>
                    : <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>}
              </div>

              {/* Done % */}
              <PctBadge done={done} total={total} eodSubmitted={eodSubmitted && hasToday} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
