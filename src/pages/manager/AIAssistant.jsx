import { useState, useRef, useEffect } from "react";
import { loadEntriesInRange } from "../../hooks/useHistory";
import { BANDWIDTH } from "../../utils/constants";
import { TODAY, MONTHS_SHORT } from "../../utils/dates";
import { Spinner } from "../../components/index.jsx";

const SUGGESTED = [
  "Who has blockers today?",
  "Summarise what the team worked on this week",
  "Who worked on Client A this month?",
  "Who hasn't submitted an update this week?",
  "Which team member has the most tasks done this month?",
  "Give me a weekly summary for Lenin",
];

export default function AIAssistant({ members }) {
  const [conversations, setConversations] = useState([
    { id: 1, title: "New conversation", messages: [] }
  ]);
  const [activeConv, setActiveConv]   = useState(1);
  const [input,      setInput]        = useState("");
  const [loading,    setLoading]      = useState(false);
  const bottomRef = useRef(null);

  const conv = conversations.find(c => c.id === activeConv) || conversations[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages]);

  const newConversation = () => {
    const id = Date.now();
    setConversations(prev => [...prev, { id, title: "New conversation", messages: [] }]);
    setActiveConv(id);
  };

  const buildContext = async (question) => {
    // Load recent data for all members to give the AI context
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startStr = start.toISOString().slice(0, 10);

    const allData = await Promise.all(
      members.map(async m => {
        const entries = await loadEntriesInRange(m.name, startStr, TODAY);
        return { member: m.name, entries };
      })
    );

    // Build a compact context string
    const lines = allData.map(({ member, entries }) => {
      if (!entries.length) return `${member}: no updates in last 30 days`;
      const latest = entries[0];
      const tasks = (latest.tasks || []).map(t => `${t.client || "Internal"}:${t.text}[${t.status}]`).join(", ");
      const weekEntries = entries.filter(e => {
        const d = new Date(e.date + "T00:00:00");
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        return d >= weekAgo;
      });
      const weekTaskCount = weekEntries.reduce((a, e) => a + (e.tasks?.length || 0), 0);
      const weekDone = weekEntries.reduce((a, e) => a + (e.tasks?.filter(t => t.status === "Done").length || 0), 0);
      const hasBlocker = latest.blockers?.trim();
      return `${member}: latest=${latest.date}, bw=${BANDWIDTH[latest.bandwidth]?.label || "?"}, blocker=${hasBlocker ? `"${latest.blockers}"` : "none"}, todayTasks=[${tasks}], weekSubmissions=${weekEntries.length}, weekTasks=${weekTaskCount}, weekDone=${weekDone}`;
    });

    return lines.join("\n");
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text };
    setInput("");
    setLoading(true);

    // Update title from first message
    setConversations(prev => prev.map(c => c.id === activeConv
      ? { ...c, title: text.slice(0, 40), messages: [...c.messages, userMsg] }
      : c
    ));

    try {
      const context = await buildContext(text);
      const history = conv.messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are an intelligent assistant for a team manager using TeamPulse — a daily standup tracker app. You have access to real-time team data from the last 30 days. Answer questions about team member updates, tasks, clients, blockers, and bandwidth. Be concise, factual, and helpful. Today is ${TODAY}. Format your responses clearly — use bullet points where helpful. Here is the current team data:\n\n${context}`,
          messages: [...history, { role: "user", content: text }],
        })
      });

      const data = await res.json();
      const reply = data.content?.map(b => b.text || "").join("") || "Sorry, I couldn't process that. Please try again.";

      setConversations(prev => prev.map(c => c.id === activeConv
        ? { ...c, messages: [...c.messages, userMsg, { role: "assistant", content: reply }] }
        : c
      ));
    } catch (e) {
      setConversations(prev => prev.map(c => c.id === activeConv
        ? { ...c, messages: [...c.messages, userMsg, { role: "assistant", content: "Failed to get a response. Please check your connection and try again." }] }
        : c
      ));
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", minHeight: "calc(100vh - 100px)" }}>
      {/* Sidebar */}
      <div style={{ background: "var(--surface)", borderRight: "0.5px solid var(--border)", padding: "14px 10px", overflowY: "auto" }}>
        <button className="btn btn-ghost w-full mb-12" style={{ justifyContent: "center", borderStyle: "dashed" }} onClick={newConversation}>
          ＋ New conversation
        </button>
        <div className="field-label mb-8">Recent</div>
        {conversations.slice().reverse().map(c => (
          <div key={c.id}
            onClick={() => setActiveConv(c.id)}
            style={{
              padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
              background: activeConv === c.id ? "var(--blue-bg)" : "transparent",
              border: `0.5px solid ${activeConv === c.id ? "var(--blue-bd)" : "transparent"}`,
            }}>
            <div style={{ fontSize: 12, color: activeConv === c.id ? "var(--blue)" : "var(--text)", fontWeight: activeConv === c.id ? 500 : 400, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.title}
            </div>
            <div className="text-xxs text-faint">
              {c.messages.length ? `${Math.floor(c.messages.length / 2)} message${c.messages.length > 2 ? "s" : ""}` : "Empty"}
            </div>
          </div>
        ))}
      </div>

      {/* Chat */}
      <div style={{ display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
        {/* Messages */}
        <div className="chat-messages" style={{ flex: 1 }}>
          {conv.messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>AI Team Assistant</div>
              <div className="text-sm text-muted mb-16">
                Ask me anything about your team's updates, tasks, blockers, or client work.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                {SUGGESTED.map(s => (
                  <div key={s} className="chat-chip" onClick={() => sendMessage(s)}>{s}</div>
                ))}
              </div>
            </div>
          )}
          {conv.messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role === "user" ? "user" : "ai"}`}>
              <div className="avatar avatar-sq" style={{
                width: 26, height: 26, fontSize: 10,
                background: msg.role === "user" ? "var(--bg)" : "var(--accent)",
                border: msg.role === "user" ? "0.5px solid var(--border2)" : "none",
                color: msg.role === "user" ? "var(--muted)" : "#fff",
              }}>
                {msg.role === "user" ? "You" : "AI"}
              </div>
              <div className="chat-bubble" style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div className="chat-msg ai">
              <div className="avatar avatar-sq" style={{ width: 26, height: 26, fontSize: 10, background: "var(--accent)", color: "#fff" }}>AI</div>
              <div className="chat-bubble">
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <Spinner /><span className="text-xs text-muted">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggested chips (shown when conversation has messages) */}
        {conv.messages.length > 0 && (
          <div className="chat-chips">
            {SUGGESTED.slice(0, 4).map(s => (
              <div key={s} className="chat-chip" onClick={() => sendMessage(s)}>{s}</div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="chat-input-row">
          <input
            className="chat-input"
            placeholder="Ask anything about your team's updates..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
            disabled={loading}
          />
          <button className="chat-send" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>↑</button>
        </div>
      </div>
    </div>
  );
}
