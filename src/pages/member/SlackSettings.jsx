import { useState } from "react";
import { useSlack } from "../../hooks/useSlack";
import { Loading }  from "../../components/index.jsx";

function TokenSection({ settings, onSave, onRevoke, saving }) {
  const [input,   setInput]   = useState("");
  const [visible, setVisible] = useState(false);
  const [saved,   setSaved]   = useState(false);

  const handleSave = async () => {
    if (!input.trim()) return;
    const ok = await onSave(input.trim());
    if (ok) { setInput(""); setSaved(true); setTimeout(() => setSaved(false), 3000); }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-header">
        <span className="card-title">Slack token</span>
        {settings?.tokenSaved && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--green-bg)",
            color: "var(--green)", border: "0.5px solid var(--green-bd)", fontWeight: 500 }}>
            ✓ Token saved
          </span>
        )}
      </div>
      <div className="card-body">
        {/* How to get token guide */}
        <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--blue-bg)",
          border: "0.5px solid var(--blue-bd)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--blue)", marginBottom: 6 }}>
            How to get your Slack token
          </div>
          {[
            'Go to api.slack.com/apps in your browser',
            'Click "Create New App" → "From scratch"',
            'Give it any name (e.g. "My Standup") and select your workspace',
            'Go to "OAuth & Permissions" in the left sidebar',
            'Under "User Token Scopes" click "Add an OAuth Scope"',
            'Add the scope: chat:write',
            'Click "Install to Workspace" at the top → Allow',
            'Copy the "User OAuth Token" (starts with xoxp-)',
            'Paste it below and click Save',
          ].map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 11, color: "var(--muted)" }}>
              <span style={{ minWidth: 16, color: "var(--blue)", fontWeight: 500 }}>{i + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, position: "relative", minWidth: 260 }}>
            <input
              className="field-input"
              type={visible ? "text" : "password"}
              placeholder={settings?.tokenSaved ? "Enter new token to replace existing" : "xoxp-..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              style={{ marginBottom: 0, paddingRight: 40, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}
            />
            <button onClick={() => setVisible(v => !v)}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", fontSize: 13,
                color: "var(--faint)", padding: 2 }}>
              {visible ? "🙈" : "👁"}
            </button>
          </div>
          <button className="btn btn-primary" onClick={handleSave}
            disabled={saving || !input.trim()}>
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save token"}
          </button>
          {settings?.tokenSaved && (
            <button className="btn btn-ghost" onClick={onRevoke}
              style={{ color: "var(--red)", borderColor: "var(--red-bd)" }}>
              Revoke
            </button>
          )}
        </div>
        {settings?.tokenSaved && settings?.tokenSavedAt && (
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>
            Last updated: {new Date(settings.tokenSavedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {" · "}Token is stored securely and never shown again
          </div>
        )}
        {!settings?.tokenSaved && (
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>
            Your token is stored securely and only used to post messages on your behalf.
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelRow({ ch, onUpdate, onRemove, onTest }) {
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  const handleTest = async () => {
    if (!ch.channelId?.trim()) { setTestMsg("Enter a channel ID first"); return; }
    setTesting(true); setTestMsg("");
    try {
      await onTest(ch.channelId, ch.label || ch.channelId);
      setTestMsg("✓ Message sent!");
    } catch (e) {
      setTestMsg(`✗ ${e.message}`);
    }
    setTesting(false);
    setTimeout(() => setTestMsg(""), 4000);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8,
      alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--border)" }}>
      <input className="field-input" placeholder="Label (e.g. WM, DT, Client name)"
        value={ch.label} onChange={e => onUpdate({ ...ch, label: e.target.value })}
        style={{ marginBottom: 0, fontSize: 12 }} />
      <div>
        <input className="field-input" placeholder="Channel ID (e.g. C0123ABCDEF)"
          value={ch.channelId} onChange={e => onUpdate({ ...ch, channelId: e.target.value })}
          style={{ marginBottom: 0, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} />
        {testMsg && (
          <div style={{ fontSize: 10, marginTop: 3,
            color: testMsg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>
            {testMsg}
          </div>
        )}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={handleTest} disabled={testing || !ch.channelId?.trim()}>
        {testing ? "…" : "Test"}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={onRemove}
        style={{ color: "var(--red)", borderColor: "var(--red-bd)" }}>×</button>
    </div>
  );
}

function ChannelsSection({ settings, onSave, onTest, saving }) {
  const [channels, setChannels] = useState(settings?.channels || []);
  const [dirty,    setDirty]    = useState(false);
  const [saved,    setSaved]    = useState(false);

  const addChannel = () => {
    setChannels(c => [...c, { id: `ch_${Date.now()}`, label: "", channelId: "" }]);
    setDirty(true);
  };
  const updateChannel = (idx, updated) => {
    setChannels(c => c.map((ch, i) => i === idx ? updated : ch));
    setDirty(true);
  };
  const removeChannel = (idx) => {
    setChannels(c => c.filter((_, i) => i !== idx));
    setDirty(true);
  };
  const handleSave = async () => {
    const valid = channels.filter(c => c.channelId?.trim());
    const ok = await onSave(valid);
    if (ok) { setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 2500); }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-header">
        <span className="card-title">Slack channels</span>
        <span className="card-meta">Channels where you want to post SOD / EOD updates</span>
      </div>
      <div className="card-body">
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
          How to find a Channel ID: In Slack, right-click any channel → "View channel details" → scroll to bottom.
          Or copy it from the channel URL: app.slack.com/client/T.../
          <span style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--accent)" }}>C0123ABCDEF</span>
          <br />
          <span style={{ color: "var(--amber)", fontWeight: 500 }}>Note:</span> Your Slack account must be a member of the channel to post in it.
        </div>

        {channels.length > 0 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8, marginBottom: 6 }}>
              {["Label", "Channel ID", "", ""].map((h, i) => (
                <div key={i} style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "var(--faint)" }}>{h}</div>
              ))}
            </div>
            {channels.map((ch, i) => (
              <ChannelRow key={ch.id || i} ch={ch}
                onUpdate={updated => updateChannel(i, updated)}
                onRemove={() => removeChannel(i)}
                onTest={onTest}
              />
            ))}
          </div>
        )}

        {channels.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--faint)", fontSize: 12 }}>
            No channels configured yet. Add your first channel below.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={addChannel}>＋ Add channel</button>
          <button className="btn btn-primary" onClick={handleSave}
            disabled={saving || !dirty}>
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save channels"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrefsSection({ settings, onSave }) {
  const prefs = settings?.prefs || { autoPostSOD: false, autoPostEOD: false, showPreview: true };

  const Toggle = ({ label, sub, value, onChange }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div onClick={onChange} style={{ width: 36, height: 20, borderRadius: 20, cursor: "pointer",
        background: value ? "var(--green)" : "var(--border)",
        position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 2, left: value ? 18 : 2, transition: "left 0.2s" }} />
      </div>
    </div>
  );

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Post preferences</span></div>
      <div className="card-body">
        <Toggle label="Auto-post SOD after submit"
          sub="Automatically send to all configured channels when you submit SOD"
          value={prefs.autoPostSOD}
          onChange={() => onSave({ ...prefs, autoPostSOD: !prefs.autoPostSOD })} />
        <Toggle label="Auto-post EOD after submit"
          sub="Automatically send to all configured channels when you submit EOD"
          value={prefs.autoPostEOD}
          onChange={() => onSave({ ...prefs, autoPostEOD: !prefs.autoPostEOD })} />
        <Toggle label="Show preview before posting"
          sub="Preview the formatted message before it is sent to Slack"
          value={prefs.showPreview}
          onChange={() => onSave({ ...prefs, showPreview: !prefs.showPreview })} />
      </div>
    </div>
  );
}

export default function SlackSettings({ memberName }) {
  const { settings, loading, saving, saveToken, revokeToken, saveChannels, savePrefs, testChannel } = useSlack(memberName);

  if (loading) return <div className="main-content"><Loading /></div>;

  return (
    <div className="main-content">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Slack settings</div>
        <div className="text-sm text-muted">
          Configure your Slack token and channels to post SOD / EOD updates directly from TeamPulse
        </div>
      </div>

      {!settings?.tokenSaved && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--amber-bg)",
          border: "0.5px solid var(--amber-bd)", borderRadius: 8, fontSize: 12, color: "var(--amber)" }}>
          ⚠ Save your Slack token first before configuring channels or posting updates.
        </div>
      )}

      <TokenSection
        settings={settings}
        onSave={saveToken}
        onRevoke={revokeToken}
        saving={saving}
      />
      <ChannelsSection
        settings={settings}
        onSave={saveChannels}
        onTest={testChannel}
        saving={saving}
      />
      <PrefsSection
        settings={settings}
        onSave={savePrefs}
      />
    </div>
  );
}
