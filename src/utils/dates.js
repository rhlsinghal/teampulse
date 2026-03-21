export const TODAY = new Date().toISOString().slice(0, 10);

export const fmt = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

export const fmtMonthYear = (iso) =>
  new Date(iso + "-01T00:00:00").toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });

export const fmtShortMonth = (iso) =>
  new Date(iso + "-01T00:00:00").toLocaleDateString("en-US", { month: "short" });

export const toYYYYMM = (date) => date.toISOString().slice(0, 7);

export const getDaysInMonth = (year, month) =>
  new Date(year, month + 1, 0).getDate();

export const getFirstDayOfMonth = (year, month) =>
  new Date(year, month, 1).getDay();

export const isoDate = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export const MONTHS_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

export const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export const getYearRange = (year) => ({
  start: `${year}-01-01`,
  end:   `${year}-12-31`,
});

export const getAllMonthsInYear = (year) =>
  Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}`
  );
