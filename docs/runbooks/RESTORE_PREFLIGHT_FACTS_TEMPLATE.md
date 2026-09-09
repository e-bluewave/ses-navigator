# Restore Preflight Facts Template

BA-008のDB/Storage復旧を開始する前に、`security:restore-preflight`へ渡すprivate facts JSONの契約を示す。

このfacts JSONは **Secret-free** とする。DB URL、Supabase URL、Project Ref、JWT、API key、backup run ID、bucket名、担当者名、メールアドレス、復旧データ本文を含めない。

## Disposable Local Supabase 推奨モード

Disposable Local SupabaseをDockerで使用する場合は、`security:restore-local-preflight`を優先する。このモードでは次の5項目をDocker/DB実体から自動取得するため、facts JSONへ手入力しなくてよい。

- `environment`
- `productionTarget`
- `separateRestoreEnvironment`
- `targetIdentityVerified`
- `targetDefaultAclNormalized`

ローカルtarget probeはDB URLやpasswordを受け取らず、`docker inspect`と対象Supabase PostgreSQL container内の`psql`だけを使用する。container名にはrestore専用であることを示す4文字以上の安全tokenを含め、そのtoken一致を機械確認する。

### Local用の簡略facts JSON

```json
{
  "version": 1,
  "productionSecretsReused": false,
  "databaseBackupRunLinked": true,
  "storageBackupRunLinked": true,
  "restorePointAlignment": "PASS",
  "migrationBaselineRecorded": true,
  "applicationSchemaBaselineRecorded": true,
  "restoreCommandSingleTransaction": true,
  "restoreCommandOnErrorStop": true,
  "artifactCopyHashParity": "NOT_APPLICABLE",
  "customRoleCount": 0,
  "roleReplayMode": "intentional-skip-empty-custom-set",
  "reservedRoleReplayPlanned": false,
  "storageRestoreViaApiOrS3Planned": true,
  "storageProtectDeleteDisablePlanned": false,
  "falsePassGuardReady": true,
  "secretFreeFacts": true
}
```

実行例:

```powershell
& {
  $ErrorActionPreference = 'Stop'

  npx.cmd pnpm@10.15.0 security:restore-local-preflight -- `
    --facts  'C:\private-evidence\restore-preflight.json' `
    --roles  'C:\private-evidence\roles.sql' `
    --schema 'C:\private-evidence\schema.sql' `
    --data   'C:\private-evidence\data.sql' `
    --repo   'D:\path\to\ses-navigator' `
    --environment 'Disposable' `
    --container '<disposable-local-supabase-db-container>' `
    --required-name-token 'restore-drill'

  if ($LASTEXITCODE -ne 0) {
    throw "Local restore preflight failed"
  }
}
```

成功時のstatusは`RESTORE_LOCAL_PREFLIGHT_PASSED`。target probeだけを単独実行した場合は`RESTORE_TARGET_PROBE_PASSED`となる。FAIL時はrestoreを開始しない。

## 汎用facts JSON template

Staging等でlocal Docker target probeを使用しない場合は、従来どおりtarget確認結果もfactsへ含める。

```json
{
  "version": 1,
  "environment": "Disposable",
  "productionTarget": false,
  "separateRestoreEnvironment": true,
  "targetIdentityVerified": true,
  "productionSecretsReused": false,
  "databaseBackupRunLinked": true,
  "storageBackupRunLinked": true,
  "restorePointAlignment": "PASS",
  "targetDefaultAclNormalized": true,
  "migrationBaselineRecorded": true,
  "applicationSchemaBaselineRecorded": true,
  "restoreCommandSingleTransaction": true,
  "restoreCommandOnErrorStop": true,
  "artifactCopyHashParity": "NOT_APPLICABLE",
  "customRoleCount": 0,
  "roleReplayMode": "intentional-skip-empty-custom-set",
  "reservedRoleReplayPlanned": false,
  "storageRestoreViaApiOrS3Planned": true,
  "storageProtectDeleteDisablePlanned": false,
  "falsePassGuardReady": true,
  "secretFreeFacts": true
}
```

`environment`は`Disposable`または`Staging`のみ許可する。Productionを指定するとpreflightはFAILする。

`artifactCopyHashParity`は、SQLをcontainer等へコピーした場合は`PASS`、コピーしていない場合だけ`NOT_APPLICABLE`とする。

`customRoleCount`が0の場合、`roleReplayMode`は`intentional-skip-empty-custom-set`とする。1件以上の場合は`custom-only`とし、Supabase管理reserved roleをreplayしない。

## 汎用実行例

PowerShellでは1ブロックで実行し、途中失敗後に後続PASS処理を継続させない。

```powershell
& {
  $ErrorActionPreference = 'Stop'

  npx.cmd pnpm@10.15.0 security:restore-preflight -- `
    --facts  'C:\private-evidence\restore-preflight.json' `
    --roles  'C:\private-evidence\roles.sql' `
    --schema 'C:\private-evidence\schema.sql' `
    --data   'C:\private-evidence\data.sql' `
    --repo   'D:\path\to\ses-navigator'

  if ($LASTEXITCODE -ne 0) {
    throw "Restore preflight failed"
  }
}
```

成功時のstatusは`RESTORE_PREFLIGHT_PASSED`。FAIL時はrestoreを開始しない。

## 自動検査される項目

- facts JSON / roles.sql / schema.sql / data.sqlのstrict UTF-8とBOM禁止
- Production target禁止、別restore環境、target identity確認
- Disposable Local SupabaseではDocker container実体、Supabase PostgreSQL image、安全token一致をmachine probe
- Disposable Local Supabaseでは`pg_default_acl`を直接読み、`PUBLIC` / `anon` / `authenticated` / `service_role`への危険なdefault ACLが0件であることをmachine probe
- Production Secret再利用禁止
- BA-006 / BA-007 linkageとrestore point alignment
- default ACL正規化済み
- migration / Application schema baseline記録済み
- single transaction / `ON_ERROR_STOP`使用予定
- Storage restoreをAPI/S3互換経路で行うこと
- `storage.protect_delete`を無効化しないこと
- roles.sqlからcustom/reserved role数を分類し、factsのcustom role数と一致確認
- schema/data SQLにStorage管理schema/metadata参照が混入していないこと
- `pnpm-lock.yaml`、TypeScript binary、package manager pinの依存関係readiness
- false PASS防止準備

出力はboolean/count/findingsだけとし、container名、role名、SQL本文、ファイルpath、Secret値を表示しない。
