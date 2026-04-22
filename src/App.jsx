import { useState, useEffect, useRef } from "react";
import { useAuth } from "./hooks/useAuth";
import { getToday } from "./utils/dates";
import { Login, AccessDenied, TopNav, MemberSidebar, ManagerTabs } from "./components/index.jsx";
import { useHistory } from "./hooks/useHistory";
import { avatarColor, initials } from "./utils/constants";
import { db } from "./firebase";
import { getDocs, collection } from "firebase/firestore";

// Member pages
import TodayUpdate  from "./pages/member/TodayUpdate";
import MyHistory        from "./pages/member/MyHistory";
import RecurringTasks   from "./pages/member/RecurringTasks";
import SlackSettings    from "./pages/member/SlackSettings";
import Milestones       from "./pages/member/Milestones";

// Manager pages
import TeamOverview   from "./pages/manager/TeamOverview";
import MemberProfile  from "./pages/manager/MemberProfile";
import Blockers       from "./pages/manager/Blockers";
import MonthlyReports from "./pages/manager/MonthlyReports";
import AnnualReport   from "./pages/manager/AnnualReport";
import AIAssistant    from "./pages/manager/AIAssistant";
import AllowedUsers   from "./pages/manager/AllowedUsers";
import SprintReport   from "./pages/manager/SprintReport";

// ─── Loading screen ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 18 }}>🧩</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>team<em style={{ fontStyle: "normal", color: "var(--accent)" }}>pulse</em></div>
        <div className="spinner" style={{ margin: "0 auto" }} />
      </div>
    </div>
  );
}

// ─── Preview Banner ───────────────────────────────────────────────────────────
function PreviewBanner({ previewMember, members, onChangeMember, onExit }) {
  return (
    <div style={{
      background: "#1a1d2e",
      borderBottom: "2px solid var(--accent)",
      padding: "8px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "var(--accent)",
          boxShadow: "0 0 0 3px #5b5ff530",
        }} />
        <span style={{ fontSize: 12, color: "#fff", fontWeight: 500 }}>
          Preview mode — viewing as member
        </span>
        <select
          value={previewMember}
          onChange={e => onChangeMember(e.target.value)}
          style={{
            background: "#2a2d40",
            border: "0.5px solid #3a3d50",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            color: "#fff",
            fontFamily: "inherit",
            cursor: "pointer",
            outline: "none",
          }}>
          {members.map(m => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: "#9499be" }}>
          Changes you make here affect real data
        </span>
      </div>
      <button
        onClick={onExit}
        style={{
          padding: "5px 14px",
          borderRadius: 6,
          border: "0.5px solid var(--accent)",
          background: "transparent",
          color: "var(--accent)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
        }}>
        ✕ Exit preview
      </button>
    </div>
  );
}

// ─── Member App ───────────────────────────────────────────────────────────────
function MemberApp({ user, userRecord, logout, displayName, isPreview, previewName }) {
  const [page, setPage] = useState("today");
  const memberName = isPreview ? previewName : (userRecord?.name || displayName);
  const { getTodayEntry, getStreak } = useHistory(memberName);

  const todayEntry    = getTodayEntry();
  const sodSubmitted  = !!todayEntry?.sod?.submittedAt;
  const eodSubmitted  = !!todayEntry?.eod?.submittedAt;
  const streak        = getStreak();
  const eodTasks      = todayEntry?.eod?.tasks || [];
  const completionPct = eodTasks.length
    ? Math.round(eodTasks.filter(t => t.outcome === "Done").length / eodTasks.length * 100)
    : null;

  return (
    <div className="page-body with-sidebar">
      <MemberSidebar
        page={page}
        onChange={setPage}
        streak={streak}
        sodSubmitted={sodSubmitted}
        eodSubmitted={eodSubmitted}
        completionPct={completionPct}
      />
      {page === "today"     && <TodayUpdate     memberName={memberName} />}
      {page === "history"   && <MyHistory       memberName={memberName} />}
      {page === "recurring" && <RecurringTasks  memberName={memberName} />}
      {page === "slack"      && <SlackSettings    memberName={memberName} />}
      {page === "milestones" && <Milestones       memberName={memberName} />}
    </div>
  );
}

