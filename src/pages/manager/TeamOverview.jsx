import { useState, useEffect } from "react";
import { avatarColor, initials, BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { loadAllMembersLatest } from "../../hooks/useHistory";
import { Loading } from "../../components/index.jsx";

const PRIORITY_STYLE = {
  "High":   { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "Medium": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Low":    { color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
};
const OUTCOME_STYLE = {
  "Done":       { color: "var(--green)", bg: "var(--green-bg)", bd: "var(--green-bd)" },
  "Carry over": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Blocked":    { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
};

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Completion ring ───────────────────────────────────────────────────────────
function Ring({ pct, done, total, color }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const fill = pct != null ? (circ * pct) / 100 : 0;
  const ringColor = pct == null ? "var(--border)"
    : pct === 100 ? "var(--green)"
    : color || "var(--accent)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        {pct != null && pct > 0 && (
          <circle cx="22" cy="22" r={r} fill="none" stroke={ringColor} strokeWidth="4"
            strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
        )}
        <text x="22" y="26" textAnchor="middle" fontSize="9" fontWeight="500"
          fill={pct == null ? "var(--faint)" : ringColor}
          style={{ transform: "rotate(90deg)", transformOrigin: "22px 22px" }}>
          {pct != null ? `${pct}%` : "SOD"}
        </text>
      </svg>
      <span style={{ fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap" }}>
        {pct != null ? `${done}/${total}` : "only"}
      </span>
    </div>
  );
}

// ── Member card ───────────────────────────────────────────────────────────────
function MemberCard({ member, entry, onViewProfile }) {
  const color        = avatarColor(member.name);
  const hasToday     = entry?.date === TODAY;
  const sod          = entry?.sod  || null;
  const eod          = entry?.eod  || null;
  const sodSubmitted = !!sod?.submittedAt;
  const eodSubmitted = !!eod?.submittedAt;
  const bw           = sod?.bandwidth || entry?.bandwidth;
  const bwS          = BW_STYLES[bw]  || BW_STYLES[3];
  const bwL          = BANDWIDTH[bw]?.label;

  const sodTasks = sod?.tasks || [];
  const eodTasks = eod?.tasks || [];

  const displayTasks = eodSubmitted
    ? eodTasks.map((t, i) => ({
        ...t,
        priority:  t.priority  || sodTasks[i]?.priority  || "Medium",
        startDate: t.startDate || sodTasks[i]?.startDate || "",
        dueDate:   t.dueDate   || sodTasks[i]?.dueDate   || "",
      }))
    : sodTasks;

  const validTasks = displayTasks.filter(t => t.text?.trim());
  const total    = validTasks.length;
  const done     = validTasks.filter(t => t.outcome === "Done").length;
  const blocked  = validTasks.filter(t => t.outcome === "Blocked").length;
  const carry    = validTasks.filter(t => t.outcome === "Carry over").length;
  const pct      = eodSubmitted && total ? Math.round(done / total * 100) : null;

  // Top strip colour
  const stripColor = !hasToday ? "#FAC775"
    : blocked > 0  ? "var(--red)"
    : eodSubmitted && pct === 100 ? "var(--green)"
    : eodSubmitted ? "var(--accent)"
    : sodSubmitted ? "#378ADD"
    : "#FAC775";

  // Card border
  const borderColor = !hasToday ? "var(--amber-bd)"
    : blocked > 0  ? "var(--red-bd)"
    : "var(--border)";

  // Top blocker or top task for bottom strip
  const topBlocker = validTasks.find(t => t.outcome === "Blocked");
  const topTask    = validTasks[0];

  return (
    <div onClick={() => onViewProfile(member.name)}
      style={{ border: `0.5px solid ${borderColor}`, borderRadius: 12, overflow: "hidden",
        cursor: "pointer", background: "var(--surface)", display: "flex", flexDirection: "column",
        transition: "border-color 0.15s" }}>

      {/* Coloured top strip */}
      <div style={{ height: 3, background: stripColor, flexShrink: 0 }} />

      {/* Main body */}
      <div style={{ padding: "11px 13px", display: "flex", gap: 11, alignItems: "flex-start", flex: 1 }}>

        {/* Left: avatar + bandwidth */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: color + "22", color,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500 }}>
            {initials(member.name)}
          </div>
          {bwL && hasToday && (
            <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 20, fontWeight: 500,
              color: bwS.color, background: bwS.bg, border: `0.5px solid ${bwS.bd}`, whiteSpace: "nowrap" }}>
              {bwL}
            </span>
          )}
        </div>

        {/* Middle: name + badges + task pills */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5, color: hasToday ? "var(--text)" : "var(--muted)" }}>
            {member.name}
          </div>

          {/* Submission badges */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: hasToday && total > 0 ? 8 : 0 }}>
            {sodSubmitted && (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>
                SOD {fmtTime(sod.submittedAt)}
              </span>
            )}
            {eodSubmitted ? (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                background: "var(--green-bg)", color: "var(--green)", border: "0.5px solid var(--green-bd)" }}>
                EOD {fmtTime(eod.submittedAt)}
              </span>
            ) : sodSubmitted ? (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                background: "var(--amber-bg)", color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>
                EOD pending
              </span>
            ) : !hasToday ? (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                background: "var(--amber-bg)", color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>
                Not submitted
              </span>
            ) : null}
          </div>

          {/* Outcome pills — only when EOD submitted */}
          {eodSubmitted && total > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {done  > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5,
                background: "var(--green-bg)", color: "var(--green)" }}>✓ {done} done</span>}
              {carry > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5,
                background: "var(--amber-bg)", color: "var(--amber)" }}>↪ {carry} carry</span>}
              {blocked > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5,
                background: "var(--red-bg)", color: "var(--red)" }}>⚑ {blocked} blocked</span>}
            </div>
          )}

          {/* SOD-only task count */}
          {sodSubmitted && !eodSubmitted && total > 0 && (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{total} task{total !== 1 ? "s" : ""} planned</div>
          )}

          {/* Not submitted */}
          {!hasToday && (
            <div style={{ fontSize: 11, color: "var(--faint)", fontStyle: "italic", marginTop: 2 }}>
              Last entry: {entry ? fmt(entry.date) : "never"}
            </div>
          )}
        </div>

        {/* Right: completion ring */}
        {hasToday && (sodSubmitted || eodSubmitted) && (
          <Ring
            pct={pct}
            done={done}
            total={total}
            color={blocked > 0 ? "var(--red)" : "var(--accent)"}
          />
        )}
      </div>

      {/* Bottom strip — top blocker or top task */}
      {hasToday && (topBlocker || topTask) && (
        <div style={{ borderTop: "0.5px solid var(--border)", padding: "6px 13px",
          background: topBlocker ? "var(--red-bg)" : "var(--bg)",
          display: "flex", alignItems: "center", gap: 7 }}>
          {topBlocker ? (
            <>
              <span style={{ fontSize: 10, color: "var(--red)", flexShrink: 0 }}>⚑</span>
              <span style={{ fontSize: 11, color: "var(--red)", flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {topBlocker.text}{topBlocker.blockerDetail ? ` — ${topBlocker.blockerDetail}` : ""}
              </span>
            </>
          ) : (
            <>
              {topTask.client && (
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 10, fontWeight: 500,
                  background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)",
                  flexShrink: 0, whiteSpace: "nowrap" }}>{topTask.client}</span>
              )}
              <span style={{ fontSize: 11, color: "var(--muted)", flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {topTask.text}
              </span>
              {topTask.priority && (() => {
                const ps = PRIORITY_STYLE[topTask.priority];
                return ps ? (
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                    color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}`,
                    flexShrink: 0 }}>{topTask.priority}</span>
                ) : null;
              })()}
            </>
          )}
        </div>
      )}
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
    return (e?.eod?.tasks  || []).some(t => t.outcome === "Blocked") ||
           (e?.sod?.tasks  || []).some(t => t.blocker?.trim())       ||
           !!e?.blockers?.trim();
  });

  const bwValues   = submittedToday.map(m =>
    latest[m.name]?.sod?.bandwidth || latest[m.name]?.bandwidth).filter(Boolean);
  const avgBw      = bwValues.length
    ? Math.round(bwValues.reduce((a, b) => a + b, 0) / bwValues.length) : null;
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

  // Pair into rows of 2
  const rows = [];
  for (let i = 0; i < sorted.length; i += 2) rows.push(sorted.slice(i, i + 2));

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
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--green)" }}>{submittedToday.length}</div>
          <div className="stat-label">Submitted today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--faint)" }}>{notSubmitted.length}</div>
          <div className="stat-label">Not submitted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--red)" }}>{blockedMembers.length}</div>
          <div className="stat-label">Active blockers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: avgBwS.color, fontSize: 16, paddingTop: 2 }}>
            {avgBwLabel}
          </div>
          <div className="stat-label">Avg bandwidth</div>
        </div>
      </div>

      {/* 2-col card grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "start" }}>
            {row.map(m => (
              <MemberCard
                key={m.name}
                member={m}
                entry={latest[m.name]}
                onViewProfile={onViewProfile}
              />
            ))}
            {row.length === 1 && <div />}
          </div>
        ))}
      </div>
    </div>
  );
}
