"""Run user code safely: ast check, then trace in a limited subprocess.

run_code(source) is the only function the API needs. It never executes code
that failed checker.check_code, and it never executes user code in the
server process itself.

Layers (each one assumes the previous one can fail):
1. checker.check_code      - static ast allowlist
2. restricted __builtins__ - no open/eval/..., import limited to the allowlist
3. subprocess              - wall-clock timeout, killed if it runs too long
4. resource limits         - memory cap (Linux/macOS only)
5. tracer limits           - max steps, max stdout characters
"""

import json
import os
import subprocess
import sys

from app.checker import ALLOWED_MODULES, check_code

TIMEOUT_SECONDS = 3.0
MEMORY_LIMIT_BYTES = 256 * 1024 * 1024
MAX_RESULT_BYTES = 5 * 1024 * 1024  # size of the JSON the child sends back

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The child is started with -I (isolated mode): it ignores PYTHON* env vars,
# user site-packages, and the current directory. So the backend directory is
# added to sys.path explicitly, then the child entry point runs.
_CHILD_BOOTSTRAP = (
    "import sys; sys.path.insert(0, sys.argv[1]); "
    "from app.runner import child_main; child_main()"
)

# Builtins user code may use. Everything not listed (open, eval, exec,
# compile, getattr, globals, locals, vars, input, help, exit, ...) is absent.
_SAFE_BUILTIN_NAMES = [
    "abs", "all", "any", "ascii", "bin", "bool", "bytearray", "bytes",
    "callable", "chr", "classmethod", "complex", "dict", "divmod",
    "enumerate", "filter", "float", "format", "frozenset", "hasattr", "hash",
    "hex", "id", "int", "isinstance", "issubclass", "iter", "len", "list",
    "map", "max", "min", "next", "object", "oct", "ord", "pow", "print",
    "property", "range", "repr", "reversed", "round", "set", "slice",
    "sorted", "staticmethod", "str", "sum", "super", "tuple", "type", "zip",
    "Ellipsis", "NotImplemented",
    # Needed by the `class` statement itself.
    "__build_class__",
]


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    """__import__ replacement: allowlisted top-level modules only.

    The checker already rejects other imports. This is the runtime
    backstop in case something slips past the static check.
    """
    if level != 0 or name not in ALLOWED_MODULES:
        raise ImportError(f"import of '{name}' is not allowed")
    return __import__(name, globals, locals, fromlist, level)


def make_safe_builtins():
    import builtins

    safe = {name: getattr(builtins, name) for name in _SAFE_BUILTIN_NAMES}
    # Every exception class, so `except ValueError:` and `raise KeyError`
    # work as usual.
    for name, value in vars(builtins).items():
        if isinstance(value, type) and issubclass(value, BaseException):
            safe[name] = value
    safe["__import__"] = _safe_import
    return safe


def _limit_memory():
    """Cap the address space. Skipped where `resource` doesn't exist (Windows)."""
    try:
        import resource
    except ImportError:
        return
    try:
        resource.setrlimit(
            resource.RLIMIT_AS, (MEMORY_LIMIT_BYTES, MEMORY_LIMIT_BYTES))
    except (ValueError, OSError):
        pass  # some platforms (e.g. macOS) reject RLIMIT_AS; timeout still applies


def child_main():
    """Entry point inside the subprocess: source on stdin, JSON on stdout."""
    from app.tracer import trace_code

    source = sys.stdin.read()
    real_stdout = sys.stdout
    _limit_memory()
    result = trace_code(source, builtins=make_safe_builtins())
    real_stdout.write(json.dumps(result, allow_nan=False))
    real_stdout.flush()


def _error_result(error_type, message, line=None, **extra):
    error = {"type": error_type, "message": message, "line": line, **extra}
    return {"steps": [], "line_counts": {}, "stdout": "", "error": error}


def run_code(source, timeout=TIMEOUT_SECONDS):
    """Check, then trace `source` in a subprocess. Always returns a trace dict."""
    violations = check_code(source)
    if violations:
        first = violations[0]
        if first["message"].startswith("SyntaxError"):
            return _error_result(
                "SyntaxError", first["message"].removeprefix("SyntaxError: "),
                first["line"])
        return _error_result(
            "ForbiddenCode", first["message"], first["line"],
            violations=violations)

    try:
        proc = subprocess.run(
            [sys.executable, "-I", "-c", _CHILD_BOOTSTRAP, BACKEND_DIR],
            input=source.encode("utf-8"),
            capture_output=True,
            timeout=timeout,
            cwd=BACKEND_DIR,
        )
    except subprocess.TimeoutExpired:
        # subprocess.run kills the child before raising.
        return _error_result(
            "Timeout", f"execution took longer than {timeout:g} seconds")

    if proc.returncode != 0:
        # Killed by the memory limit, or crashed before writing a result.
        return _error_result(
            "Crashed", f"the program stopped unexpectedly (exit code {proc.returncode})")
    if len(proc.stdout) > MAX_RESULT_BYTES:
        return _error_result("TraceTooLarge", "the execution trace is too large")
    try:
        return json.loads(proc.stdout.decode("utf-8"))
    except ValueError:
        return _error_result("Crashed", "the program produced no valid trace")
