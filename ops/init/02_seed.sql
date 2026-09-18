-- 02_seed.sql —— id_x_009 演示种子数据
-- 由 db 容器 docker-entrypoint-initdb.d 在首次启动时自动执行（顺序在 01_init.sql 之后）
--
-- 内容：
--   1) 演示账号（demo@id-x-009.local / demo123456，SHA256 与后端 hash_password 一致）
--   2) 34 个主流模型（覆盖 10 家厂商，商用 API / 开源 / 自托管三种接入方式）
--   3) 6 个评测数据集（六能力域各一）
--   4) 34 个已完成评测任务 + 结果（评分图谱开箱即有数据；
--      六域得分与后端 _MODEL_PROFILES 同画像，后续增量任务风格一致）
--   5) 扩展 8 组样本：拉满评分 × 成本分布，覆盖超低成本到超高端旗舰，
--      使气泡在画布上充分展开、减少重合

\c id_x_009

-- ============================================
-- 1. 演示账号
-- ============================================
INSERT INTO users (email, password_hash, is_active)
VALUES (
    'demo@id-x-009.local',
    'd2b000ce0875cad8615dd8cf34f788635c959a0ce2b8a977e22caab745380b06',
    TRUE
);

-- ============================================
-- 2. 模型注册中心（id 1-34）
-- ============================================
INSERT INTO models (id, name, vendor, series, version, access_type, backend, params_b, context_length) VALUES
(1,  'gpt-5.2',          'OpenAI',    'GPT-5',   '5.2',     'api',        'api',    NULL,  400000),
(2,  'gpt-5-mini',       'OpenAI',    'GPT-5',   '5-mini',  'api',        'api',    NULL,  400000),
(3,  'claude-opus-4.6',  'Anthropic', 'Claude',  '4.6-opus','api',        'api',    NULL,  200000),
(4,  'claude-sonnet-4.6','Anthropic', 'Claude',  '4.6-sonnet','api',      'api',    NULL,  200000),
(5,  'gemini-3.1-pro',   'Google',    'Gemini',  '3.1-pro', 'api',        'api',    NULL,  1000000),
(6,  'deepseek-v3.2',    'DeepSeek',  'DeepSeek-V3','v3.2', 'opensource', 'vllm',   671,   128000),
(7,  'deepseek-r1',      'DeepSeek',  'DeepSeek-R1','r1',   'opensource', 'vllm',   671,   128000),
(8,  'qwen3-max',        'Alibaba',   'Qwen3',   'max',     'api',        'api',    NULL,  256000),
(9,  'qwen3-235b-a22b',  'Alibaba',   'Qwen3',   '235b-a22b','opensource','vllm',   235,   128000),
(10, 'qwen3-32b',        'Alibaba',   'Qwen3',   '32b',     'opensource', 'vllm',   32,    128000),
(11, 'llama-4-405b',     'Meta',      'Llama-4', '405b',    'opensource', 'vllm',   405,   128000),
(12, 'llama-4-70b',      'Meta',      'Llama-4', '70b',     'opensource', 'vllm',   70,    128000),
(13, 'kimi-k2.5',        'Moonshot',  'Kimi-K2', 'k2.5',    'api',        'api',    NULL,  256000),
(14, 'glm-5',            'Zhipu',     'GLM',     '5',       'api',        'api',    NULL,  128000),
(15, 'minimax-m2.5',     'MiniMax',   'M2',      '2.5',     'opensource', 'vllm',   230,   128000),
(16, 'mistral-large-3',  'Mistral',   'Mistral-Large','3',  'selfhost',   'trtllm', 123,   128000),
(17, 'gpt-5-nano',       'OpenAI',    'GPT-5',   '5-nano',  'api',        'api',    NULL,  400000),
(18, 'claude-haiku-4.6', 'Anthropic', 'Claude',  '4.6-haiku','api',       'api',    NULL,  200000),
(19, 'gemini-3.1-flash', 'Google',    'Gemini',  '3.1-flash','api',       'api',    NULL,  1000000),
(20, 'qwen3-8b',         'Alibaba',   'Qwen3',   '8b',      'opensource', 'vllm',   8,     128000),
(21, 'llama-4-8b',       'Meta',      'Llama-4', '8b',      'opensource', 'vllm',   8,     128000),
(22, 'deepseek-r1-distill-70b','DeepSeek','DeepSeek-R1','distill-70b','opensource','vllm',70, 128000),
(23, 'kimi-k2.5-turbo',  'Moonshot',  'Kimi-K2', 'k2.5-turbo','api',      'api',    NULL,  256000),
(24, 'glm-5-air',        'Zhipu',     'GLM',     '5-air',   'api',        'api',    NULL,  128000),
(25, 'minimax-m2.5-mini','MiniMax',   'M2',      '2.5-mini','opensource', 'vllm',   12,    128000),
(26, 'mistral-small-4',  'Mistral',   'Mistral-Small','4',  'selfhost',   'trtllm', 24,    128000),
-- 扩展 8 模型：拉满评分 × 成本分布
(27, 'gpt-5.2-pro',       'OpenAI',    'GPT-5',   '5.2-pro', 'api',        'api',    NULL,  400000),
(28, 'o3-pro',            'OpenAI',    'o-series','3-pro',   'api',        'api',    NULL,  200000),
(29, 'claude-opus-4.6-x', 'Anthropic', 'Claude',  '4.6-opus-x','api',      'api',    NULL,  200000),
(30, 'gemini-3.1-ultra',  'Google',    'Gemini',  '3.1-ultra','api',       'api',    NULL,  1000000),
(31, 'deepseek-v3.2-pro', 'DeepSeek',  'DeepSeek-V3','v3.2-pro','opensource','vllm',  671,   128000),
(32, 'qwen3-72b',         'Alibaba',   'Qwen3',   '72b',     'opensource', 'vllm',   72,    128000),
(33, 'llama-4-13b',       'Meta',      'Llama-4', '13b',     'opensource', 'vllm',   13,    128000),
(34, 'kimi-k2.5-pro',     'Moonshot',  'Kimi-K2', 'k2.5-pro','api',       'api',    NULL,  256000);

