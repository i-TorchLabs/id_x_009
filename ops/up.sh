#!/usr/bin/env bash
# ====================================================================
# id_x_009 一体化容器部署启动脚本（podman，内置 pgvector PostgreSQL）
#
# 拓扑：单 Pod 四容器，共享网络命名空间
#   db       docker.io/pgvector/pgvector:pg18  :5432 → 宿主机 ${DB_HOST_PORT:-55409}
#   service  localhost/id_x_009-service        127.0.0.1:7000（Litestar + GraphQL）
#   web      localhost/id_x_009-web            127.0.0.1:2000（Next.js）
#   haproxy  docker.io/library/haproxy:3.0     :8080 → 宿主机 ${POD_PORT:-8009}
#
# 用法：
#   bash up.sh            # 首次构建镜像并启动（幂等，已存在则跳过）
#   bash up.sh --build    # 强制重建 service / web 镜像后启动
# ====================================================================
set -euo pipefail
cd "$(dirname "$0")"

PROJECT_NAME="id_x_009"

# ============================================
# 0. 前置检查与配置加载
# ============================================
if ! command -v podman >/dev/null 2>&1; then
  echo "[up] 错误: 未找到 podman，请先安装（https://podman.io）" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[up] 已从 .env.example 生成 .env，请设置 POSTGRES_PASSWORD 等后重新运行"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source ./.env
set +a

POSTGRES_DB="${POSTGRES_DB:-id_x_009}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?[up] 请在 .env 中设置 POSTGRES_PASSWORD}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-docker.io/pgvector/pgvector:pg18}"
HAPROXY_IMAGE="${HAPROXY_IMAGE:-docker.io/library/haproxy:3.0}"
SERVICE_IMAGE="localhost/${PROJECT_NAME}-service"
WEB_IMAGE="localhost/${PROJECT_NAME}-web"
POD_PORT="${POD_PORT:-8009}"
DB_HOST_PORT="${DB_HOST_PORT:-55409}"
DB_BIND_ADDR="${DB_BIND_ADDR:-127.0.0.1}"

if [ -z "${ID009_LLM_API_KEY:-}" ]; then
  echo "[up] 提示: 未设置 ID009_LLM_API_KEY，真实评测 / LLM 调用将不可用；模拟模式不受影响" >&2
fi

# ============================================
# 1. 构建镜像（若不存在或指定 --build）
# ============================================
if [ "${1:-}" = "--build" ] \
   || ! podman image exists "${SERVICE_IMAGE}" \
   || ! podman image exists "${WEB_IMAGE}"; then
  echo "[up] 构建 service 镜像..."
  podman build --format docker -t "${SERVICE_IMAGE}" -f Dockerfile.service ../../../
  echo "[up] 构建 web 镜像..."
  podman build --format docker -t "${WEB_IMAGE}" -f ../web/Dockerfile \
    --build-arg NEXT_PUBLIC_BASE_URL="" \
    --build-arg NEXT_PUBLIC_SUB_VERSION="/b/id_x_009/graphql" \
    ../web
fi

# ============================================
# 2. 创建 Pod
# ============================================
if ! podman pod exists "${PROJECT_NAME}"; then
  podman pod create --name "${PROJECT_NAME}" \
    -p "${POD_PORT}:8080" \
    -p "${DB_BIND_ADDR}:${DB_HOST_PORT}:5432"
  echo "[up] Pod ${PROJECT_NAME} 已创建，端口映射 ${POD_PORT}:8080, ${DB_BIND_ADDR}:${DB_HOST_PORT}:5432"
elif ! podman pod inspect "${PROJECT_NAME}" | grep -Eq "[\":]${DB_HOST_PORT}[,\"}]"; then
  echo "[up] 提示: 现有 Pod 未映射 ${DB_HOST_PORT}:5432（数据库端口），如需发布请先 bash down.sh 再重新运行" >&2
fi

# ============================================
# 3. 数据卷 / 日志目录（bind mount 透传）
# ============================================
# service 容器内 /app/i-Core/logs 绑定到模块根：
#   x_models/id_x_009/logs/{info,warn,error}.log
# 容器重建不丢日志；勿改回命名卷。
# service 以 UID 10001(app) 运行；rootless 下须保证可写。
LOGS_HOST_DIR="$(cd .. && pwd)/logs"
mkdir -p "${LOGS_HOST_DIR}"
if command -v podman >/dev/null 2>&1; then
  podman unshare chown -R 10001:10001 "${LOGS_HOST_DIR}" 2>/dev/null \
    || chmod 0777 "${LOGS_HOST_DIR}"
else
  chmod 0777 "${LOGS_HOST_DIR}"
fi
echo "[up] 日志透传目录: ${LOGS_HOST_DIR}  ←  容器 /app/i-Core/logs"

if ! podman volume exists "${PROJECT_NAME}_db"; then
  podman volume create "${PROJECT_NAME}_db" >/dev/null
  echo "[up] 数据卷 ${PROJECT_NAME}_db 已创建"
fi

if podman volume exists "${PROJECT_NAME}_logs"; then
  echo "[up] 提示: 检测到旧命名卷 ${PROJECT_NAME}_logs（已改用模块根 logs/ bind mount，" >&2
  echo "[up]       如不再需要可执行: podman volume rm ${PROJECT_NAME}_logs）" >&2
fi

# ============================================
# 4. 启动容器
# ============================================

