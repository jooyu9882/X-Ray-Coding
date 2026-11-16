import { describe, expect, it } from "vitest";
import { heatLevels, hottestLine, timesLabel } from "./heatmap";

describe("heatLevels", () => {
  it("scales counts to five levels relative to the busiest line", () => {
    const heat = heatLevels({ "1": 1, "2": 10, "3": 5, "4": 6 });
    const level = (line: number) => heat.find((h) => h.line === line)?.level;
    expect(level(2)).toBe(5);
    expect(level(3)).toBe(3); // 5/10 of the max -> 2.5 -> level 3
    expect(level(4)).toBe(3);
    expect(level(1)).toBe(1); // never below the faintest visible level
  });

  it("handles empty input", () => {
    expect(heatLevels({})).toEqual([]);
    expect(hottestLine([])).toBeNull();
  });
});

describe("hottestLine", () => {
  it("picks the busiest line, the earliest one on ties", () => {
    const heat = heatLevels({ "3": 4, "1": 4, "2": 1 });
    expect(hottestLine(heat)?.line).toBe(1);
  });
});

describe("timesLabel", () => {
  it("reads naturally", () => {
    expect(timesLabel(1)).toBe("once");
    expect(timesLabel(9)).toBe("9 times");
  });
});
