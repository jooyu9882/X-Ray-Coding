import type { Step, TraceError, Value } from "./types";

export function isSequence(
  value: Value,
): value is Extract<Value, { kind: "sequence" }> {
  return typeof value === "object" && value !== null && "kind" in value &&
    value.kind === "sequence";
}

export function isMapping(
  value: Value,
): value is Extract<Value, { kind: "mapping" }> {
  return typeof value === "object" && value !== null && "kind" in value &&
    value.kind === "mapping";
}

export function isPrimitive(value: Value): boolean {
  return value === null || typeof value !== "object";
}

function pyString(text: string): string {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return `'${escaped}'`;
}

/** Render a serialized value the way Python's repr() would show it. */
export function formatValue(value: Value): string {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return pyString(value);

  if (isMapping(value)) {
    const more = value.truncated ? ", ..." : "";
    const body = value.items
      .map(([k, v]) => `${formatValue(k)}: ${formatValue(v)}`)
      .join(", ") + more;
    return value.type === "dict" ? `{${body}}` : `${value.type}({${body}})`;
  }

  if (isSequence(value)) {
    const parts = value.items.map(formatValue);
    if (value.truncated) parts.push("...");
    const body = parts.join(", ");
    switch (value.type) {
      case "list":
        return `[${body}]`;
      case "tuple":
        return parts.length === 1 ? `(${body},)` : `(${body})`;
      case "set":
        return parts.length === 0 ? "set()" : `{${body}}`;
      case "frozenset":
        return `frozenset({${body}})`;
      default:
        return `${value.type}([${body}])`;
    }
  }

  return value.repr;
}

/** One plain-language sentence describing what happens at this step. */
export function describeStep(step: Step): string {
  switch (step.event) {
    case "call": {
      const args = Object.entries(step.locals)
        .map(([name, v]) => `${name}=${formatValue(v)}`)
        .join(", ");
      return `Calling ${step.func}(${args})`;
    }
    case "line":
      return `About to run line ${step.line}`;
    case "return":
      if (step.func === "<module>") return "The program finished";
      return `${step.func} returns ${formatValue(step.return_value ?? null)}`;
    case "exception":
      return `${step.exception?.type ?? "An exception"} raised in ${
        step.func === "<module>" ? "the program" : step.func
      }`;
  }
}

/** Heading for an error, written for someone learning Python. */
export function errorTitle(error: TraceError): string {
  switch (error.type) {
    case "ForbiddenCode":
      return "This code uses something that isn't allowed here";
    case "SyntaxError":
      return "Python couldn't read this code";
    case "Timeout":
      return "The program took too long and was stopped";
    case "StepLimitExceeded":
      return "The program ran too many steps and was stopped";
    case "OutputLimitExceeded":
      return "The program printed too much and was stopped";
    case "TraceTooLarge":
    case "Crashed":
      return "The program stopped unexpectedly";
    default:
      return "The program stopped with an error";
  }
}

/** Names whose value differs from the previous step in the same frame. */
export function changedNames(step: Step, previous: Step | undefined): Set<string> {
  const changed = new Set<string>();
  if (
    !previous ||
    previous.stack.length !== step.stack.length ||
    previous.func !== step.func
  ) {
    return changed;
  }
  for (const [name, value] of Object.entries(step.locals)) {
    if (JSON.stringify(value) !== JSON.stringify(previous.locals[name])) {
      changed.add(name);
    }
  }
  return changed;
}
