import json
import textwrap

from app.tracer import MAX_ITEMS, serialize, trace_code


def run(source, **kwargs):
    result = trace_code(textwrap.dedent(source), **kwargs)
    json.dumps(result, allow_nan=False)  # must always be valid JSON
    return result


FIB = """\
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(4))
"""


def test_fibonacci_trace():
    result = run(FIB)

    assert result["error"] is None
    assert result["stdout"] == "3\n"
    # fib(4) makes 9 calls, 5 of them base cases.
    assert result["line_counts"] == {"1": 1, "2": 9, "3": 5, "4": 4, "6": 1}

    calls = [s for s in result["steps"] if s["event"] == "call"]
    assert len(calls) == 9
    assert calls[0] == {
        "line": 1, "event": "call", "func": "fib",
        "locals": {"n": 4}, "stack": ["<module>", "fib"],
    }
    deepest = max((s["stack"] for s in result["steps"]), key=len)
    assert deepest == ["<module>", "fib", "fib", "fib", "fib"]  # fib(4)..fib(1)

    returns = [s for s in result["steps"]
               if s["event"] == "return" and s["func"] == "fib"]
    assert returns[-1]["locals"] == {"n": 4}
    assert returns[-1]["return_value"] == 3


def test_first_step_is_first_line():
    result = run("x = 1\n")
    assert result["steps"][0]["event"] == "line"
    assert result["steps"][0]["line"] == 1
    assert result["steps"][-1]["event"] == "return"
    assert result["steps"][-1]["locals"] == {"x": 1}


def test_locals_are_snapshots():
    result = run("""\
        xs = []
        xs.append(1)
        xs.append(2)
        """)
    line_steps = [s for s in result["steps"] if s["event"] == "line"]
    # A "line" step shows state *before* that line runs.
    assert line_steps[1]["locals"]["xs"]["items"] == []
    assert line_steps[2]["locals"]["xs"]["items"] == [1]
    assert result["steps"][-1]["locals"]["xs"]["items"] == [1, 2]


def test_exception_reports_type_message_and_line():
    result = run("""\
        def div(a, b):
            return a / b

        div(1, 0)
        """)
    assert result["error"] == {
        "type": "ZeroDivisionError", "message": "division by zero", "line": 2,
    }
    exc_steps = [s for s in result["steps"] if s["event"] == "exception"]
    assert exc_steps[0]["func"] == "div"
    assert exc_steps[0]["exception"]["type"] == "ZeroDivisionError"


def test_syntax_error():
    result = run("x = = 1\n")
    assert result["steps"] == []
    assert result["error"]["type"] == "SyntaxError"
    assert result["error"]["line"] == 1


def test_step_limit_stops_infinite_loop():
    result = run("""\
        i = 0
        while True:
            i += 1
        """, max_steps=50)
    assert len(result["steps"]) == 50
    assert result["error"]["type"] == "StepLimitExceeded"


def test_step_limit_survives_bare_except():
    result = run("""\
        try:
            while True:
                pass
        except:
            pass
        x = 1
        """, max_steps=20)
    assert len(result["steps"]) == 20
    assert result["error"]["type"] == "StepLimitExceeded"


def test_system_exit_is_reported_not_raised():
    result = run("raise SystemExit(3)\n")
    assert result["error"]["type"] == "SystemExit"


def test_library_code_is_not_traced():
    result = run("""\
        import random
        random.seed(0)
        x = random.randint(1, 6)
        """)
    assert result["error"] is None
    assert {s["func"] for s in result["steps"]} == {"<module>"}


def test_serialize_native_values():
    assert serialize(None) is None
    assert serialize(True) is True
    assert serialize(42) == 42
    assert serialize(1.5) == 1.5
    assert serialize("hi") == "hi"


def test_serialize_containers():
    assert serialize([1, (2, 3)]) == {
        "type": "list",
        "items": [1, {"type": "tuple", "items": [2, 3], "truncated": False}],
        "truncated": False,
    }
    assert serialize({1: "a"}) == {
        "type": "dict", "items": [[1, "a"]], "truncated": False,
    }


def test_serialize_limits():
    big = serialize(list(range(MAX_ITEMS + 10)))
    assert len(big["items"]) == MAX_ITEMS
    assert big["truncated"] is True

    deep = serialize([[[[1]]]])
    assert deep["items"][0]["items"][0]["items"][0] == {
        "type": "list", "repr": "[...]",
    }

    cyclic = []
    cyclic.append(cyclic)
    json.dumps(serialize(cyclic))  # depth limit stops the recursion

    assert serialize("a" * 1000).endswith("...")


def test_serialize_values_json_cannot_hold():
    assert serialize(float("nan")) == {"type": "float", "repr": "nan"}
    assert serialize(2**60) == {"type": "int", "repr": str(2**60)}
    huge = serialize(10**5000)  # str() of this raises ValueError in 3.12
    assert huge["type"] == "int"


def test_serialize_custom_object_with_broken_repr():
    class Bad:
        def __repr__(self):
            raise RuntimeError("no")

    assert serialize(Bad()) == {"type": "Bad", "repr": "<Bad object>"}
