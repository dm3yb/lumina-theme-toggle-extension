import { describe, expect, it } from "vitest";
import * as SunCalc from "suncalc";
import { parseTime, resolveSchedule, resolveSunriseSunset } from "../src/schedule";

const HOUR = 60 * 60 * 1000;

/* A local-time Date on a fixed day, matching how the implementation builds
   schedule boundaries (so wall-clock diffs are exact regardless of timezone). */
function at(h: number, m = 0) {
  return new Date(2026, 5, 13, h, m, 0, 0);
}

describe("parseTime", () => {
  const fallback = { hours: 7, minutes: 0 };

  it("parses zero-padded 24-hour times", () => {
    expect(parseTime("07:00", fallback)).toEqual({ hours: 7, minutes: 0 });
    expect(parseTime("23:59", fallback)).toEqual({ hours: 23, minutes: 59 });
    expect(parseTime("00:00", fallback)).toEqual({ hours: 0, minutes: 0 });
  });

  it("accepts single-digit hours", () => {
    expect(parseTime("7:00", fallback)).toEqual({ hours: 7, minutes: 0 });
  });

  it("falls back on out-of-range or malformed input", () => {
    expect(parseTime("25:00", fallback)).toEqual(fallback);
    expect(parseTime("12:60", fallback)).toEqual(fallback);
    expect(parseTime("ab:cd", fallback)).toEqual(fallback);
    expect(parseTime("", fallback)).toEqual(fallback);
  });
});

describe("resolveSchedule", () => {
  it("is light between lightTime and darkTime", () => {
    const result = resolveSchedule(at(12), "07:00", "19:00");
    expect(result.kind).toBe("light");
    expect(result.nextTransitionMs).toBe(7 * HOUR); /* until 19:00 */
  });

  it("is dark before lightTime (after the previous night)", () => {
    const result = resolveSchedule(at(6), "07:00", "19:00");
    expect(result.kind).toBe("dark");
    expect(result.nextTransitionMs).toBe(1 * HOUR); /* until 07:00 */
  });

  it("is dark after darkTime and waits for tomorrow's lightTime", () => {
    const result = resolveSchedule(at(20), "07:00", "19:00");
    expect(result.kind).toBe("dark");
    expect(result.nextTransitionMs).toBe(11 * HOUR); /* until 07:00 tomorrow */
  });

  it("treats the boundary instant as the start of that kind", () => {
    const result = resolveSchedule(at(7), "07:00", "19:00");
    expect(result.kind).toBe("light");
    expect(result.nextTransitionMs).toBe(12 * HOUR); /* until 19:00 */
  });

  it("handles inverted times (light in the evening)", () => {
    /* light at 19:00, dark at 07:00 -> at noon the latest boundary is 07:00 dark. */
    const result = resolveSchedule(at(12), "19:00", "07:00");
    expect(result.kind).toBe("dark");
    expect(result.nextTransitionMs).toBe(7 * HOUR); /* until 19:00 light */
  });

  it("handles a late-night dark boundary (wrap-around)", () => {
    const result = resolveSchedule(at(23, 30), "07:00", "23:00");
    expect(result.kind).toBe("dark");
    expect(result.nextTransitionMs).toBe(7.5 * HOUR); /* until 07:00 tomorrow */
  });

  it("falls back to defaults on malformed times", () => {
    /* Both malformed -> defaults 07:00 / 19:00; noon is light. */
    const result = resolveSchedule(at(12), "bogus", "also-bad");
    expect(result.kind).toBe("light");
    expect(result.nextTransitionMs).toBe(7 * HOUR);
  });
});

describe("resolveSunriseSunset", () => {
  const london = { latitude: 51.5074, longitude: -0.1278 };
  const summerNoon = new Date(2026, 5, 21, 12, 0, 0, 0);
  const times = SunCalc.getTimes(summerNoon, london.latitude, london.longitude);

  it("is light during the day, counting down to sunset", () => {
    const midday = new Date(times.sunrise.getTime() + HOUR);
    const result = resolveSunriseSunset(midday, london);
    expect(result.kind).toBe("light");
    expect(result.nextTransitionMs).toBeGreaterThan(0);
    expect(result.nextTransitionMs).toBe(times.sunset.getTime() - midday.getTime());
  });

  it("is dark before sunrise, counting down to sunrise", () => {
    const preDawn = new Date(times.sunrise.getTime() - HOUR);
    const result = resolveSunriseSunset(preDawn, london);
    expect(result.kind).toBe("dark");
    expect(result.nextTransitionMs).toBe(times.sunrise.getTime() - preDawn.getTime());
  });

  it("is dark after sunset and waits for the next sunrise", () => {
    const postSunset = new Date(times.sunset.getTime() + HOUR);
    const result = resolveSunriseSunset(postSunset, london);
    expect(result.kind).toBe("dark");
    expect(result.nextTransitionMs).toBeGreaterThan(0);
    /* The next transition should be roughly a day away (tomorrow's sunrise). */
    expect(result.nextTransitionMs).toBeGreaterThan(6 * HOUR);
  });

  it("falls back to sun altitude during polar day (no timer)", () => {
    /* High Arctic at midsummer: the sun never sets, so suncalc reports no
       sunrise/sunset and we decide by altitude (which is above the horizon). */
    const svalbard = { latitude: 78.22, longitude: 15.65 };
    const result = resolveSunriseSunset(summerNoon, svalbard);
    expect(result.kind).toBe("light");
    expect(result.nextTransitionMs).toBeUndefined();
  });
});
