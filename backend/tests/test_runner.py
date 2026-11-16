import textwrap

import pytest

from app import runner
from app.runner import make_safe_builtins, run_code


def run(source, **kwargs):
    return run_code(textwrap.dedent(source), **kwargs)


def test_recursive_function():
    result = run("""\
        def fact(n):
            return 1 if n <= 1 else n * fact(n - 1)
        print(fact(5))
        """)
    assert result["error"] is None
    assert result["stdout"] == "120\n"
    calls = [s for s in result["steps"] if s["event"] == "call"]
    assert [c["locals"]["n"] for c in calls] == [5, 4, 3, 2, 1]


def test_infinite_loop_stopped_by_step_limit():
    result = run("while True:\n    pass\n")
    assert result["error"]["type"] == "StepLimitExceeded"


def test_infinite_loop_hidden_from_tracer_hits_timeout():
    # The bare except swallows StepLimitExceeded; CPython then stops tracing,
    # so only the wall-clock timeout can end this loop.
    result = run("""\
        try:
            while True:
                pass
        except:
            pass
        while True:
            pass
        """, timeout=1)
    assert result["error"]["type"] == "Timeout"
    assert result["steps"] == []


def test_blocked_import_never_runs():
    result = run("import os\nos.system('echo hi')\n")
    assert result["error"]["type"] == "ForbiddenCode"
    assert result["error"]["line"] == 1
    assert result["error"]["violations"]
    assert result["steps"] == []


def test_exception_in_user_code():
    result = run("""\
        xs = [1, 2]
        print(xs[5])
        """)
    assert result["error"] == {
        "type": "IndexError", "message": "list index out of range", "line": 2,
    }


def test_output_flood_is_capped():
    result = run("while True:\n    print('x' * 1000)\n")
    assert result["error"]["type"] == "OutputLimitExceeded"
    assert len(result["stdout"]) == 10_000


def test_syntax_error():
    result = run("def f(:\n")
    assert result["error"]["type"] == "SyntaxError"
    assert result["error"]["line"] == 1


def test_classes_and_allowed_imports_work_with_restricted_builtins():
    result = run("""\
        import math
        from collections import Counter
        class P:
            def __init__(self, r):
                self.r = r
        try:
            raise ValueError("caught")
        except ValueError as e:
            msg = str(e)
        print(round(math.pi * P(1).r ** 2, 2), Counter("aab")["a"], msg)
        """)
    assert result["error"] is None
    assert result["stdout"] == "3.14 2 caught\n"


def test_dangerous_builtins_are_absent_at_runtime():
    safe = make_safe_builtins()
    for name in ("open", "eval", "exec", "compile", "getattr", "globals",
                 "locals", "vars", "input", "breakpoint", "help", "exit"):
        assert name not in safe


def test_runtime_import_backstop():
    import_ = make_safe_builtins()["__import__"]
    with pytest.raises(ImportError):
        import_("os")
    with pytest.raises(ImportError):
        import_("math", level=1)
    assert import_("math").sqrt(4) == 2


def test_runtime_layer_blocks_what_checker_missed(monkeypatch):
    # Simulate a checker bug: everything passes the static check.
    monkeypatch.setattr(runner, "check_code", lambda source: [])
    result = run("""\
        import os
        """)
    assert result["error"]["type"] == "ImportError"

    result = run("open('secret.txt')\n")
    assert result["error"] == {
        "type": "NameError", "message": "name 'open' is not defined", "line": 1,
    }


@pytest.mark.skipif(
    not hasattr(__import__("os"), "fork"), reason="resource module is Unix-only")
def test_memory_limit_on_unix():
    result = run("xs = [0] * (10 ** 9)\n")
    assert result["error"]["type"] in ("MemoryError", "Crashed")
