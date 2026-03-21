import { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import {
  collection, doc, setDoc, getDocs, query,
  orderBy, where, limit,
} from "firebase/firestore";
import { TODAY } from "../utils/dates";
import { aggregateMonth } from "../utils/aggregator";
import { toYYYYMM } from "../utils/dates";

export function useHistory(memberName) {
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!memberName) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "standup", memberName, "entries"), orderBy("date", "desc"))
      );
      setEntries(snap.docs.map(d => d.data()));
    } catch (e) {
      console.error("Load error:", e);
    }
    setLoading(false);
  }, [memberName]);

  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    if (!memberName) return false;
    setSaving(true);
    try {
      const entry = {
        date:      TODAY,
        ...form,
        tasks:     (form.tasks || []).filter(t => t.text?.trim()),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "standup", memberName, "entries", TODAY), entry);

      // Update local state
      setEntries(prev => {
        const filtered = prev.filter(e => e.date !== TODAY);
        return [entry, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
      });

      // Trigger monthly aggregation in background
      const currentEntries = entries.filter(e => e.date !== TODAY);
      aggregateMonth(memberName, toYYYYMM(new Date()), [entry, ...currentEntries]).catch(() => {});

      setSaving(false);
      return true;
    } catch (e) {
      console.error("Save error:", e);
      setSaving(false);
      return false;
    }
  };

  const getTodayEntry = () => entries.find(e => e.date === TODAY) || null;
  const getEntryByDate = (date) => entries.find(e => e.date === date) || null;
  const getStreak = () => {
    let streak = 0;
    const d = new Date();
    while (true) {
      const iso = d.toISOString().slice(0, 10);
      if (entries.find(e => e.date === iso)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else { break; }
    }
    return streak;
  };

  return { entries, loading, saving, save, load, getTodayEntry, getEntryByDate, getStreak };
}

// Load all members' latest entry for manager overview
export async function loadAllMembersLatest(memberNames) {
  const result = {};
  await Promise.all(memberNames.map(async (name) => {
    try {
      const snap = await getDocs(
        query(collection(db, "standup", name, "entries"), orderBy("date", "desc"), limit(1))
      );
      result[name] = snap.docs[0]?.data() || null;
    } catch { result[name] = null; }
  }));
  return result;
}

// Load all entries for a member in a date range
export async function loadEntriesInRange(memberName, startDate, endDate) {
  try {
    const snap = await getDocs(
      query(
        collection(db, "standup", memberName, "entries"),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
        orderBy("date", "desc")
      )
    );
    return snap.docs.map(d => d.data());
  } catch { return []; }
}
