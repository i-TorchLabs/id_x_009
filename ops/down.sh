#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# 停止并删除容器（顺序与启动相反）
for name in id_x_009-haproxy id_x_009-web id_x_009-service id_x_009-db; do
  if podman container exists "$name"; then
    podman rm -f "$name"
    echo "[down] $name 已删除"
  fi
done

# 删除 Pod
if podman pod exists id_x_009; then
  podman pod rm -f id_x_009
  echo "[down] Pod id_x_009 已删除"
fi

echo "[down] 所有服务已停止"
