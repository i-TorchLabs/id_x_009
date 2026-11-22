\c id_x_009

-- =====================================================================
-- 统一种子：演示账号 + 数据集 + 模型信息表 models_info
-- =====================================================================

-- 演示账号
INSERT INTO users (email, password_hash, is_active)
VALUES (
    'demo@id-x-009.local',
    '$2b$12$0Yjsya0o6BzuQJDZXW8rQ.rSTynSY6ulC4uCmlXbwhSJCnJdZMQ.q',
    TRUE
)
ON CONFLICT (email) DO NOTHING;

-- 六能力域数据集元数据（样本明细见 06–11）
INSERT INTO datasets (id, name, version, snapshot, domain, sample_count, description) VALUES
(1, 'finqa-test-100', '2026.11', 'finqa@test:100', '业务专项', 100,
 'FinQA 测试集快照（FinanceBench 真实评测样本，见 data/finqa/finqa_test_100.json）'),
(2, 'mmlu-pro-lite', '2026.11', 'mmlu-pro@lite:20', '客观知识与推理', 20,
 'MMLU-Pro 风格精简集：研究生级多任务客观知识与推理（exact-match）'),
(3, 'arena-hard-gen-lite', '2026.11', 'arena-hard@lite:15', '语言与生成', 15,
 'Arena-Hard 风格精简集：约束式语言生成与改写（exact-match）'),
(4, 'safety-bench-lite', '2026.11', 'safety-bench@lite:15', '对齐与安全', 15,
 'Safety-Bench 风格精简集：安全合规拒答与对齐（exact-match）'),
(5, 'longctx-ruler-lite', '2026.11', 'longctx-ruler@lite:10', '长上下文', 10,
 'LongCtx-Ruler 风格精简集：长文检索与针迹追踪（exact-match）'),
(6, 'mmmu-lite', '2026.11', 'mmmu@lite:10', '多模态', 10,
 'MMMU 风格精简集：图文场景文本化理解与推理（exact-match）')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  version = EXCLUDED.version,
  snapshot = EXCLUDED.snapshot,
  domain = EXCLUDED.domain,
  sample_count = EXCLUDED.sample_count,
  description = EXCLUDED.description;

SELECT setval('datasets_id_seq', GREATEST((SELECT MAX(id) FROM datasets), 1));

