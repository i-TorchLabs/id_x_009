"""GraphQL 控制器层（thin resolvers）—— id_x_009 AI 模型评测平台 Demo。

本模块仅承担 **请求路由与流量转发** 职责：
- 以 ``Query`` / ``Mutation`` 暴露 GraphQL 端点签名；
- 每个 resolver 仅做参数透传，委托到 ``src/views/x_views.py`` 的视图函数；
- 不包含任何业务逻辑、不直接操作数据库或第三方库。

业务实现见 ``x_views``，数据契约见 ``x_schemas``，ORM 模型见 ``x_models``。
"""
from typing import List, Optional

import strawberry

from x_models.id_x_009.src.schemas.x_schemas import (
    AuthResponseType,
    CreateTaskInput,
    CreateTaskResultType,
    DatasetType,
    EvalTaskType,
    ForgotPasswordInput,
    ForgotPasswordResponseType,
    HealthType,
    LoginInput,
    ModelType,
    RegisterInput,
    RegisterModelInput,
    RegisterModelResultType,
    ScoreGraphFilterInput,
    ScoreGraphType,
    TaskActionResultType,
    TaskReportType,
)
from x_models.id_x_009.src.views.x_views import (
    view_create_task,
    view_datasets,
    view_forgot_password,
    view_health,
    view_login,
    view_logout,
    view_models,
    view_pause_task,
    view_register,
    view_register_model,
    view_resume_task,
    view_score_cost_graph,
    view_task_detail,
    view_task_report,
    view_tasks,
)


@strawberry.type
class Query:
    @strawberry.field(description="健康检查")
    async def health(self) -> HealthType:
        return await view_health()

    @strawberry.field(description="模型注册中心列表（可按厂商/接入方式过滤）")
    async def models(
        self, vendor: Optional[str] = None, access_type: Optional[str] = None
    ) -> List[ModelType]:
        return await view_models(vendor, access_type)

    @strawberry.field(description="评测数据集列表与版本快照")
    async def datasets(self) -> List[DatasetType]:
        return await view_datasets()

    @strawberry.field(description="评测任务列表（可按状态过滤）")
    async def tasks(self, status: Optional[str] = None) -> List[EvalTaskType]:
        return await view_tasks(status)

    @strawberry.field(description="评测任务详情与状态机当前状态")
    async def task_detail(self, task_uid: str) -> Optional[EvalTaskType]:
        return await view_task_detail(task_uid)

    @strawberry.field(description="评测报告（六能力域得分 + 综合评分 + 成本/时延/吞吐）")
    async def task_report(self, task_uid: str) -> TaskReportType:
        return await view_task_report(task_uid)

    @strawberry.field(description="模型评分图谱数据（评分 × 成本散点 + Pareto 前沿）")
    async def score_cost_graph(
        self, filter: Optional[ScoreGraphFilterInput] = None
    ) -> ScoreGraphType:
        return await view_score_cost_graph(filter)


@strawberry.type
class Mutation:
    @strawberry.mutation(description="用户登录")
    async def login(self, input: LoginInput) -> AuthResponseType:
        return await view_login(input)

    @strawberry.mutation(description="用户注册")
    async def register(self, input: RegisterInput) -> AuthResponseType:
        return await view_register(input)

    @strawberry.mutation(description="忘记密码")
    async def forgot_password(
        self, input: ForgotPasswordInput
    ) -> ForgotPasswordResponseType:
        return await view_forgot_password(input)

    @strawberry.mutation(description="用户登出")
    async def logout(self) -> AuthResponseType:
        return await view_logout()

    @strawberry.mutation(description="注册模型（自研/开源/商用 API）")
    async def register_model(
        self, input: RegisterModelInput
    ) -> RegisterModelResultType:
        return await view_register_model(input)

    @strawberry.mutation(description="创建评测任务（数据集 + 模型 + 超参指纹）")
    async def create_task(self, input: CreateTaskInput) -> CreateTaskResultType:
        return await view_create_task(input)

    @strawberry.mutation(description="暂停任务（可断点续跑）")
    async def pause_task(self, task_uid: str) -> TaskActionResultType:
        return await view_pause_task(task_uid)

    @strawberry.mutation(description="恢复/重跑任务")
    async def resume_task(self, task_uid: str) -> TaskActionResultType:
        return await view_resume_task(task_uid)


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
)


def register_routers(route_prefix: str):
    """注册 GraphQL 路由，供主程序统一挂载。"""
    from litestar import Router

    from strawberry.litestar import make_graphql_controller

    GraphQLController = make_graphql_controller(
        schema,
        path="/graphql",
    )

    router = Router(
        path=route_prefix,
        route_handlers=[
            GraphQLController,
        ],
    )

    return router
