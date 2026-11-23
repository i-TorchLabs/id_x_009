# id_x_009 LLM adapter (V0.2)

## Scope

异步 OpenAI 兼容 Chat Completions 客户端（ChinaRouter 网关）与**真实评测**任务执行路径。

默认 `ID009_EVAL_MODE=real`。`simulated` / 虚拟画像评测已禁用。

成本测算默认从数据库 **模型信息表** `models_info` 读取单价（容器初始化由 `ops/init/02_seed.sql` 预置）。若设置了非零的 `ID009_LLM_*_COST_PER_1K_TOKENS` 则全局覆盖。`data/pricing/*.json` 仅作离线脚本回退。

评测样本优先级：任务勾选的 `dataset_samples`（六能力域真实评分）→ 仅当库内无样本时才回退 `ID009_EVAL_FORMAT`。
FinanceBench（默认回退格式）使用 `data/finqa/finqa_test_100.json`，且只写业务专项分；未配置 `ID009_EVAL_SAMPLES_FILE` 时自动回落该路径。

## 推荐环境变量

```dotenv
ID009_LLM_BASE_URL=https://apihk.chinarouter.net/v1
ID009_LLM_API_KEY=<set outside source control>
ID009_LLM_TIMEOUT_SECONDS=300
ID009_LLM_MAX_RETRIES=0
ID009_LLM_TOKEN_PARAMETER=max_tokens
ID009_LLM_INPUT_COST_PER_1K_TOKENS=0
ID009_LLM_OUTPUT_COST_PER_1K_TOKENS=0
ID009_EVAL_MODE=real
# 仅在任务无 dataset_samples 时回退；有库内样本时六域优先
ID009_EVAL_FORMAT=financebench
# 可选；financebench 默认使用模块内 FinQA 快照
# ID009_EVAL_SAMPLES_FILE=/app/i-Core/x_models/id_x_009/data/finqa/finqa_test_100.json
# 样本级重试：超时/连接/429/5xx 自动重试；耗尽后默认跳过该样本继续任务
ID009_EVAL_SAMPLE_MAX_RETRIES=2
ID009_EVAL_SAMPLE_RETRY_BACKOFF_SECONDS=2
ID009_EVAL_CONTINUE_ON_SAMPLE_ERROR=true
```

### UPSTREAM_TIMEOUT

单条样本上游超时会分类为 `UPSTREAM_TIMEOUT`。旧行为是**整任务 Failed**；现默认：

1. 每样本最多重试 `ID009_EVAL_SAMPLE_MAX_RETRIES` 次（指数退避）；
2. 仍失败则将该样本记为 `score_status=timeout` 并继续后续样本；
3. 综合分只统计成功拿到模型回复的样本（上游失败不计入模型能力分）。

若希望「任一超时即失败」，设 `ID009_EVAL_CONTINUE_ON_SAMPLE_ERROR=false`。SDK 的 `ID009_LLM_MAX_RETRIES` 仍建议保持 `0`，避免与样本级重试叠加导致重复计费。

可用模型清单、Base-Url、API-Key、Model-Name 与单价均见统一表 `models_info`。`02_seed.sql` 写入演示账号、数据集与模型信息，**不含**虚拟评测结果。

## Checked-in FinQA snapshot

```bash
python x_models/id_x_009/scripts/validate_finqa_snapshot.py
```

## Endpoint contract

- Base URL: `https://apihk.chinarouter.net/v1`
- Model discovery: `GET /v1/models`
- Text inference: `POST /v1/chat/completions`
- Authentication: `Authorization: Bearer <API_KEY>`

## Install / Probe

```bash
python -m pip install -r x_models/id_x_009/requirements-llm-adapter.txt
python x_models/id_x_009/scripts/probe_llm_gateway.py
python x_models/id_x_009/scripts/probe_llm_gateway.py --model deepseek-v4-flash-0731 --chat
```

## Model catalog

`model_catalog.json` 记录网关候选 ID。注册前以 `GET /v1/models` 为准。图像生成类 Gemini/Nano Banana 不进入默认 FinanceBench 文本评测集。

## Security and evaluation integrity

- 不要把 Gold / 评分细则放进模型 prompt。
- API Key 仅服务端；勿写入源码、种子 SQL、前端。
- 持久化请求/返回模型 ID、token、latency，供审计。
- 图谱数据仅来自真实 `eval_results`；清空旧模拟种子后再跑任务。
