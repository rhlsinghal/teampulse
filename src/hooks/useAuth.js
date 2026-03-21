import { useState, useEffect } from "react";
import { auth, provider } from "../firebase";
import { db } from "../firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export function useAuth() {
  const [user,        setUser]        = useState(null);
  const [userRecord,  setUserRecord]  = useState(null); // allowedUsers doc
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError,  setLoginError]  = useState(null);
  const [loginLoading,setLoginLoading]= useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        // Check if this user is in allowedUsers
        try {
          const snap = await getDoc(doc(db, "allowedUsers", u.email));
          if (snap.exists()) {
            setUserRecord({ email: u.email, ...snap.data() });
          } else {
            setUserRecord(null);
          }
        } catch (e) {
          setUserRecord(null);
        }
      } else {
        setUser(null);
        setUserRecord(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const login = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      setLoginError("Sign-in failed. Please try again.");
    }
    setLoginLoading(false);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setUserRecord(null);
  };

  const isManager = userRecord?.role === "manager";
  const isAllowed = !!userRecord;
  const displayName = userRecord?.name || user?.displayName || "";

  return { user, userRecord, authLoading, loginLoading, loginError, login, logout, isManager, isAllowed, displayName };
}
