# Code X-Ray

An interactive debugger that visualizes Python code execution line by line.
Focus: accurate execution tracing and safe execution of untrusted code.

## Working rules
- Keep changes focused on the current task. Do not add features, libraries, or refactors that were not requested.
- Never write numbers in the README, PRs, or docs that were not actually measured.
- Personal preferences may be in `CLAUDE.local.md`. Follow it if it exists.

## Git workflow
Do all of this without asking, unless a rule below says to stop.

### Branches
- Never commit directly to `main`. `main` must always work.
- Start each step from the latest `main` on a new branch: `git switch main && git pull && git switch -c <type>/<short-name>`.
- Branch names: `feat/...` new feature, `fix/...` bug fix, `test/...` tests only, `docs/...` docs only, `chore/...` setup and config. Example: `feat/tracer`.
- One branch per step in "Order of work". Do not mix two steps in one branch.

### When to commit
Commit when a small, meaningful unit works. Not on every file save, and not only once at the end.
- A function or endpoint works and its quick check or test passes.
- A test file is added and passes.
- A bug is fixed and verified.
- A measurement is done and its numbers are recorded.
Each commit should leave the code runnable. Do not commit code that fails to run.

### Commit messages
- Conventional Commits in English: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`.
- Say what changed, not "update" or "wip". Example: `feat: record line events with settrace`.
- `git add` only files related to that commit. Never `git add .` blindly.

### When to push
- Push the branch right after every commit (`git push -u origin <branch>` the first time). This is the backup and shows progress on GitHub.

### Finishing a step
1. Run all tests. If anything fails, fix it before going on.
2. Open a pull request to `main` with `gh pr create`. Title in Conventional Commits style. Body: what was built, why it was designed this way, how it was tested, measured numbers if any.
3. Merge with a merge commit, not squash, so each commit stays visible: `gh pr merge --merge --delete-branch`.
4. `git switch main && git pull`.
5. Report the PR link, the commits included, and a short summary.
If `gh` is not available, push the branch, stop, and report that the PR must be opened manually.

### Safety
- Never commit secrets: `.env`, API keys, tokens, credentials. Keep them in `.gitignore`.
- Never commit `CLAUDE.local.md`. Make sure it is listed in `.gitignore`.
- Never commit build output or dependencies (`node_modules/`, `__pycache__/`, `.venv/`, `dist/`).
- Never force push, rewrite history, or push directly to `main`.
- If push, pull, or merge fails (auth, conflict), stop and explain the error. Do not try workarounds.

## Core design principles
- Use `sys.settrace` for execution tracing and `ast` for pre-execution checks.
- Build the full execution trace as JSON and replay it on the frontend. "Previous step" moves the array index; it never re-runs code.
- Always run user code in a separate subprocess with limits on time (e.g. 3 seconds), output length, and max steps.
- Memory limits use the `resource` module, which only exists on Linux/macOS. Development happens on Windows, so apply the memory limit only when `resource` is available and skip it otherwise. Never let the app crash on Windows because of this.
- Use an allowlist, not a blocklist, for imports: only safe modules such as `math`, `random`, `collections`, `itertools`, `functools`, `heapq`, `bisect`, `string`, `re`, `dataclasses`, `typing`. Any other import is rejected by the `ast` check.
- Also reject dangerous calls and names with the `ast` check: `eval`, `exec`, `open`, `compile`, `__import__`, `getattr`, `globals`, `locals`, and any dunder attribute access (e.g. `__class__`, `__subclasses__`, `__builtins__`).
- Run user code with a restricted `__builtins__` dict.
- State in the README that this is not full isolation, and list Docker isolation as future work.
- Differentiators: recursion call tree visualization and per-line execution count heatmap.

## Tech stack
- Backend: Python + FastAPI
- Frontend: React + TypeScript + Monaco Editor
- Deployment: backend on Render or Fly.io, frontend on Vercel

## Visual design
- `docs/design.md` (the dark "Radiograph" design system) is the source of truth for all UI. Every new or changed screen uses its tokens and component rules. No raw hex values in components, no new colors or fonts without adding them to `docs/design.md` first.

## Structure
```
backend/
  app/
    main.py      # FastAPI endpoint (code -> trace JSON)
    checker.py   # ast pre-check
    runner.py    # subprocess execution with limits
    tracer.py    # records events with sys.settrace
  tests/
frontend/
```

## Trace JSON format
```json
{
  "steps": [
    {"line": 3, "event": "call", "func": "fib",
     "locals": {"n": 4}, "stack": ["<module>", "fib"]}
  ],
  "line_counts": {"3": 9, "4": 9},
  "stdout": "3\n",
  "error": null
}
```

## Order of work
1. tracer.py (verify with a Fibonacci example)
2. checker.py
3. runner.py
4. FastAPI endpoint
5. Frontend: editor, next/previous/reset buttons, variables and call stack panels
6. Differentiators: recursion call tree, heatmap
7. Tests, GitHub Actions, deployment, README

## Required test cases
- Recursive function, infinite loop (timeout), blocked import, code that raises an exception, output flooding
