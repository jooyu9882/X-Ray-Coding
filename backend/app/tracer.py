"""Record a line-by-line execution trace of Python source with sys.settrace.

The result is a JSON-ready dict that the frontend replays step by step:

    {
      "steps": [{"line": 3, "event": "call", "func": "fib",
                 "locals": {"n": 4}, "stack": ["<module>", "fib"]}, ...],
      "line_counts": {"3": 9},
      "stdout": "3\\n",
      "error": null | {"type": ..., "message": ..., "line": ...}
    }

This module only records. Sandboxing (subprocess, time/memory limits,
restricted builtins) is the job of checker.py and runner.py.
"""

import collections
import contextlib
import io
import math
import sys
import types

USER_FILENAME = "<user_code>"

MAX_STEPS = 1000
MAX_DEPTH = 3  # how deep nested containers are expanded
MAX_ITEMS = 50  # items shown per container
MAX_STR_LEN = 200
JS_SAFE_INT = 2**53  # larger ints lose precision in JavaScript


class StepLimitExceeded(BaseException):
    """Raised inside user code to stop it once max_steps is reached.

    BaseException (not Exception) so a plain `except Exception:` in user code
    does not swallow it.
    """


# ---------------------------------------------------------------------------
# Value serialization
# ---------------------------------------------------------------------------

def _truncate(text):
    if len(text) > MAX_STR_LEN:
        return text[:MAX_STR_LEN] + "..."
    return text


def _opaque(value, text):
    """A value shown as text only, tagged with its type name."""
    return {"type": type(value).__name__, "repr": _truncate(text)}


def _safe_repr(value):
    try:
        return repr(value)
    except Exception:  # user-defined __repr__ may raise, int may be too long
        return f"<{type(value).__name__} object>"


def _safe_str(value):
    try:
        return str(value)
    except Exception:
        return f"<{type(value).__name__} object>"


def serialize(value, depth=0):
    """Convert a Python value into a JSON-safe snapshot.

    - None, bool, str, finite float and JS-safe int stay native JSON.
    - Sequences/sets -> {"type": "list", "items": [...], "truncated": bool}
    - Mappings       -> {"type": "dict", "items": [[k, v], ...], "truncated": bool}
      (pairs, because keys can be ints or tuples, not only strings)
    - Everything else -> {"type": <type name>, "repr": "..."}

    A new structure is built every time, so later mutation of the user's
    list does not change snapshots already recorded.
    """
    if value is None or type(value) is bool:
        return value
    if type(value) is int:
        if -JS_SAFE_INT < value < JS_SAFE_INT:
            return value
        return _opaque(value, _safe_repr(value))
    if type(value) is float:
        if math.isfinite(value):
            return value
        return _opaque(value, repr(value))  # NaN/inf are not valid JSON
    if type(value) is str:
        return _truncate(value)

    if isinstance(value, types.FunctionType):
        return _opaque(value, f"<function {value.__name__}>")
    if isinstance(value, type):
        return _opaque(value, f"<class {value.__name__}>")
    if isinstance(value, types.ModuleType):
        return _opaque(value, f"<module {value.__name__}>")

    is_mapping = isinstance(value, dict)
    is_sequence = isinstance(
        value, (list, tuple, set, frozenset, collections.deque)
    )
    if is_mapping or is_sequence:
        if depth >= MAX_DEPTH:
            return _opaque(value, "{...}" if is_mapping else "[...]")
        try:
            source = list(value.items()) if is_mapping else list(value)
        except Exception:
            return _opaque(value, _safe_repr(value))
        shown = source[:MAX_ITEMS]
        if is_mapping:
            items = [[serialize(k, depth + 1), serialize(v, depth + 1)]
                     for k, v in shown]
        else:
            items = [serialize(v, depth + 1) for v in shown]
        return {
            "type": type(value).__name__,
            "items": items,
            "truncated": len(source) > MAX_ITEMS,
        }

    return _opaque(value, _safe_repr(value))


def _serialize_locals(frame):
    result = {}
    for name, value in frame.f_locals.items():
        # The module frame's locals are its globals: skip __name__,
        # __builtins__ and friends.
        if name.startswith("__") and name.endswith("__"):
            continue
        result[name] = serialize(value)
    return result


# ---------------------------------------------------------------------------
# Tracing
# ---------------------------------------------------------------------------

class Tracer:
    def __init__(self, max_steps):
        self.max_steps = max_steps
        self.steps = []
        self.line_counts = collections.Counter()
        self.limit_hit = False

    def _stack(self, frame):
        names = []
        while frame is not None and frame.f_code.co_filename == USER_FILENAME:
            names.append(frame.f_code.co_name)
            frame = frame.f_back
        return names[::-1]  # outermost first: ["<module>", "fib", "fib"]

    def trace(self, frame, event, arg):
        # Only user code is recorded. Returning None for a "call" event
        # means "do not trace inside this frame" (e.g. library code).
        if frame.f_code.co_filename != USER_FILENAME:
            return None
        if event not in ("call", "line", "return", "exception"):
            return self.trace
        if event == "call" and frame.f_code.co_name == "<module>":
            return self.trace  # reports line 0; the first "line" step follows

        if len(self.steps) >= self.max_steps:
            self.limit_hit = True
            # Raising here aborts the user code. CPython also turns tracing
            # off after a trace function raises.
            raise StepLimitExceeded

        step = {
            "line": frame.f_lineno,
            "event": event,
            "func": frame.f_code.co_name,
            "locals": _serialize_locals(frame),
            "stack": self._stack(frame),
        }
        if event == "return":
            step["return_value"] = serialize(arg)
        elif event == "exception":
            exc_type, exc_value, _ = arg
            step["exception"] = {
                "type": exc_type.__name__,
                "message": _safe_str(exc_value),
            }
        if event == "line":
            self.line_counts[frame.f_lineno] += 1

        self.steps.append(step)
        return self.trace  # keep receiving events for this frame


def _error_line(exc):
    """Line of the innermost user-code frame in the traceback."""
    line = None
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == USER_FILENAME:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def trace_code(source, max_steps=MAX_STEPS):
    """Run `source` under sys.settrace and return the trace as a dict."""
    result = {"steps": [], "line_counts": {}, "stdout": "", "error": None}

    try:
        code = compile(source, USER_FILENAME, "exec")
    except SyntaxError as exc:
        result["error"] = {
            "type": "SyntaxError",
            "message": exc.msg,
            "line": exc.lineno,
        }
        return result

    tracer = Tracer(max_steps)
    stdout = io.StringIO()
    user_globals = {"__name__": "__main__"}

    with contextlib.redirect_stdout(stdout):
        sys.settrace(tracer.trace)
        try:
            exec(code, user_globals)
        except StepLimitExceeded:
            pass  # reported below through tracer.limit_hit
        except BaseException as exc:  # SystemExit too: user code must not end us
            result["error"] = {
                "type": type(exc).__name__,
                "message": _safe_str(exc),
                "line": _error_line(exc),
            }
        finally:
            sys.settrace(None)

    # Checked after exec: user code may have caught StepLimitExceeded with a
    # bare `except:`, but the trace still stopped at the limit.
    if tracer.limit_hit:
        last_line = tracer.steps[-1]["line"] if tracer.steps else None
        result["error"] = {
            "type": "StepLimitExceeded",
            "message": f"stopped after {max_steps} steps",
            "line": last_line,
        }

    result["steps"] = tracer.steps
    result["line_counts"] = {
        str(line): count for line, count in sorted(tracer.line_counts.items())
    }
    result["stdout"] = stdout.getvalue()
    return result
