import { HEAT_LEVELS, hottestLine, timesLabel, type LineHeat } from "../heatmap";

/**
 * Legend for the line heatmap: the shade ramp with its two end values, and
 * the busiest line in words so the information never depends on color alone.
 */
export function HeatLegend({ heat }: { heat: LineHeat[] }) {
  const hottest = hottestLine(heat);
  if (!hottest) return null;
  const levels = Array.from({ length: HEAT_LEVELS }, (_, i) => i + 1);

  return (
    <div className="heat-legend">
      <span className="heat-ramp" aria-hidden="true">
        <span>{timesLabel(1)}</span>
        <span className="heat-swatches">
          {levels.map((level) => (
            <span key={level} className={`heat-swatch film-heat-${level}`} />
          ))}
        </span>
        <span>{timesLabel(hottest.count)}</span>
      </span>
      <span>
        Line {hottest.line} ran the most ({timesLabel(hottest.count)}). Hover a
        line to see its count.
      </span>
    </div>
  );
}
