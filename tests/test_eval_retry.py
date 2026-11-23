import asyncio
import unittest
from types import SimpleNamespace
from unittest import mock

from x_models.id_x_009.src.services.eval_retry import (
    chat_with_sample_retries,
    classify_sample_error_status,
    continue_on_sample_error,
    is_transient_llm_error,
)
from x_models.id_x_009.src.services.evaluation_pipeline import (
    EvalSample,
    evaluate_samples,
)
from x_models.id_x_009.src.services.llm_client import LLMProviderError


class FlakyClient:
    def __init__(self, failures: int, *, error: Exception | None = None):
        self.failures = failures
        self.calls = 0
        self.error = error or LLMProviderError(
            "模型请求失败（APITimeoutError, HTTP unknown）：Request timed out."
        )

    async def chat(self, *, model, messages, temperature, max_tokens):
        self.calls += 1
        if self.calls <= self.failures:
            raise self.error
        return SimpleNamespace(
            answer="Paris",
            requested_model=model,
            returned_model=model,
            response_id="ok",
            finish_reason="stop",
            prompt_tokens=3,
            completion_tokens=1,
            total_tokens=4,
            latency_ms=1.0,
        )


class EvalRetryTests(unittest.TestCase):
    def test_timeout_is_transient(self):
        exc = LLMProviderError(
            "模型请求失败（APITimeoutError, HTTP unknown）：Request timed out."
        )
        self.assertTrue(is_transient_llm_error(exc))
        self.assertEqual(classify_sample_error_status(exc), "timeout")

    def test_chat_with_sample_retries_recovers(self):
        client = FlakyClient(failures=2)
        with mock.patch(
            "x_models.id_x_009.src.services.eval_retry.sample_retry_backoff_seconds",
            return_value=0.0,
        ):
            result = asyncio.run(
                chat_with_sample_retries(
                    client,
                    model="m",
                    messages=[{"role": "user", "content": "q"}],
                    sample_id="s1",
                    max_retries=2,
                    backoff_seconds=0.0,
                )
            )
        self.assertEqual(result.answer, "Paris")
        self.assertEqual(client.calls, 3)

    def test_evaluate_samples_continues_after_exhausted_retries(self):
        client = FlakyClient(failures=99)
        sample = EvalSample(
            sample_id="q1",
            domain="reasoning",
            prompt="Capital?",
            expected_answer="paris",
        )
        with mock.patch.dict(
            "os.environ",
            {
                "ID009_EVAL_SAMPLE_MAX_RETRIES": "1",
                "ID009_EVAL_SAMPLE_RETRY_BACKOFF_SECONDS": "0",
                "ID009_EVAL_CONTINUE_ON_SAMPLE_ERROR": "true",
            },
            clear=False,
        ):
            evaluations = asyncio.run(
                evaluate_samples(client, model="m", samples=[sample])
            )
        self.assertEqual(len(evaluations), 1)
        self.assertEqual(evaluations[0].score_status, "timeout")
        self.assertIsNone(evaluations[0].score)
        self.assertGreaterEqual(client.calls, 2)

    def test_evaluate_samples_aborts_when_continue_disabled(self):
        client = FlakyClient(failures=99)
        sample = EvalSample(
            sample_id="q1",
            domain="reasoning",
            prompt="Capital?",
            expected_answer="paris",
        )
        with mock.patch.dict(
            "os.environ",
            {
                "ID009_EVAL_SAMPLE_MAX_RETRIES": "0",
                "ID009_EVAL_CONTINUE_ON_SAMPLE_ERROR": "false",
            },
            clear=False,
        ):
            with self.assertRaises(LLMProviderError):
                asyncio.run(evaluate_samples(client, model="m", samples=[sample]))

    def test_continue_on_sample_error_default_true(self):
        import os

        with mock.patch.dict("os.environ"):
            os.environ.pop("ID009_EVAL_CONTINUE_ON_SAMPLE_ERROR", None)
            self.assertTrue(continue_on_sample_error())


if __name__ == "__main__":
    unittest.main()
