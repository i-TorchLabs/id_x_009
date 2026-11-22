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

## 日志透传

`id_x_009-service` 容器内 `/app/i-Core/logs` **bind mount** 到模块根：

```
x_models/id_x_009/logs/
├── info.log
├── warn.log
└── error.log
```

`up.sh` 使用 `-v …/logs:/app/i-Core/logs:z,U`；若旧容器仍挂命名卷 `id_x_009_logs`，会自动重建切换。宿主机可直接 `tail -f x_models/id_x_009/logs/info.log`。

## 种子数据（`init/02_seed.sql`，首次建库自动执行）

- 演示账号：`demo@id-x-009.local` / `demo123456`
- 16 个主流模型、6 个评测数据集、16 个已完成评测任务及结果

## 容器配置要点

`Dockerfile.service` 用 `ops/base_config.container.toml` 覆盖镜像内 `config/base_config.toml`  
（`[EXTEND].MODELS` 仅指向 `id_x_009`）。健康检查使用 GraphQL：`{ health { status } }`。