// ─── Manager App ──────────────────────────────────────────────────────────────
function ManagerApp({ user, userRecord, logout, displayName, allMembers }) {
  const [page,          setPage]         = useState("overview");
  const [profileMember, setProfileMember]= useState(null);
  const [previewMode,   setPreviewMode]  = useState(false);
  const [previewMember, setPreviewMember]= useState(allMembers[0]?.name || "");

  // Keep previewMember in sync if members list loads after mount
  useEffect(() => {
    if (!previewMember && allMembers.length) {
      setPreviewMember(allMembers[0].name);
    }
  }, [allMembers]);

  const handleViewProfile = (name) => {
    const record = allMembers.find(m => m.name === name);
    setProfileMember({ name, record });
    setPage("profile");
  };

  const handleBackFromProfile = () => {
    setProfileMember(null);
    setPage("overview");
  };

  const enterPreview = () => {
    if (!allMembers.length) {
      alert("No team members added yet. Add members in the Allowed Users tab first.");
      return;
    }
    setPreviewMode(true);
  };

  const exitPreview = () => setPreviewMode(false);

  const showTabs = !previewMode && page !== "profile";

  return (
    <div className="app">
      {/* Nav — always visible */}
      <TopNav
        displayName={displayName}
        photoURL={user?.photoURL}
        isManager={true}
        onLogout={logout}
        previewMode={previewMode}
        onPreview={enterPreview}
        hasMembers={allMembers.length > 0}
      />

      {/* Preview banner */}
      {previewMode && (
        <PreviewBanner
          previewMember={previewMember}
          members={allMembers}
          onChangeMember={setPreviewMember}
          onExit={exitPreview}
        />
      )}

      {/* Manager tabs */}
      {showTabs && (
        <ManagerTabs
          page={page}
          onChange={(p) => { setPage(p); setProfileMember(null); }}
        />
      )}

      {/* Content */}
      {previewMode ? (
        <MemberApp
          user={user}
          userRecord={userRecord}
          logout={logout}
          displayName={displayName}
          isPreview={true}
          previewName={previewMember}
        />
      ) : (
        <div className="page-body full">
          {page === "overview" && (
            <TeamOverview members={allMembers} onViewProfile={handleViewProfile} />
          )}
          {page === "profile" && profileMember && (
            <MemberProfile
              memberName={profileMember.name}
              memberRecord={profileMember.record}
              onBack={handleBackFromProfile}
            />
          )}
          {page === "blockers" && <Blockers       members={allMembers} />}
          {page === "monthly"  && <MonthlyReports members={allMembers} />}
          {page === "annual"   && <AnnualReport   members={allMembers} />}
          {page === "ai"       && <AIAssistant    members={allMembers} />}
          {page === "users"    && <AllowedUsers   currentUserEmail={user?.email} />}
          {page === "sprint" && <SprintReport />}
        </div>
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const {
    user, userRecord, authLoading,
    loginLoading, loginError,
    login, logout,
    isManager, isAllowed, displayName,
  } = useAuth();

  const [members, setMembers] = useState([]);

  // Load members list when manager logs in
  const loadMembers = async () => {
    try {
      const snap = await getDocs(collection(db, "allowedUsers"));
      const list = snap.docs
        .map(d => ({ name: d.data().name, email: d.data().email, role: d.data().role }))
        .filter(u => u.name && u.role !== "manager")
        .sort((a, b) => a.name.localeCompare(b.name));
      setMembers(list);
    } catch(e) {
      console.error("Failed to load members:", e);
    }
  };

  useEffect(() => {
    if (!isManager) return;
    loadMembers();
  }, [isManager]);

  // Auto-reload when the calendar date changes while the tab is open (e.g. left open overnight)
  const loadDateRef = useRef(getToday());
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && getToday() !== loadDateRef.current) {
        window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  if (authLoading) return <LoadingScreen />;
  if (!user)       return <Login onLogin={login} loading={loginLoading} error={loginError} />;
  if (!isAllowed)  return <AccessDenied user={user} onLogout={logout} />;

  if (isManager) {
    return (
      <ManagerApp
        user={user}
        userRecord={userRecord}
        logout={logout}
        displayName={displayName}
        allMembers={members}
      />
    );
  }

  return (
    <div className="app">
      <TopNav
        displayName={displayName}
        photoURL={user?.photoURL}
        isManager={false}
        onLogout={logout}
      />
      <MemberApp
        user={user}
        userRecord={userRecord}
        logout={logout}
        displayName={displayName}
        isPreview={false}
        previewName={null}
      />
    </div>
  );
}
