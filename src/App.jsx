import { useState, useEffect, useCallback } from "react";
import { db, auth, provider } from "./firebase";
import { collection, doc, setDoc, getDocs, query, orderBy } from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// ─── Config ───────────────────────────────────────────────────────────────────
const ALLOWED_DOMAIN   = "decision-tree.com";          // ← your Google Workspace domain
const MANAGER_EMAILS   = ["rahul.singhal@decision-tree.com"];    // ← manager email(s)
const TEAM_MEMBERS     = [                           // ← your team's display names
  "Lenin", "Shreyash", "Rishabh", "Govind", "Pooja",
  "Chandra", "Shubham,"
];

// ─── Constants ────────────────────────────────────────────────────────────────
const BANDWIDTH    = { 1:{label:"Overloaded",color:"#f43f5e"}, 2:{label:"Busy",color:"#f97316"}, 3:{label:"Balanced",color:"#eab308"}, 4:{label:"Available",color:"#22c55e"}, 5:{label:"Open",color:"#06b6d4"} };
const TASK_STATUS  = ["In Progress","Done","Blocked","Pending"];
const STATUS_COLOR = { "In Progress":"#6366f1","Done":"#22c55e","Blocked":"#f43f5e","Pending":"#94a3b8" };
const TODAY        = new Date().toISOString().slice(0,10);
const fmt          = (iso) => new Date(iso+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#070810;--surface:#0e0f1c;--card:#13142a;--border:#1e2040;--border2:#252650;--text:#e2e4f0;--muted:#5a5c80;--accent:#5b5ff5;--accent2:#8b5cf6;--green:#22c55e;--red:#f43f5e}
body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.app{min-height:100vh;display:flex;flex-direction:column}
.login-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);position:relative;overflow:hidden}
.login-glow{position:absolute;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,#5b5ff520 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none}
.login-card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:48px 40px;text-align:center;width:100%;max-width:400px;position:relative;z-index:1}
.login-logo{font-weight:800;font-size:32px;letter-spacing:-1px;margin-bottom:8px}
.login-logo em{font-style:normal;color:var(--accent)}
.login-sub{font-size:13px;color:var(--muted);margin-bottom:36px;line-height:1.6}
.google-btn{width:100%;padding:13px 20px;background:#fff;border:none;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:'Outfit',sans-serif;font-size:14px;font-weight:600;color:#1a1a2e;transition:all 0.2s}
.google-btn:hover{transform:translateY(-1px);box-shadow:0 6px 24px #0004}
.google-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none}
.google-icon{width:20px;height:20px}
.login-domain-badge{margin-top:20px;font-size:11px;color:var(--muted);padding:8px 14px;border:1px solid var(--border);border-radius:20px;display:inline-block;font-family:'JetBrains Mono',monospace}
.login-error{margin-top:16px;padding:10px 14px;background:#2a0a12;border:1px solid var(--red);border-radius:8px;font-size:12px;color:var(--red);line-height:1.5}
.nav{display:flex;align-items:center;justify-content:space-between;padding:0 32px;height:60px;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:200}
.nav-logo{font-weight:800;font-size:18px;letter-spacing:-0.5px}
.nav-logo em{font-style:normal;color:var(--accent)}
.nav-tabs{display:flex;gap:4px}
.tab-btn{padding:7px 16px;border-radius:8px;border:none;background:transparent;color:var(--muted);font-family:'Outfit',sans-serif;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
.tab-btn:hover{color:var(--text);background:var(--card)}
.tab-btn.active{background:var(--accent);color:#fff}
.nav-user{display:flex;align-items:center;gap:10px}
.nav-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--border2)}
.nav-name{font-size:12px;color:var(--muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.signout-btn{padding:5px 12px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);font-family:'Outfit',sans-serif;font-size:11px;cursor:pointer;transition:all .15s}
.signout-btn:hover{border-color:var(--red);color:var(--red)}
.body{flex:1;display:grid}
.body.two-col{grid-template-columns:280px 1fr}
.body.full{grid-template-columns:1fr}
.sidebar{background:var(--surface);border-right:1px solid var(--border);padding:24px 16px;overflow-y:auto;height:calc(100vh - 60px);position:sticky;top:60px}
.sidebar-label{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);padding:0 8px;margin-bottom:10px}
.member-btn{width:100%;padding:10px 12px;background:transparent;border:1px solid transparent;border-radius:10px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;transition:all .15s;margin-bottom:4px}
.member-btn:hover{background:var(--card);border-color:var(--border)}
.member-btn.active{background:var(--card);border-color:var(--accent)}
.member-avatar{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}
.member-name{font-size:13px;font-weight:600;color:var(--text)}
.member-sub{font-size:11px;color:var(--muted);margin-top:1px}
.bw-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.you-tag{font-size:9px;padding:2px 6px;border-radius:10px;background:var(--accent);color:#fff;font-weight:600;letter-spacing:0.05em}
.main{padding:32px;overflow-y:auto}
.page-title{font-weight:800;font-size:26px;letter-spacing:-0.5px}
.page-title span{color:var(--accent)}
.page-sub{font-size:13px;color:var(--muted);margin-top:4px;margin-bottom:28px}
.update-form{background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:28px}
.form-header{padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.form-title{font-size:14px;font-weight:700}
.form-date{font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace}
.form-body{padding:24px;display:flex;flex-direction:column;gap:20px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.field-group{display:flex;flex-direction:column;gap:7px}
.field-label{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);font-weight:600}
textarea,input[type=text]{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:'Outfit',sans-serif;font-size:13px;outline:none;resize:vertical;transition:border-color .15s;width:100%}
textarea:focus,input[type=text]:focus{border-color:var(--accent)}
textarea::placeholder,input::placeholder{color:var(--muted)}
.bw-selector{display:flex;gap:8px;flex-wrap:wrap}
.bw-opt{padding:6px 14px;border-radius:20px;border:1px solid transparent;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;background:var(--surface);font-family:'Outfit',sans-serif}
.tasks-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.tasks-title{font-size:13px;font-weight:600}
.add-task-btn{display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;background:transparent;border:1px dashed var(--border2);color:var(--muted);font-family:'Outfit',sans-serif;font-size:12px;cursor:pointer;transition:all .15s}
.add-task-btn:hover{border-color:var(--accent);color:var(--accent)}
.task-row{display:grid;grid-template-columns:1fr 140px 36px;gap:8px;align-items:center;margin-bottom:8px}
.status-select{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-family:'Outfit',sans-serif;font-size:12px;font-weight:500;outline:none;cursor:pointer;color:var(--text)}
.del-btn{width:32px;height:32px;border-radius:8px;background:transparent;border:1px solid var(--border);color:var(--muted);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.del-btn:hover{background:#2a0a12;border-color:var(--red);color:var(--red)}
.submit-row{display:flex;justify-content:flex-end;gap:10px;padding:0 24px 24px}
.btn-primary{padding:11px 24px;background:var(--accent);border:none;border-radius:10px;color:#fff;font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:8px}
.btn-primary:hover{background:#4a4ee0;transform:translateY(-1px)}
.btn-primary:disabled{opacity:.4;cursor:not-allowed;transform:none}
.btn-ghost{padding:11px 18px;background:transparent;border:1px solid var(--border);border-radius:10px;color:var(--muted);font-family:'Outfit',sans-serif;font-size:13px;cursor:pointer;transition:all .15s}
.btn-ghost:hover{border-color:var(--border2);color:var(--text)}
.history-list{display:flex;flex-direction:column;gap:16px}
.history-card{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;animation:fadeIn .3s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.history-card-header{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--surface)}
.history-date{font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--muted)}
.today-badge{font-size:10px;padding:3px 9px;border-radius:20px;background:#1a1a3a;color:var(--accent);border:1px solid var(--accent);font-weight:600;letter-spacing:.05em}
.history-body{padding:16px 20px;display:flex;flex-direction:column;gap:14px}
.history-section-label{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.history-text{font-size:13px;color:#b0b2cc;line-height:1.6}
.task-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid transparent;margin:3px 3px 3px 0}
.bw-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600}
.empty-state{text-align:center;padding:60px 24px;color:var(--muted);font-size:13px;line-height:1.8}
.empty-icon{font-size:36px;margin-bottom:12px}
.manager-grid{display:flex;flex-direction:column;gap:14px}
.mgr-card{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.mgr-card-header{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;background:var(--surface)}
.mgr-avatar{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
.mgr-name{font-size:14px;font-weight:700;flex:1}
.mgr-meta{font-size:11px;color:var(--muted)}
.no-update{font-size:11px;color:var(--muted);font-style:italic}
.mgr-body{padding:14px 20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.mgr-field-label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
.mgr-field-text{font-size:12px;color:#b0b2cc;line-height:1.6}
.mgr-tasks{padding:0 20px 14px;display:flex;flex-wrap:wrap;gap:6px}
.ai-btn{padding:9px 18px;background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:10px;color:#fff;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:6px}
.ai-btn:hover{transform:translateY(-1px);box-shadow:0 4px 20px #5b5ff540}
.ai-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.ai-summary-box{background:#0d0e22;border:1px solid var(--accent);border-radius:12px;padding:20px;margin-top:20px;animation:fadeIn .4s ease}
.ai-summary-title{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
.ai-section{margin-bottom:14px}
.ai-section-label{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
.ai-section-text{font-size:13px;color:#c0c2e0;line-height:1.7;white-space:pre-wrap}
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 20px}
.stat-val{font-size:28px;font-weight:800;letter-spacing:-1px}
.stat-label{font-size:11px;color:var(--muted);margin-top:2px}
.toast{position:fixed;bottom:24px;right:24px;background:var(--green);color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;animation:slideUp .3s ease,fadeOut .4s ease 1.6s forwards;z-index:999}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes fadeOut{to{opacity:0}}
.spinner{width:14px;height:14px;border:2px solid #ffffff40;border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.history-sub{font-size:13px;font-weight:700;margin-bottom:16px}
select{color:var(--text)}
.access-denied{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)}
.access-denied-card{background:var(--card);border:1px solid var(--red);border-radius:20px;padding:48px 40px;text-align:center;max-width:400px}
.access-denied-icon{font-size:40px;margin-bottom:16px}
.access-denied-title{font-size:20px;font-weight:800;color:var(--red);margin-bottom:8px}
.access-denied-sub{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:24px}

/* ── Date Filter Bar ── */
.date-filter-bar{display:flex;align-items:center;gap:12px;padding:14px 20px;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:24px;flex-wrap:wrap}
.date-filter-label{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);font-weight:600;white-space:nowrap}
.date-input{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:7px 12px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;outline:none;cursor:pointer;transition:border-color .15s;width:160px}
.date-input:focus{border-color:var(--accent)}
.date-nav-btn{padding:6px 12px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-family:'Outfit',sans-serif;font-size:12px;cursor:pointer;transition:all .15s;white-space:nowrap}
.date-nav-btn:hover{border-color:var(--accent);color:var(--accent)}
.date-nav-btn.active-today{border-color:var(--accent);color:var(--accent);background:#1a1a3a}
.date-result-label{font-size:12px;color:var(--muted);margin-left:auto;font-family:'JetBrains Mono',monospace}
.no-entry-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px 24px;text-align:center;color:var(--muted);font-size:13px}

/* ── History date filter ── */
.history-controls{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.history-search{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:7px 12px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;outline:none;width:160px;transition:border-color .15s}
.history-search:focus{border-color:var(--accent)}
.clear-filter-btn{padding:5px 12px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-family:'Outfit',sans-serif;font-size:11px;cursor:pointer;transition:all .15s}
.clear-filter-btn:hover{border-color:var(--red);color:var(--red)}

@media(max-width:800px){
  .body.two-col{grid-template-columns:1fr}
  .sidebar{height:auto;position:static}
  .form-row{grid-template-columns:1fr}
  .mgr-body{grid-template-columns:1fr}
  .stats-row{grid-template-columns:1fr 1fr}
  .nav{padding:0 16px}
  .main{padding:20px}
  .date-result-label{margin-left:0}
}
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const avatarColor = (name) => {
  const colors=["#6366f1","#8b5cf6","#ec4899","#f97316","#22c55e","#06b6d4","#eab308","#f43f5e","#3b82f6","#10b981"];
  return colors[(name||"A").charCodeAt(0)%colors.length];
};
const initials  = (name) => (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
const emptyForm = () => ({ yesterday:"",today:"",blockers:"",bandwidth:3,tasks:[{text:"",status:"In Progress"}],note:"" });

// ─── Firebase helpers ─────────────────────────────────────────────────────────
async function loadMemberHistory(memberName) {
  try {
    const snap = await getDocs(query(collection(db,"standup",memberName,"entries"),orderBy("date","desc")));
    return snap.docs.map(d=>d.data());
  } catch(e) { return []; }
}
async function saveMemberEntry(memberName,entry) {
  await setDoc(doc(db,"standup",memberName,"entries",entry.date),entry);
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({onLogin,error,loading}) {
  return (
    <div className="login-screen">
      <div className="login-glow"/>
      <div className="login-card">
        <div className="login-logo">team<em>pulse</em></div>
        <div className="login-sub">Your team's daily standup tracker.<br/>Sign in with your work Google account.</div>
        <button className="google-btn" onClick={onLogin} disabled={loading}>
          {loading?<span className="spinner" style={{borderTopColor:"#5b5ff5"}}/>:(
            <svg className="google-icon" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          Sign in with Google
        </button>
        {error&&<div className="login-error">{error}</div>}
        <div className="login-domain-badge">@{ALLOWED_DOMAIN} only</div>
      </div>
    </div>
  );
}

function AccessDenied({user,onSignOut}) {
  return (
    <div className="access-denied">
      <div className="access-denied-card">
        <div className="access-denied-icon">🚫</div>
        <div className="access-denied-title">Access Denied</div>
        <div className="access-denied-sub">Your account <strong>{user?.email}</strong> is not authorised.<br/><br/>Please sign in with your <strong>@{ALLOWED_DOMAIN}</strong> account.</div>
        <button className="btn-primary" onClick={onSignOut} style={{margin:"0 auto"}}>Sign out & try again</button>
      </div>
    </div>
  );
}

// ─── Date Filter Bar (Manager View) ──────────────────────────────────────────
function DateFilterBar({selectedDate, onChange, allDates}) {
  const prevDate = () => {
    const idx = allDates.indexOf(selectedDate);
    if (idx < allDates.length-1) onChange(allDates[idx+1]);
  };
  const nextDate = () => {
    const idx = allDates.indexOf(selectedDate);
    if (idx > 0) onChange(allDates[idx-1]);
  };
  const isToday = selectedDate === TODAY;
  return (
    <div className="date-filter-bar">
      <span className="date-filter-label">Viewing date</span>
      <input
        className="date-input"
        type="date"
        value={selectedDate}
        max={TODAY}
        onChange={e => onChange(e.target.value)}
      />
      <button className="date-nav-btn" onClick={prevDate} disabled={allDates.indexOf(selectedDate)===allDates.length-1}>← Previous</button>
      <button className="date-nav-btn" onClick={nextDate} disabled={allDates.indexOf(selectedDate)===0}>Next →</button>
      <button className={`date-nav-btn ${isToday?"active-today":""}`} onClick={()=>onChange(TODAY)}>Today</button>
      <span className="date-result-label">{isToday ? "Today" : fmt(selectedDate)}</span>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,           setUser]           = useState(null);
  const [authLoading,    setAuthLoading]    = useState(true);
  const [loginLoading,   setLoginLoading]   = useState(false);
  const [loginError,     setLoginError]     = useState(null);
  const [view,           setView]           = useState("member");
  const [selectedMember, setSelectedMember] = useState(null);
  const [form,           setForm]           = useState(emptyForm());
  const [history,        setHistory]        = useState({});
  const [dataLoading,    setDataLoading]    = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [toast,          setToast]          = useState(null);
  const [aiLoading,      setAiLoading]      = useState(false);
  const [aiSummary,      setAiSummary]      = useState(null);

  // ── Date filter state ──
  const [managerDate,   setManagerDate]   = useState(TODAY);  // Manager View selected date
  const [historyFilter, setHistoryFilter] = useState("");     // Member View date filter

  useEffect(() => {
    const unsub = onAuthStateChanged(auth,(u)=>{ setUser(u); setAuthLoading(false); });
    return unsub;
  },[]);

  useEffect(() => {
    if (!user) return;
    const firstName = user.displayName?.split(" ")[0]||"";
    const match = TEAM_MEMBERS.find(m=>m.toLowerCase()===firstName.toLowerCase());
    setSelectedMember(match||TEAM_MEMBERS[0]);
  },[user]);

  const loadAll = useCallback(async () => {
    setDataLoading(true);
    const all={};
    await Promise.all(TEAM_MEMBERS.map(async(m)=>{ all[m]=await loadMemberHistory(m); }));
    setHistory(all);
    setDataLoading(false);
  },[]);

  useEffect(()=>{ if(user) loadAll(); },[user,loadAll]);

  useEffect(()=>{
    if (!selectedMember) return;
    const todayEntry=(history[selectedMember]||[]).find(e=>e.date===TODAY);
    if (todayEntry) {
      setForm({ yesterday:todayEntry.yesterday||"", today:todayEntry.today||"", blockers:todayEntry.blockers||"", bandwidth:todayEntry.bandwidth||3, tasks:todayEntry.tasks?.length?todayEntry.tasks:[{text:"",status:"In Progress"}], note:todayEntry.note||"" });
    } else { setForm(emptyForm()); }
  },[selectedMember,history]);

  const handleLogin   = async () => { setLoginLoading(true); setLoginError(null); try { await signInWithPopup(auth,provider); } catch(e) { setLoginError("Sign-in failed. Please try again."); } setLoginLoading(false); };
  const handleSignOut = async () => { await signOut(auth); setUser(null); };

  const saveEntry = async () => {
    setSaving(true);
    try {
      const entry={date:TODAY,...form,tasks:form.tasks.filter(t=>t.text.trim()),savedBy:user.email};
      await saveMemberEntry(selectedMember,entry);
      setHistory(prev=>{ const filtered=(prev[selectedMember]||[]).filter(e=>e.date!==TODAY); return {...prev,[selectedMember]:[entry,...filtered].sort((a,b)=>b.date.localeCompare(a.date))}; });
      showToast("Update saved ✓");
    } catch(e) { showToast("Save failed — check connection"); }
    setSaving(false);
  };

  const showToast  = (msg) => { setToast(msg); setTimeout(()=>setToast(null),2200); };
  const addTask    = () => setForm(f=>({...f,tasks:[...f.tasks,{text:"",status:"In Progress"}]}));
  const updateTask = (i,field,val) => setForm(f=>({...f,tasks:f.tasks.map((t,idx)=>idx===i?{...t,[field]:val}:t)}));
  const removeTask = (i) => setForm(f=>({...f,tasks:f.tasks.filter((_,idx)=>idx!==i)}));

  const generateAiSummary = async () => {
    setAiLoading(true); setAiSummary(null);
    try {
      const snapshot = TEAM_MEMBERS.map(m=>{
        const entry=(history[m]||[]).find(e=>e.date===managerDate);
        if (!entry) return `${m}: No update for ${fmt(managerDate)}`;
        const tasks=entry.tasks?.map(t=>`${t.text} [${t.status}]`).join(", ")||"No tasks";
        return `${m}: Yesterday="${entry.yesterday||"—"}" Today="${entry.today||"—"}" Blockers="${entry.blockers||"None"}" Bandwidth="${BANDWIDTH[entry.bandwidth]?.label}" Tasks="${tasks}"`;
      }).join("\n");
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:`You are an engineering manager's assistant. Date: ${fmt(managerDate)}.\n\nTeam standup:\n${snapshot}\n\nReply ONLY in this exact JSON (no markdown):\n{"overview":"2-3 sentence team status","highlights":"Key wins (bullet points starting with •, newline-separated)","risks":"Blockers or concerns, or 'No blockers ✓'","capacity":"Who is available vs stretched","actions":"Manager action items (starting with →, newline-separated)"}`}]})
      });
      const data=await res.json();
      const text=data.content?.map(b=>b.text||"").join("")||"";
      setAiSummary(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch(e) { setAiSummary({overview:"Failed to generate summary.",highlights:"",risks:"",capacity:"",actions:""}); }
    setAiLoading(false);
  };

  // ── All dates that have at least one entry (for manager date nav) ──
  const allDatesWithData = [...new Set(
    TEAM_MEMBERS.flatMap(m=>(history[m]||[]).map(e=>e.date))
  )].sort((a,b)=>b.localeCompare(a));

  const allDates = allDatesWithData.includes(TODAY) ? allDatesWithData : [TODAY,...allDatesWithData];

  // ── Stats for selected manager date ──
  const updatedOnDate = TEAM_MEMBERS.filter(m=>(history[m]||[]).find(e=>e.date===managerDate)).length;
  const blockedOnDate = TEAM_MEMBERS.filter(m=>{ const e=(history[m]||[]).find(x=>x.date===managerDate); return e&&e.blockers?.trim(); }).length;
  const avgBwOnDate   = (()=>{
    const bws=TEAM_MEMBERS.map(m=>{ const e=(history[m]||[]).find(x=>x.date===managerDate); return e?e.bandwidth:null; }).filter(Boolean);
    if (!bws.length) return "—";
    return BANDWIDTH[Math.round(bws.reduce((a,b)=>a+b,0)/bws.length)]?.label||"—";
  })();

  // ── Member history filtered by date search ──
  const memberEntries    = history[selectedMember]||[];
  const filteredEntries  = historyFilter
    ? memberEntries.filter(e=>e.date===historyFilter)
    : memberEntries;
  const todayDone        = memberEntries.some(e=>e.date===TODAY);
  const isManager        = user&&MANAGER_EMAILS.includes(user.email);
  const userFirstName    = user?.displayName?.split(" ")[0]||"";

  if (authLoading) return (<div style={{minHeight:"100vh",background:"#070810",display:"flex",alignItems:"center",justifyContent:"center"}}><span className="spinner" style={{width:28,height:28}}/><style>{CSS}</style></div>);
  if (!user) return (<><style>{CSS}</style><LoginScreen onLogin={handleLogin} error={loginError} loading={loginLoading}/></>);
  const domain=user.email?.split("@")[1];
  if (domain!==ALLOWED_DOMAIN) return (<><style>{CSS}</style><AccessDenied user={user} onSignOut={handleSignOut}/></>);

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className="nav">
          <div className="nav-logo">team<em>pulse</em></div>
          <div className="nav-tabs">
            <button className={`tab-btn ${view==="member"?"active":""}`} onClick={()=>setView("member")}>My Updates</button>
            {isManager&&<button className={`tab-btn ${view==="manager"?"active":""}`} onClick={()=>setView("manager")}>Manager View</button>}
          </div>
          <div className="nav-user">
            <span className="nav-name">{user.displayName}</span>
            {user.photoURL&&<img className="nav-avatar" src={user.photoURL} alt="avatar"/>}
            <button className="signout-btn" onClick={handleSignOut}>Sign out</button>
          </div>
        </nav>

        {/* ── MEMBER VIEW ── */}
        {view==="member"&&(
          <div className="body two-col">
            <aside className="sidebar">
              <div className="sidebar-label">Team Members</div>
              {TEAM_MEMBERS.map(m=>{
                const latest=(history[m]||[])[0];
                const hasToday=latest?.date===TODAY;
                const bw=hasToday?latest.bandwidth:null;
                const isYou=m.toLowerCase()===userFirstName.toLowerCase();
                return(
                  <button key={m} className={`member-btn ${selectedMember===m?"active":""}`}
                    onClick={()=>{ if(isManager||isYou) setSelectedMember(m); }}
                    style={{opacity:(!isManager&&!isYou)?0.4:1,cursor:(!isManager&&!isYou)?"default":"pointer"}}>
                    <div className="member-avatar" style={{background:avatarColor(m)+"30",color:avatarColor(m)}}>{initials(m)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span className="member-name">{m}</span>
                        {isYou&&<span className="you-tag">you</span>}
                      </div>
                      <div className="member-sub">{hasToday?"✓ Updated today":"No update yet"}</div>
                    </div>
                    {bw&&<div className="bw-dot" style={{background:BANDWIDTH[bw].color}}/>}
                  </button>
                );
              })}
            </aside>

            <main className="main">
              <div className="page-title">{selectedMember}'s <span>Daily Update</span></div>
              <div className="page-sub">{todayDone?"✓ Today's update submitted — you can edit it below":"Fill in your standup for today"}</div>

              <div className="update-form">
                <div className="form-header">
                  <span className="form-title">Standup Form</span>
                  <span className="form-date">{fmt(TODAY)}</span>
                </div>
                <div className="form-body">
                  <div className="form-row">
                    <div className="field-group">
                      <label className="field-label">Yesterday — What did you complete?</label>
                      <textarea rows={3} placeholder="Describe what you worked on yesterday..." value={form.yesterday} onChange={e=>setForm(f=>({...f,yesterday:e.target.value}))}/>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Today — What are you working on?</label>
                      <textarea rows={3} placeholder="Describe your plan for today..." value={form.today} onChange={e=>setForm(f=>({...f,today:e.target.value}))}/>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="field-group">
                      <label className="field-label">⚑ Blockers / Dependencies</label>
                      <textarea rows={2} placeholder="Any blockers? (Leave blank if none)" value={form.blockers} onChange={e=>setForm(f=>({...f,blockers:e.target.value}))}/>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Notes for Manager</label>
                      <textarea rows={2} placeholder="Anything else the manager should know..." value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Bandwidth — How loaded are you today?</label>
                    <div className="bw-selector">
                      {Object.entries(BANDWIDTH).map(([k,v])=>(
                        <button key={k} className="bw-opt"
                          style={{color:form.bandwidth===+k?"#fff":v.color,background:form.bandwidth===+k?v.color:v.color+"15",borderColor:form.bandwidth===+k?v.color:v.color+"40"}}
                          onClick={()=>setForm(f=>({...f,bandwidth:+k}))}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="tasks-header">
                      <span className="tasks-title">Today's Tasks</span>
                      <button className="add-task-btn" onClick={addTask}>+ Add Task</button>
                    </div>
                    {form.tasks.map((t,i)=>(
                      <div className="task-row" key={i}>
                        <input type="text" placeholder="Task description..." value={t.text} onChange={e=>updateTask(i,"text",e.target.value)}/>
                        <select className="status-select" value={t.status} onChange={e=>updateTask(i,"status",e.target.value)} style={{color:STATUS_COLOR[t.status]}}>
                          {TASK_STATUS.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                        <button className="del-btn" onClick={()=>removeTask(i)}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="submit-row">
                  <button className="btn-ghost" onClick={()=>setForm(emptyForm())}>Clear</button>
                  <button className="btn-primary" onClick={saveEntry} disabled={saving||!form.yesterday.trim()}>
                    {saving?<><span className="spinner"/> Saving...</>:todayDone?"Update Entry":"Submit Update"}
                  </button>
                </div>
              </div>

              {/* ── History with date filter ── */}
              <div className="history-controls">
                <span className="history-sub" style={{marginBottom:0}}>
                  Update History <span style={{color:"var(--muted)",fontWeight:400}}>— {memberEntries.length} entries</span>
                </span>
                <input
                  className="history-search"
                  type="date"
                  max={TODAY}
                  value={historyFilter}
                  onChange={e=>setHistoryFilter(e.target.value)}
                  placeholder="Filter by date"
                />
                {historyFilter&&(
                  <button className="clear-filter-btn" onClick={()=>setHistoryFilter("")}>✕ Clear</button>
                )}
              </div>

              {dataLoading?(
                <div className="empty-state"><span className="spinner" style={{width:24,height:24}}/></div>
              ):filteredEntries.length===0?(
                <div className="empty-state">
                  <div className="empty-icon">{historyFilter?"🔍":"📋"}</div>
                  {historyFilter?`No update found for ${fmt(historyFilter)}`:`No history yet for ${selectedMember}.`}
                  {historyFilter&&<><br/><button className="clear-filter-btn" style={{marginTop:12}} onClick={()=>setHistoryFilter("")}>Clear filter</button></>}
                </div>
              ):(
                <div className="history-list">
                  {filteredEntries.map((entry,i)=>(
                    <div className="history-card" key={i}>
                      <div className="history-card-header">
                        <span className="history-date">{fmt(entry.date)}</span>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span className="bw-badge" style={{background:BANDWIDTH[entry.bandwidth]?.color+"20",color:BANDWIDTH[entry.bandwidth]?.color}}>{BANDWIDTH[entry.bandwidth]?.label}</span>
                          {entry.date===TODAY&&<span className="today-badge">TODAY</span>}
                        </div>
                      </div>
                      <div className="history-body">
                        <div><div className="history-section-label">Yesterday</div><div className="history-text">{entry.yesterday||"—"}</div></div>
                        <div><div className="history-section-label">Today</div><div className="history-text">{entry.today||"—"}</div></div>
                        {entry.blockers&&<div><div className="history-section-label">⚑ Blockers</div><div className="history-text" style={{color:"var(--red)"}}>{entry.blockers}</div></div>}
                        {entry.tasks?.length>0&&<div>
                          <div className="history-section-label">Tasks</div>
                          <div>{entry.tasks.map((t,ti)=>(
                            <span key={ti} className="task-chip" style={{color:STATUS_COLOR[t.status],background:STATUS_COLOR[t.status]+"18",borderColor:STATUS_COLOR[t.status]+"40"}}>{t.text} · {t.status}</span>
                          ))}</div>
                        </div>}
                        {entry.note&&<div><div className="history-section-label">Note</div><div className="history-text">{entry.note}</div></div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </main>
          </div>
        )}

        {/* ── MANAGER VIEW ── */}
        {view==="manager"&&isManager&&(
          <div className="body full">
            <main className="main">
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
                <div>
                  <div className="page-title">Manager <span>Overview</span></div>
                  <div className="page-sub" style={{marginBottom:0}}>Browse any date to see what your team was working on</div>
                </div>
                <button className="ai-btn" onClick={generateAiSummary} disabled={aiLoading}>
                  {aiLoading?<><span className="spinner"/> Analyzing...</>:"✦ AI Briefing"}
                </button>
              </div>

              {/* Date filter bar */}
              <DateFilterBar
                selectedDate={managerDate}
                onChange={(d)=>{ setManagerDate(d); setAiSummary(null); }}
                allDates={allDates}
              />

              {/* Stats for selected date */}
              <div className="stats-row">
                <div className="stat-card"><div className="stat-val" style={{color:"var(--accent)"}}>{updatedOnDate}</div><div className="stat-label">Updated</div></div>
                <div className="stat-card"><div className="stat-val" style={{color:"#94a3b8"}}>{TEAM_MEMBERS.length-updatedOnDate}</div><div className="stat-label">No update</div></div>
                <div className="stat-card"><div className="stat-val" style={{color:"var(--red)"}}>{blockedOnDate}</div><div className="stat-label">Blocked</div></div>
                <div className="stat-card"><div className="stat-val" style={{color:"var(--green)",fontSize:20,paddingTop:4}}>{avgBwOnDate}</div><div className="stat-label">Avg bandwidth</div></div>
              </div>

              {/* AI Summary */}
              {aiSummary&&(
                <div className="ai-summary-box">
                  <div className="ai-summary-title">✦ AI Briefing — {fmt(managerDate)}</div>
                  {[{label:"Overview",key:"overview"},{label:"Highlights",key:"highlights"},{label:"Risks & Blockers",key:"risks"},{label:"Capacity",key:"capacity"},{label:"Your Action Items",key:"actions"}].map(s=>aiSummary[s.key]?(
                    <div className="ai-section" key={s.key}>
                      <div className="ai-section-label">{s.label}</div>
                      <div className="ai-section-text">{aiSummary[s.key]}</div>
                    </div>
                  ):null)}
                </div>
              )}

              {/* Team cards for selected date */}
              <div className="manager-grid" style={{marginTop:24}}>
                {TEAM_MEMBERS.map(m=>{
                  const entry=(history[m]||[]).find(e=>e.date===managerDate);
                  const color=avatarColor(m);
                  return(
                    <div className="mgr-card" key={m}>
                      <div className="mgr-card-header">
                        <div className="mgr-avatar" style={{background:color+"25",color}}>{initials(m)}</div>
                        <div className="mgr-name">{m}</div>
                        {entry?(
                          <span className="bw-badge" style={{background:BANDWIDTH[entry.bandwidth]?.color+"20",color:BANDWIDTH[entry.bandwidth]?.color}}>{BANDWIDTH[entry.bandwidth]?.label}</span>
                        ):(
                          <span className="no-update">No update</span>
                        )}
                        {managerDate===TODAY&&<span className="today-badge">TODAY</span>}
                      </div>
                      {entry?(
                        <>
                          <div className="mgr-body">
                            <div><div className="mgr-field-label">Yesterday</div><div className="mgr-field-text">{entry.yesterday||"—"}</div></div>
                            <div><div className="mgr-field-label">Today</div><div className="mgr-field-text">{entry.today||"—"}</div></div>
                            <div>
                              <div className="mgr-field-label" style={{color:entry.blockers?"var(--red)":"var(--muted)"}}>{entry.blockers?"⚑ Blockers":"Blockers"}</div>
                              <div className="mgr-field-text" style={{color:entry.blockers?"var(--red)":"#b0b2cc"}}>{entry.blockers||"None"}</div>
                            </div>
                          </div>
                          {entry.tasks?.length>0&&(
                            <div className="mgr-tasks">
                              {entry.tasks.map((t,i)=>(
                                <span key={i} className="task-chip" style={{color:STATUS_COLOR[t.status],background:STATUS_COLOR[t.status]+"18",borderColor:STATUS_COLOR[t.status]+"40"}}>{t.text} · {t.status}</span>
                              ))}
                            </div>
                          )}
                          {entry.note&&<div style={{padding:"0 20px 14px"}}><div className="mgr-field-label">Note</div><div className="mgr-field-text">{entry.note}</div></div>}
                        </>
                      ):(
                        <div className="no-entry-card">No standup submitted for {fmt(managerDate)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </main>
          </div>
        )}

        {toast&&<div className="toast">{toast}</div>}
      </div>
    </>
  );
}
