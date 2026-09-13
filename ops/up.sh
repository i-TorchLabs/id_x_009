#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# 加载 .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[up] 已从 .env.example 生成 .env，请按需修改后重新运行"
  exit 1
fi
source .env

# ============================================
# 1. 构建镜像（若不存在或指定 --build）
# ============================================
if [ "${1:-}" = "--build" ] || ! podman image exists id_x_009-service || ! podman image exists id_x_009-web; then
  echo "[up] 构建 service 镜像..."
  podman build -t id_x_009-service -f Dockerfile.service ../../../
  echo "[up] 构建 web 镜像..."
  podman build -t id_x_009-web -f ../web/Dockerfile \
    --build-arg NEXT_PUBLIC_BASE_URL="" \
    --build-arg NEXT_PUBLIC_SUB_VERSION="/b/id_x_009/graphql" \
    ../web
fi

# ============================================
# 2. 创建 Pod（已存在则跳过）
#    haproxy:8080 -> pod:8080 -> 宿主机:8009
# ============================================
if ! podman pod exists id_x_009; then
  podman pod create --name id_x_009 -p 8009:8080
  echo "[up] Pod id_x_009 已创建，端口映射 8009:8080"
fi

# ============================================
# 3. 创建数据卷（已存在则跳过）
# ============================================
if ! podman volume exists id_x_009_db; then
  podman volume create id_x_009_db
  echo "[up] 数据卷 id_x_009_db 已创建"
fi

# 日志目录（宿主机 i-Core 仓库根下的 logs/）：macOS podman machine
# 不会自动创建 bind mount 源，且对相对路径解析不可靠（会解释为 VM 内
# /logs），这里解析为绝对路径并预先创建。
LOGS_HOST_DIR="$(cd ../../../ && pwd)/logs"
mkdir -p "$LOGS_HOST_DIR"

# ============================================
# 4. 启动容器（已存在则跳过）
# ============================================

# -- db --
if ! podman container exists id_x_009-db; then
  podman run -d \
    --pod id_x_009 \
    --name id_x_009-db \
    --restart unless-stopped \
    -e POSTGRES_DB="${POSTGRES_DB:-id_x_009}" \
    -e POSTGRES_USER="${POSTGRES_USER:-postgres}" \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-P@sspostgres!}" \
    -v id_x_009_db:/var/lib/postgresql \
    -v ./init:/docker-entrypoint-initdb.d:ro \
    --health-cmd "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-id_x_009}" \
    --health-interval 10s \
    --health-timeout 5s \
    --health-retries 10 \
    --health-start-period 20s \
    docker.io/library/postgres:18
  echo "[up] id_x_009-db 已启动"
else
  echo "[up] id_x_009-db 已存在，跳过"
fi

# 等待 db 就绪
echo "[up] 等待 db 健康检查通过..."
for i in $(seq 1 60); do
  status=$(podman inspect id_x_009-db --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
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
if ! podman container exists id_x_009-service; then
  podman run -d \
    --pod id_x_009 \
    --name id_x_009-service \
    --restart unless-stopped \
    --env-file .env \
    -e DB_NAME="${POSTGRES_DB:-id_x_009}" \
    -e DB_HOST=127.0.0.1 \
    -e DB_PORT=5432 \
    -e DB_USERNAME="${POSTGRES_USER:-postgres}" \
    -e DB_PASSWORD="${POSTGRES_PASSWORD:-P@sspostgres!}" \
    -e PROJECT_PATH=/app/i-Core \
    -v "$LOGS_HOST_DIR":/app/i-Core/logs \
    --health-cmd "curl -s -o /dev/null http://127.0.0.1:7000/b/id_x_009/graphql || exit 1" \
    --health-interval 15s \
    --health-timeout 5s \
    --health-retries 10 \
    --health-start-period 30s \
    id_x_009-service
  echo "[up] id_x_009-service 已启动"
else
  echo "[up] id_x_009-service 已存在，跳过"
fi

# -- web --
if ! podman container exists id_x_009-web; then
  podman run -d \
    --pod id_x_009 \
    --name id_x_009-web \
    --restart unless-stopped \
    id_x_009-web
  echo "[up] id_x_009-web 已启动"
else
  echo "[up] id_x_009-web 已存在，跳过"
fi

# -- haproxy --
if ! podman container exists id_x_009-haproxy; then
  podman run -d \
    --pod id_x_009 \
    --name id_x_009-haproxy \
    --restart unless-stopped \
    -v ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro \
    docker.io/library/haproxy:3.0
  echo "[up] id_x_009-haproxy 已启动"
else
  echo "[up] id_x_009-haproxy 已存在，跳过"
fi

echo "[up] 所有服务已启动"
podman pod ls --filter name=id_x_009
podman ps --filter pod=id_x_009 --format "table {{.Names}}\t{{.Status}}"
