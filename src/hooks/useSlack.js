// src/hooks/useSlack.js
// Manages reading/writing Slack settings for the current member.
// Token is write-only from the frontend — never read back after saving.

import { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { TODAY } from "../utils/dates";

const SLACK_POST_URL = "https://teampulse-api-pied.vercel.app/api/slack-post";

// Firestore path: slackSettings/{memberName}
// Shape: { tokenSaved: bool, tokenSavedAt: timestamp, channels: [...], prefs: {...} }
// Note: token itself is write-only — we never read it back from Firestore to the frontend

export function useSlack(memberName) {
  const [settings, setSettings] = useState(null);  // { tokenSaved, channels, prefs }
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!memberName) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "slackSettings", memberName));
      if (snap.exists()) {
        const d = snap.data();
        // Never expose the token — strip it before storing in state
        const { token: _omit, ...safe } = d;
        setSettings(safe);
      } else {
        setSettings({ tokenSaved: false, channels: [], prefs: { autoPostSOD: false, autoPostEOD: false, showPreview: true } });
      }
    } catch (e) { console.error("useSlack load:", e); }
    setLoading(false);
  }, [memberName]);

  useEffect(() => { load(); }, [load]);

  // Save token — writes to Firestore, never returns the token to state
  const saveToken = async (token) => {
    if (!memberName || !token?.trim()) return false;
    setSaving(true);
    try {
      const ref  = doc(db, "slackSettings", memberName);
      const snap = await getDoc(ref);
      const current = snap.exists() ? snap.data() : {};
      await setDoc(ref, {
        ...current,
        token:        token.trim(),
        tokenSaved:   true,
        tokenSavedAt: Date.now(),
      });
      setSettings(s => ({ ...s, tokenSaved: true, tokenSavedAt: Date.now() }));
      setSaving(false);
      return true;
    } catch (e) { console.error("saveToken:", e); setSaving(false); return false; }
  };

  // Revoke token
  const revokeToken = async () => {
    if (!memberName) return;
    const ref = doc(db, "slackSettings", memberName);
    await updateDoc(ref, { token: "", tokenSaved: false, tokenSavedAt: null });
    setSettings(s => ({ ...s, tokenSaved: false, tokenSavedAt: null }));
  };

  // Save channels list
  const saveChannels = async (channels) => {
    if (!memberName) return false;
    setSaving(true);
    try {
      const ref = doc(db, "slackSettings", memberName);
      await setDoc(ref, { channels }, { merge: true });
      setSettings(s => ({ ...s, channels }));
      setSaving(false);
      return true;
    } catch (e) { console.error("saveChannels:", e); setSaving(false); return false; }
  };

  // Save prefs
  const savePrefs = async (prefs) => {
    if (!memberName) return;
    const ref = doc(db, "slackSettings", memberName);
    await setDoc(ref, { prefs }, { merge: true });
    setSettings(s => ({ ...s, prefs }));
  };

  // Post a message via the API (token fetched server-side)
  const postMessage = async (channelId, text, blocks) => {
    const res  = await fetch(SLACK_POST_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ memberName, channelId, text, blocks }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to post to Slack");
    return data;
  };

  // Test a channel — posts a quick confirmation message
  const testChannel = async (channelId, label) => {
    const text = `:white_check_mark: TeamPulse connected to *${label}* — ${TODAY}`;
    return postMessage(channelId, text);
  };

  return { settings, loading, saving, load, saveToken, revokeToken, saveChannels, savePrefs, postMessage, testChannel };
}
