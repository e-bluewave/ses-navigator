# 15 フロントエンド・API初期構成

## 1. 決定

SESNはTypeScriptモノレポとして開始する。Web UIはReact、業務APIはNode.js、認証・DB・StorageはSupabaseを利用する。

## 2. 採用構成

|対象|採用|
|---|---|
|パッケージ管理|pnpm workspace|
|Web|React + TypeScript + Vite|
|ルーティング|React Router|
|サーバー状態|TanStack Query|
|フォーム|React Hook Form + Zod|
|API|Node.js + TypeScript + Fastify|
|API契約|OpenAPI 3.1を正本として型・クライアント生成|
|DB/Auth/Storage|Supabase|
|単体・結合テスト|Vitest|
|ブラウザE2E|Playwright|
|静的解析|ESLint + Prettier + TypeScript strict|

## 3. ディレクトリ

```text
apps/
  web/
    src/
      app/
      features/
      pages/
      shared/
  api/
    src/
      app/
      modules/
      plugins/
      shared/
packages/
  api-contract/
  api-client/
  shared-types/
  ui/
  config/
openapi/
  sesn.v1.yaml
supabase/
  migrations/
  tests/
```

`features`と`modules`は`engineers`、`projects`、`proposals`等の業務領域単位に揃える。DBテーブル単位の画面・API分割は避ける。

## 4. API境界

- ブラウザはSupabase Authを利用してログインする。
- 一般参照・単純CRUDでも、公開範囲はGRANT・限定View/RPC・RLSで制限する。
- 複数テーブル更新、状態遷移、Service Role、AI、外部連携、秘密情報を扱う処理はNode APIを経由する。
- Service RoleキーをWebへ渡さない。
- テナントIDはJWTとサーバー側コンテキストから確定し、リクエスト本文を信頼しない。
- APIのDBアクセスは機能別Repositoryに閉じ込め、画面からSQLやテーブル構造へ直接依存させない。

## 5. 共通API処理

APIは次の順で処理する。

1. Request ID付与
2. JWT検証
3. テナント・ユーザーコンテキスト確定
4. Zod入力検証
5. 権限・業務ルール検証
6. Use Case実行
7. 監査・Outbox記録
8. OpenAPI準拠レスポンス

更新APIは`If-Match`を`row_version`へ変換して検証し、成功時に新しい`ETag`を返す。

## 6. 最初の実装スライス

共通基盤を検証しやすく、機密情報・財務処理より影響が限定される「案件一覧・案件詳細（参照のみ）」から開始する。

実装範囲:

- WebのApp Shell、ログイン後ルート、エラー境界
- APIのhealth、認証プラグイン、エラー形式、Request ID
- `GET /api/v1/projects`
- `GET /api/v1/projects/{id}`
- OpenAPI定義、生成クライアント、契約テスト
- RLSを含む正常系・他テナント非開示・未認証のテスト

更新、AIマッチング、ファイル、契約・財務はこのスライスに含めない。

## 7. 完了条件

- `pnpm install`, lint, typecheck, testがルートから実行できる。
- WebとAPIがローカルで起動する。
- APIレスポンスと生成クライアントがOpenAPIに一致する。
- 未認証は`401`、権限不足は`403`、他テナントの非開示対象は`404`となる。
- 秘密情報がWeb成果物とログへ含まれない。
- CIでlint、typecheck、unit、contractを実行できる。

## 8. 更新履歴

|日付|内容|
|---|---|
|2026-08-08|React・Node.js・Supabaseを前提とする初期構成を確定|
