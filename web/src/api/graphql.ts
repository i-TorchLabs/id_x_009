/**
 * GraphQL API 客户端
 * 用于与 id_x_009（AI 模型评测平台）后端 GraphQL 接口交互
 */

import { API_BASE_URL } from "@/utils/config";

// GraphQL 请求配置
interface GraphQLRequestConfig {
  query: string;
  variables?: Record<string, any>;
}

// GraphQL 响应类型
interface GraphQLResponse<T = any> {
  data: T;
  errors?: Array<{ message: string }>;
}

/**
 * GraphQL 客户端类
 */
class GraphQLClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 获取默认请求头
   */
  private getDefaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 如果有 token，添加到请求头
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  /**
   * 发送 GraphQL 请求
   */
  async request<T = any>(
    config: GraphQLRequestConfig,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.getDefaultHeaders(),
      body: JSON.stringify({
        query: config.query,
        variables: config.variables,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result: GraphQLResponse<T> = await response.json();

    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors[0].message);
    }

    if (result.data === undefined || result.data === null) {
      throw new Error("GraphQL 响应中缺少 data 字段");
    }

    return result.data;
  }
}

// 导出 GraphQL 客户端实例
export const graphqlClient = new GraphQLClient();

// ──────────────────────────────────────────────
// 用户相关类型
// ──────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  confirmPassword: string;
  phone?: string;
}

