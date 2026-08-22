# SES Navigator service_role・限定RPC検証手順

対象：

- Repository：`e-bluewave/ses-navigator`
- Branch：`ddl-initial`
- Supabase Project Ref：`zsgauwmkvvezdxvmcmdf`
- 前提：`pnpm security:data-api`または`03_validation.ps1`が18件すべて合格済み
- 対象RPC：`public.service_get_sensitive_record(uuid,text,uuid)`

## 検証順序

推奨する`pnpm security:service-rpc`と従来の`04_service_role_rpc_validation.ps1`は、次の順序を固定する。

1. `service_role`による利用者向け6 Viewの拒否
2. 上記6件がすべて合格した場合だけ限定RPCを検証

View拒否が1件でも不合格なら、RPC検証は開始しない。

## 検証内容

### service_roleのView拒否

次の6 Viewを`service_role`で読み取り、すべてHTTP 403になることを確認する。

1. `engineer_private_summaries`
2. `contract_summaries`
3. `finance_invoice_summaries`
4. `finance_expense_summaries`
5. `ai_execution_summaries`
6. `audit_event_summaries`

HTTP 401は合格にしない。401はキーの誤りでも発生するため、GRANTによる拒否を
証明できないからである。

### 限定RPC

| 主体・条件 | 件数 | 期待結果 |
|---|---:|---|
| anon | 1 | HTTP 401 |
| authenticated（User A） | 1 | HTTP 403 |
| service_role・Tenant A正常取得 | 5 | HTTP 200 |
| service_role・存在しない対象 | 1 | HTTP 404 |
| service_role・Tenant A指定＋Tenant BのID | 5 | HTTP 404 |

正常取得は次の5リソース種別を対象とする。

- `engineer_private`
- `contract`
- `invoice`
- `ai_execution`
- `audit_event`

HTTP 200だけでなく、次も検証する。

- 返却プロパティがMigration 116の定義と完全一致する
- `tenant_id`がTenant Aである
- リソースIDがTenant Aの固定IDである
- 監査JSONに元のメール、token、API keyが残っていない
- レスポンス本文を結果JSONへ含めない

## 必要な情報

- Publishable key、またはLegacy anon key
- Secret key（`sb_secret_...`）、またはLegacy service_role key
- User Aのログイン情報、またはUser AのJWT

Supabase Dashboardの`Settings > API Keys`から確認する。

Secret key／service_role keyは次の場所へ残さない。

- チャット
- GitHub
- PowerShell履歴
- スクリプトファイル
- URLやクエリパラメータ

スクリプトはキーを伏せ字で対話入力し、プロセス終了時に参照を破棄する。

## Windowsでの実行

リポジトリのルートで、必要な環境変数を現在のプロセスへ設定した後に次を実行する方法を推奨する。変数名は`DATA_API_TEST_README.md`を参照する。

```powershell
pnpm security:service-rpc
```

従来の伏せ字対話入力方式が必要な場合は次のPowerShell版を利用する。

1. `04_service_role_rpc_validation.ps1`をWindowsへ保存する。
2. PowerShellを開く。
3. ファイルを保存したフォルダへ移動する。
4. 次を実行する。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\04_service_role_rpc_validation.ps1
```

5. 画面の指示に従い、キーとUser Aの認証情報を入力する。

通常は認証方式として次を入力する。

```text
password
```

既存JWTを使う場合だけ次を入力する。

```text
jwt
```

## 合格条件

最終JSONが次を満たせば合格。

```json
{
  "status": "SERVICE_ROLE_AND_RPC_VALIDATION_PASSED",
  "database_changes": false,
  "response_bodies_exposed": false,
  "service_role_view_denial_tested": true,
  "service_role_view_denial_passed": true,
  "rpc_tested": true,
  "rpc_passed": true,
  "total_checks": 19,
  "passed": 19,
  "failed": 0
}
```

## 結果の共有

PowerShellが最後に出力したJSON全体をチャットへ貼る。

出力には次を含めない。

- Secret key／service_role key
- Publishable key／anon key
- JWT
- メールアドレス
- パスワード
- RPCのレスポンス本文

## 失敗時

次のどちらかの場合は、検証データを削除せず結果JSONを共有する。

- `SERVICE_ROLE_VIEW_DENIAL_FAILED`
- `LIMITED_RPC_VALIDATION_FAILED`

この段階ではMigrationを変更しない。原因を113～117の実定義、HTTP状態、
GRANT、RPC引数、固定IDの順に切り分ける。

## データ変更

View要求はGET、RPC要求はPOSTだが、対象RPCは`STABLE`な読み取り専用関数である。
スクリプトはユーザーや業務データを作成・更新・削除しない。
