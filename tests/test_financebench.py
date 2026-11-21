import json
import tempfile
import unittest
import asyncio
from types import SimpleNamespace
from pathlib import Path

from x_models.id_x_009.src.services.financebench import (
    extract_numeric_answers,
    load_financebench_samples,
    score_financebench_numeric,
    evaluate_financebench_samples,
)


RECORD = {
    "sample_id": "FB-02987",
    "task": {"business_module": "资产与营运效率"},
    "model_input": {
        "prompt": "Calculate the fixed asset turnover ratio.",
        "context": [{"evidence_id": "E1", "text": "Revenue was 6,489."}],
    },
    "gold_reference": {
        "independently_recalculated_answer": "24.26",
        "absolute_tolerance": 0.01,
        "unit_note": "turns",
    },
}


class FinanceBenchTests(unittest.TestCase):
    def test_loader_keeps_gold_out_of_model_prompt(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "samples.json"
            path.write_text(json.dumps([RECORD]), encoding="utf-8")
            sample = load_financebench_samples(path)[0]
        self.assertEqual(sample.sample_id, "FB-02987")
        self.assertIn("Revenue was 6,489", sample.model_prompt())
        self.assertNotIn("24.26", sample.model_prompt())

    def test_numeric_scoring_uses_final_candidate_and_tolerance(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "samples.json"
            path.write_text(json.dumps([RECORD]), encoding="utf-8")
            sample = load_financebench_samples(path)[0]
        self.assertEqual(extract_numeric_answers("Average PP&E 267.5; result 24.26x"), [267.5, 24.26])
        result = score_financebench_numeric("The result is 6489 / 267.5 = 24.26x.", sample)
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["score"], 100.0)
        self.assertEqual(score_financebench_numeric("24.40", sample)["status"], "fail")
        self.assertNotIn(3.0, extract_numeric_answers("3M's quick ratio was 0.95"))
        threshold_result = score_financebench_numeric(
            "The ratio is 0.95, below the 1.0 threshold.", sample
        )
        self.assertEqual(threshold_result["answer_value"], 0.95)

    def test_numeric_scoring_accepts_published_rounding(self):
        rounded_record = {
            **RECORD,
            "gold_reference": {
                **RECORD["gold_reference"],
                "independently_recalculated_answer": "14%",
                "absolute_tolerance": 0.014,
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "samples.json"
            path.write_text(json.dumps([rounded_record]), encoding="utf-8")
            sample = load_financebench_samples(path)[0]
        result = score_financebench_numeric("14.5%", sample)
        self.assertEqual(result["status"], "pass")

    def test_evaluate_sends_prompt_and_evidence_but_not_gold(self):
        class FakeClient:
            def __init__(self):
                self.messages = None

            async def chat(self, *, model, messages, temperature, max_tokens):
                self.messages = messages
                return SimpleNamespace(
                    answer="24.26",
                    requested_model=model,
                    returned_model=model,
                    response_id="offline-response",
                    prompt_tokens=10,
                    completion_tokens=3,
                    total_tokens=13,
                    latency_ms=2.0,
                )

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "samples.json"
            path.write_text(json.dumps([RECORD]), encoding="utf-8")
            sample = load_financebench_samples(path)[0]
        client = FakeClient()
        result = asyncio.run(
            evaluate_financebench_samples(client, model="test-model", samples=[sample])
        )
        content = client.messages[0]["content"]
        self.assertIn("Revenue was 6,489", content)
        self.assertNotIn("24.26", content)
        self.assertEqual(result[0]["score"]["status"], "pass")


if __name__ == "__main__":
    unittest.main()
