# MF MCP 開発ガイド

このファイルはClaude Code向けのプロジェクト固有の指示です。

## プロジェクト概要

MoneyForward クラウド請求書 API v3 + クラウド経費 API を統合したMCPプラグイン。
インボイス制度対応の見積書・請求書の作成自動化、および経費管理を目的としています。

> **注意**: v3 APIでは納品書作成エンドポイントが提供されていません。納品書が必要な場合はマネーフォワードのWebUIで作成してください。

## アーキテクチャ

```
src/
├── index.ts                     # MCPサーバーエントリポイント（全ツール登録）
├── config.ts                    # サービス設定の一元管理
├── auth/
│   ├── oauth.ts                 # OAuth 2.0認証（パラメータ化）
│   └── registry.ts              # サービス名 → OAuthManager マッピング
├── api/
│   ├── client.ts                # 共通APIクライアント（パラメータ化）
│   ├── rate-limiter.ts          # レート制限（共有インスタンス）
│   ├── invoice/                 # 請求書APIモジュール
│   │   ├── partners.ts
│   │   ├── items.ts
│   │   ├── quotes.ts
│   │   ├── billings.ts
│   │   └── delivery.ts
│   └── expense/                 # 経費APIモジュール
│       ├── offices.ts
│       ├── transactions.ts
│       ├── reports.ts
│       ├── receipts.ts
│       └── master.ts
├── tools/
│   ├── invoice/                 # 請求書ツール
│   │   ├── auth.ts
│   │   ├── partners.ts
│   │   ├── items.ts
│   │   ├── quotes.ts
│   │   ├── billings.ts
│   │   └── delivery.ts
│   └── expense/                 # 経費ツール
│       ├── auth.ts
│       ├── offices.ts
│       ├── transactions.ts
│       ├── reports.ts
│       ├── receipts.ts
│       └── master.ts
└── types/
    ├── index.ts                 # 型 re-export
    ├── common.ts                # 共通型（OAuth, Pagination, ApiError）
    └── expense.ts               # 経費API型定義
```

## デュアルAPI設計

### 認証の分離
- 請求書APIと経費APIはそれぞれ別のOAuthクライアントキーを使用
- `auth/registry.ts` がサービス名（'invoice' | 'expense'）でOAuthManagerを遅延生成・キャッシュ
- トークンは別ファイルに保存:
  - 請求書: `~/.config/mf-mcp/invoice-tokens.json`
  - 経費: `~/.config/mf-mcp/expense-tokens.json`
- 旧パス `~/.config/mf-invoice-mcp/tokens.json` からの自動マイグレーション対応

### 環境変数
| 変数 | 用途 | 備考 |
|------|------|------|
| MF_INVOICE_CLIENT_ID | 請求書APIクライアントID | MF_CLIENT_IDでも可（後方互換） |
| MF_INVOICE_CLIENT_SECRET | 請求書APIシークレット | MF_CLIENT_SECRETでも可 |
| MF_EXPENSE_CLIENT_ID | 経費APIクライアントID | |
| MF_EXPENSE_CLIENT_SECRET | 経費APIシークレット | |
| MF_CALLBACK_PORT | OAuthコールバックポート | デフォルト38080、共有 |

## MoneyForward Invoice API v3 仕様

### ベースURL
`https://invoice.moneyforward.com/api/v3/`

### 認証
- OAuth 2.0 Authorization Code Flow
- 認可URL: `https://api.biz.moneyforward.com/authorize`
- トークンURL: `https://api.biz.moneyforward.com/token`
- スコープ: `mfc/invoice/data.read mfc/invoice/data.write`
- リダイレクトURI: `http://localhost:38080/callback`

### インボイス制度対応
- **department_id**: 取引先の部門ID（`/partners/{id}/departments`で取得）
- **excise**: 消費税区分（`ten_percent`, `eight_percent_as_reduced_tax_rate`等）
- 請求書作成は `/invoice_template_billings` エンドポイントを使用

## MoneyForward Expense API 仕様

### ベースURL
`https://expense.moneyforward.com/api/external/v1`

### 認証
- OAuth 2.0 Authorization Code Flow（請求書APIとは別キー）
- スコープ: `mfc/expense/data.read mfc/expense/data.write office.read`

### 主要エンドポイント
| リソース | エンドポイント | メソッド |
|---------|---------------|---------|
| 事業者一覧 | `/offices` | GET |
| 経費明細 | `/offices/{id}/ex_transactions` | GET, POST |
| 経費明細詳細 | `/offices/{id}/ex_transactions/{id}` | GET, PATCH, DELETE |
| 経費申請 | `/offices/{id}/ex_reports` | GET |
| 経費申請詳細 | `/offices/{id}/ex_reports/{id}` | GET |
| 申請承認 | `/offices/{id}/ex_reports/{id}/approve` | POST |
| 申請却下 | `/offices/{id}/ex_reports/{id}/disapprove` | POST |
| レシート | `/offices/{id}/receipts` | POST (multipart) |
| 経費科目 | `/offices/{id}/ex_items` | GET |
| 部門 | `/offices/{id}/depts` | GET |
| プロジェクト | `/offices/{id}/projects` | GET |

## レート制限
- 1秒あたり3リクエストまで（両API共有）
- `src/api/rate-limiter.ts` で自動制御

## 開発時の注意点

### ツール追加時
1. `src/types/` に型定義を追加（invoice系は `index.ts`、expense系は `expense.ts`）
2. `src/api/{service}/` にAPIモジュールを作成
3. `src/tools/{service}/` にMCPツールを作成
4. `src/index.ts` でツールをインポートして `allTools` に追加

### zodスキーマ
- 各ツールの `inputSchema` はzodで定義
- `zod-to-json-schema` でMCP向けJSON Schemaに変換

### テスト方法
1. `npm run build` でビルド
2. 環境変数を設定してClaude Desktopから接続
3. 各ツールを手動で実行して確認

## 既知の制限事項
- **納品書API**: v3 APIでは納品書関連のエンドポイントが提供されていません
- **経費APIレスポンス形状**: 型定義はゆるめに定義。実API呼び出しで検証後に厳格化予定
- **レシートアップロード**: Node 18+のネイティブFormDataを使用
