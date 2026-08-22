# SES Navigator Data API検証手順

対象：

- Repository：`e-bluewave/ses-navigator`
- Branch：`ddl-initial`
- Supabase Project Ref：`zsgauwmkvvezdxvmcmdf`
- 前提：`02_setup.sql`が`READY_FOR_VALIDATION`で完了済み

## 採用方式

推奨する`pnpm security:data-api`、または従来の`03_validation.ps1`から、実際のSupabase Data APIへ読み取りリクエストを送る。

SQL EditorでJWTクレームを模擬する方式では確認できない、次の境界を一度に
検証するためである。

- API Gatewayの認証
- `anon`／`authenticated`のGRANT
- JWTのユーザー識別
- `SECURITY INVOKER`
- 基表の強制RLS
- Tenant境界
- 5権限の有無
- Viewの返却列

## 検証対象

次の6 Viewを、`anon`、User A、User Bの3主体で検証する。

1. `engineer_private_summaries`
2. `contract_summaries`
3. `finance_invoice_summaries`
4. `finance_expense_summaries`
5. `ai_execution_summaries`
6. `audit_event_summaries`

合計18チェックとなる。

| 主体 | 期待HTTP | 期待件数 | 意味 |
|---|---:|---:|---|
| anon | 401 | なし | Viewへの匿名アクセス拒否 |
| User A | 200 | 各1件 | Tenant A所属＋5権限で閲覧可 |
| User B | 200 | 各0件 | 同一Tenant所属でも権限なしなら非表示 |

User Aについては、件数だけでなく次も検証する。

- 取得した固定IDがTenant Aのリソースである
- Tenant Bの固定IDが含まれない
- 返却列がMigration 114のView定義と完全一致する

## 事前準備

次を準備する。

- SupabaseのPublishable key、またはLegacy anon key
- User AとUser Bのログイン情報

Publishable key／Legacy anon keyはSupabase DashboardのProject Settings
にあるAPI Keysから確認する。

User AとUser BのJWTを既に取得している場合、パスワードの代わりにJWT入力
モードを使用できる。

以下はチャットへ貼らない。

- メールアドレス
- パスワード
- JWT
- Publishable key／Legacy anon key
- Secret key／service_role key

## Windowsでの実行

リポジトリのルートで、必要な環境変数を現在のプロセスへ設定した後に次を実行する方法を推奨する。変数名は`DATA_API_TEST_README.md`を参照する。

```powershell
pnpm security:data-api
```

従来の対話入力方式が必要な場合は、次のPowerShell版も利用できる。

1. `03_validation.ps1`をWindows上の任意のフォルダへ保存する。
2. PowerShellを開く。
3. ファイルを保存したフォルダへ移動する。
4. 次を実行する。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\03_validation.ps1
```

5. Publishable key、またはLegacy anon keyを入力する。
6. 認証方式を入力する。

```text
password
```

パスワード認証を使用できない場合だけ、次を選ぶ。

```text
jwt
```

7. 画面の指示に従い、User AとUser Bの情報を入力する。

キー、パスワード、JWTは伏せ字入力となり、コンソール結果には出力されない。

## 合格条件

最終JSONが次を満たせばView検証は合格。

```json
{
  "status": "VALIDATION_PASSED",
  "total_checks": 18,
  "passed": 18,
  "failed": 0
}
```

さらに`by_actor`が次の状態になる。

```json
{
  "anon": {
    "passed": 6,
    "total": 6
  },
  "user_a": {
    "passed": 6,
    "total": 6
  },
  "user_b": {
    "passed": 6,
    "total": 6
  }
}
```

## 結果の共有

PowerShellが最後に出力したJSON全体をコピーしてチャットへ貼る。

出力には次だけが含まれる。

- 判定
- HTTPステータス
- 件数
- Tenant境界の成否
- 返却列の成否

レスポンス本文、ユーザーID、メール、パスワード、JWT、APIキーは出力しない。

## 失敗時

`VALIDATION_FAILED`の場合は、セットアップデータを削除せず、JSONの
`failures`と`checks`を共有する。

この段階では次を行わない。

- Migrationの変更
- RPC検証
- `service_role`検証
- User Bの削除
- 検証データの削除

## 読み取り専用の範囲

`03_validation.ps1`がData APIへ送る業務データ要求は`GET`のみである。
AuthのpasswordモードではJWT取得のために`POST /auth/v1/token`を使用するが、
ユーザーや業務データの作成・更新・削除は行わない。
