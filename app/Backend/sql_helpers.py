"""Dialect-portable SQL building blocks.

Why this module exists
    Production runs PostgreSQL 16, but the test suite runs in-memory SQLite
    (``tests/conftest.py``) so it needs no Docker. Routes that reached for
    PostgreSQL-only functions through ``func.*`` were therefore impossible to
    test: SQLAlchemy renders those names verbatim, and SQLite rejects them at
    execution time ("no such function: concat"). The queries were correct in
    production and permanently red in CI, which is the worst combination — a
    failing suite everyone learns to ignore.

    Most of those cases were fixed by rewriting the query in standard SQL: a
    multi-column ``COUNT(DISTINCT ...)`` becomes a ``SELECT DISTINCT`` subquery
    whose rows are counted, which needs no helper at all. String aggregation is
    the one that cannot be expressed portably — PostgreSQL spells it
    ``string_agg`` and SQLite spells it ``group_concat`` — so it lives here.
"""

from typing import Any

from sqlalchemy import String
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement


class _StringAgg(FunctionElement):
    """Aggregate a column's values into one separated string.

    Built as a custom construct rather than ``func.string_agg`` so the SQLite
    rendering can differ — see the compilers below for the DISTINCT wrinkle.
    """

    name = "string_agg"
    type = String()
    inherit_cache = True

    def __init__(self, expr: Any, separator: str, distinct: bool):
        self.separator = separator
        self.distinct = distinct
        super().__init__(expr)


@compiles(_StringAgg)
def _compile_string_agg(element: _StringAgg, compiler, **kw) -> str:
    """PostgreSQL (and the generic default): string_agg([DISTINCT] expr, sep)."""
    inner = compiler.process(list(element.clauses)[0], **kw)
    prefix = "DISTINCT " if element.distinct else ""
    separator = compiler.render_literal_value(element.separator, String())
    return f"string_agg({prefix}{inner}, {separator})"


@compiles(_StringAgg, "sqlite")
def _compile_string_agg_sqlite(element: _StringAgg, compiler, **kw) -> str:
    """SQLite: group_concat(...).

    SQLite accepts ``group_concat(X)``, ``group_concat(X, sep)`` and
    ``group_concat(DISTINCT X)`` — but NOT ``group_concat(DISTINCT X, sep)``,
    which is a syntax error. Its implicit separator is already ``,``, so the
    distinct form simply drops the argument; any other separator is refused
    rather than silently replaced with a comma.
    """
    inner = compiler.process(list(element.clauses)[0], **kw)
    if element.distinct:
        if element.separator != ",":
            raise ValueError(
                "SQLite cannot combine DISTINCT with a custom separator in "
                f"group_concat(); got {element.separator!r}."
            )
        return f"group_concat(DISTINCT {inner})"
    separator = compiler.render_literal_value(element.separator, String())
    return f"group_concat({inner}, {separator})"


def string_agg(expr: Any, separator: str = ",", *, distinct: bool = False) -> _StringAgg:
    """Aggregate ``expr`` into one ``separator``-joined string.

    ``distinct`` is an explicit flag rather than a ``func.distinct(...)`` wrapped
    around ``expr`` because SQLite has to render DISTINCT differently (it cannot
    take a separator alongside it), and the compiler cannot reliably detect a
    DISTINCT buried inside an arbitrary expression.
    """
    return _StringAgg(expr, separator, distinct)
