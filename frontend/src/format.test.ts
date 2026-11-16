import { describe, expect, it } from "vitest";
import { changedNames, describeStep, errorTitle, formatValue } from "./format";
import type { Step } from "./types";

const seq = (type: string, items: unknown[], truncated = false) =>
  ({ type, kind: "sequence", items, truncated }) as never;

describe("formatValue", () => {
  it("renders primitives the way Python repr does", () => {
    expect(formatValue(null)).toBe("None");
    expect(formatValue(true)).toBe("True");
    expect(formatValue(false)).toBe("False");
    expect(formatValue(42)).toBe("42");
    expect(formatValue("it's\n")).toBe("'it\\'s\\n'");
  });

  it("renders each container type with its own brackets", () => {
    expect(formatValue(seq("list", [1, 2]))).toBe("[1, 2]");
    expect(formatValue(seq("tuple", [1]))).toBe("(1,)");
    expect(formatValue(seq("tuple", [1, 2]))).toBe("(1, 2)");
    expect(formatValue(seq("set", []))).toBe("set()");
    expect(formatValue(seq("deque", [1]))).toBe("deque([1])");
    expect(formatValue(seq("list", [1], true))).toBe("[1, ...]");
  });

  it("renders mappings, keeping non-string keys", () => {
    const counter = {
      type: "Counter", kind: "mapping", items: [["a", 2]], truncated: false,
    } as never;
    expect(formatValue({
      type: "dict", kind: "mapping", items: [[1, "x"]], truncated: false,
    } as never)).toBe("{1: 'x'}");
    expect(formatValue(counter)).toBe("Counter({'a': 2})");
  });

  it("shows opaque values by their repr", () => {
    expect(formatValue({ type: "function", repr: "<function f>" })).toBe(
      "<function f>",
    );
  });
});

const step = (overrides: Partial<Step>): Step => ({
  line: 1,
  event: "line",
  func: "f",
  locals: {},
  stack: ["<module>", "f"],
  stdout_len: 0,
  ...overrides,
});

describe("describeStep", () => {
  it("describes each event in plain words", () => {
    expect(describeStep(step({ event: "call", locals: { n: 3 } }))).toBe(
      "Calling f(n=3)",
    );
    expect(describeStep(step({ line: 4 }))).toBe("About to run line 4");
    expect(describeStep(step({ event: "return", return_value: 2 }))).toBe(
      "f returns 2",
    );
    expect(
      describeStep(step({ event: "return", func: "<module>", stack: ["<module>"] })),
    ).toBe("The program finished");
    expect(
      describeStep(step({
        event: "exception",
        exception: { type: "KeyError", message: "'x'" },
      })),
    ).toBe("KeyError raised in f");
  });
});

describe("changedNames", () => {
  it("marks new and changed variables in the same frame", () => {
    const before = step({ locals: { a: 1, b: 2 } });
    const after = step({ locals: { a: 1, b: 3, c: 0 } });
    expect([...changedNames(after, before)].sort()).toEqual(["b", "c"]);
  });

  it("marks nothing after entering or leaving a function", () => {
    const outer = step({ func: "<module>", stack: ["<module>"], locals: { x: 1 } });
    const inner = step({ locals: { x: 2 } });
    expect(changedNames(inner, outer).size).toBe(0);
  });
});

describe("errorTitle", () => {
  it("uses learner-friendly titles", () => {
    expect(errorTitle({ type: "Timeout", message: "", line: null })).toMatch(
      /too long/,
    );
    expect(errorTitle({ type: "ValueError", message: "", line: 1 })).toBe(
      "The program stopped with an error",
    );
  });
});
