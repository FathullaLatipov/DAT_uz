import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

import closure_tracking as ct

NOW = 1_800_000_000.0


class TrackTests(unittest.TestCase):
    def test_tracks_and_forgets_old(self):
        tr: dict = {}
        ct.track(tr, "g", 1, NOW - 50 * 3600, now=NOW)  # older than 48 h: dropped at once
        self.assertFalse(ct.is_tracked(tr, "g", 1))
        ct.track(tr, "g", 2, NOW - 3600, now=NOW)
        self.assertTrue(ct.is_tracked(tr, "g", 2))

    def test_cap_keeps_the_newest(self):
        tr: dict = {}
        for i in range(10):
            ct.track(tr, "g", i, NOW - 1000 + i, cap=3, now=NOW)
        self.assertEqual(sorted(tr["g"], key=int), ["7", "8", "9"])

    def test_untrack_removes_empty_groups(self):
        tr: dict = {}
        ct.track(tr, "g", 5, NOW, now=NOW)
        ct.untrack(tr, "g", 5)
        self.assertEqual(tr, {})

    def test_recheck_due(self):
        self.assertTrue(ct.recheck_due({}, "g", now=NOW))
        self.assertFalse(ct.recheck_due({"g": NOW - 60}, "g", every_min=20, now=NOW))
        self.assertTrue(ct.recheck_due({"g": NOW - 21 * 60}, "g", every_min=20, now=NOW))


class ClassifyTests(unittest.TestCase):
    def test_deleted(self):
        self.assertEqual(ct.classify(1, None, 0)[0], "deleted")
        empty = type("MessageEmpty", (), {})()
        self.assertEqual(ct.classify(1, empty, 0)[0], "deleted")

    def test_edited_only_when_newer_than_known(self):
        edit = datetime.fromtimestamp(NOW, tz=timezone.utc)
        msg = SimpleNamespace(date=edit, edit_date=edit, message="ЗАКРЫТО")
        self.assertEqual(ct.classify(1, msg, 0), ("edited", "ЗАКРЫТО"))
        self.assertEqual(ct.classify(1, msg, NOW), ("same", None))

    def test_untouched(self):
        msg = SimpleNamespace(date=datetime.fromtimestamp(NOW, tz=timezone.utc), edit_date=None, message="Ташкент - Алматы")
        self.assertEqual(ct.classify(1, msg, 0), ("same", None))


if __name__ == "__main__":
    unittest.main()
