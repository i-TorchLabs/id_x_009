
import { API_BASE_URL } from "@/utils/config";

interface GraphQLRequestConfig {
  query: string;
  variables?: Record<string, any>;
}

interface GraphQLResponse<T = any> {
  data: T;
  errors?: Array<{ message: string }>;
}

class GraphQLClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private getDefaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    return headers;
  }

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

export const graphqlClient = new GraphQLClient();


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


export interface DomainScore {
  domain: string;
  score: number;
  weight: number;
}

export interface ModelItem {
  id: number;
  name: string;
  vendor: string;
  series: string;
  baseUrl: string;
  apiKeyMasked: string;
  modelName: string;
  accessType: string;
  backend: string;
  paramsB: number | null;
  contextLength: number | null;
  inputPricePer1m: number | null;
  outputPricePer1m: number | null;
  createdAt: string | null;
}

export interface DatasetItem {
  id: number;
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
  status: string;
  progress: number;
  fingerprint: string | null;
  error: string | null;
  errorType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RegisterModelInput {
  name: string;
  vendor: string;
  series: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  inputPricePer1m?: number | null;
  outputPricePer1m?: number | null;
  accessType?: string;
  backend?: string;
  paramsB?: number | null;
  contextLength?: number | null;
}

export interface UpdateModelInput {
  modelId: number;
  name: string;
  vendor: string;
  series: string;
  baseUrl: string;
  apiKey?: string | null;
  modelName: string;
  inputPricePer1m?: number | null;
  outputPricePer1m?: number | null;
  accessType?: string;
  backend?: string;
  paramsB?: number | null;
  contextLength?: number | null;
}

export interface CreateTaskInput {
  name: string;
  modelId: number;
  datasetIds: number[];
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
  accessType: string;
  backend: string;
  compositeScore: number;
  costPerTask: number;
  inputPricePer1m: number | null;
  outputPricePer1m: number | null;
  latencyP50: number | null;
  throughput: number | null;
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
  inputPricePer1m: number | null;
  outputPricePer1m: number | null;
  latencyP50: number;
  throughput: number;
  domainScores: DomainScore[];
  fingerprint: string | null;
  sampleResults: SampleResult[];
}

export interface SampleResult {
  sampleId: string;
  businessModule: string | null;
  answer: string;
  score: number;
  scoreStatus: string;
  responseId: string | null;
  returnedModel: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListModelsPayload {
  models: PageResult<ModelItem>;
}

export interface ListDatasetsPayload {
  datasets: PageResult<DatasetItem>;
}

export interface ListTasksPayload {
  tasks: PageResult<EvalTaskItem>;
}

export const PAGE_SIZE = 16;

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

export interface UpdateModelPayload {
  updateModel: {
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
  deleteTask?: {
    success: boolean;
    message: string;
    status: string;
  };
  deleteModel?: {
    success: boolean;
    message: string;
    status: string;
  };
}


export const userGraphqlApi = {
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


export const evalGraphqlApi = {
  listModels: async (filter?: {
    vendor?: string;
    accessType?: string;
    name?: string;
    series?: string;
    modelName?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ListModelsPayload> => {
    const query = `
      query Models(
        $vendor: String
        $accessType: String
        $name: String
        $series: String
        $modelName: String
        $page: Int
        $pageSize: Int
      ) {
        models(
          vendor: $vendor
          accessType: $accessType
          name: $name
          series: $series
          modelName: $modelName
          page: $page
          pageSize: $pageSize
        ) {
          items {
            id
            name
            vendor
            series
            baseUrl
            apiKeyMasked
            modelName
            accessType
            backend
            paramsB
            contextLength
            inputPricePer1m
            outputPricePer1m
            createdAt
          }
          total
          page
          pageSize
        }
      }
    `;

    return graphqlClient.request<ListModelsPayload>({
      query,
      variables: {
        vendor: filter?.vendor || undefined,
        accessType: filter?.accessType || undefined,
        name: filter?.name || undefined,
        series: filter?.series || undefined,
        modelName: filter?.modelName || undefined,
        page: filter?.page ?? 1,
        pageSize: filter?.pageSize ?? PAGE_SIZE,
      },
    });
  },

  listDatasets: async (opts?: {
    page?: number;
    pageSize?: number;
  }): Promise<ListDatasetsPayload> => {
    const query = `
      query Datasets($page: Int, $pageSize: Int) {
        datasets(page: $page, pageSize: $pageSize) {
          items {
            id
            name
            version
            snapshot
            domain
            sampleCount
            description
          }
          total
          page
          pageSize
        }
      }
    `;

    return graphqlClient.request<ListDatasetsPayload>({
      query,
      variables: {
        page: opts?.page ?? 1,
        pageSize: opts?.pageSize ?? PAGE_SIZE,
      },
    });
  },

  listTasks: async (opts?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ListTasksPayload> => {
    const query = `
      query Tasks($status: String, $page: Int, $pageSize: Int) {
        tasks(status: $status, page: $page, pageSize: $pageSize) {
          items {
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
            errorType
            createdAt
            updatedAt
          }
          total
          page
          pageSize
        }
      }
    `;

    return graphqlClient.request<ListTasksPayload>({
      query,
      variables: {
        status: opts?.status,
        page: opts?.page ?? 1,
        pageSize: opts?.pageSize ?? PAGE_SIZE,
      },
    });
  },

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
          sampleResults {
            sampleId
            businessModule
            answer
            score
            scoreStatus
            responseId
            returnedModel
            promptTokens
            completionTokens
            totalTokens
            latencyMs
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
            accessType
            backend
            compositeScore
            costPerTask
            inputPricePer1m
            outputPricePer1m
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
            baseUrl
            apiKeyMasked
            modelName
            accessType
            backend
            inputPricePer1m
            outputPricePer1m
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

  deleteModel: async (modelId: number): Promise<TaskActionPayload> => {
    const mutation = `
      mutation DeleteModel($modelId: Int!) {
        deleteModel(modelId: $modelId) {
          success
          message
          status
        }
      }
    `;

    return graphqlClient.request<TaskActionPayload>({
      query: mutation,
      variables: { modelId },
    });
  },

  updateModel: async (
    input: UpdateModelInput,
  ): Promise<UpdateModelPayload> => {
    const mutation = `
      mutation UpdateModel($input: UpdateModelInput!) {
        updateModel(input: $input) {
          success
          message
          model {
            id
            name
            vendor
            series
            baseUrl
            apiKeyMasked
            modelName
            accessType
            backend
            inputPricePer1m
            outputPricePer1m
            createdAt
          }
        }
      }
    `;

    return graphqlClient.request<UpdateModelPayload>({
      query: mutation,
      variables: { input },
    });
  },

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

    // GraphQL CreateTaskInput.modelId / datasetIds 均为 Int；表单 value 常为 string
    const modelId = Number(input.modelId);
    const datasetIds = input.datasetIds.map((id) => Number(id));
    if (!Number.isInteger(modelId) || modelId <= 0) {
      throw new Error("modelId must be a positive integer");
    }
    if (datasetIds.length === 0 || datasetIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error("datasetIds must be positive integers");
    }

    return graphqlClient.request<CreateTaskPayload>({
      query: mutation,
      variables: {
        input: {
          ...input,
          modelId,
          datasetIds,
        },
      },
    });
  },

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

  deleteTask: async (taskUid: string): Promise<TaskActionPayload> => {
    const mutation = `
      mutation DeleteTask($taskUid: String!) {
        deleteTask(taskUid: $taskUid) {
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
