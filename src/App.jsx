import { useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { Login, AccessDenied, TopNav, MemberSidebar, ManagerTabs } from "./components/index.jsx";
import { useHistory } from "./hooks/useHistory";

// Member pages
import TodayUpdate from "./pages/member/TodayUpdate";
import MyHistory   from "./pages/member/MyHistory";

// Manager pages
import TeamOverview  from "./pages/manager/TeamOverview";
import MemberProfile from "./pages/manager/MemberProfile";
import Blockers      from "./pages/manager/Blockers";
import MonthlyReports from "./pages/manager/MonthlyReports";
import AnnualReport  from "./pages/manager/AnnualReport";
import AIAssistant   from "./pages/manager/AIAssistant";
import AllowedUsers  from "./pages/manager/AllowedUsers";

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

// ─── Member App ───────────────────────────────────────────────────────────────
function MemberApp({ user, userRecord, logout, displayName }) {
  const [page, setPage] = useState("today");
  const { entries, getTodayEntry, getStreak } = useHistory(userRecord?.name || displayName);

  const submittedToday = !!getTodayEntry();
  const streak = getStreak();
  const memberName = userRecord?.name || displayName;

  return (
    <div className="app">
      <TopNav
        displayName={displayName}
        photoURL={user?.photoURL}
        isManager={false}
        onLogout={logout}
      />
      <div className="page-body with-sidebar">
        <MemberSidebar
          page={page}
          onChange={setPage}
          streak={streak}
          submittedToday={submittedToday}
        />
        {page === "today"   && <TodayUpdate memberName={memberName} />}
        {page === "history" && <MyHistory   memberName={memberName} />}
      </div>
    </div>
  );
}

// ─── Manager App ──────────────────────────────────────────────────────────────
function ManagerApp({ user, userRecord, logout, displayName, allMembers }) {
  const [page,           setPage]          = useState("overview");
  const [profileMember,  setProfileMember] = useState(null);

  const handleViewProfile = (name) => {
    const record = allMembers.find(m => m.name === name);
    setProfileMember({ name, record });
    setPage("profile");
  };

  const handleBackFromProfile = () => {
    setProfileMember(null);
    setPage("overview");
  };

  const showTabs = page !== "profile";

  return (
    <div className="app">
      <TopNav
        displayName={displayName}
        photoURL={user?.photoURL}
        isManager={true}
        onLogout={logout}
      />
      {showTabs && <ManagerTabs page={page} onChange={(p) => { setPage(p); setProfileMember(null); }} />}

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
        {page === "blockers" && (
          <Blockers members={allMembers} />
        )}
        {page === "monthly" && (
          <MonthlyReports members={allMembers} />
        )}
        {page === "annual" && (
          <AnnualReport members={allMembers} />
        )}
        {page === "ai" && (
          <AIAssistant members={allMembers} />
        )}
        {page === "users" && (
          <AllowedUsers currentUserEmail={user?.email} />
        )}
      </div>
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

  // Build members list from allowedUsers for manager
  // In production this is loaded from Firestore in AllowedUsers
  // For manager app we pass a simple list; AllowedUsers page manages the full list
  const [members, setMembers] = useState([]);

  // Load members list when manager logs in
  useState(() => {
    if (!isManager) return;
    import("firebase/firestore").then(({ getDocs, collection }) => {
      import("./firebase").then(({ db }) => {
        getDocs(collection(db, "allowedUsers")).then(snap => {
          const list = snap.docs.map(d => ({ name: d.data().name, email: d.data().email, role: d.data().role }))
            .filter(u => u.name);
          setMembers(list);
        });
      });
    });
  });

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
    <MemberApp
      user={user}
      userRecord={userRecord}
      logout={logout}
      displayName={displayName}
    />
  );
}
