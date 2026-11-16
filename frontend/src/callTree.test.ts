import { describe, expect, it } from "vitest";
import { buildCallTree, layoutTree, nodeState, type CallNode } from "./callTree";
// Real traces produced by backend/app/tracer.py (see README, "Tests").
import exceptionsTrace from "./__fixtures__/exceptions.json";
import fibTrace from "./__fixtures__/fib3.json";
import type { Trace } from "./types";

// JSON imports get literal types that don't line up with the Value union.
const fib = fibTrace as unknown as Trace;
const exceptions = exceptionsTrace as unknown as Trace;

const shape = (node: CallNode): unknown => [
  `${node.func}(${node.argValues})`,
  node.children.map(shape),
];

describe("buildCallTree", () => {
  it("rebuilds the recursion tree of fib(3)", () => {
    const roots = buildCallTree(fib.steps);
    expect(roots.map(shape)).toEqual([
      ["fib(3)", [
        ["fib(2)", [["fib(1)", []], ["fib(0)", []]]],
        ["fib(1)", []],
      ]],
    ]);
  });

  it("records return values and the steps of call and return", () => {
    const [root] = buildCallTree(fib.steps);
    expect(root.returnValue).toBe(2);
    expect(fib.steps[root.callStep].event).toBe("call");
    expect(fib.steps[root.returnStep!].event).toBe("return");
    expect(root.children.map((c) => c.returnValue)).toEqual([1, 1]);
  });

  it("tells a handled exception from one that ends the call", () => {
    const [safeDiv, boom] = buildCallTree(exceptions.steps);
    expect(safeDiv.func).toBe("safe_div");
    expect(safeDiv.raised).toBeNull();
    expect(safeDiv.returnValue).toBeNull();
    expect(boom.func).toBe("boom");
    expect(boom.raised).toBe("ZeroDivisionError");
    expect(boom.returnValue).toBeUndefined();
  });

  it("leaves calls cut off by the step limit open", () => {
    const [root] = buildCallTree(fib.steps.slice(0, 6));
    expect(root.returnStep).toBeNull();
  });
});

describe("layoutTree", () => {
  it("puts leaves in consecutive columns and parents over their children", () => {
    const { placed, columns, rows } = layoutTree(buildCallTree(fib.steps));
    const at = (label: string) =>
      placed.filter((p) => `${p.node.func}(${p.node.argValues})` === label);

    expect(columns).toBe(3); // leaves: fib(1), fib(0), fib(1)
    expect(rows).toBe(3);
    const [fib2] = at("fib(2)");
    expect(fib2.x).toBe(0.5); // between its leaves in columns 0 and 1
    const [fib3] = at("fib(3)");
    expect(fib3.x).toBe((0.5 + 2) / 2);
    expect(fib3.y).toBe(0);
  });
});

describe("nodeState", () => {
  it("follows a call from hidden to current to returned", () => {
    const [root] = buildCallTree(fib.steps);
    expect(nodeState(root, root.callStep - 1, -1)).toBe("hidden");
    expect(nodeState(root, root.callStep, 0)).toBe("current");
    expect(nodeState(root, root.callStep + 3, 1)).toBe("running");
    expect(nodeState(root, root.returnStep!, -1)).toBe("returned");
  });
});
