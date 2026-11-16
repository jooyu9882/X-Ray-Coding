import { formatValue, isPrimitive, isSequence } from "../format";
import type { Value } from "../types";

const CELL_TYPES = new Set(["list", "tuple", "deque"]);
const MAX_CELLS = 20;

/**
 * Short lists of plain values are drawn as indexed cells, so swaps in a
 * sorting algorithm are easy to follow. Everything else is shown as repr text.
 */
export function ValueView({ value }: { value: Value }) {
  if (
    isSequence(value) &&
    CELL_TYPES.has(value.type) &&
    !value.truncated &&
    value.items.length > 0 &&
    value.items.length <= MAX_CELLS &&
    value.items.every(isPrimitive)
  ) {
    return (
      <span className="cells" aria-label={formatValue(value)}>
        {value.items.map((item, index) => (
          <span className="cell" key={index}>
            <span className="cell-index">{index}</span>
            <span className="cell-value">{formatValue(item)}</span>
          </span>
        ))}
      </span>
    );
  }
  return <code className="value-text">{formatValue(value)}</code>;
}