SELECT setval('models_id_seq', 34);

-- ============================================
-- 3. 评测数据集（id 1-6，六能力域各一）
-- ============================================
INSERT INTO datasets (id, name, version, snapshot, domain, sample_count, description) VALUES
(1, 'mmlu-pro',       '2026.08', 'mmlu-pro@2026.08:snapshot-101',       '客观知识与推理', 12000, '大规模多任务语言理解（研究生级推理增强版）'),
(2, 'arena-hard-gen', '2026.08', 'arena-hard-gen@2026.08:snapshot-103', '语言与生成',      500,  '开放式生成质量评判集（LLM-as-Judge 协议）'),
(3, 'safety-bench',   '2026.08', 'safety-bench@2026.08:snapshot-105',   '对齐与安全',      8000, '组织级安全合规评测包（准入门禁专项）'),
(4, 'longctx-ruler',  '2026.08', 'longctx-ruler@2026.08:snapshot-107',  '长上下文',        2600, '长上下文检索与追踪（128K 窗口）'),
(5, 'mmmu-lite',      '2026.08', 'mmmu-lite@2026.08:snapshot-109',      '多模态',          3000, '多模态理解与推理（学科级图文混合）'),
(6, 'biz-kb-qa',      '2026.08', 'biz-kb-qa@2026.08:snapshot-111',      '业务专项',        1500, '组织业务知识库问答（脱敏入库）');

SELECT setval('datasets_id_seq', 6);

