"""Tests for the dialect-portable string_agg helper.

This exists because the route using it (routes_track_doctor.list_sessions) was
previously untestable: it called PostgreSQL's string_agg, which the SQLite test
engine rejects at execution time. Each behaviour is checked twice — that it
produces the right values when actually run on SQLite, and that it still renders
the PostgreSQL spelling — so a regression to a PG-only rendering fails here
instead of going unnoticed until production.
"""

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql, sqlite

from models import DoctorBehavior
from sql_helpers import string_agg

TS = datetime(2026, 7, 31, 12, 0, tzinfo=timezone.utc)


@pytest_asyncio.fixture
async def behaviors(db):
    """Three events over two sessions, with a repeated speaker and a NULL file."""
    db.add_all([
        DoctorBehavior(session_id="s1", speaker="doc-a", file="f1.csv",
                       event_type="click", client_timestamp=TS, event_metadata={}),
        DoctorBehavior(session_id="s1", speaker="doc-a", file="f2.csv",
                       event_type="click", client_timestamp=TS, event_metadata={}),
        DoctorBehavior(session_id="s2", speaker="doc-b", file=None,
                       event_type="click", client_timestamp=TS, event_metadata={}),
    ])
    await db.commit()
    return db


class TestStringAggValues:
    async def test_joins_every_value(self, behaviors):
        result = await behaviors.execute(select(string_agg(DoctorBehavior.speaker, ",")))
        assert sorted(result.scalar().split(",")) == ["doc-a", "doc-a", "doc-b"]

    async def test_distinct_deduplicates(self, behaviors):
        result = await behaviors.execute(
            select(string_agg(DoctorBehavior.speaker, ",", distinct=True))
        )
        assert sorted(result.scalar().split(",")) == ["doc-a", "doc-b"]

    async def test_grouped_per_session(self, behaviors):
        """The shape list_sessions actually uses: one aggregated row per session."""
        rows = (await behaviors.execute(
            select(
                DoctorBehavior.session_id,
                string_agg(
                    func.coalesce(DoctorBehavior.file, ""), ",", distinct=True
                ).label("files_csv"),
            ).group_by(DoctorBehavior.session_id).order_by(DoctorBehavior.session_id)
        )).all()
        assert [r.session_id for r in rows] == ["s1", "s2"]
        assert sorted(rows[0].files_csv.split(",")) == ["f1.csv", "f2.csv"]
        assert rows[1].files_csv == ""  # coalesce turned the NULL file into ""


class TestStringAggRendering:
    def test_renders_string_agg_for_postgresql(self):
        sql = str(
            select(string_agg(DoctorBehavior.speaker, ",", distinct=True))
            .compile(dialect=postgresql.dialect())
        )
        assert "string_agg(DISTINCT" in sql

    def test_renders_group_concat_for_sqlite(self):
        """SQLite rejects group_concat(DISTINCT x, sep), so the separator drops."""
        sql = str(
            select(string_agg(DoctorBehavior.speaker, ",", distinct=True))
            .compile(dialect=sqlite.dialect())
        )
        assert "group_concat(DISTINCT" in sql
        inner = sql.split("group_concat(DISTINCT")[1].split(")")[0]
        assert "," not in inner

    def test_non_distinct_keeps_the_separator_on_both_dialects(self):
        for dialect in (postgresql.dialect(), sqlite.dialect()):
            sql = str(select(string_agg(DoctorBehavior.speaker, "|")).compile(dialect=dialect))
            assert "'|'" in sql

    def test_sqlite_refuses_distinct_with_custom_separator(self):
        """Fail loudly rather than silently emitting ',' where '|' was asked for."""
        with pytest.raises(ValueError, match="custom separator"):
            str(
                select(string_agg(DoctorBehavior.speaker, "|", distinct=True))
                .compile(dialect=sqlite.dialect())
            )