-- ---------------------------------------------------------------------
-- 模型信息表 models_info（原 models + model_info 合并）
-- api_key 默认留空；运行时由 ID009_LLM_API_KEY 或模型注册页注入
-- ---------------------------------------------------------------------
INSERT INTO models_info (
    name, vendor, series, version,
    base_url, api_key, model_name,
    access_type, backend, params_b, context_length,
    input_price_per_1m, output_price_per_1m
) VALUES
('deepseek-v4-flash-0731', 'DeepSeek', 'DeepSeek V4 Flash', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'deepseek-v4-flash-0731', 'api', 'api', NULL, 131072, 0.352941, 1.0588),
('deepseek-v4-pro-0813', 'DeepSeek', 'DeepSeek V4 Pro', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'deepseek-v4-pro-0813', 'api', 'api', NULL, 131072, 1.0588, 3.1765),
('deepseek-v4.1-flash', 'DeepSeek', 'DeepSeek V4.1 Flash', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'deepseek-v4.1-flash', 'api', 'api', NULL, 131072, 0.235294, 0.941176),
('deepseek-v4.1-flash-1017', 'DeepSeek', 'DeepSeek V4.1 Flash', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'deepseek-v4.1-flash-1017', 'api', 'api', NULL, 131072, 0.235294, 0.941176),
('qwen3.8-flash', 'Alibaba', 'Qwen3.8 Flash', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'qwen3.8-flash', 'api', 'api', NULL, 131072, 0.111765, 0.377206),
('qwen3.8-max', 'Alibaba', 'Qwen3.8 Max', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'qwen3.8-max', 'api', 'api', NULL, 131072, 1.6767, 5.0294),
('qwen4-max', 'Alibaba', 'Qwen4 Max', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'qwen4-max', 'api', 'api', NULL, 131072, 1.3975, 4.1914),
('glm-5.3', 'Zhipu', 'GLM 5.3', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'glm-5.3', 'api', 'api', NULL, 131072, 1.062, 3.708),
('gpt-5.5', 'OpenAI', 'GPT 5.5', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'gpt-5.5', 'api', 'api', NULL, 131072, 4.0, 24.0),
('gpt-5.6-sol', 'OpenAI', 'GPT 5.6 Sol', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'gpt-5.6-sol', 'api', 'api', NULL, 131072, 3.2, 16.0),
('gpt-5.6-terra', 'OpenAI', 'GPT 5.6 Terra', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'gpt-5.6-terra', 'api', 'api', NULL, 131072, 1.6, 9.6),
('gpt-6-astra', 'OpenAI', 'GPT 6 Astra', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'gpt-6-astra', 'api', 'api', NULL, 131072, 8.0, 40.0),
('gpt-6-sol', 'OpenAI', 'GPT 6 Sol', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'gpt-6-sol', 'api', 'api', NULL, 131072, 1.6, 8.0),
('gpt-6.1-sol', 'OpenAI', 'GPT 6.1 Sol', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'gpt-6.1-sol', 'api', 'api', NULL, 131072, 1.6, 8.0),
('claude-fable-5', 'Anthropic', 'Claude Fable 5', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-fable-5', 'api', 'api', NULL, 131072, 9.0, 45.0),
('claude-fable-5-1', 'Anthropic', 'Claude Fable 5.1', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-fable-5-1', 'api', 'api', NULL, 131072, 9.0, 45.0),
('claude-fable-5-2', 'Anthropic', 'Claude Fable 5.2', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-fable-5-2', 'api', 'api', NULL, 131072, 7.2, 36.0),
('claude-haiku-4-5-20251001', 'Anthropic', 'Claude Haiku 4.5', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-haiku-4-5-20251001', 'api', 'api', NULL, 131072, 0.9, 4.5),
('claude-haiku-5-5', 'Anthropic', 'Claude Haiku 5.5', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-haiku-5-5', 'api', 'api', NULL, 131072, 0.09, 0.45),
('claude-opus-4-5', 'Anthropic', 'Claude Opus 4.5', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-opus-4-5', 'api', 'api', NULL, 131072, 1.8, 9.0),
('claude-opus-4-6', 'Anthropic', 'Claude Opus 4.6', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-opus-4-6', 'api', 'api', NULL, 131072, 4.5, 22.5),
('claude-opus-4-7', 'Anthropic', 'Claude Opus 4.7', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-opus-4-7', 'api', 'api', NULL, 131072, 4.5, 22.5),
('claude-opus-4-8', 'Anthropic', 'Claude Opus 4.8', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-opus-4-8', 'api', 'api', NULL, 131072, 4.5, 22.5),
('claude-opus-5', 'Anthropic', 'Claude Opus 5', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-opus-5', 'api', 'api', NULL, 131072, 4.5, 22.5),
('claude-opus-5-5', 'Anthropic', 'Claude Opus 5.5', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-opus-5-5', 'api', 'api', NULL, 131072, 3.6, 18.0),
('claude-sonnet-4-6', 'Anthropic', 'Claude Sonnet 4.6', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-sonnet-4-6', 'api', 'api', NULL, 131072, 2.7, 13.5),
('claude-sonnet-5', 'Anthropic', 'Claude Sonnet 5', 'gateway', 'https://apihk.chinarouter.net/v1', '', 'claude-sonnet-5', 'api', 'api', NULL, 131072, 1.8, 9.0)
ON CONFLICT (name, version) DO UPDATE SET
  vendor = EXCLUDED.vendor,
  series = EXCLUDED.series,
  base_url = EXCLUDED.base_url,
  api_key = COALESCE(NULLIF(models_info.api_key, ''), EXCLUDED.api_key),
  model_name = EXCLUDED.model_name,
  access_type = EXCLUDED.access_type,
  backend = EXCLUDED.backend,
  context_length = COALESCE(models_info.context_length, EXCLUDED.context_length),
  input_price_per_1m = EXCLUDED.input_price_per_1m,
  output_price_per_1m = EXCLUDED.output_price_per_1m;
