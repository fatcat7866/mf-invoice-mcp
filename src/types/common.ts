// 共通型定義（複数サービスで共有）

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
  scope: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Pagination {
  total_count: number;
  total_pages: number;
  current_page: number;
  per_page: number;
}

export interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface ApiError {
  code: string;
  message: string;
  errors?: Record<string, string[]>;
}
