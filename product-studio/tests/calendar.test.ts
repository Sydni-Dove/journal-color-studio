import { describe, expect, it } from "vitest";
import { buildCalendar, buildMonth, daysInMonth, formatWeekRange, getCalendar, isLeapYear, weekdayOf, validateCalendarSettings } from "../src/engines/calendar/calendar";

describe("leap years and month lengths", () => {
  it("applies the Gregorian leap rules", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
  it("February, 30- and 31-day months", () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect([4, 6, 9, 11].map((m) => daysInMonth(2027, m))).toEqual([30, 30, 30, 30]);
    expect([1, 3, 5, 7, 8, 10, 12].map((m) => daysInMonth(2027, m))).toEqual([31, 31, 31, 31, 31, 31, 31]);
  });
  it("knows real weekdays", () => {
    expect(weekdayOf("2027-01-01")).toBe(5); // Friday
    expect(weekdayOf("2026-09-24")).toBe(4); // Thursday
    expect(weekdayOf("2028-02-29")).toBe(2); // Tuesday
  });
});

describe("month grids", () => {
  it("Sunday start: Jan 2027 (starts Friday) needs 6 rows", () => {
    const m = buildMonth(2027, 1, 0, false);
    expect(m.leadingBlanks).toBe(5);
    expect(m.naturalRows).toBe(6);
  });
  it("Monday start: Jan 2027 needs 5 rows", () => {
    const m = buildMonth(2027, 1, 1, false);
    expect(m.leadingBlanks).toBe(4);
    expect(m.naturalRows).toBe(5);
  });
  it("Feb 2026 (starts Sunday, 28 days) fits in exactly 4 rows with Sunday start", () => {
    const m = buildMonth(2026, 2, 0, false);
    expect(m.leadingBlanks).toBe(0);
    expect(m.naturalRows).toBe(4);
  });
  it("six-row universal option always yields 6 × 7 cells with the month's days in order", () => {
    for (let mo = 1; mo <= 12; mo++) {
      const m = buildMonth(2028, mo, 1, true);
      expect(m.rows).toBe(6);
      expect(m.grid.flat()).toHaveLength(42);
      const inMonth = m.grid.flat().filter((c) => c.inMonth).map((c) => c.day.day);
      expect(inMonth).toEqual(Array.from({ length: daysInMonth(2028, mo) }, (_, i) => i + 1));
    }
  });
  it("every grid row starts on the configured weekday", () => {
    for (const ws of [0, 1] as const) {
      const m = buildMonth(2027, 8, ws, true);
      m.grid.forEach((row) => expect(row[0].day.weekday).toBe(ws));
    }
  });
});

describe("calendar ranges", () => {
  it("a full year yields 12 months, 365 days, 4 quarters", () => {
    const c = buildCalendar({ startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 0, sixRowMonths: true });
    expect(c.months).toHaveLength(12);
    expect(c.days).toHaveLength(365);
    expect(c.quarters.map((q) => q.key)).toEqual(["2027-Q1", "2027-Q2", "2027-Q3", "2027-Q4"]);
    expect(c.years[0].isLeap).toBe(false);
    expect(c.weekdayShortNames[0]).toBe("Sun");
  });
  it("leap-year range has 366 days", () => {
    expect(buildCalendar({ startDate: "2028-01-01", endDate: "2028-12-31", weekStart: 1, sixRowMonths: false }).days).toHaveLength(366);
  });
  it("crosses year boundaries with partial weeks", () => {
    const c = buildCalendar({ startDate: "2026-12-20", endDate: "2027-01-10", weekStart: 1, sixRowMonths: false });
    expect(c.years.map((y) => y.year)).toEqual([2026, 2027]);
    const cross = c.weeks.find((w) => w.startIso === "2026-12-28")!;
    expect(cross.isPartialMonth).toBe(true);
    expect(cross.days.map((d) => d.iso)).toContain("2027-01-03");
    expect(formatWeekRange(cross)).toBe("Dec 28, 2026 – Jan 3, 2027");
    // Out-of-range padding days are flagged.
    expect(c.weeks[0].days[0].inRange).toBe(false);
  });
  it("weeks always have 7 days starting on the configured weekday", () => {
    const c = buildCalendar({ startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 1, sixRowMonths: false });
    c.weeks.forEach((w) => {
      expect(w.days).toHaveLength(7);
      expect(w.days[0].weekday).toBe(1);
    });
  });
  it("validates inputs", () => {
    expect(validateCalendarSettings({ startDate: "2027-02-30", endDate: "2027-03-01", weekStart: 0, sixRowMonths: false })).toHaveLength(1);
    expect(validateCalendarSettings({ startDate: "2027-03-01", endDate: "2027-02-01", weekStart: 0, sixRowMonths: false })).toHaveLength(1);
  });
  it("caches identical settings", () => {
    const s = { startDate: "2027-01-01", endDate: "2027-06-30", weekStart: 0 as const, sixRowMonths: true };
    expect(getCalendar(s)).toBe(getCalendar({ ...s }));
  });
});