# -- db (pgvector/pg18) --
if ! podman container exists "${PROJECT_NAME}-db"; then
  podman run -d \
    --pod "${PROJECT_NAME}" \
    --name "${PROJECT_NAME}-db" \
    --restart unless-stopped \
    -e POSTGRES_DB="${POSTGRES_DB}" \
    -e POSTGRES_USER="${POSTGRES_USER}" \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    -v "${PROJECT_NAME}_db":/var/lib/postgresql \
    -v ./init:/docker-entrypoint-initdb.d:ro,z \
    --health-cmd "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}" \
    --health-interval 10s \
    --health-timeout 5s \
    --health-retries 10 \
    --health-start-period 20s \
    "${POSTGRES_IMAGE}"
  echo "[up] ${PROJECT_NAME}-db 已启动（${POSTGRES_IMAGE}）"
else
  echo "[up] ${PROJECT_NAME}-db 已存在，跳过"
fi

echo "[up] 等待 db 健康检查通过..."
for i in $(seq 1 60); do
  status=$(podman inspect "${PROJECT_NAME}-db" --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  if [ "$status" = "healthy" ]; then
    echo "[up] db 已就绪"
    break
  fi
  if [ "$i" = "60" ]; then
    echo "[up] 等待 db 超时，继续启动..."
  fi
  sleep 1
done

# -- service --
if podman container exists "${PROJECT_NAME}-service"; then
  current_logs_src=$(podman inspect "${PROJECT_NAME}-service" \
    --format '{{range .Mounts}}{{if eq .Destination "/app/i-Core/logs"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)
  if [ "${current_logs_src}" != "${LOGS_HOST_DIR}" ]; then
    echo "[up] ${PROJECT_NAME}-service 的 logs 挂载需切换到 ${LOGS_HOST_DIR}，重建容器"
    podman rm -f "${PROJECT_NAME}-service" >/dev/null
  else
    echo "[up] ${PROJECT_NAME}-service 已存在，跳过"
  fi
fi

if ! podman container exists "${PROJECT_NAME}-service"; then
  podman run -d \
    --pod "${PROJECT_NAME}" \
    --name "${PROJECT_NAME}-service" \
    --restart unless-stopped \
    --env-file .env \
    -e DB_NAME="${POSTGRES_DB}" \
    -e DB_HOST=127.0.0.1 \
    -e DB_PORT=5432 \
    -e DB_USERNAME="${POSTGRES_USER}" \
    -e DB_PASSWORD="${POSTGRES_PASSWORD}" \
    -e PROJECT_PATH=/app/i-Core \
    -v "${LOGS_HOST_DIR}:/app/i-Core/logs:z,U" \
    --health-cmd "curl -sf -X POST http://127.0.0.1:7000/b/id_x_009/graphql -H 'Content-Type: application/json' -d '{\"query\":\"{ health { status } }\"}' || exit 1" \
    --health-interval 15s \
    --health-timeout 5s \
    --health-retries 10 \
    --health-start-period 30s \
    "${SERVICE_IMAGE}"
  echo "[up] ${PROJECT_NAME}-service 已启动（logs → ${LOGS_HOST_DIR}）"
fi

# -- web --
if ! podman container exists "${PROJECT_NAME}-web"; then
  podman run -d \
    --pod "${PROJECT_NAME}" \
    --name "${PROJECT_NAME}-web" \
    --restart unless-stopped \
    --health-cmd "wget -q -O /dev/null http://127.0.0.1:2000/ || exit 1" \
    --health-interval 15s \
    --health-timeout 5s \
    --health-retries 10 \
    --health-start-period 20s \
    "${WEB_IMAGE}"
  echo "[up] ${PROJECT_NAME}-web 已启动"
else
  echo "[up] ${PROJECT_NAME}-web 已存在，跳过"
fi

# -- haproxy --
if ! podman container exists "${PROJECT_NAME}-haproxy"; then
  podman run -d \
    --pod "${PROJECT_NAME}" \
    --name "${PROJECT_NAME}-haproxy" \
    --restart unless-stopped \
    -v ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro,z \
    "${HAPROXY_IMAGE}"
  echo "[up] ${PROJECT_NAME}-haproxy 已启动"
else
  echo "[up] ${PROJECT_NAME}-haproxy 已存在，跳过"
fi

# ============================================
# 5. 端到端验证
# ============================================
if command -v curl >/dev/null 2>&1; then
  echo "[up] 等待 haproxy 入口就绪..."
  for i in $(seq 1 30); do
    if curl -sf -o /dev/null "http://localhost:${POD_PORT}/"; then
      echo "[up] 入口已就绪"
      break
    fi
    if [ "$i" = "30" ]; then
      echo "[up] 警告: 入口验证超时，请用 podman logs ${PROJECT_NAME}-haproxy 排查" >&2
    fi
    sleep 1
  done
fi

echo "[up] 所有服务已启动，访问入口: http://localhost:${POD_PORT}/"
echo "[up] 数据库（pgvector）: ${DB_BIND_ADDR}:${DB_HOST_PORT}/${POSTGRES_DB}"
echo "[up] 前端登录: http://localhost:${POD_PORT}/f/009/login"
echo "[up] 日志透传: ${LOGS_HOST_DIR}  (info.log / warn.log / error.log)"
podman pod ls --filter name="${PROJECT_NAME}"
podman ps --filter pod="${PROJECT_NAME}" --format "table {{.Names}}\t{{.Status}}"