-- ============================================
-- 4. 已完成评测任务（id 1-34，与 models 一一对应）
-- ============================================
INSERT INTO eval_tasks (id, task_uid, name, model_id, dataset_ids, backend, status, progress, fingerprint) VALUES
(1,  't-20260820-0001', 'gpt-5.2 六域基线评测',          1,  '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101","arena-hard-gen@2026.08:snapshot-103","safety-bench@2026.08:snapshot-105","longctx-ruler@2026.08:snapshot-107","mmmu-lite@2026.08:snapshot-109","biz-kb-qa@2026.08:snapshot-111"],"model":"gpt-5.2@5.2","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(2,  't-20260820-0002', 'gpt-5-mini 六域基线评测',       2,  '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"gpt-5-mini@5-mini","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(3,  't-20260821-0001', 'claude-opus-4.6 六域基线评测',  3,  '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"claude-opus-4.6@4.6-opus","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(4,  't-20260821-0002', 'claude-sonnet-4.6 六域基线评测',4,  '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"claude-sonnet-4.6@4.6-sonnet","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(5,  't-20260822-0001', 'gemini-3.1-pro 六域基线评测',   5,  '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"gemini-3.1-pro@3.1-pro","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(6,  't-20260823-0001', 'deepseek-v3.2 六域基线评测',    6,  '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"deepseek-v3.2@v3.2","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(7,  't-20260823-0002', 'deepseek-r1 六域基线评测',      7,  '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"deepseek-r1@r1","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(8,  't-20260824-0001', 'qwen3-max 六域基线评测',        8,  '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"qwen3-max@max","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(9,  't-20260824-0002', 'qwen3-235b 六域基线评测',       9,  '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"qwen3-235b-a22b@235b-a22b","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(10, 't-20260824-0003', 'qwen3-32b 六域基线评测',       10,  '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"qwen3-32b@32b","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(11, 't-20260825-0001', 'llama-4-405b 六域基线评测',    11,  '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"llama-4-405b@405b","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(12, 't-20260825-0002', 'llama-4-70b 六域基线评测',     12,  '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"llama-4-70b@70b","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(13, 't-20260826-0001', 'kimi-k2.5 六域基线评测',       13, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"kimi-k2.5@k2.5","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(14, 't-20260826-0002', 'glm-5 六域基线评测',           14, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"glm-5@5","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(15, 't-20260827-0001', 'minimax-m2.5 六域基线评测',    15, '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"minimax-m2.5@2.5","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(16, 't-20260827-0002', 'mistral-large-3 六域基线评测', 16, '[1,2,3,4,5,6]', 'trtllm', 'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"mistral-large-3@3","engine":"trtllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(17, 't-20260828-0001', 'gpt-5-nano 六域基线评测',        17, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"gpt-5-nano@5-nano","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(18, 't-20260828-0002', 'claude-haiku-4.6 六域基线评测',  18, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"claude-haiku-4.6@4.6-haiku","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(19, 't-20260828-0003', 'gemini-3.1-flash 六域基线评测',  19, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"gemini-3.1-flash@3.1-flash","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(20, 't-20260829-0001', 'qwen3-8b 六域基线评测',          20, '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"qwen3-8b@8b","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(21, 't-20260829-0002', 'llama-4-8b 六域基线评测',        21, '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"llama-4-8b@8b","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(22, 't-20260829-0003', 'deepseek-r1-distill-70b 六域基线评测', 22, '[1,2,3,4,5,6]', 'vllm', 'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"deepseek-r1-distill-70b@distill-70b","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(23, 't-20260830-0001', 'kimi-k2.5-turbo 六域基线评测',   23, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"kimi-k2.5-turbo@k2.5-turbo","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(24, 't-20260830-0002', 'glm-5-air 六域基线评测',         24, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"glm-5-air@5-air","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(25, 't-20260830-0003', 'minimax-m2.5-mini 六域基线评测', 25, '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"minimax-m2.5-mini@2.5-mini","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(26, 't-20260830-0004', 'mistral-small-4 六域基线评测',   26, '[1,2,3,4,5,6]', 'trtllm', 'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"mistral-small-4@4","engine":"trtllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
-- 扩展 8 任务
(27, 't-20260831-0001', 'gpt-5.2-pro 六域基线评测',       27, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"gpt-5.2-pro@5.2-pro","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(28, 't-20260831-0002', 'o3-pro 六域基线评测',            28, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"o3-pro@3-pro","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(29, 't-20260831-0003', 'claude-opus-4.6-x 六域基线评测', 29, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"claude-opus-4.6-x@4.6-opus-x","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(30, 't-20260901-0001', 'gemini-3.1-ultra 六域基线评测',  30, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"gemini-3.1-ultra@3.1-ultra","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(31, 't-20260901-0002', 'deepseek-v3.2-pro 六域基线评测', 31, '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"deepseek-v3.2-pro@v3.2-pro","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(32, 't-20260901-0003', 'qwen3-72b 六域基线评测',         32, '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"qwen3-72b@72b","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(33, 't-20260902-0001', 'llama-4-13b 六域基线评测',       33, '[1,2,3,4,5,6]', 'vllm',   'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"llama-4-13b@13b","engine":"vllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}'),
(34, 't-20260902-0002', 'kimi-k2.5-pro 六域基线评测',     34, '[1,2,3,4,5,6]', 'api',    'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"kimi-k2.5-pro@k2.5-pro","engine":"api@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}');

SELECT setval('eval_tasks_id_seq', 34);

-- ============================================
-- 5. 评测结果（六能力域得分 + 综合评分 + 成本/时延/吞吐）
--    综合评分 = 0.30*推理 + 0.20*语言 + 0.15*对齐 + 0.15*长上下文 + 0.10*多模态 + 0.10*业务
--    扩展 8 组：覆盖 $0.038 ~ $24.20 成本域，63.0 ~ 97.8 综合评分域，
--    气泡在画布上充分展开、减少重合
-- ============================================
INSERT INTO eval_results (task_id, model_id, score_reasoning, score_language, score_alignment, score_longctx, score_multimodal, score_business, composite_score, cost_per_task, latency_p50, throughput) VALUES
(1,  1,  97.4, 95.6, 94.2, 93.8, 96.1, 92.4, 95.39, 9.8500,  842.6,  58.2),
(2,  2,  82.4, 80.6, 78.2, 74.6, 79.4, 76.8, 79.38, 0.4200,  436.2,  128.5),
(3,  3,  96.2, 94.8, 95.6, 89.2, 92.4, 91.6, 93.94, 12.4000,  1124.8,  42.6),
(4,  4,  88.6, 87.2, 90.4, 82.6, 84.8, 83.4, 86.79, 1.8600,  624.3,  92.4),
(5,  5,  94.6, 92.4, 89.8, 95.2, 94.6, 88.2, 92.89, 2.6400,  768.4,  68.4),
(6,  6,  88.2, 84.6, 79.4, 82.6, 68.4, 86.2, 83.14, 0.0950,  512.4,  152.6),
(7,  7,  95.8, 82.4, 80.6, 79.2, 56.4, 82.6, 83.09, 0.4800,  1086.4,  52.4),
(8,  8,  87.4, 86.2, 81.6, 80.4, 74.6, 84.2, 83.64, 0.7200,  598.6,  102.4),
(9,  9,  82.6, 79.4, 74.2, 76.8, 62.4, 78.6, 77.41, 0.2600,  672.4,  116.8),
(10, 10,  72.4, 68.6, 64.2, 62.4, 52.6, 66.8, 66.37, 0.0450,  398.6,  168.4),
(11, 11,  79.6, 75.2, 71.4, 72.6, 70.4, 74.2, 74.98, 0.6800,  742.6,  82.4),
(12, 12,  68.2, 63.6, 60.2, 58.4, 55.6, 62.6, 62.79, 0.0850,  424.8,  156.2),
(13, 13,  85.6, 83.4, 78.2, 83.6, 71.4, 81.6, 81.93, 0.3600,  564.2,  108.6),
(14, 14,  80.4, 77.6, 75.4, 72.4, 62.6, 76.2, 75.69, 0.2100,  628.4,  98.2),
(15, 15,  74.6, 71.4, 67.2, 68.6, 64.2, 70.4, 70.49, 0.0680,  448.6,  142.8),
(16, 16,  73.2, 70.6, 66.4, 64.2, 60.6, 69.4, 68.67, 0.5200,  542.6,  112.4),
(17, 17,  64.8, 62.4, 58.6, 56.2, 60.4, 58.6, 61.04, 0.0650,  296.4,  202.6),
(18, 18,  77.6, 75.2, 79.4, 71.6, 72.4, 70.8, 75.29, 0.3400,  372.4,  152.8),
(19, 19,  81.2, 78.4, 74.6, 83.6, 79.6, 73.4, 79.07, 0.2900,  336.8,  172.4),
(20, 20,  58.4, 54.6, 50.2, 48.6, 38.4, 52.8, 52.38, 0.0150,  268.4,  228.6),
(21, 21,  51.6, 47.2, 44.6, 42.4, 36.8, 46.2, 46.27, 0.0120,  252.6,  248.4),
(22, 22,  84.6, 71.4, 68.2, 66.4, 42.6, 69.6, 71.07, 0.0950,  924.6,  88.4),
(23, 23,  78.6, 76.2, 71.4, 77.6, 62.4, 74.2, 74.83, 0.1300,  392.6,  158.4),
(24, 24,  70.2, 66.4, 63.2, 60.4, 52.6, 64.6, 64.60, 0.0620,  372.6,  162.8),
(25, 25,  62.4, 58.6, 54.2, 52.6, 46.4, 56.8, 56.78, 0.0240,  284.6,  212.4),
(26, 26,  63.8, 60.4, 56.6, 54.2, 48.6, 58.4, 58.54, 0.0950,  328.4,  182.6),
-- 扩展 8 组：拉满评分 × 成本分布
(27, 27,  99.2, 98.4, 97.6, 96.8, 98.2, 95.4, 97.82, 24.2000, 1486.2, 28.4),
(28, 28,  97.6, 96.2, 95.4, 94.6, 96.8, 93.2, 96.02, 19.8000, 1284.6, 32.6),
(29, 29,  96.8, 95.4, 96.2, 92.4, 94.6, 92.8, 95.19, 16.5000, 1052.4, 38.2),
(30, 30,  95.4, 93.2, 91.6, 96.4, 95.8, 90.4, 94.07, 7.4800,  826.4,  62.4),
(31, 31,  91.2, 88.6, 85.4, 87.2, 78.6, 89.4, 87.82, 1.3200,  486.2,  118.6),
(32, 32,  84.2, 80.6, 76.4, 78.2, 68.4, 82.4, 79.86, 0.6100,  548.6,  96.4),
(33, 33,  68.4, 64.2, 60.6, 58.4, 52.6, 64.6, 63.03, 0.0380,  342.6,  182.4),
(34, 34,  92.4, 90.2, 86.4, 91.2, 82.6, 88.4, 89.19, 2.6400,  612.4,  78.6);
