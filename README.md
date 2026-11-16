# Code X-Ray

An interactive debugger that shows Python code running line by line. Paste a
program, press Run, and step forward and backward through it. You see which line
runs next, what each variable holds, which calls are waiting on the stack, and
what has been printed so far.

Two views go beyond a normal debugger:

- **Recursion call tree.** Every function call becomes a node that appears as it
  happens. Finished calls show their return value, and selecting a node jumps to
  that call.
- **Line heatmap.** Lines are shaded by how often they ran, so hot loops stand
  out at a glance.

## How it works

```
 browser (React + Monaco)                      server (FastAPI)
 ─────────────────────────                     ──────────────────────────────────────
 code ── POST /api/trace ──────────────────▶  checker.py   ast allowlist, rejects unsafe code
                                               runner.py    new Python process (-I), limits
                                                 └ tracer.py sys.settrace records every event
 trace JSON ◀──────────────────────────────── {steps, line_counts, stdout, error}
 replay: Next / Previous only move an index
```

The program runs **once**. The backend records every `call`, `line`, `return`
and `exception` event as JSON. The frontend replays that array, so "Previous"
never re-runs anything.

```json
{
  "steps": [
    {"line": 1, "event": "call", "func": "fib", "locals": {"n": 4},
     "stack": ["<module>", "fib"], "stdout_len": 0}
  ],
  "line_counts": {"2": 9, "3": 5, "4": 4},
  "stdout": "3\n",
  "error": null
}
```

- `locals` holds structured snapshots, not live references. Lists and dicts
  become `{"type", "kind", "items", "truncated"}`. Anything else becomes
  `{"type", "repr"}`.
- `stdout_len` lets the output panel rewind along with the steps.
- `error` is `null` or `{"type", "message", "line"}`. Code rejected by the
  checker adds a `violations` list.

## Safety model

User code is untrusted. It passes through several layers, and each layer
assumes the one before it can fail:

| Layer | What it does |
|---|---|
| `ast` check (`checker.py`) | Imports are limited to an allowlist (`math, random, collections, itertools, functools, heapq, bisect, string, re, dataclasses, typing`). An imported module can only be read as `module.name`, and `name` must be a public, non-module attribute, which blocks leaks such as `random._os` or `typing.sys`. `eval, exec, open, compile, __import__, getattr, setattr, delattr, globals, locals, vars, breakpoint` are rejected. So is any attribute starting with `_` (except `__init__`), frame attributes such as `gi_frame` / `f_globals`, and `string.Formatter` / `typing.get_type_hints`. |
| Restricted `__builtins__` (`runner.py`) | Only safe builtins exist at runtime, and `import` goes through an allowlist check. If the static check misses something, `open` or `import os` still fails. |
| Separate process | `python -I` runs in a subprocess, which is killed after 3 seconds. |
| Memory limit | `RLIMIT_AS` is set to 256 MB through `resource` on Linux/macOS. `resource` doesn't exist on Windows, so the limit is skipped there and the app still runs. |
| Tracer limits | 1,000 steps, 10,000 characters of output, and 5 MB of trace JSON. |
| API | 10,000 characters of code per request, at most 4 programs running at once (`503` beyond that), and a CORS allowlist. |

**This is not full isolation.** The child process runs as the same OS user as
the server, with the same filesystem and network. A Python-level escape that
gets past both the `ast` check and the restricted builtins would not be
contained by the OS. Before exposing this publicly, run each program in a
throwaway container with no network (Docker with seccomp, gVisor, or
Firecracker). That is listed under future work.

## Running locally

Requirements: Python 3.12 and Node 20.19+ (CI uses Node 22).

```bash
# Backend: http://localhost:8000 (docs at /docs)
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows; use .venv/bin/activate on Linux/macOS
pip install -r requirements-dev.txt
uvicorn app.main:app --reload

# Frontend: http://localhost:5173
cd frontend
npm install
npm run dev
```

If the backend runs on a different port, start the frontend with
`VITE_API_URL=http://localhost:<port> npm run dev` (see `frontend/.env.example`).
Allowed browser origins come from `ALLOWED_ORIGINS` (comma-separated, default
`http://localhost:5173`).

## Tests

```bash
cd backend && python -m pytest      # tracer, checker, runner, API
cd frontend && npm test             # value formatting, call tree, heatmap
```

GitHub Actions runs both suites, plus the frontend build, on every pull request
and on `main`. Backend tests run on Linux, so the memory limit test runs there.
It is skipped on Windows.

Covered cases include:
- a recursive function
- an infinite loop (stopped by the step limit, or by the timeout when a bare
  `except:` hides it from the tracer)
- a blocked import
- code that raises
- output flooding
- each known escape route listed above
- the runtime layer still blocking `import os` and `open()` when the static
  check is disabled

The call tree tests use real traces produced by the backend tracer
(`frontend/src/__fixtures__/`), so they also check that both sides agree on the
JSON format.

## Measurements

Measured on the development machine (Windows 11, Intel Alder Lake CPU,
Python 3.12.0). `run_code` was called 20 times per program, end to end
(ast check, subprocess, tracing, JSON):

| Program | Steps | Trace JSON | Median time | Min / max |
|---|---|---|---|---|
| `x = 1` | 2 | < 1 KB | 134 ms | 122 / 149 ms |
| recursive `fib(10)` | 534 | 83 KB | 137 ms | 121 / 147 ms |

Almost all of the time is starting a fresh Python process. Tracing 534 steps
adds very little on top. A pool of pre-started workers would cut latency, at
the cost of losing a clean process per run.

## Deployment

The configuration is in the repo. Each platform needs its own account.

- **Backend on Render:** `render.yaml` is a Blueprint (New > Blueprint > this
  repo). Set `ALLOWED_ORIGINS` to the frontend URL. The health check is
  `/api/health`.
- **Frontend on Vercel:** import the repo with **Root Directory** `frontend`
  (`frontend/vercel.json` sets the Vite build), and set `VITE_API_URL` to the
  Render URL.

## Project layout

```
backend/
  app/
    main.py      FastAPI endpoint (code -> trace JSON)
    checker.py   ast pre-check
    runner.py    subprocess execution with limits, restricted builtins
    tracer.py    records events with sys.settrace
  tests/
frontend/
  src/
    App.tsx            state and layout
    components/        editor, controls, panels, call tree, heatmap legend
    format.ts          Python-style value display, step narration
    callTree.ts        events -> call tree -> layout
    heatmap.ts         line counts -> shade levels
```

## Known limitations and future work

- **Isolation:** per-run containers (see "Safety model").
- **Variables:** only the current function's variables are shown, not the
  variables of the calls waiting on the stack.
- **Aliasing:** two names pointing at the same list are not marked as shared.
- **Numbers:** floats such as `1.0` display as `1`, because JSON numbers lose the
  distinction.
- **Rejected code that is safe:** `input()` is not supported. Private attribute
  names (`self._x`) and passing module objects around are rejected by the
  checker.
- **Editor:** Monaco is loaded from its CDN.
