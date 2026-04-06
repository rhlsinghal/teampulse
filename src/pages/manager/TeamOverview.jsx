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

function isDuePast(dueDate, outcome) {
  return dueDate && dueDate < TODAY && outcome !== "Done";
}

// ── Member card ───────────────────────────────────────────────────────────────
function MemberCard({ member, entry, onViewProfile }) {
  const color      = avatarColor(member.name);
  const hasToday   = entry?.date === TODAY;
  const sod        = entry?.sod  || null;
  const eod        = entry?.eod  || null;
  const sodSubmitted = !!sod?.submittedAt;
  const eodSubmitted = !!eod?.submittedAt;

  // Normalise tasks — use EOD if submitted, else SOD
  const sodTasks   = sod?.tasks || [];
  const eodTasks   = eod?.tasks || [];
  const displayTasks = eodSubmitted
    ? eodTasks.map((t, i) => ({
        client:        t.client        || sodTasks[i]?.client || "",
        text:          t.text          || sodTasks[i]?.text   || "",
        priority:      t.priority      || sodTasks[i]?.priority || "Medium",
        startDate:     sodTasks[i]?.startDate || "",
        dueDate:       t.dueDate       || sodTasks[i]?.dueDate  || "",
        endDate:       t.endDate       || "",
        outcome:       t.outcome       || "",
        adhoc:         t.adhoc         || false,
        blockerDetail: t.blockerDetail || "",
      }))
    : sodTasks.map(t => ({
        client:    t.client    || "",
        text:      t.text      || "",
        priority:  t.priority  || "Medium",
        startDate: t.startDate || "",
        dueDate:   t.dueDate   || "",
        endDate:   "",
        outcome:   "",
        adhoc:     false,
      }));

  const doneCount    = displayTasks.filter(t => t.outcome === "Done").length;
  const blockedCount = displayTasks.filter(t => t.outcome === "Blocked").length;
  const carryCount   = displayTasks.filter(t => t.outcome === "Carry over").length;
  const totalTasks   = displayTasks.length;
  const pct          = eodSubmitted && totalTasks ? Math.round(doneCount / totalTasks * 100) : null;
  const bw           = sod?.bandwidth || entry?.bandwidth;
  const bwS          = BW_STYLES[bw] || BW_STYLES[3];
  const bwL          = BANDWIDTH[bw]?.label;

  // Legacy (old schema) support
  const isLegacy = !sod && entry;

  return (
    <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 0,
      borderColor: !hasToday ? "var(--amber-bd)" : blockedCount > 0 ? "var(--red-bd)" : "var(--border)" }}>

      {/* ── Card header ── */}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
        background: !hasToday ? "var(--amber-bg)" : "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>

        {/* Avatar */}
        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + "22", color,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
          {initials(member.name)}
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{member.name}</span>

            {/* Bandwidth */}
            {bwL && (
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                color: bwS.color, background: bwS.bg, border: `0.5px solid ${bwS.bd}` }}>{bwL}</span>
            )}

            {/* SOD badge */}
            {sodSubmitted && (
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                background: "var(--blue-bg)", color: "var(--blue)", border: "0.5px solid var(--blue-bd)" }}>
                SOD {fmtTime(sod.submittedAt)}
              </span>
            )}

            {/* EOD badge */}
            {eodSubmitted ? (
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                background: "var(--green-bg)", color: "var(--green)", border: "0.5px solid var(--green-bd)" }}>
                EOD {fmtTime(eod.submittedAt)}
              </span>
            ) : sodSubmitted ? (
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                background: "var(--amber-bg)", color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>
                EOD pending
              </span>
            ) : null}

            {/* Not submitted */}
            {!hasToday && (
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                background: "var(--amber-bg)", color: "var(--amber)", border: "0.5px solid var(--amber-bd)" }}>
                Not submitted
              </span>
            )}

            {/* Blocker */}
            {blockedCount > 0 && (
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, fontWeight: 500,
                background: "var(--red-bg)", color: "var(--red)", border: "0.5px solid var(--red-bd)" }}>
                ⚑ {blockedCount} blocker{blockedCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Completion bar + view profile */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {pct != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ height: 4, width: 64, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2,
                  background: pct === 100 ? "var(--green)" : "var(--accent)", transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>{doneCount}/{totalTasks}</span>
            </div>
          )}
          <button onClick={() => onViewProfile(member.name)}
            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "0.5px solid var(--border)",
              background: "transparent", color: "var(--muted)", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            Profile →
          </button>
        </div>
      </div>

      {/* ── No update today ── */}
      {!hasToday && (
        <div style={{ padding: "14px 14px", color: "var(--faint)", fontSize: 12, fontStyle: "italic" }}>
          No update submitted today. Last entry: {entry ? fmt(entry.date) : "never"}
        </div>
      )}

      {/* ── Legacy entry ── */}
      {isLegacy && hasToday && (
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{entry.today || "—"}</div>
          {entry.blockers && (
            <div style={{ fontSize: 11, color: "var(--red)", background: "var(--red-bg)", padding: "4px 9px", borderRadius: 5, border: "0.5px solid var(--red-bd)" }}>
              ⚑ {entry.blockers}
            </div>
          )}
        </div>
      )}

      {/* ── New schema task table ── */}
      {hasToday && !isLegacy && displayTasks.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                {["Client", "Priority", "Task", "Start date", "Due date", "End date", eodSubmitted ? "Outcome" : ""].map((h, i) => h && (
                  <th key={i} style={{ textAlign: "left", fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                    letterSpacing: "0.07em", color: "var(--faint)", padding: "5px 12px",
                    borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap",
                    width: i === 2 ? undefined : i === 0 ? 90 : i === 1 ? 80 : i === 6 ? 100 : 100 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayTasks.filter(t => t.text?.trim()).map((t, i) => {
                const ps  = PRIORITY_STYLE[t.priority || "Medium"];
                const os  = OUTCOME_STYLE[t.outcome];
                const overdue = isDuePast(t.dueDate, t.outcome);
                return (
                  <tr key={i} style={{ borderTop: "0.5px solid var(--border)",
                    background: t.outcome === "Blocked" ? "var(--red-bg)" : t.adhoc ? "#fffbeb" : "transparent" }}>
                    {/* Client */}
                    <td style={{ padding: "7px 12px" }}>
                      {t.client
                        ? <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, background: "var(--blue-bg)",
                            color: "var(--blue)", border: "0.5px solid var(--blue-bd)", fontWeight: 500 }}>{t.client}</span>
                        : <span style={{ color: "var(--faint)", fontSize: 11 }}>—</span>}
                    </td>
                    {/* Priority */}
                    <td style={{ padding: "7px 12px" }}>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, fontWeight: 500,
                        color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}` }}>
                        {t.priority || "Medium"}
                      </span>
                    </td>
                    {/* Task */}
                    <td style={{ padding: "7px 12px", fontSize: 12, fontWeight: 500, minWidth: 180 }}>
                      {t.text}
                      {t.adhoc && <span style={{ fontSize: 9, marginLeft: 5, padding: "1px 5px", borderRadius: 10,
                        background: "#fffbeb", color: "#854F0B", border: "0.5px solid #FAC775" }}>ad-hoc</span>}
                    </td>
                    {/* Start date */}
                    <td style={{ padding: "7px 12px", fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                      color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {t.startDate || <span style={{ color: "var(--faint)" }}>—</span>}
                    </td>
                    {/* Due date */}
                    <td style={{ padding: "7px 12px", whiteSpace: "nowrap" }}>
                      {t.dueDate ? (
                        <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: overdue ? 500 : 400,
                          color: overdue ? "var(--red)" : "var(--muted)", background: overdue ? "var(--red-bg)" : "transparent",
                          padding: overdue ? "1px 5px" : 0, borderRadius: overdue ? 4 : 0 }}>
                          {t.dueDate}{overdue ? " ⚠" : ""}
                        </span>
                      ) : <span style={{ color: "var(--faint)", fontSize: 11 }}>—</span>}
                    </td>
                    {/* End date */}
                    <td style={{ padding: "7px 12px", fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                      color: t.endDate ? "var(--green)" : "var(--faint)", whiteSpace: "nowrap" }}>
                      {t.endDate || "—"}
                    </td>
                    {/* Outcome (EOD only) */}
                    {eodSubmitted && (
                      <td style={{ padding: "7px 12px" }}>
                        {os ? (
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500,
                            color: os.color, background: os.bg, border: `0.5px solid ${os.bd}` }}>
                            {t.outcome}
                          </span>
                        ) : <span style={{ color: "var(--faint)", fontSize: 11 }}>—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Blocker details (if any blocked tasks) ── */}
      {eodSubmitted && displayTasks.some(t => t.outcome === "Blocked" && t.blockerDetail) && (
        <div style={{ padding: "8px 14px 10px", borderTop: "0.5px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
          {displayTasks.filter(t => t.outcome === "Blocked" && t.blockerDetail).map((t, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--red)", display: "flex", gap: 6 }}>
              <span style={{ flexShrink: 0 }}>⚑</span>
              <span><strong style={{ fontWeight: 500 }}>{t.text}:</strong> {t.blockerDetail}</span>
            </div>
          ))}
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
    const eodTasks = e?.eod?.tasks || [];
    const sodTasks = e?.sod?.tasks || [];
    return eodTasks.some(t => t.outcome === "Blocked") ||
           sodTasks.some(t => t.blocker?.trim()) ||
           !!e?.blockers?.trim();
  });

  const bwValues = submittedToday
    .map(m => latest[m.name]?.sod?.bandwidth || latest[m.name]?.bandwidth)
    .filter(Boolean);
  const avgBw      = bwValues.length ? Math.round(bwValues.reduce((a,b) => a+b, 0) / bwValues.length) : null;
  const avgBwLabel = avgBw ? BANDWIDTH[avgBw]?.label : "—";
  const avgBwS     = BW_STYLES[avgBw] || BW_STYLES[3];

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
      } else { alert(`Failed to send reminder: ${data.error}`); }
    } catch { alert("Failed to send Slack reminder. Please check your connection."); }
    setSlackSending(false);
  };

  // Sort: submitted first, then not submitted
  const sortedMembers = [
    ...members.filter(m => latest[m.name]?.date === TODAY),
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
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--green)" }}>{submittedToday.length}</div>
          <div className="stat-label">Submitted today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--faint)" }}>{notSubmitted.length}</div>
          <div className="stat-label">Not yet submitted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--red)" }}>{blockedMembers.length}</div>
          <div className="stat-label">Active blockers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: avgBwS.color, fontSize: 16, paddingTop: 2 }}>{avgBwLabel}</div>
          <div className="stat-label">Avg bandwidth</div>
        </div>
      </div>

      {/* Member cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sortedMembers.map(m => (
          <MemberCard
            key={m.name}
            member={m}
            entry={latest[m.name]}
            onViewProfile={onViewProfile}
          />
        ))}
      </div>
    </div>
  );
}
