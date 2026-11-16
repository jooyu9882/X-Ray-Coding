// Mirrors the JSON produced by backend/app/tracer.py and runner.py.

export interface SequenceValue {
  type: string; // "list", "tuple", "set", "deque", or a subclass name
  kind: "sequence";
  items: Value[];
  truncated: boolean;
}

export interface MappingValue {
  type: string; // "dict", "Counter", "defaultdict", ...
  kind: "mapping";
  items: [Value, Value][];
  truncated: boolean;
}

/** A value shown as text only: functions, classes, custom objects, NaN, ... */
export interface OpaqueValue {
  type: string;
  repr: string;
}

export type Value =
  | null
  | boolean
  | number
  | string
  | SequenceValue
  | MappingValue
  | OpaqueValue;

export type TraceEvent = "call" | "line" | "return" | "exception";

export interface Step {
  line: number;
  event: TraceEvent;
  func: string;
  locals: Record<string, Value>;
  stack: string[];
  stdout_len: number;
  return_value?: Value;
  exception?: { type: string; message: string };
}

export interface Violation {
  line: number;
  message: string;
}

export interface TraceError {
  type: string;
  message: string;
  line: number | null;
  violations?: Violation[];
}

export interface Trace {
  steps: Step[];
  line_counts: Record<string, number>;
  stdout: string;
  error: TraceError | null;
}
