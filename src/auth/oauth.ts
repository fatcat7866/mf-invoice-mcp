import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import type { OAuthTokens } from '../types/index.js';
import type { ServiceConfig } from '../config.js';
import { LEGACY_TOKENS_FILE } from '../config.js';

const DEFAULT_PORT = 38080;
const OOB_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

export class OAuthManager {
  private config: ServiceConfig;
  private tokens: OAuthTokens | null = null;
  private server: http.Server | null = null;
  private port: number;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.port = parseInt(process.env.MF_CALLBACK_PORT || String(DEFAULT_PORT), 10);
    this.migrateTokens();
    this.loadTokens();
  }

  /** Migrate tokens from legacy path to new path (invoice only) */
  private migrateTokens(): void {
    if (this.config.name !== 'invoice') return;
    const newPath = this.config.storage.tokensFile;
    if (fs.existsSync(newPath)) return;
    if (!fs.existsSync(LEGACY_TOKENS_FILE)) return;

    try {
      this.ensureConfigDir();
      fs.copyFileSync(LEGACY_TOKENS_FILE, newPath);
    } catch {
      // Migration is best-effort
    }
  }

  private ensureConfigDir(): void {
    const dir = path.dirname(this.config.storage.tokensFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadTokens(): void {
    try {
      const tokensFile = this.config.storage.tokensFile;
      if (fs.existsSync(tokensFile)) {
        const data = fs.readFileSync(tokensFile, 'utf-8');
        this.tokens = JSON.parse(data);
      }
    } catch {
      this.tokens = null;
    }
  }

  private saveTokens(tokens: OAuthTokens): void {
    this.ensureConfigDir();
    // Add expiration timestamp
    tokens.expires_at = Date.now() + tokens.expires_in * 1000;
    this.tokens = tokens;
    fs.writeFileSync(this.config.storage.tokensFile, JSON.stringify(tokens, null, 2));
  }

  private isOobMode(): boolean {
    return !process.env.MF_REDIRECT_URI || process.env.MF_REDIRECT_URI === OOB_REDIRECT_URI;
  }

  getRedirectUri(): string {
    if (this.isOobMode()) {
      return OOB_REDIRECT_URI;
    }
    return process.env.MF_REDIRECT_URI || `http://localhost:${this.port}/callback`;
  }

  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.oauth.clientId,
      redirect_uri: this.getRedirectUri(),
      scope: this.config.oauth.scopes,
    });
    return `${this.config.oauth.authorizeUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch(this.config.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.oauth.clientId,
        client_secret: this.config.oauth.clientSecret,
        redirect_uri: this.getRedirectUri(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens = await response.json() as OAuthTokens;
    this.saveTokens(tokens);
    return tokens;
  }

  async refreshToken(): Promise<OAuthTokens> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available. Please re-authenticate.');
    }

    const response = await fetch(this.config.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refresh_token,
        client_id: this.config.oauth.clientId,
        client_secret: this.config.oauth.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens = await response.json() as OAuthTokens;
    this.saveTokens(tokens);
    return tokens;
  }

  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error(`Not authenticated. Please run mf_${this.config.name === 'invoice' ? '' : 'expense_'}auth_start first.`);
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = this.tokens.expires_at || 0;
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      await this.refreshToken();
    }

    return this.tokens.access_token;
  }

  isAuthenticated(): boolean {
    return this.tokens !== null;
  }

  getAuthStatus(): { authenticated: boolean; expiresAt?: number } {
    if (!this.tokens) {
      return { authenticated: false };
    }
    return {
      authenticated: true,
      expiresAt: this.tokens.expires_at,
    };
  }

  clearTokens(): void {
    this.tokens = null;
    const tokensFile = this.config.storage.tokensFile;
    if (fs.existsSync(tokensFile)) {
      fs.unlinkSync(tokensFile);
    }
  }

  getServiceName(): string {
    return this.config.name;
  }

  /**
   * OOBモード: 認証URLを返すのみ。ユーザーがブラウザで認可後、
   * 画面に表示されるコードを mf_auth_callback で入力する。
   */
  startOobFlow(): { authUrl: string } {
    return { authUrl: this.getAuthorizationUrl() };
  }

  /**
   * ローカルサーバーモード: コールバックサーバーを起動して自動でコードを受け取る。
   * MF_REDIRECT_URI=http://localhost:38080/callback の場合に使用。
   */
  async startCallbackServerFlow(): Promise<{ authUrl: string; tokenPromise: Promise<OAuthTokens> }> {
    // Stop existing server if running
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    const authUrl = this.getAuthorizationUrl();

    const tokenPromise = new Promise<OAuthTokens>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.server) {
          this.server.close();
          this.server = null;
        }
        reject(new Error('認証がタイムアウトしました（5分）'));
      }, 5 * 60 * 1000);

      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '', `http://localhost:${this.port}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<html><body><h1>認証エラー</h1><p>${error}</p></body></html>`);
            clearTimeout(timeoutId);
            this.server?.close();
            this.server = null;
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (code) {
            try {
              const tokens = await this.exchangeCode(code);
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`<html><body><h1>認証成功</h1><p>このウィンドウを閉じてください。</p></body></html>`);
              clearTimeout(timeoutId);
              this.server?.close();
              this.server = null;
              resolve(tokens);
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`<html><body><h1>トークン取得エラー</h1><p>${err instanceof Error ? err.message : String(err)}</p></body></html>`);
              clearTimeout(timeoutId);
              this.server?.close();
              this.server = null;
              reject(err);
            }
            return;
          }

          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>エラー</h1><p>認証コードがありません</p></body></html>`);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      this.server.listen(this.port, () => {
        // Server started
      });

      this.server.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(new Error(`サーバー起動エラー: ${err.message}`));
      });
    });

    return { authUrl, tokenPromise };
  }

  stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
