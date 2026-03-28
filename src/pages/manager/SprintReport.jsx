import { useState } from "react";
import { Spinner } from "../../components/index.jsx";

const CLICKUP_PROXY = "https://teampulse-api-pied.vercel.app/api/clickup";

export default function SprintReport() {
  const [loading,  setLoading]  = useState(false);
  const [html,     setHtml]     = useState(null);
  const [meta,     setMeta]     = useState(null);
  const [error,    setError]    = useState(null);
  const [copied,   setCopied]   = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setHtml(null);
    setMeta(null);
    try {
      const res  = await fetch(CLICKUP_PROXY, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else {
        setHtml(data.html);
        setMeta({ sprints: data.sprints, bugs: data.bugs, month: data.month });
      }
    } catch (e) {
      setError("Failed to connect to the proxy. Check your Vercel deployment.");
    }
    setLoading(false);
  };

  const downloadHtml = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const now  = new Date();
    a.href     = url;
    a.download = `iDerive_Monthly_Update_${now.getFullYear()}_${String(now.getMonth()+1).padStart(2,"0")}.html`;
    a.click();
  };

  const downloadPdf = () => {
    if (!html) return;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  const copyHtml = async () => {
    if (!html) return;
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="main-content">
      {/* Header */}
      <div className="flex justify-between items-start mb-16">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>iDerive Monthly report</div>
          <div className="text-sm text-muted">
            Pulls live data from ClickUp — sprint tasks, bug tracking, carry-overs · DT team only
          </div>
        </div>
        <div className="flex gap-8">
          {html && (
            <>
              <button className="btn btn-ghost" onClick={copyHtml}>
                {copied ? "✓ Copied" : "Copy HTML"}
              </button>
              <button className="btn btn-ghost" onClick={downloadHtml}>Download HTML</button>
              <button className="btn btn-ghost" onClick={downloadPdf}>Export PDF</button>
            </>
          )}
          <button className="btn btn-primary" onClick={generate} disabled={loading}>
            {loading ? <><Spinner white /> Fetching from ClickUp...</> : html ? "↺ Regenerate" : "Generate report"}
          </button>
        </div>
      </div>

      {/* Meta strip */}
      {meta && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span className="badge badge-blue">{meta.month}</span>
          <span className="badge badge-green">{meta.sprints} sprint{meta.sprints !== 1 ? "s" : ""}</span>
          <span className="badge badge-red">{meta.bugs} DT bug{meta.bugs !== 1 ? "s" : ""}</span>
          <span className="badge badge-gray">decision-tree.com only</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "14px 16px", background: "var(--red-bg)", border: "0.5px solid var(--red-bd)", borderRadius: 10, color: "var(--red)", fontSize: 13, marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}

      {/* Empty state */}
      {!html && !loading && !error && (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>iDerive Monthly Sprint Report</div>
          <div className="text-sm text-muted mb-16" style={{ maxWidth: 400, margin: "0 auto 20px" }}>
            Click "Generate report" to pull the latest sprint data from ClickUp and build your monthly update for Abhishek.
          </div>
          <button className="btn btn-primary" onClick={generate} style={{ margin: "0 auto" }}>
            Generate report
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <Spinner />
          <div className="text-sm text-muted" style={{ marginTop: 16 }}>
            Fetching sprint data from ClickUp...<br />
            <span style={{ fontSize: 11 }}>This may take 10–20 seconds</span>
          </div>
        </div>
      )}

      {/* Report preview */}
      {html && !loading && (
        <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "var(--surface)", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="text-sm font-medium">Report preview</span>
            <span className="text-xs text-muted">Scroll to view full report</span>
          </div>
          <iframe
            srcDoc={html}
            style={{ width: "100%", height: "800px", border: "none", background: "#f1f5f9" }}
            title="iDerive Sprint Report"
          />
        </div>
      )}
    </div>
  );
}
