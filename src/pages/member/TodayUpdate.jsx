import { useState, useEffect } from "react";
import { Spinner, Toast, useToast } from "../../components/index.jsx";
import { BANDWIDTH, BW_STYLES } from "../../utils/constants";
import { fmt, TODAY } from "../../utils/dates";
import { useHistory } from "../../hooks/useHistory";
import { useRecurring } from "../../hooks/useRecurring";
import { useSlack }     from "../../hooks/useSlack";

const emptySOD = () => ({
  bandwidth: 3,
  tasks: [{ client: "", text: "", blocker: "", priority: "Medium", startDate: "", dueDate: "" }],
});

const emptyEOD = () => ({});

const OUTCOMES = ["Done", "Carry over", "Blocked"];

// Returns { options, defaultOutcome } based on task due date
function getOutcomeOptions(task, prevOutcome) {
  const due = task.dueDate || "";
  if (!due || due > TODAY) {
    return { options: ["Done", "In Progress", "Blocked"], defaultOutcome: "In Progress" };
  }
  if (due === TODAY) {
    return { options: ["Done", "Carry over", "Blocked"], defaultOutcome: "Done" };
  }
  // Past due
  if (prevOutcome === "In Progress") {
    return { options: ["Done", "Carry over", "Blocked"], defaultOutcome: null };
  }
  return { options: ["Done", "Carry over", "Blocked"], defaultOutcome: prevOutcome || "Carry over" };
}
const OUTCOME_STYLE = {
  "Done":        { bg: "var(--green-bg)", color: "var(--green)", bd: "var(--green-bd)" },
  "Carry over":  { bg: "var(--amber-bg)", color: "var(--amber)", bd: "var(--amber-bd)" },
  "Blocked":     { bg: "var(--red-bg)",   color: "var(--red)",   bd: "var(--red-bd)"   },
  "In Progress": { bg: "var(--blue-bg)",  color: "var(--blue)",  bd: "var(--blue-bd)"  },
};

