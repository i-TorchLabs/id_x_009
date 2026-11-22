import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest import mock

from x_models.id_x_009.src.services.llm_client import (
    LLMConfig,
    LLMConfigurationError,
    OpenAICompatibleLLMClient,
)


class FakeCompletions:
    def __init__(self):
        self.payload = None

    async def create(self, **kwargs):
        self.payload = kwargs
        return SimpleNamespace(
            id="chatcmpl-test",
            model="deepseek-v4-flash-0731",
            choices=[SimpleNamespace(
                message=SimpleNamespace(content="测试回答"),
                finish_reason="stop",
            )],
            usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5, total_tokens=15),
        )


class FakeModels:
    async def list(self):
        return SimpleNamespace(data=[SimpleNamespace(id="deepseek-v4-flash-0731")])


class FakeClient:
    def __init__(self):
        self.completions = FakeCompletions()
        self.chat = SimpleNamespace(completions=self.completions)
        self.models = FakeModels()

    async def close(self):
        return None


class LLMAdapterTests(unittest.TestCase):
    def setUp(self):
        self.config = LLMConfig(
            base_url="https://apihk.chinarouter.net/v1",
            api_key="unit-test-key-not-real",
        )
        self.fake = FakeClient()
        self.adapter = OpenAICompatibleLLMClient(self.config, client=self.fake)

    def test_chat_normalizes_response_and_usage(self):
        result = asyncio.run(self.adapter.chat(
            model="deepseek-v4-flash-0731",
            messages=[{"role": "user", "content": "测试"}],
            temperature=0,
            max_tokens=64,
        ))
        self.assertEqual(result.answer, "测试回答")
        self.assertEqual(result.total_tokens, 15)
        self.assertEqual(result.requested_model, "deepseek-v4-flash-0731")
        self.assertEqual(self.fake.completions.payload["max_tokens"], 64)
        self.assertFalse(self.fake.completions.payload["stream"])

    def test_list_models(self):
        models = asyncio.run(self.adapter.list_models())
        self.assertEqual(models, ["deepseek-v4-flash-0731"])

    def test_reasoning_content_is_used_when_content_is_empty(self):
        self.fake.completions.create = self._reasoning_response
        result = asyncio.run(self.adapter.chat(
            model="deepseek-v4.1-flash",
            messages=[{"role": "user", "content": "测试"}],
            max_tokens=64,
        ))
        self.assertEqual(result.answer, "reasoning answer")

    async def _reasoning_response(self, **kwargs):
        return SimpleNamespace(
            id="chatcmpl-reasoning",
            model="deepseek-v4.1-flash",
            choices=[SimpleNamespace(
                message=SimpleNamespace(content=None, reasoning_content="reasoning answer"),
                finish_reason="stop",
            )],
            usage=SimpleNamespace(prompt_tokens=1, completion_tokens=2, total_tokens=3),
        )

    def test_http_url_rejected_outside_localhost(self):
        with self.assertRaises(LLMConfigurationError):
            LLMConfig(base_url="http://example.com/v1", api_key="test")

    def test_loopback_rejected_by_default(self):
        with self.assertRaises(LLMConfigurationError):
            LLMConfig(base_url="http://127.0.0.1:8080/v1", api_key="test")

    def test_loopback_allowed_with_flag(self):
        with mock.patch.dict(os.environ, {"ID009_LLM_ALLOW_LOCALHOST": "1"}):
            cfg = LLMConfig(base_url="http://127.0.0.1:8080/v1", api_key="test")
            self.assertIn("127.0.0.1", cfg.base_url)


if __name__ == "__main__":
    unittest.main()
