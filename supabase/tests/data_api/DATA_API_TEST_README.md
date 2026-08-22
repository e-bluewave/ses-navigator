# SES Navigator Data API実機検証

対象：

- Repository：`e-bluewave/ses-navigator`
- Branch：`ddl-initial`
- PostgreSQL：16
- Supabase Migration：001～119

## 実行順

| 順序 | ファイル | 目的 |
|---:|---|---|
| 1 | `01_precheck.sql` | 既存環境・権限・衝突の読み取り専用確認 |
| 2 | `02_setup.sql` | 固定IDの検証データを単一トランザクションで作成 |
| 3 | `pnpm security:data-api`（推奨）または`03_validation.ps1` | anon・User A・User Bで6 Viewを実HTTP検証 |
| 4 | `pnpm security:service-rpc`（推奨）または`04_service_role_rpc_validation.ps1` | service_roleのView拒否後に限定RPCを検証 |
| 5 | `05_cleanup.sql` | 固定IDの検証データと検証専用User Bを原子的に削除 |

各PowerShellスクリプトの詳細は、同じディレクトリの手順書を参照する。

- `03_Data_API_validation_guide.md`
- `04_Service_role_RPC_validation_guide.md`
- `DATA_API_VALIDATION_REPORT.md`

## 秘密情報

次をファイル、GitHub、チャットへ保存しない。

- メールアドレス
- パスワード
- JWT
- Publishable key／Legacy anon key
- Secret key／Legacy service_role key

PowerShellスクリプトは秘密情報を伏せ字で対話入力し、結果JSONへ含めない。
Node版は秘密情報を環境変数からのみ受け取り、結果JSONへ含めない。環境変数をファイル、GitHub、チャットへ保存しない。

## Node版の実行

`02_setup.sql`が`READY_FOR_VALIDATION`になった検証環境で、次の環境変数を現在プロセスへ設定して実行する。

- `SESN_SUPABASE_URL`
- `SESN_SUPABASE_PUBLISHABLE_KEY`
- `SESN_TEST_USER_A_EMAIL`
- `SESN_TEST_USER_A_PASSWORD`
- `SESN_TEST_USER_B_EMAIL`
- `SESN_TEST_USER_B_PASSWORD`

Service Role・限定RPC検証では、上記のURL・Publishable key・User A情報に加えて次を設定する。

- `SESN_SUPABASE_SECRET_KEY`

```text
pnpm security:data-api
pnpm security:service-rpc
```

合格時はそれぞれ`VALIDATION_PASSED`、18/18と`SERVICE_ROLE_AND_RPC_VALIDATION_PASSED`、19/19を出力する。実環境の認証情報を使わない判定ロジックの自動テストは`pnpm security:data-api:check`と`pnpm security:service-rpc:check`で実行する。

## 公開スキーマ設定の確認

ローカルとCIでは次を実行し、`supabase/config.toml`の公開範囲を検証する。

```text
pnpm security:supabase-config
```

DashboardのExposed schemasを確認した場合は、その値をカンマ区切りで`SESN_REMOTE_EXPOSED_SCHEMAS`へ設定して同じコマンドを実行する。期待値は`public,graphql_public`であり、秘密情報は含まれない。未指定時はローカル設定だけを検証し、結果の`remoteChecked`は`false`になる。

## 書込み公開面の確認

Migration全体から現在の直接書込みGRANTを再構成し、レビュー済み一覧との差分を確認する。

```text
pnpm security:data-api-writes
```

この検査はDB接続や秘密情報を必要としない。新しい直接書込み、既存許可の削除、anonへの書込み、Service Roleの`public`リレーション書込みを検出した場合は失敗する。業務状態変更や機密書込みは、引き続き限定RPCを使用する。

## 現在の検証状態

- `01_precheck.sql`：`READY`
- `02_setup.sql`：`READY_FOR_VALIDATION`
- `03_validation.ps1`：18/18 PASS
- `04_service_role_rpc_validation.ps1`：19/19 PASS
- Data API総合検証：37/37 PASS
- `05_cleanup.sql`：`CLEANUP_PASSED`（検証データ残存0件）
- Migration 118・119 SQL回帰確認：3/3 PASS
- Migration 118・119適用後の6 View簡易回帰確認：6/6 PASS

検証データの後片付けおよびMigration 118・119適用後の回帰確認まで完了している。
