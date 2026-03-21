import { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../../firebase";
import {
  collection, doc, setDoc, getDocs,
  deleteDoc, orderBy, query, limit,
} from "firebase/firestore";
import { loadEntriesInRange } from "../../hooks/useHistory";
import { BANDWIDTH } from "../../utils/constants";
import { TODAY } from "../../utils/dates";
import { Spinner } from "../../components/index.jsx";

const AI_PROXY_URL = "https://teampulse-api-pied.vercel.app/api/chat";

const SUGGESTED = [
  "Who has blockers today?",
  "Summarise what the team worked on this week",
  "Who worked on Client A this month?",
  "Who hasn't submitted an update this week?",
  "Which team member has the most tasks done this month?",
  "Give me a weekly summary for the team",
];

// ─── Firestore helpers ────────────────────────────────────────────────────────
const CONV_COL = "aiConversations";

async function saveConversation(conv) {
  await setDoc(doc(db, CONV_COL, String(conv.id)), {
    id:        conv.id,
    title:     conv.title,
    messages:  conv.messages,
    updatedAt: new Date().toISOString(),
  });
}

async function loadConversations() {
  try {
    const snap = await getDocs(
      query(collection(db, CONV_COL), orderBy("updatedAt", "desc"), limit(50))
    );
    return snap.docs.map(d => d.data());
  } catch {
    return [];
  }
}

async function deleteConversation(id) {
  await deleteDoc(doc(db, CONV_COL, String(id)));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AIAssistant({ members }) {
  const [conversations, setConversations] = useState([]);
  const [activeConv,    setActiveConv]    = useState(null);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [convLoading,   setConvLoading]   = useState(true);
  const bottomRef = useRef(null);

  const conv = conversations.find(c => c.id === activeConv) || null;

  // ── Load conversations from Firestore on mount ──
  useEffect(() => {
    loadConversations().then(saved => {
      if (saved.length) {
        setConversations(saved);
        setActiveConv(saved[0].id);
      } else {
        // Create a default empty conversation
        const first = { id: Date.now(), title: "New conversation", messages: [] };
        setConversations([first]);
        setActiveConv(first.id);
      }
      setConvLoading(false);
    });
  }, []);

  // ── Scroll to bottom when messages change ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages]);

  // ── New conversation ──
  const newConversation = async () => {
    const newConv = { id: Date.now(), title: "New conversation", messages: [] };
    setConversations(prev => [newConv, ...prev]);
    setActiveConv(newConv.id);
    await saveConversation(newConv);
  };

  // ── Delete conversation ──
  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this conversation?")) return;
    await deleteConversation(id);
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      if (activeConv === id && updated.length) setActiveConv(updated[0].id);
      else if (!updated.length) {
        const fresh = { id: Date.now(), title: "New conversation", messages: [] };
        setActiveConv(fresh.id);
        return [fresh];
      }
      return updated;
    });
  };

  // ── Build team context ──
  const buildContext = async () => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startStr = start.toISOString().slice(0, 10);
    const allData = await Promise.all(
      members.map(async m => {
        const entries = await loadEntriesInRange(m.name, startStr, TODAY);
        return { member: m.name, entries };
      })
    );
    return allData.map(({ member, entries }) => {
      if (!entries.length) return `${member}: no updates in last 30 days`;
      const latest = entries[0];
      const tasks = (latest.tasks || []).map(t => `${t.client || "Internal"}:${t.text}[${t.status}]`).join(", ");
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const weekEntries = entries.filter(e => new Date(e.date + "T00:00:00") >= weekAgo);
      const weekDone = weekEntries.reduce((a, e) => a + (e.tasks?.filter(t => t.status === "Done").length || 0), 0);
      return `${member}: latest=${latest.date}, bw=${BANDWIDTH[latest.bandwidth]?.label || "?"}, blocker=${latest.blockers?.trim() ? `"${latest.blockers}"` : "none"}, todayTasks=[${tasks}], weekSubmissions=${weekEntries.length}, weekDone=${weekDone}`;
    }).join("\n");
  };

  // ── Call AI ──
  const callAI = async (messages, system) => {
    const res = await fetch(AI_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.content?.map(b => b.text || "").join("") || "";
  };

  // ── Send message ──
  const sendMessage = async (text) => {
    if (!text.trim() || loading || !conv) return;
    const userMsg = { role: "user", content: text };
    setInput("");
    setLoading(true);

    // Add user message immediately
    const withUser = {
      ...conv,
      title:    conv.messages.length === 0 ? text.slice(0, 45) : conv.title,
      messages: [...conv.messages, userMsg],
    };
    setConversations(prev => prev.map(c => c.id === activeConv ? withUser : c));

    try {
      const context = await buildContext();
      const history = conv.messages.map(m => ({ role: m.role, content: m.content }));
      const system  = `You are an intelligent assistant for a team manager using TeamPulse — a daily standup tracker. You have access to real-time team data from the last 30 days. Answer questions about team member updates, tasks, clients, blockers, and bandwidth. Be concise, factual, and helpful. Today is ${TODAY}. Format responses clearly — use bullet points where helpful.\n\nCurrent team data:\n\n${context}`;
      const reply   = await callAI([...history, userMsg], system);

      const withReply = {
        ...withUser,
        messages: [...withUser.messages, { role: "assistant", content: reply }],
        updatedAt: new Date().toISOString(),
      };
      setConversations(prev => prev.map(c => c.id === activeConv ? withReply : c));

      // Persist to Firestore
      await saveConversation(withReply);

    } catch (e) {
      console.error("AI error:", e);
      const withError = {
        ...withUser,
        messages: [...withUser.messages, { role: "assistant", content: `Error: ${e.message || "Failed to get a response. Please try again."}` }],
      };
      setConversations(prev => prev.map(c => c.id === activeConv ? withError : c));
      await saveConversation(withError);
    }
    setLoading(false);
  };

  if (convLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "calc(100vh - 100px)" }}>

      {/* ── Sidebar ── */}
      <div style={{ background: "var(--surface)", borderRight: "0.5px solid var(--border)", padding: "14px 10px", overflowY: "auto" }}>
        <button className="btn btn-ghost w-full mb-12"
          style={{ justifyContent: "center", borderStyle: "dashed" }}
          onClick={newConversation}>
          ＋ New conversation
        </button>
        <div className="field-label mb-8">Conversations</div>
        {conversations.map(c => (
          <div key={c.id} onClick={() => setActiveConv(c.id)}
            style={{
              padding: "8px 10px", borderRadius: 8, cursor: "pointer",
              marginBottom: 2, position: "relative",
              background: activeConv === c.id ? "var(--blue-bg)" : "transparent",
              border: `0.5px solid ${activeConv === c.id ? "var(--blue-bd)" : "transparent"}`,
            }}>
            <div style={{ fontSize: 12, color: activeConv === c.id ? "var(--blue)" : "var(--text)", fontWeight: activeConv === c.id ? 500 : 400, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 20 }}>
              {c.title}
            </div>
            <div className="text-xxs text-faint">
              {c.messages.length
                ? `${Math.floor(c.messages.length / 2)} message${c.messages.length > 2 ? "s" : ""}`
                : "Empty"}
            </div>
            {/* Delete button */}
            <div onClick={e => handleDelete(e, c.id)}
              style={{ position: "absolute", top: 8, right: 8, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--faint)", borderRadius: 3, cursor: "pointer" }}
              title="Delete conversation">
              ×
            </div>
          </div>
        ))}
      </div>

      {/* ── Chat area ── */}
      <div style={{ display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
        <div className="chat-messages" style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>

          {/* Empty state */}
          {(!conv || conv.messages.length === 0) && (
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>AI Team Assistant</div>
              <div className="text-sm text-muted mb-16">
                Ask me anything about your team's updates, tasks, blockers, or client work.
                <br />Conversations are saved automatically.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                {SUGGESTED.map(s => (
                  <div key={s} className="chat-chip" onClick={() => sendMessage(s)}>{s}</div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {conv?.messages.map((msg, i) => (
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

          {/* Thinking indicator */}
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

        {/* Suggested chips */}
        {conv?.messages.length > 0 && (
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
