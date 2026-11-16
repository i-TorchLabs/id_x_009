# id_x_009 LLM adapter (V0.1)

## Scope

This module provides an asynchronous OpenAI-compatible Chat Completions client for the ChinaRouter gateway and an opt-in real evaluation path in `src/views/x_views.py`. The real path requires an approved sample schema, prompt contract, per-sample result persistence, and a scoring implementation.

The task runner now has an opt-in real mode behind `ID009_EVAL_MODE=real`. The default remains `simulated`. Real mode also requires `ID009_EVAL_SAMPLES_FILE`, `ID009_LLM_INPUT_COST_PER_1K_TOKENS`, and `ID009_LLM_OUTPUT_COST_PER_1K_TOKENS`. The sample file must be a JSON array with `sample_id`, `domain`, `prompt`, and optional `expected_answer`. All six platform domains must be represented before a task can be completed.

For an offline shape check, use `tests/fixtures/six_domain_smoke_samples.json`. It is a synthetic text-only fixture and does not represent an approved benchmark. Replace it with an approved public or de-identified dataset before enabling real evaluation.

The FinanceBench artifact uses a richer nested schema. The adapter in `src/services/financebench.py` reads `model_input.prompt` and evidence excerpts for the model, while keeping `gold_reference` and the scoring rubric out of the request. Its numeric scorer applies the audited absolute tolerance and returns sample-level telemetry. The platform persists each sample in `eval_sample_results` before writing the task summary.

The opt-in runner now accepts `ID009_EVAL_FORMAT=financebench`. It persists each response in `eval_sample_results` and writes the task summary to `eval_results`. The existing six-domain runner remains the default. FinanceBench task summaries populate the business score and leave unrelated domain scores at zero; compare them only with other FinanceBench tasks.

Example server-side settings with a placeholder price table are:

```dotenv
ID009_EVAL_MODE=simulated
ID009_EVAL_SAMPLES_FILE=/absolute/path/to/approved_samples.json
ID009_LLM_INPUT_COST_PER_1K_TOKENS=0
ID009_LLM_OUTPUT_COST_PER_1K_TOKENS=0
```

## Checked-in FinQA snapshot

The repository includes the 100-sample FinQA snapshot used by the
FinanceBench-compatible evaluation path:

```bash
cd /Users/gaoshengkai/Desktop/i-Core
python x_models/id_x_009/scripts/validate_finqa_snapshot.py
```

Use the checked-in snapshot when starting a local real evaluation service:

```dotenv
ID009_EVAL_FORMAT=financebench
ID009_EVAL_SAMPLES_FILE=/Users/gaoshengkai/Desktop/i-Core/x_models/id_x_009/data/finqa/finqa_test_100.json
```

The snapshot manifest pins the FinQA source revision, license, sample count
and SHA256 digest. The runner sends only `model_input` to the model and keeps
the gold reference for scoring.

## Endpoint contract

- Base URL: `https://apihk.chinarouter.net/v1` (provided by the project owner)
- Model discovery: `GET /v1/models`
- Text inference: `POST /v1/chat/completions`
- Authentication: `Authorization: Bearer <API_KEY>`

The public ChinaRouter OpenAI-compatible documentation describes `/v1/chat/completions`, model discovery via `/v1/models`, and Bearer authentication. The exact regional hostname and the account's model entitlements still require a live check using the authorized server-side key.

## Configuration

Set these variables in the server-side environment or secret manager:

```dotenv
ID009_LLM_BASE_URL=https://apihk.chinarouter.net/v1
ID009_LLM_API_KEY=<set outside source control>
ID009_LLM_TIMEOUT_SECONDS=120
ID009_LLM_MAX_RETRIES=0
ID009_LLM_TOKEN_PARAMETER=max_tokens
```

Do not put the real key in `.env.llm.example`, source code, SQL seed files, database model rows, browser JavaScript, screenshots, or Git. Keep the key only in the authorized server secret store/environment. The adapter never prints it. Retry defaults to zero to avoid an automatic duplicate paid inference after an ambiguous timeout.

## Install

From the i-Core project root, in the same Python environment used by the Litestar backend:

```bash
python -m pip install -r x_models/id_x_009/requirements-llm-adapter.txt
```

## Probe

From the i-Core project root, after configuring the environment variables:

```bash
python x_models/id_x_009/scripts/probe_llm_gateway.py
```

This performs only the model-list request. To make a billable inference smoke test, explicitly choose a text model and add `--chat`:

```bash
python x_models/id_x_009/scripts/probe_llm_gateway.py --model deepseek-v4-flash-0731 --chat
```

A model ID supplied by a user is a candidate, not proof of account access. The live `/v1/models` response is authoritative. Confirm exact spelling/case before registering a model.

## Adapter use

```python
from x_models.id_x_009.src.services.llm_client import OpenAICompatibleLLMClient

async with OpenAICompatibleLLMClient() as llm:
    result = await llm.chat(
        model="deepseek-v4-flash-0731",
        messages=[{"role": "user", "content": "..."}],
        temperature=0,
        max_tokens=2048,
    )
    print(result.answer)
    # Persist result.to_dict() after applying the platform's data-governance rules.
```

For a model that rejects `max_tokens`, set `ID009_LLM_TOKEN_PARAMETER=max_completion_tokens` after confirming its API contract. Do not automatically retry with a second parameter on arbitrary errors; inspect the specific error and test in a controlled task.

## Model catalog supplied for initial registration

The adjacent `model_catalog.json` records the IDs supplied for this project. Entries are marked `candidate_unverified`: the gateway may expose a subset depending on account permissions and may use different exact IDs. Query `/v1/models` before registering.

Image-generation-labelled Gemini/Nano Banana models are deliberately marked as image-generation candidates and excluded from the default text-only FinanceBench evaluation set. This adapter's `chat()` method is for text responses; image generation should use a separately designed image task adapter and scorer.

## Security and evaluation integrity

- Never send Gold answers, scoring rubrics, hidden references, or expert review notes in the model prompt.
- Keep API keys server-side; never expose them to Next.js/browser code.
- Persist requested model ID and returned model ID, request ID, prompt/completion/total tokens, finish reason, and latency for audit.
- Store the exact prompt template and inference hyperparameters in the task fingerprint.
- Use a small approved test sample first; verify billing, data residency, and school policy before sending any non-public source data to an external gateway.
- Real model scores require `ID009_EVAL_MODE=real`, `ID009_EVAL_FORMAT=financebench`, a validated snapshot path and a live gateway key. The default simulated mode remains available for UI demonstrations.
