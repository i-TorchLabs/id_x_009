from typing import List, Optional

import strawberry


@strawberry.type
class HealthType:
    status: str = strawberry.field(description="状态")
    service: str = strawberry.field(description="服务名称")




@strawberry.input
class LoginInput:
    email: str = strawberry.field(description="邮箱")
    password: str = strawberry.field(description="密码")


@strawberry.input
class RegisterInput:
    email: str = strawberry.field(description="邮箱")
    password: str = strawberry.field(description="密码")
    confirm_password: str = strawberry.field(description="确认密码")
    phone: Optional[str] = strawberry.field(default=None, description="电话号码")


@strawberry.input
class ForgotPasswordInput:
    email: str = strawberry.field(description="邮箱")


@strawberry.type
class UserInfoType:
    id: int = strawberry.field(description="用户ID")
    email: str = strawberry.field(description="邮箱")
    phone: Optional[str] = strawberry.field(default=None, description="电话号码")
    created_at: Optional[str] = strawberry.field(default=None, description="创建时间")


@strawberry.type
class AuthResponseType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    token: Optional[str] = strawberry.field(default=None, description="认证令牌")
    expires_at: Optional[str] = strawberry.field(
        default=None, description="令牌过期时间（ISO格式）"
    )
    user: Optional[UserInfoType] = strawberry.field(default=None, description="用户信息")


@strawberry.type
class ForgotPasswordResponseType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    reset_token: Optional[str] = strawberry.field(
        default=None, description="重置令牌（仅用于演示，生产环境应发送邮件）"
    )




@strawberry.type
class ModelType:
    id: int = strawberry.field(description="模型ID")
    name: str = strawberry.field(description="模型名称")
    vendor: str = strawberry.field(description="厂商")
    series: str = strawberry.field(description="模型系列")
    version: str = strawberry.field(description="版本")
    access_type: str = strawberry.field(description="接入方式：selfhost/api/opensource")
    backend: str = strawberry.field(description="推理后端：vllm/trtllm/tgi/api")
    params_b: Optional[float] = strawberry.field(
        default=None, description="参数量（B，商用 API 为空）"
    )
    context_length: Optional[int] = strawberry.field(
        default=None, description="上下文长度（tokens）"
    )
    created_at: Optional[str] = strawberry.field(default=None, description="注册时间")


@strawberry.input
class RegisterModelInput:
    name: str = strawberry.field(description="模型名称")
    vendor: str = strawberry.field(description="厂商")
    series: str = strawberry.field(description="模型系列")
    version: str = strawberry.field(description="版本")
    access_type: str = strawberry.field(
        default="api", description="接入方式：selfhost/api/opensource"
    )
    backend: str = strawberry.field(
        default="vllm", description="推理后端：vllm/trtllm/tgi/api"
    )
    params_b: Optional[float] = strawberry.field(default=None, description="参数量（B）")
    context_length: Optional[int] = strawberry.field(
        default=None, description="上下文长度（tokens）"
    )


@strawberry.type
class RegisterModelResultType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    model: Optional[ModelType] = strawberry.field(default=None, description="注册的模型")




@strawberry.type
class DatasetType:
    id: int = strawberry.field(description="数据集ID")
    name: str = strawberry.field(description="数据集名称")
    version: str = strawberry.field(description="版本号")
    snapshot: str = strawberry.field(description="版本快照标识")
    domain: str = strawberry.field(description="能力域")
    sample_count: Optional[int] = strawberry.field(default=None, description="样本数量")
    description: Optional[str] = strawberry.field(default=None, description="数据集描述")




@strawberry.type
class EvalTaskType:
    id: int = strawberry.field(description="任务ID")
    task_uid: str = strawberry.field(description="任务外部标识")
    name: str = strawberry.field(description="任务名称")
    model_id: int = strawberry.field(description="评测模型ID")
    model_name: str = strawberry.field(default="", description="模型名称（联表）")
    model_vendor: str = strawberry.field(default="", description="模型厂商（联表）")
    dataset_ids: List[int] = strawberry.field(
        default_factory=list, description="数据集 ID 列表"
    )
    backend: str = strawberry.field(description="推理后端")
    status: str = strawberry.field(
        description="状态机：Draft/Pending/Running/Paused/Done/Failed"
    )
    progress: int = strawberry.field(description="进度 0-100")
    fingerprint: Optional[str] = strawberry.field(
        default=None, description="可复现指纹（JSON）"
    )
    error: Optional[str] = strawberry.field(default=None, description="失败原因")
    created_at: Optional[str] = strawberry.field(default=None, description="创建时间")
    updated_at: Optional[str] = strawberry.field(default=None, description="更新时间")


