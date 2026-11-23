# id_x_009 部署说明（ops/）

AI 模型评测平台 —— 四容器 Pod 一键部署（内置 `pgvector/pgvector:pg18`）。

## 拓扑

```
浏览器
  │  http://<host>:8009
  ▼
id_x_009-haproxy  (:8080 in pod)
  ├─ /b/id_x_009/*  →  id_x_009-service  (127.0.0.1:7000, Litestar + Granian)
  └─ 其余           →  id_x_009-web      (127.0.0.1:2000, Next.js)

id_x_009-db       (127.0.0.1:5432, docker.io/pgvector/pgvector:pg18)
                  → 宿主机 127.0.0.1:${DB_HOST_PORT:-55409}
```

同 Pod 共享 network namespace，容器间全部走 `127.0.0.1`。  
首次建库时执行 `ops/init/*.sql`；表结构亦可由应用启动 `build_tables` 幂等补齐。

## 快速开始

```bash
cd x_models/id_x_009/ops
cp .env.example .env       # 设置 POSTGRES_PASSWORD（及可选 ID009_LLM_*）
./up.sh                    # 镜像不存在时自动构建；已存在则幂等跳过
./up.sh --build            # 强制重建镜像并启动
./down.sh                  # 停止并删除 Pod 与容器（保留数据卷与镜像）
./down.sh --volumes        # 同时删除 id_x_009_db（不可恢复）
./down.sh --images         # 同时删除本项目镜像
```

入口：`http://localhost:8009/f/009/login`  
数据库直连：`psql -h 127.0.0.1 -p 55409 -U postgres -d id_x_009`

## 端口约定

| 用途 | 宿主机端口 | 说明 |
| --- | --- | --- |
| Web/API 入口 | **8009**（`POD_PORT`） | Pod 映射到 haproxy:8080 |
| PostgreSQL | **55409**（`DB_HOST_PORT`） | 仅绑定 `DB_BIND_ADDR`（默认 127.0.0.1） |
| GraphQL 路径 | — | `/b/id_x_009/graphql` |

## 数据库连接

同 Pod 内 service → db 固定 `DB_HOST=127.0.0.1:5432`（`up.sh` 的 `-e` 强制注入）。  
不要使用 `host.containers.internal` / `host.docker.internal`：它们解析为 `169.254.1.2`，宿主机上 PostgreSQL 映射端口是 `${DB_HOST_PORT}`（默认 55409），连 `…:5432` 会一直 `Connection refused`，并在启动重试耗尽后崩溃重启。

启动时 DB 就绪重试：**16 次 × 1s**。进程环境优先于镜像/模块 `.env`，避免错误主机覆盖容器注入值。

## 日志透传

`id_x_009-service` 容器内 `/app/i-Core/logs` **bind mount** 到模块根：

```
x_models/id_x_009/logs/
├── info.log
├── warn.log
└── error.log
```

`up.sh` 使用 `-v …/logs:/app/i-Core/logs:z,U`；若旧容器仍挂命名卷 `id_x_009_logs`，会自动重建切换。宿主机可直接 `tail -f x_models/id_x_009/logs/info.log`。

### 测评任务进度日志

评测关键节点统一带 `[eval]` 前缀（含 `uid=` / `id=`），覆盖：创建 → 线程启动 → Running → 样本加载 → 逐条样本（pass/fail/延迟/tokens）→ 汇总落库 → Done/Failed，以及暂停/恢复。

瞬时上游失败会出现 `样本上游瞬时失败将重试` / `样本上游失败已跳过`；任务完成日志含 `skipped_upstream` 或 `upstream_error`。

```bash
# 跟踪全部评测进度
tail -f x_models/id_x_009/logs/info.log | grep --line-buffered '\[eval\]'

# 跟踪超时与重试
grep -E 'UPSTREAM_TIMEOUT|将重试|已跳过|upstream_error' x_models/id_x_009/logs/*.log

# 跟踪单个任务
grep 'uid=t-YYYYMMDD-xxxx' x_models/id_x_009/logs/info.log
```

## 种子数据（`init/02_seed.sql`，首次建库自动执行）

- 演示账号：`sme@cuhk.edu.cn` / `P@sssme!`（`is_active=TRUE`）
- 16 个主流模型、6 个评测数据集、16 个已完成评测任务及结果

## 容器配置要点

`Dockerfile.service` 用 `ops/base_config.container.toml` 覆盖镜像内 `config/base_config.toml`  
（`[EXTEND].MODELS` 仅指向 `id_x_009`）。健康检查使用 GraphQL：`{ health { status } }`。
