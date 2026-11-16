import { changedNames, errorTitle } from "../format";
import type { Step, TraceError } from "../types";
import { ValueView } from "./ValueView";

export function VariablesPanel({
  step,
  previous,
}: {
  step: Step;
  previous: Step | undefined;
}) {
  const entries = Object.entries(step.locals);
  const changed = changedNames(step, previous);
  const scope = step.func === "<module>" ? "the program" : step.func;

  return (
    <section className="panel" aria-labelledby="variables-heading">
      <h2 id="variables-heading">Variables in {scope}</h2>
      {entries.length === 0 ? (
        <p className="muted">No variables yet.</p>
      ) : (
        <dl className="variables">
          {entries.map(([name, value]) => (
            <div
              key={name}
              className={changed.has(name) ? "variable changed" : "variable"}
            >
              <dt>{name}</dt>
              <dd>
                <ValueView value={value} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function CallStackPanel({ stack }: { stack: string[] }) {
  // Innermost call first: that is the function running right now.
  const frames = [...stack].reverse();
  return (
    <section className="panel" aria-labelledby="stack-heading">
      <h2 id="stack-heading">Call stack</h2>
      <ol className="stack">
        {frames.map((name, index) => (
          <li key={frames.length - index} className={index === 0 ? "active" : ""}>
            {name === "<module>" ? "main program" : `${name}()`}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function OutputPanel({ text }: { text: string }) {
  return (
    <section className="panel" aria-labelledby="output-heading">
      <h2 id="output-heading">Output</h2>
      {text ? (
        <pre className="output">{text}</pre>
      ) : (
        <p className="muted">Nothing printed yet.</p>
      )}
    </section>
  );
}

export function ErrorPanel({ error }: { error: TraceError }) {
  const where = error.line ? ` (line ${error.line})` : "";
  const violations = error.violations ?? [];
  return (
    <section className="error-panel" role="alert">
      <h2>{errorTitle(error)}</h2>
      {violations.length > 0 ? (
        <ul>
          {violations.map((v, i) => (
            <li key={i}>
              Line {v.line}: {v.message}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {error.type === "ForbiddenCode" ? "" : `${error.type}: `}
          {error.message}
          {where}
        </p>
      )}
    </section>
  );
}
