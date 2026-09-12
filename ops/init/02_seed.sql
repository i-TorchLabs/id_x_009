-- 02_seed.sql —— id_x_009 演示种子数据
-- 由 db 容器 docker-entrypoint-initdb.d 在首次启动时自动执行（顺序在 01_init.sql 之后）
--
-- 内容：
--   1) 演示账号（demo@id-x-009.local / demo123456，SHA256 与后端 hash_password 一致）
--   2) 16 个主流模型（覆盖 10 家厂商，商用 API / 开源 / 自托管三种接入方式）
--   3) 6 个评测数据集（六能力域各一）
--   4) 16 个已完成评测任务 + 结果（评分图谱开箱即有数据；
--      六域得分与后端 _MODEL_PROFILES 同画像，后续增量任务风格一致）

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
-- 2. 模型注册中心（id 1-16）
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
(16, 'mistral-large-3',  'Mistral',   'Mistral-Large','3',  'selfhost',   'trtllm', 123,   128000);

SELECT setval('models_id_seq', 16);

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
-- 4. 已完成评测任务（id 1-16，与 models 一一对应）
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
(16, 't-20260827-0002', 'mistral-large-3 六域基线评测', 16, '[1,2,3,4,5,6]', 'trtllm', 'Done', 100, '{"dataset":["mmlu-pro@2026.08:snapshot-101"],"model":"mistral-large-3@3","engine":"trtllm@0.6","hyper":{"temperature":0.0,"max_tokens":2048}}');

SELECT setval('eval_tasks_id_seq', 16);

-- ============================================
-- 5. 评测结果（六能力域得分 + 综合评分 + 成本/时延/吞吐）
--    综合评分 = 0.30*推理 + 0.20*语言 + 0.15*对齐 + 0.15*长上下文 + 0.10*多模态 + 0.10*业务
-- ============================================
INSERT INTO eval_results (task_id, model_id, score_reasoning, score_language, score_alignment, score_longctx, score_multimodal, score_business, composite_score, cost_per_task, latency_p50, throughput) VALUES
(1,  1,  94.2, 92.8, 91.5, 90.6, 93.1, 90.2, 92.56, 5.4200,  812.4,  62.3),
(2,  2,  85.6, 84.9, 83.2, 82.1, 84.4, 82.6, 84.14, 0.5300,  456.2, 118.5),
(3,  3,  92.8, 91.6, 92.4, 88.3, 90.2, 89.5, 91.31, 7.8600, 1024.6,  48.7),
(4,  4,  89.2, 88.6, 89.8, 85.4, 87.1, 86.3, 88.15, 1.7600,  638.1,  86.2),
(5,  5,  91.6, 90.3, 88.9, 92.7, 91.8, 87.4, 90.52, 2.5400,  742.3,  71.9),
(6,  6,  87.3, 85.8, 83.6, 84.2, 78.4, 86.1, 85.05, 0.1400,  523.8, 142.6),
(7,  7,  91.4, 85.2, 84.8, 83.6, 72.5, 84.9, 86.35, 0.4100,  986.4,  58.3),
(8,  8,  88.1, 87.4, 85.2, 84.8, 82.6, 85.9, 86.42, 0.8800,  612.7,  94.8),
(9,  9,  85.6, 84.1, 81.8, 82.4, 76.3, 83.2, 83.12, 0.3400,  688.2, 108.4),
(10, 10, 78.4, 76.8, 75.2, 74.6, 68.2, 76.9, 76.01, 0.0800,  412.5, 156.7),
(11, 11, 82.6, 80.9, 79.4, 78.8, 77.6, 80.2, 80.53, 0.5800,  724.1,  88.9),
(12, 12, 76.2, 74.8, 73.6, 72.4, 70.8, 74.1, 74.15, 0.1200,  438.6, 148.2),
(13, 13, 86.2, 85.6, 83.4, 84.9, 79.8, 84.2, 84.68, 0.4400,  586.3,  98.4),
(14, 14, 84.3, 83.2, 82.6, 80.4, 75.6, 82.1, 82.24, 0.2900,  642.8,  92.6),
(15, 15, 79.8, 78.6, 77.2, 76.8, 74.2, 78.4, 78.09, 0.1000,  462.1, 132.8),
(16, 16, 79.2, 78.4, 76.8, 75.2, 73.6, 77.4, 77.35, 0.4800,  524.7, 118.3);
