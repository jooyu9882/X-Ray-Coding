"""Reject unsafe user code with a static `ast` check before it runs.

check_code(source) returns a list of violations, each {"line", "message"}.
An empty list means the code passed.

Rules:
1. Imports: only modules in ALLOWED_MODULES, no relative imports.
2. Imported modules are read-only namespaces. They can only be used as
   `module.name`, and `name` must be a public, non-module attribute. This
   blocks leaks like `random._os` or `typing.sys`. A module object can never
   be stored in a variable, so it can't be smuggled past this rule.
3. Dangerous builtins (eval, exec, open, getattr, ...) can't be named at all.
4. No attribute starting with "_" except `__init__` (for super().__init__),
   and none of the frame/generator attributes that lead to a module's globals.
5. No dunder names except `__name__` (blocks `__builtins__`, `__import__`).

This is one layer. The runner adds restricted builtins and a subprocess with
limits. Static checks alone are not full isolation.
"""

import ast
import importlib
import types

ALLOWED_MODULES = frozenset({
    "math", "random", "collections", "itertools", "functools", "heapq",
    "bisect", "string", "re", "dataclasses", "typing",
})

BLOCKED_NAMES = frozenset({
    "eval", "exec", "open", "compile", "__import__",
    "getattr", "globals", "locals",
    # Same risk as the ones above:
    "setattr", "delattr",  # write side of getattr, bypasses the "_" rule
    "vars",                # vars(module)["sys"] reads module internals
    "breakpoint",          # starts pdb, which runs arbitrary statements
})

# Public names (no "_") that reach a frame, and from there a module's
# globals and real __builtins__. Example:
#   heapq.merge([], []).gi_frame.f_globals["__builtins__"]["__import__"]
BLOCKED_ATTRS = frozenset({
    "gi_frame", "gi_code", "gi_yieldfrom",
    "cr_frame", "cr_code", "cr_await",
    "ag_frame", "ag_code", "ag_await",
    "f_globals", "f_locals", "f_builtins", "f_back", "f_code",
    "tb_frame", "tb_next",
})

ALLOWED_DUNDER_ATTRS = frozenset({"__init__"})
ALLOWED_DUNDER_NAMES = frozenset({"__name__"})

# Public, non-module attributes of allowed modules that still act like
# getattr or eval.
BLOCKED_MODULE_ATTRS = {
    # Formatter().get_field("0.__globals__", ...) returns any attribute.
    "string": {"Formatter"},
    # Evaluate string annotations with eval(): def f(x: "<any code>").
    "typing": {"get_type_hints", "ForwardRef"},
}


def _public_attrs(module_name):
    """Names user code may read from an allowed module."""
    module = importlib.import_module(module_name)
    blocked = BLOCKED_MODULE_ATTRS.get(module_name, set())
    return frozenset(
        name for name, value in vars(module).items()
        if not name.startswith("_")
        and not isinstance(value, types.ModuleType)  # random._os, typing.sys
        and name not in blocked
    )


def _star_names(module_name):
    module = importlib.import_module(module_name)
    names = getattr(module, "__all__", None)
    if names is None:
        names = [n for n in vars(module) if not n.startswith("_")]
    return frozenset(names)


MODULE_ATTRS = {name: _public_attrs(name) for name in ALLOWED_MODULES}
# `from m import *` is allowed only if it brings in nothing blocked.
STAR_IMPORT_OK = frozenset(
    name for name in ALLOWED_MODULES
    if _star_names(name) <= MODULE_ATTRS[name]
)


def _is_dunder(name):
    return name.startswith("__") and name.endswith("__")


class _Checker(ast.NodeVisitor):
    def __init__(self, module_aliases):
        self.module_aliases = module_aliases  # local name -> module name
        self.violations = []

    def report(self, node, message):
        self.violations.append({"line": node.lineno, "message": message})

    # --- imports ---------------------------------------------------------

    def visit_Import(self, node):
        for alias in node.names:
            if alias.name not in ALLOWED_MODULES:
                self.report(node, f"import of '{alias.name}' is not allowed")

    def visit_ImportFrom(self, node):
        module = node.module or ""
        if node.level > 0:
            self.report(node, "relative imports are not allowed")
            return
        if module not in ALLOWED_MODULES:
            self.report(node, f"import of '{module}' is not allowed")
            return
        for alias in node.names:
            if alias.name == "*":
                if module not in STAR_IMPORT_OK:
                    self.report(node, f"'from {module} import *' is not allowed")
            elif alias.name not in MODULE_ATTRS[module]:
                self.report(
                    node, f"'{alias.name}' from '{module}' is not allowed")

    # --- names -----------------------------------------------------------

    def visit_Name(self, node):
        if node.id in self.module_aliases:
            self.report(
                node,
                f"module '{node.id}' can only be used as '{node.id}.name'")
        elif node.id in BLOCKED_NAMES:
            self.report(node, f"'{node.id}' is not allowed")
        elif _is_dunder(node.id) and node.id not in ALLOWED_DUNDER_NAMES:
            self.report(node, f"name '{node.id}' is not allowed")

    # --- attributes ------------------------------------------------------

    def _check_attr_name(self, node, attr):
        if attr in ALLOWED_DUNDER_ATTRS:
            return
        if attr.startswith("_") or attr in BLOCKED_ATTRS:
            self.report(node, f"attribute '{attr}' is not allowed")

    def visit_Attribute(self, node):
        base = node.value
        if isinstance(base, ast.Name) and base.id in self.module_aliases:
            module = self.module_aliases[base.id]
            if not isinstance(node.ctx, ast.Load):
                self.report(node, f"module '{base.id}' is read-only")
            elif node.attr not in MODULE_ATTRS[module]:
                self.report(node, f"'{base.id}.{node.attr}' is not allowed")
            return  # the module name itself is fine in this position
        self._check_attr_name(node, node.attr)
        self.generic_visit(node)

    def visit_MatchClass(self, node):
        # `case object(__class__=c)` reads an attribute without ast.Attribute.
        for attr in node.kwd_attrs:
            self._check_attr_name(node, attr)
        self.generic_visit(node)


def _module_aliases(tree):
    """Map every name bound by `import m` / `import m as x` to its module.

    Collected for the whole file up front, regardless of scope. This is
    conservative: a later variable with the same name is also restricted.
    """
    aliases = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in ALLOWED_MODULES:
                    aliases[alias.asname or alias.name] = alias.name
    return aliases


def check_code(source):
    """Return a list of {"line", "message"} violations, sorted by line."""
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return [{"line": exc.lineno, "message": f"SyntaxError: {exc.msg}"}]

    checker = _Checker(_module_aliases(tree))
    checker.visit(tree)
    return sorted(checker.violations, key=lambda v: v["line"])
