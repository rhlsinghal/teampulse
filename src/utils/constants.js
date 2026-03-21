export const BANDWIDTH = {
  1: { label: "Overloaded", color: "var(--red)",   bgClass: "badge-red"   },
  2: { label: "Busy",       color: "var(--amber)", bgClass: "badge-amber" },
  3: { label: "Balanced",   color: "var(--blue)",  bgClass: "badge-blue"  },
  4: { label: "Available",  color: "var(--green)", bgClass: "badge-green" },
  5: { label: "Open",       color: "var(--accent)",bgClass: "badge-accent"},
};

export const BW_STYLES = {
  1: { color: "var(--red)",    bg: "var(--red-bg)",    bd: "var(--red-bd)"    },
  2: { color: "var(--amber)",  bg: "var(--amber-bg)",  bd: "var(--amber-bd)"  },
  3: { color: "var(--blue)",   bg: "var(--blue-bg)",   bd: "var(--blue-bd)"   },
  4: { color: "var(--green)",  bg: "var(--green-bg)",  bd: "var(--green-bd)"  },
  5: { color: "var(--accent)", bg: "#eeefff",          bd: "#c7cafd"          },
};

export const TASK_STATUS = ["In Progress", "Done", "Blocked", "Pending"];

export const STATUS_STYLES = {
  "In Progress": { color: "var(--blue)",  bg: "var(--blue-bg)",  bd: "var(--blue-bd)"  },
  "Done":        { color: "var(--green)", bg: "var(--green-bg)", bd: "var(--green-bd)" },
  "Blocked":     { color: "var(--red)",   bg: "var(--red-bg)",   bd: "var(--red-bd)"   },
  "Pending":     { color: "#6b7280",      bg: "#f3f4f6",         bd: "#e5e7eb"         },
};

export const AVATAR_COLORS = [
  "#5b5ff5","#8b5cf6","#ec4899","#f97316",
  "#16a34a","#06b6d4","#d97706","#dc2626","#2563eb","#10b981",
];

export const avatarColor = (name) =>
  AVATAR_COLORS[(name || "A").charCodeAt(0) % AVATAR_COLORS.length];

export const initials = (name) =>
  (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

export const emptyForm = () => ({
  yesterday: "",
  today:     "",
  blockers:  "",
  bandwidth: 3,
  note:      "",
  tasks:     [{ client: "", text: "", status: "In Progress" }],
});
