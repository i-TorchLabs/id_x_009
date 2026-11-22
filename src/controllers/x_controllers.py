from typing import Optional

import strawberry
from strawberry.types import Info

from x_models.id_x_009.src.schemas.x_schemas import (
    AuthResponseType,
    CreateTaskInput,
    CreateTaskResultType,
    DatasetsPageType,
    ForgotPasswordInput,
    ForgotPasswordResponseType,
    HealthType,
    LoginInput,
    ModelsPageType,
    RegisterInput,
    RegisterModelInput,
    RegisterModelResultType,
    ScoreGraphFilterInput,
    ScoreGraphType,
    TaskActionResultType,
    TaskReportType,
    TasksPageType,
    UpdateModelInput,
    EvalTaskType,
)
from x_models.id_x_009.src.views.x_views import (
    require_auth,
    view_create_task,
    view_datasets,
    view_delete_model,
    view_delete_task,
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
    view_update_model,
)


@strawberry.type
class Query:
    @strawberry.field(description="健康检查")
    async def health(self) -> HealthType:
        return await view_health()

    @strawberry.field(
        description="模型注册中心分页列表（需登录；默认每页 16 条）"
    )
    async def models(
        self,
        info: Info,
        vendor: Optional[str] = None,
        access_type: Optional[str] = None,
        name: Optional[str] = None,
        series: Optional[str] = None,
        model_name: Optional[str] = None,
        page: Optional[int] = 1,
        page_size: Optional[int] = 16,
    ) -> ModelsPageType:
        await require_auth(info)
        return await view_models(
            vendor=vendor,
            access_type=access_type,
            name=name,
            series=series,
            model_name=model_name,
            page=page,
            page_size=page_size,
        )

    @strawberry.field(description="评测数据集分页列表（需登录；默认每页 16 条）")
    async def datasets(
        self,
        info: Info,
        page: Optional[int] = 1,
        page_size: Optional[int] = 16,
    ) -> DatasetsPageType:
        await require_auth(info)
        return await view_datasets(page=page, page_size=page_size)

    @strawberry.field(description="评测任务分页列表（需登录；默认每页 16 条）")
    async def tasks(
        self,
        info: Info,
        status: Optional[str] = None,
        page: Optional[int] = 1,
        page_size: Optional[int] = 16,
    ) -> TasksPageType:
        await require_auth(info)
        return await view_tasks(status=status, page=page, page_size=page_size)

    @strawberry.field(description="评测任务详情与状态机当前状态（需登录）")
    async def task_detail(self, info: Info, task_uid: str) -> Optional[EvalTaskType]:
        await require_auth(info)
        return await view_task_detail(task_uid)

    @strawberry.field(description="评测报告（需登录）")
    async def task_report(self, info: Info, task_uid: str) -> TaskReportType:
        await require_auth(info)
        return await view_task_report(task_uid)

    @strawberry.field(
        description="模型评分图谱（公开只读，供 /f/009/dashboard 大屏；不含密钥明文）"
    )
    async def score_cost_graph(
        self, filter: Optional[ScoreGraphFilterInput] = None
    ) -> ScoreGraphType:
        return await view_score_cost_graph(filter)


@strawberry.type
class Mutation:
    @strawberry.mutation(description="用户登录")
    async def login(self, info: Info, input: LoginInput) -> AuthResponseType:
        return await view_login(input, info=info)

    @strawberry.mutation(description="用户注册")
    async def register(self, info: Info, input: RegisterInput) -> AuthResponseType:
        return await view_register(input, info=info)

    @strawberry.mutation(description="忘记密码")
    async def forgot_password(
        self, info: Info, input: ForgotPasswordInput
    ) -> ForgotPasswordResponseType:
        return await view_forgot_password(input, info=info)

    @strawberry.mutation(description="用户登出（吊销当前 Bearer 令牌）")
    async def logout(self, info: Info) -> AuthResponseType:
        return await view_logout(info)

    @strawberry.mutation(description="注册模型（需登录）")
    async def register_model(
        self, info: Info, input: RegisterModelInput
    ) -> RegisterModelResultType:
        await require_auth(info)
        return await view_register_model(input)

    @strawberry.mutation(description="更新已注册模型信息（需登录）")
    async def update_model(
        self, info: Info, input: UpdateModelInput
    ) -> RegisterModelResultType:
        await require_auth(info)
        return await view_update_model(input)

    @strawberry.mutation(description="删除已注册模型及其关联评测任务/结果（需登录）")
    async def delete_model(self, info: Info, model_id: int) -> TaskActionResultType:
        await require_auth(info)
        return await view_delete_model(model_id)

    @strawberry.mutation(description="创建评测任务（需登录）")
    async def create_task(
        self, info: Info, input: CreateTaskInput
    ) -> CreateTaskResultType:
        await require_auth(info)
        return await view_create_task(input)

    @strawberry.mutation(description="暂停任务（需登录）")
    async def pause_task(self, info: Info, task_uid: str) -> TaskActionResultType:
        await require_auth(info)
        return await view_pause_task(task_uid)

    @strawberry.mutation(description="恢复/重跑任务（需登录）")
    async def resume_task(self, info: Info, task_uid: str) -> TaskActionResultType:
        await require_auth(info)
        return await view_resume_task(task_uid)

    @strawberry.mutation(description="删除评测任务及其关联结果（需登录）")
    async def delete_task(self, info: Info, task_uid: str) -> TaskActionResultType:
        await require_auth(info)
        return await view_delete_task(task_uid)


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
)


def register_routers(route_prefix: str):
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
