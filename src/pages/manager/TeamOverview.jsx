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

// Chip colour by EOD outcome (or SOD-only = blue = in progress)
function chipStyle(outcome) {
  if (outcome === "Done")       return { bg: "var(--green-bg)", bd: "var(--green-bd)", dot: "var(--green)",  text: "var(--green)"  };
  if (outcome === "Carry over") return { bg: "var(--amber-bg)", bd: "var(--amber-bd)", dot: "var(--amber)",  text: "var(--amber)"  };
  if (outcome === "Blocked")    return { bg: "var(--red-bg)",   bd: "var(--red-bd)",   dot: "var(--red)",    text: "var(--red)"    };
  // SOD-only / in progress
  return { bg: "var(--surface)", bd: "var(--border)", dot: "var(--blue)", text: "var(--muted)" };
}

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Task chip ─────────────────────────────────────────────────────────────────
function TaskChip({ task }) {
  const { bg, bd, dot, text } = chipStyle(task.outcome);
  const isBlocked   = task.outcome === "Blocked";
  const isRecurring = task.isRecurring === true;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      background: isRecurring ? "#EEEDFE20" : bg,
      border: `0.5px solid ${isRecurring ? "#AFA9EC" : bd}`,
      borderRadius: 6, padding: "3px 8px", flexShrink: 0,
    }}>
      {isRecurring
        ? <span style={{ fontSize: 9, color: "#534AB7", flexShrink: 0 }}>↻</span>
        : <div style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0 }} />}
      {task.client && (
        <span style={{ fontSize: 10, color: isRecurring ? "#534AB7" : text, fontWeight: 500, whiteSpace: "nowrap" }}>{task.client}</span>
      )}
      <span style={{
        fontSize: 10, color: isRecurring ? "#534AB7" : text, whiteSpace: "nowrap",
        maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {task.text}{isBlocked ? " ⚑" : ""}
      </span>
    </div>
  );
}

// ── Member row ────────────────────────────────────────────────────────────────
function MemberRow({ member, entry, onViewProfile, isLast }) {
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

  // Build display tasks with outcome from EOD merged in
  const displayTasks = eodSubmitted
    ? eodTasks.map((t, i) => ({
        client:     t.client     || sodTasks[i]?.client     || "",
        text:       t.text       || sodTasks[i]?.text       || "",
        priority:   t.priority   || sodTasks[i]?.priority   || "Medium",
        outcome:    t.outcome,
        isRecurring: sodTasks[i]?.isRecurring === true,
      }))
    : sodTasks.map(t => ({ client: t.client || "", text: t.text || "", priority: t.priority || "Medium", outcome: null, isRecurring: t.isRecurring === true }));

  const valid      = displayTasks.filter(t => t.text?.trim());
  // Exclude recurring tasks from done% — they are ops tasks, not project completion
  const projectValid = valid.filter(t => !t.isRecurring);
  const total      = projectValid.length;
  const done       = projectValid.filter(t => t.outcome === "Done").length;
  const blocked    = valid.filter(t => t.outcome === "Blocked").length;
  const hasBlocker = blocked > 0 || sodTasks.some(t => t.blocker?.trim());
  const pct        = eodSubmitted && total ? Math.round(done / total * 100) : null;
  const pctColor   = pct === 100 ? "var(--green)" : pct != null && pct > 50 ? "var(--accent)" : "var(--amber)";

  return (
    <div
      onClick={() => onViewProfile(member.name)}
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr auto",
        borderBottom: isLast ? "none" : "0.5px solid var(--border)",
        background: !hasToday ? "var(--amber-bg)" : "transparent",
        cursor: "pointer",
        transition: "background 0.1s",
      }}>

      {/* ── Left: identity ── */}
      <div style={{
        padding: "10px 14px",
        borderRight: "0.5px solid var(--border)",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 6,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: color + "22", color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
            {initials(member.name)}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500,
              color: !hasToday ? "var(--muted)" : "var(--text)" }}>{member.name}</div>
            <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 1 }}>
              {sodSubmitted ? `SOD ${fmtTime(sod.submittedAt)}` : ""}
              {eodSubmitted ? ` · EOD ${fmtTime(eod.submittedAt)}`
                : sodSubmitted ? " · EOD pending" : ""}
            </div>
          </div>
        </div>
        <div style={{ paddingLeft: 38, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {bwL && hasToday && (
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
              color: bwS.color, background: bwS.bg, border: `0.5px solid ${bwS.bd}` }}>{bwL}</span>
          )}
          {!hasToday && (
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
              background: "var(--amber-bg)", color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>
              Not submitted
            </span>
          )}
          {hasBlocker && (
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
              background: "var(--red-bg)", color: "var(--red)", border: "0.5px solid var(--red-bd)" }}>
              ⚑ {blocked} blocker{blocked !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Middle: task chips ── */}
      <div style={{
        padding: "10px 14px",
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5,
      }}>
        {!hasToday ? (
          <span style={{ fontSize: 11, color: "var(--faint)", fontStyle: "italic" }}>
            Last entry: {entry ? fmt(entry.date) : "never"}
          </span>
        ) : valid.length > 0 ? (
          <>
            {valid.map((t, i) => <TaskChip key={i} task={t} />)}
          </>
        ) : (
          <span style={{ fontSize: 11, color: "var(--faint)", fontStyle: "italic" }}>No tasks recorded</span>
        )}
      </div>

      {/* ── Right: done % ── */}
      <div style={{
        padding: "10px 18px",
        borderLeft: "0.5px solid var(--border)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 2,
        minWidth: 72,
      }}>
        {pct != null ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 500, color: pctColor, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 9, color: "var(--faint)" }}>{done} of {total}</div>
          </>
        ) : hasToday && total > 0 ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--blue)", lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: 9, color: "var(--faint)" }}>project</div>
          </>
        ) : hasToday ? (
          <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); }}
            style={{ fontSize: 10, padding: "3px 9px", borderRadius: 6,
              border: "0.5px solid var(--amber-bd)", background: "transparent",
              color: "var(--amber)", cursor: "pointer", fontFamily: "inherit" }}>
            Remind
          </button>
        )}
      </div>
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
  const bwValues   = submittedToday.map(m =>
    latest[m.name]?.sod?.bandwidth || latest[m.name]?.bandwidth).filter(Boolean);
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

  // Sort: blocked first → submitted → not submitted
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

      {/* Standup table */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {/* Column headers */}
        <div style={{
          display: "grid", gridTemplateColumns: "220px 1fr auto",
          padding: "6px 14px", background: "var(--bg)",
          borderBottom: "0.5px solid var(--border)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--faint)" }}>Member</div>
          <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--faint)", paddingLeft: 14 }}>Today's tasks</div>
          <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--faint)", paddingRight: 4, minWidth: 72, textAlign: "center" }}>Done</div>
        </div>

        {sorted.map((m, i) => (
          <MemberRow
            key={m.name}
            member={m}
            entry={latest[m.name]}
            onViewProfile={onViewProfile}
            isLast={i === sorted.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
