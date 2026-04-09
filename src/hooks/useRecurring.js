import { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import {
  collection, doc, setDoc, getDocs, deleteDoc,
} from "firebase/firestore";
import { TODAY } from "../utils/dates";

// Firestore path: recurringTasks/{memberName}/tasks/{taskId}

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Returns true if a recurring task is scheduled for today
export function isScheduledToday(task) {
  const dow = new Date().getDay(); // 0=Sun
  const iso = TODAY;
  const dom = new Date().getDate();

  if (task.schedule === "daily")   return true;
  if (task.schedule === "weekdays") return dow >= 1 && dow <= 5;
  if (task.schedule === "weekly" && Array.isArray(task.days)) {
    return task.days.includes(dow);
  }
  if (task.schedule === "monthly") return dom === (task.dayOfMonth || 1);
  return false;
}

export function scheduleLabel(task) {
  if (task.schedule === "daily")    return "Daily";
  if (task.schedule === "weekdays") return "Weekdays";
  if (task.schedule === "monthly")  return `${task.dayOfMonth || 1}st of month`;
  if (task.schedule === "weekly" && Array.isArray(task.days)) {
    return task.days.map(d => DAYS[d]).join(", ");
  }
  return "—";
}

export function useRecurring(memberName) {
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!memberName) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        collection(db, "recurringTasks", memberName, "tasks")
      );
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      // Only update state if we actually got results or collection is genuinely empty
      // Avoid wiping optimistic state if read fails silently
      if (snap.docs.length > 0) setTasks(sorted);
    } catch (e) {
      console.error("useRecurring load:", e);
      // Don't clear tasks on load failure — keep whatever is in state
    }
    setLoading(false);
  }, [memberName]);

  useEffect(() => { load(); }, [load]);

  const save = async (task) => {
    if (!memberName) return;
    const id   = task.id || `rt_${Date.now()}`;
    const data = { ...task, id, updatedAt: Date.now(), createdAt: task.createdAt || Date.now() };
    try {
      await setDoc(doc(db, "recurringTasks", memberName, "tasks", id), data);
      // Optimistically update local state immediately — don't wait for re-fetch
      // which may fail if Firestore rules haven't been updated yet
      setTasks(prev => {
        const without = prev.filter(t => t.id !== id);
        const updated = [...without, data].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        return updated;
      });
      // Also try a background reload to sync any other changes
      load().catch(() => {});
    } catch (e) {
      console.error("useRecurring save:", e);
      throw e; // re-throw so RecurringTasks can handle it
    }
    return id;
  };

  const remove = async (id) => {
    await deleteDoc(doc(db, "recurringTasks", memberName, "tasks", id));
    setTasks(t => t.filter(x => x.id !== id));
  };

  const todayTasks = tasks.filter(t => t.active !== false && isScheduledToday(t));

  return { tasks, loading, save, remove, reload: load, todayTasks };
}
