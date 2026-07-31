"""Tests for GET /api/doctor/rewrites/stats.

This endpoint had no coverage at all, and it is the one place where "how many
rewrites happened" and "how many distinct sentences were touched" must diverge:
doctor_rewrite_log's PK is (file, i, i2, time), so editing the same sentence
twice adds a row. Its per-file breakdown is also assembled from two queries —
the plain aggregates (count/min/max) cannot share a statement with a
multi-column distinct count — so the merge between them needs pinning down.
"""

from datetime import datetime, timedelta, timezone

import pytest_asyncio

from models import DoctorRewriteLog

BASE = datetime(2026, 7, 31, 9, 0, tzinfo=timezone.utc)


def _rewrite(file: str, i: int, i2: int, minutes: int, speaker: str = "Interviewer"):
    """One rewrite row. `minutes` varies the PK's time component."""
    return DoctorRewriteLog(
        file=file, i=i, i2=i2, speaker=speaker,
        original_sentence="Original.", revised_sentence="Revised.",
        score=0.4, class_="Cancer Prognosis",
        time=BASE + timedelta(minutes=minutes),
    )


@pytest_asyncio.fixture
async def rewrites(db):
    """5 rewrite rows over 2 files covering 3 distinct sentences.

    a.csv: sentence (1,1) edited three times, sentence (1,2) once -> 4 rows / 2 unique
    b.csv: sentence (7,3) edited once                             -> 1 row  / 1 unique
    """
    db.add_all([
        _rewrite("a.csv", 1, 1, 0),
        _rewrite("a.csv", 1, 1, 5),
        _rewrite("a.csv", 1, 1, 9),
        _rewrite("a.csv", 1, 2, 3),
        _rewrite("b.csv", 7, 3, 1, speaker="Doctor B"),
    ])
    await db.commit()
    return db


class TestRewriteStats:
    async def test_separates_attempts_from_distinct_sentences(self, client, rewrites, api_headers):
        res = await client.get("/api/doctor/rewrites/stats", headers=api_headers)
        assert res.status_code == 200
        body = res.json()
        assert body["total_rewrites"] == 5
        assert body["unique_sentences_rewritten"] == 3

    async def test_per_file_breakdown(self, client, rewrites, api_headers):
        """The two-query merge must line each file's unique count up with its row."""
        body = (await client.get("/api/doctor/rewrites/stats", headers=api_headers)).json()
        per_file = {r["file"]: r for r in body["per_file"]}
        assert set(per_file) == {"a.csv", "b.csv"}

        assert per_file["a.csv"]["rewrite_count"] == 4
        assert per_file["a.csv"]["unique_sentences"] == 2
        assert per_file["b.csv"]["rewrite_count"] == 1
        assert per_file["b.csv"]["unique_sentences"] == 1

    async def test_per_file_timestamps(self, client, rewrites, api_headers):
        """min/max come from the aggregate query, not the DISTINCT subquery."""
        body = (await client.get("/api/doctor/rewrites/stats", headers=api_headers)).json()
        a = next(r for r in body["per_file"] if r["file"] == "a.csv")
        assert a["first_rewrite"].startswith("2026-07-31T09:00")
        assert a["last_rewrite"].startswith("2026-07-31T09:09")

    async def test_speaker_filter_applies_to_both_queries(self, client, rewrites, api_headers):
        """A filter that reached only the aggregate query would leave b.csv's unique
        count attached to a file that is no longer in the result."""
        body = (await client.get(
            "/api/doctor/rewrites/stats?speaker=Doctor%20B", headers=api_headers
        )).json()
        assert body["total_rewrites"] == 1
        assert body["unique_sentences_rewritten"] == 1
        assert [r["file"] for r in body["per_file"]] == ["b.csv"]
        assert body["per_file"][0]["unique_sentences"] == 1

    async def test_empty_table(self, client, db, api_headers):
        body = (await client.get("/api/doctor/rewrites/stats", headers=api_headers)).json()
        assert body["total_rewrites"] == 0
        assert body["unique_sentences_rewritten"] == 0
        assert body["per_file"] == []
