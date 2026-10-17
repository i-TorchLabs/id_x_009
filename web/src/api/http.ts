
import { API_BASE_URL } from "@/utils/config";

interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
}

interface PostConfig extends RequestConfig {
  body?: any;
}

class HttpClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }
    return url.toString();
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

  async get<T = any>(endpoint: string, config?: RequestConfig): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);
    const response = await fetch(url, {
      method: "GET",
      headers: { ...this.getDefaultHeaders(), ...config?.headers },
    });

    return this.handleResponse<T>(response);
  }

  async post<T = any>(endpoint: string, config?: PostConfig): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);
    const response = await fetch(url, {
      method: "POST",
      headers: { ...this.getDefaultHeaders(), ...config?.headers },
      body: JSON.stringify(config?.body),
    });

    return this.handleResponse<T>(response);
  }

  async put<T = any>(endpoint: string, config?: PostConfig): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);
    const response = await fetch(url, {
      method: "PUT",
      headers: { ...this.getDefaultHeaders(), ...config?.headers },
      body: JSON.stringify(config?.body),
    });

    return this.handleResponse<T>(response);
  }

  async delete<T = any>(endpoint: string, config?: RequestConfig): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);
    const response = await fetch(url, {
      method: "DELETE",
      headers: { ...this.getDefaultHeaders(), ...config?.headers },
    });

    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "请求失败" }));
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
}

export const http = new HttpClient();

export { HttpClient };
