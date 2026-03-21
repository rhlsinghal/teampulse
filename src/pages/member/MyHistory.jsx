import { useState } from "react";
import { Calendar, BwBadge, StatusBadge, ClientBadge, Loading, EmptyState } from "../../components/index.jsx";
import { useHistory } from "../../hooks/useHistory";
import { fmt, TODAY } from "../../utils/dates";
import { BANDWIDTH, BW_STYLES } from "../../utils/constants";

export default function MyHistory({ memberName }) {
  const { entries, loading } = useHistory(memberName);
  const [calYear,  setCalYear]  = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selected, setSelected] = useState(TODAY);

  const entryDates  = entries.map(e => e.date);
  const blockerDates = entries.filter(e => e.blockers?.trim()).map(e => e.date);

  const navigateCal = (dir) => {
    let m = calMonth + dir;
    let y = calYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setCalMonth(m);
    setCalYear(y);
  };

  const selectedEntry = entries.find(e => e.date === selected) || null;

  if (loading) return <div className="main-content"><Loading /></div>;

  return (
    <div className="main-content">
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>My history</div>
      <div className="text-sm text-muted mb-16">Click any highlighted date to view that entry</div>

      <div className="flex gap-16 items-start">
        {/* Calendar */}
        <Calendar
          year={calYear} month={calMonth}
          onNavigate={navigateCal}
          entryDates={entryDates}
          blockerDates={blockerDates}
          selectedDate={selected}
          onSelect={setSelected}
        />

        {/* Entry detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedEntry ? (
            <EntryDetail entry={selectedEntry} />
          ) : (
            <EmptyState icon="📅" message={`No update found for ${fmt(selected)}.\nSelect a highlighted date on the calendar.`} />
          )}

          {/* All entries list below */}
          {entries.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10, color: "var(--muted)" }}>
                All entries — {entries.length} total
              </div>
              {entries.filter(e => e.date !== selected).slice(0, 5).map((e, i) => (
                <div key={i} className="card" style={{ cursor: "pointer", marginBottom: 8 }}
                  onClick={() => { setSelected(e.date); setCalYear(+e.date.slice(0,4)); setCalMonth(+e.date.slice(5,7)-1); }}>
                  <div className="card-header">
                    <span className="text-xs" style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--muted)" }}>{fmt(e.date)}</span>
                    <BwBadge bw={e.bandwidth} />
                  </div>
                </div>
              ))}
              {entries.length > 6 && (
                <div className="text-xs text-faint" style={{ textAlign: "center", padding: "8px 0" }}>
                  + {entries.length - 6} more entries — use calendar to navigate
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntryDetail({ entry }) {
  const bwStyle = BW_STYLES[entry.bandwidth] || BW_STYLES[3];
  const bwLabel = BANDWIDTH[entry.bandwidth]?.label || "—";
  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--muted)" }}>{fmt(entry.date)}</span>
        <div className="flex gap-6 items-center">
          <span className="badge" style={{ color: bwStyle.color, background: bwStyle.bg, borderColor: bwStyle.bd }}>{bwLabel}</span>
          {entry.date === TODAY && <span className="badge badge-blue">Today</span>}
        </div>
      </div>
      <div className="card-body">
        <div className="form-grid-2 mb-12">
          <div>
            <div className="field-label mb-4">Yesterday</div>
            <div className="text-sm" style={{ lineHeight: 1.6, color: "var(--text)" }}>{entry.yesterday || "—"}</div>
          </div>
          <div>
            <div className="field-label mb-4">Today</div>
            <div className="text-sm" style={{ lineHeight: 1.6, color: "var(--text)" }}>{entry.today || "—"}</div>
          </div>
        </div>
        {entry.blockers && (
          <div className="mb-12">
            <div className="field-label mb-4">⚑ Blockers</div>
            <div className="text-sm" style={{ color: "var(--red)", lineHeight: 1.6 }}>{entry.blockers}</div>
          </div>
        )}
        {entry.tasks?.length > 0 && (
          <div>
            <div className="field-label mb-8">Tasks</div>
            <table className="task-table">
              <thead><tr><th>Client</th><th>Task</th><th>Status</th></tr></thead>
              <tbody>
                {entry.tasks.map((t, i) => (
                  <tr key={i}>
                    <td><ClientBadge client={t.client} /></td>
                    <td className="text-sm">{t.text}</td>
                    <td><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {entry.note && (
          <div className="mt-12">
            <div className="field-label mb-4">Note for manager</div>
            <div className="text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>{entry.note}</div>
          </div>
        )}
      </div>
    </div>
  );
}