const PRIORITIES = ["High", "Medium", "Low"];
const PRIORITY_STYLE = {
  "High":   { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "Medium": { color: "var(--amber)", bg: "var(--amber-bg)", bd: "var(--amber-bd)" },
  "Low":    { color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
};

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function calcPct(eodTasks) {
  if (!eodTasks?.length) return null;
  return Math.round(eodTasks.filter(t => t.outcome === "Done").length / eodTasks.length * 100);
}

// ── SOD read-only ─────────────────────────────────────────────────────────────
function SODReadOnly({ sod }) {
  const tasks = sod.tasks || [];
  const hasRecurring = tasks.some(t => t.isRecurring);
  const hasProject   = tasks.some(t => !t.isRecurring);
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <div className="field-label mb-8">Bandwidth</div>
        <div className="bw-row">
          {Object.entries(BANDWIDTH).map(([k, v]) => {
            const s = BW_STYLES[k];
            const sel = sod.bandwidth === +k;
            return (
              <div key={k} className="bw-chip"
                style={{ color: sel ? "#fff" : s.color, background: sel ? s.color : s.bg, borderColor: sel ? s.color : s.bd, cursor: "default" }}>
                {v.label}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="task-table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ width: 115 }}>Client</th>
              <th style={{ width: 100 }}>Priority</th>
              <th style={{ minWidth: 260 }}>Task</th>
              <th style={{ width: 120 }}>Start date</th>
              <th style={{ width: 120 }}>Due date</th>
              <th style={{ minWidth: 155 }}>Blocker / notes</th>
            </tr>
          </thead>
          <tbody>
            {hasRecurring && (
              <tr>
                <td colSpan={6} style={{ padding: "5px 10px", background: "#EEEDFE", borderBottom: "0.5px solid #AFA9EC" }}>
                  <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#534AB7" }}>
                    ↻ Recurring — auto added for today
                  </span>
                </td>
              </tr>
            )}
            {tasks.map((t, i) => {
              const ps = PRIORITY_STYLE[t.priority || "Medium"];
              const isFirstProject = !t.isRecurring && hasRecurring &&
                tasks.findIndex(x => !x.isRecurring) === i;
              const overdue = t.dueDate && t.dueDate < TODAY && !t.isRecurring;
              return (
                <>
                  {isFirstProject && (
                    <tr key={`sep-${i}`}>
                      <td colSpan={6} style={{ padding: "5px 10px", background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
                        <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--faint)" }}>
                          Project tasks
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr key={i} style={{ background: t.isRecurring ? "#EEEDFE20" : "transparent" }}>
                    <td>
                      {t.client
                        ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{t.client}</span>
                        : <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, fontWeight: 500,
                        color: ps?.color, background: ps?.bg, border: `0.5px solid ${ps?.bd}` }}>
                        {t.priority || "Medium"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                      {t.isRecurring && (
                        <span style={{ fontSize: 9, marginRight: 5, padding: "1px 5px", borderRadius: 10,
                          background: "#EEEDFE", color: "#534AB7", border: "0.5px solid #AFA9EC", fontWeight: 500 }}>↻</span>
                      )}
                      {t.text || "—"}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted)" }}>
                      {t.startDate || <span style={{ color: "var(--faint)" }}>—</span>}
                    </td>
                    <td>
                      {t.dueDate
                        ? <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                            color: overdue ? "var(--red)" : "var(--muted)",
                            fontWeight: overdue ? 500 : 400,
                            ...(overdue ? { background: "var(--red-bg)", padding: "2px 6px", borderRadius: 4 } : {}) }}>
                            {t.dueDate}{overdue ? " !" : ""}
                          </span>
                        : <span style={{ fontSize: 11, color: "var(--faint)" }}>—</span>}
                    </td>
                    <td>
                      {t.blocker?.trim()
                        ? <span style={{ fontSize: 11, color: "var(--red)", background: "var(--red-bg)",
                            padding: "2px 8px", borderRadius: 4, border: "0.5px solid var(--red-bd)" }}>
                            {t.blocker}
                          </span>
                        : <span style={{ fontSize: 11, color: "var(--faint)", fontStyle: "italic" }}>—</span>}
                    </td>
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TodayUpdate({ memberName }) {
  const { entries, saving, saveSOD, saveEOD, getTodayEntry, getStreak } = useHistory(memberName);
  const { todayTasks: recurringToday } = useRecurring(memberName);
  const { settings: slackSettings, postMessage } = useSlack(memberName);
  const { toast, show: showToast } = useToast();

  const todayEntry   = getTodayEntry();
  const sodData      = todayEntry?.sod || null;
  const eodData      = todayEntry?.eod || null;
  const sodSubmitted = !!sodData?.submittedAt;
  const eodSubmitted = !!eodData?.submittedAt;

  const [sodForm, setSODForm] = useState(emptySOD());
  const [eodForm, setEODForm] = useState({ tasks: [], ...emptyEOD() });
  const [eodExpanded,   setEodExpanded]   = useState(null);
  const [slackModal,    setSlackModal]    = useState(null);   // null | "sod" | "eod"
  const [slackPosting,  setSlackPosting]  = useState(false);
  const [slackDone,     setSlackDone]     = useState({});     // { channelId: "sent"|errorMsg }
  const [taskChanMap,   setTaskChanMap]   = useState({});     // { taskIdx: channelId | "none" }
  const [previewChan,   setPreviewChan]   = useState(null);   // channelId being previewed

  // Pre-fill SOD — if no SOD yet today, check yesterday's EOD for carry-overs
  useEffect(() => {
    if (sodData) {
      setSODForm({
        bandwidth: sodData.bandwidth || 3,
        tasks: sodData.tasks?.length
          ? sodData.tasks.map(t => ({ client: "", text: "", blocker: "", priority: "Medium", startDate: "", dueDate: "", ...t }))
          : [{ client: "", text: "", blocker: "", priority: "Medium", startDate: "", dueDate: "" }],
      });
    } else if (entries.length > 0) {
      // No SOD today — check yesterday's EOD for carry-over tasks
      const yesterday = entries.find(e => e.date !== TODAY && e.eod?.tasks?.length);
      if (yesterday) {
        const carryOvers = (yesterday.eod.tasks || []).filter(t =>
          t.outcome === "Carry over" || t.outcome === "In Progress" || t.carryOver
        );
        if (carryOvers.length) {
          setSODForm(f => ({
            ...f,
            tasks: carryOvers.map(t => ({
              client: t.client || "", text: t.text || "", blocker: "",
              priority: t.priority || "Medium", startDate: t.startDate || "", dueDate: t.dueDate || "",
              isCarryOver: true, carryOverFrom: yesterday.date,
            })),
          }));
        }
      }
    }
  }, [entries]);

  // Inject recurring tasks into SOD when not yet submitted
  useEffect(() => {
    if (sodData || !recurringToday.length) return;
    setSODForm(f => {
      const existingTexts = new Set(f.tasks.map(t => t.text?.trim()).filter(Boolean));
      const toAdd = recurringToday.filter(r => !existingTexts.has(r.text?.trim()));
      if (!toAdd.length) return f;
      const recurringTasks = toAdd.map(r => ({
        client: r.client || "", text: r.text || "", blocker: "",
        priority: r.priority || "Medium", startDate: TODAY, dueDate: TODAY,
        isRecurring: true, recurringId: r.id,
      }));
      const realTasks = f.tasks.filter(t => t.text?.trim());
      const empty     = f.tasks.filter(t => !t.text?.trim());
      return { ...f, tasks: [...recurringTasks, ...realTasks, ...(realTasks.length ? [] : empty)] };
    });
  }, [recurringToday, sodData]);

  // Pre-fill EOD from SOD — carry startDate/dueDate from SOD tasks
  useEffect(() => {
    if (sodSubmitted) {
      const sodTasks = sodData?.tasks || [];
      const existing = eodData?.tasks || [];
      const merged = sodTasks.map((t, i) => ({
        client:        t.client,
        text:          t.text,
        priority:      t.priority || "Medium",
        startDate:     t.startDate || "",
        dueDate:       t.dueDate   || "",
        fromSOD:       true,
        outcome:       existing[i]?.outcome       || getOutcomeOptions({ dueDate: t.dueDate }, null).defaultOutcome || "Done",
        carryOver:     existing[i]?.carryOver      ?? false,
        notes:         existing[i]?.notes          || "",
        blockerDetail: existing[i]?.blockerDetail  || "",
        blockerOwner:  existing[i]?.blockerOwner   || "",
        endDate:       existing[i]?.endDate        || "",
      }));
      const extras = existing.slice(sodTasks.length).map(t => ({ ...t, fromSOD: false }));
      setEODForm({ tasks: [...merged, ...extras] });
    }
  }, [entries]);

  // SOD helpers
  const addSODTask    = () => setSODForm(f => ({ ...f, tasks: [...f.tasks, { client: "", text: "", blocker: "", priority: "Medium", startDate: "", dueDate: "" }] }));
  const updateSODTask = (i, field, val) => setSODForm(f => ({ ...f, tasks: f.tasks.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const removeSODTask = (i) => setSODForm(f => ({ ...f, tasks: f.tasks.filter((_, idx) => idx !== i) }));

  // EOD helpers
  const updateEODTask = (i, field, val) => setEODForm(f => ({ ...f, tasks: f.tasks.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const addEODTask    = () => setEODForm(f => ({ ...f, tasks: [...f.tasks, { client: "", text: "", fromSOD: false, adhoc: true, priority: "Medium", startDate: TODAY, dueDate: "", outcome: "In Progress", carryOver: false, notes: "", blockerDetail: "", blockerOwner: "" }] }));
  const removeEODTask = (i) => setEODForm(f => ({ ...f, tasks: f.tasks.filter((_, idx) => idx !== i) }));

  // ── Slack helpers ────────────────────────────────────────────────────────────
  // Build Slack message for a given set of tasks (already filtered per channel)
  const buildSlackBlocksForChannel = (type, filteredTasks) => {
    const isSod    = type === "sod";
    const sodTasks = sodData?.tasks || [];

    const now     = new Date();
    const dd      = String(now.getDate()).padStart(2, "0");
    const mm      = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy    = now.getFullYear();
    const dateStr = `${dd}-${mm}-${yyyy}`;

    const fmtDate = (iso) => {
      if (!iso) return null;
      const d = new Date(iso + "T00:00:00");
      return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    };

    const header = `Date: ${dateStr} || ${isSod ? "Morning Updates" : "Evening Updates"}`;
    const msgLines = [];

    filteredTasks.filter(t => t.text?.trim()).forEach((t, i) => {
      const client = t.client?.trim() || "Internal";
      msgLines.push(`${i + 1}. ${client} | ${t.text}`);

      if (isSod) {
        const s = fmtDate(t.startDate);
        const d = fmtDate(t.dueDate);
        if (s || d) {
          const parts = [];
          if (s) parts.push(`Start: ${s}`);
          if (d) parts.push(`Due: ${d}`);
          msgLines.push(`   ${parts.join("  |  ")}`);
        }
      } else {
        // For EOD — find the matching SOD task by text to get original dates
        const sodTask = sodTasks.find(st => st.text === t.text) || {};
        const s = fmtDate(t.startDate || sodTask.startDate);
        const d = fmtDate(t.dueDate   || sodTask.dueDate);
        if (s || d) {
          const parts = [];
          if (s) parts.push(`Start: ${s}`);
          if (d) parts.push(`Due: ${d}`);
          msgLines.push(`   ${parts.join("  |  ")}`);
        }
        if (t.outcome === "Done") {
          msgLines.push(`   Outcome: Done`);
        } else if (t.outcome === "Carry over") {
          const note = t.notes?.trim() ? `  |  Note: ${t.notes}` : "";
          msgLines.push(`   Outcome: Carry over${note}`);
        } else if (t.outcome === "Blocked") {
          const parts = ["Outcome: Blocked"];
          if (t.blockerDetail?.trim()) parts.push(`Blocker: ${t.blockerDetail}`);
          if (t.blockerOwner?.trim())  parts.push(`Owner: ${t.blockerOwner}`);
          msgLines.push(`   ${parts.join("  |  ")}`);
        } else if (t.outcome === "In Progress") {
          msgLines.push(`   Outcome: In Progress`);
        }
      }
    });

    const fullText = [header, "", ...msgLines].join("\n");
    return {
      text: fullText,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${header}*` } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: msgLines.join("\n") || "—" } },
      ],
    };
  };

  const openSlackModal = (type) => {
    const channels  = (slackSettings?.channels || []).filter(c => c.channelId?.trim());
    const tasks     = type === "sod" ? (sodData?.tasks || []) : (eodData?.tasks || []);
    // Smart default: match task client to channel label (case-insensitive partial match)
    const initMap   = {};
    tasks.forEach((t, i) => {
      if (!t.text?.trim()) return;
      if (t.isRecurring) { initMap[i] = "none"; return; }
      const client  = (t.client || "").toLowerCase().trim();
      const matched = channels.find(c => {
        const lbl = (c.label || "").toLowerCase();
        return client && (lbl.includes(client) || client.includes(lbl));
      });
      initMap[i] = matched ? matched.channelId : (channels[0]?.channelId || "none");
    });
    setTaskChanMap(initMap);
    setSlackDone({});
    setPreviewChan(channels[0]?.channelId || null);
    setSlackModal(type);
  };

  const postToSlack = async () => {
    const allTasks = slackModal === "sod" ? (sodData?.tasks || []) : (eodData?.tasks || []);
    const channels = (slackSettings?.channels || []).filter(c => c.channelId?.trim());
    // Group tasks by channel
    const chanTasks = {};
    allTasks.forEach((t, i) => {
      const chId = taskChanMap[i];
      if (!chId || chId === "none" || !t.text?.trim()) return;
      if (!chanTasks[chId]) chanTasks[chId] = [];
      chanTasks[chId].push(t);
    });
    const activeChans = Object.keys(chanTasks);
    if (!activeChans.length) return;
    setSlackPosting(true);
    const results = {};
    for (const chId of activeChans) {
      try {
        const { text, blocks } = buildSlackBlocksForChannel(slackModal, chanTasks[chId]);
        await postMessage(chId, text, blocks);
        results[chId] = "sent";
      } catch (e) {
        results[chId] = e.message || "error";
      }
    }
    setSlackDone(results);
    setSlackPosting(false);
  };

    const handleSaveSOD = async () => {
    // Block rows that have a client but no task text, or task text but no due date
    const emptyRows = sodForm.tasks.filter(t => !t.isRecurring && (t.client?.trim() || t.text?.trim()) && !t.text?.trim());
    const missingDue = sodForm.tasks.filter(t => !t.isRecurring && t.text?.trim() && !t.dueDate?.trim());
    if (emptyRows.length > 0) { showToast("Each row needs a task description", "error"); return; }
    if (missingDue.length > 0) { showToast(`"${missingDue[0].text}" is missing a due date`, "error"); return; }
    if (!sodForm.tasks.some(t => t.text?.trim())) { showToast("Add at least one task", "error"); return; }
    const ok = await saveSOD({ ...sodForm, submittedAt: Date.now() });
    showToast(ok ? "SOD submitted ✓" : "Save failed — try again", ok ? "success" : "error");
  };
  const handleSaveEOD = async () => {
    // Validate EOD tasks
    for (const t of eodForm.tasks) {
      // Carry over reason is mandatory only if past due date
      if (t.outcome === "Carry over") {
        const isOverdue = t.dueDate && t.dueDate < TODAY;
        if (isOverdue && !t.notes?.trim()) {
          showToast(`"${t.text.slice(0, 40)}" is past its due date — please add a reason for carry over`, "error"); return;
        }
      }
      if (t.outcome === "Blocked" && !t.blockerDetail?.trim()) {
        showToast("Please describe the blocker for blocked tasks", "error"); return;
      }
    }
    // Auto-set endDate for Done tasks
    const tasksWithEnd = eodForm.tasks.map(t =>
      t.outcome === "Done" && !t.endDate ? { ...t, endDate: TODAY } : t
    );
    const ok = await saveEOD({ tasks: tasksWithEnd, submittedAt: Date.now() });
    showToast(ok ? "EOD submitted ✓" : "Save failed — try again", ok ? "success" : "error");
  };

  const streak     = getStreak();
  const pct        = calcPct(eodData?.tasks);
  const doneCount  = (eodData?.tasks || []).filter(t => t.outcome === "Done").length;
  const carryCount = (eodData?.tasks || []).filter(t => t.outcome === "Carry over").length;

  // Shared date strip style

  return (
    <div className="main-content">
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Today's update</div>
      <div className="text-sm text-muted mb-16">{fmt(TODAY)}</div>

      {/* Stats */}
      <div className="stats-grid stats-grid-4 mb-16">
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent)" }}>{streak}</div><div className="stat-label">Day streak</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--green)" }}>{doneCount}</div><div className="stat-label">Done today</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "var(--amber)" }}>{carryCount}</div><div className="stat-label">Carried over</div></div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--accent)", fontSize: pct != null ? 18 : 22 }}>
            {pct != null ? `${pct}%` : "—"}
          </div>
          <div className="stat-label">Completion</div>
        </div>
      </div>

      {/* ── SOD ── */}
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        {/* SOD header — dark navy */}
        <div style={{ background: "#1e1b4b", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: sodSubmitted ? "#6ee7b7" : "#fbbf24" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>Start of day</span>
            {sodSubmitted && (
              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "#c7d2fe" }}>
                Submitted · {fmtTime(sodData.submittedAt)}
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: "#6366f1" }}>
            {sodSubmitted ? "locked after submit" : "fill in at start of day"}
          </span>
        </div>

        <div style={{ padding: "12px 16px 0" }}>
          {sodSubmitted ? <SODReadOnly sod={sodData} /> : (
            <>
              <div className="field-label mb-8">Bandwidth — how loaded are you today?</div>
              <div className="bw-row mb-16">
                {Object.entries(BANDWIDTH).map(([k, v]) => {
                  const s = BW_STYLES[k];
                  const sel = sodForm.bandwidth === +k;
                  return (
                    <div key={k} className="bw-chip"
                      onClick={() => setSODForm(f => ({ ...f, bandwidth: +k }))}
                      style={{ color: sel ? "#fff" : s.color, background: sel ? s.color : s.bg, borderColor: sel ? s.color : s.bd }}>
                      {v.label}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mb-8">
                <div className="field-label">Tasks planned for today</div>
              </div>

              {/* Task table — flat Option B layout */}
              <div style={{ overflowX: "auto", marginBottom: 12 }}>
                <table className="task-table" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 115 }}>Client</th>
                      <th style={{ width: 100 }}>Priority</th>
                      <th style={{ minWidth: 260 }}>Task</th>
                      <th style={{ width: 120 }}>Start date</th>
                      <th style={{ width: 120 }}>Due date</th>
                      <th style={{ minWidth: 155 }}>Blocker / notes</th>
                      <th style={{ width: 28 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Recurring separator */}
                    {sodForm.tasks.some(t => t.isRecurring) && (
                      <tr>
                        <td colSpan={7} style={{ padding: "5px 10px", background: "#EEEDFE",
                          borderBottom: "0.5px solid #AFA9EC" }}>
                          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                            letterSpacing: "0.07em", color: "#534AB7" }}>
                            ↻ Recurring — auto added for today
                          </span>
                        </td>
                      </tr>
                    )}
                    {sodForm.tasks.map((t, i) => {
                      const ps = PRIORITY_STYLE[t.priority || "Medium"];
                      const isFirstProject = !t.isRecurring &&
                        sodForm.tasks.some(x => x.isRecurring) &&
                        sodForm.tasks.findIndex(x => !x.isRecurring) === i;
                      return (
                        <>
                          {isFirstProject && (
                            <tr>
                              <td colSpan={7} style={{ padding: "5px 10px",
                                background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
                                <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                                  letterSpacing: "0.07em", color: "var(--faint)" }}>
                                  Project tasks
                                </span>
                              </td>
                            </tr>
                          )}
                          <tr key={i} style={{ background: t.isRecurring ? "#EEEDFE20" : "transparent" }}>
                          <td>
                            <input className="task-cell-input" placeholder="Client..." value={t.client}
                              onChange={e => updateSODTask(i, "client", e.target.value)} />
                          </td>
                          <td>
                            <select value={t.priority || "Medium"}
                              onChange={e => updateSODTask(i, "priority", e.target.value)}
                              style={{ width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 6, border: `0.5px solid ${ps?.bd || "var(--border)"}`, background: ps?.bg || "var(--surface)", color: ps?.color || "var(--text)", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </td>
                          <td>
                            <input className="task-cell-input" placeholder="What are you working on?" value={t.text}
                              onChange={e => updateSODTask(i, "text", e.target.value)}
                              style={{ fontWeight: t.text ? 500 : 400,
                                ...(!t.isRecurring && !t.text?.trim() && t.client?.trim()
                                  ? { borderColor: "var(--red-bd)", background: "var(--red-bg)" } : {}) }} />
                          </td>
                          <td>
                            <input type="date" className="task-cell-input" value={t.startDate || ""}
                              onChange={e => updateSODTask(i, "startDate", e.target.value)}
                              style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
                          </td>
                          <td>
                            <input type="date" className="task-cell-input" value={t.dueDate || ""}
                              onChange={e => updateSODTask(i, "dueDate", e.target.value)}
                              style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace",
                                ...(!t.isRecurring && t.text?.trim() && !t.dueDate?.trim()
                                  ? { borderColor: "var(--red-bd)", background: "var(--red-bg)" } : {}) }} />
                          </td>
                          <td>
                            <input className="task-cell-input" value={t.blocker} placeholder="Leave blank if none"
                              onChange={e => updateSODTask(i, "blocker", e.target.value)}
                              style={{ fontSize: 11, ...(t.blocker?.trim() ? { color: "var(--red)", background: "var(--red-bg)", borderColor: "var(--red-bd)" } : { color: "var(--faint)", fontStyle: "italic" }) }} />
                          </td>
                          <td><div className="task-del" onClick={() => removeSODTask(i)}>×</div></td>
                          </tr>
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {!sodSubmitted && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "0.5px solid var(--border)", marginTop: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={addSODTask}>＋ Add task</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setSODForm(emptySOD())}>Clear</button>
              <button className="btn btn-primary" onClick={handleSaveSOD} disabled={saving}>
                {saving ? <><Spinner white /> Saving...</> : "Submit SOD"}
              </button>
            </div>
          </div>
        )}
        {sodSubmitted && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", borderTop: "0.5px solid var(--border)" }}>
            <span style={{ fontSize: 11, color: "var(--faint)" }}>
              {(sodData.tasks || []).filter(t => t.text?.trim()).length} tasks · {BANDWIDTH[sodData.bandwidth]?.label || "Balanced"}
            </span>
            {slackSettings?.tokenSaved && (slackSettings?.channels || []).length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => openSlackModal("sod")}
                style={{ color: "#4A154B", borderColor: "#4A154B40", gap: 5 }}>
                💬 Post SOD to Slack
              </button>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 16px" }}>
        <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
        <span style={{ fontSize: 10, fontWeight: 500, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>End of day</span>
        <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
      </div>

      {/* ── EOD ── */}
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {/* EOD header — dark green */}
        <div style={{ background: "#0f4c35", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: eodSubmitted ? "#6ee7b7" : "#fbbf24" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>End of day</span>
            {eodSubmitted && (
              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "#6ee7b7" }}>
                Submitted · {fmtTime(eodData.submittedAt)}
              </span>
            )}
            {!eodSubmitted && sodSubmitted && (
              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>Pending</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: "#6ee7b7" }}>
            {!sodSubmitted ? "submit SOD first" : eodSubmitted ? "you can still update before midnight" : "fill in before end of day"}
          </span>
        </div>

        {!sodSubmitted ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
            Submit your SOD first — EOD will unlock once you do.
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 16px 0" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                Update the status of each task — add notes or mark tasks added outside SOD
              </div>

              {/* EOD task table */}
              <div style={{ overflowX: "auto", marginBottom: 14 }}>
                <table className="task-table" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Client</th>
                      <th style={{ width: 95 }}>Priority</th>
                      <th style={{ minWidth: 220 }}>Task</th>
                      <th style={{ width: 115 }}>Outcome</th>
                      <th style={{ width: 108 }}>Start date</th>
                      <th style={{ width: 108 }}>Due date</th>
                      <th style={{ width: 108 }}>End date</th>
                      <th style={{ width: 28 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eodForm.tasks.map((t, i) => {
                      const s         = OUTCOME_STYLE[t.outcome] || OUTCOME_STYLE["In Progress"] || OUTCOME_STYLE["Done"];
                      const isAdhoc   = !t.fromSOD;
                      const isDuePast = t.dueDate && t.dueDate < TODAY && t.outcome !== "Done";
                      const ps        = PRIORITY_STYLE[t.priority || "Medium"];
                      const isPastDueIP = !isAdhoc && t.dueDate && t.dueDate < TODAY && t.outcome === "In Progress";
                      const { options: outcomeOpts } = getOutcomeOptions(t, t.outcome);
                      return (
                        <tr key={i} style={{ background: isPastDueIP ? "#FAEEDA30" : isAdhoc ? "#fffbeb" : "transparent" }}>
                          {/* Client */}
                          <td>
                            {isAdhoc
                              ? <input className="task-cell-input" placeholder="Client..." value={t.client}
                                  onChange={e => updateEODTask(i, "client", e.target.value)} />
                              : t.client
                                ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{t.client}</span>
                                : <span style={{ color: "var(--faint)" }}>—</span>}
                          </td>
                          {/* Priority */}
                          <td>
                            {isAdhoc
                              ? <select value={t.priority || "Medium"}
                                  onChange={e => updateEODTask(i, "priority", e.target.value)}
                                  style={{ width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 6, border: `0.5px solid ${ps?.bd}`, background: ps?.bg, color: ps?.color, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              : ps && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 500, color: ps.color, background: ps.bg, border: `0.5px solid ${ps.bd}` }}>{t.priority}</span>}
                          </td>
                          {/* Task */}
                          <td>
                            {isAdhoc
                              ? <input className="task-cell-input" placeholder="What did you work on?" value={t.text}
                                  onChange={e => updateEODTask(i, "text", e.target.value)}
                                  style={{ fontWeight: t.text ? 500 : 400 }} />
                              : <span style={{ fontSize: 12, fontWeight: 500 }}>{t.text || "—"}</span>}
                          </td>
                          {/* Outcome */}
                          <td>
                            <select value={t.outcome || ""}
                              onChange={e => { const v = e.target.value; updateEODTask(i, "outcome", v); updateEODTask(i, "carryOver", v === "Carry over"); }}
                              style={{ width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 6, border: `0.5px solid ${s.bd}`, background: s.bg, color: s.color, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                              {outcomeOpts.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                          {/* Start date */}
                          <td>
                            {isAdhoc
                              ? <input type="date" className="task-cell-input" value={t.startDate || ""}
                                  onChange={e => updateEODTask(i, "startDate", e.target.value)}
                                  style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
                              : <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted)" }}>{t.startDate || <span style={{ color: "var(--faint)" }}>—</span>}</span>}
                          </td>
                          {/* Due date */}
                          <td>
                            {isAdhoc
                              ? <input type="date" className="task-cell-input" value={t.dueDate || ""}
                                  onChange={e => updateEODTask(i, "dueDate", e.target.value)}
                                  style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
                              : <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: isDuePast ? 500 : 400, color: isDuePast ? "var(--red)" : "var(--muted)", background: isDuePast ? "var(--red-bg)" : "transparent", padding: isDuePast ? "1px 6px" : 0, borderRadius: isDuePast ? 4 : 0 }}>
                                  {t.dueDate || <span style={{ color: "var(--faint)" }}>—</span>}
                                  {isDuePast && " ⚠"}
                                </span>}
                          </td>
                          {/* End date */}
                          <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
                            {t.outcome === "Done"
                              ? <span style={{ color: "var(--green)", fontWeight: 500 }}>{t.endDate || TODAY}</span>
                              : <span style={{ color: "var(--faint)" }}>—</span>}
                          </td>
                          {/* Delete — only for ad-hoc */}
                          <td>{isAdhoc && <div className="task-del" onClick={() => removeEODTask(i)}>×</div>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Carry-over mandatory notes + Blocked detail — rendered below table */}
              {eodForm.tasks.some(t => t.outcome === "Carry over" || t.outcome === "Blocked") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {eodForm.tasks.map((t, i) => {
                    if (t.outcome === "Carry over") return (
                      <div key={i} style={{ padding: "10px 12px", background: "var(--amber-bg)", borderRadius: 7, border: "0.5px solid var(--amber-bd)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                          {t.client && <span className="badge badge-blue" style={{ fontSize: 10 }}>{t.client}</span>}
                          <span style={{ fontSize: 11, fontWeight: 500, flex: 1 }}>{t.text}</span>
                          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--amber)" }}>Why carry over?</span>
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "var(--amber)", color: "#fff", fontWeight: 500 }}>required</span>
                        </div>
                        <textarea className="field-input" rows={2}
                          placeholder="Why wasn't this completed today? e.g. blocked waiting for feedback, ran out of time..."
                          value={t.notes}
                          onChange={e => updateEODTask(i, "notes", e.target.value)}
                          style={{ marginBottom: 0, borderColor: t.notes?.trim() ? "var(--amber-bd)" : "var(--red-bd)", background: t.notes?.trim() ? "var(--amber-bg)" : "#fff" }} />
                      </div>
                    );
                    if (t.outcome === "Blocked") return (
                      <div key={i} style={{ padding: "10px 12px", background: "var(--red-bg)", borderRadius: 7, border: "0.5px solid var(--red-bd)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          {t.client && <span className="badge badge-blue" style={{ fontSize: 10 }}>{t.client}</span>}
                          <span style={{ fontSize: 11, fontWeight: 500, flex: 1 }}>{t.text}</span>
                          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--red)" }}>Blocker detail</span>
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "var(--red)", color: "#fff", fontWeight: 500 }}>required</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--red)", marginBottom: 4 }}>What is blocking this?</div>
                            <textarea className="field-input" rows={2}
                              placeholder="Describe what is blocking this task..."
                              value={t.blockerDetail}
                              onChange={e => updateEODTask(i, "blockerDetail", e.target.value)}
                              style={{ marginBottom: 0, borderColor: t.blockerDetail?.trim() ? "var(--red-bd)" : "var(--red)" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--red)", marginBottom: 4 }}>Who / what needs to resolve it?</div>
                            <input className="task-cell-input"
                              placeholder="e.g. Infra team, awaiting design approval..."
                              value={t.blockerOwner}
                              onChange={e => updateEODTask(i, "blockerOwner", e.target.value)}
                              style={{ borderColor: t.blockerOwner?.trim() ? "var(--red-bd)" : "var(--red)" }} />
                          </div>
                        </div>
                      </div>
                    );
                    return null;
                  })}
                </div>
              )}



              {/* Completion bar */}
              {eodForm.tasks.length > 0 && (() => {
                const done  = eodForm.tasks.filter(t => t.outcome === "Done").length;
                const total = eodForm.tasks.length;
                const p     = Math.round(done / total * 100);
                return (
                  <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--surface)", borderRadius: 8, border: "0.5px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Completion</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: p === 100 ? "var(--green)" : "var(--accent)" }}>{done} / {total} tasks ({p}%)</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: p === 100 ? "var(--green)" : "var(--accent)", width: `${p}%`, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })()}


            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "0.5px solid var(--border)", marginTop: 4 }}>
<button className="btn btn-ghost btn-sm" onClick={addEODTask}>＋ Add task</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEODForm(f => ({ ...f, tasks: f.tasks.map(t => ({ ...t, outcome: "Done", notes: "", blockerDetail: "", blockerOwner: "" })) }))}>Reset outcomes</button>
              <button className="btn btn-primary" onClick={handleSaveEOD} disabled={saving}
                style={{ background: "var(--green)", borderColor: "var(--green)" }}>
                {saving ? <><Spinner white /> Saving...</> : eodSubmitted ? "Update EOD" : "Submit EOD"}
              </button>
              {eodSubmitted && slackSettings?.tokenSaved && (slackSettings?.channels || []).length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => openSlackModal("eod")}
                  style={{ color: "#4A154B", borderColor: "#4A154B40" }}>
                  💬 Post EOD to Slack
                </button>
              )}
            </div>
            </div>
          </>
        )}
      </div>

      {/* ── Slack post modal ── */}
      {slackModal && (() => {
        const allTasks  = slackModal === "sod" ? (sodData?.tasks || []) : (eodData?.tasks || []);
        const channels  = (slackSettings?.channels || []).filter(c => c.channelId?.trim());
        const chanOpts  = [{ channelId: "none", label: "Don't send" }, ...channels];
        // Compute per-channel task counts and preview text
        const chanTasksMap = {};
        allTasks.forEach((t, i) => {
          const chId = taskChanMap[i];
          if (!chId || chId === "none" || !t.text?.trim()) return;
          if (!chanTasksMap[chId]) chanTasksMap[chId] = [];
          chanTasksMap[chId].push(t);
        });
        const postingToCount = Object.keys(chanTasksMap).length;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)",
              borderRadius: 14, width: 560, maxWidth: "95vw", maxHeight: "88vh",
              overflow: "hidden", display: "flex", flexDirection: "column" }}>

              {/* Header */}
              <div style={{ padding: "10px 16px", background: "#4A154B",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%",
                    background: slackModal === "sod" ? "#fbbf24" : "#6ee7b7" }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>
                    Post {slackModal === "sod" ? "SOD" : "EOD"} to Slack
                  </span>
                </div>
                <button onClick={() => setSlackModal(null)}
                  style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer",
                    color: "rgba(255,255,255,0.5)", lineHeight: 1 }}>×</button>
              </div>

              <div style={{ padding: "14px 16px", overflowY: "auto", flex: 1 }}>

                {/* Task → channel assignment */}
                <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "var(--faint)", marginBottom: 8 }}>
                  Assign each task to a channel
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {allTasks.map((t, i) => {
                    if (!t.text?.trim()) return null;
                    const chId  = taskChanMap[i] || "none";
                    const chObj = channels.find(c => c.channelId === chId);
                    const isSending = chId !== "none";
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 160px",
                        gap: 10, alignItems: "center", padding: "7px 10px", borderRadius: 8,
                        border: `0.5px solid ${isSending ? "var(--blue-bd)" : "var(--border)"}`,
                        background: isSending ? "var(--blue-bg)" : "var(--bg)" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            {t.isRecurring && (
                              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 10,
                                background: "#EEEDFE", color: "#534AB7", border: "0.5px solid #AFA9EC",
                                fontWeight: 500, flexShrink: 0 }}>↻</span>
                            )}
                            {t.client && (
                              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20,
                                fontWeight: 500, background: "var(--blue-bg)", color: "var(--blue)",
                                border: "0.5px solid var(--blue-bd)", flexShrink: 0 }}>{t.client}</span>
                            )}
                            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {t.text}
                            </span>
                          </div>
                          {slackModal === "eod" && t.outcome && (
                            <div style={{ fontSize: 10, marginTop: 3, paddingLeft: 2,
                              color: t.outcome === "Done" ? "var(--green)"
                                   : t.outcome === "Carry over" ? "var(--amber)"
                                   : t.outcome === "Blocked" ? "var(--red)" : "var(--muted)" }}>
                              {t.outcome}
                              {t.outcome === "Blocked" && t.blockerDetail ? ` — ${t.blockerDetail}` : ""}
                              {t.outcome === "Carry over" && t.notes ? ` — ${t.notes}` : ""}
                            </div>
                          )}
                        </div>
                        <select value={chId}
                          onChange={e => setTaskChanMap(m => ({ ...m, [i]: e.target.value }))}
                          style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, width: "100%",
                            border: `0.5px solid ${isSending ? "var(--blue-bd)" : "var(--border)"}`,
                            background: isSending ? "var(--blue-bg)" : "var(--surface)",
                            color: isSending ? "var(--blue)" : "var(--muted)",
                            fontFamily: "inherit", cursor: "pointer", fontWeight: isSending ? 500 : 400 }}>
                          {chanOpts.map(o => (
                            <option key={o.channelId} value={o.channelId}>{o.label || o.channelId}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "var(--faint)", marginBottom: 8 }}>
                  Summary
                </div>
                <div style={{ background: "var(--bg)", border: "0.5px solid var(--border)",
                  borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                  {channels.filter(c => chanTasksMap[c.channelId]).map((c, ci) => (
                    <div key={c.channelId} style={{ display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 0", borderBottom: "0.5px solid var(--border)" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%",
                        background: "var(--accent)", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{c.label || c.channelId}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        {chanTasksMap[c.channelId]?.length || 0} task{chanTasksMap[c.channelId]?.length !== 1 ? "s" : ""}
                      </span>
                      <button onClick={() => setPreviewChan(previewChan === c.channelId ? null : c.channelId)}
                        style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, cursor: "pointer",
                          border: "0.5px solid var(--border)", background: previewChan === c.channelId ? "var(--accent)" : "transparent",
                          color: previewChan === c.channelId ? "#fff" : "var(--muted)",
                          fontFamily: "inherit" }}>
                        {previewChan === c.channelId ? "Hide" : "Preview"}
                      </button>
                      {slackDone[c.channelId] === "sent" && (
                        <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 500 }}>✓ Sent</span>
                      )}
                      {slackDone[c.channelId] && slackDone[c.channelId] !== "sent" && (
                        <span style={{ fontSize: 10, color: "var(--red)" }}>✗ {slackDone[c.channelId]}</span>
                      )}
                    </div>
                  ))}
                  {channels.filter(c => !chanTasksMap[c.channelId]).map(c => (
                    <div key={c.channelId} style={{ display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 0", borderBottom: "0.5px solid var(--border)", opacity: 0.5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%",
                        background: "var(--border)", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "var(--faint)", flex: 1 }}>{c.label || c.channelId}</span>
                      <span style={{ fontSize: 11, color: "var(--faint)" }}>no tasks assigned</span>
                    </div>
                  ))}
                  {postingToCount === 0 && (
                    <div style={{ fontSize: 12, color: "var(--faint)", textAlign: "center", padding: "8px 0" }}>
                      No tasks assigned to any channel yet
                    </div>
                  )}
                </div>

                {/* Per-channel preview */}
                {previewChan && chanTasksMap[previewChan] && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                      letterSpacing: "0.07em", color: "var(--faint)", marginBottom: 8 }}>
                      Preview — {channels.find(c => c.channelId === previewChan)?.label || previewChan}
                    </div>
                    <div style={{ background: "var(--bg)", border: "0.5px solid var(--border)",
                      borderRadius: 8, padding: "12px 14px", fontFamily: "JetBrains Mono, monospace",
                      fontSize: 11, color: "var(--muted)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                      {buildSlackBlocksForChannel(slackModal, chanTasksMap[previewChan]).text}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: "10px 16px", borderTop: "0.5px solid var(--border)",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {postingToCount > 0 ? `Posting to ${postingToCount} channel${postingToCount !== 1 ? "s" : ""}` : "No channels selected"}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => setSlackModal(null)}>Cancel</button>
                  <button style={{ fontSize: 11, padding: "5px 14px", borderRadius: 6, border: "none",
                    background: postingToCount > 0 ? "#4A154B" : "var(--border)",
                    color: postingToCount > 0 ? "#fff" : "var(--faint)",
                    cursor: postingToCount > 0 ? "pointer" : "default", fontFamily: "inherit" }}
                    onClick={postToSlack}
                    disabled={slackPosting || postingToCount === 0}>
                    {slackPosting ? "Posting…" : "Post to channels"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <Toast message={toast?.msg} type={toast?.type} />
    </div>
  );
}
