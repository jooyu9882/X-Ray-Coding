import { useEffect, useMemo, useRef } from "react";
import { buildCallTree, layoutTree, nodeState, type CallNode } from "../callTree";
import { formatValue } from "../format";
import type { Step } from "../types";

const ROW = 72;
const NODE_HEIGHT = 44;
const PAD = 12;
const CHAR = 7.8; // approx. width of one 13px JetBrains Mono character
const MAX_LABEL = 18;

function clip(text: string): string {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
}

function label(node: CallNode): string {
  return clip(`${node.func}(${node.argValues})`);
}

function result(node: CallNode): string {
  if (node.raised) return clip(`raised ${node.raised}`);
  return clip(`= ${formatValue(node.returnValue ?? null)}`);
}

function describe(node: CallNode): string {
  const call = `${node.func}(${node.args}), called at step ${node.callStep + 1}`;
  if (node.returnStep === null) return `${call}, still running`;
  if (node.raised) return `${call}, raised ${node.raised} at step ${node.returnStep + 1}`;
  return `${call}, returned ${formatValue(node.returnValue ?? null)} at step ${
    node.returnStep + 1
  }`;
}

interface Props {
  steps: Step[];
  index: number;
  onSelect: (stepIndex: number) => void;
}

/**
 * Every function call as a tree that grows while you step: a call appears
 * when it happens, the running chain is highlighted, and finished calls
 * show what they returned. Click a call to jump to it.
 */
export function CallTree({ steps, index, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the executing call in view by scrolling the tree box only, never
  // the page (scrollIntoView would also scroll the window).
  useEffect(() => {
    const box = scrollRef.current;
    const current = box?.querySelector(".tree-node.current");
    if (!box || !current) return;
    const boxRect = box.getBoundingClientRect();
    const nodeRect = current.getBoundingClientRect();
    if (nodeRect.left < boxRect.left || nodeRect.right > boxRect.right) {
      box.scrollLeft +=
        nodeRect.left + nodeRect.width / 2 - (boxRect.left + boxRect.width / 2);
    }
    if (nodeRect.top < boxRect.top || nodeRect.bottom > boxRect.bottom) {
      box.scrollTop +=
        nodeRect.top + nodeRect.height / 2 - (boxRect.top + boxRect.height / 2);
    }
  }, [index, steps]);

  const { placed, columns, rows, column } = useMemo(() => {
    const layout = layoutTree(buildCallTree(steps));
    const widest = Math.max(
      0,
      ...layout.placed.map(({ node }) =>
        Math.max(label(node).length, result(node).length)),
    );
    return { ...layout, column: Math.max(72, widest * CHAR + 20) };
  }, [steps]);

  if (placed.length === 0) {
    return (
      <section className="panel" aria-labelledby="tree-heading">
        <h2 id="tree-heading">Call tree</h2>
        <p className="muted">This program doesn't call any functions.</p>
      </section>
    );
  }

  // Depth of the call that is executing: the innermost frame, except at a
  // "return" step, where that call has finished and its caller is next.
  const step = steps[index];
  const currentDepth = step.stack.length - 2 - (step.event === "return" ? 1 : 0);
  const width = columns * column + PAD * 2;
  const height = rows * ROW + PAD * 2 - (ROW - NODE_HEIGHT);
  const center = (x: number) => PAD + x * column + column / 2;
  const top = (y: number) => PAD + y * ROW;
  const nodeWidth = column - 12;

  const visible = placed.filter(
    ({ node }) => nodeState(node, index, currentDepth) !== "hidden");

  return (
    <section className="panel" aria-labelledby="tree-heading">
      <h2 id="tree-heading">Call tree</h2>
      <p className="muted tree-hint">
        Calls appear as they happen. Select one to jump to it.
      </p>
      <div className="tree-scroll" ref={scrollRef}>
        <svg
          className="tree"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="Function calls"
        >
          {visible.map(({ node, x, y, parent }) =>
            parent ? (
              <line
                key={`edge-${node.id}`}
                className="tree-edge"
                x1={center(parent.x)}
                y1={top(parent.y) + NODE_HEIGHT}
                x2={center(x)}
                y2={top(y)}
              />
            ) : null,
          )}
          {visible.map(({ node, x, y }) => {
            const state = nodeState(node, index, currentDepth);
            return (
              <g
                key={node.id}
                className={`tree-node ${state}${node.raised ? " raised" : ""}`}
                transform={`translate(${center(x) - nodeWidth / 2}, ${top(y)})`}
                role="button"
                tabIndex={0}
                aria-label={describe(node)}
                onClick={() => onSelect(node.callStep)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(node.callStep);
                  }
                }}
              >
                <title>{describe(node)}</title>
                <rect width={nodeWidth} height={NODE_HEIGHT} rx={6} />
                <text x={nodeWidth / 2} y={18} className="tree-label">
                  {label(node)}
                </text>
                {state === "returned" && (
                  <text x={nodeWidth / 2} y={35} className="tree-result">
                    {result(node)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
