import { useState, useRef } from "react";
import { Spinner } from "../../components/index.jsx";

const CLICKUP_PROXY = "https://teampulse-api-pied.vercel.app/api/clickup";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function getYears() {
  const y = new Date().getFullYear();
  return [y - 1, y];
}

function getDateRange(month, year) {
  const y = parseInt(year);
  const m = parseInt(month);
  // Use Date.UTC to avoid timezone shift (India UTC+5:30 would roll date back to previous month)
  return {
    from: Date.UTC(y, m, 1, 0, 0, 0, 0),
    to:   Date.UTC(y, m + 1, 0, 23, 59, 59, 999),
  };
}

export default function SprintReport() {
  const now   = new Date();
  const years = getYears();

  const [sprintInput, setSprintInput] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear,  setFilterYear]  = useState(String(now.getFullYear()));
  const [loading,     setLoading]     = useState(false);
  const [html,        setHtml]        = useState(null);
  const [meta,        setMeta]        = useState(null);
  const [error,       setError]       = useState(null);
  const [copied,      setCopied]      = useState(false);
  const reportRef = useRef(null);

  // ── Parse sprint number input ──────────────────────────────────────────────
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

  const sprintNums  = parseSprintNums(sprintInput);
  const usingManual = sprintInput.trim().length > 0;
  const usingMonth  = !usingManual && filterMonth !== "";
  const canGenerate = usingManual ? sprintNums.length > 0 : usingMonth;

  const clearAll = () => {
    setSprintInput("");
    setFilterMonth("");
    setHtml(null);
    setMeta(null);
    setError(null);
  };

  const filterLabel = () => {
    if (usingManual) return sprintNums.map(n => `PS${n}`).join(", ");
    if (usingMonth)  return `${MONTHS[parseInt(filterMonth)]} ${filterYear}`;
    return "";
  };

  // ── Generate ───────────────────────────────────────────────────────────────
  const generate = async () => {
    if (!canGenerate) return;
    setLoading(true); setError(null); setHtml(null); setMeta(null);
    try {
      const body = usingManual
        ? { sprintNums }
        : (() => { const r = getDateRange(filterMonth, filterYear); return { dateFrom: r.from, dateTo: r.to, monthLabel: `${MONTHS[parseInt(filterMonth)]} ${filterYear}` }; })();

      const res  = await fetch(CLICKUP_PROXY, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setHtml(data.html);
        setMeta({
          sprints:     data.sprints,
          bugs:        data.bugs,
          month:       data.month,
          label:       filterLabel(),
          sprintNames: data.sprintNames,
        });
      }
    } catch (e) {
      setError("Failed to connect to the proxy. Check your Vercel deployment.");
    }
    setLoading(false);
  };

  // ── Build annotated HTML by reading textarea values from the DOM ───────────
  const buildAnnotatedHtml = () => {
    if (!reportRef.current || !html) return html;

    // Read all textarea values at once
    const textareas = reportRef.current.querySelectorAll("textarea.ann-ta");
    const values = Array.from(textareas).map(ta => ta.value);

    // Replace all ann-ta textareas in one pass
    // Regex matches <textarea ...ann-ta...></textarea> including placeholder attrs
    let idx = 0;
    const annotated = html.replace(
      /<textarea([^<]*?ann-ta[^<]*?)><\/textarea>/g,
      (match, attrs) => {
        const val = values[idx] || "";
        idx++;
        if (!val) return match;
        const escaped = val
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<textarea${attrs}>${escaped}</textarea>`;
      }
    );

    return annotated;
  };

  // ── Export helpers ─────────────────────────────────────────────────────────
  const downloadHtml = () => {
    const annotated = buildAnnotatedHtml();
    const blob = new Blob([annotated], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `iDerive_Report_${filterLabel().replace(/\s+/g, "_")}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPdf = () => {
    // Open annotated HTML in new window and print
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

  // ── Extract just the body content from the report HTML for rendering ───────
  // We render the report body inside a div (not iframe) so we can read textarea values
  const getReportBody = () => {
    if (!html) return "";
    // Extract everything between <body> and </body>
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : html;
  };

  // ── Extract styles from report HTML ───────────────────────────────────────
  const getReportStyles = () => {
    if (!html) return "";
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    return styleMatch ? styleMatch[1] : "";
  };

  return (
    <div className="main-content">

      {/* Header */}
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>iDerive Monthly report</div>
          <div className="text-sm text-muted">
            Select completed sprints by number or month · Pulls live data from ClickUp · DT team only
          </div>
        </div>
        {html && (
          <div className="flex gap-8">
            <button className="btn btn-ghost btn-sm" onClick={copyHtml}>{copied ? "✓ Copied" : "Copy HTML"}</button>
            <button className="btn btn-ghost btn-sm" onClick={downloadHtml}>Download HTML</button>
            <button className="btn btn-ghost btn-sm" onClick={downloadPdf}>Export PDF</button>
          </div>
        )}
      </div>

      {/* Selection card */}
      <div className="card mb-16">
        <div className="card-header">
          <span className="card-title">Select sprints</span>
          <span className="card-meta">Enter sprint numbers or filter by month · Completed sprints only</span>
        </div>
        <div className="card-body">

          {/* Sprint number input */}
          <div style={{ marginBottom: 14 }}>
            <label className="field-label" style={{ marginBottom: 5, display: "block" }}>
              Sprint numbers
              {usingMonth && (
                <span style={{ marginLeft: 8, fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--faint)", fontSize: 10 }}>
                  — disabled · clear month filter first
                </span>
              )}
            </label>
            <div className="flex gap-8 items-center" style={{ flexWrap: "wrap" }}>
              <input
                className="field-input"
                placeholder="e.g. 69  or  68,69  or  68-70  or  PS69 PS70"
                value={sprintInput}
                disabled={usingMonth}
                onChange={e => {
                  setSprintInput(e.target.value);
                  setFilterMonth("");
                  setHtml(null); setMeta(null); setError(null);
                }}
                onKeyDown={e => e.key === "Enter" && canGenerate && generate()}
                style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, flex: 1, opacity: usingMonth ? 0.35 : 1 }}
              />
              {sprintNums.map(n => (
                <span key={n} className="badge badge-blue" style={{ fontSize: 11, padding: "3px 10px" }}>PS{n}</span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 4 }}>
              Accepts: single · comma-separated · range (68–70) · PS prefix optional
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
            <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
            <span style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
              or filter by month
            </span>
            <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
          </div>

          {/* Month + Year */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10, marginBottom: 14 }}>
            <div>
              <label className="field-label" style={{ marginBottom: 5, display: "block" }}>
                Month
                {usingMonth && <span style={{ color: "var(--accent)", fontSize: 9, marginLeft: 4 }}>● active</span>}
              </label>
              <select
                className="field-input"
                disabled={usingManual}
                style={{
                  opacity:     usingManual ? 0.35 : 1,
                  borderColor: usingMonth ? "var(--accent)" : "",
                  background:  usingMonth ? "var(--blue-bg, #eff6ff)" : "",
                }}
                value={filterMonth}
                onChange={e => {
                  setFilterMonth(e.target.value);
                  setSprintInput("");
                  setHtml(null); setMeta(null); setError(null);
                }}
              >
                <option value="">— select month —</option>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" style={{ marginBottom: 5, display: "block" }}>Year</label>
              <select
                className="field-input"
                disabled={usingManual}
                style={{ opacity: usingManual ? 0.35 : 1 }}
                value={filterYear}
                onChange={e => { setFilterYear(e.target.value); setHtml(null); setMeta(null); setError(null); }}
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Summary + generate */}
          <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {usingManual && sprintNums.length > 0 && (
                <span>Fetching sprints: <strong style={{ color: "var(--text)" }}>{sprintNums.map(n => `PS${n}`).join(", ")}</strong></span>
              )}
              {usingMonth && (
                <span>Fetching completed sprints ending in <strong style={{ color: "var(--text)" }}>{MONTHS[parseInt(filterMonth)]} {filterYear}</strong></span>
              )}
              {!usingManual && !usingMonth && (
                <span style={{ color: "var(--faint)" }}>Enter sprint numbers or select a month above</span>
              )}
            </div>
            <div className="flex gap-8">
              {(usingManual || usingMonth) && (
                <button className="btn btn-ghost btn-sm" onClick={clearAll}>Clear</button>
              )}
              <button className="btn btn-primary" onClick={generate} disabled={loading || !canGenerate}>
                {loading ? <><Spinner white /> Fetching...</> : html ? "↺ Regenerate" : "Generate report"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Meta badges */}
      {meta && (
        <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
          <span className="badge badge-blue">{meta.label}</span>
          {meta.sprintNames?.map(n => <span key={n} className="badge badge-accent">{n}</span>)}
          <span className="badge badge-green">{meta.sprints} sprint{meta.sprints !== 1 ? "s" : ""} loaded</span>
          <span className="badge badge-red">{meta.bugs} DT bug{meta.bugs !== 1 ? "s" : ""}</span>
          <span className="badge badge-gray">completed sprints only</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "14px 16px", background: "var(--red-bg, #fef2f2)", border: "0.5px solid var(--red-bd, #fecaca)", borderRadius: 10, color: "var(--red, #dc2626)", fontSize: 13, marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <Spinner />
          <div className="text-sm text-muted" style={{ marginTop: 16 }}>
            Fetching data from ClickUp...<br />
            <span style={{ fontSize: 11 }}>This may take 10–20 seconds</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!html && !loading && !error && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div className="text-sm">
            Enter sprint numbers or select a month above, then click <strong>Generate report</strong>
          </div>
        </div>
      )}

      {/* Report — rendered in div (not iframe) so we can read textarea values */}
      {html && !loading && (
        <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "var(--surface)", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="text-sm font-medium">Report preview — {meta?.label}</span>
            <span className="text-xs text-muted">Type annotations directly · then Download HTML or Export PDF to save</span>
          </div>
          {/* Inject report styles scoped to this container */}
          <style>{getReportStyles()}</style>
          {/* Render report body directly in DOM so textarea values are accessible */}
          <div
            ref={reportRef}
            style={{ background: "#f1f5f9", padding: "0" }}
            dangerouslySetInnerHTML={{ __html: getReportBody() }}
          />
        </div>
      )}

    </div>
  );
}
