import asyncio
import unittest
from types import SimpleNamespace

from x_models.id_x_009.src.services.evaluation_pipeline import (
    EvalSample,
    aggregate_scores,
    evaluate_samples,
    score_exact_match,
)


class FakeClient:
    async def chat(self, *, model, messages, temperature, max_tokens):
        return SimpleNamespace(
            answer="Paris",
            requested_model=model,
            returned_model=model,
            response_id="fake-response",
            finish_reason="stop",
            prompt_tokens=10,
            completion_tokens=2,
            total_tokens=12,
            latency_ms=1.5,
        )


class EvaluationPipelineTests(unittest.TestCase):
    def test_exact_match_normalizes_case_and_whitespace(self):
        self.assertEqual(score_exact_match("  PARIS\n", "paris"), 100.0)
        self.assertEqual(score_exact_match("London", "paris"), 0.0)
        self.assertIsNone(score_exact_match("Paris", None))

    def test_evaluate_samples_and_aggregate(self):
        samples = [
            EvalSample(
                sample_id="q1",
                domain="reasoning",
                prompt="What is the capital of France?",
                expected_answer="paris",
            ),
            EvalSample(
                sample_id="q2",
                domain="language",
                prompt="Give the answer.",
            ),
        ]
        evaluations = asyncio.run(
            evaluate_samples(FakeClient(), model="test-model", samples=samples)
        )
        self.assertEqual(len(evaluations), 2)
        self.assertEqual(evaluations[0].score, 100.0)
        self.assertIsNone(evaluations[1].score)
        aggregate = aggregate_scores(
            evaluations,
            {"reasoning": 0.3, "language": 0.2},
        )
        self.assertEqual(aggregate["domain_scores"], {"reasoning": 100.0})
        self.assertEqual(aggregate["composite_score"], 30.0)


if __name__ == "__main__":
    unittest.main()
