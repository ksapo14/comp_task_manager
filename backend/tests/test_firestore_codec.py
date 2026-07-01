from datetime import datetime, timezone

from app.firestore import decode_fields, encode_fields


def test_firestore_codec_round_trip():
    source = {
        "title": "Algorithms",
        "duration": 45,
        "complete": False,
        "course_id": None,
        "tags": ["graph", "exam"],
        "metadata": {"priority": "high"},
        "created_at": datetime(2026, 6, 30, 12, 0, tzinfo=timezone.utc),
    }
    decoded = decode_fields(encode_fields(source))
    assert decoded["title"] == source["title"]
    assert decoded["duration"] == 45
    assert decoded["tags"] == ["graph", "exam"]
    assert decoded["metadata"] == {"priority": "high"}
    assert decoded["created_at"].startswith("2026-06-30T12:00:00")
