/** Number of shades in the heatmap; level 1 is the faintest. */
export const HEAT_LEVELS = 5;

export interface LineHeat {
  line: number;
  count: number;
  level: number; // 1..HEAT_LEVELS
}

/**
 * Turn {"line": count} into discrete shade levels relative to the busiest
 * line. Discrete steps (instead of a continuous scale) keep the legend
 * readable and neighbouring shades distinguishable.
 */
export function heatLevels(lineCounts: Record<string, number>): LineHeat[] {
  const entries = Object.entries(lineCounts)
    .map(([line, count]) => ({ line: Number(line), count }))
    .filter((entry) => entry.count > 0);
  const max = Math.max(0, ...entries.map((entry) => entry.count));
  return entries.map(({ line, count }) => ({
    line,
    count,
    level: Math.max(1, Math.ceil((count / max) * HEAT_LEVELS)),
  }));
}

export function hottestLine(heat: LineHeat[]): LineHeat | null {
  return heat.reduce<LineHeat | null>(
    (best, entry) =>
      !best || entry.count > best.count ||
      (entry.count === best.count && entry.line < best.line)
        ? entry
        : best,
    null,
  );
}

export function timesLabel(count: number): string {
  return count === 1 ? "once" : `${count} times`;
}
