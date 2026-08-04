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
| 3 | `03_validation.ps1` | anon・User A・User Bで6 Viewを実HTTP検証 |
| 4 | `04_service_role_rpc_validation.ps1` | service_roleのView拒否後に限定RPCを検証 |
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
