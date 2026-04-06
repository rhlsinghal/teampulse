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

  // Merge SOD dates into EOD for display
  const displayTasks = eodSubmitted
    ? eodTasks.map((t, i) => ({
        ...t,
        priority:  t.priority  || sodTasks[i]?.priority  || "Medium",
        startDate: t.startDate || sodTasks[i]?.startDate || "",
        dueDate:   t.dueDate   || sodTasks[i]?.dueDate   || "",
      }))
    : sodTasks;

  const total    = displayTasks.filter(t => t.text?.trim()).length;
  const done     = displayTasks.filter(t => t.outcome === "Done").length;
  const blocked  = displayTasks.filter(t => t.outcome === "Blocked").length;
  const carry    = displayTasks.filter(t => t.outcome === "Carry over").length;
  const pct      = eodSubmitted && total ? Math.round(done / total * 100) : null;

  // Border colour signal
  const borderColor = !hasToday
    ? "var(--amber-bd)"
    : blocked > 0 ? "var(--red-bd)" : "var(--border)";

  return (
    <div onClick={() => onViewProfile(member.name)}
      style={{ border: `0.5px solid ${borderColor}`, borderRadius: 12, overflow: "hidden",
        cursor: "pointer", background: "var(--surface)", display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <div style={{ padding: "11px 13px", display: "flex", alignItems: "center", gap: 9,
        background: !hasToday ? "var(--amber-bg)" : "var(--surface)",
        borderBottom: "0.5px solid var(--border)" }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: color + "22", color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
          {initials(member.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{member.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {/* Bandwidth */}
            {bwL && hasToday && (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                color: bwS.color, background: bwS.bg, border: `0.5px solid ${bwS.bd}` }}>{bwL}</span>
            )}
            {/* SOD */}
            {sodSubmitted && (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>
                SOD {fmtTime(sod.submittedAt)}
              </span>
            )}
            {/* EOD */}
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
            {/* Blocker */}
            {blocked > 0 && (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                background: "var(--red-bg)", color: "var(--red)", border: "0.5px solid var(--red-bd)" }}>
                ⚑ {blocked} blocker{blocked > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        {/* Completion */}
        {pct != null && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 500,
              color: pct === 100 ? "var(--green)" : "var(--accent)" }}>{pct}%</span>
            <div style={{ width: 50, height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2,
                background: pct === 100 ? "var(--green)" : "var(--accent)" }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Not submitted ── */}
      {!hasToday && (
        <div style={{ padding: "12px 13px", fontSize: 12, color: "var(--faint)", fontStyle: "italic", flex: 1 }}>
          No update today · Last: {entry ? fmt(entry.date) : "never"}
        </div>
      )}

      {/* ── Task table ── */}
      {hasToday && total > 0 && (
        <div style={{ overflowX: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                {[
                  { label: "Task",       w: undefined },
                  { label: "Priority",   w: 70  },
                  { label: "Start",      w: 82  },
                  { label: "Due",        w: 82  },
                  { label: "End",        w: 82  },
                  { label: eodSubmitted ? "Outcome" : "", w: 90 },
                ].filter(h => h.label).map((h, i) => (
                  <th key={i} style={{ textAlign: "left", fontSize: 9, fontWeight: 500,
                    textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--faint)",
                    padding: "5px 10px", borderBottom: "0.5px solid var(--border)",
                    width: h.w, whiteSpace: "nowrap" }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayTasks.filter(t => t.text?.trim()).map((t, i) => {
                const ps = PRIORITY_STYLE[t.priority || "Medium"];
                const os = OUTCOME_STYLE[t.outcome];
                const overdue = t.dueDate && t.dueDate < TODAY && t.outcome !== "Done";
                return (
                  <tr key={i} style={{ borderTop: "0.5px solid var(--border)",
                    background: t.outcome === "Blocked" ? "var(--red-bg)"
                      : t.adhoc ? "#fffbeb" : "transparent" }}>
                    <td style={{ padding: "6px 10px", minWidth: 120 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        {t.client && (
                          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 10, fontWeight: 500,
                            background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)",
                            whiteSpace: "nowrap" }}>{t.client}</span>
                        )}
                        <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4 }}>{t.text}</span>
                        {t.adhoc && (
                          <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 8,
                            background: "#fffbeb", color: "#854F0B", border: "0.5px solid #FAC775" }}>ad-hoc</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 500,
                        color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}`,
                        whiteSpace: "nowrap" }}>{t.priority || "Medium"}</span>
                    </td>
                    <td style={{ padding: "6px 10px", fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {t.startDate || "—"}
                    </td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                      {t.dueDate ? (
                        <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace",
                          color: overdue ? "var(--red)" : "var(--muted)",
                          background: overdue ? "var(--red-bg)" : "transparent",
                          padding: overdue ? "1px 4px" : 0, borderRadius: overdue ? 3 : 0,
                          fontWeight: overdue ? 500 : 400 }}>
                          {t.dueDate}{overdue ? " ⚠" : ""}
                        </span>
                      ) : <span style={{ fontSize: 10, color: "var(--faint)" }}>—</span>}
                    </td>
                    <td style={{ padding: "6px 10px", fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                      color: t.endDate ? "var(--green)" : "var(--faint)", whiteSpace: "nowrap" }}>
                      {t.endDate || "—"}
                    </td>
                    {eodSubmitted && (
                      <td style={{ padding: "6px 10px" }}>
                        {os ? (
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, fontWeight: 500,
                            color: os.color, background: os.bg, border: `0.5px solid ${os.bd}`,
                            whiteSpace: "nowrap" }}>{t.outcome}</span>
                        ) : <span style={{ fontSize: 10, color: "var(--faint)" }}>—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Summary footer ── */}
      {hasToday && total > 0 && (
        <div style={{ padding: "7px 13px", borderTop: "0.5px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          background: "var(--bg)" }}>
          <span style={{ fontSize: 10, color: "var(--muted)" }}>{total} task{total !== 1 ? "s" : ""}</span>
          {eodSubmitted && (
            <>
              {done > 0    && <span style={{ fontSize: 10, color: "var(--green)" }}>✓ {done} done</span>}
              {carry > 0   && <span style={{ fontSize: 10, color: "var(--amber)" }}>↪ {carry} carry</span>}
              {blocked > 0 && <span style={{ fontSize: 10, color: "var(--red)" }}>⚑ {blocked} blocked</span>}
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--faint)" }}>Click to view profile →</span>
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
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>No team members yet.<br />Go to <strong>Allowed Users</strong> to invite your team.</div>
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

  // Submitted first, then not submitted
  const sorted = [
    ...members.filter(m => latest[m.name]?.date === TODAY),
    ...members.filter(m => latest[m.name]?.date !== TODAY),
  ];

  // Pair into rows of 2
  const rows = [];
  for (let i = 0; i < sorted.length; i += 2) rows.push(sorted.slice(i, i + 2));

  return (
    <div className="main-content">
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

      <div className="stats-grid stats-grid-4 mb-16">
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{submittedToday.length}</div><div className="stat-label">Submitted today</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--faint)" }}>{notSubmitted.length}</div><div className="stat-label">Not submitted</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{blockedMembers.length}</div><div className="stat-label">Active blockers</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: avgBwS.color, fontSize: 16, paddingTop: 2 }}>{avgBwLabel}</div><div className="stat-label">Avg bandwidth</div></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
            {row.map(m => (
              <MemberCard key={m.name} member={m} entry={latest[m.name]} onViewProfile={onViewProfile} />
            ))}
            {/* Fill empty slot if odd number */}
            {row.length === 1 && <div />}
          </div>
        ))}
      </div>
    </div>
  );
}
