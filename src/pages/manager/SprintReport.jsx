import { useState, useRef, useEffect } from "react";
import { Spinner } from "../../components/index.jsx";
import { db } from "../../firebase";
import { collection, doc, setDoc, getDocs, deleteDoc, orderBy, query } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const CLICKUP_PROXY = "https://teampulse-api-pied.vercel.app/api/clickup";

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const QUARTERS = [
  { label: "Q1 (Jan – Mar)", value: "Q1", months: [0,1,2]  },
  { label: "Q2 (Apr – Jun)", value: "Q2", months: [3,4,5]  },
  { label: "Q3 (Jul – Sep)", value: "Q3", months: [6,7,8]  },
  { label: "Q4 (Oct – Dec)", value: "Q4", months: [9,10,11] },
];

function getYears() {
  const y = new Date().getFullYear();
  return [y - 1, y];
}
function currentQuarter() {
  const m = new Date().getMonth();
  if (m <= 2) return "Q1";
  if (m <= 5) return "Q2";
  if (m <= 8) return "Q3";
  return "Q4";
}
function getMonthRange(month, year) {
  const y = parseInt(year), m = parseInt(month);
  return { from: Date.UTC(y,m,1,0,0,0,0), to: Date.UTC(y,m+1,0,23,59,59,999) };
}
function getQuarterRange(quarter, year) {
  const y   = parseInt(year);
  const q   = QUARTERS.find(q => q.value === quarter);
  const m0  = q.months[0];
  const m2  = q.months[2];
  return {
    from: Date.UTC(y, m0, 1, 0, 0, 0, 0),
    to:   Date.UTC(y, m2+1, 0, 23, 59, 59, 999),
  };
}

