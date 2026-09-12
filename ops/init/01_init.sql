-- PostgreSQL 初始化脚本 —— id_x_009 AI 模型评测平台 Demo
-- 由 db 容器 docker-entrypoint-initdb.d 在首次启动时自动执行

-- ============================================
-- 0. 创建数据库 id_x_009（已存在则跳过）
-- ============================================
SELECT 'CREATE DATABASE id_x_009' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'id_x_009')\gexec

\c id_x_009

-- ============================================
-- 1. 用户表 (users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(128) NOT NULL UNIQUE,
    phone VARCHAR(20),
    password_hash VARCHAR(256) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_users_phone ON users(phone);

COMMENT ON TABLE users IS '用户表';

-- ============================================
-- 2. 用户令牌表 (user_tokens)
-- ============================================
CREATE TABLE IF NOT EXISTS user_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_user_tokens_token ON user_tokens(token);
CREATE INDEX IF NOT EXISTS ix_user_tokens_user_id ON user_tokens(user_id);

COMMENT ON TABLE user_tokens IS '用户令牌表';

-- ============================================
-- 3. 密码重置令牌表 (password_reset_tokens)
-- ============================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id ON password_reset_tokens(user_id);

COMMENT ON TABLE password_reset_tokens IS '密码重置令牌表';

-- ============================================
-- 4. 模型注册中心 (models)
-- ============================================
CREATE TABLE IF NOT EXISTS models (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    vendor VARCHAR(64) NOT NULL,
    series VARCHAR(64) NOT NULL,
    version VARCHAR(64) NOT NULL,
    access_type VARCHAR(32) NOT NULL DEFAULT 'api',
    backend VARCHAR(32) NOT NULL DEFAULT 'vllm',
    params_b DOUBLE PRECISION,
    context_length INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_models_vendor ON models(vendor);
CREATE INDEX IF NOT EXISTS ix_models_series ON models(series);

COMMENT ON TABLE models IS '模型注册中心（厂商/系列/版本/接入方式/推理后端）';

-- ============================================
-- 5. 评测数据集仓 (datasets)
-- ============================================
CREATE TABLE IF NOT EXISTS datasets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    version VARCHAR(64) NOT NULL,
    snapshot VARCHAR(128) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    sample_count INTEGER,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_datasets_domain ON datasets(domain);

COMMENT ON TABLE datasets IS '评测数据集仓（版本化快照与能力域）';

-- ============================================
-- 6. 评测任务表 (eval_tasks)
-- ============================================
CREATE TABLE IF NOT EXISTS eval_tasks (
    id SERIAL PRIMARY KEY,
    task_uid VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(256) NOT NULL,
    model_id INTEGER NOT NULL REFERENCES models(id),
    dataset_ids TEXT NOT NULL,
    backend VARCHAR(32) NOT NULL DEFAULT 'vllm',
    status VARCHAR(16) NOT NULL DEFAULT 'Draft',
    progress INTEGER NOT NULL DEFAULT 0,
    fingerprint TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_eval_tasks_task_uid ON eval_tasks(task_uid);
CREATE INDEX IF NOT EXISTS ix_eval_tasks_status ON eval_tasks(status);

COMMENT ON TABLE eval_tasks IS '评测任务（Draft/Pending/Running/Paused/Done/Failed 状态机）';

-- ============================================
-- 7. 评测结果表 (eval_results)
-- ============================================
CREATE TABLE IF NOT EXISTS eval_results (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL UNIQUE REFERENCES eval_tasks(id),
    model_id INTEGER NOT NULL REFERENCES models(id),
    score_reasoning DOUBLE PRECISION NOT NULL DEFAULT 0,
    score_language DOUBLE PRECISION NOT NULL DEFAULT 0,
    score_alignment DOUBLE PRECISION NOT NULL DEFAULT 0,
    score_longctx DOUBLE PRECISION NOT NULL DEFAULT 0,
    score_multimodal DOUBLE PRECISION NOT NULL DEFAULT 0,
    score_business DOUBLE PRECISION NOT NULL DEFAULT 0,
    composite_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    cost_per_task DOUBLE PRECISION NOT NULL DEFAULT 0,
    latency_p50 DOUBLE PRECISION,
    throughput DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_eval_results_model_id ON eval_results(model_id);
CREATE INDEX IF NOT EXISTS ix_eval_results_composite_score ON eval_results(composite_score);

COMMENT ON TABLE eval_results IS '评测结果（六能力域得分 + 综合评分 + 成本/时延/吞吐）';

-- ============================================
-- 触发器：自动更新 updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_eval_tasks_updated_at ON eval_tasks;
CREATE TRIGGER update_eval_tasks_updated_at
    BEFORE UPDATE ON eval_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
