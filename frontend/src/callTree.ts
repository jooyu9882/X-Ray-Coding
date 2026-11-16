import { formatValue } from "./format";
import type { Step, Value } from "./types";

export interface CallNode {
  id: number;
  func: string;
  /** "n=3" style argument list captured at the call event. */
  args: string;
  /** Just the values, "3", for compact labels. */
  argValues: string;
  callStep: number;
  /** Step index of the matching return event, or null if it never returned. */
  returnStep: number | null;
  returnValue: Value | undefined;
  /** Exception type if the call ended by raising instead of returning. */
  raised: string | null;
  depth: number;
  children: CallNode[];
}

/**
 * Rebuild the tree of function calls from the flat event list.
 *
 * A stack mirrors the interpreter's call stack: "call" pushes a node under
 * the current top, "return" pops it. Top-level calls (made from the main
 * program) become the roots.
 */
export function buildCallTree(steps: Step[]): CallNode[] {
  const roots: CallNode[] = [];
  const open: CallNode[] = [];
  let nextId = 0;

  steps.forEach((step, index) => {
    if (step.func === "<module>") return;
    // Number of user function frames, the main program excluded.
    const depth = step.stack.length - 1;

    if (step.event === "call") {
      const node: CallNode = {
        id: nextId++,
        func: step.func,
        args: Object.entries(step.locals)
          .map(([name, value]) => `${name}=${formatValue(value)}`)
          .join(", "),
        argValues: Object.values(step.locals).map(formatValue).join(", "),
        callStep: index,
        returnStep: null,
        returnValue: undefined,
        raised: null,
        depth: open.length,
        children: [],
      };
      (open.at(-1)?.children ?? roots).push(node);
      open.push(node);
      return;
    }

    const top = open.at(-1);
    if (!top || depth !== open.length) return;

    if (step.event === "exception") {
      top.raised = step.exception?.type ?? "Exception";
    } else if (step.event === "line") {
      top.raised = null; // still running, so the exception was handled
    } else if (step.event === "return") {
      top.returnStep = index;
      top.returnValue = top.raised ? undefined : step.return_value;
      open.pop();
    }
  });
  return roots;
}

export interface PlacedNode {
  node: CallNode;
  /** Column (leaf slot) and row (depth) in grid units. */
  x: number;
  y: number;
  parent: PlacedNode | null;
}

/**
 * Simple tidy layout: leaves take consecutive columns from left to right,
 * and each parent is centered over its first and last child.
 */
export function layoutTree(roots: CallNode[]): {
  placed: PlacedNode[];
  columns: number;
  rows: number;
} {
  const placed: PlacedNode[] = [];
  let nextColumn = 0;
  let rows = 0;

  const place = (node: CallNode, parent: PlacedNode | null): PlacedNode => {
    const item: PlacedNode = { node, x: 0, y: node.depth, parent };
    placed.push(item);
    rows = Math.max(rows, node.depth + 1);
    if (node.children.length === 0) {
      item.x = nextColumn++;
    } else {
      const kids = node.children.map((child) => place(child, item));
      item.x = (kids[0].x + kids[kids.length - 1].x) / 2;
    }
    return item;
  };

  roots.forEach((root) => place(root, null));
  return { placed, columns: nextColumn, rows };
}

/** How a node looks at a given step of the replay. */
export type NodeState = "hidden" | "running" | "current" | "returned";

export function nodeState(
  node: CallNode,
  index: number,
  currentDepth: number,
): NodeState {
  if (node.callStep > index) return "hidden";
  if (node.returnStep !== null && node.returnStep <= index) return "returned";
  // Of the calls still on the stack, the deepest one is executing.
  return node.depth === currentDepth ? "current" : "running";
}
