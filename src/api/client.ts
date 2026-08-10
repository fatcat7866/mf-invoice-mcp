import { OAuthManager } from '../auth/oauth.js';
import { getOAuthManager } from '../auth/registry.js';
import { getServiceConfig, type ServiceName } from '../config.js';
import { rateLimiter } from './rate-limiter.js';
import type { ApiError } from '../types/index.js';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

export class ApiClient {
  private baseUrl: string;
  private oauthManager: OAuthManager;

  constructor(baseUrl: string, oauthManager: OAuthManager) {
    this.baseUrl = baseUrl;
    this.oauthManager = oauthManager;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    await rateLimiter.waitForSlot();

    const accessToken = await this.oauthManager.getAccessToken();

    const url = new URL(`${this.baseUrl}${endpoint}`);

    // Add query parameters
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limit exceeded - wait and retry
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return this.request<T>(endpoint, options);
      }

      let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json() as ApiError;
        errorMessage = `${errorMessage}: ${errorBody.message || JSON.stringify(errorBody)}`;
      } catch {
        // ignore JSON parse error
      }
      throw new Error(errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    // MF v3 は 200/201 でも空ボディを返すことがある（明細の追加・削除など）。
    // その場合 response.json() は SyntaxError を投げるので、先にテキストで受ける。
    const text = await response.text();
    if (!text.trim()) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  async get<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /**
   * 認証付きでバイナリ（PDF等）を取得する。
   * urlOrEndpoint がフルURL（http〜）ならそのまま、そうでなければ baseUrl に連結する。
   * MF v3 の pdf_url は baseUrl 配下の要認証パスなので Bearer を付けて取得する。
   */
  async getBinary(urlOrEndpoint: string, accept = 'application/pdf'): Promise<Buffer> {
    await rateLimiter.waitForSlot();

    const accessToken = await this.oauthManager.getAccessToken();
    const target = /^https?:\/\//i.test(urlOrEndpoint)
      ? urlOrEndpoint
      : `${this.baseUrl}${urlOrEndpoint}`;

    const response = await fetch(target, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': accept,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return this.getBinary(urlOrEndpoint, accept);
      }
      throw new Error(`Binary request failed: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    await rateLimiter.waitForSlot();

    const accessToken = await this.oauthManager.getAccessToken();
    const url = new URL(`${this.baseUrl}${endpoint}`);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json() as ApiError;
        errorMessage = `${errorMessage}: ${errorBody.message || JSON.stringify(errorBody)}`;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  }
}

// Factory functions for creating service-specific API clients
const clients = new Map<ServiceName, ApiClient>();

export function getApiClient(service: ServiceName): ApiClient {
  let client = clients.get(service);
  if (!client) {
    const config = getServiceConfig(service);
    const oauthManager = getOAuthManager(service);
    client = new ApiClient(config.api.baseUrl, oauthManager);
    clients.set(service, client);
  }
  return client;
}

// Convenience accessors
export function getInvoiceClient(): ApiClient {
  return getApiClient('invoice');
}

export function getExpenseClient(): ApiClient {
  return getApiClient('expense');
}
