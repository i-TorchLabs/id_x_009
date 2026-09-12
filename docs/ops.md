# id_x_009 部署说明（ops/）

AI 模型评测平台 Demo —— 四容器 Pod 一键部署，与 FRAMEWORK.md 部署范式一致。

## 拓扑

```
浏览器
  │  http://<host>:8009
  ▼
id_x_009-haproxy  (:8080 in pod)
  ├─ /b/id_x_009/*  →  id_x_009-service  (127.0.0.1:7000, Litestar + Granian ×3)
  └─ 其余           →  id_x_009-web      (127.0.0.1:2000, Next.js)
id_x_009-db       (127.0.0.1:5432, PostgreSQL 18，数据卷 id_x_009_db)
```

同 Pod 共享 network namespace，容器间全部走 127.0.0.1。

## 快速开始

```bash
cd x_models/id_x_009/ops
cp .env.example .env       # 修改 POSTGRES_PASSWORD
./up.sh                    # 镜像不存在时自动构建；已存在则幂等跳过
./up.sh --build            # 强制重建镜像并启动
./down.sh                  # 停止并删除 Pod 与全部容器（数据卷保留）
```

## 端口约定

| 用途 | 宿主机端口 | 说明 |
| --- | --- | --- |
| Web/API 入口 | **8009** | Pod 映射到 haproxy:8080 |
| GraphQL 路径 | — | `/b/id_x_009/graphql` |

## 种子数据（`init/02_seed.sql`，首次建库自动执行）

- 演示账号：`demo@id-x-009.local` / `demo123456`（注册的新账号直接激活可登录）
- 16 个主流模型（OpenAI / Anthropic / Google / DeepSeek / Alibaba / Meta / Moonshot / Zhipu / MiniMax / Mistral）
- 6 个评测数据集（六能力域各一）
- 16 个已完成评测任务 + 结果 —— 评分图谱开箱即有数据

## 已验证的关键行为

- 任务状态机：Pending → Running →（Paused 断点保持）→ Done，守护线程每秒推进 6–14% 并落库；
  服务重启后遗留的 Pending 任务可通过 `resumeTask` 重新接管。
- 执行线程使用独立 asyncpg 引擎（避免跨事件循环复用共享连接池导致
  `attached to a different loop`），主请求循环不受影响。
- 评分图谱：`scoreCostGraph` 返回每模型最新结果散点 + 服务端计算的
  Pareto 前沿（按成本升序、评分刷新包络）+ 性价比排名。

## 容器配置要点

`Dockerfile.service` 在主 `config/` COPY 之后用 `ops/base_config.container.toml`
覆盖镜像内 `config/base_config.toml`（`[EXTEND].MODELS` 仅指向 `id_x_009`），
否则插件不加载 → GraphQL 404 → HAProxy 健康检查失败 → 503。切勿省略该 COPY。
