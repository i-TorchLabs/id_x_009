import unittest

from x_models.id_x_009.src.services.qualitative import score_fact_match


class QualitativeScorerTests(unittest.TestCase):
    def test_matches_required_region_fact(self):
        result = score_fact_match(
            "Las Vegas Strip Resorts had the highest EBITDAR contribution.",
            ["las vegas", "highest EBITDAR contribution"],
        )
        self.assertEqual(result["status"], "pass")

    def test_rejects_missing_fact(self):
        result = score_fact_match("MGM's regional contribution was highest.", ["las vegas"])
        self.assertEqual(result["status"], "fail")


if __name__ == "__main__":
    unittest.main()
