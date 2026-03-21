import { db } from "../firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

/**
 * Build a monthly summary from an array of daily entries for a given member/month.
 * Stores it in Firestore at monthlySummaries/{member}_{YYYY-MM}
 */
export async function aggregateMonth(memberName, monthKey, entries) {
  const monthEntries = entries.filter(e => e.date && e.date.startsWith(monthKey));
  if (!monthEntries.length) return;

  const tasksByClient = {};
  const tasksByStatus = { "In Progress": 0, "Done": 0, "Blocked": 0, "Pending": 0 };
  let totalTasks = 0;
  let totalBlockers = 0;
  const bwValues = [];
  const blockerList = [];

  monthEntries.forEach(entry => {
    if (entry.blockers?.trim()) {
      totalBlockers++;
      blockerList.push({ date: entry.date, text: entry.blockers });
    }
    if (entry.bandwidth) bwValues.push(entry.bandwidth);
    (entry.tasks || []).forEach(t => {
      if (!t.text?.trim()) return;
      totalTasks++;
      const client = t.client || "Internal";
      tasksByClient[client] = (tasksByClient[client] || 0) + 1;
      if (tasksByStatus[t.status] !== undefined) tasksByStatus[t.status]++;
    });
  });

  const avgBw = bwValues.length
    ? Math.round(bwValues.reduce((a, b) => a + b, 0) / bwValues.length)
    : 3;

  const topClient = Object.entries(tasksByClient).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  const summary = {
    memberName,
    monthKey,
    daysSubmitted:  monthEntries.length,
    totalTasks,
    totalBlockers,
    tasksByClient,
    tasksByStatus,
    avgBandwidth:   avgBw,
    topClient,
    blockerList,
    generatedAt:    new Date().toISOString(),
  };

  const docId = `${memberName}_${monthKey}`;
  await setDoc(doc(db, "monthlySummaries", docId), summary);
  return summary;
}

/**
 * Load a monthly summary from Firestore. Returns null if not found.
 */
export async function loadMonthlySummary(memberName, monthKey) {
  const docId = `${memberName}_${monthKey}`;
  const snap = await getDoc(doc(db, "monthlySummaries", docId));
  return snap.exists() ? snap.data() : null;
}

/**
 * Build an annual summary from 12 monthly summaries.
 */
export function buildAnnualSummary(monthlySummaries) {
  const result = {
    totalDaysSubmitted: 0,
    totalTasks: 0,
    totalBlockers: 0,
    tasksByClient: {},
    tasksByStatus: { "In Progress": 0, "Done": 0, "Blocked": 0, "Pending": 0 },
    monthlyBreakdown: [],
    avgBandwidthPerMonth: [],
  };

  monthlySummaries.forEach(s => {
    if (!s) return;
    result.totalDaysSubmitted += s.daysSubmitted || 0;
    result.totalTasks         += s.totalTasks    || 0;
    result.totalBlockers      += s.totalBlockers || 0;
    result.monthlyBreakdown.push(s);
    result.avgBandwidthPerMonth.push(s.avgBandwidth || 0);

    Object.entries(s.tasksByClient || {}).forEach(([c, n]) => {
      result.tasksByClient[c] = (result.tasksByClient[c] || 0) + n;
    });
    Object.entries(s.tasksByStatus || {}).forEach(([st, n]) => {
      if (result.tasksByStatus[st] !== undefined) result.tasksByStatus[st] += n;
    });
  });

  return result;
}
