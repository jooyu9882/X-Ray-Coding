import { useCallback, useEffect, useMemo, useState } from "react";
import { RequestError, traceCode } from "./api";
import { CallTree } from "./components/CallTree";
import { CodeFilm } from "./components/CodeFilm";
import { HeatLegend } from "./components/HeatLegend";
import {
  CallStackPanel,
  ErrorPanel,
  OutputPanel,
  VariablesPanel,
} from "./components/Panels";
import { StepControls } from "./components/StepControls";
import { EXAMPLES } from "./examples";
import { describeStep } from "./format";
import { heatLevels } from "./heatmap";
import type { Trace } from "./types";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest(".monaco-editor") !== null ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
  );
}

export default function App() {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showHeat, setShowHeat] = useState(false);

  const steps = trace?.steps ?? [];
  const step = steps[index];
  const atEnd = steps.length === 0 || index === steps.length - 1;
  const error = trace?.error && atEnd ? trace.error : null;

  const goTo = useCallback(
    (next: number) => {
      if (steps.length === 0) return;
      setIndex(Math.max(0, Math.min(steps.length - 1, next)));
    },
    [steps.length],
  );

  // Arrow keys step through the trace, unless the user is typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowRight") goTo(index + 1);
      else if (event.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const run = async () => {
    setRunning(true);
    setRequestError(null);
    try {
      const result = await traceCode(code);
      setTrace(result);
      setIndex(0);
    } catch (err) {
      setTrace(null);
      setRequestError(
        err instanceof RequestError ? err.message : "Something went wrong.",
      );
    } finally {
      setRunning(false);
    }
  };

  const editCode = (next: string) => {
    setCode(next);
    setTrace(null); // the old trace no longer matches the code
  };

  const heat = useMemo(
    () => (trace ? heatLevels(trace.line_counts) : []),
    [trace],
  );

  const errorLines = useMemo(() => {
    if (!error) return [];
    if (error.violations) return error.violations.map((v) => v.line);
    return error.line ? [error.line] : [];
  }, [error]);

  return (
    <div className="app">
      <header className="masthead">
        <h1>Code X-Ray</h1>
        <p className="tagline">
          Run Python and watch it work, one line at a time.
        </p>
        <div className="actions">
          <label className="example-picker">
            <span>Example</span>
            <select
              onChange={(event) => {
                const example = EXAMPLES[Number(event.target.value)];
                editCode(example.code);
              }}
              defaultValue={0}
            >
              {EXAMPLES.map((example, i) => (
                <option key={example.name} value={i}>
                  {example.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="run"
            onClick={run}
            disabled={running}
          >
            {running ? "Running" : "Run"}
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="film-column">
          <CodeFilm
            code={code}
            onChange={editCode}
            currentLine={step && !error ? step.line : null}
            errorLines={errorLines}
            heat={showHeat && heat.length > 0 ? heat : null}
          />
          {steps.length > 0 && (
            <StepControls index={index} total={steps.length} onChange={goTo} />
          )}
          {heat.length > 0 && (
            <div className="heat-tools">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showHeat}
                  onChange={(event) => setShowHeat(event.target.checked)}
                />
                Show how often each line ran
              </label>
              {showHeat && <HeatLegend heat={heat} />}
            </div>
          )}
        </div>

        <aside className="readout" aria-live="polite">
          {requestError && (
            <section className="error-panel" role="alert">
              <h2>The code didn't run</h2>
              <p>{requestError}</p>
            </section>
          )}

          {!trace && !requestError && (
            <section className="intro">
              <h2>How it works</h2>
              <p>
                Pick an example or write your own Python, then press Run. Step
                through the program with Next and Previous, or the arrow keys,
                and see which line runs, what each variable holds, and which
                functions are waiting on the call stack.
              </p>
            </section>
          )}

          {step && !error && (
            <p className="narration">{describeStep(step)}</p>
          )}
          {error && <ErrorPanel error={error} />}

          {step && (
            <>
              <VariablesPanel step={step} previous={steps[index - 1]} />
              <CallStackPanel stack={step.stack} />
            </>
          )}
          {trace && (
            <OutputPanel
              text={step ? trace.stdout.slice(0, step.stdout_len) : trace.stdout}
            />
          )}
          {step && <CallTree steps={steps} index={index} onSelect={goTo} />}
        </aside>
      </main>
    </div>
  );
}
