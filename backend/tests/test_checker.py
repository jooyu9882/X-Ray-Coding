import textwrap

import pytest

from app.checker import check_code


def check(source):
    return check_code(textwrap.dedent(source))


def assert_blocked(source, line=None):
    violations = check(source)
    assert violations, "expected the checker to reject this code"
    if line is not None:
        assert violations[0]["line"] == line
    return violations


# --- code that must keep working --------------------------------------------

ALLOWED = {
    "fibonacci": """\
        def fib(n):
            return n if n < 2 else fib(n - 1) + fib(n - 2)
        print(fib(10))
        """,
    "main guard": """\
        if __name__ == "__main__":
            print("hi")
        """,
    "class with super().__init__ and dunder methods": """\
        class Base:
            def __init__(self, x):
                self.x = x
        class Child(Base):
            def __init__(self, x):
                super().__init__(x)
            def __repr__(self):
                return f"Child({self.x})"
        print(Child(1))
        """,
    "allowed module usage": """\
        import math, random
        import collections as col
        from heapq import heappush, heappop
        from math import *
        random.seed(0)
        counts = col.Counter("hello")
        h = []
        heappush(h, 3)
        print(math.sqrt(16), sqrt(9), pi, heappop(h))
        """,
    "list.copy is not mistaken for the copy module": """\
        xs = [1, 2]
        ys = xs.copy()
        """,
    "dataclass and typing": """\
        from dataclasses import dataclass
        from typing import List
        @dataclass
        class P:
            xs: List[int]
        print(P([1]))
        """,
    "single underscore variable names": """\
        for _ in range(3):
            _total = 1
        """,
}


@pytest.mark.parametrize("source", ALLOWED.values(), ids=ALLOWED.keys())
def test_safe_code_passes(source):
    assert check(source) == []


# --- imports ----------------------------------------------------------------

@pytest.mark.parametrize("source", [
    "import os",
    "import sys",
    "import subprocess",
    "import collections.abc",
    "from os import system",
    "from . import x",
    "import math, os",
])
def test_blocked_import(source):
    violations = assert_blocked(source, line=1)
    assert "not allowed" in violations[0]["message"]


def test_blocked_import_inside_function():
    assert_blocked("""\
        def f():
            import os
        """, line=2)


# --- dangerous builtins and dunder names -------------------------------------

@pytest.mark.parametrize("name", [
    "eval", "exec", "open", "compile", "__import__",
    "getattr", "globals", "locals",
    "setattr", "delattr", "vars", "breakpoint",
])
def test_blocked_builtin_call(name):
    assert_blocked(f"{name}('x')")


def test_blocked_builtin_cannot_be_aliased():
    assert_blocked("e = eval\ne('1')", line=1)


def test_builtins_name_blocked():
    assert_blocked("__builtins__['eval']('1')")


# --- attribute access ---------------------------------------------------------

@pytest.mark.parametrize("source", [
    "().__class__.__bases__[0].__subclasses__()",
    "(lambda: 0).__globals__",
    "obj._private",
    "super().__class__",
])
def test_underscore_attributes_blocked(source):
    assert_blocked(source)


def test_match_class_keyword_attribute_blocked():
    assert_blocked("""\
        match 1:
            case object(__class__=c):
                pass
        """, line=2)


# --- known sandbox escapes through allowed modules -----------------------------
# Each of these ran os.getpid() in a plain interpreter before this checker.

ESCAPES = {
    "module leaks os": "import random\nrandom._os.system('ls')",
    "module leaks sys": "import typing\ntyping.sys.modules['os']",
    "module leaks sys (dataclasses)": "import dataclasses\ndataclasses.sys",
    "from-import of a leaked module": "from dataclasses import sys",
    "module stored in a variable": "import dataclasses\nm = dataclasses\nm.sys",
    "module passed to a function": "import random\nprint(random)",
    "module attribute overwritten": "import math\nmath.pi = 3",
    "generator frame globals": (
        "import heapq\n"
        "g = heapq.merge([1], [2])\n"
        "g.gi_frame.f_globals['__builtins__']['__import__']('os')"
    ),
    "string.Formatter.get_field": (
        "import string\n"
        "string.Formatter().get_field('0.__globals__', (1,), {})"
    ),
    "from string import Formatter": "from string import Formatter",
    "string import * brings Formatter": "from string import *",
    "typing.get_type_hints evals annotations": (
        "import typing\n"
        "def f(x: \"__import__('os')\"): pass\n"
        "typing.get_type_hints(f)"
    ),
}


@pytest.mark.parametrize("source", ESCAPES.values(), ids=ESCAPES.keys())
def test_known_escapes_blocked(source):
    assert_blocked(source)


# --- result format ------------------------------------------------------------

def test_reports_every_violation_sorted_by_line():
    violations = check("""\
        x = 1
        eval('1')
        import os
        """)
    assert [v["line"] for v in violations] == [2, 3]
    assert all(set(v) == {"line", "message"} for v in violations)


def test_syntax_error_is_reported():
    assert check("x = = 1") == [
        {"line": 1, "message": "SyntaxError: invalid syntax"},
    ]