export interface RegisterPayload {
  register: {
    success: boolean;
    message: string;
    token: string | null;
    user: {
      id: number;
      email: string;
      phone: string | null;
      createdAt: string | null;
    } | null;
  };
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginPayload {
  login: {
    success: boolean;
    message: string;
    token: string | null;
    user: {
      id: number;
      email: string;
      phone: string | null;
      createdAt: string | null;
    } | null;
  };
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ForgotPasswordPayload {
  forgotPassword: {
    success: boolean;
    message: string;
    resetToken: string | null;
  };
}

export interface LogoutPayload {
  logout: {
    success: boolean;
    message: string;
    token: null;
    user: null;
  };
}

// ──────────────────────────────────────────────
// 评测平台相关类型
// ──────────────────────────────────────────────

export interface DomainScore {
  domain: string;
  score: number;
  weight: number;
}

export interface ModelItem {
  id: string;
  name: string;
  vendor: string;
  series: string;
  version: string;
  accessType: string; // selfhost | api | opensource
  backend: string; // vllm | trtllm | tgi | api
  paramsB: number | null;
  contextLength: number | null;
  createdAt: string | null;
}

export interface DatasetItem {
  id: string;
  name: string;
  version: string;
  snapshot: string;
  domain: string;
  sampleCount: number;
  description: string;
}

export interface EvalTaskItem {
  id: string;
  taskUid: string;
  name: string;
  modelId: string;
  modelName: string;
  modelVendor: string;
  datasetIds: string[];
  backend: string;
  status: string; // Draft | Pending | Running | Paused | Done | Failed
  progress: number;
  fingerprint: string | null;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RegisterModelInput {
  name: string;
  vendor: string;
  series: string;
  version: string;
  accessType: string;
  backend: string;
  paramsB?: number | null;
  contextLength?: number | null;
}

export interface CreateTaskInput {
  name: string;
  modelId: string;
  datasetIds: string[];
  backend: string;
  temperature: number;
  maxTokens: number;
}

export interface ScoreGraphFilterInput {
  vendors?: string[];
  accessType?: string;
  backend?: string;
  minScore?: number;
  maxCost?: number;
}

export interface ScorePoint {
  modelId: string;
  name: string;
  vendor: string;
  series: string;
  version: string;
  accessType: string;
  backend: string;
  compositeScore: number;
  costPerTask: number;
  latencyP50: number;
  throughput: number;
  domainScores: DomainScore[];
  taskUid: string;
  onFrontier: boolean;
  valueRank: number;
}

export interface FrontierPoint {
  x: number;
  y: number;
}

export interface ScoreGraph {
  points: ScorePoint[];
  frontier: FrontierPoint[];
  vendors: string[];
}

export interface TaskReport {
  success: boolean;
  message: string;
  taskUid: string;
  taskName: string;
  modelName: string;
  status: string;
  compositeScore: number;
  costPerTask: number;
  latencyP50: number;
  throughput: number;
  domainScores: DomainScore[];
  fingerprint: string | null;
}

export interface ListModelsPayload {
  models: ModelItem[];
}

export interface ListDatasetsPayload {
  datasets: DatasetItem[];
}

export interface ListTasksPayload {
  tasks: EvalTaskItem[];
}

export interface TaskDetailPayload {
  taskDetail: EvalTaskItem | null;
}

export interface TaskReportPayload {
  taskReport: TaskReport;
}

export interface ScoreCostGraphPayload {
  scoreCostGraph: ScoreGraph;
}

export interface RegisterModelPayload {
  registerModel: {
    success: boolean;
    message: string;
    model: ModelItem | null;
  };
}

export interface CreateTaskPayload {
  createTask: {
    success: boolean;
    message: string;
    task: EvalTaskItem | null;
  };
}

export interface TaskActionPayload {
  pauseTask?: {
    success: boolean;
    message: string;
    status: string;
  };
  resumeTask?: {
    success: boolean;
    message: string;
    status: string;
  };
}

// ──────────────────────────────────────────────
// 用户 GraphQL API
// ──────────────────────────────────────────────

export const userGraphqlApi = {
  /**
   * 用户注册
   */
  register: async (input: RegisterInput): Promise<RegisterPayload> => {
    const mutation = `
      mutation Register($input: RegisterInput!) {
        register(input: $input) {
          success
          message
          token
          user {
            id
            email
            phone
            createdAt
          }
        }
      }
    `;

    return graphqlClient.request<RegisterPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 用户登录
   */
  login: async (input: LoginInput): Promise<LoginPayload> => {
    const mutation = `
      mutation Login($input: LoginInput!) {
        login(input: $input) {
          success
          message
          token
          user {
            id
            email
            phone
            createdAt
          }
        }
      }
    `;

    return graphqlClient.request<LoginPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 忘记密码
   */
  forgotPassword: async (
    input: ForgotPasswordInput,
  ): Promise<ForgotPasswordPayload> => {
    const mutation = `
      mutation ForgotPassword($input: ForgotPasswordInput!) {
        forgotPassword(input: $input) {
          success
          message
          resetToken
        }
      }
    `;

    return graphqlClient.request<ForgotPasswordPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 用户登出
   */
  logout: async (): Promise<LogoutPayload> => {
    const mutation = `
      mutation Logout {
        logout {
          success
          message
          token
          user {
            id
          }
        }
      }
    `;

    return graphqlClient.request<LogoutPayload>({
      query: mutation,
    });
  },
};

// ──────────────────────────────────────────────
// 评测平台 GraphQL API
// ──────────────────────────────────────────────

export const evalGraphqlApi = {
  /**
   * 模型列表
   */
  listModels: async (
    vendor?: string,
    accessType?: string,
  ): Promise<ListModelsPayload> => {
    const query = `
      query Models($vendor: String, $accessType: String) {
        models(vendor: $vendor, accessType: $accessType) {
          id
          name
          vendor
          series
          version
          accessType
          backend
          paramsB
          contextLength
          createdAt
        }
      }
    `;

    return graphqlClient.request<ListModelsPayload>({
      query,
      variables: { vendor, accessType },
    });
  },

  /**
   * 数据集列表
   */
  listDatasets: async (): Promise<ListDatasetsPayload> => {
    const query = `
      query Datasets {
        datasets {
          id
          name
          version
          snapshot
          domain
          sampleCount
          description
        }
      }
    `;

    return graphqlClient.request<ListDatasetsPayload>({
      query,
    });
  },

  /**
   * 评测任务列表
   */
  listTasks: async (status?: string): Promise<ListTasksPayload> => {
    const query = `
      query Tasks($status: String) {
        tasks(status: $status) {
          id
          taskUid
          name
          modelId
          modelName
          modelVendor
          datasetIds
          backend
          status
          progress
          fingerprint
          error
          createdAt
          updatedAt
        }
      }
    `;

    return graphqlClient.request<ListTasksPayload>({
      query,
      variables: { status },
    });
  },

  /**
   * 任务详情
   */
  getTaskDetail: async (taskUid: string): Promise<TaskDetailPayload> => {
    const query = `
      query TaskDetail($taskUid: String!) {
        taskDetail(taskUid: $taskUid) {
          id
          taskUid
          name
          modelId
          modelName
          modelVendor
          datasetIds
          backend
          status
          progress
          fingerprint
          error
          createdAt
          updatedAt
        }
      }
    `;

    return graphqlClient.request<TaskDetailPayload>({
      query,
      variables: { taskUid },
    });
  },

  /**
   * 任务报告
   */
  getTaskReport: async (taskUid: string): Promise<TaskReportPayload> => {
    const query = `
      query TaskReport($taskUid: String!) {
        taskReport(taskUid: $taskUid) {
          success
          message
          taskUid
          taskName
          modelName
          status
          compositeScore
          costPerTask
          latencyP50
          throughput
          domainScores {
            domain
            score
            weight
          }
          fingerprint
        }
      }
    `;

    return graphqlClient.request<TaskReportPayload>({
      query,
      variables: { taskUid },
    });
  },

  /**
   * 评分-成本图谱
   */
  getScoreCostGraph: async (
    filter?: ScoreGraphFilterInput,
  ): Promise<ScoreCostGraphPayload> => {
    const query = `
      query ScoreCostGraph($filter: ScoreGraphFilterInput) {
        scoreCostGraph(filter: $filter) {
          points {
            modelId
            name
            vendor
            series
            version
            accessType
            backend
            compositeScore
            costPerTask
            latencyP50
            throughput
            domainScores {
              domain
              score
              weight
            }
            taskUid
            onFrontier
            valueRank
          }
          frontier {
            x
            y
          }
          vendors
        }
      }
    `;

    return graphqlClient.request<ScoreCostGraphPayload>({
      query,
      variables: { filter },
    });
  },

  /**
   * 注册模型
   */
  registerModel: async (
    input: RegisterModelInput,
  ): Promise<RegisterModelPayload> => {
    const mutation = `
      mutation RegisterModel($input: RegisterModelInput!) {
        registerModel(input: $input) {
          success
          message
          model {
            id
            name
            vendor
            series
            version
            accessType
            backend
            paramsB
            contextLength
            createdAt
          }
        }
      }
    `;

    return graphqlClient.request<RegisterModelPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 创建评测任务
   */
  createTask: async (input: CreateTaskInput): Promise<CreateTaskPayload> => {
    const mutation = `
      mutation CreateTask($input: CreateTaskInput!) {
        createTask(input: $input) {
          success
          message
          task {
            id
            taskUid
            name
            modelId
            modelName
            modelVendor
            datasetIds
            backend
            status
            progress
            fingerprint
            error
            createdAt
            updatedAt
          }
        }
      }
    `;

    return graphqlClient.request<CreateTaskPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 暂停任务
   */
  pauseTask: async (taskUid: string): Promise<TaskActionPayload> => {
    const mutation = `
      mutation PauseTask($taskUid: String!) {
        pauseTask(taskUid: $taskUid) {
          success
          message
          status
        }
      }
    `;

    return graphqlClient.request<TaskActionPayload>({
      query: mutation,
      variables: { taskUid },
    });
  },

  /**
   * 续跑任务
   */
  resumeTask: async (taskUid: string): Promise<TaskActionPayload> => {
    const mutation = `
      mutation ResumeTask($taskUid: String!) {
        resumeTask(taskUid: $taskUid) {
          success
          message
          status
        }
      }
    `;

    return graphqlClient.request<TaskActionPayload>({
      query: mutation,
      variables: { taskUid },
    });
  },
};