@strawberry.input
class CreateTaskInput:
    name: str = strawberry.field(description="任务名称")
    model_id: int = strawberry.field(description="评测模型 ID")
    dataset_ids: List[int] = strawberry.field(description="数据集 ID 列表")
    backend: str = strawberry.field(default="vllm", description="推理后端")
    temperature: float = strawberry.field(default=0.0, description="采样温度")
    max_tokens: int = strawberry.field(default=2048, description="最大生成 tokens")


@strawberry.type
class CreateTaskResultType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    task: Optional[EvalTaskType] = strawberry.field(default=None, description="创建的任务")


@strawberry.type
class TaskActionResultType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    status: str = strawberry.field(default="", description="动作后的任务状态")




@strawberry.type
class DomainScoreType:
    domain: str = strawberry.field(description="能力域名称")
    score: float = strawberry.field(description="得分（0-100）")
    weight: float = strawberry.field(description="聚合权重")


@strawberry.type
class TaskReportType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    task_uid: str = strawberry.field(default="", description="任务外部标识")
    task_name: str = strawberry.field(default="", description="任务名称")
    model_name: str = strawberry.field(default="", description="模型名称")
    status: str = strawberry.field(default="", description="任务状态")
    composite_score: float = strawberry.field(default=0, description="综合评分")
    cost_per_task: float = strawberry.field(default=0, description="每任务成本（USD）")
    latency_p50: Optional[float] = strawberry.field(
        default=None, description="P50 时延（ms）"
    )
    throughput: Optional[float] = strawberry.field(
        default=None, description="吞吐（tokens/s）"
    )
    domain_scores: List[DomainScoreType] = strawberry.field(
        default_factory=list, description="六能力域得分"
    )
    fingerprint: Optional[str] = strawberry.field(
        default=None, description="可复现指纹（JSON）"
    )




@strawberry.type
class ScorePointType:
    model_id: int = strawberry.field(description="模型ID")
    name: str = strawberry.field(description="模型名称")
    vendor: str = strawberry.field(description="厂商")
    series: str = strawberry.field(description="系列")
    version: str = strawberry.field(description="版本")
    access_type: str = strawberry.field(description="接入方式")
    backend: str = strawberry.field(description="推理后端")
    composite_score: float = strawberry.field(description="综合评分")
    cost_per_task: float = strawberry.field(description="每任务推理成本（USD）")
    latency_p50: Optional[float] = strawberry.field(default=None, description="P50 时延（ms）")
    throughput: Optional[float] = strawberry.field(default=None, description="吞吐（tokens/s）")
    domain_scores: List[DomainScoreType] = strawberry.field(
        default_factory=list, description="六能力域得分"
    )
    task_uid: str = strawberry.field(default="", description="溯源评测任务标识")
    on_frontier: bool = strawberry.field(default=False, description="是否位于性价比前沿")
    value_rank: int = strawberry.field(default=0, description="性价比排名（评分/成本）")


@strawberry.type
class FrontierPointType:
    x: float = strawberry.field(description="X 轴值（每任务成本 USD）")
    y: float = strawberry.field(description="Y 轴值（综合评分）")


@strawberry.type
class ScoreGraphType:
    points: List[ScorePointType] = strawberry.field(
        default_factory=list, description="评分散点（气泡即模型）"
    )
    frontier: List[FrontierPointType] = strawberry.field(
        default_factory=list, description="性价比前沿（Pareto Frontier，按成本升序）"
    )
    vendors: List[str] = strawberry.field(
        default_factory=list, description="图中出现的厂商列表"
    )


@strawberry.input
class ScoreGraphFilterInput:
    vendors: Optional[List[str]] = strawberry.field(default=None, description="厂商过滤")
    access_type: Optional[str] = strawberry.field(default=None, description="接入方式过滤")
    backend: Optional[str] = strawberry.field(default=None, description="推理后端过滤")
    min_score: Optional[float] = strawberry.field(default=None, description="最低综合评分")
    max_cost: Optional[float] = strawberry.field(
        default=None, description="最高每任务成本（USD）"
    )
