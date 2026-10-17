from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    pass


_session_maker: Optional[async_sessionmaker[AsyncSession]] = None


def set_session_maker(maker: async_sessionmaker[AsyncSession]) -> None:
    global _session_maker
    _session_maker = maker


def get_session() -> async_sessionmaker[AsyncSession]:
    if _session_maker is None:
        raise RuntimeError("数据库会话工厂未初始化，请先调用 set_session_maker()")
    return _session_maker


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)




class UserToken(Base):
    __tablename__ = "user_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, comment="用户ID"
    )
    token: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True, comment="认证令牌"
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, comment="过期时间"
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_utcnow, comment="创建时间"
    )

    user: Mapped["User"] = relationship("User", back_populates="tokens")

    def is_valid(self) -> bool:
        if self.expires_at is None:
            return False
        return self.expires_at > datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True, comment="邮箱"
    )
    phone: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, index=True, comment="电话号码"
    )
    password_hash: Mapped[str] = mapped_column(
        String(256), nullable=False, comment="密码哈希"
    )
    is_active: Mapped[Optional[bool]] = mapped_column(
        Boolean, default=True, comment="是否激活"
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_utcnow, comment="创建时间"
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        comment="更新时间",
    )

    reset_tokens: Mapped[List["PasswordResetToken"]] = relationship(
        "PasswordResetToken", back_populates="user"
    )
    tokens: Mapped[List["UserToken"]] = relationship("UserToken", back_populates="user")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, comment="用户ID"
    )
    token: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True, comment="重置令牌"
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, comment="过期时间"
    )
    used: Mapped[Optional[bool]] = mapped_column(
        Boolean, default=False, comment="是否已使用"
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_utcnow, comment="创建时间"
    )

    user: Mapped["User"] = relationship("User", back_populates="reset_tokens")

    def is_valid(self) -> bool:
        if self.used:
            return False
        if self.expires_at is None:
            return False
        return self.expires_at > datetime.now(timezone.utc)




class Model(Base):

    __tablename__ = "models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, comment="模型名称")
    vendor: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True, comment="厂商"
    )
    series: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True, comment="模型系列"
    )
    version: Mapped[str] = mapped_column(String(64), nullable=False, comment="版本")
    access_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="api", comment="接入方式：selfhost/api/opensource"
    )
    backend: Mapped[str] = mapped_column(
        String(32), nullable=False, default="vllm", comment="推理后端：vllm/trtllm/tgi/api"
    )
    params_b: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True, comment="参数量（B，商用 API 为空）"
    )
    context_length: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="上下文长度（tokens）"
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_utcnow, comment="创建时间"
    )

    results: Mapped[List["EvalResult"]] = relationship(
        "EvalResult", back_populates="model"
    )


class Dataset(Base):

    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, comment="数据集名称")
    version: Mapped[str] = mapped_column(String(64), nullable=False, comment="版本号")
    snapshot: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="版本快照标识（如 ds@2026.08:snapshot-101）"
    )
    domain: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True, comment="能力域"
    )
    sample_count: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="样本数量"
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="数据集描述"
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_utcnow, comment="创建时间"
    )


class EvalTask(Base):

    __tablename__ = "eval_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_uid: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True, comment="任务外部标识"
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False, comment="任务名称")
    model_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("models.id"), nullable=False, comment="评测模型"
    )
    dataset_ids: Mapped[str] = mapped_column(
        Text, nullable=False, comment="数据集 ID 列表（JSON 数组字符串）"
    )
    backend: Mapped[str] = mapped_column(
        String(32), nullable=False, default="vllm", comment="推理后端"
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="Draft", index=True,
        comment="状态机：Draft/Pending/Running/Paused/Done/Failed",
    )
    progress: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="进度 0-100"
    )
    fingerprint: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="可复现指纹（JSON：dataset/model/engine/hyper）"
    )
    error: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="失败原因"
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_utcnow, comment="创建时间"
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        comment="更新时间",
    )

    result: Mapped[Optional["EvalResult"]] = relationship(
        "EvalResult", back_populates="task", uselist=False
    )
    model: Mapped["Model"] = relationship("Model")


class EvalResult(Base):

    __tablename__ = "eval_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("eval_tasks.id"), nullable=False, unique=True,
        comment="关联评测任务",
    )
    model_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("models.id"), nullable=False, index=True, comment="模型"
    )
    score_reasoning: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, comment="客观知识与推理"
    )
    score_language: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, comment="语言与生成"
    )
    score_alignment: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, comment="对齐与安全"
    )
    score_longctx: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, comment="长上下文"
    )
    score_multimodal: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, comment="多模态"
    )
    score_business: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, comment="业务专项"
    )
    composite_score: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, index=True, comment="综合评分（加权聚合）"
    )
    cost_per_task: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, comment="每任务推理成本（USD）"
    )
    latency_p50: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True, comment="P50 首 token 时延（ms）"
    )
    throughput: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True, comment="生成吞吐（tokens/s）"
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_utcnow, comment="创建时间"
    )

    task: Mapped["EvalTask"] = relationship("EvalTask", back_populates="result")
    model: Mapped["Model"] = relationship("Model", back_populates="results")
