SELECT 'CREATE DATABASE id_x_009' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'id_x_009')\gexec

\c id_x_009

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(128) NOT NULL UNIQUE,
    phone VARCHAR(20),
    password_hash VARCHAR(256) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_users_phone ON users(phone);

COMMENT ON TABLE users IS '用户表';
COMMENT ON COLUMN users.is_active IS '是否激活；新用户默认 false，需管理员置 true 后方可登录';

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

-- 统一模型信息表（原 models + model_info 合并）
CREATE TABLE IF NOT EXISTS models_info (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    vendor VARCHAR(64) NOT NULL,
    series VARCHAR(128) NOT NULL,
    base_url VARCHAR(512) NOT NULL DEFAULT 'https://apihk.chinarouter.net/v1',
    api_key VARCHAR(512) NOT NULL DEFAULT '',
    model_name VARCHAR(128) NOT NULL DEFAULT '',
    access_type VARCHAR(32) NOT NULL DEFAULT 'api',
    backend VARCHAR(32) NOT NULL DEFAULT 'api',
    params_b DOUBLE PRECISION,
    context_length INTEGER DEFAULT 131072,
    input_price_per_1m DOUBLE PRECISION NOT NULL DEFAULT 0,
    output_price_per_1m DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_models_info_name UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS ix_models_info_vendor ON models_info(vendor);
CREATE INDEX IF NOT EXISTS ix_models_info_series ON models_info(series);
CREATE INDEX IF NOT EXISTS ix_models_info_model_name ON models_info(model_name);
CREATE INDEX IF NOT EXISTS ix_models_info_name ON models_info(name);

COMMENT ON TABLE models_info IS '模型信息表（名称/厂商/系列/Base-Url/API-Key/Model-Name/单价/接入方式）';
COMMENT ON COLUMN models_info.base_url IS 'OpenAI 兼容网关 Base URL';
COMMENT ON COLUMN models_info.api_key IS '调用网关的 API Key（默认空，由 ID009_LLM_API_KEY 或注册页注入）';
COMMENT ON COLUMN models_info.model_name IS '上游 Chat Completions 使用的 model 字段';
COMMENT ON COLUMN models_info.input_price_per_1m IS '输入单价 USD/1M tokens';
COMMENT ON COLUMN models_info.output_price_per_1m IS '输出单价 USD/1M tokens';

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

-- 评测样本明细（六能力域测算数据；答案存库供真实评测加载）
CREATE TABLE IF NOT EXISTS dataset_samples (
    id SERIAL PRIMARY KEY,
    dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    sample_id VARCHAR(128) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    prompt TEXT NOT NULL,
    expected_answer TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dataset_samples_dataset_sample UNIQUE (dataset_id, sample_id)
);

CREATE INDEX IF NOT EXISTS ix_dataset_samples_dataset_id ON dataset_samples(dataset_id);
CREATE INDEX IF NOT EXISTS ix_dataset_samples_domain ON dataset_samples(domain);
CREATE INDEX IF NOT EXISTS ix_dataset_samples_sample_id ON dataset_samples(sample_id);

COMMENT ON TABLE dataset_samples IS '评测数据集样本明细（按能力域存 prompt / expected_answer）';
COMMENT ON COLUMN dataset_samples.domain IS '能力域键：reasoning/language/alignment/longctx/multimodal/business';
COMMENT ON COLUMN dataset_samples.metadata_json IS '可选 JSON 元数据（来源、题型等）';

CREATE TABLE IF NOT EXISTS eval_tasks (
    id SERIAL PRIMARY KEY,
    task_uid VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(256) NOT NULL,
    model_id INTEGER NOT NULL REFERENCES models_info(id),
    dataset_ids TEXT NOT NULL,
    backend VARCHAR(32) NOT NULL DEFAULT 'api',
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

CREATE TABLE IF NOT EXISTS eval_results (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL UNIQUE REFERENCES eval_tasks(id),
    model_id INTEGER NOT NULL REFERENCES models_info(id),
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