export default function SprintReport() {
  const now   = new Date();
  const years = getYears();

  // ── Tab ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("monthly"); // "monthly" | "quarterly"

  // ── Monthly state ──────────────────────────────────────────────────────────
  const [sprintInput,  setSprintInput]  = useState("");
  const [filterMonth,  setFilterMonth]  = useState("");
  const [filterYear,   setFilterYear]   = useState(String(now.getFullYear()));

  // ── Quarterly state ────────────────────────────────────────────────────────
  const [filterQuarter, setFilterQuarter] = useState(currentQuarter());
  const [quarterYear,   setQuarterYear]   = useState(String(now.getFullYear()));

  // ── Shared state ───────────────────────────────────────────────────────────
  const [loading,     setLoading]     = useState(false);
  const [html,        setHtml]        = useState(null);
  const [meta,        setMeta]        = useState(null);
  const [error,       setError]       = useState(null);
  const [copied,      setCopied]      = useState(false);
  const [drafts,      setDrafts]      = useState([]);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaved,  setDraftSaved]  = useState(false);
  const [draftsOpen,  setDraftsOpen]  = useState(false);
  const reportRef = useRef(null);

  // ── Parse sprint numbers ───────────────────────────────────────────────────
  const parseSprintNums = (input) => {
    const cleaned = input.replace(/ps/gi, "").replace(/\s+/g, ",");
    const nums = new Set();
    for (const part of cleaned.split(",")) {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (range) {
        for (let n = parseInt(range[1]); n <= parseInt(range[2]); n++) nums.add(n);
      } else {
        const n = parseInt(part.trim());
        if (!isNaN(n)) nums.add(n);
      }
    }
    return [...nums].sort((a, b) => a - b);
  };

  const sprintNums   = parseSprintNums(sprintInput);
  const usingManual  = sprintInput.trim().length > 0;
  const usingMonth   = !usingManual && filterMonth !== "";
  const canGenerateM = usingManual ? sprintNums.length > 0 : usingMonth;
  const canGenerateQ = filterQuarter !== "" && quarterYear !== "";

  const clearAll = () => {
    setSprintInput(""); setFilterMonth("");
    setHtml(null); setMeta(null); setError(null);
  };

  const monthlyLabel = () => {
    if (usingManual) return sprintNums.map(n => `PS${n}`).join(", ");
    if (usingMonth)  return `${MONTHS[parseInt(filterMonth)]} ${filterYear}`;
    return "";
  };
  const quarterlyLabel = () => `${filterQuarter} ${quarterYear}`;

  // ── Generate Monthly ───────────────────────────────────────────────────────
  const generateMonthly = async () => {
    if (!canGenerateM) return;
    setLoading(true); setError(null); setHtml(null); setMeta(null);
    try {
      const body = usingManual
        ? { sprintNums, reportType: "monthly" }
        : (() => {
            const r = getMonthRange(filterMonth, filterYear);
            return { dateFrom: r.from, dateTo: r.to, monthLabel: `${MONTHS[parseInt(filterMonth)]} ${filterYear}`, reportType: "monthly" };
          })();
      const res  = await fetch(CLICKUP_PROXY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else {
        setHtml(data.html);
        setMeta({ sprints: data.sprints, bugs: data.bugs, month: data.month, label: monthlyLabel(), sprintNames: data.sprintNames, type: "monthly" });
      }
    } catch (e) { setError("Failed to connect to the proxy."); }
    setLoading(false);
  };

  // ── Generate Quarterly ─────────────────────────────────────────────────────
  const generateQuarterly = async () => {
    if (!canGenerateQ) return;
    setLoading(true); setError(null); setHtml(null); setMeta(null);
    try {
      const r    = getQuarterRange(filterQuarter, quarterYear);
      const body = {
        dateFrom:      r.from,
        dateTo:        r.to,
        quarterLabel:  `${filterQuarter} ${quarterYear}`,
        reportType:    "quarterly",
      };
      const res  = await fetch(CLICKUP_PROXY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else {
        setHtml(data.html);
        setMeta({ sprints: data.sprints, bugs: data.bugs, label: quarterlyLabel(), sprintNames: data.sprintNames, quarter: data.quarter, type: "quarterly" });
      }
    } catch (e) { setError("Failed to connect to the proxy."); }
    setLoading(false);
  };

  // ── Build annotated HTML ───────────────────────────────────────────────────
  const buildAnnotatedHtml = () => {
    if (!reportRef.current || !html) return html;
    const textareas = reportRef.current.querySelectorAll("textarea.ann-ta");
    const values    = Array.from(textareas).map(ta => ta.value);
    let idx = 0;
    // Match ALL ann-ta textareas — empty OR already containing content (e.g. from a draft).
    // Previous regex only matched empty ones (><\/textarea>) which caused two bugs:
    //   1. Index mismatch: DOM idx included filled textareas but regex idx skipped them
    //      → wrong value written to wrong textarea (cross-contamination)
    //   2. Draft edits lost: edits to pre-filled draft textareas were never captured
    return html.replace(/<textarea([^<]*?ann-ta[^<]*?)>([\s\S]*?)<\/textarea>/g, (match, attrs) => {
      const val = values[idx] || "";
      idx++;
      const escaped = val.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      return `<textarea${attrs}>${escaped}</textarea>`;
    });
  };

  // ── Draft helpers ──────────────────────────────────────────────────────────
  const getUserId = () => getAuth().currentUser?.uid || "anon";

  const loadDrafts = async () => {
    try {
      const uid  = getUserId();
      const q    = query(collection(db, "reportDrafts", uid, "drafts"), orderBy("savedAt", "desc"));
      const snap = await getDocs(q);
      setDrafts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("loadDrafts error:", e); }
  };

  const saveDraft = async () => {
    if (!html) return;
    setDraftSaving(true);
    try {
      const uid       = getUserId();
      const annotated = buildAnnotatedHtml();
      const label     = meta?.label || (tab === "quarterly" ? quarterlyLabel() : monthlyLabel()) || "Untitled";
      const draftId   = `draft_${Date.now()}`;
      await setDoc(doc(db, "reportDrafts", uid, "drafts", draftId), {
        label,
        type:        meta?.type || tab,
        sprintNames: meta?.sprintNames || [],
        bugs:        meta?.bugs        || 0,
        month:       meta?.month       || "",
        quarter:     meta?.quarter     || (tab === "quarterly" ? quarterlyLabel() : ""),
        html:        annotated,
        savedAt:     Date.now(),
      });
      await loadDrafts();
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2500);
    } catch (e) {
      console.error("saveDraft error:", e);
      alert("Failed to save draft: " + e.message);
    }
    setDraftSaving(false);
  };

  const deleteDraft = async (draftId) => {
    try {
      const uid = getUserId();
      await deleteDoc(doc(db, "reportDrafts", uid, "drafts", draftId));
      setDrafts(d => d.filter(x => x.id !== draftId));
    } catch (e) { console.error("deleteDraft error:", e); }
  };

  const loadDraft = (draft) => {
    setHtml(draft.html);
    setMeta({ label: draft.label, sprintNames: draft.sprintNames, bugs: draft.bugs, month: draft.month, quarter: draft.quarter, sprints: draft.sprintNames?.length || 0, type: draft.type });
    if (draft.type === "quarterly") setTab("quarterly");
    else setTab("monthly");
    setDraftsOpen(false);
    setError(null);
  };

  useEffect(() => { loadDrafts(); }, []);

  // ── Export helpers ─────────────────────────────────────────────────────────
  const downloadHtml = () => {
    const annotated = buildAnnotatedHtml();
    const blob = new Blob([annotated], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `iDerive_Report_${(meta?.label || "report").replace(/\s+/g, "_")}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPdf = () => {
    const annotated = buildAnnotatedHtml();
    const win = window.open("", "_blank");
    win.document.write(annotated);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  const copyHtml = async () => {
    const annotated = buildAnnotatedHtml();
    await navigator.clipboard.writeText(annotated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Style scoping for report rendering ────────────────────────────────────
  const getReportBody = () => {
    if (!html) return "";
    const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return m ? m[1] : html;
  };
  const getReportStyles = () => {
    if (!html) return "";
    const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (!m) return "";
    return m[1].replace(/([^{}]+)\{/g, (match, selectors) => {
      if (selectors.trim().startsWith("@")) return match;
      const prefixed = selectors.split(",").map(s => {
        const t = s.trim();
        if (t.startsWith(".iderive-report")) return t;
        if (t === "body" || t === "html" || t === "*") return ".iderive-report";
        return `.iderive-report ${t}`;
      }).join(", ");
      return `${prefixed} {`;
    });
  };

  // ── Drafts filtered by current tab ────────────────────────────────────────
  const monthlyDrafts  = drafts.filter(d => !d.type || d.type === "monthly");
  const quarterlyDrafts = drafts.filter(d => d.type === "quarterly");
  const currentDrafts  = tab === "quarterly" ? quarterlyDrafts : monthlyDrafts;

  return (
    <div className="main-content">

      {/* ── Tab switcher ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", gap: 0, borderRadius: 8, border: "0.5px solid var(--border)", overflow: "hidden", width: "fit-content" }}>
            {[{ key: "monthly", label: "Monthly report" }, { key: "quarterly", label: "Quarterly report" }].map(t => (
              <button key={t.key}
                onClick={() => { setTab(t.key); setHtml(null); setMeta(null); setError(null); }}
                style={{
                  padding: "7px 18px", fontSize: 13, fontWeight: tab === t.key ? 500 : 400,
                  background: tab === t.key ? "var(--accent)" : "var(--surface)",
                  color: tab === t.key ? "#fff" : "var(--muted)",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 6 }}>
            {tab === "monthly"
              ? "Select sprints by number or month · Completed sprints only · DT team"
              : "Select a quarter to aggregate all sprints · DT team"}
          </div>
        </div>
        {html && (
          <div className="flex gap-8">
            <button className="btn btn-ghost btn-sm" onClick={copyHtml}>{copied ? "✓ Copied" : "Copy HTML"}</button>
            <button className="btn btn-ghost btn-sm" onClick={downloadHtml}>Download HTML</button>
            <button className="btn btn-ghost btn-sm" onClick={downloadPdf}>Export PDF</button>
            <button className="btn btn-ghost btn-sm" onClick={saveDraft} disabled={draftSaving}
              style={{ color: draftSaved ? "var(--green)" : "" }}>
              {draftSaving ? "Saving…" : draftSaved ? "✓ Draft saved" : "Save draft"}
            </button>
          </div>
        )}
      </div>

      {/* ── Drafts panel ── */}
      <div className="card mb-16">
        <div className="card-header" style={{ cursor: "pointer" }} onClick={() => setDraftsOpen(o => !o)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="card-title">My drafts</span>
            <span className="badge badge-blue" style={{ fontSize: 10 }}>{tab === "quarterly" ? "Quarterly" : "Monthly"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {currentDrafts.length > 0 && (
              <span className="badge badge-accent" style={{ fontSize: 10 }}>{currentDrafts.length} saved</span>
            )}
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{draftsOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        {draftsOpen && (
          <div className="card-body" style={{ padding: 0 }}>
            {currentDrafts.length === 0 ? (
              <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
                No {tab} drafts yet. Generate a report and click "Save draft".
              </div>
            ) : (
              currentDrafts.map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "0.5px solid var(--border)" }}>
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => loadDraft(d)}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{d.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {d.type === "quarterly"
                        ? `${d.quarter || d.label} · ${d.sprintNames?.length || 0} sprints`
                        : d.sprintNames?.join(", ")}
                      {d.bugs > 0 ? ` · ${d.bugs} bugs` : ""}
                      {" · Saved "}
                      {new Date(d.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {" · "}
                      {new Date(d.savedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => loadDraft(d)}>Open</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => deleteDraft(d.id)} style={{ color: "var(--red)" }}>Delete</button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Monthly selection card ── */}
      {tab === "monthly" && (
        <div className="card mb-16">
          <div className="card-header">
            <span className="card-title">Select sprints</span>
            <span className="card-meta">Sprint numbers or month · Completed sprints only</span>
          </div>
          <div className="card-body">
            {/* Sprint number input */}
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" style={{ marginBottom: 5, display: "block" }}>
                Sprint numbers
                {usingMonth && <span style={{ marginLeft: 8, fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--faint)", fontSize: 10 }}>— disabled · clear month first</span>}
              </label>
              <div className="flex gap-8 items-center" style={{ flexWrap: "wrap" }}>
                <input className="field-input"
                  placeholder="e.g. 69  or  68,69  or  68-70  or  PS69 PS70"
                  value={sprintInput} disabled={usingMonth}
                  onChange={e => { setSprintInput(e.target.value); setFilterMonth(""); setHtml(null); setMeta(null); setError(null); }}
                  onKeyDown={e => e.key === "Enter" && canGenerateM && generateMonthly()}
                  style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, flex: 1, opacity: usingMonth ? 0.35 : 1 }} />
                {sprintNums.map(n => <span key={n} className="badge badge-blue" style={{ fontSize: 11, padding: "3px 10px" }}>PS{n}</span>)}
              </div>
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
              <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
              <span style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>or filter by month</span>
              <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
            </div>

            {/* Month + Year */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10, marginBottom: 14 }}>
              <div>
                <label className="field-label" style={{ marginBottom: 5, display: "block" }}>
                  Month {usingMonth && <span style={{ color: "var(--accent)", fontSize: 9, marginLeft: 4 }}>● active</span>}
                </label>
                <select className="field-input" disabled={usingManual}
                  style={{ opacity: usingManual ? 0.35 : 1, borderColor: usingMonth ? "var(--accent)" : "", background: usingMonth ? "var(--blue-bg,#eff6ff)" : "" }}
                  value={filterMonth}
                  onChange={e => { setFilterMonth(e.target.value); setSprintInput(""); setHtml(null); setMeta(null); setError(null); }}>
                  <option value="">— select month —</option>
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" style={{ marginBottom: 5, display: "block" }}>Year</label>
                <select className="field-input" disabled={usingManual} style={{ opacity: usingManual ? 0.35 : 1 }}
                  value={filterYear} onChange={e => { setFilterYear(e.target.value); setHtml(null); setMeta(null); setError(null); }}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {usingManual && sprintNums.length > 0 && <span>Fetching: <strong style={{ color: "var(--text)" }}>{sprintNums.map(n => `PS${n}`).join(", ")}</strong></span>}
                {usingMonth && <span>Fetching sprints ending in <strong style={{ color: "var(--text)" }}>{MONTHS[parseInt(filterMonth)]} {filterYear}</strong></span>}
                {!usingManual && !usingMonth && <span style={{ color: "var(--faint)" }}>Enter sprint numbers or select a month above</span>}
              </div>
              <div className="flex gap-8">
                {(usingManual || usingMonth) && <button className="btn btn-ghost btn-sm" onClick={clearAll}>Clear</button>}
                <button className="btn btn-primary" onClick={generateMonthly} disabled={loading || !canGenerateM}>
                  {loading ? <><Spinner white /> Fetching...</> : html ? "↺ Regenerate" : "Generate report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quarterly selection card ── */}
      {tab === "quarterly" && (
        <div className="card mb-16">
          <div className="card-header">
            <span className="card-title">Select quarter</span>
            <span className="card-meta">Aggregates all completed sprints within the quarter</span>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 12, marginBottom: 16 }}>
              <div>
                <label className="field-label" style={{ marginBottom: 6, display: "block" }}>Quarter</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {QUARTERS.map(q => (
                    <div key={q.value}
                      onClick={() => { setFilterQuarter(q.value); setHtml(null); setMeta(null); setError(null); }}
                      style={{
                        padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                        border: filterQuarter === q.value ? "1.5px solid var(--accent)" : "0.5px solid var(--border)",
                        background: filterQuarter === q.value ? "var(--blue-bg,#eff6ff)" : "var(--surface)",
                        fontWeight: filterQuarter === q.value ? 500 : 400,
                        color: filterQuarter === q.value ? "var(--accent)" : "var(--text)",
                      }}>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{q.value}</div>
                      <div style={{ fontSize: 10, color: filterQuarter === q.value ? "var(--accent)" : "var(--faint)", marginTop: 2 }}>
                        {q.label.split("(")[1]?.replace(")", "")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label" style={{ marginBottom: 6, display: "block" }}>Year</label>
                <select className="field-input" value={quarterYear}
                  onChange={e => { setQuarterYear(e.target.value); setHtml(null); setMeta(null); setError(null); }}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Fetching all DT sprints in <strong style={{ color: "var(--text)" }}>{filterQuarter} {quarterYear}</strong>
                {" · "}
                {QUARTERS.find(q => q.value === filterQuarter)?.label.replace(`${filterQuarter} (`, "").replace(")", "")}
              </div>
              <button className="btn btn-primary" onClick={generateQuarterly} disabled={loading || !canGenerateQ}>
                {loading ? <><Spinner white /> Fetching...</> : html ? "↺ Regenerate" : "Generate report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Meta badges ── */}
      {meta && (
        <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
          <span className="badge badge-blue">{meta.label}</span>
          {meta.type === "quarterly" && <span className="badge badge-accent">Quarterly</span>}
          {meta.sprintNames?.map(n => <span key={n} className="badge badge-accent">{n}</span>)}
          <span className="badge badge-green">{meta.sprints} sprint{meta.sprints !== 1 ? "s" : ""} loaded</span>
          <span className="badge badge-red">{meta.bugs} DT bug{meta.bugs !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ padding: "14px 16px", background: "var(--red-bg,#fef2f2)", border: "0.5px solid var(--red-bd,#fecaca)", borderRadius: 10, color: "var(--red,#dc2626)", fontSize: 13, marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <Spinner />
          <div className="text-sm text-muted" style={{ marginTop: 16 }}>
            Fetching data from ClickUp…<br />
            <span style={{ fontSize: 11 }}>
              {tab === "quarterly" ? "Quarterly reports may take 20–40 seconds" : "This may take 10–20 seconds"}
            </span>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!html && !loading && !error && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{tab === "quarterly" ? "📊" : "📋"}</div>
          <div className="text-sm">
            {tab === "quarterly"
              ? "Select a quarter above and click Generate report"
              : "Enter sprint numbers or select a month above, then click Generate report"}
          </div>
        </div>
      )}

      {/* ── Report preview ── */}
      {html && !loading && (
        <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "var(--surface)", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="text-sm font-medium">
              {meta?.type === "quarterly" ? "Quarterly report" : "Monthly report"} — {meta?.label}
            </span>
            <span className="text-xs text-muted">Type annotations directly · then Download HTML or Export PDF to save</span>
          </div>
          <style>{getReportStyles()}</style>
          <div ref={reportRef} className="iderive-report" style={{ background: "#f1f5f9", padding: 0 }}
            dangerouslySetInnerHTML={{ __html: getReportBody() }} />
        </div>
      )}

    </div>
  );
}
