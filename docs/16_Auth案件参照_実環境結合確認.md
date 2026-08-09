# Auth・案件参照 実環境結合確認

## 目的

Supabase Authで取得した利用者のAccess TokenをAPIへBearer Tokenとして渡し、`project.read`権限とRLSを維持したまま案件一覧を取得できることを確認する。

## 前提

- 検証専用の架空ユーザーを使用する。
- 対象ユーザーに有効なテナント所属と`project.read`権限を付与する。
- APIとSupabaseは同じ環境を参照する。
- Service Role Key、Secret Key、Access Tokenをファイルやコマンド履歴へ保存しない。

## 実行（PowerShell）

リポジトリ直下で、現在のPowerShellプロセスだけに値を設定する。

```powershell
$env:SESN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SESN_SUPABASE_PUBLISHABLE_KEY = "<publishable-or-anon-key>"
$env:SESN_TEST_EMAIL = "<test-user-email>"
$env:SESN_TEST_PASSWORD = "<test-user-password>"
$env:SESN_API_URL = "https://<deployed-api-host>"

pnpm smoke:auth-project
```

終了後に値を破棄する。

```powershell
Remove-Item Env:SESN_SUPABASE_URL
Remove-Item Env:SESN_SUPABASE_PUBLISHABLE_KEY
Remove-Item Env:SESN_TEST_EMAIL
Remove-Item Env:SESN_TEST_PASSWORD
Remove-Item Env:SESN_API_URL
```

## 合格条件

- Supabase Authログインが成功する。
- `/api/v1/projects?limit=1`がHTTP 200を返す。
- レスポンスに`items`配列がある（0件でも合格）。
- ログアウト要求まで完了する。
- 出力にパスワード、Publishable Key、Access Token、Refresh Tokenが含まれない。

HTTP 401は認証・Token転送、403は`project.read`、404/5xxはAPIの配置先・環境設定を優先して確認する。
