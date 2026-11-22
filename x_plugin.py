from __future__ import annotations

import os
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from x_models._contracts import PluginInterface

# 曾误写入种子/默认值的演示 Key；启动时清空并由环境变量重新注入
_LEAKED_DEMO_API_KEYS = (
    "sk-c0NWVjzh9yAto2piPdsJ0ccHEKzXKjrEmlckXvEuAbdlbo5K",
)
_DEMO_SHA256 = "d2b000ce0875cad8615dd8cf34f788635c959a0ce2b8a977e22caab745380b06"
_DEMO_BCRYPT = "$2b$12$0Yjsya0o6BzuQJDZXW8rQ.rSTynSY6ulC4uCmlXbwhSJCnJdZMQ.q"


class _Idx009Plugin:

    name = "id_x_009"

    def __init__(self) -> None:
        self._base: Any = None

    @property
    def base(self) -> Any:
        if self._base is None:
            from x_models.id_x_009.src.models.x_models import Base
            self._base = Base
        return self._base

    @property
    def required_extensions(self) -> tuple[str, ...]:
        return ()

    def set_session_maker(self, maker: async_sessionmaker[AsyncSession]) -> None:
        from x_models.id_x_009.src.models.x_models import set_session_maker
        set_session_maker(maker)
        from x_models.id_x_009.src.services.daily_eval_scheduler import (
            start_daily_eval_scheduler,
        )
        start_daily_eval_scheduler()

    async def build_tables(self, conn: AsyncConnection) -> None:
        await conn.run_sync(self.base.metadata.create_all)
        await conn.execute(
            text("ALTER TABLE eval_tasks ADD COLUMN IF NOT EXISTS error_type VARCHAR(32)")
        )
        await self._migrate_to_models_info(conn)
        await self._scrub_and_inject_api_keys(conn)
        await self._upgrade_demo_password_hash(conn)

    async def _table_exists(self, conn: AsyncConnection, table: str) -> bool:
        result = await conn.execute(
            text(
                """
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = :t
                """
            ),
            {"t": table},
        )
        return result.scalar_one_or_none() is not None

    async def _migrate_to_models_info(self, conn: AsyncConnection) -> None:
        """将旧 models / model_info 合并进 models_info，并切换外键。"""
        has_models_info = await self._table_exists(conn, "models_info")
        has_models = await self._table_exists(conn, "models")
        has_model_info = await self._table_exists(conn, "model_info")

        if not has_models_info:
            # create_all 应已建表；兜底再确认
            await conn.run_sync(self.base.metadata.create_all)

        # 1) 从旧 models 迁入（优先保留 id，便于外键无缝切换）
        if has_models:
            info_count = (
                await conn.execute(text("SELECT COUNT(*) FROM models_info"))
            ).scalar_one()
            if int(info_count or 0) == 0:
                await conn.execute(
                    text(
                        """
                        INSERT INTO models_info (
                            id, name, vendor, series, version,
                            base_url, api_key, model_name,
                            access_type, backend, params_b, context_length,
                            input_price_per_1m, output_price_per_1m, created_at
                        )
                        SELECT
                            m.id,
                            m.name,
                            COALESCE(NULLIF(m.vendor, ''), 'Unknown'),
                            COALESCE(NULLIF(m.series, ''), m.name),
                            COALESCE(NULLIF(m.version, ''), 'gateway'),
                            COALESCE(NULLIF(m.base_url, ''), 'https://apihk.chinarouter.net/v1'),
                            COALESCE(m.api_key, ''),
                            COALESCE(NULLIF(m.model_name, ''), m.name),
                            COALESCE(NULLIF(m.access_type, ''), 'api'),
                            COALESCE(NULLIF(m.backend, ''), 'api'),
                            m.params_b,
                            COALESCE(m.context_length, 131072),
                            COALESCE(m.input_price_per_1m, 0),
                            COALESCE(m.output_price_per_1m, 0),
                            m.created_at
                        FROM models AS m
                        """
                    )
                )
            else:
                # models_info 已有数据：按 name+version 合并字段，并把外键从旧 id 映射到新 id
                await conn.execute(
                    text(
                        """
                        INSERT INTO models_info (
                            name, vendor, series, version,
                            base_url, api_key, model_name,
                            access_type, backend, params_b, context_length,
                            input_price_per_1m, output_price_per_1m, created_at
                        )
                        SELECT
                            m.name,
                            COALESCE(NULLIF(m.vendor, ''), 'Unknown'),
                            COALESCE(NULLIF(m.series, ''), m.name),
                            COALESCE(NULLIF(m.version, ''), 'gateway'),
                            COALESCE(NULLIF(m.base_url, ''), 'https://apihk.chinarouter.net/v1'),
                            COALESCE(m.api_key, ''),
                            COALESCE(NULLIF(m.model_name, ''), m.name),
                            COALESCE(NULLIF(m.access_type, ''), 'api'),
                            COALESCE(NULLIF(m.backend, ''), 'api'),
                            m.params_b,
                            COALESCE(m.context_length, 131072),
                            COALESCE(m.input_price_per_1m, 0),
                            COALESCE(m.output_price_per_1m, 0),
                            m.created_at
                        FROM models AS m
                        ON CONFLICT (name, version) DO UPDATE SET
                            vendor = EXCLUDED.vendor,
                            series = EXCLUDED.series,
                            base_url = COALESCE(
                                NULLIF(models_info.base_url, ''), EXCLUDED.base_url
                            ),
                            api_key = COALESCE(
                                NULLIF(models_info.api_key, ''), EXCLUDED.api_key
                            ),
                            model_name = COALESCE(
                                NULLIF(models_info.model_name, ''), EXCLUDED.model_name
                            ),
                            access_type = COALESCE(
                                NULLIF(models_info.access_type, ''), EXCLUDED.access_type
                            ),
                            backend = COALESCE(
                                NULLIF(models_info.backend, ''), EXCLUDED.backend
                            ),
                            input_price_per_1m = COALESCE(
                                NULLIF(models_info.input_price_per_1m, 0),
                                EXCLUDED.input_price_per_1m
                            ),
                            output_price_per_1m = COALESCE(
                                NULLIF(models_info.output_price_per_1m, 0),
                                EXCLUDED.output_price_per_1m
                            )
                        """
                    )
                )
                for table in ("eval_tasks", "eval_results", "eval_sample_results"):
                    if await self._table_exists(conn, table):
                        await conn.execute(
                            text(
                                f"""
                                UPDATE {table} AS t
                                SET model_id = i.id
                                FROM models AS m
                                JOIN models_info AS i
                                  ON i.name = m.name
                                 AND i.version = COALESCE(NULLIF(m.version, ''), 'gateway')
                                WHERE t.model_id = m.id
                                  AND t.model_id <> i.id
                                """
                            )
                        )
            await conn.execute(
                text(
                    """
                    SELECT setval(
                        pg_get_serial_sequence('models_info', 'id'),
                        GREATEST((SELECT COALESCE(MAX(id), 1) FROM models_info), 1)
                    )
                    """
                )
            )

        # 2) 从旧 model_info 补全/插入（gateway 版本）
        if has_model_info:
            await conn.execute(
                text(
                    """
                    INSERT INTO models_info (
                        name, vendor, series, version,
                        base_url, api_key, model_name,
                        access_type, backend, params_b, context_length,
                        input_price_per_1m, output_price_per_1m, created_at
                    )
                    SELECT
                        COALESCE(NULLIF(i.name, ''), i.model_name, 'unknown'),
                        COALESCE(NULLIF(i.vendor, ''), 'Unknown'),
                        COALESCE(NULLIF(i.series, ''), COALESCE(NULLIF(i.name, ''), i.model_name), 'unknown'),
                        'gateway',
                        COALESCE(NULLIF(i.base_url, ''), 'https://apihk.chinarouter.net/v1'),
                        COALESCE(i.api_key, ''),
                        COALESCE(NULLIF(i.model_name, ''), i.name, 'unknown'),
                        'api',
                        'api',
                        NULL,
                        131072,
                        COALESCE(i.input_price_per_1m, 0),
                        COALESCE(i.output_price_per_1m, 0),
                        i.created_at
                    FROM model_info AS i
                    ON CONFLICT (name, version) DO UPDATE SET
                        vendor = EXCLUDED.vendor,
                        series = EXCLUDED.series,
                        base_url = COALESCE(
                            NULLIF(models_info.base_url, ''),
                            EXCLUDED.base_url
                        ),
                        api_key = COALESCE(
                            NULLIF(models_info.api_key, ''),
                            EXCLUDED.api_key
                        ),
                        model_name = COALESCE(
                            NULLIF(models_info.model_name, ''),
                            EXCLUDED.model_name
                        ),
                        input_price_per_1m = COALESCE(
                            NULLIF(models_info.input_price_per_1m, 0),
                            EXCLUDED.input_price_per_1m
                        ),
                        output_price_per_1m = COALESCE(
                            NULLIF(models_info.output_price_per_1m, 0),
                            EXCLUDED.output_price_per_1m
                        )
                    """
                )
            )

        # 3) 外键切到 models_info（若仍指向 models）
        await self._repoint_model_foreign_keys(conn)

        # 4) 删除旧表（models 不用 CASCADE，避免误删仍挂旧外键的评测表）
        if has_model_info:
            await conn.execute(text("DROP TABLE IF EXISTS model_price CASCADE"))
            await conn.execute(text("DROP TABLE IF EXISTS model_info CASCADE"))
        if has_models:
            await conn.execute(text("DROP TABLE IF EXISTS models"))

    async def _repoint_model_foreign_keys(self, conn: AsyncConnection) -> None:
        """把 eval_* .model_id 外键从 models 切到 models_info。"""
        for table in ("eval_tasks", "eval_results", "eval_sample_results"):
            if not await self._table_exists(conn, table):
                continue
            await conn.execute(
                text(
                    f"""
                    DO $$
                    DECLARE
                        r RECORD;
                    BEGIN
                        FOR r IN
                            SELECT c.conname
                            FROM pg_constraint c
                            JOIN pg_class t ON t.oid = c.conrelid
                            JOIN pg_namespace n ON n.oid = t.relnamespace
                            WHERE n.nspname = 'public'
                              AND t.relname = '{table}'
                              AND c.contype = 'f'
                              AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES models(%'
                        LOOP
                            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', '{table}', r.conname);
                        END LOOP;

                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint c
                            JOIN pg_class t ON t.oid = c.conrelid
                            JOIN pg_namespace n ON n.oid = t.relnamespace
                            WHERE n.nspname = 'public'
                              AND t.relname = '{table}'
                              AND c.contype = 'f'
                              AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES models_info(%'
                        ) THEN
                            EXECUTE format(
                                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (model_id) REFERENCES models_info(id)',
                                '{table}',
                                '{table}_model_id_fkey'
                            );
                        END IF;
                    END $$;
                    """
                )
            )

    async def _scrub_and_inject_api_keys(self, conn: AsyncConnection) -> None:
        """清除误入库明文 Key，并用 ID009_LLM_API_KEY 回填空值。"""
        if not await self._table_exists(conn, "models_info"):
            return
        for leaked in _LEAKED_DEMO_API_KEYS:
            await conn.execute(
                text("UPDATE models_info SET api_key = '' WHERE api_key = :k"),
                {"k": leaked},
            )
        env_key = os.getenv("ID009_LLM_API_KEY", "").strip()
        if not env_key:
            return
        await conn.execute(
            text(
                """
                UPDATE models_info
                SET api_key = :k
                WHERE COALESCE(NULLIF(api_key, ''), '') = ''
                """
            ),
            {"k": env_key},
        )

    async def _upgrade_demo_password_hash(self, conn: AsyncConnection) -> None:
        """将演示账号存量 SHA256 哈希升级为 bcrypt（仅匹配已知弱哈希）。"""
        await conn.execute(
            text(
                """
                UPDATE users
                SET password_hash = :bcrypt
                WHERE email = 'demo@id-x-009.local'
                  AND password_hash = :sha256
                """
            ),
            {"bcrypt": _DEMO_BCRYPT, "sha256": _DEMO_SHA256},
        )


def load_plugin() -> PluginInterface:
    return _Idx009Plugin()
